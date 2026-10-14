// Compact event constructors (contract: docs/ARCHITECTURE.md "Server -> client"). All helpers push to w._ev.
import { EV } from '../../../shared/protocol.js';

const r1 = (n) => Math.round(n * 10) / 10;
export const emit = (w, ev) => { w._ev.push(ev); return ev; };

export const evAtk = (w, s, t, k, sp) => emit(w, { e: EV.ATK, s, t, k: k || '', sp: sp || 0 });
export const evHit = (w, s, t, d, ty, c) => emit(w, { e: EV.HIT, s, t, d: Math.round(d), ty, c: c ? 1 : 0 });
/** ability / item VFX trigger. extra: {t,x,y,x2,y2,r,dur,lv} */
export const evSpell = (w, k, s, extra) => emit(w, Object.assign({ e: EV.SPELL, k, s }, extra));
export const evDeath = (w, u) => emit(w, { e: EV.DEATH, t: u.id, k: u.key, x: Math.round(u.x), y: Math.round(u.y) });
export const evKill = (w, killerPid, victimPid, gold) => emit(w, { e: EV.KILL, killer: killerPid || '', victim: victimPid || '', gold: gold | 0 });
export const evGold = (w, t, g) => emit(w, { e: EV.GOLD, t, g: g | 0 });
export const evLvl = (w, t) => emit(w, { e: EV.LVL, t });
export const evHeal = (w, t, a) => emit(w, { e: EV.HEAL, t, a: r1(a) });
export const evMana = (w, t, a) => emit(w, { e: EV.MANA, t, a: r1(a) });
export const evTree = (w, i) => emit(w, { e: EV.TREE, i });
export const evTreeGrow = (w, i) => emit(w, { e: EV.TREE_GROW, i });
export const evBlink = (w, s, x, y, x2, y2) => emit(w, { e: EV.BLINK, s, x: Math.round(x), y: Math.round(y), x2: Math.round(x2), y2: Math.round(y2) });
export const evTp = (w, s, x, y, dur) => emit(w, { e: EV.TP, s, x: Math.round(x), y: Math.round(y), dur });
/** text message. `p` = recipient pid (omit = everyone) */
export const evMsg = (w, text, p) => emit(w, p ? { e: EV.MSG, text, p } : { e: EV.MSG, text });
export const evEnd = (w, winner) => emit(w, { e: EV.END, winner });
export const evProj = (w, p) => emit(w, { e: EV.PROJ, id: p.id, k: p.k, s: p.srcId, t: p.tgtId || undefined, x: Math.round(p.x), y: Math.round(p.y), x2: p.tx === undefined ? undefined : Math.round(p.tx), y2: p.ty === undefined ? undefined : Math.round(p.ty), sp: p.speed });
export const evProjEnd = (w, id) => emit(w, { e: EV.PROJ_END, id });
