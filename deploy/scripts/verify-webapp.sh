#!/usr/bin/env bash
# Проверка, что с сервера отдаются свежие файлы мини-приложения (после git pull).
# Пример: bash deploy/scripts/verify-webapp.sh https://wordle.example.ru
set -euo pipefail
BASE="${1:-}"
if [[ -z "$BASE" ]]; then
  echo "Usage: $0 https://your-domain (без слэша в конце)" >&2
  exit 1
fi
BASE="${BASE%/}"
for path in /webapp/index.html /webapp/hub.js /webapp/app.js /webapp/styles.css; do
  url="${BASE}${path}"
  echo "== ${url}"
  curl -fsSI "$url" | head -n 1 || echo "ОШИБКА: нет ответа или не 2xx"
done
