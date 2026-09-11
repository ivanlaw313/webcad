import test from 'node:test'
import assert from 'node:assert/strict'
import {revolvePointToCad,revolveFrame,revolveLathePlane,revolveRemapProfileUv} from '../src/cad/revolvePreviewFrame.ts'
for(const [plane,raw,profile,expected] of [
 ['XY',[4,2],[4,-2],[4,-2,10]],['XZ',[4,2],[4,2],[4,10,2]],['YZ',[4,2],[-4,2],[10,-4,2]],
])test(`${plane} face preview and saved feature place the same contour in CAD`,()=>{
 const source={plane,baseZ:10,faceBinding:{}};assert.deepEqual(revolvePointToCad(raw,source,true),expected);assert.deepEqual(revolvePointToCad(profile,source,false),expected)
 const origin=revolveFrame(source).o;const relative=expected.map((v,i)=>v-origin[i]);assert.equal(Math.hypot(...relative),Math.sqrt(20))
})
test('oblique face sketch line axis uses the authored basis and offset',()=>{
 const source={arb:{o:[3,4,5],xd:[0,1,0],n:[Math.SQRT1_2,0,Math.SQRT1_2]}}
 const a=revolvePointToCad([0,0],source,true),b=revolvePointToCad([10,0],source,true)
 assert.deepEqual(a,[3,4,5]);assert.deepEqual(b,[3,14,5]);assert.deepEqual(b.map((v,i)=>v-a[i]),[0,10,0])
 const c=revolvePointToCad([0,2],source,true);assert.ok(Math.abs(c[0]-(3-Math.SQRT2))<1e-12);assert.ok(Math.abs(c[2]-(5+Math.SQRT2))<1e-12)
 assert.deepEqual(revolvePointToCad([0,2],{arbPlane:source.arb},false),c)
})

test('legacy XZ saved revolve preview retains named-plane offset convention',()=>{assert.deepEqual(revolvePointToCad([4,2],{plane:'XZ',baseZ:10},false),[4,-10,2])})

test('revolveLathePlane remaps planar cardinal combos (BUG-SO16-001)',()=>{
 assert.equal(revolveLathePlane('XZ',[0,1,0]),'XY')
 assert.equal(revolveLathePlane('YZ',[1,0,0]),'XY')
 assert.equal(revolveLathePlane('XY',[0,0,1]),'XZ')
 assert.equal(revolveLathePlane('XY',[0,1,0]),'XY')
 assert.equal(revolveLathePlane('XZ',[1,0,0]),'XZ')
})
test('XZ about Y: raw sketch and saved feature land on the same remapped CAD point',()=>{
 const src={plane:'XZ',baseZ:0}
 const axis=[0,1,0]
 assert.deepEqual(revolvePointToCad([8,-10],src,true,axis),[8,10,0])
 assert.deepEqual(revolvePointToCad([8,-10],src,false,axis),[8,10,0])
 assert.deepEqual(revolveRemapProfileUv([8,-10],'XZ','XY'),[8,10])
})
