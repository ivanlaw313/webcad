import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import fs from 'node:fs'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready()
const {importSTEP,measureVolume,getOC,draw,drawCircle}=await import('replicad')
const doc=JSON.parse(fs.readFileSync(new URL('./fixtures/user-shell-multi-cut.json',import.meta.url),'utf8'))
const shape=async()=>importSTEP(new Blob([await w.exportSTEP()]))
const tool=p=>{const pts=p.kind==='rect'?[p.a,[p.b[0],p.a[1]],p.b,[p.a[0],p.b[1]]]:p.pts;let pen=draw().movePointerTo(pts[0]);for(const v of pts.slice(1))pen=pen.lineTo(v);return pen.close().sketchOnPlane('XZ',-150).extrude(300)}
test('user shelled eleven-bore cylinder: all five transverse cut profiles clear all encountered walls',async()=>{
 const prefixValidity=[]; for (const n of [2,4,5]) { const prefix=await w.rebuild(doc.features.slice(0,n));const solid=await shape(),check=new(getOC().BRepCheck_Analyzer)(solid.wrapped,true,false);console.log('PREFIX',n,{failed:prefix.failed,valid:check.IsValid_2(),volume:measureVolume(solid)});prefixValidity.push(check.IsValid_2());check.delete() }
 let m=await w.rebuild(doc.features.slice(0,-1));assert.deepEqual(m.failed??[],[]);const before=await shape();console.log('shell volume',measureVolume(before));const wallProbes=[];for(const [label,x,y,z,solid] of [['outerwall',49.5,0,10,true],['outercavity',48.5,0,10,false],['floor',0,0,.4,true],['abovefloor',0,0,1.5,false],['bore',0,30,10,false],['borewall',8,30,10,true]]){const probe=drawCircle(.05).sketchOnPlane('XY',z).extrude(.1).translate([x,y,0]),v=measureVolume(before.intersect(probe));wallProbes.push({label,v,solid})}
 m=await w.rebuild(doc.features);assert.deepEqual(m.failed??[],[]);const after=await shape();console.log('cut volume',measureVolume(after));const oc=getOC(),valid=new oc.BRepCheck_Analyzer(after.wrapped,true,false);const isValid=valid.IsValid_2();console.log({isValid});valid.delete()
 const p=doc.features.at(-1).profile,remaining=[]
 for(const profile of [p,...p.islands]) {const cutter=tool(profile),beforeOverlap=measureVolume(before.intersect(cutter)),afterOverlap=measureVolume(after.intersect(cutter));remaining.push(afterOverlap);console.log(JSON.stringify({beforeOverlap,afterOverlap}));assert.ok(beforeOverlap>1)}
 for(const {label,v,solid} of wallProbes)assert.ok(solid?Math.abs(v-Math.PI*.05*.05*.1)<1e-8:Math.abs(v)<1e-8,`${label}: ${v}`);assert.ok(prefixValidity.every(Boolean),'each prefix, including shell, must export a valid BRep');assert.ok(isValid,"exported result must be valid BRep");assert.ok(remaining.every(v=>Math.abs(v)<1e-5),`cut profiles leave material: ${remaining}`)
})
