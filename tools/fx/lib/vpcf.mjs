// Dota 2 particle systems (.vpcf) from the LOCAL game files: hero abilities -> vpcf roots, KV3 load (Source2Viewer-CLI `-b DATA`, batched per folder),
// recursive summary through m_Children (emitters, renderers, lifetimes, rates, radii, colours, textures). Private reference: everything decoded is
// cached under the gitignored tools/.cache/ref/<hero>/fx/ only. Numbers / colours extracted here may be committed; textures and renders may not.
import fs from 'node:fs';
import path from 'node:path';
import { parseKV } from '../../vdf.mjs';
import { pak, run, VPK, CACHE, RefError } from '../../vox/lib/dota.mjs';
import { parseKV3 } from './kv3.mjs';

// ---------------------------------------------------------------------------------------------------------------- hero / ability KV
const kvc = {};
const kv = (f) => (kvc[f] ||= parseKV(pak().readText(f)));
/** Hero short ("lina") -> { key, short, folders: [particle folder], abilities: { key: def } (hero file AbilityDefinitions, npc_abilities fallback), slots: [Ability1..] } */
export function heroInfo(short) {
  const key = 'npc_dota_hero_' + short, f = `scripts/npc/heroes/${key}.txt`;
  if (!pak().entries.has(f)) throw new RefError(`unknown hero "${short}" (no ${f} in the game files)`);
  const h = kv(f).DOTAHeroes[key];
  const folders = String(h.particle_folder || `particles/units/heroes/hero_${short}`).split(',').map((s) => s.trim()).filter(Boolean);
  const slots = Object.keys(h).filter((k) => /^Ability\d+$/.test(k)).sort((a, b) => +a.slice(7) - +b.slice(7)).map((k) => h[k]).filter((a) => a && !/^special_bonus|^generic_hidden/.test(a));
  const defs = h.AbilityDefinitions || {}, glob = kv('scripts/npc/npc_abilities.txt').DOTAAbilities || {};
  return { key, short, folders, slots, def: (a) => defs[a] || glob[a] || null };
}
/** Gameplay numbers of an ability def (cast range / point, duration, AoE-ish values at level 1, sound, behaviour). */
export function abilityNumbers(def) {
  if (!def) return null;
  const first = (v) => (v == null ? undefined : String(v).trim().split(/\s+/)[0]);
  const out = { behavior: def.AbilityBehavior, castRange: first(def.AbilityCastRange), castPoint: first(def.AbilityCastPoint), duration: first(def.AbilityDuration), channel: first(def.AbilityChannelTime), sound: def.AbilitySound, values: {} };
  for (const [k, v] of Object.entries(def.AbilityValues || {})) {
    const val = typeof v === 'object' ? v.value : v;
    if (val != null && /radius|range|width|distance|speed|duration|delay|length|aoe|interval|count|time/i.test(k)) out.values[k] = String(val).trim();
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- ability -> vpcf files
// Files in the hero folder that are not ability FX, and name parts that mark a variant (team colour, shard / scepter upgrade, low LOD, unused copies).
const NOT_ABILITY = ['portrait', 'loadout', 'taunt', 'death', 'ambient', 'heroname', 'chancegame', 'base_attack', 'attack_blur', 'crit_blur', 'dust_hit', 'idle', 'spawn', 'level', 'persona', 'arcana', 'f2p'];
const VARIANT = /(^|_)(team|shard|scepter|aghs|small|old|unused\d*|lv|null|fallback|alt|cheap)(_|$)/;
// Name mismatches between the ability key and the particle file names (the matcher handles <hero>_[spell_]<ability> and squashed underscores itself).
// value: extra name stems (matched like the ability's own name); `-` prefix excludes a stem; `=` prefix replaces the ability's own stem.
// Passives with no FX of their own (crystal_maiden_brilliance_aura, rubick_arcane_supremacy) match nothing and are reported as such.
export const ALIAS = {
  axe_berserkers_call: ['beserkers_call'],
  drow_ranger_frost_arrows: ['frost_arrow'],
  drow_ranger_wave_of_silence: ['silence_wave'],
  juggernaut_blade_dance: ['crit_tgt'],
  mirana_invis: ['moonlight'],
  mirana_arrow: ['spell_arrow', '-starlight'],
  sniper_headshot: ['headshot_slow'],
  invoker_ice_wall: ['ice_wall', 'glacierwall'],
  invoker_forge_spirit: ['forge_spirit'],
  invoker_quas: ['=quas_orb'], invoker_wex: ['=wex_orb'], invoker_exort: ['=exort_orb'],
  rubick_spell_steal: ['spell_steal'],
};
const stem = (t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t);
const toks = (s) => s.split('_').filter((t) => t && !['of', 'the', 'and'].includes(t)).map(stem);
/** Does file stem `f` (no folder, no .vpcf) name ability stem `a`? squashed substring, or every token of `a` among the file's tokens. */
function names(f, a) {
  const sq = f.replace(/_/g, ''), at = toks(a);
  if (sq.includes(a.replace(/_/g, ''))) return true;
  if (at.length > 1) { const ft = new Set(toks(f)); return at.every((t) => ft.has(t)); }
  return false;
}
/**
 * Candidate vpcf files of an ability in the hero folders: { files: [path], variants: [path], note } where files = base FX, variants = team / shard /
 * scepter / small LOD copies. Matching: ability key minus hero prefix (lina_dragon_slave -> dragon_slave) + ALIAS stems, against file names.
 */
export function abilityFiles(hero, ability) {
  const all = hero.folders.flatMap((f) => pak().list(new RegExp('^' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/[^/]+\\.vpcf_c$')));
  const pre = ability.startsWith(hero.short + '_') ? ability.slice(hero.short.length + 1) : ability.replace(/^[a-z]+_/, '');
  const al = ALIAS[ability] || [], excl = al.some((s) => s.startsWith('='));
  const want = [...(excl ? [] : [pre]), ...al.filter((s) => !s.startsWith('-')).map((s) => s.replace(/^=/, ''))], deny = al.filter((s) => s.startsWith('-')).map((s) => s.slice(1));
  // non-ability tokens, minus any the ability's own name uses (lion_finger_of_death keeps "death")
  const notAb = new RegExp(`(^|_)(${NOT_ABILITY.filter((t) => !want.some((w) => ('_' + w + '_').includes('_' + t + '_'))).join('|')})(_|$)`);
  const files = [], variants = [];
  for (const p of all) {
    const f = path.basename(p, '.vpcf_c');
    if (notAb.test(f) || deny.some((d) => f.includes(d))) continue;
    if (!want.some((w) => names(f, w))) continue;
    (VARIANT.test(f) ? variants : files).push(p.replace(/_c$/, ''));
  }
  return { files: files.sort(), variants: variants.sort(), stems: want };
}

// ---------------------------------------------------------------------------------------------------------------- KV3 load (cached)
/** Load the KV3 of many vpcf paths: one Source2Viewer-CLI call per batch (path filter list), cached per file under <dir>/_kv3/. Returns Map path -> obj. */
export function loadSystems(paths, dir) {
  const kdir = path.join(dir, '_kv3'), out = new Map(), need = [];
  fs.mkdirSync(kdir, { recursive: true });
  const cf = (p) => path.join(kdir, p.replace(/^particles\//, '').replace(/[\\/]/g, '__') + '.kv3');
  for (const p of new Set(paths)) {
    if (fs.existsSync(cf(p))) out.set(p, fs.readFileSync(cf(p), 'utf8')); else if (pak().entries.has(p + '_c')) need.push(p);
  }
  for (let i = 0; i < need.length; i += 40) {
    const batch = need.slice(i, i + 40);
    let txt = '';
    try { txt = run(['-i', VPK(), '-f', batch.map((p) => p + '_c').join(','), '-b', 'DATA']).toString('utf8'); } catch (e) { txt = e.stdout ? e.stdout.toString('utf8') : ''; }
    const parts = txt.split(/^\[\d+\/\d+\] /m).slice(1);
    for (const part of parts) {
      const name = part.slice(0, part.indexOf('\n')).trim().replace(/_c$/, '');
      const a = part.indexOf('<!-- kv3'), b = part.lastIndexOf('\n}');
      if (a < 0 || b < a) continue;
      const kv3 = part.slice(a, b + 2);
      fs.writeFileSync(cf(name), kv3); out.set(name, kv3);
    }
  }
  const res = new Map();
  for (const [p, t] of out) { try { res.set(p, parseKV3(t)); } catch (e) { res.set(p, { $error: e.message }); } }
  return res;
}
/** Children refs of a system: [{ path, delay, disabled, endCap }]. */
export const childrenOf = (o) => (o.m_Children || []).map((c) => ({ path: c.m_ChildRef?.value || c.m_ChildRef, delay: c.m_flDelay || 0, disabled: !!c.m_bDisableChild, endCap: !!c.m_bEndCap })).filter((c) => typeof c.path === 'string');
/** Load roots + every descendant (any folder), breadth-first. */
export function loadTree(roots, dir) {
  const sys = loadSystems(roots, dir);
  for (let pending = roots.slice(); pending.length;) {
    const next = [];
    for (const p of pending) { const o = sys.get(p); if (o && !o.$error) for (const c of childrenOf(o)) if (!sys.has(c.path)) next.push(c.path); }
    if (!next.length) break;
    for (const [k, v] of loadSystems(next, dir)) sys.set(k, v);
    pending = next.filter((p) => sys.has(p));
  }
  return sys;
}

// ---------------------------------------------------------------------------------------------------------------- summary
const FIELD = { 0: 'pos', 1: 'life', 3: 'radius', 4: 'roll', 5: 'rollSpeed', 6: 'color', 7: 'alpha', 9: 'seq', 10: 'trail', 12: 'yaw', 13: 'seq1', 16: 'alpha2', 18: 'scratch' };
const r3 = (x) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x);
/** Float input -> number | [min, max] | { dyn } (curve / CP / age driven) | null. */
export function fl(v, dflt = null) {
  if (v == null) return dflt;
  if (typeof v === 'number') return r3(v);
  if (typeof v !== 'object') return dflt;
  const t = v.m_nType || '';
  if (t === 'PF_TYPE_LITERAL' || (!t && v.m_flLiteralValue != null)) return r3(v.m_flLiteralValue ?? 0);
  if (t === 'PF_TYPE_RANDOM_UNIFORM' || t === 'PF_TYPE_RANDOM_BIASED') return [r3(v.m_flRandomMin ?? 0), r3(v.m_flRandomMax ?? 1)];
  if (t === 'PF_TYPE_INVALID' || t === '') return dflt;
  const o = { dyn: t.replace(/^PF_TYPE_/, '').toLowerCase() };
  if (v.m_nControlPoint != null) o.cp = v.m_nControlPoint;
  if (v.m_flLiteralValue != null) o.lit = r3(v.m_flLiteralValue);
  if (v.m_flOutputMin != null || v.m_flOutputMax != null) o.out = [r3(v.m_flOutputMin ?? 0), r3(v.m_flOutputMax ?? 1)];
  if (v.m_flMultFactor != null) o.mult = r3(v.m_flMultFactor);
  return o;
}
/** Number-ish -> [min, max] for the simulator (dyn inputs fall back to their literal / output range / `d`). */
export const range = (x, d) => (x == null ? [d, d] : typeof x === 'number' ? [x, x] : Array.isArray(x) ? x : x.out ? x.out : x.lit != null ? [x.lit, x.lit] : [d, d]);
const vec = (v) => (Array.isArray(v) ? v.map(r3) : v && typeof v === 'object' && Array.isArray(v.m_vLiteralValue) ? v.m_vLiteralValue.map(r3) : v && typeof v === 'object' && Array.isArray(v.m_LiteralColor) ? v.m_LiteralColor : null);
const res = (v) => (v && typeof v === 'object' && v.$type === 'resource' ? v.value : typeof v === 'string' ? v : null);
const isCol = (a) => Array.isArray(a) && (a.length === 3 || a.length === 4) && a.every((x) => Number.isInteger(x) && x >= 0 && x <= 255);
const hexOf = (c) => '#' + c.slice(0, 3).map((x) => x.toString(16).padStart(2, '0')).join('');
/** Every colour literal inside an operator: [{ key, rgb, a }] (gradient stops included, in order). */
function colorsIn(o, out = [], pre = '') {
  if (!o || typeof o !== 'object') return out;
  if (Array.isArray(o)) { o.forEach((x, i) => colorsIn(x, out, pre)); return out; }
  for (const [k, v] of Object.entries(o)) {
    if (/colou?r|tint/i.test(k) && isCol(v)) out.push({ key: pre + k, hex: hexOf(v), rgb: v.slice(0, 3), a: v.length > 3 ? v[3] : 255 });
    else if (k === 'm_Stops' && Array.isArray(v)) v.forEach((s) => { if (isCol(s.m_Color)) out.push({ key: pre + 'stop@' + r3(s.m_flPosition ?? 0), hex: hexOf(s.m_Color), rgb: s.m_Color.slice(0, 3), a: s.m_Color[3] ?? 255 }); });
    else if (v && typeof v === 'object') colorsIn(v, out, pre);
  }
  return out;
}
/** Every resource ref (vtex / vmat / vmdl) inside an object. */
function resIn(o, out = new Set()) {
  if (!o || typeof o !== 'object') return out;
  if (o.$type === 'resource' && typeof o.value === 'string') { out.add(o.value); return out; }
  for (const v of Array.isArray(o) ? o : Object.values(o)) resIn(v, out);
  return out;
}
const RKIND = { C_OP_RenderSprites: 'sprite', C_OP_RenderRopes: 'rope', C_OP_RenderTrails: 'trail', C_OP_RenderModels: 'model', C_OP_RenderSimpleModelCollection: 'model', C_OP_RenderDeferredLight: 'light', C_OP_RenderOmni2Light: 'light', C_OP_RenderLightBeam: 'light', C_OP_RenderProjected: 'decal', C_OP_RenderStatusEffect: 'status', C_OP_RenderScreenShake: 'shake', C_OP_RenderSound: 'sound', C_OP_RenderCables: 'rope', C_OP_RenderBlobs: 'blob', C_OP_RenderStandardLight: 'light', C_OP_RenderScreenVelocityRotate: 'other', C_OP_RenderPostProcessing: 'post', C_OP_RenderTonemapController: 'post' };

/** One system's summary (no children): what the panel + simulator need, plus raw class lists for anything not interpreted. */
export function summarize(p, o) {
  if (!o || o.$error) return { path: p, error: o ? o.$error : 'not in the game files' };
  const S = {
    path: p, name: path.basename(p, '.vpcf'), maxParticles: o.m_nMaxParticles ?? 1000,
    constant: { radius: r3(o.m_flConstantRadius ?? 5), life: r3(o.m_flConstantLifespan ?? 1), color: o.m_ConstantColor || [255, 255, 255, 255], seq: o.m_nConstantSequenceNumber ?? 0 },
    emitters: [], renderers: [], init: {}, ops: {}, colors: [], textures: [], classes: { init: [], op: [], force: [], constraint: [] },
    cpConfig: (o.m_controlPointConfigurations?.[0]?.m_drivers || []).map((d) => ({ cp: d.m_iControlPoint ?? 0, attach: d.m_iAttachType, offset: d.m_vecOffset, entity: d.m_entityName })),
    children: childrenOf(o),
  };
  if (o.m_ConstantColor) S.colors.push({ key: 'm_ConstantColor', hex: hexOf(o.m_ConstantColor), rgb: o.m_ConstantColor.slice(0, 3), a: o.m_ConstantColor[3] ?? 255 });
  for (const e of o.m_Emitters || []) {
    if (e.m_bDisableOperator) continue;
    const c = e._class, E = { cls: c.replace(/^C_OP_/, '') };
    if (c === 'C_OP_ContinuousEmitter') { E.rate = fl(e.m_flEmitRate, 100); E.duration = fl(e.m_flEmissionDuration, 0); E.start = fl(e.m_flStartTime, 0); }
    else if (c === 'C_OP_InstantaneousEmitter') { E.count = fl(e.m_nParticlesToEmit, 1); E.start = fl(e.m_flStartTime, 0); E.maxPerFrame = e.m_nMaxEmittedPerFrame; }
    else if (c === 'C_OP_MaintainEmitter') { E.count = fl(e.m_nParticlesToMaintain, 100); E.start = fl(e.m_flStartTime, 0); E.rate = e.m_flEmissionRate; }
    else if (c === 'C_OP_NoiseEmitter') { E.rate = [r3(e.m_flOutputMin ?? 0), r3(e.m_flOutputMax ?? 100)]; E.duration = r3(e.m_flEmissionDuration ?? 0); E.start = r3(e.m_flStartTime ?? 0); }
    S.emitters.push(E);
  }
  for (const r of o.m_Renderers || []) {
    if (r.m_bDisableOperator) continue;
    const c = r._class, R = { cls: c.replace(/^C_OP_/, ''), kind: RKIND[c] || 'other' };
    const blend = r.m_nOutputBlendMode || '';
    R.additive = !!(r.m_bAdditive || /ADD/.test(blend)); if (/MOD2X/.test(blend) || r.m_bMod2X) R.mod2x = true;
    if (r.m_flOverbrightFactor != null) R.overbright = r3(fl(r.m_flOverbrightFactor, 1));
    if (r.m_flAddSelfAmount != null) R.addSelf = r3(fl(r.m_flAddSelfAmount, 0));
    if (r.m_flAnimationRate != null) R.animRate = r3(r.m_flAnimationRate);
    if (r.m_nOrientationType) R.orient = r.m_nOrientationType;
    if (R.kind === 'light') { R.color = vec(r.m_vecColorScale) || r.m_ColorScale || null; R.radiusScale = r3(fl(r.m_flRadiusScale, 1)); R.alphaScale = r3(fl(r.m_flAlphaScale, 1)); }
    else {
      const rs = [...resIn(r)];
      R.textures = rs.filter((x) => x.endsWith('.vtex')); R.materials = rs.filter((x) => x.endsWith('.vmat')); R.models = rs.filter((x) => x.endsWith('.vmdl'));
      if (R.kind === 'rope') { R.texScale = r3(r.m_flTextureVWorldSize ?? r.m_flTextureVScrollRate ?? 0) || undefined; R.subdiv = r.m_flRadiusScale ? r3(fl(r.m_flRadiusScale, 1)) : undefined; }
      if (R.kind === 'trail') { R.lengthScale = r3(fl(r.m_flLengthScale, 1)); R.maxLength = r3(r.m_flMaxLength ?? 2000); }
      if (R.kind === 'sprite' && r.m_flMaxSize != null) R.maxScreen = r3(r.m_flMaxSize);
      S.textures.push(...R.textures);
    }
    for (const c2 of colorsIn(r, [], R.cls + '.')) S.colors.push(c2);
    S.renderers.push(R);
  }
  const I = S.init, Op = S.ops;
  for (const x of o.m_Initializers || []) {
    if (x.m_bDisableOperator) continue;
    const c = x._class; S.classes.init.push(c.replace(/^C_INIT_/, ''));
    const f = FIELD[x.m_nOutputField ?? x.m_nFieldOutput];
    if (c === 'C_INIT_InitFloat' || c === 'C_INIT_InitFloatCollection') { if (f) I[f] = fl(x.m_InputValue); }
    else if (c === 'C_INIT_RandomLifeTime') I.life = [r3(x.m_fLifetimeMin ?? 0), r3(x.m_fLifetimeMax ?? 0)];
    else if (c === 'C_INIT_RandomRadius') I.radius = [r3(x.m_flRadiusMin ?? 1), r3(x.m_flRadiusMax ?? 1)];
    else if (c === 'C_INIT_RandomAlpha') I.alpha = [(x.m_nAlphaMin ?? 255) / 255, (x.m_nAlphaMax ?? 255) / 255].map(r3);
    else if (c === 'C_INIT_RandomColor' || c === 'C_INIT_ColorLitPerParticle') I.color = [x.m_ColorMin || [255, 255, 255], x.m_ColorMax || [255, 255, 255]];
    else if (c === 'C_INIT_RandomSequence') I.seq = [x.m_nSequenceMin ?? 0, x.m_nSequenceMax ?? 0];
    else if (c === 'C_INIT_RandomTrailLength') I.trail = [r3(x.m_flMinLength ?? 0.1), r3(x.m_flMaxLength ?? 0.1)];
    else if (c === 'C_INIT_InitVec' && (x.m_nOutputField === 6)) { const v = vec(x.m_InputValue); if (v) I.color = [v, v]; }
    else if (c === 'C_INIT_CreateWithinSphere' || c === 'C_INIT_CreateWithinSphereTransform') {
      I.shape = { type: 'sphere', cp: x.m_nControlPointNumber ?? x.m_TransformInput?.m_nControlPoint ?? 0, r: [range(fl(x.m_fRadiusMin), 0)[0], range(fl(x.m_fRadiusMax), 0)[1]], speed: [range(fl(x.m_fSpeedMin), 0)[0], range(fl(x.m_fSpeedMax), 0)[1]],
        local: [vec(x.m_LocalCoordinateSystemSpeedMin) || [0, 0, 0], vec(x.m_LocalCoordinateSystemSpeedMax) || [0, 0, 0]], bias: vec(x.m_vecDistanceBias) || [1, 1, 1] };
    } else if (c === 'C_INIT_RingWave') I.shape = { type: 'ring', cp: x.m_nControlPointNumber ?? 0, r: range(fl(x.m_flInitialRadius), 0), speed: [range(fl(x.m_flInitialSpeedMin), 0)[0], range(fl(x.m_flInitialSpeedMax), 0)[1]], flat: !x.m_bXYVelocityOnly ? false : true };
    else if (c === 'C_INIT_CreateAlongPath' || c === 'C_INIT_CreateSequentialPath' || c === 'C_INIT_CreateSequentialPathV2') I.shape = { type: 'path', a: x.m_PathParams?.m_nStartControlPointNumber ?? 0, b: x.m_PathParams?.m_nEndControlPointNumber ?? 1, spread: r3(x.m_fMaxDistance ?? 0) };
    else if (c === 'C_INIT_CreateOnModel' || c === 'C_INIT_CreateOnModelAtHeight') I.shape = { type: 'model', cp: x.m_nControlPointNumber ?? 0 };
    else if (c === 'C_INIT_CreateInEpitrochoid') I.shape = { type: 'ring', cp: 0, r: [r3(x.m_flRadius1 ?? 40), r3(x.m_flRadius1 ?? 40)], speed: [0, 0] };
    else if (c === 'C_INIT_InitialVelocityNoise') I.velNoise = [vec(x.m_vecOutputMin) || [0, 0, 0], vec(x.m_vecOutputMax) || [0, 0, 0]];
    else if (c === 'C_INIT_VelocityRandom') I.vel = { speed: [range(fl(x.m_fSpeedMin), 0)[0], range(fl(x.m_fSpeedMax), 0)[1]], local: [vec(x.m_LocalCoordinateSystemSpeedMin) || [0, 0, 0], vec(x.m_LocalCoordinateSystemSpeedMax) || [0, 0, 0]] };
    else if (c === 'C_INIT_PositionOffset') (I.offset ||= []).push([vec(x.m_OffsetMin) || [0, 0, 0], vec(x.m_OffsetMax) || [0, 0, 0]]);
    for (const c2 of colorsIn(x, [], 'init.' + c.replace(/^C_INIT_/, '') + '.')) S.colors.push(c2);
  }
  for (const x of o.m_Operators || []) {
    if (x.m_bDisableOperator) continue;
    const c = x._class; S.classes.op.push(c.replace(/^C_OP_/, ''));
    if (c === 'C_OP_BasicMovement') { const g = vec(x.m_Gravity); if (g && g.some((v) => v)) Op.gravity = g; if (x.m_fDrag) Op.drag = r3(fl(x.m_fDrag, 0)); }
    else if (c === 'C_OP_FadeInSimple') Op.fadeIn = r3(x.m_flFadeInTime ?? 0.25);
    else if (c === 'C_OP_FadeOutSimple') Op.fadeOut = r3(x.m_flFadeOutTime ?? 0.25);
    else if (c === 'C_OP_FadeIn') Op.fadeIn = r3(((x.m_flFadeInTimeMin ?? 0.25) + (x.m_flFadeInTimeMax ?? 0.25)) / 2);
    else if (c === 'C_OP_FadeOut') Op.fadeOut = r3(((x.m_flFadeOutTimeMin ?? 0.25) + (x.m_flFadeOutTimeMax ?? 0.25)) / 2);
    else if (c === 'C_OP_InterpolateRadius') Op.radius = { from: r3(x.m_flStartScale ?? 1), to: r3(x.m_flEndScale ?? 1), t0: r3(x.m_flStartTime ?? 0), t1: r3(x.m_flEndTime ?? 1), bias: r3(x.m_flBias ?? 0.5) };
    else if (c === 'C_OP_ColorInterpolate') Op.colorFade = { to: x.m_ColorFade || [255, 255, 255], t0: r3(x.m_flFadeStartTime ?? 0), t1: r3(x.m_flFadeEndTime ?? 1) };
    else if (c === 'C_OP_ColorInterpolateRandom') Op.colorFade = { to: x.m_ColorFadeMin || [255, 255, 255], to2: x.m_ColorFadeMax, t0: r3(x.m_flFadeStartTime ?? 0), t1: r3(x.m_flFadeEndTime ?? 1) };
    else if (c === 'C_OP_SpinUpdate' || c === 'C_OP_Spin') Op.spin = true;
    else if (c === 'C_OP_PositionLock') Op.lock = true;
    else if (c === 'C_OP_SetControlPointsToParticle') Op.setsCP = x.m_nFirstControlPoint ?? 0;
    for (const c2 of colorsIn(x, [], 'op.' + c.replace(/^C_OP_/, '') + '.')) S.colors.push(c2);
  }
  for (const x of o.m_ForceGenerators || []) if (!x.m_bDisableOperator) S.classes.force.push(x._class.replace(/^C_OP_/, ''));
  for (const x of o.m_Constraints || []) if (!x.m_bDisableOperator) S.classes.constraint.push(x._class.replace(/^C_OP_/, ''));
  if (S.ops.colorFade) S.colors.push({ key: 'op.ColorInterpolate.to', hex: hexOf(S.ops.colorFade.to), rgb: S.ops.colorFade.to.slice(0, 3), a: 255 });
  if (I.color) I.color.forEach((cc, k) => S.colors.push({ key: 'init.color.' + (k ? 'max' : 'min'), hex: hexOf(cc), rgb: cc.slice(0, 3), a: cc[3] ?? 255 }));
  const seen = new Set(); S.colors = S.colors.filter((c2) => { const k = c2.key + c2.hex; if (seen.has(k)) return false; seen.add(k); return true; });
  S.textures = [...new Set(S.textures)];
  return S;
}

/** Flattened tree of an ability's roots: [{ ...summary, depth, delay (absolute start, s), parent }] in draw order (parent before children). */
export function flatten(roots, sys) {
  const out = [], seen = new Set();
  const walk = (p, depth, delay, parent, disabled) => {
    if (seen.has(p + '@' + parent)) return; seen.add(p + '@' + parent);
    const s = summarize(p, sys.get(p));
    out.push({ ...s, depth, delay: r3(delay), parent, disabled: !!disabled });
    for (const c of s.children || []) walk(c.path, depth + 1, delay + (c.delay || 0), p, disabled || c.disabled || c.endCap);
  };
  for (const r of roots) walk(r, 0, 0, null, false);
  return out;
}
/** Roots = files of the set that no other file of the set lists in m_Children. */
export function rootsOf(files, sys) {
  const kids = new Set();
  for (const f of files) { const o = sys.get(f); if (o && !o.$error) for (const c of childrenOf(o)) kids.add(c.path); }
  return files.filter((f) => !kids.has(f));
}
export { CACHE };
