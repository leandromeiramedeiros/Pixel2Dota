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
    dispose() { rt.dispose(); depthTexture.dispose(); },
  };
}
