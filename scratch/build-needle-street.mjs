// Generates maps/fps/needle-corridor.json + its include files as "Needle Street":
// a long, straight city street with building facades, parked cars, a footbridge,
// rooftop perches and street furniture. Run: node scratch/build-needle-street.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mapDir = join(root, "maps", "fps");
const incDir = join(mapDir, "needle-corridor");

// ---------- palette ----------
const C = {
  sky: 0xbfe3f5,
  floor: 0x474c54, gridA: 0x5a616b, gridB: 0x40454d, edge: 0x6b7280,
  brick: 0x8a4b3c, brick2: 0x9c5a45, tan: 0xb08d57, tan2: 0xbf9c66,
  slate: 0x4f6275, slate2: 0x5b7086, stucco: 0xc9bba4, teal: 0x3f7d76,
  roofTrim: 0x2e333b, concrete: 0x9aa0a6, curb: 0xb3b8be,
  paintW: 0xf2f2ee, paintY: 0xe8c84a,
  glass: 0x9ee8ff, glassWarm: 0xffd9a0,
  awnA: 0xd95f4b, awnB: 0x2f8f86, awnC: 0xe3b23c,
  carRed: 0xc14538, carBlue: 0x3c6fb0, carSilver: 0xb9c2cc,
  carWhite: 0xd8d8d2, carGreen: 0x55916b, taxi: 0xe0a32e, bus: 0x4c8c5c,
  steel: 0x8d97a2, dark: 0x23272d, wood: 0x8a6f4d,
  planter: 0x6e6257, leaf: 0x4f7942, dumpster: 0x3d5a45,
  jersey: 0xb9bdc2, hydrant: 0xc8402f, monument: 0x8b95a1, pillar: 0x77808c,
  deck: 0x4d7ea8, rail: 0x9aa3ad, hvac: 0x9099a3, doorDark: 0x1f262c
};

const HALF_X = 126, HALF_Z = 22; // floor 252 x 44

const northBoxes = [], southBoxes = [], streetBoxes = [];
const decorStreet = [], decorBuildings = [];

const B = (arr, name, x, y, z, sx, sy, sz, color, extra = {}) =>
  arr.push({ name, x: r(x), y: r(y), z: r(z), sx: r(sx), sy: r(sy), sz: r(sz), color, ...extra });
const D = (arr, name, x, y, z, sx, sy, sz, color, extra = {}) =>
  arr.push({ name, x: r(x), y: r(y), z: r(z), sx: r(sx), sy: r(sy), sz: r(sz), color, ...extra });
const r = (v) => Math.round(v * 1000) / 1000;

