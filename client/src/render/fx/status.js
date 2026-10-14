// Ambient status visuals (stun stars, hex, magic immunity, slow, invis, channel ...) and the Invoker orbs.
import { ST } from '../../../../shared/protocol.js';
import { PAL, ORB, elemMul, rnd, TAU } from './common.js';

const STUN_COL = [3.4, 2.8, 0.7];
const GOLD = PAL.gold;

export function register(c, R) {
  const P = c.P, Q = c.Q;
  const fStar = c.frame('p_star');
  const fDecalFrost = c.frame('decal_frost');
  const fOrb = { Q: c.frame('invoker_orb_q'), W: c.frame('invoker_orb_w'), E: c.frame('invoker_orb_e') };
  const orbBuf = [0, 0, 0];

  function orbs(u, dt) {
    const s = u.orbs; if (!s) return;
    const n = Math.min(3, s.length); if (!n) return;
    const alive = !(u.status & ST.DEAD) && u.hp > 0; if (!alive) return;
    // orbit AROUND the body (Dota): a wide ring at chest height, tilted so the back of the ring rides higher than the front;
    // the near half passes in front of the sprite, the far half behind it (depth-tested against the billboard)
    const zc = c.chest(u) + 4 + Math.sin(c.T * 2) * 3;
    const ph = c.T * 1.8;
    for (let i = 0; i < n; i++) {
      const ch = s[i] === 'q' || s[i] === 'w' || s[i] === 'e' ? s[i].toUpperCase() : s[i];
      const o = ORB[ch]; if (!o) continue;
      const a = ph + i * (TAU / 3), R0 = 58;
      const back = Math.sin(a), dk = 1 - 0.35 * Math.max(0, back);   // far half of the ring: dimmer and smaller (reads as depth in a still frame)
      const ox = u.x + Math.cos(a) * R0, oy = u.y + Math.sin(a) * R0, oz = zc + Math.sin(a) * 10;
      const mul = elemMul(ch, c.T, i * 7.3 + u.id.length);
      // body: sprite quad + two halo glows (soft wide + tight hot)
      const f = fOrb[ch];
      if (f) Q.put(ox, oy, oz, f, 1.5 * (0.85 + 0.15 * dk), o.lt[0] * 1.05 * dk, o.lt[1] * 1.05 * dk, o.lt[2] * 1.05 * dk, 1, 0.75 * (0.8 + 0.2 * mul), 0, 0, 0, 0, false, 1.1);
      P.spawn({ x: ox, y: oy, z: oz, life: 0.07, size0: 18 + (ch === 'W' ? 5 * mul : 0), size1: 16, col0: o.pal.mid, col1: o.pal.mid, a0: 0.13 * (0.7 + 0.3 * mul), a1: 0.12, mode: 'glow', speed: 0, noScale: true });
      P.spawn({ x: ox, y: oy, z: oz, life: 0.07, size0: 6, size1: 5, col0: o.pal.hot, col1: o.pal.hot, a0: 0.6, a1: 0.6, mode: 'glow', speed: 0, noScale: true });
      // per-orb light (trainer behaviour: E flickers, W strobes, Q steady and a bit tighter)
      // stronger than the orb looks: it lights Invoker (faint coloured rim + fill) and the ground, and casts a soft shadow (spell light, cube shadow when in budget)
      c.lightNow(ox, oy, oz, o.lt, ch === 'E' ? 150 : 140, 0.6 * mul, 0);   // tight radius: each orb tints its own side of him and the ground (wide ones summed to white)
      // element-specific wisps
      const nn = c.n((ch === 'E' ? 60 : ch === 'W' ? 40 : 45) * dt);
      for (let k = 0; k < nn; k++) {
        if (ch === 'E') P.spawn(c.pix(o.pal, { x: ox + rnd(-4, 4), y: oy + rnd(-3, 3), z: oz + 4, life: [0.35, 0.7], px: [0.8, 1.6], speed: [0, 10], up: [40, 90], settle: false }));
        else if (ch === 'W') { if (mul > 1) P.spawn(c.pix(o.pal, { x: ox, y: oy, z: oz, life: [0.15, 0.4], px: [0.8, 1.6], col0: [5, 4.2, 6.5], speed: [60, 180], shape: 'sphere', gravity: -200, drag: 1.2 })); }
        else P.spawn(c.pix(o.pal, { x: ox - Math.sin(a) * 10 + rnd(-3, 3), y: oy + Math.cos(a) * 8 + rnd(-3, 3), z: oz + rnd(-4, 4), life: [0.4, 0.8], px: [0.8, 1.6], speed: [0, 6], up: [-10, 14], settle: false }));
      }
      // orbit trail: comet tail laid along the ring behind the orb (fading pixels), so the circling reads even in a still frame
      for (let k = 1; k <= 5; k++) {
        const b = a - k * 0.13;
        P.spawn(c.pix(o.pal, { x: u.x + Math.cos(b) * R0, y: u.y + Math.sin(b) * R0, z: zc + Math.sin(b) * 10, life: 0.05, px: k < 3 ? 1.6 : 1, a0: 1 - k * 0.16, a1: 0, speed: 0, settle: false, keep: true }));
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
