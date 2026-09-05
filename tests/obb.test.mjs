// obb.test.mjs — 定向最小包围盒纯数学模块 (src/cad/obb.ts) 解析验证套件
// 跑法: npx -y tsx tests/obb.test.mjs   (喺 C:\ClaudeCode\webcad 目录)
// 失败 → exit 1; 末尾输出 PASS/FAIL 总表。全部对照 ANALYTIC (闭式) 真值, 唔系自比。
//
// 注: PCA-OBB 系近似最小体积 (模块注释已老实声明), 故"恢复尺寸"类断言用"几个百分点"容差; 而
// 正交性 / AABB 退化 / volume≤AABB 呢啲结构性质系严格成立, 收紧容差。
//
// 验证目标:
//   T1 旋转盒 10×4×2 绕 Z 转 30°:  恢复 size 排序 ≈ [10,4,2] (几个 %), volume ≈ 80, 轴正交单位
//   T2 轴对齐盒:                   OBB == AABB (中心/尺寸/体积逐项命中)
//   T3 OBB volume ≤ 同盒嘅 AABB volume (旋转后):  PCA 盒唔会差过松垮 AABB
//   T4 退化 (空/单点/共线/共面):   唔崩, 返合法正交基, 退化轴 half=0, 体积=0
//   T5 轴正交性通用:               任意点云出嘅三轴两两点积≈0、长度≈1、右手系

import { orientedBBox } from '../src/cad/obb.ts';

const rows = [];
let notes = [];
function note(s) { notes.push(s); console.log(`    ${s}`); }
function ok(cond, msg) { if (!cond) throw new Error(msg); note('OK  ' + msg); }
function abs(actual, expected, msg, tol = 1e-9) {
  const err = Math.abs(actual - expected);
  if (!(err <= tol)) throw new Error(`${msg}: 期望 ${expected}, 实际 ${actual} (绝对误差 ${err.toExponential(3)} > tol ${tol})`);
  note(`OK  ${msg}: ${fmt(actual)} ≈ ${fmt(expected)} (abs ${err.toExponential(2)})`);
}
function rel(actual, expected, msg, tol = 1e-9) {
  const denom = Math.max(1, Math.abs(expected));
  const err = Math.abs(actual - expected) / denom;
  if (!(err <= tol)) throw new Error(`${msg}: 期望 ${expected}, 实际 ${actual} (相对误差 ${err.toExponential(3)} > tol ${tol})`);
  note(`OK  ${msg}: ${fmt(actual)} ≈ ${fmt(expected)} (rel ${err.toExponential(2)})`);
}
function fmt(x) { return Math.abs(x) >= 1e6 || (x !== 0 && Math.abs(x) < 1e-4) ? x.toExponential(4) : x.toFixed(6); }
function test(name, fn) {
  console.log(`\n## ${name}`);
  notes = [];
  try { fn(); rows.push({ name, pass: true, info: '' }); }
  catch (e) { rows.push({ name, pass: false, info: String(e.message) }); console.log(`    !! FAIL: ${e.message}`); }
}

// ── helper: 生成轴对齐盒嘅 8 个角点 (扁平 vertices), 中心 (cx,cy,cz), 全长 a×b×c ──
function boxCorners(a, b, c, cx = 0, cy = 0, cz = 0) {
  const hx = a / 2, hy = b / 2, hz = c / 2;
  const v = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    v.push(cx + sx * hx, cy + sy * hy, cz + sz * hz);
  }
  return v;
}
// 绕 Z 转 deg° 嘅顶点云 (绕原点旋转)。
function rotateZ(verts, deg) {
  const t = (deg * Math.PI) / 180, ct = Math.cos(t), st = Math.sin(t);
  const out = [];
  for (let i = 0; i < verts.length; i += 3) {
    const x = verts[i], y = verts[i + 1], z = verts[i + 2];
    out.push(ct * x - st * y, st * x + ct * y, z);
  }
  return out;
}
function dot3(u, v) { return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]; }
function len3(u) { return Math.sqrt(dot3(u, u)); }
function det3(A) {
  // A 系 3 行 (这里传三条轴做行)。
  return A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1])
       - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0])
       + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
}
// 断言三轴系正交右手单位基。
function assertOrthonormal(axes, tol = 1e-9) {
  for (let k = 0; k < 3; k++) abs(len3(axes[k]), 1, `轴${k} 长度 = 1`, tol);
  abs(dot3(axes[0], axes[1]), 0, '轴0·轴1 = 0', tol);
  abs(dot3(axes[1], axes[2]), 0, '轴1·轴2 = 0', tol);
  abs(dot3(axes[0], axes[2]), 0, '轴0·轴2 = 0', tol);
  // det = +1 → 右手系 (允许 ±1? 不: 模块构造保证右手, 严格 +1)。
  abs(det3(axes), 1, '三轴行列式 = +1 (右手正交基)', tol);
}

