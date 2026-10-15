// Voxel Healing Ward (Juggernaut's summon), after the Dota 2 model (hand-authored chibi): a small wooden totem. A dark stake planted in the
// ground; a hanging scroll (rust-orange cloth with a dark glyph) between two wooden rollers with dark end caps; a rope ring round the pole above
// it; a forked top (two short horns) cradling a soft green healing glow. Signature reads: orange scroll on a stake, forked top, the glow.
// One colour scheme (a summon, no team tint). Static (no rig), grid 24 x 24 x 28, ~25 voxels tall, faces -y (the scroll faces the camera).
import { Vox } from '../vox.js';
import { useMat } from '../mats.js';
import { vol, ell, cap } from '../parts.js';

export const META = { rig: 'static', grid: [24, 24, 28], cx: 12, cy: 12 };
const cx = 12, cy = 12;

/** Pose: { sway } scroll flutter phase (0..1), { glow } orb size (1 = rest). */
export function build(p = {}) {
  const v = new Vox(24, 24, 28), sway = p.sway || 0, glow = p.glow ?? 1;
  const M = {
    wood: useMat(v, 'wood', { ramp: ['#1e0e08', '#3e2218', '#5a3626', '#7a5038'] }),
    woodL: useMat(v, 'woodL', { ramp: ['#2e180e', '#5a3622', '#7a4c34', '#9e6c4c'] }),
    scroll: useMat(v, 'scroll', { ramp: ['#3e1c10', '#7a4026', '#a85a34', '#d07e4c'] }),
    ink: useMat(v, 'ink', { ramp: ['#060a0a', '#101816', '#1a2422', '#283432'] }),
    rope: useMat(v, 'rope', { ramp: ['#3a2416', '#7a5a3e', '#9e7a56', '#c49c72'] }),
    glow: useMat(v, 'glow', { emit: '#8af0a0', tier: 'signature', gain: 0.9 }),
    glowC: useMat(v, 'glowCore', { emit: '#d4ffd0', tier: 'signature', gain: 1 }),
  };
  // ---- stake: pointed foot in the ground, pole up to the fork
  cap(v, null, [cx, cy, 0.4], [cx, cy, 4], 0.8, M.wood, 1.1);
  cap(v, null, [cx, cy, 4], [cx, cy, 21], 1.1, M.wood, 1);
  // ---- scroll: cloth in front of the pole between two rollers, a slight flutter at the bottom; dark glyph (a hook and a dot) on the front
  const z0 = 7, z1 = 17.4, hw = 4;
  vol(v, null, cx - hw - 1, cy - 4, z0, cx + hw + 1, cy, z1, (px, py, pz) => {
    const dx = px - cx; if (Math.abs(dx) > hw) return;
    const yc = cy - 1.6 - (z1 - pz) * 0.04 + Math.sin(dx * 0.9 + sway * 2.4) * 0.35 * (z1 - pz) / (z1 - z0); if (Math.abs(py - yc) > 0.55) return;
    const gx = dx, gz = pz - (z0 + z1) / 2;
    const hook = (Math.abs(Math.hypot(gx + 0.5, gz - 1) - 1.6) < 0.5 && !(gx > 0 && gz < 1)) || (Math.abs(gx - 1.1) < 0.5 && gz < 1 && gz > -2.2);
    const dot = Math.hypot(gx + 1.5, gz + 2) < 0.6;
    return hook || dot ? M.ink : M.scroll;
  });
  for (const z of [z0 - 0.4, z1 + 0.2]) {
    cap(v, null, [cx - hw - 0.6, cy - 1.6, z], [cx + hw + 0.6, cy - 1.6, z], 0.75, M.woodL);
    for (const s of [-1, 1]) cap(v, null, [cx + s * (hw + 0.6), cy - 1.6, z], [cx + s * (hw + 1.2), cy - 1.6, z], 1, M.ink);   // end caps
  }
  // ---- rope ring round the pole above the scroll
  vol(v, null, cx - 4, cy - 4, 19, cx + 4, cy + 4, 20, (px, py, pz) => (pz > 19 && pz < 20 && Math.abs(Math.hypot(px - cx, py - cy) - 2.1) < 0.6 ? M.rope : undefined));
  // ---- forked top: two short horns flaring out, the glow cradled between them
  for (const s of [-1, 1]) {
    cap(v, null, [cx, cy, 20.6], [cx + s * 2.6, cy, 23.2], 0.9, M.wood, 0.8);
    cap(v, null, [cx + s * 2.6, cy, 23.2], [cx + s * 3.8, cy, 25], 0.8, M.woodL, 0.6);
  }
  ell(v, null, [cx, cy, 23.6], [1.7 * glow, 1.7 * glow, 1.9 * glow], (px, py, pz) => (Math.hypot(px - cx, py - cy, pz - 23.6) < 0.9 ? M.glowC : M.glow));
  return v;
}

/** Anims: idle only (a planted ward): the scroll flutters, the glow breathes. Every other anim falls back to idle at runtime. */
export const ANIMS = { idle: [{ sway: 0, glow: 1 }, { sway: 0.5, glow: 1.12 }, { sway: 1, glow: 1 }, { sway: 0.5, glow: 0.92 }] };
