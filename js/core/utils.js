import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { wordsA, wordsB } from "./constants.js";
import { camera } from "./engine.js";

let audioContext = null;
let cachedNoiseBuffer = null;

export function ensureAudio() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
}

function noiseBuffer() {
  if (cachedNoiseBuffer) return cachedNoiseBuffer;
  const length = audioContext.sampleRate; // 1 second of white noise, looped
  cachedNoiseBuffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
  const data = cachedNoiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return cachedNoiseBuffer;
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

  // Frequency glide — sirens, pings, whooshes.
  const sweep = (fromFreq, toFreq, duration, gain, wave = "sine", delay = 0) => {
    const start = now + delay;
    const osc = audioContext.createOscillator();
    const amp = audioContext.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(Math.max(1, fromFreq), start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), start + duration);
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(amp).connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  };

  // Filtered white-noise burst — gunshot cracks, impacts, swishes.
  const noise = (duration, gain, freq = 2000, q = 0.9, delay = 0, filterType = "bandpass") => {
    const start = now + delay;
    const source = audioContext.createBufferSource();
    source.buffer = noiseBuffer();
    source.loop = true;
    const filter = audioContext.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, start);
    filter.Q.setValueAtTime(q, start);
    const amp = audioContext.createGain();
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter).connect(amp).connect(master);
    source.start(start);
    source.stop(start + duration + 0.02);
  };

  // Quick ascending/descending note runs for jingles.
  const arp = (frequencies, noteDuration, gain, wave = "triangle", gap = 0.085) => {
    frequencies.forEach((freq, index) => blip(freq, noteDuration, gain, wave, 0, index * gap));
  };

  if (type === "pistol") {
    master.gain.setValueAtTime(0.24, now);
    blip(220, 0.09, 0.8, "square");
    noise(0.06, 0.5, 3200, 0.7);
  } else if (type === "rifle") {
    master.gain.setValueAtTime(0.18, now);
    blip(180, 0.055, 0.7, "square");
    noise(0.05, 0.45, 2800, 0.7);
  } else if (type === "sniper") {
    master.gain.setValueAtTime(0.34, now);
    blip(110, 0.18, 0.95, "square");
    noise(0.16, 0.6, 1900, 0.6);
    noise(0.3, 0.2, 500, 0.5, 0.04);
  } else if (type === "heavySniper") {
    master.gain.setValueAtTime(0.46, now);
    blip(72, 0.26, 1.0, "square");
    noise(0.2, 0.7, 1500, 0.6);
    noise(0.42, 0.26, 380, 0.5, 0.05);
  } else if (type === "minigun") {
    master.gain.setValueAtTime(0.16, now);
    blip(150, 0.045, 0.52, "square");
    noise(0.035, 0.4, 3400, 0.8);
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
    noise(0.14, 0.75, 1300, 0.5);
  } else if (type === "rocket") {
    master.gain.setValueAtTime(0.3, now);
    blip(82, 0.24, 0.72, "sawtooth");
    noise(0.34, 0.4, 700, 0.4);
    sweep(420, 160, 0.3, 0.2, "triangle");
  } else if (type === "desertEagle") {
    master.gain.setValueAtTime(0.38, now);
    blip(140, 0.14, 0.95, "square");
    noise(0.1, 0.6, 2100, 0.6);
  } else if (type === "ak47") {
    master.gain.setValueAtTime(0.24, now);
    blip(140, 0.075, 0.8, "square");
    noise(0.06, 0.5, 2600, 0.7);
  } else if (type === "drumShotgun") {
    master.gain.setValueAtTime(0.34, now);
    blip(96, 0.18, 0.92, "square");
    noise(0.14, 0.75, 1100, 0.5);
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
    noise(0.5, 0.65, 320, 0.4, 0, "lowpass");
    noise(0.16, 0.45, 2400, 0.6);
  } else if (type === "jump") {
    master.gain.setValueAtTime(0.14, now);
    blip(320, 0.12, 0.34, "triangle", 180);
  } else if (type === "land") {
    master.gain.setValueAtTime(0.2, now);
    blip(74, 0.16, 0.65, "square");
  } else if (type === "slide") {
    master.gain.setValueAtTime(0.12, now);
    blip(210, 0.18, 0.24, "sawtooth", -220);
  } else if (type === "dash") {
    // Air-rip whoosh: fast downward sweep with a breathy noise tail.
    master.gain.setValueAtTime(0.2, now);
    sweep(900, 240, 0.16, 0.4, "sawtooth");
    noise(0.18, 0.3, 1500, 0.6, 0, "highpass");
  } else if (type === "grapple") {
    // Hook launch: sharp mechanical click, rising line whirr.
    master.gain.setValueAtTime(0.2, now);
    blip(2200, 0.03, 0.4, "square");
    sweep(320, 880, 0.22, 0.3, "triangle", 0.03);
    noise(0.2, 0.18, 2600, 1.2, 0.04);
  } else if (type === "katana") {
    // Blade swish: bright high-passed cut, faster and sharper than the club.
    master.gain.setValueAtTime(0.2, now);
    sweep(2400, 900, 0.12, 0.32, "sine");
    noise(0.1, 0.45, 5200, 1.6, 0, "highpass");
    noise(0.06, 0.25, 7600, 2.2, 0.02, "highpass");
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
    master.gain.setValueAtTime(0.22, now);
    arp([523.25, 659.25, 783.99, 1046.5], 0.16, 0.3, "triangle", 0.08);
    noise(0.2, 0.12, 5200, 1.2, 0.05);
  } else if (type === "ricochet") {
    // Metallic ping that drops in pitch as the orb loses energy.
    master.gain.setValueAtTime(0.2, now);
    sweep(2600, 1150, 0.16, 0.5, "sine");
    blip(3400, 0.04, 0.3, "triangle");
    noise(0.05, 0.35, 5600, 2.5);
  } else if (type === "bouncerShot") {
    // Energy orb launch: rising hum with a shimmer tail.
    master.gain.setValueAtTime(0.24, now);
    sweep(240, 760, 0.14, 0.6, "triangle");
    sweep(900, 1500, 0.18, 0.22, "sine", 0.03);
    noise(0.08, 0.2, 3000, 1.4);
  } else if (type === "golfBounce") {
    master.gain.setValueAtTime(0.2, now);
    blip(140, 0.09, 0.55, "sine");
    noise(0.045, 0.3, 1600, 0.8);
  } else if (type === "reloadStart") {
    // Magazine out: clack + slide.
    master.gain.setValueAtTime(0.2, now);
    noise(0.04, 0.5, 2400, 1.4);
    blip(310, 0.05, 0.3, "square", 0, 0.02);
    noise(0.1, 0.2, 900, 0.8, 0.08);
  } else if (type === "reloadEnd") {
    // Magazine in: chunk-chunk.
    master.gain.setValueAtTime(0.22, now);
    noise(0.04, 0.5, 1900, 1.4);
    blip(420, 0.05, 0.4, "square", 0, 0.01);
    blip(620, 0.06, 0.32, "square", 0, 0.09);
    noise(0.04, 0.4, 3000, 1.4, 0.09);
  } else if (type === "weaponSwap") {
    master.gain.setValueAtTime(0.18, now);
    noise(0.09, 0.4, 2200, 0.7);
    sweep(500, 900, 0.08, 0.25, "triangle", 0.02);
    blip(740, 0.04, 0.3, "square", 0, 0.1);
  } else if (type === "countdownTick") {
    master.gain.setValueAtTime(0.2, now);
    blip(880, 0.07, 0.5, "sine");
    blip(1760, 0.03, 0.12, "sine");
  } else if (type === "countdownGo") {
    master.gain.setValueAtTime(0.26, now);
    sweep(660, 1320, 0.16, 0.55, "triangle");
    blip(1320, 0.22, 0.3, "sine", 0, 0.1);
  } else if (type === "roundWin") {
    master.gain.setValueAtTime(0.24, now);
    arp([523.25, 659.25, 783.99], 0.18, 0.35, "triangle", 0.09);
    noise(0.25, 0.1, 4800, 1.0, 0.1);
  } else if (type === "roundLose") {
    master.gain.setValueAtTime(0.2, now);
    arp([392, 329.63, 261.63], 0.22, 0.3, "triangle", 0.11);
  } else if (type === "matchWin") {
    master.gain.setValueAtTime(0.26, now);
    arp([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.24, 0.34, "triangle", 0.11);
    arp([261.63, 329.63, 392, 523.25, 659.25], 0.3, 0.18, "sine", 0.11);
    noise(0.5, 0.1, 5200, 1.0, 0.3);
  } else if (type === "matchLose") {
    master.gain.setValueAtTime(0.22, now);
    arp([440, 392, 329.63, 261.63], 0.3, 0.3, "triangle", 0.16);
    blip(130.81, 0.7, 0.2, "sine", 0, 0.5);
  } else if (type === "uiClick") {
    master.gain.setValueAtTime(0.1, now);
    blip(1500, 0.03, 0.4, "sine");
    noise(0.02, 0.2, 4000, 1.5);
  }
}

