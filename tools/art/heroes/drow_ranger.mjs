// Drow Ranger: blue-skinned archer, white hair, dark hood, bow. attack_0 = draw, attack_1 = release, attack_2 = recover.
import { Pal, buildSheet, writeSheet, paint, polyM, shDiag, where, capPaint, eye3, eyeX, ellM } from './rig.mjs';

const PL = new Pal();
const skin = PL.r4('#c8d4ff', '#8c9ce8', '#5868b8', '#363f84'), hair = PL.r4('#ffffff', '#eef2ff', '#b8c4e8', '#7684ba');
const hood = PL.r4('#4a5a78', '#2e3a56', '#1c2438', '#10161e'), leather = PL.r4('#9a8ac8', '#6c5ca4', '#4a3e7c', '#2c2450');
const trim = PL.r4('#baf4ff', '#5cd0f0', '#2c8cbc', '#1a4c78'), wood = PL.r4('#e8d0a0', '#b8905c', '#80583a', '#4a301e');
const boots = PL.r4('#7a6aa0', '#54467c', '#382e58', '#221a3c'), quiver = PL.r4('#a8785a', '#7a5040', '#52322c', '#2e1c1c');
const str = PL.c('#f4f8ff'), fl = PL.c('#fff6a8', 0.8), eyeI = PL.c('#6ae8ff', 0.25), E = PL.c('#1c1c4a'), lip = PL.c('#6a7ec4'), gem = PL.c('#9af4ff', 0.3);

function bow(c, P, bxx, byy, R, bulge, pullX) {
  // vertical limb arc centred on (bxx,byy); bulge: +1 bulges right, -1 left; string pulled by pullX (toward body)
  const top = [bxx, byy - R], bot = [bxx, byy + R];
  for (let t = -R; t <= R; t++) { const x = Math.round(bxx + bulge * 3 * (1 - (t / R) ** 2)), y = Math.round(byy + t); const ch = Math.abs(t) > R * 0.7 ? wood[0] : (t < 0 ? wood[1] : wood[2]); c.set(x - 0 * bulge, y, ch); c.set(x + bulge * 0, y, ch); if (c.get(x - bulge, y) === '.') c.set(x - bulge, y, 'K'); if (c.get(x + bulge, y) === '.' ) c.set(x + bulge, y, 'K'); }
  c.set(top[0], top[1] - 1, 'K'); c.set(bot[0], bot[1] + 1, 'K');
  const sx = bxx - bulge * pullX;
  for (let t = 0; t <= R; t++) { const x = bxx + (sx - bxx) * (t / R), y = byy - R + t; c.set(x, y, str); }
  for (let t = 0; t <= R; t++) { const x = bxx + (sx - bxx) * (1 - t / R), y = byy + t; c.set(x, y, str); }
  return sx;
}

