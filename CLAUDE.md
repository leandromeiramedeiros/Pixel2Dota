# Pixel2Dota

5v5 Dota 2 on the real map: authoritative Colyseus sim (30 Hz) + Three.js voxel client in a low-res pixel target. Plain JS ESM, npm workspaces.
Goal: full Dota 2 parity and the full roster. The user is the creative director.

## Read first (only what the task needs)
- `docs/ARCHITECTURE.md` contracts and layout · `docs/EXTENDING.md` add a hero / item / spell fx / setting / synced field
- `docs/VOXEL.md` + skill `.claude/skills/vox-unit` voxel models · `docs/ART-DIRECTION.md` the look · `docs/DECISIONS.md` rules in force · `docs/PROGRESS.md` roadmap
- Each module's header comment is its contract. Sim API: `server/src/sim/API.md`.

## Agent protocol
- Work on your own branch off `voxel`. Commit there. Never push or merge; the main session merges.
- Never run `npm run dev`. Never use ports 5180 or 2567 (the director's servers).
  Use vite on 5300+ (`npx vite client --port 53xx --strictPort`), game server `PORT=259x node server/src/index.js`, headless Chrome. Kill what you start.
- `npm test` green before reporting. Run `npm run build` if you touched the client.
- Never self-certify visuals. Save screenshots under `tools/.cache/view/` and report their absolute paths.
- Visual work passes an independent reviewer agent (checklist: `.claude/skills/vox-unit/SKILL.md` "Review") before it reaches the director.
- Report: commit hash, what changed (terse), screenshot paths, open questions. No recap.
- Commit message trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (or your model).

## Lean rules
- One roster list: `shared/heroes.js`. Numbers come from the bake (`tools/bake.mjs`, local Dota 2 install); the sim never hard-codes them.
- One file per hero per layer: `server/src/sim/abilities/<short>.js`, `client/src/render/fx/<short>.js`, `shared/vox/heroes/<short>.js`.
- Registries (`VOX_UNITS` + its imports in `client/src/render/voxactors.js`, `shared/vox/index.js`): one entry per line, alphabetical within a group. Insert in order so parallel branches merge clean.
- Shared helpers (`render/fx/geo3d.js`, `shared/vox/parts.js`): append-only, generic, documented at the file top.
- Every parity feature lands with sim tests + bot behaviour + HUD.
- Docs hold the current state only, lean; history lives in git. Update the doc you made stale; don't add new docs.
- Reuse before writing: check `shared/`, `render/fx/common.js`, `tools/lib/` first.

## Art direction (details: ART-DIRECTION.md)
- Every unit is a chibi of its Dota 2 model, recognizable at a glance. Everything is voxel except FX. One colour scheme per hero (no team tint).
- The Last Night + Noita: vivid frame, subtle tight bloom, never whiteouts; crisp 1-px particles; 3D geometry FX (geo3d tubes/discs/bolts), stepped bands, no dither.
- Quality scales across Low / Medium / High / Ultra. Predictable hitboxes and click priority (idle-frame pick box).

## Commands
`npm test` · `npm run bake` · `npm run vox:{ref,brief,check,shot,portrait,view} -- <short>` · `node tools/fullmatch.mjs 30 1` (headless bot match)
Sandbox: `client/sandbox.html` (fxdemo: `__fx.fire('<ability_key>')`, `__fx.all()`).
