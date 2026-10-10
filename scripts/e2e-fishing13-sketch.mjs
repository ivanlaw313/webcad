#!/usr/bin/env node
// FISHING13 sketch P2 (real browser): (1) rectangle Tab = width→height field, commit only on Enter, no digit leak;
// (2) tool armed synchronously — fast clicks right after picking the tool are not swallowed;
// (3) sketch fillet on the interior corner of an OPEN 2-segment polyline.
// Usage: nice -n 19 npx vite build && flock /tmp/webcad-e2e.lock nice -n 19 node scripts/e2e-fishing13-sketch.mjs [--shots DIR] [--only tab,esc,fast,fillet]
import { runE2E, arg } from './e2e-harness.mjs'
const only = (arg('--only', '') || '').split(',').filter(Boolean)
const want = (k) => !only.length || only.includes(String(k))

await runE2E(async (page, ok) => {
  const S = () => page.evaluate(() => { const s = window.useApp.getState(); return { tool: s.sketchTool, prof: s.sketchProfiles, sh: s.sketchShape, start: s.sketchStart, poly: s.polyPts, buf: s.dimBuf, field: s.dimField, cons: s.skCons, st: s.status } })
  const all = (s) => [...s.prof, ...(s.sh ? [s.sh] : [])]
  const fresh = async () => {
    await page.evaluate(() => { const u = window.useApp; u.setState({ ...u.getInitialState(), introOpen: false, tour: null, appConfirm: async () => true }, true); u.getState().setLang?.('zh-HK'); u.getState().sketchOnDatumPlane('XY', 0) })
    await page.waitForTimeout(1500)
  }
  const at = (s, t) => page.cadToScreen([s, -t, 0])
  const move = async (s, t, steps = 8) => { const [x, y] = await at(s, t); await page.mouse.move(x, y, { steps }); await page.waitForTimeout(150) }
  const click = async (s, t) => { await move(s, t); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(300) }
  const toolBtn = (c) => page.locator(`button[data-cmd="${c}"]:visible`).first()

  if (want('tab')) {
    await fresh()
    await toolBtn('sk_rect').click(); await page.waitForTimeout(250)
    await click(0, 0); await move(30, 18)
    await page.keyboard.type('40'); await page.keyboard.press('Tab'); await page.waitForTimeout(200)
    const a = await S()
    ok('Tab after width moves to the height field without committing', !a.sh && a.prof.length === 0 && !!a.start && a.field === 1 && a.buf[0] === '40', { sh: a.sh, start: a.start, field: a.field, buf: a.buf, st: a.st })
    await move(34, 12)
    const a2 = await S()
    ok('moving the mouse after Tab still does not commit', !a2.sh && a2.prof.length === 0 && !!a2.start, { sh: a2.sh })
    await page.keyboard.type('25'); await page.keyboard.press('Enter'); await page.waitForTimeout(300)
    const b = await S(); const r = all(b).find((x) => x.type === 'rect')
    const W = r ? Math.abs(r.b[0] - r.a[0]) : 0, H = r ? Math.abs(r.b[1] - r.a[1]) : 0
    ok('Enter commits the rectangle with typed 40 × 25', !!r && Math.abs(W - 40) < 1e-6 && Math.abs(H - 25) < 1e-6, { W, H, st: b.st })
    await page.keyboard.type('12'); await page.waitForTimeout(200)
    const c = await S()
    ok('digits typed right after the commit do not leak into the next start X', !c.start && !c.buf[0] && !c.buf[1], { buf: c.buf, start: c.start, st: c.st })
    await page.keyboard.press('Escape'); await page.waitForTimeout(150)
    // same flow through the visible sketch-bar 「尺寸」 field (where Tab used to blur → commit with mouse height)
    await fresh()
    await toolBtn('sk_rect').click(); await page.waitForTimeout(250)
    await click(0, 0); await move(30, 18)
    const inp = page.locator('[data-testid="sketch-precise-dim"]')
    await inp.click(); await page.keyboard.type('40'); await page.keyboard.press('Tab'); await page.waitForTimeout(200)
    const d = await S()
    ok('sketch-bar field: Tab after width moves to height, no commit', !d.sh && d.prof.length === 0 && !!d.start && d.field === 1 && d.buf[0] === '40', { sh: d.sh, field: d.field, buf: d.buf, st: d.st, ph: await inp.getAttribute('placeholder') })
    await page.keyboard.type('25'); await page.keyboard.press('Enter'); await page.waitForTimeout(300)
    const e2 = await S(); const r2 = all(e2).find((x) => x.type === 'rect')
    ok('sketch-bar field: Enter commits 40 × 25', !!r2 && Math.abs(Math.abs(r2.b[0] - r2.a[0]) - 40) < 1e-6 && Math.abs(Math.abs(r2.b[1] - r2.a[1]) - 25) < 1e-6, { r2, st: e2.st })
    await page.keyboard.press('Escape')
  }

  if (want('esc')) {
    await fresh()
    await toolBtn('sk_rect').click(); await page.waitForTimeout(250)
    await click(0, 0); await move(20, 10); await page.keyboard.type('4'); await page.waitForTimeout(100)
    await page.keyboard.press('Escape'); await page.waitForTimeout(150)
    const a = await S()
    await page.keyboard.press('Escape'); await page.waitForTimeout(150)
    const b = await S()
    ok('typed rectangle: Esc #1 cancels the in-progress rect, Esc #2 leaves the tool', !a.start && a.tool === 'rectangle' && b.tool === 'select', { a: [a.start, a.tool, a.st], b: [b.tool, b.st] })
  }

  if (want('fast')) {
    for (const [cmd, kind] of [['sk_rect', 'rect'], ['sk_circle', 'circle']]) {
      await fresh()
      const p1 = await at(-10, -10), p2 = await at(15, 12)
      const btn = await toolBtn(cmd).boundingBox()
      // real user: click the ribbon button, then immediately two canvas clicks, no hover pauses
      await page.mouse.click(btn.x + btn.width / 2, btn.y + btn.height / 2)
      await page.mouse.move(p1[0], p1[1]); await page.mouse.down(); await page.mouse.up()
      await page.mouse.move(p2[0], p2[1]); await page.mouse.down(); await page.mouse.up()
      await page.waitForTimeout(500)
      const s = await S()
      ok(`fast clicks right after picking ${cmd} create the ${kind}`, all(s).some((x) => x.type === kind), { tool: s.tool, shapes: all(s).map((x) => x.type), start: s.start, st: s.st })
    }
    // fast sloppy clicks: the hand is still moving while the button is down (~10px, ~40ms) — must stay 2 separate points
    await fresh()
    {
      const btn = await toolBtn('sk_rect').boundingBox()
      await page.mouse.click(btn.x + btn.width / 2, btn.y + btn.height / 2)
      const p1 = await at(-10, -10), p2 = await at(15, 12)
      await page.mouse.move(p1[0], p1[1]); await page.mouse.down(); await page.mouse.move(p1[0] + 10, p1[1] + 3); await page.mouse.up()
      await page.waitForTimeout(60)
      const mid = await S()
      await page.mouse.move(p2[0], p2[1]); await page.mouse.down(); await page.mouse.move(p2[0] + 9, p2[1] - 4); await page.mouse.up()
      await page.waitForTimeout(400)
      const s = await S(); const r = all(s).find((x) => x.type === 'rect')
      const W = r ? Math.abs(r.b[0] - r.a[0]) : 0
      ok('sloppy fast clicks (moving ~10px while pressed) give one rect between the two clicks, not a tiny rect', !!mid.start && all(mid).length === 0 && all(s).length === 1 && W > 20, { mid: [mid.start, all(mid).length], W, n: all(s).length, st: s.st })
    }
    await fresh()
    const q = [await at(0, 0), await at(20, 0), await at(20, 15)]
    const btn = await toolBtn('sk_polyline').boundingBox()
    await page.mouse.click(btn.x + btn.width / 2, btn.y + btn.height / 2)
    for (const p of q) { await page.mouse.move(p[0], p[1]); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(30) }
    await page.waitForTimeout(300)
    const s = await S()
    ok('fast polyline clicks right after picking the tool register all 3 points', s.poly.length === 3, { poly: s.poly, st: s.st })
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
  }

  if (want('fillet')) {
    await fresh()
    await toolBtn('sk_polyline').click(); await page.waitForTimeout(250)
    await click(0, 0); await click(30, 0); await click(30, 20)
    await page.keyboard.press('Escape'); await page.waitForTimeout(400)
    const pre = await S()
    const path = all(pre).find((x) => x.type === 'poly' && x.open)
    ok('open 2-segment polyline committed', !!path && (path.verts ?? path.pts).length === 3, { shapes: all(pre).map((x) => ({ t: x.type, open: x.open, n: (x.verts ?? x.pts)?.length })), st: pre.st })
    await page.evaluate(() => window.useApp.getState().setSketchTool('cfillet')); await page.waitForTimeout(200)
    await page.keyboard.type('5'); await page.waitForTimeout(150)
    await click(30, 0); await page.waitForTimeout(300)
    const mid = await S()
    await click(30, 0); await page.waitForTimeout(900)
    const s = await S()
    const f = all(s).find((x) => x.type === 'poly' && x.open)
    const v = f?.verts ?? [], bl = f?.bulges ?? []
    const arc = bl.findIndex((b) => Math.abs(b) > 1e-6)
    const okGeom = v.length === 4 && arc === 1 && Math.abs(v[1][0] - 25) < 1e-3 && Math.abs(v[2][1] - 5) < 1e-3 && Math.abs(v[0][0]) < 1e-6 && Math.abs(v[3][1] - 20) < 1e-3
    ok('fillet R5 on the open polyline corner → arc at the shared vertex, path stays open', !!f && f.open && okGeom && !/沒有角/.test(mid.st + s.st), { verts: v, bulges: bl, mid: mid.st, st: s.st })
    await page.keyboard.press('Control+z'); await page.waitForTimeout(500)
    const u = await S(); const uf = all(u).find((x) => x.type === 'poly' && x.open)
    ok('Ctrl+Z restores the sharp open corner', (uf?.verts ?? uf?.pts ?? []).length === 3, { verts: uf?.verts })
    // end vertex of an open path is not a corner
    await click(0, 0); await page.waitForTimeout(300)
    const e = await S()
    ok('end point of an open path is refused with a Formal TC hint', !e.sizing && /端點|頂點/.test(e.st), { st: e.st })
  }
})
