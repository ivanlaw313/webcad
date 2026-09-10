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
 useApp.setState({...useApp.getInitialState(),params:[{id:'plane-z',name:'PlaneZ',value:10}],appConfirm:async()=>true},true)
 await g().addDatumFeature({base:'XY',offset:10},'datum');const datum=g().features.find(f=>f.type==='datum');assert.ok(datum);await g().bindParam(datum.id,'offset','PlaneZ')
 assert.equal(g().planes[0]?.offset,10);g().sketchOnDatumPlane('XY',10);useApp.setState({sketchShape:{type:'rect',a:[10,0],b:[20,12]},sketchProfiles:[]})

const {writeFileSync}=await import('node:fs');writeFileSync('../../outputs/visible-datum-revolve.json',JSON.stringify(buildProjectPayload(g())));
