# Pixel2Dota — architecture contract

5v5 Dota on the real Dota 2 map, browser client (Three.js, 2.5D pixel art), authoritative Colyseus server. Scope: custom lobby + match only. No demo, replay, ranked, learn tab, profile.
This file is the contract between agents. If you need to change a shape here, change it here first and say so in your report.

## Repo layout (npm workspaces, plain JS ESM everywhere, no TypeScript, no decorators)
```
shared/            pure data + helpers imported by server AND client (no DOM, no node-only APIs)
  data/dotaworld.js  real map (from InvokerTrainer, extracted from game files) — DO NOT EDIT
  data/*.json        baked from local game files by tools/bake.mjs — DO NOT EDIT BY HAND
  data/lanes.js      lane waypoints (world coords)
  map.js             decoded grid: tile/height/walkable queries
  protocol.js        message names, order types, event types, status bits, anims  (contract, owned by orchestrator)
  constants.js       Dota rules constants (contract, owned by orchestrator)
  heroes.js          hero roster (10 keys, display names, ability slot layout)
  test/*.test.js     node --test
server/src/
  index.js           Colyseus server + express static (serves client/dist in prod), port 2567
  room/MatchRoom.js  lobby + match room ("match"), schema sync, events broadcast
  room/schema.js     Colyseus schema (schema()/defineTypes, no decorators)
  sim/               authoritative simulation, pure JS, NO colyseus imports (node-testable)
  sim/abilities/     one file per hero: <short>.js (invoker.js, sven.js, ...)
server/test/*.test.js
client/              Vite app
  index.html
  sandbox.html       offline renderer sandbox (mock world, no server)
  src/main.js        boot: lobby screen -> game screen
  src/net/           Colyseus SDK client wrapper, state mirror, interpolation
  src/render/        Three.js renderer (terrain, sprites, trees, buildings, post, particles, lights, fog)
  src/render/fx/     spell/item VFX keyed by ability key
  src/art/           sheet loader/atlas builder; src/art/sheets/*.js generated pixel sheets
  src/ui/            DOM HUD, lobby, shop, minimap, scoreboard
  src/input.js       Dota controls -> orders
tools/
  bake.mjs, vpk.mjs, vdf.mjs   game-file bake (local Steam install)
  art/*.mjs                    pixel-art generators -> client/src/art/sheets/*.js
reference/trainer/   read-only copies of InvokerTrainer code for porting (do not import at runtime)
docs/                ARCHITECTURE.md (this), DECISIONS.md, PROGRESS.md
```
Commands (two terminals): `npm run dev:server` (node --watch), `npm run dev:client` (vite :5173, connects to ws://<host>:2567), `npm test`, `npm run bake`.

## Coordinates and scale
- Sim/world: Dota world units. x east, y north. Map box x,y in [-8832, 8832]. Ground height z from `shared/map.js heightAt(x,y)` (elev tier * 128, ramps interpolate).
- Three.js: `X = x`, `Y = z` (up), `Z = -y` (north is -Z). 1 Three unit = 1 Dota unit.
- Pixel density: **6 Dota units per art pixel** everywhere (sprites and terrain), same as the trainer. A 48u tile = 8x8 px. Invoker sheet frame 26x28 px = 156x168 u.
- Tiles: `shared/map.js` decodes `DOTAWORLD` (368x368 tiles of 48u, row 0 = north): `type` 0 grass, 1 tree, 2 wall/cliff, 4 road, 5 water, 6 outside; `elev` 0 river / 1 lanes+jungle / 2 high ground; `ramp` flag.

## Camera (from the game files: client.dll convar defaults)
- `dota_camera_distance` default used here: **1134** (`dota_camera_distance_min` = 1134, convar `dota_camera_distance` = 1200 is the zoom-out cap).
- Pitch **60°** below horizontal at default (`dota_camera_pitch_max` 60; `pitch_min` 38 when fully zoomed in).
- FOV **70°** (`dota_camera_fov_max` 70, `fov_min` 45). Source FOV is horizontal at 4:3, so Three.js vertical fov = 2·atan(tan(35°)·0.75) ≈ **55.4°**, constant across aspect ratios.
- Yaw fixed (looking north). Camera = target + distance·(0, sin(pitch), cos(pitch)) in Three coords (behind = +Z/south, above). Target z follows terrain height smoothly.
- Zoom (wheel): distance 1134..1200 normal play (Dota), dev zoom range wider behind a flag. Interpolate pitch/fov between (38°,45°) at 900 and (60°,70°) at 1134.

## Rendering (2.5D: terrain is 3D, sprites are 2D)
Art direction = InvokerTrainer: chunky pixel art, dark outlines, Bayer-quantised light, bloomy emissive spells in the orb palette, strong rim light on units/trees. Read `reference/trainer/LIGHTING-v6.md`.
- **Terrain = tile sprites on a 3D heightfield.** Each 48u tile top is a quad at its elevation (z = elev·128; ramp tiles slope using corner heights). Between neighbouring non-ramp tiles of different elevation, emit vertical **cliff wall quads** textured with pixel cliff-face tiles (128u high ≈ 21 px). Tops use a pixel tile atlas (8x8 px tiles + autotile edge variants) by type: grass (Radiant lush / Dire dead blend by side of the x+y diagonal), road dirt, water (animated, at river z, emissive specks), cliff rock top, forest floor under trees, outside = void dark. Chunked merged BufferGeometry, custom ShaderMaterial (NearestFilter, lights, ambient day/night, fog-of-war texture).
- **Sprites = 2D billboards**: units, creeps, buildings, trees, projectiles. Screen-aligned quads anchored at the sheet `anchor` (feet) on the ground point; depth computed as if the quad were a vertical plane at the foot (so sprites occlude/are occluded by cliffs correctly). West frames = mirrored east. Atlas textures, NearestFilter, alpha-test (no blending) for bodies.
- **Pixel pipeline**: render scene into a low-res `WebGLRenderTarget` (NearestFilter; height ≈ visible-height-in-units/6 · pixelScale, pixelScale setting 1|2, default chosen for looks) → bloom (UnrealBloomPass or custom, threshold so only HDR emissive > 1 blooms) → final pass: Bayer quantise of lighting (9-level matrix idea from trainer gl.js) + nearest upscale to the canvas. HP bars, names, damage numbers drawn after lighting (unlit, crisp).
- **Lights**: ≤ 32 point lights per frame (uniform arrays) from spells/items/orbs/fountain/tower lamps, sorted by contribution; colours from the palette (Quas cyan .35,.68,1; Wex magenta .66,.36,1; Exort orange 1,.6,.2; Sun Strike gold; fire orange-red; ice cyan-white; lightning blue-white). Day/night ambient.
- **Rim light**: unit/tree/building pixels on the silhouette edge facing a light (step 1-2 px toward the light in sprite space; alpha 0 there = edge) get light colour mixed toward white; key rim from a fixed moon/sun direction always on. Rim never on ground. 2-level quantised like the trainer.
- **Particles**: GPU instanced additive quads (pool ≥ 20k), HDR colours so they bloom, pixel-snapped sizes; emitters driven by fx events. Extensive: every spell, attack projectile, death, level-up, TP, fountain, creep spawn has particles.
- **Fog of war**: client-side. Team vision grid (tile resolution) from allied units' day/night vision radius; can't see higher elevation from lower; trees block. Unexplored/not-visible terrain darkened, enemy units not drawn. (Trust gap: server sends all units — accepted for a fan project.)

## Network
- Server authoritative, no client prediction. Sim at 30 Hz fixed dt (accumulator), `patchRate` 50 ms. Client renders units interpolated ~100 ms behind.
- Room name `"match"`. `roomId` = 4-letter uppercase code (set in onCreate). Join by code (`joinById`) or from a list of open lobbies. Max 10 players + bots fill slots.
- State is plain Colyseus schema (`server/src/room/schema.js`, built with `schema()` / `defineTypes`). Client uses `@colyseus/sdk` 0.18 (reflection decoding — client needs no schema classes).
- Spell/attack VFX, projectiles, damage numbers etc. are **events**: the room broadcasts `"fx"` once per tick with an array of event objects (only if non-empty).

### Schema
```
Ability  { key:string, level:uint8, cd:float32 (remaining s), cdMax:float32, mana:uint16, flags:uint8 }   flags: ABF_* in protocol.js
Item     { key:string, charges:uint16, cd:float32, cdMax:float32 }        empty slot: key ""
Unit     { id:string, kind:string, key:string, team:int8, owner:string,
           x:float32, y:float32, facing:float32 (radians, 0 = east, CCW), anim:string, animSeq:uint16, animRate:float32,
           hp:float32, maxHp:float32, mana:float32, maxMana:float32, level:uint8, status:uint32, ms:uint16,
           // heroes only (left default on other units):
           xp:uint32, str:uint16, agi:uint16, int:uint16, dmgMin:uint16, dmgMax:uint16, dmgBonus:int16, armor:float32,
           atkRate:float32 (attacks/s), atkRange:uint16, skillPoints:uint8, respawn:float32 (s left, 0 = alive),
           orbs:string ("QWE"-style, Invoker only), abilities:[Ability], items:[Item] (6), buffs:[string] ("key:secondsLeft") }
Player   { sid:string, name:string, team:int8 (-1 unassigned), slot:int8, hero:string, isBot:boolean, isHost:boolean,
           connected:boolean, heroId:string, gold:uint32, kills:uint16, deaths:uint16, assists:uint16, lh:uint16, dn:uint16 }
MatchState { phase:string ("lobby"|"game"|"ended"), code:string, time:float32 (game clock s; starts at -PREGAME), night:boolean,
             winner:int8 (-1), players: Map<Player> (by sid; bots "bot:<team>:<slot>"), units: Map<Unit> (by id), treesDown:[uint16] }
```
The sim keeps plain objects with the **same field names**; the room copies changed fields into schema each tick.

### Client -> server messages (names in `shared/protocol.js` MSG)
- `lobby`: `{t:"name",name}` `{t:"slot",team,slot}` `{t:"hero",key}` `{t:"bot",team,slot}` (host: add bot) `{t:"kick",team,slot}` (host) `{t:"fill"}` (host: bots in every empty slot, random heroes) `{t:"start"}` (host).
- `order`: `{t, ...args, q?:bool}` with `t` in ORDER: `move{x,y}` `attack{id}` `amove{x,y}` `stop` `hold` `cast{slot, id?|x?,y?}` `item{slot, id?|x?,y?}` `learn{slot}` `buy{key}` `sell{slot}` `swap{a,b}`. `q` = shift-queue.
- `chat`: `{text}`.

### Server -> client
- State patches (above).
- `fx`: array of events, `e` in EV (protocol.js):
  `atk{s,t,k,sp}` attack launched (k = projectile art key or "" for melee; sp = speed) · `hit{s,t,d,ty,c}` damage dealt (ty "phys"|"mag"|"pure", c = crit) ·
  `spell{k,s,t?,x?,y?,x2?,y2?,r?,dur?,lv}` ability/item VFX trigger (k = ability/item key) · `proj{id,k,s,t?,x,y,x2?,y2?,sp}` spell projectile start · `projEnd{id}` ·
  `death{t,k}` · `kill{killer,victim,gold}` (pids) · `gold{t,g}` (last-hit popup) · `lvl{t}` · `heal{t,a}` · `mana{t,a}` · `tree{i}` cut · `treeGrow{i}` ·
  `blink{s,x,y,x2,y2}` · `tp{s,x,y,dur}` · `invoke{s,k}` · `msg{text}` · `chat{p,text}` · `end{winner}`.

## Simulation (server/src/sim, pure JS)
```
const w = new World({ seed });           // loads shared data + map
w.addHero({ pid, team, heroKey, bot })   // -> unit
w.order(pid, order)                      // validated, queued
w.step(dt)                               // dt = 1/30
w.drainEvents()                          // -> [event]
w.units  (Map id -> unit plain object), w.players (Map pid -> player plain object), w.time, w.night, w.winner, w.treesDown (Set)
```
Modules: `world.js` (loop, spawns, clock, win), `units.js` (factory: hero/creep/building stats), `nav.js` (A* on 48u tiles, 8-dir + string pulling, trees + buildings block, port trainer nav.js), `move.js` (steering, unit separation, turn rate), `combat.js` (attack cycle: acquisition, attack point, backswing, projectiles, armor/MR, crit/cleave hooks, deny < 50% hp), `status.js` (modifiers: stun, root, silence, hex, slow, haste, magic immune, invis, invuln, disarm, taunt, dot, stat buffs, auras; status bitmask), `heroes.js` (attributes -> stats, XP/levels, skill points, respawn, gold/bounties), `creeps.js` (waves every 30 s from 0:00: 3 melee + 1 ranged, +1 siege every 5th wave, lane waypoints, aggro rules), `buildings.js` (towers T1-T4, rax, ancient, fountain heal/attack, tier protection: next tier invulnerable until previous falls; ancient invulnerable until both T4 die; win when an ancient dies), `items.js` (shop, recipes, stats, actives), `abilities/index.js` (registry: `{ key: { cast(w,u,ab,target), passive?(w,u,ab), tick?(w,u,ab,dt) } }`), `bots.js` (lane AI), `events.js`.
Rules constants live in `shared/constants.js`. Values (damage, cooldowns, mana, ranges) come from `shared/data/abilities.json` / `items.json` / `heroes.json` / `units.json` — never hard-code what the bake provides.

## Shared data shapes (tools/bake.mjs output)
- `heroes.json`: `{ "npc_dota_hero_lina": { short, name, attr ("str"|"agi"|"int"|"all"), str, agi, int, strGain, agiGain, intGain, dmgMin, dmgMax, armor, mr, ms, turnRate, atkRange, projSpeed, bat, atkPoint, baseAS, hp, hpRegen, mana, manaRegen, visionDay, visionNight, hull, abilities: [keys in slot order] } }`
- `abilities.json`: `{ key: { maxLevel, ult, behavior:[flags], targetTeam, targetType, damageType, castRange:[per lvl], castPoint:[..], cooldown:[..], manaCost:[..], channel:[..], values:{ name:[per lvl] } } }` (arrays always, length = levels; single values repeated).
- `items.json`: `{ key: { cost, recipe:null|{ cost, parts:[keys] }, stats:{ str,agi,int,dmg,armor,as,ms,msPct,hp,mana,hpRegen,manaRegen,mr }, cooldown, manaCost, castRange, behavior, values:{...}, charges, stack, consumable, sell } }` (only the items in DECISIONS.md, plus parts).
- `units.json`: creeps (melee/ranged/siege per team), towers by tier, barracks melee/ranged, fort, fountain: `{ hp, hpRegen, mana, armor, mr, dmgMin, dmgMax, bat, atkPoint, atkRange, projSpeed, ms, goldMin, goldMax, xp, vision, hull }`.
- `meta.json`: `{ source: "local game files", patch, date, vpk }`.

## Art sheets (client/src/art/sheets/<name>.js)
Same ASCII format as the trainer: `export default { pal: {ch: '#rrggbb'|'#rrggbbaa'}, anchor: [x, y], frames: { key: [rows] } }`, 1 char = 1 px, `.` = transparent.
- Units: frames `${anim}_${dir}_${i}`, anim in `idle|walk|attack|cast|stunned` (`death` optional), dir `s|n|e` (west = mirrored east), plus `portrait`. Heroes ~24-30 px tall chibi like `invoker.js`; creeps ~14-18 px; same outline/shading rules (tools/art/lib.mjs).
- Optional emissive: a second palette map `emit: { ch: strength }` for glowing pixels (eyes, orbs, weapons) — renderer boosts those into HDR for bloom.
- World: `tiles.js` (terrain tile atlas frames), `trees.js`, `buildings.js` (tower_radiant/dire, rax_melee/ranged per team, ancient per team, fountain, shop), `creeps.js`, `icons.js` (ability + item icons 16x16 or 24x24), `fx.js` (projectiles, small particle stamps).
- Generators live in `tools/art/*.mjs`; generated files say so in their header.

## Client code interfaces
```
// client/src/art/atlas.js (render)
loadSheets() -> Promise<{ [name]: sheetDef }>          // imports client/src/art/sheets/*.js (import.meta.glob)
buildAtlas(sheets) -> { texture, emitTexture, frame(sheet, key) -> { u0,v0,u1,v1, w,h, ax,ay, flip } } // west = mirrored east

// client/src/render/index.js (render)
createRenderer({ canvas, sheets }) -> {
  resize(w, h), setTarget(x, y), zoom(delta), getTarget() -> {x, y},
  update(view, dtSeconds),             // draw one frame
  fx(events),                          // feed server "fx" events (forwards to render/fx)
  pick(screenX, screenY) -> { x, y, unitId|null },   // ground point under cursor + unit under cursor (sprite hit, alpha-tested)
  worldToScreen(x, y, z?) -> { x, y }, // css px, for DOM overlays
  setSelected(unitId), setMyTeam(team), setSetting(name, value)
}
view = { time, night, myTeam, myHeroId, treesDown:Set<number>, units: Iterable<UnitView> }
UnitView = schema Unit fields (interpolated x, y, facing) + z (heightAt) + animTime (s since anim/animSeq changed) + visible

// client/src/render/fx/index.js (fx)
createFx({ scene, particles, lights, atlas, heightAt }) -> { handle(event, view), update(dt, view) }   // one handler per ability/item key

// client/src/net/index.js (net)
createNet(endpoint) -> { listLobbies() -> Promise<[{code, players, host}]>, create(name) -> Promise<room>, join(code, name) -> Promise<room>,
  room, state, mySid, send(type, payload), onFx(cb), onChange(cb), view(nowMs) -> view (interpolated, INTERP_MS behind) }

// client/src/ui/hud.js (hud)       createHud(root, { send }) -> { update(state, myHeroUnit, mySid), destroy() }
// client/src/input.js (hud)         createInput({ canvas, renderer, send, hud, getState }) -> { destroy() }  // Dota keys: right-click move/attack, A attack-move, S stop, H hold, Q W E R (D F) abilities, Z X C V B N items, Ctrl+key learn, F1/space center, Y lock, B/F4 shop, wheel zoom, edge pan
// client/src/ui/lobby.js (net)      createLobby(root, net, { onGameStart }) -> { destroy() }
// client/src/game.js (orchestrator) glue: net + renderer + hud + input + fx loop
```

## Ownership (one agent per area; do not edit files you don't own — note needed changes in your report)
| Area | Files |
|---|---|
| orchestrator | docs/*, shared/protocol.js, shared/constants.js, shared/map.js, shared/heroes.js, shared/data/lanes.js, tools/vpk.mjs, client/src/game.js, package.json files |
| data | tools/bake.mjs, shared/data/*.json, shared/data.js (loader), shared/test/* |
| sim | server/src/sim/** except abilities/ and items.js, bots.js; server/test/sim*.test.js |
| abilities | server/src/sim/abilities/**, server/test/abilities*.test.js |
| items+bots | server/src/sim/items.js, server/src/sim/bots.js, server/test/items*.test.js, bots*.test.js |
| net | server/src/index.js, server/src/room/**, client/src/net/**, client/src/main.js, client/src/ui/lobby*, client/index.html |
| render | client/src/render/** except fx/, client/src/art/atlas.js, client/sandbox.html, client/src/sandbox.js, client/vite.config.js |
| fx | client/src/render/fx/** |
| hud | client/src/ui/** except lobby*, client/src/input.js |
| art | tools/art/**, client/src/art/sheets/** |
