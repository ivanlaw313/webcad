// fea-cantilever.test.mjs — BUG-289：静力 FEA 悬臂梁基准（解析对照 + 趋势单调性 + 幂次 + 网格收敛 + 单位健全）
//
// 背景（外部 QA Grok bot 黑箱报告 BUG-289 [P1]）：
//   「悬臂基准数量级错（σ 低 15×、位移低 ~580×），加长梁应力反而【下降】」。
//   ★「趋势相反」系最严重嗰点 —— 数量级可以用「趋势级」解释，方向错就系真 bug。
//
// 本档钉死四样嘢，令「趋势相反」永远唔会翻兜：
//   ① σ_max / δ_tip 对返 Euler-Bernoulli 解析解（容差见下，连理由）
//   ② ★ 单调性：L 增加 → σ_max 同 δ_tip 都必须【上升】
//   ③ ★ 幂次：δ ∝ L³、σ ∝ L（log-log 斜率）
//   ④ 网格收敛 + 单位健全（E ×2 → δ /2；P ×2 → σ、δ 都 ×2）
//
// 跑法（喺 C:\ClaudeCode\webcad-v2 执行）：
//   node --experimental-strip-types tests/fea-cantilever.test.mjs
// 同 voxelfea-cutcell.test.mjs 一样单文件转译 voxelfea.ts（零 import，可单独转译）再 import。
// 全部断言通过 → exit 0；任一失败 → exit 1。

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

