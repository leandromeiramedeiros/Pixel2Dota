import { Glyph, THEMES, FULL, P, T, E, L, D, F, band, star } from './hd_kit.mjs';
Object.assign(THEMES, {
  hd_bkb: { bg: ['#222a3c', '#161c32', '#0c1026'], bev: ['#c8b890', '#0a0c18'] },
  hd_blink: { bg: ['#0e4c54', '#0a3a46', '#08283a'], bev: ['#8cf0ee', '#041a26'] },
  hd_phase: { bg: ['#10163a', '#0a0e2a', '#060818'], bev: ['#a090ff', '#04040e'] },
  hd_wand: { bg: ['#10382c', '#0c2a22', '#081a16'], bev: ['#a0f0c8', '#04120c'] },
});
export const HD_ITEMS = {};
const GOLD = ['#fff2a0', '#f4c430', '#b87a14', '#6a3a0a'], IRON = ['#b4b6c6', '#707284', '#3c3e50', '#1e202c'];

// ---------------------------------------------------------------- Black King Bar
// Original: a golden horned helm seen at three-quarters, a big red gem for an eye, crest spikes up the back, iron horns ending in
// copper balls, a long dark iron faceplate with gold filigree sweeping to the lower right, on dark slate-blue.
HD_ITEMS.item_black_king_bar = ['hd_bkb', g => {
  F(g, (x, y) => band(x - y * 0.6, [-10, 2, 14], ['#0a0e22', '#121830', '#1a2238', '#232c44']));
  // iron horns behind the helm, copper balls on the ends
  E(g, 21, 11, 3.2, 3, '#5a1a1c', true);
  g.bands(Glyph.taper([9, 14], [0.5, 18], [4.5, 26], 3.4, 2.0), IRON, -0.9, -0.2);
  g.bands(Glyph.taper([21, 10], [30, 6.5], [31, 14], 3.0, 2.0), IRON, -0.5, -0.8);
  E(g, 7.4, 26.4, 2.3, 2.3, '#b8661a', true); D(g, [[6, 25], [6, 26], [7, 25]], '#ffc060'); D(g, [[8, 28], [9, 27]], '#6a3208');
  E(g, 30.4, 14.8, 2.3, 2.3, '#b8661a', true); D(g, [[29, 13], [29, 14], [30, 13]], '#ffc060'); D(g, [[31, 16], [32, 15]], '#6a3208');
  // faceplate: dark iron beak with a gold ridge and lattice, running to the lower right
  const beak = Glyph.poly([[13, 19], [17, 18.5], [23, 22], [32, 29], [36, 31], [36, 33.5], [31, 33], [22, 29.5], [14, 24.5]]);
  g.bands(beak, ['#565870', '#383a50', '#24263a', '#12141c'], -0.2, -0.95, [0.7, 0.1, -0.4]);
  L(g, [[16, 19.8], [20, 21.2], [25, 24.6], [32, 30.2], [36, 31.8]], '#e8b020', 1, true); L(g, [[16, 19.2], [20, 20.6], [25, 24]], '#fff2a0');
  for (const [a, b, c, d] of [[18, 25, 22, 28.2], [21, 23.4, 26, 29], [25, 26, 30, 31.6], [19, 22.4, 20.5, 26.5]]) L(g, [[a, b], [c, d]], '#c8901e');
  // helm dome + crest spikes
  P(g, [[10, 9], [10.5, 3], [15, 7.5]], '#f4c430', true); P(g, [[14, 7.5], [17, 1.5], [20.5, 8]], '#ffe27a', true); P(g, [[18.5, 8], [24, 5.5], [22.5, 12.5]], '#f4c430', true);
  const dome = Glyph.poly([[2, 17], [3.5, 11.5], [8, 7.5], [14, 5.8], [20, 6.6], [24, 10], [24.5, 16], [21, 21], [14, 23], [7, 22.5]]);
  g.bands(dome, ['#fff2a0', '#f4c430', '#b87a14', '#6a3a0a'], -0.65, -0.8, [0.45, -0.05, -0.5]);
  // gold filigree swirls along the brow and cheek
  T(g, [4, 13], [8, 8.4], [15, 7.2], 0.7, 0.7, '#fff6c0'); T(g, [17, 8], [22, 10], [23.5, 15], 0.7, 0.7, '#a86a10'); T(g, [5, 20], [11, 23], [19, 21.4], 0.7, 0.7, '#8a4e0a'); L(g, [[17, 12], [20, 14]], '#fff2a0');
  // gem eye in a gold socket
  E(g, 12.4, 17.4, 5, 4.8, '#6a3a0a', true); E(g, 12.4, 17.4, 4.3, 4.1, '#d89a1c', true); E(g, 12.4, 17.4, 3.4, 3.2, '#5a0c10', true); E(g, 12.4, 17.4, 2.7, 2.5, '#d02020', true);
  E(g, 11.8, 16.8, 1.5, 1.2, '#ff6a50'); D(g, [[11, 16], [12, 16]], '#ffffff'); D(g, [[14, 19]], '#8a1010');
}];

