// Time of day from the game clock (pure, no THREE). The server only flips a boolean (night = floor(time / DAY_LEN) odd); the sky, haze and key light
// read a continuous clock around each flip instead: golden hour on the day side just before / after it, a dusk / dawn twilight straddling it,
// night sky beyond. Same palette in normal play and the showcase (the showcase only adds the far horizon mist that blends the map edge into the sky).
import { DAY_LEN } from '../../../shared/constants.js';

export const TWI = 45;   // seconds: the sky turns over +-TWI around the day / night flip (golden hour ~ TWI before sunset / after sunrise)

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bump = (x, c, w) => { const t = 1 - ((x - c) / w) ** 2; return t > 0 ? t * t : 0; };
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** Clock -> { s, n, golden, twi, morning }. s = signed seconds to the nearest flip (night side +), n = sky night 0..1, golden / twi = 0..1 bumps,
 *  morning = the flip in question is night -> day. Pregame, the first half day (0:00 is no sunrise) or no clock: plain day / night (the flag). */
export function timeOfDay(time, night) {
  if (!(time >= DAY_LEN / 2)) { const n = night ? 1 : 0; return { s: night ? 1e3 : -1e3, n, golden: 0, twi: 0, morning: false }; }
  const m = time % DAY_LEN, after = m < DAY_LEN / 2, s = (night ? 1 : -1) * Math.min(m, DAY_LEN - m);
  return { s, n: sstep(-TWI, TWI, s), golden: bump(s, -0.5 * TWI, 0.6 * TWI), twi: bump(s, 0.2 * TWI, 0.55 * TWI), morning: after !== !!night };
}

// palettes (linear, the post pipeline's units): day / night = the old fixed showcase sky; golden / twilight per evening (e) and morning (m)
const P = {
  day: { hor: [0.5, 0.66, 0.88], zen: [0.15, 0.37, 0.8], body: [1, 0.86, 0.6], cloud: [0.42, 0.54, 0.78], glow: [0.05, 0.03, 0], haze: [0.09, 0.19, 0.19], water: [0.17, 0.31, 0.33] },
  night: { hor: [0.07, 0.09, 0.17], zen: [0.02, 0.03, 0.09], body: [0.74, 0.82, 1], cloud: [0.04, 0.04, 0.04], glow: [0, 0, 0], haze: [0.03, 0.08, 0.1], water: [0.04, 0.09, 0.15] },
  goldE: { hor: [0.84, 0.6, 0.38], zen: [0.24, 0.34, 0.62], body: [1, 0.64, 0.3], cloud: [0.62, 0.46, 0.38], glow: [0.16, 0.07, 0], haze: [0.17, 0.15, 0.1], water: [0.34, 0.27, 0.2] },
  goldM: { hor: [0.82, 0.66, 0.5], zen: [0.28, 0.4, 0.7], body: [1, 0.74, 0.44], cloud: [0.6, 0.5, 0.48], glow: [0.13, 0.07, 0.02], haze: [0.15, 0.15, 0.12], water: [0.3, 0.28, 0.24] },
  twiE: { hor: [0.44, 0.24, 0.26], zen: [0.09, 0.1, 0.25], body: [1, 0.48, 0.28], cloud: [0.3, 0.18, 0.24], glow: [0.14, 0.04, 0.02], haze: [0.1, 0.08, 0.11], water: [0.16, 0.11, 0.15] },
  twiM: { hor: [0.5, 0.34, 0.4], zen: [0.11, 0.14, 0.32], body: [1, 0.6, 0.45], cloud: [0.34, 0.24, 0.32], glow: [0.12, 0.05, 0.05], haze: [0.1, 0.09, 0.12], water: [0.17, 0.13, 0.17] },
};
const KEYS = ['hor', 'zen', 'body', 'cloud', 'glow', 'haze', 'water'];
export const SUN_ELEV = 0.13;   // showcase camera sees only ~+5..+14 deg of sky: the sun / moon keep the key light azimuth and sit this low at most (sin of the elevation)

/** Time of day -> sky / haze colours + sun. warm = golden-hour strength for this quality tier (High / Ultra 1, Low / Medium a cheaper 0.4).
 *  body = sun or moon colour, bodyK = its disc / glow visibility (0 below the horizon), elev = its elevation (sin). */
export function skyPalette(tod, warm = 1) {
  const g = tod.golden * warm, t = tod.twi * warm, gp = tod.morning ? P.goldM : P.goldE, tp = tod.morning ? P.twiM : P.twiE;
  const out = {};
  for (const k of KEYS) {
    let c = lerp3(P.day[k], P.night[k], tod.n);
    c = lerp3(c, gp[k], g * 0.85);
    c = lerp3(c, tp[k], t * 0.8);
    out[k] = c;
  }
  // sun sinks below the horizon across the flip, the moon rises after it (and the reverse in the morning: s is symmetric)
  const s = tod.s, sun = s < 0.25 * TWI;
  const elev = sun ? SUN_ELEV - 0.17 * sstep(-1.1 * TWI, 0.25 * TWI, s) : -0.04 + 0.17 * sstep(0.25 * TWI, TWI, s);
  out.body = sun ? lerp3(lerp3(P.day.body, gp.body, g), tp.body, t * 0.9) : P.night.body;
  out.n = tod.n;
  out.bodyK = sstep(-0.04, 0.03, elev);
  out.elev = elev;
  out.sunN = sun ? 0 : 1;   // body is the moon (night look of the disc / glow)
  if (Math.abs(s) >= TWI) { out.body = lerp3(P.day.body, P.night.body, tod.n); out.sunN = tod.n; out.elev = SUN_ELEV; out.bodyK = 1; }   // far from a flip: follow n (a flag toggled off-clock fades, no pop)
  return out;
}

/** Golden-hour key / rim light on top of the day-night mix: warm key, long warm rim (lower rim angle), lower key elevation. full = High / Ultra. */
export function goldenLight(tod, full) {
  const g = tod.golden * (full ? 1 : 0.4), w = full ? g : 0;
  return {
    key: [1 + 0.16 * g, 1 - 0.06 * g, 1 - 0.3 * g],    // multiplies the key colour
    rim: [1 + 0.4 * w, 1 + 0.06 * w, 1 - 0.25 * w],    // multiplies the rim colour (longer, warmer rim on High / Ultra)
    amb: [1 + 0.02 * g, 1 - 0.02 * g, 1 - 0.08 * g],   // ambient leans warm a touch
    keyY: 1 - 0.4 * w,                                  // key elevation scale (low sun)
    rimY: 1 - 0.25 * w,                                 // sprite rim direction y (lower = longer rim along the silhouette)
  };
}