// ============ T1 旋转盒 10×4×2 绕 Z 转 30° → 恢复尺寸/体积/正交 ============
test('T1 旋转盒 10×4×2 @Z30° (恢复尺寸 + 体积 + 正交)', () => {
  const base = boxCorners(10, 4, 2, 0, 0, 0);
  const rot = rotateZ(base, 30);
  const obb = orientedBBox(rot);
  // 恢复 size 排序 ≈ [10,4,2]。PCA 对纯角点盒应恢复得好准 (盒角点协方差精确对齐主轴) — 用 1% 容差。
  const sortedSize = [...obb.size].sort((p, q) => q - p);
  rel(sortedSize[0], 10, '恢复 size[最大] ≈ 10', 1e-2);
  rel(sortedSize[1], 4, '恢复 size[中] ≈ 4', 1e-2);
  rel(sortedSize[2], 2, '恢复 size[最小] ≈ 2', 1e-2);
  // 体积 ≈ 80 (= 10·4·2)。
  rel(obb.volume, 80, '体积 ≈ 80', 2e-2);
  // 中心 ≈ 原点 (盒居中再绕原点转 → 中心不动)。
  abs(obb.center[0], 0, '中心 x ≈ 0', 1e-6);
  abs(obb.center[1], 0, '中心 y ≈ 0', 1e-6);
  abs(obb.center[2], 0, '中心 z ≈ 0', 1e-6);
  // 轴正交单位。
  assertOrthonormal(obb.axes, 1e-9);
  // 进一步: 最长轴应同 X 转 30° 后嘅方向 (cos30,sin30,0) 平行 (符号无关 → |点积|≈1)。
  // 先揾返最长 size 对应嘅轴。
  let li = 0; for (let k = 1; k < 3; k++) if (obb.size[k] > obb.size[li]) li = k;
  const longAxis = obb.axes[li];
  const expDir = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0];
  abs(Math.abs(dot3(longAxis, expDir)), 1, '最长轴 ∥ X@30° (|点积|≈1)', 1e-6);
  // Z 轴应被恢复 (某条轴 ≈ ±[0,0,1])。
  const hasZ = obb.axes.some((ax) => Math.abs(Math.abs(ax[2]) - 1) < 1e-6);
  ok(hasZ, '某条轴 ≈ ±世界 Z (旋转只绕 Z)');
});

