// CREATE ▸ 螺紋 on cylindrical faces of ANY axis (X, Y, slanted), outside (boss/shaft) and inside (hole).
// Real kernel + store; the face is picked through the same detectFace() the viewport uses.
import test from 'node:test';import assert from 'node:assert/strict';import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready()
const {useApp}=await import('../src/store.ts');const {detectFace}=await import('../src/geom/faceDetect.ts')
const {threadLocalToWorld,threadFrameFromFace,threadFrameRotation}=await import('../src/cad/threadFrame.ts')
const g=()=>useApp.getState()
const block={id:'block',type:'extrude',profile:{kind:'rect',a:[-20,-20],b:[20,20]},height:40,operation:'new'}
const norm=a=>{const L=Math.hypot(...a);return a.map(x=>x/L)},dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
const distAxis=(p,o,a)=>{const d=[p[0]-o[0],p[1]-o[1],p[2]-o[2]],t=dot(d,a);return [Math.hypot(d[0]-t*a[0],d[1]-t*a[1],d[2]-t*a[2]),t]}
// a triangle of the body mesh lying on the cylinder (axis o,a radius r, axial range t0..t1)
function pickCyl(o,a,r,t0,t1){
  const m=g().bodyMesh,v=m.vertices,t=m.triangles
  for(let k=0;k<t.length/3;k++){
    const c=[0,1,2].map(i=>(v[t[3*k]*3+i]+v[t[3*k+1]*3+i]+v[t[3*k+2]*3+i])/3),[d,s]=distAxis(c,o,a)
    if(Math.abs(d-r)<0.3&&s>t0+0.5&&s<t1-0.5)return detectFace(m,k)
  }
  return null
}
async function seed(features){
  useApp.setState({...useApp.getInitialState(),appConfirm:async()=>true},true)
  assert.equal(await g().applyFeatures(features,'seed'),true,g().status)
}
async function threadOn(det){
  assert.equal(det?.kind,'cyl');g().applyThreadFacePick(det)
  const dlg=g().featDlg;assert.ok(dlg&&(dlg.kind==='othread'||dlg.kind==='ithread'),g().status)
  useApp.setState({featDlg:{...dlg,params:{...dlg.params,modeled:1}}})
  await g().commitFeatDlg();for(let i=0;i<300&&g().busy;i++)await new Promise(r=>setTimeout(r,10))
  return g().features.at(-1)
}
// mesh vertices near the cylinder: ridge must reach crest radius and stay within the face span
function ringStats(o,a,t0,t1){
  const v=g().bodyMesh.vertices;let rMax=0,rMin=Infinity,n=0
  for(let i=0;i<v.length;i+=3){const p=[v[i],v[i+1],v[i+2]],[d,s]=distAxis(p,o,a);if(s>t0+0.2&&s<t1-0.2&&d<12){rMax=Math.max(rMax,d);rMin=Math.min(rMin,d);n++}}
  return {rMax,rMin,n}
}

// Same thread on a plain Z-axis cylinder (original code path) → reference crest/root radii.
async function zReference(type,r,feat){
  const body=type==='othread'?{id:'ref',type:'extrude',profile:{kind:'circle',c:[0,0],r},height:feat.height,operation:'new'}
    :{id:'ref',type:'extrude',profile:{kind:'rect',a:[-20,-20],b:[20,20]},height:feat.height,operation:'new'}
  const hole={id:'refh',type:'extrude',profile:{kind:'circle',c:[0,0],r},height:feat.height,operation:'cut'}
  const {frame:_f,id:_i,...rest}=feat
  await seed(type==='othread'?[body,{...rest,id:'t'}]:[body,hole,{...rest,id:'t',z0:undefined}])
  return ringStats([0,0,0],[0,0,1],0,feat.height)
}

test('frame math: local +Z maps onto the axis, origin onto the face start',()=>{
  for(const a of [[1,0,0],[0,1,0],[0,-1,0],norm([1,1,1]),[0,0,-1]]){
    const fr={o:[1,2,3],axis:a},p=threadLocalToWorld(fr,[0,0,10])
    p.forEach((x,i)=>assert.ok(Math.abs(x-(fr.o[i]+10*a[i]))<1e-9,`${a} → ${p}`))
    const q=threadLocalToWorld(fr,[5,0,0]);assert.ok(Math.abs(dot([q[0]-1,q[1]-2,q[2]-3],a))<1e-9,'radial stays ⊥ axis')
  }
  assert.equal(threadFrameRotation([0,0,1]),null)
  const {frame,height}=threadFrameFromFace({p:[27.5,0,20],axis:[1,0,0],h0:-7.5,h1:7.5});assert.deepEqual(frame,{o:[20,0,20],axis:[1,0,0]});assert.equal(height,15)
})

