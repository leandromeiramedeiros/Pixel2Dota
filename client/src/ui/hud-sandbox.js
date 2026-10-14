// HUD sandbox: the real HUD + input over a dark canvas, driven by a mock match state and a mock renderer. /hud-sandbox.html?hero=invoker|sven|lina...&t=<clock>
import { loadSheets } from '../art/atlas.js';
import { createHud } from './hud.js';
import { createInput } from '../input.js';
import { DATA } from '../../../shared/data.js';
import { HEROES, HERO_KEYS } from '../../../shared/heroes.js';
import { TEAM, KIND, EV, MSG } from '../../../shared/protocol.js';
import { XP_TABLE } from '../../../shared/constants.js';

const q = new URLSearchParams(location.search);
const heroKey = HERO_KEYS.find((k) => HEROES[k].short === (q.get('hero') || 'sven')) || HERO_KEYS[1];
const logEl = document.getElementById('log');
const logLines = [];
const log = (s) => { logLines.push(s); if (logLines.length > 9) logLines.shift(); logEl.textContent = logLines.join('\n'); };

const sheets = await loadSheets();
const canvas = document.getElementById('game');
const hudRoot = document.getElementById('hud');
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ------------------------------------------------------------------ mock state
const players = new Map(), units = new Map();
const FOUNT = { [TEAM.RADIANT]: { x: -7100, y: -6600 }, [TEAM.DIRE]: { x: 6900, y: 6400 } };
const mkAbility = (key, level) => {
  const d = DATA.abilities[key];
  const i = Math.max(0, level - 1);
  return { key, level, cd: 0, cdMax: d && d.cooldown ? d.cooldown[Math.min(i, d.cooldown.length - 1)] : 0, mana: d && d.manaCost ? d.manaCost[Math.min(i, d.manaCost.length - 1)] : 0, flags: 0 };
};
function mkHero(key, team, id, extra = {}) {
  const d = DATA.heroes[key], H = HEROES[key];
  const lvl = extra.level || 1;
  const u = {
    id, kind: KIND.HERO, key, team, owner: id, x: FOUNT[team].x + (Math.random() - 0.5) * 600, y: FOUNT[team].y + (Math.random() - 0.5) * 600, facing: 0, anim: 'idle',
    hp: d.hp + d.str * 22 * 0.8, maxHp: d.hp + d.str * 22, mana: (d.mana + d.int * 12) * 0.6, maxMana: d.mana + d.int * 12, level: lvl, status: 0, ms: d.ms,
    xp: XP_TABLE[lvl - 1] + 150, str: d.str, agi: d.agi, int: d.int, dmgMin: d.dmgMin, dmgMax: d.dmgMax, dmgBonus: 0, armor: d.armor + d.agi / 6, atkRate: 1.7, atkRange: d.atkRange,
    skillPoints: 0, respawn: 0, orbs: '',
    abilities: H.abilities.map((k) => mkAbility(k, 0)), items: Array.from({ length: 6 }, () => ({ key: '', charges: 0, cd: 0, cdMax: 0 })), buffs: [],
    ...extra,
  };
  units.set(id, u);
  return u;
}
const others = HERO_KEYS.filter((k) => k !== heroKey);
let n = 0;
players.set('me', { sid: 'me', name: 'Leandro', team: TEAM.RADIANT, slot: 0, hero: heroKey, isBot: false, isHost: true, connected: true, heroId: 'h_me', gold: 1830, kills: 3, deaths: 1, assists: 4, lh: 62, dn: 7 });
const me = mkHero(heroKey, TEAM.RADIANT, 'h_me', { level: 8 });
for (let t = 0; t < 2; t++) {
  for (let s = 0; s < 5; s++) {
    if (t === 0 && s === 0) continue;
    const key = others[n++ % others.length], sid = `b${t}${s}`;
    const u = mkHero(key, t, 'h_' + sid, { level: 4 + ((s * 3 + t) % 9) });
    if (t === 1 && s === 2) { u.respawn = 23.4; u.hp = 0; u.status |= 4096; }
    if (t === 0 && s === 3) u.hp = u.maxHp * 0.35;
    players.set(sid, { sid, name: 'Bot ' + (n), team: t, slot: s, hero: key, isBot: true, isHost: false, connected: true, heroId: u.id, gold: 900 + n * 311, kills: (n * 2) % 7, deaths: n % 4, assists: (n * 3) % 9, lh: 20 + n * 9, dn: n % 6 });
  }
}
// my abilities
const inv = /invoker/.test(heroKey);
me.abilities.forEach((a, i) => {
  const d = DATA.abilities[a.key];
  if (inv) { if (i < 3) Object.assign(a, mkAbility(a.key, 3 + i)); else if (i === 5) Object.assign(a, mkAbility(a.key, 2)); }
  else if (i < 3) Object.assign(a, mkAbility(a.key, i === 0 ? 3 : 1 + (i === 2 ? 1 : 0)));
  else if (i === 3) Object.assign(a, mkAbility(a.key, 0));
  void d;
});
if (inv) { Object.assign(me.abilities[3], mkAbility('invoker_cold_snap', 1)); Object.assign(me.abilities[4], mkAbility('invoker_sun_strike', 1)); me.orbs = 'qqw'; }
me.skillPoints = inv ? 3 : 1;
const setItem = (i, key, charges = 0, cd = 0, cdMax = 0) => { me.items[i] = { key, charges, cd, cdMax }; };
setItem(0, 'item_boots'); setItem(1, 'item_blink', 0, 7.4, 15); setItem(2, 'item_tango', 3); setItem(3, 'item_magic_wand'); setItem(4, 'item_clarity', 2);
me.buffs = ['sven_warcry', 'item_tango'];
// world
let uid = 0;
const add = (kind, team, x, y, key = '', hp = 500) => { const id = 'u' + ++uid; units.set(id, { id, kind, key, team, x, y, hp, maxHp: hp, mana: 0, maxMana: 0, level: 1, status: 0, ms: 300, respawn: 0, abilities: [], items: [], buffs: [] }); return id; };
add(KIND.FOUNTAIN, TEAM.RADIANT, FOUNT[0].x, FOUNT[0].y, 'npc_dota_goodguys_fountain', 9000);
add(KIND.FOUNTAIN, TEAM.DIRE, FOUNT[1].x, FOUNT[1].y, 'npc_dota_badguys_fountain', 9000);
add(KIND.ANCIENT, TEAM.RADIANT, -6000, -5600, 'npc_dota_goodguys_fort', 4500);
add(KIND.ANCIENT, TEAM.DIRE, 5800, 5300, 'npc_dota_badguys_fort', 4500);
for (const [x, y] of [[-6200, -1800], [-1200, -1200], [-1800, -6100], [-3500, -3300], [-5200, -4400]]) add(KIND.TOWER, 0, x, y, 'npc_dota_goodguys_tower1', 1800);
for (const [x, y] of [[6000, 1900], [1500, 1200], [1900, 6000], [3600, 3200], [5000, 4300]]) add(KIND.TOWER, 1, x, y, 'npc_dota_badguys_tower1', 1800);
for (let i = 0; i < 16; i++) add(KIND.CREEP, i % 2, -2800 + i * 340 + (i % 2) * 120, -2700 + i * 330, i % 2 ? 'npc_dota_creep_badguys_melee' : 'npc_dota_creep_goodguys_melee', 550);
const state = { phase: 'game', code: 'SANDBOX', time: Number(q.get('t') ?? -25), night: q.get('night') === '1', winner: -1, players, units, treesDown: [] };
const enemyId = [...units.values()].find((u) => u.kind === KIND.CREEP && u.team === 1).id;

