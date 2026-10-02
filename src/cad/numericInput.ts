/**
 * BUG-409 統一數值輸入政策（純邏輯，headless 測得到）。
 *
 * 【病根】全 app 到處都係 `Number(e.target.value) || 預設值` 同佢嘅變體
 * （`?? 預設`、`Math.max(min, Number(x) || d)`、`parseFloat(x) || d`、
 * 　`+p.l || 80`）。輸入 NaN / 空 / 非數字 / 超範圍嘅時候，`||` 就靜默
 * 代入一個同用戶輸入完全無關嘅數字，用戶睇唔到自己打錯咩，確定掣仲撳得，
 * 結果真係建出錯尺寸幾何（QA 實測：50×60×30、Ø1 孔、67.5mm 孔深…）。
 *
 * 【政策】呢個模組一條鐵律：**永遠唔會返一個同用戶輸入無關嘅數字。**
 *   - 解析失敗 → { ok: false, state: 'invalid', reason, raw }
 *   - 空白     → { ok: false, state: 'blank',   reason, raw }（未輸入，唔算打錯，但唔可以提交）
 *   - 超出範圍 → { ok: false, state: 'invalid', reason: '最大 400（你打咗 1e9）' }，**唔准靜默夾**
 *   - 合法     → { ok: true,  state: 'valid', value }
 *
 * reason 一定要講**真正原因**。舊行為最惡劣嘅兩個：輸入 1e9 但顯示「必須大於 0」、
 * 輸入 0 但顯示「圓角半徑太大」—— 理由錯過冇理由，呢個模組用 raw 原文砌訊息，
 * 冇可能再對錯。
 *
 * 【保住用戶打咗嘅字】呢個模組**唔會**改寫輸入。UI 層要用 `raw` 做 input 嘅
 * value（受控 draft 字串），淨係喺 ok === true 嗰刻才把 value 寫入 model。
 */

import { illegalRejectStatus } from '../ui/illegalInput'

/** 一個數值欄嘅規格（純資料，可以放 JSON 表，符合「調參表要可編輯」嘅規矩）。 */
export type NumericFieldSpec = {
  /** 欄位名，會出現喺訊息裡（例：「長度」、「孔徑Ø」）。 */
  label: string
  /** 單位，純顯示用（例：'mm'、'°'）。 */
  unit?: string
  /** 下限。 */
  min?: number
  /** 上限。 */
  max?: number
  /** min 係唔係包含在內（預設 true）。false = 嚴格大於，用嚟表達「必須大於 0」。 */
  minInclusive?: boolean
  /** max 係唔係包含在內（預設 true）。 */
  maxInclusive?: boolean
  /** 要唔要整數（陣列數量、面數之類）。 */
  integer?: boolean
}

export type NumericState = 'valid' | 'invalid' | 'blank'

export type NumericValid = {
  ok: true
  state: 'valid'
  /** 只有 ok === true 才有 value。其餘狀態**冇** value 呢個 key。 */
  value: number
  /** 用戶原文，UI 要照樣擺返 input 度。 */
  raw: string
}

export type NumericRejected = {
  ok: false
  state: 'invalid' | 'blank'
  /** 真正原因，已經包含用戶打咗乜。 */
  reason: string
  raw: string
}

export type NumericResult = NumericValid | NumericRejected

/**
 * 嚴格數字文法：允許 `-5`、`+3`、`.5`、`2.50`、`1e9`、`1E-3`。
 * 故意**唔接受** '0x10'（hex）、'Infinity'、'NaN'、'1,000'、'12mm'、空白字串。
 * （`Number()` 會把 '0x10' 當 16、'' 當 0 —— 正是舊 bug 嘅溫床。）
 */
const STRICT_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

/** 把任何輸入轉成「用戶打咗嘅字」。唔做 trim 以外嘅改寫。 */
export function rawOf(input: unknown): string {
  if (input === null || input === undefined) return ''
  if (typeof input === 'number') return Number.isFinite(input) ? String(input) : (Number.isNaN(input) ? 'NaN' : String(input))
  return String(input)
}

