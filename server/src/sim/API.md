# Sim internal API (abilities, items, bots)

Pure JS, no colyseus. `import { World } from './world.js'`. Time unit = seconds, `dt = 1/30`. Coordinates: world units, x east, y north.
Source of truth for the wire format is `shared/protocol.js`; for numbers `shared/constants.js` + `w.data` (shared/data.js).

## World

```js
const w = new World({ seed, data?, pregame?, buildings? })  // buildings:false => empty arena (unit tests); data => inject fake DATA
w.addHero({ pid, team, heroKey, bot, name, slot, isHost, connected }) -> hero unit
w.order(pid, o) -> bool            // player order (wire shape, see below); w.orderUnit(u, o) pushes straight to a unit (bots, summons)
w.step(dt = 1/30)                  // no-op once w.winner >= 0
w.drainEvents() -> [ev]            // EV.* objects, clears the buffer
w.units  Map<id,unit>   w.players Map<pid,player>   w.time (starts at -PREGAME)   w.tick   w.night   w.winner (-1 | TEAM)   w.treesDown Set<i>
w.towers w.rax w.forts[team] w.fountains[team] w.buildings w.shops[team] = [{x,y},..]   w.waveNo
w.rand() w.randInt(a,b)            // seeded; ALWAYS use these, never Math.random
w.after(sec, fn)                   // one-shot timer, fn(w) called at the end of the first tick with time >= now+sec
```

Orders (`o`): `{t:'move',x,y,q?}` `{t:'attack',id,q?}` `{t:'amove',x,y,q?}` `{t:'stop'}` `{t:'hold'}`
`{t:'cast',slot,id?,x?,y?,q?}` `{t:'item',slot,id?,x?,y?,q?}` `{t:'learn',slot}` `{t:'buy',key}` `{t:'sell',slot}` `{t:'swap',a,b}`.
`q` = shift-queue (max 8). `learn/buy/sell/swap` apply immediately and return success.

## Queries (all use the start-of-tick spatial grid; edge distance includes unit radius)

```js
opts = { dead:false, buildings:false?, heroes?, team?, enemyOf?: unit, allyOf?: unit, exclude?: unit, filter?: fn }
w.unitsInRadius(x, y, r, opts) -> [unit]
w.unitsInLine(x1, y1, x2, y2, width, opts)
w.unitsInCone(x, y, dir, len, angleRad, opts)
w.unitsInTrapezoid(x, y, dir, len, w0, w1, opts)     // cleave shape
w.nearestUnit(x, y, r, opts) -> unit | null
w.treesInRadius(x, y, r) -> [treeIdx]    w.cutTree(i)   // regrows after TREE_REGROW; navmesh updated
```
Blink/teleported units become visible to queries next tick. Invulnerable / dead / hidden units are filtered by default.

## Effects

```js
w.damage(src, tgt, amount, 'phys'|'mag'|'pure', info?) -> dealt     // armor / magic resist / lifesteal hooks / kill handled
   info: { attack, crit, ability:'key', dot, pierce, silent, noKill }   // INVULN blocks all; MAGIC_IMMUNE blocks non-phys unless pierce
w.heal(tgt, amount, src?) -> healed        w.restoreMana(tgt, amount)
w.addModifier(tgt, def) -> mod | null      // null when blocked (magic immune / invuln / building for debuffs unless def.pierce)
w.removeModifier(tgt, key, srcId?, reason?)   w.hasModifier(tgt,key)   w.getModifier(tgt,key)   w.dispel(tgt, {strong?, buffs?, debuffs?})
w.interrupt(u, clearQueue?)                // ends channel + cast windup
w.killUnit(victim, killer, info?)
w.knockback(u, { dir | dx,dy, dist, speed, onEnd? })    // force move; interrupts
w.teleport(u, x, y)   w.blink(u, x, y)     // blink also emits EV.BLINK; caller checks range
w.spawnSummon(owner, { key, x, y, hp, armor, dmgMin, dmgMax, atkRange, bat, projSpeed, ms, radius, dur, vision, kind?, think?(w,u,dt), noAttack?, noCollide? }) -> unit
w.addVision({ owner|team, x, y, r, dur?, projectile?|follow?(w,src), linger? }) -> src   // temporary team vision (not a unit); projectile: rides a w.spawnProjectile() result until it ends, then lingers
w.teamSees(team, x, y) -> bool   // unit vision radius + temporary sources (no LOS); client fog reads state.vision
w.emit({e: EV.X, ...})   // or helpers from events.js (evBlink, evMsg, ...)
```

