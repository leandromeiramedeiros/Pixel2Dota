// Touch spell aim end-to-end: createTouch over a tiny fake DOM, the real camera rig + director, a Town Portal Scroll on the wheel.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TEAM, KIND } from '../../shared/protocol.js';
import { MAP_MIN, MAP_MAX } from '../../shared/constants.js';

const W = 844, HH = 390, noop = () => {};
// ---- fake DOM: just what createTouch touches
class CL { constructor() { this.s = new Set(); } add(...c) { c.forEach((x) => this.s.add(x)); } remove(...c) { c.forEach((x) => this.s.delete(x)); } toggle(c, v) { v = v === undefined ? !this.s.has(c) : !!v; if (v) this.s.add(c); else this.s.delete(c); return v; } contains(c) { return this.s.has(c); } }
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
const win = { ls: {} };
class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.parentNode = null; this.classList = new CL(); this.style = { setProperty(k, v) { this[k] = v; } }; this.ls = {}; this.rect = null; this.dataset = {}; }
  set className(v) { this.classList = new CL(); String(v).split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c)); }
  get className() { return [...this.classList.s].join(' '); }
  append(...n) { for (const c of n) { if (typeof c === 'string') continue; if (c.parentNode) c.remove(); c.parentNode = this; this.children.push(c); } }
  appendChild(c) { this.append(c); return c; }
  replaceChild(n, o) { const i = this.children.indexOf(o); if (i >= 0) { this.children[i] = n; n.parentNode = this; o.parentNode = null; } else this.append(n); return o; }
  remove() { const p = this.parentNode; if (p) { p.children.splice(p.children.indexOf(this), 1); this.parentNode = null; } }
  get firstChild() { return this.children[0] || null; }
  get nextSibling() { return null; }
  addEventListener(t, f) { (this.ls[t] = this.ls[t] || []).push(f); }
  removeEventListener(t, f) { const a = this.ls[t] || [], i = a.indexOf(f); if (i >= 0) a.splice(i, 1); }
  dispatch(t, e) { e.target = e.target || this; for (let n = this; n; n = n.parentNode) for (const f of (n.ls[t] || []).slice()) f(e); for (const f of (win.ls[t] || []).slice()) f(e); }
  getBoundingClientRect() { const r = this.rect ? this.rect() : { left: 0, top: 0, width: 0, height: 0 }; return { ...r, right: r.left + r.width, bottom: r.top + r.height }; }
  setPointerCapture() {} releasePointerCapture() {}
  getContext() { return ctx2d; }
  closest(sel) { const cls = sel.split(',').map((s) => s.trim().replace(/^\./, '')); for (let n = this; n; n = n.parentNode) if (cls.some((c) => n.classList.contains(c))) return n; return null; }
  querySelector(sel) { const c = sel.replace(/^\./, ''); for (const k of this.children) { if (k.classList.contains(c)) return k; const f = k.querySelector(sel); if (f) return f; } return null; }
  get offsetWidth() { return 100; } get offsetHeight() { return 40; } get clientWidth() { return W; } get clientHeight() { return HH; }
}
let clock = 1000, rafs = [];
Object.assign(globalThis, {
  document: { createElement: (t) => new El(t), head: new El('head'), body: new El('body'), documentElement: new El('html'), getElementById: () => null, addEventListener: noop, removeEventListener: noop },
  addEventListener: (t, f) => { (win.ls[t] = win.ls[t] || []).push(f); }, removeEventListener: noop, innerWidth: W, innerHeight: HH,
  matchMedia: (q) => ({ matches: /coarse/.test(q), addEventListener: noop, removeEventListener: noop }),
  getComputedStyle: () => ({ getPropertyValue: () => '0' }),
  requestAnimationFrame: (f) => { rafs.push(f); return rafs.length; }, cancelAnimationFrame: noop,
  ResizeObserver: class { observe() {} disconnect() {} }, ImageData: class { constructor(d, w, h) { Object.assign(this, { data: d, width: w, height: h }); } },
  location: { search: '?touch=1' },
});
globalThis.window = globalThis;
performance.now = () => clock;
const { CameraRig } = await import('../src/render/camera.js');
const { createCamDir } = await import('../src/render/camdir.js');
const { createTouch } = await import('../src/ui/touch.js');

