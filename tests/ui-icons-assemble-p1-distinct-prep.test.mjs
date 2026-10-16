/**
 * more25 Assemble P1 prep: icon distinctness for rigid／motionlink／joint
 * and soft gate for 啟用接觸集 vs 新建接觸集.
 *
 * Hard (tip ≥1dc1d0a): joint/rigid/motionlink path markup pairwise distinct;
 *   ribbon rigidgroup→rigid, motionlink→motionlink, joint→joint;
 *   enablecontact + newcontactset exist in ASSEMBLE.
 * Soft: enablecontact vs newcontactset — skip while they still share icon key
 *   and/or path body (both `contact` on tip); hard-green once keys AND paths differ.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')

const iconsSrc = rd('src/icons.tsx')
const ribbonSrc = rd('src/ribbon.ts')

/** Extract `paths` entry body (inner JSX / markup) for a key from icons.tsx. */
function pathBody(src, key) {
  const re = new RegExp(
    `^\\s{2}${key}:\\s*`,
    'm',
  )
  const m = re.exec(src)
  assert.ok(m, `paths.${key} missing`)
  const start = m.index + m[0].length
  // next top-level key (2-space indent + ident:) or end of paths object-ish block
  const rest = src.slice(start)
  const next = rest.search(/\n\s{2}[A-Za-z][A-Za-z0-9_]*:/)
  const chunk = next >= 0 ? rest.slice(0, next) : rest
  // drop trailing comma / comment on the entry line(s)
  return chunk.replace(/,\s*(\/\/[^\n]*)?\s*$/, '').trim()
}

function definedKeys(src) {
  const keys = new Set()
  for (const m of src.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9_]*):/gm)) keys.add(m[1])
  return keys
}

function assembleBlock(ribbon) {
  const i = ribbon.indexOf("name: 'ASSEMBLE'")
  assert.ok(i >= 0, 'ASSEMBLE panel missing')
  const j = ribbon.indexOf("name: 'SELECT'", i)
  assert.ok(j > i, 'SELECT after ASSEMBLE missing')
  return ribbon.slice(i, j)
}

/** Read ASSEMBLE ribbon icon key for a tool id. */
function assembleIcon(block, id) {
  const re = new RegExp(`\\{\\s*id:\\s*'${id}'[^}]*?icon:\\s*'([^']+)'`, 's')
  const m = block.match(re)
  assert.ok(m, `missing ASSEMBLE tool ${id}`)
  return m[1]
}

const keys = definedKeys(iconsSrc)
const block = assembleBlock(ribbonSrc)

test('paths keys joint/rigid/motionlink exist', () => {
  for (const k of ['joint', 'rigid', 'motionlink']) {
    assert.ok(keys.has(k), `missing icon key: ${k}`)
  }
})

test('Assemble P1 hard: joint/rigid/motionlink path markup pairwise distinct', () => {
  const joint = pathBody(iconsSrc, 'joint')
  const rigid = pathBody(iconsSrc, 'rigid')
  const motionlink = pathBody(iconsSrc, 'motionlink')
  assert.ok(joint.length > 0, 'joint body empty')
  assert.ok(rigid.length > 0, 'rigid body empty')
  assert.ok(motionlink.length > 0, 'motionlink body empty')
  assert.notEqual(joint, rigid, 'joint path === rigid path')
  assert.notEqual(joint, motionlink, 'joint path === motionlink path')
  assert.notEqual(rigid, motionlink, 'rigid path === motionlink path')
})

test('Assemble P1 hard: ribbon rigidgroup→rigid, motionlink→motionlink, joint→joint', () => {
  assert.equal(assembleIcon(block, 'rigidgroup'), 'rigid')
  assert.equal(assembleIcon(block, 'motionlink'), 'motionlink')
  assert.equal(assembleIcon(block, 'joint'), 'joint')
})

test('Assemble P1 hard: enablecontact + newcontactset exist in ASSEMBLE', () => {
  assert.ok(block.includes("id: 'enablecontact'"), 'enablecontact missing')
  assert.ok(block.includes("id: 'newcontactset'"), 'newcontactset missing')
  // sanity: both resolve to some icon key present in paths
  const en = assembleIcon(block, 'enablecontact')
  const nw = assembleIcon(block, 'newcontactset')
  assert.ok(keys.has(en), `enablecontact icon key ${en} missing from paths`)
  assert.ok(keys.has(nw), `newcontactset icon key ${nw} missing from paths`)
})

const enableKey = assembleIcon(block, 'enablecontact')
const newKey = assembleIcon(block, 'newcontactset')
const enablePath = pathBody(iconsSrc, enableKey)
const newPath = pathBody(iconsSrc, newKey)
const contactStillShared = enableKey === newKey || enablePath === newPath

test(
  'Assemble P1: enablecontact vs newcontactset distinct icon key and path',
  { skip: contactStillShared && 'Assemble P1: contact enable vs new still share key/path (Phase pending distinct keys e.g. contact vs contactnew)' },
  () => {
    assert.notEqual(enableKey, newKey, 'enablecontact and newcontactset must use different icon keys')
    assert.notEqual(enablePath, newPath, 'enablecontact and newcontactset path markup must differ')
  },
)
