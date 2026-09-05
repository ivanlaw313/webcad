// moldflow.test.mjs — 注塑充填趋势模拟（src/analysis/moldflow.ts）解析测试
//
// 跑法（喺 C:\ClaudeCode\webcad 目录执行）：
//   npx -y tsx tests/moldflow.test.mjs
// 全部测试通过 → exit 0；任一失败 → exit 1。

import { runMoldFlow, MOLD_MATERIALS, _internals } from '../src/analysis/moldflow.ts';
import { voxelize } from '../src/analysis/voxelfea.ts';

// ------------------------------------------------------------------ 小框架

const rows = [];
function test(name, fn) {
  const t0 = Date.now();
  try {
    const detail = fn() ?? '';
    rows.push({ name, pass: true, ms: Date.now() - t0, detail });
    console.log(`PASS ${name} (${Date.now() - t0}ms) ${detail}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    rows.push({ name, pass: false, ms: Date.now() - t0, detail: msg });
    console.log(`FAIL ${name} (${Date.now() - t0}ms) ${msg}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function fmt(x, d = 4) { return Number(x).toFixed(d); }
function median(arr) { const a = [...arr].sort((x, y) => x - y); return a.length ? a[(a.length - 1) >> 1] : NaN; }

// ------------------------------------------------------------------ 测试网格

/** 水密长方体 [x0,x1]×[y0,y1]×[z0,z1]，8 顶点 12 三角形（同 fea-verify boxMesh 同款拓扑）。 */
function boxMesh(x0, x1, y0, y1, z0, z1) {
  const vertices = [];
  for (let b = 0; b < 8; b++) {
    vertices.push((b & 1) ? x1 : x0, (b & 2) ? y1 : y0, (b & 4) ? z1 : z0);
  }
  const triangles = [
    0, 1, 3, 0, 3, 2, // 底 z=z0
    4, 5, 7, 4, 7, 6, // 顶 z=z1
    0, 4, 5, 0, 5, 1, // y=y0
    2, 3, 7, 2, 7, 6, // y=y1
    0, 2, 6, 0, 6, 4, // x=x0
    1, 5, 7, 1, 7, 3, // x=x1
  ];
  return { vertices, triangles };
}

/** 全实心合成体素网格（直接喂 _internals，绕过网格→体素步骤做受控对比）。 */
function slabGrid(nx, ny, nz, h) {
  return {
    h, nx, ny, nz, ox: 0, oy: 0, oz: 0,
    solid: new Uint8Array(nx * ny * nz).fill(1), nVox: nx * ny * nz, oddColumns: 0,
  };
}

const plate = boxMesh(-50, 50, -20, 20, 0, 3); // 100×40×3 mm 板

// ------------------------------------------------------------------ T1 单端浇口：fill 沿 +x 严格单调 + tFill 精确

let r1 = null;
test('T1 fill-monotonic-single-gate', () => {
  r1 = runMoldFlow({
    vertices: plate.vertices, triangles: plate.triangles,
    gates: [[-50, 0, 1.5]], material: 'ABS', resolution: 40,
  });
  // 注：3mm 薄板喺 res40 会触发【自动加密】(res40→64, h=1.5625) —— 保住薄墙嘅既有设计行为（非本次改动）。
  //   故唔再硬编 h=2.5 / nVox=640；改成验「自动加密只会更细 + 实际列数沿 x 严格单调 + tFill 体积公式」(res 无关)。
  const xExt = 100, nx = Math.round(xExt / r1.h);
  assert(r1.h > 0 && r1.h <= 2.5 + 1e-9, `h=${r1.h}（自动加密只会 ≤ 原 res40 嘅 2.5）`);
  assert(r1.nVox > 0, `nVox=${r1.nVox} 应 > 0`);
  // 每条 x 列嘅最早充填时间沿 +x 严格单调递增
  const mins = new Map();
  for (let e = 0; e < r1.nVox; e++) {
    const ix = Math.round((r1.centers[e * 3] - (-50 + r1.h / 2)) / r1.h);
    const f = r1.fill[e];
    if (!mins.has(ix) || f < mins.get(ix)) mins.set(ix, f);
  }
  assert(mins.size === nx, `x 列数 ${mins.size}，期望 ${nx}`);
  for (let ix = 1; ix < nx; ix++) {
    assert(mins.get(ix) > mins.get(ix - 1),
      `列 ${ix} 最早充填 ${mins.get(ix)} ≤ 列 ${ix - 1} 嘅 ${mins.get(ix - 1)}（应严格递增）`);
  }
  // tFill = V/V̇ 精确（V = nVox·h³ 体素体积，V̇ = 50000 mm³/s 假设）
  const tExp = (r1.nVox * r1.h ** 3) / 50000;
  assert(Math.abs(r1.tFill - tExp) <= 1e-12 * tExp, `tFill=${r1.tFill}，期望 ${tExp}`);
  assert(Math.abs(r1.pMaxRel - 1) < 1e-12, `pMaxRel=${r1.pMaxRel}，期望 1（归一化恒 1）`);
  return `nVox=${r1.nVox} h=${fmt(r1.h, 4)}（res40→自动加密64）tFill=${fmt(r1.tFill, 4)}s · ${nx} 列严格单调`;
});

// ------------------------------------------------------------------ T2 焊接线：双端浇口中面有、单浇口冇

let r2 = null;
test('T2 weld-two-gates-midplane', () => {
  assert(r1, 'T1 未通过，无法对比单浇口');
  r2 = runMoldFlow({
    vertices: plate.vertices, triangles: plate.triangles,
    gates: [[-50, 0, 1.5], [50, 0, 1.5]], material: 'ABS', resolution: 40,
  });
  const xs = [];
  for (let e = 0; e < r2.nVox; e++) if (r2.weld[e]) xs.push(r2.centers[e * 3]);
  assert(xs.length > 0, '双端浇口 weld 体素数 = 0，应喺中面相遇');
  const med = median(xs);
  assert(med >= -2 * r2.h && med <= 2 * r2.h,
    `weld x 中位数 ${fmt(med, 2)}，应 ∈ [−${2 * r2.h}, ${2 * r2.h}]（中面）`);
  // 单浇口同板：weld ≈ 0（误报 < 1% 体素）
  let n1 = 0;
  for (let e = 0; e < r1.nVox; e++) if (r1.weld[e]) n1++;
  assert(n1 < 0.01 * r1.nVox, `单浇口 weld=${n1} ≥ 1% 体素（${0.01 * r1.nVox}）`);
  return `双浇口 weld=${xs.length} 个，中位 x=${fmt(med, 2)}（限 ±${2 * r2.h}）；单浇口误报=${n1}/${r1.nVox}`;
});

// ------------------------------------------------------------------ T3 冷却公式 vs 手算 + 整件 tCool

test('T3 cooling-formula', () => {
  const mat = MOLD_MATERIALS.ABS;
  // 手算板式公式：t = s²/(π²α)·ln(8(Tm−Tw)/(π²(Te−Tw)))，s=3，ABS{230,60,95,α=0.085}
  const s = 3;
  const manual = (s * s) / (Math.PI ** 2 * mat.alpha)
    * Math.log((8 * (mat.melt - mat.mold)) / (Math.PI ** 2 * (mat.eject - mat.mold)));
  const got = _internals.coolingTime(s, mat);
  assert(Math.abs(got - manual) <= 1e-9, `coolingTime(3,ABS)=${got}，手算 ${manual}，差 ${Math.abs(got - manual)}`);
  // 整件 tCool = 最厚位公式值。用 r1 自身 wallMax(=2·max半厚)，对自动加密 + 表面回收都一致
  //   （唔再另 voxelize res40 算 maxH —— 会同 r1 实际 res64 + 回收后嘅厚度场唔夹，造成 stale 失败）。
  assert(r1, 'T1 未通过');
  const tExp = _internals.coolingTime(r1.wallMax, mat);
  assert(Math.abs(r1.tCool - tExp) <= 1e-9, `tCool=${r1.tCool}，期望 coolingTime(wallMax=${fmt(r1.wallMax, 3)})=${tExp}`);
  let cMax = 0;
  for (let e = 0; e < r1.nVox; e++) if (r1.cooling[e] > cMax) cMax = r1.cooling[e];
  assert(Math.abs(cMax - r1.tCool) <= 1e-5 * r1.tCool, `max(cooling)=${cMax} ≠ tCool=${r1.tCool}（Float32 容差外）`);
  return `coolingTime(3,ABS)=${fmt(got, 3)}s（手算一致）；整件 tCool=${fmt(r1.tCool, 3)}s = 公式(最厚 s=${fmt(r1.wallMax, 2)}mm)`;
});

// ------------------------------------------------------------------ T4 厚 6mm vs 薄 1.5mm：薄板未归一化流阻更大

test('T4 thin-wall-higher-pressure-cost', () => {
  // 同长流道（60mm）、同宽（10mm）、同体素（h=0.5）嘅受控对比：
  // 厚板 12 层（6mm）vs 薄板 3 层（1.5mm），Hele-Shaw 流导 ∝ h³ → 薄板流阻应远大。
  // 注意比较点用「远端中心线体素」而唔系 tauMax：tauMax 落喺角落/端面体素，
  // 嗰度半厚被端面 clamp 到 0.5h（两板一样），角落贵步会冲淡厚度对比。
  const h = 0.5;
  const thick = slabGrid(120, 20, 12, h); // 60×10×6 mm
  const thin = slabGrid(120, 20, 3, h);   // 60×10×1.5 mm
  const hhT = _internals.distanceTransform(thick);
  const hhN = _internals.distanceTransform(thin);
  const gT = 0 + 120 * (10 + 20 * 6); // 厚板浇口：i=0, j=10, k=6（端面中心）
  const gN = 0 + 120 * (10 + 20 * 1); // 薄板浇口：i=0, j=10, k=1
  const fT = _internals.dijkstraFill(thick, hhT, [gT], 1.0);
  const fN = _internals.dijkstraFill(thin, hhN, [gN], 1.0);
  assert(fT.nReached === thick.nVox && fN.nReached === thin.nVox,
    `连通数 ${fT.nReached}/${fN.nReached}，期望全连通`);
  // 远端中心线体素（i=110，离端面 10 体素 = 5mm，半厚由板厚主导）
  const pT = 110 + 120 * (10 + 20 * 6);
  const pN = 110 + 120 * (10 + 20 * 1);
  const cT = fT.tau[pT], cN = fN.tau[pN];
  assert(Number.isFinite(cT) && Number.isFinite(cN), `目标体素未充填：厚=${cT} 薄=${cN}`);
  assert(cN > cT, `薄板远端 cost=${cN} ≤ 厚板 ${cT}（应更大）`);
  assert(cN > 5 * cT, `薄板/厚板未归一化远端 cost 比 ${fmt(cN / cT, 2)} ≤ 5（h³ 流导差应显著）`);
  assert(fN.tauMax > fT.tauMax, `薄板 tauMax=${fN.tauMax} ≤ 厚板 ${fT.tauMax}（应更大）`);
  return `同 55mm 流长（中心线）：厚 6mm cost=${fmt(cT, 2)}，薄 1.5mm cost=${fmt(cN, 2)}（×${fmt(cN / cT, 1)}）；` +
    `tauMax 薄 ${fmt(fN.tauMax, 1)} > 厚 ${fmt(fT.tauMax, 1)}`;
});

// ------------------------------------------------------------------ T5 双浇口唔会慢过单浇口

test('T5 multi-gate-not-slower', () => {
  assert(r1 && r2, 'T1/T2 未通过');
  // 全管线：tFill = V/V̇ 同体积 → 双浇口 ≤ 单浇口（相等）
  assert(r2.tFill <= r1.tFill + 1e-12, `双浇口 tFill=${r2.tFill} > 单浇口 ${r1.tFill}`);
  // 未归一化到达成本：多源 Dijkstra tauMax 必然 ≤ 单源（呢度端-端双浇口应严格 <）
  const g = voxelize(plate.vertices, plate.triangles, 40);
  const hh = _internals.distanceTransform(g);
  const gA = 0 + 40 * 7;  // i=0,  j=7, k=0
  const gB = 39 + 40 * 7; // i=39, j=7, k=0
  const f1 = _internals.dijkstraFill(g, hh, [gA], 1.0);
  const f2 = _internals.dijkstraFill(g, hh, [gA, gB], 1.0);
  assert(f1.nReached === g.nVox && f2.nReached === g.nVox, `连通数 ${f1.nReached}/${f2.nReached}，期望 ${g.nVox}`);
  assert(f2.tauMax < f1.tauMax, `双源 tauMax=${f2.tauMax} ≥ 单源 ${f1.tauMax}（应严格更细）`);
  return `单源 cost=${fmt(f1.tauMax, 3)} → 双源 ${fmt(f2.tauMax, 3)}；tFill ${fmt(r2.tFill, 4)}s ≤ ${fmt(r1.tFill, 4)}s`;
});

// ------------------------------------------------------------------ T6 性能：res 40 全管线 < 3s

test('T6 perf-res40-under-3s', () => {
  const t0 = Date.now();
  const r = runMoldFlow({
    vertices: plate.vertices, triangles: plate.triangles,
    gates: [[-50, 0, 1.5]], material: 'PP', resolution: 40,
  });
  const ms = Date.now() - t0;
  assert(r.nVox > 0, 'nVox=0');
  assert(ms < 3000, `全管线 ${ms}ms ≥ 3000ms`);
  return `res40 全管线 ${ms}ms（< 3000ms，nVox=${r.nVox}）`;
});

// ------------------------------------------------------------------ T7 守卫：中文 throw

test('T7 guards-throw-chinese', () => {
  let threw = '';
  try {
    runMoldFlow({ vertices: plate.vertices, triangles: plate.triangles, gates: [[0, 0, 0]], material: 'PEEK', resolution: 20 });
  } catch (e) { threw = e instanceof Error ? e.message : String(e); }
  assert(/未知材料/.test(threw), `未知材料应 throw 中文错误，实际 "${threw}"`);
  const msgA = threw;
  threw = '';
  try {
    runMoldFlow({ vertices: plate.vertices, triangles: plate.triangles, gates: [], material: 'ABS' });
  } catch (e) { threw = e instanceof Error ? e.message : String(e); }
  assert(/浇口/.test(threw), `空浇口应 throw 中文错误，实际 "${threw}"`);
  return `未知材料→"${msgA}"；空浇口→"${threw}"`;
});

// ------------------------------------------------------------------ 汇总

console.log('\n================ 结果一览 ================');
let nFail = 0;
for (const r of rows) {
  if (!r.pass) nFail++;
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  (${r.ms}ms)`);
  if (r.detail) console.log(`        ${r.detail}`);
}
console.log(`==========================================`);
console.log(`${rows.length - nFail}/${rows.length} 通过${nFail ? `，${nFail} 个失败` : ' — 全部通过'}`);
process.exit(nFail ? 1 : 0);
