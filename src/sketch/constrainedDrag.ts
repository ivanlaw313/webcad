import {bulgeCenter,pathPts} from './sketchOps'
import {resolveConstraintAnchors,resolvePointProjectionAnchors,validConstraintEdge} from './constraintAnchors'
import { solveFree, refPts, refValid, circum3, arcResample, type FShape, type FPt, type SkRef, type SkCon, type FreeSolveResult } from './freesolve'
type Locus={kind:'line';normal:FPt;value:number}|{kind:'point';p:FPt}|{kind:'axis';axis:0|1;value:number}|{kind:'circle';c:FPt;r:number}
export type ConstrainedDragResult={ok:true;result:FreeSolveResult;target:FPt;intended:FPt;projection:'none'|'fixed'|'axis'|'circle'|'intersection'}|{ok:false;reason:string}
const near=(a:FPt,b:FPt)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-5
const same=(a:SkRef|undefined,b:SkRef)=>!!a&&a.kind===b.kind&&(!('shape'in a)||'shape'in b&&a.shape===b.shape)&&(!('idx'in a)||'idx'in b&&a.idx===b.idx)
const point=(shapes:FShape[],r:SkRef)=>refPts(shapes,r)[0]
function fixed(shapes:FShape[],cons:SkCon[],r:SkRef):boolean {
 if(r.kind==='origin'||r.kind==='refpt')return true
 if('shape'in r && cons.some(c=>{
  if(c.kind!=='con'||c.type!=='fix'||!('shape'in c.a)||c.a.shape!==r.shape)return false
  if(c.a.kind==='circle')return true
  if(c.a.kind!=='edge'||r.kind!=='pt'||!validConstraintEdge(shapes,c.a))return false
  const sh=shapes[r.shape]
  if(sh.type==='poly'&&sh.arc)return r.idx<2
  const n=sh.type==='rect'?4:sh.type==='poly'?(sh.verts??sh.pts).length:0
  return r.idx===c.a.idx||r.idx===(c.a.idx+1)%n
 }))return true
 return cons.some(c=>c.kind==='con'&&(c.type==='fix'&&same(c.a,r)||c.type==='coincident'&&((same(c.a,r)&&(c.b?.kind==='origin'||c.b?.kind==='refpt'))||(same(c.b,r)&&(c.a.kind==='origin'||c.a.kind==='refpt')))))
}
function on(p:FPt,l:Locus):boolean{if(l.kind==='line')return Math.abs(p[0]*l.normal[0]+p[1]*l.normal[1]-l.value)<1e-5;return l.kind==='point'?near(p,l.p):l.kind==='axis'?Math.abs(p[l.axis]-l.value)<1e-5:Math.abs(Math.hypot(p[0]-l.c[0],p[1]-l.c[1])-l.r)<1e-5}
function nearest(p:FPt,l:Locus,last:FPt):FPt {
 if(l.kind==='line'){const d=l.value-p[0]*l.normal[0]-p[1]*l.normal[1];return[p[0]+d*l.normal[0],p[1]+d*l.normal[1]]}
 if(l.kind==='point')return l.p
 if(l.kind==='axis'){const q:FPt=[...p];q[l.axis]=l.value;return q}
 let dx=p[0]-l.c[0],dy=p[1]-l.c[1],length=Math.hypot(dx,dy)
 if(length<1e-9){dx=last[0]-l.c[0];dy=last[1]-l.c[1];length=Math.hypot(dx,dy)}
 return length<1e-9?last:[l.c[0]+l.r*dx/length,l.c[1]+l.r*dy/length]
}
function intersections(a:Locus,b:Locus):FPt[]{
 if(a.kind==='axis'&&b.kind==='line')return intersections({kind:'line',normal:a.axis===0?[1,0]:[0,1],value:a.value},b)
 if(a.kind==='line'&&b.kind==='axis')return intersections(a,{kind:'line',normal:b.axis===0?[1,0]:[0,1],value:b.value})
 if(a.kind==='line'&&b.kind==='line'){const det=a.normal[0]*b.normal[1]-a.normal[1]*b.normal[0];return Math.abs(det)<1e-9?[]:[[(a.value*b.normal[1]-a.normal[1]*b.value)/det,(a.normal[0]*b.value-a.value*b.normal[0])/det]]}
 if(a.kind==='line'&&b.kind==='circle'){const d=a.value-b.c[0]*a.normal[0]-b.c[1]*a.normal[1],h2=b.r*b.r-d*d;if(h2< -1e-8)return[];const foot:FPt=[b.c[0]+d*a.normal[0],b.c[1]+d*a.normal[1]],h=Math.sqrt(Math.max(0,h2));return[-1,1].map(s=>[foot[0]-s*h*a.normal[1],foot[1]+s*h*a.normal[0]])}
 if(a.kind==='circle'&&b.kind==='line')return intersections(b,a)
 if(a.kind==='point')return on(a.p,b)?[a.p]:[]
 if(b.kind==='point')return intersections(b,a)
 if(a.kind==='axis'&&b.kind==='axis'){if(a.axis===b.axis)return [];const p:FPt=[0,0];p[a.axis]=a.value;p[b.axis]=b.value;return[p]}
 if(a.kind==='circle'&&b.kind==='axis')return intersections(b,a)
 if(a.kind==='axis'&&b.kind==='circle'){const d=a.value-b.c[a.axis],q=b.r*b.r-d*d;if(q< -1e-8)return[];return [1,-1].map(sign=>{const p:FPt=[...b.c];p[a.axis]=a.value;p[1-a.axis]+=sign*Math.sqrt(Math.max(0,q));return p})}
 if(a.kind==='circle'&&b.kind==='circle'){const dx=b.c[0]-a.c[0],dy=b.c[1]-a.c[1],d=Math.hypot(dx,dy);if(d<1e-9||d>a.r+b.r+1e-8||d<Math.abs(a.r-b.r)-1e-8)return[];const x=(a.r*a.r-b.r*b.r+d*d)/(2*d),h=Math.sqrt(Math.max(0,a.r*a.r-x*x));return [1,-1].map(sign=>[a.c[0]+x*dx/d-sign*h*dy/d,a.c[1]+x*dy/d+sign*h*dx/d])}
 return[]
}
export const sketchesNumericallyEqual=(a:unknown,b:unknown):boolean=>typeof a==='number'&&typeof b==='number'?Math.abs(a-b)<1e-9:Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((v,i)=>sketchesNumericallyEqual(v,b[i])):a!==null&&b!==null&&typeof a==='object'&&typeof b==='object'?Object.keys({...a,...b}).every(k=>sketchesNumericallyEqual((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k])):a===b
/** Pointer intent only: explicit anchored constraints define a feasible target.
 * Numerical dimension commands must call the strict solver directly. */
