#!/usr/bin/env node
// UX4 gasket-sketch proof, drawn WITH THE MOUSE (tool buttons + canvas clicks + keyboard), one fresh sketch per item.
// Usage (repo root, after `nice -n 19 npx vite build`):
//   nice -n 19 node scripts/e2e-ux4-sketch.mjs [--shots /workspace/webcad-qa/sketch-20261008/grok/evidence]
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  await page.evaluate(() => window.useApp.getState().setLang?.('zh-HK'))
  const S = () => page.evaluate(() => { const s = window.useApp.getState(); return { mode: s.mode, tool: s.sketchTool, prof: s.sketchProfiles, sh: s.sketchShape, cons: s.skCons, dof: s.skDof, st: s.status, conflict: s.skConflict, feats: s.features.map((f) => f.type) } })
  const all = (s) => [...s.prof, ...(s.sh ? [s.sh] : [])]
  const fresh = async () => {
    await page.evaluate(() => { const u = window.useApp; u.setState({ ...u.getInitialState(), introOpen: false, tour: null, appConfirm: async () => true }, true); u.getState().setLang?.('zh-HK'); u.getState().sketchOnDatumPlane('XY', 0) })
    await page.waitForTimeout(1500)
  }
  const at = (s, t) => page.cadToScreen([s, -t, 0])
  const move = async (s, t) => { const [x, y] = await at(s, t); await page.mouse.move(x, y, { steps: 8 }); await page.waitForTimeout(150) }
  const click = async (s, t) => { await move(s, t); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(300) }
  const tool = async (c) => { await page.locator(`button[data-cmd="${c}"]:visible`).first().click(); await page.waitForTimeout(250) }
  const near = (a, b, e = 0.05) => Math.abs(a - b) <= e
  const types = (s) => s.cons.map((c) => c.type)

  // ── #7 / #8 / #9 Line tool polyline ────────────────────────────────────────────
  await fresh()
  await tool('sk_polyline'); await click(0, 0); await click(40, 0); await click(40, 30); await click(10, 30)
  await page.keyboard.press('Escape'); await page.waitForTimeout(600)
  let s = await S(); let p = all(s).find((x) => x.type === 'poly')
  const straight = p && p.verts.every((v, i) => i === 0 || near(v[0], p.verts[i - 1][0], 1e-6) || near(v[1], p.verts[i - 1][1], 1e-6))
  ok('#8 mouse-drawn polyline segments are exactly horizontal/vertical (no slant from stale snap)', !!p && p.verts.length === 4 && straight, { verts: p?.verts })
  ok('#7 3 connected lines get auto H/V (+ shared joints)', types(s).filter((t) => t === 'h').length === 2 && types(s).filter((t) => t === 'v').length === 1, { cons: types(s), st: s.st })
  await page.shot('ux4-sk-7-polyline')
  await tool('sk_select'); await click(40, 15); await page.keyboard.press('Delete'); await page.waitForTimeout(600)
  s = await S()
  ok('#9 deleting the middle segment keeps the other two (polyline split)', all(s).length === 2 && all(s).every((x) => x.open && x.verts.length === 2), { n: all(s).length, st: s.st })

  // ── #10 3-point arc + #1 Backspace delete ──────────────────────────────────────
  await fresh()
  await tool('sk_arc'); await click(0, 0); await click(40, 0); await click(20, 13)
  await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  s = await S(); const arc = all(s).find((x) => x.arc)
  ok('#10 3-point arc passes through the clicked third point', !!arc && near(arc.arc.m[0], 20, 0.3) && near(arc.arc.m[1], 13, 0.3), { arc: arc?.arc })
  await page.shot('ux4-sk-10-arc')
  await tool('sk_select'); await click(20, 13); await page.keyboard.press('Backspace'); await page.waitForTimeout(500)
  s = await S()
  ok('#1 select arc + Backspace deletes it', all(s).length === 0, { n: all(s).length, st: s.st })

  // ── #3 Equal on two small circles ──────────────────────────────────────────────
  await fresh()
  await tool('sk_circle'); await click(0, 0); await click(1.5, 0); await click(20, 0); await click(21.5, 0)
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  await tool('sk_c_eq'); await click(0, 1.5); await click(20, 1.5); await page.waitForTimeout(600)
  s = await S(); const eq = s.cons.find((c) => c.type === 'equal')
  ok('#3 相等 on two small circles picks the circles (not the centres)', !!eq && eq.a.kind === 'circle' && eq.b.kind === 'circle', { eq, st: s.st, circles: all(s).map((x) => [x.c, x.r]) })

  // ── #2 #4 #6 fillet, #5 too large ──────────────────────────────────────────────
  await fresh()
  await tool('sk_rect'); await click(0, 0); await click(60, 40); await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  const before = await S()
  await tool('sk_filletc'); await page.keyboard.type('10'); await page.waitForTimeout(200)
  await click(60, 40); await move(52, 32); await click(52, 32); await page.waitForTimeout(900)
  s = await S(); p = all(s).find((x) => x.verts?.length === 5)
  ok('#6 typed R10 wins over the drag (corner tangent points at 10 mm)', !!p && p.verts.some((v) => near(v[0], 60, 1e-3) && near(v[1], 30, 1e-3)), { verts: p?.verts, st: s.st })
  ok('#4 fillet adds 2 tangent constraints, edges stay square, no conflict', types(s).filter((t) => t === 'tangent').length === 2 && !s.conflict && p && near(p.verts[3][1], p.verts[4][1], 1e-6), { cons: types(s) })
  await page.shot('ux4-sk-2-fillet')
  await page.keyboard.press('Escape'); await page.keyboard.press('Control+z'); await page.waitForTimeout(900)
  s = await S()
  ok('#2 ONE Ctrl+Z restores the exact rectangle (no distortion)', JSON.stringify(all(s)) === JSON.stringify(all(before)) && s.cons.length === before.cons.length, { after: all(s), before: all(before) })
  await page.shot('ux4-sk-2-undo')
  await tool('sk_filletc'); await page.keyboard.type('50'); await click(60, 40); await click(52, 32); await page.waitForTimeout(700)
  s = await S()
  ok('#5 too-large radius explains the maximum', /最大約 R/.test(s.st), { st: s.st })
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape')

  // ── Trim only the clicked piece ────────────────────────────────────────────────
  await fresh()
  await tool('sk_rect'); await click(0, 0); await click(80, 40)
  await tool('sk_circle'); await click(0, 40); await click(10, 40); await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  await tool('sk_trim'); await click(0, 35); await page.waitForTimeout(700)
  s = await S(); p = all(s).find((x) => x.type === 'poly' && x.open)
  ok('Trim removes only the clicked outside piece of the left edge (top + left edges stay)', !!p && p.verts.length === 5 && types(s).filter((t) => t === 'h' || t === 'v').length >= 4, { verts: p?.verts, cons: types(s), st: s.st })
  await page.shot('ux4-sk-trim')

  // ── Dimensions drop DOF one each; Mirror with dimensions ───────────────────────
  await fresh()
  await tool('sk_rect'); await click(0, 0); await click(80, 40); await page.keyboard.press('Escape'); await page.waitForTimeout(500)
  const d0 = (await S()).dof
  await tool('sk_dim'); await click(40, 0); await click(40, -8); await page.keyboard.press('Enter'); await page.waitForTimeout(500)
  const d1 = (await S()).dof
  await click(80, 20); await click(90, 20); await page.keyboard.press('Enter'); await page.waitForTimeout(500)
  s = await S(); const d2 = s.dof
  ok('each driving dimension removes exactly 1 DOF', d1 === d0 - 1 && d2 === d0 - 2 && s.cons.filter((c) => c.kind === 'dim').length === 2, { d0, d1, d2, st: s.st })
  await page.keyboard.press('Escape')
  await tool('sk_mirrory'); await page.getByRole('button', { name: /左右軸/ }).first().click(); await page.waitForTimeout(1500)
  s = await S()
  ok('Mirror works with dimensions (Traditional message, no conflict)', /已鏡像/.test(s.st) && !s.conflict && !/Mirror|conflict/i.test(s.st), { st: s.st, n: all(s).length })
  await page.shot('ux4-sk-mirror')

  // ── UX4-B #2 fillet next to length dims keeps them; #1 全部角 renumbers + tangents + one undo; #3 Traditional status ──
  await fresh()
  await tool('sk_rect'); await click(0, 0); await click(60, 40); await page.keyboard.press('Escape'); await page.waitForTimeout(500)
  await tool('sk_dim'); await click(30, 0); await click(30, -8); await page.keyboard.press('Enter'); await page.waitForTimeout(500)
  await click(60, 20); await click(70, 20); await page.keyboard.press('Enter'); await page.waitForTimeout(500)
  await page.keyboard.press('Escape')
  const base2 = await S(), dofB = base2.dof
  const lenDims = (x) => x.cons.filter((c) => c.kind === 'dim' && c.type !== 'rad')
  const sc = (t) => /倒圆角|剩余|个轮廓|约束|个相切|轮廓/.test(t)
  await tool('sk_filletc'); await page.keyboard.type('10'); await page.waitForTimeout(200)
  await click(60, 40); await move(52, 32); await click(52, 32); await page.waitForTimeout(1000)
  s = await S()
  ok('UX4-B #2 fillet next to the width/height dims keeps both (virtual-sharp), adds R dim, DOF unchanged', lenDims(base2).length === 2 && lenDims(s).length === 2 && s.cons.some((c) => c.type === 'rad') && s.dof === dofB && !s.conflict && /改掛虛擬尖角/.test(s.st) && !/已移除/.test(s.st),
    { dofB, dof: s.dof, dims: lenDims(s).map((c) => [c.type, c.value]), st: s.st })
  ok('UX4-B #3 fillet status is Traditional (倒圓角 / 剩餘, no 倒圆角/剩余)', /倒圓角 R10/.test(s.st) && !sc(s.st), { st: s.st })
  await page.shot('ux4b-sk-fillet-dims-kept')
  await page.keyboard.press('Escape'); await page.keyboard.press('Control+z'); await page.waitForTimeout(900)
  s = await S()
  ok('UX4-B single-corner Ctrl+Z restores rectangle + both dims', JSON.stringify(all(s)) === JSON.stringify(all(base2)) && s.cons.length === base2.cons.length, { n: s.cons.length, before: base2.cons.length })
  const undoN = await page.evaluate(() => window.useApp.getState().sketchUndo.length)
  await tool('sk_filletc'); await page.getByRole('button', { name: /全部角一次過/ }).first().click(); await page.waitForTimeout(1500)
  s = await S(); p = all(s).find((x) => x.verts?.length === 8)
  const undoN2 = await page.evaluate(() => window.useApp.getState().sketchUndo.length)
  const straightOK = !!p && [1, 3, 5, 7].every((i) => near(p.verts[i][0], p.verts[(i + 1) % 8][0], 1e-6) || near(p.verts[i][1], p.verts[(i + 1) % 8][1], 1e-6))
  ok('UX4-B #1 全部角: 4 arcs, 8 tangents, H/V still on straight edges (axis-aligned), dims kept, DOF unchanged, ONE undo step',
    !!p && straightOK && types(s).filter((t) => t === 'tangent').length === 8 && lenDims(s).length === 2 && s.dof === dofB && !s.conflict && undoN2 === undoN + 1,
    { verts: p?.verts, tangents: types(s).filter((t) => t === 'tangent').length, dof: s.dof, dofB, undo: [undoN, undoN2], st: s.st })
  ok('UX4-B #3 全部角 status Traditional', /個角倒 R10 真圓弧/.test(s.st) && /相切約束/.test(s.st) && !sc(s.st), { st: s.st })
  await page.shot('ux4b-sk-fillet-all')
  await page.keyboard.press('Escape'); await page.keyboard.press('Control+z'); await page.waitForTimeout(900)
  s = await S()
  ok('UX4-B 全部角: ONE Ctrl+Z restores rectangle + constraints', JSON.stringify(all(s)) === JSON.stringify(all(base2)) && s.cons.length === base2.cons.length, { after: all(s) })

  // ── Edited sketch 80→100 applies to the extrude ────────────────────────────────
  await fresh()
  await tool('sk_rect'); await click(0, 0); await click(80, 40); await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  await tool('sk_dim'); await click(40, 0); await click(40, -8); await page.keyboard.press('Enter'); await page.waitForTimeout(500)
  await page.keyboard.press('Escape')
  await page.evaluate(async () => { const g = window.useApp.getState; g().openExtrudeDlg(); window.useApp.setState({ extrudeHeight: 5 }); await g().extrudeSketch() })
  await page.waitForFunction(() => window.useApp.getState().mode === 'model' && !window.useApp.getState().busy, null, { timeout: 30000 })
  const fid = await page.evaluate(() => window.useApp.getState().features.find((f) => f.type === 'extrude' || f.type === 'extgroup').id)
  await page.evaluate((id) => window.useApp.getState().editSketchOf(id), fid)
  await page.waitForFunction(() => window.useApp.getState().mode === 'sketch', null, { timeout: 15000 })
  await page.waitForTimeout(800)
  const dimId = await page.evaluate(() => window.useApp.getState().skCons.find((c) => c.kind === 'dim').id)
  await page.evaluate((id) => window.useApp.getState().editSkDim(id, 100), dimId)
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /完成草圖/ }).first().click()
  await page.waitForFunction(() => window.useApp.getState().mode === 'model' && !window.useApp.getState().busy, null, { timeout: 30000 })
  s = await S()
  const maxX = await page.evaluate(() => Math.max(...window.useApp.getState().bodyMesh.vertices.filter((_, i) => i % 3 === 0)))
  ok('finishing the edited sketch applies 80→100 to the extrude (no 「草圖組重生成失敗」)', !/失敗/.test(s.st) && maxX > 99, { st: s.st, maxX })
  await page.shot('ux4-sk-regen-100')
})
