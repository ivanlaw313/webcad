/**
 * FISHING57: joint Formal「轉動／剛性」labels + ASSEMBLE 選面配合 reachability.
 * F53/F54 recheck: joint type list showed「旋轉」only; want Formal「轉動」+「剛性」reachable.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ALL_JOINT_TYPES, JOINT_LABEL_TC, JOINT_HINT_TC, jointTypePickOptions } from '../src/assembly/kinematics.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING57 JOINT_LABEL_TC revolute is 轉動 (not 旋轉); rigid is 剛性', () => {
  assert.equal(JOINT_LABEL_TC.revolute, '轉動')
  assert.equal(JOINT_LABEL_TC.rigid, '剛性')
  assert.doesNotMatch(JOINT_LABEL_TC.revolute, /旋轉/)
  const labels = ALL_JOINT_TYPES.map((t) => JOINT_LABEL_TC[t])
  assert.ok(labels.includes('轉動'))
  assert.ok(labels.includes('剛性'))
  assert.ok(labels.includes('滑動'))
  assert.equal(labels.length, 8)
})

test('FISHING57 jointTypePickOptions exposes 轉動 + 剛性', () => {
  const opts = jointTypePickOptions(ALL_JOINT_TYPES)
  const labs = opts.map((o) => o.label)
  assert.ok(labs.some((l) => l.startsWith('轉動')))
  assert.ok(labs.some((l) => l.startsWith('剛性')))
  assert.equal(opts.length, 8)
  assert.match(JOINT_HINT_TC.revolute, /轉動/)
  assert.doesNotMatch(JOINT_HINT_TC.revolute, /旋轉/)
})

test('FISHING57 BrowserTree joint type uses 轉動', () => {
  const bt = read('src/components/BrowserTree.tsx')
  assert.match(bt, /revolute: '轉動'/)
  assert.doesNotMatch(bt, /revolute: '旋轉'/)
})

test('FISHING57 ASSEMBLE ribbon lists 選面配合 (facemate) for 面貼合 path', () => {
  const ribbon = read('src/ribbon.ts')
  const i = ribbon.indexOf("name: 'ASSEMBLE'")
  assert.ok(i >= 0)
  const j = ribbon.indexOf("name: 'SELECT'", i)
  const block = ribbon.slice(i, j)
  assert.match(block, /id: 'facemate', label: '選面配合'/)
  assert.match(block, /面貼合/)
  assert.match(block, /id: 'joint'/)
  assert.match(block, /id: 'rigidgroup'/)
})

test('FISHING57 runCommand facemate → startFaceMate(false); MATERIALS stay SC', () => {
  const st = read('src/store.ts')
  assert.match(st, /case 'facemate': return get\(\)\.startFaceMate\(false\)/)
  assert.match(st, /case 'align': return get\(\)\.startFaceMate\(true\)/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
})
