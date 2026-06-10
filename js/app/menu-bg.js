// Menu background: a 2D cartoon stand-off. Two oversized guns volley a golf
// ball back and forth across a loud striped backdrop — muzzle starbursts,
// shouted onomatopoeia, shell casings, confetti. Pure canvas, no 3D.
import { game } from "../core/state.js";

const PALETTE = {
  ink: "#0e0e11",
  paper: "#fffdf5",
  yellow: "#ffd60a",
  pink: "#ff3ea5",
  cyan: "#21d0ff",
  lime: "#6bf178",
  orange: "#ff8a00",
  purple: "#7c4dff",
  red: "#ff3b30",
  bgA: "#2a1551",
  bgB: "#1c0f38"
};

const canvas = document.getElementById("menuBg");
const ctx = canvas ? canvas.getContext("2d") : null;

const WORDS = ["BANG!", "POW!", "FORE!", "WHAM!", "BIRDIE!", "BLAM!"];

const state = {
  t: 0,
  dir: 1,              // 1: ball travels left -> right, -1: right -> left
  mode: "hold",        // "hold" | "flight"
  modeTimer: 0.6,
  flightDur: 1.05,
  shake: 0,
  recoilL: 0,
  recoilR: 0,
  flashes: [],         // {x, y, dir, life}
  words: [],           // {x, y, text, life, rot, color}
  shells: [],          // {x, y, vx, vy, rot, vr, life}
  trail: [],
  confetti: [],
  spin: 0
};

for (let i = 0; i < 30; i++) {
  state.confetti.push({
    x: Math.random(),
    y: Math.random(),
    s: 6 + Math.random() * 12,
    vy: 0.02 + Math.random() * 0.05,
    vx: -0.01 + Math.random() * 0.02,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 2.4,
    kind: Math.floor(Math.random() * 3),
    color: [PALETTE.yellow, PALETTE.pink, PALETTE.cyan, PALETTE.lime, PALETTE.orange][Math.floor(Math.random() * 5)]
  });
}

function fitCanvas() {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}

function inkPoly(pts, fill, lw = 4) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineJoin = "miter";
  ctx.strokeStyle = PALETTE.paper;
  ctx.lineWidth = lw + 5;
  ctx.stroke();
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function inkRect(x, y, w, h, fill, lw = 4) {
  inkPoly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], fill, lw);
}

function inkCircle(x, y, r, fill, lw = 4) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = PALETTE.paper;
  ctx.lineWidth = lw + 5;
  ctx.stroke();
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = lw;
  ctx.stroke();
}

// Comic pistol drawn facing +x. scale ~ 1 means ~340px long.
function drawPistol(x, y, s, recoil, flip) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -1 : 1, 1);
  ctx.rotate(-recoil * 0.22);
  ctx.translate(-recoil * 36, 0);
  ctx.scale(s, s);
  // grip
  inkPoly([[40, 30], [118, 30], [96, 158], [18, 148]], PALETTE.pink, 6);
  // grip plates
  inkPoly([[52, 52], [102, 52], [88, 132], [38, 124]], PALETTE.ink, 4);
  // frame
  inkRect(-10, -10, 190, 48, PALETTE.cyan, 6);
  // slide
  inkRect(-30, -64, 290, 60, PALETTE.paper, 6);
  // slide serrations
  ctx.fillStyle = PALETTE.ink;
  for (let i = 0; i < 4; i++) ctx.fillRect(-16 + i * 13, -56, 6, 44);
  // slide stripe
  inkRect(40, -44, 170, 18, PALETTE.yellow, 4);
  // barrel
  inkRect(260, -52, 64, 36, PALETTE.ink, 5);
  // front sight
  inkRect(296, -72, 16, 14, PALETTE.lime, 4);
  // trigger guard
  ctx.strokeStyle = PALETTE.paper;
  ctx.lineWidth = 16;
  ctx.strokeRect(120, 38, 56, 50);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 7;
  ctx.strokeRect(120, 38, 56, 50);
  // trigger
  inkRect(138, 44, 12, 30, PALETTE.orange, 4);
  ctx.restore();
}

