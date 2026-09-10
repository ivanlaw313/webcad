import { patternDistanceSideError } from './patternDistanceSides'
import type { PatternDocument } from './persistentPatterns'
import { reconfigurePersistentPattern } from './persistentPatterns'
import { solvePatternCandidate } from './solvePatternCandidate'
import { solveMoveCandidate } from './moveRelations'
import type { SkCon, SkRef } from './freesolve'
import { resolvePatternDimensions, type PatternDimensionOptions } from './resolvePatternDimensions'

const refs=(c:SkCon):SkRef[]=>[c.a,c.b,...('c'in c?[c.c]:[])].filter((r):r is SkRef=>!!r)
const remap=(c:SkCon,map:Map<number,number>):SkCon=>{
 const ref=(r:SkRef):SkRef=>'shape'in r?{...r,shape:map.get(r.shape)!}:r
 return {...c,a:ref(c.a),...(c.b?{b:ref(c.b)}:{}),...('c'in c&&c.c?{c:ref(c.c)}:{})}
}
export type PatternDimensionEdit = {id:string;value:number;expr?:string;refs?:Record<string,string>;param?:string;paramId?:string}
/** Numeric or explicit formula dimension edits in stored units, with injected formula evaluation.
 * Parameters must already be resolved. No store/history or global reference writes;
 * solveFree reference geometry remains caller configured. No UI path is wired here.
 */
export async function editPatternDimensions(input:PatternDocument,edits:PatternDimensionEdit[],options?:PatternDimensionOptions):Promise<Awaited<ReturnType<typeof solvePatternCandidate>>>{
 const fail=(reason:string)=>({ok:false as const,reason})
 if(input.patterns.length!==1||(!edits.length&&!options)||new Set(edits.map(e=>e.id)).size!==edits.length||edits.some(e=>!e.id||!Number.isFinite(e.value)))return fail('Choose unique dimensions and finite numeric values in a single pattern document.')
 let doc=structuredClone(input)
 const pattern=doc.patterns[0]
 // Validate registry and references before constructing reduced solver indices.
 const validation=reconfigurePersistentPattern(doc,pattern.id,pattern.config)
 if(!validation.ok)return validation
 const generated=new Set(pattern.instances.flatMap(i=>i.entityIds)),owned=new Set(pattern.instances.flatMap(i=>i.generatedConstraintIds)),values=new Map(edits.map(e=>[e.id,e.value]))
 const generatedIndices=new Set(doc.entityIds.flatMap((id,i)=>generated.has(id)?[i]:[]))
 for(const edit of edits){const c=doc.cons.find(c=>c.id===edit.id)
  if(!c||c.kind!=='dim'||c.driven||owned.has(c.id)||refs(c).some(r=>'shape'in r&&generatedIndices.has(r.shape)))return fail(`Dimension ${edit.id} is not an editable source/base driving dimension.`)
  if((edit.param!==undefined&&(typeof edit.param!=='string'||!edit.param))||(edit.paramId!==undefined&&(typeof edit.paramId!=='string'||!edit.paramId)))return fail(`Dimension ${edit.id} has invalid parameter binding.`)
  if((edit.param||edit.paramId)&&edit.expr!==undefined)return fail(`Dimension ${edit.id} cannot bind a parameter and formula simultaneously.`)
  if(edit.expr!==undefined&&(typeof edit.expr!=='string'||!edit.expr.trim()))return fail(`Dimension ${edit.id} has an empty formula.`)
  if(edit.refs!==undefined&&!edit.expr)return fail(`Dimension ${edit.id} has references without a formula.`)
  if(edit.refs&&Object.values(edit.refs).some(id=>typeof id!=='string'||!id))return fail(`Dimension ${edit.id} has invalid formula references.`)
  if(!edit.expr&&(edit.value<0||edit.value===0&&c.type!=='hdist'&&c.type!=='vdist'))return fail(`Dimension ${edit.id} would create degenerate geometry.`)
 }
 doc.cons=doc.cons.map(c=>{if(c.kind!=='dim'||!values.has(c.id))return c
  const {refs:_refs,paramId:_paramId,param:_param,...numeric}=c
  const edit=edits.find(e=>e.id===c.id)!
  return {...numeric,value:edit.value,expr:edit.param||edit.paramId?undefined:edit.expr??String(edit.value),...(edit.param?{param:edit.param}:{}),...(edit.paramId?{paramId:edit.paramId}:{}),...(edit.refs?{refs:structuredClone(edit.refs)}:{})}
 })
 const resolved=resolvePatternDimensions(doc,values.keys(),options)
 if(!resolved.ok)return resolved
 doc=resolved.document
 const changedDimensions=new Set(resolved.changedIds)
 const kept=doc.shapes.map((_,i)=>i).filter(i=>!generatedIndices.has(i)),toBase=new Map(kept.map((i,j)=>[i,j])),toFull=new Map(kept.map((i,j)=>[j,i]))
 const baseShapes=kept.map(i=>doc.shapes[i]),baseCons=doc.cons.filter(c=>!owned.has(c.id)&&refs(c).every(r=>!('shape'in r)||toBase.has(r.shape))).map(c=>remap(c,toBase))
 const touched=new Set(baseCons.filter(c=>changedDimensions.has(c.id)).flatMap(c=>refs(c).flatMap(r=>'shape'in r?[r.shape]:[])))
 let changed=true
 while(changed){changed=false;for(const c of baseCons){const indices=refs(c).flatMap(r=>'shape'in r?[r.shape]:[]);if(indices.some(i=>touched.has(i)))for(const i of indices)if(!touched.has(i)){touched.add(i);changed=true}}}
 const solved=await solveMoveCandidate(baseShapes,{ok:true,shapes:structuredClone(baseShapes),cons:baseCons,selectedIndices:[],targetShapes:[]})
 if(!solved.ok)return fail(solved.reason)
 const baseSideError=patternDistanceSideError({shapes:baseShapes,cons:baseCons},{shapes:solved.shapes,cons:solved.cons})
 if(baseSideError)return fail(baseSideError)
 // solveMoveCandidate returns original objects when numerically unchanged, including
 // equivalent canonicalized curves. Do not accept drift in disconnected base components.
 if(baseShapes.some((s,i)=>!touched.has(i)&&solved.shapes[i]!==s))return fail('Dimension solving moved unrelated geometry.')
 kept.forEach((i,j)=>{doc.shapes[i]=solved.shapes[j]})
 const updated=new Map(solved.cons.map(c=>[c.id,remap(c,toFull)]))
 doc.cons=doc.cons.map(c=>updated.get(c.id)??c)
 const final=await solvePatternCandidate(doc,reconfigurePersistentPattern(doc,pattern.id,pattern.config))
 if(!final.ok)return final
 const finalSideError=patternDistanceSideError(input,final.document)
 return finalSideError?fail(finalSideError):final
}
