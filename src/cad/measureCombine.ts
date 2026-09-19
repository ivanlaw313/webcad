// GM-X1 #1/#2：统一 Measure 命令内核 —— 纯函数, 零依赖。对标 Fusion 一个 Measure 命令拣任意实体组合
// 自动出上下文读数（1 面=面积、2 面=夹角、1 边=长、2 边=距+角、边+面=最短距、2 点=距离+ΔXYZ）。
//
// webcad 旧况系 4 个互斥模式掣（量距/量边/量面/量角）。呢个引擎收「拾取集」再按类型组合派生读数，
// 令一个 Measure 命令覆盖晒。真实几何（面积/边长/法向/圆半径）由视口 raycast + worker measureFaceAt/
// measureEdgeAt 供，呢度只做【组合派生】—— 纯几何 + 组合分派, 可 headless 测。
//
// 坐标系约定：caller 传入一致坐标（CAD 系）。距离/ΔXYZ 喺该系度算, 引擎不做系转换。

import { closestPolylinePair } from './edgeDistance.ts'

export type MeasurePickKind = 'point' | 'vertex' | 'edge' | 'face' | 'body'

export interface MeasurePick {
  kind: MeasurePickKind
  volume?: number
  // point / vertex
  p?: [number, number, number]
  // edge（来自 measureEdgeAt）
  length?: number
  radius?: number
  closed?: boolean
  mid?: [number, number, number]
  dir?: [number, number, number]      // 边切向（直边）或轴向（可缺）
  pts?: [number, number, number][]
  // face（来自 measureFaceAt + 拾取法向）
  area?: number
  perimeter?: number
  surfType?: string
  center?: [number, number, number]
  normal?: [number, number, number]
}

export type MeasureResultType = 'point' | 'length' | 'area' | 'volume' | 'angle' | 'distance' | 'empty' | 'unsupported'

export interface MeasurePart { label: string; kind: MeasurePickKind; value?: number; kindUnit?: 'len' | 'area' | 'vol' | 'angle' }

export interface MeasureResult {
  type: MeasureResultType
  label: string                     // 语义标签：面积 / 夹角 / 长度 / 距离 / 坐标 …
  value: number | null              // 主标量：mm | mm² | deg（type 决定单位）
  valueUnit: 'len' | 'area' | 'vol' | 'angle' | 'none'
  delta?: [number, number, number]  // 2 点/点-式距离嘅 ΔXYZ
  perimeter?: number                // 面周长
  radius?: number                   // 圆边/柱面半径
  supplement?: number               // 夹角补角 180−θ
  parts: MeasurePart[]              // 逐实体自身读数
  note?: string                     // 诚实近似/提示
}

const sub = (a: [number, number, number], b: [number, number, number]): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: [number, number, number], b: [number, number, number]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len3 = (a: [number, number, number]) => Math.hypot(a[0], a[1], a[2])
const norm = (a: [number, number, number]): [number, number, number] => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

// 点到平面（过 center、法向 n）距离。
function pointPlaneDist(p: [number, number, number], center: [number, number, number], n: [number, number, number]): number {
  return Math.abs(dot(sub(p, center), norm(n)))
}
// 点到直线（过 mid、方向 dir）距离；无 dir → 退化到点距。
function pointLineDist(p: [number, number, number], mid: [number, number, number], dir?: [number, number, number]): number {
  const w = sub(p, mid)
  if (!dir || len3(dir) < 1e-9) return len3(w)
  const d = norm(dir)
  const proj = dot(w, d)
  const perp: [number, number, number] = [w[0] - proj * d[0], w[1] - proj * d[1], w[2] - proj * d[2]]
  return len3(perp)
}

// 单个实体嘅自身读数 part。
function intrinsicPart(pk: MeasurePick): MeasurePart {
  if (pk.kind === 'body') return { label: '體積', kind: 'body', value: pk.volume, kindUnit: 'vol' }
  if (pk.kind === 'face') return { label: '面积', kind: 'face', value: pk.area, kindUnit: 'area' }
  if (pk.kind === 'edge') {
    if (pk.radius != null) return { label: pk.closed ? '孔径Ø' : '弧长', kind: 'edge', value: pk.closed ? pk.radius * 2 : pk.length, kindUnit: 'len' }
    return { label: '棱长', kind: 'edge', value: pk.length, kindUnit: 'len' }
  }
  return { label: pk.kind === 'vertex' ? '顶点' : '点', kind: pk.kind }
}

