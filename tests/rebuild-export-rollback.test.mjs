import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const worker=globalThis.__wheelWorker;await worker.ready()
const {useApp}=await import('../src/store.ts'),{importSTEP,measureVolume,getOC}=await import('replicad')
async function stepVolume(){const shape=await importSTEP(new Blob([await worker.exportSTEP()])),check=new (getOC().BRepCheck_Analyzer)(shape.wrapped,true,false);try{assert.ok(check.IsValid_2())}finally{check.delete()}return measureVolume(shape)}
test('a failed whole-kernel legacy revolve rebuild restores STEP together with the retained document',async()=>{
 useApp.setState({...useApp.getInitialState()},true)
 // Legacy explicit features intentionally have no face binding. Thickening the
 // base consumes the half-torus and currently triggers a whole-kernel failure.
 const base={id:'base',type:'extrude',profile:{kind:'rect',a:[-10,-10],b:[10,10]},height:10,operation:'new'}
 const revolve={id:'ring',type:'revolve',profile:{kind:'circle',c:[4,0],r:1},angle:360,axis:'Y',plane:'XY',baseZ:10}
 assert.equal(await useApp.getState().applyFeatures([base,revolve],'last good'),true)
 const before=useApp.getState(),lastGood=await stepVolume();assert.ok(Math.abs(lastGood-(4000+4*Math.PI*Math.PI))<.001)
 const ok=await before.applyFeatures([{...base,height:15},revolve],'invalid overlap')
 assert.equal(ok,false,'fixture must exercise the whole-kernel failure path')
 assert.deepEqual(useApp.getState().features,before.features);assert.deepEqual(useApp.getState().sketchSources,before.sketchSources);assert.deepEqual(useApp.getState().undoStack,before.undoStack);assert.equal(useApp.getState().bodyMesh,before.bodyMesh)
 const exported=await stepVolume();assert.ok(Math.abs(exported-lastGood)<.001,`retained viewport volume ${lastGood}, but STEP volume ${exported}`)
})
