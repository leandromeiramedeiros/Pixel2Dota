// Generates client/src/art/sheets/creeps.js  (node tools/art/world/creeps.mjs)
import path from 'node:path';
import { Cv, writeSheet, SHEETS, ell, rect, line, poly, paint, K } from './lib.mjs';

const pal = {
  O: '#1a1410',
  // Radiant cloth (lit, mid, shade), green (hi, mid, dark), skin, metal, wood
  W: '#f4efe0', w: '#d3ccb4', x: '#9c957f', G: '#6fd08a', H: '#3ea060', J: '#226a42',
  S: '#f0c8a0', s: '#cf9f78', t: '#9a6c52', M: '#e8ecf4', m: '#a7b0c4', n: '#6a7288', B: '#8a5d34', b: '#58381c',
  // Dire ash skin (hi..dark), red cloth, bone
  I: '#a08a9c', D: '#74617a', E: '#4d3f56', F: '#2e2536', R: '#d8442c', r: '#9a2a1e', q: '#5a1612', Z: '#e8dfc8', z: '#b5a98a',
  // emissive: dire eyes, Radiant orb, Dire orb, siege ember, gold
  e: '#ff4a2a', '1': '#b8ffd8', '2': '#ffffff', '3': '#ff9a40', '4': '#fff0a0', Y: '#ffcf5a',
};
const emit = { e: 1.4, '1': 1.6, '2': 2.6, '3': 1.6, '4': 2.6 };
const frames = {}, anchors = {};
function reg(name, set, ax, ay) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const cv of Object.values(set)) for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) if (cv.g[y][x] !== '.') { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  for (const [suffix, cv] of Object.entries(set)) {
    const key = name + '_' + suffix, rows = [];
    for (let y = y0; y <= y1; y++) { let r = ''; for (let x = x0; x <= x1; x++) r += cv.g[y]?.[x] ?? '.'; rows.push(r); }
    frames[key] = rows; anchors[key] = [ax - x0, ay - y0];
  }
}
const tone = (r, x0, x1) => (x) => { const t = (x - x0) / Math.max(1, x1 - x0); return t < 0.34 ? r[0] : t < 0.72 ? r[1] : r[2]; };
const CW = 30, CH = 32, cx = 15, gy = 28; // canvas, centre x, ground line (feet occupy rows gy-5..gy-1)

// ---------------- humanoid creeps ----------------
const STY = {
  melee_r: { skin: ['S', 's', 't'], cloth: ['W', 'w', 'x'], head: ['G', 'H', 'J'], pants: ['J', 'J', 'J'], boot: 'b', eye: 'O', weapon: 'sword', shield: true },
  melee_d: { skin: ['I', 'D', 'E'], cloth: ['R', 'r', 'q'], head: ['D', 'E', 'F'], pants: ['F', 'F', 'F'], boot: 'F', eye: 'e', weapon: 'claws', horns: true },
  ranged_r: { skin: ['S', 's', 't'], cloth: ['W', 'w', 'x'], head: ['G', 'H', 'J'], pants: ['w', 'x', 'x'], boot: 'b', eye: 'O', weapon: 'staff', robe: true, orb: ['1', '2'], hood: true },
  ranged_d: { skin: ['I', 'D', 'E'], cloth: ['F', 'F', 'F'], head: ['r', 'q', 'q'], pants: ['F', 'F', 'F'], boot: 'F', eye: 'e', weapon: 'staff', robe: true, orb: ['3', '4'], hood: true, trim: 'R' },
};

