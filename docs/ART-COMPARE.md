# Art direction: InvokerTrainer vs Pixel2Dota

Reference frames:
- Trainer: [trainer-ref-midlane.webp](shots/trainer-ref-midlane.webp) (an in-game capture the user supplied to the trainer project as a target, from InvokerTrainer/reference/user/midlane_ingame.webp) and [trainer-ref-night-live.jpg](shots/trainer-ref-night-live.jpg) (a live free-play capture at night).
- Pixel2Dota: [render-night-fx.jpg](shots/render-night-fx.jpg), [fx-invoker-emp-night.jpg](shots/fx-invoker-emp-night.jpg), [fx-lina-lsa-night.jpg](shots/fx-lina-lsa-night.jpg), [hud.png](shots/hud.png).

| Trait | Trainer | Pixel2Dota | Match |
|---|---|---|---|
| Sprites | Chunky pixel chibi with a dark 1-px outline | Same sprite style; Invoker uses the trainer's sheet (ported generators in tools/art) | Yes |
| Hero portraits and icons | Pixel portraits; orb icons in cyan, magenta and orange | Same portraits and orb colours; the 10 spell icons are ported | Yes |
| HUD | Dark purple panels with gold and pink frames, pixel font, Invoker orb cluster | Same panel palette, frames and pixel font; the layout is Dota-style (top bar, minimap, shop) | Yes |
| Lighting | Dark night tint, warm dithered pools around units (InvokerTrainer/js/render/gl.js: light grid with 9-level Bayer quantise) | Bayer-quantised light pass, warm point lights, night tint | Yes |
| Spell FX | Glow-canvas bloom added over the scene (gl.js: col += .85*bloom); additive spell sprites in js/render/fx.js. Neither saved frame shows a cast, so this cell comes from the code | GPU particles plus bloom in the orb palette, plus per-hero colours | Yes, but stronger |
| Rim light | Sprite rim pass (gl.js: uRimT / uRimOn) | Strong rim on sprites and trees (asked for in the goal) | Yes, but stronger by design |
| Camera | Near top-down, flat tiles | 3D tile terrain with height, Dota camera at 1134 u and 60° pitch (asked for by the user) | Differs on purpose |
| Terrain palette | Muted teal-green forest, brown dirt, deep blue water | Brighter, more saturated green grass and brown lanes | Partial |
| Tree density | Dense canopy that fills the frame | Trees follow the real map tree list, so they are sparser near lanes | Partial |

The camera difference comes from the user's 2.5D brief: 3D terrain, 2D sprites, 1134 units, angled view. The terrain palette and tree density are the remaining visual gaps. They are listed under Known issues in PROGRESS.md.
