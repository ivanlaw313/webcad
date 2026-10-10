// FISHING12 P2：網格面測量（組件／匯入網格 — 冇內核 B-rep 時嘅後備）。
// 舊做法 measureMeshFaceRegion 用 8° 平面泛洪：圓柱面只收到一條窄帶 → 面積 0.4 cm²（實際 9.4）；
// 圓柱軸點用區域形心（半圓柱會偏離軸線）；而且無轉換到世界座標 → 兩個組件嘅軸距／面距用各自局部座標計，數值錯。
// 呢度：① 有 faceGroups 就用整個 B-rep 面嘅三角形（冇就用 35° 平滑泛洪）；② 先套 matrixWorld 再轉 CAD 座標；
// ③ 平面 = 面積加權法向＋形心；圓柱 = 法向求軸 + 垂直面 Kasa 圓擬合求軸點／半徑，面積用展開（r·φ, h）精確計。
type V3 = [number, number, number]
export type MeshFaceInput = { vertices: ArrayLike<number>; triangles: ArrayLike<number>; faceGroups?: { start: number; count: number; faceId: number }[] }
export type MeshFaceResult = {
  area: number; surfType: 'PLANE' | 'CYLINDRE' | 'FACE'; triCount: number
  radius?: number; axisO?: V3; axisD?: V3; planeO?: V3; planeN?: V3
}
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: V3) => Math.hypot(a[0], a[1], a[2])
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

/** 同一 B-rep 面（faceGroups）或平滑區域（35° 泛洪）嘅三角形索引。 */
export function meshFaceTriangles(mesh: MeshFaceInput, fi: number, smoothDeg = 35): number[] {
  const t = mesh.triangles, v = mesh.vertices, nt = (t.length / 3) | 0
  if (!(fi >= 0 && fi < nt)) return []
  const fg = mesh.faceGroups
  if (fg && fg.length) {
    let faceId: number | null = null
    for (const g of fg) if (fi * 3 >= g.start && fi * 3 < g.start + g.count) { faceId = g.faceId; break }
    if (faceId != null) {
      const out: number[] = []
      for (const g of fg) if (g.faceId === faceId) for (let i = g.start; i < g.start + g.count; i += 3) out.push(i / 3)
      if (out.length) return out
    }
  }
  const grid = 1e4, idOf = new Map<string, number>(), canon = new Array<number>((v.length / 3) | 0)
  let nid = 0
  for (let i = 0; i < v.length; i += 3) {
    const k = `${Math.round(v[i] * grid)},${Math.round(v[i + 1] * grid)},${Math.round(v[i + 2] * grid)}`
    let id = idOf.get(k); if (id === undefined) { id = nid++; idOf.set(k, id) }
    canon[i / 3] = id
  }
  const P = (k: number, j: number): V3 => { const o = (t[3 * k + j] as number) * 3; return [v[o], v[o + 1], v[o + 2]] }
  const triN = (k: number): V3 => norm(cross(sub(P(k, 1), P(k, 0)), sub(P(k, 2), P(k, 0))))
  const edges = new Map<number, number[]>()
  const ek = (a: number, b: number) => (a < b ? a * nid + b : b * nid + a)
  for (let k = 0; k < nt; k++) {
    const ids = [canon[t[3 * k] as number], canon[t[3 * k + 1] as number], canon[t[3 * k + 2] as number]]
    for (let e = 0; e < 3; e++) { const a = ids[e], b = ids[(e + 1) % 3]; if (a === b) continue; const key = ek(a, b); const arr = edges.get(key); if (arr) arr.push(k); else edges.set(key, [k]) }
  }
  const cosStep = Math.cos((smoothDeg * Math.PI) / 180)
  const seen = new Set([fi]), queue = [fi], out: number[] = []
  while (queue.length && out.length < 20000) {
    const k = queue.shift()!; out.push(k); const nk = triN(k)
    const ids = [canon[t[3 * k] as number], canon[t[3 * k + 1] as number], canon[t[3 * k + 2] as number]]
    for (let e = 0; e < 3; e++) {
      const a = ids[e], b = ids[(e + 1) % 3]; if (a === b) continue
      for (const m of edges.get(ek(a, b)) ?? []) if (!seen.has(m) && dot(nk, triN(m)) > cosStep) { seen.add(m); queue.push(m) }
    }
  }
  return out
}

