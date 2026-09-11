/**
 * lp-cvr-tool フェーズ2 バックエンド(Cloudflare Workers)
 *
 * - GET  /assign : 訪問者にvariantを振り分け、Cookie保存の上で静的LPへ302リダイレクト
 * - POST /track  : クリック/CVイベントを記録(D1未接続の間はログ出力のみ)
 */

export interface Env {
  // wrangler.toml の [[d1_databases]] で bindingName を "DB" にすると使えるようになる。
  // D1採用が確定するまでは未バインドのため、コード側はDBの有無を都度チェックする。
  DB?: D1Database;
}

const PROJECT_VARIANTS: Record<string, string[]> = {
  "project-a": ["variant-1", "variant-2", "variant-3"],
};

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

// D1未バインドの間はconsole出力のみ、接続後はeventsテーブルへ書き込む(スキーマは別途 analysis/schema.sql で定義予定)
async function logEvent(
  env: Env,
  fields: { project: string; variant: string; eventType: string; meta?: string }
): Promise<void> {
  if (!env.DB) {
    console.log("[track-event:no-db]", JSON.stringify(fields));
    return;
  }
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/assign" && request.method === "GET") {
      return handleAssign(request);
    }
    if (url.pathname === "/track" && (request.method === "POST" || request.method === "OPTIONS")) {
      return handleTrack(request, env);
    }

    return new Response("not found", { status: 404 });
  },
};