// ---------- buildings ----------
// side: -1 = north (negative z), +1 = south. facade = street-facing wall plane.
// rows abut exactly so side faces meet with opposite normals (no z-fighting).
// h >= 16 reads as a "tower"; the skyline now mixes low shops with high-rises.
const north = [
  { x1: -125.5, x2: -103.5, facade: -12.5, h: 14, color: C.brick },
  { x1: -103.5, x2: -85, facade: -10.4, h: 8, color: C.tan, shop: true },
  // alley -85..-79
  { x1: -79, x2: -57, facade: -11.6, h: 18, color: C.slate },
  { x1: -57, x2: -36, facade: -9.6, h: 9, color: C.stucco, shop: true },
  { x1: -36, x2: -15, facade: -12.4, h: 11, color: C.teal },
  // alley -15..-9
  { x1: -9, x2: 13, facade: -10.6, h: 10, color: C.brick2, enterable: true },
  { x1: 13, x2: 35, facade: -11.6, h: 8, color: C.tan2, roofAccess: true },
  // alley 35..41
  { x1: 41, x2: 60, facade: -9.7, h: 10, color: C.slate2, shop: true },
  // alley 60..66
  { x1: 66, x2: 84, facade: -12.5, h: 21, color: C.stucco },
  { x1: 84, x2: 105, facade: -10.4, h: 9, color: C.teal, enterable: true },
  { x1: 105, x2: 125.5, facade: -11.5, h: 13, color: C.brick }
];
const south = [
  { x1: -125.5, x2: -106, facade: 11.6, h: 9, color: C.stucco },
  { x1: -106, x2: -86, facade: 9.6, h: 12, color: C.brick, shop: true },
  { x1: -86, x2: -64, facade: 12.6, h: 8, color: C.tan, roofAccess: true },
  // alley -64..-58
  { x1: -58, x2: -36, facade: 10.5, h: 19, color: C.slate },
  { x1: -36, x2: -16, facade: 9.5, h: 9, color: C.teal, shop: true },
  // alley -16..-10
  { x1: -10, x2: 7, facade: 12.4, h: 11, color: C.brick2 },
  { x1: 7, x2: 28, facade: 9.6, h: 15, color: C.stucco, shop: true },
  // alley 28..34
  { x1: 34, x2: 56, facade: 11.5, h: 8, color: C.tan2 },
  { x1: 56, x2: 78, facade: 9.5, h: 10, color: C.slate2, shop: true },
  { x1: 78, x2: 100, facade: 12.6, h: 22, color: C.brick },
  { x1: 100, x2: 125.5, facade: 10.5, h: 9, color: C.teal, shop: true }
];

function buildRow(list, side, boxArr, prefix) {
  const rear = side * 21.7;
  list.forEach((b, i) => {
    const sx = b.x2 - b.x1, cx = (b.x1 + b.x2) / 2;
    const cz = (b.facade + rear) / 2, sz = Math.abs(rear - b.facade);
    const name = `${prefix}-${i}`;
    if (b.enterable) {
      // shop built from wall pieces with a full-height door gap on the facade
      const t = 0.8, doorW = 4.6, doorX = cx;
      const frontZ = b.facade + side * t / 2;
      const leftW = (doorX - doorW / 2) - b.x1, rightW = b.x2 - (doorX + doorW / 2);
      B(boxArr, `${name}-front-l`, b.x1 + leftW / 2, 0, frontZ, leftW, b.h, t, b.color);
      B(boxArr, `${name}-front-r`, b.x2 - rightW / 2, 0, frontZ, rightW, b.h, t, b.color);
      B(boxArr, `${name}-rear`, cx, 0, rear - side * t / 2, sx, b.h, t, b.color);
      // side walls run between the front and rear pieces so the corner
      // pieces never overlap (overlapping shells would z-fight).
      const sideZ1 = b.facade + side * t, sideZ2 = rear - side * t;
      const sideDepth = Math.abs(sideZ2 - sideZ1);
      const sideCz = (sideZ1 + sideZ2) / 2;
      B(boxArr, `${name}-side-w`, b.x1 + t / 2, 0, sideCz, t, b.h, sideDepth, b.color);
      B(boxArr, `${name}-side-e`, b.x2 - t / 2, 0, sideCz, t, b.h, sideDepth, b.color);
      B(boxArr, `${name}-roof`, cx, b.h, cz, sx + 0.4, 0.5, sz - 0.4, C.roofTrim, { platformOnly: true });
      B(boxArr, `${name}-counter`, cx, 0, b.facade + side * 2.9, 5, 1.1, 1.4, 0x6e4f35);
      D(decorBuildings, `${name}-sign`, doorX, 3.4, b.facade - side * 0.18, 5, 1, 0.25, C.awnA);
    } else {
      B(boxArr, name, cx, 0, cz, sx, b.h, sz, b.color);
    }
    // roof trim strip, slightly proud of the facade
    D(decorBuildings, `${name}-trim`, cx, b.h - 0.05, b.facade - side * 0.07, sx - 0.6, 0.35, 0.3, C.roofTrim);
    // windows
    const isShop = Boolean(b.shop || b.enterable);
    // Shops keep a short stack; other facades tile windows all the way up so the
    // new high-rises read as real towers instead of blank slabs.
    let rows;
    if (isShop) rows = [4.6, 7.2].filter((y) => y + 1.8 < b.h);
    else { rows = []; for (let y = 2.3; y + 1.8 < b.h; y += 2.6) rows.push(y); }
    const usable = sx - 5;
    const cols = Math.max(2, Math.floor(usable / 5.2));
    const span = usable - 2.6;
    for (let cIdx = 0; cIdx < cols; cIdx++) {
      const wx = cols === 1 ? cx : cx - span / 2 + (span / (cols - 1)) * cIdx;
      rows.forEach((wy, rIdx) => {
        if (b.enterable && Math.abs(wx - cx) < 3.4) return; // keep the door gap clear
        const warm = (i * 7 + cIdx * 3 + rIdx) % 5 === 2;
        D(decorBuildings, `${name}-win-${cIdx}-${rIdx}`, wx, wy, b.facade - side * 0.05, 2.6, 1.6, 0.18, warm ? C.glassWarm : C.glass);
      });
    }
    // street-level shopfront: split panes + dark door + awning
    if (b.shop) {
      const gz = b.facade - side * 0.05;
      const paneW = Math.min((sx - 9) / 2, 5.5);
      D(decorBuildings, `${name}-pane-l`, cx - paneW / 2 - 1.1, 0.55, gz, paneW, 2.3, 0.18, C.glass);
      D(decorBuildings, `${name}-pane-r`, cx + paneW / 2 + 1.1, 0.55, gz, paneW, 2.3, 0.18, C.glass);
      D(decorBuildings, `${name}-door`, cx, 0.45, gz, 1.5, 2.5, 0.16, C.doorDark);
      const awnColor = [C.awnA, C.awnB, C.awnC][i % 3];
      D(decorBuildings, `${name}-awning`, cx, 3.05, b.facade - side * 1.0, Math.min(sx - 5, 14), 0.14, 1.7, awnColor, { rotX: side < 0 ? 0.35 : -0.35 });
    }
  });
}
buildRow(north, -1, northBoxes, "n");
buildRow(south, 1, southBoxes, "s");