const fieldName = (spec: NumericFieldSpec): string => spec.label || '數值'
const withUnit = (n: number, spec: NumericFieldSpec): string => (spec.unit ? `${n} ${spec.unit}` : String(n))

/**
 * 解析一個數值欄。**永遠唔會代入預設值。**
 *
 * @param input 用戶輸入（string / number / null / undefined 都接受）
 * @param spec  欄位規格
 */
export function parseNumericField(input: unknown, spec: NumericFieldSpec): NumericResult {
  const raw = rawOf(input)
  const trimmed = raw.trim()
  const name = fieldName(spec)

  // ── 1. 空白：未輸入。唔算打錯（唔好即刻紅），但唔可以提交。
  if (trimmed === '') {
    return { ok: false, state: 'blank', reason: `${name}：未輸入`, raw }
  }

  // ── 2. 解析失敗：'abc' / 'NaN' / 'Infinity' / '12mm' / '1,000'。
  //     唔准代入任何預設值 —— 要明講用戶打咗乜。
  if (!STRICT_NUMBER.test(trimmed)) {
    return { ok: false, state: 'invalid', reason: `${name}：唔係數字（你打咗「${raw}」）`, raw }
  }
  const value = Number(trimmed)
  if (!Number.isFinite(value)) {
    // '1e999' 文法啱但溢出去 Infinity。
    return { ok: false, state: 'invalid', reason: `${name}：數值過大／無法表示（你打咗「${raw}」）`, raw }
  }

  // ── 3. 整數要求（陣列數量、面數）。2.5 唔准靜默 round。
  if (spec.integer && !Number.isInteger(value)) {
    return { ok: false, state: 'invalid', reason: `${name}：必須係整數（你打咗「${raw}」）`, raw }
  }

  // ── 4. 範圍：**唔准靜默夾**（舊行為係 Math.max/Math.min 悄悄改走）。
  const minInc = spec.minInclusive !== false
  if (spec.min !== undefined) {
    const below = minInc ? value < spec.min : value <= spec.min
    if (below) {
      const reason = minInc
        ? `${name}：最小 ${withUnit(spec.min, spec)}（你打咗「${raw}」）`
        : `${name}：必須大於 ${withUnit(spec.min, spec)}（你打咗「${raw}」）`
      return { ok: false, state: 'invalid', reason, raw }
    }
  }
  const maxInc = spec.maxInclusive !== false
  if (spec.max !== undefined) {
    const above = maxInc ? value > spec.max : value >= spec.max
    if (above) {
      const reason = maxInc
        ? `${name}：最大 ${withUnit(spec.max, spec)}（你打咗「${raw}」）`
        : `${name}：必須小於 ${withUnit(spec.max, spec)}（你打咗「${raw}」）`
      return { ok: false, state: 'invalid', reason, raw }
    }
  }

  return { ok: true, state: 'valid', value, raw }
}

/** 攞到數字，或者 null。**冇預設值版本** —— 專門用嚟取代 `Number(x) || d`。 */
export function numericValueOrNull(input: unknown, spec: NumericFieldSpec): number | null {
  const r = parseNumericField(input, spec)
  return r.ok ? r.value : null
}

/** 一欄係唔係「要即刻畀紅字」：空白唔算，非法才算。 */
export function shouldShowError(r: NumericResult): boolean {
  return r.state === 'invalid'
}

/** 確定掣應該唔應該停用：valid 以外一律停用（空白都唔可以提交）。 */
export function isSubmittable(r: NumericResult): boolean {
  return r.ok
}

/** 一組欄：全部 valid 才可以提交。 */
export function allSubmittable(results: Iterable<NumericResult>): boolean {
  for (const r of results) if (!r.ok) return false
  return true
}

/**
 * 一組欄嘅第一個攔阻原因（先報非法，再報空白）——用嚟砌 status / tooltip。
 * 全部合法返 null。
 */
