#!/usr/bin/env node
// SKETCH12 b4 (tester WORKFLOW on Cbf7Xskc): 一鍵自動約束 infers H/V + coincident on a hand-drawn polyline; point-to-point
// dimension orientation follows placement and placing does not move geometry; Ø / centre-distance dims open the input on creation;
// dimension creation + typed value = one undo step; new extrude defaults to 10 mm.
// Usage: nice -n 19 npx vite build && flock /tmp/webcad-e2e.lock nice -n 19 node scripts/e2e-sketch12-b4.mjs [--shots DIR] [--only auto,p2p,input,undo,extrude]
import { runE2E, arg } from './e2e-harness.mjs'
const only = (arg('--only', '') || '').split(',').filter(Boolean)
const want = (k) => !only.length || only.includes(String(k))

await runE2E(async (page, ok) => {
  const S = () => page.evaluate(() => { const s = window.useApp.getState(); return { tool: s.sketchTool, prof: s.sketchProfiles, sh: s.sketchShape, cons: s.skCons, st: s.status, undoN: s.sketchUndo.length, conflict: s.skConflict } })
  const all = (s) => [...s.prof, ...(s.sh ? [s.sh] : [])]
  const fresh = async () => {
    await page.evaluate(() => { const u = window.useApp; u.setState({ ...u.getInitialState(), introOpen: false, tour: null, appConfirm: async () => true }, true); u.getState().setLang?.('zh-HK'); u.getState().sketchOnDatumPlane('XY', 0) })
    await page.waitForTimeout(1500)
  }
  const at = (s, t) => page.cadToScreen([s, -t, 0])
  const move = async (s, t) => { const [x, y] = await at(s, t); await page.mouse.move(x, y, { steps: 8 }); await page.waitForTimeout(200) }
  const click = async (s, t) => { await move(s, t); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(400) }
  const tool = async (c) => { await page.locator(`button[data-cmd="${c}"]:visible`).first().click(); await page.waitForTimeout(250) }
  const esc2 = async () => { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(300) }
  const editor = () => page.locator('[data-dim-editor] input')
  const noSnap = async (on) => page.evaluate((on) => { const s = window.useApp.getState(); s.setAutoConstrain?.(!on); if ('sketchSnapOn' in s) window.useApp.setState({ sketchSnapOn: !on }) }, on)

  if (want('auto')) {
    await fresh(); await noSnap(true)
    await page.evaluate(() => window.useApp.setState({ gridSnap: false, snapGrid: false, sketchGridSnap: false }))
    await tool('sk_polyline'); await click(0.4, -0.3); await click(30, 1.2); await click(31.1, 20.5); await click(5, 21.6); await esc2()
    const b = await S()
    await page.evaluate(() => window.useApp.getState().setSketchTool('select')); await page.waitForTimeout(200)
    await page.locator('button:visible', { hasText: '一鍵自動約束' }).first().click(); await page.waitForTimeout(1500)
    await page.shot('b4-autoconstrain')
    const s = await S(); const n = (t) => s.cons.filter((c) => c.type === t).length
    const v = all(s)[0]?.verts
    ok('一鍵自動約束 on a hand-drawn polyline adds H/V + origin coincident and squares it up', n('h') >= 2 && n('v') >= 1 && s.cons.some((c) => c.type === 'coincident') && !s.conflict && v && Math.abs(v[0][1] - v[1][1]) < 1e-3 && Math.abs(v[1][0] - v[2][0]) < 1e-3, { before: all(b)[0]?.verts, consBefore: b.cons.map((c) => c.type), cons: s.cons.map((c) => c.type), st: s.st, v })
    await noSnap(false)
  }

  if (want('p2p')) {
    // two separate points: diagonal pair (0,0)-(30,10) drawn as points
    for (const [name, place, want] of [['above, close to the geometry', [15, 7], 'hdist'], ['beside, close', [32, 5], 'vdist'], ['perpendicular off the diagonal (below)', [18, -4], 'dist'], ['far above', [15, 25], 'hdist'], ['far right', [50, 5], 'vdist']]) {
      await fresh()
      await page.evaluate(() => window.useApp.setState({ sketchProfiles: [{ type: 'poly', pts: [[0, 0], [30, 10]], verts: [[0, 0], [30, 10]], bulges: [0], open: true }] }))
      await page.waitForTimeout(400)
      await tool('sk_dim'); await click(0, 0); await click(30, 10)
      await move(place[0], place[1]); await page.shot(`b4-p2p-hover-${want}`)
      const before = (await S()).prof[0].verts
      await click(place[0], place[1]); await page.waitForTimeout(700)
      const s = await S(); const d = s.cons.find((c) => c.kind === 'dim'); const after = s.prof[0].verts
      const moved = Math.max(...after.flat().map((x, i) => Math.abs(x - before.flat()[i])))
      const hasEd = await editor().count()
      ok(`point-to-point dim placed ${name} → ${want}, geometry unmoved, input open`, d?.type === want && moved < 1e-6 && hasEd > 0, { type: d?.type, value: d?.value, moved, hasEd, st: s.st })
      await page.keyboard.press('Escape'); await page.waitForTimeout(200)
    }
  }

  if (want('input')) {
    await fresh()
    await tool('sk_circle'); await click(0, 0); await click(10, 0); await page.keyboard.press('Escape')
    await tool('sk_circle'); await click(40, 0); await click(45, 0); await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    await tool('sk_dim'); await click(0, 10); await page.waitForTimeout(500)
    let hasEd = await editor().count(); await page.shot('b4-dia-input')
    if (hasEd) { await editor().first().fill('30'); await page.keyboard.press('Enter'); await page.waitForTimeout(900) }
    let s = await S()
    ok('Ø dimension opens the value input on creation (like lines) and applies 30', hasEd > 0 && all(s).some((x) => x.type === 'circle' && Math.abs(x.r - 15) < 1e-3), { hasEd, st: s.st, cons: s.cons.map((c) => c.type) })
    // dimension tool: a single click on a Ø label (driving or the circle's own) opens the input straight away
    await page.waitForTimeout(200); if ((await S()).tool !== 'dimension') await tool('sk_dim')
    const softLab = page.locator('[data-dim]').filter({ hasText: /Ø/ }).last()
    let labEd = 0
    if (await softLab.count()) { await softLab.click(); await page.waitForTimeout(500); labEd = await editor().count(); await page.keyboard.press('Escape'); await page.waitForTimeout(300); if ((await S()).tool !== 'dimension') await tool('sk_dim') }
    ok('dimension tool: single click on a Ø label opens the value input', labEd > 0, { labEd, labels: await page.evaluate(() => [...document.querySelectorAll('[data-dim]')].map((e) => e.textContent)) })
    await click(0, 0); await click(40, 0); await page.waitForTimeout(500)
    hasEd = await editor().count(); await page.shot('b4-centre-dist-input')
    if (hasEd) { await editor().first().fill('50'); await page.keyboard.press('Enter'); await page.waitForTimeout(900) }
    s = await S()
    const cs = all(s).filter((x) => x.type === 'circle')
    ok('centre-to-centre distance opens the value input on creation and applies 50', hasEd > 0 && cs.length === 2 && Math.abs(Math.hypot(cs[1].c[0] - cs[0].c[0], cs[1].c[1] - cs[0].c[1]) - 50) < 1e-3, { hasEd, st: s.st, cs: cs.map((c) => c.c) })
  }

  if (want('undo')) {
    await fresh()
    await tool('sk_polyline'); await click(0, 0); await click(30, 0); await esc2()
    const b = await S()
    await tool('sk_dim'); await click(8, 0); await click(8, 6); await page.waitForTimeout(500)
    const hasEd = await editor().count()
    if (hasEd) { await editor().first().fill('45'); await page.keyboard.press('Enter'); await page.waitForTimeout(900) }
    const s1 = await S()
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    await page.keyboard.press('Control+z'); await page.waitForTimeout(800)
    const s2 = await S()
    const len = (s) => { const v = all(s)[0]?.verts; return v ? Math.hypot(v[1][0] - v[0][0], v[1][1] - v[0][1]) : NaN }
    ok('dimension created + value typed → first Ctrl+Z removes the whole dimension and restores the length', hasEd > 0 && Math.abs(len(s1) - 45) < 1e-3 && s2.cons.filter((c) => c.kind === 'dim').length === 0 && Math.abs(len(s2) - 30) < 1e-3 && s2.undoN === b.undoN, { hasEd, l1: len(s1), l2: len(s2), dims: s2.cons.length, undo: [b.undoN, s1.undoN, s2.undoN], st: s2.st, n2: all(s2).length, mode: await page.evaluate(() => window.useApp.getState().mode) })
  }

  if (want('extrude')) {
    await fresh()
    await tool('sk_rect'); await click(0, 0); await click(20, 10); await page.keyboard.press('Escape')
    await page.evaluate(() => window.useApp.getState().finishSketch?.()); await page.waitForTimeout(800)
    await page.locator('button[data-cmd="extrude"]:visible').first().click().catch(() => {}); await page.waitForTimeout(1200)
    await page.shot('b4-extrude-default')
    const v = await page.evaluate(() => { const s = window.useApp.getState(); return { d: s.extrudeHeight, dlg: s.extrudeDlgOpen, st: s.status } })
    ok('new extrude defaults to 10 mm', Number(v.d) === 10, v)
  }
})
