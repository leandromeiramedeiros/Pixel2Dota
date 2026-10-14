// Glue (orchestrator): net + renderer + hud + input + fx loop.
//   startGame({ root, net }) -> Promise<{ destroy() }>   (main.js calls it from lobby onGameStart)
import { loadSheets } from './art/atlas.js';
import { createRenderer } from './render/index.js';
import { createHud } from './ui/hud.js';
import { createInput } from './input.js';
import { createTouch } from './ui/touch.js';
import { createPerf } from './ui/perf.js';
import { createMenu } from './ui/menu.js';
import { createLoop, measureRefreshHz } from './loop.js';
import { LEVELS, LABEL, RES_LABEL, applyQuality, applyOptions, loadLevel, saveLevel, loadOptions, saveOption, clearStored, detectDefaults, gatherHardwareInfo, createFpsGovernor } from './render/quality.js';
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
  const input = createInput({ canvas, renderer, send, hud, getState, mySid: () => net.mySid });

  const perf = createPerf(hudRoot, net);

  // graphics: hardware detection picks the preset + options; whatever the user changed by hand (stored overrides) wins per key.
  // The preset (Low/Medium/High) only sets fidelity; resolution / fps cap / bloom / vsync are separate options. The governor only ever lowers the preset.
  let hw = gatherHardwareInfo({ gl: renderer.gl.getContext() });
  let det = detectDefaults(hw);
  let level = loadLevel(det.level), opts = { resolution: det.resolution, fps: det.fps, bloom: det.bloom, vsync: det.vsync, ...loadOptions() };
  let autoDropped = false, userPicked = false;
  const apply = () => { applyQuality(renderer, level); applyOptions(renderer, opts); };
  apply();
  const detText = () => 'Detected: ' + LABEL[det.level] + ', ' + RES_LABEL[det.resolution] + ', ' + det.fps + ' fps' + (det.bloom ? '' : ', no bloom');
  const perfKey = 'p2d.perf';
  const perfOn = (() => { try { return localStorage.getItem(perfKey) !== '0'; } catch { return true; } })();
  perf.setVisible(perfOn);
  const menu = createMenu(hudRoot, {
    level, options: opts, perfOn,
    onLevel(l) { level = l; saveLevel(l); applyQuality(renderer, l); if (autoDropped) userPicked = true; gov.reset(); },
    onOption(k, v) {
      opts = { ...opts, [k]: v }; saveOption(k, v); applyOptions(renderer, opts);
      if (k === 'fps') { loop.setFps(v); gov.setCap(v); gov.reset(); }
      if (k === 'vsync') loop.setVsync(v);
      if (k === 'resolution') gov.reset();
    },
    onDefaults() {
      clearStored(); det = detectDefaults({ ...hw, refreshHz: hz });
      level = det.level; opts = { resolution: det.resolution, fps: det.fps, bloom: det.bloom, vsync: det.vsync };
      autoDropped = userPicked = false; apply(); loop.setFps(opts.fps); loop.setVsync(opts.vsync); gov.setCap(opts.fps); gov.reset();
      menu.setLevel(level); menu.setOptions(opts); menu.setDetected(detText());
    },
    onPerf(on) { perf.setVisible(on); try { localStorage.setItem(perfKey, on ? '1' : '0'); } catch { /* storage off */ } },
    onOpen() { input.cancel && input.cancel(); },
  });
  menu.setDetected(detText());
  hud.toggleMenu = menu.toggle; hud.isMenuOpen = menu.isOpen;
  const gov = createFpsGovernor({
    onDrop() {
      const i = LEVELS.indexOf(level);
      if (i <= 0 || userPicked) return;
      level = LEVELS[i - 1]; autoDropped = true; saveLevel(level); applyQuality(renderer, level); menu.setLevel(level);
      menu.toast('Graphics lowered to ' + LABEL[level] + ' for smoother play - change in menu (' + (touch.isActive() ? '☰' : 'Esc') + ')');
    },
  });
  gov.setCap(opts.fps);

  const touch = createTouch({ root: hudRoot, canvas, renderer, hud, input, sheets, getState, mySid: () => net.mySid, send });

  const resize = () => renderer.resize(root.clientWidth, root.clientHeight);
  addEventListener('resize', resize);
  resize();

  const offFx = net.onFx((events) => { renderer.fx(events); hud.fx?.(events); });

  const me = () => net.state?.players?.get(net.mySid);
  let myTeam = -1, spec = false, centred = false, hz = 0;

  const frame = (now, dtMs) => {
    perf.frame(now); gov.feed(dtMs, now);
    const dt = Math.min(0.1, dtMs / 1000);
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
    if (hero && renderer.isShowcase()) {   // showcase close-up stays on the (interpolated) hero
      const hv = view.units.find((u) => u.id === view.myHeroId);
      if (hv) renderer.setTarget(hv.x, hv.y);
    }
    renderer.update(view, dt);
    hud.update(st, hero, net.mySid, view);
  };
  const loop = createLoop({ frame, fps: opts.fps, vsync: opts.vsync });
  loop.start();
  // high-refresh display on a capable machine: default the cap to 120 (unless the user already chose one)
  measureRefreshHz().then((h) => {
    hz = h; if (!h || det.tier !== 'good') return;
    const d2 = detectDefaults({ ...hw, refreshHz: h });
    if (d2.fps === det.fps) return;
    det = d2; menu.setDetected(detText());
    if (loadOptions().fps === undefined) { opts = { ...opts, fps: det.fps }; loop.setFps(det.fps); gov.setCap(det.fps); menu.setOptions({ fps: det.fps }); }
  });

  return {
    renderer, hud, input,
    destroy() {
      loop.destroy();
      removeEventListener('resize', resize);
      offFx?.();
      menu.destroy(); perf.destroy(); touch.destroy(); input.destroy(); hud.destroy();
      root.innerHTML = '';
    },
    chat: (text) => send(MSG.CHAT, { text }),
  };
}
