import { lengthScale } from '../io/units'
import { useApp, evalExpr } from '../store'
import { dimensionExpression, parameterId } from '../cad/dimensionExpression'
export function ExpressionInput({text, onText, scale, bindingRefs, label = '距离表达式'}:{text:string;onText:(s:string)=>void;label?:string;scale?:number;bindingRefs?:Record<string,string>}) {
 const params=useApp(s=>s.params)
 const unit=useApp(s=>s.unit)
 const r=dimensionExpression(text,params,evalExpr,'mm',bindingRefs,scale ?? lengthScale(unit))
 const renamed=Object.entries(bindingRefs ?? {}).map(([token,id])=>{const p=params.find(p=>parameterId(p)===id);return p&&p.name!==token&&new RegExp(`(^|[^\\w])${token}([^\\w]|$)`).test(text)?`${token} → ${p.name}`:null}).filter(Boolean)
 return <div className="dimension-expression">
  <input aria-label={label} type="text" value={text} aria-invalid={!!r.error} onChange={e=>onText(e.target.value)} onFocus={e=>e.currentTarget.select()} autoComplete="off" spellCheck={false} />
  <small role="status" className={r.error?'input-error':''}>{r.error ?? `ƒx = ${Number(r.value.toFixed(4))} mm`}</small>
  {renamed.length>0 && <small>保留引用：{renamed.join('、')}</small>}
 </div>
}
