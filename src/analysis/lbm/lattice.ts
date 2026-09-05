// D3Q19 格子表 —— GPU LBM 嘅【唯一真相来源】。
//
// CPU 参考解（src/analysis/windtunnel.ts）同 GPU shader（./shaders.ts）都由呢度攞方向表：
// GLSL 系由呢个文件嘅数组【生成】出嚟，唔系人手抄。两边如果对唔上，咁就系一个地方打错字，
// 唔系两个地方 —— 而 runSelfCheck() / __tests__ 会捉到。
//
// ⚠️ 呢张表同 windtunnel.ts 嗰张【次序唔同】。唔好撈埋用。
//
//
// 次序（THE ORDERING）
// ───────────────────
// 方向排到【相反方向永远相邻】：
//
//      i = 0                    静止
//      i = 1,2  3,4  5,6        六个面邻 (+x,-x, +y,-y, +z,-z)
//      i = 7..18                十二个棱邻
//
// 咁 opposite index 就系两条指令，唔使查表：
//
//      opp(0) = 0
//      opp(i) = i + 1   (i 系单数)
//      opp(i) = i - 1   (i 系双数)
//
// 反弹（bounce-back）、TRT 对称/反对称拆分、动量交换求和 全部靠呢个性质。
// 值得为咗佢忍受一张非字母序嘅表。
//
//
// 偏差形式（THE DEVIATION FORM）—— 改解算器之前一定要读
// ────────────────────────────────────────────────────
// 我哋【永远唔存 f_i】，我哋存
//
//      g_i = f_i - w_i
//
// 因为有趣嘅物理住喺【相对静止态嘅偏差】入面。密度 rho = 1 + delta，喺我哋跑嘅马赫数下
// delta 系 1e-4 量级；画喺零件表面嘅压力系 p = c_s² · delta。
// 如果存 f_i（每个 ~0.05，有个 ~0.33）再喺 fp32 加十九个，绝对误差 ~2e-7 ——
// 即系 delta 有 0.2% 误差，压力图【肉眼可见嘅噪】。存 g_i 同一条和误差得 ~1e-9。
//
// 因为 sum(w_i) = 1 同 sum(w_i c_i) = 0，所有恒等式都过得到:
//
//      rho    = 1 + sum_i g_i
//      rho u  =     sum_i g_i c_i          （w_i c_i 项【完全】抵消）
//      g_i^eq = w_i ( delta + rho (3 (c·u) + 4.5 (c·u)² - 1.5 u·u) )
//
// 反弹依然系 g_opp(i) <- g_i，因为 w_opp(i) = w_i。
//
// 唯一改变咗嘅：静止态 = g_i 全 0 —— 即系【texture clear 到 0 就等于 rho=1 嘅静止流体】。
// 呢个係一个好靓嘅巧合。

export const Q = 19

/** c_i，flat triple。相反方向相邻（见文件头）。 */
export const C = new Int8Array([
  0, 0, 0,      /*  0  静止            */
  1, 0, 0,      /*  1  +x              */
  -1, 0, 0,     /*  2  -x              */
  0, 1, 0,      /*  3  +y              */
  0, -1, 0,     /*  4  -y              */
  0, 0, 1,      /*  5  +z              */
  0, 0, -1,     /*  6  -z              */
  1, 1, 0,      /*  7  +x+y            */
  -1, -1, 0,    /*  8  -x-y            */
  1, -1, 0,     /*  9  +x-y            */
  -1, 1, 0,     /* 10  -x+y            */
  1, 0, 1,      /* 11  +x+z            */
  -1, 0, -1,    /* 12  -x-z            */
  1, 0, -1,     /* 13  +x-z            */
  -1, 0, 1,     /* 14  -x+z            */
  0, 1, 1,      /* 15  +y+z            */
  0, -1, -1,    /* 16  -y-z            */
  0, 1, -1,     /* 17  +y-z            */
  0, -1, 1,     /* 18  -y+z            */
])

