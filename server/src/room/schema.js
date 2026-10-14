// Colyseus schema (docs/ARCHITECTURE.md "Schema"). schema() builders, no decorators.
import { schema, t, Encoder } from '@colyseus/schema';

// ~170 synced units with neutrals + Roshan + wards: the full state no longer fits the default 8 KB encode buffer (it regrows with a warning)
Encoder.BUFFER_SIZE = 64 * 1024;

export const Ability = schema({
  key: t.string(), level: t.uint8(), cd: t.float32(), cdMax: t.float32(), mana: t.uint16(), flags: t.uint8(),
}, 'Ability');

export const Item = schema({
  key: t.string(), charges: t.uint16(), cd: t.float32(), cdMax: t.float32(),
}, 'Item');

export const Unit = schema({
  id: t.string(), kind: t.string(), key: t.string(), team: t.int8(), owner: t.string(),
  x: t.float32(), y: t.float32(), facing: t.float32(), anim: t.string(), animSeq: t.uint16(), animRate: t.float32(),
  hp: t.float32(), maxHp: t.float32(), mana: t.float32(), maxMana: t.float32(), level: t.uint8(), status: t.uint32(), ms: t.uint16(),
  // heroes only
  xp: t.uint32(), str: t.uint16(), agi: t.uint16(), int: t.uint16(), dmgMin: t.uint16(), dmgMax: t.uint16(), dmgBonus: t.int16(), armor: t.float32(),
  atkRate: t.float32(), atkRange: t.uint16(), skillPoints: t.uint8(), respawn: t.float32(), orbs: t.string(),
  abilities: t.array(Ability), items: t.array(Item), buffs: t.array('string'),
}, 'Unit');

export const Player = schema({
  sid: t.string(), name: t.string(), team: t.int8(), slot: t.int8(), hero: t.string(), isBot: t.boolean(), isHost: t.boolean(),
  connected: t.boolean(), claim: t.string(), heroId: t.string(), gold: t.uint32(), kills: t.uint16(), deaths: t.uint16(), assists: t.uint16(), lh: t.uint16(), dn: t.uint16(),
}, 'Player');

export const MatchState = schema({
  phase: t.string(), code: t.string(), time: t.float32(), night: t.boolean(), winner: t.int8(), spectators: t.boolean(),
  players: t.map(Player), units: t.map(Unit), treesDown: t.array('uint16'),
}, 'MatchState');

// Primitive field lists used by the sim -> schema sync (MatchRoom).
export const UNIT_FIELDS = ['kind', 'key', 'team', 'owner', 'x', 'y', 'facing', 'anim', 'animSeq', 'animRate', 'hp', 'maxHp', 'mana', 'maxMana', 'level', 'status', 'ms',
  'xp', 'str', 'agi', 'int', 'dmgMin', 'dmgMax', 'dmgBonus', 'armor', 'atkRate', 'atkRange', 'skillPoints', 'respawn', 'orbs'];
export const ABILITY_FIELDS = ['key', 'level', 'cd', 'cdMax', 'mana', 'flags'];
export const ITEM_FIELDS = ['key', 'charges', 'cd', 'cdMax'];
export const PLAYER_SIM_FIELDS = ['heroId', 'gold', 'kills', 'deaths', 'assists', 'lh', 'dn'];
