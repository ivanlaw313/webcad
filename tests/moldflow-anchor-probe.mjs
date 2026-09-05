// ADDITIVE probe (evaluator, non-core): verify moldsolve 2.5D Hele-Shaw h^3 conductance
// scaling against the Poiseuille slit analytic. Does NOT modify any solver source.
// Run: npx tsx tests/moldflow-anchor-probe.mjs
import { solveMoldFill } from '../src/analysis/moldsolve.ts'

const NEWTON = { eta0: 100, n: 0.5, tauStar: 1e15 } // Newtonian limit (tauStar huge)

function strip(nx, ny, nz, h, halfThick, injRate) {
  const n = nx * ny * nz
  const solid = new Uint8Array(n).fill(1)
  const grid = { nx, ny, nz, h, solid }
  const hHalf = new Float64Array(n).fill(halfThick)
  const gate = 0 + nx * (1 + ny * 1)
  return solveMoldFill(grid, hHalf, [gate], NEWTON, { injRate })
}

const nx = 22, ny = 3, nz = 3, h = 1, Q = 1000
// thin: H=1.5 (hHalf 0.75); thick: H=3.0 (hHalf 1.5). 2x thickness => pPeak ~ 1/H^3 => ratio 8.
const thin = strip(nx, ny, nz, h, 0.75, Q)
const thick = strip(nx, ny, nz, h, 1.5, Q)
console.log('thin  pPeak =', thin.pPeak.toFixed(1), 'Pa')
console.log('thick pPeak =', thick.pPeak.toFixed(1), 'Pa')
const ratio = thin.pPeak / thick.pPeak
const analytic = 8.0
const relErr = Math.abs(ratio - analytic) / analytic * 100
console.log('pPeak ratio thin/thick =', ratio.toFixed(3), '(analytic H^3 => 8.000)')
console.log('rel err vs analytic =', relErr.toFixed(2), '%')

// 1D linearity along centerline (Darcy uniform-conductance => linear p(x))
function centerline(out) {
  const arr = []
  for (let x = 0; x < nx; x++) arr.push(out.pressure[x + nx * (1 + ny * 1)])
  return arr
}
const pl = thin.map ? null : null
const cl = centerline(thin)
const xa = 3, xb = 17
const slope = (cl[xb] - cl[xa]) / (xb - xa)
let maxdev = 0
for (let x = xa; x <= xb; x++) {
  const lin = cl[xa] + slope * (x - xa)
  const dev = Math.abs(cl[x] - lin) / Math.max(Math.abs(cl[xa]), 1)
  if (dev > maxdev) maxdev = dev
}
console.log('1D centerline linearity max rel dev (x=3..17) =', (maxdev * 100).toFixed(1), '%')
console.log('ANCHOR_RATIO', ratio.toFixed(4), 'ANCHOR_ANALYTIC', analytic, 'ANCHOR_RELERR_PCT', relErr.toFixed(2))