const W1 = 1 / 3, W2 = 1 / 18, W3 = 1 / 36
export const W = new Float64Array([
  W1,
  W2, W2, W2, W2, W2, W2,
  W3, W3, W3, W3, W3, W3, W3, W3, W3, W3, W3, W3,
])

/** 相反方向索引。预先算好，但 shader 用嘅系下面 opp() 嘅闭式。 */
export const OPP = new Int8Array(Q)
OPP[0] = 0
for (let i = 1; i < Q; i++) OPP[i] = (i & 1) ? i + 1 : i - 1

export function opp(i: number): number { return i === 0 ? 0 : ((i & 1) ? i + 1 : i - 1) }

export const CS2 = 1 / 3            // 格子声速平方
export const INV_CS2 = 3
export const CS = Math.sqrt(CS2)

// ── 打包：g_i 住喺 render target (i>>2) 嘅 channel (i&3) ──
// 19 个方向 → 5 个 RGBA target。第 20 个槽 (target 4, channel 3) 冇用，【必须写 0.0】：
// 唔写就系未初始化嘅垃圾，某啲 driver 会当 NaN 传返落去。
export function packTarget(i: number): number { return i >> 2 }
export function packChannel(i: number): number { return i & 3 }
export const N_TARGETS = 5

// ── 烘死落 GPU 解算器嘅物理设定（同 GPU 无关，纯粹系准确度）──
/** 入口格子速度。Ma = u·√3 = 0.087；O(Ma²) 压缩性误差 ~0.75%。
 *  windtunnel.ts（CPU）用 0.1 → ~3%。呢度收细一半。 */
export const U_LB = 0.05
/** TRT 反对称弛豫率，【钉死】。★ 唔好反过嚟钉 Lambda = 3/16 ★ —— 见 omegaMinusFromLambda 嘅注释。 */
export const OMEGA_MINUS = 0.8
/** Smagorinsky 常数。windtunnel.ts 用 0.14；参考实现用 0.12（少啲过度耗散）。 */
export const LES_CS = 0.12

/* ─────────────────────────────────────────────────────────── 物理 */

type Out = Float64Array | Float32Array | number[]

/**
 * g_i^eq（偏差形式），写入 out（长度 19）。
 * delta = rho - 1。rho 一齐传入，唔好喺入面由 delta 重建 —— 咁就白费咗偏差形式。
 */
export function equilibriumDev(out: Out, delta: number, ux: number, uy: number, uz: number): Out {
  const rho = 1 + delta
  const usq = 1.5 * (ux * ux + uy * uy + uz * uz)
  for (let i = 0; i < Q; i++) {
    const cu = C[i * 3] * ux + C[i * 3 + 1] * uy + C[i * 3 + 2] * uz
    out[i] = W[i] * (delta + rho * (3 * cu + 4.5 * cu * cu - usq))
  }
  return out
}

/** 普通 f_i^eq —— 畀想用 f 而唔系 g 讲嘢嘅测试用。 */
export function equilibrium(out: Out, rho: number, ux: number, uy: number, uz: number): Out {
  const usq = 1.5 * (ux * ux + uy * uy + uz * uz)
  for (let i = 0; i < Q; i++) {
    const cu = C[i * 3] * ux + C[i * 3 + 1] * uy + C[i * 3 + 2] * uz
    out[i] = W[i] * rho * (1 + 3 * cu + 4.5 * cu * cu - usq)
  }
  return out
}

/** 由偏差分布攞 delta = rho - 1 同动量 rho·u → out[0..3]。 */
export function momentsDev(g: ArrayLike<number>, out: Out): Out {
  let d = 0, jx = 0, jy = 0, jz = 0
  for (let i = 0; i < Q; i++) {
    const gi = g[i]
    d += gi
    jx += gi * C[i * 3]
    jy += gi * C[i * 3 + 1]
    jz += gi * C[i * 3 + 2]
  }
  out[0] = d; out[1] = jx; out[2] = jy; out[3] = jz
  return out
}

