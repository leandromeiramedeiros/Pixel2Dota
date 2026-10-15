// Shared pose libraries per rig class (docs/VOXEL.md "Poses"). Browser-safe. Each generator returns ANIMS { idle, walk, attack, cast, stunned }
// as arrays of rig poses (joint angles, see rig.js); options tune the class motion per model, and withPoses() overrides single frames.
// No death anim: the runtime breaks the model into voxels.

const range = n => [...Array(n).keys()];
/** Merge per-frame overrides: over = { anim: (pose, i) => partial | partial[] } -> new ANIMS (shallow per pose). */
export function withPoses(anims, over = {}) {
  const out = {};
  for (const [k, poses] of Object.entries(anims)) {
    const o = over[k];
    out[k] = poses.map((p, i) => ({ ...p, ...(typeof o === 'function' ? o(p, i) : Array.isArray(o) ? o[i] : o) }));
  }
  return out;
}

/**
 * Biped (chibi heroes, humanoid creeps / neutrals). o: { stride (foot swing, voxels), lift, bob, swing (arm swing deg),
 *   hold: { R: [upper, fore], L: [...] } rest arm aims (weapon grip), guard: L arm aims while attacking (shield), blade: R blade aims per attack frame }.
 * Main hand = R (-x). attack = 3-frame slash: wind-up, strike (lunge), recover.
 */
export function bipedAnims(o = {}) {
  const stride = o.stride ?? 1.5, lift = o.lift ?? 0.6, bob = o.bob ?? 0.4, sw = o.swing ?? 18;
  const hold = o.hold || { R: [[-72, 8], [-62, 30]], L: [[-72, 8], [-62, 30]] };
  const swing = (a, d) => a.map(([el, hd, k]) => [el, hd + d, k]);
  const idle = range(4).map(i => {
    const b = [0, 1, 2, 1][i];
    return { bob: -b * bob * 0.5, armR: swing(hold.R, b), armL: swing(hold.L, b), head: [b * 1.5, 0, 0], flick: i, sway: [0, 1, 1, 0][i] };
  });
  const walk = range(4).map(i => {
    const st = [1, 0, -1, 0][i];
    return {
      bob: [-bob, 0, -bob, 0][i], spine: [3, st * 4, 0], footR: [0, -st * stride, i === 3 ? lift : 0], footL: [0, st * stride, i === 1 ? lift : 0],
      armR: swing(hold.R, st * sw), armL: swing(hold.L, -st * sw), flick: i, sway: i % 3,
    };
  });
  const guard = o.guard || hold.L, blade = o.blade || [];
  const attack = [
    { bob: -bob * 0.5, spine: [-6, -18, 0], armR: [[45, -35], [85, -20]], armL: guard, bladeR: blade[0], footR: [0, 0.8, 0], flick: 0 },
    { bob: -bob, spine: [12, 16, 0], armR: [[0, 70], [-8, 88]], armL: guard, bladeR: blade[1], footR: [0, -1.6, 0], footL: [0, 0.8, 0], flick: 1 },
    { bob: -bob * 0.5, spine: [5, 6, 0], armR: [[-45, 40], [-55, 70]], armL: guard, bladeR: blade[2], footR: [0, -0.8, 0], flick: 2 },
  ];
  const cast = [
    { spine: [-4, 0, 0], armR: [[0, 30], [30, 50]], armL: [[0, 30], [30, 50]], flick: 0 },
    { bob: -bob * 0.5, spine: [-8, 0, 0], armR: [[55, 20], [80, 10]], armL: [[55, 20], [80, 10]], head: [-8, 0, 0], flick: 1 },
    { spine: [10, 0, 0], armR: [[10, 75], [5, 85]], armL: [[10, 75], [5, 85]], flick: 2 },
  ];
  const stunned = range(2).map(i => ({
    bob: -bob * 1.5, spine: [6, [-5, 5][i], [-4, 4][i]], head: [9, [-10, 10][i], [-8, 8][i]], armR: [[-82, 0], [-86, 5]], armL: [[-82, 0], [-86, 5]],
    eyes: 'x', flick: i * 2, sway: i,
  }));
  return { idle, walk, attack, cast, stunned };
}

