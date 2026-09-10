import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url))
register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');await globalThis.__wheelWorker.ready()
const {useApp,buildProjectPayload}=await import('../src/store.ts');const g=()=>useApp.getState()
const evidence=resolve('../../outputs/grok-return-20260910/GROK-WEBCAD-QA-v1.1-FINAL/evidence')
const load=async file=>{useApp.setState(useApp.getInitialState(),true);const d=JSON.parse(await readFile(resolve(evidence,file),'utf8'));await g().applyProjectData(d);return d}
test('SK20 source evidence has no PlaneZ binding; selected original datum source survives revolve hydration',async()=>{
 const d=await load('SK20/GROK_SK20_1.json');assert.deepEqual(d.params,[]);assert.deepEqual(d.paramBindings,{})
 g().setSelSketch('sk7');await g().runCommand('revolve','Revolve')
 assert.equal(g().featDlg?.kind,'revolve',g().status)
 assert.deepEqual(g().featDlg.payload.bundle.datumRef,{idx:0,base:'XY'})
})
test('SO05 actual saved open path is accepted by Sweep command and survives Cancel',async()=>{
 await load('downloads/captured_20260910T041913Z_3850.json')
 const sources=structuredClone(g().sketchSources)
 g().setSelSketch('sk2');await g().runCommand('sweep','Sweep')
 assert.equal(g().sweepDlgOpen,true,g().status)
 assert.equal(g().sketchShape.open,true)
 g().cancelSweepDlg();assert.deepEqual(g().sketchSources,sources)
 await g().runCommand('sweep','Sweep');g().setSweepDia(6);useApp.setState({sketchOp:'newbody'})
 await g().commitSweepPath()
 const f=g().features.find(f=>f.type==='sweep');assert.ok(f,g().status);assert.equal(f.r,3);assert.ok(Math.abs(f.path[1][0]-141.83621825732402)<1e-8)
 const {importSTEP,measureVolume}=await import('replicad')
 // Default STEP exports the active fallback cylinder; newbody sweeps are parked.
 // Verify the actual committed sweep definition independently, then restore the document kernel.
 await globalThis.__wheelWorker.rebuild([f])
 const shape=await importSTEP(new Blob([await globalThis.__wheelWorker.exportSTEP()]))
 try{assert.ok(Math.abs(measureVolume(shape)-Math.PI*9*141.83621825732402)<1e-4)}finally{shape.delete();await globalThis.__wheelWorker.rebuild(g().features)}
 const saved=JSON.parse(JSON.stringify(buildProjectPayload(g())));await g().reset();await g().applyProjectData(saved);assert.ok(g().features.some(f=>f.type==='sweep'))
})
test('reverse numeric extrusion commits negative native direction despite positive magnitude label',async()=>{
 useApp.setState(useApp.getInitialState(),true)
 g().startSketch();g().chooseSketchPlane('XY')
 useApp.setState({sketchShape:{type:'rect',a:[0,0],b:[20,10]},sketchProfiles:[],skCons:[],sketchOp:'new'})
 g().setExtrudeExpression('-5');await g().extrudeSketch()
 const f=g().features.find(f=>f.type==='extrude');assert.ok(f,g().status);assert.equal(f.height,5);assert.equal(f.down,true)
 const {importSTEP,measureVolume}=await import('replicad'),shape=await importSTEP(new Blob([await globalThis.__wheelWorker.exportSTEP()]))
 try{const box=shape.boundingBox.bounds;assert.ok(Math.abs(box[0][2]+5)<1e-6);assert.ok(Math.abs(box[1][2])<1e-6);assert.ok(Math.abs(measureVolume(shape)-1000)<1e-6)}finally{shape.delete()}
 const saved=JSON.parse(JSON.stringify(buildProjectPayload(g())));await g().reset();await g().applyProjectData(saved);assert.equal(g().features.find(f=>f.type==='extrude').down,true)
})
test('New document clears inspection and temporary geometry panels',async()=>{
 useApp.setState({...useApp.getInitialState(),inspectMode:true,inspectInfo:{area:4800},hoverFace:{id:1},propsDialog:{bodyId:null},propsDialogData:{rows:[]},editPreviewMesh:{vertices:[]},roundPreviewMesh:{vertices:[]},shellPreviewMesh:{vertices:[]},edgeRoundPicks:[[1,2,3]],edgeRoundPickLines:[[[0,0,0],[1,0,0]]]},true)
 await g().reset()
 for(const key of ['inspectInfo','hoverFace','propsDialog','propsDialogData','editPreviewMesh','roundPreviewMesh','shellPreviewMesh'])assert.equal(g()[key],null,key)
 assert.equal(g().inspectMode,false);assert.deepEqual(g().edgeRoundPicks,[]);assert.deepEqual(g().edgeRoundPickLines,[])
})
