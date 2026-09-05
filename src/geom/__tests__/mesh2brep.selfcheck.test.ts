// M1（Mesh→B-rep 逆向工程：分割 + 基元识别 + snap）嘅【信任基础】。
//
// 点解要呢啲测试：擬合出嚟嘅参数冇人肉眼验得到 —— 一个打错嘅符号唔会 crash，只会静静鸡俾你
// 一个半径 11.97 嘅圆柱，跟住 M2 起返个 B-rep 出嚟，睇落一模一样，但件嘢係错嘅。所以呢度全部
// 用【程序化镶嵌嘅已知形状】（唔靠任何外部资产），逐个 ground truth 对返数。
//
// 点跑
// ────
// 呢个 repo 【冇装 vitest】。文件系 vitest 风格写，describe/it/expect 喺 runtime 自动拣：
// globalThis 有（vitest globals:true / bun / jest）就用返佢哋，冇就用下面嗰个迷你 runner：
//
//     node --experimental-strip-types src/geom/__tests__/mesh2brep.selfcheck.test.ts
//
// 将来装咗 vitest，把 HARNESS 一段换成 `import { describe, it, expect } from 'vitest'` 就得。

import { segmentAndFit } from '../primitiveFit.ts'
import type { CylinderParams, ConeParams, FittedRegion, PlaneParams, SphereParams, TorusParams, SegmentationResult } from '../primitiveFit.ts'
import { weldMesh } from '../meshSegment.ts'

/* ══════════════════════════════════════════════════ HARNESS（装咗 vitest 就删呢段） */

type Body = () => void

interface Matchers {
  toBe(expected: unknown): void
  toBeCloseTo(expected: number, digits?: number): void
  toBeGreaterThan(n: number): void
  toBeLessThan(n: number): void
  toBeGreaterThanOrEqual(n: number): void
  toBeLessThanOrEqual(n: number): void
  toHaveLength(n: number): void
}

interface Harness {
  describe: (name: string, body: Body) => void
  it: (name: string, body: Body) => void
  expect: (actual: unknown) => Matchers
}

const HOST = globalThis as unknown as Partial<Harness>
const useHost = typeof HOST.describe === 'function' && typeof HOST.it === 'function' && typeof HOST.expect === 'function'

const cases: { name: string; error: string | null }[] = []
const suite: string[] = []

const localDescribe = (name: string, body: Body): void => {
  suite.push(name)
  try { body() } finally { suite.pop() }
}

const localIt = (name: string, body: Body): void => {
  const full = suite.concat(name).join(' > ')
  try { body(); cases.push({ name: full, error: null }) }
  catch (err) { cases.push({ name: full, error: err instanceof Error ? err.message : String(err) }) }
}

const show = (v: unknown): string => (typeof v === 'number' ? String(v) : JSON.stringify(v))

const localExpect = (actual: unknown): Matchers => ({
  toBe(expected) { if (!Object.is(actual, expected)) throw new Error('expected ' + show(actual) + ' to be ' + show(expected)) },
  toBeCloseTo(expected, digits = 2) {
    const tol = Math.pow(10, -digits) / 2
    if (typeof actual !== 'number' || !(Math.abs(actual - expected) <= tol)) throw new Error('expected ' + show(actual) + ' to be within ' + tol + ' of ' + expected)
  },
  toBeGreaterThan(n) { if (!(typeof actual === 'number' && actual > n)) throw new Error('expected ' + show(actual) + ' > ' + n) },
  toBeLessThan(n) { if (!(typeof actual === 'number' && actual < n)) throw new Error('expected ' + show(actual) + ' < ' + n) },
  toBeGreaterThanOrEqual(n) { if (!(typeof actual === 'number' && actual >= n)) throw new Error('expected ' + show(actual) + ' >= ' + n) },
  toBeLessThanOrEqual(n) { if (!(typeof actual === 'number' && actual <= n)) throw new Error('expected ' + show(actual) + ' <= ' + n) },
  toHaveLength(n) {
    const len = (actual as { length?: number } | null)?.length
    if (len !== n) throw new Error('expected length ' + show(len) + ' to be ' + n)
  },
})

const describe = useHost && HOST.describe ? HOST.describe : localDescribe
const it = useHost && HOST.it ? HOST.it : localIt
const expect = useHost && HOST.expect ? HOST.expect : localExpect

/* ══════════════════════════════════════════════ 程序化镶嵌（ground truth 全部喺呢度） */

interface TriMesh { v: Float64Array; t: Uint32Array }

function builder(): { addV: (x: number, y: number, z: number) => number; quad: (a: number, b: number, c: number, d: number) => void; tri: (a: number, b: number, c: number) => void; done: () => TriMesh } {
  const v: number[] = []
  const t: number[] = []
  return {
    addV: (x, y, z) => { v.push(x, y, z); return v.length / 3 - 1 },
    tri: (a, b, c) => { t.push(a, b, c) },
    quad: (a, b, c, d) => { t.push(a, b, c, a, c, d) },
    done: () => ({ v: Float64Array.from(v), t: Uint32Array.from(t) }),
  }
}

