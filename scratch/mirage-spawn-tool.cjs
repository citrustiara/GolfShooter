// Mirage spawn placement tool: rasterizes mesh floor heights (same transform as
// gen-map-previews.cjs), draws a labeled game-coordinate grid + candidate spawn
// markers, and reports sampled floorY + openness for each candidate.
// Edit CANDIDATES below, run `node scratch/mirage-spawn-tool.cjs`, then Read the
// PNG at assets/map-previews/mirage-annotated.png to verify placement.
const fs = require("fs");
const zlib = require("zlib");

// game(x,z) candidates to evaluate/draw. Ordered so 1v1 opponents (index 0 vs 1)
// land far apart. Circled zones: bottom-street(S), top-mid(N), left(W), center.
const CANDIDATES = [
  { x: 10, z: 60 },   // 1  bottom street A
  { x: 31, z: -37 },  // 2  top mid A
  { x: -27, z: -19 }, // 3  left A
  { x: 6, z: 8 },     // 4  center A
  { x: 0, z: 61 },    // 5  bottom street B
  { x: 37, z: -42 },  // 6  top mid B
  { x: -22, z: -12 }, // 7  left B
  { x: 12, z: 10 },   // 8  center B
];

const map = JSON.parse(fs.readFileSync("maps/fps/mirage.json", "utf8"));
const S = Number(map.glbScale || 1);
const GP = map.glbPosition || { x: 0, y: 0, z: 0 };
const R = Math.ceil(Math.max(map.bounds?.x || 42, map.bounds?.z || 42) * 1.15);
const YMAX = 40, YMIN = -25;

function parseGlb(path) {
  const buf = fs.readFileSync(path);
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
    else if (type === 0x004e4942) bin = data;
    off += 8 + len;
  }
  return { json, bin };
}
const COMP = { 5120:[1,Int8Array],5121:[1,Uint8Array],5122:[2,Int16Array],5123:[2,Uint16Array],5125:[4,Uint32Array],5126:[4,Float32Array] };
const NUM = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4, MAT4:16 };
function readAccessor(g, idx) {
  const acc = g.json.accessors[idx];
  const [compSize, Arr] = COMP[acc.componentType];
  const num = NUM[acc.type];
  const view = g.json.bufferViews[acc.bufferView];
  const stride = view.byteStride || compSize * num;
  const base = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Float64Array(acc.count * num);
  for (let i = 0; i < acc.count; i++) {
    const el = new Arr(g.bin.buffer, g.bin.byteOffset + base + i * stride, num);
    for (let j = 0; j < num; j++) {
      let v = el[j];
      if (acc.normalized) {
        if (Arr === Int16Array) v = Math.max(v / 32767, -1);
        else if (Arr === Int8Array) v = Math.max(v / 127, -1);
        else if (Arr === Uint16Array) v = v / 65535;
        else if (Arr === Uint8Array) v = v / 255;
      }
      out[i * num + j] = v;
    }
  }
  return { data: out, count: acc.count };
}
function ident(){return [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];}
function mul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;}
function fromTRS(t,r,s){t=t||[0,0,0];r=r||[0,0,0,1];s=s||[1,1,1];const[x,y,z,w]=r;const x2=x+x,y2=y+y,z2=z+z;const xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;const[sx,sy,sz]=s;return[(1-(yy+zz))*sx,(xy+wz)*sx,(xz-wy)*sx,0,(xy-wz)*sy,(1-(xx+zz))*sy,(yz+wx)*sy,0,(xz+wy)*sz,(yz-wx)*sz,(1-(xx+yy))*sz,0,t[0],t[1],t[2],1];}
function nodeMat(n){return n.matrix?n.matrix.slice():fromTRS(n.translation,n.rotation,n.scale);}
function apply(m,x,y,z){return[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];}

const PXU = Math.max(3, Math.min(6, Math.round(760 / R)));
const W = Math.round(2 * R * PXU), H = W;
const col = (x) => Math.round((x + R) * PXU);
const row = (z) => Math.round((z + R) * PXU);
const floorH = new Float64Array(W * H).fill(Infinity);

