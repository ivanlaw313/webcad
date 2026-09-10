import test from 'node:test';import assert from 'node:assert/strict';import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url);
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready();const {useApp,buildProjectPayload,faceGroupTris}=await import('../src/store.ts');const {importSTEP,measureVolume,getOC}=await import('replicad');const oc=getOC();
const base={id:'base',type:'extrude',profile:{kind:'rect',a:[-30,-20],b:[30,20]},height:10.4,operation:'new'};
async function reset(){useApp.setState({...useApp.getInitialState()},true);assert.ok(await useApp.getState().applyFeatures([structuredClone(base)],'base',false))}
async function shape(){return importSTEP(new Blob([await w.exportSTEP()]))}
async function volume(){return measureVolume(await shape())}
async function faceExtrude(p,n,profile,h,op='new'){
 await useApp.getState().startSketchOnFace([p[0],p[2],-p[1]],n);useApp.setState({sketchShape:profile,extrudeHeight:h,extrudeExtent:'distance',extrudeFlip:false,sketchOp:op,faceCutThrough:false});await useApp.getState().extrudeSketch();assert.equal(useApp.getState().mode,'model',useApp.getState().status+JSON.stringify(useApp.getState().featureErrors));assert.deepEqual(useApp.getState().failedFeatureIds,[])
}
test('fractional face and datum offsets survive stacked boss and blind pocket operations',async()=>{
 await reset();await faceExtrude([0,0,10.4],[0,0,1],{type:'circle',c:[0,0],r:5},5.2);let expected=60*40*10.4+Math.PI*25*5.2;assert.ok(Math.abs(await volume()-expected)<1e-4,`boss volume ${await volume()} expected ${expected}`);
 await faceExtrude([0,0,15.6],[0,0,1],{type:'circle',c:[0,0],r:2},3.2,'cut');expected-=Math.PI*4*3.2;assert.ok(Math.abs(await volume()-expected)<1e-4);
 for(const plane of ['XY','XZ','YZ']){useApp.getState().sketchOnDatumPlane(plane,7.35);assert.equal(useApp.getState().sketchBaseZ,7.35);useApp.getState().exitSketchMode()}
});
test('slightly inclined faces retain their actual plane instead of snapping to an origin plane',async()=>{
 for(const angle of [1,4,8]){await reset();const a=angle*Math.PI/180,n=[Math.sin(a),0,Math.cos(a)],p=[2*Math.cos(a)+10.4*Math.sin(a),3,-2*Math.sin(a)+10.4*Math.cos(a)];await append({id:'tilt',type:'transform',dx:0,dy:0,dz:0,rz:0,ry:angle,origin:[0,0,0]});await useApp.getState().startSketchOnFace([p[0],p[2],-p[1]],n);assert.ok(useApp.getState().sketchArb,`${angle} degree face lost its actual plane: ${useApp.getState().status}`);assert.deepEqual(useApp.getState().sketchArb.o,p);useApp.getState().exitSketchMode()}
});
test('consumed or missing Boolean tools reject the new step and preserve geometry/history',async()=>{
 await reset();const before=useApp.getState(),v=await volume();const ok=await before.applyFeatures([...before.features,{id:'missing-tool',type:'bodyboolean',bop:'cut',target:0}],'cut');assert.equal(ok,false);assert.deepEqual(useApp.getState().features,before.features);assert.deepEqual(useApp.getState().undoStack,before.undoStack);assert.ok(Math.abs(await volume()-v)<1e-5)
});
console.log('OCCT validity bindings:',Object.keys(oc).filter(k=>k.startsWith('BRepCheck_Analyzer')))
async function valid(label){const sh=await shape(),checker=new oc.BRepCheck_Analyzer(sh.wrapped,true,false);try{assert.equal(checker.IsValid_2(),true,`${label}: OCCT B-rep validity`)}finally{checker.delete()}assert.ok(measureVolume(sh)>0);assert.ok(useApp.getState().bodyMesh.vertices.every(Number.isFinite));return measureVolume(sh)}
async function append(f){const s=useApp.getState();assert.equal(await s.applyFeatures([...s.features,f],f.id),true,`${f.id}: ${useApp.getState().status} ${JSON.stringify(useApp.getState().featureErrors)}`);assert.deepEqual(useApp.getState().failedFeatureIds,[]);await valid(f.id)}
test('interleaved face sketches, six directions, fillet, chamfer, Boolean and a third operation survive editing, history and JSON/STEP roundtrip',async()=>{
 await reset();await faceExtrude([0,0,10.4],[0,0,1],{type:'circle',c:[0,0],r:5},5.2);const boss=useApp.getState().features.at(-1);await valid('boss');
 await faceExtrude([0,0,15.6],[0,0,1],{type:'circle',c:[0,0],r:2},3.2,'cut');await valid('top pocket');
 for(const [p,n] of [[[30,0,5],[1,0,0]],[[-30,0,5],[-1,0,0]],[[0,20,5],[0,1,0]],[[0,-20,5],[0,-1,0]]]){
  const before=await volume();await faceExtrude(p,n,{type:'circle',c:[0,5],r:1.5},2.2,'cut');assert.ok(Math.abs(before-await volume()-Math.PI*2.25*2.2)<1e-4,`side ${n} pocket direction/depth`);await valid(`side ${n}`)
 }
 await faceExtrude([15,0,0],[0,0,-1],{type:'circle',c:[15,0],r:1.5},2,'cut');await valid('bottom pocket');
 await append({id:'round-corner',type:'fillet',radius:1.2,near:[-30,-20,5.2]});await append({id:'bevel-bottom',type:'chamfer',distance:.5,near:[0,-20,0]});
 await append({id:'boolean-tool',type:'extrude',profile:{kind:'rect',a:[10,-5],b:[14,5]},height:20,operation:'newbody'});const beforeBoolean=await volume();await append({id:'boolean-cut',type:'bodyboolean',bop:'cut',target:0,keep:true});assert.ok(await volume()<beforeBoolean);
 await faceExtrude([-15,0,10.4],[0,0,1],{type:'circle',c:[-15,0],r:3},2.7);await valid('new boss after Boolean');
 const beforeEdit=await volume(),ids=useApp.getState().features.map(f=>f.id);
 await useApp.getState().editSketchOf(boss.id);assert.equal(useApp.getState().mode,'sketch');useApp.setState({sketchProfiles:useApp.getState().sketchProfiles.map(sh=>sh.type==='circle'?{...sh,r:5.5}:sh),sketchShape:useApp.getState().sketchShape?{...useApp.getState().sketchShape,r:5.5}:null});await useApp.getState().applySketchEdit(boss.sketchId);assert.equal(useApp.getState().mode,'model',useApp.getState().status+JSON.stringify(useApp.getState().featureErrors));assert.deepEqual(useApp.getState().features.map(f=>f.id),ids);const afterEdit=await valid('early sketch radius edit');assert.ok(Math.abs(afterEdit-beforeEdit-Math.PI*(5.5**2-25)*5.2)<.001);
 await useApp.getState().undo();assert.ok(Math.abs(await volume()-beforeEdit)<.001);await useApp.getState().redo();assert.ok(Math.abs(await volume()-afterEdit)<.001);
 const saved=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(saved);assert.deepEqual(useApp.getState().failedFeatureIds,[]);assert.ok(Math.abs(await valid('saved/reopened entire chain')-afterEdit)<.001);assert.deepEqual(useApp.getState().features.map(f=>f.id),ids);
 console.log('Mixed workflow final:',JSON.stringify({steps:ids.length,volume:afterEdit,ids}));
});

