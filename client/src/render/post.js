// Low-res HDR pipeline: scene -> HalfFloat render target (nearest, with a depth texture) ->
//   half / quarter-res scene blur (tilt-shift DOF) -> threshold + progressive bloom -> water SSR (low-res depth ray-march)
//   -> final pass (DOF mix, SSR mix, light scatter halo, grade, atmospheric perspective, vignette, Bayer dither, nearest upscale).
// WATER MASK CONTRACT: scene RT alpha = 1 for everything except water top tiles (terrain.js), which write 1 - fogBrightness,
// so 0 = fully visible water, rising towards 1 as fog of war darkens it. Additive particles write alpha 1 (no reflection under them).
import * as THREE from 'three';

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

const PRE = /* glsl */ `
precision highp float;
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold, uKnee;
varying vec2 vUv;
void main(){
  vec3 c = vec3(0.);
  for (int i = 0; i < 4; i++){
    vec2 o = vec2(float(i & 1) - .5, float(i >> 1) - .5) * uTexel;
    vec3 s = texture2D(tSrc, vUv + o).rgb;
    float br = max(s.r, max(s.g, s.b));
    float soft = clamp(br - uThreshold + uKnee, 0., 2. * uKnee);
    soft = soft * soft / (4. * uKnee + 1e-4);
    float k = max(soft, br - uThreshold) / max(br, 1e-4);
    c += s * max(k, 0.);
  }
  gl_FragColor = vec4(c * .25, 1.);
}`;

const DOWN = /* glsl */ `
precision highp float;
uniform sampler2D tSrc; uniform vec2 uTexel;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1., -1.)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1., -1.)).rgb
         + texture2D(tSrc, vUv + uTexel * vec2(-1., 1.)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1., 1.)).rgb;
  c = c * .125 + texture2D(tSrc, vUv).rgb * .5;
  gl_FragColor = vec4(c, 1.);
}`;

// plain 2x2 box of the nearest-filtered scene (taps land on the four texel centres) -> half-res DOF source
const BOX = /* glsl */ `
precision highp float;
uniform sampler2D tSrc; uniform vec2 uTexel;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-.5, -.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(.5, -.5)).rgb
         + texture2D(tSrc, vUv + uTexel * vec2(-.5, .5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(.5, .5)).rgb;
  gl_FragColor = vec4(c * .25, 1.);
}`;

const UP = /* glsl */ `
precision highp float;
uniform sampler2D tSrc; uniform sampler2D tPrev; uniform vec2 uTexel; uniform float uMix;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1., 0.)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1., 0.)).rgb
         + texture2D(tSrc, vUv + uTexel * vec2(0., -1.)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0., 1.)).rgb;
  c = c * .125 + texture2D(tSrc, vUv).rgb * .5;
  gl_FragColor = vec4(c * uMix + texture2D(tPrev, vUv).rgb, 1.);
}`;

