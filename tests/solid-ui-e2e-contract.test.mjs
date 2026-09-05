import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const ribbon = fs.readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const viewport = fs.readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const dialog = fs.readFileSync(new URL('../src/components/CommandDialog.tsx', import.meta.url), 'utf8')
const timeline = fs.readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
const spec = fs.readFileSync(new URL('./e2e/solid-ui-workflow.playwright.mjs', import.meta.url), 'utf8')

test('isolated SOLID browser workflow has durable language-independent UI anchors', () => {
  assert.match(app, /data-ui-test=\{isUiTestIsolation\(\) \? 'true' : 'false'\}/)
  assert.match(ribbon, /data-ribbon-group=\{name\}/)
  assert.match(viewport, /data-testid="visual-style-menu-trigger"/)
  assert.match(viewport, /data-testid="visual-style-picker"/)
  assert.match(viewport, /data-visual-style=\{visualStyle\}/)
  assert.match(viewport, /onPointerDown=\{\(e\) => e\.stopPropagation\(\)\}/)
  assert.match(viewport, /setVisualStyle\(vs\); setNavPop\(null\)/)
  assert.match(dialog, /data-testid="command-dialog"/)
  assert.match(dialog, /data-testid="command-confirm"/)
  assert.match(dialog, /data-testid="command-cancel"/)
  assert.match(timeline, /data-testid="timeline"/)
  assert.match(timeline, /data-feature-count=\{features\.length\}/)
})

test('Playwright workflow is explicitly isolated and covers create, numeric entry, undo/redo, display and cancel', () => {
  assert.match(spec, /\?ui-test=1/)
  for (const step of ['[data-cmd="box"]', "fill('40')", 'data-feature-count', 'Control+z', 'Control+y', 'Control+4', '.vp-display-menu', "press('Escape')"]) {
    assert.ok(spec.includes(step), `missing workflow step: ${step}`)
  }
  assert.doesNotMatch(spec, /cad\.neuralworkshk\.com/)
})
