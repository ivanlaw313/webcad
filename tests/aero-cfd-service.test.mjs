// Aero Lab → local OpenFOAM service (C:\ClaudeCode\aero-cfd-service) spec mapping — pure functions.
// Run: node --experimental-strip-types --import ./tests/register-resolver.mjs --test tests/aero-cfd-service.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCfdCase } from '../src/aero/cfdExport.ts'
import { jobFromCase, windSpec, pickPreset, flowDirForAlpha, summarizeResult, parseStatus, ratio, nextDelay } from '../src/aero/cfdService.ts'
import { templateOf } from '../src/aero/templates.ts'
import { evaluateSpec } from '../src/aero/designSpace.ts'
import { calibratedMetric } from '../src/aero/cfdJobs.ts'

const candOf = (spec, id = 7) => {
  const x = Object.fromEntries(spec.vars.map((v) => [v.key, v.value]))
  const ev = evaluateSpec(spec, x)
  return { id, x, metrics: ev.metrics, objectives: [], feasible: true, violation: 0, pareto: false }
}
const OPTS = { mesh: 'coarse', preset: 'auto' }

test('shell → external spec: +X flow, frontal refArea, mm STL, preset by Re', () => {
  const spec = templateOf('shell')   // water, 2 m/s, L 300 mm, D 110 mm
  const c = candOf(spec)
  const { caseJson } = buildCfdCase(spec, [c], true)
  const j = jobFromCase(caseJson, 0, OPTS)
  assert.equal(j.spec.kind, 'external')
  assert.equal(j.spec.velocity, 2)
  assert.equal(j.spec.fluid, 'water')
  assert.deepEqual(j.spec.flowDirection, [1, 0, 0])
  assert.deepEqual(j.spec.liftDirection, [0, 0, 1])
  assert.equal(j.spec.units, 'mm')
  assert.equal(j.spec.mesh, 'coarse')
  assert.ok(Math.abs(j.spec.refArea - Math.PI * 0.11 ** 2 / 4) < 1e-7, 'refArea = π(D/2)² in m²')
  assert.equal(j.spec.refLength, 0.3)
  assert.ok(Math.abs(j.reynolds - 2 * 0.3 / 1e-6) < 1, 'Re with service water ν = 1e-6')
  assert.equal(j.spec.preset, 'fast-rans', 'Re 6e5 ≥ 3e5 → SST')
  assert.equal(j.estimate.Cd, c.metrics.CD)
  assert.ok(j.stlBase64.length > 1000)
  assert.equal(j.name, 'webcad-shell-7')
  // explicit preset wins
  assert.equal(jobFromCase(caseJson, 0, { mesh: 'coarse', preset: 'bluff-lowRe' }).spec.preset, 'bluff-lowRe')
  // only fields the service knows (externalCase.mjs normalizeExternalSpec)
  for (const k of Object.keys(j.spec)) assert.ok(['kind', 'velocity', 'fluid', 'flowDirection', 'liftDirection', 'units', 'mesh', 'preset', 'refArea', 'refLength'].includes(k), k)
})

test('wing → flow rotated by the estimated AoA, planform refArea, mean chord', () => {
  const spec = templateOf('wing')
  const c = candOf(spec)
  const { caseJson } = buildCfdCase(spec, [c], true)
  const j = jobFromCase(caseJson, 0, OPTS)
  const a = c.metrics.alpha * Math.PI / 180
  assert.ok(Math.abs(j.spec.flowDirection[0] - Math.cos(a)) < 1e-5 && Math.abs(j.spec.flowDirection[2] - Math.sin(a)) < 1e-5)
  assert.ok(j.spec.flowDirection[2] > 0 === a > 0, 'positive AoA → relative wind has +Z component')
  assert.ok(Math.abs(j.spec.refArea - c.metrics.area * 1e-6) < 1e-8)
  assert.ok(Math.abs(j.spec.refLength - c.metrics.area * 1e-6 / 1.2) < 1e-5)
  assert.equal(j.spec.preset, 'bluff-lowRe', 'Re ~1e5 → laminar transient')
  assert.equal(j.estimate.Cl, c.metrics.CL)
  assert.equal(j.estimate.Cd, c.metrics.CD)
  assert.deepEqual(flowDirForAlpha(0), [1, 0, 0])
})