function rasterTri(ax,ay,az,bx,by,bz,cx,cy,cz,ny) {
  const minC=Math.max(0,Math.floor(Math.min(col(ax),col(bx),col(cx)))), maxC=Math.min(W-1,Math.ceil(Math.max(col(ax),col(bx),col(cx))));
  const minR=Math.max(0,Math.floor(Math.min(row(az),row(bz),row(cz)))), maxR=Math.min(H-1,Math.ceil(Math.max(row(az),row(bz),row(cz))));
  if (maxC<minC||maxR<minR) return;
  const x1=col(ax),z1=row(az),x2=col(bx),z2=row(bz),x3=col(cx),z3=row(cz);
  const den=(z2-z3)*(x1-x3)+(x3-x2)*(z1-z3);
  if (Math.abs(den)<1e-9) return;
  for (let r=minR;r<=maxR;r++) for (let c=minC;c<=maxC;c++) {
    const l1=((z2-z3)*(c-x3)+(x3-x2)*(r-z3))/den;
    const l2=((z3-z1)*(c-x3)+(x1-x3)*(r-z3))/den;
    const l3=1-l1-l2;
    if (l1<-0.02||l2<-0.02||l3<-0.02) continue;
    const y=l1*ay+l2*by+l3*cy;
    const i=r*W+c;
    if (Math.abs(ny)>0.55 && (floorH[i]===Infinity||y>floorH[i])) floorH[i]=y;
  }
}
const g = parseGlb(map.glb);
function walk(idx, pm) {
  const n = g.json.nodes[idx];
  const m = mul(pm, nodeMat(n));
  if (n.mesh != null) {
    for (const prim of g.json.meshes[n.mesh].primitives || []) {
      if (prim.attributes.POSITION == null) continue;
      const pos = readAccessor(g, prim.attributes.POSITION);
      let index;
      if (prim.indices != null) index = readAccessor(g, prim.indices).data;
      else { index = new Float64Array(pos.count); for (let i=0;i<pos.count;i++) index[i]=i; }
      for (let t = 0; t < index.length; t += 3) {
        const i0=index[t],i1=index[t+1],i2=index[t+2];
        const A=apply(m,pos.data[i0*3],pos.data[i0*3+1],pos.data[i0*3+2]);
        const B=apply(m,pos.data[i1*3],pos.data[i1*3+1],pos.data[i1*3+2]);
        const C=apply(m,pos.data[i2*3],pos.data[i2*3+1],pos.data[i2*3+2]);
        const gg=[A[0]*S+GP.x,A[1]*S+GP.y,A[2]*S+GP.z,B[0]*S+GP.x,B[1]*S+GP.y,B[2]*S+GP.z,C[0]*S+GP.x,C[1]*S+GP.y,C[2]*S+GP.z];
        if (Math.min(gg[0],gg[3],gg[6])>R||Math.max(gg[0],gg[3],gg[6])<-R) continue;
        if (Math.min(gg[2],gg[5],gg[8])>R||Math.max(gg[2],gg[5],gg[8])<-R) continue;
        if (Math.min(gg[1],gg[4],gg[7])>YMAX||Math.max(gg[1],gg[4],gg[7])<YMIN) continue;
        const ux=gg[3]-gg[0],uy=gg[4]-gg[1],uz=gg[5]-gg[2],vx=gg[6]-gg[0],vy=gg[7]-gg[1],vz=gg[8]-gg[2];
        let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const L=Math.hypot(nx,ny,nz)||1;ny/=L;
        rasterTri(gg[0],gg[1],gg[2],gg[3],gg[4],gg[5],gg[6],gg[7],gg[8],ny);
      }
    }
  }
  for (const c of n.children || []) walk(c, m);
}
const scene = g.json.scenes[g.json.scene || 0];
for (const r of scene.nodes) walk(r, ident());

// sample floorY (max within radius) + openness for a game point
function sample(px, pz, radUnits = 1.4) {
  const rad = Math.round(radUnits * PXU);
  let best = -Infinity, cx = col(px), cz = row(pz);
  for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
    const r = cz + dr, c = cx + dc; if (r < 0 || r >= H || c < 0 || c >= W) continue;
    const v = floorH[r * W + c]; if (isFinite(v) && v > best) best = v;
  }
  return best;
}
function openness(px, pz, floorY, radUnits = 2.6) {
  const rad = Math.round(radUnits * PXU);
  let ok = 0, total = 0, cx = col(px), cz = row(pz);
  for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
    if (dr*dr + dc*dc > rad*rad) continue;
    const r = cz + dr, c = cx + dc; if (r < 0 || r >= H || c < 0 || c >= W) continue;
    total++;
    const v = floorH[r * W + c];
    if (isFinite(v) && Math.abs(v - floorY) < 1.3) ok++;
  }
  return total ? ok / total : 0;
}

