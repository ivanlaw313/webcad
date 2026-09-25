// Static discoverability: AI Copilot, generative design, and steady-state thermal
// must be ribbon commands that the command palette indexes (node --test, no browser).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

const ribbon = read('src/ribbon.ts')
const palette = read('src/components/CommandPalette.tsx')
const store = read('src/store.ts')
const app = read('src/App.tsx')
const ribbonUi = read('src/components/Ribbon.tsx')

const IDS = ['aicopilot', 'topopt', 'thermal']

function sliceBetween(src, start, end) {
  const i = src.indexOf(start)
  const j = src.indexOf(end, i + start.length)
  assert.ok(i >= 0 && j > i, `missing slice ${start} … ${end}`)
  return src.slice(i, j)
}

test('ribbon exposes AI, generative design, and thermal command ids', () => {
  const labSim = sliceBetween(ribbon, "name: '仿真'", "name: '製造 CAM'")
  assert.match(labSim, /id: 'topopt'/)
  assert.match(labSim, /id: 'thermal'/)
  assert.doesNotMatch(labSim, /id: 'aicopilot'/)

  const utilities = sliceBetween(ribbon, 'const UTILITIES: Panel[]', 'export const FORM_PANELS')
  assert.match(utilities, /name: '助手'[\s\S]*id: 'aicopilot'/)
  assert.match(utilities, /shortcut: 'Ctrl\+Shift\+A'/)

  for (const id of IDS) assert.match(ribbon, new RegExp(`id: '${id}'`))
})

test('command palette indexes every workspace ribbon command id', () => {
  // Palette has no private command list: buildCommands copies each ribbon tool id.
  assert.match(palette, /for \(const wsName of Object\.keys\(WORKSPACES\)\)/)
  assert.match(palette, /byId\.set\(t\.id/)
  assert.match(palette, /c\.id !== 'select'/)
  assert.match(palette, /resolveAlias\(c\.id/)
  assert.match(palette, /c\.id\.toLowerCase\(\)\.includes\(s\)/)
  for (const id of IDS) {
    assert.match(ribbon, new RegExp(`id: '${id}'`))
    assert.doesNotMatch(palette, new RegExp(`c\\.id !== '${id}'`))
  }
})

test('store dispatches the discoverable command ids', () => {
  assert.match(store, /case 'aicopilot': return get\(\)\.toggleAiPanel\(\)/)
  assert.match(store, /case 'topopt': return get\(\)\.openSimPanel\('topopt'\)/)
  assert.match(store, /case 'thermal': return get\(\)\.openSimPanel\('thermal'\)/)
})

test('Ctrl+Shift+A opens AI Copilot and is not reused', () => {
  assert.match(app, /ck === 'a' && e\.shiftKey[\s\S]{0,180}runCommand\('aicopilot'/)
  assert.doesNotMatch(app, /ck === 'a' && e\.shiftKey[\s\S]{0,80}ck === 'a' && e\.shiftKey/)
  assert.match(ribbonUi, /runCommand\('aicopilot', 'AI 助手'\)/)
  const shortcuts = [...ribbon.matchAll(/shortcut: '([^']+)'/g)].map((m) => m[1])
  assert.deepEqual(shortcuts.filter((s) => s === 'Ctrl+Shift+A'), ['Ctrl+Shift+A'])
})

test('four locales carry search aliases for AI, generative, and thermal', () => {
  const expectAlias = {
    aicopilot: [/AI/i, /copilot/i, /助手/],
    topopt: [/generative/i, /topology/i, /生成式/, /拓撲|拓扑/, /トポロジー/],
    thermal: [/thermal/i, /熱分析/, /热分析/, /熱伝導|伝熱/],
  }
  for (const lang of ['zh-HK', 'zh-CN', 'en', 'ja']) {
    const src = read(`src/i18n/locales/${lang}.ts`)
    for (const id of IDS) {
      for (const key of [`alias.${id}`, `cmd.${id}`, `tool.${id}`, `tip.${id}`]) {
        assert.match(src, new RegExp(`"${key}":`))
      }
      const alias = src.match(new RegExp(`"alias\\.${id}": "([^"]*)"`))
      assert.ok(alias, `${lang} alias.${id}`)
      for (const re of expectAlias[id]) assert.match(alias[1], re, `${lang} alias.${id} ${re}`)
    }
  }
})
