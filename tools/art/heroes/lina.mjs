// Lina the Slayer: slim fire mage, long flowing red-orange hair, red dress, flame casts.
import { Pal, buildSheet, writeSheet, paint, polyM, shDiag, where, capPaint, eye3, eyeX } from './rig.mjs';
import { flame, orb } from './props.mjs';

const PL = new Pal();
const skin = PL.r4('#fff0e2', '#ffd8bc', '#e8a888', '#a8665e'), hair = PL.r4('#ffd488', '#ff9a3a', '#ee5a22', '#a8301c');
const dress = PL.r4('#ff9a74', '#f04e3a', '#b82c32', '#701c30'), trim = PL.r4('#fff0a8', '#ffc040', '#c27a1c', '#6a4016');
const boots = PL.r4('#a8483a', '#7a2a2c', '#4e1a24', '#2e1020'), sleeve = PL.r4('#ff9a6a', '#e8502e', '#a82424', '#5c1226');
const fA = PL.c('#fff4b0', 1), fB = PL.c('#ffb038', 0.85), fC = PL.c('#f0501a', 0.6), eyeI = PL.c('#f0700c', 0.25), E = PL.c('#3a1020'), lip = PL.c('#c8505a');

const cfg = {
  W: 28, H: 30,
  g: { hRx: 6.4, hRy: 5.6, tRx: 4, tRy: 4, tRxE: 3.2, legLen: 6, legW: 2, legX: 2.5, stride: 2.2, armW: 2, armLen: 5, shOut: 0.8, handR: 1.3, headOv: 3.5, hx: 0, eHead: 2, eLean: -1, eArm: 1.5, starsUp: 4 },
  m: { head: skin, torso: dress, arm: sleeve, armD: PL.r4('#dc3a2c', '#9e1c2a', '#5c1226', '#5c1226'), hand: skin, handD: PL.r4('#ffd8bc', '#e8a888', '#e8a888', '#a8665e'), pants: PL.r4('#a8483a', '#7a2a2c', '#7a2a2c', '#4e1a24'), pantsD: PL.r4('#7a2a2c', '#4e1a24', '#4e1a24', '#2e1020'), shoe: boots },
  bustW: 16,

  back(c, P) {
    const { hcx, hcy, g } = P, top = Math.round(hcy - g.hRy), yi = Math.round(hcy), t = P.p.t || 0, sw = [0, 1, 1, 0][t % 4] + (P.p.anim === 'cast' ? 1 : 0);
    if (P.dir === 's') {
      for (const sd of ['l', 'r']) {
        const px = P[sd], o = sd === 'l' ? -1 : 1;
        paint(c, polyM([[px(3), top + 3], [px(7), top + 5], [px(7.5) + o * sw, yi + 8], [px(6) + o * sw, yi + 11], [px(4.5), yi + 9], [px(3.5), yi + 5]]), shDiag(px(6), top + 4, hair), 'bg');
      }
    } else if (P.dir === 'e') {
      const hx = hcx - 2;
      paint(c, polyM([[hx + 1, top + 2], [hx - 4, top + 3], [hx - 8 - sw, yi + 5], [hx - 9 - sw, yi + 10], [hx - 6, yi + 12 + (t & 1)], [hx - 2, yi + 9], [hx + 1, yi + 5]]), shDiag(hx - 4, top + 3, hair), 'bg');
    }
  },
  torsoDeco(c, P) {
    const { tcx, tcy, tRx } = P, hem = P.hip + 2;
    const sk = P.dir === 'e' ? 2.4 : 2.8, cx = P.dir === 'e' ? tcx : P.CX;
    const m = polyM([[cx - tRx + 0.5, tcy + 1], [cx + tRx - 0.5, tcy + 1], [cx + tRx + sk, hem], [cx - tRx - sk, hem]]);
    paint(c, m, shDiag(cx - 3, tcy + 1, dress));
    for (let x = 0; x < c.w; x++) if (dress.includes(c.get(x, hem - 1)) || dress.includes(c.get(x, hem))) { c.set(x, hem - 1, trim[1]); }
    if (P.dir === 's') { c.set(P.l(0), Math.round(tcy - 1), trim[0]); c.set(P.r(0), Math.round(tcy - 1), trim[1]); c.set(P.l(0), Math.round(tcy + 1), trim[1]); c.set(P.r(0), Math.round(tcy + 1), trim[2]); }
    if (P.dir === 'n') { for (let y = Math.round(tcy); y < hem - 1; y += 2) { c.set(P.l(0), y, dress[0]); c.set(P.r(0), y, dress[0]); } }
  },
  face(c, P) {
    const { hcx, hcy, g, p } = P, yi = Math.round(hcy);
    if (P.dir === 'n') return;
    if (P.dir === 's') {
      if (p.eyes === 'x') { eyeX(c, P.l(2), yi, E); eyeX(c, P.r(2) + 1, yi, E); }
      else { eye3(c, P.l(3), P.l(2), yi, { iris: eyeI, lash: E, dim: skin[1] }); eye3(c, P.r(3), P.r(2), yi, { iris: eyeI, lash: E, dim: skin[1] }); }
      c.set(P.l(0), yi + 4, lip); c.set(P.r(0), yi + 4, lip);
      c.set(P.l(4), yi + 3, skin[1]); c.set(P.r(4), yi + 3, skin[1]);
    } else {
      const ex = Math.round(hcx + g.hRx * 0.4);
      if (p.eyes === 'x') eyeX(c, ex + 1, yi, E); else eye3(c, ex + 1, ex, yi, { iris: eyeI, lash: E, dim: skin[1] });
      c.set(Math.round(hcx + g.hRx + 0.4), yi + 2, skin[1]); c.set(ex + 2, yi + 4, lip);
    }
  },
  headgear(c, P) {
    const { hcx, hcy, g } = P, yi = Math.round(hcy), top = Math.round(hcy - g.hRy), hm = P.headMask, t = P.p.t || 0, sw = [0, 1, 1, 0][t % 4];
    if (P.dir === 's') {
      const m = where(hm, (x, y) => y <= yi - 2 || ((x <= P.l(5) || x >= P.r(5)) && y <= yi + 3));
      capPaint(c, m, hcx, hcy - 2, g.hRx, g.hRy, hair);
      for (let u = 0; u <= 4; u++) { const y = yi - 2 + (u & 1 ? 0 : 1); c.set(P.l(u), y, hair[u > 2 ? 2 : 1]); c.set(P.r(u), y, hair[u > 2 ? 2 : 1]); }
      c.set(P.l(0), yi - 2, hair[3]); c.set(P.r(0), yi - 2, hair[3]);
      for (const [dx, h] of [[-2, 3], [1, 4], [4, 2]]) paint(c, polyM([[P.CX + dx - 1.5, top + 1], [P.CX + dx + 1.5, top + 1], [P.CX + dx + 0.5 + (t & 1 ? 1 : 0) * (dx > 0 ? 1 : -1), top - h]]), shDiag(P.CX + dx, top - 1, hair), 'bg');
      c.set(P.l(5), top + 2, hair[0]); c.set(P.l(4), top + 1, hair[0]); c.set(P.l(3), top + 1, hair[0]);
    } else if (P.dir === 'n') {
      capPaint(c, hm, hcx, hcy - 2, g.hRx, g.hRy, hair);
      paint(c, polyM([[P.CX - 6, yi + 1], [P.CX + 6, yi + 1], [P.CX + 6 + sw, yi + 9], [P.CX + 4 + sw, yi + 12], [P.CX + 1, yi + 10 + (t & 1)], [P.CX - 2, yi + 12], [P.CX - 5 - sw, yi + 9]]), shDiag(P.CX - 3, yi, hair), 'bg');
      for (let y = top + 1; y <= yi + 8; y += 3) { c.set(P.l(0), y, hair[0]); c.set(P.r(0), y, hair[2]); }
      for (const [dx, h] of [[-2, 3], [1, 4], [4, 2]]) paint(c, polyM([[P.CX + dx - 1.5, top + 1], [P.CX + dx + 1.5, top + 1], [P.CX + dx + 0.5, top - h]]), shDiag(P.CX + dx, top - 1, hair), 'bg');
    } else {
      const m = where(hm, (x, y) => y <= yi - 2 || x <= hcx - 1);
      capPaint(c, m, hcx, hcy - 2, g.hRx, g.hRy, hair);
      for (let x = Math.round(hcx + 1); x <= Math.round(hcx + g.hRx - 1); x++) c.set(x, yi - 2 + ((x & 1) ? 0 : 1), hair[x > hcx + 3 ? 2 : 1]);
      for (const [dx, h] of [[-3, 3], [0, 4], [3, 3]]) paint(c, polyM([[hcx + dx - 1.5, top + 1], [hcx + dx + 1.5, top + 1], [hcx + dx + 1 - (t & 1), top - h]]), shDiag(hcx + dx, top - 1, hair), 'bg');
    }
  },
  fx(c, P) {
    const p = P.p, h = P.hands.main, e = P.dir === 'e', n = P.dir === 'n';
    if (p.portrait) return;
    if (p.anim === 'cast' && p.i > 0) {
      const L = p.i === 1 ? 6 : 8, w = p.i === 1 ? 2.3 : 2.8;
      flame(c, h.x, h.y - 1, 0, L, w, [fA, fB, fC], p.i);
      const o = P.hands.off; flame(c, o.x, o.y - 1, 0, 3, 1.3, [fA, fB, fC], p.i);
    }
    if (p.anim === 'attack') {
      if (p.i === 1) { const ox = e ? 3 : 0, oy = e ? -1 : n ? -4 : -1; orb(c, h.x + ox, h.y + oy, 2.6, [fA, fB, fC]); flame(c, h.x + ox, h.y + oy, e ? 270 : n ? 180 : 0, 4, 2, [fB, fC, fC], 1); }
      if (p.i === 2) { const ox = e ? 5 : 0, oy = e ? -2 : n ? -6 : 4; c.set(h.x + ox, h.y + oy, fA); c.set(h.x + ox + 1, h.y + oy, fB); c.set(h.x + ox, h.y + oy + 1, fC); }
      if (p.i === 0) flame(c, h.x, h.y - 1, 0, 3, 1.4, [fA, fB, fC], 0);
    }
  },
  pose(anim, d, i, p) {
    const s = d === 'n' ? -1 : 1, e = d === 'e';
    const A = (mx, my, ox, oy) => { p.am = e ? [mx, my] : [mx * s, my]; p.ao = e ? [ox, oy] : [ox * s, oy]; };
    if (anim === 'attack') { if (i === 0) A(-1, -4, 0, 0); else if (i === 1) A(e ? 3 : 1, e ? -2 : d === 'n' ? -5 : 1, 0, 0); else A(0, -1, 0, 0); p.sq = [0, 0.5, 0][i]; if (i === 1) p.tx = e ? 1 : 0; }
    else if (anim === 'cast') { A([0, 1, 1][i], [-3, -7, -7][i], 0, [-1, -2, -2][i]); if (i) p.hy = -1; }
    return p;
  },
};
const sheet = buildSheet(cfg, PL);
console.log(writeSheet('lina', sheet));
