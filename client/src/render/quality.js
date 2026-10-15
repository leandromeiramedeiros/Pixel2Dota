// Graphics quality: presets (fidelity), user options (resolution / fps / bloom / dof / vsync), per-level option bundles, hardware detection, frame-cap helper, FPS governor.
// Pure (no DOM/three at import) so node tests can import it.
//   Preset = what is drawn (shadows, lights, particles, post passes, clutter, view distance, MSAA ...). ultra = renderer DEFAULTS (render/index.js; client/test/quality.test.js checks it).
//   Options = user choices the preset never touches: resolution (render-target pixel count), fps cap (0 = MAX), bloom on/off, depth of field on/off, vsync.
//   Picking a level applies its preset AND its LEVEL_OPTIONS bundle; single options may then be changed on top (stored as overrides).
//   detectDefaults(info) picks the first-run level (and so its bundle) from the hardware; the menu DEFAULTS button restores it.
export const LEVELS = ['low', 'medium', 'high', 'ultra'];
// Every key is a renderer setting. Numbers are multipliers / counts, booleans switch a pass.
//   atmos: showcase sky tier (0 flat distance fog + sun / stars, 1 volumetric mist + clouds, 2 denser mist, scattering, more cloud steps, 3 densest / most steps)
//   shadows: key-light map + marched height-field for the spell lights (false = no shadows at all)   shadowPoints: spell lights with a real cube shadow (5 depth renders each)
//   maxLights: dynamic light pool   particles / ambient / clutter: density multipliers (0 = off)   wind: 1 full / .5 half / 0 static   bloomLevels: bloom mips (5 = full)
//   drawDist: world units trees / clutter / terrain / far plane reach   msaa: scene target samples (0 = off)
// medium = one notch down everywhere it costs (2 cube shadows, 16 lights, no water SSR, 60% particles, half clutter / ambient, half wind, shorter view);
// low = potato: no shadows / rim / SSR / light scatter / ambient / clutter / wind, 8 lights, 30% particles, 3 bloom mips, short view. Outlines stay on.
// high = full look at 4 cube shadows; ultra = 10 cube shadows, densest atmosphere, longest view, 2x MSAA.
export const PRESETS = {
  low: { bloomStrength: 0.9, bloomLevels: 3, shadows: false, shadowPoints: 0, maxLights: 8, particles: 0.3, ambient: 0, clutter: 0, outlines: true, rim: false, wind: 0, ssr: false, rays: false, atmos: 0, drawDist: 2400, msaa: 0 },
  medium: { bloomStrength: 0.9, bloomLevels: 4, shadows: true, shadowPoints: 2, maxLights: 16, particles: 0.6, ambient: 0.5, clutter: 0.5, outlines: true, rim: true, wind: 0.5, ssr: false, rays: true, atmos: 1, drawDist: 3600, msaa: 0 },
  high: { bloomStrength: 0.9, bloomLevels: 5, shadows: true, shadowPoints: 4, maxLights: 24, particles: 1, ambient: 1, clutter: 1, outlines: true, rim: true, wind: 1, ssr: true, rays: true, atmos: 2, drawDist: 5500, msaa: 0 },
  ultra: { bloomStrength: 0.9, bloomLevels: 5, shadows: true, shadowPoints: 10, maxLights: 32, particles: 1, ambient: 1, clutter: 1, outlines: true, rim: true, wind: 1, ssr: true, rays: true, atmos: 3, drawDist: 9000, msaa: 2 },
};
export const LABEL = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' };
export const STORE_KEY = 'p2d.gfx';          // preset level
export const OPTIONS_KEY = 'p2d.gfx.opts';   // JSON of the options the user changed by hand on top of the level's bundle

export const presetSettings = (level) => ({ ...(PRESETS[level] || PRESETS.high) });
export function applyQuality(renderer, level) {
  const s = presetSettings(level);
  for (const k of Object.keys(s)) renderer.setSetting(k, s[k]);
  return s;
}

