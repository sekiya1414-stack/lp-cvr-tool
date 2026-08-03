#!/usr/bin/env node
/**
 * templates/ 内のパーツ(hero / social-proof / pricing / cta)を、
 * data/<project>/<variant>.json のコピー設定で組み立てて
 * lp/<project>/<variant>/index.html を生成する。
 *
 * コピー設定は scripts/generate-copy.js がLLMで再生成する(このスクリプト自体は
 * Node標準の fs / path のみで動作、npm install不要)。
 *   実行方法: node scripts/build.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATES_DIR = path.join(ROOT, "templates");
const LP_DIR = path.join(ROOT, "lp");
const DATA_DIR = path.join(ROOT, "data");

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
  .cta-error { color: #dc2626; margin-top: 16px; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
`;

const FORMSPREE_ENDPOINT = "https://formspree.io/f/xrenovaz";

const FORM_HANDLER_SCRIPT = `<script>
(function () {
  var form = document.querySelector(".cta-form");
  if (!form) return;
  var success = document.querySelector(".cta-success");
  var error = document.querySelector(".cta-error");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (error) error.hidden = true;
    fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      headers: { Accept: "application/json" },
    }).then(function (res) {
      if (res.ok) {
        form.style.display = "none";
        if (success) success.hidden = false;
      } else if (error) {
        error.hidden = false;
      }
    }).catch(function () {
      if (error) error.hidden = false;
    });
  });
})();
</script>`;

const GOATCOUNTER_SCRIPT = `<script data-goatcounter="https://rojiuracity.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>`;

function renderPage({ title, description, sectionsHtml }) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<style>${CSS_BASE}</style>
${GOATCOUNTER_SCRIPT}
</head>
<body>
${sectionsHtml.join("\n")}
${FORM_HANDLER_SCRIPT}
</body>
</html>
`;
}

function buildVariant(projectName, variantName, config) {
  const heroTemplate = readTemplate("hero");
  const socialProofTemplate = readTemplate("social-proof");
  const pricingTemplate = readTemplate("pricing");
  const ctaTemplate = readTemplate("cta");

  const sectionsHtml = [
    fillPlaceholders(heroTemplate, config.hero),
    fillPlaceholders(socialProofTemplate, config.socialProof),
    fillPlaceholders(pricingTemplate, config.pricing),
    fillPlaceholders(ctaTemplate, {
      ...config.cta,
      FORM_ACTION: FORMSPREE_ENDPOINT,
      VARIANT_NAME: variantName,
    }),
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
  const projectConfig = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, projectName, "config.json"), "utf8")
  );

  for (const variantName of Object.keys(projectConfig.variants)) {
    const contentPath = path.join(DATA_DIR, projectName, `${variantName}.json`);
    const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
    buildVariant(projectName, variantName, content);
  }
}

main();
