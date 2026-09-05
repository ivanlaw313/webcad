// GPU LBM 纯逻辑核心嘅【信任基础】。
//
// 呢啲测试系整个 GPU 路线唯一嘅安全网：Stage 5 之后所有嘢都跑喺 GPU 度，
// 一个索引打错唔会 crash，只会令阻力静静鸡差几个 percent。所以呢度嘅检查係
// 【独立重新推导】—— 唔係去 call runSelfCheck() 就算数（虽然最尾都会顺手 call 埋）。
//
//
// 点跑
// ────
// 1. 呢个 repo 【冇装 vitest】。文件系 vitest 风格写，但 describe/it/expect 会喺 runtime
//    自动拣：globalThis 有（vitest globals:true / bun / jest）就用返佢哋，冇就用下面
//    嗰个迷你 runner，直接跑得：
//
//        node --experimental-strip-types src/analysis/lbm/__tests__/lbm.selfcheck.test.ts
//
//    将来真係装咗 vitest，把下面 HARNESS 一段换成 `import { describe, it, expect } from 'vitest'`
//    就得，测试本体一行都唔使改。
//
// 2. 唔使 test runner 嘅话，lattice.ts / atlas.ts / shaders.ts 各自 export 咗
//    runSelfCheck(): { pass, failures }，喺 browser console 都 call 得。

import * as LAT from '../lattice.ts'
import * as ATLAS from '../atlas.ts'
import * as SH from '../shaders.ts'

/* ══════════════════════════════════════════════════ HARNESS（装咗 vitest 就删呢段） */

type Body = () => void

interface Matchers {
  toBe(expected: unknown): void
  toBeCloseTo(expected: number, digits?: number): void
  toBeGreaterThan(n: number): void
  toBeLessThan(n: number): void
  toContain(sub: string): void
  toMatch(re: RegExp): void
  toHaveLength(n: number): void
  toThrow(): void
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

const show = (v: unknown): string => {
  if (typeof v === 'string') return v.length > 120 ? JSON.stringify(v.slice(0, 120) + '...') : JSON.stringify(v)
  return String(v)
}

const localExpect = (actual: unknown): Matchers => ({
  toBe(expected) {
    if (!Object.is(actual, expected)) throw new Error('expected ' + show(actual) + ' to be ' + show(expected))
  },
  toBeCloseTo(expected, digits = 2) {
    const tol = Math.pow(10, -digits) / 2
    if (typeof actual !== 'number' || !(Math.abs(actual - expected) <= tol)) {
      throw new Error('expected ' + show(actual) + ' to be within ' + tol + ' of ' + expected)
    }
  },
  toBeGreaterThan(n) {
    if (!(typeof actual === 'number' && actual > n)) throw new Error('expected ' + show(actual) + ' > ' + n)
  },
  toBeLessThan(n) {
    if (!(typeof actual === 'number' && actual < n)) throw new Error('expected ' + show(actual) + ' < ' + n)
  },
  toContain(sub) {
    if (typeof actual !== 'string' || actual.indexOf(sub) < 0) throw new Error('expected output to contain ' + show(sub))
  },
  toMatch(re) {
    if (typeof actual !== 'string' || !re.test(actual)) throw new Error('expected output to match ' + String(re))
  },
  toHaveLength(n) {
    const len = (actual as { length?: number } | null)?.length
    if (len !== n) throw new Error('expected length ' + show(len) + ' to be ' + n)
  },
  toThrow() {
    if (typeof actual !== 'function') throw new Error('toThrow() needs a function')
    let threw = false
    try { (actual as () => unknown)() } catch { threw = true }
    if (!threw) throw new Error('expected the call to throw')
  },
})

const describe = useHost && HOST.describe ? HOST.describe : localDescribe
const it = useHost && HOST.it ? HOST.it : localIt
const expect = useHost && HOST.expect ? HOST.expect : localExpect

/* ══════════════════════════════════════════════════════════ 共用小工具 */

const Q = LAT.Q
const cx = (i: number) => LAT.C[i * 3]
const cy = (i: number) => LAT.C[i * 3 + 1]
const cz = (i: number) => LAT.C[i * 3 + 2]
const comp = (i: number, a: number) => LAT.C[i * 3 + a]
const kron = (a: number, b: number) => (a === b ? 1 : 0)
// 取负，但唔好整出 -0：toBe 用 Object.is，而 Object.is(0, -0) === false。
const neg = (v: number) => (v === 0 ? 0 : -v)

/* ══════════════════════════════════════════════════════════════ lattice */

describe('lbm/lattice: D3Q19 表', () => {
  // 1
  it('权重和 = 1', () => {
    let s = 0
    for (let i = 0; i < Q; i++) s += LAT.W[i]
    expect(s).toBeCloseTo(1, 15)
  })

  // 2
  it('一阶矩 sum(w_i c_i) = 0（三条轴）', () => {
    for (let a = 0; a < 3; a++) {
      let m = 0
      for (let i = 0; i < Q; i++) m += LAT.W[i] * comp(i, a)
      expect(m).toBeCloseTo(0, 15)
    }
  })

  // 3
  it('二阶矩 sum(w_i c_ia c_ib) = c_s² δ_ab', () => {
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      let m = 0
      for (let i = 0; i < Q; i++) m += LAT.W[i] * comp(i, a) * comp(i, b)
      expect(m).toBeCloseTo(LAT.CS2 * kron(a, b), 15)
    }
  })

  // 4
  it('三阶矩 = 0（奇数阶全消）', () => {
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) {
      let m = 0
      for (let i = 0; i < Q; i++) m += LAT.W[i] * comp(i, a) * comp(i, b) * comp(i, c)
      expect(m).toBeCloseTo(0, 15)
    }
  })

