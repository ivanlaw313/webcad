import test from 'node:test';import assert from 'node:assert/strict'
import { makeOpenPatchCage, makeFormPipeCage, insertEdgeLoop, ccSubdivide, quadsToTris } from '../src/cad/subdiv.ts'
function edges(m){const e=new Map();for(const q of m.quads)for(let i=0;i<4;i++){const key=[q[i],q[(i+1)%4]].sort((a,b)=>a-b).join('_');e.set(key,(e.get(key)||0)+1)}return e}
for(const slot of [0,1])test(`open patch inserts an entire strip in direction ${slot}, with no cracks or sealed boundaries`,()=>{
 const m=makeOpenPatchCage(60,40,4,4);const out=insertEdgeLoop(m,5,slot);assert.ok(out);assert.equal(out.quads.length,20);assert.equal(out.verts.length,30);assert.equal([...edges(out).values()].filter(n=>n===1).length,18);assert.ok([...edges(out).values()].every(n=>n===1||n===2));assert.ok(out.verts.every(p=>Math.abs(p[2])<1e-9));
 const next=insertEdgeLoop(out,5,1-slot);assert.ok(next);const mesh=quadsToTris(ccSubdivide(next,2));assert.ok(mesh.triangles.length);assert.ok(mesh.vertices.every(Number.isFinite));
});
test('pipe can add a boundary-to-boundary longitudinal strip and a circumferential loop',()=>{
 const m=makeFormPipeCage([[0,0,0],[20,0,0],[30,10,0]],4,6);
 for(const slot of [0,1]){const out=insertEdgeLoop(m,0,slot);assert.ok(out);assert.ok(out.quads.length>m.quads.length);assert.ok([...edges(out).values()].some(n=>n===1));assert.ok([...edges(out).values()].every(n=>n<=2))}
});
test('invalid direction and non-manifold input leave the source unchanged',()=>{
 const m=makeOpenPatchCage(20,20,2,2),before=JSON.stringify(m);assert.equal(insertEdgeLoop(m,0,4),null);assert.equal(insertEdgeLoop({...m,quads:[...m.quads,m.quads[0],m.quads[0]]},0,0),null);assert.equal(JSON.stringify(m),before)
});
