// shaders.ts —— GLSL【生成器】。纯字符串，零 GL 调用 → 唔使 GL context 都单元测得。
//
// 十九个方向嘅 LBM step 系由 JS 喺呢度【展开】出嚟，用嘅系 lattice.ts 嗰张同 CPU 参考解
// 一模一样嘅表。呢个唔系为咗炫技：
//
//  · 人手写 D3Q19 kernel，最大机会嘅 bug 就系十九个「差唔多一样」嘅 block 入面有一个索引打错。
//    流场睇落【好合理】，阻力静静鸡差 5%。生成 = 方向表只存在一次、只测一次，打错字变成
//    结构上不可能。
//
//  · ★ 展开亦系速度嘅硬性要求 ★。写成
//        for (int i = 0; i < 19; i++) g[i] = fetchDir(i, c - C[i]);
//    嘅话，compiler 喺 compile time 决定唔到抽边张 texture，driver 就只可以二择其一：
//    要么将 array spill 落 scratch memory，要么每次 iteration 发五个 texelFetch 再拣。
//    两条路都系灾难。展开之后每张 texture、每个 channel 都系字面量，成个 gather 住晒 register。
//
//
// 存落 texture 嘅系【碰撞后】(post-collision) 状态
// ─────────────────────────────────────────────
// fragment shader 只可以 gather 唔可以 scatter，所以 streaming 一定要系 pull。
// pull【碰撞前】嘅值就要重新碰撞十九个邻居。所以 texture 存 g*（碰撞后），一个 pass 做:
//
//     由 (x - c_i) gather g*_i  →  嗰个就系 g_i(x, t+1)  →  碰撞  →  存 g*(x, t+1)
//
// 咁反弹就零成本：上一步射入墙嗰啲 population 就系【本 texel】嘅 g*_ibar，
// shader 已经 fetch 咗（自己十九个值 = 五个 RGBA read）。
//
// 每次读邻居都系 texelFetch。★ atlas 永远唔可以 filter ★ —— 见 atlas.ts 头嗰个大框。
//
//
// ★ 发射出嚟嘅 GLSL 一律纯 ASCII ★
// ──────────────────────────────
// 中文注释只可以留喺呢个 .ts 文件度。ANGLE / D3D 后端见到 shader source 有非 ASCII 字节
// 会直接 compile error（有啲 driver 仲要报一个完全无关嘅 line number），到时 debug 到呕。
// runSelfCheck() 有一条 lint 专门守住呢样嘢。
//
//
// 同参考实现（aeolus）嘅【蓄意分歧】—— Stage 5 睇呢度
// ──────────────────────────────────────────────
//  1. 单一物体：webcad 一次只吹一个零件。参考实现嘅 MAX_BODIES=8 / per-link body id fetch /
//     per-body 迎风面积 全部拆走（每条 bounce link 慳一次 texelFetch）。
//  2. 冇风扇（actuator disc）→ Guo forcing 项 F ≡ 0 → 碰撞化简成纯 TRT。
//  3. 冇移动物体 → 冇 uRefill / uMacroPrev / phiPrev。
//  4. 冇滚动路面 → 'bounce' 面系静止反弹（冇 uBeltU）。
//  5. nearBody gate 预设【无条件】—— 见 StepShaderOptions.nearBodyPhi，呢个系我哋只有
//     二值体素 mask 嘅直接后果。
//  6. Bouzidi 代码路径生成咗但预设【关】—— 同上，见下面。
//  7. 预设边界 = 入口/出口 + 四面自由滑移（CAD 风洞冇地面）。

// 用显式 .ts 后缀（tsconfig allowImportingTsExtensions 已开，src/cad/*.ts 亦有先例）：
// 咁样 `node --experimental-strip-types` 唔使 tests/ts-resolver.mjs 都行得，
// 自检可以喺任何地方一句 import 就跑。
import {
  Q, C, W, opp, glslFloat, packTarget, packChannel,
} from './lattice.ts'
import { glslHeader as atlasHeader, layout as atlasLayout } from './atlas.ts'
import type { AtlasLayout } from './atlas.ts'

export type FaceKind = 'periodic' | 'bounce' | 'freeslip' | 'inlet' | 'outlet'

export interface BoundaryConditions {
  xmin: FaceKind; xmax: FaceKind
  ymin: FaceKind; ymax: FaceKind
  zmin: FaceKind; zmax: FaceKind
}

/** 出口海绵层长度（cell）。尾流喺呢段渐渐被拉返自由流，唔会撞返出口再变鬼阵风飘返上游。 */
export const SPONGE_CELLS = 16
/** 海绵强度（0..1，二次渐升到出口）。 */
export const SPONGE_STRENGTH = 0.35

const FACES: (keyof BoundaryConditions)[] = ['xmin', 'xmax', 'ymin', 'ymax', 'zmin', 'zmax']

/** CAD 风洞预设：+X 吹入、-X 流出、四面自由滑移。 */
export const DEFAULT_BC: BoundaryConditions = {
  xmin: 'inlet', xmax: 'outlet',
  ymin: 'freeslip', ymax: 'freeslip',
  zmin: 'freeslip', zmax: 'freeslip',
}

// 边角位边个面赢：数值越大越优先。固体反弹一定压过一切（唔可以由墙度漏质量）。
const PRIORITY: Record<FaceKind, number> = { periodic: 0, freeslip: 1, outlet: 2, inlet: 3, bounce: 4 }

export interface StepShaderOptions {
  /** 六个面嘅边界种类；缺省 DEFAULT_BC。 */
  bc?: Partial<BoundaryConditions>
  /** 发射 oForce / oTorque 两个额外 render target（动量交换）。 */
  writeForce?: boolean
  /**
   * ★ Bouzidi 插值反弹。预设 false，而且【应该维持 false】★
   * 我哋只有 voxelize() 出嚟嘅【二值】mask，冇真距离场。喂二值 mask 落去，
   * q = phi/(phi-ph) 永远算到 ≈ 0.5 —— 即系同 halfway 反弹一模一样，
   * 但外表扮到好似有 sub-cell 精度。宁愿老老实实用 halfway。
   * Stage 5 如果整到真 SDF（chamfer / JFA），先至开呢个。
   */
  bouzidi?: boolean
  /**
   * nearBody gate：只有 phi < 呢个值先至去 probe 邻居系咪固体。
   *
   * 参考实现用 2.5：SDF 系 1-Lipschitz，D3Q19 最远邻居 √3 = 1.73 格，所以 phi >= 2.5
   * 【证明】冇邻居系固体 → 远场慳晒十八次 fetch。
   *
   * ★ 但我哋预设系 Infinity（= 无条件 probe）★，因为 webcad 上传嘅系二值体素 mask：
   * 流体格嘅 phi 系 +1，唔系真距离。用 2.5 gate 嘅话 +1 < 2.5 恒真，其实无害；
   * 但如果将来有人将流体格填 +1e9 慳内存，gate 就会全部 false、反弹【完全唔会发生】、
   * 阻力静静鸡变零。预设无条件 = 慢少少但永远啱。Stage 5 有真距离场先改 2.5。
   */
  nearBodyPhi?: number
}

/* ───────────────────────────────────────────── 小工具（全部纯字符串） */

function ci(i: number): [number, number, number] { return [C[i * 3], C[i * 3 + 1], C[i * 3 + 2]] }
const f = glslFloat

/** g_i 住喺 texture (i>>2)、channel (i&3)。 */
function texOf(i: number): number { return packTarget(i) }
function chOf(i: number): string { return 'xyzw'[packChannel(i)] }
function fetchG(i: number, cellExpr: string): string {
  return 'texelFetch(uG' + texOf(i) + ', cellToTexel(' + cellExpr + '), 0).' + chOf(i)
}
function selfG(i: number): string { return 's' + texOf(i) + '.' + chOf(i) }

/** 喺 axis a 镜射之后嘅方向索引。 */
function mirrorIdx(a: number, i: number): number {
  const c = ci(i); c[a] = -c[a]
  for (let j = 0; j < Q; j++) if (C[j * 3] === c[0] && C[j * 3 + 1] === c[1] && C[j * 3 + 2] === c[2]) return j
  throw new Error('no mirror for direction ' + i + ' about axis ' + a)
}

/** 点积 c_i · v 写成字面表达式："u.x + u.y"、"-u.x"、"0.0"。 */
function dotExpr(i: number, v: string): string {
  const c = ci(i), parts: string[] = []
  const comp = ['x', 'y', 'z']
  for (let a = 0; a < 3; a++) {
    if (c[a] === 1) parts.push('+ ' + v + '.' + comp[a])
    else if (c[a] === -1) parts.push('- ' + v + '.' + comp[a])
  }
  if (!parts.length) return '0.0'
  const s = parts.join(' ')
  return s.startsWith('+ ') ? s.slice(2) : s
}

function cLiteral(i: number): string { const c = ci(i); return 'vec3(' + f(c[0]) + ', ' + f(c[1]) + ', ' + f(c[2]) + ')' }
function cIvec(i: number): string { const c = ci(i); return 'ivec3(' + c[0] + ', ' + c[1] + ', ' + c[2] + ')' }