// ---- user options -----------------------------------------------------------------------------------------------------------------------
// pixelScale = render-target rows per art-pixel row (2 at native). Pixel count goes with its square: 1/2 res = sqrt(2) -> half the pixels, 1/4 = 1 -> quarter.
export const RESOLUTIONS = ['quarter', 'half', 'native'];
export const RES_LABEL = { quarter: '1/4', half: '1/2', native: 'NATIVE' };
export const RES_SCALE = { quarter: 1, half: Math.SQRT2, native: 2 };
export const FPS_CAPS = [30, 60, 120, 144, 165, 0];   // 0 = MAX: display refresh (vsync on: every rAF callback; vsync off: paced at the measured refresh, else 240)
export const fpsLabel = (f) => (f ? String(f) : 'MAX');
export const OPTION_KEYS = ['resolution', 'fps', 'bloom', 'dof', 'vsync'];
export const OPTION_DEFAULTS = { resolution: 'native', fps: 60, bloom: true, dof: false, vsync: true };
// What choosing a level sets besides the preset (the user may still change single options afterwards).
export const LEVEL_OPTIONS = {
  low: { resolution: 'quarter', fps: 30, bloom: false, dof: false, vsync: true },    // potato PC / phone, integrated graphics
  medium: { resolution: 'half', fps: 60, bloom: false, dof: false, vsync: true },    // potato with a better GPU
  high: { resolution: 'native', fps: 60, bloom: true, dof: false, vsync: true },     // good PC, last-gen phone
  ultra: { resolution: 'native', fps: 0, bloom: true, dof: true, vsync: true },      // high-end PC, latest phone: display refresh
};
export const levelOptions = (level) => ({ ...(LEVEL_OPTIONS[level] || LEVEL_OPTIONS.high) });

export const resolutionScale = (res) => RES_SCALE[res] || RES_SCALE.native;
/** keep only valid option values (anything else falls back to `base`) */
export function normalizeOptions(o, base = OPTION_DEFAULTS) {
  o = o || {};
  return {
    resolution: RESOLUTIONS.includes(o.resolution) ? o.resolution : base.resolution,
    fps: FPS_CAPS.includes(o.fps) ? o.fps : base.fps,
    bloom: typeof o.bloom === 'boolean' ? o.bloom : base.bloom,
    dof: typeof o.dof === 'boolean' ? o.dof : base.dof,
    vsync: typeof o.vsync === 'boolean' ? o.vsync : base.vsync,
  };
}
/** renderer settings behind the options (fps / vsync live in the frame loop, not the renderer) */
export const optionSettings = (opts) => ({ pixelScale: resolutionScale(opts.resolution), bloom: !!opts.bloom, dof: !!opts.dof });
export function applyOptions(renderer, opts) {
  const s = optionSettings(opts);
  for (const k of Object.keys(s)) renderer.setSetting(k, s[k]);
  return s;
}

// ---- persistence ------------------------------------------------------------------------------------------------------------------------
export function loadLevel(fallback = 'high') {
  try { const v = localStorage.getItem(STORE_KEY); if (LEVELS.includes(v)) return v; } catch { /* storage off */ }
  return fallback;
}
export function saveLevel(level) { try { localStorage.setItem(STORE_KEY, level); } catch { /* storage off */ } }
/** the options the user changed by hand: only valid keys, e.g. { fps: 30 } */
export function loadOptions() {
  try {
    const o = JSON.parse(localStorage.getItem(OPTIONS_KEY) || '{}'), out = {}, n = normalizeOptions(o, {});
    for (const k of OPTION_KEYS) if (n[k] !== undefined) out[k] = n[k];
    return out;
  } catch { return {}; }
}
export function saveOption(key, value) {
  try { localStorage.setItem(OPTIONS_KEY, JSON.stringify({ ...loadOptions(), [key]: value })); } catch { /* storage off */ }
}
/** a level was picked: its bundle replaces whatever options were overridden before */
export function clearOptions() { try { localStorage.removeItem(OPTIONS_KEY); } catch { /* storage off */ } }
/** DEFAULTS button: forget every manual choice (preset + options) so detection decides again */
export function clearStored() { try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(OPTIONS_KEY); } catch { /* storage off */ } }

// ---- hardware detection -----------------------------------------------------------------------------------------------------------------
export const isMobileUA = (nav = typeof navigator !== 'undefined' ? navigator : {}) =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '') || (/Macintosh/.test(nav.userAgent || '') && (nav.maxTouchPoints || 0) > 1);   // iPadOS reports as a Mac

