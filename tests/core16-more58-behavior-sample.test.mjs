/**
 * BOT-D more58 / FISHING101+ — CORE16 true behavior / regression gaps on tip 56360ad7 (F101).
 * Complements smoke-21 + more34–more57 samples without duplicating those topics.
 * more34–more55：見 more56/more57 soft-prep 累積表.
 * more56: MATERIALS+F88/F94 demold prefix, delface/interference/dropall/jointorigin/formsymmetry/
 * boundarypatch · filletall/chamferall no-solid · sketcharray empty · zebra/curvcomb ·
 * enablecontact · export3mf.
 * more57: MATERIALS+F88/F94 demold prefix, fillet/chamfer/shell no-solid · othread · convert ·
 * pipe/rib/pathpattern gates · curvmap/gausscurv · emboss start · fourbar · exportglb.
 * Focus here: kmaxcurv/kmincurv · slidercrank/sixbar · exportstlascii · loft≥2 · presspull ·
 * ruled · measureangle/measureuni · xray · centerofmass · moldflow · topopt · sweep.
 * Always-hard: MATERIALS SC keep + F88 lazySafe／无法开模／無法開模 + F94 demold status
 * prefix pins (JA 離型到達性… / EN Demold Accessibility…；≠ more57 exact trio themes =
 * the 13 runtime gaps differ from more57 fillet/chamfer/…/exportglb sample).
 * Base: FISHING101 tip 56360ad7（product JointOriginPalette 674f096c + more56 c15290cd；
 * more57 soft 592342d7 → F102；F100 tip 94332e3c / tip-docs 143bbd52 已非 cherry target）.
 * Hand-off: FISHING103 cherry (more57 → F102; more56 on F101; do NOT target F100/F101/F102).
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

test('always-hard: FISHING94 demold status prefix pins JA 離型到達性… / EN Demold Accessibility… (≠ more57 fillet\/chamfer\/exportglb themes)', async () => {
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

// ── kmaxcurv inspect (≠ more57 curvmap/gausscurv / more56 zebra/curvcomb) ──

test('runtime: kmaxcurv Formal 最大主曲率 κmax', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().inspectShade, 'off')
  await g().runCommand('kmaxcurv', '最大主曲率')
  assert.match(g().status, /最大主曲率 κmax（\|H\|\+√\(H²−K\)）：紅=最彎方向曲率大，藍=平坦（趨勢\/近似）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /曲率趨勢（平均曲率|高斯曲率 K|曲率梳|最小主曲率|斑馬紋分析：/)
  assert.equal(g().inspectShade, 'kmax')
  assert.deepEqual(g().features, before)
})

// ── kmincurv inspect (≠ kmax above / more57 gausscurv) ──

test('runtime: kmincurv Formal 最小主曲率 κmin', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().inspectShade, 'off')
  await g().runCommand('kmincurv', '最小主曲率')
  assert.match(g().status, /最小主曲率 κmin（\|H\|−√\(H²−K\)）：紅=凸、藍=鞍\(負\) — 查看另一主方向彎曲（趨勢\/近似）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /最大主曲率 κmax|曲率趨勢（平均曲率|高斯曲率 K|斑馬紋分析：/)
  assert.equal(g().inspectShade, 'kmin')
  assert.deepEqual(g().features, before)
})

// ── slidercrank mechanism (≠ more57 fourbar / more51 motionstudy / more53 motionlink) ──

test('runtime: slidercrank Formal 已建滑塊曲柄機構', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().sliderCrank, null)
  await g().runCommand('slidercrank', '滑塊曲柄')
  assert.match(g().status, /已建滑塊曲柄機構（活塞）— 拖「曲柄角」滑桿驅動；曲柄轉→活塞往復（行程=2×曲柄半徑），連桿長由閉環求解保持/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /已建平面四連桿|已建六桿機構|運動連結|運動研究|尚未接入幾何/)
  assert.ok(g().sliderCrank)
  assert.deepEqual(g().features, before)
})

// ── sixbar mechanism (≠ slidercrank above / more57 fourbar) ──

test('runtime: sixbar Formal 已建六桿機構', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().sixBar, null)
  await g().runCommand('sixbar', '六桿')
  assert.match(g().status, /已建六桿機構（Stephenson-III 閉環）— 拖「曲柄角」驅動；輸出點 E 由通用連桿求解器 solveLinkage 聯立解算（非解析公式）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /已建平面四連桿|已建滑塊曲柄|運動連結|尚未接入幾何/)
  assert.ok(g().sixBar)
  assert.deepEqual(g().features, before)
})

// ── exportstlascii no body (≠ more57 exportglb 沒有可匯出的幾何 / more56 export3mf / more54 exportobj) ──

test('runtime: exportstlascii without body Formal 沒有可匯出的實體，請先建模', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(!!g().bodyMesh?.vertices?.length, false)
  assert.equal(g().components.length, 0)
  await g().runCommand('exportstlascii', '匯出 STL ASCII')
  assert.match(g().status, /沒有可匯出的實體，請先建模/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /沒有可匯出的幾何|已匯出 .*\.stl|此設計是裝配/)
  assert.deepEqual(g().features, before)
})

// ── loft ≥2 sections (≠ more38 loft-rail / more42 loft-guide / more50 extrude-no-sketch) ──

test('runtime: loft without ≥2 sections Formal 放樣需要≥2個截面', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().loftSections.length, 0)
  assert.equal(g().featDlg, null)
  await g().runCommand('loft', '放樣')
  assert.match(g().status, /放樣需要≥2個截面：在 XY\/XZ\/YZ 或任意參考面畫輪廓→完成草圖 → 再畫一個截面→點「放樣」/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /曲面放樣|掃掠需要|拉伸需要先畫|路徑陣列需要/)
  assert.equal(g().featDlg, null)
  assert.deepEqual(g().features, before)
})

// ── moldflow no solid (≠ more45 automatedmodel / more51 presspull-empty) ──

test('runtime: moldflow without solid Formal 模流分析：需要先有活動實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().features.length, 0)
  await g().runCommand('moldflow', '模流')
  assert.match(g().status, /模流分析：需要先有活動實體（塑膠件）或選中一個匯入網格組件（STL\/OBJ\/3MF）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /風洞分析：|熱分析：|生成式設計：|脫模可達性：|受力雲圖：/)
  assert.deepEqual(g().features, before)
})


// ── measureangle start (≠ more40 measure-distance / more41 measure-area / more42 measure-axis) ──

test('runtime: measureangle Formal 量角：依次點兩個面', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().measureAngleMode, false)
  await g().runCommand('measureangle', '量角')
  assert.match(g().status, /量角：依次點兩個面 → 顯示兩面夾角（活動實體 \/ 匯入網格件均可，可混選）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /統一測量：|量距|量邊|量面：|已退出量角/)
  assert.equal(g().measureAngleMode, true)
  assert.deepEqual(g().features, before)
})

// ── measureuni start (≠ measureangle above / more40–42 measure-*) ──

test('runtime: measureuni Formal 統一測量：點任意實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().measureUniMode, false)
  await g().runCommand('measureuni', '統一測量')
  assert.match(g().status, /統一測量：點任意實體（面\/邊\/點，最多 2 個）→ 自動出面積\/夾角\/長度\/最短距\/距離/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /量角：依次點兩個面|已退出統一測量/)
  assert.equal(g().measureUniMode, true)
  assert.deepEqual(g().features, before)
})

// ── xray toggle (≠ more56 zebra inspect overlay) ──

test('runtime: xray Formal 已開 X-ray 透視', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().xray, false)
  await g().runCommand('xray', '透視')
  assert.match(g().status, /已開 X-ray 透視（半透明查看內部）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /已關 X-ray|斑馬紋分析：|曲率趨勢/)
  assert.equal(g().xray, true)
  assert.deepEqual(g().features, before)
})

// ── centerofmass toggle (≠ more55 properties-no-body) ──

test('runtime: centerofmass Formal 已顯示重心\(質心\)標記', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().showCom, false)
  await g().runCommand('centerofmass', '質心')
  assert.match(g().status, /已顯示重心\(質心\)標記/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /已隱藏重心|屬性|質量屬性/)
  assert.equal(g().showCom, true)
  assert.deepEqual(g().features, before)
})

// ── topopt no solid (≠ thermal/moldflow above / more45 automatedmodel) ──

test('runtime: topopt without solid Formal 生成式設計：需要先有活動實體', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('topopt', '拓撲優化')
  assert.match(g().status, /生成式設計：需要先有活動實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /模流分析：|熱分析：|風洞分析：|受力雲圖：/)
  assert.deepEqual(g().features, before)
})

// ── sweep no path (≠ more41 sweep-end-scale / more53 sweepedge / more57 pipe-no-path) ──

test('runtime: sweep without path Formal 掃掠需要一條開放路徑', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().featDlg, null)
  await g().runCommand('sweep', '掃掠')
  assert.match(g().status, /掃掠需要一條開放路徑：畫路徑或在瀏覽器選取已儲存的路徑草圖，再點掃掠/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /管道需要一條路徑|曲面掃掠|放樣需要|路徑陣列需要/)
  assert.equal(g().featDlg, null)
  assert.deepEqual(g().features, before)
})
