#!/usr/bin/env node
/**
 * Cloudflare Workers AI経由でLPコピー一式(3訴求軸分)を生成し、
 * assets/copy-candidates/<project>/ にローカル保存する。
 * 訪問者には配信しない、ビルド時の下ごしらえ用ツール。
 *
 * 使い方: node scripts/generate-copy.js
 * 生成されたJSONの中身(hero/socialProof/pricing/cta)を確認・調整した上で、
 * scripts/build.js の variants["variant-N"] に手動で反映する。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SECRET_FILE = path.join(ROOT, "workers", ".generate-copy-secret.local");
const ENDPOINT = "https://lp-cvr-tool.lp-cvr-tool-workers.workers.dev/generate-copy";
const PROJECT_NAME = "project-a";
const OUT_DIR = path.join(ROOT, "assets", "copy-candidates", PROJECT_NAME);

// 生成したい商材。新規案件ではここを書き換える(TaskFlow自体は既にbuild.jsへ手書きコピーが
// 反映済みのため、このスクリプトは別商材向けコピーの下ごしらえに使う想定)
const PRODUCT = {
  productName: "FocusMail",
  productDescription:
    "AIが受信メールを自動で要約・優先度分類し、返信文の下書きまで作成するメール管理SaaS",
  targetPersona: "問い合わせ対応に追われる中小企業のカスタマーサポート担当者",
};

// variant名とscripts/build.jsの既存3パターン(価格/権威/感情)を対応させる
const VARIANT_APPEAL_AXES = {
  "variant-1": "価格訴求(コストパフォーマンス・低価格)",
  "variant-2": "権威訴求(導入実績・専門家監修)",
  "variant-3": "感情訴求(悩みからの解放・安心感)",
};

async function generateOne(variantName, appealAxis) {
  const secret = fs.readFileSync(SECRET_FILE, "utf8").trim();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Generate-Secret": secret,
    },
    body: JSON.stringify({ ...PRODUCT, appealAxis }),
  });
  if (!res.ok) {
    throw new Error(`${variantName}: HTTP ${res.status} ${await res.text()}`);
  }
  const copy = await res.json();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${variantName}.json`);
  fs.writeFileSync(outPath, JSON.stringify(copy, null, 2), "utf8");
  console.log(`generated: ${path.relative(ROOT, outPath)}`);
}

async function main() {
  for (const [variantName, appealAxis] of Object.entries(VARIANT_APPEAL_AXES)) {
    await generateOne(variantName, appealAxis);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
