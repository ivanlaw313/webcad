// voxelfea-volume-probe.mjs — 体素切胞网格【体积精度】直接量化 probe（additive，唔郁现有档）
//
// 目标（评估员任务）：直接量度体素化后【体积】收敛：
//   (1) 二值体素体积 = nVox·h³ vs 真解析体积（box/cylinder/sphere）
//   (2) cut-cell 占空比体积 = Σ occ·h³ vs 真解析体积
//   (3) h→0 收敛阶 p（拟合 err ∝ h^p，log-log 最小二乘）
//
// box 轴对齐 = 中点采样对轴对齐面精确（理论 0 误差，除边界对齐外）；
// cylinder/sphere = 曲面边界 → 二值台阶 O(h) 误差；cut-cell 部分体积应更准 + 更高阶。
//
// 跑法（喺 C:\ClaudeCode\webcad）：npx tsx tests/voxelfea-volume-probe.mjs
// 自动单文件转译 voxelfea.ts（零 import）→ import voxelize + computeOccupancy。

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

console.log('[vol-probe] 转译 voxelfea.ts → .tmp-fea/ ...');
execSync(
  'npx tsc src/analysis/voxelfea.ts --outDir .tmp-fea --module es2020 --target es2020 --strict false --skipLibCheck --ignoreConfig',
  { cwd: root, stdio: 'inherit' },
);
const mod = await import(pathToFileURL(path.join(root, '.tmp-fea', 'voxelfea.js')).href);
const voxelize = mod.voxelize || mod._internals.voxelize;
const computeOccupancy = mod.computeOccupancy || mod._internals.computeOccupancy;

const f = (x, d = 4) => Number(x).toFixed(d);

// ----------------------------------------------------------- 水密网格生成器
function boxMesh(Lx, Ly, Lz) {
  // 轴对齐 [0,Lx]x[0,Ly]x[0,Lz]，12 三角形，外法向朝外
  const v = [
    0,0,0, Lx,0,0, Lx,Ly,0, 0,Ly,0,      // z=0
    0,0,Lz, Lx,0,Lz, Lx,Ly,Lz, 0,Ly,Lz,  // z=Lz
  ];
  const t = [
    0,2,1, 0,3,2,        // z=0 (法向 -Z)
    4,5,6, 4,6,7,        // z=Lz (法向 +Z)
    0,1,5, 0,5,4,        // y=0
    3,7,6, 3,6,2,        // y=Ly
    0,4,7, 0,7,3,        // x=0
    1,2,6, 1,6,5,        // x=Lx
  ];
  return { vertices: v, triangles: t };
}

function cylinderMesh(L, r, n) {
  // 轴沿 +X，[0,L]，半径 r，封盖；n 段圆周
  const V = [];
  for (let ring = 0; ring < 2; ring++) {
    const x = ring === 0 ? 0 : L;
    for (let s = 0; s < n; s++) {
      const a = (2 * Math.PI * s) / n;
      V.push(x, r * Math.cos(a), r * Math.sin(a));
    }
  }
  const c0 = 2 * n; V.push(0, 0, 0);
  const c1 = 2 * n + 1; V.push(L, 0, 0);
  const T = [];
  for (let s = 0; s < n; s++) {
    const s1 = (s + 1) % n, a0 = s, a1 = s1, b0 = n + s, b1 = n + s1;
    T.push(a0, b0, b1); T.push(a0, b1, a1);
  }
  for (let s = 0; s < n; s++) { const s1 = (s + 1) % n; T.push(c0, s1, s); }
  for (let s = 0; s < n; s++) { const s1 = (s + 1) % n; T.push(c1, n + s, n + s1); }
  return { vertices: V, triangles: T };
}

