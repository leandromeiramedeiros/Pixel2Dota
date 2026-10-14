// Boot: lobby screen -> game screen. The game (three.js, renderer, HUD) loads only when a match starts.
import { createNet, serverOverride, normalizeServer } from './net/index.js';
import { createLobby } from './ui/lobby.js';
import { mountFullscreenButton, guardLeave } from './ui/fullscreen.js';

const root = document.getElementById('app');
const net = createNet(serverOverride() || normalizeServer(import.meta.env?.VITE_P2D_ENDPOINT) || undefined);
let lobby = null, game = null;
const BOOT_MSG = (t) => '<div id="boot" style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#8e99b3;font:14px monospace">' + t + '</div>';

async function boot() {
  lobby?.destroy(); lobby = null;
  root.innerHTML = '';
  // reload during a match / lobby -> back into the room (60 s window), else back into the last live match by seat
  const note = setTimeout(() => { root.innerHTML = BOOT_MSG('Reconnecting to your match…'); }, 400);
  await net.resume();
  clearTimeout(note); root.innerHTML = '';
  guardLeave(false);
  lobby = createLobby(root, net, { onGameStart: startMatch });
}

async function startMatch() {
  lobby?.destroy(); lobby = null;
  root.innerHTML = BOOT_MSG('Loading match...');
  try {
    const { startGame } = await import('./game.js');
    game = await startGame({ root, net });
    (window.__p2d ||= {}).game = game;   // debug handle (renderer, hud, input)
    guardLeave(true);
  } catch (e) {
    console.error('[p2d] game failed to start', e);
    root.innerHTML = '<pre style="color:#ff6b5b;padding:20px;white-space:pre-wrap">Game failed to start:\n' + String(e?.stack || e) + '</pre>';
    return;
  }
}

// connection lost for good mid-match -> back to the lobby screen (lobby.js handles drops while it is shown)
net.onLeave(() => { if (!game) return; game.destroy(); game = null; boot(); });
// end screen 'Return to lobby': leave for good (clears the resume token, else boot() would rejoin the ended room)
addEventListener('p2d:return-lobby', () => { const g = game; game = null; net.leave(); g?.destroy(); boot(); });

mountFullscreenButton();
boot();
if (import.meta.hot) import.meta.hot.dispose(() => { lobby?.destroy(); game?.destroy(); });
window.__p2d = Object.assign(window.__p2d || {}, { net });
