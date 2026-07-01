// Menu background: a Sin City / Batman-noir frame. Pure black night, a moon
// rendered as a ben-day halftone dot field, hard diagonal rain, a black city
// skyline, one blood-red ink slash of spot colour, and film grain over it all.
// No cartoon elements — high-contrast ink, dotted structure, single red accent.
import { game } from "../core/state.js";

const INK = "#050506";
const RED = "#d1050b";

const canvas = document.getElementById("menuBg");
const ctx = canvas ? canvas.getContext("2d") : null;

// Offscreen halftone (moon) + grain tile — rebuilt on resize, cheap to blit.
const halftone = document.createElement("canvas");
const htx = halftone.getContext("2d");
const grain = document.createElement("canvas");
const gtx = grain.getContext("2d");

const state = {
  t: 0,
  rain: [],
  splashes: [],
  w: 0,
  h: 0,
  moon: { x: 0, y: 0, r: 0 },
  skyline: null,
  slash: 0.9
};

function buildGrain() {
  const s = 140;
  grain.width = s; grain.height = s;
  const img = gtx.createImageData(s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = Math.random() < 0.5 ? 22 : 0;
  }
  gtx.putImageData(img, 0, 0);
}

// Ben-day halftone moon: white dots whose radius grows with a radial light
// field, so the "glow" is built from ink dots rather than a smooth gradient.
function buildHalftone(w, h) {
  halftone.width = w;
  halftone.height = h;
  htx.clearRect(0, 0, w, h);
  const mx = w * 0.72, my = h * 0.30, glow = Math.min(w, h) * 0.62;
  state.moon = { x: mx, y: my, r: Math.min(w, h) * 0.12 };
  const grid = 9;
  const maxR = grid * 0.62;
  for (let gy = 0; gy < h + grid; gy += grid) {
    for (let gx = 0; gx < w + grid; gx += grid) {
      const d = Math.hypot(gx - mx, gy - my);
      // light falls off with distance; also fade toward the bottom foreground
      let t = 1 - d / glow;
      t *= 1 - Math.min(1, (gy / h) * 0.7);
      if (t <= 0.02) continue;
      const r = Math.min(maxR, t * maxR * 1.9);
      if (r < 0.35) continue;
      htx.beginPath();
      htx.arc(gx, gy, r, 0, Math.PI * 2);
      htx.fillStyle = `rgba(232,231,223,${0.16 + t * 0.5})`;
      htx.fill();
    }
  }
  // solid moon core so the halftone reads as a light source
  const mg = htx.createRadialGradient(mx, my, 0, mx, my, state.moon.r);
  mg.addColorStop(0, "rgba(240,239,233,0.92)");
  mg.addColorStop(0.7, "rgba(240,239,233,0.5)");
  mg.addColorStop(1, "rgba(240,239,233,0)");
  htx.fillStyle = mg;
  htx.beginPath();
  htx.arc(mx, my, state.moon.r * 1.6, 0, Math.PI * 2);
  htx.fill();
}

// A jagged black skyline built once per size, drawn as a hard silhouette.
function buildSkyline(w, h) {
  const base = h * 0.66;
  const buildings = [];
  let x = -40;
  let seed = 1337;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  while (x < w + 60) {
    const bw = 40 + rnd() * 120;
    const bh = 60 + rnd() * (h * 0.42);
    buildings.push({ x, w: bw, top: base - bh + rnd() * 40, base });
    x += bw + 4 + rnd() * 22;
  }
  state.skyline = { buildings, base };
}

function fit() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    buildHalftone(w, h);
    buildSkyline(w, h);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.w = w; state.h = h;
  return { w, h };
}

function spawnRain(w, h, n) {
  for (let i = 0; i < n; i++) {
    state.rain.push({
      x: Math.random() * (w + 200) - 100,
      y: Math.random() * -h,
      len: 26 + Math.random() * 42,
      spd: 900 + Math.random() * 700,
      red: Math.random() < 0.05
    });
  }
}

buildGrain();

let last = performance.now();
let wasActive = false;

