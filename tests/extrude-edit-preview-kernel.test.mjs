import test from 'node:test';import assert from 'node:assert/strict';import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready();const {useApp,buildProjectPayload}=await import('../src/store.ts');const {importSTEP,measureVolume}=await import('replicad');
const base={id:'base',type:'extrude',profile:{kind:'rect',a:[0,0],b:[20,20]},height:20,operation:'new'};
const cut={id:'cut',type:'extrude',profile:{kind:'rect',a:[8,8],b:[12,12]},height:20,baseZ:0,operation:'cut',toFace:{near:[5,5,20]}};
const volume=async()=>measureVolume(await importSTEP(new Blob([await w.exportSTEP()])));
function meshVolume(m){let v=0;const p=m.vertices,t=m.triangles;for(let i=0;i<t.length;i+=3){const a=t[i]*3,b=t[i+1]*3,c=t[i+2]*3;v+=(p[a]*(p[b+1]*p[c+2]-p[b+2]*p[c+1])+p[a+1]*(p[b+2]*p[c]-p[b]*p[c+2])+p[a+2]*(p[b]*p[c+1]-p[b+1]*p[c]))/6}return Math.abs(v)}
for (const sample of [
 {name:'rectangle',profile:{kind:'rect',a:[8,8],b:[12,12]},area:16,tolerance:.001},
 {name:'circle',profile:{kind:'circle',c:[10,10],r:2},area:4*Math.PI,tolerance:.2},
]) test(`${sample.name}: to-face cut → distance preview → commit → Undo/Redo → JSON retains matching depth`,async()=>{
 useApp.setState({...useApp.getInitialState()},true);assert.equal(await useApp.getState().applyFeatures([base,{...cut,profile:sample.profile}],'base'),true);
 const before=await volume(),count=useApp.getState().undoStack.length;assert.ok(Math.abs(before-(8000-sample.area*20))<.001);
 useApp.getState().openFeatDlgForEdit('cut');useApp.getState().setFeatParam('extent','distance');useApp.getState().setFeatParam('heightExpr','5');
 const preview=await useApp.getState().previewExtrudeEdit();assert.ok(preview&&!preview.failed?.length);const expected=8000-sample.area*5;
 console.log({previewVolume:meshVolume(preview),expected,params:useApp.getState().featDlg.params});assert.ok(Math.abs(meshVolume(preview)-expected)<sample.tolerance,'tessellated preview matches blind cut');assert.ok(Math.abs(await volume()-before)<.001);assert.equal(useApp.getState().undoStack.length,count);
 await useApp.getState().commitFeatDlg();assert.ok(Math.abs(await volume()-expected)<.001);assert.equal(useApp.getState().features.at(-1).toFace,undefined);
 await useApp.getState().undo();assert.ok(Math.abs(await volume()-before)<.001);await useApp.getState().redo();assert.ok(Math.abs(await volume()-expected)<.001);
 const saved=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(saved);assert.ok(Math.abs(await volume()-expected)<.001);
});
