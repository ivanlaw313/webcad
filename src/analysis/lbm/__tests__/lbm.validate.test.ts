// GPU LBM 求解器嘅【物理验收】。呢啲 fixture 就係 Stage 6 嘅闸：唔过就唔好接 UI。
//
// 点跑
// ────
//     node --experimental-strip-types src/analysis/lbm/__tests__/lbm.validate.test.ts
//
// （同 lbm.selfcheck.test.ts 一样：冇装 vitest，harness 会喺 runtime 自动拣。）
//
//
// ★★ HEADLESS 现实 ★★
// ───────────────────
// 呢个环境冇 GPU，开唔到 WebGL2 context。所以文件係咁样劏开嘅：
//
//   · 唔使 GL 就验得到嘅嘢 —— 域建构、atlas 映射、单位换算、★ 半格约定嘅解析验证 ★、
//     uniform 推导、tier 拣选、VRAM 帐 —— 全部【喺 CPU 度真係跑】。
//   · 一定要 GL 嘅 fixture（空盒守恒、球 vs Clift-Gauvin、GPU 侧 3D resolve、
//     GPU 力金字塔）会侦测到冇 context，然后【大声 SKIP】—— 唔係静静鸡当 pass。
//
// 跑完个 summary 会分开数「跑咗」同「跳咗」。跳咗嗰啲 = 未验证过，唔可以当验证过。

import * as LAT from '../lattice.ts'
import * as ATLAS from '../atlas.ts'
import * as SH from '../shaders.ts'
import * as SDF from '../sdfBake.ts'
import * as GPU from '../lbmGpu.ts'
import { probeMRT } from '../probeMRT.ts'
import { WebGLRenderer } from 'three'

/* ══════════════════════════════════════════════════ HARNESS（装咗 vitest 就删呢段） */

// ⚠ 呢个文件【冇用 expect】—— 全部断言都係下面嗰个 assert()，因为一句
//   「expected true to be true」对 debug 物理係零帮助，而 assert 讲得出【点解】。
//   describe/it 就照旧：装咗 vitest 嘅话会自动用返 host 嗰对。
type Body = () => void

interface Harness {
  describe: (name: string, body: Body) => void
  it: (name: string, body: Body) => void
  expect: (actual: unknown) => unknown
}

const HOST = globalThis as unknown as Partial<Harness>
const useHost = typeof HOST.describe === 'function' && typeof HOST.it === 'function' && typeof HOST.expect === 'function'

const cases: { name: string; error: string | null }[] = []
const skipped: string[] = []
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

const describe = useHost && HOST.describe ? HOST.describe : localDescribe
const it = useHost && HOST.it ? HOST.it : localIt

/** 直接掟错嘅断言 —— 比 expect(cond).toBe(true) 有用一万倍，因为讲得出【点解】。 */
function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg) }
function close(a: number, b: number, tol: number, msg: string): void {
  if (!(Math.abs(a - b) <= tol)) throw new Error(msg + '：' + a + ' vs ' + b + '（容差 ' + tol + '）')
}
function rel(a: number, b: number, frac: number, msg: string): void {
  const tol = Math.abs(b) * frac + 1e-12
  if (!(Math.abs(a - b) <= tol)) throw new Error(msg + '：' + a + ' vs ' + b + '（±' + (frac * 100).toFixed(0) + '%）')
}

/* ══════════════════════════════════════════════════════════ GL 侦测 */

interface GlEnv { gl: WebGL2RenderingContext; canvas: HTMLCanvasElement }

const GL: GlEnv | null = (() => {
  try {
    const doc = (globalThis as { document?: { createElement?: (t: string) => unknown } }).document
    if (!doc || typeof doc.createElement !== 'function') return null
    const canvas = doc.createElement('canvas') as HTMLCanvasElement
    canvas.width = 64; canvas.height = 64
    const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null
    if (!gl) return null
    return { gl, canvas }
  } catch { return null }
})()

const GL_REASON = GL
  ? 'WebGL2 OK'
  : '呢个环境开唔到 WebGL2 context（headless node，冇 GPU）'

/** 要 GL 嘅 fixture。冇 GL 就【大声跳过】—— 唔係静静鸡当 pass。 */
function itGl(name: string, body: (env: GlEnv) => void): void {
  if (!GL) {
    skipped.push(suite.concat(name).join(' > '))
    it('[SKIPPED · 冇 GPU] ' + name, () => {
      console.warn('⚠ 跳过（未验证）：' + name + ' —— ' + GL_REASON)
    })
    return
  }
  it(name, () => body(GL))
}

/* ══════════════════════════════════════════════════════════ 小工具 */

/**
 * 把一个球体直接光栅化成 voxelize() 出嚟嗰个形状嘅嘢。
 *
 * 点解唔 call voxelize()：voxelfea.ts 用【冇后缀】嘅 import，
 * `node --experimental-strip-types` 解唔到 → 成个测试 headless 跑唔到。
 * 球体嘅体素化本身唔係我哋要测嘅嘢（voxelfea 有自己嘅测试）。
 */
function sphereGrid(res: number, diameterMM = 100): SDF.VoxelGridLike {
  const n = res
  const h = diameterMM / n
  const solid = new Uint8Array(n * n * n)
  const c = (n - 1) / 2, r = n / 2
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const dx = i - c, dy = j - c, dz = k - c
    if (dx * dx + dy * dy + dz * dz <= (r - 0.5) * (r - 0.5)) solid[i + n * (j + n * k)] = 1
  }
  return { h, nx: n, ny: n, nz: n, ox: 0, oy: 0, oz: 0, solid }
}

/** 一件长方体（薄板 / 立方体都由呢度嚟）。 */
function boxGrid(nx: number, ny: number, nz: number, h = 1): SDF.VoxelGridLike {
  const solid = new Uint8Array(nx * ny * nz).fill(1)
  return { h, nx, ny, nz, ox: 0, oy: 0, oz: 0, solid }
}

/**
 * 球嘅标准阻力曲线，Clift & Gauvin (1971)。
 *
 *   Cd = 24/Re (1 + 0.15 Re^0.687) + 0.42 / (1 + 4.25e4 Re^-1.16)
 *
 * Re < 3e5 之内准到 ±6% —— 即係除咗 drag crisis（边界层转捩）之外都准，
 * 而 drag crisis 呢条相关式冇打算处理，任何粗网格 LES 一样重现唔到。
 */
function sphereCd(Re: number): number {
  if (Re <= 0) return Infinity
  if (Re < 0.1) return 24 / Re                                    // Stokes
  return (24 / Re) * (1 + 0.15 * Math.pow(Re, 0.687)) + 0.42 / (1 + 4.25e4 * Math.pow(Re, -1.16))
}

/**
 * 一个【冇零件】嘅立方域，畀周期盒守恒 fixture 用。
 * 手砌而唔係 buildDomain()：buildDomain 一定要有零件先有迎风面积，而呢个 fixture 嘅重点
 * 就係「乜都冇嘅时候会唔会生嘢出嚟」。
 */
