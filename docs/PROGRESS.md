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

## Open
1. **Voxel conversion:** batches 1-7 in [VOXEL.md](VOXEL.md) "Conversion order" (batch 0 foundation done). The last batch removes the sprites and the
   fallbacks.
2. **Feature parity**, in priority order. Each item lands with sim tests and a bot behaviour.
   - Runes (bounty, power, water, wisdom), glyph, buyback, courier (with side / secret shops).
   - Talents, Aghanim's Scepter / Shard, the real hero mechanics behind the DECISIONS simplifications (illusions, terrain ults, etc.).
   - Neutral abilities, neutral items, outposts, mega creeps, backdoor protection, building bounty, multiple Roshan pits / Roshan behaviour.
   - Full item list (from the bake), stash.
3. **Roster:** expand past 13 heroes, one hero per agent (EXTENDING "Add a hero").
4. **Tools:** generic voxel tools (`check / shot / portrait <short|all>`), deterministic sandbox shots (URL-pinned unit, camera and zoom, and an A/B PNG
   runner), and skills (`/add-hero`, `/art-review`, `/verify`) as thin wrappers over EXTENDING.
5. **Checks still open:** iPhone retest (rejoin, rubber-banding, Low vs High, touch aim), the Render cold-start UX, and a camera feel play pass.
6. **Perf reference:** about 2.4 ms median frame (RTX 5070 Ti, 835x397 target, mid-lane fight); the sim takes about 0.2 ms per tick with 10 bots.
