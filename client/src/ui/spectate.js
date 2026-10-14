// Spectator control panel: FREE ROAM | PLAYER PERSPECTIVE, the ten-player picker, FOG OF WAR checkbox. Pure DOM (touch: plain buttons).
//   createSpectate(root, { sheets, onChange }) -> { el, state: { mode, sid, fog }, update(players, isSpec), setMode, pick, destroy }
import { TEAM } from '../../../shared/protocol.js';
import { povPlayers, pickPovSid } from '../pov.js';
import { h, faceEl } from './panels.js';

export function createSpectate(root, { sheets, onChange } = {}) {
  const state = { mode: 'free', sid: '', fog: true };
  const el = h('div', 'h-spp h-panel'); el.style.display = 'none'; root.append(el);
  const modes = h('div', 'm');
  const bFree = h('button', 'b', 'FREE ROAM'), bPov = h('button', 'b', 'PLAYER PERSPECTIVE');
  bFree.type = bPov.type = 'button';
  modes.append(bFree, bPov);
  const who = h('div', 'who');
  const fogRow = h('label', 'fog'); const fogCb = document.createElement('input'); fogCb.type = 'checkbox'; fogCb.checked = state.fog;
  fogRow.append(fogCb, h('span', null, 'FOG OF WAR'));
  el.append(modes, who, fogRow);
  let sig = '', btns = [], lastPlayers = null;

  const changed = () => { render(); if (onChange) onChange(state); };
  function setMode(m) { if (m !== 'free' && m !== 'pov') return; state.mode = m; if (m === 'pov') state.sid = pickPovSid(lastPlayers, state.sid); changed(); }
  function pick(sid) { state.sid = sid; state.mode = 'pov'; changed(); }
  bFree.addEventListener('click', () => setMode('free'));
  bPov.addEventListener('click', () => setMode('pov'));
  fogCb.addEventListener('change', () => { state.fog = fogCb.checked; changed(); });

  function render() {
    const pov = state.mode === 'pov';
    bFree.classList.toggle('on', !pov); bPov.classList.toggle('on', pov);
    who.style.display = fogRow.style.display = pov ? '' : 'none';
    fogCb.checked = state.fog;
    for (const b of btns) b.el.classList.toggle('on', pov && b.p.sid === state.sid);
  }

  function build(list) {
    who.textContent = ''; btns = [];
    for (const t of [TEAM.RADIANT, TEAM.DIRE]) {
      const row = h('div', 'team ' + (t === TEAM.RADIANT ? 'rad' : 'dire'));
      for (const p of list.filter((q) => q.team === t)) {
        const b = h('button', 'who-b'); b.type = 'button'; b.title = (p.name || p.hero) + (p.isBot ? ' (bot)' : '');
        b.append(faceEl(sheets, p.hero, 20));
        b.addEventListener('click', () => pick(p.sid));
        row.append(b); btns.push({ p, el: b });
      }
      who.append(row);
    }
  }

  function onKey(e) {
    if (el.style.display === 'none' || state.mode !== 'pov') return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.ctrlKey || e.altKey || e.metaKey) return;
    const i = e.key === '0' ? 9 : /^[1-9]$/.test(e.key) ? +e.key - 1 : -1;
    if (i >= 0 && btns[i]) pick(btns[i].p.sid);
  }
  addEventListener('keydown', onKey);

  return {
    el, state,
    /** every frame: `players` = state.players, `isSpec` = this client holds a spectator seat. Keeps the picker in sync; drops a stale selection. */
    update(players, isSpec) {
      lastPlayers = players;
      el.style.display = isSpec ? '' : 'none';
      if (!isSpec) return;
      const list = povPlayers(players);
      const s = list.map((p) => p.sid + p.hero + p.team).join('|');
      if (s !== sig) { sig = s; build(list); render(); }
      if (state.mode === 'pov') { const ok = pickPovSid(players, state.sid); if (ok !== state.sid) { state.sid = ok; render(); if (onChange) onChange(state); } }
    },
    setMode, pick,
    destroy() { removeEventListener('keydown', onKey); el.remove(); },
  };
}
