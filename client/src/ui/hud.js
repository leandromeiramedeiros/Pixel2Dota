// HUD (DOM overlay). createHud(hudRoot, { send, renderer, sheets }) -> { update(state, myHeroUnit, mySid, view), fx(events), destroy(), ...input hooks }
// Input hooks used by input.js: setHandlers, setTargeting, setAim, message, toggleShop, closeShop, isShopOpen, isTyping, openChat, setScoreboard, select.
import { DATA } from '../../../shared/data.js';
import { MSG, ORDER, EV, KIND, TEAM, INV_SLOTS } from '../../../shared/protocol.js';
import { HEROES } from '../../../shared/heroes.js';
import { injectStyle, hudScale } from './style.js';
import {
  fmtClock, fmtCd, fmtRespawn, fmtGold, fmtNum, fmtRegen, fmtBar, clamp01, xpProgress, sweepDeg, prettyName, heroName, heroShort, heroRegen, dmgText, heroStats,
} from './format.js';
import { pixelEl, paintInto } from './pixels.js';
import { GLYPHS } from './glyphs.js';
import { PORTRAIT, portraitPhase, heroKeyLetters, ITEM_LETTERS, canLearn, pipCount, targetInfo, makeDepthFn, clipPolyNear, clipSegmentNear } from './targeting.js';
import { inShopRange, sellValue } from './shopdata.js';
import { createTooltip } from './tooltip.js';
import { createMinimap } from './minimap.js';
import { createShop } from './shop.js';
import { createScoreboard, createFeed, createMessages, createChat, createEnd, h, sizeU, faceEl } from './panels.js';

const teamCls = (t) => (t === TEAM.RADIANT ? 'rad' : t === TEAM.DIRE ? 'dire' : '');
const ORB_CLS = { q: 'q', w: 'w', e: 'e' };

