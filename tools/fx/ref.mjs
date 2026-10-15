// OG Dota 2 FX reference for a hero's abilities, from the LOCAL game files only (pak01_dir.vpk + Source2Viewer-CLI; never the web).
//   node tools/fx/ref.mjs <hero> [ability ...]        (npm run fx:ref -- lina laguna_blade)     node tools/fx/ref.mjs <hero> --list
// Per ability -> tools/.cache/ref/<hero>/fx/<ability>/ (gitignored, PRIVATE: decoded Valve textures, never commit, never copy to docs/ or client/):
//   ref.json   mapping (ability -> vpcf roots, variants, ambiguity notes), gameplay numbers, every system of the tree (emitters, renderers, lifetimes,
//              rates, radii, fades, colours, textures, light colours), preview capabilities.  Numbers / colours from here may be committed elsewhere.
//   tex/*.png  frame 0 of every texture the tree uses.
//   og.png     the OG panel: CPU preview at t = 0.1 / 0.4 / 1.0 s, texture thumbnails, colour swatches, key params per system.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Canvas } from '../art/vox.mjs';
import { encodePng } from '../art/png.mjs';
import { decodePng } from '../vox/lib/pngdec.mjs';
import { drawText } from '../vox/lib/font.mjs';
import { pak, run, VPK, RefError } from '../vox/lib/dota.mjs';
import { heroInfo, abilityNumbers, abilityFiles, ALIAS, loadTree, rootsOf, flatten, CACHE } from './lib/vpcf.mjs';
import { PREVIEW, camera, extent, render } from './lib/sim.mjs';

export const TIMES = [0.1, 0.4, 1.0];
const PW = 1452, CW = 480, CH = 270, GAP = 6;            // panel width = 3 cells (matches the view.mjs "ours" row)
const BG = '#14161f', LABEL = '#e0e6ff', DIM = '#8892b0', WARN = '#ffb060';

/** Our ability keys for a hero (shared/heroes.js order), minus empty / invoke slots. */
export async function ourAbilities(hero) {
  const { HEROES } = await import('../../shared/heroes.js');
  const h = Object.values(HEROES).find((x) => x.short === hero);
  if (!h) throw new RefError(`unknown hero "${hero}" (shared/heroes.js)`);
  return [...h.abilities, ...(h.invoked || [])].filter((a) => !/_empty\d|^invoker_invoke$/.test(a));
}

// ---------------------------------------------------------------------------------------------------------------- textures
/** Decode textures (one CLI call) into <dir>/_dec, keep frame 0 as <dir>/tex/<name>.png, drop the rest. -> Map vtex -> { file, W, H, seqs, frames }. */
function decodeTextures(vtex, dir) {
  const tdir = path.join(dir, 'tex'), info = new Map(), base = (t) => path.basename(t, '.vtex');
  fs.mkdirSync(tdir, { recursive: true });
  const need = vtex.filter((t) => !fs.existsSync(path.join(tdir, base(t) + '.png')) && pak().entries.has(t + '_c'));
  if (need.length) {
    const dec = path.join(dir, '_dec');
    fs.mkdirSync(dec, { recursive: true });
    try { run(['-i', VPK(), '-f', need.map((t) => t + '_c').join(','), '-d', '-o', dec]); } catch { /* partial output is fine */ }
    for (const t of need) {
      const d = path.join(dec, path.dirname(t)), b = base(t);
      if (!fs.existsSync(d)) continue;
      const pngs = fs.readdirSync(d).filter((f) => f.endsWith('.png') && (f === b + '.png' || f.startsWith(b + '_seq')));
      const first = [b + '.png', b + '_seq0.png', b + '_seq0_0.png'].find((f) => pngs.includes(f)) || pngs.sort()[0];
      if (first) fs.copyFileSync(path.join(d, first), path.join(tdir, b + '.png'));
      const seqs = new Set(pngs.map((f) => (/_seq(\d+)/.exec(f) || [])[1]).filter(Boolean));
      fs.writeFileSync(path.join(tdir, b + '.json'), JSON.stringify({ vtex: t, seqs: seqs.size, frames: pngs.length }));
    }
    fs.rmSync(dec, { recursive: true, force: true });
  }
  for (const t of vtex) {
    const f = path.join(tdir, base(t) + '.png');
    if (!fs.existsSync(f)) { info.set(t, null); continue; }
    const img = decodePng(fs.readFileSync(f)), meta = fs.existsSync(f.replace(/\.png$/, '.json')) ? JSON.parse(fs.readFileSync(f.replace(/\.png$/, '.json'), 'utf8')) : {};
    info.set(t, { file: path.relative(dir, f).replace(/\\/g, '/'), W: img.W, H: img.H, seqs: meta.seqs || 0, frames: meta.frames || 1, img });
  }
  return info;
}

