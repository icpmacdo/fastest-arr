# Fastest ARR

**Incorporate, then collect your first payment. We annualize it.**

A browser game about founder math. Press **Incorporate**, and a **Collect** button appears nearby. The payment starts at $0.99 and halves every quarter second. Collect it as fast as you can, and the game annualizes it:

```
ARR = payment ÷ seconds since incorporation × 31,536,000
```

Collect in 0.300 s and you get $0.4309, or **$45,298,576 in annual recurring revenue**. At a "conservative" 25× multiple, that makes you a unicorn. Collect at 1 s and you're a seed-stage company at $1.95M. Wait 4 s and the company is wound down.

**Play:** https://fastest-arr.icpmacdo.workers.dev/

| Stage | ARR | Roughly |
|---|---|---|
| IPO | $100M+ | under 0.19 s |
| Unicorn | $40M+ | under 0.32 s |
| Series B | $15M+ | under 0.51 s |
| Series A | $5M+ | under 0.76 s |
| Seed | $1M+ | under 1.19 s |
| Pre-seed | $100K+ | under 1.85 s |
| Lifestyle business | less | |

Collecting in under 100 ms puts the company **under review**, because no human reacts that fast. Collect only appears after you incorporate, the same distance away each time but in a random direction. That means you can't park your cursor on it or tap both buttons at once.

The result is set as a **tombstone**, the notice banks print to announce a closed deal, with the calculation laid out as a ledger underneath. You can post it to X, copy the text, or save it as an image. There are two league tables:

- **Global:** each player's best run, ranked by ARR, served by a Cloudflare Worker (`worker/`). The server recomputes ARR from the time and ignores any ARR the browser claims. It also rejects anything under 100 ms or at the 4 s runway, and rate-limits each IP.
- **This device:** your ten best runs, saved in this browser.

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
./deploy.sh                             # page + API, one Worker → https://fastest-arr.icpmacdo.workers.dev
./remove.sh "Some Company Name"         # moderation: delete entries with that exact name
```

Endpoints: `GET /top` (top 100 + total, cached 10 s per isolate), `GET /me?player=`, `POST /score {player, co, ms}`, `POST /admin/remove {co}` (bearer token).
