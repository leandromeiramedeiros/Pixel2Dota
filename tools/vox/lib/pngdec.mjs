// Minimal PNG decoder (8/16-bit, colour types 0 2 3 4 6, no interlace) -> { W, H, rgba: Uint8Array }. Used by the reference renderer only.
import zlib from 'node:zlib';

export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let p = 8, W = 0, H = 0, depth = 8, ct = 6, il = 0, pal = null, trns = null; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); depth = d[8]; ct = d[9]; il = d[12]; }
    else if (type === 'PLTE') pal = d; else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (il) throw new Error('interlaced png');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct], bpp = Math.max(1, (ch * depth) >> 3), stride = (W * ch * depth + 7) >> 3;
  const raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(stride * H);
  for (let y = 0; y < H; y++) {
    const f = raw[y * (stride + 1)], s = y * (stride + 1) + 1, o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0, b = y ? px[o - stride + x] : 0, c = x >= bpp && y ? px[o - stride + x - bpp] : 0;
      let v = raw[s + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[o + x] = v & 255;
    }
  }
  const rgba = new Uint8Array(W * H * 4), sample = (y, i) => { // i-th channel sample of a row, as 0..255 (palette index for type 3)
    if (depth === 8) return px[y * stride + i];
    if (depth === 16) return px[y * stride + i * 2];
    const bit = i * depth, v = (px[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
    return ct === 3 ? v : Math.round(v * 255 / ((1 << depth) - 1));
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    if (ct === 3) { const i = sample(y, x); rgba[o] = pal[i * 3]; rgba[o + 1] = pal[i * 3 + 1]; rgba[o + 2] = pal[i * 3 + 2]; rgba[o + 3] = trns && i < trns.length ? trns[i] : 255; }
    else if (ct === 0 || ct === 4) { const g = sample(y, x * ch); rgba[o] = rgba[o + 1] = rgba[o + 2] = g; rgba[o + 3] = ct === 4 ? sample(y, x * ch + 1) : 255; }
    else { rgba[o] = sample(y, x * ch); rgba[o + 1] = sample(y, x * ch + 1); rgba[o + 2] = sample(y, x * ch + 2); rgba[o + 3] = ct === 6 ? sample(y, x * ch + 3) : 255; }
  }
  return { W, H, rgba };
}
