// Hero roster. Slot order is AUTHORED here (docs/DECISIONS.md), not read from the game files (current-patch files add innates /
// facets / shard slots we skip). Values for these keys come from shared/data/abilities.json.
// slots: Q W E R (D F for Invoker's invoked spells). Invoker: [quas, wex, exort, empty1 (D), empty2 (F), invoke (R)].

export const HEROES = {
  npc_dota_hero_invoker: { short: 'invoker', name: 'Invoker', abilities: ['invoker_quas', 'invoker_wex', 'invoker_exort', 'invoker_empty1', 'invoker_empty2', 'invoker_invoke'],
    keys: ['Q', 'W', 'E', 'D', 'F', 'R'],
    invoked: ['invoker_cold_snap', 'invoker_ghost_walk', 'invoker_ice_wall', 'invoker_emp', 'invoker_tornado', 'invoker_alacrity', 'invoker_sun_strike', 'invoker_forge_spirit', 'invoker_chaos_meteor', 'invoker_deafening_blast'] },
  npc_dota_hero_sven: { short: 'sven', name: 'Sven', abilities: ['sven_storm_bolt', 'sven_great_cleave', 'sven_warcry', 'sven_gods_strength'] },
  npc_dota_hero_lina: { short: 'lina', name: 'Lina', abilities: ['lina_dragon_slave', 'lina_light_strike_array', 'lina_fiery_soul', 'lina_laguna_blade'] },
  npc_dota_hero_lion: { short: 'lion', name: 'Lion', abilities: ['lion_impale', 'lion_voodoo', 'lion_mana_drain', 'lion_finger_of_death'] },
  npc_dota_hero_crystal_maiden: { short: 'crystal_maiden', name: 'Crystal Maiden', abilities: ['crystal_maiden_crystal_nova', 'crystal_maiden_frostbite', 'crystal_maiden_brilliance_aura', 'crystal_maiden_freezing_field'] },
  npc_dota_hero_axe: { short: 'axe', name: 'Axe', abilities: ['axe_berserkers_call', 'axe_battle_hunger', 'axe_counter_helix', 'axe_culling_blade'] },
  npc_dota_hero_sniper: { short: 'sniper', name: 'Sniper', abilities: ['sniper_shrapnel', 'sniper_headshot', 'sniper_take_aim', 'sniper_assassinate'] },
  npc_dota_hero_zuus: { short: 'zuus', name: 'Zeus', abilities: ['zuus_arc_lightning', 'zuus_lightning_bolt', 'zuus_static_field', 'zuus_thundergods_wrath'] },
  npc_dota_hero_drow_ranger: { short: 'drow_ranger', name: 'Drow Ranger', abilities: ['drow_ranger_frost_arrows', 'drow_ranger_wave_of_silence', 'drow_ranger_multishot', 'drow_ranger_marksmanship'] },
  npc_dota_hero_juggernaut: { short: 'juggernaut', name: 'Juggernaut', abilities: ['juggernaut_blade_fury', 'juggernaut_healing_ward', 'juggernaut_blade_dance', 'juggernaut_omni_slash'] },
};
for (const k in HEROES) if (!HEROES[k].keys) HEROES[k].keys = ['Q', 'W', 'E', 'R'];

export const HERO_KEYS = Object.keys(HEROES);
export const heroByShort = (s) => HERO_KEYS.find((k) => HEROES[k].short === s);
