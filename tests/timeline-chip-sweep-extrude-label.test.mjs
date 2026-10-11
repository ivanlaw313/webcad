// Timeline chip/title Formal TC: sweep sketch-profile (no misleading 半徑) + extrude through-all（貫通）.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sweepTimelineParamSummary } from '../src/ui/sweepLabel.ts'
import { extrudeTimelineParamSummary, isExtrudeThroughAll } from '../src/ui/extrudeLabel.ts'

test('sweep circle-pipe chip shows 管徑 Ø (radius meaningful)', () => {
  assert.equal(sweepTimelineParamSummary({ r: 6 }), '管徑 Ø12')
  assert.equal(sweepTimelineParamSummary({ r: 6, wall: 1.5 }), '管徑 Ø12 · 壁厚 1.5mm')
})

test('sweep sketch-profile chip shows path/profile/twist — never 半徑', () => {
  const s = sweepTimelineParamSummary({
    r: 6, // stored Ø/2 leftover — must NOT appear as 半徑
    profile: { kind: 'circle' },
    path: [[0, 0], [40, 0], [40, 30]],
    twist: 90,
  })
  assert.equal(s, '路徑 3點 · 草圖截面（圓） · 扭轉 90°')
  assert.doesNotMatch(s, /半徑/)
  assert.match(s, /草圖截面/)
  assert.match(s, /路徑/)
  assert.match(s, /扭轉/)
})

test('sweep sketch-profile with path3 + scale + guide', () => {
  const s = sweepTimelineParamSummary({
    r: 3,
    profile: { kind: 'rect' },
    path3: [[0, 0, 0], [10, 0, 0], [10, 0, 20]],
    scale: 0.5,
    guide: [[0, 5], [10, 8]],
  })
  assert.equal(s, '路徑 3點 · 草圖截面（矩形） · 縮放 0.5× · 導軌')
  assert.doesNotMatch(s, /半徑/)
})

test('sweep sketch-profile without path still says 草圖截面 (no 半徑)', () => {
  const s = sweepTimelineParamSummary({ r: 6, profile: { kind: 'poly' } })
  assert.equal(s, '草圖截面（折線）')
  assert.doesNotMatch(s, /半徑/)
})

test('extrude distance chip keeps 高度', () => {
  assert.equal(
    extrudeTimelineParamSummary({ height: 30, operation: 'new' }),
    '高度 30mm · 操作 加料',
  )
})

test('extrude cut through-all chip shows 貫通 (not only distance)', () => {
  const s = extrudeTimelineParamSummary({ height: 100, through: true, operation: 'cut' })
  assert.equal(s, '貫通 · 操作 切割')
  assert.match(s, /貫通/)
  assert.doesNotMatch(s, /高度/)
})

test('extrude through via extent also shows 貫通', () => {
  assert.equal(
    extrudeTimelineParamSummary({ height: 50, extent: 'through', operation: 'cut' }),
    '貫通 · 操作 切割',
  )
})

test('Timeline wires sweep/extrude summaries into chip title', () => {
  const tl = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
  assert.match(tl, /sweepTimelineParamSummary/)
  assert.match(tl, /extrudeTimelineParamSummary/)
  assert.match(tl, /f\.type === 'sweep'/)
  assert.match(tl, /f\.type === 'extrude'/)
  // Profile sweep must not show misleading 半徑 in quick bar
  assert.match(tl, /sel\.type === 'sweep' && \(sel as \{ profile\?: unknown \}\)\.profile/)
})

test('isExtrudeThroughAll detects through flag and extent', () => {
  assert.equal(isExtrudeThroughAll({ through: true }), true)
  assert.equal(isExtrudeThroughAll({ extent: 'through' }), true)
  assert.equal(isExtrudeThroughAll({ height: 10 }), false)
  assert.equal(isExtrudeThroughAll({ extent: 'distance' }), false)
})

test('Timeline quick-edit bar shows 貫通 for through-all (no height NumField commit)', () => {
  const tl = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
  assert.match(tl, /isExtrudeThroughAll/)
  assert.match(tl, /fe-extrude-through/)
  assert.match(tl, /fd\.key === 'height' && sel\.type === 'extrude' && isExtrudeThroughAll/)
  assert.match(tl, /tStatus\('貫通', lang\)/)
  // Must not leave height NumField as the only through-all path for extrude fields
  assert.match(tl, /FISHING23/)
})

test('Timeline extrude quick-edit META has no twist/扭轉 field (FISHING24)', () => {
  const tl = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
  // One-line extrude META (fields may nest opts []); assert that line has no twist NumField
  const line = tl.split('\n').find((l) => /^\s*extrude:\s*\{/.test(l))
  assert.ok(line, 'extrude META line present')
  assert.doesNotMatch(line, /key:\s*'twist'/)
  assert.doesNotMatch(line, /扭轉/)
  assert.match(line, /key:\s*'height'/)
  assert.match(line, /key:\s*'operation'/)
  assert.match(line, /key:\s*'plane'/)
  assert.match(tl, /FISHING24/)
  // Sweep chip summary may still mention 扭轉 — that lives on sweepTimelineParamSummary, not extrude fields
  assert.match(tl, /sweepTimelineParamSummary/)
})

test('through-all extrude quick-edit: 貫通 + no twist in extrude fields', () => {
  const tl = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
  assert.match(tl, /fe-extrude-through/)
  assert.match(tl, /fd\.key === 'height' && sel\.type === 'extrude' && isExtrudeThroughAll/)
  const line = tl.split('\n').find((l) => /^\s*extrude:\s*\{/.test(l))
  assert.ok(line)
  assert.doesNotMatch(line, /key:\s*'twist'/)
})
