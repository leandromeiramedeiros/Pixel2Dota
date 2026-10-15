// Touch / mobile controls (Wild Rift / Albion style).  createTouch({ root, canvas, renderer, hud, input, sheets, getState, mySid, send }) -> { destroy(), isActive() }
//   Active when `?touch=1`, or a coarse pointer, or the first touch event.  Desktop mouse + keyboard play is untouched.
//   LEFT   floating joystick (left 40%, below the top bar) -> move orders toward hero + dir * 300, ~8 Hz, stop on release.
//   RIGHT  attack button: tap = target lock > nearest enemy hero > nearest enemy unit > attack-move forward; press-and-drag = aim (the enemy closest to the
//          drag highlights, heroes first; release attacks it, drag back / onto CANCEL cancels).  LH = last-hit / structure button, lock/cycle button.
//          Wheel = spell arc (arcLayout) + an outer arc of up to 6 small item slots (smallArcLayout): only USABLE main items, packed, in the player's
//          per-hero order (by inventory slot; new items append).  No item row and no hotkey letters on touch.  BAG button (left of attack) opens a
//          popover: 6 main + 3 backpack cells (all items); drag cell -> cell = ORDER.SWAP, cell -> small slot = wheel order, tap = tooltip (+ SELL in
//          shop range); tap outside / BAG closes.
//          Hold a spell / item button still: 0.75 s = its tooltip (release without moving = NO cast), 1.75 s = rearrange the wheel (drag a spell / small
//          item onto another slot; DONE or a tap outside exits; saved per hero).  See holdPhase().
//          Aim cursor = button + drag x sensitivity s (menu, p2d.aimSens; attack drag / pad radius AIM_R / s); the knob shows the cursor.
//          Spell aim (aimCursor): the cursor starts at the hero's preview point; the thumb's comfortable reach sweeps it to the screen edge (edge pan there).
//          instant spells: tap casts.  self-castable spells / items: double tap casts on self (blink = toward facing), hold to aim.
//          other targeted spells: press -> range finder + aim ring; the ICON STAYS PUT, the knob follows the aim cursor; drag aims, release casts.
//          Cancel: release on the CANCEL target above the wheel, or slide back onto the button.  A short tap only previews the range.
//          The move joystick keeps working while a spell / attack is aimed (the other thumb), the rangefinder stays on the hero.
//   WORLD  camera = intents to renderer.cam (render/camdir.js); locked to the hero by default (CAM toggles it), the joystick leads it, the aim point
//          leans it.  Locked one-finger press (classifyPress): tap = move there (an enemy: attack it); hold still = keep moving to the finger (WALK_MS
//          repeat); quick deliberate drag = peek (look around, springs back on release).  Unlocked: drag pans.  Pinch zooms.  Minimap (top-left, under
//          the top bar) suspends the lock while pressed (cast on a far spot with the other thumb) and the camera returns when it / that cast ends; the
//          aim CURSOR of a long-range spell at a screen edge pans fast.  Portrait tap locks + resets the zoom, portrait hold = stats panel (hud.js).
//   Portrait phones get a "turn your phone sideways" overlay that blocks input.
import { MSG, ORDER, TEAM, ST, KIND, ACTIVE_SLOTS, INV_SLOTS } from '../../../shared/protocol.js';
import { MAP_MIN, MAP_MAX } from '../../../shared/constants.js';
import { GLYPHS } from './glyphs.js';
import { pixelEl, paintInto } from './pixels.js';
import { fmtCd, sweepDeg, prettyName, fmtGold } from './format.js';
import { inShopRange, sellValue } from './shopdata.js';
import { h } from './panels.js';
import {
  targetInfo, abilityReady, itemReady, canLearn, orderMove, orderCast, orderAttack, orderAmove, teamOk,
  swapOrder, loadWheelOrder, saveWheelOrder, nearestIndex, hudInset, normalizeOrder,
} from './targeting.js';
import { DATA } from '../../../shared/data.js';
import { injectTouchStyle } from './style.js';
import { classifyPress, dragToWorld } from '../render/camdir.js';

// ------------------------------------------------------------------------------------------------ tunables
export const T = {
  JOY_RANGE: 300,        // world units ahead of the hero a joystick move order points at
  JOY_MS: 125,           // ~8 Hz re-issue
  JOY_MIN_MS: 80,        // floor for direction-change early sends
  JOY_ANGLE: 15,         // degrees of change that justifies an early send
  JOY_DEAD: 10,          // px
  JOY_R: 56,             // px, joystick base radius
  DOUBLE_MS: 320,        // double-tap window
  LONG_MS: 450,          // (legacy) press-and-hold
  TIP_MS: 750,           // spell / item button held still this long: tooltip (release does not cast)
  TAP_MS: 220,           // a press shorter than this (and not dragged) is a tap
  TAP_MOVE: 14,          // px
  PAN_SLOP: 8,           // px before a one-finger drag pans
  AIM_R: 96,             // px, drag radius that maps to the full cast range
  ATK_EXTRA: 300,        // attack-button search radius = attack range + this
  SNAP: 380,             // world units: unit-target aim snaps to the nearest unit within this of the aim point
  SUPPRESS_MS: 320,      // joystick stays quiet this long after a cast / attack order so it is not overwritten
  ZOOM_FAR: 1450,       // touch camera: maximum distance (pinch out up to here)
  ZOOM_START: 1450,     // starting distance = ZOOM_FAR: touch starts at the furthest zoom (director's call); pinch in only. The phone HUD rings the
                        // edges (~76% height x ~56% width free), so the wide view keeps the playfield readable
  ZONE: 0.4,             // joystick zone = left 40% of the screen
  ATK_HOLD_MS: 110,      // attack button: a tap fires on release; a press held this long (not dragged) fires then and keeps auto-attacking
  ATK_DRAG: 18,          // px (x K) of drag that turns the attack button into target-aim mode
  ATK_BACK: 10,          // px (x K): dragging back to within this of the button cancels the aim
  ATK_SNAP: 320,         // world units: the aim point snaps to the closest enemy within this (heroes count as closer: ATK_HERO_BIAS)
  ATK_HERO_BIAS: 0.55,
  ATK_CONE: 35,          // degrees: with nothing near the aim point, the enemy closest to the drag DIRECTION within this cone
  LH_EXTRA: 200,         // last-hit button search radius = attack range + this
  REORDER_MS: 1750,      // hold a spell button still this long to rearrange the wheel
  CANCEL_BACK: 0.9,      // sliding back within this x the button radius (after having left it) cancels the aim
  WALK_MS: 150,          // world finger held (locked camera): a move order to the finger this often
  EDGE_M: 56,            // px (x K): aiming a long-range spell with the finger this close to a screen edge pans the camera that way
  EDGE_SPEED: 3200,      // world units / s at the very edge
  EDGE_RANGE: 0.5,       // ... only for spells whose range is over this x the visible width (or global)
  PINCH_MIN: 40,         // px: two fingers closer than this do not zoom (noise)
  PINCH_STEP: 0.1,       // max zoom factor change per move event
  EDGE_MAG: 0.2,         // aim edge pan arms once the cursor leaves the pressed button or the drag passes this x the aim radius
  AIM_REACH_X: 0.22,     // spell aim: thumb travel (x screen width, at default sensitivity) that sweeps the cursor from its start to the far left / right edge
  AIM_REACH_Y: 0.34,     // ... same x screen height, up / down
  AIM_REACH_MIN: 40,     // px (x K): never a shorter reach than this (the thumb has little room on the button's side of the screen)
  AIM_PAD: 12,           // px (x K): thumb room stops this far from the physical screen edge
  AIM_GAMMA: 1.25,       // >1: finer cursor control near the start, faster toward the edge
  AIM_RING_OVER: 1.15,   // finite-range spells: the sweep ends at this x the cast ring on screen (full reach = the ring, no edge pan)
  AIM_START_W: 0.25,     // the aim cursor starts at most this x the visible width ahead of the hero (a global spell does not start off-screen)
  AIM_DEAD: 6,           // px (x K): thumb travel from the press that counts as aiming (below it the preview stays ahead of the hero)
};

const clampW = (v) => Math.max(MAP_MIN, Math.min(MAP_MAX, v));
const TOUCH_PICK = { touch: true };   // renderer.pick option: larger minimum hit boxes for fingers (render/pick.js)
const RAD = Math.PI / 180;

// ------------------------------------------------------------------------------------------------ pure helpers (node-testable)
/** Screen-edge pan direction for a finger at (x, y) in a W x H view: each axis -1..1, ramping in over the last m px (0 = not at that edge). */
export function edgePanDir(x, y, W, H, m) {
  const ax = (v, n) => (v < m ? -Math.min(1, (m - v) / m) : v > n - m ? Math.min(1, (v - (n - m)) / m) : 0);
  return { x: ax(x, W), y: ax(y, H) };
}

