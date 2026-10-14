// Lina -- STYLE-GATE pilot: three hand-pixeled stills (s, se, e). NOT the runtime sheet; never writes client/src/art/sheets.
//   node tools/art/heroes/lina2d.mjs  -> writes lina_gate.png + frame data into $LINA_OUT (default: the p5b scratchpad)
// Method: 2D vector parts -> flat hue-shifted banded shading -> selective outline -> hand-typed detail rows (see lina2d_kit.mjs / lina2d_views.mjs).
// Frame W x H = 88 x 102, anchor = bottom-centre between the feet (ANCHOR = [44, 101]); runtime px:2.
import fs from 'node:fs';
import path from 'node:path';
import { W, H, ANCHOR, sheetPng, toSheet } from './lina2d_kit.mjs';
import { views } from './lina2d_views.mjs';

const OUT = process.env.LINA_OUT || '/tmp/claude-0/-home-user-Pixel2Dota/c9e83333-9da1-5b23-a0ee-99f9a6f02ba6/scratchpad/p5b';
const cvs = [views.s(), views.se(), views.e(), views.portrait()], names = ['idle_s_0', 'idle_se_0', 'idle_e_0', 'portrait'];
fs.mkdirSync(OUT, { recursive: true });
const a = sheetPng(cvs, [4, 1]);
fs.writeFileSync(path.join(OUT, 'lina_gate.png'), a.png);
fs.writeFileSync(path.join(OUT, 'lina_gate_sheet.json'), JSON.stringify(toSheet(cvs, names)));
console.log('wrote', path.join(OUT, 'lina_gate.png'), a.w + 'x' + a.h, 'frame', W + 'x' + H, 'anchor', ANCHOR);
