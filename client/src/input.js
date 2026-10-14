// Input: Dota-style mouse + keyboard controls -> orders.  createInput({ canvas, renderer, send, hud, getState, mySid }) -> { destroy(), setQuickCast(bool), cancel() }
//   Right-click: move / attack.  A + left-click: attack-move.  S stop, H hold.  Q W E R (+D F for Invoker): cast.  Z X C V B N: items (B opens the shop when slot 5 is empty).
//   Ctrl+key: learn.  Shift: queue.  Alt+key / same key twice: self cast.  Y: camera lock.  F1 / Space: centre on hero.  F4: shop.  Tab: scoreboard.  Enter: chat.
//   Wheel: zoom.  Edge / arrows / middle-drag: pan.
import { MSG } from '../../shared/protocol.js';
import { MAP_MIN, MAP_MAX } from '../../shared/constants.js';
import { GLYPHS } from './ui/glyphs.js';
import { glyphCanvas } from './ui/pixels.js';
import { prettyName } from './ui/format.js';
import {
  abilitySlotForCode, itemSlotForCode, targetInfo, abilityReady, itemReady, canLearn,
  orderMove, orderForRightClick, orderForAttackClick, orderCast, resolveTargetClick, resolveSelfCast,
} from './ui/targeting.js';

const EDGE = 4;            // px from the window edge that pans
const PAN_SPEED = 0.85;    // visible heights per second
const MOVE_REPEAT_MS = 120;
const ARROWS = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

