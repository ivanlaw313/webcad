import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')

test('constraint sketch toolbar remains one reachable horizontal row on narrow viewports', () => {
  assert.match(css, /\.cs-toolbar\s*\{[^}]*flex-wrap:\s*nowrap[^}]*overflow-x:\s*auto[^}]*overflow-y:\s*hidden/s)
  assert.match(css, /\.cs-toolbar > \*\s*\{[^}]*flex:\s*0 0 auto[^}]*white-space:\s*nowrap/s)
  assert.match(css, /\.cs-dims\s*\{[^}]*top:\s*56px[^}]*max-height:\s*calc\(100vh - 92px\)[^}]*overflow:\s*auto/s)
})

test('contextual sketch ribbon gives glyphs, captions, and finish control dedicated vertical space', () => {
  assert.match(css, /\.tool-btn\.sk\s*\{[^}]*min-width:\s*52px[^}]*height:\s*40px[^}]*overflow:\s*hidden/s)
  assert.match(css, /\.sk-glyph\s*\{[^}]*line-height:\s*1[^}]*flex:\s*0 0 auto/s)
  assert.match(css, /\.sk-label\s*\{[^}]*line-height:\s*1\.15[^}]*flex:\s*0 0 auto/s)
  assert.match(css, /\.finish-sketch\s*\{[^}]*height:\s*50px/s)
  assert.match(ribbon, /className={'tool-btn sk'/)
})
