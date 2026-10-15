// Tooltip: one floating element, content built from tipdata.js. bind(el, () => desc) wires hover.
//   desc = { type:'ability', key, level, orbs } | { type:'item', key, items?, extra?:[{text, cls}] } | { type:'text', title, lines:[str] }
import { abilityTip, itemTip } from './tipdata.js';
import { markOwned } from './shopdata.js';
import { prettyName, fmtNum, fmtGold } from './format.js';
import { pixelEl } from './pixels.js';
import { GLYPHS } from './glyphs.js';

const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function nums(arr, cur) {
  const wrap = document.createElement('b');
  arr.forEach((x, i) => {
    if (i) { const s = h('s', null, '/'); wrap.append(s); }
    const el = h(cur === i ? 'u' : 's', null, fmtNum(x, 2));
    wrap.append(el);
  });
  return wrap;
}

function foot(tip, el, noCost) {
  const f = h('div', 'foot');
  const add = (cls, label, arr) => {
    if (!arr) return;
    const d = h('span', cls, label + ' ');
    d.append(nums(arr, arr.length > 1 && tip.level > 0 ? Math.min(tip.cur, arr.length - 1) : -1));
    f.append(d);
  };
  add('mana', 'MP', tip.mana); add('cd', 'CD', tip.cd);
  if (tip.range) add('cd', 'RNG', tip.range);
  if (tip.cost && !noCost) f.append(h('span', 'cost', fmtGold(tip.cost) + 'g'));
  if (f.childNodes.length) el.append(f);
}

function rows(tip, el) {
  for (const r of tip.rows) {
    const row = h('div', 'row');
    row.append(h('span', null, r.k));
    if (Array.isArray(r.v)) row.append(nums(r.v, r.cur));
    else { const b = h('b'); b.append(h('u', null, fmtNum(r.v, 2))); row.append(b); }
    el.append(row);
  }
}

function treeEl(tree, items, sheets, onPick) {
  const owned = markOwned(tree, items || []);
  const box = h('div', 'tree');
  const walk = (n, depth) => {
    const row = h('div', 'tr' + (owned.get(n) ? ' have' : ''));
    row.style.paddingLeft = `calc(${depth * 4} * var(--u))`;
    if (sheets && sheets.icons) row.append(pixelEl(sheets.icons, n.key, 1));
    row.append(h('span', null, prettyName(n.key)), h('span', null, fmtGold(n.cost)));
    if (onPick) { row.classList.add('pick'); row.addEventListener('click', () => onPick(n.key)); }
    box.append(row);
    if (!owned.get(n)) for (const p of n.parts) walk(p, depth + 1);
    if (n.recipeCost > 0 && !owned.get(n) && depth >= 0) {
      const r = h('div', 'tr'); r.style.paddingLeft = `calc(${(depth + 1) * 4} * var(--u))`;
      r.append(h('span', 'h-dim', 'Recipe'), h('span', null, fmtGold(n.recipeCost)));
      box.append(r);
    }
  };
  walk(tree, 0);
  return box;
}

/** opts (shop detail panel): { head:false } drops the title + cost line, { onPick(key) } makes recipe rows clickable. */
export function renderTip(el, d, sheets, opts = {}) {
  el.textContent = '';
  if (d.type === 'text') {
    el.append(h('h4', null, d.title));
    for (const l of d.lines || []) el.append(h('div', 'note', l));
    return;
  }
  if (d.type === 'ability') {
    const tip = abilityTip(d.key, d.level, d.orbs);
    el.append(h('h4', null, tip.title));
    if (tip.sub) el.append(h('div', 'sub', tip.sub));
    rows(tip, el);
    for (const n of tip.notes) el.append(h('div', 'note', n));
    foot(tip, el);
    if (d.extra) for (const x of d.extra) el.append(h('div', x.cls || 'note', x.text));
    return;
  }
  if (d.type === 'item') {
    const tip = itemTip(d.key);
    if (opts.head !== false) el.append(h('h4', null, tip.title));
    if (tip.sub) el.append(h('div', 'sub', tip.sub));
    for (const s of tip.stats) el.append(h('div', 'stat', s.text));
    rows(tip, el);
    for (const n of tip.notes) el.append(h('div', 'note', n));
    foot(tip, el, opts.head === false);
    if (tip.recipe && tip.recipe.parts.length) el.append(treeEl(tip.recipe, d.items, sheets, opts.onPick));
    if (d.extra) for (const x of d.extra) el.append(h('div', x.cls || 'note', x.text));
  }
}

export function createTooltip(root, sheets) {
  const el = h('div', 'h-tip');
  root.append(el);
  let cur = null;
  // touch: a tap fires compat mouseenter but never mouseleave, so hover tips would stick open (every shop tap). Hover is mouse / pen only.
  let touchPtr = false;
  const ptr = (e) => { touchPtr = e.pointerType === 'touch'; if (touchPtr && cur) api.hide(); };
  addEventListener('pointerdown', ptr, true);

  function place(anchor) {
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth, hh = el.offsetHeight, vw = innerWidth, vh = innerHeight;
    let x = r.left + r.width / 2 - w / 2, y = r.top - hh - 6;
    if (y < 4) y = Math.min(vh - hh - 4, r.bottom + 6);
    x = Math.max(4, Math.min(vw - w - 4, x));
    el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(Math.max(4, y)) + 'px';
  }

  const api = {
    el,
    show(anchor, desc) { cur = anchor; renderTip(el, desc, sheets); el.style.display = 'block'; place(anchor); },
    hide(anchor) { if (anchor && anchor !== cur) return; cur = null; el.style.display = 'none'; },
    /** hover wiring; fn is called on every enter (so content is fresh). Returns an unbind fn. */
    bind(target, fn) {
      const on = () => { if (touchPtr) return; const d = fn(); if (d) api.show(target, d); };
      const off = () => api.hide(target);
      target.addEventListener('mouseenter', on); target.addEventListener('mouseleave', off);
      return () => { target.removeEventListener('mouseenter', on); target.removeEventListener('mouseleave', off); if (cur === target) api.hide(); };
    },
    destroy() { removeEventListener('pointerdown', ptr, true); el.remove(); },
  };
  return api;
}

export { GLYPHS };