// Comic revolver drawn facing +x (flip=true mirrors to face -x).
function drawRevolver(x, y, s, recoil, flip) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -1 : 1, 1);
  ctx.rotate(-recoil * 0.26);
  ctx.translate(-recoil * 36, 0);
  ctx.scale(s, s);
  // grip
  inkPoly([[-20, 26], [60, 32], [50, 150], [-44, 138]], PALETTE.orange, 6);
  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath(); ctx.arc(6, 88, 12, 0, Math.PI * 2); ctx.fill();
  // frame
  inkRect(-40, -38, 200, 70, PALETTE.purple, 6);
  // cylinder
  inkRect(36, -56, 96, 102, PALETTE.paper, 6);
  ctx.fillStyle = PALETTE.ink;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(84, -32 + i * 36, 11, 0, Math.PI * 2);
    ctx.fill();
  }
  // top strap
  inkRect(-20, -70, 220, 20, PALETTE.purple, 5);
  // barrel
  inkRect(150, -46, 170, 44, PALETTE.yellow, 6);
  inkRect(150, -16, 170, 14, PALETTE.ink, 4);
  // muzzle ring
  inkRect(308, -54, 22, 60, PALETTE.ink, 5);
  // front sight
  inkRect(300, -72, 14, 16, PALETTE.red, 4);
  // hammer
  inkPoly([[-44, -62], [-16, -54], [-26, -24], [-56, -34]], PALETTE.ink, 5);
  // trigger guard
  ctx.strokeStyle = PALETTE.paper;
  ctx.lineWidth = 16;
  ctx.strokeRect(60, 40, 54, 46);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 7;
  ctx.strokeRect(60, 40, 54, 46);
  inkRect(78, 46, 12, 28, PALETTE.cyan, 4);
  ctx.restore();
}

function drawStarburst(x, y, r, rot, colorOuter, colorInner) {
  const spikes = 10;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = colorOuter;
  ctx.fill();
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const rr = (i % 2 === 0 ? r : r * 0.45) * 0.55;
    const a = (i / (spikes * 2)) * Math.PI * 2 + 0.3;
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = colorInner;
  ctx.fill();
  ctx.restore();
}

