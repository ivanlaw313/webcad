/**
 * v1.99: BD-9602 objectVis status TC + locale-v197 construction-axis tip must
 * contain token 構造幾何 (title/mode stay 構造軸／軸). Viewport mate/screenshot residuals TC.
 * APP 2.00 + SW webcad-v2.00.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')

test('APP_VERSION 2.00; SW webcad-v2.00', () => {
  assert.match(version, /APP_VERSION = '2\.00'/)
  assert.match(sw, /const CACHE = 'webcad-v2\.00/)
})

test('BD-9602 objectVis status 全部構造軸：顯示／隱藏 TC', () => {
  assert.match(store, /axes: '全部構造軸'/)
  assert.match(store, /planes: '全部原點\/構造面'/)
  assert.match(store, /sketches: '全部草圖'/)
  assert.match(store, /joints: '全部關節'/)
  assert.match(store, /v \? '顯示' : '隱藏'/)
  assert.doesNotMatch(store, /axes: '全部构造轴'/)
  assert.doesNotMatch(store, /sketches: '全部草图'/)
  assert.doesNotMatch(store, /planes: '全部原点\/构造面'/)
  assert.doesNotMatch(store, /joints: '全部关节'/)
  assert.doesNotMatch(store, /v \? '显示' : '隐藏'/)
})

test('locale-v197: axis tip includes 構造幾何 token (prepend)', () => {
  // tipHead for non-plane: `構造幾何 · ${kindLbl}` → status starts with 構造幾何 · 構造軸 · …
  assert.match(store, /構造幾何 · \$\{kindLbl\}/)
  assert.match(store, /type === 'axis' \? '構造軸' : type === 'point' \? '構造點' : '構造幾何'/)
  assert.match(store, /🎯 順序拾/)
  assert.match(store, /一個圓柱面/)
  assert.doesNotMatch(store, /构造几何 ·/)
  assert.doesNotMatch(store, /🎯 顺序拾/)
})

test('Viewport mate/beam/screenshot residuals TC', () => {
  assert.match(vp, />X軸</)
  assert.match(vp, /Y軸\(豎直\)/)
  assert.match(vp, />間隙<input/)
  assert.match(vp, /▣揀面配合/)
  assert.match(vp, /按孔配螺絲/)
  assert.match(vp, /全孔配螺絲/)
  assert.match(vp, /翻轉：平面→同向/)
  assert.match(vp, /3D 視圖未就緒，無法截圖/)
  assert.match(vp, /截圖未能保留畫面/)
  assert.doesNotMatch(vp, />X轴</)
  assert.doesNotMatch(vp, /按孔配螺丝/)
  assert.doesNotMatch(vp, /3D 视图未就绪/)
  assert.doesNotMatch(vp, /浏览器绘图缓冲为空/)
})
