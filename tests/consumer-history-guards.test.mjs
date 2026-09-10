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
async function seed(){
 useApp.setState({...useApp.getInitialState(),params:[{id:'shared',name:'Shared',value:5}],appConfirm:async()=>true},true)
 for(const x of [0,40]){
  g().startSketch()
  useApp.setState({sketchProfiles:[{type:'circle',c:[x,0],r:5}],sketchShape:null,skCons:[{id:'r'+x,kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:5,paramId:'shared',param:'Shared'}],extrudeHeight:5,sketchOp:'new'})
  await g().extrudeSketch()
 }
 const feature=g().features.find(f=>f.sketchId)
 await g().editSketchOf(feature.id)
 await g().setParam('Shared',7)
 assert.equal(g().sketchProfiles[0].r,7,g().status)
 return feature.sketchId
}
async function assertVolume(r){
 const {importSTEP,measureVolume}=await import('replicad')
 const shape=await importSTEP(new Blob([await globalThis.__wheelWorker.exportSTEP()]))
 try{assert.ok(Math.abs(measureVolume(shape)-2*Math.PI*r*r*5)<1e-5)}finally{shape.delete()}
}
async function pauseFirstRebuild(action){
 const worker=globalThis.__wheelWorker,original=worker.rebuild
 let release,started
 const entered=new Promise(resolve=>started=resolve),wait=new Promise(resolve=>release=resolve)
 let first=true
 worker.rebuild=async(...args)=>{if(first){first=false;started();await wait}return original(...args)}
 try{const pending=action();await entered;return {pending,release,restore:()=>{worker.rebuild=original}}}catch(error){worker.rebuild=original;throw error}
}
test('Finish preserves parameter baseline when document history is at its 60-entry limit',async()=>{
 const id=await seed()
 const entry=g().undoStack[0]
 useApp.setState({undoStack:Array.from({length:60},()=>entry)})
 await g().applySketchEdit(id)
 assert.equal(g().undoStack.length,60)
 await g().undo();assert.equal(g().params[0].value,5);await assertVolume(5)
 await g().redo();assert.equal(g().params[0].value,7);await assertVolume(7)
})
test('Escape during consumer Undo retains current draft, parameters, histories and kernel',async()=>{
 await seed();const before=payload(),undo=g().sketchUndo,redo=g().sketchRedo
 const paused=await pauseFirstRebuild(()=>g().undo())
 try{g().escSketch();paused.release();await paused.pending}finally{paused.restore()}
 assert.deepEqual(payload(),before);assert.equal(g().sketchUndo,undo);assert.equal(g().sketchRedo,redo);assert.equal(g().busy,false);await assertVolume(7)
})
test('new document during consumer Undo cannot resurrect the old document or export body',async()=>{
 await seed()
 const paused=await pauseFirstRebuild(()=>g().undo())
 try{
  useApp.setState({...useApp.getInitialState(),projectName:'Replacement'},true)
  const replacement=payload()
  paused.release();await paused.pending
  assert.deepEqual(payload(),replacement);assert.equal(g().features.length,0);assert.equal(g().sketchUndo.length,0);assert.equal(g().busy,false)
  assert.equal(await globalThis.__wheelWorker.exportSTEP(),null)
 }finally{paused.restore()}
})