// 组合派生：核心分派。
export function combineMeasure(picks: MeasurePick[]): MeasureResult {
  const parts = picks.map(intrinsicPart)
  if (picks.length === 0) return { type: 'empty', label: '拾取', value: null, valueUnit: 'none', parts }

  if (picks.length === 1) {
    const a = picks[0]
    if (a.kind === 'body') return {type:'volume',label:'體積',value:a.volume??null,valueUnit:'vol',parts}
    if (a.kind === 'face') return { type: 'area', label: '面积', value: a.area ?? null, valueUnit: 'area', perimeter: a.perimeter, radius: a.radius, parts }
    if (a.kind === 'edge') {
      if (a.radius != null && a.closed) return { type: 'length', label: '孔径Ø', value: a.radius * 2, valueUnit: 'len', radius: a.radius, parts }
      return { type: 'length', label: a.radius != null ? '弧长' : '棱长', value: a.length ?? null, valueUnit: 'len', radius: a.radius, parts }
    }
    // point / vertex 单拣 → 坐标（无标量）
    return { type: 'point', label: '坐标', value: null, valueUnit: 'none', delta: a.p, parts }
  }

  if (picks.length === 2) {
    const [a, b] = picks
    const kinds = [a.kind, b.kind].map((k) => (k === 'vertex' ? 'point' : k)).sort().join('+')
    // 2 面 → 夹角（法向）
    if (kinds === 'face+face') {
      if (!a.normal || !b.normal) return { type: 'unsupported', label: '夹角', value: null, valueUnit: 'none', parts, note: '两面需有法向先量夹角' }
      const c = Math.max(-1, Math.min(1, dot(norm(a.normal), norm(b.normal))))
      const deg = (Math.acos(c) * 180) / Math.PI
      if (deg < 0.5) return { type: 'unsupported', label: '夹角', value: null, valueUnit: 'none', parts, note: '两面朝向相同（可能拣到同一面）— 拣两个唔同朝向嘅面' }
      return { type: 'angle', label: '夹角', value: deg, valueUnit: 'angle', supplement: 180 - deg, parts }
    }
    // 2 点 → 距离 + ΔXYZ
    if (kinds === 'point+point') {
      if (!a.p || !b.p) return { type: 'unsupported', label: '距离', value: null, valueUnit: 'none', parts }
      const d = sub(b.p, a.p)
      return { type: 'distance', label: '距离', value: len3(d), valueUnit: 'len', delta: [Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2])], parts }
    }
    // 2 边 → 中点距 + 边向夹角（诚实：中点近似，非线段最短距）
    if (kinds === 'edge+edge') {
      if (!a.mid || !b.mid) return { type: 'unsupported', label: '距离', value: null, valueUnit: 'none', parts, note: '两边需有中点位置' }
      const closest = a.pts && b.pts && a.pts.length > 1 && b.pts.length > 1 ? closestPolylinePair(a.pts, b.pts) : null
      if (closest) {
        const delta = sub(closest.b, closest.a)
        return { type: 'distance', label: '最短距离', value: closest.distance, valueUnit: 'len', delta: [Math.abs(delta[0]), Math.abs(delta[1]), Math.abs(delta[2])], parts, note: '两条真边的最近距离（B-rep 采样）' }
      }
      const d = sub(b.mid, a.mid)
      let note = '边中点距（近似 · 非线段最短距）'
      const res: MeasureResult = { type: 'distance', label: '距离', value: len3(d), valueUnit: 'len', delta: [Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2])], parts, note }
      if (a.dir && b.dir) {
        const c = Math.max(-1, Math.min(1, Math.abs(dot(norm(a.dir), norm(b.dir)))))
        res.supplement = (Math.acos(c) * 180) / Math.PI   // 复用 supplement 传边向夹角
        note += ` · 边向夹角 ${res.supplement.toFixed(1)}°`
        res.note = note
      }
      return res
    }
    // 边 + 面 → 边中点到面平面最短距（诚实近似）
    if (kinds === 'edge+face') {
      const face = a.kind === 'face' ? a : b
      const edge = a.kind === 'edge' ? a : b
      if (!edge.mid || !face.center || !face.normal) return { type: 'unsupported', label: '最短距', value: null, valueUnit: 'none', parts, note: '需面法向 + 边中点' }
      return { type: 'distance', label: '最短距', value: pointPlaneDist(edge.mid, face.center, face.normal), valueUnit: 'len', parts, note: '边中点→面平面距（平面面精确 · 曲面近似）' }
    }
    // 点 + 面 → 点到面平面距
    if (kinds === 'face+point') {
      const face = a.kind === 'face' ? a : b
      const pt = a.kind === 'face' ? b : a
      if (!pt.p || !face.center || !face.normal) return { type: 'unsupported', label: '距离', value: null, valueUnit: 'none', parts }
      return { type: 'distance', label: '距离', value: pointPlaneDist(pt.p, face.center, face.normal), valueUnit: 'len', parts, note: '点→面平面距' }
    }
    // 点 + 边 → 点到边直线距
    if (kinds === 'edge+point') {
      const edge = a.kind === 'edge' ? a : b
      const pt = a.kind === 'edge' ? b : a
      if (!pt.p || !edge.mid) return { type: 'unsupported', label: '距离', value: null, valueUnit: 'none', parts }
      return { type: 'distance', label: '距离', value: pointLineDist(pt.p, edge.mid, edge.dir), valueUnit: 'len', parts, note: '点→边直线距' }
    }
    return { type: 'unsupported', label: '组合', value: null, valueUnit: 'none', parts, note: '呢个组合暂唔支持 — 清空重拣' }
  }

  return { type: 'unsupported', label: '组合', value: null, valueUnit: 'none', parts, note: 'Measure 最多拣 2 个实体 — 清空重拣' }
}
