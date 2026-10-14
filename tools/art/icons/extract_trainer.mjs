// Loads the trainer's icon frames (20x20, own palette) from reference/trainer/art/icons.js (read-only reference).
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
let src = fs.readFileSync(path.join(ROOT, 'reference/trainer/art/icons.js'), 'utf8');
src = src.slice(src.indexOf("IT.Art.sheet('icons'"), src.indexOf('// ---- hand-drawn scenario-HUD'));
let captured = null;
const IT = { Art: { sheet: (n, d) => { if (n === 'icons') captured = d; } } };
new Function('IT', src)(IT);
export const TRAINER = captured;
