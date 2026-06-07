import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

let nextColliderId = 1;

const DEFAULT_CELL_SIZE = 6;
const DEFAULT_WALKABLE_NORMAL_Y = 0.42;
const DEFAULT_MIN_TRIANGLE_AREA = 0.000001;
const QUERY_EPSILON = 0.00001;
const DEFAULT_PLAYER_STEP_HEIGHT = 0.58;
const MIN_PLAYER_STEP_HEIGHT = 0.004;
const STEP_SURFACE_QUERY_RADIUS = 0.18;

export function buildTriangleMeshColliderFromObject(root, options = {}) {
  const triangles = [];
  const source = options.source || root?.name || "triangle-mesh";
  const cellSize = Number(options.cellSize || DEFAULT_CELL_SIZE);
  const walkableNormalY = Number(options.walkableNormalY || DEFAULT_WALKABLE_NORMAL_Y);
  const minTriangleArea = Number(options.minTriangleArea || DEFAULT_MIN_TRIANGLE_AREA);
  const includeInvisible = options.includeInvisible !== false;
  const matrixWorld = new THREE.Matrix4();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (!child.isMesh || !child.geometry?.attributes?.position) return;
    if (!includeInvisible && child.visible === false) return;
    child.updateMatrixWorld(true);
    matrixWorld.copy(child.matrixWorld);
    const geometry = child.geometry;
    const position = geometry.attributes.position;
    const index = geometry.index;
    const triangleCount = index ? index.count / 3 : position.count / 3;
    for (let tri = 0; tri < triangleCount; tri++) {
      const ia = index ? index.getX(tri * 3) : tri * 3;
      const ib = index ? index.getX(tri * 3 + 1) : tri * 3 + 1;
      const ic = index ? index.getX(tri * 3 + 2) : tri * 3 + 2;
      a.fromBufferAttribute(position, ia).applyMatrix4(matrixWorld);
      b.fromBufferAttribute(position, ib).applyMatrix4(matrixWorld);
      c.fromBufferAttribute(position, ic).applyMatrix4(matrixWorld);
      addTriangle(triangles, a, b, c, minTriangleArea);
    }
  });

  if (!triangles.length) return null;

  const collider = {
    id: nextColliderId++,
    type: "triangleMesh",
    source,
    triangles,
    grid: new Map(),
    cellSize,
    walkableNormalY,
    bbox: makeEmptyBox()
  };

  for (let i = 0; i < triangles.length; i++) {
    const tri = triangles[i];
    tri.index = i;
    expandColliderBox(collider.bbox, tri);
    insertTriangleIntoGrid(collider, tri, i);
  }

  return collider;
}

export function meshGroundSurface(colliders, position, previousPosition, velocityY, wasGrounded, wasGroundSurface, radius = 0.42) {
  if (!colliders?.length || velocityY > 0) return null;
  const probes = groundProbes(position.x, position.z, radius);
  let best = null;

  for (const collider of colliders) {
    const alreadyOnCollider = wasGrounded && wasGroundSurface === collider;
    for (const probe of probes) {
      const seen = new Set();
      forEachCandidateTriangle(collider, probe.x, probe.z, 0.08, seen, (tri) => {
        if (Math.abs(tri.ny) < collider.walkableNormalY) return;
        const y = triangleYAtXZ(tri, probe.x, probe.z, 0.035);
        if (y === null) return;

        const previousY = previousPosition?.y ?? position.y;
        const nearSurfaceNow = position.y >= y - 0.82 && position.y <= y + 0.24;
        const crossedSurface = previousY >= y - 0.10 && position.y <= y + 0.24;
        const maxStepUp = alreadyOnCollider ? 0.82 : (wasGrounded ? 0.64 : 0.26);
        const canStepUp = wasGrounded && previousY >= y - maxStepUp && nearSurfaceNow;
        const canContinue = alreadyOnCollider && position.y >= y - 1.05 && position.y <= y + 0.86;
        if (!canContinue && !crossedSurface && !canStepUp) return;

        if (!best || y > best.y) {
          best = {
            y,
            surface: collider,
            normal: upwardNormal(tri),
            triangle: tri.index,
            collider
          };
        }
      });
    }
  }

  return best;
}