  // 5 ★ 四阶各向同性 —— D3Q19 之所以够资格做 Navier-Stokes 就系靠呢条 ★
  it('四阶各向同性 = c_s⁴ (δδ + δδ + δδ)', () => {
    let checked = 0
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) for (let d = 0; d < 3; d++) {
      let m = 0
      for (let i = 0; i < Q; i++) m += LAT.W[i] * comp(i, a) * comp(i, b) * comp(i, c) * comp(i, d)
      const want = LAT.CS2 * LAT.CS2 * (kron(a, b) * kron(c, d) + kron(a, c) * kron(b, d) + kron(a, d) * kron(b, c))
      expect(m).toBeCloseTo(want, 15)
      checked++
    }
    expect(checked).toBe(81)
  })

  // 6 ★ 相反方向相邻 —— shader 嘅 opp() 冇查表，全靠呢个性质 ★
  it('opp(i) 闭式成立，而且 c[opp(i)] = -c[i]', () => {
    expect(LAT.opp(0)).toBe(0)
    for (let i = 1; i < Q; i++) {
      expect(LAT.opp(i)).toBe(i % 2 === 1 ? i + 1 : i - 1)   // 相邻
      expect(LAT.opp(LAT.opp(i))).toBe(i)                     // 对合
      expect(LAT.OPP[i]).toBe(LAT.opp(i))                     // 表同闭式一致
      expect(cx(LAT.opp(i))).toBe(neg(cx(i)))
      expect(cy(LAT.opp(i))).toBe(neg(cy(i)))
      expect(cz(LAT.opp(i))).toBe(neg(cz(i)))
    }
  })

  // 7
  it('w[opp(i)] = w[i]（反弹先至保持得住偏差形式）', () => {
    for (let i = 0; i < Q; i++) expect(LAT.W[LAT.opp(i)]).toBe(LAT.W[i])
  })

  // 8
  it('方向集合啱啱好 = 1 静止 + 6 面 + 12 棱，冇重复', () => {
    const seen = new Set<string>()
    let rest = 0, face = 0, edge = 0
    for (let i = 0; i < Q; i++) {
      const key = cx(i) + ',' + cy(i) + ',' + cz(i)
      expect(seen.has(key)).toBe(false)
      seen.add(key)
      const n = Math.abs(cx(i)) + Math.abs(cy(i)) + Math.abs(cz(i))
      if (n === 0) rest++; else if (n === 1) face++; else if (n === 2) edge++
      expect(n).toBeLessThan(3)
    }
    expect(rest).toBe(1); expect(face).toBe(6); expect(edge).toBe(12)
  })

  // 9
  it('f^eq 完全重现佢自己嘅矩（rho、rho u、应力）', () => {
    const rho = 1.0037, ux = 0.043, uy = -0.021, uz = 0.011
    const f = new Float64Array(Q)
    LAT.equilibrium(f, rho, ux, uy, uz)
    let s = 0, jx = 0, jy = 0, jz = 0
    for (let i = 0; i < Q; i++) { s += f[i]; jx += f[i] * cx(i); jy += f[i] * cy(i); jz += f[i] * cz(i) }
    expect(s).toBeCloseTo(rho, 14)
    expect(jx).toBeCloseTo(rho * ux, 14)
    expect(jy).toBeCloseTo(rho * uy, 14)
    expect(jz).toBeCloseTo(rho * uz, 14)
    const u = [ux, uy, uz]
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      let p = 0
      for (let i = 0; i < Q; i++) p += f[i] * comp(i, a) * comp(i, b)
      expect(p).toBeCloseTo(rho * LAT.CS2 * kron(a, b) + rho * u[a] * u[b], 14)
    }
  })

  // 10 ★ 偏差形式：g = f - w，而且矩要过得返 ★
  it('equilibriumDev = equilibrium - w，momentsDev 攞返 delta 同 rho·u', () => {
    const rho = 1.0037, ux = 0.043, uy = -0.021, uz = 0.011
    const f = new Float64Array(Q), g = new Float64Array(Q)
    LAT.equilibrium(f, rho, ux, uy, uz)
    LAT.equilibriumDev(g, rho - 1, ux, uy, uz)
    for (let i = 0; i < Q; i++) expect(g[i]).toBeCloseTo(f[i] - LAT.W[i], 15)
    const mo = new Float64Array(4)
    LAT.momentsDev(g, mo)
    expect(mo[0]).toBeCloseTo(rho - 1, 14)
    expect(mo[1]).toBeCloseTo(rho * ux, 14)
    expect(mo[2]).toBeCloseTo(rho * uy, 14)
    expect(mo[3]).toBeCloseTo(rho * uz, 14)
  })

  // 11 —— clear-to-zero 呢招（texture 清零 = rho 1 静止流体）靠呢条
  it('偏差形式嘅静止态完全係零', () => {
    const g = new Float64Array(Q)
    LAT.equilibriumDev(g, 0, 0, 0, 0)
    for (let i = 0; i < Q; i++) expect(g[i]).toBe(0)
  })

  // 12
  it('nu ↔ omega 来回，同 TRT magic 参数来回', () => {
    for (let nu = 1e-5; nu < 0.3; nu *= 3) {
      const om = LAT.omegaFromNu(nu)
      expect(LAT.nuFromOmega(om)).toBeCloseTo(nu, 12)
      expect(om).toBeGreaterThan(0)
      expect(om).toBeLessThan(2)
      for (const want of [0.2, 0.8, 1.4]) {
        const lam = LAT.lambdaFromOmegas(om, want)
        expect(LAT.omegaMinusFromLambda(om, lam)).toBeCloseTo(want, 10)
      }
    }
  })

  // 13 ★ Smagorinsky 符号 —— 数值版；shader 文本版喺下面 ★
  it('★ 涡黏必须【抬高】omega_minus，唔係压低', () => {
    for (let nu = 1e-5; nu < 0.3; nu *= 3) {
      const wpMol = LAT.omegaFromNu(nu)
      const lamPinned = LAT.lambdaFromOmegas(wpMol, LAT.OMEGA_MINUS)   // Lambda 由【钉死嘅 omega_minus】反推
      for (const damp of [0.95, 0.85, 0.5]) {
        // 涡黏一定令 omega_plus 跌；Lambda 定死之下 omega_minus 就要升。
        expect(LAT.omegaMinusFromLambda(wpMol * damp, lamPinned)).toBeGreaterThan(LAT.OMEGA_MINUS)
      }
    }
  })

  // 14 —— 就係「唔好钉 Lambda = 3/16」嗰个陷阱嘅回归测试
  it('★ 高 Re（细 nu）之下钉死 Lambda=3/16 会令奇模态几乎唔弛豫', () => {
    const om = LAT.omegaFromNu(1e-4)
    expect(LAT.omegaMinusFromLambda(om, LAT.MAGIC.WALL)).toBeLessThan(0.15)
    // 传说中「最稳」嘅 1/4 仲衰：喺 tau ≠ 1 度弛豫得更慢
    expect(LAT.omegaMinusFromLambda(om, LAT.MAGIC.STABLE))
      .toBeLessThan(LAT.omegaMinusFromLambda(om, LAT.MAGIC.WALL))
  })

  // 15
  it('打包覆盖 0..18 各一次，第 20 个槽 (4,3) 留空', () => {
    const slots = new Set<number>()
    for (let i = 0; i < Q; i++) {
      const t = LAT.packTarget(i), ch = LAT.packChannel(i)
      expect(t).toBeLessThan(LAT.N_TARGETS)
      expect(slots.has(t * 4 + ch)).toBe(false)
      slots.add(t * 4 + ch)
    }
    expect(slots.size).toBe(Q)
    expect(slots.has(4 * 4 + 3)).toBe(false)
  })

  // 16 ★ 权重字面量 float32 来回不变 ★
  it('★ 生成嘅 GLSL 权重字面量 Math.fround 来回【完全一样】', () => {
    const glsl = LAT.glslHeader()
    const m = glsl.match(/float\[19\]\(([^)]*)\)/)
    expect(m === null).toBe(false)
    const lits = (m as RegExpMatchArray)[1].split(',').map((x) => parseFloat(x))
    expect(lits).toHaveLength(Q)
    for (let i = 0; i < Q; i++) {
      // 唔係「够接近」，係【同一个 float32】
      expect(Math.fround(lits[i])).toBe(Math.fround(LAT.W[i]))
    }
    // 方向表亦要逐个出现
    for (let i = 0; i < Q; i++) {
      expect(glsl).toContain('ivec3(' + cx(i) + ',' + cy(i) + ',' + cz(i) + ')')
    }
  })

  // 17
  it('烘死嘅物理设定係我哋要嗰啲（u_lb 0.05 / omega_minus 0.8 / Cs 0.12）', () => {
    expect(LAT.U_LB).toBe(0.05)
    expect(LAT.U_LB * Math.sqrt(3)).toBeCloseTo(0.0866, 4)   // Ma
    expect(LAT.OMEGA_MINUS).toBe(0.8)
    expect(LAT.LES_CS).toBe(0.12)
  })

  it('lattice.runSelfCheck() 全绿', () => {
    const r = LAT.runSelfCheck()
    expect(r.failures.join(' | ')).toBe('')
    expect(r.pass).toBe(true)
  })
})