// ------------------------------------------------------------------ mock renderer
const cam = { x: me.x, y: me.y };
const W = () => canvas.clientWidth, Hh = () => canvas.clientHeight;
const renderer = {
  rig: { get visibleWidth() { return 2100 * (renderer._zoom || 1); }, get visibleHeight() { return 1190 * (renderer._zoom || 1); } },
  _zoom: 1,
  worldToScreen: (x, y) => ({ x: W() / 2 + (x - cam.x) * (W() / 2100) / (renderer._zoom || 1), y: Hh() / 2 - (y - cam.y) * (Hh() / 1374) / (renderer._zoom || 1) }),
  setTarget: (x, y) => { cam.x = x; cam.y = y; },
  getTarget: () => ({ x: cam.x, y: cam.y }),
  zoom: (d) => { renderer._zoom = Math.max(1, Math.min(1.12, (renderer._zoom || 1) + d * 0.03)); },
  setSelected: (id) => log('select ' + id), setHover: () => {},
  pick: (sx, sy) => ({ x: cam.x + (sx - W() / 2) * (2100 * (renderer._zoom || 1) / W()), y: cam.y - (sy - Hh() / 2) * (1374 * (renderer._zoom || 1) / Hh()), unitId: null }),
  fogGrid: () => null,
};

