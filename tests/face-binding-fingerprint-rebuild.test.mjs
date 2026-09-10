import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready()
const {useApp}=await import('../src/store.ts'),{importSTEP,measureVolume,getOC}=await import('replicad')
const g=()=>useApp.getState()
const base={id:'base',type:'extgroup',height:5,subs:[0,20,40].map(x=>({profile:{kind:'circle',c:[x,0],r:5},operation:'new',baseZ:0}))}
async function volume(expected){const shape=await importSTEP(new Blob([await w.exportSTEP()])),check=new(getOC().BRepCheck_Analyzer)(shape.wrapped,true,false);try{assert.ok(check.IsValid_2());assert.ok(Math.abs(measureVolume(shape)-expected)<1e-5)}finally{check.delete()}}
async function setup(){useApp.setState({...useApp.getInitialState()},true);assert.equal(await g().applyFeatures([structuredClone(base)],'base'),true);const binding=await w.captureSketchFaceBinding('base',[0,0,5],[0,0,1]);assert.ok(binding);return binding}
const pocket=binding=>({id:'pocket',type:'extrude',profile:{kind:'circle',c:[0,0],r:2},height:2,operation:'cut',baseZ:5,inward:true,inwardDepth:2,faceOutSign:1,sketchFaceBinding:binding})
test('stale tessellation fingerprint resolves equal faces by unique exact original anchor',async()=>{
 const binding=await setup();binding.faceFp=['stale-display-triangulation'];assert.equal(await g().applyFeatures([base,pocket(binding)],'pocket'),true,g().status);await volume(367*Math.PI)
 assert.ok(!g().lastBuildWarnings.some(s=>/近点|近點/.test(s)))
 const before=structuredClone(g().features);await g().undo();await volume(375*Math.PI);await g().redo();await volume(367*Math.PI);assert.deepEqual(g().features,before)
})
for(const near of [[10,0,5],[0,0,6]])test(`stale fingerprint with anchor outside exact support ${near} rejects atomically`,async()=>{
 const binding=await setup();binding.faceFp=['stale-display-triangulation'];binding.near=near
 const before=g();assert.equal(await g().applyFeatures([base,pocket(binding)],'invalid'),false);assert.deepEqual(g().features,before.features);assert.deepEqual(g().undoStack,before.undoStack);assert.deepEqual(g().sketchSources,before.sketchSources);await volume(375*Math.PI)
})

test('changed picked radius remains bound when two other faces match its old descriptor',async()=>{
 const binding=await setup();assert.equal(await g().applyFeatures([base,pocket(binding)],'pocket'),true);await volume(367*Math.PI)
 const changed={...base,subs:base.subs.map((sub,i)=>i===0?{...sub,profile:{...sub.profile,r:6}}:sub)}
 assert.equal(await g().applyFeatures([changed,g().features.at(-1)],'source radius'),true,g().status);await volume(422*Math.PI)
 await g().undo();await volume(367*Math.PI);await g().redo();await volume(422*Math.PI)
})