/** STL 现实：每个三角自带三个顶点（完全未焊接）→ 试焊接管線。 */
function unweld(m: TriMesh): TriMesh {
  const v = new Float64Array(m.t.length * 3)
  const t = new Uint32Array(m.t.length)
  for (let i = 0; i < m.t.length; i++) {
    const s = m.t[i]
    v[i * 3] = m.v[s * 3]; v[i * 3 + 1] = m.v[s * 3 + 1]; v[i * 3 + 2] = m.v[s * 3 + 2]
    t[i] = i
  }
  return { v, t }
}

/** 有符号体积（散度定理）。正 = 缠绕外向；同解析体积对得上 = 镶嵌本身冇错。 */
function signedVolume(m: TriMesh): number {
  let vol = 0
  for (let i = 0; i < m.t.length; i += 3) {
    const a = m.t[i] * 3, b = m.t[i + 1] * 3, c = m.t[i + 2] * 3
    const ax = m.v[a], ay = m.v[a + 1], az = m.v[a + 2]
    const bx = m.v[b], by = m.v[b + 1], bz = m.v[b + 2]
    const cx = m.v[c], cy = m.v[c + 1], cz = m.v[c + 2]
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return vol
}

function makeBox(W: number, D: number, H: number): TriMesh {
  const b = builder()
  const p = (x: number, y: number, z: number): number => b.addV(x, y, z)
  const v000 = p(0, 0, 0), v100 = p(W, 0, 0), v110 = p(W, D, 0), v010 = p(0, D, 0)
  const v001 = p(0, 0, H), v101 = p(W, 0, H), v111 = p(W, D, H), v011 = p(0, D, H)
  b.quad(v001, v101, v111, v011)   // +Z
  b.quad(v000, v010, v110, v100)   // −Z
  b.quad(v100, v110, v111, v101)   // +X
  b.quad(v000, v001, v011, v010)   // −X
  b.quad(v010, v011, v111, v110)   // +Y
  b.quad(v000, v100, v101, v001)   // −Y
  return b.done()
}

/** 圆柱（轴 Z，z ∈ [0,h]）+ 上下盖。tilt = 绕 X 轴倾斜（度），试 snap。 */
function makeCylinder(r: number, h: number, seg: number, opts: { tiltDeg?: number; jitter?: number; seed?: number; rings?: number } = {}): TriMesh {
  const b = builder()
  const rings = opts.rings ?? 1
  const tilt = (opts.tiltDeg ?? 0) * Math.PI / 180
  const ct = Math.cos(tilt), st = Math.sin(tilt)
  let seed = opts.seed ?? 12345
  const rnd = (): number => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const put = (x: number, y: number, z: number): number => b.addV(x, y * ct - z * st, y * st + z * ct)
  const ring: number[][] = []
  for (let k = 0; k <= rings; k++) {
    const z = (h * k) / rings
    const row: number[] = []
    for (let i = 0; i < seg; i++) {
      const a = (2 * Math.PI * i) / seg
      const rr = opts.jitter ? r * (1 + (rnd() * 2 - 1) * opts.jitter) : r
      row.push(put(rr * Math.cos(a), rr * Math.sin(a), z))
    }
    ring.push(row)
  }
  for (let k = 0; k < rings; k++) for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg
    b.quad(ring[k][i], ring[k][j], ring[k + 1][j], ring[k + 1][i])
  }
  const cTop = put(0, 0, h), cBot = put(0, 0, 0)
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg
    b.tri(cTop, ring[rings][i], ring[rings][j])
    b.tri(cBot, ring[0][j], ring[0][i])
  }
  return b.done()
}

function makeSphere(R: number, nu: number, nv: number): TriMesh {
  const b = builder()
  const grid: number[][] = []
  for (let j = 0; j <= nv; j++) {
    const phi = (Math.PI * j) / nv
    const row: number[] = []
    for (let i = 0; i < nu; i++) {
      const th = (2 * Math.PI * i) / nu
      row.push(b.addV(R * Math.sin(phi) * Math.cos(th), R * Math.sin(phi) * Math.sin(th), R * Math.cos(phi)))
    }
    grid.push(row)
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const i2 = (i + 1) % nu
    b.quad(grid[j][i], grid[j + 1][i], grid[j + 1][i2], grid[j][i2])   // 极点处退化三角由焊接剔走
  }
  return b.done()
}

/** 圆锥（顶点喺 +Z，底圆 z=0）+ 底盖。 */
function makeCone(R: number, H: number, seg: number, rings: number): TriMesh {
  const b = builder()
  const lev: number[][] = []
  for (let k = 0; k <= rings; k++) {
    const f = k / rings
    const z = H * f, rr = R * (1 - f)
    const row: number[] = []
    for (let i = 0; i < seg; i++) {
      const a = (2 * Math.PI * i) / seg
      row.push(b.addV(rr * Math.cos(a), rr * Math.sin(a), z))
    }
    lev.push(row)
  }
  for (let k = 0; k < rings; k++) for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg
    b.quad(lev[k][i], lev[k][j], lev[k + 1][j], lev[k + 1][i])   // 顶层退化 → 焊接剔走 = 顶点扇
  }
  const c0 = b.addV(0, 0, 0)
  for (let i = 0; i < seg; i++) b.tri(c0, lev[0][(i + 1) % seg], lev[0][i])
  return b.done()
}