function humanoid(st, dir, a) {
  const cv = new Cv(CW, CH), side = dir === 'e', back = dir === 'n';
  const { s = 0, lift = 0, bob = 0, swing = 0, wang = null, orbr = 1.5, kneel = 0 } = a;
  const ty = gy - 12 + bob + kneel, hy = gy - 15 + bob + kneel;       // torso top, head centre
  const hipY = ty + 7;
  const legTop = gy - 5 + kneel;
  const ink = 'O';
  // ---- weapon hand target ----
  let hx, hyy;
  const wv = wang || [0.25, -1];
  // ---- legs ----
  if (!side) {
    for (const [lx, lf] of [[cx - 4, s > 0 ? 1 : 0], [cx + 1, s < 0 ? 1 : 0]]) {
      const l2 = lf || (lift && !s ? 0 : 0);
      if (!st.robe) paint(cv, rect(lx, legTop, lx + 2, gy - 1 - l2), (x, y) => (y >= gy - 2 - l2 ? st.boot : st.pants[x === lx ? 0 : 2]), ink);
    }
  } else {
    const legs = [[cx - 1 - s * 2, 0, true], [cx - 1 + s * 2, 0, false]]; // back, front
    legs.forEach(([lx, , isBack], i) => { const lf = (lift && !s) ? (i === 0 ? 1 : 0) : 0; if (!st.robe) paint(cv, rect(lx, legTop, lx + 2, gy - 1 - lf), (x, y) => (y >= gy - 2 - lf ? st.boot : st.pants[isBack ? 2 : 1]), ink); });
  }
  // ---- far arm (side view) ----
  const aSw = swing;
  if (side) paint(cv, rect(cx - 2, ty + 1, cx - 1, ty + 5 - Math.max(0, aSw)), st.cloth[2], ink);
  // ---- torso / robe ----
  const tw = side ? [cx - 3, cx + 2] : [cx - 4, cx + 3];
  if (st.robe) {
    const m = poly([[tw[0], ty], [tw[1] + 1, ty], [tw[1] + 2, gy - 2 + kneel], [tw[0] - 1, gy - 2 + kneel]]);
    paint(cv, m, (x, y) => { const base = tone(st.cloth, tw[0] - 1, tw[1] + 2)(x); if (y === ty + 7) return st.trim || 'Y'; if (y >= gy - 3 + kneel && ((x + y) & 1)) return st.trim || 'Y'; return base; }, ink);
    if (!side) for (let y = ty + 2; y < gy - 3 + kneel; y++) if (!back) cv.set(cx, y, st.cloth[1]);
    // boots peeking
    if (!kneel) { cv.set(cx - 2 + s, gy - 1, st.boot); cv.set(cx + 1 - s, gy - 1, st.boot); }
  } else {
    paint(cv, rect(tw[0], ty, tw[1], hipY - 1), (x, y) => (y === hipY - 1 ? 'Y' : (y === ty ? st.cloth[0] : tone(st.cloth, tw[0], tw[1])(x))), ink);
    if (!back && st.weapon === 'sword') for (let y = ty + 1; y < hipY - 1; y++) cv.set(cx + (side ? 0 : 0), y, 'G'); // green sash
    if (st.horns && !back) { for (let y = ty + 1; y < hipY - 2; y++) cv.set(cx - 1 + (y & 1) * 2, y, 'Z'); } // rib bones
  }
  // ---- head ----
  const hcx = side ? cx + 1 : cx;
  const head = ell(hcx, hy, 3.4, 3.4);
  paint(cv, head, (x, y) => (back ? st.head[(x - hcx) < -1 ? 0 : (x - hcx) > 1 ? 2 : 1] : (y < hy - 1 && !st.horns && !st.hood ? st.head[(x - hcx) > 1 ? 1 : 0] : tone(st.skin, hcx - 3, hcx + 3)(x))), ink);
  if (st.hood && !back) { // hood frames the face
    paint(cv, ell(hcx, hy - 1, 3.4, 2.6), (x, y) => st.head[(x - hcx) > 1 ? 2 : (x - hcx) < -1 ? 0 : 1], null);
    for (let y = hy; y <= hy + 2; y++) { cv.set(hcx - 3, y, st.head[1]); cv.set(hcx + 3, y, st.head[2]); }
    for (let x = hcx - 2; x <= hcx + 2; x++) cv.set(x, hy - 1, x < hcx ? st.head[0] : st.head[1]);
    for (let x = hcx - 2; x <= hcx + 2; x++) { cv.set(x, hy, st.skin[1]); cv.set(x, hy + 1, st.skin[0]); }
    cv.set(hcx - 2, hy + 2, st.skin[2]); cv.set(hcx + 2, hy + 2, st.skin[2]);
  }
  if (st.hood && back) { for (let x = hcx - 2; x <= hcx + 2; x++) cv.set(x, hy - 2, st.head[0]); }
  if (st.weapon === 'sword' && !st.hood) { // green helmet + white crest
    for (let x = hcx - 3; x <= hcx + 3; x++) cv.set(x, hy - 3, x < hcx ? 'G' : 'H');
    if (!back) { cv.set(hcx, hy - 4, 'W'); cv.set(hcx, hy - 5, 'W'); cv.set(hcx + 1, hy - 5, 'w'); } else { cv.set(hcx, hy - 4, 'W'); cv.set(hcx, hy - 5, 'W'); cv.set(hcx - 1, hy - 5, 'w'); }
    if (!back && !side) { cv.set(hcx - 3, hy, 'H'); cv.set(hcx + 3, hy, 'J'); cv.set(hcx - 3, hy + 1, 'H'); cv.set(hcx + 3, hy + 1, 'J'); }
  }
  if (st.horns) { // dire horns
    for (const d of [-1, 1]) for (let i = 0; i < 4; i++) { cv.set(hcx + d * (3 + (i > 1 ? 1 : 0) + (side ? 0 : 0)), hy - 2 - i, i < 3 ? 'Z' : 'z'); cv.set(hcx + d * (4 + (i > 1 ? 1 : 0)), hy - 2 - i, i < 3 ? 'z' : '.'); if (i === 0) cv.set(hcx + d * 3, hy - 2, 'Z'); }
    if (side) { cv.set(hcx - 3, hy - 6, '.'); }
  }
  // face
  if (!back) {
    if (side) { cv.set(hcx + 2, hy - (st.hood ? 0 : 0), st.eye); cv.set(hcx + 3, hy + 1, st.skin[0]); cv.set(hcx + 2, hy + 2, st.horns ? 'Z' : st.skin[2]); }
    else { cv.set(hcx - 2, hy, st.eye); cv.set(hcx + 1, hy, st.eye); if (st.horns) { cv.set(hcx - 1, hy + 2, 'Z'); cv.set(hcx, hy + 2, 'Z'); cv.set(hcx + 1, hy + 2, 'Z'); } }
    if (st.eye === 'e') { /* glowing eyes already */ }
  }
  // ---- near arm + weapon ----
  const asw = swing;
  const armX = side ? cx + 1 : cx + 4, armX2 = cx - 6; // near arm (viewer right), far arm (viewer left)
  const handY = ty + 5 - Math.max(0, -asw);
  const drawArm = (ax, col, hand) => paint(cv, rect(ax, ty + 1, ax + 1, ty + 5 - (hand ? 0 : 0)), (x, y) => (y >= ty + 5 ? st.skin[1] : col), ink);
  if (!side) {
    // far arm (viewer left) holds the shield (melee_r) or swings
    const fy = asw > 0 ? asw : 0;
    paint(cv, rect(armX2, ty + 1 + (s > 0 ? 1 : 0), armX2 + 1, ty + 5 + (s > 0 ? 1 : 0)), (x, y) => (y >= ty + 5 + (s > 0 ? 1 : 0) ? st.skin[1] : st.cloth[0]), ink);
    if (st.shield) { paint(cv, ell(armX2, ty + 4 + (s > 0 ? 1 : 0), 1.8, 2.6), (x, y) => (x < armX2 ? 'M' : y > ty + 4 ? 'n' : 'm'), ink); cv.set(armX2, ty + 4 + (s > 0 ? 1 : 0), 'Y'); }
    paint(cv, rect(armX, ty + 1 + (s < 0 ? 1 : 0), armX + 1, ty + 5 + (s < 0 ? 1 : 0)), (x, y) => (y >= ty + 5 + (s < 0 ? 1 : 0) ? st.skin[1] : st.cloth[1]), ink);
    hx = armX; hyy = ty + 5 + (s < 0 ? 1 : 0);
  } else {
    paint(cv, rect(armX, ty + 1, armX + 1, ty + 5), (x, y) => (y >= ty + 5 ? st.skin[0] : st.cloth[0]), ink);
    hx = armX + 1; hyy = ty + 5;
  }
  // weapon
  const wlen = st.weapon === 'sword' ? 8 : st.weapon === 'staff' ? 15 : 3;
  if (st.weapon === 'sword') {
    const ex = Math.round(hx + wv[0] * wlen), ey = Math.round(hyy + wv[1] * wlen);
    paint(cv, line(hx, hyy, ex, ey, 1), (x, y) => (Math.abs(x - hx) + Math.abs(y - hyy) < 3 ? 'B' : (x + y) & 1 ? 'M' : 'm'), ink);
    cv.set(hx, hyy, st.skin[1]); cv.set(hx - 1, hyy, 'Y'); cv.set(hx + 1, hyy, 'Y');
  } else if (st.weapon === 'claws') {
    for (let i = 0; i < 3; i++) { const ex = hx + Math.round(wv[0] * 3) + i - 1, ey = hyy + 1 + Math.round(wv[1] * 3 * (wv[1] > 0 ? 1 : 0.6)) + 1; cv.set(hx + i - 1 + (wv[0] > 0.6 ? i : 0), hyy + 1, 'Z'); cv.set(ex + (wv[0] > 0.6 ? i + 1 : 0), Math.max(hyy + 1, Math.min(hyy + 4, ey)), 'z'); }
    if (wv[1] > 0.1) cv.set(hx + 1, hyy + 4, 'Z');
  } else if (st.weapon === 'staff') {
    const tx = hx + (side ? 1 : 0), top = hyy - 14 + (a.thrust ? 2 : 0);
    paint(cv, line(tx, hyy + 2, tx, top, 1), (x, y) => (y & 1 ? 'B' : 'b'), ink);
    cv.set(tx, hyy, st.skin[0]);
    const or = orbr, oy = top - 2;
    paint(cv, ell(tx, oy, or, or), (x, y) => (Math.hypot(x - tx, y - oy) < or * 0.55 ? st.orb[1] : st.orb[0]), ink);
    if (or > 2) { cv.set(tx - 3, oy, st.orb[0]); cv.set(tx + 3, oy, st.orb[0]); cv.set(tx, oy - 3, st.orb[0]); cv.set(tx, oy + 3, st.orb[0]); }
  }
  return cv;
}

