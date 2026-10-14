// Per-frame point lights: add() during the frame, finalize() sorts by contribution, caps at 32 and writes the shared uniforms.
// Public API (also handed to fx): add({x,y,z,r,g,b,radius,intensity,flicker}) in WORLD coords (x east, y north, z up).
import { MAX_LIGHTS, MAX_PS, SPELL_GAIN, SPELL_REACH } from './shaderlib.js';
import { createBeams } from './beams.js';
import { getMap, heightAt, TT } from '../../../shared/map.js';

// ground albedo per tile type for the bounce light (shaderlib pointLights): what colour a spell light picks up off the floor under it
const ALB = { [TT.GRASS]: [0.3, 0.38, 0.16], [TT.TREE]: [0.18, 0.28, 0.12], [TT.WALL]: [0.36, 0.34, 0.3], [TT.ROAD]: [0.46, 0.36, 0.24], [TT.WATER]: [0.14, 0.3, 0.34] };
const ALB0 = [0.3, 0.3, 0.26];
let map = null;
function albedoAt(x, y) {
  if (!map) map = getMap();
  const tx = Math.floor((x - map.x0) / map.tile), ty = Math.floor((map.y1 - y) / map.tile);
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return ALB0;
  return ALB[map.type[ty * map.w + tx]] || ALB0;
}

export const CAP = MAX_LIGHTS;

/** Pure: pick the best `cap` lights for a view centre (cx, cy). Score = intensity * radius / (1 + dist/1000): linear in radius so wide
 *  telegraph rings don't crowd out the small bright cores where the particles are. */
export function selectLights(list, cx, cy, cap = CAP) {
  const sc = list.map((l) => {
    const d = Math.hypot(l.x - cx, l.y - cy);
    return { l, s: (l.intensity * l.radius) / (1 + d / 1000) };
  });
  sc.sort((a, b) => b.s - a.s);
  return sc.slice(0, cap).map((e) => e.l);
}

export function createLights(uniforms, scene) {
  const list = [];
  const beams = scene ? createBeams(scene, uniforms) : null;     // volumetric shafts, drawn into the scene target (beams.js)
  let spells = 0, n = 0, cx = 0, cy = 0, viewR = 2600;
  const shadowLights = [], cand = [];
  let cap = CAP, maxPS = MAX_PS;   // quality: light pool size / cube-shadowed spell lights (setMax / setMaxShadow)
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
    /** light pool size (1..32) and how many spell lights get a cube shadow (0..10) */
    setMax(n) { cap = Math.max(1, Math.min(CAP, n | 0)); },
    setMaxShadow(n) { maxPS = Math.max(0, Math.min(MAX_PS, n | 0)); },
    setView(x, y, r) { cx = x; cy = y; if (r) viewR = r; },
    /** sort + cap + upload. t = seconds (flicker). Lights farther than viewR + radius from the view centre are dropped first. */
    finalize(t) {
      const vis = list.filter((l) => Math.hypot(l.x - cx, l.y - cy) < viewR + l.radius);
      const sel = selectLights(vis, cx, cy, cap);
      const P = uniforms.uLP.value, C = uniforms.uLC.value, B = uniforms.uLB ? uniforms.uLB.value : null;
      spells = 0;
      for (let i = 0; i < sel.length; i++) {
        const l = sel[i];
        let f = 1;
        if (l.flicker > 0) {
          const ph = (l.x * 0.013 + l.y * 0.007);
          f = 1 - l.flicker * (0.5 + 0.5 * Math.sin(t * 17.3 + ph) * Math.sin(t * 7.1 + ph * 2.3));
        }
        P[i * 4] = l.x; P[i * 4 + 1] = l.z; P[i * 4 + 2] = -l.y; P[i * 4 + 3] = l.radius;
        C[i * 4] = l.r * l.intensity * f; C[i * 4 + 1] = l.g * l.intensity * f; C[i * 4 + 2] = l.b * l.intensity * f; C[i * 4 + 3] = l.cast ? 1 + SPELL_GAIN : 1;   // .w: falloff kind + surface gain (shaderlib lightFall)
        if (l.cast) {
          spells++;
          if (B) { const a = albedoAt(l.x, l.y), k = l.intensity * f; B[i * 4] = l.r * k * a[0]; B[i * 4 + 1] = l.g * k * a[1]; B[i * 4 + 2] = l.b * k * a[2]; B[i * 4 + 3] = heightAt(l.x, l.y) + 8; }
        }
      }
      n = sel.length; uniforms.uLN.value = n;
      // the MAX_PS strongest casting (spell) lights get cube shadows (atlas row k); the rest use the height field (shaderlib hfShadow).
      // The shadow weight follows each light's intensity, so shadows fade in/out with the light instead of popping at the 0.12 gate.
      const S = uniforms.uPSS.value, L = uniforms.uPSL.value;
      S.fill(0); shadowLights.length = 0; cand.length = 0;
      for (let i = 0; i < n; i++) { const l = sel[i]; if (l.cast && l.intensity >= 0.12) cand.push(i); }
      if (cand.length > maxPS) cand.sort((a, b) => sel[b].intensity * sel[b].radius ** 2 - sel[a].intensity * sel[a].radius ** 2);
      for (const i of cand) {
        if (shadowLights.length >= maxPS) break;
        const l = sel[i], k = Math.min(1, (l.intensity - 0.12) / 0.6), w = k * k * (3 - 2 * k);
        if (w < 0.1) continue;   // too faint to see: skip its 5-face depth pass
        const slot = shadowLights.length;
        S[i] = slot + 1; L[slot * 4] = Math.max(60, l.radius * SPELL_REACH); L[slot * 4 + 1] = w;
        shadowLights.push(l);
      }
      if (beams) beams.update(sel, C, uniforms.uNight.value);
      return sel;
    },
    beams,
    /** lights with a cube shadow this frame (world coords), atlas row = array index */
    get shadowLights() { return shadowLights; },
    get count() { return n; },
    /** spell (cast) lights uploaded this frame */
    get spellCount() { return spells; },
    get pending() { return list.length; },
  };
}
