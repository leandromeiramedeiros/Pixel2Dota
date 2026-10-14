import { Glyph, THEMES, FULL, P, T, E, L, D, F, band, star } from './hd_kit.mjs';
Object.assign(THEMES, {
  hd_slave: { bg: ['#3a1408', '#2a0e08', '#1a0806'], bev: ['#ffc060', '#1c0804'] },
  hd_lsa: { bg: ['#1a1c44', '#241438', '#3a1410'], bev: ['#ffb060', '#10060a'] },
  hd_soul: { bg: ['#2a1008', '#1c0a06', '#10060a'], bev: ['#ffb060', '#10060a'] },
  hd_laguna: { bg: ['#10286c', '#0c1c52', '#081238'], bev: ['#b0e0ff', '#060c2c'] },
});
export const HD_LINA = {};

// ---------------------------------------------------------------- Dragon Slave
// Original: a dragon of fire seen in profile, snout biting down toward the lower right, the body streaming up and to the left in
// banded orange-yellow streaks with dark cells; near-black brown behind it, lit gold along the jaw and the back.
HD_LINA.lina_dragon_slave = ['hd_slave', g => {
  const body = Glyph.poly([[0, 0], [33, 0], [35, 3], [34, 9], [33, 14], [32, 17], [27.5, 17.6], [25, 18.6], [24.6, 22], [26.4, 24], [30, 26], [33.8, 28.6], [30, 28.2], [26.5, 27.4], [30.4, 30.4], [25, 30.8], [21, 28.8], [18, 27.6], [17, 29.5], [15.5, 31], [10, 31.5], [4, 32], [0, 31.6]]);
  // dark brown surround with a hard-edged glow ring
  F(g, () => '#2a0c08'); g.fill(Glyph.grow(body, 4), '#3c1408'); g.fill(Glyph.grow(body, 2), '#6a2a0e');
  g.fill(body, '#e8701a');
  // red-orange upper body fading to orange, yellow lower body + head
  P(g, [[0, 0], [33, 0], [35, 3], [34, 9], [28, 12], [20, 16], [8, 22], [0, 24]], '#d4521a');
  P(g, [[0, 0], [24, 0], [16, 6], [8, 11], [0, 15]], '#bc4018');
  P(g, [[0, 25], [8, 22], [18, 20], [26, 20], [26.4, 24], [30, 26], [33.8, 28.6], [30, 28.2], [26.5, 27.4], [30.4, 30.4], [25, 30.8], [21, 28.8], [18, 27.6], [17, 29.5], [15.5, 31], [10, 31.5], [4, 32], [0, 31.6]], '#f8a020');
  P(g, [[0, 29], [9, 25], [18, 23], [26, 24], [29, 26], [33, 28.4], [29.6, 27.8], [26, 27.4], [23, 28.8], [18, 27.4], [13, 28.5], [6, 30.5], [0, 31]], '#ffc830');
  // dark flame cells, long axis along the flow (down-right)
  for (const [x, y, d] of [[3, 5, 5], [10, 3, 5], [16, 7, 5], [24, 5, 4], [1, 12, 5], [8, 11, 5], [15, 14, 5], [22, 11, 4], [28, 8, 3], [5, 19, 5], [12, 18, 5], [3, 23, 4], [18, 1, 4], [6, 14, 4], [20, 17, 4], [27, 13, 3], [0, 8, 4]])
    T(g, [x, y], [x + d * 0.5, y + d * 0.45], [x + d, y + d * 0.8], 1.3, 0.5, '#9c2a10');
  // flow streaks
  const S = (x0, y0, cx, cy, x1, y1, r, c) => T(g, [x0, y0], [cx, cy], [x1, y1], r + 0.2, r, c);
  S(0, 3, 8, 6, 16, 14, 0.6, '#f58a22'); S(6, 0, 14, 5, 22, 14, 0.6, '#f58a22'); S(14, 0, 22, 4, 29, 13, 0.7, '#f58a22'); S(22, 0, 28, 4, 32, 12, 0.7, '#ff9a24');
  S(0, 10, 6, 12, 14, 19, 0.6, '#f58a22'); S(0, 16, 8, 17, 16, 23, 0.7, '#ffa828');
  S(2, 0, 10, 5, 18, 13, 0.5, '#ffd23c'); S(10, 0, 18, 4, 25, 12, 0.5, '#ffd23c'); S(18, 0, 25, 3, 30, 10, 0.5, '#ffd23c'); S(0, 6, 5, 9, 12, 16, 0.5, '#ffd23c');
  S(0, 21, 8, 20, 18, 25, 0.6, '#ffd23c'); S(4, 14, 10, 16, 20, 21, 0.5, '#ffe45a'); S(0, 26, 9, 23, 22, 25, 0.7, '#ffe45a');
  // lit rim: yellow-white along the back, neck, snout and jaw
  g.fill(Glyph.rim(body, 1, 0), '#ffe83c'); g.fill(Glyph.rim(body, 0, 1), '#ffe83c');
  g.fill(Glyph.rim(Glyph.shrink(body, 1), 1, 0), '#ffd020'); g.fill(Glyph.rim(Glyph.shrink(body, 1), 0, 1), '#ffd020');
  // head: brow spike, snout, eye, mouth, teeth
  L(g, [[24.4, 18.6], [24.4, 22]], '#fff0a0'); D(g, [[25, 18.6], [25, 19.6], [25, 20.6]], '#ffe040');
  P(g, [[25.6, 22], [31, 26.4], [33.4, 28.2], [29.6, 27.4], [27, 25]], '#fff0a0'); D(g, [[31, 28], [29, 28], [27.6, 28.4]], '#fff6c8');
  L(g, [[19, 26.6], [23, 27.2], [26, 28.4], [29, 29]], '#a02c10');
  D(g, [[30, 29.8], [27, 30.4], [23, 29.8]], '#fff6c8');
  E(g, 21, 22, 1.5, 1, '#a02c10'); D(g, [[21, 22], [20, 22]], '#fff6c8');
  // sparks
  D(g, [[33, 12], [31, 6], [34, 16], [29, 15], [16, 21], [13, 24], [24, 24]], '#ffe45a'); D(g, [[24, 32], [28, 33], [31, 31]], '#7a3010');
}];

