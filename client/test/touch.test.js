// Touch controls: pure-logic tests (no DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from '../../shared/data.js';
import { TEAM, KIND, ST } from '../../shared/protocol.js';
import {
  T, touchWanted, isPortrait, castClass, selfCastTarget, arcLayout, angleDiff, joyShouldSend, dragVector, aimWorldOffset,
  snapUnit, pickAttackTarget, cycleCandidates, pinchGoal, validTarget, touchScale, aimShape, holdPhase, releaseAction, aimCancelled, inRect,
  smallArcLayout, loadItemOrder, saveItemOrder, itemMapKey, usableItem, packWheelItems, placeWheelItem, dropAction, BAG_POS, bagBox, aimJoy, rayToEdge, clampSens, aimRadius, loadAimSens, saveAimSens, SENS, SENS_STEPS,
} from '../src/ui/touch.js';
import { targetInfo } from '../src/ui/targeting.js';

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

test('touchScale: phone HUD ~20-25% smaller than before, tablet less; bk keeps buttons usable', () => {
  const p = touchScale(844, 390), t = touchScale(1024, 600);
  assert.ok(p.k >= 0.74 && p.k <= 0.82);
  assert.ok(t.k > p.k && t.k <= 1.15);
  assert.ok(88 * p.bk >= 76 && 59 * p.bk >= 48 && 47 * p.bk >= 40);
  assert.ok(88 * t.bk >= 76 && 59 * t.bk >= 48 && 47 * t.bk >= 40);
});

test('aimShape: skill shots, cones, AoE circles, none', () => {
  const info = (o) => Object.assign({ range: 1000, radius: 0 }, o);
  const arrow = aimShape('ability', 'mirana_arrow', 1, info({ range: 3000 }));
  assert.equal(arrow.type, 'line'); assert.ok(arrow.len > 0 && arrow.w0 > 0);
  assert.equal(aimShape('ability', 'drow_ranger_multishot', 1, info()).type, 'cone');
  assert.deepEqual(aimShape('ability', 'nonexistent', 1, info({ radius: 250 })), { type: 'circle', radius: 250 });
  assert.equal(aimShape('ability', 'nonexistent', 1, info()).type, 'none');
  assert.equal(aimShape('ability', 'lina_light_strike_array', 1, info({ radius: 250 })).type, 'circle');
});

test('holdPhase: tap < TAP_MS, hold, tooltip at 0.75 s, reorder at 1.75 s, moving = drag', () => {
  assert.equal(T.TIP_MS, 750); assert.equal(T.REORDER_MS, 1750);
  assert.equal(holdPhase(50, false), 'tap');
  assert.equal(holdPhase(T.TAP_MS, false), 'hold');
  assert.equal(holdPhase(749, false), 'hold');
  assert.equal(holdPhase(750, false), 'tip');
  assert.equal(holdPhase(1749, false), 'tip');
  assert.equal(holdPhase(1750, false), 'reorder');
  assert.equal(holdPhase(900, true), 'drag');        // moving past the threshold cancels the tooltip phase
  assert.equal(holdPhase(5000, true), 'drag');
});
test('releaseAction: tooltip / reorder releases never cast; taps preview aimed spells; instants cast', () => {
  assert.equal(releaseAction('tip', 'point'), 'none'); assert.equal(releaseAction('tip', 'instant'), 'none');
  assert.equal(releaseAction('reorder', 'unit'), 'none');
  assert.equal(releaseAction('tap', 'point'), 'preview'); assert.equal(releaseAction('tap', 'instant'), 'cast');
  assert.equal(releaseAction('hold', 'point'), 'cast'); assert.equal(releaseAction('drag', 'unit'), 'cast');
});
test('aimCancelled: cancel zone, or sliding back onto the button after leaving it', () => {
  const R = 30;
  assert.equal(aimCancelled(true, 200, 0, 200, R), true);
  assert.equal(aimCancelled(false, 5, 0, 5, R), false);                 // never left the button: quick tap / small wobble keeps its behaviour
  assert.equal(aimCancelled(false, 60, 0, 60, R), false);               // out aiming
  assert.equal(aimCancelled(false, 10, 5, 90, R), true);                // left, then came back onto the button
  assert.equal(aimCancelled(false, 40, 0, 90, R), false);               // back near but outside 0.9 R
});
test('inRect: edges and margin', () => {
  const r = { left: 10, top: 10, right: 20, bottom: 20 };
  assert.equal(inRect(r, 15, 15), true); assert.equal(inRect(r, 25, 15), false); assert.equal(inRect(r, 25, 15, 10), true);
});