const STAFF_CHARGE = [1.2, 2.4, 1.6];
function poseFor(kind, anim, i) {
  if (anim === 'idle') return { bob: i ? 1 : 0, orbr: i ? 1.2 : 1.6 };
  if (anim === 'walk') { const s = [1, 0, -1, 0][i]; return { s, lift: i & 1, bob: (i & 1) ? -1 : 0, orbr: 1.5 }; }
  if (anim === 'attack') {
    if (kind === 'melee_r') return [{ wang: [-0.5, -1], swing: 1 }, { wang: [0.9, 0.5], swing: -1, bob: 1 }, { wang: [0.9, -0.4] }][i];
    if (kind === 'melee_d') return [{ wang: [-0.2, -1], swing: 1 }, { wang: [0.7, 0.8], bob: 1 }, { wang: [0.4, 0], bob: 0 }][i];
    return [{ orbr: STAFF_CHARGE[0], bob: 0 }, { orbr: STAFF_CHARGE[1], thrust: 1, bob: 1 }, { orbr: STAFF_CHARGE[2], bob: 0 }][i];
  }
}
function dying(kind, st, dir, i) {
  if (i === 0) return humanoid(st, dir, { bob: 2, kneel: 0, orbr: 1.2, wang: [0.7, 0.2] });
  if (i === 1) return humanoid(st, dir, { bob: 1, kneel: 3, orbr: 1, wang: [0.9, 0.5] });
  // lying on the ground: draw the standing body into a scratch canvas and rotate 90 degrees
  const src = humanoid(st, dir, { kneel: 6, bob: 0, orbr: 0.9, wang: [1, 0.4] });
  const cv = new Cv(CW, CH);
  // rotate: (x, y) -> (cx + (gy-1-y) * -1 ..)  head ends on the left, feet on the right, lying flat on the ground line
  const flip = dir === 'n' ? -1 : 1;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const c = src.g[y][x]; if (c === '.') continue; const u = gy - 1 - y, v = x - cx; cv.set(cx + 7 * flip - u * flip, gy - 2 + (v > 0 ? 0 : 0) + Math.round(v * 0.0) + (v < 0 ? -Math.round(-v * 0.5) : Math.round(v * 0.5)), c); }
  return cv;
}
for (const side of ['r', 'd']) for (const role of ['melee', 'ranged']) {
  const kind = role + '_' + side, st = STY[kind], set = {};
  for (const dir of ['s', 'n', 'e']) {
    for (let i = 0; i < 2; i++) set[`idle_${dir}_${i}`] = humanoid(st, dir, poseFor(kind, 'idle', i));
    for (let i = 0; i < 4; i++) set[`walk_${dir}_${i}`] = humanoid(st, dir, poseFor(kind, 'walk', i));
    for (let i = 0; i < 3; i++) set[`attack_${dir}_${i}`] = humanoid(st, dir, poseFor(kind, 'attack', i));
    for (let i = 0; i < 3; i++) set[`death_${dir}_${i}`] = dying(kind, st, dir, i);
  }
  reg('creep_' + kind, set, cx, gy - 1);
}

