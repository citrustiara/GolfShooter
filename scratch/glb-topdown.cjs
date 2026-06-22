// Decode a .glb, extract world-space triangles, rasterize a top-down view to PNG.
// Produces two images: max-height ("satellite") and floor-height (walkable ground).
// Coordinates are emitted in GAME space for a chosen scale S, with the model
// recentered so its footprint-center -> origin and its min-Y floor -> y=0.
// No external deps (uses zlib for PNG).
const fs = require("fs");
const zlib = require("zlib");

const file = process.argv[2];
const S = parseFloat(process.argv[3] || "2.0"); // game scale
if (!file) { console.error("usage: node glb-topdown.cjs <file.glb> [scale]"); process.exit(1); }

const buf = fs.readFileSync(file);
if (buf.readUInt32LE(0) !== 0x46546c67) { console.error("bad glb"); process.exit(1); }
let off = 12, json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const data = buf.slice(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
  else if (type === 0x004e4942) bin = data;
  off += 8 + len;
}

const accessors = json.accessors, views = json.bufferViews, nodes = json.nodes, meshes = json.meshes;
const COMP = { 5120:[1,Int8Array],5121:[1,Uint8Array],5122:[2,Int16Array],5123:[2,Uint16Array],5125:[4,Uint32Array],5126:[4,Float32Array] };
const NUM = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4, MAT4:16 };

function readAccessor(idx) {
  const acc = accessors[idx];
  const [compSize, Arr] = COMP[acc.componentType];
  const num = NUM[acc.type];
  const view = views[acc.bufferView];
  const stride = view.byteStride || compSize * num;
  const base = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Float64Array(acc.count * num);
  for (let i = 0; i < acc.count; i++) {
    const el = new Arr(bin.buffer, bin.byteOffset + base + i * stride, num);
    for (let j = 0; j < num; j++) out[i * num + j] = el[j];
  }
  return { data: out, num, count: acc.count };
}

// mat4 helpers (column-major)
function ident(){return [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];}
function mul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;}
function fromTRS(t,r,s){t=t||[0,0,0];r=r||[0,0,0,1];s=s||[1,1,1];const[x,y,z,w]=r;const x2=x+x,y2=y+y,z2=z+z;const xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;const[sx,sy,sz]=s;return[(1-(yy+zz))*sx,(xy+wz)*sx,(xz-wy)*sx,0,(xy-wz)*sy,(1-(xx+zz))*sy,(yz+wx)*sy,0,(xz+wy)*sz,(yz-wx)*sz,(1-(xx+yy))*sz,0,t[0],t[1],t[2],1];}
function nodeMat(n){return n.matrix?n.matrix.slice():fromTRS(n.translation,n.rotation,n.scale);}
function apply(m,x,y,z){return[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];}

const tris = []; // {ax,ay,az,...,ny}
function walk(idx, pm) {
  const n = nodes[idx];
  const m = mul(pm, nodeMat(n));
  if (n.mesh != null) {
    for (const prim of meshes[n.mesh].primitives || []) {
      if (prim.attributes.POSITION == null) continue;
      const pos = readAccessor(prim.attributes.POSITION);
      let index;
      if (prim.indices != null) index = readAccessor(prim.indices).data;
      else { index = new Float64Array(pos.count); for (let i=0;i<pos.count;i++) index[i]=i; }
      for (let t = 0; t < index.length; t += 3) {
        const i0=index[t],i1=index[t+1],i2=index[t+2];
        const A=apply(m,pos.data[i0*3],pos.data[i0*3+1],pos.data[i0*3+2]);
        const B=apply(m,pos.data[i1*3],pos.data[i1*3+1],pos.data[i1*3+2]);
        const C=apply(m,pos.data[i2*3],pos.data[i2*3+1],pos.data[i2*3+2]);
        // normal
        const ux=B[0]-A[0],uy=B[1]-A[1],uz=B[2]-A[2],vx=C[0]-A[0],vy=C[1]-A[1],vz=C[2]-A[2];
        let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const L=Math.hypot(nx,ny,nz)||1;ny/=L;
        tris.push([A[0],A[1],A[2],B[0],B[1],B[2],C[0],C[1],C[2],ny]);
      }
    }
  }
  for (const c of n.children || []) walk(c, m);
}
const scene = json.scenes[json.scene||0];
for (const r of scene.nodes) walk(r, ident());