/** Intel integrated: HD 2000-4600 / Iris 5100-6100 / bare "HD Graphics" are old (weak); HD 5xx-6xx, UHD, Iris Plus / Xe are mid; Arc is strong. */
function classifyIntel(s) {
  if (/\bArc\b/i.test(s)) return 'strong';
  if (/UHD|Iris.*(Plus|Xe)|Xe\b/i.test(s)) return 'mid';
  const m = /HD Graphics\s*(?:P)?(\d{3,4})?/i.exec(s);
  if (m) { const n = +m[1] || 0; return n >= 500 && n < 1000 ? 'mid' : 'weak'; }
  return /Iris/i.test(s) || /GMA|Intel/i.test(s) ? 'weak' : 'unknown';
}
/**
 * 'software' | 'weak' | 'mid' | 'strong' | 'unknown' from the WEBGL_debug_renderer_info string (Chrome wraps it: "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 ...)").
 * iOS only says "Apple GPU": on a phone that is mid, on a desktop Mac it is an M-series (strong).
 */
export function classifyGpu(str, mobile = false) {
  const s = String(str || '');
  if (!s) return 'unknown';
  if (/swiftshader|llvmpipe|softpipe|microsoft basic render|software|\bwarp\b/i.test(s)) return 'software';
  if (/Mali-?T\d|Mali-?4\d\d|Mali-?G(3\d|5[0-6])\b|PowerVR|Adreno\D{0,8}[2-5]\d\d\b|Vivante|VideoCore|Tegra|Apple A(\d|1[01])\b/i.test(s)) return 'weak';
  if (/Radeon.*(HD ?[2-6]\d{3}|\bR[2-9]\b)|GeForce\s*(G|GT|GS)\s?\d{2,3}\b(?!\s*Ti)|GeForce\s*(8|9)\d00|GMA/i.test(s)) return 'weak';
  if (/Intel/i.test(s)) return classifyIntel(s);
  if (/Vega|Radeon\(TM\) Graphics|Radeon Graphics|GeForce MX/i.test(s)) return 'mid';
  if (/RTX|GTX|Quadro|TITAN|Radeon.*(\bRX\b|Pro\b|VII|R9)|Apple M\d|Immortalis|Adreno\D{0,8}[78]\d\d\b|Mali-?G(7\d|[89]\d\d?|7\d\d)\b/i.test(s)) return 'strong';
  if (/Adreno\D{0,8}6\d\d\b|Mali-?G(5[7-9]|6\d)\b|Apple A1[2-9]|Apple A2\d/i.test(s)) return 'mid';
  if (/Apple GPU/i.test(s)) return mobile ? 'mid' : 'strong';
  return 'unknown';
}

// tier -> level (the level's LEVEL_OPTIONS bundle supplies resolution / fps / bloom / dof / vsync). lowmid at the Low level keeps half resolution at 60 fps.
const TIER_LEVEL = { potato: 'low', lowmid: 'low', good: 'high', ultra: 'ultra' };
const ULTRA_GPU = /RTX\s*[345]0[6-9]0|Radeon.*\bRX\s*(6[789]\d\d|[79]\d{3})\b|Apple M\d+\s*(Pro|Max|Ultra)|Arc\W.*\bB\d{3}\b/i;   // high-end desktop GPUs
const FLAGSHIP_PHONE_GPU = /Adreno\D{0,8}(7[4-9]\d|8\d\d)\b|Immortalis|Mali-?G[79]\d\d\b/i;
/**
 * Pure: hardware facts -> { tier: 'potato' | 'lowmid' | 'good' | 'ultra', score, gpu, level, ...LEVEL_OPTIONS[level] }.
 *   info: { mobile, cores, memory (GB, navigator.deviceMemory, may be undefined), screenW, screenH, dpr, gpu (unmasked renderer string), refreshHz (measured, optional, informational) }
 * Score = GPU class + cores + memory (- phone, - huge screen on a weak GPU). Software / weak GPUs, or 2 cores / 2 GB, are potato (Low); mid GPUs and ordinary phones are
 * lowmid (Medium needs a decent score, else Low at half resolution, 60 fps); a strong desktop GPU is good (High); flagship phone GPUs may reach High too;
 * ultra = desktop + strong GPU matching a high-end model (RTX 3060+, RX 6700+, Apple M Pro/Max/Ultra, Arc B-series) + at least 8 cores.
 */
