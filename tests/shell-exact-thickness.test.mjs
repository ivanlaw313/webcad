import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import fs from 'node:fs'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready()
const {importSTEP,measureVolume,getOC,draw,drawCircle}=await import('replicad')
const base={id:'box',type:'extrude',profile:{kind:'rect',a:[0,0],b:[20,20]},height:20,operation:'new'}
test('impossible inward shell refuses rather than silently thinning and preserves source',async()=>{
 const m=await w.rebuild([base,{id:'shell',type:'shell',thickness:12,nears:[[10,10,20]]}]);
 const result=await importSTEP(new Blob([await w.exportSTEP()]));
 console.log({failed:m.failed,volume:measureVolume(result),warnings:m.warnings});
 assert.ok(m.failed?.some(f=>f.id==='shell'),'requested12mm cannot be replaced by thinner walls');
 assert.ok(Math.abs(measureVolume(result)-8000)<1e-5,'failed shell retains original solid');
})

test('valid shell preserves exact two millimetre walls and recovers after rejected edit',async()=>{
 const m=await w.rebuild([base,{id:'shell',type:'shell',thickness:2,nears:[[10,10,20]]}]);
 assert.deepEqual(m.failed??[],[]);
 const result=await importSTEP(new Blob([await w.exportSTEP()]));
 assert.ok(Math.abs(measureVolume(result)-(8000-16*16*18))<1e-5);
 const check=new (getOC().BRepCheck_Analyzer)(result.wrapped,true,false);
 assert.equal(check.IsValid_2(),true);check.delete();
})

test('shell previews change geometry without changing committed STEP and failed previews recover',async()=>{
 await w.rebuild([base]);
 const committed=async()=>measureVolume(await importSTEP(new Blob([await w.exportSTEP()])));
 const preview=async(thickness)=>w.previewRound([base,{id:'~pv-shell',type:'shell',thickness,nears:[[10,10,20]]}]);
 const two=await preview(2);assert.deepEqual(two.failed??[],[]);assert.ok(two.triangles.length>0);
 assert.ok(Math.abs(await committed()-8000)<1e-5);
 const four=await preview(4);assert.deepEqual(four.failed??[],[]);
 assert.notDeepEqual(four.vertices,two.vertices,'numeric changes produce different geometry');
 const bad=await preview(12);assert.ok(bad.failed?.some(f=>f.id==='~pv-shell'));
 assert.ok(Math.abs(await committed()-8000)<1e-5);
 const recovered=await preview(2);assert.deepEqual(recovered.failed??[],[]);
 assert.deepEqual(recovered.vertices,two.vertices);
 assert.ok(Math.abs(await committed()-8000)<1e-5);
})

test('preview of user multi-bore shell preserves pre-shell solid and matches committed geometry',async()=>{
 const doc=JSON.parse(fs.readFileSync(new URL('./fixtures/user-shell-multi-cut.json',import.meta.url),'utf8'));
 const source=doc.features.slice(0,4),shell=doc.features[4];
 await w.rebuild(source);
 const volume=async()=>measureVolume(await importSTEP(new Blob([await w.exportSTEP()])));
 const before=await volume();
 const preview=await w.previewRound([...source,{...shell,id:'~pv-shell'}]);
 assert.deepEqual(preview.failed??[],[]);assert.ok(preview.triangles.length>0);
 assert.ok(Math.abs(await volume()-before)<1e-5,'preview cannot export its temporary cavity as committed body');
 const committed=await w.rebuild([...source,shell]);assert.deepEqual(committed.failed??[],[]);
 assert.deepEqual(preview.vertices,committed.vertices,'preview must show the geometry later committed');
 assert.deepEqual(preview.triangles,committed.triangles);
 assert.ok(Math.abs(await volume()-91314.0797594)<1e-4);
})

for(const tangentChain of [false,true])test(`both-side shell keeps selected opening with tangent chain ${tangentChain}`,async()=>{
 const m=await w.rebuild([base,{id:'both',type:'shell',thickness:2,direction:'both',tangentChain,nears:[[10,10,20]]}]);
 assert.deepEqual(m.failed??[],[]);
 const result=await importSTEP(new Blob([await w.exportSTEP()]));
 const bounds=result.boundingBox.bounds;
 assert.ok(Math.abs(measureVolume(result)-(22*22*22-18*18*20))<1e-5,'both-side exact 2 mm walls and base');
 assert.ok(Math.abs(bounds[0][0]+1)<.01&&Math.abs(bounds[1][0]-21)<.01,'both walls extend one millimetre outwards');
 const opening=drawCircle(.1).sketchOnPlane('XY',19.5).extrude(3).translate([10,10,0]);
 assert.ok(Math.abs(measureVolume(result.intersect(opening)))<1e-7,'selected top must be open');
})
