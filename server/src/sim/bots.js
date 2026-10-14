// BOTS STUB (sim agent). The bots agent replaces the body but keeps this export.
//   update(w, dt)   called once per tick before units think. For each bot player (w.players values with isBot) issue
//                   orders with w.order(pid, {t:'amove'|'move'|'attack'|'cast'|'item'|'learn'|'buy'|'sell'|'swap', ...}).
//                   Keep it cheap (stagger decisions per bot: e.g. only think when ((w.tick + slot) % 10) === 0).
export function update(w, dt) {}
