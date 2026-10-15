// Voxel model registry: one line per unit. tools/vox/{check,shot,portrait,brief}.mjs and client/test/voxmesh.test.js iterate it, so a new unit
// is one model file + one line here (the game registers it separately: VOX_UNITS in client/src/render/voxactors.js, after the director gate).
//   VOX[short] = { kind: 'hero' | 'creep' | 'neutral' | 'boss' | 'building', unit: npc_dota key (the game unit it depicts), mod: model module }
// A model module exports META { rig, grid, cx, cy }, build(pose) -> Vox, ANIMS (docs/VOXEL.md). Optional: PORTRAIT { pose, center, scale, fov, sig, face }.
import * as axe from './heroes/axe.js';
import * as crystal_maiden from './heroes/crystal_maiden.js';
import * as drow_ranger from './heroes/drow_ranger.js';
import * as invoker from './heroes/invoker.js';
import * as invoker_forged_spirit from './creeps/invoker_forged_spirit.js';
import * as juggernaut from './heroes/juggernaut.js';
import * as juggernaut_healing_ward from './creeps/juggernaut_healing_ward.js';
import * as lina from './heroes/lina.js';
import * as lion from './heroes/lion.js';
import * as melee_dire from './creeps/melee_dire.js';
import * as melee_radiant from './creeps/melee_radiant.js';
import * as pudge from './heroes/pudge.js';
import * as sniper from './heroes/sniper.js';
import * as sven from './heroes/sven.js';
import * as zuus from './heroes/zuus.js';

export const VOX = {   // alphabetical (parallel branches merge clean)
  axe: { kind: 'hero', unit: 'npc_dota_hero_axe', mod: axe },
  crystal_maiden: { kind: 'hero', unit: 'npc_dota_hero_crystal_maiden', mod: crystal_maiden },
  drow_ranger: { kind: 'hero', unit: 'npc_dota_hero_drow_ranger', mod: drow_ranger },
  invoker: { kind: 'hero', unit: 'npc_dota_hero_invoker', mod: invoker },
  invoker_forged_spirit: { kind: 'creep', unit: 'npc_dota_invoker_forged_spirit', mod: invoker_forged_spirit },
  juggernaut: { kind: 'hero', unit: 'npc_dota_hero_juggernaut', mod: juggernaut },
  juggernaut_healing_ward: { kind: 'creep', unit: 'npc_dota_juggernaut_healing_ward', mod: juggernaut_healing_ward },
  lina: { kind: 'hero', unit: 'npc_dota_hero_lina', mod: lina },
  lion: { kind: 'hero', unit: 'npc_dota_hero_lion', mod: lion },
  melee_dire: { kind: 'creep', unit: 'npc_dota_creep_badguys_melee', mod: melee_dire },
  melee_radiant: { kind: 'creep', unit: 'npc_dota_creep_goodguys_melee', mod: melee_radiant },
  pudge: { kind: 'hero', unit: 'npc_dota_hero_pudge', mod: pudge },
  sniper: { kind: 'hero', unit: 'npc_dota_hero_sniper', mod: sniper },
  sven: { kind: 'hero', unit: 'npc_dota_hero_sven', mod: sven },
  zuus: { kind: 'hero', unit: 'npc_dota_hero_zuus', mod: zuus },
};
