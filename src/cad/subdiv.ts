// subdiv.ts — Catmull-Clark 细分纯数学模块（Form-lite 细分建模嘅数学底座）
// 净系做数：盒 quad 控制笼、CC 细分、quad→tri 三角化 + 顶点法线。
// 零依赖（无 three / 无 store / 无 worker），node tsx 直接跑得 → tests/subdiv.test.mjs 全套验证。
//
// 约定：
//   QuadMesh 要求【闭合 2-流形】quad 网格 — 每条边恰好 2 个 quad、无边界；
//   绕向统一向外（从外面睇逆时针 CCW → 散度定理体积为正）。
//   CC 标准规则（Catmull & Clark 1978）：
//     face point   = 面四顶点平均
//     edge point   = (两端点 + 两邻面点) / 4
//     vertex point = (Q + 2R + (n−3)P) / n — Q=邻面点平均、R=邻边【中点】平均、n=价数
//   levels ≥1 逐层做，每层 quad 数 ×4；细分后依然闭合流形、绕向不变。

export type QuadMesh = {
  verts: [number, number, number][]
  quads: [number, number, number, number][]
}

/**
 * 建立真正的 FORM Pipe 控制籠，而不是把 SOLID sweep 偽裝成 FORM。
 *
 * 路徑的每一點都是一個可編輯的環；相鄰環以 quad 相連，兩端保持開口，
 * 因此 Catmull-Clark 可保留 T-spline 式可塑的邊界。截面暫時是圓形，
 * 由 radialSegments 控制每環的面數；建立後使用者可直接拖控制點或插環。
 */
export function makeFormPipeCage(path: [number, number, number][], radius: number, radialSegments = 8): QuadMesh {
  if (!Array.isArray(path) || path.length < 2) throw new Error('makeFormPipeCage: path needs at least two points')
  if (!(Number.isFinite(radius) && radius > 0)) throw new Error('makeFormPipeCage: radius must be positive')
  if (!Number.isInteger(radialSegments) || radialSegments < 3) throw new Error('makeFormPipeCage: radialSegments must be at least 3')
  const pts = path.map((p) => {
    if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) throw new Error('makeFormPipeCage: invalid path point')
    return [p[0], p[1], p[2]] as [number, number, number]
  })
  const sub = (a: number[], b: number[]): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const cross = (a: number[], b: number[]): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  const norm = (v: number[]): [number, number, number] | null => { const n = Math.hypot(v[0], v[1], v[2]); return n > 1e-8 ? [v[0] / n, v[1] / n, v[2] / n] : null }
  const tangents: [number, number, number][] = []
  for (let i = 0; i < pts.length; i++) {
    const raw = i === 0 ? sub(pts[1], pts[0]) : i === pts.length - 1 ? sub(pts[i], pts[i - 1]) : sub(pts[i + 1], pts[i - 1])
    const t = norm(raw)
    if (!t) throw new Error('makeFormPipeCage: consecutive path points must be distinct')
    tangents.push(t)
  }
  const normals: [number, number, number][] = []
  for (let i = 0; i < pts.length; i++) {
    const t = tangents[i]
    let n: [number, number, number] | null
    if (i === 0) {
      const ref = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]
      n = norm(cross(ref, t))
    } else {
      // Parallel-transport-like projection prevents sudden 180-degree ring flips at bends.
      const prev = normals[i - 1], d = dot(prev, t)
      n = norm([prev[0] - d * t[0], prev[1] - d * t[1], prev[2] - d * t[2]])
      if (!n) { const ref = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]; n = norm(cross(ref, t)) }
    }
    if (!n) throw new Error('makeFormPipeCage: unable to construct section frame')
    normals.push(n)
  }
  const verts: [number, number, number][] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], n = normals[i], b = cross(tangents[i], n)
    for (let j = 0; j < radialSegments; j++) {
      const a = (j * Math.PI * 2) / radialSegments, c = Math.cos(a), s = Math.sin(a)
      verts.push([p[0] + radius * (n[0] * c + b[0] * s), p[1] + radius * (n[1] * c + b[1] * s), p[2] + radius * (n[2] * c + b[2] * s)])
    }
  }
  const quads: [number, number, number, number][] = []
  for (let i = 0; i + 1 < pts.length; i++) for (let j = 0; j < radialSegments; j++) {
    const a = i * radialSegments + j, b = i * radialSegments + (j + 1) % radialSegments
    const c = (i + 1) * radialSegments + (j + 1) % radialSegments, d = (i + 1) * radialSegments + j
    quads.push([a, b, c, d])
  }
  return { verts, quads }
}

// ── 盒控制笼 ──────────────────────────────────────────────────────────────

/** 盒表面 quad 控制笼：XY 居中、z∈[0,H] 落地；6 面各自网格化（每轴分段数 ≥1）。
 *  顶点焊接用【整数格点索引 (i,j,k)】做 key 去重（唔用浮点 key — 避免 -0 / 舍入唔稳定），
 *  棱/角顶点全部共享 → 闭合 2-流形（每条边恰好 2 个 quad），quad 绕向统一向外。 */
export function makeBoxCage(L: number, W: number, H: number, nx: number, ny: number, nz: number): QuadMesh {
  if (!(L > 0 && W > 0 && H > 0)) throw new Error('makeBoxCage: 尺寸要 > 0')
  if (!Number.isInteger(nx) || !Number.isInteger(ny) || !Number.isInteger(nz) || nx < 1 || ny < 1 || nz < 1) {
    throw new Error('makeBoxCage: 分段数要系 ≥1 嘅整数')
  }
  const verts: [number, number, number][] = []
  const quads: [number, number, number, number][] = []
  const idx = new Map<number, number>()             // 格点 key → 顶点 index
  const dx = L / nx, dy = W / ny, dz = H / nz
  const x0 = -L / 2, y0 = -W / 2
  // 格点 (i,j,k) ∈ [0,nx]×[0,ny]×[0,nz] 编成单一整数 key — 纯整数运算，零碰撞
  const vid = (i: number, j: number, k: number): number => {
    const key = (i * (ny + 1) + j) * (nz + 1) + k
    let v = idx.get(key)
    if (v === undefined) {
      v = verts.length
      idx.set(key, v)
      verts.push([x0 + i * dx, y0 + j * dy, k * dz])
    }
    return v
  }
  // 6 面逐格出 quad — 每面绕向校准到法线向外（从外面睇 CCW）。
  // 验绕向：v0→v1 叉 v1→v2 要指向面外（底面 −Z、顶面 +Z，如此类推）。
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      quads.push([vid(i, j, 0), vid(i, j + 1, 0), vid(i + 1, j + 1, 0), vid(i + 1, j, 0)])      // 底 z=0 → −Z
      quads.push([vid(i, j, nz), vid(i + 1, j, nz), vid(i + 1, j + 1, nz), vid(i, j + 1, nz)])  // 顶 z=H → +Z
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let k = 0; k < nz; k++) {
      quads.push([vid(0, j, k), vid(0, j, k + 1), vid(0, j + 1, k + 1), vid(0, j + 1, k)])       // x=−L/2 → −X
      quads.push([vid(nx, j, k), vid(nx, j + 1, k), vid(nx, j + 1, k + 1), vid(nx, j, k + 1)])   // x=+L/2 → +X
    }
  }
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      quads.push([vid(i, 0, k), vid(i + 1, 0, k), vid(i + 1, 0, k + 1), vid(i, 0, k + 1)])       // y=−W/2 → −Y
      quads.push([vid(i, ny, k), vid(i, ny, k + 1), vid(i + 1, ny, k + 1), vid(i + 1, ny, k)])   // y=+W/2 → +Y
    }
  }
  return { verts, quads }
}

