// Isometric painter's-algorithm render of a .glb so iconic 3D structure is visible.
// Reuses the triangle extraction approach. Renders from a chosen compass corner.
const fs = require("fs");
const zlib = require("zlib");

const file = process.argv[2];
const VIEW = (process.argv[3] || "NE"); // viewing corner: NE,NW,SE,SW
if (!file) { console.error("usage: node glb-iso.cjs <file.glb> [NE|NW|SE|SW]"); process.exit(1); }

const buf = fs.readFileSync(file);
let off = 12, json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const data = buf.slice(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
  else if (type === 0x004e4942) bin = data;
  off += 8 + len;
}
const accessors=json.accessors,views=json.bufferViews,nodes=json.nodes,meshes=json.meshes;
const COMP={5120:[1,Int8Array],5121:[1,Uint8Array],5122:[2,Int16Array],5123:[2,Uint16Array],5125:[4,Uint32Array],5126:[4,Float32Array]};
const NUM={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function readAccessor(idx){const acc=accessors[idx];const[cs,Arr]=COMP[acc.componentType];const num=NUM[acc.type];const view=views[acc.bufferView];const stride=view.byteStride||cs*num;const base=(view.byteOffset||0)+(acc.byteOffset||0);const out=new Float64Array(acc.count*num);for(let i=0;i<acc.count;i++){const el=new Arr(bin.buffer,bin.byteOffset+base+i*stride,num);for(let j=0;j<num;j++)out[i*num+j]=el[j];}return{data:out,num,count:acc.count};}
function ident(){return[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];}
function mul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;}
function fromTRS(t,r,s){t=t||[0,0,0];r=r||[0,0,0,1];s=s||[1,1,1];const[x,y,z,w]=r;const x2=x+x,y2=y+y,z2=z+z;const xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;const[sx,sy,sz]=s;return[(1-(yy+zz))*sx,(xy+wz)*sx,(xz-wy)*sx,0,(xy-wz)*sy,(1-(xx+zz))*sy,(yz+wx)*sy,0,(xz+wy)*sz,(yz-wx)*sz,(1-(xx+yy))*sz,0,t[0],t[1],t[2],1];}
function nodeMat(n){return n.matrix?n.matrix.slice():fromTRS(n.translation,n.rotation,n.scale);}
function apply(m,x,y,z){return[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];}

const tris=[];
function walk(idx,pm){const n=nodes[idx];const m=mul(pm,nodeMat(n));if(n.mesh!=null){for(const prim of meshes[n.mesh].primitives||[]){if(prim.attributes.POSITION==null)continue;const pos=readAccessor(prim.attributes.POSITION);let index;if(prim.indices!=null)index=readAccessor(prim.indices).data;else{index=new Float64Array(pos.count);for(let i=0;i<pos.count;i++)index[i]=i;}for(let t=0;t<index.length;t+=3){const i0=index[t],i1=index[t+1],i2=index[t+2];const A=apply(m,pos.data[i0*3],pos.data[i0*3+1],pos.data[i0*3+2]);const B=apply(m,pos.data[i1*3],pos.data[i1*3+1],pos.data[i1*3+2]);const C=apply(m,pos.data[i2*3],pos.data[i2*3+1],pos.data[i2*3+2]);tris.push([A,B,C]);}}}for(const c of n.children||[])walk(c,m);}
for(const r of json.scenes[json.scene||0].nodes)walk(r,ident());