// world AABB
let mnx=Infinity,mny=Infinity,mnz=Infinity,mxx=-Infinity,mxy=-Infinity,mxz=-Infinity;
for(const t of tris){for(let k=0;k<3;k++){const x=t[k*3],y=t[k*3+1],z=t[k*3+2];mnx=Math.min(mnx,x);mxx=Math.max(mxx,x);mny=Math.min(mny,y);mxy=Math.max(mxy,y);mnz=Math.min(mnz,z);mxz=Math.max(mxz,z);}}
const cX=(mnx+mxx)/2, cZ=(mnz+mxz)/2, floorY=mny;
// game transform: g = (model - center)*S ; gy=(y-floorY)*S
function gx(x){return (x-cX)*S;} function gz(z){return (z-cZ)*S;} function gy(y){return (y-floorY)*S;}

const GMINX=gx(mnx),GMAXX=gx(mxx),GMINZ=gz(mnz),GMAXZ=gz(mxz),GMAXY=gy(mxy);
console.log("triangles:",tris.length);
console.log("model center x,z:",cX.toFixed(2),cZ.toFixed(2),"floorY:",floorY.toFixed(2));
console.log("scale S =",S);
console.log("GAME footprint X:",GMINX.toFixed(1),"..",GMAXX.toFixed(1),"  Z:",GMINZ.toFixed(1),"..",GMAXZ.toFixed(1),"  maxY:",GMAXY.toFixed(1));
console.log("glbPosition => x:",(-cX*S).toFixed(3),"y:",(-floorY*S).toFixed(3),"z:",(-cZ*S).toFixed(3));

// ---- rasterize top-down (looking down -Y). image x = game X, image y = game Z ----
const PXU = 7; // pixels per game unit
const padU = 4;
const W = Math.ceil((GMAXX-GMINX+2*padU)*PXU);
const H = Math.ceil((GMAXZ-GMINZ+2*padU)*PXU);
function col(gX){return Math.round((gX-GMINX+padU)*PXU);}
function row(gZ){return Math.round((gZ-GMINZ+padU)*PXU);}
console.log("image:",W,"x",H,"  PXU:",PXU);
console.log("PIXEL->GAME:  gameX = col/"+PXU+" + "+(GMINX-padU).toFixed(3)+"    gameZ = row/"+PXU+" + "+(GMINZ-padU).toFixed(3));

const maxH = new Float64Array(W*H).fill(-Infinity);
const floorH = new Float64Array(W*H).fill(Infinity);
// rasterize each triangle into cells (bounding-box scan with barycentric)
for (const t of tris) {
  const X=[gx(t[0]),gx(t[3]),gx(t[6])], Z=[gz(t[2]),gz(t[5]),gz(t[8])], Y=[gy(t[1]),gy(t[4]),gy(t[7])];
  const ny=t[9];
  let c0=Math.max(0,col(Math.min(...X))),c1=Math.min(W-1,col(Math.max(...X)));
  let r0=Math.max(0,row(Math.min(...Z))),r1=Math.min(H-1,row(Math.max(...Z)));
  const den=(Z[1]-Z[2])*(X[0]-X[2])+(X[2]-X[1])*(Z[0]-Z[2]);
  if(Math.abs(den)<1e-9) continue;
  for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++){
    const px=(c/PXU)+(GMINX-padU), pz=(r/PXU)+(GMINZ-padU);
    const a=((Z[1]-Z[2])*(px-X[2])+(X[2]-X[1])*(pz-Z[2]))/den;
    const b=((Z[2]-Z[0])*(px-X[2])+(X[0]-X[2])*(pz-Z[2]))/den;
    const cc=1-a-b;
    if(a<-0.01||b<-0.01||cc<-0.01) continue;
    const y=a*Y[0]+b*Y[1]+cc*Y[2];
    const idx=r*W+c;
    if(y>maxH[idx]) maxH[idx]=y;
    if(Math.abs(ny)>0.5 && y<floorH[idx]) floorH[idx]=y; // near-horizontal -> floor candidate
  }
}

