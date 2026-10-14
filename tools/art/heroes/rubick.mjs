// Rubick, the Grand Magus: tall thin robed figure, deep green robes with gold trim, dark mask with a tall pair of golden horns and
// glowing green eyes, staff with a green orb. attack = staff thrust + bolt, cast = lifts a stolen-spell orb in the free hand.
import { SafePal, orb, shaft } from './props.mjs';
import { buildSheet, writeSheet, paint, polyM, shDiag, where, capPaint, ellM, strokeM, shEll, eyeX, arcTrail } from './rig.mjs';

const PL = new SafePal();
const robe = PL.r4('#9ae46a', '#58b440', '#357a34', '#1c4626'), robeD = PL.r4('#58b440', '#357a34', '#1c4626', '#10281c');
const cloak = PL.r4('#4cb468', '#2e8a56', '#1c5c3c', '#0e3626'), lining = PL.r4('#7a5ac8', '#563c9c', '#38266c', '#221848');
const maskc = PL.r4('#86a692', '#5a7a68', '#38564c', '#1e3232'), hood = PL.r4('#3a8060', '#266248', '#16402f', '#0c2420');
const gold = PL.r4('#fff4b0', '#f0c850', '#b08024', '#5c3c14'), bone = PL.r4('#fffbe8', '#eee0b4', '#c0a878', '#76603e');
const wood = PL.r4('#a8805a', '#765238', '#4a3224', '#2a1c16'), boots = PL.r4('#5a7a68', '#3a564a', '#243a34', '#141f22');
const skin = PL.r4('#d8f0c8', '#a0c898', '#6a9468', '#3e5c48');
const eyeG = PL.c('#8aff58', 0.9), eyeC = PL.c('#f0ffd8', 1.0), glowA = PL.c('#5cf04c', 0.8), glowB = PL.c('#d0ff98', 1.0), glowD = PL.c('#2aa838', 0.5);
const hornTip = PL.c('#fffbe8');

