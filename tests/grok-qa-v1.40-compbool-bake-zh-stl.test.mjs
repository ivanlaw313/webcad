/**
 * v1.40: Component Boolean / Bake Chinese UX + MESH STL chooser harden.
 * - EN tStatus must not turn 已切除「… into Done: / Bake into part solid
 * - File→导入 STL and insertmesh share openStlDialog; cancel clears busy/status
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tStatus } from '../src/i18n.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const i18nSrc = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')



test('APP_VERSION is 1.40+', () => {
  assert.match(version, /APP_VERSION = '2.20'/)
})

test('i18n X keeps bake chip + 已切除/合并/相交 Chinese under EN (no Done:/Bake into)', () => {
  assert.match(i18nSrc, /v1\.40:.*bake chip|v1\.40: component-boolean success toast/)
  assert.match(i18nSrc, /'烘焙為零件實體': '烘焙為零件實體'/)
  assert.match(i18nSrc, /'(?:烘焙为零件实体|烘焙為零件實體)': '(?:烘焙为零件实体|烘焙為零件實體)'/ )  // legacy SC
  assert.match(i18nSrc, /'已切除「': '已切除「'/)
  assert.match(i18nSrc, /'(?:已合并|已合併)「': '(?:已合并|已合併)「'/)
  assert.match(i18nSrc, /'已相交「': '已相交「'/)
  assert.match(i18nSrc, /'已烘焙入零件時間軸，可圓角\/抽殼': '已烘焙入零件時間軸，可圓角\/抽殼'/)
  assert.match(i18nSrc, /'(?:已烘焙入零件时间轴|已烘焙入零件時間軸)，(?:可圆角|可圓角)\/(?:抽壳|抽殼)': '(?:已烘焙入零件时间轴|已烘焙入零件時間軸)，(?:可圆角|可圓角)\/(?:抽壳|抽殼)'/ )
})

test('tStatus EN: component boolean cut/union/intersect toast stays Chinese (no Done:)', () => {
  const rawCut = '已切除「Plate / Body1」−「Pin / Body1」→ 体积 12.3 cm³（只消耗工具 Body）；来源位置与关节保留（可撤销 Ctrl+Z） · 组件布尔＝网格结果（非零件时间轴）— 点右侧按钮烘焙入零件后即可圆角/抽壳；零件内多体用「实体布尔」（B-rep），勿与组件布尔（网格）混淆'
  const rawUnion = '已合并「A / Body1」＋「B / Body1」→ 体积 20.0 cm³（只消耗工具 Body）；来源位置与关节保留（可撤销 Ctrl+Z）'
  const rawInt = '已相交「A / Body1」∩「B / Body1」→ 体积 1.0 cm³（只消耗工具 Body）；来源位置与关节保留（可撤销 Ctrl+Z）'
  for (const raw of [rawCut, rawUnion, rawInt]) {
    const en = tStatus(raw, 'en')
    assert.match(en, /^已/)
    assert.doesNotMatch(en, /Done:/)
    assert.doesNotMatch(en, /Bake into part solid/)
  }
  assert.equal(tStatus('烘焙為零件實體', 'en'), '烘焙為零件實體')
  assert.doesNotMatch(tStatus('烘焙為零件實體', 'en'), /Bake into/)
  assert.equal(tStatus('已烘焙入零件時間軸，可圓角/抽殼', 'en'), '已烘焙入零件時間軸，可圓角/抽殼')
})

test('componentBoolean success still sets bake statusAction with Chinese label', () => {
  const start = store.indexOf('componentBoolean: async')
  const end = store.indexOf('planeCutComponent: async')
  assert.ok(start >= 0 && end > start)
  const block = store.slice(start, end)
  assert.match(block, /statusAction:\s*\{\s*id:\s*'bakeMeshToPart',\s*label:\s*'烘焙為零件實體'/)
  assert.match(block, /已\$\{opLbl\}「/)
})

test('openStlDialog: FSA + input fallback; cancel clears busy/status (BUG-BD-3901)', () => {
  const start = store.indexOf('openStlDialog: () => {')
  const end = store.indexOf('openDxfDialog: () => {')
  assert.ok(start >= 0 && end > start)
  const block = store.slice(start, end)
  assert.match(block, /BUG-BD-3901|BUG-BD-1804/)
  assert.match(block, /showOpenFilePicker/)
  assert.match(block, /AbortError/)
  assert.match(block, /addEventListener\('cancel'/)
  assert.match(block, /busy:\s*false/)
  assert.match(block, /(?:已取消选择|已取消選擇) STL/)
  assert.match(block, /openMeshInsert\('stl'/)
})

test('File menu Import STL and insertmesh both use openStlDialog', () => {
  assert.match(ribbon, /openStlDialog/)
  assert.match(ribbon, /BUG-BD-2001/)
  assert.ok(/openStlDialog|file\.importStl|(?:导入|導入|匯入) ?STL/.test(ribbon), 'File Import STL wired')
  const start = store.indexOf("case 'insertmesh'")
  assert.ok(start >= 0)
  assert.match(store.slice(start, start + 160), /openStlDialog\(\)/)
})

test('v1.37/v1.38/v1.39 Chinese toast guards still present (no regress)', () => {
  assert.match(i18nSrc, /v1\.37/)
  assert.match(i18nSrc, /'已抽殼 壁厚': '已抽殼 壁厚'/)
  assert.match(i18nSrc, /'(?:已抽壳|已抽殼) 壁厚': '(?:已抽壳|已抽殼) 壁厚'/ )
  assert.match(i18nSrc, /v1\.38/)
  assert.ok(/已拉伸出(?:实体|實體)|status\.extrudeDone/.test(i18nSrc), 'extrudeDone phrase or comment')
  assert.match(i18nSrc, /v1\.39/)
  assert.match(i18nSrc, /'已重算': '已重算'/)
})
