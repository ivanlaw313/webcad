// prestressed-modal.test.mjs — S183 runVoxelPrestressedModal 物理校验（应力刚化模态）
// 跑：cd C:\ClaudeCode\webcad && npx -y tsx tests/prestressed-modal.test.mjs
// 核心：验【符号】—— 受拉预载固有频率必【升】，受压必【降】、近屈曲载荷 f₁→0。
// 用屈曲临界载荷 Pcr 做免费交叉校验（预应力模态同屈曲共用同一 Kg）。
import { runVoxelModal, runVoxelPrestressedModal, runVoxelBuckling } from '../src/analysis/voxelfea.ts';

let fail = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };

// 悬臂柱 40(X)×8×8，固定 x=0，预载面 x=40，轴向（±X）
function boxMesh(sx, sy, sz) {
  const vertices = [];
  for (let b = 0; b < 8; b++) vertices.push((b & 1) ? sx : 0, (b & 2) ? sy : 0, (b & 4) ? sz : 0);
  const triangles = [0,1,3, 0,3,2, 4,5,7, 4,7,6, 0,4,5, 0,5,1, 2,3,7, 2,7,6, 0,2,6, 0,6,4, 1,5,7, 1,7,3];
  return { vertices, triangles };
}
const mesh = boxMesh(40, 8, 8);
const mat = { E: 200000, nu: 0.3, rho: 7.85, resolution: 16 };
const fixed = { point: [0, 4, 4], normal: [1, 0, 0] };
const load = { point: [40, 4, 4], normal: [1, 0, 0] };

// ---- 0. 基线（无预载）模态
const base = runVoxelModal({ ...mesh, ...mat, fixed, nModes: 3 });
ok(base.ok, `基线模态 OK (${base.error || ''})`);
const f0 = base.ok ? base.freqs[0] : 0;
ok(f0 > 0, `基线 f₁ > 0 (${f0.toFixed(1)} Hz)`);

// ---- 1. 屈曲临界载荷 Pcr（压向 −X），做交叉校验基准
const buck = runVoxelBuckling({ ...mesh, ...mat, fixed, load, force: [-1000, 0, 0] });
ok(buck.ok && buck.lambda1 > 0, `屈曲 OK 且 λ₁>0（压向会屈曲）λ₁=${buck.ok ? buck.lambda1.toFixed(2) : 'n/a'}`);
const Pcr = buck.ok ? buck.Pcr : 0;   // = λ₁·1000 N
ok(Pcr > 0, `Pcr > 0 (${(Pcr/1000).toFixed(1)} kN)`);

// ---- 2. 受拉预载 0.6·Pcr（+X，拉离固定端）→ f₁ 必【升】
const tens = runVoxelPrestressedModal({ ...mesh, ...mat, fixed, load, force: [0.6 * Pcr, 0, 0], nModes: 3 });
ok(tens.ok, `受拉预应力模态 OK (${tens.error || ''})`);
const fT = tens.ok ? tens.freqs[0] : 0;
ok(fT > f0 * 1.08, `受拉 f₁ 升（${fT.toFixed(1)} > 基线 ${f0.toFixed(1)}，应力刚化）`);

// ---- 3. 受压预载 0.6·Pcr（−X）→ f₁ 必【降】（呢个就系符号正确性关键：用错 −Kg 会变升）
const comp = runVoxelPrestressedModal({ ...mesh, ...mat, fixed, load, force: [-0.6 * Pcr, 0, 0], nModes: 3 });
ok(comp.ok, `受压预应力模态 OK (${comp.error || ''})`);
const fC = comp.ok ? comp.freqs[0] : 0;
ok(fC < f0 * 0.92, `受压 f₁ 降（${fC.toFixed(1)} < 基线 ${f0.toFixed(1)}，应力软化）`);
ok(fC < fT, `受压 f₁ < 受拉 f₁（${fC.toFixed(1)} < ${fT.toFixed(1)}，单调）`);

// ---- 4. 受压近临界 0.9·Pcr → f₁ 趋 0（屈曲交叉校验）
const near = runVoxelPrestressedModal({ ...mesh, ...mat, fixed, load, force: [-0.9 * Pcr, 0, 0], nModes: 3 });
ok(near.ok, `近临界受压模态 OK (${near.error || ''})`);
const fN = near.ok ? near.freqs[0] : 0;
ok(fN < fC, `0.9·Pcr 比 0.6·Pcr 更软（${fN.toFixed(1)} < ${fC.toFixed(1)}）`);
ok(fN < f0 * 0.55, `近临界 f₁ 大幅趋 0（${fN.toFixed(1)} < ${(f0*0.55).toFixed(1)}，逼近屈曲）`);

// ---- 5. Galef 近似定性核对：f(P)² ≈ f₀²·(1 ± P/Pcr)。受压 0.6 → ratio² ≈ 0.4
const r2comp = (fC / f0) ** 2;
ok(r2comp > 0.2 && r2comp < 0.65, `受压 (f/f₀)² ≈ 1−0.6=0.4（实际 ${r2comp.toFixed(2)}，Galef 趋势）`);

// ---- 6. 退化守卫
const z1 = runVoxelPrestressedModal({ ...mesh, ...mat, fixed, load, force: [0, 0, 0], nModes: 3 });
ok(!z1.ok && /合力为零|force/.test(z1.error || ''), '零预载抛错（需施加预载）');
const z2 = runVoxelPrestressedModal({ ...mesh, ...mat, fixed, force: [-1000, 0, 0], nModes: 3 });
ok(!z2.ok, '缺 load 面抛错');

console.log(`\n基线 f₁=${f0.toFixed(1)}Hz · 拉0.6Pcr=${fT.toFixed(1)} · 压0.6Pcr=${fC.toFixed(1)} · 压0.9Pcr=${fN.toFixed(1)} · Pcr=${(Pcr/1000).toFixed(1)}kN`);
console.log(fail === 0 ? '全部通过' : `${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
