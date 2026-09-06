import { parameterId, type Parameter } from './dimensionExpression'
import type { SkCon } from '../sketch/freesolve'

// Follow stable IDs through parameters and sketch dimensions, plus legacy feature bindings.
export function parameterUsage(params: Parameter[], sources: Record<string,{cons?:SkCon[]}>, bindings: Record<string,string>, features: {id:string;type:string;distanceExpression?:{refs:Record<string,string>}}[], live: SkCon[] = []) {
 const nodes = new Map<string,{label:string;refs:string[]}>()
 for (const p of params) nodes.set(parameterId(p),{label:`参数 ${p.name}`,refs:Object.values(p.refs ?? {})})
 const dimensions = (cons: SkCon[], sketch: string) => {
  for (const c of cons) if(c.kind==='dim') nodes.set(`dimension:${c.id}`,{label:`${sketch} · ${c.name || c.id}`,refs:[...Object.values(c.refs??{}),...(c.paramId?[c.paramId]:c.param?[parameterId(params.find(p=>p.name===c.param)??{name:c.param,value:0})]:[])]})
 }
 for(const [id,src] of Object.entries(sources)) dimensions(src.cons??[],id)
 dimensions(live,'当前草图')
 for(const f of features) if(f.distanceExpression) nodes.set(`feature:${f.id}`,{label:`特征 ${f.id}`,refs:Object.values(f.distanceExpression.refs)})
 for(const [key,name] of Object.entries(bindings)) { const p=params.find(p=>p.name===name);if(p)nodes.set(`binding:${key}`,{label:`特征尺寸 ${key}`,refs:[parameterId(p)]}) }
 return (p:Parameter):string[] => {
  const seen=new Set([parameterId(p)]), result:string[]=[]
  for(let changed=true;changed;) { changed=false;for(const [id,n] of nodes) if(!seen.has(id)&&n.refs.some(r=>seen.has(r))) {seen.add(id);result.push(n.label);changed=true} }
  return result
 }
}
