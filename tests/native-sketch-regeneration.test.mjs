import test from 'node:test';import assert from 'node:assert/strict';import {register,createRequire} from 'node:module';import {readFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url);
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready();const {useApp,nestedProfileRegions}=await import('../src/store.ts');const {importSTEP,measureVolume}=await import('replicad');
const rect=(a,b)=>({kind:'rect',a,b});
test('nested loops retain islands while disjoint and overlapping loops remain separate',()=>{
 const outer=rect([0,0],[30,30]),hole=rect([5,5],[25,25]),island=rect([10,10],[20,20]);
 const regions=nestedProfileRegions([outer,hole,island]);assert.equal(regions.length,2);assert.deepEqual(regions[0].holes,[hole]);assert.deepEqual(regions[1],island);
 assert.equal(nestedProfileRegions([outer,rect([20,20],[40,40])]).length,2);
 assert.equal(nestedProfileRegions([outer,rect([40,40],[50,50])]).length,2);
});
test('reopening a blind ring pocket retains its hole, identity and exact depth',async()=>{
 const arb={o:[0,0,10],xd:[1,0,0],n:[0,0,1]},outer=rect([-10,-10],[10,10]),hole=rect([-5,-5],[5,5]);
 const features=[{id:'base',type:'extrude',profile:rect([-30,-20],[30,20]),height:10,operation:'new'},{id:'seam',type:'extrude',profile:{...outer,holes:[hole]},height:.4,operation:'cut',arbPlane:arb,exactDistance:true,sketchId:'sk1'}];
 useApp.setState({...useApp.getInitialState(),features,sketchSources:{sk1:{shapes:[{type:'rect',a:outer.a,b:outer.b},{type:'rect',a:hole.a,b:hole.b}],cons:[],plane:'XY',baseZ:0,arb,height:.4,op:'cut'}},timelinePos:2},true);
 await useApp.getState().applyFeatures(features,'test',false);await useApp.getState().editSketchOf('seam');await useApp.getState().applySketchEdit('sk1');
 assert.equal(useApp.getState().mode,'model');const f=useApp.getState().features[1];assert.equal(f.id,'seam');assert.equal(f.exactDistance,true);assert.deepEqual(f.profile.holes,[hole]);const v=measureVolume(await importSTEP(new Blob([await w.exportSTEP()])));assert.ok(Math.abs(v-23880)<.001);
});
test('native demo tire supports a driving diameter edit and keeps its center and fillet',async()=>{
 const d=JSON.parse(await readFile(new URL('../examples/fusion-demo-car-native.json',import.meta.url),'utf8'));const c=d.components.find(c=>c.id==='C2'),f=c.src.features[0];
 useApp.setState({...useApp.getInitialState(),features:c.src.features,sketchSources:c.src.sketchSources,timelinePos:c.src.features.length},true);await useApp.getState().applyFeatures(c.src.features,'test',false);await useApp.getState().editSketchOf(f.id);
 const dim=useApp.getState().skCons.find(c=>c.kind==='dim'&&c.type==='dia');await useApp.getState().commitSkDim(dim.id,{value:62},'test');await useApp.getState().applySketchEdit(f.sketchId);
 assert.equal(useApp.getState().mode,'model');const profile=useApp.getState().features[0].profile;assert.equal(profile.r,31);assert.deepEqual(profile.c,f.profile.c);assert.ok(useApp.getState().features.some(f=>f.type==='fillet'));assert.deepEqual(useApp.getState().failedFeatureIds,[]);
});
test('all constrained native car sketches solve without changing the reference geometry',async()=>{
 const {solveFree}=await import('../src/sketch/freesolve.ts');const d=JSON.parse(await readFile(new URL('../examples/fusion-demo-car-native.json',import.meta.url),'utf8'));
 const coords=sh=>sh.type==='circle'?[...sh.c,sh.r]:sh.type==='rect'?[...sh.a,...sh.b]:(sh.verts??sh.pts).flat();let count=0;
 for(const c of d.components)for(const [id,src]of Object.entries(c.src.sketchSources))if(src.cons.length){const r=await solveFree(src.shapes,src.cons);assert.ok(r&&!r.conflict,id);r.shapes.forEach((sh,i)=>{const a=coords(src.shapes[i]),b=coords(sh);assert.equal(a.length,b.length);assert.ok(b.every((v,k)=>Math.abs(v-a[k])<1e-5),id)});count++;}assert.equal(count,47);
});
test('finishing a component cannot bypass an unfinished sketch',()=>{
 useApp.setState({...useApp.getInitialState(),mode:'sketch',editingComponent:'C1'},true);useApp.getState().finishComponentEdit();assert.equal(useApp.getState().editingComponent,'C1');assert.equal(useApp.getState().mode,'sketch');assert.match(useApp.getState().status,/先完成草图/);
});
