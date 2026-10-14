// Glue (orchestrator): net + renderer + hud + input + fx loop.
//   startGame({ root, net }) -> Promise<{ destroy() }>   (main.js calls it from lobby onGameStart)
import { loadSheets } from './art/atlas.js';
import { createRenderer } from './render/index.js';
import { createHud } from './ui/hud.js';
import { createInput } from './input.js';
import { createTouch } from './ui/touch.js';
import { MSG, TEAM } from '@p2d/shared/protocol.js';

export async function startGame({ root, net }) {
  const sheets = await loadSheets();
  root.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas';
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const hudRoot = document.createElement('div');
  hudRoot.className = 'hud-root';
  root.append(canvas, hudRoot);

  const renderer = createRenderer({ canvas, sheets });
  const send = (type, payload) => net.send(type, payload);
  const hud = createHud(hudRoot, { send, renderer, sheets });
  const getState = () => net.state;
  const input = createInput({ canvas, renderer, send, hud, getState, mySid: net.mySid });

  const touch = createTouch({ root: hudRoot, canvas, renderer, hud, input, sheets, getState, mySid: net.mySid, send });

  const resize = () => renderer.resize(root.clientWidth, root.clientHeight);
  addEventListener('resize', resize);
  resize();

  const offFx = net.onFx((events) => { renderer.fx(events); hud.fx?.(events); });

  const me = () => net.state?.players?.get(net.mySid);
  let myTeam = -1, spec = false, centred = false, raf = 0, last = performance.now();

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const st = net.state; if (!st) return;
    const p = me();
    // spectators see both teams' vision; Radiant reads as the friendly (green) side, like Dota's spectator view
    const isSpec = !!p && p.team === TEAM.SPEC, vt = isSpec ? TEAM.RADIANT : p ? p.team : myTeam;
    if (vt !== myTeam || isSpec !== spec) { myTeam = vt; spec = isSpec; renderer.setMyTeam(myTeam); }
    const view = net.view(now);
    view.myTeam = myTeam; view.spectator = spec;
    if (spec && !centred) { renderer.setTarget(0, 0); centred = true; }
    view.myHeroId = p?.heroId || '';
    const hero = view.myHeroId ? st.units.get(view.myHeroId) : null;
    if (hero && !centred) { renderer.setTarget(hero.x, hero.y); centred = true; }
    renderer.update(view, dt);
    hud.update(st, hero, net.mySid, view);
  };
  raf = requestAnimationFrame(frame);

  return {
    renderer, hud, input,
    destroy() {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      offFx?.();
      touch.destroy(); input.destroy(); hud.destroy();
      root.innerHTML = '';
    },
    chat: (text) => send(MSG.CHAT, { text }),
  };
}
