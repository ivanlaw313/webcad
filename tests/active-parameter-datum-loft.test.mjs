import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url)
globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url))
register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const {useApp,buildProjectPayload}=await import('../src/store.ts')
const g=()=>useApp.getState()
const payload=()=>JSON.parse(JSON.stringify(buildProjectPayload(g())))
async function nativeHeight(height){
 const {importSTEP,measureVolume,getOC}=await import('replicad')
 const shape=await importSTEP(new Blob([await globalThis.__wheelWorker.exportSTEP()]))
 const check=new(getOC().BRepCheck_Analyzer)(shape.wrapped,true,false)
 try{
  assert.ok(check.IsValid_2());assert.ok(Math.abs(measureVolume(shape)-Math.PI*9*height)<1e-5,`expected ${9*height}π volume, got ${measureVolume(shape)}`)
  const box=shape.boundingBox.bounds
  assert.ok(Math.abs(box[0][2])<1e-6);assert.ok(Math.abs(box[1][2]-height)<1e-6,`expected top ${height}, got ${box[1][2]}`)
 }finally{check.delete();shape.delete()}
}
async function seed(){
 useApp.setState({...useApp.getInitialState(),params:[{id:'top-z',name:'TopZ',value:10}],appConfirm:async()=>true},true)
 await g().addDatumFeature({base:'XY',offset:0},'bottom datum')
 await g().addDatumFeature({base:'XY',offset:10},'top datum')
 const top=g().features.filter(f=>f.type==='datum')[1]
 await g().bindParam(top.id,'offset','TopZ')
 for(const z of [0,10]){
  g().sketchOnDatumPlane('XY',z)
  assert.equal(g().mode,'sketch')
  useApp.setState({sketchShape:{type:'circle',c:[0,0],r:3},sketchProfiles:[],skCons:[]})
  g().addLoftSection()
 }
 assert.equal(g().loftSections.length,2)
 await g().commitLoft();assert.equal(g().mode,'model',g().status)
 const loft=g().features.find(f=>f.type==='loft');assert.ok(loft);assert.equal(loft.sketchIds.length,2)
 await nativeHeight(10)
 return loft.sketchIds
}
test('actual datum section collection and loft commit preserve both section plane dependencies',async()=>{
 const ids=await seed()
 for(let i=0;i<2;i++)assert.deepEqual(g().sketchSources[ids[i]].datumRef,{idx:i,base:'XY'},`section ${i} must retain its selected datum`)
})
for(const dependent of [false,true])test(`top datum parameter moves loft section while ${dependent?'dependent':'unrelated'} draft stays open, with native/history/JSON coherence`,async()=>{
 const ids=await seed()
 if(dependent)await g().editSketchOf(g().features.find(f=>f.type==='loft').id,ids[1])
 else{g().startSketch();g().chooseSketchPlane('XY');useApp.setState({sketchProfiles:[{type:'circle',c:[100,100],r:2}],sketchShape:null})}
 assert.equal(g().mode,'sketch');const before=payload(),base=g().sketchBaseZ
 await g().setParam('TopZ',20)
 assert.equal(g().params[0].value,20,g().status);assert.equal(g().mode,'sketch');assert.equal(g().sketchBaseZ,dependent?20:base)
 assert.equal(g().sketchSources[ids[0]].baseZ,0);assert.equal(g().sketchSources[ids[1]].baseZ,20,'top section source must move')
 const loft=g().features.find(f=>f.type==='loft');assert.deepEqual(loft.sections.map(s=>s.z),[0,20])
 await nativeHeight(20)
 await g().undo();assert.deepEqual(payload(),before);await nativeHeight(10)
 await g().redo();await nativeHeight(20)
 if(dependent){await g().applySketchEdit(ids[1]);assert.equal(g().mode,'model');await nativeHeight(20);await g().undo();await nativeHeight(10);await g().redo();await nativeHeight(20)}
 const saved=payload();await g().reset();await g().applyProjectData(saved)
 assert.equal(g().sketchSources[ids[1]].baseZ,20);await nativeHeight(20)
})

test('collapsing two datum loft sections rejects all parameter/source/history changes and preserves native model',async()=>{
 await seed();g().startSketch();g().chooseSketchPlane('XY')
 useApp.setState({sketchProfiles:[{type:'circle',c:[100,100],r:2}],sketchShape:null})
 const before=payload(),history=[g().sketchUndo,g().sketchRedo,g().undoStack,g().redoStack]
 await g().setParam('TopZ',0)
 assert.deepEqual(payload(),before);assert.deepEqual([g().sketchUndo,g().sketchRedo,g().undoStack,g().redoStack],history);assert.equal(g().busy,false)
 await nativeHeight(10)
})