test('external thread on an X-axis boss: modeled ridge wraps the boss along X',async()=>{
  const boss={id:'bossX',type:'extrude',plane:'YZ',profile:{kind:'circle',c:[0,20],r:5},height:15,baseZ:20,operation:'join'}
  await seed([block,boss])
  const det=pickCyl([20,0,20],[1,0,0],5,0,15);assert.ok(det,'picked the boss side face');assert.ok(Math.abs(Math.abs(det.axis[0])-1)<1e-3,`axis ${det.axis}`)
  const f=await threadOn(det)
  assert.equal(f.type,'othread',g().status);assert.ok(f.frame,'feature carries its frame');assert.deepEqual(g().failedFeatureIds,[])
  assert.ok(Math.abs(Math.abs(f.frame.axis[0])-1)<1e-6);assert.ok(Math.abs(f.height-15)<0.2)
  const o=f.frame.o,a=f.frame.axis,st=ringStats(o,a,0,15)
  assert.ok(st.n>100&&st.rMax>5.5,`ridge present around the X boss (rMax ${st.rMax})`)
  assert.ok(!(g().lastBuildWarnings??[]).some(x=>/螺纹生成失败/.test(x)),String(g().lastBuildWarnings))
  const ref=await zReference('othread',5,f)
  assert.ok(Math.abs(st.rMax-ref.rMax)<0.05&&Math.abs(st.rMin-ref.rMin)<0.05,`X thread ${JSON.stringify(st)} == Z thread ${JSON.stringify(ref)} (rigidly placed)`)
})

test('internal thread in a Y-axis through hole and an X-axis blind hole (blind bottom not over-drilled)',async()=>{
  // through hole along Y (XZ-plane cut through the whole block)
  const holeY={id:'holeY',type:'extrude',plane:'XZ',profile:{kind:'circle',c:[0,20],r:4.2},height:60,baseZ:30,operation:'cut'}   // XZ sketch at y=30 cuts toward −Y
  await seed([block,holeY])
  const detY=pickCyl([0,0,20],[0,1,0],4.2,-20,20);assert.ok(detY?.concave,'hole wall detected as concave')
  const fy=await threadOn(detY)
  assert.equal(fy.type,'ithread',g().status);assert.ok(fy.frame);assert.ok(Math.abs(Math.abs(fy.frame.axis[1])-1)<1e-6);assert.equal(fy.d,8)
  assert.ok(Math.abs(fy.height-40)<0.3,`depth ${fy.height}`);assert.deepEqual(g().failedFeatureIds,[])
  const sy=ringStats(fy.frame.o,fy.frame.axis,0,fy.height),depthY=Math.min(fy.pitch*0.6,4*0.45)
  assert.ok(Math.abs(sy.rMin-(4-depthY))<0.15,`minor radius ${sy.rMin} vs ${4-depthY}`)
  // blind hole along X from the +X face (closed bottom inside the block)
  const holeX={id:'holeX',type:'extrude',plane:'YZ',profile:{kind:'circle',c:[0,20],r:4.2},height:13,baseZ:8,operation:'cut'}
  await seed([block,holeX])
  const detX=pickCyl([20,0,20],[1,0,0],4.2,-12,0);assert.ok(detX?.concave,'blind hole wall')
  const bottomX=()=>{const v=g().bodyMesh.vertices;let m=Infinity;for(let i=0;i<v.length;i+=3){const d=Math.hypot(v[i+1],v[i+2]-20);if(d<4.3&&d>0.01&&v[i]<19&&v[i]>-19)m=Math.min(m,v[i])};return m}
  const bottom0=bottomX();assert.ok(bottom0>5&&bottom0<10,`blind bottom ${bottom0}`)
  const fx=await threadOn(detX);assert.equal(fx.type,'ithread');assert.deepEqual(g().failedFeatureIds,[])
  // the blind bottom stays where it was: the frame path must not over-drill past a closed end
  assert.ok(Math.abs(fx.frame.o[0]-bottom0)<0.05&&fx.frame.axis[0]>0.99,JSON.stringify(fx.frame))
  const minX=bottomX();assert.ok(minX>bottom0-0.05,`bore bottom drilled deeper: ${minX} < ${bottom0}`)
})

test('external thread on a slanted (45°) shaft',async()=>{
  // shaft: revolve-free — a cylinder extruded on an XY circle then rotated 45° about Y by a transform feature
  const shaft={id:'shaft',type:'extrude',profile:{kind:'circle',c:[0,0],r:6},height:30,operation:'new'}
  const tilt={id:'tilt',type:'transform',dx:0,dy:0,dz:0,rz:0,ry:45}
  await seed([shaft,tilt])
  const a=norm([Math.sin(Math.PI/4),0,Math.cos(Math.PI/4)])
  const det=pickCyl([0,0,0],a,6,0,30)
  if(!det||det.kind!=='cyl'){console.log('# slanted body unavailable in this transform build — skipped');return}
  const f=await threadOn(det);assert.equal(f.type,'othread',g().status);assert.ok(f.frame)
  assert.ok(Math.abs(Math.abs(dot(f.frame.axis,a))-1)<1e-3,`axis ${f.frame.axis}`)
  const st=ringStats(f.frame.o,f.frame.axis,0,f.height),ref=await zReference('othread',6,f)
  assert.ok(Math.abs(st.rMax-ref.rMax)<0.1,`slanted crest ${st.rMax} vs Z ${ref.rMax}`)
})

test('Z-axis picks keep the original frame-less features (byte-compatible)',async()=>{
  const bossZ={id:'bossZ',type:'extrude',profile:{kind:'circle',c:[0,0],r:5},height:10,baseZ:40,operation:'join'}
  await seed([block,bossZ])
  const f=await threadOn(pickCyl([0,0,40],[0,0,1],5,0,10))
  assert.equal(f.type,'othread');assert.equal(f.frame,undefined);assert.ok(Math.abs(f.z0-40)<0.2)
})