function emptyDomain(n: number): SDF.WindDomain {
  return {
    DX: n, DY: n, DZ: n, cells: n * n * n,
    padUp: 0, padDown: 0, padA: 0, padB: 0,
    fa: 0, ca: 1, cb: 2, sign: 1,
    nFlow: 0, nA: 0, nB: 0, h: 1,
    obst: new Uint8Array(n * n * n),
    frontalCells: 1, frontalAreaMM2: 1, dLb: n / 4, refLenM: 0.001,
    bodyCentre: [n / 2, n / 2, n / 2],
    volMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  }
}

/** 借用测试自己开嗰个 context 起 three renderer（唔好另开一个，driver 会唔够 context）。 */
function makeRenderer(env: GlEnv): WebGLRenderer {
  return new WebGLRenderer({ canvas: env.canvas, context: env.gl, antialias: false })
}

/** reduceShaderSource() 嘅【一模一样】嘅 CPU 版：每 pass 两轴各 sum 4 倍。 */
function reduce4(src: Float32Array, w: number, h: number): number {
  let a = src, aw = w, ah = h
  let guard = 0
  while ((aw > 1 || ah > 1) && guard++ < 32) {
    const nw = Math.max(1, Math.ceil(aw / 4)), nh = Math.max(1, Math.ceil(ah / 4))
    const out = new Float32Array(nw * nh)
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      let s = 0
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const px = x * 4 + i, py = y * 4 + j
        if (px >= aw || py >= ah) continue                        // shader 入面嗰句 guard
        s += a[py * aw + px]
      }
      out[y * nw + x] = s
    }
    a = out; aw = nw; ah = nh
  }
  return a[0]
}

/** clamp-to-edge 三线性抽样，texel i 嘅中心喺 texcoord (i+0.5)/N。 */
function sample3D(vol: Float32Array, N: [number, number, number], comp: number, nComp: number, uvw: [number, number, number]): number {
  const t = [uvw[0] * N[0] - 0.5, uvw[1] * N[1] - 0.5, uvw[2] * N[2] - 0.5]
  const i0 = [Math.floor(t[0]), Math.floor(t[1]), Math.floor(t[2])]
  const f = [t[0] - i0[0], t[1] - i0[1], t[2] - i0[2]]
  const cl = (v: number, n: number) => (v < 0 ? 0 : v > n - 1 ? n - 1 : v)
  let acc = 0
  for (let b = 0; b < 8; b++) {
    const ix = cl(i0[0] + (b & 1), N[0])
    const iy = cl(i0[1] + ((b >> 1) & 1), N[1])
    const iz = cl(i0[2] + ((b >> 2) & 1), N[2])
    const w = ((b & 1) ? f[0] : 1 - f[0]) * (((b >> 1) & 1) ? f[1] : 1 - f[1]) * (((b >> 2) & 1) ? f[2] : 1 - f[2])
    acc += w * vol[((iz * N[1] + iy) * N[0] + ix) * nComp + comp]
  }
  return acc
}

/* ══════════════════════════════════════════════════════════════ 域建构 */

describe('lbm/域建构：同 windtunnel.ts【逐条数式一样】', () => {
  it('padding 公式同 CPU 参考解一致', () => {
    const g = boxGrid(20, 12, 8)
    const d = SDF.buildDomain(g)
    // 独立重算（windtunnel.ts §2）
    const dims = [20, 12, 8]
    const fa = 0, ca = 1, cb = 2
    const nFlow = dims[fa], nA = dims[ca], nB = dims[cb]
    const crossMax = Math.max(nA, nB)
    const padUp = Math.round(0.4 * crossMax) + 4
    const padDown = Math.round(1.2 * crossMax) + 6
    const padA = Math.round(0.45 * nA) + 4
    const padB = Math.round(0.45 * nB) + 4
    assert(d.fa === fa && d.ca === ca && d.cb === cb, '来流轴应该係最长轴')
    assert(d.padUp === padUp && d.padDown === padDown, '上下游边距唔啱：' + d.padUp + '/' + d.padDown)
    assert(d.padA === padA && d.padB === padB, '侧边距唔啱')
    assert(d.DX === padUp + nFlow + padDown, 'DX 唔啱')
    assert(d.DY === nA + 2 * padA && d.DZ === nB + 2 * padB, 'DY/DZ 唔啱')
  })

  it('零件真係摆咗入去，而且只喺测试段', () => {
    const g = boxGrid(10, 6, 6)
    const d = SDF.buildDomain(g)
    let n = 0
    for (let i = 0; i < d.obst.length; i++) if (d.obst[i]) n++
    assert(n === 10 * 6 * 6, '障碍格数 ' + n + ' != 体素数 360')
    const idx = (x: number, y: number, z: number) => x + d.DX * (y + d.DY * z)
    assert(d.obst[idx(d.padUp, d.padA, d.padB)] === 1, '零件嘅第一格应该喺 (padUp, padA, padB)')
    assert(d.obst[idx(d.padUp - 1, d.padA, d.padB)] === 0, '上游边距入面唔可以有零件')
    assert(d.obst[idx(d.padUp + 10, d.padA, d.padB)] === 0, '下游边距入面唔可以有零件')
  })

  it('★ sign = -1 会沿流轴翻转零件（唔係翻转个域）', () => {
    // 一件唔对称嘅零件：只填流轴嘅头两层
    const nx = 8, ny = 4, nz = 4
    const solid = new Uint8Array(nx * ny * nz)
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < 2; i++) solid[i + nx * (j + ny * k)] = 1
    const g: SDF.VoxelGridLike = { h: 1, nx, ny, nz, ox: 0, oy: 0, oz: 0, solid }
    const p = SDF.buildDomain(g, { sign: 1 })
    const m = SDF.buildDomain(g, { sign: -1 })
    const at = (d: SDF.WindDomain, x: number) => d.obst[x + d.DX * (d.padA + d.DY * d.padB)]
    assert(at(p, p.padUp) === 1 && at(p, p.padUp + 7) === 0, '+1：零件嘅厚头应该喺上游')
    assert(at(m, m.padUp) === 0 && at(m, m.padUp + 7) === 1, '-1：零件嘅厚头应该喺下游')
  })

  it('volMatrix 把 lattice cell-centre 送返 CAD mm', () => {
    const g: SDF.VoxelGridLike = { h: 2.5, nx: 6, ny: 4, nz: 4, ox: 11, oy: -3, oz: 7, solid: new Uint8Array(6 * 4 * 4).fill(1) }
    for (const sign of [1, -1] as const) {
      const d = SDF.buildDomain(g, { sign })
      const M = d.volMatrix
      const map = (p: [number, number, number]): [number, number, number] => [
        M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + M[3],
        M[4] * p[0] + M[5] * p[1] + M[6] * p[2] + M[7],
        M[8] * p[0] + M[9] * p[1] + M[10] * p[2] + M[11],
      ]
      // 零件第一个体素 (0,0,0) 嘅 CAD 中心 = (ox+0.5h, oy+0.5h, oz+0.5h)
      const flowIdx0 = sign > 0 ? 0 : d.nFlow - 1
      const lat: [number, number, number] = [d.padUp + flowIdx0 + 0.5, d.padA + 0.5, d.padB + 0.5]
      const cad = map(lat)
      close(cad[0], 11 + 0.5 * 2.5, 1e-9, 'sign=' + sign + ' X')
      close(cad[1], -3 + 0.5 * 2.5, 1e-9, 'sign=' + sign + ' Y')
      close(cad[2], 7 + 0.5 * 2.5, 1e-9, 'sign=' + sign + ' Z')
    }
  })

  it('迎风面积同特征长度（球）', () => {
    const g = sphereGrid(24, 100)
    const d = SDF.buildDomain(g)
    // 球嘅迎风投影 = πr²，r = 12 格 → ~452 格（体素化会略细）
    rel(d.frontalCells, Math.PI * 12 * 12, 0.12, '球嘅迎风格数')
    // 等效直径应该返回 ~24 格
    rel(d.dLb, 24, 0.08, '迎风等效直径（格）')
    // 特征长度 m：D = 100mm → 0.1 m
    rel(d.refLenM, 0.1, 0.08, '特征长度 m')
  })

  it('冇零件都唔会除零', () => {
    const g: SDF.VoxelGridLike = { h: 1, nx: 4, ny: 4, nz: 4, ox: 0, oy: 0, oz: 0, solid: new Uint8Array(64) }
    const d = SDF.buildDomain(g)
    assert(d.frontalCells === 1, '空零件应该钳到 1 格迎风面积，唔係 0')
    assert(Number.isFinite(d.dLb) && d.dLb > 0, 'dLb 应该有限')
  })
})