/** 长方块中间开一个通 Z 嘅圆孔。顶/底面 = 由孔向外辐射嘅四边形带（含 4 只角，保证侧面平）。 */
function makeBoxWithHole(W: number, D: number, H: number, hx: number, hy: number, R: number, seg: number): { mesh: TriMesh; holeArea: number } {
  const angles: number[] = []
  for (let i = 0; i < seg; i++) angles.push((2 * Math.PI * i) / seg)
  for (const [cx, cy] of [[0, 0], [W, 0], [W, D], [0, D]]) {
    let a = Math.atan2(cy - hy, cx - hx)
    if (a < 0) a += 2 * Math.PI
    angles.push(a)
  }
  angles.sort((a, b) => a - b)
  const uniq = angles.filter((a, i) => i === 0 || Math.abs(a - angles[i - 1]) > 1e-9)
  const hit = (a: number): [number, number] => {
    const dx = Math.cos(a), dy = Math.sin(a)
    let t = Infinity
    if (dx > 1e-12) t = Math.min(t, (W - hx) / dx)
    if (dx < -1e-12) t = Math.min(t, (0 - hx) / dx)
    if (dy > 1e-12) t = Math.min(t, (D - hy) / dy)
    if (dy < -1e-12) t = Math.min(t, (0 - hy) / dy)
    return [hx + t * dx, hy + t * dy]
  }
  const b = builder()
  const n = uniq.length
  const h0: number[] = [], h1: number[] = [], b0: number[] = [], b1: number[] = []
  for (const a of uniq) {
    const px = hx + R * Math.cos(a), py = hy + R * Math.sin(a)
    const [bx, by] = hit(a)
    h0.push(b.addV(px, py, 0)); h1.push(b.addV(px, py, H))
    b0.push(b.addV(bx, by, 0)); b1.push(b.addV(bx, by, H))
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    b.quad(h1[i], b1[i], b1[j], h1[j])   // 顶面 +Z
    b.quad(h0[i], h0[j], b0[j], b0[i])   // 底面 −Z
    b.quad(b0[i], b0[j], b1[j], b1[i])   // 外侧壁（外向）
    b.quad(h0[i], h1[i], h1[j], h0[j])   // 孔壁（法向指向轴 = 实体外）
  }
  // 孔多边形嘅【真实】面积：角度序列含 4 只角嘅方位角，唔係均匀 seg 边形，要逐段扇形加
  let holeArea = 0
  for (let i = 0; i < n; i++) holeArea += 0.5 * R * R * Math.sin(((uniq[(i + 1) % n] - uniq[i]) + 2 * Math.PI) % (2 * Math.PI))
  return { mesh: b.done(), holeArea }
}

/**
 * ★ G1 圆角带（平面 — 四分一圆柱 — 平面，全程切线连续、冇任何利边）★
 * 纯法向 region growing 会当佢係【一整块】；净靠曲率不连续先分得开。
 */
function makeFilletStrip(rf: number, L: number, Ly: number, arcSeg: number, planeSeg: number, ySeg: number): TriMesh {
  const prof: [number, number][] = []
  for (let i = 0; i < planeSeg; i++) prof.push([-L + (L * i) / planeSeg, rf])          // 顶面 z=rf
  for (let k = 0; k <= arcSeg; k++) {                                                   // 圆角 90°→0°
    const a = (Math.PI / 2) * (1 - k / arcSeg)
    prof.push([rf * Math.cos(a), rf * Math.sin(a)])
  }
  for (let j = 1; j <= planeSeg; j++) prof.push([rf, -(L * j) / planeSeg])              // 侧面 x=rf
  const b = builder()
  const grid: number[][] = []
  for (let jy = 0; jy <= ySeg; jy++) {
    const y = (Ly * jy) / ySeg
    grid.push(prof.map(([x, z]) => b.addV(x, y, z)))
  }
  for (let jy = 0; jy < ySeg; jy++) for (let i = 0; i < prof.length - 1; i++) {
    b.quad(grid[jy][i], grid[jy][i + 1], grid[jy + 1][i + 1], grid[jy + 1][i])
  }
  return b.done()
}

/**
 * 圆柱凸台企喺圆板上，底部【圆环面圆角】：plane → torus → cylinder 一条 G1 相切链（闭合实体）。
 * 机械件最常见嘅圆角形态；同时试 torus 擬合（v1 只做圆角带）同三种曲面连住嘅曲率分割。
 */
function makeFilletedBoss(R: number, rf: number, h: number, outer: number, seg: number, arcSeg: number): TriMesh {
  const b = builder()
  const prof: [number, number][] = [[outer, 0]]
  for (let i = 1; i < 4; i++) prof.push([outer + ((R + rf - outer) * i) / 4, 0])          // 板面（环形）
  for (let k = 0; k <= arcSeg; k++) {                                                      // 圆角（1/4 圆环面）
    const f = (Math.PI / 2) * (k / arcSeg)
    prof.push([(R + rf) - rf * Math.sin(f), rf * (1 - Math.cos(f))])
  }
  for (let i = 1; i <= 6; i++) prof.push([R, rf + ((h - rf) * i) / 6])                     // 凸台圆柱
  prof.push([0, h])                                                                        // 顶盖
  const grid: number[][] = []
  for (let i = 0; i < seg; i++) {
    const a = (2 * Math.PI * i) / seg
    grid.push(prof.map(([rho, z]) => b.addV(rho * Math.cos(a), rho * Math.sin(a), z)))
  }
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg
    for (let k = 0; k < prof.length - 1; k++) b.quad(grid[i][k], grid[j][k], grid[j][k + 1], grid[i][k + 1])
  }
  const bot: number[] = []
  for (let i = 0; i < seg; i++) {
    const a = (2 * Math.PI * i) / seg
    bot.push(b.addV(outer * Math.cos(a), outer * Math.sin(a), -2))
  }
  const cBot = b.addV(0, 0, -2)
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg
    b.quad(bot[i], bot[j], grid[j][0], grid[i][0])   // 板外侧壁（外向）
    b.tri(cBot, bot[j], bot[i])                      // 板底 −Z
  }
  return b.done()
}

