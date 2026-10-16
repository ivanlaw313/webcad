/**
 * CORE16 more24: hard dual-icon asserts for sketch strip (line/rect/circle/arc/offset).
 * Complementary to tests/ui-icons-phase3-sketch-dual.test.mjs — ownership pins for more24.
 * Tip 42f0ef9: all asserts hard (0 skip).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')

/** Dual sketch tools: ribbon id → icon key + exact Unicode glyph */
const DUAL_TOOLS = [
  { id: 'sk_polyline', icon: 'line', glyph: '╱' },
  { id: 'sk_rect', icon: 'rect', glyph: '▭' },
  { id: 'sk_circle', icon: 'circle', glyph: '◯' },
  { id: 'sk_arc', icon: 'arc', glyph: '⌒' },
  { id: 'sk_offset', icon: 'offset', glyph: '⧉' },
]

const DUAL_KEYS = DUAL_TOOLS.map((t) => t.icon)

test('more24 hard: DUAL_SKETCH_ICON_KEYS == line/rect/circle/arc/offset', () => {
  const ribbon = rd('src/components/Ribbon.tsx')
  const m = ribbon.match(/DUAL_SKETCH_ICON_KEYS\s*=\s*new Set\(\[([^\]]+)\]\)/)
  assert.ok(m, 'DUAL_SKETCH_ICON_KEYS Set must exist')
  const keys = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  assert.deepEqual(keys, DUAL_KEYS, 'exact order line/rect/circle/arc/offset')
  assert.equal(keys.length, 5)
})

test('more24 hard: per-tool table — ribbon icon+glyph + paths has key', () => {
  const ribbon = rd('src/ribbon.ts')
  const icons = rd('src/icons.tsx')
  const defined = new Set([...icons.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9_]*):/gm)].map((m) => m[1]))
  for (const { id, icon, glyph } of DUAL_TOOLS) {
    // First quick-tool occurrence: id then icon then glyph (Unicode exact)
    const escaped = glyph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(
      `id:\\s*'${id}'[\\s\\S]{0,220}?icon:\\s*'${icon}'[\\s\\S]{0,80}?glyph:\\s*'${escaped}'`,
    )
    assert.match(ribbon, re, `${id} must keep icon=${icon} glyph=${glyph}`)
    assert.ok(defined.has(icon), `paths must define icon key '${icon}' for ${id}`)
    // Exact glyph codepoint pin (not just regex presence somewhere)
    assert.ok(ribbon.includes(`glyph: '${glyph}'`), `${id} glyph Unicode ${glyph} (U+${glyph.codePointAt(0).toString(16).toUpperCase()}) must appear`)
  }
})

test('more24 hard: ToolButton dual path — dualSketchIcon → sk-dual / sk-icon-row / ToolIcon + sk-glyph; aria has glyph', () => {
  const ribbon = rd('src/components/Ribbon.tsx')
  // ToolIcon import present (dual branch depends on it)
  assert.match(ribbon, /import\s*\{\s*ToolIcon\s*\}\s*from\s*['"]\.\.\/icons['"]/)
  assert.match(ribbon, /dualSketchIcon\s*=\s*!!\(t\.glyph\s*&&\s*DUAL_SKETCH_ICON_KEYS\.has\(t\.icon\)\)/)
  // className dual branch
  assert.match(ribbon, /className=\{'tool-btn sk'\s*\+\s*\(dualSketchIcon\s*\?\s*'\s*sk-dual'\s*:\s*''\)/)
  // dual branch JSX: sk-icon-row wraps ToolIcon + sk-glyph
  assert.match(
    ribbon,
    /dualSketchIcon\s*\?\s*<span className="sk-icon-row">[\s\S]*?<span className="sk-tool-icon"[\s\S]*?<ToolIcon name=\{t\.icon\}[\s\S]*?<span className="sk-glyph">\{t\.glyph\}<\/span>[\s\S]*?<\/span>\s*:\s*<span className="sk-glyph">\{t\.glyph\}<\/span>/,
  )
  // aria includes glyph for dual
  assert.match(ribbon, /const skAria = dualSketchIcon\s*\?\s*`\$\{resolveRibbonCmd\(t\.id, lang, t\.label\)\} \$\{t\.glyph\}`/)
  assert.ok(ribbon.includes('${resolveRibbonCmd(t.id, lang, t.label)} ${t.glyph}'), 'aria dual includes glyph')
})

test('more24 hard: CSS .tool-btn.sk.sk-dual + .sk-icon-row + .sk-tool-icon', () => {
  const css = rd('src/index.css')
  assert.match(css, /\.tool-btn\.sk\.sk-dual\s*\{/)
  assert.match(css, /\.tool-btn\.sk\.sk-dual\s+\.sk-icon-row\s*\{/)
  assert.match(css, /\.tool-btn\.sk\.sk-dual\s+\.sk-tool-icon\s*\{/)
  assert.match(css, /\.sk-icon-row/)
  assert.match(css, /\.sk-tool-icon/)
})

test('more24 hard: data-cmd={t.id} unchanged on ToolButton', () => {
  const ribbon = rd('src/components/Ribbon.tsx')
  // Both glyph and non-glyph button branches keep data-cmd={t.id}
  const dataCmdHits = [...ribbon.matchAll(/data-cmd=\{t\.id\}/g)]
  assert.ok(dataCmdHits.length >= 2, `expected ≥2 data-cmd={t.id} on ToolButton (got ${dataCmdHits.length})`)
  assert.match(ribbon, /data-cmd=\{child\.id\}/)
})

test('more24 hard: dual branch must NOT be icon-only without glyph NOR glyph-only without ToolIcon', () => {
  const ribbon = rd('src/components/Ribbon.tsx')
  // Extract the dual ternary body (between dualSketchIcon ? ... : glyph-only fallback)
  const dualBlock = ribbon.match(
    /\{dualSketchIcon \? <span className="sk-icon-row">([\s\S]*?)<\/span> : <span className="sk-glyph">\{t\.glyph\}<\/span>\}/,
  )
  assert.ok(dualBlock, 'dualSketchIcon ternary with sk-icon-row must exist')
  const body = dualBlock[1]
  // Must contain BOTH ToolIcon and sk-glyph inside the dual branch
  assert.match(body, /<ToolIcon\s+name=\{t\.icon\}/, 'dual branch must render ToolIcon (not glyph-only)')
  assert.match(body, /className="sk-glyph"/, 'dual branch must render sk-glyph (not icon-only)')
  assert.match(body, /className="sk-tool-icon"/, 'dual branch must wrap ToolIcon in sk-tool-icon')
  // Explicit negative: dual branch must not collapse to only ToolIcon without glyph span
  assert.ok(
    body.includes('sk-glyph') && body.includes('ToolIcon'),
    'pin: each dual tool keeps ToolIcon AND glyph together in dual branch',
  )
  // Glyph-only fallback exists OUTSIDE dual (the : branch) — dual itself must not be that path alone
  assert.ok(
    /dualSketchIcon \?[\s\S]*ToolIcon[\s\S]*sk-glyph[\s\S]*: <span className="sk-glyph">\{t\.glyph\}<\/span>/.test(ribbon),
    'dual path is ToolIcon+glyph; glyph-only is only the non-dual fallback',
  )
})
