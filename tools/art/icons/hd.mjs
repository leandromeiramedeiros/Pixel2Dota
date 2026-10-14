// HD (40x40 frame, 36x36 art box) icon redraws, matched to the Dota 2 originals' composition and palette.
import { HD_LINA } from './hd_lina.mjs';
import { HD_INVOKER } from './hd_invoker.mjs';
import { HD_ITEMS } from './hd_items.mjs';
export const HD = { ...HD_LINA, ...HD_INVOKER, ...HD_ITEMS };
