# Current state and open items

History lives in `git log`. This page is only what exists now and what is open.

## Done
- Match: real map, lanes, creeps, 22 towers, 12 barracks, ancients, fountains, shop; neutral camps, Roshan + Aegis, wards; ~41 items; XP/gold/respawn; win + end screen.
- 13 heroes playable (full Invoker; Rubick steals every roster spell incl. Invoker's). Bots: lane, fight, retreat, buy, TP rebuy, team group-push from 22 min
  (10-bot headless match ends in ~24-30 min, `node tools/fullmatch.mjs`).
- Net: 30 Hz authoritative sim, adaptive interpolation delay, rejoin reclaims the hero, spectators, lobby with codes / open list / invite links; public deploy
  (GitHub Pages client + Render server).
- Render: 3D tile terrain, 3D buildings/trees/clutter, upright-card sprite depth, 32-light pool with 10 cube-shadowed spell lights + height-field fallback,
  key-light shadows, bloom/DoF/SSR/scatter post with adaptive exposure (no whiteouts), ring telegraphs in 3D, spell vision, spell wind, fog, quality presets.
- Input: desktop keyboard/mouse (6 main + 3 backpack inventory, swap drag); touch (joystick, aim-drag with aim sensitivity, wheel of 6 spells + 6 item shortcuts, bag, last-hit, peek drag, pinch, menu).
- Camera: one director (`render/camdir.js`): follow with lead and aim lean, teleport cuts, instant player pans, hold-Space follow, touch peek; minimap draws the real view quad.
- Art: v2 approved by the director. v3 pilots landed (verdicts pending): base ambiance, shadows, clutter, 3D VFX (Sun Strike, Laguna Blade, Freezing Field),
  8-dir 2x sprite pilot (Lina).
- Tests: `npm test` green (shared, server, client; pure-logic tests for render, touch, wind, quality, fx coverage).

## Open
- Art backlog (cloud session, see [CLOUD-HANDOFF.md](CLOUD-HANDOFF.md) P3-P7): readable Dota-like icons; real 8-dir 2x bodies + portraits for Pudge, Mirana, Rubick
  (stand-ins now: `BODY_STANDIN` in `render/actors.js`); Lina redo then 8-dir 2x for the other 12 heroes; ~37 spells still particle-only -> 3D fx.
- Director verdicts pending: v3 pilots, tower-destruction blast size, fog darkness, weak `sniper_headshot` / gold icons.
- iPhone retest: rejoin (move + learn after reclaim), rubber-banding, Low vs High, menu, zoom 1450.
- Camera feel (`render/camdir.js` `CAMERA_FEEL`: lead, aim lean, peek, springs) tuned by tests only: needs a play pass (desktop + phone) and a director verdict.
- Render free tier cold start (~1 min) UX not verified on a real spin-up.
- Neutrals have no abilities; single Roshan pit; no HUD ward stock display.
- Perf reference: ~2.4 ms median frame (RTX 5070 Ti, 835x397 target, mid-lane fight); sim ~0.2 ms/tick with 10 bots.
