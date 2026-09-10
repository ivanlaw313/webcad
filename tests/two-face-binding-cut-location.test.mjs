import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready()
const {useApp}=await import('../src/store.ts'),{importSTEP,measureVolume,getOC,drawCircle}=await import('replicad')
const g=()=>useApp.getState()
const base={id:'base',type:'extgroup',height:5,subs:[0,20].map(x=>({profile:{kind:'circle',c:[x,0],r:5},operation:'new',baseZ:0}))}
async function volume(expected){const shape=await importSTEP(new Blob([await w.exportSTEP()])),check=new(getOC().BRepCheck_Analyzer)(shape.wrapped,true,false);try{assert.ok(check.IsValid_2());assert.ok(Math.abs(measureVolume(shape)-expected)<1e-5)}finally{check.delete()}}
async function setup(){useApp.setState({...useApp.getInitialState()},true);assert.equal(await g().applyFeatures([structuredClone(base)],'base'),true);const binding=await w.captureSketchFaceBinding('base',[0,0,5],[0,0,1]);assert.ok(binding);return binding}
const pocket=binding=>({id:'pocket',type:'extrude',profile:{kind:'circle',c:[0,0],r:2},height:2,operation:'cut',baseZ:5,inward:true,inwardDepth:2,faceOutSign:1,sketchFaceBinding:binding})

async function assertOriginalPocketVoid(){
 const shape=await importSTEP(new Blob([await w.exportSTEP()])),probe=drawCircle(1).sketchOnPlane('XY',3.5).extrude(1)
 const overlap=shape.intersect(probe)
 assert.ok(Math.abs(measureVolume(overlap))<1e-8,'original pocket position must remain empty in the actual exported solid')
 assert.deepEqual(g().features.at(-1).profile.c,[0,0]);assert.deepEqual(g().features.at(-1).sketchFaceBinding.near,[0,0,5])
}
test('two repeated faces: resizing picked face cannot move its cut onto unchanged other face',async()=>{
 const binding=await setup();assert.equal(await g().applyFeatures([base,pocket(binding)],'pocket'),true);await volume(242*Math.PI);await assertOriginalPocketVoid()
 const changed={...base,subs:base.subs.map((sub,i)=>i===0?{...sub,profile:{...sub.profile,r:6}}:sub)}
 assert.equal(await g().applyFeatures([changed,g().features.at(-1)],'source radius'),true,g().status);await volume(297*Math.PI);await assertOriginalPocketVoid()
 await g().undo();await volume(242*Math.PI);await assertOriginalPocketVoid();await g().redo();await volume(297*Math.PI);await assertOriginalPocketVoid()
})
