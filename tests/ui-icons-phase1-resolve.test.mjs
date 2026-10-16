/**
 * Phase1: CORE16 + offset ribbon icon keys must resolve in src/icons.tsx
 * (no fall-through to paths.default empty square).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')

const CORE16_KEYS = [
  'extrude', 'revolve', 'sweep', 'loft', 'emboss', 'hole', 'cylinder', 'cone',
  'pattern', 'cpattern', 'mirror', 'thicken', 'presspull', 'fillet', 'chamfer',
  'shell', 'combine', 'split', 'move',
]
const SKETCH_KEYS = ['line', 'rect', 'circle', 'arc', 'offset']

function definedKeys(iconsSrc) {
  const keys = new Set()
  for (const m of iconsSrc.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9_]*):/gm)) keys.add(m[1])
  return keys
}

function ribbonIconRefs(ribbonSrc) {
  const refs = new Set()
  for (const m of ribbonSrc.matchAll(/icon:\s*'([^']+)'/g)) refs.add(m[1])
  return refs
}

test('ToolIcon strokeWidth bumped to 1.55', () => {
  const ic = rd('src/icons.tsx')
  assert.match(ic, /strokeWidth=\{1\.55\}/)
  assert.doesNotMatch(ic, /strokeWidth=\{1\.4\}/)
})

test('paths map defines CORE16 + offset + sketch keys (no default fallthrough)', () => {
  const keys = definedKeys(rd('src/icons.tsx'))
  for (const k of [...CORE16_KEYS, ...SKETCH_KEYS]) {
    assert.ok(keys.has(k), `missing icon key: ${k}`)
  }
  assert.ok(keys.has('default'), 'default fallback must remain')
})

test('ribbon CORE16 + formloop offset icons resolve to defined keys', () => {
  const ic = rd('src/icons.tsx')
  const keys = definedKeys(ic)
  const ribbon = rd('src/ribbon.ts')
  // formloop must keep icon: 'offset' and it must exist
  assert.match(ribbon, /id: 'formloop'[\s\S]*?icon: 'offset'/)
  assert.ok(keys.has('offset'), 'offset key required for formloop')
  // circpattern distinct from pattern
  assert.match(ribbon, /id: 'circpattern'[\s\S]*?icon: 'cpattern'/)
  assert.ok(keys.has('cpattern'))
  // Collect every icon: ref and ensure none of CORE16/offset fall to missing
  const refs = ribbonIconRefs(ribbon)
  for (const k of [...CORE16_KEYS, 'offset', ...SKETCH_KEYS]) {
    if (refs.has(k) || CORE16_KEYS.includes(k) || k === 'offset') {
      assert.ok(keys.has(k), `ribbon/CORE key ${k} missing from paths`)
    }
  }
  // Explicit: every unique ribbon icon: must be defined OR be intentional default
  const missing = [...refs].filter((k) => !keys.has(k))
  assert.deepEqual(missing, [], `ribbon icon keys missing from paths: ${missing.join(', ')}`)
})

test('hasToolIcon / ICON_PATH_KEYS exported for resolve checks', () => {
  const ic = rd('src/icons.tsx')
  assert.match(ic, /export const ICON_PATH_KEYS/)
  assert.match(ic, /export function hasToolIcon/)
})
