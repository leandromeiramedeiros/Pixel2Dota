// Spectator "player perspective" client logic (pure, node-tested): store the relayed player states, follow the watched player's camera.
// Wire contract + validation: shared/pov.js. UI: ui/spectate.js. Glue: game.js.
import { POV } from '../../shared/pov.js';

export const POV_RATE = 9;        // 1/s: smoothing of the (~9 Hz, stepwise) relayed camera target
export const POV_SNAP = 3500;     // u: farther than this between smoothed and goal = snap (first frame, player teleport / respawn camera jump)
export const DEF_DIST = 1134;     // camera distance used when the watched hero's player is a bot / silent (CAMERA.distance)

const fin = (n) => typeof n === 'number' && Number.isFinite(n);

/** latest relayed state per player sid, stamped with the local arrival time (ms) */
export function createPovStore() {
  const map = new Map();
  return {
    push(m, now) {
      if (!m || typeof m.s !== 'string' || !fin(m.x) || !fin(m.y) || !fin(m.d)) return null;
      const e = { x: m.x, y: m.y, d: m.d, sel: typeof m.sel === 'string' ? m.sel : '', tg: m.tg && (m.tg.k === 'ability' || m.tg.k === 'item') ? m.tg : null, ax: fin(m.ax) ? m.ax : null, ay: fin(m.ay) ? m.ay : null, at: now };
      map.set(m.s, e); return e;
    },
    /** fresh state of a player, or null when none / older than POV.STALE_MS */
    get(sid, now) { const e = map.get(sid); return e && now - e.at <= POV.STALE_MS ? e : null; },
    clear() { map.clear(); },
  };
}

/** Where the spectator camera wants to be: the player's own camera while its state is fresh, else the hero with the default zoom (bots, silent clients). null = nothing to follow. */
export function followGoal(entry, hero, defDist = DEF_DIST) {
  if (entry) return { x: entry.x, y: entry.y, d: entry.d, live: true };
  if (hero && fin(hero.x) && fin(hero.y)) return { x: hero.x, y: hero.y, d: defDist, live: false };
  return null;
}

/** One smoothing step of the followed camera target; `cur` null (just switched) or a jump beyond POV_SNAP lands on the goal. */
export function stepFollow(cur, goal, dt, rate = POV_RATE) {
  if (!goal) return cur;
  if (!cur || Math.hypot(goal.x - cur.x, goal.y - cur.y) > POV_SNAP) return { x: goal.x, y: goal.y };
  const k = 1 - Math.exp(-Math.max(0, dt) * rate);
  return { x: cur.x + (goal.x - cur.x) * k, y: cur.y + (goal.y - cur.y) * k };
}

/** the ten watchable players (teams 0 / 1), Radiant first, by slot */
export function povPlayers(players) {
  const out = [];
  if (players && players.forEach) players.forEach((p) => { if (p && (p.team === 0 || p.team === 1)) out.push(p); });
  return out.sort((a, b) => (a.team - b.team) || (a.slot - b.slot));
}

/** keep `sid` when it is still a watchable player, else the first human (falls back to the first player); '' when nobody */
export function pickPovSid(players, sid) {
  const list = povPlayers(players);
  if (sid && list.some((p) => p.sid === sid)) return sid;
  const first = list.find((p) => !p.isBot) || list[0];
  return first ? first.sid : '';
}

/** vision mode of the spectator renderer: perspective + fog on = that player's team sees; everything else = both teams (-2) */
export function visionKey(isSpec, povTeam, fogOn) {
  return isSpec && !(povTeam != null && povTeam >= 0 && fogOn) ? -2 : povTeam != null && povTeam >= 0 ? povTeam : -1;
}

/** the message a player sends for its camera (null = nothing changed since `prev` and the heartbeat is not due) */
export function povStateMsg(cam, sel, aim, prev, now, lastAt) {
  const m = { x: Math.round(cam.x), y: Math.round(cam.y), d: Math.round(cam.d), sel: sel || '' };
  if (aim && aim.tg) { m.tg = aim.tg; if (fin(aim.ax) && fin(aim.ay)) { m.ax = Math.round(aim.ax); m.ay = Math.round(aim.ay); } }
  const same = prev && prev.x === m.x && prev.y === m.y && prev.d === m.d && prev.sel === m.sel
    && (prev.tg ? prev.tg.s : -1) === (m.tg ? m.tg.s : -1) && (prev.tg ? prev.tg.k : '') === (m.tg ? m.tg.k : '') && prev.ax === m.ax && prev.ay === m.ay;
  return same && now - lastAt < 1000 ? null : m;
}
