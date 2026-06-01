#!/usr/bin/env node
import fs from "node:fs";

const mapPath = process.argv[2] || "maps/fps/skyhook-spires.json";
const raw = fs.readFileSync(mapPath, "utf8");
const map = JSON.parse(raw);

const PLAYER_HEIGHT = 1.78;
const HEIGHT_TOLERANCE = 0.72;
const EDGE_DEPTH_TOLERANCE = 0.55;
const MAX_WALKABLE_RAMP_SLOPE = 0.75;
const SAMPLE_COUNT = 18;

const surfaces = collectWalkableSurfaces(map);
const blockers = collectBlockers(map);
const issues = [];

for (const ramp of map.ramps || []) {
  const normalized = normalizeRamp(ramp);
  const d = uphillDirection(normalized.rot);
  const low = rampPoint(normalized, -1);
  const high = rampPoint(normalized, 1);
  const lowSupport = bestSurfaceAt(low, normalized.y);
  const highSupport = bestSurfaceAt(high, normalized.y + normalized.height);
  const rampIssues = [];

  if (!lowSupport || lowSupport.dist > 0.6) {
    rampIssues.push(`low endpoint has no walkable support at y=${fmt(normalized.y)}`);
  }
  if (!highSupport || highSupport.dist > 0.6) {
    rampIssues.push(`high endpoint has no walkable support at y=${fmt(normalized.y + normalized.height)}`);
  } else {
    const depth = entryDepthAlongRamp(highSupport.surface, high, d);
    if (depth > EDGE_DEPTH_TOLERANCE) {
      rampIssues.push(`high endpoint is ${fmt(depth)}u inside ${highSupport.surface.name} instead of at its edge`);
    }
  }

  const slope = Math.abs(normalized.height) / Math.max(0.001, normalized.length);
  if (slope > MAX_WALKABLE_RAMP_SLOPE) {
    rampIssues.push(`slope ${fmt(slope)} exceeds ${MAX_WALKABLE_RAMP_SLOPE}`);
  }

  const blockedBy = findBlockingObjects(normalized, blockers);
  if (blockedBy.length) {
    rampIssues.push(`blocked by ${blockedBy.slice(0, 4).join(", ")}${blockedBy.length > 4 ? " ..." : ""}`);
  }

  if (rampIssues.length) {
    issues.push({ ramp: ramp.name || "(unnamed ramp)", issues: rampIssues });
  }
}

if (issues.length) {
  console.error(`${mapPath}: ${issues.length} ramp usability issue(s)`);
  for (const issue of issues) {
    console.error(`- ${issue.ramp}`);
    for (const msg of issue.issues) console.error(`  * ${msg}`);
  }
  process.exitCode = 1;
} else {
  console.log(`${mapPath}: ${map.ramps?.length || 0} ramps checked; no usability issues found.`);
}

function collectWalkableSurfaces(map) {
  const result = [];
  for (const floor of map.floors || []) {
    if (floor.type === "circle") continue;
    result.push({
      name: floor.name || "floor",
      kind: "floor",
      x: Number(floor.x || 0),
      z: Number(floor.z || 0),
      sx: Number(floor.sx || (map.bounds?.x || 0) * 2),
      sz: Number(floor.sz || (map.bounds?.z || 0) * 2),
      bottom: Number(floor.y || 0) - 0.5,
      top: Number(floor.y || 0)
    });
  }
  for (const box of map.boxes || []) {
    if (box.collidable === false || box.isPlatform === false) continue;
    result.push(surfaceFromBox(box, "box"));
  }
  for (const platform of map.platforms || []) {
    if (platform.collidable === false) continue;
    result.push(surfaceFromBox(platform, "platform"));
  }
  return result;
}

function collectBlockers(map) {
  const result = [];
  for (const box of map.boxes || []) {
    if (box.collidable === false) continue;
    result.push(surfaceFromBox(box, "box"));
  }
  for (const platform of map.platforms || []) {
    if (platform.collidable === false) continue;
    result.push(surfaceFromBox(platform, "platform"));
  }
  return result;
}

