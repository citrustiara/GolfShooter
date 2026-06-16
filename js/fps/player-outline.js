import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

// Soft "sticker" outline used to keep enemies readable against busy maps. It is
// a single inverted-hull shell per body part (BackSide, scaled out a touch) in
// the player's OWN team colour. It is hidden by default and toggled per-frame by
// the combat loop only while the enemy is actually on screen — a quieter,
// box-free cousin of the sniper-scope highlight, just enough to make players pop.
const OUTLINE_SCALE = 1.07;

export function buildPlayerOutline(group, color) {
  // Lift the colour toward white slightly so even dark team palettes register as
  // a clean rim, but keep it the player's own hue so it reads as "their" colour.
  const tint = new THREE.Color(color ?? 0xffffff).lerp(new THREE.Color(0xffffff), 0.22);
  const material = new THREE.MeshBasicMaterial({
    color: tint,
    side: THREE.BackSide,
    toneMapped: false,
    depthWrite: false
  });

  // Collect targets first so we never traverse into the shells we are adding.
  const targets = [];
  group.traverse((child) => {
    if (child.isMesh && !child.userData.isPlayerOutline && !child.userData.skipOutline) targets.push(child);
  });

  const shells = [];
  for (const mesh of targets) {
    const shell = new THREE.Mesh(mesh.geometry, material);
    shell.scale.setScalar(OUTLINE_SCALE);
    shell.userData.isPlayerOutline = true;
    shell.castShadow = false;
    shell.receiveShadow = false;
    shell.renderOrder = (mesh.renderOrder || 0) - 1;
    shell.visible = false;
    mesh.add(shell);
    shells.push(shell);
  }

  const handle = { material, shells, visible: false, defaultColor: tint.clone() };
  group.userData.outline = handle;
  return handle;
}

export function setPlayerOutlineVisible(group, visible, color = null) {
  const handle = group?.userData?.outline;
  if (!handle) return;
  if (color !== null && color !== undefined) handle.material.color.set(color);
  else if (handle.defaultColor) handle.material.color.copy(handle.defaultColor);
  if (handle.visible === visible) return;
  handle.visible = visible;
  for (const shell of handle.shells) shell.visible = visible;
}
