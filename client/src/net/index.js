// Colyseus client wrapper + snapshot interpolation. See docs/ARCHITECTURE.md "Client code interfaces".
//   createNet(endpoint?) -> { listLobbies, create, join, resume, leave, send, onFx, onChange, onLeave, view, room, state, mySid, connected }
import { Client } from '@colyseus/sdk';
import { ROOM, MSG, INTERP_MS } from '@p2d/shared/protocol.js';
import { heightAt } from '@p2d/shared/map.js';

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

function defaultEndpoint() {
  if (typeof location === 'undefined') return 'ws://localhost:2567';
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

  const net = {
    room: null, state: null, mySid: '', connected: false,

    async listLobbies() {
      const r = await fetch(httpUrl + '/lobbies');
      if (!r.ok) throw new Error('lobbies ' + r.status);
      return r.json();
    },
    async create(name) { return attach(await client.create(ROOM, { name })); },
    async join(code, name) { return attach(await client.joinById(String(code || '').trim().toUpperCase(), { name })); },
    // Re-enter a room after a page reload (60 s server window). Resolves null when there is nothing to resume.
    async resume() {
      const tok = tokenGet(); if (!tok) return null;
      try { return attach(await client.reconnect(tok)); } catch { tokenSet(null); return null; }
    },
    // clears room/state now (not on the async onLeave) so a lobby created right after starts on the browse view
    leave() { tokenSet(null); const r = net.room; net.room = null; net.state = null; net.connected = false; if (r) { try { r.leave(true); } catch { /* ignore */ } } },
    send(type, payload) { const r = net.room; if (r && net.connected) r.send(type, payload); },
    onFx(cb) { fxCbs.add(cb); return () => fxCbs.delete(cb); },
    onChange(cb) { changeCbs.add(cb); return () => changeCbs.delete(cb); },
    onLeave(cb) { leaveCbs.add(cb); return () => leaveCbs.delete(cb); },
    view,
  };

  function attach(room) {
    net.room = room; net.state = room.state; net.mySid = room.sessionId; net.connected = true;
    recs.clear(); views.clear(); trees.clear(); treeSig = '';
    tokenSet(room.reconnectionToken);
    room.onMessage(MSG.FX, (events) => { for (const cb of fxCbs) cb(events); });
    room.onStateChange((st) => { net.state = st; sample(st); for (const cb of changeCbs) cb(st); });
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
    const now = performance.now();
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
      s.t = last && now <= last.t ? last.t + 0.5 : now;
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
    const rt = (nowMs == null ? performance.now() : nowMs) - INTERP_MS;
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
