// Offline render sandbox: mock units walking the lanes, real towers / barracks / ancients, day-night toggle, particle demos.
// FX demo keys (fxdemo.js): 1-9,0 next spell of hero N, C cycle all spells, I items, M basic-attack projectiles, window.__fx.all().
// Keys: WASD / screen edge pan, wheel zoom, N day/night, 1-4 particle demos at the cursor, F fog, B bloom, P pixel scale, L lane tour, click select.
import { loadSheets } from './art/atlas.js';
import { createRenderer } from './render/index.js';
import { getMap, heightAt } from '../../shared/map.js';
import { LANES } from '../../shared/data/lanes.js';
import { ST } from '../../shared/protocol.js';
import { installFxDemo } from './fxdemo.js';

const canvas = document.getElementById('game');
const hud = document.getElementById('hud');
const sheets = await loadSheets();
const r = createRenderer({ canvas, sheets });
window.r = r;
r.setSetting('devZoom', true);
const resize = () => r.resize(innerWidth, innerHeight);
addEventListener('resize', resize); resize();
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------------------------------------------------------------------------------
// mock world
const map = getMap();
const units = new Map();
let nid = 1;
function mk(o) {
  const u = { id: 'u' + nid++, kind: 'creep', key: '', team: 0, owner: '', x: 0, y: 0, facing: 0, anim: 'idle', animSeq: 0, animRate: 1, hp: 100, maxHp: 100, mana: 0, maxMana: 0, level: 1, status: 0, z: 0, animTime: 0, visible: true, ...o };
  u.z = heightAt(u.x, u.y); units.set(u.id, u); return u;
}
function setAnim(u, a) { if (u.anim !== a) { u.anim = a; u.animSeq = (u.animSeq + 1) & 0xffff; u.animTime = 0; } }

// buildings from the real map entities
const tn = (name) => (/good/.test(name) ? 0 : 1);
for (const e of map.ents.tower) mk({ kind: 'tower', key: 'npc_' + e.name.replace(/^dota_/, 'dota_'), team: tn(e.name), x: e.x, y: e.y, hp: 1800, maxHp: 1800 });
for (const e of map.ents.barracks) mk({ kind: 'rax', key: /range/.test(e.name) ? 'ranged_rax' : 'melee_rax', team: tn(e.name), x: e.x, y: e.y, hp: 1300, maxHp: 1300 });
for (const e of map.ents.fort) mk({ kind: 'ancient', key: 'fort', team: tn(e.name), x: e.x, y: e.y, hp: 4500, maxHp: 4500 });
for (const e of map.ents.fountain) mk({ kind: 'fountain', key: 'fountain', team: tn(e.name), x: e.x, y: e.y, hp: 500, maxHp: 500 });

// heroes
const HEROES = [[0, 'sven'], [0, 'lina'], [0, 'crystal_maiden'], [0, 'sniper'], [0, 'axe'], [1, 'zuus'], [1, 'lion'], [1, 'drow_ranger'], [1, 'juggernaut'], [1, 'invoker']];
const mid = LANES.mid;
const heroes = HEROES.map(([team, short], i) => {
  const p = mid[team === 0 ? 3 : 5];
  const u = mk({ kind: 'hero', key: 'npc_dota_hero_' + short, team, x: p[0] + (i % 5) * 70 - 140, y: p[1] + (team ? 90 : -90) + ((i * 37) % 60), hp: 600, maxHp: 600, mana: 300, maxMana: 400, level: 6 });
  Object.assign(u, { goal: null, state: 'idle', st: 0.5 + i * 0.3, short });
  return u;
});
const myHero = heroes[0];

// creep waves
const waves = { t: 0 };
function spawnWave() {
  for (const lane of ['top', 'mid', 'bot']) for (const team of [0, 1]) {
    const path = team === 0 ? LANES[lane] : LANES[lane].slice().reverse();
    for (let k = 0; k < 4; k++) {
      const ranged = k === 3;
      const u = mk({ kind: 'creep', key: `npc_dota_creep_${team ? 'bad' : 'good'}guys_${ranged ? 'ranged' : 'melee'}`, team, x: path[0][0] + k * 30 - 45 + (team ? 0 : 0), y: path[0][1] + k * 20, hp: 160, maxHp: 160 });
      Object.assign(u, { path, wp: 1, range: ranged ? 330 : 90, spd: 190 });
    }
  }
}
spawnWave();

const demoAnim = { hit: (u, d) => r.fx([{ e: 'hit', t: u.id, d, ty: 'phys', c: d > 30 }]) };