// ---------------------------------------------------------------- Blink Dagger
// Original: a big pale-teal sickle blade with a bright cyan stripe along its edge, a blue wrapped handle at the top right,
// on dark teal with cyan streak shards flying past.
HD_ITEMS.item_blink = ['hd_blink', g => {
  // dark teal field with a few lighter planes, then cyan shards flying past
  F(g, (x, y) => band(x * 0.8 - y * 0.6, [-12, -2, 9], ['#08283a', '#0a3644', '#0e4652', '#12545e']));
  for (const [x, y, l] of [[3, 2, 4], [10, 5, 4], [19, 2, 3], [26, 5, 4], [31, 11, 3], [3, 12, 4], [24, 30, 4], [31, 27, 3], [8, 31, 4], [18, 33, 3], [14, 0, 3], [1, 21, 3], [33, 3, 3], [6, 8, 2], [28, 24, 3]]) L(g, [[x, y], [x + 1, y + l * 0.5], [x + 2, y + l]], '#2cb0cc');
  for (const [x, y] of [[12, 11], [5, 6], [23, 1], [32, 18], [21, 31], [2, 18], [30, 8]]) L(g, [[x, y], [x + 1, y + 2]], '#88f0f4');
  for (const [x, y, l] of [[29, 14, 4], [31, 21, 4], [27, 3, 3], [32, 31, 3]]) L(g, [[x, y], [x + l, y]], '#58d8e8');
  // curved handle, blue wrap, a gold stud at the end
  const handle = Glyph.taper([17, 16], [18, 6], [30, 4.8], 2.8, 2.4);
  g.bands(handle, ['#8cb4ff', '#4a7cd8', '#2c50a8', '#182a70'], -0.5, -0.9, [0.55, 0.0, -0.5]);
  for (const [x, y] of [[18, 12], [19, 9], [22, 7], [25, 6]]) D(g, [[x, y]], '#182a70');
  E(g, 29.8, 4.6, 1.6, 1.4, '#c8a040', true); D(g, [[29, 4], [30, 4]], '#fff0a0');
  // blade: crescent, cutting edge on the lower right, hook at the top
  const blade = Glyph.poly([[2.5, 25.4], [7, 24.2], [12, 22.8], [15, 20.6], [16.2, 17.6], [16.6, 15.6], [19, 16.2], [23, 17], [27, 19.8], [28.8, 23.5], [26.5, 27], [21, 29.2], [14, 29.6], [8, 28.6], [3.5, 27.2]]);
  g.bands(blade, ['#f6fffa', '#c4ece6', '#84bcc8', '#3c7894'], -0.55, -0.8, [0.62, 0.15, -0.35]);
  g.fill(Glyph.rim(blade, 0, 1), '#4c8aa4'); g.fill(Glyph.rim(blade, 1, 0), '#4c8aa4');
  // bright cyan band along the inner curve with a dark blue core line
  T(g, [5, 26.4], [15, 25.2], [20.4, 17.8], 1.6, 1.3, '#46c8f0'); T(g, [6.4, 26.8], [16, 25.8], [21, 19.6], 0.7, 0.6, '#1c78b8');
  D(g, [[18, 16.6], [17, 17.4]], '#46c8f0');
  // gleam along the top edge, chips on the cutting edge
  L(g, [[4, 25.6], [8, 24.6], [12, 23.2], [14.6, 21], [15.6, 18.6]], '#ffffff'); D(g, [[21, 27.4], [24, 25.6], [27, 22.6], [11, 28]], '#e8fff8'); D(g, [[17, 28.4], [9, 27.4]], '#3c7894');
}];

