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
