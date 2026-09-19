/**
 * v1.26: Component Boolean must be reachable from ribbon (ASSEMBLE / MESH / LAB),
 * not only the viewport selection bar 🧩布尔. Contract: command id `compboolean`
 * exists in ribbon map and runCommand routes to startComponentBoolean.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { WORKSPACES } from '../src/ribbon.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const browser = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const palette = readFileSync(new URL('../src/components/CommandPalette.tsx', import.meta.url), 'utf8')

function toolIds(tab, panelName) {
  const panels = WORKSPACES[tab]?.panels ?? []
  const p = panels.find((x) => x.name === panelName)
  return (p?.tools ?? []).map((t) => t.id)
}

test('APP_VERSION is 1.26+ (superseded by later ship)', () => {
  assert.match(version, /APP_VERSION = '1\.(2[6-9]|[3-9]\d)'/)
})

test('ribbon command id compboolean exists (ASSEMBLE + MESH MODIFY + LAB)', () => {
  assert.ok(toolIds('SOLID', 'ASSEMBLE').includes('compboolean'), 'SOLID ASSEMBLE missing compboolean')
  assert.ok(toolIds('MESH', 'MODIFY').includes('compboolean'), 'MESH MODIFY missing compboolean')
  const lab = WORKSPACES['🧪實驗室']?.panels ?? []
  const direct = lab.find((p) => p.name === '直接編輯擴展' || p.name === '直接编辑扩展')
  assert.ok(direct?.tools.some((t) => t.id === 'compboolean'), 'LAB 直接編輯擴展 missing compboolean')
  assert.match(ribbon, /id: 'compboolean'/)
  assert.match(ribbon, /label: '組件布爾'|label: '组件布尔'/)
})

test('SOLID MODIFY Fusion order unchanged (compboolean NOT in Fusion MODIFY)', () => {
  const modify = toolIds('SOLID', 'MODIFY')
  assert.ok(!modify.includes('compboolean'), 'do not mix WebCAD extension into Fusion MODIFY')
  assert.ok(modify.includes('combine'), 'combine still in MODIFY')
})

test('runCommand maps compboolean → startComponentBoolean', () => {
  const start = store.indexOf("case 'compboolean'")
  assert.ok(start >= 0, 'missing case compboolean')
  const end = store.indexOf("case 'meshfit':", start)
  assert.ok(end > start)
  const block = store.slice(start, end)
  assert.match(block, /startComponentBoolean\(id\)/)
  assert.match(block, /selectedComponent/)
  assert.match(block, /请先在浏览器选择一个组件/)
  assert.match(block, /visible\.length === 1/)
})

test('startComponentBoolean still defined (viewport + ribbon share)', () => {
  assert.match(store, /startComponentBoolean:\s*async\s*\(id\)/)
})

test('CompBoolPickPanel + bake chip preserved', () => {
  assert.match(viewport, /function CompBoolPickPanel/)
  assert.match(viewport, /data-testid="comp-bool-pick-panel"/)
  assert.match(store, /bakeMeshToPart/)
  assert.match(store, /烘焙為零件實體/)
})

test('BrowserTree ⋯ menu exposes 組件布爾', () => {
  assert.match(browser, /data-testid="browser-compboolean"/)
  assert.match(browser, /startComponentBoolean\(c\.id\)/)
  assert.match(browser, /組件布爾|组件布尔/)
})

test('CommandPalette synonym for 組件布爾', () => {
  assert.match(palette, /compboolean:/)
  assert.match(palette, /組件布爾|组件布尔/)
})
