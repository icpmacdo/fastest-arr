# Fastest ARR

**Incorporate. Get paid. Annualize.**

A vibe-coded browser game about founder math. Hit **Incorporate**, and a **Collect micropayment** button pops up nearby. The payment starts at $0.99 and halves every 0.25 s. Collect it as fast as humanly possible, and we annualize it:

```
ARR = payment ÷ seconds since incorporation × 31,536,000
```

Collect in 0.300 s and you get $0.4309, which works out to **$45.3M ARR**. That's a 🦄 Unicorn at a "conservative" 25× multiple. Collect at 1 s and you're a 🌱 Seed-stage company with $1.95M. Wait 4 s and the company dissolves.

**Play:** https://ian-macdonald.me/fastest-arr/

| Stage | ARR | Roughly |
|---|---|---|
| 🔔 IPO | $100M+ | under 0.19 s |
| 🦄 Unicorn | $40M+ | under 0.32 s |
| 🚀 Series B | $15M+ | under 0.51 s |
| 📈 Series A | $5M+ | under 0.76 s |
| 🌱 Seed | $1M+ | under 1.19 s |
| 🥚 Pre-seed | $100K+ | under 1.85 s |
| 🏖️ Lifestyle business | less | |

Collecting in under 100 ms gets you **flagged by auditors**, because no human reacts that fast. Collect only appears after you incorporate, the same distance away each time but in a random direction. That means you can't park your cursor on it or tap both buttons at once.

Results come with a generated announcement post (Post on 𝕏 / Copy) and a downloadable share card. There are two leaderboards:

- **Global:** each player's best run, ranked by ARR, served by a Cloudflare Worker (`worker/`). The server recomputes ARR from the time and ignores any ARR the browser claims. It also rejects anything under 100 ms or at the 4 s runway, and rate-limits each IP.
- **Yours:** your top 10 runs, saved in this browser.

## Run locally

It's one static file with no build step:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

`?dev` exposes `window.fastestArr` (the math, plus `start()` / `finish(ms)` to fake a round), for testing. Faked rounds are never saved locally and never sent to the production leaderboard.

### Leaderboard API (`worker/`)

A Cloudflare Worker with one SQLite-backed Durable Object holding the whole board.

```sh
cd worker
npx wrangler dev --port 8799            # local API; then open the game at /?dev&api=http://127.0.0.1:8799
./test-local.sh                         # 19 API checks against a fresh local `wrangler dev`
npx wrangler deploy                     # → https://fastest-arr-api.icpmacdo.workers.dev
./remove.sh "Some Company Name"         # moderation: delete entries with that exact name
```

Endpoints: `GET /top` (top 100 + total, cached 10 s per isolate), `GET /me?player=`, `POST /score {player, co, ms}`, `POST /admin/remove {co}` (bearer token).
