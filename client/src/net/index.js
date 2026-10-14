// Colyseus client wrapper + snapshot interpolation. See docs/ARCHITECTURE.md "Client code interfaces".
//   createNet(endpoint?) -> { listLobbies, create, join, resume, leave, send, onFx, onChange, onLeave, view, room, state, mySid, connected }
import { Client } from '@colyseus/sdk';
import { ROOM, MSG, INTERP_MS } from '@p2d/shared/protocol.js';
import { heightAt } from '@p2d/shared/map.js';
import { createClock } from './clock.js';

const RING = 8;               // samples kept per unit
const SNAP_DIST = 450;        // |dx,dy| between consecutive samples above this = teleport (blink, tp, respawn): no lerp
const TOKEN_KEY = 'p2d.reconnect';

// Unit fields copied live (not delayed) onto the UnitView each frame.
const LIVE = ['id', 'kind', 'key', 'team', 'owner', 'hp', 'maxHp', 'mana', 'maxMana', 'level', 'status', 'ms',
  'xp', 'str', 'agi', 'int', 'dmgMin', 'dmgMax', 'dmgBonus', 'armor', 'atkRate', 'atkRange', 'skillPoints', 'respawn', 'orbs'];

const store = (() => {
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch { return null; }
})();
const tokenGet = () => { try { return store && store.getItem(TOKEN_KEY); } catch { return null; } };
const tokenSet = (v) => { try { if (store) v ? store.setItem(TOKEN_KEY, v) : store.removeItem(TOKEN_KEY); } catch { /* ignore */ } };
// Seat id per room code (localStorage: survives iOS tab eviction and the 60 s reconnect window) -> rejoining a live match takes the hero back.
const SEAT_KEY = 'p2d.seat.';
const seatGet = (code) => { try { return localStorage.getItem(SEAT_KEY + code) || ''; } catch { return ''; } };
const seatSet = (code, sid) => { try { if (code && sid) localStorage.setItem(SEAT_KEY + code, sid); } catch { /* ignore */ } };
// Last live match code (localStorage): boot rejoins it when the reconnect token is gone (iOS tab eviction, phone locked > 60 s).
const LAST_KEY = 'p2d.lastMatch';
const lastGet = () => { try { return localStorage.getItem(LAST_KEY) || ''; } catch { return ''; } };
const lastSet = (v) => { try { v ? localStorage.setItem(LAST_KEY, v) : localStorage.removeItem(LAST_KEY); } catch { /* ignore */ } };
/** The state key of my Player: my session id, or the seat I reclaimed (Player.claim === my session id). */
export function ownSid(players, sessionId) {
  if (!players || players.has?.(sessionId)) return sessionId;
  let own = sessionId;
  players.forEach?.((p, k) => { if (p && p.claim === sessionId) own = k; });
  return own;
}

// Game server chosen by the player: ?server=host:port (shareable link) or the lobby's Server field, remembered in localStorage.
// "host:port" / "http(s)://..." / "ws(s)://..." all work; bare hosts get wss:// unless they are this machine or the LAN.
const SERVER_KEY = 'p2d.server';
const LOCAL_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])|^[^/:]+\.local(:|$)/i;
export function normalizeServer(s) {
  s = String(s || '').trim().replace(/\/+$/, '');
  if (!s) return '';
  if (/^wss?:\/\//i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return s.replace(/^http/i, 'ws');
  return (LOCAL_HOST.test(s) ? 'ws://' : 'wss://') + s;   // public servers sit behind TLS; this machine and the LAN do not
}
/** the player's server override (query param wins and is remembered), or '' for the default */
export function serverOverride() {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('server') : null;
    if (q != null) { const v = normalizeServer(q); if (v) localStorage.setItem(SERVER_KEY, v); else localStorage.removeItem(SERVER_KEY); return v; }
    return normalizeServer(localStorage.getItem(SERVER_KEY));
  } catch { return ''; }
}

function defaultEndpoint() {
  if (typeof location === 'undefined') return 'ws://localhost:2567';
  if (/\.github\.io$/i.test(location.hostname)) return 'ws://localhost:2567';   // static Pages build: no server here, assume a local one
  const secure = location.protocol === 'https:';
  const dev = !!(import.meta.env && import.meta.env.DEV) || location.port === '4173';
  return (secure ? 'wss://' : 'ws://') + (dev ? location.hostname + ':2567' : location.host);
}

const newSample = () => ({ t: 0, x: 0, y: 0, f: 0, anim: 'idle', seq: 0, rate: 1, at: 0 });
function newRec() {
  const s = []; for (let i = 0; i < RING; i++) s.push(newSample());
  return { s, n: 0, head: 0, stamp: 0 };
}

