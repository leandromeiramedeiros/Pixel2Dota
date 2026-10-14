// Compact codecs for the numeric grids in data/dotaworld.js (pure, no DOM/node APIs; the extractor encodes, map.js decodes).
//   Grid16: Int16 grid -> MED (LOCO-I) predictor from the W/N/NW neighbours -> zigzag varint, zero residuals run-length coded
//           (0, varint count) -> base64. GRID_NONE (-32768) marks "no value".
//   Bytes:  Uint8 array -> (value, varint run) pairs -> base64.
export const GRID_NONE = -32768;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 3) {
    const a = u8[i], b = u8[i + 1], c = u8[i + 2], n = (a << 16) | ((b || 0) << 8) | (c || 0);
    s += B64[n >> 18] + B64[(n >> 12) & 63] + (i + 1 < u8.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < u8.length ? B64[n & 63] : '=');
  }
  return s;
}
function fromB64(str) {
  const pad = str.endsWith('==') ? 2 : str.endsWith('=') ? 1 : 0, out = new Uint8Array((str.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < str.length; i += 4) {
    const n = (B64.indexOf(str[i]) << 18) | (B64.indexOf(str[i + 1]) << 12) | ((B64.indexOf(str[i + 2]) & 63) << 6) | (B64.indexOf(str[i + 3]) & 63);
    if (o < out.length) out[o++] = n >> 16; if (o < out.length) out[o++] = (n >> 8) & 255; if (o < out.length) out[o++] = n & 255;
  }
  return out;
}
const pushVar = (a, v) => { while (v >= 128) { a.push((v & 127) | 128); v = Math.floor(v / 128); } a.push(v); };
function readVar(u8, p) { let v = 0, m = 1, b; do { b = u8[p.i++]; v += (b & 127) * m; m *= 128; } while (b & 128); return v; }
const med = (a, b, c) => (c >= Math.max(a, b) ? Math.min(a, b) : c <= Math.min(a, b) ? Math.max(a, b) : a + b - c);
const predict = (g, w, x, y) => {
  const W = x ? g[y * w + x - 1] : y ? g[(y - 1) * w] : 0, N = y ? g[(y - 1) * w + x] : W, NW = x && y ? g[(y - 1) * w + x - 1] : N;
  return med(W, N, NW);
};

export function encodeGrid16(g, w, h) {
  const out = []; let zeros = 0;
  const flush = () => { if (zeros) { out.push(0); pushVar(out, zeros - 1); zeros = 0; } };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = g[y * w + x] - predict(g, w, x, y);
    if (r === 0) { zeros++; continue; }
    flush(); pushVar(out, r > 0 ? 2 * r - 1 : -2 * r); // zigzag, never 0
  }
  flush();
  return toB64(Uint8Array.from(out));
}
export function decodeGrid16(str, w, h) {
  const u8 = fromB64(str), g = new Int16Array(w * h), p = { i: 0 };
  let zeros = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0;
    if (zeros > 0) zeros--;
    else {
      const v = readVar(u8, p);
      if (v === 0) zeros = readVar(u8, p);
      else r = v & 1 ? (v + 1) / 2 : -v / 2;
    }
    g[y * w + x] = predict(g, w, x, y) + r;
  }
  return g;
}

export function encodeBytes(a) {
  const out = [];
  for (let i = 0; i < a.length;) { let j = i; while (j < a.length && a[j] === a[i]) j++; out.push(a[i]); pushVar(out, j - i - 1); i = j; }
  return toB64(Uint8Array.from(out));
}
export function decodeBytes(str, n) {
  const u8 = fromB64(str), a = new Uint8Array(n), p = { i: 0 };
  for (let o = 0; p.i < u8.length;) { const v = u8[p.i++], c = readVar(u8, p) + 1; a.fill(v, o, o + c); o += c; }
  return a;
}
