import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const worker=globalThis.__wheelWorker;await worker.ready()
const {combineMeasure}=await import('../src/cad/measureCombine.ts')
test('picked native solid reports volume instead of face area',async()=>{
 await worker.rebuild([{id:'cube',type:'extrude',profile:{kind:'rect',a:[0,0],b:[20,20]},height:20,operation:'new'}])
 const r=await worker.measureBodyAt([20,10,10]);assert.ok(r);assert.ok(Math.abs(r.volume-8000)<1e-6)
 assert.deepEqual(combineMeasure([{kind:'body',volume:r.volume}]).valueUnit,'vol')
 assert.ok(Math.abs((await worker.measureFaceAt([20,10,10])).area-400)<1e-6)
})
