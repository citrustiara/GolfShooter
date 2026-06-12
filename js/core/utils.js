import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { wordsA, wordsB } from "./constants.js";
import { camera } from "./engine.js";

let audioContext = null;
let cachedNoiseBuffer = null;
let sfxMasterGain = null;
let gameAudioSilenced = false;

const TARGET_ELIMINATED_AUDIO_URL = new URL("../../assets/audio/low-honor-rdr-2.mp3", import.meta.url).href;
let targetEliminatedAudio = null;

function targetEliminatedAudioElement() {
  if (typeof Audio === "undefined") return null;
  if (!targetEliminatedAudio) {
    targetEliminatedAudio = new Audio(TARGET_ELIMINATED_AUDIO_URL);
    targetEliminatedAudio.preload = "auto";
  }
  return targetEliminatedAudio;
}

function preloadTargetEliminatedSound() {
  targetEliminatedAudioElement()?.load?.();
}

function stopTargetEliminatedSound() {
  if (!targetEliminatedAudio) return;
  try {
    targetEliminatedAudio.pause();
    targetEliminatedAudio.currentTime = 0;
  } catch {}
}

function ensureSfxMasterGain() {
  if (!audioContext) return null;
  if (!sfxMasterGain) {
    sfxMasterGain = audioContext.createGain();
    sfxMasterGain.gain.setValueAtTime(gameAudioSilenced ? 0.0001 : 1, audioContext.currentTime);
    sfxMasterGain.connect(audioContext.destination);
  }
  return sfxMasterGain;
}

function playTargetEliminatedSound(options = {}) {
  const volume = Math.max(0, Math.min(1, Number(options.volume ?? 1) || 0));
  if (volume <= 0) return;
  const audio = targetEliminatedAudioElement();
  if (!audio) return;
  try {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = volume;
    const playPromise = audio.play();
    playPromise?.catch?.(() => {});
  } catch {}
}

export function ensureAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    ensureSfxMasterGain();
    preloadTargetEliminatedSound();
  }
  if (audioContext.state === "suspended") audioContext.resume();
  ensureSfxMasterGain();
}

export function silenceGameAudio() {
  gameAudioSilenced = true;
  stopTargetEliminatedSound();
  const master = ensureSfxMasterGain();
  if (!audioContext || !master) return;
  const t = audioContext.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
  master.gain.linearRampToValueAtTime(0.0001, t + 0.035);
}