/* ══════════════════════════════════════════════════════════ 共用断言助手 */

const kinds = (r: SegmentationResult, k: string): FittedRegion[] => r.regions.filter((x) => x.kind === k)
const biggest = (list: FittedRegion[]): FittedRegion => list.slice().sort((a, b) => b.area - a.area)[0]
const relErr = (got: number, want: number): number => Math.abs(got - want) / Math.abs(want)
const dot = (a: number[], b: number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const angAxis = (a: number[], b: number[]): number => Math.acos(Math.min(1, Math.abs(dot(a, b)))) * 180 / Math.PI

/** 边界环必须闭合：每对相邻（含尾→头）都要係网格上真实存在嘅边。 */
function checkLoopsClosed(res: SegmentationResult): { loops: number; verts: number } {
  const edges = new Set<string>()
  for (let i = 0; i < res.tris.length; i += 3) {
    const a = res.tris[i], b = res.tris[i + 1], c = res.tris[i + 2]
    edges.add(Math.min(a, b) + '_' + Math.max(a, b))
    edges.add(Math.min(b, c) + '_' + Math.max(b, c))
    edges.add(Math.min(a, c) + '_' + Math.max(a, c))
  }
  let loops = 0, verts = 0
  for (const reg of res.regions) {
    for (const lp of reg.boundaryLoops) {
      loops++
      verts += lp.length
      if (lp.length < 3) throw new Error('环少过 3 点（区 ' + reg.index + '）')
      for (let i = 0; i < lp.length; i++) {
        const a = lp[i], b = lp[(i + 1) % lp.length]
        if (a === b) throw new Error('环有重复相邻点（区 ' + reg.index + '）')
        if (!edges.has(Math.min(a, b) + '_' + Math.max(a, b))) {
          throw new Error('环嘅相邻点 ' + a + '→' + b + ' 唔係网格上嘅边（区 ' + reg.index + '，kind ' + reg.kind + '）')
        }
      }
    }
  }
  return { loops, verts }
}

const LOG: string[] = []
const log = (s: string): void => { LOG.push(s) }

/* ══════════════════════════════════════════════════════════ ① 焊接 / 镶嵌自检 */

describe('mesh2brep/焊接', () => {
  it('未焊接 STL 式盒（36 独立顶点）焊返 8 点 12 三角', () => {
    const raw = unweld(makeBox(60, 40, 20))
    expect(raw.v.length / 3).toBe(36)
    const w = weldMesh(raw.v, raw.t)
    expect(w.nv).toBe(8)
    expect(w.nt).toBe(12)
    expect(w.droppedTris).toBe(0)
  })

  it('球极点嘅退化三角会被剔走（唔会毒害法向）', () => {
    const s = makeSphere(15, 24, 12)
    const w = weldMesh(s.v, s.t)
    expect(w.droppedTris).toBe(48)          // 两极各 24 条退化
    expect(w.nt).toBe(24 * 12 * 2 - 48)
  })

  it('镶嵌本身啱：有符号体积 = 解析体积（盒 / 圆柱 / 带孔盒）', () => {
    expect(relErr(signedVolume(makeBox(60, 40, 20)), 60 * 40 * 20)).toBeLessThan(1e-12)
    const cyl = makeCylinder(12, 40, 720)
    expect(relErr(signedVolume(cyl), Math.PI * 144 * 40)).toBeLessThan(1e-4)
    const bh = makeBoxWithHole(60, 40, 20, 22, 17, 6, 96)
    expect(relErr(signedVolume(bh.mesh), (60 * 40 - bh.holeArea) * 20)).toBeLessThan(1e-12)
  })
})

/* ══════════════════════════════════════════════════════════ ② 盒 */

describe('mesh2brep/盒', () => {
  const res = segmentAndFit(unweld(makeBox(60, 40, 20)))
  log(`盒：${res.regions.length} 区，全部 ${res.regions.every((r) => r.kind === 'plane') ? 'plane' : '???'}，最大 RMS ${Math.max(...res.regions.map((r) => r.rmsError)).toExponential(2)}`)

  it('6 个平面区', () => {
    expect(res.regions.length).toBe(6)
    expect(kinds(res, 'plane').length).toBe(6)
  })

  it('每区 RMS = 0（真平面）', () => {
    for (const r of res.regions) expect(r.rmsError).toBeLessThan(1e-12)
  })

  it('法向两两【正交或反平行】= 真直角盒', () => {
    const ns = kinds(res, 'plane').map((r) => (r.params as PlaneParams).normal)
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
      const d = Math.abs(dot(ns[i], ns[j]))
      expect(Math.min(d, Math.abs(d - 1))).toBeLessThan(1e-9)
    }
    // 6 个方向 = ±X ±Y ±Z 各一
    const seen = ns.map((n) => n.map((x) => Math.round(x)).join(',')).sort()
    expect(seen.join('|')).toBe('-1,0,0|0,-1,0|0,0,-1|0,0,1|0,1,0|1,0,0')
  })

  it('每面一个 4 点闭合外环', () => {
    for (const r of res.regions) {
      expect(r.boundaryLoops.length).toBe(1)
      expect(r.boundaryLoops[0].length).toBe(4)
    }
    const c = checkLoopsClosed(res)
    expect(c.loops).toBe(6)
    expect(c.verts).toBe(24)
  })

  it('区邻接图 = 12 条棱', () => {
    expect(res.adjacency.length).toBe(12)
  })
})