/** 十九个 e[i] 展开成一段平衡态代码（唔用 loop，全部常数索引 → 住 register）。 */
function unrolledEquilibrium(deltaVar: string, uVar: string, outVar: string, indent: string): string[] {
  const out: string[] = []
  for (let i = 0; i < Q; i++) {
    const cu = dotExpr(i, uVar)
    if (cu === '0.0') out.push(indent + outVar + '[' + i + '] = ' + f(W[i]) + ' * (' + deltaVar + ' - rho * usq);')
    else out.push(indent + '{ float cu = ' + cu + '; ' + outVar + '[' + i + '] = ' + f(W[i]) + ' * (' + deltaVar + ' + rho * (3.0 * cu + 4.5 * cu * cu - usq)); }')
  }
  return out
}

/** 把十九个值 pack 返五个 RGBA output。 */
function packOut(src: string): string[] {
  return [
    '  oG0 = vec4(' + src + '[0], ' + src + '[1], ' + src + '[2], ' + src + '[3]);',
    '  oG1 = vec4(' + src + '[4], ' + src + '[5], ' + src + '[6], ' + src + '[7]);',
    '  oG2 = vec4(' + src + '[8], ' + src + '[9], ' + src + '[10], ' + src + '[11]);',
    '  oG3 = vec4(' + src + '[12], ' + src + '[13], ' + src + '[14], ' + src + '[15]);',
    // ★ 第 20 个槽冇用，必须写 0.0（未初始化嘅 channel 喺某啲 driver 会带 NaN 返嚟）
    '  // slot 19 is unused and MUST be written as 0.0 (an uninitialised channel can read back NaN)',
    '  oG4 = vec4(' + src + '[16], ' + src + '[17], ' + src + '[18], 0.0);',
  ]
}

/** delta 同 j = Σ g_i c_i 嘅展开表达式（w_i c_i 项完全抵消，所以偏差形式一样啱）。 */
function momentExprs(g: (i: number) => string): { delta: string; jx: string; jy: string; jz: string } {
  const sum: string[] = [], jx: string[] = [], jy: string[] = [], jz: string[] = []
  for (let i = 0; i < Q; i++) {
    const c = ci(i), gi = g(i)
    sum.push(gi)
    if (c[0] === 1) jx.push('+ ' + gi); else if (c[0] === -1) jx.push('- ' + gi)
    if (c[1] === 1) jy.push('+ ' + gi); else if (c[1] === -1) jy.push('- ' + gi)
    if (c[2] === 1) jz.push('+ ' + gi); else if (c[2] === -1) jz.push('- ' + gi)
  }
  const strip = (a: string[]) => a.join(' ').replace(/^\+ /, '')
  return { delta: sum.join(' + '), jx: strip(jx), jy: strip(jy), jz: strip(jz) }
}

/* ════════════════════════════════════════════════════════════ step shader */

/**
 * 主 LBM step：gather（含边界 / 反弹）→ 矩 → TRT + Smagorinsky 碰撞 → 海绵 → 写返五个 target。
 * 唔发射 #version：由 Stage 5 嘅 GL 层前置（同参考实现同一约定）。
 */