/** unit.key -> display name (heroes, creeps, buildings). */
export function unitName(u) {
  if (!u) return '';
  if (u.kind === KIND.HERO) return heroName(u.key);
  let k = String(u.key || u.kind || '').replace(/^npc_dota_/, '').replace(/^creep_/, '').replace(/goodguys/, 'radiant').replace(/badguys/, 'dire');
  return k.split('_').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

export function createHud(hudRoot, { send, renderer, sheets }) {
  injectStyle();
  hudRoot.classList.add('h-root');
  const sheetsSafe = sheets || {};
  const icons = sheetsSafe.icons;

  // ---- tiny cached DOM setters
  const txt = (el, s) => { s = String(s); if (el._t !== s) { el._t = s; el.textContent = s; } };
  const sty = (el, p, v) => { const k = '_s' + p; if (el[k] !== v) { el[k] = v; el.style[p] = v; } };
  const cls = (el, c, on) => { on = !!on; const k = '_c' + c; if (el[k] !== on) { el[k] = on; el.classList.toggle(c, on); } };

  // ---- scale
  function applyScale() {
    const w = hudRoot.clientWidth || innerWidth, hh = hudRoot.clientHeight || innerHeight;
    hudRoot.style.setProperty('--u', hudScale(w, hh) + 'px');
    const dpr = window.devicePixelRatio || 1;
    ring.width = Math.round(w * dpr); ring.height = Math.round(hh * dpr);
    ring.style.width = w + 'px'; ring.style.height = hh + 'px';
    ringCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const ring = h('canvas', 'h-ring'); const ringCtx = ring.getContext('2d');
  hudRoot.append(ring);

  const tooltip = createTooltip(hudRoot, sheetsSafe);
  let handlers = { activate() {}, };
  let ctxState = { state: null, hero: null, mySid: '', myTeam: -1, time: 0 };
  let lastView = null;
  // Centre the camera on a unit (portrait clicks). Pure setTarget: no zoom change; the renderer applies its own free-playfield inset.
  function focusUnit(id) {
    if (!id || !renderer.setTarget) return;
    const v = lastView && lastView.units && lastView.units.find ? lastView.units.find((x) => x.id === id) : null;   // interpolated (what is on screen)
    const u = v || (ctxState.state ? ctxState.state.units.get(id) : null);
    if (u) renderer.setTarget(u.x, u.y);
  }

  const message = (t, warn) => msgs.show(t, warn);
  const msgs = createMessages(hudRoot);
  const feed = createFeed(hudRoot);
  const chat = createChat(hudRoot, { send });
  const sb = createScoreboard(hudRoot, { sheets: sheetsSafe });
  const end = createEnd(hudRoot);

  // ================================================================ top bar
  const top = h('div', 'h-top'); hudRoot.append(top);
  const specEl = h('div', 'h-spec h-panel', 'SPECTATING · both teams’ vision · move the camera with the minimap, screen edges or arrow keys');
  specEl.style.display = 'none'; hudRoot.append(specEl);
  let specOn = false, povPick = null, povMode = false, povLocked = false;
  const povMarks = [];   // spectator player-perspective: recent order clicks {x, y, id, t, at} (drawn on the ring canvas)
  const teamBoxes = { [TEAM.RADIANT]: h('div', 'h-team'), [TEAM.DIRE]: h('div', 'h-team') };
  const mid = h('div', 'h-mid h-panel');
  const scoreR = h('div', 'h-score rad', '0'), scoreD = h('div', 'h-score dire', '0');
  const clk = h('div', 'h-clk'); const clockT = h('b', null, '0:00'); const dn = h('div', 'h-dn');
  clk.append(clockT, dn); mid.append(scoreR, clk, scoreD);
  top.append(teamBoxes[TEAM.RADIANT], mid, teamBoxes[TEAM.DIRE]);
  const sunEl = sizeU(pixelEl(GLYPHS.sun, null, 1), 13), moonEl = sizeU(pixelEl(GLYPHS.moon, null, 1), 11);
  dn.append(sunEl);
  let topSig = '', tiles = [], wasNight = false;

  function buildTop(players) {
    for (const t of [TEAM.RADIANT, TEAM.DIRE]) teamBoxes[t].textContent = '';
    tiles = [];
    for (const p of players) {
      if (p.team !== TEAM.RADIANT && p.team !== TEAM.DIRE) continue;
      const el = h('div', 'h-hero ' + teamCls(p.team));
      const pt = h('div', 'h-pt'); pt.append(faceEl(sheetsSafe, p.hero, 24));
      const hpm = h('div', 'h-hpm'); const hpi = h('i'); hpm.append(hpi);
      const mpm = h('div', 'h-mpm'); const mpi = h('i'); mpm.append(mpi);
      const lv = h('div', 'h-lv', '1'); const dead = h('div', 'h-dead');
      el.append(pt, hpm, mpm, lv, dead);
      el.addEventListener('click', () => (povPick ? povPick(p) : focusUnit(p.heroId)));
      tooltip.bind(el, () => ({ type: 'text', title: p.name || heroName(p.hero), lines: [heroName(p.hero)] }));
      teamBoxes[p.team].append(el);
      tiles.push({ p, el, hpi, mpi, lv, dead });
    }
  }

  function updateTop(state, mySid) {
    const players = [];
    state.players.forEach((p) => players.push(p));
    players.sort((a, b) => (a.team - b.team) || (a.slot - b.slot));
    const sig = players.map((p) => p.sid + p.hero + p.team).join('|');
    if (sig !== topSig) { topSig = sig; buildTop(players); }
    let kr = 0, kd = 0;
    for (const p of players) { if (p.team === TEAM.RADIANT) kr += p.kills; else if (p.team === TEAM.DIRE) kd += p.kills; }
    txt(scoreR, kr); txt(scoreD, kd);
    txt(clockT, fmtClock(state.time));
    if (!!state.night !== wasNight || !dn.firstChild) { wasNight = !!state.night; dn.textContent = ''; dn.append(wasNight ? moonEl : sunEl); }
    for (const t of tiles) {
      const u = t.p.heroId ? state.units.get(t.p.heroId) : null;
      cls(t.el, 'me', t.p.sid === mySid);
      cls(t.el, 'disc', !t.p.connected && !t.p.isBot);
      if (!u) { cls(t.el, 'dead', false); continue; }
      const dead = u.respawn > 0;
      cls(t.el, 'dead', dead);
      txt(t.dead, dead ? fmtRespawn(u.respawn) : '');
      txt(t.lv, u.level);
      sty(t.hpi, 'width', (clamp01(u.hp / (u.maxHp || 1)) * 100).toFixed(1) + '%');
      sty(t.mpi, 'width', (clamp01(u.maxMana > 0 ? u.mana / u.maxMana : 0) * 100).toFixed(1) + '%');
    }
  }

  // ================================================================ minimap
  // ================================================================ bottom bar: [minimap][portrait][stats][abilities / bars / items]
  const bottom = h('div', 'h-bottom'); hudRoot.append(bottom);
  const minimap = createMinimap(bottom, { renderer, send });

  // stats
  const stats = h('div', 'h-stats h-panel');
  const statRows = {};
  for (const [id, label] of [['str', 'STR'], ['agi', 'AGI'], ['int', 'INT'], ['dmg', 'DMG'], ['armor', 'ARM'], ['ms', 'SPD']]) {
    const r = h('div', 'r'); const l = h('span', 'l', label); const v = h('span', 'v', '0');
    r.append(l, v); stats.append(r); statRows[id] = { r, v };
  }

  // portrait
  const port = h('div', 'h-port h-panel'); const pimg = h('div', 'h-pimg'); const plv = h('div', 'h-plv', '1');
  const xpb = h('div', 'h-xp'); const xpi = h('i'); xpb.append(xpi); const resp = h('div', 'h-resp');
  port.append(pimg, plv, xpb, resp); bottom.append(port);
  bottom.append(stats);                                                   // desktop only (touch shows the same numbers in the hold panel)
  let portKey = '';

  // portrait gestures: tap / double tap / click = centre on my hero (touch.js overrides the action to also re-lock the camera);
  // press-and-hold (PORTRAIT.HOLD_MS) = full stats panel while held, hidden on release
  let portraitCentre = () => { if (ctxState.hero) focusUnit(ctxState.hero.id); };
  const statP = h('div', 'h-statp h-panel'); hudRoot.append(statP);
  let statOpen = false, statSig = '';
  function renderStats() {
    const hero = ctxState.hero; if (!hero) { closeStats(); return; }
    const me = ctxState.state && ctxState.state.players ? ctxState.state.players.get(ctxState.mySid) : null;
    const st = heroStats(hero, me, DATA); if (!st) return;
    const sig = JSON.stringify(st); if (sig === statSig) return; statSig = sig;
    statP.textContent = '';
    const head = h('div', 'hd'); head.append(h('b', null, st.title), h('span', 'h-dim', st.sub)); statP.append(head);
    const cols = h('div', 'cols'); const c1 = h('div', 'col'), c2 = h('div', 'col'); cols.append(c1, c2); statP.append(cols);
    st.groups.forEach((g, i) => {
      const box = h('div', 'grp'); box.append(h('div', 'gt', g.title));
      for (const r of g.rows) { const row = h('div', 'r' + (r.pri ? ' pri' : '')); row.append(h('span', 'l', r.label), h('span', 'v', r.value)); box.append(row); }
      (i < 2 ? c1 : c2).append(box);
    });
  }
  function openStats() {
    statOpen = true; statSig = ''; renderStats(); if (!statOpen) return;
    const r = bottom.getBoundingClientRect(), hr = hudRoot.getBoundingClientRect();
    statP.style.left = Math.max(0, r.left - hr.left) + 'px'; statP.style.bottom = Math.max(0, hr.bottom - r.top + 6) + 'px';
    statP.classList.add('on');
  }
  function closeStats() { statOpen = false; statP.classList.remove('on'); }
  {
    let down = null, timer = 0;
    const tNow = () => performance.now();
    const clr = () => { clearTimeout(timer); timer = 0; };
    port.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button > 0) return;
      e.preventDefault(); e.stopPropagation();
      down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: tNow(), moved: 0 };
      try { port.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      clr(); timer = setTimeout(() => { timer = 0; if (down && portraitPhase(tNow() - down.t, down.moved) === 'stats') openStats(); }, PORTRAIT.HOLD_MS);
    });
    port.addEventListener('pointermove', (e) => {
      if (!down || e.pointerId !== down.id) return;
      down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y));
      if (portraitPhase(0, down.moved) === 'cancel') { clr(); }
    });
    const up = (e) => {
      if (!down || e.pointerId !== down.id) return;
      const d = down; down = null; clr();
      try { port.releasePointerCapture(e.pointerId); } catch { /* */ }
      const wasOpen = statOpen; closeStats();
      if (wasOpen || e.type === 'pointercancel') return;
      if (portraitPhase(tNow() - d.t, d.moved) === 'tap') portraitCentre();
    };
    port.addEventListener('pointerup', up); port.addEventListener('pointercancel', up);
    port.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // main column
  const main = h('div', 'h-main'); bottom.append(main);
  const topRow = h('div', 'h-buffs'); const orbs = h('div', 'h-orbs'); topRow.append(orbs); main.append(topRow);
  const abil = h('div', 'h-abil h-panel'); main.append(abil);
  const bars = h('div', 'h-bars h-panel'); main.append(bars);
  const hpBar = h('div', 'h-bar hp'); const hpFill = h('i'); const hpTxt = h('span'); const hpReg = h('em');
  hpBar.append(hpFill, hpTxt, hpReg);
  const mpBar = h('div', 'h-bar mp'); const mpFill = h('i'); const mpTxt = h('span'); const mpReg = h('em');
  mpBar.append(mpFill, mpTxt, mpReg);
  bars.append(hpBar, mpBar);

  const orbEls = [h('div', 'h-orb n'), h('div', 'h-orb n'), h('div', 'h-orb n')];
  orbs.append(...orbEls);
  let abilKey = '', slots = [], buffSig = '';
  let targeting = null, aim = null;

  function buildAbilities(hero) {
    abil.textContent = ''; slots = [];
    const letters = heroKeyLetters(hero.key);
    const n = hero.abilities.length;
    for (let i = 0; i < n; i++) {
      const slot = h('div', 'h-slot');
      const learn = h('div', 'h-learn', '+');
      const ico = h('div', 'h-ico');
      const cv = sizeU(h('canvas', 'px'), 20, 20); cv.width = cv.height = 20;
      const sweep = h('div', 'h-sweep'), cdt = h('div', 'h-cdt'), key = h('div', 'h-key', letters[i] || ''), mc = h('div', 'h-mc');
      ico.append(cv, sweep, cdt, key, mc);
      const pips = h('div', 'h-pips');
      slot.append(learn, ico, pips); abil.append(slot);
      const s = { slot, learn, ico, cv, sweep, cdt, mc, pips, key: '', pipN: -1 };
      learn.addEventListener('click', (e) => { e.stopPropagation(); if (ctxState.hero && canLearn(ctxState.hero, i)) send(MSG.ORDER, { t: ORDER.LEARN, slot: i }); });
      ico.addEventListener('click', (e) => { if (e.ctrlKey || e.altKey) { if (ctxState.hero && canLearn(ctxState.hero, i)) send(MSG.ORDER, { t: ORDER.LEARN, slot: i }); } else handlers.activate('ability', i, e); });
      tooltip.bind(ico, () => {
        const hero = ctxState.hero; const ab = hero && hero.abilities[i]; if (!ab || !ab.key || /empty/.test(ab.key) && !ab.level) return null;
        const a = hero.abilities;
        const orbsLv = a.length >= 3 && hero.orbs !== undefined && /invoker/.test(hero.key) ? { quaslevel: a[0].level, wexlevel: a[1].level, exortlevel: a[2].level } : null;
        return { type: 'ability', key: ab.key, level: ab.level, orbs: orbsLv };
      });
      slots.push(s);
    }
  }

  function updateAbilities(hero) {
    const key = hero.key + ':' + hero.abilities.length;
    if (key !== abilKey) { abilKey = key; buildAbilities(hero); }
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i], ab = hero.abilities[i];
      if (!ab) continue;
      if (s.key !== ab.key) {
        s.key = ab.key;
        if (icons) { if (!paintInto(s.cv, icons, ab.key, 1)) { const g = s.cv.getContext('2d'); g.clearRect(0, 0, 20, 20); } }
        const n = pipCount(ab.key); if (n !== s.pipN) {
          s.pipN = n; s.pips.textContent = '';
          for (let k = 0; k < n; k++) s.pips.append(h('div', 'h-pip'));
          s.pipEls = Array.from(s.pips.childNodes);
        }
      }
      const info = targetInfo('ability', ab.key, ab.level);
      cls(s.ico, 'off', ab.level < 1);
      cls(s.ico, 'passive', info.mode === 'passive');
      const lacksMana = ab.level > 0 && hero.mana < (ab.mana || 0);
      cls(s.ico, 'nomana', lacksMana);
      const cd = ab.cd > 0.05;
      cls(s.ico, 'cd', cd);
      if (cd) { sty(s.sweep, '--a', sweepDeg(ab.cd, ab.cdMax) + 'deg'); txt(s.cdt, fmtCd(ab.cd)); }
      txt(s.mc, ab.mana > 0 && ab.level > 0 ? ab.mana : '');
      sty(s.mc, 'display', ab.mana > 0 && ab.level > 0 ? 'block' : 'none');
      cls(s.ico, 'active', !!(targeting && targeting.kind === 'ability' && targeting.slot === i));
      cls(s.learn, 'on', canLearn(hero, i));
      if (s.pipEls) for (let k = 0; k < s.pipEls.length; k++) cls(s.pipEls[k], 'on', k < ab.level);
    }
  }

  // inventory + gold
  const invWrap = h('div', 'h-invwrap'); bottom.append(invWrap);
  const inv = h('div', 'h-inv h-panel'); invWrap.append(inv);
  const botRow = h('div'); botRow.style.display = 'flex'; botRow.style.gap = 'calc(2 * var(--u))';
  const goldRow = h('div', 'h-goldrow h-panel'); const goldIco = sizeU(pixelEl(GLYPHS.coin, null, 1), 9); const goldT = h('span', null, '0');
  goldRow.style.flex = '1'; goldRow.append(goldIco, goldT);
  const shopBtn = h('div', 'h-shopbtn h-panel', 'SHOP');
  botRow.append(goldRow, shopBtn); invWrap.append(botRow);
  const itemEls = [];
  const itemSeen = [];
  let dragFrom = -1;

  const ctxMenu = h('div', 'h-ctx'); hudRoot.append(ctxMenu);
  const closeCtx = () => { ctxMenu.style.display = 'none'; };
  addEventListener('mousedown', (e) => { if (!ctxMenu.contains(e.target)) closeCtx(); }, true);

  for (let i = 0; i < INV_SLOTS; i++) {
    const el = h('div', 'h-is'); el.draggable = true;
    const cv = sizeU(h('canvas', 'px'), 20, 20); cv.width = cv.height = 20;
    const sweep = h('div', 'h-sweep'), cdt = h('div', 'h-cdt'), key = h('div', 'h-key', ITEM_LETTERS[i]), ch = h('div', 'h-ch');
    el.append(cv, sweep, cdt, key, ch); inv.append(el);
    const s = { el, cv, sweep, cdt, ch, key: '' };
    itemEls.push(s);
    el.addEventListener('click', (e) => handlers.activate('item', i, e));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const it = ctxState.hero && ctxState.hero.items[i]; if (!it || !it.key) return;
      const age = ctxState.time - (itemSeen[i] ? itemSeen[i].t : -999);
      const inRange = shopRange(ctxState.hero);
      ctxMenu.textContent = '';
      const sell = h('div', inRange ? '' : 'dis', `Sell for ${fmtGold(sellValue(it.key, age))}g`);
      sell.addEventListener('click', () => { closeCtx(); if (inRange) send(MSG.ORDER, { t: ORDER.SELL, slot: i }); else message('Out of shop range', true); });
      ctxMenu.append(sell);
      ctxMenu.style.left = e.clientX + 'px'; ctxMenu.style.top = e.clientY + 'px'; ctxMenu.style.display = 'block';
    });
    el.addEventListener('dragstart', (e) => { dragFrom = i; tooltip.hide(); try { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; } catch { /* */ } });
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); if (dragFrom >= 0 && dragFrom !== i) send(MSG.ORDER, { t: ORDER.SWAP, a: dragFrom, b: i }); dragFrom = -1; });
    el.addEventListener('dragend', () => { dragFrom = -1; for (const o of itemEls) o.el.classList.remove('over'); });
    tooltip.bind(el, () => {
      const it = ctxState.hero && ctxState.hero.items[i]; if (!it || !it.key) return null;
      return { type: 'item', key: it.key, items: ctxState.hero.items, extra: [{ text: 'Right-click: sell. Drag: swap slots.', cls: 'note' }] };
    });
  }
  tooltip.bind(shopBtn, () => ({ type: 'text', title: 'Shop (B / F4)', lines: ['Buy items near your fountain'] }));

  // buffs
  const buffBox = h('div', 'h-buffs'); buffBox.style.minWidth = '0'; buffBox.style.padding = '0';
  topRow.insertBefore(buffBox, orbs);
  function updateBuffs(hero) {
    const list = hero.buffs ? Array.from({ length: hero.buffs.length }, (_, i) => hero.buffs[i]) : [];
    const sig = list.join(',');
    if (sig === buffSig) return; buffSig = sig;
    buffBox.textContent = '';
    for (const b of list.slice(0, 8)) {
      const e = h('div', 'h-buff', prettyName(b).slice(0, 2).toUpperCase());
      tooltip.bind(e, () => ({ type: 'text', title: prettyName(b), lines: [] }));
      buffBox.append(e);
    }
  }

  // targeting banner
  const tgtBar = h('div', 'h-tgtbar'); hudRoot.append(tgtBar);

  // selection card
  const sel = h('div', 'h-sel h-panel'); const selNm = h('div', 'nm'); const selB = h('div', 'b'); const selBi = h('i'); const selBt = h('span');
  selB.append(selBi, selBt); sel.append(selNm, selB); hudRoot.append(sel);
  let selectedId = null;

  // shop
  const shop = createShop(hudRoot, { sheets: sheetsSafe, send, tooltip, onMessage: message });
  shopBtn.addEventListener('click', () => shop.toggle());

  // ---- shop range (my team's fountain)
  let shopPos = null, shopPosT = 0;
  function findShop(state, myTeam) {
    if (shopPos && ctxState.time - shopPosT < 1e9) return shopPos;
    state.units.forEach((u) => { if (u.kind === KIND.FOUNTAIN && u.team === myTeam) shopPos = { x: u.x, y: u.y }; });
    shopPosT = ctxState.time;
    return shopPos;
  }
  function shopRange(hero) { return !!(hero && ctxState.state && inShopRange(hero, findShop(ctxState.state, ctxState.myTeam))); }

  // ---- gold popup
  function goldPop(g) {
    const e = h('div', 'h-goldpop', '+' + g); goldRow.append(e);
    setTimeout(() => e.remove(), 1100);
  }

  // ---- range rings
  function drawRings(hero) {
    ringCtx.clearRect(0, 0, ring.width, ring.height); ringCtx.globalAlpha = 1;
    if ((!targeting || !hero) && !povMarks.length || !renderer.worldToScreen) return;
    const cl = nearClip();
    const circle = (cx, cy, r, color, fill, lw) => {
      let pts = [];
      for (let k = 0; k < 64; k++) { const a = (k / 64) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
      if (cl) pts = clipPolyNear(pts, cl.depth, cl.d);                              // keep the parts behind the camera out of the projection
      if (pts.length < 3) return;
      ringCtx.beginPath();
      pts.forEach((q, k) => { const p = renderer.worldToScreen(q[0], q[1]); if (k === 0) ringCtx.moveTo(p.x, p.y); else ringCtx.lineTo(p.x, p.y); });
      ringCtx.closePath();
      if (fill) { ringCtx.fillStyle = fill; ringCtx.fill(); }
      ringCtx.strokeStyle = color; ringCtx.lineWidth = lw || 2; ringCtx.stroke();
    };
    drawMarks(circle);
    if (!targeting || !hero) return;
    if (targeting.rich) { drawRich(hero, circle, cl); return; }
    const info = targeting.info || {};
    if (info.range > 0) circle(hero.x, hero.y, info.range, 'rgba(255,226,122,.85)', null);
    if (info.radius > 0 && aim) circle(aim.x, aim.y, info.radius, 'rgba(255,255,255,.9)', 'rgba(255,200,80,.12)');
  }

  // spectator player-perspective: the player's order clicks (move green, attack red, spell blue), shrinking ring that fades over MARK_MS
  const MARK_MS = 900, MARK_COL = { move: '110,255,140', amove: '255,170,70', attack: '255,90,70', cast: '120,200,255', item: '120,200,255' };
  function drawMarks(circle) {
    const now = performance.now();
    for (let i = povMarks.length - 1; i >= 0; i--) {
      const m = povMarks[i], k = (now - m.at) / MARK_MS;
      if (k >= 1) { povMarks.splice(i, 1); continue; }
      const u = m.id && ctxState.state ? ctxState.state.units.get(m.id) : null;
      const x = u ? u.x : m.x, y = u ? u.y : m.y;
      if (x == null || y == null) continue;
      const col = MARK_COL[m.t] || MARK_COL.move, a = (1 - k).toFixed(2);
      circle(x, y, (u ? 90 : 60) * (1.5 - k * 0.8), `rgba(${col},${a})`, `rgba(${col},${(a * 0.18).toFixed(2)})`, 3);
    }
  }

  // touch rangefinder (targeting.rich): range ring around the hero + the spell's world shape at the aim point + target marker,
  // fed by the same setTargeting / setAim path the desktop cursor uses.  Skill shots (line / cone) start at the hero.
  // near-plane clip context: a point behind the perspective camera projects mirrored across the screen, so overlays are clipped first
  function nearClip() {
    const r = renderer.rig;
    return r && r.camera && r.camera.matrixWorldInverse ? { depth: makeDepthFn(r.camera, r.tz || 0), d: (r.camera.near || 100) * 2 } : null;
  }
  function drawRich(hero, circle, cl) {
    const g = ringCtx, tg = targeting, sh = tg.shape || { type: 'none' };
    const bad = !!tg.cancel;
    const WARM = bad ? 'rgba(255,90,70,.3)' : 'rgba(255,120,60,.26)', EDGE = bad ? 'rgba(255,120,100,.95)' : 'rgba(255,255,255,.95)';
    const wp = (x, y) => renderer.worldToScreen(x, y);
    const poly = (pts, fill, stroke, lw) => {
      if (cl) pts = clipPolyNear(pts, cl.depth, cl.d);
      if (pts.length < 3) return;
      g.beginPath(); pts.forEach((p, i) => { const q = wp(p[0], p[1]); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); }); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 3; g.lineJoin = 'round'; g.stroke(); }
    };
    if (tg.alpha != null) g.globalAlpha = Math.max(0, Math.min(1, tg.alpha));       // tap preview fades out
    if (tg.ring > 0) circle(hero.x, hero.y, tg.ring, 'rgba(255,226,122,.95)', 'rgba(255,226,122,.07)', 3);
    if (tg.preview || !aim) return;                                                    // tap preview = the range ring only
    const dx = aim.x - hero.x, dy = aim.y - hero.y, d = Math.hypot(dx, dy), ux = d > 1 ? dx / d : Math.cos(hero.facing || 0), uy = d > 1 ? dy / d : Math.sin(hero.facing || 0);
    const nx = -uy, ny = ux;
    // faint direction helper
    const seg = cl ? clipSegmentNear([hero.x, hero.y], [aim.x, aim.y], cl.depth, cl.d) : [[hero.x, hero.y], [aim.x, aim.y]];
    if (seg) {
      const a0 = wp(seg[0][0], seg[0][1]), a1 = wp(seg[1][0], seg[1][1]);
      g.save(); g.setLineDash([8, 7]); g.beginPath(); g.moveTo(a0.x, a0.y); g.lineTo(a1.x, a1.y); g.strokeStyle = 'rgba(120,235,255,.4)'; g.lineWidth = 2; g.stroke(); g.restore();
    }
    if (sh.type === 'line') {
      poly([[hero.x + nx * sh.w0 / 2, hero.y + ny * sh.w0 / 2], [hero.x + ux * sh.len + nx * sh.w1 / 2, hero.y + uy * sh.len + ny * sh.w1 / 2],
        [hero.x + ux * sh.len - nx * sh.w1 / 2, hero.y + uy * sh.len - ny * sh.w1 / 2], [hero.x - nx * sh.w0 / 2, hero.y - ny * sh.w0 / 2]], WARM, EDGE, 3);
    } else if (sh.type === 'cone') {
      const half = (sh.angle / 2) * Math.PI / 180, base = Math.atan2(uy, ux), pts = [[hero.x, hero.y]];
      for (let k = 0; k <= 16; k++) { const a = base - half + (k / 16) * half * 2; pts.push([hero.x + Math.cos(a) * sh.len, hero.y + Math.sin(a) * sh.len]); }
      poly(pts, WARM, EDGE, 3);
    } else if (sh.type === 'circle') {
      circle(aim.x, aim.y, sh.radius, EDGE, WARM, 3);
    }
    // aim marker / snapped target highlight
    const u = tg.unitId && ctxState.state ? ctxState.state.units.get(tg.unitId) : null;
    const mx = u ? u.x : aim.x, my = u ? u.y : aim.y;
    const col = bad ? 'rgba(255,110,90,.95)' : u ? (u.team !== ctxState.myTeam ? 'rgba(255,90,70,.98)' : 'rgba(110,255,140,.98)') : 'rgba(120,235,255,.95)';
    if (u || sh.type === 'none' || sh.type === 'circle') circle(mx, my, u ? 85 : 38, col, u ? 'rgba(255,255,255,.1)' : null);
    if (!cl || cl.depth(mx, my) >= cl.d) { const c = wp(mx, my); g.beginPath(); g.arc(c.x, c.y, 4, 0, Math.PI * 2); g.fillStyle = col; g.fill(); }
  }

  // ---- selection card update
  function updateSel(state) {
    const u = selectedId ? state.units.get(selectedId) : null;
    if (!u || (ctxState.hero && u.id === ctxState.hero.id)) { cls(sel, 'on', false); return; }
    cls(sel, 'on', true);
    const enemy = u.team !== ctxState.myTeam;
    sel.firstChild.className = 'nm' + (enemy ? ' e' : '');
    selB.className = 'b' + (enemy ? ' e' : '');
    if (selNm._n !== unitName(u) + (u.level || '')) { selNm._n = unitName(u) + (u.level || ''); selNm.textContent = ''; selNm.append(h('span', null, unitName(u)), h('span', 'h-dim', u.level ? 'L' + u.level : '')); }
    sty(selBi, 'width', (clamp01(u.hp / (u.maxHp || 1)) * 100).toFixed(1) + '%');
    txt(selBt, fmtBar(u.hp, u.maxHp));
  }

  // ================================================================ per-frame update
  function update(state, hero, mySid, view) {
    if (!state || !state.players) return;
    const povSid = view && view.povSid ? view.povSid : '';   // spectator watching a player: the HUD is that player's (gold, hero, team)
    if (povSid) mySid = povSid;
    const me = state.players.get(mySid);
    const spec = povSid ? true : !!me && me.team === TEAM.SPEC;
    const myTeam = povSid ? (me ? me.team : TEAM.RADIANT) : spec ? TEAM.RADIANT : me ? me.team : view && view.myTeam != null ? view.myTeam : -1;
    if (spec !== specOn) { specOn = spec; }
    sty(specEl, 'display', spec && !povSid ? '' : 'none');
    cls(hudRoot, 'h-pov', !!povSid); povLocked = !!povSid;
    ctxState = { state, hero, mySid, myTeam, time: state.time }; lastView = view || null;
    if (pendingFx.length) fx(pendingFx.splice(0));

    updateTop(state, mySid);
    minimap.update({ state, myTeam, hero, mySid });
    sb.update(state, mySid);
    if (state.phase === 'ended') end.show(state.winner, spec ? TEAM.SPEC : myTeam);

    const has = !!hero;
    sty(bottom, 'visibility', has ? 'visible' : 'hidden');
    sty(minimap.el, 'visibility', 'visible');                                      // the minimap also works for spectators (no hero)
    if (!has) closeStats(); else if (statOpen) renderStats();
    if (has) {
      // portrait
      if (portKey !== hero.key) {
        portKey = hero.key; pimg.textContent = '';
        const sh = sheetsSafe[heroShort(hero.key)];
        if (sh && sh.frames && sh.frames.portrait) { const c = pixelEl(sh, 'portrait', 1); sizeU(c, 32, 42); pimg.append(c); }
      }
      const dead = hero.respawn > 0;
      cls(port, 'dead', dead); txt(resp, dead ? fmtRespawn(hero.respawn) : '');
      txt(plv, hero.level);
      sty(xpi, 'width', (xpProgress(hero.xp, hero.level) * 100).toFixed(1) + '%');
      // bars
      const rg = heroRegen(hero, DATA);
      sty(hpFill, 'width', (clamp01(hero.hp / (hero.maxHp || 1)) * 100).toFixed(1) + '%');
      sty(mpFill, 'width', (clamp01(hero.maxMana > 0 ? hero.mana / hero.maxMana : 0) * 100).toFixed(1) + '%');
      txt(hpTxt, fmtBar(hero.hp, hero.maxHp)); txt(mpTxt, fmtBar(hero.mana, hero.maxMana));
      txt(hpReg, fmtRegen(rg.hp)); txt(mpReg, fmtRegen(rg.mana));
      // stats
      const hd = DATA.heroes[hero.key]; const primary = hd ? hd.attr : '';
      for (const a of ['str', 'agi', 'int']) { txt(statRows[a].v, hero[a]); cls(statRows[a].r, 'pri', a === primary); }
      txt(statRows.dmg.v, dmgText(hero)); txt(statRows.armor.v, fmtNum(hero.armor, 1)); txt(statRows.ms.v, hero.ms);
      updateAbilities(hero);
      updateBuffs(hero);
      // orbs
      const inv7 = /invoker/.test(hero.key);
      sty(orbs, 'display', inv7 ? 'flex' : 'none');
      if (inv7) {
        const o = String(hero.orbs || '').toLowerCase();
        for (let i = 0; i < 3; i++) { const c = ORB_CLS[o[i]] || 'n'; if (orbEls[i]._k !== c) { orbEls[i]._k = c; orbEls[i].className = 'h-orb ' + c; } }
      }
      // items
      for (let i = 0; i < INV_SLOTS; i++) {
        const s = itemEls[i], it = hero.items[i];
        const k = it && it.key ? it.key : '';
        if (s.key !== k) {
          s.key = k;
          const g = s.cv.getContext('2d'); g.clearRect(0, 0, 20, 20);
          if (k && icons) paintInto(s.cv, icons, k, 1);
          itemSeen[i] = k ? { key: k, t: state.time } : null;
        }
        const cd = it && it.cd > 0.05;
        cls(s.el, 'cd', cd);
        if (cd) { sty(s.sweep, '--a', sweepDeg(it.cd, it.cdMax) + 'deg'); txt(s.cdt, fmtCd(it.cd)); }
        const ch = it && it.charges > 0 && (DATA.items[k] ? DATA.items[k].stack || DATA.items[k].charges : true);
        sty(s.ch, 'display', ch ? 'block' : 'none'); if (ch) txt(s.ch, it.charges);
        cls(s.el, 'active', !!(targeting && targeting.kind === 'item' && targeting.slot === i));
      }
    }
    if (me) txt(goldT, fmtGold(me.gold));
    // shop
    {
      const inR = hero ? shopRange(hero) : false;
      shop.update({ gold: me ? me.gold : 0, items: hero ? Array.from({ length: hero.items.length }, (_, i) => hero.items[i]) : [], inRange: inR, dead: !!(hero && hero.respawn > 0) });
    }
    updateSel(state);
    // targeting banner
    if (targeting && !povMode) { sty(tgtBar, 'display', 'block'); const nm = targeting.name || ''; txt(tgtBar, nm ? `Select target: ${nm}  (Esc / right-click: cancel)` : 'Attack-move: click a target  (Esc: cancel)'); }
    else sty(tgtBar, 'display', 'none');
    drawRings(hero);
  }

  // ================================================================ events
  const pendingFx = [];
  function fx(events) {
    if (!events) return;
    if (!ctxState.state) { for (const e of events) pendingFx.push(e); return; }
    const st = ctxState.state;
    for (const ev of events) {
      switch (ev.e) {
        case EV.KILL: feed.kill(ev, st, ctxState.mySid); break;
        case EV.CHAT: chat.add(ev); break;
        case EV.MSG: if (ev.text) { msgs.show(ev.text, false); } break;
        case EV.GOLD: if (ctxState.hero && ev.t === ctxState.hero.id && ev.g > 0) goldPop(ev.g); break;
        case EV.END: end.show(ev.winner, specOn ? TEAM.SPEC : ctxState.myTeam); break;
        default: break;
      }
    }
  }

  // ================================================================ lifecycle
  applyScale();
  const onResize = () => applyScale();
  addEventListener('resize', onResize);

  return {
    update, fx,
    destroy() {
      removeEventListener('resize', onResize);
      tooltip.destroy(); shop.destroy(); minimap.destroy(); feed.destroy(); msgs.destroy(); chat.destroy(); end.destroy();
      hudRoot.textContent = ''; hudRoot.classList.remove('h-root');
    },
    // ---- hooks for input.js / sandbox
    setHandlers(hd) { handlers = Object.assign({ activate() {} }, hd); },
    setTargeting(tg) { targeting = tg; if (!tg) aim = null; },
    /** spectator player-perspective: pick handler for the top-bar hero tiles (null = tiles centre the camera) */
    setPovPick(fn) { povPick = typeof fn === 'function' ? fn : null; },
    /** the watched player is aiming slot `slot` of `kind` at (ax, ay): same range ring / radius preview the player sees. tg null = not aiming */
    setPovAim(tg, ax, ay) {
      const u = ctxState.hero;
      if (!tg || !u) { if (povMode) { targeting = null; aim = null; } povMode = false; return; }
      const it = tg.k === 'item' ? u.items[tg.s] : u.abilities[tg.s], key = it && it.key;
      if (!key) return;
      povMode = true;
      if (!targeting || targeting.kind !== tg.k || targeting.slot !== tg.s || targeting.key !== key) targeting = { kind: tg.k, slot: tg.s, key, info: targetInfo(tg.k, key, tg.k === 'item' ? 1 : it.level), name: prettyName(key) };
      if (ax != null && ay != null) aim = { x: ax, y: ay };
    },
    /** spectator player-perspective: an accepted order of the watched player {t, x?, y?, id?, slot?} -> click marker + pressed ability / item button */
    povOrder(e) {
      if (!e) return;
      if ((e.x != null && e.y != null) || e.id) { povMarks.push({ t: e.t, x: e.x, y: e.y, id: e.id || '', at: performance.now() }); if (povMarks.length > 12) povMarks.shift(); }
      if ((e.t === 'cast' || e.t === 'item') && e.slot != null) {
        const el = e.t === 'item' ? (itemEls[e.slot] && itemEls[e.slot].el) : (slots[e.slot] && slots[e.slot].ico);
        if (el) { el.classList.remove('pressed'); void el.offsetWidth; el.classList.add('pressed'); clearTimeout(el._pt); el._pt = setTimeout(() => el.classList.remove('pressed'), 320); }
      }
    },
    setAim(x, y) { aim = { x, y }; },
    message,
    toggleShop() { shop.toggle(); },
    closeShop() { shop.close(); },
    isShopOpen: () => shop.isOpen(),
    /** spectator watching a player: input.js leaves the camera / selection to the follow logic */
    isPovLocked: () => povLocked,
    /** what the local player is aiming right now (ability / item slot + ground point) for the spectator relay, or null */
    povAim() { const t = targeting; return t && !povMode && (t.kind === 'ability' || t.kind === 'item') && t.slot >= 0 ? { tg: { k: t.kind, s: t.slot }, ax: aim ? aim.x : null, ay: aim ? aim.y : null } : null; },
    isTyping: () => chat.isTyping(),
    openChat() { chat.open(); },
    setScoreboard(v) { sb.setOpen(v); },
    /** touch.js: what a portrait double tap does (re-lock + recentre); default = focus the hero */
    setPortraitCentre(fn) { if (typeof fn === 'function') portraitCentre = fn; },
    isStatsOpen: () => statOpen,
    select(id) { selectedId = id || null; },
    get selected() { return selectedId; },
    shop, chat, tooltip,
  };
}
