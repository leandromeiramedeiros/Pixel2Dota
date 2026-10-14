// Mirana, Priestess of the Moon: rides a big white sabertooth moonbeast (most of the silhouette), blue-silver armour,
// long dark hair, silver tiara with a gold moon gem, recurve bow. attack = draw/release/recover, cast = cat rears (Leap) + arrow.
import { SafePal } from './props.mjs';
import { buildSheet, writeSheet, paint, polyM, shDiag, where, capPaint, eye3, eyeX, ellM, strokeM, shEll, shEdge } from './rig.mjs';

const PL = new SafePal();
const skin = PL.r4('#fff4ec', '#ffe2d6', '#eab8b4', '#b27c8c'), hair = PL.r4('#6a78b8', '#3e4682', '#262a5a', '#14183a');
const armor = PL.r4('#e8f4ff', '#a4c4f4', '#5c80cc', '#344c94'), silver = PL.r4('#ffffff', '#dce6f8', '#9cacd0', '#5c6a98');
const gold = PL.r4('#fff0a8', '#ecbc40', '#aa761e', '#5c3a14'), cloth = PL.r4('#b896f4', '#8460cc', '#583c9c', '#34226c');
const boots = PL.r4('#a4b0e0', '#6e7cb8', '#46528c', '#2a3262'), bowc = PL.r4('#d8e6ff', '#92acf0', '#5a76cc', '#34459c');
const fur = PL.r4('#ffffff', '#f4eeff', '#d4c9f2', '#9a8cca'), furD = PL.r4('#ece4ff', '#c8bcec', '#9c8ecc', '#6e60a4');
const stripe = PL.r4('#a08ae0', '#7c66c4', '#5a48a0', '#382c70'), ear = PL.r4('#ffd8e8', '#f4a0c0', '#bc5c84', '#7c3454');
const fang = PL.r4('#ffffff', '#fff4d8', '#d8c8a0', '#8c7c60'), paw = PL.r4('#f0e8ff', '#c8bcec', '#9084c4', '#5c5090');
const str = PL.c('#f4f8ff'), fl = PL.c('#9af4ff', 0.8), eyeI = PL.c('#5a78e0', 0.2), E = PL.c('#1c1c4a'), lip = PL.c('#d0647c');
const catEye = PL.c('#ffd848', 0.55), nose = PL.c('#ff7aa0'), gem = PL.c('#ffa030', 0.6);

function bow(c, bxx, byy, R, bulge, pullX) {
  for (let t = -R; t <= R; t++) {
    const x = Math.round(bxx + bulge * 3 * (1 - (t / R) ** 2)), y = Math.round(byy + t), ch = Math.abs(t) > R * 0.7 ? bowc[0] : (t < 0 ? bowc[1] : bowc[2]);
    c.set(x, y, ch);
    if (c.get(x - bulge, y) === '.') c.set(x - bulge, y, 'K');
    if (c.get(x + bulge, y) === '.') c.set(x + bulge, y, 'K');
  }
  c.set(bxx, byy - R - 1, 'K'); c.set(bxx, byy + R + 1, 'K'); c.set(bxx, byy - R, gold[1]); c.set(bxx, byy + R, gold[1]);
  const sx = bxx - bulge * pullX;
  for (let t = 0; t <= R; t++) { c.set(bxx + (sx - bxx) * (t / R), byy - R + t, str); c.set(bxx + (sx - bxx) * (1 - t / R), byy + t, str); }
  return sx;
}

// shade an ellipse with a 4-char ramp, rim-darkening the bottom edge, optional outline
const ell = (c, cx, cy, rx, ry, ramp, outline = true) => paint(c, ellM(cx, cy, rx, ry), shEll(cx, cy, rx, ry, ramp, 0.1), outline);
const tri = (c, pts, ramp, cx, cy) => paint(c, polyM(pts), shDiag(cx, cy, ramp), true);

