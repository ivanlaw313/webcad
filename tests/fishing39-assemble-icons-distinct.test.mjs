/**
 * FISHING39: Assemble icons — joint / rigid / motionlink must NOT share a chain-link
 * silhouette; 啟用接觸集 vs 新建接觸集 must use distinct SVG keys (contact vs contactnew).
 * data-cmd / tool ids unchanged.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')

function definedKeys(iconsSrc) {
  const keys = new Set()
  for (const m of iconsSrc.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9_]*):/gm)) keys.add(m[1])
  return keys
}

function pathEntry(iconsSrc, key) {
  const re = new RegExp(`^\\s{2}${key}:\\s*<>([\\s\\S]*?)</>,`, 'm')
  const m = iconsSrc.match(re)
  assert.ok(m, `paths.${key} missing`)
  return m[1]
}

function assembleBlock(ribbon) {
  const i = ribbon.indexOf("name: 'ASSEMBLE'")
  assert.ok(i >= 0)
  const j = ribbon.indexOf("name: 'SELECT'", i)
  assert.ok(j > i)
  return ribbon.slice(i, j)
}

const icons = rd('src/icons.tsx')
const ribbon = rd('src/ribbon.ts')
const keys = definedKeys(icons)
const block = assembleBlock(ribbon)

test('contactnew key exists; enable vs new use distinct ribbon icons', () => {
  assert.ok(keys.has('contact'), 'contact')
  assert.ok(keys.has('contactnew'), 'contactnew')
  assert.match(block, /id:\s*'enablecontact'[^]*?icon:\s*'contact'/)
  assert.match(block, /id:\s*'newcontactset'[^]*?icon:\s*'contactnew'/)
  const enableSvg = pathEntry(icons, 'contact')
  const newSvg = pathEntry(icons, 'contactnew')
  assert.notEqual(enableSvg.replace(/\s+/g, ''), newSvg.replace(/\s+/g, ''), 'SVGs must differ')
  // enable = power toggle stem; create = plus badge
  assert.match(enableSvg, /M16\.2 3\.6v2\.8/)
  assert.match(newSvg, /M18\.2 4\.6v3\.2M16\.6 6\.2h3\.2/)
})

test('joint / rigid / motionlink path markup are pairwise distinct', () => {
  const j = pathEntry(icons, 'joint').replace(/\s+/g, '')
  const r = pathEntry(icons, 'rigid').replace(/\s+/g, '')
  const m = pathEntry(icons, 'motionlink').replace(/\s+/g, '')
  assert.notEqual(j, r)
  assert.notEqual(j, m)
  assert.notEqual(r, m)
})

test('metaphors: joint=pin+arc, rigid=padlock, motionlink=toothed gears (not twin equal circles)', () => {
  const j = pathEntry(icons, 'joint')
  const r = pathEntry(icons, 'rigid')
  const m = pathEntry(icons, 'motionlink')
  // joint: vertical pin + rotation arc (no twin r=3.1 circles)
  assert.match(j, /M8\.5 4\.5v15/)
  assert.match(j, /a5\.2 5\.2 0 0 1 0 10\.4/)
  assert.doesNotMatch(j, /circle cx="7\.5"[^>]*r="3\.1"/)
  // rigid: fused rect + padlock shackle
  assert.match(r, /rect x="3\.5" y="9" width="17"/)
  assert.match(r, /M9\.5 9V7\.2a2\.5/)
  // motionlink: gear teeth ticks + two hub sizes
  assert.match(m, /M8 7\.2v1\.1/)
  assert.match(m, /circle cx="16\.4"/)
  assert.doesNotMatch(m, /circle cx="8" cy="12" r="4\.2"/) // old plain gear-less loops
})

test('ASSEMBLE tool ids / data-cmd contract: ids unchanged', () => {
  for (const id of ['joint', 'rigidgroup', 'motionlink', 'enablecontact', 'newcontactset']) {
    assert.match(block, new RegExp(`id:\\s*'${id}'`))
  }
})

test('all ribbon icon refs still resolve after contactnew', () => {
  const refs = new Set()
  for (const m of ribbon.matchAll(/icon:\s*'([^']+)'/g)) refs.add(m[1])
  const missing = [...refs].filter((k) => !keys.has(k))
  assert.deepEqual(missing, [], `missing: ${missing.join(', ')}`)
})
