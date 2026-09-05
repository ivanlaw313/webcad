// GM-X2 #13：每文档单位配对预设（长度 + 质量）—— 纯逻辑，零依赖。
// 对标 Fusion「Change Active Units」：mm/g、cm/g、m/kg、in/oz、ft/lb + Custom。
// 铁律：模型恒 mm、制造导出（STL/STEP/DXF）恒 mm —— 此仅影响【量测/属性】屏上读数。

export type LenU = 'mm' | 'cm' | 'm' | 'inch' | 'ft'
export type MassU = 'g' | 'kg' | 'oz' | 'lb'
export type UnitPreset = 'mm_g' | 'cm_g' | 'm_kg' | 'in_oz' | 'ft_lb' | 'custom'

export interface PresetDef { id: UnitPreset; len: LenU; mass: MassU; label: string }
export const UNIT_PRESETS: PresetDef[] = [
  { id: 'mm_g', len: 'mm', mass: 'g', label: '毫米 / 克 (mm, g)' },
  { id: 'cm_g', len: 'cm', mass: 'g', label: '厘米 / 克 (cm, g)' },
  { id: 'm_kg', len: 'm', mass: 'kg', label: '米 / 千克 (m, kg)' },
  { id: 'in_oz', len: 'inch', mass: 'oz', label: '英寸 / 盎司 (in, oz)' },
  { id: 'ft_lb', len: 'ft', mass: 'lb', label: '英尺 / 磅 (ft, lb)' },
]

export const LEN_PER_MM: Record<LenU, number> = { mm: 1, cm: 10, m: 1000, inch: 25.4, ft: 304.8 }
export const LEN_SUFFIX: Record<LenU, string> = { mm: 'mm', cm: 'cm', m: 'm', inch: 'in', ft: 'ft' }
export const LEN_DEC: Record<LenU, number> = { mm: 1, cm: 2, m: 4, inch: 3, ft: 4 }
export const MASS_PER_G: Record<MassU, number> = { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 }
export const MASS_SUFFIX: Record<MassU, string> = { g: 'g', kg: 'kg', oz: 'oz', lb: 'lb' }
export const MASS_DEC: Record<MassU, number> = { g: 2, kg: 3, oz: 2, lb: 3 }

export function presetById(id: UnitPreset): PresetDef | null {
  return UNIT_PRESETS.find((p) => p.id === id) ?? null
}

// 长度+质量 → 命中预设 id（皆非配对 → custom）。
export function detectPreset(len: LenU, mass: MassU): UnitPreset {
  const f = UNIT_PRESETS.find((p) => p.len === len && p.mass === mass)
  return f ? f.id : 'custom'
}

export function convLenFromMm(mm: number, u: LenU): number { return mm / LEN_PER_MM[u] }
export function convMassFromG(g: number, u: MassU): number { return g / MASS_PER_G[u] }

const clampDec = (p: number) => Math.max(0, Math.min(8, Math.round(p)))

export function fmtLenU(mm: number, u: LenU, prec?: number | null): string {
  const dec = prec == null ? LEN_DEC[u] : clampDec(prec)
  return `${(mm / LEN_PER_MM[u]).toFixed(dec)} ${LEN_SUFFIX[u]}`
}

export function fmtMassU(g: number, u: MassU, prec?: number | null): string {
  const dec = prec == null ? MASS_DEC[u] : clampDec(prec)
  return `${(g / MASS_PER_G[u]).toFixed(dec)} ${MASS_SUFFIX[u]}`
}

// 长度单位 → 面积/体积应回落嘅公制/英制显示单位（webcad 面积/体积恒报 cm²/cm³ 或 in²/in³）。
// m/cm/mm → cm 系；ft/inch → inch 系。供 store fmtArea/fmtVol 包装用。
export function areaVolBaseUnit(u: LenU): 'cm' | 'inch' {
  return (u === 'inch' || u === 'ft') ? 'inch' : 'cm'
}