/** S181：圆柱控制笼 —— 由盒笼【椭圆 squircle 映射】成圆柱（box→disc），**无极点、全 quad、闭合 2-流形**。
 *  做法：起 makeBoxCage(2R×2R×H, nSeg×nSeg×nH)，再把每个顶点 (x,y) 经方→圆映射推到圆（边界落圆周、顶/底面 grid 变圆饼盖）。
 *  关键：唔用中心极点（三角扇=非 quad + 高价数锥尖瑕疵）—— 盒拓扑天然全 quad / 价数低 / 闭合，映射只移顶点唔改拓扑/绕向 → 仍 signed-vol>0。
 *  @param nSeg 饼盖每边格数（亦 = 每象限壁段数），默认 2；@param nH 高度分段，默认 1。 */
export function makeCylinderCage(R: number, H: number, nSeg = 2, nH = 1): QuadMesh {
  if (!(R > 0 && H > 0)) throw new Error('makeCylinderCage: 尺寸要 > 0')
  if (!Number.isInteger(nSeg) || !Number.isInteger(nH) || nSeg < 1 || nH < 1) throw new Error('makeCylinderCage: 分段数要 ≥1 整数')
  const box = makeBoxCage(2 * R, 2 * R, H, nSeg, nSeg, nH)
  // 方([-1,1]²)→圆 椭圆映射（FG-squircle）：边界映去单位圆、内部双射、无翻转。z 不变。
  const verts = box.verts.map(([x, y, z]) => {
    const u = Math.max(-1, Math.min(1, x / R)), v = Math.max(-1, Math.min(1, y / R))
    return [R * u * Math.sqrt(Math.max(0, 1 - (v * v) / 2)), R * v * Math.sqrt(Math.max(0, 1 - (u * u) / 2)), z] as [number, number, number]
  })
  return { verts, quads: box.quads }
}

/** S181：平面/薄片控制笼 —— Fusion Form 嘅 Plane primitive。真·零厚薄片喺呢度做唔到（ccSubdivide 硬要闭合流形、开边界即抛 subdiv.ts:270），
 *  故出一块【薄闭合 slab】（默认 thick 1mm）= makeBoxCage 嘅薄盒，语义上等于平面笼。 */
export function makePlaneCage(L: number, W: number, nx = 2, ny = 2, thick = 1): QuadMesh {
  return makeBoxCage(L, W, Math.max(1e-3, thick), nx, ny, 1)
}

/** S192：开放曲面片控制笼 —— Fusion Form 开放面 / T-spline patch（车身板 / 外壳 / 有机曲面主用例）。
 *  真·开放 grid（唔似 makePlaneCage 嘅薄闭合 slab）：nx×ny quad 网格、XY 居中、z=0、四周开边界。
 *  ccSubdivide（S192 起支持边界）会令边界跟立方 B-spline、4 角钉死 → 平滑开放曲面；烘焙成开放网格曲面
 *  （非水密实体 — 同 Fusion 开放 T-spline 出 surface 一致）。顶点拖捏 setFormVert 适用；push-pull/insertLoop
 *  需闭合流形故对开放片 no-op（诚实 v1 限制）。 */
export function makeOpenPatchCage(L: number, W: number, nx = 3, ny = 3): QuadMesh {
  if (!(L > 0 && W > 0)) throw new Error('makeOpenPatchCage: 尺寸要 > 0')
  if (!Number.isInteger(nx) || !Number.isInteger(ny) || nx < 1 || ny < 1) throw new Error('makeOpenPatchCage: 分段数要系 ≥1 整数')
  const verts: [number, number, number][] = []
  const quads: [number, number, number, number][] = []
  const dx = L / nx, dy = W / ny, x0 = -L / 2, y0 = -W / 2
  const vid = (i: number, j: number) => i * (ny + 1) + j
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) verts.push([x0 + i * dx, y0 + j * dy, 0])
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) quads.push([vid(i, j), vid(i + 1, j), vid(i + 1, j + 1), vid(i, j + 1)])
  return { verts, quads }
}

/** S182：球控制笼 —— Fusion Form Sphere primitive。**cube→sphere 映射**（盒面顶点推到球面，3D 类比 S181 squircle），
 *  无极点（唔似 lat-long 球有南北极奇点 + 三角扇）、全 quad（8 个 valence-3 角，其余 valence-4）、闭合 2-流形。
 *  用 Philip Nowell cube→sphere 公式 x'=u·√(1−v²/2−w²/2+v²w²/3)（u,v,w∈[−1,1] 为盒面归一坐标，循环换 y'/z'）。
 *  注：makeBoxCage z∈[0,2R] 唔居中 → 先 w=(z−R)/R 居中映射，再 +R 上移令球底落 z=0（与圆柱底落 z=0 一致）。
 *  只移顶点唔改盒拓扑/绕向 → signed-vol>0。CC 系逼近型，细分体积向内收（粗笼 undershoot 正常，nSeg≥3 较逼近）。 */
export function makeSphereCage(R: number, nSeg = 3): QuadMesh {
  if (!(R > 0)) throw new Error('makeSphereCage: 半径要 > 0')
  if (!Number.isInteger(nSeg) || nSeg < 1) throw new Error('makeSphereCage: 分段数要 ≥1 整数')
  const box = makeBoxCage(2 * R, 2 * R, 2 * R, nSeg, nSeg, nSeg)
  const cl = (t: number) => Math.max(-1, Math.min(1, t))
  const verts = box.verts.map(([x, y, z]) => {
    const u = cl(x / R), v = cl(y / R), w = cl((z - R) / R)   // z∈[0,2R] → 居中到 [−1,1]
    const u2 = u * u, v2 = v * v, w2 = w * w
    return [
      R * u * Math.sqrt(Math.max(0, 1 - v2 / 2 - w2 / 2 + (v2 * w2) / 3)),
      R * v * Math.sqrt(Math.max(0, 1 - w2 / 2 - u2 / 2 + (w2 * u2) / 3)),
      R * w * Math.sqrt(Math.max(0, 1 - u2 / 2 - v2 / 2 + (u2 * v2) / 3)) + R,   // +R：球底落 z=0
    ] as [number, number, number]
  })
  return { verts, quads: box.quads }
}

