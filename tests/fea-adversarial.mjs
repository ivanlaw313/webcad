// fea-adversarial.mjs — independent physics verification of src/analysis/voxelfea.ts
// (does NOT reuse the bundled suite's tests; only reuses the transpile trick + boxMesh shape)
//
// Run from C:\ClaudeCode\webcad:  node tests/fea-adversarial.mjs
//
// NOTE: after tsc transpile we apply a PURELY ADDITIVE patch to the emitted JS:
// the result object additionally exposes sol.u / nodeGrid / nnx / nny so node
// displacements can be inspected (needed for the Poisson-bulge measurement).
// No computation is altered.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

console.log('[adv] transpile voxelfea.ts -> .tmp-fea/');
execSync(
  'npx tsc src/analysis/voxelfea.ts --outDir .tmp-fea --module es2020 --target es2020 --strict false --skipLibCheck --ignoreConfig',
  { cwd: root, stdio: 'inherit' },
);

const jsPath = path.join(root, '.tmp-fea', 'voxelfea.js');
let src = readFileSync(jsPath, 'utf8');
// 标记 = FeaResult 字面量稳定前缀（注入只係追加 property，落喺 vmMaxAt, 之后即可）。
// S16x 后 return 由 …vmMaxAt, dispMax, 变 …vmMaxAt, vmMaxE, dispMax, disp, dispVec, → 标记缩到 vmMaxAt, 跟新布局。
const marker = 'ok: true, warnings, h, nVox, nDof, centers, vm, vmMax, vmMaxAt,';
const nOcc = src.split(marker).length - 1;
// NOTE: this FeaResult-shape marker now appears in BOTH runVoxelFea AND runVoxelThermalStress
// (the latter reuses the same result object). We only need to instrument runVoxelFea — which is
// the FIRST occurrence — so String.replace (first-match only) is exactly right. Guard: need ≥1.
if (nOcc < 1) {
  console.error(`[adv] FATAL: patch marker found ${nOcc} times (expected ≥1) — emitted JS layout changed`);
  process.exit(2);
}
src = src.replace(marker, marker + ' u: sol.u, _nodeGrid: nodeGrid, _nnx: nnx, _nny: nny,');
const patchedPath = path.join(root, '.tmp-fea', 'voxelfea-adv.js');
writeFileSync(patchedPath, src);
const { runVoxelFea } = await import(pathToFileURL(patchedPath).href);

// ---------------------------------------------------------------- helpers

let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
  if (!cond) failures++;
}
function info(name, detail) { console.log(`INFO  ${name}  ${detail}`); }
function relDiff(a, b) { return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300); }
function f(x, d = 8) { return Number(x).toPrecision(d); }

/** watertight box [0,sx]x[0,sy]x[0,sz], 8 verts / 12 tris (same topology as bundled suite). */
function boxMesh(sx, sy, sz) {
  const vertices = [];
  for (let b = 0; b < 8; b++) vertices.push((b & 1) ? sx : 0, (b & 2) ? sy : 0, (b & 4) ? sz : 0);
  const triangles = [
    0, 1, 3, 0, 3, 2,
    4, 5, 7, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    2, 3, 7, 2, 7, 6,
    0, 2, 6, 0, 6, 4,
    1, 5, 7, 1, 7, 3,
  ];
  return { vertices, triangles };
}

function runBox(dims, fixedPlane, loadPlane, force, E, nu, resolution, cgTol, maxIter) {
  const { vertices, triangles } = boxMesh(...dims);
  const r = runVoxelFea({
    vertices, triangles,
    fixed: fixedPlane, load: loadPlane, force,
    E, nu, resolution, cgTol, maxIter,
  });
  if (!r.ok) throw new Error(`runVoxelFea failed: ${r.error}`);
  return r;
}