// ---------------------------------------------------------------- Phase Boots
// Original: a violet boot with a pale grey buckle strap, pointed toe curling up at the lower right, an open flared shaft at the top,
// and a trail of translucent blue boot-ghosts streaking off to the left, on near-black navy.
HD_ITEMS.item_phase_boots = ['hd_phase', g => {
  F(g, (x, y) => band(x + y * 0.4, [14, 28], ['#0e1440', '#0a0e2c', '#070a1c']));
  // ghost trail: tall overlapping scales streaking left, teal at the top-left fading to indigo-violet, each capped by a pale bubble
  const ghosts = [[3, 17, 2.8, 11, 12], [6.4, 16.4, 3.2, 11.6, 8], [9.8, 15.8, 3.5, 12, 5]];
  ghosts.forEach(([cx, cy, rx, ry, capY], i) => {
    const m = Glyph.ell(cx, cy, rx, ry);
    F(g, (x, y) => y < 9 ? ['#1c4c88', '#2450b0', '#2c3ccc'][i] : y < 19 ? ['#1a2e90', '#2434b4', '#2e32d0'][i] : ['#241c78', '#30249c', '#3a2cb8'][i], m);
    g.fill(Glyph.rim(m, -1, 0), ['#2468a0', '#3048c8', '#4038d8'][i]); g.fill(Glyph.rim(m, 0, -1), ['#4a98c0', '#5a70e0', '#7868ec'][i]);
  });
  E(g, 3, 6.4, 1.6, 1.2, '#4a98d0'); E(g, 6.4, 4.8, 1.8, 1.3, '#7a90f0'); E(g, 9.8, 3.6, 1.8, 1.2, '#a098f8');
  // boot silhouette (outlined)
  const boot = Glyph.poly([[17.1, 3.8], [21.6, 5.3], [28.8, 7.6], [28.3, 9.4], [26.2, 14.6], [24.4, 19.2], [25.1, 21.9], [28.9, 23.5], [33, 25.4], [36, 26], [34.2, 28.3], [28, 30.1], [19.8, 31.5], [14.4, 29.5], [13, 26], [13.4, 22.2], [13.7, 18.5], [15.3, 13.5], [15.5, 7.8]]);
  g.fill(boot, '#6a30c8', true);
  // outer wall of the shaft: dark mauve leather with a lit rim
  P(g, [[21.6, 6.2], [28.8, 7.6], [28.3, 9.4], [26.2, 14.6], [24.4, 19.2], [22.6, 17.5], [21.4, 11.2]], '#6a5890');
  P(g, [[24.4, 11.7], [26.4, 14], [24.4, 19.2], [23, 17.8]], '#3e3060'); L(g, [[22.1, 5.5], [28.7, 7.6]], '#b8a8d0'); L(g, [[28, 8.9], [26.4, 14]], '#8a78a8');
  // bright violet front face of the shaft
  const face = Glyph.poly([[17.1, 4.6], [21.6, 6.4], [21.2, 11.2], [22.1, 16.5], [24.2, 18.7], [13.9, 18.7], [15.5, 12.4], [15.7, 7.8]]);
  g.bands(face, ['#d09cff', '#a85cf8', '#7a36d8', '#4a1ea0'], -0.7, -0.4, [0.7, 0.05, -0.55], false);
  L(g, [[17.5, 5.5], [21, 6.9]], '#e8c8ff'); T(g, [16.6, 8.5], [16.6, 13.5], [17.8, 17.4], 0.6, 0.6, '#d8a8ff'); T(g, [19.6, 8.9], [20.1, 13.5], [21, 17.4], 0.5, 0.5, '#5a28b8');
  // foot: bright violet sole sweeping out to a curled horn of a toe
  const foot = Glyph.poly([[13.7, 22.8], [24.8, 22.6], [28.9, 23.5], [33, 25.4], [36, 26], [34.2, 28.3], [28, 30.1], [19.8, 31.5], [14.4, 29.5], [13, 26]]);
  g.bands(foot, ['#c488ff', '#9650f4', '#6a2ed0', '#3e1a94'], -0.4, -0.9, [0.8, 0.15, -0.4], false);
  T(g, [16, 25.1], [23.9, 24.9], [34.2, 26], 0.6, 0.5, '#d8a8ff'); T(g, [16, 29], [22.8, 30.4], [30.8, 29.2], 0.5, 0.5, '#3a1a88'); D(g, [[35.3, 25.4], [34.2, 25.4]], '#f0d8ff');
  // buckle strap + pale plate
  P(g, [[13.4, 18.5], [24.6, 18.5], [24.8, 22.4], [13.9, 22.6]], '#4a4048', true); L(g, [[13.7, 19], [24.4, 19]], '#8a7e88');
  P(g, [[16, 18.7], [21.6, 18.7], [21.6, 22.2], [16, 22.4]], '#b8aab8', true); P(g, [[17.1, 19.9], [20.5, 19.9], [20.5, 21.2], [17.1, 21.2]], '#38303a'); L(g, [[16.2, 19], [21.4, 19]], '#f0e8f0');
  D(g, [[22.8, 19.9], [23.5, 21.2], [14.6, 20.6]], '#2a2230');
  // sparkles in the trail
  D(g, [[6, 8], [11, 11], [2, 22], [10, 27], [8, 18]], '#9ad0ff'); D(g, [[5, 13], [9, 23]], '#ffffff');
}];

