// Juggernaut: ivory tribal mask, orange ponytail, red sash and kilt, katana; attack = wide slash with trail.
import { Pal, buildSheet, writeSheet, paint, ellM, polyM, shEll, shDiag, where, taperM, shNormal, capPaint, arcTrail, strokeM, eyeX } from './rig.mjs';

const PL = new Pal();
const skin = PL.r4('#f0bc88', '#d48e5e', '#a46044', '#683c38'), mask = PL.r4('#fffaec', '#f2dcb8', '#cfa680', '#8c6450');
const hair = PL.r4('#ffd070', '#f6943a', '#c85c20', '#7c3216'), cloth = PL.r4('#f0644a', '#c43832', '#8c2030', '#531226');
const gold = PL.r4('#fff0a8', '#ecbc40', '#aa761e', '#5c3a14'), brace = PL.r4('#9a8070', '#6e5450', '#48343c', '#2a1e28');
const boots = PL.r4('#7a5a58', '#523c3e', '#34262c', '#1e1420'), steel = PL.r4('#ffffff', '#e4ecf6', '#a8b8d0', '#667890');
const grip = PL.r4('#c44a44', '#8c2c34', '#5e1c2a', '#36101c');
const red = PL.c('#d8302c'), E = PL.c('#2a1018'), eyeI = PL.c('#ffa030', 0.6), emA = PL.c('#ffb448', 0.8), emB = PL.c('#fff2c0', 1);

