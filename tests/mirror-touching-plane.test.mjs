// v2.20 P4: a body that only TOUCHES the mirror plane (L bracket standing on YZ, with fillet + holes) must not
// warn 「實體橫跨鏡像面…孔會被填埋」; a body that really crosses the plane still warns.
import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');await globalThis.__wheelWorker.ready()
const w=globalThis.__wheelWorker
const {useApp}=await import('../src/store.ts')
const g=()=>useApp.getState()
const vol=()=>{const m=g().bodyMesh;let v=0;const V=m.vertices,T=m.triangles;for(let i=0;i<T.length;i+=3){const a=T[i]*3,b=T[i+1]*3,c=T[i+2]*3;v+=(V[a]*(V[b+1]*V[c+2]-V[b+2]*V[c+1])-V[a+1]*(V[b]*V[c+2]-V[b+2]*V[c])+V[a+2]*(V[b]*V[c+1]-V[b+1]*V[c]))/6}return Math.abs(v)}
const bbox=()=>{const V=g().bodyMesh.vertices,lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9];for(let i=0;i<V.length;i+=3)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],V[i+k]);hi[k]=Math.max(hi[k],V[i+k])}return {lo,hi}}
async function seedL(t=8){
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
async function holes(){
  // top face of the horizontal leg: CAD y = 8, normal +Y; pick at CAD (30,8,15) → three (30,15,-8)
  const t=g().params.find(p=>p.name==='t').value
  await g().startSketchOnFace([30,t,15],[0,0,1]); assert.equal(g().mode,'sketch',g().status)
  return g()
}
const wait=(ms)=>new Promise((r)=>setTimeout(r,ms))
async function buildBracket(t=8){
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

const L={kind:'poly',pts:[[0,0],[50,0],[50,8],[8,8],[8,40],[0,40]]}
const warns=(m)=>(m.warnings??[]).filter(x=>/横跨|橫跨/.test(x))
test('touching: L on YZ + holes + inner fillet → no straddle warning, holes survive',async()=>{
  const m=await w.rebuild([{id:'e',type:'extrude',profile:L,height:30,operation:'new'},
    {id:'h',type:'extrude',profile:{kind:'circle',c:[30,4],r:3},height:30,operation:'cut'},
    {id:'fl',type:'fillet',radius:5,edges:'all'},
    {id:'m',type:'mirror',plane:'YZ',offset:0}])
  assert.ok(m&&m.triangles.length)
  assert.deepEqual(warns(m),[])
})
test('touching exactly at the plane with a curved (filleted) body: still no warning',async()=>{
  const m=await w.rebuild([{id:'e',type:'extrude',profile:{kind:'circle',c:[10,0],r:10},height:20,operation:'new'},{id:'m',type:'mirror',plane:'YZ',offset:0}])
  assert.deepEqual(warns(m),[])
})
test('crossing: a plate centred on YZ still warns',async()=>{
  const m=await w.rebuild([{id:'e',type:'extrude',profile:{kind:'rect',a:[-10,-10],b:[30,10]},height:5,operation:'new'},{id:'m',type:'mirror',plane:'YZ',offset:0}])
  assert.equal(warns(m).length,1)
})
test('tester repro (store): L bracket + face-sketch holes + inner-corner R5 fillet + mirror on YZ → no straddle warning',async()=>{
  await buildBracket(8)
  assert.deepEqual(g().lastBuildWarnings.filter(x=>/横跨|橫跨/.test(x)),[],g().status)
  assert.doesNotMatch(g().status,/横跨|橫跨/)
  const v=vol(), exact=2*((50*8+8*32)*30-2*Math.PI*9*8+(1-Math.PI/4)*25*30)
  assert.ok(Math.abs(v-exact)<2e-3*exact,'holes intact (volume) '+v+' vs '+exact)
})
