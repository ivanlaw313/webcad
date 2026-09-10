import {type SketchPrimitive,type SketchParam,type SketchGeometry} from '@salusoft89/planegcs'
type Primitive=SketchPrimitive|SketchParam
type Offset=[number,number]
export type NativeTranslation={ok:true;primitives:Primitive[];offset:Offset;vectorIds:Set<string>;restore:(geometry:SketchGeometry[])=>SketchGeometry[]}|{ok:false;reason:string}
/** Normalize native positions only. Difference RHS point objects represent vectors,
 * not locations; translating them changes the equations and is explicitly forbidden. */
export function prepareNativeTranslation(input:Primitive[],requested?:Offset):NativeTranslation{
 const vectors=new Set<string>()
 for(const p of input)if(p.type==='difference'&&typeof p.difference==='object')vectors.add(String(p.difference.o_id))
 const points=input.filter((p):p is Extract<SketchPrimitive,{type:'point'}>=>p.type==='point'),model=points.filter(p=>/^p\d+(?:_\d+)?$/.test(String(p.id))&&!vectors.has(String(p.id)))
 const samples=model.length?model:points.filter(p=>!vectors.has(String(p.id)))
 if(samples.some(p=>typeof p.x!=='number'||typeof p.y!=='number'||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return{ok:false,reason:'Non-numeric positional native point cannot be normalized.'}
 const offset:Offset=requested??(samples.some(p=>Math.max(Math.abs(Number(p.x)),Math.abs(Number(p.y)))>1e4)?[samples.reduce((sum,p)=>sum+Number(p.x),0)/samples.length,samples.reduce((sum,p)=>sum+Number(p.y),0)/samples.length]:[0,0])
 if(!offset.every(Number.isFinite))return{ok:false,reason:'Invalid normalization offset.'}
 if(offset[0]===0&&offset[1]===0)return{ok:true,primitives:input,offset,vectorIds:vectors,restore:geometry=>geometry}
 const vectorUse=(value:unknown,path:string[]):boolean=>{
   if(Array.isArray(value))return value.some((v,i)=>vectorUse(v,[...path,String(i)]))
   if(value&&typeof value==='object')return Object.entries(value).some(([k,v])=>vectorUse(v,[...path,k]))
   return typeof value==='string'&&vectors.has(value)&&path.at(-1)!=='id'&&!(path.length===2&&path[0]==='difference'&&path[1]==='o_id')
 }
 for(const p of input)if(vectorUse(p,[]))return{ok:false,reason:'A vector auxiliary is also used as positional geometry.'}
 const primitives:Primitive[]=[]
 for(const p of input){
   if(p.type==='point'&&!vectors.has(String(p.id))){if(typeof p.x!=='number'||typeof p.y!=='number'||!Number.isFinite(p.x)||!Number.isFinite(p.y))return{ok:false,reason:'Unsupported positional coordinate binding.'};primitives.push({...p,x:p.x-offset[0],y:p.y-offset[1]})}
   else if(p.type==='coordinate_x'||p.type==='coordinate_y'){
     const prop=p.type==='coordinate_x'?'x':'y',value=prop==='x'&&'x'in p?p.x:'y'in p?p.y:undefined
     if(typeof value!=='number'||!Number.isFinite(value))return{ok:false,reason:'Unsupported absolute coordinate binding.'}
     primitives.push({...p,[prop]:value-offset[prop==='x'?0:1]} as Primitive)
   }else primitives.push(structuredClone(p))
 }
 return{ok:true,primitives,offset,vectorIds:vectors,restore:geometry=>geometry.map(p=>p.type==='point'&&!vectors.has(String(p.id))?{...p,x:p.x+offset[0],y:p.y+offset[1]}:p)}
}