/** Touch mode on? `?touch=1` forces it, `?touch=0` disables it, otherwise a coarse primary pointer. */
export function touchWanted(search = '', coarse = false) {
  const m = /[?&]touch=([^&#]*)/.exec(search || '');
  if (m) return !/^(0|false|off|no)$/i.test(m[1]);
  return !!coarse;
}

/** Portrait? The orientation media query, with a size fallback. */
export const isPortrait = (mqMatches, w, hh) => !!mqMatches || (w > 0 && hh > w);

const SELF_POINT = /(^|_)(blink|leap|jump|dash|charge|pounce|hop|tp)(_|$)/;
/**
 * How a spell / item behaves on a touch button.
 *   instant  no target (orbs, invoke, ghost walk, toggles): tap casts.
 *   self     can target self (allied/self unit spells, blink-like point spells): double tap = self cast, hold = aim.
 *   aim      everything else that needs a target: hold = rangefinder, release casts.
 *   passive  nothing to do.
 */
export function castClass(kind, key, level = 1, data) {
  const info = data ? targetInfo(kind, key, level, data) : targetInfo(kind, key, level);
  let cls = 'aim';
  if (info.mode === 'passive') cls = 'passive';
  else if (info.mode === 'none') cls = 'instant';
  else if ((info.mode === 'unit' || info.mode === 'unitpoint') && info.team !== 'ENEMY') cls = 'self';
  else if (info.mode === 'point' && SELF_POINT.test(String(key))) cls = 'self';
  return { cls, info };
}

/** Self-cast target: unit spells on the hero itself, point spells toward the hero's facing at max range. */
export function selfCastTarget(info, hero) {
  if (info.mode === 'point') {
    const r = info.range > 0 ? info.range : 600, f = hero.facing || 0;
    return { x: clampW(hero.x + Math.cos(f) * r), y: clampW(hero.y + Math.sin(f) * r) };
  }
  return { unitId: hero.id };
}

/** HUD scale for a viewport: k for panels/text, bk for the touch buttons.  844x390 -> k .78 / bk .88;  1024x600 -> k 1.09 / bk 1.09. */
export function touchScale(w, hh) {
  const raw = Math.max(1, Math.min(1.5, Math.min(w / 844, hh / 390)));
  const t = Math.max(0, Math.min(1, (raw - 1) / 0.213));
  const k = raw * (0.78 + 0.12 * t);
  return { k, bk: k * (1.13 - 0.13 * t) };
}

const lvAt = (arr, level) => (Array.isArray(arr) ? arr[Math.min(Math.max((level | 0) || 1, 1), arr.length) - 1] : arr);
// skill-shot shapes: widths / length come from the ability's value keys ('range' = cast range)
const SHAPES = {
  mirana_arrow: { type: 'line', w: 'arrow_width', len: 'arrow_range' },
  pudge_meat_hook: { type: 'line', w: 'hook_width', len: 'range' },
  drow_ranger_wave_of_silence: { type: 'line', w: 'wave_width', len: 'wave_length' },
  lion_impale: { type: 'line', w: 'width', len: 'range', lenAdd: 'length_buffer' },
  lina_dragon_slave: { type: 'line', w0: 'dragon_slave_width_initial', w1: 'dragon_slave_width_end', len: 'dragon_slave_distance' },
  invoker_deafening_blast: { type: 'line', w0: 'radius_start', w1: 'radius_end', len: 'travel_distance' },
  invoker_tornado: { type: 'line', w: 'area_of_effect', len: 'travel_distance' },
  drow_ranger_multishot: { type: 'cone', angle: 'arrow_angle', len: 'arrow_range_base' },
};
const EXTRA_AOE = ['light_strike_array_aoe', 'spread_aoe', 'healing_ward_aura_radius'];
/**
 * World shape the rangefinder draws at the aim point.
 *   { type:'circle', radius } | { type:'line', len, w0, w1 } | { type:'cone', len, angle } | { type:'none' }
 */
export function aimShape(kind, key, level, info, data = DATA) {
  const d = kind === 'item' ? data.items[key] : data.abilities[key];
  const v = (d && d.values) || {};
  const num = (n) => Number(lvAt(v[n], level)) || 0;
  const s = SHAPES[key];
  if (s && s.type === 'line') {
    const len = (s.len === 'range' ? info.range : num(s.len)) + (s.lenAdd ? num(s.lenAdd) : 0);
    const w0 = s.w ? num(s.w) : num(s.w0), w1 = s.w ? w0 : num(s.w1);
    if (len > 0 && w0 > 0) return { type: 'line', len, w0, w1: w1 || w0 };
  }
  if (s && s.type === 'cone') { const len = num(s.len), angle = num(s.angle); if (len > 0 && angle > 0) return { type: 'cone', len, angle }; }
  let r = info.radius || 0;
  if (!(r > 0)) for (const n of EXTRA_AOE) { const x = num(n); if (x > 0) { r = x; break; } }
  if (r > 0) return { type: 'circle', radius: r };
  return { type: 'none' };
}

/**
 * Where ability buttons sit around the attack button (angles: 180 = left, 90 = up; r in px at scale 1).
 * Up to 4 spells share one arc; 5-6 (Invoker) use two rings, the first slots on the outer ring.
 */
export function arcLayout(n, r1 = 124, r2 = 198) {
  if (!(n > 0)) return [];
  const out = new Array(n);
  const spread = (count, start, step, r, ring, base) => { for (let i = 0; i < count; i++) out[base + i] = { ring, r, a: start - i * step }; };
  if (n <= 4) { spread(n, 168, 30, r1, 0, 0); return out; }
  const inner = Math.min(4, Math.ceil(n / 2)), outer = n - inner;
  spread(outer, 168, 26, r2, 1, 0);
  spread(inner, 152, 30, r1, 0, outer);
  return out;
}

/**
 * Small item-shortcut slots: one outer arc past the spell rings (r 192 for <= 4 spells, 262 past the Invoker outer ring), clear of the
 * bag button / attack below, the CANCEL target straight up (6, -252) and the top bar on an 844x390 phone.  Always `count` slots.
 */
export function smallArcLayout(n, count = 6) {
  const far = n > 4, r = far ? 262 : 192, a0 = far ? 172 : 170, step = far ? 14 : 15;
  return Array.from({ length: count }, (_, i) => ({ ring: 2, r, a: a0 - i * step }));
}

/** Can this item be cast (anything not passive: actives, consumables with charges)?  Only these go on the wheel. */
export const usableItem = (key, data = DATA) => !!(key && data.items[key]) && targetInfo('item', key, 1, data).mode !== 'passive';
// wheel item order: a per-hero preference over main slots 0..5 (by SLOT index), stored { v:2, order:[slot, ...] }.  A v1 { v:1, map:[perm] }
// (first wheel build) reads as that order; bad data = [] (= inventory order).  Usable items not in it append in slot order.
export const itemMapKey = (heroKey) => 'p2d.wheelItems.' + String(heroKey);
const cleanOrder = (a) => { const out = []; if (Array.isArray(a)) for (const v of a) if (Number.isInteger(v) && v >= 0 && v < ACTIVE_SLOTS && !out.includes(v)) out.push(v); return out; };
export function loadItemOrder(storage, heroKey) {
  try {
    const o = JSON.parse(storage.getItem(itemMapKey(heroKey)));
    if (o && o.v === 2) return cleanOrder(o.order);
    if (o && o.v === 1) return normalizeOrder(o.map, ACTIVE_SLOTS);
  } catch { /* storage off / bad json */ }
  return [];
}
export function saveItemOrder(storage, heroKey, order) {
  try {
    const o = cleanOrder(order);
    if (!o.length && storage.removeItem) storage.removeItem(itemMapKey(heroKey)); else storage.setItem(itemMapKey(heroKey), JSON.stringify({ v: 2, order: o }));
    return true;
  } catch { return false; }
}
/** The wheel's item slots: usable main-inventory items, packed, in `order` first then the rest by slot; at most `max`. */
export function packWheelItems(items, order, usable = usableItem, max = ACTIVE_SLOTS) {
  const out = [], ok = (i) => !out.includes(i) && !!(items && items[i] && items[i].key && usable(items[i].key));
  for (const i of cleanOrder(order)) if (ok(i)) out.push(i);
  for (let i = 0; i < ACTIVE_SLOTS; i++) if (ok(i)) out.push(i);
  return out.slice(0, max);
}
/** New order after dropping inventory `slot` on wheel position j of the packed list: swap if shown, else insert there (j past the end = last). */
export function placeWheelItem(packed, slot, j) {
  const o = packed.slice(), i = o.indexOf(slot);
  if (i >= 0) { if (j >= o.length) { o.splice(i, 1); o.push(slot); } else [o[i], o[j]] = [o[j], o[i]]; } else o.splice(Math.max(0, Math.min(j, o.length)), 0, slot);
  return o.slice(0, ACTIVE_SLOTS);
}
/**
 * Drag drop: src / dst = { where:'bag'|'wheel'|undefined (= ability), slot, pos (wheel index), empty, usable }.
 *   { t:'ability' } spell <-> spell | { t:'swap', a, b } bag <-> bag (ORDER.SWAP) | { t:'place', slot, j } usable main item -> wheel position | null
 */
export function dropAction(src, dst) {
  if (!src || !dst || src === dst) return null;
  const sw = src.where || 'ability', dw = dst.where || 'ability';
  if (sw === 'ability') return dw === 'ability' ? { t: 'ability' } : null;
  if (src.empty || !(src.slot >= 0)) return null;
  if (sw === 'bag' && dw === 'bag') return src.slot !== dst.slot ? { t: 'swap', a: src.slot, b: dst.slot } : null;
  if (dw === 'wheel' && src.slot < ACTIVE_SLOTS && (sw === 'wheel' || src.usable)) return sw === 'wheel' && src.pos === dst.pos ? null : { t: 'place', slot: src.slot, j: dst.pos };
  return null;
}
/** Bag button (scale-1 px from the attack centre, y down): bottom-left of the attack button, under the first spell. */
export const BAG_POS = { x: -80, y: 24, size: 40 };
/** Bag popover box (y down, from the attack centre): 3 x 2 main + 3 backpack cells of `cell`, right edge just left of the small item arc. */
export function bagBox(n, cell = 40) {
  const w = 3 * cell + 2 * 4 + 12, hgt = 3 * cell + 4 + 15 + 12, right = -(smallArcLayout(n)[0].r + 26), bottom = 46;
  return { left: right - w, top: bottom - hgt, right, bottom, w, h: hgt };
}
/** Edge pan only once the aim cursor (x, y) has left the pressed button's rect, or the drag is past `minMag` of the aim radius. */
export const edgePanArmed = (x, y, btnRect, mag, minMag = 0.2) => !inRect(btnRect, x, y) || mag > minMag;

/**
 * Spell aim cursor (canvas px) for a thumb offset (dx, dy) from where it pressed.  At 0 the cursor sits at the start (o.sx, o.sy) = the
 * hero's preview point, never at the button; the thumb's comfortable reach (a fraction of the screen, o.rs scales it) sweeps it from the
 * start to the screen edge on that side, per axis (reach = min(T.AIM_REACH_*, the room left between the press and the screen edge)), with a
 * mild acceleration curve.  Finite-range spells (o.ringX / ringY = the cast ring's radius on screen, px, around the hero at o.hx / hy; 0 = none)
 * stop the sweep at the ring.   o = { sx, sy, px, py, hx, hy, W, H, K, rs, ringX, ringY }
 */
export function aimCursor(dx, dy, o, t = T) {
  const K = o.K || 1, ax = (d, s0, n, p0, h0, frac, ring) => {
    const dir = d < 0 ? -1 : 1, edge = dir < 0 ? 0 : n;
    const reach = Math.max(t.AIM_REACH_MIN * K, Math.min(frac * n * (o.rs || 1), Math.abs(p0 - edge) - t.AIM_PAD * K));
    let ext = Math.abs(edge - s0);
    if (ring > 0) ext = Math.min(ext, Math.max(0, dir * (h0 + dir * ring * t.AIM_RING_OVER - s0)));   // ring edge on that side of the hero, measured from the start
    return s0 + dir * ext * Math.pow(Math.min(1, Math.abs(d) / reach), t.AIM_GAMMA);
  };
  return { x: ax(dx, o.sx, o.W, o.px, o.hx, t.AIM_REACH_X, o.ringX), y: ax(dy, o.sy, o.H, o.py, o.hy, t.AIM_REACH_Y, o.ringY) };
}

// aim sensitivity s: the thumb's drag from the button counts s times (full range at AIM_R / s px).  0.75..2.5 in 0.25 steps, default 1.5.
export const SENS = { MIN: 0.75, MAX: 2.5, STEP: 0.25, DEF: 1.5, KEY: 'p2d.aimSens' };
export const SENS_STEPS = Array.from({ length: Math.round((SENS.MAX - SENS.MIN) / SENS.STEP) + 1 }, (_, i) => SENS.MIN + i * SENS.STEP);
export function clampSens(s) { const v = Number(s); if (s == null || s === '' || !Number.isFinite(v)) return SENS.DEF; return Math.max(SENS.MIN, Math.min(SENS.MAX, Math.round(v / SENS.STEP) * SENS.STEP)); }
export const aimRadius = (base, s) => base / clampSens(s);
export function loadAimSens(storage) { try { return clampSens(storage.getItem(SENS.KEY)); } catch { return SENS.DEF; } }
export function saveAimSens(storage, s) { try { storage.setItem(SENS.KEY, String(clampSens(s))); return true; } catch { return false; } }

export function angleDiff(a, b) { const d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; }

/** Joystick throttle: `last` = { t, ang } of the previous send (or null). */
export function joyShouldSend(last, ang, now) {
  if (!last) return true;
  const dt = now - last.t;
  if (dt >= T.JOY_MS) return true;
  return dt >= T.JOY_MIN_MS && angleDiff(ang, last.ang) > T.JOY_ANGLE * RAD;
}

/** Screen drag (px, y down) -> joystick state. `ang` is the world heading (y up). */
export function dragVector(dx, dy, R) {
  const len = Math.hypot(dx, dy), k = len > R ? R / len : 1;
  return { len, kx: dx * k, ky: dy * k, ang: Math.atan2(-dy, dx), mag: Math.min(1, len / R) };
}

/** Drag from the button centre -> world offset from the hero; the full drag radius R maps to `range`. */
export function aimWorldOffset(dx, dy, R, range) {
  const len = Math.hypot(dx, dy), k = len > R ? R / len : 1;
  return { x: (dx * k / R) * range, y: (-dy * k / R) * range, mag: Math.min(1, len / R), kx: dx * k, ky: dy * k };
}

/**
 * Spell / item button hold state machine.  heldMs = time since the press, moved = the finger left the tap radius.
 *   tap      < TAP_MS, still        release = quick tap (range preview / self double-tap arm / instant cast)
 *   hold     TAP_MS..TIP_MS, still  release = cast forward (as before)
 *   tip      TIP_MS..REORDER_MS     tooltip is up; release does NOT cast
 *   reorder  >= REORDER_MS          wheel reorder mode starts
 *   drag     moved                  aiming; a tooltip that was up is hidden; release casts
 */
export function holdPhase(heldMs, moved, o = T) {
  if (moved) return 'drag';
  if (heldMs >= o.REORDER_MS) return 'reorder';
  if (heldMs >= o.TIP_MS) return 'tip';
  if (heldMs >= o.TAP_MS) return 'hold';
  return 'tap';
}
/** What a release does in a given phase: 'none' | 'preview' (quick tap on an aimed spell) | 'cast'. */
export function releaseAction(phase, cls) {
  if (phase === 'tip' || phase === 'reorder') return 'none';
  if (cls === 'instant') return 'cast';
  return phase === 'tap' ? 'preview' : 'cast';
}
/**
 * Aim cancel: the finger is over the CANCEL target, or it slid back onto the button after having left it.
 * (dx, dy) = finger offset from the button centre, maxD = furthest it has been, btnR = button radius (px).
 */
export function aimCancelled(overCancel, dx, dy, maxD, btnR, o = T) {
  return !!overCancel || (maxD > btnR && Math.hypot(dx, dy) < btnR * o.CANCEL_BACK);
}
/** Is (x, y) inside rect r grown by m? */
export const inRect = (r, x, y, m = 0) => x > r.left - m && x < r.right + m && y > r.top - m && y < r.bottom + m;

const alive = (u) => u && u.hp > 0 && !(u.respawn > 0) && !((u.status | 0) & ST.DEAD);
const hiddenInvis = (u) => ((u.status | 0) & ST.INVIS) && !((u.status | 0) & ST.REVEALED);
/** Can `u` be picked as a target? o = { team:'ENEMY'|'FRIENDLY'|'BOTH'|null, myTeam, visible(x,y) } */
export function validTarget(u, o) {
  if (!alive(u) || u.kind === KIND.FOUNTAIN) return false;
  if (!teamOk(o.team, u, o.myTeam)) return false;
  if (u.team !== o.myTeam && (hiddenInvis(u) || ((u.status | 0) & ST.INVULN))) return false;
  return o.visible ? !!o.visible(u.x, u.y) : true;
}

/** Unit-target aim: nearest valid unit to the aim point (world), within o.maxD. */
export function snapUnit(units, ax, ay, o) {
  let best = null, bd = o.maxD != null ? o.maxD : T.SNAP;
  for (const u of units) {
    if (!validTarget(u, o)) continue;
    const d = Math.hypot(u.x - ax, u.y - ay);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}

/** Attack button target: nearest visible enemy hero within attack range + 300, else nearest other enemy unit in that radius, else null. */
export function pickAttackTarget(units, hero, myTeam, visible, extra = T.ATK_EXTRA) {
  const R = (hero.atkRange || 150) + extra;
  let bh = null, bhd = R, bo = null, bod = R;
  const o = { team: 'ENEMY', myTeam, visible };
  for (const u of units) {
    if (u.team === TEAM.NONE || !validTarget(u, o)) continue;
    const d = Math.hypot(u.x - hero.x, u.y - hero.y);
    if (u.kind === KIND.HERO) { if (d < bhd) { bhd = d; bh = u; } } else if (d < bod) { bod = d; bo = u; }
  }
  return bh ? bh.id : bo ? bo.id : null;
}

/** Enemies near the hero, heroes first then by distance (for the lock / cycle button). */
export function cycleCandidates(units, hero, myTeam, visible, radius) {
  const o = { team: 'ENEMY', myTeam, visible };
  const list = [];
  for (const u of units) {
    if (u.team === TEAM.NONE || !validTarget(u, o)) continue;
    const d = Math.hypot(u.x - hero.x, u.y - hero.y);
    if (d <= radius) list.push({ id: u.id, d, hero: u.kind === KIND.HERO });
  }
  list.sort((a, b) => (b.hero - a.hero) || (a.d - b.d));
  return list.map((c) => c.id);
}

/**
 * Attack-button drag aim: the enemy to highlight for a drag whose aim point (world) is (ax, ay).  Candidates are visible enemies within
 * attack range + 300 of the hero; the closest to the aim point wins, with heroes counting as closer (ATK_HERO_BIAS) so a hero beside a creep
 * wins.  Nothing within ATK_SNAP of the point: the enemy nearest the drag DIRECTION (hero -> point, within ATK_CONE degrees, heroes biased).
 */
export function pickDragTarget(units, hero, ax, ay, myTeam, visible, o = {}) {
  const R = (hero.atkRange || 150) + (o.extra != null ? o.extra : T.ATK_EXTRA), snap = o.snap != null ? o.snap : T.ATK_SNAP;
  const vo = { team: 'ENEMY', myTeam, visible };
  const cand = [];
  for (const u of units) {
    if (u.team === TEAM.NONE || !validTarget(u, vo)) continue;
    if (Math.hypot(u.x - hero.x, u.y - hero.y) > R) continue;
    cand.push(u);
  }
  let best = null, bs = snap;
  for (const u of cand) {
    const d = Math.hypot(u.x - ax, u.y - ay) * (u.kind === KIND.HERO ? T.ATK_HERO_BIAS : 1);
    if (d < bs) { bs = d; best = u; }
  }
  if (best) return best.id;
  const dx = ax - hero.x, dy = ay - hero.y;
  if (Math.hypot(dx, dy) < 1) return null;
  const dir = Math.atan2(dy, dx), cone = T.ATK_CONE * RAD;
  let ba = cone;
  for (const u of cand) {
    const a = angleDiff(Math.atan2(u.y - hero.y, u.x - hero.x), dir) * (u.kind === KIND.HERO ? T.ATK_HERO_BIAS : 1);
    if (a < ba) { ba = a; best = u; }
  }
  return best ? best.id : null;
}

const LH_KINDS = { [KIND.CREEP]: 1, [KIND.SUMMON]: 1 };
const STRUCT_KINDS = { [KIND.TOWER]: 1, [KIND.RAX]: 1, [KIND.BUILDING]: 1, [KIND.ANCIENT]: 1 };
/** Average hit of a hero (damage range + bonus); falls back to 50. */
export const heroDamage = (hero) => ((hero.dmgMin || 0) + (hero.dmgMax || 0)) / 2 + (hero.dmgBonus || 0) || 50;
/**
 * Last-hit button: the creep the next hit finishes (lowest hp first; enemy creeps before denying a hurt allied creep), else the
 * weakest enemy creep, else the closest enemy structure; all within attack range + LH_EXTRA.  null = nothing to hit.
 */
export function pickLastHit(units, hero, myTeam, visible, dmg = heroDamage(hero), extra = T.LH_EXTRA) {
  const R = (hero.atkRange || 150) + extra;
  const enemy = { team: 'ENEMY', myTeam, visible }, friend = { team: 'FRIENDLY', myTeam, visible };
  let kill = null, deny = null, weak = null, struct = null, sd = Infinity;
  for (const u of units) {
    if (u.team === TEAM.NONE) continue;
    const d = Math.hypot(u.x - hero.x, u.y - hero.y); if (d > R) continue;
    if (u.team !== myTeam) {
      if (!validTarget(u, enemy)) continue;
      if (LH_KINDS[u.kind] || u.team === TEAM.NEUTRAL) {
        if (u.hp <= dmg && (!kill || u.hp < kill.hp)) kill = u;
        if (!weak || u.hp < weak.hp) weak = u;
      } else if (STRUCT_KINDS[u.kind] && d < sd) { sd = d; struct = u; }
    } else if (u.kind === KIND.CREEP && u.id !== hero.id && validTarget(u, friend) && u.maxHp > 0 && u.hp / u.maxHp < 0.5 && u.hp <= dmg && (!deny || u.hp < deny.hp)) deny = u;
  }
  const r = kill || deny || weak || struct;
  return r ? r.id : null;
}

/** Pinch: spread (d grows past d0) zooms in = smaller camera distance. */
export const pinchGoal = (g0, d0, d, min, max) => Math.max(min, Math.min(max, d0 > 0 && d > 0 ? g0 * (d0 / d) : g0));

// ------------------------------------------------------------------------------------------------ small pixel glyphs (local to the touch UI)
const BUBBLE = {
  pal: { k: '#10131c', w: '#dfe6f2', g: '#8d9bb5' },
  rows: ['.kkkkkkkkkk.', 'kwwwwwwwwwwk', 'kwwwwwwwwwwk', 'kwgwwgwwgwwk', 'kwwwwwwwwwwk', 'kwwwwwwwwwwk', '.kkkkwkkkkk.', '....kwk.....', '.....k......'],
};
const LOCK = {
  pal: { k: '#10131c', s: '#c8d2e6', y: '#e8b83a', o: '#a77a1c' },
  rows: ['...kkkkk...', '..ksssssk..', '..ks...sk..', '..ks...sk..', '.kkkkkkkkk.', '.kyyyyyyyk.', '.kyyykyyyk.', '.kyyykyyyk.', '.koooooook.', '..kkkkkkk..'],
};
const OPEN_LOCK = {
  pal: LOCK.pal,
  rows: ['...kkkkk...', '..ksssssk..', '..ks...sk..', '..ks.......', '.kkkkkkkkk.', '.kyyyyyyyk.', '.kyyykyyyk.', '.kyyykyyyk.', '.koooooook.', '..kkkkkkk..'],
};
const MENU = {
  pal: { k: '#10131c', w: '#dfe6f2' },
  rows: ['kkkkkkkkkk', 'kwwwwwwwwk', 'kkkkkkkkkk', '..........', 'kkkkkkkkkk', 'kwwwwwwwwk', 'kkkkkkkkkk', '..........', 'kkkkkkkkkk', 'kwwwwwwwwk', 'kkkkkkkkkk'],
};
const BAG = {
  pal: { k: '#10131c', y: '#e8b83a', o: '#a77a1c', w: '#fff3b0' },
  rows: ['..kkkkkk..', '...kooyk..', '..kyyyyyk.', '.kyywyyyyk', 'kyywyyyyyk', 'kyyyyyyyok', 'kyyyyyyook', '.koooooook', '..kkkkkk..'],
};

// ------------------------------------------------------------------------------------------------ styles owned by this file (attack aim, LH button, reorder)
const TOUCH_CSS2 = `
.t-lh { font-family:'Press Start 2P',monospace; font-size:calc(11px * var(--bk, 1)); letter-spacing:0; color:#ffe9a8; }
.t-root.spec .t-lh { display:none; }
.t-btn.t-lh.f-ok { color:#fff; }
.t-btn.t-atk.aiming { z-index:6; transition:none; }
.t-btn.t-atk.aiming.bad { box-shadow:0 0 0 2px rgba(5,7,11,.92), inset 0 0 0 3px #ff6b5b, inset 0 0 0 6px rgba(5,7,11,.85), 0 0 14px rgba(255,90,70,.8); }
.t-reorder { position:absolute; left:50%; transform:translateX(-50%); display:none; align-items:center; gap:calc(12px * var(--bk, 1)); padding:calc(6px * var(--bk, 1)) calc(10px * var(--bk, 1));
  border-radius:calc(8px * var(--bk, 1)); background:rgba(10,13,20,.88); box-shadow:0 0 0 2px rgba(5,7,11,.92), inset 0 0 0 2px #7aeaff; color:#dff6ff; font-size:calc(11px * var(--bk, 1)); pointer-events:auto; white-space:nowrap; z-index:9; }
.t-reorder b { font-family:'Press Start 2P',monospace; font-size:calc(10px * var(--bk, 1)); padding:calc(6px * var(--bk, 1)) calc(10px * var(--bk, 1)); border-radius:calc(6px * var(--bk, 1)); background:#2a7f4a; color:#fff; box-shadow:inset 0 0 0 2px #7dffa8; }
.t-root.reorder .t-reorder { display:flex; }
@keyframes t-wig { 0% { transform:rotate(-4deg); } 50% { transform:rotate(4deg); } 100% { transform:rotate(-4deg); } }
.t-root.reorder .t-ab, .t-root.reorder .t-wi:not(.gone) { animation:t-wig .26s ease-in-out infinite; box-shadow:0 0 0 2px rgba(5,7,11,.92), inset 0 0 0 2px #7aeaff, inset 0 0 0 4px rgba(5,7,11,.85), 0 0 12px rgba(120,235,255,.7); }
.t-root.reorder .t-ab:nth-child(odd), .t-root.reorder .t-wi:nth-child(odd) { animation-delay:-.13s; }
.t-btn.rdrag { animation:none !important; z-index:8; transition:none; }
.t-btn.rdrop { animation:none !important; transform:scale(1.18); opacity:1 !important; box-shadow:0 0 0 2px rgba(5,7,11,.92), inset 0 0 0 3px #7dffa8, 0 0 16px rgba(125,255,168,.9); }
.t-root.reorder .t-atk, .t-root.reorder .t-lock, .t-root.reorder .t-lh, .t-root.reorder .t-joy { opacity:.3; }
.t-wi .t-cdt, .t-bagp .t-it .t-cdt { font-size:max(10px, calc(12px * var(--bk, 1))); }
.t-wi .t-ch, .t-bagp .t-ch { font-size:9px; padding:1px 2px 0; }
.t-wi.gone { display:none; }
.t-root.reorder .t-wi.gone, .t-root.idrag .t-wi.gone { display:flex; opacity:.25; animation:none; }
.t-root.nohero .t-wi, .t-root.nohero .t-bagb { opacity:.35; }
.t-bagb .t-glyph { width:58%; }
.t-bagb.has::after { content:''; position:absolute; right:8%; top:8%; width:7px; height:7px; border-radius:50%; background:#e8b83a; box-shadow:0 0 0 1px #05070b; }
.t-root.bag .t-bagb { box-shadow:0 0 0 2px rgba(5,7,11,.92), inset 0 0 0 2px #e8c24f, 0 0 10px rgba(232,194,79,.6); }
.t-bagp { position:absolute; display:none; pointer-events:auto; padding:calc(6px * var(--bk, 1)); border-radius:calc(8px * var(--bk, 1)); background:rgba(10,13,20,.9);
  box-shadow:0 0 0 2px rgba(5,7,11,.92), inset 0 0 0 2px #6b5a2c; z-index:7; }
.t-root.bag .t-bagp { display:block; }
.t-bagp .t-bg { display:grid; grid-template-columns:repeat(3, auto); gap:calc(4px * var(--bk, 1)); }
.t-bagp .t-bg.bpk { margin-top:calc(7px * var(--bk, 1)); padding-top:calc(7px * var(--bk, 1)); border-top:1px dashed rgba(232,184,58,.45); }
.t-bagp .t-it { position:relative; }
.t-bagp .t-it.empty { opacity:.28; pointer-events:none; }
.t-bagp .t-it.bp:not(.empty) { opacity:.8; }
.t-bagp .t-it.sel { box-shadow:0 0 0 2px rgba(5,7,11,.92), inset 0 0 0 2px #e8c24f, 0 0 10px rgba(232,194,79,.7); }
.t-sell { position:absolute; left:0; right:0; bottom:100%; margin-bottom:calc(6px * var(--bk, 1)); display:none; padding:calc(7px * var(--bk, 1)) 4px calc(5px * var(--bk, 1)); border-radius:calc(6px * var(--bk, 1));
  background:#7a5a18; box-shadow:0 0 0 2px rgba(5,7,11,.92), inset 0 0 0 2px #e8c24f; color:#fff; font-family:'Press Start 2P',monospace; font-size:max(9px, calc(10px * var(--bk, 1))); text-align:center; white-space:nowrap; }
.t-sell.on { display:block; }
.t-btn.down { filter:brightness(1.35); }
`;
function injectTouchStyle2(doc = document) {
  if (doc.getElementById('t-style2')) return;
  const el = doc.createElement('style'); el.id = 't-style2'; el.textContent = TOUCH_CSS2; doc.head.appendChild(el);
}

// ------------------------------------------------------------------------------------------------ controller
export function createTouch({ root, canvas, renderer, hud, input, sheets, getState, mySid, send }) {
  const H = hud || {};
  const icons = sheets && sheets.icons;
  let enabled = false, destroyed = false;
  const subs = [];                       // [target, type, fn, opts] for teardown
  const on = (t, type, fn, opts) => { t.addEventListener(type, fn, opts); subs.push([t, type, fn, opts]); };
  const search = typeof location !== 'undefined' ? location.search : '';
  const mqCoarse = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;
  const realCoarse = !!(mqCoarse && mqCoarse.matches);
  let bootTouch = null;

  // ---- state helpers
  const state = () => getState();
  const me = () => { const s = state(); return s && s.players ? s.players.get(typeof mySid === 'function' ? mySid() : mySid) : null; };
  const heroU = () => { const s = state(), p = me(); return s && p && p.heroId ? s.units.get(p.heroId) : null; };
  const isSpec = () => { const p = me(); return !!p && p.team === TEAM.SPEC; };
  const myTeam = () => { const p = me(); return p ? p.team : -1; };
  const unitList = () => { const out = [], s = state(); if (s && s.units) s.units.forEach((u) => out.push(u)); return out; };
  const visible = (x, y) => (renderer.fog && renderer.fog.isVisible ? renderer.fog.isVisible(x, y) : true);
  const now = () => performance.now();
  const warn = (t) => { if (H.message) H.message(t, true); };
  const dead = (u) => !u || u.respawn > 0;

  // ---- orders (spectators never order)
  let lastOtherAt = 0, suppressUntil = 0;
  const order = (o, opts) => { if (isSpec()) return; send(MSG.ORDER, o, opts); };
  const noteOrder = () => { lastOtherAt = now(); suppressUntil = lastOtherAt + T.SUPPRESS_MS; };

  // ---- DOM
  const R = h('div', 't-root'); R.style.display = 'none'; root.append(R);   // stays hidden (and unstyled) until touch mode is enabled
  const joyBase = h('div', 't-joy'), joyKnob = h('div', 't-knob'); joyBase.append(joyKnob); R.append(joyBase);
  const anchor = h('div', 't-anchor'); R.append(anchor);
  const pad = h('div', 't-pad'); anchor.append(pad);
  const aimKnob = h('div', 't-aimknob'); anchor.append(aimKnob);                           // small aim stick at the finger (the spell icon itself never moves)
  const cancelEl = h('div', 't-cancel'); cancelEl.append(h('span', null, '✕'), h('em', null, 'CANCEL')); anchor.append(cancelEl);
  const atk = h('div', 't-btn t-atk'); const atkIco = pixelEl(GLYPHS.sword, null, 1); atkIco.classList.add('t-glyph'); atk.append(atkIco); anchor.append(atk);
  const lockBtn = h('div', 't-btn t-lock'); const lockIco = pixelEl(GLYPHS.reticle, null, 1); lockIco.classList.add('t-glyph'); lockBtn.append(lockIco); anchor.append(lockBtn);
  const lhBtn = h('div', 't-btn t-lh', 'LH'); anchor.append(lhBtn);                       // last hit / structure
  const reorderBar = h('div', 't-reorder'); reorderBar.append(h('span', null, 'DRAG A SPELL OR ITEM ONTO A SLOT'), h('b', 't-done', 'DONE')); R.append(reorderBar);
  const topEl = h('div', 't-top'); R.append(topEl);
  const topBtn = (glyph, label, cls) => {
    const b = h('div', 't-btn t-sm ' + cls); const g = pixelEl(glyph, null, 1); g.classList.add('t-glyph'); b.append(g, h('i', null, label)); topEl.append(b); return b;
  };
  const bShop = topBtn(BAG, 'SHOP', 't-shop'), bScore = topBtn(GLYPHS.skull, 'SCORE', 't-score'), bChat = topBtn(BUBBLE, 'CHAT', 't-chat'), bCam = topBtn(LOCK, 'CAM', 't-cam'), bMenu = topBtn(MENU, 'MENU', 't-menu');
  const turn = h('div', 't-turn');
  { const ph = h('div', 't-phone'); ph.append(h('i')); turn.append(ph, h('b', null, 'TURN YOUR PHONE SIDEWAYS'), h('span', null, 'Pixel2Dota is played in landscape')); }
  let turnShown = false;

  // ---- ability / item buttons
  let abBtns = [], abKey = '';
  const mkIcon = () => { const cv = h('canvas', 'px t-ico'); cv.width = cv.height = 20; return cv; };
  const mkItem = (slot, cls) => {
    const el = h('div', 't-btn empty ' + cls);
    const cv = mkIcon(), sweep = h('div', 't-sweep'), cdt = h('div', 't-cdt'), ch = h('div', 't-ch');
    el.append(cv, sweep, cdt, ch);
    return { kind: 'item', slot, el, cv, sweep, cdt, ch, k: '', ptr: null, tapAt: 0 };
  };
  // BAG button + popover (6 main + 3 backpack cells, every item; drag = ORDER.SWAP / wheel order, tap = tooltip + SELL in shop range)
  const bagB = h('div', 't-btn t-bagb'); { const g = pixelEl(BAG, null, 1); g.classList.add('t-glyph'); bagB.append(g); } anchor.append(bagB);
  const bagP = h('div', 't-bagp'), bgMain = h('div', 't-bg'), bgBp = h('div', 't-bg bpk'), sellEl = h('div', 't-sell');
  bagP.append(sellEl, bgMain, bgBp); anchor.append(bagP);
  let bagOpen = false, selSlot = -1, shopPos = null;
  const bagCells = Array.from({ length: INV_SLOTS }, (_, i) => { const b = mkItem(i, i < ACTIVE_SLOTS ? 't-it' : 't-it bp'); b.where = 'bag'; b.size = 'bc'; (i < ACTIVE_SLOTS ? bgMain : bgBp).append(b.el); return b; });
  const seen = [];   // per slot { key, t }: game time an item appeared (sell refund window, as hud.js)
  function setBag(v) { bagOpen = !!v; R.classList.toggle('bag', bagOpen); if (!bagOpen) { selSlot = -1; for (const c of bagCells) c.el.classList.remove('sel'); sellEl.classList.remove('on'); } }
  // small wheel item slots: b.slot = the inventory slot shown (packWheelItems), -1 = none; btnDown / updateButtons treat them like any item button
  let itemOrder = [], packed = [];
  const wiBtns = Array.from({ length: ACTIVE_SLOTS }, (_, j) => { const b = mkItem(-1, 't-wi gone'); b.where = 'wheel'; b.pos = j; b.size = 'wi'; b.polar = smallArcLayout(0)[j]; anchor.append(b.el); return b; });
  function buildAbilities(u) {
    for (const b of abBtns) b.el.remove();
    abBtns = [];
    const n = u.abilities.length;
    exitReorder();
    wheelHero = u.key; wheelOrder = loadWheelOrder(store(), u.key, n);
    itemOrder = loadItemOrder(store(), u.key);
    const slots = arcLayout(n);
    slots.forEach((_, i) => {
      const p = slots[wheelOrder.indexOf(i)];
      const el = h('div', 't-btn t-ab ring' + p.ring);
      const cv = mkIcon(), sweep = h('div', 't-sweep'), cdt = h('div', 't-cdt'), mc = h('div', 't-mc');
      const learn = h('div', 't-learn', '+');
      el.append(cv, sweep, cdt, mc, learn); anchor.append(el);
      const b = { kind: 'ability', slot: i, el, cv, sweep, cdt, mc, learn, k: '', ptr: null, tapAt: 0, polar: p };
      learn.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const hu = heroU();
        if (hu && canLearn(hu, i)) order({ t: ORDER.LEARN, slot: i }); else if (hu && hu.skillPoints > 0) warn('Cannot learn yet');
      });
      abBtns.push(b);
    });
    layout();
  }

  // ---- layout.  Two scales: --k (panels, text; ~0.78 on a 6" phone, ~1.1 on a 7" tablet) and K = --bk (touch buttons: shrink
  //      less so they stay big enough: attack >= 76 px, abilities >= 50, items >= 40 on a phone).  Pure: see touchScale().
  let K = 1, W = 844, Hh = 390;
  const SZ = { atk: 88, ab: 59, lock: 44, sm: 50, lh: 40, wi: 40, bc: 40, bag: BAG_POS.size };
  const aimR = () => aimRadius(T.AIM_R, aimSens) * K;           // px of drag = full range (attack aim, pad, no-pick fallback)
  function layout() {
    W = root.clientWidth || innerWidth; Hh = root.clientHeight || innerHeight;
    const sc = touchScale(W, Hh); K = sc.bk;
    const px = (v) => Math.round(v * K) + 'px';
    const unit = Math.max(1, Math.round(1.25 * sc.k * 4) / 4);   // fallback HUD unit (messages etc.); most panels set their own from --k
    document.documentElement.style.setProperty('--p2d-u', unit + 'px');
    document.documentElement.style.setProperty('--k', String(sc.k)); document.documentElement.style.setProperty('--bk', String(sc.bk));
    const half = (SZ.atk * K) / 2;
    anchor.style.right = `calc(env(safe-area-inset-right, 0px) + ${px(10)} + ${half}px)`;
    anchor.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${px(10)} + ${half}px)`;
    const place = (el, size, x, y) => { el.style.width = el.style.height = px(size); el.style.left = Math.round(x * K) + 'px'; el.style.top = Math.round(y * K) + 'px'; el.style.marginLeft = el.style.marginTop = -Math.round(size * K / 2) + 'px'; };
    place(atk, SZ.atk, 0, 0);
    const la = 68 * RAD, lr = SZ.atk / 2 + SZ.lock / 2 + 4;
    place(lockBtn, SZ.lock, Math.cos(la) * lr, -Math.sin(la) * lr);
    const ha = 120 * RAD, hr = SZ.atk / 2 + SZ.lh / 2 + 2;
    place(lhBtn, SZ.lh, Math.cos(ha) * hr, -Math.sin(ha) * hr);
    for (const b of abBtns) place(b.el, SZ.ab, Math.cos(b.polar.a * RAD) * b.polar.r, -Math.sin(b.polar.a * RAD) * b.polar.r);
    const sm = smallArcLayout(abBtns.length);
    wiBtns.forEach((b, j) => { b.polar = sm[j]; place(b.el, SZ.wi, Math.cos(b.polar.a * RAD) * b.polar.r, -Math.sin(b.polar.a * RAD) * b.polar.r); });
    place(cancelEl, 58, 6, -252);
    aimKnob.style.width = aimKnob.style.height = px(30); aimKnob.style.marginLeft = aimKnob.style.marginTop = -Math.round(15 * K) + 'px';
    const padD = aimR() * 2;
    pad.style.width = pad.style.height = padD + 'px'; pad.style.marginLeft = pad.style.marginTop = -padD / 2 + 'px';
    place(bagB, SZ.bag, BAG_POS.x, BAG_POS.y);
    const bx = bagBox(abBtns.length, SZ.bc);
    bagP.style.right = Math.round(-bx.right * K) + 'px'; bagP.style.bottom = Math.round(-bx.bottom * K) + 'px';   // anchored by its bottom-right corner
    for (const b of bagCells) b.el.style.width = b.el.style.height = px(SZ.bc);
    joyBase.style.width = joyBase.style.height = px(T.JOY_R * 2); joyKnob.style.width = joyKnob.style.height = px(50);
    document.documentElement.classList.toggle('p2d-narrow', W < 760);
    reorderBar.style.top = (topLimit() + 8) + 'px';
    updateInset(true);
  }
  // ---- camera framing: tell the renderer how much of the screen the HUD covers (top bar / bottom panel) so the hero is centred in the FREE playfield
  let insetKey = '';
  function updateInset(force) {
    if (!renderer.setViewInset) return;
    const rr = root.getBoundingClientRect(), hh = rr.height || Hh;
    const tb = root.querySelector('.h-top'), bp = root.querySelector('.h-bottom');
    const tr = tb ? tb.getBoundingClientRect() : null, br = bp ? bp.getBoundingClientRect() : null;
    const ins = hudInset(tr && tr.height > 0 ? tr.bottom - rr.top : 0, br && br.height > 0 ? br.top - rr.top : null, hh);
    const k = ins.top.toFixed(3) + ',' + ins.bottom.toFixed(3);
    if (k === insetKey && !force) return;
    insetKey = k; renderer.setViewInset(ins);
  }

  /** Top edge (viewport px) of the bottom-left HUD cluster (minimap + portrait + bars), or the screen bottom when absent. */
  function coverTop() {
    const bp = root.querySelector('.h-bottom'), r = bp ? bp.getBoundingClientRect() : null;
    return r && r.height > 0 ? r.top : (root.getBoundingClientRect().bottom || Hh);
  }

  // ---- per-button feedback
  const flash = (el, c) => { el.classList.remove('f-ok', 'f-bad'); void el.offsetWidth; el.classList.add(c || 'f-ok'); };
  const tc = (el, c, v) => { v = !!v; const k = '_c' + c; if (el[k] !== v) { el[k] = v; el.classList.toggle(c, v); } };
  const tt = (el, s) => { s = String(s); if (el._t !== s) { el._t = s; el.textContent = s; } };
  const ts = (el, p, v) => { const k = '_s' + p; if (el[k] !== v) { el[k] = v; el.style[p] = v; } };

  function updateButtons(u) {
    const sp = isSpec();
    R.classList.toggle('spec', sp);
    if (sp || !u) { R.classList.toggle('nohero', !sp); return; }
    R.classList.remove('nohero');
    const key = u.key + ':' + u.abilities.length;
    if (key !== abKey) { abKey = key; buildAbilities(u); }
    for (const b of abBtns) {
      const ab = u.abilities[b.slot]; if (!ab) continue;
      if (b.k !== ab.key) { b.k = ab.key; if (!(icons && paintInto(b.cv, icons, ab.key, 1))) b.cv.getContext('2d').clearRect(0, 0, 20, 20); }
      const info = targetInfo('ability', ab.key, ab.level);
      tc(b.el, 'off', ab.level < 1); tc(b.el, 'passive', info.mode === 'passive');
      tc(b.el, 'nomana', ab.level > 0 && u.mana < (ab.mana || 0));
      const cd = ab.cd > 0.05; tc(b.el, 'cd', cd);
      if (cd) { ts(b.sweep, '--a', sweepDeg(ab.cd, ab.cdMax) + 'deg'); tt(b.cdt, fmtCd(ab.cd)); }
      tt(b.mc, ab.mana > 0 && ab.level > 0 ? ab.mana : '');
      tc(b.learn, 'on', canLearn(u, b.slot));
      tc(b.el, 'aiming', !!(aim && aim.b === b));
    }
    packed = packWheelItems(u.items, itemOrder);
    for (const b of wiBtns) { if (b.ptr == null && !(rdrag && rdrag.b === b)) b.slot = b.pos < packed.length ? packed[b.pos] : -1; tc(b.el, 'gone', !(b.slot >= 0)); }
    let bagHas = false;
    const t = state().time || 0;
    for (const b of bagCells.concat(wiBtns)) {
      const it = b.slot >= 0 ? u.items[b.slot] : null, k = it && it.key ? it.key : '';
      if (b.where === 'bag') { if (k && b.slot >= ACTIVE_SLOTS) bagHas = true; if (!seen[b.slot] || seen[b.slot].key !== k) seen[b.slot] = { key: k, t }; }
      if (b.k !== k) { b.k = k; const g = b.cv.getContext('2d'); g.clearRect(0, 0, 20, 20); if (k && icons) paintInto(b.cv, icons, k, 1); }
      tc(b.el, 'empty', !k);
      tc(b.el, 'passive', !!k && targetInfo('item', k, 1).mode === 'passive');
      const cd = !!(it && it.cd > 0.05); tc(b.el, 'cd', cd);
      if (cd) { ts(b.sweep, '--a', sweepDeg(it.cd, it.cdMax) + 'deg'); tt(b.cdt, fmtCd(it.cd)); }
      const ch = it && it.charges > 0; ts(b.ch, 'display', ch ? 'block' : 'none'); if (ch) tt(b.ch, it.charges);
      tc(b.el, 'aiming', !!(aim && aim.b === b));
    }
    tc(bagB, 'has', bagHas);
    if (bagOpen) updateSell(u);
    tc(lockBtn, 'on', !!lockId);
  }

  // ---- camera: intents to the camera director (renderer.cam, render/camdir.js); `locked` mirrors cam.following for the CAM button
  const cam = renderer.cam || null;
  let locked = true;
  const lockUI = (v) => { locked = !!v; bCam.classList.toggle('on', locked); bCam.replaceChild((() => { const g = pixelEl(locked ? LOCK : OPEN_LOCK, null, 1); g.classList.add('t-glyph'); return g; })(), bCam.firstChild); };
  const setLocked = (v) => { if (cam) cam.setFollow(v); lockUI(v); };   // on: the camera glides back to the hero (cuts when far)
  lockUI(true);   // the lock itself is taken in enable(): desktop play keeps a free camera
  function recentre() {   // an explicit re-lock is also "reset the view": back to the default zoom
    const r = rig();
    if (r) r.distanceGoal = Math.min(r.maxDist, Math.max(r.minDist, T.ZOOM_START));
  }
  // temporary free camera (cam.suspend, the lock stays): the minimap is pressed (mmPtr), or this aim panned it (minimap / edge pan) until the cast ends
  let mmPtr = null, freeAim = false, lastT = 0, mmEl = null, mmHome = null;
  const tempFree = () => mmPtr != null || !!(aim && freeAim);
  const longAim = (rr) => { const r = rig(), w = (r && r.visibleWidth) || 2100; return !(rr > 0) || rr > w * T.EDGE_RANGE; };   // rr = realRange (0 = global)
  function edgePan(dt) {   // the aim CURSOR (button + drag x sensitivity, clamped to the canvas) at a screen edge pans
    if (!aim || !aim.moved || !longAim(aim.rr) || !cam || aim.vx == null) return;
    if (!aim.edgeOk && !(aim.edgeOk = edgePanArmed(aim.vx, aim.vy, aim.b.el.getBoundingClientRect(), Math.hypot(aim.dx, aim.dy) / aimR(), T.EDGE_MAG))) return;   // a button near an edge: not before the cursor leaves it
    const cr = canvas.getBoundingClientRect(), d = edgePanDir(aim.vx - cr.left, aim.vy - cr.top, cr.width, cr.height, T.EDGE_M * K);
    if (!d.x && !d.y) return;
    freeAim = true; cam.suspend(true);
    cam.pan(d.x * T.EDGE_SPEED * dt, -d.y * T.EDGE_SPEED * dt);   // screen up = world +y
  }
  /** Joystick direction for the camera lead: world {x, y}, |.| = deflection 0..1, or null. */
  const moveDir = () => (joy && joy.vec && joy.vec.len >= T.JOY_DEAD * K ? { x: Math.cos(joy.vec.ang) * joy.vec.mag, y: Math.sin(joy.vec.ang) * joy.vec.mag } : null);

  // ---- target lock
  let lockId = '';
  function setLock(id) {
    lockId = id || '';
    if (renderer.setSelected) renderer.setSelected(lockId || null);
    if (H.select) H.select(lockId || null);
  }
  function checkLock(u) {
    if (!lockId) return;
    const s = state(), t = s && s.units ? s.units.get(lockId) : null;
    if (!t || !validTarget(t, { team: 'ENEMY', myTeam: myTeam(), visible }) || (u && Math.hypot(t.x - u.x, t.y - u.y) > (u.atkRange || 150) + 1400)) setLock('');
  }
  function cycleLock() {
    const u = heroU(); if (!u || dead(u)) return;
    const list = cycleCandidates(unitList(), u, myTeam(), visible, (u.atkRange || 150) + 900);
    if (!list.length) { setLock(''); warn('No target'); return; }
    const i = lockId ? list.indexOf(lockId) : -1;
    if (i >= 0 && i === list.length - 1) { setLock(''); return; }
    setLock(list[i + 1]);
    flash(lockBtn);
  }

  // ---- joystick
  let joy = null;     // { id, ox, oy, vec, last:{t,ang}|null, sentAt, moving, x0,y0,t0 }
  let lastDir = null;
  const topLimit = () => { const t = root.querySelector('.h-top'); const r = t ? t.getBoundingClientRect() : null; return Math.max(44, r ? r.bottom : 0); };
  function showJoy(on_) { joyBase.classList.toggle('on', on_); }
  function startJoy(p, rect) {
    const m = T.JOY_R * K + 6;
    // the base never sits on the bottom-left HUD cluster (minimap / portrait / bars): it is drawn above it, and the stick reads the drag from where the thumb
    // actually went down (sx, sy), so a touch that began over the cluster still moves the hero without a jump
    const mmR = mmEl ? mmEl.getBoundingClientRect() : null;   // nor on the minimap (top-left)
    const lo = Math.max(topLimit(), mmR && mmR.height > 0 && p.x < mmR.right + m ? mmR.bottom : 0) + m, hi = Math.max(lo, Math.min(rect.bottom, coverTop()) - m);
    const ox = Math.max(rect.left + m, Math.min(p.x, rect.left + rect.width * T.ZONE + m)), oy = Math.max(lo, Math.min(p.y, hi));
    joy = { id: p.id, ox, oy, sx: p.x, sy: p.y, vec: dragVector(0, 0, T.JOY_R * K), last: null, sentAt: 0, moving: false };
    joyBase.style.left = ox + 'px'; joyBase.style.top = oy + 'px';
    joyKnob.style.transform = 'translate(-50%,-50%)';
    showJoy(true);
  }
  function moveJoy(p) {
    if (!joy) return;
    joy.vec = dragVector(p.x - joy.sx, p.y - joy.sy, T.JOY_R * K);
    joyKnob.style.transform = `translate(calc(-50% + ${joy.vec.kx}px), calc(-50% + ${joy.vec.ky}px))`;
  }
  function joyTick(t) {
    if (!joy) return;
    const u = heroU(); if (!u || dead(u) || t < suppressUntil) return;
    const v = joy.vec;
    if (v.len < T.JOY_DEAD * K) { if (joy.moving) { order({ t: ORDER.STOP }); joy.moving = false; joy.sentAt = t; joy.last = null; } return; }
    lastDir = v.ang;
    if (!joyShouldSend(joy.last, v.ang, t)) return;
    order(orderMove(Math.round(clampW(u.x + Math.cos(v.ang) * T.JOY_RANGE)), Math.round(clampW(u.y + Math.sin(v.ang) * T.JOY_RANGE)), false), { noPath: true });   // no order-path preview for the stick
    joy.last = { t, ang: v.ang }; joy.sentAt = t; joy.moving = true;
  }
  function endJoy() {
    if (!joy) return;
    if (joy.moving && joy.sentAt >= lastOtherAt) order({ t: ORDER.STOP });
    joy = null; showJoy(false);
  }

  // ---- attack
  let atkHeld = null, atkNext = 0;   // pointerId, next auto re-target time
  let atkS = null;                   // press state: { ptr, cx, cy, ex, ey, timer, fired, aiming, dx, dy, inCancel, unitId, point, tg, reach }
  function doAttack() {
    const u = heroU(); if (!u || dead(u)) return;
    checkLock(u);
    const id = lockId || pickAttackTarget(unitList(), u, myTeam(), visible);
    if (id) order(orderAttack(id));
    else {
      const f = lastDir != null ? lastDir : (u.facing || 0);
      order(orderAmove(Math.round(clampW(u.x + Math.cos(f) * T.JOY_RANGE)), Math.round(clampW(u.y + Math.sin(f) * T.JOY_RANGE)), false));
    }
    noteOrder(); flash(atk);
  }
  function lastHit() {
    const u = heroU(); if (!u || dead(u) || isSpec()) return;
    const id = pickLastHit(unitList(), u, myTeam(), visible);
    if (!id) { warn('Nothing to hit'); flash(lhBtn, 'f-bad'); return; }
    order(orderAttack(id)); noteOrder(); flash(lhBtn);
  }

  // attack button drag aim: the thumb's offset from the button maps (like the spell pad) to a world offset from the hero; the enemy
  // closest to that point (heroes first) is highlighted with the same rangefinder the spells use; release attacks it
  function startAtkAim() {
    const s = atkS, u = heroU(); if (!s || s.aiming || !u) return;
    clearTimeout(s.timer); s.aiming = true; s.fired = true;
    s.reach = (u.atkRange || 150) + T.ATK_EXTRA;
    s.tg = { kind: 'attack', slot: -1, info: { mode: 'unit', range: s.reach, radius: 0, team: 'ENEMY' }, name: 'ATTACK', line: true, rich: true, ring: s.reach, shape: { type: 'none' }, unitId: '', unitOk: false };
    const rect = pad.parentNode.getBoundingClientRect();
    pad.style.left = (s.cx - rect.left) + 'px'; pad.style.top = (s.cy - rect.top) + 'px';
    R.classList.add('aiming'); cancelEl.classList.remove('hot'); atk.classList.remove('down'); atk.classList.add('aiming');
    if (H.setTargeting) H.setTargeting(s.tg);
  }
  function updateAtkAim() {
    const s = atkS; if (!s || !s.aiming) return;
    const u = heroU(); if (!u || dead(u)) { endAtk(false); return; }
    const off = aimWorldOffset(s.dx, s.dy, aimR(), s.reach);
    const ax = clampW(u.x + off.x), ay = clampW(u.y + off.y);
    const id = Math.hypot(s.dx, s.dy) < T.ATK_BACK * K ? null : pickDragTarget(unitList(), u, ax, ay, myTeam(), visible);
    const tu = id ? state().units.get(id) : null;
    s.unitId = id || ''; s.point = { x: ax, y: ay }; s.mag = off.mag;
    s.tg.unitId = s.unitId; s.tg.unitOk = !!id; s.tg.cancel = s.inCancel;
    if (H.setAim) H.setAim(tu ? tu.x : ax, tu ? tu.y : ay);
    if (renderer.setHover) renderer.setHover(s.unitId || null);
    atk.style.transform = `translate(${off.kx}px, ${off.ky}px)`;
  }
  function atkMove(e) {
    const s = atkS; if (!s) return;
    s.ex = e.clientX; s.ey = e.clientY; s.dx = e.clientX - s.cx; s.dy = e.clientY - s.cy;
    if (!s.aiming) { if (Math.hypot(s.dx, s.dy) > T.ATK_DRAG * K) startAtkAim(); else return; }
    const c = cancelEl.getBoundingClientRect(), m = 10;
    s.inCancel = (e.clientX > c.left - m && e.clientX < c.right + m && e.clientY > c.top - m && e.clientY < c.bottom + m) || Math.hypot(s.dx, s.dy) < T.ATK_BACK * K;
    cancelEl.classList.toggle('hot', s.inCancel); atk.classList.toggle('bad', s.inCancel);
    updateAtkAim();
  }
  function endAtk(commit) {
    const s = atkS; if (!s) return;
    atkS = null; clearTimeout(s.timer);
    if (!s.aiming) { if (commit && !s.fired) doAttack(); return; }                       // quick tap: attack on release
    atk.style.transform = ''; atk.classList.remove('aiming', 'bad');
    R.classList.remove('aiming'); cancelEl.classList.remove('hot');
    if (renderer.setHover) renderer.setHover(null);
    if (H.setTargeting) H.setTargeting(null);
    const u = heroU(); if (!commit || s.inCancel || !u || dead(u)) return;
    if (s.unitId) { setLock(s.unitId); order(orderAttack(s.unitId)); noteOrder(); flash(atk); }
    else if (s.mag > 0.3 && s.point) { order(orderAmove(Math.round(s.point.x), Math.round(s.point.y), false)); noteOrder(); flash(atk); }   // nobody there: attack-move toward the point
    else { warn('No target'); flash(atk, 'f-bad'); }
  }

  // ---- bag popover: SELL for the selected cell when in my fountain's shop range (desktop hud.js context-menu rule)
  function shopNear(u) {
    if (!shopPos) { const s = state(); if (s && s.units) s.units.forEach((x) => { if (x.kind === KIND.FOUNTAIN && x.team === myTeam()) shopPos = { x: x.x, y: x.y }; }); }
    return inShopRange(u, shopPos);
  }
  function updateSell(u) {
    const it = selSlot >= 0 ? u.items[selSlot] : null, ok = !!(it && it.key) && !isSpec() && shopNear(u);
    tc(sellEl, 'on', ok);
    if (ok) { const sd = seen[selSlot], age = (state().time || 0) - (sd && sd.key === it.key ? sd.t : -999); tt(sellEl, `SELL ${fmtGold(sellValue(it.key, age))}g`); }
  }
  function bagTap(b) {
    selSlot = b.slot; for (const c of bagCells) c.el.classList.toggle('sel', c === b);
    showTip(b, false); const u = heroU(); if (u) updateSell(u);
  }

  // ---- casting
  let aim = null;      // { b, cls, info, key, name, dx, dy, snap, moved, ptr, down, cx, cy, inCancel, point:{x,y}|null, unitId }
  let rangeTimer = 0;
  // rich = the touch rangefinder (range ring + AoE / line / cone at the aim point + target marker), drawn by hud.drawRings
  const targetingFor = (b, info, key, line, lvl, ring) => ({ kind: b.kind, slot: b.slot, info, name: prettyName(key), line, rich: true, ring: ring == null ? info.range : ring, shape: aimShape(b.kind, key, lvl, info), unitId: '', unitOk: false });
  // ---- tooltips (same content as desktop ui/tooltip.js); `.t-on` lets the touch HUD show them, hover-shows stay hidden
  let tipEl = null, tipTimer = 0, longTimer = 0;
  function tipDesc(b) {
    const u = heroU(); if (!u) return null;
    if (b.kind === 'item') { const it = u.items[b.slot]; return it && it.key ? { type: 'item', key: it.key, items: u.items } : null; }
    const ab = u.abilities[b.slot]; if (!ab || !ab.key || (/empty/.test(ab.key) && !ab.level)) return null;
    const a = u.abilities;
    const orbs = a.length >= 3 && u.orbs !== undefined && /invoker/.test(u.key) ? { quaslevel: a[0].level, wexlevel: a[1].level, exortlevel: a[2].level } : null;
    return { type: 'ability', key: ab.key, level: ab.level, orbs };
  }
  function hideTip() {
    clearTimeout(tipTimer); tipTimer = 0;
    if (tipEl) { tipEl.classList.remove('t-on', 't-compact'); if (H.tooltip) H.tooltip.hide(); tipEl = null; }
  }
  function showTip(b, compact) {
    const d = tipDesc(b); if (!d || !H.tooltip) return false;
    hideTip();
    H.tooltip.show(b.el, d);
    tipEl = H.tooltip.el; tipEl.classList.add('t-on'); tipEl.classList.toggle('t-compact', !!compact);
    const sa = (n) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)) || 0;
    const w = tipEl.offsetWidth, hh = tipEl.offsetHeight, vw = root.clientWidth || innerWidth, vh = root.clientHeight || innerHeight, m = 8;
    let x, y;
    if (compact) { x = (vw - w) / 2; y = Math.max(topLimit() + 4, 44); }
    else { const r = b.el.getBoundingClientRect(); x = r.left - w - 12; y = r.top + r.height / 2 - hh / 2; if (x < m) x = Math.min(vw - w - m, r.right + 12); }
    x = Math.max(m, Math.min(vw - w - m, x)); y = Math.max(m, Math.min(vh - hh - m, y));
    tipEl.style.left = Math.round(x) + 'px'; tipEl.style.top = Math.round(y) + 'px';
    if (!compact) tipTimer = setTimeout(hideTip, 9000);
    return true;
  }
  const clearLong = () => { clearTimeout(longTimer); longTimer = 0; };
  let fadeRaf = 0;
  function clearRange() { clearTimeout(rangeTimer); rangeTimer = 0; cancelAnimationFrame(fadeRaf); fadeRaf = 0; if (!aim && H.setTargeting) H.setTargeting(null); }
  function fadeRange(tg) {                                                      // ~150 ms fade instead of vanishing
    const t0 = now();
    const step = () => { fadeRaf = 0; if (aim) return; const k = (now() - t0) / 150; if (k >= 1) { if (H.setTargeting) H.setTargeting(null); return; } tg.alpha = 1 - k; fadeRaf = requestAnimationFrame(step); };
    fadeRaf = requestAnimationFrame(step);
  }
  function showRange(b, info, key, ms) {                                        // quick tap: finite-range spells flash the range ring only; global ones show their tooltip
    clearRange();
    const rr = realRange(info);
    if (!(rr > 0)) { showTip(b, false); clearTimeout(tipTimer); tipTimer = setTimeout(hideTip, 2600); return; }
    const tg = Object.assign(targetingFor(b, info, key, false, 1, rr), { preview: true, alpha: 1 });
    if (H.setTargeting) H.setTargeting(tg);
    rangeTimer = setTimeout(() => { rangeTimer = 0; if (!aim) fadeRange(tg); }, ms);
  }
  const realRange = (info) => (info.range > 0 && info.range < 2500 ? info.range : 0);
  const itemOrAbility = (u, b) => (b.kind === 'item' ? u.items[b.slot] : u.abilities[b.slot]);
  const issueCast = (b, target) => { order(orderCast(b.kind, b.slot, target, false)); noteOrder(); flash(b.el); };

  const t0Now = () => now();
  function btnDown(b, e) {
    if (turnShown || b.ptr != null) return;
    e.preventDefault();
    if (e.target && e.target.classList && e.target.classList.contains('t-learn')) return;
    if (reorderOn) { rdragStart(b, e); return; }
    if (b.where === 'bag') { if (!isSpec()) rdragStart(b, e, true); return; }   // bag cells never cast: tap = tooltip / sell, drag = swap / wheel order
    if (!(b.slot >= 0)) return;
    const u = heroU(); if (!u || dead(u) || isSpec()) return;
    const ent = itemOrAbility(u, b), key = ent && ent.key; if (!key) return;
    const lvl = b.kind === 'ability' ? ent.level : 1;
    const { cls, info } = castClass(b.kind, key, lvl);
    if (cls === 'passive') { clearRange(); showTip(b, false); return; }          // tap = read it
    const rdy = b.kind === 'item' ? itemReady(u, b.slot) : abilityReady(u, b.slot);
    if (!rdy.ok) {
      if (rdy.reason === 'empty') return;
      clearRange(); showTip(b, false);                                          // unlearned / cooling down / no mana: show what it is
      warn(rdy.reason); flash(b.el, 'f-bad'); return;
    }
    clearRange();
    if (cls === 'instant') {                                                    // casts on RELEASE (so a reorder hold never casts); held still T.TIP_MS = tooltip, and that release does not cast
      const tp = { id: e.pointerId, role: 'tip', cast: true, b, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: t0Now(), moved: false };
      clearLong(); longTimer = setTimeout(() => { longTimer = 0; if (b.ptr === e.pointerId && !tp.moved) showTip(b, false); }, T.TIP_MS);
      b.ptr = e.pointerId; pointers.set(e.pointerId, tp);
      armReorder(b, e.pointerId);
      b.el.classList.add('down');
      return;
    }
    const t = now();
    if (cls === 'self' && b.tapAt && t - b.tapAt <= T.DOUBLE_MS) {            // double tap = self cast
      b.tapAt = 0;
      if (H.setTargeting) H.setTargeting(null);
      issueCast(b, selfCastTarget(info, u));
      return;
    }
    const r = b.el.getBoundingClientRect();
    const range = info.range > 0 ? info.range : info.mode === 'point' ? 1600 : 600;
    b.ptr = e.pointerId;
    aim = { b, cls, info: Object.assign({}, info, { range }), rr: realRange(info), key, name: prettyName(key), dx: 0, dy: 0, moved: false, ptr: e.pointerId, down: t, cx: r.left + r.width / 2, cy: r.top + r.height / 2, ex: e.clientX, ey: e.clientY, x0: e.clientX, y0: e.clientY, inCancel: false, overX: false, maxD: 0, point: null, unitId: '' };
    aimStart(aim, u);
    pointers.set(e.pointerId, { id: e.pointerId, role: 'btn', b });
    try { b.el.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    const rect = pad.parentNode.getBoundingClientRect();
    aim.ox = rect.left; aim.oy = rect.top;
    pad.style.left = (aim.cx - rect.left) + 'px'; pad.style.top = (aim.cy - rect.top) + 'px';
    R.classList.add('aiming'); cancelEl.classList.remove('hot'); aimKnob.classList.add('t-on');
    aim.tg = targetingFor(b, aim.info, key, true, lvl, realRange(info));
    if (H.setTargeting) H.setTargeting(aim.tg);
    clearLong(); longTimer = setTimeout(() => { longTimer = 0; if (aim && aim.b === b && !aim.moved) showTip(b, false); }, T.TIP_MS);   // held still: the description tooltip (moving cancels it and keeps aiming)
    armReorder(b, e.pointerId);
    updateAim();
  }

  /** Press: the aim cursor's start = the hero's preview point (ahead of the hero, capped so a global spell starts on screen), as canvas px clamped clear of the edge-pan band. */
  function aimStart(a, u) {
    const cr = canvas.getBoundingClientRect(), r = rig(), vw = (r && r.visibleWidth) || 2100, vh = (r && r.visibleHeight) || 1190, f = u.facing || 0;
    a.fw = Math.min(a.info.range * 0.75, vw * T.AIM_START_W);
    const w2s = renderer.worldToScreen, p = w2s ? w2s(u.x + Math.cos(f) * a.fw, u.y + Math.sin(f) * a.fw) : { x: cr.width / 2, y: cr.height / 2 }, hp = w2s ? w2s(u.x, u.y) : p;
    const m = T.EDGE_M * K + 4, cl = (v, n) => Math.max(m, Math.min(n - m, v));
    const ring = a.rr > 0 && !longAim(a.rr);   // short spells: the sweep ends at the cast ring; long / global ones sweep to the screen edge (and pan there)
    a.cur = { sx: cl(p.x, cr.width), sy: cl(p.y, cr.height), hx: hp.x, hy: hp.y, px: a.x0 - cr.left, py: a.y0 - cr.top, ringX: ring ? a.rr * cr.width / vw : 0, ringY: ring ? a.rr * cr.height / vh : 0 };
  }

  /** Recompute the aim point from the current drag (also each frame so snapped units are followed). */
  function updateAim() {
    if (!aim) return;
    const u = heroU(); if (!u || dead(u)) { endAim(false); return; }
    const a = aim, off = aimWorldOffset(a.dx, a.dy, aimR(), a.info.range), cr = canvas.getBoundingClientRect();
    // thumb travel from the PRESS (not the button centre: no jump when pressed off-centre) sweeps the cursor from its start (the hero's preview point) to the screen edge
    const fx = a.ex - a.x0, fy = a.ey - a.y0, hasDrag = Math.hypot(fx, fy) > T.AIM_DEAD * K;
    const c = aimCursor(fx, fy, Object.assign({ rs: SENS.DEF / aimSens, K, W: cr.width, H: cr.height }, a.cur));   // canvas px; the knob shows it (a.ex / ey stay the real finger)
    const vx = cr.left + Math.max(0, Math.min(cr.width - 1, c.x)), vy = cr.top + Math.max(0, Math.min(cr.height - 1, c.y));
    let ax, ay, unitId = '';
    // the aim point is the cursor's screen position unprojected through the CURRENT camera every frame, so panning the camera
    // (minimap / left hand / edge pan) under a stationary thumb moves the aim; finite-range spells clamp to the ring, global ones reach map-wide
    if (hasDrag && renderer.pick) {
      const g = renderer.pick(vx - cr.left, vy - cr.top, TOUCH_PICK);
      ax = g.x; ay = g.y;
    } else if (hasDrag) { ax = u.x + off.x; ay = u.y + off.y; }
    else { ax = u.x + Math.cos(u.facing || 0) * a.fw; ay = u.y + Math.sin(u.facing || 0) * a.fw; }   // not dragging yet: the preview ahead of the hero (= the cursor's start)
    const unit = a.info.mode === 'unit' || a.info.mode === 'unitpoint';
    if (unit) {
      const o = { team: a.info.team, myTeam: myTeam(), visible, maxD: hasDrag ? T.SNAP : a.info.range + 400 };
      const s = snapUnit(unitList(), hasDrag ? ax : u.x, hasDrag ? ay : u.y, o);
      if (s) { unitId = s.id; ax = s.x; ay = s.y; }
    }
    const rr = a.tg ? a.tg.ring : 0;
    if (!unitId && rr > 0) { const dd = Math.hypot(ax - u.x, ay - u.y); if (dd > rr) { ax = u.x + (ax - u.x) * rr / dd; ay = u.y + (ay - u.y) * rr / dd; } }
    a.point = { x: clampW(ax), y: clampW(ay) }; a.unitId = unitId; a.vx = vx; a.vy = vy;
    if (cam) { if (hasDrag) cam.aimAt(a.point.x, a.point.y); else cam.aimAt(null); }   // aim lookahead from the cursor's point
    if (a.tg) { a.tg.unitId = unitId; a.tg.unitOk = !!unitId || a.info.mode === 'point' || a.info.mode === 'unitpoint'; a.tg.cancel = a.inCancel; }
    if (H.setAim) H.setAim(a.point.x, a.point.y);
    if (renderer.setHover) renderer.setHover(unitId || null);
    aimKnob.style.left = (vx - a.ox) + 'px'; aimKnob.style.top = (vy - a.oy) + 'px';   // the icon stays in its slot; only this knob follows the (scaled) drag
  }

  function aimMove(e) {
    if (!aim) return;
    aim.ex = e.clientX; aim.ey = e.clientY;
    aim.dx = e.clientX - aim.cx; aim.dy = e.clientY - aim.cy;
    const dist = Math.hypot(aim.dx, aim.dy);
    if (dist > aim.maxD) aim.maxD = dist;
    if (dist > T.TAP_MOVE * K && !aim.moved) { aim.moved = true; clearReorderTimer(); clearLong(); hideTip(); }   // past the threshold: no tooltip, no reorder, keep aiming
    aim.overX = inRect(cancelEl.getBoundingClientRect(), e.clientX, e.clientY, 10);
    aim.inCancel = aimCancelled(aim.overX, aim.dx, aim.dy, aim.maxD, SZ[aim.b.size || 'ab'] * K / 2);
    cancelEl.classList.toggle('hot', aim.overX);
    aim.b.el.classList.toggle('bad', aim.inCancel);
    updateAim();
  }

  function endAim(cast) {
    const a = aim; if (!a) return;
    aim = null; clearLong(); clearReorderTimer(); hideTip();
    freeAim = false; if (cam) cam.aimAt(null);   // the frame lifts the suspend: the camera returns to the hero (a.point is already fixed)
    pointers.delete(a.ptr); a.b.ptr = null;
    a.b.el.classList.remove('bad'); aimKnob.classList.remove('t-on');
    R.classList.remove('aiming'); cancelEl.classList.remove('hot');
    if (renderer.setHover) renderer.setHover(null);
    if (H.setTargeting) H.setTargeting(null);
    try { a.b.el.releasePointerCapture(a.ptr); } catch { /* */ }
    if (!cast) return;
    const u = heroU(); if (!u || dead(u)) return;
    const act = releaseAction(holdPhase(now() - a.down, a.moved), a.cls);
    if (a.inCancel || act === 'none') return;                                  // cancelled, or released after the tooltip was up
    if (act === 'preview') {                                                   // quick tap
      if (a.cls === 'self') a.b.tapAt = now();                                  // arms the double-tap
      showRange(a.b, a.info, a.key, a.cls === 'self' ? T.DOUBLE_MS + 180 : 600);
      return;
    }
    const mode = a.info.mode;
    if (mode === 'point') issueCast(a.b, { x: Math.round(a.point.x), y: Math.round(a.point.y) });
    else if (a.unitId) issueCast(a.b, { unitId: a.unitId });
    else if (mode === 'unitpoint') issueCast(a.b, { x: Math.round(a.point.x), y: Math.round(a.point.y) });
    else { warn('No target'); flash(a.b.el, 'f-bad'); }
  }

  // ---- spell wheel reorder: hold a spell button still for T.REORDER_MS -> buttons wiggle; drag one onto another slot to swap; DONE / tap outside exits.
  //      Only the wheel POSITION changes (slots and keys stay), saved per hero in localStorage.
  let reorderOn = false, reorderTimer = 0, rdrag = null, wheelOrder = [], wheelHero = '';
  const store = () => { try { return localStorage; } catch { return null; } };
  let aimSens = loadAimSens(store());
  const clearReorderTimer = () => { clearTimeout(reorderTimer); reorderTimer = 0; };
  function armReorder(b, ptr) { clearReorderTimer(); reorderTimer = setTimeout(() => startReorder(b, ptr), T.REORDER_MS); }
  function startReorder(b, ptr) {
    reorderTimer = 0;
    if (reorderOn || destroyed || turnShown || b.ptr !== ptr) return;
    const p = pointers.get(ptr), x = aim && aim.b === b ? aim.ex : p && p.x != null ? p.x : p ? p.x0 : 0, y = aim && aim.b === b ? aim.ey : p && p.y != null ? p.y : p ? p.y0 : 0;
    if (aim && aim.b === b) endAim(false);                                              // no cast, no aim
    else if (p) { pointers.delete(ptr); b.ptr = null; b.el.classList.remove('down'); }
    clearLong(); hideTip(); clearRange(); if (H.setTargeting) H.setTargeting(null);
    reorderOn = true; R.classList.add('reorder');
    if (H.message) H.message('Reorder: drag a spell or item onto another slot');
    try { if (navigator.vibrate) navigator.vibrate(35); } catch { /* */ }
    rdragStart(b, { pointerId: ptr, clientX: x, clientY: y });                           // the finger is still down: it can drag right away
  }
  function exitReorder() {
    if (!reorderOn) return;
    reorderOn = false; R.classList.remove('reorder');
    if (rdrag) rdragEnd(false);
  }
  const itemAt = (b) => { const u = heroU(); return b.kind === 'item' && b.slot >= 0 && u && u.items ? u.items[b.slot] : null; };
  const desc = (b) => { const it = itemAt(b), k = it && it.key; return { where: b.where, slot: b.slot, pos: b.pos, empty: b.kind === 'item' && !k, usable: !!k && usableItem(k) }; };
  function rdragStart(b, e, tip) {                                                       // tip: a backpack press outside reorder (tap = tooltip)
    if (rdrag || b.ptr != null) return;
    if (b.kind === 'item' && !(itemAt(b) && itemAt(b).key)) return;
    b.ptr = e.pointerId; rdrag = { b, ptr: e.pointerId, x0: e.clientX, y0: e.clientY, to: null, tip: !!tip, moved: false };
    pointers.set(e.pointerId, { id: e.pointerId, role: 'rdrag', b });
    b.el.classList.add('rdrag'); if (b.kind === 'item') R.classList.add('idrag');   // empty wheel positions show as drop targets
    try { b.el.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
  }
  const btnCentre = (b) => { const r = b.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  function rdragMove(e) {
    const d = rdrag; if (!d) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) > T.TAP_MOVE * K) d.moved = true;
    if (!d.moved) return;
    d.b.el.style.transform = `translate(${dx}px, ${dy}px) scale(1.12)`;
    const home = btnCentre(d.b);                                                        // already includes the drag translate
    const pool = d.b.kind === 'ability' ? abBtns : (bagOpen ? bagCells : []).concat(wiBtns);
    const src = desc(d.b), others = pool.filter((x) => dropAction(src, desc(x))), c = others.map(btnCentre);
    const i = nearestIndex(c, home.x, home.y, (d.b.kind === 'ability' ? SZ.ab * 0.75 : SZ.bc * 0.8) * K);
    const to = i >= 0 ? others[i] : null;
    if (to !== d.to) { if (d.to) d.to.el.classList.remove('rdrop'); if (to) to.el.classList.add('rdrop'); d.to = to; }
  }
  function rdragEnd(commit) {
    const d = rdrag; if (!d) return;
    rdrag = null; pointers.delete(d.ptr); d.b.ptr = null;
    d.b.el.style.transform = ''; d.b.el.classList.remove('rdrag'); R.classList.remove('idrag');
    try { d.b.el.releasePointerCapture(d.ptr); } catch { /* */ }
    if (d.to) d.to.el.classList.remove('rdrop');
    const act = commit && d.to ? dropAction(desc(d.b), desc(d.to)) : null;
    if (!act) { if (commit && d.tip && !d.moved) bagTap(d.b); return; }
    if (act.t === 'ability') {
      wheelOrder = swapOrder(wheelOrder, wheelOrder.indexOf(d.b.slot), wheelOrder.indexOf(d.to.slot));
      saveWheelOrder(store(), wheelHero, wheelOrder);
      applyWheelOrder();
    } else if (act.t === 'swap') order({ t: ORDER.SWAP, a: act.a, b: act.b });
    else { itemOrder = placeWheelItem(packed, act.slot, act.j); saveItemOrder(store(), wheelHero, itemOrder); }
    flash(d.b.el); flash(d.to.el);
  }
  function applyWheelOrder() {
    const slots = arcLayout(abBtns.length);
    for (const b of abBtns) { b.polar = slots[wheelOrder.indexOf(b.slot)]; b.el.classList.remove('ring0', 'ring1'); b.el.classList.add('ring' + b.polar.ring); }
    layout();
  }

  // ---- world gestures (pan / pinch / tap)
  const pointers = new Map();     // pointerId -> { id, role:'joy'|'pan'|'pinch'|'dead'|'btn'|'atk', x0,y0,x,y,t0,moved }
  let pinch = null;
  const rig = () => renderer.rig;
  function worldTap(p, rect) {
    const pk = renderer.pick ? renderer.pick(p.x - rect.left, p.y - rect.top, TOUCH_PICK) : null;
    const s = state(), u = pk && pk.unitId && s && s.units ? s.units.get(pk.unitId) : null, me_ = heroU();
    if (u && alive(u) && u.team !== myTeam() && u.team !== TEAM.NONE && !isSpec() && validTarget(u, { team: 'ENEMY', myTeam: myTeam(), visible })) {
      setLock(u.id); order(orderAttack(u.id)); noteOrder();
    } else if (pk && !isSpec() && me_ && !dead(me_)) { order(orderMove(Math.round(clampW(pk.x)), Math.round(clampW(pk.y)), false)); noteOrder(); }   // anything else: move there
    else if (u) { setLock(''); if (renderer.setSelected) renderer.setSelected(u.id); if (H.select) H.select(u.id); }
    else if (!lockId) { if (renderer.setSelected) renderer.setSelected(null); if (H.select) H.select(null); }
  }
  /** hold-to-walk: a move order to the world point under the finger */
  function walkTo(p) {
    const u = heroU(); if (!u || dead(u) || !renderer.pick) return;
    const cr = canvas.getBoundingClientRect(), g = renderer.pick(p.x - cr.left, p.y - cr.top, TOUCH_PICK);
    order(orderMove(Math.round(clampW(g.x)), Math.round(clampW(g.y)), false)); noteOrder(); p.sent = true;
  }
  function canvasDown(e) {
    if (turnShown) return;
    e.preventDefault();
    if (e.isPrimary && e.pointerType === 'touch') {   // first finger down = no other touch is live: a world pointer still in the map lost its pointerup and would turn this touch into a runaway pinch
      for (const [id, q] of pointers) if (q.role === 'pan' || q.role === 'pinch' || q.role === 'dead' || q.role === 'walk' || q.role === 'joy') { pointers.delete(id); if (q.role === 'joy') endJoy(); }
      pinch = null; if (cam) cam.peekEnd();
    }
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    const rect = canvas.getBoundingClientRect();
    const p = { id: e.pointerId, role: 'pan', x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: now(), moved: false };
    // the joystick stays live while a spell / attack is being aimed (one thumb moves, the other aims); a touch outside the joystick zone during an aim only pans (no tap)
    if (!isSpec() && !joy && e.clientX < rect.left + rect.width * T.ZONE && e.clientY > topLimit()) { p.role = 'joy'; startJoy(p, rect); }
    else if (aim || (atkS && atkS.aiming)) { p.aimPan = true; if (locked) p.role = 'dead'; }   // locked: a second finger during an aim does nothing
    else if (locked && !isSpec()) p.role = 'walk';
    pointers.set(e.pointerId, p);
    const pans = [...pointers.values()].filter((q) => q.role === 'pan' || q.role === 'pinch' || (q.role === 'walk' && !q.sent));   // two fresh world fingers = pinch
    if (pans.length >= 2) {
      const [a, b] = pans; a.role = b.role = 'pinch';
      if (cam) cam.peekEnd();
      const r = rig();
      const dd = Math.hypot(a.x - b.x, a.y - b.y);
      pinch = { a, b, d0: dd, last: dd, g0: r ? r.distanceGoal : 0 };
    }
  }
  const toWorld = (dx, dy) => { const r = rig(), rect = canvas.getBoundingClientRect(); return dragToWorld(dx, dy, rect.width, rect.height, (r && r.visibleWidth) || 2100, (r && r.visibleHeight) || 1190); };
  function panBy(dx, dy) { const w = toWorld(dx, dy); if (cam) cam.pan(w.x, w.y); }
  /** Locked world finger: tap / hold (walk) / peek (camdir classifyPress, sticky). Entering peek applies the whole drag so far (returns true). */
  function classifyWalk(p, t, released) {
    p.maxD = Math.max(p.maxD || 0, Math.hypot(p.x - p.x0, p.y - p.y0));
    const prev = p.cls || 'pending';
    p.cls = classifyPress(p.maxD / K, t - p.t0, released, prev, !!(renderer.isShowcase && renderer.isShowcase()));
    if (p.cls === 'hold') p.walking = true;
    if (p.cls === 'peek' && prev !== 'peek' && cam) { cam.peekStart(); const w = toWorld(p.x - p.x0, p.y - p.y0); cam.peekMove(w.x, w.y); return true; }
    return false;
  }
  function onMove(e) {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > T.TAP_MOVE) p.moved = true;
    if (p.role === 'btn') { aimMove(e); return; }
    if (p.role === 'atk') { atkMove(e); return; }
    if (p.role === 'rdrag') { rdragMove(e); return; }
    if (p.role === 'tip') { if (p.moved) { clearLong(); clearReorderTimer(); hideTip(); } return; }
    if (p.role === 'joy') { moveJoy(p); return; }
    if (p.role === 'walk') { if (!classifyWalk(p, now(), false) && p.cls === 'peek' && cam) { const w = toWorld(dx, dy); cam.peekMove(w.x, w.y); } return; }
    if (p.role === 'pan') {
      if (!p.panning && Math.hypot(p.x - p.x0, p.y - p.y0) > T.PAN_SLOP) { p.panning = true; if (locked) setLocked(false); panBy(p.x - p.x0, p.y - p.y0); return; }
      if (p.panning) panBy(dx, dy);
    } else if (p.role === 'pinch' && pinch) {
      const d = Math.hypot(pinch.a.x - pinch.b.x, pinch.a.y - pinch.b.y);
      if (renderer.zoomBy) {   // renderer clamps showcase..far; fingers too close or a jump between events are noise, not a zoom
        if (d >= T.PINCH_MIN && pinch.last >= T.PINCH_MIN) renderer.zoomBy(Math.max(1 - T.PINCH_STEP, Math.min(1 + T.PINCH_STEP, pinch.last / d)));
        pinch.last = d; return;
      }
      const r = rig(); if (!r) return;
      r.distanceGoal = pinchGoal(pinch.g0, pinch.d0, d, r.minDist, r.maxDist);
    }
  }
  function onUp(e) {
    const p = pointers.get(e.pointerId); if (!p) return;
    pointers.delete(e.pointerId);
    const cancelled = e.type === 'pointercancel';
    if (p.role === 'btn') { endAim(!cancelled); return; }
    if (p.role === 'tip') {
      clearLong(); clearReorderTimer(); p.b.el.classList.remove('down'); hideTip();
      if (p.b.ptr === p.id) p.b.ptr = null;
      if (p.cast && !cancelled && !reorderOn && releaseAction(holdPhase(now() - p.t0, p.moved), 'instant') === 'cast') issueCast(p.b, null);
      return;
    }
    if (p.role === 'rdrag') { rdragEnd(!cancelled); return; }
    if (p.role === 'atk') { atkHeld = null; atk.classList.remove('down'); endAtk(!cancelled); return; }
    if (p.role === 'joy') {
      const quick = now() - p.t0 < T.TAP_MS && !p.moved;
      endJoy();
      if (quick && !cancelled) worldTap(p, canvas.getBoundingClientRect());
    } else if (p.role === 'walk') {
      if (p.cls === 'peek') { if (cam) cam.peekEnd(); }                          // look-around ends: the view springs back
      else if (!cancelled && !p.sent) worldTap(p, canvas.getBoundingClientRect());   // never held: a tap
    } else if (p.role === 'pan') {
      if (!cancelled && !p.aimPan && !p.panning && !p.moved && now() - p.t0 < T.TAP_MS) worldTap(p, canvas.getBoundingClientRect());
    } else if (p.role === 'pinch') {
      pinch = null;
      for (const q of pointers.values()) if (q.role === 'pinch') q.role = 'dead';     // the remaining finger does nothing until lifted
    }
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* */ }
  }

  // ---- control buttons
  function attackDown(e) {
    if (turnShown || atkHeld != null) return;
    e.preventDefault();
    if (isSpec()) return;
    atkHeld = e.pointerId; atkNext = now() + 450; atk.classList.add('down');
    pointers.set(e.pointerId, { id: e.pointerId, role: 'atk' });
    try { atk.setPointerCapture(e.pointerId); } catch { /* */ }
    const r = atk.getBoundingClientRect();
    atkS = { ptr: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2, ex: e.clientX, ey: e.clientY, dx: 0, dy: 0, fired: false, aiming: false, inCancel: false, unitId: '', point: null, mag: 0, tg: null, reach: 0, timer: 0 };
    // a tap attacks on release; a press that stays put attacks after ATK_HOLD_MS and keeps auto-attacking; a drag turns it into aim mode first
    atkS.timer = setTimeout(() => { const s = atkS; if (!s || s.aiming || s.fired) return; s.fired = true; atkNext = now() + 450; doAttack(); }, T.ATK_HOLD_MS);
  }
  const lhDown = (e) => { if (turnShown) return; e.preventDefault(); if (!isSpec()) lastHit(); };
  const lockDown = (e) => { if (turnShown) return; e.preventDefault(); if (!isSpec()) cycleLock(); };
  let sbOpen = false;
  const setSb = (v) => { sbOpen = !!v; if (H.setScoreboard) H.setScoreboard(sbOpen); bScore.classList.toggle('on', sbOpen); };
  function attachTop() {
    const act = (el, fn) => { on(el, 'pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); }); on(el, 'click', (e) => { e.preventDefault(); if (!turnShown) fn(); }); };
    act(bShop, () => { if (H.toggleShop) H.toggleShop(); });
    act(bScore, () => setSb(!sbOpen));
    act(bChat, () => { if (H.openChat) H.openChat(); });
    act(bMenu, () => { if (H.toggleMenu) H.toggleMenu(); });
    act(bCam, () => { if (locked) setLocked(false); else { setLocked(true); recentre(); } });
    const sb = root.querySelector('.h-sb'); if (sb) on(sb, 'click', () => setSb(false));
    if (H.setPortraitCentre) H.setPortraitCentre(() => { setLocked(true); recentre(); });      // portrait tap/double-tap centres on the hero (hold = stats panel, in hud.js)
    const mm = root.querySelector('.h-mm');
    if (mm) on(mm, 'pointerdown', (e) => { mmPtr = e.pointerId; if (cam) cam.suspend(true); }, true);   // suspended before minimap.js jumps (keeps the lock)
    const mmUp = (e) => { if (e.pointerId !== mmPtr) return; mmPtr = null; if (aim) freeAim = true; };   // aiming: stay there until the cast
    on(window, 'pointerup', mmUp); on(window, 'pointercancel', mmUp);
  }

  // ---- portrait guard (full screen + landscape lock live in fullscreen.js)
  const mqPortrait = typeof matchMedia === 'function' ? matchMedia('(orientation: portrait)') : null;
  function checkOrientation() {
    const p = isPortrait(mqPortrait && mqPortrait.matches, innerWidth, innerHeight);
    if (p === turnShown) return;
    turnShown = p;
    turn.classList.toggle('on', p);
    if (p) { cancelAll(); }
    else layout();
  }
  function cancelAll() {
    if (aim) endAim(false);
    exitReorder(); clearReorderTimer(); endAtk(false);
    endJoy(); atkHeld = null; atk.classList.remove('down');
    pointers.clear(); pinch = null; if (cam) cam.peekEnd();
    clearRange(); clearLong(); hideTip();
  }
  // ---- frame
  let raf = 0, fc = 0;
  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (!enabled || !state()) return;
    checkOrientation();
    const u = heroU();
    updateButtons(u);
    if (turnShown) return;
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0; lastT = t;
    edgePan(dt);
    if (cam) { cam.suspend(tempFree()); if (cam.following !== locked) lockUI(cam.following); }   // the director follows (game.js steps it); mirror its lock
    for (const p of pointers.values()) if (p.role === 'walk') {   // hold-to-walk
      classifyWalk(p, t, false);
      if (p.walking && t >= (p.next || 0)) { walkTo(p); p.next = t + T.WALK_MS; }
    }
    if ((fc = (fc + 1) % 45) === 0) updateInset(false);
    checkLock(u);
    if (aim) updateAim();
    if (atkS && atkS.aiming) updateAtkAim();
    joyTick(t);
    if (atkHeld != null && atkS && atkS.fired && !atkS.aiming && t > atkNext) { atkNext = t + 450; doAttack(); }
  }

  // ---- enable / destroy
  function enable() {
    if (enabled || destroyed) return;
    enabled = true;
    setLocked(true);
    if (bootTouch) { removeEventListener('pointerdown', bootTouch, true); bootTouch = null; }
    injectTouchStyle(); injectTouchStyle2();
    document.documentElement.classList.add('p2d-touch');
    root.append(turn); R.style.display = '';
    // minimap: top-left under the top bar on touch (out of the bottom-left portrait cluster): the left thumb rests bottom-left on the stick,
    // so a minimap press is a deliberate reach, never a stray joystick touch; the right thumb keeps the spell wheel for minimap casts
    mmEl = root.querySelector('.h-mm');
    if (mmEl) { mmHome = { parent: mmEl.parentNode, next: mmEl.nextSibling }; mmEl.classList.add('t-mmtop'); root.append(mmEl); }
    layout(); attachTop();
    on(canvas, 'pointerdown', canvasDown);
    on(atk, 'pointerdown', attackDown);
    on(lockBtn, 'pointerdown', lockDown);
    on(lhBtn, 'pointerdown', lhDown);
    for (const b of bagCells.concat(wiBtns)) on(b.el, 'pointerdown', (e) => btnDown(b, e));
    on(bagB, 'pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (!turnShown && !isSpec()) setBag(!bagOpen); });
    on(sellEl, 'pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const u = heroU(); if (!u || selSlot < 0 || !sellEl.classList.contains('on')) return;
      order({ t: ORDER.SELL, slot: selSlot }); hideTip(); flash(bagCells[selSlot].el); setBag(false);
    });
    anchor.addEventListener('pointerdown', (e) => { const el = e.target.closest && e.target.closest('.t-ab'); const b = el && abBtns.find((x) => x.el === el); if (b) btnDown(b, e); });
    on(window, 'pointerdown', (e) => {
      const inBag = !!(e.target && e.target.closest && e.target.closest('.t-bagp, .t-bagb'));
      if (bagOpen && !inBag && !rdrag) setBag(false);                                     // tap outside closes the bag (the tap still does its thing)
      if (reorderOn && !(e.target && e.target.closest && e.target.closest('.t-ab, .t-wi, .t-bagp, .t-bagb'))) { exitReorder(); e.stopPropagation(); e.preventDefault(); return; }   // DONE / any tap outside the wheel
      if (tipEl && !tipEl.classList.contains('t-compact')) hideTip();
    }, true);
    on(window, 'pointermove', onMove);
    on(window, 'pointerup', onUp);
    on(window, 'pointercancel', onUp);
    on(window, 'resize', () => { layout(); checkOrientation(); });
    on(window, 'orientationchange', () => { layout(); checkOrientation(); });
    if (mqPortrait && mqPortrait.addEventListener) on(mqPortrait, 'change', checkOrientation);
    on(window, 'blur', cancelAll);
    on(document, 'gesturestart', (e) => e.preventDefault());
    on(document, 'gesturechange', (e) => e.preventDefault());
    on(root, 'contextmenu', (e) => e.preventDefault());
    on(window, 'dragstart', (e) => e.preventDefault());
    if (input && input.setTouchMode) input.setTouchMode(true);
    if (renderer.setCameraFar) renderer.setCameraFar(T.ZOOM_FAR, T.ZOOM_START);   // touch camera: starts at the furthest distance 1450, pinch in only
    checkOrientation();
    raf = requestAnimationFrame(frame);
  }

  if (touchWanted(search, realCoarse)) enable();
  else {
    bootTouch = (e) => { if (e.pointerType === 'touch') enable(); };
    addEventListener('pointerdown', bootTouch, true);
  }

  return {
    isActive: () => enabled,
    /** camera lead: joystick direction (game.js feeds it to renderer.stepCamera) */
    moveDir: () => (enabled ? moveDir() : null),
    /** test / debug hooks */
    get locked() { return locked; },
    get lockId() { return lockId; },
    get blocked() { return turnShown; },
    get aimSens() { return aimSens; },
    /** menu: aim sensitivity (clamped 0.75..2.5, saved under p2d.aimSens) */
    setAimSens(v) { aimSens = clampSens(v); saveAimSens(store(), aimSens); if (enabled) layout(); },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      if (bootTouch) removeEventListener('pointerdown', bootTouch, true);
      if (enabled) {
        cancelAll();
        for (const [t, type, fn, opts] of subs) t.removeEventListener(type, fn, opts);
        subs.length = 0;
        if (input && input.setTouchMode) input.setTouchMode(false);
        document.documentElement.classList.remove('p2d-touch', 'p2d-narrow');
        if (renderer.setViewInset) renderer.setViewInset({ top: 0, bottom: 0 });
        document.documentElement.style.removeProperty('--p2d-u'); document.documentElement.style.removeProperty('--k'); document.documentElement.style.removeProperty('--bk');
      }
      if (mmEl && mmHome && mmHome.parent) { mmEl.classList.remove('t-mmtop'); mmHome.parent.insertBefore(mmEl, mmHome.next && mmHome.next.parentNode === mmHome.parent ? mmHome.next : null); }
      R.remove(); turn.remove(); clearTimeout(rangeTimer);
    },
  };
}
