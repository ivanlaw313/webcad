// RETEST18 #3：zh-HK 殘留簡體 — 材料清單顯示轉繁（key 不變）；螺紋對話框標題唔再顯示原始 key「othread」。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tStatus, tMaterialName } from '../src/i18n.ts'
import { simplifiedToTraditionalHK } from '../src/i18n/sc2tcHK.ts'
import { MATERIAL_MECH } from '../src/analysis/beamStress.ts'

const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const SC = /[钢铝铜锈钛脂龙胶树塑铁锌镁银镍铅锡纤维玻钴钨]/

test('FEA material list (MATERIAL_MECH keys) renders Traditional in zh-HK; keys stay Simplified', () => {
  const keys = Object.keys(MATERIAL_MECH)
  assert.ok(keys.includes('钢') && keys.includes('不锈钢'), 'storage keys unchanged')
  for (const k of keys) {
    const hk = tMaterialName(k, 'zh-HK')
    assert.doesNotMatch(hk, SC, `${k} → ${hk}`)
    assert.equal(simplifiedToTraditionalHK(hk), hk)
  }
  assert.equal(tMaterialName('不锈钢', 'zh-HK'), '不鏽鋼')
  assert.match(vp, /<option key=\{m\} value=\{m\}>\{tMaterialName\(m, lang\)\}（\{tStatus\('屈服', lang\)\}/)
  for (const raw of ['{feaMat} · ', '（{feaResult.matName} ', '· {modalResult.matName} ·', '（{thermalResult.matName} k=']) assert.ok(!vp.includes(raw), `raw material key render: ${raw}`)
  const pl = readFileSync(new URL('../src/components/PhysicsLab.tsx', import.meta.url), 'utf8')
  assert.ok(pl.includes('<dd>{tMaterialName(linkedPeakLoadFea.material'))
})

test('every featDlg kind has a dialog title — no raw key like 「othread」; thread = 螺紋 (EN Thread)', () => {
  const line = vp.slice(vp.indexOf('const FD_TITLE'), vp.indexOf('const FD_ICON'))
  const titled = new Set([...line.matchAll(/(?:^|[{,\s])'?([a-zA-Z-]+)'?: '/g)].map((m) => m[1]))
  const union = store.slice(store.indexOf('  featDlg: { kind: '), store.indexOf('; params:', store.indexOf('  featDlg: { kind: ')))
  const kinds = [...union.matchAll(/'([a-zA-Z-]+)'/g)].map((m) => m[1]).filter((k) => k !== 'geoPattern')   // geoPattern titled inline
  const missing = kinds.filter((k) => !titled.has(k))
  assert.deepEqual(missing, [], 'kinds without FD_TITLE: ' + missing.join(','))
  assert.match(line, /othread: '螺紋'/)
  assert.equal(tStatus('螺紋', 'zh-HK'), '螺紋')
  assert.equal(tStatus('螺紋', 'zh-CN'), '螺纹')
  assert.equal(tStatus('螺紋', 'en'), 'Thread')
  assert.equal(tStatus('內螺紋', 'en'), 'Internal Thread')
})
