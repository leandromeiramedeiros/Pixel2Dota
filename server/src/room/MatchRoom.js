// "match" room: lobby (slots, heroes, bots, chat) -> game (30 Hz sim mirrored into schema) -> ended.
// Contract: docs/ARCHITECTURE.md (Network / Schema / messages). The sim is pure JS (server/src/sim); this file only owns
// lobby rules, the tick loop, sim -> schema sync and message validation.
import { Room, matchMaker } from 'colyseus';
import { MSG, PHASE, TEAM, TEAM_SIZE, LOBBY, ORDER, EV, TICK_HZ, ROOM } from '../../../shared/protocol.js';
import { HEROES, HERO_KEYS, heroByShort } from '../../../shared/heroes.js';
import { World } from '../sim/world.js';
import {
  MatchState, Player, Unit, Ability, Item,
  UNIT_FIELDS, ABILITY_FIELDS, ITEM_FIELDS, PLAYER_SIM_FIELDS,
} from './schema.js';

export const MAX_HUMANS = TEAM_SIZE * 2;
const RECONNECT_S = 60;
const DISPOSE_AFTER_END_MS = 120000;
const MAX_CHAT = 200;
const MAX_NAME = 16;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I / O look-alikes

// --- field quantisation / clamping (sim doubles -> schema numeric types). [min, max, step]: step 0 = integer, >0 = round to 1/step.
const INT8 = [-128, 127, 0], UINT8 = [0, 255, 0], UINT16 = [0, 65535, 0], INT16 = [-32768, 32767, 0], UINT32 = [0, 4294967295, 0];
const SPEC = {
  team: INT8, level: UINT8, skillPoints: UINT8, animSeq: UINT16, ms: UINT16, str: UINT16, agi: UINT16, int: UINT16, dmgMin: UINT16, dmgMax: UINT16, atkRange: UINT16,
  dmgBonus: INT16, xp: UINT32, status: UINT32,
  x: [-1e6, 1e6, 4], y: [-1e6, 1e6, 4], facing: [-100, 100, 1000], animRate: [0, 100, 100],
  hp: [-1e7, 1e7, 10], maxHp: [0, 1e7, 10], mana: [-1e7, 1e7, 10], maxMana: [0, 1e7, 10], armor: [-1000, 1000, 100], atkRate: [0, 100, 1000], respawn: [0, 1e4, 10],
  // ability / item / player
  cd: [0, 1e5, 10], cdMax: [0, 1e5, 10], charges: UINT16, flags: UINT8, gold: UINT32, kills: UINT16, deaths: UINT16, assists: UINT16, lh: UINT16, dn: UINT16,
};
const STRINGS = new Set(['kind', 'key', 'owner', 'anim', 'orbs', 'heroId']);

function conv(f, v) {
  if (STRINGS.has(f)) return typeof v === 'string' ? v : v == null ? '' : String(v);
  const s = SPEC[f];
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  if (!s) return v;
  v = v < s[0] ? s[0] : v > s[1] ? s[1] : v;
  return s[2] === 0 ? Math.round(v) : Math.round(v * s[2]) / s[2];
}

function syncFields(dst, src, fields) {
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i], v = conv(f, src[f]);
    if (dst[f] !== v) dst[f] = v;
  }
}

function syncList(dst, src, Ctor, fields) {
  const n = src ? src.length : 0;
  while (dst.length < n) dst.push(new Ctor());
  while (dst.length > n) dst.pop();
  for (let i = 0; i < n; i++) syncFields(dst[i], src[i], fields);
}

function syncBuffs(dst, src) {
  const n = src ? src.length : 0;
  while (dst.length < n) dst.push('');
  while (dst.length > n) dst.pop();
  for (let i = 0; i < n; i++) { const v = String(src[i]); if (dst[i] !== v) dst[i] = v; }
}

const ORDER_TYPES = new Set(Object.values(ORDER));
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const str = (s, max) => (typeof s === 'string' ? s.slice(0, max) : '');

