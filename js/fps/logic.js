import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import { game, world, fps } from "../core/state.js";
import { materials, scene, lights } from "../core/engine.js";
import { fpsArenaThemes } from "./themes.js";
import { makeRampMesh } from "../core/ramps.js";
import { buildTriangleMeshColliderFromObject } from "./mesh-collision.js";
import { makePlayerMesh } from "./player-mesh.js";

export function setupArena() {
  const mapIndex = game.fpsMapIndex || 0;
  const theme = fpsArenaThemes[mapIndex] || fpsArenaThemes[0];
  const activeMap = (game.fpsCustomMapActive && game.fpsCustomMap) ? game.fpsCustomMap : theme;
  const boundsX = activeMap.bounds?.x ?? theme.bounds.x;
  const boundsZ = activeMap.bounds?.z ?? theme.bounds.z;
  const gridSize = Math.max(boundsX, boundsZ) * 2;
  const floorDefs = getArenaFloorDefs(theme);
  const generatedArenaFrame = shouldUseGeneratedArenaFrame(activeMap);

  applyFpsArenaTheme(theme);

  // Clear existing arena objects
  while (world.arenaRoot.children.length > 0) {
    const child = world.arenaRoot.children[0];
    world.arenaRoot.remove(child);
  }

  // Reset world obstacles and platforms
  world.obstacles = [];
  world.platforms = [];
  world.meshColliders = [];
  world.ramps = [];
  world.lasers = [];
  world.grenades = [];
  world.smokeClouds = [];
  world.explosions = [];
  world.arenaFloors = floorDefs.map((floor) => ({ ...floor }));
  world.arenaFloorCollision = activeMap.floorCollision !== false;
  world.arenaSpawnPoints = getArenaSpawnPoints(theme);

  // Cache materials to avoid redundant objects and group identical visual components
  const materialCache = new Map();
  const getMaterial = (color, roughness, metalness = 0.0, transparent = false, opacity = 1.0) => {
    const key = `${color}_${roughness}_${metalness}_${transparent}_${opacity}`;
    if (!materialCache.has(key)) {
      materialCache.set(key, new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness,
        transparent,
        opacity
      }));
    }
    return materialCache.get(key);
  };

  const floorMat = getMaterial(activeMap.floor ?? theme.floor, 0.88);
  const staticMeshes = [];

  const addFloor = (x, z, sx, sz) => {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.5, sz), floorMat);
    floor.position.set(x, -0.25, z);
    staticMeshes.push(floor);
  };

  if (generatedArenaFrame) {
    for (const floor of floorDefs) {
      if (floor.type === "circle") {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(floor.r, floor.r, 0.5, 80), floorMat);
        mesh.position.set(floor.x, -0.25, floor.z);
        staticMeshes.push(mesh);
      } else {
        addFloor(floor.x, floor.z, floor.sx, floor.sz);
      }
    }
  }

  // Grid overlay
  if (generatedArenaFrame && (!activeMap.floors || activeMap.floors.length > 0)) {
    const grid = new THREE.GridHelper(gridSize, gridSize / 2, activeMap.gridA ?? theme.gridA, activeMap.gridB ?? theme.gridB);
    grid.position.y = 0.02;
    world.arenaRoot.add(grid);
  }

  const skyShell = new THREE.Mesh(
    new THREE.SphereGeometry(170, 32, 16),
    new THREE.MeshBasicMaterial({ color: brightenArenaColor(theme.sky, 0.64, 0.34), side: THREE.BackSide })
  );
  skyShell.position.y = 28;
  world.arenaRoot.add(skyShell);

  // Thin perimeter walls. They join world.obstacles so they are real for
  // combat: hitscan stops at the border, grenades bounce, and ricochet orbs
  // reflect off the wall face instead of ghosting through it.
  if (generatedArenaFrame) {
    const edgeMat = getMaterial(activeMap.edge ?? theme.edge, 0.75, 0.22);
    const edgeH = 8.0;
    const wallDefs = makePerimeterWalls(floorDefs, edgeH);
    for (const w of wallDefs) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w.sx, w.sy, w.sz), edgeMat);
      mesh.position.set(w.x, w.sy / 2, w.z);
      mesh.rotation.y = w.rot || 0;
      mesh.userData.isArenaWall = true;
      staticMeshes.push(mesh);
      world.obstacles.push(mesh);
    }
  }

  // Spawn pads
  const showSpawnPads = activeMap.showSpawnPads ?? generatedArenaFrame;
  if (showSpawnPads) {
    const spawnPads = getArenaSpawnPoints(theme).map((spawn, index) => ({
      ...spawn,
      mat: playerMaterial(index)
    }));
    for (const pad of spawnPads) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.08, 42), pad.mat);
      ring.position.set(pad.x, pad.y ?? 0.05, pad.z);
      ring.receiveShadow = true;
      world.arenaRoot.add(ring);
    }
  }

  world.playerMeshes = [];
  for (let i = 0; i < fps.players.length; i++) {
    const mesh = makePlayerMesh(playerMaterial(i));
    mesh.position.copy(fps.players[i].pos);
    world.playerMeshes.push(mesh);
    world.arenaRoot.add(mesh);
  }

  // Obstacles and Platforms (Shared helpers)
  const obstacleMat = getMaterial(0x444444, 0.7);

  const box = (x, y, z, sx, sy, sz, color = 0x444444, isPlatform = true) => {
    if (!isBoxInsideArena({ x, z, sx, sz }, floorDefs, 0.2)) return null;
    const mat = color === 0x444444 ? obstacleMat : getMaterial(color, 0.7);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(x, y + sy / 2, z);
    staticMeshes.push(mesh);
    world.obstacles.push(mesh);
    if (isPlatform) world.platforms.push(mesh);
    return mesh;
  };

  const platformOnly = (x, y, z, sx, sy, sz, color = 0x555555) => {
    if (!isBoxInsideArena({ x, z, sx, sz }, floorDefs, 0.2)) return null;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(sx, sy, sz),
      getMaterial(color, 0.68)
    );
    mesh.position.set(x, y + sy / 2, z);
    staticMeshes.push(mesh);
    world.platforms.push(mesh);
    world.obstacles.push(mesh);
    return mesh;
  };

  const decorBox = (x, y, z, sx, sy, sz, color = 0x78e0ff, rotX = 0, rotY = 0, material = null) => {
    if (!isPointInsideArena({ x, z }, floorDefs, 0.2)) return null;
    const mat = material || getMaterial(color, 0.58, 0.08);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(x, y + sy / 2, z);
    mesh.rotation.set(rotX, rotY, 0);
    staticMeshes.push(mesh);
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
      getMaterial(color, 0.68),
      { surfaceOffset: 0 }
    );
    world.arenaRoot.add(mesh);
    world.ramps.push(mesh.userData.ramp);
    world.obstacles.push(mesh);
    return mesh;
  };

  if (game.fpsCustomMapActive && game.fpsCustomMap) {
    applyCustomArenaMap(box, platformOnly, decorBox, collidableDecorBox, ramp);
  } else {
    // Every shipped map carries its geometry as external JSON content (boxes /
    // platforms / ramps / decor / collision) or a GLB. The old per-map procedural
    // builders were unreachable and have been removed; a theme with no external
    // content renders as the empty arena frame built above.
    if (hasExternalMapContent(theme)) applyFpsMapContent(theme, box, platformOnly, decorBox, collidableDecorBox, ramp);
    applyCustomArenaMap(box, platformOnly, decorBox, collidableDecorBox, ramp);
  }
  loadImportedArenaAssets(theme);

  // Merge static geometries to optimize draw calls and GPU rendering
  const mergeGroups = new Map();
  for (const mesh of staticMeshes) {
    if (mesh.visible === false) continue;
    
    // Ensure world matrix is up-to-date
    mesh.updateMatrix();
    mesh.updateMatrixWorld(true);
    
    const mat = mesh.material;
    if (!mergeGroups.has(mat)) {
      mergeGroups.set(mat, []);
    }
    mergeGroups.get(mat).push(mesh);
  }

  for (const [mat, meshes] of mergeGroups.entries()) {
    if (meshes.length === 0) continue;
    
    const geometries = meshes.map(m => {
      const geo = m.geometry.clone();
      geo.applyMatrix4(m.matrix);
      return geo;
    });
    
    try {
      const mergedGeo = BufferGeometryUtils.mergeGeometries(geometries, true);
      const mergedMesh = new THREE.Mesh(mergedGeo, mat);
      mergedMesh.castShadow = true;
      mergedMesh.receiveShadow = true;
      world.arenaRoot.add(mergedMesh);
    } catch (err) {
      console.warn("Could not merge geometries for material", mat, err);
      // Fallback: add individual meshes directly to the scene
      for (const m of meshes) {
        m.castShadow = true;
        m.receiveShadow = true;
        world.arenaRoot.add(m);
      }
    }
  }

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

