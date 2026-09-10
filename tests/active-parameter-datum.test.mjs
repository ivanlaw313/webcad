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
const stepGeometry=buffer=>new TextDecoder().decode(buffer).split('DATA;')[1].replace(/Open CASCADE STEP translator 7\.6 \d+/g,'Open CASCADE STEP translator 7.6')
const payload=()=>JSON.parse(JSON.stringify(buildProjectPayload(g())))
async function seed({dependent=false,seedBinding=true}={}){
 useApp.setState({...useApp.getInitialState(),params:[{id:'plane-z',name:'PlaneZ',value:10}],appConfirm:async()=>true},true)
 await g().addDatumFeature({base:'XY',offset:10},'datum fixture')
 const datum=g().features.find(f=>f.type==='datum');assert.ok(datum)
 await g().bindParam(datum.id,'offset','PlaneZ')
 g().sketchOnDatumPlane('XY',10)
 useApp.setState({sketchProfiles:[{type:'circle',c:[0,0],r:3}],sketchShape:null,extrudeHeight:5,sketchOp:'new'})
 await g().extrudeSketch();assert.equal(g().mode,'model',g().status)
 const feature=g().features.find(f=>f.type==='extrude'||f.type==='extgroup');assert.ok(feature)
 // Separate the old datum-pick linkage bug from the deferred rebuild regression.
 // The first test below uses no injected metadata; the remaining tests exercise
 // valid persisted datum ownership directly, as a project reload would supply it.
 if(seedBinding){const sources=structuredClone(g().sketchSources);sources[feature.sketchId].datumRef={idx:0,base:'XY'};useApp.setState({sketchSources:sources})}
 await nativeAt(10)
 if(dependent)await g().editSketchOf(feature.id)
 else{g().startSketch();g().chooseSketchPlane('XY');useApp.setState({sketchProfiles:[{type:'circle',c:[100,100],r:2}],sketchShape:null})}
 assert.equal(g().mode,'sketch','fixture must enter a real sketch')
 return {id:feature.sketchId,datum:datum.id}
}
async function nativeAt(z){
 const {importSTEP,measureVolume,getOC}=await import('replicad')
 const shape=await importSTEP(new Blob([await globalThis.__wheelWorker.exportSTEP()]))
 const analyzer=new(getOC().BRepCheck_Analyzer)(shape.wrapped,true,false)
 try{
  assert.ok(analyzer.IsValid_2());assert.ok(Math.abs(measureVolume(shape)-Math.PI*9*5)<1e-6)
  const b=shape.boundingBox.bounds
  assert.ok(Math.abs(b[0][2]-z)<1e-6,`expected bottom Z${z}, got ${b[0][2]}`)
  assert.ok(Math.abs(b[1][2]-(z+5))<1e-6,`expected top Z${z+5}, got ${b[1][2]}`)
 }finally{analyzer.delete();shape.delete()}
}
test('ordinary datum sketch entry records the actual construction-plane dependency',async()=>{
 const {id}=await seed({seedBinding:false})
 assert.deepEqual(g().sketchSources[id].datumRef,{idx:0,base:'XY'})
})
for(const dependent of [false,true])test(`datum offset parameter propagates while ${dependent?'dependent':'unrelated'} draft remains open`,async()=>{
 const {id}=await seed({dependent}),before=payload(),oldBase=g().sketchBaseZ
 await g().setParam('PlaneZ',20)
 assert.equal(g().mode,'sketch');assert.equal(g().params[0].value,20,g().status)
 assert.equal(g().planes[0].offset,20);assert.equal(g().sketchSources[id].baseZ,20,'saved source follows datum')
 assert.equal(g().sketchBaseZ,dependent?20:oldBase,'only dependent live draft changes its frame')
 await nativeAt(20)
 await g().undo();assert.deepEqual(payload(),before);await nativeAt(10)
 await g().redo();assert.equal(g().sketchSources[id].baseZ,20);assert.equal(g().sketchBaseZ,dependent?20:oldBase);await nativeAt(20)
 if(dependent){await g().applySketchEdit(id);assert.equal(g().mode,'model');await nativeAt(20);await g().undo();await nativeAt(10);await g().redo();await nativeAt(20)}
 const saved=payload();await g().reset();await g().applyProjectData(saved)
 assert.equal(g().sketchSources[id].baseZ,20);await nativeAt(20)
})
for(const model of [false,true])test(`unresolvable datum ownership rejects ${model?'model':'active sketch'} parameter edit without partial geometry or history`,async()=>{
 const {id}=await seed()
 if(model)useApp.setState({mode:'model',sketchProfiles:[],sketchShape:null,skCons:[]})
 const sources=structuredClone(g().sketchSources);sources[id].datumRef.idx=99;useApp.setState({sketchSources:sources})
 const before=payload(),histories=[g().sketchUndo,g().sketchRedo,g().undoStack,g().redoStack],step=await globalThis.__wheelWorker.exportSTEP()
 await g().setParam('PlaneZ',20)
 assert.deepEqual(payload(),before);assert.deepEqual([g().sketchUndo,g().sketchRedo,g().undoStack,g().redoStack],histories)
 assert.equal(stepGeometry(await globalThis.__wheelWorker.exportSTEP()),stepGeometry(step),'STEP geometry must remain identical (export timestamps excluded)');assert.equal(g().busy,false)
})