// Water SSR at scene-RT resolution. Water pixels only (scene alpha < 1). View position from the depth texture, ripple-perturbed
// normal (quantised to the 6-unit light grid so ripples stay pixel-art), view-space ray march (+ binary refine) against depth.
// Misses fall back to the haze/sky colour. Roughness = mix to the blurred scene levels with ray length. Point lights are
// reflected analytically (closest approach of the rippled reflection ray to each light) so they smear into glints / bokeh.
const SSR = /* glsl */ `
precision highp float;
uniform sampler2D tScene, tDepth, tDofA, tDofB, tBloom;
uniform mat4 uProj, uInvProj, uCamWorld, uView;
uniform vec2 uPAB;
uniform float uTime, uNight, uDbg;
uniform vec3 uHaze;
uniform vec4 uLP[32];
uniform vec4 uLC[32];
uniform int uLN;
varying vec2 vUv;
float bayer4(vec2 p){
  vec2 b = mod(floor(p), 4.);
  vec4 r = b.y < .5 ? vec4(0.,8.,2.,10.) : b.y < 1.5 ? vec4(12.,4.,14.,6.) : b.y < 2.5 ? vec4(3.,11.,1.,9.) : vec4(15.,7.,13.,5.);
  float v = b.x < .5 ? r.x : b.x < 1.5 ? r.y : b.x < 2.5 ? r.z : r.w;
  return (v + .5) / 16.;
}
float dist01(float d){ return uPAB.y / (d * 2. - 1. + uPAB.x); }          // positive view distance from a depth sample
vec3 viewPos(vec2 uv, float d){ vec4 p = uInvProj * vec4(uv * 2. - 1., d * 2. - 1., 1.); return p.xyz / p.w; }
void main(){
  float wm = 1. - clamp(texture2D(tScene, vUv).a, 0., 1.);
  if (wm < .02) { gl_FragColor = vec4(0.); return; }
  float d0 = texture2D(tDepth, vUv).r;
  vec3 P = viewPos(vUv, d0);
  vec3 Pw = (uCamWorld * vec4(P, 1.)).xyz;
  // animated ripple slope on the light grid
  vec2 q = floor(Pw.xz / 6.) * .55;
  float t = uTime;
  vec2 g = vec2(sin(q.x * 1.3 + t * 1.4 + sin(q.y * .8 - t * .9) * 1.7), sin(q.y * 1.1 - t * 1.1 + sin(q.x * .7 + t * .6) * 1.7));
  g += .5 * vec2(sin(q.y * 2.3 + t * 2.1), sin(q.x * 2.1 - t * 1.7));
  vec3 Nw = normalize(vec3(g.x * .075, 1., g.y * .075));
  vec3 Nv = normalize(mat3(uView) * Nw);
  vec3 V = normalize(P);
  vec3 R = reflect(V, Nv);
  { vec3 rw = mat3(uCamWorld) * R; rw.y *= .5; R = normalize(mat3(uView) * normalize(rw)); }   // art cheat: flatter reflection ray so bank objects reflect further out
  float jit = bayer4(gl_FragCoord.xy);
  const int STEPS = 22;
  const float MAXD = 1100.;
  float stepL = MAXD / float(STEPS);
  float lo = 0., hi = 0.; bool found = false; vec2 huv = vec2(0.);
  for (int i = 0; i < STEPS; i++){
    float tc = 10. + (float(i) + jit) * stepL;
    vec3 S = P + R * tc;
    vec4 cl = uProj * vec4(S, 1.);
    if (cl.w <= 0.) break;
    vec2 uv = cl.xy / cl.w * .5 + .5;
    if (uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1.) break;
    float sd = dist01(texture2D(tDepth, uv).r);
    float diff = -S.z - sd;
    if (diff > 1. && diff < 45. + tc * .08) { found = true; hi = tc; huv = uv; break; }
    lo = tc;
  }
  vec3 refl = uHaze * (.55 + .5 * clamp(R.y, 0., 1.));
  float conf = 0.;
  float tHit = 600.;
  if (found){
    for (int k = 0; k < 5; k++){
      float m = (lo + hi) * .5;
      vec3 S = P + R * m;
      vec4 cl = uProj * vec4(S, 1.);
      vec2 uv = cl.xy / cl.w * .5 + .5;
      float diff = -S.z - dist01(texture2D(tDepth, uv).r);
      if (diff > 0.) { hi = m; huv = uv; } else lo = m;
    }
    tHit = hi;
    float rough = clamp(tHit / 800., 0., 1.);
    vec3 sh = texture2D(tScene, huv).rgb;
    vec3 sa = texture2D(tDofA, huv).rgb;
    vec3 sb = texture2D(tDofB, huv).rgb;
    vec3 hc = mix(mix(sh, sa, smoothstep(.0, .35, rough)), sb, smoothstep(.3, .9, rough));
    hc += texture2D(tBloom, huv).rgb * (.25 + .6 * rough);
    float edge = smoothstep(0., .1, min(min(huv.x, 1. - huv.x), min(huv.y, 1. - huv.y)));
    conf = edge * (1. - tHit / (MAXD * 1.05));
    refl = mix(refl, hc, conf);
  }
  // analytic light reflections (glints / bokeh)
  vec3 Rw = mat3(uCamWorld) * R;
  vec3 glint = vec3(0.);
  for (int i = 0; i < 12; i++){
    if (i >= uLN) break;
    vec3 dv = uLP[i].xyz - Pw;
    float dist = length(dv);
    float at = clamp(1. - dist / (uLP[i].w * 1.7), 0., 1.);
    if (at <= 0.) continue;
    float tt = dot(dv, Rw);
    if (tt <= 0.) continue;
    float perp = length(dv - Rw * tt);
    float sg = 22. + tt * .09;
    float gl = exp(-(perp * perp) / (sg * sg));
    glint += uLC[i].rgb * (gl * at * at);
  }
  refl += glint * 1.6;                                           // rippled glint streaks (shimmer)
  // bokeh discs: every strong light is mirrored in this water plane (y = Pw.y, flat per body) and splatted as a soft round / faintly
  // hexagonal disc at its mirrored SCREEN position, so it stays round whatever the ripples do. Ripples only nudge the disc per light-grid
  // cell (pixel-art wobble) and modulate its brightness; the edge is Bayer-dithered. Only runs on water pixels (early-out above).
  vec3 bok = vec3(0.);
  vec2 asp = vec2(uProj[0][0], uProj[1][1]);
  for (int i = 0; i < 12; i++){
    if (i >= uLN) break;
    vec3 Lw = uLP[i].xyz;
    if (Lw.y < Pw.y + 10.) continue;
    vec4 cl = uProj * (uView * vec4(Lw.x, 2. * Pw.y - Lw.y, Lw.z, 1.));
    if (cl.w <= 1.) continue;
    vec2 uvm = cl.xy / cl.w * .5 + .5;
    vec2 rs = (30. + uLP[i].w * .11) * asp / cl.w * .5;
    vec2 d = (vUv - uvm) / rs;
    if (dot(d, d) > 2.) continue;
    d += g * vec2(.035, .05);
    float hx = max(abs(d.y), abs(d.x) * .866 + abs(d.y) * .5);
    float r = mix(length(d), hx, .4);
    float disc = (1. - smoothstep(.66, 1., r)) * (.62 + .38 * smoothstep(.4, .9, r));
    disc = floor(disc * 5. + jit) / 5.;
    bok += uLC[i].rgb * disc * (.78 + .22 * clamp(g.x, -1., 1.));
  }
  refl += bok * 2.1;
  if (uDbg > .5) refl = vec3(conf * 2., found ? 1. : 0., 0.);
  gl_FragColor = vec4(refl, wm);
}`;