export async function solveConstrainedPointDrag(shapes:FShape[],cons:SkCon[],ref:SkRef,intended:FPt):Promise<ConstrainedDragResult>{
 if(!intended.every(Number.isFinite)||!refValid(shapes,ref)||!['pt','center'].includes(ref.kind))return{ok:false,reason:'拖动点不可用'}
 if(cons.some(c=>[c.a,c.b,'c'in c?c.c:undefined].some(r=>r?.kind==='edge'&&!validConstraintEdge(shapes,r))))return{ok:false,reason:'约束引用的线段已不存在，请先修复草图关系'}
 const last=point(shapes,ref),loci:Locus[]=resolvePointProjectionAnchors(shapes,cons)(ref).map(p=>({kind:'line',...p})),anchors=resolveConstraintAnchors(shapes,cons),anchored=anchors.point(ref)
 if(anchored.x!==undefined&&anchored.y!==undefined)loci.push({kind:'point',p:[anchored.x,anchored.y]})
 else if(fixed(shapes,cons,ref))loci.push({kind:'point',p:last})
 else {if(anchored.x!==undefined)loci.push({kind:'axis',axis:0,value:anchored.x});if(anchored.y!==undefined)loci.push({kind:'axis',axis:1,value:anchored.y})}
 const addAnchor=(other:SkRef,axis?:0|1,radius?:number)=>{if(!refValid(shapes,other))return;const a=anchors.point(other);if(axis!==undefined){const v=axis===0?a.x:a.y;if(v!==undefined)loci.push({kind:'axis',axis,value:v})}if(radius!==undefined&&radius>0&&a.x!==undefined&&a.y!==undefined)loci.push({kind:'circle',c:[a.x,a.y],r:radius})}
 for(const c of cons){
  if(c.frameAngleDeg===undefined&&c.kind==='con'&&(c.type==='h'||c.type==='v')&&c.b){if(same(c.a,ref))addAnchor(c.b,c.type==='h'?1:0);else if(same(c.b,ref))addAnchor(c.a,c.type==='h'?1:0)}
  if(c.kind==='dim'&&!c.driven&&c.type==='dist'&&c.b){if(same(c.a,ref))addAnchor(c.b,undefined,c.value);else if(same(c.b,ref))addAnchor(c.a,undefined,c.value)}
  if(ref.kind!=='pt'||c.a.kind!=='edge'||c.a.shape!==ref.shape)continue
  const sh=shapes[ref.shape],verts=sh.type==='rect'?[sh.a,[sh.b[0],sh.a[1]] as FPt,sh.b,[sh.a[0],sh.b[1]] as FPt]:sh.type==='poly'?sh.verts??(!sh.arc?sh.pts:[]):[]
  const j=c.a.idx,k=(j+1)%verts.length
  if(!verts.length||j<0||j>=verts.length||(sh.type==='poly'&&sh.open&&j>=verts.length-1))continue
  // Arc segment length is a chord in some legacy constraints: do not infer it
  // as a straight anchored line. Arc support is handled separately below.
  if(sh.type==='poly'&&(sh.arc||sh.bulges&&Math.abs(sh.bulges[j]||0)>1e-12))continue
  if(ref.idx!==j&&ref.idx!==k)continue
  const other:SkRef={kind:'pt',shape:ref.shape,idx:ref.idx===j?k:j}
  if(c.frameAngleDeg===undefined&&c.kind==='con'&&(c.type==='h'||c.type==='v'))addAnchor(other,c.type==='h'?1:0)
  if(c.kind==='dim'&&!c.driven&&c.type==='len')addAnchor(other,undefined,c.value)
 }
 if(ref.kind==='pt'){
  const sh=shapes[ref.shape]
  if(sh.type==='poly'){
   const n=sh.verts?.length??0,segments=sh.arc?[0]:Array.from({length:sh.open?Math.max(0,n-1):n},(_,i)=>i)
   for(const idx of segments){if(sh.arc?ref.idx>1:ref.idx!==idx&&ref.idx!==(idx+1)%n)continue
    const center:SkRef={kind:'center',shape:ref.shape,idx};if(!refValid(shapes,center))continue
    const ca=anchors.point(center),axisRef:SkRef=sh.arc?{kind:'circle',shape:ref.shape}:{kind:'edge',shape:ref.shape,idx},radius=anchors.radius(axisRef)
    if(ca.x!==undefined&&ca.y!==undefined&&radius!==undefined)loci.push({kind:'circle',c:[ca.x,ca.y],r:radius})
   }
  }
 }
 let target:FPt=[...intended]
 if(loci.length){const candidates=loci.map(l=>nearest(intended,l,last));let discrete=false;for(let i=0;i<loci.length;i++)for(let j=i+1;j<loci.length;j++){const hits=intersections(loci[i],loci[j]);if(hits.length)discrete=true;candidates.push(...hits)}const valid=candidates.filter(p=>p.every(Number.isFinite)&&loci.every(l=>on(p,l)));if(!valid.length)return{ok:false,reason:'约束目标没有共同可行位置'};const choice=discrete?last:intended;valid.sort((a,b)=>Math.hypot(a[0]-choice[0],a[1]-choice[1])-Math.hypot(b[0]-choice[0],b[1]-choice[1])||Math.hypot(a[0]-last[0],a[1]-last[1])-Math.hypot(b[0]-last[0],b[1]-last[1]));target=valid[0]}
 let result:FreeSolveResult|null
 const seeded=structuredClone(shapes)
 if(loci.length&&ref.kind==='pt'&&!loci.some(l=>l.kind==='point')){
  const sh=seeded[ref.shape]
  if(sh.type==='poly'&&sh.arc&&ref.idx<2){const cc=circum3(sh.arc.a,sh.arc.m,sh.arc.b);if(cc){const TAU=2*Math.PI,angle=(p:FPt)=>Math.atan2(p[1]-cc.c[1],p[0]-cc.c[0]),oldA=angle(sh.arc.a),oldB=angle(sh.arc.b),oldM=angle(sh.arc.m),ccw=(oldB-oldA+TAU)%TAU>=(oldM-oldA+TAU)%TAU,a=ref.idx===0?target:sh.arc.a,b=ref.idx===1?target:sh.arc.b,a0=angle(a),a1=angle(b),span=ccw?(a1-a0+TAU)%TAU:-((a0-a1+TAU)%TAU),m:FPt=[cc.c[0]+cc.r*Math.cos(a0+span/2),cc.c[1]+cc.r*Math.sin(a0+span/2)];sh.arc={a:[...a],b:[...b],m};sh.pts=arcResample(a,b,m)}}
  else if(sh.type==='poly'&&sh.verts&&sh.bulges){
   const n=sh.verts.length
   for(let idx=0;idx<(sh.open?n-1:n);idx++){const bu=sh.bulges[idx];if(Math.abs(bu||0)<1e-12||(ref.idx!==idx&&ref.idx!==(idx+1)%n))continue
    const old=bulgeCenter(sh.verts[idx],sh.verts[(idx+1)%n],bu),anchor=anchors.point({kind:'center',shape:ref.shape,idx}),center:FPt=[anchor.x??old[0],anchor.y??old[1]],verts=sh.verts.map((p,i)=>i===ref.idx?[...target] as FPt:p),a=verts[idx],b=verts[(idx+1)%n],TAU=2*Math.PI,a0=Math.atan2(a[1]-center[1],a[0]-center[0]),a1=Math.atan2(b[1]-center[1],b[0]-center[0]),span=bu>0?(a0-a1+TAU)%TAU:(a1-a0+TAU)%TAU
    if(span<1e-6||span>TAU-1e-6)continue
    sh.verts=verts;sh.bulges=sh.bulges.map((v,i)=>i===idx?Math.sign(bu)*Math.tan(span/4):v);sh.pts=pathPts(verts,sh.bulges);break
   }
  }
  else if(sh.type==='poly'&&!sh.verts&&!sh.arc&&!sh.smooth)sh.pts[ref.idx]=[...target]
 }
 try{result=await solveFree(seeded,structuredClone(cons),{ref,to:target})}catch{return{ok:false,reason:'拖动约束求解失败'}}
 const finite=(v:unknown):boolean=>typeof v==='number'?Number.isFinite(v):Array.isArray(v)?v.every(finite):v!==null&&typeof v==='object'?Object.values(v).every(finite):true
 if(!result||result.conflict||!result.shapes.every(finite)||!point(result.shapes,ref)||!near(point(result.shapes,ref),target))return{ok:false,reason:'其他尺寸或关系阻止此拖动'}
 // Numerical solver roundoff must not create a history entry for a locked
 // drag. Still solve first: a changed driving dimension may move other geometry.

 if(near(target,last)&&sketchesNumericallyEqual(result.shapes,shapes))result={...result,shapes:structuredClone(shapes)}
 return{ok:true,result,target,intended:[...intended],projection:!loci.length?'none':loci.some(l=>l.kind==='point')?'fixed':loci.length>1?'intersection':loci[0].kind==='circle'?'circle':'axis'}
}
