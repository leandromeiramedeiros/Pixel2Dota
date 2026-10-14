// Static FX coverage (no three.js, no fx module import): node --test client/test/fx.test.js
// Reads client/src/render/fx/*.js as text, collects R.spell(...) keys, and checks every non-passive hero ability is covered.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA } from '../../shared/data.js';
import { HEROES, HERO_KEYS } from '../../shared/heroes.js';

const FX_DIR = fileURLToPath(new URL('../src/render/fx/', import.meta.url));
const IGNORED = new Set(['invoker_empty1', 'invoker_empty2']);

const fxSources = fs.readdirSync(FX_DIR).filter((f) => f.endsWith('.js')).sort()
  .map((f) => ({ name: f, text: fs.readFileSync(path.join(FX_DIR, f), 'utf8') }));

// Collect string literals in the first argument of every R.spell( call: 'key' | ['k1', 'k2'].
function spellKeys(text) {
  const keys = new Set();
  const re = /\bR\.spell\(\s*(\[[^\]]*\]|'[^']*'|"[^"]*")/g;
  let m;
  while ((m = re.exec(text))) {
    for (const s of m[1].matchAll(/'([^']*)'|"([^"]*)"/g)) keys.add(s[1] ?? s[2]);
  }
  return keys;
}

const covered = new Set();
for (const f of fxSources) for (const k of spellKeys(f.text)) covered.add(k);

// Ability keys the hero roster exposes, plus Invoker's invoked spells.
const allKeys = new Set();
for (const hk of HERO_KEYS) for (const k of HEROES[hk].abilities || []) allKeys.add(k);
for (const k of HEROES.npc_dota_hero_invoker.invoked || []) allKeys.add(k);

const isPassive = (k) => {
  const a = DATA.abilities[k];
  return !!a && Array.isArray(a.behavior) && a.behavior.includes('PASSIVE');
};

test('fx: every non-passive hero ability key has an R.spell handler', () => {
  assert.ok(covered.size > 0, 'found R.spell registrations');
  const missing = [...allKeys].filter((k) => !IGNORED.has(k) && !isPassive(k) && !covered.has(k)).sort();
  assert.deepEqual(missing, [], 'missing FX handlers for: ' + missing.join(', '));
});

test('fx: passive detection is meaningful (roster has passives, invoker empties are passive)', () => {
  const passives = [...allKeys].filter(isPassive);
  assert.ok(passives.length > 0, 'some roster abilities are passive');
  assert.ok(isPassive('invoker_empty1') && isPassive('invoker_empty2'));
  assert.ok(!isPassive('sven_storm_bolt'), 'active ability is not passive');
});

test('fx: router index.js handles ATK, PROJ, PROJ_END and SPELL', () => {
  const idx = fs.readFileSync(path.join(FX_DIR, 'index.js'), 'utf8');
  for (const pat of [/\bEV\.ATK\b/, /\bEV\.PROJ\b/, /\bEV\.PROJ_END\b/, /\bEV\.SPELL\b/]) {
    assert.ok(pat.test(idx), `index.js references ${pat.source}`);
  }
});