function frame(now) {
  requestAnimationFrame(frame);
  if (!ctx) return;
  const active = game.phase === "menu" || game.phase === "lobby";
  if (!active) {
    if (wasActive) canvas.classList.remove("active");
    wasActive = false;
    last = now;
    return;
  }
  if (!wasActive) canvas.classList.add("active");
  wasActive = true;

  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const { w, h } = fit();
  state.t += dt;
  if (state.rain.length < 220) spawnRain(w, h, 220 - state.rain.length);

  // --- night base ---
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);

  // --- halftone moon glow (blitted offscreen buffer) ---
  ctx.drawImage(halftone, 0, 0, w, h);

  // --- red ink slash: one diagonal spot-colour gash across the frame ---
  const flick = 0.82 + Math.sin(state.t * 1.7) * 0.06 + (Math.random() < 0.02 ? 0.12 : 0);
  ctx.save();
  ctx.globalAlpha = flick;
  ctx.translate(w * 0.5, h * 0.52);
  ctx.rotate(-0.42);
  ctx.fillStyle = RED;
  ctx.beginPath();
  const sw = Math.hypot(w, h);
  ctx.moveTo(-sw, -h * 0.03);
  ctx.lineTo(sw, -h * 0.10);
  ctx.lineTo(sw, -h * 0.028);
  ctx.lineTo(-sw, h * 0.02);
  ctx.closePath();
  ctx.fill();
  // torn edge speckle
  ctx.fillStyle = RED;
  for (let i = 0; i < 40; i++) {
    const px = -sw + Math.random() * sw * 2;
    ctx.globalAlpha = flick * (0.3 + Math.random() * 0.5);
    ctx.fillRect(px, -h * 0.11 - Math.random() * 22, 2 + Math.random() * 8, 2 + Math.random() * 8);
  }
  ctx.restore();

  // --- city skyline silhouette ---
  const sk = state.skyline;
  if (sk) {
    ctx.fillStyle = INK;
    for (const b of sk.buildings) {
      ctx.fillRect(b.x, b.top, b.w, b.base - b.top + 4);
    }
    ctx.fillRect(0, sk.base, w, h - sk.base);
    // a scatter of lit windows (dim white, a few red)
    let seed = 909;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (const b of sk.buildings) {
      const cols = Math.max(1, Math.floor(b.w / 16));
      const rows = Math.max(1, Math.floor((b.base - b.top) / 20));
      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
          if (rnd() < 0.82) continue;
          const wx = b.x + 5 + cx * 16;
          const wy = b.top + 8 + cy * 20;
          if (wy > b.base - 6) continue;
          const red = rnd() < 0.12;
          const tw = 0.4 + 0.6 * Math.abs(Math.sin(state.t * 1.3 + wx * 0.05 + wy));
          ctx.fillStyle = red ? `rgba(209,5,11,${0.5 * tw})` : `rgba(232,231,223,${0.32 * tw})`;
          ctx.fillRect(wx, wy, 4, 6);
        }
      }
    }
  }

  // --- rain streaks (hard diagonal) ---
  const vx = -220; // wind
  ctx.lineCap = "butt";
  for (let i = state.rain.length - 1; i >= 0; i--) {
    const d = state.rain[i];
    d.y += d.spd * dt;
    d.x += vx * dt;
    if (d.y - d.len > h || d.x < -140) {
      d.x = Math.random() * (w + 200) - 100;
      d.y = -Math.random() * 120;
      continue;
    }
    const dx = (vx / d.spd) * d.len;
    ctx.strokeStyle = d.red ? "rgba(209,5,11,0.7)" : "rgba(232,231,223,0.5)";
    ctx.lineWidth = d.red ? 1.8 : 1.2;
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x - dx, d.y - d.len);
    ctx.stroke();
  }

  // --- vignette to push the corners into ink ---
  const vg = ctx.createRadialGradient(w * 0.5, h * 0.42, Math.min(w, h) * 0.25, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.82)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  // --- film grain (tiled noise, random offset each frame) ---
  ctx.globalAlpha = 0.6;
  const gx = -Math.random() * grain.width;
  const gy = -Math.random() * grain.height;
  for (let y = gy; y < h; y += grain.height) {
    for (let x = gx; x < w; x += grain.width) {
      ctx.drawImage(grain, x, y);
    }
  }
  ctx.globalAlpha = 1;
}

requestAnimationFrame(frame);