/* ════════════════════════════════════════════════════════════════ atlas */

describe('lbm/atlas: Z-tile 图集', () => {
  const SIZES: [number, number, number][] = [
    [8, 8, 8], [17, 5, 13], [64, 64, 1], [3, 3, 7], [96, 48, 48], [96, 40, 40],
  ]

  it('★ cellToTexel / texelToCell 喺成个网格上係严格互逆嘅双射', () => {
    for (const [nx, ny, nz] of SIZES) {
      const A = ATLAS.layout(nx, ny, nz)
      const seen = new Set<number>()
      for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const [u, v] = ATLAS.cellToTexel(A, x, y, z)
        expect(u >= 0 && u < A.width && v >= 0 && v < A.height).toBe(true)
        const key = v * A.width + u
        expect(seen.has(key)).toBe(false)      // 单射
        seen.add(key)
        const [bx, by, bz] = ATLAS.texelToCell(A, u, v)
        expect(bx).toBe(x); expect(by).toBe(y); expect(bz).toBe(z)   // 来回不变
      }
      expect(seen.size).toBe(nx * ny * nz)
    }
  })

  it('★ padding 数得清：每个 texel 唔係真 cell 就係 z >= nz，冇第三种', () => {
    for (const [nx, ny, nz] of SIZES) {
      const A = ATLAS.layout(nx, ny, nz)
      let real = 0, pad = 0
      for (let v = 0; v < A.height; v++) for (let u = 0; u < A.width; u++) {
        const [, , z] = ATLAS.texelToCell(A, u, v)
        if (z < nz) real++; else pad++
      }
      expect(real).toBe(nx * ny * nz)
      expect(real).toBe(A.cells)
      expect(pad).toBe(A.padTexels)
      expect(real + pad).toBe(A.texels)
      expect(A.texels).toBe(A.width * A.height)
      expect(A.tx * A.ty >= nz).toBe(true)
    }
  })

  it('tile 数係按「尽量方 + 少 padding」评分拣嘅', () => {
    for (const [nx, ny, nz] of SIZES) {
      const A = ATLAS.layout(nx, ny, nz)
      const score = (tx: number) => {
        const ty = Math.ceil(nz / tx), w = tx * nx, h = ty * ny
        return Math.max(w, h) / Math.min(w, h) + 0.001 * (tx * ty - nz)
      }
      const mine = score(A.tx)
      for (let tx = 1; tx <= nz; tx++) expect(score(tx) >= mine - 1e-12).toBe(true)
    }
  })

  it('装唔落 texture limit 要掟错，唔可以静静鸡截断', () => {
    expect(() => ATLAS.layout(4096, 4096, 4096, 16384)).toThrow()
    expect(() => ATLAS.layout(0, 8, 8)).toThrow()
  })

  it('GLSL header 把尺寸烘成字面 #define（唔係 uniform → compiler 先变得到 shift）', () => {
    const A = ATLAS.layout(96, 48, 48)
    const h = ATLAS.glslHeader(A)
    expect(h).toContain('#define NX 96')
    expect(h).toContain('#define NY 48')
    expect(h).toContain('#define NZ 48')
    expect(h).toContain('#define TX ' + A.tx)
    expect(h).toContain('#define TY ' + A.ty)
    expect(h).toContain('#define ATLAS_W ' + A.width)
    expect(h).toContain('#define ATLAS_H ' + A.height)
    expect(h).toContain('bool isPadding(ivec3 c) { return c.z >= NZ; }')
    // 每次读都必须係 texelFetch —— header 要留返个警告畀下一个人
    expect(h).toContain('NEVER sample the atlas with filtering')
  })

  it('atlas.runSelfCheck() 全绿', () => {
    const r = ATLAS.runSelfCheck()
    expect(r.failures.join(' | ')).toBe('')
    expect(r.pass).toBe(true)
  })
})