export function resolvePlayerCeilingVsTriangleMeshColliders(colliders, player, previousY, height = 1.78, radius = 0.42) {
  if (!colliders?.length || player.vel.y <= 0) return false;
  const previousHead = previousY + height;
  const currentHead = player.pos.y + height;
  const probes = headProbes(player.pos.x, player.pos.z, radius);
  let bestY = Infinity;
  let hit = false;

  for (const collider of colliders) {
    for (const probe of probes) {
      const seen = new Set();
      forEachCandidateTriangle(collider, probe.x, probe.z, 0.06, seen, (tri) => {
        if (Math.abs(tri.ny) < 0.24) return;
        const y = triangleYAtXZ(tri, probe.x, probe.z, 0.025);
        if (y === null) return;
        if (previousHead <= y + 0.08 && currentHead >= y - 0.02 && y < bestY) {
          bestY = y;
          hit = true;
        }
      });
    }
  }

  if (hit) {
    player.pos.y = bestY - height - 0.01;
    player.vel.y = 0;
  }
  return hit;
}

export function resolvePlayerVsTriangleMeshColliders(colliders, player, previousPosition, radius = 0.42, height = 1.78) {
  if (!colliders?.length) return false;
  let collided = false;
  const sampleCount = 5;
  const closest = new THREE.Vector3();

  for (let iteration = 0; iteration < 3; iteration++) {
    let moved = false;
    for (const collider of colliders) {
      const seen = new Set();
      forEachCandidateTriangle(collider, player.pos.x, player.pos.z, radius + 0.12, seen, (tri) => {
        if (tri.maxY < player.pos.y - radius || tri.minY > player.pos.y + height + radius) return;
        if (tri.maxX < player.pos.x - radius || tri.minX > player.pos.x + radius || tri.maxZ < player.pos.z - radius || tri.minZ > player.pos.z + radius) return;
        if (isStandingWalkableTriangle(collider, tri, player.pos, radius)) return;

        const lowY = player.pos.y + radius;
        const highY = player.pos.y + Math.max(radius, height - radius);
        for (let i = 0; i < sampleCount; i++) {
          const t = sampleCount === 1 ? 0.5 : i / (sampleCount - 1);
          const sy = lowY + (highY - lowY) * t;
          closestPointOnTriangle(player.pos.x, sy, player.pos.z, tri, closest);
          const dx = player.pos.x - closest.x;
          const dy = sy - closest.y;
          const dz = player.pos.z - closest.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq >= radius * radius) continue;

          if (tryStepPlayerUpOnTriangleMesh(collider, player, previousPosition, radius, height)) {
            moved = true;
            collided = true;
            break;
          }

          const horizontalLen = Math.hypot(dx, dz);
          let hx = 0;
          let hz = 0;
          if (horizontalLen > 0.0001) {
            hx = dx / horizontalLen;
            hz = dz / horizontalLen;
          } else {
            const oriented = orientedNormalFromPoint(tri, player.pos.x, sy, player.pos.z);
            const nLen = Math.hypot(oriented.x, oriented.z);
            if (nLen <= 0.0001 || Math.abs(oriented.y) > 0.72) continue;
            hx = oriented.x / nLen;
            hz = oriented.z / nLen;
          }

          const dist = Math.sqrt(Math.max(distSq, 0.000001));
          const push = Math.min(radius, radius - dist + 0.002);
          player.pos.x += hx * push;
          player.pos.z += hz * push;
          const inward = player.vel.x * hx + player.vel.z * hz;
          if (inward < 0) {
            player.vel.x -= hx * inward;
            player.vel.z -= hz * inward;
          }
          moved = true;
          collided = true;
          break;
        }
      });
    }
    if (!moved) break;
  }

  return collided;
}

function tryStepPlayerUpOnTriangleMesh(collider, player, previousPosition, radius, height, maxStepHeight = DEFAULT_PLAYER_STEP_HEIGHT) {
  if (!player.grounded || player.vel.y > 0.2) return false;

  const baseY = Math.max(player.pos.y, previousPosition?.y ?? player.pos.y);
  const surfaceY = findStepSurfaceY(collider, player, baseY, radius, maxStepHeight);
  if (surfaceY === null) return false;

  player.pos.y = surfaceY + 0.001;
  if (player.vel.y < 0) player.vel.y = 0;
  player.grounded = true;
  player.groundSurface = collider;
  return true;
}

function findStepSurfaceY(collider, player, baseY, radius, maxStepHeight) {
  const probes = stepProbes(player.pos.x, player.pos.z, player.vel.x, player.vel.z, radius);
  let bestY = null;

  for (const probe of probes) {
    const seen = new Set();
    forEachCandidateTriangle(collider, probe.x, probe.z, STEP_SURFACE_QUERY_RADIUS, seen, (tri) => {
      if (Math.abs(tri.ny) < collider.walkableNormalY) return;
      const y = triangleYAtXZ(tri, probe.x, probe.z, 0.065);
      if (y === null) return;
      const stepHeight = y - baseY;
      if (stepHeight < -0.035 || stepHeight > maxStepHeight) return;
      if (stepHeight < MIN_PLAYER_STEP_HEIGHT && y <= baseY + MIN_PLAYER_STEP_HEIGHT) return;
      if (bestY === null || y > bestY) bestY = y;
    });
  }

  return bestY;
}

