// Headless 10-bot match: progression, errors, and whether it ends. node tools/fullmatch.mjs [minutes] [seed]
import { World } from '../server/src/sim/world.js';
import { HERO_KEYS } from '../shared/heroes.js';
const mins = +(process.argv[2] || 40), seed = +(process.argv[3] || 1);
const w = new World({ seed });
HERO_KEYS.forEach((k, i) => { const team = i < 5 ? 0 : 1, slot = i % 5; w.addHero({ pid: `bot:${team}:${slot}`, team, heroKey: k, bot: true, name: k, slot }); });
const evs = {}, t0 = Date.now(); let nan = 0, next = 0, slow = 0;
const kills = [0, 0];
for (let i = 0; i < mins * 60 * 30 && w.winner < 0; i++) {
  const a = performance.now(); w.step(1 / 30); const d = performance.now() - a; if (d > 33) slow++;
  for (const e of w.drainEvents()) { evs[e.e] = (evs[e.e] || 0) + 1; if (e.e === 'kill') { const t = w.units.get(e.s)?.team; if (t === 0 || t === 1) kills[t]++; } }
  for (const u of w.units.values()) if (!Number.isFinite(u.x) || !Number.isFinite(u.hp)) { nan++; }
  if (w.time >= next) {
    next += 300;
    const hs = [...w.units.values()].filter(u => u.kind === 'hero');
    const tw = [0, 1].map(t => [...w.units.values()].filter(u => u.team === t && /tower|rax|fort/.test(u.key)).length);
    console.log(`t=${(w.time / 60).toFixed(1)}m lvls=${hs.map(h => h.level).join(',')} buildings R/D=${tw} kills=${kills} gold=${hs.map(h => w.players.get(h.owner)?.gold ?? '?').join(',')}`);
  }
}
const errs = [...w.players.values()].filter(p => p._bot?.errs).map(p => `${p.name}:${p._bot.errs}:${p._bot.lastErr?.message}`);
const items = [...w.units.values()].filter(u => u.kind === 'hero').map(u => u.key.replace('npc_dota_hero_', '') + '[' + u.items.filter(Boolean).map(i => i.key?.replace('item_', '')).join(' ') + ']');
console.log('end t=', (w.time / 60).toFixed(1), 'winner', w.winner, 'ms/tick', ((Date.now() - t0) / Math.max(1, w.tick)).toFixed(2), 'slowTicks', slow, 'nan', nan);
console.log('events', JSON.stringify(evs));
console.log('botErrs', errs.join(' | ') || 'none');
console.log(items.join('\n'));
