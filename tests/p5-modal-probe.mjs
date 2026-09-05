// p5-modal-probe.mjs — P5 quantitative probe for FEA modal analysis (natural frequencies)
// Additive probe (does NOT modify any solver/store/worker). Run:
//   cd C:\ClaudeCode\webcad && npx -y tsx tests/p5-modal-probe.mjs
//
// Analytical reference: Euler-Bernoulli cantilever 1st bending natural frequency
//   f1 = (beta1L)^2/(2*pi) * sqrt(E*I/(rho*A*L^4)),  beta1L = 1.875104
// Unit system: N-mm-MPa-s => mass in tonne, rho in g/cm3 (=1e-9 tonne/mm3), f in Hz.
//
// Steel: E=200000 MPa, nu=0.3, rho=7.85 g/cm3.
// Solver calibration comment claims 100x10x10 steel cantilever f1 ~ 815 Hz.

import { runVoxelModal } from '../src/analysis/voxelfea.ts';

const E = 200000, nu = 0.3, rho = 7.85;
const rhoT = rho * 1e-9;              // tonne/mm^3
const beta1L = 1.875104;

// axis-aligned box mesh, watertight, x in [0,sx], etc.
function boxMesh(sx, sy, sz) {
  const vertices = [];
  for (let bb = 0; bb < 8; bb++) vertices.push((bb & 1) ? sx : 0, (bb & 2) ? sy : 0, (bb & 4) ? sz : 0);
  const triangles = [0,1,3, 0,3,2, 4,5,7, 4,7,6, 0,4,5, 0,5,1, 2,3,7, 2,7,6, 0,2,6, 0,6,4, 1,5,7, 1,7,3];
  return { vertices, triangles };
}

function analyticalF1(L, b, hh) {
  const A = b * hh;
  const I = b * Math.pow(hh, 3) / 12;   // bending about the thin axis (min I => lowest bending mode)
  return Math.pow(beta1L, 2) / (2 * Math.PI) * Math.sqrt(E * I / (rhoT * A * Math.pow(L, 4)));
}

// Cantilever cases. Fixed at x=0 plane, beam extends along +X. Cross section b(Y) x h(Z).
// For a square section the two bending modes are degenerate; pick a rectangular section
// so the lowest mode is unambiguous (bend about the axis with smaller I => here Z is thinner).
const cases = [
  { name: 'square 100x10x10  L/h=10', L: 100, b: 10, hh: 10, res: 16 },
  { name: 'square 100x10x10  L/h=10 (res24)', L: 100, b: 10, hh: 10, res: 24 },
  { name: 'slender 200x10x10 L/h=20', L: 200, b: 10, hh: 10, res: 24 },
  { name: 'slender 200x10x10 L/h=20 (res32)', L: 200, b: 10, hh: 10, res: 32 },
];

console.log('=== FEA modal quantitative probe (cantilever 1st bending) ===\n');
const rows = [];
for (const c of cases) {
  const mesh = boxMesh(c.L, c.b, c.hh);
  const fixed = { point: [0, c.b / 2, c.hh / 2], normal: [1, 0, 0] };
  const t0 = Date.now();
  const r = runVoxelModal({ ...mesh, E, nu, rho, resolution: c.res, fixed, nModes: 4 });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  if (!r.ok) { console.log(`${c.name}: FAIL ${r.error}`); rows.push({ c, ok: false }); continue; }
  const fAna = analyticalF1(c.L, c.b, c.hh);
  const f1 = r.freqs[0];
  const relErr = (f1 - fAna) / fAna * 100;
  console.log(`${c.name}`);
  console.log(`  nVox=${r.nVox}  nDof=${r.nDof}  h=${r.h.toFixed(3)}  (${dt}s)  conv=${JSON.stringify(r.modeConverged)}`);
  console.log(`  freqs(Hz)= [${r.freqs.map(f => f.toFixed(1)).join(', ')}]`);
  console.log(`  analytical f1 = ${fAna.toFixed(1)} Hz   solver f1 = ${f1.toFixed(1)} Hz   relErr = ${relErr.toFixed(2)}%`);
  if (r.warnings.length) console.log(`  warnings: ${r.warnings.join(' | ')}`);
  console.log('');
  rows.push({ c, ok: true, fAna, f1, relErr, nVox: r.nVox });
}

// Convergence check: does refining resolution reduce error toward analytical?
console.log('=== summary ===');
for (const row of rows) {
  if (!row.ok) { console.log(`${row.c.name}: FAIL`); continue; }
  console.log(`${row.c.name}: relErr ${row.relErr.toFixed(2)}%  (nVox ${row.nVox})`);
}
