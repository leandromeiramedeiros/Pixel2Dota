// Minimap: static terrain (rendered once from shared/map.js), fog, unit dots, camera rectangle.
//   createMinimap(parent, { renderer, send, size?:92 }) -> { el, update({ state, myTeam, hero, mySid }), destroy() }
//   left click / drag: move camera (renderer.cam.jumpTo: instant, drops the lock; touch suspends the lock while pressed).  right click: move order (shift = queued).
import { getMap, TT, worldToTile } from '../../../shared/map.js';
import { TEAM, KIND, MSG, ST } from '../../../shared/protocol.js';
import { orderMove } from './targeting.js';

const TYPE_RGB = {
  [TT.GRASS]: null, [TT.TREE]: [22, 58, 30], [TT.WALL]: [18, 18, 24], [TT.ROAD]: [122, 104, 72], [TT.WATER]: [38, 78, 140], [TT.OUT]: [3, 3, 6],
};
const ELEV_GRASS = [[52, 104, 52], [64, 120, 58], [78, 134, 66], [92, 148, 74]];

/** Pure: static map colors -> RGBA bytes at size x size (box-averaged). */
export function bakeMapPixels(size) {
  const m = getMap(), out = new Uint8ClampedArray(size * size * 4);
  const N = m.w, H = m.h;
  for (let py = 0; py < size; py++) {
    const y0 = Math.floor((py * H) / size), y1 = Math.max(y0 + 1, Math.floor(((py + 1) * H) / size));
    for (let px = 0; px < size; px++) {
      const x0 = Math.floor((px * N) / size), x1 = Math.max(x0 + 1, Math.floor(((px + 1) * N) / size));
      let r = 0, g = 0, b = 0, c = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const j = y * N + x; const t = m.type[j];
        const col = t === TT.GRASS ? ELEV_GRASS[m.elev[j] & 3] : TYPE_RGB[t] || TYPE_RGB[TT.OUT];
        r += col[0]; g += col[1]; b += col[2]; c++;
      }
      const o = (py * size + px) * 4;
      out[o] = r / c; out[o + 1] = g / c; out[o + 2] = b / c; out[o + 3] = 255;
    }
  }
  return out;
}