export function stepShaderSource(A: AtlasLayout, opts: StepShaderOptions = {}): string {
  const bc: BoundaryConditions = { ...DEFAULT_BC, ...(opts.bc || {}) }
  for (const k of FACES) if (!(bc[k] in PRIORITY)) throw new Error('unknown boundary kind ' + bc[k] + ' on ' + k)
  for (let a = 0; a < 3; a++) {
    const lo = FACES[a * 2], hi = FACES[a * 2 + 1]
    if ((bc[lo] === 'periodic') !== (bc[hi] === 'periodic')) throw new Error('axis ' + a + ': periodic must be set on both faces')
  }
  const periodic = [bc.xmin === 'periodic', bc.ymin === 'periodic', bc.zmin === 'periodic']
  const hasBounce = FACES.some((k) => bc[k] === 'bounce')
  const nearGate = opts.nearBodyPhi === undefined ? Infinity : opts.nearBodyPhi

  const S: string[] = []
  const P = (...parts: (string | number)[]) => { S.push(parts.join('')) }

  P(atlasHeader(A))
  if (opts.bouzidi) P('#define BOUZIDI 1')
  if (opts.writeForce) P('#define WRITE_FORCE 1')
  P('')
  P('uniform sampler2D uG0, uG1, uG2, uG3, uG4;')
  P('uniform sampler2D uSolid;      // R = phi; phi < 0 is solid. A binary mask uploads -1 / +1.')
  P('uniform float uOmegaPlus;      // symmetric relaxation rate, from the molecular viscosity')
  P('uniform float uMagic;          // TRT Lambda = (1/w+ - 1/2)(1/w- - 1/2), from a PINNED omega_minus')
  P('uniform float uLesCs;          // Smagorinsky constant; 0.0 disables the eddy viscosity')
  P('uniform vec3  uInletU;         // free-stream velocity, lattice units')
  P('uniform vec3  uWallU;          // velocity of the part surface (vec3(0.0) for a static part)')
  if (hasBounce) P('uniform float uInletBL;        // inlet boundary-layer thickness in cells (bounce faces only)')
  P('uniform vec3  uBodyCentre;     // torque reference point, lattice coordinates')
  P('uniform float uSpongeStart, uSpongeStrength;')
  P('')
  P('layout(location = 0) out vec4 oG0;')
  P('layout(location = 1) out vec4 oG1;')
  P('layout(location = 2) out vec4 oG2;')
  P('layout(location = 3) out vec4 oG3;')
  P('layout(location = 4) out vec4 oG4;')
  P('#ifdef WRITE_FORCE')
  P('layout(location = 5) out vec4 oForce;    // xyz = momentum exchange, w = link count')
  P('layout(location = 6) out vec4 oTorque;   // xyz = moment about uBodyCentre, w = 0')
  P('#endif')
  P('')
  P('float phiAt(ivec3 p) { return texelFetch(uSolid, cellToTexel(p), 0).r; }')
  P('')
  P('float spongeAt(float x) {')
  P('  if (uSpongeStrength <= 0.0 || x < uSpongeStart) return 0.0;')
  P('  float t = (x - uSpongeStart) / max(1.0, (float(NX) - 1.0 - uSpongeStart));')
  P('  return uSpongeStrength * t * t;')
  P('}')
  P('')

  // ── 平衡态（展开）──
  P('// g_i^eq = w_i ( delta + rho ( 3 c.u + 4.5 (c.u)^2 - 1.5 u.u ) )')
  P('void equilibrium(float delta, vec3 u, out float e[19]) {')
  P('  float rho = 1.0 + delta;')
  P('  float usq = 1.5 * dot(u, u);')
  for (const line of unrolledEquilibrium('delta', 'u', 'e', '  ')) P(line)
  P('}')
  P('')

  P('void main() {')
  P('  ivec2 T = ivec2(gl_FragCoord.xy);')
  P('  ivec3 c = texelToCell(T);')
  P('  if (isPadding(c)) discard;')
  P('')
  P('  float phi = texelFetch(uSolid, T, 0).r;')
  if (Number.isFinite(nearGate)) {
    P('  // An SDF is 1-Lipschitz and the furthest D3Q19 neighbour is sqrt(3) = 1.73 cells away,')
    P('  // so phi >= 2.5 PROVES no neighbour is solid: the far field skips 18 solid probes.')
    P('  bool nearBody = phi < ', f(nearGate), ';')
  } else {
    P('  // A binary voxel mask carries no distance to gate on, so probe unconditionally.')
    P('  // Slower in the far field, but it can never silently skip a bounce-back link.')
    P('  bool nearBody = true;')
  }
  P('')
  P('  // Inside the part: hold the rest state. In deviation form the rest state is exactly zero,')
  P('  // so anything that reads a solid cell reads a clean rho = 1 fluid at rest.')
  P('  if (phi < 0.0) {')
  P('    oG0 = vec4(0.0); oG1 = vec4(0.0); oG2 = vec4(0.0); oG3 = vec4(0.0); oG4 = vec4(0.0);')
  P('#ifdef WRITE_FORCE')
  P('    oForce = vec4(0.0); oTorque = vec4(0.0);')
  P('#endif')
  P('    return;')
  P('  }')
  P('')
  P('  float g[19];')
  P('  bool isInlet = false;')
  P('')

  /*
   * 驱动式入口。
   *
   * 「平衡态入口」如果只覆写【流入】嘅 population、而且用入口格自己嘅密度，
   * 咁就系一个冇任何阻尼嘅正回授：呢格报出嚟嘅密度，就系啱啱有人叫佢有嘅密度。佢会震。
   * 参考实现实测：192 格嘅流道，震到入口平面 Mach 0.65，要十七格先衰减完 —— 而且毒害
   * 佢本来要餵嘅阻力。
   *
   * 所以入口平面根本【唔当佢系流体平面】。十九个 population 全部覆写成
   * 「自由流速度 + 域内隔篱格嘅密度」嘅平衡态。佢冇记忆 → 唔会震；佢强加嘅密度就系
   * 流体自己想要嗰个 → 亦唔会反射。
   */
  const inletFaces: [string, string][] = []
  if (bc.xmin === 'inlet') inletFaces.push(['c.x == 0', 'ivec3(1, c.y, c.z)'])
  if (bc.xmax === 'inlet') inletFaces.push(['c.x == NX - 1', 'ivec3(NX - 2, c.y, c.z)'])
  if (bc.ymin === 'inlet') inletFaces.push(['c.y == 0', 'ivec3(c.x, 1, c.z)'])
  if (bc.ymax === 'inlet') inletFaces.push(['c.y == NY - 1', 'ivec3(c.x, NY - 2, c.z)'])
  if (bc.zmin === 'inlet') inletFaces.push(['c.z == 0', 'ivec3(c.x, c.y, 1)'])
  if (bc.zmax === 'inlet') inletFaces.push(['c.z == NZ - 1', 'ivec3(c.x, c.y, NZ - 2)'])
  if (inletFaces.length) {
    P('  // ---- the driven inlet layer ----')
    P('  // An equilibrium inlet that replaces only the INCOMING populations, using the inlet')
    P('  // cell\'s own density, is a feedback loop with nothing to damp it: the density the cell')
    P('  // reports is the density the cell was just told to have. It rings, and it poisons the')
    P('  // drag it exists to feed. So overwrite ALL nineteen populations instead, with the')
    P('  // equilibrium of (free-stream velocity, density of the cell INSIDE the domain). No')
    P('  // memory means it cannot ring, and the density it imposes is the one the fluid wants.')
    P('  {')
    P('    ivec3 nb = ivec3(-1);')
    for (let fi = 0; fi < inletFaces.length; fi++) {
      P('    ', fi ? 'else if' : 'if', ' (', inletFaces[fi][0], ') nb = ', inletFaces[fi][1], ';')
    }
    P('    if (nb.x >= 0) {')
    P('      ivec2 tn = cellToTexel(nb);')
    P('      vec4 n0 = texelFetch(uG0, tn, 0), n1 = texelFetch(uG1, tn, 0), n2 = texelFetch(uG2, tn, 0);')
    P('      vec4 n3 = texelFetch(uG3, tn, 0), n4 = texelFetch(uG4, tn, 0);')
    P('      float dn = (n0.x+n0.y+n0.z+n0.w) + (n1.x+n1.y+n1.z+n1.w)')
    P('               + (n2.x+n2.y+n2.z+n2.w) + (n3.x+n3.y+n3.z+n3.w) + (n4.x+n4.y+n4.z);')
    P('      // A neighbour inside the part has no density to lend, and a wild one is a symptom,')
    P('      // not a source. Either way fall back to a plain equilibrium inlet.')
    P('      bool nbOK = !(nearBody && phiAt(nb) < 0.0) && (dn > -0.4) && (dn < 0.4);')
    P('      if (!nbOK) dn = 0.0;')
    P('')
    if (hasBounce) {
      P('      // A thin inlet boundary layer blending from the wall up to the free stream over')
      P('      // uInletBL cells. A top-hat profile injected onto a stationary wall puts a shear of')
      P('      // u_inf into a single cell, and near omega = 2 that does not merely under-resolve:')
      P('      // it goes non-finite. smoothstep(a, a, x) divides by zero in GLSL, so guard the width.')
      P('      float bl = 1.0;')
      P('      float blW = max(uInletBL, 1e-3);')
      if (bc.ymin === 'bounce') P('      bl = min(bl, smoothstep(0.0, blW, float(c.y) + 0.5));')
      if (bc.ymax === 'bounce') P('      bl = min(bl, smoothstep(0.0, blW, float(NY - 1 - c.y) + 0.5));')
      if (bc.zmin === 'bounce') P('      bl = min(bl, smoothstep(0.0, blW, float(c.z) + 0.5));')
      if (bc.zmax === 'bounce') P('      bl = min(bl, smoothstep(0.0, blW, float(NZ - 1 - c.z) + 0.5));')
      P('      vec3 uIn = uInletU * bl;')
    } else {
      P('      vec3 uIn = uInletU;   // all side faces are free-slip: no wall, so no boundary layer')
    }
    P('      float e[19]; equilibrium(dn, uIn, e);')
    P('')
    P('      // Guo, Zheng & Shi (2002): non-equilibrium extrapolation (NEEM).')
    P('      //')
    P('      // Pure equilibrium at the inlet is exact only where the flow is uniform. Put a part')
    P('      // downstream and it is not, and the missing non-equilibrium part leaves as the')
    P('      // lattice ghost mode -- measured as a Nyquist oscillation of half the free stream')
    P('      // (u/U = 1.54, 0.73, 1.26, 0.89 down the first four cells). Keeping the imposed')
    P('      // velocity but BORROWING the neighbour non-equilibrium kills it by a factor of a')
    P('      // thousand and costs nothing: in uniform flow the borrowed term is exactly zero.')
    P('      if (nbOK) {')
    P('        float gn[19];')
    for (let gi = 0; gi < Q; gi++) P('        gn[', gi, '] = n', texOf(gi), '.', chOf(gi), ';')
    const nbMom = momentExprs((i) => 'gn[' + i + ']')
    P('        vec3 jn = vec3(', nbMom.jx, ', ', nbMom.jy, ', ', nbMom.jz, ');')
    P('        vec3 uNb = jn / (1.0 + dn);')
    P('        float eN[19]; equilibrium(dn, uNb, eN);')
    for (let gi = 0; gi < Q; gi++) P('        e[', gi, '] += gn[', gi, '] - eN[', gi, '];')
    P('      }')
    P('')
    P('      // Do NOT write this out and return. The inlet node is a fluid node with a prescribed')
    P('      // state: it is set BEFORE collision and then collided, and its post-collision value')
    P('      // is what streams into the tunnel. Writing the pre-collision state straight to the')
    P('      // output is a one-collision phase error -- invisible with a pure-equilibrium inlet')
    P('      // (equilibrium is a fixed point of collision) and very visible once NEEM is on.')
    for (let gi = 0; gi < Q; gi++) P('      g[', gi, '] = e[', gi, '];')
    P('      isInlet = true;')
    P('    }')
    P('  }')
    P('')
  }

  P('  // Our own nineteen post-collision values arrive in five reads.')
  P('  vec4 s0 = texelFetch(uG0, T, 0);')
  P('  vec4 s1 = texelFetch(uG1, T, 0);')
  P('  vec4 s2 = texelFetch(uG2, T, 0);')
  P('  vec4 s3 = texelFetch(uG3, T, 0);')
  P('  vec4 s4 = texelFetch(uG4, T, 0);')
  P('')
  P('  // The wall-momentum term wants the density AT the wall; the adjacent fluid node is the')
  P('  // standard estimate. Collision conserves mass, so the post-collision sum already in')
  P('  // registers is the right rho at time t.')
  P('  float rhoW = 1.0 + (s0.x + s0.y + s0.z + s0.w) + (s1.x + s1.y + s1.z + s1.w)')
  P('                  + (s2.x + s2.y + s2.z + s2.w) + (s3.x + s3.y + s3.z + s3.w)')
  P('                  + (s4.x + s4.y + s4.z);')
  P('')
  P('#ifdef WRITE_FORCE')
  P('  vec3 Fsum = vec3(0.0), Tsum = vec3(0.0); float links = 0.0;')
  P('#endif')
  P('')

  // ── 十九个 gather（入口节点嘅 population 系指定嘅，唔 stream）──
  if (inletFaces.length) P('  if (!isInlet) {')
  for (let i = 0; i < Q; i++) S.push(gatherBlock(i, bc, periodic))
  if (inletFaces.length) P('  }')

  P('')
  P('  // ---- moments -------------------------------------------------------------')
  const mom = momentExprs((i) => 'g[' + i + ']')
  P('  float delta = ', mom.delta, ';')
  P('  vec3 j = vec3(')
  P('    ', mom.jx, ',')
  P('    ', mom.jy, ',')
  P('    ', mom.jz, ');')
  P('')
  P('  // A cell that has gone bad poisons its neighbours within a few steps. Catch it here and')
  P('  // reset it: one wrong cell is a blemish, a spreading NaN is a dead simulation.')
  P('  if (!(delta > -0.5 && delta < 0.5) || any(isnan(j)) || any(isinf(j))) {')
  P('    delta = 0.0; j = vec3(0.0);')
  for (let i = 0; i < Q; i++) P('    g[', i, '] = 0.0;')
  P('  }')
  P('')
  P('  float rho = 1.0 + delta;')
  P('  vec3 u = j / rho;')
  P('')
  P('  float e[19]; equilibrium(delta, u, e);')
  P('')
  P('  float wp = uOmegaPlus;')
  P('  if (uLesCs > 0.0) {')
  P('    // Smagorinsky. Pi^neq_ab = sum_i c_ia c_ib (g_i - e_i); the w_i c c terms cancel')
  P('    // identically, so the deviation form can be used directly.')
  {
    const pxx: string[] = [], pyy: string[] = [], pzz: string[] = [], pxy: string[] = [], pxz: string[] = [], pyz: string[] = []
    for (let i = 0; i < Q; i++) {
      const cc = ci(i), n = 'n' + i
      if (cc[0] * cc[0]) pxx.push(n)
      if (cc[1] * cc[1]) pyy.push(n)
      if (cc[2] * cc[2]) pzz.push(n)
      if (cc[0] * cc[1]) pxy.push((cc[0] * cc[1] > 0 ? '+ ' : '- ') + n)
      if (cc[0] * cc[2]) pxz.push((cc[0] * cc[2] > 0 ? '+ ' : '- ') + n)
      if (cc[1] * cc[2]) pyz.push((cc[1] * cc[2] > 0 ? '+ ' : '- ') + n)
    }
    for (let i = 0; i < Q; i++) P('    float n', i, ' = g[', i, '] - e[', i, '];')
    P('    float pxx = ', pxx.join(' + '), ';')
    P('    float pyy = ', pyy.join(' + '), ';')
    P('    float pzz = ', pzz.join(' + '), ';')
    P('    float pxy = ', pxy.join(' ').replace(/^\+ /, ''), ';')
    P('    float pxz = ', pxz.join(' ').replace(/^\+ /, ''), ';')
    P('    float pyz = ', pyz.join(' ').replace(/^\+ /, ''), ';')
  }
  P('    float pp = pxx*pxx + pyy*pyy + pzz*pzz + 2.0*(pxy*pxy + pxz*pxz + pyz*pyz);')
  P('    float Qbar = sqrt(2.0 * pp);')
  P('    float tau0 = 1.0 / uOmegaPlus;')
  P('    // Radical form: the positive root of tau^2 - tau0 tau - 9 Cs^2 Qbar / (2 rho) = 0.')
  P('    float tauT = 0.5 * (tau0 + sqrt(tau0*tau0 + 18.0 * uLesCs * uLesCs * Qbar / rho));')
  P('    wp = 1.0 / tauT;   // an eddy viscosity raises tau, so it LOWERS omega_plus')
  P('  }')
  P('  // THE SIGN MATTERS. uMagic is a FIXED Lambda, derived on the CPU each frame from a pinned')
  P('  // omega_minus = 0.8, and wm is derived here from the EDDY-MODIFIED wp. Lowering wp with a')
  P('  // fixed Lambda RAISES wm -- away from the corner where the odd non-equilibrium mode grows')
  P('  // undamped. Freeze wm instead, or recompute Lambda from the eddy viscosity, and this sign')
  P('  // flips: the sub-grid model then destroys the very thing it exists to stabilise.')
  P('  float wm = 1.0 / (uMagic / (1.0 / wp - 0.5) + 0.5);')
  P('')
  P('  float o[19];')

  // ── TRT 碰撞，逐对相反方向做 ──
  P('  // i = 0 has no antisymmetric part.')
  P('  o[0] = g[0] - wp * (g[0] - e[0]);')
  for (let i = 1; i < Q; i += 2) {
    const ib = i + 1
    P('  {')
    P('    float gp = 0.5 * (g[', i, '] + g[', ib, ']), gm = 0.5 * (g[', i, '] - g[', ib, ']);')
    P('    float ep = 0.5 * (e[', i, '] + e[', ib, ']), em = 0.5 * (e[', i, '] - e[', ib, ']);')
    P('    o[', i, '] = g[', i, '] - wp * (gp - ep) - wm * (gm - em);')
    P('    o[', ib, '] = g[', ib, '] - wp * (gp - ep) + wm * (gm - em);')
    P('  }')
  }
  P('')
  P('  // Sponge: relax toward the free stream near the outlet so the wake leaves without')
  P('  // bouncing back off the boundary and reappearing upstream as a phantom gust.')
  P('  float sp = spongeAt(float(c.x));')
  P('  if (sp > 0.0) {')
  P('    float t[19]; equilibrium(0.0, uInletU, t);')
  for (let i = 0; i < Q; i++) P('    o[', i, '] = mix(o[', i, '], t[', i, '], sp);')
  P('  }')
  P('')
  for (const line of packOut('o')) P(line)
  P('#ifdef WRITE_FORCE')
  P('  oForce = vec4(Fsum, links);')
  P('  oTorque = vec4(Tsum, 0.0);')
  P('#endif')
  P('}')

  return S.join('\n')
}

