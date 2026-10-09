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
  return firstBlockingReason(featParamResults(d)) ?? featDlgSemanticReason(d)
}

/** CORE16：唔靠原文都要擋嘅語義規則（確定掣停用 + 紅字；commit 共用）。 */
export function featDlgSemanticReason(d: FeatDlgLike): string | null {
  const p = d.params
  const num = (k: string) => Number(p[k])
  if (d.kind === 'pushpull-edit' && p.dist !== undefined && Number.isFinite(num('dist')) && num('dist') === 0) return '按拉距離不可為 0（正數＝拉出、負數＝壓入）'
  if (d.kind === 'revolve') {
    const a = num('angle')
    if (!(a > 0 && a <= 360)) return '旋轉角度必須大於 0° 且不超過 360°'
    if (num('wall') < 0) return '薄壁不可為負數'
  }
  if (d.kind === 'pattern') {
    // 只驗【已填且係有限數】嘅欄位 —— NaN／缺欄沿用舊行為（由 paramRaw 閘或 commit 處理）
    for (const k of ['countX', 'countY', 'countZ']) if (p[k] !== undefined && Number.isFinite(num(k)) && !(Number.isInteger(num(k)) && num(k) >= 1)) return '陣列數量必須是不小於 1 的整數'
    const sp = patternSpacings(p), keys = ['dx', 'dy', 'dz']
    if (sp.some(([c, v], i) => p[keys[i]] !== undefined && Number.isFinite(c) && c > 1 && Number.isFinite(v) && !(Math.abs(v) > 1e-6))) return '數量大於 1 的方向，間距不可為 0（所有實例會重疊在同一位置）'
  }
  // NaN／非有限值與 0／1／-1 同一提示（Number.isInteger(NaN) === false）
  if (d.kind === 'circpattern' && p.count !== undefined && !(Number.isInteger(num('count')) && num('count') >= 2)) return '環形陣列數量必須是不小於 2 的整數'
  if (d.kind === 'cone') {
    if (!(num('d') > 0)) return '底部直徑必須大於 0'
    if (!(num('h') > 0)) return '高度必須大於 0'
    if (num('dt') < 0) return '頂部直徑不可為負數'
  }
  if (d.kind === 'emboss') {
    if (!String(p.text ?? '').trim()) return '請輸入浮雕文字'
    if (!(num('depth') > 0)) return '浮雕深度必須大於 0（凸起／刻入用下方選項切換）'
    if (!(num('size') > 0)) return '字高必須大於 0'
  }
  if (d.kind === 'move') for (const k of ['dx', 'dy', 'dz', 'rx', 'ry', 'rz']) if (p[k] !== undefined && p[k] !== '' && !Number.isFinite(num(k))) return '移動距離／角度必須是數值'
  return null
}

/** 矩形陣列每方向 [數量, 實際間距]（dtype='extent' → 總跨距 ÷ (數量−1)）。 */
export function patternSpacings(p: Record<string, number | string | undefined>): [number, number][] {
  const ext = p.dtype === 'extent'
  const one = (cK: string, vK: string, def?: number): [number, number] => {
    const c = Math.round(Number(p[cK] ?? 1)), v = Number(p[vK] ?? def ?? 0)
    return [c, ext ? (c > 1 ? v / (c - 1) : 0) : v]
  }
  return [one('countX', 'dx'), one('countY', 'dy'), one('countZ', 'dz', 60)]
}

/** CORE16：矩形陣列實例重疊（間距細過實體沿該軸尺寸）→ 非阻擋警告（結果會合併成一體）。只適用世界軸方向。 */
export function patternOverlapWarning(d: FeatDlgLike | null, size: [number, number, number] | null): string | null {
  if (!d || d.kind !== 'pattern' || !size) return null
  const p = d.params
  if (p.objectType && p.objectType !== 'bodies') return null
  if (p.dir1 || p.dir2) return null
  const names = ['X', 'Y', 'Z']
  const sp = patternSpacings(p)
  for (let i = 0; i < 3; i++) {
    const [c, v] = sp[i]
    if (c > 1 && Math.abs(v) > 1e-6 && Math.abs(v) < size[i] - 1e-6) return `⚠ ${names[i]} 方向間距 ${+Math.abs(v).toFixed(3)} mm 小於實體尺寸 ${+size[i].toFixed(2)} mm — 實例會重疊並合併成一個實體`
  }
  return null
}