// fight exposure: mean over-threshold energy of the coarsest bloom mip (4x4 taps), smoothed over time in a 1x1 ping-pong target.
// One spell barely moves the mean; a stacked teamfight fills the screen with it -> FINAL lowers exposure and bloom (no readback).
const ADAPT = /* glsl */ `
precision highp float;
uniform sampler2D tSrc; uniform sampler2D tPrev; uniform float uUp, uDown;
varying vec2 vUv;
void main(){
  vec3 s = vec3(0.);
  for (int i = 0; i < 16; i++) s += texture2D(tSrc, vec2(float(i - (i / 4) * 4) + .5, float(i / 4) + .5) * .25).rgb;
  float e = dot(s / 16., vec3(.3, .59, .11)), p = texture2D(tPrev, vec2(.5)).r;
  gl_FragColor = vec4(mix(p, e, e > p ? uUp : uDown), 0., 0., 1.);
}`;

const FINAL = /* glsl */ `
precision highp float;
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tDofA; uniform sampler2D tDofB; uniform sampler2D tSsr; uniform sampler2D tAdapt;
uniform vec3 uExpo;   // x: exposure gain per unit of adapted energy, y: bloom gain, z: on
uniform float uBloom, uVig, uNight, uTime, uDof, uDofY, uSsr, uRays, uSky, uAtmos, uFocus, uPxAng;
uniform vec2 uRT;
uniform vec3 uSun;   // toward the sun / moon (world)
float vh(float n) { return fract(sin(n) * 43758.5453); }
float vnoise(vec3 p) {   // value noise for the volumetric mist
  vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  float n = i.x + i.y * 57. + i.z * 113.;
  return mix(mix(mix(vh(n), vh(n + 1.), f.x), mix(vh(n + 57.), vh(n + 58.), f.x), f.y),
             mix(mix(vh(n + 113.), vh(n + 114.), f.x), mix(vh(n + 170.), vh(n + 171.), f.x), f.y), f.z);
}
uniform sampler2D tDepth; uniform mat4 uInvProj, uCamWorld; uniform vec2 uPAB; uniform vec3 uCamPos;
uniform vec2 uOut, uBt;
uniform vec4 uGL[8];
uniform vec3 uGC[8];
uniform int uGN;
varying vec2 vUv;
float bayer4(vec2 p){
  vec2 b = mod(floor(p), 4.);
  vec4 r = b.y < .5 ? vec4(0.,8.,2.,10.) : b.y < 1.5 ? vec4(12.,4.,14.,6.) : b.y < 2.5 ? vec4(3.,11.,1.,9.) : vec4(15.,7.,13.,5.);
  float v = b.x < .5 ? r.x : b.x < 1.5 ? r.y : b.x < 2.5 ? r.z : r.w;
  return (v + .5) / 16.;
}
// hue-preserving roll-off: compress the brightest channel above knee k towards 1 and scale the others with it, so stacked
// additive colour (fire + frost + arcane) stays coloured instead of clipping channel by channel to white (Noita look)
vec3 tmHue(vec3 c, float k){
  float m = max(c.r, max(c.g, c.b));
  if (m <= k) return c;
  float t = k + (1. - k) * (1. - exp(-(m - k) / (1. - k)));
  return mix(c * (t / m), vec3(t), smoothstep(3., 10., m) * .25);   // only extreme cores whiten a little
}
float vh2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// night stars: lat-long cells (square in angle, one candidate star per cell, denser toward the zenith), 1-2 art pixels, stable in world direction; px = art pixel angle
vec3 starField(vec3 wd, float px, float t) {
  float el = asin(clamp(wd.y, 0., 1.));
  vec2 g = vec2(atan(wd.x, -wd.z) * cos(el), el) / (px * 8.);
  vec2 id = floor(g), f = fract(g);
  float h0 = vh2(id), h1 = vh2(id + 7.1);
  if (h0 > .07 + .13 * smoothstep(0., .6, el)) return vec3(0.);
  float d = length((f - (.2 + .6 * vec2(vh2(id + 17.3), vh2(id + 41.7)))) * 8.);
  float tw = (.55 + .45 * sin(t * (1.2 + 3. * h1) + h0 * 60.)) * (1. + 1.6 * pow(max(sin(t * .7 + h1 * 90.), 0.), 24.));   // random twinkle + the odd sparkle
  float s = (d < .8 ? 1. : 0.) + (h1 > .85 ? (1. - smoothstep(.9, 1.7, d)) * .3 : 0.);   // crisp 1-2 px core, the brighter ones get a faint halo
  return mix(vec3(.72, .84, 1.), vec3(1., .92, .78), vh2(id + 3.3)) * s * tw * (.5 + .7 * h1);
}
// drifting cloud slab (world y Y0..Y1): sparse coverage mask x 2-3 octave shape, lit by the sun with a short light-march. Returns (rgb added, transmittance).
float cloudDens(vec3 p, vec3 drift, bool hi) {
  float h = clamp((p.y - 1500.) / 800., 0., 1.);
  vec3 q = p + drift;
  float cov = vnoise(vec3(q.x * .00013, 5., q.z * .00013));
  float n = vnoise(q * .0011) * .62 + vnoise(q * .0029 + 9.) * .28;
  if (hi) n += vnoise(q * .0075 + 19.) * .1; else n += .05;
  return smoothstep(.5, .8, n * (.2 + .95 * smoothstep(.48, .78, cov))) * smoothstep(0., .22, h) * smoothstep(1., .45, h);
}
vec4 cloudLayer(vec3 ro, vec3 rd, vec3 sd, vec3 sunCol, vec3 amb, float jit, float t, bool hi) {
  if (rd.y < .03) return vec4(0., 0., 0., 1.);
  float t0 = (1500. - ro.y) / rd.y, t1 = min((2300. - ro.y) / rd.y, t0 + 14000.);
  int ns = hi ? 32 : 16, nl = hi ? 4 : 2;
  float ds = (t1 - t0) / float(ns), T = 1.;
  vec3 acc = vec3(0.), drift = vec3(t * 34., 0., t * 11.);
  float ph = 1. + 2.2 * pow(max(dot(rd, sd), 0.), 6.);   // silver lining toward the sun
  for (int i = 0; i < 32; i++) {
    if (i >= ns || T < .03) break;
    vec3 p = ro + rd * (t0 + (float(i) + jit) * ds);
    float d = cloudDens(p, drift, hi);
    if (d < .01) continue;
    float lt = 0.;
    for (int k = 1; k <= 4; k++) { if (k > nl) break; lt += cloudDens(p + sd * (float(k) * 260.), drift, hi); }
    float a = 1. - exp(-d * ds * .0016);
    float lit = exp(-lt * 1.5);
    acc += T * a * (amb + sunCol * lit * ph * .75);
    T *= 1. - a;
  }
  return vec4(acc, T);
}
void main(){
  // v2 look (docs/ART-DIRECTION.md): tilt-shift DOF, bloom normalised + screen-composited, low-key exposure, teal shadows /
  // warm highlights, water SSR, light scatter in the haze, far (top) of the frame dissolves into tinted haze.
  vec4 sc = texture2D(tScene, vUv);
  vec3 c = sc.rgb;
  // tilt-shift: crisp band in the middle, soft bottom ~15% and top ~25%
  float dy = vUv.y - uDofY;   // uDofY: focus band follows the view inset (touch HUD) so the sharp band stays on the framed target
  float d0 = 1., dist = 1e5, zv = 1e5; vec3 vd = vec3(0.);
  vec3 hor = mix(vec3(.62, .68, .68), vec3(.07, .09, .17), uNight), zen = mix(vec3(.25, .42, .60), vec3(.02, .03, .09), uNight);
  if (uSky > .002) {   // showcase: view distance from depth (depth = 1 means nothing was drawn)
    d0 = texture2D(tDepth, vUv).r;
    vec4 q = uInvProj * vec4(vUv * 2. - 1., 1., 1.);
    vd = q.xyz / q.w; vd /= -vd.z;
    if (d0 < .99999) { zv = uPAB.y / (d0 * 2. - 1. + uPAB.x); dist = zv * length(vd); }
  }
  // tilt-shift (normal play, fades out as the showcase comes in): bands from the cheap half / quarter-res blurs
  float dof = max(smoothstep(.17, 0., dy), smoothstep(.74, 1., dy)) * (1. - uSky) * uDof;
  if (dof > .003) {
    vec3 sA = texture2D(tDofA, vUv).rgb;
    vec3 sB = (texture2D(tDofB, vUv + uBt * vec2(-1.2, -.4)).rgb + texture2D(tDofB, vUv + uBt * vec2(1.2, .4)).rgb
             + texture2D(tDofB, vUv + uBt * vec2(.4, -1.2)).rgb + texture2D(tDofB, vUv + uBt * vec2(-.4, 1.2)).rgb) * .25;
    vec3 soft = mix(sA, sB, smoothstep(.25, .95, dof));
    c = mix(c, soft, clamp(dof * 1.25, 0., 1.));
  }
  // showcase (medium/high): real depth of field. Focus plane = camera-to-target distance (the hero); beyond ~1.3x it blurs progressively (bokeh disc gather, bright
  // spots bloom into discs, taps that are sharper and nearer than the centre are rejected so the hero keeps a clean edge), the near foreground is a little soft.
  if (uSky > .002 && uDof > .01) {
    float cf = smoothstep(uFocus * 1.3, uFocus * 3.4, zv) + .4 * smoothstep(uFocus * .8, uFocus * .3, zv);
    float coc = clamp(cf, 0., 1.) * uSky;
    if (coc > .01 && d0 < .99999) {
      bool hi = uAtmos > 1.5;
      int nT = hi ? 16 : 8;
      float R = (hi ? 15. : 10.) * coc, rot = vh2(floor(vUv * uRT)) * 6.2832;
      vec3 acc = c; float ws = 1.;
      for (int i = 0; i < 16; i++) {
        if (i >= nT) break;
        float a = float(i) * 2.39996 + rot, rr = sqrt((float(i) + .5) / float(nT)) * R;
        vec2 uv2 = vUv + vec2(cos(a), sin(a)) * rr / uRT;
        float dd = texture2D(tDepth, uv2).r;
        bool sk = dd >= .99999;
        float zs = sk ? 1e5 : uPAB.y / (dd * 2. - 1. + uPAB.x);
        float cs = clamp(smoothstep(uFocus * 1.3, uFocus * 3.4, zs) + .4 * smoothstep(uFocus * .8, uFocus * .3, zs), 0., 1.);
        float w = zs < zv ? clamp(cs * R / max(rr, .5), 0., 1.) : 1.;
        vec3 sm = sk ? hor : texture2D(tDofA, uv2).rgb;
        w *= 1. + max(dot(sm, vec3(.3, .59, .11)) - .9, 0.) * 3.;
        acc += sm * w; ws += w;
      }
      c = acc / ws;
    }
  }
  // water: SSR (rgb = reflected radiance, a = water mask)
  vec4 sr = texture2D(tSsr, vUv);
  float wm = sr.a;
  if (wm > .001) {
    c *= mix(1., .62, wm);                                      // darker, glossier water body
    c += sr.rgb * wm * uSsr * (.55 + .25 * uNight) * vec3(.85, 1., 1.05);
  }
  // stacked spells: exposure and bloom drop with the adapted over-threshold energy (floors keep the fight readable, not dark)
  float ae = uExpo.z > 0. ? texture2D(tAdapt, vec2(.5)).r : 0.;
  float ex = max(.55, 1. / (1. + uExpo.x * ae)), bx = max(.3, 1. / (1. + uExpo.y * ae));
  c *= .8 * ex;
  float l = dot(c, vec3(.3, .59, .11));
  // atmospheric perspective: saturation + contrast fall off toward the top (far side) of the frame
  float far = smoothstep(.3, 1., vUv.y);
  c = mix(vec3(l), c, 1. - .38 * far);
  c = mix(c * vec3(.72, .95, 1.), c, smoothstep(.15, .7, l));
  c += vec3(.05, .025, -.02) * smoothstep(.45, 1., l);
  vec3 b = texture2D(tBloom, vUv).rgb * (.14 * bx);   // subtle bloom (art refs: The Last Night, Noita)
  vec3 haze = mix(vec3(.09, .19, .19), vec3(.03, .08, .1), uNight);
  float hz = smoothstep(.4, 1., vUv.y) * .55 * (1. - uSky);
  c = mix(c, haze + b * .6, hz);
  if (uSky > .002) {   // showcase: sky behind the world + rolling distance fog into the horizon colour (depth = 1 means nothing was drawn)
    vec3 wd = normalize(mat3(uCamWorld) * vd);
    float el = clamp(wd.y, 0., 1.);
    vec3 sky = mix(hor, zen, pow(el, .55));
    sky += vec3(.07, .04, -.02) * (1. - uNight) * exp(-el * 9.);   // warm glow hugging the horizon
    vec3 body = mix(vec3(1., .86, .6), vec3(.74, .82, 1.), uNight);   // sun / moon colour
    if (d0 >= .99999) {   // sky pixels: sun / moon disc + glow, night stars, day clouds. Direction taken at the art-pixel centre so the disc and stars stay crisp pixel blocks
      vec2 uq = (floor(vUv * uRT) + .5) / uRT;
      vec4 q4 = uInvProj * vec4(uq * 2. - 1., 1., 1.); vec3 vq = q4.xyz / q4.w; vq /= -vq.z;
      vec3 wq = normalize(mat3(uCamWorld) * vq);
      float ang = acos(clamp(dot(wq, uSun), -1., 1.)), rad = mix(.028, .02, uNight);
      float glow = exp(-ang / (rad * 3.5)) * .42 + exp(-ang / (rad * 12.)) * .16;
      sky += body * glow * mix(1.3, .55, uNight);
      sky = mix(sky, body * mix(1.6, .95, uNight), 1. - step(rad, ang));
      if (uNight > .02) sky += starField(wq, uPxAng, uTime) * smoothstep(.35, 1., uNight) * smoothstep(0., .08, wq.y) * (1. - clamp(glow * 3., 0., 1.));
      if (uAtmos > .5 && uNight < .98 && wq.y > .03) {
        float cj = uAtmos > 1.5 ? fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) : bayer4(gl_FragCoord.xy);
        vec4 cl = cloudLayer(uCamPos, wq, uSun, body, mix(vec3(.5, .56, .68), vec3(.04), uNight), cj, uTime, uAtmos > 1.5);
        float fade = smoothstep(.03, .14, wq.y) * (1. - uNight);
        sky = mix(sky, sky * cl.a + cl.rgb, fade);
      }
    }
    vec3 wp = uCamPos + wd * min(dist, 6000.);
    float roll = sin(wp.x * .0023 + uTime * .06) * sin(wp.z * .0031 - uTime * .045) + .6 * sin((wp.x - wp.z) * .0052 + uTime * .035);
    float mm = min(uAtmos, 1.);
    float fg = smoothstep(mix(1500., 1000., mm), mix(4200., 3200., mm), dist + roll * mix(650., 420., mm)) * (.82 + .18 * roll);   // medium/high: denser rolling mist
    vec3 base = d0 >= .99999 ? sky + max(sc.rgb - vec3(.02, .02, .035), 0.) : mix(c, hor * (1. + .06 * roll), clamp(fg, 0., 1.) * .97);
    if (uAtmos > .5) {   // medium/high: volumetric mist, a short raymarch through a drifting 3D-noise layer hugging the ground (clear around the hero)
      bool hi = uAtmos > 1.5;   // high: 22 steps, 3 octaves, hash-jittered, lit by the key light; medium: 10 steps, 1 octave, Bayer-jittered
      int ns = hi ? 22 : 10;
      float L = min(dist, 4200.), ds = L / float(ns), gY = uCamPos.y - 260., T = 1.;
      float jit = hi ? fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) : bayer4(gl_FragCoord.xy);
      vec3 acc = vec3(0.), drift = vec3(uTime * 22., 0., uTime * 13.);
      vec3 scat = hi ? body * pow(max(dot(wd, normalize(vec3(uSun.x, 0., uSun.z))), 0.), 4.) * mix(.8, .25, uNight) : vec3(0.);   // brighter mist toward the key light
      for (int i = 0; i < 22; i++) {
        if (i >= ns || T < .02) break;
        float t = (float(i) + jit) * ds;
        vec3 p = uCamPos + wd * t;
        float hy = p.y - gY;
        if (hy > 700.) continue;
        vec3 pp = p + drift;
        float n = vnoise(pp * .0045);
        if (hi) n = n * .55 + vnoise((p - drift * 1.7) * .012) * .3 + vnoise((pp + 31.) * .03) * .15; else n = n * .8 + .1;
        float dens = exp(-max(hy, 0.) / 120.) * smoothstep(.38, .8, n) * smoothstep(220., 560., t);
        float a = 1. - exp(-dens * ds * .0055);
        acc += T * a * (hor * (.8 + .45 * n) + scat * (.4 + n));
        T *= 1. - a;
      }
      base = base * T + acc;
    }
    c = mix(c, base, uSky);
  }
  // light scatter in the haze: soft halo around the strongest on-screen lights, screen-composited (the directional shafts are cone meshes, beams.js)
  c = tmHue(c, .7);   // before the screen composites below (they clamp to 1 and would clip each channel)
  if (uRays > .001 && uGN > 0) {
    float asp = uOut.x / uOut.y;
    vec3 sct = vec3(0.);
    for (int i = 0; i < 8; i++){
      if (i >= uGN) break;
      vec4 gl = uGL[i];
      vec2 d = vec2((vUv.x - gl.x) * asp, (vUv.y - gl.y) * 1.25);
      float r = length(d) / gl.z;
      if (r > 2.2) continue;
      float halo = 1. / (1. + r * r * 5.) * (1. - smoothstep(1.2, 2.2, r));
      sct += uGC[i] * halo;
    }
    sct *= uRays * mix(.35, 1.1, uNight) * mix(.75, 1.1, vUv.y) * ex;
    c = 1. - (1. - min(c, 1.)) * (1. - min(sct, vec3(.95)));
    c += max(sct - .95, 0.) * .2;
  }
  c += b * uBloom * (1. - min(c, 1.));
  vec3 bb = min(b, vec3(1.)); c += bb * bb * .1;   // bounded: a stacked core must not add unbounded white
  // soft knee above 0.85 so HDR highlights roll off instead of clipping
  c = tmHue(c, .85);
  vec2 q = vUv - .5;
  float v = 1. - uVig * smoothstep(.25, .95, dot(q, q) * 2.2);
  c *= v;
  c += (bayer4(gl_FragCoord.xy) - .5) / 255.;
  gl_FragColor = vec4(c, 1.);
}`;

