// Sven the Rogue Knight: blue-steel armour, white-blue hair, huge Outcast Blade, cape.
import { Pal, buildSheet, writeSheet, paint, fill, ellM, rectM, strokeM, polyM, shEll, shDiag, minus, inter, where, taperM, shNormal, capPaint, arcTrail, eye3, eyeX } from './rig.mjs';

const PL = new Pal();
const skin = PL.r4('#ffe2c4', '#f6c8a0', '#d89a7a', '#9c6654'), hair = PL.r4('#ffffff', '#e0eeff', '#a4bce4', '#6480bc');
const steel = PL.r4('#b4cef2', '#7498d0', '#46659f', '#26386c');
const steelL = PL.r4('#eaf4ff', '#bcd6f4', '#80a2d4', '#506ea6');
const gold = PL.r4('#fff0a8', '#ecbc40', '#aa761e', '#5c3a14');
const cloth = PL.r4('#5a86dc', '#2f55b0', '#1e3580', '#14224f');
const lining = PL.r4('#ffffff', '#d4e4ff', '#92aadc', '#5a74b0');
const boots = PL.r4('#76667a', '#4c4256', '#30283c', '#1e1630');
const blade = PL.r4('#ffffff', '#dce9f8', '#9ab4d2', '#5c7498');
const runeA = PL.c('#5cbcff', 0.6), runeB = PL.c('#c0f4ff', 1.0), eyeI = PL.c('#4aa4f0', 0.3), E = PL.c('#2a1830');

