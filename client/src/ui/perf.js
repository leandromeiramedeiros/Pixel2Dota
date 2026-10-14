// Tiny ping / FPS readout, top-right corner (under the touch buttons on touch). Ping = Colyseus room round trip every 2 s.
//   createPerf(parent, net) -> { frame(now), destroy() }
const CSS = `
.p2d-perf { position:absolute; right:calc(6px + env(safe-area-inset-right, 0px)); top:calc(2px + env(safe-area-inset-top, 0px)); z-index:20;
  pointer-events:none; font:10px/1 'Silkscreen','Courier New',monospace; color:#8e99b3; text-shadow:0 1px 0 #000, 0 0 2px #000; white-space:nowrap; }
.p2d-perf b { font-weight:normal; color:#9be08a; }
.p2d-perf b.mid { color:#e8c36a; }
.p2d-perf b.bad { color:#ff6b5b; }
html.p2d-touch .p2d-perf { top:calc(8px + 46px * var(--k, 1) + env(safe-area-inset-top, 0px)); right:calc(8px + env(safe-area-inset-right, 0px)); font-size:11px; }
`;
let styled = false;

export function createPerf(parent, net) {
  if (!styled) { const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); styled = true; }
  const el = document.createElement('div');
  el.className = 'p2d-perf';
  parent.appendChild(el);
  let frames = 0, since = performance.now(), fps = 0, ping = -1;
  const grade = (v, ok, mid) => (v <= ok ? '' : v <= mid ? 'mid' : 'bad');
  const draw = () => {
    el.innerHTML = `PING <b class="${ping < 0 ? '' : grade(ping, 80, 160)}">${ping < 0 ? '--' : ping}</b> &nbsp;FPS <b class="${grade(-fps, -50, -30)}">${fps}</b>`;
  };
  const measure = () => { try { net.room?.ping?.((ms) => { ping = Math.round(ms); draw(); }); } catch { /* not connected */ } };
  measure();
  const timer = setInterval(measure, 2000);
  draw();
  return {
    frame(now) {
      frames++;
      if (now - since >= 500) { fps = Math.round(frames * 1000 / (now - since)); frames = 0; since = now; draw(); }
    },
    destroy() { clearInterval(timer); el.remove(); },
  };
}