// ---------------- siege catapults ----------------
const SW = 40, SH = 32, scx = 20, sgy = 28;
function wheel(cv, x, y, rad, phase, dire) {
  paint(cv, ell(x, y, rad, rad), (px, py) => (Math.hypot(px - x, py - y) < rad - 1.2 ? (dire ? 'F' : 'B') : (dire ? 'E' : 'b')), 'O');
  for (let k = 0; k < 3; k++) { const a = phase + k * Math.PI / 3; for (let t = 0; t <= rad - 1; t += 0.5) { cv.set(x + Math.cos(a) * t, y + Math.sin(a) * t, dire ? 'D' : 'B'); cv.set(x - Math.cos(a) * t, y - Math.sin(a) * t, dire ? 'D' : 'B'); } }
  cv.set(x, y, dire ? 'Z' : 'Y');
}
function siege(dire, dir, anim, i) {
  const cv = new Cv(SW, SH), bob = anim === 'walk' ? ((i & 1) ? -1 : 0) : anim === 'idle' && i ? 1 : 0;
  const wood = dire ? ['E', 'D', 'F'] : ['B', 'b', 'b'], rope = dire ? 'Z' : 'W';
  const phase = anim === 'walk' ? i * (Math.PI / 6) : 0;
  const armAng = anim === 'attack' ? [-2.35, -0.25, -1.3][i] : anim === 'idle' ? (i ? -1.9 : -1.95) : -1.9; // radians from +x (screen-y down)
  const ammo = dire ? ['3', '4'] : ['n', 'm'];
  if (dir === 'e') {
    const wy = sgy - 4;
    paint(cv, rect(scx - 13, wy - 7 + bob, scx + 13, wy - 4 + bob), tone(wood, scx - 13, scx + 13), 'O');
    paint(cv, poly([[scx - 4, wy - 7 + bob], [scx, wy - 16 + bob], [scx + 4, wy - 7 + bob]]), tone(wood, scx - 4, scx + 4), 'O'); // A-frame
    const px = scx, py = wy - 14 + bob;
    const ex = Math.round(px + Math.cos(armAng) * 15), ey = Math.round(py + Math.sin(armAng) * 15);
    paint(cv, line(px, py, ex, ey, 2), (x, y) => (dire ? 'D' : 'B'), 'O');
    // short counter-weight side + bucket at the far end
    const bx = ex, by = ey;
    paint(cv, rect(bx - 2, by - 1, bx + 2, by + 1), dire ? 'F' : 'b', 'O');
    cv.set(bx, by - 2, ammo[0]); cv.set(bx - 1, by - 2, ammo[0]); cv.set(bx + 1, by - 2, ammo[1]); cv.set(bx, by - 3, ammo[1]);
    if (dire) { cv.set(bx - 1, by - 3, '3'); cv.set(bx + 1, by - 3, '3'); }
    // rope + rim banner
    cv.set(px - 1, py - 1, rope); cv.set(px - 2, py - 1, rope);
    wheel(cv, scx - 9, wy + 1 + bob * 0, 4, phase, dire); wheel(cv, scx + 8, wy + 1 + bob * 0, 4, phase, dire);
    if (!dire) { paint(cv, rect(scx - 11, wy - 11 + bob, scx - 9, wy - 8 + bob), 'G', 'O'); cv.set(scx - 10, wy - 12 + bob, 'W'); } else { for (let k = 0; k < 3; k++) cv.set(scx - 12 + k * 2, wy - 8 + bob - (k & 1), 'Z'); }
  } else {
    // front / back view: two wheels on either side of the frame, arm seen foreshortened
    const wy = sgy - 4, front = dir === 's';
    paint(cv, rect(scx - 8, wy - 9 + bob, scx + 8, wy - 2 + bob), tone(wood, scx - 8, scx + 8), 'O');
    for (let x = scx - 6; x <= scx + 6; x += 4) for (let y = wy - 7 + bob; y <= wy - 3 + bob; y++) cv.set(x, y, wood[2]);
    wheel(cv, scx - 11, wy + bob * 0, 5, phase, dire); wheel(cv, scx + 11, wy + bob * 0, 5, phase, dire);
    const lean = anim === 'attack' ? [2, 0, 1][i] : 0;
    paint(cv, rect(scx - 1 - lean, wy - 20 + bob + (front ? 0 : 2) + (anim === 'attack' && i === 1 ? 4 : 0), scx + 1 - lean, wy - 9 + bob), (x) => (x < scx - lean ? (dire ? 'D' : 'B') : (dire ? 'E' : 'b')), 'O');
    paint(cv, rect(scx - 4 - lean, wy - 24 + bob + (anim === 'attack' && i === 1 ? 5 : 0), scx + 4 - lean, wy - 20 + bob + (anim === 'attack' && i === 1 ? 5 : 0)), dire ? 'F' : 'b', 'O');
    if (front && !(anim === 'attack' && i === 1)) { for (let x = scx - 3 - lean; x <= scx + 3 - lean; x++) cv.set(x, wy - 23 + bob, x & 1 ? ammo[0] : ammo[1]); cv.set(scx - lean, wy - 24 + bob, ammo[1]); cv.set(scx - 1 - lean, wy - 24 + bob, ammo[0]); cv.set(scx + 1 - lean, wy - 24 + bob, ammo[0]); }
    if (!dire) { paint(cv, rect(scx - 3, wy - 6 + bob, scx + 3, wy - 4 + bob), (x) => (front ? 'G' : 'H'), null); for (let x = scx - 3; x <= scx + 3; x += 2) cv.set(x, wy - 5 + bob, 'W'); } else { for (let x = scx - 4; x <= scx + 4; x += 2) cv.set(x, wy - 7 + bob, 'Z'); }
  }
  return cv;
}
for (const side of ['r', 'd']) {
  const set = {};
  for (const dir of ['s', 'n', 'e']) {
    for (let i = 0; i < 2; i++) set[`idle_${dir}_${i}`] = siege(side === 'd', dir, 'idle', i);
    for (let i = 0; i < 4; i++) set[`walk_${dir}_${i}`] = siege(side === 'd', dir, 'walk', i);
    for (let i = 0; i < 3; i++) set[`attack_${dir}_${i}`] = siege(side === 'd', dir, 'attack', i);
    for (let i = 0; i < 3; i++) { const c = siege(side === 'd', dir, 'idle', 0); set[`death_${dir}_${i}`] = i === 0 ? c : (() => { const d = new Cv(SW, SH); const sh = i; for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) { const ch = c.g[y][x]; if (ch === '.') continue; if (y < sgy - 4 - sh * 4 && i === 2 && (x + y) % 3 === 0) continue; d.set(x, Math.min(sgy - 1, y + sh * 3), ch); } return d; })(); }
  }
  reg('creep_siege_' + side, set, scx, sgy - 1);
}

