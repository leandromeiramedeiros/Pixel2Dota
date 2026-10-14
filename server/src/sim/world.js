// World: the authoritative simulation. Pure JS (no colyseus). See API.md for the ability/item/bot-facing surface.
import { KIND, TEAM, ST } from '../../../shared/protocol.js';
import { PREGAME, WAVE_EVERY, DAY_LEN, TREE_REGROW, START_GOLD } from '../../../shared/constants.js';
import { DATA } from '../../../shared/data.js';
import { getMap } from '../../../shared/map.js';
import { Nav } from './nav.js';
import { Grid } from './grid.js';
import { makeHero, makeSummon } from './units.js';
import * as S from './status.js';
import * as C from './combat.js';
import * as H from './heroes.js';
import * as O from './orders.js';
import * as K from './creeps.js';
import * as B from './buildings.js';
import * as bots from './bots.js';
import { stepKb, separate } from './move.js';
import { evHeal, evMana, evBlink, evTree, evTreeGrow, emit } from './events.js';

const PAD = 40;
const teamOf = (x) => (typeof x === 'number' ? x : x.team);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pass(u, o) {
  if (u._dead && !o.dead) return false;
  if (u._building && o.buildings === false) return false;
  if (o.heroes && u.kind !== KIND.HERO) return false;
  if (o.team !== undefined && u.team !== o.team) return false;
  if (o.enemyOf !== undefined && u.team === teamOf(o.enemyOf)) return false;
  if (o.allyOf !== undefined && u.team !== teamOf(o.allyOf)) return false;
  if (o.exclude && u === o.exclude) return false;
  if (o.filter && !o.filter(u)) return false;
  return true;
}

export class World {
  /** opts: {seed=1, data?, pregame=PREGAME, buildings=true} */
  constructor(opts = {}) {
    this.seed = opts.seed === undefined ? 1 : opts.seed;
    this._rng = mulberry32(this.seed >>> 0);
    this.data = opts.data || DATA;
    this.units = new Map(); this.players = new Map(); this.treesDown = new Set();
    this.projs = []; this._ev = []; this._rm = []; this._hl = []; this._qb = []; this._qc = []; this._qd = []; this._qe = [];
    this._id = 0; this._pid = 0; this._timers = [];
    this.tick = 0; this.time = -(opts.pregame === undefined ? PREGAME : opts.pregame); this.night = false; this.winner = -1;
    this.waveNo = 0; this._nextWave = 0;
    this.nav = new Nav();
    this.index = new Grid();
    this.map = getMap();
    this.rax = []; this.towers = []; this.forts = []; this.fountains = []; this.buildings = []; this.shops = [[], []];
    this._slots = [0, 0];
    if (opts.buildings !== false) { B.spawnBuildings(this); K.buildLanePaths(this); }   // lane A* up front so the first step() stays cheap
  }

  // ------------------------------------------------------------------------------------------------------- basics
  nextId() { this._id++; return String(this._id); }
  rand() { return this._rng(); }
  randInt(a, b) { return a + Math.floor(this._rng() * (b - a + 1)); }
  isEnemy(a, b) { return a.team !== b.team; }
  pathBudget() { return this.nav.expanded < 30000; }
  shopPos(team) { return this.shops[team] || []; }
  visionRadius(u) { return this.night ? u._visNight : u._visDay; }
  emit(ev) { return emit(this, ev); }
  drainEvents() { const e = this._ev; this._ev = []; return e; }
  after(sec, fn) { this._timers.push({ t: this.time + sec, fn }); }

  /** Insert a freshly built unit (hero / creep / summon / building) into the world. */
  addUnit(u) {
    this.units.set(u.id, u);
    if (!u._dead) this.index.insert(u);
    return u;
  }

