// #14 Topo-naming（有界加法版）：面【拓扑指纹】= 面自身几何类型 + 邻接面几何类型环 嘅 canonical hash。
// 【只做 tiebreaker】：几何指纹（faceFingerprint v1/v2）仍系【主】；本 hash 只喺几何指纹撞（counts>1，对称体）
// 嘅歧义分支里破 tie —— 唔改任何 consumer，唔换制。byte-compat：feature 无 faceFpTopo → resolver 跳过本层 → 逐字节现行行为。
//
// 诚实边界（同 faceFingerprint.ts 一致）：完全对称嘅镜像孪生面（邻接环一模一样）本 hash 亦会撞 → 落返今日 near-point
// 行为（严格唔差过今日）。本层专赢「近对称但拓扑可分」嗰段（v1/v2 miss，如一端有圆角→邻环多咗一个 CYLINDRE）。
//
// 操作 live replicad Face/Edge（geomType/edges/hashCode）—— duck-typed any，唔 import replicad。全程 try/catch：
// 任何退化/抛错 → 返空串（= 无 hash，resolver 当 miss 跳过，同 v2 空串约定一致）。

// 量化几何边键：边中点+两端点量化到 0.001mm 网格 → FNV-1a int hash。几何唯一 → 跨 solid 无碰撞，
// 取代 OCCT hashCode（桶 hash，大件跨 solid 会碰撞 → 错邻接 = recon 风险#1）。端点无向排序（min/max）。
// byte-compat：非碰撞边（细件 99%）得出相同邻接 → topoFaceHash 输出不变；仅修正碰撞错邻接嗰啲。
function edgeGeomKey(e: any): number {
  let m: any, a: any, b: any
  try { if (!e.pointAt) return -1; m = e.pointAt(0.5); a = e.pointAt(0); b = e.pointAt(1) } catch { return -1 }
  if (!m || !a || !b) return -1
  const q = (v: number) => Math.round((v || 0) * 1000)
  const pa = [q(a.x), q(a.y), q(a.z)], pb = [q(b.x), q(b.y), q(b.z)]
  const swap = pa[0] !== pb[0] ? pa[0] > pb[0] : pa[1] !== pb[1] ? pa[1] > pb[1] : pa[2] > pb[2]
  const e0 = swap ? pb : pa, e1 = swap ? pa : pb
  const parts = [q(m.x), q(m.y), q(m.z), e0[0], e0[1], e0[2], e1[0], e1[1], e1[2]]
  let h = 2166136261 >>> 0
  for (const p of parts) { h = Math.imul(h ^ (p & 0xffffffff), 16777619) >>> 0 }
  return h
}

// edge 几何键 → 共用该边嘅面索引表。用于查每张面【跨每条边】嘅邻接面。
export function buildEdgeToFaces(faces: any[]): Map<number, number[]> {
  const m = new Map<number, number[]>()
  for (let i = 0; i < faces.length; i++) {
    let edges: any[] | undefined
    try { edges = faces[i].edges } catch { continue }
    if (!edges) continue
    for (const e of edges) {
      const hc = edgeGeomKey(e)
      if (hc < 0) continue
      const arr = m.get(hc)
      if (arr) { if (!arr.includes(i)) arr.push(i) } else m.set(hc, [i])
    }
  }
  return m
}

// 面 i 嘅 canonical 拓扑 hash：`h1|<面几何类型>|<排序(每条边: 边几何类型>邻接面几何类型集)>`。
// renumber-invariant（排序 multiset，无位置索引）；对小几何变动稳健（只用离散 geomType）；对「一端圆角」类近对称可分。
export function topoFaceHash(faces: any[], i: number, edgeToFaces: Map<number, number[]>): string {
  let kF: string
  try { kF = String(faces[i].geomType) } catch { return '' }
  let edges: any[] | undefined
  try { edges = faces[i].edges } catch { return '' }
  if (!edges) return ''
  const tokens: string[] = []
  for (const e of edges) {
    let ek: string
    try { ek = String(e.geomType) } catch { continue }
    const hc = edgeGeomKey(e)
    if (hc < 0) continue
    const nb = edgeToFaces.get(hc)
    const nbKinds: string[] = []
    if (nb) for (const j of nb) { if (j === i) continue; try { nbKinds.push(String(faces[j].geomType)) } catch { /* skip degenerate neighbor */ } }
    nbKinds.sort()
    tokens.push(`${ek}>${nbKinds.join('&') || '?'}`)
  }
  tokens.sort()
  return `h1|${kF}|${tokens.join(',')}`
}
