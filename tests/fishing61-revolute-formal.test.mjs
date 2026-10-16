/**
 * FISHING61: revolute status/tips 旋轉→轉動; leftover 文件→檔案 / 導出→匯出.
 * Keep Revolve feature 旋轉 and MATERIALS SC.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING61 JointsPanel flip tip 轉動／滑動 not 旋轉', () => {
  const jp = read('src/components/JointsPanel.tsx')
  assert.match(jp, /轉動／滑動方向相反/)
  assert.doesNotMatch(jp, /旋轉／滑動方向相反/)
})

test('FISHING61 joint pick plane clarify 轉動／滑動軸', () => {
  const st = read('src/store.ts')
  assert.match(st, /轉動／滑動軸將取自已選圓柱面/)
  assert.doesNotMatch(st, /旋轉／滑動軸將取自已選圓柱面/)
})

test('FISHING61 loop-cut status + i18n key Formal 轉動關節', () => {
  const st = read('src/store.ts')
  const i18n = read('src/i18n.ts')
  assert.match(st, /可剪開的轉動關節/)
  assert.match(i18n, /可剪開的轉動關節/)
  assert.doesNotMatch(i18n, /可剪開的旋轉關節/)
})

test('FISHING61 Formal leftover 檔案／匯出 STEP', () => {
  const w = read('src/worker/cad.worker.ts')
  const rb = read('src/ribbon.ts')
  const pl = read('src/components/PhysicsLab.tsx')
  const pp = read('src/components/ParamsPanel.tsx')
  const vp = read('src/components/Viewport.tsx')
  assert.match(w, /匯出 STEP/)
  assert.doesNotMatch(w, /導出 STEP/)
  assert.match(w, /檢查檔案是即有效 STEP/)
  assert.match(rb, /不會取代當前檔案/)
  assert.match(pl, /同一 WebCAD 檔案的風洞結果/)
  assert.match(pp, /方便檔案\/分享\/Excel/)
  assert.match(vp, /跨檔案全局儲存/)
})

test('FISHING61 Revolve feature 旋轉 kept; MATERIALS SC kept', () => {
  const st = read('src/store.ts')
  const kin = read('src/assembly/kinematics.ts')
  assert.match(kin, /revolute: '轉動'/)
  assert.match(st, /FEATURE_TYPE_LABEL[\s\S]*revolve: '旋轉'/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})