  addHero({ pid, team, heroKey, bot = false, name, slot, isHost = false, connected = true }) {
    const f = this.fountains[team];
    const sl = slot === undefined ? this._slots[team]++ : slot;
    const a = (sl % 5) * 0.55 - 1.1 + (team === TEAM.RADIANT ? Math.PI / 4 : -Math.PI * 3 / 4);
    const px = f ? f.x + Math.cos(a) * 260 : 0, py = f ? f.y + Math.sin(a) * 260 : 0;
    const q = this.nav.nearestWalkable(px, py, {});
    const p = { sid: pid, name: name || pid, team, slot: sl, hero: heroKey, isBot: !!bot, isHost, connected, heroId: '', gold: START_GOLD, kills: 0, deaths: 0, assists: 0, lh: 0, dn: 0 };
    const u = makeHero(this, { pid, team, heroKey, x: q.x, y: q.y });
    p.heroId = u.id;
    this.players.set(pid, p);
    this.units.set(u.id, u);
    H.recalc(this, u);
    u.hp = u.maxHp; u.mana = u.maxMana;
    for (const ab of u.abilities) H.refreshAbility(this, u, ab);
    this.index.insert(u);
    return u;
  }

  /** Validated order from a player/bot. Returns true when accepted. */
  order(pid, o) { return O.issue(this, pid, o); }
  /** Order for any unit (summons, etc). */
  orderUnit(u, o) { return O.push(this, u, o); }

