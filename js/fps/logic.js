import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { game, world, fps, input } from "../core/state.js";
import { materials, scene } from "../core/engine.js";
import { fpsArenaThemes } from "./themes.js";
import { makeRampMesh } from "../core/ramps.js";

export function setupArena() {
  const mapIndex = game.fpsMapIndex || 0;
  const theme = fpsArenaThemes[mapIndex] || fpsArenaThemes[0];
  const boundsX = theme.bounds.x;
  const boundsZ = theme.bounds.z;
  const gridSize = Math.max(boundsX, boundsZ) * 2;
  const floorDefs = getArenaFloorDefs(theme);

  applyFpsArenaTheme(theme);

  // Clear existing arena objects
  while (world.arenaRoot.children.length > 0) {
    const child = world.arenaRoot.children[0];
    world.arenaRoot.remove(child);
  }

  // Reset world obstacles and platforms
  world.obstacles = [];
  world.platforms = [];
  world.ramps = [];
  world.lasers = [];
  world.grenades = [];
  world.explosions = [];
  world.arenaFloors = floorDefs.map((floor) => ({ ...floor }));
  world.arenaSpawnPoints = getArenaSpawnPoints(theme);

  const floorMat = new THREE.MeshStandardMaterial({ color: theme.floor, roughness: 0.88 });
  const addFloor = (x, z, sx, sz) => {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.5, sz), floorMat);
    floor.position.set(x, -0.25, z);
    floor.receiveShadow = true;
    world.arenaRoot.add(floor);
  };

  for (const floor of floorDefs) {
    if (floor.type === "circle") {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(floor.r, floor.r, 0.5, 80), floorMat);
      mesh.position.set(floor.x, -0.25, floor.z);
      mesh.receiveShadow = true;
      world.arenaRoot.add(mesh);
    } else {
      addFloor(floor.x, floor.z, floor.sx, floor.sz);
    }
  }

  // Grid overlay
  if (!theme.floors || theme.floors.length > 0) {
    const grid = new THREE.GridHelper(gridSize, gridSize / 2, theme.gridA, theme.gridB);
    grid.position.y = 0.02;
    world.arenaRoot.add(grid);
  }

  const skyShell = new THREE.Mesh(
    new THREE.SphereGeometry(170, 32, 16),
    new THREE.MeshBasicMaterial({ color: theme.sky, side: THREE.BackSide })
  );
  skyShell.position.y = 28;
  world.arenaRoot.add(skyShell);

  // Thin perimeter walls
  const edgeMat = new THREE.MeshStandardMaterial({ color: theme.edge, roughness: 0.75, metalness: 0.22 });
  const edgeH = 8.0;
  const wallDefs = makePerimeterWalls(floorDefs, edgeH);
  for (const w of wallDefs) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w.sx, w.sy, w.sz), edgeMat);
    mesh.position.set(w.x, w.sy / 2, w.z);
    mesh.rotation.y = w.rot || 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.arenaRoot.add(mesh);
  }

  // Spawn pads
  const spawnPads = getArenaSpawnPoints(theme).map((spawn, index) => ({
    ...spawn,
    mat: playerMaterial(index)
  }));
  for (const pad of spawnPads) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.08, 42), pad.mat);
    ring.position.set(pad.x, 0.05, pad.z);
    ring.receiveShadow = true;
    world.arenaRoot.add(ring);
  }

  world.playerMeshes = [];
  for (let i = 0; i < fps.players.length; i++) {
    const mesh = makePlayerMesh(playerMaterial(i));
    mesh.position.copy(fps.players[i].pos);
    world.playerMeshes.push(mesh);
    world.arenaRoot.add(mesh);
  }

  // Obstacles and Platforms (Shared helpers)
  const obstacleMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.7 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x6be5ff, roughness: 0.18, metalness: 0.12, transparent: true, opacity: 0.34 });

  const box = (x, y, z, sx, sy, sz, color = 0x444444, isPlatform = true) => {
    if (!isBoxInsideArena({ x, z, sx, sz }, floorDefs, 0.2)) return null;
    const mat = color === 0x444444 ? obstacleMat : new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(x, y + sy / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.arenaRoot.add(mesh);
    world.obstacles.push(mesh);
    if (isPlatform) world.platforms.push(mesh);
    return mesh;
  };

  const platformOnly = (x, y, z, sx, sy, sz, color = 0x555555) => {
    if (!isBoxInsideArena({ x, z, sx, sz }, floorDefs, 0.2)) return null;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(sx, sy, sz),
      new THREE.MeshStandardMaterial({ color, roughness: 0.68 })
    );
    mesh.position.set(x, y + sy / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.arenaRoot.add(mesh);
    world.platforms.push(mesh);
    world.obstacles.push(mesh);
    return mesh;
  };

  const decorBox = (x, y, z, sx, sy, sz, color = 0x78e0ff, rotX = 0, rotY = 0, material = null) => {
    if (!isPointInsideArena({ x, z }, floorDefs, 0.2)) return null;
    const mat = material || new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0.08 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(x, y + sy / 2, z);
    mesh.rotation.set(rotX, rotY, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.arenaRoot.add(mesh);
    return mesh;
  };

  const collidableDecorBox = (...args) => {
    const mesh = decorBox(...args);
    if (mesh) {
      world.obstacles.push(mesh);
      world.platforms.push(mesh);
    }
    return mesh;
  };

  const ramp = (x, y, z, width, length, height, rot = 0, color = 0x5ab0ff) => {
    if (!isBoxInsideArena({ x, z, sx: Math.max(width, length), sz: Math.max(width, length) }, floorDefs, 0.2)) return null;
    const mesh = makeRampMesh(
      { x, y, z, width, length, height, rot },
      new THREE.MeshStandardMaterial({ color, roughness: 0.68 }),
      { surfaceOffset: 0 }
    );
    world.arenaRoot.add(mesh);
    world.ramps.push(mesh.userData.ramp);
    world.obstacles.push(mesh);
    return mesh;
  };

  const stairRun = (x, z, dirX, dirZ, steps, width, stepDepth, stepHeight, color = 0x5ab0ff) => {
    const len = steps * stepDepth;
    const height = steps * stepHeight;
    const rot = Math.atan2(dirX, dirZ);
    const centerX = x + dirX * len * 0.5;
    const centerZ = z + dirZ * len * 0.5;
    return ramp(centerX, 1, centerZ, width, len, height, rot, color);
  };

  const enterableBuilding = (x, z, sx, sz, h, color, roofColor = color, doorSide = "front") => {
    const wallT = 0.75;
    const doorW = Math.min(5.2, sx * 0.34);
    const sideWall = (side, px, pz, wx, wz) => box(px, 0, pz, wx, h, wz, color);
    if (doorSide === "front") {
      sideWall("frontL", x - (sx - doorW) / 4, z - sz / 2, (sx - doorW) / 2, wallT);
      sideWall("frontR", x + (sx - doorW) / 4, z - sz / 2, (sx - doorW) / 2, wallT);
    } else {
      sideWall("front", x, z - sz / 2, sx, wallT);
    }
    if (doorSide === "back") {
      sideWall("backL", x - (sx - doorW) / 4, z + sz / 2, (sx - doorW) / 2, wallT);
      sideWall("backR", x + (sx - doorW) / 4, z + sz / 2, (sx - doorW) / 2, wallT);
    } else {
      sideWall("back", x, z + sz / 2, sx, wallT);
    }
    sideWall("left", x - sx / 2, z, wallT, sz);
    sideWall("right", x + sx / 2, z, wallT, sz);
    platformOnly(x, h + 0.15, z, sx + 1.2, 0.5, sz + 1.2, roofColor);
  };

  const parkourStack = (x, z, sign, colorA, colorB) => {
    box(x, 0.75, z, 3.8, 0.45, 3.8, colorA);
    box(x + sign * 5.3, 1.9, z - 3.8, 3.3, 0.45, 3.3, colorB);
    box(x + sign * 10.2, 3.15, z - 1.1, 3.1, 0.45, 3.1, colorA);
    box(x + sign * 14.3, 4.35, z + 3.2, 3.6, 0.45, 3.6, colorB);
    decorBox(x + sign * 7.6, 2.15, z + 1.5, 1.0, 0.22, 7.5, 0xffd166, 0, 0);
  };

  if (theme?.id === "skyhook-spires" && !hasExternalMapContent(theme)) {
    buildSkyhookSpires(box, platformOnly, decorBox, collidableDecorBox, glassMat, enterableBuilding, ramp, stairRun);
  } else if (hasExternalMapContent(theme)) {
    applyFpsMapContent(theme, box, platformOnly, decorBox, collidableDecorBox, ramp);
  } else if (mapIndex === 0) {
    box(-15, 0, -10, 2, 4.5, 20);
    box(-20, 0, 15, 18, 4.5, 2);
    box(-32, 0, -5, 2, 4.5, 25);
    box(-28, 0, -18, 12, 4.5, 2);
    box(-12, 0, 25, 2, 6, 8, 0x444444);
    box(15, 0, 10, 2, 4.5, 20);
    box(20, 0, -15, 18, 4.5, 2);
    box(32, 0, 5, 2, 4.5, 25);
    box(28, 0, 18, 12, 4.5, 2);
    box(12, 0, -25, 2, 6, 8, 0x444444);
    box(0, 0, 32, 20, 4, 2);
    box(0, 0, -32, 20, 4, 2);
    box(-8, 0, 0, 2, 5, 10);
    box(8, 0, 0, 2, 5, 10);
    box(-12, 0, -12, 4, 2.5, 4, 0x666666);
    box(12, 0, 12, 4, 2.5, 4, 0x666666);
    box(-12, 0, 12, 4, 4.2, 4, 0x666666);
    box(12, 0, -12, 4, 4.2, 4, 0x666666);
    box(-3.8, 1.45, -20, 5.5, 0.45, 5.5, 0x2f8f56);
    box(3.8, 2.65, -24.5, 4.8, 0.45, 4.8, 0x48a565);
    box(10.5, 3.9, -20, 4.2, 0.45, 4.2, 0x72cf83);
    box(3.8, 1.45, 20, 5.5, 0.45, 5.5, 0x8d4cff);
    box(-3.8, 2.65, 24.5, 4.8, 0.45, 4.8, 0x5ab0ff);
    box(-10.5, 3.9, 20, 4.2, 0.45, 4.2, 0xff6f61);
    stairRun(-21.4, -33.1, 1, 0, 8, 3.2, 1.05, 0.42, 0x3478b8);
    stairRun(14.6, 28.9, 1, 0, 8, 3.2, 1.05, 0.42, 0xb8483e);
    stairRun(-28, 17.4, 0, 1, 8, 3.2, 1.05, 0.42, 0xb8902f);
    stairRun(28, -24.6, 0, 1, 8, 3.2, 1.05, 0.42, 0x3d9a65);
    box(0, 5.9, -28, 32, 0.45, 3.2, 0x225c7a);
    box(0, 5.9, 28, 32, 0.45, 3.2, 0x7a2835);
    box(-28, 5.9, 0, 3.2, 0.45, 32, 0x7a5c1e);
    box(28, 5.9, 0, 3.2, 0.45, 32, 0x287a55);
    parkourStack(-40, -8, 1, 0x5ab0ff, 0xffd166);
    parkourStack(40, 8, -1, 0xff6f61, 0x7ee2a8);
    box(-39, 0, 18, 8, 1.2, 2.6, 0x5ab0ff);
    box(-44, 0, 25, 2.6, 2.1, 2.6, 0x7ee2a8);
    box(-34, 0, 28, 5.8, 1.6, 2.4, 0xffd166);
    box(39, 0, -18, 8, 1.2, 2.6, 0xff6f61);
    box(44, 0, -25, 2.6, 2.1, 2.6, 0xffd166);
    box(34, 0, -28, 5.8, 1.6, 2.4, 0x7ee2a8);
    box(-48, 2.5, -40, 8, 0.5, 8, 0x225c7a);
    box(-48, 0, -40, 2, 2.5, 2, 0x31576d);
    box(-45, 3.55, -36, 4, 0.45, 4, 0x5ab0ff);
    box(48, 2.5, 40, 8, 0.5, 8, 0x7a2835);
    box(48, 0, 40, 2, 2.5, 2, 0x6d3139);
    box(45, 3.55, 36, 4, 0.45, 4, 0xff6f61);
    box(-45, 0, -35, 8, 4, 8);
    box(45, 0, 35, 8, 4, 8);
    box(-45, 0, 35, 8, 4, 8);
    box(45, 0, -35, 8, 4, 8);
    box(0, 0, 50, 16, 6, 2, 0x444444);
    box(0, 0, -50, 16, 6, 2, 0x444444);
    box(50, 0, 0, 2, 6, 16, 0x444444);
    box(-50, 0, 0, 2, 6, 16, 0x444444);
    box(-52, 0, -52, 4, 8, 4, 0x333333);
    box(52, 0, 52, 4, 8, 4, 0x333333);
    box(-52, 0, 52, 4, 8, 4, 0x333333);
    box(52, 0, -52, 4, 8, 4, 0x333333);
    box(-35, 0, 48, 6, 3, 4);
    box(35, 0, -48, 6, 3, 4);
    box(48, 0, 35, 4, 3, 6);
    box(-48, 0, -35, 4, 3, 6);
    addDepotBuildings(box, platformOnly, decorBox, collidableDecorBox, glassMat, enterableBuilding);
  } else if (mapIndex === 1) {
    buildRooftopArena(box, platformOnly, decorBox, collidableDecorBox, stairRun, glassMat, enterableBuilding);
  } else if (mapIndex === 2) {
    buildFoundryArena(box, platformOnly, decorBox, collidableDecorBox, stairRun, glassMat, enterableBuilding);
  } else if (mapIndex === 3) {
    buildNeedleCorridor(box, platformOnly, decorBox, collidableDecorBox, glassMat, enterableBuilding);
  } else {
    buildSkyhookSpires(box, platformOnly, decorBox, collidableDecorBox, glassMat, enterableBuilding);
  }

  applyCustomArenaMap(box, platformOnly, decorBox, collidableDecorBox, ramp);
  loadImportedArenaAssets(theme);

  // Calculate dynamic jetpack height limit based on arena geometry
  let maxGeometryY = 5.0;
  for (const mesh of [...world.obstacles, ...world.platforms]) {
    if (mesh.geometry) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const b = new THREE.Box3().setFromObject(mesh);
      maxGeometryY = Math.max(maxGeometryY, b.max.y);
    }
  }
  for (const sp of world.arenaSpawnPoints) {
    maxGeometryY = Math.max(maxGeometryY, sp.y || 0);
  }
  for (const rampDef of world.ramps) {
    maxGeometryY = Math.max(maxGeometryY, (rampDef.y || 0) + (rampDef.height || 0));
  }
  game.jetpackHeightLimit = maxGeometryY + 15.0;
}

