// Touch / mobile controls (Wild Rift / Albion style).  createTouch({ root, canvas, renderer, hud, input, sheets, getState, mySid, send }) -> { destroy(), isActive() }
//   Active when `?touch=1`, or a coarse pointer, or the first touch event.  Desktop mouse + keyboard play is untouched.
//   LEFT   floating joystick (left 40%, below the top bar) -> move orders toward hero + dir * 300, ~8 Hz, stop on release.
//   RIGHT  attack button: tap = target lock > nearest enemy hero > nearest enemy unit > attack-move forward; press-and-drag = aim (the enemy closest to the
//          drag highlights, heroes first; release attacks it, drag back / onto CANCEL cancels).  LH = last-hit / structure button.  Ability arc, item row, lock/cycle button.
//          Hold a spell / item button still: 0.75 s = its tooltip (release without moving = NO cast), 1.75 s = rearrange the wheel (spells: drag a
//          button onto another slot; DONE or a tap outside exits; saved per hero).  See holdPhase().
//          instant spells: tap casts.  self-castable spells / items: double tap casts on self (blink = toward facing), hold to aim.
//          other targeted spells: press -> range finder + aim ring; the ICON STAYS PUT, a small knob follows the finger; drag aims, release casts.
//          Cancel: release on the CANCEL target above the wheel, or slide back onto the button.  A short tap only previews the range.
//          The move joystick keeps working while a spell / attack is aimed (the other thumb), the rangefinder stays on the hero.
//   WORLD  one-finger drag pans (unlocks the camera), pinch zooms, tap an enemy attacks it.  Minimap (bottom-left, next to the portrait) tap moves the camera,
//          portrait tap recentres + locks, portrait hold shows the stats panel (hud.js).
//   Portrait phones get a "turn your phone sideways" overlay that blocks input.
import { MSG, ORDER, TEAM, ST, KIND } from '../../../shared/protocol.js';
import { MAP_MIN, MAP_MAX } from '../../../shared/constants.js';
import { GLYPHS } from './glyphs.js';
import { pixelEl, paintInto } from './pixels.js';
import { fmtCd, sweepDeg, prettyName } from './format.js';
import { h } from './panels.js';
import {
  heroKeyLetters, ITEM_LETTERS, targetInfo, abilityReady, itemReady, canLearn, orderMove, orderCast, orderAttack, orderAmove, teamOk,
  swapOrder, loadWheelOrder, saveWheelOrder, nearestIndex, hudInset,
} from './targeting.js';
import { DATA } from '../../../shared/data.js';
import { injectTouchStyle } from './style.js';

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
  RECENTRE_SNAP: 1500,   // camera jumps further than this snap instead of gliding
};

const clampW = (v) => Math.max(MAP_MIN, Math.min(MAP_MAX, v));
const RAD = Math.PI / 180;

