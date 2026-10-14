// Zeus: old god, big white beard, blue/white robes, lightning in hand (emit electric blue/white).
import { Pal, buildSheet, writeSheet, paint, polyM, shDiag, where, capPaint, eye3, eyeX } from './rig.mjs';
import { orb, bolt } from './props.mjs';

const PL = new Pal();
const skin = PL.r4('#ffe6cc', '#f2c6a0', '#c48e70', '#80584c'), beard = PL.r4('#ffffff', '#ecf4ff', '#b4c8e8', '#7490c0');
const hairS = PL.r4('#f2f6ff', '#c8d6f2', '#8ea4d2', '#5c72aa');
const robe = PL.r4('#86acff', '#4c7ae4', '#3252b4', '#202f84'), gold = PL.r4('#fff0a8', '#ecbc40', '#aa761e', '#5c3a14');
const sleeve = PL.r4('#f4f8ff', '#c8d8f4', '#8aa2d4', '#5468a4'), sandal = PL.r4('#d8b074', '#a07c48', '#68482c', '#3e2a1c');
const lA = PL.c('#f4ffff', 1), lB = PL.c('#80d4ff', 0.9), lC = PL.c('#3a80f4', 0.6), eyeI = PL.c('#58c4ff', 0.6), E = PL.c('#1c2860');

