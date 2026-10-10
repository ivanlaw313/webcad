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
  // WORKFLOW #1：解析面幾何（worker measureFaceAt）— 圓柱軸／平面原點＋法向
  axisO?: [number, number, number]
  axisD?: [number, number, number]
  planeO?: [number, number, number]
  planeN?: [number, number, number]
}

/** 兩面之間嘅 B-rep 真最短距離（worker measureFaceFaceMin） */
export interface MeasureExtra { faceMinDist?: number; minPa?: [number, number, number]; minPb?: [number, number, number] }

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
  area?: number                     // UX2 #10：柱面/球面主讀數改直徑時，面積仍附上
  supplement?: number               // 夹角补角 180−θ
  minDist?: number                  // WORKFLOW #1：附加讀數 — 兩面最短距離
  axisAngle?: number                // WORKFLOW #1：兩圓柱軸線夾角（非平行時）
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
  if (pk.kind === 'face') return { label: '面積', kind: 'face', value: pk.area, kindUnit: 'area' }
  if (pk.kind === 'edge') {
    if (pk.radius != null) return { label: pk.closed ? '孔徑Ø' : '弧長', kind: 'edge', value: pk.closed ? pk.radius * 2 : pk.length, kindUnit: 'len' }
    return { label: '稜長', kind: 'edge', value: pk.length, kindUnit: 'len' }
  }
  return { label: pk.kind === 'vertex' ? '頂點' : '點', kind: pk.kind }
}