function applyFpsArenaTheme(theme) {
  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);
}

function playerMaterial(index) {
  const palette = [materials.blue, materials.coral, materials.gold, materials.mint || materials.green, materials.wall];
  return palette[index % palette.length] || materials.blue;
}

function addDepotBuildings(box, platformOnly, decorBox, collidableDecorBox, glassMat, enterableBuilding) {
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x1b252b, roughness: 0.6, metalness: 0.18 });
  enterableBuilding(-25, -28, 14, 10, 5.7, 0x27333a, 0x1b252b, "front");
  decorBox(-25, 6.44, -28, 15.6, 0.22, 11.6, 0x6be5ff, 0, 0, roofMat);

  enterableBuilding(25, 28, 14, 10, 5.7, 0x37272d, 0x2a1b1f, "back");
  decorBox(25, 6.44, 28, 15.6, 0.22, 11.6, 0xff9f88, 0, 0, roofMat);

  box(-8, 0, -38, 18, 5.4, 2.2, 0x31424a);
  platformOnly(-8, 5.55, -38, 19, 0.45, 3.2, 0x26353d);
  box(8, 0, 38, 18, 5.4, 2.2, 0x4a3138);
  platformOnly(8, 5.55, 38, 19, 0.45, 3.2, 0x3a252b);

  collidableDecorBox(0, 7.05, 0, 30, 0.2, 4.4, 0xffffff, 0, 0, glassMat);
  collidableDecorBox(0, 7.05, 0, 4.4, 0.2, 30, 0xffffff, 0, 0, glassMat);
}

