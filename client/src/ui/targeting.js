// Pure targeting / order-building logic (DOM-free, node-testable). Used by input.js and hud.js.
import { ORDER, ST, TEAM } from '../../../shared/protocol.js';
import { ULT_LEVELS, DENY_HP_PCT } from '../../../shared/constants.js';
import { HEROES } from '../../../shared/heroes.js';
import { DATA } from '../../../shared/data.js';

export const ITEM_CODES = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN'];
export const ITEM_LETTERS = ['Z', 'X', 'C', 'V', 'B', 'N'];

/** Hotkey letters of a hero's ability slots (['Q','W','E','R'] or Invoker's Q W E D F R). */
export function heroKeyLetters(heroKey) {
  const h = HEROES[heroKey];
  return h ? h.keys : ['Q', 'W', 'E', 'R'];
}

/** KeyboardEvent.code -> ability slot index for this hero, or -1. */
export function abilitySlotForCode(heroKey, code) {
  if (!code || !code.startsWith('Key')) return -1;
  return heroKeyLetters(heroKey).indexOf(code.slice(3));
}
export const itemSlotForCode = (code) => ITEM_CODES.indexOf(code);

const at = (arr, level) => (Array.isArray(arr) && arr.length ? arr[Math.min(Math.max((level | 0) || 1, 1), arr.length) - 1] : arr);

/**
 * How a spell / item is aimed.
 * @returns {{mode:'none'|'unit'|'point'|'unitpoint'|'passive', range:number, radius:number, team:string|null, toggle:boolean}}
 */
export function targetInfo(kind, key, level = 1, data = DATA) {
  const d = kind === 'item' ? data.items[key] : data.abilities[key];
  const out = { mode: 'passive', range: 0, radius: 0, team: null, toggle: false };
  if (!d) return out;
  const b = d.behavior || [];
  const has = (f) => b.indexOf(f) >= 0;
  out.range = Number(kind === 'item' ? d.castRange : at(d.castRange, level)) || 0;
  out.team = d.targetTeam || null;
  if (d.values) {
    for (const n of ['radius', 'area_of_effect', 'aoe', 'bolt_aoe', 'effect_radius']) {
      if (d.values[n] !== undefined) { const v = Number(at(d.values[n], level)); if (v > 0) { out.radius = v; break; } }
    }
  }
  if (has('TOGGLE') || has('AUTOCAST')) { out.mode = 'none'; out.toggle = true; return out; }
  if (has('PASSIVE') && !has('UNIT_TARGET') && !has('POINT')) return out;
  if (has('UNIT_TARGET') && has('POINT')) out.mode = 'unitpoint';
  else if (has('UNIT_TARGET')) out.mode = 'unit';
  else if (has('POINT')) out.mode = 'point';
  else out.mode = 'none';
  return out;
}

/** Is `unit` an acceptable target for a spell that wants `team` ('ENEMY' | 'FRIENDLY' | 'BOTH' | null)? */
export function teamOk(team, unit, myTeam) {
  if (!unit) return false;
  if (team === 'ENEMY') return unit.team !== myTeam;
  if (team === 'FRIENDLY') return unit.team === myTeam;
  return true;
}

/**
 * Can the hero use ability `slot` right now? (soft check for UI feedback; the server stays authoritative)
 * @returns {{ok:boolean, reason?:string}}
 */
export function abilityReady(u, slot, data = DATA) {
  const ab = u && u.abilities && u.abilities[slot];
  if (!ab || !ab.key) return { ok: false, reason: 'empty' };
  if (!(ab.level >= 1)) return { ok: false, reason: 'Not learned' };
  const info = targetInfo('ability', ab.key, ab.level, data);
  if (info.mode === 'passive') return { ok: false, reason: 'Passive' };
  const st = u.status | 0;
  if (st & (ST.STUN | ST.HEX | ST.DEAD)) return { ok: false, reason: 'Disabled' };
  if (st & ST.SILENCE) return { ok: false, reason: 'Silenced' };
  if (ab.cd > 0.05) return { ok: false, reason: 'On cooldown' };
  if (u.mana < (ab.mana || 0)) return { ok: false, reason: 'Not enough mana' };
  return { ok: true };
}

export function itemReady(u, slot, data = DATA) {
  const it = u && u.items && u.items[slot];
  if (!it || !it.key) return { ok: false, reason: 'empty' };
  const info = targetInfo('item', it.key, 1, data);
  if (info.mode === 'passive') return { ok: false, reason: 'Passive' };
  const st = u.status | 0;
  if (st & (ST.STUN | ST.HEX | ST.DEAD)) return { ok: false, reason: 'Disabled' };
  if (st & ST.MUTE) return { ok: false, reason: 'Muted' };
  if (it.cd > 0.05) return { ok: false, reason: 'On cooldown' };
  const d = data.items[it.key];
  if (d && d.manaCost > u.mana) return { ok: false, reason: 'Not enough mana' };
  return { ok: true };
}