function drawWord(w, size) {
  ctx.save();
  ctx.translate(w.x, w.y);
  ctx.rotate(w.rot);
  const scale = 1 + (1 - Math.min(1, w.life / 0.25)) * 0; // pop handled below
  const pop = w.life > 0.55 ? 1 + (0.7 - w.life) * 3 : 1;
  ctx.scale(pop * scale, pop * scale);
  ctx.font = `900 ${size}px "Archivo Black", "Arial Black", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = size * 0.28;
  ctx.strokeText(w.text, 0, 0);
  ctx.fillStyle = w.color;
  ctx.fillText(w.text, 0, 0);
  ctx.restore();
}

function ballPos(w, h, t, dir) {
  const y0 = h * 0.56;
  const xa = w * 0.205, xb = w * 0.795;
  const from = dir === 1 ? xa : xb;
  const to = dir === 1 ? xb : xa;
  const x = from + (to - from) * t;
  const y = y0 - Math.sin(t * Math.PI) * h * 0.17;
  return { x, y };
}

function fire(w, h, dir) {
  // dir is the NEW flight direction; flash at the firing gun's muzzle
  const p = ballPos(w, h, 0, dir);
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  state.flashes.push({ x: p.x, y: p.y, life: 0.22, max: 0.22, rot: Math.random() * Math.PI });
  state.words.push({
    x: p.x + (dir === 1 ? 60 : -60),
    y: p.y - 110 - Math.random() * 40,
    text: word,
    life: 0.7,
    rot: (Math.random() - 0.5) * 0.3,
    color: [PALETTE.yellow, PALETTE.pink, PALETTE.cyan, PALETTE.lime][Math.floor(Math.random() * 4)]
  });
  for (let i = 0; i < 3; i++) {
    state.shells.push({
      x: p.x - dir * 30,
      y: p.y - 20,
      vx: -dir * (120 + Math.random() * 160),
      vy: -(260 + Math.random() * 200),
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 18,
      life: 1.4
    });
  }
  if (dir === 1) state.recoilL = 1; else state.recoilR = 1;
  state.shake = 1;
}

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
  const dims = fitCanvas();
  const w = dims.w, h = dims.h;
  state.t += dt;
  state.spin += dt * 7;

  // --- ball state machine ---
  state.modeTimer -= dt;
  let flightT = 0;
  if (state.mode === "flight") {
    flightT = 1 - Math.max(0, state.modeTimer) / state.flightDur;
    if (state.modeTimer <= 0) {
      state.mode = "hold";
      state.modeTimer = 0.5;
    }
  } else if (state.modeTimer <= 0) {
    state.dir = -state.dir;
    state.mode = "flight";
    state.modeTimer = state.flightDur;
    fire(w, h, state.dir);
  }
  const bp = state.mode === "flight"
    ? ballPos(w, h, flightT, state.dir)
    : ballPos(w, h, 1, -state.dir);

  state.recoilL = Math.max(0, state.recoilL - dt * 4);
  state.recoilR = Math.max(0, state.recoilR - dt * 4);
  state.shake = Math.max(0, state.shake - dt * 5);

  // --- backdrop ---
  ctx.save();
  const shakeAmt = state.shake * 7;
  ctx.translate((Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt);

  ctx.fillStyle = PALETTE.bgB;
  ctx.fillRect(-20, -20, w + 40, h + 40);
  // scrolling diagonal stripes
  ctx.save();
  ctx.rotate(-0.22);
  const stripeW = 110;
  const off = (state.t * 40) % (stripeW * 2);
  ctx.fillStyle = PALETTE.bgA;
  for (let x = -stripeW * 4 + off; x < w * 1.5; x += stripeW * 2) {
    ctx.fillRect(x, -h, stripeW, h * 3);
  }
  ctx.restore();
  // halftone dots
  ctx.fillStyle = "rgba(255,253,245,0.07)";
  const grid = 34;
  const driftX = (state.t * 12) % grid, driftY = (state.t * 8) % grid;
  for (let gx = -grid; gx < w + grid; gx += grid) {
    for (let gy = -grid; gy < h + grid; gy += grid) {
      ctx.beginPath();
      ctx.arc(gx + driftX, gy + driftY, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // big sun ring behind center
  ctx.strokeStyle = "rgba(255,214,10,0.16)";
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.5, Math.min(w, h) * 0.32 + Math.sin(state.t * 1.4) * 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,62,165,0.13)";
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.5, Math.min(w, h) * 0.40 - Math.sin(state.t * 1.4) * 8, 0, Math.PI * 2);
  ctx.stroke();

  // ground strip
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(-20, h * 0.78, w + 40, h);
  ctx.fillStyle = PALETTE.lime;
  ctx.fillRect(-20, h * 0.78, w + 40, 10);
  // checker band on the ground
  const cs = 42;
  const checkOff = (state.t * 60) % (cs * 2);
  ctx.fillStyle = "rgba(255,253,245,0.10)";
  for (let x = -cs * 2 + checkOff; x < w + cs; x += cs * 2) {
    ctx.fillRect(x, h * 0.78 + 26, cs, cs * 0.6);
    ctx.fillRect(x + cs, h * 0.78 + 26 + cs * 0.6, cs, cs * 0.6);
  }

  // --- confetti ---
  for (const c of state.confetti) {
    c.y += c.vy * dt;
    c.x += c.vx * dt;
    c.rot += c.vr * dt;
    if (c.y > 1.05) { c.y = -0.05; c.x = Math.random(); }
    if (c.x > 1.05) c.x = -0.05;
    if (c.x < -0.05) c.x = 1.05;
    ctx.save();
    ctx.translate(c.x * w, c.y * h);
    ctx.rotate(c.rot);
    ctx.fillStyle = c.color;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 2;
    if (c.kind === 0) {
      ctx.fillRect(-c.s / 2, -c.s / 4, c.s, c.s / 2);
      ctx.strokeRect(-c.s / 2, -c.s / 4, c.s, c.s / 2);
    } else if (c.kind === 1) {
      ctx.beginPath();
      ctx.moveTo(0, -c.s / 2); ctx.lineTo(c.s / 2, c.s / 2); ctx.lineTo(-c.s / 2, c.s / 2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, c.s / 2.4, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // --- guns ---
  const gunScale = Math.max(0.5, Math.min(1, w / 1500));
  const gunY = h * 0.56;
  drawPistol(w * 0.06, gunY, gunScale, state.recoilL, false);
  drawRevolver(w * 0.94, gunY, gunScale, state.recoilR, true);

  // --- ball trail ---
  if (state.mode === "flight") {
    state.trail.push({ x: bp.x, y: bp.y, life: 0.36 });
  }
  for (let i = state.trail.length - 1; i >= 0; i--) {
    const tr = state.trail[i];
    tr.life -= dt;
    if (tr.life <= 0) { state.trail.splice(i, 1); continue; }
    const a = tr.life / 0.36;
    ctx.fillStyle = `rgba(255,253,245,${0.34 * a})`;
    ctx.beginPath();
    ctx.arc(tr.x, tr.y, 16 * a + 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // speed lines behind the ball during flight
  if (state.mode === "flight" && flightT > 0.06) {
    ctx.strokeStyle = "rgba(255,253,245,0.5)";
    ctx.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      const lenLine = 50 + i * 26;
      const oy = (i - 1) * 16;
      ctx.beginPath();
      ctx.moveTo(bp.x - state.dir * (30 + i * 8), bp.y + oy);
      ctx.lineTo(bp.x - state.dir * (30 + i * 8 + lenLine), bp.y + oy);
      ctx.stroke();
    }
  }

  // --- golf ball ---
  const squash = state.mode === "flight" && flightT < 0.12 ? 1 - (0.12 - flightT) * 2.2 : 1;
  const br = Math.max(26, Math.min(40, w * 0.024));
  ctx.save();
  ctx.translate(bp.x, bp.y);
  ctx.rotate(state.spin * state.dir);
  ctx.scale(1 / Math.max(0.7, squash), Math.max(0.7, squash));
  ctx.beginPath();
  ctx.arc(0, 0, br, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.paper;
  ctx.fill();
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 6;
  ctx.stroke();
  // dimples
  ctx.fillStyle = "rgba(14,14,17,0.22)";
  const dim = [[-0.4, -0.3], [0.2, -0.45], [0.45, 0.1], [-0.1, 0.2], [-0.45, 0.35], [0.15, 0.5]];
  for (const [dx, dy] of dim) {
    ctx.beginPath();
    ctx.arc(dx * br, dy * br, br * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }
  // angry eyes (tiny cartoon face, why not)
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(-br * 0.34, -br * 0.18, br * 0.2, br * 0.2);
  ctx.fillRect(br * 0.14, -br * 0.18, br * 0.2, br * 0.2);
  ctx.restore();

  // --- muzzle flashes ---
  for (let i = state.flashes.length - 1; i >= 0; i--) {
    const f = state.flashes[i];
    f.life -= dt;
    if (f.life <= 0) { state.flashes.splice(i, 1); continue; }
    const k = f.life / f.max;
    drawStarburst(f.x, f.y, 90 * (1.4 - k * 0.4), f.rot + (1 - k) * 0.6, PALETTE.yellow, PALETTE.paper);
  }

  // --- words ---
  for (let i = state.words.length - 1; i >= 0; i--) {
    const wd = state.words[i];
    wd.life -= dt;
    wd.y -= dt * 30;
    if (wd.life <= 0) { state.words.splice(i, 1); continue; }
    drawWord(wd, Math.max(40, Math.min(72, w * 0.045)));
  }

  // --- shells ---
  for (let i = state.shells.length - 1; i >= 0; i--) {
    const sh = state.shells[i];
    sh.life -= dt;
    if (sh.life <= 0) { state.shells.splice(i, 1); continue; }
    sh.vy += 900 * dt;
    sh.x += sh.vx * dt;
    sh.y += sh.vy * dt;
    sh.rot += sh.vr * dt;
    ctx.save();
    ctx.translate(sh.x, sh.y);
    ctx.rotate(sh.rot);
    ctx.fillStyle = PALETTE.orange;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 3;
    ctx.fillRect(-9, -5, 18, 10);
    ctx.strokeRect(-9, -5, 18, 10);
    ctx.restore();
  }

  ctx.restore();
}

requestAnimationFrame(frame);
