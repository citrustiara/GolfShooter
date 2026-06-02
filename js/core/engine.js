import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

export const canvas = document.querySelector("#game");
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3f4);
scene.fog = new THREE.Fog(0x8fd3f4, 32, 84);

export const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 240);
export const clock = new THREE.Clock();
export const raycaster = new THREE.Raycaster();
export const lights = {
  hemi: null,
  sun: null
};

export const materials = {
  green: new THREE.MeshStandardMaterial({ color: 0x55b96f, roughness: 0.76 }),
  greenDark: new THREE.MeshStandardMaterial({ color: 0x2f8f56, roughness: 0.82 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xf4f0df, roughness: 0.58 }),
  cup: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf8f6ee, roughness: 0.38 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x4aa3ff, roughness: 0.46 }),
  coral: new THREE.MeshStandardMaterial({ color: 0xff6f61, roughness: 0.46 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.34, emissive: 0x332200 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x9fb5c3, metalness: 0.2, roughness: 0.36 }),
  floor: new THREE.MeshStandardMaterial({ color: 0x2d3940, roughness: 0.88 }),
  laser: new THREE.LineBasicMaterial({ color: 0xfff0a6, transparent: true, opacity: 1 }),
  lava: new THREE.MeshStandardMaterial({
    color: 0xff2200,
    emissive: 0xff0500,
    emissiveIntensity: 1.8,
    roughness: 0.96,
    metalness: 0.1
  })
};

export function setupLighting() {
  const hemi = new THREE.HemisphereLight(0xdff8ff, 0x426a42, 1.8);
  lights.hemi = hemi;
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  lights.sun = sun;
  sun.position.set(10, 18, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0005;
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  scene.add(sun);
}

export function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