const cfg = {
  W: 32, H: 32,
  g: { hRx: 6.8, hRy: 5.8, tRx: 5.2, tRy: 4.5, tRxE: 4, legLen: 6, legW: 3, legX: 3, stride: 2.5, armW: 2, armLen: 5, armOut: 0, shOut: 1.2, handR: 1.4, headOv: 3.5, hx: 0, eHead: 2.5, eLean: -1, eArm: 2, starsUp: 5 },
  m: { head: skin, torso: steel, arm: cloth, armD: PL.r4('#2f55b0', '#1e3580', '#14224f', '#14224f'), hand: steelL, handD: steel, pants: PL.r4('#b4cef2', '#7498d0', '#7498d0', '#46659f'), pantsD: PL.r4('#7498d0', '#46659f', '#46659f', '#26386c'), shoe: boots },
  bustW: 16,

  back(c, P) {
    const { hcx, hcy, g } = P, top = Math.round(hcy - g.hRy), yi = Math.round(hcy), t = P.p.t || 0, fl = (t === 1 || t === 2) ? 1 : 0;
    if (P.dir === 's') {
      for (const sd of ['l', 'r']) {
        const px = P[sd], o = sd === 'l' ? -1 : 1;
        paint(c, polyM([[px(4) , top + 4], [px(7.5), top + 6], [px(8.5) + o * fl, yi + 6], [px(6.5) + o * fl, yi + 9], [px(4), yi + 8]]), shDiag(px(6), top + 4, hair), 'bg');
      }
      // cape
      const top2 = P.tTop + 2, hem = P.hip + 3;
      paint(c, polyM([[P.CX - 4.5, top2], [P.CX + 4.5, top2], [P.CX + 8, hem], [P.CX - 8, hem]]), shDiag(P.CX - 4, top2, cloth), 'bg');
      for (let x = 0; x < c.w; x++) if (cloth.includes(c.get(x, Math.round(hem)))) c.set(x, Math.round(hem), lining[2]);
    } else if (P.dir === 'e') {
      const top2 = P.tTop + 2, hem = P.hip + 4, st = P.p.step || 0;
      paint(c, polyM([[P.tcx - 2, top2], [P.tcx + 2, top2], [P.tcx - 3 - st, hem], [P.tcx - 10 - Math.abs(st) - fl, hem - 1 + (t & 1)]]), shDiag(P.tcx - 6, top2, cloth), 'bg');
    }
  },
  torsoDeco(c, P) {
    const { tcx, tcy, tRx, tRy } = P;
    if (P.dir === 'n') {
      const sw = P.p.t === 2 ? 1 : 0, hem = P.hip + 4;
      paint(c, polyM([[P.CX - 5.5, P.tTop + 1], [P.CX + 5.5, P.tTop + 1], [P.CX + 7.5 + sw, hem], [P.CX - 7.5 - sw, hem]]), shDiag(P.CX - 4, P.tTop, cloth));
      for (let x = 0; x < c.w; x++) if (cloth.includes(c.get(x, Math.round(hem)))) c.set(x, Math.round(hem), lining[2]);
      for (let y = Math.round(P.tTop + 4); y < hem - 1; y += 3) { c.set(P.l(0), y, cloth[0]); c.set(P.r(0), y, cloth[0]); c.set(P.l(0), y + 1, cloth[0]); c.set(P.r(0), y + 1, cloth[0]); }
      return;
    }
    if (P.dir === 's') {
      const pl = ellM(tcx, tcy - 0.5, tRx - 1.5, tRy - 1.2);
      paint(c, pl, shEll(tcx, tcy - 0.5, tRx - 1.5, tRy - 1.2, steelL, 0), false);
      const y = Math.round(tcy - 1); c.set(P.l(0), y - 1, gold[0]); c.set(P.r(0), y - 1, gold[0]); c.set(P.l(0), y, gold[1]); c.set(P.r(0), y, gold[1]); c.set(P.l(0), y + 1, gold[2]); c.set(P.r(0), y + 1, gold[2]);
    } else {
      const pl = ellM(tcx + 0.5, tcy - 0.5, tRx - 1.3, tRy - 1.2);
      paint(c, pl, shEll(tcx + 0.5, tcy - 0.5, tRx - 1.3, tRy - 1.2, steelL, 0), false);
    }
    const by = Math.round(tcy + tRy - 1.5);
    for (let x = Math.round(tcx - tRx); x <= Math.round(tcx + tRx); x++) if (c.get(x, by) !== '.' && c.get(x, by) !== 'K') c.set(x, by, gold[2]);
    if (P.dir === 's') { c.set(P.l(0), by, gold[0]); c.set(P.r(0), by, gold[0]); } else c.set(Math.round(tcx), by, gold[0]);
  },
  weaponMid(c, P) { // pauldrons
    const ty = P.tTop + 2.6;
    if (P.dir === 'e') { const m = ellM(P.tcx - 1, ty + 0.5, 3, 2.5); paint(c, m, shEll(P.tcx - 1, ty + 0.5, 3, 2.5, steel, 0.1)); c.set(P.tcx - 1.5, ty - 1, steelL[0]); return; }
    for (const sd of [-1, 1]) {
      const cx = sd < 0 ? P.l(0) - P.tRx + 0.2 : P.r(0) + P.tRx - 0.2;
      const m = ellM(cx, ty, 2.9, 2.6); paint(c, m, shEll(cx, ty, 2.9, 2.6, steel, 0.1));
      c.set(cx - 0.5, ty - 1, steelL[0]);
    }
  },
  face(c, P) {
    const { hcx, hcy, g, p } = P, yi = Math.round(hcy);
    if (P.dir === 'n') return;
    if (P.dir === 's') {
      if (p.eyes === 'x') { eyeX(c, P.l(2), yi, E); eyeX(c, P.r(2) + 1, yi, E); }
      else { eye3(c, P.l(3), P.l(2), yi, { iris: eyeI, lash: E, dim: skin[1] }); eye3(c, P.r(3), P.r(2), yi, { iris: eyeI, lash: E, dim: skin[1] }); }
      c.set(P.l(0), yi + 2, skin[2]); c.set(P.r(0), yi + 2, skin[2]);
      for (let u = 0; u <= 1; u++) { c.set(P.l(u), yi + 4, skin[3]); c.set(P.r(u), yi + 4, skin[3]); }
      for (let u = 0; u <= 1; u++) { c.set(P.l(u), yi + 5, hair[2]); c.set(P.r(u), yi + 5, hair[2]); }
    } else {
      const ex = Math.round(hcx + g.hRx * 0.4);
      if (p.eyes === 'x') eyeX(c, ex + 1, yi, E); else eye3(c, ex + 1, ex, yi, { iris: eyeI, lash: E, dim: skin[1] });
      c.set(ex + 3, yi, 'K'); c.set(Math.round(hcx + g.hRx + 0.4), yi + 2, skin[1]); c.set(Math.round(hcx + g.hRx - 0.6), yi + 2, skin[1]);
      c.set(ex + 2, yi + 4, skin[3]);
      for (let x = Math.round(hcx + 1); x <= Math.round(hcx + 3); x++) c.set(x, yi + 5, hair[2]);
    }
  },
  headgear(c, P) {
    const { hcx, hcy, g } = P, yi = Math.round(hcy), top = Math.round(hcy - g.hRy), t = P.p.t || 0, hm = P.headMask, fl = (t === 1 || t === 2) ? 1 : 0;
    if (P.dir === 's') {
      const m = where(hm, (x, y) => y <= yi - 2 || ((x <= P.l(5) || x >= P.r(5)) && y <= yi + 2));
      capPaint(c, m, hcx, hcy - 2, g.hRx, g.hRy, steel);
      for (let y = top; y <= yi - 2; y++) { c.set(P.l(0), y, steelL[1]); c.set(P.r(0), y, steelL[2]); }
      for (let u = 1; u <= 5; u++) { c.set(P.l(u), yi - 3, gold[1]); c.set(P.r(u), yi - 3, gold[u > 3 ? 2 : 1]); }
      for (let u = 1; u <= 5; u += 2) c.set(P.l(u), yi - 3, gold[0]);
      // plume
      paint(c, polyM([[P.CX - 2, top + 1], [P.CX + 3, top + 1], [P.CX + 3.5, top - 3], [P.CX + 1, top - 5], [P.CX - 2, top - 3]]), shDiag(P.CX - 2, top - 3, hair), 'bg');
      // fins
      for (const sd of ['l', 'r']) { const px = P[sd], o = sd === 'l' ? -1 : 1; for (const [dx, dy] of [[6, 2], [7, 1], [8, 0]]) { c.set(px(dx), top + dy + 1, steelL[1]); c.set(px(dx), top + dy, 'K'); } c.set(px(8.5) , top - 1, 'K'); c.set(px(8), top, steelL[0]); }
    } else if (P.dir === 'n') {
      const mass = where(ellM(hcx, hcy + 2, g.hRx - 0.3, g.hRy - 0.5), (x, y) => y >= top + 3);
      const m = where(hm, (x, y) => y <= top + 3);
      capPaint(c, m, hcx, hcy - 2, g.hRx, g.hRy, steel);
      capPaint(c, mass, hcx - 1, hcy + 1, g.hRx, g.hRy, hair, false);
      for (let u = 0; u <= 5; u++) { c.set(P.l(u), top + 3, gold[u > 3 ? 2 : 1]); c.set(P.r(u), top + 3, gold[u > 3 ? 2 : 1]); }
      const tail = polyM([[P.CX - 5, yi + 3], [P.CX + 5, yi + 3], [P.CX + 4 + fl, yi + 5], [P.CX - 4 - fl, yi + 5]]);
      paint(c, tail, shDiag(P.CX - 3, yi + 3, hair), 'bg');
      paint(c, mass, (x, y) => c.get(x, y) === '.' ? hair[1] : null, false);
      capPaint(c, mass, hcx - 1, hcy + 1, g.hRx, g.hRy, hair, false);
      paint(c, polyM([[P.CX - 2, top + 1], [P.CX + 3, top + 1], [P.CX + 3, top - 4], [P.CX - 2, top - 4]]), shDiag(P.CX - 2, top - 3, hair), 'bg');
      for (let y = top - 4; y <= top + 3; y++) { c.set(P.l(0), y, hair[0]); c.set(P.r(0), y, hair[1]); }
    } else {
      const m = where(hm, (x, y) => y <= yi - 2 || x <= hcx - 1);
      capPaint(c, m, hcx, hcy - 2, g.hRx, g.hRy, steel);
      for (let x = Math.round(hcx - 5); x <= Math.round(hcx + g.hRx - 1); x++) c.set(x, yi - 3, gold[1]);
      // hair streaming back
      const pl = polyM([[hcx - 2, top + 1], [hcx - 5, top + 3], [hcx - 9 - fl, yi + 1], [hcx - 9 - fl, yi + 8], [hcx - 3, yi + 8], [hcx - 2, yi + 3]]);
      paint(c, minus(pl, hm), shDiag(hcx - 6, yi, hair), 'bg');
      paint(c, polyM([[hcx - 2, top + 1], [hcx + 3, top + 1], [hcx + 1, top - 4], [hcx - 4 - fl, top - 3], [hcx - 8 - fl, top + 1]]), shDiag(hcx - 3, top - 2, hair), 'bg');
    }
  },
  weapon(c, P) {
    const h = P.hands.main, p = P.p;
    if (p.slash) { const e = P.dir === 'e', n = P.dir === 'n'; { const sg = e ? 1 : (n ? -1 : 1), a1 = p.wa, a0 = a1 - sg * 50, w = p.wl; for (const [r, ch] of [[w - 3, 'W'], [w - 2, runeB]]) arcTrail(c, h.x, h.y, r, a0, a1 - sg * 10, [ch]); } }
    if (p.portrait) return;
    sword(c, h.x, h.y, p.wa, p.wl || 21, p.glow || 0);
  },
  fx(c, P) {
    const p = P.p;
    if (p.anim === 'cast' && p.i > 0) [[-9, -3], [9, -6], [-7, 6], [8, 4]].forEach(([dx, dy]) => { const x = P.hcx + dx, y = P.hcy + dy - (p.i === 1 ? 1 : 0); c.set(x, y, runeB); c.set(x + 1, y, runeA); c.set(x, y + 1, runeA); c.set(x - 1, y, runeA); c.set(x, y - 1, runeA); });
  },
  pose(anim, d, i, p) {
    const n = d === 'n', e = d === 'e', s = n ? -1 : 1;
    const set = (wa, wl, am, ao, extra = {}) => { p.wa = e ? wa : wa * s; p.wl = wl; p.am = e ? am : [am[0] * s, am[1]]; p.ao = ao ? (e ? ao : [ao[0] * s, ao[1]]) : [0, 0]; Object.assign(p, extra); };
    if (anim === 'idle') set(e ? -26 - [0, 1, 2, 1][i] : -12 - [0, 1, 1, 0][i], 21, [0, 0], null);
    else if (anim === 'walk') { set(e ? -28 + p.step * 3 : -12 + [2, 0, -2, 0][i], 18, p.am, p.ao); p.wl = 21; }
    else if (anim === 'attack') {
      if (e) { if (i === 0) set(-34, 14, [-3, -6], [-3, -3], { tx: -1, hx: -1 }); else if (i === 1) set(130, 12, [0, -5], [3, -3], { tx: 1, hy: 1, sq: 0.5, slash: 1 }); else set(140, 13, [2, -1], [1, 0], { tx: 1, sq: 0.5 }); }
      else { if (i === 0) set(-14, 16, [4, -5], [-3, -3], { hy: -1 }); else if (i === 1) set(124, 15, [5, -6], [-2, -3], { hy: 1, sq: 0.5, slash: 1 }); else set(146, 14, [4, -2], [-1, -1], { sq: 0.5 }); }
    } else if (anim === 'cast') {
      const a = [-14, 0, -6][i];
      set(e ? a + 8 : a, 14, e ? [-1, [-3, -6, -6][i]] : [1, [-3, -6, -6][i]], e ? [0, [-2, -5, -5][i]] : [-3, [-2, -5, -5][i]], { glow: i === 1 ? 2 : i === 2 ? 1 : 0, hy: i === 1 ? -1 : 0 });
    } else if (anim === 'stunned') set(e ? 30 : -12, 15, [0, 1], null);
    return p;
  },
};