// ---------------------------------------------------------------- Light Strike Array
// Original: a slim white light beam falling straight down the middle, wide orange-red curtains either side fading to dark blue edges,
// and a bowl of fire at the bottom where the beam hits; sparks all through it.
HD_LINA.lina_light_strike_array = ['hd_lsa', g => {
  // curtains of light, asymmetric columns [x0, x1, colour]; the beam sits near x = 17.5
  const cols = [[0, 2, '#10143a'], [3, 4, '#1e1a46'], [5, 7, '#4c1a2c'], [8, 9, '#8c2418'], [10, 11, '#c4381a'], [12, 13, '#e8601a'], [14, 15, '#ff9a22'], [16, 19, '#ffd23c'], [20, 21, '#ff9a22'], [22, 24, '#e8601a'], [25, 26, '#c4381a'], [27, 29, '#7a1e24'], [30, 31, '#3a1a40'], [32, 33, '#1e1a46'], [34, 35, '#10143a']];
  F(g, x => { for (const [a, b, c] of cols) if (x >= a && x <= b) return c; return null; });
  // lighter / darker hairline columns that give each curtain its fold
  for (const [x, y0, y1, c] of [[10, 0, 24, '#b4301a'], [12, 2, 22, '#e8601a'], [8, 4, 20, '#7a1e24'], [14, 0, 26, '#ffb030'], [15, 3, 20, '#ffd23c'], [21, 0, 25, '#ffd23c'], [23, 3, 22, '#ff9a22'], [25, 1, 23, '#e8601a'], [27, 5, 19, '#b4301a'], [29, 2, 18, '#4c1a2c'], [5, 6, 17, '#2c1a44'], [32, 5, 16, '#2c1a44'], [7, 0, 12, '#2c1a44'], [28, 0, 10, '#2c1a44']])
    L(g, [[x, y0], [x, y1]], c);
  // the bowl of fire (lower half of a wide ellipse), rim bright, core white-hot
  const below = Glyph.rect(0, 26, 35, 35), bowl = (cx, cy, rx, ry) => Glyph.and(Glyph.ell(cx, cy, rx, ry), below);
  g.fill(Glyph.and(Glyph.ell(17.5, 26, 18.5, 9.5), Glyph.rect(0, 26, 35, 35)), '#5a1820');
  g.fill(bowl(17.5, 26, 17.5, 8.4), '#d4401a'); g.fill(bowl(17.5, 26.6, 16, 7.4), '#f2701c'); g.fill(bowl(17.5, 27.4, 13.4, 6.4), '#ff9e24');
  g.fill(bowl(17.5, 28.4, 10.4, 5.4), '#ffc83a'); g.fill(bowl(17.5, 29.6, 7.4, 4.4), '#ffe878'); g.fill(bowl(17.5, 31, 4.6, 3.2), '#fff6c8'); g.fill(bowl(17.5, 32, 2.4, 1.8), '#ffffff');
  L(g, [[2, 28], [4, 27], [8, 26.5]], '#ffd23c'); L(g, [[33, 28], [31, 27], [27, 26.5]], '#ffd23c');   // lit rim
  // flame tongues licking up from the rim
  for (const [x, h, c] of [[3, 3, '#e8601a'], [6, 4, '#ff9a22'], [10, 3, '#ffb030'], [13, 5, '#ffd23c'], [22, 5, '#ffd23c'], [25, 3, '#ffb030'], [28, 4, '#ff9a22'], [31, 3, '#e8601a']]) P(g, [[x - 1, 27], [x, 27 - h], [x + 1, 27]], c);
  // the beam: a slim white bolt, a little wavy, fatter where it lands
  const wob = [0, 1, 1, 0, 0, 1, 1, 0, -1, 0, 0, 1, 1, 0, 0, -1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0];
  wob.forEach((o, y) => { const w = y < 10 ? 2 : y < 20 ? 3 : 4; L(g, [[16 + o, y], [15 + w + o, y]], '#ffffff'); if (y > 8) D(g, [[15 + o, y], [16 + w + o, y]], '#fff0a0'); });
  // embers
  D(g, [[4, 10], [7, 16], [12, 8], [10, 20], [24, 9], [28, 14], [31, 6], [26, 20], [33, 18], [2, 18], [13, 15], [22, 16]], '#ffc83c');
  D(g, [[5, 5], [30, 11], [20, 4], [9, 12], [27, 3]], '#ffe6a0');
}];