function sphereMesh(r, nLat, nLon) {
  // UV 球，半径 r，中心原点；水密
  const V = [];
  const idx = (i, j) => 1 + (i - 1) * nLon + (j % nLon); // i:1..nLat-1 环，j:0..nLon-1
  V.push(0, 0, r);           // 北极 = 0
  for (let i = 1; i < nLat; i++) {
    const th = Math.PI * i / nLat;
    const st = Math.sin(th), ct = Math.cos(th);
    for (let j = 0; j < nLon; j++) {
      const ph = 2 * Math.PI * j / nLon;
      V.push(r * st * Math.cos(ph), r * st * Math.sin(ph), r * ct);
    }
  }
  const south = 1 + (nLat - 1) * nLon;
  V.push(0, 0, -r);          // 南极
  const T = [];
  // 北极扇
  for (let j = 0; j < nLon; j++) T.push(0, idx(1, j), idx(1, j + 1));
  // 中间环带
  for (let i = 1; i < nLat - 1; i++) {
    for (let j = 0; j < nLon; j++) {
      const a = idx(i, j), b = idx(i, j + 1), c = idx(i + 1, j), d = idx(i + 1, j + 1);
      T.push(a, c, d); T.push(a, d, b);
    }
  }
  // 南极扇
  for (let j = 0; j < nLon; j++) T.push(south, idx(nLat - 1, j + 1), idx(nLat - 1, j));
  return { vertices: V, triangles: T };
}

// ----------------------------------------------------------- 体积量化
function binaryVolume(grid) { return grid.nVox * grid.h ** 3; }
function occVolume(occ, grid) {
  let s = 0; for (let i = 0; i < occ.length; i++) s += occ[i];
  return s * grid.h ** 3;
}

// log-log 最小二乘拟合收敛阶 p：err ≈ C·h^p
function fitOrder(hs, errs) {
  const pts = hs.map((h, i) => [Math.log(h), Math.log(errs[i])]).filter(([, y]) => Number.isFinite(y));
  const n = pts.length;
  if (n < 2) return NaN;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [x, y] of pts) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
  return (n * sxy - sx * sy) / (n * sxx - sx * sx);
}

// ----------------------------------------------------------- 扫描一个几何
function sweepGeom(label, mesh, Vtrue, resList, maxRes) {
  console.log(`\n=== ${label}   V_analytic = ${f(Vtrue, 5)} ===`);
  console.log('  res    h        nVox     V_bin        err_bin%    V_cut        err_cut%');
  const hs = [], errBin = [], errCut = [];
  for (const res of resList) {
    const grid = voxelize(mesh.vertices, mesh.triangles, res, undefined, maxRes);
    const occ = computeOccupancy(mesh.vertices, mesh.triangles, grid, 4); // sub=4 → 64 点/体素（更细占空比）
    const Vb = binaryVolume(grid), Vc = occVolume(occ, grid);
    const eb = Math.abs(Vb - Vtrue) / Vtrue * 100;
    const ec = Math.abs(Vc - Vtrue) / Vtrue * 100;
    hs.push(grid.h); errBin.push(eb); errCut.push(ec);
    console.log(`  ${String(res).padEnd(5)} ${f(grid.h,4).padStart(7)} ${String(grid.nVox).padStart(7)}  ${f(Vb,3).padStart(9)}  ${f(eb,3).padStart(8)}   ${f(Vc,3).padStart(9)}  ${f(ec,3).padStart(8)}`);
  }
  const pBin = fitOrder(hs, errBin), pCut = fitOrder(hs, errCut);
  const meanBin = errBin.reduce((a, b) => a + b, 0) / errBin.length;
  const meanCut = errCut.reduce((a, b) => a + b, 0) / errCut.length;
  const finestBin = errBin[errBin.length - 1], finestCut = errCut[errCut.length - 1];
  console.log(`  ── 聚合 ──`);
  console.log(`    平均误差:  二值 ${f(meanBin,3)}%   cut-cell ${f(meanCut,3)}%`);
  console.log(`    最细档误差: 二值 ${f(finestBin,3)}%   cut-cell ${f(finestCut,3)}%`);
  console.log(`    收敛阶 p (err∝h^p):  二值 ${f(pBin,3)}   cut-cell ${f(pCut,3)}`);
  return { label, Vtrue, meanBin, meanCut, finestBin, finestCut, pBin, pCut, hs, errBin, errCut };
}

