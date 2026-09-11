import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const drawing = readFileSync(new URL('../src/components/DrawingPanel.tsx', import.meta.url), 'utf8')
const command = readFileSync(new URL('../src/components/CommandDialog.tsx', import.meta.url), 'utf8')

function rule(selector) {
  const re = new RegExp(String.raw`${selector}\s*\{([^}]*)\}`, 'm')
  const m = css.match(re)
  assert.ok(m, `missing CSS rule ${selector}`)
  return m[1]
}

test('UI001/DR004 drawing overlay scrolls instead of clipping under body overflow:hidden', () => {
  const overlay = rule('\\.drawing-overlay')
  assert.match(overlay, /align-items:\s*flex-start/)
  assert.match(overlay, /overflow:\s*auto/)
  const modal = rule('\\.drawing-modal')
  assert.match(modal, /display:\s*flex/)
  assert.match(modal, /flex-direction:\s*column/)
  assert.match(modal, /max-height:\s*min\(88vh,\s*calc\(100dvh - 16px\)\)/)
  assert.match(modal, /overflow:\s*hidden/)
  const body = rule('\\.dw-body')
  assert.match(body, /flex:\s*1 1 auto/)
  assert.match(body, /min-height:\s*0/)
  assert.match(body, /overflow:\s*auto/)
  assert.match(drawing, /className="dw-body"/)
  assert.match(drawing, /e\.target === e\.currentTarget/)
})

test('UI001/DR004 annotation toolbar wraps or scrolls with numeric fields reachable', () => {
  const foot = rule('\\.dw-foot')
  assert.match(foot, /flex-wrap:\s*wrap/)
  assert.match(foot, /overflow-x:\s*auto/)
  assert.match(foot, /flex:\s*0 0 auto/)
  const group = rule('\\.dw-tool-group')
  assert.match(group, /flex-wrap:\s*wrap/)
  assert.match(group, /max-width:\s*100%/)
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.dw-views\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*?\.dw-views\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  assert.match(drawing, /className="dw-tool-group"/)
  assert.match(drawing, /type="number"/)
})

test('UI001 command Confirm/Cancel stay visible at short/zoomed CSS viewports', () => {
  assert.match(css, /\.cmd-palette-head, \.cmd-palette-foot, \.cmd-palette-summary\s*\{\s*flex-shrink:\s*0/)
  assert.match(css, /@media \(max-height: 640px\)[\s\S]*?\.cmd-palette\s*\{[^}]*top:\s*8px !important[^}]*max-height:\s*calc\(100vh - 16px\) !important/)
  assert.match(css, /@media \(max-width: 800px\)[\s\S]*?\.vp-navbar\s*\{[^}]*max-width:\s*calc\(100% - 16px\)/)
  assert.match(command, /data-testid="command-confirm"/)
  assert.match(command, /data-testid="command-cancel"/)
  assert.match(command, /maxHeight: 'calc\(100vh - 16px\)'/)
})