export function createMinimap(parent, { renderer, send, size = 92 }) {
  const m = getMap();
  const el = document.createElement('div'); el.className = 'h-mm h-panel';
  const wrap = document.createElement('div'); wrap.className = 'h-mmw';
  wrap.style.width = wrap.style.height = `calc(${size} * var(--u))`;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; c.className = 'px'; c.style.width = c.style.height = `calc(${size} * var(--u))`; return c; };
  const base = mk(), dyn = mk();
  wrap.append(base, dyn); el.append(wrap); parent.append(el);

  base.getContext('2d').putImageData(new ImageData(bakeMapPixels(size), size, size), 0, 0);
  const g = dyn.getContext('2d');
  const fogC = document.createElement('canvas'); fogC.width = fogC.height = size;
  const fogG = fogC.getContext('2d'); const fogImg = fogG.createImageData(size, size);
  let fogT = 0, hasFog = false;

  const toPx = (x, y) => { const [tx, ty] = worldToTile(x, y); return [(tx / m.w) * size, (ty / m.h) * size]; };
  const toWorld = (cx, cy) => {
    const r = wrap.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (cx - r.left) / r.width)), fy = Math.min(1, Math.max(0, (cy - r.top) / r.height));
    return { x: m.x0 + fx * m.w * m.tile, y: m.y1 - fy * m.h * m.tile };
  };

  function updateFog(now) {
    if (now - fogT < 250) return; fogT = now;
    const fg = renderer && renderer.fogGrid && renderer.fogGrid();
    if (!fg || !fg.visible) { hasFog = false; return; }
    hasFog = true;
    const d = fogImg.data;
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const tx = Math.min(fg.w - 1, Math.floor(((px + 0.5) / size) * fg.w)), ty = Math.min(fg.h - 1, Math.floor(((py + 0.5) / size) * fg.h));
      const j = ty * fg.w + tx, o = (py * size + px) * 4;
      d[o] = d[o + 1] = d[o + 2] = 0;
      d[o + 3] = fg.visible[j] ? 0 : fg.explored && fg.explored[j] ? 95 : 175;
    }
    fogG.putImageData(fogImg, 0, 0);
  }

  const campPx = (m.ents.camp || []).map((c) => toPx(c.x, c.y));
  const pit = (m.ents.roshan || []).find((e) => !/trigger/.test(e.name || '')) || (m.ents.roshan || [])[0];
  const pitPx = pit ? toPx(pit.x, pit.y) : null;

  const COL = { [TEAM.RADIANT]: '#58d96c', [TEAM.DIRE]: '#ee5a4a', [TEAM.NEUTRAL]: '#c9b45a' };
  const BUILD = new Set([KIND.TOWER, KIND.RAX, KIND.ANCIENT, KIND.BUILDING, KIND.FOUNTAIN]);
  let fogVis = null;

  function visibleAt(x, y) {
    if (!fogVis) return true;
    const [tx, ty] = worldToTile(x, y); const j = Math.floor(ty) * m.w + Math.floor(tx);
    return !!fogVis[j];
  }

  function update({ state, myTeam, hero, mySid }) {
    const now = performance.now();
    updateFog(now);
    const fg = hasFog && renderer.fogGrid ? renderer.fogGrid() : null;
    fogVis = fg ? fg.visible : null;
    g.clearRect(0, 0, size, size);
    if (hasFog) g.drawImage(fogC, 0, 0);
    // neutral camp spots (dim gold) + Roshan's pit (orange diamond): static map markers, drawn under the unit dots
    g.fillStyle = 'rgba(214,186,88,0.55)';
    for (const [px, py] of campPx) g.fillRect(Math.round(px) - 1, Math.round(py) - 1, 2, 2);
    if (pitPx) {
      const [px, py] = pitPx, cx = Math.round(px), cy = Math.round(py);
      g.fillStyle = '#05070b'; g.fillRect(cx - 3, cy - 1, 7, 3); g.fillRect(cx - 1, cy - 3, 3, 7);
      g.fillStyle = '#f08a2a'; g.fillRect(cx - 2, cy, 5, 1); g.fillRect(cx, cy - 2, 1, 5);
    }
    if (!state || !state.units) return;
    const heroes = [], rest = [];
    state.units.forEach((u) => {
      if (u.hp <= 0 && u.kind !== KIND.HERO) return;
      const mine = u.team === myTeam;
      if (!mine && !visibleAt(u.x, u.y)) { if (!BUILD.has(u.kind)) return; }
      if (!mine && (u.status & ST.INVIS) && !(u.status & ST.REVEALED)) return;   // unrevealed enemy wards stay off the map
      (u.kind === KIND.HERO ? heroes : rest).push(u);
    });
    for (const u of rest) {
      const [px, py] = toPx(u.x, u.y);
      g.fillStyle = COL[u.team] || '#aaa';
      if (BUILD.has(u.kind)) {
        const s = u.kind === KIND.ANCIENT ? 5 : u.kind === KIND.FOUNTAIN ? 2 : 3;
        g.fillStyle = '#05070b'; g.fillRect(Math.round(px - s / 2) - 1, Math.round(py - s / 2) - 1, s + 2, s + 2);
        g.fillStyle = COL[u.team] || '#aaa'; g.fillRect(Math.round(px - s / 2), Math.round(py - s / 2), s, s);
      } else if (u.kind === KIND.CREEP || u.kind === KIND.SUMMON) {
        g.fillRect(Math.round(px), Math.round(py), 1, 1);
      } else if (u.kind === KIND.WARD) {
        g.fillRect(Math.round(px), Math.round(py), 2, 2);
      }
    }
    for (const u of heroes) {
      if (u.hp <= 0 && !(u.status & 4096) && u.respawn <= 0) continue;
      const dead = u.respawn > 0 || (u.status & 4096);
      if (dead) continue;
      const [px, py] = toPx(u.x, u.y);
      const me = hero && u.id === hero.id;
      g.fillStyle = me ? '#ffe27a' : '#05070b'; g.fillRect(Math.round(px - 3), Math.round(py - 3), 6, 6);
      g.fillStyle = COL[u.team] || '#aaa'; g.fillRect(Math.round(px - 2), Math.round(py - 2), 4, 4);
    }
    // camera view: the ground quad the camera really sees (orbit yaw + perspective trapezoid); old axis-aligned rect if the renderer lacks viewQuad
    const q = renderer.viewQuad ? renderer.viewQuad() : null, t = renderer.getTarget ? renderer.getTarget() : null;
    g.strokeStyle = '#ffffff'; g.lineWidth = 1;
    if (q) {
      g.beginPath();
      q.forEach((p, i) => { const [x, y] = toPx(p.x, p.y); if (i) g.lineTo(Math.round(x) + 0.5, Math.round(y) + 0.5); else g.moveTo(Math.round(x) + 0.5, Math.round(y) + 0.5); });
      g.closePath(); g.stroke();
    } else if (t) {
      const rig = renderer.rig;
      const vw = (rig && rig.visibleWidth) || 2100, vh = ((rig && rig.visibleHeight) || 1190) / 0.866;
      const [cx, cy] = toPx(t.x, t.y);
      const w = (vw / (m.w * m.tile)) * size, hh = (vh / (m.h * m.tile)) * size;
      g.strokeRect(Math.round(cx - w / 2) + 0.5, Math.round(cy - hh / 2) + 0.5, Math.round(w), Math.round(hh));
    }
  }

  // ---- input
  let dragging = false;
  const moveCam = (e) => { const p = toWorld(e.clientX, e.clientY); if (renderer.cam) renderer.cam.jumpTo(p.x, p.y); else renderer.setTarget(p.x, p.y); };
  const onDown = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.button === 0) { dragging = true; try { wrap.setPointerCapture(e.pointerId); } catch { /* */ } moveCam(e); }
    else if (e.button === 2) { const p = toWorld(e.clientX, e.clientY); send(MSG.ORDER, orderMove(Math.round(p.x), Math.round(p.y), e.shiftKey)); }
  };
  const onMove = (e) => { if (dragging) moveCam(e); };
  const onUp = (e) => { if (dragging) { dragging = false; try { wrap.releasePointerCapture(e.pointerId); } catch { /* */ } } };
  const noCtx = (e) => e.preventDefault();
  wrap.addEventListener('pointerdown', onDown); wrap.addEventListener('pointermove', onMove);
  wrap.addEventListener('pointerup', onUp); wrap.addEventListener('pointercancel', onUp); wrap.addEventListener('contextmenu', noCtx);

  return { el, update, destroy() { el.remove(); } };
}