/**
 * 一个方向嘅 gather。三条入路：
 *
 *   source 系另一格流体   → 直接读
 *   source 喺零件入面     → 反弹，同时向零件收返啱啱交出去嘅动量
 *   source 出咗域         → 由面条件决定
 *
 * 只有 c_i[a] != 0 嘅轴先出得到域，而且每条轴只可能由【一个】面出（睇 c_i[a] 嘅符号）。
 * 所以 runtime 要问嘅只系「跨咗边一（两）个面」，其余嘅（边个面赢、读边个镜射方向）
 * 全部喺【生成时】决定晒。
 */
function gatherBlock(i: number, bc: BoundaryConditions, periodic: boolean[]): string {
  const S: string[] = []
  const P = (...parts: (string | number)[]) => { S.push(parts.join('')) }
  const c = ci(i), ib = opp(i), w = W[i]
  const comp = ['x', 'y', 'z']
  const N = ['NX', 'NY', 'NZ']
  const faceOf: (FaceKind | null)[] = [
    c[0] > 0 ? bc.xmin : (c[0] < 0 ? bc.xmax : null),
    c[1] > 0 ? bc.ymin : (c[1] < 0 ? bc.ymax : null),
    c[2] > 0 ? bc.zmin : (c[2] < 0 ? bc.zmax : null),
  ]

  P('  // ---- direction ', i, ' = (', c.join(','), '), opposite ', ib, ' ----')
  P('  {')
  if (i === 0) { P('    g[0] = ', selfG(0), ';'); P('  }'); return S.join('\n') }

  P('    ivec3 s = c - ', cIvec(i), ';')
  for (let a = 0; a < 3; a++) {
    if (c[a] !== 0 && periodic[a]) P('    s.', comp[a], ' = (s.', comp[a], ' + ', N[a], ') % ', N[a], ';')
  }

  // 边啲轴出得到域，同各自嘅测试
  const crossable: { a: number; test: string; face: FaceKind }[] = []
  for (let a = 0; a < 3; a++) {
    if (c[a] === 0 || periodic[a]) continue
    crossable.push({
      a,
      test: c[a] > 0 ? 's.' + comp[a] + ' < 0' : 's.' + comp[a] + ' >= ' + N[a],
      face: faceOf[a] as FaceKind,
    })
  }

  const haveBC = crossable.length > 0
  if (haveBC) {
    for (let k = 0; k < crossable.length; k++) P('    bool o', k, ' = ', crossable[k].test, ';')
    // 所有非空子集，最特定（跨最多面）行先 → 边角位唔会畀「跨一个面」嘅 case 抢咗
    const subsets: { mask: number; bits: number[] }[] = []
    for (let m = (1 << crossable.length) - 1; m >= 1; m--) {
      const bits: number[] = []
      for (let k = 0; k < crossable.length; k++) if (m & (1 << k)) bits.push(k)
      subsets.push({ mask: m, bits })
    }
    subsets.sort((p, q) => q.bits.length - p.bits.length)

    let first = true
    for (const sub of subsets) {
      let cond = sub.bits.map((b) => 'o' + b).join(' && ')
      // 冇掂到嗰啲一定要系 false，否则一个冇咁特定嘅 case 都会 match
      for (let k = 0; k < crossable.length; k++) if (!(sub.mask & (1 << k))) cond += ' && !o' + k
      let winner: FaceKind | null = null
      for (const bIdx of sub.bits) {
        const fk = crossable[bIdx].face
        if (!winner || PRIORITY[fk] > PRIORITY[winner]) winner = fk
      }
      P('    ', first ? 'if' : 'else if', ' (', cond, ') {')
      first = false
      if (winner === 'bounce') {
        P('      g[', i, '] = ', selfG(ib), ';   // static wall: halfway bounce-back')
      } else if (winner === 'outlet') {
        P('      g[', i, '] = ', selfG(i), ';   // zero gradient')
      } else if (winner === 'inlet') {
        // 到唔到：入口格会覆写十九个 population 并且喺 gather 之前就 flag 咗 isInlet。
        // 照样发射，令决策树保持穷尽，将来重新接驳六个面都唔会有窿。
        P('      g[', i, '] = 0.0;   // unreachable: inlet cells are driven and skip the gathers')
      } else if (winner === 'freeslip') {
        // 喺每条跨咗嘅轴镜射（佢哋全部系 free-slip，否则更高优先嘅面已经赢咗）
        let mi = i
        const coords = ['s.x', 's.y', 's.z']
        for (const bIdx of sub.bits) {
          const ax = crossable[bIdx].a
          mi = mirrorIdx(ax, mi)
          coords[ax] = 'c.' + comp[ax]
        }
        /*
         * ★ mSolid 守卫 ★
         * 镜射出嚟嗰个 ghost node 可以喺零件入面。零件一掂到 free-slip 壁（我哋预设四面
         * 都系 free-slip，随便一个大零件都掂得到），就会有 link 嘅镜射伙伴落喺固体度 ——
         * 而 solver 喺固体格写嘅系 vec4(0.0)。读佢 = 注入一个 rho = 1 嘅静止态，
         * 即系【每一步、每条接触 link 都静静鸡删走质量同动量】。
         * 参考实现嘅 float64 CPU 版一早有呢个检查，GPU 版一开始冇，而且冇任何自测将零件
         * 摆近 free-slip 面 —— 所以冇嘢捉到。
         */
        P('      {')
        P('        // The mirrored ghost node can be INSIDE the part. Solid cells store vec4(0.0),')
        P('        // so reading one injects a rest state at rho = 1: mass and momentum are')
        P('        // silently deleted every step, at every contact link. Bounce back instead.')
        P('        ivec3 mg = ivec3(', coords.join(', '), ');')
        P('        bool mSolid = nearBody && phiAt(mg) < 0.0;')
        P('        g[', i, '] = mSolid ? ', selfG(ib), ' : ', fetchG(mi, 'mg'), ';   // specular -> direction ', mi)
        P('      }')
      } else {
        throw new Error('unreachable face kind ' + winner)
      }
      P('    }')
    }
    P('    else {')
  }

  const ind = haveBC ? '      ' : '    '
  P(ind, 'float ph = nearBody ? phiAt(s) : 1e9;')
  P(ind, 'if (ph < 0.0) {')
  P(ind, '  // The wall lies between us and s: bounce back, and bill the part for the momentum.')
  P(ind, '  vec3 uw = uWallU;')
  P(ind, '  float wallTerm = ', f(2 * w * 3), ' * rhoW * (', dotExpr(i, 'uw'), ');')
  P(ind, '  float gIn = ', selfG(ib), ';   // what we fired into the wall last step')
  P(ind, '  float gOut;')
  P(ind, '#ifdef BOUZIDI')
  P(ind, '  // q = distance(node, wall) / distance(node, solid node), from the two phi samples.')
  P(ind, '  // OFF by default: with a binary voxel mask q is always ~0.5, i.e. halfway')
  P(ind, '  // bounce-back wearing a fake sub-cell precision. Only enable with a real SDF.')
  P(ind, '  float q = clamp(phi / max(phi - ph, 1e-6), 0.001, 0.999);')
  P(ind, '  if (q < 0.5) {')
  P(ind, '    ivec3 aw = c + ', cIvec(i), ';   // the node one further from the wall')
  // 每条周期轴喺 bounds 测试之前一定要 wrap —— 同 streaming source 一样嘅规矩。
  // 漏咗嘅话，接缝位嘅远节点会读成出界、分支退化成 halfway 反弹，条壁就搬咗位。
  for (let pw = 0; pw < 3; pw++) {
    if (!periodic[pw]) continue
    if (ci(i)[pw] !== 0) P(ind, '    aw.', 'xyz'[pw], ' = (aw.', 'xyz'[pw], ' + ', N[pw], ') % ', N[pw], ';')
  }
  P(ind, '    bool okA = inGrid(aw) && (!nearBody || phiAt(aw) >= 0.0);')
  P(ind, '    float far = okA ? ', fetchG(ib, 'aw'), ' : gIn;')
  P(ind, '    gOut = 2.0 * q * gIn + (1.0 - 2.0 * q) * far + wallTerm;')
  P(ind, '  } else {')
  P(ind, '    float inv = 0.5 / q;')
  P(ind, '    gOut = inv * gIn + (2.0 * q - 1.0) * inv * ', selfG(i), ' + wallTerm * inv;')
  P(ind, '  }')
  P(ind, '#else')
  P(ind, '  gOut = gIn + wallTerm;')
  P(ind, '#endif')
  P(ind, '  g[', i, '] = gOut;')
  P(ind, '#ifdef WRITE_FORCE')
  P(ind, '  // Momentum exchange: dP = -c (gIn + gOut) - u_w (gIn - gOut).')
  P(ind, '  //')
  P(ind, '  // The uniform-pressure term -2 w_i c_i is DELIBERATELY DROPPED. It sums to zero over')
  P(ind, '  // a closed body, and dropping it is exactly the gauge-pressure convention a drag')
  P(ind, '  // coefficient is defined on. The real reason is numerical: without it every term')
  P(ind, '  // stays O(1e-2) and the fp32 tree reduction is safe. Add it back and the sum becomes')
  P(ind, '  // an O(1) cancellation across ~1e4 boundary texels, which sinks the drag read-out')
  P(ind, '  // into fp32 noise.')
  P(ind, '  vec3 dP = -', cLiteral(i), ' * (gIn + gOut) - uw * (gIn - gOut);')
  P(ind, '  vec3 xw = vec3(c) + 0.5 - ', f(0.5), ' * ', cLiteral(i), ';   // link midpoint = the wall')
  P(ind, '  Fsum += dP;')
  P(ind, '  Tsum += cross(xw - uBodyCentre, dP);')
  P(ind, '  links += 1.0;')
  P(ind, '#endif')
  P(ind, '} else {')
  P(ind, '  g[', i, '] = ', fetchG(i, 's'), ';')
  P(ind, '}')
  if (haveBC) P('    }')
  P('  }')
  return S.join('\n')
}

