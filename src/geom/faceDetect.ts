// Detect what KIND of face a clicked triangle belongs to — a flat plane or a cylinder — by flood-filling the
// smoothly-connected triangle region around it and fitting. Self-written, license-safe, dependency-free.
// CAD-coords in, CAD-coords out (caller transforms to world). Used by face-pick mate so concentric/coaxial
// mating works by clicking two cylindrical faces (holes/shafts), not just flat faces. Falls back to PLANAR
// (the clicked triangle's own normal) whenever a cylinder fit is poor — so it never produces a bogus axis.

export type PlanarFace = { kind: 'planar'; n: [number, number, number]; p: [number, number, number] }
export type CylFace = { kind: 'cyl'; axis: [number, number, number]; p: [number, number, number]; r: number; h0?: number; h1?: number; concave?: boolean }  // h0/h1（T775）：面沿轴投影范围（相对 p）；concave = 孔内壁
export type DetectedFace = PlanarFace | CylFace

type V3 = [number, number, number]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: V3) => Math.hypot(a[0], a[1], a[2])
const norm = (a: V3): V3 => { const L = len(a) || 1; return [a[0] / L, a[1] / L, a[2] / L] }

// Detect the face under triangle `fi`. smoothDeg = max per-step dihedral to stay on one smooth face;
// planarDeg = if the whole region's normals stay within this of the seed, it's flat.
export function detectFace(
  mesh: { vertices: ArrayLike<number>; triangles: ArrayLike<number> }, fi: number,
  smoothDeg = 35, planarDeg = 6,
): DetectedFace | null {
  const v = mesh.vertices, t = mesh.triangles, nt = (t.length / 3) | 0
  if (!(fi >= 0 && fi < nt)) return null
  // Weld vertices by quantised position (OCCT emits per-face duplicates) → canonical ids for adjacency.
  const grid = 1e4, idOf = new Map<string, number>(); const canon = new Array<number>((v.length / 3) | 0)
  let nid = 0
  for (let i = 0; i < v.length; i += 3) {
    const k = `${Math.round(v[i] * grid)},${Math.round(v[i + 1] * grid)},${Math.round(v[i + 2] * grid)}`
    let id = idOf.get(k); if (id === undefined) { id = nid++; idOf.set(k, id) }
    canon[i / 3] = id
  }
  const triPt = (k: number, j: number): V3 => { const o = t[3 * k + j] * 3; return [v[o], v[o + 1], v[o + 2]] }
  const triNormal = (k: number): V3 => norm(cross(sub(triPt(k, 1), triPt(k, 0)), sub(triPt(k, 2), triPt(k, 0))))
  // Edge → triangles map (undirected, on welded ids).
  const edgeMap = new Map<number, number[]>()
  for (let k = 0; k < nt; k++) {
    const ids = [canon[t[3 * k]], canon[t[3 * k + 1]], canon[t[3 * k + 2]]]
    for (let e = 0; e < 3; e++) {
      let a = ids[e], b = ids[(e + 1) % 3]; if (a === b) continue; if (a > b) { const x = a; a = b; b = x }
      const key = a * nid + b; const arr = edgeMap.get(key); if (arr) arr.push(k); else edgeMap.set(key, [k])
    }
  }
  const neighbors = (k: number): number[] => {
    const ids = [canon[t[3 * k]], canon[t[3 * k + 1]], canon[t[3 * k + 2]]], out: number[] = []
    for (let e = 0; e < 3; e++) {
      let a = ids[e], b = ids[(e + 1) % 3]; if (a === b) continue; if (a > b) { const x = a; a = b; b = x }
      for (const tt of edgeMap.get(a * nid + b) || []) if (tt !== k) out.push(tt)
    }
    return out
  }
  // BFS the smooth region around fi (per-step normal angle gate). Cap to keep it bounded.
  const cosStep = Math.cos((smoothDeg * Math.PI) / 180)
  const seen = new Set<number>([fi]); const queue = [fi]; const region: number[] = []
  const MAXT = 6000
  while (queue.length && region.length < MAXT) {
    const k = queue.shift()!; region.push(k); const nk = triNormal(k)
    for (const m of neighbors(k)) { if (seen.has(m)) continue; if (dot(nk, triNormal(m)) > cosStep) { seen.add(m); queue.push(m) } }
  }
  const seedN = triNormal(fi)
  // Planar test: every region normal close to the seed normal.
  let maxDev = 0; for (const k of region) maxDev = Math.max(maxDev, Math.acos(Math.min(1, Math.max(-1, dot(seedN, triNormal(k))))))
  // Region unique vertices + centroid.
  const vset = new Set<number>(); const pts: V3[] = []
  for (const k of region) for (let j = 0; j < 3; j++) { const id = canon[t[3 * k + j]]; if (!vset.has(id)) { vset.add(id); pts.push(triPt(k, j)) } }
  const centroid = (): V3 => { const c: V3 = [0, 0, 0]; for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2] } const n = pts.length || 1; return [c[0] / n, c[1] / n, c[2] / n] }
  const C = centroid()
  if (maxDev <= (planarDeg * Math.PI) / 180 || region.length < 3) {
    return { kind: 'planar', n: seedN, p: C }
  }
  // Cylinder fit. axis = direction ⊥ to all surface normals → accumulate sign-aligned cross products.
  let acc: V3 = [0, 0, 0]
  for (const k of region) { const c = cross(seedN, triNormal(k)); if (len(c) > 1e-3) { const s = dot(c, acc) >= 0 ? 1 : -1; acc = [acc[0] + s * c[0], acc[1] + s * c[1], acc[2] + s * c[2]] } }
  if (len(acc) < 1e-6) return { kind: 'planar', n: seedN, p: C } // degenerate → planar fallback
  const axis = norm(acc)
  // Radius = mean distance of region vertices from the axis line through C; check the fit is tight.
  let sum = 0, sum2 = 0
  for (const p of pts) { const d = sub(p, C); const along = dot(d, axis); const perp = len([d[0] - along * axis[0], d[1] - along * axis[1], d[2] - along * axis[2]]); sum += perp; sum2 += perp * perp }
  const m = pts.length || 1, r = sum / m, varr = Math.max(0, sum2 / m - r * r), sd = Math.sqrt(varr)
  if (r < 1e-3 || sd / r > 0.18) return { kind: 'planar', n: seedN, p: C } // not a clean cylinder → planar fallback
  // T775：沿轴投影范围（外螺纹/按拉用 — 面有几高）+ 凹凸（孔内壁 vs 凸台外壁，法向朝轴=凹）
  let h0 = 1e18, h1 = -1e18
  for (const p of pts) { const along = dot(sub(p, C), axis); if (along < h0) h0 = along; if (along > h1) h1 = along }
  const seedC = triPt(fi, 0)
  const dC = sub(seedC, C); const alongC = dot(dC, axis)
  const radial: V3 = [dC[0] - alongC * axis[0], dC[1] - alongC * axis[1], dC[2] - alongC * axis[2]]
  const concave = dot(seedN, radial) < 0
  return { kind: 'cyl', axis, p: C, r, h0, h1, concave }
}