Modifier def:
```js
{ key, src: unit|id, dur: seconds (omit = permanent), debuff?: bool (default: src is an enemy),
  status: ST.STUN|ST.ROOT|ST.SILENCE|..., stack?: 'unique' | 'stack' (+maxStacks), purge?: 'basic'|'strong'|'none', fade?: s,
  // stat bonuses (summed): ms msPct as armor dmg str agi int mr hpRegen manaRegen hp mana range
  dot?: { dps, interval=1, type='mag' },
  aura?: { radius, interval=0.25, team:'enemy'|'ally', self?, def:{...modifier def...}, buildings? },
  onTick(w,u,m,dt), onExpire(w,u,m,reason) }
```
Same key from the same source refreshes (unless `stack:'unique'` = one per key globally; `'stack'` adds a stack). Slows: the strongest negative `msPct` wins.

## Projectiles

```js
// tracking (homes on tgt):
w.spawnProjectile({ src, tgt, speed, k:'fx_key', onHit(w, p, tgtUnit) {...}, onEnd? })
// linear (each unit hit at most once; enemies only unless hitAllies; pierce:true keeps flying, otherwise it ends on the first unit hit or at `range`):
w.spawnProjectile({ src, x2, y2 | dir, range, speed, radius, pierce:true, hitAllies?, filter?(u), onHit(w, p, unit), onEnd(w,p), k })
```
Emits EV.PROJ / EV.PROJ_END (client draws it) unless `silent:true`. `p.data` is free for your state.

## Abilities (`abilities/<short>.js`)

Default export `{ [abilityKey]: handler }`; allowed imports: `shared/*` and `../events.js` ONLY. See header of `abilities/index.js` for the full hook list.
`sven.js` is the worked sample (single-target projectile + stun, passive cleave, buff aura-on-cast, self buff).
```js
w.val('key', 'valueName', level)    // per-level value from DATA ability.values (1-based, clamped)
w.field('key', 'castRange'|'cooldown'|'manaCost'|..., level)
w.getAbility(u, 'key') -> ab {key, level, cd, ...}          w.castNow(u, slot, {unit, x, y})   // pays mana + cd, skips range/castpoint
```
Cast flow (orders.js `doCast`): validate (`canCast`, mana, cd, handler.canCast) -> walk into `castRange` -> face -> `castPoint` windup (interruptible by stun/stop) -> `executeAbility`
(pay mana + cd, break invis, auto EV.SPELL merged with handler return, start channel if `{channel}` returned).
Channel: return `{ channel: secs, tick(w,u,ch,dt), end(w,u,ch,interrupted), noInterruptOnOrder? }`.
Attack hooks get `info = { dmg, final, type, crit, pierce, noCleave }` (mutable in `onAttack`).

## Items (`items.js`) and Bots (`bots.js`)

Exports and signatures are documented at the top of each file. Item state: `u.items[i] = {key, charges, cd, cdMax}`; set `u._dirty = true` after changes.
Inventory = `INV_SLOTS` 9 (`shared/protocol.js`): slots `0..ACTIVE_SLOTS-1` (6) are the main inventory, `6..8` the backpack. Backpack items give no stats / passives / hooks, cannot be used (`useInfo` null, item orders refused) and gain no charges; they still tick cooldowns and count for recipes, stacking and selling. Buying fills main then backpack; refused when all 9 are taken unless it completes a recipe. `{t:'swap',a,b}` works over all 9; an item moved backpack -> main gets `cd = max(cd, BACKPACK_SWAP_CD=6)` (and `cdMax`), which blocks use for every item, so the client shows it through the normal `cd/cdMax` item fields (no extra field). The Aegis only lives in main. New item code: loop `i < ACTIVE_SLOTS` for anything that acts (stats, passives, hooks, use).
`useInfo(w,u,slot) -> null | {targeting, range, castPoint, ready, ...}` makes `{t:'item'}` orders work through the same cast flow as abilities.
`use()` may return `{key, channel, tick?, end?}` (TP scroll). `onEnemySpell(w, u, caster, key)` (magic stick/wand) fires for enemy heroes within 1200 of any non-passive cast (orders.js).
Bots: `update(w, dt)` runs once per tick before units think; use `w.order(pid, ...)`; stagger by `(w.tick + slot) % N`. Per-hero item builds: `BUILD` / `MELEE_CORE` tables.

## Invoker / Rubick slot rules

