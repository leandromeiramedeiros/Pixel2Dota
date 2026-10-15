# Extending Pixel2Dota — checklists

Everything is keyed by Dota keys (`npc_dota_hero_<short>`, `<hero>_<ability>`, `item_<name>`). Registries are auto-wired from `shared/heroes.js` and
DATA wherever possible; the lists below name every place that is NOT automatic. Follow Mirana (`mirana`) or Sven (`sven`) end to end as the worked sample.

Verify (every item): `npm test` green, `npm run build` passes, `node tools/fullmatch.mjs 30 1` ends with no errors (bots only use the first 10 roster
heroes; reorder `HERO_KEYS` locally if you want the new hero in it). Visual checks: `npx vite client --port 5190` and open `sandbox.html` (fxdemo keys fire
any spell without a server) or a real match with cheats. Never self-certify visuals: screenshots go to the creative director.

## Add a hero
1. **Roster** `shared/heroes.js`: `npc_dota_hero_<short>: { short, name, abilities: [4 keys in Q W E R order] }` (`keys`/`invoked`/`stolen` only for Invoker/Rubick-style kits).
2. **Data** `shared/data/heroes.js` + `abilities.js`: `npm run bake` with a local Dota 2 install (reads the roster + authored slot order). Without an install, hand-write
   the entries in the baked shape (hero: `short name attr str agi int *Gain dmgMin dmgMax armor mr ms turnRate atkRange projSpeed bat atkPoint baseAS hp hpRegen mana
   manaRegen visionDay visionNight hull abilities`; ability: `maxLevel ult behavior targetTeam targetType damageType castRange castPoint cooldown manaCost channel values{name:[per level]}`,
   arrays always length = levels). `shared/test/data.test.js` fails first if this is wrong: DATA.heroes keys must equal HERO_KEYS and every ability needs per-level arrays.
   Vision comes from `visionDay/visionNight` here (client `fog.js`, sim `units.js`); no other place.
3. **Sim** `server/src/sim/abilities/<short>.js`: `export default { [abilityKey]: handler }`. Auto-loaded by `abilities/index.js` (hook list in its header; `cast`, `passive`,
   `tick`, `bonus`, `onAttack*`, `canCast`, `targeting`, `learnReq` ...). Imports allowed: `shared/*` and `../events.js` only. Use `w.val(key, name, level)` for numbers,
   `w.rand()` for randomness, `evSpell(w, key, u.id, {sub, t, x, y, x2, y2, r, dur})` for client-side sub-events. Passive/innate not skill-pointable: `learnReq: () => 999`.
   Full surface: `server/src/sim/API.md`.
