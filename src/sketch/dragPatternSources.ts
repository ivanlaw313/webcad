import type { PatternDocument } from './persistentPatterns'
import { reconfigurePersistentPattern } from './persistentPatterns'
import { solvePatternCandidate } from './solvePatternCandidate'
import { solveMoveCandidate } from './moveRelations'
import { solveConstrainedPointDrag } from './constrainedDrag'
import { solveConstrainedEdgeDrag } from './constrainedEdgeDrag'
import { resolvePatternDimensions, type PatternDimensionOptions } from './resolvePatternDimensions'
import { solveFree, refPts, applyRelationUpdates, type SkCon, type SkRef, type FPt } from './freesolve'

export type PatternSourceDrag = {ref:SkRef;to?:FPt;ends?:[FPt,FPt];radius?:number}
const refs=(c:SkCon):SkRef[]=>[c.a,c.b,...('c'in c?[c.c]:[])].filter((r):r is SkRef=>!!r)
const remap=(c:SkCon,map:Map<number,number>):SkCon=>{
 const ref=(r:SkRef):SkRef=>'shape'in r?{...r,shape:map.get(r.shape)!}:r
 return {...c,a:ref(c.a),...(c.b?{b:ref(c.b)}:{}),...('c'in c&&c.c?{c:ref(c.c)}:{})}
}
const near=(a:FPt,b:FPt)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-5
/** Validate each pointer candidate independently, with original Fix anchors protected.
 * Existing point/edge drag projection semantics apply to source/base geometry; instances
 * regenerate afterwards. Temporary drag pins are removed before returning a document.
 */
export async function dragPatternSources(input:PatternDocument,drag:PatternSourceDrag,options?:PatternDimensionOptions):Promise<(Extract<Awaited<ReturnType<typeof solvePatternCandidate>>,{ok:true}>&{locked:boolean;projected:boolean})|{ok:false;reason:string}>{
 const fail=(reason:string)=>({ok:false as const,reason})
 if(input.patterns.length!==1||!('shape'in drag.ref)||!input.shapes[drag.ref.shape])return fail('Drag requires source/base sketch geometry.')
 const validation=reconfigurePersistentPattern(input,input.patterns[0].id,input.patterns[0].config)
 if(!validation.ok)return validation
 const generated=new Set(input.patterns[0].instances.flatMap(i=>i.entityIds)),owned=new Set(input.patterns[0].instances.flatMap(i=>i.generatedConstraintIds))
 if(generated.has(input.entityIds[drag.ref.shape]))return fail('Generated instances are managed by the pattern; drag the source or detach the pattern first.')
 if(drag.radius!==undefined&&(!Number.isFinite(drag.radius)||drag.radius<=0))return fail('Circle radius must be finite and positive.')
 const resolved=resolvePatternDimensions(input,[],options)
 if(!resolved.ok)return resolved
 const doc=resolved.document,kept=doc.entityIds.flatMap((id,i)=>generated.has(id)?[]:[i]),toBase=new Map(kept.map((i,j)=>[i,j])),toFull=new Map(kept.map((i,j)=>[j,i]))
 const original=kept.map(i=>doc.shapes[i]),cons=doc.cons.filter(c=>!owned.has(c.id)&&refs(c).every(r=>!('shape'in r)||toBase.has(r.shape))).map(c=>remap(c,toBase))
 const ref={...drag.ref,shape:toBase.get(drag.ref.shape)!},shapes=structuredClone(original)
 if(drag.radius!==undefined){const circle=shapes[ref.shape];if(circle.type!=='circle')return fail('Radius drag requires a circle.');circle.r=drag.radius}
 try{
  const point=drag.to&&!drag.ends&&drag.radius===undefined&&ref.kind!=='ellipse-point'&&ref.kind!=='ellipse-arc-end'?await solveConstrainedPointDrag(shapes,cons,ref,drag.to):null
  const edge=drag.ends&&ref.kind==='edge'?await solveConstrainedEdgeDrag(shapes,cons,ref,drag.ends):null
  if(point&&!point.ok)return point
  if(edge&&!edge.ok)return edge
  const direct=drag.ends?{ref,ends:drag.ends}:drag.to?{ref:drag.radius!==undefined?{kind:'pt' as const,shape:ref.shape,idx:0}:ref,to:drag.to}:undefined
  if(!point&&!edge&&!direct)return fail('Drag has no target position.')
  const first=edge?.ok?edge.result:point?.ok?point.result:await solveFree(shapes,cons,direct)
  if(!first||first.conflict)return fail('Dimensions or constraints prevent the requested drag.')
  const targetRef=drag.ends&&ref.kind==='circle'?{kind:'edge' as const,shape:ref.shape,idx:0}:ref
  const target=point?.ok?[point.target]:edge?.ok?edge.targetEnds:drag.ends??refPts(first.shapes,targetRef)
  const persistent=applyRelationUpdates(cons,first)
  // solveMoveCandidate with no rigid targets validates original Fix, including circle
  // radius, so changing the radius seed cannot redefine an implicit fixed anchor.
  const checked=await solveMoveCandidate(original,{ok:true,shapes:first.shapes,cons:persistent,selectedIndices:[],targetShapes:[]})
  if(!checked.ok)return checked
  const actual=refPts(checked.shapes,targetRef)
  if(target.length!==actual.length||target.some((p,i)=>!near(p,actual[i])))return fail('Drag target changed after removing temporary constraints.')
  const touched=new Set([ref.shape]);let changed=true
  while(changed){changed=false;for(const c of cons){const indices=refs(c).flatMap(r=>'shape'in r?[r.shape]:[]);if(indices.some(i=>touched.has(i)))for(const i of indices)if(!touched.has(i)){touched.add(i);changed=true}}}
  if(original.some((s,i)=>!touched.has(i)&&checked.shapes[i]!==s))return fail('Drag would change unrelated geometry.')
  kept.forEach((i,j)=>{doc.shapes[i]=checked.shapes[j]})
  const updated=new Map(checked.cons.map(c=>[c.id,remap(c,toFull)]))
  doc.cons=doc.cons.map(c=>updated.get(c.id)??c)
  const result=await solvePatternCandidate(doc,reconfigurePersistentPattern(doc,doc.patterns[0].id,doc.patterns[0].config))
  if(!result.ok)return result
  const circle=checked.shapes[ref.shape]
  return {...result,locked:drag.radius!==undefined&&circle.type==='circle'&&Math.abs(circle.r-drag.radius)>.05,projected:!!(point?.ok&&point.projection!=='none'||edge?.ok&&edge.projection!=='none')}
 }catch{return fail('Pattern drag could not be validated; original geometry is preserved.')}
}
