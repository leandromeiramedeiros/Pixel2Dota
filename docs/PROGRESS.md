# Progress — definition of done

- [x] Data bake from local game files (heroes, abilities, items, units) + map/lanes module
- [x] Art: hero sheets, world sprites, ability/item icons, fx stamps
- [x] Custom lobby: create (4-letter code), list open lobbies, join by code, Radiant/Dire 5 slots, hero pick (unique), host adds/fills bots, host starts
- [x] Match on the real Dota map: 3 lanes, creep waves, 22 towers, 12 barracks, 2 ancients, fountains (heal + attack), shop at fountain
- [x] 10 heroes playable incl. full Invoker (orbs, invoke, 10 spells); other 9 with 4 abilities each
- [x] ~38 items: buy/sell/recipes, stats, actives
- [x] XP, levels, skill points, gold (passive, last hits, kills), deaths, respawn
- [x] Bots fill empty slots (laning, fighting, retreating, buying)
- [x] Win when an ancient dies; end screen; back to lobby (10-bot headless match: Radiant win at 48:12, seed 2)
- [x] Three.js 2.5D: 3D tile terrain with cliffs/ramps/water, 2D billboard sprites, Dota camera (1134 / 60° / fov 70)
- [x] Pixel pipeline: low-res RT, Bayer quantise, bloom, rim light, point lights, extensive particles
- [x] Spell VFX: GPU particle fx for all 10 heroes, items, projectiles, status visuals
- [x] Fog of war (client), minimap, HUD (portrait, hp/mana, abilities, items, gold, stats), shop UI, scoreboard, kill feed, chat
- [x] Network play verified with 2 browser clients (one per team + 8 bots; moves, casts, shop; other player's spell FX received and rendered; live win/defeat screens and Return to lobby)
- [x] Tests: `npm test` green (100)

## Measured

- Frame time (CPU+GPU, forced sync, 835x397 low-res target, mid-lane teamfight): median 2.4 ms, p95 5.3 ms on RTX 5070 Ti
- Server sim: ~0.2 ms per tick with 10 bots

## Known issues / next

- Bot-only matches are slow (~45-50 min); bots push buildings timidly
- Invoker bot levels slowly
- Art v2 awaiting creative-director verdict (docs/ART-DIRECTION.md; shots docs/shots/v2-final-*.jpg)
- Art v2 leftovers: Sun Strike impact blows out white; ramp/stair tiles still old striped art; no directional beam cones; water bokeh is glints not discs; Dire broadleaf canopies read as flat blue blobs at night (v2-final-dire-night.jpg); unexplored fog at night is near-black (v2-final-forest-night-fog.jpg)
- Fog of war quite dark
- Lobby footer below the fold on short screens
- Scoreboard overlap at HUD scale 2
- Weak sniper_headshot and gold icons
