// UX3（簡單裝配走查）真瀏覽器 e2e：單一 niced vite preview + headless Chrome，exit 時殺。需要先 `nice -n 19 npx vite build`。
//   node scripts/e2e-ux3-assembly.mjs [--shots /tmp/ux3] [--vw 1400 --vh 900]
// #1 BOM 材質／質量同狀態列一致；#2 圓柱對話框 X/Y/Z + 📍 拾位置 + 自動→新實體；#3 有模型時 ribbon 見到 長方體▾圓柱、建立造型繁體；
// #4 揀草圖基準面時移動欄讓位、關節面板唔蓋 ribbon／基準面欄；#5 打開 BOM 唔講已匯出、圓錐圖示、樹唔標（未使用）、關節／自由度、冇 spinner、加關節唔跳位。
import { launch, clickAt } from './e2e-lib.mjs'
const { page, ok, finish, shot } = await launch()
const g = (fn, a) => page.evaluate(fn, a)
const st = () => g(() => window.useApp.getState().status)
const rect = (sel) => g((s) => { const e = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom } }, sel)
const overlap = (a, b) => !!(a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b)
async function clickTool(id) {
  const sel = `.tool-btn[data-cmd="${id}"]`
  if (await rect(sel)) { await page.locator(sel).first().click(); return true }
  const tabs = await page.locator('.ribbon-tabs .ribbon-tab:not(.ctx)').count()
  for (let i = 0; i < tabs; i++) { await page.locator('.ribbon-tabs .ribbon-tab:not(.ctx)').nth(i).click(); await page.waitForTimeout(120); if (await rect(sel)) { await page.locator(sel).first().click(); return true } }
  return false
}
async function typeInto(loc, v) { await loc.click(); await page.keyboard.press('Control+A'); await page.keyboard.type(String(v)); await page.keyboard.press('Tab') }
try {
  // ── #3/#5 ribbon：空白文件撳 長方體（ribbon quick）→ 預設 80×60×40 → 確定
  await page.locator('.ribbon-tabs .ribbon-tab:not(.ctx)').first().click()
  ok('#3 box is an inline ribbon button (empty doc)', !!(await rect('.tool-btn[data-cmd="box"]')))
  await page.locator('.tool-btn[data-cmd="box"]').first().click(); await page.waitForTimeout(300)
  ok('#2 box dialog has placement + op auto', !!(await rect('[data-testid="prim-place"]')) && (await page.locator('[data-testid="prim-op"]').inputValue()) === 'auto')
  await page.locator('[data-testid="command-confirm"]').click()
  await page.waitForFunction(() => window.useApp.getState().bodyMesh?.triangles?.length > 0, null, { timeout: 60000 })
  // ── #3 有模型：長方體仍喺 ribbon，▾ 有 圓柱／圓錐；圓錐圖示 ≠ 圓柱圖示
  ok('#3 box still on ribbon with a model present', !!(await rect('.tool-btn[data-cmd="box"]')))
  await page.locator('[data-testid="quick-tool-caret-box"]').click(); await page.waitForTimeout(150)
  const menu = await g(() => [...document.querySelectorAll('[data-testid="quick-tool-menu-box"] [data-cmd]')].map((e) => ({ id: e.dataset.cmd, text: e.textContent, svg: e.querySelector('svg')?.innerHTML ?? '' })))
  const cyl = menu.find((m) => m.id === 'cylinder'), cone = menu.find((m) => m.id === 'cone')
  ok('#3 caret menu lists 圓柱/球/圓環/圓錐', ['cylinder', 'sphere', 'torus', 'cone'].every((id) => menu.some((m) => m.id === id)), menu.map((m) => m.text))
  ok('#5 圓錐 has its own icon (not the cylinder icon)', !!cyl && !!cone && cone.text.includes('圓錐') && cone.svg !== cyl.svg)
  await shot('1-box-caret')
  // ── #2 圓柱：📍 喺盒頂中間點一下 → X/Y/Z ≈ (40, 30, 40)
  await page.locator('[data-testid="quick-tool-menu-box"] [data-cmd="cylinder"]').click(); await page.waitForTimeout(300)
  ok('#2 cylinder dialog has X/Y/Z + 📍', (await page.locator('[data-testid="prim-place"] input').count()) === 3 && !!(await rect('[data-testid="prim-pick-pt"]')))
  await page.locator('[data-testid="prim-pick-pt"]').click()
  const top = await g(() => { const cam = window.__three.camera, V = cam.position.constructor; const cv = [...document.querySelectorAll('canvas')].sort((a, c) => c.clientWidth * c.clientHeight - a.clientWidth * a.clientHeight)[0]; const r = cv.getBoundingClientRect(); const q = new V(40, 40, -30).project(cam); return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height] })
  await clickAt(page, top)
  const picked = await g(() => { const p = window.useApp.getState().featDlg?.params; return p && [+p.px, +p.py, +p.pz] })
  ok('#2 📍 pick on the box top lands at (40,30,40)', !!picked && Math.abs(picked[0] - 40) < 2 && Math.abs(picked[1] - 30) < 2 && Math.abs(picked[2] - 40) < 0.5, { picked, status: await st() })
  // 改成穿過盒（Z=-10，Ø20×60）→ 自動 = 新實體，唔併入
  const inp = page.locator('[data-testid="prim-place"] input')
  await typeInto(inp.nth(0), 40); await typeInto(inp.nth(1), 30); await typeInto(inp.nth(2), -10)
  await page.locator('[data-testid="command-confirm"]').click(); await page.waitForTimeout(1500)
  const cylRes = await g(() => { const s = window.useApp.getState(); const f = s.features.at(-1); return { op: f.operation, c: f.profile?.c, baseZ: f.baseZ, parked: s.bodyMesh?.parked?.length ?? 0, status: s.status } })
  ok('#2 overlapping cylinder (Ø60×50 through the box) → new body at X/Y/Z (not merged into box)', cylRes.op === 'newbody' && cylRes.parked === 1 && cylRes.c?.[0] === 40 && cylRes.c?.[1] === 30 && cylRes.baseZ === -10 && /新實體/.test(cylRes.status), cylRes)
  await shot('2-cyl-newbody')
  // ── #3 建立造型 → 繁體提示；再退出
  if (await clickTool('createform')) {
    await page.waitForTimeout(300)
    const fs = await st()
    ok('#3 建立造型 hint is Traditional', /^造型（FORM）環境：喺「建立 ▾」揀 長方體/.test(fs) && !/FINISH FORM|Quadball|\bBox\b/.test(fs), fs)
    await g(() => { const s = window.useApp.getState(); s.exitFormMode ? s.exitFormMode() : s.finishForm?.() })
    await page.waitForTimeout(300)
  } else ok('#3 建立造型 ribbon button found', false)
  // ── 裝配：底板（由草圖建）→ 新建組件；軸 → 新建組件；鋼 7.85
  await g(async () => {
    const s = () => window.useApp.getState()
    s().newDocument ? await s().newDocument(true) : null
    window.useApp.setState({ features: [], components: [], joints: [], sketchSources: {} })
    window.useApp.setState({ sketchSources: { skP: { name: '草圖4', shapes: [{ type: 'rect', a: [0, 0], b: [100, 80] }], cons: [], plane: 'XY', baseZ: 0, op: 'new', height: 10, visible: true } } })
    await s().applyFeatures([{ id: 'plate', type: 'extrude', profile: { kind: 'rect', a: [0, 0], b: [100, 80] }, height: 10, operation: 'new', sketchId: 'skP' }], 'plate')
    s().newComponent()
    await s().applyFeatures([{ id: 'shaft', type: 'extrude', profile: { kind: 'circle', c: [150, 40], r: 10 }, height: 60, operation: 'new' }], 'shaft')
    s().newComponent()
    s().setBodyDensity(7.85)
    s().selectComponent(null)
  })
  await page.waitForTimeout(800)
  const tree = await g(() => document.body.innerText)
  ok('#5 tree: component-owned 草圖4 not marked （未使用）', /草圖4/.test(tree) && !/草圖4（未使用）/.test(tree))
  // ── #1/#5 BOM：ribbon 打開 → 鋼、質量同狀態列一致、唔講已匯出
  const statusMass = await g(() => { const m = document.body.innerText.match(/總質量\(([\d.]+)\) ([\d.]+) (k?g)/); return m && { d: +m[1], g: +m[2] * (m[3] === 'kg' ? 1000 : 1) } })
  const okBom = await clickTool('bom'); await page.waitForTimeout(500)
  const bom = await g(() => { const d = window.useApp.getState().bomDialog; if (!d) return null; const h = d.rows[0]; const iM = h.indexOf('材質'), iS = h.indexOf('小計質量 (g)'); return { mats: d.rows.slice(1).filter((r) => /^\d+$/.test(r[0])).map((r) => r[iM]), total: +d.rows.find((r) => r[0] === '合計')[iS], summary: d.summary } })
  const bomStatus = await st()
  ok('#1 BOM opened from ribbon', okBom && !!bom)
  ok('#1 BOM material column shows 鋼 (no 「—」)', !!bom && bom.mats.length === 2 && bom.mats.every((m) => m === '鋼（預設）'), bom?.mats)
  ok('#1 BOM total mass == status bar 總質量(7.85)', !!bom && !!statusMass && statusMass.d === 7.85 && Math.abs(bom.total - statusMass.g) <= 0.1, { bom: bom?.total, statusMass })
  ok('#5 opening BOM does not say 已匯出', !/已匯出/.test(bomStatus) && /^已打開材料清單/.test(bomStatus), bomStatus)
  await shot('3-bom')
  await page.locator('[role="dialog"] button', { hasText: '匯出 CSV' }).click(); await page.waitForTimeout(300)
  ok('#5 actual export says 已匯出', /^已匯出/.test(await st()), await st())
  await g(() => window.useApp.getState().closeBomDialog())
  // ── #4/#5 關節面板
  await g(() => { const s = window.useApp.getState(); const c = s.components; s.addJoint({ type: 'revolute', parent: c[0].id, child: c[1].id, anchor: [0, 0, 0], axis: [0, 1, 0], angle: 0, slide: 0 }); s.selectComponent(c[1].id) })
  await page.waitForTimeout(500)
  if (await rect('.joints-pill')) { await page.locator('.joints-pill').click(); await page.waitForTimeout(300) }
  const jp = await rect('.joints-panel'), rb = await rect('.ribbon')
  const jtxt = await g(() => document.querySelector('.joints-panel')?.innerText ?? '')
  ok('#5 joints panel Traditional (關節/自由度, no JOINTS/DOF/Contact Sets)', /裝配關節 1 · 自由度/.test(jtxt) && !/JOINTS|\bDOF\b|Contact Sets/.test(jtxt), jtxt.slice(0, 80))
  ok('#5 joints panel has no spinner number inputs', (await g(() => document.querySelectorAll('.joints-panel input[type="number"]').length)) === 0)
  ok('#4 joints panel below the ribbon', !!jp && !!rb && jp.t >= rb.b, { jp, rb })
  const before = { panel: jp, firstX: await rect('.joints-panel .jp-joint') }
  await g(() => { const s = window.useApp.getState(); const c = s.components; s.addJoint({ type: 'slider', parent: c[0].id, child: c[1].id, anchor: [0, 0, 0], axis: [1, 0, 0], angle: 0, slide: 0 }) })
  await page.waitForTimeout(500)
  const jp2 = await rect('.joints-panel')
  ok('#5 adding a joint keeps the panel bottom anchored and under the ribbon', !!jp2 && Math.abs(jp2.b - before.panel.b) < 2 && jp2.t >= rb.b, { before: before.panel, after: jp2 })
  await shot('4-joints')
  // 移動欄 + 建立草圖 → 揀基準面欄唔被蓋
  ok('#4 move bar shown for selected component', /移動\/旋轉/.test(await g(() => document.body.innerText)))
  await clickTool('sketch'); await page.waitForTimeout(500)
  const pick = await rect('.sketch-plane-picker'), jp3 = await rect('.joints-panel') ?? await rect('.joints-pill')
  const moveVisible = await g(() => [...document.querySelectorAll('.sketch-bar .sb-title')].some((e) => /移動\/旋轉/.test(e.textContent)))
  ok('#4 plane-pick bar visible; move bar hidden while picking', !!pick && !moveVisible, { pick })
  ok('#4 joints panel does not cover plane-pick bar / ribbon', !overlap(jp3, pick) && !overlap(jp3, rb), { jp3, pick, rb })
  await shot('5-sketchpick')
  await page.keyboard.press('Escape')
} catch (e) { await finish(e) }
await finish()
