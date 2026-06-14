import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { FPS_HEAD_VISUAL_HEIGHT } from "../core/constants.js";
import { buildPlayerOutline } from "./player-outline.js";

// Full humanoid soldier model. The group contract is fixed:
//   * a child named "headGroup" pivots with pitch and carries the "gun" and
//     "melee" attach groups (driven by syncThirdPersonWeaponMesh each frame);
//   * the limbs hang off hip/shoulder pivot groups exposed on
//     `group.userData.rig` ({ legL, legR, armL, armR, gun }) so
//     player-animation.js can drive a walk/idle/reload cycle.
// The `material` argument is the shared per-player team material — it is used
// as-is and never mutated; its colour also seeds the team-coloured outline.
const HIP_Y = 1.0;        // hip pivot height (top of the thigh)
const SHOULDER_Y = 1.55;  // shoulder pivot height

export function makePlayerMesh(material) {
  const group = new THREE.Group();
  const rig = {};
  group.userData.rig = rig;

  const armorMat = new THREE.MeshStandardMaterial({ color: 0x1b232b, roughness: 0.5, metalness: 0.3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0d1114, roughness: 0.55, metalness: 0.4 });
  const strapMat = new THREE.MeshStandardMaterial({ color: 0x2a323b, roughness: 0.62, metalness: 0.18 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0x222a31, roughness: 0.7, metalness: 0.1 });
  const visorMat = new THREE.MeshBasicMaterial({ color: 0x8ff7ff });

  const addMesh = (parent, geometry, mat, x, y, z, opts = {}) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    if (opts.rot) mesh.rotation.set(opts.rot[0] || 0, opts.rot[1] || 0, opts.rot[2] || 0);
    if (opts.scale) mesh.scale.set(opts.scale[0], opts.scale[1], opts.scale[2]);
    if (opts.skipOutline) mesh.userData.skipOutline = true;
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // ---- Legs (hung off a hip pivot so they can swing) ----
  for (const side of [-1, 1]) {
    const x = side * 0.19;
    const leg = new THREE.Group();
    leg.position.set(x, HIP_Y, 0);
    group.add(leg);
    // Parts re-expressed relative to the hip pivot (subtract HIP_Y; x carried by pivot).
    addMesh(leg, new THREE.BoxGeometry(0.2, 0.14, 0.34), darkMat, 0, 0.07 - HIP_Y, -0.03);
    addMesh(leg, new THREE.BoxGeometry(0.17, 0.09, 0.1), armorMat, 0, 0.06 - HIP_Y, -0.22);
    addMesh(leg, new THREE.CylinderGeometry(0.075, 0.095, 0.42, 10), strapMat, 0, 0.38 - HIP_Y, 0);
    addMesh(leg, new THREE.SphereGeometry(0.1, 10, 8), armorMat, 0, 0.6 - HIP_Y, -0.03, { scale: [1, 0.8, 1] });
    addMesh(leg, new THREE.CylinderGeometry(0.11, 0.09, 0.42, 10), darkMat, 0, 0.82 - HIP_Y, 0);
    // Team-color thigh stripe so the player palette reads from a distance.
    addMesh(leg, new THREE.BoxGeometry(0.05, 0.3, 0.05), material, side * 0.1, 0.82 - HIP_Y, -0.08);
    if (side < 0) rig.legL = leg; else rig.legR = leg;
  }

  // ---- Pelvis & belt ----
  addMesh(group, new THREE.BoxGeometry(0.5, 0.26, 0.32), darkMat, 0, 1.05, 0);
  addMesh(group, new THREE.BoxGeometry(0.54, 0.09, 0.36), strapMat, 0, 1.19, 0);
  addMesh(group, new THREE.BoxGeometry(0.12, 0.13, 0.09), armorMat, -0.24, 1.13, -0.16);
  addMesh(group, new THREE.BoxGeometry(0.12, 0.13, 0.09), armorMat, 0.24, 1.13, -0.16);

  // ---- Torso ----
  const torso = addMesh(group, new THREE.CylinderGeometry(0.33, 0.23, 0.54, 14), material, 0, 1.38, 0);
  torso.scale.z = 0.72;
  addMesh(group, new THREE.BoxGeometry(0.48, 0.36, 0.14), armorMat, 0, 1.46, -0.18);
  addMesh(group, new THREE.BoxGeometry(0.16, 0.05, 0.04), visorMat, 0, 1.55, -0.255, { skipOutline: true });
  addMesh(group, new THREE.BoxGeometry(0.42, 0.46, 0.18), strapMat, 0, 1.42, 0.22);
  addMesh(group, new THREE.BoxGeometry(0.07, 0.34, 0.05), strapMat, -0.16, 1.52, -0.2, { rot: [0.15, 0, 0.08] });
  addMesh(group, new THREE.BoxGeometry(0.07, 0.34, 0.05), strapMat, 0.16, 1.52, -0.2, { rot: [0.15, 0, -0.08] });

  // ---- Shoulder pads (stay on the torso) ----
  addMesh(group, new THREE.SphereGeometry(0.15, 12, 8), armorMat, -0.42, 1.56, 0, { scale: [1.2, 0.78, 1] });
  addMesh(group, new THREE.SphereGeometry(0.15, 12, 8), armorMat, 0.42, 1.56, 0, { scale: [1.2, 0.78, 1] });

  // ---- Arms (weapon-ready pose, facing -z), hung off shoulder pivots ----
  // Right arm: extended forward toward the gun.
  const armR = new THREE.Group();
  armR.position.set(0.41, SHOULDER_Y, -0.05);
  group.add(armR);
  addMesh(armR, new THREE.CylinderGeometry(0.068, 0.06, 0.34, 10), material, -0.01, 1.47 - SHOULDER_Y, -0.12, { rot: [-1.1, 0, -0.12] });
  addMesh(armR, new THREE.CylinderGeometry(0.055, 0.05, 0.3, 10), strapMat, -0.04, 1.41 - SHOULDER_Y, -0.37, { rot: [-1.5, 0, -0.06] });
  addMesh(armR, new THREE.SphereGeometry(0.075, 10, 8), gloveMat, -0.05, 1.4 - SHOULDER_Y, -0.51);
  rig.armR = armR;

  // Left arm: bent across, supporting the foregrip.
  const armL = new THREE.Group();
  armL.position.set(-0.41, SHOULDER_Y, -0.05);
  group.add(armL);
  addMesh(armL, new THREE.CylinderGeometry(0.068, 0.06, 0.32, 10), material, 0.02, 1.45 - SHOULDER_Y, -0.07, { rot: [-0.85, 0, 0.45] });
  addMesh(armL, new THREE.CylinderGeometry(0.055, 0.05, 0.3, 10), strapMat, 0.19, 1.4 - SHOULDER_Y, -0.31, { rot: [-1.35, -0.55, 0.1] });
  addMesh(armL, new THREE.SphereGeometry(0.075, 10, 8), gloveMat, 0.31, 1.39 - SHOULDER_Y, -0.44);
  rig.armL = armL;

  // ---- Neck & head ----
  addMesh(group, new THREE.CylinderGeometry(0.085, 0.1, 0.14, 10), darkMat, 0, 1.6, 0);

  const headGroup = new THREE.Group();
  headGroup.name = "headGroup";
  headGroup.position.y = FPS_HEAD_VISUAL_HEIGHT;

  const skull = addMesh(headGroup, new THREE.SphereGeometry(0.24, 20, 14), darkMat, 0, 0.03, 0);
  skull.scale.set(0.96, 1, 0.98);
  const helmet = addMesh(headGroup, new THREE.SphereGeometry(0.275, 20, 14), material, 0, 0.08, 0.015);
  helmet.scale.set(1, 0.86, 1.02);
  addMesh(headGroup, new THREE.BoxGeometry(0.36, 0.11, 0.07), visorMat, 0, 0.03, -0.235, { skipOutline: true });
  addMesh(headGroup, new THREE.BoxGeometry(0.4, 0.05, 0.3), armorMat, 0, 0.12, -0.13, { rot: [0.18, 0, 0] });
  addMesh(headGroup, new THREE.BoxGeometry(0.2, 0.09, 0.1), armorMat, 0, -0.15, -0.16);
  addMesh(headGroup, new THREE.CylinderGeometry(0.05, 0.05, 0.09, 8), armorMat, -0.25, -0.01, 0, { rot: [0, 0, 1.571] });
  addMesh(headGroup, new THREE.CylinderGeometry(0.05, 0.05, 0.09, 8), armorMat, 0.25, -0.01, 0, { rot: [0, 0, 1.571] });
  addMesh(headGroup, new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), darkMat, 0.22, 0.22, 0.08, { rot: [0.1, 0, -0.15] });

  group.add(headGroup);

  const gunPart = new THREE.Group();
  gunPart.name = "gun";
  gunPart.position.set(0.32, -0.08, -0.3);
  gunPart.rotation.set(0.05, -0.1, 0.08);
  headGroup.add(gunPart);
  rig.gun = gunPart;

  const meleePart = new THREE.Group();
  meleePart.name = "melee";
  meleePart.position.set(0.05, 0.08, -0.16);
  meleePart.rotation.set(0.35, -0.25, -0.5);
  meleePart.visible = false;
  headGroup.add(meleePart);

  // ---- Enemy visibility outline ----
  // A subtle team-coloured rim, hidden by default and toggled on by the combat
  // loop only while the enemy is on screen (see player-outline.js).
  buildPlayerOutline(group, material.color?.getHex?.() ?? 0xffffff);

  return group;
}
