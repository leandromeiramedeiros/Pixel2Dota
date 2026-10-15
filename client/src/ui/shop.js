// Shop panel (DOM), Dota layout: BASICS / UPGRADES tabs (one shown), each tab = its category columns side by side, items stacked
//   in shops.txt order (empty columns keep their header), + a detail panel for the selected item.
//   Click / tap selects (details), right-click / double-click / BUY buys. Pure rules live in shopdata.js.
//   createShop(parent, { sheets, send, tooltip, onMessage }) -> { el, open(), close(), toggle(), isOpen(), select(key), tab(id), update({ gold, items, inRange, dead }) }
import { MSG, ORDER } from '../../../shared/protocol.js';
import { DATA } from '../../../shared/data.js';
import { SHOP_GROUPS, SHOP_CATEGORIES, groupOf, buyCheck, effectiveCost, usedIn, clampPanelPos, parsePanelPos } from './shopdata.js';
import { renderTip } from './tooltip.js';
import { prettyName, fmtGold } from './format.js';
import { pixelEl } from './pixels.js';
import { GLYPHS } from './glyphs.js';

const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

const POS_KEY = 'p2d.shopPos';
const REASON = { range: 'Out of shop range', gold: 'Not enough gold', full: 'Inventory full', dead: 'You are dead', unknown: 'Unknown item' };
// column headers are one icon wide: short labels, full name on hover
const SHORT = { consumables: 'CONSUM', attributes: 'ATTRIB', equipment: 'EQUIP', misc: 'MISC', secret: 'SECRET', accessories: 'ACCESS', support: 'SUPP', magical: 'MAGIC', armor: 'ARMOR', weapons: 'WEAPON', artifacts: 'ARMAM' };