// blade signs sticking out from a few facades
D(decorBuildings, "blade-sign-1", -50, 3.4, -9.6 + 0.7, 0.22, 2.8, 1.2, C.awnC);
D(decorBuildings, "blade-sign-2", 90, 3.4, -10.4 + 0.7, 0.22, 2.8, 1.2, C.awnA);
D(decorBuildings, "blade-sign-3", -30, 3.4, 9.5 - 0.7, 0.22, 2.8, 1.2, C.awnB);
D(decorBuildings, "blade-sign-4", 62, 3.4, 9.5 - 0.7, 0.22, 2.8, 1.2, C.awnC);

// rooftop details
// y matches the host building roof height so props sit on top, not mid-wall.
const roofProps = [
  ["hvac-n3", -68, 18, -16, 2.2, 1.2, 1.8],
  ["hvac-n8", 50, 10, -15, 2.2, 1.2, 1.8],
  ["hvac-s4", -47, 19, 15, 2.4, 1.3, 1.9],
  ["hvac-s9", 67, 10, 15, 2.2, 1.2, 1.8],
  ["vent-n9", 75, 21, -17, 1.1, 0.8, 1.1],
  ["vent-s10", 89, 22, 16.5, 1.1, 0.8, 1.1],
  ["watertank-n9", 72, 21, -14, 1.8, 2.4, 1.8],
  ["watertank-s10", 86, 22, 14, 1.8, 2.6, 1.8]
];
for (const [name, x, y, z, sx, sy, sz] of roofProps) D(decorBuildings, name, x, y, z, sx, sy, sz, C.hvac);