/* ══════════════════════════════════════════════════════════ ③ 圆柱 + 盖 */

describe('mesh2brep/圆柱带盖', () => {
  const R = 12, H = 40, SEG = 72
  const res = segmentAndFit(makeCylinder(R, H, SEG))
  const cyl = biggest(kinds(res, 'cylinder'))
  const cp = cyl.params as CylinderParams
  log(`圆柱：${res.regions.length} 区（${kinds(res, 'plane').length} 平面 + ${kinds(res, 'cylinder').length} 圆柱）；r=${cp.radius.toFixed(6)}（真值 ${R}，误差 ${(relErr(cp.radius, R) * 100).toExponential(2)}%）；轴偏 ${angAxis(cp.axis, [0, 0, 1]).toExponential(2)}°；RMS ${cyl.rmsError.toExponential(2)}`)

  it('2 平面 + 1 圆柱', () => {
    expect(res.regions.length).toBe(3)
    expect(kinds(res, 'plane').length).toBe(2)
    expect(kinds(res, 'cylinder').length).toBe(1)
  })

  it('半径 0.1% 内', () => { expect(relErr(cp.radius, R)).toBeLessThan(1e-3) })
  it('轴 = Z（0.01° 内）', () => { expect(angAxis(cp.axis, [0, 0, 1])).toBeLessThan(0.01) })
  it('轴线过原点（0.1% 直径内）', () => {
    const w = [cp.point[0], cp.point[1], cp.point[2]]
    const wa = dot(w, cp.axis)
    const perp = Math.hypot(w[0] - wa * cp.axis[0], w[1] - wa * cp.axis[1], w[2] - wa * cp.axis[2])
    expect(perp).toBeLessThan(R * 2 * 1e-3)
  })
  it('高度范围 = [0,40]、周向闭合（full）', () => {
    expect(cp.hMax - cp.hMin).toBeCloseTo(H, 6)
    expect(cp.full).toBe(true)
    expect(cyl.arcCoverageDeg ?? 0).toBe(360)
  })
  it('凸（法向指离轴）', () => { expect(cp.convex).toBe(true) })
  it('圆柱有 2 个闭合环（上下缘），各 72 点', () => {
    expect(cyl.boundaryLoops.length).toBe(2)
    for (const lp of cyl.boundaryLoops) expect(lp.length).toBe(SEG)
    checkLoopsClosed(res)
  })
  it('平面盖法向 ±Z、RMS = 0', () => {
    for (const p of kinds(res, 'plane')) {
      const pp = p.params as PlaneParams
      expect(Math.abs(Math.abs(pp.normal[2]) - 1)).toBeLessThan(1e-12)
      expect(p.rmsError).toBeLessThan(1e-12)
    }
  })
})

/* ══════════════════════════════════════════════════════════ ④ 球 */

describe('mesh2brep/球', () => {
  const R = 15
  const res = segmentAndFit(makeSphere(R, 64, 32))
  const sph = biggest(kinds(res, 'sphere'))
  const sp = sph.params as SphereParams
  log(`球：${res.regions.length} 区；r=${sp.radius.toFixed(6)}（真值 ${R}，误差 ${(relErr(sp.radius, R) * 100).toExponential(2)}%）；心 (${sp.centre.map((x) => x.toExponential(1)).join(', ')})；RMS ${sph.rmsError.toExponential(2)}`)

  it('单区 = 球', () => {
    expect(res.regions.length).toBe(1)
    expect(res.regions[0].kind).toBe('sphere')
  })
  it('半径 0.1% 内', () => { expect(relErr(sp.radius, R)).toBeLessThan(1e-3) })
  it('球心喺原点（0.1% 半径内）', () => { expect(Math.hypot(sp.centre[0], sp.centre[1], sp.centre[2])).toBeLessThan(R * 1e-3) })
  it('闭合球面 → 冇边界环', () => { expect(sph.boundaryLoops.length).toBe(0) })
})

/* ══════════════════════════════════════════════════════════ ⑤ 圆锥 + 底盖 */

