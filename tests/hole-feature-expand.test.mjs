import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

async function loadModule() {
  const source = readFileSync(new URL('../src/cad/holeFeature.ts', import.meta.url), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    fileName: 'holeFeature.ts',
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}

const { expandHoleFeature } = await loadModule()

test('simple through and To Next holes expand to one existing cut extrude', () => {
  const through = expandHoleFeature({ id: 'H1', kind: 'simple', center: [3, 4], top: 20, diameter: 6, extent: 'through-all' })
  assert.deepEqual(through, [{ id: 'H1:drill', type: 'extrude', profile: { kind: 'circle', c: [3, 4], r: 3 }, height: 30, operation: 'cut', baseZ: 0 }])

  const next = expandHoleFeature({ id: 'H2', kind: 'simple', center: [0, 0], top: 20, diameter: 4, extent: 'to-next', nextFaceZ: 8 })
  assert.equal(next.length, 1)
  assert.equal(next[0].type, 'extrude')
  assert.equal(next[0].baseZ, 8)
  assert.equal(next[0].height, 17)
})

test('counterbore and countersink retain their two-stage existing-feature geometry', () => {
  const cb = expandHoleFeature({ id: 'H3', kind: 'counterbore', center: [1, 2], top: 12, diameter: 4, through: true, counterbore: { diameter: 9, depth: 3 } })
  assert.equal(cb.length, 2)
  assert.equal(cb[0].type, 'extrude')
  assert.equal(cb[1].type, 'extrude')
  assert.equal(cb[1].profile.r, 4.5)
  assert.equal(cb[1].baseZ, 9)

  const cs = expandHoleFeature({ id: 'H4', kind: 'countersink', center: [1, 2], top: 12, diameter: 4, through: true, countersink: { diameter: 8, angle: 90 } })
  assert.equal(cs.length, 2)
  assert.equal(cs[1].type, 'loft')
  assert.equal(cs[1].op, 'cut')
})

test('non-modeled tapped hole expands to its stored tap-drill diameter, not nominal diameter', () => {
  const [tap] = expandHoleFeature({ id: 'H5', kind: 'tapped', center: [0, 0], top: 10, diameter: 6, through: false, depth: 7, tap: { drillDiameter: 5, nominalDiameter: 6, pitch: 1 } })
  assert.equal(tap.type, 'extrude')
  assert.equal(tap.profile.r, 2.5)
  assert.equal(tap.baseZ, 3)
  assert.equal(tap.height, 12)
})

test('nominal diameter and print clearance stay as UI metadata without changing kernel expansion', () => {
  const [cut] = expandHoleFeature({ id: 'H6', kind: 'simple', center: [0, 0], top: 12, diameter: 6.4, nominalDiameter: 6, clearance: 0.4, through: true })
  assert.equal(cut.profile.r, 3.2)
})

test('blind drill point and through-hole mouth chamfer expand as stable extra cut features', () => {
  const blind = expandHoleFeature({ id: 'H7', kind: 'simple', center: [0, 0], top: 20, diameter: 6, depth: 10, drillPoint: { angle: 118 } })
  assert.equal(blind.length, 2)
  assert.equal(blind[1].id, 'H7:drill-point')
  assert.equal(blind[1].type, 'loft')

  const through = expandHoleFeature({ id: 'H8', kind: 'simple', center: [0, 0], top: 20, diameter: 6, through: true, chamfer: 1.5 })
  assert.equal(through.length, 2)
  assert.equal(through[1].id, 'H8:mouth-chamfer')
  assert.equal(through[1].type, 'loft')
})

test('multiple centers from one Hole command expand with stable child IDs while staying one parent payload', () => {
  const features = expandHoleFeature({ id: 'BC1', kind: 'simple', center: [0, 0], centers: [[10, 0], [-10, 0], [0, 10]], top: 12, diameter: 4, through: true, pattern: { kind: 'bolt-circle', origin: [0, 0], count: 3, pcd: 20 } })
  assert.equal(features.length, 3)
  assert.deepEqual(features.map((f) => f.id), ['BC1:0:drill', 'BC1:1:drill', 'BC1:2:drill'])
})
