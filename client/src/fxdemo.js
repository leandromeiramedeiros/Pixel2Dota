// Sandbox FX demo: synthetic server events for every hero ability / item / projectile, aimed at the camera centre (or the cursor ground point).
// Keys (installed from sandbox.js):  1..9,0 = hero 1..10, each press fires that hero's NEXT spell;  C = next spell of ALL heroes (cycle);
//   I = next item;  M = next basic-attack projectile;  X = fire every spell of the current hero at once.  window.__fx.fire('lina_dragon_slave'), __fx.all(delayMs).
import { EV } from '../../shared/protocol.js';

const ORDER = ['sven', 'lina', 'lion', 'crystal_maiden', 'axe', 'sniper', 'zuus', 'drow_ranger', 'juggernaut', 'invoker', 'pudge', 'mirana', 'rubick'];
const ATKS = ['lina', 'sniper', 'drow_ranger', 'lion', 'crystal_maiden', 'zuus', 'invoker', 'creep_ranged', 'tower', 'siege', 'invoker_forged_spirit', 'mirana', 'rubick'];
const ITEMS = ['blink', 'tp', 'item_black_king_bar', 'item_tango', 'item_quelling_blade', 'item_flask', 'item_clarity', 'item_faerie_fire', 'item_enchanted_mango', 'item_magic_stick', 'item_magic_wand', 'item_phase_boots', 'item_power_treads'];
const RECIPE = { invoker_cold_snap: 'QQQ', invoker_ghost_walk: 'QQW', invoker_ice_wall: 'QQE', invoker_emp: 'WWW', invoker_tornado: 'WWQ', invoker_alacrity: 'WWE', invoker_sun_strike: 'EEE', invoker_forge_spirit: 'EEQ', invoker_chaos_meteor: 'EEW', invoker_deafening_blast: 'QWE' };

