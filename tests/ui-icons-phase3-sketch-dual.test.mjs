/**
 * Phase3: sketch strip shows ToolIcon alongside glyph for line/rect/circle/arc/offset.
 * Glyphs remain in DOM (.sk-glyph) for QA recognition; aria includes glyph.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')

const DUAL = ['line', 'rect', 'circle', 'arc', 'offset']

test('DUAL_SKETCH_ICON_KEYS lists line/rect/circle/arc/offset', () => {
  const ribbon = rd('src/components/Ribbon.tsx')
  assert.match(ribbon, /DUAL_SKETCH_ICON_KEYS\s*=\s*new Set\(\[([^\]]+)\]\)/)
  const m = ribbon.match(/DUAL_SKETCH_ICON_KEYS\s*=\s*new Set\(\[([^\]]+)\]\)/)
  const keys = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  assert.deepEqual(keys.sort(), [...DUAL].sort())
})

test('ToolButton dual path renders ToolIcon + sk-glyph for dual keys', () => {
  const ribbon = rd('src/components/Ribbon.tsx')
  assert.match(ribbon, /dualSketchIcon/)
  assert.match(ribbon, /className=\{'tool-btn sk'/)
  assert.match(ribbon, /sk-dual/)
  assert.match(ribbon, /sk-icon-row/)
  assert.match(ribbon, /sk-tool-icon/)
  // ToolIcon used inside glyph branch (not only non-glyph branch)
  assert.match(ribbon, /dualSketchIcon \? <span className="sk-icon-row">[\s\S]*?<ToolIcon name=\{t\.icon\}/)
  assert.match(ribbon, /<span className="sk-glyph">\{t\.glyph\}<\/span>/)
  // aria includes glyph for dual
  assert.ok(ribbon.includes('${resolveRibbonCmd(t.id, lang, t.label)} ${t.glyph}'), 'aria dual includes glyph')
})

test('ribbon quick tools for dual icons keep glyph + resolvable icon keys', () => {
  const ribbon = rd('src/ribbon.ts')
  const icons = rd('src/icons.tsx')
  const defined = new Set([...icons.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9_]*):/gm)].map((m) => m[1]))
  const expect = {
    sk_polyline: { icon: 'line', glyph: '╱' },
    sk_rect: { icon: 'rect', glyph: '▭' },
    sk_circle: { icon: 'circle', glyph: '◯' },
    sk_arc: { icon: 'arc', glyph: '⌒' },
    sk_offset: { icon: 'offset', glyph: '⧉' },
  }
  for (const [id, { icon, glyph }] of Object.entries(expect)) {
    const re = new RegExp(`id: '${id}'[\\s\\S]*?icon: '${icon}'[\\s\\S]*?glyph: '${glyph.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}'`)
    assert.match(ribbon, re, `${id} must keep icon+glyph`)
    assert.ok(defined.has(icon), `icon key ${icon} missing from paths`)
  }
})

test('Phase3 CSS: sk-dual icon row + smaller glyph', () => {
  const css = rd('src/index.css')
  assert.match(css, /\.tool-btn\.sk\.sk-dual/)
  assert.match(css, /\.sk-icon-row/)
  assert.match(css, /\.sk-tool-icon/)
  // base layout contract still holds
  assert.match(css, /\.tool-btn\.sk\s*\{[^}]*min-width:\s*52px[^}]*height:\s*40px[^}]*overflow:\s*hidden/s)
  assert.match(css, /\.sk-glyph\s*\{[^}]*line-height:\s*1[^}]*flex:\s*0 0 auto/s)
})

test('data-cmd unchanged for dual sketch tools', () => {
  const ribbon = rd('src/components/Ribbon.tsx')
  assert.match(ribbon, /data-cmd=\{t\.id\}/)
  assert.match(ribbon, /data-cmd=\{child\.id\}/)
})
