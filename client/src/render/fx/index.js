// FX module entry (loaded lazily by render/index.js): createFx(args) -> { handle(ev, view), update(dt, view) }.
// Router -> per-hero modules (fx/<short>.js), items, misc (death/tree/end), status visuals + Invoker orbs, projectile engine.
// Every hero module exports register(c, R): R.spell(keys, fn(ev, su, tu, c)), R.proj(key, def), R.on(eventName, fn(ev, su, tu, c)), R.each(fn(c, dt, view)).
import { EV } from '../../../../shared/protocol.js';
import { createQuads } from './quads.js';
import { createCtx, PAL, ORB } from './common.js';
import { createProjectiles } from './projectiles.js';
import * as status from './status.js';
import * as misc from './misc.js';
import * as items from './items.js';
import * as invoker from './invoker.js';
import * as sven from './sven.js';
import * as lina from './lina.js';
import * as lion from './lion.js';
import * as crystal_maiden from './crystal_maiden.js';
import * as axe from './axe.js';
import * as sniper from './sniper.js';
import * as zuus from './zuus.js';
import * as drow_ranger from './drow_ranger.js';
import * as juggernaut from './juggernaut.js';

const MODS = { misc, items, invoker, sven, lina, lion, crystal_maiden, axe, sniper, zuus, drow_ranger, juggernaut, status };

export function createFx(args) {
  const Q = createQuads(args);
  const c = createCtx({ ...args, quads: Q });
  const R = {
    spells: new Map(), projs: new Map(), events: new Map(), updaters: [], coverage: new Set(),
    spell(keys, fn) { for (const k of [].concat(keys)) { this.spells.set(k, fn); this.coverage.add(k); } },
    proj(key, def) { this.projs.set(key, def); },
    on(name, fn) { this.events.set(name, fn); },
    each(fn) { this.updaters.push(fn); },
  };
  const PJ = createProjectiles(c, R);
  c.PJ = PJ;
  for (const [name, m] of Object.entries(MODS)) {
    if (!m.register) continue;
    try { m.register(c, R); } catch (e) { console.warn('[fx] register failed:', name, e); }
  }

  let warned = new Set();
  function warn(tag, e) { if (!warned.has(tag)) { warned.add(tag); console.warn('[fx] ' + tag + ' error:', e); } }
  function guard(tag, fn) { try { fn(); } catch (e) { warn(tag, e); } }

  /** Generic fallback so unknown spells still pop. */
  function generic(ev, su, tu) {
    const p = c.at(ev, su, tu); if (!p) return;
    const pal = ev.k && ev.k.startsWith('item_') ? PAL.mana : PAL.arc;
    c.blob(p.x, p.y, p.z + 60, pal, { count: 16 });
    c.glow(p.x, p.y, p.z + 60, pal.lt, 320, 1.2, 0.5);
  }

  function handle(ev, view) {
    if (view) c.view = view;
    const su = c.unit(ev.s), tu = c.unit(ev.t);
    switch (ev.e) {
      case EV.ATK: if (ev.k) guard('atk', () => PJ.atk(ev, su, tu)); return;
      case EV.PROJ: guard('proj', () => PJ.start(ev, su, tu)); return;
      case EV.PROJ_END: guard('projEnd', () => PJ.end(ev.id)); return;
      case EV.SPELL: {
        const p = ev.x != null ? ev : su || tu;
        if (p && p.x != null && !c.vis(p.x, p.y) && !(ev.x2 != null && c.vis(ev.x2, ev.y2)) && !(tu && c.vis(tu.x, tu.y))) return;   // fogged: not shown
        const fn = R.spells.get(ev.k) || (ev.k && ev.k.startsWith('item_') && R.spells.get('item_*')) || generic;
        guard('spell:' + ev.k, () => fn(ev, su, tu, c));
        return;
      }
      default: {
        const fn = R.events.get(ev.e);
        if (fn) guard('ev:' + ev.e, () => fn(ev, su, tu, c));
      }
    }
  }

  function update(dt, view) {
    if (dt > 0.1) dt = 0.1;
    Q.begin();
    c.begin(dt, view);
    try { PJ.update(dt); } catch (e) { warn('proj-update', e); }
    for (let i = 0; i < R.updaters.length; i++) { try { R.updaters[i](c, dt, view); } catch (e) { warn('upd', e); } }
    Q.end();
  }

  return { handle, update, ctx: c, registry: R, quads: Q, coverage: () => [...R.coverage] };
}
