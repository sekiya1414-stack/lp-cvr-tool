/**
 * lp-cvr-tool フェーズ2 バックエンド(Cloudflare Workers)
 *
 * - GET  /assign : 訪問者にvariantを振り分け、Cookie保存の上で静的LPへ302リダイレクト
 * - POST /track  : クリック/CVイベントをD1に記録
 * - GET  /stats  : D1の記録からベイズ的にvariantごとの勝率・勝者を判定
 * - POST /generate-image : ヒーロー画像の候補生成(Workers AI)。ビルド時にローカルから
 *   叩いて候補を保存し、選んだものをtemplates/hero差し替えに使う運用(訪問者には配信しない)
 */

import { PROJECT_VARIANTS } from "./constants";
import { computeStats, type VariantCounts } from "./stats";

export interface Env {
  DB: D1Database;
  AI: Ai;
  GENERATE_IMAGE_SECRET: string;
}

const STATIC_SITE_BASE = "https://sekiya1414-stack.github.io/lp-cvr-tool";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90日、勝ちパターン検証中は同一variantを見続けてもらう

function cookieNameFor(project: string): string {
  return `lp_variant_${project}`;
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function pickVariant(variants: string[]): string {
  return variants[Math.floor(Math.random() * variants.length)];
}

async function logEvent(
  env: Env,
  fields: { project: string; variant: string; eventType: string; meta?: string }
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO events (project, variant, event_type, meta, created_at) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(fields.project, fields.variant, fields.eventType, fields.meta ?? null, new Date().toISOString())
    .run();
}

function corsHeaders(origin: string | null): HeadersInit {
  // 静的LPはGitHub Pages(別オリジン)から叩くため、track-eventはCORSを許可する
  const allowedOrigin = origin && origin.endsWith(".github.io") ? origin : STATIC_SITE_BASE;
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function handleAssign(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const project = url.searchParams.get("project") ?? "project-a";
  const variants = PROJECT_VARIANTS[project];

  if (!variants) {
    return new Response(`unknown project: ${project}`, { status: 404 });
  }

  const cookies = parseCookies(request.headers.get("Cookie"));
  const cookieName = cookieNameFor(project);
  const existing = cookies[cookieName];
  const variant = existing && variants.includes(existing) ? existing : pickVariant(variants);

  // 元URLのUTM等のクエリパラメータは維持しつつ、ルーティング用のprojectだけ除去して転送する
  url.searchParams.delete("project");
  const redirectUrl = `${STATIC_SITE_BASE}/lp/${project}/${variant}/${url.search}`;

  const headers = new Headers({ Location: redirectUrl });
  if (!existing) {
    headers.append(
      "Set-Cookie",
      `${cookieName}=${variant}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; Secure; SameSite=Lax`
    );
  }

  return new Response(null, { status: 302, headers });
}

async function handleTrack(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(origin) });
  }

  let body: { project?: string; variant?: string; eventType?: string; meta?: string };
  try {
    body = await request.json();
  } catch {
    return new Response("invalid JSON body", { status: 400, headers: corsHeaders(origin) });
  }

  const { project, variant, eventType, meta } = body;
  if (!project || !variant || !eventType) {
    return new Response("project, variant, eventType は必須です", {
      status: 400,
      headers: corsHeaders(origin),
    });
  }

  await logEvent(env, { project, variant, eventType, meta });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

async function handleStats(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const project = url.searchParams.get("project") ?? "project-a";
  const variants = PROJECT_VARIANTS[project];

  if (!variants) {
    return new Response(`unknown project: ${project}`, { status: 404 });
  }

  const { results } = await env.DB.prepare(
    "SELECT variant, event_type, COUNT(*) as c FROM events WHERE project = ? GROUP BY variant, event_type"
  )
    .bind(project)
    .all<{ variant: string; event_type: string; c: number }>();

  const counts: VariantCounts[] = variants.map((variant) => {
    const views = results.find((r) => r.variant === variant && r.event_type === "view")?.c ?? 0;
    const cv = results.find((r) => r.variant === variant && r.event_type === "cv")?.c ?? 0;
    return { variant, views, cv };
  });

  const stats = computeStats(counts);

  return new Response(JSON.stringify({ project, ...stats }, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

async function handleGenerateImage(request: Request, env: Env): Promise<Response> {
  const providedSecret = request.headers.get("X-Generate-Secret");
  if (!env.GENERATE_IMAGE_SECRET || providedSecret !== env.GENERATE_IMAGE_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: { prompt?: string };
  try {
    body = await request.json();
  } catch {
    return new Response("invalid JSON body", { status: 400 });
  }
  if (!body.prompt) {
    return new Response("prompt は必須です", { status: 400 });
  }

  const result = await env.AI.run(IMAGE_MODEL, { prompt: body.prompt });

  // flux-1-schnellはbase64エンコードされた画像を{ image: string }で返す。
  // ドキュメント上はPNG表記だが実機確認では実際のバイト列はJPEGだったため、
  // Content-Typeは実バイト列に合わせてimage/jpegとする
  const base64 = (result as { image: string }).image;
  const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  return new Response(binary, {
    status: 200,
    headers: { "Content-Type": "image/jpeg" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/assign" && request.method === "GET") {
      return handleAssign(request);
    }
    if (url.pathname === "/track" && (request.method === "POST" || request.method === "OPTIONS")) {
      return handleTrack(request, env);
    }
    if (url.pathname === "/stats" && request.method === "GET") {
      return handleStats(request, env);
    }
    if (url.pathname === "/generate-image" && request.method === "POST") {
      return handleGenerateImage(request, env);
    }

    return new Response("not found", { status: 404 });
  },
};