// ================================================================ EXP 1: orientation invariance
// cantilever 40x8x8, E=2000 nu=0.3, |F|=50. res=20 -> h=2, exact 20x4x4 / 4x20x4 voxel beams.
console.log('\n=== EXP1 orientation invariance (cantilever 40x8x8, E=2000, nu=0.3, F=50, res=20, cgTol=1e-10) ===');
const E1 = 2000, NU1 = 0.3, RES1 = 20, TOL1 = 1e-10, IT1 = 60000;

const A = runBox([40, 8, 8],
  { point: [0, 0, 0], normal: [1, 0, 0] }, { point: [40, 0, 0], normal: [1, 0, 0] },
  [0, 0, -50], E1, NU1, RES1, TOL1, IT1);
const B = runBox([8, 40, 8],
  { point: [0, 0, 0], normal: [0, 1, 0] }, { point: [0, 40, 0], normal: [0, 1, 0] },
  [0, 0, -50], E1, NU1, RES1, TOL1, IT1);
const C = runBox([40, 8, 8],
  { point: [0, 0, 0], normal: [1, 0, 0] }, { point: [40, 0, 0], normal: [1, 0, 0] },
  [0, 50, 0], E1, NU1, RES1, TOL1, IT1);

info('A beam-x load-z', `nVox=${A.nVox} dispMax=${f(A.dispMax)} vmMax=${f(A.vmMax)} iters=${A.iters} res=${A.residual.toExponential(2)} conv=${A.converged}`);
info('B beam-y load-z', `nVox=${B.nVox} dispMax=${f(B.dispMax)} vmMax=${f(B.vmMax)} iters=${B.iters} res=${B.residual.toExponential(2)} conv=${B.converged}`);
info('C beam-x load+y', `nVox=${C.nVox} dispMax=${f(C.dispMax)} vmMax=${f(C.vmMax)} iters=${C.iters} res=${C.residual.toExponential(2)} conv=${C.converged}`);

check('EXP1 dispMax A~B', relDiff(A.dispMax, B.dispMax) < 1e-5, `relDiff=${relDiff(A.dispMax, B.dispMax).toExponential(3)}`);
check('EXP1 vmMax   A~B', relDiff(A.vmMax, B.vmMax) < 1e-5, `relDiff=${relDiff(A.vmMax, B.vmMax).toExponential(3)}`);
check('EXP1 dispMax A~C', relDiff(A.dispMax, C.dispMax) < 1e-5, `relDiff=${relDiff(A.dispMax, C.dispMax).toExponential(3)}`);
check('EXP1 vmMax   A~C', relDiff(A.vmMax, C.vmMax) < 1e-5, `relDiff=${relDiff(A.vmMax, C.vmMax).toExponential(3)}`);

// ================================================================ EXP 2: Poisson effect
// column 10x10x40 along z, clamped z=0, axial compression F=-100 N at z=40 face.
// sigma = 1 MPa, eps_axial = 5e-4. Lateral bulge at x=10 face (5mm off axis):
//   u_x = nu * eps_axial * 5  = 7.5e-4 mm for nu=0.3 ; ~0 for nu=0.
// measured on x=10 face, mid-y, z in [26,34] (away from clamp & load bands).
console.log('\n=== EXP2 Poisson effect (column 10x10x40, E=2000, F=[0,0,-100], res=40 -> h=1) ===');
function lateralBulge(r) {
  const h = r.h, nnx = r._nnx, nny = r._nny;
  const nNodes = r._nodeGrid.length;
  let sum = 0, n = 0;
  for (let cId = 0; cId < nNodes; cId++) {
    const g = r._nodeGrid[cId];
    const ix = g % nnx, iy = ((g / nnx) | 0) % nny, iz = (g / (nnx * nny)) | 0;
    // box min corner is (0,0,0) -> node coords = (ix*h, iy*h, iz*h)
    if (ix * h === 10 && iy * h === 5 && iz * h >= 26 && iz * h <= 34) {
      sum += r.u[cId * 3]; n++;
    }
  }
  if (n === 0) throw new Error('no measurement nodes found');
  return { avg: sum / n, n };
}
const P3 = runBox([10, 10, 40],
  { point: [0, 0, 0], normal: [0, 0, 1] }, { point: [0, 0, 40], normal: [0, 0, 1] },
  [0, 0, -100], 2000, 0.3, 40, 1e-10, 60000);
