/**
 * BUG-409 UI 側：受控數值欄嘅 draft 狀態。
 *
 * 舊寫法 `value={model.x} onChange={e => set({ x: Number(e.target.value) || 5 })}`
 * 有兩個病：
 *   1. 非法／空／超範圍 → `||` 靜默代入一個同用戶輸入無關嘅數字；
 *   2. input 嘅 value 綁死 model，所以用戶打錯之後**睇唔到自己打咗乜**。
 *
 * 呢個 hook 把「用戶打嘅字」同「model 數值」分開：
 *   - 字永遠保住（`value` 返 draft 原文）；
 *   - 只有 parseNumericField 判 ok 嗰刻才 `apply(value)` 寫 model；
 *   - 非法就出真原因（`error`），由 caller 停用確定掣。
 */
import { useCallback, useState } from 'react'
import { parseNumericField, type NumericFieldSpec, type NumericResult } from '../cad/numericInput'

export type NumericDraftField = {
  /** 擺落 <input value={...}>：用戶打咗嘅字原文。 */
  value: string
  onChange: (e: { target: { value: string } }) => void
  /** 非法原因（空白唔當錯，所以 blank 時係 null）。 */
  error: string | null
  /** 三態判決，caller 要用嚟停用確定掣。 */
  result: NumericResult
}

/**
 * @param current  model 現值（用戶未打過字就顯示佢）
 * @param spec     欄位規格
 * @param apply    只會喺合法嗰刻被叫
 */
export function useNumericDraft(
  current: number,
  spec: NumericFieldSpec,
  apply: (value: number) => void,
): NumericDraftField {
  const [draft, setDraft] = useState<string | null>(null)
  const raw = draft ?? (Number.isFinite(current) ? String(current) : '')
  const result = parseNumericField(raw, spec)

  const onChange = useCallback((e: { target: { value: string } }) => {
    const next = e.target.value
    setDraft(next)
    const r = parseNumericField(next, spec)
    if (r.ok) apply(r.value)
    // 唔 ok 就咩都唔寫落 model —— 唔靜默代入預設，亦唔靜默夾範圍。
  }, [apply, spec])

  return { value: raw, onChange, error: result.state === 'invalid' ? result.reason : null, result }
}
