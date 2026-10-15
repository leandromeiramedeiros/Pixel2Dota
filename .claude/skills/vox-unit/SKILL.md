---
name: vox-unit
description: Create or rework voxel units (heroes, creeps, neutrals, buildings) from a Dota 2 reference, one or many per run; use for any "make/redo the voxel <unit>" task.
---

# Voxel unit workflow

Read `docs/VOXEL.md` (grids, kit, rules) once. Samples: `shared/vox/heroes/lina.js`, `shared/vox/creeps/melee_radiant.js`.

## Reference
`npm run vox:ref` renders the game model into the gitignored `tools/.cache/ref/` (a cache, regenerated on demand).

## Loop (per unit)
1. **Reference.** `npm run vox:ref -- <short|npc key>` (`list` shows every game unit; `heroes` / `creeps` / `neutrals` / `buildings` / `props` / `all` for batches; `props` = static map props `prop_<group>_<name>_<radiant|dire|any>`: trees, cliffs, rocks, clutter, views + sheet only, no anims;
   ~1-3 s per unit cached, ~10 s a hero cold). Read `tools/.cache/ref/<short>/sheet.png` FIRST (5 views + one frame per anim + palette), and
   `poses.png` (rows = idle / run / attack / cast / stunned / death, 4 frames each) when building `ANIMS`; `ref.json` lists the sequences. Then
   `npm run vox:brief -- <short>`: proportions, palette, anims, grid class, rig guess, kit parts, files, checklist.
2. **Signature reads.** Write 3-4 lines: what makes it recognizable at a glance (silhouette, head / horns / hair shape, one colour block, the
   weapon / glow). Chibify: big head and signature parts, short legs, drop detail that will not survive 4.2 u voxels.
3. **Model.** `shared/vox/<heroes|creeps|neutrals>/<short>.js` from the nearest sample: `META { rig, grid, cx, cy }`, `build(pose)`, `ANIMS`
   (`LIBRARY[rig]` + `withPoses`). Build on `parts.js` / `rig.js` / `mats.js`; if a part is missing, add it to `parts.js` generally (params, not a
   one-off) so the next unit reuses it. Then ONE registry line in `shared/vox/index.js` (`kind`, `unit` npc key, `mod`).
4. **Check.** `npm run vox:check -- <short>` (grid, feet z 0, walls, tiers, mesh). Fix until green.
5. **Look.** `npm run vox:shot -- <short> --small` -> `tools/art/out/<short>_vox_small.png`; view it next to `sheet.png`, fix the biggest
   difference (`npm run vox:view -- <short> --poses` puts ref and voxel in one image). Max 3 look-and-fix rounds.
6. **Full sheet.** `npm run vox:shot -- <short>` -> `docs/voxel-chibi/<short>_vox.png`. Send it to the creative director (SendUserFile) with
   the signature reads (skill `vox-view` for a ref-vs-voxel compare image; never commit it). Never self-certify visuals.
7. **After approval.** Register in `VOX_UNITS` (`client/src/render/voxactors.js`, `voxEntry(MOD, { unit, max, lean })`; buildings `lean: false`).
   Heroes: `npm run vox:portrait -- <short>` (optional `PORTRAIT` export for framing). `npm test` and `npx vite build client` pass.

## Director rules
- Dota 2 likeness at a glance; chibi proportions; restraint (no noise, no whiteout bloom, subtle emissive).
- Heroes: one colour scheme, no `team: true`. Lane creeps: Radiant and Dire are two distinct models, no team tint.
- Emissive only for eyes + signature / spell parts, always with a `tier` (eye 1.0, signature 1.2, spell 1.6); per-hero `gain` allowed (cap 0.5-1.8).
- Densities: characters 4.2 u/voxel (size by voxel count); hero ~44 voxels, creep 25-29, creep < hero < Roshan.
- Faces -y, feet z 0, hair = shell with a face window, likeness lives in a few params.

## Batching
- Build several units per run: `vox:ref -- <a>` ... for all first, read all sheets, then model them in order of similarity so `parts.js`
  additions are shared. Keep the loop per unit; check with `vox:check -- all` at the end.
- Reuse and extend `parts.js` / `poses.js` / `mats.js`; no per-unit scripts (the tools iterate `shared/vox/index.js`).
- Report per unit: file, signature reads, rounds used, sheet path. Do not commit unless asked.
- Never run `npm run dev`; do not edit `voxactors.js` before the director approves (registration is step 7).