/** Level the hero needs for the next rank of `ab` (mirrors server heroes.js requiredLevel). */
export function requiredLevel(ab, data = DATA) {
  const d = data.abilities[ab.key];
  return d && d.ult ? ULT_LEVELS[Math.min(ab.level, ULT_LEVELS.length - 1)] : 1 + 2 * ab.level;
}

/** Can ability `slot` be levelled up now (skill point available, not capped, hero level high enough)? */
export function canLearn(u, slot, data = DATA) {
  const ab = u && u.abilities && u.abilities[slot];
  if (!ab || !(u.skillPoints > 0)) return false;
  const hs = HEROES[u.key]; if (hs && hs.stolen && hs.stolen.indexOf(slot) >= 0) return false;   // Rubick's stolen-spell slots
  const d = data.abilities[ab.key];
  if (!d || (d.behavior || []).indexOf('NOT_LEARNABLE') >= 0 || ab.level >= d.maxLevel) return false;
  return u.level >= requiredLevel(ab, data);
}

/** Max level shown as pips for a slot (invoked spells / invoke: no pips). */
export function pipCount(key, data = DATA) {
  const d = data.abilities[key];
  if (!d || (d.behavior || []).indexOf('NOT_LEARNABLE') >= 0) return 0;
  return d.maxLevel > 1 ? d.maxLevel : 0;
}

// ---- order builders
const q = (o, queue) => { if (queue) o.q = true; return o; };

export function orderMove(x, y, queue) { return q({ t: ORDER.MOVE, x, y }, queue); }
export function orderAttack(id, queue) { return q({ t: ORDER.ATTACK, id }, queue); }
export function orderAmove(x, y, queue) { return q({ t: ORDER.AMOVE, x, y }, queue); }

/** Cast/item order. target: { unitId } | { x, y } | null. */
export function orderCast(kind, slot, target, queue) {
  const o = { t: kind === 'item' ? ORDER.ITEM : ORDER.CAST, slot };
  if (target) { if (target.unitId) o.id = target.unitId; else if (Number.isFinite(target.x)) { o.x = target.x; o.y = target.y; } }
  return q(o, queue);
}

/**
 * Right-click on the ground / a unit. pick = { x, y, unitId|null }.
 * ctx = { myTeam, getUnit(id) }.
 */
export function orderForRightClick(pick, ctx, queue) {
  const u = pick.unitId ? ctx.getUnit(pick.unitId) : null;
  if (u && u.team !== ctx.myTeam && u.team !== TEAM.NONE) return orderAttack(pick.unitId, queue);
  if (u && u.team === ctx.myTeam && u.maxHp > 0 && u.hp / u.maxHp < DENY_HP_PCT && (u.kind === 'creep')) return orderAttack(pick.unitId, queue);   // deny
  return orderMove(pick.x, pick.y, queue);
}

/** Left-click while the A (attack-move) cursor is armed: enemy unit -> attack it, otherwise attack-move there. */
export function orderForAttackClick(pick, ctx, queue) {
  const u = pick.unitId ? ctx.getUnit(pick.unitId) : null;
  if (u && u.team !== ctx.myTeam && u.team !== TEAM.NONE) return orderAttack(pick.unitId, queue);
  return orderAmove(pick.x, pick.y, queue);
}

/**
 * Left-click while a spell is armed.
 * tg = { kind:'ability'|'item', slot, info }  (info from targetInfo)
 * @returns {{order?:object, error?:string}}
 */
export function resolveTargetClick(tg, pick, ctx, queue) {
  const { info } = tg;
  const unit = pick.unitId ? ctx.getUnit(pick.unitId) : null;
  if (info.mode === 'point') return { order: orderCast(tg.kind, tg.slot, { x: pick.x, y: pick.y }, queue) };
  if (unit && teamOk(info.team, unit, ctx.myTeam)) return { order: orderCast(tg.kind, tg.slot, { unitId: pick.unitId }, queue) };
  if (info.mode === 'unitpoint') return { order: orderCast(tg.kind, tg.slot, { x: pick.x, y: pick.y }, queue) };
  return { error: unit ? 'Invalid target' : 'Must target a unit' };
}

/** Self-cast (double-tap / Alt+key): unit-target spells on my own hero, point spells at my feet. */
export function resolveSelfCast(tg, hero, queue) {
  const { info } = tg;
  if (info.mode === 'point') return { order: orderCast(tg.kind, tg.slot, { x: hero.x, y: hero.y }, queue) };
  if (teamOk(info.team, hero, hero.team)) return { order: orderCast(tg.kind, tg.slot, { unitId: hero.id }, queue) };
  return { error: 'Invalid target' };
}
