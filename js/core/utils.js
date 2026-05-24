import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { wordsA, wordsB } from "./constants.js";
import { camera } from "./engine.js";

let audioContext = null;

export function ensureAudio() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
}

export function playSound(type) {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const master = audioContext.createGain();
  master.connect(audioContext.destination);

  const blip = (frequency, duration, gain, wave = "sine", detune = 0) => {
    const osc = audioContext.createOscillator();
    const amp = audioContext.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(frequency, now);
    osc.detune.setValueAtTime(detune, now);
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(amp).connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
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
  } else if (type === "shotgun") {
    master.gain.setValueAtTime(0.34, now);
    blip(96, 0.18, 0.92, "square");
    blip(460, 0.08, 0.3, "sawtooth");
  } else if (type === "rocket") {
    master.gain.setValueAtTime(0.3, now);
    blip(82, 0.24, 0.72, "sawtooth");
    blip(220, 0.12, 0.22, "triangle");
  } else if (type === "hit") {
    master.gain.setValueAtTime(0.18, now);
    blip(1180, 0.06, 0.62, "triangle");
    blip(1540, 0.04, 0.36, "triangle");
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
