// p5-wind-probe.mjs — 风洞/水洞 LBM CFD 趋势级评估 probe（ADDITIVE，唔郁任何现有档）
// 目的：验【趋势/单调】而唔系定量 Cd —— solver 系 trend-level by design（reLb 钳、Smagorinsky、压力积分近似）。
//   T1 钝体 vs 流线体：cube / sphere 嘅 Cd 应 > 同迎风面积嘅水滴/流线椭球 Cd
//   T2 迎风面积单调：同形状放大迎风面 → 阻力 N 增大（Cd 无量纲应大致稳定）
//   T3 量级带：钝体 Cd 落 O(0.5~1.5) 带；流线体明显低过钝体
// 跑法: npx tsx tests/p5-wind-probe.mjs   （在 C:\ClaudeCode\webcad）
// 直接 import runWindTunnel（纯 JS/无 OCCT），喂合成水密三角网。低 speed 令 reReal 细、reLb 无需钳、快收敛。
import { runWindTunnel } from '../src/analysis/windtunnel.ts'

// ---- 合成水密网格生成器（顶点 mm 展开数组 + 三角 index 数组）----

// 轴对齐盒，中心原点，半尺寸 (ax,ay,az)。12 三角、外向法向一致（水密）。
function boxMesh(ax, ay, az) {
  const v = [
    -ax,-ay,-az,  ax,-ay,-az,  ax,ay,-az,  -ax,ay,-az,   // 0-3 z-
    -ax,-ay, az,  ax,-ay, az,  ax,ay, az,  -ax,ay, az,    // 4-7 z+
  ]
  const t = [
    0,2,1, 0,3,2,   // z- (法向 -z)
    4,5,6, 4,6,7,   // z+ (法向 +z)
    0,1,5, 0,5,4,   // y-
    2,3,7, 2,7,6,   // y+
    1,2,6, 1,6,5,   // x+
    0,4,7, 0,7,3,   // x-
  ]
  return { vertices: v, triangles: t }
}

// UV 椭球，中心原点，半轴 (ax,ay,az)。stacks×slices。水密封闭。
function ellipsoidMesh(ax, ay, az, stacks = 20, slices = 28) {
  const v = [], t = []
  for (let i = 0; i <= stacks; i++) {
    const phi = Math.PI * i / stacks           // 0..pi (纬度, 沿 X 轴)
    const cphi = Math.cos(phi), sphi = Math.sin(phi)
    for (let j = 0; j <= slices; j++) {
      const th = 2 * Math.PI * j / slices
      v.push(ax * cphi, ay * sphi * Math.cos(th), az * sphi * Math.sin(th))
    }
  }
  const row = slices + 1
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1
      t.push(a, c, b,  b, c, d)
    }
  }
  return { vertices: v, triangles: t }
}

// 流线/水滴体：沿 X 轴的旋成体，半径 profile r(x) = R * sqrt(1-s) * (0.4+0.6*(1-s)^0.5) 令后段渐尖收成尾。
// 迎风(x=-L)钝圆头、下游(x=+L)渐尖尾 —— 经典 teardrop。以迎风最大半径 R、总长 2L。
function teardropMesh(R, L, stacks = 40, slices = 28) {
  const v = [], t = []
  // 沿 X 从 -L(头)到 +L(尾)。半径：头部半圆钝头 + 尾部长渐尖。
  const rAt = (x) => {
    const s = (x + L) / (2 * L)      // 0(头)..1(尾)
    if (s <= 0) return 0
    if (s >= 1) return 0
    // 头部 s in [0,0.25] 钝圆(椭圆头)，尾部 s in [0.25,1] 缓收尖
    if (s < 0.25) return R * Math.sqrt(1 - Math.pow(1 - s / 0.25, 2))
    const u = (s - 0.25) / 0.75
    return R * Math.pow(1 - u, 1.4)
  }
  for (let i = 0; i <= stacks; i++) {
    const x = -L + 2 * L * i / stacks
    const r = rAt(x)
    for (let j = 0; j <= slices; j++) {
      const th = 2 * Math.PI * j / slices
      v.push(x, r * Math.cos(th), r * Math.sin(th))
    }
  }
  const row = slices + 1
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1
      t.push(a, c, b,  b, c, d)
    }
  }
  return { vertices: v, triangles: t }
}

