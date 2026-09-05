import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {wheelRig} from '../examples/wheel-rig.mjs'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=path.dirname(fileURLToPath(import.meta.url))
register('./wheel-worker-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts')
const worker=globalThis.__wheelWorker
await worker.ready()
const bounds=m=>[0,1,2].map(axis=>{const v=m.vertices.filter((_,i)=>i%3===axis);return [Math.min(...v),Math.max(...v)]})
test('actual CAD worker builds native wheel rig, concentric rim, mirrored pair, spokes and arch Cuts',async()=>{
 for(const dims of [{Wheelbase:120,WheelDiameter:50,CarWidth:90},{Wheelbase:140,WheelDiameter:60,CarWidth:100}]){
 const d=wheelRig(dims);const mesh=await worker.rebuild(d.features)
 assert.ok(mesh?.triangles.length>0);assert.equal(mesh.failed?.length??0,0,JSON.stringify(mesh.failed));assert.equal(mesh.warnings?.length??0,0,JSON.stringify(mesh.warnings))
 const b=bounds(mesh);assert.ok(Math.abs(b[0][0]+dims.WheelDiameter/2)<.2);assert.ok(Math.abs(b[0][1]-dims.Wheelbase-dims.WheelDiameter/2)<.2);assert.ok(Math.abs(b[2][0]+dims.CarWidth/2)<.2);assert.ok(Math.abs(b[2][1]-dims.CarWidth/2)<.2)
 console.log('PASS actual worker',dims,'bounds',b,'triangles',mesh.triangles.length/3)
 }
})

test('native STEP roundtrip preserves exact extent and analytic edges',async()=>{
 const {importSTEP,measureVolume}=await import('replicad')
 const d=wheelRig();await worker.rebuild(d.features.slice(0,8))
 const pre=await importSTEP(new Blob([await worker.exportSTEP()]))
 await worker.rebuild(d.features);const post=await importSTEP(new Blob([await worker.exportSTEP()]))
 assert.ok(post.boundingBox.bounds[1][0]>144.99)
 const edges=await worker.extractEdgePolylines();assert.ok(edges.length>40)
 // Volumes use the same OCCT instance as the actual worker.
 assert.ok(measureVolume(post)<measureVolume(pre)-1000,'wheel arch cuts remove actual B-rep material'); const middle=await worker.rebuild(d.features.slice(0,9)); const oneArch=await importSTEP(new Blob([await worker.exportSTEP()])); assert.ok(measureVolume(post)<measureVolume(oneArch)-1000,'second station Cut also removes material'); await worker.rebuild(d.features)
 console.log('PASS native STEP bbox',post.boundingBox.bounds,'B-rep edges',edges.length)
})
