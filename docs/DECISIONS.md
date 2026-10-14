# Decisions

## Sources
- Map: `shared/data/dotaworld.js`, copied from InvokerTrainer (its `tools/dota_extract.py` read `maps/dota.vpk` gridnav, entity lump and physics mesh from the local install). Lanes: the `LANES` waypoints in that extractor (`reference/trainer/dota_extract.py`).
- Numbers: `tools/bake.mjs` reads the local install `C:/Program Files (x86)/Steam/steamapps/common/dota 2 beta/game/dota/pak01_dir.vpk` (+ archive `pak01_NNN.vpk`): `scripts/npc/npc_heroes.txt`, `scripts/npc/heroes/npc_dota_hero_*.txt`, `scripts/npc/npc_abilities.txt`, `scripts/npc/items.txt`, `scripts/npc/npc_units.txt`.
- Camera: convar defaults read from `game/dota/bin/win64/client.dll` (the float loaded right before each convar name's registration): `dota_camera_distance` 1200, `dota_camera_distance_min` 1134, `dota_camera_pitch_max` 60, `dota_camera_pitch_min` 38, `dota_camera_fov_max` 70, `dota_camera_fov_min` 45. We use 1134 / 60° / 70° (horizontal @4:3 → 55.4° vertical) as the default view.
- Art direction and lighting: InvokerTrainer (`reference/trainer/LIGHTING-v6.md`, sprites in `client/src/art/sheets/invoker.js`).

## Roster (10)
Criterion: every hero other than Invoker uses at most two mechanics beyond the shared status system (stun, slow, root, silence, hex, DoT, buffs, crit, cleave, auras, channel). No illusions, no AI summons, no terrain-making ults. Innate abilities from the current patch are ignored unless listed.

| Hero | Q | W | E | R | Simplifications |
|---|---|---|---|---|---|
| Invoker (`invoker`) | Quas / Wex / Exort orbs, Invoke (R), D/F invoked slots | all 10 spells | | | Port the trainer's spell rules. Forge Spirit = summon that follows the hero and attacks its target (the one AI-summon exception). Ice Wall = slow zone segments. Tornado lifts (invuln + stun), Cataclysm/Aghanim out. |
| Sven | Storm Hammer (proj AoE stun) | Great Cleave (passive) | Warcry (armor + ms aura burst) | God's Strength (dmg buff) | |
| Lina | Dragon Slave (line nuke) | Light Strike Array (delayed AoE stun) | Fiery Soul (stacks AS/MS on cast) | Laguna Blade | |
| Lion | Earth Spike (line stun, lifts) | Hex | Mana Drain (channel) | Finger of Death | Finger: no kill stacks |
| Crystal Maiden | Crystal Nova | Frostbite (root + DoT) | Arcane Aura (global mana regen) | Freezing Field (channel, random explosions + slow) | |
| Axe | Berserker's Call (taunt + armor) | Battle Hunger (DoT + slow until kill) | Counter Helix (chance on attacked, AoE pure) | Culling Blade (execute threshold, ms buff) | |
| Sniper | Shrapnel (charges, AoE slow DoT zone) | Headshot (passive proc mini-stun + knockback-free) | Take Aim (passive range) | Assassinate (delayed long-range proj, mini-stun) | Take Aim active out |
| Zeus | Arc Lightning (bounce) | Lightning Bolt (stun, reveals) | Static Field (passive % current hp on cast) | Thundergod's Wrath (global) | Heavenly Jump out |
| Drow Ranger | Frost Arrows (auto: slow on attack, mana) | Gust (cone silence + knockback) | Multishot → volley: 3 arrows cone on next attacks (channel 1.5 s) | Marksmanship (passive agi + crit-ish proc) | |
| Juggernaut | Blade Fury (spin, magic immune, AoE) | Healing Ward (stationary heal aura ward, no AI) | Blade Dance (crit) | Omnislash (jumps between nearby enemies) | |

Ability keys are whatever the game data uses (`sven_storm_bolt`, `lion_impale`, `zuus_*`, `drow_ranger_wave_of_silence`, `juggernaut_omni_slash`, ...); `shared/heroes.js` lists them in slot order.

## Items (simple set)
Consumables: tango, flask (Healing Salve), clarity, faerie_fire, enchanted_mango, tpscroll.
Basics: branches, gauntlets, slippers, mantle, circlet, ring_of_protection, quelling_blade, blades_of_attack, broadsword, claymore, chainmail, ogre_axe, mithril_hammer, blade_of_alacrity, staff_of_wizardry, boots, gloves, ring_of_regen, sobi_mask, belt_of_strength, boots_of_elves, robe, magic_stick.
Built: magic_wand, bracer, wraith_band, null_talisman, phase_boots, power_treads (toggle str/agi/int), lesser_crit (Crystalys), black_king_bar, blink.
Rules: buy only within SHOP_RANGE of your fountain shop (no courier, no side/secret shop). 6 slots, no backpack, no stash (shop refuses when full except auto-combining into a recipe). Recipes auto-combine. Sell 50% (100% within 10 s). TP Scroll: 3 s channel, to the allied building/fountain nearest the target point. Blink: 1200 range, disabled 3 s after hero damage. BKB: fixed 9 s → decreases 1 s per use to 6 s.

## Match rules
- Real map, three lanes, creeps from 0:00 every 30 s (3 melee + 1 ranged, siege every 5th wave). No neutrals, no runes, no Roshan, no outposts, no wards, no couriers, no glyph, no buyback, no talents, no Aghanim's. Day/night 5/5 min (vision only + lighting).
- Tier protection: T2 invulnerable until T1 of the same lane dies, T3 until T2, barracks until T3, T4 until any lane's T3 falls, ancient until both T4s fall. Win = enemy ancient destroyed.
- Fog of war is client-side (server sends everything).
- Server authoritative, no client prediction (Dota itself doesn't predict unit movement).
