// GM-X1 #10：模态 Properties 对话框数据装配 + 剪贴板文本 dump —— 纯函数。
// 复用 computeMassProps 已算好嘅 体积/面积/质心/惯性@COM/@原点/主惯矩。对标 Fusion 右键体 › Properties：
// 面积/密度/质量/体积/材质/包围盒/质心/惯性@COM+@原点 + 坐标 世界⇄COM 切换 + 复制到剪贴板 + 精度档。

import type { MassProps, Mat3 } from './massProps'
import { fmtLenP, fmtAreaP, fmtVolP, type MUnit } from './measureFmt.ts'

export type PropsFrame = 'world' | 'com'    // 世界（关于原点）/ COM（关于质心）
export type PropsAccuracy = 'low' | 'med' | 'high'

export interface PropsRow { label: string; value: string }
export interface PropsReportOpts {
  frame: PropsFrame
  density: number            // g/cm³
  material?: string
  unit: MUnit
  prec?: number | null
  secondary?: MUnit | null
  bbox?: { min: [number, number, number]; max: [number, number, number] } | null
  accuracy?: PropsAccuracy
  name?: string
}

// 质量：tonne → 克/公斤字串。
function fmtMass(massTonne: number): string {
  const g = massTonne * 1e6
  return g >= 1000 ? `${(g / 1000).toFixed(3)} kg` : `${g.toFixed(2)} g`
}
// 惯性张量分量：tonne·mm² → g·cm²（×1e4，同底部属性栏一致）。
const toGcm2 = (v: number) => v * 1e4

function fmtCoord(p: [number, number, number], u: MUnit, prec?: number | null, secondary?: MUnit | null): string {
  return `(${p.map((c) => fmtLenP(c, u, prec, secondary)).join(', ')})`
}

function tensorRows(I: Mat3, u: MUnit): PropsRow[] {
  // I 单位 tonne·mm² → g·cm²。对称阵取 Ixx/Iyy/Izz/Ixy/Iyz/Izx。
  const g = (v: number) => `${toGcm2(v).toFixed(2)} g·cm²`
  void u
  return [
    { label: 'Ixx / Iyy / Izz', value: `${g(I[0][0])} / ${g(I[1][1])} / ${g(I[2][2])}` },
    { label: 'Ixy / Iyz / Izx', value: `${g(I[0][1])} / ${g(I[1][2])} / ${g(I[2][0])}` },
  ]
}

export function buildPropsReport(mp: MassProps, opts: PropsReportOpts): { rows: PropsRow[]; text: string } {
  const { frame, density, material, unit, prec, secondary, bbox, accuracy, name } = opts
  const massTonne = mp.mass ?? (density * 1e-9 * mp.volume)   // 无 mass 字段时按密度补算
  const rows: PropsRow[] = []
  rows.push({ label: '面积', value: fmtAreaP(mp.area, unit, prec, secondary) })
  rows.push({ label: '密度', value: `${density.toFixed(3)} g/cm³` })
  rows.push({ label: '质量', value: fmtMass(massTonne) })
  rows.push({ label: '体积', value: fmtVolP(mp.volume, unit, prec, secondary) })
  if (material) rows.push({ label: '材质', value: material })
  if (bbox) {
    const d: [number, number, number] = [bbox.max[0] - bbox.min[0], bbox.max[1] - bbox.min[1], bbox.max[2] - bbox.min[2]]
    rows.push({ label: '包围盒', value: `${d.map((x) => fmtLenP(x, unit, prec, secondary)).join(' × ')}` })
  }
  rows.push({ label: '质心 COM', value: fmtCoord(mp.centroid, unit, prec, secondary) })
  rows.push({ label: '主惯矩 I₁/I₂/I₃', value: mp.principalMoments.map((I) => `${toGcm2(I).toFixed(2)}`).join(' / ') + ' g·cm²' })
  // 坐标 世界⇄COM 切换：选定 frame 嘅惯性张量。
  const I = frame === 'world' ? mp.inertiaOrigin : mp.inertia
  rows.push({ label: frame === 'world' ? '惯性 @原点(世界)' : '惯性 @质心(COM)', value: '' })
  rows.push(...tensorRows(I, unit))

  // 剪贴板文本 dump（照 copyInterfReport 风格）。
  const accLbl = accuracy === 'high' ? '高' : accuracy === 'low' ? '低' : '中'
  const lines = [
    `物理属性${name ? ' — ' + name : ''}（精度=${accLbl} · 坐标=${frame === 'world' ? '世界/原点' : '质心/COM'}）`,
    `导出时间 ${new Date().toLocaleString()}`,
    '',
    ...rows.map((r) => (r.value ? `${r.label}：${r.value}` : `${r.label}`)),
  ]
  return { rows, text: lines.join('\n') }
}

// 精度档 → 网格细分档（复用 exportQuality 语义）。Low→coarse / Med→medium / High→fine。
export function accuracyToQuality(a: PropsAccuracy): 'coarse' | 'medium' | 'fine' {
  return a === 'low' ? 'coarse' : a === 'high' ? 'fine' : 'medium'
}
