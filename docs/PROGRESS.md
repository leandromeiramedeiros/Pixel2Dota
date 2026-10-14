# Progress — definition of done

- [ ] Data bake from local game files (heroes, abilities, items, units) + map/lanes module
- [ ] Custom lobby: create (4-letter code), list open lobbies, join by code, Radiant/Dire 5 slots, hero pick (unique), host adds/fills bots, host starts
- [ ] Match on the real Dota map: 3 lanes, creep waves, 22 towers, 12 barracks, 2 ancients, fountains (heal + attack), shop at fountain
- [ ] 10 heroes playable incl. full Invoker (orbs, invoke, 10 spells); other 9 with 4 abilities each
- [ ] ~38 items: buy/sell/recipes, stats, actives
- [ ] XP, levels, skill points, gold (passive, last hits, kills), deaths, respawn
- [ ] Bots fill empty slots (laning, fighting, retreating, buying)
- [ ] Win when an ancient dies; end screen with scoreboard; back to lobby
- [ ] Three.js 2.5D: 3D tile terrain with cliffs/ramps/water, 2D billboard sprites, Dota camera (1134 / 60° / fov 70)
- [ ] Pixel pipeline: low-res RT, Bayer quantise, bloom, rim light, point lights, extensive particles
- [ ] Fog of war (client), minimap, HUD (portrait, hp/mana, abilities, items, gold, stats), shop UI, scoreboard, kill feed, chat
- [ ] Network play verified with 2 browser clients
- [ ] Tests: `npm test` green