  // ------------------------------------------------------------------------------------------------------- queries
  /** Units whose hull touches the circle. opts: {dead, buildings(false=skip), heroes, team, enemyOf(unit|team), allyOf, exclude, filter}. New array. */
  unitsInRadius(x, y, r, opts) {
    const o = opts || {}, out = [], cand = this.index.query(x, y, r + (o.buildings === false ? PAD + 40 : PAD + 150), this._qe);
    for (let i = 0; i < cand.length; i++) {
      const u = cand[i];
      const dx = u.x - x, dy = u.y - y, rr = r + u.radius;
      if (dx * dx + dy * dy > rr * rr || !pass(u, o)) continue;
      out.push(u);
    }
    return out;
  }
  /** Units within `width/2` (+hull) of the segment (x1,y1)-(x2,y2). */
  unitsInLine(x1, y1, x2, y2, width, opts) {
    const o = opts || {}, out = [], dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, l2 = len * len;
    const cand = this.index.query((x1 + x2) / 2, (y1 + y2) / 2, len / 2 + width / 2 + PAD + 150, this._qe);
    for (let i = 0; i < cand.length; i++) {
      const u = cand[i];
      const t = Math.max(0, Math.min(1, ((u.x - x1) * dx + (u.y - y1) * dy) / l2));
      const d = Math.hypot(x1 + dx * t - u.x, y1 + dy * t - u.y);
      if (d > width / 2 + u.radius || !pass(u, o)) continue;
      out.push(u);
    }
    return out;
  }
  /** Units in a cone: apex (x,y), direction `dir` (rad), length `len`, full opening angle `angle` (rad). */
  unitsInCone(x, y, dir, len, angle, opts) {
    const o = opts || {}, out = [], cand = this.index.query(x, y, len + PAD + 150, this._qe), half = angle / 2;
    for (let i = 0; i < cand.length; i++) {
      const u = cand[i];
      const dx = u.x - x, dy = u.y - y, d = Math.hypot(dx, dy);
      if (d - u.radius > len || !pass(u, o)) continue;
      if (d > u.radius) { const da = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - dir), Math.cos(Math.atan2(dy, dx) - dir))); if (da > half + Math.asin(Math.min(1, u.radius / d))) continue; }
      out.push(u);
    }
    return out;
  }
  /** Units in a trapezoid starting at (x,y) pointing `dir`, `len` long, width w0 at the start and w1 at the end (Great Cleave shape). */
  unitsInTrapezoid(x, y, dir, len, w0, w1, opts) {
    const o = opts || {}, out = [], cx = Math.cos(dir), cy = Math.sin(dir), mw = Math.max(w0, w1);
    const cand = this.index.query(x + cx * len / 2, y + cy * len / 2, len / 2 + mw / 2 + PAD + 150, this._qe);
    for (let i = 0; i < cand.length; i++) {
      const u = cand[i];
      const dx = u.x - x, dy = u.y - y, along = dx * cx + dy * cy, side = Math.abs(-dx * cy + dy * cx);
      if (along < -u.radius || along > len + u.radius) continue;
      const tt = Math.max(0, Math.min(1, along / len)), hw = (w0 + (w1 - w0) * tt) / 2;
      if (side > hw + u.radius || !pass(u, o)) continue;
      out.push(u);
    }
    return out;
  }
  /** Closest alive unit to (x,y) among unitsInRadius(x,y,r,opts), or null. */
  nearestUnit(x, y, r, opts) {
    let best = null, bd = Infinity;
    for (const u of this.unitsInRadius(x, y, r, opts)) { const d = Math.hypot(u.x - x, u.y - y); if (d < bd) { bd = d; best = u; } }
    return best;
  }

  // ------------------------------------------------------------------------------------------------------- effects
  damage(src, tgt, amount, type, info) { return C.damage(this, src, tgt, amount, type || 'phys', info); }
  heal(tgt, amount, src) {
    if (!tgt || tgt._dead || amount <= 0) return 0;
    const a = Math.min(amount, tgt.maxHp - tgt.hp);
    if (a <= 0) return 0;
    tgt.hp += a; evHeal(this, tgt.id, a);
    return a;
  }
  restoreMana(tgt, amount) {
    if (!tgt || tgt._dead || amount <= 0) return 0;
    const a = Math.min(amount, tgt.maxMana - tgt.mana);
    if (a <= 0) return 0;
    tgt.mana += a; evMana(this, tgt.id, a);
    return a;
  }
  addModifier(tgt, def) { return S.addModifier(this, tgt, def); }
  removeModifier(tgt, key, srcId, reason) { return S.removeModifier(this, tgt, key, srcId, reason); }
  hasModifier(tgt, key) { return S.hasModifier(tgt, key); }
  getModifier(tgt, key) { return S.getModifier(tgt, key); }
  dispel(tgt, opts) { return S.dispel(this, tgt, opts); }
  interrupt(u, clear) { S.interrupt(this, u, clear); }
  killUnit(v, killer, info) { C.killUnit(this, v, killer, info); }
  spawnProjectile(o) { return C.spawnProjectile(this, o); }
  /** Summon / ward / spirit owned by `owner`. See units.makeSummon for fields. Added to the world and returned. */
  spawnSummon(owner, o) {
    const u = makeSummon(this, owner, o);
    this.addUnit(u);
    return u;
  }
  /** Force-move: {dir|dx,dy, dist, speed, onEnd}. Interrupts orders / channels. */
  knockback(u, o) {
    if (!u || u._dead || u._building) return;
    let dx = o.dx, dy = o.dy;
    if (o.dir !== undefined) { dx = Math.cos(o.dir); dy = Math.sin(o.dir); }
    const l = Math.hypot(dx, dy) || 1;
    S.interrupt(this, u, false);
    u._kb = { dx: dx / l, dy: dy / l, v: o.speed || 900, left: o.dist || 0, onEnd: o.onEnd };
    u._dirty = true;
  }
  /** Instant reposition (snaps to walkable ground). No event. */
  teleport(u, x, y) {
    const q = this.nav.nearestWalkable(x, y, {});
    u.x = q.x; u.y = q.y; u._mv = null;
  }
  /** Blink: teleport + EV.BLINK. Caller enforces range. */
  blink(u, x, y) {
    const ox = u.x, oy = u.y;
    this.teleport(u, x, y);
    evBlink(this, u.id, ox, oy, u.x, u.y);
  }
  /** Run an ability's cast right now (mana + cooldown paid, no range / cast point checks). */
  castNow(u, slot, target) {
    const ab = u.abilities[slot];
    if (!ab || ab.level < 1) return null;
    return O.executeAbility(this, u, ab, target);
  }
  getAbility(u, key) { for (const ab of u.abilities) if (ab.key === key) return ab; return null; }
  /** Per-level ability value: w.val('sven_storm_bolt','bolt_aoe', level) (1-based, clamped). */
  val(key, name, level) {
    const a = this.data.abilities[key]; if (!a || !a.values) return undefined;
    const arr = a.values[name]; if (!arr) return undefined;
    return Array.isArray(arr) ? arr[Math.min(Math.max((level | 0) || 1, 1), arr.length) - 1] : arr;
  }
  /** Per-level ability field (castRange|castPoint|cooldown|manaCost|channel|...). */
  field(key, name, level) {
    const a = this.data.abilities[key]; if (!a) return undefined;
    const arr = a[name];
    return Array.isArray(arr) ? arr[Math.min(Math.max((level | 0) || 1, 1), arr.length) - 1] : arr;
  }
  onBuildingDeath(v, killer) { B.onBuildingDeath(this, v, killer); }

  // ------------------------------------------------------------------------------------------------------- trees
  treesInRadius(x, y, r) {
    const T = this.map.trees, out = [], r2 = r * r;
    for (let i = 0; i < T.length; i++) {
      if (this.treesDown.has(i)) continue;
      const dx = T[i][0] - x, dy = T[i][1] - y;
      if (dx * dx + dy * dy <= r2) out.push(i);
    }
    return out;
  }
  cutTree(i) {
    if (i < 0 || i >= this.map.trees.length || this.treesDown.has(i)) return false;
    this.treesDown.add(i); this.nav.cutTree(i, true); evTree(this, i);
    this.after(TREE_REGROW, () => { this.treesDown.delete(i); this.nav.cutTree(i, false); evTreeGrow(this, i); });
    return true;
  }

  // ------------------------------------------------------------------------------------------------------- loop
  step(dt = 1 / 30) {
    if (this.winner >= 0) return;
    this.tick++; this.time += dt;
    this.night = this.time >= 0 && Math.floor(this.time / DAY_LEN) % 2 === 1;
    this.nav.expanded = 0;
    const idx = this.index; idx.clear();
    for (const u of this.units.values()) if (!u._dead) idx.insert(u);
    if (this.time >= this._nextWave - 1e-6 && this.buildings.length) { this.waveNo++; this._nextWave += WAVE_EVERY; K.spawnWave(this, this.waveNo); }
    bots.update(this, dt);
    for (const u of this.units.values()) this._think(u, dt);
    C.updateProjectiles(this, dt);
    if (this._timers.length) {
      const ts = this._timers;
      for (let i = ts.length - 1; i >= 0; i--) if (ts[i].t <= this.time) { const t = ts.splice(i, 1)[0]; t.fn(this); }
    }
    if (this._rm.length) { for (const u of this._rm) this.units.delete(u.id); this._rm.length = 0; }
  }

  _think(u, dt) {
    if (u._dead) { if (u.kind === KIND.HERO) H.heroTick(this, u, dt); return; }
    if (u.hp < u.maxHp && u._hpRegen > 0) u.hp = Math.min(u.maxHp, u.hp + u._hpRegen * dt);
    if (u.mana < u.maxMana && u._manaRegen > 0) u.mana = Math.min(u.maxMana, u.mana + u._manaRegen * dt);
    S.tickStatus(this, u, dt);
    if (u._dead) return;
    if (u._dirty) H.recalc(this, u);
    H.finalizeStatus(u);
    const k = u.kind;
    if (k === KIND.HERO) H.heroTick(this, u, dt);
    else if (u._expire !== undefined && u._expire <= this.time) { C.killUnit(this, u, null, null); return; }
    if (u._kb) { u._tgt = null; stepKb(this, u, dt); }
    else if (k === KIND.HERO) O.think(this, u, dt);
    else if (k === KIND.CREEP) K.creepThink(this, u, dt);
    else if (u._building) B.buildingThink(this, u, dt);
    else K.summonThink(this, u, dt);
    if (u._dead) return;
    C.tickAttack(this, u, dt);
    if (!u._building && (u._moved || ((this.tick + u._nid) & 3) === 0)) separate(this, u);
    // animation
    let anim = 'idle';
    const casting = u._q.length && u._q[0]._stage === 1;
    if (u._st & (ST.STUN | ST.HEX)) anim = 'stunned';
    else if (u._channel) anim = 'channel';
    else if (u._wind > 0 || casting) anim = u._wind > 0 ? 'attack' : 'cast';
    else if (u._moved) anim = 'walk';
    else if (this.time < u._animUntil) anim = u._animType;
    if (u.anim !== anim) { u.anim = anim; if (anim === 'walk' || anim === 'idle') u.animRate = anim === 'walk' ? Math.max(0.6, Math.min(2, u.ms / 300)) : 1; }
    u._moved = false;
  }
}