/** matrix = three.js matrixWorld.elements（column-major）；有就轉到 three 世界再轉 CAD（x,−z,y），冇就當 mesh 已係 CAD 座標。 */
function toCad(p: V3, m?: ArrayLike<number>): V3 {
  if (!m) return p
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]
  const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
  return [x, -z, y]
}

/** 平面點集喺 2D 嘅代數圓擬合（Kasa）：返回圓心 (u,v) 同半徑。 */
function fitCircle2(pts: [number, number][]): { u: number; v: number; r: number; rms: number } | null {
  const n = pts.length
  if (n < 3) return null
  let mu = 0, mv = 0
  for (const [a, b] of pts) { mu += a; mv += b }
  mu /= n; mv /= n
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0
  for (const [a0, b0] of pts) {
    const a = a0 - mu, b = b0 - mv
    suu += a * a; svv += b * b; suv += a * b; suuu += a * a * a; svvv += b * b * b; suvv += a * b * b; svuu += b * a * a
  }
  const det = suu * svv - suv * suv
  if (Math.abs(det) < 1e-12) return null
  const r1 = 0.5 * (suuu + suvv), r2 = 0.5 * (svvv + svuu)
  const uc = (r1 * svv - r2 * suv) / det, vc = (suu * r2 - suv * r1) / det
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n)
  let e2 = 0
  for (const [a, b] of pts) { const d = Math.hypot(a - mu - uc, b - mv - vc) - r; e2 += d * d }
  return { u: uc + mu, v: vc + mv, r, rms: Math.sqrt(e2 / n) }
}