- Invoked spells have maxLevel 1 and 9-entry value arrays indexed by orb level (`levelKeys[name]` names the orb): `w.val(key, name, orbLevel)`; names without a levelKey use level 1.
- `u.abilities` = [quas, wex, exort, D, F, invoke]; Invoke rewrites slot 3/4 `key` (newest in D). Per-spell cooldowns survive swaps in `u._inv.cd`; `u.orbs` = last 3 orbs ("QQE").
- Rubick's D/F (`rubick_empty1/2`) are rewritten the same way by Spell Steal (`ab.stolen`, not learnable); the stolen spell runs through its own handler.

## Useful unit fields

Public (snapshotted): `id key kind team owner x y facing hp maxHp mana maxMana armor mr ms atkRange level status(ST bits) abilities[] items[]`.
Private (`_` prefix, never serialized): `_dead _st _mods _tgt _mv _q _wind _kb _channel _dirty _protected _lane _tier _rax _lp _li _lo _nid`.
Derived stats (`maxHp maxMana armor dmgMin/dmgMax ms atkRange mr ...`) are recomputed by `recalc` whenever `u._dirty`: never assign them (a write is clamped/overwritten); use modifiers, ability `bonus()` hooks, or item `stats`. Only `hp`/`mana` are freely assignable.
Hero: `xp skillPoints respawn str agi int` (+ `w.players.get(u.owner)`: `gold kills deaths assists lh dn`).

## Rules implemented

Tier protection / ancient win (DECISIONS), fountain heal+invuln, wave every WAVE_EVERY with siege every SIEGE_EVERY, creep aggro/leash (leash = distance from the lane line), wave spawn block (melee row front, ranged / siege behind, lateral slot `_lo` kept on the lane), hull separation every tick for every body (walkers yield, position only), XP split, last-hit gold, kill streak, respawn timers, day/night, tree cutting.
- Unit data from the game files: hull = `radius` (ranged creeps 8), `MovementTurnRate` -> `_turn`, `AttackAcquisitionRange` -> `u._acq` (creep / neutral / tower scan range, hero attack-move scan). Baked but not used by the sim: `visionNight` (client fog mirrors the server formula), `ring` (selection ring, picking only).
- Waves (`creeps.spawnWave`): every lane spawns whatever happens to its own barracks. Enemy melee rax of that lane down -> `_grade 'upgraded'` melee + siege, ranged rax down -> upgraded ranged, all 6 enemy rax down -> `'upgraded_mega'`; stats/bounty from `DATA.units.<team>_<type>[_upgraded[_mega]]`, wire `key` stays the base creep key. `WAVE_GROW` adds creeps per wave by game minute. Lane creep passives `CREEP_PASSIVES` (`u._cp`, attack/damage multipliers).
- Aggro (`combat.heroAggro`): an attack order on an enemy hero, or an attack landing on one, marks the attacker for `AGGRO_WINDOW` 2.5 s; the victim's lane creeps within `CREEP_CALL_HELP` of the attacker and towers that reach it rescan now and prefer it (`aggroOnAlly`). Spells never draw aggro. Invisible units never auto-acquire.
- Towers (`creeps.towerRetarget`): keep the current target until it dies / leaves range; switch only to an aggro-marked hero.
- Attacks: `_cd` is set at launch (`_interval - _windup`), so a windup cancelled by an order / stun / the target leaving range + `ATTACK_RANGE_BUFFER` costs no cooldown.
- Movement: turn while moving (straight below 0.2 rad off, curve along the facing at cos(misalignment) speed up to 90 deg, turn in place beyond). Melee units (`arc.engage`, via `orders.chase`) take a free slot on a ring around their target. Heroes steer locally around standing bodies (`move.steer`; A* is terrain only).
Neutrals (`neutrals.js`): 28 camp boxes tiered small/medium/large/ancient, spawn 1:00 and every minute if the box is empty, leash 600; Roshan at the first non-trigger `ents.roshan` pit (slam, Aegis on death, respawn 8-11 min). Wards (`wards.js`): `item_ward_observer`/`item_ward_sentry` ground-target items, shop stock per team (`items.stockLeft`), `KIND.WARD` summons that are invisible and die in 2 hits; sentry reveals enemy INVIS units within true sight. World opts `neutrals`, `camps`, `roshan`.

Not implemented: neutral abilities, backdoor protection, flagbearer creeps, neutral_upgrade (camp stat growth), creep_siege on buildings, denies on heroes, tower/building bounty (DATA gold = 0), creep stat scaling, distinct super/mega creep models (client).
