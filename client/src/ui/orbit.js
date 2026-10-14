// Showcase orbit controls (camera yaw / pitch / zoom while zoomed in past the normal close camera, docs/ARCHITECTURE.md "Camera").
//   Desktop (input.js): middle-drag, Alt + left-drag, or left-drag on empty ground rotate; wheel zooms; edge pan is off.
//   Touch (createOrbitTouch, attaches itself): one-finger drag on the world rotates, two-finger pinch zooms (pinching out past closeDistance leaves
//   the showcase and the camera eases back north). Joystick zone and HUD elements are never intercepted; a tap is handed to touch.js unchanged.
export const ORBIT = {
  yawPerPx: 0.0065,     // rad per px of horizontal drag (a full screen width ~ 1.5 turns on a phone)
  pitchPerPx: 0.22,     // deg per px of vertical drag
  slop: 6,              // px before a press becomes a drag
  tapMs: 300,           // a press shorter than this that never moved is a tap
  joyZone: 0.4,         // left fraction of the canvas = touch.js joystick zone (ui/touch.js T.ZONE): not intercepted
};

/** Drag delta in px -> camera change. Drag right = the world turns right (camera orbits west, yaw down); drag down = camera rises (pitch up). */
export function dragToOrbit(dx, dy, k = ORBIT) { return { dYaw: -dx * k.yawPerPx, dPitch: dy * k.pitchPerPx }; }

/** Pinch: finger distance went prev -> cur; the zoomBy factor (< 1 = closer when the fingers spread). */
export const pinchZoomFactor = (prev, cur) => (prev > 0 && cur > 0 ? prev / cur : 1);

/** True when a touch at (x, y) inside `rect` is in the left joystick zone (touch.js owns it). */
export const inJoyZone = (x, rect, k = ORBIT) => x < rect.left + rect.width * k.joyZone;

export function createOrbitTouch({ canvas, renderer, opts = ORBIT }) {
  const ptrs = new Map();       // pointerId -> { id, x0, y0, x, y, t0, moved }
  let pinch = null;             // { a, b, last }
  let replaying = false;
  const showcase = () => !!(renderer.isShowcase && renderer.isShowcase());
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function down(e) {
    if (replaying || e.pointerType === 'mouse' || e.target !== canvas || !showcase()) return;
    if (inJoyZone(e.clientX, canvas.getBoundingClientRect(), opts)) return;
    e.stopPropagation(); e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    ptrs.set(e.pointerId, { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: now(), moved: false });
    if (ptrs.size >= 2) { const [a, b] = [...ptrs.values()]; a.moved = b.moved = true; pinch = { a, b, last: dist(a, b) }; }
  }
  function move(e) {
    const p = ptrs.get(e.pointerId); if (!p) return;
    e.stopPropagation(); e.preventDefault();
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pinch) {
      const d = dist(pinch.a, pinch.b);
      if (renderer.zoomBy) renderer.zoomBy(pinchZoomFactor(pinch.last, d));
      pinch.last = d;
      return;
    }
    if (!p.moved) {
      if (Math.hypot(p.x - p.x0, p.y - p.y0) <= opts.slop) return;
      p.moved = true; dragApply(p.x - p.x0, p.y - p.y0); return;   // first move past the slop applies the whole drag so far
    }
    dragApply(dx, dy);
  }
  function dragApply(dx, dy) {
    const o = dragToOrbit(dx, dy, opts);
    if (renderer.orbit) renderer.orbit(o.dYaw, o.dPitch);
  }
  function up(e) {
    const p = ptrs.get(e.pointerId); if (!p) return;
    e.stopPropagation();
    ptrs.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* */ }
    if (pinch) { pinch = null; for (const q of ptrs.values()) q.moved = true; return; }   // the remaining finger keeps rotating (never a tap)
    if (e.type === 'pointercancel' || p.moved || now() - p.t0 > opts.tapMs) return;
    // a tap: hand it to touch.js (select / attack target) as a fresh press + release at the same spot
    replaying = true;
    try {
      const init = { pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: true, clientX: e.clientX, clientY: e.clientY, button: 0, bubbles: true, cancelable: true };
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
    } catch { /* no PointerEvent (tests) */ }
    replaying = false;
  }

  const subs = [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up]];
  for (const [t, fn] of subs) window.addEventListener(t, fn, { capture: true, passive: false });
  return {
    get active() { return ptrs.size > 0; },
    destroy() { for (const [t, fn] of subs) window.removeEventListener(t, fn, { capture: true }); ptrs.clear(); pinch = null; },
  };
}