// ------------------------------------------------------------------ mock server
const send = (type, o) => {
  log(type + ' ' + JSON.stringify(o));
  if (type !== MSG.ORDER) { if (type === MSG.CHAT) hud.fx([{ e: EV.CHAT, name: 'Leandro', team: 0, text: o.text }]); return; }
  const p = players.get('me');
  if (o.t === 'buy') { const free = me.items.findIndex((i) => !i.key); const c = DATA.items[o.key].cost; if (free >= 0 && p.gold >= c) { p.gold -= c; me.items[free] = { key: o.key, charges: DATA.items[o.key].charges || 0, cd: 0, cdMax: 0 }; } }
  if (o.t === 'sell') { const it = me.items[o.slot]; if (it.key) { p.gold += Math.round(DATA.items[it.key].cost * 0.5); me.items[o.slot] = { key: '', charges: 0, cd: 0, cdMax: 0 }; } }
  if (o.t === 'swap') { const t = me.items[o.a]; me.items[o.a] = me.items[o.b]; me.items[o.b] = t; }
  if (o.t === 'learn') { const a = me.abilities[o.slot]; if (me.skillPoints > 0) { a.level++; me.skillPoints--; } }
  if (o.t === 'cast') { const a = me.abilities[o.slot]; a.cd = a.cdMax || 6; me.mana = Math.max(0, me.mana - a.mana); }
  if (o.t === 'item') { const it = me.items[o.slot]; const d = DATA.items[it.key]; if (d && d.cooldown) { it.cd = it.cdMax = d.cooldown; } }
};

const hud = createHud(hudRoot, { send, renderer, sheets });
const input = createInput({ canvas, renderer, send, hud, getState: () => state, mySid: 'me' });
void input;
window.__hud = { hud, input, state, send, renderer };

// ------------------------------------------------------------------ canvas backdrop + loop
function drawBackdrop() {
  const dpr = devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#16221b'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,.04)';
  for (let x = -9000; x < 9000; x += 600) { const a = renderer.worldToScreen(x, 0); g.beginPath(); g.moveTo(a.x, 0); g.lineTo(a.x, h); g.stroke(); }
  for (let y = -9000; y < 9000; y += 600) { const a = renderer.worldToScreen(0, y); g.beginPath(); g.moveTo(0, a.y); g.lineTo(w, a.y); g.stroke(); }
  units.forEach((u) => {
    const s = renderer.worldToScreen(u.x, u.y);
    if (s.x < -20 || s.y < -20 || s.x > w + 20 || s.y > h + 20) return;
    g.fillStyle = u.team === 0 ? '#58d96c' : '#ee5a4a';
    const r = u.kind === KIND.HERO ? 7 : u.kind === KIND.CREEP ? 3 : 10;
    g.fillRect(s.x - r, s.y - r, r * 2, r * 2);
  });
}
let last = performance.now(), simT = 0;
const frame = (now) => {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now; simT += dt;
  if (!q.has('freeze')) state.time += dt;
  for (const a of me.abilities) if (a.cd > 0) a.cd = Math.max(0, a.cd - dt);
  for (const it of me.items) if (it.cd > 0) it.cd = Math.max(0, it.cd - dt);
  if (me.mana < me.maxMana) me.mana = Math.min(me.maxMana, me.mana + dt * 3);
  units.forEach((u) => { if (u.respawn > 0) u.respawn = Math.max(0, u.respawn - dt); });
  drawBackdrop();
  hud.update(state, me, 'me', { myTeam: 0 });
};
requestAnimationFrame(frame);

// scripted events so the feed / chat / messages are populated
setTimeout(() => {
  hud.fx([
    { e: EV.KILL, killer: 'me', victim: 'b11', gold: 312 }, { e: EV.KILL, killer: 'b13', victim: 'b02', gold: 280 },
    { e: EV.CHAT, name: 'Bot 3', team: 0, text: 'gg push mid' }, { e: EV.CHAT, name: 'Bot 7', team: 1, text: 'noob team lol' },
    { e: EV.MSG, text: 'The first wave has spawned' }, { e: EV.GOLD, t: 'h_me', g: 64 },
  ]);
}, 100);
if (q.get('shop') === '1') hud.shop.open();
if (q.get('sb') === '1') hud.setScoreboard(true);
if (q.get('end') === '1') hud.fx([{ e: EV.END, winner: 0 }]);
if (q.get('sel') === '1') hud.select(enemyId);
if (q.get('cast') === '1') input.activate('ability', 0, {});
