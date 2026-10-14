// Crystal Maiden: blue hooded cloak, white fur trim, pale skin, ice staff with glowing cyan crystal.
import { Pal, buildSheet, writeSheet, paint, polyM, shDiag, where, capPaint, eye3, eyeX, ellM, shEll } from './rig.mjs';
import { orb, shaft } from './props.mjs';

const PL = new Pal();
const skin = PL.r4('#fff4ee', '#fadcd0', '#d8a8a4', '#98686c'), cloak = PL.r4('#7cbaff', '#3e86e0', '#2858b4', '#183a7c');
const fur = PL.r4('#ffffff', '#eef6ff', '#b8cfea', '#7a96c0'), blond = PL.r4('#fffbe4', '#f6ecbc', '#d6c28a', '#9a8458');
const dress = PL.r4('#b4e0ff', '#70b4f4', '#4080cc', '#284c92'), stick = PL.r4('#f0f8ff', '#b4d0ea', '#7096be', '#3e5c86');
const boots = PL.r4('#e4f0ff', '#9cb8dc', '#5c7aa8', '#34486c');
const cA = PL.c('#f6ffff', 1), cB = PL.c('#9af4ff', 0.9), cC = PL.c('#38b8f0', 0.6), sp = PL.c('#d8fcff', 1), eyeI = PL.c('#2c94ec', 0.3), E = PL.c('#1a2c5c'), lip = PL.c('#d8808c');

