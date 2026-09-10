// Read-only audit of current public dialog/store flow; real solver + OCCT worker.
import assert from 'node:assert/strict';import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url);
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready();const {useApp}=await import('../src/store.ts');const {arcResample}=await import('../src/sketch/freesolve.ts');const {importSTEP,measureVolume,getOC}=await import('replicad');
const line=(a,b)=>({type:'poly',open:true,pts:[a,b]});const pt=(shape,idx)=>({kind:'pt',shape,idx});const join=(id,a,b)=>({id,kind:'con',type:'coincident',a,b});
for(const type of ['triangle','quarter-sector']){
 useApp.setState({...useApp.getInitialState()},true);
 const r=20,h=7,q=r/Math.sqrt(2),arc={a:[r,0],b:[0,r],m:[q,q]};const shapes=type==='triangle'?[line([0,0],[20,0]),line([20,0],[0,20]),line([0,20],[0,0])]:[{type:'poly',open:true,arc,pts:arcResample(arc.a,arc.b,arc.m)},line([0,r],[0,0]),line([0,0],[r,0])];
 const cons=[join('k1',pt(0,1),pt(1,0)),join('k2',pt(1,1),pt(2,0)),join('k3',pt(2,1),pt(0,0))];
 useApp.setState({mode:'sketch',sketchPlane:'XY',sketchProfiles:shapes,sketchShape:null,skCons:cons,sketchOp:'new'});await useApp.getState().resolveSk();assert.equal(useApp.getState().skConflict,false);
 useApp.getState().openExtrudeDlg();const dialog=useApp.getState();assert.equal(dialog.extrudeRegionFaces?.length,1);assert.deepEqual(dialog.extrudeRegionSel,[true]);useApp.setState({extrudeHeight:h});useApp.getState().toggleExtrudeRegion(0);await useApp.getState().extrudeSketch();assert.equal(useApp.getState().mode,'sketch');assert.equal(useApp.getState().features.length,0);useApp.getState().toggleExtrudeRegion(0);await useApp.getState().extrudeSketch();const s=useApp.getState();assert.equal(s.mode,'model',s.status);assert.ok(s.features.length>0,s.status);
 const sh=await importSTEP(new Blob([await w.exportSTEP()]));const oc=getOC(),check=new oc.BRepCheck_Analyzer(sh.wrapped,true,false);assert.ok(check.IsValid_2());check.delete();const actual=measureVolume(sh),expected=(type==='triangle'?200:Math.PI*r*r/4)*h;
 console.log(JSON.stringify({type,regionCount:dialog.extrudeRegionFaces.length,selected:dialog.extrudeRegionSel,actual,analyticExpected:expected,error:actual-expected,relativeError:Math.abs(actual-expected)/expected,exactWithin1e6:Math.abs(actual-expected)<1e-6,emittedProfiles:s.features.filter(f=>f.type==='extrude').map(f=>({kind:f.profile.kind,pts:f.profile.pts?.length})),preservedOpenSources:Object.values(s.sketchSources).map(v=>v.shapes?.map(sh=>sh.open))}));
 if(type==='triangle')assert.ok(Math.abs(actual-expected)<1e-6);
}
