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
const {Sketch,drawCircle}=await import('replicad'),face=removed[0];
function extrude(wire){return new Sketch(wire,{defaultOrigin:face.center,defaultDirection:face.normalAt()}).extrude(-99)}
const outer=face.clone().outerWire();for(const sign of [-1,1]){let candidate=extrude(outer.clone().offset2D(sign));console.log('OUTER',sign,measureVolume(candidate));}
let cavity=extrude(outer.clone().offset2D(1));
for(const wire of face.clone().innerWires()) {const a=extrude(wire.clone().offset2D(-1)),b=extrude(wire.clone().offset2D(1));const tool=measureVolume(a)>measureVolume(b)?a:b;cavity=cavity.cut(tool);}
let result=base.cut(cavity); for(const [label,x,y,z,solid] of [['outerwall',49.5,0,10,true],['outercavity',48.5,0,10,false],['floor',0,0,.4,true],['abovefloor',0,0,1.5,false],['bore',0,30,10,false],['borewall',8,30,10,true]]){const probe=drawCircle(.05).sketchOnPlane('XY',z).extrude(.1).translate([x,y,0]),v=measureVolume(result.intersect(probe));console.log('POINT',{label,v,solid});assert.ok(solid?v>0.0007:Math.abs(v)<1e-8)}let check=new oc.BRepCheck_Analyzer(result.wrapped,true,false);console.log('SHELL',{valid:check.IsValid_2(),volume:measureVolume(result)});check.delete();
const p=doc.features.at(-1).profile,tools=[p,...p.islands].map(tool);const {makeCompound}=await import('replicad');result=result.cut(makeCompound(tools.map(t=>t.clone())));
check=new oc.BRepCheck_Analyzer(result.wrapped,true,false);console.log('CUT',{valid:check.IsValid_2(),volume:measureVolume(result)});check.delete();for(const t of tools)console.log('OVERLAP',measureVolume(result.intersect(t)));
