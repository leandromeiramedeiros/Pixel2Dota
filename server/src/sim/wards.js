// Observer / sentry wards. Pure. Placed by item_ward_observer / item_ward_sentry (items.use -> placeWard).
//
// Both are KIND.WARD summons: permanently invisible to enemies (ST.INVIS), 2 attack hits to kill (unit._wardHits), expire after
// DATA lifetime (6 / 7 min). Enemies can only target one while it is revealed (inside an enemy sentry radius).
//   observer: vision 1600 (a vision source for its team in the client fog), small gold bounty for the killer.
//   sentry:   true sight (DATA true_sight_range, 1050): every enemy INVIS unit inside gets REVEALED, so it can be seen and attacked.
// The client reads unit.kind==='ward' and the key (…_sentry) for its fog radius, see client/src/render/fog.js.
import { KIND, ST } from '../../../shared/protocol.js';

export const OBSERVER_BOUNTY = 50;
export const WARD_HITS = 2;
const SENTRY_VISION = 150;
const SENTRY_SCAN = 0.25;

export const isWardItem = (key) => key === 'item_ward_observer' || key === 'item_ward_sentry';

function sentryThink(w, ward, dt) {
  ward._scan -= dt;
  if (ward._scan > 0) return;
  ward._scan = SENTRY_SCAN;
  for (const v of w.unitsInRadius(ward.x, ward.y, ward._trueSight, { enemyOf: ward, buildings: false })) {
    if (!(v._st & ST.INVIS)) continue;
    w.addModifier(v, { key: 'sentry_reveal', src: ward, dur: SENTRY_SCAN * 2, status: ST.REVEALED, hidden: true, purge: 'none', debuff: true, pierce: true });
  }
}

/** Drop a ward of `key` ('item_ward_observer' | 'item_ward_sentry') for hero/unit u at (x, y). Returns the ward unit. */
export function placeWard(w, u, key, x, y) {
  const d = w.data.items[key];
  const sentry = key === 'item_ward_sentry';
  const q = w.nav.nearestWalkable(x, y, {});
  const vals = (d && d.values) || {};
  const ward = w.spawnSummon(u, {
    key: sentry ? 'sentry_ward' : 'observer_ward', kind: KIND.WARD, x: q.x, y: q.y,
    hp: vals.health || 200, ms: 1, radius: 16, dur: vals.lifetime || (sentry ? 420 : 360),
    vision: sentry ? SENTRY_VISION : vals.vision_range_tooltip || 1600, noAttack: true, noCollide: true,
    think: sentry ? sentryThink : null,
  });
  ward._wardHits = WARD_HITS;
  ward._ward = sentry ? 'sentry' : 'observer';
  ward._trueSight = vals.true_sight_range || 900;
  ward._scan = 0;
  ward._base.goldMin = ward._base.goldMax = sentry ? 0 : OBSERVER_BOUNTY;
  w.addModifier(ward, { key: 'ward_invis', src: ward, status: ST.INVIS, purge: 'none', hidden: true, debuff: false });
  return ward;
}
