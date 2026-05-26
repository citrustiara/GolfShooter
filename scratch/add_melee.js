const fs = require('fs');

const WEAPONS_PATH = '../assets/weapons/weapons.json';
const weaponsData = JSON.parse(fs.readFileSync(WEAPONS_PATH, 'utf8'));

// Euler rotation for XYZ order (standard Three.js)
function rotatePointXYZ(p, rx, ry, rz) {
  // Rotate around Z
  let x1 = p.x * Math.cos(rz) - p.y * Math.sin(rz);
  let y1 = p.x * Math.sin(rz) + p.y * Math.cos(rz);
  let z1 = p.z;
  
  // Rotate around Y
  let x2 = x1 * Math.cos(ry) + z1 * Math.sin(ry);
  let y2 = y1;
  let z2 = -x1 * Math.sin(ry) + z1 * Math.cos(ry);
  
  // Rotate around X
  let x3 = x2;
  let y3 = y2 * Math.cos(rx) - z2 * Math.sin(rx);
  let z3 = y2 * Math.sin(rx) + z2 * Math.cos(rx);
  
  return { x: x3, y: y3, z: z3 };
}

const round3 = (val) => Math.round(val * 1000) / 1000;

// Melee weapon parts conversion
const headPos = { x: 0.55, y: -1.0, z: -0.98 };
const headRot = { x: -0.38, y: 0.9, z: -0.12 };

const headPartsRaw = [
  { name: "clubHeadBack", type: "box", x: 0.04, y: 0.02, z: 0.02, sx: 0.38, sy: 0.12, sz: 0.16, color: 0xffd166 },
  { name: "clubHeadFace", type: "box", x: 0.03, y: -0.01, z: -0.085, sx: 0.42, sy: 0.11, sz: 0.035, color: 0xdddddd },
  { name: "clubHeadToe", type: "box", x: 0.22, y: 0.01, z: 0.02, sx: 0.13, sy: 0.15, sz: 0.2, color: 0x1b1f24 }
];

const parts = [
  {
    name: "shaft",
    type: "cylinder",
    x: 0.36,
    y: -0.4,
    z: -0.42,
    sx: 0.018,
    sy: 1.55,
    sz: 0.018,
    rotX: -0.74,
    rotY: 0.1,
    rotZ: 0.18,
    color: 0xdddddd
  },
  {
    name: "clubGrip",
    type: "cylinder",
    x: 0.18,
    y: 0.12,
    z: 0.05,
    sx: 0.032,
    sy: 0.34,
    sz: 0.026,
    rotX: -0.74,
    rotY: 0.1,
    rotZ: 0.18,
    color: 0x1b1f24
  }
];

// Transform the clubHead parts
for (const raw of headPartsRaw) {
  const rotated = rotatePointXYZ(raw, headRot.x, headRot.y, headRot.z);
  const px = rotated.x + headPos.x;
  const py = rotated.y + headPos.y;
  const pz = rotated.z + headPos.z;

  parts.push({
    name: raw.name,
    type: raw.type,
    x: round3(px),
    y: round3(py),
    z: round3(pz),
    sx: raw.sx,
    sy: raw.sy,
    sz: raw.sz,
    rotX: headRot.x,
    rotY: headRot.y,
    rotZ: headRot.z,
    color: raw.color
  });
}

// Add the melee configuration
weaponsData.weapons.melee = {
  label: "Club",
  ammo: 1,
  damage: 55,
  crit: 1.5,
  reload: 1,
  fireDelay: 600,
  range: 4.5,
  moveScale: 1.34,
  parts: parts,
  muzzle: { x: 0, y: 0.08, z: -1.0 }
};

fs.writeFileSync(WEAPONS_PATH, JSON.stringify(weaponsData, null, 2), 'utf8');
console.log("Successfully added melee weapon configuration to weapons.json!");
