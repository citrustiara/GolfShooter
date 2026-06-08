import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { wordsA, wordsB } from "./constants.js";
import { camera } from "./engine.js";

let audioContext = null;

export function ensureAudio() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
}

export function playSound(type, options = {}) {
  if (!audioContext) return;
  if (typeof options === "number") options = { volume: options };
  const now = audioContext.currentTime;
  const master = audioContext.createGain();
  const output = audioContext.createGain();
  const volume = Math.max(0, Math.min(3, Number(options.volume ?? 1) || 0));
  let distanceGain = 1;
  let panValue = 0;
  if (options.position && Number.isFinite(options.position.x) && Number.isFinite(options.position.y) && Number.isFinite(options.position.z)) {
    const source = new THREE.Vector3(options.position.x, options.position.y, options.position.z);
    const toSource = source.clone().sub(camera.position);
    const distance = toSource.length();
    const minDistance = Math.max(0, Number(options.minDistance ?? 2) || 2);
    const maxDistance = Math.max(minDistance + 1, Number(options.maxDistance ?? 55) || 55);
    const falloff = Math.max(0, Math.min(1, (distance - minDistance) / (maxDistance - minDistance)));
    distanceGain = (1 - falloff) * (1 - falloff);
    if (distance > 0.001) {
      const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
      panValue = Math.max(-1, Math.min(1, toSource.normalize().dot(cameraRight) * 0.82));
    }
  }
  if (volume <= 0 || distanceGain <= 0.0001) return;
  output.gain.setValueAtTime(volume * distanceGain, now);
  if (audioContext.createStereoPanner) {
    const panner = audioContext.createStereoPanner();
    panner.pan.setValueAtTime(panValue, now);
    master.connect(panner).connect(output).connect(audioContext.destination);
  } else {
    master.connect(output).connect(audioContext.destination);
  }

  const blip = (frequency, duration, gain, wave = "sine", detune = 0, delay = 0) => {
    const start = now + delay;
    const osc = audioContext.createOscillator();
    const amp = audioContext.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(frequency, start);
    osc.detune.setValueAtTime(detune, start);
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(amp).connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  };

  if (type === "pistol") {
    master.gain.setValueAtTime(0.24, now);
    blip(220, 0.09, 0.8, "square");
    blip(880, 0.035, 0.18, "sawtooth");
  } else if (type === "rifle") {
    master.gain.setValueAtTime(0.18, now);
    blip(180, 0.055, 0.7, "square");
    blip(720, 0.028, 0.16, "sawtooth");
  } else if (type === "sniper") {
    master.gain.setValueAtTime(0.34, now);
    blip(110, 0.18, 0.95, "square");
    blip(1240, 0.06, 0.28, "sawtooth");
  } else if (type === "heavySniper") {
    master.gain.setValueAtTime(0.46, now);
    blip(72, 0.26, 1.0, "square");
    blip(1380, 0.08, 0.32, "sawtooth");
  } else if (type === "minigun") {
    master.gain.setValueAtTime(0.16, now);
    blip(150, 0.045, 0.52, "square");
    blip(620, 0.025, 0.12, "sawtooth");
  } else if (type === "laser") {
    master.gain.setValueAtTime(0.14, now);
    blip(980, 0.045, 0.65, "sawtooth");
    blip(1450, 0.03, 0.22, "triangle");
  } else if (type === "spermShooter") {
    master.gain.setValueAtTime(0.16, now);
    blip(520, 0.05, 0.6, "triangle");
    blip(980, 0.03, 0.25, "sine");
  } else if (type === "heavySpermShooter") {
    master.gain.setValueAtTime(0.20, now);
    blip(390, 0.07, 0.7, "triangle");
    blip(780, 0.04, 0.3, "sine");
  } else if (type === "heaviestSpermShooter") {
    master.gain.setValueAtTime(0.24, now);
    blip(280, 0.09, 0.8, "triangle");
    blip(560, 0.05, 0.4, "sine");
  } else if (type === "shotgun") {
    master.gain.setValueAtTime(0.34, now);
    blip(96, 0.18, 0.92, "square");
    blip(460, 0.08, 0.3, "sawtooth");
  } else if (type === "rocket") {
    master.gain.setValueAtTime(0.3, now);
    blip(82, 0.24, 0.72, "sawtooth");
    blip(220, 0.12, 0.22, "triangle");
  } else if (type === "desertEagle") {
    master.gain.setValueAtTime(0.38, now);
    blip(140, 0.14, 0.95, "square");
    blip(580, 0.05, 0.24, "sawtooth");
  } else if (type === "ak47") {
    master.gain.setValueAtTime(0.24, now);
    blip(140, 0.075, 0.8, "square");
    blip(560, 0.035, 0.2, "sawtooth");
  } else if (type === "drumShotgun") {
    master.gain.setValueAtTime(0.34, now);
    blip(96, 0.18, 0.92, "square");
    blip(460, 0.08, 0.3, "sawtooth");
  } else if (type === "tacticalSniper") {
    master.gain.setValueAtTime(0.12, now);
    blip(420, 0.05, 0.35, "sine");
    blip(180, 0.08, 0.15, "triangle");
  } else if (type === "hit") {
    master.gain.setValueAtTime(0.18, now);
    blip(1180, 0.06, 0.62, "triangle");
    blip(1540, 0.04, 0.36, "triangle");
  } else if (type === "damage") {
    master.gain.setValueAtTime(0.075, now);
    blip(1320, 0.035, 0.34, "triangle");
    blip(1760, 0.025, 0.18, "sine", 0, 0.018);
  } else if (type === "kill") {
    master.gain.setValueAtTime(0.34, now);
    blip(210, 0.16, 0.42, "square");
    blip(760, 0.14, 0.46, "triangle", 0, 0.05);
    blip(1160, 0.16, 0.36, "sawtooth", 0, 0.11);
    blip(1580, 0.22, 0.24, "sine", 0, 0.18);
  } else if (type === "hurt") {
    master.gain.setValueAtTime(0.28, now);
    blip(92, 0.22, 0.8, "sawtooth");
    blip(70, 0.28, 0.55, "square");
  } else if (type === "melee") {
    master.gain.setValueAtTime(0.2, now);
    blip(240, 0.1, 0.42, "sawtooth", -300);
    blip(520, 0.06, 0.26, "triangle");
  } else if (type === "grenade") {
    master.gain.setValueAtTime(0.22, now);
    blip(360, 0.14, 0.42, "triangle");
    blip(180, 0.16, 0.28, "square");
  } else if (type === "smoke") {
    master.gain.setValueAtTime(0.16, now);
    blip(190, 0.22, 0.24, "triangle", -260);
    blip(92, 0.38, 0.18, "sawtooth", -120, 0.04);
  } else if (type === "explosion") {
    master.gain.setValueAtTime(0.42, now);
    blip(64, 0.42, 1.0, "sawtooth");
    blip(38, 0.5, 0.7, "square");
  } else if (type === "jump") {
    master.gain.setValueAtTime(0.14, now);
    blip(320, 0.12, 0.34, "triangle", 180);
  } else if (type === "land") {
    master.gain.setValueAtTime(0.2, now);
    blip(74, 0.16, 0.65, "square");
  } else if (type === "slide") {
    master.gain.setValueAtTime(0.12, now);
    blip(210, 0.18, 0.24, "sawtooth", -220);
  } else if (type === "footstep" || type === "step") {
    const pitch = (Math.random() - 0.5) * 26;
    master.gain.setValueAtTime(0.18, now);
    blip(82, 0.065, 0.38, "triangle", pitch - 70);
    blip(132, 0.045, 0.16, "sine", pitch, 0.012);
  } else if (type === "golfHit") {
    master.gain.setValueAtTime(0.22, now);
    blip(760, 0.05, 0.42, "triangle");
    blip(180, 0.13, 0.28, "sine");
  } else if (type === "golfScore") {
    master.gain.setValueAtTime(0.2, now);
    blip(620, 0.12, 0.28, "triangle");
    blip(930, 0.16, 0.24, "triangle");
  }
}

export function generatePhrase() {
  const a = wordsA[Math.floor(Math.random() * wordsA.length)];
  const b = wordsB[Math.floor(Math.random() * wordsB.length)];
  const n = Math.floor(10 + Math.random() * 90);
  return `${a}-${b}-${n}`;
}

export function cleanPhrase(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

export function flatDistance(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

export function toScreen(position) {
  const projected = position.clone().project(camera);
  return {
    x: (projected.x * 0.5 + 0.5) * window.innerWidth,
    y: (-projected.y * 0.5 + 0.5) * window.innerHeight
  };
}

export function directionFromAngles(yaw, pitch) {
  return new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  );
}

export function lerpAngle(from, to, alpha) {
  let delta = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * alpha;
}

export function moveTowards(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}
