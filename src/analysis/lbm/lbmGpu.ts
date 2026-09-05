// lbmGpu.ts —— GPU LBM 求解器。拥有啲 texture、啲 pass、同埋佢哋跑嘅次序。
//
// 一帧：
//
//   solid      把零件嘅 phi 场 min-combine 入 lattice（只喺零件换咗先做）
//   step  xN   融合嘅 stream+collide，ping-pong；写入 rtA 嗰啲 substep 顺手写动量交换
//   macro      分布 → (delta, u)，一次，畀显示同入口用
//   volume     macro atlas → 真 TEXTURE_3D 速度场 + Q 准则（唔使就跳过）
//   frontal    零件沿流轴嘅影 → Cd 嘅参考面积
//   reduce     力 / 力矩 / 面积 收埋做一个 texel
//   read       ★ 唔停 pipeline 咁 ★ 执返前几帧嘅答案
//
// readback 永远迟一两帧。呢个係【正确】嘅：gl.readPixels 入 client memory 会令 CPU 等 GPU
// 排干，喺 1M cell 上面贵过成个 step。收敛判定由「成功读到几多次」驱动 —— 见 asyncReader.ts。
//
//
// ★★ 七个 attachment 点解係共用嘅，同点解 substep 数会自动 +1 ★★
// ───────────────────────────────────────────────────────────
// force-writing step 变体要写七个 output（5 分布 + oForce + oTorque）。three 嘅 RenderTarget
// 一建立就【拥有】自己嗰批 texture，冇得两个 RT 共用同一批 —— 所以最直白嘅写法係两边都 count:7，
// 即係多两张全 atlas 嘅 RGBA32F（160×80×80 嗰阵 = +34 MB）。
//
// 更重要嘅係一条 GL 规矩：★ fragment shader 冇写嘅 draw buffer，内容係 undefined ★。
// 所以只要个 RT 有七个 attachment，写入佢嘅【每一个】substep 都必须用七输出嘅 shader，
// 否则 oForce/oTorque 会被垃圾覆写。两边都 count:7 = 每一个 substep 都写力场 = 双倍 bandwidth。
//
// 我哋改为：rtA = count 7、rtB = count 5，规矩係「dst 係 rtA 就用 force 变体」。
// 咁一帧入面大约一半 substep 写力场，而且【最后一个 substep 一定要落喺 rtA】——
// 否则读到嘅力係上一个 substep 嘅。ping-pong 嘅奇偶由历史决定、唔由我哋拣，
// 所以 _substepPlan() 会喺奇偶唔啱嗰阵【多行一个 substep】。多行一步係冇代价嘅；
// 读错一步嘅力先係 bug。
//
//
// ★★ three 嘅 state 会漏 ★★
// ────────────────────────
// advance() 前后要 save/restore DEPTH_TEST / CULL_FACE / BLEND / depthMask / autoClear /
// viewport / active texture unit / framebuffer binding，而且任何 raw-context 操作
// （asyncReader 嘅 readBuffer、我哋 realize RT 时嘅 checkFramebufferStatus）之后要
// renderer.resetState()。做错嘅症状係：CAD viewport 渲染入咗 solver 嘅 target，
// 冇任何 error、冇任何 warning，画面就係唔见咗。

import {
  ClampToEdgeWrapping, Color, Data3DTexture, FloatType, GLSL3, HalfFloatType, LinearFilter, Matrix4,
  Mesh, NearestFilter, NoBlending, OrthographicCamera, PlaneGeometry, RGBAFormat, RawShaderMaterial,
  RedFormat, Scene, Vector2, Vector3, WebGL3DRenderTarget, WebGLRenderTarget,
} from 'three'
import type { Material, Texture, WebGLRenderer } from 'three'

import {
  LES_CS, N_TARGETS, OMEGA_MINUS, U_LB, lambdaFromOmegas, nuFromOmega, omegaFromNu,
} from './lattice.ts'
import { cellToTexel, layout } from './atlas.ts'
import type { AtlasLayout } from './atlas.ts'
import {
  DEFAULT_BC, SPONGE_CELLS, SPONGE_STRENGTH, frontalShaderSource, initShaderSource,
  macroShaderSource, reduceShaderSource, solidBodyShaderSource, solidClearShaderSource,
  stepShaderSource, volumeShaderSource,
} from './shaders.ts'
import type { BoundaryConditions } from './shaders.ts'
import { bakePhi, buildDomain, planResolution } from './sdfBake.ts'
import type { DomainOptions, PhiField, VoxelGridLike, WindDomain } from './sdfBake.ts'
import {
  assertRigid, bodySphere, countRefillCells, defaultOutside, defaultSampleMode, invertRigid,
  poseIsIdentity, rigidCheck, safePoseBox,
} from './rigidPose.ts'
import type { BodySphere, PoseBox, PoseSampleMode } from './rigidPose.ts'
import { fbStatusName, probeMRT } from './probeMRT.ts'
import type { MrtReport } from './probeMRT.ts'
import { AsyncPixelReader } from './asyncReader.ts'

/* ════════════════════════════════════════════════════ 写死嘅物理设定 */

/**
 * omega_plus 嘅硬上限。
 *
 * lattice.ts 嗰张实测表：omega_minus 钉喺 0.8 嗰行，omega_plus 去到 1.9802 都仲係稳嘅
 * （1.33，冇 NaN）。我哋钉 1.98 —— 留返一点点余量，而且 Smagorinsky 只会【拉低】omega_plus，
 * 永远唔会推佢过界。要谷更高雷诺数嘅话，答案係加分辨率，唔係推呢个数。
 */
export const OMEGA_PLUS_MAX = 1.98
/** 稳定层流带下限（同 windtunnel.ts 一样）。 */
export const RE_LB_MIN = 6
/** 稳定层流带上限。★ 蓄意同 windtunnel.ts 用【同一个】数 ★ —— 两个求解器要比 Cd，钳唔同就冇得比。 */
export const RE_LB_MAX = 800
/** 入口余弦渐升最少行几多步（避免细域一开波就被冲击启动震到）。 */
export const RAMP_MIN_STEPS = 200

/* ════════════════════════════════════════════════════════ quality tier */

export type TierName = 'low' | 'medium' | 'high'

export interface QualityTier {
  name: TierName
  /** 呢个 tier 容许嘅【最大】域尺寸（真域会细过或等于佢，由零件长宽比决定） */
  nx: number; ny: number; nz: number
  substeps: number
}

/**
 * 由细到大。walk-down 由大嗰头行落嚟。
 *
 * substeps：一个 LBM step 令流场行 U_LB = 0.05 格。一件横跨 40 格嘅零件要 800 步先畀流过一次
 * （一个对流时间）。尾流要十几个对流时间先定落嚟。所以 substeps 唔係「畫面順唔順」嘅設定，
 * 係「等幾耐先有 Cd」嘅設定。
 */
export const QUALITY_TIERS: QualityTier[] = [
  { name: 'low', nx: 96, ny: 48, nz: 48, substeps: 8 },
  { name: 'medium', nx: 128, ny: 64, nz: 64, substeps: 6 },
  { name: 'high', nx: 160, ny: 80, nz: 80, substeps: 5 },
]

export interface VramBreakdown {
  atlas: AtlasLayout
  /** 分布场（ping-pong 两边） */
  dist: number
  /** solid ×2 + macro + [force + torque] */
  aux: number
  /** 两张 RGBA16F 3D 体积 */
  vol: number
  /** reduce 金字塔 + frontal */
  reduce: number
  /** phi 3D texture（R32F） */
  phi: number
  total: number
}

/** 一条 reduce 链嘅 byte 数（每 pass 两轴各收 4 倍）。 */
function pyramidBytes(w: number, h: number, nTargets: number): number {
  let bytes = 0
  let lw = w, lh = h, guard = 0
  while ((lw > 1 || lh > 1) && guard++ < 24) {
    lw = Math.max(1, Math.ceil(lw / 4))
    lh = Math.max(1, Math.ceil(lh / 4))
    bytes += lw * lh * 16 * nTargets
  }
  return bytes
}

/**
 * 一个 lattice 要几多 VRAM。★ force measurement 对我哋係【永远开】★（Cd 就係产品），
 * 所以七 attachment 变体同两张额外嘅全 atlas RGBA32F 由第一日就要计入预算。
 */
export function vramBytesFor(nx: number, ny: number, nz: number, measure = true, maxTexture = 16384): VramBreakdown {
  const A = layout(nx, ny, nz, maxTexture)
  const dist = A.texels * 16 * N_TARGETS * 2
  // rtA 嘅第 6、7 个 attachment（force / torque）—— rtB 冇，见文件头
  const aux = A.texels * (16 * 2 + 16 + (measure ? 16 + 16 : 0))
  const vol = nx * ny * nz * (8 + 8)
  const reduce = measure ? pyramidBytes(A.width, A.height, 2) + pyramidBytes(ny, nz, 1) + ny * nz * 16 : 0
  const phi = nx * ny * nz * 4
  return { atlas: A, dist, aux, vol, reduce, phi, total: dist + aux + vol + reduce + phi }
}

