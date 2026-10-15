// Neutral creep camps + Roshan. Pure. Stats come from baked DATA.units ('neutral_*', 'roshan'); camp boxes from getMap().ents.camp.
//
//   World opts: neutrals (default true unless buildings:false), camps: [{x,y,tier}] (override the map), roshan: {x,y} (override the pit).
//   w.camps  [{id,x,y,tier,variant,members:[unit]}]     w.rosh  {x,y,leash,members:[unit],unit,deaths}
//
// Rules: first spawn at CAMP_FIRST s, then on every CAMP_EVERY mark if no live unit stands in the camp box (stacking works).
// A neutral stays idle until it takes damage (its whole camp wakes and chases the attacker). Past LEASH from the camp centre, or after
// IDLE_DROP s without a target, the camp walks home, heals fast and purges debuffs. Roshan: pit, slam, drops the Aegis, respawns 8-11 min later.
import { KIND, TEAM, ST } from '../../../shared/protocol.js';
import { LANES } from '../../../shared/data/lanes.js';
import { getMap } from '../../../shared/map.js';
import { makeNeutral } from './units.js';
import { acquire, attackable } from './combat.js';
import { moveTo, stepMove } from './move.js';
import { chase } from './orders.js';
import { grantAegis } from './items.js';
import { evSpell, evMsg } from './events.js';

export const CAMP_FIRST = 60, CAMP_EVERY = 60;     // seconds
export const CAMP_BOX = 320;                       // camp counts as occupied when any live unit is this close to its centre
export const LEASH = 600;                          // max distance from the camp centre while fighting
export const ROSH_LEASH = 500;
export const ROSH_RESPAWN = [480, 660];            // 8-11 min
const IDLE_DROP = 3;                               // s without a target before the camp gives up
const RET_REGEN = 0.25;                            // fraction of max hp per second while walking home
const SLAM_EVERY = 7, SLAM_RADIUS = 350, SLAM_DMG = 175, SLAM_SLOW = -30, SLAM_SLOW_DUR = 2;
const MAX_LIVE = 12;

/** Dota-like groups per tier (names are DATA.units 'neutral_<name>'). A camp picks one by its index. */
export const GROUPS = {
  small: [['kobold_taskmaster', 'kobold', 'kobold'], ['forest_troll_berserker', 'forest_troll_high_priest']],
  medium: [['alpha_wolf', 'giant_wolf', 'giant_wolf'], ['ogre_mauler', 'ogre_magi']],
  large: [['centaur_khan', 'centaur_outrunner', 'centaur_outrunner'], ['satyr_hellcaller', 'satyr_trickster', 'satyr_soulstealer'], ['enraged_wildkin', 'wildkin', 'wildkin']],
  ancient: [['black_dragon', 'black_drake', 'black_drake'], ['granite_golem', 'rock_golem', 'rock_golem'], ['big_thunder_lizard', 'small_thunder_lizard', 'small_thunder_lizard']],
};
// per side (14 camps): the 4 closest to a lane are small, then 4 medium, 3 large, the 3 deepest in the jungle are ancient
const TIER_SPLIT = [['small', 4], ['medium', 4], ['large', 3], ['ancient', 3]];

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(ax + dx * t - px, ay + dy * t - py);
}
/** Distance from a point to the nearest lane waypoint polyline (shared/data/lanes.js). */
export function laneDistance(x, y) {
  let best = Infinity;
  for (const k in LANES) { const p = LANES[k]; for (let i = 0; i + 1 < p.length; i++) best = Math.min(best, segDist(x, y, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1])); }
  return best;
}

/** Tier every camp box of the map: rank by lane distance within each side of the river. */
export function tierCamps(boxes) {
  const out = [];
  for (const side of [0, 1]) {
    const list = boxes.filter((b) => (b.x + b.y < 0 ? 0 : 1) === side).map((b) => ({ x: b.x, y: b.y, d: laneDistance(b.x, b.y) })).sort((a, b) => a.d - b.d);
    const n = list.length;
    let i = 0;
    for (const [tier, cnt] of TIER_SPLIT) {
      const k = tier === 'ancient' ? n - i : Math.round(cnt * n / 14);
      for (let j = 0; j < k && i < n; j++, i++) out.push({ x: list[i].x, y: list[i].y, tier });
    }
  }
  return out;
}

export function initNeutrals(w, opts = {}) {
  const map = getMap();
  const defs = opts.camps || tierCamps(map.ents.camp || []);
  w.camps = defs.map((c, i) => ({ id: i, x: c.x, y: c.y, tier: c.tier, variant: i, members: [], leash: LEASH }));
  const pit = opts.roshan || (map.ents.roshan || []).find((e) => !/trigger/.test(e.name || '')) || (map.ents.roshan || [])[0];
  w.rosh = pit ? { x: pit.x, y: pit.y, leash: ROSH_LEASH, members: [], unit: null, deaths: 0, spawned: false } : null;
  w._nextCamp = CAMP_FIRST;
}

const alive = (u) => !u._dead;

function spawnCamp(w, c) {
  c.members = c.members.filter(alive);
  if (c.members.length >= MAX_LIVE) return false;
  if (w.unitsInRadius(c.x, c.y, CAMP_BOX, { buildings: false }).length) return false;
  const groups = GROUPS[c.tier] || GROUPS.small, names = groups[c.variant % groups.length];
  for (let i = 0; i < names.length; i++) {
    const a = (i / names.length) * Math.PI * 2 + c.id, r = names.length > 1 ? 80 : 0;
    const q = w.nav.nearestWalkable(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, {});
    const u = makeNeutral(w, names[i], q.x, q.y);
    u._camp = c; u._home = { x: q.x, y: q.y }; u._aggro = false; u._ret = false; u._idleT = 0; u._onHurt = wake;
    u.facing = Math.atan2(c.y - q.y, c.x - q.x) + Math.PI;
    u._scanT = u._nid % 6;
    w.addUnit(u);
    c.members.push(u);
  }
  return true;
}

