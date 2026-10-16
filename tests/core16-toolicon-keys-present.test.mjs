/**
 * CORE16 residual more21: ToolIcon / icons keys present (UI/icon Fusion alignment).
 * Every CORE16 SOLID Create/Modify (+ common Inspect/Assemble) ribbon tool icon
 * must resolve to a real key in src/icons.tsx `paths` (not silent default-box).
 * ToolIcon must keep paths[name] ?? paths.default guard.
 * Prefer tests only — product gaps → report A (no silent icon add).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const icons = readFileSync(new URL('../src/icons.tsx', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')

/** Keys declared on the `paths` Record before ToolIcon. */
function pathKeys(src) {
  const i = src.indexOf('const paths')
  assert.ok(i >= 0, 'const paths missing')
  const j = src.indexOf('export function ToolIcon', i)
  assert.ok(j > i, 'ToolIcon after paths missing')
  const block = src.slice(i, j)
  return new Set([...block.matchAll(/^\s{2}([a-zA-Z][\w]*)\s*:/gm)].map((m) => m[1]))
}

/** First SOLID panels block (CREATE… through before SURFACE reuse). */
function solidPanelBlock(src) {
  const i = src.indexOf("const SOLID: Panel[]")
  assert.ok(i >= 0, 'SOLID panels missing')
  // SURFACE tab reuses via g(); end SOLID const before `const g =`
  const j = src.indexOf('\nconst g =', i)
  assert.ok(j > i, 'end of SOLID panels missing')
  return src.slice(i, j)
}

function toolIconPairs(block) {
  const pairs = []
  for (const m of block.matchAll(/\{\s*id:\s*'([^']+)'[^}]*?icon:\s*'([^']+)'/gs)) {
    pairs.push({ id: m[1], icon: m[2] })
  }
  return pairs
}

// CORE16 focus: solid create / modify / assemble / construct / inspect / insert ids
const CORE16_IDS = new Set([
  'sketch', 'extrude', 'revolve', 'sweep', 'loft', 'hole', 'box', 'cylinder', 'sphere', 'cone', 'torus',
  'rib', 'web', 'thread', 'emboss', 'text',
  'fillet', 'chamfer', 'shell', 'draft', 'scale', 'combine', 'move', 'align', 'presspull', 'pushpull',
  'pattern', 'circularpattern', 'cpattern', 'pathpattern', 'mirror', 'thicken', 'split', 'offsetsolid',
  'joint', 'asbuilt', 'rigidgroup', 'motion',
  'plane', 'axis', 'point', 'cpoint',
  'measure', 'interference', 'section', 'curvature', 'wallcheck', 'overhang',
  'insertcomponent', 'insertfastener', 'insertcanvas', 'insertmesh',
  'appearance', 'material', 'parameters',
])

test('ToolIcon falls back with paths[name] ?? paths.default guard', () => {
  assert.match(icons, /export function ToolIcon/)
  assert.match(icons, /paths\[name\]\s*\?\?\s*paths\.default/)
  assert.match(icons, /^\s{2}default:\s*</m)
})

test('CORE16 SOLID ribbon tool icons each exist in paths (no missing keys)', () => {
  const keys = pathKeys(icons)
  assert.ok(keys.size >= 80, `paths sanity: only ${keys.size} keys`)
  assert.ok(keys.has('default'), 'paths.default required')
  assert.ok(keys.has('extrude') && keys.has('sweep') && keys.has('fillet'), 'core solid icons')

  const pairs = toolIconPairs(solidPanelBlock(ribbon))
  assert.ok(pairs.length >= 40, `SOLID tools sanity: ${pairs.length}`)

  const corePairs = pairs.filter((p) => CORE16_IDS.has(p.id))
  assert.ok(corePairs.length >= 20, `CORE16 id hits in SOLID: ${corePairs.length}`)

  const missing = []
  for (const { id, icon } of corePairs) {
    if (!keys.has(icon)) missing.push(`${id}→${icon}`)
  }
  assert.equal(missing.length, 0, `CORE16 missing icon keys:\n${missing.join('\n')}`)

  // Sample Fusion-alignment pins (distinct glyphs, not all default)
  for (const pin of ['extrude', 'revolve', 'sweep', 'loft', 'fillet', 'chamfer', 'shell', 'mirror', 'pattern', 'thicken', 'combine', 'hole']) {
    assert.ok(keys.has(pin), `paths.${pin}`)
  }
})

test('audit: full ribbon icon keys vs paths (report orphans; CORE16 must stay clean)', () => {
  const keys = pathKeys(icons)
  const all = [...ribbon.matchAll(/icon:\s*'([^']+)'/g)].map((m) => m[1])
  assert.ok(all.length >= 50, `ribbon icon refs sanity: ${all.length}`)
  const missing = [...new Set(all.filter((ic) => !keys.has(ic)))].sort()
  // Known non-CORE16 gap (FORM formloop): icon 'offset' not in paths → default box.
  // Do not silent-fix product; pin the orphan list so a new CORE16 gap fails loudly.
  const ALLOWED_ORPHANS = ['offset']
  const unexpected = missing.filter((ic) => !ALLOWED_ORPHANS.includes(ic))
  assert.equal(
    unexpected.length,
    0,
    `unexpected ribbon icon orphans (not in paths):\n${unexpected.join('\n')}`,
  )
  for (const ic of ALLOWED_ORPHANS) {
    if (missing.includes(ic)) {
      assert.ok(
        /icon:\s*'offset'/.test(ribbon),
        'allowed orphan offset still referenced (formloop) — product A until icon added',
      )
    }
  }
})