function buildRooftopArena(box, platformOnly, decorBox, collidableDecorBox, stairRun, glassMat, enterableBuilding) {
  const awningMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.05 });
  enterableBuilding(25, -16, 14, 18, 6.8, 0xe8f4d8, 0xf7f0c9, "front");
  collidableDecorBox(0, 7.52, 0, 18, 0.18, 18, 0xffffff, 0, 0, glassMat);

  enterableBuilding(-35, -28, 18, 14, 5.2, 0xb7d6a8, 0xf2e7b8, "front");
  enterableBuilding(35, 28, 18, 14, 5.2, 0xf0c58e, 0xfff0c2, "back");
  enterableBuilding(-52, 6, 9, 9, 11.5, 0x6aa9cc, 0xcdefff, "front");
  enterableBuilding(42, -50, 9, 9, 12.5, 0xe98b91, 0xffdada, "back");

  enterableBuilding(-34, 28, 16, 10, 3.2, 0x80b8d8, 0xcdefff, "back");
  enterableBuilding(34, -28, 16, 10, 3.2, 0xea9da1, 0xffdada, "front");

  stairRun(-18, -16, -1, 0, 8, 3.2, 1.2, 0.5, 0xb7d6a8);
  stairRun(18, 16, 1, 0, 8, 3.2, 1.2, 0.5, 0xf0c58e);
  stairRun(-18, 15, 0, 1, 7, 3.1, 1.2, 0.46, 0x80b8d8);
  stairRun(18, -15, 0, -1, 7, 3.1, 1.2, 0.46, 0xea9da1);

  platformOnly(0, 3.0, -34, 24, 0.45, 4.0, 0xf5dd99);
  platformOnly(0, 3.0, 34, 24, 0.45, 4.0, 0xaed8ff);
  platformOnly(-34, 4.8, 0, 4.0, 0.45, 24, 0xb0dfa6);
  platformOnly(34, 4.8, 0, 4.0, 0.45, 24, 0xffb9be);

  box(-8, 0, -6, 3, 3.2, 16, 0xf4f0df);
  box(8, 0, 6, 3, 3.2, 16, 0xf4f0df);
  box(0, 0, -22, 10, 2.4, 3.0, 0xffd166);
  box(0, 0, 22, 10, 2.4, 3.0, 0x7ee2a8);
  collidableDecorBox(-20, 5.95, -28, 11, 0.2, 9, 0xffffff, 0, 0, awningMat);
  collidableDecorBox(20, 5.95, 28, 11, 0.2, 9, 0xffffff, 0, 0, awningMat);
  enterableBuilding(6, -58, 12, 11, 9.6, 0xd8eef7, 0xffffff, "front");
  enterableBuilding(-58, 14, 12, 12, 10.8, 0x9ac7de, 0xf8ffff, "back");
}

