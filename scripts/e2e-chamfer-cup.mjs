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
  // tester path: the preview had FAILED (distance too big) and then they retyped 0.5
  await fld.press('Control+a'); await fld.pressSequentially('30', { delay: 120 })
  await page.waitForFunction(() => { const s = window.useApp.getState(); return !s.roundPreviewBusy && (s.roundPreviewMesh || s.roundPreviewFail) }, null, { timeout: 20000 }).catch(() => {})
  const failSt = await page.evaluate(() => { const s = window.useApp.getState(); return { fail: s.roundPreviewFail, status: s.status } })
  await page.waitForTimeout(1500)
  const failSt2 = await page.evaluate(() => window.useApp.getState().status)
  ok('30 mm fails with a Traditional cause', failSt.fail && /太大|倒唔到/.test(failSt2), { ...failSt, later: failSt2 })
  await fld.press('Control+a'); await fld.pressSequentially('0.5', { delay: 250 })
  await page.waitForTimeout(600)
  const typed2 = { shown: await fld.inputValue(), size: await page.evaluate(() => window.useApp.getState().edgeRoundSize) }
  ok('after a failed preview, typing 0.5 keeps the decimal point', typed2.shown === '0.5' && typed2.size === 0.5, typed2)
  await fld.press('Control+a'); await fld.pressSequentially('0.5', { delay: 0 })
  const typed3 = { shown: await fld.inputValue(), size: await page.evaluate(() => window.useApp.getState().edgeRoundSize) }
  ok('fast typing 0.5 keeps the decimal point', typed3.shown === '0.5' && typed3.size === 0.5, typed3)
  // HK Chinese IME in Chinese mode turns '.' into '。'
  await fld.press('Control+a'); await fld.pressSequentially('0', { delay: 120 }); await page.keyboard.insertText('。'); await fld.pressSequentially('5', { delay: 120 })
  await page.waitForTimeout(400)
  const ime = { size: await page.evaluate(() => window.useApp.getState().edgeRoundSize), invalid: await fld.getAttribute('aria-invalid') }
  ok('IME full stop 0。5 is taken as 0.5', ime.size === 0.5 && !ime.invalid, ime)
  await fld.press('Control+a'); await fld.pressSequentially('1', { delay: 120 })
  await page.waitForFunction(() => { const s = window.useApp.getState(); return !s.roundPreviewBusy && (s.roundPreviewMesh || s.roundPreviewFail) }, null, { timeout: 20000 }).catch(() => {})
  const pv = await page.evaluate(() => { const s = window.useApp.getState(); return { ok: !!s.roundPreviewMesh, fail: s.roundPreviewFail, status: s.status } })
  ok('1 mm chamfer previews (no 「距離太大」)', pv.ok && !pv.fail, pv)
  await page.shot('preview')
  await page.evaluate(() => window.useApp.getState().commitEdgeRound())
  await page.waitForTimeout(2500)
  const done = await page.evaluate(() => { const s = window.useApp.getState(); return { types: s.features.map((f) => f.type), failed: s.failedFeatureIds, status: s.status } })
  ok('chamfer committed', done.types.includes('chamfer') && !done.failed.length, done)

  // #2 cont.：timeline edit dialog (FeatNum) and the fillet radius field (min 0.5) must keep '0.5' too
  const typeSlow = async (loc, txt) => { await loc.click(); await loc.press('Control+a'); await loc.pressSequentially(txt, { delay: 250 }); await page.waitForTimeout(700); return loc.inputValue() }
  const chId = await page.evaluate(() => window.useApp.getState().features.find((f) => f.type === 'chamfer').id)
  await page.evaluate((id) => window.useApp.getState().openFeatDlgForEdit(id), chId)
  await page.waitForTimeout(800)
  const editFld = page.locator('label', { hasText: /^距離/ }).locator('input').first()
  const ev = await typeSlow(editFld, '0.5')
  const ep = await page.evaluate(() => window.useApp.getState().featDlg?.params?.distance)
  ok('edit dialog: typing 0.5 keeps the decimal point', ev === '0.5' && +ep === 0.5, { shown: ev, param: ep })
  await page.shot('edit05')
  await page.evaluate(() => window.useApp.getState().closeFeatDlg?.() ?? window.useApp.setState({ featDlg: null }))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  await page.evaluate(() => window.useApp.getState().runCommand('fillet'))
  await page.waitForTimeout(400)
  const [fx, fy] = await page.cadToScreen([39.7 * Math.cos(2.2), 40, -39.7 * Math.sin(2.2)])
  await page.mouse.click(fx, fy); await page.waitForTimeout(1200)
  console.log('fillet state', JSON.stringify(await page.evaluate(() => { const s = window.useApp.getState(); return { p: s.edgeRoundPick, n: s.edgeRoundPicks.length, dlg: s.featDlg?.kind, st: s.status } })))
  await page.shot('fillet')
  const fv = await typeSlow(page.locator('input[aria-label="半徑組 1 半徑"]').first(), '0.5')
  const fs = await page.evaluate(() => window.useApp.getState().edgeRoundSize)
  ok('fillet: typing 0.5 keeps the decimal point', fv === '0.5' && fs === 0.5, { shown: fv, size: fs })
  await page.keyboard.press('Escape')
})
