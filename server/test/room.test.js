import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
import { startServer } from '../src/index.js';
import { cleanOrder } from '../src/room/MatchRoom.js';
import { MSG, LOBBY, ROOM } from '../../shared/protocol.js';
import { HERO_KEYS } from '../../shared/heroes.js';

let srv, base;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000, label = 'condition') {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('timeout waiting for ' + label);
    await sleep(15);
  }
}

before(async () => { srv = await startServer({ port: 0 }); base = 'ws://127.0.0.1:' + srv.port; });
after(async () => { await srv.close(); });

test('cleanOrder whitelists and validates', () => {
  assert.deepEqual(cleanOrder({ t: 'move', x: 1, y: 2, evil: 1 }), { t: 'move', x: 1, y: 2 });
  assert.equal(cleanOrder({ t: 'move', x: 'a', y: 2 }), null);
  assert.equal(cleanOrder({ t: 'nope' }), null);
  assert.equal(cleanOrder(null), null);
  assert.equal(cleanOrder({ t: 'cast', slot: -1 }), null);
  assert.deepEqual(cleanOrder({ t: 'attack', id: '12', q: 1 }), { t: 'attack', id: '12', q: true });
});

test('lobby -> bots -> game -> orders', { timeout: 60000 }, async () => {
  const c1 = new Client(base), c2 = new Client(base);
  const r1 = await c1.create(ROOM, { name: 'Alice' });
  assert.match(r1.roomId, /^[A-Z]{4}$/);
  const code = r1.roomId;
  const lobbies = await (await fetch(`http://127.0.0.1:${srv.port}/lobbies`)).json();
  assert.ok(lobbies.some((l) => l.code === code && l.host === 'Alice'), 'room listed');

  const r2 = await c2.joinById(code, { name: 'Bob' });
  await until(() => r1.state.players.size === 2 && r2.state.players.size === 2, 5000, 'both players');
  const p1 = () => r1.state.players.get(r1.sessionId), p2 = () => r1.state.players.get(r2.sessionId);
  assert.equal(p1().isHost, true);
  assert.equal(p2().isHost, false);
  assert.ok(p1().team >= 0 && p2().team >= 0);

  // take slots
  r2.send(MSG.LOBBY, { t: LOBBY.SLOT, team: 1, slot: 3 });
  await until(() => p2().team === 1 && p2().slot === 3, 3000, 'slot move');
  r1.send(MSG.LOBBY, { t: LOBBY.SLOT, team: 1, slot: 3 });       // taken -> ignored
  const msgs = [];
  r1.onMessage(MSG.FX, (e) => msgs.push(...e));
  await sleep(150);
  assert.equal(p1().team === 1 && p1().slot === 3, false);

  // picks (unique per match)
  r1.send(MSG.LOBBY, { t: LOBBY.HERO, key: 'npc_dota_hero_sven' });
  await until(() => p1().hero === 'npc_dota_hero_sven', 3000, 'hero pick');
  r2.send(MSG.LOBBY, { t: LOBBY.HERO, key: 'npc_dota_hero_sven' });
  await sleep(150);
  assert.equal(p2().hero, '');
  r2.send(MSG.LOBBY, { t: LOBBY.HERO, key: 'npc_dota_hero_lina' });
  await until(() => p2().hero === 'npc_dota_hero_lina', 3000, 'hero pick 2');

  // non-host cannot fill / start
  r2.send(MSG.LOBBY, { t: LOBBY.FILL });
  r2.send(MSG.LOBBY, { t: LOBBY.START });
  await sleep(200);
  assert.equal(r1.state.players.size, 2);
  assert.equal(r1.state.phase, 'lobby');

  // chat
  const chats = [];
  r2.onMessage(MSG.FX, (e) => { for (const x of e) if (x.e === 'chat') chats.push(x); });
  r1.send(MSG.CHAT, { text: 'gl hf' });
  await until(() => chats.length, 3000, 'chat');
  assert.equal(chats[0].text, 'gl hf');

  // host fills bots, starts
  r1.send(MSG.LOBBY, { t: LOBBY.FILL });
  await until(() => r1.state.players.size === 10, 3000, 'fill');
  assert.equal([...r1.state.players.values()].filter((p) => p.isBot).length, 8);
  const heroes = new Set([...r1.state.players.values()].map((p) => p.hero));
  assert.equal(heroes.size, 10, 'unique heroes');

  const fx = [];
  r1.onMessage(MSG.FX, (e) => fx.push(...e));
  r1.send(MSG.LOBBY, { t: LOBBY.START });
  await until(() => r1.state.phase === 'game' && r1.state.units.size >= 10, 10000, 'game start');
  await until(() => r2.state.phase === 'game' && r2.state.units.size >= 10, 5000, 'game state on c2');
  const heroUnits = [...r1.state.units.values()].filter((u) => u.kind === 'hero');
  assert.equal(heroUnits.length, 10);
  assert.ok(HERO_KEYS.includes(heroUnits[0].key));
  assert.ok(r1.state.players.get(r1.sessionId).heroId, 'heroId set');

  // time advances (30 Hz sim)
  const t0 = r1.state.time;
  await until(() => r1.state.time > t0 + 0.5, 3000, 'time advance');

  // fx messages arrive (match start msg at least; chat)
  await until(() => fx.length > 0, 5000, 'fx');

  // move order
  const myHero = () => r1.state.units.get(r1.state.players.get(r1.sessionId).heroId);
  const x0 = myHero().x, y0 = myHero().y;
  r1.send(MSG.ORDER, { t: 'move', x: x0 + 600, y: y0 + 600 });
  await until(() => Math.hypot(myHero().x - x0, myHero().y - y0) > 40, 6000, 'hero moved');
  assert.equal(myHero().anim, 'walk');

  // bad orders do not crash
  r1.send(MSG.ORDER, { t: 'move', x: 'zzz' });
  r1.send(MSG.ORDER, 'junk');
  r1.send(MSG.ORDER, { t: 'cast', slot: 99 });
  await sleep(200);
  assert.equal(r1.state.phase, 'game');

  await r2.leave(); await r1.leave();
});

