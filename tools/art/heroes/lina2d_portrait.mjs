// Lina HUD portrait (32 x 42 art px): head only, 3/4 turn to screen-right, chin lifted, head tipped back-left (far eye + brow higher).
// The face is a hand-typed pixel grid (every skin plane / eye / nose / mouth pixel placed by hand); hair is swept flame ribbons
// behind and in front. Registers views.portrait (imported for its side effect by lina2d.mjs).
import { W, H, R, Cv, ell, tongue, spans, paintFlame, I } from './lina2d_kit.mjs';
import { views, ribbon, hairLv, fireLv, hairGlow, sparkles, cross } from './lina2d_views.mjs';

const OX = 28, OY = 30;                       // crop origin: local (gx, gy) -> frame (gx + OX, gy + OY)
const LEG = {
  L: ['skin', 0], l: ['skin', 1], s: ['skin', 2], d: ['skin', 3], Z: ['skin', 4],
  k: '#3c1830', b: '#5a1428', B: '#9a2630', w: '#fff0d4', a: '#ffb030', A: '#f07a1c', P: '#2a0e24', h: '#ffffff',
  m: '#7a2440', p: '#e0605a', q: '#f8907c', c: '#f08e80', n: '#d4707a',
  G: ['gold', 0], g: ['gold', 1], j: ['gold', 2], H: ['gold', 3], J: ['gold', 4], 0: ['hair', 0], 1: ['hair', 1], 2: ['hair', 2], 3: ['hair', 3], 4: ['hair', 4], R: { hex: '#ff5a38', em: 0.5 }, r: '#a81c2c',
};
// one row: [y, x0, x1, tokens]; tokens "<char><count>" (the counts must fill x0..x1 exactly -- checked)
const ROWS = [
  [11, 12, 20, 'L3 l4 s2'],
  [12, 10, 22, 'L4 l6 s3'],
  [13, 9, 23, 'L4 l8 s3'],
  [14, 9, 24, 'L3 l10 s3'],
  [15, 9, 24, 'L3 l9 b3 s1'],
  [16, 9, 25, 'l3 b3 l5 b1 l3 b1 s1'],
  [17, 9, 25, 'l1 b2 l3 b2 l8 s1'],
  [18, 9, 25, 'l11 k4 b1 s1'],
  [19, 9, 25, 'l1 b1 k5 b1 l3 w2 A3 s1'],
  [20, 9, 25, 'l2 w2 A3 w1 l3 w2 a1 P1 h1 s1'],
  [21, 9, 25, 'l2 w2 a1 P1 h1 w1 l3 s1 w1 a3 s1'],
  [22, 9, 25, 'l2 s1 w1 a3 s1 l3 s5 s1'],
  [23, 9, 25, 'l3 s5 L2 d1 l3 s3'],
  [24, 9, 26, 'l1 L3 c3 l1 L2 d1 l2 s2 s1 d2'],
  [25, 10, 26, 'l4 s3 l1 L2 l1 d1 l2 s1 d2'],
  [26, 10, 25, 'l4 s3 d1 Z1 l1 Z1 d1 l2 s1 d1'],
  [27, 10, 25, 'l4 s3 d5 l2 s2'],
  [28, 10, 25, 'l4 s2 c5 m3 d2'],
  [29, 11, 25, 'l4 s1 m4 p1 w2 p1 d2'],
  [30, 11, 24, 'l4 s2 p1 q2 p3 d2'],
  [31, 12, 24, 'l4 s2 d3 l1 s1 d2'],
  [32, 13, 24, 'l3 s3 l2 s2 d2'],
  [33, 15, 23, 'l2 s2 s2 d3'],
  [34, 16, 22, 'l2 s2 d3'],
  [35, 17, 22, 'l1 s2 d2 Z1'],
  [36, 18, 21, 's1 d1 Z2'],
  [37, 16, 22, 'Z3 d4'],
  [38, 15, 23, 'Z1 d8'],
  [39, 13, 25, 'G1 j4 R2 j3 H3'],
  [40, 14, 25, 'g1 j3 H4 J4'],
  [41, 15, 24, 'H3 J7'],
];
const gridRows = () => {
  const g = Array.from({ length: 42 }, () => Array(32).fill('.'));
  for (const [y, x0, x1, toks] of ROWS) {
    let x = x0; for (const t of toks.split(' ')) { const ch = t[0], n = +t.slice(1); for (let i = 0; i < n; i++) g[y][x++] = ch; }
    if (x !== x1 + 1) throw new Error(`portrait row y=${y}: tokens end at ${x - 1}, want ${x1}`);
  }
  return g.map(r => r.join(''));
};