// ============ T2 轴对齐盒 → OBB == AABB ============
test('T2 轴对齐盒 (OBB == AABB)', () => {
  // 用 6×8×14 轴对齐盒, 中心 (1,2,3) (非原点 → 验中心还原)。
  const a = 6, b = 8, c = 14, cx = 1, cy = 2, cz = 3;
  const verts = boxCorners(a, b, c, cx, cy, cz);
  const obb = orientedBBox(verts);
  // 解析 AABB: 尺寸 = [a,b,c] (某排列), 体积 = a·b·c, 中心 = (cx,cy,cz)。
  const aabbVol = a * b * c;
  rel(obb.volume, aabbVol, '体积 == AABB 体积 a·b·c', 1e-9);
  // size 排序应严格命中 [a,b,c] 排序 (轴对齐 → PCA 主轴 = 世界轴)。
  const ss = [...obb.size].sort((p, q) => q - p);
  const want = [a, b, c].sort((p, q) => q - p);
  rel(ss[0], want[0], 'size 排序[0] == AABB', 1e-9);
  rel(ss[1], want[1], 'size 排序[1] == AABB', 1e-9);
  rel(ss[2], want[2], 'size 排序[2] == AABB', 1e-9);
  // 中心严格还原。
  abs(obb.center[0], cx, '中心 x == AABB cx', 1e-9);
  abs(obb.center[1], cy, '中心 y == AABB cy', 1e-9);
  abs(obb.center[2], cz, '中心 z == AABB cz', 1e-9);
  // 轴对齐 → 三轴各自 ∥ 某世界轴 (每行/列只有一个 ≈±1 分量)。
  for (let k = 0; k < 3; k++) {
    const ax = obb.axes[k];
    const big = Math.max(Math.abs(ax[0]), Math.abs(ax[1]), Math.abs(ax[2]));
    abs(big, 1, `轴${k} ∥ 世界轴 (最大分量 ≈ 1)`, 1e-9);
  }
  assertOrthonormal(obb.axes, 1e-9);
});

// ============ T3 OBB volume ≤ 同盒旋转后嘅 AABB volume ============
test('T3 OBB 体积 ≤ 旋转盒 AABB 体积', () => {
  // 旋转盒嘅 *世界 AABB* 会松垮变大; PCA-OBB 应贴返真盒 → 体积 ≤ AABB 体积。
  const base = boxCorners(10, 4, 2, 0, 0, 0);
  const rot = rotateZ(base, 30);
  const obb = orientedBBox(rot);
  // 算旋转点云嘅世界 AABB 体积。
  let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  for (let i = 0; i < rot.length; i += 3) {
    mnx = Math.min(mnx, rot[i]); mxx = Math.max(mxx, rot[i]);
    mny = Math.min(mny, rot[i + 1]); mxy = Math.max(mxy, rot[i + 1]);
    mnz = Math.min(mnz, rot[i + 2]); mxz = Math.max(mxz, rot[i + 2]);
  }
  const aabbVol = (mxx - mnx) * (mxy - mny) * (mxz - mnz);
  // OBB 体积应严格小过松垮 AABB (30° 旋转令 AABB 明显胀大)。容许极小浮点裕量。
  ok(obb.volume <= aabbVol + 1e-9, `OBB 体积 ${fmt(obb.volume)} ≤ AABB 体积 ${fmt(aabbVol)}`);
  ok(obb.volume < aabbVol * 0.95, `OBB 体积明显细过 AABB (省料): ${fmt(obb.volume)} < ${fmt(aabbVol)}`);
  note(`AABB 体积 = ${fmt(aabbVol)}, OBB 体积 = ${fmt(obb.volume)}, 省料比 ${(obb.volume / aabbVol).toFixed(4)}`);
});

