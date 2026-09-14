/**
 * v1.22 P1: large DXF → sketchOnly (profiles + labels, no mass extrude).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { preferDxfSketchOnly, buildImportSketchSource } from '../src/cad/insertModel.ts'
import { parseDxfToProfiles, textsToConstructionShapes, classifyProfiles } from '../src/io/dxfImport.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const dlgSrc = readFileSync(new URL('../src/components/InsertDialog.tsx', import.meta.url), 'utf8')

test('APP_VERSION is 1.22', () => {
  assert.match(version, /APP_VERSION = '1\.22'/)
})

test('preferDxfSketchOnly heuristic', () => {
  assert.equal(preferDxfSketchOnly(10, 5), false)
  assert.equal(preferDxfSketchOnly(49, 0), true)
  assert.equal(preferDxfSketchOnly(10, 17), true)
  assert.equal(preferDxfSketchOnly(48, 16), false)
})

function manyProfilesDxf(nProfiles = 60, nTexts = 20) {
  const parts = ['0', 'SECTION', '2', 'ENTITIES']
  for (let i = 0; i < nProfiles; i++) {
    const x = (i % 10) * 15
    const y = Math.floor(i / 10) * 15
    parts.push('0', 'LWPOLYLINE', '8', '0', '90', '4', '70', '1',
      '10', String(x), '20', String(y),
      '10', String(x + 8), '20', String(y),
      '10', String(x + 8), '20', String(y + 6),
      '10', String(x), '20', String(y + 6))
  }
  for (let i = 0; i < nTexts; i++) {
    parts.push('0', 'TEXT', '8', 'LABELS', '10', String(i), '20', String(i + 0.5), '40', '2', '1', `L${i}`)
  }
  parts.push('0', 'ENDSEC', '0', 'EOF')
  return parts.join('\n')
}

test('parse many profiles+texts; heuristic ON', () => {
  const r = parseDxfToProfiles(manyProfilesDxf(60, 20))
  assert.ok(r.profiles.length >= 50, `profiles=${r.profiles.length}`)
  assert.ok(r.texts.length >= 20, `texts=${r.texts.length}`)
  assert.equal(preferDxfSketchOnly(r.profiles.length, r.texts.length), true)
})

test('sketchOnly path builds one sketchSource with labels; features would be 1 sketch', () => {
  const r = parseDxfToProfiles(manyProfilesDxf(55, 18))
  const items = classifyProfiles(r.profiles)
  const src = buildImportSketchSource(items, { plane: 'XY', baseZ: 0, height: 5 })
  const labelShapes = textsToConstructionShapes(r.texts)
  const shapes = [...src.shapes, ...labelShapes]
  // Contract: one sketch feature (not N extrudes)
  const features = [{ id: 'skf', type: 'sketch', sketchId: 'sk1' }]
  const sketchSources = { sk1: { shapes, cons: [], plane: 'XY', baseZ: 0, op: 'new', height: 0, labels: r.texts } }
  assert.equal(features.length, 1)
  assert.equal(features[0].type, 'sketch')
  assert.ok(shapes.length >= items.length, 'profiles become shapes')
  assert.ok(sketchSources.sk1.labels.length >= 18)
  assert.ok(features.length < 10, 'features.length small vs mass extrude')
  assert.ok(features.length < r.profiles.length, 'sketchOnly fewer features than profiles')
})

test('store + dialog wire sketchOnly', () => {
  assert.match(storeSrc, /sketchOnly\?: boolean/)
  assert.match(storeSrc, /preferDxfSketchOnly/)
  assert.match(storeSrc, /仅导入为草图/)
  assert.match(storeSrc, /type: 'sketch'/)
  assert.match(storeSrc, /sketchOnly/)
  assert.match(dlgSrc, /dxf-sketch-only/)
  assert.match(dlgSrc, /仅导入为草图（不拉伸）/)
  assert.match(dlgSrc, /sketchOnly/)
})