/**
 * 开波拣边个 tier。
 *
 * 冇任何诚实嘅方法问 browser「你肯畀几多 texture memory」，所以呢度係一个【猜】，
 * 而 walk-down 先係真正嘅保险。猜错唔紧要，猜到手机开 high 然后黑屏先係灾难。
 */
export function pickTier(caps: MrtReport, hint: { deviceMemoryGB?: number; lowPower?: boolean } = {}): QualityTier {
  const mem = hint.deviceMemoryGB
  if (hint.lowPower) return QUALITY_TIERS[0]
  if (caps.maxTextureSize < 8192) return QUALITY_TIERS[0]
  if (typeof mem === 'number' && mem <= 4) return QUALITY_TIERS[0]
  if (typeof mem === 'number' && mem <= 8) return QUALITY_TIERS[1]
  return QUALITY_TIERS[QUALITY_TIERS.length - 1]
}

/* ════════════════════════════════════════════════════════ 流动参数 */

export interface FlowInput {
  /** 来流速度 m/s */
  speed: number
  /** 流体密度 kg/m³ */
  rho: number
  /** 动力黏度 Pa·s */
  mu: number
}

export interface FlowSetup {
  /** 真实雷诺数 ρVD/μ */
  reReal: number
  /** 想要嘅格子雷诺数（钳入稳定带之后） */
  reLbTarget: number
  /** 真正跑紧嘅格子雷诺数（再受 omega_plus 上限钳一次） */
  reLbEffective: number
  nuLb: number
  omegaPlus: number
  /** TRT Lambda —— ★ 由钉死嘅 omega_minus 反推，唔係钉死 Lambda ★ */
  magic: number
  omegaMinus: number
  uLb: number
  lesCs: number
  rampSteps: number
  spongeStart: number
  spongeStrength: number
  /** reLb 有冇真係被钳（面板据此提示「呢个係趋势值」） */
  reClamped: boolean
  /** 係咪撞到 omega_plus 上限（即係想要嘅 Re 连 TRT 都撑唔住） */
  omegaClamped: boolean
  /** 格子速度 × 呢个 = m/s */
  latToMs: number
  warnings: string[]
}

/**
 * 由真实工况推格子参数。★ 呢度就係物理落地嘅地方 ★，所以佢係一个【纯函数】，
 * 唔使 GL 都测得。
 */
export function deriveFlow(dom: WindDomain, inp: FlowInput): FlowSetup {
  const warnings: string[] = []
  const V = Number.isFinite(inp.speed) && inp.speed > 0 ? inp.speed : 10
  const rho = Number.isFinite(inp.rho) && inp.rho > 0 ? inp.rho : 1.204
  const mu = Number.isFinite(inp.mu) && inp.mu > 0 ? inp.mu : 1.81e-5

  const reReal = rho * V * dom.refLenM / mu
  let reLbTarget = reReal
  const reBad = !Number.isFinite(reLbTarget) || reLbTarget <= 0
  if (reBad) reLbTarget = 100
  const rePre = reLbTarget
  reLbTarget = Math.min(RE_LB_MAX, Math.max(RE_LB_MIN, reLbTarget))
  const reClamped = reBad || reLbTarget !== rePre

  // nu = U_LB · D_lb / Re_lb，再由 omega_plus 上限钳一次
  let nuLb = U_LB * dom.dLb / reLbTarget
  const nuFloor = nuFromOmega(OMEGA_PLUS_MAX)
  let omegaClamped = false
  if (!(nuLb > nuFloor)) { nuLb = nuFloor; omegaClamped = true }
  const omegaPlus = omegaFromNu(nuLb)
  const reLbEffective = U_LB * dom.dLb / nuLb

  if (reClamped) warnings.push(`真实 Re≈${reReal.toExponential(1)} → 格子 Re 钳到 ${reLbTarget.toFixed(0)}（稳定层流带 [${RE_LB_MIN},${RE_LB_MAX}]）；绝对 Cd 係趋势值，相对比较仍可信`)
  if (omegaClamped) warnings.push(`格子 Re 再被 omega_plus<=${OMEGA_PLUS_MAX} 钳到 ${reLbEffective.toFixed(0)}：要更高 Re 要加分辨率，唔係推呢个数`)
  if (dom.dLb < 8) warnings.push(`迎风等效直径仅 ${dom.dLb.toFixed(1)} 格：边界层解唔到，Cd 准度有限`)

  return {
    reReal, reLbTarget, reLbEffective, nuLb, omegaPlus,
    // ★ 钉 omega_minus，畀 Lambda 跟住走 ★ —— 反过嚟钉 Lambda = 3/16 会令 omega_minus
    //   喺高 Re 跌到 0.03~0.09，奇非平衡模态无阻尼咁长大，omega_plus >= 1.95 就 NaN。
    //   见 lattice.ts omegaMinusFromLambda 嘅实测表。
    magic: lambdaFromOmegas(omegaPlus, OMEGA_MINUS),
    omegaMinus: OMEGA_MINUS,
    uLb: U_LB,
    lesCs: LES_CS,
    rampSteps: Math.max(RAMP_MIN_STEPS, Math.round(0.6 * dom.DX / U_LB)),
    spongeStart: dom.DX - SPONGE_CELLS,
    spongeStrength: SPONGE_STRENGTH,
    reClamped, omegaClamped,
    latToMs: V / U_LB,
    warnings,
  }
}

/** 入口余弦渐升（0 → 1）。冲击启动会喺入口平面射一道压力波落成条流道。 */
export function inletRamp(step: number, rampSteps: number): number {
  if (!(rampSteps > 0)) return 1
  if (step >= rampSteps) return 1
  return 0.5 * (1 - Math.cos(Math.PI * step / rampSteps))
}

/* ════════════════════════════════════════════════════════ 错误 */

interface TaggedError extends Error { contextLost?: boolean; oom?: boolean }

function taggedError(msg: string, tag: { contextLost?: boolean; oom?: boolean }): TaggedError {
  const e = new Error(msg) as TaggedError
  if (tag.contextLost) e.contextLost = true
  if (tag.oom) e.oom = true
  return e
}

/**
 * ★ 一次 context loss 唔可以报成三次「显存唔够」★
 * walk-down 见到 context lost 要即刻放弃（细 lattice 救唔到），见到 OOM 先至行落一级。
 */
export function isContextLostError(e: unknown): boolean {
  return !!(e && typeof e === 'object' && (e as TaggedError).contextLost === true)
}

/* ════════════════════════════════════════════════════════ GLSL 前置 */

// three 会自己前置 '#version 300 es'（glslVersion: GLSL3），所以我哋唔可以再写一次；
// 但 RawShaderMaterial【唔会】帮你加 precision —— GLSL ES 3.00 嘅 fragment stage
// 冇 float / sampler3D 嘅预设精度，唔声明就係 compile error，而且报嘅 line number
// 会指去一段完全无关嘅 chunk。所以喺呢度声明一次，齐晒。
const FS_PREAMBLE = [
  'precision highp float;',
  'precision highp int;',
  'precision highp sampler2D;',
  'precision highp sampler3D;',
  '',
].join('\n')

const FULLSCREEN_VS = [
  'precision highp float;',
  'in vec3 position;',
  'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
].join('\n')

/* ════════════════════════════════════════════════════════ 求解器 */

export interface LbmGpuOptions {
  /** 六面边界；缺省 = CAD 风洞（+X 入、-X 出、四面自由滑移） */
  bc?: Partial<BoundaryConditions>
  /** 量唔量力（Cd）。★ 我哋预设 true ★ —— Cd 就係产品。 */
  measure?: boolean
  /** 起唔起 3D 速度体积（烟流 / 表面着色要） */
  needVolume?: boolean
  /** 3D 体积要唔要 Q 准则同涡量（贵十三次 fetch/格） */
  needQ?: boolean
  substeps?: number
  flow?: FlowInput
  /** 装置能力报告；唔传就即场 probe */
  caps?: MrtReport
  tier?: TierName
}

export interface ForceSample {
  /** 格子单位嘅合力（域坐标；x = 来流方向） */
  force: [number, number, number]
  torque: [number, number, number]
  /** 反弹 link 数。0 = 条流根本掂唔到零件 → Cd 冇意义 */
  links: number
  /** 迎风格数（★ GPU 量嘅 ★，同 solver 真係反弹嗰个 phi 场同源；同 CPU 嗰个应该一致） */
  areaCells: number
  /** GPU 量到嘅迎风面积 mm²（Stage 6 可以同 domain.frontalAreaMM2 对数） */
  frontalAreaMM2: number
  /** Cd = 2F/(ρU²A)，格子单位（ρ=1） */
  cd: number
  /** 阻力 N（换返真实工况） */
  dragN: number
  /** 取样嗰阵已经行咗几多 step */
  step: number
  /** 入口渐升完成咗未；未完成嘅 Cd 唔好信 */
  rampDone: boolean
}

