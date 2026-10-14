// Pudge the Butcher: hunched pale-green bloated brute (widest hero), green mohawk, stitched belly, leather butcher's apron,
// meat hook in the main hand + rusty cleaver in the off hand, chain on the belt. attack = overhead hook chop, cast = Rot gas.
import { SafePal } from './props.mjs';
import { buildSheet, writeSheet, paint, polyM, shDiag, where, ellM, rectM, strokeM, shEll, shEdge, taperM, shNormal, arcTrail, eye3, eyeX, union, minus } from './rig.mjs';

const PL = new SafePal();
const flesh = PL.r4('#d6d9aa', '#a9b484', '#79865f', '#4a5642'), fleshD = PL.r4('#a9b484', '#79865f', '#4a5642', '#2f3a30');
const belly = PL.r4('#e2e4b4', '#b8c28e', '#869368', '#556248');
const hair = PL.r4('#b4ec58', '#76c030', '#4a8c24', '#2a5418');
const leather = PL.r4('#a07a56', '#74543c', '#4c3426', '#2a1c16'), pants = PL.r4('#5e5a62', '#403c48', '#2c2834', '#1a1620');
const iron = PL.r4('#e8ecf4', '#aab2c4', '#6c768e', '#3a4258'), rust = PL.r4('#c88a5c', '#965a3c', '#643628', '#3a201c');
const wood = PL.r4('#b8845a', '#8a5a3c', '#5c3a28', '#32201a'), bone = PL.r4('#fffae0', '#eadeb6', '#b8a47c', '#6e5a40');
const boots = PL.r4('#6a5a4c', '#46382e', '#2c221c', '#1a1410');
const blood = PL.c('#8c1a1a'), bloodD = PL.c('#5e1016'), stitch = PL.c('#2a2018'), iris = PL.c('#d02828', 0.35), E = PL.c('#2a1418');
const gas = PL.c('#9cf04c', 0.55), gasD = PL.c('#5ea02c', 0.3);

// meat hook: pole with a curl at its tip, held at hand h, pointing a (deg; 0 up, 90 right), curl turns toward sign tr
function hook(c, hx, hy, a, tr, len = 12) {
  let r = a * Math.PI / 180, x = hx - Math.sin(r) * 3, y = hy + Math.cos(r) * 3;
  const pts = [[x, y]];
  const ex = hx + Math.sin(r) * len, ey = hy - Math.cos(r) * len;
  pts.push([ex, ey]); x = ex; y = ey;
  for (let k = 0; k < 8; k++) { r += tr * (0.42 + k * 0.04); x += Math.sin(r) * (2.1 - k * 0.1); y -= Math.cos(r) * (2.1 - k * 0.1); pts.push([x, y]); }
  let m = new Set();
  for (let i = 0; i < pts.length - 1; i++) { const w = i === 0 ? 2 : 1; const s = strokeM(Math.round(pts[i][0]), Math.round(pts[i][1]), Math.round(pts[i + 1][0]), Math.round(pts[i + 1][1]), i < 6 ? 2 : 1); for (const k of s) m.add(k); }
  let sx = 0, sy = 0; for (const k of m) { const [a, b] = k.split(',').map(Number); sx += a; sy += b; } sx /= m.size; sy /= m.size;
  const sh = shDiag(sx, sy, iron);
  paint(c, m, (px, py) => sh(px, py), true);
  // wooden grip over the first part
  const g = strokeM(Math.round(hx - Math.sin(a * Math.PI / 180) * 3), Math.round(hy + Math.cos(a * Math.PI / 180) * 3), Math.round(hx + Math.sin(a * Math.PI / 180) * 3), Math.round(hy - Math.cos(a * Math.PI / 180) * 3), 2);
  paint(c, g, shDiag(hx - 2, hy - 2, wood), true);
  const q = pts[pts.length - 1]; c.set(q[0], q[1], iron[0]);
}
// cleaver: handle at (hx,hy) pointing a, broad blade at the far end
function cleaver(c, hx, hy, a, ls) {
  const r = a * Math.PI / 180, d = [Math.sin(r), -Math.cos(r)], n = [Math.cos(r), Math.sin(r)];
  const T = (t, s) => [hx + d[0] * t + n[0] * s * ls, hy + d[1] * t + n[1] * s * ls];
  const g = strokeM(Math.round(hx - d[0] * 2), Math.round(hy - d[1] * 2), Math.round(hx + d[0] * 3), Math.round(hy + d[1] * 3), 2);
  paint(c, g, shDiag(hx - 2, hy - 2, wood), true);
  const blade = polyM([T(3, -1.5), T(3, 1.5), T(9, 3), T(9.5, -2.2)]);
  paint(c, blade, shNormal(hx + d[0] * 7, hy + d[1] * 7, a, ls < 0 ? [iron[3], iron[2], iron[1], iron[0]] : iron, 3));
  const b0 = T(8.6, 0.8); c.set(b0[0], b0[1], rust[1]); const b1 = T(7, 1.8); c.set(b1[0], b1[1], blood);
  const hl = T(4.5, 0); c.set(hl[0], hl[1], rust[2]);
}

