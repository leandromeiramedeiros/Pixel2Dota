---
name: vox-view
description: show the director a unit's Dota reference and/or its voxel model, side by side, from one command
---

# Show a unit to the director

1. Run `npm run vox:view -- <short|npc key> [--ref|--vox|--both] [--poses]` (`--both` is the default; `--poses` adds the same anims, ref frames | voxel frames).
   It prints the PNG path: `tools/.cache/view/<short>.png`. Reference exports are cached; a first run for a unit takes ~2-15 s.
2. Send that PNG with SendUserFile (display render) and ONE short caption (unit, what is shown).
3. Never commit, copy into the tree, publish or put it under `docs/`: it contains private Dota 2 reference renders (the dir is gitignored).

Rows: REF (front, 3/4, side, back, top) over VOX (same camera). No voxel model in `shared/vox/index.js` -> the reference only (it says so). Unit names: `npm run vox:ref -- list`.
