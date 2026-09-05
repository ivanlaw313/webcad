// thermal-1d-conduction-probe.mjs — ADDITIVE probe（唔郁核心）
// 目的：验证 runVoxelThermal 稳态导热 vs 1D 解析：
//   T(x)=Thot+(Tcold-Thot)x/L 线性梯度；总热流 Q = k·A·ΔT/L。
// 亦验证 runVoxelThermalStress 单元温度线性 + 单轴热应力 σ=EαΔT。
import { _internals } from '../src/analysis/voxelfea.ts';
const { runVoxelThermal, runVoxelThermalStress } = _internals;

function boxMesh(sx, sy, sz) {
  const vertices = [];
  for (let b = 0; b < 8; b++) vertices.push((b & 1) ? sx : 0, (b & 2) ? sy : 0, (b & 4) ? sz : 0);
  const triangles = [
    0,1,3, 0,3,2, 4,5,7, 4,7,6, 0,4,5, 0,5,1,
    2,3,7, 2,7,6, 0,2,6, 0,6,4, 1,5,7, 1,7,3,
  ];
  return { vertices, triangles };
}

const L = 100, W = 20, Hh = 20;      // mm
const k = 50;                         // W/mK
const Thot = 100, Tcold = 0;          // °C
const m = boxMesh(L, W, Hh);

// ---- 稳态导热：温度沿 x 应线性，两端定温面 x=0(hot) / x=L(cold) ----
const rt = runVoxelThermal({
  vertices: m.vertices, triangles: m.triangles,
  hot:  { point: [0, 0, 0], normal: [1, 0, 0] },
  cold: { point: [L, 0, 0], normal: [1, 0, 0] },
  Thot, Tcold, k, resolution: 24,
});
if (!rt.ok) { console.log('THERMAL_FAIL ' + rt.error); process.exit(1); }

// 检查线性度：对每个体素，analytic T = Thot + (Tcold-Thot)*(xc/L)
// xc = centers[i*3]（CAD x）。收集最大绝对/相对偏差。
let maxAbs = 0, sumAbs = 0, n = 0;
const midErr = [];
for (let i = 0; i < rt.nVox; i++) {
  const xc = rt.centers[i * 3];
  const Ta = Thot + (Tcold - Thot) * (xc / L);
  const Tn = rt.temp[i];
  const e = Math.abs(Tn - Ta);
  maxAbs = Math.max(maxAbs, e); sumAbs += e; n++;
  if (Math.abs(xc - L / 2) < 3) midErr.push(Tn);
}
const meanAbs = sumAbs / n;
// 中点温度应 ≈ (Thot+Tcold)/2 = 50
const midMean = midErr.length ? midErr.reduce((a, b) => a + b, 0) / midErr.length : NaN;

// 总热流 Q 解析 = k[W/mK]·A[m^2]·ΔT / L[m]
// A = W*Hh mm^2 = (20e-3*20e-3) m^2；L = 100e-3 m；ΔT=100
const A_m2 = (W * 1e-3) * (Hh * 1e-3);
const L_m = L * 1e-3;
const Qana = k * A_m2 * (Thot - Tcold) / L_m;   // W
const Qnum = rt.heatFlowW;
const relQ = Math.abs(Qnum - Qana) / Qana * 100;

console.log('=== 1D steady conduction ===');
console.log(`nVox=${rt.nVox} tMin=${rt.tMin.toFixed(3)} tMax=${rt.tMax.toFixed(3)} converged=${rt.converged}`);
console.log(`Tlinear maxAbsErr=${maxAbs.toExponential(3)}°C meanAbsErr=${meanAbs.toExponential(3)}°C  (midplane meanT=${midMean.toFixed(4)}, analytic 50)`);
console.log(`Q_num=${Qnum.toFixed(5)} W  Q_analytic=${Qana.toFixed(5)} W  relErr=${relQ.toFixed(3)}%`);

// ---- 耦合热应力：单轴热应力 σ=EαΔT (均匀升温，双端锁) ----
const E = 200000, nu = 0.3, cte = 12, DT = 50;
const SIG = E * (cte * 1e-6) * DT;  // 120 MPa
const rs = runVoxelThermalStress({
  vertices: m.vertices, triangles: m.triangles,
  fixed:  { point: [0, 0, 0], normal: [1, 0, 0] },
  fixed2: { point: [L, 0, 0], normal: [1, 0, 0] },
  hot:  { point: [0, 0, 0], normal: [1, 0, 0] },
  cold: { point: [L, 0, 0], normal: [1, 0, 0] },
  Thot: 20 + DT, Tcold: 20 + DT, Tref: 20,
  E, nu, cte, k, resolution: 24,
});
if (!rs.ok) { console.log('STRESS_FAIL ' + rs.error); process.exit(1); }
const relSig = Math.abs(rs.vmMax - SIG) / SIG * 100;
console.log('=== uniform-DT constrained-bar thermal stress ===');
console.log(`vmMax=${rs.vmMax.toFixed(4)} MPa  analytic E*a*DT=${SIG.toFixed(4)} MPa  relErr=${relSig.toFixed(3)}%  converged=${rs.converged}`);

// machine-readable summary line
console.log(`SUMMARY relQpct=${relQ.toFixed(4)} TlinearMaxAbs=${maxAbs.toExponential(3)} midT=${midMean.toFixed(4)} relSigmaPct=${relSig.toFixed(4)} vmMax=${rs.vmMax.toFixed(4)}`);
