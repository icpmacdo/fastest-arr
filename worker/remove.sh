#!/usr/bin/env bash
# Remove every global-leaderboard entry with this exact company name (moderation).
# Usage: worker/remove.sh "Company Name"   (reads the admin token from worker/.admin-token)
set -euo pipefail
cd "$(dirname "$0")"
[[ $# -eq 1 ]] || { echo "usage: $0 \"Company Name\"" >&2; exit 1; }
API="${API:-https://fastest-arr-api.icpmacdo.workers.dev}"
python3 -c 'import json, sys; print(json.dumps({"co": sys.argv[1]}))' "$1" \
  | curl -sS -X POST "$API/admin/remove" -H "Authorization: Bearer $(cat .admin-token)" --data-binary @-
echo
