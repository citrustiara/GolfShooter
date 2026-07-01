// Top-down floor render of mirage GLB in GAME coords (game = model + glbPosition),
// clipped to the playable region. Samples floor Y at markers from scratch/mirage-markers.json.
const fs = require("fs");
const zlib = require("zlib");

const GP = { x: 23.063, y: 11.379, z: 28.854 }; // mirage.json glbPosition, scale 1
const R = 110; // clip |x|,|z| <= R
const YMIN = -20, YMAX = Number(process.argv[2] || 80);

const buf = fs.readFileSync("maps/fps/glb/mirage/mirage_cs2_fps.glb");
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

const PXU = 6, W = Math.round(2*R*PXU), H = W;
const col = (x) => Math.round((x + R) * PXU);
const row = (z) => Math.round((z + R) * PXU);
const floorH = new Float64Array(W*H).fill(Infinity);
const maxH = new Float64Array(W*H).fill(-Infinity);

function rasterTri(ax,ay,az,bx,by,bz,cx,cy,cz,ny) {
  const minC = Math.max(0, Math.floor(Math.min(col(ax),col(bx),col(cx))));
  const maxC = Math.min(W-1, Math.ceil(Math.max(col(ax),col(bx),col(cx))));
  const minR = Math.max(0, Math.floor(Math.min(row(az),row(bz),row(cz))));
  const maxR = Math.min(H-1, Math.ceil(Math.max(row(az),row(bz),row(cz))));
  if (maxC < minC || maxR < minR) return;
  const x1=col(ax),z1=row(az),x2=col(bx),z2=row(bz),x3=col(cx),z3=row(cz);
  const den = (z2-z3)*(x1-x3)+(x3-x2)*(z1-z3);
  if (Math.abs(den) < 1e-9) return;
  for (let r=minR;r<=maxR;r++) for (let c=minC;c<=maxC;c++) {
    const l1=((z2-z3)*(c-x3)+(x3-x2)*(r-z3))/den;
    const l2=((z3-z1)*(c-x3)+(x1-x3)*(r-z3))/den;
    const l3=1-l1-l2;
    if (l1<-0.02||l2<-0.02||l3<-0.02) continue;
    const y=l1*ay+l2*by+l3*cy;
    const i=r*W+c;
    if (y>maxH[i]) maxH[i]=y;
    if (Math.abs(ny)>0.55 && (floorH[i]===Infinity || y>floorH[i])) floorH[i]=y; // highest walkable
  }
}
// For floor we actually want the LOWEST walkable surface is wrong for bridges; use
// highest walkable below a headroom cap? Simple: track ALL walkable, keep lowest (ground level).

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
        // game coords
        const g=[A[0]+GP.x,A[1]+GP.y,A[2]+GP.z, B[0]+GP.x,B[1]+GP.y,B[2]+GP.z, C[0]+GP.x,C[1]+GP.y,C[2]+GP.z];
        if (Math.min(g[0],g[3],g[6])>R||Math.max(g[0],g[3],g[6])<-R) continue;
        if (Math.min(g[2],g[5],g[8])>R||Math.max(g[2],g[5],g[8])<-R) continue;
        if (Math.min(g[1],g[4],g[7])>YMAX||Math.max(g[1],g[4],g[7])<YMIN) continue;
        const ux=g[3]-g[0],uy=g[4]-g[1],uz=g[5]-g[2],vx=g[6]-g[0],vy=g[7]-g[1],vz=g[8]-g[2];
        let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const L=Math.hypot(nx,ny,nz)||1;ny/=L;
        rasterTri(g[0],g[1],g[2],g[3],g[4],g[5],g[6],g[7],g[8],ny);
      }
    }
  }
  for (const c of n.children || []) walk(c, m);
}
const scene = json.scenes[json.scene||0];
for (const r of scene.nodes) walk(r, ident());

let lo=Infinity,hi=-Infinity;
for (let i=0;i<W*H;i++){ if(isFinite(floorH[i])){lo=Math.min(lo,floorH[i]);hi=Math.max(hi,floorH[i]);} }
console.log("floor y range:",lo.toFixed(2),"..",hi.toFixed(2));

function heat(v,a,b){ if(!isFinite(v))return[8,8,10]; const t=Math.max(0,Math.min(1,(v-a)/(b-a))); return [Math.round(40+t*215),Math.round(40+t*180),Math.round(60+t*60)]; }
function writePNG(path,w,h,img){
  const raw=Buffer.alloc(h*(w*3+1));
  for(let r=0;r<h;r++){raw[r*(w*3+1)]=0;img.copy(raw,r*(w*3+1)+1,r*w*3,(r+1)*w*3);}
  const idat=zlib.deflateSync(raw,{level:6});
  function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const t=Buffer.from(type);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([t,data]))>>>0);return Buffer.concat([len,t,data,crc]);}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
  fs.writeFileSync(path,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ihdr),chunk("IDAT",idat),chunk("IEND",Buffer.alloc(0))]));
}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return c^0xffffffff;}

let markers=[]; try{markers=JSON.parse(fs.readFileSync("scratch/mirage-markers.json","utf8"));}catch{}
const img=Buffer.alloc(W*H*3);
for(let i=0;i<W*H;i++){const[r,g,b]=heat(floorH[i],lo,Math.min(hi,lo+25));img[i*3]=r;img[i*3+1]=g;img[i*3+2]=b;}
function setpx(c,r,rgb){if(c<0||c>=W||r<0||r>=H)return;const i=(r*W+c)*3;img[i]=rgb[0];img[i+1]=rgb[1];img[i+2]=rgb[2];}
for(let gX=Math.ceil(-R/10)*10;gX<=R;gX+=10){const c=col(gX);const ax=Math.abs(gX)<0.01;for(let r=0;r<H;r++)setpx(c,r,ax?[255,60,60]:[60,60,80]);}
for(let gZ=Math.ceil(-R/10)*10;gZ<=R;gZ+=10){const r=row(gZ);const ax=Math.abs(gZ)<0.01;for(let c=0;c<W;c++)setpx(c,r,ax?[255,60,60]:[60,60,80]);}
markers.forEach((mk,idx)=>{
  const c=col(mk.x),r=row(mk.z);
  for(let d=-9;d<=9;d++){setpx(c+d,r,[255,255,255]);setpx(c,r+d,[255,255,255]);}
  for(let d=-5;d<=5;d++){setpx(c+d,r,[255,0,255]);setpx(c,r+d,[255,0,255]);}
  for(let p=0;p<=idx;p++)setpx(c-9+p*3,r-13,[255,255,0]);
});
writePNG("scratch/mirage-floor.png",W,H,img);
console.log("wrote scratch/mirage-floor.png", W+"x"+H, " pixel->game: x=col/"+PXU+"-"+R+", z=row/"+PXU+"-"+R);
markers.forEach((m,i)=>{
  const c0=col(m.x),r0=row(m.z),fs2=[];
  for(let r=r0-3;r<=r0+3;r++)for(let c=c0-3;c<=c0+3;c++){if(c<0||c>=W||r<0||r>=H)continue;const f=floorH[r*W+c];if(isFinite(f))fs2.push(f);}
  fs2.sort((a,b)=>a-b);
  const med=fs2.length?fs2[Math.floor(fs2.length/2)]:null;
  console.log(`  ${i+1} ${(m.label||"").padEnd(10)} (${m.x},${m.z}) cover ${(fs2.length/49*100).toFixed(0)}% floorY ${med==null?"VOID":med.toFixed(2)}`);
});