const P0 = runBox([10, 10, 40],
  { point: [0, 0, 0], normal: [0, 0, 1] }, { point: [0, 0, 40], normal: [0, 0, 1] },
  [0, 0, -100], 2000, 0.0, 40, 1e-10, 60000);
const b3 = lateralBulge(P3), b0 = lateralBulge(P0);
const bulgeExp = 0.3 * (100 / (100 * 2000)) * 5; // 7.5e-4 mm
info('nu=0.3', `nVox=${P3.nVox} dispMax=${f(P3.dispMax)} (axial FL/EA=0.02) lateral avg u_x(x=10face)=${b3.avg.toExponential(5)} over ${b3.n} nodes, expected ${bulgeExp.toExponential(3)}`);
info('nu=0.0', `dispMax=${f(P0.dispMax)} lateral avg u_x=${b0.avg.toExponential(5)}`);
check('EXP2 bulge nu=0.3 ~ nu*eps*halfwidth', Math.abs(b3.avg / bulgeExp - 1) < 0.15,
  `measured=${b3.avg.toExponential(5)} expected=${bulgeExp.toExponential(3)} ratio=${(b3.avg / bulgeExp).toFixed(4)}`);
check('EXP2 bulge nu=0 ~ 0', Math.abs(b0.avg) < 0.05 * bulgeExp,
  `|measured|=${Math.abs(b0.avg).toExponential(3)} (< 5% of nu=0.3 bulge ${bulgeExp.toExponential(2)})`);
// dispMax itself exceeds FL/EA because of the equal-share nodal load distribution
// (loaded-face corner nodes carry 4x their tributary-area-consistent share -> local
// extra displacement at the corners). Probe the field to separate bulk physics from
// that load-application artifact:
function probe(r, xmm, ymm, zmm) {
  const h = r.h, nnx = r._nnx, nny = r._nny;
  for (let cId = 0; cId < r._nodeGrid.length; cId++) {
    const g = r._nodeGrid[cId];
    const ix = g % nnx, iy = ((g / nnx) | 0) % nny, iz = (g / (nnx * nny)) | 0;
    if (ix * h === xmm && iy * h === ymm && iz * h === zmm) {
      return [r.u[cId * 3], r.u[cId * 3 + 1], r.u[cId * 3 + 2]];
    }
  }
  throw new Error(`node (${xmm},${ymm},${zmm}) not found`);
}
function argmaxNode(r) {
  const h = r.h, nnx = r._nnx, nny = r._nny;
  let best = -1, bm = -1;
  for (let cId = 0; cId < r._nodeGrid.length; cId++) {
    const m = Math.hypot(r.u[cId * 3], r.u[cId * 3 + 1], r.u[cId * 3 + 2]);
    if (m > bm) { bm = m; best = cId; }
  }
  const g = r._nodeGrid[best];
  return { x: (g % nnx) * h, y: (((g / nnx) | 0) % nny) * h, z: ((g / (nnx * nny)) | 0) * h, mag: bm };
}
const uzMid = probe(P0, 5, 5, 20)[2];     // centerline mid-height: expect -FL/EA * (20/40) = -0.01
const uzTipC = probe(P0, 5, 5, 40)[2];    // loaded-face center: expect ~ -0.02
const mx = argmaxNode(P0);
info('nu=0 field probes', `u_z(5,5,20)=${uzTipC && uzMid.toExponential(5)} (exp -1.0e-2), u_z(5,5,40)=${uzTipC.toExponential(5)} (exp -2.0e-2), argmax|u| at (${mx.x},${mx.y},${mx.z}) |u|=${mx.mag.toExponential(5)}`);
check('EXP2 bulk axial strain ~ F/(EA)', Math.abs(-uzMid / 0.01 - 1) < 0.03,
  `u_z(mid)= ${uzMid.toExponential(5)} vs -0.01, ratio=${(-uzMid / 0.01).toFixed(5)}`);
