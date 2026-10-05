/**
 * NumInput ── 受驗數值輸入（純數量／角度／距離，非單位感知；長度用 LenInput）
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 【病根：type="number" 本身】
 * v2.17 QA（Grok）報 BUG-507／BUG-509，我第一輪去改 parser，完全冇用 —— 因為
 * 瀏覽器喺 JS 見到之前已經剝走符號。喺真 Chrome 逐鍵實測：
 *
 *     打 "1/4"      → 欄位 value = "014"   → 落刀 R14
 *     打 "3/8"      → "038"                → R38
 *     打 "10/0"     → "0100"               → 孔深 100
 *     打 "2*3"      → "023"                → 23×1
 *     打 "(40-4)/2" → ""                   → 代入預設值
 *
 * QA 報嘅每一個錯值都由呢一個機制重現。所以任何尺寸／數量欄【唔准】用
 * type="number"：剝完符號之後剩低嘅數字係一個合法但完全唔同嘅值，用戶睇唔出。
 *
 * 【政策】同 numericInput.ts 一條鐵律：永遠唔會返一個同用戶輸入無關嘅數字。
 *   · 合法        → onValue(v)
 *   · 非法／空白  → 【留住用戶打嘅字】+ 紅框 + title 講真原因 + onInvalid(reason)
 *   · 刻意唔夾值、唔代入預設 —— 嗰個正係 BUG-409 要根治嘅行為
 *
 * 【顯示唔會同 model 飄】未聚焦／冇打錯／冇清空嘅時候，顯示【直接由 value 推導】，
 * 冇 useEffect 同步窗口 —— 同 LenInput 一樣嘅結構性防 BUG-501 寫法。
 */
import { useEffect, useId, useState } from 'react'
import { useApp } from '../store'
import { parseNumericField, type NumericFieldSpec } from '../cad/numericInput'

export type NumInputProps = {
  value: number
  onValue: (v: number) => void
  /** 非法／空白嗰刻通知父層（用嚟閂「確定」掣）。空字串 = 返回合法。 */
  onInvalid?: (reason: string) => void
  label: string
  unit?: string
  min?: number
  max?: number
  minInclusive?: boolean
  integer?: boolean
  w?: number
  title?: string
  testId?: string
}

const fmt = (v: number) => {
  if (!Number.isFinite(v)) return ''
  return String(Math.round(v * 1e6) / 1e6)
}

export function NumInput({
  value, onValue, onInvalid, label, unit, min, max, minInclusive, integer,
  w = 66, title, testId,
}: NumInputProps) {
  const [txt, setTxt] = useState('')
  const [foc, setFoc] = useState(false)
  const spec: NumericFieldSpec = { label, unit, min, max, minInclusive, integer }
  const r = txt.trim() === '' ? null : parseNumericField(txt, spec)
  const bad = r != null && !r.ok
  const blank = foc && txt.trim() === ''
  /* ★ BUG-537/538 ★ 向 store 登記「我而家非法」—— 掣／Enter／commit 三邊查同一個真相。
   * 唔靠每個對話框記得查，所以漏接喺結構上唔可能發生。 */
  const gateId = useId()
  const reportNumericInvalid = useApp((st) => st.reportNumericInvalid)
  /* ★ BUG-560（我造成嘅 P1：React #185 無限更新迴圈）★
   * 第一版個 deps 放咗 `r` —— 佢係每次 render 都新建嘅物件，identity 次次唔同，
   * 所以 effect 次次都跑 → set → re-render → effect 再跑 → 視口面板直接崩潰。
   * ⚠ deps 只准放【原始值】。另外除名要擺喺【獨立嘅 unmount effect】，
   * 唔好同 report 擺埋一齊 —— 否則每個 keystroke 都會「清一次再設一次」，
   * 白白多一輪通知同 re-render。 */
  const invalidReason = bad ? ((r && !r.ok && r.reason) ? r.reason : '非法輸入') : ''
  useEffect(() => { reportNumericInvalid(gateId, invalidReason || null) }, [gateId, invalidReason, reportNumericInvalid])
  useEffect(() => () => reportNumericInvalid(gateId, null), [gateId, reportNumericInvalid])
  // 未聚焦／一切正常 → 顯示由 value 推導（冇同步窗口，顯示唔可能同 model 唔同）
  const shown = foc || bad ? txt : fmt(value)
  const reason = bad ? (r.reason ?? '') : blank ? `${label}：未輸入` : ''
  return (
    <input
      type="text" inputMode="decimal" value={shown} style={{ width: w, ...(bad ? { borderColor: '#b42318', outline: '1px solid #b42318' } : {}) }}
      title={reason || title || label} aria-label={title || label} aria-invalid={bad || undefined}
      data-testid={testId}
      onFocus={() => { setFoc(true); setTxt(fmt(value)) }}
      /* ★ 唔好 snap ★ 打錯咗要睇得到。只有合法嗰刻才交返 model 做顯示來源。 */
      onBlur={() => { setFoc(false); if (!bad) setTxt('') }}
      onChange={(e) => {
        const raw = e.target.value
        setTxt(raw)
        const res = parseNumericField(raw, spec)
        if (res.ok) { onValue(res.value); onInvalid?.('') }
        else onInvalid?.(res.reason ?? `${label}：無效`)
      }}
    />
  )
}
