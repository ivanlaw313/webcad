import test from 'node:test';import assert from 'node:assert/strict'
import {splineBezier} from '../src/sketch/splineBezier.ts'
import {catmullRomOpen,catmullRomClosed} from '../src/sketch/sketchOps.ts'
import {sampleBSpline} from '../src/cad/bspline2d.ts'
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`)
const evalB=(s,t)=>[0,1].map(k=>(1-t)**3*s[0][k]+3*t*(1-t)**2*s[1][k]+3*t*t*(1-t)*s[2][k]+t**3*s[3][k])
for(const bspline of [false,true])for(const closed of [false,true])for(const n of [3,4,6])test(`${bspline?'B-spline':'Catmull'} ${closed?'closed':'open'} ${n} controls exactly match actual sampler`,()=>{
 const ctrl=Array.from({length:n},(_,i)=>[10+13*Math.cos(i*2.4),20+7*Math.sin(i*1.7)]),snapshot=JSON.stringify(ctrl),seg=splineBezier(ctrl,bspline,closed)
 const samples=bspline?sampleBSpline(ctrl,{closed,samples:257}):(closed?catmullRomClosed(ctrl,17):catmullRomOpen(ctrl,17))
 samples.forEach((p,i)=>{const u=i*seg.length/(bspline?(closed?samples.length:samples.length-1):closed?samples.length:samples.length-1),j=Math.min(seg.length-1,Math.floor(u)),q=evalB(seg[j],u-j);p.forEach((v,k)=>near(v,q[k]))})
 for(let i=1;i<seg.length;i++)seg[i][0].forEach((v,k)=>near(v,seg[i-1][3][k]));if(closed)seg[0][0].forEach((v,k)=>near(v,seg.at(-1)[3][k]));assert.equal(JSON.stringify(ctrl),snapshot)
})
test('invalid spline controls reject without producing native geometry',()=>{for(const ctrl of [[],[[0,0],[1,1]],[[0,0],[1,1],[NaN,2]]])assert.throws(()=>splineBezier(ctrl,true,true))})
const {translateBoundProfile,faceProfileDelta}=await import('../src/cad/sketchFaceBinding.ts')
test('face-binding translation moves every exact cubic control including nested profiles, keeps input and no-op exact',()=>{const ctrl=[[10,10],[20,10],[20,20],[10,20]],cubics=splineBezier(ctrl,true,true);const child={kind:'poly',pts:ctrl,cubics};const profile={...child,holes:[child],islands:[child]},snapshot=JSON.stringify(profile);assert.equal(translateBoundProfile(profile,[0,0]),profile);for(const plane of ['XY','XZ','YZ']){const delta=faceProfileDelta(plane,[3,5,7]);const moved=translateBoundProfile(profile,delta);for(const [source,target] of [[profile,moved],[child,moved.holes[0]],[child,moved.islands[0]]]){source.cubics.forEach((seg,i)=>seg.forEach((p,j)=>p.forEach((v,k)=>near(target.cubics[i][j][k],v+delta[k]))));source.pts.forEach((p,i)=>p.forEach((v,k)=>near(target.pts[i][k],v+delta[k])))}assert.equal(JSON.stringify(profile),snapshot)}})
