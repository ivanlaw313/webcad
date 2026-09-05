/* Regression for the optional Hele-Shaw FVM path.  For a Newtonian slit of
 * equal planform and flow rate, pressure loss is proportional to 1 / H^3. */
import assert from 'node:assert/strict'
import { solveMoldFill } from '../src/analysis/moldsolve.ts'

const newtonian = { eta0: 100, n: 0.5, tauStar: 1e15 }

function solveStrip(halfThickness) {
  const nx = 22, ny = 3, nz = 3
  const solid = new Uint8Array(nx * ny * nz).fill(1)
  const hHalf = new Float64Array(solid.length).fill(halfThickness)
  const gate = nx * (1 + ny)
  return solveMoldFill({ nx, ny, nz, h: 1, solid }, hHalf, [gate], newtonian, { injRate: 1000 })
}

const thin = solveStrip(.75) // H = 1.5 mm
const thick = solveStrip(1.5) // H = 3.0 mm
const ratio = thin.pPeak / thick.pPeak

assert.ok(Number.isFinite(ratio), 'both strips must produce finite FVM pressure')
assert.ok(Math.abs(ratio - 8) / 8 < .03, `doubling the wall thickness must give H^3 pressure ratio ≈8; got ${ratio}`)
