import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (name) => readFileSync(new URL(`../src/components/${name}`, import.meta.url), 'utf8')

test('every collapsible draggable surface keeps its measuring ref', () => {
  const inspector = read('InspectorPanel.tsx')
  const params = read('ParamsPanel.tsx')
  const joints = read('JointsPanel.tsx')

  assert.match(inspector, /<button\s+ref=\{panelDrag\.ref\}[\s\S]*?joints-pill/)
  assert.match(params, /if \(collapsed\) return <button ref=\{panelDrag\.ref\}[\s\S]*?params-pill/)
  assert.match(joints, /<button[\s\S]*?ref=\{panelDrag\.ref\}[\s\S]*?joints-pill/)
})

test('all movable overlay variants attach to the viewport-clamping hook', () => {
  const viewport = read('Viewport.tsx')
  const debug = read('DebugHud.tsx')
  const ai = read('AiCopilot.tsx')

  assert.equal((viewport.match(/ref=\{skBarDrag\.ref\}/g) || []).length, 2)
  assert.match(debug, /<div ref=\{drag\.ref\} onPointerDown=\{drag\.onPointerDown\}/)
  assert.match(ai, /<div ref=\{drag\.ref\} style=\{\{ position: 'fixed'/)
  assert.match(ai, /onPointerDown=\{drag\.onPointerDown\} title="拖移 AI 面板"/)
  assert.equal((ai.match(/onPointerDown=\{\(e\) => e\.stopPropagation\(\)\}/g) || []).length, 3)
})

test('the common hook measures generic panel or button surfaces and handles interrupted drags', () => {
  const draggable = read('useDraggable.ts')

  assert.match(draggable, /useRef<HTMLElement \| null>/)
  assert.match(draggable, /const ref = \(el: HTMLElement \| null\) => \{ elementRef\.current = el \}/)
  assert.match(draggable, /window\.addEventListener\('pointercancel', up\)/)
  assert.match(draggable, /window\.addEventListener\('blur', up\)/)
})
