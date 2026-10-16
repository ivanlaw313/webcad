/**
 * FISHING55: DXF/SVG file-chooser mount + 檢查擴展 zebra/access polish.
 * Real UX fixes (not Formal UV). Keeps MATERIALS SC; more34 CORE16 sample separate.
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

function sliceBetween(src, startNeedle, endNeedle) {
  const i = src.indexOf(startNeedle)
  assert.ok(i >= 0, `missing ${startNeedle}`)
  const j = src.indexOf(endNeedle, i + startNeedle.length)
  assert.ok(j > i, `missing end after ${startNeedle}`)
  return src.slice(i, j)
}

test('FISHING55 openDxfDialog mounts hidden input on document.body', () => {
  const block = sliceBetween(st, 'openDxfDialog: () => {', 'showProps: true,')
  assert.match(block, /host\?\.appendChild\) host\.appendChild\(inp\)/)
  assert.match(block, /inp\.style\.position = 'fixed'/)
  assert.match(block, /inp\.addEventListener\?\.\('cancel'/)
  assert.match(block, /cleanup\(\)/)
  assert.match(block, /accept = '\.dxf'/)
  // still parses + refusees after pick
  assert.match(block, /rejectDxfImport/)
  assert.match(block, /openInsertVec\('dxf'/)
})

test('FISHING55 openSvgDialog mounts hidden input on document.body', () => {
  const block = sliceBetween(st, 'openSvgDialog: () => {', 'insertVec: null,')
  assert.match(block, /host\?\.appendChild\) host\.appendChild\(inp\)/)
  assert.match(block, /inp\.style\.position = 'fixed'/)
  assert.match(block, /inp\.addEventListener\?\.\('cancel'/)
  assert.match(block, /accept = '\.svg'/)
  assert.match(block, /openInsertVec\('svg'/)
})

test('FISHING55 檢查擴展 lists 斑馬紋 + 脫模可達性', () => {
  const i = ribbon.indexOf("name: '檢查擴展'")
  assert.ok(i >= 0)
  const j = ribbon.indexOf("name: '構造擴展'", i)
  assert.ok(j > i)
  const block = ribbon.slice(i, j)
  assert.match(block, /id: 'zebra', label: '斑馬紋'/)
  assert.match(block, /id: 'accessanalysis', label: '脫模可達性'/)
  // keep prior inspect-ext tools
  assert.match(block, /id: 'gausscurv'/)
  assert.match(block, /id: 'slopeanalysis'/)
})

test('FISHING55 MATERIALS / DENSITY_PREF stay SC', () => {
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
})

test('FISHING55 F54 Formal regressions still present', () => {
  assert.match(st, /太陽輪 z\$\{zs\}/)
  assert.match(st, /manifold 精確布爾/)
  assert.match(st, /addParam\('長L'/)
})