for(const angle of [1,4,8])test(`actual ${angle} degree face supports outward boss and exact-depth inward pocket`,async()=>{
 await reset();await append({id:'tilt',type:'transform',origin:[0,0,0],dx:0,dy:0,dz:0,rx:0,ry:angle,rz:0});const a=angle*Math.PI/180,n=[Math.sin(a),0,Math.cos(a)],p=n.map(x=>x*10.4);const v=await volume();await faceExtrude(p,n,{type:'circle',c:[0,0],r:3},2.6);assert.ok(Math.abs(await volume()-v-Math.PI*9*2.6)<.001);await valid('tilted boss');const top=n.map(x=>x*13);await faceExtrude(top,n,{type:'circle',c:[0,0],r:1},1.1,'cut');assert.ok(Math.abs(await volume()-v-Math.PI*9*2.6+Math.PI*1.1)<.001);await valid('tilted pocket')
});
for(const [p,n,center] of [[[0,0,10.4],[0,0,1],[0,0]],[[0,0,0],[0,0,-1],[0,0]],[[30,0,5.2],[1,0,0],[0,5.2]],[[-30,0,5.2],[-1,0,0],[0,5.2]],[[0,20,5.2],[0,1,0],[0,5.2]],[[0,-20,5.2],[0,-1,0],[0,5.2]]])test(`new face extrusion defaults outward on face ${n}`,async()=>{
 await reset();await useApp.getState().startSketchOnFace([p[0],p[2],-p[1]],n);useApp.setState({sketchShape:{type:'circle',c:center,r:2}});useApp.getState().openExtrudeDlg();useApp.setState({extrudeHeight:2.4});await useApp.getState().extrudeSketch();assert.equal(useApp.getState().mode,'model');assert.ok(Math.abs(await volume()-24960-Math.PI*4*2.4)<.001,`outward boss on ${n} must add its whole volume`)
});