check('EXP2 load-face-center u_z ~ FL/EA', Math.abs(-uzTipC / 0.02 - 1) < 0.05,
  `u_z(face center)=${uzTipC.toExponential(5)} vs -0.02, ratio=${(-uzTipC / 0.02).toFixed(5)}`);
const isCorner = (mx.x === 0 || mx.x === 10) && (mx.y === 0 || mx.y === 10) && mx.z === 40;
check('EXP2 dispMax excess located at loaded-face corner (equal-share load artifact)', isCorner,
  `dispMax=${f(P0.dispMax)} (FL/EA=0.02, +${((P0.dispMax / 0.02 - 1) * 100).toFixed(1)}%) at (${mx.x},${mx.y},${mx.z})`);

// ================================================================ EXP 3: superposition (collinear loads)
console.log('\n=== EXP3 superposition: dispMax(F1+F2) = dispMax(F1)+dispMax(F2), collinear ===');
const S30 = runBox([40, 8, 8],
  { point: [0, 0, 0], normal: [1, 0, 0] }, { point: [40, 0, 0], normal: [1, 0, 0] },
  [0, 0, -30], E1, NU1, RES1, TOL1, IT1);
const S20 = runBox([40, 8, 8],
  { point: [0, 0, 0], normal: [1, 0, 0] }, { point: [40, 0, 0], normal: [1, 0, 0] },
  [0, 0, -20], E1, NU1, RES1, TOL1, IT1);
const sSum = S30.dispMax + S20.dispMax;
info('F=-30', `dispMax=${f(S30.dispMax)} vmMax=${f(S30.vmMax)}`);
info('F=-20', `dispMax=${f(S20.dispMax)} vmMax=${f(S20.vmMax)}`);
info('F=-50', `dispMax=${f(A.dispMax)} vmMax=${f(A.vmMax)}`);
check('EXP3 dispMax additive', relDiff(sSum, A.dispMax) < 1e-6,
  `disp(-30)+disp(-20)=${f(sSum)} vs disp(-50)=${f(A.dispMax)} relDiff=${relDiff(sSum, A.dispMax).toExponential(3)}`);
check('EXP3 vmMax additive', relDiff(S30.vmMax + S20.vmMax, A.vmMax) < 1e-6,
  `vm(-30)+vm(-20)=${f(S30.vmMax + S20.vmMax)} vs vm(-50)=${f(A.vmMax)} relDiff=${relDiff(S30.vmMax + S20.vmMax, A.vmMax).toExponential(3)}`);

// ================================================================ EXP 4: stiffness scaling E -> 2E
console.log('\n=== EXP4 stiffness scaling: doubling E halves deflection, stress unchanged ===');
const D2 = runBox([40, 8, 8],
  { point: [0, 0, 0], normal: [1, 0, 0] }, { point: [40, 0, 0], normal: [1, 0, 0] },
  [0, 0, -50], 4000, NU1, RES1, TOL1, IT1);
info('E=4000', `dispMax=${f(D2.dispMax)} vmMax=${f(D2.vmMax)}`);
check('EXP4 dispMax(E)/dispMax(2E) = 2', Math.abs(A.dispMax / D2.dispMax - 2) < 1e-9,
  `ratio=${(A.dispMax / D2.dispMax).toPrecision(15)}`);
check('EXP4 vmMax independent of E', relDiff(A.vmMax, D2.vmMax) < 1e-9,
  `vm(E=2000)=${f(A.vmMax)} vm(E=4000)=${f(D2.vmMax)} relDiff=${relDiff(A.vmMax, D2.vmMax).toExponential(3)}`);

