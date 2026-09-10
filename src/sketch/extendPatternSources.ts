import type { SketchShape } from '../store'
import type { PatternDocument } from './persistentPatterns'
import { reconfigurePersistentPattern } from './persistentPatterns'
import { solvePatternCandidate } from './solvePatternCandidate'
import { solveMoveCandidate } from './moveRelations'
import { resolvePatternDimensions, type PatternDimensionOptions } from './resolvePatternDimensions'
import type { ExtendTarget } from './extendTransaction'
import type { SkCon, SkRef, FPt } from './freesolve'
const refs=(c:SkCon):SkRef[]=>[c.a,c.b,...('c'in c?[c.c]:[])].filter((r):r is SkRef=>!!r)
const remap=(c:SkCon,map:Map<number,number>):SkCon=>{
 const ref=(r:SkRef):SkRef=>'shape'in r?{...r,shape:map.get(r.shape)!}:r
 return {...c,a:ref(c.a),...(c.b?{b:ref(c.b)}:{}),...('c'in c&&c.c?{c:ref(c.c)}:{})}
}
const controls=(s:SketchShape):FPt[]=>s.type==='poly'?s.arc?[s.arc.a,s.arc.b]:s.verts??s.pts:[]
const near=(a:FPt,b:FPt)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-5
/** Accepts the exact endpoint/shape computed by the existing extension hit algorithm.
 * Original fixed anchors are checked BEFORE solving the changed source, then instances
 * regenerate. Generated-instance editing and linked projection topology are rejected.
 */
export async function extendPatternSources(input:PatternDocument,nextShape:SketchShape,target:ExtendTarget,options?:PatternDimensionOptions):Promise<Awaited<ReturnType<typeof solvePatternCandidate>>>{
 const fail=(reason:string)=>({ok:false as const,reason})
 if(input.patterns.length!==1||!Number.isInteger(target.shape))return fail('Extend requires a source/base contour in one persistent pattern.')
 const p=input.patterns[0],validation=reconfigurePersistentPattern(input,p.id,p.config)
 if(!validation.ok)return validation
 const generated=new Set(p.instances.flatMap(i=>i.entityIds)),owned=new Set(p.instances.flatMap(i=>i.generatedConstraintIds)),source=input.shapes[target.shape]
 if(generated.has(input.entityIds[target.shape]))return fail('Generated contours are managed by the pattern; extend the source or detach the pattern first.')
 if(!source||source.type!=='poly'||!source.open||nextShape.type!=='poly'||!nextShape.open)return fail('Extend requires an open source path.')
 if(source.projectLink)return fail('Detach linked projected geometry before extending it.')
 if(source.smooth||source.ctrl||source.bspline||source.ell||source.earc||source.conic)return fail('This curve does not support persistent endpoint extension.')
 const before=controls(source),after=controls(nextShape),endpoint=target.end==='start'?0:after.length-1
 if(before.length!==after.length||after.length<2||!target.point.every(Number.isFinite)||after.some(p=>!p.every(Number.isFinite))||!near(after[endpoint],target.point)||before.some((p,i)=>i!==endpoint&&!near(p,after[i])))return fail('Extend candidate changes unrelated vertices or has an invalid endpoint.')
 const resolved=resolvePatternDimensions(input,[],options)
 if(!resolved.ok)return resolved
 const doc=resolved.document,kept=doc.entityIds.flatMap((id,i)=>generated.has(id)?[]:[i]),toBase=new Map(kept.map((i,j)=>[i,j])),toFull=new Map(kept.map((i,j)=>[j,i]))
 const original=kept.map(i=>doc.shapes[i]),cons=doc.cons.filter(c=>!owned.has(c.id)&&refs(c).every(r=>!('shape'in r)||toBase.has(r.shape))).map(c=>remap(c,toBase)),index=toBase.get(target.shape)!
 const {pts:_pts,verts:_verts,bulges:_bulges,arc:_arc,...metadata}=source
 const next={...structuredClone(metadata),...structuredClone(nextShape)} as SketchShape
 const candidates=original.map((s,i)=>i===index?next:s)
 const result=await solveMoveCandidate(original,{ok:true,shapes:candidates,cons,selectedIndices:[index],targetShapes:[next]})
 if(!result.ok)return fail(`Extend failed: ${result.reason}`)
 const actual=controls(result.shapes[index])
 if(!actual[endpoint]||!near(actual[endpoint],target.point))return fail('Constraints prevent the endpoint reaching the extension target.')
 const touched=new Set([index]);let changed=true
 while(changed){changed=false;for(const c of cons){const indices=refs(c).flatMap(r=>'shape'in r?[r.shape]:[]);if(indices.some(i=>touched.has(i)))for(const i of indices)if(!touched.has(i)){touched.add(i);changed=true}}}
 if(original.some((s,i)=>!touched.has(i)&&result.shapes[i]!==s))return fail('Extend would change unrelated geometry.')
 kept.forEach((i,j)=>{doc.shapes[i]=result.shapes[j]})
 const updated=new Map(result.cons.map(c=>[c.id,remap(c,toFull)]))
 doc.cons=doc.cons.map(c=>updated.get(c.id)??c)
 return solvePatternCandidate(doc,reconfigurePersistentPattern(doc,p.id,p.config))
}
