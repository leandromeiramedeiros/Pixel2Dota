# Progress — definition of done

- [x] Data bake from local game files (heroes, abilities, items, units) + map/lanes module
- [x] Art: hero sheets, world sprites, ability/item icons, fx stamps
- [x] Custom lobby: create (4-letter code), list open lobbies, join by code, Radiant/Dire 5 slots, hero pick (unique), host adds/fills bots, host starts
- [x] Match on the real Dota map: 3 lanes, creep waves, 22 towers, 12 barracks, 2 ancients, fountains (heal + attack), shop at fountain
- [x] 13 heroes playable incl. full Invoker (orbs, invoke, 10 spells); others with 4 abilities each (Pudge, Mirana, Rubick added in v3; Rubick Spell Steal incl. Invoker spells)
- [x] Neutral camps (28, 4 tiers), Roshan + Aegis, observer/sentry wards
- [x] ~38 items: buy/sell/recipes, stats, actives
- [x] XP, levels, skill points, gold (passive, last hits, kills), deaths, respawn
- [x] Bots fill empty slots (laning, fighting, retreating, buying)
- [x] Win when an ancient dies; end screen; back to lobby (10-bot headless match: Radiant win at 48:12, seed 2)
- [x] Three.js 2.5D: 3D tile terrain with cliffs/ramps/water, 2D billboard sprites, Dota camera (1134 / 60° / fov 70)
- [x] Pixel pipeline: low-res RT, Bayer quantise, bloom, rim light, point lights, extensive particles
- [x] Spell VFX: GPU particle fx for all 10 heroes, items, projectiles, status visuals
- [x] Fog of war (client), minimap, HUD (portrait, hp/mana, abilities, items, gold, stats), shop UI, scoreboard, kill feed, chat
- [x] Network play verified with 2 browser clients (one per team + 8 bots; moves, casts, shop; other player's spell FX received and rendered; live win/defeat screens and Return to lobby)
- [x] Tests: `npm test` green (142)

## Measured

- Frame time (CPU+GPU, forced sync, 835x397 low-res target, mid-lane teamfight): median 2.4 ms, p95 5.3 ms on RTX 5070 Ti
- Server sim: ~0.2 ms per tick with 10 bots

## Known issues / next

- Bot-only matches are slow (~45-50 min); bots push buildings timidly
- Invoker bot levels slowly
- Art v2 approved by the creative director. v3 landed (verdicts pending): base ambiance, key-light + spell-light shadows, map-wide 3D clutter, 3D VFX pilot (Sun Strike, Laguna Blade, Freezing Field), 8-dir 2x sprite pilot (Lina)
- Multi-light shadows: up to 10 spell lights (MAX_PS) each get a real cube shadow (5 faces x 192 px, one atlas row per light; +0.75 ms/frame at 10 lights). Lights past 10 fall back to the height field. Sun/moon shadows are near-overhead (shadow.js KEY_TILT 0.3).
- Spell lighting (e7ca48d): unit sprites cast real-time shadows (key + spell cube pass); spell lights light towers/units/ground with a broad falloff. Every other spell light gets marched height-field shadows (terrain, buildings, trees, unit pillars) + a one-bounce ground-coloured fill. Knobs in render/shaderlib.js: SPELL_REACH 1.5, SPELL_GAIN 1.5, cube shadow floor .03, height-field floor .1, uBounceK .4
- v3 next: Lina redo (grounded, Dota silhouette), then 8-dir 2x sprites for the other 12 heroes; remaining ~37 spells to 3D fx; richer spell icons
- Pudge / Mirana / Rubick use stand-in bodies (BODY_STANDIN in render/actors.js) and have no portraits yet
- Fog of war quite dark
- Weak sniper_headshot and gold icons
- Neutrals/Roshan/wards (server/src/sim/neutrals.js, wards.js): no neutral abilities, single Roshan pit, no HUD ward stock display; sentry true sight 1050 and observer restock 135 s are the baked values
