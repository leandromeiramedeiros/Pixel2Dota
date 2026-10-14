// Small DOM panels: scoreboard (Tab), kill feed, chat, floating messages, end screen.
import { TEAM, MSG } from '../../../shared/protocol.js';
import { HEROES } from '../../../shared/heroes.js';
import { fmtGold, heroName, heroShort } from './format.js';
import { pixelEl } from './pixels.js';
import { GLYPHS } from './glyphs.js';

export const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
/** CSS size of a pixel canvas in HUD units. */
export const sizeU = (c, w, hh) => { c.style.width = `calc(${w} * var(--u))`; if (hh) c.style.height = `calc(${hh} * var(--u))`; return c; };
const teamCls = (t) => (t === TEAM.RADIANT ? 'rad' : t === TEAM.DIRE ? 'dire' : '');

/** Face crop of a hero's portrait frame (24x24 raster px). */
export function faceEl(sheets, heroKey, w = 24) {
  const sh = sheets && sheets[heroShort(heroKey)];
  const c = sh && sh.frames && sh.frames.portrait ? pixelEl(sh, 'portrait', 1, [4, 2, 24, 24]) : document.createElement('canvas');
  c.classList.add('px');
  return sizeU(c, w, w);
}

// ------------------------------------------------------------------------------------------------ scoreboard
export function createScoreboard(parent, { sheets }) {
  const el = h('div', 'h-sb h-panel'); parent.append(el);
  let open = false, sig = '';
  const api = {
    el, isOpen: () => open,
    setOpen(v) { open = !!v; el.classList.toggle('open', open); if (open) sig = ''; },
    update(state, mySid) {
      if (!open || !state || !state.players) return;
      const ps = [];
      state.players.forEach((p) => ps.push(p));
      const rows = ps.map((p) => {
        const u = p.heroId && state.units ? state.units.get(p.heroId) : null;
        return { p, lvl: u ? u.level : 1, dead: !!(u && u.respawn > 0) };
      });
      const s = rows.map((r) => [r.p.sid, r.p.kills, r.p.deaths, r.p.assists, r.p.lh, r.p.dn, r.lvl, r.dead ? 1 : 0, Math.floor(r.p.gold / 10)].join(',')).join('|');
      if (s === sig) return; sig = s;
      el.textContent = '';
      for (const team of [TEAM.RADIANT, TEAM.DIRE]) {
        const mine = rows.filter((r) => r.p.team === team).sort((a, b) => a.p.slot - b.p.slot);
        const box = h('div', 'tm');
        const kills = mine.reduce((a, r) => a + r.p.kills, 0);
        const ttl = h('div', 'ttl ' + teamCls(team)); ttl.append(h('span', null, team === TEAM.RADIANT ? 'THE RADIANT' : 'THE DIRE'), h('span', null, String(kills)));
        const hd = h('div', 'th hd');
        for (const t of ['', 'HERO', 'LV', 'K/D/A', 'LH/DN', 'GOLD']) hd.append(h('span', t === 'HERO' ? 'n' : 'k', t));
        box.append(ttl, hd);
        for (const r of mine) {
          const row = h('div', 'th row ' + teamCls(team) + (r.p.sid === mySid ? ' me' : '') + (r.dead ? ' dead' : ''));
          const face = h('span'); face.append(faceEl(sheets, r.p.hero, 12));
          const nm = h('span', 'n', (r.p.name || '?') + (r.p.hero ? ' - ' + heroName(r.p.hero) : ''));
          row.append(face, nm, h('span', 'k', String(r.lvl)), h('span', 'k', `${r.p.kills}/${r.p.deaths}/${r.p.assists}`), h('span', 'k', `${r.p.lh}/${r.p.dn}`), h('span', 'k h-gold', fmtGold(r.p.gold)));
          box.append(row);
        }
        el.append(box);
      }
    },
  };
  return api;
}

