// Network contract shared by server and client. See docs/ARCHITECTURE.md.

export const ROOM = 'match';
export const PORT = 2567;
export const TICK_HZ = 30;
export const PATCH_MS = 50;
export const INTERP_MS = 100;

export const MSG = { LOBBY: 'lobby', ORDER: 'order', CHAT: 'chat', FX: 'fx' };

export const PHASE = { LOBBY: 'lobby', GAME: 'game', ENDED: 'ended' };

export const TEAM = { NONE: -1, RADIANT: 0, DIRE: 1, NEUTRAL: 2 };
export const TEAM_SIZE = 5;

export const KIND = { HERO: 'hero', CREEP: 'creep', TOWER: 'tower', RAX: 'rax', ANCIENT: 'ancient', FOUNTAIN: 'fountain', BUILDING: 'building', SUMMON: 'summon', WARD: 'ward' };

export const ANIM = { IDLE: 'idle', WALK: 'walk', ATTACK: 'attack', CAST: 'cast', STUNNED: 'stunned', DEAD: 'dead', CHANNEL: 'channel' };

export const ORDER = { MOVE: 'move', ATTACK: 'attack', AMOVE: 'amove', STOP: 'stop', HOLD: 'hold', CAST: 'cast', ITEM: 'item', LEARN: 'learn', BUY: 'buy', SELL: 'sell', SWAP: 'swap' };

export const LOBBY = { NAME: 'name', SLOT: 'slot', HERO: 'hero', BOT: 'bot', KICK: 'kick', FILL: 'fill', START: 'start' };

export const EV = {
  ATK: 'atk', HIT: 'hit', SPELL: 'spell', PROJ: 'proj', PROJ_END: 'projEnd', DEATH: 'death', KILL: 'kill', GOLD: 'gold', LVL: 'lvl',
  HEAL: 'heal', MANA: 'mana', TREE: 'tree', TREE_GROW: 'treeGrow', BLINK: 'blink', TP: 'tp', INVOKE: 'invoke', MSG: 'msg', CHAT: 'chat', END: 'end',
};

// Unit.status bitmask
export const ST = {
  STUN: 1, ROOT: 2, SILENCE: 4, HEX: 8, MAGIC_IMMUNE: 16, INVIS: 32, SLOW: 64, DISARM: 128,
  INVULN: 256, CHANNEL: 512, HASTE: 1024, TAUNT: 2048, DEAD: 4096, REVEALED: 8192, BREAK: 16384, MUTE: 32768,
};

// Ability.flags bitmask
export const ABF = { PASSIVE: 1, TOGGLE_ON: 2, AUTOCAST_ON: 4, CHANNELING: 8, HIDDEN: 16, NO_TARGET: 32, UNIT_TARGET: 64, POINT_TARGET: 128 };

export const INV_SLOTS = 6;