/** Whitelist + type-check a client order. Returns a clean object or null. */
export function cleanOrder(o) {
  if (!o || typeof o !== 'object' || !ORDER_TYPES.has(o.t)) return null;
  const c = { t: o.t };
  if (o.q) c.q = true;
  for (const k of ['x', 'y']) if (o[k] !== undefined) { if (!finite(o[k])) return null; c[k] = o[k]; }
  for (const k of ['slot', 'a', 'b']) if (o[k] !== undefined) { if (!Number.isInteger(o[k]) || o[k] < 0 || o[k] > 31) return null; c[k] = o[k]; }
  for (const k of ['id', 'key']) if (o[k] !== undefined) { if (typeof o[k] !== 'string' || o[k].length > 64) return null; c[k] = o[k]; }
  return c;
}

function cleanName(n) {
  const s = typeof n === 'string' ? n.replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, MAX_NAME) : '';
  return s;
}

function randomCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_LETTERS[(Math.random() * CODE_LETTERS.length) | 0];
  return s;
}

export class MatchRoom extends Room {
  maxClients = MAX_HUMANS;
  autoDispose = true;

  async onCreate(options) {
    // unique 4-letter code as roomId
    let code = '';
    for (let i = 0; i < 40; i++) {
      const c = randomCode();
      const found = await matchMaker.findRoomsByIds([c]);
      if (!found.has(c)) { code = c; break; }
    }
    if (!code) throw new Error('could not allocate a room code');
    this.roomId = code;
    this.setState(new MatchState());
    this.state.phase = PHASE.LOBBY;
    this.state.code = code;
    this.state.winner = -1;
    this.maxMessagesPerSecond = 200;
    this.setPatchRate(50);
    this.world = null;
    this.simErrors = 0;
    this.fxQueue = [];
    this.suState = new Map();     // unit id -> schema Unit
    this.stamp = 0;
    this.hostName = cleanName(options?.name) || 'Host';
    this.refreshMeta();

    this.onMessage(MSG.LOBBY, (client, m) => this.safe(() => this.onLobby(client, m)));
    this.onMessage(MSG.ORDER, (client, m) => this.safe(() => this.onOrder(client, m)));
    this.onMessage(MSG.CHAT, (client, m) => this.safe(() => this.onChat(client, m)));
  }

  safe(fn) { try { fn(); } catch (e) { console.error('[room ' + this.roomId + ']', e); } }

  // ------------------------------------------------------------------------------------------------------------ lobby helpers
  players() { return [...this.state.players.values()]; }
  humans() { return this.players().filter((p) => !p.isBot); }
  occupant(team, slot) { for (const p of this.state.players.values()) if (p.team === team && p.slot === slot) return p; return null; }
  validSlot(team, slot) { return Number.isInteger(team) && Number.isInteger(slot) && (team === 0 || team === 1) && slot >= 0 && slot < TEAM_SIZE; }
  heroTaken(key, except) { for (const p of this.state.players.values()) if (p !== except && p.hero === key) return true; return false; }
  freeHeroes() { return HERO_KEYS.filter((k) => !this.heroTaken(k)); }
  resolveHero(k) { return typeof k !== 'string' ? null : HEROES[k] ? k : heroByShort(k) || null; }
  sendMsg(client, text) { client.send(MSG.FX, [{ e: EV.MSG, text }]); }
  broadcastMsg(text) { this.broadcast(MSG.FX, [{ e: EV.MSG, text }]); }

  firstFreeSlot(team) { for (let s = 0; s < TEAM_SIZE; s++) if (!this.occupant(team, s)) return s; return -1; }
  assignSlot(p) {
    const cnt = [0, 0];
    for (const q of this.state.players.values()) if (q.team === 0 || q.team === 1) cnt[q.team]++;
    const order = cnt[0] <= cnt[1] ? [0, 1] : [1, 0];
    for (const team of order) { const s = this.firstFreeSlot(team); if (s >= 0) { p.team = team; p.slot = s; return true; } }
    p.team = -1; p.slot = -1;
    return false;
  }

