/**
 * FISHING58: import/refuse Formal 導入→匯入 + 3MF chooser body mount + measure 圓稜／弧長 status.
 * F52/F53: 3MF/DXF refuse toast Formal; measure 圓稜 deeper than tip-only.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const st = read('src/store.ts')
const im = read('src/cad/insertModel.ts')
const vp = read('src/components/Viewport.tsx')

function sliceBetween(src, startNeedle, endNeedle) {
  const i = src.indexOf(startNeedle)
  assert.ok(i >= 0, `missing ${startNeedle}`)
  const j = src.indexOf(endNeedle, i + startNeedle.length)
  assert.ok(j > i, `missing end after ${startNeedle}`)
  return src.slice(i, j)
}

test('FISHING58 rejectDxfImport uses 匯入 (not 導入)', () => {
  assert.match(im, /請拆分圖層或簡化後匯入/)
  assert.doesNotMatch(im, /簡化後導入/)
})

test('FISHING58 large mesh/OBJ/3MF confirms + STEP/DXF/SVG status use 匯入', () => {
  assert.match(st, /繼續匯入？`, '大型網格匯入'/)
  assert.match(st, /繼續匯入？`, '大型 OBJ 匯入'/)
  assert.match(st, /繼續匯入？`, '大型 3MF 匯入'/)
  assert.match(st, /已匯入 STEP 為 B-rep 實體/)
  assert.match(st, /STEP B-rep 匯入失敗/)
  assert.match(st, /已匯入 DXF：\$\{note\}/)
  assert.match(st, /已匯入 SVG：\$\{note\}/)
  assert.match(st, /僅匯入為草圖/)
  assert.doesNotMatch(st, /繼續導入？/)
  assert.doesNotMatch(st, /已導入 STEP/)
  assert.doesNotMatch(st, /已導入 DXF/)
  assert.doesNotMatch(st, /已導入 SVG/)
})

test('FISHING58 open3MFDialog mounts hidden input on document.body', () => {
  const block = sliceBetween(st, 'open3MFDialog: () => {', 'openStepComponentDialog: () => {')
  assert.match(block, /host\?\.appendChild\) host\.appendChild\(inp\)/)
  assert.match(block, /inp\.style\.position = 'fixed'/)
  assert.match(block, /inp\.addEventListener\?\.\('cancel'/)
  assert.match(block, /cleanup\(\)/)
  assert.match(block, /accept = '\.3mf'/)
  assert.match(block, /FISHING58/)
})

test('FISHING58 measure-edge status + card hint surface 圓稜／弧長', () => {
  assert.match(st, /toggleMeasureEdge:[\s\S]*?圓稜／弧稜顯示 Ø、R 與弧長／周長/)
  assert.match(vp, /圓稜／弧稜顯示 Ø、R 與弧長／周長/)
})

test('FISHING58 MATERIALS / DENSITY_PREF stay SC', () => {
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
})