function spawnRoshan(w) {
  const R = w.rosh;
  if (!R || R.unit) return null;
  const q = w.nav.nearestWalkable(R.x, R.y, {});
  const u = makeNeutral(w, 'roshan', q.x, q.y);
  u._camp = R; u._home = { x: q.x, y: q.y }; u._aggro = false; u._ret = false; u._idleT = 0; u._onHurt = wake; u._slamAt = 0;
  u._roshan = true; u._onDeath = roshanDeath;
  u.facing = Math.PI * 0.75;
  w.addUnit(u);
  R.unit = u; R.members = [u]; R.spawned = true;
  return u;
}

/** Called once per tick from World.step (after the spatial index is rebuilt). */
export function updateNeutrals(w) {
  if (!w.camps) return;
  while (w.time >= w._nextCamp - 1e-6) { for (const c of w.camps) spawnCamp(w, c); w._nextCamp += CAMP_EVERY; }
  if (w.rosh && !w.rosh.spawned && w.time >= 0) spawnRoshan(w);
}

// ---------------------------------------------------------------------------------------------------------------- AI
/** u took damage from src: wake the whole camp and point it at the attacker. */
function wake(w, u, src) {
  const c = u._camp;
  if (!c || u._ret || !src || src.team === u.team) return;
  for (const m of c.members) {
    if (m._dead || m._ret) continue;
    if (!m._aggro) { m._aggro = true; m._idleT = 0; }
    if ((m === u || !m._tgt) && attackable(m, src)) { m._tgt = src; m._mv = null; }
  }
}

function startReturn(w, c) {
  for (const m of c.members) {
    if (m._dead) continue;
    m._ret = true; m._aggro = false; m._tgt = null; m._mv = null; m._idleT = 0;
    w.dispel(m, { debuffs: true, strong: true });
  }
}

function slam(w, u) {
  u._slamAt = w.time + SLAM_EVERY;
  evSpell(w, 'roshan_slam', u.id, { x: Math.round(u.x), y: Math.round(u.y), r: SLAM_RADIUS });
  for (const v of w.unitsInRadius(u.x, u.y, SLAM_RADIUS, { enemyOf: u, buildings: false })) {
    w.damage(u, v, SLAM_DMG, 'mag', { ability: 'roshan_slam' });
    if (!v._dead) w.addModifier(v, { key: 'roshan_slam', src: u, dur: SLAM_SLOW_DUR, msPct: SLAM_SLOW });
  }
}

export function neutralThink(w, u, dt) {
  if (u._kb || (u._st & ST.STUN)) { u._tgt = null; return; }
  const c = u._camp, home = u._home;
  if (u._ret) {
    u.hp = Math.min(u.maxHp, u.hp + u.maxHp * RET_REGEN * dt);
    u._tgt = null;
    if (Math.hypot(home.x - u.x, home.y - u.y) <= 40) { u._ret = false; u._mv = null; u.hp = u.maxHp; return; }   // full reset on arrival
    if (!u._mv) moveTo(w, u, home.x, home.y, 24, false);
    stepMove(w, u, dt);
    return;
  }
  if (!u._aggro) return;
  if (Math.hypot(u.x - c.x, u.y - c.y) > c.leash) { startReturn(w, c); return; }
  let t = u._tgt;
  if (t && (!attackable(u, t) || Math.hypot(t.x - c.x, t.y - c.y) > c.leash + 250)) t = u._tgt = null;
  if (!t || ((w.tick + u._nid) % 6) === 0) {
    const n = acquire(w, u, u._acq);
    if (n && Math.hypot(n.x - c.x, n.y - c.y) <= c.leash + 250 && (!t || (n.kind === KIND.HERO && t.kind !== KIND.HERO))) t = u._tgt = n;
  }
  if (!t) {
    u._idleT += dt;
    if (u._idleT >= IDLE_DROP) startReturn(w, c);
    return;
  }
  u._idleT = 0;
  if (u._roshan && w.time >= u._slamAt && Math.hypot(t.x - u.x, t.y - u.y) - t.radius <= 300) slam(w, u);
  chase(w, u, t, dt);
}

// ---------------------------------------------------------------------------------------------------------------- Roshan
function roshanDeath(w, v, killer, kh) {
  const R = w.rosh;
  R.unit = null; R.members = []; R.deaths++;
  w.after(ROSH_RESPAWN[0] + w.rand() * (ROSH_RESPAWN[1] - ROSH_RESPAWN[0]), () => spawnRoshan(w));
  const team = kh ? kh.team : killer && (killer.team === TEAM.RADIANT || killer.team === TEAM.DIRE) ? killer.team : -1;
  if (team < 0) return;
  const cands = [];
  if (kh && !kh._dead) cands.push(kh);
  const rest = [];
  for (const h of w.units.values()) if (h.kind === KIND.HERO && !h._dead && h.team === team && h !== kh) rest.push(h);
  rest.sort((a, b) => Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(b.x - v.x, b.y - v.y));
  for (const h of cands.concat(rest)) {
    if (!grantAegis(w, h)) continue;
    const p = w.players.get(h.owner);
    evMsg(w, `${p ? p.name : 'A hero'} picked up the Aegis of the Immortal`);
    return;
  }
}