function brightenArenaColor(hex, minLightness = 0.54, minSaturation = 0.24) {
  const color = new THREE.Color(hex ?? 0x8fd3f4);
  const hsl = {};
  color.getHSL(hsl);
  hsl.s = Math.max(hsl.s, minSaturation);
  hsl.l = Math.max(hsl.l, minLightness);
  return color.setHSL(hsl.h, hsl.s, hsl.l);
}

function applyFpsArenaTheme(theme) {
  const sky = brightenArenaColor(theme.sky, 0.64, 0.34);
  const fog = brightenArenaColor(theme.fog ?? theme.sky, 0.54, 0.24);
  scene.background = sky;
  scene.fog = new THREE.Fog(fog, theme.fogNear, theme.fogFar);
  if (lights.hemi) {
    lights.hemi.color.setHex(0xf4fbff);
    lights.hemi.groundColor.setHex(0x8ea06d);
    lights.hemi.intensity = 3.05;
  }
  if (lights.sun) {
    lights.sun.color.setHex(0xffffff);
    lights.sun.intensity = 3.65;
    lights.sun.position.set(14, 26, 10);
  }
}

function playerMaterial(index) {
  const palette = [materials.blue, materials.coral, materials.gold, materials.mint || materials.green, materials.wall];
  return palette[index % palette.length] || materials.blue;
}

