import type { PatternDocument } from './persistentPatterns'
import { reconfigurePersistentPattern } from './persistentPatterns'
import { solvePatternCandidate } from './solvePatternCandidate'
import { buildScaleCandidate, solveScaleCandidate, type ScaleTransform } from './scaleRelations'
import { resolvePatternDimensions, type PatternDimensionOptions } from './resolvePatternDimensions'
import type { SkCon, SkRef } from './freesolve'

const refs=(c:SkCon):SkRef[]=>[c.a,c.b,...('c'in c?[c.c]:[])].filter((r):r is SkRef=>!!r)
const remap=(c:SkCon,map:Map<number,number>):SkCon=>{
 const ref=(r:SkRef):SkRef=>'shape'in r?{...r,shape:map.get(r.shape)!}:r
 return {...c,a:ref(c.a),...(c.b?{b:ref(c.b)}:{}),...('c'in c&&c.c?{c:ref(c.c)}:{})}
}
/** One-way source/base Scale, followed by regeneration. Generated instances cannot
 * be selected directly. Caller supplies resolved parameter values/reference geometry.
 * No store/history writes; failed stages leave the complete input untouched.
 */
export async function scalePatternSources(input:PatternDocument,selectedIndices:number[],transform:ScaleTransform,options?:PatternDimensionOptions):Promise<(Extract<Awaited<ReturnType<typeof solvePatternCandidate>>,{ok:true}>&{changed:boolean})|{ok:false;reason:string}>{
 const fail=(reason:string)=>({ok:false as const,reason})
 if(input.patterns.length!==1)return fail('Scale requires one persistent pattern document.')
 const validation=reconfigurePersistentPattern(input,input.patterns[0].id,input.patterns[0].config)
 if(!validation.ok)return validation
 const generated=new Set(input.patterns[0].instances.flatMap(i=>i.entityIds)),owned=new Set(input.patterns[0].instances.flatMap(i=>i.generatedConstraintIds))
 if(!selectedIndices.length||new Set(selectedIndices).size!==selectedIndices.length||selectedIndices.some(i=>!Number.isInteger(i)||!input.shapes[i]))return fail('Scale requires valid source/base geometry selection.')
 if(selectedIndices.some(i=>generated.has(input.entityIds[i])))return fail('Generated instances are managed by the pattern; scale the source or detach the pattern first.')
 const resolved=resolvePatternDimensions(input,[],options)
 if(!resolved.ok)return resolved
 const doc=resolved.document,kept=doc.entityIds.flatMap((id,i)=>generated.has(id)?[]:[i]),toBase=new Map(kept.map((i,j)=>[i,j])),toFull=new Map(kept.map((i,j)=>[j,i]))
 const baseShapes=kept.map(i=>doc.shapes[i]),baseCons=doc.cons.filter(c=>!owned.has(c.id)&&refs(c).every(r=>!('shape'in r)||toBase.has(r.shape))).map(c=>remap(c,toBase))
 const selected=selectedIndices.map(i=>toBase.get(i)!)
 const candidate=buildScaleCandidate(baseShapes,baseCons,selected,transform)
 if(!candidate.ok)return candidate
 const solved=await solveScaleCandidate(baseShapes,candidate)
 if(!solved.ok)return solved
 // Disconnected, unselected components are not part of this scale transaction.
 const touched=new Set(selected);let changed=true
 while(changed){changed=false;for(const c of baseCons){const indices=refs(c).flatMap(r=>'shape'in r?[r.shape]:[]);if(indices.some(i=>touched.has(i)))for(const i of indices)if(!touched.has(i)){touched.add(i);changed=true}}}
 if(baseShapes.some((s,i)=>!touched.has(i)&&solved.shapes[i]!==s))return fail('Scale would change unrelated geometry.')
 kept.forEach((i,j)=>{doc.shapes[i]=solved.shapes[j]})
 const updated=new Map(solved.cons.map(c=>[c.id,remap(c,toFull)]))
 doc.cons=doc.cons.map(c=>updated.get(c.id)??c)
 // Preserve any additional persistent solver relations returned by the candidate.
 const existing=new Set(doc.cons.map(c=>c.id))
 doc.cons.push(...[...updated.values()].filter(c=>!existing.has(c.id)))
 const result=await solvePatternCandidate(doc,reconfigurePersistentPattern(doc,doc.patterns[0].id,doc.patterns[0].config))
 return result.ok?{...result,changed:solved.changed}:result
}
