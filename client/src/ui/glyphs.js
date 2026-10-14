// Tiny hand-drawn pixel glyphs for HUD chrome (same ASCII format as the art sheets: pal char -> colour, '.' transparent).
const sun = {
  pal: { y: '#ffe27a', o: '#f2a623', k: '#6b3d0c' },
  rows: ['....k.k.k....', '.....kkk.....', '..k.kyyyk.k..', '...kyyyyyk...', 'kkkyyyyyyykkk', '...kyyyyyk...', '..k.kyyyk.k..', '.....kkk.....', '....k.k.k....'],
};
const moon = {
  pal: { w: '#dfe8ff', b: '#9fb4e8', k: '#242a52' },
  rows: ['...kkkk....', '..kwwwwk...', '.kwwbk.....', '.kwwk......', 'kwwbk......', 'kwwbk......', '.kwwbk...k.', '.kbwwwkkk..', '..kbbwwwk..', '...kkkkk...'],
};
const skull = {
  pal: { w: '#e6e0d0', k: '#15121a', g: '#9a927e' },
  rows: ['..kkkkkkk..', '.kwwwwwwwk.', 'kwwwwwwwwwk', 'kwkkwwwkkwk', 'kwkkwwwkkwk', 'kwwwwkwwwwk', '.kwwwwwwwk.', '..kwkwkwk..', '..kkkkkkk..'],
};
const sword = {
  pal: { s: '#dfe6f2', g: '#8d9bb5', h: '#b8862b', k: '#10131c' },
  rows: ['.........kk', '........ksk', '.......ksk.', '......ksk..', 'k....ksk...', 'kk..ksk....', '.kkksk.....', '..khkk.....', '.khhk......', 'khk.kk.....', 'kk.........'],
};
const reticle = {
  pal: { r: '#ff5a4a', k: '#2a0a0a' },
  rows: ['.....rr.....', '.....rr.....', '.....rr.....', '............', '............', 'rrr......rrr', 'rrr......rrr', '............', '............', '.....rr.....', '.....rr.....', '.....rr.....'],
};
const arrow = {
  pal: { w: '#f4f6fb', k: '#10131c' },
  rows: ['k.........', 'kk........', 'kwk.......', 'kwwk......', 'kwwwk.....', 'kwwwwk....', 'kwwwwwk...', 'kwwwwwwk..', 'kwwwkkkkk.', 'kwkwk.....', 'kk.kwk....', 'k..kwk....', '....kk....'],
};
const coin = {
  pal: { y: '#ffd24a', o: '#c98a14', k: '#4a2f06', w: '#fff3b0' },
  rows: ['..kkkk..', '.kyyywk.', 'kywyyyok', 'kyyyyyok', 'kyyyyyok', 'kyyyyook', '.kyooko.', '..kkkk..'],
};
export const GLYPHS = { sun, moon, skull, sword, reticle, arrow, coin };