/* ══════════════════════════════════════════════════════════════ shaders */

describe('lbm/shaders: GLSL 生成器', () => {
  const A = ATLAS.layout(16, 8, 8)
  const all = SH.generateAll(A)
  const names = Object.keys(all)
  const step = all.step

  it('每个生成物嘅大括号同圆括号都平衡', () => {
    for (const name of names) {
      const code = SH.stripGlslComments(all[name])
      let depth = 0, par = 0, minDepth = 0
      for (let k = 0; k < code.length; k++) {
        const ch = code[k]
        if (ch === '{') depth++; else if (ch === '}') depth--
        if (ch === '(') par++; else if (ch === ')') par--
        if (depth < minDepth) minDepth = depth
      }
      expect(name + ':braces=' + depth).toBe(name + ':braces=0')
      expect(name + ':parens=' + par).toBe(name + ':parens=0')
      expect(name + ':minDepth=' + minDepth).toBe(name + ':minDepth=0')
    }
  })

  it('冇 GLSL ES 1.00 嘅遗物：texture2D / gl_FragColor / #version', () => {
    for (const name of names) {
      const code = SH.stripGlslComments(all[name])
      expect(name + (code.indexOf('texture2D') < 0 ? ':ok' : ':HAS texture2D')).toBe(name + ':ok')
      expect(name + (code.indexOf('gl_FragColor') < 0 ? ':ok' : ':HAS gl_FragColor')).toBe(name + ':ok')
      // #version 由 GL 层前置，生成器唔可以自己发射
      expect(name + (code.indexOf('#version') < 0 ? ':ok' : ':HAS #version')).toBe(name + ':ok')
    }
  })

  it('★ 冇整数除法（GLSL 会静静鸡算成 0）', () => {
    for (const name of names) {
      const code = SH.stripGlslComments(all[name])
      const hit = code.match(/[^.\w]\d+\s*\/\s*\d+[^.\w]/)
      expect(name + (hit ? ':INT DIV ' + hit[0] : ':ok')).toBe(name + ':ok')
      // 顺手：vec 构造子入面唔可以有裸整数
      const bad = code.replace(/vec[234]\(0\)/g, '').match(/\bvec[234]\((\s*-?\d+\s*[,)])/)
      expect(name + (bad ? ':INT IN VEC ' + bad[0] : ':ok')).toBe(name + ':ok')
    }
  })

  it('★ 发射出嚟嘅 GLSL 全部係纯 ASCII（ANGLE / D3D 见到非 ASCII 会直接 compile error）', () => {
    for (const name of names) {
      const bad = all[name].match(/[^\x00-\x7F]/)
      expect(name + (bad ? ':NON-ASCII ' + JSON.stringify(bad[0]) : ':ok')).toBe(name + ':ok')
    }
  })

  it('★ 十九个方向【全部展开】，一个都唔少', () => {
    for (let i = 0; i < Q; i++) expect(step).toContain('// ---- direction ' + i + ' ')
    // 而且真係展开 —— 唔可以有「for (int i = 0; i < 19」嘅 gather loop
    expect(SH.stripGlslComments(step).indexOf('i < 19') < 0).toBe(true)
    // 每个方向都要有自己嘅邻居 fetch（i=0 除外，佢读自己）
    const fetches = step.match(/texelFetch\(uG[0-4], cellToTexel/g) || []
    expect(fetches.length >= Q - 1).toBe(true)
  })

  it('★ 自己个 texel 啱啱好读五次（十九个 g 装喺五个 RGBA target）', () => {
    const self = step.match(/texelFetch\(uG[0-4], T, 0\)/g) || []
    expect(self).toHaveLength(5)
    for (let t = 0; t < LAT.N_TARGETS; t++) {
      expect(step).toContain('vec4 s' + t + ' = texelFetch(uG' + t + ', T, 0);')
      expect(step).toContain('layout(location = ' + t + ') out vec4 oG' + t + ';')
    }
  })

  it('★ 保留嘅第 20 个槽写 0.0', () => {
    expect(step).toContain('oG4 = vec4(o[16], o[17], o[18], 0.0);')
    expect(all.init).toContain('oG4 = vec4(e[16], e[17], e[18], 0.0);')
  })

  // ───────────── ★ Smagorinsky 符号 ★ ─────────────
  it('★ omega_minus 必须由【涡黏改咗之后】嘅 omega_plus + 定死嘅 Lambda 推出嚟', () => {
    // (a) 文本：wm 用 wp（改咗嘅），唔係 uOmegaPlus（分子黏度嗰个）
    expect(step).toContain('float wm = 1.0 / (uMagic / (1.0 / wp - 0.5) + 0.5);')
    // (b) 次序：wm 一定要喺 LES 修正咗 wp 之后先算
    const iLes = step.indexOf('wp = 1.0 / tauT;')
    const iWm = step.indexOf('float wm =')
    expect(iLes).toBeGreaterThan(0)
    expect(iWm).toBeGreaterThan(iLes)
    // (c) uMagic 只可以係 uniform（CPU 每帧由钉死嘅 omega_minus 反推），
    //     shader 入面绝对唔可以用涡黏后嘅值重算 Lambda
    expect(SH.stripGlslComments(step).indexOf('uMagic =') < 0).toBe(true)
    // (d) 根式形式
    expect(step).toContain('float tauT = 0.5 * (tau0 + sqrt(tau0*tau0 + 18.0 * uLesCs * uLesCs * Qbar / rho));')
    // (e) 数值：跌 wp → 升 wm。符号一反，次网格模型就会摧毁佢本来用嚟稳定嘅嘢。
    const wpMol = LAT.omegaFromNu(1e-4)
    const lam = LAT.lambdaFromOmegas(wpMol, LAT.OMEGA_MINUS)
    const wmLes = LAT.omegaMinusFromLambda(wpMol * 0.85, lam)
    expect(wmLes).toBeGreaterThan(LAT.OMEGA_MINUS)
    // 反面：如果有人改成由涡黏后嘅 wp 重算 Lambda（= 钉死 wm），符号就冇咗
    const lamWrong = LAT.lambdaFromOmegas(wpMol * 0.85, LAT.OMEGA_MINUS)
    expect(LAT.omegaMinusFromLambda(wpMol * 0.85, lamWrong)).toBeCloseTo(LAT.OMEGA_MINUS, 12)
  })

  it('★ 动量交换用 dP = -c(gIn+gOut) - uw(gIn-gOut)，而且【冇】-2 w c 归一化项', () => {
    expect(step).toMatch(/vec3 dP = -vec3\([^)]*\) \* \(gIn \+ gOut\) - uw \* \(gIn - gOut\);/)
    // 十八条非静止方向每条都要有自己嗰行
    const dps = step.match(/vec3 dP = -vec3\([^)]*\) \* \(gIn \+ gOut\) - uw \* \(gIn - gOut\);/g) || []
    expect(dps).toHaveLength(Q - 1)
    // 归一化项唔可以偷偷返嚟
    const code = SH.stripGlslComments(step)
    expect(/2\.0\s*\*\s*W\[/.test(code)).toBe(false)
    expect(code.indexOf('dP -=') < 0).toBe(true)
    // 而且要留低点解唔加嘅解释
    expect(step).toContain('DELIBERATELY DROPPED')
  })

  it('★ free-slip 镜射有 mSolid 守卫（唔係就每步喺接触面删走质量同动量）', () => {
    expect(step).toContain('bool mSolid = nearBody && phiAt(mg) < 0.0;')
    expect(step).toMatch(/g\[\d+\] = mSolid \? s\d\.[xyzw] : texelFetch\(uG[0-4], cellToTexel\(mg\), 0\)\.[xyzw];/)
    // 预设四面 free-slip → 一定要真係生成到镜射读
    expect(step).toContain('specular -> direction')
  })

  it('入口係整格覆写 + Guo 非平衡外推，而且【唔會】提早 return', () => {
    expect(step).toContain('the driven inlet layer')
    expect(step).toContain('e[0] += gn[0] - eN[0];')          // NEEM
    const a = step.indexOf('the driven inlet layer')
    const b = step.indexOf('Our own nineteen post-collision')
    const block = step.slice(a, b)
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(a)
    expect(block.indexOf('return;') < 0).toBe(true)            // 要跌落去照碰撞
    expect(block).toContain('isInlet = true;')
    // 十九个 gather 一定要喺入口块【之后】先被 isInlet 跳过
    expect(step.indexOf('if (!isInlet) {')).toBeGreaterThan(b)
  })

  it('出口係零梯度 + 二次海绵层', () => {
    expect(step).toContain('zero gradient')
    expect(step).toContain('return uSpongeStrength * t * t;')
    expect(SH.SPONGE_CELLS).toBe(16)
    expect(SH.SPONGE_STRENGTH).toBe(0.35)
  })

  it('★ Bouzidi 代码路径生成咗，但预设【熄】', () => {
    expect(all.step.indexOf('#define BOUZIDI') < 0).toBe(true)
    expect(all.stepBouzidi).toContain('#define BOUZIDI 1')
    // 两条分支都要喺度（#ifdef 包住），唔係将来开唔到
    expect(step).toContain('gOut = 2.0 * q * gIn + (1.0 - 2.0 * q) * far + wallTerm;')
    expect(step).toMatch(/gOut = inv \* gIn \+ \(2\.0 \* q - 1\.0\) \* inv \* s\d\.[xyzw] \+ wallTerm \* inv;/)
    expect(step).toContain('#else')
    expect(step).toContain('gOut = gIn + wallTerm;')
  })

  it('预设 nearBody gate 係无条件（我哋只有二值体素 mask）', () => {
    expect(step).toContain('bool nearBody = true;')
    expect(all.stepSdfGate).toContain('bool nearBody = phi < 2.5;')
  })

  it('TRT 碰撞逐对相反方向做，九对 + 一个静止', () => {
    const pairs = step.match(/float gp = 0\.5 \* \(g\[\d+\] \+ g\[\d+\]\), gm = 0\.5 \* \(g\[\d+\] - g\[\d+\]\);/g) || []
    expect(pairs).toHaveLength(9)
    const relax = step.match(/o\[\d+\] = g\[\d+\] - wp \* \(gp - ep\) [+-] wm \* \(gm - em\);/g) || []
    expect(relax).toHaveLength(18)
    expect(step).toContain('o[0] = g[0] - wp * (g[0] - e[0]);')   // i=0 冇反对称部分
  })

  it('全周期变体唔会生成任何面条件或者入口', () => {
    expect(all.stepPeriodic.indexOf('bool o0') < 0).toBe(true)
    expect(all.stepPeriodic).toContain('% NX')
    expect(all.stepPeriodic.indexOf('the driven inlet layer') < 0).toBe(true)
  })

  it('shaders.runSelfCheck() 全绿', () => {
    const r = SH.runSelfCheck()
    expect(r.failures.join(' | ')).toBe('')
    expect(r.pass).toBe(true)
  })
})

/* ══════════════════════════════════ 迷你 runner 嘅收尾（有 host 就唔会行） */

if (!useHost) {
  const failed = cases.filter((c) => c.error !== null)
  for (const c of cases) console.log((c.error === null ? 'ok   ' : 'FAIL ') + c.name + (c.error ? '\n       ' + c.error : ''))
  console.log('\n' + (cases.length - failed.length) + '/' + cases.length + ' passed')
  if (failed.length) {
    const proc = (globalThis as { process?: { exitCode?: number } }).process
    if (proc) proc.exitCode = 1
  }
}
