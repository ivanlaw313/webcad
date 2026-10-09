#!/usr/bin/env node
// SKETCH12 batch 2 (+ final-summary items) proof, drawn WITH THE REAL MOUSE (ribbon buttons, canvas clicks, keyboard).
// Usage (repo root, after `nice -n 19 npx vite build`):  nice -n 19 node scripts/e2e-sketch12-b2.mjs [--shots DIR] [--only extend,ellipse]
import { runE2E, arg } from './e2e-harness.mjs'

const only = (arg('--only', '') || '').split(',').filter(Boolean)
const want = (k) => !only.length || only.includes(String(k))
const COLLOQ = /[撚仲係嘅唔啲冇咗喺嗰]|Fusion/

await runE2E(async (page, ok) => {
  const S = () => page.evaluate(() => { const s = window.useApp.getState(); return { tool: s.sketchTool, prof: s.sketchProfiles, sh: s.sketchShape, cons: s.skCons, dof: s.skDof, st: s.status, conflict: s.skConflict, slotW: s.sketchSlotW, start: s.sketchStart } })
  const all = (s) => [...s.prof, ...(s.sh ? [s.sh] : [])]
  const fresh = async () => {
    await page.evaluate(() => { const u = window.useApp; u.setState({ ...u.getInitialState(), introOpen: false, tour: null, appConfirm: async () => true }, true); u.getState().setLang?.('zh-HK'); u.getState().sketchOnDatumPlane('XY', 0) })
    await page.waitForTimeout(1500)
  }
  const at = (s, t) => page.cadToScreen([s, -t, 0])
  const move = async (s, t) => { const [x, y] = await at(s, t); await page.mouse.move(x, y, { steps: 8 }); await page.waitForTimeout(150) }
  const click = async (s, t) => { await move(s, t); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(350) }
  const tool = async (c) => { await page.locator(`button[data-cmd="${c}"]:visible`).first().click(); await page.waitForTimeout(250) }
  const keys = async (...ks) => { for (const k of ks) { if (k.length > 1 && /^[A-Z]/.test(k)) await page.keyboard.press(k); else await page.keyboard.type(k) } await page.waitForTimeout(300) }
  const labels = () => page.evaluate(() => [...document.querySelectorAll('[data-dim]')].filter((e) => e.offsetParent).map((e) => e.getAttribute('data-dim')))
  const editLabel = async (re, value, sel = '[data-dim]') => {
    const loc = page.locator(sel).filter({ hasText: re }).first()
    await loc.click(); await page.waitForTimeout(250); await loc.dblclick(); await page.waitForTimeout(300)
    const ed = page.locator('[data-dim-editor] input, input:focus').first()
    await ed.click(); await page.keyboard.press('Control+a'); await page.keyboard.type(String(value)); await page.keyboard.press('Enter'); await page.waitForTimeout(800)
  }

  if (want('extend')) {
    await fresh()
    await tool('sk_polyline'); await click(0, 0); await click(20, 0); await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
    await tool('sk_polyline'); await click(40, -20); await click(40, 20); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(400)
    const tip = await page.locator('button[data-cmd="sk_extend"]:visible').first().getAttribute('title')
    await tool('sk_extend'); await move(17, 0); await page.shot('b2-extend-hover'); await click(17, 0); await page.waitForTimeout(600)
    let s = await S(); const ln = all(s).find((x) => x.verts && Math.abs(x.verts[0][1]) < 0.5 && Math.abs(x.verts[1][1]) < 0.5 && x.verts.length === 2)
    ok('Extend icon next to Trim: click a line end → extended to the nearest crossing line (x=40)', !!ln && Math.abs(Math.max(ln.verts[0][0], ln.verts[1][0]) - 40) < 0.05 && !COLLOQ.test(s.st), { verts: ln?.verts, st: s.st, tip })
    await page.keyboard.press('Control+z'); await page.waitForTimeout(500); s = await S()
    const ln2 = all(s).find((x) => x.verts && x.verts.length === 2 && Math.abs(x.verts[0][1]) < 0.5 && Math.abs(x.verts[1][1]) < 0.5)
    ok('Extend is undoable', !!ln2 && Math.abs(Math.max(ln2.verts[0][0], ln2.verts[1][0]) - 20) < 0.05, { verts: ln2?.verts })
    await page.shot('b2-extend')
  }

  if (want('ellipse')) {
    await fresh()
    await tool('sk_ellipse'); await click(0, 0); await move(20, 10)
    const hint = await page.evaluate(() => window.useApp.getState().sketchDim)
    await click(20, 10); await page.waitForTimeout(700)
    let s = await S(); const e = all(s).find((x) => x.ell)?.ell
    let L = await labels()
    ok('Ellipse drawn with the mouse; hint says 水平軸全長 × 豎直軸全長 (not 寬 × 高)', !!e && Math.abs(e.rx - 20) < 0.3 && Math.abs(e.ry - 10) < 0.3 && /水平軸全長.*豎直軸全長/.test(hint || ''), { e, hint })
    ok('Ellipse labels: one 半長軸 + one 半短軸, no duplicated (20)(20)(40)(40)', L.filter((t) => /半長軸/.test(t)).length === 1 && L.filter((t) => /半短軸/.test(t)).length === 1 && !L.some((t) => /^\(/.test(t)), { L })
    await page.keyboard.press('Escape'); await page.waitForTimeout(200)
    await page.shot('b2-ellipse-labels')
    ok('Ellipse DOF counted: centre snapped to origin (◉) → 5 − 2 = DOF 3', (await S()).dof === 3 && (await S()).cons.some((c) => c.type === 'coincident'), { dof: (await S()).dof })
    await editLabel(/半長軸/, 25)
    s = await S(); let e2 = all(s).find((x) => x.ell)?.ell
    ok('Click 半長軸 label → type 25 → major semi-axis 25, centre kept, driving dim, DOF 2', !!e2 && Math.abs(e2.rx - 25) < 1e-3 && Math.abs(e2.cx) < 0.3 && s.cons.some((c) => c.a?.kind === 'ellipse-axis' && c.value === 25) && s.dof === 2, { e2, dof: s.dof, cons: s.cons.map((c) => [c.type, c.a?.kind, c.value]) })
    await editLabel(/半短軸/, 40)
    s = await S(); e2 = all(s).find((x) => x.ell)?.ell
    ok('半短軸 > 半長軸 is rejected with a formal message', Math.abs(e2.ry - 10) < 0.3 && /半短軸不可大於半長軸/.test(s.st), { st: s.st, e2 })
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    await page.locator('button:visible', { hasText: /尺寸/ }).filter({ hasText: '⟷' }).first().click().catch(() => {})
    await page.waitForTimeout(200)
    if ((await S()).tool !== 'dimension') await page.evaluate(() => window.useApp.getState().setSketchTool('dimension'))
    await click(-12.5, 8.66); await page.waitForTimeout(600)
    const ed = page.locator('[data-dim-editor] input').first()
    if (await ed.count()) { await ed.click(); await page.keyboard.press('Control+a'); await page.keyboard.type('6'); await page.keyboard.press('Enter'); await page.waitForTimeout(800) }
    s = await S(); e2 = all(s).find((x) => x.ell)?.ell
    ok('Dimension tool: click the ellipse curve → 半短軸 dimension, type 6 → ry = 6', s.cons.some((c) => c.a?.kind === 'ellipse-axis' && c.a.idx === 1) && Math.abs(e2.ry - 6) < 1e-3, { e2, st: s.st })
    await page.shot('b2-ellipse-dims')
  }

  if (want('slot')) {
    await fresh()
    await tool('sk_slot'); await page.waitForTimeout(300)
    const wIn = page.locator('[data-testid="slot-width"]')
    await wIn.click(); await page.keyboard.press('Control+a'); await page.keyboard.type('0'); await page.waitForTimeout(300)
    let s = await S(); const err = await page.locator('[data-testid="slot-width-error"]').textContent().catch(() => '')
    ok('Slot width 0 → formal error, previous width kept (no silent fallback)', s.slotW === 20 && /槽寬必須大於 0/.test(s.st) && /槽寬必須大於 0/.test(err || ''), { slotW: s.slotW, st: s.st, err })
    await page.keyboard.press('Control+a'); await page.keyboard.type('12.5'); await page.waitForTimeout(200)
    await click(0, 0); await move(30, 0)
    const ro = await page.evaluate(() => window.useApp.getState().sketchDim)
    await click(30, 0); await page.waitForTimeout(800)
    s = await S()
    const L = await labels()
    ok('Slot: live readout labels the mode (心心模式)', /心心模式：心心距 30.*寬 12\.5/.test(ro || ''), { ro })
    ok('Slot: status shows decimals (12.5), driving length 30 + width 12.5 dims, DOF 2', /12\.5/.test(s.st) && s.cons.some((c) => c.type === 'len' && c.value === 30) && s.cons.some((c) => c.type === 'p2l' && c.value === 12.5) && s.dof === 2 && !s.conflict, { st: s.st, L, dof: s.dof })
    await page.shot('b2-slot')
    await page.keyboard.press('Escape')
    await editLabel(/12\.5/, 16, '[data-dim-driving="true"]')
    s = await S(); const V = all(s).find((x) => x.verts?.length === 4)?.verts
    ok('Slot width editable after drawing (click 12.5 → 16)', !!V && Math.abs(Math.abs(V[0][1] - V[1][1]) - 16) < 1e-3, { V, st: s.st })
    // typed: start, length Tab width, Enter; further numbers must not create another slot
    await tool('sk_slot'); await click(0, 40); await move(10, 40)
    await keys('25', 'Tab', '7.5', 'Enter'); await page.waitForTimeout(600)
    const n1 = all(await S()).length
    await keys('40', 'Enter', '10', 'Enter'); await page.waitForTimeout(600)
    s = await S()
    ok('Typed slot (25 Tab 7.5 Enter) then more digits + Enter → no extra slot, prompt to click a start', all(s).length === n1 && !s.start && /請先在畫布點選起點/.test(s.st), { n1, n2: all(s).length, st: s.st })
    // overall mode preview = result
    await page.locator('[data-testid="slot-mode-overall"]').click(); await page.waitForTimeout(200)
    await click(0, -40); await move(40, -40)
    const ro2 = await page.evaluate(() => window.useApp.getState().sketchDim)
    await page.shot('b2-slot-overall-preview')
    await click(40, -40); await page.waitForTimeout(600)
    s = await S(); const ov = all(s).filter((x) => x.verts?.length === 4).pop()
    const xs = ov ? ov.pts.map((p) => p[0]) : []
    ok('總長 mode: readout says 總長模式 and the slot spans tip-to-tip 0…40', /總長模式：總長 40/.test(ro2 || '') && Math.abs(Math.min(...xs)) < 0.2 && Math.abs(Math.max(...xs) - 40) < 0.2, { ro2, min: Math.min(...xs), max: Math.max(...xs) })
  }

  if (want('trim')) {
    await fresh()
    await tool('sk_polyline'); await click(0, 0); await click(20, 0); await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
    await tool('sk_circle'); await click(50, 30); await click(55, 30); await page.keyboard.press('Escape')
    await tool('sk_trim'); const hint = (await S()).st
    await click(10, 0); await page.waitForTimeout(700)
    let s = await S()
    ok('Trim hint formal; trimming a line with no intersections deletes it with a status message', !COLLOQ.test(hint) && all(s).length === 1 && /已刪除整條輪廓（與其他幾何沒有相交/.test(s.st) && !COLLOQ.test(s.st), { hint, st: s.st })
    await page.keyboard.press('Control+z'); await page.waitForTimeout(500)
    ok('…and it is undoable', all(await S()).length === 2)
  }

  if (want('conmenu')) {
    await fresh()
    await tool('sk_polyline'); await click(0, 0); await click(30, 0); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(600)
    let s = await S(); const n0 = s.cons.length
    const glyph = page.locator('[data-constraint-id]:visible').first()
    const has = await glyph.count()
    if (has) { await glyph.click({ button: 'right' }); await page.waitForTimeout(300) }
    const menu = await page.locator('[data-testid="constraint-menu"]').textContent().catch(() => '')
    await page.shot('b2-constraint-menu')
    if (menu) { await page.locator('[data-testid="constraint-menu-delete"]').click(); await page.waitForTimeout(500) }
    s = await S()
    ok('Right-click a constraint glyph → 刪除約束 removes it', has > 0 && /刪除約束/.test(menu || '') && s.cons.length === n0 - 1, { has, menu, n0, n1: s.cons.length })
  }

  if (want('offset')) {
    await fresh()
    await tool('sk_rect'); await click(0, 0); await click(40, 20); await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    await tool('sk_offset'); await page.waitForTimeout(300)
    const inp = page.locator('.tp-num').first()
    await inp.click(); await page.keyboard.press('Control+a'); await page.keyboard.type('3'); await page.waitForTimeout(200)
    await click(20, 20); await move(20, 32); await click(20, 32); await page.waitForTimeout(700)
    const s = await S(); const off = all(s).find((x) => x.offsetOf)
    ok('Offset: value typed in the panel (3) wins over the cursor distance (12) on the first pick', !!off && Math.abs(Math.abs(off.offsetOf.d) - 3) < 1e-6, { d: off?.offsetOf?.d, st: s.st })
    await page.shot('b2-offset')
  }

  if (want('tools')) {
    await fresh()
    const caret = async (p) => { await page.locator(`[data-testid="quick-tool-caret-${p}"]:visible`).first().click(); await page.waitForTimeout(250); const ids = await page.locator(`[data-testid="quick-tool-menu-${p}"] [data-cmd]`).evaluateAll((els) => els.map((e) => e.getAttribute('data-cmd'))); await page.keyboard.press('Escape'); return ids }
    const r = await caret('sk_rect'), c = await caret('sk_circle'), a = await caret('sk_arc')
    ok('Ribbon ▾ menus contain 三點矩形 / 兩點圓 / 相切弧 with icons', r.includes('sk_rect3') && c.includes('sk_circle2p') && a.includes('sk_tanarc'), { r, c, a })
    // tangent arc with the mouse from a line end
    await tool('sk_polyline'); await click(0, 0); await click(20, 0); await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
    await page.locator('[data-testid="quick-tool-caret-sk_arc"]:visible').first().click(); await page.waitForTimeout(250)
    await page.locator('[data-testid="quick-tool-menu-sk_arc"] [data-cmd="sk_tanarc"]').click(); await page.waitForTimeout(250)
    await click(20, 0); await click(30, 10); await page.keyboard.press('Escape'); await page.waitForTimeout(700)
    const s = await S()
    ok('相切弧 from the ribbon: arc from a line end gets tangent', s.cons.some((x) => x.type === 'tangent'), { cons: s.cons.map((x) => x.type), st: s.st })
    // circle undo/redo keeps coincident-to-origin
    await tool('sk_circle'); await click(0, 0); await click(8, 0); await page.keyboard.press('Escape'); await page.waitForTimeout(500)
    const before = (await S()).cons.filter((x) => x.type === 'coincident' && (x.a?.kind === 'origin' || x.b?.kind === 'origin')).length
    await page.keyboard.press('Control+z'); await page.waitForTimeout(500); await page.keyboard.press('Control+y'); await page.waitForTimeout(700)
    const after = (await S()).cons.filter((x) => x.type === 'coincident' && (x.a?.kind === 'origin' || x.b?.kind === 'origin')).length
    ok('Circle at origin: Ctrl+Z then Ctrl+Y keeps its coincident-to-origin', before >= 1 && after === before, { before, after })
  }
})
