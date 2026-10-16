/**
 * BOT-D more57 / FISHING100+ — CORE16 true behavior / regression gaps on tip 94332e3c (F100).
 * Complements smoke-21 + more34–more56 samples without duplicating those topics.
 * more34–more54：見 more55/more56 soft-prep 累積表.
 * more55: MATERIALS+F88/F94 demold prefix, formbox/formcyl/formplane/formsphere/formtorus/formpatch
 * bad-input · lasergcode · finish3d · properties · stack · arrangebed · facemate · newcomp.
 * more56: MATERIALS+F88/F94 demold prefix, delface/interference/dropall/jointorigin/formsymmetry/
 * boundarypatch · filletall/chamferall no-solid · sketcharray empty · zebra/curvcomb ·
 * enablecontact · export3mf.
 * Focus here: fillet/chamfer/shell no-solid entry · othread · convert · pipe/rib/pathpattern gates ·
 * curvmap/gausscurv · emboss start · fourbar · exportglb.
 * Always-hard: MATERIALS SC keep + F88 lazySafe／无法开模／無法開模 + F94 demold status
 * prefix pins (JA 離型到達性… / EN Demold Accessibility…；≠ more56 exact trio themes =
 * the 13 runtime gaps differ from more56 delface/interference/…/export3mf sample).
 * Base: FISHING100 tip 94332e3c（product JointsPanel + more55 274d057b；more56 1dab2d37 → F101）.
 * Hand-off: FISHING102 cherry (more56 → F101; more55 on F100; do NOT target F100/F101).
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

test('always-hard: FISHING94 demold status prefix pins JA 離型到達性… / EN Demold Accessibility… (≠ more56 delface\/interference\/export3mf themes)', async () => {
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

// ── fillet no-solid entry (≠ more56 filletall / more37 fillet R gate / more49 facefillet) ──

test('runtime: fillet without solid Formal 圓角：先要有零件實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().features.length, 0)
  assert.equal(g().edgeRoundPick, null)
  await g().runCommand('fillet', '圓角')
  assert.match(g().status, /圓角：先要有零件實體（拉伸 \/ 旋轉 \/ 匯入 B-rep）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /全稜倒圓角|倒角：先要有零件實體|面圓角：/)
  assert.equal(g().edgeRoundPick, null)
  assert.deepEqual(g().features, before)
})

// ── chamfer no-solid entry (≠ more56 chamferall / more40 chamfer) ──

test('runtime: chamfer without solid Formal 倒角：先要有零件實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().edgeRoundPick, null)
  await g().runCommand('chamfer', '倒角')
  assert.match(g().status, /倒角：先要有零件實體（拉伸 \/ 旋轉 \/ 匯入 B-rep）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /全稜倒角|圓角：先要有零件實體|面圓角：/)
  assert.equal(g().edgeRoundPick, null)
  assert.deepEqual(g().features, before)
})

// ── shell no-solid (≠ more41 shell-empty-pick / more40 shell-thickness-0 / more56 filletall) ──

test('runtime: shell without solid Formal 抽殼：先要有零件實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().shellMode, false)
  await g().runCommand('shell', '抽殼')
  assert.match(g().status, /抽殼：先要有零件實體（拉伸 \/ 旋轉 \/ 匯入 B-rep）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /壁厚必須大於 0|請先選開口面|抽殼厚度/)
  assert.equal(g().shellMode, false)
  assert.deepEqual(g().features, before)
})

// ── othread no-solid (≠ more54 insertfastener / more49 facefillet) ──

test('runtime: othread without solid Formal 面加外螺紋：先要有實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().featDlg, null)
  await g().runCommand('othread', '外螺紋')
  assert.match(g().status, /面加外螺紋：先要有實體（圓柱\/凸台）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /內螺紋|緊固件|插入緊固件|螺紋對話框/)
  assert.equal(g().featDlg, null)
  assert.deepEqual(g().features, before)
})

// ── convert MeshFit gate (≠ more52 mesh / more54 formface) ──

test('runtime: convert without mesh Formal MeshFit \/ 轉 B-rep：先插入 STL\/OBJ 網格', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().components.length, 0)
  await g().runCommand('convert', 'MeshFit / 轉 B-rep')
  assert.match(g().status, /MeshFit \/ 轉 B-rep：先插入 STL\/OBJ 網格（MESH → 插入，或 Alt\+O），再轉換。純草圖實體請直接建模。/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /沒有可匯出的實體|抽殼：先要有|已烘焙/)
  assert.deepEqual(g().features, before)
})

// ── pipe no path (≠ more54 formpipe / more40 pipe wall) ──

test('runtime: pipe without path Formal 管道需要一條路徑', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().polyPts.length, 0)
  assert.equal(g().sketchShape, null)
  await g().runCommand('pipe', '管道')
  assert.match(g().status, /管道需要一條路徑：用「折線 \/ 樣條」畫一條路徑（≥2 點，可不閉合），再點「管道」/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /Form 管道|壁厚|掃掠：/)
  assert.equal(g().featDlg, null)
  assert.deepEqual(g().features, before)
})

// ── rib no centerline (≠ more53 newbody / more55 newcomp) ──

test('runtime: rib without centerline Formal 加強筋需要中心線', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().mode, 'model')
  await g().runCommand('rib', '加強筋')
  assert.match(g().status, /加強筋需要中心線：用「折線」畫一條或多條線（≥2 點，開放）後「完成草圖」，或在瀏覽器選取已儲存的中心線草圖 — 多條 = 筋網 Web 一次過生成/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /管道需要一條路徑|腹板 Web：設|路徑陣列需要/)
  assert.equal(g().featDlg, null)
  assert.deepEqual(g().features, before)
})

// ── pathpattern no solid (≠ more41 pathpattern count / more38 2×2 body pattern) ──

test('runtime: pathpattern without solid Formal 路徑陣列需要先有一個實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().features.length, 0)
  await g().runCommand('pathpattern', '路徑陣列')
  assert.match(g().status, /路徑陣列需要先有一個實體 —— 它會沿你畫的路徑複製該實體（先建實體，再畫路徑）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /路徑陣列需要一條路徑|矩形陣列：|環形陣列：|草圖陣列/)
  assert.equal(g().featDlg, null)
  assert.deepEqual(g().features, before)
})

// ── curvmap inspect (≠ more56 zebra/curvcomb / more48 draftanalysis) ──

test('runtime: curvmap Formal 曲率趨勢（平均曲率', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().inspectShade, 'off')
  await g().runCommand('curvmap', '曲率趨勢')
  assert.match(g().status, /曲率趨勢（平均曲率 \|H\|）：紅=高曲率，藍=平坦/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /斑馬紋分析：|曲率梳|高斯曲率/)
  assert.equal(g().inspectShade, 'curv')
  assert.deepEqual(g().features, before)
})

// ── gausscurv inspect (≠ curvmap above / more56 zebra) ──

test('runtime: gausscurv Formal 高斯曲率 K（發散色階）', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().inspectShade, 'off')
  await g().runCommand('gausscurv', '高斯曲率')
  assert.match(g().status, /高斯曲率 K（發散色階）：紅=凸\(碗\/球,K>0\) · 白=可展\(平\/柱,K≈0\) · 藍=鞍\(K<0\)/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /曲率趨勢（平均曲率|斑馬紋分析：|曲率梳/)
  assert.equal(g().inspectShade, 'gausscurv')
  assert.deepEqual(g().features, before)
})

// ── emboss pick start (≠ more35 emboss refuse / more38 AB preview / more39 size0) ──

test('runtime: emboss Formal ✏ 浮雕：點實體一個面', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().embossPick, false)
  await g().runCommand('emboss', '浮雕')
  assert.match(g().status, /✏ 浮雕：點實體一個面（平面或圓柱側面）→ 輸入文字 → 沿面法向凸起／刻入（標牌／編號）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /已取消浮雕|深度必須|字高必須|浮雕：輸入文字/)
  assert.equal(g().embossPick, true)
  assert.deepEqual(g().features, before)
})

// ── fourbar mechanism (≠ more51 motionstudy / more53 motionlink) ──

test('runtime: fourbar Formal 已建平面四連桿', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().fourBar, null)
  await g().runCommand('fourbar', '四連桿')
  assert.match(g().status, /已建平面四連桿（閉環機構）— 拖「曲柄角」滑桿驅動；桿長由約束求解器保持剛性。按「翻轉裝配」查看另一支解/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /滑塊曲柄|運動連結|運動研究|尚未接入幾何/)
  assert.ok(g().fourBar)
  assert.deepEqual(g().features, before)
})

// ── exportglb no geom (≠ more56 export3mf 沒有可匯出的實體 / more54 exportobj／exportasmstl) ──

test('runtime: exportglb without geom Formal 沒有可匯出的幾何', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(!!g().bodyMesh?.vertices?.length, false)
  assert.equal(g().components.length, 0)
  await g().runCommand('exportglb', '匯出 GLB')
  assert.match(g().status, /沒有可匯出的幾何/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /沒有可匯出的實體，請先建模|已匯出 .*\.glb|此設計是裝配/)
  assert.deepEqual(g().features, before)
})
