import test from 'node:test'
import assert from 'node:assert/strict'
import {getProjectRelinkCandidates,prepareProjectRelink,refreshSafeProjectLinks} from '../src/sketch/projectLinks.ts'
const square=(x=0)=>[[x,0],[x+10,0],[x+10,10],[x,10]]
const source=(loops)=>({segs:loops.flatMap(pts=>pts.map((p,i)=>[p,pts[(i+1)%pts.length]]))})
const old=()=>({type:'poly',pts:square(),projected:true,projectLink:'all',construction:true,centerline:true,projectLinkIssue:'missing-source'})
test('candidate geometry identity survives source enumeration, direction and starting vertex changes',()=>{
 const a=source([square(20),square(50)]),b={segs:[...a.segs].reverse().map(([a,b])=>[b,a])}
 assert.deepEqual(getProjectRelinkCandidates(old(),a).map(c=>c.id),getProjectRelinkCandidates(old(),b).map(c=>c.id))
})
test('explicit chosen replacement aligns old vertex and edge indices and retains semantic flags',()=>{
 const candidates=getProjectRelinkCandidates(old(),source([square(20),square(50)])),chosen=candidates.find(c=>Math.min(...c.points.map(p=>p[0]))===50)
 const result=prepareProjectRelink(old(),chosen);assert.equal(result.ok,true);assert.deepEqual(result.shape.pts,square(50));assert.equal(result.shape.construction,true);assert.equal(result.shape.centerline,true);assert.equal(result.shape.projectLinkIssue,undefined);assert.deepEqual(result.shape.projectLinkSource.points,square(50))
})
test('chosen source persists through JSON and refresh among extra chains without relinking by index',()=>{
 const ref=source([square(20),square(50)]),chosen=getProjectRelinkCandidates(old(),ref).find(c=>c.points.some(p=>p[0]===50)),mapped=prepareProjectRelink(old(),chosen).shape
 const loaded=JSON.parse(JSON.stringify(mapped)),reordered={segs:[...source([square(90),square(50),square(20)]).segs].reverse().map(([a,b])=>[b,a])}
 const r=refreshSafeProjectLinks([loaded],reordered,[{a:{kind:'pt',shape:0,idx:1}}]);assert.equal(r.held,0);assert.equal(r.refreshed,1);assert.deepEqual(r.shapes[0].pts,square(50));assert.deepEqual(r.shapes[0].projectLinkSource,loaded.projectLinkSource)
})
test('missing chosen source among several alternatives holds original points and references',()=>{
 const mapped=prepareProjectRelink(old(),getProjectRelinkCandidates(old(),source([square(50)]))[0]).shape
 const r=refreshSafeProjectLinks([mapped],source([square(20),square(80)]),[]);assert.equal(r.held,1);assert.equal(r.reason,'ambiguous-source');assert.deepEqual(r.shapes[0].pts,mapped.pts)
})
test('topology changes, stale analytic metadata and tied vertex mapping are rejected',()=>{
 const candidate=getProjectRelinkCandidates(old(),source([[[0,0],[10,0],[5,5]]]))[0];assert.equal(prepareProjectRelink(old(),candidate).reason,'topology')
 const stale={...old(),arc:{a:[0,0],b:[10,0],m:[5,5]}};assert.equal(prepareProjectRelink(stale,{...candidate,points:square()}).reason,'modified-geometry')
 const line={type:'poly',pts:[[-1,0],[1,0]],open:true};const tied={id:'x',points:[[0,-1],[0,1]],open:true,compatible:true,label:'perpendicular'};assert.equal(prepareProjectRelink(line,tied).reason,'ambiguous-source')
})
test('geometry edited after selection is held; constrained changed source is never automatically moved',()=>{
 const mapped=prepareProjectRelink(old(),getProjectRelinkCandidates(old(),source([square(50)]))[0]).shape
 let r=refreshSafeProjectLinks([{...mapped,pts:square(52)}],source([square(50)]),[]);assert.equal(r.reason,'modified-geometry')
 r=refreshSafeProjectLinks([mapped],source([square(55)]),[{a:{kind:'edge',shape:0,idx:2}}]);assert.equal(r.reason,'constraints');assert.deepEqual(r.shapes[0].pts,mapped.pts)
})