/* ════════════════════════════════════════════════════════ 其余 pass */

/** 用一个均匀平衡态填满分布场（冷启动）。 */
export function initShaderSource(A: AtlasLayout): string {
  return [
    atlasHeader(A),
    'uniform vec3 uU;',
    'uniform float uDelta;',
    'layout(location = 0) out vec4 oG0;',
    'layout(location = 1) out vec4 oG1;',
    'layout(location = 2) out vec4 oG2;',
    'layout(location = 3) out vec4 oG3;',
    'layout(location = 4) out vec4 oG4;',
    'void main() {',
    '  ivec3 c = texelToCell(ivec2(gl_FragCoord.xy));',
    '  float e[19];',
    '  float rho = 1.0 + uDelta;',
    '  float usq = 1.5 * dot(uU, uU);',
    ...unrolledEquilibrium('uDelta', 'uU', 'e', '  '),
    ...packOut('e'),
    '  if (isPadding(c)) { oG0 = vec4(0.0); oG1 = vec4(0.0); oG2 = vec4(0.0); oG3 = vec4(0.0); oG4 = vec4(0.0); }',
    '}',
  ].join('\n')
}

/** 把 solid 图清成「好远、冇零件」。1e9 系 min-combine 嘅单位元：任何零件嘅 phi 都细过佢。 */
export function solidClearShaderSource(A: AtlasLayout): string {
  return [
    atlasHeader(A),
    'layout(location = 0) out vec4 oSolid;',
    '// 1e9 is the identity of the min-combine: any real phi is smaller.',
    'void main() {',
    '  ivec3 c = texelToCell(ivec2(gl_FragCoord.xy));',
    '  if (isPadding(c)) { oSolid = vec4(1e9, 0.0, 0.0, 0.0); return; }',
    '  oSolid = vec4(1e9, 0.0, 0.0, 0.0);',
    '}',
  ].join('\n')
}

/**
 * 把零件嘅 phi 场 min-combine 入 solid atlas。
 *
 * uPhi 系一张同【流道域一样尺寸】嘅 TEXTURE_3D。webcad 上传嘅系 voxelize() 出嚟嘅二值
 * mask（固体 -1、流体 +1）；trueSdf 嗰阵系 chamfer narrow band，同一个 shader 照用。
 *
 * ⚠️ uPhi 嘅 sampler 【永远】系 NEAREST，成个档只用 texelFetch。二值 mask 畀 linear filter
 *    抽样会产生假嘅小数距离；而且 R32F 要 OES_texture_float_linear 先 filter 得到，冇嗰个
 *    extension 嘅机 texture 会变「incomplete」→ 静静鸡还 (0,0,0,1) → phi = 0 → 成件零件
 *    消失而唔报错。所以连真 SDF 嗰条路都系【手写 trilinear】，唔靠 sampler。
 *
 *
 * ★★ 位姿（uPoseOn）★★
 * ───────────────────
 * uPoseOn == 0 → 逐字节同旧版一样嘅定点 texelFetch(uPhi, c, 0)，一个 bit 都冇变。
 * uPoseOn == 1 → 目的地格心 → uPoseInv 逆变换 → 喺【烘焙姿态】嘅物件空间取样。
 *                phi 场唔使重烘，所以拖拽/旋转可以逐帧做。
 *
 * 取样规则见 rigidPose.ts（嗰边有个逐句对住呢段 GLSL 嘅 CPU 镜像，测试就系验两边一致）：
 *   二值 mask  → NEAREST + 3×3×3 覆盖率投票（多数决）
 *   真 SDF     → 手写 trilinear（旋转保距，内插距离合法）
 *
 * ★ 点解係 3×3×3 而唔係 2×2×2 ★ —— 实测（tests/lbm-pose.test.mjs 嘅同一批姿态，
 *   同「喺该姿态重新用 CPU 烘一次」比）：
 *
 *       N       最坏 diff/界面格     最坏 volume 偏差
 *       1×1×1   0.37                +1.8%      纯 NEAREST：旋转阶梯 aliasing 最劲
 *       2×2×2   0.40               −20.8%   ★ 偶数会 4-4 打和，打和规则会成层面咁食走
 *       3×3×3   0.13                −1.3%    ★ 27 係单数 → 数学上冇可能打和
 *       4×4×4   0.30               −14.3%      又係偶数，同 2×2×2 一样嘅病
 *       6×6×6   0.13                −1.2%      同 3×3×3 冇分别，但贵 8 倍
 *
 *   即係【单数】先係重点，唔係「密啲」。偶数子取样喺一个正正撞正边界嘅面上面会成层打和，
 *   而打和无论倒去边一边都係一个系统性偏差（−20% 体积 = 成层面唔见咗）。
 *
 * ★ 亦都唔用「子取样 min-combine」★：min = 八点入面有一点係固体就当固体，即係对成件零件
 *   膨胀咗半格 —— 同 CPU 重烘比就係系统性咁多咗一层壳。投票先至係无偏。
 *   （零件【之间】嘅 union 仍然係 min-combine，见下面 min(phiNow, prev)。两件事，唔好沟埋。）
 *
 * ★ 出界一定要当【流体】★（uPhiOutside > 0）：clamp 会把边界嗰层沿住域边拖出一条鬼影柱，
 *   wrap 会喺对面边界生返件零件出嚟。两样都唔会报错。
 */
