import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { FPS_HEAD_VISUAL_HEIGHT } from "../core/constants.js";

export function makePlayerMesh(material) {
  const group = new THREE.Group();
  const armorMat = new THREE.MeshStandardMaterial({ color: 0x161d22, roughness: 0.45, metalness: 0.25 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x8ff7ff });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0d1114, roughness: 0.5, metalness: 0.45 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.94, 8, 18), material);
  body.position.y = 0.89;
  body.castShadow = true;

  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.6, 0.14), armorMat);
  chestPlate.position.set(0, 1.05, -0.3);
  chestPlate.castShadow = true;

  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.1, 0.22), darkMat);
  belt.position.set(0, 0.55, -0.05);

  const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), armorMat);
  shoulderL.position.set(-0.5, 1.25, -0.04);
  shoulderL.scale.set(1.15, 0.72, 0.9);
  const shoulderR = shoulderL.clone();
  shoulderR.position.x = 0.5;

  const headGroup = new THREE.Group();
  headGroup.name = "headGroup";
  headGroup.position.y = FPS_HEAD_VISUAL_HEIGHT;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 16), material);
  head.castShadow = true;

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), eyeMat);
  eyeL.position.set(-0.105, 0.04, -0.265);
  eyeL.scale.set(1.15, 0.82, 0.32);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.105;

  headGroup.add(head, eyeL, eyeR);

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.48, 12), armorMat);
  legL.position.set(-0.2, 0.3, 0);
  legL.castShadow = true;

  const legR = legL.clone();
  legR.position.x = 0.2;

  const footL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.24), darkMat);
  footL.position.set(-0.2, 0.04, -0.06);
  footL.castShadow = true;

  const footR = footL.clone();
  footR.position.x = 0.2;

  group.add(body, chestPlate, belt, shoulderL, shoulderR, headGroup, legL, legR, footL, footR);

  const gunPart = new THREE.Group();
  gunPart.name = "gun";
  gunPart.position.set(0.32, -0.08, -0.3);
  gunPart.rotation.set(0.05, -0.1, 0.08);
  headGroup.add(gunPart);

  const meleePart = new THREE.Group();
  meleePart.name = "melee";
  meleePart.position.set(0.05, 0.08, -0.16);
  meleePart.rotation.set(0.35, -0.25, -0.5);
  meleePart.visible = false;
  headGroup.add(meleePart);

  return group;
}
