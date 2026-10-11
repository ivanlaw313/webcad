// P3: dual-distance chamfer timeline chip/title must show both distances (Formal TC).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chamferTimelineParamSummary } from '../src/ui/chamferLabel.ts'

test('equal chamfer chip shows 距離 Nmm', () => {
  assert.equal(chamferTimelineParamSummary({ distance: 2, cmode: 'equal' }), '距離 2mm')
  assert.equal(chamferTimelineParamSummary({ distance: 2 }), '距離 2mm')
})

test('dual-distance chamfer chip shows 倒角 Cd1×d2 (both legs)', () => {
  assert.equal(chamferTimelineParamSummary({ distance: 2, dist2: 5, cmode: 'two' }), '倒角 C2×5')
  assert.equal(chamferTimelineParamSummary({ distance: 2.5, dist2: 5.25, cmode: 'two' }), '倒角 C2.5×5.25')
  assert.notEqual(chamferTimelineParamSummary({ distance: 2, dist2: 5, cmode: 'two' }), '距離 2mm')
})

test('angle chamfer chip shows C∠', () => {
  assert.equal(chamferTimelineParamSummary({ distance: 2, angle: 45, cmode: 'angle' }), '倒角 C2∠45°')
})

test('Timeline wires chamferTimelineParamSummary into chip title', () => {
  const tl = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
  assert.match(tl, /chamferTimelineParamSummary/)
  assert.match(tl, /f\.type === 'chamfer'/)
})

test('FEATURE_TYPE_LABEL maps prim → 原語 (reorder refuse, not raw id)', () => {
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.match(store, /prim:\s*'原語'/)
  assert.match(store, /function featureDisplayName/)
})

test('Timeline META/feat-editor exposes dist2 for dual-distance chamfer only', () => {
  const tl = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
  // META lists both 距離 + 距離2
  assert.match(tl, /chamfer:[\s\S]*?fields:\s*\[[\s\S]*?key:\s*'distance'[\s\S]*?key:\s*'dist2'[\s\S]*?label:\s*'距離2'/)
  // Quick bar hides dist2 unless cmode === 'two'
  assert.match(tl, /fd\.key === 'dist2'.*cmode !== 'two'/)
  // equal/angle must not force dist2 (guard present)
  assert.match(tl, /cmode !== 'two'.*return null/)
  // dist2 is a positive-length key (refuse ≤0 like distance)
  assert.match(tl, /'distance',\s*'dist2'/)
})
