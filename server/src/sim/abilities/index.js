// Ability handler registry. One file per hero in this folder (<short>.js, e.g. sven.js) exporting a default
// object { [abilityKey]: handler }. Files are loaded automatically for every roster hero; missing or broken files are skipped
// (a hero without a file simply has no-op abilities). Handler files may import ONLY shared/* and ../events.js (never world/combat/status/heroes/orders: they import this registry, top-level await would deadlock). Use the `w` argument: w.damage, w.addModifier, w.unitsInRadius, w.spawnProjectile, ... (see ../API.md).
//
// handler = {
//   cast(w, u, ab, target)      target = {unit|null, x, y}. Return nothing or an object merged into the auto-emitted EV.SPELL
//                               ({r, dur, x2, y2...}); return {channel: seconds, tick?, end?} to start a channel.
//   passive(w, u, ab)           (re)apply permanent modifiers; called when the ability is learned/levelled and on respawn
//   tick(w, u, ab, dt)          every sim tick while the owner is alive and ab.level > 0
//   bonus(w, u, ab, b)          add to the stat bonus accumulator b {str,agi,int,dmg,armor,as,ms,msPct,hp,mana,manaPct,hpRegen,manaRegen,mr,range}
//   onAttack(w, u, ab, tgt, info)               before damage (modify info.dmg / info.crit / info.type / info.pierce / info.noCleave)
//   onAttackLanded(w, u, ab, tgt, info, dealt)  after the attacker's hit landed
//   onAttacked(w, u, ab, attacker, info, dealt) after the owner was hit by an attack
//   onDamaged(w, u, ab, src, dealt, type)       after the owner took any damage
//   onKill(w, u, ab, victim) / onDeath(w, u, ab, killer)
//   canCast(w, u, ab, target) -> true | string (reason)     castRange(w,u,ab) / castPoint / manaCost / cooldown(w,u,ab) overrides
//   targeting: 'unit'|'point'|'none' (override of DATA behavior)    pierce: true (works on magic immune)    autocast: true (toggle on no-target cast)
//   learnReq(w, u, ab) -> min hero level to learn the next level     channelTick/channelEnd also supported via the object returned by cast()
// }
import { HERO_KEYS, HEROES } from '../../../../shared/heroes.js';

export const HANDLERS = {};
export const NOOP = Object.freeze({});
export const getHandler = (key) => HANDLERS[key] || NOOP;
export const registerHandlers = (obj) => Object.assign(HANDLERS, obj);

for (const hk of HERO_KEYS) {
  const short = HEROES[hk].short;
  try {
    const mod = await import(`./${short}.js`);
    Object.assign(HANDLERS, mod.default || mod.abilities || {});
  } catch (e) {
    if (!(e && e.code === 'ERR_MODULE_NOT_FOUND' && String(e.message).includes(`${short}.js`))) console.warn(`[sim] abilities/${short}.js failed to load:`, e && e.message);
  }
}
