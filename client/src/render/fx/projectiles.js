// Projectile engine: pooled records, tracking (unit target) or linear (to x2,y2). Drawn as rotating atlas quads (quads.js) with a moving
// point light and a particle trail. Spell projectiles register a def per ability key (R.proj); basic attacks pick one from ATK_DEFS.
//
// def: { frames:'fireball'|null, fps, scale, tint:[r,g,b], emit, bright, z (flight height, default chest), arc (height of parabola), spin (rad/s),
//        light:{col,radius,int,elem}, trail:{pal,rate,size,life,spread,up,stamp} | fn(c,p,dt), start(c,p), hit(c,p), pal (default impact palette) }
import { PAL, elemMul, rnd, TAU } from './common.js';

const MAXP = 160;
const framesCache = new Map();
function framesOf(c, base) {
  let a = framesCache.get(base); if (a) return a;
  a = []; const f0 = c.frame(base); if (f0) a.push(f0);
  for (let i = 1; i < 8; i++) { const f = c.frame(base + '_' + i); if (!f) break; a.push(f); }
  framesCache.set(base, a); return a;
}

export function createProjectiles(c, R) {
  const P = c.P;
  const pool = []; const live = []; const byId = new Map();
  for (let i = 0; i < MAXP; i++) pool.push({ alive: false, def: null, frames: null, key: '', id: '', x: 0, y: 0, z: 0, dx: 1, dy: 0, dz: 0, sp: 900, tid: '', sid: '', tx: 0, ty: 0, tz: 0, track: false, t: 0, maxT: 1, d0: 1, z0: 0, seed: 0, data: null });

  const GENERIC = { frames: 'magic_missile', fps: 12, scale: 1.1, tint: [1.2, 1.2, 1.6], emit: 2.2, pal: PAL.mana, light: { col: PAL.mana.lt, radius: 260, int: 0.8 }, trail: { pal: PAL.mana, rate: 40, size: [8, 14] } };

  // ---------------------------------------------------------------------------------------------------------------- basic attack defs
  const mm = (pal, t, sc) => ({ frames: 'magic_missile', fps: 14, scale: sc || 1.1, tint: t, emit: 2.4, pal, light: { col: pal.lt, radius: 240, int: 0.8 }, trail: { pal, rate: 50, size: [8, 14] } });
  const ATK = {
    lina: { frames: 'fireball', fps: 14, scale: 1.1, tint: [1.4, 1.1, 0.9], emit: 2.6, pal: PAL.fire, light: { col: PAL.fire.lt, radius: 320, int: 1.1, elem: 'E' }, trail: { pal: PAL.fire, rate: 70, size: [10, 18], up: 30, stamp: 'p_ember' }, spin: 0 },
    sniper: { frames: 'bullet', fps: 20, scale: 1.8, tint: [1.8, 1.6, 1.2], emit: 3.5, pal: PAL.sun, light: { col: PAL.sun.lt, radius: 160, int: 0.6 }, trail: { pal: PAL.sun, rate: 90, size: [4, 8], life: [0.1, 0.22], spread: 1 } },
    drow_ranger: { frames: 'arrow_frost', fps: 12, scale: 1.1, tint: [1.2, 1.5, 2], emit: 2.2, pal: PAL.ice, light: { col: PAL.ice.lt, radius: 230, int: 0.7, elem: 'Q' }, trail: { pal: PAL.ice, rate: 55, size: [6, 11], stamp: 'p_snow' } },
    lion: mm(PAL.dark, [1.3, 0.7, 1.8]),
    crystal_maiden: mm(PAL.ice, [0.8, 1.4, 2]),
    zuus: mm(PAL.volt, [1.2, 1.4, 2.2]),
    invoker_forged_spirit: { frames: 'fireball', fps: 14, scale: 0.8, tint: [1.3, 1, 0.8], emit: 2.4, pal: PAL.fire, light: { col: PAL.fire.lt, radius: 230, int: 0.8, elem: 'E' }, trail: { pal: PAL.fire, rate: 50, size: [8, 14], stamp: 'p_ember' } },
    siege: null, tower: null, fountain: null, creep_ranged: null, // built per team below
  };
  const teamDefs = {};
  for (const [name, team] of [['r', 0], ['d', 1]]) {
    const pal = team === 0 ? PAL.sun : PAL.blood;
    teamDefs['creep_ranged_' + team] = { frames: 'creep_ranged_' + name, fps: 10, scale: 1.2, tint: [1.2, 1.2, 1.2], emit: 2.2, pal, light: { col: pal.lt, radius: 190, int: 0.5 }, trail: { pal, rate: 30, size: [5, 9] } };
    const tp = team === 0 ? PAL.gold : PAL.arc;
    teamDefs['tower_' + team] = { frames: 'tower_' + name, fps: 10, scale: 1.4, tint: [1.3, 1.3, 1.3], emit: 2.6, pal: tp, light: { col: tp.lt, radius: 360, int: 1.2 }, trail: { pal: tp, rate: 70, size: [10, 18], up: 20 } };
  }
  const ORBDEF = {};
  for (const ch of ['Q', 'W', 'E']) {
    const pal = ch === 'Q' ? PAL.ice : ch === 'W' ? PAL.arc : PAL.fire;
    ORBDEF[ch] = { frames: 'invoker_orb_' + ch.toLowerCase(), fps: 12, scale: 1.4, tint: [1.4, 1.4, 1.4], emit: 3, pal, light: { col: pal.lt, radius: 300, int: 1, elem: ch }, trail: { pal, rate: 80, size: [8, 14] } };
  }
  function atkDef(k, su) {
    if (k === 'invoker') { const o = su && su.orbs ? su.orbs[su.orbs.length - 1] : 'Q'; return ORBDEF[(o || 'Q').toUpperCase()] || ORBDEF.Q; }
    const team = su && su.team === 1 ? 1 : 0;
    if (k === 'creep_ranged') return teamDefs['creep_ranged_' + team];
    if (k === 'tower' || k === 'siege' || k === 'fountain') return teamDefs['tower_' + team];
    return ATK[k] || R.projs.get(k) || GENERIC;
  }

  // ---------------------------------------------------------------------------------------------------------------- lifecycle
  function alloc() { const p = pool.pop(); if (!p) return null; p.alive = true; live.push(p); return p; }
  function release(p) { p.alive = false; p.data = null; if (p.id) byId.delete(p.id); p.id = ''; }

  function launch(def, key, id, sx, sy, sz, tid, sid, ex, ey, ez, sp, track, maxExtra) {
    const p = alloc(); if (!p) return null;
    p.def = def; p.key = key; p.id = id || ''; p.frames = def.frames ? framesOf(c, def.frames) : null;
    p.x = sx; p.y = sy; p.z = sz; p.z0 = sz; p.tid = tid || ''; p.sid = sid || ''; p.track = track; p.tx = ex; p.ty = ey; p.tz = ez; p.sp = sp > 0 ? sp : 900;
    p.t = 0; p.seed = Math.random() * 100; p.data = null;
    const dx = ex - sx, dy = ey - sy, dz = ez - sz, d = Math.hypot(dx, dy, dz) || 1;
    p.dx = dx / d; p.dy = dy / d; p.dz = dz / d; p.d0 = Math.max(1, Math.hypot(dx, dy));
    p.maxT = d / p.sp + (maxExtra == null ? 1.2 : maxExtra);
    if (id) byId.set(id, p);
    if (def.start) def.start(c, p);
    return p;
  }

  function impact(p) {
    const def = p.def;
    if (def.hit) def.hit(c, p);
    else defaultHit(p);
    release(p);
  }
  function defaultHit(p) {
    const pal = p.def.pal || PAL.mana;
    c.sparks(p.x, p.y, p.z, pal, { count: 8, life: [0.15, 0.4], speed: [60, 200], size0: [6, 10] });
    P.burst({ x: p.x, y: p.y, z: p.z, count: 2, life: [0.12, 0.2], size0: 22, size1: 34, col0: pal.hot, col1: pal.mid, a0: 1, a1: 0, mode: 'glow', noScale: true });
    c.glow(p.x, p.y, p.z, pal.lt, 260, 1.2, 0.25, { mode: 'fade' });
  }

  const _tint = [1, 1, 1];
  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      if (!p.alive) { live[i] = live[live.length - 1]; live.pop(); pool.push(p); continue; }
      const def = p.def;
      p.t += dt;
      if (p.track) {
        const tu = c.unit(p.tid);
        if (tu) { p.tx = tu.x; p.ty = tu.y; p.tz = (def.zEnd != null ? (tu.z || 0) + def.zEnd : c.chest(tu)); }
      }
      let dx = p.tx - p.x, dy = p.ty - p.y, dz = p.tz - p.z;
      const dist = Math.hypot(dx, dy, dz), step = p.sp * dt;
      let done = false;
      if (dist <= step + 8) { p.x = p.tx; p.y = p.ty; p.z = p.tz; done = true; }
      else {
        const inv = 1 / dist; p.dx = dx * inv; p.dy = dy * inv; p.dz = dz * inv;
        p.x += p.dx * step; p.y += p.dy * step;
        const k = 1 - Math.min(1, Math.hypot(p.tx - p.x, p.ty - p.y) / p.d0);
        const base = p.z0 + (p.tz - p.z0) * k, arc = def.arc ? def.arc * 4 * k * (1 - k) : 0;
        p.z = base + arc;
        // direction includes the arc slope so the sprite tips along the flight path
        if (def.arc) p.dz = (p.tz - p.z0) / p.d0 + def.arc * 4 * (1 - 2 * k) / p.d0;
      }
      if (p.t > p.maxT) done = true;
      const vis = c.vis(p.x, p.y);
      if (vis) {
        const f = p.frames;
        if (f && f.length) {
          const fr = f[(p.t * (def.fps || 10) | 0) % f.length];
          const t = def.tint || _tint;
          Q_put(p, fr, t, def);
        }
        const tr = def.trail;
        if (tr) { if (typeof tr === 'function') tr(c, p, dt); else trail(tr, p, dt); }
        const lt = def.light;
        if (lt) c.lightNow(p.x, p.y, p.z + 6, lt.col, lt.radius, lt.int * (lt.elem ? elemMul(lt.elem, c.T, p.seed) : 1), 0);
        if (def.tick) def.tick(c, p, dt);
      }
      if (done) impact(p);
    }
  }
  const Q = c.Q;
  function Q_put(p, fr, t, def) {
    Q.put(p.x, p.y, p.z, fr, def.scale || 1, t[0], t[1], t[2], 1, def.emit == null ? 2 : def.emit, p.dx, p.dy, p.dz, def.spin ? p.t * def.spin : 0, false, def.bright == null ? 1 : def.bright);
  }
  function trail(tr, p, dt) {
    const n = c.n((tr.rate || 40) * dt); if (!n) return;
    const pal = tr.pal || PAL.mana, sp = tr.spread == null ? 5 : tr.spread;
    for (let i = 0; i < n; i++) {
      const a = Math.random(); // distribute along this frame's travel for a continuous streak
      P.spawn({ x: p.x - p.dx * p.sp * dt * a + rnd(-sp, sp), y: p.y - p.dy * p.sp * dt * a + rnd(-sp, sp), z: p.z - p.dz * p.sp * dt * a + rnd(-sp, sp) * 0.5,
        life: tr.life || [0.25, 0.55], size0: tr.size || [8, 14], size1: 2, col0: pal.hot, col1: pal.low, a0: tr.a0 || 0.8, a1: 0, mode: 'glow', stamp: tr.stamp, vel: [0, 0, 0], speed: [0, 12], up: tr.up || 0, gravity: tr.grav || 0, drag: 2 });
    }
  }

  // ---------------------------------------------------------------------------------------------------------------- event entry points
  return {
    update,
    /** EV.ATK with k != '' */
    atk(ev, su, tu) {
      if (!su || !tu) return;
      const def = atkDef(ev.k, su);
      if (!def || !c.vis(su.x, su.y) && !c.vis(tu.x, tu.y)) return;
      const sz = c.chest(su);
      const off = su.kind === 'tower' ? 0 : 26, f = su.facing || 0;
      launch(def, ev.k, '', su.x + Math.cos(f) * off, su.y + Math.sin(f) * off, sz, tu.id, su.id, tu.x, tu.y, c.chest(tu), ev.sp, true, 0.8);
    },
    /** EV.PROJ */
    start(ev, su, tu) {
      const def = R.projs.get(ev.k) || GENERIC;
      const x = ev.x != null ? ev.x : su ? su.x : 0, y = ev.y != null ? ev.y : su ? su.y : 0;
      const sz = su ? c.chest(su) : c.zAt(x, y) + 80;
      let ex, ey, ez, track = false;
      if (ev.t && tu) { ex = tu.x; ey = tu.y; ez = c.chest(tu); track = true; }
      else if (ev.x2 != null) { ex = ev.x2; ey = ev.y2; ez = (def.z != null ? c.zAt(ex, ey) + def.z : sz); }
      else { ex = x; ey = y; ez = sz; }
      const z = def.z != null && !track ? c.zAt(x, y) + def.z : sz;
      const p = launch(def, ev.k, ev.id, x, y, z, ev.t, ev.s, ex, ey, ez, ev.sp, track, 1.2);
      if (p) p.data = ev;
    },
    end(id) {
      const p = byId.get(id); if (!p) return;
      if (p.track) { p.x = p.tx; p.y = p.ty; p.z = p.tz; }
      impact(p);
    },
    /** Spawn a projectile from a hero module directly. */
    fire(def, sx, sy, sz, ex, ey, ez, sp, tid) { return launch(def, def.key || '', '', sx, sy, sz, tid, '', ex, ey, ez, sp, !!tid, 0.8); },
    framesOf: (b) => framesOf(c, b),
    get liveCount() { return live.length; },
  };
}
