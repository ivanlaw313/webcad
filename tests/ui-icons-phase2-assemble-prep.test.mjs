/**
 * more23 hardened: Phase2 Assemble／joint distinct icon keys (live on tip ≥400c9b9).
 *
 * Expected icon map:
 *   joint         → joint
 *   groundcomp    → ground
 *   asbuiltjoint  → asbuilt
 *   jointorigin   → jointorigin
 *   rigidgroup    → rigid
 *   motionlink    → motionlink
 *   enablecontact → contact
 *   newcontactset → contactnew
 *   motionstudy   → motionstudy
 *   drivejoints   → drive
 *
 * Hard PASS on Phase2/3 tip: all keys distinct, ribbon wiring matches, no joint reuse.
 * Also pins tip invariants (paths.joint, ToolIcon guard, ASSEMBLE tool ids).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')

/** Expected ribbon id → icon key after Phase2 Assemble distinct icons. */
const PHASE2_EXPECT = {
  joint: 'joint',
  groundcomp: 'ground',
  asbuiltjoint: 'asbuilt',
  jointorigin: 'jointorigin',
  rigidgroup: 'rigid',
  motionlink: 'motionlink',
  enablecontact: 'contact',
  newcontactset: 'contactnew',
  motionstudy: 'motionstudy',
  drivejoints: 'drive',
}

const PHASE2_PATH_KEYS = [
  'joint', 'ground', 'asbuilt', 'jointorigin', 'rigid',
  'motionlink', 'contact', 'contactnew', 'motionstudy', 'drive',
]

const ASSEMBLE_TOOL_IDS = Object.keys(PHASE2_EXPECT)

function definedKeys(iconsSrc) {
  const keys = new Set()
  for (const m of iconsSrc.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9_]*):/gm)) keys.add(m[1])
  return keys
}

function assembleBlock(ribbon) {
  const i = ribbon.indexOf("name: 'ASSEMBLE'")
  assert.ok(i >= 0, 'ASSEMBLE panel missing')
  const j = ribbon.indexOf("name: 'SELECT'", i)
  assert.ok(j > i, 'SELECT after ASSEMBLE missing')
  return ribbon.slice(i, j)
}

function assemblePairs(block) {
  const pairs = []
  for (const m of block.matchAll(/\{\s*id:\s*'([^']+)'[^}]*?icon:\s*'([^']+)'/gs)) {
    pairs.push({ id: m[1], icon: m[2] })
  }
  return pairs
}

const iconsSrc = rd('src/icons.tsx')
const ribbonSrc = rd('src/ribbon.ts')
const keys = definedKeys(iconsSrc)
const block = assembleBlock(ribbonSrc)
const pairs = assemblePairs(block)
const sharedJoint = pairs.filter((p) => p.icon === 'joint' && p.id !== 'joint' && ASSEMBLE_TOOL_IDS.includes(p.id))

test('paths.joint exists; ToolIcon paths[name] ?? paths.default guard present', () => {
  assert.ok(keys.has('joint'), 'paths.joint must exist')
  assert.ok(keys.has('default'), 'paths.default fallback must remain')
  assert.match(iconsSrc, /paths\[name\]\s*\?\?\s*paths\.default/)
})

test('ASSEMBLE panel lists Phase2-bound quick tools', () => {
  for (const id of ASSEMBLE_TOOL_IDS) {
    const hit = pairs.find((p) => p.id === id)
    assert.ok(hit, `missing ASSEMBLE tool ${id}`)
  }
})

test('Phase2 Assemble distinct icon path keys exist', () => {
  for (const k of PHASE2_PATH_KEYS) {
    assert.ok(keys.has(k), `missing icon key: ${k}`)
  }
})

test('ASSEMBLE ribbon quick tools no longer reuse joint except joint itself', () => {
  for (const [id, icon] of Object.entries(PHASE2_EXPECT)) {
    const hit = pairs.find((p) => p.id === id)
    assert.ok(hit, `missing ASSEMBLE tool ${id}`)
    assert.equal(hit.icon, icon, `${id} icon`)
  }
  assert.deepEqual(
    sharedJoint,
    [],
    `still sharing joint: ${sharedJoint.map((p) => p.id).join(', ')}`,
  )
})

test('all ribbon icon refs resolve (Phase2 keys included)', () => {
  const refs = new Set()
  for (const m of ribbonSrc.matchAll(/icon:\s*'([^']+)'/g)) refs.add(m[1])
  const missing = [...refs].filter((k) => !keys.has(k))
  assert.deepEqual(missing, [], `missing: ${missing.join(', ')}`)
})
