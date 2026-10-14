# Cloud session brief: Pixel2Dota

You are the lead of a Claude Code cloud session that continues an existing project. Read this file, then
`docs/PROGRESS.md`, `docs/ARCHITECTURE.md`, `docs/ART-DIRECTION.md` and `docs/DECISIONS.md`. After that,
work through the backlog below without waiting for further instructions.

## The goal (unchanged since day one)

Build a simple 5v5 Dota in the browser:
- Colyseus/WebSocket networking.
- 10+ simple heroes, Invoker first.
- Custom lobby only, on the Dota 2 normal map, with the simple items.
- Nothing outside the match: no demo, no replays, no ranked, no learn tab, no profile.
- Art direction of the "Dota 2 Trainer" style: Three.js 2.5D, pixel-art sprites, heavy particle simulation, bloomy VFX and plenty of rim light.

The **user is the creative director**:
- Ask for verdicts on art with screenshots.
- Never self-certify visuals.
- Keep messages to the user terse.

## Parallel work with the local session

Another Claude session (on the user's PC) works on the same repo **at the same time**:
- **Local session owns P0, P1, P2 and P8:** net, input, menu, quality presets, renderer lights/post/exposure, bots. Don't touch `client/src/net/`, `client/src/input.js`, `client/src/ui/menu.js`, `client/src/render/{index,post,lights,quality}.js`, `server/`.
- **You own P3, P4, P5, P6 and P7:** icons, hero sheets/portraits, sprites, per-spell fx (`client/src/art/`, `tools/art/`, `client/src/render/fx/`, `client/src/render/actors.js` stand-in table).
- **Before every push:** `git pull --rebase origin main`, re-run `npm test`, then push. Never force-push.
- `docs/PROGRESS.md`: only append under your own heading to avoid conflicts.

## Budget and orchestration (2 full 5-hour windows today, Claude Pro)

- **Opus (you):** plan, review diffs, make the decisions, run the final verification, commit and push. Don't hand-write large features yourself; delegate them.
- **Sonnet subagents:** implement one backlog item each, with a precise spec, file list and acceptance tests. Run up to 2 or 3 in parallel only when their files don't overlap.
- **Haiku subagents:** grep/explore, run the tests, do mechanical edits, write PROGRESS notes.
- **Window 1:** P3 → P4.
- **Window 2:** P5/P6 pilots for the creative director's verdict, then P6 batches.
- Leave about 10% of each window to update `docs/PROGRESS.md` and push.

**Rules for subagents (put them in every agent prompt):**
- Never run `git commit`, `stash`, `checkout` or `reset`. The lead commits.
- Use your own ports: agent N runs the game server on `2567+N` (`PORT=2568 node server/src/index.js`) and vite on `5190+N`.
- Don't use python heredocs; write scripts to files.
- Kill only your own ports when done.

## Hard rules

- **The repo is PUBLIC.** Never commit secrets, tokens or Valve-extracted binaries (models, textures, sounds from the game files).
- **Push to `main` redeploys everything:**
  - GitHub Pages client: `https://leandromeiramedeiros.github.io/Pixel2Dota/`.
  - Render game server and client: `https://pixel2dota.onrender.com` (free tier, Virginia). It sleeps when idle, and the first request takes about a minute.
- **Before every push:** `npm test` must be green (163 tests now) and `npm run build` must pass. Push each finished item; don't batch.
- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (or your own model name).
- **Local dev:** run `node server/src/index.js` (port 2567) and `npx vite client --port 5190`. Don't use `npm run dev`; its watcher respawns servers.
- **VFX stay toned down:**
  - Only spells and items cast big lights.
  - Basic attacks, towers and creeps stay under the bloom threshold (~1.4). See `client/src/render/fx/projectiles.js` (`p.atk`, `ATK_LIGHT`).
- **Camera:**
  - Desktop distance is 1134, the max. Zooming all the way in reaches a showcase close-up.
  - Touch starts at 1300 (matches the desktop playfield once the touch HUD is accounted for) and can pinch out to 1450.
  - Sprites always scale with perspective (`spritePersp: 1`).
- **Approved by the creative director:**
  - Rejoining a live match takes your hero back (by stored seat id or unique name).
  - Boot auto-rejoins the last live match.

## Environment limits in the cloud

- **No local Dota 2 install:** `tools/bake.mjs` and the VPK tools can't run. Game data is already baked into `shared/data/*.js`. Edit the gameplay numbers there or in `server/src/sim`.
- **Art is procedural JS:**
  - Hero and world sheets are in `client/src/art/sheets/*.js` (pixel rows) and `tools/art/`. Icons are in `client/src/art/sheets/icons.js`.
  - `reference/trainer/` holds the original Trainer reference (look and lighting notes).
- **There is no GPU.** For visual checks, use headless Chromium (Playwright with SwiftShader): low resolution, a few frames, screenshot to a file, then show the user.
- **Testing logic:**
  - Prefer Node probes: a Colyseus client script that creates a room, picks a hero, fills with bots, starts, then sends orders. Example flow is in `server/test/room.test.js`.
  - Headless sim: `tools/soak.mjs`, `tools/fullmatch.mjs`.
- **Network:** the environment needs network access to `pixel2dota.onrender.com` and `github.io` for live checks.

## Current state (Oct 14)

All of `docs/PROGRESS.md` is done:
- The map: lanes, towers, rax and ancients.
- 13 heroes, including full Invoker, plus Pudge, Mirana and Rubick.
- Neutrals, Roshan and wards.
- About 38 items.
- Bots.
- Fog of war, HUD and shop.
- Touch controls (joystick, hold-to-aim with rangefinder, the left hand pans while aiming).
- Lobby with spectators.
- Live server on Render.

Commits from the last session:
- `fcef77c` / `234be8b`: seat reclaim on rejoin. Live matches are no longer `lock()`ed; `onAuth` refuses strangers instead. `Player.claim`, `net.resume()` fallback, HUD tag RECONNECTING/SPECTATING, lobby pixel cloud badge + "waking up" state.
- `42ad86e`: anti rubber-band. `client/src/net/clock.js` stamps snapshots by server sim time, with an adaptive interpolation delay of 70–350 ms.
- **Still unconfirmed on a real iPhone:**
  - Can the player move and learn skills again after rejoining?
  - Is the rubber-banding gone?
  - Ask the user for an iPhone retest when they're around.

## Backlog (priority order, with acceptance criteria)

**P0. Live sanity after deploy**
- Probe `wss://pixel2dota.onrender.com` with a Node Colyseus client: create, fill, start, move, learn, then disconnect and rejoin by name. The rejoiner must control the hero.
- Report to the user and ask for the iPhone retest.

**P1. In-match menu and graphics quality**
- Esc on desktop, plus a ☰ button on touch near the top-right buttons.
- Menu items:
  - Resume.
  - Graphics: Low / Medium / High.
  - Show FPS/ping.
  - Quit to lobby (`dispatchEvent(new Event('p2d:return-lobby'))`).
- Quality maps onto the renderer `settings` in `client/src/render/index.js`:
  - Keys: `pixelScale`, `bloom`, `shadows`, `lights`, `particles`, `ambient`, `clutter`, `outlines`.
  - Low = no shadows, no ambient, no clutter, `particles` 0.5, bloom on but cheap.
- Persist the choice in localStorage.
- Default to Low on iOS/Android, and auto-drop one level if the median FPS stays under 40 for 10 s (tell the player once).
- Acceptance:
  - The menu works with mouse and touch, and it doesn't steal game input while closed.
  - Low preset measurably cuts frame time: log `perf` before and after.
  - Tests added for the preset mapping.

**P2. Fight blowout**
- Big teamfights white out the screen. Cap the summed light intensity per pixel and/or the exposure, and limit how many spell lights stack.
- Acceptance: a scripted 10-hero fight with spells (cheats `P2D_CHEATS=1`, chat `-lvlup 25`) shows no full-white frames.
- Show before/after screenshots to the user.

**P3. Readable ability and item icons**
- Mirana's and other abilities look grey/weak at the HUD size. `sniper_headshot` and the gold icon are weak too.
- Give them stronger silhouettes and contrast in the Trainer palette.
- Send a contact sheet of all icons to the user for a verdict.

**P4. Real bodies and portraits for Pudge, Mirana and Rubick**
- They currently use stand-ins (`BODY_STANDIN` in `client/src/render/actors.js`) and have no portraits.
- Follow the existing sheet format of the other heroes.
- Get a creative-director verdict with screenshots.

**P5. Lina redo, then 8-direction 2x sprites**
- Lina: grounded stance, Dota silhouette.
- After her pilot is approved, do 8-dir 2x sprites for the other 12 heroes, one hero per Sonnet agent.

**P6. Remaining spells to 3D VFX**
- About 37 spells still need it.
- Pilots that already exist: Sun Strike, Laguna Blade, Freezing Field (`client/src/render/fx/geo3d.js`).
- Batch by hero. Keep bloom restrained and lights only on spells and items.

**P7. Ask the creative director**
- Is the tower-destruction blast too big?
- Is the fog of war too dark?

**P8. Gameplay polish**
- Bots push timidly; bot-only matches take 45–50 min.
- The Invoker bot levels slowly.

## Key files

- **`shared/`:** protocol (MSG/ORDER/EV), constants (CAMERA), the map, baked data (`shared/data`).
- **`server/src/room/MatchRoom.js`:** lobby, join/rejoin (`seatFor`, `pl`, `clientOf`), sim → schema sync.
- **`server/src/sim/`:** world, orders, combat, abilities, items, bots, neutrals, wards. API notes are in `server/src/sim/API.md`.
- **Client core:**
  - `client/src/net/index.js` (Colyseus wrapper, interpolation, resume/rejoin).
  - `client/src/net/clock.js`.
  - `client/src/game.js` (glue).
  - `client/src/main.js` (boot).
- **`client/src/render/`:** Three.js renderer, camera (`camera.js`), post/bloom, lights, shadows, particles. Per-hero fx are in `render/fx/*.js`.
- **`client/src/ui/`:** `hud.js`, `touch.js` (mobile controls), `lobby.js` / `lobby.css`, `perf.js` (ping/FPS/status).
- **`client/src/input.js`:** desktop mouse/keyboard.

## End of each window

1. Update `docs/PROGRESS.md`: check off what's done and refresh the next items.
2. Push.
3. Send the user a short list of what changed, with screenshots of anything visual, plus the open questions.

### Note from the local session (2026-10-14)
- `c.ringDecal` (fx/common.js) now draws a geo3d TARGET disc plus a coloured ground light instead of the stretched `decal_ring_target` sprite (the director called it blocky). Every call site keeps its signature; `grow` is now a radius multiplier; `light: false` skips the light. Don't reintroduce `decal_ring_target` at large scales.
- geo3d `outCol` and beams.js no longer use the Bayer ordered dither (it read as a fine white grid). Use stepped bands instead.
