// Axe: big red-skinned brute (widest sprite), horned helmet, black beard, huge battle axe.
import { Pal, buildSheet, writeSheet, paint, polyM, shDiag, where, capPaint, eye3, eyeX, ellM, shEll, taperM, shNormal, arcTrail } from './rig.mjs';
import { shaft } from './props.mjs';

const PL = new Pal();
const skin = PL.r4('#ff9a82', '#f05044', '#b83036', '#6e1c2e'), steel = PL.r4('#d8dce8', '#9a9eb8', '#626888', '#363a54');
const bone = PL.r4('#fffae0', '#eadeb6', '#b8a47c', '#6e5a40'), beard = PL.r4('#b09aa8', '#80687c', '#56425e', '#32243e');
const leather = PL.r4('#8a5a48', '#5e3a32', '#3c2224', '#22141a'), gold = PL.r4('#fff0a8', '#ecbc40', '#aa761e', '#5c3a14');
const wood = PL.r4('#b8845a', '#8a5a3c', '#5c3a28', '#32201a'), cloth = PL.r4('#a8363c', '#7a2230', '#521624', '#2e0c18');
const blade = PL.r4('#ffffff', '#d0d8ec', '#8890b0', '#4c5276');
const hot = PL.c('#ff5a36', 0.7), eyeI = PL.c('#ff3a20', 0.45), E = PL.c('#2a0c18');

