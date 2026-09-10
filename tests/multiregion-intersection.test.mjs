import test from 'node:test';import assert from 'node:assert/strict';import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url);
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready();const {useApp}=await import('../src/store.ts');const {importSTEP,measureVolume}=await import('replicad');
const volume=async()=>measureVolume(await importSTEP(new Blob([await w.exportSTEP()])));
for(const arb of [false,true])test(`intersection retains holes and disconnected islands (${arb?'arbitrary':'XY'}) and sketch edits`,async()=>{
 const features=[{id:'base',type:'extrude',profile:{kind:'rect',a:[-70,-60],b:[70,60]},height:10,operation:'new'}];
 useApp.setState({...useApp.getInitialState(),features,timelinePos:1},true);await useApp.getState().applyFeatures(features,'base',false);
 const shapes=[{type:'rect',a:[0,0],b:[30,30]},{type:'rect',a:[10,10],b:[20,20]},{type:'rect',a:[40,0],b:[50,10]}];
 useApp.setState({mode:'sketch',sketchProfiles:shapes,sketchShape:null,sketchOp:'intersect',extrudeHeight:10,...(arb?{sketchArb:{o:[0,0,0],xd:[1,0,0],n:[0,0,1]}}:{})});
 await useApp.getState().extrudeSketch();assert.equal(useApp.getState().mode,'model');assert.ok(Math.abs(await volume()-9000)<.001);
 const f=useApp.getState().features.at(-1);assert.equal(f.profile.holes.length,1);assert.equal(f.profile.islands.length,1);
 await useApp.getState().editSketchOf(f.id);const s=useApp.getState();useApp.setState({sketchProfiles:s.sketchProfiles.map((sh,i)=>i===1?{...sh,b:[25,20]}:sh)});await useApp.getState().applySketchEdit(f.sketchId);
 assert.ok(Math.abs(await volume()-8500)<.001);assert.equal(useApp.getState().features.at(-1).id,f.id);
});
