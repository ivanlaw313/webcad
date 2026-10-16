/**
 * FISHING79: FEA / generative Formal 設定力 (finish F78 Viewport leftovers in store/ribbon/ai/i18n).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING79 store generative + FEA load status use 設定力 not 設力', () => {
  const st = read('src/store.ts')
  assert.match(st, /生成式設計：點①固定面（保留區）\+ ②受力面 \+ 設定力/)
  assert.match(st, /生成式設計：先點固定面（保留區）\+ 受力面 \+ 設定力（同受力雲圖一樣）/)
  assert.match(st, /已選受力面 — 設定力\/方向\/材料\/解析度/)
  assert.match(st, /並設定力 ——/)
  assert.doesNotMatch(st, /并設力/)
  assert.doesNotMatch(st, /受力面 \+ 設力/)
  assert.doesNotMatch(st, /— 設力\//)
})

test('FISHING79 ribbon tip.fea + ai buckling + i18n keys 設定力', () => {
  const rb = read('src/ribbon.ts')
  const ai = read('src/ai/tools.ts')
  const i18n = read('src/i18n.ts')
  assert.match(rb, /點受力面 → 設定力 → 出應力雲圖/)
  assert.match(ai, /並設定力（與受力雲圖一樣）/)
  assert.match(i18n, /已選受力面 — 設定力\/方向\/材料\/解析度/)
  assert.match(i18n, /受力面 \+ 設定力（同受力雲圖一樣）/)
})

test('FISHING79 MATERIALS/DENSITY_PREF SC kept; Viewport F78 設定力 kept', () => {
  const st = read('src/store.ts')
  const vp = read('src/components/Viewport.tsx')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(vp, /預載面 \+ 設定力/)
  assert.match(vp, /受力面 \+ 設定力/)
})