describe('mesh2brep/圆锥带底', () => {
  const R = 10, H = 25, SEG = 64
  const truth = Math.atan2(R, H) * 180 / Math.PI
  const res = segmentAndFit(makeCone(R, H, SEG, 12))
  const cone = biggest(kinds(res, 'cone'))
  const cn = cone.params as ConeParams
  log(`圆锥：${res.regions.length} 区（cone ${kinds(res, 'cone').length} / plane ${kinds(res, 'plane').length}）；半顶角 ${cn.halfAngleDeg.toFixed(5)}°（真值 ${truth.toFixed(5)}°）；顶点 (${cn.apex.map((x) => x.toFixed(5)).join(', ')})（真值 0,0,25）；RMS ${cone.rmsError.toExponential(2)}`)

  it('1 圆锥 + 1 平面', () => {
    expect(kinds(res, 'cone').length).toBe(1)
    expect(kinds(res, 'plane').length).toBe(1)
    expect(res.regions.length).toBe(2)
  })
  it('半顶角 0.1% 内', () => { expect(relErr(cn.halfAngleDeg, truth)).toBeLessThan(1e-3) })
  it('顶点 = (0,0,25)（0.1% 高度内）', () => {
    expect(Math.hypot(cn.apex[0], cn.apex[1], cn.apex[2] - H)).toBeLessThan(H * 1e-3)
  })
  it('轴 = −Z（由顶点指向材料）', () => {
    expect(angAxis(cn.axis, [0, 0, 1])).toBeLessThan(0.01)
    expect(cn.axis[2]).toBeLessThan(0)
  })
  it('底盖平面 = z=0，法向 −Z', () => {
    const pl = biggest(kinds(res, 'plane')).params as PlaneParams
    expect(pl.normal[2]).toBeLessThan(-0.999999)
    expect(Math.abs(pl.d)).toBeLessThan(1e-9)
  })
  it('环闭合', () => { checkLoopsClosed(res) })
})

/* ══════════════════════════════════════════════════════════ ⑥ 带圆柱孔嘅盒 */

describe('mesh2brep/带孔盒', () => {
  const W = 60, D = 40, H = 20, HX = 22, HY = 17, R = 6
  const res = segmentAndFit(makeBoxWithHole(W, D, H, HX, HY, R, 96).mesh)
  const hole = biggest(kinds(res, 'cylinder'))
  const hp = hole.params as CylinderParams
  const hs = hole.paramsSnapped as CylinderParams
  log(`带孔盒：${res.regions.length} 区（plane ${kinds(res, 'plane').length} / cyl ${kinds(res, 'cylinder').length}）；孔 r=${hp.radius.toFixed(6)}（真值 ${R}）；轴偏 Z ${angAxis(hp.axis, [0, 0, 1]).toExponential(2)}°；孔心 (${hp.point[0].toFixed(6)}, ${hp.point[1].toFixed(6)})（真值 ${HX}, ${HY}）；snaps=${res.snaps.length}`)

  it('6 平面 + 1 圆柱孔', () => {
    expect(kinds(res, 'plane').length).toBe(6)
    expect(kinds(res, 'cylinder').length).toBe(1)
    expect(res.regions.length).toBe(7)
  })
  it('孔半径 0.1% 内', () => { expect(relErr(hp.radius, R)).toBeLessThan(1e-3) })
  it('孔轴 ∥ Z 且过 (22,17)', () => {
    expect(angAxis(hp.axis, [0, 0, 1])).toBeLessThan(0.01)
    expect(Math.hypot(hp.point[0] - HX, hp.point[1] - HY)).toBeLessThan(R * 1e-3)
  })
  it('孔 = 凹（法向指向轴）', () => { expect(hp.convex).toBe(false) })
  it('snap 后孔轴【精确】= Z，位置唔飘', () => {
    expect(hs.axis[0]).toBe(0)
    expect(hs.axis[1]).toBe(0)
    expect(hs.axis[2]).toBe(1)
    expect(Math.hypot(hs.point[0] - HX, hs.point[1] - HY)).toBeLessThan(R * 1e-3)
    expect(relErr(hs.radius, R)).toBeLessThan(1e-3)
  })
  it('顶/底面各有 2 个环（外框 + 孔），全部闭合', () => {
    const caps = kinds(res, 'plane').filter((p) => Math.abs(Math.abs((p.params as PlaneParams).normal[2]) - 1) < 1e-9)
    expect(caps.length).toBe(2)
    for (const c of caps) expect(c.boundaryLoops.length).toBe(2)
    checkLoopsClosed(res)
  })
})

/* ══════════════════════════════════════════════════════════ ⑦ 噪声圆柱 */

