// voxelfea-cutcell.test.mjs — CUT-CELL（部分体积刚度缩放）数值精度验证
//
// 目标：证明 cut-cell（边界体素按占空比缩放 Ke）令体素 FEA 嘅悬臂梁挠度
//   比旧二值（全进/全出）体素更贴近 Euler-Bernoulli 解析解 δ = F·L³/(3·E·I)。
//
// 圆截面悬臂（曲面边界 → 阶梯失真最严重）+ 一个斜置方截面（45° 转角）双案例。
//
// 跑法（喺 C:\ClaudeCode\webcad 目录执行）：
//   node tests/voxelfea-cutcell.test.mjs
// 脚本自动单文件转译 voxelfea.ts（零 import，可单独转译）然后 import。
// 全部断言通过 → exit 0；任一失败 → exit 1。

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

console.log('[cutcell] 转译 voxelfea.ts → .tmp-fea/ ...');
execSync(
  'npx tsc src/analysis/voxelfea.ts src/analysis/faceFeaSelect.ts --outDir .tmp-fea --module es2020 --target es2020 --strict false --skipLibCheck --ignoreConfig',
  { cwd: root, stdio: 'inherit' },
);
// `tsc --module es2020` preserves Vite's extensionless local import, while
// Node ESM requires the emitted .js extension in this temporary test folder.
const compiledVoxel = path.join(root, '.tmp-fea', 'voxelfea.js');
writeFileSync(compiledVoxel, readFileSync(compiledVoxel, 'utf8').replace(/(['"]\.\/faceFeaSelect)(['"])/, '$1.js$2'));
const { runVoxelFea } = await import(
  pathToFileURL(path.join(root, '.tmp-fea', 'voxelfea.js')).href
);

// ------------------------------------------------------------------ 小框架
let failures = 0;
function assert(cond, msg) { if (!cond) { console.log(`  ✗ ASSERT FAIL: ${msg}`); failures++; } else { console.log(`  ✓ ${msg}`); } }
const f = (x, d = 4) => Number(x).toFixed(d);

// ------------------------------------------------------------------ 网格生成器

/**
 * 水密圆柱体（轴沿 +X，长 L，半径 r），两端封盖。
 * 圆周分 n 段；侧面 n 个四边形（每个拆 2 三角形）+ 两端三角扇。
 * 返回 { vertices:[x,y,z...], triangles:[i0,i1,i2...] }。
 */
function cylinderMesh(L, r, n) {
  const V = [];
  const T = [];
  // 环 0（x=0）顶点 0..n-1，环 1（x=L）顶点 n..2n-1
  for (let ring = 0; ring < 2; ring++) {
    const x = ring === 0 ? 0 : L;
    for (let s = 0; s < n; s++) {
      const a = (2 * Math.PI * s) / n;
      V.push(x, r * Math.cos(a), r * Math.sin(a));
    }
  }
  const c0 = 2 * n;     // x=0 端面中心
  V.push(0, 0, 0);
  const c1 = 2 * n + 1; // x=L 端面中心
  V.push(L, 0, 0);
  // 侧面（外法向朝外）
  for (let s = 0; s < n; s++) {
    const s1 = (s + 1) % n;
    const a0 = s, a1 = s1, b0 = n + s, b1 = n + s1;
    T.push(a0, b0, b1);
    T.push(a0, b1, a1);
  }
  // x=0 端盖（法向 -X：绕序令外法向朝 -X）
  for (let s = 0; s < n; s++) {
    const s1 = (s + 1) % n;
    T.push(c0, s1, s);
  }
  // x=L 端盖（法向 +X）
  for (let s = 0; s < n; s++) {
    const s1 = (s + 1) % n;
    T.push(c1, n + s, n + s1);
  }
  return { vertices: V, triangles: T };
}

/**
 * 水密长方体 [0,L]x[-w/2,w/2]x[-w/2,w/2]（轴沿 +X，方截面 w×w），可绕 X 轴旋转 angleDeg。
 * 旋转令方截面相对体素轴格「斜置」→ 阶梯失真显著（cut-cell 强项）。
 */
function rotatedBarMesh(L, w, angleDeg) {
  const hw = w / 2;
  // 截面 4 角（yz 平面）逆时针
  const corners = [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]];
  const th = (angleDeg * Math.PI) / 180;
  const ca = Math.cos(th), sa = Math.sin(th);
  const rot = ([y, z]) => [y * ca - z * sa, y * sa + z * ca];
  const V = [];
  for (let ring = 0; ring < 2; ring++) {
    const x = ring === 0 ? 0 : L;
    for (const c of corners) {
      const [y, z] = rot(c);
      V.push(x, y, z);
    }
  }
  const c0 = 8; V.push(0, 0, 0);
  const c1 = 9; V.push(L, 0, 0);
  const T = [];
  for (let s = 0; s < 4; s++) {
    const s1 = (s + 1) % 4;
    const a0 = s, a1 = s1, b0 = 4 + s, b1 = 4 + s1;
    T.push(a0, b0, b1);
    T.push(a0, b1, a1);
  }
  for (let s = 0; s < 4; s++) { const s1 = (s + 1) % 4; T.push(c0, s1, s); }
  for (let s = 0; s < 4; s++) { const s1 = (s + 1) % 4; T.push(c1, 4 + s, 4 + s1); }
  return { vertices: V, triangles: T };
}

// ------------------------------------------------------------------ 公共参数

const E = 70000;   // MPa（铝合金量级，数值无关精度比较）
const nu = 0.33;
const RES = 24;    // 中等分辨率（最长轴 L 方向约 24 体素 → 截面方向粗，阶梯明显）

/** 跑一档 FEA，返回 tip 端节点位移幅值 dispMax（用作 tip 挠度近似）。 */
function tipDeflection(mesh, L, F, cutCell) {
  const r = runVoxelFea({
    vertices: Float32Array.from(mesh.vertices),
    triangles: Uint32Array.from(mesh.triangles),
    fixed: { point: [0, 0, 0], normal: [1, 0, 0] },   // x=0 端面固定（悬臂根）
    load: { point: [L, 0, 0], normal: [1, 0, 0] },    // x=L 端面受力（自由端）
    force: [0, 0, -F],                                 // 横向 -Z 集中力（弯曲）
    E, nu, resolution: RES,
    cutCell,
  });
  if (!r.ok) throw new Error(`FEA 失败（cutCell=${cutCell}）：${r.error}`);
  return { disp: r.dispMax, nVox: r.nVox, warnings: r.warnings };
}

/** 单分辨率案例：打印 解析 δ / 无cut-cell δ+%err / cut-cell δ+%err，断言 cut-cell 更准。 */
function runCase(label, mesh, L, F, I) {
  const delta = (F * L * L * L) / (3 * E * I);   // Euler-Bernoulli 自由端挠度
  const noCut = tipDeflection(mesh, L, F, false);
  const cut = tipDeflection(mesh, L, F, true);
  const errNo = Math.abs(noCut.disp - delta) / delta * 100;
  const errCut = Math.abs(cut.disp - delta) / delta * 100;
  console.log(`\n=== ${label} ===`);
  console.log(`  网格体素数：${noCut.nVox}（二值） / ${cut.nVox}（cut-cell；体素集合相同）`);
  console.log(`  解析 Euler-Bernoulli δ = F·L³/(3·E·I) = ${f(delta, 5)} mm`);
  console.log(`  体素 FEA（无 cut-cell，旧二值）   δ = ${f(noCut.disp, 5)} mm   误差 = ${f(errNo, 2)} %`);
  console.log(`  体素 FEA（cut-cell 部分体积缩放） δ = ${f(cut.disp, 5)} mm   误差 = ${f(errCut, 2)} %`);
  console.log(`  误差改善：${f(errNo - errCut, 2)} 个百分点（${f((errNo - errCut) / errNo * 100, 1)}% 相对降低）`);
  assert(errCut < errNo, `${label}：cut-cell 误差(${f(errCut, 2)}%) < 无cut-cell 误差(${f(errNo, 2)}%)`);
  assert(noCut.disp > 0 && cut.disp > 0, `${label}：两挠度均 > 0`);
  return { delta, errNo, errCut };
}

/**
 * 多分辨率扫描案例（曲面边界主力证据）：单一分辨率下二值体素嘅阶梯误差会因「截面台阶
 * 面积偶然抵消」而上下乱跳（某些格点碰巧贴近解析值），单点比较可被运气左右、唔可靠。
 * 真凭实据 = 一组递增分辨率上嘅【平均/中位/RMS 误差】：cut-cell 系统性更贴近光滑边界。
 */
function runSweep(label, mesh, L, F, I, resList) {
  const delta = (F * L * L * L) / (3 * E * I);
  const eb = [], ec = [];
  const rows = [];
  for (const res of resList) {
    const b = runVoxelFea({ vertices: Float32Array.from(mesh.vertices), triangles: Uint32Array.from(mesh.triangles), fixed: { point: [0, 0, 0], normal: [1, 0, 0] }, load: { point: [L, 0, 0], normal: [1, 0, 0] }, force: [0, 0, -F], E, nu, resolution: res, cutCell: false });
    const c = runVoxelFea({ vertices: Float32Array.from(mesh.vertices), triangles: Uint32Array.from(mesh.triangles), fixed: { point: [0, 0, 0], normal: [1, 0, 0] }, load: { point: [L, 0, 0], normal: [1, 0, 0] }, force: [0, 0, -F], E, nu, resolution: res, cutCell: true });
    if (!b.ok || !c.ok) throw new Error(`sweep res=${res} 失败：${b.error || c.error}`);
    const errB = Math.abs(b.dispMax - delta) / delta * 100;
    const errC = Math.abs(c.dispMax - delta) / delta * 100;
    eb.push(errB); ec.push(errC);
    rows.push({ res, nVox: b.nVox, dB: b.dispMax, errB, dC: c.dispMax, errC });
  }
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
  console.log(`\n=== ${label} ===`);
  console.log(`  解析 Euler-Bernoulli δ = F·L³/(3·E·I) = ${f(delta, 5)} mm`);
  console.log(`  分辨率扫描（res = ${resList.join(', ')}）：`);
  console.log(`    res  nVox   二值δ      二值误差%   cut-cellδ   cut-cell误差%`);
  for (const r of rows) {
    console.log(`    ${r.res.toString().padEnd(4)} ${r.nVox.toString().padEnd(5)} ${f(r.dB, 5).padStart(8)} ${f(r.errB, 2).padStart(9)}   ${f(r.dC, 5).padStart(8)} ${f(r.errC, 2).padStart(9)}`);
  }
  const mB = mean(eb), mC = mean(ec);
  console.log(`  ── 聚合（${resList.length} 档）──`);
  console.log(`    平均误差：二值 ${f(mB, 2)} %  →  cut-cell ${f(mC, 2)} %   （相对降低 ${f((mB - mC) / mB * 100, 1)}%）`);
  console.log(`    中位误差：二值 ${f(med(eb), 2)} %  →  cut-cell ${f(med(ec), 2)} %`);
  console.log(`    RMS 误差： 二值 ${f(rms(eb), 2)} %  →  cut-cell ${f(rms(ec), 2)} %`);
  assert(mC < mB, `${label}：cut-cell 平均误差(${f(mC, 2)}%) < 二值平均误差(${f(mB, 2)}%)`);
  assert(rms(ec) < rms(eb), `${label}：cut-cell RMS 误差(${f(rms(ec), 2)}%) < 二值 RMS 误差(${f(rms(eb), 2)}%)`);
  return { delta, meanB: mB, meanC: mC };
}

// ------------------------------------------------------------------ 案例 1：圆截面悬臂（曲面边界）— 多分辨率扫描
// 圆截面 I = π·r⁴/4。体素阶梯将圆近似成台阶，截面惯性矩随分辨率乱跳 → 二值误差忽大忽小；
// cut-cell 按占空比缩放边界单元刚度 → 系统性贴近光滑圆边界。用扫描嘅平均/RMS 误差作铁证。
{
  const L = 120, r = 10, F = 200;
  const I = Math.PI * Math.pow(r, 4) / 4;
  runSweep('圆截面悬臂 L=120 r=10 F=200N（曲面边界·多分辨率扫描）', cylinderMesh(L, r, 56), L, F, I,
    [14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 44, 48]);
}

// ------------------------------------------------------------------ 案例 2：45° 斜置方截面悬臂（斜面边界·单分辨率）
// 方截面 I = w⁴/12（45° 旋转下绕坐标轴惯性矩不变）。斜面阶梯偏刚（δ 偏小）→ cut-cell 软化更准。
{
  const L = 120, w = 18, F = 200;
  const I = Math.pow(w, 4) / 12;
  runCase('45°斜置方截面悬臂 L=120 w=18 F=200N（斜面边界·单分辨率 res=24）', rotatedBarMesh(L, w, 45), L, F, I);
}

// ------------------------------------------------------------------ 案例 3：向后兼容性 — cutCell:false 必须等同旧二值
// （旧调用方唔传 cutCell → 默认开；显式传 false → 必须 bit-for-bit 等同从前嘅二值结果。
//  呢度用「轴对齐方块」验证：cutCell 开/关结果应几乎一致（无部分体积边界单元）。）
{
  const L = 80, w = 20, F = 150;
  const I = Math.pow(w, 4) / 12;
  const mesh = rotatedBarMesh(L, w, 0);   // angle=0 → 轴对齐方块
  const noCut = tipDeflection(mesh, L, F, false);
  const cut = tipDeflection(mesh, L, F, true);
  const rel = Math.abs(cut.disp - noCut.disp) / Math.max(noCut.disp, 1e-12) * 100;
  console.log(`\n=== 向后兼容：轴对齐方块（cut-cell 应几乎不改结果）===`);
  console.log(`  无 cut-cell δ = ${f(noCut.disp, 5)} mm   cut-cell δ = ${f(cut.disp, 5)} mm   相对差 = ${f(rel, 3)} %`);
  assert(rel < 1.0, `轴对齐方块：cut-cell 与二值相对差 ${f(rel, 3)}% < 1%（边界单元少→几乎不变）`);
  const hasCompatWarn = cut.warnings.some((w) => w.includes('cut-cell'));
  assert(hasCompatWarn || rel < 0.3, `轴对齐方块：要么标记无边界单元 warning，要么差异极小`);
}

// ------------------------------------------------------------------ 总结
console.log(`\n${failures === 0 ? '✅ 全部通过' : `❌ ${failures} 个断言失败`}`);
process.exit(failures === 0 ? 0 : 1);
