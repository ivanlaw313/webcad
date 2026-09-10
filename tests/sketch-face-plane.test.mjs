import test from 'node:test';import assert from 'node:assert/strict';import {sketchFacePlane} from '../src/geom/sketchFacePlane.ts'
test('a fractional face retains exact offset and an inclined face retains its normal',()=>{
 for(const angle of [0,1,4,8]){const a=angle*Math.PI/180;const lift=([x,y])=>[x*Math.cos(a)+10.4*Math.sin(a),y,-x*Math.sin(a)+10.4*Math.cos(a)];const tris=[[0,0],[20,0],[20,20],[0,0],[20,20],[0,20]].flatMap(lift);const p=sketchFacePlane(tris);assert.ok(p);assert.ok(Math.abs(p.n[0]-Math.sin(a))<1e-12);assert.ok(Math.abs(p.n[2]-Math.cos(a))<1e-12);assert.ok(Math.abs(p.p[0]*p.n[0]+p.p[2]*p.n[2]-10.4)<1e-12)}
});
test('a curved or malformed CAD face never becomes a planar sketch by fitting one triangle',()=>{
 assert.equal(sketchFacePlane([0,0,0,10,0,0,10,10,.05,0,0,0,10,10,.05,0,10,0]),null);assert.equal(sketchFacePlane([0,0,0,0,0,0,0,0,0]),null);assert.equal(sketchFacePlane([NaN,0,0,10,0,0,10,10,0]),null)
});
