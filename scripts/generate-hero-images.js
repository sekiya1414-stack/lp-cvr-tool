#!/usr/bin/env node
/**
 * Cloudflare Workers AI(FLUX)経由でLPヒーロー画像の候補を生成し、
 * assets/hero-candidates/<project>/ にローカル保存する。
 * 訪問者には配信しない、ビルド時の下ごしらえ用ツール。
 *
 * 使い方: node scripts/generate-hero-images.js
 * 選んだ候補は手動で assets/img/ に移し、scripts/build.js の
 * HERO_IMAGE_SRC をそのパスに書き換えてから node scripts/build.js を実行する。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SECRET_FILE = path.join(ROOT, "workers", ".generate-image-secret.local");
const ENDPOINT = "https://lp-cvr-tool.lp-cvr-tool-workers.workers.dev/generate-image";
const OUT_DIR = path.join(ROOT, "assets", "hero-candidates", "project-a");

// variantごとの訴求軸(scripts/build.jsのコピー設定と対応)に合わせたプロンプト
const VARIANT_PROMPTS = {
  "variant-1":
    "A clean modern SaaS task management dashboard UI mockup on a laptop screen, kanban board with colorful task cards, minimal and affordable budget-friendly product feel, blue and white color scheme, professional product screenshot style, no readable text",
  "variant-2":
    "An enterprise-grade professional SaaS dashboard UI on a laptop screen used in a modern corporate office, trusted business software, polished dark navy and white color scheme, prestigious and authoritative product screenshot style, no readable text",
  "variant-3":
    "A relieved and happy small team collaborating warmly around a laptop showing a friendly task management app, soft natural lighting, candid lifestyle photography style, warm approachable mood, no readable text",
};

async function generateOne(variantName, prompt) {
  const secret = fs.readFileSync(SECRET_FILE, "utf8").trim();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Generate-Secret": secret,
    },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    throw new Error(`${variantName}: HTTP ${res.status} ${await res.text()}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${variantName}.jpg`);
  fs.writeFileSync(outPath, buffer);
  console.log(`generated: ${path.relative(ROOT, outPath)} (${buffer.length} bytes)`);
}

async function main() {
  for (const [variantName, prompt] of Object.entries(VARIANT_PROMPTS)) {
    await generateOne(variantName, prompt);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
