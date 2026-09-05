// p5-topopt-probe.mjs — INDEPENDENT verification of runTopologyOpt (SIMP topology optimization)
// in src/analysis/voxelfea.ts.  Additive probe (does not modify any solver source).
//
// Run:  npx tsx tests/p5-topopt-probe.mjs    (from C:\ClaudeCode\webcad)
//   (transpiles voxelfea.ts to plain JS like tests/fea-adversarial-physics.mjs, then imports.)
//
// Benchmarks (classic SIMP topopt — MBB / cantilever family):
//   B1 Volume-constraint satisfaction: finalVol ≈ target volfrac (OC enforces Σx = volfrac·nVox)
//   B2 Compliance is finite & drops from iter-0 to final (stiffness increases as material
//      migrates to load paths); check overall decrease + late-stage near-monotonicity.
//   B3 Material lands on the load path: for a bottom-supported / top-loaded cantilever,
//      dense voxels (x>0.5) should concentrate nearer the support-to-load line than the
//      average design-domain voxel  (i.e. optimizer removes material from dead corners).
//   B4 volfrac sweep monotonicity: larger target volfrac ⇒ larger finalVol AND lower (better)
//      final compliance (more material = stiffer).  Pure trend check.
//   B5 penal sanity: higher SIMP penalty ⇒ more 0/1 (less gray) design (measure intermediate
//      density fraction).  Trend check.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

console.log('[topopt-probe] transpiling voxelfea.ts ...');
execSync(
  'npx tsc src/analysis/voxelfea.ts --outDir .tmp-topopt --module es2020 --target es2020 --strict false --skipLibCheck --ignoreConfig',
  { cwd: root, stdio: 'inherit' },
);
const jsPath = path.join(root, '.tmp-topopt', 'voxelfea.js');
const { runTopologyOpt } = await import(pathToFileURL(jsPath).href);

// ---- box mesh helper (axis-aligned, corner at origin) --------------------
function boxMesh(sx, sy, sz) {
  const vertices = [];
  for (let b = 0; b < 8; b++) vertices.push((b & 1) ? sx : 0, (b & 2) ? sy : 0, (b & 4) ? sz : 0);
  const triangles = [
    0, 1, 3, 0, 3, 2, 4, 5, 7, 4, 7, 6, 0, 4, 5, 0, 5, 1,
    2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3,
  ];
  return { vertices, triangles };
}

const fmt = (x, d = 5) => (Number.isFinite(x) ? Number(x).toPrecision(d) : String(x));
let failures = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failures++;
};

// ==========================================================================
// Cantilever design domain: long beam in X.  Fix left face (x=0), point-load
// (downward, -Z) on the right face (x=Lx).  Classic short-cantilever topopt.
const Lx = 60, Ly = 12, Lz = 30;
const mesh = boxMesh(Lx, Ly, Lz);
const E = 210000, nu = 0.3;      // steel-ish, MPa
const baseInp = {
  vertices: mesh.vertices, triangles: mesh.triangles,
  fixed: { point: [0, Ly / 2, Lz / 2], normal: [1, 0, 0] },   // x=0 plane
  load:  { point: [Lx, Ly / 2, Lz / 2], normal: [1, 0, 0] },  // x=Lx plane
  force: [0, 0, -1000],           // 1000 N downward
  E, nu, resolution: 28,
  volfrac: 0.4, penal: 3, rmin: 1.5, iters: 45,
};

console.log('\n=== B1/B2/B3  cantilever, volfrac=0.4 ===');
const t0 = Date.now();
const r = runTopologyOpt(baseInp);
console.log(`  [run] ok=${r.ok} nVox=${r.nVox} nDof=${r.nDof} iters=${r.iters} in ${((Date.now()-t0)/1000).toFixed(1)}s  warnings=${JSON.stringify(r.warnings)}`);
if (!r.ok) {
  console.log('  FAIL run error:', r.error);
  process.exit(1);
}

// ---- B1 volume constraint ----
{
  const err = Math.abs(r.finalVol - r.volfrac) / r.volfrac;
  check('B1 finalVol ≈ target volfrac', err < 0.05,
    `target=${fmt(r.volfrac)} final=${fmt(r.finalVol)} relErr=${(err*100).toFixed(2)}%`);
}

// ---- B2 compliance history ----
{
  const H = r.complianceHistory;
  const allFinite = H.length > 2 && H.every((c) => Number.isFinite(c) && c > 0);
  const c0 = H[0], cN = H[H.length - 1];
  const dropped = cN < c0;                 // final stiffer than uniform-density start
  // late-stage monotonicity: over the last 60% of iters, count non-increasing steps
  const s = Math.floor(H.length * 0.4);
  let mono = 0, tot = 0;
  for (let i = s + 1; i < H.length; i++) { tot++; if (H[i] <= H[i-1] * 1.02) mono++; }
  const lateMono = tot > 0 && mono / tot >= 0.8;
  check('B2a compliance history finite & positive', allFinite, `len=${H.length}`);
  check('B2b compliance drops start→final', dropped, `c0=${fmt(c0)} cN=${fmt(cN)} ratio=${fmt(cN/c0)}`);
  check('B2c late-stage near-monotone decrease', lateMono, `${mono}/${tot} steps non-increasing (2% tol)`);
}