const cfg = {
  W: 38, H: 32,
  g: { hRx: 7.2, hRy: 5.8, tRx: 6.8, tRy: 5, tRxE: 5.4, legLen: 6, legW: 4, legX: 3.4, stride: 3, armW: 3, armLen: 5, shOut: 1.5, handR: 1.9, headOv: 4, hx: 0, eHead: 2.5, eLean: -1, eArm: 2, starsUp: 5 },
  m: { head: skin, torso: skin, arm: skin, armD: PL.r4('#e0443a', '#a42a30', '#601828', '#601828'), hand: skin, handD: PL.r4('#e0443a', '#a42a30', '#a42a30', '#601828'), pants: leather, pantsD: PL.r4('#5e3a32', '#3c2224', '#3c2224', '#22141a'), shoe: PL.r4('#5e5a6a', '#3e3a4c', '#28243a', '#181426') },
  bustW: 18,

  back(c, P) {
    if (P.dir === 'n' || P.dir === 's') return;
  },
  torsoDeco(c, P) {
    const { tcx, tcy, tRx, tRy } = P, e = P.dir === 'e', cx = e ? tcx : P.CX, hem = P.hip + 2;
    // loincloth / tassets
    paint(c, polyM([[cx - tRx + 1, tcy + 1], [cx + tRx - 1, tcy + 1], [cx + tRx, hem], [cx - tRx, hem]]), shDiag(cx - 3, tcy, cloth));
    for (let x = 0; x < c.w; x++) if (cloth.includes(c.get(x, hem))) c.set(x, hem, gold[2]);
    // belt
    const by = Math.round(tcy + tRy - 2.5);
    for (let x = Math.round(cx - tRx); x <= Math.round(cx + tRx); x++) { const o = c.get(x, by); if (o !== '.' && o !== 'K') { c.set(x, by, leather[1]); c.set(x, by + 1, leather[2]); } }
    if (P.dir === 's') { c.set(P.l(0), by, gold[0]); c.set(P.r(0), by, gold[1]); c.set(P.l(0), by + 1, gold[1]); c.set(P.r(0), by + 1, gold[2]); }
    if (P.dir === 'n') { for (let y = Math.round(tcy - 3); y < by; y += 2) { c.set(P.l(0), y, skin[3]); c.set(P.r(0), y, skin[3]); } }
    else if (P.dir === 's') { // chest pecs + scar
      c.set(P.l(2), Math.round(tcy - 2), skin[0]); c.set(P.r(2), Math.round(tcy - 2), skin[1]); c.set(P.l(1), Math.round(tcy - 1), skin[2]); c.set(P.r(1), Math.round(tcy - 1), skin[3]);
    }
  },
  weaponMid(c, P) { // shoulder spikes
    const ty = P.tTop + 3;
    if (P.dir === 'e') { const m = ellM(P.tcx - 1, ty + 0.5, 3.4, 2.6); paint(c, m, shEll(P.tcx - 1, ty + 0.5, 3.4, 2.6, steel, 0.1)); c.set(P.tcx - 1, ty - 3, 'K'); c.set(P.tcx - 1, ty - 2, bone[1]); return; }
    for (const sd of [-1, 1]) {
      const cx = sd < 0 ? P.l(0) - P.tRx + 0.4 : P.r(0) + P.tRx - 0.4;
      const m = ellM(cx, ty, 3.2, 2.7); paint(c, m, shEll(cx, ty, 3.2, 2.7, steel, 0.1)); c.set(cx - 0.5, ty - 1, steel[0]);
      c.set(cx + sd * 0.5, ty - 3, 'K'); c.set(cx + sd * 0.5, ty - 2, bone[1]);
    }
  },
  face(c, P) {
    const { hcx, hcy, g, p } = P, yi = Math.round(hcy);
    if (P.dir === 'n') return;
    if (P.dir === 's') {
      if (p.eyes === 'x') { eyeX(c, P.l(2), yi, E); eyeX(c, P.r(2) + 1, yi, E); }
      else { eye3(c, P.l(3), P.l(2), yi, { iris: eyeI, lash: E, dim: skin[2] }); eye3(c, P.r(3), P.r(2), yi, { iris: eyeI, lash: E, dim: skin[2] }); }
      for (let u = 1; u <= 4; u++) { c.set(P.l(u), yi - 2, E); c.set(P.r(u), yi - 2, E); }   // thick brows
      c.set(P.l(0), yi + 1, skin[2]); c.set(P.r(0), yi + 1, skin[2]);
      // beard
      paint(c, polyM([[P.l(4), yi + 3], [P.r(4), yi + 3], [P.r(4), yi + 5], [P.r(2), yi + 7], [P.l(2), yi + 7], [P.l(4), yi + 5]]), shDiag(P.l(3), yi + 2, beard), 'bg');
      const o = p.anim === 'cast' && p.i > 0; for (let u = 0; u <= 2; u++) { c.set(P.l(u), yi + 4, o ? E : beard[3]); c.set(P.r(u), yi + 4, o ? E : beard[3]); }
    } else {
      const ex = Math.round(hcx + g.hRx * 0.4);
      if (p.eyes === 'x') eyeX(c, ex + 1, yi, E); else eye3(c, ex + 1, ex, yi, { iris: eyeI, lash: E, dim: skin[2] });
      for (let x = ex - 1; x <= ex + 3; x++) c.set(x, yi - 2, E);
      c.set(Math.round(hcx + g.hRx + 0.4), yi + 1, skin[1]);
      paint(c, polyM([[hcx - 1, yi + 2], [hcx + g.hRx - 0.5, yi + 2], [hcx + g.hRx - 1, yi + 6], [hcx + 3, yi + 8], [hcx - 1, yi + 7]]), shDiag(hcx, yi + 2, beard), 'bg');
    }
  },
  headgear(c, P) {
    const { hcx, hcy, g } = P, yi = Math.round(hcy), top = Math.round(hcy - g.hRy), hm = P.headMask;
    if (P.dir === 'e') {
      const m = where(hm, (x, y) => y <= yi - 3 || x <= hcx - 3);
      capPaint(c, m, hcx, hcy - 3, g.hRx, g.hRy, steel);
      for (let x = Math.round(hcx - 4); x <= Math.round(hcx + g.hRx - 1); x++) { c.set(x, yi - 3, leather[1]); c.set(x, yi - 4, steel[2]); }
      paint(c, polyM([[hcx - 1, top + 2], [hcx + 3, top + 2], [hcx + 5, top - 2], [hcx + 8, top - 5], [hcx + 4, top - 4], [hcx - 1, top - 1]]), shDiag(hcx, top - 1, bone), 'bg');
      return;
    }
    const m = P.dir === 's' ? where(hm, (x, y) => y <= yi - 3) : hm;
    capPaint(c, m, hcx, hcy - 3, g.hRx, g.hRy, steel);
    if (P.dir === 's') { for (let u = 0; u <= 6; u++) { c.set(P.l(u), yi - 3, leather[1]); c.set(P.r(u), yi - 3, leather[2]); } for (let y = top; y <= yi - 4; y++) { c.set(P.l(0), y, steel[0]); c.set(P.r(0), y, steel[1]); } c.set(P.l(0), yi - 4, gold[0]); c.set(P.r(0), yi - 4, gold[1]); }
    else for (let y = top; y <= yi + 2; y += 2) { c.set(P.l(0), y, steel[0]); c.set(P.r(0), y, steel[2]); }
    for (const sd of ['l', 'r']) {
      const px = P[sd];
      paint(c, polyM([[px(3), top + 2], [px(7), top + 3], [px(10), top - 1], [px(10.5), top - 5], [px(8), top - 3], [px(4.5), top - 1]]), shDiag(px(7), top, bone), 'bg');
    }
  },
  weapon(c, P) {
    const p = P.p, h = P.hands.main, dir = P.dir, a = p.wa || 0, r = a * Math.PI / 180, d = [Math.sin(r), -Math.cos(r)], n = [Math.cos(r), Math.sin(r)];
    if (p.portrait) return;
    const ls = dir === 's' ? -1 : 1;
    if (p.slash) { const sg = dir === 'e' ? 1 : (dir === 'n' ? -1 : 1), a1 = a, a0 = a1 - sg * 55; for (const [rr, ch] of [[12, 'W'], [13, hot]]) arcTrail(c, h.x, h.y, rr, a0, a1 - sg * 12, [ch]); }
    const bx = h.x - d[0] * 3, by = h.y - d[1] * 3;
    shaft(c, bx, by, a, 13, wood, 1, true);
    const T = (t, s) => [h.x + d[0] * t + n[0] * s * ls * 0.72, h.y + d[1] * t + n[1] * s * ls * 0.72];
    const head = polyM([T(8, 0), T(7, 3.5), T(8, 6.5), T(11, 7.8), T(13.5, 6.2), T(14, 3.2), T(13, 0), T(14, -2), T(11, -2.5)]);
    paint(c, head, shNormal(h.x + d[0] * 10, h.y + d[1] * 10, a * (ls < 0 ? 1 : 1), ls < 0 ? [blade[3], blade[2], blade[1], blade[0]] : blade, 5));
    for (const [t, s] of [[8, 5.8], [10.5, 7.4], [12.8, 6.2], [13.4, 4]]) { const q = T(t, s); c.set(q[0], q[1], blade[0]); }
    const g1 = T(8.5, 0.5); c.set(g1[0], g1[1], gold[1]);
  },
  fx(c, P) {
    const p = P.p;
    if (p.portrait || p.anim !== 'cast' || p.i === 0) return;
    const hx = P.hcx, hy = P.hcy;
    for (const [dx, dy] of [[-10, -3], [10, -3], [-8, 5], [8, 5]]) { const x = hx + dx, y = hy + dy - (p.i === 2 ? 1 : 0); c.set(x, y, hot); c.set(x + (dx > 0 ? 1 : -1), y - 1, hot); c.set(x + (dx > 0 ? 2 : -2), y - 2, hot); }
  },
  pose(anim, d, i, p) {
    const s = d === 'n' ? -1 : 1, e = d === 'e';
    const A = (mx, my, ox, oy, wa) => { p.am = e ? [mx, my] : [mx * s, my]; p.ao = e ? [ox, oy] : [ox * s, oy]; p.wa = e ? wa : wa * s; };
    if (anim === 'idle') A(0, 0, 0, 0, e ? -24 - [0, 1, 2, 1][i] : -8 - [0, 1, 1, 0][i]);
    else if (anim === 'stunned') A(0, 1, 0, 0, e ? 20 : -6);
    else if (anim === 'walk') A(p.am[0], 0, p.ao[0], 0, e ? -22 + p.step * 4 : -8 + [2, 0, -2, 0][i]);
    else if (anim === 'attack') {
      if (i === 0) { A(-2, -6, 0, -1, e ? -40 : -4); p.tx = -1; }
      else if (i === 1) { A(e ? 2 : 1, e ? -3 : -4, 0, 0, e ? 100 : 150); p.slash = 1; p.sq = 0.5; p.tx = e ? 1 : 0; }
      else A(0, 0, 0, 0, e ? 140 : 160), p.sq = 0.5;
    } else if (anim === 'cast') { A([0, 1, 1][i], [-4, -9, -9][i], 0, [-3, -9, -9][i], e ? [-10, 8, 8][i] : [-10, -4, -4][i]); if (i) p.hy = -1; }
    return p;
  },
};
const sheet = buildSheet(cfg, PL);
console.log(writeSheet('axe', sheet));