export function installFxDemo({ r, units, mouse, myHero, heightAt }) {
  let pid = 1;
  const byShort = (s) => { for (const u of units.values()) if (u.short === s) return u; return null; };
  const center = () => {
    if (mouse.in) { const g = r.pick(mouse.x, mouse.y); if (g && g.x != null) return { x: g.x, y: g.y }; }
    return r.getTarget();
  };
  const stage = (u, x, y, face) => { if (!u) return; u.x = x; u.y = y; u.facing = face || 0; u.state = 'idle'; u.st = 6; u.goal = null; u.anim = 'idle'; u.z = heightAt(x, y); };
  function ctx(short) {
    window.__calm = true;
    const S = byShort(short) || myHero, C = center();
    const enemy = [...units.values()].find((u) => u.kind === 'hero' && u.team !== S.team && u !== S) || S;
    const ally = [...units.values()].find((u) => u.kind === 'hero' && u.team === S.team && u !== S) || S;
    stage(S, C.x - 380, C.y, 0); stage(enemy, C.x + 260, C.y, Math.PI); stage(ally, C.x - 160, C.y - 170, 0);
    return { S, T: enemy, A: ally, C, G: { x: enemy.x, y: enemy.y }, id: 'd' + pid++ };
  }
  const sp = (k, S, o) => Object.assign({ e: EV.SPELL, k, s: S.id, lv: 1 }, o);
  const proj = (k, S, x, y, o) => Object.assign({ e: EV.PROJ, id: 'p' + pid++, k, s: S.id, x: Math.round(x), y: Math.round(y), sp: 1000 }, o);
  const ends = (list, delay, id) => list.push({ at: delay, ev: { e: EV.PROJ_END, id } });
  const dirx = (S, d) => ({ x2: Math.round(S.x + d), y2: Math.round(S.y) });

  // key -> (ctx) => [{at: seconds, ev}]
  const F = {};
  const one = (k, f) => { F[k] = (c) => { const out = []; f(c, out); return out; }; };

  // Sven
  one('sven_storm_bolt', ({ S, T }, o) => { const p = proj('sven_storm_bolt', S, S.x, S.y, { t: T.id, sp: 1000 }); o.push({ at: 0, ev: p }, { at: 0, ev: sp('sven_storm_bolt', S, { t: T.id, r: 255 }) }); ends(o, Math.hypot(T.x - S.x, T.y - S.y) / 1000, p.id); });
  one('sven_great_cleave', ({ S }, o) => o.push({ at: 0, ev: sp('sven_great_cleave', S, {}) }));
  one('sven_warcry', ({ S }, o) => o.push({ at: 0, ev: sp('sven_warcry', S, { r: 700, dur: 8 }) }));
  one('sven_gods_strength', ({ S }, o) => o.push({ at: 0, ev: sp('sven_gods_strength', S, { dur: 25 }) }));
  // Lina
  one('lina_dragon_slave', ({ S }, o) => { const p = proj('lina_dragon_slave', S, S.x, S.y, { ...dirx(S, 1075), sp: 1200 }); o.push({ at: 0, ev: p }, { at: 0, ev: sp('lina_dragon_slave', S, { x: Math.round(S.x), y: Math.round(S.y), ...dirx(S, 1075), r: 137, dur: 1075 / 1200 }) }); ends(o, 1075 / 1200, p.id); });
  one('lina_light_strike_array', ({ S, G }, o) => o.push({ at: 0, ev: sp('lina_light_strike_array', S, { x: G.x, y: G.y, r: 250, dur: 0.5 }) }));
  one('lina_fiery_soul', ({ S }, o) => o.push({ at: 0, ev: sp('lina_fiery_soul', S, {}) }));
  one('lina_laguna_blade', ({ S, T }, o) => o.push({ at: 0, ev: sp('lina_laguna_blade', S, { t: T.id, x: Math.round(T.x), y: Math.round(T.y), x2: Math.round(T.x), y2: Math.round(T.y), dur: 0.25 }) }));
  // Lion
  one('lion_impale', ({ S }, o) => { const p = proj('lion_impale', S, S.x, S.y, { ...dirx(S, 650), sp: 2800 }); o.push({ at: 0, ev: p }, { at: 0, ev: sp('lion_impale', S, { x: Math.round(S.x), y: Math.round(S.y), ...dirx(S, 650), r: 70, dur: 650 / 2800 }) }); ends(o, 650 / 2800, p.id); });
  one('lion_voodoo', ({ S, T }, o) => o.push({ at: 0, ev: sp('lion_voodoo', S, { t: T.id, dur: 3 }) }));
  one('lion_mana_drain', ({ S, T }, o) => o.push({ at: 0, ev: sp('lion_mana_drain', S, { t: T.id, dur: 5, channel: 5 }) }));
  one('lion_finger_of_death', ({ S, T }, o) => o.push({ at: 0, ev: sp('lion_finger_of_death', S, { t: T.id, x2: Math.round(T.x), y2: Math.round(T.y), dur: 0.25 }) }));
  // Crystal Maiden
  one('crystal_maiden_crystal_nova', ({ S, G }, o) => o.push({ at: 0, ev: sp('crystal_maiden_crystal_nova', S, { x: G.x, y: G.y, r: 425 }) }));
  one('crystal_maiden_frostbite', ({ S, T }, o) => o.push({ at: 0, ev: sp('crystal_maiden_frostbite', S, { t: T.id, dur: 2.5 }) }));
  one('crystal_maiden_brilliance_aura', ({ S }, o) => o.push({ at: 0, ev: sp('crystal_maiden_brilliance_aura', S, {}) }));
  one('crystal_maiden_freezing_field', ({ S }, o) => {
    S.status |= 512; setTimeout(() => { S.status &= ~512; }, 6500);
    o.push({ at: 0, ev: sp('crystal_maiden_freezing_field', S, { r: 810, dur: 6 }) });
    for (let i = 0; i < 14; i++) { const a = i * 2.4, d = 300 + (i * 97) % 500; o.push({ at: 0.3 + i * 0.4, ev: sp('crystal_maiden_freezing_field', S, { sub: 'blast', x: Math.round(S.x + Math.cos(a) * d), y: Math.round(S.y + Math.sin(a) * d), r: 300 }) }); }
  });
  // Axe
  one('axe_berserkers_call', ({ S }, o) => o.push({ at: 0, ev: sp('axe_berserkers_call', S, { r: 315, dur: 2 }) }));
  one('axe_battle_hunger', ({ S, T }, o) => o.push({ at: 0, ev: sp('axe_battle_hunger', S, { t: T.id, dur: 10 }) }));
  one('axe_counter_helix', ({ S }, o) => o.push({ at: 0, ev: sp('axe_counter_helix', S, {}) }));
  one('axe_culling_blade', ({ S, T }, o) => o.push({ at: 0, ev: sp('axe_culling_blade', S, { t: T.id, x2: Math.round(T.x), y2: Math.round(T.y), r: 675, dur: 6, kill: 1 }) }));
  // Sniper
  one('sniper_shrapnel', ({ S, G }, o) => o.push({ at: 0, ev: sp('sniper_shrapnel', S, { x: G.x, y: G.y, r: 450, dur: 11.2 }) }));
  one('sniper_headshot', ({ S, T }, o) => o.push({ at: 0, ev: sp('sniper_headshot', S, { t: T.id }) }));
  one('sniper_take_aim', ({ S }, o) => o.push({ at: 0, ev: sp('sniper_take_aim', S, {}) }));
  one('sniper_assassinate', ({ S, T }, o) => { const p = proj('sniper_assassinate', S, S.x, S.y, { t: T.id, sp: 2500 }); o.push({ at: 0, ev: sp('sniper_assassinate', S, { t: T.id }) }, { at: 0.2, ev: p }); ends(o, 0.2 + Math.hypot(T.x - S.x, T.y - S.y) / 2500, p.id); });
  // Zeus
  one('zuus_arc_lightning', ({ S, T }, o) => o.push({ at: 0, ev: sp('zuus_arc_lightning', S, { t: T.id, r: 450 }) }));
  one('zuus_lightning_bolt', ({ S, T }, o) => o.push({ at: 0, ev: sp('zuus_lightning_bolt', S, { t: T.id, x: Math.round(T.x), y: Math.round(T.y), r: 325 }) }));
  one('zuus_static_field', ({ S }, o) => o.push({ at: 0, ev: sp('zuus_static_field', S, {}) }));
  one('zuus_thundergods_wrath', ({ S }, o) => { for (const u of units.values()) if (u.kind === 'hero' && u.team !== S.team) o.push({ at: 0.05, ev: sp('zuus_thundergods_wrath', S, { sub: 'strike', t: u.id, x: Math.round(u.x), y: Math.round(u.y) }) }); o.push({ at: 0, ev: sp('zuus_thundergods_wrath', S, {}) }); });
  // Drow
  one('drow_ranger_frost_arrows', ({ S, T }, o) => o.push({ at: 0, ev: sp('drow_ranger_frost_arrows', S, { t: T.id }) }, { at: 0, ev: { e: EV.ATK, s: S.id, t: T.id, k: 'drow_ranger', sp: 1250 } }));
  one('drow_ranger_wave_of_silence', ({ S }, o) => { const p = proj('drow_ranger_wave_of_silence', S, S.x, S.y, { ...dirx(S, 900), sp: 2000 }); o.push({ at: 0, ev: p }, { at: 0, ev: sp('drow_ranger_wave_of_silence', S, { x: Math.round(S.x), y: Math.round(S.y), ...dirx(S, 900), r: 125, dur: 900 / 2000 }) }); ends(o, 900 / 2000, p.id); });
  one('drow_ranger_multishot', ({ S }, o) => {
    o.push({ at: 0, ev: sp('drow_ranger_multishot', S, { dur: 2, ...dirx(S, 600) }) });
    for (let w = 0; w < 4; w++) for (let i = 0; i < 5; i++) { const a = (i / 4 - 0.5) * 0.7, p = proj('drow_ranger_multishot', S, S.x, S.y, { x2: Math.round(S.x + Math.cos(a) * 475), y2: Math.round(S.y + Math.sin(a) * 475), sp: 1300 }); o.push({ at: w * 0.5, ev: p }); ends(o, w * 0.5 + 475 / 1300, p.id); }
  });
  one('drow_ranger_marksmanship', ({ S }, o) => o.push({ at: 0, ev: sp('drow_ranger_marksmanship', S, {}) }));
  // Juggernaut
  one('juggernaut_blade_fury', ({ S }, o) => o.push({ at: 0, ev: sp('juggernaut_blade_fury', S, { r: 260, dur: 5 }) }));
  one('juggernaut_healing_ward', ({ S }, o) => o.push({ at: 0, ev: sp('juggernaut_healing_ward', S, { x: Math.round(S.x + 160), y: Math.round(S.y - 60), r: 400, dur: 18 }) }));
  one('juggernaut_blade_dance', ({ S }, o) => o.push({ at: 0, ev: sp('juggernaut_blade_dance', S, {}) }));
  one('juggernaut_omni_slash', ({ S, T }, o) => { o.push({ at: 0, ev: sp('juggernaut_omni_slash', S, { t: T.id, r: 425, dur: 3, x: Math.round(S.x), y: Math.round(S.y), x2: Math.round(T.x), y2: Math.round(T.y), sub: 'slash' }) }); for (let i = 1; i < 8; i++) o.push({ at: i * 0.3, ev: sp('juggernaut_omni_slash', S, { t: T.id, sub: 'slash', x: Math.round(T.x + Math.cos(i) * 120), y: Math.round(T.y + Math.sin(i) * 120), x2: Math.round(T.x + Math.cos(i * 2) * 120), y2: Math.round(T.y + Math.sin(i * 2) * 120) }) }); });
  // Invoker
  one('invoker_quas', ({ S }, o) => { S.orbs = ((S.orbs || '') + 'Q').slice(-3); o.push({ at: 0, ev: sp('invoker_quas', S, {}) }); });
  one('invoker_wex', ({ S }, o) => { S.orbs = ((S.orbs || '') + 'W').slice(-3); o.push({ at: 0, ev: sp('invoker_wex', S, {}) }); });
  one('invoker_exort', ({ S }, o) => { S.orbs = ((S.orbs || '') + 'E').slice(-3); o.push({ at: 0, ev: sp('invoker_exort', S, {}) }); });
  one('invoker_invoke', ({ S }, o) => o.push({ at: 0, ev: { e: EV.INVOKE, s: S.id, k: 'invoker_cold_snap' } }));
  const inv = (k, f) => one(k, (c, o) => { c.S.orbs = RECIPE[k]; o.push({ at: 0, ev: { e: EV.INVOKE, s: c.S.id, k } }); f(c, o, 0.6); });
  inv('invoker_cold_snap', ({ S, T }, o, t0) => o.push({ at: t0, ev: sp('invoker_cold_snap', S, { t: T.id, dur: 6, r: 0 }) }));
  inv('invoker_ghost_walk', ({ S }, o, t0) => o.push({ at: t0, ev: sp('invoker_ghost_walk', S, { r: 400, dur: 6 }) }));
  inv('invoker_ice_wall', ({ S }, o, t0) => { const cx = S.x + 200, h = 300; o.push({ at: t0, ev: sp('invoker_ice_wall', S, { x: Math.round(cx), y: Math.round(S.y - h), x2: Math.round(cx), y2: Math.round(S.y + h), r: 60, dur: 6 }) }); });
  inv('invoker_emp', ({ S, G }, o, t0) => o.push({ at: t0, ev: sp('invoker_emp', S, { x: G.x, y: G.y, r: 675, dur: 2.9 }) }));
  inv('invoker_tornado', ({ S, T }, o, t0) => { const p = proj('invoker_tornado', S, S.x, S.y, { ...dirx(S, 1500), sp: 1000 }); o.push({ at: t0, ev: p }, { at: t0, ev: sp('invoker_tornado', S, { ...dirx(S, 1500), r: 200, dur: 1.5, lift: 1.6 }) }, { at: t0 + 0.4, ev: sp('invoker_tornado', S, { sub: 'lift', t: T.id, x: Math.round(T.x), y: Math.round(T.y), dur: 1.6 }) }); ends(o, t0 + 1.5, p.id); });
  inv('invoker_alacrity', ({ S, A }, o, t0) => o.push({ at: t0, ev: sp('invoker_alacrity', S, { t: A.id, dur: 9 }) }));
  inv('invoker_sun_strike', ({ S, G }, o, t0) => o.push({ at: t0, ev: sp('invoker_sun_strike', S, { x: G.x, y: G.y, r: 175, dur: 1.7 }) }));
  inv('invoker_forge_spirit', ({ S }, o, t0) => o.push({ at: t0, ev: sp('invoker_forge_spirit', S, { n: 3, dur: 20, r: 80 }) }));
  inv('invoker_chaos_meteor', ({ S, G }, o, t0) => o.push({ at: t0, ev: sp('invoker_chaos_meteor', S, { x: G.x - 250, y: G.y, x2: G.x + 700, y2: G.y, r: 275, dur: 3.1, land: 1.3, roll: 1.8 }) }));
  inv('invoker_deafening_blast', ({ S }, o, t0) => { const p = proj('invoker_deafening_blast', S, S.x, S.y, { ...dirx(S, 1000), sp: 1100 }); o.push({ at: t0, ev: p }, { at: t0, ev: sp('invoker_deafening_blast', S, { ...dirx(S, 1000), r: 225, r0: 175, dur: 0.9 }) }); ends(o, t0 + 1000 / 1100, p.id); });
  // Pudge / Mirana / Rubick (events as emitted by server/src/sim/abilities/{pudge,mirana,rubick}.js)
  one('pudge_meat_hook', ({ S, T }, o) => {
    const d = Math.hypot(T.x - S.x, T.y - S.y), sp0 = 1600, tt = d / sp0, a = proj('pudge_meat_hook', S, S.x, S.y, { x2: Math.round(T.x), y2: Math.round(T.y), sp: sp0 });
    const b = proj('pudge_meat_hook_back', S, T.x, T.y, { x2: Math.round(S.x), y2: Math.round(S.y), sp: sp0 });
    o.push({ at: 0, ev: sp('pudge_meat_hook', S, { x2: Math.round(T.x), y2: Math.round(T.y), r: 70, dur: tt }) }, { at: 0, ev: a },
      { at: tt, ev: sp('pudge_meat_hook', S, { sub: 'hit', t: T.id, x: Math.round(T.x), y: Math.round(T.y), x2: Math.round(S.x), y2: Math.round(S.y) }) }, { at: tt, ev: b });
  });
  one('pudge_rot', ({ S }, o) => { o.push({ at: 0, ev: sp('pudge_rot', S, { sub: 'on', r: 250 }) }, { at: 5, ev: sp('pudge_rot', S, { sub: 'off', r: 250 }) }); });
  one('pudge_flesh_heap', ({ S }, o) => o.push({ at: 0, ev: sp('pudge_flesh_heap', S, { r: 140, dur: 6 }) }));
  one('pudge_dismember', ({ S, T }, o) => { T.x = S.x + 110; T.y = S.y; o.push({ at: 0, ev: sp('pudge_dismember', S, { t: T.id, dur: 3, r: 120 }) }); });
  one('mirana_starfall', ({ S, T }, o) => {
    T.x = S.x + 330; T.y = S.y + 40;
    o.push({ at: 0, ev: sp('mirana_starfall', S, { r: 650 }) });
    for (let i = 0; i < 5; i++) o.push({ at: 0, ev: sp('mirana_starfall', S, { sub: 'rain', x: Math.round(S.x + 120 + i * 110), y: Math.round(S.y + ((i * 83) % 260) - 130), r: 90 }) });
    o.push({ at: 0, ev: sp('mirana_starfall', S, { sub: 'star', t: T.id, x: Math.round(T.x), y: Math.round(T.y), r: 120 }) }, { at: 0.57, ev: sp('mirana_starfall', S, { sub: 'star2', t: T.id, x: Math.round(T.x), y: Math.round(T.y), r: 140 }) });
  });
  one('mirana_arrow', ({ S, T }, o) => {
    const d = Math.hypot(T.x - S.x, T.y - S.y), tt = d / 857, a = proj('mirana_arrow', S, S.x, S.y, { x2: Math.round(T.x), y2: Math.round(T.y), sp: 857 });
    o.push({ at: 0, ev: sp('mirana_arrow', S, { x2: Math.round(T.x), y2: Math.round(T.y), r: 50, dur: tt }) }, { at: 0, ev: a },
      { at: tt, ev: sp('mirana_arrow', S, { sub: 'hit', t: T.id, x: Math.round(T.x), y: Math.round(T.y), dur: 3.6, r: 90 }) });
  });
  one('mirana_leap', ({ S }, o) => o.push({ at: 0, ev: sp('mirana_leap', S, { x2: Math.round(S.x + 600), y2: Math.round(S.y), r: 100, dur: 0.4 }) }));
  one('mirana_invis', ({ S, A }, o) => o.push({ at: 0, ev: sp('mirana_invis', S, { dur: 6, r: 200 }) }, { at: 0, ev: sp('mirana_invis', S, { sub: 'fade', t: S.id, dur: 2 }) }, { at: 0, ev: sp('mirana_invis', S, { sub: 'fade', t: A.id, dur: 2 }) }));
  one('rubick_telekinesis', ({ S, T }, o) => o.push({ at: 0, ev: sp('rubick_telekinesis', S, { sub: 'lift', t: T.id, x: Math.round(T.x), y: Math.round(T.y), dur: 1.7, lift: 1, r: 325 }) },
    { at: 1.7, ev: sp('rubick_telekinesis', S, { sub: 'land', t: T.id, x: Math.round(T.x), y: Math.round(T.y), r: 325 }) }));
  one('rubick_fade_bolt', ({ S, T, A }, o) => {
    o.push({ at: 0, ev: sp('rubick_fade_bolt', S, { r: 500 }) }, { at: 0, ev: sp('rubick_fade_bolt', S, { sub: 'bolt', t: T.id, x: Math.round(S.x), y: Math.round(S.y), x2: Math.round(T.x), y2: Math.round(T.y) }) },
      { at: 0.25, ev: sp('rubick_fade_bolt', S, { sub: 'bolt', t: A.id, x: Math.round(T.x), y: Math.round(T.y), x2: Math.round(A.x), y2: Math.round(A.y) }) });
  });
  one('rubick_spell_steal', ({ S, T }, o) => o.push({ at: 0, ev: sp('rubick_spell_steal', S, { sub: 'steal', t: T.id, x: Math.round(T.x), y: Math.round(T.y), k2: 'lina_dragon_slave' }) }));
  // Items
  F.blink = (c) => [{ at: 0, ev: { e: EV.BLINK, s: c.S.id, x: Math.round(c.S.x), y: Math.round(c.S.y), x2: Math.round(c.S.x + 700), y2: Math.round(c.S.y + 120) } }];
  F.tp = (c) => [{ at: 0, ev: { e: EV.TP, s: c.S.id, x: Math.round(c.C.x + 500), y: Math.round(c.C.y - 100), dur: 3 } }];
  for (const k of ITEMS) if (k.startsWith('item_')) F[k] = (c) => [{ at: 0, ev: sp(k, c.S, { t: k === 'item_flask' || k === 'item_clarity' ? c.A.id : undefined, dur: k === 'item_black_king_bar' ? 8 : 10, x: k === 'item_tango' || k === 'item_quelling_blade' ? Math.round(c.C.x - 100) : undefined, y: k === 'item_tango' || k === 'item_quelling_blade' ? Math.round(c.C.y + 100) : undefined }) }];

  // ---------------------------------------------------------------------------------------------------------------------------- firing
  const queue = [];
  r.hooks.push((dt) => { for (let i = queue.length - 1; i >= 0; i--) { const q = queue[i]; q.at -= dt; if (q.at <= 0) { queue.splice(i, 1); r.fx([q.ev]); } } });
  function fire(key, shortHint) {
    const f = F[key]; if (!f) return false;
    const short = shortHint || ORDER.find((s) => key.startsWith(s + '_')) || 'sven';
    const list = f(ctx(short));
    for (const q of list) queue.push({ at: q.at, ev: q.ev });
    return true;
  }
  const spellsOf = (short) => Object.keys(F).filter((k) => k.startsWith(short + '_') && !(short === 'invoker' && ['invoker_quas', 'invoker_wex', 'invoker_exort', 'invoker_invoke'].includes(k) && false));
  const idx = {}; let allIdx = 0, itemIdx = 0, atkIdx = 0;
  const api = {
    fire, spellsOf, order: ORDER, keys: Object.keys(F),
    hero(i) { const s = ORDER[i]; if (!s) return null; const L = spellsOf(s); idx[s] = ((idx[s] ?? -1) + 1) % L.length; fire(L[idx[s]], s); return L[idx[s]]; },
    cycle() { const all = ORDER.flatMap(spellsOf); const k = all[allIdx++ % all.length]; fire(k); return k; },
    item() { const k = ITEMS[itemIdx++ % ITEMS.length]; fire(k, 'sven'); return k; },
    atk() {
      const k = ATKS[atkIdx++ % ATKS.length];
      const S = k === 'tower' || k === 'siege' || k === 'creep_ranged' ? [...units.values()].find((u) => u.kind === 'tower') || ctx('sven').S : byShort(k) || ctx('sven').S;
      const c = ctx(byShort(k) ? k : 'sven');
      const src = byShort(k) || c.S;
      if (k === 'invoker') src.orbs = 'QWE';
      r.fx([{ e: EV.ATK, s: src.id, t: c.T.id, k, sp: k === 'sniper' ? 3000 : 900 }]);
      return k;
    },
    all(ms = 1800) { const all = ORDER.flatMap(spellsOf); all.forEach((k, i) => setTimeout(() => fire(k), i * ms)); return all.length; },
  };
  // deterministic capture helper: __fx.shot(key, frames, night) pauses the sim, fires, steps frames at 30 Hz
  api.shot = (key, frames = 30, night = true) => { window.__calm = true; window.__pause = true; window.__view.night = !!night; if (!api._cam) { api._cam = 1; r.snapTarget(-800, -700); window.__frame(1 / 30, 5); } if (key) fire(key); window.__frame(1 / 30, frames); return r.stats.lights; };
  window.__fx = api;
  addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (/^[0-9]$/.test(k)) api.hero((+k + 9) % 10);
    else if (k === 'c') api.cycle();
    else if (k === 'i') api.item();
    else if (k === 'm') api.atk();
  });
  return api;
}
