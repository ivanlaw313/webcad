/**
 * 特徵對話框嘅數值欄政策接線（純邏輯，headless 測得到）。
 *
 * 外部 QA（Grok，v2.15）報：
 *   · BUG-417 已經出咗錯誤訊息，但「確定」掣仍然撳得（撳咗先驗證）
 *   · BUG-409 數值欄靜默換值（NaN／abc／1e9 變成預設值或 0，冇提示）
 *
 * 根因：`setFeatParam` 收嘅係 `Number(e.target.value)` —— 原文喺呢一刻已經冇咗。
 * `Number('abc')` 同 `Number('')` 都唔係一個「用戶意圖」，但下游 `+p.x || 預設`
 * 會把佢靜靜變成數字，於是「打錯字」同「冇打」都變成「照建一個錯尺寸」。
 *
 * ★ 設計決定：增量兼容，唔做大改寫 ★
 * 全面把 setFeatParam 改收字串風險太高（featDlg 有 50+ 種 kind、幾百個欄位）。
 * 改為加一條 optional 原文通道 `paramRaw`：
 *   · 有 raw 嘅欄位 → 受政策管（唔准靜默換值、確定掣會停用）
 *   · 冇 raw 嘅欄位 → 行為【逐字不變】
 * 所以可以一個對話框一個對話框遷移。
 *
 * ⚠ 呢個檔【唔准】import store —— 住喺 monolith 入面就頭都測唔到
 *   （本 repo 嘅 store-backed 測試喺 Node 會撞循環依賴）。
 */
import { firstBlockingReason, parseField, type NumericFieldKey, type NumericResult } from './numericInput'

/** 對話框快照（只要呢三樣，所以唔使拉 AppState 入嚟）。 */
export interface FeatDlgLike {
  kind: string
  params: Record<string, number | string>
  paramRaw?: Record<string, string>
}

/**
 * kind → param 名 → 政策欄位。
 *
 * ★ 一定要按 kind scope ★ —— 同一個 param 名喺唔同對話框意思唔同
 * （例如 'angle' 喺 draft 係拔模角，喺 circpattern 係總角度）。
 * 唔 scope 就會用錯 spec 去驗，出一個又係「理由同輸入唔符」嘅訊息。
 */
export const FEAT_PARAM_SPEC: Record<string, Record<string, NumericFieldKey>> = {
  pattern: {
    countX: 'patternCount', countY: 'patternCount', countZ: 'patternCount',
    dx: 'patternSpacing', dy: 'patternSpacing', dz: 'patternSpacing',
  },
  cpattern: { count: 'patternCount' },
  /* BD16-02：QA 報 Box 長度欄紅框時「確定」掣仍然撳得、清空靜默變返 80。
   * 接落同一條 paramRaw 通道就自動有：空白同非法都會令 firstBlockingReason
   * 返原因 → commit 擋住 + 確定掣停用 + alert 講真原因。 */
  box: { l: 'boxLength', w: 'boxWidth', h: 'boxHeight' },
  wedge: { l: 'boxLength', w: 'boxWidth', h: 'boxHeight' },
  cylinder: { d: 'bodyDiameter', h: 'boxHeight' },
  sphere: { d: 'bodyDiameter' },
  circpattern: { count: 'patternCount' },
  draft: { angle: 'draftAngle' },
  splitbody: { offset: 'splitPosition' },
}

/** 今次對話框入面，有原文記錄嘅欄位嘅 parse 結果。 */
export function featParamResults(d: FeatDlgLike): NumericResult[] {
  const specs = FEAT_PARAM_SPEC[d.kind]
  if (!specs || !d.paramRaw) return []
  const out: NumericResult[] = []
  for (const key of Object.keys(d.paramRaw)) {
    const specKey = specs[key]
    if (!specKey) continue
    out.push(parseField(specKey, d.paramRaw[key]))
  }
  return out
}

/**
 * 有嘢阻住提交就返原因，否則 null。
 * ★ commit 同「確定」掣一定要共用呢一個函數 ★ —— 兩邊各寫一套遲早唔同步，
 *   而唔同步嘅症狀就係 BUG-417（掣話得、commit 話唔得）。
 */
export function featDlgBlockingReason(d: FeatDlgLike | null): string | null {
  if (!d) return null
  return firstBlockingReason(featParamResults(d))
}