/** S182：环面（甜甜圈）控制笼 —— Fusion Form Torus primitive。**genus-1 唔可由盒笼映射**（盒系 genus-0 球面，
 *  映射去环面会折叠自交）—— 故直接砌【双向周期 quad 网格】：主角 θ 绕大圈、次角 φ 绕管，两向都 wrap（尾接首）。
 *  点 = ((R+r·cosφ)·cosθ, (R+r·cosφ)·sinθ, r + r·sinφ)（+r 令管底落 z=0）。每顶点 valence-4、每边恰 2 quad
 *  ⇒ 闭合 2-流形、全 quad、Euler V−E+F=0（genus 1）。绕向 [v(i,j),v(i+1,j),v(i+1,j+1),v(i,j+1)] = θ×φ 外法向。 */
export function makeTorusCage(R: number, r: number, nMaj = 12, nMin = 8): QuadMesh {
  if (!(R > 0 && r > 0)) throw new Error('makeTorusCage: 半径要 > 0')
  if (!(R > r)) throw new Error('makeTorusCage: 主半径要 > 管半径（否则自交）')
  if (!Number.isInteger(nMaj) || !Number.isInteger(nMin) || nMaj < 3 || nMin < 3) throw new Error('makeTorusCage: 分段数要 ≥3 整数')
  const verts: [number, number, number][] = []
  for (let i = 0; i < nMaj; i++) {
    const th = (2 * Math.PI * i) / nMaj, ct = Math.cos(th), st = Math.sin(th)
    for (let j = 0; j < nMin; j++) {
      const ph = (2 * Math.PI * j) / nMin, rr = R + r * Math.cos(ph)
      verts.push([rr * ct, rr * st, r + r * Math.sin(ph)])
    }
  }
  const vid = (i: number, j: number) => ((i % nMaj) * nMin) + (j % nMin)   // 双向 wrap
  const quads: [number, number, number, number][] = []
  for (let i = 0; i < nMaj; i++) for (let j = 0; j < nMin; j++) {
    quads.push([vid(i, j), vid(i + 1, j), vid(i + 1, j + 1), vid(i, j + 1)])
  }
  return { verts, quads }
}

// ── 面拉伸 / push-pull（Form 最核心操作）──────────────────────────────────

/** S165：拉伸（push-pull）一个 quad 控制面 — Fusion Form 最核心操作（从盒拉出肢/凸台/孔）。
 *  唔郁原顶点（佢哋同邻面共享，一郁会拖歪邻面）；新增 4 个沿【面外向法向】偏移 dist 嘅顶点做「帽」，
 *  原面位置换成帽面，再加 4 道侧壁 quad 桥接旧边→帽边。结果保持【闭合 2-流形】（每条边恰好 2 面）→
 *  可继续 ccSubdivide。dist>0 外推、<0 内压（凹陷/孔）。faceIdx 越界 / 退化面 / dist≈0 → 返 null（调用方诚实 no-op）。
 *  帽面仍占原 faceIdx 槽 → 连续多次拉伸同一选面可叠加（抽长肢）。 */
export function extrudeQuadFace(m: QuadMesh, faceIdx: number, dist: number): QuadMesh | null {
  if (!Number.isInteger(faceIdx) || faceIdx < 0 || faceIdx >= m.quads.length || !Number.isFinite(dist) || Math.abs(dist) < 1e-9) return null
  const [a, b, c, d] = m.quads[faceIdx]
  const A = m.verts[a], B = m.verts[b], C = m.verts[c], D = m.verts[d]
  // 外向法向 = (C−A)×(D−B)（cage quad CCW-from-outside 约定 → 指向外）
  const ux = C[0] - A[0], uy = C[1] - A[1], uz = C[2] - A[2]
  const vx = D[0] - B[0], vy = D[1] - B[1], vz = D[2] - B[2]
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  const nl = Math.hypot(nx, ny, nz)
  if (nl < 1e-12) return null                  // 退化（零面积）面 — 冇明确法向
  nx /= nl; ny /= nl; nz /= nl
  const off = (p: [number, number, number]): [number, number, number] => [p[0] + nx * dist, p[1] + ny * dist, p[2] + nz * dist]
  const verts = m.verts.slice()
  const nV = verts.length
  verts.push(off(A), off(B), off(C), off(D))   // 帽顶点 a'=nV … d'=nV+3
  const ap = nV, bp = nV + 1, cp = nV + 2, dp = nV + 3
  const quads: [number, number, number, number][] = m.quads.map((q, i) => (i === faceIdx ? [ap, bp, cp, dp] : q))
  // 侧壁：每条旧边 (i→j) → [i, j, j', i']（同帽/原面同绕向 → 外向）
  quads.push([a, b, bp, ap], [b, c, cp, bp], [c, d, dp, cp], [d, a, ap, dp])
  // 带符号体积守卫（S165 audit）：内压过深 → 帽穿过对壁 → 翻转自交。边流形不变（ccSubdivide 唔会 throw），
  // 但带符号体积会 ≤0 → 烘焙出反向实体。检测：结果带符号体积非正 → 返 null（调用方保原 cage + 诚实提示）。
  let sv = 0
  for (const q of quads) {
    const A2 = verts[q[0]], B2 = verts[q[1]], C2 = verts[q[2]], D2 = verts[q[3]]
    const tri = (p: number[], r: number[], s: number[]) => p[0] * (r[1] * s[2] - r[2] * s[1]) + p[1] * (r[2] * s[0] - r[0] * s[2]) + p[2] * (r[0] * s[1] - r[1] * s[0])
    sv += tri(A2, B2, C2) + tri(A2, C2, D2)
  }
  if (sv <= 1e-9) return null   // 翻转/塌陷（内压穿对壁）
  return { verts, quads }
}

// ── 镜像 / 对称（Form Mirror）────────────────────────────────────────────