4. **Bots** `server/src/sim/bots.js`: optional `BUILD[heroKey]` (item list; falls back to Sven's) and `MELEE_CORE[heroKey]` (1 melee / 2 ranged start set; else caster set).
   Skill learning and spell usage are generic (DATA behavior); add a special case only if the hero misplays (see `mirana_leap`).
5. **Body sheet** (director rule: every new body is 8 directions at 2x from day one): `tools/art/heroes/<short>.mjs` built on `rig.mjs` (`Pal`, `buildSheet8(cfg, PL)`,
   `writeSheet('<short>', sheet)`; cfg = `W H px:2 pitch g model(J, ctx) pose(anim, i, p)`, see `lina.mjs`). Output `client/src/art/sheets/<short>.js` with `px: 2`, dirs
   `s se e ne n` (west mirrored), anims `idle walk attack cast stunned` (+ optional `death`), and a `portrait` frame (HUD shows it at 32x42, lobby reads the same frame).
   Preview `node tools/art/contact8.mjs <short>`; validate `node tools/art/heroes/check.mjs <short>` and add the name to its `ALL` list. Emissive pixels: `emit: {ch: strength}`.
   Until the sheet exists the hero draws a stand-in: `BODY_STANDIN` in `client/src/render/actors.js` (delete the entry once `sheets/<short>.js` exists; the real sheet wins automatically).
   Ranged attack projectile: `client/src/render/fx/projectiles.js ATK[short]` (else GENERIC magic missile); frames live in `sheets/fx.js`.
6. **Icons**: glyphs in `tools/art/icons/abilities.mjs` (or a sibling file merged in `icons.mjs`), one per ability key, 20x20 frame. Rebuild `node tools/art/icons/icons.mjs`,
   validate `node tools/art/icons/check.mjs` (every roster ability needs an icon). Director rule: detailed, Dota-2-like composition and colour key, hand-authored.
7. **Spell fx** `client/src/render/fx/<short>.js`: `export function register(c, R)` with `R.spell(key | [keys], (ev, su, tu, c) => ...)`, `R.proj(key, def)` for `w.spawnProjectile`
   keys, `R.on(EV.X, fn)`, `R.each(fn)`. Then **import it and add it to `MODS` in `fx/index.js`** (not automatic). `client/test/fx.test.js` fails until every non-passive
   ability has an `R.spell` literal. Use 3D geometry for anything on the ground (next section). Optional: add the short to `ORDER` in `client/src/fxdemo.js`.
8. **Touch aim shapes**: line/cone skillshots need an entry in `SHAPES` (`client/src/ui/touch.js`) naming the DATA value keys for width/length; point/unit/no-target spells are automatic.
9. **Wind**: gusts are derived from DATA damage/radius; add `OVERRIDES[key]` in `client/src/render/wind.js` only when the generic read picks the wrong size or shape.
10. **Tests**: add cases to a hero batch file like `server/test/abilities_newheroes.test.js` (`mk(short)` arena: caster at 0,0, dummy foes, all abilities learned; assert
    damage/modifiers/events). The Rubick test there casts every roster ability at level 1 — a new spell must not throw with a dummy target.

## Add an item
1. `tools/bake.mjs ITEM_NAMES` + bake, or hand-add to `shared/data/items.js` (`cost recipe{cost, parts} stats cooldown manaCost castRange behavior values charges stack consumable sell`).
2. `shared/test/data.test.js DECISION_ITEMS` and [DECISIONS.md](DECISIONS.md) item list.
3. `server/src/sim/items.js`: `stats` apply automatically (`applyStats`); actives need a `useInfo` case (targeting/range/ready) and a `use` case; hooks (`onAttack`, `onDamaged` ...)
   per the header. Boots go in `BOOTS` (ms does not stack). Tests: `server/test/items.test.js`.
4. Shop: `client/src/ui/shopdata.js SHOP_CATEGORIES` (tooltips/recipe trees are generic from DATA). Icon: `tools/art/icons/items.mjs` + rebuild icons.
5. Fx: `client/src/render/fx/items.js R.spell('item_x', ...)` (an `item_*` fallback exists). Bots: add to `BUILD` lists if they should buy it.

## Add or convert a spell to 3D fx
- Pilots: Sun Strike (`fx/invoker.js`), Laguna Blade (`fx/lina.js`), Freezing Field (`fx/crystal_maiden.js`). Geometry: `c.G.tube / c.G.disc / c.G.bolt` called every frame inside
  `c.run(dur, (rec, dt) => ...)` (immediate mode, pooled: pass option bags and colour arrays made once per cast). World coords, z from `c.zAt(x, y)`.
- Telegraphs: `c.ringDecal(x, y, R, dur, tint, {grow, spin, pulse, follow, light:false})`. Ground fx are discs/quads at `heightAt`, never sprites below their pivot (depth rule).
- Look: shells under the 1.4 bloom threshold, HDR cores (> 1.4) bloom; stepped bands, no ordered dither; crisp 1-px particles (`c.pix`, `c.sparks`) over soft blobs.
- Lights: `c.glow(...)` / `c.lightNow(...)` only for spells and items; the pool drops the weakest beyond 32, cube shadows beyond the 10 strongest.
- Register under the same ability key (`R.spell`); `sub` events (`ev.sub`) carry per-hit positions from the sim.

## Add a quality setting
1. Renderer: a new key in `render/index.js DEFAULTS` (= the ultra preset) and a `setSetting` branch that pushes it to the consumer (post state, uniform, module flag).
2. `render/quality.js PRESETS`: set it in all four levels (`client/test/quality.test.js` checks `ultra` == DEFAULTS, low is a potato, cost monotonic low <= medium <= high <= ultra).
3. A user-facing toggle (resolution, FPS cap, bloom, DoF, vsync) is an option, not a preset key: add it to `OPTION_KEYS` / `OPTION_DEFAULTS`, every `LEVEL_OPTIONS` bundle, `optionSettings`, and the menu (`ui/menu.js`).

## Add a synced field or event
- Field: `server/src/room/schema.js` + its `*_FIELDS` list + the sim object; the client reads it on the interpolated view (`net/index.js LIVE` for non-interpolated fields).
- Event: `shared/protocol.js EV`, constructor in `server/src/sim/events.js`, handler via `R.on` in a fx module or the HUD `fx(events)`.