export function measureMeshFace(mesh: MeshFaceInput, fi: number, matrix?: ArrayLike<number>): MeshFaceResult | null {
  const tris = meshFaceTriangles(mesh, fi)
  if (!tris.length) return null
  const t = mesh.triangles, v = mesh.vertices
  const P = (k: number, j: number): V3 => { const o = (t[3 * k + j] as number) * 3; return toCad([v[o], v[o + 1], v[o + 2]], matrix) }
  const T = tris.map((k) => [P(k, 0), P(k, 1), P(k, 2)] as [V3, V3, V3])
  let area = 0, nAcc: V3 = [0, 0, 0], cAcc: V3 = [0, 0, 0]
  const tn: V3[] = [], ta: number[] = []
  for (const [a, b, c] of T) {
    const cr = cross(sub(b, a), sub(c, a)), ar = len(cr) / 2
    const n = norm(cr)
    tn.push(n); ta.push(ar); area += ar
    nAcc = [nAcc[0] + cr[0] / 2, nAcc[1] + cr[1] / 2, nAcc[2] + cr[2] / 2]
    cAcc = [cAcc[0] + ar * (a[0] + b[0] + c[0]) / 3, cAcc[1] + ar * (a[1] + b[1] + c[1]) / 3, cAcc[2] + ar * (a[2] + b[2] + c[2]) / 3]
  }
  if (!(area > 0)) return null
  const C: V3 = [cAcc[0] / area, cAcc[1] / area, cAcc[2] / area]
  const seedN = tn[0]
  let maxDev = 0
  for (const n of tn) maxDev = Math.max(maxDev, Math.acos(Math.max(-1, Math.min(1, dot(n, seedN)))))
  if (maxDev <= (1 * Math.PI) / 180) return { area, surfType: 'PLANE', triCount: tris.length, planeO: C, planeN: norm(nAcc) }
  // 圓柱：軸 ⊥ 所有法向 → 法向協方差最小特徵向量（用 cross 累加近似，同 faceDetect）
  let acc: V3 = [0, 0, 0]
  for (const n of tn) { const c = cross(seedN, n); if (len(c) > 1e-3) { const s = dot(c, acc) >= 0 ? 1 : -1; acc = [acc[0] + s * c[0], acc[1] + s * c[1], acc[2] + s * c[2]] } }
  if (len(acc) > 1e-6) {
    const ax = norm(acc)
    // 法向要差唔多全部 ⊥ 軸先係圓柱
    let off = 0
    for (const n of tn) off = Math.max(off, Math.abs(dot(n, ax)))
    if (off < 0.05) {
      const e1 = norm(Math.abs(ax[0]) < 0.9 ? cross(ax, [1, 0, 0]) : cross(ax, [0, 1, 0])), e2 = cross(ax, e1)
      const uniq = new Map<string, V3>()
      for (const tri of T) for (const p of tri) uniq.set(p.map((x) => x.toFixed(5)).join(','), p)
      const pts2 = [...uniq.values()].map((p) => [dot(p, e1), dot(p, e2)] as [number, number])
      const fit = fitCircle2(pts2)
      if (fit && fit.r > 1e-6 && fit.rms / fit.r < 0.02) {
        const O: V3 = [e1[0] * fit.u + e2[0] * fit.v, e1[1] * fit.u + e2[1] * fit.v, e1[2] * fit.u + e2[2] * fit.v]
        const axisO: V3 = [O[0] + ax[0] * dot(C, ax), O[1] + ax[1] * dot(C, ax), O[2] + ax[2] * dot(C, ax)]
        // 草圖圓拉伸嘅側面喺 B-rep 係兩張半圓柱（faceGroups 兩組）→ 同軸同半徑、共頂點相連嘅組一併計（Fusion 一個圓柱面）
        const fgs = mesh.faceGroups
        if (fgs && fgs.length > 1) {
          const key = (p: V3) => p.map((x) => x.toFixed(4)).join(',')
          const have = new Set<number>(tris)
          const vkeys = new Set<string>(); for (const tri of T) for (const p of tri) vkeys.add(key(p))
          const onCyl = (p: V3) => { const w = sub(p, axisO), a = dot(w, ax); return Math.abs(len([w[0] - a * ax[0], w[1] - a * ax[1], w[2] - a * ax[2]]) - fit.r) <= Math.max(1e-4, 1e-3 * fit.r) }
          const byId = new Map<number, number[]>()
          for (const gq of fgs) { const arr = byId.get(gq.faceId) ?? []; for (let i = gq.start; i < gq.start + gq.count; i += 3) arr.push(i / 3); byId.set(gq.faceId, arr) }
          let grew = true
          while (grew) {
            grew = false
            for (const [, ks] of byId) {
              if (!ks.length || have.has(ks[0])) continue
              const tt = ks.map((k) => [P(k, 0), P(k, 1), P(k, 2)] as [V3, V3, V3])
              if (!tt.every((tri) => tri.every(onCyl))) continue
              if (!tt.some((tri) => tri.some((p) => vkeys.has(key(p))))) continue
              for (let i = 0; i < ks.length; i++) { have.add(ks[i]); T.push(tt[i]); for (const p of tt[i]) vkeys.add(key(p)) }
              grew = true
            }
          }
        }
        // 展開面積：(r·φ, h) 平面上逐三角形面積 —— 圓柱可展，直線邊界時精確（唔受分面弦高影響）
        const ang = (p: V3) => Math.atan2(dot(p, e2) - fit.v, dot(p, e1) - fit.u)
        let dev = 0
        for (const [a, b, c] of T) {
          const pa = ang(a); let pb = ang(b), pc = ang(c)
          const wrap = (x: number) => { while (x - pa > Math.PI) x -= 2 * Math.PI; while (x - pa < -Math.PI) x += 2 * Math.PI; return x }
          pb = wrap(pb); pc = wrap(pc)
          const ua = [fit.r * pa, dot(a, ax)], ub = [fit.r * pb, dot(b, ax)], uc = [fit.r * pc, dot(c, ax)]
          dev += Math.abs((ub[0] - ua[0]) * (uc[1] - ua[1]) - (uc[0] - ua[0]) * (ub[1] - ua[1])) / 2
        }
        return { area: dev > 0 ? dev : area, surfType: 'CYLINDRE', triCount: T.length, radius: fit.r, axisO, axisD: ax }
      }
    }
  }
  return { area, surfType: 'FACE', triCount: tris.length }
}