function stepUnits(dt) {
  waves.t += dt; if (waves.t > 12) { waves.t = 0; spawnWave(); }
  const list = Array.from(units.values());
  for (const u of list) {
    u.animTime += dt;
    if (u.kind === 'creep') {
      if (u.status & ST.DEAD) { u.dead = (u.dead || 0) + dt; if (u.dead > 2.6) units.delete(u.id); continue; }
      let foe = null, fd = u.range;
      for (const o of list) { if (o.team === u.team || o.kind === 'fountain' || (o.status & ST.DEAD)) continue; if (o.kind !== 'creep' && o.kind !== 'hero') continue; const d = Math.hypot(o.x - u.x, o.y - u.y); if (d < fd) { fd = d; foe = o; } }
      if (foe) {
        u.facing = Math.atan2(foe.y - u.y, foe.x - u.x); setAnim(u, 'attack');
        u.cd = (u.cd || 0) - dt;
        if (u.cd <= 0) { u.cd = 1; foe.hp -= 22; demoAnim.hit(foe, 22 | 0); if (foe.hp <= 0) { foe.hp = 0; foe.status |= ST.DEAD; setAnim(foe, 'dead'); r.fx([{ e: 'death', t: foe.id }]); } }
      } else {
        const wp = u.path[Math.min(u.wp, u.path.length - 1)];
        const dx = wp[0] - u.x, dy = wp[1] - u.y, d = Math.hypot(dx, dy);
        if (d < 60) { if (u.wp < u.path.length - 1) u.wp++; else { units.delete(u.id); } continue; }
        u.facing = Math.atan2(dy, dx); setAnim(u, 'walk');
        u.x += (dx / d) * u.spd * dt; u.y += (dy / d) * u.spd * dt;
      }
      u.z = heightAt(u.x, u.y);
    } else if (u.kind === 'hero') {
      if (window.__calm) { u.st = 99; u.state = 'idle'; u.hp = u.maxHp; u.status &= ~ST.DEAD; u.z = heightAt(u.x, u.y); continue; }
      u.st -= dt;
      if (u.state === 'walk') {
        const dx = u.goal[0] - u.x, dy = u.goal[1] - u.y, d = Math.hypot(dx, dy);
        if (d < 25) { u.state = 'idle'; u.st = 0.6 + Math.random(); setAnim(u, 'idle'); }
        else { u.facing = Math.atan2(dy, dx); u.x += (dx / d) * 300 * dt; u.y += (dy / d) * 300 * dt; setAnim(u, 'walk'); }
      } else if (u.st <= 0) {
        const c = Math.random();
        if (c < 0.45) { const p = mid[1 + ((Math.random() * (mid.length - 2)) | 0)]; u.goal = [p[0] + (Math.random() - 0.5) * 400, p[1] + (Math.random() - 0.5) * 400]; u.state = 'walk'; }
        else if (c < 0.7) { u.state = 'idle'; setAnim(u, 'attack'); u.st = 0.7; u.facing += Math.random(); }
        else if (c < 0.9) { u.state = 'idle'; setAnim(u, 'cast'); u.st = 0.9; castDemo(u); }
        else { u.state = 'idle'; setAnim(u, 'stunned'); u.st = 1.3; u.status |= ST.STUN; later(() => { u.status &= ~ST.STUN; }, 1.3); }
      } else if (u.state === 'idle' && u.anim !== 'idle' && u.anim !== 'stunned' && u.st < 0.1) setAnim(u, 'idle');
      u.z = heightAt(u.x, u.y);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// particle demos (all with lights through r.hooks)
const fxLights = [];
const addTimedLight = (l, dur) => fxLights.push({ ...l, t: 0, dur });
r.hooks.push((dt) => {
  for (let i = fxLights.length - 1; i >= 0; i--) {
    const l = fxLights[i]; l.t += dt;
    if (l.t > l.dur) { fxLights.splice(i, 1); continue; }
    const k = 1 - l.t / l.dur;
    r.lights.add({ ...l, intensity: l.intensity * (l.decay === false ? 1 : k) });
  }
});
const timers = [];
const later = (fn, sec) => timers.push({ fn, t: sec });
r.hooks.push((dt) => { for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } } });
const projectiles = [];
r.hooks.push((dt) => {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]; p.t += dt;
    const k = Math.min(1, p.t / p.dur);
    const x = p.x0 + (p.x1 - p.x0) * k, y = p.y0 + (p.y1 - p.y0) * k, z = heightAt(x, y) + 40 + Math.sin(k * Math.PI) * 50;
    p.em.set(x, y, z);
    r.lights.add({ x, y, z, r: 1, g: 0.55, b: 0.18, radius: 380, intensity: 1.5, flicker: 0.3 });
    if (k >= 1) { p.em.stop(); projectiles.splice(i, 1); p.done(x, y); }
  }
});