/* ══════════════════════════════════════════════════════ 分辨率规划 / tier */

describe('lbm/tier 拣选 + VRAM 帐', () => {
  it('tier 由细到大，而且 substeps 合理', () => {
    const t = GPU.QUALITY_TIERS
    for (let i = 1; i < t.length; i++) {
      assert(t[i].nx * t[i].ny * t[i].nz > t[i - 1].nx * t[i - 1].ny * t[i - 1].nz, 'tier 冇由细到大排')
    }
    assert(t[0].nx === 96 && t[1].nx === 128 && t[2].nx === 160, 'tier 尺寸同 Stage 5 规格唔一致')
    for (const q of t) assert(q.substeps >= 1 && q.substeps <= 16, 'substeps 离谱：' + q.substeps)
  })

  it('planResolution 拣到最高而又装得落嘅分辨率', () => {
    for (const tier of GPU.QUALITY_TIERS) {
      const plan = SDF.planResolution([100, 60, 60], tier)
      assert(plan.fits, tier.name + '：一件普通零件都装唔落')
      assert(plan.DX <= tier.nx && plan.DY <= tier.ny && plan.DZ <= tier.nz,
        tier.name + '：域 ' + [plan.DX, plan.DY, plan.DZ] + ' 爆咗预算 ' + [tier.nx, tier.ny, tier.nz])
      // 再高一级就一定爆（即係我哋真係拣到「最高」嗰个）
      const bigger = SDF.planResolution([100, 60, 60], tier, { maxRes: plan.res + 1, minRes: plan.res + 1 })
      assert(!bigger.fits, tier.name + '：res=' + (plan.res + 1) + ' 都仲装得落，即係我哋拣得太保守')
    }
  })

  it('planResolution 预测嘅 nx/ny/nz 同 voxelize 嘅取整规则一致', () => {
    const ext: [number, number, number] = [123.4, 45.6, 78.9]
    const plan = SDF.planResolution(ext, GPU.QUALITY_TIERS[2])
    const h = Math.max(...ext) / plan.res
    assert(plan.nx === Math.max(1, Math.ceil(ext[0] / h - 1e-9)), 'nx 预测唔啱')
    assert(plan.ny === Math.max(1, Math.ceil(ext[1] / h - 1e-9)), 'ny 预测唔啱')
    assert(plan.nz === Math.max(1, Math.ceil(ext[2] / h - 1e-9)), 'nz 预测唔啱')
    const d = SDF.predictDomain(plan.nx, plan.ny, plan.nz)
    assert(d.DX === plan.DX && d.DY === plan.DY && d.DZ === plan.DZ, 'predictDomain 同 planResolution 唔一致')
  })

  it('★ VRAM 帐同实测数吻合（force measurement 永远开）', () => {
    // 参考实测：120×60×60 带力量测 ~105 MB；160×80×80 ~262 MB
    const a = GPU.vramBytesFor(120, 60, 60, true) as GPU.VramBreakdown
    const b = GPU.vramBytesFor(160, 80, 80, true) as GPU.VramBreakdown
    rel(a.total / 1e6, 105, 0.25, '120×60×60 嘅 VRAM')
    rel(b.total / 1e6, 262, 0.25, '160×80×80 嘅 VRAM')
    // 分布场係最大嗰嚿，force/torque 係第二大
    assert(a.dist > a.aux && a.dist > a.vol, '分布场应该係最大嗰笔')
    const noMeasure = GPU.vramBytesFor(160, 80, 80, false)
    assert(b.total - noMeasure.total > 30e6, '开力量测应该多用两张全 atlas RGBA32F（160³ ≈ +34 MB）')
  })

  it('pickTier 喺细屏 / 细内存会主动降级', () => {
    const fake = (maxTex: number): GPU.MrtReport => ({
      ...probeMRT(null), webgl2: true, ok: true, force7: true, maxTextureSize: maxTex,
    })
    assert(GPU.pickTier(fake(4096)).name === 'low', 'MAX_TEXTURE_SIZE 4096 应该开 low')
    assert(GPU.pickTier(fake(16384), { lowPower: true }).name === 'low', 'lowPower 应该开 low')
    assert(GPU.pickTier(fake(16384), { deviceMemoryGB: 4 }).name === 'low', '4 GB 应该开 low')
    assert(GPU.pickTier(fake(16384), { deviceMemoryGB: 8 }).name === 'medium', '8 GB 应该开 medium')
    assert(GPU.pickTier(fake(16384)).name === 'high', '冇提示应该开最大')
  })
})

/* ══════════════════════════════════════════════════════ uniform 推导 */