test('prop → rotor spec: axis −Z (inflow/wake direction), rpm sign flipped, diameter m', () => {
  const spec = templateOf('prop')    // 120 mm, 2500 rpm, V 0 (static)
  const c = candOf(spec)
  const { caseJson } = buildCfdCase(spec, [c], true)
  const j = jobFromCase(caseJson, 0, OPTS)
  assert.equal(j.spec.kind, 'rotor')
  assert.deepEqual(j.spec.axis, [0, 0, -1])
  assert.equal(j.spec.rpm, -2500)
  assert.equal(j.spec.diameter, 0.12)
  assert.equal(j.spec.inflowVelocity, 0)
  assert.deepEqual(j.spec.centre, [0, 0, 0])
  assert.equal(j.spec.units, 'mm')
  assert.equal(j.estimate.thrustN, c.metrics.thrust)
  assert.equal(j.estimate.eff, c.metrics.FM, 'static → figure of merit')
  assert.ok(!('preset' in j.spec))
})

test('wind panel → external spec from axis/sign; auto axis = longest bbox extent', () => {
  const v = [0, 0, 0, 50, 0, 0, 0, 200, 0, 0, 0, 30]   // longest along Y
  const w = windSpec({ vertices: v, speed: 10, fluid: 'air', axis: null, sign: -1, mesh: 'coarse', preset: 'auto' })
  assert.equal(w.axis, 1)
  assert.deepEqual(w.spec.flowDirection, [0, -1, 0])
  assert.deepEqual(w.spec.liftDirection, [0, 0, 1])
  assert.ok(Math.abs(w.reynolds - 10 * 0.2 / 1.5e-5) < 1)
  assert.equal(w.spec.preset, 'bluff-lowRe')
  const z = windSpec({ vertices: v, speed: 10, fluid: 'water', axis: 2, sign: 1, mesh: 'medium', preset: 'fast-rans' })
  assert.deepEqual(z.spec.flowDirection, [0, 0, 1])
  assert.deepEqual(z.spec.liftDirection, [0, 1, 0], 'lift must not be parallel to flow')
  assert.equal(z.spec.preset, 'fast-rans')
  assert.equal(pickPreset('auto', 2.9e5), 'bluff-lowRe')
  assert.equal(pickPreset('auto', 3e5), 'fast-rans')
})

test('result/status parsing matches results.mjs + jobs.mjs shapes', () => {
  const ext = summarizeResult({ kind: 'external', coefficients: { Cd: 0.49, Cl: 0.01, CdStd: 0.02 }, forcesN: { solverFrame: { drag: 0.3, lift: 0.006 } }, reference: { reynolds: 6.7e4 }, convergence: { converged: true }, mesh: { cells: 224000 }, runtimeSeconds: 576, warnings: ['w'] })
  assert.equal(ext.Cd, 0.49); assert.equal(ext.dragN, 0.3); assert.equal(ext.cells, 224000); assert.equal(ext.converged, true); assert.deepEqual(ext.warnings, ['w'])
  const rot = summarizeResult({ kind: 'rotor', thrustN: 0.11, torqueNm: 0.0114, powerW: 3.6, efficiency: 0.15, figureOfMerit: null, convergence: { converged: true } })
  assert.equal(rot.thrustN, 0.11); assert.equal(rot.eff, 0.15); assert.equal(rot.effKind, 'eta')
  const st = parseStatus({ state: 'running', stage: 'solve', progress: 0.5, live: { Time: 0.1, Cd: 0.51, Cl: 0 }, queuePosition: undefined })
  assert.equal(st.liveCd, 0.51); assert.equal(st.stage, 'solve'); assert.equal(st.progress, 0.5)
  assert.equal(parseStatus({ state: 'queued', queuePosition: 2 }).queuePosition, 2)
  assert.equal(ratio(0.49, 0.47).toFixed(3), '1.043'); assert.equal(ratio(1, 0), undefined)
})

test('poll backoff + calibrated ranking', () => {
  assert.equal(nextDelay(8000, true, false), 2000)
  assert.equal(nextDelay(2000, false, false), 3000)
  assert.equal(nextDelay(14000, false, false), 15000)
  assert.equal(nextDelay(2000, false, true), 4000)
  assert.equal(nextDelay(20000, false, true), 30000)
  const cal = { shell: { Cd: { f: 2, n: 1 } } }
  assert.equal(calibratedMetric('shell', 'drag', { drag: 1.5, CD: 0.1 }, cal), 3)
  assert.equal(calibratedMetric('shell', 'drag', { drag: 1.5, CD: 0.1 }, cal, { kind: 'external', dragN: 2.2, converged: true, warnings: [] }), 2.2, 'CFD value wins')
  assert.equal(calibratedMetric('wing', 'LD', { LD: 20 }, { wing: { Cd: { f: 2, n: 1 }, Cl: { f: 1, n: 1 } } }), 10)
})
