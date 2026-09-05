// Per-vertex discrete mesh curvature — self-written, license-safe (no deps, no React, no store, no worker).
//
// This is the math behind Fusion 360 "Inspect > Curvature" (a.k.a. zebra/curvature heat-map): for every
// vertex of a triangle mesh we estimate the two intrinsic differential-geometry scalars
//   • Gaussian curvature  K = κ₁·κ₂   (product of principal curvatures; sign = local shape: +dome, −saddle)
//   • Mean curvature      H = (κ₁+κ₂)/2 (average; magnitude = how "bent" the surface is)
//
// We use the standard DISCRETE differential-geometry operators of Meyer, Desbrun, Schröder & Barr,
// "Discrete Differential-Geometry Operators for Triangulated 2-Manifolds" (2003). They are the de-facto
// reference for curvature on meshes and are math, not code — nothing here is copied, so no license applies.
//
// Two operators, both normalised by the per-vertex MIXED VORONOI AREA A_mixed (Meyer §3.3):
//
//   Gaussian (angle deficit, Gauss–Bonnet):
//       K_i = ( 2π − Σ_f θ_i^f ) / A_mixed_i
//     where θ_i^f is the interior angle at vertex i inside incident triangle f. For a smooth surface the
//     integral of K over a small patch equals the angle deficit (turning), so dividing by the patch area
//     recovers the pointwise K. A flat patch has angles summing to 2π → deficit 0 → K = 0. A sphere of
//     radius r has K = 1/r² everywhere.
//
//   Mean (cotangent Laplace–Beltrami):
//       Δx_i = 1/(2 A_mixed_i) · Σ_{j∈N(i)} (cot α_ij + cot β_ij) (x_i − x_j)
//       H_i  = ½ |Δx_i|
//     where α_ij, β_ij are the two angles opposite the edge (i,j) in its two adjacent triangles. The
//     Laplace–Beltrami of the position field is the mean-curvature normal 2·H·n, hence H = ½|Δx|. A sphere
//     of radius r has H = 1/r. NOTE: this gives |H| only (the sign needs a reference normal); the magnitude
//     is what a curvature map shades, and what the analytic sphere/plane tests below check.
//
// MIXED AREA (Meyer §3.3) — the area "belonging" to vertex i. For each incident triangle:
//   • if the triangle is non-obtuse → add the true Voronoi area of i's corner:
//         (1/8)·( |e_ij|²·cot∠_at_k + |e_ik|²·cot∠_at_j )
//   • if the triangle is obtuse → Voronoi is ill-defined, so add a barycentric fallback:
//         area/2  if the obtuse angle is AT vertex i, else area/4.
// This "mixed" rule keeps every contribution positive and the total area a partition of unity, which is
// exactly what makes both operators converge as the mesh refines.
//
// Inputs are flat arrays (xyz per vertex, 3 indices per triangle) — the same layout the rest of webcad's
// mesh code uses (see geom/meshCheck.ts). Vertices are assumed already shared by index (welded); if a mesh
// has split/duplicated corners, curvature is computed on the topology AS GIVEN (duplicated corners look like
// boundary). Boundary vertices (any vertex on an edge used by only one triangle) get curvature 0 and are
// reported in `boundary`, because the angle-deficit / Laplacian formulas assume a full one-ring and are
// meaningless on a boundary — flat-grid corners/edges are boundary and are correctly excluded from the
// interior trend the tests assert.

export type CurvatureResult = {
  mean: Float64Array      // |H_i| per vertex (mean curvature magnitude). Boundary vertices = 0.
  gaussian: Float64Array  // K_i per vertex (Gaussian curvature, signed). Boundary vertices = 0.
  min: number             // min over INTERIOR vertices of mean ∪ gaussian? No — see below.
  max: number             // max over INTERIOR vertices.
  area: Float64Array      // A_mixed_i per vertex (exposed; useful for area-weighted averages / debugging)
  boundary: Uint8Array    // 1 if vertex i sits on a mesh boundary (curvature left at 0), else 0
  interiorCount: number   // number of non-boundary vertices actually estimated
}
// `min`/`max` summarise the GAUSSIAN field over interior vertices (the primary signed scalar a curvature
// map colours by). They give a quick legend range without the caller re-scanning. Mean is unsigned so its
// range is trivially [0, max|H|]; callers wanting that can scan `mean` directly.