const cfg = {
  W: 30, H: 32,
  g: { hRx: 6.4, hRy: 5.6, tRx: 4.2, tRy: 4, tRxE: 3.4, legLen: 6, legW: 2, legX: 2.5, stride: 2.2, armW: 2, armLen: 5, shOut: 0.9, handR: 1.3, headOv: 3.5, hx: 0, eHead: 2, eLean: -1, eArm: 1.5, starsUp: 4 },
  m: { head: skin, torso: leather, arm: hood, armD: PL.r4('#4a58a0', '#303a74', '#1c2250', '#1c2250'), hand: skin, handD: PL.r4('#b0d4f4', '#7aa0d2', '#7aa0d2', '#44609c'), pants: PL.r4('#6c5ca4', '#4a3e7c', '#4a3e7c', '#2c2450'), pantsD: PL.r4('#4a3e7c', '#2c2450', '#2c2450', '#1a1434'), shoe: boots },
  bustW: 16,

  back(c, P) {
    const { hcx, hcy, g } = P, yi = Math.round(hcy), top = Math.round(hcy - g.hRy), t = P.p.t || 0, sw = [0, 1, 1, 0][t % 4];
    if (P.dir === 's') {   // quiver peeking over the shoulder + cloak sides
      const qx = P.CX + 5;
      paint(c, polyM([[qx - 1, P.tTop - 1], [qx + 2, P.tTop - 2], [qx + 3, P.tTop + 6], [qx, P.tTop + 7]]), shDiag(qx, P.tTop, quiver), 'bg');
      for (const dx of [0, 2]) { c.set(qx + dx, P.tTop - 3, fl); c.set(qx + dx, P.tTop - 4, 'K'); }
    } else if (P.dir === 'e') {
      paint(c, polyM([[P.tcx - 1, P.tTop + 1.5], [P.tcx + 2, P.tTop + 1.5], [P.tcx - 3, P.hip + 2], [P.tcx - 7 - sw, P.hip + 2]]), shDiag(P.tcx - 4, P.tTop, hood), 'bg');
      paint(c, polyM([[P.tcx - 4, P.tTop - 2], [P.tcx - 1, P.tTop - 3], [P.tcx + 0, P.tTop + 6], [P.tcx - 4, P.tTop + 7]]), shDiag(P.tcx - 3, P.tTop, quiver), 'bg');
      c.set(P.tcx - 3, P.tTop - 4, fl); c.set(P.tcx - 1, P.tTop - 4, fl);
    }
  },
  torsoDeco(c, P) {
    const { tcx, tcy, tRx } = P, e = P.dir === 'e', cx = e ? tcx : P.CX, hem = P.hip + 1;
    paint(c, polyM([[cx - tRx + 0.5, tcy + 1], [cx + tRx - 0.5, tcy + 1], [cx + tRx + 1.5, hem], [cx - tRx - 1.5, hem]]), shDiag(cx - 4, tcy - 3, leather));
    for (let x = 0; x < c.w; x++) { const ch = c.get(x, hem); if (ch !== '.' && ch !== 'K') c.set(x, hem, trim[2]); }
    const by = Math.round(tcy + 1);
    if (P.dir === 's') { for (let k = 0; k < 3; k++) { c.set(P.l(2 + k), Math.round(tcy - 2) + k, trim[k ? 1 : 0]); c.set(P.r(2 + k), Math.round(tcy - 2) + k, trim[k ? 2 : 1]); } c.set(P.l(0), by, gem); c.set(P.r(0), by, trim[1]); }
    if (P.dir === 'n') { paint(c, polyM([[P.CX - 4, P.tTop], [P.CX + 4, P.tTop], [P.CX + 5, hem - 1], [P.CX - 5, hem - 1]]), shDiag(P.CX - 3, P.tTop, hood), 'bg'); }
  },
  face(c, P) {
    const { hcx, hcy, g, p } = P, yi = Math.round(hcy);
    if (P.dir === 'n') return;
    if (P.dir === 's') {
      if (p.eyes === 'x') { eyeX(c, P.l(2), yi, E); eyeX(c, P.r(2) + 1, yi, E); }
      else { eye3(c, P.l(3), P.l(2), yi, { iris: eyeI, lash: E, dim: skin[1] }); eye3(c, P.r(3), P.r(2), yi, { iris: eyeI, lash: E, dim: skin[1] }); }
      c.set(P.l(0), yi + 4, lip); c.set(P.r(0), yi + 4, lip);
      for (let y = yi + 1; y <= yi + 4; y++) { c.set(P.l(5), y, hood[2]); c.set(P.r(5), y, hood[2]); }
    } else {
      const ex = Math.round(hcx + g.hRx * 0.4);
      if (p.eyes === 'x') eyeX(c, ex + 1, yi, E); else eye3(c, ex + 1, ex, yi, { iris: eyeI, lash: E, dim: skin[1] });
      c.set(Math.round(hcx + g.hRx + 0.4), yi + 2, skin[1]); c.set(ex + 2, yi + 4, lip);
    }
  },
  headgear(c, P) {
    const { hcx, hcy, g } = P, yi = Math.round(hcy), top = Math.round(hcy - g.hRy), hm = P.headMask, t = P.p.t || 0, sw = [0, 1, 1, 0][t % 4];
    const hd = ellM(hcx, hcy - 1.2, g.hRx + 0.6, g.hRy + 0.8);
    if (P.dir === 's') {
      const m = where(hd, (x, y) => y <= yi - 2 );
      capPaint(c, m, hcx, hcy - 3, g.hRx + 0.6, g.hRy + 0.8, hood);
      for (let u = 0; u <= 5; u++) { c.set(P.l(u), yi - 2, trim[u & 1 ? 2 : 1]); c.set(P.r(u), yi - 2, trim[2]); }
      c.set(P.l(0), yi - 3, gem); c.set(P.r(0), yi - 3, gem);
      for (let u = 0; u <= 3; u++) { c.set(P.l(u), yi - 1 + (u > 1 ? 0 : 0), hair[u < 2 ? 0 : 1]); }
      for (const sd of ['l', 'r']) { const px = P[sd], o = sd === 'l' ? -1 : 1; paint(c, polyM([[px(5.5), yi + 1], [px(7), yi + 1], [px(7.5) + o * sw, yi + 9], [px(5.5), yi + 10]]), shDiag(px(6), yi + 3, hair), 'bg'); }
    } else if (P.dir === 'n') {
      capPaint(c, hd, hcx, hcy - 3, g.hRx + 0.6, g.hRy + 0.8, hood);
      for (let u = 0; u <= 6; u++) { c.set(P.l(u), yi + 2, trim[2]); c.set(P.r(u), yi + 2, trim[2]); }
      paint(c, polyM([[P.CX - 3, yi + 3], [P.CX + 3, yi + 3], [P.CX + 3 + sw, yi + 11], [P.CX - 3 - sw, yi + 11]]), shDiag(P.CX - 3, yi + 3, hair), 'bg');
      for (let y = top; y <= yi + 1; y += 3) { c.set(P.l(0), y, hood[0]); c.set(P.r(0), y, hood[2]); }
    } else {
      const m = where(hd, (x, y) => y <= yi - 2 || x <= hcx);
      capPaint(c, m, hcx, hcy - 3, g.hRx + 0.6, g.hRy + 0.8, hood);
      for (let x = Math.round(hcx - 4); x <= Math.round(hcx + g.hRx - 1); x++) { c.set(x, yi - 2, trim[x & 1 ? 1 : 2]); }
      for (let y = yi - 2; y <= yi + 4; y++) c.set(Math.round(hcx + 1), y, trim[y & 1 ? 2 : 1]);
      paint(c, polyM([[hcx - 3, yi + 2], [hcx, yi + 2], [hcx - 3 - sw, yi + 10], [hcx - 6, yi + 10]]), shDiag(hcx - 3, yi + 2, hair), 'bg');
    }
  },
  weapon(c, P) {
    const p = P.p, h = P.hands.main, o = P.hands.off, e = P.dir === 'e', n = P.dir === 'n';
    if (p.portrait) return;
    const bulge = e ? 1 : (n ? 1 : -1);
    const pull = p.pull || 0;
    const bxx = Math.round(e ? h.x + 2 : h.x + (n ? 2 : -3)), byy = Math.round(h.y + 1), R = 6;
    const sx = bow(c, P, bxx, byy, R, bulge, pull);
    if (p.arrow) {
      if (e) {
        const ax = Math.round(p.arrow === 'fly' ? bxx + 1 : sx), ay = byy;
        for (let k = 0; k < 6; k++) c.set(ax + k, ay, k === 5 ? fl : (k < 2 ? hair[1] : wood[0]));
        c.set(ax + 6, ay, 'K');
      } else {
        const dirY = n ? -1 : 1, ax = Math.round(sx), ay = byy + (p.arrow === 'fly' ? dirY * 6 : 0);
        for (let k = 0; k < 6; k++) c.set(ax, ay + dirY * k, k === 5 ? fl : wood[0]);
      }
    }
    if (p.pull && o) { o.x = o.x; }
  },
  pose(anim, d, i, p) {
    const s = d === 'n' ? -1 : 1, e = d === 'e';
    const A = (mx, my, ox, oy) => { p.am = e ? [mx, my] : [mx * s, my]; p.ao = e ? [ox, oy] : [ox * s, oy]; };
    if (anim === 'idle' || anim === 'stunned') A(0, -2, 0, 0);
    else if (anim === 'walk') A(p.am[0], -2, p.ao[0], 0);
    else if (anim === 'attack') {
      if (i === 0) { A(e ? 2 : -1, -4, e ? -2 : 3, -4); p.pull = 4; p.arrow = 'nock'; }
      else if (i === 1) { A(e ? 3 : -1, -4, e ? 0 : 0, -3); p.pull = 0; p.arrow = 'fly'; p.tx = e ? -1 : 0; }
      else { A(e ? 1 : 0, -3, 0, -1); p.pull = 0; p.sq = 0.5; }
    } else if (anim === 'cast') { A(e ? 2 : -1, [-4, -6, -6][i], e ? -2 : 3, [-4, -6, -6][i]); p.pull = [3, 5, 5][i]; p.arrow = i ? 'nock' : 0; if (i) p.hy = -1; }
    return p;
  },
};
const sheet = buildSheet(cfg, PL);
console.log(writeSheet('drow_ranger', sheet));
