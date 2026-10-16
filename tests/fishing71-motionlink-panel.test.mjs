/**
 * FISHING71: JointsPanel always shows Formal 運動連結; + 連結 not + 連接 (F69 PARTIAL).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING71 JointsPanel always mounts 運動連結（齒輪比） heading', () => {
  const jp = read('src/components/JointsPanel.tsx')
  assert.match(jp, /運動連結（齒輪比）/)
  assert.match(jp, /需要最少 2 個轉動／圓柱關節才可加運動連結/)
  // not gated solely on rotJoints.length >= 2 wrapping the whole section
  assert.doesNotMatch(jp, /\{rotJoints\.length >= 2 && \(\s*<div className="jp-mlink" ref=\{motionLinkRef\}>/)
  assert.match(jp, /ref=\{motionLinkRef\}/)
})

test('FISHING71 add button + 連結; no + 連接 / 運動連接 in panel+status', () => {
  const jp = read('src/components/JointsPanel.tsx')
  const st = read('src/store.ts')
  assert.match(jp, />\+ 連結</)
  assert.doesNotMatch(jp, /\+ 連接/)
  assert.doesNotMatch(jp, /運動連接/)
  assert.match(st, /再按「\+ 連結」/)
  assert.doesNotMatch(st, /再按「\+ 連接」/)
  // ribbon focus always dispatched
  const m = st.match(/case 'motionlink': \{([\s\S]*?)case 'motionstudy':/)
  assert.ok(m)
  assert.match(m[1], /webcad:assembly-focus/)
  assert.match(m[1], /section: 'motionlink'/)
  // focus before early status for <2
  const focusAt = m[1].indexOf("section: 'motionlink'")
  const needAt = m[1].indexOf('需要最少 2 個轉動／圓柱關節')
  assert.ok(focusAt >= 0 && needAt >= 0 && focusAt < needAt)
})

test('FISHING71 MATERIALS/DENSITY_PREF SC kept', () => {
  const st = read('src/store.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})
