// Dota rules constants (7.3x-era values, simplified where docs/DECISIONS.md says so).

export const MAP_MIN = -8832, MAP_MAX = 8832, TILE = 48, ELEV_Z = 128;
export const ART_UNITS_PER_PX = 6;

export const CAMERA = { distance: 1134, distanceMax: 1200, pitch: 60, pitchMin: 38, fovH43: 70, fovH43Min: 45, closeDistance: 900 };
export const vfov = (fovH43) => 2 * Math.atan(Math.tan((fovH43 * Math.PI) / 360) * 0.75) * 180 / Math.PI; // ~55.4 for 70

// attributes
export const ATTR = {
  hpPerStr: 22, hpRegenPerStr: 0.1, manaPerInt: 12, manaRegenPerInt: 0.05, armorPerAgi: 1 / 6, asPerAgi: 1, mrPerInt: 0.1, msPctPerAgi: 0.05,
  universalDmgPerAttr: 0.7,
};
export const armorMult = (a) => 1 - (0.06 * a) / (1 + 0.06 * Math.abs(a));
export const MAX_AS = 700, MIN_AS = 20, MAX_MS = 550, MIN_MS = 100;

// leveling
export const MAX_LEVEL = 30;
export const XP_TABLE = [0, 240, 640, 1160, 1760, 2440, 3200, 4000, 4900, 5900, 7000, 8200, 9500, 10900, 12400, 14000, 15700, 17500, 19400, 21400, 23600, 26000, 28600, 31400, 34400, 38400, 43400, 49400, 56400, 63900];
export const ULT_LEVELS = [6, 12, 18];
export const XP_RADIUS = 1500;
export const heroKillXp = (victimLevel) => 100 + 0.13 * XP_TABLE[Math.min(victimLevel, 30) - 1] / 1; // simplified
export const RESPAWN = [6, 8, 10, 14, 16, 26, 28, 30, 32, 34, 36, 46, 48, 50, 52, 54, 56, 66, 70, 74, 78, 82, 86, 90, 100, 100, 100, 100, 100, 100];

// gold
export const START_GOLD = 600, PASSIVE_GOLD_PER_S = 95 / 60, SELL_RATIO = 0.5, SELL_FULL_WINDOW = 10;
export const heroKillGold = (victimLevel, streak = 0) => Math.round(110 + victimLevel * 8 + Math.min(streak, 10) * 30);
export const DENY_HP_PCT = 0.5;

// match flow
export const PREGAME = 30;            // clock starts at -PREGAME; first wave + horn at 0:00
export const WAVE_EVERY = 30, SIEGE_EVERY = 5, WAVE_MELEE = 3, WAVE_RANGED = 1;
export const DAY_LEN = 300;           // 5 min day, 5 min night, starts day
export const TREE_REGROW = 300;

// misc
export const SHOP_RANGE = 1200, FOUNTAIN_RADIUS = 1200, FOUNTAIN_HP_PCT = 0.04, FOUNTAIN_MANA_PCT = 0.04;
export const AGGRO_RANGE_CREEP = 500, TOWER_RANGE = 700, CREEP_CALL_HELP = 500;
export const ATTACK_RANGE_BUFFER = 250; // Dota keeps attacking within range + buffer once started
export const MAGIC_RESIST_BASE = 0.25;
