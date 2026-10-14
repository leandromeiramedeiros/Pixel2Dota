// Touch / mobile controls (Wild Rift / Albion style).  createTouch({ root, canvas, renderer, hud, input, sheets, getState, mySid, send }) -> { destroy(), isActive() }
//   Active when `?touch=1`, or a coarse pointer, or the first touch event.  Desktop mouse + keyboard play is untouched.
//   LEFT   floating joystick (left 40%, below the top bar) -> move orders toward hero + dir * 300, ~8 Hz, stop on release.
//   RIGHT  attack button (target lock > nearest enemy hero > nearest enemy unit > attack-move forward), ability arc, item row, lock/cycle button.
//          instant spells: tap casts.  self-castable spells / items: double tap casts on self (blink = toward facing), hold to aim.
//          other targeted spells: hold -> range finder + aim pad, drag aims, release casts, drag onto CANCEL cancels.  A short tap only previews the range.
//   WORLD  one-finger drag pans (unlocks the camera), pinch zooms, tap an enemy attacks it.  Minimap tap moves the camera, portrait tap recentres + locks.
//   Portrait phones get a "turn your phone sideways" overlay that blocks input.
import { MSG, ORDER, TEAM, ST, KIND } from '../../../shared/protocol.js';
import { MAP_MIN, MAP_MAX } from '../../../shared/constants.js';
import { GLYPHS } from './glyphs.js';
import { pixelEl, paintInto } from './pixels.js';
import { fmtCd, sweepDeg, prettyName } from './format.js';
import { h } from './panels.js';
import {
  heroKeyLetters, ITEM_LETTERS, targetInfo, abilityReady, itemReady, canLearn, orderMove, orderCast, orderAttack, orderAmove, teamOk,
} from './targeting.js';
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
  TAP_MS: 220,           // a press shorter than this (and not dragged) is a tap
  TAP_MOVE: 14,          // px
  PAN_SLOP: 8,           // px before a one-finger drag pans
  AIM_R: 96,             // px, drag radius that maps to the full cast range
  ATK_EXTRA: 300,        // attack-button search radius = attack range + this
  SNAP: 380,             // world units: unit-target aim snaps to the nearest unit within this of the aim point
  SUPPRESS_MS: 320,      // joystick stays quiet this long after a cast / attack order so it is not overwritten
  ZONE: 0.4,             // joystick zone = left 40% of the screen
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
const BAG = {
  pal: { k: '#10131c', y: '#e8b83a', o: '#a77a1c', w: '#fff3b0' },
  rows: ['..kkkkkk..', '...kooyk..', '..kyyyyyk.', '.kyywyyyyk', 'kyywyyyyyk', 'kyyyyyyyok', 'kyyyyyyook', '.koooooook', '..kkkkkk..'],
};

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
  const me = () => { const s = state(); return s && s.players ? s.players.get(mySid) : null; };
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
  const cancelEl = h('div', 't-cancel'); cancelEl.append(h('span', null, '✕'), h('em', null, 'CANCEL')); anchor.append(cancelEl);
  const atk = h('div', 't-btn t-atk'); const atkIco = pixelEl(GLYPHS.sword, null, 1); atkIco.classList.add('t-glyph'); atk.append(atkIco); anchor.append(atk);
  const lockBtn = h('div', 't-btn t-lock'); const lockIco = pixelEl(GLYPHS.reticle, null, 1); lockIco.classList.add('t-glyph'); lockBtn.append(lockIco); anchor.append(lockBtn);
  const itemsEl = h('div', 't-items'); R.append(itemsEl);
  const topEl = h('div', 't-top'); R.append(topEl);
  const topBtn = (glyph, label, cls) => {
    const b = h('div', 't-btn t-sm ' + cls); const g = pixelEl(glyph, null, 1); g.classList.add('t-glyph'); b.append(g, h('i', null, label)); topEl.append(b); return b;
  };
  const bShop = topBtn(BAG, 'SHOP', 't-shop'), bScore = topBtn(GLYPHS.skull, 'SCORE', 't-score'), bChat = topBtn(BUBBLE, 'CHAT', 't-chat'), bCam = topBtn(LOCK, 'CAM', 't-cam');
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
    arcLayout(n).forEach((p, i) => {
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

  // ---- layout (px; scale k grows on tablets, never shrinks below phone size so buttons stay >= 56 px)
  let K = 1, W = 844, Hh = 390;
  const SZ = { atk: 88, ab: 58, it: 46, lock: 44, sm: 46 };
  function layout() {
    W = root.clientWidth || innerWidth; Hh = root.clientHeight || innerHeight;
    K = Math.max(1, Math.min(1.5, Math.min(W / 844, Hh / 390)));
    const px = (v) => Math.round(v * K) + 'px';
    const unit = Math.max(1.25, Math.round(1.25 * K * 4) / 4);   // fallback HUD unit (messages etc.); most panels set their own from --k
    document.documentElement.style.setProperty('--p2d-u', unit + 'px');
    document.documentElement.style.setProperty('--k', String(K));
    const half = (SZ.atk * K) / 2;
    anchor.style.right = `calc(env(safe-area-inset-right, 0px) + ${px(10)} + ${half}px)`;
    anchor.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${px(10)} + ${half}px)`;
    const place = (el, size, x, y) => { el.style.width = el.style.height = px(size); el.style.left = Math.round(x * K) + 'px'; el.style.top = Math.round(y * K) + 'px'; el.style.marginLeft = el.style.marginTop = -Math.round(size * K / 2) + 'px'; };
    place(atk, SZ.atk, 0, 0);
    const la = 68 * RAD, lr = SZ.atk / 2 + SZ.lock / 2 + 4;
    place(lockBtn, SZ.lock, Math.cos(la) * lr, -Math.sin(la) * lr);
    for (const b of abBtns) place(b.el, SZ.ab, Math.cos(b.polar.a * RAD) * b.polar.r, -Math.sin(b.polar.a * RAD) * b.polar.r);
    place(cancelEl, 58, 6, -252);
    const padD = T.AIM_R * 2 * K;
    pad.style.width = pad.style.height = padD + 'px'; pad.style.marginLeft = pad.style.marginTop = -padD / 2 + 'px';
    itemsEl.style.right = `calc(env(safe-area-inset-right, 0px) + ${px(10 + SZ.atk + 14)})`;
    itemsEl.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${px(8)})`;
    for (const b of itBtns) b.el.style.width = b.el.style.height = px(SZ.it);
    joyBase.style.width = joyBase.style.height = px(T.JOY_R * 2); joyKnob.style.width = joyKnob.style.height = px(50);
    document.documentElement.classList.toggle('p2d-narrow', W < 760);
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
  const recentre = () => { const u = heroU(); if (u) renderer.setTarget(u.x, u.y); };

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
    const ox = Math.max(rect.left + m, Math.min(p.x, rect.left + rect.width * T.ZONE + m)), oy = Math.max(topLimit() + m, Math.min(p.y, rect.bottom - m));
    joy = { id: p.id, ox, oy, vec: dragVector(0, 0, T.JOY_R * K), last: null, sentAt: 0, moving: false };
    joyBase.style.left = ox + 'px'; joyBase.style.top = oy + 'px';
    joyKnob.style.transform = 'translate(-50%,-50%)';
    showJoy(true);
  }
  function moveJoy(p) {
    if (!joy) return;
    joy.vec = dragVector(p.x - joy.ox, p.y - joy.oy, T.JOY_R * K);
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

  // ---- casting
  let aim = null;      // { b, cls, info, key, name, dx, dy, snap, moved, ptr, down, cx, cy, inCancel, point:{x,y}|null, unitId }
  let rangeTimer = 0;
  const targetingFor = (b, info, key, line) => ({ kind: b.kind, slot: b.slot, info, name: prettyName(key), line });
  function clearRange() { clearTimeout(rangeTimer); rangeTimer = 0; if (!aim && H.setTargeting) H.setTargeting(null); }
  function showRange(b, info, key, ms) {
    clearTimeout(rangeTimer);
    if (H.setTargeting) H.setTargeting(targetingFor(b, info, key, false));
    if (H.setAim) { const u = heroU(); if (u) H.setAim(u.x, u.y); }
    rangeTimer = setTimeout(() => { rangeTimer = 0; if (!aim && H.setTargeting) H.setTargeting(null); }, ms);
  }
  const itemOrAbility = (u, b) => (b.kind === 'item' ? u.items[b.slot] : u.abilities[b.slot]);
  const issueCast = (b, target) => { order(orderCast(b.kind, b.slot, target, false)); noteOrder(); flash(b.el); };

  function btnDown(b, e) {
    if (turnShown || b.ptr != null) return;
    e.preventDefault();
    if (e.target && e.target.classList && e.target.classList.contains('t-learn')) return;
    const u = heroU(); if (!u || dead(u) || isSpec()) return;
    const ent = itemOrAbility(u, b), key = ent && ent.key; if (!key) return;
    const lvl = b.kind === 'ability' ? ent.level : 1;
    const { cls, info } = castClass(b.kind, key, lvl);
    if (cls === 'passive') return;
    const rdy = b.kind === 'item' ? itemReady(u, b.slot) : abilityReady(u, b.slot);
    if (!rdy.ok) { if (rdy.reason !== 'empty') { warn(rdy.reason); flash(b.el, 'f-bad'); } return; }
    clearRange();
    if (cls === 'instant') { issueCast(b, null); return; }
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
    aim = { b, cls, info: Object.assign({}, info, { range }), key, name: prettyName(key), dx: 0, dy: 0, moved: false, ptr: e.pointerId, down: t, cx: r.left + r.width / 2, cy: r.top + r.height / 2, inCancel: false, point: null, unitId: '' };
    pointers.set(e.pointerId, { id: e.pointerId, role: 'btn', b });
    try { b.el.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    const rect = pad.parentNode.getBoundingClientRect();
    pad.style.left = (aim.cx - rect.left) + 'px'; pad.style.top = (aim.cy - rect.top) + 'px';
    R.classList.add('aiming'); cancelEl.classList.remove('hot');
    if (H.setTargeting) H.setTargeting(targetingFor(b, aim.info, key, true));
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
    if (hasDrag) { ax = u.x + off.x; ay = u.y + off.y; }
    else { ax = u.x + Math.cos(f) * a.info.range * 0.75; ay = u.y + Math.sin(f) * a.info.range * 0.75; }
    if (a.info.mode === 'unit' || a.info.mode === 'unitpoint') {
      const o = { team: a.info.team, myTeam: myTeam(), visible, maxD: hasDrag ? T.SNAP : a.info.range + 400 };
      const s = snapUnit(unitList(), hasDrag ? ax : u.x, hasDrag ? ay : u.y, o);
      if (s) { unitId = s.id; ax = s.x; ay = s.y; }
    }
    a.point = { x: clampW(ax), y: clampW(ay) }; a.unitId = unitId;
    if (H.setAim) H.setAim(a.point.x, a.point.y);
    if (renderer.setHover) renderer.setHover(unitId || null);
    a.b.el.style.transform = `translate(${off.kx}px, ${off.ky}px)`;
  }

  function aimMove(e) {
    if (!aim) return;
    aim.dx = e.clientX - aim.cx; aim.dy = e.clientY - aim.cy;
    if (Math.hypot(aim.dx, aim.dy) > T.TAP_MOVE * K) aim.moved = true;
    const c = cancelEl.getBoundingClientRect(), m = 10;
    aim.inCancel = e.clientX > c.left - m && e.clientX < c.right + m && e.clientY > c.top - m && e.clientY < c.bottom + m;
    cancelEl.classList.toggle('hot', aim.inCancel);
    aim.b.el.classList.toggle('bad', aim.inCancel);
    updateAim();
  }

  function endAim(cast) {
    const a = aim; if (!a) return;
    aim = null;
    pointers.delete(a.ptr); a.b.ptr = null;
    a.b.el.style.transform = '';
    a.b.el.classList.remove('bad');
    R.classList.remove('aiming'); cancelEl.classList.remove('hot');
    if (renderer.setHover) renderer.setHover(null);
    if (H.setTargeting) H.setTargeting(null);
    try { a.b.el.releasePointerCapture(a.ptr); } catch { /* */ }
    if (!cast) return;
    const u = heroU(); if (!u || dead(u)) return;
    const held = now() - a.down;
    if (a.inCancel) return;
    if (!a.moved && held < T.TAP_MS) {                                         // quick tap
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
    if (!isSpec() && !joy && e.clientX < rect.left + rect.width * T.ZONE && e.clientY > topLimit()) { p.role = 'joy'; startJoy(p, rect); }
    pointers.set(e.pointerId, p);
    const pans = [...pointers.values()].filter((q) => q.role === 'pan' || q.role === 'pinch');
    if (pans.length >= 2) {
      const [a, b] = pans; a.role = b.role = 'pinch';
      const r = rig();
      pinch = { a, b, d0: Math.hypot(a.x - b.x, a.y - b.y), g0: r ? r.distanceGoal : 0 };
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
    if (p.role === 'joy') { moveJoy(p); return; }
    if (p.role === 'pan') {
      if (!p.panning && Math.hypot(p.x - p.x0, p.y - p.y0) > T.PAN_SLOP) { p.panning = true; if (locked) setLocked(false); panBy(p.x - p.x0, p.y - p.y0); return; }
      if (p.panning) panBy(dx, dy);
    } else if (p.role === 'pinch' && pinch) {
      const r = rig(); if (!r) return;
      const d = Math.hypot(pinch.a.x - pinch.b.x, pinch.a.y - pinch.b.y);
      r.distanceGoal = pinchGoal(pinch.g0, pinch.d0, d, r.minDist, r.maxDist);
    }
  }
  function onUp(e) {
    const p = pointers.get(e.pointerId); if (!p) return;
    pointers.delete(e.pointerId);
    const cancelled = e.type === 'pointercancel';
    if (p.role === 'btn') { endAim(!cancelled); return; }
    if (p.role === 'atk') { atkHeld = null; atk.classList.remove('down'); return; }
    if (p.role === 'joy') {
      const quick = now() - p.t0 < T.TAP_MS && !p.moved;
      endJoy();
      if (quick && !cancelled) worldTap(p, canvas.getBoundingClientRect());
    } else if (p.role === 'pan') {
      if (!cancelled && !p.panning && !p.moved && now() - p.t0 < T.TAP_MS) worldTap(p, canvas.getBoundingClientRect());
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
    doAttack();
  }
  const lockDown = (e) => { if (turnShown) return; e.preventDefault(); if (!isSpec()) cycleLock(); };
  let sbOpen = false;
  const setSb = (v) => { sbOpen = !!v; if (H.setScoreboard) H.setScoreboard(sbOpen); bScore.classList.toggle('on', sbOpen); };
  function attachTop() {
    const act = (el, fn) => { on(el, 'pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); }); on(el, 'click', (e) => { e.preventDefault(); if (!turnShown) fn(); }); };
    act(bShop, () => { if (H.toggleShop) H.toggleShop(); });
    act(bScore, () => setSb(!sbOpen));
    act(bChat, () => { if (H.openChat) H.openChat(); });
    act(bCam, () => { if (locked) setLocked(false); else { setLocked(true); recentre(); } });
    const sb = root.querySelector('.h-sb'); if (sb) on(sb, 'click', () => setSb(false));
    const port = root.querySelector('.h-port'); if (port) on(port, 'click', () => { setLocked(true); recentre(); });
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
    endJoy(); atkHeld = null; atk.classList.remove('down');
    pointers.clear(); pinch = null;
    clearRange();
  }
  // ---- frame
  let raf = 0;
  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (!enabled || !state()) return;
    checkOrientation();
    const u = heroU();
    updateButtons(u);
    if (turnShown) return;
    if (locked && u && !isSpec()) renderer.setTarget(u.x, u.y);
    checkLock(u);
    if (aim) updateAim();
    joyTick(t);
    if (atkHeld != null && t > atkNext) { atkNext = t + 450; doAttack(); }
  }

  // ---- enable / destroy
  function enable() {
    if (enabled || destroyed) return;
    enabled = true;
    if (bootTouch) { removeEventListener('pointerdown', bootTouch, true); bootTouch = null; }
    injectTouchStyle();
    document.documentElement.classList.add('p2d-touch');
    root.append(turn); R.style.display = '';
    layout(); attachTop();
    on(canvas, 'pointerdown', canvasDown);
    on(atk, 'pointerdown', attackDown);
    on(lockBtn, 'pointerdown', lockDown);
    for (const b of itBtns) on(b.el, 'pointerdown', (e) => btnDown(b, e));
    anchor.addEventListener('pointerdown', (e) => { const el = e.target.closest && e.target.closest('.t-ab'); const b = el && abBtns.find((x) => x.el === el); if (b) btnDown(b, e); });
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
        document.documentElement.style.removeProperty('--p2d-u'); document.documentElement.style.removeProperty('--k');
      }
      R.remove(); turn.remove(); clearTimeout(rangeTimer);
    },
  };
}