describe('lbm/uniform 推导：物理落地嘅地方', () => {
  const dom = SDF.buildDomain(sphereGrid(24, 100))

  it('omega / nu 来回一致，而且 omega_plus 唔会过界', () => {
    for (const speed of [0.5, 5, 30, 120]) {
      const f = GPU.deriveFlow(dom, { speed, rho: 1.204, mu: 1.81e-5 })
      close(LAT.nuFromOmega(f.omegaPlus), f.nuLb, 1e-12 + f.nuLb * 1e-9, 'nu ↔ omega 来回')
      assert(f.omegaPlus > 0 && f.omegaPlus <= GPU.OMEGA_PLUS_MAX + 1e-12,
        'omega_plus=' + f.omegaPlus + ' 超出 (0, ' + GPU.OMEGA_PLUS_MAX + ']')
      close(f.reLbEffective, LAT.U_LB * dom.dLb / f.nuLb, 1e-6, '有效格子 Re')
    }
  })

  it('★ uMagic 係由【钉死嘅 omega_minus】反推，唔係钉死 Lambda', () => {
    const f = GPU.deriveFlow(dom, { speed: 60, rho: 1.204, mu: 1.81e-5 })
    // 由 magic 反推返 omega_minus，一定要係 0.8
    close(LAT.omegaMinusFromLambda(f.omegaPlus, f.magic), LAT.OMEGA_MINUS, 1e-9, 'omega_minus 反推')
    assert(f.omegaMinus === LAT.OMEGA_MINUS, 'omega_minus 应该係钉死嗰个')
    // ★ 反面教材：钉死 Lambda = 3/16 嘅话，同一个 omega_plus 之下 omega_minus 会冧到接近零，
    //   奇非平衡模态无阻尼咁长大 → omega_plus >= 1.95 就 NaN（lattice.ts 有实测表）。
    const bad = LAT.omegaMinusFromLambda(f.omegaPlus, LAT.MAGIC.WALL)
    assert(bad < 0.2, '如果钉 Lambda=3/16 都仲有 omega_minus=' + bad + '，咁 lattice.ts 嗰段注释就写错咗')
    assert(f.omegaMinus > bad * 3, '我哋钉嘅 omega_minus 应该远远高过钉 Lambda 嗰个')
  })

  it('★ 涡黏拉低 omega_plus 之后，omega_minus 应该【升】唔係跌', () => {
    const f = GPU.deriveFlow(dom, { speed: 60, rho: 1.204, mu: 1.81e-5 })
    // shader 入面：wm = 1 / (uMagic / (1/wp - 0.5) + 0.5)，wp 已经被 Smagorinsky 拉低
    const wm = (wp: number) => 1 / (f.magic / (1 / wp - 0.5) + 0.5)
    assert(wm(f.omegaPlus * 0.85) > wm(f.omegaPlus),
      '次网格模型必须令 omega_minus 离开危险角落，唔係推佢入去')
  })

  it('格子 Re 钳入稳定带，而且【同 windtunnel.ts 同一个带】', () => {
    assert(GPU.RE_LB_MIN === 6 && GPU.RE_LB_MAX === 800, '稳定带同 CPU 参考解唔同 → 两边 Cd 冇得比')
    const slow = GPU.deriveFlow(dom, { speed: 1e-4, rho: 1.204, mu: 1.81e-5 })
    const fast = GPU.deriveFlow(dom, { speed: 400, rho: 998, mu: 1.0e-3 })
    assert(slow.reLbTarget === GPU.RE_LB_MIN, '低 Re 要钳到下限')
    assert(fast.reLbTarget === GPU.RE_LB_MAX, '高 Re 要钳到上限')
    assert(slow.reClamped && fast.reClamped, '钳咗就要老实讲')
    assert(fast.warnings.length > 0, '钳咗要有 warning 出俾用户')
  })

  it('入口余弦渐升：0 → 1，两头都平滑', () => {
    const n = 400
    assert(GPU.inletRamp(0, n) === 0, '第 0 步应该係 0')
    close(GPU.inletRamp(n / 2, n), 0.5, 1e-12, '中点应该係 0.5')
    assert(GPU.inletRamp(n, n) === 1 && GPU.inletRamp(n * 3, n) === 1, '渐升完之后应该钉死 1')
    let prev = -1
    for (let s = 0; s <= n; s += 7) { const r = GPU.inletRamp(s, n); assert(r >= prev, '渐升唔单调'); prev = r }
    // 两头嘅斜率应该趋近零（余弦渐升嘅重点）
    const d0 = GPU.inletRamp(1, n) - GPU.inletRamp(0, n)
    const dm = GPU.inletRamp(n / 2 + 1, n) - GPU.inletRamp(n / 2, n)
    assert(d0 < dm * 0.05, '起步斜率应该远细过中段（否则就係冲击启动）')
  })

  it('海绵层由 NX - SPONGE_CELLS 起', () => {
    const f = GPU.deriveFlow(dom, { speed: 10, rho: 1.204, mu: 1.81e-5 })
    assert(f.spongeStart === dom.DX - SH.SPONGE_CELLS, '海绵起点唔啱')
    assert(f.spongeStart > dom.padUp + dom.nFlow, '海绵层唔可以食到零件')
    assert(f.spongeStrength === SH.SPONGE_STRENGTH, '海绵强度应该用 shaders.ts 嗰个')
  })

  it('渐升步数至少覆盖 0.6 个域长', () => {
    const f = GPU.deriveFlow(dom, { speed: 10, rho: 1.204, mu: 1.81e-5 })
    assert(f.rampSteps >= 0.6 * dom.DX / LAT.U_LB - 1, '渐升太短，流场未行到出口就已经全速')
    assert(f.rampSteps >= GPU.RAMP_MIN_STEPS, '细域都要有个最低渐升步数')
  })
})

/* ══════════════════════════════════════════════════════ (c) 半格约定 */

