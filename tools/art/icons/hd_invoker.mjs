import { Glyph, THEMES, FULL, P, T, E, L, D, F, band, star } from './hd_kit.mjs';
Object.assign(THEMES, {
  hd_sun: { bg: ['#2a0e06', '#2a0e06', '#2a0e06'], bev: ['#ffd878', '#1c0a04'] },
  hd_meteor: { bg: ['#5a2410', '#341022', '#1c0a2c'], bev: ['#ffb060', '#10061a'] },
});
export const HD_INVOKER = {};

// ---------------------------------------------------------------- Sun Strike
// Original: a vertical pillar of golden light, a wide white-hot core that swells into a blazing base, nested U-shaped glow bands
// of yellow / amber / orange, dark brown edges, long soft streaks running down the pillar.
HD_INVOKER.invoker_sun_strike = ['hd_sun', g => {
  const cx = 17.5;
  const bands = [[18.5, 36, '#2a0e06'], [16.4, 34.5, '#4e1a08'], [15, 33.6, '#843008'], [13.6, 33, '#bc4e16'], [12.2, 33, '#e47a1a'], [10.8, 33.6, '#ff9e22'], [9.4, 34.2, '#ffc236'], [7.8, 35, '#ffdc5a'], [6, 35, '#fff0a0'], [4, 35, '#ffffff']];
  bands.forEach(([hw, yb, c], i) => {
    F(g, (x, y) => {
      const w = hw * (i >= 8 ? 0.4 + 0.9 * (y / 35) : 0.8 + 0.34 * Math.pow(y / 35, 1.5)), d = Math.abs(x - cx), r = w * 0.95;
      if (d > w) return null; if (y <= yb - r) return c;
      return (d / w) ** 2 + ((y - (yb - r)) / r) ** 2 <= 1 ? c : null;
    });
  });
  // blazing base: nested hard-edged ellipses
  E(g, 17.5, 32, 12.5, 6.8, '#ff9e22'); E(g, 17.5, 32.4, 10.2, 5.6, '#ffc236'); E(g, 17.5, 32.8, 8, 4.6, '#ffe06a'); E(g, 17.5, 33.2, 5.6, 3.4, '#fff4b4'); E(g, 17.5, 33.6, 3.4, 2.4, '#ffffff');
  // long streaks running down the pillar: bright ones in the dark bands, dark ones in the bright bands (tapering)
  for (const [x, y0, y1, r, c] of [[7, 3, 27, 0.6, '#bc4e16'], [28, 5, 28, 0.6, '#bc4e16'], [9.5, 0, 25, 0.7, '#e47a1a'], [25.5, 1, 26, 0.7, '#e47a1a'], [5, 10, 23, 0.5, '#843008'], [30, 8, 22, 0.5, '#843008'],
    [12, 0, 28, 0.7, '#ff9e22'], [23, 2, 27, 0.7, '#ff9e22'], [14, 0, 24, 0.6, '#ffe46a'], [21, 3, 25, 0.6, '#ffe46a'], [10.5, 8, 21, 0.4, '#ffc236'], [24.5, 9, 22, 0.4, '#ffc236'],
    [16, 0, 25, 0.5, '#ffffff'], [19.4, 2, 24, 0.5, '#ffffff'], [17.6, 0, 8, 0.4, '#ffe8a0'], [15, 6, 20, 0.4, '#ffd04a'], [20.6, 7, 21, 0.4, '#ffd04a']])
    T(g, [x, y0], [x + 0.6, (y0 + y1) / 2], [x, y1], r + 0.3, r, c);
  // embers
  D(g, [[3, 9], [32, 13], [4, 21], [31, 24], [1, 16], [34, 19], [6, 4], [29, 3]], '#ffc236');
  D(g, [[2, 12], [33, 8], [3, 26], [32, 28]], '#ff7a1a');
}];

