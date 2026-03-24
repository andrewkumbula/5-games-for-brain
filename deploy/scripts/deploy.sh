#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/fiveletters"
SERVICE_NAME="fiveletters-bot"

echo "[1/5] Update source"
cd "$APP_DIR"
git pull --ff-only

echo "[2/5] Ensure virtualenv"
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

echo "[3/5] Install dependencies"
.venv/bin/pip install -r requirements.txt

echo "[4/5] Optional: rebuild dictionary"
# .venv/bin/python -m tools.dict build --out json --nouns-only --gram-case nomn --min-allowed 1000

echo "[5/5] Restart bot service"
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl status "$SERVICE_NAME" --no-pager

echo "Deploy complete."
