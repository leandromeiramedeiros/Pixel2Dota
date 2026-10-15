// Ambient status visuals (stun stars, hex, magic immunity, slow, invis, channel ...) and the Invoker orbs.
import { ST } from '../../../../shared/protocol.js';
import { PAL, ORB, elemMul, rnd, TAU } from './common.js';

const STUN_COL = [3.4, 2.8, 0.7];
const GOLD = PAL.gold;

export function register(c, R) {
  const P = c.P, Q = c.Q;
  const fStar = c.frame('p_star');
  const fDecalFrost = c.frame('decal_frost');
  const orbBuf = [0, 0, 0];

  // Orbs = real 3D geometry (fx/geo3d.js G.orb, GLOW): a small HDR core inside a fresnel shell (+ a faint halo shell on medium and up).
  // Everything is a depth-tested solid, so an orb passing behind Invoker is hidden per pixel by his body, glow included: no billboard
  // halo (the old 'glow' particles bled over his face) and no sprite quad (it was cut into a hard-edged square).
  // [file: particles/units/heroes/hero_invoker/invoker_{quas,wex,exort}_orb.vpcf_c] sphere r 16, light r 130, beam_jagged rope trail.
  // Ring: shoulder height, R0 38 (true to Dota: small orbs circling the upper body), tilted so the half NEAR THE CAMERA rides low over the
  // chest and the far half rises behind the head (never across the face, from the 60 deg game camera or the low showcase orbit).
  const ORB_LOOK = {   // shells stay < 1.4 (no bloom), cores HDR (soft bloom); colours from the orb vpcfs, tuned to the Invoker palette
    Q: { shell: [0.16, 0.42, 0.8], core: [0.95, 1.6, 2.1], lump: 0, fill: 0.55 },
    W: { shell: [0.5, 0.2, 0.62], core: [1.75, 0.95, 2.05], lump: 0.18, fill: 0.45 },
    E: { shell: [0.85, 0.36, 0.07], core: [2.1, 1.2, 0.42], lump: 0.24, fill: 0.5 },
  };
  const R0 = 38, ORB_R = 6.5, CORE_R = 3.2, HALO_R = 11, TILT = 12;
  const oShell = { lump: 0, seed: 0, p2: 0.5, yaw: 0, roll: 0 }, oCore = { p2: 1 }, oHalo = { p2: 0, lump: 0, seed: 0 };
  const hcol = [0, 0, 0];
  function orbs(u, dt) {
    const s = u.orbs; if (!s) return;
    const n = Math.min(3, s.length); if (!n) return;
    const alive = !(u.status & ST.DEAD) && u.hp > 0; if (!alive) return;
    const G = c.G, lod = G.lod;
    // camera direction in the ground plane (three: X = x, Z = -y): the ring tilts toward the eye, whatever the showcase orbit yaw
    const cp = c.uniforms && c.uniforms.uCamPos ? c.uniforms.uCamPos.value : null;
    let vx = 0, vy = -1;
    if (cp) { const dx = cp.x - u.x, dy = -cp.z - u.y, l = Math.hypot(dx, dy); if (l > 1) { vx = dx / l; vy = dy / l; } }
    const zc = c.head(u) - 48 + Math.sin(c.T * 2) * 2;   // shoulder height
    const ph = c.T * 1.8;
    for (let i = 0; i < n; i++) {
      const ch = s[i] === 'q' || s[i] === 'w' || s[i] === 'e' ? s[i].toUpperCase() : s[i];
      const o = ORB[ch], L = ORB_LOOK[ch]; if (!o || !L) continue;
      const a = ph + i * (TAU / 3), ca = Math.cos(a), sa = Math.sin(a);
      const ox = u.x + ca * R0, oy = u.y + sa * R0, near = ca * vx + sa * vy;   // near: +1 = toward the camera
      const oz = zc - near * TILT;
      const mul = elemMul(ch, c.T, i * 7.3 + u.id.length);
      // body: core + shell (+ halo); W re-seeds its lumps on every strobe, E boils at ~12 Hz, Q stays a smooth sphere
      const seed = ch === 'E' ? ((c.T * 12) | 0) + i * 17 : ch === 'W' ? (mul > 1 ? ((c.T * 30) | 0) : 3) + i * 17 : i;
      oShell.lump = L.lump; oShell.seed = seed; oShell.p2 = L.fill; oShell.yaw = c.T * 2 + i; oShell.roll = c.T * 1.3;
      const k = ch === 'W' ? (mul > 1 ? 1.15 : 0.8) : mul;
      G.orb(ox, oy, oz, CORE_R, L.core, 0.85 + 0.15 * k, G.GLOW, oCore);
      G.orb(ox, oy, oz, ORB_R, L.shell, k, G.GLOW, oShell);
      if (lod) { for (let j = 0; j < 3; j++) hcol[j] = L.shell[j] * 0.35; oHalo.seed = seed; G.orb(ox, oy, oz, HALO_R + (ch === 'W' ? 2 * (mul > 1) : 0), hcol, 1, G.GLOW, oHalo); }
      // per-orb light (trainer behaviour: E flickers, W strobes, Q steady): tints its own side of him and the ground
      c.lightNow(ox, oy, oz, o.lt, ch === 'E' ? 130 : 120, 0.5 * mul, 0);
      // element-specific wisps: crisp single pixels (depth-tested squares, no soft billboards)
      const nn = c.n((ch === 'E' ? 36 : ch === 'W' ? 24 : 26) * dt);
      for (let k2 = 0; k2 < nn; k2++) {
        if (ch === 'E') P.spawn(c.pix(o.pal, { x: ox + rnd(-3, 3), y: oy + rnd(-3, 3), z: oz + 3, life: [0.3, 0.6], px: [0.8, 1.2], speed: [0, 8], up: [30, 70], settle: false }));
        else if (ch === 'W') { if (mul > 1) P.spawn(c.pix(o.pal, { x: ox, y: oy, z: oz, life: [0.12, 0.3], px: [0.8, 1.2], speed: [50, 140], shape: 'sphere', gravity: -200, drag: 1.2, settle: false })); }
        else P.spawn(c.pix(o.pal, { x: ox - sa * 7 + rnd(-2, 2), y: oy + ca * 6 + rnd(-2, 2), z: oz + rnd(-3, 3), life: [0.35, 0.7], px: [0.8, 1.2], speed: [0, 5], up: [-8, 10], settle: false }));
      }
      // orbit trail: short comet tail of single pixels along the ring, so the circling reads in a still frame
      for (let t = 1; t <= 4; t++) {
        const b = a - t * 0.16, cb = Math.cos(b), sb = Math.sin(b);
        P.spawn(c.pix(o.pal, { x: u.x + cb * R0, y: u.y + sb * R0, z: zc - (cb * vx + sb * vy) * TILT, life: 0.05, px: 1, a0: 0.8 - t * 0.17, a1: 0, speed: 0, settle: false, keep: true }));
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
