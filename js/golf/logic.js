import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { game, world, input } from "../core/state.js";
import { materials } from "../core/engine.js";
import { holeCatalog } from "./catalog.js";
import { CUP_SURFACE_Y, HOLES_PER_TOURNAMENT } from "../core/constants.js";

export const holes = [];

export function resetTournamentState(courseIds = null) {
  applyTournamentHoleIds(courseIds || drawTournamentHoleIds());
  game.currentPlayer = 0;
  game.holeIndex = 0;
  game.holeScores = Array.from({ length: 2 }, () => Array(holes.length || HOLES_PER_TOURNAMENT).fill(null));
  game.strokesThisHole = [0, 0];
  game.aimAngle = -Math.PI / 4;
  game.aimPower = 0;
  game.ballMoving = false;
  game.golfResolveToken += 1;
  game.result = null;
  const shotArrow = document.querySelector("#shotArrow");
  if (shotArrow) shotArrow.classList.add("hidden");
  if (world.golfAimArrow) world.golfAimArrow.visible = false;
  world.ballVel.set(0, 0, 0);
}

export function drawTournamentHoleIds() {
  return holeCatalog
    .map((hole) => ({ id: hole.id, roll: Math.random() }))
    .sort((a, b) => a.roll - b.roll)
    .slice(0, HOLES_PER_TOURNAMENT)
    .map((entry) => entry.id);
}

export function applyTournamentHoleIds(courseIds) {
  const byId = new Map(holeCatalog.map((hole) => [hole.id, hole]));
  const picked = (Array.isArray(courseIds) ? courseIds : [])
    .map((id) => byId.get(id))
    .filter(Boolean);
  const fallback = holeCatalog.slice(0, HOLES_PER_TOURNAMENT);
  holes.splice(0, holes.length, ...(picked.length === HOLES_PER_TOURNAMENT ? picked : fallback));
}

export function resetGolfHole() {
  const hole = holes[game.holeIndex];
  if (!hole) return;
  rebuildGolfHoleGeometry(hole);
  world.ball.position.copy(hole.start);
  world.ball.position.y = 0.53;
  game.lastShotPosition.copy(world.ball.position);
  game.golfFalling = false;
  world.ballVel.set(0, 0, 0);
  world.cup.position.copy(hole.cup);
  world.cup.position.y = CUP_SURFACE_Y;
  game.ballMoving = false;
  const shotArrow = document.querySelector("#shotArrow");
  if (shotArrow) shotArrow.classList.add("hidden");
  if (world.golfAimArrow) world.golfAimArrow.visible = false;
}

export function rebuildGolfHoleGeometry(hole) {
  clearCourseGeometry();
  buildGolfCourse(hole);
  for (const bumperDef of hole.bumpers) addBumper(bumperDef);
  if (world.golfIsland) {
    world.golfIsland.material = materials.lava;
  }
}

export function clearCourseGeometry() {
  for (const piece of world.coursePieces) world.courseRoot.remove(piece);
  for (const bumper of world.bumpers) world.courseRoot.remove(bumper.mesh);
  world.coursePieces = [];
  world.icePatches = [];
  world.bumpers = [];
  world.mounds = [];
}

export function buildGolfCourse(hole) {
  for (const surface of hole.surfaces || [{ x: 0, z: 0, sx: hole.walls.x * 2, sz: hole.walls.z * 2 }]) {
    addCourseSurface(surface);
  }
  addCourseBoundary(hole);
  for (const ice of hole.ice || []) addIcePatch(ice);
  for (const mound of hole.mounds || defaultMoundsForHole(hole)) addMound(mound);
}

function addCourseSurface(def) {
  let mesh;
  if (def.type === "circle") {
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(def.r, def.r, 0.38, 72), materials.green);
    mesh.position.set(def.x, 0, def.z);
  } else {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(def.sx, 0.38, def.sz), materials.green);
    mesh.position.set(def.x, 0, def.z);
    mesh.rotation.y = def.rot || 0;
  }
  mesh.receiveShadow = true;
  world.courseRoot.add(mesh);
  world.coursePieces.push(mesh);
}

