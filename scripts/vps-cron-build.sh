#!/bin/bash
# VPS上でcron実行する定期コピー生成 + ビルド + push用スクリプト。
#
# crontab登録例(毎朝6時に実行、cronはPATHが最小限のため絶対パスで指定する):
#   0 6 * * * /home/<user>/projects/lp-cvr-tool/scripts/vps-cron-build.sh >> /home/<user>/logs/lp-cvr-build.log 2>&1
#
# 前提: このリポジトリがVPS上にcloneされていて、`claude`コマンドが認証済みであること。
set -euo pipefail
cd "$(dirname "$0")/.."

git pull origin main

node scripts/generate-copy.js project-a
node scripts/build.js

git add data/ lp/
if git diff --cached --quiet; then
  echo "$(date -Iseconds) 変更なし、pushをスキップします"
else
  git commit -m "chore: LLMコピー再生成 $(date +%F)"
  git push origin main
  echo "$(date -Iseconds) push完了"
fi
