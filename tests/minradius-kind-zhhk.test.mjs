// Regression: i18n zh-HK lane changed store inspectInfo.kind to '最小曲率半徑' while
// CurvatureOverlay / InspectorPanel still compared against '最小曲率半径' → red min-radius
// marker and 「最弯处」 label silently disappeared. Comparisons must go through isMinRadiusKind.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MIN_RADIUS_KIND, isMinRadiusKind } from '../src/cad/curvatureAnalysis.ts'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

test('isMinRadiusKind accepts the emitted kind and the legacy simplified marker', () => {
  assert.equal(isMinRadiusKind(MIN_RADIUS_KIND), true)
  assert.equal(isMinRadiusKind('最小曲率半径'), true)
  assert.equal(isMinRadiusKind('最小曲率半徑'), true)
  assert.equal(isMinRadiusKind('曲率'), false)
  assert.equal(isMinRadiusKind(undefined), false)
})

test('store emits MIN_RADIUS_KIND and consumers use isMinRadiusKind (no hard-coded literal)', () => {
  const store = read('../src/store.ts')
  assert.match(store, /inspectInfo: \{ kind: MIN_RADIUS_KIND,/)
  for (const p of ['../src/components/CurvatureOverlay.tsx', '../src/components/InspectorPanel.tsx']) {
    const src = read(p)
    assert.match(src, /isMinRadiusKind\(info\.kind\)/, p)
    assert.doesNotMatch(src, /info\.kind\s*[!=]==\s*'最小曲率半/, p)
  }
})