// P2（Fusion Press Pull 语义）：判断点击点是否贴住一条「锐边」— 相邻两个三角法向夹角 > sharpDeg（B-rep 棱在
// tessellation 上嘅样），或者边只得一个三角（网格边界）。按拉命令用嚟分流：点边=圆角、点面中间=移面。
// pt 系 CAD 坐标（同 mesh.vertices 同一坐标系）；tol = 世界距离容差（caller 按像素换算）。
// 成本：weld + edgeMap 一 pass O(V+T)，同 detectFace 每 click 一样量级 — 只喺按拉点击时先行。
export function nearSharpEdge(
  mesh: { vertices: ArrayLike<number>; triangles: ArrayLike<number> }, fi: number,
  pt: V3, tol: number, sharpDeg = 25, rings = 4,
): boolean {
  const v = mesh.vertices, t = mesh.triangles, nt = (t.length / 3) | 0
  if (!(fi >= 0 && fi < nt) || !(tol > 0)) return false
  const grid = 1e4, idOf = new Map<string, number>(); const canon = new Array<number>((v.length / 3) | 0); let nid = 0
  for (let i = 0; i < v.length; i += 3) {
    const k = `${Math.round(v[i] * grid)},${Math.round(v[i + 1] * grid)},${Math.round(v[i + 2] * grid)}`
    let id = idOf.get(k); if (id === undefined) { id = nid++; idOf.set(k, id) }
    canon[i / 3] = id
  }
  const triPt = (k: number, j: number): V3 => { const o = t[3 * k + j] * 3; return [v[o], v[o + 1], v[o + 2]] }
  const triNormal = (k: number): V3 => norm(cross(sub(triPt(k, 1), triPt(k, 0)), sub(triPt(k, 2), triPt(k, 0))))
  const edgeMap = new Map<number, number[]>()
  for (let k = 0; k < nt; k++) { const ids = [canon[t[3 * k]], canon[t[3 * k + 1]], canon[t[3 * k + 2]]]; for (let e = 0; e < 3; e++) { let a = ids[e], b = ids[(e + 1) % 3]; if (a === b) continue; if (a > b) { const x = a; a = b; b = x }; const key = a * nid + b; const arr = edgeMap.get(key); if (arr) arr.push(k); else edgeMap.set(key, [k]) } }
  // BFS k-ring 邻域（唔设 smooth gate — 要跨过棱睇对面）
  const hop = new Map<number, number>([[fi, 0]]); const queue = [fi]
  while (queue.length) {
    const k = queue.shift()!; const h = hop.get(k)!
    if (h >= rings) continue
    const ids = [canon[t[3 * k]], canon[t[3 * k + 1]], canon[t[3 * k + 2]]]
    for (let e = 0; e < 3; e++) {
      let a = ids[e], b = ids[(e + 1) % 3]; if (a === b) continue; if (a > b) { const x = a; a = b; b = x }
      for (const m of edgeMap.get(a * nid + b) || []) if (!hop.has(m)) { hop.set(m, h + 1); queue.push(m) }
    }
  }
  const cosSharp = Math.cos((sharpDeg * Math.PI) / 180)
  const segDist = (p: V3, a: V3, b: V3): number => {
    const ab = sub(b, a), ap = sub(p, a); const L2 = dot(ab, ab)
    const s = L2 > 1e-18 ? Math.min(1, Math.max(0, dot(ap, ab) / L2)) : 0
    return len([p[0] - a[0] - s * ab[0], p[1] - a[1] - s * ab[1], p[2] - a[2] - s * ab[2]])
  }
  for (const k of hop.keys()) {
    const ids = [canon[t[3 * k]], canon[t[3 * k + 1]], canon[t[3 * k + 2]]]
    for (let e = 0; e < 3; e++) {
      const ai = ids[e], bi = ids[(e + 1) % 3]; if (ai === bi) continue
      let a = ai, b = bi; if (a > b) { const x = a; a = b; b = x }
      const tris = edgeMap.get(a * nid + b) || []
      // 锐边 = 相邻两片法向差过阈（或只得一片 — 开边界）
      let sharp = tris.length < 2
      if (!sharp) for (let i = 0; i < tris.length && !sharp; i++) for (let j = i + 1; j < tris.length; j++) if (dot(triNormal(tris[i]), triNormal(tris[j])) < cosSharp) { sharp = true; break }
      if (!sharp) continue
      const pA = triPt(k, e), pB = triPt(k, (e + 1) % 3)
      if (segDist(pt, pA, pB) <= tol) return true
    }
  }
  return false
}

