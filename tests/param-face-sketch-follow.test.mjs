// P1 (v2.20 tester): L bracket dimensioned with user parameter t → extrude 30 → sketch on the top face
// of the horizontal leg → two Ø6 through holes → R5 fillet on inner corner → mirror (join) → t 8 → 10.
// The leg top face moves along its normal but is the same face: the hole sketch must follow it.
import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');await globalThis.__wheelWorker.ready()
const {useApp,buildProjectPayload}=await import('../src/store.ts')
const g=()=>useApp.getState()
const vol=()=>{const m=g().bodyMesh;let v=0;const V=m.vertices,T=m.triangles;for(let i=0;i<T.length;i+=3){const a=T[i]*3,b=T[i+1]*3,c=T[i+2]*3;v+=(V[a]*(V[b+1]*V[c+2]-V[b+2]*V[c+1])-V[a+1]*(V[b]*V[c+2]-V[b+2]*V[c])+V[a+2]*(V[b]*V[c+1]-V[b+1]*V[c]))/6}return Math.abs(v)}
const bbox=()=>{const V=g().bodyMesh.vertices,lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9];for(let i=0;i<V.length;i+=3)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],V[i+k]);hi[k]=Math.max(hi[k],V[i+k])}return {lo,hi}}
export async function seedL(t=8){
  // L: (0,0)→(50,0)→(50,t)→(t,t)→(t,40)→(0,40); leg thickness t on both legs
  const pts=[[0,0],[50,0],[50,t],[t,t],[t,40],[0,40]]
  const P=(i)=>({kind:'pt',shape:0,idx:i})
  const cons=[
    {id:'fx',kind:'con',type:'fix',a:P(0)},
    {id:'h0',kind:'con',type:'h',a:{kind:'edge',shape:0,idx:0}},
    {id:'v1',kind:'con',type:'v',a:{kind:'edge',shape:0,idx:1}},
    {id:'h2',kind:'con',type:'h',a:{kind:'edge',shape:0,idx:2}},
    {id:'v3',kind:'con',type:'v',a:{kind:'edge',shape:0,idx:3}},
    {id:'h4',kind:'con',type:'h',a:{kind:'edge',shape:0,idx:4}},
    {id:'v5',kind:'con',type:'v',a:{kind:'edge',shape:0,idx:5}},
    {id:'L',kind:'dim',type:'hdist',a:P(0),b:P(1),value:50},
    {id:'H',kind:'dim',type:'vdist',a:P(0),b:P(5),value:40},
    {id:'t1',kind:'dim',type:'vdist',a:P(1),b:P(2),value:t,param:'t',paramId:'pt'},
    {id:'t2',kind:'dim',type:'hdist',a:P(5),b:P(4),value:t,param:'t',paramId:'pt'},
  ]
  useApp.setState({...useApp.getInitialState(),appConfirm:async()=>true},true)
  useApp.setState({params:[{id:'pt',name:'t',value:t,unit:'mm'}]})
  g().startSketch(); g().chooseSketchPlane('XZ')
  useApp.setState({sketchShape:null,sketchProfiles:[{type:'poly',pts}],skCons:cons,extrudeHeight:30,sketchOp:'new'})
  await g().extrudeSketch(); assert.equal(g().mode,'model',g().status)
}
export async function holes(){
  // top face of the horizontal leg: CAD y = 8, normal +Y; pick at CAD (30,8,15) → three (30,15,-8)
  const t=g().params.find(p=>p.name==='t').value
  await g().startSketchOnFace([30,t,15],[0,0,1]); assert.equal(g().mode,'sketch',g().status)
  return g()
}
const wait=(ms)=>new Promise((r)=>setTimeout(r,ms))
export async function buildBracket(t=8){
  await seedL(t)
  await holes()
  useApp.setState({sketchShape:null,sketchProfiles:[{type:'circle',c:[20,15],r:3},{type:'circle',c:[40,15],r:3}],skCons:[],sketchOp:'cut',extrudeExtent:'through',faceCutThrough:true,extrudeHeight:8})
  await g().extrudeSketch(); assert.equal(g().mode,'model',g().status)
  g().toggleEdgeRoundPick('fillet'); g().roundEdgeAt([8,8,15]); await wait(800)
  g().setEdgeRoundSize(5)
  for(let i=0;i<60&&(g().roundPreviewBusy||(!g().roundPreviewMesh&&!g().roundPreviewFail));i++)await wait(250)
  await g().commitEdgeRound()
  assert.ok(g().features.some(f=>f.type==='fillet'),g().status)
  await g().addMirror()
  assert.ok(g().features.some(f=>f.type==='mirror'),g().status)
}
const holeSrc=()=>Object.values(g().sketchSources).find(x=>x.faceBinding)
test('t 8 → 10: hole sketch follows the moved leg top face; geometry equals a fresh t=10 build; undo / save-reopen stable',async()=>{
  await buildBracket(10); const v10=vol(), box10=bbox()
  await buildBracket(8); const v8=vol()
  assert.deepEqual(g().failedFeatureIds,[])
  assert.equal(holeSrc().baseZ,8)
  await g().setParam('t',10)
  assert.deepEqual(g().failedFeatureIds,[],JSON.stringify(g().featureErrors))
  assert.equal(g().params.find(p=>p.name==='t').value,10,g().status)
  assert.equal(g().paramFailure,null)
  assert.doesNotMatch(g().status,/失效|歧義|歧义|未能套用/)
  assert.equal(holeSrc().baseZ,10,'sketch plane moved with the face')
  const hole=g().features.find(f=>f.sketchFaceBinding)
  assert.ok(Math.abs(hole.sketchFaceBinding.offset-10)<1e-9 && hole.sketchFaceBinding.sourceId===g().features[0].id)
  assert.ok(Math.abs(vol()-v10)<1e-6*v10,`volume ${vol()} vs fresh t=10 ${v10}`)
  assert.deepEqual(bbox(),box10)
  // through holes really go through the 10 mm leg: volume = 2·(L-area·30 − 2·π·3²·10 + fillet)
  const exact=2*((50*10+10*30)*30-2*Math.PI*9*10+(1-Math.PI/4)*25*30)
  assert.ok(Math.abs(vol()-exact)<2e-3*exact,`${vol()} vs ${exact}`)
  await g().undo(); assert.equal(g().params.find(p=>p.name==='t').value,8); assert.ok(Math.abs(vol()-v8)<1e-6*v8)
  await g().redo(); assert.ok(Math.abs(vol()-v10)<1e-6*v10)
  const data=JSON.parse(JSON.stringify(buildProjectPayload(g())))
  await g().reset(); await g().applyProjectData(data)
  assert.deepEqual(g().failedFeatureIds,[]); assert.ok(Math.abs(vol()-v10)<1e-6*v10)
  await g().setParam('t',8)
  assert.deepEqual(g().failedFeatureIds,[],JSON.stringify(g().featureErrors))
  assert.equal(holeSrc().baseZ,8); assert.ok(Math.abs(vol()-v8)<1e-6*v8,`back to 8: ${vol()} vs ${v8}`)
})
test('a parameter change that cannot rebuild keeps the model, but reports the typed value explicitly (no silent revert)',async()=>{
  await buildBracket(8); const v8=vol()
  await g().setParam('t',0)   // zero-thickness legs: the profile cannot be built
  assert.equal(g().params.find(p=>p.name==='t').value,8,'model/parameters stay consistent')
  assert.ok(Math.abs(vol()-v8)<1e-6*v8)
  const pf=g().paramFailure
  assert.ok(pf,'failure recorded for the panel: '+g().status)
  assert.deepEqual(g().failedFeatureIds,[],'restored valid model: timeline not marked red')
  assert.equal(pf.name,'t'); assert.equal(pf.attempted,'0'); assert.equal(pf.kept,8)
  assert.match(g().status,/參數 t = 0 未能套用：.+模型及參數仍為 t = 8/)
  assert.doesNotMatch(g().status+pf.reason,/[们这设参数实体发现]|唔|咗|嘅/,'formal Traditional Chinese')
  await g().setParam('t',10)
  assert.equal(g().paramFailure,null); assert.equal(g().params.find(p=>p.name==='t').value,10)
})