describe('lbm/(c) 半格约定：atlas → 3D resolve → 抽样', () => {
  // 线性场 → 三线性插值係【精确】嘅，所以任何偏差都係约定错，唔係插值误差
  const N: [number, number, number] = [11, 7, 5]
  const A = ATLAS.layout(N[0], N[1], N[2])
  const field = (p: [number, number, number]): [number, number, number] =>
    [0.3 + 0.017 * p[0], -0.2 + 0.031 * p[1], 0.05 - 0.023 * p[2]]

  /** 写入 atlas（cell (x,y,z) 嘅值 = 场喺【格心】(x+0.5,y+0.5,z+0.5) 嘅值）。 */
  const atlas = (() => {
    const buf = new Float32Array(A.width * A.height * 4)
    for (let z = 0; z < N[2]; z++) for (let y = 0; y < N[1]; y++) for (let x = 0; x < N[0]; x++) {
      const t = ATLAS.cellToTexel(A, x, y, z)
      const v = field([x + 0.5, y + 0.5, z + 0.5])
      const o = (t[1] * A.width + t[0]) * 4
      buf[o] = v[0]; buf[o + 1] = v[1]; buf[o + 2] = v[2]; buf[o + 3] = 1
    }
    return buf
  })()

  /** atlas → 真 3D 体积（volume pass 做嘅嘢，喺 CPU 度重做一次）。 */
  const vol = (() => {
    const out = new Float32Array(N[0] * N[1] * N[2] * 4)
    for (let z = 0; z < N[2]; z++) for (let y = 0; y < N[1]; y++) for (let x = 0; x < N[0]; x++) {
      const t = ATLAS.cellToTexel(A, x, y, z)
      const s = (t[1] * A.width + t[0]) * 4
      const d = ((z * N[1] + y) * N[0] + x) * 4
      for (let c = 0; c < 4; c++) out[d + c] = atlas[s + c]
    }
    return out
  })()

  it('atlas 来回：每一格都攞返自己嗰个值', () => {
    for (let z = 0; z < N[2]; z++) for (let y = 0; y < N[1]; y++) for (let x = 0; x < N[0]; x++) {
      const want = field([x + 0.5, y + 0.5, z + 0.5])
      const d = ((z * N[1] + y) * N[0] + x) * 4
      for (let c = 0; c < 3; c++) close(vol[d + c], want[c], 1e-6, 'resolve 之后 ' + [x, y, z] + ' 分量 ' + c)
    }
  })

  it('★ texcoord = p / N 喺已知点上【啱啱好】', () => {
    for (const p of [[0.5, 0.5, 0.5], [5.5, 3.5, 2.5], [10.5, 6.5, 4.5], [3.2, 1.9, 3.7]] as [number, number, number][]) {
      const uvw: [number, number, number] = [p[0] / N[0], p[1] / N[1], p[2] / N[2]]
      const want = field(p)
      for (let c = 0; c < 3; c++) {
        close(sample3D(vol, N, c, 4, uvw), want[c], 2e-6, 'p/N 抽样 @' + p + ' 分量 ' + c)
      }
    }
  })

  it('★ 写成 (p + 0.5) / N 会把成个场推落下游【半格】—— 而且睇落完全正常', () => {
    const p: [number, number, number] = [4.5, 3.5, 2.5]
    const good: [number, number, number] = [p[0] / N[0], p[1] / N[1], p[2] / N[2]]
    const bad: [number, number, number] = [(p[0] + 0.5) / N[0], (p[1] + 0.5) / N[1], (p[2] + 0.5) / N[2]]
    const gx = sample3D(vol, N, 0, 4, good)
    const bx = sample3D(vol, N, 0, 4, bad)
    // 场喺 x 嘅梯度係 0.017/格 → 半格 = 0.0085
    close(bx - gx, 0.017 * 0.5, 1e-6, '错约定嘅偏移应该【啱啱好】係半格 × 梯度')
    // 而且个错细到肉眼睇唔出：只係场值嘅 2% 左右
    assert(Math.abs(bx - gx) / Math.abs(gx) < 0.05, '呢个错就係咁鬼死难发现 —— 唔好删呢个测试')
    // 反过嚟：错约定抽到嘅嘢 = 场喺 p + 0.5 嘅值
    close(bx, field([p[0] + 0.5, p[1] + 0.5, p[2] + 0.5])[0], 2e-6, '错约定 = 场向下游平移半格')
  })

  it('WindSmoke.tsx 同 lbmGpu 用【同一个】约定', () => {
    // 呢个係文字层面嘅守卫：readVolumeTexture() 嘅注释同 WindSmoke 嘅 toUVW 必须讲同一件事
    assert(SH.macroShaderSource(A).indexOf('texelFetch') >= 0, 'macro pass 一定要用 texelFetch，唔可以 texture()')
    assert(SH.volumeShaderSource(A).indexOf('texelFetch') >= 0, 'volume pass 一定要用 texelFetch 读 atlas')
    assert(SH.volumeShaderSource(A).indexOf('texture(uMacro') < 0, '★ atlas 永远唔可以用 filtering 抽样')
  })
})

/* ══════════════════════════════════════════════════════ (d) padding texel */

describe('lbm/(d) padding：力金字塔係【连 padding 一齐加】嘅', () => {
  it('nz 唔係 tile 数嘅倍数 → 真係有 padding', () => {
    const A = ATLAS.layout(17, 5, 13)
    assert(A.padTexels > 0, '揀呢个尺寸就係要有 padding，否则测试冇意义')
    // 出货尺寸都会有 padding —— 唔好以为「实际用嘅尺寸冇事」
    let anyPad = false
    for (const t of GPU.QUALITY_TIERS) if (ATLAS.layout(t.nx, t.ny, t.nz).padTexels > 0) anyPad = true
    assert(anyPad, '连出货 tier 都冇 padding 嘅话，呢个 bug 就更加冇人捉到（更加要测）')
  })

  it('★ padding 唔清零，合力就係一个谎话', () => {
    const A = ATLAS.layout(17, 5, 13)
    const real = new Float32Array(A.texels)     // 全部真 cell 嘅力 = 0（冇零件）
    const dirty = new Float32Array(A.texels)
    let nPad = 0
    for (let v = 0; v < A.height; v++) for (let u = 0; u < A.width; u++) {
      const c = ATLAS.texelToCell(A, u, v)
      if (c[2] >= A.nz) { dirty[v * A.width + u] = 7.5; nPad++ }   // 未初始化嘅垃圾
    }
    assert(nPad === A.padTexels, 'padding 数唔啱')
    close(reduce4(real, A.width, A.height), 0, 1e-9, '清咗零嘅 atlas 应该 reduce 到啱啱好 0')
    const polluted = reduce4(dirty, A.width, A.height)
    // 金字塔【连 padding 一齐加】，所以污染量 = padding 数 × 垃圾值，一个字都唔差
    close(polluted, nPad * 7.5, 1e-3, '污染量应该啱啱好係 padding 数 × 垃圾值')
    assert(polluted > 1, '冇清零嘅 padding 会毒害合力（' + polluted + ' vs 真值 0）—— 呢个就係点解 _reset() 要 clear')
  })

  it('shader 层面：padding 一定要 discard / 零填', () => {
    const A = ATLAS.layout(17, 5, 13)
    const step = SH.stepShaderSource(A, { writeForce: true })
    assert(step.indexOf('if (isPadding(c)) discard;') >= 0, 'step shader 冇 discard padding')
    // discard 即係 oForce 永远唔会被写 → 一定要有人喺开头 clear 一次
    const init = SH.initShaderSource(A)
    assert(/isPadding\(c\)\)\s*\{\s*oG0 = vec4\(0\.0\)/.test(init), 'init shader 冇把 padding 零填')
    const macro = SH.macroShaderSource(A)
    assert(macro.indexOf('if (isPadding(c)) { oMacro = vec4(0.0); return; }') >= 0, 'macro shader 冇零填 padding')
    const solid = SH.solidClearShaderSource(A)
    assert(solid.indexOf('1e9') >= 0, 'solid clear 应该把 padding 填成「好远、冇零件」')
  })

  it('frontal pass 只掃真 cell（NY×NZ 之外要写 0）', () => {
    const A = ATLAS.layout(17, 5, 13)
    const f = SH.frontalShaderSource(A)
    assert(f.indexOf('if (yz.x >= NY || yz.y >= NZ) { oA0 = vec4(0.0); return; }') >= 0,
      'frontal pass 冇 guard 超出 NY/NZ 嘅 texel')
  })
})

/* ══════════════════════════════════════════════════════════ sdfBake */

