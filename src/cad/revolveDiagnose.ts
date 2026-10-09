// UX2 #3：旋轉失敗唔好淨係講「重建失敗」— 由截面同草圖本身搵出真原因（繁體），用戶知道要改邊度。
// 純函數（唔掂內核）：截面跨軸／截面貼晒軸／極短線段／自交／未閉合半剖／多個輪廓／散線。
import { revolvePointToCad, type RevolveFrameSource } from './revolvePreviewFrame'

type P2 = [number, number]
type V3 = [number, number, number]
type Prof = { kind?: string; a?: P2; b?: P2; c?: P2; r?: number; rx?: number; ry?: number; pts?: P2[] }
type Shape = { type: string; open?: boolean; construction?: boolean; point?: boolean; pts?: P2[] }

function loopOf(p: Prof): P2[] {
  if (p.kind === 'rect' && p.a && p.b) return [p.a, [p.b[0], p.a[1]], p.b, [p.a[0], p.b[1]]]
  if ((p.kind === 'circle' || p.kind === 'ellipse') && p.c) {
    const rx = p.r ?? p.rx ?? 0, ry = p.r ?? p.ry ?? rx
    return Array.from({ length: 16 }, (_, i) => { const t = (i / 16) * 2 * Math.PI; return [p.c![0] + rx * Math.cos(t), p.c![1] + ry * Math.sin(t)] as P2 })
  }
  return (p.pts ?? []).slice()
}
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

function segsCross(a: P2, b: P2, c: P2, d: P2): boolean {
  const o = (p: P2, q: P2, r: P2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d)
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))
}

export type RevolveDiagInput = {
  profile: Prof
  mainShape?: Shape | null           // 用嚟旋轉嗰個草圖形（s/t）
  shapes?: Shape[]                   // 成張草圖（包 mainShape）
  source: RevolveFrameSource
  axisDir: V3
  axisOrigin?: V3
  workerError?: string
}

/** 返回原因清單（繁體，空 = 搵唔到明確原因）。 */
export function diagnoseRevolve(inp: RevolveDiagInput): string[] {
  const out: string[] = []
  const loop = loopOf(inp.profile)
  const al = Math.hypot(...inp.axisDir) || 1
  const ax: V3 = [inp.axisDir[0] / al, inp.axisDir[1] / al, inp.axisDir[2] / al]
  const org = inp.axisOrigin ?? [0, 0, 0]
  let size = 0
  for (const p of loop) size = Math.max(size, Math.abs(p[0]), Math.abs(p[1]))
  const tol = Math.max(1e-4, size * 1e-6)
  // 1) 跨軸：每點垂直軸嘅分量，同一參考方向比較正負
  if (loop.length >= 2) {
    const radial = loop.map((p) => { const q = sub(revolvePointToCad(p, inp.source, false, ax), org); const t = dot(q, ax); return [q[0] - ax[0] * t, q[1] - ax[1] * t, q[2] - ax[2] * t] as V3 })
    const ref = radial.reduce<V3 | null>((r, v) => r ?? (Math.hypot(...v) > tol ? v : null), null)
    if (!ref) out.push('成個截面貼住旋轉軸（離軸距離 0）— 旋轉唔到體積，請將截面畫喺軸嘅一邊')
    else {
      const s = radial.map((v) => dot(v, ref) / Math.hypot(...ref))
      if (s.some((v) => v > tol) && s.some((v) => v < -tol)) out.push('截面跨過咗旋轉軸 — 截面要成個喺軸嘅同一邊（可以貼住軸，唔可以過咗去）')
    }
  }
  // 2) 極短線段（吸附留低嘅碎線）
  const n = loop.length
  let tiny = 0
  for (let i = 0; i < n; i++) { const a = loop[i], b = loop[(i + 1) % n]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05 && n > 3) tiny++ }
  if (tiny) out.push(`截面有 ${tiny} 段極短（<0.05 mm）嘅碎線 — 通常係吸附留低，刪咗或者合併端點`)
  // 3) 自交
  if (inp.profile.kind === 'poly' && n >= 4 && n <= 400) {
    let x = false
    for (let i = 0; i < n && !x; i++) for (let j = i + 2; j < n && !x; j++) {
      if (i === 0 && j === n - 1) continue
      if (segsCross(loop[i], loop[(i + 1) % n], loop[j], loop[(j + 1) % n])) x = true
    }
    if (x) out.push('截面線條自己交叉（打交叉）— 輪廓要係一個唔交叉嘅封閉圈')
  }
  // 4) 草圖層面：未閉合半剖 / 多個輪廓 / 散線
  const main = inp.mainShape
  const real = (inp.shapes ?? []).filter((s) => !s.construction && !s.point)
  const others = real.filter((s) => s !== main && JSON.stringify(s) !== JSON.stringify(main))
  if (main && main.type === 'poly' && main.open && main.pts && main.pts.length >= 2) {
    const ends = [main.pts[0], main.pts[main.pts.length - 1]].map((p) => { const q = sub(revolvePointToCad(p, inp.source, true, ax), org); const t = dot(q, ax); return Math.hypot(q[0] - ax[0] * t, q[1] - ax[1] * t, q[2] - ax[2] * t) })
    if (ends.some((d) => d > Math.max(0.01, tol))) out.push(`截面未閉合：半剖面兩端要落喺旋轉軸上（而家離軸 ${ends.map((d) => d.toFixed(2)).join(' / ')} mm）— 補返線閉合，或者將端點拉到軸上`)
  }
  const closedOthers = others.filter((s) => !(s.type === 'poly' && s.open)).length
  const stray = others.filter((s) => s.type === 'poly' && s.open).length
  if (closedOthers) out.push(`草圖有 ${closedOthers + 1} 個輪廓 — 旋轉只用揀中嗰個；如要其他都旋轉，請逐個揀或者合併成一個輪廓`)
  if (stray) out.push(`草圖仲有 ${stray} 條冇接駁嘅散線 — 刪走，或者接駁到截面上`)
  if (!out.length && inp.workerError) {
    if (/跨过|跨過/.test(inp.workerError)) out.push('截面跨過咗旋轉軸 — 截面要成個喺軸嘅同一邊')
    else if (/退化|zero-volume/i.test(inp.workerError)) out.push('截面相對旋轉軸退化（例如貼晒軸或者同軸平行嘅平面）— 換個軸或者截面平面')
  }
  return out
}

export function revolveFailStatus(causes: string[]): string {
  return causes.length ? `⚠ 旋轉失敗：${causes.join('；')}（已保留原模型）` : '⚠ 旋轉失敗 — 檢查截面：要閉合、唔好跨軸、唔好有散線／碎線（已保留原模型）'
}
