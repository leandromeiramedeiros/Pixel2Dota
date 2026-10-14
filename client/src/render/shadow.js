// Key-light (sun / moon) shadows: one camera-following orthographic depth map along uKeyDir. Casters (terrain chunks, 3D buildings,
// trees) render a depth-only material variant into it (layer 1); receivers call shadowAt() from COMMON_GLSL (shaderlib.js), which
// only attenuates the key light term - ambient, point lights and emissives are untouched, so shadows never re-grade the frame.
import * as THREE from 'three';

export const SHADOW_LAYER = 1;

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

  // spell-light cube shadow: 6 x 90 deg faces packed 3x2 into one depth atlas
  const PF = 256;
  const pDepth = new THREE.DepthTexture(PF * 3, PF * 2, THREE.UnsignedIntType);
  pDepth.magFilter = pDepth.minFilter = THREE.NearestFilter;
  const prt = new THREE.WebGLRenderTarget(PF * 3, PF * 2, { depthBuffer: true, depthTexture: pDepth, generateMipmaps: false });
  const DIRS = [[1, 0, 0, 0, -1, 0], [-1, 0, 0, 0, -1, 0], [0, 1, 0, 0, 0, 1], [0, -1, 0, 0, 0, -1], [0, 0, 1, 0, -1, 0], [0, 0, -1, 0, -1, 0]];
  const pcams = DIRS.map(() => { const c = new THREE.PerspectiveCamera(90, 1, 8, 600); c.layers.set(SHADOW_LAYER); return c; });
  const ATL = pcams.map((_, f) => { const fx = f % 3, fy = (f / 3) | 0; return new THREE.Matrix4().set(0.5 / 3, 0, 0, (0.5 + fx) / 3, 0, 0.25, 0, (0.5 + fy) / 2, 0, 0, 0.5, 0.5, 0, 0, 0, 1); });
  uniforms.uPSMap.value = pDepth;
  const LP = new THREE.Vector3(), LT = new THREE.Vector3();

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
      L.copy(uniforms.uKeyDir.value).normalize();
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
    /** cube shadow from point light l (world coords {x,y,z,radius}) or null; uniforms.uPSIdx is set by lights.js */
    renderPoint(scene, l) {
      if (!l || !state.enabled) { uniforms.uPSIdx.value = -1; return; }
      const t0 = performance.now();
      const far = Math.max(60, l.radius);
      LP.set(l.x, l.z, -l.y);
      for (const c of casters) swap(c.mesh, c.mat);
      for (const g of groups) for (const m of g.group.children) swap(m, g.mat);
      const prev = gl.getRenderTarget();
      prt.scissorTest = false; prt.viewport.set(0, 0, PF * 3, PF * 2);
      gl.setRenderTarget(prt); gl.clear(true, true, false);
      prt.scissorTest = true;
      for (let f = 0; f < 6; f++) {
        const c = pcams[f], d = DIRS[f], fx = f % 3, fy = (f / 3) | 0;
        c.far = far; c.updateProjectionMatrix();
        c.position.copy(LP); c.up.set(d[3], d[4], d[5]); c.lookAt(LT.set(LP.x + d[0], LP.y + d[1], LP.z + d[2])); c.updateMatrixWorld();
        uniforms.uPSM.value[f].multiplyMatrices(ATL[f], c.projectionMatrix).multiply(c.matrixWorldInverse);
        prt.viewport.set(fx * PF, fy * PF, PF, PF); prt.scissor.set(fx * PF, fy * PF, PF, PF);
        gl.setRenderTarget(prt);
        gl.render(scene, c);
      }
      prt.scissorTest = false;
      gl.setRenderTarget(prev);
      for (let i = 0; i < swapped.length; i += 2) swapped[i].material = swapped[i + 1];
      swapped.length = 0;
      uniforms.uPSP.value.set(8, far, 10, 0);
      state.pointMs = performance.now() - t0;
    },
    dispose() { rt.dispose(); depthTexture.dispose(); prt.dispose(); pDepth.dispose(); },
  };
}
