// Lion the Demon Witch: horned, green/grey robes, glowing green hand (emit); attack = green finger bolt.
import { Pal, buildSheet, writeSheet, paint, polyM, shDiag, where, capPaint, eye3, eyeX } from './rig.mjs';
import { orb, bolt } from './props.mjs';

const PL = new Pal();
const skin = PL.r4('#ece4f2', '#cabcda', '#9a8cb4', '#625680'), hair = PL.r4('#9078b8', '#664e94', '#40306a', '#261c42');
const bone = PL.r4('#fffae0', '#eadeb6', '#b8a47c', '#6e5a40'), robe = PL.r4('#86d672', '#46a24a', '#2a7036', '#184424');
const grey = PL.r4('#cacada', '#9292ac', '#62628a', '#3a3a52'), gold = PL.r4('#fff0a8', '#ecbc40', '#aa761e', '#5c3a14');
const boots = PL.r4('#6a5a78', '#463c58', '#2e2640', '#1c1430');
const gA = PL.c('#eaffc4', 1), gB = PL.c('#7cf040', 0.85), gC = PL.c('#34b424', 0.55), eyeI = PL.c('#ffe040', 0.6), E = PL.c('#2a1840'), mouth = PL.c('#6a3a58');

const cfg = {
  W: 28, H: 30,
  g: { hRx: 6.4, hRy: 5.6, tRx: 4.4, tRy: 4, tRxE: 3.6, legLen: 6, legW: 2, legX: 2.5, stride: 2.2, armW: 2, armLen: 5, shOut: 0.9, handR: 1.4, headOv: 3.5, hx: 0, eHead: 2, eLean: -1, eArm: 1.5, starsUp: 4 },
  m: { head: skin, torso: robe, arm: grey, armD: PL.r4('#9292ac', '#62628a', '#3a3a52', '#3a3a52'), hand: skin, handD: PL.r4('#cabcda', '#9a8cb4', '#9a8cb4', '#625680'), pants: PL.r4('#62628a', '#3a3a52', '#3a3a52', '#2a2a3c'), pantsD: PL.r4('#3a3a52', '#2a2a3c', '#2a2a3c', '#1c1c2a'), shoe: boots },
  bustW: 16,

  torsoDeco(c, P) {
    const { tcx, tcy, tRx } = P, hem = P.hip + 3, e = P.dir === 'e', cx = e ? tcx : P.CX, sk = e ? 2.6 : 3.2;
    paint(c, polyM([[cx - tRx + 0.5, tcy + 0.5], [cx + tRx - 0.5, tcy + 0.5], [cx + tRx + sk, hem], [cx - tRx - sk, hem]]), shDiag(cx - 3, tcy + 1, robe));
    for (let x = 0; x < c.w; x++) if (robe.includes(c.get(x, hem)) || robe.includes(c.get(x, hem - 1))) c.set(x, hem - 1, grey[1]);
    if (P.dir === 's') {
      for (let y = Math.round(tcy + 1); y < hem - 1; y++) { c.set(P.l(0), y, grey[y % 2]); c.set(P.r(0), y, grey[1 + y % 2]); }
      c.set(P.l(0), Math.round(tcy - 1), gold[0]); c.set(P.r(0), Math.round(tcy - 1), gold[1]); c.set(P.l(0), Math.round(tcy), gold[1]); c.set(P.r(0), Math.round(tcy), gold[2]);
    } else if (P.dir === 'n') { for (let y = Math.round(tcy); y < hem - 1; y += 2) { c.set(P.l(0), y, robe[0]); c.set(P.r(0), y, robe[0]); } }
    else { for (let y = Math.round(tcy + 1); y < hem - 1; y += 2) c.set(Math.round(cx + 1), y, robe[0]); }
  },
  face(c, P) {
    const { hcx, hcy, g, p } = P, yi = Math.round(hcy);
    if (P.dir === 'n') return;
    if (P.dir === 's') {
      if (p.eyes === 'x') { eyeX(c, P.l(2), yi, E); eyeX(c, P.r(2) + 1, yi, E); }
      else { eye3(c, P.l(3), P.l(2), yi, { iris: eyeI, lash: E, dim: skin[1] }); eye3(c, P.r(3), P.r(2), yi, { iris: eyeI, lash: E, dim: skin[1] }); }
      c.set(P.l(1), yi + 4, mouth); c.set(P.l(0), yi + 4, mouth); c.set(P.r(0), yi + 4, mouth); c.set(P.r(1), yi + 4, mouth);
      c.set(P.l(0), yi + 5, 'W');
    } else {
      const ex = Math.round(hcx + g.hRx * 0.4);
      if (p.eyes === 'x') eyeX(c, ex + 1, yi, E); else eye3(c, ex + 1, ex, yi, { iris: eyeI, lash: E, dim: skin[1] });
      c.set(Math.round(hcx + g.hRx + 0.4), yi + 2, skin[1]); c.set(ex + 1, yi + 4, mouth); c.set(ex + 2, yi + 4, mouth);
    }
  },
  headgear(c, P) {
    const { hcx, hcy, g } = P, yi = Math.round(hcy), top = Math.round(hcy - g.hRy), hm = P.headMask, t = P.p.t || 0;
    if (P.dir === 'e') {
      const m = where(hm, (x, y) => y <= yi - 3 || x <= hcx - 3);
      capPaint(c, m, hcx, hcy - 2, g.hRx, g.hRy, hair);
      for (let x = Math.round(hcx); x <= Math.round(hcx + g.hRx - 1); x++) c.set(x, yi - 2 + ((x & 1) ? 0 : 1), hair[x > hcx + 3 ? 2 : 1]);
      paint(c, polyM([[hcx - 1, top + 2], [hcx + 3, top + 2], [hcx + 5, top - 2], [hcx + 7, top - 5], [hcx + 3, top - 4], [hcx - 1, top - 1]]), shDiag(hcx, top - 1, bone), 'bg');
      return;
    }
    const m = where(hm, (x, y) => y <= yi - 3 || ((x <= P.l(6) || x >= P.r(6)) && y <= yi));
    if (P.dir === 's') {
      capPaint(c, m, hcx, hcy - 2, g.hRx, g.hRy, hair);
      for (let u = 0; u <= 4; u++) { const y = yi - 3 + (u & 1 ? 0 : 1); c.set(P.l(u), y, hair[u > 2 ? 2 : 1]); c.set(P.r(u), y, hair[u > 2 ? 2 : 1]); }
      c.set(P.l(1), yi - 3, gold[1]); c.set(P.r(1), yi - 3, gold[1]); c.set(P.l(0), yi - 3, gold[0]); c.set(P.r(0), yi - 3, gold[2]);
    } else {
      capPaint(c, hm, hcx, hcy - 2, g.hRx, g.hRy, hair);
      for (let y = top + 2; y <= yi + 3; y += 3) { c.set(P.l(0), y, hair[0]); c.set(P.r(0), y, hair[2]); }
    }
    for (const sd of ['l', 'r']) {
      const px = P[sd];
      paint(c, polyM([[px(2.5), top + 2], [px(6), top + 3], [px(8.5), top - 1], [px(9), top - 5], [px(7), top - 3], [px(4), top - 1]]), shDiag(px(6), top, bone), 'bg');
    }
  },
  fx(c, P) {
    const p = P.p, h = P.hands.main, e = P.dir === 'e', n = P.dir === 'n';
    if (p.portrait) return;
    const r = p.anim === 'cast' ? (p.i === 0 ? 1.8 : 2.8) : 1.7;
    orb(c, h.x, h.y, r, [gA, gB, gC]);
    if (p.anim === 'cast' && p.i > 0) {
      for (const [dx, dy] of [[-3, -3], [3, -4], [0, -6], [-2, 2], [3, 1]]) { c.set(h.x + dx, h.y + dy, gB); c.set(h.x + dx, h.y + dy - 1, gC); }
      const o = P.hands.off; orb(c, o.x, o.y, 1.5, [gA, gB, gC]);
    }
    if (p.anim === 'attack' && p.i === 1) {
      const tx = e ? h.x + 9 : h.x - (n ? -1 : 1), ty = e ? h.y - 2 : n ? h.y - 9 : h.y + 6;
      bolt(c, h.x, h.y, Math.min(c.w - 4, tx), Math.max(1, Math.min(c.h - 2, ty)), gA, gB, 2, 1.5);
    }
    if (p.anim === 'attack' && p.i === 2) { const tx = e ? h.x + 4 : h.x, ty = e ? h.y - 1 : n ? h.y - 4 : h.y + 3; c.set(tx, ty, gB); c.set(tx + 1, ty, gC); c.set(tx, ty + 1, gC); }
  },
  pose(anim, d, i, p) {
    const s = d === 'n' ? -1 : 1, e = d === 'e';
    const A = (mx, my, ox, oy) => { p.am = e ? [mx, my] : [mx * s, my]; p.ao = e ? [ox, oy] : [ox * s, oy]; };
    if (anim === 'attack') { if (i === 0) A(-1, -3, 0, 0); else if (i === 1) A(e ? 3 : 1, e ? -2 : d === 'n' ? -5 : 1, 0, 0); else A(0, -1, 0, 0); p.sq = [0, 0.5, 0][i]; if (i === 1) p.tx = e ? 1 : 0; }
    else if (anim === 'cast') { A([0, 1, 1][i], [-3, -7, -7][i], 0, [-1, -2, -2][i]); if (i) p.hy = -1; }
    return p;
  },
};
const sheet = buildSheet(cfg, PL);
console.log(writeSheet('lion', sheet));