// ------------------------------------------------------------------------------------------------ pure helpers (node-testable)
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
.t-root.reorder .t-ab { animation:t-wig .26s ease-in-out infinite; box-shadow:0 0 0 2px rgba(5,7,11,.92), inset 0 0 0 2px #7aeaff, inset 0 0 0 4px rgba(5,7,11,.85), 0 0 12px rgba(120,235,255,.7); }
.t-root.reorder .t-ab:nth-child(odd) { animation-delay:-.13s; }
.t-root.reorder .t-ab.rdrag { animation:none; z-index:8; transition:none; }
.t-root.reorder .t-ab.rdrop { animation:none; transform:scale(1.18); box-shadow:0 0 0 2px rgba(5,7,11,.92), inset 0 0 0 3px #7dffa8, 0 0 16px rgba(125,255,168,.9); }
.t-root.reorder .t-atk, .t-root.reorder .t-lock, .t-root.reorder .t-lh, .t-root.reorder .t-items, .t-root.reorder .t-joy { opacity:.3; }
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
  const order = (o) => { if (isSpec()) return; send(MSG.ORDER, o); };
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
  const reorderBar = h('div', 't-reorder'); reorderBar.append(h('span', null, 'DRAG A SPELL ONTO ANOTHER SLOT'), h('b', 't-done', 'DONE')); R.append(reorderBar);
  const itemsEl = h('div', 't-items'); R.append(itemsEl);
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
  const itBtns = [];
  const mkIcon = () => { const cv = h('canvas', 'px t-ico'); cv.width = cv.height = 20; return cv; };
  for (let i = 0; i < 6; i++) {
    const el = h('div', 't-btn t-it empty');
    const cv = mkIcon(), sweep = h('div', 't-sweep'), cdt = h('div', 't-cdt'), key = h('div', 't-key', ITEM_LETTERS[i]), ch = h('div', 't-ch');
    el.append(cv, sweep, cdt, key, ch); itemsEl.append(el);
    itBtns.push({ kind: 'item', slot: i, el, cv, sweep, cdt, ch, k: '', ptr: null, tapAt: 0 });
  }
  function buildAbilities(u) {
    for (const b of abBtns) b.el.remove();
    abBtns = [];
    const letters = heroKeyLetters(u.key);
    const n = u.abilities.length;
    exitReorder();
    wheelHero = u.key; wheelOrder = loadWheelOrder(store(), u.key, n);
    const slots = arcLayout(n);
    slots.forEach((_, i) => {
      const p = slots[wheelOrder.indexOf(i)];
      const el = h('div', 't-btn t-ab ring' + p.ring);
      const cv = mkIcon(), sweep = h('div', 't-sweep'), cdt = h('div', 't-cdt'), key = h('div', 't-key', letters[i] || ''), mc = h('div', 't-mc');
      const learn = h('div', 't-learn', '+');
      el.append(cv, sweep, cdt, key, mc, learn); anchor.append(el);
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
  const SZ = { atk: 88, ab: 59, it: 47, lock: 44, sm: 50, lh: 40 };
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
    place(cancelEl, 58, 6, -252);
    aimKnob.style.width = aimKnob.style.height = px(30); aimKnob.style.marginLeft = aimKnob.style.marginTop = -Math.round(15 * K) + 'px';
    const padD = T.AIM_R * 2 * K;
    pad.style.width = pad.style.height = padD + 'px'; pad.style.marginLeft = pad.style.marginTop = -padD / 2 + 'px';
    itemsEl.style.right = `calc(env(safe-area-inset-right, 0px) + ${px(10 + SZ.atk + 14)})`;
    itemsEl.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${px(8)})`;
    for (const b of itBtns) b.el.style.width = b.el.style.height = px(SZ.it);
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
    for (const b of itBtns) {
      const it = u.items[b.slot], k = it && it.key ? it.key : '';
      if (b.k !== k) { b.k = k; const g = b.cv.getContext('2d'); g.clearRect(0, 0, 20, 20); if (k && icons) paintInto(b.cv, icons, k, 1); }
      tc(b.el, 'empty', !k);
      tc(b.el, 'passive', !!k && targetInfo('item', k, 1).mode === 'passive');
      const cd = !!(it && it.cd > 0.05); tc(b.el, 'cd', cd);
      if (cd) { ts(b.sweep, '--a', sweepDeg(it.cd, it.cdMax) + 'deg'); tt(b.cdt, fmtCd(it.cd)); }
      const ch = it && it.charges > 0; ts(b.ch, 'display', ch ? 'block' : 'none'); if (ch) tt(b.ch, it.charges);
      tc(b.el, 'aiming', !!(aim && aim.b === b));
    }
    tc(lockBtn, 'on', !!lockId);
  }

  // ---- camera: follow (own lock flag; input.js's camLock stays off so minimap taps are not overridden)
  let locked = true;
  const setLocked = (v) => { locked = !!v; bCam.classList.toggle('on', locked); bCam.replaceChild((() => { const g = pixelEl(locked ? LOCK : OPEN_LOCK, null, 1); g.classList.add('t-glyph'); return g; })(), bCam.firstChild); };
  setLocked(true);
  // the hero as DRAWN (interpolated render position); the raw state position steps with every server snapshot
  const heroPos = (u) => { const pk = renderer.actors && renderer.actors.picks; if (pk) for (const p of pk) if (p.id === u.id && Number.isFinite(p.x)) return p; return u; };
  function recentre() {
    const u = heroU(); if (!u) return;
    const p = heroPos(u), tg = renderer.getTarget ? renderer.getTarget() : null;
    if (tg && Math.hypot(tg.x - p.x, tg.y - p.y) > T.RECENTRE_SNAP && renderer.snapTarget) renderer.snapTarget(p.x, p.y);   // far flight: jump (the ground height under the camera glides slower than x/y)
    else renderer.setTarget(p.x, p.y);
    const r = rig();
    if (r && r.showcase) r.distanceGoal = Math.min(r.maxDist, Math.max(r.minDist, T.ZOOM_START));   // a pinched-in close-up (flat pitch, narrow FOV) is the "odd angle": back to the gameplay view
  }

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
    const lo = topLimit() + m, hi = Math.max(lo, Math.min(rect.bottom, coverTop()) - m);
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
    order(orderMove(Math.round(clampW(u.x + Math.cos(v.ang) * T.JOY_RANGE)), Math.round(clampW(u.y + Math.sin(v.ang) * T.JOY_RANGE)), false));
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
    const off = aimWorldOffset(s.dx, s.dy, T.AIM_R * K, s.reach);
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
    aim = { b, cls, info: Object.assign({}, info, { range }), key, name: prettyName(key), dx: 0, dy: 0, moved: false, ptr: e.pointerId, down: t, cx: r.left + r.width / 2, cy: r.top + r.height / 2, ex: e.clientX, ey: e.clientY, inCancel: false, overX: false, maxD: 0, point: null, unitId: '' };
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

  /** Recompute the aim point from the current drag (also each frame so snapped units are followed). */
  function updateAim() {
    if (!aim) return;
    const u = heroU(); if (!u || dead(u)) { endAim(false); return; }
    const a = aim, off = aimWorldOffset(a.dx, a.dy, T.AIM_R * K, a.info.range);
    const hasDrag = Math.hypot(a.dx, a.dy) > 6 * K;
    let ax, ay, unitId = '';
    const f = u.facing || 0;
    // the aim point is the thumb's screen position unprojected through the CURRENT camera every frame, so panning the camera
    // (minimap / left hand) under a stationary thumb moves the aim; finite-range spells clamp to the ring, global ones reach map-wide
    if (hasDrag && renderer.pick) {
      const cr = canvas.getBoundingClientRect(), g = renderer.pick(a.ex - cr.left, a.ey - cr.top);
      ax = g.x; ay = g.y;
    } else if (hasDrag) { ax = u.x + off.x; ay = u.y + off.y; }
    else { ax = u.x + Math.cos(f) * a.info.range * 0.75; ay = u.y + Math.sin(f) * a.info.range * 0.75; }
    const unit = a.info.mode === 'unit' || a.info.mode === 'unitpoint';
    if (unit) {
      const o = { team: a.info.team, myTeam: myTeam(), visible, maxD: hasDrag ? T.SNAP : a.info.range + 400 };
      const s = snapUnit(unitList(), hasDrag ? ax : u.x, hasDrag ? ay : u.y, o);
      if (s) { unitId = s.id; ax = s.x; ay = s.y; }
    }
    const rr = a.tg ? a.tg.ring : 0;
    if (!unitId && rr > 0) { const dd = Math.hypot(ax - u.x, ay - u.y); if (dd > rr) { ax = u.x + (ax - u.x) * rr / dd; ay = u.y + (ay - u.y) * rr / dd; } }
    a.point = { x: clampW(ax), y: clampW(ay) }; a.unitId = unitId;
    if (a.tg) { a.tg.unitId = unitId; a.tg.unitOk = !!unitId || a.info.mode === 'point' || a.info.mode === 'unitpoint'; a.tg.cancel = a.inCancel; }
    if (H.setAim) H.setAim(a.point.x, a.point.y);
    if (renderer.setHover) renderer.setHover(unitId || null);
    aimKnob.style.left = (a.ex - a.ox) + 'px'; aimKnob.style.top = (a.ey - a.oy) + 'px';   // the icon stays in its slot; only this knob follows the finger
  }

  function aimMove(e) {
    if (!aim) return;
    aim.ex = e.clientX; aim.ey = e.clientY;
    aim.dx = e.clientX - aim.cx; aim.dy = e.clientY - aim.cy;
    const dist = Math.hypot(aim.dx, aim.dy);
    if (dist > aim.maxD) aim.maxD = dist;
    if (dist > T.TAP_MOVE * K && !aim.moved) { aim.moved = true; clearReorderTimer(); clearLong(); hideTip(); }   // past the threshold: no tooltip, no reorder, keep aiming
    aim.overX = inRect(cancelEl.getBoundingClientRect(), e.clientX, e.clientY, 10);
    aim.inCancel = aimCancelled(aim.overX, aim.dx, aim.dy, aim.maxD, SZ.ab * K / 2);
    cancelEl.classList.toggle('hot', aim.overX);
    aim.b.el.classList.toggle('bad', aim.inCancel);
    updateAim();
  }

  function endAim(cast) {
    const a = aim; if (!a) return;
    aim = null; clearLong(); clearReorderTimer(); hideTip();
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
    if (H.message) H.message('Reorder: drag a spell onto another slot');
    try { if (navigator.vibrate) navigator.vibrate(35); } catch { /* */ }
    rdragStart(b, { pointerId: ptr, clientX: x, clientY: y });                           // the finger is still down: it can drag right away
  }
  function exitReorder() {
    if (!reorderOn) return;
    reorderOn = false; R.classList.remove('reorder');
    if (rdrag) rdragEnd(false);
  }
  function rdragStart(b, e) {
    if (rdrag || b.ptr != null) return;
    b.ptr = e.pointerId; rdrag = { b, ptr: e.pointerId, x0: e.clientX, y0: e.clientY, to: null };
    pointers.set(e.pointerId, { id: e.pointerId, role: 'rdrag', b });
    b.el.classList.add('rdrag');
    try { b.el.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
  }
  const btnCentre = (b) => { const r = b.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  function rdragMove(e) {
    const d = rdrag; if (!d) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    d.b.el.style.transform = `translate(${dx}px, ${dy}px) scale(1.12)`;
    const home = btnCentre(d.b);                                                        // already includes the drag translate
    const others = abBtns.filter((x) => x !== d.b), c = others.map(btnCentre);
    const i = nearestIndex(c, home.x, home.y, SZ.ab * K * 0.75);
    const to = i >= 0 ? others[i] : null;
    if (to !== d.to) { if (d.to) d.to.el.classList.remove('rdrop'); if (to) to.el.classList.add('rdrop'); d.to = to; }
  }
  function rdragEnd(commit) {
    const d = rdrag; if (!d) return;
    rdrag = null; pointers.delete(d.ptr); d.b.ptr = null;
    d.b.el.style.transform = ''; d.b.el.classList.remove('rdrag');
    try { d.b.el.releasePointerCapture(d.ptr); } catch { /* */ }
    if (d.to) d.to.el.classList.remove('rdrop');
    if (commit && d.to) {
      wheelOrder = swapOrder(wheelOrder, wheelOrder.indexOf(d.b.slot), wheelOrder.indexOf(d.to.slot));
      saveWheelOrder(store(), wheelHero, wheelOrder);
      applyWheelOrder(); flash(d.b.el); flash(d.to.el);
    }
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
    const pk = renderer.pick ? renderer.pick(p.x - rect.left, p.y - rect.top) : null;
    const s = state(), u = pk && pk.unitId && s && s.units ? s.units.get(pk.unitId) : null;
    if (u && alive(u) && u.team !== myTeam() && u.team !== TEAM.NONE && !isSpec() && validTarget(u, { team: 'ENEMY', myTeam: myTeam(), visible })) {
      setLock(u.id); order(orderAttack(u.id)); noteOrder();
    } else if (u) { setLock(''); if (renderer.setSelected) renderer.setSelected(u.id); if (H.select) H.select(u.id); }
    else if (!lockId) { if (renderer.setSelected) renderer.setSelected(null); if (H.select) H.select(null); }
  }
  function canvasDown(e) {
    if (turnShown) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    const rect = canvas.getBoundingClientRect();
    const p = { id: e.pointerId, role: 'pan', x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: now(), moved: false };
    // the joystick stays live while a spell / attack is being aimed (one thumb moves, the other aims); a touch outside the joystick zone during an aim only pans (no tap)
    if (!isSpec() && !joy && e.clientX < rect.left + rect.width * T.ZONE && e.clientY > topLimit()) { p.role = 'joy'; startJoy(p, rect); }
    else if (aim || (atkS && atkS.aiming)) p.aimPan = true;
    pointers.set(e.pointerId, p);
    const pans = [...pointers.values()].filter((q) => q.role === 'pan' || q.role === 'pinch');
    if (pans.length >= 2) {
      const [a, b] = pans; a.role = b.role = 'pinch';
      const r = rig();
      const dd = Math.hypot(a.x - b.x, a.y - b.y);
      pinch = { a, b, d0: dd, last: dd, g0: r ? r.distanceGoal : 0 };
    }
  }
  function panBy(dx, dy) {
    const r = rig(), rect = canvas.getBoundingClientRect(), t = renderer.getTarget();
    const wx = ((r && r.visibleWidth) || 2100) / rect.width, wy = (((r && r.visibleHeight) || 1190) / rect.height) / 0.866;
    renderer.setTarget(clampW(t.x - dx * wx), clampW(t.y + dy * wy));
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
    if (p.role === 'pan') {
      if (!p.panning && Math.hypot(p.x - p.x0, p.y - p.y0) > T.PAN_SLOP) { p.panning = true; if (locked) setLocked(false); panBy(p.x - p.x0, p.y - p.y0); return; }
      if (p.panning) panBy(dx, dy);
    } else if (p.role === 'pinch' && pinch) {
      const d = Math.hypot(pinch.a.x - pinch.b.x, pinch.a.y - pinch.b.y);
      if (renderer.zoomBy) { if (d > 0 && pinch.last > 0) renderer.zoomBy(pinch.last / d); pinch.last = d; return; }   // renderer clamps showcase..far
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
    const mm = root.querySelector('.h-mm'); if (mm) on(mm, 'pointerdown', () => { if (locked) setLocked(false); }, true);
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
    pointers.clear(); pinch = null;
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
    if (locked && u && !isSpec()) { const p = heroPos(u); renderer.setTarget(p.x, p.y); }
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
    if (bootTouch) { removeEventListener('pointerdown', bootTouch, true); bootTouch = null; }
    injectTouchStyle(); injectTouchStyle2();
    document.documentElement.classList.add('p2d-touch');
    root.append(turn); R.style.display = '';
    layout(); attachTop();
    on(canvas, 'pointerdown', canvasDown);
    on(atk, 'pointerdown', attackDown);
    on(lockBtn, 'pointerdown', lockDown);
    on(lhBtn, 'pointerdown', lhDown);
    for (const b of itBtns) on(b.el, 'pointerdown', (e) => btnDown(b, e));
    anchor.addEventListener('pointerdown', (e) => { const el = e.target.closest && e.target.closest('.t-ab'); const b = el && abBtns.find((x) => x.el === el); if (b) btnDown(b, e); });
    on(window, 'pointerdown', (e) => {
      if (reorderOn && !(e.target && e.target.closest && e.target.closest('.t-ab'))) { exitReorder(); e.stopPropagation(); e.preventDefault(); return; }   // DONE / any tap outside the wheel
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
    /** test / debug hooks */
    get locked() { return locked; },
    get lockId() { return lockId; },
    get blocked() { return turnShown; },
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
      R.remove(); turn.remove(); clearTimeout(rangeTimer);
    },
  };
}
