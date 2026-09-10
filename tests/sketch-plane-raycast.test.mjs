import test from 'node:test'
import assert from 'node:assert/strict'
import {Raycaster,Vector3,Mesh} from 'three'
import {sketchPlaneRaycast} from '../src/sketch/sketchPlaneRaycast.ts'
function cast(frame,origin,direction,near=0,far=Infinity){const mesh=new Mesh(),ray=new Raycaster(new Vector3(...origin),new Vector3(...direction).normalize(),near,far),hits=[];sketchPlaneRaycast(...frame).call(mesh,ray,hits);for(const h of hits)assert.equal(h.object,mesh);return hits}
test('input plane reaches farorigin without translating geometry',()=>{const f=[[0,0,0],[1,0,0],[0,0,1]],h=cast(f,[1e6,500,-7e5],[0,-1,0]);assert.equal(h.length,1);assert.deepEqual(h[0].point.toArray(),[1e6,0,-7e5]);assert.equal(h[0].distance,500)})
test('cardinal and arbitrary plane preserve true world intersection',()=>{for(const f of [[[0,0,0],[1,0,0],[0,1,0]],[[0,0,0],[0,1,0],[0,0,1]],[[4,5,6],[5,5,7],[4,6,6]]]){const o=new Vector3(...f[0]),u=new Vector3(...f[1]).sub(o),v=new Vector3(...f[2]).sub(o),n=u.clone().cross(v).normalize(),p=o.clone().addScaledVector(u,1e6).addScaledVector(v,-7e5),h=cast(f,p.clone().addScaledVector(n,100).toArray(),n.clone().negate().toArray());assert.equal(h.length,1);assert.ok(h[0].point.distanceTo(p)<1e-8)}})
test('ray rejects parallel behind camera and near/far clipped intersections',()=>{const f=[[0,0,0],[1,0,0],[0,0,1]];for(const [d,n,z] of [[[1,0,0],0,1000],[[0,1,0],0,1000],[[0,-1,0],501,1000],[[0,-1,0],0,499]])assert.equal(cast(f,[1e6,500,-7e5],d,n,z).length,0)})
