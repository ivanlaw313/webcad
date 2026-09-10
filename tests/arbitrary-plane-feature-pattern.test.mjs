import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
globalThis.require=createRequire(import.meta.url)
globalThis.__dirname=path.dirname(fileURLToPath(import.meta.url))
register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts')
const worker=globalThis.__wheelWorker;await worker.ready()
const {importSTEP,measureVolume}=await import('replicad')
const plane=z=>({o:[0,0,z],xd:[1,0,0],n:[0,0,1]})
const base={id:'base',type:'extrude',profile:{kind:'rect',a:[-30,-20],b:[30,20]},height:10,operation:'new',arbPlane:plane(0)}
const cut=(id,r)=>({id,type:'extrude',profile:{kind:'circle',c:[-10,0],r},height:2,operation:'cut',arbPlane:plane(10),exactDistance:true})
async function volume(features){const mesh=await worker.rebuild(features);assert.deepEqual(mesh.failed??[],[]);assert.ok(!(mesh.warnings??[]).some(s=>/目标特征唔存在|副本失败/.test(s)),JSON.stringify(mesh.warnings));return measureVolume(await importSTEP(new Blob([await worker.exportSTEP()]))) }
test('arbitrary-plane cut mirrors the full cutter even where the seed overlaps a previous pocket',async()=>{
 const v=await volume([base,cut('prior',1),cut('seed',3),{id:'mirror',type:'mirror',plane:'YZ',targets:['seed']}]);assert.ok(Math.abs(v-(24000-36*Math.PI))<.001,`${v}`)
})
test('arbitrary-plane circular pattern captures its source and repeats the complete cut',async()=>{
 const v=await volume([base,cut('prior',1),cut('seed',3),{id:'pattern',type:'circPattern',origin:[0,0,0],dir:[0,0,1],count:4,totalAngle:360,mode:'full',targets:['seed']}]);assert.ok(Math.abs(v-(24000-72*Math.PI))<.001,`${v}`)
})
test('feature mirror carries material removed by a fillet',async()=>{
 const fillet={id:'round',type:'fillet',radius:2,nears:[[-30,0,10]],chain:false};const single=await volume([base,fillet]);const both=await volume([base,fillet,{id:'mirror',type:'mirror',plane:'YZ',targets:['round']}]);assert.ok(24000-single>1);assert.ok(Math.abs((24000-both)-2*(24000-single))<.001)
})
test('a blind ring-shaped pocket preserves the island and uses its exact 0.4 mm depth',async()=>{
 const profile={kind:'rect',a:[-10,-10],b:[10,10],holes:[{kind:'rect',a:[-5,-5],b:[5,5]}]};const v=await volume([base,{id:'seam',type:'extrude',profile,height:.4,operation:'cut',arbPlane:plane(10),exactDistance:true}]);assert.ok(Math.abs(v-23880)<.001,`${v}`)
})

test('circular feature pattern carries the material removed by a fillet',async()=>{
 const fillet={id:'round',type:'fillet',radius:2,nears:[[-30,0,10]],chain:false};const single=await volume([base,fillet]);const both=await volume([base,fillet,{id:'pattern',type:'circPattern',origin:[0,0,0],dir:[0,0,1],count:2,totalAngle:360,mode:'full',targets:['round']}]);assert.ok(Math.abs((24000-both)-2*(24000-single))<.001)
})
test('rotation uses the selected pivot and retains the legacy center default',async()=>{
 const offset={...base,profile:{kind:'rect',a:[10,0],b:[20,10]}};
 await volume([offset,{id:'rotate',type:'transform',origin:[0,0,0],dx:0,dy:0,dz:0,rz:90}]);const explicit=(await importSTEP(new Blob([await worker.exportSTEP()]))).boundingBox.bounds;
 assert.ok(Math.abs(explicit[0][0]+10)<.001);assert.ok(Math.abs(explicit[0][1]-10)<.001);
 await volume([offset,{id:'rotate',type:'transform',dx:0,dy:0,dz:0,rz:90}]);const legacy=(await importSTEP(new Blob([await worker.exportSTEP()]))).boundingBox.bounds;
 assert.ok(Math.abs(legacy[0][0]-10)<.001);assert.ok(Math.abs(legacy[0][1])<.001)
})