function run(label, mesh, opts = {}) {
  const t0 = Date.now()
  try {
    const r = runWindTunnel({
      vertices: mesh.vertices, triangles: mesh.triangles,
      speed: opts.speed ?? 1.0, fluid: opts.fluid ?? 'air',
      axis: 0, sign: 1,
      resolution: opts.resolution ?? 16, maxRes: opts.maxRes ?? 20,
    })
    const dt = ((Date.now() - t0) / 1000).toFixed(1)
    console.log(`[${label}] Cd=${r.cd.toFixed(3)} dragN=${r.dragN.toExponential(2)} `
      + `frontal=${r.frontalAreaMM2.toFixed(0)}mm² re=${r.re.toExponential(1)} reLb=${r.reLb.toFixed(0)} `
      + `steps=${r.steps} conv=${r.converged} res=${r.res} t=${dt}s`)
    return r
  } catch (e) {
    console.log(`[${label}] FAIL: ${e.message}`)
    return null
  }
}

console.log('=== P5 wind tunnel trend probe (LBM D3Q19 BGK+Smagorinsky) ===')

// 控制变量：所有几何强制同 res=16 + maxRes=16（禁自动加密，令 wetted/frontal 可比）
// 高 speed=20 令 reReal 大 → 摩擦项 cf∝1/√Re 缩细，凸显 FORM DRAG（solver 真解嘅压力积分项）趋势。
const COM = { resolution: 16, maxRes: 16, speed: 20 }

// T1/T3: 同迎风半径 R≈10mm 的钝体 vs 流线体
const cube    = boxMesh(10, 10, 10)                // 20×20×20 立方体（钝体）
const sphere  = ellipsoidMesh(10, 10, 10)          // R=10 球
const teardrL = teardropMesh(10, 40)               // 迎风 R=10、长 80mm 细长流线（wetted 大）
const teardrS = teardropMesh(10, 15)               // 迎风 R=10、长 30mm 短流线（wetted 接近球）
const rCube = run('cube 20³', cube, COM)
const rSph  = run('sphere R10', sphere, COM)
const rTearL = run('teardrop R10 L80', teardrL, COM)
const rTearS = run('teardrop R10 L30', teardrS, COM)
// 用【真·细长】流线体 L80 做流线代表：长细比 4，尾部足够长令体素尾非钝截断、尾压恢复。
// L30 长细比仅 1.5、res=16 下尾部只几个体素 → voxel 阶梯化成钝尾（form drag 高），唔算流线体，只作摩擦对照。
const rTear = rTearL

// T2: 迎风面积单调 —— 同形状（立方体）放大迎风面，阻力 N 应增
const cubeBig = boxMesh(15, 15, 15)                // 30³，迎风面积 2.25×
const rCubeBig = run('cube 30³', cubeBig, COM)

console.log('\n=== 趋势判定 ===')
const ok = []
function chk(name, cond, detail) { ok.push(cond); console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name} :: ${detail}`) }

if (rCube && rTear)
  chk('T1a 钝体(cube) Cd > 流线体(teardrop L80)', rCube.cd > rTear.cd,
    `cube ${rCube.cd.toFixed(3)} vs teardrop ${rTear.cd.toFixed(3)}`)
if (rCube && rSph)
  chk('T1b 立方体 Cd > 球 Cd（钝体内排序：方>球）', rCube.cd > rSph.cd,
    `cube ${rCube.cd.toFixed(3)} vs sphere ${rSph.cd.toFixed(3)}`)
if (rTearL && rTearS)
  chk('T1c 细长流线(L80) Cd < 短钝尾(L30)（拉长→流线化收益）', rTearL.cd < rTearS.cd,
    `L80 ${rTearL.cd.toFixed(3)} < L30 ${rTearS.cd.toFixed(3)}`)
if (rCube)
  chk('T3 钝体 Cd 落物理量级带 [0.4,1.8]', rCube.cd > 0.4 && rCube.cd < 1.8,
    `cube Cd=${rCube.cd.toFixed(3)}`)
if (rSph)
  chk('T3b 球 Cd 落物理量级带 [0.35,1.0]', rSph.cd > 0.35 && rSph.cd < 1.0,
    `sphere Cd=${rSph.cd.toFixed(3)}`)
if (rCube && rCubeBig)
  chk('T2 迎风面积↑ → 阻力N↑', rCubeBig.dragN > rCube.dragN,
    `cube20 ${rCube.dragN.toExponential(2)}N → cube30 ${rCubeBig.dragN.toExponential(2)}N`)

const nPass = ok.filter(Boolean).length
console.log(`\n=== ${nPass}/${ok.length} trend checks PASS ===`)
