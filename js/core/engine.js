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
uniform vec2 patternRes;
uniform float time;
uniform float grayscale;
uniform float desaturate;
uniform float inkStrength;
uniform float colorSteps;
uniform float contrast;
uniform float brightness;
uniform float redHighlight;
varying vec2 vUv;

float luma(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

float grain(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec3 sampleScene(vec2 uv) {
  vec3 c = texture2D(tDiffuse, uv).rgb;
  return clamp((c - 0.5) * contrast + 0.5 + brightness, 0.0, 1.0);
}

void main() {
  // Edge/halftone sampling runs off a fixed reference resolution (patternRes,
  // set from a 1080p-equivalent grid) instead of the real buffer size, so the
  // ink outlines are the same visual thickness on any display or browser zoom.
  vec2 texel = 1.0 / max(patternRes, vec2(1.0));
  vec3 source = texture2D(tDiffuse, vUv).rgb;
  vec3 raw = clamp((source - 0.5) * contrast + 0.5 + brightness, 0.0, 1.0);
  float center = luma(raw);

  // Thick two-ring ink pass: sample at 1px and 2px so silhouettes read as
  // bold cartoon outlines instead of faint hairlines.
  vec2 t1 = texel;
  vec2 t2 = texel * 2.0;
  float left = luma(sampleScene(vUv + vec2(-t1.x, 0.0)));
  float right = luma(sampleScene(vUv + vec2(t1.x, 0.0)));
  float up = luma(sampleScene(vUv + vec2(0.0, t1.y)));
  float down = luma(sampleScene(vUv + vec2(0.0, -t1.y)));
  float diagA = luma(sampleScene(vUv + t1 * vec2(1.0, 1.0)));
  float diagB = luma(sampleScene(vUv + t1 * vec2(-1.0, -1.0)));
  float left2 = luma(sampleScene(vUv + vec2(-t2.x, 0.0)));
  float right2 = luma(sampleScene(vUv + vec2(t2.x, 0.0)));
  float up2 = luma(sampleScene(vUv + vec2(0.0, t2.y)));
  float down2 = luma(sampleScene(vUv + vec2(0.0, -t2.y)));
  float edgeNear = abs(left - right) + abs(up - down) + abs(diagA - diagB) * 0.55;
  float edgeWide = abs(left2 - right2) + abs(up2 - down2);
  float edge = max(edgeNear * 2.15, edgeWide * 1.5);
  edge = smoothstep(0.044, 0.196, edge) * inkStrength;

  float steps = max(2.0, colorSteps);
  vec3 boosted = clamp(raw * 1.34 + 0.10, 0.0, 1.0);
  vec3 poster = floor(boosted * steps) / steps;
  float posterLuma = luma(poster);
  poster = mix(vec3(posterLuma), poster, 1.12);

  vec2 grid = vUv * patternRes / 7.5;
  vec2 cell = fract(grid) - 0.5;
  float shadowDots = (1.0 - smoothstep(0.20, 0.48, length(cell))) * (1.0 - smoothstep(0.22, 0.82, center));
  float hatch = smoothstep(0.46, 0.50, abs(fract((vUv.x + vUv.y) * patternRes.x * 0.038) - 0.5)) * (1.0 - smoothstep(0.20, 0.72, center));
  vec3 comic = poster - shadowDots * 0.044 * inkStrength - hatch * 0.021 * inkStrength;
  comic = mix(clamp(raw * 1.20 + 0.10, 0.0, 1.0), comic, 0.72);

  float monoMix = clamp(grayscale, 0.0, 1.0);
  float monoGate = smoothstep(0.72, 0.98, monoMix);
  float monoBase = clamp((center - 0.5) * (1.34 + monoMix * 1.25) + 0.60 + monoMix * 0.05, 0.0, 1.0);
  float monoPoster = floor(monoBase * 5.0) / 5.0;
  float hardBw = step(0.55, monoBase);
  vec3 mono = vec3(mix(monoPoster, hardBw, monoGate));
  comic = mix(comic, mono, monoMix);

  float shadowLift = (1.0 - smoothstep(0.12, 0.44, center)) * (1.0 - clamp(edge * 1.35, 0.0, 1.0)) * (1.0 - monoMix);
  comic = mix(comic, max(comic, vec3(0.28)), shadowLift * 0.48);
  comic *= 1.0 - edge * (0.56 + monoMix * 0.10);

  float vignette = 1.0 - smoothstep(0.34, 0.82, distance(vUv, vec2(0.5))) * (0.035 + monoMix * 0.035);
  comic *= vignette;
  comic = (comic - 0.5) * (1.10 + monoMix * 0.32) + 0.5;
  comic = comic * (1.10 + monoMix * 0.08) + (0.055 + monoMix * 0.035);
  comic = mix(comic, vec3(luma(comic)), desaturate);
  float redMask = smoothstep(0.18, 0.62, raw.r - max(raw.g, raw.b)) * smoothstep(0.34, 0.88, raw.r);
  comic = mix(comic, vec3(1.0, 0.025, 0.015), clamp(redHighlight * redMask, 0.0, 1.0));
  comic += (grain(vUv * patternRes + time * 31.0) - 0.5) * (0.008 + monoMix * 0.018);

  gl_FragColor = vec4(clamp(comic, 0.0, 1.0), 1.0);
}
`;

const comicUniforms = {
  tDiffuse: { value: null },
  resolution: { value: new THREE.Vector2(1, 1) },
  patternRes: { value: new THREE.Vector2(1920, 1080) },
  time: { value: 0 },
  grayscale: { value: 0 },
  desaturate: { value: 0 },
  inkStrength: { value: 0.58 },
  colorSteps: { value: 5 },
  contrast: { value: 1.16 },
  brightness: { value: 0.06 },
  redHighlight: { value: 0 }
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
  // Drive all screen-space comic patterns (ink edges, halftone dots, hatching,
  // grain) off a fixed 1080p-equivalent grid that only tracks aspect ratio, so
  // the look is independent of the real pixel count, devicePixelRatio and the
  // browser's page-zoom level.
  const aspect = width / Math.max(1, height);
  const refHeight = 1080;
  comicUniforms.patternRes.value.set(refHeight * aspect, refHeight);
}

export function renderScene(timeSeconds = 0, options = {}) {
  syncComicRenderTarget();
  comicUniforms.time.value = timeSeconds;
  comicUniforms.grayscale.value = options.grayscale ?? 0;
  comicUniforms.desaturate.value = options.desaturate ?? 0;
  comicUniforms.inkStrength.value = options.inkStrength ?? 0.58;
  comicUniforms.colorSteps.value = options.colorSteps ?? 5;
  comicUniforms.contrast.value = options.contrast ?? 1.16;
  comicUniforms.brightness.value = options.brightness ?? 0.06;
  comicUniforms.redHighlight.value = options.redHighlight ?? 0;

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
