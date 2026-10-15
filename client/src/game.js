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
import { LABEL, RES_LABEL, fpsLabel, applyQuality, applyOptions, levelOptions, normalizeOptions, loadLevel, saveLevel, loadOptions, saveOption, clearOptions, clearStored, detectDefaults, gatherHardwareInfo } from './render/quality.js';
import { MSG, TEAM } from '@p2d/shared/protocol.js';
import { POV } from '@p2d/shared/pov.js';
import { createSpectate } from './ui/spectate.js';
import { createPovStore, followGoal, stepFollow, visionKey, povStateMsg } from './pov.js';

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
  // opts.noPath: joystick moves (8 Hz, 300 u ahead) draw no order path
  const send = (type, payload, opts) => { net.send(type, payload); if (type === MSG.ORDER && !(opts && opts.noPath) && hud) hud.orderPath(payload); };
  let hud = null;
  hud = createHud(hudRoot, { send, renderer, sheets });
  const getState = () => net.state;
  const input = createInput({ canvas, renderer, send, hud, getState, mySid: () => net.mySid });

  const perf = createPerf(hudRoot, net);

  // graphics: hardware detection picks the level; a level (Low..Ultra) = preset (fidelity) + its option bundle (resolution / fps cap / bloom / dof / vsync),
  // and whatever the user changed by hand on top (stored overrides) wins per key. Decided at load only: nothing lowers it during a match.
  let hw = gatherHardwareInfo({ gl: renderer.gl.getContext() });
  let det = detectDefaults(hw);
  const storedLevel = loadLevel(null);
  let level = storedLevel || det.level, opts = { ...(storedLevel ? levelOptions(storedLevel) : normalizeOptions(det)), ...loadOptions() };
  const apply = () => { applyQuality(renderer, level); applyOptions(renderer, opts); };
  const applyLoop = () => { loop.setFps(opts.fps); loop.setVsync(opts.vsync); };
  apply();
  const detText = () => 'Detected: ' + LABEL[det.level] + ', ' + RES_LABEL[det.resolution] + ', ' + fpsLabel(det.fps) + ' fps' + (det.bloom ? '' : ', no bloom') + (det.dof ? ', DoF' : '');
  const perfKey = 'p2d.perf';
  const perfOn = (() => { try { return localStorage.getItem(perfKey) !== '0'; } catch { return true; } })();
  perf.setVisible(perfOn);
  const menu = createMenu(hudRoot, {
    level, options: opts, perfOn,
    onLevel(l) {   // preset + the level's option bundle; manual option overrides are forgotten
      level = l; saveLevel(l); clearOptions(); opts = levelOptions(l); apply(); applyLoop(); menu.setOptions(opts);
    },
    onOption(k, v) {
      opts = { ...opts, [k]: v }; saveOption(k, v); applyOptions(renderer, opts);
      if (k === 'fps') loop.setFps(v);
      if (k === 'vsync') loop.setVsync(v);
    },
    onDefaults() {
      clearStored(); det = detectDefaults({ ...hw, refreshHz: hz });
      level = det.level; opts = normalizeOptions(det);
      apply(); applyLoop();
      menu.setLevel(level); menu.setOptions(opts); menu.setDetected(detText());
    },
    onPerf(on) { perf.setVisible(on); try { localStorage.setItem(perfKey, on ? '1' : '0'); } catch { /* storage off */ } },
    onOpen() { input.cancel && input.cancel(); },
  });
  menu.setDetected(detText());
  hud.toggleMenu = menu.toggle; hud.isMenuOpen = menu.isOpen;

  const touch = createTouch({ root: hudRoot, canvas, renderer, hud, input, sheets, getState, mySid: () => net.mySid, send });

  const resize = () => renderer.resize(root.clientWidth, root.clientHeight);
  addEventListener('resize', resize);
  resize();

  const offFx = net.onFx((events) => { renderer.fx(events); hud.fx?.(events); });

  // spectator "player perspective": relayed player cameras / orders (server MSG.POV, spectators only) + the control panel; players send their own camera below
  const povStore = createPovStore();
  const spectate = createSpectate(hudRoot, { sheets, onChange: () => { povCam = null; lastSel = undefined; } });
  const offPov = net.onPov((m) => {
    if (!m || typeof m.s !== 'string') return;
    if (m.o) { if (spectate.state.mode === 'pov' && m.s === spectate.state.sid) hud.povOrder(m.o); } else povStore.push(m, performance.now());
  });
  let povCam = null, lastSel, lastVis = -3, wasPov = false, povSent = null, povSentAt = 0;

  const me = () => net.state?.players?.get(net.mySid);
  let myTeam = -1, spec = false, centred = false, hz = 0;

  const frame = (now, dtMs) => {
    perf.frame(now);
    const dt = Math.min(0.1, dtMs / 1000);
    const st = net.state; if (!st) return;
    const p = me();
    // spectators see both teams' vision (free roam; Radiant reads as the friendly green side, like Dota's spectator view);
    // player perspective = that player's team, with its fog (fog checkbox on) or full reveal (off)
    const isSpec = !!p && p.team === TEAM.SPEC;
    spectate.update(st.players, isSpec);
    const povP = isSpec && spectate.state.mode === 'pov' ? st.players.get(spectate.state.sid) : null;
    const pov = povP && (povP.team === TEAM.RADIANT || povP.team === TEAM.DIRE) ? povP : null;
    const vt = pov ? pov.team : isSpec ? TEAM.RADIANT : p ? p.team : myTeam;
    const vspec = isSpec && !(pov && spectate.state.fog);
    if (vt !== myTeam || vspec !== spec) { myTeam = vt; spec = vspec; renderer.setMyTeam(myTeam); }
    const vk = visionKey(isSpec, pov ? pov.team : null, spectate.state.fog);
    if (vk !== lastVis) { if (lastVis !== -3 && renderer.fog && renderer.fog.reset) renderer.fog.reset(); lastVis = vk; }   // another vision perspective: its own explored memory
    const view = net.view(now);
    view.myTeam = myTeam; view.spectator = spec;
    if (isSpec && !centred) { renderer.setTarget(0, 0); centred = true; }
    view.myHeroId = pov ? pov.heroId || '' : p?.heroId || '';
    view.povSid = pov ? pov.sid : '';
    const hero = view.myHeroId ? st.units.get(view.myHeroId) : null;
    hud.setPovPick(isSpec && spectate.state.mode === 'pov' ? (q) => spectate.pick(q.sid) : null);
    if (pov) {
      const e = povStore.get(pov.sid, now), hv = view.units.find((u) => u.id === view.myHeroId);
      const g = followGoal(e, hv || hero);
      if (g) {
        const first = !povCam; povCam = stepFollow(povCam, g, dt);
        if (first) renderer.snapTarget(povCam.x, povCam.y); else renderer.setTarget(povCam.x, povCam.y);
        renderer.setDistance(g.d);
      }
      const sel = e ? e.sel : '';
      if (sel !== lastSel) { lastSel = sel; hud.select(sel || null); renderer.setSelected(sel || null); }
      hud.setPovAim(e && e.tg ? e.tg : null, e ? e.ax : null, e ? e.ay : null);
      wasPov = true;
    } else if (wasPov) {   // back to free roam: drop the borrowed selection / aim, keep the camera where it is
      wasPov = false; povCam = null; lastSel = undefined; hud.select(null); renderer.setSelected(null); hud.setPovAim(null);
    }
    // players: tell the spectators where my camera is and what I aim (throttled, only while a spectator is seated)
    if (p && (p.team === TEAM.RADIANT || p.team === TEAM.DIRE) && now - povSentAt >= POV.SEND_MS) {
      povSentAt = now;
      let anySpec = false; st.players.forEach((q) => { if (q.team === TEAM.SPEC) anySpec = true; });
      if (anySpec) {
        const t = renderer.getTarget(), m = povStateMsg({ x: t.x, y: t.y, d: renderer.getDistance() }, hud.selected, hud.povAim(), povSent, now, povSentAt - POV.SEND_MS);
        if (m) { povSent = m; send(MSG.POV, m); }
      }
    }
    if (hero && !centred) { renderer.setTarget(hero.x, hero.y); centred = true; }
    if (hero && renderer.isShowcase()) {   // showcase close-up stays on the (interpolated) hero
      const hv = view.units.find((u) => u.id === view.myHeroId);
      if (hv) renderer.setTarget(hv.x, hv.y);
    }
    renderer.update(view, dt);
    hud.update(st, hero, net.mySid, view);
  };
  const loop = createLoop({ frame, fps: opts.fps, vsync: opts.vsync, refreshHz: hz });
  loop.start();
  // MAX fps without vsync paces at the display refresh: measure it once the loop runs
  measureRefreshHz().then((h) => { hz = h; loop.setRefresh(h); });

  return {
    renderer, hud, input,
    destroy() {
      loop.destroy();
      removeEventListener('resize', resize);
      offFx?.(); offPov?.();
      spectate.destroy(); menu.destroy(); perf.destroy(); touch.destroy(); input.destroy(); hud.destroy();
      root.innerHTML = '';
    },
    chat: (text) => send(MSG.CHAT, { text }),
  };
}