/* nu = c_s² (1/omega - 1/2)  <=>  omega = 1 / (nu/c_s² + 1/2) */
export function omegaFromNu(nu: number): number { return 1 / (nu * INV_CS2 + 0.5) }
export function nuFromOmega(omega: number): number { return CS2 * (1 / omega - 0.5) }

/**
 * TRT：反对称弛豫率由对称率同 magic 参数决定。
 *
 *   Lambda = (1/omega_plus - 1/2)(1/omega_minus - 1/2)
 *
 * Lambda = 3/16  令直身反弹壁【啱啱好】喺两个格点中间，同黏度无关（Ginzburg & Adler 1994）。
 *                阻力取决于「壁以为自己喺边」，所以呢个理论上先系我哋想要嗰个。
 * Lambda = 1/4   传说中「最稳」—— 但只系喺 tau = 1 嗰阵。
 * Lambda = 1/12  消三阶空间误差。
 * Lambda = 1/6   消四阶误差（纯对流最靓）。
 *
 * ★★ 陷阱（参考实现话花咗佢一日）★★
 * 反过嚟写：omega_minus = 1 / (Lambda/(3 nu) + 1/2)。【钉死 Lambda】再收细 nu ——
 * 即系你为咗谷高雷诺数会做嘅嘢 —— omega_minus 就跌向零。喺风洞想要嘅黏度下，
 * Lambda = 3/16 畀出 omega_minus = 0.03 ~ 0.09：反对称非平衡态几乎【完全冇被弛豫】，
 * 佢喺格子上无阻尼咁对流、然后长大。参考实现实测（十格球、自由滑壁、2500 步、max|u|/U）：
 *
 *        omega_minus   0.05   0.08   0.12   0.20   0.40   0.80   1.20
 *   omega+ = 1.9277    1.25   1.25   1.24   1.25   1.26   1.27   1.27
 *   omega+ = 1.9512    NaN  98168!   1.25   1.27   1.28   1.29   1.30
 *   omega+ = 1.9632    NaN    NaN    NaN    1.87   1.29   1.30   1.30
 *   omega+ = 1.9704    NaN    NaN    NaN    NaN    1.30   1.31   1.31
 *   omega+ = 1.9802    NaN    NaN    NaN    NaN  198560!  1.33   1.33
 *
 * 所以：【唔好钉 Lambda，要钉 omega_minus】（= OMEGA_MINUS = 0.8），畀 Lambda 跟住走。
 * 一旦鬼模态被阻尼，Cd 几乎唔郁（omega_minus 0.8 → 1.2 只差 0.6%），所以冇牺牲准确度。
 */
export function omegaMinusFromLambda(omegaPlus: number, Lambda: number): number {
  const tauMinusHalf = Lambda / (1 / omegaPlus - 0.5)
  return 1 / (tauMinusHalf + 0.5)
}

/** 反函数：要达到指定嘅奇模态弛豫率，magic 参数应该係几多。每帧由呢个算 uMagic。 */
export function lambdaFromOmegas(omegaPlus: number, omegaMinus: number): number {
  return (1 / omegaPlus - 0.5) * (1 / omegaMinus - 0.5)
}

export const MAGIC = { WALL: 3 / 16, STABLE: 1 / 4, THIRD_ORDER: 1 / 12, FOURTH_ORDER: 1 / 6 } as const

/* ─────────────────────────────────────────────────────────── GLSL */

/**
 * float64 → GLSL 字面量。位数够令 float64 → 文字 → float32 唔走样（9-10 位有效数字），
 * 同时仲读得明。runSelfCheck() 会逐个字面量验 Math.fround 来回不变。
 */
export function glslFloat(x: number): string {
  if (Number.isInteger(x)) return x.toFixed(1)
  const s = x.toPrecision(10)
  // 只有喺「有小数点、冇指数」嘅时候先剪尾零 —— 否则 "1e+20" 会畀剪走位数。
  if (s.indexOf('.') < 0 || s.indexOf('e') >= 0 || s.indexOf('E') >= 0) return s
  return s.replace(/0+$/, '').replace(/\.$/, '.0')
}