/** S169：Form 控制笼镜像/对称（Fusion T-spline Mirror / Symmetry）。
 *  整个 cage 沿平面 coord[axis]=planeCoord 反射、同原 cage 焊接成【2× 对称】闭合笼。
 *  步骤：(1) 反射全部顶点 — 平面上顶点（|coord−planeCoord|<eps）共享（唔重复，免双壁）；
 *  (2) 镜像 quad 反绕向（反射系【定向反转】— [a,b,c,d]→[d,c,b,a]，否则法向朝内、烘焙出反体；
 *      ⚠ ccSubdivide 边流形检查【捉唔到】绕向反转，只有带符号体积捉到）；
 *  (3) 删去【四顶点全落平面】嘅 seam-cap quad（原 + 镜两份都删 — 佢哋会变内壁，留低令边超 2 面 / 双壁）；
 *  (4) prune 被删 cap 嘅孤立内部顶点（重建紧凑 verts + 重映射 quad）；
 *  (5) 边-流形校验（每条无向边恰 2 个 quad，同 ccSubdivide 入口守卫一致）+ 带符号体积 > 0。
 *  axis 0/1/2 = x/y/z。平面应取 cage 一个【面边界】（例盒 z=0 底面）→ 干净 2× 体；
 *  若平面切穿实体（非面边界）镜像会几何自交（同 Fusion 一样要拣合理对称面）—— 诚实 v1 限制（边流形仍过，靠用户拣对面）。
 *  退化 / 非流形（边≠2 面）/ 体积≤0 → 返 null（调用方保原 cage + 诚实提示）。 */
export function mirrorQuadCage(m: QuadMesh, axis: 0 | 1 | 2, planeCoord = 0): QuadMesh | null {
  if (!m || !m.verts || !m.quads || !m.verts.length || !m.quads.length) return null
  if (axis !== 0 && axis !== 1 && axis !== 2) return null
  if (!Number.isFinite(planeCoord)) return null
  const eps = 1e-6
  const onPlane = (p: [number, number, number]) => Math.abs(p[axis] - planeCoord) < eps
  const nOrig = m.verts.length
  // 反射顶点 + 焊接：平面上原顶点映射返自己（共享）；其余反射后去重 push（量化 key）
  const verts: [number, number, number][] = m.verts.map((p) => [p[0], p[1], p[2]])
  const mir = new Array<number>(nOrig)
  const q6 = (v: number) => Math.round(v / eps)
  const key = (p: [number, number, number]) => q6(p[0]) + ',' + q6(p[1]) + ',' + q6(p[2])
  const pool = new Map<string, number>()
  for (let i = 0; i < nOrig; i++) if (onPlane(m.verts[i])) pool.set(key(m.verts[i]), i)
  for (let i = 0; i < nOrig; i++) {
    const p = m.verts[i]
    const r: [number, number, number] = [p[0], p[1], p[2]]
    r[axis] = 2 * planeCoord - p[axis]
    const k = key(r)
    let vi = pool.get(k)
    if (vi === undefined) { vi = verts.length; verts.push(r); pool.set(k, vi) }
    mir[i] = vi
  }
  const isSeam = (q: [number, number, number, number]) => onPlane(m.verts[q[0]]) && onPlane(m.verts[q[1]]) && onPlane(m.verts[q[2]]) && onPlane(m.verts[q[3]])
  const quads: [number, number, number, number][] = []
  for (const q of m.quads) if (!isSeam(q)) quads.push([q[0], q[1], q[2], q[3]])                    // 原（非 seam）
  for (const q of m.quads) if (!isSeam(q)) quads.push([mir[q[3]], mir[q[2]], mir[q[1]], mir[q[0]]])  // 镜像（反绕向）
  if (!quads.length) return null
  // prune 孤立顶点（被删 seam-cap 嘅内部点）→ 紧凑 verts + 重映射
  const used = new Set<number>()
  for (const q of quads) { used.add(q[0]); used.add(q[1]); used.add(q[2]); used.add(q[3]) }
  const remap = new Map<number, number>()
  const verts2: [number, number, number][] = []
  for (let i = 0; i < verts.length; i++) if (used.has(i)) { remap.set(i, verts2.length); verts2.push(verts[i]) }
  const quads2: [number, number, number, number][] = quads.map((q) => [remap.get(q[0])!, remap.get(q[1])!, remap.get(q[2])!, remap.get(q[3])!] as [number, number, number, number])
  // 边-流形校验：每条无向边恰 2 个 quad
  const ec = new Map<string, number>()
  for (const q of quads2) { const vs = q; for (let e = 0; e < 4; e++) { const a = vs[e], b = vs[(e + 1) % 4]; const ek = a < b ? a + '_' + b : b + '_' + a; ec.set(ek, (ec.get(ek) || 0) + 1) } }
  for (const c of ec.values()) if (c !== 2) return null
  // S169 audit（MED）：顶点【单扇】校验 —— 边流形守卫【捉唔到】顶点夹点（vertex pinch）：
  //   若镜像平面只触及单个顶点（例拖低一个底面角点再沿该轴镜），该共享顶点会接两片【唔相连】嘅面扇 →
  //   每边仍恰 2 面（边检查过）、带符号体积 > 0（体积检查过），但顶点处两半只喺一点相黐 = 非流形（烘焙出坏实体）。
  //   守卫：每个顶点嘅入射 quad 必须经【过该顶点嘅边】连成【单一扇】（并查集），否则返 null（同 honest-null 哲学）。
  const inc = new Map<number, number[]>()
  for (let qi = 0; qi < quads2.length; qi++) for (const v of quads2[qi]) { const arr = inc.get(v); if (arr) arr.push(qi); else inc.set(v, [qi]) }
  for (const [v, qis] of inc) {
    if (qis.length <= 1) continue
    const par = new Map<number, number>(); for (const q of qis) par.set(q, q)
    const find = (x: number): number => { let r = x; while (par.get(r) !== r) r = par.get(r)!; return r }
    const edgeOwner = new Map<string, number>()
    for (const qi of qis) {
      const q = quads2[qi], k = q.indexOf(v)
      for (const w of [q[(k + 3) % 4], q[(k + 1) % 4]]) {   // 过 v 嘅两条边
        const ek = v < w ? v + '_' + w : w + '_' + v
        const o = edgeOwner.get(ek)
        if (o !== undefined) par.set(find(qi), find(o)); else edgeOwner.set(ek, qi)
      }
    }
    const roots = new Set<number>(); for (const qi of qis) roots.add(find(qi))
    if (roots.size > 1) return null   // 顶点夹点（多扇）→ 非流形
  }
  // 带符号体积守卫（应 ≈ 2× 原体积，且 > 0）
  let sv = 0
  const tri = (p: number[], r: number[], s: number[]) => p[0] * (r[1] * s[2] - r[2] * s[1]) + p[1] * (r[2] * s[0] - r[0] * s[2]) + p[2] * (r[0] * s[1] - r[1] * s[0])
  for (const q of quads2) { const A = verts2[q[0]], B = verts2[q[1]], C = verts2[q[2]], D = verts2[q[3]]; sv += tri(A, B, C) + tri(A, C, D) }
  if (!(sv > 1e-9)) return null
  return { verts: verts2, quads: quads2 }
}