// recenter
let mnx=Infinity,mny=Infinity,mnz=Infinity,mxx=-Infinity,mxy=-Infinity,mxz=-Infinity;
for(const t of tris)for(const p of t){mnx=Math.min(mnx,p[0]);mxx=Math.max(mxx,p[0]);mny=Math.min(mny,p[1]);mxy=Math.max(mxy,p[1]);mnz=Math.min(mnz,p[2]);mxz=Math.max(mxz,p[2]);}
const cX=(mnx+mxx)/2,cZ=(mnz+mxz)/2,cY=mny;
// view direction: looking down at 35deg from a compass corner. game axes: x east, z south(in image), y up.
const sx = VIEW.includes("E")?1:-1; // east/west
const sz = VIEW.includes("S")?1:-1; // south/north
// camera basis: right = (sx, 0, -? ), simplistic iso
function project(p){
  const x=(p[0]-cX), y=(p[1]-cY), z=(p[2]-cZ);
  // rotate around Y by 45 toward chosen corner, then tilt
  const rx = sx*x*0.7071 + sz*z*0.7071;     // screen horizontal
  const depth = -sx*x*0.7071 + sz*z*0.7071; // into screen (for sorting)
  const ry = depth*0.5 - y; // tilt: higher y => up on screen; depth adds vertical for iso
  return {sx:rx, sy:ry, d:depth - y*0.3};
}
const P=tris.map(t=>{const a=project(t[0]),b=project(t[1]),c=project(t[2]);
  // normal for shading (world)
  const ux=t[1][0]-t[0][0],uy=t[1][1]-t[0][1],uz=t[1][2]-t[0][2],vx=t[2][0]-t[0][0],vy=t[2][1]-t[0][1],vz=t[2][2]-t[0][2];
  let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const L=Math.hypot(nx,ny,nz)||1;nx/=L;ny/=L;nz/=L;
  const light=Math.max(0.15,0.35+0.55*Math.abs(ny)+0.25*nx); // top-lit
  const height=(t[0][1]+t[1][1]+t[2][1])/3 - cY;
  return {a,b,c,d:(a.d+b.d+c.d)/3,light,height};
});
P.sort((p,q)=>p.d-q.d); // far first

let smnx=Infinity,smny=Infinity,smxx=-Infinity,smxy=-Infinity;
for(const p of P)for(const v of [p.a,p.b,p.c]){smnx=Math.min(smnx,v.sx);smxx=Math.max(smxx,v.sx);smny=Math.min(smny,v.sy);smxy=Math.max(smxy,v.sy);}
const PAD=20,SCALE=8;
const W=Math.ceil((smxx-smnx)*SCALE)+PAD*2,H=Math.ceil((smxy-smny)*SCALE)+PAD*2;
function CX(x){return Math.round((x-smnx)*SCALE)+PAD;}
function CY(y){return H-(Math.round((y-smny)*SCALE)+PAD);}
const img=Buffer.alloc(W*H*3);for(let i=0;i<W*H;i++){img[i*3]=12;img[i*3+1]=14;img[i*3+2]=20;}
const maxHt=mxy-mny;
function heightColor(h,light){let t=Math.max(0,Math.min(1,h/maxHt));const base=[[90,90,110],[150,140,110],[200,170,120],[210,120,90]];const f=t*(base.length-1),i=Math.floor(f),fr=f-i;const a=base[i],b=base[Math.min(i+1,base.length-1)];return[(a[0]+(b[0]-a[0])*fr)*light,(a[1]+(b[1]-a[1])*fr)*light,(a[2]+(b[2]-a[2])*fr)*light];}
function tri(p){const x0=CX(p.a.sx),y0=CY(p.a.sy),x1=CX(p.b.sx),y1=CY(p.b.sy),x2=CX(p.c.sx),y2=CY(p.c.sy);const[r,g,bl]=heightColor(p.height,p.light);const minx=Math.max(0,Math.min(x0,x1,x2)),maxx=Math.min(W-1,Math.max(x0,x1,x2)),miny=Math.max(0,Math.min(y0,y1,y2)),maxy=Math.min(H-1,Math.max(y0,y1,y2));const den=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2);if(Math.abs(den)<1e-9)return;for(let y=miny;y<=maxy;y++)for(let x=minx;x<=maxx;x++){const a=((y1-y2)*(x-x2)+(x2-x1)*(y-y2))/den,b=((y2-y0)*(x-x2)+(x0-x2)*(y-y2))/den,c=1-a-b;if(a<-0.01||b<-0.01||c<-0.01)continue;const i=(y*W+x)*3;img[i]=r;img[i+1]=g;img[i+2]=bl;}}
for(const p of P)tri(p);

function writePNG(path,w,h,rgb){const raw=Buffer.alloc((w*3+1)*h);for(let r=0;r<h;r++){raw[r*(w*3+1)]=0;rgb.copy(raw,r*(w*3+1)+1,r*w*3,(r+1)*w*3);}const idat=zlib.deflateSync(raw,{level:9});function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const t=Buffer.from(type);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([t,data]))>>>0);return Buffer.concat([len,t,data,crc]);}const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ihdr),chunk("IDAT",idat),chunk("IEND",Buffer.alloc(0))]);fs.writeFileSync(path,png);}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return c^0xffffffff;}
writePNG("scratch/dust2-iso-"+VIEW+".png",W,H,img);
console.log("wrote scratch/dust2-iso-"+VIEW+".png ("+W+"x"+H+") view="+VIEW);
