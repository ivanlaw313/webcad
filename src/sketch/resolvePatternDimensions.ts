import type { PatternDocument } from './persistentPatterns'
import type { SkCon } from './freesolve'
export type PatternDimensionOptions = {
 evaluate:(expression:string,variables:Map<string,number>)=>number|null
 parameters?:{id:string;name:string;value:number}[]
}
type Dim=Extract<SkCon,{kind:'dim'}>
/** Resolves base dimensions in dependency order. Parameter values are supplied already
 * resolved; this function does not evaluate parameter definitions or access global state.
 * Without an evaluator, unchanged symbolic formulas retain their pre-resolved values;
 * an affected symbolic formula is rejected rather than silently retaining a stale value.
 */
export function resolvePatternDimensions(input:PatternDocument,editedIds:Iterable<string>,options?:PatternDimensionOptions):{ok:true;document:PatternDocument;changedIds:string[]}|{ok:false;reason:string}{
 try{
  const doc=structuredClone(input),owned=new Set(doc.patterns.flatMap(p=>p.instances.flatMap(i=>i.generatedConstraintIds))),dims=doc.cons.filter((c):c is Dim=>c.kind==='dim'),byId=new Map(dims.map(d=>[d.id,d])),byName=new Map(dims.filter(d=>d.name).map(d=>[d.name!,d]))
  if(byId.size!==dims.length||byName.size!==dims.filter(d=>d.name).length)throw Error('Duplicate dimension identities or names.')
  const parameters=options?.parameters??[],paramById=new Map(parameters.map(p=>[p.id,p])),paramByName=new Map(parameters.map(p=>[p.name,p]))
  if(paramById.size!==parameters.length||paramByName.size!==parameters.length||parameters.some(p=>!p.id||!p.name||!Number.isFinite(p.value)))throw Error('Invalid or duplicate parameter identities or values.')
  const changed=new Set(editedIds),state=new Map<string,'visiting'|'done'>()
  const valid=(d:Dim,value:number)=>Number.isFinite(value)&&(value>0||value===0&&(d.type==='hdist'||d.type==='vdist'))
  const tokens=(expression:string)=>[...new Set((expression.match(/(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?|[A-Za-z_一-龥][\w一-龥]*/g)??[]).filter(t=>/^[A-Za-z_一-龥]/.test(t)))]
  const constants=new Set(['pi','PI','e','tau','TAU'])
  function visit(d:Dim):number{
   if(owned.has(d.id))throw Error(`Base dimension depends on generated dimension ${d.id}; this dependency is unsupported.`)
   if(state.get(d.id)==='visiting')throw Error(`Dimension dependency cycle at ${d.id}.`)
   if(state.get(d.id)==='done')return d.value
   state.set(d.id,'visiting')
   let value=d.value,affected=changed.has(d.id)
   const dependency=(other:Dim)=>{const v=visit(other);if(changed.has(other.id))affected=true;return v}
   const bound=(id:string):number=>{
    if(id.startsWith('dimension:')){const other=byId.get(id.slice(10));if(!other)throw Error(`Missing dimension reference ${id}.`);return dependency(other)}
    const parameter=paramById.get(id);if(parameter)return parameter.value
    const other=byId.get(id);if(other)return dependency(other)
    throw Error(`Missing bound reference ${id}.`)
   }
   if(d.expr){
    const vars=new Map(parameters.map(p=>[p.name,p.value]))
    // Validate explicit references even when the corresponding token is now unused.
    for(const [token,id]of Object.entries(d.refs??{}))vars.set(token,bound(id))
    for(const token of tokens(d.expr)){
     if(d.refs?.[token]||paramByName.has(token))continue
     const other=byName.get(token);if(other){vars.set(token,dependency(other));continue}
     if(constants.has(token)||new RegExp(`${token}\\s*\\(`).test(d.expr))continue
     throw Error(`Missing dimension or parameter ${token}.`)
    }
    const literal=d.expr.trim(),numeric=literal!==''?Number(literal):NaN
    if(Number.isFinite(numeric))value=numeric
    else if(options){const result=options.evaluate(d.expr,vars);if(result===null||!Number.isFinite(result))throw Error(`Formula ${d.id} cannot be evaluated.`);value=result}
    else if(affected)throw Error(`Formula ${d.id} requires parameter-aware reevaluation before editing its source dimension.`)
   }else if(d.paramId){const p=paramById.get(d.paramId);if(!p)throw Error(`Missing parameter reference ${d.paramId}.`);value=p.value}
   else if(d.param){const p=paramByName.get(d.param);if(!p)throw Error(`Missing parameter ${d.param}.`);value=p.value}
   if(!valid(d,value))throw Error(`Dimension ${d.id} would create degenerate or non-finite geometry.`)
   if(value!==d.value)changed.add(d.id)
   d.value=value;state.set(d.id,'done');return value
  }
  for(const d of dims)if(!owned.has(d.id))visit(d)
  return {ok:true,document:doc,changedIds:[...changed]}
 }catch(error){return {ok:false,reason:error instanceof Error?error.message:'Pattern dimensions could not be resolved.'}}
}