export function createShop(parent, { sheets, send, tooltip, onMessage }) {
  const el = h('div', 'h-shop h-panel');
  const head = h('header'); const title = h('h3', null, 'SHOP');
  const status = h('span', 'st'); const gold = h('span', 'h-gold'); const x = h('span', 'x', 'X');
  gold.style.padding = '0'; gold.style.height = 'auto';
  const tabs = h('div', 'tabs');
  head.append(title, tabs, status, gold, x);
  const body = h('div', 'body'); const cols = h('div', 'cols'); const det = h('div', 'det');
  body.append(cols, det);
  const foot = h('footer');
  const hint = h('span', 'hint');
  hint.append(h('span', 'hm', 'Click: info - Right-click / double-click: buy'), h('span', 'ht', 'Tap: info - BUY to purchase'));
  const rng = h('span', 'rng');
  foot.append(hint, rng);
  el.append(head, body, foot); parent.append(el);

  let ctx = { gold: 0, items: [], inRange: false, dead: false }, opened = false, sel = null, detSig = '';
  const itemEls = [], tabEls = {}, grpEls = {};
  let cur = SHOP_GROUPS[0].id;
  const goldIcon = pixelEl(GLYPHS.coin, null, 1); goldIcon.style.width = 'calc(9 * var(--u))';
  x.addEventListener('click', () => api.close());

  // ---- drag by the header (mouse + touch via pointer events); position is remembered and re-clamped on resize / rotation
  let pos = null;
  try { pos = parsePanelPos(localStorage.getItem(POS_KEY)); } catch { /* storage unavailable */ }
  function place(x, y) {
    const pr = parent.getBoundingClientRect(), r = el.getBoundingClientRect();
    const vw = pr.width || innerWidth, vh = pr.height || innerHeight;
    const p = clampPanelPos(x, y, r.width, r.height, vw, vh);
    Object.assign(el.style, { left: p.x + 'px', top: p.y + 'px', right: 'auto', bottom: 'auto', transform: 'none' });
    return p;
  }
  function reclamp() { requestAnimationFrame(() => { if (pos && opened) pos = place(pos.x, pos.y); }); }   // next frame: the HUD scale (--u) is updated by its own resize listener first
  let drag = null;
  head.classList.add('drag');
  head.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || (e.target.closest && e.target.closest('.x, .tab'))) return;
    e.preventDefault(); e.stopPropagation();
    const r = el.getBoundingClientRect();
    drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
    try { head.setPointerCapture(e.pointerId); } catch { /* */ }
    tooltip.hide();
  });
  head.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault(); e.stopPropagation();
    const pr = parent.getBoundingClientRect();
    pos = place(e.clientX - pr.left - drag.dx, e.clientY - pr.top - drag.dy);
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    e.stopPropagation(); drag = null;
    try { head.releasePointerCapture(e.pointerId); } catch { /* */ }
    if (pos) { try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* */ } }
  };
  head.addEventListener('pointerup', endDrag); head.addEventListener('pointercancel', endDrag);
  for (const t of ['mousedown', 'touchstart', 'click']) head.addEventListener(t, (e) => e.stopPropagation());
  addEventListener('resize', reclamp); addEventListener('orientationchange', reclamp);

  function buy(key) {
    const r = buyCheck(key, ctx);
    if (!r.ok) { onMessage && onMessage(REASON[r.reason] || 'Cannot buy', true); return; }
    send(MSG.ORDER, { t: ORDER.BUY, key });
  }
  function showTab(id) {
    if (!grpEls[id]) return;
    cur = id;
    for (const k in grpEls) { const on = k === id; grpEls[k].classList.toggle('on', on); tabEls[k].classList.toggle('on', on); }
    cols.scrollTop = 0;
    if (pos && opened) pos = place(pos.x, pos.y);   // 5 vs 6 columns: keep a dragged panel on screen
  }
  function select(key) {
    if (!DATA.items[key]) return;
    const g = groupOf(key); if (g && g !== cur) showTab(g);   // recipe tree / used-in can point into the other tab
    sel = key; detSig = '';
    for (const e of itemEls) e.it.classList.toggle('sel', e.key === sel);
    refresh();
  }

  // ---- tabs (BASICS | UPGRADES) -> that group's columns: column header, items stacked in shops.txt order (empty columns keep their header)
  for (const g of SHOP_GROUPS) {
    const tb = h('div', 'tab', g.name); tb.dataset.tab = g.id; tabEls[g.id] = tb; tabs.append(tb);
    tb.addEventListener('click', () => showTab(g.id));
    const grp = h('div', 'grp ' + g.id); const gc = h('div', 'gc'); grpEls[g.id] = grp;
    grp.append(gc); cols.append(grp);
    for (const c of SHOP_CATEGORIES.filter((k) => k.group === g.id)) {
      const col = h('div', 'col' + (c.items.length ? '' : ' empty')); col.dataset.col = c.id;
      const ch = h('div', 'ch', SHORT[c.id] || c.name); ch.title = c.name;
      const list = h('div', 'ci');
      col.append(ch, list); gc.append(col);
      for (const key of c.items) {
        const it = h('div', 'it'); it.dataset.key = key;
        const ico = sheets && sheets.icons ? pixelEl(sheets.icons, key, 1) : h('canvas', 'px');
        const cost = h('div', 'c', fmtGold(effectiveCost(key, ctx.items).cost));
        it.append(ico, cost);
        it.addEventListener('click', () => select(key));
        it.addEventListener('dblclick', (e) => { e.preventDefault(); buy(key); });
        it.addEventListener('contextmenu', (e) => { e.preventDefault(); select(key); buy(key); });
        tooltip.bind(it, () => {
          const r = buyCheck(key, ctx), extra = [];
          const ec = effectiveCost(key, ctx.items);
          if (ec.consumed > 0) extra.push({ text: `Components owned: pay ${fmtGold(ec.cost)}g`, cls: 'note stat' });
          if (!r.ok) extra.push({ text: r.reason === 'gold' ? `Need ${fmtGold(r.need)} more gold` : REASON[r.reason], cls: 'bad' });
          return { type: 'item', key, items: ctx.items, extra };
        });
        list.append(it); itemEls.push({ key, it, cost });
      }
    }
  }

  // ---- detail panel: icon, name, cost, BUY, stats / description / recipe tree (owned parts highlighted), used in
  const dHead = h('div', 'dh'), dIco = h('div', 'di'), dName = h('div', 'dn'), dCost = h('div', 'dc');
  const dTxt = h('div', 'dt'); dTxt.append(dName, dCost); dHead.append(dIco, dTxt);
  const buyB = h('div', 'buy', 'BUY'), why = h('div', 'why');
  const dBody = h('div', 'db'), used = h('div', 'used');
  const empty = h('div', 'none', 'Select an item');
  det.append(empty, dHead, buyB, why, dBody, used);
  buyB.addEventListener('click', () => { if (sel) buy(sel); });
  det.addEventListener('contextmenu', (e) => e.preventDefault());

  function renderDetail(ec) {
    dIco.textContent = '';
    if (sheets && sheets.icons) dIco.append(pixelEl(sheets.icons, sel, 1));
    dName.textContent = prettyName(sel);
    dCost.textContent = '';
    dCost.append(pixelEl(GLYPHS.coin, null, 1), document.createTextNode(fmtGold(ec.cost)));
    if (ec.consumed > 0) dCost.append(h('s', null, fmtGold(DATA.items[sel].cost)));
    renderTip(dBody, { type: 'item', key: sel, items: ctx.items }, sheets, { head: false, onPick: select });
    used.textContent = '';
    const ups = usedIn(sel);
    if (ups.length) {
      used.append(h('div', 'uh', 'Used in'));
      const row = h('div', 'ur');
      for (const k of ups) {
        const b = h('div', 'u'); b.title = prettyName(k);
        if (sheets && sheets.icons) b.append(pixelEl(sheets.icons, k, 1));
        b.addEventListener('click', () => select(k));
        row.append(b);
      }
      used.append(row);
    }
  }

  function refresh() {
    status.textContent = ctx.inRange ? '' : 'out of range';
    status.className = 'st ' + (ctx.inRange ? 'h-dim' : 'h-warn');
    rng.textContent = ctx.inRange ? '' : 'Return to your fountain to shop';
    gold.textContent = ''; gold.append(goldIcon, document.createTextNode(fmtGold(ctx.gold)));
    for (const e of itemEls) {
      const r = buyCheck(e.key, ctx);
      e.it.classList.toggle('off', !ctx.inRange || !!ctx.dead);
      e.it.classList.toggle('poor', ctx.inRange && r.reason === 'gold');
      const c = String(fmtGold(r.cost)); if (e.cost.textContent !== c) e.cost.textContent = c;
    }
    det.classList.toggle('on', !!sel);
    if (!sel) return;
    const r = buyCheck(sel, ctx), ec = effectiveCost(sel, ctx.items);
    const sig = sel + '|' + ec.cost + '|' + (ctx.items || []).map((i) => (i && i.key) || '').join(',');
    if (sig !== detSig) { detSig = sig; renderDetail(ec); }
    buyB.classList.toggle('dis', !r.ok);
    why.textContent = r.ok ? '' : r.reason === 'gold' ? `Need ${fmtGold(r.need)} more gold` : REASON[r.reason] || '';
  }

  // tallest column / widest tab of either tab (style.js .body height, .cols min-width): same panel size on both tabs
  el.style.setProperty('--rows', Math.max(1, ...SHOP_CATEGORIES.map((c) => c.items.length)));
  el.style.setProperty('--ncol', Math.max(...SHOP_GROUPS.map((g) => SHOP_CATEGORIES.filter((c) => c.group === g.id).length)));
  showTab(cur);
  refresh();
  const api = {
    el,
    isOpen: () => opened,
    select,
    tab: showTab,
    open() { opened = true; el.classList.add('open'); refresh(); if (pos) pos = place(pos.x, pos.y); },
    close() { opened = false; el.classList.remove('open'); tooltip.hide(); },
    toggle() { opened ? api.close() : api.open(); },
    destroy() { removeEventListener('resize', reclamp); removeEventListener('orientationchange', reclamp); el.remove(); },
    update(c) {
      ctx = c;
      if (opened) refresh();
    },
  };
  return api;
}