function buildFoundryArena(box, platformOnly, decorBox, collidableDecorBox, stairRun, glassMat, enterableBuilding) {
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xff5a24 });
  // Central glass tower / platform
  collidableDecorBox(0, 9.5, 0, 14, 0.16, 14, 0xff7a2f, 0, 0, glassMat);

  // Outer U-walls/cover instead of tight buildings at spawn
  // Spawn points are at (-50, 0) and (48, 0)
  // Let's place a nice open stone/foundry wall around spawn
  box(-46, 0, -6, 2, 4.5, 12, 0x211111);
  box(-40, 0, 0, 8, 4.5, 2, 0x211111);

  box(44, 0, 6, 2, 4.5, 12, 0x1a1418);
  box(38, 0, 0, 8, 4.5, 2, 0x1a1418);

  // Open vertical platforms with cover walls (Tactical high-ground play!)
  // Platform 1: bottom-left
  platformOnly(-32, 4.5, -32, 14, 0.4, 14, 0x4a1f1f);
  box(-38, 4.5, -32, 2, 1.2, 14, 0x211111); // waist-high cover wall
  box(-32, 4.5, -38, 14, 1.2, 2, 0x211111); // waist-high cover wall

  // Platform 2: top-right
  platformOnly(32, 4.5, 32, 14, 0.4, 14, 0x4a2a19);
  box(38, 4.5, 32, 2, 1.2, 14, 0x1a1418); // waist-high cover wall
  box(32, 4.5, 38, 14, 1.2, 2, 0x1a1418); // waist-high cover wall

  // Platform 3: top-left
  platformOnly(-32, 4.5, 32, 14, 0.4, 14, 0x5a2b21);
  box(-38, 4.5, 32, 2, 1.2, 14, 0x2b191f); // waist-high cover wall
  box(-32, 4.5, 38, 14, 1.2, 2, 0x2b191f); // waist-high cover wall

  // Platform 4: bottom-right
  platformOnly(32, 4.5, -32, 14, 0.4, 14, 0x6a3c1c);
  box(38, 4.5, -32, 2, 1.2, 14, 0x271e15); // waist-high cover wall
  box(32, 4.5, -38, 14, 1.2, 2, 0x271e15); // waist-high cover wall

  // Perimeter walls
  box(0, 0, -35, 34, 5.5, 3, 0x321617);
  box(0, 0, 35, 34, 5.5, 3, 0x321617);
  box(-35, 0, 0, 3, 5.5, 34, 0x321617);
  box(35, 0, 0, 3, 5.5, 34, 0x321617);
  platformOnly(0, 5.75, -35, 36, 0.45, 4, 0x6e2a1a);
  platformOnly(0, 5.75, 35, 36, 0.45, 4, 0x6e2a1a);
  platformOnly(-35, 5.75, 0, 4, 0.45, 36, 0x6e2a1a);
  platformOnly(35, 5.75, 0, 4, 0.45, 36, 0x6e2a1a);

  // Stairs/Ramps to the platforms
  stairRun(-18, -24, 1, 0, 9, 3.2, 1.15, 0.58, 0x5c271a);
  stairRun(18, 24, -1, 0, 9, 3.2, 1.15, 0.58, 0x5c271a);
  stairRun(-24, 18, 0, -1, 8, 3.2, 1.15, 0.56, 0x3f2024);
  stairRun(24, -18, 0, 1, 8, 3.2, 1.15, 0.56, 0x3f2024);

  // Central high platform for vertical play
  platformOnly(0, 3.4, -12, 20, 0.42, 3, 0x7a351f);
  platformOnly(0, 3.4, 12, 20, 0.42, 3, 0x7a351f);

  platformOnly(0, 6.5, 0, 12, 0.4, 12, 0x8c341f);
  box(-5, 6.5, -5, 1, 1.2, 10, 0x321617); // Low cover wall
  box(5, 6.5, -5, 1, 1.2, 10, 0x321617);  // Low cover wall

  // Lava pits and path pillars
  for (const z of [-18, 18]) {
    decorBox(0, 0.05, z, 22, 0.08, 5, 0xff5a24, 0, 0, emberMat);
    box(-14, 0, z, 3, 1.5, 7, 0x201719);
    box(14, 0, z, 3, 1.5, 7, 0x201719);
  }
  box(-8, 0, 0, 3, 4.5, 22, 0x181012);
  box(8, 0, 0, 3, 4.5, 22, 0x181012);
}

