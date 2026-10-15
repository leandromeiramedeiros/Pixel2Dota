// Unit factory. Units are plain objects with the SCHEMA field names (docs/ARCHITECTURE.md) plus private `_` fields.
//
// Private fields (stable, abilities/items/bots may read them):
//   radius       hull radius            _dead  bool            _st  status bitmask (== status, before DEAD/derived bits)
//   _mods        modifiers (status.js)  _q     order queue     _base base stats (see below)
//   _ranged      bool                   _asMult attack speed / 100      _interval seconds between attacks   _windup seconds from attack start to hit/launch
//   _mr          magic resistance 0..1  _hpRegen/_manaRegen per second  _cd attack cooldown   _wind windup timer
//   _lane 'top'|'mid'|'bot'   _tier 1..4   _building bool   _owner unit id of owner hero (summons) / creep wave id etc.
//   _channel     active channel {key,left,...}   _kb knockback state   _lastPlayerDmg time of last damage taken from a hero
import { KIND, TEAM, ST, ABF, INV_SLOTS } from '../../../shared/protocol.js';
import { HEROES } from '../../../shared/heroes.js';

const has = (arr, f) => !!arr && arr.indexOf(f) >= 0;

export function abilityFlags(data) {
  const b = data ? data.behavior || [] : [];
  let f = 0;
  if (has(b, 'PASSIVE')) f |= ABF.PASSIVE;
  if (has(b, 'NO_TARGET')) f |= ABF.NO_TARGET;
  if (has(b, 'UNIT_TARGET')) f |= ABF.UNIT_TARGET;
  if (has(b, 'POINT')) f |= ABF.POINT_TARGET;
  if (has(b, 'HIDDEN')) f |= ABF.HIDDEN;
  return f;
}

function common(w, o) {
  const b = o.base;
  return {
    id: w.nextId(), _nid: w._id, kind: o.kind, key: o.key, team: o.team, owner: o.owner || '',
    x: o.x, y: o.y, facing: o.facing === undefined ? (o.team === TEAM.RADIANT ? Math.PI / 4 : -Math.PI * 3 / 4) : o.facing,
    anim: 'idle', animSeq: 0, animRate: 1,
    hp: b.hp, maxHp: b.hp, mana: b.mana, maxMana: b.mana, level: 1, status: 0, ms: b.ms,
    xp: 0, str: b.str || 0, agi: b.agi || 0, int: b.int || 0, dmgMin: b.dmgMin, dmgMax: b.dmgMax, dmgBonus: 0, armor: b.armor,
    atkRate: b.bat > 0 ? 1 / b.bat : 0, atkRange: b.atkRange, skillPoints: 0, respawn: 0, orbs: '',
    abilities: [], items: [], buffs: [],
    radius: o.radius || b.hull || 16,
    _dead: false, _st: 0, _mods: [], _q: [], _base: b, _dirty: true,
    _ranged: b.projSpeed > 0 && b.atkRange >= 300, _asMult: 1, _interval: b.bat || 1, _windup: b.atkPoint || 0.4,
    _mr: (b.mr || 0), _hpRegen: b.hpRegen || 0, _manaRegen: b.manaRegen || 0,
    _wind: 0, _windTgt: null, _cd: 0, _mv: null, _kb: null, _channel: null, _auto: null, _scanT: 0,
    _lane: o.lane || '', _tier: o.tier || 0, _building: !!o.building, _projKey: o.projKey || '',
    _tgt: null, _moved: false, _animUntil: 0, _animType: '', _turn: 20, _assist: null, _lastPlayerDmg: -99, _dmgBy: null, _atkHeroT: -99, _atkHeroId: '', _forced: null, _forcedT: 0,
    _visDay: o.visDay || 800, _visNight: o.visNight || 800, _protected: false,
  };
}

const visNight = (day) => Math.round(Math.min(day, Math.max(600, day * 0.6)));

