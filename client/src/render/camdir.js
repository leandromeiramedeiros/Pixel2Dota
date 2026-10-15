// Camera director: the one owner of where the camera looks (docs/ARCHITECTURE.md "Camera"). Pure: no THREE, no DOM; the rig only renders it.
// Writers send intents; once per frame update() returns { x, y, snap } for rig.place(x, y, snap) (no rig lerp: this module's motion law is the
// only smoothing). snap = a cut: also snap the ground height under the target; it never touches zoom / yaw / pitch.
//   Modes (getter `mode`): follow | free (base, user-chosen) | peek (touch look-around overlay, base keeps running underneath) | orbit (showcase:
//   rig.orbit owns yaw/pitch, camdir keeps the hero centred; pan / peek / jumpTo ignored there).
//   Two motion laws. Player-driven moves (pan, jumpTo, centre, edge / arrow / middle-drag pan, peek drag) are INSTANT. Automatic moves (follow,
//   peek spring-back, aim lookahead, return to follow) use a critically damped spring (exact closed form = frame-rate independent, velocity state).
//   Follow: anchor = hero + lead + aim shift + lag compensation. A spring tracking a target at speed v lags v * smoothTime behind; the anchor adds
//   exactly that, so at steady speed the camera sits `lead` ahead of the hero instead of trailing. lead = v * leadTau (+ touch joystick moveDir),
//   capped at leadCap * visibleH; aiming shifts aimFrac of hero->aim (capped at aimCap * visibleH) so long casts stay on screen.
//   Cut rule (one rule): following and |anchor - camera| > cutVH * visibleH -> jump (snap). Covers TP, long blink, respawn, return from far, orbit entry.
//   Never moves on events the player did not cause: no zoom, nothing on kills; follow pauses while the hero is dead and cuts to it on respawn.
//   User pan / jumpTo in follow drops to free (Dota). suspend(on): temporary free (touch minimap press, aim edge pan) that returns to follow on release.
//   holdFollow (desktop hold Space): centre + follow while held, pans ignored; release -> previous mode, camera stays where it is.
// Helpers: smoothDamp / smoothDamp2, edgeRamp / edgeHold (edge-pan acceleration), classifyPress (touch one-finger world press), dragToWorld.
// Tunables: CAMERA_FEEL (one object, tunable from sandbox.js).

export const CAMERA_FEEL = {
  followSmooth: 0.12,     // s, spring smooth time while tracking the hero
  returnSmooth: 0.28,     // s, glide back to the hero (free -> follow, suspend end); switches to followSmooth once within settleVH
  settleVH: 0.03,         // x visibleH: "arrived" for the return glide
  orbitSmooth: 0.08,      // s, showcase: hero centred, tight
  offsetSmooth: 0.30,     // s, the lead + aim offset glides (turns / stops / mouse jitter never jerk the camera)
  peekSmooth: 0.22,       // s, peek offset spring-back on release
  leadTau: 0.25,          // s of hero velocity the camera looks ahead
  leadCap: 0.12,          // x visibleH, max lead (velocity + joystick)
  joyLead: 0.08,          // x visibleH at full joystick deflection (touch: anticipates the server round trip)
  aimFrac: 0.35,          // fraction of hero -> aim point the camera shifts while aiming
  aimCap: 0.18,           // x visibleH, max aim shift
  cutVH: 1.0,             // x visibleH: follow error beyond this cuts instead of springing
  jumpVH: 0.25,           // x visibleH: a hero step this big in one frame is a discontinuity (blink): skipped by the velocity estimate
  maxSpeed: 1500,         // u/s clamp on the ESTIMATED hero velocity (a given vx/vy is trusted)
  velSmooth: 0.08,        // s, low-pass on the estimated velocity
  edgeRampMs: 150,        // edge / arrow pan ramps to full speed over this
  edgeFloor: 0.25,        // speed fraction at the first frame (a quick nudge still moves)
  peekMax: 1.5,           // x visibleH, max peek offset
  peekDragPx: 16,         // CSS px (caller scales like T.TAP_MOVE * K): a press dragged this far ...
  intentMs: 220,          // ... within this is a peek; still this long is a hold (= touch T.TAP_MS, hold-walk timing unchanged)
};

const hyp = Math.hypot;
const clampLen = (x, y, m) => { const l = hyp(x, y); return l > m && l > 0 ? [x * m / l, y * m / l] : [x, y]; };

