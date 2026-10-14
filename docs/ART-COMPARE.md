# Art direction: InvokerTrainer vs Pixel2Dota

Reference frames (all in [shots/](shots/)):
- Trainer, live captures from InvokerTrainer free play:
  - [trainer-ref-day.jpg](shots/trainer-ref-day.jpg): mid lane in daylight.
  - [trainer-ref-cast-day.jpg](shots/trainer-ref-cast-day.jpg): the same view with meteors falling and ring FX.
  - [trainer-ref-night-live.jpg](shots/trainer-ref-night-live.jpg): night.
- Trainer target: [trainer-ref-midlane.webp](shots/trainer-ref-midlane.webp), an in-game capture the user gave the trainer project as a target (InvokerTrainer/reference/user/midlane_ingame.webp).
- Pixel2Dota:
  - [p2d-mid-day-before.jpg](shots/p2d-mid-day-before.jpg) / [p2d-mid-day-after.jpg](shots/p2d-mid-day-after.jpg): Radiant mid tier-1, before and after the tuning below.
  - Night FX: [render-night-fx.jpg](shots/render-night-fx.jpg), [fx-invoker-emp-night.jpg](shots/fx-invoker-emp-night.jpg), [fx-invoker-sunstrike-day.jpg](shots/fx-invoker-sunstrike-day.jpg), [fx-lina-lsa-night.jpg](shots/fx-lina-lsa-night.jpg).
  - HUD: [hud.png](shots/hud.png).

| Trait | Trainer | Pixel2Dota | Match |
|---|---|---|---|
| Sprites | Chunky pixel chibi with a dark 1-px outline | Same sprite style. The Invoker sheet and spell icons come from the trainer (tools/art/icons/extract_trainer.mjs) | Yes |
| Hero portraits and icons | Pixel portraits; orb icons in cyan, magenta and orange | Same portraits and orb colours | Yes |
| HUD | Dark purple panels with gold and pink frames, pixel font, Invoker orb cluster | Same panel palette, frames and pixel font. The layout is Dota-style (top bar, minimap, shop) | Yes |
| Lighting | Light grid with 9-level Bayer quantise (js/render/gl.js) and warm point lights | Bayer-quantised light pass and warm point lights | Yes |
| Spell FX | Glowing fireballs and bright additive rings over the scene, with bloom (trainer-ref-cast-day.jpg; gl.js `col += .85*bloom`) | GPU particles plus bloom in the same orb palette | Yes (stronger glow, as the goal asked for "bloomy VFX") |
| Rim light | Sprite rim pass (gl.js uRimT / uRimOn) | Rim on sprites and trees | Yes (stronger, as the goal asked for "lot of rimlight") |
| Grass colour (day, measured) | RGB 43,81,36, saturation 0.57 | Before: 55,110,44, saturation 0.61. After: 45,82,35, saturation 0.58 | Yes, after tuning |
| Tree size and canopy | Trees ~32-36 px wide; dense canopy along lanes | Before: 21-32 px wide, model scale ignored. After: 1.35x with the real model scale, so the canopy closes up (p2d-mid-day-after.jpg) | Yes, after tuning |
| Camera | Near top-down, flat tiles | 3D tile terrain with height; Dota camera at 1134 u and 60° pitch | Differs on purpose (the user's 2.5D brief) |

Night check after tuning: [p2d-mid-night-after.jpg](shots/p2d-mid-night-after.jpg), taken at the same spot mid-fade into the 5:00 night (night factor about 0.5; the hidden preview pane slows the transition), with a live Blade Fury in frame. Ground, trees and units stay readable, so the night ambient is unchanged.

How the colours were measured: mean colour and saturation of green-dominant pixels in matching grass areas of each screenshot.

Changes that closed the gaps:
- **Grass ramp:** a..e in tools/art/world/tiles.mjs now use the trainer's GRASS colours from InvokerTrainer js/render/terrain.js.
- **Day ambient:** lowered from 0.74 to 0.56 (client/src/render/index.js).
- **Tree sprites:** scaled 1.35x times the map's model scale (client/src/render/actors.js).