let lo=Infinity,hi=-Infinity;
for (let i=0;i<W*H;i++){ if(isFinite(floorH[i])){lo=Math.min(lo,floorH[i]);hi=Math.max(hi,floorH[i]);} }
const span=Math.max(1e-6,hi-lo);
const img=Buffer.alloc(W*H*3);
for(let i=0;i<W*H;i++){
  const v=floorH[i];
  let r=14,gc=14,b=17;
  if(isFinite(v)){const t=Math.max(0,Math.min(1,(v-lo)/span));const s=Math.round(52+t*168);r=s;gc=s;b=Math.round(s*1.02);}
  img[i*3]=r;img[i*3+1]=gc;img[i*3+2]=b;
}
function px(c,r,R_,G_,B_){ if(c<0||c>=W||r<0||r>=H)return; const i=(r*W+c)*3; img[i]=R_;img[i+1]=G_;img[i+2]=B_; }
function disc(c,r,rad,R_,G_,B_){ for(let dr=-rad;dr<=rad;dr++)for(let dc=-rad;dc<=rad;dc++)if(dc*dc+dr*dr<=rad*rad)px(c+dc,r+dr,R_,G_,B_); }
function ring(c,r,rad,R_,G_,B_){ for(let a=0;a<360;a+=3){const rr=a*Math.PI/180;px(Math.round(c+Math.cos(rr)*rad),Math.round(r+Math.sin(rr)*rad),R_,G_,B_);} }
// grid every 20 units
for (let gx=-80; gx<=80; gx+=20) { const c=col(gx); for(let r=0;r<H;r++) px(c,r,60,60,72); }
for (let gz=-80; gz<=80; gz+=20) { const rr=row(gz); for(let c=0;c<W;c++) px(c,rr,60,60,72); }
// axis 0 lines brighter
for(let r=0;r<H;r++) px(col(0),r,90,90,110);
for(let c=0;c<W;c++) px(c,row(0),90,90,110);

console.log(`R=${R} img=${W}x${H} PXU=${PXU} floorY ${lo.toFixed(1)}..${hi.toFixed(1)}`);
const finalSpawns = [];
CANDIDATES.forEach((p, i) => {
  const y = sample(p.x, p.z);
  const open = openness(p.x, p.z, y);
  const c = col(p.x), r = row(p.z);
  ring(c, r, Math.round(2.6*PXU), 225, 6, 0);
  disc(c, r, 8, 225, 6, 0);
  console.log(`#${i+1} (${p.x},${p.z}) floorY=${isFinite(y)?y.toFixed(2):"VOID"} open=${(open*100).toFixed(0)}% -> spawn.y=${isFinite(y)?(y+0.3).toFixed(2):"??"}`);
  finalSpawns.push({ x: p.x, z: p.z, y: isFinite(y) ? Number((y + 0.3).toFixed(2)) : 4 });
});

function writePNG(path,w,h,imgBuf){
  const raw=Buffer.alloc(h*(w*3+1));
  for(let r=0;r<h;r++){raw[r*(w*3+1)]=0;imgBuf.copy(raw,r*(w*3+1)+1,r*w*3,(r+1)*w*3);}
  const idat=zlib.deflateSync(raw,{level:9});
  function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const t=Buffer.from(type);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([t,data]))>>>0);return Buffer.concat([len,t,data,crc]);}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
  fs.writeFileSync(path,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ihdr),chunk("IDAT",idat),chunk("IEND",Buffer.alloc(0))]));
}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return c^0xffffffff;}
writePNG("assets/map-previews/mirage-annotated.png", W, H, img);
fs.writeFileSync("scratch/mirage-spawns-out.json", JSON.stringify(finalSpawns, null, 2));
console.log("wrote assets/map-previews/mirage-annotated.png and scratch/mirage-spawns-out.json");