/** Critically damped spring, exact closed form. Returns [value, velocity]. `target` = where the target is at the END of the step; targetVel =
 *  its velocity over the step (0 = fixed). Exact for a fixed or constant-velocity target, so the result does not depend on the frame rate.
 *  A target moving at v is trailed by v * smoothTime at steady state (callers that must not trail add that to the target). */
export function smoothDamp(cur, target, vel, smoothTime, dt, targetVel = 0) {
  if (!(dt > 0)) return [cur, vel];
  if (!(smoothTime > 1e-6)) return [target, targetVel];
  // y = x - r(t) + targetVel / w * 2 obeys the homogeneous critically damped ODE (r = target path over the step)
  const w = 2 / smoothTime, e = Math.exp(-w * dt), sh = 2 * targetVel / w;
  const c = cur - (target - targetVel * dt) + sh, v0 = vel - targetVel, t = (v0 + w * c) * dt;
  return [target - sh + (c + t) * e, targetVel + (v0 - w * t) * e];
}
/** 2D smoothDamp on {x, y} with velocity {x, y}, both mutated in place; tv = target velocity {x, y} (optional). */
export function smoothDamp2(p, target, v, smoothTime, dt, tv = null) {
  const a = smoothDamp(p.x, target.x, v.x, smoothTime, dt, tv ? tv.x : 0), b = smoothDamp(p.y, target.y, v.y, smoothTime, dt, tv ? tv.y : 0);
  p.x = a[0]; v.x = a[1]; p.y = b[0]; v.y = b[1];
  return p;
}

/** Edge / arrow pan speed factor 0..1 after the pan has been held heldMs: edgeFloor at once, eased up to 1 over edgeRampMs. */
export function edgeRamp(heldMs, cfg = CAMERA_FEEL) {
  const t = cfg.edgeRampMs > 0 ? Math.min(1, Math.max(0, heldMs) / cfg.edgeRampMs) : 1;
  return cfg.edgeFloor + (1 - cfg.edgeFloor) * t * (2 - t);
}
/** Hold accumulator for edgeRamp: ms the pan has been active (0 once it stops). */
export const edgeHold = (prevMs, active, dtMs) => (active ? prevMs + dtMs : 0);

/** Touch one-finger world press. maxDistPx = furthest the finger got from its press point (scaled px), heldMs = since press, prev = the last
 *  result (sticky once not 'pending'). -> 'pending' | 'tap' (move order) | 'hold' (hold-to-walk, existing) | 'peek' (look-around) | 'orbit'. */
export function classifyPress(maxDistPx, heldMs, released, prev = 'pending', showcase = false, cfg = CAMERA_FEEL) {
  if (prev && prev !== 'pending') return prev;
  if (showcase) return 'orbit';
  if (maxDistPx > cfg.peekDragPx) return heldMs <= cfg.intentMs ? 'peek' : 'hold';
  if (heldMs >= cfg.intentMs) return 'hold';
  return released ? 'tap' : 'pending';
}

/** Grab-drag in screen px -> camera move in world units (the world follows the finger / cursor: drag right = camera west).
 *  Screen y covers visH / 0.866 of ground at the default pitch (same factor input.js / touch.js use today). */
export function dragToWorld(dxPx, dyPx, rectW, rectH, visW, visH) {
  return { x: -dxPx * (visW / rectW), y: dyPx * (visH / rectH) / 0.866 };
}

