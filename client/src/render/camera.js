// Dota camera: perspective, distance/pitch/fov from the game's convars (docs/ARCHITECTURE.md "Camera"). Yaw is 0 (looking north) everywhere except in the
// showcase (zoomed in past closeDistance), where the player orbits the hero; leaving the showcase eases yaw back to 0.
// Three coords: X = x, Y = z (up), Z = -y. Eye = look + d * (sin(yaw) cos(pitch), sin(pitch), cos(yaw) cos(pitch)); yaw > 0 = eye towards east.
import * as THREE from 'three';
import { CAMERA, vfov } from '../../../shared/constants.js';
import { heightAt } from '../../../shared/map.js';

const D2R = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const wrapPi = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };

/** Camera parameters at a distance: pitch/fov interpolate between (pitchMin, fovMin) at closeDistance and (pitch, fov) at distance;
 *  below closeDistance they ease to the showcase pose (low eye at canopy height, looking at the hero's chest) at showcaseDistance and stay there
 *  while dollying closer. `userPitch` = the orbit pitch the showcase pose eases to (default cfg.showcasePitch). */
export function camParams(d, cfg = CAMERA, userPitch = cfg.showcasePitch) {
  let pitch, fovH, lookH = 0;
  if (d >= cfg.closeDistance || cfg.showcaseDistance == null) {
    const t = clamp((d - cfg.closeDistance) / (cfg.distance - cfg.closeDistance), 0, 1);
    pitch = cfg.pitchMin + (cfg.pitch - cfg.pitchMin) * t;
    fovH = cfg.fovH43Min + (cfg.fovH43 - cfg.fovH43Min) * t;
  } else {
    const s = clamp((d - cfg.showcaseDistance) / (cfg.closeDistance - cfg.showcaseDistance), 0, 1);
    const e = s * s * (3 - 2 * s);
    pitch = userPitch + (cfg.pitchMin - userPitch) * e;
    fovH = cfg.showcaseFovH43 + (cfg.fovH43Min - cfg.showcaseFovH43) * e;
    lookH = cfg.showcaseLookH * (1 - e);
  }
  return { pitch, fovH43: fovH, vfov: vfov(fovH), lookH };
}

/** Eye and look-at point (Three coords) for a world target (tx, ty) on ground height tz, `lookH` above the ground. */
export function cameraPose(tx, ty, tz, d, yawRad, pitchDeg, lookH = 0) {
  const pr = pitchDeg * D2R, cp = Math.cos(pr), ly = tz + lookH;
  return { look: [tx, ly, -ty], eye: [tx + d * cp * Math.sin(yawRad), ly + d * Math.sin(pr), -ty + d * cp * Math.cos(yawRad)] };
}

/** Yaw / pitch update for one frame. Showcase: yaw eases to its goal (unwrapped, so spins are not cut short). Outside it the goal is 0 and yaw
 *  takes the shortest way round. Returns { yaw, goal } (rad). */
export function stepYaw(yaw, goal, showcase, dt, rate = 14, backRate = 7) {
  if (showcase) {
    if (Math.abs(goal) > 2 * Math.PI) { const k = Math.round(goal / (2 * Math.PI)) * 2 * Math.PI; goal -= k; yaw -= k; }
    yaw += (goal - yaw) * (1 - Math.exp(-dt * rate));
    if (Math.abs(goal - yaw) < 1e-3) yaw = goal;
    return { yaw, goal };
  }
  yaw = wrapPi(yaw); goal = 0;
  yaw -= yaw * (1 - Math.exp(-dt * backRate));
  if (Math.abs(yaw) < 2e-3) yaw = 0;
  return { yaw, goal };
}

/** Facing (rad, 0 = east, CCW) as seen from a camera at `yaw`: the sheet direction to pick is dirOf / dir8Of(viewFacing(facing, yaw)). */
export const viewFacing = (facing, yaw) => facing - yaw;

/** Tilt-shift DoF strength factor from the camera distance: barely there (DOF_MIN) at normal gameplay distance so the lane stays readable,
 *  ramping smoothly from closeDistance down to the showcase close-up where it is today's full strength (1). Zoomed out / devZoom stay at the floor. */
export const DOF_MIN = 0.12;
export function dofForDistance(d, cfg = CAMERA) {
  return DOF_MIN + (1 - DOF_MIN) * showcaseK(d, cfg);
}
/** 0 at normal play (>= closeDistance) .. 1 at the showcase close-up, smoothstepped: drives DoF, sky and distance fog. */
export function showcaseK(d, cfg = CAMERA) {
  if (cfg.showcaseDistance == null) return 0;
  const s = clamp((cfg.closeDistance - d) / (cfg.closeDistance - cfg.showcaseDistance), 0, 1);
  return s * s * (3 - 2 * s);
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
    this.minDist = CAMERA.showcaseMin;        // zoom in only: far (1134 desktop, 1450 touch) .. closest showcase dolly
    this.yaw = 0; this.yawGoal = 0;           // orbit (showcase only; eased back to 0 outside it)
    this.pitchUser = CAMERA.showcasePitch; this.pitchGoal = CAMERA.showcasePitch;
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
  /** Orbit the hero (showcase only; ignored otherwise): dYaw rad (+ = eye towards east), dPitchDeg (+ = more top-down, clamped orbitPitchMin..Max). */
  orbit(dYaw, dPitchDeg = 0) {
    if (!this.showcase) return false;
    this.yawGoal += dYaw; this.pitchGoal = clamp(this.pitchGoal + dPitchDeg, CAMERA.orbitPitchMin, CAMERA.orbitPitchMax);
    return true;
  }
  /** Showcase = zoomed in past the normal close camera: the game keeps the hero centred, the player may orbit. */
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
    const sy = stepYaw(this.yaw, this.yawGoal, this.showcase, this.snap ? 1e3 : dt);
    this.yaw = sy.yaw; this.yawGoal = sy.goal;
    this.pitchUser += (this.pitchGoal - this.pitchUser) * (this.snap ? 1 : 1 - Math.exp(-dt * 14));
    this.distance += (this.distanceGoal - this.distance) * k;
    if (Math.abs(this.distance - this.distanceGoal) < 0.05) this.distance = this.distanceGoal;
    this.snap = false;
    this.apply();
  }

  apply() {
    const p = camParams(this.distance, CAMERA, this.pitchUser);
    this.params = p;
    const cam = this.camera;
    if (Math.abs(cam.fov - p.vfov) > 1e-4) { cam.fov = p.vfov; cam.updateProjectionMatrix(); }
    const pose = cameraPose(this.target.x, this.target.y, this.tz, this.distance, this.yaw, p.pitch, p.lookH);
    cam.position.set(pose.eye[0], pose.eye[1], pose.eye[2]);
    cam.lookAt(pose.look[0], pose.look[1], pose.look[2]);
    cam.updateMatrixWorld(true);
  }

  /** Visible height (world units) at the target distance right now. */
  get visibleHeight() { return visibleHeight(this.distance, this.params.vfov); }
  get visibleWidth() { return this.visibleHeight * this.aspect; }
}
