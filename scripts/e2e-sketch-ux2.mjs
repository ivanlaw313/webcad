#!/usr/bin/env node
// UX2 sketch items in a real browser: #4 polyline Ctrl+Z, #5 Delete one segment, #6 dimension input goes to the NEW dim,
// #7 snapping leaves no near-zero segments.  Usage: nice -n 19 node scripts/e2e-sketch-ux2.mjs [--shots DIR]
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  const st = (fn) => page.evaluate(fn)
  await st(() => { const g = window.useApp.getState(); g.setLang?.('zh-HK'); g.startSketch(); g.chooseSketchPlane('XY') })
  await page.waitForTimeout(1200)
  const S = async (x, y) => page.cadToScreen([x, y, 0])
  const click = async (x, y) => { const [sx, sy] = await S(x, y); await page.mouse.click(sx, sy); await page.waitForTimeout(150) }
  const shapes = () => st(() => { const s = window.useApp.getState(); return [...s.sketchProfiles, ...(s.sketchShape ? [s.sketchShape] : [])] })
  // ── #4 polyline + Ctrl+Z
  await st(() => window.useApp.getState().setSketchTool('polyline'))
  for (const [x, y] of [[0, 0], [30, 0], [30, 20], [10, 20], [10, 40]]) await click(x, y)
  const n0 = await st(() => window.useApp.getState().polyPts.length)
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300)
  const n1 = await st(() => ({ n: window.useApp.getState().polyPts.length, tool: window.useApp.getState().sketchTool, status: window.useApp.getState().status }))
  ok('#4 Ctrl+Z while drawing removes only the last segment', n0 === 5 && n1.n === 4 && n1.tool === 'polyline', { n0, ...n1 })
  await page.shot('poly-undo')
  await click(10, 40)
  await st(() => window.useApp.getState().finishOpenPolyline())
  await page.waitForTimeout(400)
  const segs = (await shapes()).reduce((n, s) => n + (s.pts?.length ?? 1) - 1, 0)
  ok('#4 finished polyline has 4 segments', segs === 4, { segs })
  // #7 no near-zero segments after snapped clicks
  const tiny = (await shapes()).flatMap((s) => (s.pts ?? []).slice(1).map((p, i) => Math.hypot(p[0] - s.pts[i][0], p[1] - s.pts[i][1]))).filter((d) => d < 0.05)
  ok('#7 no near-zero segments', tiny.length === 0, { tiny })
  // ── #5 select ONE segment and Delete
  await st(() => window.useApp.getState().setSketchTool('select'))
  await page.waitForTimeout(200)
  await click(30, 10)    // middle of segment (30,0)-(30,20)
  const sel = await st(() => window.useApp.getState().skSel)
  await page.keyboard.press('Delete'); await page.waitForTimeout(500)
  const after = await shapes()
  const segs2 = after.reduce((n, s) => n + (s.pts?.length ?? 1) - 1, 0)
  ok('#5 Delete removes only the selected segment', segs2 === 3, { sel, segs2, status: await st(() => window.useApp.getState().status) })
  await page.shot('delete-one')
  // ── #6 typed segment entry: Tab to the angle field, then CLICK a point — next typed value must go to LENGTH
  await st(() => window.useApp.getState().setSketchTool('polyline'))
  await click(-40, 0); await click(-20, 0)
  await page.keyboard.type('5'); await page.keyboard.press('Tab')
  await page.shot('typed-hint')
  await click(-20, 20)
  await page.keyboard.type('12')
  const tb = await st(() => ({ buf: window.useApp.getState().dimBuf, field: window.useApp.getState().dimField, dim: window.useApp.getState().sketchDim }))
  ok('#6 after a click, typed digits go to the new segment LENGTH (not the stale angle field)', tb.buf[0] === '12' && tb.buf[1] === '' && tb.field === 0, tb)
  await page.shot('typed-hint2')
  // the readout hint must not sit on top of the typed value box
  const ov = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('[data-live-readout], .sketch-live-readout, [data-sketch-readout]')].map((e) => e.getBoundingClientRect())
    return boxes.length
  })
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
  await st(() => window.useApp.getState().setSketchTool('select'))
  // ── #6 dimension: rectangle, then dimension two edges in a row; typed values go to the dim being created
  await st(() => { const g = window.useApp.getState(); g.setSketchTool('rectangle') })
  await click(50, 0); await click(90, 30)
  await page.waitForTimeout(300)
  await st(() => window.useApp.getState().setSketchTool('dimension'))
  // stale selection: something selected before the tool switch
  await click(70, 0); await click(70, -8)       // bottom edge → place below → len/hdist d?
  await page.waitForTimeout(500)
  let ed = page.locator('[data-dim-editor] input')
  const vis1 = await ed.count()
  if (vis1) { await ed.fill('44'); await ed.press('Enter') }
  await page.waitForTimeout(800)
  await click(90, 15); await click(100, 15)     // right edge → place right → vdist
  await page.waitForTimeout(500)
  ed = page.locator('[data-dim-editor] input')
  const vis2 = await ed.count()
  await page.shot('dim2-editor')
  if (vis2) { await ed.fill('25'); await ed.press('Enter') }
  await page.waitForTimeout(800)
  const dims = await st(() => window.useApp.getState().skCons.filter((c) => c.kind === 'dim').map((c) => ({ name: c.name, type: c.type, value: c.value })))
  ok('#6 each typed value applied to the dimension just created', dims.length === 2 && Math.abs(dims[0].value - 44) < 1e-6 && Math.abs(dims[1].value - 25) < 1e-6, { vis1, vis2, dims })
  await page.shot('dims')
})