function buildNeedleCorridor(box, platformOnly, decorBox, collidableDecorBox, glassMat, enterableBuilding) {
  const towerMatA = 0x20384f;
  const towerMatB = 0x4f2735;
  const bridgeMat = 0x5ab0ff;
  const coverMat = 0x31424a;

  const windowWall = (x, z, side = 1) => {
    for (let i = -5; i <= 5; i++) {
      const wx = x + i * 18;
      box(wx - 5.2, 0, z, 5.2, 7.2, 1.2, coverMat);
      box(wx + 5.2, 0, z, 5.2, 7.2, 1.2, coverMat);
      box(wx, 5.2, z, 7.2, 1.8, 1.2, coverMat);
      decorBox(wx, 2.3, z - side * 0.68, 5.8, 2.6, 0.18, 0x9ee8ff, 0, 0, glassMat);
    }
  };
  const crossWindowWall = (x, z = 0) => {
    for (const dz of [-12, 0, 12]) {
      box(x, 0, z + dz - 3.8, 1.2, 6.8, 3.4, coverMat);
      box(x, 0, z + dz + 3.8, 1.2, 6.8, 3.4, coverMat);
      box(x, 4.8, z + dz, 1.2, 1.7, 4.2, coverMat);
      decorBox(x + 0.68, 2.1, z + dz, 0.18, 2.4, 3.4, 0x9ee8ff, 0, 0, glassMat);
    }
  };

  const tower = (x, z, color, mirror = 1) => {
    box(x, 0, z, 9, 18, 9, color, false);
    box(x, 18, z, 12, 0.8, 12, color);
    box(x, 36, z, 10, 0.8, 10, color);
    box(x, 54, z, 8, 0.8, 8, color);
    box(x - mirror * 7.5, 8.5, z - 5, 4.6, 0.45, 4.2, 0x5ab0ff);
    box(x + mirror * 4.5, 17.2, z + 5, 4.6, 0.45, 4.2, 0xff6f61);
    box(x - mirror * 7.5, 26.0, z - 5, 4.6, 0.45, 4.2, 0xffd166);
    box(x + mirror * 4.5, 44.5, z + 5, 4.6, 0.45, 4.2, 0x7ee2a8);
    box(x + mirror * 8.5, 17.5, z, 5, 0.45, 4.5, 0xffd166);
    box(x + mirror * 12.5, 35.5, z, 4.2, 0.45, 4.2, 0x7ee2a8);
    box(x - mirror * 4, 0, z + 7, 3.2, 14, 2.4, 0x17242d, false);
  };

  windowWall(0, -17.1, 1);
  windowWall(0, 17.1, -1);
  for (const x of [-72, -36, 0, 36, 72]) crossWindowWall(x);
  tower(-98, -9.5, towerMatA, 1);
  tower(98, 9.5, towerMatB, -1);
  tower(-34, 10.5, 0x2c4059, -1);
  tower(34, -10.5, 0x593442, 1);
  platformOnly(0, 17.8, 0, 42, 0.45, 5.2, bridgeMat);
  platformOnly(0, 35.8, 0, 30, 0.45, 4.4, 0xff6f61);
  platformOnly(-66, 9.2, 0, 18, 0.45, 4.4, 0x7ee2a8);
  platformOnly(66, 9.2, 0, 18, 0.45, 4.4, 0xffd166);

  for (const x of [-78, -52, -18, 18, 52, 78]) {
    box(x, 0, -5.5, 5.2, 4.4, 3.2, 0x40515f);
    box(x + 8, 0, 6.5, 3.2, 6.2, 4.2, 0x243540);
    platformOnly(x + 2, 6.4, 0, 12, 0.45, 3.4, x < 0 ? 0x5ab0ff : 0xff6f61);
  }
}

