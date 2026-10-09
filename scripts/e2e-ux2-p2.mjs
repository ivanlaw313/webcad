#!/usr/bin/env node
// UX2 P2 real-browser proof (#8 profile count + revolve axis highlight/hint, and later items).
// Usage: nice -n 19 node scripts/e2e-ux2-p2.mjs [--shots DIR]
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  const st = (fn, a) => page.evaluate(fn, a)
  // ── #8 sketch: one closed rectangle + one stray open line → tree row says ·1輪廓 ·1開放線
  await st(() => { const g = window.useApp.getState(); g.setLang?.('zh-HK'); g.startSketch(); g.chooseSketchPlane('XY') })
  await page.waitForTimeout(1200)
  const click = async (x, y) => { const [sx, sy] = await page.cadToScreen([x, y, 0]); await page.mouse.click(sx, sy); await page.waitForTimeout(150) }
  await st(() => window.useApp.getState().setSketchTool('rectangle'))
  await click(10, 0); await click(30, 25)
  await st(() => window.useApp.getState().setSketchTool('line'))
  await click(-30, 5); await click(-30, 30)
  await page.keyboard.press('Escape'); await page.waitForTimeout(200)
  await st(() => window.useApp.getState().finishSketch()); await page.waitForTimeout(1200)
  const row = await st(() => [...document.querySelectorAll('[data-profile-count]')].map((e) => ({ n: e.getAttribute('data-profile-count'), t: e.closest('[title]')?.getAttribute('title') ?? '', txt: e.parentElement?.textContent })))
  ok('#8 sketch row shows the closed-profile count', row.length >= 1 && row.some((r) => r.n === '1' && /1輪廓/.test(r.txt) && /開放線/.test(r.txt)), row)
  await page.shot('tree-profiles')
  // ── #8 revolve: default axis Y is drawn (orange dashed line) and explained in the dialog
  await st(async () => { await window.useApp.getState().runCommand('revolve') })
  await page.waitForTimeout(1500)
  let dlg = await st(() => window.useApp.getState().featDlg?.kind)
  if (dlg !== 'revolve') {   // several sketches/profiles → pick the rectangle profile
    await st(() => { const s = window.useApp.getState(); console.log(s.status) })
  }
  const info = await st(() => {
    const s = window.useApp.getState()
    const hint = document.querySelector('[data-testid="revolve-axis-hint"]')?.textContent ?? null
    let line = null
    window.__three.scene.traverse((o) => { if (o.userData?.revolveAxis && o.visible) { const p = o.geometry?.attributes?.instanceStart, q = o.geometry?.attributes?.instanceEnd; line = p ? [p.getX(0), p.getY(0), p.getZ(0), q.getX(q.count - 1), q.getY(q.count - 1), q.getZ(q.count - 1)].map((v) => +v.toFixed(2)) : 'nogeom' } })
    return { kind: s.featDlg?.kind, status: s.status, hint, line }
  })
  const axisAlongY = Array.isArray(info.line) && Math.abs(info.line[0] - info.line[3]) < 1e-6 && Math.abs(info.line[1] - info.line[4]) < 1e-6 && Math.abs(info.line[2] - info.line[5]) > 20
  ok('#8 revolve dialog explains the default world-Y axis', info.kind === 'revolve' && /世界 Y 軸/.test(info.hint ?? '') && /橙色虛線/.test(info.hint ?? ''), info)
  ok('#8 the active revolve axis is highlighted in the canvas (line along CAD Y = three −Z, spanning the profile)', axisAlongY, info.line)
  await page.shot('revolve-axis')
  await st(() => window.useApp.getState().setFeatParam('axis', 'X')); await page.waitForTimeout(500)
  const lx = await st(() => { let l = null; window.__three.scene.traverse((o) => { if (o.userData?.revolveAxis) { const p = o.geometry.attributes.instanceStart, q = o.geometry.attributes.instanceEnd; l = [p.getX(0), p.getY(0), p.getZ(0), q.getX(q.count - 1), q.getY(q.count - 1), q.getZ(q.count - 1)] } }); return { l, hint: document.querySelector('[data-testid="revolve-axis-hint"]')?.textContent } })
  ok('#8 switching the axis to X moves the highlight and hint', lx.l && Math.abs(lx.l[1] - lx.l[4]) < 1e-6 && Math.abs(lx.l[0] - lx.l[3]) > 20 && /世界 X 軸/.test(lx.hint), lx)
  await page.shot('revolve-axis-x')
  await st(() => window.useApp.getState().cancelFeatDlg())
})
