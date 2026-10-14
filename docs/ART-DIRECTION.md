# Art direction v2 (creative director brief, 2026-10-14)

The creative director's verdict on v1: "the art looks ugly, the bloom is too strong, and I don't see cool particles." The new direction is to take heavy inspiration from two games:
- The Last Night: https://store.steampowered.com/app/612400/The_Last_Night/
- Noita: https://store.steampowered.com/app/881100/Noita/

Buildings become simple 3D meshes. Sprite buildings resize unevenly and look wrong.

## What we take from each reference (from their Steam screenshots)

**The Last Night**
- Low-key frame. Most of the image is dark, and the mid-tones lean cool (teal and blue).
- Practical lights do the work: warm orange lamps against cool teal and magenta accents.
- Volumetric haze and light shafts. Light scatters in the air around sources instead of blowing out to white.
- Wet, reflective ground catches light sources.
- The bloom is soft and local. It is a halo around a source, not a whole-screen wash.

**Noita**
- Unlit areas are near-black; emissive sources (fire, spells, lava, torches) provide the light.
- Particles are single pixels. Explosions throw hundreds of 1-px sparks that fly on ballistic arcs, fall, land, and cool from white to yellow to orange to red to dark before they vanish.
- Fire and embers flicker pixel by pixel. The glow around sparks is warm and small-radius.
- Saturated emissive colour against desaturated, dark material colour.

## Rules for Pixel2Dota

1. **Bloom:** a tight, high-threshold glow for emissive pixels only. Atmospheric haze is a separate, faint, wide scatter tinted by the light colour. Nothing goes to flat white except the cores of sparks.
2. **Grade:** darker base exposure, cool shadows and warm lights. Saturated colour is reserved for emissive things.
3. **Particles:** crisp 1-art-pixel squares by default. Colour cools along a stepped ramp (white, yellow, orange, red, dark). Particles fall under gravity, land on the terrain and linger briefly as cooling grains. Spells spawn many small sparks rather than a few big soft blobs. Soft glow blobs are used only for small cores and very faint haze.
4. **Buildings:** simple low-poly 3D meshes with flat or vertex colour, lit by the same lights as the scene (ambient, key light, point lights, rim, fog). They render into the same low-res target, so they pixelate exactly like the terrain. Emissive parts (crystals, windows, braziers) feed the bloom and act as practical lights.
5. **Trees:** low-poly instanced 3D, lit like the buildings (the creative director: "TREES 3D TOO").
6. **Terrain:** no hard grid seams. Tiles blend into each other with dithered, pixel-crisp organic edges. Add macro colour variation, cliff lips and cliff ambient occlusion, and shore foam.
7. **Water:** screen-space reflections (SSR), with bright lights turning into bokeh.
8. **Gameplay readability:** units, HP bars and spell telegraphs stay readable over the darker grade.

## Hero reference (creative director: "ITS BEAUTIFUL")

The reference is a The Last Night street frame: a character on a bridge, a hover-car with yellow headlights, a neon city behind, and a wet street in front. What to copy from it:
- **Atmospheric perspective:** distant things dissolve into teal-green haze. Contrast and saturation fall off with depth. For us, the far (top) part of the screen fades into tinted haze.
- **Volumetric beams:** warm yellow light cones cut through the haze from practical lights. For us: towers, the fountain, the ancient, lanterns and spells.
- **Wet reflective ground:** light sources reflect in the foreground as blurred, coloured bokeh discs. For us: river and water tiles first, then rain-wet lanes at night.
- **Depth of field:** the foreground (bottom of the screen) and the far background are soft, and the gameplay band in the middle stays crisp. This is a tilt-shift band on our angled camera.
- **Palette:** teal and green ambient against saturated warm yellow and orange, with magenta and cyan neon accents. Emissive colours are the only fully saturated colours.
- **Pixels stay crisp in the gameplay band.** The lighting and atmosphere are smooth and high-resolution over them.
