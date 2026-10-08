# fastest-arr

Joke browser game: press Incorporate, then Collect a $0.99 micropayment that halves every 0.25 s. ARR = payment ÷ elapsed s × 31,536,000.

- **Stack:** a single `index.html` (vanilla HTML/CSS/JS, inline). No build, no dependencies beyond Google Fonts.
- **Deploy:** GitHub Pages from `main` / root → https://ian-macdonald.me/fastest-arr/ (custom domain comes from the icpmacdo.github.io user site). Pushing to main deploys.
- **Run:** `python3 -m http.server` in the repo root.
- **Tuning:** constants at the top of the `<script>` (START_VALUE, HALF_LIFE_MS, RUNWAY_MS, HUMAN_FLOOR_MS, SPAWN_DISTANCE, STAGES). Keep the README stage table in sync.
- **Timing:** both presses use `pointerdown` + `event.timeStamp` and reject `!isTrusted`. Keep the Incorporate handler lean so Collect paints next frame.
- **Leaderboard:** localStorage only (`fastest-arr:board`, top 10). There's no global board yet.
- **Checks:** `?dev` exposes `window.fastestArr` (math, `start()`, `finish(ms)`, `postText`, `drawCard`). `scripts/phone-check.html` renders 5 phone-width states (it overwrites that origin's leaderboard with sample data). `scripts/make-og.sh` re-renders `og.png` from `scripts/og.html`.
