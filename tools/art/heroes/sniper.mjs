// Sniper (Kardel): tiny keen with a big orange beard, brown/green hat and a long rifle; attack = muzzle flash (emit).
import { Pal, buildSheet, writeSheet, paint, polyM, shDiag, where, capPaint, eye3, eyeX, ellM, shEll, strokeM, taperM } from './rig.mjs';
import { shaft } from './props.mjs';

const PL = new Pal();
const skin = PL.r4('#ffcaa6', '#f0a27c', '#c07058', '#7e4444'), beard = PL.r4('#ffc060', '#e08a34', '#aa5a24', '#643418');
const hat = PL.r4('#c08a58', '#946238', '#684226', '#3e2616'), band = PL.r4('#a4d46a', '#5e9a3e', '#3a6a2c', '#224018');
const tunic = PL.r4('#a0cc70', '#648e44', '#406a32', '#264022'), leather = PL.r4('#b88454', '#8a5a36', '#5e3a24', '#38221a');
const pants = PL.r4('#8a6a54', '#624a3c', '#3e2c28', '#241a1e'), boots = PL.r4('#6a4a3a', '#46302a', '#2c1c1e', '#1a1016');
const wood = PL.r4('#c8946a', '#946240', '#64402c', '#3a2418'), gun = PL.r4('#b4bccc', '#788298', '#4a5470', '#2a3048');
const fA = PL.c('#fffadc', 1), fB = PL.c('#ffc83c', 0.9), fC = PL.c('#ff7a24', 0.6), red = PL.c('#ff3a3a', 0.9), smoke = PL.r4('#e4e4ea', '#b4b4c0', '#80808e', '#585866'), eyeI = PL.c('#3a2a2a'), E = PL.c('#2a1420');

