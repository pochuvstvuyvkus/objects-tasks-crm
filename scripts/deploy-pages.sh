#!/usr/bin/env bash
# Собирает сайт с переменными из .env и публикует dist/ в ветку gh-pages (GitHub Pages, Source: Deploy from a branch).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "Нет .env: скопируйте .env.example и впишите URL и anon-ключ проекта"; exit 1; }
npm run build
touch dist/.nojekyll
tmp=$(mktemp -d)
cp -R dist/. "$tmp"
cd "$tmp"
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.name="$(git -C "$OLDPWD" config user.name || echo deploy)" -c user.email="$(git -C "$OLDPWD" config user.email || echo deploy@localhost)" commit -qm "Публикация $(date '+%Y-%m-%d %H:%M')"
git push -qf "$(git -C "$OLDPWD" remote get-url origin)" gh-pages
cd - >/dev/null && rm -rf "$tmp"
echo "Опубликовано в ветку gh-pages"
