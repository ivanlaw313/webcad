import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'

const lab = fs
  .readFileSync(new URL('../src/components/PhysicsLab.tsx', import.meta.url), 'utf8')
  .replace(/\s+/g, ' ')

test('Physics Lab imports every visible CAD occurrence without silently truncating the assembly', () => {
  assert.match(lab, /const visible = components\.filter\(\s*\(c\) => !c\.hidden && c\.mesh\?\.vertices\?\.length,\s*\)/)
  assert.doesNotMatch(lab, /components\.filter\([\s\S]*?\.slice\(0, 6\)/)
})

test('Physics Lab applies the same room-wide assembly scale to meshes, colliders and joint anchors', () => {
  assert.match(lab, /const labScale = scale \* layoutScale/)
  assert.match(lab, /positions\[i\] = \(\(src\[i\] - cx\) \/ 1000\) \* labScale/)
  assert.match(lab, /size: \[raw\[0\] \* labScale, raw\[1\] \* labScale, raw\[2\] \* labScale\]/)
  assert.match(lab, /\(\(p\[0\] - layout\.layoutOrigin\[0\]\) \/ 1000\) \* layout\.layoutScale/)
})