export type Cyl = { axis: [number, number, number]; p: [number, number, number]; r: number; concave: boolean }

// Enumerate ALL cylindrical faces in a mesh (CAD coords). `concave:true` = a HOLE (surface normals point toward
// the axis); false = a boss/outer wall (normals point away). For batch "fit screws to every hole". Scans every
// triangle, flood-fills smooth regions, fits + classifies each, dedupes coaxial same-radius faces.
export function detectAllCylinders(mesh: { vertices: ArrayLike<number>; triangles: ArrayLike<number> }, smoothDeg = 35): Cyl[] {
  const v = mesh.vertices, t = mesh.triangles, nt = (t.length / 3) | 0
  if (nt < 6) return []
  const grid = 1e4, idOf = new Map<string, number>(); const canon = new Array<number>((v.length / 3) | 0); let nid = 0
  for (let i = 0; i < v.length; i += 3) {
    const k = `${Math.round(v[i] * grid)},${Math.round(v[i + 1] * grid)},${Math.round(v[i + 2] * grid)}`
    let id = idOf.get(k); if (id === undefined) { id = nid++; idOf.set(k, id) }
    canon[i / 3] = id
  }
  const triPt = (k: number, j: number): V3 => { const o = t[3 * k + j] * 3; return [v[o], v[o + 1], v[o + 2]] }
  const triNormal = (k: number): V3 => norm(cross(sub(triPt(k, 1), triPt(k, 0)), sub(triPt(k, 2), triPt(k, 0))))
  const edgeMap = new Map<number, number[]>()
  for (let k = 0; k < nt; k++) { const ids = [canon[t[3 * k]], canon[t[3 * k + 1]], canon[t[3 * k + 2]]]; for (let e = 0; e < 3; e++) { let a = ids[e], b = ids[(e + 1) % 3]; if (a === b) continue; if (a > b) { const x = a; a = b; b = x }; const key = a * nid + b; const arr = edgeMap.get(key); if (arr) arr.push(k); else edgeMap.set(key, [k]) } }
  const neighbors = (k: number): number[] => { const ids = [canon[t[3 * k]], canon[t[3 * k + 1]], canon[t[3 * k + 2]]], out: number[] = []; for (let e = 0; e < 3; e++) { let a = ids[e], b = ids[(e + 1) % 3]; if (a === b) continue; if (a > b) { const x = a; a = b; b = x }; for (const tt of edgeMap.get(a * nid + b) || []) if (tt !== k) out.push(tt) } return out }
  const cosStep = Math.cos((smoothDeg * Math.PI) / 180)
  const visited = new Uint8Array(nt)
  const out: Cyl[] = []
  for (let seed = 0; seed < nt; seed++) {
    if (visited[seed]) continue
    const region: number[] = []; const queue = [seed]; visited[seed] = 1
    while (queue.length) { const k = queue.shift()!; region.push(k); const nk = triNormal(k); for (const mn of neighbors(k)) { if (visited[mn]) continue; if (dot(nk, triNormal(mn)) > cosStep) { visited[mn] = 1; queue.push(mn) } } }
    if (region.length < 6) continue
    const seedN = triNormal(seed)
    let maxDev = 0; for (const k of region) maxDev = Math.max(maxDev, Math.acos(Math.min(1, Math.max(-1, dot(seedN, triNormal(k))))))
    if (maxDev < (8 * Math.PI) / 180) continue // flat face
    const vset = new Set<number>(); const pts: V3[] = []
    for (const k of region) for (let j = 0; j < 3; j++) { const id = canon[t[3 * k + j]]; if (!vset.has(id)) { vset.add(id); pts.push(triPt(k, j)) } }
    const C: V3 = [0, 0, 0]; for (const p of pts) { C[0] += p[0]; C[1] += p[1]; C[2] += p[2] } { const n = pts.length || 1; C[0] /= n; C[1] /= n; C[2] /= n }
    let acc: V3 = [0, 0, 0]
    for (const k of region) { const c = cross(seedN, triNormal(k)); if (len(c) > 1e-3) { const s = dot(c, acc) >= 0 ? 1 : -1; acc = [acc[0] + s * c[0], acc[1] + s * c[1], acc[2] + s * c[2]] } }
    if (len(acc) < 1e-6) continue
    const axis = norm(acc)
    let sum = 0, sum2 = 0
    for (const p of pts) { const d = sub(p, C); const along = dot(d, axis); const perp = len([d[0] - along * axis[0], d[1] - along * axis[1], d[2] - along * axis[2]]); sum += perp; sum2 += perp * perp }
    const m = pts.length || 1, r = sum / m, sd = Math.sqrt(Math.max(0, sum2 / m - r * r))
    if (r < 0.3 || sd / r > 0.18) continue
    // Concavity: does the surface normal point TOWARD the axis (hole) or away (boss)? Average over the region.
    let concSum = 0
    for (const k of region) { const c0 = triPt(k, 0); const d = sub(c0, C); const along = dot(d, axis); const radial = norm([d[0] - along * axis[0], d[1] - along * axis[1], d[2] - along * axis[2]]); concSum += dot(triNormal(k), radial) }
    out.push({ axis, p: C, r, concave: concSum < 0 })
  }
  // Dedup coaxial same-radius faces (e.g. a face split across the smooth gate): key by r + axis + radial-of-C.
  const seen = new Set<string>(); const dedup: Cyl[] = []
  for (const c of out) {
    const a = c.axis, P = c.p; const along = P[0] * a[0] + P[1] * a[1] + P[2] * a[2]
    const radial = [P[0] - along * a[0], P[1] - along * a[1], P[2] - along * a[2]]
    const key = `${c.r.toFixed(1)}|${a.map((x) => x.toFixed(2)).join(',')}|${radial.map((x) => x.toFixed(1)).join(',')}|${c.concave}`
    if (seen.has(key)) continue; seen.add(key); dedup.push(c)
  }
  return dedup
}
