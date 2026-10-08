#!/usr/bin/env bash
# Smoke-test the API against a fresh local `wrangler dev` (it writes scores and trips the rate limit,
# so never point it at production). Usage: worker/test-local.sh [base-url]
set -uo pipefail
API="${1:-http://127.0.0.1:8799}"
pass=0; fail=0
check() { # name, expected-substring, actual
  if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "ok   $1"; else fail=$((fail+1)); echo "FAIL $1"; echo "     want: $2"; echo "     got:  $3"; fi
}
post() { curl -s -w ' HTTP%{http_code}' -X POST "$API/score" --data-binary "$1"; }

check "empty board"            '"total":0,"rows":[]'   "$(curl -s "$API/top")"
check "first run ranks #1"     '"rank":1,"best":true'  "$(post '{"player":"playerAAAA1","co":"Uber for Ferns","ms":300}')"
check "server recomputes ARR"  '"arr":45298576'           "$(post '{"player":"playerAAAA1","co":"Uber for Ferns","ms":300,"arr":1e15}')"
check "worse run not best"     '"rank":2,"best":false' "$(post '{"player":"playerAAAA1","co":"Uber for Ferns","ms":500}')"
check "submit returns my best" '"me":{"co":"Uber for Ferns","arr":45298576' "$(post '{"player":"playerAAAA1","co":"Renamed","ms":600}')"
check "new leader"             '"rank":1,"best":true'  "$(post '{"player":"playerBBBB2","co":"Cursor for Cats","ms":250}')"
check "one row per player"     '"total":2'             "$(curl -s "$API/top")"
check "ordered by ARR"         '"rows":[{"co":"Cursor for Cats"' "$(curl -s "$API/top")"
check "me rank"                '"rank":2'              "$(curl -s "$API/me?player=playerAAAA1")"
check "me unknown"             '{"me":null}'           "$(curl -s "$API/me?player=nobody12345")"
check "flagged rejected"       'HTTP422'               "$(post '{"player":"playerAAAA1","co":"x","ms":60}')"
check "dissolved rejected"     'HTTP422'               "$(post '{"player":"playerAAAA1","co":"x","ms":4000}')"
check "bad player"             'HTTP400'               "$(post '{"player":"x","co":"x","ms":300}')"
check "ms must be a number"    'HTTP400'               "$(post '{"player":"playerAAAA1","co":"x","ms":"300"}')"
check "bad json"               'HTTP400'               "$(post 'nope')"
check "oversized body"         'HTTP413'               "$(post "{\"player\":\"playerAAAA1\",\"co\":\"$(printf 'x%.0s' {1..1100})\",\"ms\":300}")"
check "name cleaned + capped"  '"co":"Zero Width Inc Aaaaaaaaaaaaaaaaa"' "$(post '{"player":"playerCCCC3","co":"  Zero​ Width\u0007  Inc Aaaaaaaaaaaaaaaaaaaaaaaaaaaaa","ms":200}')"
check "admin needs token"      'HTTP401'               "$(curl -s -w ' HTTP%{http_code}' -X POST "$API/admin/remove" --data-binary '{"co":"Uber for Ferns"}')"
last=""
for i in $(seq 1 35); do last=$(post '{"player":"playerDDDD4","co":"Spam","ms":3000}'); done
check "rate limited"           'HTTP429'               "$last"
echo "$pass passed, $fail failed"; [ "$fail" -eq 0 ]
