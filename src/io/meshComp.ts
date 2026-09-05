import type { MeshData } from '../worker/cad.worker'

// ─────────────────────────────────────────────────────────────────────────────
// 3D 打印网格级补偿（meshComp）—— 修正 FDM 日常痛点：孔印细 0.1~0.3mm、成件偏肥、物料收缩。
//
// 点解喺网格层做：精简 OCCT-WASM build 冇 BRepBuilderAPI_GTransform（HANDOFF §8），
// 非等比缩放落内核会卡死；但导出前对三角网格做顶点位移完全唔使内核，O(n) 快而稳。
//
// 【xyOffset 语义 ── 同 Cura「水平扩展 Horizontal Expansion」一致，正负要睇清】
//   · xyOffset > 0：竖墙沿外法线向外推 → 外形 XY 变大，【孔/槽同时变细】。
//   · xyOffset < 0：外形变细，【孔/槽变大】。
//   FDM 挤出压扁通常令成件整体偏肥、孔偏细，所以日常修正系填一个细【负值】
//   （典型 −0.10 ~ −0.15mm）：孔变返大、外形修返准 —— 即 slicer「水平扩展」填负数
//   嘅惯用法。想净系放大孔、完全唔郁外形（Cura「孔洞水平扩展」）需要可靠识别
//   「边啲面属于孔」—— 网格层做唔到可靠分类，诚实唔提供。
//
// 【scale 语义 ── 物料冷却收缩补偿】绕 mesh bbox 中心逐轴乘。
//   典型值：ABS 1.004~1.008 · 尼龙/ASA 1.003~1.006 · PETG 1.002~1.004 · PLA 1.000~1.002。
//   计算顺序【先 scale 后 xyOffset】：offset 系绝对 mm 修正，唔应该被缩放再放大。
//
// 【算法】顶点按位置焊接 → 逐面累加（面积加权）单位法线嘅 XY 投影 → 每焊点解
//   2×2 加权最小二乘 M·Δ = d·B（数学上 = 真·多边形斜接 miter offset）：
//   · 平墙内部点：移正好 d（沿墙法线）        · 90° 凸角：移 (d,d) → 每幅墙准确外移 d
//   · 圆柱面顶点：移 d/cos(半面夹角) → 每块切面准确外移 d   · 顶/底平面内部点：唔郁
//   · 重合槽位（OCCT 逐面重复顶点）按焊接 id 同步移动 → 唔会撕开网格，水密性保留。
//   限制（诚实）：斜接限幅 4×|d|（尖过 ~29° 嘅尖刺唔会爆冲）；平缓穹顶极点附近补偿
//   淡出（法线和向量抵消）；同切片器逐层多边形偏移唔系 100% 等价（嗰个会喺尖角 /
//   平顶边缘生新轮廓顶点，网格级顶点位移加唔到点）。
//
// 纯函数：永远返回全新数组，唔郁输入；vertices/triangles 接受 Float32Array 或 number[]。
// ─────────────────────────────────────────────────────────────────────────────

export type MeshLike = {
  vertices: Float32Array | number[]
  triangles: Uint32Array | number[]
  normals?: Float32Array | number[]
  warnings?: string[]
}
export type CompensateOpts = {
  xyOffset?: number                  // XY 水平补偿 mm（正=外胀孔细，负=外细孔大；常用 −0.1）
  scale?: [number, number, number]   // 逐轴收缩补偿，绕 bbox 中心（ABS ≈ [1.006,1.006,1.006]）
}

const WELD = 1e5        // 顶点焊接量化格：0.00001 mm（OCCT 重复槽位系 bit 级相同，必中）
const EPS = 1e-12
const RANK_EPS = 1e-9   // 2×2 最小二乘满秩判据：det > RANK_EPS·tr²（0.2° 切面都仲有 3e-6 余量）
const MITER_LIMIT = 4   // 斜接限幅：单点位移最多 4×|d|

