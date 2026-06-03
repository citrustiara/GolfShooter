#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const COMPONENT_INFO = {
  5120: { size: 1, getter: "getInt8" },
  5121: { size: 1, getter: "getUint8" },
  5122: { size: 2, getter: "getInt16" },
  5123: { size: 2, getter: "getUint16" },
  5125: { size: 4, getter: "getUint32" },
  5126: { size: 4, getter: "getFloat32" }
};

const DEFAULTS = {
  scale: 10,
  padding: 8,
  minArea: 1.0,
  minHeight: 1.0,
  maxColliders: 1200,
  spawnCount: 8
};

main();

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.length < 2) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  const inputPath = args._[0];
  const outputPath = args._[1];
  const options = {
    scale: readNumber(args.scale, DEFAULTS.scale),
    padding: readNumber(args.padding, DEFAULTS.padding),
    minArea: readNumber(args["min-area"], DEFAULTS.minArea),
    minHeight: readNumber(args["min-height"], DEFAULTS.minHeight),
    maxColliders: readNumber(args["max-colliders"], DEFAULTS.maxColliders),
    spawnCount: Math.max(2, Math.floor(readNumber(args["spawn-count"], DEFAULTS.spawnCount))),
    id: args.id || slugify(path.basename(outputPath, path.extname(outputPath))),
    name: args.name || titleCase(slugify(path.basename(outputPath, path.extname(outputPath))).replaceAll("-", " ")),
    glbUrl: args["glb-url"] || normalizePath(inputPath),
    visibleColliders: Boolean(args["visible-colliders"]),
    legacyColliders: Boolean(args["legacy-colliders"]),
    noRamps: Boolean(args["no-ramps"]),
    autoRamps: Boolean(args["auto-ramps"])
  };

  const glb = readGlb(inputPath);
  const extracted = extractScene(glb);
  const meshNodes = extracted.meshNodes.filter((node) => node.bbox);
  if (!meshNodes.length) throw new Error("No mesh nodes found in GLB.");

  const sceneBox = unionMany(meshNodes.map((node) => node.bbox));
  const floorBox = chooseFloorBox(meshNodes, sceneBox) || sceneBox;
  const floor = makeFloor(floorBox, options);
  const bounds = {
    x: round3(Math.max(4, floor.sx / 2)),
    z: round3(Math.max(4, floor.sz / 2))
  };

  const boxes = [];
  const ramps = [];
  const skipped = [];

  for (const node of meshNodes) {
    if (isFloorLike(node, sceneBox)) {
      skipped.push({ name: node.name, reason: "floor" });
      continue;
    }

    if (!options.noRamps) {
      const ramp = makeRamp(node, options);
      if (ramp) {
        ramps.push(ramp);
        const landing = makeRampLandingBox(ramp, options);
        if (landing) boxes.push(landing);
        continue;
      }
    }

    const box = makeColliderBox(node, options);
    if (!box) {
      skipped.push({ name: node.name, reason: "too-small" });
      continue;
    }
    boxes.push(box);
  }

  boxes.sort((a, b) => (b.sx * b.sz * b.sy) - (a.sx * a.sz * a.sy));
  if (boxes.length > options.maxColliders) boxes.length = options.maxColliders;

  const spawnPoints = parseSpawnPoints(args.spawn) || makeSpawnPoints(floor, boxes, options.spawnCount);
  const attribution = makeAttribution(glb.json);
  const map = {
    version: 1,
    id: options.id,
    name: options.name,
    sky: 1054754,
    fog: 1054754,
    fogNear: 70,
    fogFar: 210,
    bounds,
    spawnPoints,
    floors: [floor],
    generatedArena: false,
    floorCollision: false,
    floor: 2963776,
    gridA: 7921919,
    gridB: 3358800,
    edge: 1718858,
    glb: options.glbUrl,
    glbScale: options.scale,
    glbCollidable: true,
    glbCollision: "mesh",
    meshWalkableNormalY: 0.42,
    meshCollisionCellSize: 6,
    colliderSource: {
      type: "runtime-triangle-mesh",
      script: "js/fps/mesh-collision.js",
      note: "Uses GLB triangles directly; generated floor, perimeter walls, and spawn pads are disabled."
    },
    ...(attribution ? { attribution } : {}),
    ...(options.legacyColliders ? {
      legacyColliderSource: {
        type: "glb-node-obb",
        script: "scripts/glb-to-fps-map.mjs",
        colliders: boxes.length,
        ramps: ramps.length
      },
      ...(ramps.length ? { ramps } : {}),
      boxes
    } : {})
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(map, null, 2)}\n`);

  console.log(`Wrote ${outputPath}`);
  console.log(`  mesh nodes: ${meshNodes.length}`);
  console.log(`  collision:  runtime triangle mesh`);
  if (options.legacyColliders) {
    console.log(`  legacy colliders: ${boxes.length}`);
    console.log(`  legacy ramps:     ${ramps.length}`);
  }
  console.log(`  skipped:    ${skipped.length}`);
}

function printUsage() {
  console.log(`Usage:
  node scripts/glb-to-fps-map.mjs <input.glb> <output.json> [options]

