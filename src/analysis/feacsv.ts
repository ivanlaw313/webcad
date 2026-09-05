// feacsv.ts — S173 FEA 结果 → CSV（纯函数，零依赖 → Node 可单测 tests/feacsv.test.mjs）。
// Fusion post-solve 数据导出：摘要头(key,value) + 空行 + 逐体素场表。Excel-friendly：UTF-8 BOM 前缀 + CRLF + 逗号/引号转义。
// 与 store.ts exportBOM 同款转义 idiom。store.ts 嘅 exportFeaCsv 直接 import 呢个。

type Arr = Float32Array | number[]
export type FeaResultLike = {
  h: number
  nVox: number
  centers: Arr
  vm: Arr
  vmMax: number
  dispMax: number
  disp: Arr
  converged: boolean
  residual: number
  warnings: string[]
  sy: number
  matName: string
  vmSmooth?: Arr
  reaction?: [number, number, number]
  reactionMag?: number
  s1?: Arr
  s3?: Arr
  shear?: Arr
  sed?: Arr
}

export function buildFeaCsv(r: FeaResultLike): string {
  const esc = (f: string) => (/[",\n]/.test(f) ? '"' + f.replace(/"/g, '""') + '"' : f)
  const n = (x: number | undefined) => (x != null && Number.isFinite(x) ? String(Math.round(x * 1e4) / 1e4) : '')
  const sf = r.vmMax > 0 ? r.sy / r.vmMax : 0
  const summary: [string, string][] = [
    ['webcad FEA 结果', ''],
    ['材料', r.matName],
    ['屈服强度 σy (MPa)', n(r.sy)],
    ['最大 von Mises (MPa)', n(r.vmMax)],
    ['最大位移 (mm)', n(r.dispMax)],
    ['安全系数 SF', sf > 0 ? n(sf) : 'N/A'],
    ...(r.reaction ? ([['支座反力 Rx/Ry/Rz (N)', `${n(r.reaction[0])} / ${n(r.reaction[1])} / ${n(r.reaction[2])}`]] as [string, string][]) : []),
    ...(r.reactionMag != null ? ([['|反力| (N)', n(r.reactionMag)]] as [string, string][]) : []),
    ['残差', n(r.residual)],
    ['收敛', r.converged ? '是' : '否'],
    ['体素数', String(r.nVox)],
    ['体素边长 (mm)', n(r.h)],
    ['警告', r.warnings && r.warnings.length ? r.warnings.join('; ') : '（无）'],
  ]
  const lines: string[] = summary.map(([k, v]) => esc(k) + ',' + esc(v))
  lines.push('')
  const hasS = !!(r.s1 && r.s3 && r.shear)
  const hdr = ['序号', 'x(mm)', 'y(mm)', 'z(mm)', 'vonMises(MPa)', '平滑vm(MPa)', '位移(mm)']
  if (hasS) hdr.push('σ1(MPa)', 'σ3(MPa)', 'τmax(MPa)')
  if (r.sed) hdr.push('应变能密度')
  lines.push(hdr.map(esc).join(','))
  const c = r.centers
  for (let i = 0; i < r.nVox; i++) {
    const row = [String(i + 1), n(c[i * 3]), n(c[i * 3 + 1]), n(c[i * 3 + 2]), n(r.vm[i]), n(r.vmSmooth ? r.vmSmooth[i] : undefined), n(r.disp[i])]
    if (hasS) row.push(n(r.s1![i]), n(r.s3![i]), n(r.shear![i]))
    if (r.sed) row.push(n(r.sed[i]))
    lines.push(row.join(','))
  }
  return '﻿' + lines.join('\r\n')
}