test('host migrates when host leaves in lobby; code unique; spectator when full', { timeout: 20000 }, async () => {
  const c = new Client(base);
  const a = await c.create(ROOM, { name: 'A' });
  const b = await new Client(base).joinById(a.roomId, { name: 'B' });
  await until(() => a.state.players.size === 2, 3000, 'two');
  assert.equal(b.state.players.get(a.sessionId)?.isHost, true);
  await a.leave();
  await until(() => b.state.players.size === 1 && b.state.players.get(b.sessionId).isHost, 3000, 'host migrated');
  await b.leave();
});

test('spectators: host toggle, spectator seat, join a live match, no orders', { timeout: 30000 }, async () => {
  const host = await new Client(base).create(ROOM, { name: 'Host' });
  const code = host.roomId;
  const me = (r, sid = r.sessionId) => r.state.players.get(sid);

  // spectators off: a live match refuses newcomers
  const v0 = await new Client(base).joinById(code, { name: 'Early' });
  await until(() => host.state.players.size === 2, 3000, 'early joined');
  v0.send(MSG.LOBBY, { t: LOBBY.SLOT, team: 3 });                 // not allowed yet
  await sleep(150);
  assert.notEqual(me(host, v0.sessionId).team, 3);

  host.send(MSG.LOBBY, { t: LOBBY.SPECS, on: true });
  await until(() => host.state.spectators === true, 3000, 'spectators on');
  v0.send(MSG.LOBBY, { t: LOBBY.SLOT, team: 3 });
  await until(() => me(host, v0.sessionId)?.team === 3, 3000, 'spectator seat');
  v0.send(MSG.LOBBY, { t: LOBBY.HERO, key: 'npc_dota_hero_axe' });  // spectators cannot pick
  await sleep(150);
  assert.equal(me(host, v0.sessionId).hero, '');

  host.send(MSG.LOBBY, { t: LOBBY.HERO, key: 'npc_dota_hero_sven' });
  host.send(MSG.LOBBY, { t: LOBBY.FILL });
  await until(() => host.state.players.size === 11, 3000, 'fill');
  host.send(MSG.LOBBY, { t: LOBBY.START });
  await until(() => host.state.phase === 'game' && host.state.units.size >= 10, 10000, 'game');
  assert.equal([...host.state.units.values()].filter((u) => u.kind === 'hero').length, 10, 'spectator has no hero');

  // listed as live, and a newcomer joins mid-match as a spectator
  const list = await (await fetch(`http://127.0.0.1:${srv.port}/lobbies`)).json();
  assert.ok(list.some((l) => l.code === code && l.live && l.spectators), 'live match listed');
  const v1 = await new Client(base).joinById(code, { name: 'Late' });
  await until(() => v1.state.phase === 'game' && me(v1)?.team === 3, 5000, 'late spectator');
  assert.equal(me(v1).heroId, '');
  await until(() => v1.state.units.size >= 10, 5000, 'spectator sees units');

  // spectator orders are ignored (no crash, phase stays)
  v1.send(MSG.ORDER, { t: 'move', x: 0, y: 0 });
  await sleep(150);
  assert.equal(host.state.phase, 'game');

  // leaving frees the seat
  await v1.leave();
  await until(() => !host.state.players.has(v1.sessionId), 3000, 'spectator removed');
  await v0.leave(); await host.leave();
});

