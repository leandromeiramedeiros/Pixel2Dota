// Key-light (sun / moon) shadows: one camera-following orthographic depth map along uKeyDir. Casters (terrain chunks, 3D buildings,
// trees) render a depth-only material variant into it (layer 1); receivers call shadowAt() from COMMON_GLSL (shaderlib.js), which
// only attenuates the key light term - ambient, point lights and emissives are untouched, so shadows never re-grade the frame.
import * as THREE from 'three';
import { SPELL_REACH, MAX_PS } from './shaderlib.js';

export const SHADOW_LAYER = 1;
const KEY_TILT = 0.3;   // horizontal part of the key-shadow direction (1 = along uKeyDir, 0 = straight down)

/** depth-only fragment shader for caster variants (colour writes are ignored, the depth attachment is what counts) */
export const DEPTH_FRAG = /* glsl */ `
precision highp float;
void main(){ gl_FragColor = vec4(1.); }`;

export function createShadow(gl, uniforms, { size = 1024, strength = 1 } = {}) {
  const depthTexture = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
  depthTexture.magFilter = depthTexture.minFilter = THREE.NearestFilter;
  const rt = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true, depthTexture, generateMipmaps: false });
  rt.texture.minFilter = rt.texture.magFilter = THREE.NearestFilter;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 9000);
  cam.layers.set(SHADOW_LAYER);
  const casters = [];           // { mesh, mat }
  const groups = [];            // { group, mat }  (children change at runtime: terrain chunks)
  const swapped = [];
  const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  const C = new THREE.Vector3(), R = new THREE.Vector3(), U = new THREE.Vector3(), L = new THREE.Vector3();
  const state = { enabled: true, ms: 0, half: 0 };
  uniforms.uShadowMap.value = depthTexture;

  // spell-light cube shadows: one atlas row per light (MAX_PS rows), 6 x 90 deg faces per row. Shaders rebuild the face projection
  // from uPSR (face rotation) + the slot's far plane (shaderlib pointShadow), so no per-light matrices are uploaded.
  const PF = 192;
  const pDepth = new THREE.DepthTexture(PF * 6, PF * MAX_PS, THREE.UnsignedIntType);
  pDepth.magFilter = pDepth.minFilter = THREE.NearestFilter;
  const prt = new THREE.WebGLRenderTarget(PF * 6, PF * MAX_PS, { depthBuffer: true, depthTexture: pDepth, generateMipmaps: false });
  const DIRS = [[1, 0, 0, 0, -1, 0], [-1, 0, 0, 0, -1, 0], [0, 1, 0, 0, 0, 1], [0, -1, 0, 0, 0, -1], [0, 0, 1, 0, -1, 0], [0, 0, -1, 0, -1, 0]];
  const UP_FACE = 2;   // +y: only receivers above the light read it, and nothing above a ground-level spell casts onto them -> skipped
  const pcams = DIRS.map((d, f) => {
    const c = new THREE.PerspectiveCamera(90, 1, 8, 600); c.layers.set(SHADOW_LAYER);
    c.position.set(0, 0, 0); c.up.set(d[3], d[4], d[5]); c.lookAt(d[0], d[1], d[2]); c.updateMatrixWorld();
    uniforms.uPSR.value[f].setFromMatrix4(c.matrixWorldInverse);
    return c;
  });
  uniforms.uPSMap.value = pDepth;
  const LP = new THREE.Vector3(), LT = new THREE.Vector3();

  // top-down height field for the marched spell-light shadows (shaderlib hfShadow): ortho depth from above = highest caster
  const HS = 512;
  const hDepth = new THREE.DepthTexture(HS, HS, THREE.UnsignedIntType);
  hDepth.magFilter = hDepth.minFilter = THREE.NearestFilter;
  const hrt = new THREE.WebGLRenderTarget(HS, HS, { depthBuffer: true, depthTexture: hDepth, generateMipmaps: false });
  const hcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 3000);
  hcam.layers.set(SHADOW_LAYER);
  uniforms.uHF.value = hDepth;

  function swap(m, mat) { if (m.isMesh && m.visible) { swapped.push(m, m.material); m.material = mat; m.layers.enable(SHADOW_LAYER); } }

  return {
    state, camera: cam, target: rt,
    /** register a mesh with its depth-only material variant */
    addCaster(mesh, mat) { casters.push({ mesh, mat }); },
    /** every Mesh child of `group` casts with `mat` (terrain chunks are built lazily) */
    addGroup(group, mat) { groups.push({ group, mat }); },
    setEnabled(on) { state.enabled = !!on; uniforms.uShadowP.value.w = on ? 1 : 0; },
    /** render the depth map centred on ground point (x, y, z three coords), covering a square of half-size `half` world units */
    render(scene, x, y, z, half) {
      if (!state.enabled) { uniforms.uShadowP.value.w = 0; return; }
      const t0 = performance.now();
      // sun / moon shadows fall almost straight down (short, readable); only spell lights throw long shadows. Shading keeps uKeyDir.
      L.copy(uniforms.uKeyDir.value).normalize(); L.x *= KEY_TILT; L.z *= KEY_TILT; L.normalize();
      // fixed orientation (look along -L, world up) -> snap the centre to whole texels so the map does not shimmer while panning
      cam.position.set(0, 0, 0).addScaledVector(L, 4000); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
      R.setFromMatrixColumn(cam.matrixWorld, 0); U.setFromMatrixColumn(cam.matrixWorld, 1);
      const texel = (2 * half) / size;
      C.set(x, y, z);
      const cr = Math.round(C.dot(R) / texel) * texel - C.dot(R), cu = Math.round(C.dot(U) / texel) * texel - C.dot(U);
      C.addScaledVector(R, cr).addScaledVector(U, cu);
      cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
      cam.position.copy(C).addScaledVector(L, 4000); cam.lookAt(C); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      uniforms.uShadowM.value.multiplyMatrices(BIAS, cam.projectionMatrix).multiply(cam.matrixWorldInverse);
      uniforms.uShadowP.value.set(1 / size, strength, 0.0009, 1);
      uniforms.uSL.value.set(L.x, L.y, L.z, 0);
      state.half = half;

      for (const c of casters) swap(c.mesh, c.mat);
      for (const g of groups) for (const m of g.group.children) swap(m, g.mat);
      const prev = gl.getRenderTarget();
      gl.setRenderTarget(rt); gl.clear(true, true, false);
      gl.render(scene, cam);
      gl.setRenderTarget(prev);
      for (let i = 0; i < swapped.length; i += 2) swapped[i].material = swapped[i + 1];
      swapped.length = 0;
      state.ms = performance.now() - t0;
    },
    /** cube shadows for up to MAX_PS lights (world coords {x,y,z,radius}); light k fills atlas row k. lights.js maps uLP index -> row. */
    renderPoints(scene, list) {
      const n = state.enabled && list ? Math.min(list.length, MAX_PS) : 0;
      state.points = n;
      if (!n) { state.pointMs = 0; return; }
      const t0 = performance.now();
      for (const c of casters) swap(c.mesh, c.mat);
      for (const g of groups) for (const m of g.group.children) swap(m, g.mat);
      const prev = gl.getRenderTarget();
      prt.scissorTest = false; prt.viewport.set(0, 0, PF * 6, PF * MAX_PS);
      gl.setRenderTarget(prt); gl.clear(true, true, false);
      prt.scissorTest = true;
      for (let k = 0; k < n; k++) {
        const l = list[k], far = Math.max(60, l.radius * SPELL_REACH);   // spell lights reach farther on surfaces (shaderlib lightFall)
        LP.set(l.x, l.z, -l.y);
        uniforms.uSL.value.set(LP.x, LP.y, LP.z, 1);   // sprite casters turn their card toward this light
        for (let f = 0; f < 6; f++) {
          if (f === UP_FACE) continue;
          const c = pcams[f], d = DIRS[f];
          c.far = far; c.updateProjectionMatrix();
          c.position.copy(LP); c.lookAt(LT.set(LP.x + d[0], LP.y + d[1], LP.z + d[2])); c.updateMatrixWorld();
          prt.viewport.set(f * PF, k * PF, PF, PF); prt.scissor.set(f * PF, k * PF, PF, PF);
          gl.setRenderTarget(prt);
          gl.render(scene, c);
        }
      }
      prt.scissorTest = false;
      gl.setRenderTarget(prev);
      for (let i = 0; i < swapped.length; i += 2) swapped[i].material = swapped[i + 1];
      swapped.length = 0;
      state.pointMs = performance.now() - t0;
    },    /** height field around ground point (x, y, z three coords), square of half-size `half`; strength 0 disables the marched shadows */
    renderHeight(scene, x, y, z, half, strength = 1) {
      if (!state.enabled || !(strength > 0)) { uniforms.uHFZ.value.w = 0; return; }
      const t0 = performance.now(), texel = (2 * half) / HS;
      x = Math.round(x / texel) * texel; z = Math.round(z / texel) * texel;   // texel-snapped: no shimmer while panning
      const top = y + 1500;
      hcam.left = -half; hcam.right = half; hcam.top = half; hcam.bottom = -half; hcam.near = 1; hcam.far = 3000;
      hcam.position.set(x, top, z); hcam.up.set(0, 0, -1); hcam.lookAt(x, y, z); hcam.updateMatrixWorld(); hcam.updateProjectionMatrix();
      uniforms.uSL.value.set(0, 1, 0, 2);   // sprites cast as flat discs (pillars) in this pass
      for (const c of casters) swap(c.mesh, c.mat);
      for (const g of groups) for (const m of g.group.children) swap(m, g.mat);
      const prev = gl.getRenderTarget();
      gl.setRenderTarget(hrt); gl.clear(true, true, false);
      gl.render(scene, hcam);
      gl.setRenderTarget(prev);
      for (let i = 0; i < swapped.length; i += 2) swapped[i].material = swapped[i + 1];
      swapped.length = 0;
      uniforms.uHFM.value.set(x - half, z + half, 1 / (2 * half), 0);
      uniforms.uHFZ.value.set(top, 1, 3000, strength);
      state.heightMs = performance.now() - t0;
    },
    dispose() { rt.dispose(); depthTexture.dispose(); prt.dispose(); pDepth.dispose(); hrt.dispose(); hDepth.dispose(); },
  };
}