Options:
  --id <id>                 Map id. Defaults to output filename.
  --name <name>             Display name. Defaults to title-cased output filename.
  --glb-url <url>           URL stored in map JSON. Defaults to input path.
  --scale <n>               GLB/render scale and collider scale. Default: ${DEFAULTS.scale}
  --padding <n>             Extra floor/bounds padding in game units. Default: ${DEFAULTS.padding}
  --min-area <n>            Skip tiny colliders below XZ area. Default: ${DEFAULTS.minArea}
  --min-height <n>          Keep thin colliders only if area threshold passes. Default: ${DEFAULTS.minHeight}
  --max-colliders <n>       Cap generated mesh boxes. Default: ${DEFAULTS.maxColliders}
  --spawn-count <n>         Generated spawn count. Default: ${DEFAULTS.spawnCount}
  --spawn "x,z;x,z"         Explicit spawn points.
  --visible-colliders       Emit visible generated boxes for debugging when --legacy-colliders is used.
  --legacy-colliders        Also emit old generated box/ramp colliders. Default is runtime triangle-mesh only.
  --auto-ramps              Infer unnamed sloped meshes as ramps. Default only uses ramp-like names.
  --no-ramps                Do not infer ramp definitions.
`);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else out[key] = argv[++i];
  }
  return out;
}

function readNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function readGlb(filePath) {
  const data = fs.readFileSync(filePath);
  if (data.toString("utf8", 0, 4) !== "glTF") throw new Error(`${filePath} is not a GLB file.`);
  const version = data.readUInt32LE(4);
  if (version !== 2) throw new Error(`Unsupported GLB version ${version}.`);
  const declaredLength = data.readUInt32LE(8);
  if (declaredLength > data.length) throw new Error("GLB length is larger than file size.");

  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < declaredLength) {
    const chunkLength = data.readUInt32LE(offset);
    const chunkType = data.toString("ascii", offset + 4, offset + 8);
    offset += 8;
    const chunk = data.subarray(offset, offset + chunkLength);
    offset += chunkLength;
    if (chunkType === "JSON") json = JSON.parse(chunk.toString("utf8"));
    else if (chunkType === "BIN\0") bin = chunk;
  }
  if (!json) throw new Error("GLB is missing JSON chunk.");
  if (!bin) throw new Error("GLB is missing BIN chunk.");
  return { json, bin };
}

function extractScene(glb) {
  const { json } = glb;
  const nodes = json.nodes || [];
  const sceneIndex = json.scene || 0;
  const rootNodes = json.scenes?.[sceneIndex]?.nodes || findRootNodes(nodes);
  const worldMatrices = Array(nodes.length).fill(null);
  const meshLocalBoxes = new Map();
  const meshNodes = [];

  const visit = (nodeIndex, parentMatrix) => {
    const node = nodes[nodeIndex];
    const local = nodeMatrix(node);
    const world = multiplyMatrix(parentMatrix, local);
    worldMatrices[nodeIndex] = world;

    if (node.mesh !== undefined) {
      const mesh = json.meshes[node.mesh];
      const localBox = meshLocalBoxes.get(node.mesh) || computeMeshLocalBox(glb, mesh);
      meshLocalBoxes.set(node.mesh, localBox);
      const geometry = readMeshGeometry(glb, mesh, world);
      const bbox = geometry.vertices.length ? bboxFromPoints(geometry.vertices) : transformBox(localBox, world);
      meshNodes.push({
        nodeIndex,
        meshIndex: node.mesh,
        name: node.name || mesh.name || `node-${nodeIndex}`,
        meshName: mesh.name || "",
        world,
        localBox,
        bbox,
        vertices: geometry.vertices,
        triangles: geometry.triangles,
        analysis: analyzeGeometry(geometry.triangles, bbox)
      });
    }

    for (const child of node.children || []) visit(child, world);
  };

  for (const root of rootNodes) visit(root, identityMatrix());
  return { meshNodes, worldMatrices };
}

function findRootNodes(nodes) {
  const children = new Set();
  for (const node of nodes) for (const child of node.children || []) children.add(child);
  return nodes.map((_, index) => index).filter((index) => !children.has(index));
}

function computeMeshLocalBox(glb, mesh) {
  let box = null;
  for (const primitive of mesh.primitives || []) {
    const accessorIndex = primitive.attributes?.POSITION;
    if (accessorIndex === undefined) continue;
    const accessor = glb.json.accessors[accessorIndex];
    if (accessor.min && accessor.max) box = unionBox(box, { min: accessor.min, max: accessor.max });
    else box = unionBox(box, bboxFromPoints(readAccessor(glb, accessorIndex)));
  }
  return box || { min: [0, 0, 0], max: [0, 0, 0] };
}

function readMeshGeometry(glb, mesh, worldMatrix) {
  const vertices = [];
  const triangles = [];
  for (const primitive of mesh.primitives || []) {
    if (primitive.mode !== undefined && primitive.mode !== 4) continue;
    const positionAccessor = primitive.attributes?.POSITION;
    if (positionAccessor === undefined) continue;
    const localPositions = readAccessor(glb, positionAccessor);
    const base = vertices.length;
    for (const p of localPositions) vertices.push(transformPoint(worldMatrix, p));

    let indices;
    if (primitive.indices !== undefined) indices = readAccessor(glb, primitive.indices).map((value) => Array.isArray(value) ? value[0] : value);
    else indices = localPositions.map((_, index) => index);

    for (let i = 0; i + 2 < indices.length; i += 3) {
      const a = vertices[base + indices[i]];
      const b = vertices[base + indices[i + 1]];
      const c = vertices[base + indices[i + 2]];
      if (a && b && c) triangles.push([a, b, c]);
    }
  }
  return { vertices, triangles };
}

function readAccessor(glb, accessorIndex) {
  const { json, bin } = glb;
  const accessor = json.accessors[accessorIndex];
  const view = json.bufferViews[accessor.bufferView];
  if (!view) throw new Error(`Accessor ${accessorIndex} has no bufferView.`);
  const info = COMPONENT_INFO[accessor.componentType];
  if (!info) throw new Error(`Unsupported component type ${accessor.componentType}.`);
  const componentCount = COMPONENTS[accessor.type];
  if (!componentCount) throw new Error(`Unsupported accessor type ${accessor.type}.`);

  const byteOffset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const stride = view.byteStride || (componentCount * info.size);
  const dataView = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const result = [];
  for (let i = 0; i < accessor.count; i++) {
    const values = [];
    const base = byteOffset + i * stride;
    for (let c = 0; c < componentCount; c++) {
      values.push(dataView[info.getter](base + c * info.size, true));
    }
    result.push(componentCount === 1 ? values[0] : values);
  }
  return result;
}

function analyzeGeometry(triangles, bbox) {
  let totalArea = 0;
  let horizontalArea = 0;
  let slopeArea = 0;
  let gradientX = 0;
  let gradientZ = 0;
  for (const tri of triangles) {
    const normal = triangleNormal(tri);
    const area = normal.area;
    if (area <= 0) continue;
    totalArea += area;
    let nx = normal.x;
    let ny = normal.y;
    let nz = normal.z;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    if (ny > 0.86) horizontalArea += area;
    if (ny > 0.25 && ny < 0.94) {
      slopeArea += area;
      gradientX += (-nx / Math.max(0.0001, ny)) * area;
      gradientZ += (-nz / Math.max(0.0001, ny)) * area;
    }
  }
  return {
    totalArea,
    horizontalArea,
    slopeArea,
    slopeRatio: totalArea > 0 ? slopeArea / totalArea : 0,
    gradient: { x: gradientX, z: gradientZ },
    size: boxSize(bbox)
  };
}

function chooseFloorBox(meshNodes, sceneBox) {
  const sceneSize = boxSize(sceneBox);
  const candidates = meshNodes
    .filter((node) => /floor|plane|ground/i.test(`${node.name} ${node.meshName}`))
    .filter((node) => {
      const s = boxSize(node.bbox);
      return s.x * s.z > sceneSize.x * sceneSize.z * 0.3;
    })
    .sort((a, b) => {
      const as = boxSize(a.bbox);
      const bs = boxSize(b.bbox);
      const athin = as.y;
      const bthin = bs.y;
      return athin - bthin || (bs.x * bs.z) - (as.x * as.z);
    });
  return candidates[0]?.bbox || null;
}

function makeFloor(floorBox, options) {
  const center = boxCenter(floorBox);
  const size = boxSize(floorBox);
  return {
    name: "main-playable-floor",
    x: round3(center.x * options.scale),
    z: round3(center.z * options.scale),
    sx: round3(size.x * options.scale + options.padding * 2),
    sz: round3(size.z * options.scale + options.padding * 2)
  };
}

function isFloorLike(node, sceneBox) {
  const name = `${node.name} ${node.meshName}`;
  const size = boxSize(node.bbox);
  const sceneSize = boxSize(sceneBox);
  const largeFootprint = size.x * size.z > sceneSize.x * sceneSize.z * 0.28;
  return /floor|plane|ground/i.test(name) && largeFootprint;
}

function makeRamp(node, options) {
  const name = `${node.name} ${node.meshName}`;
  const size = node.analysis.size;
  const nameRamp = /\b(up|ramp|stair|stairs|slope)\b/i.test(name) || /up\d/i.test(name);
  const autoRamp = options.autoRamps && node.analysis.slopeRatio > 0.14 && size.y > 0.35 && Math.max(size.x, size.z) > 0.65;
  if (!nameRamp && !autoRamp) return null;

  const center = boxCenter(node.bbox);
  const direction = rampDirection(node);
  const side = { x: direction.z, z: -direction.x };
  let minForward = Infinity;
  let maxForward = -Infinity;
  let minSide = Infinity;
  let maxSide = -Infinity;
  for (const p of node.vertices) {
    const dx = p[0] - center.x;
    const dz = p[2] - center.z;
    const forward = dx * direction.x + dz * direction.z;
    const sideways = dx * side.x + dz * side.z;
    minForward = Math.min(minForward, forward);
    maxForward = Math.max(maxForward, forward);
    minSide = Math.min(minSide, sideways);
    maxSide = Math.max(maxSide, sideways);
  }

  const length = Math.max(0.1, maxForward - minForward) * options.scale;
  const width = Math.max(0.1, maxSide - minSide) * options.scale;
  const height = Math.max(0.1, size.y * options.scale);
  const slope = height / Math.max(0.001, length);
  if (slope > 0.95 || length < 2 || width < 1.5) return null;

  return cleanObject({
    name: safeName(node.name),
    x: round3(center.x * options.scale),
    y: round3(node.bbox.min[1] * options.scale),
    z: round3(center.z * options.scale),
    width: round3(width),
    length: round3(length),
    height: round3(height),
    rot: round3(Math.atan2(direction.x, direction.z)),
    visible: options.visibleColliders ? true : false,
    sourceNode: node.name
  });
}

function makeRampLandingBox(ramp, options) {
  const depth = round3(Math.max(1.5, Math.min(3.0, ramp.length * 0.18)));
  const direction = { x: Math.sin(ramp.rot || 0), z: Math.cos(ramp.rot || 0) };
  return cleanObject({
    name: `${ramp.name}-landing`,
    x: round3(ramp.x + direction.x * (ramp.length / 2 + depth / 2)),
    y: round3(ramp.y + ramp.height - 0.18),
    z: round3(ramp.z + direction.z * (ramp.length / 2 + depth / 2)),
    sx: round3(ramp.width),
    sy: 0.18,
    sz: depth,
    rotY: Math.abs(ramp.rot || 0) > 0.001 ? ramp.rot : undefined,
    isPlatform: true,
    visible: options.visibleColliders ? true : false,
    sourceNode: `${ramp.sourceNode || ramp.name}:landing`
  });
}

function rampDirection(node) {
  const g = node.analysis.gradient;
  let direction = normalize2(g.x, g.z);
  if (!direction) {
    const size = boxSize(node.bbox);
    direction = size.x > size.z ? { x: 1, z: 0 } : { x: 0, z: 1 };
  }

  const center = boxCenter(node.bbox);
  const lows = [];
  const highs = [];
  const minY = node.bbox.min[1];
  const maxY = node.bbox.max[1];
  const lowCut = minY + (maxY - minY) * 0.25;
  const highCut = minY + (maxY - minY) * 0.75;
  for (const p of node.vertices) {
    const projection = (p[0] - center.x) * direction.x + (p[2] - center.z) * direction.z;
    if (p[1] <= lowCut) lows.push(projection);
    if (p[1] >= highCut) highs.push(projection);
  }
  const lowAvg = average(lows);
  const highAvg = average(highs);
  if (Number.isFinite(lowAvg) && Number.isFinite(highAvg) && highAvg < lowAvg) {
    direction = { x: -direction.x, z: -direction.z };
  }
  return direction;
}

function makeColliderBox(node, options) {
  const oriented = orientedBoxFromNode(node, options.scale);
  const sx = Math.max(0.05, oriented.sx);
  const sy = Math.max(0.05, oriented.sy);
  const sz = Math.max(0.05, oriented.sz);
  const area = sx * sz;
  if (area < options.minArea && sy < options.minHeight) return null;

  const hasWalkableTop = node.analysis.horizontalArea > 0.02 || sy < 2.25;
  return cleanObject({
    name: safeName(node.name),
    x: round3(oriented.x),
    y: round3(oriented.y),
    z: round3(oriented.z),
    sx: round3(sx),
    sy: round3(sy),
    sz: round3(sz),
    rotY: Math.abs(oriented.rotY) > 0.001 ? round3(oriented.rotY) : undefined,
    isPlatform: hasWalkableTop ? true : false,
    visible: options.visibleColliders ? true : false,
    sourceNode: node.name
  });
}

function orientedBoxFromNode(node, scale) {
  const localCenter = boxCenterArray(node.localBox);
  const localSize = boxSizeArray(node.localBox);
  const worldCenter = transformPoint(node.world, localCenter);
  const axes = matrixAxes(node.world);
  const upright = Math.abs(axes.y.y / Math.max(0.0001, axes.y.len)) > 0.85;
  if (!upright) {
    const center = boxCenter(node.bbox);
    const size = boxSize(node.bbox);
    return {
      x: center.x * scale,
      y: node.bbox.min[1] * scale,
      z: center.z * scale,
      sx: size.x * scale,
      sy: size.y * scale,
      sz: size.z * scale,
      rotY: 0
    };
  }
  return {
    x: worldCenter[0] * scale,
    y: (worldCenter[1] - (localSize[1] * axes.y.len) / 2) * scale,
    z: worldCenter[2] * scale,
    sx: localSize[0] * axes.x.len * scale,
    sy: localSize[1] * axes.y.len * scale,
    sz: localSize[2] * axes.z.len * scale,
    rotY: Math.atan2(axes.z.x, axes.z.z)
  };
}

function makeSpawnPoints(floor, boxes, count) {
  const halfX = floor.sx / 2;
  const halfZ = floor.sz / 2;
  const centerX = floor.x || 0;
  const centerZ = floor.z || 0;
  const candidates = [];
  const pairs = [
    [-0.56, -0.62], [0.56, 0.62], [0.56, -0.56], [-0.56, 0.56],
    [-0.2, -0.68], [0.2, 0.68], [0.2, -0.44], [-0.2, 0.44],
    [-0.72, 0], [0.72, 0], [0, -0.72], [0, 0.72]
  ];
  for (const [fx, fz] of pairs) candidates.push({ x: centerX + fx * halfX, z: centerZ + fz * halfZ });
  for (let ix = -3; ix <= 3; ix++) {
    for (let iz = -3; iz <= 3; iz++) {
      candidates.push({ x: centerX + ix * halfX / 4, z: centerZ + iz * halfZ / 4 });
    }
  }

  const result = [];
  for (const candidate of candidates) {
    if (result.length >= count) break;
    const point = { x: round3(candidate.x), z: round3(candidate.z) };
    if (!insideFloor(point, floor, 2)) continue;
    if (spawnBlocked(point, boxes)) continue;
    if (result.some((sp) => Math.hypot(sp.x - point.x, sp.z - point.z) < 8)) continue;
    result.push(point);
  }
  while (result.length < count) {
    const angle = (result.length / count) * Math.PI * 2;
    result.push({ x: round3(centerX + Math.sin(angle) * halfX * 0.55), z: round3(centerZ + Math.cos(angle) * halfZ * 0.55) });
  }
  return result;
}

function spawnBlocked(point, boxes) {
  return boxes.some((box) => {
    if ((box.y || 0) > 1.8) return false;
    const rot = -(box.rotY || box.rot || 0);
    const dx = point.x - box.x;
    const dz = point.z - box.z;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    return Math.abs(lx) <= box.sx / 2 + 2.5 && Math.abs(lz) <= box.sz / 2 + 2.5;
  });
}

function insideFloor(point, floor, margin = 0) {
  return point.x >= floor.x - floor.sx / 2 + margin &&
    point.x <= floor.x + floor.sx / 2 - margin &&
    point.z >= floor.z - floor.sz / 2 + margin &&
    point.z <= floor.z + floor.sz / 2 - margin;
}

function parseSpawnPoints(value) {
  if (!value || value === true) return null;
  const points = String(value).split(";").map((part) => {
    const [x, z] = part.split(",").map(Number);
    return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
  }).filter(Boolean);
  return points.length ? points : null;
}

function makeAttribution(json) {
  const extras = json.asset?.extras;
  if (!extras) return null;
  return cleanObject({
    title: extras.title,
    author: extras.author,
    source: extras.source,
    license: extras.license?.replace(/ \(.+\)$/, "")
  });
}

function nodeMatrix(node) {
  if (node.matrix) return matrixFromGltf(node.matrix);
  let matrix = identityMatrix();
  if (node.translation) matrix = multiplyMatrix(matrix, translationMatrix(node.translation));
  if (node.rotation) matrix = multiplyMatrix(matrix, quaternionMatrix(node.rotation));
  if (node.scale) matrix = multiplyMatrix(matrix, scaleMatrix(node.scale));
  return matrix;
}

function identityMatrix() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function matrixFromGltf(values) {
  // glTF matrices are column-major. This script stores row-major matrices.
  return [
    values[0], values[4], values[8], values[12],
    values[1], values[5], values[9], values[13],
    values[2], values[6], values[10], values[14],
    values[3], values[7], values[11], values[15]
  ];
}

function translationMatrix([x = 0, y = 0, z = 0]) {
  return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
}

function scaleMatrix([x = 1, y = 1, z = 1]) {
  return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 1];
}

function quaternionMatrix([x = 0, y = 0, z = 0, w = 1]) {
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z;
  const wx = w * x, wy = w * y, wz = w * z;
  return [
    1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy), 0,
    2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx), 0,
    2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy), 0,
    0, 0, 0, 1
  ];
}

function multiplyMatrix(a, b) {
  const out = Array(16).fill(0);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      for (let k = 0; k < 4; k++) out[row * 4 + col] += a[row * 4 + k] * b[k * 4 + col];
    }
  }
  return out;
}

function transformPoint(m, [x, y, z]) {
  return [
    m[0] * x + m[1] * y + m[2] * z + m[3],
    m[4] * x + m[5] * y + m[6] * z + m[7],
    m[8] * x + m[9] * y + m[10] * z + m[11]
  ];
}

function transformBox(box, matrix) {
  const points = [];
  for (const x of [box.min[0], box.max[0]]) {
    for (const y of [box.min[1], box.max[1]]) {
      for (const z of [box.min[2], box.max[2]]) points.push(transformPoint(matrix, [x, y, z]));
    }
  }
  return bboxFromPoints(points);
}

function matrixAxes(m) {
  const x = { x: m[0], y: m[4], z: m[8] };
  const y = { x: m[1], y: m[5], z: m[9] };
  const z = { x: m[2], y: m[6], z: m[10] };
  x.len = Math.hypot(x.x, x.y, x.z);
  y.len = Math.hypot(y.x, y.y, y.z);
  z.len = Math.hypot(z.x, z.y, z.z);
  return { x, y, z };
}

function bboxFromPoints(points) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], point[i]);
      max[i] = Math.max(max[i], point[i]);
    }
  }
  return { min, max };
}

function unionMany(boxes) {
  return boxes.reduce((acc, box) => unionBox(acc, box), null);
}

function unionBox(a, b) {
  if (!a) return { min: [...b.min], max: [...b.max] };
  if (!b) return a;
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])]
  };
}

function boxCenter(box) {
  return {
    x: (box.min[0] + box.max[0]) / 2,
    y: (box.min[1] + box.max[1]) / 2,
    z: (box.min[2] + box.max[2]) / 2
  };
}

function boxCenterArray(box) {
  return [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
}

function boxSize(box) {
  return { x: box.max[0] - box.min[0], y: box.max[1] - box.min[1], z: box.max[2] - box.min[2] };
}

function boxSizeArray(box) {
  return [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
}

function triangleNormal([a, b, c]) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const x = uy * vz - uz * vy;
  const y = uz * vx - ux * vz;
  const z = ux * vy - uy * vx;
  const length = Math.hypot(x, y, z);
  if (length <= 0) return { x: 0, y: 0, z: 0, area: 0 };
  return { x: x / length, y: y / length, z: z / length, area: length / 2 };
}

function normalize2(x, z) {
  const length = Math.hypot(x, z);
  if (length < 0.0001) return null;
  return { x: x / length, z: z / length };
}

function average(values) {
  if (!values.length) return NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function cleanObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null));
}

function safeName(value) {
  return String(value || "mesh-collider").replace(/[^a-zA-Z0-9_.:-]+/g, "-").replace(/^-+|-+$/g, "") || "mesh-collider";
}

function slugify(value) {
  return String(value || "map").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "map";
}

function titleCase(value) {
  return String(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function round3(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}
