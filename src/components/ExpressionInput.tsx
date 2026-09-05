import { lengthScale } from '../io/units'
import { useApp, evalExpr } from '../store'
import { dimensionExpression } from '../cad/dimensionExpression'
export function ExpressionInput({text, onText, scale, label = '距离表达式'}:{text:string;onText:(s:string)=>void;label?:string;scale?:number}) {
 const params=useApp(s=>s.params)
 const unit=useApp(s=>s.unit)
 const r=dimensionExpression(text,params,evalExpr,'mm',undefined,scale ?? lengthScale(unit))
 return <div className="dimension-expression">
  <input aria-label={label} type="text" value={text} aria-invalid={!!r.error} onChange={e=>onText(e.target.value)} onFocus={e=>e.currentTarget.select()} autoComplete="off" spellCheck={false} />
  <small role="status" className={r.error?'input-error':''}>{r.error ?? `ƒx = ${Number(r.value.toFixed(4))} mm`}</small>
 </div>
}
