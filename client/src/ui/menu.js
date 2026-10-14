// In-match menu (Esc / touch ☰): Resume, graphics preset (Low/Medium/High), the user options (resolution, fps cap, bloom, vsync; the preset never touches them),
// DEFAULTS (restore the detected preset + options), FPS+ping readout toggle, Quit to lobby. Side-by-side columns on short screens (phone landscape).
//   createMenu(parent, { level, options, perfOn, onLevel(level), onOption(key, value), onDefaults(), onPerf(on), onOpen() })
//     -> { el, open, close, toggle, isOpen, setLevel, setOptions(opts), setDetected(text), toast(text), destroy }
// Open = full-screen backdrop that eats pointer input; a capture-phase keydown trap keeps the game's key handlers (orders, hotkeys) silent.
import { expandUnits } from './style.js';
import { LEVELS, LABEL, RESOLUTIONS, RES_LABEL, FPS_CAPS, OPTION_DEFAULTS } from '../render/quality.js';

const CSS = `
.h-menu { position:absolute; inset:0; z-index:60; display:none; align-items:center; justify-content:center; background:rgba(3,4,8,.7); pointer-events:auto; }
.h-menu.open { display:flex; }
.h-menu .mn { width:300u; max-width:98%; box-sizing:border-box; max-height:96%; overflow-y:auto; padding:10u; display:flex; flex-direction:column; gap:6u; pointer-events:auto; }
.h-menu .col { display:flex; flex-direction:column; gap:6u; min-width:0; flex:1; }
.h-menu .cols { display:flex; gap:8u; }
.h-menu h2 { margin:0 0 2u; font-size:12u; letter-spacing:1u; color:var(--gold); text-align:center; font-weight:700; text-shadow:2u 2u 0 #000; }
.h-menu .lbl { font-size:7u; color:var(--dim); margin-top:2u; }
.h-menu button { font:inherit; font-size:9u; color:var(--txt); border:0; margin:0; padding:5u 6u 4u; cursor:pointer; background:linear-gradient(#2a3350,#1a2036); box-shadow:0 0 0 1u var(--ink), inset 0 0 0 1u var(--gold2); touch-action:manipulation; }
.h-menu button:hover { background:linear-gradient(#3a4670,#242c4a); }
.h-menu button:focus-visible { outline:1u solid var(--gold); outline-offset:1u; }
.h-menu button.pri { color:#fff; background:linear-gradient(#34406a,#1d2540); box-shadow:0 0 0 1u var(--ink), inset 0 0 0 1u var(--gold); }
.h-menu button.quit:hover { background:linear-gradient(#6a2f2a,#40201c); }
.h-menu .seg { display:flex; gap:2u; }
.h-menu .seg button { flex:1; padding-left:2u; padding-right:2u; }
.h-menu .seg button.on, .h-menu .tog.on { color:#05070b; background:linear-gradient(#e8bf55,#b88a28); box-shadow:0 0 0 1u var(--ink), inset 0 0 0 1u #f4d77c; }
.h-menu .tog { display:flex; justify-content:space-between; align-items:center; }
.h-menu .tog .bx { width:9u; height:9u; margin-left:4u; background:#0a0d14; box-shadow:0 0 0 1u var(--ink), inset 0 0 0 1u var(--gold2); position:relative; flex:none; }
.h-menu .tog.on .bx { background:#05070b; box-shadow:0 0 0 1u #05070b, inset 0 0 0 1u #05070b; }
.h-menu .tog.on .bx::after { content:''; position:absolute; left:2u; top:2u; right:2u; bottom:2u; background:#f4d77c; }
.h-menu .dtc { font-size:6u; color:var(--dim); text-align:center; margin-top:-3u; }
@media (max-height:520px) { .h-menu .mn { padding:7u 10u; gap:4u; } .h-menu .col { gap:4u; } .h-menu h2 { margin:0; } }
@media (max-width:640px) and (orientation:portrait) { .h-menu .mn { width:150u; } .h-menu .cols { flex-direction:column; } }
.h-menu .hint { font-size:6u; color:var(--dim); text-align:center; margin-top:2u; }
.h-toast { position:absolute; left:50%; top:46u; transform:translateX(-50%); z-index:55; max-width:80%; padding:5u 8u; font-size:8u; text-align:center; color:var(--txt); pointer-events:none;
  background:linear-gradient(#1a2030,#10141e); box-shadow:0 0 0 1u var(--ink), inset 0 0 0 1u var(--gold2); }
html.p2d-touch .h-menu { --u:max(1.6px, calc(2.1px * var(--k, 1))); }
html.p2d-touch .h-toast { --u:max(1.2px, calc(1.5px * var(--k, 1))); top:calc(60px * var(--k, 1)); }
html.p2d-touch .h-menu button { padding-top:8u; padding-bottom:7u; }
html.p2d-touch .h-menu .dtc { display:none; }
@media (max-height:520px) { html.p2d-touch .h-menu .mn { padding:5u 8u; } html.p2d-touch .h-menu button { padding-top:6u; padding-bottom:5u; } }
html.p2d-touch .h-menu .hint { display:none; }
`;
let styled = false;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export function createMenu(parent, { level = 'high', options = OPTION_DEFAULTS, perfOn = true, onLevel, onOption, onDefaults, onPerf, onOpen } = {}) {
  if (!styled) { const s = document.createElement('style'); s.textContent = expandUnits(CSS); document.head.appendChild(s); styled = true; }
  const root = el('div', 'h-menu');
  const panel = el('div', 'mn h-panel');
  const resume = el('button', 'pri', 'RESUME');
  const mkSeg = (attr, items, labelOf) => {
    const box = el('div', 'seg'), btn = {};
    for (const v of items) { const b = el('button', null, labelOf(v)); b.dataset[attr] = String(v); box.append(b); btn[v] = b; }
    return { box, btn };
  };
  const gfx = mkSeg('level', LEVELS, (l) => LABEL[l].toUpperCase()), seg = gfx.box, segBtn = gfx.btn;
  const resS = mkSeg('res', RESOLUTIONS, (r) => RES_LABEL[r]), fpsS = mkSeg('fps', FPS_CAPS, (f) => String(f));
  const mkTog = (text, chk) => { const b = el('button', 'tog'), t = el('span', null, text), v = chk ? el('span', 'bx') : el('span'); b.append(t, v); return { b, v }; };
  const bloomT = mkTog('BLOOM'), vsyncT = mkTog('VSYNC', true);
  bloomT.b.title = 'Glow around bright lights and spells'; vsyncT.b.title = 'On: draw in step with the display. Off: draw as soon as the fps cap allows (lower input delay, higher cap than the display)';
  const defBtn = el('button', null, 'DEFAULTS'), dtc = el('div', 'dtc');
  const perfBtn = el('button', 'tog'); const perfTxt = el('span', null, 'SHOW FPS / PING'), perfVal = el('span'); perfBtn.append(perfTxt, perfVal);
  const quit = el('button', 'quit', 'QUIT TO LOBBY');
  const colA = el('div', 'col'), colB = el('div', 'col'), cols = el('div', 'cols');
  colA.append(resume, el('div', 'lbl', 'GRAPHICS'), seg, el('div', 'lbl', 'RESOLUTION'), resS.box, el('div', 'lbl', 'FPS CAP'), fpsS.box);
  colB.append(el('div', 'lbl', 'OPTIONS'), bloomT.b, vsyncT.b, perfBtn, defBtn, dtc, quit);
  cols.append(colA, colB);
  panel.append(el('h2', null, 'MENU'), cols, el('div', 'hint', 'ESC to close'));
  root.append(panel); parent.append(root);

  let open = false, cur = level, opt = { ...OPTION_DEFAULTS, ...options }, perf = !!perfOn, toastEl = null, toastT = 0;
  const paint = () => {
    for (const l of LEVELS) segBtn[l].classList.toggle('on', l === cur);
    for (const r of RESOLUTIONS) resS.btn[r].classList.toggle('on', r === opt.resolution);
    for (const f of FPS_CAPS) fpsS.btn[f].classList.toggle('on', f === opt.fps);
    bloomT.b.classList.toggle('on', !!opt.bloom); bloomT.v.textContent = opt.bloom ? 'ON' : 'OFF';
    vsyncT.b.classList.toggle('on', !!opt.vsync);
    perfBtn.classList.toggle('on', perf); perfVal.textContent = perf ? 'ON' : 'OFF';
  };
  paint();

  // swallow the game's keys while open; Esc closes. keyup is left alone so a key held while opening can't stick.
  const trap = (e) => { if (e.key === 'Escape') { e.preventDefault(); api.close(); } e.stopPropagation(); };
  root.addEventListener('click', (e) => { if (e.target === root) api.close(); });   // backdrop click = resume
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  resume.addEventListener('click', () => api.close());
  seg.addEventListener('click', (e) => { const l = e.target.dataset && e.target.dataset.level; if (l) { cur = l; paint(); onLevel && onLevel(l); } });
  const setOpt = (k, v) => { opt = { ...opt, [k]: v }; paint(); onOption && onOption(k, v); };
  resS.box.addEventListener('click', (e) => { const r = e.target.dataset && e.target.dataset.res; if (r) setOpt('resolution', r); });
  fpsS.box.addEventListener('click', (e) => { const f = e.target.dataset && +e.target.dataset.fps; if (f) setOpt('fps', f); });
  bloomT.b.addEventListener('click', () => setOpt('bloom', !opt.bloom));
  vsyncT.b.addEventListener('click', () => setOpt('vsync', !opt.vsync));
  defBtn.addEventListener('click', () => { onDefaults && onDefaults(); });
  perfBtn.addEventListener('click', () => { perf = !perf; paint(); onPerf && onPerf(perf); });
  quit.addEventListener('click', () => { api.close(); dispatchEvent(new Event('p2d:return-lobby')); });

  const api = {
    el: root,
    isOpen: () => open,
    open() { if (open) return; open = true; root.classList.add('open'); addEventListener('keydown', trap, true); onOpen && onOpen(); resume.focus({ preventScroll: true }); },
    close() { if (!open) return; open = false; root.classList.remove('open'); removeEventListener('keydown', trap, true); document.activeElement && document.activeElement.blur && document.activeElement.blur(); },
    toggle() { open ? api.close() : api.open(); },
    setLevel(l) { cur = l; paint(); },
    /** reflect option values changed from outside (DEFAULTS, hardware detection) */
    setOptions(o) { opt = { ...opt, ...o }; paint(); },
    /** one line under DEFAULTS: what detection chose */
    setDetected(text) { dtc.textContent = text || ''; },
    /** one short message under the top bar (graphics auto-downgrade notice) */
    toast(text, ms = 7000) {
      toastEl && toastEl.remove(); clearTimeout(toastT);
      toastEl = el('div', 'h-toast', text); parent.append(toastEl);
      toastT = setTimeout(() => { toastEl && toastEl.remove(); toastEl = null; }, ms);
    },
    destroy() { api.close(); clearTimeout(toastT); toastEl && toastEl.remove(); root.remove(); },
  };
  return api;
}