function fireball(x0, y0, x1, y1) {
  const dur = Math.hypot(x1 - x0, y1 - y0) / 900 + 0.05;
  const em = r.particles.emitter({ x: x0, y: y0, z: heightAt(x0, y0) + 40, rate: 140, life: [0.35, 0.7], size0: [22, 34], size1: 4, col0: [4, 2.2, 0.6], col1: [1.2, 0.2, 0.05], a0: 1, a1: 0, speed: [10, 40], drag: 2, up: 30, mode: 'glow', shape: 'sphere', radius: 8 });
  const em2 = r.particles.emitter({ x: x0, y: y0, z: heightAt(x0, y0) + 40, rate: 40, life: [0.4, 0.9], size0: 10, size1: 2, col0: [5, 3, 1], col1: [1.5, 0.4, 0.1], a0: 1, a1: 0, speed: [30, 90], gravity: -120, drag: 1, stamp: 'p_ember', shape: 'sphere', radius: 6 });
  const em3 = { set(x, y, z) { em.set(x, y, z); em2.set(x, y, z); }, stop() { em.stop(); em2.stop(); } };
  projectiles.push({ x0, y0, x1, y1, t: 0, dur, em: em3, done(x, y) {
    const z = heightAt(x, y);
    r.particles.burst({ x, y, z: z + 20, count: 90, shape: 'sphere', radius: 20, life: [0.4, 1.0], size0: [30, 60], size1: 6, col0: [5, 2.6, 0.7], col1: [1.4, 0.25, 0.05], a0: 1, a1: 0, speed: [80, 360], drag: 3, up: 60, mode: 'glow' });
    r.particles.burst({ x, y, z: z + 10, count: 40, life: [0.8, 1.6], size0: [30, 50], size1: [60, 90], col0: [0.4, 0.34, 0.3], col1: [0.12, 0.1, 0.1], a0: 0.8, a1: 0, speed: [30, 140], drag: 1.5, up: 80, gravity: 40, mode: 'glow' });
    r.particles.burst({ x, y, z: z + 10, count: 36, life: [0.6, 1.4], size0: 9, size1: 3, col0: [6, 3.4, 1], col1: [2, 0.5, 0.1], a0: 1, a1: 0, speed: [160, 520], gravity: -520, drag: 0.8, up: 200, stamp: 'p_ember' });
    r.particles.burst({ x, y, z: z + 3, count: 26, shape: 'ring', radius: 40, life: [0.5, 0.8], size0: 16, size1: 40, col0: [3, 1.2, 0.3], col1: [1, 0.2, 0.05], a0: 1, a1: 0, speed: [260, 380], flat: true, drag: 3, mode: 'glow' });
    addTimedLight({ x, y, z: z + 60, r: 1, g: 0.5, b: 0.15, radius: 700, intensity: 3 }, 0.9);
  } });
}
function iceRing(x, y) {
  const z = heightAt(x, y);
  r.particles.burst({ x, y, z: z + 6, count: 160, shape: 'ring', radius: 8, life: [0.7, 1.2], size0: [18, 28], size1: 6, col0: [0.8, 2.4, 4], col1: [0.2, 0.7, 2], a0: 1, a1: 0, speed: [420, 480], flat: true, drag: 3.2, mode: 'glow' });
  r.particles.burst({ x, y, z: z + 6, count: 70, shape: 'ring', radius: 10, life: [0.8, 1.5], size0: [16, 26], size1: 10, col0: [1.5, 3, 4.5], col1: [0.4, 1, 2], a0: 1, a1: 0, speed: [200, 440], up: [60, 260], gravity: -300, drag: 1.5, stamp: 'p_shard_ice', spin: [-6, 6] });
  r.particles.burst({ x, y, z: z + 20, count: 50, shape: 'sphere', radius: 160, life: [1, 2.4], size0: 8, size1: 2, col0: [1.5, 2.6, 4], col1: [0.5, 1, 2], a0: 1, a1: 0, speed: [5, 30], gravity: -25, drag: 0.8, stamp: 'p_snow' });
  addTimedLight({ x, y, z: z + 40, r: 0.35, g: 0.7, b: 1, radius: 780, intensity: 2.4 }, 1.6);
}
function lightning(x0, y0, x1, y1) {
  const z0 = heightAt(x0, y0) + 70, z1 = heightAt(x1, y1) + 10, n = 5;
  r.particles.burst({ x: x0, y: y0, z: z0, x2: x1, y2: y1, z2: z1, count: 260, shape: 'line', life: [0.12, 0.34], size0: [14, 26], size1: 4, col0: [3.4, 3.8, 5], col1: [0.8, 1, 3], a0: 1, a1: 0, speed: [0, 40], mode: 'glow' });
  r.particles.burst({ x: x0, y: y0, z: z0, x2: x1, y2: y1, z2: z1, count: 44, shape: 'line', life: [0.1, 0.25], size0: [28, 40], size1: 20, col0: [5, 5.5, 6], col1: [2, 2.5, 5], a0: 1, a1: 0, stamp: 'p_bolt_' + ((Math.random() * 3) | 0), speed: [0, 20], rot: [0, 6.28] });
  r.particles.burst({ x: x1, y: y1, z: z1 + 4, count: 40, shape: 'sphere', radius: 10, life: [0.2, 0.55], size0: 10, size1: 2, col0: [4, 4.4, 6], col1: [1, 1.4, 4], a0: 1, a1: 0, speed: [90, 330], gravity: -300, drag: 1, stamp: 'p_spark' });
  for (let i = 0; i <= n; i++) { const k = i / n; addTimedLight({ x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, z: z0 + (z1 - z0) * k + 20, r: 0.6, g: 0.75, b: 1, radius: 480, intensity: 2 }, 0.32); }
}
function sunStrike(x, y) {
  const z = heightAt(x, y);
  r.particles.burst({ x, y, z: z + 4, count: 40, shape: 'ring', radius: 90, life: [1.2, 1.4], size0: 16, size1: 8, col0: [3, 2.2, 0.4], col1: [2, 1.2, 0.2], a0: 1, a1: 0.6, speed: [0, 3], flat: true, mode: 'glow' });
  later(() => {
    r.particles.burst({ x, y, z: z + 2, count: 420, shape: 'disc', radius: 60, life: [0.5, 1.1], size0: [26, 44], size1: 14, col0: [6, 5, 2.2], col1: [2.6, 1.4, 0.3], a0: 1, a1: 0, speed: [0, 22], up: [700, 2300], drag: 1.4, mode: 'glow' });
    r.particles.burst({ x, y, z: z + 6, count: 60, shape: 'ring', radius: 70, life: [0.4, 0.9], size0: 22, size1: 50, col0: [5, 3, 0.8], col1: [1.5, 0.6, 0.1], a0: 1, a1: 0, speed: [300, 520], flat: true, drag: 3, mode: 'glow' });
    r.particles.burst({ x, y, z: z + 6, count: 40, life: [0.6, 1.4], size0: 10, size1: 3, col0: [6, 4.4, 1.4], col1: [2, 0.8, 0.1], a0: 1, a1: 0, speed: [100, 420], gravity: -420, up: 260, drag: 0.9, stamp: 'p_ember' });
    addTimedLight({ x, y, z: z + 220, r: 1, g: 0.85, b: 0.4, radius: 1000, intensity: 3.4, decay: true }, 1.3);
    r.fx([{ e: 'hit', t: nearest(x, y), d: 150, ty: 'pure' }]);
  }, 1.1);
  addTimedLight({ x, y, z: z + 40, r: 1, g: 0.8, b: 0.3, radius: 300, intensity: 0.9, decay: false }, 1.1);
}
function castDemo(u) {
  const a = u.facing, d = 380;
  const tx = u.x + Math.cos(a) * d, ty = u.y + Math.sin(a) * d;
  if (u.short === 'lina' || u.short === 'sven') fireball(u.x, u.y, tx, ty);
  else if (u.short === 'crystal_maiden') iceRing(u.x, u.y);
  else if (u.short === 'zuus' || u.short === 'lion') lightning(u.x, u.y, tx, ty);
  else sunStrike(tx, ty);
}
function nearest(x, y) { let best = '', bd = 1e9; for (const u of units.values()) { if (u.kind === 'creep' || u.kind === 'hero') { const d = Math.hypot(u.x - x, u.y - y); if (d < bd) { bd = d; best = u.id; } } } return best; }