function buildSkyhookSpires(box, platformOnly, decorBox, collidableDecorBox, glassMat, enterableBuilding, ramp, stairRun) {
  const spire = (x, z, color, accent) => {
    box(x, 0, z, 10, 30, 10, color, false);
    box(x, 30, z, 15, 0.8, 15, accent);
    box(x, 48, z, 12, 0.8, 12, color);
    box(x, 64, z, 9, 0.8, 9, accent);
    box(x + 7, 12, z - 7, 4, 0.5, 4, accent);
    box(x - 7, 26, z + 7, 4, 0.5, 4, color);
    box(x + 7, 38, z - 7, 4, 0.5, 4, accent);
    box(x - 7, 56, z + 7, 4, 0.5, 4, color);
    decorBox(x, 68, z, 7.5, 0.25, 7.5, 0xffffff, 0, 0, glassMat);
  };

  spire(-48, -44, 0x20384f, 0x5ab0ff);
  spire(48, 44, 0x4f2735, 0xff6f61);
  spire(-46, 44, 0x334822, 0x7ee2a8);
  spire(46, -44, 0x5b4920, 0xffd166);
  spire(0, 0, 0x2d3940, 0x9fb5c3);

  platformOnly(0, 30.8, 0, 92, 0.5, 4.8, 0x9fb5c3);
  platformOnly(0, 48.8, 0, 4.8, 0.5, 92, 0x7ee2a8);
  platformOnly(-26, 64.8, 0, 52, 0.45, 4.2, 0xffd166);
  platformOnly(26, 64.8, 0, 52, 0.45, 4.2, 0xff6f61);
  platformOnly(0, 14.5, -24, 42, 0.45, 4.2, 0x5ab0ff);
  platformOnly(0, 14.5, 24, 42, 0.45, 4.2, 0xff6f61);

  for (const [x, z, color] of [[-18, -18, 0x5ab0ff], [18, 18, 0xff6f61], [-18, 18, 0xffd166], [18, -18, 0x7ee2a8]]) {
    box(x, 0, z, 8, 4.5, 8, color);
    platformOnly(x, 8.8, z, 13, 0.45, 13, color);
    box(x + Math.sign(x || 1) * 8, 0, z, 2.4, 12, 2.4, 0x1c252b, false);
  }

  for (const z of [-62, 62]) {
    box(0, 0, z, 54, 7, 2.6, 0x40515f);
    platformOnly(0, 7.4, z, 56, 0.45, 4.2, 0x31424a);
  }
  for (const x of [-62, 62]) {
    box(x, 0, 0, 2.6, 7, 54, 0x40515f);
    platformOnly(x, 7.4, 0, 4.2, 0.45, 56, 0x31424a);
  }

  // --- NEW ADDITIONS FOR OBSTACLE DENSITY ---
  const groundObstacleColor = 0x223344;
  const coverColor = 0x556677;

  // High density of pillars on the ground (to block line of sight and enrich geometry)
  const groundPillars = [
    [-30, -30], [-30, 30], [30, -30], [30, 30],
    [-45, 0], [45, 0], [0, -45], [0, 45],
    [-10, -35], [-35, -10], [10, 35], [35, 10],
    [-20, 0], [20, 0]
  ];
  for (const [px, pz] of groundPillars) {
    box(px, 0, pz, 3.5, 12, 3.5, groundObstacleColor, false);
  }

  // High density of cover boxes (crates) on the ground
  const groundCovers = [
    [-10, -10], [10, -10], [-10, 10], [10, 10],
    [-25, -25], [25, 25], [-25, 25], [25, -25],
    [-5, -20], [5, -20], [-5, 20], [5, 20],
    [-20, -5], [-20, 5], [20, -5], [20, 5],
    [-50, -20], [50, 20], [-50, 20], [50, -20]
  ];
  for (const [cx, cz] of groundCovers) {
    box(cx, 0, cz, 2.5, 2.5, 2.5, coverColor);
  }

  // Cover boxes on platforms at heights (y = 14.5, 30.8, 48.8, 64.8)
  box(0, 14.95, -20, 3, 2, 2.5, coverColor);
  box(0, 14.95, 20, 3, 2, 2.5, coverColor);
  box(-10, 14.95, -24, 3, 2, 2.5, coverColor);
  box(10, 14.95, 24, 3, 2, 2.5, coverColor);

  box(-15, 31.25, 0, 3, 2, 2.5, coverColor);
  box(15, 31.25, 0, 3, 2, 2.5, coverColor);
  box(-35, 31.25, 0, 3, 2, 2.5, coverColor);
  box(35, 31.25, 0, 3, 2, 2.5, coverColor);

  box(0, 49.25, -15, 2.5, 2, 3, coverColor);
  box(0, 49.25, 15, 2.5, 2, 3, coverColor);
  box(0, 49.25, -35, 2.5, 2, 3, coverColor);
  box(0, 49.25, 35, 2.5, 2, 3, coverColor);

  box(-20, 65.25, 0, 3, 2, 2.5, coverColor);
  box(-35, 65.25, 0, 3, 2, 2.5, coverColor);
  box(20, 65.25, 0, 3, 2, 2.5, coverColor);
  box(35, 65.25, 0, 3, 2, 2.5, coverColor);

  // --- NEW INTERMEDIATE PLATFORMS ---
  // Level 14.5 to 30.8 intermediate
  platformOnly(32, 22.6, -15, 8, 0.5, 8, 0x4f2735);
  platformOnly(-32, 22.6, 15, 8, 0.5, 8, 0x20384f);
  // Level 30.8 to 48.8 intermediate
  platformOnly(18, 39.8, 26, 8, 0.5, 8, 0x334822);
  platformOnly(-18, 39.8, -26, 8, 0.5, 8, 0x5b4920);
  // Level 48.8 to 64.8 intermediate
  platformOnly(12, 56.8, 12, 8, 0.5, 8, 0x9fb5c3);
  platformOnly(-12, 56.8, -12, 8, 0.5, 8, 0x2d3940);

  // --- NEW WALKWAY RAMPS FOR ZERO-JUMP CLIMBING ---
  // 1. Ground (0) to Perimeter Platform (7.4)
  ramp(-34, 0, -62, 4.2, 12.0, 7.4, Math.PI / 2, 0x5ab0ff); // rises along +X
  ramp(34, 0, 62, 4.2, 12.0, 7.4, -Math.PI / 2, 0xff6f61); // rises along -X
  ramp(-62, 0, -34, 4.2, 12.0, 7.4, 0, 0x7ee2a8);          // rises along +Z
  ramp(62, 0, 34, 4.2, 12.0, 7.4, Math.PI, 0xffd166);       // rises along -Z

  // 2. Perimeter (7.4) to 8.8 platforms
  ramp(-18, 7.4, -28.25, 4.2, 7.5, 1.4, 0, 0x5ab0ff);        // rises along +Z
  ramp(18, 7.4, 28.25, 4.2, 7.5, 1.4, Math.PI, 0xff6f61);    // rises along -Z
  ramp(-28.25, 7.4, 18, 4.2, 7.5, 1.4, Math.PI / 2, 0xffd166); // rises along +X
  ramp(28.25, 7.4, -18, 4.2, 7.5, 1.4, -Math.PI / 2, 0x7ee2a8); // rises along -X

  // 3. 8.8 platforms to 14.5 platforms
  ramp(-13, 8.8, -24, 4.2, 10.0, 5.7, Math.PI / 2, 0x5ab0ff); // rises along +X to y=14.5
  ramp(13, 8.8, 24, 4.2, 10.0, 5.7, -Math.PI / 2, 0xff6f61);  // rises along -X to y=14.5

  // 4. 14.5 platforms to 30.8 platform
  ramp(23, 14.5, -24, 4.2, 10.0, 8.1, Math.PI / 2, 0x4f2735); // rises along +X to Intermediate (y=22.6)
  ramp(32, 22.6, -8.7, 4.2, 12.6, 8.2, 0, 0x9fb5c3);         // rises along +Z to 30.8 platform (y=30.8)
  ramp(-23, 14.5, 24, 4.2, 10.0, 8.1, -Math.PI / 2, 0x20384f); // rises along -X to Intermediate (y=22.6)
  ramp(-32, 22.6, 8.7, 4.2, 12.6, 8.2, Math.PI, 0x9fb5c3);    // rises along -Z to 30.8 platform (y=30.8)

  // 5. 30.8 platform to 48.8 platform
  ramp(13, 30.8, 26, 4.2, 10.0, 9.0, Math.PI / 2, 0x334822);  // rises along +X to Intermediate (y=39.8)
  ramp(10.2, 39.8, 26, 4.2, 15.6, 9.0, -Math.PI / 2, 0x7ee2a8); // rises along -X to 48.8 platform (y=48.8)
  ramp(-13, 30.8, -26, 4.2, 10.0, 9.0, -Math.PI / 2, 0x5b4920); // rises along -X to Intermediate (y=39.8)
  ramp(-10.2, 39.8, -26, 4.2, 15.6, 9.0, Math.PI / 2, 0x7ee2a8); // rises along +X to 48.8 platform (y=48.8)

  // 6. 48.8 platform to 64.8 platforms
  ramp(12, 48.8, 17, 4.2, 10.0, 8.0, Math.PI, 0x9fb5c3);       // rises along -Z to Intermediate (y=56.8)
  ramp(12, 56.8, 7.05, 4.2, 9.9, 8.0, Math.PI, 0xff6f61);      // rises along -Z to 64.8 platform (y=64.8)
  ramp(-12, 48.8, -17, 4.2, 10.0, 8.0, 0, 0x2d3940);           // rises along +Z to Intermediate (y=56.8)
  ramp(-12, 56.8, -7.05, 4.2, 9.9, 8.0, 0, 0xffd166);          // rises along +Z to 64.8 platform (y=64.8)
}