function addCourseBoundary(hole) {
  if ((hole.surfaces || []).length > 1) {
    addCourseWall({ x: 0, z: -hole.walls.z - 0.22, sx: hole.walls.x * 2 + 0.45, sz: 0.45 });
    addCourseWall({ x: 0, z: hole.walls.z + 0.22, sx: hole.walls.x * 2 + 0.45, sz: 0.45 });
    addCourseWall({ x: -hole.walls.x - 0.22, z: 0, sx: 0.45, sz: hole.walls.z * 2 + 0.45 });
    addCourseWall({ x: hole.walls.x + 0.22, z: 0, sx: 0.45, sz: hole.walls.z * 2 + 0.45 });
    return;
  }
  for (const surface of hole.surfaces || []) {
    if (surface.type === "circle") {
      const segments = 24;
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        addCourseWall({
          x: surface.x + Math.sin(angle) * surface.r,
          z: surface.z + Math.cos(angle) * surface.r,
          sx: (Math.PI * surface.r * 2) / segments + 0.4,
          sz: 0.45,
          rot: angle
        });
      }
    } else {
      const rot = surface.rot || 0;
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const place = (lx, lz, sx, sz) => addCourseWall({
        x: surface.x + lx * c - lz * s,
        z: surface.z + lx * s + lz * c,
        sx,
        sz,
        rot
      });
      place(0, -surface.sz / 2 - 0.22, surface.sx + 0.45, 0.45);
      place(0, surface.sz / 2 + 0.22, surface.sx + 0.45, 0.45);
      place(-surface.sx / 2 - 0.22, 0, 0.45, surface.sz + 0.45);
      place(surface.sx / 2 + 0.22, 0, 0.45, surface.sz + 0.45);
    }
  }
}

function addCourseWall(def) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(def.sx, 0.75, def.sz), materials.wall);
  wall.position.set(def.x, 0.46, def.z);
  wall.rotation.y = def.rot || 0;
  wall.castShadow = true;
  wall.receiveShadow = true;
  world.courseRoot.add(wall);
  world.coursePieces.push(wall);
  world.bumpers.push({ ...def, mesh: wall });
}

function addIcePatch(def) {
  let mesh;
  const iceMat = new THREE.MeshStandardMaterial({
    color: 0x9ee8ff,
    roughness: 0.08,
    metalness: 0.05,
    transparent: true,
    opacity: 0.72,
    emissive: 0x1b6175
  });
  if (def.type === "circle") {
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(def.r, def.r, 0.035, 48), iceMat);
    mesh.position.set(def.x, 0.22, def.z);
  } else {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(def.sx, 0.035, def.sz), iceMat);
    mesh.position.set(def.x, 0.22, def.z);
    mesh.rotation.y = def.rot || 0;
  }
  mesh.receiveShadow = true;
  world.courseRoot.add(mesh);
  world.coursePieces.push(mesh);
  world.icePatches.push({ ...def, mesh });
}

function addMound(hill) {
  const mound = new THREE.Mesh(
    new THREE.SphereGeometry(hill.r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: hill.c || 0x72cf83, roughness: 0.88 })
  );
  mound.position.set(hill.x, 0.16, hill.z);
  mound.scale.y = 0.55;
  mound.receiveShadow = true;
  world.courseRoot.add(mound);
  world.coursePieces.push(mound);
  world.mounds.push({ x: hill.x, z: hill.z, radius: hill.r * 0.86 });
}

function defaultMoundsForHole(hole) {
  return [
    { x: hole.start.x * 0.35, z: hole.start.z * 0.35, r: 1.25, c: 0x72cf83 },
    { x: hole.cup.x * 0.32, z: hole.cup.z * 0.32, r: 1.45, c: 0x48a565 }
  ];
}

function addBumper(def) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(def.sx, 0.5, def.sz), materials.wall);
  mesh.position.set(def.x, 0.42, def.z);
  mesh.rotation.y = def.rot;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  world.courseRoot.add(mesh);
  world.bumpers.push({ ...def, mesh });
}

export function setupGolfObjects() {
  const island = new THREE.Mesh(new THREE.CylinderGeometry(34, 36, 1.2, 9), materials.lava);
  island.position.y = -0.68;
  island.rotation.y = 0.22;
  island.receiveShadow = true;
  world.golfIsland = island;
  world.golfRoot.add(island);

  world.cup = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 40), materials.cup);
  world.cup.position.y = CUP_SURFACE_Y;
  world.cup.receiveShadow = true;
  world.courseRoot.add(world.cup);

  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 12), materials.metal);
  flagPole.position.set(0.16, 1.38, 0);
  flagPole.castShadow = true;
  world.cup.add(flagPole);

  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.36, 0.035), materials.coral);
  flag.position.set(0.38, 0.88, 0);
  flag.castShadow = true;
  flagPole.add(flag);

  world.ball = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 18), materials.white);
  world.ball.castShadow = true;
  world.ball.receiveShadow = true;
  world.courseRoot.add(world.ball);

  const arrowGroup = new THREE.Group();
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0x7ee2a8, transparent: true, opacity: 0.92 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 12), arrowMat);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.x = 0.5;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 18), arrowMat);
  head.rotation.z = -Math.PI / 2;
  head.position.x = 1.18;
  arrowGroup.add(shaft, head);
  arrowGroup.visible = false;
  arrowGroup.userData = { shaft, head, material: arrowMat };
  world.golfAimArrow = arrowGroup;
  world.courseRoot.add(arrowGroup);

  world.golfRoot.add(world.courseRoot);
}
