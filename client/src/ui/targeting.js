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

// ---- camera near-plane clipping for world overlays (rangefinder).  THREE-free: inject a depth function.
// Projecting a point BEHIND the perspective camera (clip w <= 0) flips it across the screen, so a hero that the camera has panned away
// from (a global spell aimed over the river) made the rangefinder line start at the far side of the map.  Clip the geometry first.
/** (x, y) -> view depth (distance along the camera's forward axis) of the ground point at height h; > 0 = in front of the camera. */
export function makeDepthFn(camera, h = 0) {
  const e = camera.matrixWorldInverse.elements;       // three coords: X = x, Y = height, Z = -y
  return (x, y) => -(e[2] * x + e[6] * h + e[10] * -y + e[14]);
}

/** Clip the segment a-b ([x,y] points) to depth >= d.  Returns [a', b'] or null when entirely behind. */
export function clipSegmentNear(a, b, depth, d) {
  const da = depth(a[0], a[1]) - d, db = depth(b[0], b[1]) - d;
  if (da >= 0 && db >= 0) return [a, b];
  if (da < 0 && db < 0) return null;
  const t = da / (da - db), p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return da < 0 ? [p, b] : [a, p];
}

/** Sutherland-Hodgman clip of a closed polygon ([x,y] points) to depth >= d. */
export function clipPolyNear(pts, depth, d) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const da = depth(a[0], a[1]) - d, db = depth(b[0], b[1]) - d;
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}

// ---- touch ability wheel order (which wheel position shows which ability slot).  order[pos] = slot.
/** A valid permutation of 0..n-1, else the identity. */
export function normalizeOrder(arr, n) {
  const id = Array.from({ length: Math.max(0, n | 0) }, (_, i) => i);
  if (!Array.isArray(arr) || arr.length !== id.length) return id;
  const seen = new Set();
  for (const v of arr) { if (!Number.isInteger(v) || v < 0 || v >= id.length || seen.has(v)) return id; seen.add(v); }
  return arr.slice();
}
/** Swap the slots shown at wheel positions i and j. */
export function swapOrder(order, i, j) {
  const o = order.slice();
  if (i === j || i < 0 || j < 0 || i >= o.length || j >= o.length) return o;
  [o[i], o[j]] = [o[j], o[i]];
  return o;
}
export const wheelKey = (heroKey) => 'p2d.wheel.' + String(heroKey);
/** storage = anything with getItem / setItem (localStorage, or a stub); never throws. */
export function loadWheelOrder(storage, heroKey, n) {
  try { return normalizeOrder(JSON.parse(storage.getItem(wheelKey(heroKey))), n); } catch { return normalizeOrder(null, n); }
}
export function saveWheelOrder(storage, heroKey, order) {
  try {
    const id = order.every((v, i) => v === i);
    if (id) { if (storage.removeItem) storage.removeItem(wheelKey(heroKey)); else storage.setItem(wheelKey(heroKey), JSON.stringify(order)); }
    else storage.setItem(wheelKey(heroKey), JSON.stringify(order));
    return true;
  } catch { return false; }
}
/** Index of the point closest to (x, y) within maxD, else -1.  pts = [{x, y}] */
export function nearestIndex(pts, x, y, maxD) {
  let best = -1, bd = maxD;
  pts.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i; } });
  return best;
}

/** HUD cover as fractions of the screen height, for renderer.setViewInset: top bar bottom edge, bottom panel top edge (px; null = none). */
export const INSET_MAX = { top: 0.2, bottom: 0.35 };   // sanity ceilings: the phone top bar is ~0.1, the portrait cluster ~0.25; a bigger reading is a mid-rotation / overlay rect
export function hudInset(topBottomPx, bottomTopPx, screenH, max = INSET_MAX) {
  if (!(screenH > 0)) return { top: 0, bottom: 0 };
  const c = (v, m) => Math.max(0, Math.min(m, v));
  return {
    top: c((topBottomPx > 0 ? topBottomPx : 0) / screenH, max.top),
    bottom: bottomTopPx != null && bottomTopPx < screenH ? c((screenH - bottomTopPx) / screenH, max.bottom) : 0,
  };
}

/** Portrait gestures: press-and-hold HOLD_MS shows the stats panel while held; a short still tap (so also a double tap / click) centres on the hero. */
export const PORTRAIT = { HOLD_MS: 500, MOVE: 12 };
/** 'tap' (short, still) | 'stats' (held long enough, still) | 'cancel' (the pointer wandered off). */
export function portraitPhase(heldMs, movedPx, o = PORTRAIT) {
  if (movedPx > o.MOVE) return 'cancel';
  return heldMs >= o.HOLD_MS ? 'stats' : 'tap';
}