/** One touch match: hero at (hx, hy) with a TP in inventory slot `slot` (other slots: usable items, so the TP sits at wheel position `slot`). */
function setup({ hx = 0, hy = 0, slot = 0 } = {}) {
  win.ls = {}; rafs = [];
  const rig = new CameraRig(); rig.setAspect(W / HH); rig.setFar(1450, 1450);
  const cam = createCamDir({ bounds: [MAP_MIN, MAP_MAX] }), v = new THREE.Vector3();
  const renderer = {
    rig, cam, setHover: noop, setSelected: noop, setViewInset: ({ top = 0, bottom = 0 }) => rig.setViewInset(top, bottom),
    worldToScreen: (x, y, z) => { v.set(x, z == null ? rig.tz : z, -y).project(rig.camera); return { x: (v.x * 0.5 + 0.5) * W, y: (1 - (v.y * 0.5 + 0.5)) * HH }; },
  };
  const keys = ['item_blink', 'item_flask', 'item_clarity', 'item_magic_wand', 'item_faerie_fire', 'item_enchanted_mango'];
  const items = keys.map((key) => ({ key, charges: 1, cd: 0, cdMax: 0 })).concat([0, 0, 0].map(() => ({ key: '', charges: 0, cd: 0, cdMax: 0 })));
  items[slot] = { key: 'item_tpscroll', charges: 1, cd: 0, cdMax: 0 };
  const hero = { id: 'h1', kind: KIND.HERO, key: 'npc_dota_hero_sven', team: TEAM.RADIANT, x: hx, y: hy, facing: 0, hp: 500, maxHp: 500, mana: 300, maxMana: 300, status: 0, respawn: 0, atkRange: 150,
    abilities: ['sven_storm_bolt', 'sven_great_cleave', 'sven_warcry', 'sven_gods_strength'].map((key) => ({ key, level: 1, cd: 0, mana: 0 })), items };
  const state = { phase: 'game', time: 100, players: new Map([['me', { sid: 'me', team: TEAM.RADIANT, heroId: 'h1' }]]), units: new Map([['h1', hero]]) };
  const root = new El('div'), mm = new El('div'), canvas = new El('canvas'), sent = [], hud = {};
  mm.className = 'h-mm'; root.append(mm, canvas);
  root.rect = canvas.rect = () => ({ left: 0, top: 0, width: W, height: HH });
  Object.assign(hud, { setTargeting: noop, setAim: (x, y) => { hud.aim = { x, y }; }, message: noop });
  createTouch({ root, canvas, renderer, hud, input: { setTouchMode: noop }, sheets: null, getState: () => state, mySid: 'me', send: (t, o) => sent.push(o) });
  for (const f of (win.ls.pointerdown || []).slice()) f({ pointerType: 'touch', target: root, clientX: -1, clientY: -1, pointerId: 99, preventDefault: noop, stopPropagation: noop });
  const step = (n = 1, dt = 16) => {
    for (let i = 0; i < n; i++) {
      clock += dt;
      const c = cam.update(dt / 1000, { hero: { x: hero.x, y: hero.y, alive: true }, visibleH: rig.visibleHeight }); rig.place(c.x, c.y, c.snap); rig.update(dt / 1000);
      const fs = rafs; rafs = []; for (const f of fs) f(clock);
    }
  };
  step(30);
  // anchor children: real layout geometry from their inline styles (anchor = the attack button centre)
  const K = Number(document.documentElement.style['--bk']), ax = W - 54 * K, ay = HH - 54 * K, all = [];
  (function walk(n) { all.push(n); n.children.forEach(walk); })(root);
  for (const n of all) if (n.parentNode && n.parentNode.classList.contains('t-anchor')) {
    n.rect = () => { const s = n.style, z = parseFloat(s.width) || 0; return { left: ax + parseFloat(s.left || 0) + parseFloat(s.marginLeft || 0), top: ay + parseFloat(s.top || 0) + parseFloat(s.marginTop || 0), width: z, height: z }; };
  }
  all.find((n) => n.classList.contains('t-anchor')).rect = () => ({ left: ax, top: ay, width: 0, height: 0 });
  const btn = all.filter((n) => n.classList.contains('t-wi') && !n.classList.contains('gone'))[slot];
  const b = btn.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
  const ev = (el, x, y, id = 1, type = '') => ({ pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y, target: el, type, preventDefault: noop, stopPropagation: noop });
  const winEv = (t, e) => { for (const f of (win.ls[t] || []).slice()) f(e); };
  return {
    hero, cam, sent, hud, step, mm,
    press() { btn.dispatch('pointerdown', ev(btn, bx, by)); step(2); },
    drag(dx, dy) { for (let k = 1; k <= 8; k++) { winEv('pointermove', ev(btn, bx + dx * k / 8, by + dy * k / 8)); step(1); } },
    release(dx = 0, dy = 0) { winEv('pointerup', ev(btn, bx + dx, by + dy, 1, 'pointerup')); step(2); },
    minimapTap(x, y) { const e = ev(mm, 10, 10, 7); mm.dispatch('pointerdown', e); cam.jumpTo(x, y); step(3); winEv('pointerup', { ...e, type: 'pointerup' }); step(3); },   // minimap.js: jumpTo the tapped spot
  };
}

test('TP: a minimap tap while aiming puts the aim on the tapped spot (was: the cast landed on the hero itself)', () => {
  const m = setup({ hx: -6000, hy: -6000 });
  m.press(); m.drag(30, 0);
  m.minimapTap(5000, 4000);
  assert.ok(Math.hypot(m.hud.aim.x - 5000, m.hud.aim.y - 4000) < 1, `aim ${JSON.stringify(m.hud.aim)}`);
  m.drag(60, 0);   // the joystick fine-tunes from the tapped spot (it restarted where the thumb was)
  assert.ok(m.hud.aim.x > 5000 + 100 && Math.abs(m.hud.aim.y - 4000) < 1, `fine-tune ${JSON.stringify(m.hud.aim)}`);
  m.release(60, 0);
  const o = m.sent.at(-1);
  assert.equal(o.t, 'item'); assert.equal(o.slot, 0);
  assert.ok(Math.hypot(o.x - 5000, o.y - 4000) < 1200, `order ${JSON.stringify(o)}`);
});

test('TP: holding past the rim pans until the map edge, the cast goes there', () => {
  const m = setup({ hx: -6000, hy: -6000 });
  m.press(); m.drag(110, -110);
  m.step(500);
  m.release(110, -110);
  const o = m.sent.at(-1);
  assert.equal(o.t, 'item');
  assert.ok(o.x > MAP_MAX - 300 && o.y > MAP_MAX - 300, `far corner ${JSON.stringify(o)}`);
});

test('TP in the top wheel slot (under CANCEL): aiming up casts instead of cancelling', () => {
  for (const [dx, dy] of [[0, -56], [40, -40], [-40, -40]]) {
    const m = setup({ slot: 5 });
    m.press(); m.drag(dx, dy); m.release(dx, dy);
    const o = m.sent.at(-1);
    assert.ok(o && o.t === 'item' && o.slot === 5 && o.y > 300, `${dx},${dy}: ${JSON.stringify(o)}`);
  }
});
