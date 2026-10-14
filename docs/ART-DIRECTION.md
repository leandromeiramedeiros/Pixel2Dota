# Art direction

The user is the creative director: every visual change gets a screenshot and a verdict. Never self-certify visuals.

## The look
- **Base style: "Dota 2 Trainer"** (InvokerTrainer, `reference/trainer/`): chunky pixel sprites with a 1-px dark outline and 4-tone shading, pixel HUD in
  the Trainer palette (dark purple panels, gold/pink frames), orb colours Quas cyan / Wex magenta / Exort orange, 9-level Bayer-quantised lighting on
  terrain and sprites, strong rim light on units. The camera is the one deliberate departure: 3D terrain at the Dota distance/pitch, not the Trainer's top-down.
- **Lighting and particles: The Last Night + Noita.** Low-key frame, cool teal/blue mid-tones, warm practical lights (towers, fountain, ancient, lanterns,
  spells) with volumetric beams and a faint wide scatter. Bloom is a tight, high-threshold halo on emissive pixels only; **no whiteouts** (adaptive
  exposure + hue-preserving roll-off, see ARCHITECTURE "Pipeline"). Particles are crisp 1-art-pixel squares that fly on arcs, land and cool white -> yellow
  -> orange -> red -> dark; soft blobs only for small cores and haze. Saturated colour is reserved for emissive things.
- **3D in the pixel target:** buildings, trees and ground clutter are low-poly flat-shaded meshes rendered into the same low-res target, so they pixelate
  like the terrain. Spell fx use 3D geometry (tubes, discs, ribbon bolts) plus particles; ground telegraphs are shader discs (`c.ringDecal`), stepped bands, no dither.
- **Readability first:** units, HP bars and telegraphs stay readable over the dark grade; the gameplay band stays crisp (tilt-shift DoF is minimal at play
  distance and only ramps up toward the showcase close-up).

## Rules for new art (director, 2026-10-14)
1. **Bodies:** every new hero body is 8 directions at 2x pixel density from day one (`px: 2`, dirs s/se/e/ne/n, west mirrored), grounded stance, Dota silhouette.
   Lina is the pilot sheet (`tools/art/heroes/lina.mjs`).
2. **Portraits and icons:** detailed and close to the Dota 2 portrait / ability / item art (likeness, composition, colour key), painted richer (shading ramps,
   highlights, texture), still pixel art and readable at HUD size (icons are 20x20 frames; the portrait frame is shown at 32x42 in the HUD).
3. **Hand-authored only.** Never copy, trace or extract Valve files (models, textures, icons, sounds). Procedural generators in `tools/art/` are the medium.
4. **Lights, bloom and depth** follow the limits in [ARCHITECTURE.md](ARCHITECTURE.md) "Render systems": big lights only from spells and items, attacks/towers/creeps
   under the bloom threshold, ground fx as 3D discs at terrain height.

## Palette anchors
Grass day ~RGB 43,81,36 (Trainer measured); fire orange-red, ice cyan-white, lightning blue-white, Sun Strike gold; fx palettes in `client/src/render/fx/common.js PAL`.
Reference frames live in `docs/shots/` (`trainer-ref-*`, `v2-*`, `v3-*`).