function shouldUseGeneratedArenaFrame(map) {
  if (!map) return true;
  if (map.generatedArena === false || map.glbOnly === true || map.showGeneratedArena === false) return false;
  if (map.generatedArena === true || map.showGeneratedArena === true) return true;

  const glbSpec = typeof map.glb === "object" ? map.glb : null;
  const collisionMode = glbSpec?.collisionMode ?? glbSpec?.collision ?? map.glbCollision ?? map.collisionMode;
  const meshCollision = glbSpec?.meshCollision === true || map.glbMeshCollision === true || map.meshCollision === true || collisionMode === "mesh";
  return !(map.glb && meshCollision && map.floorCollision === false);
}

export function getArenaFloorDefs(theme = fpsArenaThemes[game.fpsMapIndex] || fpsArenaThemes[0]) {
  const map = (game.fpsCustomMapActive && game.fpsCustomMap) ? game.fpsCustomMap : theme;
  if (Array.isArray(map.floors)) return map.floors;
  if (map.shape === "circle") return [{ type: "circle", x: 0, z: 0, r: map.bounds.x }];
  return [{ x: 0, z: 0, sx: map.bounds.x * 2, sz: map.bounds.z * 2 }];
}

function spawnCandidateInsideFloor(point, floor, margin = 3.2) {
  if (floor.type === "circle") return Math.hypot(point.x - floor.x, point.z - floor.z) <= Math.max(0, (floor.r || 0) - margin);
  return point.x >= floor.x - floor.sx / 2 + margin && point.x <= floor.x + floor.sx / 2 - margin &&
    point.z >= floor.z - floor.sz / 2 + margin && point.z <= floor.z + floor.sz / 2 - margin;
}

function spawnCandidateInRotatedBox(point, item, margin = 1.4) {
  const rot = Number(item.rot ?? item.rotY ?? 0);
  const dx = point.x - Number(item.x || 0);
  const dz = point.z - Number(item.z || 0);
  const c = Math.cos(-rot);
  const s = Math.sin(-rot);
  const localX = dx * c - dz * s;
  const localZ = dx * s + dz * c;
  return Math.abs(localX) <= Number(item.sx || 0) / 2 + margin &&
    Math.abs(localZ) <= Number(item.sz || 0) / 2 + margin;
}

function spawnCandidateBlockedByMap(point, map) {
  const blocks = [];
  if (Array.isArray(map.boxes)) blocks.push(...map.boxes);
  if (Array.isArray(map.collision)) blocks.push(...map.collision);
  if (Array.isArray(map.platforms)) blocks.push(...map.platforms);
  if (Array.isArray(map.decor)) blocks.push(...map.decor.filter((item) => item.collidable || item.isPlatform));
  for (const item of blocks) {
    if (!item || item.collidable === false || item.spawnPassable) continue;
    const y = Number(item.y || 0);
    const sy = Number(item.sy || 0);
    if (point.y !== undefined && y + sy <= point.y + 0.2) continue;
    // High walkable decks/roofs can be valid spawn surfaces; ground-level
    // solids (buildings, cars, crates) must not overlap a generated spawn.
    const highWalkable = (item.platformOnly || item.isPlatform) && y > 1.5;
    if (!highWalkable && y <= 2.2 && sy > 0.25 && spawnCandidateInRotatedBox(point, item)) return true;
  }
  return false;
}