  refreshMeta() {
    if (this.hostName === undefined) return;
    const hum = this.players().filter((p) => !p.isBot);
    const host = hum.find((p) => p.isHost);
    const meta = {
      host: host ? host.name : this.hostName, players: hum.length, bots: this.state.players.size - hum.length,
      max: MAX_HUMANS, phase: this.state.phase, code: this.roomId,
    };
    this.setMetadata(meta).catch(() => {});
  }

  migrateHost() {
    const hum = this.humans().filter((p) => p.connected);
    if (hum.some((p) => p.isHost)) return;
    for (const p of this.state.players.values()) p.isHost = false;
    if (hum.length) { hum[0].isHost = true; this.broadcastMsg(hum[0].name + ' is now the host'); }
    const w = this.world;
    if (w && hum.length) { const sp = w.players.get(hum[0].sid); if (sp) sp.isHost = true; }
  }

  // ------------------------------------------------------------------------------------------------------------ join / leave
  onJoin(client, options) {
    const p = new Player();
    p.sid = client.sessionId;
    p.name = cleanName(options?.name) || 'Player ' + (this.humans().length + 1);
    p.hero = '';
    p.isBot = false;
    p.connected = true;
    p.heroId = '';
    p.team = -1; p.slot = -1;
    p.isHost = !this.humans().some((h) => h.isHost && h.connected);
    this.assignSlot(p);
    this.state.players.set(p.sid, p);
    this.refreshMeta();
  }

  onDrop(client) {
    const p = this.state.players.get(client.sessionId);
    if (this.state.phase === PHASE.GAME && p) {
      p.connected = false;
      const sp = this.world?.players.get(p.sid); if (sp) sp.connected = false;
      this.allowReconnection(client, RECONNECT_S);
      this.migrateHost();
    }
    // lobby / ended: no grace -> framework calls onLeave
  }

