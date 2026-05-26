const fs = require('fs');

const WEAPONS_PATH = '../assets/weapons/weapons.json';
const OUTPUT_PATH = '../assets/weapons/weapons.json';

const weaponsData = JSON.parse(fs.readFileSync(WEAPONS_PATH, 'utf8'));

// Base parts definitions as they existed procedurally
const getBaseParts = (palette, showTopDetail, showRifleMag) => {
  const p = palette.primary;
  const s = palette.secondary;
  const a = palette.accent;
  const g = palette.glow;

  return [
    { name: "frame", type: "box", x: 0, y: -0.04, z: -0.05, sx: 0.12, sy: 0.18, sz: 0.42, rotX: 0, rotY: 0, rotZ: 0, color: p },
    { name: "slide", type: "box", x: 0, y: 0.08, z: -0.1, sx: 0.12, sy: 0.1, sz: 0.48, rotX: 0, rotY: 0, rotZ: 0, color: p },
    { name: "barrel", type: "cylinder", x: 0, y: 0.08, z: 0.14 - 0.25, sx: 0.04, sy: 0.5, sz: 0.04, rotX: Math.PI / 2, rotY: 0, rotZ: 0, color: p },
    { name: "grip", type: "box", x: 0, y: -0.22, z: 0.1, sx: 0.1, sy: 0.28, sz: 0.12, rotX: -0.25, rotY: 0, rotZ: 0, color: p },
    { name: "triggerGuard", type: "box", x: 0, y: -0.14, z: -0.05, sx: 0.04, sy: 0.1, sz: 0.12, rotX: 0, rotY: 0, rotZ: 0, color: p },
    { name: "mag", type: "box", x: 0, y: -0.24, z: 0.1, sx: 0.09, sy: 0.24, sz: 0.11, rotX: -0.25, rotY: 0, rotZ: 0, color: a },
    { name: "rifleMag", type: "box", x: 0, y: -0.3, z: -0.15, sx: 0.1, sy: 0.45, sz: 0.18, rotX: 0.15, rotY: 0, rotZ: 0, color: p, visible: showRifleMag },
    { name: "topDetail", type: "box", x: 0, y: 0.14, z: -0.12, sx: 0.08, sy: 0.04, sz: 0.32, rotX: 0, rotY: 0, rotZ: 0, color: s, visible: showTopDetail },
    { name: "sight", type: "box", x: 0, y: 0.16, z: -0.32, sx: 0.02, sy: 0.06, sz: 0.02, rotX: 0, rotY: 0, rotZ: 0, color: a },
    { name: "glowL", type: "box", x: -0.065, y: 0.02, z: -0.1, sx: 0.01, sy: 0.04, sz: 0.18, rotX: 0, rotY: 0, rotZ: 0, color: g },
    { name: "glowR", type: "box", x: 0.065, y: 0.02, z: -0.1, sx: 0.01, sy: 0.04, sz: 0.18, rotX: 0, rotY: 0, rotZ: 0, color: g }
  ];
};

const palettes = {
  pistol: { primary: 0xd84545, secondary: 0xffeee8, accent: 0x8c1f2b, glow: 0xff3363 },
  rifle: { primary: 0x36c489, secondary: 0xe7fff1, accent: 0x1f7f59, glow: 0x00f0ff },
  minigun: { primary: 0x4aa3ff, secondary: 0xfff0a6, accent: 0x1b4f91, glow: 0x78e0ff },
  laser: { primary: 0x224422, secondary: 0xccffcc, accent: 0x39ff14, glow: 0x39ff14 },
  sniper: { primary: 0xf4f0df, secondary: 0x7db8ff, accent: 0xb8b1a0, glow: 0xfff0a6 },
  heavySniper: { primary: 0xf4f0df, secondary: 0x7db8ff, accent: 0xb8b1a0, glow: 0xfff0a6 },
  shotgun: { primary: 0x5ab0ff, secondary: 0xf3fbff, accent: 0x2369a5, glow: 0xffd166 },
  rocket: { primary: 0xff6f61, secondary: 0xfff0a6, accent: 0x9d312a, glow: 0xff7a2f },
  grenadeLauncher: { primary: 0xff6f61, secondary: 0xfff0a6, accent: 0x9d312a, glow: 0xff7a2f }
};

const getScaleAndOffsets = (weaponId) => {
  if (weaponId === "pistol") {
    return {
      barrel: { scale: [0.82, 0.9, 0.72], pos: [0, 0, 0.14] },
      slide: { scale: [1.05, 0.95, 0.78], pos: [0, 0.08, -0.1] },
      frame: { scale: [1, 1, 0.82], pos: [0, -0.04, -0.05] },
      muzzle: { x: 0, y: 0.08, z: -0.48 }
    };
  } else if (weaponId === "rifle" || weaponId === "minigun" || weaponId === "laser") {
    const isMinigun = weaponId === "minigun";
    const isLaser = weaponId === "laser";
    const bz = isMinigun ? 1.9 : (isLaser ? 1.85 : 1.45);
    const mz = isMinigun ? -1.28 : (isLaser ? -1.22 : -1.08);
    return {
      barrel: { scale: [1.05, 1, bz], pos: [0, 0, -0.02] },
      slide: { scale: [1.08, 1, 1.16], pos: [0, 0.08, -0.1] },
      frame: { scale: [1.05, 1, 1.08], pos: [0, -0.04, -0.05] },
      muzzle: { x: 0, y: 0.08, z: mz }
    };
  } else if (weaponId === "sniper" || weaponId === "heavySniper") {
    const isHeavy = weaponId === "heavySniper";
    const bz = isHeavy ? 3.3 : 2.75;
    const mz = isHeavy ? -1.82 : -1.52;
    return {
      barrel: { scale: [0.82, 0.9, bz], pos: [0, 0, 0.22] },
      slide: { scale: [0.92, 0.88, 1.55], pos: [0, 0.08, -0.1] },
      frame: { scale: [0.92, 0.92, 1.25], pos: [0, -0.04, -0.05] },
      muzzle: { x: 0, y: 0.08, z: mz }
    };
  } else if (weaponId === "shotgun") {
    return {
      barrel: { scale: [1.2, 1.05, 1.22], pos: [0, 0, 0.03] },
      slide: { scale: [1.08, 1, 1.1], pos: [0, 0.08, -0.1] },
      frame: { scale: [1.06, 1, 1.08], pos: [0, -0.04, -0.05] },
      muzzle: { x: 0, y: 0.08, z: -0.92 }
    };
  } else {
    // rocket, grenadeLauncher, default
    return {
      barrel: { scale: [1.12, 1.12, 1.35], pos: [0, 0, 0.02] },
      slide: { scale: [1.1, 1.05, 1.12], pos: [0, 0.08, -0.1] },
      frame: { scale: [1.08, 1.02, 1.1], pos: [0, -0.04, -0.05] },
      muzzle: { x: 0, y: 0.08, z: -1.0 }
    };
  }
};

