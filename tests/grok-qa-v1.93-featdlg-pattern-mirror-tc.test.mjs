/**
 * v1.93: featDlg pattern/mirror/path SC→TC + BD-9101 leftovers (草圖／豎直 tip／拖動／歷史)
 * + Ribbon doc rename tip TC.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { catalogKeyCount, LOCALES, tStatus } from '../src/i18n.ts'
import { traditionalToSimplified } from '../src/i18n/tc2sc.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const ribbonSrc = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const tl = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

test('APP_VERSION 1.97; SW webcad-v1.97', () => {
  assert.match(version, /APP_VERSION = '1\.97'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.97/)
})

test('catalog parity', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.equal(new Set(counts).size, 1, `unequal: ${counts}`)
})

function featBlock(kind) {
  const i0 = vp.indexOf(`{featDlg.kind === '${kind}' &&`)
  assert.ok(i0 > 0, `missing block ${kind}`)
  const i1 = vp.indexOf('\n          {featDlg.kind === \'', i0 + 1)
  assert.ok(i1 > i0, `no end for ${kind}`)
  return vp.slice(i0, i1)
}

test('BD-9301 featDlg pattern/cpattern/circpattern/mirror/pathpattern TC', () => {
  const scNeedles = [
    '对象', '选择', '特征', '阵列', '间距', '数量', '确定', '实例', '编辑',
    '计算', '优化', '调整', '镜像', '活动实体', '整个实体', '组件',
    '总长', '层数', '自定义', '拾轴', '创建', '参数', '连泊车',
  ]
  for (const kind of ['pattern', 'cpattern', 'circpattern', 'mirror', 'pathpattern']) {
    const block = featBlock(kind)
    const lits = [...block.matchAll(/tStatus\((['"`])([\s\S]*?)\1/g)].map((m) => m[2]).join('\n')
    for (const sc of scNeedles) {
      assert.equal(lits.includes(sc), false, `${kind} SC leftover: ${sc}`)
    }
    // SC 路径/独立 as whole-token leftovers (avoid matching 路徑/獨立)
    assert.equal(lits.includes('路径'), false, `${kind} SC 路径`)
    assert.equal(/独立(?!實體)/.test(lits) && lits.includes('独立'), false, `${kind} SC 独立`)
  }
  assert.match(vp, /tStatus\('對象'/)
  assert.match(vp, /tStatus\('間距'/)
  assert.match(vp, /tStatus\('X數量'/)
  assert.match(vp, /tStatus\('整個實體'/)
  assert.match(vp, /tStatus\('所選特徵'/)
  assert.match(vp, /tStatus\('抑制實例'/)
  assert.match(vp, /tStatus\('鏡像出獨立實體'/)
  assert.match(vp, /tStatus\('連泊車體一齊陣列'/)
  assert.match(vp, /featDlg\.editId \? '編輯 · '/)
  assert.match(vp, /tStatus\('編輯模式：改參數 → 確定重建；稜\/面選擇集及輪廓保留原值'/)
  // Scoped: SC forms must not appear as tStatus keys inside the five blocks
  const region = ['pattern', 'cpattern', 'circpattern', 'mirror', 'pathpattern'].map(featBlock).join('\n')
  assert.equal(region.includes("tStatus('对象'"), false)
  assert.equal(region.includes("tStatus('间距'"), false)
  assert.equal(region.includes("editId ? '编辑 · '"), false)
})

test('BD-9101 leftovers: 草圖 / 豎直 tip / 拖動 / 歷史', () => {
  assert.match(vp, /tStatus\('草圖', lang\)/)
  assert.equal(vp.includes("tStatus('草图'"), false)
  assert.match(ribbonSrc, /tip: '豎直：選 1 條邊（或 2 個點）→ 變豎直。'/)
  assert.equal(/tip: '竖直/.test(ribbonSrc), false)
  assert.match(tl, /tStatus\('歷史標記 — 左右拖動回放／前進重建歷史'/)
  assert.equal(tl.includes('历史标记'), false)
  assert.equal(tl.includes('拖动'), false)
})

test('BD-9302 Ribbon doc rename tip TC', () => {
  assert.match(ribbon, /title="文件名（用於保存檔名／工程圖標題欄）— 點擊改名"/)
  assert.equal(ribbon.includes('文档名（用于保存档名'), false)
  assert.equal(ribbon.includes('工程图标题栏'), false)
})

test('BD-9301 tStatus zh-HK / zh-CN / en samples', () => {
  const samples = [
    ['對象', /对象/, 'Objects'],
    ['間距', /间距/, 'Spacing'],
    ['X數量', /X数量/, 'X Count'],
    ['整個實體', /整个实体/, 'Entire Body'],
    ['所選特徵', /所选特征/, 'Selected Features'],
    ['抑制實例', /抑制实例/, 'Suppress Instances'],
    ['鏡像出獨立實體', /镜像出独立实体/, 'Mirror as New Body'],
    ['連泊車體一齊陣列', /连泊车体一齐阵列/, 'Pattern parked'],
    ['草圖', /草图/, 'Sketch'],
    ['歷史標記 — 左右拖動回放／前進重建歷史', /历史标记/, 'History marker'],
  ]
  for (const [tc, scRe, enPart] of samples) {
    assert.equal(tStatus(tc, 'zh-HK'), tc)
    assert.match(tStatus(tc, 'zh-CN'), scRe)
    const en = tStatus(tc, 'en')
    assert.ok(en.includes(enPart), `${tc} EN got ${JSON.stringify(en)}`)
  }
  assert.equal(traditionalToSimplified('草圖'), '草图')
  assert.equal(traditionalToSimplified('豎直'), '竖直')
  assert.equal(traditionalToSimplified('檔名'), '档名')
  assert.ok(i18n.includes('v1.93'))
})
