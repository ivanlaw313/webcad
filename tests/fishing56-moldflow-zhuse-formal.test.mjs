/**
 * FISHING56: moldflow/analysis UI Formal TC — 着色 → 著色 (F53 recheck P1 @aCbC2XoX).
 * Pins user-visible moldflow summary + related FEA/draft/ribbon status strings.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const st = read('src/store.ts')
const ribbon = read('src/ribbon.ts')
const vp = read('src/components/Viewport.tsx')

test('FISHING56 moldflow dialog summary uses 趨勢著色 (not 着色)', () => {
  assert.match(vp, /趨勢著色（非商用模流精度）/)
  assert.doesNotMatch(vp, /趨勢着色（非商用模流精度）/)
})

test('FISHING56 FEA + moldflow status use 體素趨勢著色', () => {
  assert.match(st, /體素趨勢著色（線彈性）/)
  assert.match(st, /體素趨勢著色，壓力\/變形是相對值/)
  assert.doesNotMatch(st, /體素趨勢着色/)
})

test('FISHING56 FEA ribbon tip + draft tip use 著色', () => {
  assert.match(ribbon, /屬趨勢著色,非商用分析精度/)
  assert.match(ribbon, /按脫模方向著色正拔模/)
  assert.doesNotMatch(ribbon, /趨勢着色/)
  assert.doesNotMatch(ribbon, /方向着色正拔模/)
})

test('FISHING56 measureedge tip surfaces 圓稜／弧長', () => {
  const i = ribbon.indexOf("name: '檢查擴展'")
  assert.ok(i >= 0)
  const j = ribbon.indexOf("name: '構造擴展'", i)
  const block = ribbon.slice(i, j)
  assert.match(block, /id: 'measureedge'[\s\S]*?圓稜／弧稜[\s\S]*?弧長/)
})

test('FISHING56 MATERIALS / DENSITY_PREF stay SC', () => {
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
})