// ============ T4 退化输入 (空/单点/共线/共面) graceful ============
test('T4 退化输入 (空/单点/共线/共面 → 唔崩, 合法正交基)', () => {
  // 空。
  const e = orientedBBox([]);
  abs(e.volume, 0, '空输入 体积 = 0', 0);
  ok(e.half.every((h) => h === 0), '空输入 half 全 0');
  assertOrthonormal(e.axes, 1e-12);
  // 单点。
  const s = orientedBBox([5, 6, 7]);
  abs(s.volume, 0, '单点 体积 = 0', 0);
  abs(s.center[0], 5, '单点 中心 x = 5', 1e-12);
  abs(s.center[1], 6, '单点 中心 y = 6', 1e-12);
  abs(s.center[2], 7, '单点 中心 z = 7', 1e-12);
  assertOrthonormal(s.axes, 1e-12);
  // 共线 (沿一条斜方向排嘅点)。
  const col = [];
  for (let i = -3; i <= 3; i++) col.push(i, 2 * i, -i);  // 全部喺方向 (1,2,-1)
  const cl = orientedBBox(col);
  abs(cl.volume, 0, '共线 体积 = 0 (退化轴 half=0)', 1e-9);
  // 至少两条半边长 ≈ 0 (秩 1)。
  const zeroH = cl.half.filter((h) => h < 1e-9).length;
  ok(zeroH >= 2, `共线 → ≥2 条 half ≈ 0 (实得 ${zeroH})`);
  assertOrthonormal(cl.axes, 1e-9);
  // 最长轴应 ∥ (1,2,-1)/|..|。
  let li = 0; for (let k = 1; k < 3; k++) if (cl.half[k] > cl.half[li]) li = k;
  const dir = [1, 2, -1]; const dl = len3(dir); const dirN = dir.map((x) => x / dl);
  abs(Math.abs(dot3(cl.axes[li], dirN)), 1, '共线 最长轴 ∥ 排布方向', 1e-7);
  // 共面 (z=0 平面上嘅一坨点)。
  const cop = [];
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) cop.push(i * 3, j * 5, 0);
  const cp = orientedBBox(cop);
  abs(cp.volume, 0, '共面 体积 = 0 (法向 half=0)', 1e-9);
  const zeroH2 = cp.half.filter((h) => h < 1e-9).length;
  ok(zeroH2 >= 1, `共面 → ≥1 条 half ≈ 0 (实得 ${zeroH2})`);
  assertOrthonormal(cp.axes, 1e-9);
  // 共面盒嘅非退化两轴量度应 ≈ [12, 20] (x∈[-6,6]=12, y∈[-10,10]=20) 嘅某排列。
  const nonZero = cp.size.filter((sz) => sz > 1e-6).sort((p, q) => q - p);
  ok(nonZero.length === 2, '共面 → 恰好 2 条非零边');
  rel(nonZero[0], 20, '共面 长边 ≈ 20', 1e-6);
  rel(nonZero[1], 12, '共面 短边 ≈ 12', 1e-6);
});

// ============ T5 任意点云 轴正交性 (通用结构性质) ============
test('T5 任意点云 (随机斜云 → 轴严格正交单位右手)', () => {
  // 确定性伪随机点云 (LCG, 唔靠外部 random → 可复现)。
  let seed = 1234567;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const verts = [];
  for (let i = 0; i < 200; i++) {
    // 生成一坨拉长嘅斜椭球点 (各轴尺度唔同 + 任意整体偏移), 确保协方差非退化。
    const u = rng() * 2 - 1, v = rng() * 2 - 1, w = rng() * 2 - 1;
    const x = 20 * u + 3 * v;
    const y = 5 * v - 2 * w;
    const z = 1.5 * w + 0.5 * u;
    verts.push(x + 7, y - 4, z + 11);
  }
  const obb = orientedBBox(verts);
  assertOrthonormal(obb.axes, 1e-9);
  ok(obb.volume > 0, '非退化云 → 体积 > 0');
  // 所有点都应落喺盒内 (投影到每条轴, |相对中心投影| ≤ half + 极小裕量)。
  let allInside = true; let worst = 0;
  for (let i = 0; i < verts.length; i += 3) {
    const dx = verts[i] - obb.center[0], dy = verts[i + 1] - obb.center[1], dz = verts[i + 2] - obb.center[2];
    for (let k = 0; k < 3; k++) {
      const ax = obb.axes[k];
      const p = Math.abs(dx * ax[0] + dy * ax[1] + dz * ax[2]);
      const over = p - obb.half[k];
      if (over > worst) worst = over;
      if (over > 1e-6) allInside = false;
    }
  }
  ok(allInside, `所有点落喺 OBB 内 (最大越界 ${worst.toExponential(2)})`);
});

// ============ 总表 ============
console.log('\n========== PASS/FAIL 总表 ==========');
let nFail = 0;
for (const r of rows) {
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : ' — ' + r.info}`);
  if (!r.pass) nFail++;
}
console.log('====================================');
console.log(nFail === 0 ? `全部 ${rows.length}/${rows.length} 组通过` : `${rows.length - nFail}/${rows.length} 组通过 (${nFail} 组失败)`);
process.exit(nFail === 0 ? 0 : 1);