const cfg = {
  W: 34, H: 28,
  g: { hRx: 6, hRy: 5, tRx: 4.4, tRy: 3.4, tRxE: 3.6, legLen: 4, legW: 2, legX: 2.4, stride: 2, armW: 2, armLen: 4, shOut: 0.8, handR: 1.3, headOv: 3, hx: 0, eHead: 2, eLean: -1, eArm: 1.5, starsUp: 4 },
  m: { head: skin, torso: tunic, arm: leather, armD: PL.r4('#8a5a36', '#5e3a24', '#38221a', '#38221a'), hand: skin, handD: PL.r4('#f0a27c', '#c07058', '#c07058', '#7e4444'), pants, pantsD: PL.r4('#624a3c', '#3e2c28', '#3e2c28', '#241a1e'), shoe: boots },
  bustW: 18,

  torsoDeco(c, P) {
    const { tcx, tcy, tRx, tRy } = P;
    const by = Math.round(tcy + tRy - 1.5);
    for (let x = Math.round(tcx - tRx); x <= Math.round(tcx + tRx); x++) { const o = c.get(x, by); if (o !== '.' && o !== 'K') c.set(x, by, leather[1]); }
    if (P.dir === 's') { c.set(P.l(0), by, band[0]); c.set(P.r(0), by, band[1]); for (let k = 0; k < 3; k++) { c.set(P.l(2 + k), Math.round(tcy - 2) + k, leather[1]); c.set(P.r(2 + k), Math.round(tcy - 2) + k, leather[2]); } }
    if (P.dir === 'e') c.set(Math.round(tcx), by, band[0]);
  },
  face(c, P) {
    const { hcx, hcy, g, p } = P, yi = Math.round(hcy);
    if (P.dir === 'n') return;
    if (P.dir === 's') {
      if (p.eyes === 'x') { eyeX(c, P.l(2), yi, E); eyeX(c, P.r(2) + 1, yi, E); }
      else { eye3(c, P.l(3), P.l(2), yi, { iris: eyeI, lash: E, dim: skin[1] }); eye3(c, P.r(3), P.r(2), yi, { iris: eyeI, lash: E, dim: skin[1] }); }
      c.set(P.l(0), yi + 1, skin[2]); c.set(P.r(0), yi + 1, skin[2]);
      paint(c, polyM([[P.l(6), yi + 2], [P.r(6), yi + 2], [P.r(5), yi + 5], [P.r(2), yi + 7.5], [P.l(2), yi + 7.5], [P.l(5), yi + 5]]), shDiag(P.l(3), yi + 2, beard), 'bg');
      for (let u = 0; u <= 3; u++) { c.set(P.l(u), yi + 3, beard[u & 1 ? 0 : 1]); c.set(P.r(u), yi + 3, beard[1]); }
      c.set(P.l(0), yi + 4, beard[3]); c.set(P.r(0), yi + 4, beard[3]);
    } else {
      const ex = Math.round(hcx + g.hRx * 0.4);
      if (p.eyes === 'x') eyeX(c, ex + 1, yi, E); else eye3(c, ex + 1, ex, yi, { iris: eyeI, lash: E, dim: skin[1] });
      c.set(Math.round(hcx + g.hRx + 0.6), yi + 1, skin[1]);
      paint(c, polyM([[hcx - 1, yi + 2], [hcx + g.hRx - 0.5, yi + 2], [hcx + g.hRx - 1, yi + 5], [hcx + 3, yi + 7.5], [hcx - 1, yi + 6]]), shDiag(hcx, yi + 2, beard), 'bg');
    }
  },
  headgear(c, P) {
    const { hcx, hcy, g } = P, yi = Math.round(hcy), top = Math.round(hcy - g.hRy), hm = P.headMask;
    const crown = where(ellM(hcx, hcy - 1.5, g.hRx + 0.2, g.hRy + 0.6), (x, y) => y <= yi - 2);
    if (P.dir === 'e') {
      capPaint(c, crown, hcx, hcy - 3, g.hRx, g.hRy, hat);
      paint(c, polyM([[hcx - 8, yi - 2], [hcx + g.hRx + 4, yi - 2], [hcx + g.hRx + 4, yi - 3], [hcx + 3, yi - 4], [hcx - 7, yi - 4]]), shDiag(hcx, yi - 4, hat));
      for (let x = Math.round(hcx - 6); x <= Math.round(hcx + 5); x++) c.set(x, yi - 4, band[x & 1 ? 0 : 1]);
      return;
    }
    capPaint(c, crown, hcx, hcy - 3, g.hRx, g.hRy, hat);
    paint(c, polyM([[P.l(8), yi - 1], [P.r(8), yi - 1], [P.r(9), yi - 2], [P.r(6), yi - 4], [P.l(6), yi - 4], [P.l(9), yi - 2]]), shDiag(P.CX - 3, yi - 4, hat));
    for (let u = 0; u <= 6; u++) { c.set(P.l(u), yi - 4, band[u & 1 ? 0 : 1]); c.set(P.r(u), yi - 4, band[(u & 1) + 1]); }
    for (let u = 0; u <= 8; u++) { const ch = c.get(P.l(u), yi - 1); if (ch !== '.' && ch !== 'K') c.set(P.l(u), yi - 1, hat[3]); c.set(P.r(u), yi - 1, hat[3]); }
  },
  weapon(c, P) {
    const p = P.p, h = P.hands.main, dir = P.dir, a = p.wa || 0, r = a * Math.PI / 180, d = [Math.sin(r), -Math.cos(r)], n = [Math.cos(r), Math.sin(r)];
    if (p.portrait) return;
    const out = dir === 'n' ? 1 : (dir === 's' ? -1 : -1);   // scope offset side
    const bx = h.x - d[0] * 5, by = h.y - d[1] * 5;
    shaft(c, bx, by, a, 6, wood, 2, true);                       // stock
    const q = [h.x + d[0] * 0.5, h.y + d[1] * 0.5];
    const tip = shaft(c, q[0], q[1], a, 13, gun, 1, true);        // barrel
    const s0 = [h.x + d[0] * 3 + n[0] * out * 2, h.y + d[1] * 3 + n[1] * out * 2];
    shaft(c, s0[0], s0[1], a, 5, [gun[1], gun[2]], 1, true);      // scope
    const tx = tip[0] + d[0], ty = tip[1] + d[1];
    if (p.anim === 'attack' && p.i === 1) {
      c.set(tx, ty, fA); c.set(tx + d[0] * 1, ty + d[1] * 1, fA);
      for (const [k, ch] of [[2, fB], [3, fC]]) c.set(tx + d[0] * k, ty + d[1] * k, ch);
      for (const sgn of [-1, 1]) for (const [k, j, ch] of [[0, 1, fB], [1, 2, fC], [-1, 1, fC]]) c.set(tx + d[0] * k + n[0] * sgn * j, ty + d[1] * k + n[1] * sgn * j, ch);
    }
    if (p.anim === 'attack' && p.i === 2) { c.set(tx + d[0] * 2, ty + d[1] * 2, smoke[1]); c.set(tx + d[0] * 3 + n[0], ty + d[1] * 3 + n[1] - 1, smoke[2]); c.set(tx + d[0], ty + d[1], fC); }
    if (p.anim === 'cast' && p.i > 0) { const cx = tx + d[0] * 3, cy = ty + d[1] * 3; for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, 0], [1, 0], [0, -1], [0, 1]]) c.set(cx + dx, cy + dy, red); c.set(cx, cy, fA); }
  },
  pose(anim, d, i, p) {
    const s = d === 'n' ? -1 : 1, e = d === 'e';
    const A = (mx, my, ox, oy, wa) => { p.am = e ? [mx, my] : [mx * s, my]; p.ao = e ? [ox, oy] : [ox * s, oy]; p.wa = e ? wa : wa * s; };
    if (anim === 'idle') A(0, 0, 0, 0, e ? 56 - [0, 1, 1, 0][i] : -10 - [0, 1, 1, 0][i]);
    else if (anim === 'stunned') A(0, 1, 0, 0, e ? 30 : -4);
    else if (anim === 'walk') A(p.am[0], 0, p.ao[0], 0, e ? 54 + p.step * 3 : -10 + [2, 0, -2, 0][i]);
    else if (anim === 'attack') {
      if (i === 0) A(e ? 2 : 0, -3, 0, -1, e ? 62 : -4);
      else if (i === 1) { A(e ? 1 : 0, -3, 0, -1, e ? 66 : -2); p.tx = e ? -1 : 0; }
      else { A(e ? 1 : 0, -4, 0, -1, e ? 58 : -6); p.sq = 0.5; }
    } else if (anim === 'cast') { A(e ? -1 : 0, [-2, -3, -3][i], 0, [0, -1, -1][i], e ? [56, 54, 54][i] : [-6, -3, -3][i]); }
    return p;
  },
};
const sheet = buildSheet(cfg, PL);
console.log(writeSheet('sniper', sheet));
