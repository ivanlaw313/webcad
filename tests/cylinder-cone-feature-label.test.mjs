// FISHING27 P3: cylinder/cone CREATE primitives must not show generic「拉伸」/「原語」
// on Timeline chip title / Browser / featureDisplayName (Formal TC zh-HK).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  featureKindLabel,
  isCylinderPrimitive,
  isConePrimitive,
} from '../src/ui/featureLabel.ts'

const cyl = {
  type: 'extrude',
  profile: { kind: 'circle', c: [0, 0], r: 17.75 },
  height: 80,
  operation: 'new',
}

const cone = { type: 'prim', shape: 'cone', a: 20, b: 0, c: 40, op: 'new' }
const pyramid = { type: 'prim', shape: 'cone', a: 20, b: 0, c: 40, sides: 6, op: 'new' }
const sketchExtrude = {
  type: 'extrude',
  profile: { kind: 'circle', c: [0, 0], r: 10 },
  height: 20,
  operation: 'new',
  sketchId: 'sk1',
}
const rectExtrude = {
  type: 'extrude',
  profile: { kind: 'rect' },
  height: 10,
  operation: 'new',
}

test('isCylinderPrimitive: CREATE cylinder (circle, no sketch) only', () => {
  assert.equal(isCylinderPrimitive(cyl), true)
  assert.equal(isCylinderPrimitive({ ...cyl, operation: 'cut' }), true)
  assert.equal(isCylinderPrimitive(sketchExtrude), false)
  assert.equal(isCylinderPrimitive(rectExtrude), false)
  assert.equal(isCylinderPrimitive({ ...cyl, plane: 'XY' }), false)
  assert.equal(isCylinderPrimitive({ ...cyl, through: true }), false)
})

test('isConePrimitive: CREATE cone, not polygon pyramid', () => {
  assert.equal(isConePrimitive(cone), true)
  assert.equal(isConePrimitive(pyramid), false)
  assert.equal(isConePrimitive({ type: 'prim', shape: 'box' }), false)
})

test('featureKindLabel Formal TC: 圓柱 / 圓錐 vs fallback', () => {
  assert.equal(featureKindLabel(cyl, '拉伸'), '圓柱')
  assert.equal(featureKindLabel(cone, '原語'), '圓錐')
  assert.equal(featureKindLabel(sketchExtrude, '拉伸'), '拉伸')
  assert.equal(featureKindLabel(rectExtrude, '拉伸'), '拉伸')
  assert.equal(featureKindLabel(pyramid, '原語'), '原語')
  assert.doesNotMatch(featureKindLabel(cyl, '拉伸'), /拉伸/)
  assert.doesNotMatch(featureKindLabel(cone, '原語'), /原語/)
})

test('Timeline / Browser / store wire featureKindLabel', () => {
  const tl = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
  const bt = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.match(tl, /featureKindLabel/)
  assert.match(tl, /isCylinderPrimitive/)
  assert.match(tl, /FISHING27/)
  assert.match(tl, /titleKind/)
  assert.match(bt, /featureKindLabel/)
  assert.match(bt, /FISHING27/)
  assert.match(store, /featureKindLabel/)
  assert.match(store, /function featureTypeBase/)
  assert.match(store, /FISHING27/)
})

test('APP_VERSION stays 2.20', () => {
  const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
  assert.match(version, /APP_VERSION = '2.20'/)
})
