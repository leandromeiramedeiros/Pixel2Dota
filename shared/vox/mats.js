// Shared voxel material library (docs/VOXEL.md "Materials"). Browser-safe. Lit materials are 4-step ramps dark -> highlight, hue-shifted:
// shadows lean purple / crimson, highlights warm, never plain black or white. Anchors: Lina's hand-tuned ramps (skin, gold, leather, red cloth)
// and the 2D sprite palette (tools/art/heroes/rig.mjs ramp4: lo '#2a1848', deep '#1a0f26', hi '#fff2d0').
// Emissive materials ({ emit }) carry a glow tier: 'eye' (<= 1.0, faces), 'signature' (~1.2, hero signature glow), 'spell' (1.5-1.7, hottest cores).
// The runtime maps tier -> gain (client/src/render/voxmesh.js). `team: true` marks team-tintable voxels (creeps, buildings): the runtime tints them per
// instance; offline sheets recolour them with teamTint().
import { hex, mix } from './vox.js';

const toHex = c => '#' + c.map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
const LO = '#2a1848', DEEP = '#1a0f26', HI = '#fff2d0';
/** Hue-shifted 4-step ramp from a mid colour: [dark (toward deep purple), base, light (toward warm cream), highlight]. */
export const ramp = (base, k = {}) => {
  const b = hex(base);
  return [mix(mix(b, hex(LO), k.lo ?? 0.42), hex(DEEP), k.deep ?? 0.25), b, mix(b, hex(HI), k.hi ?? 0.28), mix(b, hex(HI), k.top ?? 0.6)].map(toHex);
};

export const TIERS = ['eye', 'signature', 'spell'];
/** Suggested gain per tier (docs/VOXEL.md "Materials"); the runtime owns the final numbers. */
export const TIER_GAIN = { eye: 1.0, signature: 1.2, spell: 1.6 };

/** name -> material def. Lit: { ramp, noShadow? }. Emissive: { emit, tier }. */
export const MATS = {
  // skin (noShadow: the face is never cut by the hair's shadow)
  skin: { ramp: ['#c4706a', '#eea88c', '#ffd6b8', '#fff2e0'], noShadow: true },        // warm fair (Lina)
  skinPale: { ramp: ['#9a7488', '#d8bcc4', '#f2dcdc', '#fff6f0'], noShadow: true },    // cool pale (CM, undead-ish)
  skinTan: { ramp: ['#8a4a40', '#c47e5a', '#e2a67a', '#f8d0a0'], noShadow: true },
  skinDeep: { ramp: ['#4a2430', '#7a4436', '#a0644a', '#c48e66'], noShadow: true },
  skinGreen: { ramp: ['#2c3c34', '#4e7a4a', '#7aa25a', '#b0c87a'], noShadow: true },   // ogres, trolls, kobold-likes
  blush: { ramp: ['#c86060', '#f08a7a', '#ffaa98', '#ffc4b0'] },
  // metals
  gold: { ramp: ['#7a4416', '#c8861e', '#f2c444', '#fff2a8'] },                       // Lina's trim gold
  silver: { ramp: ['#4a4a6a', '#8c90a8', '#c4c8d4', '#f4f2ec'] },
  steel: { ramp: ['#2c2c44', '#5a5e74', '#8a8ea0', '#c8c8c8'] },
  iron: { ramp: ['#1e1a2a', '#3a3644', '#5a5462', '#847a80'] },
  bronze: { ramp: ['#4a2418', '#8a4e26', '#c07a3a', '#f0b060'] },
  // leather
  leather: { ramp: ['#2c1218', '#56261e', '#86442e', '#b06a44'] },                    // Lina's boots
  leatherL: { ramp: ['#4a2420', '#8a5434', '#b88050', '#e0b07a'] },
  // cloth families
  clothRed: { ramp: ['#4a1032', '#8c1a2c', '#c8303a', '#ee5a4a'] },                   // Lina's dress
  clothOrange: { ramp: ['#8a2a16', '#d0561e', '#f2902e', '#ffc060'] },                // Lina's sleeves
  clothBlue: { ramp: ['#1c1848', '#2c3e8a', '#4a6ec4', '#8ab0ee'] },
  clothGreen: { ramp: ['#16283a', '#2a5a3a', '#4a8a44', '#8ac464'] },
  clothPurple: { ramp: ['#24123e', '#4a2470', '#7442a4', '#a87ad2'] },
  clothWhite: { ramp: ['#6a6488', '#b4b0c4', '#e2ded8', '#fff8ea'] },
  clothBlack: { ramp: ['#120c1c', '#241c30', '#3a2e44', '#5a4a5e'] },
  // organic / mineral
  wood: { ramp: ['#2e1620', '#5a3424', '#86563a', '#b0804e'] },
  woodDark: { ramp: ['#1c0e18', '#3a2020', '#5a3628', '#7e5236'] },
  stone: { ramp: ['#2a2c3c', '#585c62', '#7a7f85', '#a8aaa8'] },                      // terrain STONE family
  bone: { ramp: ['#6a5468', '#b8a890', '#e2d4b4', '#fff6dc'] },
  // team-tintable neutrals (runtime multiplies by the team colour; keep them light and low-chroma)
  teamCloth: { ramp: ['#5a5470', '#9e9aa8', '#d4d0cc', '#fff8ec'], team: true },
  teamMetal: { ramp: ['#3a3850', '#76768a', '#aeaeb6', '#ecebe4'], team: true },
  // emissive: eye tier (face lines + catch-lights read in any light)
  lash: { emit: '#2a0e1e', tier: 'eye' },
  pupil: { emit: '#5a1414', tier: 'eye' },
  mouth: { emit: '#a83444', tier: 'eye' },
  shine: { emit: '#ffffff', tier: 'eye' },
  eyeDot: { emit: '#1c1024', tier: 'eye' },
  eyeGlow: { emit: '#ffe08a', tier: 'eye' },
};