const cfg = {
  W: 32, H: 32,
  g: { hRx: 6.6, hRy: 5.6, tRx: 4.8, tRy: 4.2, tRxE: 3.8, legLen: 6, legW: 2, legX: 2.6, stride: 2.2, armW: 2, armLen: 5, shOut: 1, handR: 1.4, headOv: 3.5, hx: 0, eHead: 2, eLean: -1, eArm: 1.5, starsUp: 4 },
  m: { head: skin, torso: robe, arm: sleeve, armD: PL.r4('#c8d8f4', '#8aa2d4', '#5468a4', '#5468a4'), hand: skin, handD: PL.r4('#f2c6a0', '#c48e70', '#c48e70', '#80584c'), pants: PL.r4('#d8b074', '#a07c48', '#a07c48', '#68482c'), pantsD: PL.r4('#a07c48', '#68482c', '#68482c', '#3e2a1c'), shoe: sandal },
  bustW: 18,

  back(c, P) {
    if (P.dir !== 'e') return;
    const t = P.p.t || 0;
    paint(c, polyM([[P.tcx - 1, P.tTop + 1.5], [P.tcx + 2, P.tTop + 1.5], [P.tcx - 3, P.hip + 3], [P.tcx - 8 - (t === 1 || t === 2 ? 1 : 0), P.hip + 3]]), shDiag(P.tcx - 4, P.tTop, sleeve), 'bg');
  },
  torsoDeco(c, P) {
    const { tcx, tcy, tRx } = P, hem = P.hip + 3, e = P.dir === 'e', cx = e ? tcx : P.CX, sk = e ? 2.4 : 3.2;
    paint(c, polyM([[cx - tRx + 0.5, tcy + 0.5], [cx + tRx - 0.5, tcy + 0.5], [cx + tRx + sk, hem], [cx - tRx - sk, hem]]), shDiag(cx - 3, tcy + 1, robe));
    for (let x = 0; x < c.w; x++) for (const y of [hem - 1, hem]) { const ch = c.get(x, y); if (ch !== '.' && ch !== 'K') c.set(x, y, y === hem ? gold[2] : gold[1]); }
    const by = Math.round(tcy + 1.5);
    for (let x = Math.round(cx - tRx); x <= Math.round(cx + tRx); x++) { const o = c.get(x, by); if (o !== '.' && o !== 'K') c.set(x, by, gold[1]); }
    if (P.dir === 's') {
      for (let k = 0; k < 3; k++) { c.set(P.l(k), Math.round(tcy - 2) + k, sleeve[k ? 1 : 0]); c.set(P.r(k), Math.round(tcy - 2) + k, sleeve[k ? 2 : 1]); }
      c.set(P.l(0), by, gold[0]); c.set(P.r(0), by, gold[1]);
    }
    if (P.dir === 'n') for (let y = Math.round(tcy - 2); y < hem - 1; y += 2) { c.set(P.l(0), y, robe[0]); c.set(P.r(0), y, robe[0]); }
  },
  face(c, P) {
    const { hcx, hcy, g, p } = P, yi = Math.round(hcy);
    if (P.dir === 'n') return;
    if (P.dir === 's') {
      if (p.eyes === 'x') { eyeX(c, P.l(2), yi, E); eyeX(c, P.r(2) + 1, yi, E); }
      else { eye3(c, P.l(3), P.l(2), yi, { iris: eyeI, lash: E, dim: skin[1] }); eye3(c, P.r(3), P.r(2), yi, { iris: eyeI, lash: E, dim: skin[1] }); }
      for (let u = 1; u <= 4; u++) { c.set(P.l(u), yi - 2, beard[2]); c.set(P.r(u), yi - 2, beard[2]); }
      c.set(P.l(0), yi + 1, skin[2]); c.set(P.r(0), yi + 1, skin[2]);
      paint(c, polyM([[P.l(6), yi + 2], [P.r(6), yi + 2], [P.r(5), yi + 5], [P.r(4), yi + 7], [P.r(1), yi + 8], [P.l(1), yi + 8], [P.l(4), yi + 7], [P.l(5), yi + 5]]), shDiag(P.l(3), yi + 2, beard), 'bg');
      for (let u = 0; u <= 3; u++) { c.set(P.l(u), yi + 3, beard[u & 1 ? 1 : 0]); c.set(P.r(u), yi + 3, beard[1]); }
      c.set(P.l(0), yi + 4, skin[3]); c.set(P.r(0), yi + 4, skin[3]);
    } else {
      const ex = Math.round(hcx + g.hRx * 0.4);
      if (p.eyes === 'x') eyeX(c, ex + 1, yi, E); else eye3(c, ex + 1, ex, yi, { iris: eyeI, lash: E, dim: skin[1] });
      for (let x = ex - 1; x <= ex + 2; x++) c.set(x, yi - 2, beard[2]);
      c.set(Math.round(hcx + g.hRx + 0.6), yi + 1, skin[1]);
      paint(c, polyM([[hcx - 1, yi + 2], [hcx + g.hRx - 0.5, yi + 2], [hcx + g.hRx - 1, yi + 5], [hcx + 4, yi + 8], [hcx - 1, yi + 8]]), shDiag(hcx, yi + 2, beard), 'bg');
    }
  },
  headgear(c, P) {
    const { hcx, hcy, g } = P, yi = Math.round(hcy), top = Math.round(hcy - g.hRy), hm = P.headMask, t = P.p.t || 0, fl = (t === 1 || t === 2) ? 1 : 0;
    const tufts = (cx0, flip) => { for (const [dx, h] of [[-3, 3], [0, 5], [3, 3]]) paint(c, polyM([[cx0 + dx - 1.8, top + 1], [cx0 + dx + 1.8, top + 1], [cx0 + dx + 0.5 + (fl ? flip : 0), top - h]]), shDiag(cx0 + dx, top - 1, hairS), 'bg'); };
    if (P.dir === 'e') {
      const m = where(hm, (x, y) => y <= yi - 3 || x <= hcx - 2);
      capPaint(c, m, hcx, hcy - 3, g.hRx, g.hRy, hairS);
      for (let x = Math.round(hcx - 5); x <= Math.round(hcx + g.hRx - 1); x++) c.set(x, yi - 3, gold[x & 1 ? 0 : 1]);
      tufts(hcx - 1, -1);
      paint(c, polyM([[hcx - 3, yi - 2], [hcx - 1, yi - 2], [hcx - 6 - fl, yi + 6], [hcx - 4, yi + 7]]), shDiag(hcx - 3, yi, beard), 'bg');
      return;
    }
    const m = where(hm, (x, y) => y <= yi - 3 || ((x <= P.l(6) || x >= P.r(6)) && y <= yi + 2));
    if (P.dir === 's') {
      capPaint(c, m, hcx, hcy - 3, g.hRx, g.hRy, hairS);
      for (let u = 0; u <= 6; u++) { c.set(P.l(u), yi - 3, gold[u > 3 ? 2 : 1]); c.set(P.r(u), yi - 3, gold[u > 3 ? 2 : 1]); }
      c.set(P.l(0), yi - 3, lB); c.set(P.r(0), yi - 3, lB);
    } else {
      capPaint(c, hm, hcx, hcy - 2, g.hRx, g.hRy, hairS);
      for (let u = 0; u <= 6; u++) { c.set(P.l(u), yi - 3, gold[u > 3 ? 2 : 1]); c.set(P.r(u), yi - 3, gold[u > 3 ? 2 : 1]); }
      for (let y = yi - 2; y <= yi + 6; y += 2) { c.set(P.l(0), y, beard[0]); c.set(P.r(0), y, beard[2]); }
      paint(c, polyM([[P.CX - 6, yi + 3], [P.CX + 6, yi + 3], [P.CX + 5 + fl, yi + 6], [P.CX + 1, yi + 8], [P.CX - 4 - fl, yi + 6]]), shDiag(P.CX - 3, yi + 3, beard), 'bg');
    }
    tufts(P.CX, 1);
  },
  fx(c, P) {
    const p = P.p, h = P.hands.main, o = P.hands.off, e = P.dir === 'e', n = P.dir === 'n', t = p.t || 0;
    if (p.portrait) return;
    const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    if (p.anim === 'idle' || p.anim === 'walk' || p.anim === 'stunned') {
      if (p.anim !== 'stunned') { orb(c, h.x, h.y, 1.5, [lA, lB, lC]); if (t & 1) { c.set(h.x + 2, h.y - 2, lB); c.set(h.x - 2, h.y - 1, lC); } else { c.set(h.x - 2, h.y - 2, lB); c.set(h.x + 2, h.y - 1, lC); } }
      return;
    }
    if (p.anim === 'attack') {
      orb(c, h.x, h.y, p.i === 1 ? 2.2 : 1.7, [lA, lB, lC]);
      if (p.i === 1) { const tx = e ? cl(h.x + 9, 0, c.w - 4) : h.x - (n ? -2 : 2), ty = e ? h.y - 2 : n ? cl(h.y - 10, 2, 99) : cl(h.y + 7, 0, c.h - 3); bolt(c, h.x, h.y, tx, ty, lA, lB, 1, 2); }
      if (p.i === 2) { const tx = e ? h.x + 4 : h.x, ty = e ? h.y - 1 : n ? h.y - 4 : h.y + 3; c.set(tx, ty, lB); c.set(tx + 1, ty, lC); c.set(tx, ty + 1, lC); }
      return;
    }
    if (p.anim === 'cast') {
      orb(c, h.x, h.y, p.i === 0 ? 1.8 : 2.6, [lA, lB, lC]); orb(c, o.x, o.y, p.i === 0 ? 1.5 : 2.3, [lA, lB, lC]);
      if (p.i > 0) {
        bolt(c, h.x, h.y - 2, h.x - 1, 1, lA, lB, p.i, 1.6); bolt(c, o.x, o.y - 2, o.x + (e ? 3 : 1), 2, lA, lB, p.i + 2, 1.6);
        for (const [dx, dy] of [[-3, -3], [3, -2], [0, -5]]) { c.set(P.hcx + dx * 3, P.hcy + dy * 2, lB); c.set(P.hcx + dx * 3 + 1, P.hcy + dy * 2 + 1, lC); }
      }
    }
  },
  pose(anim, d, i, p) {
    const s = d === 'n' ? -1 : 1, e = d === 'e';
    const A = (mx, my, ox, oy) => { p.am = e ? [mx, my] : [mx * s, my]; p.ao = e ? [ox, oy] : [ox * s, oy]; };
    if (anim === 'attack') { if (i === 0) A(-1, -3, 0, 0); else if (i === 1) A(e ? 3 : 1, e ? -2 : d === 'n' ? -5 : 1, 0, 0); else A(0, -1, 0, 0); p.sq = [0, 0.5, 0][i]; if (i === 1) p.tx = e ? 1 : 0; }
    else if (anim === 'cast') { A([0, 1, 1][i], [-4, -8, -8][i], [0, 1, 1][i], [-4, -8, -8][i]); if (i) p.hy = -1; }
    return p;
  },
};
const sheet = buildSheet(cfg, PL);
console.log(writeSheet('zuus', sheet));