/** 把方向表 / 权重 / 声速 发射成 GLSL const 数组同 #define。 */
export function glslHeader(): string {
  const cs: string[] = []
  for (let i = 0; i < Q; i++) cs.push('ivec3(' + C[i * 3] + ',' + C[i * 3 + 1] + ',' + C[i * 3 + 2] + ')')
  const ws: string[] = []
  for (let i = 0; i < Q; i++) ws.push(glslFloat(W[i]))
  return [
    '// ---- generated from src/analysis/lbm/lattice.ts. Do not hand-edit. ----',
    '#define Q 19',
    '#define CS2 ' + glslFloat(CS2),
    '#define INV_CS2 3.0',
    'const ivec3 C[19] = ivec3[19](' + cs.join(', ') + ');',
    'const float W[19] = float[19](' + ws.join(', ') + ');',
    '// opposite index, no table needed: pairs are adjacent',
    'int oppIdx(int i) { return i == 0 ? 0 : ((i % 2 == 1) ? i + 1 : i - 1); }',
    '',
  ].join('\n')
}

/* ─────────────────────────────────────────────── runSelfCheck */

export interface SelfCheckResult { pass: boolean; failures: string[] }

/**
 * 唔使 GL、唔使 test runner 都跑得嘅自检。
 * 用法： node --experimental-strip-types -e "import('./src/analysis/lbm/lattice.ts').then(m=>console.log(m.runSelfCheck()))"
 * 或者喺 browser console： (await import('/src/analysis/lbm/lattice.ts')).runSelfCheck()
 */