// ---------------------------------------------------------------------------------------------------------------- one ability
const shortName = (name, hero) => name.replace(/^(hero_)?/, '').replace(new RegExp(`^(${hero.short}|${hero.folders.map((f) => path.basename(f).replace(/^hero_/, '')).join('|')})_(spell_)?`), '');
const fmt = (x) => (x == null ? '-' : typeof x === 'number' ? String(x) : Array.isArray(x) ? (x[0] === x[1] ? String(x[0]) : `${x[0]}-${x[1]}`) : x.dyn ? `${x.dyn}${x.lit != null ? ' ' + x.lit : x.out ? ' ' + x.out.join('-') : ''}` : JSON.stringify(x));
const hexC = (c) => '#' + c.slice(0, 3).map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
const renderable = (s) => !s.disabled && !s.error && (s.renderers || []).some((r) => ['sprite', 'rope', 'trail', 'light'].includes(r.kind));

/** Build ref.json + tex/ + og.png for one ability. `claims` = Map vpcf -> [abilities] over the hero (overlap notes). */
export function buildAbility(hero, ability, claims = new Map()) {
  const dir = path.join(CACHE, hero.short, 'fx', ability);
  fs.mkdirSync(dir, { recursive: true });
  const def = hero.def(ability), nums = abilityNumbers(def), m = abilityFiles(hero, ability), notes = [];
  const pre = ability.startsWith(hero.short + '_') ? ability.slice(hero.short.length + 1) : ability;
  if (ALIAS[ability]) notes.push(`name alias: ${ALIAS[ability].join(', ')} (file names differ from the ability key)`);
  if (!m.files.length) notes.push(`no vpcf matched in ${hero.folders.join(', ')}${m.variants.length ? ' (only variants)' : ''}: passive without FX of its own, or the FX lives under another name / folder`);
  const shared = m.files.filter((f) => (claims.get(f) || []).length > 1);
  if (shared.length) notes.push(`${shared.length} file(s) also match another ability: ${shared.map((f) => path.basename(f, '.vpcf') + ' (' + claims.get(f).filter((a) => a !== ability).join(', ') + ')').slice(0, 6).join('; ')}`);
  const sys = m.files.length ? loadTree(m.files, dir) : new Map();
  const roots = rootsOf(m.files, sys);
  const sizeOf = (r) => flatten([r], sys).filter(renderable).length;
  // primary root: named exactly after the ability (<x>_spell_<ab> / <x>_<ab>), else the biggest renderable tree
  const sq = (s) => s.replace(/_/g, ''), stems = m.stems.length ? m.stems : [pre];
  const exact = roots.filter((r) => stems.some((s) => sq(path.basename(r, '.vpcf')).endsWith(sq(s))) && sizeOf(r) > 0).sort((a, b) => a.length - b.length);
  const primary = exact[0] || roots.slice().sort((a, b) => sizeOf(b) - sizeOf(a))[0] || null;
  if (primary && !exact.length) notes.push(`no root named after the ability; preview uses the biggest tree: ${path.basename(primary, '.vpcf')}`);
  if (roots.length > 1) notes.push(`${roots.length} separate root systems (the game fires them at different moments: cast / projectile / impact / debuff); the preview plays only ${primary ? path.basename(primary, '.vpcf') : '-'}, the table lists all`);
  if (m.variants.length) notes.push(`${m.variants.length} variant file(s) left out (team / shard / scepter / LOD): ${m.variants.map((v) => path.basename(v, '.vpcf')).slice(0, 8).join(', ')}${m.variants.length > 8 ? ', ...' : ''}`);
  const flatAll = flatten(roots, sys), flatP = primary ? flatten([primary], sys) : [];
  const vtex = [...new Set(flatAll.filter((s) => !s.error).flatMap((s) => s.textures || []))];
  const tex = decodeTextures(vtex, dir);
  // gameplay distance for CP1: cast range (clamped), else 600
  const D = Math.max(300, Math.min(900, +(nums?.castRange || 0) || 600));
  const cps = [[0, 0, 0], [D, 0, 0]];
  const ref = {
    hero: hero.short, ability, numbers: nums,
    mapping: { folders: hero.folders, stems: m.stems, primary, roots, files: m.files, variants: m.variants },
    ambiguous: notes,
    systems: flatAll.map(({ classes, ...s }) => ({ ...s, classes })),
    textures: vtex.map((t) => ({ vtex: t, ...(tex.get(t) ? { file: tex.get(t).file, size: [tex.get(t).W, tex.get(t).H], seqs: tex.get(t).seqs, frames: tex.get(t).frames } : { missing: true }) })),
    colors: [...new Map(flatAll.flatMap((s) => (s.colors || []).map((c) => [c.hex, c]))).values()].map((c) => c.hex),
    preview: { ...PREVIEW, times: TIMES, cps: { 0: 'origin (the caster, or the cast point of a ground-target spell)', 1: `+x ${D} (cast range, clamped 300-900)`, other: 'CP0, or CP0 -> CP1 for paths' }, system: primary },
  };
  fs.writeFileSync(path.join(dir, 'ref.json'), JSON.stringify(ref, null, 1));
  const og = panel(hero, ability, ref, flatAll, flatP, tex, cps);
  fs.writeFileSync(path.join(dir, 'og.png'), encodePng(og.W, og.H, og.px));
  return { dir, ref, roots: roots.length, systems: flatAll.length, textures: vtex.length };
}