const round3 = (val) => Math.round(val * 1000) / 1000;

for (const weaponId of Object.keys(weaponsData.weapons)) {
  const p = palettes[weaponId] || palettes.pistol;
  const isLaser = weaponId === "laser";
  const isRifleOrMinigun = weaponId === "rifle" || weaponId === "minigun";
  const showRifleMag = isRifleOrMinigun;
  const showTopDetail = !(weaponId === "sniper" || weaponId === "heavySniper");

  const baseParts = getBaseParts(p, showTopDetail, showRifleMag);
  const tf = getScaleAndOffsets(weaponId);

  const parts = [];
  for (const part of baseParts) {
    if (part.visible === false) continue;

    let px = part.x;
    let py = part.y;
    let pz = part.z;
    let sx = part.sx;
    let sy = part.sy;
    let sz = part.sz;

    if (part.name === "barrel") {
      // Barrel geometry is cylinder inside barrelGroup
      // barrelGroup was at: (0, 0.08, 0.14) + tf.barrel.pos
      // barrel was at: (0, 0, -0.25) inside barrelGroup
      // barrelGroup scale: tf.barrel.scale
      const bgx = 0 + tf.barrel.pos[0];
      const bgy = 0.08 + tf.barrel.pos[1];
      const bgz = 0.14 + tf.barrel.pos[2];

      const bx = 0;
      const by = 0;
      const bz = -0.25;

      // Apply scale of barrelGroup to barrel relative position
      px = bx * tf.barrel.scale[0] + bgx;
      py = by * tf.barrel.scale[1] + bgy;
      pz = bz * tf.barrel.scale[2] + bgz;

      // Apply scale of barrelGroup to barrel size
      sx = sx * tf.barrel.scale[0];
      sy = sy * tf.barrel.scale[2]; // y is length of cylinder, which aligns with z scale in barrelGroup
      sz = sz * tf.barrel.scale[1]; // cylinder radius bottom scaled by y scale
    } else if (part.name === "slide" || part.name === "topDetail" || part.name === "sight" || part.name.startsWith("glow")) {
      // Slide-attached components are scaled by tf.slide.scale relative to (0, 0.08, -0.1)
      const sx_slide = tf.slide.scale[0];
      const sy_slide = tf.slide.scale[1];
      const sz_slide = tf.slide.scale[2];

      const refX = 0;
      const refY = 0.08;
      const refZ = -0.1;

      px = (part.x - refX) * sx_slide + refX;
      py = (part.y - refY) * sy_slide + refY;
      pz = (part.z - refZ) * sz_slide + refZ;

      sx = sx * sx_slide;
      sy = sy * sy_slide;
      sz = sz * sz_slide;
    } else if (part.name === "frame" || part.name === "grip" || part.name === "triggerGuard" || part.name === "mag" || part.name === "rifleMag") {
      // Frame-attached components are scaled by tf.frame.scale relative to (0, -0.04, -0.05)
      const sx_frame = tf.frame.scale[0];
      const sy_frame = tf.frame.scale[1];
      const sz_frame = tf.frame.scale[2];

      const refX = 0;
      const refY = -0.04;
      const refZ = -0.05;

      px = (part.x - refX) * sx_frame + refX;
      py = (part.y - refY) * sy_frame + refY;
      pz = (part.z - refZ) * sz_frame + refZ;

      sx = sx * sx_frame;
      sy = sy * sy_frame;
      sz = sz * sz_frame;
    }

    parts.push({
      name: part.name,
      type: part.type,
      x: round3(px),
      y: round3(py),
      z: round3(pz),
      sx: round3(sx),
      sy: round3(sy),
      sz: round3(sz),
      rotX: round3(part.rotX),
      rotY: round3(part.rotY),
      rotZ: round3(part.rotZ),
      color: part.color
    });
  }

  // Update weapons data
  weaponsData.weapons[weaponId].parts = parts;
  weaponsData.weapons[weaponId].muzzle = {
    x: round3(tf.muzzle.x),
    y: round3(tf.muzzle.y),
    z: round3(tf.muzzle.z)
  };
  
  // Clean up model root or old model GLB paths
  delete weaponsData.weapons[weaponId].model;
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(weaponsData, null, 2), 'utf8');
console.log("Successfully converted weapons procedural meshes to JSON parts!");
