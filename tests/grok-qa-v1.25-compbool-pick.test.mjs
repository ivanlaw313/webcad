/**
 * v1.25: Component Boolean tool-pick must be completable (Browser / viewport /
 * checkbox / list); selectComponentBody must not wipe pending; bake statusAction
 * still appears after successful boolean.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const browser = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('APP_VERSION is 1.25+ (superseded by later ship)', () => {
  assert.match(version, /APP_VERSION = '1\.(2[5-9]|[3-9]\d)'/)
})

test('pickComponentBooleanTool + cancelComponentBoolean exist', () => {
  assert.match(store, /pickComponentBooleanTool:\s*\(toolId/)
  assert.match(store, /cancelComponentBoolean:\s*\(\)/)
  assert.match(store, /canonical finish path for pending component boolean/)
})

test('selectComponent keeps pending on null/source; finishes via pickComponentBooleanTool', () => {
  assert.match(store, /never silently drop compBoolPending/)
  assert.match(store, /get\(\)\.pickComponentBooleanTool\(id\)/)
  assert.match(store, /组件布尔待选工具件/)
})

test('selectComponentBody finishes boolean on other component (does not wipe pending)', () => {
  assert.match(store, /body click on ANOTHER component finishes boolean/)
  assert.match(store, /pickComponentBooleanTool\(componentId/)
})

test('toggleCheckComp finishes pending boolean when checking another component', () => {
  assert.match(store, /Browser checkbox on another component/)
  assert.match(store, /get\(\)\.pickComponentBooleanTool\(id\)/)
})

test('startComponentBoolean status documents Browser / viewport / checkbox / list', () => {
  assert.match(store, /document ALL completable pick paths/)
  assert.match(store, /浏览树点另一个零件名/)
  assert.match(store, /视口点另一个零件/)
  assert.match(store, /勾选另一零件复选框/)
  assert.match(store, /上方列表按钮/)
})

test('successful componentBoolean always sets bake statusAction', () => {
  const start = store.indexOf('componentBoolean: async')
  const end = store.indexOf('planeCutComponent: async')
  assert.ok(start >= 0 && end > start)
  const block = store.slice(start, end)
  assert.match(block, /ALWAYS show primary bake statusAction after success/)
  assert.match(block, /bakeMeshToPart/)
  assert.match(block, /烘焙为零件实体/)
  assert.doesNotMatch(block, /appConfirm/)
})

test('Viewport CompBoolPickPanel + no toggle-null while pending', () => {
  assert.match(viewport, /function CompBoolPickPanel/)
  assert.match(viewport, /data-testid="comp-bool-pick-panel"/)
  assert.match(viewport, /pickComponentBooleanTool/)
  assert.match(viewport, /cancelComponentBoolean/)
  assert.match(viewport, /if \(st\.compBoolPending\)/)
  assert.match(viewport, /!useApp\.getState\(\)\.compBoolPending/)
})

test('BrowserTree pending-aware click + checkbox title', () => {
  assert.match(browser, /compBoolPending/)
  assert.match(browser, /if \(compBoolPending\) selectComponent\(c\.id\)/)
  assert.match(browser, /勾選此零件＝選為組件布爾工具件|勾选此零件＝选为组件布尔工具件/)
})

test('Esc cancels compBoolPending', () => {
  assert.match(app, /compBoolPending && e\.key === 'Escape'/)
  assert.match(app, /cancelComponentBoolean\(\)/)
})