export function getArenaFloorDefs(theme = fpsArenaThemes[game.fpsMapIndex] || fpsArenaThemes[0]) {
  if (Array.isArray(theme.floors)) return theme.floors;
  if (theme.shape === "circle") return [{ type: "circle", x: 0, z: 0, r: theme.bounds.x }];
  return [{ x: 0, z: 0, sx: theme.bounds.x * 2, sz: theme.bounds.z * 2 }];
}

export function getArenaSpawnPoints(theme = fpsArenaThemes[game.fpsMapIndex] || fpsArenaThemes[0]) {
  return theme.spawnPoints || [{ x: -42, z: 0 }, { x: 42, z: 0 }];
}

export function isPointInsideArena(point, floors = world.arenaFloors, margin = 0) {
  if (!floors || floors.length === 0) return true;
  return floors.some((floor) => {
    if (floor.type === "circle") {
      return Math.hypot(point.x - floor.x, point.z - floor.z) <= floor.r - margin;
    }
    return point.x >= floor.x - floor.sx / 2 + margin &&
      point.x <= floor.x + floor.sx / 2 - margin &&
      point.z >= floor.z - floor.sz / 2 + margin &&
      point.z <= floor.z + floor.sz / 2 - margin;
  });
}

export function isBoxInsideArena(box, floors = world.arenaFloors, margin = 0) {
  const corners = [
    { x: box.x - box.sx / 2, z: box.z - box.sz / 2 },
    { x: box.x + box.sx / 2, z: box.z - box.sz / 2 },
    { x: box.x - box.sx / 2, z: box.z + box.sz / 2 },
    { x: box.x + box.sx / 2, z: box.z + box.sz / 2 }
  ];
  return corners.every((corner) => isPointInsideArena(corner, floors, margin));
}

export function clampArenaPosition(position, radius = 0.5, floors = world.arenaFloors) {
  if (isPointInsideArena(position, floors, radius)) return position;
  let best = null;
  let bestDist = Infinity;
  for (const floor of floors) {
    let candidate;
    if (floor.type === "circle") {
      const dx = position.x - floor.x;
      const dz = position.z - floor.z;
      const len = Math.max(0.0001, Math.hypot(dx, dz));
      const r = Math.max(0, floor.r - radius);
      candidate = new THREE.Vector3(floor.x + (dx / len) * r, position.y, floor.z + (dz / len) * r);
    } else {
      candidate = new THREE.Vector3(
        Math.max(floor.x - floor.sx / 2 + radius, Math.min(floor.x + floor.sx / 2 - radius, position.x)),
        position.y,
        Math.max(floor.z - floor.sz / 2 + radius, Math.min(floor.z + floor.sz / 2 - radius, position.z))
      );
    }
    const dist = Math.hypot(candidate.x - position.x, candidate.z - position.z);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  if (best) {
    position.x = best.x;
    position.z = best.z;
  }
  return position;
}

function makePerimeterWalls(floors, edgeH) {
  const walls = [];
  for (const floor of floors) {
    if (floor.type === "circle") {
      for (let i = 0; i < 24; i++) {
        const angle = (i / 24) * Math.PI * 2;
        walls.push({
          x: floor.x + Math.sin(angle) * floor.r,
          z: floor.z + Math.cos(angle) * floor.r,
          sx: (Math.PI * floor.r * 2) / 24,
          sy: edgeH,
          sz: 0.55,
          rot: angle
        });
      }
      continue;
    }
    addExposedSide(walls, floors, floor, "top", edgeH);
    addExposedSide(walls, floors, floor, "bottom", edgeH);
    addExposedSide(walls, floors, floor, "left", edgeH);
    addExposedSide(walls, floors, floor, "right", edgeH);
  }
  return walls;
}

function addExposedSide(walls, floors, floor, side, edgeH) {
  const horizontal = side === "top" || side === "bottom";
  const min = horizontal ? floor.x - floor.sx / 2 : floor.z - floor.sz / 2;
  const max = horizontal ? floor.x + floor.sx / 2 : floor.z + floor.sz / 2;
  const fixed = side === "top" ? floor.z - floor.sz / 2 : side === "bottom" ? floor.z + floor.sz / 2 : side === "left" ? floor.x - floor.sx / 2 : floor.x + floor.sx / 2;
  const probeOffset = side === "top" || side === "left" ? -0.55 : 0.55;
  let start = min;
  const step = 6;
  while (start < max - 0.01) {
    const end = Math.min(max, start + step);
    const mid = (start + end) / 2;
    const probe = horizontal ? { x: mid, z: fixed + probeOffset } : { x: fixed + probeOffset, z: mid };
    if (!isPointInsideArena(probe, floors, 0)) {
      const len = end - start;
      walls.push(horizontal
        ? { x: mid, z: fixed, sx: len, sy: edgeH, sz: 0.55 }
        : { x: fixed, z: mid, sx: 0.55, sy: edgeH, sz: len });
    }
    start = end;
  }
}

function hasExternalMapContent(theme) {
  return Array.isArray(theme?.boxes) || Array.isArray(theme?.platforms) || Array.isArray(theme?.ramps) || Array.isArray(theme?.collision) || Array.isArray(theme?.decor);
}

function applyFpsMapContent(map, box, platformOnly, decorBox, collidableDecorBox, ramp) {
  for (const item of map.boxes || []) {
    if (item.decor) addMapDecor(item, decorBox, collidableDecorBox);
    else if (item.platformOnly) addMapPlatform(item, platformOnly);
    else addMapBox(item, box);
  }
  for (const item of map.platforms || []) addMapPlatform(item, platformOnly);
  for (const item of map.ramps || []) addMapRamp(item, ramp);
  for (const item of map.collision || []) addMapCollision(item, box);
  for (const item of map.decor || []) addMapDecor(item, decorBox, collidableDecorBox);
}

function addMapBox(item, box) {
  const mesh = box(
    item.x, item.y || 0, item.z,
    item.sx || 3, item.sy || 2, item.sz || 3,
    Number(item.color ?? 0x555555),
    item.isPlatform !== false
  );
  applyMapObjectFlags(mesh, item);
}

function addMapPlatform(item, platformOnly) {
  const mesh = platformOnly(
    item.x, item.y || 0, item.z,
    item.sx || 3, item.sy || 0.5, item.sz || 3,
    Number(item.color ?? 0x555555)
  );
  applyMapObjectFlags(mesh, item);
}

function addMapRamp(item, ramp) {
  const mesh = ramp(
    item.x, item.y ?? 1, item.z,
    item.width ?? item.sx ?? 4,
    item.length ?? item.sz ?? 8,
    item.height ?? item.sy ?? 2,
    item.rot ?? item.rotY ?? 0,
    Number(item.color ?? 0x5ab0ff)
  );
  applyMapObjectFlags(mesh, item);
}

function addMapCollision(item, box) {
  const mesh = box(
    item.x, item.y || 0, item.z,
    item.sx || 3, item.sy || 2, item.sz || 3,
    Number(item.color ?? 0xff00ff),
    item.isPlatform === true
  );
  applyMapObjectFlags(mesh, { ...item, visible: item.visible === true });
}

function addMapDecor(item, decorBox, collidableDecorBox) {
  const add = item.collidable ? collidableDecorBox : decorBox;
  const mesh = add(
    item.x, item.y || 0, item.z,
    item.sx || 2, item.sy || 2, item.sz || 2,
    Number(item.color ?? 0x78e0ff),
    item.rotX || 0,
    item.rotY || 0
  );
  applyMapObjectFlags(mesh, item);
}

function applyMapObjectFlags(mesh, item) {
  if (!mesh) return;
  if (item.rotX !== undefined || item.rotY !== undefined || item.rotZ !== undefined) {
    mesh.rotation.set(item.rotX || 0, item.rotY || 0, item.rotZ || 0);
  }
  if (item.name) mesh.name = item.name;
  if (item.visible === false) mesh.visible = false;
  if (item.collidable === false) {
    world.obstacles = world.obstacles.filter((obstacle) => obstacle !== mesh);
    world.platforms = world.platforms.filter((platform) => platform !== mesh);
    mesh.userData.nonCollidable = true;
  }
}

function applyCustomArenaMap(box, platformOnly, decorBox, collidableDecorBox, ramp) {
  const map = game.fpsCustomMap;
  if (!map) return;
  applyFpsMapContent(map, box, platformOnly, decorBox, collidableDecorBox, ramp);
}

function loadImportedArenaAssets(theme) {
  for (const asset of theme.assets || []) loadArenaAsset(asset);
  for (const asset of game.fpsCustomMap?.assets || []) loadArenaAsset(asset);
  const url = game.fpsImportedAssetUrl?.trim();
  if (url) loadArenaAsset({ url, collidable: true });
}

function loadArenaAsset(asset) {
  const url = typeof asset === "string" ? asset : asset?.url;
  if (!url) return;
  const spec = typeof asset === "string" ? {} : asset;
  const loader = new GLTFLoader();
  loader.load(url, (gltf) => {
    const root = gltf.scene;
    const pos = spec.position || {};
    const rot = spec.rotation || {};
    const scale = spec.scale || 1;
    root.position.set(pos.x || 0, pos.y || 0, pos.z || 0);
    root.rotation.set(rot.x || 0, rot.y || 0, rot.z || 0);
    if (typeof scale === "number") root.scale.setScalar(scale);
    else root.scale.set(scale.x || 1, scale.y || 1, scale.z || 1);
    root.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (spec.collidable === true) world.obstacles.push(child);
      }
    });
    world.arenaRoot.add(root);
  }, undefined, () => {
    console.warn(`Could not load arena asset: ${url}`);
  });
}

