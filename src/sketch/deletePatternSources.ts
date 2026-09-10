import type { PatternDocument } from './persistentPatterns'
import { reconfigurePersistentPattern } from './persistentPatterns'
import { solvePatternCandidate } from './solvePatternCandidate'
import { solveMoveCandidate } from './moveRelations'
import { resolvePatternDimensions, type PatternDimensionOptions } from './resolvePatternDimensions'
import type { SkCon, SkRef } from './freesolve'
const refs=(c:SkCon):SkRef[]=>[c.a,c.b,...('c'in c?[c.c]:[])].filter((r):r is SkRef=>!!r)
export async function deletePatternSources(input:PatternDocument,selectedIndices:number[],options?:PatternDimensionOptions):Promise<{ok:true;document:PatternDocument;indexMap:Record<number,number>;removedEntityIds:string[];removedConstraintIds:string[];dof:number}|{ok:false;reason:string}>{
 const fail=(reason:string)=>({ok:false as const,reason})
 if(input.patterns.length!==1)return fail('Delete requires one persistent pattern document.')
 const p=input.patterns[0],validation=reconfigurePersistentPattern(input,p.id,p.config)
 if(!validation.ok)return validation
 if(!selectedIndices.length||selectedIndices.some(i=>!Number.isInteger(i)||!input.shapes[i]))return fail('Select valid complete source/base contours to delete.')
 const generated=new Set(p.instances.flatMap(i=>i.entityIds)),selected=new Set(selectedIndices.map(i=>input.entityIds[i])),removed=new Set([...selected].filter(id=>!generated.has(id)))
 const deletedSlots=p.sourceEntityIds.flatMap((id,i)=>selected.has(id)?[i]:[])
 for(const instance of p.instances)for(const i of deletedSlots)removed.add(instance.entityIds[i])
 if([...selected].some(id=>generated.has(id)&&!removed.has(id)))return fail('Individual generated instances cannot be deleted; change pattern count or detach it first.')
 const indices=input.entityIds.flatMap((id,i)=>removed.has(id)?[]:[i]),map=new Map(indices.map((i,j)=>[i,j]))
 const removedCons=input.cons.filter(c=>refs(c).some(r=>'shape'in r&&!map.has(r.shape))),removedIds=new Set(removedCons.map(c=>c.id)),remaining=input.cons.filter(c=>!removedIds.has(c.id))
 const removedNames=new Set(removedCons.flatMap(c=>c.kind==='dim'&&c.name?[c.name]:[])),parameterNames=new Set(options?.parameters?.map(p=>p.name)??[])
 for(const c of remaining)if(c.kind==='dim'){
  if(Object.values(c.refs??{}).some(id=>removedIds.has(id.startsWith('dimension:')?id.slice(10):id)))return fail(`Surviving formula ${c.id} references a deleted dimension.`)
  const tokens=c.expr?.match(/[A-Za-z_一-龥][\w一-龥]*/g)??[]
  if(tokens.some(t=>removedNames.has(t)&&!c.refs?.[t]&&!parameterNames.has(t)))return fail(`Surviving formula ${c.id} references a deleted dimension.`)
 }
 const remap=(r:SkRef):SkRef=>'shape'in r?{...r,shape:map.get(r.shape)!}:r
 const cons=structuredClone(remaining).map(c=>({...c,a:remap(c.a),...(c.b?{b:remap(c.b)}:{}),...('c'in c&&c.c?{c:remap(c.c)}:{})}))
 const keepSources=p.sourceEntityIds.map((_,i)=>i).filter(i=>!deletedSlots.includes(i)),slots=p.sourceSlots??p.sourceEntityIds.map((_,i)=>i)
 let doc:PatternDocument={shapes:structuredClone(indices.map(i=>input.shapes[i])),cons,entityIds:indices.map(i=>input.entityIds[i]),patterns:keepSources.length?[{...structuredClone(p),sourceEntityIds:keepSources.map(i=>p.sourceEntityIds[i]),sourceSlots:keepSources.map(i=>slots[i]),instances:p.instances.map(instance=>({...structuredClone(instance),entityIds:keepSources.map(i=>instance.entityIds[i]),generatedConstraintIds:instance.generatedConstraintIds.filter(id=>!removedIds.has(id)),dimensionNames:Object.fromEntries(Object.entries(instance.dimensionNames).filter(([id])=>!removedIds.has(id)))}))}]:[]}
 const resolved=resolvePatternDimensions(doc,[],options)
 if(!resolved.ok)return resolved
 doc=resolved.document
 let dof:number
 if(doc.patterns.length){
  const result=await solvePatternCandidate(doc,reconfigurePersistentPattern(doc,p.id,p.config))
  if(!result.ok)return result
  doc=result.document;dof=result.dof
 }else if(doc.shapes.length){
  const result=await solveMoveCandidate(doc.shapes,{ok:true,shapes:doc.shapes,cons:doc.cons,selectedIndices:doc.shapes.map((_,i)=>i),targetShapes:doc.shapes})
  if(!result.ok)return result
  doc={...doc,shapes:result.shapes,cons:result.cons};dof=result.dof
 }else dof=0
 const indexMap:Record<number,number>={}
 input.entityIds.forEach((id,i)=>{const j=doc.entityIds.indexOf(id);if(j>=0)indexMap[i]=j})
 return {ok:true,document:doc,indexMap,removedEntityIds:[...removed],removedConstraintIds:[...removedIds],dof}
}
