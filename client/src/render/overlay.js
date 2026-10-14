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
        const big = h >= 7, mh = b.mana != null ? (big ? Math.max(3, Math.round(h * 0.45)) : 2) : 0, gap = b.mana != null ? 1 : 0;
        ctx.fillStyle = 'rgba(8,6,12,0.88)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2 + (mh ? mh + gap : 0));
        ctx.fillStyle = '#1c2a1c'; ctx.fillRect(x, y, w, h);
        const f = Math.max(0, Math.min(1, b.hp));
        ctx.fillStyle = b.color || (f > 0.5 ? '#46d946' : f > 0.25 ? '#e0c030' : '#e04040');
        ctx.fillRect(x, y, Math.round(w * f), h);
        ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(x, y, Math.round(w * f), big ? 2 : 1);
        if (mh) {
          ctx.fillStyle = '#16203a'; ctx.fillRect(x, y + h + gap, w, mh);
          ctx.fillStyle = '#4a7cf0'; ctx.fillRect(x, y + h + gap, Math.round(w * Math.max(0, Math.min(1, b.mana))), mh);
        }
        if (b.maxHp > 0) {   // Dota 2 segmentation: a tick every 250 HP, every 4th (1000 HP) stronger; minor ticks drop out when they would be closer than 3 px
          const n = Math.floor((b.maxHp - 1) / 250), step = (w * 250) / b.maxHp;
          for (let i = 1; i <= n; i++) {
            const major = i % 4 === 0; if (!major && step < 3) continue;
            const tx = x + Math.round(step * i), th = major ? h : Math.max(2, Math.round(h * 0.6));
            ctx.fillStyle = major ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.5)'; ctx.fillRect(tx, y + (major ? 0 : h - th), major && big ? 2 : 1, th);
          }
        }
        if (b.level != null) {
          const fs = big ? Math.max(11, h + 3) : 11, bw = Math.round(fs * 1.5);
          ctx.font = '700 ' + fs + 'px "Courier New", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
          const bh = h + 2 + (mh ? mh + gap : 0), bx = x - bw - 2;
          ctx.fillStyle = 'rgba(8,6,12,0.9)'; ctx.fillRect(bx, y - 1, bw, bh);
          ctx.fillStyle = '#c9a23a'; ctx.fillRect(bx, y - 1, bw, 1); ctx.fillRect(bx, y + bh - 2, bw, 1);
          ctx.fillStyle = '#f0e6c0'; ctx.fillText(String(b.level), bx + bw / 2, y - 1 + Math.round((bh + fs * 0.7) / 2));
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