// ---------------- export ----------------
const header = {
  gen: 'tools/art/world/creeps.mjs',
  doc: [
    'Lane creeps. Names: creep_melee_r/d, creep_ranged_r/d, creep_siege_r/d (r = Radiant, d = Dire).',
    'Key scheme: <name>_<anim>_<dir>_<i>  e.g. creep_melee_r_walk_e_2.  anims: idle(2) walk(4) attack(3) death(3: stagger, kneel, fallen).',
    'dirs: s = facing the camera (south), n = facing away, e = facing east. West = e mirrored by the renderer (do not store).',
    'Frames of one creep are cropped to one shared size, so anchors[key] = [x,y] = FEET centre on the ground; it is the same for every frame of a creep.',
    'Emissive (emit map): ranged orbs 1,2 (Radiant) 3,4 (Dire / siege ammo), Dire eyes e. Humanoid ~20 px tall, siege ~38 px wide.',
  ],
};
const bytes = writeSheet(path.join(SHEETS, 'creeps.js'), header, { pal, emit, anchor: [cx, gy - 1], anchors, frames });
console.log('creeps.js', bytes, 'bytes', Object.keys(frames).length, 'frames');
const seen = new Set(); for (const k of Object.keys(frames)) { const n = k.replace(/_(idle|walk|attack|death)_[sne]_\d+$/, ''); if (!seen.has(n)) { seen.add(n); console.log(n, frames[k][0].length + 'x' + frames[k].length, anchors[k].join(',')); } }