export interface SolverReport {
  tier: TierName | 'custom'
  nx: number; ny: number; nz: number
  atlas: AtlasLayout
  vram: VramBreakdown
  measure: boolean
  substeps: number
  caps: MrtReport
  flow: FlowSetup
  domain: { frontalCells: number; frontalAreaMM2: number; dLb: number; refLenM: number; h: number }
  phi: { trueSdf: boolean; band: number; nearBodyPhi: number; notes: string[] }
  bouzidi: boolean
  /** 而家係咪行紧一个非烘焙姿态（setPose 过而且唔係恒等） */
  poseApplied: boolean
  /** 上一次 setPose 入面【由固体变返流体】嘅格数 —— 即係食咗 simple refill 嗰批 */
  poseRefillCells: number
  pose: PoseReport
  warnings: string[]
}

export interface PoseReport {
  applied: boolean
  /** column-major 16（three 约定）；null = 未 setPose 过 */
  matrix: number[] | null
  /** 上一次 setPose 有冇 keepFlow */
  keepFlow: boolean
  /** 今次由固体变返流体嘅格数（simple refill 踩到嗰批） */
  refillCells: number
  /** 今次由流体变固体嘅格数（对称嗰边） */
  newSolidCells: number
  /** refill 计数扫过几多格（局部扫描；域总格数见 nx*ny*nz） */
  refillScanned: number
  /** setPose 落嗰刻嘅 stepCount —— 用嚟判断 settle 咗几耐 */
  poseStep: number
  /** 3×3 行列式（−1 = 镜射：保距，但零件係镜像） */
  det: number
  orthoErr: number
  /** 取样路径 */
  sampler: PoseSampleMode
  /** 零件外接球（烘焙姿态，域 lattice 坐标） */
  sphere: { centre: [number, number, number]; radius: number; solidCells: number }
  /** 上一次算出嚟嘅合法平移盒（marginCells = 2） */
  box: { min: [number, number, number]; max: [number, number, number]; feasible: boolean }
  notes: string[]
}

type PassName =
  | 'step' | 'stepForce' | 'init' | 'solidClear' | 'solidBody'
  | 'macro' | 'volume' | 'frontal' | 'reduce2' | 'reduce1'

interface Pass {
  name: PassName
  mat: RawShaderMaterial
  mesh: Mesh
}

interface PyramidLevel { w: number; h: number; rt: WebGLRenderTarget }

/** three 内部 program handle 嘅【最细】形状（compile readiness 轮询用）。 */
interface ProgramLike { isReady?: () => boolean }
interface MaterialPropsLike { currentProgram?: ProgramLike }

export class LbmGpu {
  readonly renderer: WebGLRenderer
  readonly gl: WebGL2RenderingContext
  readonly domain: WindDomain
  readonly A: AtlasLayout
  readonly nx: number; readonly ny: number; readonly nz: number
  readonly measure: boolean
  readonly caps: MrtReport
  readonly bc: BoundaryConditions
  readonly nearBodyPhi: number
  readonly tier: TierName | 'custom'

  flow: FlowSetup
  substeps: number
  needVolume: boolean
  needQ: boolean
  stepCount = 0

  private disposed = false
  private scene: Scene | null = null
  private cam: OrthographicCamera | null = null
  private geo: PlaneGeometry | null = null
  private passes = new Map<PassName, Pass>()
  private passOrder: Pass[] = []

  // ping-pong 分布场。★ rtA 有七个 attachment（+force +torque），rtB 得五个 ★
  private rtA: WebGLRenderTarget | null = null
  private rtB: WebGLRenderTarget | null = null
  private src: WebGLRenderTarget | null = null
  private dst: WebGLRenderTarget | null = null

  private solidA: WebGLRenderTarget | null = null
  private solidB: WebGLRenderTarget | null = null
  private solidTex: Texture | null = null
  private macroRT: WebGLRenderTarget | null = null
  private frontalRT: WebGLRenderTarget | null = null
  private volRT: WebGL3DRenderTarget | null = null
  private phiTex: Data3DTexture | null = null

  private pyrForce: PyramidLevel[] = []
  private pyrArea: PyramidLevel[] = []
  private readForce: AsyncPixelReader | null = null
  private readTorque: AsyncPixelReader | null = null
  private readArea: AsyncPixelReader | null = null

  private _force: [number, number, number] = [0, 0, 0]
  private _torque: [number, number, number] = [0, 0, 0]
  private _links = 0
  private _areaCells = 0
  private _sampleStep = 0
  private _fresh = false
  /** 面积嘅 fence 至少落过一次；未落之前报 Cd 係讲大话 */
  private _haveArea = false
  private phiMeta: { trueSdf: boolean; band: number; nearBodyPhi: number; notes: string[] }
  private warnings: string[] = []

  /* ── 位姿（见 rigidPose.ts）。phiData 係上传咗嗰个 Float32Array 嘅【同一个】reference：
   *    refill 计数要喺 CPU 上面重跑一次 shader 嘅取样模型，冇佢就数唔到。★ 唔准喺外面改佢 ★ */
  private phiLike: { data: Float32Array; DX: number; DY: number; DZ: number; trueSdf: boolean; band: number } | null = null
  private poseMode: PoseSampleMode = 'vote27'
  private phiOutside = 1
  private _sphere: BodySphere | null = null
  private _poseBox: PoseBox | null = null
  /** 当前位姿（恒等 = 烘焙姿态）。setGeometry 会推返恒等。 */
  private _poseM = new Matrix4()
  private _poseApplied = false
  private _poseKeepFlow = false
  private _poseRefill = 0
  private _poseNewSolid = 0
  private _poseScanned = 0
  private _poseStep = 0
  private _poseNotes: string[] = []
  /** 只係为咗把格子力换返 N；物理本身完全喺格子单位入面做。 */
  private flowRho = 1.204
  private flowSpeed = 10
  private clearColor = new Color()

  constructor(renderer: WebGLRenderer, domain: WindDomain, phi: PhiField, opts: LbmGpuOptions = {}) {
    this.renderer = renderer
    this.gl = renderer.getContext() as WebGL2RenderingContext
    this.domain = domain
    this.nx = domain.DX; this.ny = domain.DY; this.nz = domain.DZ
    this.measure = opts.measure !== false
    this.needVolume = opts.needVolume !== false
    this.needQ = opts.needQ !== false
    this.tier = opts.tier ?? 'custom'
    this.bc = { ...DEFAULT_BC, ...(opts.bc || {}) }
    this.nearBodyPhi = phi.nearBodyPhi
    this.phiMeta = { trueSdf: phi.trueSdf, band: phi.band, nearBodyPhi: phi.nearBodyPhi, notes: phi.notes.slice() }

    const caps = opts.caps ?? probeMRT(this.gl)
    this.caps = caps
    if (!caps.ok) throw taggedError('LBM: ' + caps.reason, { contextLost: caps.contextLost })
    if (this.measure && !caps.force7) {
      throw taggedError('LBM: 要七个 RGBA32F attachment 先量到阻力，呢部机得 ' + caps.maxColorAttachments + ' 个（' + caps.reason + '）', {})
    }

    this.A = layout(this.nx, this.ny, this.nz, caps.maxTextureSize)
    if (this.nx > caps.max3DTextureSize || this.ny > caps.max3DTextureSize || this.nz > caps.max3DTextureSize) {
      throw taggedError('LBM: 域 ' + this.nx + '×' + this.ny + '×' + this.nz + ' 超过 MAX_3D_TEXTURE_SIZE=' + caps.max3DTextureSize, {})
    }

    const flowIn = opts.flow ?? { speed: 10, rho: 1.204, mu: 1.81e-5 }
    this.flow = deriveFlow(domain, flowIn)
    this.flowRho = flowIn.rho
    this.flowSpeed = flowIn.speed
    this.substeps = Math.max(1, Math.round(opts.substeps ?? 6))

    /*
     * ★★ 分配唔到就自己清干净自己 ★★
     *
     * _allocate() 喺撑唔起呢个 size 嘅 GPU 上面会掟错。caller 嘅应对係「细一级再试」，
     * 而咁样只有喺【失败嗰次真係放返啲嘢出嚟】先成立。冇呢段，第一次尝试漏低四百 MB，
     * 第二次就用一个更细嘅预算撞同一堵墙，然后报「显存唔够」—— 三次。
     *
     * `new` 掟错嗰阵永远唔会 assign，所以半成品对象一 rethrow 就冇人捉得返，
     * 冇人 dispose 得到佢。所以呢件事一定要喺呢度做。
     */
    const snap = this._saveState()
    try {
      this._allocate()
      this._makePrograms()
      this.setGeometry(phi)
    } catch (e) {
      try { this.dispose() } catch { /* 半途 teardown 唔可以盖过真正嘅错误 */ }
      throw e
    } finally {
      // _realize() / init pass 郁过 render target 同 viewport —— 无论成功定失败都要还原，
      // 否则 walk-down 嘅下一次尝试（同埋 CAD viewport）会喺一个唔属于佢哋嘅 target 上面画嘢。
      try { this._restoreState(snap) } catch { /* context 已经冇咗就算 */ }
    }
  }

  /* ───────────────────────────────────────────────── 资源 */