export function createInput({ canvas, renderer, send, hud, getState, mySid }) {
  const order = (o) => send(MSG.ORDER, o);
  const H = hud || {};
  const call = (name, ...a) => (H[name] ? H[name](...a) : undefined);

  let mode = null;                // { kind:'ability'|'item'|'amove', slot, info, name }
  let camLock = false, quickCast = false;
  let mouse = { x: 0, y: 0, in: false, overCanvas: false };
  const held = new Set();
  let midDrag = null, rightHeld = false, lastMoveAt = 0, hoverId = null, pickDirty = true;

  // ---- state helpers
  const state = () => getState();
  const me = () => { const s = state(); return s && s.players ? s.players.get(mySid) : null; };
  const hero = () => { const s = state(), p = me(); return s && p && p.heroId ? s.units.get(p.heroId) : null; };
  const ctx = () => { const s = state(), p = me(); return { myTeam: p ? p.team : -1, getUnit: (id) => (s && s.units ? s.units.get(id) : null) }; };
  const warn = (t) => call('message', t, true);

  // ---- cursors (pixel glyphs)
  const cursorCache = {};
  function cursorFor(name) {
    if (cursorCache[name]) return cursorCache[name];
    let css = 'default';
    try {
      const g = name === 'attack' ? GLYPHS.sword : name === 'target' ? GLYPHS.reticle : null;
      if (g) {
        const c = glyphCanvas(g, 2); const url = c.toDataURL();
        css = `url(${url}) ${Math.floor(c.width / 2)} ${Math.floor(c.height / 2)}, crosshair`;
      }
    } catch { /* no canvas (tests) */ }
    return (cursorCache[name] = css);
  }
  function setCursor() {
    let n = 'default';
    if (mode) n = mode.kind === 'amove' ? 'attack' : 'target';
    else if (hoverId) { const u = ctx().getUnit(hoverId); if (u && u.team !== ctx().myTeam) n = 'attack'; }
    const c = n === 'default' ? 'default' : cursorFor(n);
    if (canvas.style.cursor !== c) canvas.style.cursor = c;
  }

  function setMode(m) {
    mode = m;
    call('setTargeting', m && m.kind !== 'amove' ? m : m ? { kind: 'amove', slot: -1, info: { range: 0, radius: 0 }, name: '' } : null);
    setCursor();
  }
  const cancel = () => { if (mode) setMode(null); };

  // ---- picking
  const rect = () => canvas.getBoundingClientRect();
  const pick = (cx, cy) => { const r = rect(); return renderer.pick(cx - r.left, cy - r.top); };

  // ---- casting
  function activate(kind, slot, e) {
    const u = hero(); if (!u) return;
    const queue = !!(e && e.shiftKey);
    const self = !!(e && e.altKey);
    const key = kind === 'item' ? (u.items[slot] && u.items[slot].key) : (u.abilities[slot] && u.abilities[slot].key);
    if (!key) return;
    const lvl = kind === 'ability' ? u.abilities[slot].level : 1;
    const info = targetInfo(kind, key, lvl);
    if (info.mode === 'passive') return;
    const rdy = kind === 'item' ? itemReady(u, slot) : abilityReady(u, slot);
    if (!rdy.ok) { if (rdy.reason !== 'empty') warn(rdy.reason); return; }
    const tg = { kind, slot, info, name: prettyName(key) };
    // second press of the same key while aiming = self cast
    if (mode && mode.kind === kind && mode.slot === slot) {
      const r = resolveSelfCast(tg, u, queue);
      setMode(null);
      if (r.order) order(r.order); else warn(r.error);
      return;
    }
    if (info.mode === 'none') { setMode(null); order(orderCast(kind, slot, null, queue)); return; }
    if (self) { const r = resolveSelfCast(tg, u, queue); setMode(null); if (r.order) order(r.order); else warn(r.error); return; }
    if (quickCast) {
      const p = mouse.in ? pick(mouse.x, mouse.y) : null;
      if (p) {
        const r = resolveTargetClick(tg, p, ctx(), queue);
        if (r.order) { setMode(null); order(r.order); return; }
        const s2 = resolveSelfCast(tg, u, queue);
        if (s2.order && info.mode !== 'point') { setMode(null); order(s2.order); return; }
      }
    }
    setMode(tg);
  }

  function learn(slot) {
    const u = hero();
    if (u && canLearn(u, slot)) order({ t: 'learn', slot });
    else if (u && u.skillPoints > 0) warn('Cannot learn yet');
  }

  call('setHandlers', { activate });

  // ---- mouse
  function onMouseDown(e) {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true;
    if (e.button === 1) { e.preventDefault(); midDrag = { x: e.clientX, y: e.clientY }; return; }
    const p = pick(e.clientX, e.clientY);
    if (e.button === 0) {
      if (mode) {
        const u = hero(); if (!u) { setMode(null); return; }
        if (mode.kind === 'amove') {
          order(orderForAttackClick(p, ctx(), e.shiftKey));
          if (!e.shiftKey) setMode(null);
        } else {
          const r = resolveTargetClick(mode, p, ctx(), e.shiftKey);
          if (r.order) { order(r.order); if (!e.shiftKey) setMode(null); } else warn(r.error);
        }
        return;
      }
      // select
      const id = p.unitId || null;
      renderer.setSelected && renderer.setSelected(id);
      call('select', id);
    } else if (e.button === 2) {
      if (mode) { setMode(null); return; }
      order(orderForRightClick(p, ctx(), e.shiftKey));
      rightHeld = true; lastMoveAt = performance.now();
    }
  }
  function onMouseUp(e) {
    if (e.button === 1) midDrag = null;
    if (e.button === 2) rightHeld = false;
  }
  function onMouseMove(e) {
    const dx = e.clientX - mouse.x, dy = e.clientY - mouse.y;
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true;
    mouse.overCanvas = e.target === canvas;
    pickDirty = true;
    if (midDrag) {
      const rig = renderer.rig; const t = renderer.getTarget();
      const r = rect();
      const wx = ((rig && rig.visibleWidth) || 2100) / r.width, wy = (((rig && rig.visibleHeight) || 1190) / r.height) / 0.866;
      renderer.setTarget(clampW(t.x - dx * wx), clampW(t.y + dy * wy));
    }
  }
  function onLeave() { mouse.in = false; mouse.overCanvas = false; }
  function onWheel(e) {
    if (!(e.target === canvas)) return;
    e.preventDefault();
    renderer.zoom(Math.sign(e.deltaY) * Math.min(3, Math.max(1, Math.round(Math.abs(e.deltaY) / 100))));
  }
  const noCtx = (e) => e.preventDefault();

  // ---- keyboard
  const typing = () => call('isTyping');
  function onKeyDown(e) {
    const tag = e.target && e.target.tagName;
    if (typing() || tag === 'INPUT' || tag === 'TEXTAREA') return;
    const code = e.code;
    if (ARROWS[code]) { held.add(code); e.preventDefault(); return; }
    if (e.repeat && code !== 'Tab') { if (/^Key|Space|F\d/.test(code)) e.preventDefault(); return; }
    const now = performance.now();

    if (code === 'Tab') { e.preventDefault(); call('setScoreboard', true); return; }
    if (code === 'Enter') { e.preventDefault(); call('openChat'); return; }
    if (code === 'Escape') { if (mode) setMode(null); else if (H.isShopOpen && H.isShopOpen()) call('closeShop'); else { renderer.setSelected && renderer.setSelected(null); call('select', null); } return; }
    if (code === 'F4') { e.preventDefault(); call('toggleShop'); return; }
    if (code === 'F1' || code === 'Space') { e.preventDefault(); const u = hero(); if (u) renderer.setTarget(u.x, u.y); return; }
    if (code === 'KeyY' && !e.ctrlKey && !e.altKey) { camLock = !camLock; call('message', camLock ? 'Camera lock: on' : 'Camera lock: off'); return; }

    const u = hero();
    // abilities
    const as = u ? abilitySlotForCode(u.key, code) : -1;
    if (as >= 0) {
      e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && !e.altKey) { learn(as); return; }
      if (e.altKey && e.ctrlKey) { learn(as); return; }
      activate('ability', as, e);
      return;
    }
    // items
    const is = itemSlotForCode(code);
    if (is >= 0) {
      e.preventDefault();
      if (code === 'KeyB' && !e.ctrlKey) {
        const it = u && u.items[is];
        const usable = it && it.key && targetInfo('item', it.key, 1).mode !== 'passive';
        if (!usable) { call('toggleShop'); return; }
      }
      if (u) activate('item', is, e);
      return;
    }
    if (e.ctrlKey || e.metaKey) return;
    if (code === 'KeyA') { e.preventDefault(); if (u) setMode({ kind: 'amove', slot: -1, info: { mode: 'point', range: 0, radius: 0 }, name: '' }); return; }
    if (code === 'KeyS') { e.preventDefault(); setMode(null); order({ t: 'stop' }); return; }
    if (code === 'KeyH') { e.preventDefault(); setMode(null); order({ t: 'hold' }); return; }
  }
  function onKeyUp(e) {
    if (ARROWS[e.code]) held.delete(e.code);
    if (e.code === 'Tab') { e.preventDefault(); call('setScoreboard', false); }
  }
  function onBlur() { held.clear(); call('setScoreboard', false); rightHeld = false; midDrag = null; }

  // ---- per-frame: pan, camera lock, hover, held right-click
  const clampW = (v) => Math.max(MAP_MIN, Math.min(MAP_MAX, v));
  let raf = 0, last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const rig = renderer.rig;
    const vh = (rig && rig.visibleHeight) || 1190;
    let vx = 0, vy = 0;
    for (const k of held) { vx += ARROWS[k][0]; vy += ARROWS[k][1]; }
    if (mouse.in && mouse.overCanvas && !midDrag) {
      const r = rect();
      if (mouse.x <= r.left + EDGE) vx -= 1; else if (mouse.x >= r.right - EDGE) vx += 1;
      if (mouse.y <= r.top + EDGE) vy += 1; else if (mouse.y >= r.bottom - EDGE) vy -= 1;
    }
    if (vx || vy) {
      const n = Math.hypot(vx, vy) || 1; const t = renderer.getTarget();
      renderer.setTarget(clampW(t.x + (vx / n) * vh * PAN_SPEED * dt), clampW(t.y + (vy / n) * vh * PAN_SPEED * dt));
      camLock = false;
    } else if (camLock) {
      const u = hero(); if (u) renderer.setTarget(u.x, u.y);
    }
    // hover + aim
    if (pickDirty && mouse.in) {
      pickDirty = false;
      if (mouse.overCanvas) {
        const p = pick(mouse.x, mouse.y);
        const id = p.unitId || null;
        if (id !== hoverId) { hoverId = id; renderer.setHover && renderer.setHover(id); }
        if (mode) call('setAim', p.x, p.y);
        if (rightHeld && !mode && !id && now - lastMoveAt > MOVE_REPEAT_MS) { lastMoveAt = now; order(orderMove(Math.round(p.x), Math.round(p.y), false)); }
      } else if (hoverId) { hoverId = null; renderer.setHover && renderer.setHover(null); }
      setCursor();
    } else if (rightHeld && !mode && mouse.in && mouse.overCanvas && now - lastMoveAt > MOVE_REPEAT_MS) {
      const p = pick(mouse.x, mouse.y);
      if (!p.unitId) { lastMoveAt = now; order(orderMove(Math.round(p.x), Math.round(p.y), false)); }
    }
  }
  raf = requestAnimationFrame(frame);

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('contextmenu', noCtx);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  addEventListener('mouseup', onMouseUp);
  addEventListener('mousemove', onMouseMove);
  document.documentElement.addEventListener('mouseleave', onLeave);
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', onBlur);

  return {
    setQuickCast(v) { quickCast = !!v; },
    get quickCast() { return quickCast; },
    get camLock() { return camLock; },
    get mode() { return mode; },
    cancel,
    activate, learn,
    destroy() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('contextmenu', noCtx);
      canvas.removeEventListener('wheel', onWheel);
      removeEventListener('mouseup', onMouseUp);
      removeEventListener('mousemove', onMouseMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      removeEventListener('keydown', onKeyDown);
      removeEventListener('keyup', onKeyUp);
      removeEventListener('blur', onBlur);
      canvas.style.cursor = '';
      call('setTargeting', null);
    },
  };
}