// ---------------------------------------------------------------- Chaos Meteor
// Original: a dark purple boulder falling toward the lower right, a white-gold flame tail streaming up to the top-left corner,
// an orange rim around the rock, wisps of flame at the edges, a maroon-to-purple background.
HD_INVOKER.invoker_chaos_meteor = ['hd_meteor', g => {
  // background planes (diagonal, dark maroon -> purple)
  F(g, (x, y) => band(x + y, [26, 40, 52], ['#4a1a10', '#3a1220', '#2a0e2e', '#1e0a30']));
  // flame tail, outer -> inner (flat layers)
  P(g, [[0, 0], [26, 0], [27, 5], [20, 10], [12, 18], [4, 26], [0, 29]], '#9a4418');
  P(g, [[0, 0], [22, 0], [22, 5], [16, 10], [10, 16], [3, 23], [0, 25]], '#e8801c');
  P(g, [[0, 0], [17, 0], [17, 4], [12, 8], [7, 13], [0, 18]], '#ffc83c');
  P(g, [[0, 0], [11, 0], [10, 4], [6, 8], [0, 13]], '#fff2b0');
  P(g, [[0, 0], [5, 0], [4, 3], [0, 7]], '#ffffff');
  // tail streak lines (direction of travel is down-right)
  L(g, [[6, 0], [12, 4], [16, 8]], '#ffe27a'); L(g, [[0, 12], [6, 11], [12, 12]], '#ffe27a');
  L(g, [[12, 0], [19, 4], [23, 8]], '#ffa828'); L(g, [[0, 20], [6, 17], [11, 17]], '#ffa828');
  L(g, [[17, 0], [24, 3]], '#c8601a'); L(g, [[2, 26], [8, 22], [12, 21]], '#c8601a');
  // wisps wrapping the rock
  T(g, [22, 4], [30, 3], [34, 12], 1.2, 0.5, '#e8801c'); T(g, [26, 8], [31, 9], [33, 16], 1, 0.4, '#ffb030');
  T(g, [0, 29], [9, 27], [15, 31], 1.4, 0.5, '#d8601a'); T(g, [2, 33], [10, 30], [18, 34], 1.2, 0.4, '#8a3012');
  // the rock (silhouette gets the outline)
  const rock = Glyph.poly([[11, 9], [13, 6.5], [16, 6], [17.5, 7.6], [20, 6.6], [23, 8.8], [26, 9.4], [28.6, 11], [31, 12.4], [33.4, 15.6], [34.4, 19], [33, 22.4], [31.6, 26], [28.6, 28.4], [25.6, 31.4], [21.6, 31], [19, 32.6], [15.6, 30.4], [12.4, 27.6], [9.6, 24.4], [8, 20], [8.6, 15.6], [9.6, 12]]);
  g.fill(Glyph.sub(Glyph.grow(rock, 3), Glyph.grow(rock, 1)), '#a8501a'); g.fill(Glyph.sub(Glyph.grow(rock, 2), Glyph.grow(rock, 1)), '#ffb848');   // heat glow hugging the rock
  g.bands(rock, ['#7a6a60', '#54446a', '#382a50', '#201432'], -0.75, -0.65, [0.78, 0.1, -0.45]);
  // hot rim: yellow on the lit upper-left, orange on the far side
  g.fill(Glyph.rim(rock, -1, 0), '#9a8058', true); g.fill(Glyph.rim(rock, 0, -1), '#b89860', true);   // firelit upper-left lip
  g.fill(Glyph.rim(rock, 1, 0), '#4a3a6a', true); g.fill(Glyph.rim(rock, 0, 1), '#4a3a6a', true);
  // crater pits: dark hollow with a lit lower lip
  for (const [x, y, rx, ry] of [[15, 13, 2.4, 1.8], [22, 12, 2.2, 1.6], [28, 15, 2, 2.4], [12, 19, 2, 2.2], [19, 18, 2.8, 2.2], [26, 21, 2.4, 2], [16, 25, 2.4, 1.8], [22, 27, 2.2, 1.6], [31, 20, 1.2, 1.6]]) {
    E(g, x, y, rx, ry, '#1e1230', true); E(g, x - 0.6, y - 0.5, rx - 0.9, ry - 0.8, '#2e2046', true);
    D(g, [[Math.round(x + rx * 0.7), Math.round(y + ry * 0.8)], [Math.round(x), Math.round(y + ry + 0.6)]], '#76628a');
  }
  // sparks
  D(g, [[30, 4], [33, 8], [5, 31], [13, 34], [3, 22], [24, 2], [34, 26]], '#ffc83c');
}];
