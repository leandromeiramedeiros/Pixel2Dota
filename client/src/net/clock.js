// Server-time snapshot clock. Patches are stamped with the server's sim time mapped onto performance.now(), not with
// their arrival time, so network jitter no longer shows up as uneven sample spacing; the render delay adapts to the
// measured jitter (a 30 Hz stream over a phone link can stall 150+ ms, a fixed 100 ms buffer then freezes and jumps).
//   createClock() -> { stamp(serverSec, now) -> local ms, delay() -> ms, reset() }
import { PATCH_MS, INTERP_MS } from '@p2d/shared/protocol.js';

export const DELAY_MIN = INTERP_MS * 0.7;   // LAN / desktop: ~2 patches
export const DELAY_MAX = 350;               // worst case before the picture feels laggy

export function createClock() {
  let off = Infinity, lastNow = 0, lastTs = -1, jit = 0;
  return {
    /** local-clock time of a patch produced at server time `serverSec` (seconds) that arrived at `now` */
    stamp(serverSec, now) {
      const ts = serverSec * 1000;
      if (!(ts > 0) || ts < lastTs - 1000) { off = Infinity; jit = 0; }   // lobby (time 0) or a new match: start over
      const o = now - ts;
      const dt = lastNow ? Math.min(1000, now - lastNow) : 0;
      lastNow = now;
      if (!(ts > 0)) { lastTs = -1; return now; }
      lastTs = ts;
      // off = the fastest delivery seen (min filter), relaxing slowly so clock drift / a route change can raise it
      if (o < off) off = o; else off += Math.min(o - off, dt * 0.001);   // ~1 ms per s
      // jitter = how late this patch is vs the fastest one; decaying peak, so one stall raises the buffer for a few s
      jit = Math.max(o - off, jit - dt * 0.03);
      return ts + off;
    },
    delay() { return Math.max(DELAY_MIN, Math.min(DELAY_MAX, PATCH_MS + jit + 15)); },
    reset() { off = Infinity; lastNow = 0; lastTs = -1; jit = 0; },
  };
}
