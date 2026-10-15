# Pixel2Dota

**▶ Play: https://leandromeiramedeiros.github.io/Pixel2Dota/** (rebuilt from `main` on every push)

Nothing to install.

## Play with friends

1. Open the Play link, type your name and click **Create lobby**.
2. Click **Copy link** and send it to your friends. They open it and click **Join**.
3. Pick heroes, fill empty slots with **+ Bot** or **Fill with bots**, and click **Start match**.

No link? Friends can type the 4-letter code into **Join** or pick the lobby from **Open lobbies**.

The game server runs on a free cloud plan that sleeps when nobody plays. The first lobby after a quiet spell may take about a minute while the lobby shows "Waking up the server". After that it's instant.

## Run your own server (optional)

For LAN parties or development. Needs [Node 24+](https://nodejs.org).
```
git clone https://github.com/leandromeiramedeiros/Pixel2Dota.git
cd Pixel2Dota
npm install
npm run build
node server/src/index.js
```
Open http://localhost:2567. Friends on your network open `http://<your-LAN-IP>:2567`. The public Play page can't use a server on your own computer, because browsers block https pages from reaching local addresses.

To deploy the public server yourself: on [render.com](https://render.com) choose **New → Blueprint** and pick this repo (it reads `render.yaml`). Then set the repo variable `P2D_SERVER` to the service address so the Play page connects to it.

## About

Pixel2Dota is Dota 2 in the browser, played on the real Dota 2 map. An authoritative Colyseus server runs the simulation at 30 Hz. The Three.js
client draws every unit, building, tree and the terrain as voxels in a low-res pixel target. Players create or join a lobby, bots fill empty
slots, and the match runs until an ancient falls.

## Goal

The full Dota match experience: in-game feature parity, the full roster and the voxel look. The parity backlog and the conversion state are in
[docs/PROGRESS.md](docs/PROGRESS.md). Out of scope, for good: ranked, replays, demos, profiles, anything outside the match.

Today: 13 heroes (Invoker with the full orb kit; Rubick can steal any spell), lanes, creeps, towers, barracks, neutrals, Roshan + Aegis, wards,
about 41 items, bots, day/night, fog of war, and desktop and touch controls.

## Requirements

- Node 24 or newer. The repo has no `engines` field, so this is not enforced. Development uses Node v24.
- npm (npm workspaces: `shared`, `server`, `client`).
- Only needed to regenerate game data with `npm run bake`: a local Dota 2 install. The bake reads the Steam game files (see `tools/bake.mjs`). Normal play does not need it.

## Install and run

```
npm install
```

Run the server and the client in two terminals:

```
node server/src/index.js        # terminal 1: Colyseus server on port 2567
npx vite client --port 5180     # terminal 2: Vite dev client
```

Open http://localhost:5180. The client connects to the server on port 2567. To test with two players, open the page in two browser windows.

Production build:

```
npm run build                   # builds client/dist
npm start                       # starts the server
```

The server serves `client/dist` when it exists, so open http://localhost:2567.

## Test cheats

For local testing, start the server with cheats on: `node --env-file=tools/cheats.env server/src/index.js` (sets `P2D_CHEATS=1`). Then type these in the in-game chat: `-gold N`, `-lvlup N`, `-killancient` (destroys the enemy ancient and ends the match). Without the env var, these are ordinary chat messages.

## Controls

From the header of `client/src/input.js`, plus Esc from the same file:

| Input | Action |
|---|---|
| Right-click | Move, or attack a unit under the cursor |
| A + left-click | Attack-move |
| S | Stop |
| H | Hold position |
| Q W E R | Cast abilities |
| D F | Cast Invoker's invoked spells |
| Ctrl + ability key | Learn ability |
| Z X C V B N | Use items (B opens the shop when slot 5 is empty) |
| Shift | Queue orders |
| Alt + key, or the same key twice | Self-cast |
| Esc | Cancel targeting or close the shop; otherwise opens the in-match menu (Resume, graphics Low/Medium/High, FPS/ping, Quit) |
| F4 | Toggle shop |
| Tab (hold) | Scoreboard |
| Enter | Chat |
| Y | Toggle camera lock |
| F1 or Space | Center camera on hero |
| Mouse wheel | Zoom |
| Screen edge, arrow keys, middle-drag | Pan |

## Develop

```
npm test                                    # node --test over shared, server and client (includes voxel mesh checks)
node tools/soak.mjs                         # short headless sim run: timing and event counts
node tools/fullmatch.mjs [minutes] [seed]   # headless 10-bot match; reports progression and whether it ends
```

Rules:
- **Push to `main` deploys** the Pages client and the Render server. Work on a branch, and run `npm test` and `npm run build` before merging.
- **Public repo.** No secrets, and no Valve files (models, textures, icons, sounds). All art is procedural JS in `tools/art/` and `shared/vox/`.
- **Never `npm run dev`:** its watcher respawns servers on :2567. Run `node server/src/index.js` and `npx vite client --port 5180` instead.
- **Visuals need a director verdict.** Send screenshots and never self-certify (see [docs/ART-DIRECTION.md](docs/ART-DIRECTION.md)).

## Project layout

```
shared/          Pure data and helpers used by server and client (map, protocol, hero roster, baked data in data/)
server/src/      Colyseus server: index.js (entry, port 2567), room/ (lobby and match room, schema), sim/ (authoritative simulation)
server/src/sim/  Simulation in plain JS, no Colyseus imports; abilities/ has one file per hero
server/test/     Server tests
client/src/      Vite client: main.js (boot), game.js (match), input.js (controls)
client/src/net/  Colyseus client wrapper, state mirror, interpolation
client/src/render/  Three.js renderer: voxel units (voxactors, voxmesh), terrain, lights, post, particles, fog; fx/ has spell and item VFX
client/src/art/  Icon sheets, portraits, and the sprite atlas (sprites retire after the voxel conversion)
shared/vox/      Voxel models, kit and palettes (browser-safe, also used by the offline tools)
client/src/ui/   DOM HUD, lobby, shop, minimap, scoreboard
tools/           bake.mjs and vpk/vdf readers (game-file bake), art/ (voxel renders, portraits, icons, legacy sprite generators), soak.mjs, fullmatch.mjs
docs/            Architecture, decisions and progress notes
reference/trainer/  Read-only copies of InvokerTrainer code used for porting; not imported at runtime
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): core concepts and contracts. Layout, coordinates, camera, network, sim, data flow, render systems.
- [docs/EXTENDING.md](docs/EXTENDING.md): checklists to add a hero, a voxel model, an item, a 3D spell fx, a quality setting.
- [docs/ART-DIRECTION.md](docs/ART-DIRECTION.md): the look and the rules for new art.
- [docs/VOXEL.md](docs/VOXEL.md): the voxel pipeline (models, kit, mesher, runtime) and the conversion order.
- [docs/DECISIONS.md](docs/DECISIONS.md): decisions in force (sources, hero simplifications, items, match rules, rendering).
- [docs/PROGRESS.md](docs/PROGRESS.md): what exists, the parity backlog and the voxel conversion state.
- [server/src/sim/API.md](server/src/sim/API.md): the simulation API for abilities, items and bots.
