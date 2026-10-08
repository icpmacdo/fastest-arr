#!/usr/bin/env bash
# Render scripts/og.html to og.png (1200x630) for link previews, using headless Chrome.
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,630 \
  --virtual-time-budget=5000 --screenshot="$PWD/og.png" "file://$PWD/scripts/og.html" 2>/dev/null
echo "wrote og.png"
