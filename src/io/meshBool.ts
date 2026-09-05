// Mesh-level booleans via manifold-3d (Apache-2.0, license-safe) — the multibody-lite workhorse:
// cut one part out of another (perfect sockets/molds, optional clearance), merge, intersect.
// Terminal baked operation on component MESHES (same contract as splitBody) — NOT in the feature tree.
// manifold requires watertight 2-manifold input; we surface its rejection honestly so the user can run
// 修复网格 first instead of getting silent garbage.

type MeshLike = { vertices: Float32Array | number[]; triangles: Uint32Array | number[] }
type OutMesh = { vertices: number[]; triangles: number[]; normals: number[] }

let modP: Promise<any> | null = null
async function manifoldMod(): Promise<any> {
  if (!modP) {
    modP = (async () => {
      const Module = (await import('manifold-3d')).default
      const wasm = await Module()
      wasm.setup()
      return wasm
    })()
  }
  return modP
}

function toManifold(wasm: any, m: MeshLike): any {
  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: m.vertices instanceof Float32Array ? m.vertices : new Float32Array(m.vertices),
    triVerts: m.triangles instanceof Uint32Array ? m.triangles : new Uint32Array(m.triangles),
  })
  // weld duplicate vertices first — OCCT/STL meshes carry per-face duplicated verts which manifold
  // treats as open edges; merge() unifies them by position
  mesh.merge()
  const man = new wasm.Manifold(mesh)
  return man
}

function fromManifold(man: any): OutMesh {
  const mesh = man.getMesh()
  const vp: Float32Array = mesh.vertProperties
  const np = mesh.numProp
  const tv: Uint32Array = mesh.triVerts
  const vertices: number[] = []
  for (let v = 0; v < vp.length / np; v++) vertices.push(vp[v * np], vp[v * np + 1], vp[v * np + 2])
  const triangles = Array.from(tv)
  // area-weighted vertex normals (renderer expects them)
  const nn = new Array(vertices.length).fill(0)
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i] * 3, b = triangles[i + 1] * 3, c = triangles[i + 2] * 3
    const ux = vertices[b] - vertices[a], uy = vertices[b + 1] - vertices[a + 1], uz = vertices[b + 2] - vertices[a + 2]
    const vx = vertices[c] - vertices[a], vy = vertices[c + 1] - vertices[a + 1], vz = vertices[c + 2] - vertices[a + 2]
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx
    for (const o of [a, b, c]) { nn[o] += fx; nn[o + 1] += fy; nn[o + 2] += fz }
  }
  for (let i = 0; i < nn.length; i += 3) { const L = Math.hypot(nn[i], nn[i + 1], nn[i + 2]) || 1; nn[i] /= L; nn[i + 1] /= L; nn[i + 2] /= L }
  return { vertices, triangles, normals: nn }
}

export type BoolOp3 = 'union' | 'subtract' | 'intersect'

// A ⊗ B in a SHARED coordinate frame (caller bakes each part's world transform into the vertices first).
// Throws Error with an honest Chinese message when an input isn't manifold or the result is empty.
export async function meshBoolean(a: MeshLike, b: MeshLike, op: BoolOp3): Promise<OutMesh> {
  const wasm = await manifoldMod()
  let ma: any = null, mb: any = null, mr: any = null
  try {
    // status() returns the string 'NoError' in this build (emval enum-as-string), not a {value} object
    const bad = (m: any) => { const st = m.status?.(); return st != null && st !== 'NoError' && st?.value !== 0 }
    ma = toManifold(wasm, a)
    if (bad(ma)) throw new Error('第一件网格唔系水密流形 — 先用「🩹修复网格」再试')
    mb = toManifold(wasm, b)
    if (bad(mb)) throw new Error('第二件网格唔系水密流形 — 先用「🩹修复网格」再试')
    mr = op === 'union' ? ma.add(mb) : op === 'subtract' ? ma.subtract(mb) : ma.intersect(mb)
    const out = fromManifold(mr)
    if (!out.triangles.length) throw new Error(op === 'intersect' ? '两件冇重叠部分（相交结果为空）' : '布尔结果为空')
    return out
  } finally {
    try { ma?.delete?.() } catch { /* wasm cleanup best-effort */ }
    try { mb?.delete?.() } catch { /* */ }
    try { mr?.delete?.() } catch { /* */ }
  }
}

