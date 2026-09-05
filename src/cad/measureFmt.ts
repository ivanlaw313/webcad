// GM-X1 #3/#4：可调精度 + 副单位（Secondary Units）格式化内核 —— 纯函数, 零依赖。
// 对标 Fusion Measure 面板嘅 Precision 下拉（0..8 位小数）+ Secondary Units（并列第二单位系）。
//
// 设计要点（唔破坏旧读数）：prec == null（缺省）时逐单位默认小数位 = store fmtLen/fmtArea/fmtVol 旧值
//   （mm 1 位 / cm 2 位 / inch 3 位；cm² 1 位 / in² 2 位；cm³ 2 位 / in³ 3 位）→ 逐字节等价旧输出。
//   只有用户设 measurePrecision（数字）先覆盖小数位；secondary 设咗先并列第二单位。
// 所以 store 嘅 fmtLen(mm)（唔传 prec/secondary）永远同旧版一模一样 —— 旧存档读数不变。

export type MUnit = 'mm' | 'cm' | 'inch'

const LEN_DIV: Record<MUnit, number> = { mm: 1, cm: 10, inch: 25.4 }
const LEN_SUF: Record<MUnit, string> = { mm: 'mm', cm: 'cm', inch: 'in' }
const LEN_DEC: Record<MUnit, number> = { mm: 1, cm: 2, inch: 3 }   // 旧默认小数位（逐字节等价）

// 面积/体积：公制恒报 cm²/cm³（mm 同 cm 都系），inch 报 in²/in³。
const AREA_DIV = (u: MUnit) => (u === 'inch' ? 645.16 : 100)
const AREA_SUF = (u: MUnit) => (u === 'inch' ? 'in²' : 'cm²')
const AREA_DEC = (u: MUnit) => (u === 'inch' ? 2 : 1)
const VOL_DIV = (u: MUnit) => (u === 'inch' ? 16387.064 : 1000)
const VOL_SUF = (u: MUnit) => (u === 'inch' ? 'in³' : 'cm³')
const VOL_DEC = (u: MUnit) => (u === 'inch' ? 3 : 2)

// 精度钳到 Fusion 范围 0..8。
export function clampPrec(p: number): number { return Math.max(0, Math.min(8, Math.round(p))) }

// 长度：mm 值 → 当前单位字串（可选覆盖小数位 + 并列副单位）。
export function fmtLenP(mm: number, u: MUnit = 'mm', prec?: number | null, secondary?: MUnit | null): string {
  const dec = prec == null ? LEN_DEC[u] : clampPrec(prec)
  const main = `${(mm / LEN_DIV[u]).toFixed(dec)} ${LEN_SUF[u]}`
  if (!secondary || secondary === u) return main
  const sdec = prec == null ? LEN_DEC[secondary] : clampPrec(prec)
  return `${main} (${(mm / LEN_DIV[secondary]).toFixed(sdec)} ${LEN_SUF[secondary]})`
}

// 面积：mm² 值 → 字串。
export function fmtAreaP(mm2: number, u: MUnit = 'mm', prec?: number | null, secondary?: MUnit | null): string {
  const dec = prec == null ? AREA_DEC(u) : clampPrec(prec)
  const main = `${(mm2 / AREA_DIV(u)).toFixed(dec)} ${AREA_SUF(u)}`
  if (!secondary || AREA_SUF(secondary) === AREA_SUF(u)) return main   // 同报 cm² 时冇必要重复
  const sdec = prec == null ? AREA_DEC(secondary) : clampPrec(prec)
  return `${main} (${(mm2 / AREA_DIV(secondary)).toFixed(sdec)} ${AREA_SUF(secondary)})`
}

// 体积：mm³ 值 → 字串。
export function fmtVolP(mm3: number, u: MUnit = 'mm', prec?: number | null, secondary?: MUnit | null): string {
  const dec = prec == null ? VOL_DEC(u) : clampPrec(prec)
  const main = `${(mm3 / VOL_DIV(u)).toFixed(dec)} ${VOL_SUF(u)}`
  if (!secondary || VOL_SUF(secondary) === VOL_SUF(u)) return main
  const sdec = prec == null ? VOL_DEC(secondary) : clampPrec(prec)
  return `${main} (${(mm3 / VOL_DIV(secondary)).toFixed(sdec)} ${VOL_SUF(secondary)})`
}

// 角度：度 → 字串（默认 2 位，可覆盖）。角度冇副单位概念。
export function fmtAngP(deg: number, prec?: number | null): string {
  const dec = prec == null ? 2 : clampPrec(prec)
  return `${deg.toFixed(dec)}°`
}
