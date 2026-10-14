import { World } from '../server/src/sim/world.js';
const w = new World({ seed: 1 });
const a = w.addHero({ pid: 'p1', team: 0, heroKey: 'npc_dota_hero_invoker', name: 'a', slot: 0 });
const b = w.addHero({ pid: 'p2', team: 1, heroKey: 'npc_dota_hero_sven', name: 'b', slot: 0 });
console.log('maxHp', a.maxHp, b.maxHp, 'mana', a.maxMana, 'dmg', a.dmgMin, a.dmgMax, 'armor', a.armor.toFixed(2), 'ms', a.ms);
let evs = {}, nan = 0, t0 = Date.now(), maxCreeps = 0;
for (let i = 0; i < 4500; i++) {
  w.step(1 / 30);
  for (const e of w.drainEvents()) evs[e.e] = (evs[e.e] || 0) + 1;
  if (i % 300 === 0) { let c = 0; for (const u of w.units.values()) { if (!Number.isFinite(u.x) || !Number.isFinite(u.y)) nan++; if (u.kind === 'creep') c++; } maxCreeps = Math.max(maxCreeps, c); }
}
const kinds = {}; for (const u of w.units.values()) kinds[u.kind] = (kinds[u.kind] || 0) + 1;
const towers = [...w.units.values()].filter(u => u.key.includes('tower')).map(u => Math.round(u.hp)).join(',');
console.log('time', w.time.toFixed(1), 'ms/tick', ((Date.now() - t0) / 4500).toFixed(2), 'nan', nan, 'maxCreeps', maxCreeps, 'kinds', JSON.stringify(kinds));
console.log('events', JSON.stringify(evs));
console.log('tower hp', towers, 'winner', w.winner);