// ---------------------------------------------------------------------------------------------------------------- OG panel
function panel(hero, ability, ref, flatAll, flatP, tex, cps) {
  const texList = [...tex.entries()].filter(([, v]) => v);
  const cols = [...new Set(ref.colors)].slice(0, 40);
  const rowsT = flatAll.filter((s) => !s.error).slice(0, 30);
  const TH = 64, tPer = Math.floor(PW / (TH + 30)), texRows = Math.ceil(texList.length / tPer);
  const H = 4 + 18 + 12 * Math.min(3, ref.ambiguous.length + 1) + CH + 8 + (texRows ? texRows * (TH + 14) + 4 : 0) + (cols.length ? 26 : 0) + 12 + rowsT.length * 9 + 12;
  const C = new Canvas(PW, H, BG);
  let y = 4;
  const n = ref.numbers || {}, vals = Object.entries(n.values || {}).slice(0, 8).map(([k, v]) => `${k} ${v}`).join('  ');
  drawText(C, 0, y, `OG DOTA 2   ${ability}   ${ref.mapping.roots.length} ROOTS  ${flatAll.length} SYSTEMS  ${ref.mapping.files.length} FILES  ${ref.mapping.variants.length} VARIANTS`, '#ffcf70', 1);
  drawText(C, 0, y + 8, `CAST RANGE ${n.castRange ?? '-'}  CAST POINT ${n.castPoint ?? '-'}  ${vals}`.slice(0, 360), DIM, 1); y += 18;
  const amb = ref.ambiguous.length ? ref.ambiguous : ['mapping: exact'];
  for (const a of amb.slice(0, 3)) { drawText(C, 0, y, ('! ' + a).slice(0, 360), ref.ambiguous.length ? WARN : DIM, 1); y += 12; }
  // CPU preview cells (primary tree), auto-fit, same camera for all three times
  if (flatP.some(renderable)) {
    const [x0, x1, y0, y1] = extent(flatP, TIMES, cps);
    const sc = Math.max(0.08, Math.min(1.2, Math.min((CW - 40) / Math.max(200, x1 - x0), (CH - 40) / Math.max(150, y1 - y0))));
    const cam = camera({ W: CW, H: CH, scale: sc, cx: CW / 2 - ((x0 + x1) / 2) * sc, cy: CH / 2 - ((y0 + y1) / 2) * sc });
    const look = (t) => tex.get(t)?.img || null;
    TIMES.forEach((t, k) => {
      const img = render(flatP, t, cps, cam, look);
      C.blit(img, k * (CW + GAP), y, 1);
      drawText(C, k * (CW + GAP) + 4, y + 4, `OG CPU PREVIEW  T ${t}S  ${path.basename(ref.mapping.primary, '.vpcf')}`, '#ffcf70', 1);
      drawText(C, k * (CW + GAP) + 4, y + CH - 9, `GRID 100U  BLUE CP0 ORIGIN  RED CP1 +X ${cps[1][0]}U  ${Math.round(sc * 100) / 100} PX/U`, DIM, 1);
    });
  } else {
    C.rect(0, y, PW, CH, '#1c1f2b');
    drawText(C, 12, y + CH / 2 - 6, ref.mapping.files.length ? 'NO SPRITE / ROPE / TRAIL / LIGHT RENDERER IN THE PRIMARY TREE (MODELS ONLY?) - SEE TABLE' : 'NO OG PARTICLE SYSTEM FOR THIS ABILITY', WARN, 2);
  }
  y += CH + 8;
  // textures
  texList.forEach(([t, v], i) => {
    const X = (i % tPer) * (TH + 30), Y = y + Math.floor(i / tPer) * (TH + 14);
    const s = Math.max(v.W, v.H) / TH, th = { W: Math.max(1, Math.round(v.W / s)), H: Math.max(1, Math.round(v.H / s)), rgba: null };
    th.rgba = new Uint8ClampedArray(th.W * th.H * 4);
    for (let yy = 0; yy < th.H; yy++) for (let xx = 0; xx < th.W; xx++) {
      const si = (Math.min(v.H - 1, Math.floor(yy * s)) * v.W + Math.min(v.W - 1, Math.floor(xx * s))) * 4, di = (yy * th.W + xx) * 4, a = v.img.rgba[si + 3] / 255;
      for (let q = 0; q < 3; q++) th.rgba[di + q] = 22 + (v.img.rgba[si + q] - 22) * a;   // over the dark bg (alpha shown as fade)
      th.rgba[di + 3] = 255;
    }
    C.rect(X, Y, TH, TH, '#0a0b10'); C.blit(th, X, Y, 1);
    drawText(C, X, Y + TH + 2, path.basename(t, '.vtex').slice(0, 23), DIM, 1);
    if (v.frames > 1) drawText(C, X + 2, Y + 2, `${v.frames}F`, '#ffcf70', 1);
  });
  if (texRows) y += texRows * (TH + 14) + 4;
  // colour swatches
  if (cols.length) {
    cols.forEach((h, i) => { const X = i * 36; C.rect(X, y, 32, 14, h); drawText(C, X, y + 16, h.slice(1), DIM, 1); });
    y += 26;
  }
  // params table
  drawText(C, 0, y, 'SYSTEM                                   DELAY  RENDER          EMIT                 LIFE        RADIUS      R-INTERP      FADE IN/OUT  COLOUR', '#ffcf70', 1); y += 12;
  for (const s of rowsT) {
    const em = (s.emitters || []).map((e) => (e.count != null ? `x${fmt(e.count)}` : `${fmt(e.rate)}/s${e.duration && fmt(e.duration) !== '0' ? ' ' + fmt(e.duration) + 's' : ''}`) + (e.start && fmt(e.start) !== '0' ? '@' + fmt(e.start) : '')).join(' ');
    const rd = (s.renderers || []).map((r) => r.kind + (r.additive ? '+' : '') + (r.kind === 'light' && Array.isArray(r.color) ? '' : '')).join(',');
    const ri = s.ops?.radius ? `${s.ops.radius.from}>${s.ops.radius.to}` : '';
    const fd = `${s.ops?.fadeIn ?? '-'}/${s.ops?.fadeOut ?? '-'}`;
    const name = ('  '.repeat(Math.min(4, s.depth)) + shortName(s.name, hero) + (s.disabled ? ' (off)' : '')).slice(0, 40).padEnd(41);
    const line = `${name}${String(s.delay).padEnd(7)}${rd.slice(0, 15).padEnd(16)}${em.slice(0, 20).padEnd(21)}${fmt(s.init?.life ?? s.constant.life).slice(0, 11).padEnd(12)}${fmt(s.init?.radius ?? s.constant.radius).slice(0, 11).padEnd(12)}${ri.slice(0, 13).padEnd(14)}${fd.padEnd(13)}`;
    drawText(C, 0, y, line, s.disabled ? '#5a6280' : LABEL, 1);
    // colour chips: init colour min/max (or constant), colour fade target, light colour
    let X = line.length * 4 + 4;
    const chips = [];
    if (s.init?.color) chips.push(s.init.color[0], s.init.color[1]); else chips.push(s.constant.color);
    if (s.ops?.colorFade) chips.push(s.ops.colorFade.to);
    for (const r of s.renderers || []) if (r.kind === 'light' && Array.isArray(r.color)) chips.push(r.color.map((x) => (x <= 1.5 ? x * 255 : x)));
    for (const c of chips) { C.rect(X, y - 1, 10, 7, hexC(c)); X += 12; }
    drawText(C, X + 2, y, chips.map(hexC).join(' ').slice(1), DIM, 1);
    y += 9;
  }
  drawText(C, 0, H - 9, 'REF ONLY  NEVER COMMIT  -  LOCAL GAME FILES  -  CPU PREVIEW IS APPROXIMATE (SEE REF.JSON PREVIEW.CANNOT)', '#ff8080', 1);
  return C;
}