// 带符号体积（散度定理，唔取绝对值）— 用嚟判朝向（正=外向 CCW）+ 内壳自交检测。
function signedVol(v: ArrayLike<number>, t: ArrayLike<number>): number {
  let s = 0
  const nv = v.length
  for (let i = 0; i < t.length; i += 3) {
    const a = (t[i] as number) * 3, b = (t[i + 1] as number) * 3, c = (t[i + 2] as number) * 3
    // 越界守卫：用户输入网格（shellMesh/offsetMesh 在 manifold 校验前调用）可能含畸形索引 → v[idx]=undefined→NaN 污染。跳过越界三角。
    if (!(a >= 0 && b >= 0 && c >= 0 && a + 2 < nv && b + 2 < nv && c + 2 < nv)) continue
    s += (v[a] as number) * ((v[b + 1] as number) * (v[c + 2] as number) - (v[b + 2] as number) * (v[c + 1] as number))
      + (v[a + 1] as number) * ((v[b + 2] as number) * (v[c] as number) - (v[b] as number) * (v[c + 2] as number))
      + (v[a + 2] as number) * ((v[b] as number) * (v[c + 1] as number) - (v[b + 1] as number) * (v[c] as number))
  }
  return s / 6
}

// S165：网格抽壳 / 加厚（Fusion Mesh > Thicken / Shell）。闭合水密网格掏空成壁厚 t 嘅壳。
// 关键教训（S165 audit）：manifold 唔会拒绝自交/翻转网格 — 佢照样收做有效流形，subtract 一个翻转内壳
// 变成 UNION（体积反而变大）→ 唔可以靠 manifold 做 fail-safe。改用【带符号体积】严格守卫：
//   (1) 先用带符号体积定朝向，负 → 整件反绕向（处理 inward-wound STL），保证正定向再算法向；
//   (2) 法向按【位置规范】顶点累加（OCCT/STL 每面复制顶点 → 焊接后共享法向，免内壳裂开）；
//   (3) 内壳带符号体积必须 >0（同外向一致、无自交）且 < 外体积，否则壁厚太大 → 拒（诚实提示，唔叫去修复好网格）；
//   (4) subtract 后结果体积必须严格细过实体（壳必小于实体）+ >0，否则系翻转 union 垃圾 → 拒。
export async function shellMesh(m: MeshLike, t: number): Promise<OutMesh> {
  if (!(t > 0)) throw new Error('抽壳壁厚要 > 0')
  const v0 = (m.vertices instanceof Float32Array ? Array.from(m.vertices) : (m.vertices as number[]))
  let tr = (m.triangles instanceof Uint32Array ? Array.from(m.triangles) : (m.triangles as number[]))
  const nv = v0.length / 3
  const vSigned = signedVol(v0, tr)
  if (Math.abs(vSigned) < 1e-9) throw new Error('网格体积近零，无法抽壳')
  if (vSigned < 0) tr = tr.slice().map((_, i) => tr[i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i])   // 反绕向 → 正定向（每三角 swap 后两 index）
  const vOuter = Math.abs(vSigned)
  // 位置规范顶点 → 共享面积加权外向法向
  const canon = new Map<string, number>(); const cid = new Int32Array(nv)
  for (let i = 0; i < nv; i++) { const o = i * 3; const k = `${Math.round(v0[o] * 1e4)}_${Math.round(v0[o + 1] * 1e4)}_${Math.round(v0[o + 2] * 1e4)}`; let c = canon.get(k); if (c === undefined) { c = canon.size; canon.set(k, c) } cid[i] = c }
  // 审计修复#2：3D 斜接（miter）—— 旧版沿【顶点平均法向】内移 t，棱/角处垂直壁厚塌成 ~t·cosθ（盒角仅 0.577t、挖多 ~42% 料）。
  // 改：每个焊接顶点收集相邻【面】嘅去重单位法向，解最小二乘 M·Δ=b（每面沿其法向准确内移 t，b_i=−t）。
  // 用 Tikhonov 正则（对角加 ε）令角(rank3=精确)/棱(rank2=正确 miter)/面(rank1=沿法向 t) 统一可解、无除零分支。
  const vnorms: number[][][] = new Array(canon.size); for (let i = 0; i < canon.size; i++) vnorms[i] = []
  for (let i = 0; i < tr.length; i += 3) {
    const a = tr[i] * 3, b = tr[i + 1] * 3, c = tr[i + 2] * 3
    const ux = v0[b] - v0[a], uy = v0[b + 1] - v0[a + 1], uz = v0[b + 2] - v0[a + 2]
    const wx = v0[c] - v0[a], wy = v0[c + 1] - v0[a + 1], wz = v0[c + 2] - v0[a + 2]
    let fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx
    const L = Math.hypot(fx, fy, fz); if (L < 1e-12) continue; fx /= L; fy /= L; fz /= L
    for (const vi of [tr[i], tr[i + 1], tr[i + 2]]) { const arr = vnorms[cid[vi]]; let dup = false; for (const n of arr) { if (n[0] * fx + n[1] * fy + n[2] * fz > 0.9999) { dup = true; break } } if (!dup) arr.push([fx, fy, fz]) }
  }
  const delta = new Float64Array(canon.size * 3)
  const EPS = 1e-4
  for (let c = 0; c < canon.size; c++) {
    const ns = vnorms[c]
    let m00 = EPS, m01 = 0, m02 = 0, m11 = EPS, m12 = 0, m22 = EPS, bx = 0, by = 0, bz = 0
    for (const n of ns) { m00 += n[0] * n[0]; m01 += n[0] * n[1]; m02 += n[0] * n[2]; m11 += n[1] * n[1]; m12 += n[1] * n[2]; m22 += n[2] * n[2]; bx += n[0]; by += n[1]; bz += n[2] }
    bx *= -t; by *= -t; bz *= -t
    const C00 = m11 * m22 - m12 * m12, C01 = m02 * m12 - m01 * m22, C02 = m01 * m12 - m02 * m11
    const C11 = m00 * m22 - m02 * m02, C12 = m01 * m02 - m00 * m12, C22 = m00 * m11 - m01 * m01
    const det = m00 * C00 + m01 * C01 + m02 * C02
    if (Math.abs(det) > 1e-12) {
      delta[c * 3] = (C00 * bx + C01 * by + C02 * bz) / det
      delta[c * 3 + 1] = (C01 * bx + C11 * by + C12 * bz) / det
      delta[c * 3 + 2] = (C02 * bx + C12 * by + C22 * bz) / det
    }
  }
  const inner = new Array(v0.length)
  for (let i = 0; i < nv; i++) { const o = i * 3, c = cid[i] * 3; inner[o] = v0[o] + delta[c]; inner[o + 1] = v0[o + 1] + delta[c + 1]; inner[o + 2] = v0[o + 2] + delta[c + 2] }
  const viSigned = signedVol(inner, tr)
  // 内壳必须同外向一致（正）+ 严格细过外（无翻转/自交/溢穿对壁）
  if (!(viSigned > 1e-9) || viSigned >= vOuter) throw new Error('壁厚太大 — 内壳自交/塌陷/穿透对壁（试细啲壁厚 / 先重网格加密）')
  let res: OutMesh
  try {
    res = await meshBoolean({ vertices: v0, triangles: tr }, { vertices: inner, triangles: tr }, 'subtract')
  } catch {
    throw new Error('壁厚太大 — 内壳自交，掏唔出有效壳（试细啲壁厚）')   // 唔好叫用户去修复佢本来好嘅网格
  }
  const vr = meshVolume(res)
  if (!(vr > 1e-6) || vr >= vOuter * 0.999) throw new Error('壁厚太大 — 抽壳结果体积异常（壳应细过实体），未改')   // 翻转 union 垃圾守卫
  return res
}

