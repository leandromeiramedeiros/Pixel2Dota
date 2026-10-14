# Decisions in force (one line each, with the why)

## Sources
- Map `shared/data/dotaworld.js` + lanes: copied from InvokerTrainer's extractor (`reference/trainer/dota_extract.py`); read-only so sim and client agree forever.
- Numbers: `tools/bake.mjs` reads the local Dota 2 install VPK (`npc_heroes`, `npc_abilities`, `items`, `npc_units`); the sim never hard-codes what the bake provides.
- Camera convars read from `client.dll`: distance 1134 / pitch 60 / fov 70 (horizontal at 4:3). We zoom IN only (1134 is the desktop max): the director wants the
  showcase close-up, not a wider view; touch starts at 1450 because the phone HUD rings the screen.
- Ability slot order is authored in `shared/heroes.js`, not read from the game files (current-patch files add innates/facets/shards we skip).

## Roster (13) and simplifications
Criterion: every hero other than Invoker uses at most two mechanics beyond the shared status system. No illusions, no terrain ults, no Aghanim's, no talents.
| Hero | Simplifications |
|---|---|
| Invoker | Trainer spell rules; Forge Spirit = summon that follows and attacks (the one AI-summon exception); Ice Wall = slow segments; Tornado = invuln + stun; no Cataclysm |
| Sven, Lina, Crystal Maiden, Axe, Juggernaut | as in Dota (Healing Ward is a stationary heal aura, no AI) |
| Lion | Finger: no kill stacks |
| Sniper | Take Aim active out |
| Zeus | Static Field is innate (never skill-pointed, `learnReq 999`); Heavenly Jump out |
| Drow Ranger | Multishot = 3-arrow volley on the next attacks (1.5 s channel) |
| Pudge | Hook drags the first unit hit; Flesh Heap = baked active (magic resist) + str stacks on kills only; Dismember pull not modelled |
| Mirana | Starstorm instant sweep; Arrow stun grows with distance; Leap charges; Moonlight Shadow fades allies (no bonus damage) |
| Rubick | Telekinesis lands in place; Spell Steal copies the victim's last cast into D (previous to F), level scaled from Spell Steal's level; Invoker spells read the CASTER's orb levels |
Keys are the game's (`sven_storm_bolt`, `zuus_*`, ...); `shared/heroes.js` is the only roster list (tests, bake, lobby, fx coverage all read it).

## Items
Consumables `tango flask clarity faerie_fire enchanted_mango tpscroll ward_observer ward_sentry`; basics `branches gauntlets slippers mantle circlet ring_of_protection
quelling_blade blades_of_attack broadsword claymore chainmail ogre_axe mithril_hammer blade_of_alacrity staff_of_wizardry boots gloves ring_of_regen sobi_mask
belt_of_strength boots_of_elves robe magic_stick`; built `magic_wand bracer wraith_band null_talisman phase_boots power_treads lesser_crit black_king_bar blink`; `aegis` (Roshan drop).
- Buy only within SHOP_RANGE of your fountain shop: no courier, side or secret shop (keeps the match loop simple). 6 slots, no backpack/stash; recipes auto-combine; sell 50 % (100 % within 10 s).
- TP Scroll 3 s channel to the nearest allied building; Blink 1200, disabled 3 s after hero damage; BKB 9 s -> 6 s.

## Match rules
- Real map, 3 lanes, waves every 30 s from 0:00 (3 melee + 1 ranged, siege every 5th). Neutral camps (4 tiers), Roshan + Aegis, observer/sentry wards ARE in.
- Out: runes, outposts, couriers, glyph, buyback, talents, Aghanim's, neutral abilities, mega creeps, backdoor protection, building bounty.
- Tier protection: T2 invulnerable until the lane's T1 dies, ... barracks until T3, T4 until any T3, ancient until both T4. Win = ancient destroyed.
- Day/night 5/5 min (vision + lighting only). Fog of war is client-side (server sends everything; accepted for a fan project).
- Server authoritative, no client prediction (Dota itself doesn't predict unit movement); 30 Hz patches, adaptive interpolation delay.
- Rejoining a live match takes your hero back (seat id or unique name); boot auto-rejoins the last live match (director approved).
- Spectators: host toggle, up to 6, see both teams' vision, cannot order.

## Rendering
- Sprites sort per pixel at true height above the foot (upright card) so 3D fx, lights and meshes occlude units consistently; ground fx are 3D discs at terrain height.
- Ring telegraphs are geo3d discs + a ground light (`c.ringDecal`), never the stretched `decal_ring_target` sprite (read as a blocky staircase).
- No ordered dither on geo3d fx / beams (read as a fine white grid): stepped bands. Bayer quantise stays on terrain/sprite lighting (Trainer look).
- Only spells and items cast big lights; attacks/towers/creeps under the bloom threshold. Fight whiteouts solved by exposure + hue-preserving roll-off, not by dimmer spells.
- Graphics presets Low/Medium/High (Low default on phones, FPS governor auto-drops) instead of individual toggles.