const cfg = {
  W: 58, H: 46, noLegs: true,
  g: { hRx: 5.8, hRy: 5.2, tRx: 3.8, tRy: 3.6, tRxE: 3.2, legLen: 15, legW: 2, legX: 2.5, stride: 2.2, armW: 2, armLen: 5, shOut: 0.9, handR: 1.3, headOv: 3.2, hx: 0, eHead: 2.5, eLean: 0, eArm: 4.5, starsUp: 4 },
  m: { head: skin, torso: armor, arm: silver, armD: PL.r4('#9cacd0', '#5c6a98', '#5c6a98', '#344068'), hand: skin, handD: PL.r4('#d89aa0', '#a8707c', '#a8707c', '#6c4458'), pants: cloth, pantsD: cloth, shoe: boots },
  bustW: 16, bustBelow: 3,

  // ---- the cat (everything behind the rider) ----
  back(c, P) {
    const { p, CX } = P, sq = p.sq || 0, t = p.t || 0, rear = p.rear || 0, f = P.floor;
    const by = f - 10 + sq * 1.5;                  // body centre line
    const sw = [0, 1, 1, 0][t % 4];
    if (P.dir === 'e') {
      const st = p.step || 0, hx = CX - 1;
      // tail (behind body)
      const tl = [[hx - 11, by - 1], [hx - 14, by - 3 - sw], [hx - 15, by - 7], [hx - 13 + sw, by - 11]];
      for (let i = 0; i < tl.length - 1; i++) paint(c, strokeM(Math.round(tl[i][0]), Math.round(tl[i][1]), Math.round(tl[i + 1][0]), Math.round(tl[i + 1][1]), 3), shDiag(hx - 14, by - 5, furD), true);
      ell(c, hx - 13 + sw, by - 11, 2.4, 2.8, fur);
      for (const dy of [-3, -6]) c.over(hx - 14, Math.round(by + dy), stripe[1]);
      // legs: far pair (dark), then body, then near pair
      const leg = (x, top, bot, dark, wide = 3, lift = 0) => {
        const b = bot - lift;
        paint(c, polyM([[x, top], [x + wide, top], [x + wide, b - 1], [x + wide + 1, b], [x - 1, b], [x - 1, b - 1]]), shEdge(dark ? furD : fur));
        for (let u = 0; u < wide; u++) c.over(x + u, b, paw[dark ? 2 : 1]);
        c.over(x + wide, b, paw[dark ? 3 : 2]);
      };
      const fx = hx + 8 - rear * 0.5, bx2 = hx - 8;
      leg(Math.round(fx + st * 3), Math.round(by + 2), f, true, 3, rear ? 2 + rear : 0);
      leg(Math.round(bx2 - st * 3), Math.round(by + 2), f, true, 3);
      // body
      ell(c, hx - 6, by + 0.5, 6.4, 6.6, furD);
      ell(c, hx, by, 9.5, 6.1, fur);
      ell(c, hx + 7, by - rear * 0.5, 5.2, 6.5, fur);
      // chest ruff
      for (let k = 0; k < 4; k++) { c.set(hx + 11, Math.round(by - 1 + k * 1.4 - rear * 0.5), fur[k & 1 ? 1 : 0]); c.set(hx + 12, Math.round(by + k * 1.4 - rear * 0.5), fur[2]); }
      // stripes
      for (const [dx, dy, l] of [[-9, -4, 4], [-6, -5, 5], [-3, -5, 4], [0, -5, 4]]) for (let k = 0; k < l; k++) c.over(Math.round(hx + dx + k * 0.4), Math.round(by + dy + k), stripe[k > 2 ? 2 : 1]);
      leg(Math.round(fx - st * 3 - 1), Math.round(by + 3), f, false, 3, rear ? 2 + rear : 0);
      leg(Math.round(bx2 + st * 3 - 1), Math.round(by + 3), f, false, 3);
      // neck + head
      const hdx = hx + 13, hdy = by - 5.5 - rear * 1.6 - (sq ? 0 : 0);
      paint(c, polyM([[hx + 6, by - 6.5], [hdx - 1, hdy - 3], [hdx + 2, hdy + 4], [hx + 10, by + 3]]), shDiag(hdx - 3, hdy - 3, fur), 'bg');
      ell(c, hdx, hdy, 4.8, 4.2, fur);
      ell(c, hdx + 4.5, hdy + 1.2, 3, 2.4, fur, 'bg');
      tri(c, [[hdx - 3.5, hdy - 3], [hdx - 2, hdy - 8], [hdx + 0.5, hdy - 3.5]], fur, hdx - 2, hdy - 6);
      c.set(hdx - 2, hdy - 5, ear[1]); c.set(hdx - 2, hdy - 4, ear[2]);
      c.set(hdx + 1, hdy - 1.5, catEye); c.set(hdx + 2, hdy - 1.5, 'K'); c.set(hdx + 0.5, hdy - 2.5, 'K'); c.set(hdx + 1.5, hdy - 2.5, 'K');
      c.set(hdx + 7, hdy + 0.5, nose); c.set(hdx + 7, hdy + 1.5, 'K');
      for (let x = hdx + 3; x <= hdx + 6; x++) c.set(x, hdy + 2.5, 'K');
      const fg = rear ? 1 : 0;
      for (const [dx, l] of [[3.5, 4 + fg], [5.5, 3]]) for (let k = 0; k < l; k++) c.set(hdx + dx, hdy + 3 + k, fang[k > l - 2 ? 1 : 0]);
      c.set(hdx + 3.5, hdy + 3 + 4 + fg, 'K');
      for (let k = 0; k < 3; k++) c.over(hdx - 3 + k, hdy - 1 + k * 0, stripe[1]);
    } else if (P.dir === 's') {
      // tail curling up on one side (behind)
      const tx0 = CX + 10, tl = [[tx0, by + 2], [tx0 + 3 + sw, by - 2], [tx0 + 3, by - 7], [tx0 + 1 - sw, by - 11]];
      for (let i = 0; i < tl.length - 1; i++) paint(c, strokeM(Math.round(tl[i][0]), Math.round(tl[i][1]), Math.round(tl[i + 1][0]), Math.round(tl[i + 1][1]), 3), shDiag(tx0, by - 5, furD), true);
      ell(c, tx0 + 1 - sw, by - 11, 2.4, 2.8, fur);
      c.over(tx0 + 3, Math.round(by - 4), stripe[1]); c.over(tx0 + 3, Math.round(by - 7), stripe[1]);
      // hind haunches peek out behind the shoulders
      ell(c, CX - 8.5, by + 2, 4.2, 5.5, furD); ell(c, CX + 8.5, by + 2, 4.2, 5.5, furD);
      // body
      ell(c, CX, by, 11, 7, fur);
      for (const sd of ['l', 'r']) for (const [u, dy, l] of [[7, -5, 4], [9, -3, 4], [5, -6, 3]]) for (let k = 0; k < l; k++) c.over(P[sd](u) + (sd === 'l' ? -1 : 1) * Math.floor(k / 2), Math.round(by + dy + k), stripe[1]);
    } else { // n: rump
      const tx0 = CX + 1, tl = [[tx0, by - 1], [tx0 + 1 + sw, by - 6], [tx0 - 2, by - 11], [tx0 - 4 + sw, by - 14]];
      ell(c, CX - 7, by + 3, 4, 5, furD); ell(c, CX + 7, by + 3, 4, 5, furD);
      ell(c, CX, by + 0.5, 11, 6.8, fur);
      for (let i = 0; i < tl.length - 1; i++) paint(c, strokeM(Math.round(tl[i][0]), Math.round(tl[i][1]), Math.round(tl[i + 1][0]), Math.round(tl[i + 1][1]), 3), shDiag(tx0, by - 6, furD), true);
      ell(c, tx0 - 4 + sw, by - 14, 2.4, 2.8, fur);
      for (const sd of ['l', 'r']) { for (let k = 0; k < 3; k++) c.over(P[sd](5) + k * (sd === 'l' ? -1 : 1), Math.round(by - 3 + k), stripe[1]); }
      // hind paws
      for (const sd of ['l', 'r']) { const lift = sd === 'l' ? (p.lL || 0) : (p.lR || 0); ell(c, P[sd](6) + (sd === 'l' ? 0 : 0), f - 1.5 - lift, 3.3, 2.2, paw); }
    }
  },
  torsoDeco(c, P) {
    const { p, CX, tcx, tcy, tRx, tRy } = P, f = P.floor, sq = p.sq || 0, t = p.t || 0, rear = p.rear || 0;
    const by = f - 10 + sq * 1.5, e = P.dir === 'e';
    const cx = e ? tcx : CX;
    // saddle cloth + rider's legs
    if (P.dir === 's') {
      // cat head in front (below the rider)
      const hy = by + 3 - rear * 1.2;
      for (const sd of ['l', 'r']) { const lift = sd === 'l' ? (p.lL || 0) : (p.lR || 0); ell(c, P[sd](4.5), f - 2.5 - lift - (rear ? rear : 0), 3.4, 3.2, paw); }
      // rider's thighs/boots dangling beside the chest
      for (const sd of ['l', 'r']) { const o = sd === 'l' ? -1 : 1; paint(c, polyM([[P[sd](3.5), tcy + 2], [P[sd](7.5), tcy + 3], [P[sd](9) + o * 0, tcy + 8], [P[sd](5.5), tcy + 9]]), shDiag(P[sd](5), tcy + 3, cloth), 'bg'); ell(c, P[sd](8), tcy + 9.5, 2.3, 2.2, boots); }
      ell(c, CX, hy, 7.6, 6.2, fur);
      for (const sd of ['l', 'r']) { const o = sd === 'l' ? -1 : 1, ex = P[sd](5.5);
        paint(c, polyM([[ex - o * 1.2, hy - 4], [ex + o * 1.5, hy - 10], [ex + o * 3.5, hy - 3.6]]), shDiag(ex, hy - 6, fur), 'bg');
        c.set(ex + o * 1, hy - 6, ear[1]); c.set(ex + o * 1, hy - 5, ear[2]); c.set(ex + o * 1.5, hy - 7, ear[0]);
        c.set(P[sd](3.5), hy - 1.5, 'K'); c.set(P[sd](2.5), hy - 1.5, catEye); c.set(P[sd](3.5), hy - 2.5, 'K'); c.set(P[sd](2.5), hy - 2.5, 'K'); c.set(P[sd](4.5), hy - 2.2, 'K');
        for (let k = 0; k < 3; k++) c.over(P[sd](1 + k * 2), Math.round(hy - 4.5 + k * 0.3), stripe[1 + (k & 1)]);
      }
      c.set(P.l(0), hy + 1, nose); c.set(P.r(0), hy + 1, nose); c.set(P.l(0), hy + 2, 'K'); c.set(P.r(0), hy + 2, 'K');
      for (let u = 1; u <= 3; u++) { c.set(P.l(u), hy + 2.5 + u * 0.2, 'K'); c.set(P.r(u), hy + 2.5 + u * 0.2, 'K'); }
      for (const sd of ['l', 'r']) for (let k = 0; k < 4 + (rear ? 1 : 0); k++) c.set(P[sd](2), hy + 3 + k, fang[k > 2 ? 1 : 0]);
      c.set(P.l(2), hy + 7 + (rear ? 1 : 0), 'K'); c.set(P.r(2), hy + 7 + (rear ? 1 : 0), 'K');
      // chest ruff glow
    } else if (P.dir === 'n') {
      for (const sd of ['l', 'r']) { const o = sd === 'l' ? -1 : 1; paint(c, polyM([[P[sd](3), tcy + 2], [P[sd](7.5), tcy + 3], [P[sd](9), tcy + 8], [P[sd](5.5), tcy + 9]]), shDiag(P[sd](5), tcy + 3, cloth), 'bg'); ell(c, P[sd](8), tcy + 9.5, 2.3, 2.2, boots); }
      paint(c, ellM(cx, tcy + 5, 6.4, 2.6), shEll(cx, tcy + 5, 6.4, 2.6, cloth, 0.1), false);
    } else {
      // rider's near leg along the flank
      const lx = tcx - 1, ly = P.hip - 1;
      paint(c, polyM([[lx - 1, ly], [lx + 4, ly], [lx + 5, ly + 4], [lx + 4, ly + 8], [lx, ly + 8], [lx + 1, ly + 4]]), shDiag(lx, ly, cloth), true);
      ell(c, lx + 3, ly + 8.5, 2.4, 2.1, boots);
      c.set(lx + 3, ly + 3, gold[1]);
    }
    // skirt / belt
    const by2 = Math.round(tcy + tRy - 1.5);
    paint(c, polyM([[cx - tRx, by2], [cx + tRx, by2], [cx + tRx + 1.5, by2 + 3], [cx - tRx - 1.5, by2 + 3]]), shDiag(cx - 3, by2, cloth), false);
    for (let x = Math.round(cx - tRx); x <= Math.round(cx + tRx); x++) { c.over(x, by2, gold[x & 1 ? 1 : 2]); }
    if (P.dir === 's') {
      // chest plate with moon gem
      paint(c, ellM(cx, tcy - 0.6, tRx - 1.2, tRy - 1.3), shEll(cx, tcy - 0.6, tRx - 1.2, tRy - 1.3, silver, 0), false);
      c.set(P.l(0), Math.round(tcy - 1), gem); c.set(P.r(0), Math.round(tcy - 1), gold[1]); c.set(P.l(0), Math.round(tcy), gold[2]); c.set(P.r(0), Math.round(tcy), gold[2]);
    } else if (P.dir === 'e') { paint(c, ellM(cx + 0.5, tcy - 0.6, tRx - 1, tRy - 1.3), shEll(cx + 0.5, tcy - 0.6, tRx - 1, tRy - 1.3, silver, 0), false); }
  },
  // quiver on the back + long hair (drawn over the torso, under the head)
  preHead(c, P) {
    const { hcx, hcy, g, p } = P, yi = Math.round(hcy), t = p.t || 0, sw = [0, 1, 1, 0][t % 4];
    if (P.dir === 'n') {
      const qx = P.CX + 3;
      paint(c, polyM([[qx - 1, P.tTop], [qx + 2, P.tTop - 1], [qx + 4, P.tTop + 7], [qx + 1, P.tTop + 8]]), shDiag(qx, P.tTop, cloth), 'bg');
      for (const dx of [0, 2]) { c.set(qx + dx, P.tTop - 2, fl); c.set(qx + dx, P.tTop - 3, 'K'); }
    } else if (P.dir === 'e') {
      paint(c, polyM([[P.tcx - 4, P.tTop - 1], [P.tcx - 1, P.tTop - 2], [P.tcx + 0, P.tTop + 6], [P.tcx - 4, P.tTop + 7]]), shDiag(P.tcx - 3, P.tTop, cloth), 'bg');
      c.set(P.tcx - 3, P.tTop - 3, fl); c.set(P.tcx - 1, P.tTop - 3, fl);
    }
  },
  face(c, P) {
    const { hcx, hcy, g, p } = P, yi = Math.round(hcy);
    if (P.dir === 'n') return;
    if (P.dir === 's') {
      if (p.eyes === 'x') { eyeX(c, P.l(2), yi, E); eyeX(c, P.r(2) + 1, yi, E); }
      else { eye3(c, P.l(3), P.l(2), yi, { iris: eyeI, lash: E, dim: skin[1] }); eye3(c, P.r(3), P.r(2), yi, { iris: eyeI, lash: E, dim: skin[1] }); }
      c.set(P.l(0), yi + 3, lip); c.set(P.r(0), yi + 3, lip);
    } else {
      const ex = Math.round(hcx + g.hRx * 0.4);
      if (p.eyes === 'x') eyeX(c, ex + 1, yi, E); else eye3(c, ex + 1, ex, yi, { iris: eyeI, lash: E, dim: skin[1] });
      c.set(Math.round(hcx + g.hRx + 0.4), yi + 1, skin[1]); c.set(ex + 2, yi + 3, lip);
    }
  },
  headgear(c, P) {   // hair + tiara
    const { hcx, hcy, g, p } = P, yi = Math.round(hcy), top = Math.round(hcy - g.hRy), t = p.t || 0, sw = [0, 1, 1, 0][t % 4];
    const hd = ellM(hcx, hcy - 1, g.hRx + 0.8, g.hRy + 0.8);
    if (P.dir === 's') {
      // dark hair cap with a centre parting, side locks falling past the shoulders
      capPaint(c, where(hd, (x, y) => y <= yi - 2), hcx, hcy - 3, g.hRx + 0.8, g.hRy + 0.8, hair);
      for (let u = 0; u <= 5; u++) { c.set(P.l(u), yi - 2, u < 5 ? silver[u & 1 ? 1 : 0] : hair[2]); c.set(P.r(u), yi - 2, u < 5 ? silver[u & 1 ? 2 : 1] : hair[2]); }
      c.set(P.l(0), yi - 3, gem); c.set(P.r(0), yi - 3, gem); c.set(P.l(0), yi - 4, gold[0]); c.set(P.r(0), yi - 4, gold[1]);
      for (const sd of ['l', 'r']) { const px = P[sd], o = sd === 'l' ? -1 : 1; paint(c, polyM([[px(5.4), yi - 1], [px(7.2), yi - 1], [px(7.8) + o * sw, yi + 9], [px(5.6), yi + 10]]), shDiag(px(6), yi + 2, hair), 'bg'); }
      for (let y = yi - 1; y <= yi + 1; y++) { c.set(P.l(5), y, hair[1]); c.set(P.r(5), y, hair[2]); }
    } else if (P.dir === 'n') {
      capPaint(c, hd, hcx, hcy - 3, g.hRx + 0.8, g.hRy + 0.8, hair);
      paint(c, polyM([[P.CX - 4, yi], [P.CX + 4, yi], [P.CX + 3 + sw, yi + 6], [P.CX - 3 - sw, yi + 6]]), shDiag(P.CX - 3, yi, hair), 'bg');
      for (let u = 0; u <= 5; u++) { c.set(P.l(u), yi - 2, silver[2]); c.set(P.r(u), yi - 2, silver[3]); }
      for (let y = yi + 1; y <= yi + 5; y++) { c.set(P.l(1), y, hair[1]); }
    } else {
      const m = where(hd, (x, y) => y <= yi - 2 || x <= hcx);
      capPaint(c, m, hcx, hcy - 3, g.hRx + 0.8, g.hRy + 0.8, hair);
      for (let x = Math.round(hcx - 1); x <= Math.round(hcx + g.hRx - 1); x++) c.set(x, yi - 2, silver[x & 1 ? 1 : 0]);
      c.set(Math.round(hcx + g.hRx - 1), yi - 3, gem); c.set(Math.round(hcx + g.hRx - 1), yi - 4, gold[0]);
      paint(c, polyM([[hcx - 5, yi], [hcx - 1, yi], [hcx - 3 - sw, yi + 8], [hcx - 8 - sw, yi + 9]]), shDiag(hcx - 4, yi, hair), 'bg');
    }
  },
  weapon(c, P) {
    const p = P.p, h = P.hands.main, e = P.dir === 'e', n = P.dir === 'n';
    if (p.portrait) return;
    const bulge = e ? 1 : (n ? 1 : -1), pull = p.pull || 0;
    const bxx = Math.round(e ? h.x + 3 : h.x + (n ? 2 : -3)), byy = Math.round(h.y + 1), R = 7;
    const sx = bow(c, bxx, byy, R, bulge, pull);
    if (p.arrow) {
      if (e) {
        const ax = Math.round(p.arrow === 'fly' ? bxx + 1 : sx), ay = byy;
        for (let k = 0; k < 7; k++) c.set(ax + k, ay, k === 6 ? fl : (k < 2 ? silver[1] : bowc[1]));
        c.set(ax + 7, ay, 'K');
      } else {
        const dirY = n ? -1 : 1, ax = Math.round(sx), ay = byy + (p.arrow === 'fly' ? dirY * 6 : 0);
        for (let k = 0; k < 6; k++) c.set(ax, ay + dirY * k, k === 5 ? fl : bowc[1]);
      }
    }
  },
  pose(anim, d, i, p) {
    const s = d === 'n' ? -1 : 1, e = d === 'e';
    const A = (mx, my, ox, oy) => { p.am = e ? [mx, my] : [mx * s, my]; p.ao = e ? [ox, oy] : [ox * s, oy]; };
    if (anim === 'idle' || anim === 'stunned') A(0, -2, 0, 0);
    else if (anim === 'walk') A(p.am[0] * 0.5, -2, p.ao[0] * 0.5, 0);
    else if (anim === 'attack') {
      if (i === 0) { A(e ? 2 : -1, -4, e ? -2 : 3, -4); p.pull = 4; p.arrow = 'nock'; }
      else if (i === 1) { A(e ? 3 : -1, -4, 0, -3); p.pull = 0; p.arrow = 'fly'; p.tx = e ? -1 : 0; p.rear = 1; }
      else { A(e ? 1 : 0, -3, 0, -1); p.pull = 0; p.sq = 0.5; }
    } else if (anim === 'cast') { A(e ? 2 : -1, [-4, -6, -6][i], e ? -2 : 3, [-4, -6, -6][i]); p.pull = [3, 5, 5][i]; p.arrow = i ? 'nock' : 0; p.rear = [0, 2, 2][i]; if (i) p.hy = -1; }
    return p;
  },
};
const sheet = buildSheet(cfg, PL);
console.log(writeSheet('mirana', sheet));
