#!/usr/bin/env node
// SKETCH12 batch 1 proof, drawn WITH THE REAL MOUSE (ribbon buttons + canvas clicks + keyboard), one fresh sketch per item.
// Usage (repo root, after `nice -n 19 npx vite build`):  nice -n 19 node scripts/e2e-sketch12.mjs [--shots DIR] [--only 2,3]
import { runE2E, arg } from './e2e-harness.mjs'

const only = (arg('--only', '') || '').split(',').filter(Boolean)
const want = (k) => !only.length || only.includes(String(k))

await runE2E(async (page, ok) => {
  await page.evaluate(() => window.useApp.getState().setLang?.('zh-HK'))
  const S = () => page.evaluate(() => { const s = window.useApp.getState(); return { mode: s.mode, tool: s.sketchTool, prof: s.sketchProfiles, sh: s.sketchShape, cons: s.skCons, dof: s.skDof, st: s.status, conflict: s.skConflict, poly: s.polyPts, redoN: s.sketchRedo.length } })
  const all = (s) => [...s.prof, ...(s.sh ? [s.sh] : [])]
  const fresh = async () => {
    await page.evaluate(() => { const u = window.useApp; u.setState({ ...u.getInitialState(), introOpen: false, tour: null, appConfirm: async () => true }, true); u.getState().setLang?.('zh-HK'); u.getState().sketchOnDatumPlane('XY', 0) })
    await page.waitForTimeout(1500)
  }
  const at = (s, t) => page.cadToScreen([s, -t, 0])
  const move = async (s, t) => { const [x, y] = await at(s, t); await page.mouse.move(x, y, { steps: 8 }); await page.waitForTimeout(150) }
  const click = async (s, t) => { await move(s, t); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(300) }
  const tool = async (c) => { await page.locator(`button[data-cmd="${c}"]:visible`).first().click(); await page.waitForTimeout(250) }
  const types = (s) => s.cons.map((c) => c.type)
  const dofText = () => page.evaluate(() => [...document.querySelectorAll('.sb-hint')].map((e) => e.textContent).find((t) => /DOF|完全定義|自由度/.test(t || '')) || '')
  globalThis.__h = { S, all, fresh, at, move, click, tool, types, dofText }

  const pick = async (parent, child) => {
    await page.locator(`[data-testid="quick-tool-caret-${parent}"]:visible`).first().click(); await page.waitForTimeout(250)
    await page.locator(`[data-testid="quick-tool-menu-${parent}"] [data-cmd="${child}"]`).click(); await page.waitForTimeout(250)
  }
  const near = (a, b, e = 1e-3) => Math.abs(a - b) <= e
  const keyStr = (s) => JSON.stringify({ sh: all(s), cons: s.cons })

  // ── #1 Rectangle ▾ / Circle ▾ / Arc ▾ in the sketch CREATE ribbon group ───────────
  if (want(1)) {
    await fresh()
    const menu = {}
    for (const p of ['sk_rect', 'sk_circle', 'sk_arc']) {
      await page.locator(`[data-testid="quick-tool-caret-${p}"]:visible`).first().click(); await page.waitForTimeout(250)
      menu[p] = await page.locator(`[data-testid="quick-tool-menu-${p}"] [data-cmd]`).evaluateAll((els) => els.map((e) => [e.getAttribute('data-cmd'), e.textContent.trim()]))
      await page.shot(`sk12-1-menu-${p}`)
      await page.keyboard.press('Escape'); await page.waitForTimeout(200)
    }
    ok('#1 Rectangle ▾ lists 2-point / 3-point / center', JSON.stringify(menu.sk_rect.map((x) => x[0])) === JSON.stringify(['sk_rect', 'sk_rect3', 'sk_crect']), menu.sk_rect)
    ok('#1 Circle ▾ lists center-diameter / 2-point / 3-point (+ tangent circles)', ['sk_circle', 'sk_circle2p', 'sk_circle3'].every((id, k) => menu.sk_circle[k]?.[0] === id), menu.sk_circle)
    ok('#1 Arc ▾ lists 3-point / center-point / tangent', JSON.stringify(menu.sk_arc.map((x) => x[0])) === JSON.stringify(['sk_arc', 'sk_arcc', 'sk_tanarc']), menu.sk_arc)
    await pick('sk_rect', 'sk_rect3'); let s = await S()
    ok('#1 picking 三點矩形 arms the rect3 tool', s.tool === 'rect3', { tool: s.tool })
    await click(0, 0); await click(30, 10); await click(25, 25); await page.waitForTimeout(600)
    s = await S(); const r3 = all(s).find((x) => x.type === 'poly' && x.pts.length === 4)
    ok('#1 3-point rectangle drawn with the mouse is a rotated 4-gon', !!r3 && !near(r3.pts[1][1], r3.pts[0][1], 0.5), { pts: r3?.pts })
    await page.keyboard.press('Escape'); await page.waitForTimeout(200)
    await pick('sk_circle', 'sk_circle2p'); s = await S()
    ok('#1 picking 兩點圓 arms circle2p', s.tool === 'circle2p', { tool: s.tool })
    await click(40, 0); await click(60, 0); await page.waitForTimeout(600)
    s = await S(); const c2 = all(s).find((x) => x.type === 'circle' && near(x.c[0], 50, 0.3))
    ok('#1 2-point circle drawn with the mouse (Ø20 at 50,0)', !!c2 && near(c2.r, 10, 0.3), { c2 })
    await page.keyboard.press('Escape'); await page.waitForTimeout(200)
    await page.shot('sk12-1-drawn')
  }

  // ── #2 Circle undo / Ctrl+Y keeps constraints exactly ──────────────────────────────
  if (want(2)) {
    for (const typed of [false, true]) {
      await fresh()
      await tool('sk_circle'); await click(0, 0)
      if (typed) { await page.keyboard.type('20'); await page.keyboard.press('Enter') } else await click(10, 0)
      await page.waitForTimeout(1000)
      const before = await S()
      await page.keyboard.press('Control+z'); await page.waitForTimeout(700)
      const mid = await S()
      await move(5, 5)
      await page.keyboard.press('Control+y'); await page.waitForTimeout(1000)
      const after = await S()
      const lbl = typed ? 'typed Ø20' : 'clicked'
      ok(`#2 circle (${lbl}) at origin gets ◉ coincident to origin`, before.cons.some((c) => c.type === 'coincident' && c.b?.kind === 'origin'), { cons: types(before), dof: before.dof })
      ok(`#2 circle (${lbl}): Ctrl+Z removes it`, all(mid).length === 0, { n: all(mid).length })
      ok(`#2 circle (${lbl}): Ctrl+Y restores geometry + constraints exactly, same DOF`, keyStr(after) === keyStr(before) && after.dof === before.dof, { before: [types(before), before.dof], after: [types(after), after.dof] })
    }
  }

  // ── #3 Center rectangle DOF ────────────────────────────────────────────────────────
  if (want(3)) {
    await fresh()
    await pick('sk_rect', 'sk_crect'); await click(20, 20); await click(30, 26); await page.waitForTimeout(1200)
    let s = await S(); let txt = await dofText()
    ok('#3 free center rectangle: DOF 4 (width, height, centre x/y), toolbar shows it', s.dof === 4 && /DOF 4/.test(txt), { dof: s.dof, txt })
    await fresh()
    await pick('sk_rect', 'sk_crect'); await click(0, 0); await click(15, 10); await page.waitForTimeout(1200)
    s = await S(); txt = await dofText()
    ok('#3 center rectangle on the origin: centre locked → DOF 2', s.dof === 2 && /DOF 2/.test(txt) && s.cons.some((c) => c.type === 'midpoint' && c.a.kind === 'origin'), { dof: s.dof, txt, cons: types(s) })
    const rect = all(s).find((x) => x.type === 'rect')
    ok('#3 center rectangle stays symmetric about the origin', !!rect && near(rect.a[0], -rect.b[0]) && near(rect.a[1], -rect.b[1]), { rect })
    await page.shot('sk12-3-crect-origin')
  }

  // ── #4 Arc from a line end: tangent arc tool auto-tangent; manual tangent keeps the dimensioned line ──
  if (want(4)) {
    await fresh()
    await tool('sk_polyline'); await click(5, 5); await click(45, 5); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(400)
    await tool('sk_dim'); await click(25, 5); await click(25, -3); await page.keyboard.press('Enter'); await page.waitForTimeout(600)
    await page.keyboard.press('Escape'); await page.waitForTimeout(200)
    await tool('sk_arc'); await click(45, 5); await click(65, 30); await click(60, 13); await page.waitForTimeout(800)
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    let s = await S(); const line0 = JSON.stringify(all(s)[0].verts)
    await tool('sk_c_tan'); await click(25, 5); await click(62.8, 20.6); await page.waitForTimeout(1500)
    s = await S()
    const L = all(s)[0].verts, len = Math.hypot(L[1][0] - L[0][0], L[1][1] - L[0][1])
    ok('#4 manual 相切 line→arc: tangent added, no conflict', s.cons.some((c) => c.type === 'tangent') && !s.conflict, { cons: types(s), st: s.st })
    ok('#4 dimensioned line keeps 40 and does not move (the arc moves)', near(len, 40, 1e-6) && JSON.stringify(L) === line0, { before: line0, after: L })
    await page.shot('sk12-4-manual-tangent')
    // tangent arc tool from the line end (Arc ▾ → 相切弧)
    await fresh()
    await tool('sk_polyline'); await click(0, 0); await click(40, 0); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(400)
    await pick('sk_arc', 'sk_tanarc')
    await click(40, 0); await click(60, 20); await page.waitForTimeout(300)
    await page.keyboard.press('Escape'); await page.waitForTimeout(1200)
    s = await S()
    const tan = s.cons.find((c) => c.type === 'tangent' && c.a.shape !== c.b.shape)
    ok('#4 tangent arc from a line end gets coincident AND tangent to the line', !!tan && s.cons.some((c) => c.type === 'coincident'), { cons: s.cons.map((c) => [c.type, c.a, c.b]), st: s.st })
    await page.shot('sk12-4-tanarc')
  }

  // ── #5 hint / DOF always / origin snap / polyline Ctrl+Y / residue / New file ───────
  if (want(5)) {
    await fresh()
    await tool('sk_circle')
    const tip = await page.locator('button[data-cmd="sk_circle"]:visible').first().getAttribute('title')
    ok('#5 circle tool hint says diameter (直徑), not radius', /直徑/.test(tip) && !/半徑/.test(tip), { tip })
    // centre 4 px from the origin → origin snap beats grid
    const o = await at(0, 0)
    await page.mouse.move(o[0] + 4, o[1] - 1, { steps: 6 }); await page.waitForTimeout(200); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(300)
    await click(12, 0); await page.waitForTimeout(1200)
    let s = await S(); const c = all(s).find((x) => x.type === 'circle')
    ok('#5 circle centre 4 px from origin snaps to the origin (not the grid)', !!c && near(c.c[0], 0, 1e-9) && near(c.c[1], 0, 1e-9), { c: c?.c, cons: types(s) })
    await page.keyboard.press('Escape')
    // arc-only sketch shows DOF
    await fresh()
    await tool('sk_arc'); await click(0, 0); await click(30, 0); await click(15, 8); await page.waitForTimeout(1200)
    let txt = await dofText(); s = await S()
    ok('#5 arc-only sketch shows a numeric DOF', /DOF \d/.test(txt) && Number.isInteger(s.dof), { txt, dof: s.dof })
    await page.keyboard.press('Escape')
    // while drawing (rect started, nothing constrained) still numeric
    await tool('sk_rect'); await click(40, 0); await move(55, 10); await page.waitForTimeout(500)
    txt = await dofText()
    ok('#5 toolbar shows a number (not 「DOF —」) while drawing', /DOF \d/.test(txt) && !/DOF —/.test(txt), { txt })
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
    // polyline Ctrl+Y redo of the last undone segment
    await fresh()
    await tool('sk_polyline'); await click(0, 0); await click(20, 0); await click(20, 15); await click(0, 25)
    s = await S(); const full = JSON.stringify(s.poly)
    await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z'); await page.waitForTimeout(300)
    s = await S(); const after2 = s.poly.length
    await page.keyboard.press('Control+y'); await page.waitForTimeout(300)
    s = await S(); const after1 = s.poly.length
    await page.keyboard.press('Control+y'); await page.waitForTimeout(300)
    s = await S()
    ok('#5 drawing a polyline: Ctrl+Z ×2 then Ctrl+Y ×2 redoes both segments', after2 === 2 && after1 === 3 && JSON.stringify(s.poly) === full, { after2, after1, poly: s.poly })
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(500)
    // grey length text residue near origin after drawing
    const residue = await page.evaluate(() => [...document.querySelectorAll('.sk-len-label, [data-sk-live-label], .sketch-live-dim')].filter((e) => e.offsetParent).map((e) => e.textContent))
    ok('#5 no leftover live length text after finishing the line', residue.length === 0, { residue })
    await page.shot('sk12-5-after-line')
  }
  if (want('residue')) {
    await fresh()
    await tool('sk_polyline'); await click(0, 0); await click(20, 0); await click(20, 15)
    await page.keyboard.press('Escape'); await page.waitForTimeout(800)
    const o = await at(10, 5)
    await page.screenshot({ path: '/workspace/sk12-out/residue-a.png', clip: { x: o[0] - 150, y: o[1] - 120, width: 300, height: 240 } })
    // 多段開放折線：外框高度讀數（舊版放喺起點左邊）唔應再出現；任何「15」讀數都要貼住豎段（x=20）
    const seg = await at(20, 7.5), org = await at(0, 0)
    const lbl = await page.evaluate(() => [...document.querySelectorAll('[data-dim]')].filter((e) => e.offsetParent && /15(\.0)?$/.test(e.getAttribute('data-dim') || '')).map((e) => { const r = e.getBoundingClientRect(); return { t: e.getAttribute('data-dim'), x: r.x + r.width / 2, y: r.y + r.height / 2 } }))
    const stray = lbl.filter((l) => Math.hypot(l.x - seg[0], l.y - seg[1]) > 60)
    ok('#5 no stray length text near the origin after finishing a polyline', stray.length === 0, { lbl, seg, org })
  }
  for (const choice of ['OK', 'Save']) if (want('newfile')) {
    await page.evaluate(() => { window.useApp.setState({ ...window.useApp.getInitialState(), introOpen: false, tour: null }, true); window.useApp.getState().setLang?.('zh-HK') })
    await page.evaluate(() => window.useApp.getState().applyFeatures([{ id: 'b1', type: 'extrude', profile: { kind: 'rect', a: [-10, -10], b: [10, 10] }, height: 5, operation: 'new' }], 'base'))
    await page.waitForTimeout(800)
    const navs = [], pops = [], dls = []
    const onNav = (f) => { if (f === page.mainFrame()) navs.push(f.url()) }, onPop = (p) => pops.push(p.url()), onDl = (d) => dls.push(d.suggestedFilename())
    page.on('framenavigated', onNav); page.context().on('page', onPop); page.on('download', onDl)
    await page.locator('button.tb-btn.tb-text', { hasText: '▾' }).first().click(); await page.waitForTimeout(300)
    await page.locator('.file-menu [role="menuitem"]').first().click(); await page.waitForTimeout(500)
    const dlg = await page.locator('[role="dialog"] button, [role="alertdialog"] button').evaluateAll((els) => els.map((e) => e.textContent))
    const want = choice === 'OK' ? /^(OK|確定|開新檔案|New file)$/ : /^(Save|儲存|保存)$/
    await page.locator('[role="dialog"] button, [role="alertdialog"] button', { hasText: want }).first().click().catch((e) => console.log('no btn', String(e)))
    await page.waitForTimeout(2500)
    page.off('framenavigated', onNav); page.context().off('page', onPop); page.off('download', onDl)
    ok(`#5 first 新建檔案 (${choice}) never navigates the tab / opens about:blank`, navs.length === 0 && pops.length === 0 && page.url().startsWith('http://127.0.0.1'), { dlg, navs, pops, dls, url: page.url(), feats: await page.evaluate(() => window.useApp.getState().features.length) })
  }
})