// ---------------------------------------------------------------- Magic Wand
// Original: a slim wand running from the lower right to the upper left, a teal gem pommel and a dark wrapped grip with copper
// rings, a thin wooden shaft, and a cone of green-white light bursting off its tip, on deep green-black.
HD_ITEMS.item_magic_wand = ['hd_wand', g => {
  // green-black field, brightest around the glow in the top-left, black toward the top-right
  F(g, (x, y) => (x - y > 22) ? '#040c0a' : band(Math.hypot(x - 4, (y - 7) * 1.1), [7, 12, 19, 28], ['#3c8c6c', '#256a52', '#164a3a', '#0d2e26', '#071a16']));
  // cone of green-white light bursting from the tip, nested flat layers
  P(g, [[11.5, 13.4], [9, 6], [5.8, 2.4], [1, 2.6], [0, 4.6], [0, 10.6], [3, 12.6], [7.6, 13.8]], '#58b890');
  P(g, [[11.5, 13.4], [8.6, 7.4], [5.6, 4], [1.6, 4.4], [0.6, 6.4], [0.8, 10], [3.6, 12], [7.6, 13.4]], '#8cdcb8');
  P(g, [[11.2, 13.4], [8, 8.6], [5.4, 6], [2.6, 6.4], [2, 8.4], [3.6, 10.8], [7.6, 12.8]], '#c4f4dc');
  P(g, [[10.6, 13.2], [7.4, 10], [5, 8], [3.6, 8.6], [4.4, 10.4], [7.8, 12.4]], '#f0fff8');
  // light shafts from the tip
  L(g, [[10.6, 13], [6, 5.6]], '#e4fff2'); L(g, [[10.8, 13.2], [3, 8]], '#e4fff2'); L(g, [[11, 13.4], [4.6, 12.4]], '#a8ecd0');
  // copper shaft flaring to a collar, bronze knob, dark wrapped grip, pale ring and gem pommel
  g.bands(Glyph.taper([11.8, 13.4], [16, 15.8], [20.6, 18.4], 0.8, 2.1), ['#f4c088', '#c87a3a', '#8a4a1c', '#4a260c'], -0.3, -0.95, [0.5, 0.0, -0.5]);
  P(g, [[19.2, 16.6], [22.6, 17.4], [22.8, 20.6], [19.8, 20.2]], '#c8a070', true); L(g, [[19.6, 17], [22.4, 17.8]], '#f4e4c0'); L(g, [[20, 20], [22.6, 20.6]], '#7a4a1c');
  E(g, 23.8, 21.2, 2.2, 2.2, '#8a4a1c', true); E(g, 23.4, 20.8, 1.6, 1.6, '#c87a3a'); D(g, [[22, 20], [22, 19.6], [23, 19.8]], '#ffc888');
  g.bands(Glyph.taper([25.4, 22.2], [28, 24], [30.4, 25.6], 2.3, 2.3), ['#6a6870', '#44444c', '#2a2a32', '#14141a'], -0.3, -0.95, [0.5, 0.0, -0.5]);
  for (const [x, y] of [[26, 22], [27, 24], [28, 23], [29, 25], [30, 24.4]]) D(g, [[x, y]], '#d87a28');
  E(g, 32.4, 27, 3.2, 3.2, '#a08a62', true); E(g, 32.4, 27, 2.5, 2.5, '#6a4a22', true); E(g, 32.4, 27, 1.9, 1.9, '#58d8b4', true); E(g, 32, 26.4, 1.1, 0.9, '#e8fff8'); D(g, [[33, 28], [32, 28]], '#2a9a88'); L(g, [[30.6, 25.2], [31.6, 24.6]], '#e4d4a8');
  // motes drifting in the glow
  D(g, [[9, 3], [13, 5], [3, 13], [14, 11], [2, 2], [6, 1]], '#d8ffe8'); D(g, [[12, 8], [5, 14]], '#8cdcb8');
}];