  onReconnect(client) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.connected = true;
    const sp = this.world?.players.get(p.sid); if (sp) sp.connected = true;
    this.migrateHost();
  }

  onLeave(client) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    if (this.state.phase === PHASE.LOBBY) {
      this.state.players.delete(p.sid);
      this.migrateHost();
      this.refreshMeta();
    } else {
      p.connected = false;
      const sp = this.world?.players.get(p.sid); if (sp) sp.connected = false;
      this.migrateHost();
    }
  }

  onDispose() {
    this.world = null;
  }

  // ------------------------------------------------------------------------------------------------------------ messages
  onChat(client, m) {
    const text = str(m?.text, MAX_CHAT).trim();
    if (!text) return;
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    this.fxQueue.push({ e: EV.CHAT, p: p.sid, name: p.name, team: p.team, text });
    if (this.state.phase !== PHASE.GAME) this.flushFx();
  }

  onOrder(client, m) {
    if (this.state.phase !== PHASE.GAME || !this.world) return;
    const o = cleanOrder(m);
    if (!o) return;
    const p = this.state.players.get(client.sessionId);
    if (!p || p.team < 0) return;
    this.world.order(p.sid, o);
  }

  onLobby(client, m) {
    if (!m || typeof m !== 'object') return;
    const me = this.state.players.get(client.sessionId);
    if (!me) return;
    if (this.state.phase !== PHASE.LOBBY) return;
    const host = me.isHost;
    switch (m.t) {
      case LOBBY.NAME: {
        const n = cleanName(m.name);
        if (n) { me.name = n; this.refreshMeta(); }
        break;
      }
      case LOBBY.SLOT: {
        if (m.team === -1) { me.team = -1; me.slot = -1; break; }
        if (!this.validSlot(m.team, m.slot)) break;
        const occ = this.occupant(m.team, m.slot);
        if (occ && occ !== me) { this.sendMsg(client, 'Slot is taken'); break; }
        me.team = m.team; me.slot = m.slot;
        break;
      }
      case LOBBY.HERO: {
        if (m.key === '' || m.key === null) { me.hero = ''; break; }
        const key = this.resolveHero(m.key);
        if (!key) break;
        if (this.heroTaken(key, me)) { this.sendMsg(client, HEROES[key].name + ' is already picked'); break; }
        me.hero = key;
        break;
      }
      case LOBBY.BOT: {
        if (!host) break;
        let team = m.team, slot = m.slot;
        if ((team === 0 || team === 1) && slot === undefined) slot = this.firstFreeSlot(team);
        if (!this.validSlot(team, slot)) break;
        if (this.occupant(team, slot)) break;
        this.addBot(team, slot);
        break;
      }
      case LOBBY.KICK: {
        if (!host || !this.validSlot(m.team, m.slot)) break;
        const occ = this.occupant(m.team, m.slot);
        if (!occ || occ === me) break;
        if (occ.isBot) this.state.players.delete(occ.sid);
        else this.clients.getById(occ.sid)?.leave();
        break;
      }
      case LOBBY.FILL: {
        if (!host) break;
        for (const team of [0, 1]) for (let s = 0; s < TEAM_SIZE; s++) if (!this.occupant(team, s)) this.addBot(team, s);
        break;
      }
      case LOBBY.START: {
        if (!host) break;
        this.tryStart(client);
        break;
      }
      default: return;
    }
    this.refreshMeta();
  }

  addBot(team, slot) {
    const free = this.freeHeroes();
    if (!free.length) return null;
    const hero = free[(Math.random() * free.length) | 0];
    const p = new Player();
    p.sid = `bot:${team}:${slot}`;
    p.name = HEROES[hero].name + ' (bot)';
    p.team = team; p.slot = slot; p.hero = hero; p.isBot = true; p.isHost = false; p.connected = true; p.heroId = '';
    this.state.players.set(p.sid, p);
    return p;
  }

  tryStart(client) {
    const slotted = this.players().filter((p) => p.team === 0 || p.team === 1);
    if (!slotted.length) { this.sendMsg(client, 'Nobody in a team'); return; }
    const missing = slotted.filter((p) => !p.isBot && !p.hero);
    if (missing.length) { this.sendMsg(client, 'Pick a hero first: ' + missing.map((p) => p.name).join(', ')); return; }
    this.startGame(slotted);
  }

  // ------------------------------------------------------------------------------------------------------------ game
  startGame(slotted) {
    const w = new World({ seed: (Math.random() * 0x7fffffff) | 0 });
    this.world = w;
    slotted.sort((a, b) => a.team - b.team || a.slot - b.slot);
    for (const p of slotted) {
      w.addHero({ pid: p.sid, team: p.team, heroKey: p.hero, bot: p.isBot, name: p.name, slot: p.slot, isHost: p.isHost, connected: p.connected });
    }
    this.state.phase = PHASE.GAME;
    this.lock();
    this.refreshMeta();
    this.setPatchRate(null);                       // patches are flushed manually, once per sim tick
    this.syncState();
    // own fixed-step accumulator (Colyseus setFixedTimestep ran ~4x slow here)
    const stepMs = 1000 / TICK_HZ;
    let last = performance.now(), acc = 0;
    this.setSimulationInterval(() => {
      const now = performance.now();
      acc += Math.min(now - last, 250);
      last = now;
      let n = 0;
      while (acc >= stepMs && n < 5) { acc -= stepMs; n++; this.tick(); }
      if (n === 5) acc = 0;
    }, 8);
    this.broadcast(MSG.FX, [{ e: EV.MSG, text: 'Match started' }]);
  }

  tick() {
    const w = this.world;
    if (!w || this.state.phase !== PHASE.GAME) return;
    try {
      w.step(1 / TICK_HZ);
      this.simErrors = 0;
    } catch (e) {
      console.error('[sim ' + this.roomId + '] step error', e);
      if (++this.simErrors > 30) { this.fxQueue.push({ e: EV.MSG, text: 'Simulation error, match aborted' }); this.endMatch(-1); }
    }
    this.syncState();
    const ev = w.drainEvents();
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.e === EV.TREE) this.treeAdd(e.i);
      else if (e.e === EV.TREE_GROW) this.treeRemove(e.i);
    }
    if (w.winner >= 0 && this.state.phase === PHASE.GAME) {
      if (!ev.some((e) => e.e === EV.END)) ev.push({ e: EV.END, winner: w.winner });
      this.endMatch(w.winner);
    }
    if (this.fxQueue.length) { for (const e of this.fxQueue) ev.push(e); this.fxQueue.length = 0; }
    this.sendFx(ev);
    this.broadcastPatch();
  }

  endMatch(winner) {
    this.state.phase = PHASE.ENDED;
    this.state.winner = winner;
    this.refreshMeta();
    this.clock.setTimeout(() => this.disconnect(), DISPOSE_AFTER_END_MS);
  }

  flushFx() { const q = this.fxQueue; if (q.length) { this.sendFx(q); this.fxQueue = []; } }

  sendFx(events) {
    if (!events.length) return;
    let direct = null, pub = events;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.e === EV.MSG && e.p) { direct = direct || []; direct.push(e); }
    }
    if (direct) {
      pub = events.filter((e) => !(e.e === EV.MSG && e.p));
      for (const e of direct) this.clients.getById(e.p)?.send(MSG.FX, [e]);
    }
    if (pub.length) this.broadcast(MSG.FX, pub);
  }

  treeAdd(i) { const a = this.state.treesDown; if (a.indexOf(i) < 0) a.push(i); }
  treeRemove(i) { const a = this.state.treesDown; const k = a.indexOf(i); if (k >= 0) a.splice(k, 1); }

  // ------------------------------------------------------------------------------------------------------------ sim -> schema
  syncState() {
    const w = this.world, st = this.state;
    if (!w) return;
    const time = Math.round(w.time * 100) / 100;
    if (st.time !== time) st.time = time;
    if (st.night !== w.night) st.night = w.night;
    // treesDown safety net (event-driven normally)
    if (st.treesDown.length !== w.treesDown.size) {
      st.treesDown.splice(0, st.treesDown.length);
      for (const i of w.treesDown) st.treesDown.push(i);
    }
    // players (stats owned by the sim; lobby fields owned by the room)
    for (const [pid, sp] of w.players) {
      const p = st.players.get(pid);
      if (p) syncFields(p, sp, PLAYER_SIM_FIELDS);
    }
    // units
    const stamp = ++this.stamp, map = this.suState;
    for (const [id, u] of w.units) {
      let ent = map.get(id), su = ent && ent.su;
      if (!su) {
        su = new Unit(); su.id = id;
        syncFields(su, u, UNIT_FIELDS);
        syncList(su.abilities, u.abilities, Ability, ABILITY_FIELDS);
        syncList(su.items, u.items, Item, ITEM_FIELDS);
        syncBuffs(su.buffs, u.buffs);
        st.units.set(id, su);
        ent = { su, stamp }; map.set(id, ent);
      } else {
        syncFields(su, u, UNIT_FIELDS);
        if (u.abilities.length || su.abilities.length) syncList(su.abilities, u.abilities, Ability, ABILITY_FIELDS);
        if (u.items.length || su.items.length) syncList(su.items, u.items, Item, ITEM_FIELDS);
        if (u.buffs.length || su.buffs.length) syncBuffs(su.buffs, u.buffs);
      }
      ent.stamp = stamp;
    }
    if (map.size !== w.units.size) {
      for (const [id, e] of map) if (e.stamp !== stamp) { map.delete(id); st.units.delete(id); }
    }
  }
}

export const ROOM_NAME = ROOM;
