import type { Feature } from '../worker/cad.worker'

/**
 * 可儲存在時間軸上的 Hole 命令資料。這個型別刻意只描述已解析的
 * 幾何輸入；例如 To Next 的 nextFaceZ 必須由呼叫端在拾取當刻解析，
 * 因此本模組本身不會讀取網格、store 或 kernel。
 */
export type HoleFeaturePayload = {
  id: string
  kind: 'simple' | 'counterbore' | 'countersink' | 'tapped'
  center: [number, number]
  /** Multiple positions created by one Hole command (sketch points / bolt circle). */
  centers?: [number, number][]
  pattern?: { kind: 'bolt-circle'; origin: [number, number]; count: number; pcd: number }
  /** 入口面的 CAD Z 座標。 */
  top: number
  /** 已包含 clearance compensation 的實際鑽孔直徑。 */
  diameter: number
  /** UI 回編用：輸入的名義直徑與列印補償，不影響 kernel 展開。 */
  nominalDiameter?: number
  clearance?: number
  through?: boolean
  /** 盲孔深度；缺省時沿用舊 Hole 命令的 1.5 × diameter。 */
  depth?: number
  /** Fusion 的 To Next extent；僅 simple 孔可用。 */
  extent?: 'distance' | 'through-all' | 'to-next' | 'to-object'
  /** To Next 已命中的下一面 Z；沒有命中時誠實退回 Through All。 */
  nextFaceZ?: number | null
  /** Fusion To Object: target planar-face reference, captured without display face indices. */
  toFace?: { near: [number, number, number]; faceFp?: string[]; faceFpV2?: string[]; faceFpTopo?: string[]; offset?: number }
  /** Simple-hole mouth chamfer and blind-hole drill-point, both replayed as cut lofts. */
  chamfer?: number
  drillPoint?: { angle: number }
  counterbore?: { diameter: number; depth: number }
  countersink?: { diameter: number; angle: number }
  /** 非 modeled tapped hole 的實際底孔直徑與螺紋 metadata。 */
  tap?: { drillDiameter: number; nominalDiameter: number; pitch: number; fine?: boolean }
}

const cutCircle = (id: string, center: [number, number], radius: number, height: number, baseZ: number, toFace?: HoleFeaturePayload['toFace']): Feature => ({
  id,
  type: 'extrude',
  profile: { kind: 'circle', c: center, r: radius },
  height,
  operation: 'cut',
  // Hole already resolves the exact floor and entry overshoot. Generic sketch
  // cutter nudges would deepen every blind hole/counterbore by another 0.5 mm.
  exactDistance: true,
  baseZ,
  ...(toFace ? { toFace } : {}),
})

/**
 * 將一個時間軸 Hole 展開為現有 kernel 已懂得重播的 Feature[]。
 * 子 feature id 穩定地以 Hole id 為前綴，故 UI 可只顯示一個 Hole 節點，
 * 而 worker 仍可重用現有 extrude/loft 實作。
 */
export function expandHoleFeature(hole: HoleFeaturePayload): Feature[] {
  if (hole.centers?.length) {
    return hole.centers.flatMap((center, index) => expandHoleFeature({ ...hole, id: `${hole.id}:${index}`, center, centers: undefined, pattern: undefined }))
  }
  const [cx, cy] = hole.center
  const top = Math.max(0.1, hole.top)
  const through = hole.through ?? hole.extent === 'through-all'
  const actualD = hole.kind === 'tapped' ? hole.tap?.drillDiameter ?? hole.diameter : hole.diameter
  const diameter = Math.max(0.5, actualD)
  const radius = diameter / 2
  const blindDepth = Math.max(2, Math.min(Math.max(0.1, top - 1), hole.depth ?? diameter * 1.5))
  const throughHeight = top + 10

  const mainCut = (id: string, r = radius): Feature => {
    if (hole.kind === 'simple' && hole.extent === 'to-next' && hole.nextFaceZ != null && hole.nextFaceZ < top - 0.05) {
      const nextZ = Math.max(0, hole.nextFaceZ)
      return cutCircle(id, [cx, cy], r, Math.max(1, top - nextZ) + 5, nextZ)
    }
    if (hole.kind === 'simple' && hole.extent === 'to-object' && hole.toFace) {
      const initialDepth = Math.max(1, Math.abs(top - hole.toFace.near[2]))
      return cutCircle(id, [cx, cy], r, initialDepth, top, hole.toFace)
    }
    if (through || hole.extent === 'through-all' || (hole.kind === 'simple' && hole.extent === 'to-next')) {
      return cutCircle(id, [cx, cy], r, throughHeight, 0)
    }
    return cutCircle(id, [cx, cy], r, blindDepth + 5, top - blindDepth)
  }

  if (hole.kind === 'simple') {
    const out: Feature[] = [mainCut(`${hole.id}:drill`)]
    if (!through && hole.extent !== 'to-next' && hole.extent !== 'to-object' && hole.drillPoint) {
      const angle = Math.max(60, Math.min(180, hole.drillPoint.angle || 118))
      const tipH = radius / Math.tan((angle / 2) * Math.PI / 180)
      const shoulder = top - blindDepth
      out.push({
        id: `${hole.id}:drill-point`, type: 'loft', op: 'cut',
        sections: [
          { profile: { kind: 'circle', c: [cx, cy], r: radius }, z: shoulder },
          { profile: { kind: 'circle', c: [cx, cy], r: 0.05 }, z: Math.max(0.05, shoulder - tipH) },
        ],
      })
    }
    if ((through || hole.extent === 'through-all') && (hole.chamfer ?? 0) > 0) {
      const ch = Math.max(0, hole.chamfer ?? 0)
      out.push({
        id: `${hole.id}:mouth-chamfer`, type: 'loft', op: 'cut',
        sections: [
          { profile: { kind: 'circle', c: [cx, cy], r: radius }, z: Math.max(0.05, top - ch) },
          { profile: { kind: 'circle', c: [cx, cy], r: radius + ch + 0.3 }, z: top + 0.3 },
        ],
      })
    }
    return out
  }
  if (hole.kind === 'tapped') return [mainCut(`${hole.id}:drill`)]

  if (hole.kind === 'counterbore') {
    const cb = hole.counterbore
    if (!cb) throw new Error('Counterbore Hole 缺少 counterbore 參數')
    const recessDepth = Math.max(0.2, cb.depth)
    const recessRadius = Math.max(cb.diameter / 2, radius + 0.6)
    const recessBase = Math.max(0.1, top - recessDepth)
    return [
      mainCut(`${hole.id}:drill`),
      cutCircle(`${hole.id}:counterbore`, [cx, cy], recessRadius, Math.min(recessDepth + 2, top - recessBase + 2), recessBase),
    ]
  }

  const cs = hole.countersink
  if (!cs) throw new Error('Countersink Hole 缺少 countersink 參數')
  const angle = Math.max(10, Math.min(170, cs.angle))
  const halfTan = Math.tan((angle / 2) * Math.PI / 180)
  const topRadius = Math.max(cs.diameter / 2, radius + 0.6)
  const coneDepth = Math.max(0.4, (topRadius - radius) / halfTan)
  return [
    mainCut(`${hole.id}:drill`),
    {
      id: `${hole.id}:countersink`,
      type: 'loft',
      op: 'cut',
      sections: [
        { profile: { kind: 'circle', c: [cx, cy], r: radius }, z: Math.max(0.1, top - coneDepth) },
        { profile: { kind: 'circle', c: [cx, cy], r: topRadius + 0.5 * halfTan }, z: top + 0.5 },
      ],
    },
  ]
}
