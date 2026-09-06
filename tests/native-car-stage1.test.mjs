import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {nativeCarStage1} from '../examples/native-car-stage1.mjs'
import {sanitizeViewBookmark} from '../src/cad/viewBookmark.ts'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=path.dirname(fileURLToPath(import.meta.url))
register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts')
const worker=globalThis.__wheelWorker;await worker.ready()
const {useApp,buildProjectPayload}=await import('../src/store.ts')
const initial=useApp.getInitialState()
const bounds=m=>[0,1,2].map(a=>{let min=Infinity,max=-Infinity;for(let i=a;i<m.vertices.length;i+=3){min=Math.min(min,m.vertices[i]);max=Math.max(max,m.vertices[i])}return[min,max]})
test('native XZ five-spoke car has symmetric wheel stations, Y width and ground Z=0',async()=>{
 const d=nativeCarStage1();const m=await worker.rebuild(d.features)
 assert.ok(m.triangles.length>0);assert.deepEqual(m.failed??[],[]);assert.deepEqual(m.warnings??[],[])
 const b=bounds(m);assert.ok(Math.abs(b[0][0]+85)<.1);assert.ok(Math.abs(b[0][1]-85)<.1);assert.ok(Math.abs(b[1][0]+45)<.1);assert.ok(Math.abs(b[1][1]-45)<.1);assert.ok(Math.abs(b[2][0])<.1)
 assert.equal(d.features[4].count,5);assert.deepEqual(d.features[4].dir,[0,1,0]);assert.equal(d.features[5].plane,'XZ')
 console.log('Native car B-rep mesh bounds',b,'triangles',m.triangles.length/3)
})
test('both wheel arch Cuts and cabin window remove real B-rep volume',async()=>{
 const {importSTEP,measureVolume}=await import('replicad');const d=nativeCarStage1();const volumes=[]
 for(const n of [8,9,10,11,12]){const m=await worker.rebuild(d.features.slice(0,n));assert.deepEqual(m.failed??[],[]);volumes.push(measureVolume(await importSTEP(new Blob([await worker.exportSTEP()]))))}
 assert.ok(volumes[0]-volumes[1]>1000);assert.ok(volumes[1]-volumes[2]>1000);assert.ok(volumes[3]>volumes[2]);assert.ok(volumes[3]-volumes[4]>1000);console.log('B-rep volumes at feature 8…12',volumes)
})
test('real store changes master parameters, keeps five-spoke origin and saves/reopens native sources',async()=>{
 useApp.setState({...initial},true);await useApp.getState().applyProjectData(nativeCarStage1())
 for(const [name,value] of [['Wheelbase',140],['WheelDiameter',60],['CarWidth',100]]){
  await useApp.getState().setParam(name,value);console.log(name,useApp.getState().status);assert.equal(useApp.getState().params.find(p=>p.name===name).value,value,useApp.getState().status)
 }
 const s=useApp.getState();assert.equal(s.sketchSources.sk1.baseZ,50);assert.equal(s.sketchSources.sk3.baseZ,40);assert.equal(s.sketchSources.sk5.height,60);assert.deepEqual(s.failedFeatureIds,[]);const f=s.features.find(f=>f.id==='F5');assert.ok(Array.isArray(f.origin));assert.ok(Math.abs(f.origin[0]+70)<1e-6);assert.ok(Math.abs(f.origin[2]-30)<1e-6)
 const m=await worker.rebuild(s.features);assert.deepEqual(m.failed??[],[]);const b=bounds(m);assert.ok(Math.abs(b[0][0]+100)<.15);assert.ok(Math.abs(b[0][1]-100)<.15);assert.ok(Math.abs(b[1][0]+50)<.15);assert.ok(Math.abs(b[2][0])<.15)
 const beforeFailure=JSON.parse(JSON.stringify({features:s.features,params:s.params,sketchSources:s.sketchSources}))
 await useApp.getState().setParam('WheelDiameter',0);assert.match(useApp.getState().status,/失败|退化/)
 assert.deepEqual(JSON.parse(JSON.stringify({features:useApp.getState().features,params:useApp.getState().params,sketchSources:useApp.getState().sketchSources})),beforeFailure)
 await useApp.getState().undo();assert.equal(useApp.getState().params.find(p=>p.name==='CarWidth').value,90)
 await useApp.getState().redo();assert.equal(useApp.getState().params.find(p=>p.name==='CarWidth').value,100)
 const payload=buildProjectPayload(useApp.getState());useApp.setState({...initial},true);await useApp.getState().applyProjectData(JSON.parse(JSON.stringify(payload)));assert.deepEqual(useApp.getState().features,JSON.parse(JSON.stringify(payload.features)))
 console.log('Edited native car bounds',b)
})
test('bookmarks preserve up, zoom, projection and reject degenerate coordinates',async()=>{
 useApp.setState({...initial},true);await useApp.getState().applyProjectData(nativeCarStage1())
 const s=useApp.getState();s.applyViewBookmark(4);assert.deepEqual(useApp.getState().pendingBookmarkApply.up,[0,0,-1]);assert.equal(useApp.getState().cameraOrtho,true)
 s.saveViewBookmark('User perspective',[1,2,3],[0,0,0],{up:[0,0,1],zoom:1.7,projection:'persp'})
 const p=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));useApp.setState({...initial},true);await useApp.getState().applyProjectData(p);assert.equal(useApp.getState().viewBookmarks.at(-1).zoom,1.7);useApp.getState().applyViewBookmark(6);assert.equal(useApp.getState().cameraOrtho,false)
 assert.equal(sanitizeViewBookmark({pos:[0,0,0],target:[0,0,0]}),null)
 const top=sanitizeViewBookmark({pos:[0,10,0],target:[0,0,0],up:[0,1,0]});assert.deepEqual(top.up,[0,0,-1])
})