function spawnGenerationFloors(map) {
  if (Array.isArray(map.floors) && map.floors.length) return map.floors;
  if (Array.isArray(map.platforms) && map.platforms.length) {
    return map.platforms
      .filter((platform) => platform && Number(platform.sx || 0) >= 3 && Number(platform.sz || 0) >= 3)
      .map((platform) => ({
        x: Number(platform.x || 0),
        z: Number(platform.z || 0),
        sx: Number(platform.sx || 1),
        sz: Number(platform.sz || 1),
        y: Number(platform.y || 0) + Number(platform.sy || 0) + 0.05
      }));
  }
  if (map.shape === "circle") return [{ type: "circle", x: 0, z: 0, r: map.bounds?.x || 42 }];
  return [{ x: 0, z: 0, sx: (map.bounds?.x || 42) * 2, sz: (map.bounds?.z || 42) * 2 }];
}

function generateAdditionalSpawnPoints(map, baseSpawns, desiredCount) {
  const floors = spawnGenerationFloors(map);
  const candidates = [];
  const addCandidate = (x, z, y = undefined) => {
    const point = { x: Number(x.toFixed(2)), z: Number(z.toFixed(2)) };
    if (Number.isFinite(y)) point.y = Number(y.toFixed(2));
    if (!floors.some((floor) => spawnCandidateInsideFloor(point, floor))) return;
    if (baseSpawns.some((spawn) => Math.hypot(point.x - Number(spawn.x || 0), point.z - Number(spawn.z || 0)) < 7.5)) return;
    if (spawnCandidateBlockedByMap(point, map)) return;
    candidates.push(point);
  };
  for (const floor of floors) {
    if (floor.type === "circle") {
      const r = Math.max(5, (floor.r || 42) - 4);
      addCandidate(floor.x || 0, floor.z || 0, floor.y);
      for (const ring of [0.42, 0.72, 0.92]) {
        const count = Math.max(6, Math.ceil(r * ring / 8));
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + ring;
          addCandidate((floor.x || 0) + Math.cos(a) * r * ring, (floor.z || 0) + Math.sin(a) * r * ring, floor.y);
        }
      }
    } else {
      const cols = Math.max(3, Math.min(9, Math.ceil((floor.sx || 84) / 28)));
      const rows = Math.max(3, Math.min(7, Math.ceil((floor.sz || 84) / 22)));
      for (let ix = 0; ix < cols; ix++) {
        for (let iz = 0; iz < rows; iz++) {
          const x = (floor.x || 0) - floor.sx / 2 + ((ix + 0.5) / cols) * floor.sx;
          const z = (floor.z || 0) - floor.sz / 2 + ((iz + 0.5) / rows) * floor.sz;
          addCandidate(x, z, floor.y);
        }
      }
      addCandidate(floor.x || 0, floor.z || 0, floor.y);
    }
  }
  const selected = [];
  const used = [...baseSpawns];
  while (baseSpawns.length + selected.length < desiredCount && candidates.length) {
    let bestIndex = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const minDist = Math.min(...used.map((spawn) => Math.hypot(candidate.x - Number(spawn.x || 0), candidate.z - Number(spawn.z || 0))));
      if (minDist > bestScore) { bestScore = minDist; bestIndex = i; }
    }
    if (bestIndex < 0 || bestScore < 6) break;
    const [chosen] = candidates.splice(bestIndex, 1);
    selected.push(chosen);
    used.push(chosen);
  }
  return selected;
}

// Farthest-point selection: from a pool of candidate spawns pick `count` that
// are mutually as far apart as possible. Seeded by the widest pair, then each
// next pick maximises its distance to the nearest already-chosen spawn. Pure and
// deterministic so every client derives the same spawn for the same player index.
function spreadSpawnSelection(spawns, count) {
  if (!Array.isArray(spawns) || spawns.length <= count) return spawns;
  const pts = spawns.map((s) => ({ s, x: Number(s.x || 0), z: Number(s.z || 0) }));
  let a = 0, b = 1, widest = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
      if (d > widest) { widest = d; a = i; b = j; }
    }
  }
  const chosen = [pts[a], pts[b]];
  const remaining = pts.filter((_, i) => i !== a && i !== b);
  while (chosen.length < count && remaining.length) {
    let bestIdx = 0, bestMin = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      let minDist = Infinity;
      for (const c of chosen) minDist = Math.min(minDist, Math.hypot(remaining[i].x - c.x, remaining[i].z - c.z));
      if (minDist > bestMin) { bestMin = minDist; bestIdx = i; }
    }
    chosen.push(remaining.splice(bestIdx, 1)[0]);
  }
  return chosen.map((c) => c.s);
}

