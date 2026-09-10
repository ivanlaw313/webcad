import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const worker=globalThis.__wheelWorker;await worker.ready()
const {useApp,buildProjectPayload}=await import('../src/store.ts')
const {importSTEP,measureVolume,getOC}=await import('replicad')
const g=()=>useApp.getState(),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`)
async function verify(z){
 assert.deepEqual(g().failedFeatureIds,[],g().status)
 const solid=await importSTEP(new Blob([await worker.exportSTEP()])),analyzer=new(getOC().BRepCheck_Analyzer)(solid.wrapped,true,false)
 try{assert.equal(analyzer.IsValid_2(),true);near(measureVolume(solid),Math.PI*(20**2-10**2)*12);const bounds=solid.boundingBox.bounds;near(bounds[0][0],-20);near(bounds[1][0],20);near(bounds[0][1],-12);near(bounds[1][1],0);near(bounds[0][2],z-20);near(bounds[1][2],z+20)}finally{analyzer.delete();solid.delete()}
}
test('datum revolve follows parameter offset through dependent sketch Finish, history and JSON/STEP',async()=>{
 useApp.setState({...useApp.getInitialState(),params:[{id:'plane-z',name:'PlaneZ',value:10}],appConfirm:async()=>true},true)
 await g().addDatumFeature({base:'XY',offset:10},'datum');const datum=g().features.find(f=>f.type==='datum');assert.ok(datum);await g().bindParam(datum.id,'offset','PlaneZ')
 assert.equal(g().planes[0]?.offset,10);g().sketchOnDatumPlane('XY',10);useApp.setState({sketchShape:{type:'rect',a:[10,0],b:[20,12]},sketchProfiles:[]})
 await g().runCommand('revolve','旋轉');assert.equal(g().featDlg?.kind,'revolve');assert.deepEqual(g().featDlg.payload.bundle.datumRef,{idx:0,base:'XY'},'revolve command must capture selected datum');g().cancelFeatDlg();assert.equal(g().mode,'sketch');await g().runCommand('revolve','旋轉');assert.deepEqual(g().featDlg.payload.bundle.datumRef,{idx:0,base:'XY'},'cancel and reopen must retain datum ownership');await g().commitFeatDlg();const feature=g().features.find(f=>f.type==='revolve');assert.ok(feature,g().status);assert.deepEqual(g().sketchSources[feature.sketchId].datumRef,{idx:0,base:'XY'});await verify(10)
 await g().editSketchOf(feature.id);assert.equal(g().mode,'sketch');await g().setParam('PlaneZ',20);assert.equal(g().params[0].value,20,g().status);assert.equal(g().sketchBaseZ,20);await verify(20)
 await g().undo();await verify(10);assert.equal(g().sketchBaseZ,10);await g().redo();await verify(20);assert.equal(g().sketchBaseZ,20)
 await g().applySketchEdit(feature.sketchId);assert.equal(g().mode,'model',g().status);await verify(20)
 await g().undo();await verify(10);await g().redo();await verify(20)
 const saved=JSON.parse(JSON.stringify(buildProjectPayload(g())));await g().reset();await g().applyProjectData(saved);await verify(20);assert.equal(g().sketchSources[feature.sketchId].baseZ,20)
})
