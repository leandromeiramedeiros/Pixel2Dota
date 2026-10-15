// KV3 text parser (the `-b DATA` dump of Source2Viewer-CLI): parseKV3(text) -> plain JS value.
//   { key = value }  -> object      [ a, b, ]  -> array      "str" / """multi""" -> string      resource:"path" / soundevent:"x" -> { $type, value }
//   numbers, true / false / null. Leading <!-- header --> and // comments are skipped. Throws on malformed input (with the offset).
export function parseKV3(src) {
  let i = 0;
  const n = src.length;
  const err = (m) => { throw new Error(`kv3: ${m} at ${i}: ${JSON.stringify(src.slice(i, i + 40))}`); };
  const ws = () => {
    for (;;) {
      while (i < n && /\s/.test(src[i])) i++;
      if (src.startsWith('<!--', i)) { const e = src.indexOf('-->', i); i = e < 0 ? n : e + 3; continue; }
      if (src.startsWith('//', i)) { while (i < n && src[i] !== '\n') i++; continue; }
      if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i); i = e < 0 ? n : e + 2; continue; }
      return;
    }
  };
  const str = () => {
    if (src.startsWith('"""', i)) { const e = src.indexOf('"""', i + 3); if (e < 0) err('open """'); const s = src.slice(i + 3, e); i = e + 3; return s.replace(/^\r?\n/, '').replace(/\r?\n$/, ''); }
    i++; let s = '';
    while (i < n && src[i] !== '"') { if (src[i] === '\\' && i + 1 < n) { const d = src[i + 1]; s += d === 'n' ? '\n' : d === 't' ? '\t' : d; i += 2; } else s += src[i++]; }
    if (src[i] !== '"') err('open string');
    i++; return s;
  };
  const ident = () => { const m = /^[A-Za-z_][\w.:]*/.exec(src.slice(i, i + 256)); if (!m) err('identifier expected'); i += m[0].length; return m[0]; };
  function value() {
    ws();
    const c = src[i];
    if (c === '{') {
      i++; const o = {};
      for (;;) {
        ws(); if (src[i] === '}') { i++; return o; }
        if (i >= n) err('open {');
        const k = src[i] === '"' ? str() : ident();
        ws(); if (src[i] !== '=') err('= expected'); i++;
        o[k] = value();
        ws(); if (src[i] === ',') i++;
      }
    }
    if (c === '[') {
      i++; const a = [];
      for (;;) {
        ws(); if (src[i] === ']') { i++; return a; }
        if (i >= n) err('open [');
        a.push(value()); ws(); if (src[i] === ',') i++;
      }
    }
    if (c === '"') return str();
    const m = /^[+-]?(\d+\.?\d*(e[+-]?\d+)?|\.\d+(e[+-]?\d+)?)/i.exec(src.slice(i, i + 64));
    if (m && !/[A-Za-z_:]/.test(src[i + m[0].length] || '')) { i += m[0].length; return +m[0]; }
    const id = ident();
    if (id === 'true') return true;
    if (id === 'false') return false;
    if (id === 'null') return null;
    if (src[i] === ':' || id.endsWith(':')) {   // typed value: resource:"x", soundevent:"y", panorama:"z"
      const t = id.replace(/:$/, ''); if (src[i] === ':') i++;
      ws(); return { $type: t, value: src[i] === '"' ? str() : value() };
    }
    return id;   // bare enum token
  }
  const v = value();
  ws();
  if (i < n) err('trailing data');
  return v;
}
