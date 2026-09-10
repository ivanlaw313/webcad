import type { SkCon } from './freesolve'
import { parameterId, type Parameter } from '../cad/dimensionExpression'

// Validate identity, never repair a missing ID by rebinding a same-named symbol.
export function sketchReferenceErrors(cons: SkCon[], params: Parameter[]): string[] {
  const dimensions = new Set(cons.filter(c => c.kind === 'dim').map(c => `dimension:${c.id}`))
  const parameters = new Set(params.map(parameterId))
  const names = new Set([...params.map(p => p.name), ...cons.flatMap(c => c.kind === 'dim' && c.name ? [c.name] : [])])
  const errors: string[] = []
  for (const c of cons) {
    if (c.kind !== 'dim') continue
    const label = c.name || c.id
    if (c.paramId && !parameters.has(c.paramId)) errors.push(`${label} → 参数 ${c.paramId} 不存在`)
    else if (c.param && !c.paramId && !params.some(p => p.name === c.param)) errors.push(`${label} → 参数 ${c.param} 不存在`)
    for (const [token, id] of Object.entries(c.refs ?? {})) {
      if (!(id.startsWith('dimension:') ? dimensions : parameters).has(id)) errors.push(`${label} → ${token} [${id}] 不存在`)
    }
    // Legacy name-only formulas must also reject a removed dimension, but leave
    // function names/constants to the existing expression evaluator.
    if (c.expr) for (const token of c.expr.match(/[A-Za-z_一-龥][\w一-龥]*/g) ?? []) {
      if (/^d\d+$/.test(token) && !c.refs?.[token] && !names.has(token)) errors.push(`${label} → ${token} 不存在`)
    }
  }
  return [...new Set(errors)]
}

export function documentReferenceErrors(data: unknown): string[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return []
  const doc = data as { params?: Parameter[]; sketchDraft?: {skCons?: SkCon[]}; sketchSources?: Record<string,{cons?: SkCon[]}>; components?: {src?: unknown}[]; componentDefs?: {src?: unknown;bodies?:{src?:unknown}[]}[] }
  const errors = Object.entries(doc.sketchSources ?? {}).flatMap(([id, src]) => sketchReferenceErrors(src.cons ?? [], doc.params ?? []).map(e => `${id}: ${e}`))
  if (Array.isArray(doc.sketchDraft?.skCons)) {
    const cons=doc.sketchDraft.skCons
    if(cons.every(c=>c && typeof c==='object' && (c.kind!=='dim' || ((!c.expr || typeof c.expr==='string') && (!c.refs || Object.values(c.refs).every(v=>typeof v==='string')))))) errors.push(...sketchReferenceErrors(cons,doc.params??[]).map(e=>`未完成草圖: ${e}`))
    else errors.push('未完成草圖約束格式不正確')
  }
  for (const c of doc.components ?? []) if (c.src) errors.push(...documentReferenceErrors({params:doc.params,...c.src}))
  for (const d of doc.componentDefs ?? []) {
    if (d.src) errors.push(...documentReferenceErrors({params:doc.params,...d.src}))
    for (const b of d.bodies ?? []) if (b.src) errors.push(...documentReferenceErrors({params:doc.params,...b.src}))
  }
  return errors
}
