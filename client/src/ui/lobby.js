// Lobby screen: browse/create/join -> room (slots, hero pick, bots, chat, start).
//   createLobby(root, net, { onGameStart }) -> { destroy() }
import { MSG, LOBBY, PHASE, TEAM, TEAM_SIZE, SPEC_MAX, EV } from '@p2d/shared/protocol.js';
import { HEROES, HERO_KEYS } from '@p2d/shared/heroes.js';
import { DATA } from '@p2d/shared/data.js';
import { serverKind } from '../net/index.js';
import './lobby.css';

const UNREACHABLE = 'Cannot reach the server';
const WAKING = 'Waking up the server, this can take a minute...';

// Hero portraits: sheets/<short>.js 'portrait' frame (ASCII rows) -> 1x PNG data URL, shown pixelated at 1x/3x via CSS.
const sheetLoaders = import.meta.glob('../art/sheets/*.js');
const portraitUrl = {};                       // short -> dataURL (filled as sheets load)
const portraitLoading = new Map();
function loadPortrait(short) {
  if (portraitLoading.has(short)) return portraitLoading.get(short);
  const load = sheetLoaders['../art/sheets/' + short + '.js'];
  const p = (load ? load() : Promise.resolve(null)).then((m) => {
    const sh = m && m.default, rows = sh && sh.frames && sh.frames.portrait;
    if (!rows) return;
    const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), id = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = rows[y][x], col = ch && ch !== '.' ? sh.pal[ch] : null; if (!col) continue;
      const o = (y * w + x) * 4;
      id.data[o] = parseInt(col.slice(1, 3), 16); id.data[o + 1] = parseInt(col.slice(3, 5), 16); id.data[o + 2] = parseInt(col.slice(5, 7), 16);
      id.data[o + 3] = col.length > 7 ? parseInt(col.slice(7, 9), 16) : 255;
    }
    g.putImageData(id, 0, 0);
    portraitUrl[short] = c.toDataURL();
  }).catch(() => {});
  portraitLoading.set(short, p);
  return p;
}
const ATTR = { str: ['STR', '#e8523f'], agi: ['AGI', '#4ec04e'], int: ['INT', '#4a9ae8'], all: ['ALL', '#d4a73c'] };
const attrOf = (key) => ATTR[DATA.heroes[key]?.attr] || ATTR.all;
const portraitImg = (key, cls) => {
  const u = portraitUrl[HEROES[key]?.short];
  return u ? `<img class="lb-pt ${cls}" src="${u}" alt="">` : `<span class="lb-pt ${cls} lb-pt-ph"></span>`;
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
const TEAM_NAME = ['Radiant', 'Dire'];

export function createLobby(root, net, { onGameStart } = {}) {
  const el = document.createElement('div');
  el.className = 'lb-root';
  root.appendChild(el);

  let name = lsGet('p2d.name') || 'Player' + ((Math.random() * 900 + 100) | 0);
  let lobbies = [];
  let error = '';
  let failSince = 0;
  let busy = false;
  let started = false;
  let destroyed = false;
  let pollTimer = 0;
  let offChange = null, offFx = null, offLeave = null;
  const chat = [];          // {cls, who, text}
  let mode = '';            // 'browse' | 'room'

  // ------------------------------------------------------------------------------------------------ browse
  function showBrowse() {
    mode = 'browse';
    el.innerHTML = `
      <div class="lb-brand"><h1>PIXEL<span>2</span>DOTA</h1><p>5v5 pixel-art Dota in your browser</p></div>
      <div class="lb-card lb-browse">
        ${serverTag()}
        <label class="lb-field">Your name<input id="lb-name" maxlength="20" value="${esc(name)}" autocomplete="off" spellcheck="false"></label>
        <div class="lb-row">
          <button class="lb-btn lb-primary" id="lb-create">Create lobby</button>
          <input id="lb-code" class="lb-code-in" maxlength="4" placeholder="CODE" autocomplete="off" spellcheck="false">
          <button class="lb-btn" id="lb-joincode">Join</button>
        </div>
        <div class="lb-err" id="lb-err">${esc(error)}</div>
        <div class="lb-row lb-srv">
          <label class="lb-field">Server<input id="lb-server" value="${esc(net.endpoint || '')}" placeholder="localhost:2567" autocomplete="off" spellcheck="false"></label>
          <button class="lb-btn lb-small" id="lb-srvgo">Connect</button>
        </div>
        <div class="lb-listhead"><span>Open lobbies</span><button class="lb-btn lb-small" id="lb-refresh">Refresh</button></div>
        <div class="lb-list" id="lb-list"></div>
      </div>`;
    const jq = new URLSearchParams(location.search).get('join');
    if (jq) el.querySelector('#lb-code').value = jq.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    renderList();
    refreshList();
    clearInterval(pollTimer);
    pollTimer = setInterval(refreshList, 3000);
  }

  function renderList() {
    const box = el.querySelector('#lb-list'); if (!box) return;
    if (!lobbies.length) { box.innerHTML = '<div class="lb-empty">No open lobbies. Create one.</div>'; return; }
    box.innerHTML = lobbies.map((l) => `
      <div class="lb-lobby">
        <b class="lb-lcode">${esc(l.code)}</b>
        <span class="lb-lhost">${esc(l.host)}</span>
        <span class="lb-lcount">${l.live ? '<i class="lb-tag lb-live">LIVE</i> ' + (l.specs || 0) + '/' + SPEC_MAX + ' watching' : l.players + '/' + l.max + ' players' + (l.bots ? ' + ' + l.bots + ' bots' : '')}</span>
        <button class="lb-btn lb-small" data-join="${esc(l.code)}">${l.live ? 'Watch' : 'Join'}</button>
      </div>`).join('');
  }

  async function refreshList() {
    if (destroyed || mode !== 'browse') return;
    try { lobbies = await net.listLobbies(); } catch {
      // a free cloud server sleeps when idle and takes about a minute to wake: say so instead of failing
      lobbies = []; failSince ||= Date.now();
      const local = /\/\/(localhost|127\.|\[::1\])/.test(net.endpoint || '');
      setErr(!local && Date.now() - failSince < 120000 ? WAKING : UNREACHABLE); return;
    }
    failSince = 0;
    if (error === UNREACHABLE || error === WAKING) setErr('');
    renderList();
  }

  // shareable invite: this page + the game server + the lobby code (lobby.js prefills the code from ?join=)
  function inviteLink() {
    const u = new URL(location.href);
    u.search = ''; u.hash = '';
    if (net.endpoint) u.searchParams.set('server', net.endpoint);   // always: also replaces a friend's stale saved server
    u.searchParams.set('join', net.room?.roomId || '');
    return u.href;
  }
  // which server this page talks to, so players can tell the cloud from someone's own machine
  function serverTag() {
    const s = serverKind(net.endpoint);
    const txt = s.kind === 'cloud' ? '☁ Cloud server' : (s.kind === 'local' ? '🖥 Local server' : '🌐 Custom server') + ' · ' + s.host;
    return `<span class="lb-srvtag lb-srv-${s.kind}" title="${esc(net.endpoint || '')}">${esc(txt)}</span>`;
  }
  function setErr(msg) { error = msg; const n = el.querySelector('#lb-err'); if (n) n.textContent = msg; }
  function curName() {
    const n = (el.querySelector('#lb-name')?.value || '').trim().slice(0, 20) || name;
    name = n; lsSet('p2d.name', n); return n;
  }

  async function enter(promise) {
    if (busy) return;
    busy = true; setErr('');
    try {
      await promise();
      if (net.state?.phase === PHASE.GAME) { started = true; onGameStart?.(); }   // joined a live match: spectator
      else showRoom();
    }
    catch (e) { setErr(String(e?.message || e || 'Failed').replace(/^Error:\s*/, '')); }
    busy = false;
  }

  // ------------------------------------------------------------------------------------------------ room
  function showRoom() {
    mode = 'room';
    clearInterval(pollTimer);
    chat.length = 0;
    chat.push({ cls: 'sys', text: 'Joined lobby ' + (net.room?.roomId || '') + '. Share the code to invite friends.' });
    el.innerHTML = `
      <div class="lb-room">
        <div class="lb-top">
          <div class="lb-codebox"><span>Lobby code</span><b id="lb-rcode">${esc(net.room?.roomId || '')}</b><button class="lb-btn lb-small" id="lb-copy">Copy link</button>${serverTag()}</div>
          <label class="lb-field lb-me">Name<input id="lb-name" maxlength="20" value="${esc(name)}" autocomplete="off" spellcheck="false"></label>
          <button class="lb-btn" id="lb-leave">Leave</button>
        </div>
        <div class="lb-teams" id="lb-teams"></div>
        <div class="lb-bottom">
          <div class="lb-heroes"><h3>Hero <small>(each hero once per match)</small></h3><div class="lb-grid" id="lb-grid"></div></div>
          <div class="lb-chat"><div class="lb-log" id="lb-log"></div><input id="lb-chatin" maxlength="200" placeholder="Chat (Enter)" autocomplete="off"></div>
        </div>
        <div class="lb-foot" id="lb-foot"></div>
      </div>`;
    renderLog();
    renderRoom();
    Promise.all(HERO_KEYS.map((k) => loadPortrait(HEROES[k].short))).then(() => { if (!destroyed && mode === 'room') renderRoom(); });
  }

  const me = () => net.state?.players?.get(net.mySid);
  const players = () => { const a = []; net.state?.players?.forEach((p) => a.push(p)); return a; };

  function renderRoom() {
    if (mode !== 'room' || !net.state) return;
    const ps = players();
    const mine = me();
    const isHost = !!mine?.isHost;

    // teams
    const teams = el.querySelector('#lb-teams');
    let html = '';
    for (let t = 0; t < 2; t++) {
      html += `<div class="lb-team lb-t${t}"><h2>${TEAM_NAME[t]}</h2>`;
      for (let s = 0; s < TEAM_SIZE; s++) {
        const p = ps.find((q) => q.team === t && q.slot === s);
        if (p) {
          const hero = p.hero ? HEROES[p.hero]?.name || p.hero : 'No hero';
          const self = p.sid === net.mySid;
          html += `<div class="lb-slot lb-full${self ? ' lb-self' : ''}${p.connected ? '' : ' lb-off'}">
            ${p.hero ? portraitImg(p.hero, 'lb-pt1') : '<span class="lb-pt lb-pt1 lb-pt-ph"></span>'}
            <span class="lb-sn">${esc(p.name)}</span>
            ${p.isHost ? '<i class="lb-tag lb-host">HOST</i>' : ''}${p.isBot ? '<i class="lb-tag">BOT</i>' : ''}${self ? '<i class="lb-tag lb-you">YOU</i>' : ''}
            <span class="lb-sh${p.hero ? '' : ' lb-none'}">${esc(hero)}</span>
            ${self ? `<button class="lb-x" title="Leave slot" data-unslot="1">&times;</button>` : (isHost ? `<button class="lb-x" title="Remove" data-kick="${t}:${s}">&times;</button>` : '')}
          </div>`;
        } else {
          html += `<div class="lb-slot lb-empty-slot">
            <button class="lb-take" data-take="${t}:${s}">Take slot</button>
            ${isHost ? `<button class="lb-btn lb-small" data-bot="${t}:${s}">+ Bot</button>` : ''}
          </div>`;
        }
      }
      html += '</div>';
    }
    const who = (p) => esc(p.name) + (p.sid === net.mySid ? ' (you)' : '');
    const specOn = !!net.state.spectators, specs = ps.filter((p) => p.team === TEAM.SPEC);
    const unslot = ps.filter((p) => p.team !== 0 && p.team !== 1 && p.team !== TEAM.SPEC);
    html += `<div class="lb-spec">
      ${isHost ? `<label class="lb-chk"><input type="checkbox" id="lb-specs" ${specOn ? 'checked' : ''}> Allow spectators</label>` : ''}
      ${specOn ? `<span>Spectators ${specs.length}/${SPEC_MAX}: ${specs.map(who).join(', ') || 'none yet'}. They can also join after the match starts.</span>
        ${mine?.team === TEAM.SPEC ? '' : '<button class="lb-btn lb-small" data-spec="1">Spectate</button>'}` : (isHost ? '' : '<span>Spectators off</span>')}
      ${unslot.length ? `<span>Unslotted: ${unslot.map(who).join(', ')}</span>` : ''}
    </div>`;
    teams.innerHTML = html;

    // hero grid
    const taken = new Map();
    for (const p of ps) if (p.hero) taken.set(p.hero, p);
    el.querySelector('#lb-grid').innerHTML = HERO_KEYS.map((k) => {
      const o = taken.get(k), own = o && o.sid === net.mySid;
      const cls = own ? ' lb-picked' : o ? ' lb-taken' : '';
      const [al, ac] = attrOf(k);
      return `<button class="lb-hero${cls}" data-hero="${k}" style="--a:${ac}" ${o && !own ? 'disabled' : ''}>
        ${portraitImg(k, 'lb-pt3')}
        <span class="lb-hn">${esc(HEROES[k].name)}</span>
        <i class="lb-attr">${al}</i>
        ${o ? `<small>${own ? 'yours' : esc(o.name)}</small>` : ''}
      </button>`;
    }).join('');

    // footer
    const nSlotted = ps.filter((p) => p.team === 0 || p.team === 1).length;
    const needHero = ps.filter((p) => !p.isBot && (p.team === 0 || p.team === 1) && !p.hero).length;
    let foot;
    if (isHost) {
      const hint = !nSlotted ? 'Take a slot first' : needHero ? 'Everyone needs a hero (' + needHero + ' missing)' : '';
      foot = `<button class="lb-btn" id="lb-fill">Fill with bots</button>
        <span class="lb-hint">${esc(hint)}</span>
        <button class="lb-btn lb-primary lb-start" id="lb-start" ${hint ? 'disabled' : ''}>Start match</button>`;
    } else {
      foot = '<span class="lb-hint">Waiting for the host to start...</span>';
    }
    el.querySelector('#lb-foot').innerHTML = foot;
  }

  function renderLog() {
    const log = el.querySelector('#lb-log'); if (!log) return;
    const stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 8;
    log.innerHTML = chat.slice(-80).map((m) => `<div class="lb-msg ${m.cls}">${m.who ? `<b>${esc(m.who)}:</b> ` : ''}${esc(m.text)}</div>`).join('');
    if (stick) log.scrollTop = log.scrollHeight;
  }

  function pushChat(m) { chat.push(m); if (chat.length > 200) chat.splice(0, 50); renderLog(); }

  function hash(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

  // ------------------------------------------------------------------------------------------------ events
  const lobbyMsg = (o) => net.send(MSG.LOBBY, o);

  el.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    const d = t.dataset;
    if (t.id === 'lb-create') return enter(() => net.create(curName()));
    if (t.id === 'lb-joincode') {
      const code = (el.querySelector('#lb-code').value || '').trim().toUpperCase();
      if (code.length !== 4) return setErr('Enter the 4-letter code');
      return enter(() => net.join(code, curName()));
    }
    if (d.join) return enter(() => net.join(d.join, curName()));
    if (t.id === 'lb-refresh') return refreshList();
    if (t.id === 'lb-leave') { net.leave(); return; }
    if (t.id === 'lb-copy') { try { navigator.clipboard?.writeText(inviteLink()); t.textContent = 'Copied'; setTimeout(() => { t.textContent = 'Copy link'; }, 1200); } catch { /* ignore */ } return; }
    if (t.id === 'lb-srvgo') { const u = new URL(location.href); u.searchParams.set('server', (el.querySelector('#lb-server').value || '').trim()); u.searchParams.delete('join'); location.href = u.href; return; }
    if (t.id === 'lb-fill') return lobbyMsg({ t: LOBBY.FILL });
    if (t.id === 'lb-start') return lobbyMsg({ t: LOBBY.START });
    if (d.take) { const [tm, sl] = d.take.split(':').map(Number); return lobbyMsg({ t: LOBBY.SLOT, team: tm, slot: sl }); }
    if (d.unslot) return lobbyMsg({ t: LOBBY.SLOT, team: -1, slot: -1 });
    if (d.spec) return lobbyMsg({ t: LOBBY.SLOT, team: TEAM.SPEC });
    if (d.bot) { const [tm, sl] = d.bot.split(':').map(Number); return lobbyMsg({ t: LOBBY.BOT, team: tm, slot: sl }); }
    if (d.kick) { const [tm, sl] = d.kick.split(':').map(Number); return lobbyMsg({ t: LOBBY.KICK, team: tm, slot: sl }); }
    if (d.hero) { const mine = me(); return lobbyMsg({ t: LOBBY.HERO, key: mine && mine.hero === d.hero ? '' : d.hero }); }
  });

  el.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key !== 'Enter') return;
    const id = e.target.id;
    if (id === 'lb-chatin') {
      const text = e.target.value.trim();
      if (text) net.send(MSG.CHAT, { text });
      e.target.value = '';
    } else if (id === 'lb-name' && mode === 'room') { e.target.blur(); }
    else if (id === 'lb-name' || id === 'lb-code') {
      const code = (el.querySelector('#lb-code').value || '').trim().toUpperCase();
      enter(() => (code.length === 4 ? net.join(code, curName()) : net.create(curName())));
    }
  });
  el.addEventListener('keyup', (e) => e.stopPropagation());
  el.addEventListener('input', (e) => { if (e.target.id === 'lb-code') e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
  el.addEventListener('change', (e) => {
    if (e.target.id === 'lb-name' && mode === 'room') { const n = curName(); lobbyMsg({ t: LOBBY.NAME, name: n }); }
    if (e.target.id === 'lb-specs') lobbyMsg({ t: LOBBY.SPECS, on: e.target.checked });
  });

  offChange = net.onChange((st) => {
    if (destroyed) return;
    if (st.phase === PHASE.GAME && !started) { started = true; onGameStart?.(); return; }
    if (st.phase === PHASE.LOBBY) renderRoom();
  });
  offFx = net.onFx((events) => {
    if (mode !== 'room') return;
    for (const ev of events) {
      if (ev.e === EV.MSG) pushChat({ cls: 'sys', text: ev.text });
      else if (ev.e === EV.CHAT) {
        const p = net.state?.players?.get(ev.p);
        pushChat({ cls: ev.p === net.mySid ? 'self' : '', who: p ? p.name : '?', text: ev.text });
      }
    }
  });
  offLeave = net.onLeave((code) => {
    if (destroyed || started) return;
    error = code === 1000 || code === 4000 ? 'You left the lobby' : 'Disconnected from the lobby';
    showBrowse();
  });

  // boot: resumed room (page reload) or browse
  if (net.room && net.state) {
    if (net.state.phase === PHASE.GAME) { started = true; setTimeout(() => onGameStart?.(), 0); }
    else showRoom();
  } else showBrowse();

  return {
    destroy() {
      destroyed = true;
      clearInterval(pollTimer);
      offChange?.(); offFx?.(); offLeave?.();
      el.remove();
    },
  };
}
