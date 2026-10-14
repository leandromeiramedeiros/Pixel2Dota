// Map buildings: spawn from getMap().ents, tier protection, tower/fountain AI, ancient -> win. Pure.
import { KIND, TEAM, ST } from '../../../shared/protocol.js';
import { FOUNTAIN_RADIUS, FOUNTAIN_HP_PCT, FOUNTAIN_MANA_PCT } from '../../../shared/constants.js';
import { getMap } from '../../../shared/map.js';
import { makeBuilding } from './units.js';
import { attackable, inAttackRange } from './combat.js';
import { retarget } from './creeps.js';
import { evEnd } from './events.js';

const teamOf = (s) => (s.startsWith('good') ? TEAM.RADIANT : TEAM.DIRE);

/** Create every building from the map and register them in `w` (w.rax, w.towers, w.fountains, w.forts, w.shops). */
export function spawnBuildings(w) {
  const E = getMap().ents;
  w.rax = []; w.towers = []; w.forts = []; w.fountains = []; w.buildings = []; w.shops = [[], []];
  const add = (ent, info) => {
    const u = makeBuilding(w, ent, info);
    w.addUnit(u);
    w.buildings.push(u);
    if (info.kind !== KIND.FOUNTAIN) w.nav.blockCircle(u.x, u.y, u.radius, true);
    return u;
  };
  for (const t of E.tower) {
    const m = /^dota_(goodguys|badguys)_tower(\d)_(top|mid|bot)$/.exec(t.name || ''); if (!m) continue;
    const tier = +m[2];
    w.towers.push(add(t, { kind: KIND.TOWER, team: teamOf(m[1]), tier, lane: m[3], dataKey: 'tower' + tier }));
  }
  for (const r of E.barracks) {
    const m = /^(good|bad)_rax_(melee|range)_(top|mid|bot)$/.exec(r.name || ''); if (!m) continue;
    w.rax.push(add(r, { kind: KIND.RAX, team: teamOf(m[1]), lane: m[3], dataKey: m[2] === 'melee' ? 'melee_rax' : 'ranged_rax', rax: m[2] }));
  }
  for (const f of E.fort) {
    const m = /^dota_(goodguys|badguys)_fort$/.exec(f.name || ''); if (!m) continue;
    const u = add(f, { kind: KIND.ANCIENT, team: teamOf(m[1]), dataKey: 'fort' });
    w.forts[u.team] = u;
  }
  for (const f of E.fountain) {
    const m = /fountain_(good|bad)$/.exec(f.name || ''); if (!m) continue;
    const u = add(f, { kind: KIND.FOUNTAIN, team: teamOf(m[1]), dataKey: 'fountain' });
    w.fountains[u.team] = u;
  }
  // shops are unnamed: the two nearest each fountain belong to that team
  const shops = E.shop.map((s) => ({ x: s.x, y: s.y }));
  for (const team of [TEAM.RADIANT, TEAM.DIRE]) {
    const f = w.fountains[team]; if (!f) continue;
    w.shops[team] = shops.slice().sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y)).slice(0, 2);
  }
  refreshProtection(w);
}

const alive = (u) => !!u && !u._dead;

/** Recompute `_protected` (shown as ST.INVULN) for every building from the standing set. */
export function refreshProtection(w) {
  const by = {};
  for (const b of w.towers) if (!b._dead) by[b.team + ':' + b._lane + ':' + b._tier] = b;
  for (const team of [TEAM.RADIANT, TEAM.DIRE]) {
    const anyT3Down = ['top', 'mid', 'bot'].some((l) => !by[team + ':' + l + ':3']);
    const anyT4 = w.towers.some((b) => b.team === team && b._tier === 4 && !b._dead);
    for (const b of w.buildings) {
      if (b.team !== team || b._dead) continue;
      let p = false;
      if (b.kind === KIND.TOWER) {
        if (b._tier === 2) p = alive(by[team + ':' + b._lane + ':1']);
        else if (b._tier === 3) p = alive(by[team + ':' + b._lane + ':2']);
        else if (b._tier === 4) p = !anyT3Down;
      } else if (b.kind === KIND.RAX) p = alive(by[team + ':' + b._lane + ':3']);
      else if (b.kind === KIND.ANCIENT) p = anyT4;
      else if (b.kind === KIND.FOUNTAIN) p = true;
      if (b._protected !== p) {
        b._protected = p;
        b._dirty = true;
        if (p) b._st |= ST.INVULN; else b._st &= ~ST.INVULN;
        b.status = b._st;
      }
    }
  }
}

export function onBuildingDeath(w, v, killer) {
  w.nav.blockCircle(v.x, v.y, v.radius, false);
  refreshProtection(w);
  if (v.kind === KIND.ANCIENT && w.winner < 0) {
    w.winner = v.team === TEAM.RADIANT ? TEAM.DIRE : TEAM.RADIANT;
    evEnd(w, w.winner);
  }
}

export function buildingThink(w, u, dt) {
  if (u.kind === KIND.FOUNTAIN) fountainHeal(w, u, dt);
  if (u.atkRate <= 0 || u._st & ST.STUN) { u._tgt = null; return; }
  let t = u._tgt;
  if (t && !(attackable(u, t) && inAttackRange(u, t, 0))) t = u._tgt = null;
  if (!t || ((w.tick + u._nid) % 6) === 0) u._tgt = retarget(w, u, u.atkRange);
}

function fountainHeal(w, u, dt) {
  if (((w.tick + u._nid) & 1) !== 0) return;   // every other tick, double amount
  const list = w.unitsInRadius(u.x, u.y, FOUNTAIN_RADIUS, { allyOf: u, buildings: false });
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    v.hp = Math.min(v.maxHp, v.hp + v.maxHp * FOUNTAIN_HP_PCT * dt * 2);
    if (v.maxMana > 0) v.mana = Math.min(v.maxMana, v.mana + v.maxMana * FOUNTAIN_MANA_PCT * dt * 2);
  }
}
