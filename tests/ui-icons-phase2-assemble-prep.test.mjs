/**
 * Phase2-prep (soft): Assemble／joint 分圖 direction tests for tip 50abe04.
 *
 * Expected Phase2 icon map (草圖／phase2 draft — hard-assert only when landed):
 *   joint         → joint
 *   groundcomp    → ground
 *   asbuiltjoint  → asbuilt
 *   jointorigin   → jointorigin
 *   rigidgroup    → rigid
 *   motionlink    → motionlink
 *   enablecontact → contact
 *   newcontactset → contact
 *   motionstudy   → motionstudy
 *   drivejoints   → drive
 *
 * On tip 50abe04 most Phase2 keys are still missing and ASSEMBLE tools share
 * icon:'joint' — those cases test.skip with a Phase2 message (suite stays green).
 * Invariants that already hold on tip remain hard asserts.
 * When ALL expected keys exist AND ribbon wiring matches → hard-assert distinct icons.
 *
 * Product hard tests live on fix/ui-phase2-assemble-dialog; this file is tests-only prep.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')

/** Expected ribbon id → icon key after Phase2 Assemble distinct icons land. */
const PHASE2_EXPECT = {
  joint: 'joint',
  groundcomp: 'ground',
  asbuiltjoint: 'asbuilt',
  jointorigin: 'jointorigin',
  rigidgroup: 'rigid',
  motionlink: 'motionlink',
  enablecontact: 'contact',
  newcontactset: 'contact',
  motionstudy: 'motionstudy',
  drivejoints: 'drive',
}

const PHASE2_PATH_KEYS = [
  'joint', 'ground', 'asbuilt', 'jointorigin', 'rigid',
  'motionlink', 'contact', 'motionstudy', 'drive',
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
const missingKeys = PHASE2_PATH_KEYS.filter((k) => !keys.has(k))
const PHASE2_KEYS_READY = missingKeys.length === 0

const block = assembleBlock(ribbonSrc)
const pairs = assemblePairs(block)
const sharedJoint = pairs.filter((p) => p.icon === 'joint' && p.id !== 'joint' && ASSEMBLE_TOOL_IDS.includes(p.id))
const wiringMatches =
  PHASE2_KEYS_READY &&
  ASSEMBLE_TOOL_IDS.every((id) => {
    const hit = pairs.find((p) => p.id === id)
    return hit && hit.icon === PHASE2_EXPECT[id]
  }) &&
  sharedJoint.length === 0

const PHASE2_READY = PHASE2_KEYS_READY && wiringMatches

// --- Hard asserts that already hold on tip 50abe04 ---

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

// --- Soft / skip until Phase2 product lands ---

test(
  'Phase2 Assemble distinct icon path keys exist',
  { skip: !PHASE2_KEYS_READY && `Phase2 Assemble distinct icons not on tip yet (missing: ${missingKeys.join(', ')})` },
  () => {
    for (const k of PHASE2_PATH_KEYS) {
      assert.ok(keys.has(k), `missing icon key: ${k}`)
    }
  },
)

test(
  'ASSEMBLE ribbon quick tools no longer reuse joint except joint itself',
  {
    skip:
      !PHASE2_READY &&
      (PHASE2_KEYS_READY
        ? `Phase2 pending: ASSEMBLE still sharing joint (${sharedJoint.map((p) => p.id).join(', ') || 'wiring mismatch'})`
        : `Phase2 Assemble distinct icons not on tip yet (missing: ${missingKeys.join(', ')})`),
  },
  () => {
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
  },
)

test(
  'all ribbon icon refs resolve (Phase2 keys included)',
  { skip: !PHASE2_KEYS_READY && `Phase2 Assemble distinct icons not on tip yet (missing: ${missingKeys.join(', ')})` },
  () => {
    const refs = new Set()
    for (const m of ribbonSrc.matchAll(/icon:\s*'([^']+)'/g)) refs.add(m[1])
    const missing = [...refs].filter((k) => !keys.has(k))
    assert.deepEqual(missing, [], `missing: ${missing.join(', ')}`)
  },
)