export function solidBodyShaderSource(A: AtlasLayout): string {
  return [
    atlasHeader(A),
    'uniform sampler2D uSolidPrev;   // the running union so far',
    'uniform highp sampler3D uPhi;   // phi in domain lattice space (< 0 is solid). NEAREST only.',
    'uniform float uPhiToLattice;    // phi units -> lattice units (a binary mask passes 1.0)',
    'uniform int uPoseOn;            // 0 = baked pose: bit-for-bit the old fixed texelFetch',
    'uniform int uPoseSdf;           // 1 = phi is a true SDF -> trilinear; 0 = binary mask -> 2x2x2 vote',
    'uniform mat4 uPoseInv;          // domain lattice -> object (baked) lattice',
    'uniform float uPhiOutside;      // samples landing outside phi read this (> 0 = fluid)',
    'layout(location = 0) out vec4 oSolid;',
    '',
    '// Outside the phi volume is FLUID. Never clamp (it smears the boundary layer into a ghost',
    '// prism down the domain edge) and never wrap (the part reappears on the far wall).',
    'float phiFetch(ivec3 p) {',
    '  if (p.x < 0 || p.y < 0 || p.z < 0 || p.x >= NX || p.y >= NY || p.z >= NZ) return uPhiOutside;',
    '  return texelFetch(uPhi, p, 0).r;',
    '}',
    '',
    '// Binary mask: nearest + a 3x3x3 coverage vote. 27 votes of +-1 always sum ODD, so a tie',
    '// is arithmetically impossible -- that is the whole reason the count is odd (see header).',
    '// floor() before the cast is load-bearing: ivec3(-0.3) truncates to 0 and mirrors a slab',
    '// of the part back onto the -x wall.',
    'float phiVote27(vec3 pc) {',
    '  float acc = 0.0;',
    '  for (int k = 0; k < 27; k++) {',
    '    vec3 o = vec3(float(k % 3), float((k / 3) % 3), float(k / 9)) / 3.0 - (1.0 / 3.0);',
    '    vec3 q = (uPoseInv * vec4(pc + o, 1.0)).xyz;',
    '    acc += (phiFetch(ivec3(floor(q))) < 0.0) ? -1.0 : 1.0;',
    '  }',
    '  return (acc < 0.0) ? -1.0 : 1.0;',
    '}',
    '',
    '// True SDF: hand-rolled trilinear (see the header for why not a LINEAR sampler).',
    'float phiTrilinear(vec3 pc) {',
    '  vec3 q = (uPoseInv * vec4(pc, 1.0)).xyz - 0.5;   // samples live at cell centres',
    '  vec3 b = floor(q);',
    '  vec3 f = q - b;',
    '  ivec3 i0 = ivec3(b);',
    '  float c000 = phiFetch(i0 + ivec3(0,0,0)), c100 = phiFetch(i0 + ivec3(1,0,0));',
    '  float c010 = phiFetch(i0 + ivec3(0,1,0)), c110 = phiFetch(i0 + ivec3(1,1,0));',
    '  float c001 = phiFetch(i0 + ivec3(0,0,1)), c101 = phiFetch(i0 + ivec3(1,0,1));',
    '  float c011 = phiFetch(i0 + ivec3(0,1,1)), c111 = phiFetch(i0 + ivec3(1,1,1));',
    '  float x00 = mix(c000, c100, f.x), x10 = mix(c010, c110, f.x);',
    '  float x01 = mix(c001, c101, f.x), x11 = mix(c011, c111, f.x);',
    '  return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);',
    '}',
    '',
    'void main() {',
    '  ivec2 T = ivec2(gl_FragCoord.xy);',
    '  ivec3 c = texelToCell(T);',
    '  if (isPadding(c)) { oSolid = vec4(1e9, 0.0, 0.0, 0.0); return; }',
    '  float prev = texelFetch(uSolidPrev, T, 0).r;',
    '  float phiRaw;',
    '  if (uPoseOn == 0) phiRaw = texelFetch(uPhi, c, 0).r;',
    '  else if (uPoseSdf == 1) phiRaw = phiTrilinear(vec3(c) + 0.5);',
    '  else phiRaw = phiVote27(vec3(c) + 0.5);',
    '  float phiNow = phiRaw * uPhiToLattice;',
    '  oSolid = vec4(min(phiNow, prev), 0.0, 0.0, 0.0);',
    '}',
  ].join('\n')
}

/** 分布 → (delta, ux, uy, uz)。每帧跑一次，畀显示同入口用。 */
export function macroShaderSource(A: AtlasLayout): string {
  const mom = momentExprs((i) => 'g[' + i + ']')
  return [
    atlasHeader(A),
    'uniform sampler2D uG0, uG1, uG2, uG3, uG4;',
    'uniform sampler2D uSolid;',
    'layout(location = 0) out vec4 oMacro;   // x = delta, yzw = u',
    'void main() {',
    '  ivec2 T = ivec2(gl_FragCoord.xy);',
    '  ivec3 c = texelToCell(T);',
    '  if (isPadding(c)) { oMacro = vec4(0.0); return; }',
    '  if (texelFetch(uSolid, T, 0).r < 0.0) { oMacro = vec4(0.0, 0.0, 0.0, 0.0); return; }',
    '  vec4 s0 = texelFetch(uG0, T, 0), s1 = texelFetch(uG1, T, 0), s2 = texelFetch(uG2, T, 0);',
    '  vec4 s3 = texelFetch(uG3, T, 0), s4 = texelFetch(uG4, T, 0);',
    '  float g[19];',
    '  g[0]=s0.x; g[1]=s0.y; g[2]=s0.z; g[3]=s0.w;',
    '  g[4]=s1.x; g[5]=s1.y; g[6]=s1.z; g[7]=s1.w;',
    '  g[8]=s2.x; g[9]=s2.y; g[10]=s2.z; g[11]=s2.w;',
    '  g[12]=s3.x; g[13]=s3.y; g[14]=s3.z; g[15]=s3.w;',
    '  g[16]=s4.x; g[17]=s4.y; g[18]=s4.z;',
    '  float delta = ' + mom.delta + ';',
    '  vec3 j = vec3(' + mom.jx + ', ' + mom.jy + ', ' + mom.jz + ');',
    '  vec3 u = j / (1.0 + delta);',
    '  oMacro = vec4(delta, u);',
    '}',
  ].join('\n')
}

export interface VolumeShaderOptions {
  /**
   * 要唔要 Q 准则同涡量（要摸六个邻居 → 十三次 fetch/格）。
   * 冇嘢读嗰阵传 false：x/y 会系 0，而唯一会察觉嘅代码就系冇喺度跑嗰啲。
   */
  needQ?: boolean
}

/**
 * 把 macro atlas 嘅一层 Z 抄入真 TEXTURE_3D，顺手计 Q 准则。
 * （梯度要邻居，喺 atlas 入面系准嘅；喺 3D texture 度就系一个跨接缝嘅谎话，所以喺呢度计。）
 *
 *   Q = 1/2 (|Omega|^2 - |S|^2),   S = sym(grad u),  Omega = skew(grad u)
 *
 * Q > 0 = 旋转赢过应变嘅区域，即系涡（Hunt, Wray & Moin 1988）。
 * ⚠️ 呢张 3D texture 先至系可以 filter 嘅嗰张 —— atlas 唔可以。
 */
