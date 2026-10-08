import { DurableObject } from 'cloudflare:workers';

// Keep these in sync with index.html. The server recomputes ARR from ms and never trusts a client ARR.
const START_VALUE = 0.99;
const HALF_LIFE_MS = 250;
const RUNWAY_MS = 4000;
const HUMAN_FLOOR_MS = 100;
const SECONDS_PER_YEAR = 31_536_000;
const arrAt = ms => START_VALUE * Math.pow(0.5, ms / HALF_LIFE_MS) / (ms / 1000) * SECONDS_PER_YEAR;

const TOP_LIMIT = 100;
const RANK_CAP = 1000;          // ranks past this come back as null ("1000+") so a submit never scans the whole table
const SUBMITS_PER_MINUTE = 30;  // per IP; a real round takes a couple of seconds at minimum
const TOP_CACHE_MS = 10_000;
const PLAYER_RE = /^[A-Za-z0-9_-]{8,64}$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
});

function cleanCompany(s) {
  if (typeof s !== 'string') return '';
  const c = s.normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')  // control and format chars (zero-width, bidi overrides)
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(c).slice(0, 32).join('').trim();
}

const enc = s => new TextEncoder().encode(s);

// Rate limiting only needs a stable key per IP, not the IP itself.
async function ipKey(req) {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', enc('fastest-arr:' + ip));
  return [...new Uint8Array(digest).slice(0, 8)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function isAdmin(req, env) {
  if (!env.ADMIN_TOKEN) return false;
  const got = enc(req.headers.get('Authorization') || '');
  const want = enc('Bearer ' + env.ADMIN_TOKEN);
  return got.byteLength === want.byteLength && crypto.subtle.timingSafeEqual(got, want);
}

let topCache = null;  // { at, data }, per isolate

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const board = env.BOARD.get(env.BOARD.idFromName('global'));

    try {
      if (req.method === 'GET' && url.pathname === '/top') {
        if (!topCache || Date.now() - topCache.at > TOP_CACHE_MS) topCache = { at: Date.now(), data: await board.top(TOP_LIMIT) };
        return json(topCache.data);
      }

      if (req.method === 'GET' && url.pathname === '/me') {
        const player = url.searchParams.get('player') || '';
        if (!PLAYER_RE.test(player)) return json({ error: 'bad player' }, 400);
        return json({ me: await board.me(player, RANK_CAP) });
      }

      if (req.method === 'POST' && url.pathname === '/score') {
        const text = await req.text();
        if (text.length > 1024) return json({ error: 'too big' }, 413);
        let body;
        try { body = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400); }
        const player = body?.player;
        const ms = body?.ms;
        if (typeof player !== 'string' || !PLAYER_RE.test(player)) return json({ error: 'bad player' }, 400);
        if (typeof ms !== 'number' || !Number.isFinite(ms)) return json({ error: 'bad ms' }, 400);
        if (ms < HUMAN_FLOOR_MS) return json({ error: 'flagged by auditors' }, 422);
        if (ms >= RUNWAY_MS) return json({ error: 'dissolved' }, 422);
        const co = cleanCompany(body.co) || 'Stealth Startup';
        const result = await board.submit({
          player, co, ms, arr: arrAt(ms), ip: await ipKey(req),
          perMinute: SUBMITS_PER_MINUTE, rankCap: RANK_CAP, topLimit: TOP_LIMIT,
        });
        if (result.error) return json(result, 429);
        topCache = { at: Date.now(), data: { total: result.total, rows: result.rows } };
        return json(result);
      }

      if (req.method === 'POST' && url.pathname === '/admin/remove') {
        if (!isAdmin(req, env)) return json({ error: 'unauthorized' }, 401);
        const body = await req.json().catch(() => ({}));
        if (typeof body.co !== 'string' || !body.co) return json({ error: 'need co' }, 400);
        const removed = await board.remove(body.co);
        topCache = null;
        return json({ removed });
      }

      if (req.method === 'GET' && url.pathname === '/') return json({ name: 'fastest-arr', ok: true });
      return json({ error: 'not found' }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: 'server error' }, 500);
    }
  },
};

// The whole leaderboard: one row per player (their best run).
export class Board extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS scores (
      player TEXT PRIMARY KEY,
      co TEXT NOT NULL,
      ms REAL NOT NULL,
      arr REAL NOT NULL,
      at INTEGER NOT NULL
    )`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS scores_arr ON scores (arr DESC)');
    this.total = this.sql.exec('SELECT COUNT(*) AS n FROM scores').one().n;
    this.hits = new Map();  // ipKey -> { minute, n }; memory only, resets when the object sleeps
  }

  top(limit) {
    const rows = this.sql.exec('SELECT co, arr, ms FROM scores ORDER BY arr DESC, at ASC LIMIT ?', limit).toArray();
    return { total: this.total, rows };
  }

  rankOf(arr, cap) {
    const n = this.sql.exec('SELECT COUNT(*) AS n FROM (SELECT 1 FROM scores WHERE arr > ? LIMIT ?)', arr, cap).one().n;
    return n >= cap ? null : n + 1;
  }

  me(player, cap) {
    const row = this.sql.exec('SELECT co, arr, ms FROM scores WHERE player = ?', player).toArray()[0];
    return row ? { ...row, rank: this.rankOf(row.arr, cap) } : null;
  }

  submit({ player, co, ms, arr, ip, perMinute, rankCap, topLimit }) {
    const minute = Math.floor(Date.now() / 60000);
    const hit = this.hits.get(ip);
    if (hit && hit.minute === minute) {
      if (++hit.n > perMinute) return { error: 'slow down' };
    } else {
      if (this.hits.size > 5000) for (const [k, v] of this.hits) if (v.minute !== minute) this.hits.delete(k);
      this.hits.set(ip, { minute, n: 1 });
    }

    const prev = this.sql.exec('SELECT arr FROM scores WHERE player = ?', player).toArray()[0];
    let best = false;
    if (!prev) {
      this.sql.exec('INSERT INTO scores (player, co, ms, arr, at) VALUES (?, ?, ?, ?, ?)', player, co, ms, arr, Date.now());
      this.total++;
      best = true;
    } else if (arr > prev.arr) {
      this.sql.exec('UPDATE scores SET co = ?, ms = ?, arr = ?, at = ? WHERE player = ?', co, ms, arr, Date.now(), player);
      best = true;
    }
    const rank = this.rankOf(arr, rankCap);
    // the player's best, so the client needn't make a second /me call after every run
    const mine = best ? { co, arr, ms, rank } : this.me(player, rankCap);
    return { rank, best, arr, me: mine, ...this.top(topLimit) };
  }

  remove(co) {
    const removed = this.sql.exec('DELETE FROM scores WHERE co = ?', co).rowsWritten;
    this.total = this.sql.exec('SELECT COUNT(*) AS n FROM scores').one().n;
    return removed;
  }
}
