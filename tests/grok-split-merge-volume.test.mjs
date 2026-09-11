import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url)
globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url))
register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts')
const worker=globalThis.__wheelWorker
await worker.ready()
const {computeMassProps}=await import('../src/cad/massProps.ts')
const {combineMeasure}=await import('../src/cad/measureCombine.ts')

const near=(a,b,eps=1e-3)=>assert.ok(Math.abs(a-b)<eps,`expected ${b}, got ${a}`)

test('SO10: corner-origin 40×20×10 split X=15 yields 3000+5000; move hi +5 X then fuse restores 8000',async()=>{
  const box={id:'b',type:'prim',shape:'box',a:40,b:20,c:10,op:'new',cornerOrigin:true}
  let mesh=await worker.rebuild([box])
  near(computeMassProps(mesh.vertices,mesh.triangles).volume,8000)
  const base=await worker.measureBodyAt([20,10,5])
  assert.ok(base);near(base.volume,8000)
  assert.equal(combineMeasure([{kind:'body',volume:base.volume}]).valueUnit,'vol')

  const split={id:'s',type:'split',axis:'X',offset:15,keep:'hi',nameA:'分割A',nameB:'分割B'}
  mesh=await worker.rebuild([box,split])
  const active=computeMassProps(mesh.vertices,mesh.triangles).volume
  const parked=computeMassProps(mesh.parked[0].vertices,mesh.parked[0].triangles).volume
  near(active,5000)
  near(parked,3000)
  const hi=await worker.measureBodyAt([30,10,5])
  const lo=await worker.measureBodyAt([7,10,5])
  assert.ok(hi);assert.ok(lo)
  near(hi.volume,5000)
  near(lo.volume,3000)

  const move={id:'m',type:'transform',dx:5,dy:0,dz:0,rz:0}
  const fuse={id:'f',type:'bodyboolean',bop:'fuse',target:0}
  mesh=await worker.rebuild([box,split,move,fuse])
  near(computeMassProps(mesh.vertices,mesh.triangles).volume,8000)
  assert.equal(mesh.parked?.length??0,0)
  const merged=await worker.measureBodyAt([10,10,5])
  assert.ok(merged);near(merged.volume,8000)
})

test('SO10: centered box without cornerOrigin still splits to 7000+1000 at world X=15 (compat)',async()=>{
  const box={id:'b',type:'prim',shape:'box',a:40,b:20,c:10,op:'new'}
  const split={id:'s',type:'split',axis:'X',offset:15,keep:'lo',nameA:'A',nameB:'B'}
  const mesh=await worker.rebuild([box,split])
  near(computeMassProps(mesh.vertices,mesh.triangles).volume,7000)
  near(computeMassProps(mesh.parked[0].vertices,mesh.parked[0].triangles).volume,1000)
})

test('SO10: transform parked half +5 X then fuse restores 8000 with keep=lo',async()=>{
  const box={id:'b',type:'prim',shape:'box',a:40,b:20,c:10,op:'new',cornerOrigin:true}
  const split={id:'s',type:'split',axis:'X',offset:15,keep:'lo',nameA:'A',nameB:'B'}
  const move={id:'m',type:'transform',dx:5,dy:0,dz:0,rz:0,parked:0}
  const fuse={id:'f',type:'bodyboolean',bop:'fuse',target:0}
  const mesh=await worker.rebuild([box,split,move,fuse])
  near(computeMassProps(mesh.vertices,mesh.triangles).volume,8000)
  const merged=await worker.measureBodyAt([10,10,5])
  assert.ok(merged);near(merged.volume,8000)
})

// BUG-SO13-001 / SO10：keep=hi 时泊车为低侧（分割A）。QA「选一半移 +5」常移泊车半体；
// 若不翻成分离方向，+5X 叠入高侧 → fuse 7000。move 后 measureBodyAt 亦须跟新位姿。
test('SO10/BUG-SO13-001: keep=hi move parked lo +5 X then fuse restores 8000; measureBodyAt after move',async()=>{
  const box={id:'b',type:'prim',shape:'box',a:40,b:20,c:10,op:'new',cornerOrigin:true}
  const split={id:'s',type:'split',axis:'X',offset:15,keep:'hi',nameA:'分割A',nameB:'分割B'}
  const move={id:'m',type:'transform',dx:5,dy:0,dz:0,rz:0,parked:0}
  let mesh=await worker.rebuild([box,split,move])
  near(computeMassProps(mesh.vertices,mesh.triangles).volume,5000)
  near(computeMassProps(mesh.parked[0].vertices,mesh.parked[0].triangles).volume,3000)
  // After sep-flip, lo half sits at X∈[-5,10] — measure at old center 7 should miss; new center ~2.5
  const movedLo=await worker.measureBodyAt([2,10,5])
  const stillHi=await worker.measureBodyAt([30,10,5])
  assert.ok(movedLo);assert.ok(stillHi)
  near(movedLo.volume,3000)
  near(stillHi.volume,5000)
  const fuse={id:'f',type:'bodyboolean',bop:'fuse',target:0}
  mesh=await worker.rebuild([box,split,move,fuse])
  near(computeMassProps(mesh.vertices,mesh.triangles).volume,8000)
  assert.equal(mesh.parked?.length??0,0)
  const merged=await worker.measureBodyAt([10,10,5])
  assert.ok(merged);near(merged.volume,8000)
})

test('SO10/BUG-SO13-001: keep=lo move active lo +5 X then fuse restores 8000',async()=>{
  const box={id:'b',type:'prim',shape:'box',a:40,b:20,c:10,op:'new',cornerOrigin:true}
  const split={id:'s',type:'split',axis:'X',offset:15,keep:'lo',nameA:'A',nameB:'B'}
  const move={id:'m',type:'transform',dx:5,dy:0,dz:0,rz:0}
  const fuse={id:'f',type:'bodyboolean',bop:'fuse',target:0}
  const mesh=await worker.rebuild([box,split,move,fuse])
  near(computeMassProps(mesh.vertices,mesh.triangles).volume,8000)
  const merged=await worker.measureBodyAt([10,10,5])
  assert.ok(merged);near(merged.volume,8000)
})
