// Lane-creep motion metrics on a real headless bot match (the sandbox runs mock creeps, so measure the sim).
// measureCreepMotion({seed, sec}) -> {stack, jitter, spawn, lanes}. Run via creepmotion.test.js (node --test).
//   stack   creep pairs (lane creeps vs any non-building unit) whose centres are closer than the summed hull radius,
//           sampled every 0.5 s once the first waves have met: max / mean pairs per sample, mean overlap depth (u),
//           deep = pairs closer than half the summed hull (visibly on top of each other)
//   jitter  per creep: sum |heading change| (deg) per 1000u of travel, backtracks (step velocity . previous < 0),
//           facing change (deg) per 1000u; mean over creeps, split lane-walk vs fighting
//   spawn   spawn -> first lane waypoint: seconds, heading changes > 15 deg/tick, facing turned (deg); same-xy spawns per wave
//   aggro   driftPerSec: u moved per second while in attack range of its kept target (should be ~0: last-hit predictability),
//           targetsPerCreep, reacquire: target dropped then re-picked within 1.5 s (leash flip-flop)
//   lanes   lane polyline: points, corners > 20 deg, total turning (deg)
import { World } from '../src/sim/world.js';
import { HERO_KEYS } from '../../shared/heroes.js';
import { TEAM, KIND } from '../../shared/protocol.js';
import { inAttackRange } from '../src/sim/combat.js';

const DT = 1 / 30, D = 180 / Math.PI;
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };
const r1 = (v) => Math.round(v * 10) / 10;

export function measureCreepMotion({ seed = 3, sec = 300 } = {}) {
  const w = new World({ seed });
  for (let i = 0; i < 10; i++) {
    const team = i < 5 ? TEAM.RADIANT : TEAM.DIRE;
    w.addHero({ pid: `bot:${team}:${i % 5}`, team, heroKey: HERO_KEYS[i % HERO_KEYS.length], bot: true, slot: i % 5 });
  }
  // static lane geometry
  const lanes = {};
  for (const [k, P] of Object.entries(w._lanes)) {
    let corners = 0, turn = 0;
    for (let i = 1; i + 1 < P.length; i++) {
      const a = Math.atan2(P[i].y - P[i - 1].y, P[i].x - P[i - 1].x), b = Math.atan2(P[i + 1].y - P[i].y, P[i + 1].x - P[i].x), d = Math.abs(wrap(b - a)) * D;
      turn += d; if (d > 20) corners++;
    }
    lanes[k] = { pts: P.length, corners, turnDeg: Math.round(turn) };
  }
  const st = new Map();          // creep id -> track
  const waves = new Map();       // wave key -> [{x,y}]
  const stackS = [], depth = [], deepS = [];
  let met = false;
  const ticks = Math.round(sec / DT);
  for (let t = 0; t < ticks && w.winner < 0; t++) {
    w.step(DT);
    for (const u of w.units.values()) {
      if (u.kind !== KIND.CREEP || !u._lp || u._dead) continue;
      let s = st.get(u.id);
      if (!s) {
        s = { x: u.x, y: u.y, f: u.facing, h: null, vx: 0, vy: 0, li0: u._li, t0: w.time, walk: { dist: 0, turn: 0, face: 0, back: 0 }, fight: { dist: 0, turn: 0, face: 0, back: 0 }, sp: { turns: 0, face: 0, done: -1 }, inR: 0, drift: 0, tg: null, tgN: 0, flip: 0, lost: null, lostT: -9 };
        st.set(u.id, s);
        const wk = u.team + ':' + u._lane + ':' + u._wave;
        (waves.get(wk) || waves.set(wk, []).get(wk)).push({ x: u.x, y: u.y });
        continue;
      }
      const dx = u.x - s.x, dy = u.y - s.y, d = Math.hypot(dx, dy), df = Math.abs(wrap(u.facing - s.f)) * D;
      const ph = u._tgt ? s.fight : s.walk;
      if (u._tgt && s.tg === u._tgt && inAttackRange(u, u._tgt, 0)) { s.inR += DT; s.drift += d; }
      if (u._tgt !== s.tg) {
        if (u._tgt) { s.tgN++; if (u._tgt === s.lost && w.time - s.lostT < 1.5) s.flip++; }
        else { s.lost = s.tg; s.lostT = w.time; }
        s.tg = u._tgt;
      }
      ph.face += df;
      if (s.sp.done < 0) s.sp.face += df;
      if (d > 0.05) {
        const h = Math.atan2(dy, dx);
        if (s.h !== null) {
          const dh = Math.abs(wrap(h - s.h)) * D;
          ph.turn += dh;
          if (s.sp.done < 0 && dh > 15) s.sp.turns++;
          if (dx * s.vx + dy * s.vy < 0) ph.back++;
        }
        ph.dist += d; s.h = h; s.vx = dx; s.vy = dy;
      }
      if (s.sp.done < 0 && u._li > s.li0) s.sp.done = w.time - s.t0;
      s.x = u.x; s.y = u.y; s.f = u.facing;
    }
    if (!met && [...w.units.values()].some((u) => u.kind === KIND.CREEP && u._lp && u._tgt && u._tgt.kind === KIND.CREEP)) met = true;
    if (met && t % 15 === 0) {
      const C = [...w.units.values()].filter((u) => !u._dead && !u._building && !u._noCollide);
      let pairs = 0, deep = 0;
      for (let i = 0; i < C.length; i++) for (let j = i + 1; j < C.length; j++) {
        const a = C[i], b = C[j];
        if (!((a.kind === KIND.CREEP && a._lp) || (b.kind === KIND.CREEP && b._lp))) continue;
        const dd = Math.hypot(a.x - b.x, a.y - b.y), m = a.radius + b.radius;
        if (dd < m) { pairs++; depth.push(m - dd); if (dd < m * 0.5) deep++; }
      }
      stackS.push(pairs); deepS.push(deep);
    }
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const per = (k, f) => { const v = [...st.values()].filter((s) => s[k].dist > 200).map(f); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
  const ph = (k) => ({ creeps: [...st.values()].filter((s) => s[k].dist > 200).length, turnPer1k: r1(per(k, (s) => s[k].turn / s[k].dist * 1000)), facePer1k: r1(per(k, (s) => s[k].face / s[k].dist * 1000)), backPer1k: r1(per(k, (s) => s[k].back / s[k].dist * 1000)) });
  const sp = [...st.values()].filter((s) => s.sp.done >= 0);
  const S = [...st.values()], inR = S.reduce((a, s) => a + s.inR, 0);
  const aggro = { driftPerSec: r1(S.reduce((a, s) => a + s.drift, 0) / (inR || 1)), targetsPerCreep: r1(avg(S.map((s) => s.tgN))), reacquire: S.reduce((a, s) => a + s.flip, 0) };
  let same = 0, wavesN = 0;
  for (const pts of waves.values()) {
    wavesN++;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < 1) same++;
  }
  return {
    stack: { samples: stackS.length, max: Math.max(0, ...stackS), mean: r1(avg(stackS)), depth: r1(avg(depth)), deepMax: Math.max(0, ...deepS), deepMean: r1(avg(deepS)) },
    jitter: { walk: ph('walk'), fight: ph('fight') },
    aggro,
    spawn: { creeps: sp.length, sec: r1(avg(sp.map((s) => s.sp.done))), maxSec: r1(Math.max(0, ...sp.map((s) => s.sp.done))), turns: r1(avg(sp.map((s) => s.sp.turns))), faceDeg: Math.round(avg(sp.map((s) => s.sp.face))), samePairs: same, waves: wavesN },
    lanes,
  };
}