// ---- wheel item slots + bag button / popover: geometry oracle at scale 1 (anchor = attack centre, y down), sizes = touch.js SZ
const P = (p) => ({ x: p.r * Math.cos(p.a * Math.PI / 180), y: -p.r * Math.sin(p.a * Math.PI / 180) });
const SZ = { atk: 88, ab: 59, lock: 44, lh: 40, wi: 40, cancel: 58 };
const ANCHOR = 10 + SZ.atk / 2;   // anchor centre px in from the right / bottom edge (scale 1)
test('smallArcLayout + BAG_POS + bagBox: clear of each other, the spells, attack / lock / LH / CANCEL, the screen and the top bar', () => {
  const lr = SZ.atk / 2 + SZ.lock / 2 + 4, hr = SZ.atk / 2 + SZ.lh / 2 + 2, K = touchScale(844, 390).bk;
  const fixed = [
    { ...P({ r: 0, a: 0 }), s: SZ.atk }, { ...P({ r: lr, a: 68 }), s: SZ.lock }, { ...P({ r: hr, a: 120 }), s: SZ.lh }, { x: 6, y: -252, s: SZ.cancel },
  ];
  const bag = { x: BAG_POS.x, y: BAG_POS.y, s: BAG_POS.size };
  for (const n of [0, 1, 2, 3, 4, 5, 6]) {
    const L = smallArcLayout(n), pts = L.map(P), big = arcLayout(n).map(P), box = bagBox(n);
    assert.equal(L.length, 6);
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) >= SZ.wi + 6, `${n}: small ${i}/${j}`);
    for (const p of pts) {
      for (const q of big) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= (SZ.wi + SZ.ab) / 2 + 8, `${n}: small vs spell`);
      for (const f of fixed.concat(bag)) assert.ok(Math.hypot(p.x - f.x, p.y - f.y) >= (SZ.wi + f.s) / 2 + 6, `${n}: small vs fixed ${f.s}`);
      assert.ok(p.x <= 10, 'left of / above the attack button (right thumb)');
      const top = 390 - ANCHOR * K + (p.y - SZ.wi / 2) * K;   // 844x390 phone: below the 44 px top bar
      assert.ok(top >= 44 + 8, `${n}: top ${top.toFixed(0)} px`);
      assert.ok(p.x - SZ.wi / 2 >= box.right + 4 || p.y + SZ.wi / 2 <= box.top, `${n}: small slot under the bag popover`);
    }
    // bag button: clear of spells + fixed buttons, on screen, thumb reach (< 110 from the attack centre)
    for (const q of big) assert.ok(Math.hypot(bag.x - q.x, bag.y - q.y) >= (bag.s + SZ.ab) / 2 + 4, `${n}: bag vs spell`);
    for (const f of fixed) assert.ok(Math.hypot(bag.x - f.x, bag.y - f.y) >= (bag.s + f.s) / 2 + 4, `${n}: bag vs fixed ${f.s}`);
    assert.ok(bag.y + bag.s / 2 <= ANCHOR - 6 && Math.hypot(bag.x, bag.y) < 110, 'bag on screen, near the attack thumb');
    // popover: on screen, left of every spell, small slot and the bag button, right of the joystick zone (left 40%)
    assert.ok(box.bottom <= ANCHOR - 6 && box.w >= 3 * 40 && box.h >= 3 * 40, `${n}: box ${JSON.stringify(box)}`);
    for (const q of big) assert.ok(q.x - SZ.ab / 2 >= box.right + 4 || q.y + SZ.ab / 2 <= box.top, `${n}: popover over a spell`);
    assert.ok(bag.x - bag.s / 2 >= box.right + 4, 'popover clear of the bag button');
    const leftPx = 844 - ANCHOR * K + box.left * K, topPx = 390 - ANCHOR * K + box.top * K;
    assert.ok(leftPx > 844 * 0.4 && topPx >= 44 + 8, `${n}: popover ${leftPx.toFixed(0)},${topPx.toFixed(0)} px`);
  }
});