export function resumeGameAudio() {
  gameAudioSilenced = false;
  const master = ensureSfxMasterGain();
  if (!audioContext || !master) return;
  const t = audioContext.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
  master.gain.linearRampToValueAtTime(1, t + 0.08);
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
  if (gameAudioSilenced && type !== "targetEliminated") return;
  if (type === "targetEliminated") {
    playTargetEliminatedSound(options);
    return;
  }
  const now = audioContext.currentTime;
  const master = audioContext.createGain();
  const output = audioContext.createGain();
  const destination = ensureSfxMasterGain() || audioContext.destination;
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
    master.connect(panner).connect(output).connect(destination);
  } else {
    master.connect(output).connect(destination);
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

  const shotPitch = 1 + (Math.random() - 0.5) * 0.045;
  const shotFreq = (frequency) => Math.max(20, frequency * shotPitch);
  const gunTransient = (frequency = 4200, gain = 0.55, delay = 0) => {
    noise(0.026, gain, frequency, 1.1, delay, "bandpass");
    noise(0.018, gain * 0.28, frequency * 1.9, 1.7, delay + 0.006, "highpass");
  };

  if (type === "pistol") {
    master.gain.setValueAtTime(0.23, now);
    gunTransient(4300, 0.56);
    blip(shotFreq(178), 0.07, 0.64, "square", -100);
    noise(0.105, 0.18, 760, 0.55, 0.014, "lowpass");
    sweep(shotFreq(680), shotFreq(230), 0.06, 0.09, "triangle", 0.012);
  } else if (type === "rifle") {
    master.gain.setValueAtTime(0.18, now);
    gunTransient(5200, 0.5);
    blip(shotFreq(138), 0.046, 0.54, "square", -60);
    noise(0.074, 0.14, 980, 0.6, 0.01, "lowpass");
    sweep(shotFreq(900), shotFreq(360), 0.045, 0.07, "triangle", 0.006);
  } else if (type === "sniper") {
    master.gain.setValueAtTime(0.34, now);
    gunTransient(3600, 0.76);
    blip(shotFreq(86), 0.17, 0.88, "square", -80);
    blip(shotFreq(48), 0.22, 0.36, "triangle", 0, 0.035);
    noise(0.28, 0.32, 420, 0.5, 0.024, "lowpass");
    noise(0.18, 0.18, 1450, 0.7, 0.055);
  } else if (type === "heavySniper") {
    master.gain.setValueAtTime(0.44, now);
    gunTransient(3200, 0.84);
    blip(shotFreq(62), 0.26, 0.94, "square", -120);
    blip(shotFreq(38), 0.34, 0.5, "triangle", 0, 0.045);
    noise(0.42, 0.34, 330, 0.5, 0.035, "lowpass");
    noise(0.24, 0.22, 980, 0.65, 0.075);
  } else if (type === "minigun") {
    master.gain.setValueAtTime(0.145, now);
    gunTransient(5600, 0.42);
    blip(shotFreq(128), 0.036, 0.42, "square", -80);
    noise(0.052, 0.1, 880, 0.6, 0.007, "lowpass");
  } else if (type === "laser") {
    master.gain.setValueAtTime(0.15, now);
    sweep(shotFreq(860), shotFreq(1700), 0.055, 0.46, "sawtooth");
    blip(shotFreq(2450), 0.03, 0.2, "triangle", 0, 0.018);
    noise(0.035, 0.08, 6200, 1.6, 0.006, "highpass");
  } else if (type === "spermShooter") {
    master.gain.setValueAtTime(0.155, now);
    sweep(shotFreq(420), shotFreq(920), 0.06, 0.42, "triangle");
    blip(shotFreq(1160), 0.035, 0.2, "sine", 0, 0.018);
    noise(0.04, 0.06, 1800, 0.9, 0.004);
  } else if (type === "heavySpermShooter") {
    master.gain.setValueAtTime(0.195, now);
    sweep(shotFreq(310), shotFreq(760), 0.075, 0.48, "triangle");
    blip(shotFreq(980), 0.042, 0.24, "sine", 0, 0.022);
    noise(0.052, 0.07, 1500, 0.9, 0.006);
  } else if (type === "heaviestSpermShooter") {
    master.gain.setValueAtTime(0.235, now);
    sweep(shotFreq(230), shotFreq(560), 0.095, 0.58, "triangle");
    blip(shotFreq(740), 0.052, 0.3, "sine", 0, 0.025);
    noise(0.066, 0.08, 1200, 0.85, 0.008);
  } else if (type === "shotgun") {
    master.gain.setValueAtTime(0.34, now);
    gunTransient(3000, 0.66);
    blip(shotFreq(82), 0.16, 0.78, "square", -80);
    noise(0.13, 0.7, 1180, 0.52);
    noise(0.19, 0.26, 460, 0.55, 0.022, "lowpass");
  } else if (type === "rocket") {
    master.gain.setValueAtTime(0.3, now);
    blip(shotFreq(76), 0.24, 0.68, "sawtooth", -80);
    noise(0.24, 0.36, 520, 0.45, 0, "lowpass");
    sweep(shotFreq(460), shotFreq(145), 0.34, 0.22, "triangle");
    noise(0.18, 0.16, 1600, 0.8, 0.025);
  } else if (type === "desertEagle") {
    master.gain.setValueAtTime(0.36, now);
    gunTransient(3500, 0.78);
    blip(shotFreq(112), 0.14, 0.9, "square", -80);
    noise(0.16, 0.24, 540, 0.55, 0.02, "lowpass");
    sweep(shotFreq(620), shotFreq(210), 0.08, 0.1, "triangle", 0.012);
  } else if (type === "ak47") {
    master.gain.setValueAtTime(0.22, now);
    gunTransient(4800, 0.58);
    blip(shotFreq(132), 0.06, 0.64, "square", -70);
    noise(0.088, 0.16, 860, 0.62, 0.012, "lowpass");
    noise(0.044, 0.16, 2300, 0.75, 0.018);
  } else if (type === "drumShotgun") {
    master.gain.setValueAtTime(0.32, now);
    gunTransient(3100, 0.62);
    blip(shotFreq(88), 0.13, 0.7, "square", -70);
    noise(0.115, 0.62, 1050, 0.52);
    noise(0.16, 0.21, 430, 0.55, 0.02, "lowpass");
  } else if (type === "tacticalSniper") {
    master.gain.setValueAtTime(0.2, now);
    gunTransient(4400, 0.52);
    blip(shotFreq(154), 0.08, 0.5, "square", -60);
    noise(0.12, 0.14, 720, 0.55, 0.018, "lowpass");
    blip(shotFreq(680), 0.045, 0.18, "triangle", 0, 0.018);
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
    master.gain.setValueAtTime(0.065, now);
    sweep(260, 520, 0.11, 0.16, "triangle");
    noise(0.055, 0.08, 1200, 0.7, 0, "highpass");
  } else if (type === "land") {
    master.gain.setValueAtTime(0.08, now);
    blip(86, 0.09, 0.28, "triangle");
    noise(0.045, 0.09, 420, 0.8, 0, "lowpass");
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
  } else if (type === "parry") {
    // Metallic deflection: a hard spark transient plus a rising shimmer tail.
    master.gain.setValueAtTime(0.28, now);
    noise(0.035, 0.75, 7200, 2.4, 0, "highpass");
    blip(3100, 0.055, 0.48, "triangle");
    sweep(1200, 3600, 0.16, 0.32, "sine", 0.018);
    noise(0.12, 0.22, 4600, 1.8, 0.035, "bandpass");
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
