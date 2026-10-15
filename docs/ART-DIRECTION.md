# Art direction

The user is the creative director: every visual change gets a screenshot and a verdict. Never self-certify visuals.

## The look
- **Base style: voxel chibi in a pixel target** (director, 2026-10-15). Every unit, building, tree, clutter prop and the terrain is voxel, rendered into
  the low-res target so it reads as crisp pixel art: dark outline, 4-step hue-shifted ramps, 9-level Bayer-quantised lighting, strong rim light on units.
  Method and conversion order: [VOXEL.md](VOXEL.md). The pixel HUD keeps the Trainer palette (dark purple panels, gold/pink frames; orb
  colours Quas cyan / Wex magenta / Exort orange). Camera: 3D at the Dota distance / pitch.
- **Lighting and particles: The Last Night + Noita.** Vivid, bright frame (full exposure, saturated unit colours), cool teal only in the deepest shadows, warm practical lights (towers, fountain, ancient, lanterns,
  spells) with volumetric beams and a faint wide scatter. Bloom is a tight, high-threshold halo on emissive pixels only; **no whiteouts** (adaptive
  exposure + hue-preserving roll-off, see ARCHITECTURE "Pipeline"). Particles are crisp 1-art-pixel squares that fly on arcs, land and cool white -> yellow
  -> orange -> red -> dark; soft blobs only for small cores and haze. Saturated colour is reserved for emissive things.
- **Voxel densities:** characters 4.2 world units per voxel, world (terrain, buildings, trees, clutter) 8.4. Proportions follow Dota (creep < hero < Roshan).
- **FX are not voxel:** spell fx keep 3D geometry (tubes, discs, ribbon bolts) plus particles; projectiles unchanged; ground telegraphs are shader discs
  (`c.ringDecal`), stepped bands, no dither.
- **Readability first:** units, HP bars and telegraphs stay readable over the dark grade; the gameplay band stays crisp (tilt-shift DoF is minimal at play
  distance and only ramps up toward the showcase close-up).

## Rules for new art (director, 2026-10-14)
1. **Bodies:** every unit is a voxel model built with the shared kit (`shared/vox/`), Dota silhouette, chibi proportions for characters. Lina is the
   pilot (`shared/vox/lina.js`). Death = the model breaks into falling voxels.
2. **Portraits:** rendered offline from the voxel model with dramatic studio light (key, warm fill, strong rim, dark backdrop), shown at 32x42 in the HUD.
   Ability and item icons are the only sprites left (the sprite pipeline is removed after the voxel conversion); they stay painted pixel art, close to the Dota 2 art (likeness, composition, colour key), readable at 20x20.
3. **Hand-authored only.** Never copy, trace or extract Valve files (models, textures, icons, sounds). Procedural generators in `tools/art/` are the medium.
4. **Lights, bloom and depth** follow the limits in [ARCHITECTURE.md](ARCHITECTURE.md) "Render systems": big lights only from spells and items, attacks/towers/creeps
   under the bloom threshold, ground fx as 3D discs at terrain height.

## Palette anchors
Grass day ~RGB 43,81,36 (Trainer measured); fire orange-red, ice cyan-white, lightning blue-white, Sun Strike gold; fx palettes in `client/src/render/fx/common.js PAL`.
Reference frames live in `docs/shots/` (`trainer-ref-*`, `north-star-spell-light.png`, `v3-lina-sheet.png`) and `docs/voxel-chibi/`.
