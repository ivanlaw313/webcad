// FISHING13 P2-3：草圖圓角／倒角支援【開放折線】嘅內部角（兩段共用頂點）。
// 以前 shapeCornerPath 只認閉合折線/矩形 → 開放 2 段折線（直線工具連續畫兩段）點角就報「圓沒有角」。
// 開放路徑：n 頂點、n−1 段；只有內部頂點 1..n−2 先係角（兩端端點唔係角）。
// filletAt / chamferAtIdx 用 (i−1+n)%n、(i+1)%n 取鄰點 —— 內部頂點時同閉合一樣正確；
// 出嚟嘅 bulges 會多一個（閉合路徑嘅收口段）→ 開放路徑要截返 verts.length−1 個。
export type Pt = [number, number]
export type CornerPath = { verts: Pt[]; bulges: number[]; open?: boolean }

/** 角點 k 可唔可以倒圓角／倒角：閉合 = 任何頂點；開放 = 只限內部頂點（兩段共用嘅頂點）。 */
export function cornerIndexAllowed(cp: CornerPath, k: number): boolean {
  const n = cp.verts.length
  if (k < 0 || k >= n) return false
  return !cp.open || (k > 0 && k < n - 1)
}

/** 開放折線（無平滑／弧／橢圓樣本點）→ 角路徑；其他返 null（由呼叫方處理閉合／矩形）。 */
export function openPolyCornerPath(sh: { type: string; open?: boolean; smooth?: boolean; arc?: unknown; ell?: unknown; earc?: unknown; conic?: boolean; ctrl?: unknown; pts?: Pt[]; verts?: Pt[]; bulges?: number[] }): CornerPath | null {
  if (sh.type !== 'poly' || !sh.open || sh.smooth || sh.arc || sh.ell || sh.earc || sh.conic || sh.ctrl) return null
  const src = sh.verts ?? sh.pts
  if (!src || src.length < 3) return null
  const verts = src.map((p) => [p[0], p[1]] as Pt)
  const bulges = verts.slice(0, -1).map((_, k) => (sh.verts && sh.bulges ? sh.bulges[k] || 0 : 0))
  return { verts, bulges, open: true }
}

/** filletAt / chamferAtIdx 結果規範化：開放路徑截走多出嘅收口段 bulge。 */
export function normalizeCornerResult(res: { verts: Pt[]; bulges: number[] }, open?: boolean): { verts: Pt[]; bulges: number[] } {
  if (!open) return res
  return { verts: res.verts, bulges: res.bulges.slice(0, Math.max(0, res.verts.length - 1)) }
}

/** 揀最近嘅可倒角頂點（跳過開放路徑端點）。返 shape／vertex index 同距離；全部冇 → bi=-1。 */
export function nearestCorner(paths: (CornerPath | null)[], p: Pt): { bi: number; vi: number; best: number; nearEnd: boolean; endBest: number } {
  let bi = -1, vi = -1, best = Infinity, endBest = Infinity
  for (let i = 0; i < paths.length; i++) {
    const cp = paths[i]; if (!cp) continue
    for (let k = 0; k < cp.verts.length; k++) {
      const dd = Math.hypot(p[0] - cp.verts[k][0], p[1] - cp.verts[k][1])
      if (!cornerIndexAllowed(cp, k)) { if (dd < endBest) endBest = dd; continue }
      if (dd < best) { best = dd; bi = i; vi = k }
    }
  }
  return { bi, vi, best, nearEnd: endBest < best, endBest }
}

