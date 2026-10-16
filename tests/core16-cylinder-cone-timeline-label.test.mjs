/**
 * CORE16 residual: Cylinder/Cone timeline / feature chip must NOT show「拉伸」.
 * Spirit of cylinder-cone-feature-label / FISHING27 Formal TC zh-HK labels.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  featureKindLabel,
  isCylinderPrimitive,
  isConePrimitive,
} from '../src/ui/featureLabel.ts'

const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')

const cyl = {
  type: 'extrude',
  profile: { kind: 'circle', c: [0, 0], r: 17.75 },
  height: 80,
  operation: 'new',
}
const cone = { type: 'prim', shape: 'cone', a: 20, b: 0, c: 40, op: 'new' }
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
const pyramid = { type: 'prim', shape: 'cone', a: 20, b: 0, c: 40, sides: 6, op: 'new' }

test('isCylinderPrimitive / isConePrimitive: CREATE only', () => {
  assert.equal(isCylinderPrimitive(cyl), true)
  assert.equal(isConePrimitive(cone), true)
  assert.equal(isCylinderPrimitive(sketchExtrude), false)
  assert.equal(isCylinderPrimitive(rectExtrude), false)
  assert.equal(isConePrimitive(pyramid), false)
})

test('featureKindLabel: 圓柱 / 圓錐 — never「拉伸」on CREATE cylinder/cone', () => {
  assert.equal(featureKindLabel(cyl, '拉伸'), '圓柱')
  assert.equal(featureKindLabel(cone, '原語'), '圓錐')
  assert.doesNotMatch(featureKindLabel(cyl, '拉伸'), /拉伸/)
  assert.doesNotMatch(featureKindLabel(cone, '原語'), /拉伸|原語/)
  // Real sketch / rect extrude keep 拉伸
  assert.equal(featureKindLabel(sketchExtrude, '拉伸'), '拉伸')
  assert.equal(featureKindLabel(rectExtrude, '拉伸'), '拉伸')
})

test('Timeline chip: wires featureKindLabel + titleKind (FISHING27); no bare META 拉伸 for cyl', () => {
  const tl = rd('src/components/Timeline.tsx')
  assert.match(tl, /featureKindLabel/)
  assert.match(tl, /isCylinderPrimitive/)
  assert.match(tl, /FISHING27/)
  assert.match(tl, /titleKind/)
  // Chip title path uses kindLabel / titleKind from featureKindLabel
  assert.match(tl, /const kindLabel = featureKindLabel/)
  assert.match(tl, /const titleKind = kindLabel/)
  // META still has extrude→拉伸 fallback (generic), but cylinder overrides via featureKindLabel
  assert.match(tl, /extrude:[\s\S]{0,80}?label: '拉伸'/)
})

test('BrowserTree + store featureTypeBase / featureDisplayName use Formal kind', () => {
  const bt = rd('src/components/BrowserTree.tsx')
  const st = rd('src/store.ts')
  assert.match(bt, /featureKindLabel/)
  assert.match(bt, /FISHING27/)
  assert.match(st, /function featureTypeBase/)
  assert.match(st, /featureKindLabel\(f[\s\S]{0,80}?FEATURE_TYPE_LABEL/)
  assert.match(st, /FISHING27 P3：圓柱／圓錐/)
  // featureTypeBase must not hardcode 拉伸 for cylinder path
  assert.match(st, /return featureKindLabel/)
})

test('featureLabel module: Formal TC constants 圓柱／圓錐 present; no SC leak', () => {
  const fl = rd('src/ui/featureLabel.ts')
  assert.match(fl, /return '圓柱'/)
  assert.match(fl, /return '圓錐'/)
  assert.doesNotMatch(fl, /return '圆柱'|return '圆锥'|return '拉伸'/)
})

test('APP_VERSION stays 2.20', () => {
  const version = rd('src/version.ts')
  assert.match(version, /APP_VERSION = '2\.20'/)
})