// color ramp (height -> rgb)
function heat(v,lo,hi){
  if(!isFinite(v)) return [16,16,22];
  let t=Math.max(0,Math.min(1,(v-lo)/(hi-lo)));
  // dark-blue -> teal -> green -> yellow -> red
  const stops=[[20,24,60],[20,110,140],[40,170,90],[220,200,60],[210,70,50]];
  const f=t*(stops.length-1); const i=Math.floor(f); const fr=f-i;
  const a=stops[i],b=stops[Math.min(i+1,stops.length-1)];
  return [a[0]+(b[0]-a[0])*fr,a[1]+(b[1]-a[1])*fr,a[2]+(b[2]-a[2])*fr];
}

function render(heightArr, lo, hi, fname, title) {
  const img = Buffer.alloc(W*H*3);
  for(let i=0;i<W*H;i++){const[r,g,b]=heat(heightArr[i],lo,hi);img[i*3]=r;img[i*3+1]=g;img[i*3+2]=b;}
  // grid every 10 game units + axes
  function setpx(c,r,rgb){if(c<0||c>=W||r<0||r>=H)return;const i=(r*W+c)*3;img[i]=rgb[0];img[i+1]=rgb[1];img[i+2]=rgb[2];}
  for(let gX=Math.ceil(GMINX/10)*10; gX<=GMAXX; gX+=10){const c=col(gX);const axis=Math.abs(gX)<0.01;for(let r=0;r<H;r++)setpx(c,r,axis?[255,80,80]:[70,70,90]);}
  for(let gZ=Math.ceil(GMINZ/10)*10; gZ<=GMAXZ; gZ+=10){const r=row(gZ);const axis=Math.abs(gZ)<0.01;for(let c=0;c<W;c++)setpx(c,r,axis?[255,80,80]:[70,70,90]);}
  // 50-unit major lines brighter
  for(let gX=Math.ceil(GMINX/50)*50; gX<=GMAXX; gX+=50){const c=col(gX);for(let r=0;r<H;r++)setpx(c,r,[120,120,160]);}
  for(let gZ=Math.ceil(GMINZ/50)*50; gZ<=GMAXZ; gZ+=50){const r=row(gZ);for(let c=0;c<W;c++)setpx(c,r,[120,120,160]);}
  writePNG(fname, W, H, img);
  console.log("wrote",fname,title);
}

// minimal PNG (truecolor, no alpha)
function writePNG(path, w, h, rgb) {
  const raw = Buffer.alloc((w*3+1)*h);
  for(let r=0;r<h;r++){raw[r*(w*3+1)]=0;rgb.copy(raw,r*(w*3+1)+1,r*w*3,(r+1)*w*3);}
  const idat = zlib.deflateSync(raw,{level:9});
  function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const t=Buffer.from(type);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([t,data]))>>>0);return Buffer.concat([len,t,data,crc]);}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ihdr),chunk("IDAT",idat),chunk("IEND",Buffer.alloc(0))]);
  fs.writeFileSync(path,png);
}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return c^0xffffffff;}

// optional spawn markers from scratch/markers.json -> drawn on floor image
let markers = [];
try { markers = JSON.parse(fs.readFileSync("scratch/markers.json","utf8")); } catch {}

