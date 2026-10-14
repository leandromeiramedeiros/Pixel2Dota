// Frame scheduler for the game loop: fps cap + vsync option.
//   createLoop({ frame(now, dtMs), fps, vsync, env? }) -> { start, stop, setFps, setVsync, destroy }
//   frame(now, dtMs) runs once per rendered frame; dtMs = real time since the previous rendered frame (skipped frames included).
// VSync ON  : requestAnimationFrame (display-synced). Frames beyond the cap are skipped by the accumulator (render/quality.js createFrameCap),
//             so 60 on a 60 Hz display renders every callback and 30 renders every second one.
// VSync OFF : "not waiting for rAF", NOT tearing - browsers always composite on the display's vsync, so extra frames are simply never shown.
//             What it buys is lower input latency (a frame is drawn right before it is needed instead of when rAF fires) and a cap that can exceed
//             the display rate (120 on a 60 Hz screen). Paced by setTimeout (coarse wait) + MessageChannel (final sub-ms spin, no 4 ms timer clamp).
// Hidden tab: rAF pauses by itself; the timer/channel scheduler would not, so it is stopped on visibilitychange and restarted when visible.
import { createFrameCap } from './render/quality.js';

export function createLoop({ frame, fps = 60, vsync = true, env = globalThis } = {}) {
  const now = () => env.performance.now();
  const cap = createFrameCap(fps);
  let running = false, sync = vsync, target = fps, raf = 0, timer = 0, port = null, channel = null, due = 0, last = -1, gen = 0;

  const doc = env.document;
  const hidden = () => !!(doc && doc.hidden);

  function render(t, dt) { try { frame(t, dt); } catch (e) { console.error('[loop] frame error:', e); } }

  // ---- vsync on ----
  function onRaf(t) {
    if (!running || !sync) return;
    raf = env.requestAnimationFrame(onRaf);
    const dt = cap.tick(t);
    if (dt > 0) render(t, dt);
  }

  // ---- vsync off ----
  function onChannel(e) {
    if (!running || sync || hidden() || (e && e.data !== gen)) return;   // stale message from before a restart: dropped, or two chains would run
    const t = now();
    if (t < due - 0.3) { wait(due - t); return; }
    const dt = last < 0 ? 1000 / target : t - last; last = t;
    due = Math.max(due + 1000 / target, t + 1000 / target * 0.5);   // keep the cadence, but never queue up a burst after a stall
    render(t, dt);
    if (running && !sync) wait(due - now());
  }
  function wait(ms) {
    if (ms > 6) timer = env.setTimeout(() => { timer = 0; onChannel(); }, ms - 5);
    else port.postMessage(gen);
  }

  function arm() {
    cancel();
    if (!running || hidden()) return;
    last = -1; cap.reset();
    if (sync) raf = env.requestAnimationFrame(onRaf);
    else {
      if (!channel) { channel = new env.MessageChannel(); port = channel.port2; channel.port1.onmessage = onChannel; }
      due = now(); port.postMessage(gen);
    }
  }
  function cancel() {
    gen++;
    if (raf) { env.cancelAnimationFrame(raf); raf = 0; }
    if (timer) { env.clearTimeout(timer); timer = 0; }
    // a message already in flight is harmless: onChannel re-checks running / sync / hidden
  }
  const onVis = () => { if (running) arm(); };
  if (doc) doc.addEventListener('visibilitychange', onVis);

  return {
    start() { if (running) return; running = true; arm(); },
    stop() { running = false; cancel(); },
    setFps(f) { target = f; cap.setFps(f); },
    setVsync(v) { v = !!v; if (v === sync) return; sync = v; if (running) arm(); },
    get vsync() { return sync; },
    destroy() {
      running = false; cancel();
      if (doc) doc.removeEventListener('visibilitychange', onVis);
      if (channel) { channel.port1.onmessage = null; channel.port1.close(); channel = port = null; }
    },
  };
}

/** Display refresh rate in Hz from the median rAF interval over ~`frames` callbacks (0 if the tab never ticks within `timeoutMs`). */
export function measureRefreshHz({ frames = 40, timeoutMs = 3000, env = globalThis } = {}) {
  return new Promise((resolve) => {
    const ts = []; let done = false;
    const finish = () => {
      if (done) return; done = true;
      if (ts.length < 10) return resolve(0);
      const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
      d.sort((a, b) => a - b); const med = d[d.length >> 1];
      resolve(med > 0 ? Math.round(1000 / med) : 0);
    };
    const tick = (t) => { if (done) return; ts.push(t); if (ts.length >= frames) finish(); else env.requestAnimationFrame(tick); };
    env.requestAnimationFrame(tick);
    env.setTimeout(finish, timeoutMs);
  });
}
