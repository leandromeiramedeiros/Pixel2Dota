// Dota camera: perspective, yaw fixed (looking north), distance/pitch/fov from the game's convars (docs/ARCHITECTURE.md "Camera").
// Three coords: X = x, Y = z (up), Z = -y. Eye = target + d * (0, sin(pitch), cos(pitch)).
import * as THREE from 'three';
import { CAMERA, vfov } from '../../../shared/constants.js';
import { heightAt } from '../../../shared/map.js';

const D2R = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Camera parameters at a distance: pitch/fov interpolate between (pitchMin, fovMin) at closeDistance and (pitch, fov) at distance;
 *  below closeDistance they keep dropping to the showcase close-up (low, narrow, over the hero) at showcaseDistance. */
export function camParams(d, cfg = CAMERA) {
  let pitch, fovH;
  if (d >= cfg.closeDistance || cfg.showcaseDistance == null) {
    const t = clamp((d - cfg.closeDistance) / (cfg.distance - cfg.closeDistance), 0, 1);
    pitch = cfg.pitchMin + (cfg.pitch - cfg.pitchMin) * t;
    fovH = cfg.fovH43Min + (cfg.fovH43 - cfg.fovH43Min) * t;
  } else {
    const s = clamp((d - cfg.showcaseDistance) / (cfg.closeDistance - cfg.showcaseDistance), 0, 1);
    const e = s * s * (3 - 2 * s);
    pitch = cfg.showcasePitch + (cfg.pitchMin - cfg.showcasePitch) * e;
    fovH = cfg.showcaseFovH43 + (cfg.fovH43Min - cfg.showcaseFovH43) * e;
  }
  return { pitch, fovH43: fovH, vfov: vfov(fovH) };
}

/** Tilt-shift DoF strength factor from the camera distance: barely there (DOF_MIN) at normal gameplay distance so the lane stays readable,
 *  ramping smoothly from closeDistance down to the showcase close-up where it is today's full strength (1). Zoomed out / devZoom stay at the floor. */
export const DOF_MIN = 0.12;
export function dofForDistance(d, cfg = CAMERA) {
  if (cfg.showcaseDistance == null) return DOF_MIN;
  const s = clamp((cfg.closeDistance - d) / (cfg.closeDistance - cfg.showcaseDistance), 0, 1);
  return DOF_MIN + (1 - DOF_MIN) * s * s * (3 - 2 * s);
}

/** World height (units) visible across the screen at the target distance. */
export const visibleHeight = (d, vfovDeg) => 2 * d * Math.tan((vfovDeg * D2R) / 2);