describe('lbm/sdfBake：二值 mask 同 narrow band', () => {
  const dom = SDF.buildDomain(sphereGrid(20, 100))

  it('预设二值：固体 -1 / 流体 +1，nearBody gate 无条件', () => {
    const phi = SDF.bakePhi(dom)
    assert(phi.trueSdf === false, '预设唔应该係真 SDF')
    assert(phi.nearBodyPhi === Infinity, '★ 二值 mask 之下 gate 一定要係无条件')
    for (let i = 0; i < phi.data.length; i++) {
      assert(phi.data[i] === (dom.obst[i] ? -1 : 1), '二值 phi 喺 ' + i + ' 唔啱')
    }
  })

  it('真 SDF：界面位置【一模一样】（开咗都唔会郁条壁）', () => {
    const bin = SDF.bakePhi(dom)
    const sdf = SDF.bakePhi(dom, { trueSdf: true, band: 4 })
    const idx = (x: number, y: number, z: number) => x + dom.DX * (y + dom.DY * z)
    let checked = 0
    for (let z = 1; z < dom.DZ - 1 && checked < 500; z++) for (let y = 1; y < dom.DY - 1 && checked < 500; y++) for (let x = 1; x < dom.DX - 1; x++) {
      const c = idx(x, y, z)
      if (dom.obst[c]) continue
      // 有面邻居係固体嘅流体格 → 两个版本都应该係 +1
      const touchesFace = dom.obst[idx(x + 1, y, z)] || dom.obst[idx(x - 1, y, z)]
        || dom.obst[idx(x, y + 1, z)] || dom.obst[idx(x, y - 1, z)]
        || dom.obst[idx(x, y, z + 1)] || dom.obst[idx(x, y, z - 1)]
      if (!touchesFace) continue
      close(sdf.data[c], 1, 1e-6, '贴壁流体格嘅 phi 应该係 +1（同二值一样）')
      close(bin.data[c], 1, 1e-9, '二值贴壁格')
      checked++
      if (checked >= 500) break
    }
    assert(checked > 50, '球体表面应该有过百个贴壁格，得 ' + checked + ' 個 → 测试冇真係跑到')
  })

  it('★ nearBody gate 嘅【真正】条件成立：掂住固体嘅格 phi < 2.5', () => {
    const sdf = SDF.bakePhi(dom, { trueSdf: true, band: 4 })
    assert(sdf.nearBodyPhi === 2.5, 'band >= 2.5 嘅真 SDF 应该开 gate')
    const bad = SDF.checkNearBodyGate(sdf, dom.obst, 2.5)
    assert(bad.length === 0, 'gate 唔安全：' + bad.slice(0, 3).join('；'))
    // 而且远场真係跳得甩（唔係全部都 < 2.5，否则 gate 一啲用都冇）
    let far = 0
    for (let i = 0; i < sdf.data.length; i++) if (sdf.data[i] >= 2.5) far++
    assert(far > sdf.data.length * 0.5, 'gate 应该跳得甩大部分远场，而家只有 ' + far + '/' + sdf.data.length)
  })

  it('★ 流体侧嘅距离场係 1-Lipschitz（gate 嘅证明就係靠呢样）', () => {
    const sdf = SDF.bakePhi(dom, { trueSdf: true, band: 6 })
    const idx = (x: number, y: number, z: number) => x + dom.DX * (y + dom.DY * z)
    let worst = 0
    for (let z = 1; z < dom.DZ - 1; z += 2) for (let y = 1; y < dom.DY - 1; y += 2) for (let x = 1; x < dom.DX - 1; x += 2) {
      const c = idx(x, y, z)
      if (dom.obst[c] || sdf.data[c] >= 6) continue          // band 上限 clamp 咗嘅唔算
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy && !dz) continue
        const n = idx(x + dx, y + dy, z + dz)
        if (dom.obst[n]) continue
        const w = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const diff = sdf.data[c] - sdf.data[n]
        if (diff - w > worst) worst = diff - w
      }
    }
    assert(worst < 1e-5, '距离场唔係 1-Lipschitz（最坏超出 ' + worst + '）→ gate 嘅证明冧咗')
  })

  it('band < 2.5 就【唔准】开 gate', () => {
    const s = SDF.bakePhi(dom, { trueSdf: true, band: 2 })
    assert(s.nearBodyPhi === Infinity, 'band=2 之下 gate 证明唔到，一定要退返无条件')
    assert(s.notes.some((n) => n.indexOf('2.5') >= 0), '要讲低点解退返无条件')
  })

  it('narrow band 只 clamp 上限，唔会郁近场', () => {
    const s = SDF.bakePhi(dom, { trueSdf: true, band: 3 })
    let mx = -Infinity, mn = Infinity
    for (let i = 0; i < s.data.length; i++) { if (s.data[i] > mx) mx = s.data[i]; if (s.data[i] < mn) mn = s.data[i] }
    close(mx, 3, 1e-6, 'band 上限')
    close(mn, -3, 1e-6, 'band 下限')
    // 贴壁值仍然係 ±1（clamp 唔到佢哋）
    const bad = SDF.checkNearBodyGate(s, dom.obst, 2.5)
    assert(bad.length === 0, 'band=3 都应该 gate-safe')
  })
})

/* ══════════════════════════════════════════════════════ (b) Clift-Gauvin */

