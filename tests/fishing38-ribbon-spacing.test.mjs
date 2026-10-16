/**
 * FISHING38: Fusion-like ribbon spacing (CSS-only).
 * No data-cmd / testid changes; sketch layout contract preserved.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')

test('panel-tools default gap 2px + divider margin 6px (Fusion breathing room)', () => {
  assert.match(css, /\.panel-tools\s*\{[^}]*gap:\s*2px[^}]*padding:\s*0 3px/s)
  assert.match(css, /\.panel-divider\s*\{[^}]*margin:\s*2px 6px 2px/)
  assert.match(css, /\.panel\s*\{[^}]*padding:\s*0 3px/)
  assert.match(css, /\.ribbon-panels\s*\{[^}]*padding:\s*4px 6px 16px/s)
})

test('laptop compact keeps 1px gap (not 0) so Phase3 sk-dual stays readable', () => {
  const mq = css.match(/@media \(min-width: 821px\) and \(max-width: 1440px\)\s*\{([\s\S]*?)\n\}/)
  assert.ok(mq, 'laptop media query present')
  assert.match(mq[1], /\.panel-tools\s*\{\s*gap:\s*1px/)
  assert.doesNotMatch(mq[1], /\.panel-tools\s*\{\s*gap:\s*0\b/)
})

test('sk-dual icon-row gap 4px; sketch layout contract unchanged', () => {
  assert.match(css, /\.tool-btn\.sk\.sk-dual \.sk-icon-row\s*\{[^}]*gap:\s*4px/s)
  assert.match(css, /\.tool-btn\.sk\s*\{[^}]*min-width:\s*52px[^}]*height:\s*40px[^}]*overflow:\s*hidden/s)
})

test('no data-cmd / testid churn in Ribbon for this polish', () => {
  assert.match(ribbon, /data-cmd=\{t\.id\}/)
  assert.match(ribbon, /data-testid="ribbon-group-menu"/)
})
