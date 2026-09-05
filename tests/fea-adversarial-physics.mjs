// fea-adversarial-physics.mjs — INDEPENDENT adversarial physics verification of voxelfea.ts
// (not the bundled suite; written from scratch against analytic mechanics)
//
// Run:  node tests/fea-adversarial-physics.mjs   (from C:\ClaudeCode\webcad)
//
// Transpile trick per tests/fea-verify.mjs header. Additionally creates an
// INSTRUMENTED copy of the transpiled JS that returns the raw nodal displacement
// vector u (needed for the Poisson-effect experiment; public API only returns dispMax).

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

console.log('[adv] transpiling voxelfea.ts ...');
execSync(
  'npx tsc src/analysis/voxelfea.ts --outDir .tmp-fea --module es2020 --target es2020 --strict false --skipLibCheck --ignoreConfig',
  { cwd: root, stdio: 'inherit' },
);

// ---- instrumented copy: expose sol.u + node grid mapping in the result
const jsPath = path.join(root, '.tmp-fea', 'voxelfea.js');
let src = fs.readFileSync(jsPath, 'utf8');
const anchor = 'iters: sol.iters, residual: sol.residual, converged: sol.converged,';
if (!src.includes(anchor)) {
  console.error('INSTRUMENTATION ANCHOR NOT FOUND — dump of nearby text:');
  const i = src.indexOf('ok: true, warnings');
  console.error(src.slice(Math.max(0, i - 200), i + 400));
  process.exit(2);
}
src = src.replace(anchor, anchor + ' u: sol.u, nodeGrid, nnx, nny, nnz, gox: ox, goy: oy, goz: oz, gh: h,');
const instrPath = path.join(root, '.tmp-fea', 'voxelfea-instr.mjs');
fs.writeFileSync(instrPath, src);

const { runVoxelFea } = await import(pathToFileURL(jsPath).href);
const { runVoxelFea: runInstr } = await import(pathToFileURL(instrPath).href);

// ------------------------------------------------------------------ helpers

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
const fmt = (x, d = 8) => Number(x).toPrecision(d);
const relDiff = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300);