function surfaceFromBox(box, kind) {
  const y = Number(box.y || 0);
  const sy = Number(box.sy ?? 0.5);
  return {
    name: box.name || `(${kind})`,
    kind,
    x: Number(box.x || 0),
    z: Number(box.z || 0),
    sx: Number(box.sx ?? box.width ?? 1),
    sz: Number(box.sz ?? box.length ?? 1),
    bottom: y,
    top: y + sy
  };
}

function normalizeRamp(ramp) {
  return {
    ...ramp,
    x: Number(ramp.x || 0),
    y: Number(ramp.y || 0),
    z: Number(ramp.z || 0),
    width: Number(ramp.width ?? ramp.sx ?? 4),
    length: Number(ramp.length ?? ramp.sz ?? 8),
    height: Number(ramp.height ?? ramp.sy ?? 2),
    rot: Number(ramp.rot ?? ramp.rotY ?? 0)
  };
}

function uphillDirection(rot) {
  return { x: Math.sin(rot), z: Math.cos(rot) };
}

function rampPoint(ramp, sign) {
  const d = uphillDirection(ramp.rot);
  return {
    x: ramp.x + sign * d.x * ramp.length / 2,
    y: ramp.y + (sign > 0 ? ramp.height : 0),
    z: ramp.z + sign * d.z * ramp.length / 2
  };
}

function bestSurfaceAt(point, targetY) {
  const candidates = surfaces
    .filter((surface) => Math.abs(surface.top - targetY) <= HEIGHT_TOLERANCE)
    .map((surface) => ({ surface, dist: distanceToRect(surface, point), inside: pointInRect(surface, point, 0.001) }))
    .sort((a, b) => a.dist - b.dist || Number(b.inside) - Number(a.inside));
  return candidates[0] || null;
}

function pointInRect(rect, point, margin = 0) {
  return point.x >= rect.x - rect.sx / 2 - margin &&
    point.x <= rect.x + rect.sx / 2 + margin &&
    point.z >= rect.z - rect.sz / 2 - margin &&
    point.z <= rect.z + rect.sz / 2 + margin;
}

function distanceToRect(rect, point) {
  const dx = Math.max(Math.abs(point.x - rect.x) - rect.sx / 2, 0);
  const dz = Math.max(Math.abs(point.z - rect.z) - rect.sz / 2, 0);
  return Math.hypot(dx, dz);
}

function entryDepthAlongRamp(rect, point, d) {
  if (!pointInRect(rect, point, 0.001)) return 0;
  let depth = Infinity;
  if (d.x > 0.0001) depth = Math.min(depth, point.x - (rect.x - rect.sx / 2));
  else if (d.x < -0.0001) depth = Math.min(depth, (rect.x + rect.sx / 2) - point.x);
  if (d.z > 0.0001) depth = Math.min(depth, point.z - (rect.z - rect.sz / 2));
  else if (d.z < -0.0001) depth = Math.min(depth, (rect.z + rect.sz / 2) - point.z);
  return Number.isFinite(depth) ? Math.max(0, depth) : 0;
}

function findBlockingObjects(ramp, objects) {
  const blocked = new Set();
  const d = uphillDirection(ramp.rot);
  const side = { x: Math.cos(ramp.rot), z: -Math.sin(ramp.rot) };
  const halfWidth = ramp.width / 2;
  for (let i = 1; i < SAMPLE_COUNT; i++) {
    const t = i / SAMPLE_COUNT;
    const center = {
      x: ramp.x + d.x * (t - 0.5) * ramp.length,
      z: ramp.z + d.z * (t - 0.5) * ramp.length,
      y: ramp.y + t * ramp.height
    };
    const p = center;
    for (const obj of objects) {
      if (!pointInRect(obj, p, 0.02)) continue;
      // Feet below an object's top means the object side/underside will stop movement.
      // Feet at or above the top is walkable and intentionally allowed.
      if (p.y < obj.top - 0.08 && p.y + PLAYER_HEIGHT > obj.bottom + 0.05) {
        blocked.add(obj.name);
      }
    }
  }
  return [...blocked];
}

function fmt(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}
