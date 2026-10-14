// Touch controls: pure-logic tests (no DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from '../../shared/data.js';
import { TEAM, KIND, ST } from '../../shared/protocol.js';
import {
  T, touchWanted, isPortrait, castClass, selfCastTarget, arcLayout, angleDiff, joyShouldSend, dragVector, aimWorldOffset,
  snapUnit, pickAttackTarget, cycleCandidates, pinchGoal, validTarget,
} from '../src/ui/touch.js';

const unit = (o) => Object.assign({ id: 'u', kind: KIND.CREEP, team: TEAM.DIRE, x: 0, y: 0, hp: 100, status: 0, respawn: 0 }, o);
const vis = () => true;

test('touchWanted: ?touch flag beats the pointer media query', () => {
  assert.equal(touchWanted('?touch=1', false), true);
  assert.equal(touchWanted('?server=x&touch=1', false), true);
  assert.equal(touchWanted('?touch=0', true), false);
  assert.equal(touchWanted('', true), true);
  assert.equal(touchWanted('', false), false);
  assert.equal(touchWanted('?touch=off', true), false);
});

test('isPortrait', () => {
  assert.equal(isPortrait(true, 844, 390), true);
  assert.equal(isPortrait(false, 390, 844), true);
  assert.equal(isPortrait(false, 844, 390), false);
});

test('castClass: every ability and item gets a sane class', () => {
  for (const kind of ['ability', 'item']) {
    const table = kind === 'item' ? DATA.items : DATA.abilities;
    for (const key of Object.keys(table)) {
      const { cls, info } = castClass(kind, key, 1);
      assert.ok(['instant', 'self', 'aim', 'passive'].includes(cls), key);
      if (info.mode === 'none') assert.equal(cls, 'instant', key);
      if (info.mode === 'passive') assert.equal(cls, 'passive', key);
      if (cls === 'aim') assert.ok(['unit', 'point', 'unitpoint'].includes(info.mode), key);
    }
  }
});

test('castClass: representative spells', () => {
  assert.equal(castClass('ability', 'invoker_quas', 1).cls, 'instant');
  assert.equal(castClass('ability', 'invoker_invoke', 1).cls, 'instant');
  assert.equal(castClass('ability', 'invoker_ghost_walk', 1).cls, 'instant');
  assert.equal(castClass('ability', 'invoker_forge_spirit', 1).cls, 'instant');
  assert.equal(castClass('ability', 'drow_ranger_frost_arrows', 1).cls, 'instant');   // toggle
  assert.equal(castClass('item', 'item_blink', 1).cls, 'self');
  assert.equal(castClass('ability', 'invoker_alacrity', 1).cls, 'self');
  assert.equal(castClass('ability', 'lina_laguna_blade', 1).cls, 'aim');
  assert.equal(castClass('ability', 'mirana_arrow', 1).cls, 'aim');
  assert.equal(castClass('ability', 'sniper_headshot', 1).cls, 'passive');
});

test('selfCastTarget: blink goes along the facing at max range; unit spells hit the hero', () => {
  const hero = { id: 'h1', x: 100, y: 200, facing: 0 };
  const blink = selfCastTarget(castClass('item', 'item_blink', 1).info, hero);
  assert.equal(blink.x, 100 + castClass('item', 'item_blink', 1).info.range);
  assert.equal(Math.round(blink.y), 200);
  assert.deepEqual(selfCastTarget({ mode: 'unit', range: 700 }, hero), { unitId: 'h1' });
  const north = selfCastTarget({ mode: 'point', range: 500 }, { id: 'h', x: 0, y: 0, facing: Math.PI / 2 });
  assert.ok(Math.abs(north.x) < 1e-6 && Math.abs(north.y - 500) < 1e-6);
});

test('arcLayout: counts, no overlaps, left/up of the attack button', () => {
  for (const n of [0, 1, 3, 4, 5, 6]) {
    const L = arcLayout(n);
    assert.equal(L.length, n);
    const pts = L.map((p) => ({ x: p.r * Math.cos(p.a * Math.PI / 180), y: -p.r * Math.sin(p.a * Math.PI / 180) }));
    for (const p of pts) assert.ok(p.x < 40 && p.y <= 0, 'left/top of the attack button');
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) > 60, `${n}: ${i}/${j} overlap`);
  }
});

test('joystick throttle: 8 Hz or a >15 degree turn', () => {
  assert.equal(joyShouldSend(null, 0, 0), true);
  assert.equal(joyShouldSend({ t: 0, ang: 0 }, 0, 50), false);
  assert.equal(joyShouldSend({ t: 0, ang: 0 }, 0, T.JOY_MS), true);
  assert.equal(joyShouldSend({ t: 0, ang: 0 }, 20 * Math.PI / 180, 30), false);   // too soon even for a turn
  assert.equal(joyShouldSend({ t: 0, ang: 0 }, 20 * Math.PI / 180, 90), true);
  assert.equal(joyShouldSend({ t: 0, ang: 0 }, 10 * Math.PI / 180, 90), false);
  assert.ok(Math.abs(angleDiff(0.1, 2 * Math.PI - 0.1) - 0.2) < 1e-9);
});