let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`);
  if (!cond) failures++;
}

// ==================================================================
// E1. ORIENTATION INVARIANCE — cantilever 40x8x8, E=2000, nu=0.3, F=50N
// ==================================================================
console.log('\n=== E1 orientation invariance ===');
{
  const common = { E: 2000, nu: 0.3, resolution: 20, cgTol: 1e-11, maxIter: 30000 };
  const mA = boxMesh(40, 8, 8);
  const A = runVoxelFea({ ...common, vertices: mA.vertices, triangles: mA.triangles,
    fixed: { point: [0, 0, 0], normal: [1, 0, 0] },
    load: { point: [40, 0, 0], normal: [1, 0, 0] },
    force: [0, 0, -50] });
  const mB = boxMesh(8, 40, 8);
  const B = runVoxelFea({ ...common, vertices: mB.vertices, triangles: mB.triangles,
    fixed: { point: [0, 0, 0], normal: [0, 1, 0] },
    load: { point: [0, 40, 0], normal: [0, 1, 0] },
    force: [0, 0, -50] });
  const C = runVoxelFea({ ...common, vertices: mA.vertices, triangles: mA.triangles,
    fixed: { point: [0, 0, 0], normal: [1, 0, 0] },
    load: { point: [40, 0, 0], normal: [1, 0, 0] },
    force: [0, 50, 0] });

  for (const [tag, r] of [['A x-beam,-z', A], ['B y-beam,-z', B], ['C x-beam,+y', C]]) {
    console.log(`  ${tag}: ok=${r.ok} conv=${r.converged} nVox=${r.nVox} fixed=${r.fixedCount} load=${r.loadCount}`
      + ` dispMax=${fmt(r.dispMax)} vmMax=${fmt(r.vmMax)} iters=${r.iters}`);
  }
  const dAB = relDiff(A.dispMax, B.dispMax), vAB = relDiff(A.vmMax, B.vmMax);
  const dAC = relDiff(A.dispMax, C.dispMax), vAC = relDiff(A.vmMax, C.vmMax);
  check('E1a dispMax A vs B (beam along y)', dAB < 1e-5, `relDiff=${dAB.toExponential(3)}`);
  check('E1b vmMax  A vs B', vAB < 1e-5, `relDiff=${vAB.toExponential(3)}`);
  check('E1c dispMax A vs C (load +y)', dAC < 1e-5, `relDiff=${dAC.toExponential(3)}`);
  check('E1d vmMax  A vs C', vAC < 1e-5, `relDiff=${vAC.toExponential(3)}`);
}

// ==================================================================
// E2. POISSON EFFECT — column 8x8x32 compressed axially, instrumented u
// ==================================================================
console.log('\n=== E2 Poisson effect (instrumented displacement field) ===');
{
  const m = boxMesh(8, 8, 32);
  const run = (nu) => runInstr({
    vertices: m.vertices, triangles: m.triangles,
    fixed: { point: [0, 0, 0], normal: [0, 0, 1] },
    load: { point: [0, 0, 32], normal: [0, 0, 1] },
    force: [0, 0, -100], E: 2000, nu, resolution: 32, cgTol: 1e-11, maxIter: 40000,
  });
  const probe = (r) => {
    // grid->compact map
    const g2c = new Map();
    for (let c = 0; c < r.nodeGrid.length; c++) g2c.set(r.nodeGrid[c], c);
    const U = (ix, iy, iz) => {
      const c = g2c.get(ix + r.nnx * (iy + r.nny * iz));
      return [r.u[c * 3], r.u[c * 3 + 1], r.u[c * 3 + 2]];
    };
    // axial strain at mid-height, center column (h=1, nnx=nny=9, nnz=33)
    const epsAx = (U(4, 4, 20)[2] - U(4, 4, 12)[2]) / 8;
    // lateral bulge per side at mid-height (z=16): face x=8 vs x=0, y=8 vs y=0
    const bulgeX = (U(8, 4, 16)[0] - U(0, 4, 16)[0]) / 2;
    const bulgeY = (U(4, 8, 16)[1] - U(4, 0, 16)[1]) / 2;
    return { epsAx, bulgeX, bulgeY };
  };

  const r3 = run(0.3);
  const r0 = run(0.0);
  console.log(`  nu=0.3: ok=${r3.ok} conv=${r3.converged} h=${r3.h} nVox=${r3.nVox} iters=${r3.iters}`);
  console.log(`  nu=0.0: ok=${r0.ok} conv=${r0.converged} iters=${r0.iters}`);
  const p3 = probe(r3), p0 = probe(r0);
  const epsTheory = -100 / (64 * 2000); // sigma/E = -7.8125e-4
  const bulgePred3 = -0.3 * p3.epsAx * 4; // nu * |eps| * halfwidth
  console.log(`  nu=0.3: epsAxial=${fmt(p3.epsAx, 6)} (theory ${fmt(epsTheory, 6)})`
    + ` bulgeX=${fmt(p3.bulgeX, 6)} bulgeY=${fmt(p3.bulgeY, 6)} predicted=${fmt(bulgePred3, 6)}`);
  console.log(`  nu=0.0: epsAxial=${fmt(p0.epsAx, 6)} bulgeX=${p0.bulgeX.toExponential(3)} bulgeY=${p0.bulgeY.toExponential(3)}`);
  check('E2a axial strain ~ sigma/E (nu=0.3, 3%)', Math.abs(p3.epsAx - epsTheory) / Math.abs(epsTheory) < 0.03,
    `measured ${fmt(p3.epsAx, 6)} vs ${fmt(epsTheory, 6)}, rel err ${(Math.abs(p3.epsAx - epsTheory) / Math.abs(epsTheory)).toExponential(2)}`);
  check('E2b lateral bulge ~ nu*eps*halfwidth (5%)',
    Math.abs(p3.bulgeX - bulgePred3) / bulgePred3 < 0.05 && Math.abs(p3.bulgeY - bulgePred3) / bulgePred3 < 0.05,
    `bulgeX=${fmt(p3.bulgeX, 6)} bulgeY=${fmt(p3.bulgeY, 6)} vs predicted ${fmt(bulgePred3, 6)}`
    + ` (relerr ${(Math.abs(p3.bulgeX - bulgePred3) / bulgePred3).toExponential(2)}, ${(Math.abs(p3.bulgeY - bulgePred3) / bulgePred3).toExponential(2)})`);
  check('E2c nu=0 -> lateral ~ 0', Math.abs(p0.bulgeX) < 0.01 * bulgePred3 && Math.abs(p0.bulgeY) < 0.01 * bulgePred3,
    `bulgeX=${p0.bulgeX.toExponential(3)} bulgeY=${p0.bulgeY.toExponential(3)} (limit ${(0.01 * bulgePred3).toExponential(3)})`);
  check('E2d nu=0 axial strain ~ sigma/E (3%)', Math.abs(p0.epsAx - epsTheory) / Math.abs(epsTheory) < 0.03,
    `measured ${fmt(p0.epsAx, 6)}`);
}

// ==================================================================
// E3. SUPERPOSITION — collinear loads: u(F1+F2) = u(F1)+u(F2)
// ==================================================================
console.log('\n=== E3 superposition / linearity ===');
{
  const m = boxMesh(40, 8, 8);
  const base = { vertices: m.vertices, triangles: m.triangles,
    fixed: { point: [0, 0, 0], normal: [1, 0, 0] },
    load: { point: [40, 0, 0], normal: [1, 0, 0] },
    E: 2000, nu: 0.3, resolution: 20, cgTol: 1e-11, maxIter: 30000 };
  const r30 = runVoxelFea({ ...base, force: [0, 0, -30] });
  const r20 = runVoxelFea({ ...base, force: [0, 0, -20] });
  const r50 = runVoxelFea({ ...base, force: [0, 0, -50] });
  console.log(`  F=-30: dispMax=${fmt(r30.dispMax)} vmMax=${fmt(r30.vmMax)}`);
  console.log(`  F=-20: dispMax=${fmt(r20.dispMax)} vmMax=${fmt(r20.vmMax)}`);
  console.log(`  F=-50: dispMax=${fmt(r50.dispMax)} vmMax=${fmt(r50.vmMax)}`);
  const dSum = r30.dispMax + r20.dispMax, vSum = r30.vmMax + r20.vmMax;
  check('E3a dispMax(50) = dispMax(30)+dispMax(20)', relDiff(r50.dispMax, dSum) < 1e-6,
    `${fmt(r50.dispMax)} vs sum ${fmt(dSum)} relDiff=${relDiff(r50.dispMax, dSum).toExponential(3)}`);
  check('E3b vmMax(50) = vmMax(30)+vmMax(20)', relDiff(r50.vmMax, vSum) < 1e-6,
    `${fmt(r50.vmMax)} vs sum ${fmt(vSum)} relDiff=${relDiff(r50.vmMax, vSum).toExponential(3)}`);
  // elementwise vm additivity
  let maxRel = 0;
  for (let e = 0; e < r50.nVox; e++) {
    const s = r30.vm[e] + r20.vm[e];
    maxRel = Math.max(maxRel, Math.abs(r50.vm[e] - s) / Math.max(s, 1e-12));
  }
  check('E3c elementwise vm additive', maxRel < 1e-4, `max elementwise relDiff=${maxRel.toExponential(3)}`);
}

// ==================================================================
// E4. STIFFNESS SCALING — 2E -> deflection/2, stress unchanged
// ==================================================================
console.log('\n=== E4 stiffness scaling ===');
{
  const m = boxMesh(40, 8, 8);
  const base = { vertices: m.vertices, triangles: m.triangles,
    fixed: { point: [0, 0, 0], normal: [1, 0, 0] },
    load: { point: [40, 0, 0], normal: [1, 0, 0] },
    force: [0, 0, -50], nu: 0.3, resolution: 20, cgTol: 1e-11, maxIter: 30000 };
  const rE1 = runVoxelFea({ ...base, E: 2000 });
  const rE2 = runVoxelFea({ ...base, E: 4000 });
  console.log(`  E=2000: dispMax=${fmt(rE1.dispMax)} vmMax=${fmt(rE1.vmMax)}`);
  console.log(`  E=4000: dispMax=${fmt(rE2.dispMax)} vmMax=${fmt(rE2.vmMax)}`);
  const ratio = rE1.dispMax / rE2.dispMax;
  check('E4a doubling E halves deflection', Math.abs(ratio - 2) < 1e-6,
    `dispMax ratio = ${fmt(ratio, 10)} (expect 2)`);
  check('E4b vmMax independent of E (force-driven)', relDiff(rE1.vmMax, rE2.vmMax) < 1e-6,
    `vmMax relDiff = ${relDiff(rE1.vmMax, rE2.vmMax).toExponential(3)}`);
}

// ==================================================================
// E5. SLENDER CANTILEVER 64x4x4 vs Euler-Bernoulli + Timoshenko shear
// ==================================================================
console.log('\n=== E5 slender cantilever (aspect 16) vs analytic ===');
{
  const L = 64, b = 4, d = 4, F = 10, E = 2000, nu = 0.3;
  const m = boxMesh(L, b, d);
  const r = runVoxelFea({ vertices: m.vertices, triangles: m.triangles,
    fixed: { point: [0, 0, 0], normal: [1, 0, 0] },
    load: { point: [L, 0, 0], normal: [1, 0, 0] },
    force: [0, 0, -F], E, nu, resolution: 64, cgTol: 1e-9, maxIter: 60000 });
  const I = b * d ** 3 / 12;            // 21.333
  const G = E / (2 * (1 + nu));
  const kappa = 5 / 6;
  const dEB = F * L ** 3 / (3 * E * I); // 20.48
  const dTim = dEB + F * L / (kappa * G * b * d); // +0.0624
  const sigRoot = F * L * (d / 2) / I;  // 60 MPa outer fiber at clamp
  // element-center estimate: x=h/2 from root, z=d/2-h/2 from axis
  const sigCenter = F * (L - 0.5) * 1.5 / I;
  console.log(`  ok=${r.ok} conv=${r.converged} nVox=${r.nVox} h=${r.h} iters=${r.iters} residual=${r.residual.toExponential(2)}`);
  console.log(`  dispMax=${fmt(r.dispMax)}  EB=${fmt(dEB, 6)}  Timoshenko=${fmt(dTim, 6)}  ratio=${fmt(r.dispMax / dTim, 5)}`);
  console.log(`  vmMax=${fmt(r.vmMax, 5)} @ (${Array.from(r.vmMaxAt).map((x) => x.toFixed(1)).join(',')})`
    + `  analytic outer-fiber root=${fmt(sigRoot, 4)}  element-center est=${fmt(sigCenter, 4)}`);
  check('E5a tip deflection within 10% of Timoshenko', Math.abs(r.dispMax / dTim - 1) < 0.10,
    `dispMax=${fmt(r.dispMax)} vs ${fmt(dTim, 6)} -> ratio ${fmt(r.dispMax / dTim, 5)}`);
  check('E5b vmMax at root outer fiber', r.vmMaxAt[0] <= 4 && Math.abs(r.vmMaxAt[2] - 2) >= 1,
    `vmMaxAt=(${Array.from(r.vmMaxAt).map((x) => x.toFixed(1)).join(',')})`);
  check('E5c vmMax magnitude sane (0.6..1.6 x element-center analytic)',
    r.vmMax > 0.6 * sigCenter && r.vmMax < 1.6 * sigCenter,
    `vmMax=${fmt(r.vmMax, 5)} vs element-center analytic ${fmt(sigCenter, 4)} (ratio ${fmt(r.vmMax / sigCenter, 4)})`);
}

console.log(`\n========= ${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'} =========`);
process.exit(failures ? 1 : 0);
