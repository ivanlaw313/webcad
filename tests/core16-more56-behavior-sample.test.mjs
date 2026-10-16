/**
 * BOT-D more56 / FISHING99+ — CORE16 true behavior / regression gaps on tip f052fc8b (F99).
 * Complements smoke-21 + more34–more55 samples without duplicating those topics.
 * more34–more53：見 more54/more55 soft-prep 累積表.
 * more54: MATERIALS+F88/F94 demold prefix, formquadball/formpipe/formface stubs · holepts · bom ·
 * exportasmstl · sectionprops · midcpoint · align · exportdxf · exportobj · insertfastener-bad-type ·
 * removefeatures-bad-maxD.
 * more55: MATERIALS+F88/F94 demold prefix, formbox/formcyl/formplane/formsphere/formtorus/formpatch
 * bad-input · lasergcode · finish3d · properties · stack · arrangebed · facemate · newcomp.
 * Focus here: delface/interference/dropall/jointorigin/formsymmetry/boundarypatch ·
 * filletall/chamferall no-solid · sketcharray empty · zebra/curvcomb · enablecontact · export3mf.
 * Always-hard: MATERIALS SC keep + F88 lazySafe／无法开模／無法開模 + F94 demold status
 * prefix pins (JA 離型到達性… / EN Demold Accessibility…；≠ more55 exact trio themes =
 * the 13 runtime gaps differ from more55 formbox/formcyl/…/newcomp sample).
 * Base: FISHING99 tip f052fc8b（product 7455f3a7 + more54 148dc32c；more55 e27f5561 → F100）.
 * Hand-off: FISHING101 cherry (more55 → F100; more54 on F99; do NOT target F98/F99/F100).
 * Formal chrome scan: NO.
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
const w = globalThis.__wheelWorker
await w.ready()
globalThis.requestAnimationFrame ??= (cb) => setTimeout(cb, 0)

const { loadFont } = await import('replicad')
const fontBuf = readFileSync(new URL('../src/fonts/Roboto-Regular.ttf', import.meta.url))
await loadFont(
  fontBuf.buffer.slice(fontBuf.byteOffset, fontBuf.byteOffset + fontBuf.byteLength),
  'cad',
  true,
)

const { useApp, MATERIALS } = await import('../src/store.ts')
const { tStatus } = await import('../src/i18n.ts')
const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () =>
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/

// ── always-hard: MATERIALS + F88 / F94 demold status prefix ──

test('always-hard: MATERIALS / DENSITY_PREF stay SC (storage ids)', () => {
  const st = rd('src/store.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
  assert.ok(MATERIALS['钢'], 'SC key 钢 must exist on MATERIALS')
})

test('always-hard: FISHING88 lazySafe panel chunks + draft Formal 无法开模／無法開模', () => {
  const app = rd('src/App.tsx')
  const i18n = rd('src/i18n.ts')
  const vp = rd('src/components/Viewport.tsx')
  assert.match(app, /function lazySafe\(/)
  assert.match(app, /typeof C === 'function'/)
  assert.match(app, /LazyChunkFallback/)
  assert.match(app, /const HelpPanelLazy = lazySafe\(/)
  assert.match(app, /const PhysicsLab = lazySafe\(/)
  assert.match(app, /const AeroLab = lazySafe\(/)
  assert.doesNotMatch(app, /const HelpPanelLazy = lazy\(\(\) => import/)
  assert.match(i18n, /'倒扣（无法开模）'/)
  assert.match(i18n, /'倒扣（無法開模）'/)
  assert.doesNotMatch(i18n, /无法开启模/)
  assert.doesNotMatch(i18n, /倒扣 undercut/)
  assert.match(vp, /倒扣（無法開模）/)
})

test('always-hard: FISHING94 demold status prefix pins JA 離型到達性… / EN Demold Accessibility… (≠ more55 formbox\/formcyl\/newcomp themes)', async () => {
  const i18n = rd('src/i18n.ts')
  assert.match(i18n, /FISHING94: status result sentences still start with TC/)
  assert.match(i18n, /s\.includes\('脫模可達性'\) \|\| s\.includes\('脱模可达性'\)/)
  assert.match(i18n, /s\.split\('脫模可達性'\)\.join\(name\)\.split\('脱模可达性'\)\.join\(name\)/)
  const once = i18n.slice(i18n.indexOf('function tStatusOnce'))
  const prefixAt = once.indexOf("s.includes('脫模可達性')")
  const exactAt = once.indexOf('const exact = _STATUS_EXACT[s]')
  assert.ok(prefixAt >= 0 && exactAt > prefixAt, 'F94 prefix replace before EN exact')
  assert.equal(tStatus('脫模可達性：需要活動實體', 'ja'), '離型到達性：需要活動實體')
  assert.equal(tStatus('脫模可達性：需要活動實體', 'en'), 'Demold Accessibility：需要活動實體')
  assert.equal(tStatus('脱模可达性：需要活動實體', 'ja'), '離型到達性：需要活動實體')
  assert.equal(tStatus('脫模可達性：脫模方向不可是零向量', 'ja'), '離型到達性：脫模方向不可是零向量')
  assert.match(tStatus('🔓 脫模可達性', 'ja'), /離型到達性/)
  assert.match(tStatus('🔓 脫模可達性', 'en'), /Demold Accessibility/)
  assert.equal(tStatus('脫模可達性：需要活動實體', 'zh-HK'), '脫模可達性：需要活動實體')
})

// ── delface no-solid (≠ more44 delface-nopick / more50 removefaces / more52 delete) ──

test('runtime: delface without solid Formal 刪面：要先有實體（或匯入 STEP B-rep 件）', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().features.length, 0)
  assert.equal(g().delFaceMode, false)
  await g().runCommand('delface', '刪面')
  assert.match(g().status, /刪面：要先有實體（或匯入 STEP B-rep 件）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /刪除面：先要有實體|先選中一個特徵|刪除特徵：/)
  assert.equal(g().delFaceMode, false)
  assert.deepEqual(g().features, before)
})

// ── interference panel Formal start (≠ more53 rigidgroup / more51 newcontactset) ──

test('runtime: interference Formal 干涉檢查：設定子集／含共面選項後按「計算」', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().interfPanelOpen, false)
  await g().runCommand('interference', '干涉檢查')
  assert.match(g().status, /干涉檢查：設定子集／含共面選項後按「計算」/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /干涉檢查需要 ≥2|跨運動干涉：|接觸集已/)
  assert.equal(g().interfPanelOpen, true)
  assert.deepEqual(g().features, before)
})

// ── dropall no visible comps (≠ more55 stack/arrangebed / more51 arrange) ──

test('runtime: dropall without comps Formal 無可見實體組件', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().components.length, 0)
  await g().runCommand('dropall', '全部落地')
  assert.match(g().status, /無可見實體組件/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /垂直堆疊需要 ≥2|排版需要 ≥2|已把 .* 件落到地面/)
  assert.deepEqual(g().features, before)
})

// ── jointorigin pick start (≠ more54 align / more55 facemate / more50 joint) ──

test('runtime: jointorigin Formal 關節原點：點一個 snap 點', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().jointOriginPickMode, false)
  await g().runCommand('jointorigin', '關節原點')
  assert.match(g().status, /關節原點：點一個 snap 點（實體面心 \/ 圓柱孔心 \/ 頂點）→ 落一個可複用命名幀/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /對齊：點【基準面】|面貼合：先點【基準件】|關節：請先/)
  assert.equal(g().jointOriginPickMode, true)
  assert.deepEqual(g().features, before)
})

// ── formsymmetry cycle Formal (≠ more51 formloop / more54 formquadball / more55 formbox) ──

test('runtime: formsymmetry Formal Form 對稱編輯：X 軸鏡像', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().formSym, null)
  await g().runCommand('formsymmetry', 'Form 對稱')
  assert.match(g().status, /Form 對稱編輯：X 軸鏡像（拖一邊自動鏡對面）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /FORM T-spline|Form 盒：|四邊形球體：|鏡像：請先建立/)
  assert.equal(g().formSym, 0)
  assert.deepEqual(g().features, before)
})

// ── boundarypatch pick start (≠ more49 surfsew / more51 formrepair / more46 boundaryfill) ──

test('runtime: boundarypatch Formal 邊界補面：逐條點選要封口\/補洞的現有稜', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().boundaryPatchPick, false)
  await g().runCommand('boundarypatch', '邊界補面')
  assert.match(g().status, /邊界補面：逐條點選要封口\/補洞的現有稜（可多條，≥2）→ 可勾 G1 相切 \/ 設加厚 → 按「確定」/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /Boundary Fill：|縫合：|Bridge（FORM）|已退出邊界補面/)
  assert.equal(g().boundaryPatchPick, true)
  assert.deepEqual(g().features, before)
})

// ── filletall no-solid (≠ more37 fillet gate / more49 facefillet / more43 fillet chip) ──

test('runtime: filletall without solid Formal 圓角：先要有零件實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().features.length, 0)
  useApp.setState({ appPrompt: async () => '2' })
  await g().runCommand('filletall', '全稜倒圓角')
  // appPrompt.then → filletAllEdges → partSolidRequiredPatch
  await new Promise((r) => setTimeout(r, 30))
  assert.match(g().status, /圓角：先要有零件實體（拉伸 \/ 旋轉 \/ 匯入 B-rep）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /倒角：先要有零件實體|面圓角：|全稜倒圓角 R/)
  assert.equal(g().features.some((f) => f.type === 'fillet'), false)
  assert.deepEqual(g().features, before)
})

// ── chamferall no-solid (≠ filletall above / more40 chamfer) ──

test('runtime: chamferall without solid Formal 倒角：先要有零件實體', async () => {
  reset()
  const before = structuredClone(g().features)
  useApp.setState({ appPrompt: async () => '1' })
  await g().runCommand('chamferall', '全稜倒角')
  await new Promise((r) => setTimeout(r, 30))
  assert.match(g().status, /倒角：先要有零件實體（拉伸 \/ 旋轉 \/ 匯入 B-rep）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /圓角：先要有零件實體|全稜倒角 .*mm|請先建立一個實體/)
  assert.equal(g().features.some((f) => f.type === 'chamfer'), false)
  assert.deepEqual(g().features, before)
})

// ── sketcharray empty in sketch (≠ more38 2×2 body pattern / more45 rect FacePattern) ──

test('runtime: sketcharray without profiles Formal 先畫至少一個輪廓再陣列', async () => {
  reset()
  const before = structuredClone(g().features)
  useApp.setState({ mode: 'sketch', sketchProfiles: [], sketchShape: null })
  assert.equal(g().mode, 'sketch')
  assert.equal(g().sketchProfiles.length, 0)
  await g().runCommand('sketcharray', '草圖陣列')
  assert.match(g().status, /先畫至少一個輪廓再陣列/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /矩形陣列：|環形陣列：|陣列：先畫至少一個輪廓$/)
  assert.deepEqual(g().features, before)
})

// ── zebra inspect Formal (≠ more48 draftanalysis / more49 slopeanalysis) ──

test('runtime: zebra Formal 斑馬紋分析：轉動視角，條紋錯斷\/突疏密', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().inspectShade, 'off')
  await g().runCommand('zebra', '斑馬紋')
  assert.match(g().status, /斑馬紋分析：轉動視角，條紋錯斷\/突疏密 = 切向\(G1\)不連續/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /曲率梳|拔模分析|斜度分析|已關曲面分析/)
  assert.equal(g().inspectShade, 'zebra')
  assert.deepEqual(g().features, before)
})

// ── curvcomb inspect Formal (≠ zebra above / more48 minradius) ──

test('runtime: curvcomb Formal 曲率梳 Curvature Comb', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().inspectShade, 'off')
  await g().runCommand('curvcomb', '曲率梳')
  assert.match(g().status, /曲率梳 Curvature Comb：黃=最大主曲率方向 · 青=最小/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /斑馬紋分析：|曲率趨勢|最小曲率半徑/)
  assert.equal(g().inspectShade, 'comb')
  assert.deepEqual(g().features, before)
})

// ── enablecontact toggle Formal (≠ more51 newcontactset / more50 asbuiltjoint) ──

test('runtime: enablecontact Formal 接觸集已開：拖關節滑桿撞到第三方組件會自動擋停', async () => {
  reset()
  const before = structuredClone(g().features)
  const was = g().contactSets
  await g().runCommand('enablecontact', '接觸集')
  if (!was) {
    assert.match(g().status, /接觸集已開：拖關節滑桿撞到第三方組件會自動擋停/)
    assert.equal(g().contactSets, true)
  } else {
    assert.match(g().status, /接觸集已關：關節自由穿過組件/)
    assert.equal(g().contactSets, false)
  }
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /新建接觸集：|按現狀關節：|剛性組：/)
  assert.deepEqual(g().features, before)
})

// ── export3mf no body (≠ more54 exportobj / exportasmstl / more55 lasergcode) ──

test('runtime: export3mf without body Formal 沒有可匯出的實體，請先建模', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(!!g().bodyMesh?.vertices?.length, false)
  assert.equal(g().components.length, 0)
  await g().runCommand('export3mf', '匯出 3MF')
  assert.match(g().status, /沒有可匯出的實體，請先建模/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /此設計是裝配（多組件）|沒有可匯出的幾何|已匯出 3MF/)
  assert.deepEqual(g().features, before)
})
