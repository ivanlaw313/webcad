import {frameDirection} from './orientedConstraints'
import {bulgeRadius} from './sketchOps'
import {refPts,refValid,circum3,type FShape,type SkRef,type SkCon} from './freesolve'
export type PointAnchor={x?:number;y?:number}
const key=(r:SkRef)=>`${r.kind}:${'shape'in r?r.shape:''}:${'idx'in r?r.idx:''}`
export function validConstraintEdge(shapes:FShape[],r:SkRef):boolean {
 if(r.kind!=='edge'||!Number.isInteger(r.idx)||r.idx<0)return false
 const sh=shapes[r.shape];if(!sh)return false
 if(sh.type==='rect')return r.idx<4
 if(sh.type!=='poly'||sh.smooth)return false
 if(sh.arc)return r.idx===0
 const n=(sh.verts??sh.pts).length;return r.idx<(sh.open?n-1:n)
}
/** Only independent, finite evidence anchors a graph component. Relations alone
 * never fix an otherwise free coincident cycle. Inputs use evaluated dimensions. */
export function resolveConstraintAnchors(shapes:FShape[],cons:SkCon[]){
 const refs=new Map<string,SkRef>(),links:[string,string,number][]=[ ],values=new Map<string,number>(),bad=new Set<string>()
 const add=(r:SkRef|undefined):string|undefined=>{if(!r||!refValid(shapes,r)||!['pt','center','origin','refpt'].includes(r.kind))return;const k=key(r);refs.set(k,r);return k}
 add({kind:'origin'})
 for(const c of cons){add(c.a);add(c.b);if('c'in c)add(c.c)}
 const set=(k:string,v:number)=>{if(!Number.isFinite(v))return;if(values.has(k)&&Math.abs(values.get(k)!-v)>1e-6)bad.add(k);else values.set(k,v)}
 const pair=(a:SkRef,b:SkRef,axis:number,offset=0)=>{const ka=add(a),kb=add(b);if(ka&&kb)links.push([`${ka}/${axis}`,`${kb}/${axis}`,offset])}
 for(const [k,r]of refs)if(r.kind==='origin'||r.kind==='refpt'){const p=refPts(shapes,r)[0];set(`${k}/0`,p[0]);set(`${k}/1`,p[1])}
 const fix=(r:SkRef)=>{const k=add(r);if(k){const p=refPts(shapes,r)[0];set(`${k}/0`,p[0]);set(`${k}/1`,p[1])}}
 const edgePoints=(r:SkRef):SkRef[]=>{if(!validConstraintEdge(shapes,r)||r.kind!=='edge')return[];const sh=shapes[r.shape];if(!sh)return[];if(sh.type==='poly'&&sh.arc)return[{kind:'pt',shape:r.shape,idx:0},{kind:'pt',shape:r.shape,idx:1}];const n=sh.type==='rect'?4:sh.type==='poly'?(sh.verts??sh.pts).length:0;return n?[{kind:'pt',shape:r.shape,idx:r.idx},{kind:'pt',shape:r.shape,idx:(r.idx+1)%n}]:[]}
 for(const c of cons){
  if(c.kind==='con'&&c.type==='fix'){
   if(c.a.kind==='edge')edgePoints(c.a).forEach(fix)
   else if(c.a.kind==='circle'){const sh=shapes[c.a.shape];if(sh?.type==='circle')fix({kind:'pt',shape:c.a.shape,idx:0});else if(sh?.type==='poly'&&sh.arc){fix({kind:'center',shape:c.a.shape,idx:0});fix({kind:'pt',shape:c.a.shape,idx:0});fix({kind:'pt',shape:c.a.shape,idx:1})}}
   else fix(c.a)
  }
  if(c.kind==='con'&&c.type==='coincident'&&c.b){pair(c.a,c.b,0);pair(c.a,c.b,1)}
  if(c.frameAngleDeg===undefined&&c.kind==='con'&&(c.type==='h'||c.type==='v')){const ps=c.b?[c.a,c.b]:edgePoints(c.a);if(ps.length===2)pair(ps[0],ps[1],c.type==='h'?1:0)}
  if(c.frameAngleDeg===undefined&&c.kind==='dim'&&!c.driven&&(c.type==='hdist'||c.type==='vdist')&&c.b){const ka=add(c.a),kb=add(c.b);if(!ka||!kb)continue;const axis=c.type==='hdist'?0:1,delta=refPts(shapes,c.b)[0][axis]-refPts(shapes,c.a)[0][axis];if(c.value===0)pair(c.a,c.b,axis);else if(Math.abs(delta)>1e-8)pair(c.a,c.b,axis,Math.sign(delta)*Math.abs(c.value))}
 }
 // Standalone arc pt2 and true-center names refer to the same geometric point.
 for(const r of [...refs.values()])if(r.kind==='pt'&&r.idx===2&&shapes[r.shape]?.type==='poly'&&(shapes[r.shape] as {arc?:unknown}).arc){pair(r,{kind:'center',shape:r.shape,idx:0},0);pair(r,{kind:'center',shape:r.shape,idx:0},1)}
 for(let pass=0;pass<=links.length;pass++){let changed=false;const badBefore=bad.size;for(const[a,b,off]of links){if(bad.has(a)||bad.has(b)){changed ||=!bad.has(a)||!bad.has(b);bad.add(a);bad.add(b);continue}if(values.has(a)){const old=values.get(b);set(b,values.get(a)!+off);changed ||=old===undefined}else if(values.has(b)){set(a,values.get(b)!-off);changed=true}}if(!changed&&bad.size===badBefore)break}
 const radiusKey=(r:SkRef):string|undefined=>{if(!('shape'in r))return;const sh=shapes[r.shape];if(r.kind==='circle'&&(sh?.type==='circle'&&!sh.point||sh?.type==='poly'&&sh.arc))return`circle:${r.shape}`;if(r.kind==='edge'&&validConstraintEdge(shapes,r)&&sh?.type==='poly'&&sh.verts&&Math.abs(sh.bulges?.[r.idx]??0)>1e-12)return`arc:${r.shape}:${r.idx}`}
 const radii=new Map<string,number>(),radiusLinks:[string,string][]=[],radiusBad=new Set<string>()
 for(const c of cons){const a=radiusKey(c.a);if(!a)continue;if(c.kind==='con'&&c.type==='fix'&&'shape'in c.a){const sh=shapes[c.a.shape];const v=sh.type==='circle'?sh.r:sh.type==='poly'&&sh.arc?circum3(sh.arc.a,sh.arc.m,sh.arc.b)?.r:sh.type==='poly'&&sh.verts&&sh.bulges&&c.a.kind==='edge'?bulgeRadius(sh.verts[c.a.idx],sh.verts[(c.a.idx+1)%sh.verts.length],sh.bulges[c.a.idx]):undefined;if(v!==undefined&&v>0){if(radii.has(a)&&Math.abs(radii.get(a)!-v)>1e-6)radiusBad.add(a);else radii.set(a,v)}}if(c.kind==='dim'&&!c.driven&&(c.type==='rad'||c.type==='dia')&&c.value>0){const v=c.type==='dia'?c.value/2:c.value;if(radii.has(a)&&Math.abs(radii.get(a)!-v)>1e-6)radiusBad.add(a);else radii.set(a,v)}if(c.kind==='con'&&c.type==='equal'&&c.b){const b=radiusKey(c.b);if(b)radiusLinks.push([a,b])}}
 for(let pass=0;pass<=radiusLinks.length;pass++){let changed=false;const badBefore=radiusBad.size;for(const[a,b]of radiusLinks){if(radiusBad.has(a)||radiusBad.has(b)){changed ||=!radiusBad.has(a)||!radiusBad.has(b);radiusBad.add(a);radiusBad.add(b);continue}if(radii.has(a)&&radii.has(b)&&Math.abs(radii.get(a)!-radii.get(b)!)>1e-6){radiusBad.add(a);radiusBad.add(b)}else if(radii.has(a)&&!radii.has(b)){radii.set(b,radii.get(a)!);changed=true}else if(radii.has(b)&&!radii.has(a)){radii.set(a,radii.get(b)!);changed=true}}if(!changed&&radiusBad.size===badBefore)break}
 return {point:(r:SkRef):PointAnchor=>{const k=key(r);return {...(!bad.has(`${k}/0`)&&values.has(`${k}/0`)?{x:values.get(`${k}/0`)}:{}),...(!bad.has(`${k}/1`)&&values.has(`${k}/1`)?{y:values.get(`${k}/1`)}:{})}},radius:(r:SkRef)=>{const k=radiusKey(r);return k&&!radiusBad.has(k)?radii.get(k):undefined}}
}