/** S193：Form 镜像笼【对称编辑】—— 移动一个顶点时自动对称移动其镜像伙伴（Fusion T-spline Symmetry 编辑）。
 *  用于已由 mirrorQuadCage 造出嘅对称笼（知对称轴 axis + 平面坐标 planeCoord）。把顶点 i 移到 p，沿 axis
 *  喺 planeCoord 反射搵镜像顶点（量化 key 配对），将其也移到 p 嘅镜像位 → 两点同步、对称性保持。
 *  顶点本身落对称平面上（垂直分量≈planeCoord）→ 只移自己（无镜像伙伴）。镜像顶点搵唔到 / 移后非流形 /
 *  体积≤0 → 返 null（调用方保原笼 + 诚实 no-op，同 mirrorQuadCage/extrudeQuadFace 哲学一致）。 */
export function setSymmetricFormVert(m: QuadMesh, i: number, p: [number, number, number], axis: 0 | 1 | 2, planeCoord: number): QuadMesh | null {
  if (!m || !m.verts || !Number.isInteger(i) || i < 0 || i >= m.verts.length) return null
  if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) return null
  if ((axis !== 0 && axis !== 1 && axis !== 2) || !Number.isFinite(planeCoord)) return null
  const eps = 1e-6
  const onPlane = (v: [number, number, number]) => Math.abs(v[axis] - planeCoord) < eps
  // 顶点落对称平面上 → 只移自己（无独立镜像伙伴），但移后仍要 keep 喺平面（唔好破对称）→ 锁定 axis 分量
  if (onPlane(m.verts[i])) {
    const verts = m.verts.map((v) => [v[0], v[1], v[2]] as [number, number, number])
    const np: [number, number, number] = [p[0], p[1], p[2]]
    np[axis] = planeCoord   // 锁喺对称平面
    verts[i] = np
    const out: QuadMesh = { verts, quads: m.quads }
    return (quadManifold(out) && quadSignedVol(out) > 1e-9) ? out : null
  }
  // 反射位 + 量化 key 搵镜像伙伴
  const mir: [number, number, number] = [p[0], p[1], p[2]]
  mir[axis] = 2 * planeCoord - p[axis]
  const q6 = (v: number) => Math.round(v / eps)
  const origMir: [number, number, number] = [m.verts[i][0], m.verts[i][1], m.verts[i][2]]
  origMir[axis] = 2 * planeCoord - m.verts[i][axis]
  const mirKey = q6(origMir[0]) + ',' + q6(origMir[1]) + ',' + q6(origMir[2])
  let mirIdx = -1
  for (let j = 0; j < m.verts.length; j++) {
    if (j === i) continue
    const vj = m.verts[j]
    if (q6(vj[0]) + ',' + q6(vj[1]) + ',' + q6(vj[2]) === mirKey) { mirIdx = j; break }
  }
  if (mirIdx < 0) return null   // 镜像顶点唔存在 → 非对称笼 / 边界
  const verts = m.verts.map((v) => [v[0], v[1], v[2]] as [number, number, number])
  verts[i] = [p[0], p[1], p[2]]
  verts[mirIdx] = mir
  const out: QuadMesh = { verts, quads: m.quads }
  return (quadManifold(out) && quadSignedVol(out) > 1e-9) ? out : null
}

// ── Catmull-Clark 细分 ────────────────────────────────────────────────────

/** Catmull-Clark 细分，levels ≥1 逐层做。支持【闭合流形】同【开放/边界】quad mesh（S192）：
 *  边界边（净 1 面 — Fusion Form 开放面/车身板主用例）当【无限锐边界折痕】处理 —— 边界 edge-point = 中点、
 *  边界顶点 = 立方 B-spline 边界规则、patch 角点（边界顶点 valence-2）钉死。3 面共边 = 非流形仍 throw。
 *  闭合无折痕输入逐字节同旧实现一致（回归门保住）。 */
export function ccSubdivide(m: QuadMesh, levels: number, creases?: [number, number][], creaseW?: number[]): QuadMesh {
  if (!Number.isInteger(levels) || levels < 1) throw new Error('ccSubdivide: levels 要系 ≥1 嘅整数')
  let cur = m
  // S172/S 折痕：二元无限锐（旧）或【分数 sharpness】w∈(0,1]（creaseW 平行 creases；缺省 w=1=无限锐，
  // 逐字节同旧二元一致 → 回归门保住）。转成 edge-key → 权重 Map（key = lo·nV + hi，同 edge map 编码）。
  // 空 / 无效 → wmap=null → 纯平滑 ccOnce（逐字节同旧实现一致）。
  let wmap: Map<number, number> | null = null
  if (creases && creases.length) {
    const mm = new Map<number, number>()
    const nV0 = m.verts.length
    for (let i = 0; i < creases.length; i++) {
      const a = creases[i][0], b = creases[i][1]
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= nV0 || b >= nV0 || a === b) continue
      const w = creaseW && Number.isFinite(creaseW[i]) ? Math.max(0, Math.min(1, creaseW[i])) : 1
      if (w <= 0) continue   // 权重 0 = 唔系折痕（落平滑）
      const lo = a < b ? a : b, hi = a < b ? b : a
      mm.set(lo * nV0 + hi, w)
    }
    if (mm.size) wmap = mm
  }
  for (let l = 0; l < levels; l++) {
    if (wmap) { const r = ccStep(cur, wmap); cur = r.mesh; wmap = r.childCreases }
    else cur = ccOnce(cur)
  }
  return cur
}

const EMPTY_CREASE: Map<number, number> = new Map()
/** 一层 CC（旧签名 / 纯平滑入口）：空折痕集 → ccStep 全部走平滑分支，输出同纯 CC 逐字节一致。 */
function ccOnce(m: QuadMesh): QuadMesh { return ccStep(m, EMPTY_CREASE).mesh }

/** 一层 CC + 二元无限锐折痕（infinitely-sharp crease，OpenSubdiv 同款二元版；唔做分数 sharpness，已知限制）。
 *  新顶点排布：[0,nV) 旧顶点移位后嘅 vertex point、[nV,nV+nF) face point、[nV+nF,nV+nF+nE) edge point。
 *  每个旧 quad 出 4 个子 quad，绕向同父面一致。creaseKeys = 当前 mesh 折痕边集（key = lo·nV + hi）。
 *  折痕规则改动（creaseKeys 为空 → 全部短路落平滑分支，逐字节同旧实现一致）：
 *    · 锐边 edge point = 两端中点（唔混邻面点 → 棱角企硬）
 *    · 顶点按【入射锐边数】分流：0/1 = 平滑 CC（dart 当平滑）；恰 2 = 折痕规则 V'=¾P+⅛(n₀+n₁)；≥3 = 角点钉死 V'=P
 *    · 子边继承锐利（无限锐 → 每层续锐）：锐边 a–b 裂成 a–ep、ep–b 两条子折痕
 *  返回子网格 + 传播落子网格嘅折痕集（多层细分逐层续锐用）。 */