// parapet cover on the two accessible roofs (collidable)
B(streetBoxes, "parapet-n7", 24, 8, -12.3, 20, 0.7, 0.6, C.roofTrim);
B(streetBoxes, "parapet-s3", -75, 8, 13.3, 20, 0.7, 0.6, C.roofTrim);

// ---------- street furniture / cover (collidable) ----------
const cars = [
  ["car-1", -88, -5.0, C.carRed], ["car-2", -31, -5.0, C.carBlue],
  ["car-3", 49, -5.0, C.carSilver], ["car-4", 99, -5.0, C.taxi],
  ["car-5", -59, 5.0, C.carGreen], ["car-6", 22, 5.0, C.carWhite],
  ["car-7", 78, 5.0, C.carBlue],
  ["car-8", -110, 5.0, C.taxi], ["car-9", 12, -5.0, C.carGreen],
  ["car-10", 68, 5.0, C.carSilver], ["car-11", -44, 5.0, C.carRed],
  ["car-12", 110, -5.0, C.carWhite]
];
for (const [name, x, z, color] of cars) {
  B(streetBoxes, name, x, 0, z, 4.6, 1.25, 2.0, color);
  D(decorStreet, `${name}-cab`, x - 0.3, 1.25, z, 2.5, 0.8, 1.7, C.glass);
}
B(streetBoxes, "bus", 36, 0, 4.6, 11, 2.9, 2.6, C.bus);
D(decorStreet, "bus-win-n", 36, 1.5, 4.6 - 1.36, 10.4, 0.9, 0.12, C.glass);
D(decorStreet, "bus-win-s", 36, 1.5, 4.6 + 1.36, 10.4, 0.9, 0.12, C.glass);

// planters
for (const [name, x, z] of [["pl-1", -76, -6.9], ["pl-2", -8, -6.9], ["pl-3", 62, -6.9], ["pl-4", -48, 6.9], ["pl-5", 88, 6.9], ["pl-6", 14, 6.9], ["pl-7", -104, -6.9]]) {
  B(streetBoxes, name, x, 0, z, 2.2, 0.95, 1.3, C.planter);
  D(decorStreet, `${name}-leaf`, x, 0.95, z, 2.0, 0.45, 1.1, C.leaf);
}

// food truck (big collidable cover, parked on the south lane)
B(streetBoxes, "food-truck", -20, 0, 4.7, 6.2, 2.7, 2.6, C.carBlue);
D(decorStreet, "food-truck-win", -22.6, 1.7, 4.7 - 1.36, 2.4, 0.9, 0.12, C.glass);
D(decorStreet, "food-truck-hatch", -18.5, 1.5, 4.7 - 1.36, 2.6, 1.0, 0.14, C.steel);
D(decorStreet, "food-truck-awn", -18.5, 2.55, 4.7 - 1.9, 2.8, 0.12, 1.1, C.awnC);

// newsstand kiosk on the north sidewalk
B(streetBoxes, "kiosk", 56, 0, -6.4, 2.4, 2.2, 1.5, C.wood);
D(decorStreet, "kiosk-roof", 56, 2.25, -6.4, 2.8, 0.18, 1.9, C.dark);
D(decorStreet, "kiosk-rack", 56, 0.9, -5.75, 2.2, 1.0, 0.16, C.awnA);

// phone booth near the west sidewalk
B(streetBoxes, "phone-booth", -100, 0, 6.6, 0.95, 2.4, 0.95, C.carRed);
D(decorStreet, "phone-booth-glass", -100, 1.5, 6.13, 0.8, 1.4, 0.06, C.glass);

// extra crate stacks in the new alley (60..66) and elsewhere
B(streetBoxes, "crate-a1a", 63, 0, -13, 1.6, 1.6, 1.6, C.wood);
B(streetBoxes, "crate-a1b", 63.3, 1.6, -12.7, 1.2, 1.2, 1.2, C.wood);
B(streetBoxes, "crate-a2", 63.1, 0, -15.4, 1.4, 1.4, 1.4, C.wood);
B(streetBoxes, "crate-b1", -116, 0, 5.6, 1.5, 1.5, 1.5, C.wood);
B(streetBoxes, "crate-b2", -114.6, 0, 7.0, 1.2, 1.2, 1.2, C.wood);