  private _rt(w: number, h: number, count: number, opts: { half?: boolean; linear?: boolean } = {}): WebGLRenderTarget {
    // ★ atlas sampler 永远唔可以 filter ★ —— 一次跨 tile 边界嘅 bilinear 抽样会静静鸡
    //   沟埋两个唔同嘅 Z 切片，唔报错、唔黑屏，只係喺 tile 接缝多咗一层假扩散。
    const f = opts.linear ? LinearFilter : NearestFilter
    return new WebGLRenderTarget(w, h, {
      count,
      type: opts.half ? HalfFloatType : FloatType,
      format: RGBAFormat,
      minFilter: f, magFilter: f,
      wrapS: ClampToEdgeWrapping, wrapT: ClampToEdgeWrapping,
      depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
    })
  }

  /**
   * three 嘅 render target 係【lazy】嘅：new 出嚟嗰阵一个 GL object 都冇。
   * 咁 walk-down 就永远唔会 fire —— 直到第一帧先黑屏。所以呢度即刻 bind 一次，
   * 逼佢真係 allocate，再亲自问 checkFramebufferStatus。
   */
  private _realize(rt: WebGLRenderTarget, name: string, layer?: number): void {
    const gl = this.gl
    for (let i = 0; i < 64 && gl.getError() !== gl.NO_ERROR; i++) { /* 清走上一段留低嘅 error */ }
    this.renderer.setRenderTarget(rt, layer)
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
    let err: number = gl.NO_ERROR
    for (let i = 0; i < 64; i++) { const e = gl.getError(); if (e === gl.NO_ERROR) break; err = e }
    this.renderer.setRenderTarget(null)
    if (gl.isContextLost()) {
      throw taggedError('LBM: 分配 "' + name + '" 嗰阵 WebGL context 遗失 —— 唔係显存唔够，细 lattice 救唔到', { contextLost: true })
    }
    if (st !== gl.FRAMEBUFFER_COMPLETE || err === gl.OUT_OF_MEMORY) {
      throw taggedError(
        'LBM: render target "' + name + '" 分配失败 — ' + fbStatusName(gl, st) +
        (err !== gl.NO_ERROR ? '（GL error 0x' + err.toString(16) + '）' : ''),
        { oom: true },
      )
    }
  }

  private _pyramid(w: number, h: number, nTargets: number, name: string): PyramidLevel[] {
    const levels: PyramidLevel[] = []
    let lw = w, lh = h
    while (lw > 1 || lh > 1) {
      lw = Math.max(1, Math.ceil(lw / 4))
      lh = Math.max(1, Math.ceil(lh / 4))
      const rt = this._rt(lw, lh, nTargets)
      levels.push({ w: lw, h: lh, rt })
      this._realize(rt, name + lw + 'x' + lh)
      if (levels.length > 24) throw taggedError('LBM: reduce 金字塔唔收敛', {})
    }
    return levels
  }

  private _allocate(): void {
    const A = this.A
    // ★ rtA = 7 attachment（分布 + force + torque），rtB = 5 ★ —— 见文件头
    this.rtA = this._rt(A.width, A.height, this.measure ? N_TARGETS + 2 : N_TARGETS)
    this._realize(this.rtA, 'distA')
    this.rtB = this._rt(A.width, A.height, N_TARGETS)
    this._realize(this.rtB, 'distB')

    this.solidA = this._rt(A.width, A.height, 1); this._realize(this.solidA, 'solidA')
    this.solidB = this._rt(A.width, A.height, 1); this._realize(this.solidB, 'solidB')
    this.macroRT = this._rt(A.width, A.height, 1); this._realize(this.macroRT, 'macro')

    if (this.measure) {
      // 我哋一次淨係吹一件零件，frontalShaderSource 只发射一个 output（唔係参考实现嘅
      // per-body ×3），所以呢度係一张 target 唔係三张。
      this.frontalRT = this._rt(this.ny, this.nz, 1); this._realize(this.frontalRT, 'frontal')
    }

    // ⚠ 呢张先至係可以 filter 嗰张。atlas 唔可以。
    this.volRT = new WebGL3DRenderTarget(this.nx, this.ny, this.nz, {
      count: 2, type: HalfFloatType, format: RGBAFormat,
      minFilter: LinearFilter, magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping, wrapT: ClampToEdgeWrapping, wrapR: ClampToEdgeWrapping,
      depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
    })
    this._realize(this.volRT, 'volume', 0)

    if (this.measure) {
      this.pyrForce = this._pyramid(A.width, A.height, 2, 'reduceF')
      this.pyrArea = this._pyramid(this.ny, this.nz, 1, 'reduceA')
      this.readForce = new AsyncPixelReader(this.gl, 4)
      this.readTorque = new AsyncPixelReader(this.gl, 4)
      this.readArea = new AsyncPixelReader(this.gl, 4)
    }

    // phi 3D texture（R32F，NEAREST）。二值 mask 畀 linear filter 抽样会产生【假嘅小数距离】。
    this.phiTex = new Data3DTexture(new Float32Array(this.nx * this.ny * this.nz), this.nx, this.ny, this.nz)
    this.phiTex.format = RedFormat
    this.phiTex.type = FloatType
    this.phiTex.minFilter = NearestFilter
    this.phiTex.magFilter = NearestFilter
    this.phiTex.wrapS = this.phiTex.wrapT = this.phiTex.wrapR = ClampToEdgeWrapping
    this.phiTex.needsUpdate = true
  }

