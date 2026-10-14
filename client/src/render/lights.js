// Per-frame point lights: add() during the frame, finalize() sorts by contribution, caps at 32 and writes the shared uniforms.
// Public API (also handed to fx): add({x,y,z,r,g,b,radius,intensity,flicker}) in WORLD coords (x east, y north, z up).
import { MAX_LIGHTS } from './shaderlib.js';
import { createBeams } from './beams.js';

export const CAP = MAX_LIGHTS;

/** Pure: pick the best `cap` lights for a view centre (cx, cy). Score = intensity * radius^2 / (1 + dist/1000). */
export function selectLights(list, cx, cy, cap = CAP) {
  const sc = list.map((l) => {
    const d = Math.hypot(l.x - cx, l.y - cy);
    return { l, s: (l.intensity * l.radius * l.radius) / (1 + d / 1000) };
  });
  sc.sort((a, b) => b.s - a.s);
  return sc.slice(0, cap).map((e) => e.l);
}

export function createLights(uniforms, scene) {
  const list = [];
  const beams = scene ? createBeams(scene, uniforms) : null;     // volumetric shafts, drawn into the scene target (beams.js)
  let n = 0, cx = 0, cy = 0, viewR = 2600, shadowLight = null, px = 1e9, py = 1e9;
  return {
    /** call at the start of each frame */
    clear() { list.length = 0; n = 0; },
    add(l) {
      if (!l || !(l.radius > 0)) return;
      list.push({
        x: l.x, y: l.y, z: l.z == null ? 40 : l.z, r: l.r == null ? 1 : l.r, g: l.g == null ? 1 : l.g, b: l.b == null ? 1 : l.b,
        radius: l.radius, intensity: l.intensity == null ? 1 : l.intensity, flicker: l.flicker || 0, beam: l.beam, cast: !!l.cast,
      });
    },
    setView(x, y, r) { cx = x; cy = y; if (r) viewR = r; },
    /** sort + cap + upload. t = seconds (flicker). Lights farther than viewR + radius from the view centre are dropped first. */
    finalize(t) {
      const vis = list.filter((l) => Math.hypot(l.x - cx, l.y - cy) < viewR + l.radius);
      const sel = selectLights(vis, cx, cy, CAP);
      const P = uniforms.uLP.value, C = uniforms.uLC.value;
      for (let i = 0; i < sel.length; i++) {
        const l = sel[i];
        let f = 1;
        if (l.flicker > 0) {
          const ph = (l.x * 0.013 + l.y * 0.007);
          f = 1 - l.flicker * (0.5 + 0.5 * Math.sin(t * 17.3 + ph) * Math.sin(t * 7.1 + ph * 2.3));
        }
        P[i * 4] = l.x; P[i * 4 + 1] = l.z; P[i * 4 + 2] = -l.y; P[i * 4 + 3] = l.radius;
        C[i * 4] = l.r * l.intensity * f; C[i * 4 + 1] = l.g * l.intensity * f; C[i * 4 + 2] = l.b * l.intensity * f; C[i * 4 + 3] = 1;
      }
      n = sel.length; uniforms.uLN.value = n;
      // the strongest casting (spell) light gets the cube shadow; sticky to last frame's light so bursts do not flip it every frame
      let best = -1, bs = 0;
      for (let i = 0; i < n; i++) {
        const l = sel[i]; if (!l.cast || l.intensity < 0.12) continue;
        let s = l.intensity * l.radius * l.radius; if (Math.hypot(l.x - px, l.y - py) < 80) s *= 1.6;
        if (s > bs) { bs = s; best = i; }
      }
      uniforms.uPSIdx.value = best; shadowLight = best >= 0 ? sel[best] : null;
      // shadow weight follows the light's intensity, so it fades in/out with the light instead of popping at the selection gate
      const k = shadowLight ? Math.min(1, Math.max(0, (shadowLight.intensity - 0.12) / 0.6)) : 0;
      uniforms.uPSP.value.w = k * k * (3 - 2 * k);
      if (shadowLight) { px = shadowLight.x; py = shadowLight.y; } else { px = py = 1e9; }
      if (beams) beams.update(sel, C, uniforms.uNight.value);
      return sel;
    },
    beams,
    /** the light that casts the cube shadow this frame (world coords) or null */
    get shadowLight() { return shadowLight; },
    get count() { return n; },
    get pending() { return list.length; },
  };
}