export function firstBlockingReason(results: Iterable<NumericResult>): string | null {
  const list = [...results]
  for (const r of list) if (r.state === 'invalid') return (r as NumericRejected).reason
  for (const r of list) if (r.state === 'blank') return (r as NumericRejected).reason
  return null
}

/**
 * 砌 status 行，統一帶住「尺寸已拒絕」marker（同舊 BUG-UI-001 測試兼容），
 * 但 detail 用真原因。
 */
export function numericRejectStatus(r: NumericRejected): string {
  return illegalRejectStatus(r.reason)
}

/** 把一組結果收成一個可提交 / 唔可提交嘅判決。 */
export function summarizeNumericFields(results: Iterable<NumericResult>): {
  ok: boolean
  state: NumericState
  reason: string | null
} {
  const list = [...results]
  const reason = firstBlockingReason(list)
  if (!reason) return { ok: true, state: 'valid', reason: null }
  const anyInvalid = list.some((r) => r.state === 'invalid')
  return { ok: false, state: anyInvalid ? 'invalid' : 'blank', reason }
}

/**
 * QA BUG-409 表格嗰八個欄嘅規格。擺喺呢度，monolith（Viewport.tsx / store.ts）
 * 改嘅時候直接 import，唔使再喺 JSX 裡面寫 magic number + `|| 預設`。
 * 上下限係跟現有 input 嘅 min/max attribute 抄過嚟，可以按需要再調。
 */
export const NUMERIC_FIELDS = {
  /** SOLID Box 長度 / 闊 / 高（原本 `|| 80` / `|| 60` / `|| 30`）。 */
  boxLength: { label: '長度', unit: 'mm', min: 0, minInclusive: false, max: 1e6 },
  boxWidth: { label: '寬度', unit: 'mm', min: 0, minInclusive: false, max: 1e6 },
  boxHeight: { label: '高度', unit: 'mm', min: 0, minInclusive: false, max: 1e6 },
  /** 孔徑 Ø（原本 `|| 1`，訊息仲錯寫「孔徑必須大於 0」）。 */
  holeDiameter: { label: '孔徑Ø', unit: 'mm', min: 0, minInclusive: false, max: 1e6 },
  /** 孔深（原本 0 → 靜默變 67.5）。0 唔合法：要通孔就揀「通」。 */
  holeDepth: { label: '孔深', unit: 'mm', min: 0, minInclusive: false, max: 1e6 },
  /** 圓角半徑（原本 -2 → 靜默變 0，0 反而報「半徑太大」）。 */
  filletRadius: { label: '圓角半徑', unit: 'mm', min: 0, minInclusive: false, max: 1e4 },
  /** 矩形／環形陣列數量（原本 0 / -3 / 2.5 照留，NaN 變 0）。 */
  patternCount: { label: '陣列數量', min: 1, max: 400, integer: true },
  /** 陣列間距（原本 0 冇訊息）。 */
  patternSpacing: { label: '陣列間距', unit: 'mm', min: 0, minInclusive: false, max: 1e6 },
  /** 拔模角（原本 NaN / abc → 靜默變 0）。0 合法（= 唔拔模）。 */
  draftAngle: { label: '拔模角', unit: '°', min: -85, max: 85 },
  /** 原語直徑（圓柱／球／圓錐 Ø）。同 holeDiameter 分開係為咗 label 唔會讀錯。 */
  bodyDiameter: { label: '直徑Ø', unit: 'mm', min: 0, minInclusive: false, max: 1e6 },
  /** 分割位置（原本 NaN → 0；0 / -5 照建立）。可以負，所以唔設 min。 */
  splitPosition: { label: '分割位置', unit: 'mm', min: -1e6, max: 1e6 },
} as const satisfies Record<string, NumericFieldSpec>

export type NumericFieldKey = keyof typeof NUMERIC_FIELDS

/** 用 NUMERIC_FIELDS 嘅 key 解析，再 override 個別上下限。 */
export function parseField(key: NumericFieldKey, input: unknown, override?: Partial<NumericFieldSpec>): NumericResult {
  return parseNumericField(input, { ...NUMERIC_FIELDS[key], ...override })
}
