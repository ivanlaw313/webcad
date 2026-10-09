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

// Regression: deleting the later extrude of a shared sketch, then Ctrl+Z, reported
// 「撤銷失敗…」. runFeatures remapped face bindings from the live (post-delete) group
// end to the restored one, re-binding an earlier face sketch to a FUTURE feature.
const step=async()=>stepGeometry(await globalThis.__wheelWorker.exportSTEP())
const extrudeRegion=async(sk,i,h)=>{
  g().setSelSketch(sk); await g().runCommand('extrude','拉伸')
  useApp.setState({extrudeHeight:h,extrudeRegionSel:g().extrudeRegionFaces.map((_,j)=>j===i),sketchOp:'join'})
  await g().extrudeSketch(); assert.equal(g().mode,'model',g().status)
}

test('undo of deleting a shared-sketch extrude restores the exact model (face sketch before it)', async () => {
  useApp.setState({...useApp.getInitialState(),appConfirm:async()=>true},true)
  g().startSketch(); g().chooseSketchPlane('XY')
  useApp.setState({sketchShape:null,sketchProfiles:[{type:'rect',a:[-30,-20],b:[0,20]},{type:'rect',a:[10,-20],b:[40,20]}],skCons:[]})
  await g().commitStandaloneSketch()
  const sk=Object.keys(g().sketchSources)[0]
  await extrudeRegion(sk,0,20)
  await g().startSketchOnFace([-15,20,0],[0,0,1])
  useApp.setState({sketchProfiles:[{type:'circle',c:[-15,0],r:5}],sketchShape:null,extrudeHeight:5,sketchOp:'join'})
  await g().extrudeSketch()
  await extrudeRegion(sk,1,10)
  assert.deepEqual(g().features.map(f=>f.type),['sketch','extrude','extrude','extrude'])
  assert.deepEqual(g().failedFeatureIds,[])
  const before={features:JSON.stringify(g().features),sources:JSON.stringify(g().sketchSources),step:await step()}
  const later=g().features.at(-1)
  await g().requestRemoveFeature(later.id)
  assert.equal(g().features.length,3,g().status)
  await g().undo()
  assert.doesNotMatch(g().status,/撤銷失敗/)
  assert.deepEqual(g().failedFeatureIds,[])
  assert.equal(JSON.stringify(g().features),before.features)
  assert.equal(JSON.stringify(g().sketchSources),before.sources)
  assert.equal(await step(),before.step,'kernel body after undo must equal the pre-delete body')
})

test('undo of deleting the base extrude under a shell restores extrude + shell', async () => {
  useApp.setState({...useApp.getInitialState(),appConfirm:async()=>true},true)
  g().startSketch(); g().chooseSketchPlane('XY')
  useApp.setState({sketchShape:{type:'rect',a:[-30,-20],b:[30,20]},sketchProfiles:[],skCons:[]})
  await g().commitStandaloneSketch()
  await extrudeRegion(Object.keys(g().sketchSources)[0],0,20)
  useApp.setState({shellPicks:[[-20,20,10]],shellThickness:2,shellMode:true})
  await g().commitShell()
  assert.deepEqual(g().features.map(f=>f.type),['sketch','extrude','shell'],g().status)
  const before={features:JSON.stringify(g().features),step:await step()}
  await g().requestRemoveFeature(g().features[1].id)
  assert.deepEqual(g().features.map(f=>f.type),['sketch'],g().status)
  await g().undo()
  assert.doesNotMatch(g().status,/撤銷失敗/)
  assert.equal(JSON.stringify(g().features),before.features)
  assert.equal(await step(),before.step)
})
