# Cloud session brief: Pixel2Dota

> **Note to the contractor (2026-10-14): Leandro ordered the last cloud session's work scrapped.** Everything it made was deleted on his
> order. That covers:
> - redrawn icons
> - Pudge / Mirana / Rubick bodies and portraits
> - the Lina 2D redo
> - the in-game voxel Lina (3D voxel mesh, floating, glowing eyes)
> - the new grass terrain and the brighter-characters change
>
> Its PR (leandromeiramedeiros/Pixel2Dota#1) was closed unmerged, and its branch was deleted. Only the voxel chibi reference stays,
> **offline only and not used by the game**: [VOXEL-CHIBI.md](VOXEL-CHIBI.md), with the voxel Lina model, the renders, the terrain
> reference and the chibi reference images. The backlog below is unchanged and still open (P3-P7).

You lead a Claude Code cloud session on this repo. Read this file, then [ARCHITECTURE.md](ARCHITECTURE.md), [EXTENDING.md](EXTENDING.md) (the checklists),
[ART-DIRECTION.md](ART-DIRECTION.md), [DECISIONS.md](DECISIONS.md) and [PROGRESS.md](PROGRESS.md). Then work the backlog below without waiting.

## Goal
A simple 5v5 Dota in the browser: Colyseus networking, 10+ simple heroes (Invoker first), custom lobby only on the normal map with simple items, nothing
outside the match. Art in the "Dota 2 Trainer" style: Three.js 2.5D pixel sprites, heavy particles, restrained bloom, plenty of rim light.
The **user is the creative director**: ask for verdicts with screenshots, never self-certify visuals, keep messages terse.

## Ownership split (a local session works on the same repo at the same time)
- **Local session owns** net, input, menu, quality presets, renderer lights/post/exposure, bots. Don't touch `client/src/net/`, `client/src/input.js`,
  `client/src/ui/menu.js`, `client/src/render/{index,post,lights,quality,wind}.js`, `server/`.
- **You (P3-P7):** icons, hero sheets/portraits, sprites, per-spell fx: `client/src/art/`, `tools/art/`, `client/src/render/fx/`, the `BODY_STANDIN` table in
  `client/src/render/actors.js`, `client/src/fxdemo.js`.
- Before every push: `git pull --rebase origin main`, `npm test`, `npm run build`, then push. Never force-push. Push each finished item.
- `docs/PROGRESS.md`: edit only the "Open" list for your items.

## Hard rules
- **Public repo.** Never commit secrets, tokens or Valve-extracted binaries (models, textures, icons, sounds). All art is hand-authored procedural JS.
- **Push to `main` redeploys** the Pages client and the Render server (free tier, sleeps when idle, ~1 min wake).
- Commit trailer: `Co-Authored-By: <your model name> <noreply@anthropic.com>`.
- Local dev: `node server/src/index.js` + `npx vite client --port 5190`; subagent N uses ports `2567+N` / `5190+N`. Never `npm run dev` (its watcher respawns servers).
- Subagents never run `git commit/stash/checkout/reset`; the lead commits. No python heredocs. Kill only your own ports.
- Cloud limits: no Dota install (`npm run bake` can't run; edit `shared/data/*.js` by hand), no GPU (visual checks = headless Chromium/Playwright with SwiftShader,
  low res, screenshot to a file, show the user), logic checks = Node probes / `tools/fullmatch.mjs` / `node --test`.
- **Director requirements (2026-10-14):**
  - Every NEW body is 8 directions at the 2x detail level from day one (`px: 2`), not 4-dir stand-in quality; grounded stance, Dota silhouette.
  - Every new portrait and icon is more detailed and closer to the Dota 2 art (likeness, composition, colour key, shading ramps, highlights, texture), still pixel art,
    readable at HUD size. Hand-author; never copy Valve files.
  - Ring telegraphs: `c.ringDecal` draws a geo3d TARGET disc + ground light (`grow` = radius multiplier, `light: false` skips the light). Don't reintroduce
    `decal_ring_target` at large scales. No Bayer ordered dither on geo3d fx / beams: stepped bands.
  - Depth rule: sprites sort per pixel at true height above the foot; ground fx must be geo3d discs/quads at `heightAt`, never sprites drawn below their pivot.
  - VFX toned down: only spells and items cast big lights; attacks, towers, creeps under the bloom threshold (~1.4, `fx/projectiles.js ATK_LIGHT`).
  - Camera: desktop 1134 max, zoom in only to the showcase close-up; touch starts at 1450; sprites always scale with perspective.

## Backlog (priority order)
**P3. Readable ability and item icons** — Mirana's and other abilities read grey/weak at HUD size; `sniper_headshot` and the gold icon too. Stronger silhouettes
and contrast, Dota-like detail (rule above). `tools/art/icons/*.mjs` -> `node tools/art/icons/icons.mjs` -> `node tools/art/icons/check.mjs`. Icons now taken from the Trainer frames (`tools/art/icons/extract_trainer.mjs`) must be redrawn by hand as pixel art: keep the Valve/Dota icon style and composition, but no extracted pixels. Then retire the extractor.
Acceptance: contact sheet of all icons sent to the director; tests green.

**P4. Real bodies and portraits for Pudge, Mirana, Rubick** — stand-ins now (`BODY_STANDIN`), no portraits. Follow EXTENDING "Add a hero" step 5 (8-dir 2x via
`tools/art/heroes/<short>.mjs`, `portrait` frame, `check.mjs` ALL list, delete the stand-in entry). Acceptance: `node tools/art/contact8.mjs <short>` sheet +
in-game screenshot to the director; `check.mjs` clean.

**P5. Lina redo, then 8-dir 2x for the other 12 heroes** — Lina pilot first (grounded, Dota silhouette) for a verdict; then one hero per agent, same pipeline.
Acceptance per hero: contact sheet + in-game shot approved; tests green.

**P6. Remaining spells to 3D VFX** — ~37 spells are particle-only. Pilots: Sun Strike, Laguna Blade, Freezing Field (`fx/geo3d.js`, EXTENDING "3D fx"). Batch by
hero; bloom restrained, lights only on spells/items, depth rule. Acceptance: `client/test/fx.test.js` green, sandbox screenshot per batch to the director.

**P7. Ask the creative director** — is the tower-destruction blast too big? is the fog of war too dark?

## End of each work window
Update the "Open" list in `docs/PROGRESS.md`, push, send the user a short list of what changed with screenshots and open questions.