views.portrait = () => {
  const cv = new Cv(); cv.crop = [OX, OY, 32, 42];
  const X = pts => pts.map(([x, y]) => [x + OX, y + OY]);
  const rb = (pts, w, b, forks = [], o = {}) => ribbon(cv, X, pts, w, b, forks, o);
  const tg = (pts, w, b, o = {}) => cv.paintT(tongue(X(pts), w, { pow: o.pow ?? 0.7 }), 'hair', hairLv(b), { line: 4 });

  // ---- hair back: dark root mass + swept ribbons flowing up and back (left), the tallest leaning to the cast side
  const FL = (y0, str, o) => { const sp = spans(y0, str); sp.rows.forEach(r => { r.y += OY; r.xl += OX; r.xr += OX; }); const m = new Uint8Array(W * H); for (const r of sp.rows) for (let x = r.xl; x <= r.xr; x++) if (x >= 0 && x < W) m[I(x, r.y)] = 1; sp.m = m; return paintFlame(cv, sp, o); };
  FL(8, '7-24 5-26 4-27 3-28 3-28 3-28 3-28 3-28 4-27', { bias: 1, tip: 0 });                    // root mass behind the crown
  // crown: four swept flame tongues (tips in the frame, one crops at the top), gaps between them
  FL(8, '30-31 28-31 27-30 26-29 25-28');
  FL(1, '0-1 0-2 1-3 1-4 2-5 2-6 3-7 3-8 4-9 5-10 6-11');                                             // big sweep, hooked tip
  FL(6, '4 4-5 4-6 5-7 6-8 7-9 8-10');                                                                // small lick under it
  FL(0, '8 8-9 8-10 9-11 9-12 10-13 10-14 11-15 11-16 12-17 12-18 12-19');                            // tallest, leaning back
  FL(2, '16 16-17 16-18 17-19 17-20 17-21 18-22 18-23 18-24 18-25');                                  // mid tongue, a little shorter
  FL(3, '25 24-25 24-26 23-27 23-27 23-28 23-28 23-28 23-27');                                        // far right, leaning to the cast side
  // long lock behind the near cheek, short lock behind the far cheek
  FL(12, '4-9 3-8 2-8 2-8 1-8 1-8 0-8 1-8 1-8 2-8 2-8 1-8 1-9 1-9 1-9 1-10 2-10 2-9 2-8 2-8 3-8 3-7 3-7 3-6 4-6 4-5 4', { bias: 1, tip: 0.1 });
  cv.stamp(OX, OY, [
    '.............', '.............', '.............', '.............', '.............', '.............', '.............', '.............', '.............', '.............', '.............', '.............',
    '......3......', '......3......', '.....33......', '.....3.......', '.....3...4...', '.....3...4...', '....33...4...', '....3....4...', '....3...33...', '....3...3....', '...33...3....', '...3....3....',
    '...3...33....', '...3...3.....', '...3...3.....', '..........'], LEG, { only: true });
  cv.stamp(OX, OY, ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '0', '0', '0', '0', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''].map((r, i) => r), LEG, { only: true });
  FL(15, '25-28 26-29 26-29 26-30 26-30 26-30 27-30 27-30 28-30 28-30 28-30 28-29 28-29 28', { bias: 1 });

  // ---- face + collar: the hand grid
  const g = gridRows();
  cv.stamp(OX, OY, g, LEG);
  // dark ring between the face and the hair behind it
  const fm = new Uint8Array(W * H); g.forEach((r, y) => [...r].forEach((c, x) => { if (c !== '.') fm[I(x + OX, y + OY)] = 1; }));
  for (let y = 0; y < 42; y++) for (let x = 0; x < 32; x++) if (!fm[I(x + OX, y + OY)]) {
    let nb = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X_ = x + OX + dx, Y_ = y + OY + dy; if (X_ >= 0 && Y_ >= 0 && X_ < W && Y_ < H && fm[I(X_, Y_)]) nb = true; }
    if (nb && cv.at(x + OX, y + OY)) cv.set(x + OX, y + OY, y > 17 && x < 16 ? '#2a0e24' : R.hair[4], { ramp: R.hair, lv: 4 });
  }

  // ---- hair front: bangs swept across the forehead, a lock framing the near cheek
  FL(10, '14-23 10-24 9-23 9-20 9-16 9-13 9-11', { bias: 0 });

  cross(cv, 28 + OX, 5 + OY); sparkles(cv, [[3 + OX, 4 + OY, '#ffc43c'], [30 + OX, 14 + OY, '#ff8a26'], [11 + OX, 2 + OY, '#fff0a0']]);
  hairGlow(cv);
  cv.outline();
  return cv;
};