export function makePlayerMesh(material) {
  const group = new THREE.Group();
  const armorMat = new THREE.MeshStandardMaterial({ color: 0x161d22, roughness: 0.45, metalness: 0.25 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x8ff7ff });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0d1114, roughness: 0.5, metalness: 0.45 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.94, 8, 18), material);
  body.position.y = 0.89;
  body.castShadow = true;

  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.6, 0.14), armorMat);
  chestPlate.position.set(0, 1.05, -0.3);
  chestPlate.castShadow = true;

  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.1, 0.22), darkMat);
  belt.position.set(0, 0.55, -0.05);

  const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), armorMat);
  shoulderL.position.set(-0.5, 1.25, -0.04);
  shoulderL.scale.set(1.15, 0.72, 0.9);
  const shoulderR = shoulderL.clone();
  shoulderR.position.x = 0.5;

  const headGroup = new THREE.Group();
  headGroup.name = "headGroup";
  headGroup.position.y = 1.58;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 16), material);
  head.castShadow = true;

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), eyeMat);
  eyeL.position.set(-0.105, 0.04, -0.265);
  eyeL.scale.set(1.15, 0.82, 0.32);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.105;

  headGroup.add(head, eyeL, eyeR);

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.48, 12), armorMat);
  legL.position.set(-0.2, 0.3, 0);
  legL.castShadow = true;

  const legR = legL.clone();
  legR.position.x = 0.2;

  const footL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.24), darkMat);
  footL.position.set(-0.2, 0.04, -0.06);
  footL.castShadow = true;

  const footR = footL.clone();
  footR.position.x = 0.2;

  group.add(body, chestPlate, belt, shoulderL, shoulderR, headGroup, legL, legR, footL, footR);

  const gunPart = new THREE.Group();
  gunPart.name = "gun";
  gunPart.position.set(0.32, -0.08, -0.3);
  gunPart.rotation.set(0.05, -0.1, 0.08);
  headGroup.add(gunPart);

  const meleePart = new THREE.Group();
  meleePart.name = "melee";
  meleePart.position.set(0.05, 0.08, -0.16);
  meleePart.rotation.set(0.35, -0.25, -0.5);
  meleePart.visible = false;
  headGroup.add(meleePart);

  return group;
}