const memStore = () => { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
test('item order: v2 per hero, v1 map migrates to an order, bad data = inventory order', () => {
  const st = memStore();
  assert.deepEqual(loadItemOrder(st, 'sven'), []);
  assert.equal(saveItemOrder(st, 'sven', [3, 1, 9, 3, 'x', 0]), true);
  assert.deepEqual(JSON.parse(st.getItem(itemMapKey('sven'))), { v: 2, order: [3, 1, 0] }, 'cleaned: main slots only, distinct');
  assert.deepEqual(loadItemOrder(st, 'sven'), [3, 1, 0]);
  assert.deepEqual(loadItemOrder(st, 'lina'), [], 'other heroes untouched');
  assert.equal(st.getItem('p2d.wheel.sven'), null, 'never touches the spell wheel key');
  saveItemOrder(st, 'sven', []); assert.equal(st.m.has(itemMapKey('sven')), false, 'empty = key removed');
  st.setItem(itemMapKey('old'), JSON.stringify({ v: 1, map: [4, 1, 2, 3, 0, 5] }));
  assert.deepEqual(loadItemOrder(st, 'old'), [4, 1, 2, 3, 0, 5], 'v1 map = the order');
  for (const bad of ['[1,0,2,3,4,5]', '{"v":3,"order":[1]}', '{"v":1,"map":[0,0,1,2,3,4]}', 'nope']) {
    st.setItem(itemMapKey('x'), bad); const o = loadItemOrder(st, 'x');
    assert.ok(o.length === 0 || o.join() === '0,1,2,3,4,5', bad);
  }
  const boom = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.deepEqual(loadItemOrder(boom, 'x'), []); assert.equal(saveItemOrder(boom, 'x', [1]), false);
  assert.deepEqual(loadItemOrder(null, 'x'), []);
});

test('usableItem / packWheelItems: only castable main items, packed, custom order first, new items append, max 6', () => {
  const act = Object.keys(DATA.items).find((k) => usableItem(k)), pas = Object.keys(DATA.items).find((k) => !usableItem(k));
  assert.ok(act && pas, 'data has both kinds');
  assert.equal(targetInfo('item', pas, 1).mode, 'passive'); assert.equal(usableItem(''), false); assert.equal(usableItem('no_such_item'), false);
  const inv = (keys) => keys.map((k) => (k ? { key: k } : null));
  const use = (k) => k[0] === 'a';   // test usability: keys starting with 'a'
  const items = inv(['a0', 'p1', null, 'a3', 'a4', 'p5', 'a6', 'a7', 'a8']);
  assert.deepEqual(packWheelItems(items, [], use), [0, 3, 4], 'passives, empties and the backpack skipped, no gaps');
  assert.deepEqual(packWheelItems(items, [4, 0], use), [4, 0, 3], 'custom order first, the rest append by slot');
  assert.deepEqual(packWheelItems(items, [1, 2, 7, 4], use), [4, 0, 3], 'ordered slots that are passive / empty / backpack are skipped');
  assert.deepEqual(packWheelItems(inv(['a', 'a', 'a', 'a', 'a', 'a']), [5], use), [5, 0, 1, 2, 3, 4]);
  assert.deepEqual(packWheelItems(inv(['a', 'a', 'a']), [], use, 2), [0, 1]);
  assert.deepEqual(packWheelItems(null, [1], use), []);
  assert.deepEqual(packWheelItems(inv([act, pas]), []), [0], 'real data');
});

test('placeWheelItem / dropAction: bag swaps, usable main items onto the wheel, wheel reorder, backpack never on the wheel', () => {
  assert.deepEqual(placeWheelItem([0, 3, 4], 4, 0), [4, 3, 0], 'already shown: swap');
  assert.deepEqual(placeWheelItem([0, 3, 4], 1, 1), [0, 1, 3, 4], 'new: insert at the position');
  assert.deepEqual(placeWheelItem([0, 3, 4], 1, 5), [0, 3, 4, 1], 'past the end: last');
  assert.deepEqual(placeWheelItem([0, 3, 4], 0, 4), [3, 4, 0], 'shown, onto an empty position: move to last');
  assert.deepEqual(placeWheelItem([0, 1, 2, 3, 4, 5], 5, 5), [0, 1, 2, 3, 4, 5]);
  const bag = (slot, o = {}) => ({ where: 'bag', slot, empty: false, usable: true, ...o }), wh = (pos, slot) => ({ where: 'wheel', pos, slot, usable: true }), ab = { slot: 0 };
  assert.deepEqual(dropAction(ab, { slot: 1 }), { t: 'ability' });
  assert.equal(dropAction(ab, bag(1)), null); assert.equal(dropAction(bag(1), ab), null); assert.equal(dropAction(wh(0, 0), ab), null);
  assert.deepEqual(dropAction(bag(1), bag(7)), { t: 'swap', a: 1, b: 7 }, 'main -> backpack = ORDER.SWAP');
  assert.deepEqual(dropAction(bag(7), bag(2, { empty: true })), { t: 'swap', a: 7, b: 2 }, 'into an empty cell too');
  assert.deepEqual(dropAction(bag(5, { usable: false }), bag(1)), { t: 'swap', a: 5, b: 1 }, 'passives swap');
  assert.equal(dropAction(bag(2, { empty: true }), bag(3)), null, 'empty source'); assert.equal(dropAction(bag(3), bag(3)), null);
  assert.deepEqual(dropAction(bag(4), wh(0, 0)), { t: 'place', slot: 4, j: 0 });
  assert.equal(dropAction(bag(7), wh(0, 0)), null, 'backpack items never on the wheel');
  assert.equal(dropAction(bag(4, { usable: false }), wh(0, 0)), null, 'passives never on the wheel');
  assert.deepEqual(dropAction(wh(1, 3), wh(4, -1)), { t: 'place', slot: 3, j: 4 }, 'wheel -> empty wheel position');
  assert.equal(dropAction(wh(1, 3), bag(2)), null);
});

test('aim sensitivity: clamp 0.75..2.5 in 0.25 steps, default 1.5 (~64 px full range), stored', () => {
  assert.equal(SENS.DEF, 1.5); assert.deepEqual(SENS_STEPS, [0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5]);
  assert.equal(clampSens(undefined), 1.5); assert.equal(clampSens(null), 1.5); assert.equal(clampSens('x'), 1.5); assert.equal(clampSens(''), 1.5);
  assert.equal(clampSens(0.1), 0.75); assert.equal(clampSens(9), 2.5); assert.equal(clampSens(1.3), 1.25); assert.equal(clampSens('2'), 2);
  assert.equal(aimRadius(T.AIM_R, 1.5), 64); assert.equal(aimRadius(96, 1), 96); assert.equal(aimRadius(96, 0), 128); assert.equal(aimRadius(96, undefined), 64);
  const st = memStore();
  assert.equal(loadAimSens(st), 1.5);
  assert.equal(saveAimSens(st, 2.1), true); assert.equal(loadAimSens(st), 2);
  st.setItem(SENS.KEY, 'garbage'); assert.equal(loadAimSens(st), 1.5);
  assert.equal(loadAimSens(null), 1.5); assert.equal(saveAimSens(null, 2), false);
});

test('aimJoy: skill joystick from the press, on-screen angle = aim angle, deflection x range = length', () => {
  const o = { R: 64, dead: 8, range: 700 };
  assert.equal(aimJoy(0, 0, o), null, 'no drag');
  assert.equal(aimJoy(5, -5, o), null, 'inside the dead zone');
  const full = aimJoy(64, 0, o); assert.ok(Math.abs(full.x - 700) < 1e-9 && Math.abs(full.y) < 1e-9 && full.mag === 1, 'rim = full range');
  const far = aimJoy(0, -500, o); assert.ok(Math.abs(far.y - 700) < 1e-9 && far.over === 0, 'past the rim: clamped, screen up = world +y, no pan (range-limited)');
  const half = aimJoy(-36, 0, o); assert.ok(Math.abs(half.x + 350) < 1e-9, 'half deflection = half range (after the dead zone)');
  assert.ok(Math.abs(aimJoy(20, 0, { ...o, dirOnly: true }).x - 700) < 1e-9, 'line / cone: direction only, full range');
  // pitched camera: world +y covers 0.5 px / u on screen, +x 1 px / u.  A 45 deg thumb must give a 45 deg line ON SCREEN, so the world
  // direction stretches along y; the point lands at range along it.
  const basis = { xx: 1, xy: 0, yx: 0, yy: -0.5 };
  const d = aimJoy(40, -40, { ...o, basis });
  const sx = basis.xx * d.x + basis.yx * d.y, sy = basis.xy * d.x + basis.yy * d.y;
  assert.ok(Math.abs(Math.atan2(sy, sx) + Math.PI / 4) < 1e-9, 'on-screen angle preserved');
  assert.ok(Math.abs(Math.hypot(d.x, d.y) - 700 * d.mag) < 1e-9, 'length = range x mag in world units');
  assert.ok(d.y > d.x, 'world y stretched by the foreshortening');
});

test('aimJoy long / global: rim = the visible edge, held past the rim pans', () => {
  const o = { R: 64, dead: 8, range: 0, edgePx: 300 };   // global, 300 px to the edge, flat 1 px / u
  const rim = aimJoy(64, 0, o); assert.ok(Math.abs(rim.x - 300) < 1e-9 && rim.over === 0, 'rim = the edge');
  assert.equal(aimJoy(64 * 1.15, 0, o).over, 0, 'pan starts past AIM_OVER x R');
  assert.equal(aimJoy(64 * 1.7, 0, o).over, 1, 'full pan speed AIM_OVER_RAMP x R further');
  assert.equal(aimJoy(64 * 2, 0, { ...o, range: 200 }).over, 0, 'range shorter than the screen: no pan');
  assert.ok(Math.abs(aimJoy(64, 0, { ...o, range: 2000 }).x - 300) < 1e-9, 'finite long range: the edge still caps the joystick');
  assert.equal(aimJoy(30, 0, { R: 64, dead: 8, range: 0 }).x, 0, 'global with no edge info: no point (never infinite)');
});

test('rayToEdge: distance along a direction to the inset view edge', () => {
  assert.equal(rayToEdge(400, 200, 1, 0, 800, 400, 0), 400);
  assert.equal(rayToEdge(400, 200, 0, -1, 800, 400, 50), 150);
  assert.ok(Math.abs(rayToEdge(400, 200, Math.SQRT1_2, Math.SQRT1_2, 800, 400, 0) - 200 * Math.SQRT2) < 1e-9, 'diagonal hits the bottom first');
  assert.equal(rayToEdge(-50, 200, -1, 0, 800, 400, 0), 0, 'off-screen point pulled in');
});
