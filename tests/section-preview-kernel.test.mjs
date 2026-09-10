import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready()
const {importSTEP,measureVolume}=await import('replicad')
const base={id:'box',type:'extrude',profile:{kind:'rect',a:[0,0],b:[20,20]},height:20,operation:'new'}
const shell=thickness=>({id:'preview-shell',type:'shell',thickness,nears:[[10,10,20]]})
function volume(m){let v=0;const p=m.vertices,t=m.triangles;for(let i=0;i<t.length;i+=3){const a=t[i]*3,b=t[i+1]*3,c=t[i+2]*3;v+=(p[a]*(p[b+1]*p[c+2]-p[b+2]*p[c+1])+p[a+1]*(p[b+2]*p[c]-p[b]*p[c+2])+p[a+2]*(p[b]*p[c+1]-p[b+1]*p[c]))/6}return Math.abs(v)}
test('invalid preview feature cannot produce a successful cap of fallback solid',async()=>{
 await w.rebuild([base]);assert.equal(await w.splitBuild([base,shell(12)],'X',10),null);
 const source=await importSTEP(new Blob([await w.exportSTEP()]));assert.ok(Math.abs(measureVolume(source)-8000)<1e-5);
});
test('shell cap uses requested thickness and both halves preserve expected volume',async()=>{
 for(const thickness of [2,4]){const result=await w.splitBuild([base,shell(thickness)],'X',10);assert.ok(result);
 const expected=(8000-(20-2*thickness)**2*(20-thickness))/2;
 assert.ok(Math.abs(volume(result.a)-expected)<1e-5);assert.ok(Math.abs(volume(result.b)-expected)<1e-5);}
});
test('oblique preview section preserves shell volume without mutating committed body',async()=>{
 await w.rebuild([base]);const cap=await w.splitBuild([base,shell(2)],{origin:[10,10,10],normal:[1,1,0]});assert.ok(cap);
 assert.ok(Math.abs(volume(cap.a)-1696)<1e-5);assert.ok(Math.abs(volume(cap.b)-1696)<1e-5);
 const source=await importSTEP(new Blob([await w.exportSTEP()]));assert.ok(Math.abs(measureVolume(source)-8000)<1e-5);
});
test('section beyond model distinguishes empty half from failed calculation',async()=>{
 const cap=await w.splitBuild([base],'X',-10);assert.ok(cap,'a valid empty section is not an error');
 assert.equal(cap.a.triangles.length,0);assert.ok(Math.abs(volume(cap.b)-8000)<1e-5);
});