export function detectDefaults(info = {}) {
  const mobile = !!info.mobile, cores = info.cores > 0 ? info.cores : 4, mem = info.memory > 0 ? info.memory : 0;
  const gpu = classifyGpu(info.gpu, mobile);
  const pixels = (info.screenW || 0) * (info.screenH || 0) * (info.dpr || 1) ** 2;
  const gpuPts = { software: -10, weak: 0, unknown: 2, mid: 3, strong: 5 }[gpu];
  const cpuPts = cores <= 2 ? 0 : cores <= 4 ? 1 : cores <= 6 ? 2 : 3;
  const memPts = !mem ? 1 : mem <= 2 ? 0 : mem <= 4 ? 1 : 2;
  const score = gpuPts + cpuPts + memPts - (mobile ? 2 : 0) - (pixels > 6e6 && gpu !== 'strong' ? 1 : 0);
  let tier = score <= 3 ? 'potato' : score <= 7 ? 'lowmid' : 'good';
  if (gpu === 'software' || gpu === 'weak' || cores <= 2 || (mem && mem <= 2)) tier = 'potato';
  else if (tier === 'good' && (gpu !== 'strong' || (mobile && !FLAGSHIP_PHONE_GPU.test(String(info.gpu || ''))))) tier = 'lowmid';
  if (tier === 'good' && !mobile && cores >= 8 && ULTRA_GPU.test(String(info.gpu || ''))) tier = 'ultra';
  let level = TIER_LEVEL[tier];
  if (tier === 'lowmid' && score >= 7) level = 'medium';
  const out = { tier, score, gpu, level, ...levelOptions(level) };
  if (tier === 'lowmid' && level === 'low') { out.resolution = 'half'; out.fps = 60; }
  return out;
}

/** Collect the facts detectDefaults wants. Everything is injectable for tests; `gl` is a WebGL context to read the unmasked renderer from. */
export function gatherHardwareInfo({ nav = typeof navigator !== 'undefined' ? navigator : {}, scr = typeof screen !== 'undefined' ? screen : {}, dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, gl = null, refreshHz = 0 } = {}) {
  let gpu = '';
  try {
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String((ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl && gl.getParameter(gl.RENDERER)) || '');
  } catch { /* blocked / lost context */ }
  return { mobile: isMobileUA(nav), cores: nav.hardwareConcurrency || 0, memory: nav.deviceMemory || 0, screenW: scr.width || 0, screenH: scr.height || 0, dpr, gpu, refreshHz };
}

// ---- frame cap --------------------------------------------------------------------------------------------------------------------------
/**
 * Frame limiter for a rAF loop: tick(nowMs) returns the real milliseconds since the previous rendered frame when this callback should render, else 0.
 * An accumulator (not a timer) decides, so a 60 fps cap on a 60 Hz display renders every callback (the 10% tolerance absorbs rAF jitter) and a 30 cap
 * on 60 Hz renders every second one; 120 on a 60 Hz display simply renders every callback; fps 0 (MAX) renders every callback. The accumulator is clamped so a stall cannot cause a burst.
 */
export function createFrameCap(fps = 60) {
  const ivOf = (f) => (f > 0 ? 1000 / f : 0);   // fps 0 = uncapped: every callback renders
  let interval = ivOf(fps), acc = 0, last = -1, lastRender = -1;
  return {
    setFps(f) { interval = ivOf(f); acc = Math.min(acc, interval); },
    get interval() { return interval; },
    tick(now) {
      if (last < 0) { last = lastRender = now; return interval || 1000 / 60; }
      acc += now - last; last = now;
      if (acc < interval * 0.9) return 0;
      acc = Math.min(acc - interval, interval * 0.5);
      const dt = now - lastRender; lastRender = now;
      return dt;
    },
    /** forget timing (tab was hidden, loop restarted) */
    reset() { acc = 0; last = lastRender = -1; },
  };
}

/**
 * Rolling-median FPS watchdog. feed(dtMs, nowMs) once per frame; onDrop() fires when the median fps over `windowMs` stays below `minFps`,
 * then the window restarts (so it can fire again 10 s later). The first `warmupMs` and any gap > `gapMs` (hidden tab, long stall) are ignored.
 * setMinFps(): a user fps cap below the threshold (30) would otherwise read as "slow".
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
    /** threshold for a user fps cap: 70% of the cap, never above the default 40 (cap 0 = MAX counts as 60) */
    setCap(cap) { minFps = Math.min(40, (cap > 0 ? cap : 60) * 0.7); },
    get minFps() { return minFps; },
  };
  return api;
}
