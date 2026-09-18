/**
 * v1.40: Component Boolean / Bake Chinese UX + MESH STL chooser harden.
 * - EN tStatus must not turn 已切除「… into Done: / Bake into part solid
 * - File→导入 STL and insertmesh share openStlDialog; cancel clears busy/status
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const i18nSrc = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')

function mergePhrases(src) {
  const a = src.indexOf('const STATUS_PHRASES')
  const b = src.indexOf('const STATUS_PHRASES_X')
  const c = src.indexOf('const _STATUS_SORTED')
  assert.ok(a >= 0 && b > a && c > b, 'STATUS_PHRASES / X / _STATUS_SORTED markers')
  const parse = (block) => {
    const d = {}
    for (const m of block.matchAll(/'((?:\\'|[^'])*)':\s*'((?:\\'|[^'])*)'/g)) d[m[1]] = m[2]
    return d
  }
  return { ...parse(src.slice(a, b)), ...parse(src.slice(b, c)) }
}

function tStatus(s, phrases) {
  const pairs = Object.entries(phrases).sort((x, y) => y[0].length - x[0].length)
  let out = '', i = 0
  while (i < s.length) {
    let hit = null
    for (const [k, v] of pairs) if (s.startsWith(k, i)) { hit = [k, v]; break }
    if (hit) { out += hit[1]; i += hit[0].length } else { out += s[i]; i += 1 }
  }
  return out
}

test('APP_VERSION is 1.40+', () => {
  assert.match(version, /APP_VERSION = '1\.40'|APP_VERSION = '1\.[5-9]\d'|APP_VERSION = '[2-9]\./)
})

test('i18n X keeps bake chip + 已切除/合并/相交 Chinese under EN (no Done:/Bake into)', () => {
  assert.match(i18nSrc, /v1\.40:.*bake chip|v1\.40: component-boolean success toast/)
  assert.match(i18nSrc, /'烘焙为零件实体': '烘焙为零件实体'/)
  assert.match(i18nSrc, /'已切除「': '已切除「'/)
  assert.match(i18nSrc, /'已合并「': '已合并「'/)
  assert.match(i18nSrc, /'已相交「': '已相交「'/)
  assert.match(i18nSrc, /'已烘焙入零件时间轴，可圆角\/抽壳': '已烘焙入零件时间轴，可圆角\/抽壳'/)
})

test('tStatus EN: component boolean cut/union/intersect toast stays Chinese (no Done:)', () => {
  const phrases = mergePhrases(i18nSrc)
  const rawCut = '已切除「Plate / Body1」−「Pin / Body1」→ 体积 12.3 cm³（只消耗工具 Body）；来源位置与关节保留（可撤销 Ctrl+Z） · 组件布尔＝网格结果（非零件时间轴）— 点右侧按钮烘焙入零件后即可圆角/抽壳；零件内多体用「实体布尔」（B-rep），勿与组件布尔（网格）混淆'
  const rawUnion = '已合并「A / Body1」＋「B / Body1」→ 体积 20.0 cm³（只消耗工具 Body）；来源位置与关节保留（可撤销 Ctrl+Z）'
  const rawInt = '已相交「A / Body1」∩「B / Body1」→ 体积 1.0 cm³（只消耗工具 Body）；来源位置与关节保留（可撤销 Ctrl+Z）'
  for (const raw of [rawCut, rawUnion, rawInt]) {
    const en = tStatus(raw, phrases)
    assert.match(en, /^已/)
    assert.doesNotMatch(en, /Done:/)
    assert.doesNotMatch(en, /Bake into part solid/)
  }
  assert.equal(tStatus('烘焙为零件实体', phrases), '烘焙为零件实体')
  assert.doesNotMatch(tStatus('烘焙为零件实体', phrases), /Bake into/)
  assert.equal(tStatus('已烘焙入零件时间轴，可圆角/抽壳', phrases), '已烘焙入零件时间轴，可圆角/抽壳')
})

test('componentBoolean success still sets bake statusAction with Chinese label', () => {
  const start = store.indexOf('componentBoolean: async')
  const end = store.indexOf('planeCutComponent: async')
  assert.ok(start >= 0 && end > start)
  const block = store.slice(start, end)
  assert.match(block, /statusAction:\s*\{\s*id:\s*'bakeMeshToPart',\s*label:\s*'烘焙为零件实体'/)
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
  assert.match(block, /已取消选择 STL/)
  assert.match(block, /openMeshInsert\('stl'/)
})

test('File menu Import STL and insertmesh both use openStlDialog', () => {
  assert.match(ribbon, /openStlDialog/)
  assert.match(ribbon, /BUG-BD-2001/)
  assert.match(ribbon, /导入 STL/)
  const start = store.indexOf("case 'insertmesh'")
  assert.ok(start >= 0)
  assert.match(store.slice(start, start + 160), /openStlDialog\(\)/)
})

test('v1.37/v1.38/v1.39 Chinese toast guards still present (no regress)', () => {
  assert.match(i18nSrc, /v1\.37/)
  assert.match(i18nSrc, /'已抽壳 壁厚': '已抽壳 壁厚'/)
  assert.match(i18nSrc, /v1\.38/)
  assert.match(i18nSrc, /'已拉伸出实体 — 真实 OCCT B-rep': '已拉伸出实体 — 真实 OCCT B-rep'/)
  assert.match(i18nSrc, /v1\.39/)
  assert.match(i18nSrc, /'已重算': '已重算'/)
})