const cfg = {
  W: 30, H: 32,
  g: { hRx: 6.4, hRy: 5.6, tRx: 4.2, tRy: 4, tRxE: 3.4, legLen: 6, legW: 2, legX: 2.5, stride: 2.2, armW: 2, armLen: 5, shOut: 0.9, handR: 1.4, headOv: 3.5, hx: 0, eHead: 2, eLean: -1, eArm: 1.5, starsUp: 4 },
  m: { head: skin, torso: dress, arm: cloak, armD: PL.r4('#3e86e0', '#2858b4', '#183a7c', '#183a7c'), hand: skin, handD: PL.r4('#fadcd0', '#d8a8a4', '#d8a8a4', '#98686c'), pants: PL.r4('#e4f0ff', '#9cb8dc', '#9cb8dc', '#5c7aa8'), pantsD: PL.r4('#9cb8dc', '#5c7aa8', '#5c7aa8', '#34486c'), shoe: boots },
  bustW: 16,

  back(c, P) {
    const { hcx, hcy, g } = P, yi = Math.round(hcy), top = Math.round(hcy - g.hRy), t = P.p.t || 0, sw = [0, 1, 1, 0][t % 4];
    if (P.dir === 'e') {
      paint(c, polyM([[P.tcx - 1, P.tTop + 1.5], [P.tcx + 2, P.tTop + 1.5], [P.tcx - 3, P.hip + 3], [P.tcx - 8 - sw, P.hip + 3 - (t & 1)], [P.tcx - 6, P.tTop + 6]]), shDiag(P.tcx - 4, P.tTop + 1, cloak), 'bg');
    }
  },
  torsoDeco(c, P) {
    const { tcx, tcy, tRx } = P, hem = P.hip + 3, e = P.dir === 'e', cx = e ? tcx : P.CX, sk = e ? 2.4 : 3;
    const m = polyM([[cx - tRx + 0.5, tcy + 0.5], [cx + tRx - 0.5, tcy + 0.5], [cx + tRx + sk, hem], [cx - tRx - sk, hem]]);
    paint(c, m, shDiag(cx - 3, tcy + 1, P.dir === 'n' ? cloak : dress));
    for (let x = 0; x < c.w; x++) { for (const y of [hem - 1, hem]) { const ch = c.get(x, y); if (ch !== '.' && ch !== 'K') c.set(x, y, fur[(x + y) & 1 ? 0 : 1]); } }
    if (P.dir === 's') {
      for (const [dx, dy] of [[0, -1], [1, 0], [2, 1]]) { c.set(P.l(dx), Math.round(tcy - 1) + dy, fur[dx ? 1 : 0]); c.set(P.r(dx), Math.round(tcy - 1) + dy, fur[dx ? 2 : 1]); }
      c.set(P.l(0), Math.round(tcy + 1), cB); c.set(P.r(0), Math.round(tcy + 1), cC);
    }
    if (P.dir === 'n') for (let y = Math.round(tcy); y < hem - 2; y += 2) { c.set(P.l(0), y, cloak[0]); c.set(P.r(0), y, cloak[2]); }
  },
  face(c, P) {
    const { hcx, hcy, g, p } = P, yi = Math.round(hcy);
    if (P.dir === 'n') return;
    if (P.dir === 's') {
      if (p.eyes === 'x') { eyeX(c, P.l(2), yi, E); eyeX(c, P.r(2) + 1, yi, E); }
      else { eye3(c, P.l(3), P.l(2), yi, { iris: eyeI, lash: E, dim: skin[1] }); eye3(c, P.r(3), P.r(2), yi, { iris: eyeI, lash: E, dim: skin[1] }); }
      c.set(P.l(0), yi + 4, lip); c.set(P.r(0), yi + 4, lip); c.set(P.l(4), yi + 3, skin[2]); c.set(P.r(4), yi + 3, skin[2]);
    } else {
      const ex = Math.round(hcx + g.hRx * 0.4);
      if (p.eyes === 'x') eyeX(c, ex + 1, yi, E); else eye3(c, ex + 1, ex, yi, { iris: eyeI, lash: E, dim: skin[1] });
      c.set(Math.round(hcx + g.hRx + 0.4), yi + 2, skin[1]); c.set(ex + 2, yi + 4, lip);
    }
  },
  headgear(c, P) {
    const { hcx, hcy, g } = P, yi = Math.round(hcy), top = Math.round(hcy - g.hRy), hm = P.headMask, t = P.p.t || 0;
    const hood = ellM(hcx, hcy - 1.2, g.hRx + 0.6, g.hRy + 0.8);
    if (P.dir === 's') {
      const m = where(hood, (x, y) => y <= yi - 2 || ((x <= P.l(5) || x >= P.r(5)) && y <= yi + 4));
      capPaint(c, m, hcx, hcy - 3, g.hRx + 0.6, g.hRy + 0.8, cloak);
      for (let u = 0; u <= 7; u++) for (const o of [0, 1]) { const y = yi - 3 + o; c.set(P.l(u), y, fur[(u + o) & 1 ? 1 : 0]); c.set(P.r(u), y, fur[(u + o) & 1 ? 2 : 1]); }
      for (const y of [yi - 1, yi, yi + 1, yi + 2]) for (const sdn of [P.l(5), P.r(5)]) c.set(sdn, y, fur[y & 1 ? 0 : 1]);
      c.set(P.l(0), yi - 2, blond[1]); c.set(P.r(0), yi - 2, blond[1]); c.set(P.l(1), yi - 2, blond[2]); c.set(P.r(1), yi - 2, blond[2]);
      for (let y = yi + 3; y <= yi + 5; y++) { c.set(P.l(5), y, blond[1]); c.set(P.r(5), y, blond[2]); }
    } else if (P.dir === 'n') {
      capPaint(c, hood, hcx, hcy - 3, g.hRx + 0.6, g.hRy + 0.8, cloak);
      for (let u = 0; u <= 6; u++) { c.set(P.l(u), yi + 2, fur[u & 1]); c.set(P.r(u), yi + 2, fur[1 + (u & 1)]); }
      for (let y = top; y <= yi + 1; y += 3) { c.set(P.l(0), y, cloak[0]); c.set(P.r(0), y, cloak[2]); }
      for (let u = 0; u <= 1; u++) for (let y = yi + 3; y <= yi + 6; y++) { c.set(P.l(u + 1), y, blond[u + 1]); c.set(P.r(u + 1), y, blond[u + 2]); }
    } else {
      const m = where(hood, (x, y) => y <= yi - 2 || x <= hcx);
      capPaint(c, m, hcx, hcy - 3, g.hRx + 0.6, g.hRy + 0.8, cloak);
      for (let x = Math.round(hcx - 3); x <= Math.round(hcx + g.hRx - 1); x++) { c.set(x, yi - 3, fur[x & 1]); c.set(x, yi - 2, fur[(x + 1) & 1 ? 1 : 2]); }
      for (let y = yi - 3; y <= yi + 4; y++) { c.set(Math.round(hcx + 1), y, y & 1 ? fur[1] : fur[0]); }
      for (let y = yi + 3; y <= yi + 6; y++) c.set(Math.round(hcx - 3), y, blond[1]);
    }
  },
  weapon(c, P) {
    const p = P.p, h = P.hands.main, e = P.dir === 'e', a = p.wa || 0, r = a * Math.PI / 180, d = [Math.sin(r), -Math.cos(r)];
    if (p.portrait) return;
    const bx = h.x - d[0] * 4, by = h.y - d[1] * 4, L = 14;
    const tip = shaft(c, bx, by, a, L, stick, 1, true);
    const gl = p.glow || 0, R = 2.4 + gl * 0.6;
    const cx = tip[0] + d[0] * 1.5, cy = tip[1] + d[1] * 1.5;
    paint(c, polyM([[cx, cy - R - 1], [cx + R, cy], [cx, cy + R + 1], [cx - R, cy]]), (x, y) => { const q = Math.hypot(x - cx, (y - cy) * 0.8) / R; return q < 0.45 ? cA : q < 0.95 ? cB : cC; }, 'bg');
    if (gl) for (const [dx, dy] of [[-3, -2], [4, -3], [-2, 4], [4, 3], [0, -R - 3]]) { const x = cx + dx, y = cy + dy; c.set(x, y, sp); c.set(x - 1, y, cC); c.set(x + 1, y, cC); c.set(x, y - 1, cC); c.set(x, y + 1, cC); }
    if (p.anim === 'attack' && p.i === 1) { const sx = cx + d[0] * 4, sy = cy + d[1] * 4 + (e ? 0 : 0); paint(c, polyM([[sx, sy - 3], [sx + 1.5, sy], [sx, sy + 3], [sx - 1.5, sy]]), cB, false); c.set(sx, sy, cA); }
  },
  pose(anim, d, i, p) {
    const s = d === 'n' ? -1 : 1, e = d === 'e';
    const A = (mx, my, ox, oy, wa) => { p.am = e ? [mx, my] : [mx * s, my]; p.ao = e ? [ox, oy] : [ox * s, oy]; p.wa = e ? wa : wa * s; };
    if (anim === 'idle' || anim === 'stunned') A(0, 0, 0, 0, e ? 8 : -5);
    else if (anim === 'walk') A(p.am[0], 0, p.ao[0], 0, e ? 10 + p.step * 4 : -5 + [2, 0, -2, 0][i]);
    else if (anim === 'attack') { if (i === 0) A(-1, -2, 0, 0, e ? -20 : -22); else if (i === 1) A(e ? 3 : 1, e ? -3 : 0, 0, 0, e ? 30 : -14); else A(0, -1, 0, 0, e ? 30 : -15); p.sq = [0, 0.5, 0][i]; if (i === 1) p.tx = e ? 1 : 0; }
    else if (anim === 'cast') { A([0, 0, 0][i], [-3, -6, -6][i], 0, [-1, -3, -3][i], e ? [5, 0, 5][i] : [-6, 0, -3][i]); p.glow = [0, 2, 1][i]; if (i) p.hy = -1; }
    return p;
  },
};
const sheet = buildSheet(cfg, PL);
console.log(writeSheet('crystal_maiden', sheet));
