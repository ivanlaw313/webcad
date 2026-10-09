#!/usr/bin/env node
// SKETCH12 re-check (live index-Cbf7Xskc-): offset follows the cursor side (line / open polyline / rectangle, typed and dragged),
// Ø / R labels: single click selects, double-click opens the input; Extend with nothing ahead → dedicated message, no change.
// Usage: nice -n 19 npx vite build && nice -n 19 node scripts/e2e-sketch12-recheck.mjs [--shots DIR] [--only offset,labels,extend]
import { runE2E, arg } from './e2e-harness.mjs'
const only = (arg('--only', '') || '').split(',').filter(Boolean)
const want = (k) => !only.length || only.includes(String(k))

await runE2E(async (page, ok) => {
  const S = () => page.evaluate(() => { const s = window.useApp.getState(); return { tool: s.sketchTool, prof: s.sketchProfiles, sh: s.sketchShape, cons: s.skCons, st: s.status, undoN: s.sketchUndo.length, tp: s.toolPreview, offD: s.sketchOffsetD } })
  const all = (s) => [...s.prof, ...(s.sh ? [s.sh] : [])]
  const fresh = async () => {
    await page.evaluate(() => { const u = window.useApp; u.setState({ ...u.getInitialState(), introOpen: false, tour: null, appConfirm: async () => true }, true); u.getState().setLang?.('zh-HK'); u.getState().sketchOnDatumPlane('XY', 0) })
    await page.waitForTimeout(1500)
  }
  const at = (s, t) => page.cadToScreen([s, -t, 0])
  const move = async (s, t) => { const [x, y] = await at(s, t); await page.mouse.move(x, y, { steps: 8 }); await page.waitForTimeout(200) }
  const click = async (s, t) => { await move(s, t); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(350) }
  const tool = async (c) => { await page.locator(`button[data-cmd="${c}"]:visible`).first().click(); await page.waitForTimeout(250) }
  const esc2 = async () => { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(300) }
  const ys = (sh) => (sh.verts ?? sh.pts ?? (sh.type === 'rect' ? [sh.a, sh.b] : [])).map((p) => p[1])
  const meanY = (sh) => { const v = ys(sh); return v.reduce((a, b) => a + b, 0) / v.length }

  if (want('offset')) {
    const cases = [
      { name: 'single horizontal line', draw: async () => { await tool('sk_polyline'); await click(0, 0); await click(40, 0); await esc2() }, pick: [20, 0], refY: 0 },
      { name: 'open polyline', draw: async () => { await tool('sk_polyline'); await click(0, 0); await click(40, 0); await click(40, -20); await esc2() }, pick: [20, 0], refY: null },
      { name: 'rectangle', draw: async () => { await tool('sk_rect'); await click(0, -20); await click(40, 0); await page.keyboard.press('Escape') }, pick: [20, 0], refY: null },
    ]
    for (const c of cases) for (const typed of [null, 4]) for (const side of [1, -1]) {
      await fresh(); await c.draw()
      const base = all(await S()).length
      await tool('sk_offset'); await page.waitForTimeout(250)
      if (typed) { const inp = page.locator('.tp-num').first(); await inp.click(); await page.keyboard.press('Control+a'); await page.keyboard.type(String(typed)); await page.waitForTimeout(150) }
      // hover just off the line on the chosen side, then pick, drag 8 mm to that side, click
      await move(c.pick[0], c.pick[1] + side * 0.4)
      const hover = (await S()).tp
      await click(c.pick[0], c.pick[1] + side * 0.4)
      await move(c.pick[0], c.pick[1] + side * 8)
      const pv = (await S()).tp
      await page.shot(`rc-offset-${c.name.replace(/ /g, '_')}-${typed ? 'typed' : 'drag'}-${side > 0 ? 'above' : 'below'}`)
      await click(c.pick[0], c.pick[1] + side * 8); await page.waitForTimeout(600)
      const s = await S(); const made = all(s).slice(base).find((x) => x.offsetOf) ?? all(s).find((x) => x.offsetOf)
      // "above" = +t in sketch coordinates (screen up). The edge at y=0 must move toward the cursor side.
      const topEdgeY = (sh) => (c.name === 'open polyline' ? ys(sh)[0] : (() => { const v = ys(sh); return side > 0 ? Math.max(...v) : Math.min(...v) })())   // first vertex = the picked horizontal segment
      const want = typed ? typed : 8
      const okSide = !!made && (c.name === 'rectangle' ? (side > 0 ? Math.abs(Math.max(...ys(made)) - want) < 0.6 : Math.abs(Math.max(...ys(made)) + want) < 0.6) : Math.abs(topEdgeY(made) - side * want) < 0.6)
      const pvOk = !!pv && pv.length > 0 && (c.name === 'rectangle' ? (side > 0 ? Math.max(...ys(pv[0])) > 0.5 : Math.max(...ys(pv[0])) < -0.5) : Math.sign(meanY(pv[0]) - (c.name === 'open polyline' ? -10 * 0 : 0)) === side || (c.name === 'open polyline' && Math.sign(topEdgeY(pv[0])) === side))
      const hvOk = !hover || hover.length === 0 || (c.name === 'rectangle' ? (side > 0 ? Math.max(...ys(hover[0])) > 0 : Math.max(...ys(hover[0])) < 0) : (Math.sign(ys(hover[0])[0]) === side))
      ok(`Offset ${c.name}, ${typed ? `typed ${typed}` : 'dragged 8'}, cursor ${side > 0 ? 'ABOVE' : 'BELOW'} → hover, preview and result on the cursor side`, okSide && pvOk && hvOk, { d: made?.offsetOf?.d, ys: made && ys(made).map((v) => +v.toFixed(2)), pv: pv && ys(pv[0]).slice(0, 4).map((v) => +v.toFixed(2)), hover: hover && ys(hover[0]).slice(0, 4).map((v) => +v.toFixed(2)), st: s.st })
    }
    // offset dimension editing still works (9 → 20)
    await fresh(); await tool('sk_polyline'); await click(0, 0); await click(40, 0); await esc2()
    await tool('sk_offset'); const inp = page.locator('.tp-num').first(); await inp.click(); await page.keyboard.press('Control+a'); await page.keyboard.type('9')
    await move(20, 0.4); await click(20, 0.4); await move(20, 8); await click(20, 8); await page.waitForTimeout(500)
    await page.keyboard.press('Escape'); await page.evaluate(() => window.useApp.getState().setSketchTool('select')); await page.waitForTimeout(300)
    const lab = page.locator('[data-dim]').filter({ hasText: /⇥9/ }).first()
    await lab.dblclick(); await page.waitForTimeout(400)
    const ed = page.locator('[data-dim-editor] input').first()
    if (await ed.count()) { await ed.click(); await page.keyboard.press('Control+a'); await page.keyboard.type('20'); await page.keyboard.press('Enter'); await page.waitForTimeout(800) }
    const off = all(await S()).find((x) => x.offsetOf)
    ok('Offset dimension edit still works (⇥9 → 20, same side)', !!off && Math.abs(off.offsetOf.d - 20) < 1e-6 && Math.abs(Math.max(...ys(off)) - 20) < 0.01, { d: off?.offsetOf?.d, ys: off && ys(off) })
  }

  if (want('labels')) {
    await fresh()
    await tool('sk_circle'); await click(0, 0); await click(10, 0); await page.keyboard.press('Escape')
    await tool('sk_arc'); await click(30, 0); await click(50, 0); await click(40, 6); await page.keyboard.press('Escape')
    await page.evaluate(() => window.useApp.getState().setSketchTool('select')); await page.waitForTimeout(500)
    for (const [name, re, newV, check] of [['circle Ø', /Ø/, '26', (s) => all(s).some((x) => x.type === 'circle' && Math.abs(x.r - 13) < 1e-3)], ['arc R', /^·?R/, '12', (s) => all(s).some((x) => x.arc && (() => { const { a, b, m } = x.arc; const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]); const A = d(a, b), B = d(b, m), C = d(a, m); const s2 = (A + B + C) / 2; const area = Math.sqrt(Math.max(0, s2 * (s2 - A) * (s2 - B) * (s2 - C))); return Math.abs(A * B * C / (4 * area) - 12) < 1e-2 })())]]) {
      const lab = page.locator('[data-dim]').filter({ hasText: re }).first()
      const n = await lab.count()
      if (!n) { ok(`${name} label exists`, false, { labels: await page.evaluate(() => [...document.querySelectorAll('[data-dim]')].map((e) => e.textContent)) }); continue }
      await lab.click(); await page.waitForTimeout(400)
      const afterSingle = await page.locator('[data-dim-editor] input').count()
      const sel = await page.evaluate(() => { const s = window.useApp.getState(); return { skSel: s.skSel, selCon: s.skSelCon } })
      await page.keyboard.press('Escape'); await page.waitForTimeout(200)
      await lab.dblclick(); await page.waitForTimeout(400)
      const ed = page.locator('[data-dim-editor] input').first(); const afterDouble = await ed.count()
      await page.shot(`rc-label-${name.replace(/ /g, '_')}`)
      if (afterDouble) { await ed.click(); await page.keyboard.press('Control+a'); await page.keyboard.type(newV); await page.keyboard.press('Enter'); await page.waitForTimeout(800) }
      const s = await S()
      ok(`${name} label: single click selects (no input), double-click opens the value input and applies ${newV}`, afterSingle === 0 && (sel.skSel.length > 0 || !!sel.selCon) && afterDouble > 0 && check(s), { afterSingle, sel, afterDouble, st: s.st })
    }
  }

  if (want('extend')) {
    await fresh()
    await tool('sk_polyline'); await click(0, 0); await click(20, 0); await esc2()
    await tool('sk_polyline'); await click(40, -20); await click(40, 20); await esc2()
    const before = await S()
    await tool('sk_extend'); await click(2, 0); await page.waitForTimeout(600)   // left end: nothing to the left
    const s = await S()
    ok('Extend toward a direction with nothing to hit → 「延伸：此方向沒有可延伸至的曲線」, no change, no undo step', s.st === '延伸：此方向沒有可延伸至的曲線' && JSON.stringify(all(s)) === JSON.stringify(all(before)) && s.undoN === before.undoN, { st: s.st, undo: [before.undoN, s.undoN] })
    await click(18, 0); await page.waitForTimeout(600)
    const ln = all(await S()).find((x) => x.verts?.length === 2 && Math.abs(x.verts[0][1]) < 0.5 && Math.abs(x.verts[1][1]) < 0.5)
    ok('Extend toward the crossing line still works', !!ln && Math.abs(Math.max(ln.verts[0][0], ln.verts[1][0]) - 40) < 0.05, { verts: ln?.verts })
  }
})
