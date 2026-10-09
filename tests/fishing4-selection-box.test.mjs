// FISHING4 P2: Ctrl additive body selection helpers + box-select toggle/Esc contract.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { clickMod, applySelClick } from '../src/cad/modelSelection.ts'

test('clickMod Ctrl/Meta/Shift → toggle; plain → replace', () => {
  assert.equal(clickMod({}), 'replace')
  assert.equal(clickMod({ ctrlKey: true }), 'toggle')
  assert.equal(clickMod({ metaKey: true }), 'toggle')
  assert.equal(clickMod({ shiftKey: true }), 'toggle')
})

test('applySelClick toggle adds then removes body', () => {
  const a = { kind: 'body', key: 'active' }
  const b = { kind: 'body', key: 'parked:0', parked: 0 }
  let sel = applySelClick([], a, 'replace')
  assert.deepEqual(sel.map((x) => x.key), ['active'])
  sel = applySelClick(sel, b, 'toggle')
  assert.deepEqual(sel.map((x) => x.key), ['active', 'parked:0'])
  sel = applySelClick(sel, a, 'toggle')
  assert.deepEqual(sel.map((x) => x.key), ['parked:0'])
})

test('BrowserTree wires modelSelClick + clickMod for bodies', () => {
  const src = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
  assert.match(src, /import \{ clickMod \} from '\.\.\/cad\/modelSelection'/)
  assert.match(src, /st\.modelSelClick\(\{ kind: 'body', key: ACTIVE_BODY_KEY \}, mod\)/)
  assert.match(src, /st\.modelSelClick\(\{ kind: 'body', key, parked: i \}, mod\)/)
})

test('Viewport select tool toggles off; Esc exits select in App', () => {
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(vp, /setNavTool\(navTool === 'select' \? 'orbit' : 'select'\)/)
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /navTool === 'select'\) \{ s\.setNavTool\('orbit'\)/)
  assert.match(app, /已退出框選模式/)
  assert.doesNotMatch(app, /已退出框选/)
})