const shR = (cx, top, r) => (x, y) => { const v = -(x - cx) * 0.55 - (y - top) * 0.1; return r[v > 1.6 ? 0 : v > -0.8 ? 1 : v > -3 ? 2 : 3]; };
const cfg = {
  W: 42, H: 48,
  g: { hRx: 4.8, hRy: 4.6, tRx: 3.8, tRy: 6.6, tRxE: 3.4, legLen: 6, legW: 2, legX: 2, stride: 2, armW: 2, armLen: 5, shOut: 2.4, handR: 1.3, headOv: 2.2, hx: 0, eHead: 2, eLean: -0.5, eArm: 2, starsUp: 8 },
  m: { head: maskc, torso: robe, arm: robe, armD: robeD, hand: skin, handD: PL.r4('#a0c898', '#6a9468', '#6a9468', '#3e5c48'), pants: robeD, pantsD: robeD, shoe: boots },
  bustW: 16, bustBelow: 2,

  back(c, P) {
    const t = P.p.t || 0, sw = [0, 1, 1, 0][t % 4], st = P.p.step || 0, f = P.floor;
    if (P.dir === 'e') {   // cloak trailing behind
      const top = P.tTop + 1.5, x0 = P.tcx - 2;
      paint(c, polyM([[x0, top], [x0 + 3, top], [x0 + 1, f - 2], [x0 - 5 - sw - Math.abs(st) * 2, f - 1], [x0 - 5, top + 8]]), shR(x0 - 1, top, cloak), 'bg');
      for (let x = 0; x < c.w; x++) if (cloak.includes(c.get(x, f - 1))) c.set(x, f - 1, lining[1]);
    } else if (P.dir === 's') {   // inner lining flaring beyond the robe
      const top = P.tTop + 2;
      paint(c, polyM([[P.CX - 5, top], [P.CX + 5, top], [P.CX + 9 + sw, f - 1], [P.CX - 9 - sw, f - 1]]), shR(P.CX - 1, top, cloak), 'bg');
    }
  },
  torsoDeco(c, P) {
    const { tcx, tcy, tRx, tRy, p } = P, e = P.dir === 'e', cx = e ? tcx : P.CX, f = P.floor, t = p.t || 0, st = p.step || 0;
    const top = tcy - 1, hem = f - 1, sw = [0, 1, 1, 0][t % 4];
    if (P.dir === 'n') {
      paint(c, polyM([[cx - tRx - 0.5, top], [cx + tRx + 0.5, top], [cx + 7.5 + sw, hem], [cx - 7.5 - sw, hem]]), shR(cx - 1, top, cloak));
      for (let x = 0; x < c.w; x++) if (cloak.includes(c.get(x, hem))) c.set(x, hem, lining[1]);
      for (let y = Math.round(top + 3); y < hem - 1; y += 3) { c.over(P.l(0), y, cloak[3]); c.over(P.r(0), y, cloak[3]); }
      for (let u = 0; u <= 4; u++) { c.over(P.l(u), Math.round(top + 2), gold[2]); c.over(P.r(u), Math.round(top + 2), gold[2]); }
      return;
    }
    const sk = e ? 4 : 5.8;
    paint(c, polyM([[cx - tRx + 0.5, top], [cx + tRx - 0.5, top], [cx + sk + (e ? st * 1.5 : 0), hem], [cx - sk + (e ? st * 1.5 : 0), hem]]), shR(cx - 1, top, robe), false);
    for (let x = 0; x < c.w; x++) { const ch = c.get(x, hem); if (ch !== '.' && ch !== 'K') { c.set(x, hem, gold[x & 1 ? 1 : 2]); c.over(x, hem - 1, robeD[1]); } }
    // lower shadow fold
    for (let y = Math.round(hem - 3); y < hem - 1; y++) for (let x = 0; x < c.w; x++) if (robe.includes(c.get(x, y)) && ((x + y) & 1)) c.set(x, y, robe[2]);
    if (P.dir === 's') {
      // front opening of the robe with gold edge + sash
      for (let y = Math.round(top + 2); y < hem; y++) { const w = Math.min(2, Math.floor((y - top) / 4)); c.over(P.l(0) - w, y, gold[2]); c.over(P.r(0) + w, y, gold[2]); for (let u = 0; u < w; u++) { c.over(P.l(0) - u, y, robeD[2]); c.over(P.r(0) + u, y, robeD[2]); } }
      const by = Math.round(tcy + tRy - 2);
      for (let x = Math.round(cx - tRx); x <= Math.round(cx + tRx); x++) { c.over(x, by, lining[1]); c.over(x, by + 1, lining[2]); }
      c.set(P.l(0), by, gold[0]); c.set(P.r(0), by, gold[1]); c.set(P.l(0), by + 1, gold[1]); c.set(P.r(0), by + 1, gold[2]);
      // collar bands
      for (let u = 0; u <= 3; u++) { c.over(P.l(u), Math.round(tcy - tRy + 2), gold[u & 1 ? 1 : 0]); c.over(P.r(u), Math.round(tcy - tRy + 2), gold[2]); }
    } else {
      for (let y = Math.round(top + 3); y < hem; y += 1) c.over(Math.round(cx + 1), y, robeD[1]);
      const by = Math.round(tcy + tRy - 2);
      for (let x = Math.round(cx - tRx); x <= Math.round(cx + tRx); x++) { c.over(x, by, lining[1]); c.over(x, by + 1, lining[2]); }
      c.set(Math.round(cx + 1), by, gold[0]);
    }
  },
  weaponMid(c, P) {   // high collar / pauldrons
    const ty = P.tTop + 2.4;
    if (P.dir === 'e') { const m = ellM(P.tcx - 1, ty + 0.5, 3, 2.4); paint(c, m, shEll(P.tcx - 1, ty + 0.5, 3, 2.4, hood, 0.1)); c.set(P.tcx - 2, ty - 1, gold[1]); c.set(P.tcx - 1, ty - 1, gold[0]); return; }
    for (const sd of [-1, 1]) {
      const cx = sd < 0 ? P.l(0) - P.tRx - 0.4 : P.r(0) + P.tRx + 0.4;
      paint(c, ellM(cx, ty, 3.2, 2.6), shEll(cx, ty, 3.2, 2.6, hood, 0.1)); c.set(cx - sd * 0.5, ty - 1, gold[1]); c.set(cx + sd, ty - 1, gold[2]);
    }
  },
  headShape(c, P, hm) {
    paint(c, hm, shEll(P.hcx, P.hcy, P.g.hRx, P.g.hRy, maskc, 0.1));
  },
  face(c, P) {
    const { hcx, hcy, g, p } = P, yi = Math.round(hcy);
    if (P.dir === 'n') {   // back of the helm: gold ridge
      for (let y = Math.round(hcy - g.hRy + 1); y <= yi + 3; y++) { c.over(P.l(0), y, gold[y & 1 ? 1 : 2]); c.over(P.r(0), y, gold[2]); }
      return;
    }
    if (P.dir === 's') {
      for (let y = Math.round(hcy - g.hRy + 1); y <= yi + 4; y++) { c.over(P.l(0), y, gold[y & 1 ? 0 : 1]); c.over(P.r(0), y, gold[y & 1 ? 1 : 2]); }   // central ridge
      // slanted glowing eyes
      if (p.eyes === 'x') { eyeX(c, P.l(2), yi, 'K'); eyeX(c, P.r(2) + 1, yi, 'K'); }
      else {
        for (const sd of ['l', 'r']) { const px = P[sd], o = sd === 'l' ? -1 : 1;
          c.set(px(1), yi + 1, eyeG); c.set(px(2), yi, eyeC); c.set(px(3), yi, eyeG); c.set(px(4), yi - 1, eyeG); c.set(px(2), yi + 1, eyeG);
          c.set(px(4), yi, 'K'); c.set(px(5), yi - 1, 'K'); c.set(px(1), yi + 2, 'K');
        }
      }
      // chin plate
      for (let u = 0; u <= 2; u++) { c.set(P.l(u), yi + 4, gold[2]); c.set(P.r(u), yi + 4, gold[2]); }
      c.set(P.l(0), yi + 5, gold[3]); c.set(P.r(0), yi + 5, gold[3]);
    } else {
      const ex = Math.round(hcx + g.hRx * 0.4);
      if (p.eyes === 'x') eyeX(c, ex + 1, yi, 'K'); else { c.set(ex + 1, yi, eyeC); c.set(ex, yi + 1, eyeG); c.set(ex + 2, yi - 1, eyeG); c.set(ex + 1, yi + 1, eyeG); c.set(ex + 3, yi - 1, 'K'); }
      for (let x = Math.round(hcx - 1); x <= Math.round(hcx + g.hRx + 0.4); x++) c.over(x, yi + 4, gold[2]);
      c.set(Math.round(hcx + g.hRx + 0.4), yi + 3, gold[1]); c.set(Math.round(hcx + g.hRx + 1), yi + 4, gold[3]);
      for (let y = Math.round(hcy - g.hRy + 1); y <= yi + 3; y++) c.over(Math.round(hcx + 1), y, gold[2]);
    }
  },
  headgear(c, P) {   // tall golden horns
    const { hcx, hcy, g, p } = P, top = Math.round(hcy - g.hRy), sw = [0, 1, 1, 0][(p.t || 0) % 4];
    const horn = (pts, cx, cy) => paint(c, polyM(pts), shDiag(cx, cy, gold), 'bg');
    if (P.dir === 'e') {
      horn([[hcx - 3, top + 2], [hcx + 1, top + 1], [hcx + 1, top - 3], [hcx - 1, top - 7], [hcx - 5, top - 5], [hcx - 3, top - 1]], hcx - 1, top - 3);
      horn([[hcx + 1, top + 1], [hcx + 4, top + 1], [hcx + 5, top - 2], [hcx + 3, top - 4], [hcx + 2, top - 1]], hcx + 3, top - 2);
      c.set(hcx - 4, top - 6, hornTip);
      for (let x = Math.round(hcx - 3); x <= Math.round(hcx + g.hRx - 2); x++) c.over(x, top + 2, gold[2]);
    } else {
      for (const sd of ['l', 'r']) {
        const px = P[sd], o = sd === 'l' ? -1 : 1;
        horn([[px(1.5), top + 2], [px(4.8), top + 2.5], [px(5.8), top - 2], [px(5), top - 5], [px(4.2), top - 8], [px(3.2), top - 5.5], [px(3), top - 2]], px(3), top - 3);
        c.set(px(4.2), top - 8, hornTip);
      }
      for (let u = 0; u <= 5; u++) { c.over(P.l(u), top + 2, gold[u & 1 ? 1 : 2]); c.over(P.r(u), top + 2, gold[2]); }
      c.set(P.l(0), top + 2, gold[0]); c.set(P.r(0), top + 2, gold[1]);
    }
  },
  weapon(c, P) {
    const p = P.p, h = P.hands.main, o = P.hands.off, dir = P.dir, a = p.wa || 0, r = a * Math.PI / 180, d = [Math.sin(r), -Math.cos(r)];
    if (p.portrait) return;
    const bx = h.x - d[0] * 5, by = h.y + d[1] * -5;
    shaft(c, h.x - d[0] * 5, h.y + d[1] * 5, a, 20, wood, 1, true);
    const tx = h.x + d[0] * 14, ty = h.y + d[1] * 14;
    // gold crook around the orb
    for (let k = 0; k < 5; k++) { const kk = k / 4 * Math.PI; c.set(tx + Math.cos(kk + r) * 3, ty - Math.sin(kk + r) * 3 + 0, gold[k & 1 ? 0 : 1]); }
    const big = p.orbBig || 0;
    orb(c, tx, ty - 1, 2 + big, [glowB, glowA, glowD]);
    c.set(tx, ty - 1, eyeC);
    if (p.slash) { for (let k = 1; k <= 2; k++) { const x = tx + d[0] * (3 + k * 2) + (dir === 'e' ? 0 : 0), y = ty + d[1] * (3 + k * 2); if (c.get(x, y) === '.') c.set(x, y, k < 3 ? glowB : glowA); } }
    if (p.offOrb && o) { orb(c, o.x, o.y - 5 - (p.offOrb > 1 ? 1 : 0), 2, [glowB, glowA, glowD]); c.set(o.x, o.y - 5 - (p.offOrb > 1 ? 1 : 0), eyeC); for (const [dx, dy] of [[-3, -7], [3, -6], [0, -9]]) c.set(o.x + dx, o.y + dy, glowA); }
  },
  fx(c, P) {
    const p = P.p;
    if (p.portrait || p.anim !== 'cast' || p.i === 0) return;
    const hx = P.hcx, hy = P.hcy - 8, k = p.i === 2 ? 1 : 0;
    for (const [dx, dy] of [[-10, 6], [10, 6 - k], [-8, -2 - k], [9, -3]]) { c.set(hx + dx, hy + dy, glowA); c.set(hx + dx, hy + dy + 1, glowD); }
  },
  pose(anim, d, i, p) {
    const s = d === 'n' ? -1 : 1, e = d === 'e';
    const A = (mx, my, ox, oy, wa) => { p.am = e ? [mx, my] : [mx * s, my]; p.ao = e ? [ox, oy] : [ox * s, oy]; p.wa = e ? wa : wa * s; };
    if (anim === 'idle') A(0, -1, 0, 0, e ? 8 : -3 - [0, 0, 1, 1][i]);
    else if (anim === 'stunned') A(0, 1, 0, 0, e ? 24 : -12);
    else if (anim === 'walk') A(p.am[0] * 0.6, -1, p.ao[0] * 0.6, 0, e ? 8 + p.step * 3 : -3 + [1, 0, -1, 0][i]);
    else if (anim === 'attack') {
      if (i === 0) { A(-2, -4, 0, -1, e ? -14 : -12); p.tx = -1; }
      else if (i === 1) { A(e ? 3 : 1, -2, 0, 0, e ? 48 : 20); p.slash = 1; p.orbBig = 1; p.sq = 0.5; p.tx = e ? 0 : 0; }
      else { A(0, -1, 0, 0, e ? 30 : 8); p.sq = 0.5; }
    } else if (anim === 'cast') { A([0, 1, 1][i], -1, [0, 1, 1][i], [-3, -8, -8][i], e ? 8 : -6); p.offOrb = i; p.orbBig = i ? 1 : 0; if (i) p.hy = -1; }
    return p;
  },
};
const sheet = buildSheet(cfg, PL);
console.log(writeSheet('rubick', sheet));