export function compensateMesh(mesh: MeshLike, opts: CompensateOpts): MeshData {
  const sv = mesh.vertices, st = mesh.triangles
  const v = new Array<number>(sv.length)
  for (let i = 0; i < sv.length; i++) v[i] = sv[i]
  const tri = new Array<number>(st.length)
  for (let i = 0; i < st.length; i++) tri[i] = st[i]

  // 1) 收缩补偿：绕 bbox 中心逐轴缩放
  const sc = opts.scale
  const doScale = !!sc && v.length > 0 && (sc[0] !== 1 || sc[1] !== 1 || sc[2] !== 1)
  if (sc && doScale) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < v.length; i += 3)
      for (let k = 0; k < 3; k++) { const x = v[i + k]; if (x < lo[k]) lo[k] = x; if (x > hi[k]) hi[k] = x }
    for (let k = 0; k < 3; k++) {
      const c = (lo[k] + hi[k]) / 2, s = sc[k]
      for (let i = k; i < v.length; i += 3) v[i] = c + (v[i] - c) * s
    }
  }

  // 2) XY 水平补偿（焊接 + 面积加权 XY 法线 + 斜接最小二乘）
  const d = opts.xyOffset || 0
  if (d && v.length && tri.length) offsetXY(v, tri, d)

  // 3) 法线：有得继承就继承（缩放非等比先要修），冇就由输出几何重算（面积加权焊接法线）
  let normals: number[]
  const sn = mesh.normals
  if (sn && sn.length === v.length) {
    normals = new Array<number>(sn.length)
    const aniso = !!sc && doScale && !(sc[0] === sc[1] && sc[1] === sc[2])
    if (sc && aniso) {
      // 非等比缩放下法线要乘逆缩放再归一（n' ∝ n ∘ 1/s）；offset 系平面平移，法线不变
      for (let i = 0; i < sn.length; i += 3) {
        const nx = sn[i] / sc[0], ny = sn[i + 1] / sc[1], nz = sn[i + 2] / sc[2]
        const L = Math.hypot(nx, ny, nz) || 1
        normals[i] = nx / L; normals[i + 1] = ny / L; normals[i + 2] = nz / L
      }
    } else for (let i = 0; i < sn.length; i++) normals[i] = sn[i]
  } else normals = vertexNormals(v, tri)

  const out: MeshData = { vertices: v, triangles: tri, normals }
  if (mesh.warnings) out.warnings = mesh.warnings.slice()
  return out
}

// 顶点按量化位置焊接 → 每个原始槽位映射去 canonical id（OCCT 逐面重复顶点会合并）
function weldIds(v: number[]): { ids: Int32Array; n: number } {
  const map = new Map<string, number>()
  const ids = new Int32Array(v.length / 3)
  let n = 0
  for (let i = 0; i < v.length; i += 3) {
    const k = `${Math.round(v[i] * WELD)},${Math.round(v[i + 1] * WELD)},${Math.round(v[i + 2] * WELD)}`
    let id = map.get(k)
    if (id === undefined) { id = n++; map.set(k, id) }
    ids[i / 3] = id
  }
  return { ids, n }
}

