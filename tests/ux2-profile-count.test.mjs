import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sketchProfileCount } from '../src/sketch/profileCount.ts'

test('UX2 #8: closed profiles vs open lines, construction ignored', () => {
  const r = sketchProfileCount([
    { type: 'rect' }, { type: 'circle' },
    { type: 'poly', open: true, pts: [[0, 0], [10, 0]] },
    { type: 'poly', open: true, pts: [[0, 0], [10, 0], [10, 10], [0, 0]] },
    { type: 'poly', construction: true, pts: [[0, 0], [0, 10]] },
    { type: 'poly', pts: [[0, 0], [30, 0], [30, 35], [0, 40]] },
  ])
  assert.deepEqual(r, { closed: 4, open: 1 })
})
test('UX2 #8: tree row + revolve axis line + hint are wired', () => {
  const tree = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
  assert.match(tree, /sketchProfileCount/); assert.match(tree, /data-profile-count/)
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(vp, /<RevolveAxisLine \/>/); assert.match(vp, /revolve-axis-hint/)
  assert.match(readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8'), /export function RevolveAxisLine/)
})
