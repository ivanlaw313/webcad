import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import fs from 'node:fs'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready()
const {importSTEP,measureVolume,getOC,draw}=await import('replicad')
const doc=JSON.parse(fs.readFileSync(new URL('./fixtures/user-shell-multi-cut.json',import.meta.url),'utf8'))
const shape=async()=>importSTEP(new Blob([await w.exportSTEP()]))
const tool=p=>{const pts=p.kind==='rect'?[p.a,[p.b[0],p.a[1]],p.b,[p.a[0],p.b[1]]]:p.pts;let pen=draw().movePointerTo(pts[0]);for(const v of pts.slice(1))pen=pen.lineTo(v);return pen.close().sketchOnPlane('XZ',-150).extrude(300)}
await w.rebuild(doc.features.slice(0,4));const base=await shape(),oc=getOC();
const removed=base.faces.filter(f=>f.boundingBox.bounds[0][2]>99.999);
for(const intersect of [false,true]) for(const join of ['GeomAbs_Arc','GeomAbs_Intersection']) {
 try {const list=new oc.TopTools_ListOfShape_1();for(const f of removed)list.Append_1(f.wrapped);const b=new oc.BRepOffsetAPI_MakeThickSolid(),progress=new oc.Message_ProgressRange_1();b.MakeThickSolidByJoin(base.wrapped,list,-1,1e-3,oc.BRepOffset_Mode.BRepOffset_Skin,intersect,true,oc.GeomAbs_JoinType[join],false,progress);const {cast}=await import('replicad');const result=cast(b.Shape());const c=new oc.BRepCheck_Analyzer(result.wrapped,true,false);console.log('OPTION',{intersect,join,valid:c.IsValid_2(),volume:measureVolume(result)});c.delete();}catch(e){console.log('ERROR',{intersect,join,error:String(e)})}
}
