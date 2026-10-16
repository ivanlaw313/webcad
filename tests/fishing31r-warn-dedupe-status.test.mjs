/**
 * FISHING31-recheck
 *  P1：掃掠尖角自動 R3 圓角警告 —— 第一次 build 顯示；改其他特徵（加厚／盒）重建時，狀態提示「已更新參數並重建」
 *      唔可以再附上同一句；改返掃掠本身／警告內容變咗 → 再顯示。
 *  順手：倒角輸入閘（同加厚做法）、放樣／預覽警告單一 ⚠、圓角／倒角錯誤唔再夾英文。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp, dedupeBuildWarnings, buildWarningOwnerTypes, changedFeatureTypes, buildWarnForcedBy, chamferInputReason } = await import('../src/store.ts')
const { stripWarnMark, formatWarnList, formatBuildWarnings, plainFeatureError } = await import('../src/ui/featureStatus.ts')
const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const AUTO = /自動圓角（R/

const SWEEP = { id: 'sw', type: 'sweep', r: 5, op: 'new', path: [[0, 0], [60, 0], [60, 40]], profile: { kind: 'rect', a: [-5, -5], b: [5, 5] }, twist: 90 }
const BOX = { id: 'B', type: 'prim', shape: 'box', a: 20, b: 20, c: 10, op: 'new', cornerOrigin: true, at: [200, 200, 0] }

test('rebuild status: sweep R3 auto-fillet warning shown once; editing another feature does not repeat it', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  await g().reset()
  assert.equal(await g().applyFeatures([SWEEP], '已沿路徑掃掠'), true, g().status)
  assert.match(g().status, AUTO, 'first build: status carries the warning')
  assert.ok(g().lastBuildWarnings.some((w) => AUTO.test(w)), 'first build: pill shows it')

  assert.equal(await g().applyFeatures([...g().features, BOX], '已建立方塊'), true, g().status)
  assert.doesNotMatch(g().status, AUTO, `adding another feature: no repeat — ${g().status}`)
  assert.ok(!g().lastBuildWarnings.some((w) => AUTO.test(w)), 'pill not re-shown')

  const edited = g().features.map((f) => (f.id === 'B' ? { ...f, c: 14 } : f))
  assert.equal(await g().applyFeatures(edited, '已更新參數並重建'), true, g().status)
  assert.equal(g().status.startsWith('已更新參數並重建'), true, g().status)
  assert.doesNotMatch(g().status, /⚠/, `editing another feature: status has no ⚠ repeat — ${g().status}`)

  const sw2 = g().features.map((f) => (f.id === 'sw' ? { ...f, twist: 60 } : f))
  assert.equal(await g().applyFeatures(sw2, '已更新參數並重建'), true, g().status)
  assert.match(g().status, AUTO, 'editing the sweep itself re-shows the warning')
})

test('new document resets dedupe memory (first build of a new file shows its warning)', async () => {
  await g().reset()
  assert.equal(await g().applyFeatures([SWEEP], '已沿路徑掃掠'), true, g().status)
  await g().reset()
  assert.equal(await g().applyFeatures([SWEEP], '已沿路徑掃掠'), true, g().status)
  assert.match(g().status, AUTO)
})

test('per-warning dedupe helpers', () => {
  const sw = '扭轉／縮放掃掠：路徑 1 個尖角已自動圓角（R3.00）以保持可靠幾何'
  assert.deepEqual(buildWarningOwnerTypes(sw), ['sweep'], 'sweep warning owned by sweep, not fillet')
  assert.deepEqual(buildWarningOwnerTypes('圆角 5 太大，已自动缩小到 2.0 以贴合该棱'), ['fillet', 'facefillet'])
  assert.equal(buildWarningOwnerTypes('網格轉換：xxx'), null)
  const r1 = dedupeBuildWarnings('', [sw]); assert.deepEqual(r1.show, [sw])
  assert.deepEqual(dedupeBuildWarnings(r1.key, [sw]).show, [])
  const ch = changedFeatureTypes([SWEEP, BOX], [SWEEP, { ...BOX, c: 4 }])
  assert.deepEqual([...ch], ['prim'])
  assert.deepEqual(dedupeBuildWarnings(r1.key, [sw], buildWarnForcedBy(ch)).show, [], 'other feature changed → hidden')
  const ch2 = changedFeatureTypes([SWEEP], [{ ...SWEEP, twist: 45 }])
  assert.deepEqual(dedupeBuildWarnings(r1.key, [sw], buildWarnForcedBy(ch2)).show, [sw], 'sweep changed → re-shown')
  assert.deepEqual(dedupeBuildWarnings(r1.key, [sw + 'x']).show, [sw + 'x'], 'content changed → shown')
})

test('chamfer dialog input gate (aligned with thicken)', () => {
  const box = { vertices: [0, 0, 0, 40, 30, 10] }
  assert.match(chamferInputReason({ edgeRoundSize: 0, chamferMode: 'equal', bodyMesh: box }), /必須大於 0/)
  assert.equal(chamferInputReason({ edgeRoundSize: 2, chamferMode: 'equal', bodyMesh: box }), null)
  assert.match(chamferInputReason({ edgeRoundSize: 99999, chamferMode: 'equal', bodyMesh: box }), /^尺寸已拒絕：倒角距離 99999 mm/)
  assert.match(chamferInputReason({ edgeRoundSize: 2, chamferMode: 'two', chamferSize2: 0, bodyMesh: box }), /距離 2 必須大於 0/)
  assert.match(chamferInputReason({ edgeRoundSize: 2, chamferMode: 'two', chamferSize2: 500, bodyMesh: box }), /^尺寸已拒絕/)
  assert.match(chamferInputReason({ edgeRoundSize: 2, chamferMode: 'angle', chamferAngle: 90, bodyMesh: box }), /角度/)
  assert.equal(chamferInputReason({ edgeRoundSize: 2, chamferMode: 'angle', chamferAngle: 45, bodyMesh: null }), null)
  const vp = rd('src/components/Viewport.tsx')
  assert.match(vp, /okDisabled=\{!!numBad \|\| !!chamferBad \|\|/)
  assert.match(vp, /data-testid="chamfer-illegal-alert"/)
  assert.match(vp, /okLabel=\{`\$\{tStatus\('確定', lang\)\}（\$\{edgeRoundPicks\.length\}）`\}/)
  assert.match(rd('src/store.ts'), /if \(kind === 'chamfer'\) \{ const bad = chamferInputReason\(get\(\)\)/)
})

test('single ⚠ prefix: loft warnings / previews / pill', () => {
  assert.equal(stripWarnMark('⚠ ⚠ 放樣導軌：x'), '放樣導軌：x')
  assert.equal(formatWarnList(['⚠ 放樣導軌：x', '放樣導軌：x']), '⚠ 放樣導軌：x')
  assert.equal(formatBuildWarnings(['⚠ a']), '　⚠ a')
  const w = rd('src/worker/cad.worker.ts')
  const loft = w.slice(w.indexOf('function makeLoftSolid('), w.indexOf('function lastExtrudeHeight('))
  assert.doesNotMatch(loft, /warnings\.push\([`']⚠/, 'loft worker warnings carry no own ⚠')
  assert.doesNotMatch(w, /buildWarnings\.push\('⚠ (放样|规则)曲面/)
  assert.match(rd('src/components/LoftSectionList.tsx'), /stripWarnMark\(pv\.error\)/)
  assert.match(rd('src/store.ts'), /const warn = formatWarnList\(mesh!\.warnings\)/)
})

test('fillet/chamfer errors: no English kernel text', () => {
  assert.doesNotMatch(plainFeatureError('fillet', 'fillet near points failed'), /[A-Za-z]{3,}/)
  assert.doesNotMatch(plainFeatureError('chamfer', 'chamfer near point failed'), /[A-Za-z]{3,}/)
  assert.doesNotMatch(plainFeatureError('chamfer', '雙距離倒角失敗（內核未能建立不對稱斜面）— 請改用等距'), /[A-Za-z]{3,}/)
  assert.doesNotMatch(plainFeatureError('fillet', 'G2 fillet did not converge'), /fillet|converge/)
  const w = rd('src/worker/cad.worker.ts')
  assert.doesNotMatch(w, /內核未能建立不對稱斜面：\$\{/, 'chamfer kernel English message no longer embedded')
  assert.match(rd('src/components/Timeline.tsx'), /重建失敗：' \+ plainFeatureError\(f\.type, featureErrors\[f\.id\]\)/)
})