export function creepKeys(team) { const s = team === TEAM.RADIANT ? 'goodguys' : 'badguys'; return { melee: s + '_melee', ranged: s + '_ranged', siege: s + '_siege' }; }

/** Lane creep. grade: '' | 'upgraded' (super: the enemy barracks of that type in this lane is down) | 'upgraded_mega' (all enemy barracks down).
 *  Stats/bounty come from the graded unit; the wire `key` stays the base creep key (the client has one model per type). */
export function makeCreep(w, team, type, x, y, lane, grade) {
  const k0 = creepKeys(team)[type], d = w.data.units[grade ? k0 + '_' + grade : k0] || w.data.units[k0];
  const base = { hp: d.hp, mana: d.mana, hpRegen: d.hpRegen, armor: d.armor, mr: (d.mr || 0) / 100, dmgMin: d.dmgMin, dmgMax: d.dmgMax, bat: d.bat, atkPoint: d.atkPoint, atkRange: d.atkRange, projSpeed: d.projSpeed, ms: d.ms, hull: d.hull, baseAS: 100, xp: d.xp, goldMin: d.goldMin, goldMax: d.goldMax, turnRate: d.turnRate || 0.5 };
  const u = common(w, { kind: KIND.CREEP, key: w.data.units[k0].key, team, x, y, base, lane, radius: d.hull || 16, projKey: type === 'siege' ? 'siege' : type === 'ranged' ? 'creep_ranged' : '', visDay: d.vision, visNight: d.vision });
  u._type = type; u._grade = grade || ''; u._acq = d.acq || 500;
  return u;
}

/** Neutral camp creep / Roshan from baked DATA.units['neutral_<name>'] | ['roshan']. Team NEUTRAL, KIND.CREEP, no lane. o: {radius?} */
export function makeNeutral(w, name, x, y, o = {}) {
  const d = w.data.units[name === 'roshan' ? 'roshan' : 'neutral_' + name];
  if (!d) throw new Error('unknown neutral ' + name);
  const base = { hp: d.hp, mana: d.mana, hpRegen: d.hpRegen, armor: d.armor, mr: (d.mr || 0) / 100, dmgMin: d.dmgMin, dmgMax: d.dmgMax, bat: d.bat, atkPoint: d.atkPoint, atkRange: d.atkRange, projSpeed: d.projSpeed, ms: d.ms, hull: d.hull, baseAS: 100, xp: d.xp, goldMin: d.goldMin, goldMax: d.goldMax, turnRate: d.turnRate || 0.5 };
  const ranged = d.projSpeed > 0 && d.atkRange >= 300;
  const u = common(w, { kind: KIND.CREEP, key: d.key, team: TEAM.NEUTRAL, x, y, base, radius: o.radius || Math.max(d.hull, 16), projKey: ranged ? 'creep_ranged' : '', visDay: d.vision || 800, visNight: Math.min(d.vision || 800, 800) });
  u._neutral = name; u._acq = d.acq || 500;
  return u;
}

export function makeBuilding(w, ent, info) {
  // info: {kind, team, tier, lane, dataKey, rax}
  const d = w.data.units[info.dataKey];
  const base = { hp: d.hp, mana: 0, hpRegen: d.hpRegen, armor: d.armor, mr: (d.mr || 0) / 100, dmgMin: d.dmgMin, dmgMax: d.dmgMax, bat: d.bat, atkPoint: d.atkPoint, atkRange: d.atkRange, projSpeed: d.projSpeed, ms: 0, hull: d.hull, baseAS: 100, goldMin: d.goldMin, goldMax: d.goldMax, xp: d.xp, turnRate: d.turnRate || 1 };
  const u = common(w, { kind: info.kind, key: ent.name, team: info.team, x: ent.x, y: ent.y, base, lane: info.lane, tier: info.tier, building: true, radius: Math.min(d.hull, 144), projKey: info.kind === KIND.TOWER ? 'tower' : info.kind === KIND.FOUNTAIN ? 'fountain' : '', visDay: d.vision, visNight: visNight(d.vision) });
  u._rax = info.rax || ''; u._acq = d.acq || d.atkRange || 0;
  u._bounty = [d.goldMin, d.goldMax];
  return u;
}

