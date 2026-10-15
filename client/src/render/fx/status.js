// Ambient status visuals (stun stars, hex, magic immunity, slow, invis, channel ...) and the Invoker orbs.
import { ST } from '../../../../shared/protocol.js';
import { PAL, ORB, elemMul, rnd, TAU } from './common.js';
import { LEAN_TO, LEAN_K } from '../voxactors.js';

const STUN_COL = [3.4, 2.8, 0.7];
const GOLD = PAL.gold;

export function register(c, R) {
  const P = c.P, Q = c.Q;
  const fStar = c.frame('p_star');
  const fDecalFrost = c.frame('decal_frost');
  const orbBuf = [0, 0, 0];

  // Orbs = real 3D geometry (fx/geo3d.js G.orb, GLOW): a small HDR core inside a fresnel shell, no billboard glow and no sprite quad.
  // Depth: voxel units write the depth of their FOOT (mesh3d propDepth), so the orbs use o.foot (depth of their own ground point): an orb
  // behind his foot is hidden by his whole silhouette (shell, core, glow), one in front is drawn whole; never chopped mid-body.
  // [file: particles/units/heroes/hero_invoker/invoker_{quas,wex,exort}_orb.vpcf_c] sphere r 16, light r 130, beam_jagged rope trail.
  // Ring: flat, shoulder height, R0 outside the head / shoulder silhouette, so from the low showcase orbit the near half passes over the
  // chest (below the chin) and the far half behind the head; from the 60 deg game camera the ring reads as an ellipse round the body.
  const ORB_LOOK = {   // shells stay < 1.4 (no bloom), cores just over (a touch of bloom, no blob); colours from the orb vpcfs, tuned to the Invoker palette
    Q: { shell: [0.16, 0.42, 0.8], core: [0.75, 1.3, 1.65], lump: 0, fill: 0.5 },
    W: { shell: [0.5, 0.2, 0.62], core: [1.4, 0.8, 1.65], lump: 0.18, fill: 0.42 },
    E: { shell: [0.85, 0.36, 0.07], core: [1.65, 0.95, 0.35], lump: 0.24, fill: 0.45 },
  };
  const R0 = 52, ORB_R = 6.5, CORE_R = 3.2;
  const oShell = { lump: 0, seed: 0, p2: 0.5, yaw: 0, roll: 0, foot: 0 }, oCore = { p2: 1, foot: 0 };
  function orbs(u, dt) {
    const s = u.orbs; if (!s) return;
    const n = Math.min(3, s.length); if (!n) return;
    const alive = !(u.status & ST.DEAD) && u.hp > 0; if (!alive) return;
    const G = c.G;
    // camera direction in the ground plane (three: X = x, Z = -y): which half of the ring is near (particles use real depth, see below)
    const cp = c.uniforms && c.uniforms.uCamPos ? c.uniforms.uCamPos.value : null;
    const z0 = u.z || 0, zc = c.chest(u) + 4 + Math.sin(c.T * 2) * 2;   // shoulder height
    let vx = 0, vy = -1, lc = 1, ls = 0;
    if (cp) {
      const dx = cp.x - u.x, dy = -cp.z - u.y, l = Math.hypot(dx, dy);
      if (l > 1) { vx = dx / l; vy = dy / l; }
      // follow the voxel lean (voxactors.js): the body tilts back about its feet so the camera sees it from LEAN_TO; the ring tilts with it,
      // so from the 60 deg game camera the orbs sit round the chest as in the showcase (not at the knees in front, hidden above the head behind)
      const th = Math.max(0, Math.atan2(cp.y - z0, l) - LEAN_TO) * LEAN_K; lc = Math.cos(th); ls = Math.sin(th);
    }
    const hz = zc - z0;
    oShell.foot = oCore.foot = z0;
    const ph = c.T * 1.8;
    for (let i = 0; i < n; i++) {
      const ch = s[i] === 'q' || s[i] === 'w' || s[i] === 'e' ? s[i].toUpperCase() : s[i];
      const o = ORB[ch], L = ORB_LOOK[ch]; if (!o || !L) continue;
      const a = ph + i * (TAU / 3), ca = Math.cos(a), sa = Math.sin(a);
      const near = ca * vx + sa * vy, aw = -near * R0, aw2 = aw * lc + hz * ls - aw;   // near: +1 = toward the camera; aw = offset away from it
      const ox = u.x + ca * R0 - vx * aw2, oy = u.y + sa * R0 - vy * aw2, oz = z0 + hz * lc - aw * ls;
      oShell.footPull = oCore.footPull = 8 + hz * ls;   // depth as before the lean (the body's depth ignores its lean too)
      const mul = elemMul(ch, c.T, i * 7.3 + u.id.length);
      // body: core + shell; W re-seeds its lumps on every strobe, E boils at ~12 Hz, Q stays a smooth sphere
      const seed = ch === 'E' ? ((c.T * 12) | 0) + i * 17 : ch === 'W' ? (mul > 1 ? ((c.T * 30) | 0) : 3) + i * 17 : i;
      oShell.lump = L.lump; oShell.seed = seed; oShell.p2 = L.fill; oShell.yaw = c.T * 2 + i; oShell.roll = c.T * 1.3;
      const k = ch === 'W' ? (mul > 1 ? 1.15 : 0.8) : mul;
      G.orb(ox, oy, oz, CORE_R, L.core, 0.85 + 0.15 * k, G.GLOW, oCore);
      G.orb(ox, oy, oz, ORB_R, L.shell, k, G.GLOW, oShell);
      // per-orb light (trainer behaviour: E flickers, W strobes, Q steady): tints its own side of him and the ground
      c.lightNow(ox, oy, oz, o.lt, ch === 'E' ? 130 : 120, 0.45 * mul, 0);
      // pixels use real depth (they would show through him from behind): only the near half emits. Few, short, no cold ramp steps
      // (a cooled grey / dark-red art pixel left hanging reads as a big square from the close showcase camera)
      if (near < -0.1) continue;
      if (ch === 'E') { for (let nn = c.n(14 * dt); nn > 0; nn--) P.spawn(c.pix(o.pal, { x: ox + rnd(-2, 2), y: oy + rnd(-2, 2), z: oz + 4, ramp: null, col0: L.core, col1: L.shell, life: [0.15, 0.3], px: 1, speed: [0, 6], up: [40, 70], settle: false })); }
      else if (ch === 'W' && mul > 1) { for (let nn = c.n(16 * dt); nn > 0; nn--) P.spawn(c.pix(o.pal, { x: ox, y: oy, z: oz, ramp: null, col0: L.core, col1: L.shell, life: [0.08, 0.16], px: 1, speed: [60, 120], shape: 'sphere', drag: 1.2, settle: false })); }
      // orbit trail: 3 single pixels in the shell colour (no HDR) along the ring, one frame each, so the circling reads in a still frame
      for (let t = 1; t <= 3; t++) {
        const b = a - t * 0.2, cb = Math.cos(b), sb = Math.sin(b);
        const nb = cb * vx + sb * vy; if (nb < -0.1) break;
        const ab = -nb * R0, ab2 = ab * lc + hz * ls - ab;
        P.spawn(c.pix(o.pal, { x: u.x + cb * R0 - vx * ab2, y: u.y + sb * R0 - vy * ab2, z: z0 + hz * lc - ab * ls, ramp: null, col0: L.shell, life: 0.016, px: 1, a0: 0.75 - t * 0.2, a1: 0, speed: 0, settle: false, keep: true }));
      }
    }
  }

  const _t = { x: 0, y: 0 };
  function each(c2, dt, view) {
    const us = view && view.units; if (!us) return;
    const tg = c.args.target ? c.args.target() : null, vw = c.args.visW ? c.args.visW() * 0.75 : 1e9;
    const T = c.T;
    for (let i = 0; i < us.length; i++) {
      const u = us[i];
      if (u.visible === false) continue;
      if (tg) { const dx = u.x - tg.x, dy = u.y - tg.y; if (dx * dx + dy * dy > vw * vw) continue; }
      if (!c.vis(u.x, u.y)) continue;
      if (u.orbs) orbs(u, dt);
      const st = u.status | 0;
      if (!st) continue;
      if (st & ST.DEAD || u.hp <= 0) continue;
      const hero = u.kind === 'hero', z0 = u.z || 0, hd = c.head(u);
      if (st & ST.STUN) {
        if (fStar) for (let k = 0; k < 3; k++) {
          const a = T * 4.5 + k * (TAU / 3);
          Q.put(u.x + Math.cos(a) * 20, u.y + Math.sin(a) * 14, hd + 12 + Math.sin(a * 2 + k) * 3, fStar, 1.15, STUN_COL[0], STUN_COL[1], STUN_COL[2], 1, 3, 0, 0, 0, T * 3 + k, false, 1.2);
        }
        for (let n = c.n(30 * dt); n > 0; n--) P.spawn(c.pix(GOLD, { x: u.x + rnd(-14, 14), y: u.y + rnd(-10, 10), z: hd + 8, life: [0.3, 0.6], speed: 0, up: [10, 30], settle: false }));
      }
      if (st & ST.HEX) {
        const n = c.n(50 * dt);
        for (let k = 0; k < n; k++) P.spawn(c.pix(PAL.green, { x: u.x + rnd(-18, 18), y: u.y + rnd(-14, 14), z: z0 + rnd(10, 100), life: [0.4, 0.9], speed: 0, up: [10, 50], settle: false }));
        if (hero) c.lightNow(u.x, u.y, z0 + 70, PAL.green.lt, 150, 0.4, 0);
      }
      if (st & ST.MAGIC_IMMUNE) {
        const n = c.n(80 * dt);
        for (let k = 0; k < n; k++) { const a = Math.random() * TAU; P.spawn(c.pix(GOLD, { x: u.x + Math.cos(a) * 30, y: u.y + Math.sin(a) * 24, z: z0 + rnd(0, 150), life: [0.5, 1], speed: 0, up: [30, 110], settle: false })); }
        P.spawn({ x: u.x, y: u.y, z: z0 + 80, life: 0.07, size0: 90, size1: 90, col0: GOLD.mid, col1: GOLD.mid, a0: 0.1, a1: 0.1, mode: 'glow', speed: 0, noScale: true });
        c.lightNow(u.x, u.y, z0 + 90, GOLD.lt, 240, 0.8 + 0.15 * Math.sin(T * 6), 0);
      }
      if (st & ST.SLOW) {
        const n = c.n((hero ? 40 : 16) * dt);
        for (let k = 0; k < n; k++) P.spawn(c.pix(PAL.ice, { x: u.x + rnd(-18, 18), y: u.y + rnd(-12, 12), z: z0 + rnd(40, 130), life: [0.7, 1.4], speed: 0, gravity: -70, linger: [0.3, 0.7] }));
        if (hero && fDecalFrost) Q.put(u.x, u.y, z0, fDecalFrost, 0.5, 0.7, 1.5, 2.4, 0.7, 1.2, 0, 0, 0, 0, true, 1);
      }
      if (st & ST.INVIS) {
        for (let n = c.n(45 * dt); n > 0; n--) P.spawn(c.pix(PAL.ice, { x: u.x + rnd(-16, 16), y: u.y + rnd(-10, 10), z: z0 + rnd(10, 150), life: [0.3, 0.7], speed: 0, up: [20, 60], settle: false, rampTint: [0.8, 0.8, 0.8] }));
      }
      if (st & ST.CHANNEL) {
        const n = c.n(80 * dt);
        for (let k = 0; k < n; k++) { const a = Math.random() * TAU; P.spawn(c.pix(PAL.mana, { x: u.x + Math.cos(a) * 38, y: u.y + Math.sin(a) * 30, z: z0 + 4, life: [0.5, 0.9], speed: 0, up: [60, 150], vel: [-Math.cos(a) * 24, -Math.sin(a) * 20, 0], settle: false })); }
      }
      if (st & ST.SILENCE) {
        for (let n = c.n(20 * dt); n > 0; n--) P.spawn(c.pix(PAL.dark, { x: u.x + rnd(-10, 10), y: u.y, z: hd + 14, life: [0.6, 1.1], speed: 0, up: [14, 30], settle: false }));
      }
      if (st & ST.ROOT) {
        for (let n = c.n(26 * dt); n > 0; n--) P.spawn(c.pix(PAL.green, { x: u.x + rnd(-22, 22), y: u.y + rnd(-14, 14), z: z0 + 2, life: [0.6, 1.1], speed: 0, up: [30, 70], settle: false }));
      }
    }
  }
  R.each(each);
}