  private _addPass(name: PassName, fs: string, uniforms: Record<string, { value: unknown }>): void {
    const mat = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: FULLSCREEN_VS,
      fragmentShader: FS_PREAMBLE + fs,
      uniforms: uniforms as RawShaderMaterial['uniforms'],
      depthTest: false, depthWrite: false, blending: NoBlending,
    })
    mat.name = 'lbm.' + name
    const mesh = new Mesh(this.geo as PlaneGeometry, mat)
    mesh.frustumCulled = false
    mesh.visible = false
    const pass: Pass = { name, mat, mesh }
    this.passes.set(name, pass)
    this.passOrder.push(pass)
    ;(this.scene as Scene).add(mesh)
  }

  private _makePrograms(): void {
    const A = this.A
    this.scene = new Scene()
    this.cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.geo = new PlaneGeometry(2, 2)

    const gate = Number.isFinite(this.nearBodyPhi) ? { nearBodyPhi: this.nearBodyPhi } : {}
    const common = { bc: this.bc, bouzidi: false, ...gate }   // ★ Bouzidi 维持熄 ★（见 sdfBake.ts）

    const stepUniforms = () => ({
      uG0: { value: null }, uG1: { value: null }, uG2: { value: null }, uG3: { value: null }, uG4: { value: null },
      uSolid: { value: null },
      uOmegaPlus: { value: this.flow.omegaPlus },
      uMagic: { value: this.flow.magic },
      uLesCs: { value: this.flow.lesCs },
      uInletU: { value: new Vector3(U_LB, 0, 0) },
      uWallU: { value: new Vector3(0, 0, 0) },
      uInletBL: { value: 3 },
      uBodyCentre: { value: new Vector3(...this.domain.bodyCentre) },
      uSpongeStart: { value: this.flow.spongeStart },
      uSpongeStrength: { value: this.flow.spongeStrength },
    })

    this._addPass('step', stepShaderSource(A, common), stepUniforms())
    if (this.measure) this._addPass('stepForce', stepShaderSource(A, { ...common, writeForce: true }), stepUniforms())

    this._addPass('init', initShaderSource(A), {
      uU: { value: new Vector3(U_LB, 0, 0) },
      uDelta: { value: 0 },
    })
    this._addPass('solidClear', solidClearShaderSource(A), {})
    this._addPass('solidBody', solidBodyShaderSource(A), {
      uSolidPrev: { value: null }, uPhi: { value: this.phiTex }, uPhiToLattice: { value: 1 },
      // ★ uPoseOn = 0 → shader 行返定点 texelFetch，同加位姿之前逐个 bit 一样 ★
      uPoseOn: { value: 0 }, uPoseSdf: { value: 0 },
      uPoseInv: { value: new Matrix4() }, uPhiOutside: { value: 1 },
    })
    this._addPass('macro', macroShaderSource(A), {
      uG0: { value: null }, uG1: { value: null }, uG2: { value: null }, uG3: { value: null }, uG4: { value: null },
      uSolid: { value: null },
    })
    this._addPass('volume', volumeShaderSource(A, { needQ: this.needQ }), {
      uMacro: { value: null }, uSolid: { value: null }, uLayer: { value: 0 }, uUref: { value: U_LB },
    })
    if (this.measure) {
      this._addPass('frontal', frontalShaderSource(A), { uSolid: { value: null } })
      this._addPass('reduce2', reduceShaderSource(2), {
        uA: { value: null }, uB: { value: null }, uSrcSize: { value: new Vector2(1, 1) },
      })
      this._addPass('reduce1', reduceShaderSource(1), {
        uA: { value: null }, uSrcSize: { value: new Vector2(1, 1) },
      })
    }
  }

  /* ───────────────────────────────────────────────── shader 编译 */

  /**
   * 等晒啲 program 编译完。
   *
   * step shader 展开十九个方向之后 ~1500 行，force 变体再嚟多一次 —— 呢个係成个 app
   * 最慢嘅 compile。KHR_parallel_shader_compile 令 driver 喺自己嘅 thread 度做，
   * 我哋轮询。
   *
   * ★ 只靠 requestAnimationFrame 嘅轮询喺隐藏 tab 会永远吊住 ★（隐藏 tab 冇 rAF）——
   * 用户开咗风洞然后切走 tab，返嚟就见到一个永远转紧嘅 spinner。所以 document.hidden
   * 嗰阵改用 setTimeout；而且 30 秒之后要 reject，并且【讲埋边几个 program 仲未好】。
   */
  ready(timeoutMs = 30000): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('LBM: solver 已经 dispose'))
    const scene = this.scene as Scene, cam = this.cam as OrthographicCamera
    // compile() 要喺一个同实际用嗰阵一样嘅 render target 之下行，否则 three 嘅 program
    // cache key（outputColorSpace 等）会唔同 → 第一帧再编译一次，即係白等。
    const prevRT = this.renderer.getRenderTarget()
    const vis = this.passOrder.map((p) => p.mesh.visible)
    this.passOrder.forEach((p) => { p.mesh.visible = true })
    let materials: Set<Material>
    try {
      this.renderer.setRenderTarget(this.rtB)
      materials = this.renderer.compile(scene, cam)
    } finally {
      this.renderer.setRenderTarget(prevRT)
      this.passOrder.forEach((p, i) => { p.mesh.visible = vis[i] })
    }

    const nameOf = new Map<Material, string>()
    for (const p of this.passOrder) nameOf.set(p.mat, p.mat.name)

    const deadline = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + timeoutMs
    const pending = new Set<Material>(materials)

    return new Promise<void>((resolve, reject) => {
      const again = (fn: () => void) => {
        const hidden = typeof document !== 'undefined' && document.hidden
        if (!hidden && typeof requestAnimationFrame === 'function') requestAnimationFrame(fn)
        else setTimeout(fn, 8)
      }
      const poll = () => {
        if (this.disposed) { reject(new Error('LBM: solver 喺编译途中畀 dispose 咗')); return }
        if (this.gl.isContextLost()) { reject(taggedError('LBM: 编译途中 context 遗失', { contextLost: true })); return }
        for (const m of Array.from(pending)) {
          const props = this.renderer.properties.get(m) as MaterialPropsLike | undefined
          const prog = props?.currentProgram
          // 冇 currentProgram = three 未行到；冇 isReady = 冇 KHR_parallel_shader_compile
          // （link 係同步嘅，第一次用会 stall，但唔会吊死）。
          if (!prog) continue
          if (typeof prog.isReady !== 'function' || prog.isReady()) pending.delete(m)
        }
        if (pending.size === 0) { resolve(); return }
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
        if (now > deadline) {
          const names = Array.from(pending).map((m) => nameOf.get(m) ?? m.name ?? '(未命名)')
          reject(new Error('LBM: shader 编译 ' + (timeoutMs / 1000) + ' 秒仲未完；仲未好：' + names.join(', ')))
          return
        }
        again(poll)
      }
      poll()
    })
  }

  /* ───────────────────────────────────────────────── state 保护 */

  private _saveState(): {
    rt: WebGLRenderTarget | null; autoClear: boolean; fb: WebGLFramebuffer | null
    vp: Int32Array; unit: number; depth: boolean; cull: boolean; blend: boolean; depthMask: boolean
  } {
    const gl = this.gl
    return {
      rt: this.renderer.getRenderTarget(),
      autoClear: this.renderer.autoClear,
      fb: gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
      vp: (gl.getParameter(gl.VIEWPORT) as Int32Array).slice() as Int32Array,
      unit: gl.getParameter(gl.ACTIVE_TEXTURE) as number,
      depth: gl.isEnabled(gl.DEPTH_TEST),
      cull: gl.isEnabled(gl.CULL_FACE),
      blend: gl.isEnabled(gl.BLEND),
      depthMask: gl.getParameter(gl.DEPTH_WRITEMASK) as boolean,
    }
  }

  private _restoreState(s: ReturnType<LbmGpu['_saveState']>): void {
    const gl = this.gl
    if (gl.isContextLost()) return
    // ① three 嘅 cache 已经喺我哋 raw 操作之下失效 → 掟晒佢，GL 亦返到已知基线
    this.renderer.resetState()
    // ② three 层嘅 target（连 viewport / drawBuffers）
    this.renderer.setRenderTarget(s.rt)
    // ③ raw 层：spec 点名要还原嗰几样
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.fb)
    if (s.vp && s.vp.length === 4) gl.viewport(s.vp[0], s.vp[1], s.vp[2], s.vp[3])
    gl.activeTexture(s.unit)
    if (s.depth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST)
    if (s.cull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE)
    if (s.blend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND)
    gl.depthMask(s.depthMask)
    this.renderer.autoClear = s.autoClear
  }

  /** 行一个 pass：只开一个 mesh，画一次，即刻收返。 */
  private _run(name: PassName, target: WebGLRenderTarget | null, layer?: number): void {
    const p = this.passes.get(name)
    if (!p || !this.scene || !this.cam) return
    this.renderer.setRenderTarget(target, layer)
    p.mesh.visible = true
    try { this.renderer.render(this.scene, this.cam) }
    finally { p.mesh.visible = false }
  }

  private _u(name: PassName): Record<string, { value: unknown }> {
    const p = this.passes.get(name)
    return (p ? p.mat.uniforms : {}) as unknown as Record<string, { value: unknown }>
  }

  /* ───────────────────────────────────────────────── 几何 / 重置 */

  /**
   * 换零件（或者第一次上零件）。
   *
   * ⚠ phi 嘅 nearBodyPhi 係【烘死喺 GLSL】嘅（唔係 uniform，见 atlas.ts 点解），
   *   所以由二值 mask 转真 SDF 要重建成个 solver，唔可以喺度换。
   */
  setGeometry(phi: PhiField): void {
    if (this.disposed) return
    if (phi.DX !== this.nx || phi.DY !== this.ny || phi.DZ !== this.nz) {
      throw new Error('LBM: phi 尺寸 ' + [phi.DX, phi.DY, phi.DZ] + ' 唔等于域 ' + [this.nx, this.ny, this.nz])
    }
    if (phi.nearBodyPhi !== this.nearBodyPhi) {
      throw new Error('LBM: nearBody gate 係烘死喺 shader 嘅（' + this.nearBodyPhi + '），换成 ' + phi.nearBodyPhi + ' 要重建 solver')
    }
    this.phiMeta = { trueSdf: phi.trueSdf, band: phi.band, nearBodyPhi: phi.nearBodyPhi, notes: phi.notes.slice() }

    const tex = this.phiTex as Data3DTexture
    ;(tex.image as { data: Float32Array }).data = phi.data
    tex.needsUpdate = true

    // 换零件 = 换烘焙姿态，所以位姿一定要推返恒等，否则新零件会带住旧零件嘅旋转出场。
    this.phiLike = { data: phi.data, DX: phi.DX, DY: phi.DY, DZ: phi.DZ, trueSdf: phi.trueSdf, band: phi.band }
    this.poseMode = defaultSampleMode(this.phiLike)
    this.phiOutside = defaultOutside(this.phiLike)
    this._sphere = bodySphere(this.phiLike)
    this._poseBox = null
    this._poseM.identity()
    this._poseApplied = false
    this._poseKeepFlow = false
    this._poseRefill = 0; this._poseNewSolid = 0; this._poseScanned = 0; this._poseStep = 0
    this._poseNotes = []

    const u = this._u('solidBody')
    u.uPoseOn.value = 0
    u.uPoseSdf.value = phi.trueSdf ? 1 : 0
    u.uPhiOutside.value = this.phiOutside
    ;(u.uPoseInv.value as Matrix4).identity()

    const s = this._saveState()
    try {
      this._rebuildSolid()
      this._reset()
    } finally {
      this._restoreState(s)
    }
  }

  /** clear → min-combine 一件零件（A → B），最终 union 住喺 solidB。★ 要喺 state 保护之内 call ★ */
  private _rebuildSolid(): void {
    this.renderer.autoClear = false
    this._run('solidClear', this.solidA)
    this._u('solidBody').uSolidPrev.value = (this.solidA as WebGLRenderTarget).texture
    this._run('solidBody', this.solidB)
    this.solidTex = (this.solidB as WebGLRenderTarget).texture
  }

  /**
   * 零件相对【phi 烘焙嗰阵个姿态】嘅刚体变换（喺域 lattice 空间；cell-centre 约定，
   * 即係格 (i,j,k) 嘅中心係 (i+0.5, j+0.5, k+0.5)）。
   *
   * phi 场一个字都唔郁 —— 郁嘅係 solidBody shader 嘅取样矩阵，所以拖拽/旋转可以逐帧做，
   * 唔使喺 CPU 重烘 SDF。
   *
   *
   * ★★ keepFlow：呢个先係用户要嘅效果 ★★
   * ────────────────────────────────
   * keepFlow: true  → 唔 call _reset()：流场带住过去，尾流连续变形。
   * keepFlow 唔传/false → 维持旧行为（流场推返均匀自由流）。
   *
   *
   * ★★ v1 限制：simple refill ★★
   * ───────────────────────────
   * keepFlow 之下，啱啱由固体露返出嚟嘅格，佢嘅分布係 step shader 喺「仲係固体」嗰阵
   * 写落去嘅【全零】—— 而偏差形式之下全零 = rho = 1 嘅静止流体。即係标准嘅
   * moving-boundary simple refill（Chen–Teixeira / Lallemand–Luo 嗰路嘅最简版）：
   * 稳定，但壁面附近会有少少人为扩散，因为新露出嚟嘅格冇继承邻居嘅非平衡应力。
   * 我哋【冇】做 extrapolation refill、亦【冇】做 Ladd/Aidun 嘅动壁 bounce-back。
   *
   * ★★ v1 限制：准静态 ★★
   * ────────────────────
   * 每个姿态当成一件新嘅【静止】障碍物。所以：拖拽过程中嗰个暂态【唔係】物理正确嘅
   * 运动体暂态（真嘢要壁速项 + 动量修正）；放手 settle 之后嗰个稳态，先至係嗰个姿态
   * 嘅正确解。UI 唔准喺拖拽中途报一个当真嘅 Cd。
   *
   * @throws 如果 m 嘅 3×3 唔係正交（有缩放 / 切变）—— SDF 嘅距离度量喺嗰阵会爆，
   *         而且唔会 crash 只会静静鸡出错数，所以一定要掟。
   */
  setPose(m: Matrix4, opts: { keepFlow?: boolean; countRefill?: boolean } = {}): void {
    if (this.disposed) return
    // ★ 先掟后做 ★：任何 GPU 状态都未郁过，所以掟完 solver 仲係一致嘅。
    assertRigid(m)
    const chk = rigidCheck(m)
    const keepFlow = !!opts.keepFlow
    const phi = this.phiLike
    if (!phi || !this._sphere) throw new Error('LBM: setPose 之前一定要有几何（setGeometry）')

    /* refill 计数喺 CPU 用 shader 嘅镜像模型做，只扫两个姿态外接球嘅并集 —— 精确，唔係估。
     *
     * ★ 但佢係【纯诊断】★ —— 物理一个 bit 都唔靠佢。而佢好贵：真机实测（RTX 5070 Ti，88×66×66 域，
     *   外接球 r=6.8）扫 6859 格用咗 7.99ms，占咗成个 setPose 8.77ms 嘅 91%；GPU 嗰个
     *   _rebuildSolid() pass 本身先至 ~0.8ms。拖拽嗰阵每帧都 setPose，呢 8ms 就係一半帧预算。
     *
     * 所以拖拽路径要传 countRefill:false。★ 预设 true = 同以前逐个数一样 ★，唔会郁到现有测试／报告。
     * 熄咗嗰阵三个数报 -1（= 冇量过），唔可以报 0 —— 0 係一个会呃人嘅合法值。 */
    if (opts.countRefill === false) {
      this._poseRefill = -1; this._poseNewSolid = -1; this._poseScanned = -1
    } else {
      const rc = countRefillCells(phi, this._poseM, m, this._sphere, { mode: this.poseMode, outside: this.phiOutside })
      this._poseRefill = rc.refill
      this._poseNewSolid = rc.newSolid
      this._poseScanned = rc.scanned
    }

    this._poseM.copy(m)
    const inv = invertRigid(m)
    // 恒等位姿要行返定点 texelFetch 嗰条路：唔止快，而且保证「冇转过」= 同烘焙结果逐 bit 一样。
    const isIdentity = poseIsIdentity(m)
    this._poseApplied = !isIdentity
    this._poseKeepFlow = keepFlow
    this._poseStep = this.stepCount
    this._poseNotes = []
    if (chk.det < 0) this._poseNotes.push('位姿係镜射（det < 0）：保距所以 SDF 仲合法，但零件已经係镜像')

    const box = this.poseBox()
    const c = this._sphere.centre
    const e = m.elements
    const q: [number, number, number] = [
      e[0] * c[0] + e[4] * c[1] + e[8] * c[2] + e[12],
      e[1] * c[0] + e[5] * c[1] + e[9] * c[2] + e[13],
      e[2] * c[0] + e[6] * c[1] + e[10] * c[2] + e[14],
    ]
    for (let a = 0; a < 3; a++) {
      if (q[a] < box.min[a] - 1e-6 || q[a] > box.max[a] + 1e-6) {
        // ★ 唔喺呢度夹 ★ —— 夹咗就等于静静鸡改咗 caller 要嘅姿态。报出去，caller 用
        //   clampPose() 自己夹（拖拽 UI 要嘅係「推唔郁」嘅手感，唔係「跳咗去第度」）。
        this._poseNotes.push('轴 ' + a + '：外接球球心 ' + q[a].toFixed(2) + ' 出咗合法盒 [' +
          box.min[a].toFixed(2) + ', ' + box.max[a].toFixed(2) + ']，零件会畀域边界切走一橛')
      }
    }

    const u = this._u('solidBody')
    u.uPoseOn.value = isIdentity ? 0 : 1
    u.uPoseSdf.value = this.poseMode === 'trilinear' ? 1 : 0
    u.uPhiOutside.value = this.phiOutside
    ;(u.uPoseInv.value as Matrix4).copy(inv)

    const s = this._saveState()
    try {
      this._rebuildSolid()
      if (!keepFlow) this._reset()
      else {
        /*
         * 流场留低，但係【飞紧嘅 readback 一定要掟】：嗰啲 fence 度到嘅力係上一个姿态嘅，
         * 攞去除今个姿态嘅迎风面积就係一个两头唔到岸嘅 Cd。stepCount 【唔】重置 ——
         * 重置会令入口 ramp 由头嚟过，即係亲手整一个真嘅暂态出嚟。
         */
        this.readForce?.cancel(); this.readTorque?.cancel(); this.readArea?.cancel()
        this._force = [0, 0, 0]; this._torque = [0, 0, 0]
        this._links = 0; this._fresh = false
        this._areaCells = 0; this._haveArea = false
      }
    } finally {
      this._restoreState(s)
    }
  }

  /**
   * 平移嘅合法 AABB（对住【变换后】嘅外接球球心）。畀拖拽 UI 夹手用：
   * `const m2 = clampPose(m, solver.poseBox())`。
   */
  poseBox(marginCells = 2): PoseBox {
    const phi = this.phiLike
    if (!phi) throw new Error('LBM: poseBox 之前一定要有几何（setGeometry）')
    if (!this._poseBox || this._poseBox.marginCells !== marginCells) {
      this._poseBox = safePoseBox({ DX: this.nx, DY: this.ny, DZ: this.nz }, phi, marginCells)
    }
    return this._poseBox
  }

  /** 把流场推返去零、再由 init 填一个均匀自由流。★ 一定要喺 state 保护之内 call ★ */
  private _reset(): void {
    const renderer = this.renderer
    this.stepCount = 0
    this._force = [0, 0, 0]; this._torque = [0, 0, 0]
    this._links = 0; this._areaCells = 0; this._fresh = false; this._sampleStep = 0; this._haveArea = false
    this.readForce?.cancel(); this.readTorque?.cancel(); this.readArea?.cancel()

    /*
     * ★ 两边都要 clear 到零 ★
     *
     * ① 偏差形式之下，全零 = rho = 1 嘅静止流体 —— 一个合法状态，唔係垃圾。
     * ② rtA 嘅第 6、7 个 attachment（force / torque）永远唔会被 step shader 写到
     *    padding texel（嗰啲 texel 会 discard），而 reduce 金字塔係【连 padding 一齐加】嘅。
     *    唔喺呢度 clear 一次，padding 嗰笔未初始化嘅垃圾就会永远加入合力入面。
     */
    renderer.getClearColor(this.clearColor)
    const prevAlpha = renderer.getClearAlpha()
    renderer.setClearColor(0x000000, 0)
    renderer.setRenderTarget(this.rtA)
    renderer.clear(true, false, false)
    renderer.setRenderTarget(this.rtB)
    renderer.clear(true, false, false)
    renderer.setClearColor(this.clearColor, prevAlpha)

    // init 只发射五个 output → 只可以画入 rtB（五 attachment 嗰个）。
    // rtA 嘅正确初值就係啱啱 clear 出嚟嗰个零，而佢第一次被写就係第一个 substep（force 变体，七个都写齐）。
    this._run('init', this.rtB)
    this.src = this.rtB
    this.dst = this.rtA
  }

  /* ───────────────────────────────────────────────── 每帧 */

  /**
   * ★ 令一帧嘅【最后一个】substep 落喺 rtA ★（唯一有 force/torque attachment 嗰个）。
   * ping-pong 嘅奇偶由历史决定，唔由我哋拣，所以奇偶唔啱就多行一步。
   */
  private _substepPlan(n: number): number {
    let k = Math.max(1, Math.round(n))
    if (!this.measure) return k
    const lastIsA = ((k - 1) % 2 === 0) ? (this.dst === this.rtA) : (this.dst !== this.rtA)
    if (!lastIsA) k += 1
    return k
  }

  private _stepOnce(): void {
    const dstIsA = this.dst === this.rtA
    // 七 attachment 嘅 target 一定要用七输出嘅 shader（冇写嘅 draw buffer = undefined）
    const useForce = this.measure && dstIsA
    const name: PassName = useForce ? 'stepForce' : 'step'
    const u = this._u(name)
    const src = this.src as WebGLRenderTarget
    for (let i = 0; i < N_TARGETS; i++) u['uG' + i].value = src.textures[i]
    u.uSolid.value = this.solidTex

    // ★ 每帧重算 ★：uOmegaPlus 由分子黏度嚟，uMagic 由【钉死嘅 omega_minus】反推。
    //   唔好倒过嚟钉 Lambda = 3/16：高 Re 之下 omega_minus 会跌到 0.03~0.09，
    //   奇非平衡模态无阻尼咁长大，omega_plus >= 1.95 就 NaN。
    u.uOmegaPlus.value = this.flow.omegaPlus
    u.uMagic.value = lambdaFromOmegas(this.flow.omegaPlus, this.flow.omegaMinus)
    u.uLesCs.value = this.flow.lesCs
    ;(u.uInletU.value as Vector3).set(U_LB * inletRamp(this.stepCount, this.flow.rampSteps), 0, 0)
    ;(u.uWallU.value as Vector3).set(0, 0, 0)
    ;(u.uBodyCentre.value as Vector3).set(...this.domain.bodyCentre)
    u.uSpongeStart.value = this.flow.spongeStart
    u.uSpongeStrength.value = this.flow.spongeStrength

    this._run(name, this.dst)
    const t = this.src; this.src = this.dst; this.dst = t
    this.stepCount++
  }

  private _macro(): void {
    const u = this._u('macro')
    const src = this.src as WebGLRenderTarget
    for (let i = 0; i < N_TARGETS; i++) u['uG' + i].value = src.textures[i]
    u.uSolid.value = this.solidTex
    this._run('macro', this.macroRT)
  }

  private _volume(): void {
    const u = this._u('volume')
    u.uMacro.value = (this.macroRT as WebGLRenderTarget).texture
    u.uSolid.value = this.solidTex
    u.uUref.value = Math.max(U_LB, 1e-4)
    for (let z = 0; z < this.nz; z++) {
      u.uLayer.value = z
      this._run('volume', this.volRT, z)
    }
  }

  /** 行一条 reduce 链，返回最尾嗰级。 */
  private _reduceChain(pyr: PyramidLevel[], name: PassName, a: Texture, b: Texture | null, w: number, h: number): PyramidLevel {
    const u = this._u(name)
    let ta = a, tb = b, sw = w, sh = h
    for (const lv of pyr) {
      u.uA.value = ta
      if (tb && u.uB) u.uB.value = tb
      ;(u.uSrcSize.value as Vector2).set(sw, sh)
      this._run(name, lv.rt)
      ta = lv.rt.textures[0]
      if (tb) tb = lv.rt.textures[1]
      sw = lv.w; sh = lv.h
    }
    return pyr[pyr.length - 1]
  }

  /** 攞一个 render target 嘅 raw framebuffer（PBO 读要）。 */
  private _fboOf(rt: WebGLRenderTarget): WebGLFramebuffer | null {
    this.renderer.setRenderTarget(rt)
    return this.gl.getParameter(this.gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
  }

  private _measurePass(): void {
    if (!this.measure || !this.frontalRT) return
    const rtA = this.rtA as WebGLRenderTarget

    this._u('frontal').uSolid.value = this.solidTex
    this._run('frontal', this.frontalRT)

    const lastArea = this._reduceChain(this.pyrArea, 'reduce1', this.frontalRT.textures[0], null, this.ny, this.nz)
    const lastFT = this._reduceChain(this.pyrForce, 'reduce2', rtA.textures[N_TARGETS], rtA.textures[N_TARGETS + 1], this.A.width, this.A.height)

    // ★ 先执货、后落单 ★ —— 反过嚟就会喺 fence 未 signal 嗰阵覆写个 PBO。
    const f = this.readForce?.poll()
    if (f) { this._force = [f[0], f[1], f[2]]; this._links = f[3]; this._fresh = true; this._sampleStep = this.stepCount }
    const t = this.readTorque?.poll()
    if (t) this._torque = [t[0], t[1], t[2]]
    const a = this.readArea?.poll()
    if (a) { this._areaCells = a[0]; this._haveArea = true }

    const fbFT = this._fboOf(lastFT.rt)
    this.readForce?.request(fbFT, 0, 0, 0, 1, 1)
    this.readTorque?.request(fbFT, 1, 0, 0, 1, 1)
    const fbA = this._fboOf(lastArea.rt)
    this.readArea?.request(fbA, 0, 0, 0, 1, 1)
    // asyncReader 郁过 READ_FRAMEBUFFER / readBuffer → three 嘅 cache 已经唔可信。
    // _restoreState() 会 resetState()，所以呢度唔使再做，但呢句注释要留：
    // 任何人喺呢个 return 之后加一句 renderer.render() 都係 bug。
  }

  /** 跑一帧物理。 */
  advance(substeps?: number): void {
    if (this.disposed || this.gl.isContextLost()) return
    const s = this._saveState()
    try {
      this.renderer.autoClear = false
      const n = this._substepPlan(substeps ?? this.substeps)
      for (let i = 0; i < n; i++) this._stepOnce()
      this._macro()
      if (this.needVolume) this._volume()
      this._measurePass()
    } finally {
      this._restoreState(s)
    }
  }

  /* ───────────────────────────────────────────────── 读数 */

  /**
   * 今帧有冇【新】嘅力读到。
   *
   * ★ 还 null 唔係「冇力」，係「今帧冇新数字」★ —— 收敛采样器一定要靠呢个分辨，
   * 唔係嘅话同一个 Cd 会被塞入收敛窗口十几次，扮到已经收敛。
   */
  pollForce(): ForceSample | null {
    // ★ 力同面积係两条独立嘅 fence，唔一定同一帧落地 ★。面积未到就唔好报：
    //   Math.max(1, 0) 会畀出一个「Cd = 力 × 2 / U²」嘅天文数字，而收敛采样器
    //   会老老实实收埋佢，然后成条曲线嘅头几个点都係垃圾。
    if (!this._fresh || !this._haveArea) return null
    this._fresh = false
    const area = Math.max(1, this._areaCells)
    const cd = 2 * this._force[0] / (U_LB * U_LB * area)
    // ★ 用 GPU 自己量嘅面积换算 ★ —— Cd = 2F/(ρU²A) 係一个除另一个，两者最好係同一件物件。
    const areaMM2 = area * this.domain.h * this.domain.h
    const dragN = cd * 0.5 * this.flowRho * this.flowSpeed * this.flowSpeed * (areaMM2 * 1e-6)
    return {
      force: [this._force[0], this._force[1], this._force[2]],
      torque: [this._torque[0], this._torque[1], this._torque[2]],
      links: this._links,
      areaCells: this._areaCells,
      frontalAreaMM2: areaMM2,
      cd,
      dragN,
      step: this._sampleStep,
      rampDone: this._sampleStep >= this.flow.rampSteps,
    }
  }

  /** 换流体 / 换风速（唔使重建 solver：只影响 nu 同单位换算）。 */
  setFlow(inp: FlowInput): void {
    this.flowRho = inp.rho
    this.flowSpeed = inp.speed
    this.flow = deriveFlow(this.domain, inp)
  }

  /**
   * 同步读返成个 macro 场，unpack 成 (nx,ny,nz) 索引。
   * ★ 慢，会停 pipeline ★ —— 净係畀测试同诊断用，唔好放喺帧循环。
   */
  readMacro(): { delta: Float32Array; ux: Float32Array; uy: Float32Array; uz: Float32Array; nx: number; ny: number; nz: number } {
    const A = this.A
    const buf = new Float32Array(A.width * A.height * 4)
    const s = this._saveState()
    try { this.renderer.readRenderTargetPixels(this.macroRT as WebGLRenderTarget, 0, 0, A.width, A.height, buf) }
    finally { this._restoreState(s) }
    const n = this.nx * this.ny * this.nz
    const out = { delta: new Float32Array(n), ux: new Float32Array(n), uy: new Float32Array(n), uz: new Float32Array(n), nx: this.nx, ny: this.ny, nz: this.nz }
    for (let z = 0; z < this.nz; z++) for (let y = 0; y < this.ny; y++) for (let x = 0; x < this.nx; x++) {
      const t = cellToTexel(A, x, y, z)
      const si = (t[1] * A.width + t[0]) * 4
      const di = (z * this.ny + y) * this.nx + x
      out.delta[di] = buf[si]; out.ux[di] = buf[si + 1]; out.uy[di] = buf[si + 2]; out.uz[di] = buf[si + 3]
    }
    return out
  }

  /**
   * 畀渲染器 sample 嘅 3D 速度场。★ 呢张先至可以 filter ★（atlas 唔可以）。
   * volMatrix：lattice cell-centre → CAD mm，同 windtunnel.ts 嘅 volMatrix 同一约定，
   * 所以 WindSmoke 嗰套 (p / N) texcoord 直接照用（唔好写 (p+0.5)/N，成个场会向下游偏半格）。
   */
  readVolumeTexture(): {
    velocity: Data3DTexture; q: Data3DTexture
    dims: [number, number, number]; volMatrix: number[]
    latInletU: number; latToMs: number
  } {
    const rt = this.volRT as WebGL3DRenderTarget
    return {
      velocity: rt.textures[0],
      q: rt.textures[1],
      dims: [this.nx, this.ny, this.nz],
      volMatrix: this.domain.volMatrix,
      latInletU: U_LB,
      latToMs: this.flow.latToMs,
    }
  }

  report(): SolverReport {
    return {
      tier: this.tier,
      nx: this.nx, ny: this.ny, nz: this.nz,
      atlas: this.A,
      vram: vramBytesFor(this.nx, this.ny, this.nz, this.measure, this.caps.maxTextureSize || 16384),
      measure: this.measure,
      substeps: this.substeps,
      caps: this.caps,
      flow: this.flow,
      domain: {
        frontalCells: this.domain.frontalCells,
        frontalAreaMM2: this.domain.frontalAreaMM2,
        dLb: this.domain.dLb,
        refLenM: this.domain.refLenM,
        h: this.domain.h,
      },
      phi: this.phiMeta,
      bouzidi: false,
      poseApplied: this._poseApplied,
      poseRefillCells: this._poseRefill,
      pose: this._poseReport(),
      warnings: this.flow.warnings.concat(this.warnings),
    }
  }

  private _poseReport(): PoseReport {
    const chk = rigidCheck(this._poseM)
    const sph = this._sphere
    const box = this._poseBox
    return {
      applied: this._poseApplied,
      matrix: this._poseM.elements.slice(),
      keepFlow: this._poseKeepFlow,
      refillCells: this._poseRefill,
      newSolidCells: this._poseNewSolid,
      refillScanned: this._poseScanned,
      poseStep: this._poseStep,
      det: chk.det,
      orthoErr: chk.orthoErr,
      sampler: this.poseMode,
      sphere: sph
        ? { centre: [sph.centre[0], sph.centre[1], sph.centre[2]], radius: sph.radius, solidCells: sph.solidCells }
        : { centre: [0, 0, 0], radius: 0, solidCells: 0 },
      box: box
        ? { min: [box.min[0], box.min[1], box.min[2]], max: [box.max[0], box.max[1], box.max[2]], feasible: box.feasible }
        : { min: [0, 0, 0], max: [0, 0, 0], feasible: false },
      notes: this._poseNotes.slice(),
    }
  }

  /* ───────────────────────────────────────────────── 拆 */

  /**
   * 每一样嘢都 guard。两个原因一齐到：
   * ① measure 熄嗰阵 force / frontal 根本冇分配过；
   * ② constructor 会喺 _allocate() 中途掟错嗰阵【call 自己呢个 dispose】——
   *    嗰阵任何一个 field 都可能仲係 null。喺半成品上面掟错嘅 teardown 会把真正嘅
   *    「framebuffer incomplete」换成一个无意义嘅 TypeError，然后 retry 永远唔会发生。
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const kill = (o: { dispose?: () => void } | null | undefined) => { try { o?.dispose?.() } catch { /* 半成品 */ } }
    kill(this.rtA); kill(this.rtB)
    kill(this.solidA); kill(this.solidB); kill(this.macroRT); kill(this.frontalRT)
    kill(this.volRT); kill(this.phiTex)
    for (const lv of this.pyrForce) kill(lv.rt)
    for (const lv of this.pyrArea) kill(lv.rt)
    kill(this.readForce); kill(this.readTorque); kill(this.readArea)
    for (const p of this.passOrder) { kill(p.mat); try { this.scene?.remove(p.mesh) } catch { /* 同上 */ } }
    kill(this.geo)
    this.passes.clear(); this.passOrder = []
    this.rtA = this.rtB = this.src = this.dst = null
    this.solidA = this.solidB = this.macroRT = this.frontalRT = null
    this.volRT = null; this.phiTex = null; this.solidTex = null
    this.pyrForce = []; this.pyrArea = []
    this.readForce = this.readTorque = this.readArea = null
    this.scene = null; this.cam = null; this.geo = null
  }
}

