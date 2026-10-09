// v2.20 P3: clicking just beside a small hole (on the flat top) with a cylinder-wanting command picks the hole wall
// within the screen-pixel tolerance; far away it stays the flat face; a direct cylinder hit is unchanged.
import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');await globalThis.__wheelWorker.ready()
const {detectFace,detectFacePreferCyl}=await import('../src/geom/faceDetect.ts')
const m=await globalThis.__wheelWorker.rebuild([{id:'p',type:'extrude',profile:{kind:'rect',a:[-20,-20],b:[20,20]},height:5,operation:'new'},{id:'h',type:'extrude',profile:{kind:'circle',c:[0,0],r:3},height:5,operation:'cut'}])
const V=m.vertices,T=m.triangles
const triAt=(p,nz)=>{ // triangle whose plane contains p (top face z=5, point inside in xy)
  for(let k=0;k<T.length/3;k++){const P=[0,1,2].map(j=>[V[T[3*k+j]*3],V[T[3*k+j]*3+1],V[T[3*k+j]*3+2]]);if(!P.every(q=>Math.abs(q[2]-p[2])<1e-6))continue
    const s=(a,b,c)=>(a[0]-c[0])*(b[1]-c[1])-(b[0]-c[0])*(a[1]-c[1]);const d1=s(p,P[0],P[1]),d2=s(p,P[1],P[2]),d3=s(p,P[2],P[0]);if(!((d1<0||d2<0||d3<0)&&(d1>0||d2>0||d3>0)))return k}
  return -1}
test('near a Ø6 hole edge the hole wall is chosen; far away the plane stays',()=>{
  const p=[3.4,0,5],k=triAt(p); assert.ok(k>=0)
  assert.equal(detectFace(m,k).kind,'planar')
  const near=detectFacePreferCyl(m,k,p,0.6)
  assert.equal(near.kind,'cyl'); assert.ok(Math.abs(near.r-3)<0.1,String(near.r)); assert.ok(Math.abs(Math.abs(near.axis[2])-1)<1e-3)
  const q=[10,0,5],k2=triAt(q)
  assert.equal(detectFacePreferCyl(m,k2,q,0.6).kind,'planar')
  assert.equal(detectFacePreferCyl(m,k,p,0.2).kind,'planar','outside the tolerance → no guess')
})
test('ray hit on the rim edge overlay (no triangle index) still resolves the hole wall',()=>{
  const near=detectFacePreferCyl(m,-1,[3,0,5],0.3)
  assert.equal(near?.kind,'cyl'); assert.ok(Math.abs(near.r-2.5)>0.4&&Math.abs(near.r-3)<0.1)
  assert.equal(detectFacePreferCyl(m,-1,[20,20,5],0.3),null,'box corner edge: nothing cylindrical → null')
})
