#!/usr/bin/env bash
# Deploy the whole game (page + leaderboard API) to Cloudflare as one Worker.
# Copies the static files into worker/.site/ (the Worker's assets dir), then runs wrangler deploy.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf .site && mkdir .site
cp ../index.html ../og.png .site/
npx wrangler deploy "$@"
