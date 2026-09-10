import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready()
const {importSTEP,measureVolume,getOC}=await import('replicad')
const base={id:'box',type:'extrude',profile:{kind:'rect',a:[0,0],b:[20,20]},height:20,operation:'new'}
const feature=(radius)=>({id:'round',type:'facefillet',radius,near1:[10,0,10],near2:[10,10,20]})
const solid=async()=>importSTEP(new Blob([await w.exportSTEP()]))
test('face fillet preserves requested radius and valid solid',async()=>{
 const m=await w.rebuild([base,feature(4)]); assert.deepEqual(m.failed??[],[])
 const out=await solid(); assert.ok(Math.abs(measureVolume(out)-(8000-(16-4*Math.PI)*20))<1e-5)
 const check=new (getOC().BRepCheck_Analyzer)(out.wrapped,true,false);assert.equal(check.IsValid_2(),true);check.delete()
})
test('oversized face radius fails without thinning and a corrected radius recovers',async()=>{
 const m=await w.rebuild([base,feature(30)]);assert.ok(m.failed?.some(f=>f.id==='round'))
 assert.ok(Math.abs(measureVolume(await solid())-8000)<1e-5)
 const recovered=await w.rebuild([base,feature(2)]);assert.deepEqual(recovered.failed??[],[])
 assert.ok(Math.abs(measureVolume(await solid())-(8000-(4-Math.PI)*20))<1e-5)
})
test('invalid radius cannot become the implicit minimum radius',async()=>{
 for(const radius of [0,-1,NaN]) { const m=await w.rebuild([base,feature(radius)]);assert.ok(m.failed?.some(f=>f.id==='round'));assert.ok(Math.abs(measureVolume(await solid())-8000)<1e-5) }
})
test('face fillet preview rejects oversized radius and leaves committed source intact',async()=>{
 await w.rebuild([base]);const good=await w.previewRound([base,feature(4)]);assert.deepEqual(good.failed??[],[])
 assert.ok(Math.abs(measureVolume(await solid())-8000)<1e-5)
 const bad=await w.previewRound([base,feature(30)]);assert.ok(bad.failed?.some(f=>f.id==='round'))
 assert.ok(Math.abs(measureVolume(await solid())-8000)<1e-5)
 const recovered=await w.previewRound([base,feature(4)]);assert.deepEqual(recovered.failed??[],[]);assert.deepEqual(recovered.vertices,good.vertices)
})