function stepProbes(x, z, velX, velZ, radius) {
  const probes = groundProbes(x, z, radius);
  const edge = Math.max(0.22, radius * 0.96);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    probes.push({ x: x + Math.cos(a) * edge, z: z + Math.sin(a) * edge });
  }
  const speed = Math.hypot(velX, velZ);
  if (speed > 0.001) {
    const dirX = velX / speed;
    const dirZ = velZ / speed;
    const forward = Math.max(0.24, radius * 1.08);
    const farForward = Math.max(0.36, radius * 1.34);
    const side = Math.max(0.12, radius * 0.48);
    probes.push(
      { x: x + dirX * forward, z: z + dirZ * forward },
      { x: x + dirX * farForward, z: z + dirZ * farForward },
      { x: x + dirX * forward - dirZ * side, z: z + dirZ * forward + dirX * side },
      { x: x + dirX * forward + dirZ * side, z: z + dirZ * forward - dirX * side }
    );
  }
  return probes;
}

export function sphereIntersectsTriangleMeshColliders(colliders, center, radius = 0.18) {
  if (!colliders?.length) return false;
  const closest = new THREE.Vector3();
  const rSq = radius * radius;
  for (const collider of colliders) {
    const seen = new Set();
    let hit = false;
    forEachCandidateTriangle(collider, center.x, center.z, radius, seen, (tri) => {
      if (hit) return;
      if (tri.maxY < center.y - radius || tri.minY > center.y + radius) return;
      closestPointOnTriangle(center.x, center.y, center.z, tri, closest);
      const dx = center.x - closest.x;
      const dy = center.y - closest.y;
      const dz = center.z - closest.z;
      if (dx * dx + dy * dy + dz * dz < rSq) hit = true;
    });
    if (hit) return true;
  }
  return false;
}

export function collideSphereWithTriangleMeshColliders(colliders, center, velocity, radius = 0.22, bounce = 0.4, friction = 0.8) {
  if (!colliders?.length) return false;
  const closest = new THREE.Vector3();
  let collided = false;

  for (let iteration = 0; iteration < 2; iteration++) {
    let moved = false;
    for (const collider of colliders) {
      const seen = new Set();
      forEachCandidateTriangle(collider, center.x, center.z, radius, seen, (tri) => {
        if (tri.maxY < center.y - radius || tri.minY > center.y + radius) return;
        closestPointOnTriangle(center.x, center.y, center.z, tri, closest);
        let nx = center.x - closest.x;
        let ny = center.y - closest.y;
        let nz = center.z - closest.z;
        const distSq = nx * nx + ny * ny + nz * nz;
        if (distSq >= radius * radius) return;
        const rawDist = Math.sqrt(distSq);
        let dist = rawDist;
        if (rawDist <= 0.0001) {
          const oriented = orientedNormalFromPoint(tri, center.x, center.y, center.z);
          nx = oriented.x;
          ny = oriented.y;
          nz = oriented.z;
          dist = Math.hypot(nx, ny, nz) || 1;
        }
        nx /= dist;
        ny /= dist;
        nz /= dist;
        const push = radius - rawDist + 0.002;
        center.x += nx * push;
        center.y += ny * push;
        center.z += nz * push;
        const dot = velocity.x * nx + velocity.y * ny + velocity.z * nz;
        if (dot < 0) {
          velocity.x -= nx * dot * (1 + bounce);
          velocity.y -= ny * dot * (1 + bounce);
          velocity.z -= nz * dot * (1 + bounce);
          velocity.x *= friction;
          velocity.z *= friction;
        }
        moved = true;
        collided = true;
      });
    }
    if (!moved) break;
  }

  return collided;
}

export function raycastTriangleMeshColliders(colliders, origin, direction, maxDistance = Infinity) {
  if (!colliders?.length) return null;
  let best = null;
  for (const collider of colliders) {
    for (const tri of collider.triangles) {
      const distance = rayIntersectTriangle(origin, direction, tri, maxDistance);
      if (distance === null || distance < 0 || distance > maxDistance) continue;
      if (!best || distance < best.distance) {
        best = {
          distance,
          point: origin.clone().addScaledVector(direction, distance),
          normal: upwardNormal(tri),
          object: collider,
          collider,
          triangle: tri.index
        };
      }
    }
  }
  return best;
}

