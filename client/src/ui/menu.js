// In-match menu (Esc / touch ☰): Resume, graphics quality (Low/Medium/High), FPS+ping readout toggle, Quit to lobby.
//   createMenu(parent, { level, perfOn, onLevel(level), onPerf(on), onOpen() }) -> { el, open, close, toggle, isOpen, setLevel, toast(text), destroy }
// Open = full-screen backdrop that eats pointer input; a capture-phase keydown trap keeps the game's key handlers (orders, hotkeys) silent.
import { expandUnits } from './style.js';
import { LEVELS, LABEL } from '../render/quality.js';

const CSS = `
.h-menu { position:absolute; inset:0; z-index:60; display:none; align-items:center; justify-content:center; background:rgba(3,4,8,.7); pointer-events:auto; }
.h-menu.open { display:flex; }
.h-menu .mn { width:150u; padding:10u; display:flex; flex-direction:column; gap:6u; pointer-events:auto; }
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
.h-menu .tog { display:flex; justify-content:space-between; }
.h-menu .hint { font-size:6u; color:var(--dim); text-align:center; margin-top:2u; }
.h-toast { position:absolute; left:50%; top:46u; transform:translateX(-50%); z-index:55; max-width:80%; padding:5u 8u; font-size:8u; text-align:center; color:var(--txt); pointer-events:none;
  background:linear-gradient(#1a2030,#10141e); box-shadow:0 0 0 1u var(--ink), inset 0 0 0 1u var(--gold2); }
html.p2d-touch .h-menu { --u:max(1.6px, calc(2.1px * var(--k, 1))); }
html.p2d-touch .h-toast { --u:max(1.2px, calc(1.5px * var(--k, 1))); top:calc(60px * var(--k, 1)); }
html.p2d-touch .h-menu button { padding-top:8u; padding-bottom:7u; }
html.p2d-touch .h-menu .hint { display:none; }
`;
let styled = false;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export function createMenu(parent, { level = 'high', perfOn = true, onLevel, onPerf, onOpen } = {}) {
  if (!styled) { const s = document.createElement('style'); s.textContent = expandUnits(CSS); document.head.appendChild(s); styled = true; }
  const root = el('div', 'h-menu');
  const panel = el('div', 'mn h-panel');
  const resume = el('button', 'pri', 'RESUME');
  const seg = el('div', 'seg'); const segBtn = {};
  for (const l of LEVELS) { const b = el('button', null, LABEL[l].toUpperCase()); b.dataset.level = l; seg.append(b); segBtn[l] = b; }
  const perfBtn = el('button', 'tog'); const perfTxt = el('span', null, 'SHOW FPS / PING'), perfVal = el('span'); perfBtn.append(perfTxt, perfVal);
  const quit = el('button', 'quit', 'QUIT TO LOBBY');
  panel.append(el('h2', null, 'MENU'), resume, el('div', 'lbl', 'GRAPHICS'), seg, perfBtn, quit, el('div', 'hint', 'ESC to close'));
  root.append(panel); parent.append(root);

  let open = false, cur = level, perf = !!perfOn, toastEl = null, toastT = 0;
  const paint = () => {
    for (const l of LEVELS) segBtn[l].classList.toggle('on', l === cur);
    perfBtn.classList.toggle('on', perf); perfVal.textContent = perf ? 'ON' : 'OFF';
  };
  paint();

  // swallow the game's keys while open; Esc closes. keyup is left alone so a key held while opening can't stick.
  const trap = (e) => { if (e.key === 'Escape') { e.preventDefault(); api.close(); } e.stopPropagation(); };
  root.addEventListener('click', (e) => { if (e.target === root) api.close(); });   // backdrop click = resume
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  resume.addEventListener('click', () => api.close());
  seg.addEventListener('click', (e) => { const l = e.target.dataset && e.target.dataset.level; if (l) { cur = l; paint(); onLevel && onLevel(l); } });
  perfBtn.addEventListener('click', () => { perf = !perf; paint(); onPerf && onPerf(perf); });
  quit.addEventListener('click', () => { api.close(); dispatchEvent(new Event('p2d:return-lobby')); });

  const api = {
    el: root,
    isOpen: () => open,
    open() { if (open) return; open = true; root.classList.add('open'); addEventListener('keydown', trap, true); onOpen && onOpen(); resume.focus({ preventScroll: true }); },
    close() { if (!open) return; open = false; root.classList.remove('open'); removeEventListener('keydown', trap, true); document.activeElement && document.activeElement.blur && document.activeElement.blur(); },
    toggle() { open ? api.close() : api.open(); },
    setLevel(l) { cur = l; paint(); },
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