// ================================================================ EXP 5: analytic cantilever vs Timoshenko
// beam 80 x 10 x 10, E=2000 nu=0.3, F=50 at tip (-z). res=64 -> h=1.25, 64x8x8 = 4096 voxels.
// I = 10*10^3/12 = 833.333 ; delta_EB = FL^3/(3EI) = 5.12 mm
// shear (k=5/6, G=E/2.6=769.231): delta_s = FL/(kGA) = 4000/(0.83333*769.231*100) = 0.0624 mm
// Timoshenko total = 5.1824 mm. Voxel FEM (8 elems through depth, full-integration H8,
// fully clamped end) expected slightly stiff -> ratio in [0.85, 1.05].
console.log('\n=== EXP5 cantilever 80x10x10 vs Timoshenko (res=64 -> h=1.25, cgTol=1e-8) ===');
const T = runBox([80, 10, 10],
  { point: [0, 0, 0], normal: [1, 0, 0] }, { point: [80, 0, 0], normal: [1, 0, 0] },
  [0, 0, -50], 2000, 0.3, 64, 1e-8, 100000);
const I5 = 10 * 1000 / 12;
const dEB = 50 * 80 ** 3 / (3 * 2000 * I5);
const G5 = 2000 / (2 * 1.3);
const dS = 50 * 80 / ((5 / 6) * G5 * 100);
const dT = dEB + dS;
info('theory', `delta_EB=${f(dEB, 6)} delta_shear=${f(dS, 6)} Timoshenko=${f(dT, 6)} mm`);
info('FEM', `nVox=${T.nVox} dispMax=${f(T.dispMax, 6)} vmMax=${f(T.vmMax, 6)} iters=${T.iters} res=${T.residual.toExponential(2)} conv=${T.converged}`);
info('bending stress', `sigma=Mc/I at clamp-elem-center (x=0.625,z=4.375): ${f(50 * (80 - 0.625) * 4.375 / I5, 4)} MPa vs FEM vmMax=${f(T.vmMax, 4)} (clamp singularity raises FEM)`);
check('EXP5 tip deflection vs Timoshenko', T.dispMax / dT > 0.85 && T.dispMax / dT < 1.05,
  `FEM/theory=${(T.dispMax / dT).toFixed(4)} (FEM=${f(T.dispMax, 6)}, theory=${f(dT, 6)})`);

// mesh-convergence cross-check on the 40x8x8 beam: res 20 (4x4 section) vs res 40 (8x8 section)
const I1 = 8 * 8 ** 3 / 12;
const dT1 = 50 * 40 ** 3 / (3 * 2000 * I1) + 50 * 40 / ((5 / 6) * G5 * 64);
const A40 = runBox([40, 8, 8],
  { point: [0, 0, 0], normal: [1, 0, 0] }, { point: [40, 0, 0], normal: [1, 0, 0] },
  [0, 0, -50], 2000, 0.3, 40, 1e-8, 100000);
info('EXP5b convergence', `40x8x8 Timoshenko=${f(dT1, 6)}; res20(4x4 sect)=${f(A.dispMax, 6)} ratio=${(A.dispMax / dT1).toFixed(4)}; res40(8x8 sect)=${f(A40.dispMax, 6)} ratio=${(A40.dispMax / dT1).toFixed(4)}`);
check('EXP5b finer mesh closer to theory',
  Math.abs(A40.dispMax / dT1 - 1) <= Math.abs(A.dispMax / dT1 - 1) && A40.dispMax / dT1 > 0.85 && A40.dispMax / dT1 < 1.05,
  `res20 ratio=${(A.dispMax / dT1).toFixed(4)} res40 ratio=${(A40.dispMax / dT1).toFixed(4)}`);

console.log(`\n[adv] ${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
process.exit(failures === 0 ? 0 : 1);