function ccStep(m: QuadMesh, creaseW: Map<number, number>): { mesh: QuadMesh; childCreases: Map<number, number> } {
  const verts = m.verts, quads = m.quads
  const nV = verts.length, nF = quads.length
  const hasCrease = creaseW.size > 0

  // ── face point：面四顶点平均（flat Float64Array，慳分配） ──
  const fp = new Float64Array(nF * 3)
  for (let f = 0; f < nF; f++) {
    const q = quads[f]
    const a = verts[q[0]], b = verts[q[1]], c = verts[q[2]], d = verts[q[3]]
    fp[f * 3] = (a[0] + b[0] + c[0] + d[0]) / 4
    fp[f * 3 + 1] = (a[1] + b[1] + c[1] + d[1]) / 4
    fp[f * 3 + 2] = (a[2] + b[2] + c[2] + d[2]) / 4
  }

  // ── edge map：(min,max) 顶点对 → 邻面对。数字 key = lo·nV + hi（nV² ≪ 2^53，唔会爆精度）──
  const edgeIdx = new Map<number, number>()
  const eV0: number[] = [], eV1: number[] = []      // 边两端（lo,hi）
  const eF0: number[] = [], eF1: number[] = []      // 边两邻面（闭合流形 → 恰好 2 个）
  const sharpW: number[] = []                       // 每边锐利【权重】0..1（hasCrease 时按 creaseW 填，否则恒 0；1=无限锐=旧二元）
  const faceEdge = new Int32Array(nF * 4)           // 每个 quad 4 条边嘅 edge index
  for (let f = 0; f < nF; f++) {
    const q = quads[f]
    for (let s = 0; s < 4; s++) {
      const a = q[s], b = q[(s + 1) & 3]
      const lo = a < b ? a : b, hi = a < b ? b : a
      const key = lo * nV + hi
      let e = edgeIdx.get(key)
      if (e === undefined) {
        e = eV0.length
        edgeIdx.set(key, e)
        eV0.push(lo); eV1.push(hi); eF0.push(f); eF1.push(-1)
        sharpW.push(hasCrease ? (creaseW.get(key) ?? 0) : 0)
      } else {
        if (eF1[e] !== -1) throw new Error('细分要求闭合流形 quad 网格')   // 同一条边 ≥3 面 → 非流形
        eF1[e] = f
      }
      faceEdge[f * 4 + s] = e
    }
  }
  const nE = eV0.length
  // S192 开放/边界支持：边只属 1 面 = 边界边（Fusion Form 开放面/车身板主用例）→ 唔再 throw，
  // 当【无限锐边界折痕】处理（reuse 既有折痕机制：边界 edge-point=中点、边界顶点=B-spline、角点钉死）。
  let hasBoundary = false
  const boundaryVert = new Uint8Array(nV)
  for (let e = 0; e < nE; e++) {
    if (eF1[e] === -1) { hasBoundary = true; sharpW[e] = 1; boundaryVert[eV0[e]] = 1; boundaryVert[eV1[e]] = 1 }
  }
  const useSharp = hasCrease || hasBoundary

  // ── vertex point 累加器：R=邻边中点、Q=邻面点、n=价数（闭合流形 → 邻边数 = 邻面数）──
  //    折痕（hasCrease）同步统计每个顶点【入射锐边数】+ 头两个折痕邻点（多过 2 → 角点，唔使记多）。
  const val = new Int32Array(nV)
  const rSum = new Float64Array(nV * 3)
  const cCnt = useSharp ? new Int32Array(nV) : null
  const cN0 = useSharp ? new Int32Array(nV).fill(-1) : null
  const cN1 = useSharp ? new Int32Array(nV).fill(-1) : null
  for (let e = 0; e < nE; e++) {
    const a = eV0[e], b = eV1[e]
    const va = verts[a], vb = verts[b]
    const mx = (va[0] + vb[0]) / 2, my = (va[1] + vb[1]) / 2, mz = (va[2] + vb[2]) / 2
    rSum[a * 3] += mx; rSum[a * 3 + 1] += my; rSum[a * 3 + 2] += mz
    rSum[b * 3] += mx; rSum[b * 3 + 1] += my; rSum[b * 3 + 2] += mz
    val[a]++; val[b]++
    if (useSharp && sharpW[e] > 0.5) {   // 分数折痕：顶点规则按【权重过半】当锐边分类（边界=1 必入）
      if (cN0![a] < 0) cN0![a] = b; else if (cN1![a] < 0) cN1![a] = b
      cCnt![a]++
      if (cN0![b] < 0) cN0![b] = a; else if (cN1![b] < 0) cN1![b] = a
      cCnt![b]++
    }
  }
  const qSum = new Float64Array(nV * 3)
  for (let f = 0; f < nF; f++) {
    const q = quads[f]
    const fx = fp[f * 3], fy = fp[f * 3 + 1], fz = fp[f * 3 + 2]
    for (let s = 0; s < 4; s++) {
      const v = q[s]
      qSum[v * 3] += fx; qSum[v * 3 + 1] += fy; qSum[v * 3 + 2] += fz
    }
  }

  // ── 砌新顶点表 ──
  const outVerts: [number, number, number][] = new Array(nV + nF + nE)
  for (let v = 0; v < nV; v++) {
    const n = val[v]
    const p = verts[v]
    if (n === 0) { outVerts[v] = [p[0], p[1], p[2]]; continue }   // 孤立顶点照搬（无面无边，唔参与细分）
    // 角点：≥3 入射锐边，或 patch 角（边界顶点 valence-2 = 两条边界边相交于唔接内部边）→ 钉死唔郁
    if (useSharp && (cCnt![v] >= 3 || (boundaryVert[v] === 1 && cCnt![v] === 2 && val[v] === 2))) { outVerts[v] = [p[0], p[1], p[2]]; continue }
    if (useSharp && cCnt![v] === 2) {
      // 折痕顶点（恰 2 入射锐边）→ 立方 B-spline 折痕规则 V' = ¾P + ⅛(n₀+n₁)，n₀/n₁ = 两折痕邻点位置
      const pa = verts[cN0![v]], pb = verts[cN1![v]]
      outVerts[v] = [
        0.75 * p[0] + 0.125 * (pa[0] + pb[0]),
        0.75 * p[1] + 0.125 * (pa[1] + pb[1]),
        0.75 * p[2] + 0.125 * (pa[2] + pb[2]),
      ]
      continue
    }
    // 平滑 CC（0/1 入射锐边 = dart 当平滑）：V' = (Q + 2R + (n−3)P)/n，Q = qSum/n、R = rSum/n
    const inv = 1 / n
    outVerts[v] = [
      (qSum[v * 3] * inv + 2 * rSum[v * 3] * inv + (n - 3) * p[0]) * inv,
      (qSum[v * 3 + 1] * inv + 2 * rSum[v * 3 + 1] * inv + (n - 3) * p[1]) * inv,
      (qSum[v * 3 + 2] * inv + 2 * rSum[v * 3 + 2] * inv + (n - 3) * p[2]) * inv,
    ]
  }
  for (let f = 0; f < nF; f++) outVerts[nV + f] = [fp[f * 3], fp[f * 3 + 1], fp[f * 3 + 2]]
  for (let e = 0; e < nE; e++) {
    const va = verts[eV0[e]], vb = verts[eV1[e]]
    const w = useSharp ? sharpW[e] : 0
    if (w >= 1 || eF1[e] === -1) {
      // 全锐（w=1）/ 边界（无对面 fp）edge point = 两端中点（棱角企硬 / 边界跟 B-spline，唔被磨圆）
      outVerts[nV + nF + e] = [(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2]
    } else {
      // 平滑 edge point = (两端点 + 两邻面点) / 4；分数折痕（0<w<1）→ lerp(平滑, 锐中点, w)（w=0=纯平滑，逐字节同旧）
      const fa = eF0[e] * 3, fb = eF1[e] * 3
      const smx = (va[0] + vb[0] + fp[fa] + fp[fb]) / 4, smy = (va[1] + vb[1] + fp[fa + 1] + fp[fb + 1]) / 4, smz = (va[2] + vb[2] + fp[fa + 2] + fp[fb + 2]) / 4
      if (w <= 0) outVerts[nV + nF + e] = [smx, smy, smz]
      else outVerts[nV + nF + e] = [smx + ((va[0] + vb[0]) / 2 - smx) * w, smy + ((va[1] + vb[1]) / 2 - smy) * w, smz + ((va[2] + vb[2]) / 2 - smz) * w]
    }
  }

  // ── 每个旧 quad (a,b,c,d) → 4 个子 quad：[角点, 出边 edge point, face point, 入边 edge point]
  //    呢个排法同父面同绕向（平面情形逐个验过系 CCW）。 ──
  const outQuads: [number, number, number, number][] = new Array(nF * 4)
  const eBase = nV + nF
  for (let f = 0; f < nF; f++) {
    const q = quads[f]
    const fI = nV + f
    const e0 = eBase + faceEdge[f * 4]       // 边 a-b
    const e1 = eBase + faceEdge[f * 4 + 1]   // 边 b-c
    const e2 = eBase + faceEdge[f * 4 + 2]   // 边 c-d
    const e3 = eBase + faceEdge[f * 4 + 3]   // 边 d-a
    outQuads[f * 4] = [q[0], e0, fI, e3]
    outQuads[f * 4 + 1] = [q[1], e1, fI, e0]
    outQuads[f * 4 + 2] = [q[2], e2, fI, e1]
    outQuads[f * 4 + 3] = [q[3], e3, fI, e2]
  }

  // ── 子折痕传播：锐边 a-b 裂成 a-ep、ep-b（ep = nV+nF+e 全局 edge-point index）→ 两条子折痕。
  //    a,b < nV ≤ ep ⇒ lo=a/b、hi=ep；子层 edge-key 编码用子网格顶点数 nV2 = nV+nF+nE。 ──
  const childCreases = new Map<number, number>()
  if (hasCrease) {
    const nV2 = nV + nF + nE
    for (let e = 0; e < nE; e++) {
      if (sharpW[e] <= 0 || eF1[e] === -1) continue   // S192：边界边唔显式传播（子层自动重检测），只传 user 折痕；权重落子层（恒定分数 sharpness 每层一致）
      const a = eV0[e], b = eV1[e], ep = nV + nF + e
      childCreases.set(a * nV2 + ep, sharpW[e])
      childCreases.set(b * nV2 + ep, sharpW[e])
    }
  }
  return { mesh: { verts: outVerts, quads: outQuads }, childCreases }
}

// ── quad → tri 三角化 ─────────────────────────────────────────────────────

/** quad 网格 → 三角网格：每个 quad 沿【短对角线】切 2 个 tri（CC 之后 quad 未必平面，
 *  短对角线切先至贴服）。顶点法线 = 邻接三角面【面积加权】平均后归一 —
 *  cross 模长本身 = 2×三角面积，所以直接累加未归一 cross 就系面积加权。 */
export function quadsToTris(m: QuadMesh): { vertices: number[]; triangles: number[]; normals: number[] } {
  const verts = m.verts, quads = m.quads
  const nV = verts.length
  const vertices: number[] = new Array(nV * 3)
  for (let v = 0; v < nV; v++) {
    const p = verts[v]
    vertices[v * 3] = p[0]; vertices[v * 3 + 1] = p[1]; vertices[v * 3 + 2] = p[2]
  }
  const triangles: number[] = new Array(quads.length * 6)
  const acc = new Float64Array(nV * 3)     // 法线累加器（面积加权）
  let t = 0
  const addTri = (a: number, b: number, c: number): void => {
    triangles[t++] = a; triangles[t++] = b; triangles[t++] = c
    const a3 = a * 3, b3 = b * 3, c3 = c * 3
    const ux = vertices[b3] - vertices[a3], uy = vertices[b3 + 1] - vertices[a3 + 1], uz = vertices[b3 + 2] - vertices[a3 + 2]
    const vx = vertices[c3] - vertices[a3], vy = vertices[c3 + 1] - vertices[a3 + 1], vz = vertices[c3 + 2] - vertices[a3 + 2]
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx
    acc[a3] += cx; acc[a3 + 1] += cy; acc[a3 + 2] += cz
    acc[b3] += cx; acc[b3 + 1] += cy; acc[b3 + 2] += cz
    acc[c3] += cx; acc[c3 + 1] += cy; acc[c3 + 2] += cz
  }
  const d2 = (a: number, b: number): number => {
    const a3 = a * 3, b3 = b * 3
    const x = vertices[a3] - vertices[b3], y = vertices[a3 + 1] - vertices[b3 + 1], z = vertices[a3 + 2] - vertices[b3 + 2]
    return x * x + y * y + z * z
  }
  for (let f = 0; f < quads.length; f++) {
    const q = quads[f]
    const a = q[0], b = q[1], c = q[2], d = q[3]
    // 短对角线：|ac| ≤ |bd| → (a,b,c)+(a,c,d)；否则 (b,c,d)+(b,d,a)。两种切法都保持绕向。
    if (d2(a, c) <= d2(b, d)) { addTri(a, b, c); addTri(a, c, d) }
    else { addTri(b, c, d); addTri(b, d, a) }
  }
  const normals: number[] = new Array(nV * 3)
  for (let v = 0; v < nV; v++) {
    const x = acc[v * 3], y = acc[v * 3 + 1], z = acc[v * 3 + 2]
    const len = Math.hypot(x, y, z)
    if (len > 0) {
      normals[v * 3] = x / len; normals[v * 3 + 1] = y / len; normals[v * 3 + 2] = z / len
    } else {
      normals[v * 3] = 0; normals[v * 3 + 1] = 0; normals[v * 3 + 2] = 1   // 退化/孤立顶点兜底 — 都保证单位长
    }
  }
  return { vertices, triangles, normals }
}

// ── 插入边线环（Fusion Insert Edge Loop，S180）────────────────────────────

/** 闭合 2-流形检查（每条无向边恰 2 个 quad；自边/边界 → false）。 */
function quadManifold(m: QuadMesh): boolean {
  const nV = m.verts.length
  const cnt = new Map<number, number>()
  for (const q of m.quads) for (let s = 0; s < 4; s++) {
    const a = q[s], b = q[(s + 1) & 3]; if (a === b) return false
    const lo = a < b ? a : b, hi = a < b ? b : a
    const key = lo * nV + hi; cnt.set(key, (cnt.get(key) || 0) + 1)
  }
  for (const c of cnt.values()) if (c !== 2) return false
  return true
}

/** 有符号体积（quad 扇形三角 + 散度积分）；绕向向外 CCW → 正。 */
function quadSignedVol(m: QuadMesh): number {
  const v = m.verts; let vol = 0
  for (const q of m.quads) {
    const tri: [number, number, number][] = [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]
    for (const [a, b, c] of tri) {
      const A = v[a], B = v[b], C = v[c]
      vol += A[0] * (B[1] * C[2] - B[2] * C[1]) + A[1] * (B[2] * C[0] - B[0] * C[2]) + A[2] * (B[0] * C[1] - B[1] * C[0])
    }
  }
  return vol / 6
}

/** 喺 faceIdx 沿 edgeSlot 方向插入一圈边线环：环绕笼走一圈 quad，每个被穿过嘅 quad 由【两条对边中点连线】一分为二。
 *  纯数学（lift ccStep 嘅边邻接），只喺【已有边】加中点 → 顶点只落边上 ⇒ 体积不变、闭合 2-流形保持。
 *  返回新 QuadMesh；非流形 / 开边界 / 环唔闭合 / 退化 / 体积翻号 → null（调用方 no-op）。 */
export function insertEdgeLoop(m: QuadMesh, faceIdx: number, edgeSlot: 0 | 1 | 2 | 3): QuadMesh | null {
  const verts = m.verts, quads = m.quads
  const nV = verts.length, nF = quads.length
  if (!Number.isInteger(faceIdx) || faceIdx < 0 || faceIdx >= nF) return null   // S180 audit：同 extrudeQuadFace 整数守卫（自防分数 index）
  // 1) 边邻接（同 ccStep:243-271）
  const edgeIdx = new Map<number, number>()
  const eV0: number[] = [], eV1: number[] = [], eF0: number[] = [], eF1: number[] = []
  const faceEdge = new Int32Array(nF * 4)
  for (let f = 0; f < nF; f++) {
    const q = quads[f]
    for (let s = 0; s < 4; s++) {
      const a = q[s], b = q[(s + 1) & 3]
      const lo = a < b ? a : b, hi = a < b ? b : a
      const key = lo * nV + hi
      let e = edgeIdx.get(key)
      if (e === undefined) { e = eV0.length; edgeIdx.set(key, e); eV0.push(lo); eV1.push(hi); eF0.push(f); eF1.push(-1) }
      else { if (eF1[e] !== -1) return null; eF1[e] = f }   // 非流形（≥3 面）
      faceEdge[f * 4 + s] = e
    }
  }
  for (let e = 0; e < eV0.length; e++) if (eF1[e] === -1) return null   // 开边界
  // 2) 环绕走 quad：由 (faceIdx, edgeSlot 边) 入、对边出、跨邻面续，返起点即环闭合
  const ringCut = new Map<number, number>()   // face → 入边 edge index（出边 = 对边）
  let cur = faceIdx, entryE = faceEdge[faceIdx * 4 + edgeSlot]
  for (let guard = 0; guard <= nF; guard++) {
    let s = -1
    for (let k = 0; k < 4; k++) if (faceEdge[cur * 4 + k] === entryE) { s = k; break }
    if (s < 0) return null
    if (ringCut.has(cur)) break          // 返到已访问面 → 环闭合
    const exitE = faceEdge[cur * 4 + ((s + 2) & 3)]
    ringCut.set(cur, entryE)
    const nb = eF0[exitE] === cur ? eF1[exitE] : eF0[exitE]
    if (nb < 0) return null
    entryE = exitE; cur = nb
  }
  if (!ringCut.size) return null
  // 3) 切：每条被切边加中点（按 edge index 焊接 → 相邻环 quad 共享，非环 quad 边唔郁）
  const outVerts: [number, number, number][] = verts.map((p) => [p[0], p[1], p[2]])
  const midCache = new Map<number, number>()
  const mid = (e: number): number => {
    let v = midCache.get(e)
    if (v === undefined) { const a = verts[eV0[e]], b = verts[eV1[e]]; v = outVerts.length; midCache.set(e, v); outVerts.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]) }
    return v
  }
  const outQuads: [number, number, number, number][] = []
  for (let f = 0; f < nF; f++) {
    const entry = ringCut.get(f)
    if (entry === undefined) { const q = quads[f]; outQuads.push([q[0], q[1], q[2], q[3]]); continue }
    const q = quads[f]
    let sIn = -1
    for (let k = 0; k < 4; k++) if (faceEdge[f * 4 + k] === entry) { sIn = k; break }
    if (sIn < 0) return null
    if ((sIn & 1) === 0) {   // 切 slot0(q0-q1) & slot2(q2-q3)
      const m0 = mid(faceEdge[f * 4]), m2 = mid(faceEdge[f * 4 + 2])
      outQuads.push([q[0], m0, m2, q[3]]); outQuads.push([m0, q[1], q[2], m2])
    } else {                 // 切 slot1(q1-q2) & slot3(q3-q0)
      const m1 = mid(faceEdge[f * 4 + 1]), m3 = mid(faceEdge[f * 4 + 3])
      outQuads.push([q[0], q[1], m1, m3]); outQuads.push([m3, m1, q[2], q[3]])
    }
  }
  const out: QuadMesh = { verts: outVerts, quads: outQuads }
  // 4) 守卫：闭合 2-流形 + 体积同号正（中点喺边上 → planar quad 体积精确不变；非平面 quad 二阶小差，靠同号正兜）
  if (!quadManifold(out) || !(quadSignedVol(out) > 0) || quadSignedVol(m) <= 0) return null
  return out
}
