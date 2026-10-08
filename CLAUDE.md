# fastest-arr

Joke browser game: press Incorporate, then Collect a $0.99 micropayment that halves every 0.25 s. ARR = payment ÷ elapsed s × 31,536,000.

- **Stack:** a single `index.html` (vanilla HTML/CSS/JS, inline). No build, no dependencies beyond Google Fonts.
- **Deploy:** GitHub Pages from `main` / root → https://ian-macdonald.me/fastest-arr/ (custom domain comes from the icpmacdo.github.io user site). Pushing to main deploys.
- **Run:** `python3 -m http.server` in the repo root.
- **Tuning:** constants at the top of the `<script>` (START_VALUE, HALF_LIFE_MS, RUNWAY_MS, HUMAN_FLOOR_MS, SPAWN_DISTANCE, STAGES). Keep the README stage table in sync.
- **Timing:** both presses use `pointerdown` + `event.timeStamp` and reject `!isTrusted`. Keep the Incorporate handler lean so Collect paints next frame.
- **Leaderboard:** two tabs. "Yours" is localStorage (`fastest-arr:board`, top 10). "Global" is the Worker API in `worker/`: Cloudflare Worker `fastest-arr-api` + one SQLite Durable Object (`Board`, `idFromName('global')`), one row per anonymous player id (`fastest-arr:player` in localStorage), best run only.
- **Why a Durable Object and not D1:** the Cloudflare account is at the free plan's 10-D1-database cap. Don't delete other projects' databases to make room.
- **Server rules:** ARR is recomputed server-side from `ms`. The physics constants in `worker/src/index.js` must match `index.html`. Rejects `ms < 100` and `ms >= 4000`, caps names at 32 chars, rate-limits 30 submits/min per hashed IP (in memory), ranks past 1000 come back as `null`.
- **Moderation:** `worker/remove.sh "Exact Name"` uses the admin token in `worker/.admin-token` (gitignored, also stored as the `ADMIN_TOKEN` Worker secret). Never print or commit it.
- **Limits:** free tier is about 100k Worker requests/day (each page view is ~1 `/top`, each run 1 `/score`). If it goes viral, the $5/mo Workers plan lifts it. The client degrades to "Global board unreachable".
- **Local API:** `cd worker && npx wrangler dev --port 8799`, then open `/?dev&api=http://127.0.0.1:8799`. `?dev` rounds submit only when `api` isn't production. `worker/test-local.sh` = 19 API checks on a fresh dev server (writes data, trips the rate limit, never point it at prod).
- **Checks:** `?dev` exposes `window.fastestArr` (math, `start()`, `finish(ms)`, `postText`, `drawCard`). `scripts/phone-check.html[?api=…]` renders 5 phone-width states (it overwrites that origin's local leaderboard with sample data). Headless: `Google Chrome --headless=new --window-size=1980,844 --virtual-time-budget=3000 --blink-settings=preferredColorScheme=1 --screenshot=out.png <url>`. `scripts/make-og.sh` re-renders `og.png` from `scripts/og.html`.
