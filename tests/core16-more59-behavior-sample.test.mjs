/**
 * BOT-D more59 / FISHING102 tip — CORE16 true behavior / regression gaps on tip 084f3ab1 (F102).
 * Complements smoke-21 + more34–more58 samples without duplicating those topics.
 * more34–more56：見 more57/more58 soft-prep 累積表.
 * more57: MATERIALS+F88/F94 demold prefix, fillet/chamfer/shell no-solid · othread · convert ·
 * pipe/rib/pathpattern gates · curvmap/gausscurv · emboss start · fourbar · exportglb.
 * more58: MATERIALS+F88/F94 demold prefix, kmaxcurv/kmincurv · slidercrank/sixbar ·
 * exportstlascii · loft≥2 · moldflow · measureangle/measureuni · xray · centerofmass ·
 * topopt · sweep.
 * Focus here: physicslab/aerolab · thermal/windtunnel/fea no-solid · surfpatch/surfbridge/
 * surfsurftrim · measureedge/measureface · facesketch · editpoles · meshfacegroups.
 * Always-hard: MATERIALS SC keep + F88 lazySafe／无法开模／無法開模 + F94 demold status
 * prefix pins (JA 離型到達性… / EN Demold Accessibility…；≠ more58 exact trio themes =
 * the 13 runtime gaps differ from more58 kmaxcurv/…/sweep sample).
 * Base: FISHING102 tip 084f3ab1（product PhysicsLab aa01e72c + more57 ade7a28d；
 * more58 soft cdfb9d83 → F103；F101 tip 56360ad7 / product 674f096c 已非 cherry target）.
 * Hand-off: FISHING104 cherry (more58 → F103; more57 on F102; do NOT target F101/F102/F103).
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

test('always-hard: FISHING94 demold status prefix pins JA 離型到達性… / EN Demold Accessibility… (≠ more58 kmaxcurv\/sweep themes)', async () => {
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

// ── physicslab open (≠ more45–47 F88 PhysicsLab lazySafe pin only) ──

test('runtime: physicslab Formal 已打開 Physics Lab', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().physicsLabOpen, false)
  await g().runCommand('physicslab', 'Physics Lab')
  assert.match(g().status, /已打開 Physics Lab：互動級剛體模擬（非工程認證）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /已打開氣動設計實驗室|受力雲圖：|風洞分析：|熱分析：/)
  assert.equal(g().physicsLabOpen, true)
  assert.deepEqual(g().features, before)
})

// ── aerolab open (≠ physicslab above / F88 AeroLab lazySafe) ──

test('runtime: aerolab Formal 已打開氣動設計實驗室', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('aerolab', '氣動設計實驗室')
  assert.match(g().status, /已打開氣動設計實驗室：BEMT \/ VLM \/ 經驗阻力估算 \+ 自動優化（工程估算，非 CFD）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /已打開 Physics Lab|受力雲圖：|風洞分析：|熱分析：/)
  assert.deepEqual(g().features, before)
})

// ── thermal no solid (≠ more58 moldflow/topopt / more42 FEA setFeaOpt) ──

test('runtime: thermal without solid Formal 熱分析：需要先有活動實體', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('thermal', '熱分析')
  assert.match(g().status, /熱分析：需要先有活動實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /模流分析：|生成式設計：|風洞分析：|受力雲圖：/)
  assert.deepEqual(g().features, before)
})

// ── windtunnel no solid (≠ F86 WindTunnel lazy / more58 moldflow) ──

test('runtime: windtunnel without solid Formal 風洞分析：需要先有活動實體', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('windtunnel', '風洞')
  assert.match(g().status, /風洞分析：需要先有活動實體，或選中一個匯入網格組件（STL\/OBJ\/3MF）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /模流分析：|熱分析：|生成式設計：|受力雲圖：/)
  assert.deepEqual(g().features, before)
})

// ── fea no solid (≠ more42 clearFea / more44 clearFeaLoad / more58 topopt) ──

test('runtime: fea without solid Formal 受力雲圖：需要先有活動實體', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('fea', '受力雲圖')
  assert.match(g().status, /受力雲圖：需要先有活動實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /熱分析：|風洞分析：|模流分析：|生成式設計：|已退出受力雲圖/)
  assert.deepEqual(g().features, before)
})

// ── surfpatch pick (≠ more56 boundarypatch / more44 ruled / more40 surfextrude) ──

test('runtime: surfpatch Formal 曲面 Patch：點 ≥3 個點', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().patchMode, false)
  await g().runCommand('surfpatch', '曲面 Patch')
  assert.match(g().status, /🩹 曲面 Patch：在實體表面\/空間順序點 ≥3 個點圈出閉合邊界 → 填充曲面 \+ 加厚成薄板。Enter\/✓ 完成 · ⌫ 撤上一點 · Esc 取消/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /邊界補面|橋接面：|曲面裁剪：|規則曲面：|曲面拉伸：/)
  assert.equal(g().patchMode, true)
  assert.deepEqual(g().features, before)
})

// ── surfbridge pick (≠ more49 formbridge / surfpatch above) ──

test('runtime: surfbridge Formal 橋接面：點選【2 條】現有稜', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().surfBridgePick, false)
  await g().runCommand('surfbridge', '橋接面')
  assert.match(g().status, /橋接面：點選【2 條】現有稜（一邊一條，實體\/獨立曲面都得）→ 可設加厚 → 按「確定」（兩稜之間起光滑過渡面）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /曲面 Patch：|邊界補面|Bridge（FORM）|曲面裁剪：/)
  assert.equal(g().surfBridgePick, true)
  assert.deepEqual(g().features, before)
})

// ── surfsurftrim no parked (≠ more48 surftrim / more47 surfunstitch) ──

test('runtime: surfsurftrim without parked Formal 曲面裁剪：沒有曲面\/殼體可裁', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('surfsurftrim', '曲面裁剪')
  assert.match(g().status, /曲面裁剪：沒有曲面\/殼體可裁（先做曲面拉伸 \/ 規則曲面 \/ 縫合）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /平面裁剪：|曲面縫合|取消縫合|橋接面：|曲面 Patch：/)
  assert.deepEqual(g().features, before)
})

// ── measureedge start (≠ more58 measureangle/measureuni / more40–43 measure Formal labels) ──

test('runtime: measureedge Formal 量邊：點擊實體某條稜', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().measureEdgeMode, false)
  await g().runCommand('measureedge', '量邊')
  assert.match(g().status, /量邊：點擊實體某條稜 → 顯示長度；圓稜／弧稜顯示 Ø、R 與弧長／周長（匯入網格件亦可 · 特徵稜鏈近似）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /量面：|量角：|統一測量：|測量：點擊實體上兩點/)
  assert.equal(g().measureEdgeMode, true)
  assert.deepEqual(g().features, before)
})

// ── measureface start (≠ measureedge above / more41 measure-area labels) ──

test('runtime: measureface Formal 量面：點擊實體的一個面', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().measureFaceMode, false)
  await g().runCommand('measureface', '量面')
  assert.match(g().status, /量面：點擊實體的一個面 → 顯示其面積與類型（匯入網格件亦可 · 共面區近似）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /量邊：|量角：|統一測量：|測量：點擊實體上兩點/)
  assert.equal(g().measureFaceMode, true)
  assert.deepEqual(g().features, before)
})

// ── facesketch pick (≠ more50 extrude-no-sketch / more51 formsketch) ──

test('runtime: facesketch Formal 點擊實體的一個面 → 自動在該面上新建草圖', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().faceSketchPick, false)
  await g().runCommand('facesketch', '面草圖')
  assert.match(g().status, /點擊實體的一個面 → 自動在該面上新建草圖（支援平面\/軸向面）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /選擇草圖基準面：|已經在草圖模式|造型環境內建立草圖|已取消選面/)
  assert.equal(g().faceSketchPick, true)
  assert.deepEqual(g().features, before)
})

// ── editpoles mode (≠ more40 tip Formal 控制點球 chrome / form* more50–55) ──

test('runtime: editpoles Formal 編輯曲面控制點', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().editPolesMode, false)
  await g().runCommand('editpoles', '編輯控制點')
  assert.match(g().status, /編輯曲面控制點：點一個灰顯獨立曲面 → 拖藍色控制點球變形（多面殼可「面 1\/N」切面；跨縫 G1 後續）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /已退出編輯曲面控制點|曲面 Patch：|橋接面：/)
  assert.equal(g().editPolesMode, true)
  assert.deepEqual(g().features, before)
})

// ── meshfacegroups toggle (≠ more56 zebra/curvcomb / more58 kmax/kmin) ──

test('runtime: meshfacegroups Formal 網格面組上色', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().meshFaceGroupColors, false)
  await g().runCommand('meshfacegroups', '面組上色')
  assert.match(g().status, /網格面組上色：逐 B-rep 面\/面組循環調色/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /已關面組上色|斑馬紋分析：|曲率趨勢|最大主曲率|最小主曲率/)
  assert.equal(g().meshFaceGroupColors, true)
  assert.deepEqual(g().features, before)
})