const cfg = {
  W: 54, H: 42,
  g: { hRx: 5.4, hRy: 4.6, tRx: 10.5, tRy: 8, tRxE: 9.5, legLen: 6, legW: 4, legX: 5, stride: 3.4, armW: 4, armLen: 6, armOut: 2.5, shOut: -2.6, handR: 2.2, headOv: 6.6, hx: 0, eHead: 5, eLean: 1, eArm: 8, starsUp: 5 },
  m: { head: flesh, torso: belly, arm: flesh, armD: fleshD, hand: flesh, handD: fleshD, pants, pantsD: PL.r4('#403c48', '#2c2834', '#2c2834', '#1a1620'), shoe: boots },
  bustW: 16, bustBelow: 2,

  back(c, P) {
    if (P.dir === 'e') { // hump
      const hx = P.tcx - 7, hy = P.tTop + 3.5;
      paint(c, ellM(hx, hy, 5, 4.2), shEll(hx, hy, 5, 4.2, flesh, 0.1), 'bg');
    }
  },
  torsoDeco(c, P) {
    const { tcx, tcy, tRx, tRy, p } = P, e = P.dir === 'e', cx = e ? tcx : P.CX, by = Math.round(tcy + tRy - 2.2);
    const hem = P.hip + 2;
    if (P.dir === 'n') {
      // back: cross straps + sagging back flesh crease
      for (let k = 0; k < 9; k++) { c.over(P.l(5) + k, Math.round(P.tTop + 3 + k * 0.9), leather[1]); c.over(P.r(5) - k, Math.round(P.tTop + 3 + k * 0.9), leather[2]); }
      for (let k = 0; k < 9; k++) { c.over(P.l(5) + k + 1, Math.round(P.tTop + 3 + k * 0.9), leather[2]); c.over(P.r(5) - k - 1, Math.round(P.tTop + 3 + k * 0.9), leather[3]); }
      for (let x = Math.round(cx - tRx + 1); x <= Math.round(cx + tRx - 1); x++) c.over(x, by, leather[2]);
      for (let x = Math.round(cx - tRx + 1); x <= Math.round(cx + tRx - 1); x++) c.over(x, by + 1, leather[3]);
      for (let y = Math.round(tcy - 4); y < by - 1; y += 3) { c.over(P.l(0), y, fleshD[1]); c.over(P.r(0), y, fleshD[1]); }
      return;
    }
    if (P.dir === 's') {
      // belly button + fat fold under chest
      for (let u = 3; u <= 8; u++) { c.over(P.l(u), Math.round(tcy - 5.5 + u * 0.3), belly[2]); c.over(P.r(u), Math.round(tcy - 5.5 + u * 0.3), belly[2]); }
      // cross straps over chest
      for (let k = 0; k < 8; k++) { c.over(P.l(7) + k, Math.round(P.tTop + 3 + k * 0.85), leather[1]); c.over(P.l(7) + k + 1, Math.round(P.tTop + 3 + k * 0.85), leather[2]); c.over(P.r(7) - k, Math.round(P.tTop + 3 + k * 0.85), leather[1]); c.over(P.r(7) - k - 1, Math.round(P.tTop + 3 + k * 0.85), leather[2]); }
    } else {
      // side: seam along belly front, strap
      for (let k = 0; k < 9; k++) { c.over(Math.round(tcx - 6 + k), Math.round(P.tTop + 2 + k * 0.9), leather[1]); c.over(Math.round(tcx - 5 + k), Math.round(P.tTop + 2 + k * 0.9), leather[2]); }
    }
    // butcher's apron (below belt) over pants
    const aw = e ? 4.5 : 5.5, ap = polyM([[cx - aw, by], [cx + aw, by], [cx + aw + 0.5, hem], [cx - aw - 0.5, hem]]);
    paint(c, ap, shDiag(cx - 4, by, leather), false);
    for (let x = 0; x < c.w; x++) if (leather.includes(c.get(x, hem))) c.set(x, hem, leather[3]);
    for (const [dx, dy] of [[-3, 1], [-2, 2], [2, 1], [3, 3], [0, 3], [-4, 3]]) { const x = Math.round(cx + dx), y = by + 2 + dy; if (leather.includes(c.get(x, y))) c.set(x, y, dy > 2 ? bloodD : blood); }
    // belt
    for (let x = Math.round(cx - tRx + 0.5); x <= Math.round(cx + tRx - 0.5); x++) { c.over(x, by, leather[2]); c.over(x, by - 1, leather[1]); }
    if (P.dir === 's') { c.set(P.l(0), by - 1, bone[0]); c.set(P.r(0), by - 1, bone[1]); c.set(P.l(0), by, bone[2]); c.set(P.r(0), by, bone[2]); }
    else { c.set(Math.round(tcx + tRx - 3), by - 1, bone[0]); c.set(Math.round(tcx + tRx - 3), by, bone[2]); }
    // sagging belly lobe over the belt, stitched
    { const bx = e ? tcx + 2.5 : cx, rx = e ? tRx - 3.5 : tRx - 1.2, ry = 3.4, by2 = by - 1.5;
      const lobe = ellM(bx, by2, rx, ry);
      for (const k of lobe) { const [x, y] = k.split(',').map(Number); if (leather.includes(c.get(x, y)) || belly.includes(c.get(x, y)) || c.get(x, y) === 'K') c.set(x, y, !lobe.has((x) + ',' + (y + 1)) ? belly[3] : (!lobe.has((x - 1) + ',' + y) || y < by2 - ry + 1 ? belly[0] : belly[1 + ((x + y) & 1 ? 0 : 0)])); }
      for (const k of lobe) { const [x, y] = k.split(',').map(Number); if (!lobe.has(x + ',' + (y + 1)) && !lobe.has((x + 1) + ',' + y)) c.set(x, y, belly[3]); }
      if (!e) {
        const x0 = P.l(0), x1 = P.r(0), ys = Math.round(tcy - 4), ye = Math.round(by2 + ry - 1);
        for (let y = ys; y <= ye; y++) { c.over(x0, y, stitch); c.over(x1, y, stitch); }
        for (let y = ys + 1; y <= ye - 1; y += 2) { for (const dx of [1, 2]) { c.over(x0 - dx, y, stitch); c.over(x1 + dx, y, stitch); } }
        c.set(P.l(5), Math.round(by2 + 1), blood); c.set(P.r(6), Math.round(by2 - 1), bloodD);
      } else {
        const xs = Math.round(tcx + tRx - 3.5);
        for (let y = Math.round(tcy - 4); y <= Math.round(by2 + ry - 1); y++) c.over(xs - Math.round(Math.abs(y - tcy) * 0.12), y, stitch);
        for (let y = Math.round(tcy - 3); y <= Math.round(by2 + ry - 2); y += 2) { c.over(xs - 1, y, stitch); c.over(xs + 1, y, stitch); }
      }
    }
    // chain dangling from belt (side + south)
    const sw = [0, 1, 1, 0][(p.t || 0) % 4];
    const chx = P.dir === 's' ? P.l(6) : Math.round(tcx - 1);
    for (let k = 0; k < 5; k++) { const x = chx - (k > 2 ? sw : 0), y = by + 1 + k; if (P.dir === 'e' || k > 0) c.set(x, y, k & 1 ? iron[2] : iron[0]); }
  },
  face(c, P) {
    const { hcx, hcy, g, p } = P, yi = Math.round(hcy);
    if (P.dir === 'n') return;
    if (P.dir === 's') {
      const rr = p.anim === 'cast' && p.i > 0 ? 1 : 0;
      if (p.eyes === 'x') { eyeX(c, P.l(2), yi - 1, E); eyeX(c, P.r(2) + 1, yi - 1, E); }
      else {
        c.set(P.l(3), yi - 1, 'W'); c.set(P.l(2), yi - 1, iris); c.set(P.l(3), yi, flesh[2]); c.set(P.l(2), yi, E);
        c.set(P.r(3), yi - 1, 'W'); c.set(P.r(2), yi - 1, iris); c.set(P.r(3), yi, flesh[2]); c.set(P.r(2), yi, E);
      }
      for (let u = 1; u <= 4; u++) { c.set(P.l(u), yi - 2, E); c.set(P.r(u), yi - 2, E); }   // heavy brow
      c.set(P.l(0), yi, flesh[2]); c.set(P.r(0), yi, flesh[2]);                            // nose
      c.set(P.l(0), yi + 1, flesh[3]); c.set(P.r(0), yi + 1, flesh[3]);
      for (let u = 0; u <= 3; u++) { c.set(P.l(u), yi + 2, E); c.set(P.r(u), yi + 2, E); }  // maw
      for (let u = 0; u <= 3; u++) { const ch = (u & 1) ? bone[2] : bone[0]; c.set(P.l(u), yi + 3, rr ? E : ch); c.set(P.r(u), yi + 3, rr ? E : (((u + 1) & 1) ? bone[2] : bone[1])); }
      c.set(P.l(4), yi + 2, bone[0]); c.set(P.r(4), yi + 2, bone[1]);                       // big tusks up
      c.set(P.l(4), yi + 1, bone[1]); c.set(P.r(4), yi + 1, bone[2]);
    } else {
      const ex = Math.round(hcx + g.hRx * 0.5);
      if (p.eyes === 'x') eyeX(c, ex + 1, yi - 1, E);
      else { c.set(ex + 1, yi - 1, 'W'); c.set(ex, yi - 1, iris); c.set(ex + 1, yi, E); }
      for (let x = ex - 1; x <= ex + 3; x++) c.set(x, yi - 2, E);
      c.set(Math.round(hcx + g.hRx + 0.4), yi, flesh[1]); c.set(Math.round(hcx + g.hRx + 1.4), yi + 1, flesh[2]);   // big nose
      for (let x = ex - 1; x <= ex + 4; x++) c.set(x, yi + 2, E);
      c.set(ex + 4, yi + 1, bone[0]); c.set(ex + 3, yi + 1, bone[1]); c.set(ex + 3, yi + 3, bone[2]); c.set(ex + 1, yi + 3, bone[0]);
    }
  },
  headgear(c, P) {   // mohawk
    const { hcx, hcy, g, p } = P, top = Math.round(hcy - g.hRy), wob = [0, 1, 1, 0][(p.t || 0) % 4];
    if (P.dir === 's') {
      const H = { l: [6, 2, 3], r: [3, 5, 2] };
      for (const sd of ['l', 'r']) for (let u = 0; u < 3; u++) { const h = H[sd][u] + (u === 0 ? wob : 0); for (let k = 0; k < h; k++) { c.set(P[sd](u), top + 1 - k, hair[k >= h - 1 ? 0 : (k >= h - 3 ? 1 : 2)]); } c.set(P[sd](u), top + 1 - h, 'K'); }
      for (let u = 3; u <= 4; u++) for (const sd of ['l', 'r']) c.set(P[sd](u), top + 2 - (u - 3), hair[2]);
    } else if (P.dir === 'n') {
      for (let k = 0; k < 7; k++) for (const u of [0]) { c.set(P.l(u), top - 3 + k, hair[k < 3 ? 1 : 2]); c.set(P.r(u), top - 3 + k, hair[k < 3 ? 0 : 2]); }
      for (const [u, h] of [[1, 2], [2, 1]]) for (const sd of ['l', 'r']) for (let k = 0; k < h; k++) c.set(P[sd](u), top - 1 - k, hair[1 + k]);
    } else {
      for (let i = 0; i < 7; i++) {   // spikes running over the skull toward the back
        const x = Math.round(hcx + 2 - i * 1.3), y = Math.round(top - 1 - (i < 2 ? i : (i < 5 ? 2 : 1)) + (i === 6 ? 2 : 0));
        c.set(x, y, hair[0]); c.set(x - 1, y + 1, hair[1]); c.set(x, y + 1, hair[2]); if (i % 2 === 0) c.set(x - 1, y - 1 - wob * (i === 2 ? 1 : 0), hair[1]);
      }
      for (let i = 0; i < 4; i++) c.set(Math.round(hcx - 3 - i), Math.round(top + 3 + i * 0.5), hair[2]);
    }
  },
  weaponBack(c, P) {   // cleaver (off hand) sits behind the arm
    const p = P.p; if (p.portrait) return;
    const o = P.hands.off, ls = P.dir === 'n' ? 1 : 1;
    if (!o) return;
    cleaver(c, o.x, o.y, p.ca ?? 160, P.dir === 's' ? 1 : (P.dir === 'e' ? 1 : -1));
  },
  weapon(c, P) {
    const p = P.p, h = P.hands.main, dir = P.dir, a = p.wa || 0;
    if (p.portrait) return;
    const tr = dir === 'n' ? -1 : 1;
    if (p.slash) {
      const sg = dir === 'e' ? 1 : (dir === 'n' ? -1 : 1), a1 = a, a0 = a1 - sg * 50;
      for (const [rr, ch] of [[10, 'W'], [11, gas]]) arcTrail(c, h.x, h.y, rr, a0, a1 - sg * 14, [ch]);
    }
    hook(c, h.x, h.y, a, tr);
  },
  fx(c, P) {
    const p = P.p;
    if (p.portrait || p.anim !== 'cast' || p.i === 0) return;
    const hx = P.tcx, hy = P.tcy, k = p.i === 2 ? 1 : 0;
    for (const [dx, dy] of [[-14, -4], [14, -5], [-11, 6], [12, 5], [-6, -11], [7, -12]]) { const x = hx + dx, y = hy + dy - k; c.set(x, y, gas); c.set(x + 1, y, gasD); c.set(x, y - 1, gasD); c.set(x - 1, y + 1, gasD); }
  },
  pose(anim, d, i, p) {
    const s = d === 'n' ? -1 : 1, e = d === 'e';
    const A = (mx, my, ox, oy, wa, ca) => { p.am = e ? [mx, my] : [mx * s, my]; p.ao = e ? [ox, oy] : [ox * s, oy]; p.wa = e ? wa : wa * s; p.ca = ca === undefined ? undefined : (e ? ca : ca * s); };
    if (anim === 'idle') A(0, -[0, 1, 1, 0][i], 0, 0, e ? 28 - [0, 2, 3, 2][i] : -12 - [0, 1, 1, 0][i], e ? 115 : 150);
    else if (anim === 'stunned') A(0, 1, 0, 0, e ? 32 : -22, e ? 130 : 150);
    else if (anim === 'walk') A(p.am[0] * 0.6, -1, p.ao[0] * 0.6, 0, e ? 24 + p.step * 5 : -12 + [3, 0, -3, 0][i], e ? 115 + p.step * 6 : 150);
    else if (anim === 'attack') {
      if (i === 0) { A(-3, -9, -1, -2, e ? -35 : -30, 120); p.tx = -1; }
      else if (i === 1) { A(e ? 3 : 1, e ? 2 : -3, 0, 0, e ? 130 : 160, 115); p.slash = 1; p.sq = 0.5; p.tx = e ? 2 : 0; }
      else { A(e ? 1 : 0, 0, 0, 0, e ? 150 : 165, 115); p.sq = 0.5; }
    } else if (anim === 'cast') { A([0, 1, 1][i], [-3, -9, -9][i], [0, 1, 1][i], [-3, -9, -9][i], e ? [10, 0, 0][i] : [-14, -4, -4][i], e ? 100 : 100); if (i) p.hy = -1; }
    return p;
  },
};
const sheet = buildSheet(cfg, PL);
console.log(writeSheet('pudge', sheet));