const cfg = {
  W: 32, H: 32,
  g: { hRx: 6.6, hRy: 5.8, tRx: 4.8, tRy: 4.2, tRxE: 3.8, legLen: 6, legW: 3, legX: 2.8, stride: 2.4, armW: 2, armLen: 5, shOut: 1, handR: 1.4, headOv: 3.5, hx: 0, eHead: 2.5, eLean: -1, eArm: 1.8, starsUp: 5 },
  m: { head: mask, torso: skin, arm: skin, armD: PL.r4('#d48e5e', '#a46044', '#683c38', '#683c38'), hand: brace, handD: PL.r4('#6e5450', '#48343c', '#48343c', '#2a1e28'), pants: PL.r4('#9a8070', '#6e5450', '#6e5450', '#48343c'), pantsD: PL.r4('#6e5450', '#48343c', '#48343c', '#2a1e28'), shoe: boots },
  bustW: 16,

  back(c, P) {
    if (P.dir === 'e') {
      const t = P.p.t || 0, st = P.p.step || 0, top2 = P.tTop + 2, hem = P.hip + 3;
      paint(c, polyM([[P.tcx - 1, top2], [P.tcx + 2, top2], [P.tcx - 3 - st, hem], [P.tcx - 7 - Math.abs(st) - (t & 1), hem - 1]]), shDiag(P.tcx - 4, top2, cloth), 'bg');
    }
  },
  torsoDeco(c, P) {
    const { tcx, tcy, tRx, tRy } = P, e = P.dir === 'e', cx = e ? tcx : P.CX, hem = P.hip + 2, sk = e ? 2 : 2.6;
    // kilt
    const m = polyM([[cx - tRx + 0.5, tcy + tRy - 2], [cx + tRx - 0.5, tcy + tRy - 2], [cx + tRx + sk, hem], [cx - tRx - sk, hem]]);
    paint(c, m, shDiag(cx - 3, tcy + 1, cloth));
    for (let x = 0; x < c.w; x++) { const ch = c.get(x, hem); if (ch !== '.' && ch !== 'K') c.set(x, hem, gold[2]); }
    const by = Math.round(tcy + tRy - 2.5);
    for (let x = Math.round(cx - tRx); x <= Math.round(cx + tRx); x++) { const o = c.get(x, by); if (o !== '.' && o !== 'K') c.set(x, by, gold[x & 1 ? 1 : 2]); }
    if (P.dir === 's') {
      // red sash across chest
      for (let k = 0; k < 6; k++) { c.set(P.l(3) + k, Math.round(tcy - 2.5) + Math.floor(k * 0.7), cloth[k < 3 ? 1 : 2]); }
      c.set(P.r(0), by, gold[0]);
    }
    if (P.dir === 'n') paint(c, polyM([[P.CX - 4, P.tTop + 1], [P.CX + 4, P.tTop + 1], [P.CX + 4, by], [P.CX - 4, by]]), shDiag(P.CX - 3, P.tTop, skin), false);
  },
  headShape(c, P, hm) {
    paint(c, hm, shEll(P.hcx, P.hcy, P.g.hRx, P.g.hRy, mask, 0.1));
  },
  face(c, P) {
    const { hcx, hcy, g, p } = P, yi = Math.round(hcy);
    if (P.dir === 'n') return;
    if (P.dir === 's') {
      if (p.eyes === 'x') { eyeX(c, P.l(3), yi, E); eyeX(c, P.r(3) + 1, yi, E); }
      else for (const [sd, o] of [['l', -1], ['r', 1]]) { const px = P[sd]; c.set(px(4), yi - 1, E); c.set(px(3), yi - 1, E); c.set(px(2), yi, E); c.set(px(3), yi, E); c.set(px(4), yi, eyeI); c.set(px(1), yi - 1, E); }
      for (let y = yi - 4; y <= yi - 2; y++) { c.set(P.l(0), y, red); c.set(P.r(0), y, red); }
      for (let y = yi + 1; y <= yi + 3; y++) { c.set(P.l(5), y, red); c.set(P.r(5), y, red); }
      for (let u = 0; u <= 3; u++) { c.set(P.l(u), yi + 4, E); c.set(P.r(u), yi + 4, E); }
      c.set(P.l(1), yi + 3, 'W'); c.set(P.r(1), yi + 3, 'W');
    } else {
      const ex = Math.round(hcx + g.hRx * 0.4);
      if (p.eyes === 'x') eyeX(c, ex + 1, yi, E); else { c.set(ex, yi - 1, E); c.set(ex + 1, yi - 1, E); c.set(ex + 2, yi, E); c.set(ex + 1, yi, eyeI); c.set(ex, yi, eyeI); c.set(ex + 3, yi - 1, E); }
      for (let y = yi - 4; y <= yi - 2; y++) c.set(ex + 3, y, red);
      for (let y = yi + 1; y <= yi + 3; y++) c.set(ex - 2, y, red);
      c.set(Math.round(hcx + g.hRx + 0.4), yi + 2, mask[1]);
      for (let x = ex; x <= ex + 3; x++) c.set(x, yi + 4, E);
      c.set(ex + 1, yi + 3, 'W');
    }
  },
  headgear(c, P) {
    const { hcx, hcy, g } = P, yi = Math.round(hcy), top = Math.round(hcy - g.hRy), t = P.p.t || 0, fl = (t === 1 || t === 2) ? 1 : 0;
    if (P.dir === 's') {
      // headband of cloth and top knot
      for (let u = 0; u <= 5; u++) { c.set(P.l(u), yi - 4, cloth[u > 3 ? 2 : 1]); c.set(P.r(u), yi - 4, cloth[u > 3 ? 3 : 2]); }
      paint(c, polyM([[P.CX - 2, top + 1], [P.CX + 3, top + 1], [P.CX + 3, top - 3], [P.CX + 1, top - 5], [P.CX - 1, top - 3]]), shDiag(P.CX - 2, top - 3, hair), 'bg');
    } else if (P.dir === 'n') {
      capPaint(c, where(P.headMask, (x, y) => y <= yi - 1), hcx, hcy - 2, g.hRx, g.hRy, hair);
      paint(c, polyM([[P.CX - 2, top + 1], [P.CX + 3, top + 1], [P.CX + 3, yi + 9], [P.CX + 1 + fl, yi + 12], [P.CX - 3 - fl, yi + 10], [P.CX - 3, yi + 2]]), shDiag(P.CX - 2, top, hair), 'bg');
      for (let u = 0; u <= 5; u++) { c.set(P.l(u), yi + 1, cloth[2]); c.set(P.r(u), yi + 1, cloth[3]); }
    } else {
      for (let x = Math.round(hcx - 5); x <= Math.round(hcx + g.hRx - 1); x++) c.set(x, yi - 4, cloth[x & 1 ? 1 : 2]);
      const tail = polyM([[hcx - 1, top + 1], [hcx - 4, top + 1], [hcx - 9 - fl, yi], [hcx - 10 - fl, yi + 5], [hcx - 7, yi + 4], [hcx - 3, yi - 1]]);
      paint(c, tail, shDiag(hcx - 6, top, hair), 'bg');
      paint(c, polyM([[hcx - 1, top + 1], [hcx + 3, top + 1], [hcx + 1, top - 3], [hcx - 2, top - 3]]), shDiag(hcx - 2, top - 2, hair), 'bg');
    }
  },
  weapon(c, P) {
    const h = P.hands.main, p = P.p;
    if (p.slash) { const e = P.dir === 'e', n = P.dir === 'n'; const sg = e ? 1 : (n ? -1 : 1), a1 = p.wa, a0 = a1 - sg * 50, w = p.wl; for (const [r, ch] of [[w - 3, emA], [w - 2, emB]]) arcTrail(c, h.x, h.y, r, a0, a1 - sg * 10, [ch]); }
    if (p.portrait) return;
    katana(c, h.x, h.y, p.wa, p.wl || 20, p.glow || 0);
  },
  fx(c, P) {
    const p = P.p;
    if (p.anim === 'cast' && p.i > 0) [[-9, -3], [9, -6], [-7, 6], [8, 4]].forEach(([dx, dy]) => { const x = P.hcx + dx, y = P.hcy + dy - (p.i === 1 ? 1 : 0); c.set(x, y, emB); c.set(x + 1, y, emA); c.set(x, y + 1, emA); c.set(x - 1, y, emA); c.set(x, y - 1, emA); });
  },
  pose(anim, d, i, p) {
    const n = d === 'n', e = d === 'e', s = n ? -1 : 1;
    const set = (wa, wl, am, ao, extra = {}) => { p.wa = e ? wa : wa * s; p.wl = wl; p.am = e ? am : [am[0] * s, am[1]]; p.ao = ao ? (e ? ao : [ao[0] * s, ao[1]]) : [0, 0]; Object.assign(p, extra); };
    if (anim === 'idle') set(e ? -26 - [0, 1, 2, 1][i] : -12 - [0, 1, 1, 0][i], 19, [0, 0], null);
    else if (anim === 'walk') { set(e ? -28 + p.step * 3 : -12 + [2, 0, -2, 0][i], 19, p.am, p.ao); }
    else if (anim === 'attack') {
      if (e) { if (i === 0) set(-34, 13, [-3, -6], [-3, -3], { tx: -1, hx: -1 }); else if (i === 1) set(130, 12, [0, -5], [3, -3], { tx: 1, hy: 1, sq: 0.5, slash: 1 }); else set(140, 13, [2, -1], [1, 0], { tx: 1, sq: 0.5 }); }
      else { if (i === 0) set(-14, 15, [4, -5], [-3, -3], { hy: -1 }); else if (i === 1) set(124, 14, [5, -6], [-2, -3], { hy: 1, sq: 0.5, slash: 1 }); else set(146, 13, [4, -2], [-1, -1], { sq: 0.5 }); }
    } else if (anim === 'cast') {
      const a = [-14, 0, -6][i];
      set(e ? a + 8 : a, 14, e ? [-1, [-3, -6, -6][i]] : [1, [-3, -6, -6][i]], e ? [0, [-2, -5, -5][i]] : [-3, [-2, -5, -5][i]], { glow: i === 1 ? 2 : i === 2 ? 1 : 0, hy: i === 1 ? -1 : 0 });
    } else if (anim === 'stunned') set(e ? 30 : -12, 15, [0, 1], null);
    return p;
  },
};

function katana(c, hx, hy, a, len, glow) {
  const r = a * Math.PI / 180, d = [Math.sin(r), -Math.cos(r)], nn = [Math.cos(r), Math.sin(r)];
  const gx = hx + d[0] * 2.2, gy = hy + d[1] * 2.2;
  paint(c, strokeM(Math.round(hx - d[0] * 2.5), Math.round(hy - d[1] * 2.5), Math.round(hx), Math.round(hy), 1), grip[1]);
  paint(c, taperM(gx + d[0] * 0.8, gy + d[1] * 0.8, a, len, 1.2, 1.3, 0.4), shNormal(gx, gy, a, steel, 1.3));
  if (glow) for (let t = 3; t < len - 2; t += 2) c.set(gx + d[0] * t, gy + d[1] * t, glow > 1 ? emB : emA);
  const g1 = [gx - nn[0] * 2, gy - nn[1] * 2], g2 = [gx + nn[0] * 2, gy + nn[1] * 2];
  paint(c, strokeM(Math.round(g1[0]), Math.round(g1[1]), Math.round(g2[0]), Math.round(g2[1]), 1), shDiag(gx, gy, gold));
}

const sheet = buildSheet(cfg, PL);
console.log(writeSheet('juggernaut', sheet));
