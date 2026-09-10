import type { SketchShape } from '../store'
import type { PatternDocument } from './persistentPatterns'
import { reconfigurePersistentPattern } from './persistentPatterns'
import { solvePatternCandidate } from './solvePatternCandidate'
import { deletePatternSources } from './deletePatternSources'
import { constraintsAfterTrim } from './trimConstraints'
import { transformCopyShape, type CopyTransform } from './copyRelations'
import { planCircularPattern } from './patternTransforms'
import { resolvePatternDimensions, type PatternDimensionOptions } from './resolvePatternDimensions'
import type { SkCon, SkRef } from './freesolve'
const refs=(c:SkCon):SkRef[]=>[c.a,c.b,...('c'in c?[c.c]:[])].filter((r):r is SkRef=>!!r)
/** Replace source geometry with trimmed pieces, retaining the first entity ID and
 * allocating stable source slots for additional pieces. Existing generated references
 * must map to surviving geometry; ambiguous/lost external references reject the edit.
 */
export async function trimPatternSources(input:PatternDocument,shapeIndex:number,parts:SketchShape[],options?:PatternDimensionOptions):Promise<{ok:true;document:PatternDocument;indexMap:Record<number,number>;removedConstraintIds:string[];dof:number}|{ok:false;reason:string}>{
 const fail=(reason:string)=>({ok:false as const,reason})
 if(input.patterns.length!==1||!Number.isInteger(shapeIndex)||!input.shapes[shapeIndex])return fail('Trim requires a valid source/base contour in one pattern.')
 const pattern=input.patterns[0],valid=reconfigurePersistentPattern(input,pattern.id,pattern.config)
 if(!valid.ok)return valid
 const generated=new Set(pattern.instances.flatMap(i=>i.entityIds)),owned=new Set(pattern.instances.flatMap(i=>i.generatedConstraintIds)),sourceId=input.entityIds[shapeIndex]
 if(generated.has(sourceId))return fail('Generated contours are managed by the pattern; trim the source or detach the pattern first.')
 const source=input.shapes[shapeIndex]
 if(source.type==='poly'&&source.projectLink)return fail('Detach projected geometry before trimming its topology.')
 if(!parts.length)return deletePatternSources(input,[shapeIndex],options)
 if(parts.some(p=>p.type!=='poly'||(p.verts??p.pts).length<2)||parts.length>100)return fail('Invalid trim pieces.')
 let doc=structuredClone(input)
 const slotIndex=pattern.sourceEntityIds.indexOf(sourceId),slots=pattern.sourceSlots??pattern.sourceEntityIds.map((_,i)=>i),newSlots:number[]=[],newIds:string[]=[]
 let slot=Math.max(-1,...slots)+1
 for(let i=1;i<parts.length;i++){
  while(input.entityIds.includes(`${pattern.id}:source:${slot}`)||pattern.instances.some(instance=>input.entityIds.includes(`${pattern.id}:instance:${instance.key}:${slot}`)))slot++
  newSlots.push(slot);newIds.push(`${pattern.id}:source:${slot++}`)
 }
 const jobs:{id:string;parts:SketchShape[];ids:string[];instance:boolean}[]=[{id:sourceId,parts:structuredClone(parts),ids:[sourceId,...newIds],instance:false}]
 if(slotIndex>=0)for(const instance of pattern.instances){
  let transform:CopyTransform
  if(pattern.config.kind==='rectangular'){
   const [x,y]=instance.key.split(',').map(Number)
   transform={dx:x*pattern.config.dx,dy:y*pattern.config.dy,angleDeg:0,cx:0,cy:0}
  }else{
   const config=pattern.config,p=planCircularPattern(config.count,config.angle,config.cx,config.cy)
   if(!p.ok)return p
   transform=p.transforms[Number(instance.key)-1]
   if(!transform)return fail('Missing instance transform.')
  }
  jobs.push({id:instance.entityIds[slotIndex],parts:parts.map(p=>transformCopyShape(p,transform)),ids:[instance.entityIds[slotIndex],...newSlots.map(slot=>`${pattern.id}:instance:${instance.key}:${slot}`)],instance:true})
 }
 for(const job of jobs){
  const index=doc.entityIds.indexOf(job.id),beforeIds=new Set(doc.cons.map(c=>c.id)),external=doc.cons.filter(c=>!owned.has(c.id)&&refs(c).some(r=>'shape'in r&&r.shape===index))
  const trimmed=constraintsAfterTrim(doc.shapes,index,job.parts,doc.cons)
  if(job.instance){
   if(external.some(c=>!trimmed.cons.some(n=>n.id===c.id)))return fail('An external constraint on the generated contour has no surviving trim reference.')
   // Instance endpoint inference must not invent independent pattern constraints.
   // A user's full-circle Fix does require its additional radius lock to survive.
   const userCircleFix=external.some(c=>c.kind==='con'&&c.type==='fix'&&c.a.kind==='circle'&&c.a.shape===index)
   trimmed.cons=trimmed.cons.filter(c=>beforeIds.has(c.id)||userCircleFix&&c.kind==='dim'&&c.type==='rad')
  }
  doc.shapes=[...doc.shapes.filter((_,i)=>i!==index),...job.parts]
  doc.entityIds=[...doc.entityIds.filter((_,i)=>i!==index),...job.ids]
  doc.cons=trimmed.cons
 }
 const currentIds=new Set(doc.cons.map(c=>c.id)),removed=input.cons.filter(c=>!currentIds.has(c.id)),removedIds=new Set(removed.map(c=>c.id)),removedNames=new Set(removed.flatMap(c=>c.kind==='dim'&&c.name?[c.name]:[])),paramNames=new Set(options?.parameters?.map(p=>p.name)??[])
 for(const c of doc.cons)if(c.kind==='dim'){
  if(Object.values(c.refs??{}).some(id=>removedIds.has(id.startsWith('dimension:')?id.slice(10):id))||(c.expr?.match(/[A-Za-z_一-龥][\w一-龥]*/g)??[]).some(t=>removedNames.has(t)&&!c.refs?.[t]&&!paramNames.has(t)))return fail(`Surviving formula ${c.id} references a removed dimension.`)
 }
 const registry=doc.patterns[0]
 registry.sourceSlots=[...slots]
 if(slotIndex>=0){registry.sourceEntityIds.push(...newIds);registry.sourceSlots.push(...newSlots)}
 for(const instance of registry.instances){
  if(slotIndex>=0)instance.entityIds.push(...newSlots.map(slot=>`${pattern.id}:instance:${instance.key}:${slot}`))
  instance.generatedConstraintIds=instance.generatedConstraintIds.filter(id=>currentIds.has(id))
  instance.dimensionNames=Object.fromEntries(Object.entries(instance.dimensionNames).filter(([id])=>currentIds.has(id)))
 }
 const resolved=resolvePatternDimensions(doc,[],options)
 if(!resolved.ok)return resolved
 const result=await solvePatternCandidate(resolved.document,reconfigurePersistentPattern(resolved.document,pattern.id,pattern.config))
 if(!result.ok)return result
 const indexMap:Record<number,number>={};input.entityIds.forEach((id,i)=>{const j=result.document.entityIds.indexOf(id);if(j>=0)indexMap[i]=j})
 return {ok:true,document:result.document,indexMap,removedConstraintIds:[...removedIds],dof:result.dof}
}