describe('mesh2brep/噪声圆柱（±0.2% 半径抖动）', () => {
  const R = 12, H = 40
  const res = segmentAndFit(makeCylinder(R, H, 64, { jitter: 0.002, seed: 7, rings: 6 }))
  const cyl = biggest(kinds(res, 'cylinder'))
  const cp = cyl.params as CylinderParams
  log(`噪声圆柱：${res.regions.length} 区；r=${cp.radius.toFixed(6)}（真值 ${R}，误差 ${(relErr(cp.radius, R) * 100).toFixed(4)}%）；轴偏 ${angAxis(cp.axis, [0, 0, 1]).toFixed(4)}°；RMS ${cp.radius > 0 ? cyl.rmsError.toFixed(5) : '?'}（抖动幅度 ${(R * 0.002).toFixed(4)}）`)

  it('照样识别到圆柱', () => { expect(kinds(res, 'cylinder').length).toBeGreaterThanOrEqual(1) })
  it('半径 0.3% 内（噪声下）', () => { expect(relErr(cp.radius, R)).toBeLessThan(3e-3) })
  it('轴仍然 ∥ Z（0.5° 内）', () => { expect(angAxis(cp.axis, [0, 0, 1])).toBeLessThan(0.5) })
  it('RMS 同抖动幅度同一量级（唔係擬崩）', () => {
    expect(cyl.rmsError).toBeLessThan(R * 0.002)
    expect(cyl.rmsError).toBeGreaterThan(0)
  })
  it('圆柱区食晒侧壁（≥90% 侧面三角）', () => {
    expect(cyl.triCount).toBeGreaterThan(64 * 6 * 2 * 0.9)
  })
})

/* ══════════════════════════════════════════════════════════ ⑧ ★ G1 圆角带 ★ */

describe('mesh2brep/G1 圆角带（曲率判据）', () => {
  const RF = 4, L = 20, LY = 30
  const res = segmentAndFit(makeFilletStrip(RF, L, LY, 24, 6, 8))
  const cyl = biggest(kinds(res, 'cylinder'))
  const cp = cyl.params as CylinderParams
  log(`圆角带：${res.regions.length} 区（plane ${kinds(res, 'plane').length} / cyl ${kinds(res, 'cylinder').length}），合并 ${res.stats.merges} 次；圆角 r=${cp.radius.toFixed(6)}（真值 ${RF}）；轴偏 Y ${angAxis(cp.axis, [0, 1, 0]).toExponential(2)}°；isBlend=${cyl.isBlend === true}`)

  it('切成 3 区：平面 | 圆角 | 平面（★ 纯法向 growing 做唔到 ★）', () => {
    expect(res.regions.length).toBe(3)
    expect(kinds(res, 'plane').length).toBe(2)
    expect(kinds(res, 'cylinder').length).toBe(1)
  })
  it('圆角半径 0.1% 内、轴 ∥ Y', () => {
    expect(relErr(cp.radius, RF)).toBeLessThan(1e-3)
    expect(angAxis(cp.axis, [0, 1, 0])).toBeLessThan(0.01)
  })
  it('圆角轴线过 (0,·,0)', () => {
    expect(Math.hypot(cp.point[0], cp.point[2])).toBeLessThan(RF * 1e-3)
  })
  it('标记为 blend（圆角带）', () => {
    expect(cyl.isBlend === true).toBe(true)
    expect(relErr(cyl.blendRadius ?? 0, RF)).toBeLessThan(1e-3)
  })
  it('两块平面 = z=rf 同 x=rf', () => {
    const pls = kinds(res, 'plane').map((p) => p.params as PlaneParams)
    const top = pls.find((p) => Math.abs(p.normal[2] - 1) < 1e-6)
    const side = pls.find((p) => Math.abs(p.normal[0] - 1) < 1e-6)
    expect(top ? top.d : -1).toBeCloseTo(RF, 9)
    expect(side ? side.d : -1).toBeCloseTo(RF, 9)
  })
  it('弧覆盖 ≈ 90°、唔标病态', () => {
    expect(Math.abs((cyl.arcCoverageDeg ?? 0) - 90)).toBeLessThanOrEqual(5)
    expect(cyl.illConditioned === true).toBe(false)
  })
  it('环闭合', () => { checkLoopsClosed(res) })
})

/* ══════════════════════════════════════════════════════════ ⑨ 圆环面圆角（凸台底 blend） */

describe('mesh2brep/圆环面圆角（plane→torus→cylinder G1 链）', () => {
  const R = 10, RF = 3, H = 20, OUT = 25
  const mesh = makeFilletedBoss(R, RF, H, OUT, 96, 16)
  const res = segmentAndFit(mesh)
  const tor = biggest(kinds(res, 'torus'))
  const tp = tor.params as TorusParams
  log(`凸台圆角：${res.regions.length} 区（plane ${kinds(res, 'plane').length} / cyl ${kinds(res, 'cylinder').length} / torus ${kinds(res, 'torus').length}）；major=${tp.majorRadius.toFixed(6)}（真值 ${R + RF}）minor=${tp.minorRadius.toFixed(6)}（真值 ${RF}）；心 (${tp.centre.map((x) => x.toFixed(5)).join(', ')})（真值 0,0,${RF}）；凹凸 convex=${tp.convex}`)

  it('镶嵌係外向闭合实体', () => { expect(signedVolume(mesh)).toBeGreaterThan(0) })
  it('切成 6 区：3 平面 + 2 圆柱 + 1 圆环面', () => {
    expect(res.regions.length).toBe(6)
    expect(kinds(res, 'plane').length).toBe(3)
    expect(kinds(res, 'cylinder').length).toBe(2)
    expect(kinds(res, 'torus').length).toBe(1)
  })
  it('圆环面 major/minor 0.1% 内、轴 = Z、心 = (0,0,rf)', () => {
    expect(relErr(tp.majorRadius, R + RF)).toBeLessThan(1e-3)
    expect(relErr(tp.minorRadius, RF)).toBeLessThan(1e-3)
    expect(angAxis(tp.axis, [0, 0, 1])).toBeLessThan(0.01)
    expect(Math.hypot(tp.centre[0], tp.centre[1], tp.centre[2] - RF)).toBeLessThan(RF * 1e-3)
  })
  it('标记为 blend + 凹（圆角填角，法向指向 spine）', () => {
    expect(tor.isBlend === true).toBe(true)
    expect(tp.convex).toBe(false)
  })
  it('凸台圆柱 r=10 凸、板外壁 r=25 凸', () => {
    const rs = kinds(res, 'cylinder').map((c) => c.params as CylinderParams).sort((a, b) => a.radius - b.radius)
    expect(relErr(rs[0].radius, R)).toBeLessThan(1e-3)
    expect(relErr(rs[1].radius, OUT)).toBeLessThan(1e-3)
    expect(rs[0].convex).toBe(true)
    expect(rs[1].convex).toBe(true)
  })
  it('板面係带孔环面（2 个闭合环）', () => {
    const annulus = kinds(res, 'plane').filter((p) => p.boundaryLoops.length === 2)
    expect(annulus.length).toBe(1)
    checkLoopsClosed(res)
  })
})

