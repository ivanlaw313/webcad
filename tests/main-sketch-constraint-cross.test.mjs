// REAL planegcs WASM; only Vite's asset URL is adapted for Node.
import { register } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,n){if(s.includes('?url'))return {url:'data:text/javascript,export default %22%22',shortCircuit:true};return n(s,c)}`))
const { solveFree, arcResample, circum3, setRefGeo } = await import('../src/sketch/freesolve.ts')
const p = (shape,idx=0) => ({kind:'pt',shape,idx})
const e = (shape,idx=0) => ({kind:'edge',shape,idx})
const c = shape => ({kind:'circle',shape})
const con = (id,type,a,b,axis) => ({id,kind:'con',type,a,b,...(axis?{c:axis}:{})})
const dim = (id,type,a,value,b) => ({id,kind:'dim',type,a,value,b})
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`)
const arc = (x=0) => {const a=[x+5,0],b=[x,5],m=[x+Math.sqrt(12.5),Math.sqrt(12.5)];return {type:'poly',open:true,arc:{a,b,m},pts:arcResample(a,b,m)}}
async function solved(shapes,cons,drag){const before=JSON.stringify(shapes);const r=await solveFree(shapes,cons,drag);assert.ok(r);assert.equal(r.conflict,false,JSON.stringify(r.conflictIds));assert.equal(JSON.stringify(shapes),before,'does not mutate caller geometry');return r.shapes}
for(const type of ['rad','dia']) test(`three-point arc ${type} drives radius then updates while retaining center coincidence`,async()=>{
 let shapes=[arc()];const cons=[con('k1','coincident',p(0,2),{kind:'origin'}),dim('k2',type,c(0),type==='rad'?8:16)]
 shapes=await solved(shapes,cons);near(circum3(shapes[0].arc.a,shapes[0].arc.m,shapes[0].arc.b).r,8)
 cons[1].value=type==='rad'?12:24;shapes=await solved(shapes,cons);const cc=circum3(shapes[0].arc.a,shapes[0].arc.m,shapes[0].arc.b);near(cc.r,12);near(cc.c[0],0);near(cc.c[1],0)
})
for(const pair of ['circle-arc','arc-circle','arc-arc']) test(`equal ${pair} follows upstream radius and tangent line`,async()=>{
 const circle={type:'circle',c:[20,5],r:5};let shapes=pair==='circle-arc'?[circle,arc()]:pair==='arc-circle'?[arc(),circle]:[arc(),arc(20)];shapes.push({type:'poly',open:true,pts:[[-30,0],[40,0]]})
 const cons=[dim('k1','rad',c(0),7),con('k2','equal',c(0),c(1)),con('k3','tangent',e(2),c(1)),con('k4','fix',e(2))]
 for(const radius of [7,9]){cons[0].value=radius;shapes=await solved(shapes,cons);for(const sh of shapes.slice(0,2)){const cc=sh.type==='circle'?sh:circum3(sh.arc.a,sh.arc.m,sh.arc.b);near(cc.r,radius)}const sh=shapes[1];const cc=sh.type==='circle'?sh:circum3(sh.arc.a,sh.arc.m,sh.arc.b);near(Math.abs(cc.c[1]),radius)}
})
for(const reverse of [false,true]) test(`collinear with projected reference works in selection order ${reverse}`,async()=>{
 setRefGeo({pts:[[0,3],[30,3]],segs:[[[0,3],[30,3]]]});try{let shapes=[{type:'poly',open:true,pts:[[2,6],[12,7]]}];const refs=[e(0),{kind:'refedge',idx:0}];if(reverse)refs.reverse();const cons=[con('k1','collinear',...refs),dim('k2','len',e(0),15)];shapes=await solved(shapes,cons);for(const q of shapes[0].pts)near(q[1],3);near(Math.abs(shapes[0].pts[1][0]-shapes[0].pts[0][0]),15)}finally{setRefGeo(null)}
})
test('symmetric circles + coincidence + dimension survives center drag and numeric update',async()=>{
 let shapes=[{type:'circle',c:[-10,4],r:3},{type:'circle',c:[10,4],r:3},{type:'poly',open:true,pts:[[0,-30],[0,30]]},{type:'circle',c:[-10,4],r:0,point:true}]
 const cons=[con('k1','fix',e(2)),con('k2','symmetric',c(0),c(1),e(2)),dim('k3','rad',c(0),5),con('k4','coincident',p(0),p(3))]
 shapes=await solved(shapes,cons,{ref:p(3),to:[-14,8]});near(shapes[0].c[0],-14);near(shapes[1].c[0],14);near(shapes[1].c[1],8);near(shapes[1].r,5)
 const saved=JSON.parse(JSON.stringify({shapes,cons}));cons[2].value=7;shapes=await solved(shapes,cons);near(shapes[1].r,7)
 const reopened=await solved(saved.shapes,saved.cons);near(reopened[1].r,5);near(reopened[1].c[0],14)
})
test('whole arc drag retains quarter-circle sweep even after translation across its previous center',async()=>{
 const initial=arc();const old=initial.arc
 const shapes=await solved([initial],[],{ref:c(0),ends:[[old.a[0]+20,old.a[1]+20],[old.b[0]+20,old.b[1]+20]]})
 near(shapes[0].arc.m[0],old.m[0]+20);near(shapes[0].arc.m[1],old.m[1]+20)
})
for(const clockwise of [false,true]) for(const major of [false,true]) test(`arc drag preserves ${clockwise?'CW':'CCW'} ${major?'major':'minor'} curve through forward/back translation`,async()=>{
 const a=[5,0],b=[0,5],q=Math.sqrt(12.5),m=major?[-q,-q]:[q,q];const source={type:'poly',open:true,arc:{a:clockwise?b:a,b:clockwise?a:b,m},pts:[]};source.pts=arcResample(source.arc.a,source.arc.b,m)
 let shapes=[source]
 for(const shift of [[20,20],[-40,-20],[20,0]]){const old=shapes[0];shapes=await solved(shapes,[],{ref:c(0),ends:[old.arc.a.map((v,i)=>v+shift[i]),old.arc.b.map((v,i)=>v+shift[i])]});near(shapes[0].arc.m[0],old.arc.m[0]+shift[0]);near(shapes[0].arc.m[1],old.arc.m[1]+shift[1]);near(circum3(shapes[0].arc.a,shapes[0].arc.m,shapes[0].arc.b).r,5)}
 near(shapes[0].arc.m[0],m[0]);near(shapes[0].arc.m[1],m[1])
})
test('horizontal + perpendicular + parallel + equal + midpoint chain follows length edit and point drag',async()=>{
 let shapes=[{type:'poly',open:true,pts:[[0,0],[10,0],[10,6]]},{type:'poly',open:true,pts:[[2,12],[12,12]]},{type:'circle',point:true,c:[5,0],r:0}]
 const cons=[con('k1','h',e(0)),con('k2','perp',e(0),e(0,1)),con('k3','parallel',e(0),e(1)),con('k4','equal',e(0),e(1)),con('k5','midpoint',p(2),e(0)),dim('k6','len',e(0),14)]
 for(const length of [14,20]){cons[5].value=length;shapes=await solved(shapes,cons,{ref:p(0),to:[3,4]});const [a,b,d]=shapes[0].pts;near(a[0],3);near(a[1],4);near(b[0],3+length);near(b[1],4);near(d[0],b[0]);near(shapes[2].c[0],3+length/2);near(shapes[2].c[1],4);const [u,v]=shapes[1].pts;near(u[1],v[1]);near(Math.abs(v[0]-u[0]),length)}
})
test('concentric circle pair + vertical centers + dimensions retain relation on radius update',async()=>{
 let shapes=[{type:'circle',c:[4,8],r:5},{type:'circle',c:[5,7],r:3}]
 const cons=[con('k1','concentric',c(0),c(1)),con('k2','v',p(0),{kind:'origin'}),dim('k3','rad',c(0),8),dim('k4','rad',c(1),3),dim('k5','vdist',{kind:'origin'},12,p(0))]
 shapes=await solved(shapes,cons);for(const sh of shapes){near(sh.c[0],0);near(sh.c[1],12)}near(shapes[0].r,8);near(shapes[1].r,3)
 cons[4].value=18;shapes=await solved(shapes,cons);for(const sh of shapes)near(sh.c[1],18)
})
test('arc rigid-drag seed never moves fixed endpoint or bypasses conflicting constraints',async()=>{
 const shapes=[arc()];const before=JSON.stringify(shapes);const result=await solveFree(shapes,[con('k1','fix',p(0))],{ref:c(0),ends:[[25,20],[20,25]]})
 assert.ok(result.conflict,'fixed start cannot translate');assert.equal(JSON.stringify(shapes),before);near(result.shapes[0].arc.a[0],5);near(result.shapes[0].arc.a[1],0)
})