// ------------------------------------------------------------------------------------------------ kill feed
export function createFeed(parent) {
  const el = h('div', 'h-feed'); parent.append(el);
  const timers = new Set();
  return {
    el,
    /** ev = { killer, victim, gold, by, kt } (player sids); state for names/teams. */
    kill(ev, state, mySid) {
      const P = (sid) => (sid && state && state.players ? state.players.get(sid) : null);
      const k = P(ev.killer), v = P(ev.victim);
      const row = h('div', 'h-kf' + (ev.killer === mySid || ev.victim === mySid ? ' mine' : ''));
      const by = ev.by === 'tower' ? 'Tower' : ev.by === 'fountain' ? 'Fountain' : ev.by === 'creep' ? 'Creeps' : ev.by ? 'Building' : 'Neutrals';
      const kn = h('span', k ? teamCls(k.team) : teamCls(ev.kt) || 'h-dim', k ? k.name || heroName(k.hero) : by);
      const vn = h('span', v ? teamCls(v.team) : 'h-dim', v ? v.name || heroName(v.hero) : 'Someone');
      row.append(kn, sizeU(pixelEl(GLYPHS.sword, null, 1), 9), vn);
      if (ev.gold && ev.killer === mySid) row.append(h('span', 'g', '+' + ev.gold));
      el.append(row);
      while (el.childNodes.length > 5) el.firstChild.remove();
      const t = setTimeout(() => { row.remove(); timers.delete(t); }, 7000); timers.add(t);
    },
    destroy() { for (const t of timers) clearTimeout(t); el.remove(); },
  };
}

// ------------------------------------------------------------------------------------------------ messages
export function createMessages(parent) {
  const el = h('div', 'h-msgs'); parent.append(el);
  const timers = new Set();
  return {
    el,
    show(text, warn) {
      if (!text) return;
      const last = el.lastChild;
      if (last && last.textContent === text) return;
      const m = h('div', 'h-msg' + (warn ? ' warn' : ''), text); el.append(m);
      while (el.childNodes.length > 3) el.firstChild.remove();
      const t = setTimeout(() => { m.remove(); timers.delete(t); }, warn ? 1800 : 3200); timers.add(t);
    },
    destroy() { for (const t of timers) clearTimeout(t); el.remove(); },
  };
}

// ------------------------------------------------------------------------------------------------ chat
export function createChat(parent, { send }) {
  const el = h('div', 'h-chat'); const lines = h('div', 'lines'); const inp = h('input');
  inp.maxLength = 200; inp.placeholder = 'Say something (Enter to send, Esc to cancel)'; inp.spellcheck = false;
  el.append(lines, inp); parent.append(el);
  let typing = false;
  const timers = new Set();
  const close = () => { typing = false; el.classList.remove('typing'); inp.value = ''; inp.blur(); };
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { const text = inp.value.trim(); if (text) send(MSG.CHAT, { text }); close(); }
    else if (e.key === 'Escape') close();
  });
  inp.addEventListener('keyup', (e) => e.stopPropagation());
  inp.addEventListener('blur', () => { if (typing) close(); });
  return {
    el,
    isTyping: () => typing,
    open() { typing = true; el.classList.add('typing'); inp.value = ''; inp.focus(); },
    close,
    /** ev = { name, team, text } */
    add(ev) {
      const ln = h('div', 'ln');
      if (ev.name) ln.append(h('span', teamCls(ev.team), ev.name + ': '));
      ln.append(document.createTextNode(ev.text || ''));
      lines.append(ln);
      while (lines.childNodes.length > 40) lines.firstChild.remove();
      const t = setTimeout(() => { ln.classList.add('old'); timers.delete(t); }, 9000); timers.add(t);
    },
    system(text) { const ln = h('div', 'ln'); ln.append(h('span', 'sys', text)); lines.append(ln); const t = setTimeout(() => { ln.classList.add('old'); timers.delete(t); }, 9000); timers.add(t); },
    destroy() { for (const t of timers) clearTimeout(t); el.remove(); },
  };
}

// ------------------------------------------------------------------------------------------------ end screen
export function createEnd(parent) {
  const el = h('div', 'h-end'); const title = h('h1'); const sub = h('div', 'sub'); const btn = h('div', 'btn', 'RETURN TO LOBBY');
  el.append(title, sub, btn); parent.append(el);
  btn.addEventListener('click', () => dispatchEvent(new Event('p2d:return-lobby')));   // main.js leaves the room (drops the resume token) and reboots to the lobby
  let shown = false;
  return {
    el, isShown: () => shown,
    show(winner, myTeam) {
      if (shown) return; shown = true;
      const win = winner === myTeam;
      title.textContent = winner === TEAM.NONE || winner < 0 ? 'MATCH ENDED' : win ? 'VICTORY' : 'DEFEAT';
      title.className = win ? 'win' : 'lose';
      sub.textContent = winner === TEAM.RADIANT ? 'The Radiant destroyed the Dire Ancient' : winner === TEAM.DIRE ? 'The Dire destroyed the Radiant Ancient' : '';
      el.classList.add('open');
    },
    hide() { shown = false; el.classList.remove('open'); },
    destroy() { el.remove(); },
  };
}

export { HEROES };
