import type { PatternDocument } from './persistentPatterns'
import { refPts, refValid, type SkCon, type SkRef } from './freesolve'
type Edge=Extract<SkRef,{kind:'edge'}>
type Dim=Extract<SkCon,{kind:'dim'}>
export type ParallelSpacingNames={dimensionId:string;dimensionName:string;parallelId:string}
export type ParallelSpacingPlan={ok:true;dimension:Dim;companions:SkCon[];add:SkCon[];point:Extract<SkRef,{kind:'pt'}>;side:1|-1}|{ok:false;reason:string}
const same=(a:SkRef|undefined,b:Edge)=>a?.kind==='edge'&&a.shape===b.shape&&a.idx===b.idx
/** Pure proposal only: caller must solve and commit the whole batch atomically.
 * Positive spacing is measured to the infinite second line. Near-parallel source
 * edges gain an explicit relation; geometry and registry are never modified here.
 */
export function buildParallelSpacing(doc:PatternDocument,first:SkRef,second:SkRef,names:ParallelSpacingNames):ParallelSpacingPlan{
 const fail=(reason:string):ParallelSpacingPlan=>({ok:false,reason})
 if(first.kind!=='edge'||second.kind!=='edge'||same(first,second))return fail('Select two distinct straight source/base edges.')
 const ids=new Set(doc.cons.map(c=>c.id)),usedNames=new Set(doc.cons.flatMap(c=>c.kind==='dim'&&c.name?[c.name]:[]))
 if(!names.dimensionId||!names.parallelId||!names.dimensionName||names.dimensionId===names.parallelId||ids.has(names.dimensionId)||ids.has(names.parallelId)||usedNames.has(names.dimensionName))return fail('Spacing dimension and relation require unused identities and a unique dimension name.')
 const generated=new Set(doc.patterns.flatMap(p=>p.instances.flatMap(i=>i.entityIds)))
 for(const r of [first,second]){
  if(!Number.isInteger(r.shape)||!refValid(doc.shapes,r)||generated.has(doc.entityIds[r.shape]))return fail('Generated or invalid geometry cannot define source spacing.')
  const sh=doc.shapes[r.shape]
  if(sh.type==='circle'||sh.type==='poly'&&(sh.arc||sh.ell||sh.earc||sh.ctrl||Math.abs(sh.bulges?.[r.idx]??0)>1e-12))return fail('Spacing requires straight edges, not curve chords.')
 }
 const [a,b]=refPts(doc.shapes,first),[c,d]=refPts(doc.shapes,second)
 if(!a||!b||!c||!d||![...a,...b,...c,...d].every(Number.isFinite))return fail('Spacing requires finite endpoints.')
 const ux=b[0]-a[0],uy=b[1]-a[1],vx=d[0]-c[0],vy=d[1]-c[1],ul=Math.hypot(ux,uy),vl=Math.hypot(vx,vy)
 if(ul<=1e-9||vl<=1e-9)return fail('Spacing requires nonzero edges.')
 if(Math.abs(ux*vy-uy*vx)/(ul*vl)>=3e-3)return fail('Select parallel or nearly parallel edges for spacing; use an angle dimension otherwise.')
 const signed=(vx*(a[1]-c[1])-vy*(a[0]-c[0]))/vl,value=Math.abs(signed)
 if(!Number.isFinite(value)||value<=1e-9)return fail('Zero spacing requires a coincidence relation instead.')
 const explicit=doc.cons.some(c=>c.kind==='con'&&c.type==='parallel'&&(same(c.a,first)&&same(c.b,second)||same(c.a,second)&&same(c.b,first)))
 const frames=(edge:Edge)=>doc.cons.flatMap(c=>c.kind==='con'&&(c.type==='h'||c.type==='v')&&same(c.a,edge)&&Number.isFinite(c.frameAngleDeg??0)?[(c.frameAngleDeg??0)+(c.type==='v'?90:0)]:[])
 const equivalent=(a:number,b:number)=>Math.abs(Math.sin((a-b)*Math.PI/180))<1e-10
 const oriented=frames(first).some(a=>frames(second).some(b=>equivalent(a,b)))
 const implicitRect=first.shape===second.shape&&doc.shapes[first.shape].type==='rect'&&first.idx%2===second.idx%2
 const point:Extract<SkRef,{kind:'pt'}>={kind:'pt',shape:first.shape,idx:first.idx}
 const dimension:Dim={id:names.dimensionId,name:names.dimensionName,kind:'dim',type:'p2l',a:point,b:{...second},value}
 const companions:SkCon[]=explicit||oriented||implicitRect?[]:[{id:names.parallelId,kind:'con',type:'parallel',a:{...first},b:{...second}}]
 return {ok:true,dimension,companions,add:[...companions,dimension],point,side:signed<0?-1:1}
}