// 组合派生：核心分派。
export function combineMeasure(picks: MeasurePick[], extra: MeasureExtra = {}): MeasureResult {
  const parts = picks.map(intrinsicPart)
  if (picks.length === 0) return { type: 'empty', label: '拾取', value: null, valueUnit: 'none', parts }

  if (picks.length === 1) {
    const a = picks[0]
    if (a.kind === 'body') return {type:'volume',label:'體積',value:a.volume??null,valueUnit:'vol',parts}
    // UX2 #10：圓柱面／球面（軸、孔壁、凸台）Fusion 主讀數係直徑 — 唔再淨係俾面積；面積留喺 parts / area
    if (a.kind === 'face' && a.radius != null && a.radius > 0 && /CYL|SPHER/i.test(a.surfType ?? '')) return { type: 'length', label: /SPHER/i.test(a.surfType ?? '') ? '球面直徑Ø' : '圓柱面直徑Ø', value: a.radius * 2, valueUnit: 'len', radius: a.radius, area: a.area, perimeter: a.perimeter, parts }
    if (a.kind === 'face') return { type: 'area', label: '面積', value: a.area ?? null, valueUnit: 'area', perimeter: a.perimeter, radius: a.radius, parts }
    if (a.kind === 'edge') {
      if (a.radius != null && a.closed) return { type: 'length', label: '孔徑Ø', value: a.radius * 2, valueUnit: 'len', radius: a.radius, parts }
      return { type: 'length', label: a.radius != null ? '弧長' : '稜長', value: a.length ?? null, valueUnit: 'len', radius: a.radius, parts }
    }
    // point / vertex 单拣 → 坐标（无标量）
    return { type: 'point', label: '座標', value: null, valueUnit: 'none', delta: a.p, parts }
  }

  if (picks.length === 2) {
    const [a, b] = picks
    const kinds = [a.kind, b.kind].map((k) => (k === 'vertex' ? 'point' : k)).sort().join('+')
    // 2 面（WORKFLOW #1，Fusion 式）：兩圓柱平行軸 → 軸距；兩平行平面 → 厚度（面距）；其餘 → 夾角／最短距離
    if (kinds === 'face+face') {
      const md = extra.faceMinDist != null && Number.isFinite(extra.faceMinDist) ? extra.faceMinDist : undefined
      const PAR = 0.99985   // ≈ 1° 內當平行
      if (a.axisO && a.axisD && b.axisO && b.axisD) {
        const da = norm(a.axisD), db = norm(b.axisD), c = Math.abs(dot(da, db))
        if (c >= PAR) {
          const ax = pointLineDist(b.axisO, a.axisO, da)
          if (ax < 1e-6) return { type: 'unsupported', label: '軸距', value: null, valueUnit: 'none', parts, ...(md != null ? { minDist: md } : {}), note: '兩個圓柱面同軸（軸距為 0）— 如需量直徑請只選一個面' }
          return { type: 'distance', label: '軸距（平行軸）', value: ax, valueUnit: 'len', parts, ...(md != null ? { minDist: md } : {}), note: '兩條圓柱軸平行；軸距＝兩軸線之間的垂直距離' }
        }
        const ang = (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI
        if (md != null) return { type: 'distance', label: '最短距離', value: md, valueUnit: 'len', parts, axisAngle: ang, note: '兩條圓柱軸不平行；顯示兩面最短距離及軸線夾角' }
        return { type: 'angle', label: '軸線夾角', value: ang, valueUnit: 'angle', supplement: 180 - ang, parts }
      }
      // FISHING12 P2：平面解析資料缺失時（舊路徑／網格），兩個 PLANE 面用拾取點＋法向計（拾取點喺平面上 → 同樣精確）
      const planeOf = (f: MeasurePick): { o: [number, number, number]; n: [number, number, number] } | null =>
        f.planeO && f.planeN ? { o: f.planeO, n: f.planeN } : /PLANE/i.test(f.surfType ?? '') && f.p && f.normal ? { o: f.p, n: f.normal } : null
      const pa = planeOf(a), pb = planeOf(b)
      if (pa && pb) {
        const na = norm(pa.n), nb = norm(pb.n), c = dot(na, nb)
        if (Math.abs(c) >= PAR) {
          const sd = dot(sub(pb.o, pa.o), na), t = Math.abs(sd)
          if (t < 1e-6) return { type: 'unsupported', label: '面距', value: null, valueUnit: 'none', parts, note: '兩面共面（可能選到同一個面）— 請選另一個面' }
          // 法向朝外：兩面背向（第二面喺第一面外法向嘅後面）＝中間係材料 → 厚度；兩面相向 → 間隙（槽寬）；同向 → 面距
          const opp = c < 0, thick = opp && sd < 0
          const label = !opp ? '面距（平行面）' : thick ? '厚度（面距）' : '間隙（面距）'
          const note = !opp ? '兩個平行同向的平面；面距＝兩面之間的垂直距離' : thick ? '兩個平行且背向的平面；厚度＝兩面之間的垂直距離' : '兩個平行且相向的平面；間隙＝兩面之間的垂直距離'
          // 平行平面：主讀數＝B-rep 平面距離（精確）。最短距離只喺兩面橫向錯開（真係大過面距）先附上；細過面距係揀錯面 → 唔顯示
          const mdOk = md != null && md > t + 1e-3
          return { type: 'distance', label, value: t, valueUnit: 'len', parts, ...(mdOk ? { minDist: md } : {}), note }
        }
      }
      if (!a.normal || !b.normal) {
        if (md != null) return { type: 'distance', label: '最短距離', value: md, valueUnit: 'len', parts }
        return { type: 'unsupported', label: '夾角', value: null, valueUnit: 'none', parts, note: '兩個面都需要有法向才可量度夾角' }
      }
      const c = Math.max(-1, Math.min(1, dot(norm(a.normal), norm(b.normal))))
      const deg = (Math.acos(c) * 180) / Math.PI
      if (deg < 0.5) {
        if (md != null && md > 1e-6) return { type: 'distance', label: '最短距離', value: md, valueUnit: 'len', parts }
        return { type: 'unsupported', label: '夾角', value: null, valueUnit: 'none', parts, note: '兩面朝向相同（可能選到同一個面）— 請選另一個不同的面' }
      }
      return { type: 'angle', label: '夾角', value: deg, valueUnit: 'angle', supplement: 180 - deg, parts, ...(md != null ? { minDist: md } : {}) }
    }
    // 2 点 → 距离 + ΔXYZ
    if (kinds === 'point+point') {
      if (!a.p || !b.p) return { type: 'unsupported', label: '距離', value: null, valueUnit: 'none', parts }
      const d = sub(b.p, a.p)
      return { type: 'distance', label: '距離', value: len3(d), valueUnit: 'len', delta: [Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2])], parts }
    }
    // 2 边 → 中点距 + 边向夹角（诚实：中点近似，非线段最短距）
    if (kinds === 'edge+edge') {
      if (!a.mid || !b.mid) return { type: 'unsupported', label: '距離', value: null, valueUnit: 'none', parts, note: '兩條邊都需要有中點位置' }
      const closest = a.pts && b.pts && a.pts.length > 1 && b.pts.length > 1 ? closestPolylinePair(a.pts, b.pts) : null
      if (closest) {
        const delta = sub(closest.b, closest.a)
        return { type: 'distance', label: '最短距離', value: closest.distance, valueUnit: 'len', delta: [Math.abs(delta[0]), Math.abs(delta[1]), Math.abs(delta[2])], parts, note: '兩條邊的最近距離（B-rep 取樣）' }
      }
      const d = sub(b.mid, a.mid)
      let note = '邊中點距離（近似值，並非線段最短距離）'
      const res: MeasureResult = { type: 'distance', label: '距離', value: len3(d), valueUnit: 'len', delta: [Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2])], parts, note }
      if (a.dir && b.dir) {
        const c = Math.max(-1, Math.min(1, Math.abs(dot(norm(a.dir), norm(b.dir)))))
        res.supplement = (Math.acos(c) * 180) / Math.PI   // 复用 supplement 传边向夹角
        note += ` · 邊向夾角 ${res.supplement.toFixed(1)}°`
        res.note = note
      }
      return res
    }
    // 边 + 面 → 边中点到面平面最短距（诚实近似）
    if (kinds === 'edge+face') {
      const face = a.kind === 'face' ? a : b
      const edge = a.kind === 'edge' ? a : b
      if (!edge.mid || !face.center || !face.normal) return { type: 'unsupported', label: '最短距離', value: null, valueUnit: 'none', parts, note: '需要面的法向及邊的中點' }
      return { type: 'distance', label: '最短距離', value: pointPlaneDist(edge.mid, face.center, face.normal), valueUnit: 'len', parts, note: '邊中點至面所在平面的距離（平面精確，曲面為近似值）' }
    }
    // 点 + 面 → 点到面平面距
    if (kinds === 'face+point') {
      const face = a.kind === 'face' ? a : b
      const pt = a.kind === 'face' ? b : a
      if (!pt.p || !face.center || !face.normal) return { type: 'unsupported', label: '距離', value: null, valueUnit: 'none', parts }
      return { type: 'distance', label: '距離', value: pointPlaneDist(pt.p, face.center, face.normal), valueUnit: 'len', parts, note: '點至面所在平面的距離' }
    }
    // 点 + 边 → 点到边直线距
    if (kinds === 'edge+point') {
      const edge = a.kind === 'edge' ? a : b
      const pt = a.kind === 'edge' ? b : a
      if (!pt.p || !edge.mid) return { type: 'unsupported', label: '距離', value: null, valueUnit: 'none', parts }
      return { type: 'distance', label: '距離', value: pointLineDist(pt.p, edge.mid, edge.dir), valueUnit: 'len', parts, note: '點至邊所在直線的距離' }
    }
    return { type: 'unsupported', label: '組合', value: null, valueUnit: 'none', parts, note: '暫不支援此組合 — 請清空後重新選取' }
  }

  return { type: 'unsupported', label: '組合', value: null, valueUnit: 'none', parts, note: '測量最多選取 2 個對象 — 請清空後重新選取' }
}
