import {parameterId,type Parameter} from '../cad/dimensionExpression'
export type SketchParameterSnapshot=Array<{id:string;value:Parameter|null}>
function uniqueIds(ids:string[]){
 if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)throw new Error('Sketch parameter history requires unique nonempty IDs')
}
function validateParameters(params:Parameter[]){uniqueIds(params.map(parameterId))}
/** Capture only parameters owned by this sketch transaction, including absence. */
export function captureSketchParameters(params:Parameter[],ids:string[]):SketchParameterSnapshot{
 validateParameters(params);uniqueIds(ids)
 return ids.map(id=>({id,value:structuredClone(params.find(p=>parameterId(p)===id)??null)}))
}
/** Preserve unrelated values and relative order. Restored missing entries append in snapshot order. */
export function restoreSketchParameters(params:Parameter[],snapshot:SketchParameterSnapshot):Parameter[]{
 validateParameters(params);uniqueIds(snapshot.map(item=>item.id))
 for(const item of snapshot)if(item.value!==null&&parameterId(item.value)!==item.id)throw new Error('Sketch parameter history value does not match its ID')
 const replacements=new Map(snapshot.map(item=>[item.id,item.value])),seen=new Set<string>()
 const result:Parameter[]=[]
 for(const parameter of params){
  const id=parameterId(parameter);seen.add(id)
  const value=replacements.has(id)?replacements.get(id)!:parameter
  if(value!==null)result.push(structuredClone(value))
 }
 for(const {id,value}of snapshot)if(!seen.has(id)&&value!==null)result.push(structuredClone(value))
 return result
}
