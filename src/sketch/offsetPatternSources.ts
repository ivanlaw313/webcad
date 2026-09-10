import type { PatternDocument } from './persistentPatterns'
import { reconfigurePersistentPattern } from './persistentPatterns'
import { solvePatternCandidate } from './solvePatternCandidate'
import { resolvePatternDimensions, type PatternDimensionOptions } from './resolvePatternDimensions'
import type { SkCon } from './freesolve'
export type PatternCircleOffset={distance:number;parameterId:string;parameterName:string}
/** Exact associative circle offset. The returned parameter must be persisted in the
 * same transaction as the document. Its signed value is the editable radial gap.
 * Non-pattern base shapes and generated selections require different operations.
 */
export async function offsetPatternSources(input:PatternDocument,sourceIndex:number,config:PatternCircleOffset,options?:PatternDimensionOptions):Promise<{ok:true;document:PatternDocument;distanceParameter:{id:string;name:string;value:number};sourceRadiusId:string;offsetRadiusId:string;newEntityIds:string[];newShapeIndices:number[];dof:number}|{ok:false;reason:string}>{
 const fail=(reason:string)=>({ok:false as const,reason})
 if(input.patterns.length!==1||!Number.isInteger(sourceIndex)||!Number.isFinite(config.distance)||config.distance===0||!config.parameterId||!/^[A-Za-z_一-龥][\w一-龥]*$/.test(config.parameterName))return fail('Choose one pattern circle and a finite nonzero offset with a valid unique parameter name.')
 const pattern=input.patterns[0],valid=reconfigurePersistentPattern(input,pattern.id,pattern.config)
 if(!valid.ok)return valid
 const sourceId=input.entityIds[sourceIndex],sourceSlot=pattern.sourceEntityIds.indexOf(sourceId),source=input.shapes[sourceIndex]
 if(sourceSlot<0)return fail('Choose an original circle belonging to the pattern, not a generated instance or unrelated contour.')
 if(source?.type!=='circle'||source.point||!source.c.every(Number.isFinite)||!Number.isFinite(source.r)||source.r<=0)return fail('This associative offset supports full native circles only.')
 const radius=source.r+config.distance
 if(!Number.isFinite(radius)||radius<=1e-8)return fail('Offset would collapse the circle.')
 const params=options?.parameters??[]
 if(params.some(p=>p.id===config.parameterId||p.name===config.parameterName)||input.cons.some(c=>c.id===config.parameterId||c.kind==='dim'&&c.name===config.parameterName))return fail('Offset parameter identity or name is already used.')
 const doc=structuredClone(input),p=doc.patterns[0],usedIds=new Set([...doc.cons.map(c=>c.id),...doc.entityIds,config.parameterId]),usedNames=new Set([...params.map(p=>p.name),...doc.cons.flatMap(c=>c.kind==='dim'&&c.name?[c.name]:[]),config.parameterName])
 const id=(base:string)=>{let v=base;while(usedIds.has(v))v+='_';usedIds.add(v);return v},name=(base:string)=>{let v=base;while(usedNames.has(v))v+='_';usedNames.add(v);return v}
 const circleRef={kind:'circle' as const,shape:sourceIndex}
 let sourceDim=doc.cons.find(c=>c.kind==='dim'&&!c.driven&&(c.type==='rad'||c.type==='dia')&&c.a.kind==='circle'&&c.a.shape===sourceIndex) as Extract<SkCon,{kind:'dim'}>|undefined
 if(!sourceDim){sourceDim={id:id(`${p.id}:offset-source-radius:${sourceSlot}`),name:name('SourceRadius'),kind:'dim',type:'rad',a:circleRef,value:source.r};doc.cons.push(sourceDim)}
 else if(!sourceDim.name)sourceDim.name=name('SourceRadius')
 const sourceRadiusId=sourceDim.id,slots=p.sourceSlots??p.sourceEntityIds.map((_,i)=>i)
 let slot=Math.max(...slots,-1)+1
 while(usedIds.has(`${p.id}:source:${slot}`)||p.instances.some(i=>usedIds.has(`${p.id}:instance:${i.key}:${slot}`)))slot++
 const offsetId=`${p.id}:source:${slot}`,offsetIndex=doc.shapes.length
 doc.entityIds.push(offsetId);doc.shapes.push({...structuredClone(source),r:radius})
 p.sourceSlots=[...slots,slot];p.sourceEntityIds.push(offsetId)
 // Exact placeholders preserve registry validity before regeneration. A circle's
 // offset shares its transformed source centre for rectangular and circular arrays.
 for(const instance of p.instances){
  const index=doc.entityIds.indexOf(instance.entityIds[sourceSlot]),original=doc.shapes[index]
  if(original?.type!=='circle')return fail('Pattern circle instance is invalid.')
  const generatedId=`${p.id}:instance:${instance.key}:${slot}`
  instance.entityIds.push(generatedId);doc.entityIds.push(generatedId);doc.shapes.push({...structuredClone(original),r:radius})
 }
 const offsetRadiusId=id(`${p.id}:offset-radius:${slot}`),distanceParameter={id:config.parameterId,name:config.parameterName,value:config.distance}
 doc.cons.push({id:id(`${p.id}:offset-concentric:${slot}`),kind:'con',type:'concentric',a:circleRef,b:{kind:'circle',shape:offsetIndex}},
  {id:offsetRadiusId,name:name('OffsetRadius'),kind:'dim',type:'rad',a:{kind:'circle',shape:offsetIndex},value:radius,expr:`${sourceDim.name}${sourceDim.type==='dia'?' / 2':''} + ${config.parameterName}`,refs:{[sourceDim.name!]:`dimension:${sourceDim.id}`,[config.parameterName]:config.parameterId}})
 if(!options?.evaluate)return fail('Associative offset requires the shared expression evaluator.')
 const resolved=resolvePatternDimensions(doc,[sourceRadiusId,offsetRadiusId],{...options,parameters:[...params,distanceParameter]})
 if(!resolved.ok)return resolved
 const result=await solvePatternCandidate(resolved.document,reconfigurePersistentPattern(resolved.document,p.id,p.config))
 return result.ok?{ok:true,document:result.document,distanceParameter,sourceRadiusId,offsetRadiusId,newEntityIds:result.document.entityIds.filter(id=>!input.entityIds.includes(id)),newShapeIndices:result.document.entityIds.flatMap((id,i)=>input.entityIds.includes(id)?[]:[i]),dof:result.dof}:result
}