test('dragVector / aimWorldOffset: y is flipped, drag radius maps to range', () => {
  const v = dragVector(0, -50, 50);
  assert.ok(Math.abs(v.ang - Math.PI / 2) < 1e-9);
  assert.equal(v.mag, 1);
  const o = aimWorldOffset(96, 0, 96, 700);
  assert.equal(o.x, 700); assert.equal(o.y, -0);
  const far = aimWorldOffset(0, -960, 96, 700);   // clamped to the pad edge
  assert.equal(far.y, 700); assert.equal(far.ky, -96);
  const half = aimWorldOffset(-48, 48, 96, 600);
  assert.equal(half.x, -300); assert.equal(half.y, -300);
});

test('pickAttackTarget: enemy heroes first, then other enemies; range = attack range + 300; hidden/invuln/dead skipped', () => {
  const hero = { x: 0, y: 0, atkRange: 150 };
  const units = [
    unit({ id: 'creep', x: 100, y: 0 }),
    unit({ id: 'hero', kind: KIND.HERO, x: 400, y: 0 }),
    unit({ id: 'ally', team: TEAM.RADIANT, x: 10, y: 0 }),
  ];
  assert.equal(pickAttackTarget(units, hero, TEAM.RADIANT, vis), 'hero');
  assert.equal(pickAttackTarget(units.slice(0, 1), hero, TEAM.RADIANT, vis), 'creep');
  assert.equal(pickAttackTarget([unit({ id: 'far', x: 460 })], hero, TEAM.RADIANT, vis), null);
  assert.equal(pickAttackTarget([unit({ id: 'near', x: 449 })], hero, TEAM.RADIANT, vis), 'near');
  assert.equal(pickAttackTarget([unit({ id: 'fog', x: 100 })], hero, TEAM.RADIANT, () => false), null);
  assert.equal(pickAttackTarget([unit({ id: 'inv', x: 100, status: ST.INVIS })], hero, TEAM.RADIANT, vis), null);
  assert.equal(pickAttackTarget([unit({ id: 'god', x: 100, status: ST.INVULN })], hero, TEAM.RADIANT, vis), null);
  assert.equal(pickAttackTarget([unit({ id: 'dead', x: 100, hp: 0 })], hero, TEAM.RADIANT, vis), null);
  assert.equal(pickAttackTarget([unit({ id: 'fount', kind: KIND.FOUNTAIN, x: 100 })], hero, TEAM.RADIANT, vis), null);
  assert.equal(pickAttackTarget([unit({ id: 'n', team: TEAM.NEUTRAL, x: 100 })], hero, TEAM.RADIANT, vis), 'n');
});

test('snapUnit: nearest valid unit to the aim point, team filtered', () => {
  const units = [unit({ id: 'e1', x: 500, y: 0 }), unit({ id: 'e2', x: 900, y: 0 }), unit({ id: 'a1', team: TEAM.RADIANT, x: 700, y: 0 })];
  const o = { team: 'ENEMY', myTeam: TEAM.RADIANT, visible: vis };
  assert.equal(snapUnit(units, 650, 0, o).id, 'e1');
  assert.equal(snapUnit(units, 800, 0, o).id, 'e2');
  assert.equal(snapUnit(units, 5000, 0, o), null);
  assert.equal(snapUnit(units, 700, 0, { team: 'FRIENDLY', myTeam: TEAM.RADIANT, visible: vis }).id, 'a1');
});

test('cycleCandidates: heroes first, then by distance', () => {
  const hero = { x: 0, y: 0 };
  const units = [unit({ id: 'c1', x: 100 }), unit({ id: 'h1', kind: KIND.HERO, x: 600 }), unit({ id: 'c2', x: 50 })];
  assert.deepEqual(cycleCandidates(units, hero, TEAM.RADIANT, vis, 900), ['h1', 'c2', 'c1']);
  assert.deepEqual(cycleCandidates(units, hero, TEAM.RADIANT, vis, 300), ['c2', 'c1']);
});

test('pinchGoal: spreading fingers zooms in, clamped to the rig limits', () => {
  assert.equal(pinchGoal(1200, 100, 200, 1134, 1200), 1134);
  assert.equal(pinchGoal(1150, 100, 100, 1134, 1200), 1150);
  assert.equal(pinchGoal(1150, 100, 50, 1134, 1200), 1200);
  assert.equal(pinchGoal(1150, 0, 50, 1134, 1200), 1150);
});

test('validTarget: respawning heroes are not targetable', () => {
  assert.equal(validTarget(unit({ respawn: 5 }), { team: 'ENEMY', myTeam: TEAM.RADIANT }), false);
  assert.equal(validTarget(unit({}), { team: 'ENEMY', myTeam: TEAM.RADIANT }), true);
});
