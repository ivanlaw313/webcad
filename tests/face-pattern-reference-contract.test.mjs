// Face Pattern cannot safely use a transient Three.js faceIndex.  This contract keeps the
// worker API on the persistent-reference path used by the existing B-rep feature rebuilds.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const worker = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')

test('Face Pattern reference capture returns complete ordered v1/v2/topology triples', () => {
  assert.match(worker, /async captureFaceRefs\(nears: \[number, number, number\]\[\]\)/)
  assert.match(worker, /const refs = _ffCapture\(current, nears\)/)
  assert.match(worker, /refs\.v1\.length === nears\.length/)
  assert.match(worker, /refs\.v2\.length === nears\.length/)
  assert.match(worker, /refs\.topo\.length === nears\.length/)
})

test('Face Pattern reference capture is read-only and triangulates before fingerprint capture', () => {
  const method = worker.slice(worker.indexOf('async captureFaceRefs('), worker.indexOf('\n  },\n}', worker.indexOf('async captureFaceRefs(')))
  assert.match(method, /mesh\(\{ tolerance: 0\.1, angularTolerance: 0\.5 \}\)/)
  assert.doesNotMatch(method, /current\s*=/)
  assert.doesNotMatch(method, /shape\s*=/)
})

test('Face Pattern is enabled end-to-end and preserves B-rep surface semantics', () => {
  assert.match(viewport, /option value="faces">/)
  assert.match(viewport, /startFacePatternPick\(\)/)
  assert.match(viewport, /facePatternPicks\.length/)
  assert.match(store, /facePatternPick: boolean/)
  assert.match(store, /objectType: f\.objectType/)
  assert.match(store, /facePatternPicks: \(f\.type === 'pattern' \|\| f\.type === 'circPattern'\)/)
  assert.match(store, /type: 'pattern'.*nears: faceNears/s)
  assert.match(store, /type: 'circPattern'.*nears: circFaceNears/s)
  assert.match(worker, /function facePatternCopies/)
  assert.match(worker, /BRepBuilderAPI_Transform_2/)
  assert.match(worker, /Face Pattern \(surface\)/)
  assert.match(worker, /Circular Face Pattern \(surface\)/)
})

test('Face Pattern surface copies can be selected directly for whole-quilt Thicken', () => {
  // Commercial workflow: no brittle "surface #N" prompt after Pattern has made multiple sheets.
  assert.match(store, /quiltPickMode: boolean/)
  assert.match(store, /startQuiltPick: \(\) =>/)
  assert.match(store, /thickenParkedAt: async \(target\)/)
  assert.match(store, /if \(pkt\.length > 1\) \{ get\(\)\.startQuiltPick\(\); return \}/)
  assert.match(viewport, /pickable=\{editPolesMode \|\| quiltPickMode\}/)
  assert.match(viewport, /thickenParkedAt\(idx\)/)
  assert.match(viewport, /function QuiltPickPanel\(\)/)
  // The workflow must be discoverable on the Surface ribbon, rather than hidden in a menu.
  assert.match(ribbon, /id: 'thickenquilt', label: '加厚整张曲面', icon: 'shell', quick: true/)
})