export type ProjectionAnchor={normal:[number,number];value:number}
/** Anchored projections in persisted rotated frames; never relabel them as world X/Y. */
export function resolvePointProjectionAnchors(shapes:FShape[],cons:SkCon[]):(r:SkRef)=>ProjectionAnchor[]{
 const world=resolveConstraintAnchors(shapes,cons),groups=new Map<string,{normal:[number,number];links:[SkRef,SkRef,number][]}>(),refMap=new Map<string,SkRef>()
 const add=(r:SkRef)=>{refMap.set(key(r),r)}
 for(const c of cons){add(c.a);if(c.b)add(c.b)}
 for(const c of cons){if(c.frameAngleDeg===undefined||!Number.isFinite(c.frameAngleDeg))continue;let pair:SkRef[]=[];let offset=0;let normal:[number,number]
   if(c.kind==='con'&&(c.type==='h'||c.type==='v')){normal=frameDirection(c.frameAngleDeg,c.type==='h');if(c.b)pair=[c.a,c.b];else if(c.a.kind==='edge'&&validConstraintEdge(shapes,c.a)){const sh=shapes[c.a.shape],n=sh.type==='rect'?4:sh.type==='poly'?(sh.verts??sh.pts).length:0;pair=[{kind:'pt',shape:c.a.shape,idx:c.a.idx},{kind:'pt',shape:c.a.shape,idx:(c.a.idx+1)%n}]}}
   else if(c.kind==='dim'&&!c.driven&&(c.type==='hdist'||c.type==='vdist')&&c.b&&(c.projectionSign===1||c.projectionSign===-1)){normal=frameDirection(c.frameAngleDeg,c.type==='vdist');offset=c.projectionSign*c.value;pair=[c.a,c.b]}
   else continue
   if(pair.length!==2||pair.some(r=>!refValid(shapes,r)||refPts(shapes,r).length!==1))continue
   if(normal[0]<-1e-10||Math.abs(normal[0])<1e-10&&normal[1]<0){normal=[-normal[0],-normal[1]];offset=-offset}
   const id=normal.map(v=>v.toFixed(9)).join(','),g=groups.get(id)??{normal,links:[]};g.links.push([pair[0],pair[1],offset]);groups.set(id,g);pair.forEach(add)
 }
 const result=new Map<string,ProjectionAnchor[]>()
 for(const g of groups.values()){
   const values=new Map<string,number>(),bad=new Set<string>(),set=(r:SkRef,v:number)=>{const k=key(r);if(!Number.isFinite(v))return;if(values.has(k)&&Math.abs(values.get(k)!-v)>1e-7)bad.add(k);else values.set(k,v)}
   for(const r of refMap.values()){const p=world.point(r);if(p.x!==undefined&&p.y!==undefined)set(r,p.x*g.normal[0]+p.y*g.normal[1])}
   const links=[...g.links,...cons.flatMap(c=>c.kind==='con'&&c.type==='coincident'&&c.b&&refPts(shapes,c.a).length===1&&refPts(shapes,c.b).length===1?[[c.a,c.b,0] as [SkRef,SkRef,number]]:[])]
   for(let pass=0;pass<=links.length;pass++)for(const[a,b,d]of links){if(bad.has(key(a))||bad.has(key(b))){bad.add(key(a));bad.add(key(b));continue}if(values.has(key(a)))set(b,values.get(key(a))!+d);if(values.has(key(b)))set(a,values.get(key(b))!-d)}
   for(const[k,value]of values)if(!bad.has(k))result.set(k,[...(result.get(k)??[]),{normal:g.normal,value}])
 }
 return r=>result.get(key(r))??[]
}