/** Hero at level 1 with abilities (level 0) and 6 empty item slots. */
export function makeHero(w, o) {
  const d = w.data.heroes[o.heroKey];
  if (!d) throw new Error('unknown hero ' + o.heroKey);
  const base = {
    hp: d.hp, mana: d.mana, hpRegen: d.hpRegen, manaRegen: d.manaRegen, armor: d.armor, mr: (d.mr > 1 ? d.mr / 100 : d.mr), dmgMin: d.dmgMin, dmgMax: d.dmgMax,
    bat: d.bat, atkPoint: d.atkPoint, atkRange: d.atkRange, projSpeed: d.projSpeed, ms: d.ms, hull: d.hull, baseAS: d.baseAS || 100,
    str: d.str, agi: d.agi, int: d.int, strGain: d.strGain, agiGain: d.agiGain, intGain: d.intGain, attr: d.attr, turnRate: d.turnRate,
  };
  const fx = w.fountains[o.team];
  const u = common(w, { kind: KIND.HERO, key: o.heroKey, team: o.team, owner: o.pid, x: o.x !== undefined ? o.x : fx ? fx.x : 0, y: o.y !== undefined ? o.y : fx ? fx.y : 0, base, radius: d.hull || 24, projKey: d.short, visDay: d.visionDay, visNight: d.visionNight });
  u._short = d.short; u._acq = d.acq || 800;
  u._ranged = d.projSpeed > 0 && d.atkRange >= 300;
  const roster = HEROES[o.heroKey];
  const keys = roster ? roster.abilities : d.abilities;
  u.abilities = keys.map((key) => {
    const ad = w.data.abilities[key];
    const innate = !!ad && (ad.behavior || []).includes('PASSIVE') && (ad.behavior || []).includes('HIDDEN') && ad.maxLevel === 1;
    return { key, level: innate ? 1 : 0, cd: 0, cdMax: 0, mana: 0, flags: abilityFlags(ad) };
  });
  for (let i = 0; i < INV_SLOTS; i++) u.items.push({ key: '', charges: 0, cd: 0, cdMax: 0 });
  u.skillPoints = 1;
  u._streak = 0; u._gfrac = 0;
  return u;
}

/** Generic summon / ward / spirit. o: {key, x, y, hp, armor, dmgMin, dmgMax, atkRange, bat, atkPoint, projSpeed, ms, radius, dur, mr, vision, kind?, think?, noAttack?, noCollide?} */
export function makeSummon(w, owner, o) {
  const base = { hp: o.hp || 200, mana: 0, hpRegen: o.hpRegen || 0, armor: o.armor || 0, mr: o.mr || 0, dmgMin: o.dmgMin || 0, dmgMax: o.dmgMax || 0, bat: o.bat || 1.5, atkPoint: o.atkPoint || 0.4, atkRange: o.atkRange || 128, projSpeed: o.projSpeed || 0, ms: o.ms || 350, hull: o.radius || 16, baseAS: 100, turnRate: 0.6 };
  const u = common(w, { kind: o.kind || KIND.SUMMON, key: o.key, team: owner.team, owner: owner.owner || owner.id, x: o.x, y: o.y, base, radius: o.radius || 16, projKey: o.projKey || '', visDay: o.vision || 800, visNight: o.vision || 800 });
  u._summonOf = owner.id; u._expire = o.dur ? w.time + o.dur : Infinity; u._think = o.think || null; u._noAttack = !!o.noAttack; u._noCollide = !!o.noCollide;
  u._ranged = base.projSpeed > 0 && base.atkRange >= 300;
  if (o.noAttack) u._st |= 0;
  return u;
}
