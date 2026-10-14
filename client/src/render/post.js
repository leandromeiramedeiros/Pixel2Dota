// Low-res HDR pipeline: scene -> HalfFloat render target (nearest) -> threshold + progressive bloom -> final pass
// (soft tonemap knee, vignette, Bayer output dither, nearest upscale to the canvas).
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

const FINAL = /* glsl */ `
precision highp float;
uniform sampler2D tScene; uniform sampler2D tBloom;
uniform float uBloom, uVig, uNight, uTime;
uniform vec2 uOut;
varying vec2 vUv;
float bayer4(vec2 p){
  vec2 b = mod(floor(p), 4.);
  vec4 r = b.y < .5 ? vec4(0.,8.,2.,10.) : b.y < 1.5 ? vec4(12.,4.,14.,6.) : b.y < 2.5 ? vec4(3.,11.,1.,9.) : vec4(15.,7.,13.,5.);
  float v = b.x < .5 ? r.x : b.x < 1.5 ? r.y : b.x < 2.5 ? r.z : r.w;
  return (v + .5) / 16.;
}
void main(){
  // v2 look (docs/ART-DIRECTION.md): bloom normalised over 5 levels and screen-composited so it cannot white out,
  // low-key exposure, teal shadows / warm highlights, far (top) of the frame dissolves into tinted haze.
  vec3 b = texture2D(tBloom, vUv).rgb * .2;
  vec3 c = texture2D(tScene, vUv).rgb * .8;
  float l = dot(c, vec3(.3, .59, .11));
  c = mix(c * vec3(.72, .95, 1.), c, smoothstep(.15, .7, l));
  c += vec3(.05, .025, -.02) * smoothstep(.45, 1., l);
  vec3 haze = mix(vec3(.09, .19, .19), vec3(.03, .08, .1), uNight);
  float hz = smoothstep(.4, 1., vUv.y) * .55;
  c = mix(c, haze + b * .6, hz);
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

export function createPost(renderer) {
  const quadGeo = new THREE.BufferGeometry();
  quadGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  quadGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const quad = new THREE.Mesh(quadGeo); quad.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const mPre = mk(PRE, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.12 }, uKnee: { value: 0.25 } });
  const mDown = mk(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  const mUp = mk(UP, { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 1 } });
  const mFinal = mk(FINAL, { tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.9 }, uVig: { value: 0.35 }, uNight: { value: 0 }, uTime: { value: 0 }, uOut: { value: new THREE.Vector2() } });

  const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, stencilBuffer: false, generateMipmaps: false, colorSpace: THREE.NoColorSpace };
  const lin = { ...rtOpts, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  let scene_rt = null, downs = [], ups = [], w = 0, h = 0;
  const LEVELS = 5;
  const state = { bloom: true, bloomStrength: 0.9, vignette: 0.35, threshold: 1.4 };

  function setRT(nw, nh) {
    nw = Math.max(16, nw | 0); nh = Math.max(16, nh | 0);
    if (nw === w && nh === h && scene_rt) return false;
    w = nw; h = nh;
    if (scene_rt) scene_rt.dispose();
    for (const t of downs) t.dispose(); for (const t of ups) t.dispose();
    scene_rt = new THREE.WebGLRenderTarget(w, h, rtOpts);
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

  function render(sceneObj, camera, time, night, outW, outH) {
    renderer.setRenderTarget(scene_rt);
    renderer.setClearColor(0x050509, 1); renderer.clear(true, true, false);
    renderer.render(sceneObj, camera);
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
    const f = mFinal.uniforms;
    f.tScene.value = scene_rt.texture; f.tBloom.value = bloomTex || scene_rt.texture;
    f.uBloom.value = bloomTex ? state.bloomStrength : 0; f.uVig.value = state.vignette; f.uNight.value = night; f.uTime.value = time;
    f.uOut.value.set(outW, outH);
    pass(mFinal, null);
  }

  return {
    state, setRT, render, get width() { return w; }, get height() { return h; }, get rt() { return scene_rt; },
    dispose() { scene_rt && scene_rt.dispose(); for (const t of downs) t.dispose(); for (const t of ups) t.dispose(); mPre.dispose(); mDown.dispose(); mUp.dispose(); mFinal.dispose(); quadGeo.dispose(); },
  };
}