describe('lbm/(b) 球阻力：参考曲线（CPU 部分）', () => {
  it('Clift-Gauvin 相关式喺已知点上啱', () => {
    rel(sphereCd(0.05), 24 / 0.05, 1e-9, 'Re=0.05 嘅 Stokes 阻力')
    rel(sphereCd(1), 27.6, 0.06, 'Re=1')
    rel(sphereCd(100), 1.09, 0.06, 'Re=100')
    rel(sphereCd(1000), 0.47, 0.08, 'Re=1000')
    rel(sphereCd(1e4), 0.41, 0.15, 'Re=1e4')
    assert(sphereCd(10) > sphereCd(100) && sphereCd(100) > sphereCd(1000), 'Re 10..1000 之间 Cd 要单调跌')
  })

  it('球喺我哋钳完 Re 之后落喺曲线嘅边度（诚实度）', () => {
    const dom = SDF.buildDomain(sphereGrid(24, 100))
    const f = GPU.deriveFlow(dom, { speed: 10, rho: 1.204, mu: 1.81e-5 })
    assert(f.reReal > 5e4, '100mm 球 @10 m/s 空气应该係 Re ~ 7e4')
    assert(f.reLbEffective <= GPU.RE_LB_MAX + 1, '有效 Re 应该已经钳落稳定带')
    // ★ 呢个就係「诚实双 Cd」要讲嘅嘢：我哋解嘅係 reLbEffective 嘅球，唔係 reReal 嘅球。
    const cdAtSim = sphereCd(f.reLbEffective)
    const cdAtReal = sphereCd(f.reReal)
    assert(cdAtSim > cdAtReal, '钳低 Re 之后参考 Cd 应该【高咗】—— 面板要讲呢件事，唔係扮冇发生')
    assert(f.reClamped, 'reClamped 旗要着')
  })

  it('堵塞率细到唔使担心（Maskell 修正之前）', () => {
    const dom = SDF.buildDomain(sphereGrid(24, 100))
    const blockage = dom.frontalCells / (dom.DY * dom.DZ)
    assert(blockage < 0.15, '堵塞率 ' + (blockage * 100).toFixed(1) + '% 太高，侧边距唔够')
    assert(blockage > 0.02, '堵塞率 ' + (blockage * 100).toFixed(1) + '% 低到离谱 → 侧边距浪费咗好多格')
  })

  itGl('★ GPU：球嘅 Cd 落喺 Clift-Gauvin ±50% 之内（趋势级）', (env) => {
    const caps = probeMRT(env.gl)
    assert(caps.ok, 'GPU 唔支援五个 RGBA32F：' + caps.reason)
    assert(caps.force7, '量唔到力就冇 Cd：' + caps.reason)
    const renderer = makeRenderer(env)
    let solver: GPU.LbmGpu | null = null
    try {
      const tier = GPU.QUALITY_TIERS[0]                       // low：够快、又够解析（球 ~20 格）
      const plan = SDF.planResolution([100, 100, 100], tier)
      const dom = SDF.buildDomain(sphereGrid(plan.res, 100))
      const phi = SDF.bakePhi(dom)
      const flow = { speed: 10, rho: 1.204, mu: 1.81e-5 }
      solver = new GPU.LbmGpu(renderer, dom, phi, {
        measure: true, needVolume: false, substeps: 8, flow, caps, tier: tier.name,
      })
      const f = solver.report().flow
      assert(dom.dLb > 12, '球淨係得 ' + dom.dLb.toFixed(1) + ' 格直径，边界层解唔到，测呢个冇意义')

      // 收敛：★ 由「成功读到几多次」驱动，唔係由帧数 ★（见 asyncReader.ts）
      const samples: number[] = []
      const minSteps = f.rampSteps + Math.round(1.8 * dom.DX / LAT.U_LB)
      const maxSteps = f.rampSteps + Math.round(4.5 * dom.DX / LAT.U_LB)
      let guard = 0
      while (solver.stepCount < maxSteps && guard++ < 20000) {
        solver.advance()
        const s = solver.pollForce()
        if (!s || !s.rampDone) continue
        assert(s.links > 0, '★ 一条反弹 link 都冇 —— 条流根本掂唔到零件（phi 上传错咗？）')
        samples.push(s.cd)
        if (solver.stepCount > minSteps && samples.length >= 12) {
          const w = samples.slice(-10)
          const mn = Math.min(...w), mx = Math.max(...w)
          const mean = w.reduce((a, b) => a + b, 0) / w.length
          if ((mx - mn) / (Math.abs(mean) + 1e-9) < 0.012) break
        }
      }
      assert(samples.length >= 12, '只攞到 ' + samples.length + ' 个 Cd 样本 —— async readback 冇返嘢？')
      const tail = samples.slice(-Math.max(6, Math.round(samples.length * 0.25)))
      const cd = tail.reduce((a, b) => a + b, 0) / tail.length

      // ★ 唔好 Math.abs ★：来流係域嘅 +X，阻力就一定係 +X。取绝对值会把一个
      //   「动量交换符号搞反咗」嘅 bug 变成一个睇落几靓嘅 Cd。
      assert(Number.isFinite(cd) && cd > 0, 'Cd 唔係一个正数（' + cd + '）—— 动量交换嘅符号反咗？')
      // ★ 要同【我哋真係解紧嗰个 Re】比，唔係同真实 Re 比 ★ —— 见上面「诚实双 Cd」。
      const want = sphereCd(f.reLbEffective)
      rel(cd, want, 0.5, '球 @Re_lb=' + f.reLbEffective.toFixed(0) + ' 嘅 Cd（' + tail.length + ' 个样本）')
    } finally {
      solver?.dispose()
      renderer.dispose()
    }
  })
})

/* ══════════════════════════════════════════════════════ (a) 空盒守恒 */

describe('lbm/(a) 空周期盒：均匀场要保持均匀', () => {
  it('CPU 侧：均匀平衡态碰撞完之后【一个字节都唔应该郁】', () => {
    // 呢个係 GPU fixture 嘅 CPU 对照：TRT 碰撞对平衡态係一个不动点。
    const g = new Float64Array(LAT.Q), e = new Float64Array(LAT.Q)
    LAT.equilibriumDev(g, 0, LAT.U_LB, 0, 0)
    LAT.equilibriumDev(e, 0, LAT.U_LB, 0, 0)
    const wp = 1.6, wm = 0.8
    for (let i = 1; i < LAT.Q; i += 2) {
      const ib = i + 1
      const gp = 0.5 * (g[i] + g[ib]), gm = 0.5 * (g[i] - g[ib])
      const ep = 0.5 * (e[i] + e[ib]), em = 0.5 * (e[i] - e[ib])
      close(g[i] - wp * (gp - ep) - wm * (gm - em), g[i], 1e-15, '平衡态碰撞完变咗（方向 ' + i + '）')
      close(g[ib] - wp * (gp - ep) + wm * (gm - em), g[ib], 1e-15, '平衡态碰撞完变咗（方向 ' + ib + '）')
    }
    close(g[0] - wp * (g[0] - e[0]), g[0], 1e-18, '静止方向都唔应该郁')
    // 而且矩要重现返输入
    const mo = new Float64Array(4)
    LAT.momentsDev(g, mo)
    close(mo[0], 0, 1e-15, 'delta')
    close(mo[1], LAT.U_LB, 1e-15, 'rho·ux')
  })

  it('全周期变体唔会生成入口 / 海绵以外嘅嘢', () => {
    const A = ATLAS.layout(8, 8, 8)
    const src = SH.stepShaderSource(A, {
      bc: { xmin: 'periodic', xmax: 'periodic', ymin: 'periodic', ymax: 'periodic', zmin: 'periodic', zmax: 'periodic' },
    })
    assert(src.indexOf('the driven inlet layer') < 0, '周期盒唔应该有入口层')
    assert(src.indexOf('% NX') > 0 && src.indexOf('% NY') > 0 && src.indexOf('% NZ') > 0, '三条轴都要 wrap')
  })

  itGl('★ GPU：空周期盒行 1000 substep，macro 场要 machine-zero 咁均匀', (env) => {
    const caps = probeMRT(env.gl)
    assert(caps.ok, 'GPU 唔支援五个 RGBA32F：' + caps.reason)
    const renderer = makeRenderer(env)
    const dom = emptyDomain(16)
    const phi = SDF.bakePhi(dom)            // 全部 +1：一格固体都冇
    let solver: GPU.LbmGpu | null = null
    try {
      solver = new GPU.LbmGpu(renderer, dom, phi, {
        bc: { xmin: 'periodic', xmax: 'periodic', ymin: 'periodic', ymax: 'periodic', zmin: 'periodic', zmax: 'periodic' },
        measure: false, needVolume: false, substeps: 1, caps,
      })
      // 呢个 fixture 唔係测 Re 推导：直接钉一个中庸嘅 omega，熄埋渐升同海绵，
      // 咁「场应该完全唔郁」就係一句可以 machine-zero 咁验嘅嘢。
      solver.flow = {
        ...solver.flow,
        omegaPlus: 1.2,
        magic: LAT.lambdaFromOmegas(1.2, LAT.OMEGA_MINUS),
        rampSteps: 0, spongeStrength: 0,
      }
      // 冇 await ready()：three 会喺第一次 render 同步编译。慢，但係 fixture 唔在乎。
      for (let f = 0; f < 100; f++) solver.advance(10)   // 共 1000 substep
      assert(solver.stepCount === 1000, 'substep 数唔啱：' + solver.stepCount)

      const m = solver.readMacro()
      let maxD = 0, maxUx = 0, maxUyz = 0
      for (let i = 0; i < m.delta.length; i++) {
        maxD = Math.max(maxD, Math.abs(m.delta[i]))
        maxUx = Math.max(maxUx, Math.abs(m.ux[i] - LAT.U_LB))
        maxUyz = Math.max(maxUyz, Math.abs(m.uy[i]), Math.abs(m.uz[i]))
      }
      // fp32 之下十九项求和嘅误差 ~1e-8；1000 步随机游走最多再放大 sqrt(1000) ~ 32 倍
      assert(maxD < 1e-6, '★ 空盒生出咗密度扰动：max|delta| = ' + maxD)
      assert(maxUx < 1e-6, '★ 空盒嘅 ux 飘咗：max|ux - U_LB| = ' + maxUx)
      assert(maxUyz < 1e-6, '★ 空盒生出咗横向速度：max|uy,uz| = ' + maxUyz)
    } finally {
      solver?.dispose()
      renderer.dispose()
    }
  })
})