export function meshSurfaceYAtPoint(colliders, point, radius = 0.08) {
  if (!colliders?.length) return null;
  let bestY = null;
  for (const collider of colliders) {
    const seen = new Set();
    forEachCandidateTriangle(collider, point.x, point.z, radius, seen, (tri) => {
      if (Math.abs(tri.ny) < collider.walkableNormalY) return;
      const y = triangleYAtXZ(tri, point.x, point.z, 0.035);
      if (y === null) return;
      if (Number.isFinite(point.y) && y > point.y + 0.75) return;
      if (bestY === null || y > bestY) bestY = y;
    });
  }
  return bestY;
}

function addTriangle(triangles, a, b, c, minTriangleArea) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const normalLen = Math.hypot(nx, ny, nz);
  const area = normalLen * 0.5;
  if (area < minTriangleArea || normalLen <= 0) return;

  triangles.push({
    ax: a.x, ay: a.y, az: a.z,
    bx: b.x, by: b.y, bz: b.z,
    cx: c.x, cy: c.y, cz: c.z,
    nx: nx / normalLen,
    ny: ny / normalLen,
    nz: nz / normalLen,
    minX: Math.min(a.x, b.x, c.x),
    maxX: Math.max(a.x, b.x, c.x),
    minY: Math.min(a.y, b.y, c.y),
    maxY: Math.max(a.y, b.y, c.y),
    minZ: Math.min(a.z, b.z, c.z),
    maxZ: Math.max(a.z, b.z, c.z),
    area
  });
}

function insertTriangleIntoGrid(collider, tri, index) {
  const pad = 0.5;
  const minX = Math.floor((tri.minX - pad) / collider.cellSize);
  const maxX = Math.floor((tri.maxX + pad) / collider.cellSize);
  const minZ = Math.floor((tri.minZ - pad) / collider.cellSize);
  const maxZ = Math.floor((tri.maxZ + pad) / collider.cellSize);
  for (let ix = minX; ix <= maxX; ix++) {
    for (let iz = minZ; iz <= maxZ; iz++) {
      const key = `${ix},${iz}`;
      let bucket = collider.grid.get(key);
      if (!bucket) {
        bucket = [];
        collider.grid.set(key, bucket);
      }
      bucket.push(index);
    }
  }
}

function forEachCandidateTriangle(collider, x, z, radius, seen, callback) {
  const minX = Math.floor((x - radius) / collider.cellSize);
  const maxX = Math.floor((x + radius) / collider.cellSize);
  const minZ = Math.floor((z - radius) / collider.cellSize);
  const maxZ = Math.floor((z + radius) / collider.cellSize);
  for (let ix = minX; ix <= maxX; ix++) {
    for (let iz = minZ; iz <= maxZ; iz++) {
      const bucket = collider.grid.get(`${ix},${iz}`);
      if (!bucket) continue;
      for (const triIndex of bucket) {
        if (seen.has(triIndex)) continue;
        seen.add(triIndex);
        callback(collider.triangles[triIndex]);
      }
    }
  }
}

function triangleYAtXZ(tri, x, z, epsilon = QUERY_EPSILON) {
  const v0x = tri.bx - tri.ax;
  const v0z = tri.bz - tri.az;
  const v1x = tri.cx - tri.ax;
  const v1z = tri.cz - tri.az;
  const v2x = x - tri.ax;
  const v2z = z - tri.az;
  const den = v0x * v1z - v1x * v0z;
  if (Math.abs(den) < 0.000001) return null;
  const invDen = 1 / den;
  const u = (v2x * v1z - v1x * v2z) * invDen;
  const v = (v0x * v2z - v2x * v0z) * invDen;
  const w = 1 - u - v;
  if (u < -epsilon || v < -epsilon || w < -epsilon) return null;
  return tri.ay * w + tri.by * u + tri.cy * v;
}

