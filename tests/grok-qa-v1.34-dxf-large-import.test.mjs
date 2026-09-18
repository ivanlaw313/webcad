/**
 * v1.34: large DXF / schematic — spatial-hash chain, harder sketchOnly, TEXT marker cap,
 * parse cache wiring, reject caps.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import {
  preferDxfSketchOnly,
  forceDxfSketchOnly,
  rejectDxfImport,
  DXF_SOFT_PROFILE,
  DXF_SOFT_TEXT,
  DXF_FORCE_PROFILE,
  DXF_FORCE_TEXT,
  DXF_MAX_TEXT_MARKERS as MODEL_MARK_CAP,
} from '../src/cad/insertModel.ts'
import {
  parseDxfToProfiles,
  textsToConstructionShapes,
  classifyProfiles,
  DXF_MAX_TEXT_MARKERS,
} from '../src/io/dxfImport.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const dlgSrc = readFileSync(new URL('../src/components/InsertDialog.tsx', import.meta.url), 'utf8')
const dxfSrc = readFileSync(new URL('../src/io/dxfImport.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.34+', () => {
  assert.match(version, /APP_VERSION = '1\.(3[4-9]|[4-9]\d)'/)
})

test('spatial-hash chain present (not O(n²) full scan)', () => {
  assert.match(dxfSrc, /spatial-hash|endIndex|CELL/)
  assert.doesNotMatch(dxfSrc, /for \(let k = 0; k < segs\.length; k\+\+\) \{\s*\n\s*if \(used\[k\]\) continue/)
})

function makeDisconnected(n) {
  const s = ['0', 'SECTION', '2', 'ENTITIES']
  for (let i = 0; i < n; i++) {
    const x = i * 10, y = i * 10
    s.push('0', 'LINE', '8', '0', '10', String(x), '20', String(y), '11', String(x + 0.01), '21', String(y))
  }
  s.push('0', 'ENDSEC', '0', 'EOF')
  return s.join('\n')
}

test('20k disconnected LINEs parse in under 1.5s (was ~10s O(n²))', () => {
  const text = makeDisconnected(20000)
  const t0 = performance.now()
  const r = parseDxfToProfiles(text)
  const ms = performance.now() - t0
  assert.ok(ms < 1500, `parse took ${ms.toFixed(0)}ms`)
  assert.equal(r.profiles.length, 0)
  assert.ok(r.stats.entityCount >= 20000)
})

test('connected square still chains to one closed profile', () => {
  const sq = [
    '0', 'SECTION', '2', 'ENTITIES',
    '0', 'LINE', '10', '0', '20', '0', '11', '10', '21', '0',
    '0', 'LINE', '10', '10', '20', '0', '11', '10', '21', '10',
    '0', 'LINE', '10', '10', '20', '10', '11', '0', '21', '10',
    '0', 'LINE', '10', '0', '20', '10', '11', '0', '21', '0',
    '0', 'ENDSEC', '0', 'EOF',
  ].join('\n')
  const r = parseDxfToProfiles(sq)
  assert.equal(r.profiles.length, 1)
  assert.equal(r.profiles[0].kind, 'poly')
  assert.ok(r.profiles[0].pts.length >= 4)
})

test('harder soft + force sketchOnly heuristics', () => {
  assert.equal(DXF_SOFT_PROFILE, 32)
  assert.equal(DXF_SOFT_TEXT, 12)
  assert.equal(preferDxfSketchOnly(10, 5), false)
  assert.equal(preferDxfSketchOnly(33, 0), true)
  assert.equal(preferDxfSketchOnly(0, 13), true)
  assert.equal(preferDxfSketchOnly(0, 0, 600 * 1024), true)
  assert.equal(forceDxfSketchOnly(DXF_FORCE_PROFILE, 0), false)
  assert.equal(forceDxfSketchOnly(DXF_FORCE_PROFILE + 1, 0), true)
  assert.equal(forceDxfSketchOnly(0, DXF_FORCE_TEXT + 1), true)
  assert.equal(forceDxfSketchOnly(0, 0, 2 * 1024 * 1024 + 1), true)
})

test('reject caps for absurd files', () => {
  assert.ok(rejectDxfImport(9 * 1024 * 1024))
  assert.ok(rejectDxfImport(1000, 100_001))
  assert.equal(rejectDxfImport(1000, 100), null)
})

test('TEXT construction markers capped; labels conceptually retained', () => {
  assert.equal(DXF_MAX_TEXT_MARKERS, 128)
  assert.equal(MODEL_MARK_CAP, 128)
  const texts = Array.from({ length: 300 }, (_, i) => ({ at: [i, 0], text: `L${i}`, height: 2.5 }))
  const all = textsToConstructionShapes(texts)
  const capped = textsToConstructionShapes(texts, { maxMarkers: DXF_MAX_TEXT_MARKERS })
  assert.equal(all.length, 600)
  assert.equal(capped.length, DXF_MAX_TEXT_MARKERS * 2)
})

test('parse cancel via signal', () => {
  const text = makeDisconnected(5000)
  const sig = { aborted: false }
  // abort immediately
  sig.aborted = true
  const r = parseDxfToProfiles(text, { signal: sig })
  assert.equal(r.stats.cancelled, true)
  assert.equal(r.note, 'DXF 导入已取消')
})

test('AL1 sample: sketchOnly prefer ON; marker budget', () => {
  const candidates = [
    '/workspace/AL1-800A-schematic.dxf',
    '/workspace/AL1-800A-配电箱.dxf',
    new URL('../examples/fixtures/AL1-800A-schematic.dxf', import.meta.url).pathname,
  ]
  const al1 = candidates.find((p) => existsSync(p))
  if (!al1) return // skip if sample missing on runner
  const text = readFileSync(al1, 'utf8')
  const r = parseDxfToProfiles(text)
  assert.ok(r.profiles.length > 48, `profiles=${r.profiles.length}`)
  assert.ok(r.texts.length > 16, `texts=${r.texts.length}`)
  assert.equal(preferDxfSketchOnly(r.profiles.length, r.texts.length, text.length), true)
  const markers = textsToConstructionShapes(r.texts, { maxMarkers: DXF_MAX_TEXT_MARKERS })
  assert.ok(markers.length <= DXF_MAX_TEXT_MARKERS * 2)
  const items = classifyProfiles(r.profiles)
  assert.equal(items.length, r.profiles.length)
})

test('store + dialog wire v1.34: parseCache, forceSketchOnly, epoch, marker cap', () => {
  assert.match(storeSrc, /parseCache/)
  assert.match(storeSrc, /forceDxfSketchOnly/)
  assert.match(storeSrc, /rejectDxfImport/)
  assert.match(storeSrc, /dxfImportEpoch/)
  assert.match(storeSrc, /maxMarkers/)
  assert.match(storeSrc, /forceSketchOnly/)
  assert.match(dlgSrc, /forceSketchOnly/)
  assert.match(dlgSrc, /dxf-import-stats/)
  assert.match(dlgSrc, /disabled=\{\!\!v\.forceSketchOnly\}/)
})
