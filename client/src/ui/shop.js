// Shop panel (DOM). Pure rules live in shopdata.js.
//   createShop(parent, { sheets, send, tooltip, onMessage }) -> { el, open(), close(), toggle(), isOpen(), update({ gold, items, inRange, dead }) }
import { MSG, ORDER } from '../../../shared/protocol.js';
import { SHOP_CATEGORIES, buyCheck, effectiveCost, clampPanelPos, parsePanelPos } from './shopdata.js';
import { prettyName, fmtGold } from './format.js';
import { pixelEl } from './pixels.js';
import { GLYPHS } from './glyphs.js';

const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

const POS_KEY = 'p2d.shopPos';
const REASON = { range: 'Out of shop range', gold: 'Not enough gold', full: 'Inventory full', dead: 'You are dead', unknown: 'Unknown item' };

export function createShop(parent, { sheets, send, tooltip, onMessage }) {
  const el = h('div', 'h-shop h-panel');
  const head = h('header'); const title = h('h3', null, 'SHOP');
  const status = h('span', 'st'); const gold = h('span', 'h-gold'); const x = h('span', 'x', 'X');
  gold.style.padding = '0'; gold.style.height = 'auto';
  head.append(title, status, gold, x);
  const body = h('div', 'body'); const cats = h('div', 'cats'); const grid = h('div', 'grid');
  body.append(cats, grid);
  const foot = h('footer'); const hint = h('span', null, 'Click or right-click to buy'); const rng = h('span', 'rng');
  foot.append(hint, rng);
  el.append(head, body, foot); parent.append(el);

  let cat = SHOP_CATEGORIES[0].id, ctx = { gold: 0, items: [], inRange: false, dead: false }, opened = false;
  const catEls = {}, itemEls = [];
  const goldIcon = pixelEl(GLYPHS.coin, null, 1); goldIcon.style.width = 'calc(9 * var(--u))';

  for (const c of SHOP_CATEGORIES) {
    const b = h('div', 'cat', c.name); catEls[c.id] = b; cats.append(b);
    b.addEventListener('click', () => { cat = c.id; build(); });
  }
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
    if (e.button > 0 || (e.target.closest && e.target.closest('.x'))) return;
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

  function build() {
    for (const id in catEls) catEls[id].classList.toggle('on', id === cat);
    grid.textContent = ''; itemEls.length = 0;
    const c = SHOP_CATEGORIES.find((k) => k.id === cat);
    for (const key of c.items) {
      const it = h('div', 'it'); it.dataset.key = key;
      const ico = sheets && sheets.icons ? pixelEl(sheets.icons, key, 1) : h('canvas', 'px');
      const cost = h('div', 'c', fmtGold(effectiveCost(key, ctx.items).cost));
      it.append(ico, cost);
      it.addEventListener('click', () => buy(key));
      it.addEventListener('contextmenu', (e) => { e.preventDefault(); buy(key); });
      tooltip.bind(it, () => {
        const r = buyCheck(key, ctx), extra = [];
        const ec = effectiveCost(key, ctx.items);
        if (ec.consumed > 0) extra.push({ text: `Components owned: pay ${fmtGold(ec.cost)}g`, cls: 'note stat' });
        if (!r.ok) extra.push({ text: r.reason === 'gold' ? `Need ${fmtGold(r.need)} more gold` : REASON[r.reason], cls: 'bad' });
        return { type: 'item', key, items: ctx.items, extra };
      });
      grid.append(it); itemEls.push({ key, it, cost });
    }
    refresh();
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
  }

  build();
  const api = {
    el,
    isOpen: () => opened,
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
