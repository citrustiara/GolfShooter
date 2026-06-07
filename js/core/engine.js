import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

export const canvas = document.querySelector("#game");
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const comicVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const comicFragmentShader = `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 resolution;
uniform float time;
uniform float grayscale;
uniform float inkStrength;
uniform float colorSteps;
varying vec2 vUv;

float luma(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

float grain(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
  vec2 texel = 1.0 / max(resolution, vec2(1.0));
  vec3 raw = texture2D(tDiffuse, vUv).rgb;
  float center = luma(raw);

  float left = luma(texture2D(tDiffuse, vUv + vec2(-texel.x, 0.0)).rgb);
  float right = luma(texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb);
  float up = luma(texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb);
  float down = luma(texture2D(tDiffuse, vUv + vec2(0.0, -texel.y)).rgb);
  float diagA = luma(texture2D(tDiffuse, vUv + texel * vec2(1.0, 1.0)).rgb);
  float diagB = luma(texture2D(tDiffuse, vUv + texel * vec2(-1.0, -1.0)).rgb);
  float edge = abs(left - right) + abs(up - down) + abs(diagA - diagB) * 0.55;
  edge = smoothstep(0.10, 0.38, edge * 1.85) * inkStrength;

  float steps = max(2.0, colorSteps);
  vec3 boosted = clamp(raw * 1.30 + 0.07, 0.0, 1.0);
  vec3 poster = floor(boosted * steps) / steps;
  float posterLuma = luma(poster);
  poster = mix(vec3(posterLuma), poster, 1.10);

  vec2 grid = vUv * resolution / 7.5;
  vec2 cell = fract(grid) - 0.5;
  float shadowDots = (1.0 - smoothstep(0.20, 0.48, length(cell))) * (1.0 - smoothstep(0.18, 0.76, center));
  float hatch = smoothstep(0.46, 0.50, abs(fract((vUv.x + vUv.y) * resolution.x * 0.038) - 0.5)) * (1.0 - smoothstep(0.16, 0.64, center));
  vec3 comic = poster - shadowDots * 0.052 * inkStrength - hatch * 0.024 * inkStrength;
  comic = mix(clamp(raw * 1.18 + 0.08, 0.0, 1.0), comic, 0.68);

  float monoValue = floor(clamp(center * 1.28 + 0.12, 0.0, 1.0) * 5.0) / 5.0;
  vec3 mono = vec3(monoValue);
  comic = mix(comic, mono, clamp(grayscale, 0.0, 1.0));
  comic *= 1.0 - edge * 0.40;

  float vignette = 1.0 - smoothstep(0.34, 0.82, distance(vUv, vec2(0.5))) * (0.055 + grayscale * 0.045);
  comic *= vignette;
  comic = comic * (1.14 + grayscale * 0.10) + (0.045 + grayscale * 0.035);
  comic += (grain(vUv * resolution + time * 31.0) - 0.5) * (0.009 + grayscale * 0.02);

  gl_FragColor = vec4(clamp(comic, 0.0, 1.0), 1.0);
}
`;

const comicUniforms = {
  tDiffuse: { value: null },
  resolution: { value: new THREE.Vector2(1, 1) },
  time: { value: 0 },
  grayscale: { value: 0 },
  inkStrength: { value: 0.42 },
  colorSteps: { value: 5 }
};
const comicRenderTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, stencilBuffer: false });
comicRenderTarget.texture.name = "ComicPostProcessTexture";
const comicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const comicScene = new THREE.Scene();
const comicMaterial = new THREE.ShaderMaterial({
  uniforms: comicUniforms,
  vertexShader: comicVertexShader,
  fragmentShader: comicFragmentShader,
  depthTest: false,
  depthWrite: false
});
comicMaterial.toneMapped = false;
const comicQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), comicMaterial);
comicQuad.frustumCulled = false;
comicScene.add(comicQuad);
const comicBufferSize = new THREE.Vector2();

function syncComicRenderTarget() {
  renderer.getDrawingBufferSize(comicBufferSize);
  const width = Math.max(1, Math.floor(comicBufferSize.x || window.innerWidth || 1));
  const height = Math.max(1, Math.floor(comicBufferSize.y || window.innerHeight || 1));
  if (comicRenderTarget.width !== width || comicRenderTarget.height !== height) {
    comicRenderTarget.setSize(width, height);
  }
  comicUniforms.resolution.value.set(width, height);
}

export function renderScene(timeSeconds = 0, options = {}) {
  syncComicRenderTarget();
  comicUniforms.time.value = timeSeconds;
  comicUniforms.grayscale.value = options.grayscale ?? 0;
  comicUniforms.inkStrength.value = options.inkStrength ?? 0.42;
  comicUniforms.colorSteps.value = options.colorSteps ?? 5;

  renderer.setRenderTarget(comicRenderTarget);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);

  comicUniforms.tDiffuse.value = comicRenderTarget.texture;
  renderer.render(comicScene, comicCamera);
}

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
