/**
 * Phase2: Assemble quick tools must not share the `joint` icon metaphor.
 * Distinct keys wired in ribbon + defined in icons.tsx paths.
 * Dialog header ✓ calls same onOk as footer command-confirm (footer kept).
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

function assembleBlock(ribbon) {
  const i = ribbon.indexOf("name: 'ASSEMBLE'")
  assert.ok(i >= 0, 'ASSEMBLE panel missing')
  const j = ribbon.indexOf("name: 'SELECT'", i)
  assert.ok(j > i, 'SELECT after ASSEMBLE missing')
  return ribbon.slice(i, j)
}

test('Assemble distinct icon keys exist in paths', () => {
  const keys = definedKeys(rd('src/icons.tsx'))
  for (const k of ['joint', 'jointorigin', 'rigid', 'ground', 'asbuilt', 'motionlink', 'contact', 'motionstudy', 'drive']) {
    assert.ok(keys.has(k), `missing icon key: ${k}`)
  }
})

test('ASSEMBLE ribbon quick tools no longer reuse joint except joint itself', () => {
  const block = assembleBlock(rd('src/ribbon.ts'))
  const pairs = []
  for (const m of block.matchAll(/\{\s*id:\s*'([^']+)'[^}]*?icon:\s*'([^']+)'/gs)) {
    pairs.push({ id: m[1], icon: m[2] })
  }
  const expect = {
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
  for (const [id, icon] of Object.entries(expect)) {
    const hit = pairs.find((p) => p.id === id)
    assert.ok(hit, `missing ASSEMBLE tool ${id}`)
    assert.equal(hit.icon, icon, `${id} icon`)
  }
  const shared = pairs.filter((p) => p.icon === 'joint' && p.id !== 'joint')
  assert.deepEqual(shared, [], `still sharing joint: ${shared.map((p) => p.id).join(', ')}`)
})

test('all ribbon icon refs resolve (Phase2 keys included)', () => {
  const keys = definedKeys(rd('src/icons.tsx'))
  const refs = new Set()
  for (const m of rd('src/ribbon.ts').matchAll(/icon:\s*'([^']+)'/g)) refs.add(m[1])
  const missing = [...refs].filter((k) => !keys.has(k))
  assert.deepEqual(missing, [], `missing: ${missing.join(', ')}`)
})

test('CommandDialog header ✓ shares onOk; footer command-confirm kept', () => {
  const dlg = rd('src/components/CommandDialog.tsx')
  assert.match(dlg, /className="cmd-palette-ok"/)
  assert.match(dlg, /onClick=\{\(\) => \{ if \(!okDisabled\) onOk\(\) \}\}/)
  assert.match(dlg, /data-testid="command-confirm"/)
  assert.match(dlg, /data-testid="command-cancel"/)
  assert.match(dlg, /onClick=\{onOk\}/)
})

test('Phase2 CSS: deeper tool-btn contrast + header ok', () => {
  const css = rd('src/index.css')
  assert.match(css, /#28556e/)
  assert.doesNotMatch(css, /#2f5f7a/)
  assert.match(css, /\.cmd-palette-ok/)
})