// ---------------------------------------------------------------- Fiery Soul
// Original: Lina's face looking up, glowing yellow eyes and white war paint, long flame-orange hair flaring wide, a black choker
// with red bands and a gold diamond, smoky dark fire behind her.
HD_LINA.lina_fiery_soul = ['hd_soul', g => {
  // smoky fire behind her: dark planes with warm clouds
  F(g, (x, y) => band(Math.hypot(x - 17.5, (y - 12) * 1.1), [12, 18, 24], ['#4a1a0a', '#34120a', '#220c08', '#14080a']));
  for (const [x, y, rx, ry, c] of [[4, 5, 4, 3, '#5a2410'], [31, 6, 4, 3.5, '#6a2c10'], [2, 12, 2, 3, '#2a0e08'], [33, 15, 2, 3, '#5a2410'], [9, 3, 3, 2, '#3a1408'], [27, 2, 3, 2, '#3a1408']]) E(g, x, y, rx, ry, c);
  // hair behind: flaring wide, dark red base
  const hair = Glyph.poly([[18, 1], [13, 2], [9, 6], [6, 11], [3, 16], [0, 22], [0, 35], [35, 35], [35, 25], [33, 19], [30, 13], [26, 7], [22, 2]]);
  g.fill(hair, '#7a2412', true);
  P(g, [[18, 2], [13, 3], [10, 7], [7, 12], [4, 18], [1, 25], [0, 30], [9, 30], [11, 22], [12, 12]], '#a82e14', true);
  P(g, [[18, 2], [22, 3], [25, 7], [28, 13], [31, 19], [34, 26], [35, 31], [27, 31], [25, 22], [24, 12]], '#a82e14', true);
  // strands: orange, then yellow lit edges
  for (const [a, b, c, r, col] of [
    [[13, 4], [7, 11], [1, 24], 1.3, '#d8521a'], [[14, 5], [9, 15], [4, 29], 1.4, '#e8701c'], [[12, 6], [6, 16], [0, 31], 1.2, '#d8521a'], [[15, 4], [11, 12], [8, 28], 1.2, '#c4401a'],
    [[22, 4], [28, 11], [34, 24], 1.3, '#d8521a'], [[21, 5], [26, 15], [31, 29], 1.4, '#e8701c'], [[23, 6], [29, 16], [35, 31], 1.2, '#d8521a'], [[20, 4], [24, 12], [27, 28], 1.2, '#c4401a'],
  ]) T(g, a, b, c, r, 0.5, col);
  for (const [a, b, c] of [[[12, 3], [5, 10], [0, 20]], [[13, 7], [8, 17], [3, 30]], [[23, 3], [30, 10], [35, 21]], [[22, 7], [27, 17], [32, 30]]]) T(g, a, b, c, 0.8, 0.4, '#ffb030');
  for (const [a, b, c] of [[[11, 5], [4, 13], [0, 17]], [[24, 5], [31, 13], [35, 18]]]) T(g, a, b, c, 0.6, 0.3, '#ffe05a');
  // shoulders + neck
  P(g, [[7, 35], [10, 31], [26, 31], [29, 35]], '#7a3c24', true);
  P(g, [[14, 19], [22, 19], [23, 25], [24, 31], [12, 31], [13, 25]], '#8a4a2c', true); P(g, [[19, 19], [22, 19], [23, 25], [24, 31], [20, 31]], '#5e301e');
  // choker: black with red curved bands, gold diamond pendant
  P(g, [[12.5, 24], [23.5, 24], [24.5, 31], [11.5, 31]], '#1c0e12', true);
  T(g, [12, 26], [18, 28.4], [24, 26], 0.7, 0.7, '#a82020'); T(g, [12, 28.4], [18, 30.8], [24, 28.4], 0.7, 0.7, '#a82020'); L(g, [[12, 24], [24, 24]], '#3a2028');
  P(g, [[18, 30], [20.8, 33], [18, 35.4], [15.2, 33]], '#e8b84a'); P(g, [[18, 31], [19.6, 33], [18, 34.4], [16.4, 33]], '#fff0a0'); D(g, [[18, 33]], '#8a5a14');
  // ears + earrings
  E(g, 10.5, 21, 1.4, 2.2, '#c88858'); E(g, 25.5, 21, 1.4, 2.2, '#c88858'); D(g, [[10, 20], [26, 20]], '#f0b480');
  // face, chin up
  const face = Glyph.poly([[12.5, 6], [15, 4.5], [21, 4.5], [23.5, 6], [23.8, 11], [23, 16], [20.8, 19.4], [18, 20.5], [15.2, 19.4], [13, 16], [12.2, 11]]);
  g.bands(face, ['#d89058', '#b86c3c', '#8a4a2c', '#5e301e'], -0.55, -0.5, [0.5, -0.1, -0.65], false);
  g.fill(Glyph.rim(face, 0, 1), '#4a1c10'); g.fill(Glyph.rim(face, 1, 0), '#4a1c10'); g.fill(Glyph.rim(face, -1, 0), '#7a3c24');
  // hair framing the face: hairline + side locks over the cheeks
  P(g, [[11, 8], [12, 5], [15, 3], [18, 2.5], [21, 3], [24, 5], [25, 8], [23, 6], [18, 4.6], [13, 6]], '#c4401a'); L(g, [[14, 4], [18, 3.4], [22, 4]], '#ff9a2a');
  T(g, [11.5, 7], [10, 14], [11, 21], 1.2, 0.5, '#a82e14'); T(g, [24.5, 7], [26, 14], [25, 21], 1.2, 0.5, '#a82e14');
  // glowing eyes, brows, war paint, nose, lips, chin dot
  L(g, [[14, 12], [16, 12]], '#ffe45a'); L(g, [[20, 12], [22, 12]], '#ffe45a'); D(g, [[13, 12], [23, 12], [14, 11], [15, 11], [21, 11], [22, 11], [15, 13], [21, 13]], '#ff9a20'); D(g, [[15, 12], [21, 12]], '#ffffff');
  L(g, [[13, 10], [16.5, 9.4]], '#3a1810'); L(g, [[19.5, 9.4], [23, 10]], '#3a1810');
  L(g, [[12.5, 14], [14.5, 15]], '#f4f0e8'); L(g, [[13, 16], [15, 16.6]], '#f4f0e8'); L(g, [[23.5, 14], [21.5, 15]], '#f4f0e8'); L(g, [[23, 16], [21, 16.6]], '#f4f0e8');
  L(g, [[18, 13], [18, 15.5]], '#8a4a2c'); D(g, [[17, 16], [19, 16]], '#4a2418'); L(g, [[16, 17.8], [20, 17.8]], '#5a2418'); L(g, [[17, 18.6], [19, 18.6]], '#c0745a'); D(g, [[18, 20]], '#f4f0e8');
}];