/* ════════════════════════════════════════════════════ 建构 + walk-down */

export interface SolverRequest {
  /** 零件包围盒尺寸 mm（决定体素分辨率 → 域尺寸） */
  extent: [number, number, number]
  /** caller 自己 call voxelize()（见 sdfBake.ts 点解唔喺呢度 import） */
  voxelizeAt: (res: number) => VoxelGridLike
  flow: FlowInput
  axis?: DomainOptions['axis']
  sign?: DomainOptions['sign']
  /** 按外接球留白，令任何朝向都唔使重建个域（见 sdfBake.ts）。★ 预设 false ★ */
  padForRotation?: boolean
  trueSdf?: boolean
  measure?: boolean
  needVolume?: boolean
  needQ?: boolean
  maxTier?: TierName
  maxRes?: number
  caps?: MrtReport
  hint?: { deviceMemoryGB?: number; lowPower?: boolean }
}

export interface SolverBuild {
  solver: LbmGpu
  report: SolverReport
  /** 行落嚟嘅每一级同佢点解唔得 */
  attempts: { tier: TierName; error: string }[]
}

/**
 * 建 solver，撑唔起就【问细一级】。
 *
 * pickTier() 已经由屏幕估咗一次，所以正常唔应该行到呢条阶梯 —— 佢係「估错嗰阵」嘅底。
 * 而估一定会有错嘅时候，因为冇任何诚实嘅方法问 browser 佢肯畀几多 texture memory。
 *
 * ★ 呢条阶梯成立嘅唯一原因，係 LBMGpu 失败嗰阵会 dispose 返自己 ★（见 constructor）。
 * ★ 而 context lost 唔可以行呢条阶梯 ★：细 lattice 救唔到 context loss，
 *   retry 四次淨係会畀三个误导嘅「显存唔够」，然后一个赖错 tier 嘅 stack trace。
 */
