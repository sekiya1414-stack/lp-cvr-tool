/**
 * lp-cvr-tool フェーズ2 バックエンド(Cloudflare Workers)
 *
 * - GET  /assign : 訪問者にvariantを振り分け、Cookie保存の上で静的LPへ302リダイレクト
 * - POST /track  : クリック/CVイベントをD1に記録
 * - GET  /stats  : D1の記録からベイズ的にvariantごとの勝率・勝者を判定
 * - POST /generate-image : ヒーロー画像の候補生成(Workers AI)。ビルド時にローカルから
 *   叩いて候補を保存し、選んだものをtemplates/hero差し替えに使う運用(訪問者には配信しない)
 * - POST /generate-copy  : LPコピー一式の生成(Workers AI)。scripts/build.jsのvariant設定と
 *   同じJSON構造で返す。画像生成と同様、訪問者には配信しないビルド時ツール
 */

import { PROJECT_VARIANTS } from "./constants";
import { computeStats, type VariantCounts } from "./stats";
import { COPY_JSON_SCHEMA } from "./copy-schema";

export interface Env {
  DB: D1Database;
  AI: Ai;
  GENERATE_IMAGE_SECRET: string;
  GENERATE_COPY_SECRET: string;
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

// 実機比較の結果: Llama-3.3-70b-fp8-fastは日本語が意味不明な繰り返しになり、
// Qwen3.8-27bは「reasoning」型モデルで、json_schema指定時も思考過程だけで
// max_tokensを使い切ってしまい本文が空になったため不採用。非reasoningの
// Mistral Small 3.1で試す
const COPY_MODEL = "@cf/mistralai/mistral-small-3.1-24b-instruct";

async function handleGenerateCopy(request: Request, env: Env): Promise<Response> {
  const providedSecret = request.headers.get("X-Generate-Secret");
  if (!env.GENERATE_COPY_SECRET || providedSecret !== env.GENERATE_COPY_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: { productName?: string; productDescription?: string; targetPersona?: string; appealAxis?: string };
  try {
    body = await request.json();
  } catch {
    return new Response("invalid JSON body", { status: 400 });
  }
  const { productName, productDescription, targetPersona, appealAxis } = body;
  if (!productName || !productDescription || !targetPersona || !appealAxis) {
    return new Response("productName, productDescription, targetPersona, appealAxis は必須です", { status: 400 });
  }

  const prompt = `あなたはLPのコピーライターです。以下の商材について、訴求軸「${appealAxis}」を前面に出した日本語のランディングページコピー一式をJSONで作成してください。

商材名: ${productName}
商材説明: ${productDescription}
ターゲット: ${targetPersona}
訴求軸: ${appealAxis}

要件:
- 敬体(です・ます調)で、具体的な数字を交えて説得力を持たせること
- pricingは3プラン(Free/Standard/Business相当)を想定し、価格は商材説明から妥当な金額を設定すること
- socialProofの企業名・お客様の声は、実在しないダミーとして自然な日本語で作成すること
- 指定されたJSON Schemaのキー名・構造を厳守すること`;

  const result = await env.AI.run(COPY_MODEL, {
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_schema", json_schema: COPY_JSON_SCHEMA },
    // スキーマの項目数が多く、デフォルトのmax_tokensだと出力が途中で切れてJSONが
    // 壊れるため、日本語コピー一式(約35項目)が収まるよう明示的に増やす
    max_tokens: 3000,
  });

  // Workers AIのモデルによってレスポンス形状が異なる({ response: string } 形式の
  // ものと、OpenAI互換の { choices: [{ message: { content } }] } 形式のものがある)ため両対応する。
  // LLMの出力が稀に不正なJSON(壊れたUnicodeエスケープ・途中で切れる等)になることがあるため、
  // 失敗時は例外を投げず生テキストを添えて返す(呼び出し側でリトライ判断できるように)
  const asChatCompletion = result as { response?: unknown; choices?: { message?: { content?: unknown } }[] };
  const raw = asChatCompletion.response ?? asChatCompletion.choices?.[0]?.message?.content ?? result;
  if (typeof raw !== "string") {
    return new Response(JSON.stringify(raw, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const copy = JSON.parse(raw);
    return new Response(JSON.stringify(copy, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "model returned invalid JSON", raw, message: String(err) }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
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
    if (url.pathname === "/generate-copy" && request.method === "POST") {
      return handleGenerateCopy(request, env);
    }

    return new Response("not found", { status: 404 });
  },
};
