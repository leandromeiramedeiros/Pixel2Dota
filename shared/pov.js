// Spectator "player perspective" wire contract (no DOM, no node-only APIs). Players send MSG.POV state (camera + selection + aim);
// the room relays it, plus every accepted order (humans AND bots), to spectator seats only. No gameplay effect.
//   state  {s, x, y, d, sel, tg?, ax?, ay?}   s = Player sid, x/y camera target, d camera distance, sel selected unit id, tg {k:'ability'|'item', s:slot} while aiming
//   order  {s, o:{t, x?, y?, id?, slot?, q?}}  o.t in POV_ORDERS
export const POV = { MIN_MS: 80, STALE_MS: 2500, D_MIN: 300, D_MAX: 2700, ORDERS_PER_S: 20, SEND_MS: 110, MAP: 9000 };
export const POV_ORDERS = new Set(['move', 'attack', 'amove', 'stop', 'hold', 'cast', 'item']);

const fin = (n) => typeof n === 'number' && Number.isFinite(n);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Validate + normalise a player's POV state message; null = drop. Whitelists fields. */
export function cleanPov(m) {
  if (!m || typeof m !== 'object') return null;
  if (!fin(m.x) || !fin(m.y) || !fin(m.d)) return null;
  const c = { x: Math.round(clamp(m.x, -POV.MAP, POV.MAP)), y: Math.round(clamp(m.y, -POV.MAP, POV.MAP)), d: Math.round(clamp(m.d, POV.D_MIN, POV.D_MAX)), sel: '' };
  if (typeof m.sel === 'string' && m.sel.length <= 32) c.sel = m.sel;
  const tg = m.tg;
  if (tg && typeof tg === 'object' && (tg.k === 'ability' || tg.k === 'item') && Number.isInteger(tg.s) && tg.s >= 0 && tg.s < 16) {
    c.tg = { k: tg.k, s: tg.s };
    if (fin(m.ax) && fin(m.ay)) { c.ax = Math.round(clamp(m.ax, -POV.MAP, POV.MAP)); c.ay = Math.round(clamp(m.ay, -POV.MAP, POV.MAP)); }
  }
  return c;
}

/** A sim-accepted order -> the compact event spectators see (null = not shown: learn / buy / sell / swap). */
export function povOrderEvent(o) {
  if (!o || typeof o !== 'object' || !POV_ORDERS.has(o.t)) return null;
  const e = { t: o.t };
  if (o.q) e.q = true;
  if (fin(o.x) && fin(o.y)) { e.x = Math.round(clamp(o.x, -POV.MAP, POV.MAP)); e.y = Math.round(clamp(o.y, -POV.MAP, POV.MAP)); }
  if (typeof o.id === 'string' && o.id && o.id.length <= 64) e.id = o.id;
  if (Number.isInteger(o.slot) && o.slot >= 0 && o.slot < 16) e.slot = o.slot;
  return e;
}

/** Per-sender throttle: state messages at most one per MIN_MS; orders as a token bucket (ORDERS_PER_S, burst 2x). `now` in ms. */
export function createPovGate(minMs = POV.MIN_MS, perSec = POV.ORDERS_PER_S) {
  const last = new Map(), bucket = new Map();
  return {
    state(key, now) {
      const t = last.get(key);
      if (t !== undefined && now - t < minMs) return false;
      last.set(key, now); return true;
    },
    order(key, now) {
      const b = bucket.get(key) || { tok: perSec * 2, t: now };
      b.tok = Math.min(perSec * 2, b.tok + ((now - b.t) / 1000) * perSec); b.t = now;
      bucket.set(key, b);
      if (b.tok < 1) return false;
      b.tok -= 1; return true;
    },
    forget(key) { last.delete(key); bucket.delete(key); },
  };
}