// low mid-lane concrete barriers: partial cover that keeps the sniper sightline
// readable but no longer a clean straight shot end-to-end.
B(streetBoxes, "barrier-m1", -42, 0, -1.6, 3.4, 0.95, 1.0, C.jersey);
B(streetBoxes, "barrier-m2", 28, 0, 1.6, 3.4, 0.95, 1.0, C.jersey);
B(streetBoxes, "barrier-m3", 70, 0, -1.4, 3.4, 0.95, 1.0, C.jersey);

// traffic cones (decor, non-collidable)
for (const [name, x, z] of [["cone-1", -54, -2.2], ["cone-2", -53, -3.4], ["cone-3", 18, 2.4], ["cone-4", 84, -2.0], ["cone-5", 85.2, -3.0]]) {
  D(decorStreet, name, x, 0, z, 0.4, 0.7, 0.4, C.taxi);
}

// dumpsters + crates in the alleys
B(streetBoxes, "dump-n1", -82, 0, -12.8, 2.4, 1.4, 1.7, C.dumpster);
B(streetBoxes, "crate-n1a", -81.5, 0, -16, 1.5, 1.5, 1.5, C.wood);
B(streetBoxes, "crate-n1b", -80.1, 0, -16.4, 1.2, 1.2, 1.2, C.wood);
B(streetBoxes, "dump-n2", -12, 0, -13.5, 2.4, 1.4, 1.7, C.dumpster);
B(streetBoxes, "crate-n3a", 38, 0, -13, 1.5, 1.5, 1.5, C.wood);
B(streetBoxes, "crate-n3b", 38.2, 1.5, -13.1, 1.1, 1.1, 1.1, C.wood);
B(streetBoxes, "dump-s1", -61, 0, 13.2, 2.4, 1.4, 1.7, C.dumpster);
B(streetBoxes, "crate-s2a", 31, 0, 12.5, 1.5, 1.5, 1.5, C.wood);

// jersey barriers shielding each spawn approach
B(streetBoxes, "jersey-w1", -98, 0, -2.8, 1.1, 1.15, 5.5, C.jersey);
B(streetBoxes, "jersey-w2", -92, 0, 3.2, 1.1, 1.15, 5.5, C.jersey);
B(streetBoxes, "jersey-e1", 98, 0, 2.8, 1.1, 1.15, 5.5, C.jersey);
B(streetBoxes, "jersey-e2", 92, 0, -3.2, 1.1, 1.15, 5.5, C.jersey);

// center monument under the footbridge (crouch cover, leaves side lanes open)
B(streetBoxes, "monument-base", 0, 0, 0, 3, 0.55, 2.2, C.monument);
B(streetBoxes, "monument-pillar", 0, 0.55, 0, 0.9, 2.5, 0.9, C.pillar);

// footbridge support piers
B(streetBoxes, "pier-n", 0, 0, -5.7, 0.8, 5.8, 0.8, C.steel);
B(streetBoxes, "pier-s", 0, 0, 5.7, 0.8, 5.8, 0.8, C.steel);

// bus stop bench (south sidewalk, in front of s-7 tan building)
B(streetBoxes, "bench", 48, 0, 10.9, 3, 0.5, 0.8, C.wood);
D(decorStreet, "shelter-roof", 48, 2.5, 10.6, 4.6, 0.14, 1.9, C.awnB);
D(decorStreet, "shelter-post-w", 46.6, 0, 9.9, 0.12, 2.5, 0.12, C.dark);
D(decorStreet, "shelter-post-e", 49.4, 0, 9.9, 0.12, 2.5, 0.12, C.dark);