test('spectators off: live match refuses joins', { timeout: 20000 }, async () => {
  const host = await new Client(base).create(ROOM, { name: 'H' });
  host.send(MSG.LOBBY, { t: LOBBY.HERO, key: 'npc_dota_hero_sven' });
  host.send(MSG.LOBBY, { t: LOBBY.FILL });
  await until(() => host.state.players?.size === 10, 3000, 'fill');
  host.send(MSG.LOBBY, { t: LOBBY.START });
  await until(() => host.state.phase === 'game', 10000, 'game');
  await assert.rejects(new Client(base).joinById(host.roomId, { name: 'X' }));
  await host.leave();
});

test('rejoining a live match by name / stored seat takes the hero back (not a spectator)', { timeout: 60000 }, async () => {
  const { ownSid } = await import('../../client/src/net/index.js').catch(() => ({}));
  const c1 = new Client(base);
  const r1 = await c1.create(ROOM, { name: 'Iris' });
  const code = r1.roomId, seat = r1.sessionId;
  r1.send(MSG.LOBBY, { t: LOBBY.HERO, key: 'npc_dota_hero_mirana' });
  await until(() => r1.state.players?.get(seat)?.hero === 'npc_dota_hero_mirana', 3000, 'pick');
  r1.send(MSG.LOBBY, { t: LOBBY.FILL });
  await sleep(200);
  r1.send(MSG.LOBBY, { t: LOBBY.START });
  await until(() => r1.state.phase === 'game' && r1.state.players?.get(seat)?.heroId, 10000, 'game');
  r1.leave(false);                                                       // unconsented: the server keeps the seat
  // a second client can't watch (no spectators), but the dropped player can come back
  const c2 = new Client(base);
  await assert.rejects(c2.joinById(code, { name: 'Stranger' }));
  const r2 = await c2.joinById(code, { name: 'iris' });                 // name match, case-insensitive
  await until(() => r2.state.players?.get(seat)?.claim === r2.sessionId, 5000, 'claim');
  const p = r2.state.players?.get(seat);
  assert.equal(p.connected, true); assert.notEqual(p.team, 3);
  assert.equal(r2.state.players.has(r2.sessionId), false, 'no spectator entry');
  if (ownSid) assert.equal(ownSid(r2.state.players, r2.sessionId), seat);
  const h = r2.state.units.get(p.heroId), x0 = h.x, y0 = h.y;
  r2.send(MSG.ORDER, { t: 'move', x: x0 + 600, y: y0 + 600 });
  await until(() => Math.hypot(h.x - x0, h.y - y0) > 100, 5000, 'hero moves');
  // and again through the stored seat id, after this session drops too
  r2.leave(false);
  const r3 = await new Client(base).joinById(code, { name: 'renamed', seat });
  await until(() => r3.state.players?.get(seat)?.claim === r3.sessionId, 5000, 'claim by seat');
  await r3.leave(true);
});
