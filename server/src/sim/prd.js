// Pseudo-random distribution for % procs (Dota engine rule; the game files only give the nominal chance).
// The n-th roll since the last proc succeeds with chance min(1, C*n); C is solved so the long-run rate equals the nominal
// chance (30% -> C ~ 0.119, 25% -> 0.0847). Fewer streaks than a plain roll, same average. Seeded through w.rand().
const cache = new Map();

/** Long-run proc rate of constant C. */
function rateOf(C) {
  let expected = 0, miss = 1;
  for (let n = 1; miss > 0; n++) {
    const p = Math.min(1, n * C);
    expected += n * p * miss;
    miss *= 1 - p;
  }
  return 1 / expected;
}

/** PRD constant C for a nominal chance p (0..1). */
export function prdC(p) {
  if (cache.has(p)) return cache.get(p);
  let lo = 0, hi = p;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (rateOf(mid) < p) lo = mid; else hi = mid; }
  const C = (lo + hi) / 2;
  cache.set(p, C);
  return C;
}

/** One PRD roll for unit u's proc `key` at `pct` percent. The counter lives on u._prd[key]. */
export function prdRoll(w, u, key, pct) {
  if (!(pct > 0)) return false;
  if (pct >= 100) return true;
  const s = u._prd || (u._prd = {});
  const n = (s[key] || 0) + 1;
  if (w.rand() < prdC(pct / 100) * n) { s[key] = 0; return true; }
  s[key] = n;
  return false;
}
