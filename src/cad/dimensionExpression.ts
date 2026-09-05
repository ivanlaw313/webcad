// Unit/type validation layered over the application's existing safe evaluator.
// Values are still evaluated by evalExpr; no JavaScript evaluation is introduced.
export type Parameter = { id?: string; name: string; value: number; expr?: string; unit?: 'mm' | 'deg' | 'scalar'; refs?: Record<string, string>; comment?: string }
export type DimensionExpression = { expression: string; refs: Record<string, string>; implicitScale?: number; unit: 'mm' | 'deg' | 'scalar' }
type NumericEvaluator = (expression: string, vars: Map<string, number>) => number | null
const units: Record<string, [number, number, number]> = { mm:[1,1,0],cm:[10,1,0],m:[1000,1,0],in:[25.4,1,0],inch:[25.4,1,0],ft:[304.8,1,0],deg:[1,0,1],rad:[180/Math.PI,0,1] }
export const parameterId = (p: Parameter) => p.id ?? `legacy:${p.name}`
export function dimensionExpression(expression: string, params: Parameter[], evaluate: NumericEvaluator, expected: 'mm'|'deg'|'scalar' = 'mm', refs?: Record<string,string>, implicitScale = 1): { value: number; formula: DimensionExpression; error?: never } | { value?: never; formula?: never; error: string } {
 try {
  const tokens = expression.match(/(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?|[A-Za-z_一-龥][\w一-龥]*|[+\-*/()^%,]/g) ?? []
  if (!tokens.length || tokens.join('') !== expression.replace(/\s/g,'')) throw Error('表达式未完成或含无效字符')
  let i=0; const bound:Record<string,string>={}, vars=new Map<string,number>()
  type Q={ code:string; l:number; a:number; literal:boolean }
  const compatible=(a:Q,b:Q)=>a.l===b.l&&a.a===b.a
  const node=(code:string,l=0,a=0,literal=true):Q=>({code,l,a,literal})
  function primary():Q {
   const t=tokens[i++]; if(!t) throw Error('表达式未完成')
   if(t==='+'||t==='-'){const q=power();return {...q,code:`(${t}${q.code})`}}
   if(t==='('){const q=sum();if(tokens[i++]!==')')throw Error('括号未配对');return {...q,code:`(${q.code})`}}
   if(/^[.\d]/.test(t)) {const n=Number(t);if(!Number.isFinite(n))throw Error('数值无效');const u=units[tokens[i]];if(u){i++;return node(`(${n}*${u[0]})`,u[1],u[2],false)}return node(String(n))}
   if(!/^[A-Za-z_一-龥]/.test(t))throw Error('表达式未完成')
   if(tokens[i]==='('){
    i++;const args=[sum()];while(tokens[i]===','){i++;args.push(sum())}if(tokens[i++]!==')')throw Error('括号未配对')
    let q=args[0];
    if(['sin','cos','tan'].includes(t)){if(q.l)throw Error('三角函数需要角度');q=node('',0,0,false)}
    else if(['asin','acos','atan','atan2'].includes(t)){if(args.some(x=>x.l||x.a))throw Error('反三角函数需要无单位数');q=node('',0,1,false)}
    else if(t==='sqrt')q={...q,l:q.l/2,a:q.a/2}
    else if(['abs','round','floor','ceil','neg','min','max','hypot','mod'].includes(t)){if(args.some(x=>!compatible(q,x)&&!x.literal))throw Error('函数参数单位不相容')}
    else if(t==='pow'){if(args.length!==2||!args[1].literal)throw Error('指数需要无单位数');const power=evaluate(args[1].code,vars);if(power==null)throw Error('指数无效');q={...q,l:q.l*power,a:q.a*power}}
    else if(args.some(x=>x.l||x.a))throw Error('函数需要无单位数')
    return {...q,code:`${t}(${args.map(x=>x.code).join(',')})`}
   }
   const ref=refs?.[t];const p=ref?params.find(p=>parameterId(p)===ref):params.find(p=>p.name===t)
   if(p){bound[t]=parameterId(p);vars.set(t,p.value);return node(t,p.unit==='scalar'||p.unit==='deg'?0:1,p.unit==='deg'?1:0,false)}
   if(ref)throw Error(`引用参数已不存在：${t}`)
   if(['pi','PI','e','tau','TAU'].includes(t))return node(t)
   throw Error(`未知参数：${t}`)
  }
  function power():Q {let a=primary();if(tokens[i]==='^'){i++;const b=power();if(b.l||b.a)throw Error('指数需要无单位数');const v=evaluate(b.code,vars);if(v==null)throw Error('指数无效');a={...a,code:`(${a.code}^${b.code})`,l:a.l*v,a:a.a*v,literal:a.literal&&b.literal}}return a}
  function product():Q {let a=power();while(['*','/','%'].includes(tokens[i])){const op=tokens[i++],b=power();if(op==='%'&&!compatible(a,b))throw Error('余数单位不相容');a={code:`(${a.code}${op}${b.code})`,l:op==='%'?a.l:a.l+(op==='/'?-b.l:b.l),a:op==='%'?a.a:a.a+(op==='/'?-b.a:b.a),literal:a.literal&&b.literal}}return a}
  function sum():Q {let a=product();while(tokens[i]==='+'||tokens[i]==='-'){const op=tokens[i++];let b=product();if(!compatible(a,b)){if(a.literal)a={...a,l:b.l,a:b.a};else if(b.literal)b={...b,l:a.l,a:a.a};else throw Error('长度、角度或无单位数不相容')}a={...a,code:`(${a.code}${op}${b.code})`,literal:a.literal&&b.literal}}return a}
  const q=sum();if(i!==tokens.length)throw Error('表达式语法无效')
  const l=expected==='mm'?1:0,a=expected==='deg'?1:0
  if(!q.literal&&(q.l!==l||q.a!==a))throw Error(`此字段需要${expected==='mm'?'长度':expected==='deg'?'角度':'无单位数'}`)
  const v=evaluate(q.code,vars);if(v==null||!Number.isFinite(v))throw Error('无法计算：检查除零、函数及括号')
  return {value:v*(q.literal?implicitScale:1),formula:{expression,refs:bound,unit:expected,implicitScale}}
 }catch(e){return {error:e instanceof Error?e.message:'表达式无效'}}
}
