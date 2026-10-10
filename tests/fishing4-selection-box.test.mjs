// FISHING4 P2 + P1 regression: Ctrl additive body selection helpers + box-select toggle/Esc;
// React #185 — BrowserTree must not return unstable arrays from useApp selectors.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { clickMod, applySelClick, mergeSel } from '../src/cad/modelSelection.ts'

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

test('applySelClick / mergeSel guard null/undefined selection arrays', () => {
  const a = { kind: 'body', key: 'active' }
  assert.deepEqual(applySelClick(null, a, 'toggle').map((x) => x.key), ['active'])
  assert.deepEqual(applySelClick(undefined, a, 'replace').map((x) => x.key), ['active'])
  assert.deepEqual(mergeSel(null, [a]).map((x) => x.key), ['active'])
  assert.deepEqual(mergeSel(undefined, undefined), [])
})

test('BrowserTree wires modelSelClick + clickMod for bodies', () => {
  const src = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
  assert.match(src, /import \{ clickMod \} from '\.\.\/cad\/modelSelection'/)
  assert.match(src, /st\.modelSelClick\(\{ kind: 'body', key: ACTIVE_BODY_KEY \}, mod\)/)
  assert.match(src, /st\.modelSelClick\(\{ kind: 'body', key, parked: i \}, mod\)/)
})

test('BrowserTree modelSel selector is snapshot-stable (no React #185)', () => {
  const src = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
  // Must join to a primitive inside useApp — returning filter().map() array crashes zustand v5 + React #185
  assert.match(src, /modelSel\s*\?\?/)
  assert.match(src, /\.join\(['"]\\n['"]\)/)
  assert.doesNotMatch(src, /useApp\(\(s\) => s\.modelSel\.filter/)
})

test('ErrorBoundary uses Formal Traditional 出錯 (not Simplify 出错)', () => {
  const src = readFileSync(new URL('../src/components/ErrorBoundary.tsx', import.meta.url), 'utf8')
  assert.match(src, /面板出錯/)
  assert.match(src, /出錯:/)
  assert.doesNotMatch(src, /面板出错/)
  assert.doesNotMatch(src, /出错:/)
})

test('Viewport select tool toggles off; Esc exits select in App', () => {
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(vp, /setNavTool\(navTool === 'select' \? 'orbit' : 'select'\)/)
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /navTool === 'select'\) \{ s\.setNavTool\('orbit'\)/)
  assert.match(app, /已退出框選模式/)
  assert.doesNotMatch(app, /已退出框选/)
})