// cot θ from two vectors meeting at the angle's apex: cot = cos/sin = (u·v) / |u×v|.
// Numerically far better than computing the angle then 1/tan (no catastrophic cancellation near 0/π),
// and |u×v| is exactly the 2·area term we also reuse for triangle area. Clamped denominator avoids ±∞
// on a degenerate (zero-area) triangle.
function cotangent(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number): number {
  const dot = ux * vx + uy * vy + uz * vz
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx
  const crossLen = Math.hypot(cx, cy, cz)
  return dot / Math.max(crossLen, 1e-30)
}

// Interior angle (radians) at apex `a` between rays a→b and a→c. atan2(|u×v|, u·v) is the stable form,
// valid across the full [0,π] range (unlike acos(dot/|u||v|), which loses precision near 0 and π).
function angleAt(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number {
  const ux = bx - ax, uy = by - ay, uz = bz - az
  const vx = cx - ax, vy = cy - ay, vz = cz - az
  const dot = ux * vx + uy * vy + uz * vz
  const crx = uy * vz - uz * vy, cry = uz * vx - ux * vz, crz = ux * vy - uy * vx
  return Math.atan2(Math.hypot(crx, cry, crz), dot)
}

/**
 * meshCurvature — discrete per-vertex Gaussian & mean curvature (Meyer et al. 2003).
 *
 * @param vertices flat xyz, length = 3·V
 * @param triangles flat vertex-index triples, length = 3·F (indices into `vertices`)
 * @returns per-vertex `mean` (=|H|) and `gaussian` (=K) Float64Arrays of length V, plus interior min/max of K,
 *          the mixed-area field, a boundary mask, and the interior vertex count.
 *
 * Pure: no imports, no side effects, no allocations beyond the returned arrays + small scratch maps.
 */
export function meshCurvature(vertices: number[], triangles: number[]): CurvatureResult {
  const V = (vertices.length / 3) | 0
  const F = (triangles.length / 3) | 0

  const gaussian = new Float64Array(V)
  const mean = new Float64Array(V)
  const area = new Float64Array(V)
  const boundary = new Uint8Array(V)

  if (V === 0 || F === 0) {
    return { mean, gaussian, area, boundary, min: 0, max: 0, interiorCount: 0 }
  }

  // angleSum[i] accumulates Σ_f θ_i^f over incident triangles (for the angle deficit 2π − Σθ).
  const angleSum = new Float64Array(V)
  // lap[i] accumulates the cotangent-weighted vector Σ_j (cotα+cotβ)(x_i − x_j). After all faces are
  // processed, Δx_i = lap_i / (2 A_mixed_i) and H_i = ½|Δx_i|. We build it edge-by-edge: each interior
  // edge (i,j) is visited from BOTH of its triangles, contributing cotα from one and cotβ from the other,
  // so summing the per-face contribution over all faces yields exactly (cotα+cotβ) for that edge.
  const lapX = new Float64Array(V)
  const lapY = new Float64Array(V)
  const lapZ = new Float64Array(V)

  // Edge-use count over the GIVEN topology (directed-pair canonicalised to a<b) → detect boundary edges
  // (used once). Encoded a*V+b which is unique because a,b < V. We also need, for the cotangent Laplacian,
  // the angle opposite each edge — but that we fold straight into lap[] per-face below, so this map only
  // tracks the manifoldness needed to flag boundary vertices.
  const edgeUse = new Map<number, number>()
  const bumpEdge = (a: number, b: number) => {
    const k = a < b ? a * V + b : b * V + a
    edgeUse.set(k, (edgeUse.get(k) || 0) + 1)
  }

  for (let f = 0; f < F; f++) {
    const i0 = triangles[3 * f], i1 = triangles[3 * f + 1], i2 = triangles[3 * f + 2]
    if (i0 === i1 || i1 === i2 || i2 === i0) continue // skip degenerate index triple

    const ax = vertices[3 * i0], ay = vertices[3 * i0 + 1], az = vertices[3 * i0 + 2]
    const bx = vertices[3 * i1], by = vertices[3 * i1 + 1], bz = vertices[3 * i1 + 2]
    const cx = vertices[3 * i2], cy = vertices[3 * i2 + 1], cz = vertices[3 * i2 + 2]

    // Edge vectors and squared lengths (named by the OPPOSITE vertex, classic notation):
    //   eA opposite i0 = i2→i1 etc. We just need the three squared edge lengths between the corners.
    const l0sq = (bx - cx) ** 2 + (by - cy) ** 2 + (bz - cz) ** 2 // edge i1–i2 (opposite i0)
    const l1sq = (cx - ax) ** 2 + (cy - ay) ** 2 + (cz - az) ** 2 // edge i2–i0 (opposite i1)
    const l2sq = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2 // edge i0–i1 (opposite i2)

    // Interior angles at each corner (stable atan2 form).
    const angA = angleAt(ax, ay, az, bx, by, bz, cx, cy, cz) // at i0
    const angB = angleAt(bx, by, bz, cx, cy, cz, ax, ay, az) // at i1
    const angC = angleAt(cx, cy, cz, ax, ay, az, bx, by, bz) // at i2
    angleSum[i0] += angA; angleSum[i1] += angB; angleSum[i2] += angC

    // Triangle area from cross product of two edges (= ½|u×v|).
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    const crx = uy * vz - uz * vy, cry = uz * vx - ux * vz, crz = ux * vy - uy * vx
    const triArea = 0.5 * Math.hypot(crx, cry, crz)
    if (triArea <= 1e-30) continue // degenerate (collinear) — contributes nothing meaningful

    // Cotangents of each interior angle (reused for BOTH the Laplacian weights and the Voronoi area).
    // cot of angle at i0 weights the edge OPPOSITE i0 (i1–i2), etc.
    const cotA = cotangent(ux, uy, uz, vx, vy, vz)                 // at i0, opposite edge i1–i2
    const cotB = cotangent(ax - bx, ay - by, az - bz, cx - bx, cy - by, cz - bz) // at i1, opposite edge i2–i0
    const cotC = cotangent(ax - cx, ay - cy, az - cz, bx - cx, by - cy, bz - cz) // at i2, opposite edge i0–i1

    // --- Cotangent Laplacian contribution, per edge of this face ---
    // For edge (i1,i2): the angle OPPOSITE it in THIS triangle is angA at i0 → weight cotA.
    // Add cotA·(x_i1 − x_i2) to lap[i1] and the symmetric cotA·(x_i2 − x_i1) to lap[i2].
    // Summed over both triangles sharing edge (i1,i2), the two opposite angles give (cotα+cotβ).
    addEdgeLap(lapX, lapY, lapZ, i1, i2, cotA, bx, by, bz, cx, cy, cz)
    addEdgeLap(lapX, lapY, lapZ, i2, i0, cotB, cx, cy, cz, ax, ay, az)
    addEdgeLap(lapX, lapY, lapZ, i0, i1, cotC, ax, ay, az, bx, by, bz)

    // --- Mixed Voronoi area contribution (Meyer §3.3) ---
    // Non-obtuse triangle → exact Voronoi area for each corner: (1/8)(|e1|²cot∠1 + |e2|²cot∠2) using the
    // two edges incident to that corner and the cotangents of the angles OPPOSITE those two edges.
    const obtuseAtA = angA > Math.PI / 2, obtuseAtB = angB > Math.PI / 2, obtuseAtC = angC > Math.PI / 2
    const anyObtuse = obtuseAtA || obtuseAtB || obtuseAtC
    if (!anyObtuse) {
      // Voronoi region of i0: edges i0–i1 (len²=l2sq, opp angle at i2 → cotC) and i0–i2 (len²=l1sq, opp at i1 → cotB)
      area[i0] += (l2sq * cotC + l1sq * cotB) / 8
      // i1: edges i1–i2 (l0sq, opp at i0 → cotA) and i1–i0 (l2sq, opp at i2 → cotC)
      area[i1] += (l0sq * cotA + l2sq * cotC) / 8
      // i2: edges i2–i0 (l1sq, opp at i1 → cotB) and i2–i1 (l0sq, opp at i0 → cotA)
      area[i2] += (l1sq * cotB + l0sq * cotA) / 8
    } else {
      // Obtuse triangle → barycentric fallback: triArea/2 to the obtuse corner, triArea/4 to the other two.
      area[i0] += obtuseAtA ? triArea / 2 : triArea / 4
      area[i1] += obtuseAtB ? triArea / 2 : triArea / 4
      area[i2] += obtuseAtC ? triArea / 2 : triArea / 4
    }

    // Track edges for boundary detection.
    bumpEdge(i0, i1); bumpEdge(i1, i2); bumpEdge(i2, i0)
  }

  // Mark boundary vertices: any vertex touching an edge used by exactly one triangle.
  for (const [k, count] of edgeUse) {
    if (count === 1) {
      const a = Math.floor(k / V), b = k % V
      boundary[a] = 1; boundary[b] = 1
    }
  }

  // Finalise per-vertex curvature.
  let min = Infinity, max = -Infinity, interiorCount = 0
  for (let i = 0; i < V; i++) {
    if (boundary[i]) continue // leave mean/gaussian at 0 on boundary; not part of interior trend
    const A = area[i]
    if (A <= 1e-30) continue // isolated / degenerate one-ring → skip (stays 0)

    // Gaussian via Gauss–Bonnet angle deficit.
    const K = (2 * Math.PI - angleSum[i]) / A
    gaussian[i] = K

    // Mean via cotangent Laplace–Beltrami: Δx = lap/(2A), H = ½|Δx| = |lap| / (4A).
    const H = Math.hypot(lapX[i], lapY[i], lapZ[i]) / (4 * A)
    mean[i] = H

    if (K < min) min = K
    if (K > max) max = K
    interiorCount++
  }
  if (interiorCount === 0) { min = 0; max = 0 }

  return { mean, gaussian, area, boundary, min, max, interiorCount }
}

// S180：最小曲率半径（Fusion Inspect › Minimum Radius）。
// 主曲率 κ1,κ2 = H ± √(H²−K)；最大 |主曲率| = |H| + √(max(0,H²−K))（mean 已系 |H|，符号唔影响 R=1/|κ|）。
// R_min = 1 / max_i |κ_max|，喺【最弯】嗰个内部顶点。返回 R_min + κ_max + 该顶点 index/世界坐标；
// 无内部顶点 / 全平（κ_max≈0 → R=∞）→ null。粗网格曲率系趋势/近似（细化收敛，同 meshCurvature docstring）。
export function minRadiusOfCurvature(vertices: number[], triangles: number[]): { rMin: number; kappaMax: number; vertexIndex: number; at: [number, number, number] } | null {
  const cur = meshCurvature(vertices, triangles)
  if (cur.interiorCount === 0) return null
  // S180 audit：拒退化 sliver/pinch 顶点（mixed area 极小 → cotangent 曲率估计爆大、出假最小半径）。
  // 用内部顶点 mixed area 均值定地板（< 1e-3×均值 = 网格瑕疵）；保留真实尖锐圆角（正常面积）。
  let aSum = 0, aN = 0
  for (let i = 0; i < cur.area.length; i++) if (!cur.boundary[i]) { aSum += cur.area[i]; aN++ }
  const aFloor = aN > 0 ? (aSum / aN) * 1e-3 : 0
  let best = 0, bi = -1
  for (let i = 0; i < cur.mean.length; i++) {
    if (cur.boundary[i] || cur.area[i] < aFloor) continue   // 跳边界 + 退化小面积顶点
    const H = cur.mean[i], K = cur.gaussian[i]
    const kMax = Math.abs(H) + Math.sqrt(Math.max(0, H * H - K))   // 最大 |主曲率|
    if (kMax > best) { best = kMax; bi = i }
  }
  if (bi < 0 || best <= 1e-9) return null   // 全平 / 无有效弯曲 → 无最小半径
  return { rMin: 1 / best, kappaMax: best, vertexIndex: bi, at: [vertices[bi * 3], vertices[bi * 3 + 1], vertices[bi * 3 + 2]] }
}

// #174-3 主曲率派生（Fusion Inspect › Curvature › Max/Min Principal）。
// 由 meshCurvature 已算嘅平均曲率 |H| 同高斯曲率 K，派生【逐顶点】两个主曲率：
//   κ_max = |H| + √(max(0, H²−K))   （最弯方向嘅曲率强度，恒 ≥ 0）
//   κ_min = |H| − √(max(0, H²−K))   （另一主方向；鞍点 K<0 → √>|H| → κ_min<0，正确捕捉反向弯）
// 诚实边界：meshCurvature 嘅 mean 系【|H| 无符号】(cotangent Laplacian 只畀模)，所以呢度 H 取 |H|。
//   → κ_max 系「最大 |主曲率|」量级（同 minRadiusOfCurvature 一致），κ_min 保留鞍点符号。
//   凸/凹嘅【整体正负】需参考法向（本算子唔畀）—— 呢个系逐顶点趋势/近似，网格细化收敛。
// 边界顶点 = 0（同 meshCurvature 契约）。min/max 系【内部顶点】上 κ_min / κ_max 嘅极值（畀 overlay 色阶用）。
export type PrincipalHK = {
  kmax: Float64Array   // κ_max 每顶点（≥0），边界=0
  kmin: Float64Array   // κ_min 每顶点（可负=鞍），边界=0
  boundary: Uint8Array
  kmaxMax: number      // 内部顶点 κ_max 最大值（色阶上界）
  kminMin: number      // 内部顶点 κ_min 最小值（色阶下界，通常≤0）
  kminMax: number      // 内部顶点 κ_min 最大值
  interiorCount: number
}

// 单顶点闭式：由 (|H|, K) → (κ_max, κ_min)。抽出嚟方便单元测试（零网格依赖）。
export function principalFromHK(absH: number, K: number): { kmax: number; kmin: number } {
  const root = Math.sqrt(Math.max(0, absH * absH - K))
  return { kmax: absH + root, kmin: absH - root }
}

export function principalCurvaturesHK(vertices: number[], triangles: number[]): PrincipalHK {
  const cur = meshCurvature(vertices, triangles)
  const V = cur.mean.length
  const kmax = new Float64Array(V)
  const kmin = new Float64Array(V)
  let kmaxMax = -Infinity, kminMin = Infinity, kminMax = -Infinity, interiorCount = 0
  for (let i = 0; i < V; i++) {
    if (cur.boundary[i]) continue
    const { kmax: kx, kmin: kn } = principalFromHK(cur.mean[i], cur.gaussian[i])
    kmax[i] = kx; kmin[i] = kn
    if (kx > kmaxMax) kmaxMax = kx
    if (kn < kminMin) kminMin = kn
    if (kn > kminMax) kminMax = kn
    interiorCount++
  }
  if (interiorCount === 0) { kmaxMax = 0; kminMin = 0; kminMax = 0 }
  return { kmax, kmin, boundary: cur.boundary, kmaxMax, kminMin, kminMax, interiorCount }
}

// Helper: accumulate one face's cotangent-Laplacian contribution for edge (p,q) with weight w=cot(opposite angle).
// lap[p] += w·(x_p − x_q);  lap[q] += w·(x_q − x_p). Symmetric so summing over the edge's two faces builds
// (cotα+cotβ)·(x_p − x_q). Kept as a tiny named helper so the three per-face calls read cleanly above.
function addEdgeLap(
  lapX: Float64Array, lapY: Float64Array, lapZ: Float64Array,
  p: number, q: number, w: number,
  px: number, py: number, pz: number,
  qx: number, qy: number, qz: number,
): void {
  const dx = px - qx, dy = py - qy, dz = pz - qz
  lapX[p] += w * dx; lapY[p] += w * dy; lapZ[p] += w * dz
  lapX[q] -= w * dx; lapY[q] -= w * dy; lapZ[q] -= w * dz
}