export function volumeShaderSource(A: AtlasLayout, opts: VolumeShaderOptions = {}): string {
  const needQ = opts.needQ !== false
  const src = [
    atlasHeader(A),
    'uniform sampler2D uMacro;',
    'uniform sampler2D uSolid;',
    'uniform int uLayer;',
    'uniform float uUref;   // free-stream speed, to normalise Q',
    'layout(location = 0) out vec4 oVel;   // xyz = u, w = delta',
    'layout(location = 1) out vec4 oQ;     // x = Q (normalised), y = |vorticity|, z = |u|, w = solid',
    'vec4 macroAt(ivec3 p) {',
    '  p = clamp(p, ivec3(0), ivec3(NX-1, NY-1, NZ-1));',
    '  return texelFetch(uMacro, cellToTexel(p), 0);',
    '}',
    'bool solidAt(ivec3 p) {',
    '  p = clamp(p, ivec3(0), ivec3(NX-1, NY-1, NZ-1));',
    '  return texelFetch(uSolid, cellToTexel(p), 0).r < 0.0;',
    '}',
    'void main() {',
    '  ivec3 c = ivec3(ivec2(gl_FragCoord.xy), uLayer);',
    '  vec4 m = macroAt(c);',
    '  oVel = vec4(m.yzw, m.x);',
  ]
  if (!needQ) {
    return src.concat([
      '  float solid = solidAt(c) ? 1.0 : 0.0;',
      '  oQ = vec4(0.0, 0.0, length(m.yzw), solid);',
      '}',
    ]).join('\n')
  }
  return src.concat([
    '  vec3 dudx = 0.5 * (macroAt(c + ivec3(1,0,0)).yzw - macroAt(c - ivec3(1,0,0)).yzw);',
    '  vec3 dudy = 0.5 * (macroAt(c + ivec3(0,1,0)).yzw - macroAt(c - ivec3(0,1,0)).yzw);',
    '  vec3 dudz = 0.5 * (macroAt(c + ivec3(0,0,1)).yzw - macroAt(c - ivec3(0,0,1)).yzw);',
    '  mat3 G = mat3(dudx, dudy, dudz);   // columns: d(u)/dx, d(u)/dy, d(u)/dz',
    '  mat3 S = 0.5 * (G + transpose(G));',
    '  mat3 O = 0.5 * (G - transpose(G));',
    '  float s2 = dot(S[0],S[0]) + dot(S[1],S[1]) + dot(S[2],S[2]);',
    '  float o2 = dot(O[0],O[0]) + dot(O[1],O[1]) + dot(O[2],O[2]);',
    '  float Qc = 0.5 * (o2 - s2);',
    '  vec3 vort = vec3(dudy.z - dudz.y, dudz.x - dudx.z, dudx.y - dudy.x);',
    '  float solid = solidAt(c) ? 1.0 : 0.0;',
    '',
    '  // A centred difference that straddles a wall is not a derivative. Where any neighbour is',
    '  // solid the stencil reaches into the part (whose stored velocity is zero) and the Q it',
    '  // invents shrink-wraps the model in a spurious shell that hides the real vortices. The',
    '  // same happens in the first two cells off a domain face. Neither is a vortex.',
    '  bool nearSolid = solid > 0.5',
    '    || solidAt(c + ivec3(1,0,0)) || solidAt(c - ivec3(1,0,0))',
    '    || solidAt(c + ivec3(0,1,0)) || solidAt(c - ivec3(0,1,0))',
    '    || solidAt(c + ivec3(0,0,1)) || solidAt(c - ivec3(0,0,1));',
    '  bool nearWall = c.x < 2 || c.x > NX - 3 || c.y < 2 || c.y > NY - 3 || c.z < 2 || c.z > NZ - 3;',
    '  // Zero, not a large negative: the iso-surface normal comes from grad(Q), and a cliff at',
    '  // the mask boundary would point the normals along the mask instead of along the vortex.',
    '  if (nearSolid || nearWall) Qc = 0.0;',
    '',
    '  float n = max(uUref * uUref, 1e-8);',
    '  oQ = vec4(Qc / n, length(vort) / max(uUref, 1e-6), length(m.yzw), solid);',
    '}',
  ]).join('\n')
}

/**
 * 迎风面积，由【solver 真系反弹嗰个】phi 场量度。
 *
 * 另一条路（用正交相机 rasterize 渲染网格）畀嘅系「你睇到嘅形状」嘅面积，
 * 唔系「流体感受到嘅形状」。喺低分辨率格子上，一块细薄片可以【睇到但流体上唔存在】。
 * 因为 Cd = 2F/(rho U² A) 系一个除另一个，两者最好系同一件物件。
 * 所以：对每个 (y,z)，march 成条 x 列，问吓有冇任何一格喺零件入面。
 */
export function frontalShaderSource(A: AtlasLayout): string {
  return [
    atlasHeader(A),
    'uniform sampler2D uSolid;',
    'layout(location = 0) out vec4 oA0;   // x = 1 if any cell in this (y,z) column is inside the part',
    '// Measured from the SAME phi field the solver bounces off, because Cd = 2F/(rho U^2 A)',
    '// divides one by the other and they had better be the same object.',
    'void main() {',
    '  ivec2 yz = ivec2(gl_FragCoord.xy);',
    '  if (yz.x >= NY || yz.y >= NZ) { oA0 = vec4(0.0); return; }',
    '  float hit = 0.0;',
    '  for (int x = 0; x < NX; x++) {',
    '    if (texelFetch(uSolid, cellToTexel(ivec3(x, yz.x, yz.y)), 0).r < 0.0) hit = 1.0;',
    '  }',
    '  oA0 = vec4(hit, 0.0, 0.0, 0.0);',
    '}',
  ].join('\n')
}

/**
 * 每个 pass 喺两条轴各 sum-reduce 4 倍。六个 pass 可以把一张 ~1000×1000 嘅力场收埋做一个 texel。
 *
 * fp32 加成百万个 texel 听落好得人惊，但动量交换场喺 ~1e4 个边界格以外全部系零，
 * 而 4×4 树状 reduction 嘅误差系 log(N) 而唔系 N 咁大。偏差形式令每一项留喺 O(1e-2)、
 * 冇大常数等住相消 —— 呢个先系佢安全嘅真正原因（见 step shader 入面 gauge-pressure 嗰段）。
 */
export function reduceShaderSource(nTargets = 2): string {
  if (!(nTargets >= 1 && nTargets <= 3)) throw new Error('reduceShaderSource: nTargets must be 1..3, got ' + nTargets)
  const s: string[] = ['uniform sampler2D uA;']
  if (nTargets > 1) s.push('uniform sampler2D uB;')
  if (nTargets > 2) s.push('uniform sampler2D uC;')
  s.push('uniform ivec2 uSrcSize;')
  s.push('layout(location = 0) out vec4 oA;')
  if (nTargets > 1) s.push('layout(location = 1) out vec4 oB;')
  if (nTargets > 2) s.push('layout(location = 2) out vec4 oC;')
  s.push('void main() {')
  s.push('  ivec2 d = ivec2(gl_FragCoord.xy) * 4;')
  s.push('  vec4 a = vec4(0.0);')
  if (nTargets > 1) s.push('  vec4 b = vec4(0.0);')
  if (nTargets > 2) s.push('  vec4 c = vec4(0.0);')
  s.push('  for (int j = 0; j < 4; j++) {')
  s.push('    for (int i = 0; i < 4; i++) {')
  s.push('      ivec2 p = d + ivec2(i, j);')
  s.push('      if (p.x >= uSrcSize.x || p.y >= uSrcSize.y) continue;')
  s.push('      a += texelFetch(uA, p, 0);')
  if (nTargets > 1) s.push('      b += texelFetch(uB, p, 0);')
  if (nTargets > 2) s.push('      c += texelFetch(uC, p, 0);')
  s.push('    }')
  s.push('  }')
  s.push('  oA = a;')
  if (nTargets > 1) s.push('  oB = b;')
  if (nTargets > 2) s.push('  oC = c;')
  s.push('}')
  return s.join('\n')
}

/* ─────────────────────────────────────────────── runSelfCheck */

export interface SelfCheckResult { pass: boolean; failures: string[] }

/** 生成所有变体，畀 runSelfCheck 同 __tests__ 一齐用。 */
export function generateAll(A?: AtlasLayout): Record<string, string> {
  const L = A || atlasLayout(16, 8, 8)
  return {
    step: stepShaderSource(L, { writeForce: true }),
    stepBouzidi: stepShaderSource(L, { writeForce: true, bouzidi: true }),
    stepNoForce: stepShaderSource(L, {}),
    stepSdfGate: stepShaderSource(L, { writeForce: true, nearBodyPhi: 2.5 }),
    stepPeriodic: stepShaderSource(L, {
      bc: { xmin: 'periodic', xmax: 'periodic', ymin: 'periodic', ymax: 'periodic', zmin: 'periodic', zmax: 'periodic' },
    }),
    stepGround: stepShaderSource(L, { bc: { ymin: 'bounce' }, writeForce: true }),
    init: initShaderSource(L),
    solidClear: solidClearShaderSource(L),
    solidBody: solidBodyShaderSource(L),
    macro: macroShaderSource(L),
    volume: volumeShaderSource(L),
    volumeNoQ: volumeShaderSource(L, { needQ: false }),
    frontal: frontalShaderSource(L),
    reduce1: reduceShaderSource(1),
    reduce2: reduceShaderSource(2),
    reduce3: reduceShaderSource(3),
  }
}

