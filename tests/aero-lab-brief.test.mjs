// Aero Design Lab — brief → design space (AI JSON validation + deterministic fallback) and the
// CFD hand-off case format / STL writer.
import test from 'node:test'
import assert from 'node:assert/strict'
import { specFromBriefFallback, validateSpec, extractJson, detectKind, specFromBrief } from '../src/aero/brief.ts'
import { runAeroOptimization } from '../src/aero/optimize/runner.ts'
import { buildCfdCase, cfdCaseZip, sendToCfd } from '../src/aero/cfdExport.ts'
import { designMesh, meshToStl, meshVolume } from '../src/aero/geometry.ts'
import { propTemplate, wingTemplate, shellTemplate } from '../src/aero/templates.ts'
import { unzipSync, strFromU8 } from 'fflate'

test('fallback parser: the three owner briefs map to the right template with parsed numbers', () => {
  const fan = specFromBriefFallback('120mm 靜音風扇，2500rpm，要最高效率')
  assert.equal(fan.kind, 'prop')
  assert.equal(fan.fixed.diameter, 120)
  assert.equal(fan.fixed.rpm, 2500)
  assert.deepEqual(fan.objectives.map((o) => o.key), ['eff', 'noise'])
  const wing = specFromBriefFallback('滑翔機翼 1.2m 翼展 最高升阻比')
  assert.equal(wing.kind, 'wing')
  assert.equal(wing.fixed.span, 1200)
  assert.deepEqual(wing.objectives, [{ key: 'LD', sense: 'max' }])
  const hull = specFromBriefFallback('水底推進器 殼要最低水阻')
  assert.equal(hull.kind, 'shell')
  assert.equal(hull.fixed.fluid, 'water')
  assert.deepEqual(hull.objectives, [{ key: 'drag', sense: 'min' }])
  assert.equal(detectKind('10 inch drone propeller 8000 rpm'), 'prop')
  const p = specFromBriefFallback('10 inch drone propeller 8000 rpm, 12 m/s, thrust 6 N')
  assert.equal(p.fixed.diameter, 254); assert.equal(p.fixed.V, 12)
  assert.deepEqual(p.constraints[0], { key: 'thrust', op: '>=', value: 6 })
  // deterministic
  assert.deepEqual(specFromBriefFallback('滑翔機翼 1.2m 翼展 最高升阻比'), wing)
})

test('validateSpec: accepts a well-formed AI answer, clamps to hard limits, fills template defaults', () => {
  const reply = 'Sure! ```json\n{"kind":"prop","title":"quiet fan","fixed":{"diameter":120,"rpm":2500,"V":0,"fluid":"air"},"vars":[{"key":"blades","min":3,"max":40},{"key":"pitchRatio","min":0.3,"max":1.2},{"key":"camber","min":0,"max":7}],"objectives":[{"key":"eff","sense":"max"},{"key":"noise","sense":"min"}],"constraints":[{"key":"thrust","op":">=","value":0.08}]}\n```'
  const chk = validateSpec(extractJson(reply))
  assert.ok(chk.ok, chk.errors.join(';'))
  const b = chk.spec.vars.find((v) => v.key === 'blades')
  assert.equal(b.max, 12, 'blades clamped to hard limit'); assert.equal(b.int, true)
  assert.ok('chord25' in chk.spec.fixed, 'unmentioned template vars become fixed')
  const r = runAeroOptimization(chk.spec, { budget: 200, seed: 1 })
  assert.ok(r.candidates.length > 0)
})

test('validateSpec: rejects unknown keys, bad senses and empty ranges', () => {
  assert.equal(validateSpec({ kind: 'boat' }).ok, false)
  assert.equal(validateSpec({ kind: 'wing', vars: [{ key: 'warp', min: 0, max: 1 }], objectives: [{ key: 'LD', sense: 'max' }] }).ok, false)
  assert.equal(validateSpec({ kind: 'wing', vars: [{ key: 'taper', min: 0.5, max: 0.5 }], objectives: [{ key: 'LD', sense: 'max' }] }).ok, false)
  assert.equal(validateSpec({ kind: 'wing', vars: [{ key: 'taper', min: 0.3, max: 1 }], objectives: [{ key: 'LD', sense: 'up' }] }).ok, false)
  assert.equal(validateSpec(extractJson('no json here')).ok, false)
})

test('specFromBrief: no key → deterministic fallback; unreachable provider → fallback with note', async () => {
  const a = await specFromBrief('滑翔機翼 1.2m 翼展 最高升阻比', null)
  assert.equal(a.usedAi, false); assert.equal(a.spec.kind, 'wing')
  const b = await specFromBrief('水底推進器 殼要最低水阻', { provider: 'local', apiKey: '', model: 'x', baseUrl: 'http://127.0.0.1:9' })
  assert.equal(b.usedAi, false); assert.match(b.note, /error/); assert.equal(b.spec.kind, 'shell')
})

test('STL writer + CFD case: binary layout, candidates, offline zip; client stub fails gracefully', async () => {
  const spec = shellTemplate()
  const x = Object.fromEntries(spec.vars.map((v) => [v.key, v.value]))
  const m = designMesh(spec, x)
  const stl = meshToStl(m)
  assert.equal(stl.byteLength, 84 + 50 * (m.triangles.length / 3))
  assert.equal(new DataView(stl).getUint32(80, true), m.triangles.length / 3)
  assert.ok(meshVolume(m) > 0)
  const r = runAeroOptimization(spec, { budget: 150, seed: 3, topN: 3 })
  const { caseJson, stls } = buildCfdCase(spec, r.candidates, false)
  assert.equal(caseJson.schema, 'webcad.aero.cfd-case/1')
  assert.equal(caseJson.candidates.length, r.candidates.length)
  assert.equal(Object.keys(stls).length, r.candidates.length)
  assert.equal(caseJson.fluid.kind, 'water')
  const files = unzipSync(cfdCaseZip(spec, r.candidates))
  assert.ok(files['case.json'] && JSON.parse(strFromU8(files['case.json'])).candidates.length === r.candidates.length)
  const res = await sendToCfd('http://127.0.0.1:9', spec, r.candidates.slice(0, 1), 1500)
  assert.equal(res.ok, false)
  assert.ok(res.error)
  for (const mk of [propTemplate, wingTemplate]) {
    const s = mk(); const xx = Object.fromEntries(s.vars.map((v) => [v.key, v.value]))
    assert.ok(meshVolume(designMesh(s, xx)) > 0, `${s.kind} mesh outward-oriented`)
  }
})
