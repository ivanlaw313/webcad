import type {SkCon} from './freesolve'
import {parseLen,lengthScale,type LenUnit} from '../io/units'
import {dimensionExpression,parameterId,parameterExpressionRefs,assertParameterAcyclic,type Parameter} from '../cad/dimensionExpression'
type Dim=Extract<SkCon,{kind:'dim'}>
type Evaluator=(expression:string,vars:Map<string,number>)=>number|null
export function parseDimensionEditInput({con,raw,unit,radDia,params,cons,evaluate}:{con:Dim;raw:string;unit:LenUnit;radDia?:{type:'rad'|'dia';flip:boolean};params:Parameter[];cons:SkCon[];evaluate:Evaluator}):{ok:true;patch:Partial<Dim>}|{ok:false;error:string}{
 const fail=(error:string)=>({ok:false as const,error}),body=raw.trim().replace(/^=/,'').trim()
 if(!body)return fail('请输入完整尺寸')
 const angle=con.type==='angle',valid=(n:number)=>Number.isFinite(n)&&(con.type==='hdist'||con.type==='vdist'?n>=0:n>0)
 const numeric=angle?(/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*(?:deg|°))?$/.test(body)?Number(body.replace(/\s*(?:deg|°)$/,'')):null):parseLen(body,unit)
 const symbols=[...params,...cons.flatMap(c=>c.kind==='dim'&&c.name&&!params.some(p=>p.name===c.name)?[{id:'dimension:'+c.id,name:c.name,value:c.value}]:[])]
 const tokens=body.match(/[A-Za-z_一-龥][\w一-龥]*/g)??[]
 const symbolic=tokens.some(token=>symbols.some(p=>p.name===token)||Object.hasOwn(con.refs??{},token))
 if(numeric!==null||!symbolic){
  const parsed=numeric!==null?{value:numeric}:dimensionExpression(body,[],evaluate,angle?'deg':'mm',undefined,angle?1:lengthScale(unit))
  if(parsed.value===undefined)return fail('尺寸无法计算；请检查数值、单位及语法')
  const value=radDia?.flip?parsed.value*(radDia.type==='rad'?.5:2):parsed.value
  if(!valid(value))return fail('尺寸必须为有限正数；水平／垂直距离可为零')
  return {ok:true,patch:{value,param:undefined,paramId:undefined,expr:undefined,refs:undefined}}
 }
 const direct=params.find(p=>p.name===body)
 if(direct){if(!valid(direct.value))return fail('参数尺寸数值无效');return {ok:true,patch:{value:direct.value,param:direct.name,paramId:parameterId(direct),expr:undefined,refs:undefined}}}
 const refs=parameterExpressionRefs(body,symbols,con.refs),vars=new Map(symbols.filter(p=>p.id!=='dimension:'+con.id).map(p=>[p.name,p.value]))
 for(const [token,id]of Object.entries(refs))vars.set(token,symbols.find(p=>parameterId(p)===id)?.value??NaN)
 try{assertParameterAcyclic(cons.flatMap(c=>c.kind==='dim'&&c.name?[{id:'dimension:'+c.id,name:c.name,value:c.value,expr:c.id===con.id?body:c.expr,refs:c.id===con.id?refs:c.refs}]:[]))}catch{return fail('尺寸循环引用，已拒绝')}
 const value=evaluate(body,vars)
 if(value===null||!valid(value))return fail('公式无法计算或结果无效')
 return {ok:true,patch:{value,expr:body,refs,param:undefined,paramId:undefined}}
}
