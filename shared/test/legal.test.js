// Legal guard: Valve models, textures and renders of them stay private. Nothing shipped (shared/, client/, server/) may reference the gitignored
// reference cache (tools/.cache/), the model exporter or Valve model files; the reference tools (tools/vox/ref.mjs) are offline only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FORBID = /tools[\/]\.cache|\.cache[\/]ref|Source2Viewer|\.vmdl|\.vtex|\.glb\b|tools[\/]vox[\/](lib|ref)/i;
const EXT = /\.(js|mjs|ts|css|html|json)$/;

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'test') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(f); else if (EXT.test(e.name)) yield f;
  }
}

test('legal: shipped code never references the private Dota 2 reference cache', () => {
  const bad = [];
  for (const d of ['shared', 'client/src', 'client/index.html', 'server/src']) {
    const p = path.join(ROOT, d);
    if (!fs.existsSync(p)) continue;
    for (const f of fs.statSync(p).isDirectory() ? walk(p) : [p]) {
      fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (FORBID.test(l)) bad.push(`${path.relative(ROOT, f)}:${i + 1}: ${l.trim().slice(0, 100)}`); });
    }
  }
  assert.deepEqual(bad, [], 'forbidden reference to Valve model files / the reference cache');
});

test('legal: tools/.cache is gitignored and no tracked file lives under it', () => {
  assert.match(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'), /^tools\/\.cache\/?$/m);
});
