// Glyph drawings for hero abilities + Invoker invoked spells. Each entry: key -> [theme, draw(g)]
import { Glyph as G, R, pix } from './kit.mjs';

const pol = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
const W = '#ffffff';

export const ABILITIES = {
  // ---------------------------------------------------------------- Sven
  sven_storm_bolt: ['deep', g => {
    // golden gauntlet fist hurtling down-right, glowing streaks behind it
    pix(g, [
      '................',
      'tt..............',
      '.tt.............',
      '..tut...........',
      '...tutYYYYG.....',
      '..v.tYYYYYGGO...',
      '....uYYWYYGGGO..',
      '...v.YYYYGGGGOD.',
      '.....GYYGGGGGGOD',
      '......GGGGOGGGOD',
      '......GGOGGOGGD.',
      '.......GOGGOGDD.',
      '.......GGOGGODD.',
      '........GGGDDD..',
      '.........DDD....',
      '................'], { Y: '#fff4a8', G: '#f6c842', O: '#c48a1c', D: '#7a4a0e', W: '#ffffff', t: ['#fffbd0'], u: ['#e8c850'], v: ['#8c7a38'] });
    g.dots([[6, 1], [1, 6], [9, 14]], '#bfe4ff');
  }],
  sven_great_cleave: ['deep', g => {
    // a giant cream blade sweeping in, Sven bracing behind it
    const BL = ['#ffffff', '#fff0c0', '#e0c080', '#8a6a38'];
    g.paint(G.sub(G.ell(8, 16, 14, 14), G.ell(11, 20, 13, 13)), BL, 'g');
    g.paint(G.line(0, 8, 9, 3, 1), BL, 'f', { lv: 0, soft: true });
    pix(g, [
      '................',
      '.........hh.....',
      '........hSSh....',
      '........SddS....',
      '.......bBBBBb...',
      '......bBBBBBBb..',
      '.......bBBBBBb..',
      '........bbBBb...'], { h: '#e6eef8', S: '#b4c0d4', d: '#1c2438', B: '#3c62c0', b: '#1c2c78' });
    g.soft(G.pts([[11, 8], [12, 8], [13, 8]]), '#8a6a38');
    g.dots([[3, 3], [1, 5], [14, 12], [12, 14]], '#cfe4ff');
  }],
  sven_warcry: ['steel', g => {
    g.halo(7.5, 6, 9, '#c8dcff');
    // Sven roaring: great helm with visor slit, blue breastplate, shoulder guards
    pix(g, [
      '................',
      '.......hh.......',
      '.....hhWWhh.....',
      '....hWWWWWWh....',
      '....hWkddkWh....',
      '....hWkddkWh....',
      '....hhWWWWhh....',
      '..hhhBbhhbBhhh..',
      '.hWWhBBBBBBhWWh.',
      '.hWhBBBbbBBBhWh.',
      '..hhBBBbbBBBhh..',
      '...BBBBbbBBBB...',
      '..bBBBBbbBBBBb..',
      '..bbBBBbbBBBbb..',
      '................'], { h: '#8696b4', W: '#e8eef6', k: '#b4c0d4', d: '#1c2438', B: '#3c62c0', b: '#1c2c78' });
    g.dots([[1, 3], [14, 3], [0, 6], [15, 6]], '#ffffff');
  }],
  sven_gods_strength: ['sun', g => {
    g.halo(7.5, 6, 11, '#ffffff');
    // great helm crackling with white lightning, red cloak below
    pix(g, [
      'ww............ww',
      '.ww..hhhhhh..ww.',
      '..w..hSSSShh.w..',
      '.ww.hSSSSSSh.ww.',
      'ww..hSSSSSSh..ww',
      '.w..hSddddSh..w.',
      '.ww.hSwwwwSh.ww.',
      '..w..hSddSh..w..',
      '..rrrrhSShrrrr..',
      '.rrRrrrSSrrrRrr.',
      '.rrRRrrrrrrRRrr.',
      '.rrRrrrrrrrrRrr.',
      '..rrrrrrrrrrrr..',
      '................'], { S: '#6a7490', h: '#2c3248', d: '#12121c', r: '#c82828', R: '#7a1018', w: ['#ffffff'] });
    g.dots([[6, 6], [7, 6], [8, 6], [9, 6]], '#ffffff');
  }],
  // ---------------------------------------------------------------- Lina
  lina_dragon_slave: ['ember', g => {
    // a fire dragon's head racing right, tail of flame behind, jaws open on a white-hot core
    const F = ['#ffe9a0', '#ff8a2a', '#e03a14', '#8a1408'];
    g.poly([[0, 7], [5, 4], [9, 3], [11, 0.5], [15, 2], [11, 6], [8, 7.5]], F, 'g');
    g.poly([[0, 9], [5, 12], [9, 12], [12, 15], [15, 13], [11, 9.5], [8, 8.5]], F, 'g');
    g.poly([[3, 5], [10, 4.5], [10, 11], [3, 11]], F, 'g');
    g.ell(8, 8, 3.4, 2.6, ['#ffffff', '#ffe9a0', '#ffc040', '#ff8a2a'], 'g');
    g.soft(G.pts([[12, 7], [13, 7], [13, 8], [14, 8], [12, 8], [14, 7]]), '#701810');
    g.soft(G.pts([[1, 5], [0, 4], [2, 3], [1, 11], [0, 12], [2, 13]]), '#ffc040');
  }],
  lina_light_strike_array: ['fire', g => {
    // a column of light slams down into a burning ring
    const S = { o: ['#ff9a30'], y: ['#ffd060'], Y: ['#fff0b0'], W: ['#ffffff'], r: ['#e03a14'] };
    pix(g, [
      '.......oo.......',
      '......oYYo......',
      '......oWWo......',
      '......yWWy......',
      '......yWWy......',
      '.....oyWWyo.....',
      '.....oyWWyo.....',
      '.....oyWWyo.....',
      '....ooyWWyoo....',
      '..o.oyyWWyyo.o..',
      '.ooyyyyWWyyyyoo.',
      'ooyyYYYWWYYYyyoo',
      '.oyYYWWWWWWYYyo.',
      '..oooyYYYYyyooo.',
      '...r.oooooo.r...',
      '................'], S);
  }],
  lina_fiery_soul: ['fire', g => {
    g.halo(7.5, 7, 9, '#ff8a30');
    // Lina's face framed by blazing hair
    pix(g, [
      '......rrrr......',
      '....rroooorr....',
      '...roooyyooor...',
      '..rooyyyyyyoor..',
      '.rooyssssssyoor.',
      '.roysssssssyoor.',
      '.royskksskksyor.',
      '.royssssssssyor.',
      '.rooyssnnsssyor.',
      '..rooysrrsyoor..',
      '..rroooyssoorr..',
      '...rrooyyoorr...',
      '....rrGGGGrr....',
      '.....rGGGGr.....',
      '................'], { r: '#b02410', o: '#ff7a1a', y: '#ffc040', s: '#f0b488', k: '#5a1408', n: '#c88060', G: '#f6c842' });
  }],
  lina_laguna_blade: ['storm', g => {
    // a white-hot bolt tears across, wreathed in blue sparks
    g.paint(G.line(0, 15, 15, 0, 5), R.cyan, 'f', { lv: 2, soft: true });
    g.paint(G.line(0, 15, 15, 0, 3), R.cyan, 'f', { lv: 1, soft: true });
    g.paint(G.line(0, 15, 15, 0, 1), R.cyan, 'f', { lv: 0, soft: true });
    g.zig([[2, 14], [5, 10], [4, 9], [8, 6], [7, 5], [13, 1]], R.cyan, W, 2);
    g.spark(11, 11, '#ffffff'); g.spark(3, 3, '#ffffff'); g.spark(13, 6, '#d8f0ff', true); g.dots([[1, 7], [8, 13], [14, 14], [6, 1]], '#ffffff');
  }],
  // ---------------------------------------------------------------- Lion
  lion_impale: ['ember', g => {
    g.halo(8, 13, 10, '#ffb050');
    // thorny spikes bursting up out of the ground
    const TH = ['#e8c090', '#a8683a', '#6a3c1c', '#2a1408'];
    g.poly([[0, 15], [1, 7], [5, 15]], TH, 'x');
    g.poly([[4, 15], [8, 0], [12, 15]], TH, 'x');
    g.poly([[9, 15], [14, 5], [15, 15]], TH, 'x');
    g.poly([[2, 15], [4, 10], [7, 15]], TH, 'x');
    g.soft(G.pts([[8, 3], [8, 4], [7, 6], [7, 8], [8, 10], [7, 12], [13, 8], [1, 10], [4, 12]]), '#fff0c8');
    g.soft(G.pts([[9, 6], [9, 9], [10, 11], [10, 14], [6, 14]]), '#2a1408');
  }],
  lion_voodoo: ['ember', g => {
    g.halo(7.5, 8, 9, '#ffb050');
    // a splayed grey frog: bent legs flung wide, bulging eyes, pale belly
    const FR = ['#d8ccb4', '#a09680', '#6a604e', '#2e2a22'];
    const L = (pts, w = 1) => { for (let i = 0; i + 1 < pts.length; i++) g.paint(G.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w), FR, 'f', { lv: 1 }); };
    L([[6, 7], [3, 6], [2, 3]]); L([[9, 7], [12, 6], [13, 3]]); L([[6, 11], [2, 11], [1, 14]]); L([[9, 11], [13, 11], [14, 14]]);
    g.ell(7.5, 8.5, 3.2, 4.4, FR, 'g'); g.ell(7.5, 5, 2.8, 2, FR, 'g'); g.ell(5.6, 3.4, 1.4, 1.4, FR, 'g'); g.ell(9.4, 3.4, 1.4, 1.4, FR, 'g');
    g.dots([[5, 3], [10, 3]], '#12121c'); g.dots([[6, 3], [9, 3]], '#ffffff');
    g.soft(G.pts([[7, 9], [8, 9], [7, 10], [8, 10], [7, 11], [8, 11]]), '#e8e0cc');
    g.dots([[1, 2], [3, 2], [12, 2], [14, 2], [0, 14], [2, 15], [13, 15], [15, 14]], '#a09680');
  }],
  lion_mana_drain: ['ember', g => {
    g.halo(10, 8, 9, '#ff8a4a');
    // hooded Lion screaming, a river of blue mana streaming from his mouth
    pix(g, [
      '................',
      '.........hhhh...',
      '........hhhhhh..',
      '.......hhhskkhh.',
      '.......hhsswwsh.',
      '.......hhssssssh',
      '......cchsrrrrsh',
      '...ccccchsrwwrsh',
      '.cccwwcchsrrrrsh',
      '.ccwwwcchhsssshh',
      '..cccccc.hhsshh.',
      '...cwcc...hhhh..',
      '..c..c..........',
      '................'], { h: '#2c2038', s: '#c8683c', k: '#5a1408', w: '#fff0e0', r: '#3a0c10', c: '#5cd0ff' });
    g.soft(G.pts([[1, 7], [2, 9], [0, 8], [3, 6], [4, 5]]), '#d8f8ff'); g.dots([[1, 5], [3, 12]], '#d8f8ff');
  }],
  lion_finger_of_death: ['fire', g => {
    g.halo(11, 4, 9, '#ff9a30');
    // a fist with the forefinger thrust up, fire licking off the tip
    pix(g, [
      '..........r.....',
      '.........roor.r.',
      '........royyor..',
      '........royYyor.',
      '.........royyor.',
      '..........rooor.',
      '..........ss....',
      '.........sssk...',
      '........ssssk...',
      '..sssss.sssk....',
      '.sSsssssssk.....',
      '.ssSsssssk......',
      '.sSsssssskk.....',
      '..ssSssskk......',
      '...kkkkkk.......'], { r: '#e03a14', o: '#ff8a2a', y: '#ffc040', Y: '#fff0b0', s: '#e0a070', S: '#fff0d0', k: '#7c4428' });
    g.soft(G.pts([[3, 12], [5, 12], [7, 12]]), '#7c4428');
  }],
  // ---------------------------------------------------------------- Crystal Maiden
  crystal_maiden_crystal_nova: ['deep', g => {
    g.halo(7.5, 7.5, 10, '#5cb4ff');
    // a shattering blast of frost: crystal shards radiating from a white-hot centre
    for (let i = 0; i < 9; i++) { const a = i * 2 * Math.PI / 9 + 0.3, L = i % 2 ? 6.4 : 7.8; g.poly([[7.5 + 1.8 * Math.cos(a + 1.4), 7.5 + 1.8 * Math.sin(a + 1.4)], [7.5 + L * Math.cos(a), 7.5 + L * Math.sin(a)], [7.5 + 1.8 * Math.cos(a - 1.4), 7.5 + 1.8 * Math.sin(a - 1.4)]], i % 2 ? R.cyan : R.ice, 'x'); }
    g.ell(7.5, 7.5, 3, 3, R.white, 'g'); g.soft(G.ell(7.5, 7.5, 1.6, 1.6), '#ffffff'); g.dots([[2, 2], [13, 13], [13, 2], [2, 13]], '#cdf2ff');
  }],
  crystal_maiden_frostbite: ['deep', g => {
    g.halo(8, 6, 9, '#8cc4ff');
    // a figure frozen mid-struggle, arms thrown up, rooted in a jagged mound of ice
    pix(g, [
      '................',
      '.h............h.',
      '.hh...hhh....hh.',
      '..hh..hWWh..hh..',
      '...hh.hWWh.hh...',
      '....hhhwwhhh....',
      '.....hwwwwh.....',
      '......wwww......',
      '......wwwb......',
      '..cc..wwwb..cc..',
      '.cwwc.wwbb.cwwc.',
      'cwwWwwcwbcwwWwwc',
      'cwwWWWwwwwWWWwwc',
      'ccwwwwwwwwwwwwcc',
      'cbbccbbbbbbccbcc'], { h: '#a8c8ff', W: '#ffffff', w: '#dceaff', b: '#6c8cd8', c: '#7cc8f0' });
  }],
  crystal_maiden_brilliance_aura: ['teal', g => {
    g.halo(7.5, 7.5, 9, '#5ce0ff');
    // a glowing ice crystal in a curl of cold mist
    g.paint(G.arc(7.5, 7, 5.6, 7, 0.25, Math.PI - 0.25), R.cyan, 'f', { lv: 1 });
    g.poly([[7.5, 0.5], [10.5, 4], [10, 9], [7.5, 11], [5, 9], [4.5, 4]], R.ice, 'x');
    g.poly([[7.5, 2], [9, 4.5], [8.5, 8], [7.5, 9], [6.5, 8], [6, 4.5]], R.cyan, 'f', { lv: 1 });
    g.poly([[7.5, 1.5], [8.4, 4], [7.5, 8], [6.8, 4]], R.ice, 'f', { lv: 0 });
    g.poly([[2.5, 4], [4, 6.5], [3.5, 9], [1.5, 7]], R.blue, 'x'); g.poly([[12.5, 4], [11, 6.5], [11.5, 9], [13.5, 7]], R.blue, 'x');
    g.soft(G.pts([[7, 12], [8, 12], [7, 14], [5, 13], [10, 13]]), '#c8f4ff');
    g.spark(2, 1, '#bff4ff'); g.spark(14, 2, '#bff4ff');
  }],
  crystal_maiden_freezing_field: ['ice', g => {
    // ice comets raining down the frame
    const comet = (hx, hy, len) => {
      g.paint(G.line(hx - len * 0.5, hy - len * 0.5, hx, hy, 2), R.ice, 'f', { lv: 1, soft: true });
      g.paint(G.line(hx - len, hy - len, hx - len * 0.4, hy - len * 0.4, 1), R.cyan, 'f', { lv: 1, soft: true });
      g.dot(hx - len - 1, hy - len - 1, '#7cc8f0');
      g.spark(hx, hy, '#ffffff');
    };
    comet(14, 14, 8); comet(6, 13, 6); comet(14, 8, 6); comet(8, 7, 5); comet(3, 6, 3);
    g.dots([[1, 11], [10, 1], [1, 1], [5, 13], [11, 9], [8, 3]], '#ffffff');
  }],
  // ---------------------------------------------------------------- Axe
  axe_berserkers_call: ['ruby', g => {
    g.halo(7.5, 7.5, 9, '#ff5a30');
    // Axe roaring: black beard and hair around a red, snarling face
    pix(g, [
      '................',
      '...k..k..k.k....',
      '..kkkkkkkkkkk...',
      '..kkrrrrrrrkk...',
      '.kkrrrrrrrrrkk..',
      '.krRRrrrrrRRrk..',
      '.krwwRrrrRwwrk..',
      '.kkrrkrrrrkrrkk.',
      '.kkrrrrrrrrrrkk.',
      '.kkkrmmmmmmrkkk.',
      '..kkmwmwwmwmkk..',
      '..kkkmwwwwmkkk..',
      '...kkkmmmmkkk...',
      '....kkkkkkkk....',
      '.....kkkkkk.....'], { k: '#2a1018', r: '#e84a38', R: '#8a1418', w: '#fff0e0', m: '#4a0810' });
    g.soft(G.pts([[5, 4], [6, 4], [5, 5], [10, 4]]), '#ffa090');
  }],
  axe_battle_hunger: ['ruby', g => {
    g.halo(7.5, 8, 9, '#ff3a30');
    // a horned demon skull with burning eyes
    pix(g, [
      '................',
      '.hh..........hh.',
      '.hhh........hhh.',
      '..hhhdddddhhhh..',
      '..hhddRRRRddhh..',
      '...hdRRRRRRdh...',
      '....dRyRRyRd....',
      '....dRyyRyyRd...',
      '....dRRddRRd....',
      '.....dRddRd.....',
      '.....ddwdwdd....',
      '......dwdwd.....',
      '.......dd.......'], { h: '#c8b8a0', d: '#2a0c14', R: '#a42222', y: '#ffd23c', w: '#e8dcc8' });
    g.dots([[3, 4], [12, 4]], '#ece2c0');
  }],
  axe_counter_helix: ['fire', g => {
    g.halo(7.5, 7.5, 9, '#ff8a30');
    // a whirling axe inside bands of orange motion
    g.paint(G.arc(7.5, 7.5, 5.4, 7.4, 3.6, 6.1), R.orange, 'f', { lv: 1, soft: true });
    g.paint(G.arc(7.5, 7.5, 5.4, 7.4, 0.4, 2.9), R.orange, 'f', { lv: 1, soft: true });
    g.paint(G.arc(7.5, 7.5, 6.2, 7.4, 4.0, 5.8), R.yellow, 'f', { lv: 0, soft: true });
    g.paint(G.arc(7.5, 7.5, 6.2, 7.4, 0.8, 2.6), R.yellow, 'f', { lv: 0, soft: true });
    g.paint(G.line(3, 12, 12, 3, 2), R.wood, 'h');
    g.poly([[9, 2], [13, 2], [14, 6], [12, 7], [10, 5]], R.steel, 'e');
    g.poly([[6, 9], [4, 9], [1, 10], [2, 14], [5, 13]], R.steel, 'e');
    g.soft(G.pts([[11, 3], [12, 3]]), '#ffffff'); g.soft(G.pts([[3, 12], [3, 11]]), '#ffffff');
  }],
  axe_culling_blade: ['ruby', g => {
    // a blood-soaked axe, claw-slashes torn across it
    g.paint(G.line(2, 14, 9, 7, 2), R.wood, 'h');
    g.poly([[6, 1], [13, 0.5], [15, 5], [14, 9], [10, 9], [8, 7], [7, 4]], R.iron, 'e');
    g.poly([[8, 2], [12, 1.5], [13.5, 5], [10, 5]], R.steel, 'f', { lv: 0 });
    g.paint(G.line(0, 0, 11, 13, 2), R.red, 'f', { lv: 1, soft: true });
    g.paint(G.line(4, 0, 15, 12, 2), R.red, 'f', { lv: 1, soft: true });
    g.paint(G.line(0, 5, 8, 15, 1), R.red, 'f', { lv: 1, soft: true });
    g.soft(G.pts([[1, 0], [5, 0], [1, 5], [3, 3], [7, 7], [11, 9]]), '#ffc0b0');
    g.soft(G.pts([[12, 13], [13, 15], [9, 14], [14, 11], [3, 13]]), '#7a1018');
  }],
  // ---------------------------------------------------------------- Sniper
  sniper_shrapnel: ['ember', g => {
    g.halo(7.5, 12, 10, '#ffa030');
    // a rain of burning shards, scorched ground below
    const streak = (hx, hy, len) => { g.paint(G.line(hx + len, hy - len * 1.6, hx, hy, 2), R.fire, 'f', { lv: 2, soft: true });
      g.paint(G.line(hx + len * 0.8, hy - len * 1.3, hx, hy, 1), R.orange, 'f', { lv: 1, soft: true }); g.dot(hx, hy, '#fff0b0'); g.dot(hx, hy + 1, '#ffd060'); };
    streak(3, 8, 3); streak(7, 11, 4); streak(10, 7, 4); streak(13, 10, 3); streak(5, 4, 2);
    g.paint(G.rect(0, 13, 15, 15), R.brown, 'v');
    g.soft(G.pts([[1, 12], [3, 12], [6, 12], [8, 13], [11, 12], [13, 13], [14, 12]]), '#341c0a'); g.dots([[2, 11], [9, 12], [12, 11]], '#ffd060');
  }],
  sniper_headshot: ['blood', g => {
    g.halo(5, 6, 8, '#ffd060');
    // a helmeted head taking a bullet: white-hot muzzle flash streaking in from the left
    pix(g, [
      '................',
      '................',
      '...w.......d....',
      '.yyWWw..d.......',
      'oyyWWWyyyyd.....',
      '.oyyWWw.........',
      '..o...hhhhh.....',
      '.....hhhhhhh....',
      '....hHhhhhhhh...',
      '....hHhhhhhhk...',
      '...kkkkkkkkkkk..',
      '...kssssssssk...',
      '....kssssssk....',
      '.....kkkkkk.....'], { h: '#7a7a48', H: '#b4b478', k: '#3c3420', s: '#c88a64', w: ['#ffffff'], W: ['#ffffff'], y: ['#ffd060'], o: ['#ff8a2a'], d: '#12121c' });
    g.soft(G.pts([[9, 5], [10, 4], [11, 5]]), '#ff3a2a'); g.dots([[13, 3], [12, 8], [14, 6]], '#ffd060');
  }],
  sniper_take_aim: ['bolt', g => {
    g.halo(7.5, 5, 9, '#a8ff80');
    // Kardel's brass goggles with glowing green lenses, white moustache below
    pix(g, [
      '................',
      '................',
      '..gggg....gggg..',
      '.gGGGGgggGGGGg..',
      '.gGlllGgGlllGg..',
      '.gGlWlGgGlWlGg..',
      '.gGlllGgGlllGg..',
      '..gGGGg..gGGGg..',
      '...gggg..gggg...',
      '....ssssssss....',
      '...sssnnnnsss...',
      '...ssmwwwwmss...',
      '....mwwwwwwm....',
      '.....wwwwww.....'], { g: '#7a4a0e', G: '#f6c842', l: '#46c868', W: '#ffffff', s: '#e8a878', n: '#b87850', m: '#c8c0b0', w: '#f2f2f2' });
    g.dots([[5, 4], [11, 4]], '#a8ff80');
  }],
  sniper_assassinate: ['ember', g => {
    g.halo(7, 7, 9, '#ffb040');
    // a rifle barrel erupting in muzzle flash, the round already gone
    g.paint(G.line(15, 15, 9, 9, 4), R.iron, 'h');
    g.paint(G.line(14, 15, 9, 10, 1), R.steel, 'f', { lv: 0, soft: true });
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.2; g.paint(G.line(7, 7, 7 + 6 * Math.cos(a), 7 + 6 * Math.sin(a), 1), R.orange, 'f', { lv: i % 2 ? 0 : 1, soft: true }); }
    g.ell(7, 7, 2.6, 2.6, R.yellow, 'g'); g.dot(7, 7, '#ffffff'); g.dot(6, 6, '#ffffff'); g.dot(7, 6, '#ffffff');
    g.paint(G.line(0, 0, 3, 3, 1), R.white, 'f', { lv: 1, soft: true }); g.ell(1.5, 1.5, 1, 1, R.gold, 'f');
  }],
  // ---------------------------------------------------------------- Zeus
  zuus_arc_lightning: ['storm', g => {
    g.halo(8, 8, 10, '#cfeaff');
    // lightning chaining between two struck, silhouetted figures
    g.zig([[13, 1], [10, 4], [12, 6], [8, 8], [9, 10], [4, 13]], R.cyan, W, 2);
    pix(g, [
      '................',
      '.dd.............',
      '.dd.d...........',
      '..dd............',
      '.dddd...........',
      '..dd............',
      '.d.d............',
      '................', '................', '................', '................',
      '..........dd....',
      '.........dddd...',
      '.........d.dd...',
      '..........dd....',
      '.........d..d...'], { d: '#0c1238' });
    g.spark(8, 8, '#ffffff'); g.dots([[1, 9], [14, 14], [6, 14], [14, 5]], '#ffffff');
  }],
  zuus_lightning_bolt: ['storm', g => {
    g.halo(8, 8, 10, '#e0f4ff');
    // a glowing fist clenched around a bolt
    g.rect(3, 7, 12, 14, R.ice, 'x');
    g.rect(2, 8, 4, 12, R.cyan, 'x');
    g.soft(G.pts([[6, 7], [6, 8], [6, 9], [8, 7], [8, 8], [8, 9], [10, 7], [10, 8], [10, 9]]), '#7cc8f0');
    g.soft(G.rect(4, 11, 11, 11), '#7cc8f0');
    g.zig([[13, 0], [10, 3], [12, 5], [8, 8], [9, 9], [5, 14]], R.yellow, W, 2);
    g.zig([[2, 1], [4, 4], [3, 6]], R.cyan, W, 1);
    g.dots([[14, 9], [1, 14], [14, 14]], '#ffffff');
  }],
  zuus_static_field: ['storm', g => {
    g.halo(7.5, 6, 9, '#bfe8ff');
    // the king of the gods: wild white hair and beard, eyes blazing
    pix(g, [
      '....wwwwwwww....',
      '..wwWWWWWWWWww..',
      '.wWWwwwwwwwwWWw.',
      '.wWwskksskkswWw.',
      '.wWwseesseeswWw.',
      '.wWwsssssssswWw.',
      '.wWwsssSSssswWw.',
      '..wWwwsSSswwWw..',
      '..wWWwwwwwwWWw..',
      '..wWWWWWWWWWWw..',
      '...wWWwwwwWWw...',
      '...wwWWWWWWww...',
      '....wwWWWWww....',
      '.....wwwwww.....'], { w: '#b4bed4', W: '#ffffff', s: '#e8b090', S: '#b87850', k: '#6c6c88', e: '#9ae4ff' });
    g.dots([[5, 4], [6, 4], [9, 4], [10, 4]], '#e8faff');
    g.zig([[1, 1], [2, 3]], R.cyan, W, 1); g.zig([[14, 1], [13, 3]], R.cyan, W, 1);
  }],
  zuus_thundergods_wrath: ['storm', g => {
    g.halo(7.5, 4, 10, '#ffffff');
    for (let i = 0; i < 10; i++) { const a = -Math.PI + 0.3 + i * (Math.PI - 0.6) / 9; g.paint(G.line(7.5, 4, 7.5 + 9 * Math.cos(a), 4 + 9 * Math.sin(a), 1), R.white, 'f', { lv: 0, soft: true }); }
    g.soft(G.ell(7.5, 4, 3, 2.4), '#ffffff');
    g.zig([[2, 0], [4, 3], [3, 5]], R.yellow, W, 1); g.zig([[13, 0], [11, 3], [12, 5]], R.yellow, W, 1);
    // a small caped figure below, arms flung up into the light
    pix(g, [
      '................', '................', '................', '................', '................',
      '.d............d.',
      '.dd..........dd.',
      '..dd........dd..',
      '...dd..ss..dd...',
      '....dd.ss.dd....',
      '.....dddddd.....',
      '.....dddddd.....',
      '.....ddddddd....',
      '....ddd..ddd....'], { d: '#141a3c', s: '#e8b090' });
  }],
  // ---------------------------------------------------------------- Drow Ranger
  drow_ranger_frost_arrows: ['ash', g => {
    g.halo(11, 4, 8, '#e8faff');
    // a frost-wreathed arrow: pale ice head, rime on the shaft
    g.paint(G.line(2, 14, 11, 5, 2), R.ice, 'f', { lv: 2 });
    g.paint(G.line(2, 13, 11, 4, 1), R.white, 'f', { lv: 0, soft: true });
    g.poly([[15.5, 0.5], [7.5, 2], [10, 4], [12, 6], [14, 8.5]], R.white, 'e');
    g.poly([[14.5, 1.5], [10, 3], [12, 5.5]], R.ice, 'f', { lv: 1 });
    g.poly([[1, 14], [0, 10], [4, 11.5]], R.white, 'x'); g.poly([[1, 14], [5, 15.5], [4.5, 11.5]], R.cyan, 'x');
    g.spark(12, 12, '#ffffff'); g.spark(3, 4, '#ffffff'); g.dots([[7, 12], [14, 13], [1, 7]], '#cdf2ff');
  }],
  drow_ranger_wave_of_silence: ['ash', g => {
    g.halo(7.5, 7, 8, '#c8d4ec');
    const DK = ['#6c6c88', '#3c3c52', '#262634', '#12121c'];
    // a hooded figure, white mask with a red X over the mouth
    g.ell(7.5, 8.5, 6.8, 7, DK, 'g');
    g.poly([[1, 15], [2, 11], [13, 11], [14.5, 15]], DK, 'g');
    g.ell(7.5, 7, 3.4, 4.6, R.white, 'g');
    g.soft(G.rect(5, 5, 6, 5), '#12121c'); g.soft(G.rect(9, 5, 10, 5), '#12121c');
    g.soft(G.pts([[5, 8], [9, 8], [6, 9], [8, 9], [7, 10], [6, 11], [8, 11], [5, 12], [9, 12]]), '#e83a3a');
  }],
  drow_ranger_multishot: ['deep', g => {
    g.halo(9, 7, 9, '#4c7ce4');
    // three white arrows loosed together, fanning apart
    for (const [tx, ty, hx, hy] of [[1, 10, 5.5, 1.5], [2, 14, 11.5, 3.5], [6, 15, 14.5, 9]]) {
      const a = Math.atan2(hy - ty, hx - tx), c = Math.cos(a), s = Math.sin(a);
      g.paint(G.line(tx, ty, hx, hy, 1), R.white, 'f', { lv: 1, soft: true });
      g.paint(G.poly([[hx + 1.6 * c, hy + 1.6 * s], [hx - 2 * c - 1.6 * s, hy - 2 * s + 1.6 * c], [hx - 1 * c, hy - 1 * s], [hx - 2 * c + 1.6 * s, hy - 2 * s - 1.6 * c]]), R.white, 'f', { lv: 0, soft: true });
      g.dots([[tx + 1.6 * c - 1.4 * s, ty + 1.6 * s + 1.4 * c], [tx + 1.6 * c + 1.4 * s, ty + 1.6 * s - 1.4 * c], [tx + 0.6 * c - 1.1 * s, ty + 0.6 * s + 1.1 * c], [tx + 0.6 * c + 1.1 * s, ty + 0.6 * s - 1.1 * c]], '#9cc4ff');
    }
    g.dots([[12, 14], [3, 3], [9, 8], [14, 1]], '#8cb4ff');
  }],
  drow_ranger_marksmanship: ['deep', g => {
    g.halo(11, 4, 9, '#8cb4ff');
    // one perfect arrow, a comet of blue light behind it
    g.paint(G.line(0, 15, 10, 5, 4), R.blue, 'f', { lv: 1, soft: true });
    g.paint(G.line(0, 15, 10, 5, 2), R.cyan, 'f', { lv: 1, soft: true });
    g.paint(G.line(2, 13, 11, 4, 1), R.white, 'f', { lv: 0, soft: true });
    g.paint(G.line(3, 13, 12, 4, 1), R.steel, 'f', { lv: 1 });
    g.poly([[15.5, 0.5], [8.5, 2], [10.5, 4], [14, 7.5]], R.white, 'e');
    g.poly([[4, 12], [1, 11], [2, 14]], R.white, 'x'); g.poly([[6, 14], [3, 13], [4, 15.5]], R.white, 'x');
    g.spark(2, 14, '#ffffff'); g.dots([[13, 12], [4, 3], [8, 12]], '#8cb4ff');
  }],
  // ---------------------------------------------------------------- Juggernaut
  juggernaut_blade_fury: ['coal', g => {
    g.halo(7.5, 7.5, 9, '#ff5a20');
    // a whirling ring of blades: swirling red-orange sweeps around a bright core
    g.paint(G.arc(7.5, 7.5, 5.2, 7.6, 0.4, 3.5), R.fire, 'f', { lv: 2, soft: true });
    g.paint(G.arc(7.5, 7.5, 5.8, 7.0, 0.6, 3.1), R.orange, 'f', { lv: 1, soft: true });
    g.paint(G.arc(7.5, 7.5, 6.2, 6.7, 0.9, 2.7), R.yellow, 'f', { lv: 1, soft: true });
    g.paint(G.arc(7.5, 7.5, 5.2, 7.6, 3.6, 6.6), R.fire, 'f', { lv: 2, soft: true });
    g.paint(G.arc(7.5, 7.5, 5.8, 7.0, 3.8, 6.3), R.orange, 'f', { lv: 1, soft: true });
    g.paint(G.arc(7.5, 7.5, 6.2, 6.7, 4.1, 5.9), R.yellow, 'f', { lv: 1, soft: true });
    g.paint(G.arc(7.5, 7.5, 2.4, 4, 1.0, 4.4), R.red, 'f', { lv: 1, soft: true });
    g.paint(G.arc(7.5, 7.5, 2.8, 3.6, 1.4, 3.6), R.orange, 'f', { lv: 1, soft: true });
    g.soft(G.ell(7.5, 7.5, 1, 1), '#ffe9a0');
  }],
  juggernaut_healing_ward: ['nature', g => {
    g.halo(7.5, 7, 9, '#7aff7a');
    // a jade banner-ward on its pole, green fire burning on top
    g.paint(G.flameMask(7.5, 4, 2.4, 4), R.green, 'g'); g.dot(7, 2, '#dcffa0'); g.dot(8, 3, '#dcffa0');
    g.rect(7, 4, 8, 15, R.wood, 'h');
    g.rect(2, 4, 13, 5, R.wood, 'e'); g.dots([[2, 4], [13, 4]], '#e0b070');
    pix(g, [
      '', '', '', '', '', '',
      '...dGGGGGGGGd...',
      '...dGggggggGd...',
      '...dGgYYggYgGd.',
      '...dGggYYYggGd.',
      '...dGgYggYgGd...',
      '...dGGggggGGd...',
      '....dGGGGGGd....',
      '.....dGGGGd.....',
      '......dGGd......'], { d: '#1a5a24', G: '#46c048', g: '#2c8a38', Y: '#e8ffa0' });
  }],
  juggernaut_blade_dance: ['ember', g => {
    g.halo(8, 7, 10, '#ffd060');
    // one great curved blade, glowing edge, tearing up through the frame
    g.poly([[0, 15], [0, 11], [3, 6], [9, 1], [15, 0], [14, 4], [9, 9], [4, 13]], ['#fff4a8', '#ffa030', '#d8601a', '#8a2e0c'], 'x');
    g.poly([[2, 12], [4, 8], [9, 3], [13, 1.5], [10, 5], [5, 10]], ['#fff4a8', '#ffe27a', '#ff8a2a', '#c04010'], 'x');
    g.paint(G.line(1, 11, 9, 2, 1), R.white, 'f', { lv: 0, soft: true });
    g.line(0, 15, 4, 11, R.gold, 3, 'f'); g.line(1, 14, 3, 12, R.wood, 1, 'f');
    g.dots([[13, 8], [10, 12], [3, 3]], '#fff0b0');
  }],
  juggernaut_omni_slash: ['coal', g => {
    // sweeping bands of golden slashes round a drawn blade
    g.paint(G.arc(16, 16, 14, 15.4, Math.PI, 1.5 * Math.PI), R.yellow, 'f', { lv: 0, soft: true });
    g.paint(G.arc(16, 16, 11, 12.6, Math.PI, 1.5 * Math.PI), R.orange, 'f', { lv: 1, soft: true });
    g.paint(G.arc(16, 16, 8, 9.2, Math.PI, 1.5 * Math.PI), R.yellow, 'f', { lv: 1, soft: true });
    g.paint(G.arc(0, 0, 14, 15.4, 0, 0.5 * Math.PI), R.yellow, 'f', { lv: 0, soft: true });
    g.paint(G.arc(0, 0, 11, 12.6, 0, 0.5 * Math.PI), R.orange, 'f', { lv: 1, soft: true });
    g.paint(G.arc(0, 0, 8, 9.2, 0, 0.5 * Math.PI), R.yellow, 'f', { lv: 1, soft: true });
    g.paint(G.line(3, 12, 12, 3, 2), R.steel, 'f', { lv: 1 });
    g.poly([[12, 3], [15, 0], [13, 5]], R.white, 'x'); g.paint(G.line(2, 13, 5, 10, 3), R.gold, 'f', { lv: 1 });
    g.spark(7.5, 7.5, '#ffe9a0'); g.dots([[1, 3], [14, 12]], '#ffe9a0');
  }],
  // ---------------------------------------------------------------- Invoker (own drawings; trainer art is reused where it reads well, see icons.mjs)
  invoker_cold_snap: ['deep', g => {
    g.halo(7.5, 7.5, 10, '#5cb4ff');
    // curling wisps of freezing mist
    const curl = (cx, cy, r0, a0, turns, rev, col) => { let prev = null; for (let i = 0; i <= 30; i++) { const t = i / 30, a = a0 + rev * t * turns * Math.PI, r = r0 * (1 - t * 0.85) + 0.6, p = [cx + r * Math.cos(a), cy + r * Math.sin(a)]; if (prev) g.paint(G.line(prev[0], prev[1], p[0], p[1], t < 0.5 ? 2 : 1), col, 'f', { lv: t < 0.5 ? 1 : 0, soft: true }); prev = p; } };
    curl(5.5, 9, 6, 0.3, 2.2, 1, R.cyan); curl(10, 5, 5, 3.4, 2.0, -1, R.ice);
    g.spark(8, 8, '#ffffff'); g.dots([[2, 2], [14, 13], [13, 1], [2, 14], [10, 12]], '#ffffff');
  }],
  invoker_ghost_walk: ['moon', g => {
    g.halo(7.5, 7, 9, '#b0a0ff');
    // a hooded spectre: pale face, eyes burning white
    g.poly([[2, 15], [1.5, 8], [4, 2], [7.5, 0.5], [11, 2], [13.5, 8], [13, 15], [10, 13], [7.5, 15], [5, 13]], R.dark, 'g');
    g.ell(7.5, 7.5, 3.8, 4.8, ['#f4f0ff', '#d0c4f8', '#9c8cd4', '#5c4c98'], 'g');
    g.soft(G.rect(4, 5, 6, 6), '#2c2450'); g.soft(G.rect(9, 5, 11, 6), '#2c2450');
    g.soft(G.pts([[5, 6], [10, 6]]), '#ffffff'); g.soft(G.pts([[7, 9], [8, 9], [7, 11], [8, 11]]), '#7c68c8');
    g.dots([[4, 14], [11, 14]], '#7c68c8');
  }],
  invoker_ice_wall: ['ice', g => {
    g.halo(7.5, 6, 9, '#e0faff');
    // a ridge of jagged ice peaks
    g.poly([[0, 14], [0, 8], [3, 3.5], [5.5, 8], [5.5, 14]], R.ice, 'e');
    g.poly([[4, 14], [5, 6], [8, 0.5], [11, 6], [11, 14]], R.ice, 'e');
    g.poly([[10, 14], [10, 8], [12.5, 4], [15, 9], [15, 14]], R.cyan, 'e');
    g.poly([[8, 1.5], [10, 6], [8, 6]], R.white, 'f', { lv: 0 }); g.poly([[3, 4.5], [4.4, 7.4], [3, 7]], R.white, 'f', { lv: 0 });
    g.soft(G.pts([[7, 8], [7, 10], [8, 12], [2, 10], [13, 10]]), '#7cc8f0');
    g.rect(0, 14, 15, 15, R.blue, 'v'); g.spark(13, 1, '#ffffff');
  }],
  invoker_emp: ['wex', g => {
    // a magenta vortex draining into a white-hot core
    for (let arm = 0; arm < 3; arm++) { let prev = null; for (let i = 0; i <= 30; i++) { const t = i / 30, a = arm * 2.094 + t * 1.15 * Math.PI, r = 7.4 * (1 - t) + 1.4, p = [7.5 + r * Math.cos(a), 7.5 + r * Math.sin(a)];
      if (prev) g.paint(G.line(prev[0], prev[1], p[0], p[1], t < 0.5 ? 2 : 1), t < 0.5 ? R.magenta : R.magenta, 'f', { lv: t < 0.5 ? 1 : 0, soft: true }); prev = p; } }
    g.soft(G.ell(7.5, 7.5, 1.8, 1.8), '#ffffff'); g.dots([[1, 1], [14, 14], [14, 1], [1, 14]], '#ffd6ff');
  }],
  invoker_tornado: ['deep', g => {
    g.halo(7.5, 7.5, 10, '#a898ff');
    // a funnel of whirling lavender cloth
    const pts = []; for (let y = 0; y < 16; y++) { const hw = Math.max(1.2, 6.6 - y * 0.36), cx = 7.5 + Math.sin(y * 0.6) * 1.2; for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) if (x >= 0 && x < 16) pts.push([x, y]); }
    g.paint(G.pts(pts), R.purple, 'f', { lv: 1 });
    for (const [x, y] of pts) g.dot(x, y, ['#dcc4ff', '#a878f0', '#6c40b8', '#a878f0'][(Math.floor(x * 0.45 + y * 0.9) % 4 + 4) % 4]);
    g.dots([[1, 2], [14, 3], [2, 13], [13, 12]], '#dcc4ff');
  }],
  invoker_alacrity: ['dusk', g => {
    g.halo(7.5, 7.5, 10, '#ff9a60');
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.2; g.paint(G.line(7.5, 7.5, 7.5 + 9 * Math.cos(a), 7.5 + 9 * Math.sin(a), 1), R.orange, 'f', { lv: 2, soft: true }); }
    // a glowing pink orb circled by a tilted ring of light
    let prev = null; for (let i = 0; i <= 40; i++) { const t = i / 40 * 2 * Math.PI, ex = 6.6 * Math.cos(t), ey = 2.8 * Math.sin(t), a = -0.6, p = [7.5 + ex * Math.cos(a) - ey * Math.sin(a), 7.5 + ex * Math.sin(a) + ey * Math.cos(a)]; if (prev) g.paint(G.line(prev[0], prev[1], p[0], p[1], 1), R.pink, 'f', { lv: 0, soft: true }); prev = p; }
    g.ell(7.5, 7.5, 3.4, 3.4, ['#ffffff', '#ffd6ff', '#e468ff', '#a432d4'], 'g');
    g.soft(G.pts([[6, 6], [7, 6], [6, 7]]), '#ffffff');
  }],
  invoker_sun_strike: ['exort', g => {
    g.halo(7.5, 6, 10, '#ffd060');
    // a pillar of golden light slamming down, flaring where it lands
    g.paint(G.poly([[5, 0], [10, 0], [14, 13], [1, 13]]), R.orange, 'f', { lv: 1, soft: true });
    g.paint(G.poly([[6, 0], [9, 0], [11.5, 13], [3.5, 13]]), R.yellow, 'f', { lv: 1, soft: true });
    g.paint(G.poly([[7, 0], [8, 0], [9, 13], [6, 13]]), R.white, 'f', { lv: 0, soft: true });
    g.paint(G.sub(G.ell(7.5, 13, 7.4, 2.6), G.ell(7.5, 13, 3, 1)), R.orange, 'f', { lv: 0, soft: true });
    g.soft(G.ell(7.5, 13, 2.8, 1.2), '#ffffff'); g.dots([[1, 9], [14, 8], [2, 3], [13, 2]], '#ffe9a0');
  }],
  invoker_forge_spirit: ['exort', g => {
    g.halo(7.5, 7, 9, '#ff9a30');
    // a spirit of living rock, molten light in its cracks and eyes
    g.paint(G.flameMask(3, 6, 2, 5, -1), R.fire, 'g'); g.paint(G.flameMask(12, 6, 2, 5, 1), R.fire, 'g'); g.paint(G.flameMask(7.5, 3, 2, 3), R.orange, 'g');
    g.ell(7.5, 8.5, 5.6, 5.8, ['#a8a8b8', '#6a6a80', '#3c3c52', '#1a1a28'], 'g');
    g.soft(G.pts([[5, 7], [6, 7], [9, 7], [10, 7]]), '#ffc040'); g.soft(G.pts([[5, 8], [10, 8]]), '#ff8a2a');
    g.soft(G.pts([[5, 11], [6, 12], [7, 11], [8, 12], [9, 11], [10, 12]]), '#ffc040');
    g.soft(G.pts([[7, 3], [7, 4], [8, 5], [3, 9], [4, 10], [12, 10], [11, 5]]), '#ff8a2a');
  }],
  invoker_chaos_meteor: ['exort', g => {
    g.halo(9, 9, 10, '#ff8a30');
    // a molten boulder plunging in, flame streaming up behind it
    g.paint(G.line(0, 0, 8, 8, 5), R.fire, 'f', { lv: 2, soft: true });
    g.paint(G.line(0, 1, 8, 9, 3), R.orange, 'f', { lv: 1, soft: true });
    g.paint(G.line(1, 0, 8, 7, 1), R.yellow, 'f', { lv: 0, soft: true });
    g.ell(10, 10, 5, 4.8, ['#b0b0c0', '#747490', '#444460', '#22222e'], 'g');
    g.soft(G.pts([[8, 8], [9, 9], [8, 10], [12, 9], [11, 12], [13, 11], [10, 13]]), '#ff8a2a'); g.soft(G.pts([[9, 8], [8, 9]]), '#ffe9a0');
    g.dots([[14, 2], [2, 13], [13, 14], [6, 3]], '#ffd070');
  }],
  invoker_deafening_blast: ['deep', g => {
    g.halo(15, 8, 15, '#ff9ae8');
    // concentric shock-waves bursting out of a white-hot point
    const cols = [['#ffffff'], ['#ffd6ff'], ['#e468ff'], ['#a878f0'], ['#6c40b8']];
    [[0, 2.6], [3, 4.2], [5.8, 7], [8.8, 10], [12, 13]].forEach(([r0, r1], i) => g.paint(G.arc(15, 8, r0, r1, Math.PI - 1.15, Math.PI + 1.15), [cols[Math.min(i, 4)][0], cols[Math.min(i, 4)][0], cols[Math.min(i, 4)][0], cols[Math.min(i, 4)][0]], 'f', { soft: true }));
    g.soft(G.ell(15, 8, 3.2, 3.2), '#ffffff'); g.dots([[2, 2], [3, 13], [8, 1], [9, 14]], '#ffd6ff');
  }],
  invoker_invoke: ['arcane', g => {
    g.halo(7.5, 8, 9, '#c090ff');
    // the invocation circle: ring, inverted triangle, three orbs, white heart
    g.paint(G.ring(7.5, 8, 6.2, 7.3), R.gold, 'f', { lv: 1 });
    g.paint(G.or(G.line(4.6, 5.6, 10.6, 5.6, 1), G.line(4.6, 5.6, 7.6, 11, 1), G.line(10.6, 5.6, 7.6, 11, 1)), R.white, 'f', { lv: 1, soft: true });
    g.ell(4.6, 5.6, 2.3, 2.3, R.cyan, 'g'); g.ell(10.6, 5.6, 2.3, 2.3, R.magenta, 'g'); g.ell(7.6, 11, 2.3, 2.3, R.orange, 'g');
    g.soft(G.ell(7.6, 7.4, 1.2, 1.2), '#ffffff'); g.spark(7.5, 0.5, '#fff0b0'); g.dots([[1, 1], [14, 2], [14, 14]], '#e0d0ff');
  }],
  invoker_quas: ['deep', g => {
    g.halo(7.5, 7.5, 10, '#38aef0');
    // Quas: a deep-blue sphere of swirling water
    g.ell(7.5, 7.5, 6.6, 6.6, ['#bff4ff', '#38aef0', '#1c5ca6', '#0c2a66'], 'g');
    for (let i = 0; i <= 36; i++) { const t = i / 36, a = t * 2.6 * Math.PI + 0.4, r = 5.4 * (1 - t) + 0.8; g.dot(7.5 + r * Math.cos(a), 7.5 + r * Math.sin(a), t < 0.7 ? '#9ae4ff' : '#ffffff'); }
    g.dots([[4, 4], [11, 5], [5, 11], [10, 10]], '#6ccaff');
    g.spark(13, 2, '#ffffff'); g.dots([[1, 3], [14, 13], [2, 14], [14, 7]], '#bff4ff');
  }],
  invoker_wex: ['wex', g => {
    g.halo(7.5, 7.5, 10, '#e468ff');
    // Wex: a crackling magenta sphere ringed with lightning
    g.ell(7.5, 7.5, 5.8, 5.8, ['#ffd6ff', '#e468ff', '#a432d4', '#5c1684'], 'g');
    g.ell(7.5, 7.5, 2.4, 2.4, ['#ffffff', '#ffd6ff', '#e468ff', '#a432d4'], 'g');
    g.zig([[7, 0], [5, 2], [7, 3]], R.magenta, W, 1); g.zig([[15, 6], [13, 8], [11, 8]], R.magenta, W, 1);
    g.zig([[8, 15], [10, 13], [8, 12]], R.magenta, W, 1); g.zig([[0, 9], [2, 7], [4, 7]], R.magenta, W, 1);
    g.zig([[13, 2], [11, 4]], R.magenta, W, 1); g.zig([[2, 13], [4, 11]], R.magenta, W, 1);
    g.dots([[1, 1], [14, 14], [14, 1], [1, 14]], '#ffd6ff');
  }],
  invoker_exort: ['exort', g => {
    g.halo(7.5, 8, 10, '#ffb040');
    // Exort: a blazing orange sphere of fire
    g.paint(G.flameMask(3.5, 6, 2, 6, -1), R.fire, 'g'); g.paint(G.flameMask(11.5, 6, 2, 6, 1), R.fire, 'g'); g.paint(G.flameMask(7.5, 4, 2.4, 5), R.orange, 'g');
    g.ell(7.5, 8.5, 6, 5.8, ['#ffe9a0', '#ff8a2a', '#e03a14', '#8a1408'], 'g');
    g.ell(6.5, 7.5, 2.8, 2.6, ['#ffffff', '#ffe9a0', '#ffc040', '#ff8a2a'], 'g');
    g.dots([[3, 12], [12, 12], [8, 14]], '#8a1408'); g.dots([[1, 4], [14, 3], [13, 13]], '#ffd070');
  }],
};
