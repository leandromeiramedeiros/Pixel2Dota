// Full-screen button (desktop + phones/tablets, lobby + match). Lives on <body> so it survives screen swaps.
//   Fullscreen API + Keyboard Lock (all keys): in Chrome/Edge full screen every key, incl. Ctrl/Alt/Shift combos, Ctrl+W
//   and Esc, reaches the game instead of the browser (hold Esc ~2 s to leave). Android also locks to landscape.
//   Sticky: the choice is remembered; after a reload the first tap/click anywhere goes back to full screen
//   (browsers only allow full screen from a user gesture). Leaving with the button turns it off.
//   iPhone: Safari has no page full screen, so the button explains Add to Home Screen (the manifest opens it full screen).
// During a match (any window mode) browser shortcuts are swallowed: Ctrl/Alt/Shift/Meta combos, F1-F11, Esc, Tab (not while typing
// in chat, and not F12). Ctrl+W/T/N can't be stopped outside full screen, so closing the tab asks "Leave site?" first.
const CSS = `
.p2d-fs { position:fixed; z-index:9000; top:calc(6px + env(safe-area-inset-top, 0px)); left:calc(6px + env(safe-area-inset-left, 0px));
  width:36px; height:36px; padding:0; border:2px solid #8a6b25; border-radius:6px; background:rgba(10,13,20,.82); color:#d4a73c;
  display:flex; align-items:center; justify-content:center; cursor:pointer; touch-action:manipulation; -webkit-tap-highlight-color:transparent; opacity:.85; }
.p2d-fs:hover { opacity:1; border-color:#d4a73c; }
.p2d-fs svg { width:20px; height:20px; }
.p2d-fs-tip { position:fixed; z-index:9001; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(5,7,11,.82); padding:20px; }
.p2d-fs-tip > div { max-width:340px; background:linear-gradient(#1a2030,#10141e); box-shadow:0 0 0 2px #05070b, inset 0 0 0 2px #8a6b25; padding:18px;
  color:#dfe4f0; font:13px/1.5 'Silkscreen','Courier New',monospace; text-align:center; }
.p2d-fs-tip b { color:#d4a73c; }
.p2d-fs-tip button { margin-top:12px; font:inherit; color:#05070b; background:#d4a73c; border:none; padding:8px 20px; cursor:pointer; }
`;
const ICON_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6"/></svg>';
const KEY = 'p2d.fullscreen';

const standalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const canFs = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const want = (v) => { try { if (v === undefined) return localStorage.getItem(KEY) === '1'; v ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch { /* storage off */ } return v; };

async function enter() {
  const el = document.documentElement;
  try { await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen()); } catch { return false; }
  try { await navigator.keyboard?.lock?.(); } catch { /* Chrome/Edge only */ }
  try { await screen.orientation?.lock?.('landscape'); } catch { /* phones/tablets only */ }
  return true;
}
function leave() {
  try { navigator.keyboard?.unlock?.(); } catch { /* ignore */ }
  try { (document.exitFullscreen || document.webkitExitFullscreen)?.call(document); } catch { /* ignore */ }
}

export function mountFullscreenButton() {
  if (standalone()) return;   // the home-screen app is already full screen
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const btn = document.createElement('button');
  btn.className = 'p2d-fs';
  document.body.appendChild(btn);
  document.documentElement.classList.add('p2d-fsbtn');
  const sync = () => {
    const on = !!fsEl();
    btn.innerHTML = on ? ICON_OFF : ICON_ON;
    btn.title = on ? 'Exit full screen' : 'Full screen';
    btn.setAttribute('aria-label', btn.title);
  };
  sync();
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (fsEl()) { want(false); leave(); return; }
    if (canFs()) { if (await enter()) want(true); return; }
    showTip();
  });

  // remembered: go back to full screen on the first gesture after a reload
  if (want() && canFs()) {
    const again = (e) => {
      if (e.target === btn) return;
      removeEventListener('pointerup', again, true); removeEventListener('keyup', again, true);
      if (!fsEl()) enter();
    };
    addEventListener('pointerup', again, true);
    addEventListener('keyup', again, true);
  }
}

/** true while a match runs: browser shortcuts go to the game, closing the tab asks first */
export function guardLeave(on) {
  const f = on ? 'addEventListener' : 'removeEventListener';
  window[f]('beforeunload', onUnload);
  window[f]('keydown', onKey, true);
}
function onUnload(e) { e.preventDefault(); e.returnValue = ''; }
const typing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
const fKey = (k) => /^F\d+$/.test(k);
// capture phase + preventDefault only: the game's own key handlers still see every key
function onKey(e) {
  const k = e.key;
  if (k === 'F12') return;
  if (typing(e.target) && k !== 'Escape' && k !== 'Tab' && !fKey(k)) return;   // chat keeps copy/paste/select
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || k === 'Alt' || k === 'Escape' || k === 'Tab' || fKey(k)) e.preventDefault();
}

function showTip() {
  const tip = document.createElement('div');
  tip.className = 'p2d-fs-tip';
  tip.innerHTML = `<div><b>Full screen on iPhone</b><br><br>Tap <b>Share</b> (the square with an arrow) in Safari, then <b>Add to Home Screen</b>.
    <br><br>Open <b>Pixel2Dota</b> from your home screen: it runs full screen, with no browser bars.<br><button>OK</button></div>`;
  tip.addEventListener('click', (e) => { if (e.target === tip || e.target.tagName === 'BUTTON') tip.remove(); });
  document.body.appendChild(tip);
}
