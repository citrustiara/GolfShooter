// Inspect a .glb: parse JSON chunk, walk scene graph applying node transforms,
// compute world-space AABB, and dump node/mesh names. No deps.
const fs = require("fs");

const path = process.argv[2];
if (!path) { console.error("usage: node glb-inspect.cjs <file.glb>"); process.exit(1); }

const buf = fs.readFileSync(path);
// GLB header: magic(4) version(4) length(4), then chunks: length(4) type(4) data
const magic = buf.readUInt32LE(0);
if (magic !== 0x46546c67) { console.error("not a glb (bad magic)"); process.exit(1); }
let off = 12;
let json = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off);
  const type = buf.readUInt32LE(off + 4);
  const data = buf.slice(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(data.toString("utf8")); // 'JSON'
  off += 8 + len;
}
if (!json) { console.error("no JSON chunk"); process.exit(1); }

// --- minimal mat4 (column-major) helpers ---
function ident() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
function mul(a, b) { // a*b
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k*4 + r] * b[c*4 + k];
    o[c*4 + r] = s;
  }
  return o;
}
function fromTRS(t, r, s) {
  t = t || [0,0,0]; r = r || [0,0,0,1]; s = s || [1,1,1];
  const [x,y,z,w] = r;
  const x2=x+x,y2=y+y,z2=z+z;
  const xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
  const [sx,sy,sz] = s;
  return [
    (1-(yy+zz))*sx, (xy+wz)*sx, (xz-wy)*sx, 0,
    (xy-wz)*sy, (1-(xx+zz))*sy, (yz+wx)*sy, 0,
    (xz+wy)*sz, (yz-wx)*sz, (1-(xx+yy))*sz, 0,
    t[0], t[1], t[2], 1
  ];
}
function nodeMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  return fromTRS(n.translation, n.rotation, n.scale);
}
function apply(m, p) {
  const [x,y,z] = p;
  return [
    m[0]*x + m[4]*y + m[8]*z + m[12],
    m[1]*x + m[5]*y + m[9]*z + m[13],
    m[2]*x + m[6]*y + m[10]*z + m[14],
  ];
}

const accessors = json.accessors || [];
const meshes = json.meshes || [];
const nodes = json.nodes || [];

const world = { min:[Infinity,Infinity,Infinity], max:[-Infinity,-Infinity,-Infinity] };
function expand(p){ for(let i=0;i<3;i++){ world.min[i]=Math.min(world.min[i],p[i]); world.max[i]=Math.max(world.max[i],p[i]); } }

let primCount = 0, vertEstimate = 0;
const meshNames = [];
function walk(idx, parentMat) {
  const n = nodes[idx];
  const m = mul(parentMat, nodeMatrix(n));
  if (n.mesh != null) {
    const mesh = meshes[n.mesh];
    if (mesh.name) meshNames.push(mesh.name);
    for (const prim of mesh.primitives || []) {
      const accIdx = prim.attributes && prim.attributes.POSITION;
      if (accIdx == null) continue;
      const acc = accessors[accIdx];
      primCount++;
      vertEstimate += acc.count || 0;
      if (acc.min && acc.max) {
        // 8 corners of local AABB -> world
        const [mnx,mny,mnz] = acc.min, [mxx,mxy,mxz] = acc.max;
        for (const cx of [mnx,mxx]) for (const cy of [mny,mxy]) for (const cz of [mnz,mxz])
          expand(apply(m, [cx,cy,cz]));
      }
    }
  }
  for (const c of n.children || []) walk(c, m);
}

const scene = json.scenes ? json.scenes[json.scene || 0] : { nodes: nodes.map((_,i)=>i) };
for (const r of scene.nodes) walk(r, ident());

const size = [world.max[0]-world.min[0], world.max[1]-world.min[1], world.max[2]-world.min[2]];
const center = [(world.max[0]+world.min[0])/2,(world.max[1]+world.min[1])/2,(world.max[2]+world.min[2])/2];

console.log("=== GLB INSPECT:", path, "===");
console.log("nodes:", nodes.length, "meshes:", meshes.length, "primitives:", primCount, "approxVerts:", vertEstimate);
console.log("world AABB min:", world.min.map(v=>v.toFixed(2)));
console.log("world AABB max:", world.max.map(v=>v.toFixed(2)));
console.log("size (x,y,z):", size.map(v=>v.toFixed(2)));
console.log("center (x,y,z):", center.map(v=>v.toFixed(2)));
console.log("ground plane (min Y):", world.min[1].toFixed(2));
console.log("--- up to 60 node names ---");
console.log(nodes.map(n=>n.name).filter(Boolean).slice(0,60).join(" | ") || "(none)");
console.log("--- up to 40 mesh names ---");
console.log([...new Set(meshNames)].slice(0,40).join(" | ") || "(none)");