// S188：网格 3D 均匀偏移（Fusion Mesh > Offset）。沿【全方向】平移壁面 d —— 正=外扩、负=内缩。
// 用 manifold 嘅 minkowskiSum / minkowskiDifference 与半径 |d| 嘅球做【形态学膨胀 / 腐蚀】：
//   · minkowskiSum(球) = 把实体每点向外扫一个 |d| 半径球 = 均匀外偏移（平面精确平移 d、棱按球面圆角、角变球面）；
//   · minkowskiDifference(球) = 均匀内偏移（腐蚀）。
// 数学上系真·3D 偏移（唔似 shellMesh 掏空成壳；呢个系整体胀/缩）。球分段数 sphereSeg 控质量/速度
// （越高越圆越慢；Minkowski 对非凸网格本身偏贵，默认 16 段平衡）。
//   d≈0 → 焊接复制（保持输出格式一致）。非流形输入 → 诚实抛错。内缩蚀剩空 → 抛错。
export async function offsetMesh(m: MeshLike, d: number, sphereSeg = 16): Promise<OutMesh> {
  // S188 关键：minkowski 要求【CCW-外向 正定向】输入，否则 dilation 出错值/翻转（实测 inward-wound cube
  // SUM 得 671 而非 1698）。先用带符号体积归一化绕向（同 shellMesh 处理 inward STL 一致）。
  const v0 = (m.vertices instanceof Float32Array ? Array.from(m.vertices) : (m.vertices as number[]))
  let tr = (m.triangles instanceof Uint32Array ? Array.from(m.triangles) : (m.triangles as number[]))
  if (signedVol(v0, tr) < 0) tr = tr.slice().map((_, i) => tr[i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i])   // 反绕向 → 正定向（每三角 swap 后两 index）
  const mNorm = { vertices: v0, triangles: tr }
  const wasm = await manifoldMod()
  let ma: any = null, sp: any = null, mr: any = null
  try {
    const bad = (x: any) => { const st = x.status?.(); return st != null && st !== 'NoError' && st?.value !== 0 }
    ma = toManifold(wasm, mNorm)
    if (bad(ma)) throw new Error('网格唔系水密流形 — 先用「🩹修复网格」再试')
    if (Math.abs(d) < 1e-9) { const out = fromManifold(ma); if (!out.triangles.length) throw new Error('网格为空'); return out }   // 零偏移 = 焊接复制
    sp = wasm.Manifold.sphere(Math.abs(d), Math.max(8, Math.min(64, Math.round(sphereSeg))))
    mr = d > 0 ? ma.minkowskiSum(sp) : ma.minkowskiDifference(sp)
    const out = fromManifold(mr)
    if (!out.triangles.length) throw new Error(d < 0 ? '内缩量太大 — 网格被蚀剩空（试细啲偏移量）' : '偏移结果为空')
    return out
  } finally {
    try { ma?.delete?.() } catch { /* wasm cleanup best-effort */ }
    try { sp?.delete?.() } catch { /* */ }
    try { mr?.delete?.() } catch { /* */ }
  }
}

// Signed volume of a mesh (for verification & status readouts).
export function meshVolume(m: MeshLike): number {
  const v = m.vertices, t = m.triangles
  let vol = 0
  for (let i = 0; i < t.length; i += 3) {
    const a = (t[i] as number) * 3, b = (t[i + 1] as number) * 3, c = (t[i + 2] as number) * 3
    vol += (v[a] as number) * ((v[b + 1] as number) * (v[c + 2] as number) - (v[b + 2] as number) * (v[c + 1] as number))
      + (v[a + 1] as number) * ((v[b + 2] as number) * (v[c] as number) - (v[b] as number) * (v[c + 2] as number))
      + (v[a + 2] as number) * ((v[b] as number) * (v[c + 1] as number) - (v[b + 1] as number) * (v[c] as number))
  }
  return Math.abs(vol / 6)
}