// ---- B3 material on the load path ----
// Compare mean |z - midZ| (vertical spread) and correlation of dense material with the
// support→load geometry.  Simplest robust check: dense voxels' mean X should span the beam
// (structure must reach from support x≈0 to load x≈Lx), and material is NOT uniformly spread —
// dense fraction near the top & bottom fibers (bending) exceeds the neutral axis.
{
  const c = r.centers, d = r.density, n = r.nVox;
  // bounding of design domain from voxel centers
  let zmin = Infinity, zmax = -Infinity, xmin = Infinity, xmax = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = c[i*3], z = c[i*3+2];
    if (z < zmin) zmin = z; if (z > zmax) zmax = z;
    if (x < xmin) xmin = x; if (x > xmax) xmax = x;
  }
  const zmid = 0.5*(zmin+zmax), zspan = (zmax - zmin) || 1;
  // dense set
  let denseCount = 0, denseXmin = Infinity, denseXmax = -Infinity;
  // vertical distribution: outer-fiber band (|z-mid| > 0.3*span) vs neutral band (<0.15*span)
  let outerDense = 0, outerTot = 0, neutDense = 0, neutTot = 0;
  for (let i = 0; i < n; i++) {
    const x = c[i*3], z = c[i*3+2];
    const dense = d[i] > 0.5;
    if (dense) { denseCount++; if (x < denseXmin) denseXmin = x; if (x > denseXmax) denseXmax = x; }
    const rz = Math.abs(z - zmid) / zspan;
    if (rz > 0.30) { outerTot++; if (dense) outerDense++; }
    else if (rz < 0.15) { neutTot++; if (dense) neutDense++; }
  }
  const spanFrac = (denseXmax - denseXmin) / (xmax - xmin || 1);
  const outerRate = outerTot ? outerDense/outerTot : 0;
  const neutRate  = neutTot ? neutDense/neutTot : 0;
  check('B3a dense material spans support→load in X', spanFrac > 0.8,
    `denseX span = ${(spanFrac*100).toFixed(0)}% of domain`);
  check('B3b outer fibers denser than neutral axis (bending topology)', outerRate > neutRate,
    `outer=${(outerRate*100).toFixed(0)}% neutral=${(neutRate*100).toFixed(0)}%`);
  check('B3c dense voxel count sane (roughly volfrac·nVox)', denseCount > 0.15*n && denseCount < 0.75*n,
    `dense=${denseCount}/${n} = ${(100*denseCount/n).toFixed(0)}%`);
}

// ==========================================================================
console.log('\n=== B4  volfrac sweep monotonicity (0.25, 0.4, 0.55) ===');
const sweep = [];
for (const vf of [0.25, 0.4, 0.55]) {
  const rr = runTopologyOpt({ ...baseInp, volfrac: vf, iters: 35, resolution: 24 });
  if (!rr.ok) { console.log(`  FAIL vf=${vf}:`, rr.error); failures++; continue; }
  const cN = rr.complianceHistory[rr.complianceHistory.length-1];
  sweep.push({ vf, finalVol: rr.finalVol, cN });
  console.log(`  vf=${vf}: finalVol=${fmt(rr.finalVol)} finalCompliance=${fmt(cN)}`);
}
if (sweep.length === 3) {
  const volMono = sweep[0].finalVol < sweep[1].finalVol && sweep[1].finalVol < sweep[2].finalVol;
  const compMono = sweep[0].cN > sweep[1].cN && sweep[1].cN > sweep[2].cN;   // more material ⇒ stiffer ⇒ lower c
  check('B4a finalVol increases with target volfrac', volMono,
    `${fmt(sweep[0].finalVol)} < ${fmt(sweep[1].finalVol)} < ${fmt(sweep[2].finalVol)}`);
  check('B4b final compliance decreases as volfrac grows (more material=stiffer)', compMono,
    `${fmt(sweep[0].cN)} > ${fmt(sweep[1].cN)} > ${fmt(sweep[2].cN)}`);
}

// ==========================================================================
console.log('\n=== B5  penalty pushes design toward 0/1 (less gray) ===');
const grayFrac = (res) => {
  let g = 0; for (let i = 0; i < res.density.length; i++) { const x = res.density[i]; if (x > 0.3 && x < 0.7) g++; }
  return g / res.density.length;
};
const rP1 = runTopologyOpt({ ...baseInp, penal: 1.0, iters: 35, resolution: 24 });
const rP3 = runTopologyOpt({ ...baseInp, penal: 3.0, iters: 35, resolution: 24 });
if (rP1.ok && rP3.ok) {
  const g1 = grayFrac(rP1), g3 = grayFrac(rP3);
  console.log(`  gray fraction: penal=1 → ${(g1*100).toFixed(1)}%   penal=3 → ${(g3*100).toFixed(1)}%`);
  check('B5 higher penalty ⇒ fewer intermediate-density (gray) voxels', g3 < g1,
    `${(g3*100).toFixed(1)}% < ${(g1*100).toFixed(1)}%`);
} else {
  console.log('  FAIL penalty runs:', rP1.error, rP3.error); failures++;
}

console.log(`\n[topopt-probe] ${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
process.exit(failures === 0 ? 0 : 1);
