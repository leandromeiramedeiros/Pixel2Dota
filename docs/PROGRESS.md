# Current state and open items

History lives in `git log`. This page lists only what exists now and what is open.

## Done
- **Match:** the real map, lanes, creeps, 22 towers, 12 barracks, ancients, fountains and the shop. Also neutral camps, Roshan + Aegis, wards, about 41 items,
  XP / gold / respawn, and the win and end screens.
- **Heroes:** 13 playable (full Invoker; Rubick steals every roster spell).
- **Bots:** lane, fight, retreat, buy and team push. A 10-bot headless match ends in about 24-30 min (`node tools/fullmatch.mjs`).
- **Net:** a 30 Hz authoritative sim with adaptive interpolation, rejoin, spectators, and a lobby with codes / an open list / invite links.
  Public deploy: Pages client + Render server.
- **Render:** voxel heroes (Lina), voxel ground and tufts, 3D buildings / trees / clutter, light pool with cube-shadowed spell lights, key-light shadows,
  bloom / DoF / SSR / atmosphere post, 3D spell fx, fog of war, spell vision and wind, quality presets.
- **Input:** desktop, and touch (joystick, full-screen thumb aim with edge pan, spell / item wheel, bag, peek, pinch). The camera director lives in
  `render/camdir.js`.
- **Tests:** `npm test` is green.

## Open: phases as agent bursts (5-7 agents each)
Routing: Opus medium = likeness / art / cross-cutting sim; Sonnet high = well-specified features with tests; Haiku high = verification, docs, data wiring.
Each burst merges into `voxel` before the next one starts. Each feature lands with sim tests + bot behaviour + HUD. Hero agents own model + spell FX, with an OG-vs-ours FX sheet for the director.
- **Burst 0 (running):** FX sheet tool (`tools/fx/`), Invoker 3D FX + geo3d primitives + orb fix, Dota shop layout, spell-immunity pass.
  Merge order: sheet tool -> Invoker FX -> shop -> immunity.
- **Burst 1 (7):** Opus x3 FX for Pudge, Crystal Maiden and Juggernaut; Opus x3 model + FX for Axe, Lion and Sven; Haiku x1 verifier (`npm test`, `vox:check all`, portraits, docs prune).
- **Burst 2 (7):** Opus x5 model + FX for Drow Ranger, Mirana, Rubick, Sniper and Zeus; Sonnet x2 for runes + glyph + buyback, and courier + side / secret shops.
- **Burst 3 (6-7, Sonnet):** talents; Aghanim's Scepter / Shard; the DECISIONS simplifications restored to the real mechanics (2 agents, split by hero);
  neutral items / abilities / outposts; mega creeps + backdoor + building bounty + Roshan behaviour; full item bake + stash; Haiku docs + tests.
- **Burst 4:** voxel conversion batches 1-7 ([VOXEL.md](VOXEL.md)). Opus where likeness matters (creep variants, neutrals, Roshan, courier), Sonnet for
  buildings and mechanical ports. The last agent removes the sprites and the fallbacks.
- **Burst 5+:** roster expansion, 5-7 heroes per burst (Opus each: model + FX + sim + bot), plus one Haiku verifier.
- **Main session with the director, not agents:** iPhone retest (rejoin, rubber-banding, Low vs High, touch aim), Render cold-start UX, camera feel pass.
- **Perf reference:** about 2.4 ms median frame (RTX 5070 Ti, 835x397 target, mid-lane fight); the sim takes about 0.2 ms per tick with 10 bots.