export function createLbmSolver(renderer: WebGLRenderer, req: SolverRequest): SolverBuild {
  const gl = renderer.getContext() as WebGL2RenderingContext
  const caps = req.caps ?? probeMRT(gl)
  if (!caps.ok) throw taggedError('LBM: ' + caps.reason, { contextLost: caps.contextLost })

  const start = req.maxTier
    ? QUALITY_TIERS.findIndex((t) => t.name === req.maxTier)
    : QUALITY_TIERS.indexOf(pickTier(caps, req.hint ?? {}))
  const attempts: { tier: TierName; error: string }[] = []

  for (let i = Math.max(0, start); i >= 0; i--) {
    const tier = QUALITY_TIERS[i]
    const plan = planResolution(req.extent, tier, { axis: req.axis, sign: req.sign, padForRotation: req.padForRotation, maxRes: req.maxRes })
    if (!plan.fits) { attempts.push({ tier: tier.name, error: '零件长宽比令域装唔落呢个 tier（' + plan.DX + '×' + plan.DY + '×' + plan.DZ + '）' }); continue }
    let solver: LbmGpu | null = null
    try {
      const grid = req.voxelizeAt(plan.res)
      const domain = buildDomain(grid, { axis: req.axis, sign: req.sign, padForRotation: req.padForRotation })
      const phi = bakePhi(domain, { trueSdf: req.trueSdf })
      solver = new LbmGpu(renderer, domain, phi, {
        measure: req.measure, needVolume: req.needVolume, needQ: req.needQ,
        substeps: tier.substeps, flow: req.flow, caps, tier: tier.name,
      })
      solver.setFlow(req.flow)
      return { solver, report: solver.report(), attempts }
    } catch (e) {
      try { solver?.dispose() } catch { /* constructor 已经 dispose 咗自己 */ }
      if (isContextLostError(e)) throw e          // ★ 细一级救唔到 context loss ★
      attempts.push({ tier: tier.name, error: e instanceof Error ? e.message : String(e) })
    }
  }
  throw new Error('LBM: 连最细嘅 tier 都建唔起 —— ' + attempts.map((a) => a.tier + ': ' + a.error).join('；'))
}

/** 畀外面（Stage 6 / 诊断）用嘅 re-export，唔使认得成个 lbm 目录。 */
export { probeMRT, buildDomain, bakePhi, planResolution }
export type { MrtReport, WindDomain, PhiField, VoxelGridLike }
/** 位姿嘅纯逻辑（拖拽 UI 要 clampPose + poseBox 先夹到手感）。 */
export { assertRigid, clampPose, isRigid, rigidCheck, safePoseBox, bodySphere, resampleSolidMask } from './rigidPose.ts'
export type { PoseBox, PoseSampleMode, BodySphere } from './rigidPose.ts'
