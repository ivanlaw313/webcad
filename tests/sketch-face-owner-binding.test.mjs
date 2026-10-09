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
const stepGeometry=buffer=>new TextDecoder().decode(buffer).split('DATA;')[1].replace(/Open CASCADE STEP translator 7\.6 \d+/g,'Open CASCADE STEP translator 7.6').replace(/NEXT_ASSEMBLY_USAGE_OCCURRENCE\('\d+'/g,"NEXT_ASSEMBLY_USAGE_OCCURRENCE('export-id'")

// Fusion behaviour: a sketch on extrude A's face, created after B (another profile of the same
// sketch) exists, belongs to A — not to the last solid feature B. Deleting B must not cascade to it.
const step=async()=>stepGeometry(await globalThis.__wheelWorker.exportSTEP())
const extrudeRegion=async(sk,i,h)=>{
  g().setSelSketch(sk); await g().runCommand('extrude','拉伸')
  useApp.setState({extrudeHeight:h,extrudeRegionSel:g().extrudeRegionFaces.map((_,j)=>j===i),sketchOp:'join'})
  await g().extrudeSketch(); assert.equal(g().mode,'model',g().status)
}
const sameFeatures=(want)=>{
  const a=g().features,e=JSON.parse(want)
  assert.equal(a.length,e.length)
  e.forEach((f,i)=>{for(const k of new Set([...Object.keys(f),...Object.keys(a[i])]))assert.equal(JSON.stringify(a[i][k]),JSON.stringify(f[k]),`${f.id}.${k}`)})
}
const confirms=[]
async function seed(){
  confirms.length=0
  useApp.setState({...useApp.getInitialState(),appConfirm:async(m)=>{confirms.push(m);return true}},true)
  g().startSketch(); g().chooseSketchPlane('XY')
  useApp.setState({sketchShape:null,sketchProfiles:[{type:'rect',a:[-30,-20],b:[0,20]},{type:'rect',a:[10,-20],b:[40,20]}],skCons:[]})
  await g().commitStandaloneSketch()
  const sk=Object.keys(g().sketchSources)[0]
  await extrudeRegion(sk,0,20)
  await extrudeRegion(sk,1,10)
  const [A,B]=g().features.filter(f=>f.type==='extrude')
  return {A,B}
}
async function bossOn(threePt,c){
  await g().startSketchOnFace(threePt,[0,0,1]); assert.equal(g().mode,'sketch',g().status)
  useApp.setState({sketchProfiles:[{type:'circle',c,r:5}],sketchShape:null,extrudeHeight:5,sketchOp:'join'})
  await g().extrudeSketch(); assert.equal(g().mode,'model',g().status)
  return g().features.at(-1)
}

test('sketch on A’s face (made after B) binds to A; deleting B keeps it; undo restores exactly', async () => {
  const {A,B}=await seed()
  const boss=await bossOn([-15,20,0],[-15,0])
  assert.equal(boss.sketchFaceBinding?.sourceId,A.id,'face owner is A, not the last extrude B')
  assert.equal(g().sketchSources[boss.sketchId].faceBinding?.sourceId,A.id)
  assert.deepEqual(g().failedFeatureIds,[])
  const before={features:JSON.stringify(g().features),sources:JSON.stringify(g().sketchSources),step:await step()}
  // a plain rebuild of the same document is stable
  assert.equal(await g().applyFeatures(g().features.slice(),'rebuild',false,undefined,undefined,true),true,g().status)
  assert.equal(await step(),before.step)
  await g().requestRemoveFeature(B.id)
  assert.equal(confirms.length,0,'no dependency prompt: the face sketch does not depend on B\n'+confirms.join('\n'))
  assert.deepEqual(g().features.map(f=>f.id),JSON.parse(before.features).map(f=>f.id).filter(id=>id!==B.id),g().status)
  assert.deepEqual(g().failedFeatureIds,[])
  assert.ok(g().sketchSources[boss.sketchId],'boss sketch source survives')
  await g().undo()
  assert.doesNotMatch(g().status,/撤銷失敗/)
  sameFeatures(before.features)
  assert.equal(JSON.stringify(g().sketchSources),before.sources)
  assert.equal(await step(),before.step)
  await g().redo()
  assert.ok(!g().features.some(f=>f.id===B.id)&&g().features.some(f=>f.id===boss.id),g().status)
  assert.deepEqual(g().failedFeatureIds,[])
  assert.equal(g().features.at(-1).sketchFaceBinding.sourceId,A.id)
})

test('sketch on B’s own face still binds to B, so deleting B asks to remove it too', async () => {
  const {B}=await seed()
  const boss=await bossOn([25,10,0],[25,0])
  assert.equal(boss.sketchFaceBinding?.sourceId,B.id)
  await g().requestRemoveFeature(B.id)
  assert.equal(confirms.length,1)
  assert.ok(!g().features.some(f=>f.id===boss.id))
})
