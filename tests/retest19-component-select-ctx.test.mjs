// RETEST19 #4：右鍵組件唔清選擇、首下就開組件菜單（冇 pointerdown 記錄唔當右拖；把手唔接右鍵）。
// RETEST19 #5：首下 Ctrl+點組件就加入選集（已選主組件併入集合）；瀏覽樹 Ctrl/Shift+點同樣。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gumballFirst, isSecondaryButtonEvent, GUMBALL_USERDATA } from '../src/assembly/gumballPick.ts'
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const tree = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
const reset = (extra = {}) => useApp.setState({ selectedComponent: null, checkedComps: [], modelSel: [], compBoolPending: null, compMateFrom: null, compMeasureFrom: null, status: '', ...extra })
const count = () => g().checkedComps.length || (g().selectedComponent ? 1 : 0)

test('#5 first Ctrl+click on a second component adds it (A selected → A+B), then C, then toggles off', () => {
  reset({ selectedComponent: 'A' })
  g().toggleComponentInSelection('B')
  assert.deepEqual(g().checkedComps, ['A', 'B'])
  assert.equal(g().selectedComponent, 'A')
  assert.equal(count(), 2)
  g().toggleComponentInSelection('C')
  assert.equal(count(), 3)
  g().toggleComponentInSelection('B'); g().toggleComponentInSelection('C')
  assert.deepEqual([g().selectedComponent, g().checkedComps], ['A', []])
  g().toggleComponentInSelection('A')
  assert.deepEqual([g().selectedComponent, count()], [null, 0])
})

test('#5 Ctrl+click with nothing selected selects that component', () => {
  reset()
  g().toggleComponentInSelection('B')
  assert.deepEqual([g().selectedComponent, count()], ['B', 1])
})

test('#4 right-click keeps an existing (multi-)selection; unselected component gets selected without clearing faces', () => {
  const face = { kind: 'face', key: 'f1', pt: [0, 0, 0], tris: [] }
  reset({ selectedComponent: 'A', checkedComps: ['A', 'B'], modelSel: [face] })
  g().contextSelectComponent('B')
  assert.deepEqual([g().selectedComponent, g().checkedComps, g().modelSel.length], ['A', ['A', 'B'], 1])
  assert.doesNotMatch(g().status, /已取消選擇/)
  g().contextSelectComponent('C')
  assert.deepEqual([g().selectedComponent, g().checkedComps, g().modelSel.length], ['C', [], 1])
  reset({ selectedComponent: 'A', compMateFrom: 'A' })
  g().contextSelectComponent('B')
  assert.equal(g().selectedComponent, 'A')   // 兩步拾取中：右鍵唔當揀第二件
})

test('#4 viewport: no recorded pointerdown is not a right-drag; menu opens via contextSelectComponent; gumball ignores secondary buttons', () => {
  assert.match(vp, /const moved = d \? Math\.hypot\(e\.clientX - d\.x, e\.clientY - d\.y\) : 0/)
  assert.match(vp, /if \(ctxHit\.kind === 'component' && ctxHit\.compId\) stc\.contextSelectComponent\(ctxHit\.compId\)/)
  assert.match(vp, /clickMod\(ne\) === 'toggle'\) \{ st\.toggleComponentInSelection\(compId\)/)
  const handle = { object: { userData: GUMBALL_USERDATA, parent: null } }, part = { object: { userData: {}, parent: null } }
  assert.deepEqual(gumballFirst([part, handle]), [handle, part])
  assert.deepEqual(gumballFirst([part, handle], true), [part])
  assert.equal(isSecondaryButtonEvent({ type: 'pointerdown', button: 2 }), true)
  assert.equal(isSecondaryButtonEvent({ type: 'contextmenu', button: 2 }), true)
  assert.equal(isSecondaryButtonEvent({ type: 'pointerdown', button: 0 }), false)
  assert.equal(isSecondaryButtonEvent({ type: 'pointermove', button: -1 }), false)
})

test('#5 browser tree: Ctrl/Shift+click on a component name adds to the selection', () => {
  assert.match(tree, /else if \(e\.ctrlKey \|\| e\.metaKey \|\| e\.shiftKey\) useApp\.getState\(\)\.toggleComponentInSelection\(c\.id\)/)
})