// ----------------------------------------------------------- 案例
const results = [];

// 案例 A：轴对齐 box（中点采样对轴对齐面理论精确 → 误差应接近浮点级/边界对齐残差）
{
  const Lx = 60, Ly = 40, Lz = 24;
  const Vtrue = Lx * Ly * Lz;
  results.push(sweepGeom('轴对齐 box 60x40x24（中点采样理论精确）',
    boxMesh(Lx, Ly, Lz), Vtrue, [8, 12, 16, 20, 24, 32, 40, 48, 60, 64], 128));
}

// 案例 B：圆柱（曲面边界 → 二值 O(h) 台阶误差；cut-cell 应更准更高阶）
{
  const L = 100, r = 20;
  const Vtrue = Math.PI * r * r * L;
  results.push(sweepGeom('圆柱 L=100 r=20（曲面边界）',
    cylinderMesh(L, r, 128), Vtrue, [12, 16, 20, 24, 32, 40, 48, 64, 80, 96], 128));
}

// 案例 C：球（全曲面边界，最苛刻）
{
  const r = 25;
  const Vtrue = 4 / 3 * Math.PI * r ** 3;
  results.push(sweepGeom('球 r=25（全曲面边界）',
    sphereMesh(r, 96, 128), Vtrue, [12, 16, 20, 24, 32, 40, 48, 64, 80, 96], 128));
}

// ----------------------------------------------------------- 断言 + 总结
let fails = 0;
const A = (cond, msg) => { if (!cond) { console.log(`  ✗ ${msg}`); fails++; } else console.log(`  ✓ ${msg}`); };
console.log('\n=== 断言（几何地基核心结论）===');
// [1] 二值体素体积（= 几何地基）随 h→0 收敛到真体积：曲面最细档误差 < 1.5%
A(results[1].finestBin < 1.5, `圆柱 二值最细档误差 ${f(results[1].finestBin,3)}% < 1.5%（h→0 收敛）`);
A(results[2].finestBin < 0.5, `球 二值最细档误差 ${f(results[2].finestBin,3)}% < 0.5%（h→0 收敛）`);
// [2] 二值体积收敛阶 ≥ O(h)：曲面 p ≥ 1（中点采样对称面误差抵消 → 常见超收敛 p≳1.5）
A(results[1].pBin >= 1.0, `圆柱 二值收敛阶 ${f(results[1].pBin,3)} ≥ 1.0（至少 O(h)）`);
A(results[2].pBin >= 1.0, `球 二值收敛阶 ${f(results[2].pBin,3)} ≥ 1.0（至少 O(h)）`);
// [3] box 轴对齐：h 整除时二值精确（res=60 → h=1.0 → 误差 0）
{
  const box = results[0];
  const anyExact = box.errBin.some((e) => e < 1e-6);
  A(anyExact, `box 存在 h 整除档二值误差 ≈ 0（中点采样对轴对齐精确，最小 ${f(Math.min(...box.errBin),4)}%）`);
}
// [4] 【发现】cut-cell 占空比和 (Σocc·h³) 系【单边低估】—— 只算 solid 中心-inside 体素、
//     中心-outside 的部分体素体积从未加回 → 系统性偏低、h→0 唔收敛到真体积（plateaus）。
//     呢个证明 occupancy 系【刚度加权装置】唔系【体积估计器】。
A(results[2].finestCut > results[2].finestBin, `球 cut-cell 占空比最细档误差 ${f(results[2].finestCut,3)}% > 二值 ${f(results[2].finestBin,3)}%（证实占空比单边低估，非体积估计器）`);

console.log(`\n${fails === 0 ? '✅ 全部通过' : `❌ ${fails} 个断言失败`}`);
process.exit(fails === 0 ? 0 : 1);
