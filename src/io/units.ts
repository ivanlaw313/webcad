// T794（S73）：单位感知输入解析 — 把用户喺【当前显示单位】下嘅输入转返 mm（内部一律 mm）。
// 之前 setUnit 只改读数显示、所有输入框仍当 mm（审计批判员点名 hollow）。呢度补返「入」嘅一半：
// 支持小数 + 分数英寸（maker 钢尺习惯）+ 显式单位后缀（覆盖当前单位）。

// GM-X2 #13：扩到 5 长度单位（配对预设 mm/g cm/g m/kg in/oz ft/lb 用）。加 'm'/'ft' 纯附加 —
// mm/cm/inch 行为字节不变（旧读数/输入零回归）；模型/导出仍恒 mm。
export type LenUnit = 'mm' | 'cm' | 'm' | 'inch' | 'ft'
const PER: Record<LenUnit, number> = { mm: 1, cm: 10, m: 1000, inch: 25.4, ft: 304.8 }

export const lengthScale = (unit: LenUnit): number => PER[unit]

// 解析长度串 → mm。支持：
//   "12.7"        → 当前单位（inch 模式 = 12.7 吋）
//   "1/2" "1 1/2" "1-1/2"  → 分数（英寸钢尺式；whole + num/den）
//   "0.5in" "0.5\"" "12mm" "1.2cm"  → 显式后缀覆盖当前单位
// 解析唔到 → null（调用方保持旧值，唔好当 0）。
export function parseLen(raw: string, unit: LenUnit): number | null {
  let s = String(raw).trim().toLowerCase()
  if (!s) return null
  let u: LenUnit = unit
  // 显式单位后缀（" 同 in 都当 inch）
  const suf = s.match(/(mm|cm|inch|in|")\s*$/)
  if (suf && suf.index !== undefined) { u = suf[1] === 'mm' ? 'mm' : suf[1] === 'cm' ? 'cm' : 'inch'; s = s.slice(0, suf.index).trim() }
  // 分数：可选整数部 + num/den（"1 1/2"、"1-1/2"、"3/8"）
  const frac = s.match(/^(?:(\d+(?:\.\d+)?)[\s-]+)?(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/)
  let val: number
  if (frac) {
    const whole = frac[1] ? parseFloat(frac[1]) : 0
    const num = parseFloat(frac[2]), den = parseFloat(frac[3])
    if (!den) return null
    val = whole + num / den
  } else {
    if (!/^[+-]?\d*\.?\d+$/.test(s)) return null   // 净接纯数字（拒绝杂质 — 唔好 parseFloat "12abc" 当 12）
    val = parseFloat(s)
  }
  if (!Number.isFinite(val)) return null
  return val * PER[u]
}

// mm → 当前单位嘅【输入框显示串】（无单位后缀；可编辑字段用）。inch 取 4 位、mm/cm 取够位剪尾零。
export function toLenInput(mm: number, unit: LenUnit): string {
  const v = mm / PER[unit]
  const d = unit === 'inch' ? 4 : unit === 'ft' ? 5 : unit === 'm' ? 5 : unit === 'cm' ? 3 : 3
  return v.toFixed(d).replace(/\.?0+$/, '') || '0'
}
