// Graphics quality presets + auto-downgrade governor. Pure (no DOM/three) so node tests can import it.
//   high = renderer DEFAULTS (keep render/index.js DEFAULTS in step: client/test/quality.test.js checks it).  `lights` isn't a preset key (the renderer doesn't read it).
//   pixelScale = render-target rows per art-pixel row: lower = fewer pixels to shade.
export const LEVELS = ['low', 'medium', 'high'];
// wind: 1 = base sway + full gusts, 0.5 = half amplitude, 0 = static (the shader skips the sway maths).
// low = "potato": fewer shaded pixels (pixelScale), no tilt-shift DoF / water SSR / light scatter, 3-mip bloom, no clutter / ambient / shadows / rim / wind.
export const PRESETS = {
  low: { pixelScale: 1.25, bloom: true, bloomStrength: 0.9, bloomLevels: 3, shadows: false, particles: 0.35, ambient: false, clutter: false, outlines: true, rim: false, wind: 0, dof: false, ssr: false, rays: false },
  medium: { pixelScale: 2, bloom: true, bloomStrength: 0.9, bloomLevels: 5, shadows: false, particles: 0.75, ambient: true, clutter: true, outlines: true, rim: true, wind: 0.5, dof: true, ssr: true, rays: true },
  high: { pixelScale: 2, bloom: true, bloomStrength: 0.9, bloomLevels: 5, shadows: true, particles: 1, ambient: true, clutter: true, outlines: true, rim: true, wind: 1, dof: true, ssr: true, rays: true },
};
export const LABEL = { low: 'Low', medium: 'Medium', high: 'High' };
export const STORE_KEY = 'p2d.gfx';

export const presetSettings = (level) => ({ ...(PRESETS[level] || PRESETS.high) });
export function applyQuality(renderer, level) {
  const s = presetSettings(level);
  for (const k of Object.keys(s)) renderer.setSetting(k, s[k]);
  return s;
}

export const isMobileUA = (nav = typeof navigator !== 'undefined' ? navigator : {}) =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '') || (/Macintosh/.test(nav.userAgent || '') && (nav.maxTouchPoints || 0) > 1);   // iPadOS reports as a Mac
export const defaultLevel = (nav) => (isMobileUA(nav) ? 'low' : 'high');

export function loadLevel(nav) {
  try { const v = localStorage.getItem(STORE_KEY); if (LEVELS.includes(v)) return v; } catch { /* storage off */ }
  return defaultLevel(nav);
}
export function saveLevel(level) { try { localStorage.setItem(STORE_KEY, level); } catch { /* storage off */ } }

/**
 * Rolling-median FPS watchdog. feed(dtMs, nowMs) once per frame; onDrop() fires when the median fps over `windowMs` stays below `minFps`,
 * then the window restarts (so it can fire again 10 s later). The first `warmupMs` and any gap > `gapMs` (hidden tab, long stall) are ignored.
 */
export function createFpsGovernor({ onDrop, minFps = 40, windowMs = 10000, warmupMs = 5000, gapMs = 1000 } = {}) {
  let t0 = -1, ws = [], from = -1;   // ws: dt samples of the current window; from: window start time
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  const api = {
    feed(dtMs, nowMs) {
      if (t0 < 0) t0 = nowMs;
      if (nowMs - t0 < warmupMs) return;
      if (!(dtMs > 0) || dtMs > gapMs) { ws = []; from = -1; return; }
      if (from < 0) from = nowMs - dtMs;
      ws.push(dtMs);
      if (nowMs - from >= windowMs) {
        const fps = 1000 / median(ws);
        ws = []; from = nowMs;
        if (fps < minFps && onDrop) onDrop(fps);
      }
    },
    /** restart warm-up (level changed by hand: old samples don't apply) */
    reset(nowMs) { t0 = nowMs == null ? -1 : nowMs; ws = []; from = -1; },
  };
  return api;
}
