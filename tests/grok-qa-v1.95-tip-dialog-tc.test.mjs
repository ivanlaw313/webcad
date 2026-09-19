/**
 * v1.95: residual store tip Record + Viewport status/dialog SC→TC
 * (move/scale/offset/box/… tips; Viewport mate/printbed/gearbox/status leftovers).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { catalogKeyCount, LOCALES, tStatus } from '../src/i18n.ts'
import { traditionalToSimplified } from '../src/i18n/tc2sc.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

test('APP_VERSION 1.96; SW webcad-v1.96', () => {
  assert.match(version, /APP_VERSION = '1\.96'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.96/)
})

test('catalog parity', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.equal(new Set(counts).size, 1, `unequal: ${counts}`)
})

function tipBlock() {
  const i0 = store.indexOf('const tip: Record<string, string> = {')
  assert.ok(i0 > 0, 'missing tip Record')
  const i1 = store.indexOf('\n    }', i0)
  assert.ok(i1 > i0)
  return store.slice(i0, i1)
}

test('store tip Record residual SC cleared (move/scale/box/…)', () => {
  const tip = tipBlock()
  assert.match(tip, /move: '移動\/複製：設 dx\/dy\/dz \+ 繞Z角 → 確定'/)
  assert.match(tip, /scale: '縮放：設比例 → 確定'/)
  assert.match(tip, /offsetsolid: '整體偏移：設距離（\+外擴 \/ −內縮，均勻偏移所有面）→ 確定'/)
  assert.match(tip, /box: `長方體：設長\/寬\/高 → 確定/)
  assert.match(tip, /cylinder: `圓柱：設直徑\/高 → 確定/)
  assert.match(tip, /caxis: '構造軸：選方向 X\/Y\/Z \+ 經過點 → 確定/)
  assert.match(tip, /gearbox: '齒輪箱向導（T770）/)
  assert.match(tip, /sheetmetal: '鈑金件：選截面/)
  assert.match(tip, /automatedmodel: 'Automated Modeling（Connector v1）：在畫布依次點選/)
  assert.match(tip, /pattern: '矩形陣列：設 X\/Y 數量與間距 → 確定'/)
  assert.match(tip, /mirror: '鏡像：設鏡像面／偏移 → 確定'/)
  const scNeedles = [
    '移动/复制', '缩放：设', '整体偏移：设', '长方体：设', '圆柱：设',
    '构造轴：选', '齿轮箱向导', '钣金件：选', '画布依次点选', '从实体切除',
    '→ 确定', '数量与间距', '镜像：设',
  ]
  for (const sc of scNeedles) {
    assert.equal(tip.includes(sc), false, `tip SC leftover: ${sc}`)
  }
})

test('Viewport high-vis status/dialog TC samples', () => {
  assert.match(vp, /輸入目標速比 ≥1/)
  assert.match(vp, /正在計算齒數組合/)
  assert.match(vp, /配合類型（包圍盒級窄版/)
  assert.match(vp, /配合·同心對齊/)
  assert.match(vp, /自定義打印床尺寸/)
  assert.match(vp, /請輸入 3 個正數/)
  assert.match(vp, /框選：選擇過濾已關閉「組件」類型/)
  assert.match(vp, /套索：選擇過濾已關閉「組件」類型/)
  assert.match(vp, /'鋼 1\.0mm'/)
  assert.match(vp, /'不鏽鋼 1\.2mm'/)
  assert.match(vp, /'鋁 1\.5mm'/)
  assert.equal(vp.includes('输入目标速比'), false)
  assert.equal(vp.includes('正在计算齿数'), false)
  assert.equal(vp.includes('配合类型（包围盒'), false)
  assert.equal(vp.includes("'钢 1.0mm'"), false)
  assert.equal(vp.includes('请输入 3 个正数'), false)
})

test('store mirror/pattern status leftovers TC', () => {
  assert.match(store, /鏡像未更改草圖/)
  assert.match(store, /陣列未修改：/)
  assert.match(store, /已取消鏡像；草圖保留/)
  assert.match(store, /已切回「選擇」（完成請按「完成草圖」）/)
  assert.equal(store.includes('镜像未更改草图'), false)
  assert.equal(store.includes('阵列未修改：'), false)
  assert.equal(store.includes("status: '已取消镜像；草图保留'"), false)
})

test('v1.95 tip tStatus zh-HK / zh-CN / en', () => {
  const samples = [
    ['移動/複製：設 dx/dy/dz + 繞Z角 → 確定', /移动\/复制/, 'Move/Copy'],
    ['縮放：設比例 → 確定', /缩放/, 'Scale:'],
    ['整體偏移：設距離（+外擴 / −內縮，均勻偏移所有面）→ 確定', /整体偏移/, 'Global offset'],
    ['長方體：設長/寬/高 → 確定', /长方体/, 'Box:'],
    ['構造軸：選方向 X/Y/Z + 經過點 → 確定（作旋轉/陣列/對齊參考）', /构造轴/, 'Construction axis'],
  ]
  for (const [tc, scRe, enPart] of samples) {
    assert.equal(tStatus(tc, 'zh-HK'), tc)
    assert.match(tStatus(tc, 'zh-CN'), scRe)
    const en = tStatus(tc, 'en')
    assert.ok(en.includes(enPart), `${tc} EN got ${JSON.stringify(en)}`)
  }
  assert.equal(traditionalToSimplified('陣列'), '阵列')
  assert.equal(traditionalToSimplified('複製'), '复制')
  assert.ok(i18n.includes('v1.95'))
})
