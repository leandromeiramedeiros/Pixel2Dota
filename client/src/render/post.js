// Low-res HDR pipeline: scene -> HalfFloat render target (nearest, with a depth texture) ->
//   half / quarter-res scene blur (tilt-shift DOF) -> threshold + progressive bloom -> water SSR (low-res depth ray-march)
//   -> final pass (DOF mix, SSR mix, light scatter / god rays, grade, atmospheric perspective, vignette, Bayer dither, nearest upscale).
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
  refl += glint * 3.;
  if (uDbg > .5) refl = vec3(conf * 2., found ? 1. : 0., 0.);
  gl_FragColor = vec4(refl, wm);
}`;

const FINAL = /* glsl */ `
precision highp float;
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tDofA; uniform sampler2D tDofB; uniform sampler2D tSsr;
uniform float uBloom, uVig, uNight, uTime, uDof, uSsr, uRays;
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
void main(){
  // v2 look (docs/ART-DIRECTION.md): tilt-shift DOF, bloom normalised + screen-composited, low-key exposure, teal shadows /
  // warm highlights, water SSR, light scatter in the haze, far (top) of the frame dissolves into tinted haze.
  vec4 sc = texture2D(tScene, vUv);
  vec3 c = sc.rgb;
  // tilt-shift: crisp band in the middle, soft bottom ~15% and top ~25%
  float dof = max(smoothstep(.17, 0., vUv.y), smoothstep(.74, 1., vUv.y)) * uDof;
  if (dof > .003) {
    vec3 sA = texture2D(tDofA, vUv).rgb;
    vec3 sB = (texture2D(tDofB, vUv + uBt * vec2(-1.2, -.4)).rgb + texture2D(tDofB, vUv + uBt * vec2(1.2, .4)).rgb
             + texture2D(tDofB, vUv + uBt * vec2(.4, -1.2)).rgb + texture2D(tDofB, vUv + uBt * vec2(-.4, 1.2)).rgb) * .25;
    vec3 soft = mix(sA, sB, smoothstep(.25, .95, dof));
    c = mix(c, soft, clamp(dof * 1.25, 0., 1.));
  }
  // water: SSR (rgb = reflected radiance, a = water mask)
  vec4 sr = texture2D(tSsr, vUv);
  float wm = sr.a;
  if (wm > .001) {
    c *= mix(1., .62, wm);                                      // darker, glossier water body
    c += sr.rgb * wm * uSsr * (.55 + .25 * uNight) * vec3(.85, 1., 1.05);
  }
  c *= .8;
  float l = dot(c, vec3(.3, .59, .11));
  // atmospheric perspective: saturation + contrast fall off toward the top (far side) of the frame
  float far = smoothstep(.3, 1., vUv.y);
  c = mix(vec3(l), c, 1. - .38 * far);
  c = mix(c * vec3(.72, .95, 1.), c, smoothstep(.15, .7, l));
  c += vec3(.05, .025, -.02) * smoothstep(.45, 1., l);
  vec3 b = texture2D(tBloom, vUv).rgb * .2;
  vec3 haze = mix(vec3(.09, .19, .19), vec3(.03, .08, .1), uNight);
  float hz = smoothstep(.4, 1., vUv.y) * .55;
  c = mix(c, haze + b * .6, hz);
  // light scatter in the haze: soft halo + faint angular shafts around the strongest on-screen lights, screen-composited
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
      float ang = atan(d.y, d.x);
      float sh = .5 + .5 * sin(ang * 9. + gl.w + uTime * .25) * sin(ang * 5. - gl.w * 1.7 - uTime * .18);
      float rays = mix(1., sh, smoothstep(.05, .7, r)) ;
      sct += uGC[i] * (halo * rays);
    }
    sct *= uRays * mix(.35, 1.1, uNight) * mix(.75, 1.1, vUv.y);
    c = 1. - (1. - min(c, 1.)) * (1. - min(sct, vec3(.95)));
    c += max(sct - .95, 0.) * .2;
  }
  c += b * uBloom * (1. - min(c, 1.));
  c += b * b * .15;
  // soft knee above 0.85 so HDR highlights roll off instead of clipping
  vec3 hi = max(c - .85, 0.);
  c = min(c, vec3(.85)) + .15 * (1. - exp(-hi / .15));
  vec2 q = vUv - .5;
  float v = 1. - uVig * smoothstep(.25, .95, dot(q, q) * 2.2);
  c *= v;
  c += (bayer4(gl_FragCoord.xy) - .5) / 255.;
  gl_FragColor = vec4(c, 1.);
}`;

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
    uDof: { value: 1 }, uSsr: { value: 1 }, uRays: { value: 1 }, uBt: { value: new THREE.Vector2() },
    uGL: { value: glArr }, uGC: { value: gcArr }, uGN: { value: 0 },
  });

  const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, stencilBuffer: false, generateMipmaps: false, colorSpace: THREE.NoColorSpace };
  const lin = { ...rtOpts, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  const flat = { ...rtOpts, depthBuffer: false };
  let scene_rt = null, ssr_rt = null, dofA = null, dofB = null, downs = [], ups = [], w = 0, h = 0;
  const LEVELS = 5;
  const state = { bloom: true, bloomStrength: 0.9, vignette: 0.35, threshold: 1.4, dof: true, dofStrength: 1, ssr: true, ssrStrength: 1, rays: true, raysStrength: 1 };

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
    downs = []; ups = [];
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
      pass(mPre, downs[0]);
      for (let i = 1; i < LEVELS; i++) {
        mDown.uniforms.tSrc.value = downs[i - 1].texture; mDown.uniforms.uTexel.value.set(1 / downs[i - 1].width, 1 / downs[i - 1].height);
        pass(mDown, downs[i]);
      }
      // coarsest up level = its down level; then up[k] = blur(up[k+1]) + down[k]
      mUp.uniforms.uMix.value = 1;
      let prev = downs[LEVELS - 1];
      for (let i = LEVELS - 2; i >= 0; i--) {
        mUp.uniforms.tSrc.value = prev.texture; mUp.uniforms.tPrev.value = downs[i].texture;
        mUp.uniforms.uTexel.value.set(1 / prev.width, 1 / prev.height);
        pass(mUp, ups[i]); prev = ups[i];
      }
      bloomTex = ups[0].texture;
    }
    if (doSsr) {
      const u = mSsr.uniforms, pm = camera.projectionMatrix;
      u.tScene.value = scene_rt.texture; u.tDepth.value = scene_rt.depthTexture; u.tDofA.value = dofA.texture; u.tDofB.value = dofB.texture;
      u.tBloom.value = bloomTex || dofB.texture;
      u.uProj.value.copy(pm); u.uInvProj.value.copy(camera.projectionMatrixInverse); u.uCamWorld.value.copy(camera.matrixWorld); u.uView.value.copy(camera.matrixWorldInverse);
      u.uPAB.value.set(pm.elements[10], pm.elements[14]);
      u.uTime.value = time; u.uNight.value = night; u.uDbg.value = state.ssrDebug ? 1 : 0;
      u.uHaze.value.set(0.17 + (0.04 - 0.17) * night, 0.31 + (0.09 - 0.31) * night, 0.33 + (0.15 - 0.33) * night);
      pass(mSsr, ssr_rt);
    }
    const f = mFinal.uniforms;
    f.tScene.value = scene_rt.texture; f.tBloom.value = bloomTex || scene_rt.texture; f.tDofA.value = dofA.texture; f.tDofB.value = dofB.texture; f.tSsr.value = ssr_rt.texture;
    f.uBloom.value = bloomTex ? state.bloomStrength : 0; f.uVig.value = state.vignette; f.uNight.value = night; f.uTime.value = time;
    f.uOut.value.set(outW, outH);
    f.uBt.value.set(1.5 / dofB.width, 1.5 / dofB.height);
    f.uDof.value = doDof ? state.dofStrength : 0; f.uSsr.value = doSsr ? state.ssrStrength : 0;
    f.uRays.value = state.rays ? state.raysStrength : 0;
    f.uGN.value = state.rays ? collectRays(camera, outW / outH) : 0;
    pass(mFinal, null);
  }

  return {
    state, setRT, render, get width() { return w; }, get height() { return h; }, get rt() { return scene_rt; },
    dispose() { disposeRTs(); mPre.dispose(); mDown.dispose(); mBox.dispose(); mUp.dispose(); mSsr.dispose(); mFinal.dispose(); quadGeo.dispose(); },
  };
}