export class CameraRig {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(vfov(CAMERA.fovH43), 16 / 9, 100, 5500);
    this.target = { x: 0, y: 0 };         // world x,y (smoothed, what the camera looks at)
    this.goal = { x: 0, y: 0 };           // where the target wants to be
    this.tz = 0;                          // smoothed ground height under the target
    this.distance = CAMERA.distance;
    this.distanceGoal = CAMERA.distance;
    this.minDist = CAMERA.showcaseDistance;   // zoom in only: far (1134 desktop, 1450 touch) .. showcase close-up
    this.maxDist = CAMERA.distanceMax;
    this.far = CAMERA.distanceMax;
    this.aspect = 16 / 9;
    this.params = camParams(this.distance);
    this.snap = true;
    this.inset = { top: 0, bottom: 0 };   // fractions of the screen height covered by HUD (touch): the target is framed in the free middle
    this._v = new THREE.Vector3();
    this.apply();
  }

  setDevZoom(on) { this.maxDist = on ? 2600 : this.far; this.distanceGoal = clamp(this.distanceGoal, this.minDist, this.maxDist); }
  /** Furthest distance (desktop 1134, touch 1450) and the starting one (default = furthest; touch starts at 1450 too). */
  setFar(d, start = d) { this.far = this.maxDist = d; this.distance = this.distanceGoal = clamp(start, this.minDist, d); }
  /** Multiply the distance (factor < 1 = closer), clamped to showcase..far. */
  zoomBy(f) { this.distanceGoal = clamp(this.distanceGoal * f, this.minDist, this.maxDist); }
  /** Close-up past the normal close camera: the game keeps the hero centred. */
  get showcase() { return this.distanceGoal < CAMERA.closeDistance - 1; }
  setTarget(x, y, snap = false) { this.goal.x = x; this.goal.y = y; if (snap) { this.target.x = x; this.target.y = y; this.tz = heightAt(x, y); } }
  getTarget() { return { x: this.goal.x, y: this.goal.y }; }
  /** Wheel notch delta (positive = zoom out). ~9 notches from 1134 to the showcase close-up. */
  zoom(delta) { this.zoomBy(Math.pow(1.12, delta)); }
  pan(dx, dy) { this.goal.x += dx; this.goal.y += dy; this.target.x += dx; this.target.y += dy; }
  /** Edge pan helper: mouse position in 0..1 viewport coords -> world movement for dt seconds. */
  edgePan(mx, my, dt, speed = 1800, margin = 0.012) {
    let dx = 0, dy = 0;
    if (mx < margin) dx = -1; else if (mx > 1 - margin) dx = 1;
    if (my < margin) dy = 1; else if (my > 1 - margin) dy = -1;
    if (dx || dy) this.pan(dx * speed * dt, dy * speed * dt);
  }
  /** Frame the target in the centre of the free playfield: shift the projection window (ratio-only view offset, so no screen size is needed).
   *  The target (screen centre without an inset) lands at y = top + (1 - top - bottom) / 2 of the screen height. 0,0 = plain camera. */
  setViewInset(top = 0, bottom = 0) {
    top = clamp(+top || 0, 0, 0.8); bottom = clamp(+bottom || 0, 0, 0.8);
    if (top + bottom > 0.9) { const k = 0.9 / (top + bottom); top *= k; bottom *= k; }
    this.inset.top = top; this.inset.bottom = bottom;
    this._applyInset();
  }
  _applyInset() {
    // PerspectiveCamera.setViewOffset overwrites camera.aspect with fullWidth / fullHeight: pass the real aspect so x is not squashed
    const cam = this.camera, off = (this.inset.bottom - this.inset.top) * 500, W = 1000 * this.aspect;
    if (Math.abs(off) < 1e-6) { cam.clearViewOffset(); cam.aspect = this.aspect; } else cam.setViewOffset(W, 1000, 0, off, W, 1000);
    cam.updateProjectionMatrix();
  }
  setAspect(a) { this.aspect = a; this.camera.aspect = a; this._applyInset(); }

  update(dt) {
    const k = this.snap ? 1 : 1 - Math.exp(-dt * 14);
    this.target.x += (this.goal.x - this.target.x) * (this.snap ? 1 : 1 - Math.exp(-dt * 12));
    this.target.y += (this.goal.y - this.target.y) * (this.snap ? 1 : 1 - Math.exp(-dt * 12));
    const th = heightAt(this.target.x, this.target.y);
    this.tz += (th - this.tz) * (this.snap ? 1 : 1 - Math.exp(-dt * 4));
    this.distance += (this.distanceGoal - this.distance) * k;
    if (Math.abs(this.distance - this.distanceGoal) < 0.05) this.distance = this.distanceGoal;
    this.snap = false;
    this.apply();
  }

  apply() {
    const p = camParams(this.distance);
    this.params = p;
    const cam = this.camera;
    if (Math.abs(cam.fov - p.vfov) > 1e-4) { cam.fov = p.vfov; cam.updateProjectionMatrix(); }
    const pr = p.pitch * D2R;
    cam.position.set(this.target.x, this.tz + this.distance * Math.sin(pr), -this.target.y + this.distance * Math.cos(pr));
    cam.lookAt(this.target.x, this.tz, -this.target.y);
    cam.updateMatrixWorld(true);
  }

  /** Visible height (world units) at the target distance right now. */
  get visibleHeight() { return visibleHeight(this.distance, this.params.vfov); }
  get visibleWidth() { return this.visibleHeight * this.aspect; }
}
