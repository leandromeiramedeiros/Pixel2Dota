# Pixel2Dota

**▶ Play: https://leandromeiramedeiros.github.io/Pixel2Dota/** (rebuilt from `main` on every push)

The page is only the game client. Matches run on a game server that one player (the host) runs on their own machine. Everyone opens the page and points it at that server.

## Create a lobby (host)

1. Install [Node 24+](https://nodejs.org), then:
   ```
   git clone https://github.com/leandromeiramedeiros/Pixel2Dota.git
   cd Pixel2Dota
   npm install
   node server/src/index.js
   ```
   The server listens on port 2567.
2. Open the Play link. The lobby's **Server** field defaults to `ws://localhost:2567`, which is your own server. If Chrome asks to allow access to devices on your local network, allow it.
3. Type your name and click **Create lobby**. You get a 4-letter code.
4. Pick a hero, or click **Take slot** to switch team. Add bots with **+ Bot** or **Fill with bots**, then click **Start match**.

**Let friends reach your server.** The Play page is served over https, so friends can only reach your server over a secure (`wss://`) address. The simplest way is a free tunnel:
```
cloudflared tunnel --url http://localhost:2567
```
It prints an address like `https://something.trycloudflare.com`. Paste it into the **Server** field, click **Connect**, then create the lobby. **Copy link** in the lobby copies an invite link that already contains the server and the code.

On the same LAN you can skip Pages and the tunnel: run `npm run build` once, start the server, and friends open `http://<your-LAN-IP>:2567`.

## Join a lobby

- **With an invite link:** open it. The server and code are filled in. Type your name and click **Join**.
- **With a code:** open the Play link, paste the host's address into **Server**, click **Connect**, type the 4-letter code and click **Join**. You can also pick the lobby from **Open lobbies**.

## About

Pixel2Dota is a 5v5 Dota 2-style game that runs in the browser. It plays on the real Dota 2 map with an authoritative Colyseus server (30 Hz simulation) and a Three.js client that draws pixel-art sprites over a 3D tile terrain. Players create or join a custom lobby, bots fill empty slots, and a match runs until one side's ancient is destroyed.

## Scope

In scope:
- Custom lobby only. Create a lobby (it gets a 4-letter code), or join one by code or from the open-lobby list. Radiant and Dire have 5 slots each. The host adds or kicks bots, fills empty slots with bots, and starts the match.
- Normal Dota map: three lanes, creep waves every 30 s from 0:00, towers, barracks, two ancients, fountains, shop at the fountain. Day/night cycle affects vision and lighting only.
- 10 heroes: Invoker, Sven, Lina, Lion, Crystal Maiden, Axe, Sniper, Zeus, Drow Ranger, Juggernaut. Invoker has the full orb/invoke kit (10 spells).
- Simple item set: consumables, basics, built items, recipes that auto-combine, 6 slots, no stash or courier. Teleport Scroll, Blink, Black King Bar, Power Treads and others.
- XP, levels, skill points, gold, deaths and respawn.
- Bots for lane play, fighting, retreat and buying.
- 30 Hz server simulation. The server sends one state patch per tick. The client interpolates units about 100 ms behind.
- 2.5D rendering: 3D tile terrain with height, cliffs and ramps, plus 2D billboard sprites for units, creeps, buildings and trees. Dota camera at 1134 units distance, 60 degree pitch, 70 degree FOV. Bloom, rim light, point lights, GPU particle effects and client-side fog of war.
- HUD: portrait, HP/mana, abilities, items, minimap, shop, scoreboard, kill feed, chat.

Out of scope: ranked, replays, demos, a learn tab, player profiles. The match rules also leave out neutral creeps, runes, Roshan, outposts, wards, couriers, glyph, buyback, talents and Aghanim's Scepter.

Note: fog of war is drawn on the client only. The server sends all unit positions to every client.

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
| Esc | Cancel targeting, close shop, or clear selection |
| F4 | Toggle shop |
| Tab (hold) | Scoreboard |
| Enter | Chat |
| Y | Toggle camera lock |
| F1 or Space | Center camera on hero |
| Mouse wheel | Zoom |
| Screen edge, arrow keys, middle-drag | Pan |

## Tests and headless tools

```
npm test                              # node --test over shared, server and client test folders
node tools/soak.mjs                   # short headless sim run; prints timing and event counts
node tools/fullmatch.mjs [minutes] [seed]   # headless 10-bot match (default 40 min, seed 1); reports progression and whether it ends
```

## Project layout

```
shared/          Pure data and helpers used by server and client (map, protocol, hero roster, baked data in data/)
server/src/      Colyseus server: index.js (entry, port 2567), room/ (lobby and match room, schema), sim/ (authoritative simulation)
server/src/sim/  Simulation in plain JS, no Colyseus imports; abilities/ has one file per hero
server/test/     Server tests
client/src/      Vite client: main.js (boot), game.js (match), input.js (controls)
client/src/net/  Colyseus client wrapper, state mirror, interpolation
client/src/render/  Three.js renderer: terrain, sprites, lights, post, particles, fog; fx/ has spell and item VFX
client/src/art/  Sprite-sheet loader and atlas; sheets/ holds the generated pixel sheets
client/src/ui/   DOM HUD, lobby, shop, minimap, scoreboard
tools/           bake.mjs and vpk/vdf readers (game-file bake), art/ (pixel-art generators), soak.mjs, fullmatch.mjs
docs/            Architecture, decisions and progress notes
reference/trainer/  Read-only copies of InvokerTrainer code used for porting; not imported at runtime
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the contract between modules. Coordinates, camera, rendering pipeline, network messages, schema, simulation modules and shared data shapes.
- [docs/DECISIONS.md](docs/DECISIONS.md): data sources, the hero roster and simplifications, the item set and match rules.
- [docs/PROGRESS.md](docs/PROGRESS.md): milestone checklist and known issues.
- [docs/ART-COMPARE.md](docs/ART-COMPARE.md): side-by-side art comparison with InvokerTrainer.
