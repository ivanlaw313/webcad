#!/usr/bin/env node
// UX2 #1/#2 real-browser proof: flanged cup (revolve half-section → shell 2, top open) → CHAMFER → click the flange's
// OUTER TOP edge → the right edge is picked (R40 circle, not the inner R38 / the seam), typing '0.5' slowly keeps
// the decimal point, 1 mm previews OK and commits.  Usage: nice -n 19 node scripts/e2e-chamfer-cup.mjs [--shots /tmp/cc]
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  await page.evaluate(async () => {
    const g = () => window.useApp.getState()
    g().setLang?.('zh-HK')
    const prof = { kind: 'poly', pts: [[0, 0], [30, 0], [30, 35], [40, 35], [40, 40], [0, 40]] }
    for (let t = 0; t < 200 && !(await g().applyFeatures([{ id: 'r', type: 'revolve', profile: prof, angle: 360, axis: 'Y', op: 'new' }, { id: 's', type: 'shell', thickness: 2, nears: [[10, 40, 0]], tangentChain: false, direction: 'inside' }], 'cup')); t++) await new Promise((r) => setTimeout(r, 250))
    g().requestFit?.()
  })
  await page.waitForTimeout(1500)
  // look at the open top (CAD +Y = three −Z) from above-ish, like the tester orbiting to the rim
  await page.evaluate(() => { const { camera, controls } = window.__three; controls.target.set(0, 0, -30); camera.position.set(110, 130, -230); camera.lookAt(0, 0, -30); controls.update() })
  await page.waitForTimeout(500)
  await page.evaluate(() => window.useApp.getState().runCommand('chamfer'))
  await page.waitForTimeout(400)
  ok('chamfer pick mode armed', (await page.evaluate(() => window.useApp.getState().edgeRoundPick)) === 'chamfer')
  // a point just inside the flange top face, 0.3 mm from the outer R40 rim, at 60° (well away from the seam)
  const a = Math.PI / 3, r = 39.7
  const [x, y] = await page.cadToScreen([r * Math.cos(a), 40, -r * Math.sin(a)])
  console.log("click at", x, y, await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [x, y]))
  await page.mouse.click(x, y)
  await page.waitForTimeout(1500)
  const pick = await page.evaluate(() => { const s = window.useApp.getState(); const ln = s.edgeRoundPickLines[0]; return { n: s.edgeRoundPicks.length, r: ln ? ln.map((q) => Math.hypot(q[0], q[2])) : null, y: ln ? ln.map((q) => q[1]) : null, status: s.status } })
  const onRim = pick.r && pick.r.every((v) => Math.abs(v - 40) < 0.05) && pick.y.every((v) => Math.abs(v - 40) < 0.05)
  ok('clicking near the flange outer top edge picks that R40 rim', pick.n === 1 && onRim, { n: pick.n, r0: pick.r?.[3], y0: pick.y?.[3], status: pick.status })
  await page.shot('picked')
  // #2：type 0.5 slowly into the distance field
  const fld = page.locator('input[aria-label^="倒角距離"]').first()
  await fld.click(); await fld.press('Control+a')
  await fld.pressSequentially('0.5', { delay: 250 })
  await page.waitForTimeout(600)
  const typed = { shown: await fld.inputValue(), size: await page.evaluate(() => window.useApp.getState().edgeRoundSize) }
  ok('typing 0.5 keeps the decimal point', typed.shown === '0.5' && typed.size === 0.5, typed)
  await fld.press('Control+a'); await fld.pressSequentially('1', { delay: 120 })
  await page.waitForFunction(() => { const s = window.useApp.getState(); return !s.roundPreviewBusy && (s.roundPreviewMesh || s.roundPreviewFail) }, null, { timeout: 20000 }).catch(() => {})
  const pv = await page.evaluate(() => { const s = window.useApp.getState(); return { ok: !!s.roundPreviewMesh, fail: s.roundPreviewFail, status: s.status } })
  ok('1 mm chamfer previews (no 「距離太大」)', pv.ok && !pv.fail, pv)
  await page.shot('preview')
  await page.evaluate(() => window.useApp.getState().commitEdgeRound())
  await page.waitForTimeout(2500)
  const done = await page.evaluate(() => { const s = window.useApp.getState(); return { types: s.features.map((f) => f.type), failed: s.failedFeatureIds, status: s.status } })
  ok('chamfer committed', done.types.includes('chamfer') && !done.failed.length, done)
})