// FISHING13 P2-3（續）：兩條【獨立】開放直線（各自一個 shape）共用一個端點 —— Fusion 一樣可以喺嗰個共用頂點倒圓角。
// 做法：把兩條合併成一條開放折線（第一條掉頭令共用點喺尾、第二條令共用點喺頭），約束跟住改 index：
//   第一條 shape 留喺原位、第二條移除（之後嘅 shape index −1），兩條之間「共用點重合」約束變成同一頂點 → 移除。
// 返 null = 冇符合嘅一對（或者有分岔：同一點多過兩條線）。
type Ref = { kind: string; shape?: number; idx?: number } & Record<string, unknown>
type Con = { a?: Ref; b?: Ref; c?: Ref; kind?: string; type?: string } & Record<string, unknown>
type OpenLine = { type: string; open?: boolean; pts?: Pt[]; verts?: Pt[]; bulges?: number[]; smooth?: boolean; arc?: unknown; ell?: unknown; earc?: unknown; conic?: boolean; ctrl?: unknown; construction?: boolean; centerline?: boolean; projected?: boolean; offsetOf?: unknown }
function straightOpen(sh: OpenLine): { v: Pt[]; b: number[] } | null {
  if (sh.type !== 'poly' || !sh.open || sh.smooth || sh.arc || sh.ell || sh.earc || sh.conic || sh.ctrl || sh.projected || sh.offsetOf) return null
  const src = sh.verts ?? sh.pts
  if (!src || src.length < 2) return null
  const v = src.map((p) => [p[0], p[1]] as Pt)
  const b = v.slice(0, -1).map((_, k) => (sh.verts && sh.bulges ? sh.bulges[k] || 0 : 0))
  return { v, b }
}
export function mergeOpenAtJoint<S extends OpenLine, C extends Con>(shapes: S[], cons: C[], p: Pt, tol: number, same = 1e-6):
  { shapes: S[]; cons: C[]; shapeIdx: number; vi: number; merged: { verts: Pt[]; bulges: number[] }; droppedCons: number } | null {
  const ends: { i: number; atEnd: boolean; q: Pt }[] = []
  shapes.forEach((sh, i) => { const g = straightOpen(sh); if (!g) return; ends.push({ i, atEnd: false, q: g.v[0] }, { i, atEnd: true, q: g.v[g.v.length - 1] }) })
  let best: { a: typeof ends[number]; b: typeof ends[number]; d: number } | null = null
  for (let x = 0; x < ends.length; x++) for (let y = x + 1; y < ends.length; y++) {
    const A = ends[x], B = ends[y]
    if (A.i === B.i) continue
    if (Math.hypot(A.q[0] - B.q[0], A.q[1] - B.q[1]) > same) continue
    const d = Math.hypot(p[0] - A.q[0], p[1] - A.q[1])
    if (d <= tol && (!best || d < best.d)) best = { a: A, b: B, d }
  }
  if (!best) return null
  const J = best.a.q
  if (ends.filter((e) => Math.hypot(e.q[0] - J[0], e.q[1] - J[1]) <= same).length !== 2) return null   // 分岔 → 唔估
  const [first, second] = best.a.i < best.b.i ? [best.a, best.b] : [best.b, best.a]
  const ga = straightOpen(shapes[first.i])!, gb = straightOpen(shapes[second.i])!
  if (!!shapes[first.i].construction !== !!shapes[second.i].construction) return null
  const revA = !first.atEnd, revB = second.atEnd
  const na = ga.v.length, nb = gb.v.length
  const va = revA ? [...ga.v].reverse() : ga.v, ba = revA ? [...ga.b].reverse().map((x) => -x) : ga.b
  const vb = revB ? [...gb.v].reverse() : gb.v, bb = revB ? [...gb.b].reverse().map((x) => -x) : gb.b
  const verts = [...va, ...vb.slice(1)], bulges = [...ba, ...bb]
  const ia = first.i, ib = second.i
  const mapRef = (r: Ref | undefined): Ref | undefined => {
    if (!r || typeof r.shape !== 'number') return r
    const k = r.kind, idx = typeof r.idx === 'number' ? r.idx : undefined
    if (r.shape === ia) {
      if (idx == null) return r
      if (k === 'pt') return { ...r, idx: revA ? na - 1 - idx : idx }
      if (k === 'edge' || k === 'center') return { ...r, idx: revA ? na - 2 - idx : idx }
      return r
    }
    if (r.shape === ib) {
      if (idx == null) return { ...r, shape: ia }
      if (k === 'pt') return { ...r, shape: ia, idx: (revB ? nb - 1 - idx : idx) + na - 1 }
      if (k === 'edge' || k === 'center') return { ...r, shape: ia, idx: (revB ? nb - 2 - idx : idx) + na - 1 }
      return { ...r, shape: ia }
    }
    if (r.shape > ib) return { ...r, shape: r.shape - 1 }
    return r
  }
  let droppedCons = 0
  const out: C[] = []
  for (const c of cons) {
    const nc = { ...c } as C
    if (c.a) (nc as Con).a = mapRef(c.a)
    if (c.b) (nc as Con).b = mapRef(c.b)
    if (c.c) (nc as Con).c = mapRef(c.c)
    const A = (nc as Con).a, B = (nc as Con).b
    if (c.type === 'coincident' && A && B && A.kind === 'pt' && B.kind === 'pt' && A.shape === B.shape && A.idx === B.idx) { droppedCons++; continue }
    out.push(nc)
  }
  const base = shapes[ia]
  const merged = { ...base, type: 'poly', pts: verts, verts, bulges, open: true } as S
  const ns = shapes.map((sh, i) => (i === ia ? merged : sh)).filter((_, i) => i !== ib)
  return { shapes: ns, cons: out, shapeIdx: ia, vi: na - 1, merged: { verts, bulges }, droppedCons }
}