function closestPointOnTriangle(px, py, pz, tri, out) {
  const abx = tri.bx - tri.ax;
  const aby = tri.by - tri.ay;
  const abz = tri.bz - tri.az;
  const acx = tri.cx - tri.ax;
  const acy = tri.cy - tri.ay;
  const acz = tri.cz - tri.az;
  const apx = px - tri.ax;
  const apy = py - tri.ay;
  const apz = pz - tri.az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return setVector(out, tri.ax, tri.ay, tri.az);

  const bpx = px - tri.bx;
  const bpy = py - tri.by;
  const bpz = pz - tri.bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return setVector(out, tri.bx, tri.by, tri.bz);

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return setVector(out, tri.ax + v * abx, tri.ay + v * aby, tri.az + v * abz);
  }

  const cpx = px - tri.cx;
  const cpy = py - tri.cy;
  const cpz = pz - tri.cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return setVector(out, tri.cx, tri.cy, tri.cz);

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return setVector(out, tri.ax + w * acx, tri.ay + w * acy, tri.az + w * acz);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return setVector(out, tri.bx + w * (tri.cx - tri.bx), tri.by + w * (tri.cy - tri.by), tri.bz + w * (tri.cz - tri.bz));
  }

  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return setVector(out, tri.ax + abx * v + acx * w, tri.ay + aby * v + acy * w, tri.az + abz * v + acz * w);
}

function rayIntersectTriangle(origin, direction, tri, maxDistance) {
  const edge1x = tri.bx - tri.ax;
  const edge1y = tri.by - tri.ay;
  const edge1z = tri.bz - tri.az;
  const edge2x = tri.cx - tri.ax;
  const edge2y = tri.cy - tri.ay;
  const edge2z = tri.cz - tri.az;

  const pvecx = direction.y * edge2z - direction.z * edge2y;
  const pvecy = direction.z * edge2x - direction.x * edge2z;
  const pvecz = direction.x * edge2y - direction.y * edge2x;
  const det = edge1x * pvecx + edge1y * pvecy + edge1z * pvecz;
  if (Math.abs(det) < 0.0000001) return null;
  const invDet = 1 / det;

  const tvecx = origin.x - tri.ax;
  const tvecy = origin.y - tri.ay;
  const tvecz = origin.z - tri.az;
  const u = (tvecx * pvecx + tvecy * pvecy + tvecz * pvecz) * invDet;
  if (u < 0 || u > 1) return null;

  const qvecx = tvecy * edge1z - tvecz * edge1y;
  const qvecy = tvecz * edge1x - tvecx * edge1z;
  const qvecz = tvecx * edge1y - tvecy * edge1x;
  const v = (direction.x * qvecx + direction.y * qvecy + direction.z * qvecz) * invDet;
  if (v < 0 || u + v > 1) return null;

  const distance = (edge2x * qvecx + edge2y * qvecy + edge2z * qvecz) * invDet;
  if (distance < 0 || distance > maxDistance) return null;
  return distance;
}

function isStandingWalkableTriangle(collider, tri, position, radius) {
  if (Math.abs(tri.ny) < collider.walkableNormalY) return false;
  const y = triangleYAtXZ(tri, position.x, position.z, 0.08);
  if (y === null) return false;
  return position.y >= y - 0.22 && position.y <= y + 0.72;
}

function groundProbes(x, z, radius) {
  const offset = Math.max(0.12, radius * 0.68);
  return [
    { x, z },
    { x: x + offset, z },
    { x: x - offset, z },
    { x, z: z + offset },
    { x, z: z - offset }
  ];
}

function headProbes(x, z, radius) {
  const offset = Math.max(0.10, radius * 0.45);
  return [
    { x, z },
    { x: x + offset, z },
    { x: x - offset, z },
    { x, z: z + offset },
    { x, z: z - offset }
  ];
}

function upwardNormal(tri) {
  const sign = tri.ny < 0 ? -1 : 1;
  return new THREE.Vector3(tri.nx * sign, tri.ny * sign, tri.nz * sign);
}

function orientedNormalFromPoint(tri, x, y, z) {
  const dot = (x - tri.ax) * tri.nx + (y - tri.ay) * tri.ny + (z - tri.az) * tri.nz;
  const sign = dot < 0 ? -1 : 1;
  return { x: tri.nx * sign, y: tri.ny * sign, z: tri.nz * sign };
}

function setVector(out, x, y, z) {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

function makeEmptyBox() {
  return {
    min: new THREE.Vector3(Infinity, Infinity, Infinity),
    max: new THREE.Vector3(-Infinity, -Infinity, -Infinity)
  };
}

function expandColliderBox(box, tri) {
  box.min.x = Math.min(box.min.x, tri.minX);
  box.min.y = Math.min(box.min.y, tri.minY);
  box.min.z = Math.min(box.min.z, tri.minZ);
  box.max.x = Math.max(box.max.x, tri.maxX);
  box.max.y = Math.max(box.max.y, tri.maxY);
  box.max.z = Math.max(box.max.z, tri.maxZ);
}