const SUN_ELEV = 0.13;   // showcase camera sees only ~+5..+14 deg of sky: the sun / moon keep the key light azimuth but sit this low (sin of the elevation)

export function createPost(renderer, shared) {
  const quadGeo = new THREE.BufferGeometry();
  quadGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  quadGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const quad = new THREE.Mesh(quadGeo); quad.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const mPre = mk(PRE, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.12 }, uKnee: { value: 0.25 } });
  const mDown = mk(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  const mBox = mk(BOX, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  const mAdapt = mk(ADAPT, { tSrc: { value: null }, tPrev: { value: null }, uUp: { value: 1 }, uDown: { value: 1 } });
  const mUp = mk(UP, { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 1 } });
  const glArr = Array.from({ length: 8 }, () => new THREE.Vector4()), gcArr = Array.from({ length: 8 }, () => new THREE.Vector3());
  const sharedLP = shared ? shared.uLP : { value: new Float32Array(128) }, sharedLC = shared ? shared.uLC : { value: new Float32Array(128) }, sharedLN = shared ? shared.uLN : { value: 0 };
  const mSsr = new THREE.ShaderMaterial({
    vertexShader: FS_VERT, fragmentShader: SSR, depthTest: false, depthWrite: false,
    uniforms: {
      tScene: { value: null }, tDepth: { value: null }, tDofA: { value: null }, tDofB: { value: null }, tBloom: { value: null },
      uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uView: { value: new THREE.Matrix4() },
      uPAB: { value: new THREE.Vector2() }, uTime: { value: 0 }, uNight: { value: 0 }, uDbg: { value: 0 }, uHaze: { value: new THREE.Vector3(.18, .32, .34) },
      uLP: sharedLP, uLC: sharedLC, uLN: sharedLN,
    },
  });
  const mFinal = mk(FINAL, {
    tScene: { value: null }, tBloom: { value: null }, tDofA: { value: null }, tDofB: { value: null }, tSsr: { value: null },
    uBloom: { value: 0.9 }, uVig: { value: 0.35 }, uNight: { value: 0 }, uTime: { value: 0 }, uOut: { value: new THREE.Vector2() },
    uDof: { value: 1 }, uDofY: { value: 0 }, uSsr: { value: 1 }, uRays: { value: 1 }, uBt: { value: new THREE.Vector2() },
    uGL: { value: glArr }, uGC: { value: gcArr }, uGN: { value: 0 },
    tAdapt: { value: null }, uExpo: { value: new THREE.Vector3(0, 0, 0) },
    uSky: { value: 0 }, uAtmos: { value: 2 }, uFocus: { value: 800 }, uPxAng: { value: 0.002 }, uRT: { value: new THREE.Vector2() }, uSun: { value: new THREE.Vector3(-0.5, 0.13, 0.45) }, tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uPAB: { value: new THREE.Vector2() }, uCamPos: { value: new THREE.Vector3() },
  });

  const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, stencilBuffer: false, generateMipmaps: false, colorSpace: THREE.NoColorSpace };
  const lin = { ...rtOpts, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  const flat = { ...rtOpts, depthBuffer: false };
  // 1x1 adaptation ping-pong (HalfFloat, persists across resizes)
  const adapt = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, flat));
  let adaptI = 0, lastT = -1;
  let scene_rt = null, ssr_rt = null, dofA = null, dofB = null, downs = [], ups = [], w = 0, h = 0;
  const LEVELS = 5;
  const state = { expo: 1, expoK: 1.6, expoBloomK: 3.5, adaptUp: 10, adaptDown: 1.2, bloom: true, bloomStrength: 0.9, vignette: 0.35, threshold: 1.4, dof: true, dofStrength: 1, sky: 0, atmos: 2, focus: 800, ssr: true, ssrStrength: 1, rays: true, raysStrength: 1, bloomLevels: LEVELS };   // bloomLevels: mips used (5 = full; fewer = cheaper, tighter bloom)
  let ssrDirty = false;
  const noBloom = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); noBloom.needsUpdate = true;   // stands in for the bloom texture when bloom is off (adds nothing)

  function disposeRTs() {
    if (scene_rt) { scene_rt.dispose(); scene_rt.depthTexture && scene_rt.depthTexture.dispose(); }
    if (ssr_rt) ssr_rt.dispose(); if (dofA) dofA.dispose(); if (dofB) dofB.dispose();
    for (const t of downs) t.dispose(); for (const t of ups) t.dispose();
  }
  function setRT(nw, nh) {
    nw = Math.max(16, nw | 0); nh = Math.max(16, nh | 0);
    if (nw === w && nh === h && scene_rt) return false;
    w = nw; h = nh;
    disposeRTs();
    scene_rt = new THREE.WebGLRenderTarget(w, h, rtOpts);
    scene_rt.depthTexture = new THREE.DepthTexture(w, h);
    scene_rt.depthTexture.minFilter = scene_rt.depthTexture.magFilter = THREE.NearestFilter;
    ssr_rt = new THREE.WebGLRenderTarget(w, h, flat);
    dofA = new THREE.WebGLRenderTarget(Math.max(2, (w + 1) >> 1), Math.max(2, (h + 1) >> 1), lin);
    dofB = new THREE.WebGLRenderTarget(Math.max(2, (w + 3) >> 2), Math.max(2, (h + 3) >> 2), lin);
    downs = []; ups = []; ssrDirty = false;
    let bw = w, bh = h;
    for (let i = 0; i < LEVELS; i++) {
      bw = Math.max(2, (bw + 1) >> 1); bh = Math.max(2, (bh + 1) >> 1);
      downs.push(new THREE.WebGLRenderTarget(bw, bh, lin));
      ups.push(new THREE.WebGLRenderTarget(bw, bh, lin));
    }
    return true;
  }

  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(scene, cam); }

  // project the strongest on-screen lights for the scatter pass (uLP is already sorted strongest-first by lights.js)
  const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _r = new THREE.Vector3();
  function collectRays(camera, aspect) {
    if (!shared) return 0;
    const P = shared.uLP.value, C = shared.uLC.value, n = shared.uLN.value;
    _r.setFromMatrixColumn(camera.matrixWorld, 0);
    let k = 0;
    for (let i = 0; i < n && k < 8; i++) {
      const rad = P[i * 4 + 3];
      if (rad < 180) continue;
      const cr = C[i * 4], cg = C[i * 4 + 1], cb = C[i * 4 + 2];
      const m = Math.max(cr, cg, cb);
      if (m < 0.25) continue;
      _p.set(P[i * 4], P[i * 4 + 1], P[i * 4 + 2]).project(camera);
      if (_p.z > 1 || Math.abs(_p.x) > 1.5 || Math.abs(_p.y) > 1.5) continue;
      _q.set(P[i * 4], P[i * 4 + 1], P[i * 4 + 2]).addScaledVector(_r, rad).project(camera);
      const ru = Math.abs(_q.x - _p.x) * 0.5 * aspect;
      const g = Math.min(1, 0.6 / m) * Math.min(m, 1.6);     // limit scatter energy of very bright lights
      glArr[k].set(_p.x * 0.5 + 0.5, _p.y * 0.5 + 0.5, Math.max(0.03, ru * 0.55), (i * 2.399) % 6.283);
      gcArr[k].set(cr * g, cg * g, cb * g);
      k++;
    }
    return k;
  }

  function render(sceneObj, camera, time, night, outW, outH) {
    renderer.setRenderTarget(scene_rt);
    renderer.setClearColor(0x050509, 1); renderer.clear(true, true, false);
    renderer.render(sceneObj, camera);
    const doDof = state.dof && state.dofStrength > 0, doSsr = state.ssr && state.ssrStrength > 0;
    if (doDof || doSsr) {
      mBox.uniforms.tSrc.value = scene_rt.texture; mBox.uniforms.uTexel.value.set(1 / w, 1 / h);
      pass(mBox, dofA);
      mDown.uniforms.tSrc.value = dofA.texture; mDown.uniforms.uTexel.value.set(1 / dofA.width, 1 / dofA.height);
      pass(mDown, dofB);
    }
    let bloomTex = null;
    if (state.bloom) {
      mPre.uniforms.tSrc.value = scene_rt.texture; mPre.uniforms.uTexel.value.set(1 / w, 1 / h); mPre.uniforms.uThreshold.value = state.threshold;
      const nL = Math.min(LEVELS, Math.max(2, state.bloomLevels | 0 || LEVELS));
      pass(mPre, downs[0]);
      for (let i = 1; i < nL; i++) {
        mDown.uniforms.tSrc.value = downs[i - 1].texture; mDown.uniforms.uTexel.value.set(1 / downs[i - 1].width, 1 / downs[i - 1].height);
        pass(mDown, downs[i]);
      }
      // coarsest up level = its down level; then up[k] = blur(up[k+1]) + down[k]
      mUp.uniforms.uMix.value = 1;
      let prev = downs[nL - 1];
      for (let i = nL - 2; i >= 0; i--) {
        mUp.uniforms.tSrc.value = prev.texture; mUp.uniforms.tPrev.value = downs[i].texture;
        mUp.uniforms.uTexel.value.set(1 / prev.width, 1 / prev.height);
        pass(mUp, ups[i]); prev = ups[i];
      }
      bloomTex = ups[0].texture;
      if (state.expo) {   // darken fast (~0.1 s), recover slowly (~1 s)
        const dt = lastT < 0 ? 1 / 60 : Math.min(0.25, Math.max(0, time - lastT));
        const a = mAdapt.uniforms;
        a.tSrc.value = downs[nL - 1].texture; a.tPrev.value = adapt[adaptI].texture;
        a.uUp.value = 1 - Math.exp(-dt * state.adaptUp); a.uDown.value = 1 - Math.exp(-dt * state.adaptDown);
        adaptI ^= 1; pass(mAdapt, adapt[adaptI]);
      }
    }
    lastT = time;
    if (!doSsr && ssrDirty) {   // SSR switched off at runtime: wipe the water mask or FINAL keeps darkening a frozen water patch
      renderer.setRenderTarget(ssr_rt); renderer.setClearColor(0x000000, 0); renderer.clear(true, false, false); ssrDirty = false;
    }
    if (doSsr) {
      ssrDirty = true;
      const u = mSsr.uniforms, pm = camera.projectionMatrix;
      u.tScene.value = scene_rt.texture; u.tDepth.value = scene_rt.depthTexture; u.tDofA.value = dofA.texture; u.tDofB.value = dofB.texture;
      u.tBloom.value = bloomTex || noBloom;
      u.uProj.value.copy(pm); u.uInvProj.value.copy(camera.projectionMatrixInverse); u.uCamWorld.value.copy(camera.matrixWorld); u.uView.value.copy(camera.matrixWorldInverse);
      u.uPAB.value.set(pm.elements[10], pm.elements[14]);
      u.uTime.value = time; u.uNight.value = night; u.uDbg.value = state.ssrDebug ? 1 : 0;
      u.uHaze.value.set(0.17 + (0.04 - 0.17) * night, 0.31 + (0.09 - 0.31) * night, 0.33 + (0.15 - 0.33) * night);
      pass(mSsr, ssr_rt);
    }
    const f = mFinal.uniforms;
    f.tScene.value = scene_rt.texture; f.tBloom.value = bloomTex || noBloom; f.tDofA.value = dofA.texture; f.tDofB.value = dofB.texture; f.tSsr.value = ssr_rt.texture;
    f.uBloom.value = bloomTex ? state.bloomStrength : 0; f.uVig.value = state.vignette; f.uNight.value = night; f.uTime.value = time;
    f.uOut.value.set(outW, outH);
    f.uBt.value.set(1.5 / dofB.width, 1.5 / dofB.height);
    f.uDof.value = doDof ? state.dofStrength : 0; f.uDofY.value = state.dofY || 0; f.uSsr.value = doSsr ? state.ssrStrength : 0;
    f.uRays.value = state.rays ? state.raysStrength : 0;
    f.uSky.value = state.sky; f.uAtmos.value = state.atmos; f.uFocus.value = state.focus; f.uRT.value.set(w, h); f.uPxAng.value = camera.fov * Math.PI / 180 / h; f.tDepth.value = scene_rt.depthTexture;
    if (shared) { const k = shared.uKeyDir.value, e = SUN_ELEV, c = Math.sqrt(1 - e * e), hl = Math.hypot(k.x, k.z) || 1; f.uSun.value.set(k.x / hl * c, e, k.z / hl * c); }   // key-light azimuth, lowered into the visible sky band
    f.uInvProj.value.copy(camera.projectionMatrixInverse); f.uCamWorld.value.copy(camera.matrixWorld); f.uPAB.value.set(camera.projectionMatrix.elements[10], camera.projectionMatrix.elements[14]); f.uCamPos.value.copy(camera.position);
    f.tAdapt.value = adapt[adaptI].texture; f.uExpo.value.set(state.expoK, state.expoBloomK, bloomTex && state.expo ? 1 : 0);
    f.uGN.value = state.rays ? collectRays(camera, outW / outH) : 0;
    pass(mFinal, null);
  }

  return {
    state, setRT, render, adaptRT: () => adapt[adaptI], get width() { return w; }, get height() { return h; }, get rt() { return scene_rt; },
    dispose() { disposeRTs(); mPre.dispose(); mDown.dispose(); mBox.dispose(); mUp.dispose(); mAdapt.dispose(); for (const t of adapt) t.dispose(); mSsr.dispose(); mFinal.dispose(); quadGeo.dispose(); noBloom.dispose(); },
  };
}
