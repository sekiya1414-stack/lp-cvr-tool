#!/usr/bin/env node
/**
 * templates/ 内のパーツ(hero / social-proof / pricing / cta)を、
 * variantごとのコピー設定で組み立てて lp/<project>/<variant>/index.html を生成する。
 *
 * Node標準の fs / path のみで動作(npm install不要)。
 *   実行方法: node scripts/build.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATES_DIR = path.join(ROOT, "templates");
const LP_DIR = path.join(ROOT, "lp");

function readTemplate(name) {
  return fs.readFileSync(path.join(TEMPLATES_DIR, name, "sample.html"), "utf8");
}

// {{KEY}} をvaluesのKEYで置換する。配列が渡された場合は <li>...</li> を連結してから埋め込む。
function fillPlaceholders(template, values) {
  return template.replace(/{{\s*([A-Z0-9_]+)\s*}}/g, (match, key) => {
    if (!(key in values)) return match;
    const value = values[key];
    if (Array.isArray(value)) {
      return value.map((item) => `<li>${item}</li>`).join("");
    }
    return value;
  });
}

const CSS_BASE = `
  :root { color-scheme: light; --accent: #2563eb; --text: #0f172a; --muted: #64748b; --border: #e2e8f0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Hiragino Sans", "Yu Gothic", sans-serif; color: var(--text); line-height: 1.7; }
  section { padding: 64px 24px; max-width: 960px; margin: 0 auto; }
  .btn { display: inline-block; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-outline { background: transparent; color: var(--accent); border: 1px solid var(--accent); }

  .hero { display: flex; flex-wrap: wrap; align-items: center; gap: 40px; }
  .hero-inner { flex: 1 1 360px; }
  .hero-headline { font-size: 2.2rem; margin: 0 0 16px; }
  .hero-subcopy { color: var(--muted); font-size: 1.05rem; margin-bottom: 28px; }
  .hero-media { flex: 1 1 320px; }
  .hero-media img { width: 100%; border-radius: 12px; }

  .social-proof { text-align: center; border-top: 1px solid var(--border); }
  .social-proof-stat { font-size: 1.1rem; margin-bottom: 24px; }
  .social-proof-stat strong { font-size: 1.8rem; color: var(--accent); margin-right: 6px; }
  .logo-row { list-style: none; display: flex; justify-content: center; gap: 32px; flex-wrap: wrap; padding: 0; margin: 0 0 40px; color: var(--muted); font-weight: bold; }
  .testimonials { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; text-align: left; }
  .testimonial { background: #f8fafc; border-radius: 10px; padding: 20px; margin: 0; }
  .testimonial footer { margin-top: 12px; color: var(--muted); font-size: 0.9rem; }

  .pricing { border-top: 1px solid var(--border); }
  .section-title { text-align: center; font-size: 1.6rem; margin-bottom: 32px; }
  .pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; }
  .pricing-card { border: 1px solid var(--border); border-radius: 12px; padding: 28px; text-align: center; }
  .pricing-card-highlight { border-color: var(--accent); border-width: 2px; position: relative; }
  .badge { position: absolute; top: -14px; left: 50%; transform: translateX(-50%); background: var(--accent); color: #fff; padding: 4px 14px; border-radius: 999px; font-size: 0.8rem; margin: 0; }
  .price { font-size: 1.6rem; font-weight: bold; margin: 8px 0; }
  .desc { color: var(--muted); margin-bottom: 16px; }
  .features { list-style: none; padding: 0; margin: 0 0 24px; text-align: left; color: var(--muted); }
  .features li::before { content: "✓ "; color: var(--accent); font-weight: bold; }

  .cta { text-align: center; border-top: 1px solid var(--border); }
  .cta-headline { font-size: 1.8rem; margin-bottom: 12px; }
  .cta-subcopy { color: var(--muted); margin-bottom: 28px; }
  .cta-form { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; }
  .cta-form input { padding: 14px; border-radius: 8px; border: 1px solid var(--border); min-width: 260px; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
`;

function renderPage({ title, description, sectionsHtml }) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<style>${CSS_BASE}</style>
</head>
<body>
${sectionsHtml.join("\n")}
</body>
</html>
`;
}

// variantごとのコピー設定。訴求軸(価格 / 権威 / 感情)によって差し替える。
const variants = {
  "variant-1": {
    title: "TaskFlow | チーム作業をシンプルに、コストは最小限に",
    description: "月額980円から始められるチームタスク管理ツール TaskFlow",
    hero: {
      HERO_HEADLINE: "高機能なタスク管理を、1人あたり月額980円から。",
      HERO_SUBCOPY: "他社ツールの半額以下。小規模チームでも無理なく導入できる料金設計です。",
      HERO_CTA_TEXT: "無料で始める",
      HERO_IMAGE_SRC: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80",
      HERO_IMAGE_ALT: "TaskFlowのダッシュボード画面イメージ(プレースホルダー)",
    },
    socialProof: {
      SOCIAL_PROOF_STAT_NUMBER: "1,000社+",
      SOCIAL_PROOF_STAT_LABEL: "が導入し、コスト削減を実現",
      LOGO_1_NAME: "Sample Corp",
      LOGO_2_NAME: "Acme Inc.",
      LOGO_3_NAME: "Nova Works",
      LOGO_4_NAME: "Blue Field",
      TESTIMONIAL_1_TEXT: "他ツールから乗り換えて月額コストが半分になりました。",
      TESTIMONIAL_1_NAME: "山田 太郎",
      TESTIMONIAL_1_ROLE: "スタートアップ CEO",
      TESTIMONIAL_2_TEXT: "機能は十分なのに価格が手頃で、社内稟議も一瞬で通りました。",
      TESTIMONIAL_2_NAME: "佐藤 花子",
      TESTIMONIAL_2_ROLE: "バックオフィス責任者",
      TESTIMONIAL_3_TEXT: "無料プランで試してからの導入だったので安心できました。",
      TESTIMONIAL_3_NAME: "鈴木 一郎",
      TESTIMONIAL_3_ROLE: "プロジェクトマネージャー",
    },
    pricing: {
      PLAN_1_NAME: "Free",
      PLAN_1_PRICE: "¥0 / 月",
      PLAN_1_DESC: "個人・小規模チームのお試しに",
      PLAN_1_FEATURES: ["タスク管理(3プロジェクトまで)", "メンバー3人まで", "メールサポート"],
      PLAN_1_CTA_TEXT: "無料で始める",
      PLAN_2_NAME: "Standard",
      PLAN_2_PRICE: "¥980 / 月・人",
      PLAN_2_DESC: "最も選ばれているプラン",
      PLAN_2_FEATURES: ["プロジェクト数無制限", "メンバー無制限", "ガントチャート", "チャットサポート"],
      PLAN_2_CTA_TEXT: "無料で始める",
      PLAN_3_NAME: "Business",
      PLAN_3_PRICE: "¥1,980 / 月・人",
      PLAN_3_DESC: "大規模チーム・複数部門向け",
      PLAN_3_FEATURES: ["Standardの全機能", "権限管理", "API連携", "専任サポート"],
      PLAN_3_CTA_TEXT: "無料で始める",
    },
    cta: {
      CTA_HEADLINE: "今なら初月無料でお試しいただけます",
      CTA_SUBCOPY: "クレジットカード登録不要。1分で始められます。",
      CTA_BUTTON_TEXT: "無料で始める",
    },
  },

  "variant-2": {
    title: "TaskFlow | 導入企業1,000社超のタスク管理プラットフォーム",
    description: "国内シェアNo.1クラス、導入企業1,000社超のTaskFlow",
    hero: {
      HERO_HEADLINE: "導入企業1,000社超。選ばれ続けるタスク管理プラットフォーム。",
      HERO_SUBCOPY: "大手企業からスタートアップまで、業界を問わず導入実績多数。専門家監修のワークフロー設計。",
      HERO_CTA_TEXT: "資料を無料で受け取る",
      HERO_IMAGE_SRC: "https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=800&q=80",
      HERO_IMAGE_ALT: "TaskFlowのチーム利用イメージ(プレースホルダー)",
    },
    socialProof: {
      SOCIAL_PROOF_STAT_NUMBER: "1,000社+",
      SOCIAL_PROOF_STAT_LABEL: "の導入実績、業務効率化アワード受賞",
      LOGO_1_NAME: "Sample Corp",
      LOGO_2_NAME: "Acme Inc.",
      LOGO_3_NAME: "Nova Works",
      LOGO_4_NAME: "Blue Field",
      TESTIMONIAL_1_TEXT: "業界標準になりつつあるツールだと実感しています。",
      TESTIMONIAL_1_NAME: "高橋 誠",
      TESTIMONIAL_1_ROLE: "上場企業 情報システム部長",
      TESTIMONIAL_2_TEXT: "第三者機関の業務効率化アワードを受賞していた点が導入の決め手でした。",
      TESTIMONIAL_2_NAME: "田中 久美子",
      TESTIMONIAL_2_ROLE: "コンサルティングファーム パートナー",
      TESTIMONIAL_3_TEXT: "専門家監修のテンプレートで、導入初日から運用に乗せられました。",
      TESTIMONIAL_3_NAME: "伊藤 誠一",
      TESTIMONIAL_3_ROLE: "製造業 DX推進責任者",
    },
    pricing: {
      PLAN_1_NAME: "Free",
      PLAN_1_PRICE: "¥0 / 月",
      PLAN_1_DESC: "まずは実績を体験",
      PLAN_1_FEATURES: ["タスク管理(3プロジェクトまで)", "メンバー3人まで", "メールサポート"],
      PLAN_1_CTA_TEXT: "資料を無料で受け取る",
      PLAN_2_NAME: "Standard",
      PLAN_2_PRICE: "¥980 / 月・人",
      PLAN_2_DESC: "導入企業の多くが選択",
      PLAN_2_FEATURES: ["プロジェクト数無制限", "メンバー無制限", "ガントチャート", "チャットサポート"],
      PLAN_2_CTA_TEXT: "資料を無料で受け取る",
      PLAN_3_NAME: "Business",
      PLAN_3_PRICE: "¥1,980 / 月・人",
      PLAN_3_DESC: "大手企業導入実績多数",
      PLAN_3_FEATURES: ["Standardの全機能", "権限管理", "API連携", "専任サポート"],
      PLAN_3_CTA_TEXT: "資料を無料で受け取る",
    },
    cta: {
      CTA_HEADLINE: "1,000社が選んだ理由を資料でご確認ください",
      CTA_SUBCOPY: "導入事例・活用ノウハウをまとめた資料を無料配布中。",
      CTA_BUTTON_TEXT: "資料を無料で受け取る",
    },
  },

  "variant-3": {
    title: "TaskFlow | もう、タスクの抜け漏れに悩まない毎日へ",
    description: "チームの「あれ、誰がやるんだっけ」をなくすTaskFlow",
    hero: {
      HERO_HEADLINE: "「あれ、誰がやるんだっけ」をなくす。",
      HERO_SUBCOPY: "抜け漏れの不安、確認のための残業、そんな毎日をTaskFlowが変えます。",
      HERO_CTA_TEXT: "毎日を軽くする",
      HERO_IMAGE_SRC: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80",
      HERO_IMAGE_ALT: "安心した表情でチームで働くイメージ(プレースホルダー)",
    },
    socialProof: {
      SOCIAL_PROOF_STAT_NUMBER: "1,000社+",
      SOCIAL_PROOF_STAT_LABEL: "のチームが、同じ悩みから解放されました",
      LOGO_1_NAME: "Sample Corp",
      LOGO_2_NAME: "Acme Inc.",
      LOGO_3_NAME: "Nova Works",
      LOGO_4_NAME: "Blue Field",
      TESTIMONIAL_1_TEXT: "確認のためだけの残業がなくなり、定時で帰れる日が増えました。",
      TESTIMONIAL_1_NAME: "中村 隆",
      TESTIMONIAL_1_ROLE: "営業チームリーダー",
      TESTIMONIAL_2_TEXT: "「言った言わない」がなくなって、チームの雰囲気まで良くなりました。",
      TESTIMONIAL_2_NAME: "小林 彩",
      TESTIMONIAL_2_ROLE: "バックオフィス担当",
      TESTIMONIAL_3_TEXT: "抜け漏れへの不安が減って、安心して仕事に集中できています。",
      TESTIMONIAL_3_NAME: "渡辺 学",
      TESTIMONIAL_3_ROLE: "新任マネージャー",
    },
    pricing: {
      PLAN_1_NAME: "Free",
      PLAN_1_PRICE: "¥0 / 月",
      PLAN_1_DESC: "まずは肩の力を抜いて試す",
      PLAN_1_FEATURES: ["タスク管理(3プロジェクトまで)", "メンバー3人まで", "メールサポート"],
      PLAN_1_CTA_TEXT: "毎日を軽くする",
      PLAN_2_NAME: "Standard",
      PLAN_2_PRICE: "¥980 / 月・人",
      PLAN_2_DESC: "多くのチームが安心を得たプラン",
      PLAN_2_FEATURES: ["プロジェクト数無制限", "メンバー無制限", "ガントチャート", "チャットサポート"],
      PLAN_2_CTA_TEXT: "毎日を軽くする",
      PLAN_3_NAME: "Business",
      PLAN_3_PRICE: "¥1,980 / 月・人",
      PLAN_3_DESC: "チーム全体を不安から解放",
      PLAN_3_FEATURES: ["Standardの全機能", "権限管理", "API連携", "専任サポート"],
      PLAN_3_CTA_TEXT: "毎日を軽くする",
    },
    cta: {
      CTA_HEADLINE: "その不安、今日で終わりにしませんか",
      CTA_SUBCOPY: "登録は1分。まずは無料でTaskFlowを試してみてください。",
      CTA_BUTTON_TEXT: "毎日を軽くする",
    },
  },
};

function buildVariant(projectName, variantName, config) {
  const heroTemplate = readTemplate("hero");
  const socialProofTemplate = readTemplate("social-proof");
  const pricingTemplate = readTemplate("pricing");
  const ctaTemplate = readTemplate("cta");

  const sectionsHtml = [
    fillPlaceholders(heroTemplate, config.hero),
    fillPlaceholders(socialProofTemplate, config.socialProof),
    fillPlaceholders(pricingTemplate, config.pricing),
    fillPlaceholders(ctaTemplate, config.cta),
  ];

  const html = renderPage({
    title: config.title,
    description: config.description,
    sectionsHtml,
  });

  const outDir = path.join(LP_DIR, projectName, variantName);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), html, "utf8");
  console.log(`generated: lp/${projectName}/${variantName}/index.html`);
}

function main() {
  const projectName = "project-a";
  for (const [variantName, config] of Object.entries(variants)) {
    buildVariant(projectName, variantName, config);
  }
}

main();