console.log('[cantilever] 转译 voxelfea.ts → .tmp-fea/ ...');
execSync(
  'npx tsc src/analysis/voxelfea.ts src/analysis/faceFeaSelect.ts --outDir .tmp-fea --module es2020 --target es2020 --strict false --skipLibCheck --ignoreConfig',
  { cwd: root, stdio: 'inherit' },
);
const compiledVoxel = path.join(root, '.tmp-fea', 'voxelfea.js');
writeFileSync(compiledVoxel, readFileSync(compiledVoxel, 'utf8').replace(/(['"]\.\/faceFeaSelect)(['"])/, '$1.js$2'));
const { runVoxelFea } = await import(pathToFileURL(compiledVoxel).href);

// ------------------------------------------------------------------ 小框架
let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.log(`  ✗ ASSERT FAIL: ${msg}`); failures++; } else { console.log(`  ✓ ${msg}`); }
}
const f = (x, d = 4) => Number(x).toFixed(d);

// ==================================================================
// §0 解析对照（纯函数，headless 测得到）
// ==================================================================
/**
 * 端点受力悬臂梁（矩形截面）Euler-Bernoulli 解析解。
 *   I      = b·h³/12
 *   σ_max  = M·c/I = (P·L)·(h/2)/I      （峰值喺【固定端表面纤维】）
 *   δ_tip  = P·L³ / (3·E·I)
 * 单位：mm / N / MPa(N·mm⁻²) → σ MPa、δ mm（同 voxelfea 单位约定一致）。
 * 返回【幅值】（P 取绝对值），唔理方向。
 */
export function cantileverAnalytic({ L, b, h, E, P }) {
  const I = (b * h * h * h) / 12;
  const Pm = Math.abs(P);
  return {
    I,
    sigmaMax: (Pm * L * (h / 2)) / I,
    deltaTip: (Pm * L * L * L) / (3 * E * I),
  };
}

console.log('\n=== §0 解析式自身单元测试（已知数值）===');
{
  // 手算案例：L=100, b=10, h=10, E=69000 MPa, P=100 N
  //   I = 10·1000/12 = 833.3333 mm⁴
  //   σ = 100·100·5/833.3333 = 50000/833.3333 = 60 MPa（整数，易核）
  //   δ = 100·1e6/(3·69000·833.3333) = 1e8/1.725e8 = 0.5797101449 mm
  const a = cantileverAnalytic({ L: 100, b: 10, h: 10, E: 69000, P: 100 });
  assert(Math.abs(a.I - 2500 / 3) < 1e-9, `I = ${f(a.I, 6)} mm⁴（应 833.333333）`);
  assert(Math.abs(a.sigmaMax - 60) < 1e-9, `σ_max = ${f(a.sigmaMax, 9)} MPa（应恰好 60）`);
  assert(Math.abs(a.deltaTip - 0.5797101449275362) < 1e-12, `δ_tip = ${f(a.deltaTip, 12)} mm（应 0.579710144928）`);
  // 第二案例：窄高截面（b≠h，杜绝 b/h 写反）。L=200,b=5,h=20,E=200000,P=50
  //   I = 5·8000/12 = 3333.3333；σ = 50·200·10/3333.3333 = 30；δ = 50·8e6/(3·2e5·3333.3333) = 4e8/2e9 = 0.2
  const a2 = cantileverAnalytic({ L: 200, b: 5, h: 20, E: 200000, P: 50 });
  assert(Math.abs(a2.sigmaMax - 30) < 1e-9, `窄高截面 σ_max = ${f(a2.sigmaMax, 9)} MPa（应恰好 30）`);
  assert(Math.abs(a2.deltaTip - 0.2) < 1e-12, `窄高截面 δ_tip = ${f(a2.deltaTip, 12)} mm（应恰好 0.2）`);
  // 幂次自洽：解析式自己就要 σ∝L、δ∝L³（唔系就係公式打错）
  const b1 = cantileverAnalytic({ L: 100, b: 10, h: 10, E: 69000, P: 100 });
  const b3 = cantileverAnalytic({ L: 300, b: 10, h: 10, E: 69000, P: 100 });
  assert(Math.abs(b3.sigmaMax / b1.sigmaMax - 3) < 1e-9, `解析 σ(3L)/σ(L) = ${f(b3.sigmaMax / b1.sigmaMax, 9)}（应 3）`);
  assert(Math.abs(b3.deltaTip / b1.deltaTip - 27) < 1e-9, `解析 δ(3L)/δ(L) = ${f(b3.deltaTip / b1.deltaTip, 9)}（应 27）`);
}

// ==================================================================
// §1 几何 + 跑 FEA 嘅小工具
// ==================================================================
/** 水密长方体三角网格：x∈[0,L]（梁轴）、y∈[0,b]、z∈[0,h]。 */
function boxMesh(L, b, h) {
  const v = [
    [0, 0, 0], [L, 0, 0], [L, b, 0], [0, b, 0],
    [0, 0, h], [L, 0, h], [L, b, h], [0, b, h],
  ];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const triangles = [];
  for (const [a, c, d, e] of quads) triangles.push(a, c, d, a, d, e);
  return { vertices: v.flat(), triangles };
}

/** 固定 x=0 端面、x=L 端面受 −z 力 P 嘅悬臂。返回 FEA 结果 + 解析对照。 */
function runCantilever({ L, b = 10, h = 10, E = 69000, nu = 0.33, P = 100, resolution = 32 }) {
  const mesh = boxMesh(L, b, h);
  const r = runVoxelFea({
    ...mesh,
    fixed: { point: [0, 0, 0], normal: [1, 0, 0] },
    load: { point: [L, b / 2, h / 2], normal: [1, 0, 0] },
    force: [0, 0, -P],
    E, nu, resolution,
    cgTol: 1e-9, maxIter: 20000,
  });
  if (!r.ok) throw new Error(`runVoxelFea 失败：${r.error}`);
  return { r, a: cantileverAnalytic({ L, b, h, E, P }) };
}

// ==================================================================
// §2 σ、δ vs 解析值
// ==================================================================
// 容差理由（逐项，唔系拍脑袋）：
//   δ_tip  ±15%：体素悬臂系【轴对齐方块】，边界无阶梯误差；残余来自
//     (a) 固定端整个端面全 DOF 夹死 → 比 Euler-Bernoulli 嘅「截面可自由翘曲」偏刚；
//     (b) 低阶全积分 hex 嘅剪切自锁（截面 4 层时已细）；
//     (c) Timoshenko 剪切变形令真实值略大过 Euler-Bernoulli。
//     实测 L=100/200/300 都喺 0.96×（偏刚 4%），15% 留足余量。
//   σ_max  ±25%：σ 峰值喺【固定端表面纤维】，而体素 FEA 最幼只能喺【单元角点】采样，
//     角点距真实表面有半个单元嘅应变外推误差；加上固定端夹持本身系应力奇异点（真实
//     弹性解喺该处发散），网格越密读数越高 —— 收敛到解析梁理论值系近似而非极限。
//     实测 0.92×~1.13×，25% 容差。
console.log('\n=== §2 σ_max / δ_tip vs 解析解 ===');
const BASE = { b: 10, h: 10, E: 69000, nu: 0.33, P: 100, resolution: 32 };
for (const L of [100, 200, 300]) {
  const { r, a } = runCantilever({ ...BASE, L });
  const rd = r.dispMax / a.deltaTip;
  const rs = r.vmMax / a.sigmaMax;
  console.log(`  L=${L}mm nVox=${r.nVox} h=${f(r.h, 3)}mm converged=${r.converged}`);
  assert(r.converged, `L=${L} CG 收敛`);
  assert(Math.abs(rd - 1) <= 0.15,
    `L=${L} δ_tip FEM/解析 = ${f(rd, 3)}（${f(r.dispMax, 4)} vs ${f(a.deltaTip, 4)} mm）喺 ±15% 内`);
  assert(Math.abs(rs - 1) <= 0.25,
    `L=${L} σ_max FEM/解析 = ${f(rs, 3)}（${f(r.vmMax, 2)} vs ${f(a.sigmaMax, 2)} MPa）喺 ±25% 内`);
}

// ==================================================================
// §3 ★ 趋势单调性 + 幂次 ★（BUG-289 嘅核心回归）
// ==================================================================
console.log('\n=== §3 ★ 趋势：L = 1×,2×,3× 基准长度 ★ ===');
{
  const L0 = 100;
  const rows = [1, 2, 3].map((k) => {
    const L = L0 * k;
    const { r, a } = runCantilever({ ...BASE, L });
    return { k, L, sig: r.vmMax, del: r.dispMax, aSig: a.sigmaMax, aDel: a.deltaTip, nVox: r.nVox };
  });
  for (const w of rows) {
    console.log(`  L=${w.L}mm nVox=${w.nVox}  σ=${f(w.sig, 2)} MPa (解析 ${f(w.aSig, 2)})  δ=${f(w.del, 4)} mm (解析 ${f(w.aDel, 4)})`);
  }
  // ★ 单调上升 —— 呢两条就系钉死「加长梁应力反而下降」
  for (let i = 1; i < rows.length; i++) {
    assert(rows[i].sig > rows[i - 1].sig,
      `★ σ 单调上升：L=${rows[i - 1].L} σ=${f(rows[i - 1].sig, 2)} → L=${rows[i].L} σ=${f(rows[i].sig, 2)} MPa`);
    assert(rows[i].del > rows[i - 1].del,
      `★ δ 单调上升：L=${rows[i - 1].L} δ=${f(rows[i - 1].del, 4)} → L=${rows[i].L} δ=${f(rows[i].del, 4)} mm`);
  }
  // ★ 幂次：log-log 斜率。σ ∝ L¹、δ ∝ L³。
  //   容差 ±0.20（σ 应 0.8~1.2、δ 应 2.8~3.2）：体素离散化令每个 L 嘅网格唔完全相似
  //   （截面层数取整、h 微调），斜率有少量抖动；但 ±0.2 已经足以区分「正比」同「倒转/持平」。
  const slope = (y1, y0, x1, x0) => Math.log(y1 / y0) / Math.log(x1 / x0);
  const sSig31 = slope(rows[2].sig, rows[0].sig, rows[2].L, rows[0].L);
  const sDel31 = slope(rows[2].del, rows[0].del, rows[2].L, rows[0].L);
  const sSig21 = slope(rows[1].sig, rows[0].sig, rows[1].L, rows[0].L);
  const sDel21 = slope(rows[1].del, rows[0].del, rows[1].L, rows[0].L);
  assert(Math.abs(sSig21 - 1) <= 0.2, `★ σ ∝ L^${f(sSig21, 3)}（L:1×→2×，应 ≈1）`);
  assert(Math.abs(sSig31 - 1) <= 0.2, `★ σ ∝ L^${f(sSig31, 3)}（L:1×→3×，应 ≈1）`);
  assert(Math.abs(sDel21 - 3) <= 0.2, `★ δ ∝ L^${f(sDel21, 3)}（L:1×→2×，应 ≈3）`);
  assert(Math.abs(sDel31 - 3) <= 0.2, `★ δ ∝ L^${f(sDel31, 3)}（L:1×→3×，应 ≈3）`);
}

// ==================================================================
// §4 网格收敛：加密应该【趋向】解析值（唔系就係 formulation 问题）
// ==================================================================
console.log('\n=== §4 网格收敛（L=200，res 由粗到细）===');
{
  const L = 200;
  const a = cantileverAnalytic({ L, b: 10, h: 10, E: 69000, P: 100 });
  const errs = [];
  for (const resolution of [80, 120, 160, 200]) {
    const { r } = runCantilever({ ...BASE, L, resolution });
    const eD = Math.abs(r.dispMax - a.deltaTip) / a.deltaTip;
    const eS = Math.abs(r.vmMax - a.sigmaMax) / a.sigmaMax;
    errs.push({ resolution, h: r.h, nVox: r.nVox, eD, eS });
    console.log(`  res=${resolution} h=${f(r.h, 3)} nVox=${r.nVox}  δ误差=${f(eD * 100, 2)}%  σ误差=${f(eS * 100, 2)}%`);
  }
  const first = errs[0], last = errs[errs.length - 1];
  assert(last.h < first.h, `加密真系细咗 h：${f(first.h, 3)} → ${f(last.h, 3)} mm`);
  // 位移：收敛要求最细网格误差【唔差过】最粗网格（容 1.5% 抖动，因为截面层数取整会令
  // 某些 res 恰好对齐边界而偏好，唔系严格单调）。
  assert(last.eD <= first.eD + 0.015,
    `δ 误差唔发散：最粗 ${f(first.eD * 100, 2)}% → 最细 ${f(last.eD * 100, 2)}%`);
  assert(last.eD < 0.12, `最细网格 δ 误差 ${f(last.eD * 100, 2)}% < 12%`);
  // 应力：固定端系应力奇异点，加密会一路升（唔会收敛到梁理论值），所以只要求留喺容差带内，
  // 唔要求单调下降 —— 呢个系【物理】唔系 bug，故意写明。
  for (const e of errs) assert(e.eS < 0.3, `res=${e.resolution} σ 误差 ${f(e.eS * 100, 2)}% < 30%`);
}

// ==================================================================
// §5 单位健全性（E ×2 → δ /2；P ×2 → σ、δ 都 ×2）
// ==================================================================
console.log('\n=== §5 单位 / 线性健全性 ===');
{
  const L = 200;
  const base = runCantilever({ ...BASE, L });
  const dblE = runCantilever({ ...BASE, L, E: BASE.E * 2 });
  const dblP = runCantilever({ ...BASE, L, P: BASE.P * 2 });
  // 线弹性：E 翻倍 → 同一网格、同一载荷，u = K⁻¹f 嘅 K ∝ E → δ 精确减半；σ = D·B·u 中
  // D ∝ E、u ∝ 1/E → σ 完全唔变。容差 1e-6（纯浮点/CG 残差）。
  assert(Math.abs(dblE.r.dispMax / base.r.dispMax - 0.5) < 1e-6,
    `E ×2 → δ ×${f(dblE.r.dispMax / base.r.dispMax, 9)}（应 0.5）`);
  assert(Math.abs(dblE.r.vmMax / base.r.vmMax - 1) < 1e-6,
    `E ×2 → σ ×${f(dblE.r.vmMax / base.r.vmMax, 9)}（应 1，σ 同 E 无关）`);
  // 载荷翻倍 → 线性系统 σ、δ 都精确翻倍
  assert(Math.abs(dblP.r.dispMax / base.r.dispMax - 2) < 1e-6,
    `P ×2 → δ ×${f(dblP.r.dispMax / base.r.dispMax, 9)}（应 2）`);
  assert(Math.abs(dblP.r.vmMax / base.r.vmMax - 2) < 1e-6,
    `P ×2 → σ ×${f(dblP.r.vmMax / base.r.vmMax, 9)}（应 2）`);
  // 支座反力守恒：−Σ反力 应等于外加合力（捉「力单位错 / 载荷散布漏咗」）
  assert(Math.abs(base.r.reactionMag - BASE.P) / BASE.P < 1e-6,
    `支座反力 |R| = ${f(base.r.reactionMag, 6)} N ≈ 外载 ${BASE.P} N`);
  // 截面健全：b 唔变、h ×2 → I ×8、c ×2 → σ /4、δ /8（捉 b/h 搞错 + 截面层数自适应失效）
  const tall = runCantilever({ ...BASE, L, h: 20 });
  const aBase = cantileverAnalytic({ L, b: 10, h: 10, E: BASE.E, P: BASE.P });
  const aTall = cantileverAnalytic({ L, b: 10, h: 20, E: BASE.E, P: BASE.P });
  const rsS = (tall.r.vmMax / base.r.vmMax) / (aTall.sigmaMax / aBase.sigmaMax);
  const rsD = (tall.r.dispMax / base.r.dispMax) / (aTall.deltaTip / aBase.deltaTip);
  assert(Math.abs(rsS - 1) <= 0.3, `h ×2：σ 比值 / 解析比值 = ${f(rsS, 3)}（应 ≈1）`);
  assert(Math.abs(rsD - 1) <= 0.3, `h ×2：δ 比值 / 解析比值 = ${f(rsD, 3)}（应 ≈1）`);
}

// ==================================================================
console.log(`\n${failures === 0 ? '✅ fea-cantilever：全部通过' : `❌ fea-cantilever：${failures} 条断言失败`}`);
process.exit(failures === 0 ? 0 : 1);
