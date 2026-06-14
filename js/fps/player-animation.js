import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

// Procedural skeletal animation for the third-person soldier rig built in
// player-mesh.js (mesh.userData.rig = { legL, legR, armL, armR, gun }).
//
// It is deliberately data-light so it works for every kind of player:
//   * Gait speed is recovered from the player's frame-to-frame position delta,
//     so it is identical for locally simulated bots and network-interpolated
//     remotes (no extra fields to network).
//   * Reload is a looping "mag swap" gesture driven by a single boolean.
// All target angles are eased, so transitions between idle / walk / air / slide
// / reload stay smooth.

const WALK_REF_SPEED = 7.5;   // horizontal speed (u/s) that yields a full stride
const STRIDE_FREQ = 8.5;      // stride cadence (rad/s) at reference speed
const MAX_STRIDE = 0.85;      // peak hip swing (radians)
const AIR_THRESHOLD = 3.0;    // |vertical speed| treated as airborne

function ease(obj, axis, target, k) {
  obj.rotation[axis] += (target - obj.rotation[axis]) * k;
}

// Blend a value across the mutually-exclusive pose modes (slide beats air beats
// walk), weighted by the eased mode weights so pose changes never snap.
function blend(walkVal, airVal, slideVal, w) {
  return slideVal * w.slide + (1 - w.slide) * (airVal * w.air + (1 - w.air) * walkVal);
}

export function updatePlayerAnimation(mesh, player, dt, ctx = {}) {
  const rig = mesh.userData.rig;
  if (!rig) return;
  const now = ctx.now ?? performance.now() * 0.001;
  const safeDt = Math.max(1 / 240, Math.min(0.05, dt));

  // --- recover motion from the authoritative position delta ---
  const prev = mesh.userData.animPrev || (mesh.userData.animPrev = player.pos.clone());
  let dx = player.pos.x - prev.x;
  let dy = player.pos.y - prev.y;
  let dz = player.pos.z - prev.z;
  if (dx * dx + dy * dy + dz * dz > 16) { dx = dy = dz = 0; } // ignore teleports/respawns
  prev.copy(player.pos);

  const sm = mesh.userData.animSmooth || (mesh.userData.animSmooth = { h: 0, v: 0 });
  sm.h += (Math.hypot(dx, dz) / safeDt - sm.h) * Math.min(1, dt * 9);
  sm.v += (dy / safeDt - sm.v) * Math.min(1, dt * 9);

  const sliding = Boolean(player.sliding) || (player.visualSlide || 0) > 0.55;
  const airborne = !sliding && Math.abs(sm.v) > AIR_THRESHOLD;
  const walking = !sliding && !airborne && sm.h > 0.5;

  // --- eased per-mode weights ---
  const w = mesh.userData.animWeights || (mesh.userData.animWeights = { air: 0, slide: 0 });
  w.air += ((airborne ? 1 : 0) - w.air) * Math.min(1, dt * 9);
  w.slide += ((sliding ? 1 : 0) - w.slide) * Math.min(1, dt * 10);

  // --- stride phase advances with distance travelled (no foot sliding) ---
  const speedN = Math.min(1, sm.h / WALK_REF_SPEED);
  let phase = mesh.userData.animPhase || 0;
  if (walking) phase += STRIDE_FREQ * Math.min(1.4, sm.h / WALK_REF_SPEED) * dt;
  mesh.userData.animPhase = phase;
  const stride = MAX_STRIDE * speedN;
  const swing = Math.sin(phase);

  // --- reload envelope (0..1), eased in/out ---
  let reloadEnv = mesh.userData.animReload || 0;
  reloadEnv += ((ctx.reloading ? 1 : 0) - reloadEnv) * Math.min(1, dt * 7);
  if (reloadEnv < 0.001) reloadEnv = 0;
  mesh.userData.animReload = reloadEnv;

  const k = Math.min(1, dt * 16);
  const breath = Math.sin(now * 1.6) * 0.02;

  // --- legs ---  (positive rotation.x swings the foot forward, model faces -Z)
  ease(rig.legL, "x", blend(swing * stride, 0.55, 0.95, w), k);
  ease(rig.legR, "x", blend(-swing * stride, 0.62, -0.25, w), k);

  // --- arms ---  hold the weapon; only a slight counter-sway when walking and a
  // gentle breath when idle. The support (left) arm performs the reload gesture.
  const armSwayL = walking ? -swing * 0.10 : breath;
  const armSwayR = walking ? swing * 0.06 : breath * 0.6;
  const reloadTap = reloadEnv > 0 ? Math.sin(now * 13) * 0.12 * reloadEnv : 0;
  ease(rig.armL, "x", blend(armSwayL, -0.18, -0.1, w) + reloadEnv * 1.15 + reloadTap, k);
  ease(rig.armL, "z", reloadEnv * 0.55, k);
  ease(rig.armR, "x", blend(armSwayR, -0.14, -0.08, w) + reloadEnv * 0.1, k);

  // --- body bob + stride roll ---
  const bob = walking ? Math.abs(swing) * stride * 0.06 : breath * 0.5;
  mesh.position.y += bob;
  mesh.rotation.z = walking ? swing * stride * 0.04 : 0;

  // --- reload gun dip (gun group is reset by syncThirdPersonWeaponMesh each
  // frame, so these offsets are safely additive) ---
  if (rig.gun && reloadEnv > 0) {
    rig.gun.position.y -= 0.06 * reloadEnv;
    rig.gun.rotation.x += 0.28 * reloadEnv;
  }
}
