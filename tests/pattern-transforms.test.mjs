import test from 'node:test'
import assert from 'node:assert/strict'
import {planRectPattern,planCircularPattern} from '../src/sketch/patternTransforms.ts'
import {register} from 'node:module'
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s.includes('?url'))return {url:'data:text/javascript,export default %22%22',shortCircuit:true};return n(s,c)}`))
const {buildCopyRelations,solveCopyCandidate}=await import('../src/sketch/copyRelations.ts')
import {ellipseSample} from '../src/sketch/ellipseGeometry.ts'
import {ellipseArcWithSweep,ellipseArcSample,ellipseArcSweep} from '../src/sketch/ellipseArcGeometry.ts'
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`)
test('rectangular transforms exclude original and use column then row order',()=>{
 assert.deepEqual(planRectPattern(3,-20,2,7),{ok:true,transforms:[[0,7],[-20,0],[-20,7],[-40,0],[-40,7]].map(([dx,dy])=>({dx,dy,angleDeg:0,cx:0,cy:0}))})
})
test('inactive spacing may be zero but is still required to be finite',()=>{
 assert.equal(planRectPattern(1,0,2,8).ok,true);assert.equal(planRectPattern(2,8,1,0).ok,true)
 for(const args of [[1,NaN,2,8],[2,8,1,Infinity],[2,0,1,0],[1,0,2,0],[1,0,1,0]])assert.equal(planRectPattern(...args).ok,false)})
test('counts reject rounding, clamping, missing and over-limit values',()=>{
 for(const n of [NaN,Infinity,-1,0,1.5,1001]){assert.equal(planRectPattern(n,1,1,0).ok,false);assert.equal(planCircularPattern(n,90,0,0).ok,false)}
 assert.equal(planRectPattern(32,1,32,1).ok,false);assert.equal(planRectPattern(25,1,40,1).transforms.length,999);assert.equal(planCircularPattern(1000,360,0,0).transforms.length,999)})
test('overflow and underflow never produce duplicate or non-finite transforms',()=>{
 assert.equal(planRectPattern(3,Number.MAX_VALUE,1,0).ok,false)
 assert.equal(planCircularPattern(1000,Number.MIN_VALUE,0,0).ok,false)})
for(const sign of [1,-1])test(`signed full turn ${sign} and partial span preserve direction`,()=>{
 assert.deepEqual(planCircularPattern(4,sign*360,20,30).transforms.map(t=>t.angleDeg),[sign*90,sign*180,sign*270])
 assert.deepEqual(planCircularPattern(4,sign*120,20,30).transforms.map(t=>t.angleDeg),[sign*40,sign*80,sign*120])})
test('circular invalid angle or center rejects explicitly',()=>{
 for(const a of [0,-0,360.01,-361,NaN,Infinity])assert.equal(planCircularPattern(3,a,0,0).ok,false)
 for(const c of [NaN,Infinity,-Infinity])assert.equal(planCircularPattern(3,90,c,0).ok,false)
 assert.equal(planCircularPattern(1,90,0,0).ok,false)})
test('actual copy planner preserves original source indices and internal dimensions for rectangular pattern',async()=>{
 const shapes=[{type:'circle',c:[0,0],r:5},{type:'circle',c:[100,0],r:9}],cons=[{id:'radius',kind:'dim',type:'rad',a:{kind:'circle',shape:0},name:'R',value:5}]
 const before=JSON.stringify({shapes,cons}),t=planRectPattern(2,20,2,30),p=buildCopyRelations(shapes,cons,[0],t.transforms,'pattern')
 assert.equal(p.ok,true);assert.equal(p.shapes[0],shapes[0]);assert.equal(p.shapes[1],shapes[1]);assert.equal(p.cons[0],cons[0]);assert.deepEqual(p.shapes.slice(2).map(s=>s.c),[[0,30],[20,0],[20,30]])
 assert.deepEqual(p.cons.map(c=>c.a.shape),[0,2,3,4]);assert.equal(new Set(p.cons.map(c=>c.id)).size,4)
 assert.equal((await solveCopyCandidate(shapes,p)).ok,true);assert.equal(JSON.stringify({shapes,cons}),before)})
test('actual circular copy preserves analytical signed arc and ellipse, with independent coordinate oracle',async()=>{
 const ell={cx:20,cy:30,rx:5,ry:2,rot:30},earc=ellipseArcWithSweep(ell,330,-270)
 const shapes=[{type:'poly',ell,pts:ellipseSample(ell),construction:true},{type:'poly',earc,pts:ellipseArcSample(earc),open:true}]
 const t=planCircularPattern(4,-360,10,10),p=buildCopyRelations(shapes,[],[0,1],t.transforms,'circular')
 assert.equal(p.ok,true);assert.equal(p.shapes[0],shapes[0]);assert.equal(p.shapes[1],shapes[1])
 const centers=[[30,0],[0,-10],[-10,20]]
 for(let i=0;i<3;i++){
  const e=p.shapes[2+i*2],a=p.shapes[3+i*2];near(e.ell.cx,centers[i][0]);near(e.ell.cy,centers[i][1]);near(e.ell.rot,30-90*(i+1));assert.equal(e.construction,true);assert.equal(a.open,true);near(ellipseArcSweep(a.earc),-270)
  const theta=-(i+1)*Math.PI/2
  for(let k=0;k<a.pts.length;k++){const [x,y]=shapes[1].pts[k];near(a.pts[k][0],10+(x-10)*Math.cos(theta)-(y-10)*Math.sin(theta));near(a.pts[k][1],10+(x-10)*Math.sin(theta)+(y-10)*Math.cos(theta))}
 }
 assert.equal((await solveCopyCandidate(shapes,p)).ok,true)
})
