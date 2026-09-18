/**
 * v1.35: DXF schematic scene OOM — merged LineSegments, schematic TEXT marker budget,
 * label display cap, import yields, fill skip.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import {
  preferDxfSketchOnly,
  forceDxfSketchOnly,
  DXF_MAX_TEXT_MARKERS as MODEL_MARK_CAP,
  DXF_SCHEMATIC_TEXT_MARKERS,
} from '../src/cad/insertModel.ts'
import {
  parseDxfToProfiles,
  textsToConstructionShapes,
  classifyProfiles,
  DXF_MAX_TEXT_MARKERS,
} from '../src/io/dxfImport.ts'
import {
  batchSketchPositions,
  dxfTextMarkerBudget,
  appendPolylineSegments,
  SKETCH_BATCH_THRESHOLD,
  SKETCH_FILL_SKIP_THRESHOLD,
  DXF_LABEL_DISPLAY_CAP,
  DXF_SCHEMATIC_TEXT_MARKERS as BATCH_SCHEMATIC_CAP,
} from '../src/cad/sketchDisplayBatch.ts'
import { buildImportSketchSource } from '../src/cad/insertModel.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const layerSrc = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
const batchSrc = readFileSync(new URL('../src/cad/sketchDisplayBatch.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.35', () => {
  assert.match(version, /APP_VERSION = '1\.35'/)
})

test('batch helpers + thresholds exported', () => {
  assert.equal(SKETCH_BATCH_THRESHOLD, 48)
  assert.equal(SKETCH_FILL_SKIP_THRESHOLD, 48)
  assert.equal(DXF_LABEL_DISPLAY_CAP, 64)
  assert.equal(DXF_SCHEMATIC_TEXT_MARKERS, 16)
  assert.equal(BATCH_SCHEMATIC_CAP, 16)
  assert.equal(MODEL_MARK_CAP, 128)
  assert.match(batchSrc, /batchSketchPositions/)
  assert.match(batchSrc, /appendDashedPolyline/)
})

test('polyline segments pack as pairs', () => {
  const out = []
  appendPolylineSegments(out, [[0, 0, 0], [1, 0, 0], [1, 1, 0]], false)
  assert.equal(out.length, 12) // 2 segments × 2 pts × 3
})

test('batchSketchPositions merges many shapes into 2 buffers', () => {
  const shapes = []
  for (let i = 0; i < 60; i++) {
    shapes.push({ type: 'poly', pts: [[i, 0], [i + 1, 0], [i + 1, 1], [i, 1]], open: false })
  }
  for (let i = 0; i < 20; i++) {
    shapes.push({ type: 'poly', pts: [[i, 10], [i + 2, 10]], open: true, construction: true })
  }
  const lift = ([x, y]) => [x, 0, y]
  const b = batchSketchPositions(shapes, lift)
  assert.ok(b.solid.length > 0)
  assert.ok(b.constr.length > 0)
  assert.ok(b.solidCount >= 60) // at least one seg per rect edge chain
  assert.ok(shapes.length >= SKETCH_BATCH_THRESHOLD)
})

test('schematic marker budget drops to 16 under prefer/force', () => {
  assert.equal(dxfTextMarkerBudget(false, false, 128, 16), 128)
  assert.equal(dxfTextMarkerBudget(true, false, 128, 16), 16)
  assert.equal(dxfTextMarkerBudget(false, true, 128, 16), 16)
  const texts = Array.from({ length: 193 }, (_, i) => ({ at: [i, 0], text: `L${i}`, height: 2.5 }))
  const capped = textsToConstructionShapes(texts, { maxMarkers: DXF_SCHEMATIC_TEXT_MARKERS })
  assert.equal(capped.length, DXF_SCHEMATIC_TEXT_MARKERS * 2)
  assert.ok(capped.length < DXF_MAX_TEXT_MARKERS * 2)
})

test('AL1: schematic path — few markers, still all labels conceptually, batch threshold', () => {
  const candidates = [
    '/workspace/AL1-800A-schematic.dxf',
    '/workspace/AL1-800A-配电箱.dxf',
    new URL('../examples/fixtures/AL1-800A-schematic.dxf', import.meta.url).pathname,
  ]
  const al1 = candidates.find((p) => existsSync(p))
  assert.ok(al1, 'AL1 fixture missing')
  const text = readFileSync(al1, 'utf8')
  const r = parseDxfToProfiles(text)
  assert.ok(preferDxfSketchOnly(r.profiles.length, r.texts.length, text.length))
  assert.ok(forceDxfSketchOnly(r.profiles.length, r.texts.length, text.length)) // 193 texts > 80
  const budget = dxfTextMarkerBudget(true, true, DXF_MAX_TEXT_MARKERS, DXF_SCHEMATIC_TEXT_MARKERS)
  assert.equal(budget, 16)
  const markers = textsToConstructionShapes(r.texts, { maxMarkers: budget })
  assert.equal(markers.length, 32)
  const items = classifyProfiles(r.profiles)
  const src = buildImportSketchSource(items, { plane: 'XY', baseZ: 0, op: 'new', height: 0 })
  const shapes = [...src.shapes, ...markers]
  assert.ok(shapes.length >= SKETCH_BATCH_THRESHOLD, `shapes=${shapes.length}`)
  assert.ok(shapes.length < 200, `expected <<372 after marker cut, got ${shapes.length}`)
  const lift = ([x, y]) => [x, 0.05, y]
  const batched = batchSketchPositions(shapes, lift)
  // Object count proxy: 2 buffers instead of shapes.length Line meshes
  assert.equal([batched.solid, batched.constr].filter((a) => a.length).length, 2)
  assert.ok(batched.solidCount > 50)
  // Labels retained count (data) >> display cap
  assert.ok(r.texts.length > DXF_LABEL_DISPLAY_CAP)
})

test('store + SketchLayer wire v1.35: yield, batch, label cap, fill skip', () => {
  assert.match(storeSrc, /dxfTextMarkerBudget/)
  assert.match(storeSrc, /DXF_SCHEMATIC_TEXT_MARKERS/)
  assert.match(storeSrc, /yieldFrame|requestAnimationFrame/)
  assert.match(layerSrc, /batchSketchPositions/)
  assert.match(layerSrc, /BatchedSketchLines|lineSegments/)
  assert.match(layerSrc, /SKETCH_BATCH_THRESHOLD/)
  assert.match(layerSrc, /SKETCH_FILL_SKIP_THRESHOLD/)
  assert.match(layerSrc, /DXF_LABEL_DISPLAY_CAP/)
})