// ---------------------------------------------------------------------------------------------------------------- hero
/** Build every requested ability of a hero (default: all of ours). log(line). */
export async function buildRef(short, abilities, log = console.log) {
  const hero = heroInfo(short), all = await ourAbilities(short), list = abilities?.length ? abilities : all;
  const claims = new Map();
  for (const a of all) for (const f of abilityFiles(hero, a).files) claims.set(f, [...(claims.get(f) || []), a]);
  const out = [];
  for (const a of list) {
    const t0 = Date.now(), r = buildAbility(hero, a, claims);
    log(`  ${a.padEnd(32)} ${String(r.roots).padStart(2)} roots ${String(r.systems).padStart(3)} systems ${String(r.textures).padStart(3)} tex  ${((Date.now() - t0) / 1000).toFixed(1)} s${r.ref.ambiguous.length ? '  ! ' + r.ref.ambiguous.length + ' note(s)' : ''}`);
    out.push(r);
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2), pos = args.filter((a) => !a.startsWith('--')), hero = pos[0];
  if (!hero) { console.error('usage: node tools/fx/ref.mjs <hero> [ability ...] [--list]'); process.exit(2); }
  const all = await ourAbilities(hero), want = pos.slice(1).map((p) => (all.includes(p) ? p : hero + '_' + p));
  const bad = want.filter((a) => !all.includes(a));
  if (bad.length) throw new RefError(`not an ability of ${hero}: ${bad.join(', ')}  (have: ${all.join(', ')})`);
  if (args.includes('--list')) {
    const h = heroInfo(hero);
    for (const a of want.length ? want : all) { const m = abilityFiles(h, a); console.log(`${a.padEnd(34)} ${String(m.files.length).padStart(3)} files ${String(m.variants.length).padStart(3)} variants  ${m.files.slice(0, 5).map((f) => path.basename(f, '.vpcf')).join(' ')}`); }
    return;
  }
  console.log(`fx ref ${hero} -> ${path.join(CACHE, hero, 'fx')}`);
  await buildRef(hero, want);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e instanceof RefError ? e.message : e.stack || e); process.exit(1); });
