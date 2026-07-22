# lp-cvr-tool

CVR最適化に特化した、LP(ランディングページ)自動生成システム。

**「デザインツール」ではなく「勝てるLPを自動で見つけるシステム」。**

LLMで訴求軸の異なる複数パターンのLPを生成し、公開後の実データ(CVR)を元に
「勝ちパターン」を学習・蓄積していくことを目指すプロジェクトです。

## コンセプト

1. 1つの商材(プロジェクト)につき、訴求軸の異なる複数バリアントのLPを生成する
2. 公開してトラフィックを流し、どのバリアントが最もCVRが高いかを計測する
3. 勝ちパターンをデータとして蓄積し、次回以降のLP生成にフィードバックする

現時点(フェーズ1)では、上記のうち「複数バリアントのLPを作って公開する」部分のみを、
静的サイト + GitHub Pagesという最小構成で実現しています。

## ディレクトリ構成

```
lp-cvr-tool/
├── README.md
├── .gitignore
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Pagesへの自動デプロイ
├── public/
│   └── index.html               # ルート案内ページ(公開サイトのトップ)
├── lp/                           # 生成LP本体(プロジェクト × バリアント別)
│   └── project-a/
│       ├── variant-1/index.html    # 価格訴求
│       ├── variant-2/index.html    # 権威訴求
│       └── variant-3/index.html    # 感情訴求
├── templates/                    # 再利用可能なLPパーツ(サンプル)
│   ├── hero/
│   ├── cta/
│   ├── social-proof/
│   └── pricing/
├── prompts/                       # LLM生成プロンプト管理
│   ├── copy-generation.md          # コピー生成プロンプトの叩き台
│   ├── structure-generation.md     # 構造生成プロンプトの叩き台
│   └── future-phase2-image-generation.md  # フェーズ2の画像生成機能メモ
└── scripts/
    └── build.js                   # テンプレート → HTML生成スクリプト
```

新しいプロジェクト(商材)を追加する場合は `lp/project-b/` のように
`lp/` 配下にディレクトリを追加し、`public/index.html` にリンクを足していく想定です。

## フェーズ1: 静的LP + GitHub Pages(現在)

- `lp/` 配下に各バリアントの完成HTMLを配置するだけの、サーバーサイド処理なしの構成
- `main` ブランチへのpushで GitHub Actions が自動的に GitHub Pages へデプロイ
- 振り分け・計測・LLM呼び出しは行わない(手動でリンクを配布し、外部の解析ツール等で
  簡易的にCVRを見る運用を想定)
- 画像は Canva で手動 / 半自動作成し、置き換え前提でプレースホルダー画像を使用
  (詳細は [`prompts/future-phase2-image-generation.md`](prompts/future-phase2-image-generation.md) を参照)

### ローカルでの確認方法

各HTMLファイルは外部依存のない単一ファイルなので、ブラウザで直接開いて確認できます。

```bash
# 例: variant-1 をブラウザで開く
start lp/project-a/variant-1/index.html   # Windows
```

`scripts/build.js` を実行すると、`templates/` 内のパーツ + variantごとのコピー設定から
`lp/project-a/variant-*/index.html` を再生成できます(Node標準ライブラリのみで動作、
npm install不要)。

```bash
node scripts/build.js
```

## 今後のフェーズ(予定)

### フェーズ2: バックエンド追加
- Vercel / Cloudflare Workers でのバックエンド追加
  - A/Bテストの振り分け(訪問者をバリアントに割り当て)
  - イベント計測API(閲覧・CTAクリック・コンバージョンの記録)
  - Anthropic API経由でのコピー・構造生成(`prompts/` のプロンプトを実際に呼び出す)
  - 画像生成API(Stability AI / DALL-E)経由でのヒーロー画像自動生成
- Supabase でのデータベース構築(計測データ・生成LP・勝ちパターンの永続化)

### フェーズ3: 学習ループの構築
- 勝ちパターンDBの蓄積(業種・訴求軸別のCVR実績データ)
- GitHub Actionsでの定期分析バッチ(蓄積データから次回生成へのフィードバック)

## CRO(コンバージョン率最適化)の初期仮説について

`prompts/copy-generation.md` と `prompts/structure-generation.md` には、
一般的なCRO知見をデフォルトの仮説として記載しています。これらは**実データが
蓄積されるまでの初期仮説**であり、フェーズ2以降でA/Bテスト結果が溜まり次第、
業種別の実データに基づく知見へ上書き・更新していく設計です。