// ---------------------------------------------------------------------------------------------------------------------------------------
// input
const keys = new Set();
const mouse = { x: innerWidth / 2, y: innerHeight / 2, in: false };
let tour = false, tourT = 0;
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase(); keys.add(k);
  const g = r.pick(mouse.x, mouse.y);
  if (k === 'n') view.night = !view.night;
  else if (k === 'f') r.setSetting('fog', !r.settings.fog);
  else if (k === 'b') r.setSetting('bloom', !r.settings.bloom);
  else if (k === 'p') r.setSetting('pixelScale', r.settings.pixelScale >= 3 ? 1 : r.settings.pixelScale + 1);
  else if (k === 'l') { tour = !tour; tourT = 0; }
  else if (k === ' ') r.snapTarget(myHero.x, myHero.y);
  else if (k === 'g') r.fog.revealAll(!revealed), revealed = !revealed;
});
let revealed = false;
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
canvas.addEventListener('wheel', (e) => { e.preventDefault(); r.zoom(Math.sign(e.deltaY) * 3); }, { passive: false });
addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true; });
document.addEventListener('mouseleave', () => { mouse.in = false; });
canvas.addEventListener('mousedown', (e) => {
  const p = r.pick(e.clientX, e.clientY);
  r.setSelected(p.unitId || '');
  if (p.unitId) { const u = units.get(p.unitId); sel = u; }
});
let sel = null;
installFxDemo({ r, units, mouse, myHero, heightAt });