export function getArenaSpawnPoints(theme = fpsArenaThemes[game.fpsMapIndex] || fpsArenaThemes[0]) {
  const fallbackMap = {
    bounds: { x: 42, z: 42 },
    spawnPoints: [{ x: -42, z: 0 }, { x: 42, z: 0 }]
  };
  const map = (game.fpsCustomMapActive && game.fpsCustomMap) ? game.fpsCustomMap : (theme || fallbackMap);
  const baseSpawns = (Array.isArray(map.spawnPoints) && map.spawnPoints.length)
    ? map.spawnPoints
    : [{ x: -42, z: 0 }, { x: 42, z: 0 }];
  const desiredCount = Math.max(2, game.playerCount || 2);
  // Two-player duels keep their hand-placed spawns exactly as designed.
  if (desiredCount <= 2) return baseSpawns;
  // For 3+ players, top up with generated pads when the map is short on spawns,
  // then pick the most spread-out subset so extra players never start clustered.
  const pool = baseSpawns.length >= desiredCount
    ? baseSpawns
    : [...baseSpawns, ...generateAdditionalSpawnPoints(map, baseSpawns, desiredCount)];
  return spreadSpawnSelection(pool, desiredCount);
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
  return theme?.glb || Array.isArray(theme?.assets) || Array.isArray(theme?.boxes) || Array.isArray(theme?.platforms) || Array.isArray(theme?.ramps) || Array.isArray(theme?.collision) || Array.isArray(theme?.decor);
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

function mapGlbAssetSpec(map) {
  if (!map?.glb) return null;
  const spec = typeof map.glb === "string" ? { url: map.glb } : { ...map.glb };
  spec.collisionMode = spec.collisionMode ?? spec.collision ?? map.glbCollision ?? map.collisionMode;
  spec.meshCollision = spec.meshCollision ?? map.glbMeshCollision ?? map.meshCollision ?? (spec.collisionMode === "mesh");
  spec.collidable = spec.collidable ?? (map.glbCollidable !== false);
  spec.scale = spec.scale ?? map.glbScale ?? map.modelScale;
  spec.position = spec.position ?? map.glbPosition ?? map.modelPosition;
  spec.rotation = spec.rotation ?? map.glbRotation ?? map.modelRotation;
  spec.meshWalkableNormalY = spec.meshWalkableNormalY ?? map.meshWalkableNormalY;
  spec.meshCollisionCellSize = spec.meshCollisionCellSize ?? map.meshCollisionCellSize;
  return spec;
}

function loadImportedArenaAssets(theme) {
  const themeGlb = mapGlbAssetSpec(theme);
  if (themeGlb) loadArenaAsset(themeGlb);
  const customGlb = mapGlbAssetSpec(game.fpsCustomMap);
  if (customGlb) loadArenaAsset(customGlb);
  for (const asset of theme?.assets || []) loadArenaAsset(asset);
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
    root.updateMatrixWorld(true);
    if (spec.meshCollision === true || spec.collisionMode === "mesh") {
      const collider = buildTriangleMeshColliderFromObject(root, {
        source: url,
        cellSize: spec.collisionCellSize || spec.meshCollisionCellSize || 6,
        walkableNormalY: spec.walkableNormalY || spec.meshWalkableNormalY || 0.42,
        includeInvisible: spec.includeInvisibleCollision !== false
      });
      if (collider) {
        world.meshColliders.push(collider);
        game.jetpackHeightLimit = Math.max(game.jetpackHeightLimit || 0, collider.bbox.max.y + 15.0);
        console.info(`Triangle mesh collider ready: ${url} (${collider.triangles.length} triangles)`);
      }
    }
    root.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (spec.collidable === true && spec.meshCollision !== true && spec.collisionMode !== "mesh") world.obstacles.push(child);
      }
    });
    world.arenaRoot.add(root);
  }, undefined, () => {
    console.warn(`Could not load arena asset: ${url}`);
  });
}

export { makePlayerMesh };