// ---------- ground paint & sidewalks (decor) ----------
D(decorStreet, "sidewalk-n", 0, 0.02, -8.05, 251.4, 0.12, 3.5, C.concrete);
D(decorStreet, "sidewalk-s", 0, 0.02, 8.05, 251.4, 0.12, 3.5, C.concrete);
D(decorStreet, "curb-n", 0, 0.015, -6.1, 251.2, 0.18, 0.4, C.curb);
D(decorStreet, "curb-s", 0, 0.015, 6.1, 251.2, 0.18, 0.4, C.curb);
D(decorStreet, "lane-n", 0, 0.022, -5.9, 250, 0.04, 0.18, C.paintW);
D(decorStreet, "lane-s", 0, 0.022, 5.9, 250, 0.04, 0.18, C.paintW);
for (let x = -114; x <= 114; x += 8) {
  if (Math.abs(x - -56) < 5 || Math.abs(x - 56) < 5 || Math.abs(x) < 4) continue;
  D(decorStreet, `dash-${x}`, x, 0.026, 0, 3, 0.05, 0.26, C.paintY);
}
for (const cw of [-56, 56]) {
  for (let i = 0; i < 6; i++) {
    const z = -4.5 + i * 1.8;
    D(decorStreet, `cross-${cw}-${i}`, cw, 0.02, z, 2.8, 0.045, 1.1, C.paintW);
  }
}
for (const [name, x, z] of [["mh-1", -80, 1.3], ["mh-2", -20, -1.6], ["mh-3", 40, 1.0], ["mh-4", 100, -1.2]]) {
  D(decorStreet, name, x, 0.012, z, 0.95, 0.046, 0.95, C.dark);
}

// street lamps
const lampAt = (name, x, side) => {
  const z = side * 6.85;
  D(decorStreet, `${name}-pole`, x, 0, z, 0.16, 4.6, 0.16, C.dark);
  D(decorStreet, `${name}-arm`, x, 4.45, z - side * 0.75, 0.12, 0.12, 1.5, C.dark);
  D(decorStreet, `${name}-head`, x, 4.3, z - side * 1.35, 0.55, 0.22, 0.55, 0xfff2c0);
};
for (const x of [-98, -42, 14, 70]) lampAt(`lamp-n${x}`, x, -1);
for (const x of [-70, -14, 42, 98]) lampAt(`lamp-s${x}`, x, 1);

// hydrants + overhead wires
D(decorStreet, "hydrant-1", -36, 0, -6.7, 0.35, 0.8, 0.35, C.hydrant);
D(decorStreet, "hydrant-2", 84, 0, 6.7, 0.35, 0.8, 0.35, C.hydrant);
for (const x of [-45, 25, 85]) D(decorStreet, `wire-${x}`, x, 7.0, 0, 0.07, 0.07, 20.8, C.dark);

// footbridge railings
D(decorStreet, "bridge-rail-w", -2.2, 6.2, 0, 0.12, 0.9, 21, C.rail);
D(decorStreet, "bridge-rail-e", 2.2, 6.2, 0, 0.12, 0.9, 21, C.rail);