let lobbyMusic = null;

// Quiet generative pad loop for the menu and lobby. Pure WebAudio — no
// assets — so it costs nothing on a static host.
export function startLobbyMusic() {
  if (!audioContext || lobbyMusic) return;
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.linearRampToValueAtTime(0.05, audioContext.currentTime + 2.5);
  gain.connect(audioContext.destination);
  // Am7 — Fmaj7 — Cmaj7 — G6 in a slow drift.
  const chords = [
    [220, 261.63, 329.63, 392],
    [174.61, 220, 261.63, 329.63],
    [130.81, 196, 246.94, 329.63],
    [196, 246.94, 293.66, 329.63]
  ];
  let step = 0;
  const playChord = () => {
    if (!audioContext || !lobbyMusic) return;
    const notes = chords[step % chords.length];
    step++;
    const t = audioContext.currentTime;
    notes.forEach((freq, index) => {
      const osc = audioContext.createOscillator();
      const amp = audioContext.createGain();
      osc.type = index === notes.length - 1 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, t);
      osc.detune.setValueAtTime((Math.random() - 0.5) * 8, t);
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.linearRampToValueAtTime(index === 0 ? 0.3 : 0.18, t + 1.6);
      amp.gain.linearRampToValueAtTime(0.0001, t + 5.2);
      osc.connect(amp).connect(gain);
      osc.start(t);
      osc.stop(t + 5.4);
    });
  };
  lobbyMusic = { gain, interval: null };
  playChord();
  lobbyMusic.interval = setInterval(playChord, 5000);
}

export function stopLobbyMusic() {
  if (!lobbyMusic) return;
  clearInterval(lobbyMusic.interval);
  const fading = lobbyMusic.gain;
  lobbyMusic = null;
  if (audioContext) {
    const t = audioContext.currentTime;
    fading.gain.cancelScheduledValues(t);
    fading.gain.setValueAtTime(fading.gain.value, t);
    fading.gain.linearRampToValueAtTime(0.0001, t + 0.8);
  }
  setTimeout(() => { try { fading.disconnect(); } catch { /* already gone */ } }, 1200);
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