/** 去晒注释，只留代码 —— lint 要 lint 代码，唔系 lint 散文。 */
export function stripGlslComments(s: string): string {
  return s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** 唔使 GL、唔使 test runner 都跑得嘅结构性自检（详见 lattice.ts 嘅用法注释）。 */
export function runSelfCheck(): SelfCheckResult {
  const failures: string[] = []
  const ck = (c: boolean, m: string) => { if (!c) failures.push(m) }

  // dotExpr 一定要同表一致
  for (let i = 0; i < Q; i++) {
    const c = ci(i)
    const e = dotExpr(i, 'v')
    const terms = (c[0] ? 1 : 0) + (c[1] ? 1 : 0) + (c[2] ? 1 : 0)
    if (terms === 0) ck(e === '0.0', 'dotExpr(rest) should be 0.0, got ' + e)
    else {
      ck((e.match(/v\./g) || []).length === terms, 'dotExpr(' + i + ') has the wrong number of terms: ' + e)
      const comps = ['x', 'y', 'z']
      for (let a = 0; a < 3; a++) {
        if (c[a] === 1) ck(new RegExp('(^|\\+ )v\\.' + comps[a]).test(e), 'dotExpr(' + i + ') missing +' + comps[a] + ': ' + e)
        if (c[a] === -1) ck(new RegExp('- v\\.' + comps[a]).test(e), 'dotExpr(' + i + ') missing -' + comps[a] + ': ' + e)
        if (c[a] === 0) ck(e.indexOf('v.' + comps[a]) < 0, 'dotExpr(' + i + ') should not mention ' + comps[a] + ': ' + e)
      }
    }
  }

  // mirrorIdx 系对合，而且只翻转一个分量
  for (let a = 0; a < 3; a++) for (let i = 0; i < Q; i++) {
    const m = mirrorIdx(a, i)
    ck(mirrorIdx(a, m) === i, 'mirrorIdx not an involution at (' + a + ',' + i + ')')
    for (let b = 0; b < 3; b++) {
      const want = b === a ? -C[i * 3 + b] : C[i * 3 + b]
      ck(C[m * 3 + b] === want, 'mirrorIdx(' + a + ',' + i + ') wrong on component ' + b)
    }
  }

  // 每个方向 pack 去唔同嘅 (texture, channel)
  const slots = new Set<string>()
  for (let i = 0; i < Q; i++) {
    const key = texOf(i) + chOf(i)
    ck(!slots.has(key), 'packing collision at direction ' + i)
    slots.add(key)
  }

  const all = generateAll()
  const src = all.step

  // ── step shader 结构 ──
  ck(src.indexOf('#version') < 0, 'the generator must not emit #version; the GL layer prepends it')
  for (let i = 0; i < Q; i++) ck(src.indexOf('// ---- direction ' + i + ' ') >= 0, 'step shader is missing direction ' + i)
  ck((src.match(/texelFetch\(uG[0-4], cellToTexel/g) || []).length >= Q - 1, 'step shader has too few neighbour fetches')
  ck((src.match(/texelFetch\(uG[0-4], T, 0\)/g) || []).length === 5, 'step shader should read its own texel exactly five times')
  for (let i = 0; i < 5; i++) ck(src.indexOf('layout(location = ' + i + ') out vec4 oG' + i) >= 0, 'missing output oG' + i)
  ck(src.indexOf('layout(location = 5) out vec4 oForce') >= 0, 'missing force output')
  ck(/oG4 = vec4\(o\[16\], o\[17\], o\[18\], 0\.0\)/.test(src), 'the unused 20th slot must be written as 0.0')

  // ── 全部生成物：ASCII + 括号平衡 + GLSL ES 3.00 lint ──
  for (const name of Object.keys(all)) {
    const whole = all[name]
    // ★ 非 ASCII 会令 ANGLE / D3D 直接 compile error ★
    const bad = whole.match(/[^\x00-\x7F]/)
    ck(!bad, name + ': non-ASCII character ' + JSON.stringify(bad ? bad[0] : '') + ' in generated GLSL')

    const code = stripGlslComments(whole)
    let depth = 0, par = 0, broke = false
    for (let k = 0; k < code.length; k++) {
      const ch = code[k]
      if (ch === '{') depth++; else if (ch === '}') depth--
      if (ch === '(') par++; else if (ch === ')') par--
      if (depth < 0) { failures.push(name + ': unbalanced } at offset ' + k); broke = true; break }
    }
    if (!broke) ck(depth === 0, name + ': ' + depth + ' unclosed braces')
    ck(par === 0, name + ': ' + par + ' unclosed parens')
    ck(code.indexOf('texture2D') < 0, name + ': texture2D is GLSL ES 1.00, use texture()')
    ck(code.indexOf('gl_FragColor') < 0, name + ': gl_FragColor is GLSL ES 1.00')
    ck(!/\bNaN\b/.test(code), name + ': literal NaN in code')
    // 唔小心写咗整数除法，例如 "1 / 2" —— GLSL 会算成 0
    ck(!/[^.\w]\d+\s*\/\s*\d+[^.\w]/.test(code), name + ': integer division where a float was meant')
    // vec 构造子入面嘅整数字面量
    ck(!/\bvec[234]\((\s*-?\d+\s*[,)])/.test(code.replace(/vec[234]\(0\)/g, '')), name + ': integer literal inside a vec constructor')
  }

  // ── 物理路径 ──
  ck(/bool mSolid = nearBody && phiAt\(mg\) < 0\.0;/.test(src),
    'a free-slip mirror that lands in the body must bounce back, not read the solid rest state')
  ck(/specular -> direction/.test(src), 'free-slip faces should generate specular reads')
  ck(src.indexOf('the driven inlet layer') >= 0, 'the inlet must overwrite the whole cell')
  ck(/e\[0\] \+= gn\[0\] - eN\[0\];/.test(src), 'the inlet must borrow the neighbour non-equilibrium (Guo NEEM)')
  ck(/if \(c\.x == 0\) nb = ivec3\(1, c\.y, c\.z\);/.test(src), 'the inlet must extrapolate density from its interior neighbour')
  ck(src.indexOf('if (!isInlet) {') > src.indexOf('the driven inlet layer'), 'the nineteen gathers must be skipped for an inlet node')
  ck(/vec3 dP = -vec3\([^)]*\) \* \(gIn \+ gOut\) - uw \* \(gIn - gOut\);/.test(src), 'the momentum-exchange formula is wrong')
  ck(!/-\s*2\.0\s*\*\s*W\[/.test(stripGlslComments(src)), 'the -2 w c normalisation term must stay dropped')
  ck(/float wm = 1\.0 \/ \(uMagic \/ \(1\.0 \/ wp - 0\.5\) \+ 0\.5\);/.test(src),
    'omega_minus must be derived from the EDDY-MODIFIED omega_plus (wp) via the fixed Lambda uMagic')
  ck(src.indexOf('float wm') > src.indexOf('wp = 1.0 / tauT;'), 'wm must be computed AFTER the Smagorinsky correction to wp')
  ck(/float tauT = 0\.5 \* \(tau0 \+ sqrt\(tau0\*tau0 \+ 18\.0 \* uLesCs \* uLesCs \* Qbar \/ rho\)\);/.test(src),
    'the Smagorinsky eddy viscosity must use the radical form')
  ck(/uSpongeStrength \* t \* t/.test(src), 'the outlet sponge must ramp quadratically')

  // ── 变体 ──
  ck(all.step.indexOf('#define BOUZIDI') < 0, 'Bouzidi must be OFF by default (we only have a binary voxel mask)')
  ck(all.stepBouzidi.indexOf('#define BOUZIDI 1') >= 0, 'the bouzidi option must define BOUZIDI')
  ck(/2\.0 \* q \* gIn/.test(src) && /inv \* gIn/.test(src), 'both Bouzidi branches must be generated even when off')
  ck(src.indexOf('bool nearBody = true;') >= 0, 'the default nearBody gate must be unconditional for a binary mask')
  ck(all.stepSdfGate.indexOf('bool nearBody = phi < 2.5;') >= 0, 'nearBodyPhi must generate the SDF gate')
  ck(all.stepPeriodic.indexOf('bool o0') < 0, 'a fully periodic domain should generate no face conditions')
  ck(all.stepPeriodic.indexOf('% NX') > 0, 'a periodic x axis should generate a wrap')
  ck(all.stepPeriodic.indexOf('the driven inlet layer') < 0, 'a periodic domain must not generate an inlet')
  ck(all.stepGround.indexOf('uInletBL') > 0, 'a bounce face must generate the inlet boundary layer ramp')
  ck(all.step.indexOf('uInletBL') < 0, 'with no bounce face there is no boundary layer, so no uniform for it')
  ck(all.stepNoForce.indexOf('#define WRITE_FORCE') < 0, 'the no-force variant must not define WRITE_FORCE')
  ck(all.reduce1.indexOf('uB') < 0 && all.reduce1.indexOf('oB') < 0, 'reduce(1) leaked its second target')
  ck(all.reduce2.indexOf('oB') > 0, 'reduce(2) is missing its second target')
  ck(all.reduce3.indexOf('oC') > 0, 'reduce(3) is missing its third target')
  ck(/for \(int x = 0; x < NX; x\+\+\)/.test(all.frontal), 'frontal pass does not march x')
  ck(all.frontal.indexOf('break;') < 0, 'frontal pass must not break at the first solid cell')
  ck(/phiNow, prev/.test(all.solidBody), 'solid-body source must min-combine phi')
  ck(all.volume.indexOf('transpose(G)') > 0, 'the volume pass must build the strain/rotation split')
  ck(all.volumeNoQ.indexOf('transpose(G)') < 0, 'needQ:false must compile the gradient out entirely')

  return { pass: failures.length === 0, failures }
}