// 沿「面积加权顶点法线嘅 XY 投影」位移，斜接修正令【每幅墙面】都准确外移 d。
// 每焊点累加  B = Σ 2A·n_xy（加权墙向和）  M = Σ (2A/|n_xy|)·m̂m̂ᵀ（m̂ = n_xy 单位向量），
// 解 M·Δ = d·B：两个朝向以内系精确斜接解（m̂ᵢ·Δ = d 对每幅墙成立），三个以上系加权折中。
// 位移按焊接 id 施加 → 重合槽位移动一致 → 唔会撕开网格。v 系本函数私有副本，就地改。
function offsetXY(v: number[], tri: number[], d: number): void {
  const { ids, n } = weldIds(v)
  const bx = new Float64Array(n), by = new Float64Array(n)
  const mxx = new Float64Array(n), mxy = new Float64Array(n), myy = new Float64Array(n)
  for (let f = 0; f < tri.length; f += 3) {
    const a = tri[f] * 3, b = tri[f + 1] * 3, c = tri[f + 2] * 3
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2]
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2]
    const Nx = uy * wz - uz * wy, Ny = uz * wx - ux * wz, Nz = ux * wy - uy * wx
    const A2 = Math.hypot(Nx, Ny, Nz)       // = 2×三角面积
    if (A2 < EPS) continue                  // 退化三角形
    const nx = Nx / A2, ny = Ny / A2        // 单位面法线 XY 分量
    const l = Math.hypot(nx, ny)
    if (l < 1e-7) continue                  // 水平面（顶/底）：唔约束 XY 偏移
    const q = A2 / l                        // w·m̂m̂ᵀ 公因子（w = 2A·l, m̂ = n_xy/l）
    for (let k = 0; k < 3; k++) {
      const id = ids[tri[f + k]]
      bx[id] += A2 * nx; by[id] += A2 * ny
      mxx[id] += q * nx * nx; mxy[id] += q * nx * ny; myy[id] += q * ny * ny
    }
  }
  const lim = MITER_LIMIT * Math.abs(d)
  const dx = new Float64Array(n), dy = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const tr = mxx[i] + myy[i]
    if (tr < EPS) continue                  // 净系掂到水平面 → 平顶/底内部点唔郁
    const det = mxx[i] * myy[i] - mxy[i] * mxy[i]
    let ox = 0, oy = 0
    if (det > RANK_EPS * tr * tr) {         // 满秩（≥2 个墙向）→ 精确斜接解 M·Δ = d·B
      ox = (d * (myy[i] * bx[i] - mxy[i] * by[i])) / det
      oy = (d * (mxx[i] * by[i] - mxy[i] * bx[i])) / det
    } else {                                // 秩 1（单一墙向，平墙内部）→ 沿墙法线移正好 d
      const L = Math.hypot(bx[i], by[i])
      if (L < 1e-6 * tr) continue           // 对冲薄刃 / 穹顶极点：墙向互相抵消 → 唔郁
      ox = (d * bx[i]) / L; oy = (d * by[i]) / L
    }
    const m = Math.hypot(ox, oy)
    if (m > lim) { ox *= lim / m; oy *= lim / m }   // 斜接限幅：尖刺最多 4×|d|
    dx[i] = ox; dy[i] = oy
  }
  for (let i = 0; i < ids.length; i++) { v[i * 3] += dx[ids[i]]; v[i * 3 + 1] += dy[ids[i]] }
}

// 面积加权焊接顶点法线（输入冇自带法线时，由输出几何重算；逐槽位输出）
function vertexNormals(v: number[], tri: number[]): number[] {
  const { ids, n } = weldIds(v)
  const sx = new Float64Array(n), sy = new Float64Array(n), sz = new Float64Array(n)
  for (let f = 0; f < tri.length; f += 3) {
    const a = tri[f] * 3, b = tri[f + 1] * 3, c = tri[f + 2] * 3
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2]
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2]
    const Nx = uy * wz - uz * wy, Ny = uz * wx - ux * wz, Nz = ux * wy - uy * wx // 未归一 = n̂·2A，自带面积权
    for (let k = 0; k < 3; k++) { const id = ids[tri[f + k]]; sx[id] += Nx; sy[id] += Ny; sz[id] += Nz }
  }
  const out = new Array<number>(v.length).fill(0)
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i], L = Math.hypot(sx[id], sy[id], sz[id])
    if (L > EPS) { out[i * 3] = sx[id] / L; out[i * 3 + 1] = sy[id] / L; out[i * 3 + 2] = sz[id] / L }
    else out[i * 3 + 2] = 1 // 孤立/退化顶点：求其畀个 +Z，避免零法线
  }
  return out
}