export function createNet(endpoint) {
  const wsUrl = endpoint || defaultEndpoint();
  const httpUrl = wsUrl.replace(/^ws/, 'http');
  const client = new Client(wsUrl);

  const fxCbs = new Set(), changeCbs = new Set(), leaveCbs = new Set();
  const recs = new Map();                 // unit id -> sample ring
  const views = new Map();                // unit id -> reused UnitView
  const unitList = [];
  const trees = new Set();
  let treeSig = '';
  let stamp = 0;
  const clock = createClock();
  // fx events keep their old lead over the (now adaptive) unit delay: held back by however much the delay grew past INTERP_MS
  let fxRelease = 0;
  const emitFx = (events) => { for (const cb of fxCbs) cb(events); };
  const onFxMsg = (events) => {
    const now = performance.now(), hold = clock.delay() - INTERP_MS;
    if (hold <= 1 && fxRelease <= now) { emitFx(events); return; }
    fxRelease = Math.max(fxRelease, now + Math.max(0, hold));
    setTimeout(() => emitFx(events), fxRelease - now);
  };

  const net = {
    room: null, state: null, mySid: '', connected: false, endpoint: wsUrl,

    async listLobbies() {
      const r = await fetch(httpUrl + '/lobbies');
      if (!r.ok) throw new Error('lobbies ' + r.status);
      return r.json();
    },
    async create(name) { return attach(await client.create(ROOM, { name })); },
    async join(code, name) { const c = String(code || '').trim().toUpperCase(); return attach(await client.joinById(c, { name, seat: seatGet(c) })); },
    // Re-enter a room after a page reload (60 s server window). Resolves null when there is nothing to resume.
    // Then falls back to rejoining the last live match by stored seat / name (the server hands the hero back; never as a spectator).
    async resume() {
      const tok = tokenGet();
      if (tok) { try { return attach(await client.reconnect(tok)); } catch { tokenSet(null); } }
      const code = lastGet(); if (!code) return null;
      let name = ''; try { name = localStorage.getItem('p2d.name') || ''; } catch { /* ignore */ }
      try {
        const room = await net.join(code, name);
        const st = await new Promise((res) => { if (room.state && room.state.players && room.state.players.size) res(room.state); else { room.onStateChange.once((s) => res(s)); setTimeout(() => res(room.state), 4000); } });
        const p = st && st.players && st.players.get(ownSid(st.players, room.sessionId));
        if (st && st.phase === 'game' && p && (p.team === 0 || p.team === 1)) return room;
        net.leave(); return null;
      } catch { lastSet(null); return null; }
    },
    // clears room/state now (not on the async onLeave) so a lobby created right after starts on the browse view
    leave() { tokenSet(null); lastSet(null); const r = net.room; net.room = null; net.state = null; net.connected = false; if (r) { try { r.leave(true); } catch { /* ignore */ } } },
    send(type, payload) { const r = net.room; if (r) r.send(type, payload); },   // during a drop the SDK queues it and flushes on reconnect
    onFx(cb) { fxCbs.add(cb); return () => fxCbs.delete(cb); },
    onChange(cb) { changeCbs.add(cb); return () => changeCbs.delete(cb); },
    onLeave(cb) { leaveCbs.add(cb); return () => leaveCbs.delete(cb); },
    view,
    /** current interpolation delay, ms (adapts to network jitter) */
    delay: () => clock.delay(),
  };

  function attach(room) {
    net.room = room; net.state = room.state; net.mySid = ownSid(room.state && room.state.players, room.sessionId); net.connected = true;
    seatSet(room.roomId, net.mySid);
    recs.clear(); views.clear(); trees.clear(); treeSig = ''; clock.reset();
    tokenSet(room.reconnectionToken);
    room.onMessage(MSG.FX, onFxMsg);
    room.onStateChange((st) => {
      net.state = st;
      if (net.room === room) { const own = ownSid(st.players, room.sessionId); if (own !== net.mySid) { net.mySid = own; seatSet(room.roomId, own); } }
      if (net.room === room) { const pl = st.players && st.players.get(net.mySid), live = st.phase === 'game' && pl && (pl.team === 0 || pl.team === 1); if (live) { if (lastGet() !== room.roomId) lastSet(room.roomId); } else if (st.phase === 'ended' && lastGet() === room.roomId) lastSet(null); }
      sample(st); for (const cb of changeCbs) cb(st);
    });
    room.onLeave((code) => {
      if (net.room === room) { net.connected = false; net.room = null; net.state = null; }
      if (code === 1000 || code === 4000 || code >= 4000) tokenSet(null);
      for (const cb of leaveCbs) cb(code);
    });
    if (room.onDrop) room.onDrop(() => { net.connected = false; });
    if (room.onReconnect) room.onReconnect(() => { net.connected = true; tokenSet(room.reconnectionToken); });
    if (room.state && room.state.units && room.state.units.size) sample(room.state);
    return room;
  }

  // One call per state patch: push (arrival-time, x, y, facing, anim) into each unit's ring.
  function sample(st) {
    const now = performance.now(), ts = clock.stamp(st.time, now);
    stamp++;
    const units = st.units;
    if (!units) return;
    units.forEach((u, id) => {
      let r = recs.get(id);
      if (!r) { r = newRec(); recs.set(id, r); }
      r.stamp = stamp;
      const last = r.n ? r.s[(r.head + r.n - 1) % RING] : null;
      let s;
      if (r.n < RING) { s = r.s[(r.head + r.n) % RING]; r.n++; }
      else { s = r.s[r.head]; r.head = (r.head + 1) % RING; }
      // guarantee strictly increasing stamps even when two patches land in the same ms
      s.t = last && ts <= last.t ? last.t + 0.5 : ts;
      s.x = u.x; s.y = u.y; s.f = u.facing; s.anim = u.anim; s.seq = u.animSeq; s.rate = u.animRate;
      s.at = !last || last.anim !== s.anim || last.seq !== s.seq ? s.t : last.at;   // when this anim/animSeq began
    });
    if (recs.size > units.size) for (const id of recs.keys()) if (recs.get(id).stamp !== stamp) { recs.delete(id); views.delete(id); }

    // treesDown -> Set, rebuilt only when the array content changes
    const arr = st.treesDown;
    if (arr) {
      let sum = 0, sq = 0;
      for (let i = 0; i < arr.length; i++) { const v = arr[i]; sum += v; sq += v * v; }
      const sig = arr.length + ':' + sum + ':' + sq;
      if (sig !== treeSig) { treeSig = sig; trees.clear(); for (let i = 0; i < arr.length; i++) trees.add(arr[i]); }
    }
  }

  const out = { time: 0, night: false, myTeam: -1, myHeroId: '', treesDown: trees, units: unitList };

  // Interpolated frame. Returned object and UnitViews are reused: do not keep references across frames.
  function view(nowMs) {
    const st = net.state;
    out.time = st ? st.time : 0;
    out.night = st ? !!st.night : false;
    unitList.length = 0;
    if (!st || !st.units) return out;
    const rt = (nowMs == null ? performance.now() : nowMs) - clock.delay();
    st.units.forEach((u, id) => {
      const r = recs.get(id);
      if (!r || !r.n) return;
      let v = views.get(id);
      if (!v) { v = { x: 0, y: 0, z: 0, facing: 0, anim: 'idle', animSeq: 0, animRate: 1, animTime: 0, visible: true, abilities: null, items: null, buffs: null }; views.set(id, v); }
      for (let i = 0; i < LIVE.length; i++) { const k = LIVE[i]; v[k] = u[k]; }
      v.abilities = u.abilities; v.items = u.items; v.buffs = u.buffs;

      // newest sample at or before rt = a, following sample = b
      const s = r.s, n = r.n, head = r.head;
      let ai = -1;
      for (let i = n - 1; i >= 0; i--) { if (s[(head + i) % RING].t <= rt) { ai = i; break; } }
      let a, b = null;
      if (ai < 0) a = s[head];                                    // rt older than anything buffered
      else { a = s[(head + ai) % RING]; if (ai + 1 < n) b = s[(head + ai + 1) % RING]; }
      if (b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        if (dx * dx + dy * dy > SNAP_DIST * SNAP_DIST) { v.x = a.x; v.y = a.y; v.facing = a.f; }
        else {
          const k = (rt - a.t) / (b.t - a.t);
          v.x = a.x + dx * k; v.y = a.y + dy * k;
          let df = b.f - a.f; df -= Math.round(df / (2 * Math.PI)) * 2 * Math.PI;   // shortest path
          v.facing = a.f + df * k;
        }
      } else { v.x = a.x; v.y = a.y; v.facing = a.f; }
      v.anim = a.anim; v.animSeq = a.seq; v.animRate = a.rate;
      v.animTime = Math.max(0, (rt - a.at) / 1000);
      v.z = heightAt(v.x, v.y);
      v.visible = true;
      unitList.push(v);
    });
    return out;
  }

  return net;
}

/** Which game server an endpoint is, for the lobby badge: 'local' (this machine or LAN), 'cloud' (the public default) or 'custom'. */
export function serverKind(ep) {
  let u = null;
  try { u = new URL(String(ep || '').replace(/^ws/i, 'http')); } catch { /* not a URL */ }
  if (!u) return { kind: 'custom', host: String(ep || '') };
  const h = u.hostname;
  if (LOCAL_HOST.test(h)) return { kind: 'local', host: u.host };
  const def = normalizeServer(import.meta.env?.VITE_P2D_ENDPOINT);
  const same = typeof location !== 'undefined' && u.host === location.host;
  return { kind: (def && def === normalizeServer(ep)) || same ? 'cloud' : 'custom', host: u.host };
}