/** Iris sets [dark, mid, light] (eye tier), used as irisD / iris / irisL. */
export const IRIS = { amber: ['#b8401a', '#f07a1e', '#ffc040'], ice: ['#2a6ab0', '#5ab0f0', '#bff0ff'], green: ['#2a6a2a', '#5ab04a', '#b8f070'], violet: ['#5a2a9a', '#9a5ae0', '#d8b0ff'] };
/** Flame gradients outer -> core (f1..f4) and the tier per step: outer tongues signature, hot core spell. */
export const FLAMES = {
  fire: ['#e2441a', '#ff7a22', '#ffb83c', '#fff1a6'],
  frost: ['#2a6ad0', '#5ab0ff', '#a8e4ff', '#f0ffff'],
  arcane: ['#6a2ad0', '#a05aff', '#d0a0ff', '#fff0ff'],
  venom: ['#3a8a1a', '#6ad02a', '#b8f05a', '#f4ffc0'],
};
export const FLAME_TIERS = ['signature', 'signature', 'spell', 'spell'];

/** Register library material `name` (or `o.from`) on Vox v under `name`, with overrides; returns its id. A full def in `o` needs no library entry. */
export function useMat(v, name, o = {}) {
  const { from, ...over } = o, base = MATS[from ?? name];
  if (!base && !over.ramp && !over.emit) throw new Error('unknown material ' + (from ?? name));
  const def = { ...base, ...over };
  if (over.ramp) delete def.emit; else if (over.emit) { delete def.ramp; delete def.noShadow; }
  return v.mat(name, def);
}
/** irisD / iris / irisL ids for an IRIS set. */
export const useIris = (v, set = 'amber') => { const c = IRIS[set]; return { irisD: v.mat('irisD', { emit: c[0], tier: 'eye' }), iris: v.mat('iris', { emit: c[1], tier: 'eye' }), irisL: v.mat('irisL', { emit: c[2], tier: 'eye' }) }; };
/** f1..f4 ids for a FLAMES gradient (names prefixed by `pre`, default 'f'). */
export const useFlame = (v, set = 'fire', pre = 'f') => FLAMES[set].map((c, i) => v.mat(pre + (i + 1), { emit: c, tier: FLAME_TIERS[i] }));

/** Team ramps for the team-tintable materials (offline preview; the runtime tints on the GPU). */
export const TEAM = {
  radiant: { teamCloth: ['#1c3a2a', '#2e7a3a', '#5ab04a', '#b8e07a'], teamMetal: ['#2a3a2a', '#5a8a5a', '#9ac08a', '#e4f4c4'] },
  dire: { teamCloth: ['#2a0c1c', '#7a1a1e', '#c0302a', '#f07a4a'], teamMetal: ['#2a1418', '#6a2a26', '#a04a3a', '#e08a6a'] },
};
/** Recolour every team: true material of v in place for `team` ('radiant' | 'dire'); unknown team mats fall back to teamCloth. */
export function teamTint(v, team) {
  for (const m of v.mats) if (m && m.team) {
    const r = TEAM[team][m.name] || TEAM[team].teamCloth;
    m.ramp = r; m.rgb = r.map(hex); m.ol = mix(hex(r[0]), [18, 8, 20], 0.55);
  }
  return v;
}