// ---------- main map ----------
const map = {
  version: 1,
  id: "needle-corridor",
  name: "Needle Street",
  sky: C.sky,
  fog: C.sky,
  fogNear: 120,
  fogFar: 340,
  shape: "corridor",
  bounds: { x: HALF_X, z: HALF_Z },
  spawnPoints: [{ x: -108, z: 0 }, { x: 108, z: 0 }],
  floors: [{ x: 0, z: 0, sx: 252, sz: 44 }],
  floor: C.floor,
  gridA: C.gridA,
  gridB: C.gridB,
  edge: C.edge,
  boxes: {
    $include: [
      "needle-corridor/boxes-01.json",
      "needle-corridor/boxes-02.json",
      "needle-corridor/boxes-03.json"
    ]
  },
  platforms: [
    { name: "footbridge-deck", x: 0, y: 5.8, z: 0, sx: 4.6, sy: 0.4, sz: 21, color: C.deck }
  ],
  ramps: [
    { name: "bridge-stair-n", x: -7.55, y: 0, z: -8.6, width: 2.8, length: 10.5, height: 6.2, rot: 1.571, color: C.deck },
    { name: "bridge-stair-s", x: 7.55, y: 0, z: 8.6, width: 2.8, length: 10.5, height: 6.2, rot: -1.571, color: C.deck },
    { name: "roof-stair-n7", x: 22, y: 0, z: -10.3, width: 2.6, length: 16, height: 8, rot: 1.571, color: C.steel },
    { name: "roof-stair-s3", x: -70, y: 0, z: 11.3, width: 2.6, length: 16, height: 8, rot: -1.571, color: C.steel }
  ],
  collision: [],
  decor: {
    $include: [
      "needle-corridor/decor-01.json",
      "needle-corridor/decor-02.json"
    ]
  },
  assets: [],
  config: {
    hp: 100,
    abilities: ["jump", "radar", "smoke", "grapple"],
    weapons: ["sniper", "rifle", "melee"]
  }
};

// ---------- validation ----------
const issues = [];
const allCollidable = [...northBoxes, ...southBoxes, ...streetBoxes];
for (const b of allCollidable) {
  if (Math.abs(b.x) + b.sx / 2 > HALF_X - 0.2 + 1e-9 || Math.abs(b.z) + b.sz / 2 > HALF_Z - 0.2 + 1e-9) {
    issues.push(`OUT OF BOUNDS (would be culled): ${b.name}`);
  }
}
const allBoxes = [...allCollidable, ...decorStreet, ...decorBuildings, ...map.platforms]
  .filter((b) => !b.rotX && !b.rotY && !b.rotZ);
for (let i = 0; i < allBoxes.length; i++) {
  for (let j = i + 1; j < allBoxes.length; j++) {
    const a = allBoxes[i], b = allBoxes[j];
    // mesh y center = y + sy/2 in engine; centers as authored
    const ca = [a.x, a.y + a.sy / 2, a.z], cb = [b.x, b.y + b.sy / 2, b.z];
    const ha = [a.sx / 2, a.sy / 2, a.sz / 2], hb = [b.sx / 2, b.sy / 2, b.sz / 2];
    for (let k = 0; k < 3; k++) {
      for (const s of [1, -1]) {
        const fa = ca[k] + s * ha[k], fb = cb[k] + s * hb[k];
        if (Math.abs(fa - fb) > 1e-4) continue;
        let overlap = true;
        for (const m of [0, 1, 2]) {
          if (m === k) continue;
          const lo = Math.max(ca[m] - ha[m], cb[m] - hb[m]);
          const hi = Math.min(ca[m] + ha[m], cb[m] + hb[m]);
          if (hi - lo <= 1e-4) overlap = false;
        }
        if (overlap) issues.push(`COPLANAR ${"xyz"[k]}${s > 0 ? "+" : "-"} @${fa.toFixed(3)}: ${a.name} <-> ${b.name}`);
      }
    }
  }
}

const write = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
write(join(mapDir, "needle-corridor.json"), map);
write(join(incDir, "boxes-01.json"), northBoxes);
write(join(incDir, "boxes-02.json"), southBoxes);
write(join(incDir, "boxes-03.json"), streetBoxes);
write(join(incDir, "decor-01.json"), decorStreet);
write(join(incDir, "decor-02.json"), decorBuildings);

console.log(`boxes: ${northBoxes.length}+${southBoxes.length}+${streetBoxes.length}, decor: ${decorStreet.length}+${decorBuildings.length}`);
console.log(issues.length ? issues.join("\n") : "validation clean");