// ---------------------------------------------------------------------------------------------------------------------------------------
// loop
const view = { time: 0, night: false, myTeam: 0, myHeroId: myHero.id, treesDown: new Set(), units: [] };
// cut a few trees around the mid lane so stumps show up
{ const t = map.trees; for (let i = 0; i < t.length; i += 53) view.treesDown.add(i); }
r.snapTarget(-5200, -4700);
let last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 0;

function step(dt) {
  view.time += dt;
  stepUnits(dt);
  view.units = Array.from(units.values());
  // camera
  const sp = 1500 * dt;
  if (keys.has('w') || keys.has('arrowup')) r.rig.pan(0, sp);
  if (keys.has('s') || keys.has('arrowdown')) r.rig.pan(0, -sp);
  if (keys.has('a') || keys.has('arrowleft')) r.rig.pan(-sp, 0);
  if (keys.has('d') || keys.has('arrowright')) r.rig.pan(sp, 0);
  if (mouse.in && !tour) r.rig.edgePan(mouse.x / innerWidth, mouse.y / innerHeight, dt);
  if (tour) {
    tourT += dt * 0.07;
    const path = LANES.top.concat(LANES.mid.slice().reverse(), LANES.bot);
    const f = (tourT % 1) * (path.length - 1), i = Math.floor(f), a = path[i], b = path[Math.min(i + 1, path.length - 1)];
    r.setTarget(a[0] + (b[0] - a[0]) * (f - i), a[1] + (b[1] - a[1]) * (f - i));
  }
  r.update(view, dt);
}
window.__frame = (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) step(dt); return r.stats; };
window.__bench = (n = 60) => {
  const g = r.gl.getContext(); const t0 = performance.now(); let cpu = 0;
  for (let i = 0; i < n; i++) { step(1 / 60); cpu += r.stats.cpuMs; }
  g.finish(); const wall = (performance.now() - t0) / n;
  return { frames: n, cpuMsPerFrame: +(cpu / n).toFixed(2), wallMsPerFrame: +wall.toFixed(2), fps: +(1000 / wall).toFixed(1), rt: r.stats.rt, sprites: r.stats.sprites, lights: r.stats.lights, tris: r.stats.tris, spawned: r.stats.spawned };
};
window.__pause = false;
window.__units = units; window.__view = view; window.__demo = { fireball, iceRing, lightning, sunStrike };

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  if (!window.__pause) step(dt); // __pause = true freezes the sim (for screenshots); __frame() still steps manually
  const s = r.stats;
  hud.textContent = `${fps.toFixed(0)} fps  cpu ${s.cpuMs.toFixed(1)}ms  rt ${s.rt}  ${view.night ? 'night' : 'day'}\n` +
    `units ${s.units}  trees ${s.trees}  sprites ${s.sprites}  lights ${s.lights}  chunks ${s.chunks}  tris ${s.tris}\n` +
    `particles spawned ${s.spawned}  fog ${r.fog.state.castMs.toFixed(2)}ms (${r.fog.state.sources} src)` + (sel ? `\nselected ${sel.key} hp ${Math.round(sel.hp)}` : '');
}
requestAnimationFrame(frame);