/** Quadruped (wolves, hounds). Diagonal-pair walk; attack = lunge + bite; cast = howl. o: { stride, lift, bob, wag (tail deg) }. */
export function quadAnims(o = {}) {
  const stride = o.stride ?? 2.4, lift = o.lift ?? 1, bob = o.bob ?? 0.4, wag = o.wag ?? 18;
  const tail = (d, up = 0) => [[20 + up, -90 + d], [up * 0.5, -90 + d * 1.4], [-20, -90 + d * 1.8]];
  const idle = range(4).map(i => ({ bob: -[0, 1, 2, 1][i] * bob * 0.5, head: [[0, 2, 3, 2][i], 0, 0], tail: tail([-1, 0, 1, 0][i] * wag * 0.5), sway: [0, 1, 1, 0][i] }));
  const walk = range(4).map(i => {
    const st = [1, 0, -1, 0][i], a = [0, -st * stride, i === 3 ? lift : 0], b = [0, st * stride, i === 1 ? lift : 0];
    return { bob: [-bob, 0, -bob, 0][i], body: [st * 2, 0, 0], footFR: a, footBL: a, footFL: b, footBR: b, tail: tail(st * wag), sway: i % 3 };
  });
  const attack = [
    { bob: -bob, body: [-6, 0, 0], head: [-15, 0, 0], jaw: 10, footFR: [0, 1, 0], footFL: [0, 1, 0], tail: tail(0, 20) },
    { body: [8, 0, 0], head: [12, 0, 0], jaw: 40, footFR: [0, -3, 1.5], footFL: [0, -2, 1], tail: tail(wag, 10) },
    { bob: -bob * 0.5, body: [4, 0, 0], head: [6, 0, 0], jaw: 5, tail: tail(-wag * 0.5) },
  ];
  const cast = [
    { body: [-4, 0, 0], head: [-15, 0, 0], jaw: 15, tail: tail(0, 10) },
    { body: [-10, 0, 0], head: [-40, 0, 0], jaw: 45, tail: tail(0, 25) },
    { body: [-6, 0, 0], head: [-30, 0, 0], jaw: 30, tail: tail(0, 15) },
  ];
  const stunned = range(2).map(i => ({ bob: -bob * 2, body: [4, 0, [-6, 6][i]], head: [20, [-10, 10][i], 0], tail: tail(0, -30), eyes: 'x', sway: i }));
  return { idle, walk, attack, cast, stunned };
}

/** Flyer (drakes, dragons, wildkin): flapping hover. o: { flap (wing elevation amplitude deg), bob }. */
export function flyerAnims(o = {}) {
  const flap = o.flap ?? 35, bob = o.bob ?? 1;
  const wing = a => [[20 + a, -10], [a * 0.6, -30], [-10 + a * 0.3, -60]];
  const tail = d => [[0, -90 + d], [-10, -90 + d * 1.3], [-10, -90 + d * 1.6]];
  const beat = [1, 0, -1, 0];
  const idle = range(4).map(i => ({ bob: beat[i] * bob, wingR: wing(beat[i] * flap), wingL: wing(beat[i] * flap), tail: tail(beat[i] * 6), sway: [0, 1, 1, 0][i] }));
  const walk = range(4).map(i => ({ bob: beat[i] * bob, body: [10, 0, 0], wingR: wing(beat[i] * flap * 1.2), wingL: wing(beat[i] * flap * 1.2), tail: tail(beat[i] * 10), sway: i % 3 }));
  const attack = [
    { body: [-10, 0, 0], head: [-15, 0, 0], jaw: 15, wingR: wing(flap), wingL: wing(flap) },
    { body: [15, 0, 0], head: [20, 0, 0], jaw: 40, wingR: wing(-flap * 0.5), wingL: wing(-flap * 0.5) },
    { body: [5, 0, 0], head: [5, 0, 0], jaw: 5, wingR: wing(0), wingL: wing(0) },
  ];
  const cast = [
    { body: [-8, 0, 0], head: [-20, 0, 0], jaw: 20, wingR: wing(flap * 1.4), wingL: wing(flap * 1.4) },
    { body: [-12, 0, 0], head: [-30, 0, 0], jaw: 45, wingR: wing(flap * 1.6), wingL: wing(flap * 1.6) },
    { body: [6, 0, 0], head: [10, 0, 0], jaw: 30, wingR: wing(-flap * 0.3), wingL: wing(-flap * 0.3) },
  ];
  const stunned = range(2).map(i => ({ bob: -3, body: [10, 0, [-12, 12][i]], head: [25, 0, 0], wingR: wing(-flap), wingL: wing(-flap), legR: [-60, 40], legL: [-60, 40], eyes: 'x', sway: i }));
  return { idle, walk, attack, cast, stunned };
}

/** Big (golems, lizards, Roshan): the biped library, heavier (long stride, deep bob) with a two-handed overhead slam. */
export function bigAnims(o = {}) {
  const a = bipedAnims({ stride: 2.4, lift: 1, bob: 0.9, swing: 12, ...o });
  return withPoses(a, {
    attack: [
      { spine: [-12, 0, 0], armR: [[70, 10], [85, 0]], armL: [[70, 10], [85, 0]] },
      { spine: [22, 0, 0], armR: [[-10, 80], [-40, 85]], armL: [[-10, 80], [-40, 85]], footR: [0, -1.5, 0], footL: [0, -1.5, 0] },
      { spine: [10, 0, 0], armR: [[-50, 50], [-70, 60]], armL: [[-50, 50], [-70, 60]] },
    ],
  });
}

/** Library per rig class (default options). */
export const LIBRARY = { biped: bipedAnims, quad: quadAnims, flyer: flyerAnims, big: bigAnims };