/** One camera director. opts: { feel: partial CAMERA_FEEL overrides, bounds: [min, max] world clamp for the output, follow: start in follow (true) }. */
export function createCamDir(opts = {}) {
  const F = { ...CAMERA_FEEL, ...(opts.feel || {}) };
  const bounds = opts.bounds || null;
  const clampW = (v) => (bounds ? Math.max(bounds[0], Math.min(bounds[1], v)) : v);
  const cam = { x: 0, y: 0 }, camV = { x: 0, y: 0 };           // base camera (before peek)
  const off = { x: 0, y: 0 }, offV = { x: 0, y: 0 };           // smoothed lead + aim offset
  const peek = { x: 0, y: 0 }, peekV = { x: 0, y: 0 };
  const vel = { x: 0, y: 0 }, velV = { x: 0, y: 0 };           // estimated hero velocity (when the caller gives none)
  let base = opts.follow === false ? 'free' : 'follow';
  let peeking = false, holding = false, holdPrev = 'free', suspended = false, orbit = false;
  let returning = false, cutNext = true, wasAlive = true, lastHero = null, aim = null, visH = 1190;
  let hero = null;                                              // last hero seen by update (centre / holdFollow use it)
  let jumped = 0;                                               // largest instant move since the last update (decides snap)
  let pendingCentre = false;                                    // centre() before any hero was seen: done on first sight

  const userMove = (nx, ny) => {
    jumped = Math.max(jumped, hyp(nx - cam.x, ny - cam.y));
    cam.x = clampW(nx); cam.y = clampW(ny); camV.x = camV.y = 0;
  };
  const dropToFree = () => { if (base === 'follow' && !suspended) { base = 'free'; returning = false; } };
  const resetOffsets = () => { off.x = off.y = offV.x = offV.y = 0; };

  const d = {
    get mode() { return orbit ? 'orbit' : peeking ? 'peek' : holding ? 'follow' : base; },
    /** Lock state for UI (lock button, input.js camLock): base follow or held. */
    get following() { return holding || base === 'follow'; },
    get suspended() { return suspended; },
    get holding() { return holding; },
    get peekOffset() { return { x: peek.x, y: peek.y }; },
    get position() { return { x: cam.x + peek.x, y: cam.y + peek.y }; },

    /** Instant user pan by world units. Drops follow to free (unless suspended / held). Ignored in orbit and while hold-follow is held. */
    pan(dx, dy) {
      if (orbit || holding || !(dx || dy)) return;
      dropToFree(); userMove(cam.x + dx, cam.y + dy);
    },
    /** Instant jump (minimap click / drag, portrait, spectator POV). Drops follow to free unless suspended. Ignored in orbit / hold. */
    jumpTo(x, y) {
      if (orbit || holding) return;
      dropToFree(); userMove(x, y);
    },
    /** One-shot instant centre on the hero (F1 / portrait of own hero). Mode unchanged. */
    centre() {
      if (!hero) { pendingCentre = true; return; }
      resetOffsets(); peek.x = peek.y = peekV.x = peekV.y = 0;
      userMove(hero.x, hero.y);
      if (base === 'follow') returning = false;
    },
    /** Lock toggle. On: glide back to the hero (or cut if far). */
    setFollow(on) {
      on = !!on;
      if (holding) { holdPrev = on ? 'follow' : 'free'; return; }   // toggled while Space is held: applies on release
      if (on && base !== 'follow') { base = 'follow'; returning = true; resetOffsets(); }
      else if (!on && base === 'follow') { base = 'free'; returning = false; }
    },
    toggleFollow() { const cur = holding ? holdPrev : base; d.setFollow(cur !== 'follow'); return (holding ? holdPrev : base) === 'follow'; },
    /** Desktop hold Space: on = centre now and follow while held; off = previous mode, camera stays put. Release on blur. */
    holdFollow(on) {
      on = !!on;
      if (on === holding) return;
      if (on) { holdPrev = base; holding = true; d.centre(); }
      else { holding = false; base = holdPrev; if (base === 'follow') returning = false; else camV.x = camV.y = 0; }
    },
    /** Temporary free (touch: minimap pressed, aim edge pan). While on, follow pauses and pans don't drop to free; off -> back to follow. */
    suspend(on) {
      on = !!on;
      if (on === suspended) return;
      suspended = on;
      if (!on && base === 'follow') { returning = true; camV.x = camV.y = 0; }
    },
    /** Touch look-around: the offset follows the finger instantly (world units), springs back on peekEnd. Base mode keeps running. */
    peekStart() { if (!orbit) { peeking = true; peekV.x = peekV.y = 0; } },
    peekMove(dx, dy) {
      if (!peeking || orbit) return;
      const m = F.peekMax * visH, p = clampLen(peek.x + dx, peek.y + dy, m);
      peek.x = p[0]; peek.y = p[1]; peekV.x = peekV.y = 0;
    },
    peekEnd() { peeking = false; },
    /** Aim lookahead target (world point) or null. */
    aimAt(x, y) { aim = x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y) ? null : { x, y }; },

    /** Per frame. ctx: { hero: {x, y, vx?, vy?, alive}|null (the INTERPOLATED hero), moveDir: {x, y}|null (joystick, |.| <= 1), visibleH, showcase }.
     *  -> { x, y, snap }. */
    update(dt, ctx = {}) {
      dt = dt > 0 ? Math.min(dt, 0.25) : 0;
      if (ctx.visibleH > 0) visH = ctx.visibleH;
      const h = ctx.hero && Number.isFinite(ctx.hero.x) && Number.isFinite(ctx.hero.y) ? ctx.hero : null;
      hero = h;
      if (pendingCentre && h) { pendingCentre = false; d.centre(); }
      let snap = jumped > F.cutVH * visH;
      jumped = 0;

      // orbit transitions (showcase): peek dropped, base restored on leave, camera stays
      const nowOrbit = !!ctx.showcase && !!h;
      if (nowOrbit && !orbit) { peeking = false; peek.x = peek.y = peekV.x = peekV.y = 0; resetOffsets(); }
      orbit = nowOrbit;

      const alive = !!h && h.alive !== false;
      const respawn = !!h && alive && !wasAlive;
      if (h) wasAlive = alive;
      // hero velocity: given, else estimated from interpolated positions (one-frame jumps = blink / TP, and respawns: skipped)
      let vx = 0, vy = 0;
      if (h) {
        if (Number.isFinite(h.vx) && Number.isFinite(h.vy)) { vx = h.vx; vy = h.vy; }
        else if (lastHero && dt > 0 && !respawn) {
          const sx = h.x - lastHero.x, sy = h.y - lastHero.y;
          if (hyp(sx, sy) <= F.jumpVH * visH) smoothDamp2(vel, { x: sx / dt, y: sy / dt }, velV, F.velSmooth, dt);
          [vx, vy] = clampLen(vel.x, vel.y, F.maxSpeed);
        }
        lastHero = { x: h.x, y: h.y };
      } else lastHero = null;
      if (!alive) { vel.x = vel.y = velV.x = velV.y = 0; vx = vy = 0; }

      const tracking = orbit || ((base === 'follow' || holding) && !suspended);
      if (tracking && alive) {
        // offset target: lead (velocity + joystick, capped) + aim shift (capped); none in orbit
        let tx = 0, ty = 0;
        if (!orbit) {
          let lx = vx * F.leadTau, ly = vy * F.leadTau;
          const md = ctx.moveDir;
          if (md && Number.isFinite(md.x) && Number.isFinite(md.y)) { const m = clampLen(md.x, md.y, 1); lx += m[0] * F.joyLead * visH; ly += m[1] * F.joyLead * visH; }
          [lx, ly] = clampLen(lx, ly, F.leadCap * visH);
          let ax = 0, ay = 0;
          if (aim) [ax, ay] = clampLen((aim.x - h.x) * F.aimFrac, (aim.y - h.y) * F.aimFrac, F.aimCap * visH);
          tx = lx + ax; ty = ly + ay;
        }
        smoothDamp2(off, { x: tx, y: ty }, offV, F.offsetSmooth, dt);
        const st = orbit ? F.orbitSmooth : returning ? F.returnSmooth : F.followSmooth;
        const anchor = { x: clampW(h.x + off.x + vx * st), y: clampW(h.y + off.y + vy * st) };
        const err = hyp(anchor.x - cam.x, anchor.y - cam.y);
        if (cutNext || respawn || err > F.cutVH * visH) {
          off.x = tx; off.y = ty; offV.x = offV.y = 0;
          cam.x = clampW(h.x + tx); cam.y = clampW(h.y + ty); camV.x = vx; camV.y = vy;
          snap = true; returning = false;
        } else {
          smoothDamp2(cam, anchor, camV, st, dt, { x: vx, y: vy });
          if (returning && err < F.settleVH * visH) returning = false;
        }
        cutNext = false;
      } else {
        camV.x = camV.y = 0;                                   // free / suspended / dead: the camera only moves when the player moves it
        if (tracking && h && !alive) resetOffsets();
        if (h && !tracking) cutNext = false;                  // following with no hero yet: keep cutNext, cut on first sight
      }

      // peek: follows the finger while held, springs back after
      if (!peeking) smoothDamp2(peek, { x: 0, y: 0 }, peekV, F.peekSmooth, dt);
      if (orbit) peek.x = peek.y = 0;
      if (hyp(peek.x, peek.y) < 0.05 && !peeking) { peek.x = peek.y = peekV.x = peekV.y = 0; }

      return { x: clampW(cam.x + peek.x), y: clampW(cam.y + peek.y), snap };
    },
  };
  return d;
}
