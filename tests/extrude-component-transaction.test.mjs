import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require=createRequire(import.meta.url)
globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url))
register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts')
const w=globalThis.__wheelWorker;await w.ready()
const {useApp}=await import('../src/store.ts')
const {importSTEP,measureVolume}=await import('replicad')
async function setup(shapes){
 const features=[{id:'base',type:'extrude',profile:{kind:'rect',a:[0,0],b:[40,30]},height:10,operation:'new'}]
 useApp.setState({...useApp.getInitialState(),features,timelinePos:1},true)
 await useApp.getState().applyFeatures(features,'base',false)
 useApp.setState({mode:'sketch',sketchProfiles:shapes.slice(0,-1),sketchShape:shapes.at(-1)})
 useApp.getState().openExtrudeDlg();useApp.setState({sketchAsComponent:true,extrudeHeight:12})
 return useApp.getState()
}
const circle={type:'circle',c:[60,40],r:8}
for(const scenario of ['no region selected','missing target face'])test(`new-component extrusion preserves the complete draft on ${scenario}`,async()=>{
 await setup(scenario==='no region selected'?[circle,{...circle,c:[90,40]}]:[circle])
 if(scenario==='missing target face')useApp.getState().setExtrudeExtent('toface')
 const before=useApp.getState()
 await before.extrudeSketch()
 const after=useApp.getState()
 for(const key of ['features','components','componentDefs','originX','undoStack','sketchSources','skCons','sketchShape','sketchProfiles','sketchAsComponent','extrudeDlgOpen'])assert.deepEqual(after[key],before[key],key)
 assert.ok(Math.abs(measureVolume(await importSTEP(new Blob([await w.exportSTEP()]))) -12000)<1e-5)
 assert.match(after.status,scenario==='no region selected'?/未拣任何区域/:/先点目标面/)
})
test('successful new-component extrusion has one undo step that restores the original body',async()=>{
 const before=await setup([circle]);await before.extrudeSketch();const after=useApp.getState()
 assert.equal(after.components.length,1);assert.equal(after.mode,'model');assert.ok(after.bodyMesh.triangles.length)
 assert.equal(after.undoStack.length,before.undoStack.length+1)
 await after.undo();assert.deepEqual(useApp.getState().features,before.features);assert.deepEqual(useApp.getState().components,before.components)
 assert.ok(Math.abs(measureVolume(await importSTEP(new Blob([await w.exportSTEP()]))) -12000)<1e-5)
})
test('kernel rejection rolls back the new component and keeps its sketch draft',async()=>{
 const before=await setup([circle]),apply=before.applyFeatures
 useApp.setState({applyFeatures:async(features,...args)=>{
  if(features.some(f=>f.id!=='base')){useApp.setState({status:'Injected kernel rejection'});return false}
  return apply(features,...args)
 }})
 await useApp.getState().extrudeSketch()
 const after=useApp.getState()
 for(const key of ['features','components','componentDefs','originX','sketchShape','sketchProfiles','undoStack','extrudeDlgOpen'])assert.deepEqual(after[key],before[key],key)
 assert.ok(Math.abs(measureVolume(await importSTEP(new Blob([await w.exportSTEP()]))) -12000)<1e-5)
})
