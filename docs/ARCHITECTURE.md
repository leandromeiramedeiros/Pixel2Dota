# Architecture — core concepts and contracts

5v5 Dota on the real Dota 2 map. Authoritative Colyseus server (30 Hz sim), Three.js 2.5D pixel-art client. Custom lobby + match only.
The code is the source of truth; every module's header comment is its contract. This file holds only what you need to know before touching
anything. To add a hero / item / spell fx / quality setting, see [EXTENDING.md](EXTENDING.md).

## Repo layout (npm workspaces, plain JS ESM, no TypeScript)
```
shared/              imported by server AND client (no DOM, no node-only APIs)
  heroes.js          roster: hero key -> { short, name, abilities (slot order), keys, invoked?, stolen? }   <- add heroes here first
  protocol.js        wire contract: MSG, ORDER, EV, ST (status bits), ABF (ability flags), KIND, ANIM, TEAM, TICK_HZ
  constants.js       Dota rules constants + CAMERA
  data.js            DATA = { heroes, abilities, items, units, meta } + abilityValue/abilityField/itemValue helpers
  data/*.js          baked from the local game files by tools/bake.mjs (never edit by hand unless no install is available)
  data/dotaworld.js  the real map grid (from InvokerTrainer) — DO NOT EDIT;  data/lanes.js lane waypoints
  map.js             decoded grid: tile type / elevation / height / walkable queries
server/src/
  index.js           Colyseus + express (serves client/dist), PORT 2567, /health, /lobbies
  room/MatchRoom.js  lobby + match room: join/rejoin seats, sim -> schema sync, fx broadcast
  room/schema.js     Colyseus schema (schema()/defineTypes, no decorators)
  sim/               authoritative simulation, pure JS, no colyseus imports (node-testable). API: sim/API.md
  sim/abilities/     one file per hero: <short>.js, auto-loaded for every roster hero
client/src/
  main.js, game.js   boot (lobby -> match) and match glue (net + renderer + hud + input + touch + menu + fx loop)
  net/               Colyseus client wrapper, snapshot interpolation (clock.js), rejoin
  render/            Three.js renderer; fx/ = per-hero spell VFX (fx/<short>.js); quality.js presets; wind.js gusts
  art/atlas.js       sheet loader + atlas;  art/sheets/*.js generated pixel sheets (heroes, world, icons, fx stamps)
  ui/                DOM HUD, lobby, shop, minimap, scoreboard, menu, touch controls (touch.js)
  input.js           desktop mouse + keyboard -> orders
  sandbox.html       offline renderer sandbox (sandbox.js + fxdemo.js: fire any spell without a server)
tools/
  bake.mjs           game-file bake (needs a local Dota 2 install): shared/heroes.js roster + ITEM_NAMES -> shared/data/*.js
  art/heroes/*.mjs   hero sheet generators (rig.mjs + lib3d.mjs SDF renderer -> 8-dir 2x sheets); contact8.mjs preview; heroes/check.mjs
  art/icons/*.mjs    ability + item icon glyphs -> sheets/icons.js;  art/world/*.mjs terrain/tree/building/creep sheets
  fullmatch.mjs, soak.mjs   headless bot matches / short sim runs
reference/trainer/   read-only InvokerTrainer code + LIGHTING-v6.md (never imported at runtime)
```
Commands: `npm test` (node --test over shared/server/client), `npm run build` (client/dist), `node server/src/index.js` + `npx vite client --port 5190`
(don't use `npm run dev`: its watcher respawns servers), `npm run bake`. Cheats: `node --env-file=tools/cheats.env server/src/index.js` then chat `-gold N`, `-lvlup N`, `-killancient`.
Deploy: every push to `main` rebuilds the GitHub Pages client (.github/workflows/pages.yml) and the Render server (render.yaml). Repo is public: no secrets, no Valve binaries.

## Coordinates and scale
- Sim/world: Dota units, x east, y north, map box [-8832, 8832]. Ground z from `shared/map.js heightAt(x, y)` (elevation tier x 128, ramps interpolate).
- Three.js: `X = x`, `Y = z` (up), `Z = -y`. 1 Three unit = 1 Dota unit. Every fx/wind/geo3d API takes WORLD coords and converts internally.
- Pixel density: 6 Dota units per art pixel (`ART_UNITS_PER_PX`). A 48u tile = 8x8 px. Hero sheets with `px: 2` are drawn at 2x and shown at the same world size.
- Tiles: 368x368 of 48u, row 0 = north. `type` 0 grass, 1 tree, 2 cliff, 4 road, 5 water, 6 outside; `elev` 0 river / 1 lanes / 2 high ground; `ramp` flag.

## Camera (`shared/constants.js CAMERA`, `render/camera.js`)
- Yaw fixed (north). Default distance 1134, pitch 60 deg, horizontal FOV 70 at 4:3 (vertical ~55.4 deg, constant across aspects).
- Zoom IN only: 1134 (desktop max) -> closeDistance 900 (pitch 38, fov 45) -> showcase close-up 640 (pitch 26, fov 42) that follows the hero.
- Touch: max and starting distance 1450 (`ui/touch.js T.ZOOM_FAR/ZOOM_START`), pinch in only. Sprites always scale with perspective (`spritePersp: 1`).
- `renderer.setViewInset({top, bottom})` frames the target in the part of the screen the HUD leaves free (touch); the DoF focus band follows.

## Network
- Server authoritative, no client prediction. Sim 30 Hz fixed step (own accumulator in MatchRoom). Patches flushed manually once per tick (`setPatchRate(null)`).
- Room `"match"`, `roomId` = 4-letter code. 10 player seats + `SPEC_MAX` 6 spectator seats (host toggle). Bots fill empty seats.
- Rejoin: `allowReconnection` 60 s; after that a returning client reclaims its seat by stored seat id or unique name (`Player.claim`, `MatchRoom.seatFor`);
  the client boot auto-rejoins the last live match (`net/index.js` SEAT_KEY / LAST_KEY). One controller per hero: the old session is sent away.
- Interpolation: `net/clock.js` stamps each patch with server sim time mapped onto `performance.now()`; render delay adapts to measured jitter
  between 70 and 350 ms (`DELAY_MIN/MAX`). Jumps > 450 u between samples are teleports (no lerp).
- VFX, projectiles, damage numbers, chat are **events**: the room broadcasts `"fx"` once per tick with an array of `{e: EV.*, ...}` objects.
  Constructors and payloads: `server/src/sim/events.js`. Spells: `evSpell(w, key, srcId, {t,x,y,x2,y2,r,dur,lv,sub})`; `sub` = sub-event of a cast (never gusts).

### Schema (`server/src/room/schema.js`, source of truth)
`MatchState { phase, code, time, night, winner, spectators, players: Map<Player>, units: Map<Unit>, vision: Map<VisionSrc>, treesDown: [uint16] }`.
`Unit` = `id` + the `UNIT_FIELDS` list in schema.js (position, anim, hp/mana, status bits, hero stats) + `abilities: [Ability{key, level, cd, cdMax, mana, flags}]`, `items: [Item{key, charges, cd, cdMax}]`, `buffs: ["key:secondsLeft"]`.
`Player { sid, name, team, slot, hero, isBot, isHost, connected, claim, heroId, gold, kills, deaths, assists, lh, dn }`. `VisionSrc { id, team, x, y, r }`.
The sim keeps plain objects with the same field names; MatchRoom copies the `*_FIELDS` lists each tick. Add a synced field = schema + field list + sim object.

### Messages (`shared/protocol.js`)
- Client -> server: `lobby {t: LOBBY.*}`, `order {t: ORDER.*, ...args, q?}` (`move attack amove stop hold cast item learn buy sell swap`, `q` = shift-queue), `chat {text}`.
- Server -> client: state patches + `fx` events (EV: `atk hit spell proj projEnd death kill gold lvl heal mana tree treeGrow blink tp invoke msg chat end`).

## Simulation (`server/src/sim`, API in [API.md](../server/src/sim/API.md))
`World` owns units, players, clock, events. Modules: `world` (loop/spawns/win), `units` (factories from DATA), `nav` (A* on 48u tiles), `move`, `combat`
(attack cycle, armor/MR, crit/cleave hooks), `status` (modifiers + status bitmask), `heroes` (attributes, XP, gold, respawn), `creeps`, `buildings` (tier
protection, ancient win), `neutrals` (camps + Roshan), `wards`, `vision` (temporary team vision sources), `items`, `abilities/` (registry), `bots`, `orders` (cast flow).
Rules: `shared/constants.js`; numbers: DATA — never hard-code what the bake provides. Randomness: `w.rand()` only (seeded, deterministic).

## Data flow
```
game files --bake--> shared/data/*.js --> sim (numbers)        sim plain objects --MatchRoom--> schema patches --> net view (interpolated) --> renderer / HUD
                                     \-> HUD tooltips, shop     sim events (w.emit) --"fx" broadcast--> render/fx handlers, HUD feed, wind gusts
```
Fog of war is client-side (server sends everything); `state.vision` carries temporary sources (spell vision). Tooltips/shop/icons are keyed by ability/item key.

## Render systems (rules and limits for anyone adding to them)
- **Pipeline** (`render/post.js`): scene into a low-res HalfFloat target (`pixelScale` rows per art pixel; nearest) -> tilt-shift DoF blur -> bloom
  (threshold 1.4, progressive mips) -> water SSR -> final pass (adaptive exposure, hue-preserving roll-off, light-scatter halo, grade, atmospheric
  perspective, vignette, nearest upscale). DoF strength follows the camera distance (`camera.js dofForDistance`): `DOF_MIN` 0.12 at play distance, ramping
  to 1 from closeDistance down to the showcase close-up. Fight whiteouts are prevented by exposure + roll-off; keep lights hue-local rather than raising intensity.
- **Terrain** = tile sprites on a 3D heightfield with cliff walls (`terrain.js`, `terrainGeo.js`). **Buildings, trees, ground clutter are 3D instanced
  low-poly meshes** (`buildings3d.js`, `trees3d.js`, `clutter3d.js`) lit/fogged/quantised like the terrain. Lighting is 9-level Bayer-quantised
  (`shaderlib.js LIGHT_LEVELS`) on terrain/sprites/meshes; geo3d fx and beams use stepped bands, never ordered dither.
- **Sprite depth** (`sprites.js`): units are camera-facing quads, but every sprite pixel sorts at its true height above the foot (upright card).
  Pixels below the pivot keep foot depth. So 3D fx, orbs, lights and meshes occlude units consistently — and **ground fx must be geo3d discs/quads at
  `heightAt`, never sprites drawn below their pivot.** 1x sheets use dirs s/e/n (w mirrored); `px: 2` sheets use 8 dirs (`actors.js dir8Of`).
- **Lights** (`lights.js`, `shadow.js`): pool of `MAX_LIGHTS` 32 per frame, selected by intensity x radius, distance-weighted (`selectLights`). The `MAX_PS` 10 strongest spell lights get real
  cube shadows (atlas row per light); the rest fall back to marched height-field shadows + one-bounce fill. Sun/moon key light casts near-overhead shadows.
  Rule: only spells and items cast big lights; basic attacks, towers and creeps stay under the bloom threshold (`fx/projectiles.js ATK_LIGHT` 0.3).
- **Spell fx** (`render/fx/`): router `fx/index.js` -> `fx/<short>.js register(c, R)`. Particles (`particles.js`, GPU instanced, HDR colours bloom) +
  `geo3d.js` pooled 3D geometry (tube / disc / bolt, immediate mode inside `c.run`) + `quads.js` + `beams.js`. Ring telegraphs: `c.ringDecal(x, y, R, dur,
  tint, o)` = geo3d TARGET disc + coloured ground light (`grow` is a radius multiplier, `light: false` skips the light). Never stretch `decal_ring_target`.
- **Spell vision**: `w.addVision()` in the sim (`vision.js`) -> `state.vision` -> client `fog.js` casts from each source like a friendly unit.
- **Spell wind** (`wind.js`): up to `MAX_GUSTS` 8 gusts derived from EV.SPELL events (shape swirl/line/burst from targeting, strength from damage, size
  from radius/range, read generically from DATA; `OVERRIDES` per key). Trees + clutter shaders read the shared gust uniforms. Attacks never gust.
- **Quality** (`quality.js`): two independent layers. *Preset* low / medium / high = renderer `settings` for fidelity (`bloomStrength/Levels, shadows, shadowPoints, maxLights,
  particles, ambient, clutter, rim, wind, dof, ssr, rays, outlines`; `high` must equal `render/index.js DEFAULTS`, tested; graded low <= medium <= high). *Options* =
  resolution (1/4, 1/2, native -> `pixelScale` 1, sqrt2, 2), fps cap 30/60/120, `bloom` on/off, vsync; presets never touch them, and only changed ones are stored (`p2d.gfx.opts`).
  `detectDefaults(info)` (pure; GPU string, cores, memory, screen, phone, refresh) picks preset + options in three tiers (potato / low-mid / good); DEFAULTS in the menu clears the
  overrides. `loop.js` runs the frame: rAF + `createFrameCap` accumulator, or timer/MessageChannel when vsync is off (= not waiting on rAF; browsers still composite on display vsync).
  The FPS governor only lowers the preset (10 s median under min(40, 70% of the cap)).
- **Fog** (`fog.js`): tile-resolution vision grid, rays blocked by higher ground and live trees; radius from DATA (hero visionDay/visionNight, unit `vision`).
- **Input**: `input.js` (desktop, header lists every key). `ui/touch.js`: joystick, attack button (tap / drag-to-target with hero priority), last-hit button,
  ability arc with tap / double-tap self-cast / hold-to-aim with rangefinder (clipped at the camera near plane), hold 3 s to reorder the wheel (per hero),
  pinch zoom, menu button. Pure helpers in `ui/targeting.js` are node-tested.
