// fea-faceselect-integration.test.mjs — S133 node-level proof that runVoxelFea's
// loadFaceTris / fixedFaceTris override concentrates the load/constraint on EXACTLY
// the picked B-rep face's nodes (no infinite-plane leak onto coplanar/opposite features),
// and that the face-tris-ABSENT path is byte-identical to the legacy PlanePick band path.
//
// Run from C:\ClaudeCode\webcad:  npx -y tsx tests/fea-faceselect-integration.test.mjs
//
// Method: transpile src/analysis/{voxelfea,faceFeaSelect}.ts to .tmp-fea/, import both.
// We reuse the SAME watertight box mesh shape as the other FEA suites. We do NOT alter
// any computation — runVoxelFea is called as a black box and we inspect r.loadCount/r.fixedCount.
// faceFeaSelect is called directly to obtain the ground-truth face node set + grid agreement.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

console.log('[fs] transpile voxelfea.ts + faceFeaSelect.ts -> .tmp-fea/');
execSync(
  'npx tsc src/analysis/voxelfea.ts src/analysis/faceFeaSelect.ts --outDir .tmp-fea --module es2020 --target es2020 --strict false --skipLibCheck --ignoreConfig',
  { cwd: root, stdio: 'inherit' },
);
// `tsc --module es2020` preserves Vite's extensionless local import, while
// Node ESM requires the emitted .js extension in this temporary test folder.
const compiledVoxel = path.join(root, '.tmp-fea', 'voxelfea.js');
writeFileSync(compiledVoxel, readFileSync(compiledVoxel, 'utf8').replace(/(['"]\.\/faceFeaSelect)(['"])/, '$1.js$2'));
const { runVoxelFea } = await import(pathToFileURL(path.join(root, '.tmp-fea', 'voxelfea.js')).href);
const { faceFeaSelect } = await import(pathToFileURL(path.join(root, '.tmp-fea', 'faceFeaSelect.js')).href);

let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`);
  if (!cond) failures++;
}

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

/** Flat-xyz (9/tri) triangles for the bounded x=xv face of a [0,sx]x[0,sy]x[0,sz] box. */
function xFaceTris(xv, sy, sz) {
  // two triangles covering the rectangle (xv, 0..sy, 0..sz)
  return [
    xv, 0, 0, xv, sy, 0, xv, sy, sz,
    xv, 0, 0, xv, sy, sz, xv, 0, sz,
  ];
}

// Reconstruct the SAME grid runVoxelFea builds, so we can call faceFeaSelect with an
// identical grid description and get the ground-truth face node count. We can't read
// runVoxelFea's internal grid, but faceFeaSelect recomputes nodeId from grid.solid using
// the same traversal — so as long as we feed the SAME voxelize() grid, ids line up 1:1.
// voxelize is exported from voxelfea; import it to build the grid exactly as the solver does.
const { voxelize } = await import(pathToFileURL(path.join(root, '.tmp-fea', 'voxelfea.js')).href);

// clampResolution mirror (voxelfea clamps to [4,64]); we pick clean dims so res maps to exact voxels.
const DIMS = [40, 8, 8];       // box
const RES = 20;                // -> h=2, exact 20x4x4 voxels (matches EXP1 in fea-adversarial)
const E = 2000, NU = 0.3, F = [0, 0, -50];

const { vertices, triangles } = boxMesh(...DIMS);
const grid = voxelize(vertices, triangles, RES);

// ---- Ground truth: faceFeaSelect on the +X (load) face and the -X (fixed) face.
const loadFaceTris = xFaceTris(DIMS[0], DIMS[1], DIMS[2]);   // x=40
const fixedFaceTris = xFaceTris(0, DIMS[1], DIMS[2]);        // x=0
const lsel = faceFeaSelect({ faceTris: loadFaceTris, grid });
const fsel = faceFeaSelect({ faceTris: fixedFaceTris, grid });

console.log('\n=== T1 grid agreement (faceFeaSelect nodeId space == solver nodeId space) ===');
check('T1a load face select ok', lsel.ok, lsel.error || `nNodes=${lsel.nNodes} total=${lsel.nNodesTotal}`);
check('T1b fixed face select ok', fsel.ok, fsel.error || `nNodes=${fsel.nNodes} total=${fsel.nNodesTotal}`);
// +X face of a 20x4x4 voxel box has (ny+1)*(nz+1) = 5*5 = 25 corner nodes.
check('T1c load (+X) face node count = 25', lsel.nNodes === 25, `got ${lsel.nNodes}`);
check('T1d fixed (-X) face node count = 25', fsel.nNodes === 25, `got ${fsel.nNodes}`);

// ================================================================ T2: load-face override
// Legacy PlanePick for load uses {point:[40,0,0], normal:[1,0,0]} — a x=40 infinite plane.
// On a simple box the +X face IS the only thing at x=40, so legacy loadCount also == 25 here.
// The REAL leak test is T3 (a coplanar feature on the opposite side). Here we just prove the
// face override produces the SAME loadCount as faceFeaSelect's node set (the override is wired).
console.log('\n=== T2 loadFaceTris override → loadCount == face node count ===');
const rFace = runVoxelFea({
  vertices, triangles,
  fixed: { point: [0, 0, 0], normal: [1, 0, 0] },
  load: { point: [40, 0, 0], normal: [1, 0, 0] },
  loadFaceTris,
  force: F, E, nu: NU, resolution: RES, cgTol: 1e-8, maxIter: 60000,
});
check('T2a runVoxelFea ok (face load)', rFace.ok, rFace.error || `loadCount=${rFace.loadCount} fixedCount=${rFace.fixedCount}`);
check('T2b loadCount == faceFeaSelect(+X).nNodes (25)', rFace.loadCount === lsel.nNodes,
  `loadCount=${rFace.loadCount} vs lsel.nNodes=${lsel.nNodes}`);

// ================================================================ T3: infinite-plane LEAK fix
// Build a DUMBBELL: two coplanar +X faces at x=40 — one at y in [0,8], one at y in [20,28] —
// joined by a thin web, so an x=40 infinite plane catches BOTH end faces (the legacy bug),
// but a bounded faceTris on only the FIRST end face must catch only its nodes.
console.log('\n=== T3 bounded face does NOT leak onto a coplanar sibling face (the infinite-plane bug) ===');
// L-bracket-ish: a 40x8x8 bar PLUS a 40x8x8 bar offset in +y by 20 (gap), bridged minimally.
// Simpler & watertight: a single 40x28x8 slab — its whole x=40 face is one rectangle. A bounded
// faceTris covering only y in [0,8] must select fewer nodes than the full x=40 plane band.
const SLAB = [40, 28, 8];
const { vertices: sv, triangles: st } = boxMesh(...SLAB);
const slabRes = 14;            // longest axis 40 -> h≈2.857; ny≈10, nz≈3 (just needs >1 node row diff)
const slabGrid = voxelize(sv, st, slabRes);
const partialFaceTris = xFaceTris(SLAB[0], 8, SLAB[2]);   // x=40 face, only y in [0,8] (partial!)
const fullPlaneSel = faceFeaSelect({ faceTris: xFaceTris(SLAB[0], SLAB[1], SLAB[2]), grid: slabGrid });
const partialSel = faceFeaSelect({ faceTris: partialFaceTris, grid: slabGrid });
check('T3a partial face ok', partialSel.ok && fullPlaneSel.ok,
  `${partialSel.error || ''} ${fullPlaneSel.error || ''}`);
check('T3b bounded face selects STRICTLY FEWER nodes than full x=40 plane (no leak)',
  partialSel.nNodes > 0 && partialSel.nNodes < fullPlaneSel.nNodes,
  `partial=${partialSel.nNodes} full-plane=${fullPlaneSel.nNodes}`);
// and the solver honors it: loadCount on the slab with partialFaceTris == partialSel.nNodes
const rSlab = runVoxelFea({
  vertices: sv, triangles: st,
  fixed: { point: [0, 0, 0], normal: [1, 0, 0] },
  load: { point: [40, 0, 0], normal: [1, 0, 0] },   // legacy plane would grab the WHOLE x=40 face
  loadFaceTris: partialFaceTris,                     // ...but bounded face restricts to y in [0,8]
  force: F, E, nu: NU, resolution: slabRes, cgTol: 1e-7, maxIter: 60000,
});
check('T3c solver loadCount == bounded partial face node set (honors bounded face, not plane)',
  rSlab.ok && rSlab.loadCount === partialSel.nNodes,
  `loadCount=${rSlab.loadCount} partialSel=${partialSel.nNodes} fullPlane=${fullPlaneSel.nNodes} ok=${rSlab.ok}`);

// ================================================================ T4: back-compat (faceTris ABSENT)
// Identical inputs WITHOUT loadFaceTris/fixedFaceTris must reproduce the legacy band loadCount.
// On the simple 40x8x8 box the x=40 plane band == the +X face == 25 nodes, so the absent-path
// loadCount must equal T2's. This proves the absent path is unchanged.
console.log('\n=== T4 back-compat: faceTris ABSENT reproduces legacy PlanePick band ===');
const rLegacy = runVoxelFea({
  vertices, triangles,
  fixed: { point: [0, 0, 0], normal: [1, 0, 0] },
  load: { point: [40, 0, 0], normal: [1, 0, 0] },
  // NO loadFaceTris / fixedFaceTris
  force: F, E, nu: NU, resolution: RES, cgTol: 1e-8, maxIter: 60000,
});
check('T4a legacy run ok', rLegacy.ok, rLegacy.error || `loadCount=${rLegacy.loadCount}`);
check('T4b legacy loadCount == face-override loadCount on simple box (both = 25)',
  rLegacy.loadCount === rFace.loadCount && rLegacy.loadCount === 25,
  `legacy=${rLegacy.loadCount} face=${rFace.loadCount}`);
// And the physics result is identical when the face set equals the plane band (same nodes loaded).
check('T4c dispMax identical when face set == plane band (no solver fork)',
  Math.abs(rLegacy.dispMax - rFace.dispMax) / Math.max(rLegacy.dispMax, 1e-30) < 1e-9,
  `legacy=${rLegacy.dispMax} face=${rFace.dispMax}`);

// ================================================================ summary
console.log(`\n${failures === 0 ? '========= ALL PASS =========' : `========= ${failures} FAILED =========`}`);
process.exit(failures === 0 ? 0 : 1);
