import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

// The golf hole: a properly recessed cup (dark shaft + bottom + bright liner
// ring + flag) plus the little "plop into the cup" sink animation and a gentle
// flag flutter. Kept separate from golf/logic.js so the hole's look and feel can
// evolve on its own.
//
// The returned group is positioned by the caller at the cup's surface height;
// everything here is modelled in local space with y=0 at the green surface.

const CUP_RADIUS = 0.42;
// The ball is cartoonishly large (r≈0.34), so the cup is deep enough that the
// ball can settle with its top just below the rim instead of clipping the cap.
const CUP_DEPTH = 0.8;
const SINK_TOP_Y = 0.30;     // ball-centre height where the drop begins
const SINK_BOTTOM_Y = -0.17; // resting depth once it has settled (top ≈ at rim)
const SINK_DROP_TIME = 0.42;

export function buildGolfHole(materials) {
  const cup = new THREE.Group();

  const shaftMat = new THREE.MeshStandardMaterial({
    color: 0x07090b,
    roughness: 0.98,
    metalness: 0.0,
    side: THREE.DoubleSide
  });

  // Inner shaft (open-topped) — the dark walls read as real depth from the
  // raised golf camera.
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(CUP_RADIUS, CUP_RADIUS * 0.9, CUP_DEPTH, 40, 1, true),
    shaftMat
  );
  shaft.position.y = -CUP_DEPTH / 2 + 0.02;
  shaft.receiveShadow = true;
  cup.add(shaft);

  // Bottom cap so the void never shows through to the lava island below.
  const bottom = new THREE.Mesh(
    new THREE.CylinderGeometry(CUP_RADIUS * 0.9, CUP_RADIUS * 0.9, 0.05, 40),
    shaftMat
  );
  bottom.position.y = -CUP_DEPTH + 0.05;
  cup.add(bottom);

  // Bright liner ring flush with the surface to make the hole pop on the green.
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(CUP_RADIUS + 0.015, 0.05, 12, 44),
    new THREE.MeshStandardMaterial({ color: 0xeef3ec, roughness: 0.55 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.008;
  rim.castShadow = false;
  rim.receiveShadow = true;
  cup.add(rim);

  // Flag, anchored to the rim. A small pivot lets the whole flag flutter/pop.
  const flagPivot = new THREE.Group();
  flagPivot.position.set(0.16, 0, 0);
  cup.add(flagPivot);

  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 12), materials.metal);
  flagPole.position.set(0, 1.2, 0);
  flagPole.castShadow = true;
  flagPivot.add(flagPole);

  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.36, 0.035), materials.coral);
  flag.position.set(0.38, 0.7, 0);
  flag.castShadow = true;
  flagPole.add(flag);

  cup.userData.flagAnim = { pivot: flagPivot, flag, pop: 0, t: Math.random() * 6.28 };
  return cup;
}

// Kick the flag when a ball drops in.
export function triggerFlagPop(cup) {
  const a = cup?.userData?.flagAnim;
  if (a) a.pop = 1;
}

// Idle flutter + decaying pop. Call every frame while the golf phase is active.
export function tickGolfFlag(cup, dt) {
  const a = cup?.userData?.flagAnim;
  if (!a) return;
  a.t += dt;
  a.pop = Math.max(0, a.pop - dt * 1.6);
  const flutter = Math.sin(a.t * 3.1) * 0.05 + Math.sin(a.t * 7.3) * 0.02;
  a.pivot.rotation.z = flutter * 0.4 + a.pop * Math.sin(a.t * 26) * 0.18;
  if (a.flag) a.flag.rotation.y = flutter + a.pop * Math.sin(a.t * 22) * 0.5;
}

// Ease a potted ball down into the cup with a small settle bounce. Returns true
// while the animation is running. `ball.sinkElapsed` is the per-ball clock
// (set to 0 when the ball is scored, null to disable).
export function animateCupSink(ball, cupPos, dt) {
  if (ball.sinkElapsed == null) return false;
  ball.sinkElapsed += dt;
  const t = ball.sinkElapsed;

  // Snap toward the cup centre on X/Z as it drops.
  ball.mesh.position.x += (cupPos.x - ball.mesh.position.x) * Math.min(1, dt * 14);
  ball.mesh.position.z += (cupPos.z - ball.mesh.position.z) * Math.min(1, dt * 14);

  let y;
  if (t < SINK_DROP_TIME) {
    const kk = t / SINK_DROP_TIME;
    const accel = 1 - Math.pow(1 - kk, 2.4); // accelerate into the hole
    y = SINK_TOP_Y + (SINK_BOTTOM_Y - SINK_TOP_Y) * accel;
  } else {
    const tb = t - SINK_DROP_TIME;
    const bounce = Math.max(0, Math.cos(tb * 22) * Math.exp(-tb * 9) * 0.05);
    y = SINK_BOTTOM_Y + bounce;
  }
  ball.mesh.position.y = y;
  ball.mesh.rotation.x += dt * 6; // a little tumble for flavour
  return true;
}
