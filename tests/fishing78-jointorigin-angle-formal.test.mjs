/**
 * FISHING78: joint-origin angle Formal 轉角 (not 旋轉角度) — distinguish from 旋轉 feature.
 * FEA tip 設定力 Formal polish.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING78 JointsPanel joint-origin uses 轉角 not 旋轉角度', () => {
  const jp = read('src/components/JointsPanel.tsx')
  assert.match(jp, /title="繞原點 Z 軸轉角"/)
  assert.match(jp, /label="轉角（°）"/)
  assert.match(jp, /title="關節原點繞 Z 軸轉角（°）"/)
  assert.doesNotMatch(jp, /繞原點 Z 軸旋轉角度/)
})

test('FISHING78 FEA tip Formal 設定力; revolve feature label 旋轉 kept', () => {
  const vp = read('src/components/Viewport.tsx')
  const rb = read('src/ribbon.ts')
  assert.match(vp, /先點①固定面 \+ ②預載面 \+ 設定力/)
  assert.match(vp, /先點①固定面 \+ ②受力面 \+ 設定力/)
  assert.doesNotMatch(vp, /\+ 設力'/)
  assert.match(rb, /id: 'revolve', label: '旋轉'/)
})

test('FISHING78 MATERIALS/DENSITY_PREF SC kept; F77 連結 kept', () => {
  const st = read('src/store.ts')
  const cm = read('src/assembly/componentMove.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(cm, /以關節「\$\{jn\(j0\)\}」連結/)
})
