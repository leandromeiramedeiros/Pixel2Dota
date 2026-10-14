// 2D overlay canvas (sibling of the game canvas): pixel-style HP / mana bars and floating combat text.
//   overlay.text(x, y, z, str, color, dur)   world position (x east, y north, z up), CSS colour, seconds
//   overlay.bars(list) is called by the renderer each frame with { sx, sy, w, hp, mana, team, ... } already projected.
const FONT = '700 11px "Courier New", monospace';

export function createOverlay(canvas) {
  const c = document.createElement('canvas');
  c.className = 'render-overlay';
  const parent = canvas.parentElement;
  if (parent) {
    const cs = getComputedStyle(canvas);
    const fixed = cs.position === 'fixed';
    if (!fixed && getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    Object.assign(c.style, { position: fixed ? 'fixed' : 'absolute', left: fixed ? cs.left : canvas.offsetLeft + 'px', top: fixed ? cs.top : canvas.offsetTop + 'px', pointerEvents: 'none', zIndex: cs.zIndex === 'auto' ? '' : cs.zIndex });
    parent.insertBefore(c, canvas.nextSibling);
  }
  const ctx = c.getContext('2d');
  let cssW = 1, cssH = 1, dpr = 1;
  const texts = [];
  const bars = [];

  function resize(w, h, d) {
    cssW = w; cssH = h; dpr = d || 1;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    c.style.width = w + 'px'; c.style.height = h + 'px';
  }

  const api = {
    canvas: c,
    resize,
    /** floating text that rises and fades; project is set by the renderer */
    text(x, y, z, str, color = '#fff', dur = 1.1, opts) {
      if (texts.length > 160) texts.shift();
      texts.push({ x, y, z, str: String(str), color, dur, t: 0, big: opts && opts.big, drift: (Math.random() - 0.5) * 18 });
    },
    /** queue a bar block for this frame (screen px) */
    bar(b) { bars.push(b); },
    project: null,
    draw(dt) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.imageSmoothingEnabled = false;
      for (const b of bars) {
        const w = b.w, h = b.h || 4, x = Math.round(b.sx - w / 2), y = Math.round(b.sy);
        ctx.fillStyle = 'rgba(8,6,12,0.85)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2 + (b.mana != null ? 3 : 0));
        ctx.fillStyle = '#1c2a1c'; ctx.fillRect(x, y, w, h);
        const f = Math.max(0, Math.min(1, b.hp));
        ctx.fillStyle = b.color || (f > 0.5 ? '#46d946' : f > 0.25 ? '#e0c030' : '#e04040');
        ctx.fillRect(x, y, Math.round(w * f), h);
        ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(x, y, Math.round(w * f), 1);
        if (b.mana != null) {
          ctx.fillStyle = '#16203a'; ctx.fillRect(x, y + h + 1, w, 2);
          ctx.fillStyle = '#4a7cf0'; ctx.fillRect(x, y + h + 1, Math.round(w * Math.max(0, Math.min(1, b.mana))), 2);
        }
        if (b.ticks) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; for (let i = 1; i < b.ticks; i++) ctx.fillRect(x + Math.round((w * i) / b.ticks), y, 1, h); }
        if (b.level != null) {
          ctx.font = FONT; ctx.textAlign = 'right'; ctx.fillStyle = '#e8e0c0';
          ctx.fillText(String(b.level), x - 3, y + h);
        }
      }
      bars.length = 0;
      ctx.font = FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      for (let i = texts.length - 1; i >= 0; i--) {
        const t = texts[i]; t.t += dt;
        if (t.t >= t.dur) { texts.splice(i, 1); continue; }
        const p = api.project && api.project(t.x, t.y, t.z + 70);
        if (!p) continue;
        const k = t.t / t.dur, rise = 38 * (1 - (1 - k) * (1 - k));
        const a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        const x = Math.round(p.x + t.drift * k), y = Math.round(p.y - rise);
        ctx.globalAlpha = a;
        ctx.font = t.big ? '700 15px "Courier New", monospace' : FONT;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,6,12,0.9)'; ctx.lineJoin = 'round';
        ctx.strokeText(t.str, x, y);
        ctx.fillStyle = t.color; ctx.fillText(t.str, x, y);
      }
      ctx.globalAlpha = 1;
    },
    clear() { texts.length = 0; bars.length = 0; },
    dispose() { c.remove(); },
  };
  return api;
}
