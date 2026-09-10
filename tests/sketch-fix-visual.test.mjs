import test from 'node:test'
import assert from 'node:assert/strict'
import {fixesWholeShape,sketchGeometryVisible} from '../src/components/sketchFixVisual.ts'
const ref=kind=>({kind,shape:0,idx:0})
test('partial point and edge Fix do not claim whole polyline or rectangle fixed',()=>{
 for(const shape of [{type:'rect',a:[0,0],b:[5,5]},{type:'poly',open:true,pts:[[0,0],[5,0],[5,5]]}])for(const kind of ['pt','edge'])assert.equal(fixesWholeShape(shape,ref(kind)),false)
})
test('circle center Fix differs from full circle and standalone point Fix',()=>{
 const circle={type:'circle',c:[0,0],r:4}
 assert.equal(fixesWholeShape(circle,ref('pt')),false)
 assert.equal(fixesWholeShape(circle,ref('circle')),true)
 assert.equal(fixesWholeShape({...circle,point:true,r:0},ref('pt')),true)
})
test('single edge, whole ellipse and whole arc retain entity-level Fix',()=>{
 assert.equal(fixesWholeShape({type:'poly',open:true,pts:[[0,0],[5,0]]},ref('edge')),true)
 assert.equal(fixesWholeShape({type:'poly',pts:[],ell:{}},ref('ellipse')),true)
 assert.equal(fixesWholeShape({type:'poly',pts:[],ell:{}},ref('pt')),false)
 assert.equal(fixesWholeShape({type:'poly',pts:[],earc:{}},ref('ellipse-arc')),true)
 assert.equal(fixesWholeShape({type:'poly',pts:[],arc:{}},ref('circle')),true)
})

test('Fix overlays and glyphs follow construction visibility',()=>{
 const hidden={points:true,constr:false},shown={points:true,constr:true}
 for(const shape of [{type:'rect',a:[0,0],b:[5,5],construction:true},{type:'poly',pts:[[0,0],[1,0]],open:true,centerline:true}]){
  assert.equal(sketchGeometryVisible(shape,hidden),false)
  assert.equal(sketchGeometryVisible(shape,shown),true)
 }
})
test('standalone points follow point toggle independently of construction',()=>{
 const point={type:'circle',c:[0,0],r:0,point:true,construction:true}
 assert.equal(sketchGeometryVisible(point,{points:false,constr:true}),false)
 assert.equal(sketchGeometryVisible(point,{points:true,constr:false}),true)
})
test('ordinary and projected nonconstruction geometry remain visible',()=>{
 const view={points:false,constr:false}
 assert.equal(sketchGeometryVisible({type:'circle',c:[0,0],r:3},view),true)
 assert.equal(sketchGeometryVisible({type:'poly',pts:[[0,0],[1,0]],projected:true,centerline:true},view),true)
 assert.equal(sketchGeometryVisible({type:'poly',pts:[[0,0],[1,0]],projected:true,construction:true},view),false)
})