export function runSelfCheck(): SelfCheckResult {
  const failures: string[] = []
  const ck = (c: boolean, m: string) => { if (!c) failures.push(m) }
  const close = (a: number, b: number, tol: number, m: string) => {
    if (!(Math.abs(a - b) <= tol)) failures.push(m + ' (' + a + ' vs ' + b + ')')
  }
  const d = (x: number, y: number) => (x === y ? 1 : 0)
  let i = 0, a = 0, b = 0

  // 1. 权重和 = 1
  let s = 0; for (i = 0; i < Q; i++) s += W[i]
  close(s, 1, 1e-15, 'sum w_i != 1')

  // 2. opp 系对合，c[opp(i)] = -c[i]，w[opp(i)] = w[i]
  for (i = 0; i < Q; i++) {
    ck(opp(opp(i)) === i, 'opp is not an involution at i=' + i)
    ck(OPP[i] === opp(i), 'OPP table disagrees with closed form at i=' + i)
    for (a = 0; a < 3; a++) ck(C[opp(i) * 3 + a] === -C[i * 3 + a], 'c[opp(' + i + ')] != -c[' + i + ']')
    close(W[opp(i)], W[i], 1e-18, 'w[opp(i)] != w[i] at i=' + i)
  }

  // 3. 每个 c_i 唯一，而且集合啱啱好系 {0} ∪ 六面 ∪ 十二棱
  const seen = new Set<string>()
  let nFace = 0, nEdge = 0, nRest = 0
  for (i = 0; i < Q; i++) {
    const key = C[i * 3] + ',' + C[i * 3 + 1] + ',' + C[i * 3 + 2]
    ck(!seen.has(key), 'duplicate direction ' + key)
    seen.add(key)
    const n = Math.abs(C[i * 3]) + Math.abs(C[i * 3 + 1]) + Math.abs(C[i * 3 + 2])
    if (n === 0) nRest++
    else if (n === 1) nFace++
    else if (n === 2) nEdge++
    else failures.push('direction ' + key + ' has |c|_1 = ' + n + ', not a D3Q19 velocity')
  }
  ck(nRest === 1 && nFace === 6 && nEdge === 12, 'expected 1 rest + 6 face + 12 edge, got ' + nRest + '/' + nFace + '/' + nEdge)

  // 4. 格子各向同性：w_i c_i 嘅一至四阶矩
  //    M1 = 0, M2 = c_s² δ_ab, M3 = 0, M4 = c_s⁴ (δ_ab δ_cd + δ_ac δ_bd + δ_ad δ_bc)
  for (a = 0; a < 3; a++) {
    let m1 = 0; for (i = 0; i < Q; i++) m1 += W[i] * C[i * 3 + a]
    close(m1, 0, 1e-15, 'first moment nonzero on axis ' + a)
    for (b = 0; b < 3; b++) {
      let m2 = 0; for (i = 0; i < Q; i++) m2 += W[i] * C[i * 3 + a] * C[i * 3 + b]
      close(m2, CS2 * d(a, b), 1e-15, 'second moment [' + a + b + ']')
      for (let c = 0; c < 3; c++) {
        let m3 = 0; for (i = 0; i < Q; i++) m3 += W[i] * C[i * 3 + a] * C[i * 3 + b] * C[i * 3 + c]
        close(m3, 0, 1e-15, 'third moment [' + a + b + c + ']')
        for (let e = 0; e < 3; e++) {
          let m4 = 0
          for (i = 0; i < Q; i++) m4 += W[i] * C[i * 3 + a] * C[i * 3 + b] * C[i * 3 + c] * C[i * 3 + e]
          const want = CS2 * CS2 * (d(a, b) * d(c, e) + d(a, c) * d(b, e) + d(a, e) * d(b, c))
          close(m4, want, 1e-15, 'fourth moment [' + a + b + c + e + ']')
        }
      }
    }
  }

  // 5. 平衡态【完全】重现佢自己嘅矩
  const rho = 1.0037, ux = 0.043, uy = -0.021, uz = 0.011
  const f = new Float64Array(Q)
  equilibrium(f, rho, ux, uy, uz)
  let sf = 0, jx = 0, jy = 0, jz = 0
  for (i = 0; i < Q; i++) { sf += f[i]; jx += f[i] * C[i * 3]; jy += f[i] * C[i * 3 + 1]; jz += f[i] * C[i * 3 + 2] }
  close(sf, rho, 1e-14, 'sum f^eq != rho')
  close(jx, rho * ux, 1e-14, 'sum f^eq c_x != rho u_x')
  close(jy, rho * uy, 1e-14, 'sum f^eq c_y != rho u_y')
  close(jz, rho * uz, 1e-14, 'sum f^eq c_z != rho u_z')
  const u = [ux, uy, uz]
  for (a = 0; a < 3; a++) for (b = 0; b < 3; b++) {
    let pab = 0; for (i = 0; i < Q; i++) pab += f[i] * C[i * 3 + a] * C[i * 3 + b]
    close(pab, rho * CS2 * d(a, b) + rho * u[a] * u[b], 1e-14, 'second moment of f^eq [' + a + b + ']')
  }

  // 6. 偏差形式【啱啱好】= f^eq - w_i，而且佢嘅矩啱
  const g = new Float64Array(Q)
  equilibriumDev(g, rho - 1, ux, uy, uz)
  for (i = 0; i < Q; i++) close(g[i], f[i] - W[i], 1e-15, 'g^eq != f^eq - w at i=' + i)
  const mo = new Float64Array(4)
  momentsDev(g, mo)
  close(mo[0], rho - 1, 1e-14, 'momentsDev delta')
  close(mo[1], rho * ux, 1e-14, 'momentsDev jx')
  close(mo[2], rho * uy, 1e-14, 'momentsDev jy')
  close(mo[3], rho * uz, 1e-14, 'momentsDev jz')

  // 7. 偏差形式嘅静止态【完全等于零】—— clear-to-zero 呢招就系靠佢
  equilibriumDev(g, 0, 0, 0, 0)
  for (i = 0; i < Q; i++) close(g[i], 0, 1e-18, 'rest state is not zero at i=' + i)

  // 8. 黏度 ↔ omega 来回，同 TRT magic 关系（连「涡黏必须抬高 omega_minus」个符号）
  for (let nu = 1e-5; nu < 0.3; nu *= 3) {
    const om = omegaFromNu(nu)
    close(nuFromOmega(om), nu, 1e-12 + nu * 1e-9, 'nu/omega round trip at nu=' + nu)
    ck(om > 0 && om < 2, 'omega out of (0,2) at nu=' + nu)
    for (const L of Object.keys(MAGIC) as (keyof typeof MAGIC)[]) {
      const lam = MAGIC[L]
      const omM = omegaMinusFromLambda(om, lam)
      close((1 / om - 0.5) * (1 / omM - 0.5), lam, 1e-10, 'magic parameter ' + L + ' not reproduced at nu=' + nu)
      ck(omM > 0 && omM < 2, 'omega_minus out of (0,2) for ' + L + ' at nu=' + nu)
    }
    for (const want of [0.2, 0.5, 0.8, 1.0, 1.4]) {
      const lamW = lambdaFromOmegas(om, want)
      close(omegaMinusFromLambda(om, lamW), want, 1e-10, 'lambdaFromOmegas round trip at nu=' + nu + ' omega-=' + want)
    }
    // ★ 符号钉死：涡黏令 omega_plus 跌 → Lambda 钉死之下 omega_minus 会【升】（离开危险角落）。
    //   如果将来有人改成钉 omega_minus、或者用涡黏后嘅值重算 Lambda，呢个符号会反转，
    //   次网格模型就会开始摧毁佢本来用嚟稳定嘅嘢。
    const lamPinned = lambdaFromOmegas(om, OMEGA_MINUS)
    ck(omegaMinusFromLambda(om * 0.85, lamPinned) > OMEGA_MINUS,
      'the eddy viscosity must RAISE omega_minus, not lower it (nu=' + nu + ')')
    if (nu < 0.01) {
      ck(omegaMinusFromLambda(om, MAGIC.WALL) < 0.15,
        'at nu=' + nu + ' Lambda=3/16 should give a nearly unrelaxed odd mode; if it no longer does, the comment above is wrong')
      ck(omegaMinusFromLambda(om, MAGIC.STABLE) < omegaMinusFromLambda(om, MAGIC.WALL),
        'Lambda=1/4 relaxes the odd mode even more slowly than 3/16; it is not "the stable one" away from tau=1')
    }
  }

  // 9. 打包覆盖 0..18 各一次，而且从来唔踩保留槽 (4,3)
  const slots = new Set<number>()
  for (i = 0; i < Q; i++) {
    const t = packTarget(i), ch = packChannel(i)
    ck(t >= 0 && t < N_TARGETS, 'target out of range at i=' + i)
    ck(!slots.has(t * 4 + ch), 'packing collision at i=' + i)
    slots.add(t * 4 + ch)
  }
  ck(!slots.has(4 * 4 + 3), 'packing used the reserved slot (4,3)')
  ck(slots.size === Q, 'packing does not cover all 19')

  // 10. 生成出嚟嘅 GLSL 同 JS 表一致，而且【每个权重字面量 Math.fround 来回一模一样】
  const glsl = glslHeader()
  for (i = 0; i < Q; i++) {
    const want = 'ivec3(' + C[i * 3] + ',' + C[i * 3 + 1] + ',' + C[i * 3 + 2] + ')'
    ck(glsl.indexOf(want) >= 0, 'generated GLSL is missing direction ' + i + ' ' + want)
  }
  const m = glsl.match(/float\[19\]\(([^)]*)\)/)
  ck(!!m, 'generated GLSL has no weight array')
  if (m) {
    const lits = m[1].split(',').map((x) => parseFloat(x))
    ck(lits.length === Q, 'generated GLSL weight array has ' + lits.length + ' entries')
    for (i = 0; i < Q; i++) {
      ck(Math.fround(lits[i]) === Math.fround(W[i]),
        'weight literal ' + i + ' does not survive a float32 round trip (' + lits[i] + ' vs ' + W[i] + ')')
    }
  }

  return { pass: failures.length === 0, failures }
}