function sword(c, hx, hy, a, len, glow) {
  const r = a * Math.PI / 180, d = [Math.sin(r), -Math.cos(r)], nn = [Math.cos(r), Math.sin(r)];
  const gx = hx + d[0] * 2.2, gy = hy + d[1] * 2.2;
  paint(c, strokeM(Math.round(hx - d[0] * 2.5), Math.round(hy - d[1] * 2.5), Math.round(hx), Math.round(hy), 1), gold[2]);       // grip + pommel
  paint(c, taperM(gx + d[0] * 0.8, gy + d[1] * 0.8, a, len, 1.7, 1.9, 0.5), shNormal(gx, gy, a, blade, 1.9));                     // blade
  for (let t = 4; t < len - 2; t++) { if (t % 3) c.set(gx + d[0] * t, gy + d[1] * t, glow > 1 ? runeB : runeA); }                  // rune fuller
  const g1 = [gx - nn[0] * 3, gy - nn[1] * 3], g2 = [gx + nn[0] * 3, gy + nn[1] * 3];
  paint(c, strokeM(Math.round(g1[0]), Math.round(g1[1]), Math.round(g2[0]), Math.round(g2[1]), 1), shDiag(gx, gy, gold));         // guard
}

const sheet = buildSheet(cfg, PL);
console.log(writeSheet('sven', sheet));
