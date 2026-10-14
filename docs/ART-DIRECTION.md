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
5. **Gameplay readability:** units, HP bars and spell telegraphs stay readable over the darker grade.