function renderWithMarkers(heightArr, lo, hi, fname, title, marks) {
  const img = Buffer.alloc(W*H*3);
  for(let i=0;i<W*H;i++){const[r,g,b]=heat(heightArr[i],lo,hi);img[i*3]=r;img[i*3+1]=g;img[i*3+2]=b;}
  function setpx(c,r,rgb){if(c<0||c>=W||r<0||r>=H)return;const i=(r*W+c)*3;img[i]=rgb[0];img[i+1]=rgb[1];img[i+2]=rgb[2];}
  for(let gX=Math.ceil(GMINX/10)*10; gX<=GMAXX; gX+=10){const c=col(gX);const axis=Math.abs(gX)<0.01;for(let r=0;r<H;r++)setpx(c,r,axis?[255,80,80]:[70,70,90]);}
  for(let gZ=Math.ceil(GMINZ/10)*10; gZ<=GMAXZ; gZ+=10){const r=row(gZ);const axis=Math.abs(gZ)<0.01;for(let c=0;c<W;c++)setpx(c,r,axis?[255,80,80]:[70,70,90]);}
  for(let gX=Math.ceil(GMINX/50)*50; gX<=GMAXX; gX+=50){const c=col(gX);for(let r=0;r<H;r++)setpx(c,r,[120,120,160]);}
  for(let gZ=Math.ceil(GMINZ/50)*50; gZ<=GMAXZ; gZ+=50){const r=row(gZ);for(let c=0;c<W;c++)setpx(c,r,[120,120,160]);}
  // draw markers: white-ringed magenta cross, radius scales, with index pips
  marks.forEach((mk,idx)=>{
    const c=col(mk.x), r=row(mk.z);
    for(let d=-9;d<=9;d++){setpx(c+d,r,[255,255,255]);setpx(c,r+d,[255,255,255]);}
    for(let d=-6;d<=6;d++){setpx(c+d,r,[255,0,255]);setpx(c,r+d,[255,0,255]);}
    // index pips: idx+1 small dots above marker
    for(let p=0;p<=idx;p++) setpx(c-9+p*2, r-12, [255,255,0]);
  });
  writePNG(fname, W, H, img);
  console.log("wrote",fname,title,"markers:",marks.length);
}

// per-marker floor/ceiling sampling over a player-radius neighborhood
function sampleAt(gX, gZ) {
  const c0=col(gX), r0=row(gZ), rad=3; // ~0.43 units at PXU=7
  const floors=[], ceils=[]; let cov=0, tot=0;
  for(let r=r0-rad;r<=r0+rad;r++)for(let c=c0-rad;c<=c0+rad;c++){
    if(c<0||c>=W||r<0||r>=H) continue; tot++;
    const f=floorH[r*W+c], m=maxH[r*W+c];
    if(isFinite(f)){floors.push(f);cov++;} if(isFinite(m))ceils.push(m);
  }
  floors.sort((a,b)=>a-b); ceils.sort((a,b)=>a-b);
  const med=a=>a.length?a[Math.floor(a.length/2)]:null;
  return { coverage:(cov/tot), floorMin:floors[0]??null, floorMed:med(floors), ceilMed:med(ceils) };
}

render(maxH, 0, GMAXY, "scratch/dust2-top.png", "(max height / satellite)");
render(floorH, 0, GMAXY*0.6, "scratch/dust2-floor.png", "(floor height / walkable)");
renderWithMarkers(floorH, 0, GMAXY*0.6, "scratch/dust2-floor-marked.png", "(floor + spawn markers)", markers);
console.log("--- marker floor samples (game units) ---");
markers.forEach((m,i)=>{
  const s=sampleAt(m.x,m.z);
  const cov=(s.coverage*100).toFixed(0)+"%";
  const floor=s.floorMed!=null?s.floorMed.toFixed(2):"VOID";
  const ceil=s.ceilMed!=null?s.ceilMed.toFixed(2):"-";
  const headroom=(s.floorMed!=null&&s.ceilMed!=null)?(s.ceilMed-s.floorMed).toFixed(1):"-";
  console.log(`  ${String(i+1).padStart(2)} ${(m.label||"").padEnd(9)} (${String(m.x).padStart(4)},${String(m.z).padStart(4)})  cover ${cov.padStart(4)}  floorY ${floor.padStart(6)}  ceilY ${ceil.padStart(6)}  headroom ${headroom}`);
});
