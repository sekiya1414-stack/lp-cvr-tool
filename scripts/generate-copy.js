#!/usr/bin/env node
/**
 * data/<project>/config.json の商材情報をもとに、prompts/copy-generation.md の方針で
 * `claude` コマンド(Claude Code CLIのヘッドレスモード)を呼び出し、各variantのコピー
 * (JSON)を再生成する。生成結果は data/<project>/<variant>.json に上書き保存し、
 * scripts/build.js がそれを読み込んでHTMLを組み立てる。
 *
 * 実行方法: node scripts/generate-copy.js [projectName]  (省略時は project-a)
 * 前提: `claude` コマンドが認証済みでPATH上にあること
 *       (VPS上でのcron実行時は絶対パスを指定するか、PATHを明示的に通すこと)。
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");

const DEFAULT_IMAGE_SRC =
  "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80";

// prompts/copy-generation.md の「出力ルール」節を反映した生成方針。
const CRO_GUIDELINES = `
- 見出しは「機能」ではなく「得られる結果/ベネフィット」を主語にし、30字以内に収める
- サブコピーは「誰の・どんな課題を・どう解決するか」を1〜2文(60字程度)で
- CTA文言は行動後に得られる利益を明示する動詞句にする(「送信する」等は避ける。例:「無料で始める」)
- socialProofの数字は裏付けとなる事実にある具体的な実績を必ず使う
- testimonialは氏名・役職を伴う具体性のある形式で生成する(実在の人物を装わない一般的な名前)
- pricingの各プラン説明は「誰向けか」を明示する。真ん中(PLAN_2)は「おすすめ」枠として選ばれている理由を一言添える
- ctaの補足コピーでフォームの入力項目が少ないことに触れる
- 事実に基づかない誇張(存在しない実績・数字)は含めない
`.trim();

const OUTPUT_SHAPE = `{
  "title": "<pageのtitleタグ用、40字程度>",
  "description": "<meta description用、80字程度>",
  "hero": { "HERO_HEADLINE": "", "HERO_SUBCOPY": "", "HERO_CTA_TEXT": "", "HERO_IMAGE_ALT": "" },
  "socialProof": {
    "SOCIAL_PROOF_STAT_NUMBER": "", "SOCIAL_PROOF_STAT_LABEL": "",
    "LOGO_1_NAME": "", "LOGO_2_NAME": "", "LOGO_3_NAME": "", "LOGO_4_NAME": "",
    "TESTIMONIAL_1_TEXT": "", "TESTIMONIAL_1_NAME": "", "TESTIMONIAL_1_ROLE": "",
    "TESTIMONIAL_2_TEXT": "", "TESTIMONIAL_2_NAME": "", "TESTIMONIAL_2_ROLE": "",
    "TESTIMONIAL_3_TEXT": "", "TESTIMONIAL_3_NAME": "", "TESTIMONIAL_3_ROLE": ""
  },
  "pricing": {
    "PLAN_1_NAME": "", "PLAN_1_PRICE": "", "PLAN_1_DESC": "", "PLAN_1_FEATURES": ["", ""], "PLAN_1_CTA_TEXT": "",
    "PLAN_2_NAME": "", "PLAN_2_PRICE": "", "PLAN_2_DESC": "", "PLAN_2_FEATURES": ["", ""], "PLAN_2_CTA_TEXT": "",
    "PLAN_3_NAME": "", "PLAN_3_PRICE": "", "PLAN_3_DESC": "", "PLAN_3_FEATURES": ["", ""], "PLAN_3_CTA_TEXT": ""
  },
  "cta": { "CTA_HEADLINE": "", "CTA_SUBCOPY": "", "CTA_BUTTON_TEXT": "" }
}`;

function buildPrompt(productName, tone, variantConfig) {
  return `あなたはCRO(コンバージョン率最適化)に精通したコピーライターです。
以下の商材・ターゲット・訴求軸に基づき、LPの各セクション用コピーを生成してください。

商材名: ${productName}
ターゲット: ${variantConfig.targetPersona}
訴求軸: ${variantConfig.appealAxis}
トーン: ${tone}
裏付けとなる事実: ${variantConfig.keyFacts.join(" / ")}

# 出力ルール
${CRO_GUIDELINES}

# 出力形式
説明文やMarkdownのコードフェンスは一切付けず、以下のキーを全て含む1つのJSONオブジェクトのみを出力してください。
"PLAN_n_FEATURES" は文字列の配列(3〜4項目)にしてください。

${OUTPUT_SHAPE}`;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`claudeの出力からJSONを抽出できませんでした: ${text.slice(0, 300)}`);
  }
  return JSON.parse(raw.slice(start, end + 1));
}

function callClaude(prompt) {
  return execFileSync("claude", ["-p", prompt], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function loadExistingImageSrc(projectName, variantName) {
  const contentPath = path.join(DATA_DIR, projectName, `${variantName}.json`);
  if (!fs.existsSync(contentPath)) return DEFAULT_IMAGE_SRC;
  const existing = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  return existing.hero?.HERO_IMAGE_SRC || DEFAULT_IMAGE_SRC;
}

function generateVariant(projectName, variantName, productName, tone, variantConfig) {
  const prompt = buildPrompt(productName, tone, variantConfig);
  const output = callClaude(prompt);
  const content = extractJson(output);

  // 画像生成はフェーズ2の別機能(prompts/future-phase2-image-generation.md)のため、
  // 既存の画像はコピー再生成では上書きしない。
  content.hero = content.hero || {};
  content.hero.HERO_IMAGE_SRC = loadExistingImageSrc(projectName, variantName);

  return content;
}

function main() {
  const projectName = process.argv[2] || "project-a";
  const configPath = path.join(DATA_DIR, projectName, "config.json");
  const projectConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

  for (const [variantName, variantConfig] of Object.entries(projectConfig.variants)) {
    console.log(`generating: ${projectName}/${variantName} (${variantConfig.appealAxis})`);
    const content = generateVariant(
      projectName,
      variantName,
      projectConfig.productName,
      projectConfig.tone,
      variantConfig
    );
    const outPath = path.join(DATA_DIR, projectName, `${variantName}.json`);
    fs.writeFileSync(outPath, JSON.stringify(content, null, 2) + "\n", "utf8");
    console.log(`  -> saved: data/${projectName}/${variantName}.json`);
  }
}

main();