/* ══════════════════════════════════════════════════════════ ⑩ snap */

describe('mesh2brep/约束 snap', () => {
  const res = segmentAndFit(makeCylinder(12, 40, 72, { tiltDeg: 0.5 }))
  const cyl = biggest(kinds(res, 'cylinder'))
  const raw = cyl.params as CylinderParams
  const snapped = cyl.paramsSnapped as CylinderParams
  log(`snap：raw 轴 (${raw.axis.map((x) => x.toFixed(6)).join(', ')}) 偏 Z ${angAxis(raw.axis, [0, 0, 1]).toFixed(4)}° → snapped (${snapped.axis.join(', ')})；共 ${res.snaps.length} 条 snap：${res.snaps.map((s) => s.kind).join(', ')}`)

  it('raw 轴真係倾斜咗 0.5°', () => {
    expect(Math.abs(angAxis(raw.axis, [0, 0, 1]) - 0.5)).toBeLessThan(0.01)
  })
  it('snap 后轴【精确】= (0,0,1)', () => {
    expect(snapped.axis[0]).toBe(0)
    expect(snapped.axis[1]).toBe(0)
    expect(snapped.axis[2]).toBe(1)
  })
  it('snap 后半径重擬合（唔係净扭个向量）', () => {
    expect(relErr(snapped.radius, 12)).toBeLessThan(2e-3)
  })
  it('两块盖法向都 snap 到 ±Z', () => {
    for (const p of kinds(res, 'plane')) {
      const sp = p.paramsSnapped as PlaneParams
      expect(Math.abs(sp.normal[0]) + Math.abs(sp.normal[1])).toBe(0)
      expect(Math.abs(sp.normal[2])).toBe(1)
    }
  })
  it('snap 记录逐条可覆核（kind + before/after）', () => {
    const ag = res.snaps.filter((s) => s.kind === 'axisGlobal')
    expect(ag.length).toBe(3)
    for (const s of ag) {
      expect(s.applied).toBe(true)
      expect(Math.abs(s.before - 0.5)).toBeLessThan(0.02)
    }
  })
  it('raw 参数冇被 snap 污染（两套并存）', () => {
    expect(raw.axis[2] === 1).toBe(false)
  })
})

/* ══════════════════════════════════════════════════════════ ⑩ 性能 smoke */

describe('mesh2brep/性能', () => {
  const SEG = 1200, RINGS = 20
  const mesh = makeCylinder(12, 40, SEG, { rings: RINGS })
  const nTri = mesh.t.length / 3
  const t0 = performance.now()
  const res = segmentAndFit(mesh)
  const ms = performance.now() - t0
  log(`性能：${nTri} 三角 → ${res.regions.length} 区，${ms.toFixed(0)}ms（分割 ${res.stats.msSegment.toFixed(0)} + 擬合 ${res.stats.msFit.toFixed(0)}）；焊接后 ${res.stats.weldedVerts} 点`)

  it('≥ 50k 三角', () => { expect(nTri).toBeGreaterThanOrEqual(50000) })
  it('分割 + 擬合 < 3s', () => { expect(ms).toBeLessThan(3000) })
  it('结果照样啱（2 平面 + 1 圆柱，半径 0.1% 内）', () => {
    expect(res.regions.length).toBe(3)
    const cp = biggest(kinds(res, 'cylinder')).params as CylinderParams
    expect(relErr(cp.radius, 12)).toBeLessThan(1e-3)
  })
})

/* ══════════════════════════════════ 迷你 runner 嘅收尾（有 host 就唔会行） */

if (!useHost) {
  const failed = cases.filter((c) => c.error !== null)
  for (const line of LOG) console.log('    · ' + line)
  console.log('')
  for (const c of cases) console.log((c.error === null ? 'ok   ' : 'FAIL ') + c.name + (c.error ? '\n       ' + c.error : ''))
  console.log('\n' + (cases.length - failed.length) + '/' + cases.length + ' passed')
  if (failed.length) {
    const proc = (globalThis as { process?: { exitCode?: number } }).process
    if (proc) proc.exitCode = 1
  }
}