test('planar sketch picking stays exact after fillet and chamfer, while curved CAD faces are rejected',async()=>{
 const {sketchFacePlane}=await import('../src/geom/sketchFacePlane.ts');await reset();await append({id:'round',type:'fillet',radius:1,edges:'vertical'});await append({id:'bevel',type:'chamfer',distance:.4,edges:'bottom'});const mesh=useApp.getState().bodyMesh;let top=false,curved=0;for(const group of mesh.faceGroups){const p=sketchFacePlane(faceGroupTris(mesh,group.start/3));if(!p){curved++;continue}if(p.n[2]>.999&&Math.abs(p.p[2]-10.4)<1e-10)top=true}assert.ok(top);assert.ok(curved>0)
});
test('dialog distance means a blind pocket even after a previous through-all cut',async()=>{
 await reset();await useApp.getState().startSketchOnFace([0,10.4,0],[0,0,1]);useApp.setState({sketchShape:{type:'circle',c:[0,0],r:2},faceCutThrough:true});useApp.getState().openExtrudeDlg();useApp.getState().setSketchOp('cut');useApp.setState({extrudeHeight:1.2});await useApp.getState().extrudeSketch();assert.equal(useApp.getState().mode,'model');assert.ok(Math.abs(await volume()-24960+Math.PI*4*1.2)<.001,'Distance=1.2 must remove only 1.2 mm, not the entire thickness')
});
test('nested profiles cut a ring pocket without adding material above the face; reopening preserves its depth',async()=>{
 await reset();await useApp.getState().startSketchOnFace([0,10.4,0],[0,0,1]);useApp.setState({sketchProfiles:[{type:'circle',c:[0,0],r:5},{type:'circle',c:[0,0],r:2}],sketchShape:null,sketchOp:'cut',extrudeHeight:1.2,faceCutThrough:false,extrudeExtent:'distance'});await useApp.getState().extrudeSketch();assert.equal(useApp.getState().mode,'model');assert.ok(Math.abs(await volume()-24960+Math.PI*(25-4)*1.2)<.001,'ring pocket removes only its annular region');await valid('ring pocket');assert.ok((await shape()).boundingBox.bounds[1][2]<10.4001,'ring pocket must not create floating material above the face');const f=useApp.getState().features.at(-1);await useApp.getState().editSketchOf(f.id);useApp.setState({sketchProfiles:useApp.getState().sketchProfiles.map(sh=>sh.r===2?{...sh,r:2.5}:sh)});await useApp.getState().applySketchEdit(f.sketchId);assert.equal(useApp.getState().mode,'model');assert.ok(Math.abs(await volume()-24960+Math.PI*(25-6.25)*1.2)<.001)
});
test('oversized whole-body fillet never succeeds by shrinking its radius or keeping an unchanged shape',async()=>{await reset();const before=useApp.getState(),v=await volume();assert.equal(await before.applyFeatures([...before.features,{id:'too-large',type:'fillet',radius:100,edges:'all'}],'fillet'),false);assert.deepEqual(useApp.getState().features,before.features);assert.ok(Math.abs(await volume()-v)<.001)});