/* ══════════════════════════════════════════════════════ 能力探测 / 资源 */

describe('lbm/probeMRT + 资源守则', () => {
  it('冇 context 都唔会掟错，而且讲得出点解', () => {
    const r = probeMRT(null)
    assert(r.ok === false && r.webgl2 === false, '冇 context 应该报 ok=false')
    assert(r.reason.length > 0, '一定要有一句人话')
    assert(Array.isArray(r.levels) && Array.isArray(r.supported), 'levels/supported 要係数组，唔可以 undefined')
    const r2 = probeMRT(undefined)
    assert(r2.ok === false, 'undefined 一样唔可以掟错')
  })

  itGl('★ 五个 RGBA32F 要真係 clear 得（唔止 COMPLETE）', (env) => {
    const r = probeMRT(env.gl)
    assert(r.webgl2, '应该係 WebGL2')
    assert(r.levels.length >= 4, '起码要试四组')
    if (r.ok) {
      assert(r.supported.indexOf('5 x RGBA32F') >= 0, 'ok=true 但 supported 冇列出嚟')
      assert(r.colorBufferFloat, 'RGBA32F 画得但冇 EXT_color_buffer_float？')
    }
    // 唔可以留低 GL error
    assert(env.gl.getError() === env.gl.NO_ERROR, 'probe 留低咗 GL error')
  })

  it('★ atlas render target 永远唔可以开 filtering（源码守卫）', () => {
    // 呢个係文字守卫：lbmGpu 嘅 _rt() 预设 NearestFilter，只有体积场先至 linear。
    // 一次跨 tile 边界嘅 bilinear 抽样会静静鸡沟埋两个 Z 切片 —— 唔报错、唔黑屏。
    const h = ATLAS.glslHeader(ATLAS.layout(16, 8, 8))
    assert(h.indexOf('NEVER sample the atlas with filtering') >= 0, 'atlas header 唔见咗嗰个警告')
    assert(h.indexOf('texelFetch') >= 0, 'atlas header 应该讲明每次读都係 texelFetch')
  })

  it('reduce 金字塔一定收敛（唔会无限 level）', () => {
    for (const t of GPU.QUALITY_TIERS) {
      const A = ATLAS.layout(t.nx, t.ny, t.nz)
      let w = A.width, h = A.height, n = 0
      while ((w > 1 || h > 1) && n < 32) { w = Math.max(1, Math.ceil(w / 4)); h = Math.max(1, Math.ceil(h / 4)); n++ }
      assert(w === 1 && h === 1, t.name + '：金字塔收唔到做一个 texel')
      assert(n <= 8, t.name + '：' + n + ' 级金字塔太多')
    }
  })

  itGl('★ 分配失败要自己 dispose 自己（walk-down 嘅前提）', (env) => {
    const caps = probeMRT(env.gl)
    assert(caps.ok, 'GPU 唔支援五个 RGBA32F：' + caps.reason)
    const renderer = makeRenderer(env)
    try {
      const base = renderer.info.memory.textures
      // 大到冇任何消费级 GPU 撑得起（atlas ~16384²，五个 target ping-pong = 几十 GB）
      const dom = emptyDomain(256)
      const huge: SDF.WindDomain = { ...dom, DX: 1024, DY: 1024, DZ: 256, cells: 1024 * 1024 * 256, obst: new Uint8Array(0) }
      const phi: SDF.PhiField = { data: new Float32Array(0), DX: 1024, DY: 1024, DZ: 256, trueSdf: false, band: 1, nearBodyPhi: Infinity, notes: [] }
      let built: GPU.LbmGpu | null = null
      let threw = false
      try { built = new GPU.LbmGpu(renderer, huge, phi, { measure: true, caps }) }
      catch { threw = true }
      if (!threw) { built?.dispose(); throw new Error('呢部 GPU 竟然分配到 ~40 GB？测试无效，换个更大嘅尺寸') }
      // ★ 关键断言 ★：掟错嗰次要把已经攞到手嘅 texture 全部放返出嚟，
      //   否则第一次尝试漏低几百 MB，walk-down 嘅第二次会用更细嘅预算撞同一堵墙。
      const after = renderer.info.memory.textures
      assert(after <= base, '分配失败之后仲漏低咗 ' + (after - base) + ' 张 texture —— walk-down 冇得救')

      // 而且【成功】嘅 solver dispose 完都要归零
      const okDom = SDF.buildDomain(sphereGrid(16, 100))
      const s = new GPU.LbmGpu(renderer, okDom, SDF.bakePhi(okDom), { measure: true, needVolume: false, caps })
      assert(renderer.info.memory.textures > base, '正常建构应该真係攞咗 texture')
      s.dispose()
      assert(renderer.info.memory.textures <= base, 'dispose() 之后仲有 texture 未放')
    } finally {
      renderer.dispose()
    }
  })
})

/* ══════════════════════════════════════════════════════════ Stage 4 回归 */

describe('lbm/Stage 4 仲係绿嘅', () => {
  it('lattice.runSelfCheck()', () => {
    const r = LAT.runSelfCheck()
    assert(r.pass, r.failures.join('\n'))
  })
  it('atlas.runSelfCheck()', () => {
    const r = ATLAS.runSelfCheck()
    assert(r.pass, r.failures.join('\n'))
  })
  it('shaders.runSelfCheck()', () => {
    const r = SH.runSelfCheck()
    assert(r.pass, r.failures.join('\n'))
  })
})

/* ══════════════════════════════════════════════════════════════ 报告 */

if (!useHost) {
  const failed = cases.filter((c) => c.error)
  for (const c of cases) console.log((c.error ? 'FAIL ' : 'ok   ') + c.name + (c.error ? '\n       ' + c.error.split('\n')[0] : ''))
  console.log('')
  console.log((cases.length - failed.length) + '/' + cases.length + ' passed')
  if (skipped.length) {
    console.log('')
    console.log('⚠⚠⚠ ' + skipped.length + ' 个 fixture 【跳咗】—— ' + GL_REASON)
    for (const s of skipped) console.log('   · ' + s)
    console.log('   呢啲係未验证过，唔可以当验证过。要喺有 GPU 嘅浏览器度行。')
  }
  if (failed.length) {
    const proc = (globalThis as { process?: { exitCode?: number } }).process
    if (proc) proc.exitCode = 1
  }
}

export { sphereCd, sphereGrid, boxGrid, reduce4, sample3D }