// ---------------------------------------------------------------- Laguna Blade
// Original: a blue-white lightning bolt cutting diagonally from a white burst at the lower left to the top-right corner, deep
// blue behind it with soft white-blue orbs and sparkles scattered along the bolt.
HD_LINA.lina_laguna_blade = ['hd_laguna', g => {
  // deep blue field, lit along the diagonal axis y = 35 - x; the upper-left is darker, the lower-right fades to violet-navy
  F(g, (x, y) => { const s = (x + y - 35) * 0.707, d = Math.abs(s);
    return s < 0 ? band(d, [2, 5, 9, 14, 20], ['#7ab8ff', '#3a82e0', '#2262c8', '#143c9c', '#0c2674', '#081a54']) : band(d, [2, 5, 10, 16], ['#6aa8f4', '#2c6ad0', '#1c46a8', '#14288c', '#0e1c62']); });
  // feathered white burst at the lower left (blades of light fanning toward the upper right)
  for (const [a, b, c, r, col] of [[[0, 33], [8, 28], [17, 20], 3.2, '#8cc8ff'], [[0, 28], [7, 24], [15, 17], 2.6, '#bfe4ff'], [[2, 35], [10, 30], [19, 23], 3, '#bfe4ff'], [[0, 22], [5, 19], [11, 13], 1.8, '#8cc8ff'], [[6, 35], [14, 31], [22, 26], 2.2, '#8cc8ff']]) T(g, a, b, c, r, 0.4, col);
  P(g, [[0, 24], [6, 22], [11, 22], [15, 20], [18, 23], [14, 27], [10, 32], [6, 35], [0, 35]], '#e4f4ff');
  P(g, [[0, 28], [6, 26], [11, 26], [13, 28], [9, 32], [5, 35], [0, 35]], '#ffffff');
  for (const [a, b, c, r] of [[[1, 30], [9, 27], [15, 22], 1.2], [[0, 26], [7, 23], [13, 18], 1.0]]) T(g, a, b, c, r, 0.3, '#ffffff');
  // the bolt: blue halo, pale core edge, white core, with forks
  const bolt = [[12, 23], [16, 20], [15, 18], [20, 15], [19, 12], [24, 10], [24, 7], [28, 5], [29, 3], [35, 0]];
  L(g, bolt, '#4a98f0', 3); L(g, bolt, '#bfe4ff', 2); L(g, bolt, '#ffffff', 1); D(g, [[16, 20], [15, 18], [20, 15], [19, 12], [24, 10], [24, 7], [28, 5]], '#ffffff');
  L(g, [[20, 15], [24, 17], [24, 20]], '#bfe4ff'); L(g, [[24, 10], [29, 11], [30, 14]], '#8cc8ff'); L(g, [[15, 18], [12, 16], [11, 18]], '#bfe4ff'); L(g, [[28, 5], [31, 7]], '#8cc8ff');
  // orbs with rings, sparkles
  E(g, 7, 9, 1.6, 1, '#f0e4f4'); E(g, 11, 9, 1.1, 0.8, '#e8dcf0'); E(g, 12, 5.5, 1, 0.8, '#f0e4f4'); E(g, 5, 17, 1.6, 1.6, '#78f0e0'); D(g, [[4, 16]], '#e8fffa');
  E(g, 12.5, 14, 1.2, 1.2, '#bfe0ff'); D(g, [[12, 14]], '#5a8cff'); E(g, 26, 21, 1, 1, '#bfe0ff'); E(g, 23, 27, 1.2, 1.2, '#8cc8ff');
  star(g, 27, 15, '#ffffff'); star(g, 8, 4, '#d8f0ff');
  D(g, [[2, 6], [16, 8], [31, 12], [33, 22], [20, 30], [29, 27], [15, 2], [3, 13], [22, 4], [17, 25]], '#bfe4ff'); D(g, [[9, 12], [28, 18], [31, 3], [4, 25]], '#ffffff');
}];

