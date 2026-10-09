#!/usr/bin/env node
// UX1 #2 real-browser proof: after a parameter change that breaks a fillet (rebuild warning / failure), File ▸ New
// must leave NO 「重建警告」 pill, no failed-feature marks, and an EMPTY scene (no grey placeholder / leftover body).
// NOT part of the default test run. Usage (repo root, after `npx vite build`):
//   nice -n 19 node scripts/e2e-new-file.mjs [--port 4317] [--shots /tmp/nf]
import { runE2E } from './e2e-harness.mjs'

const sceneBodies = (page) => page.evaluate(() => {
  const out = []
  window.__three.scene.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry) return
    let p = o, vis = true; while (p) { if (!p.visible) vis = false; p = p.parent }
    if (!vis) return
    o.geometry.computeBoundingBox?.(); const b = o.geometry.boundingBox; if (!b) return
    const sz = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z)
    // ignore helpers: grid / ground planes are flat (one zero extent); view cube lives in its own scene
    const ext = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z]
    if (sz > 5 && sz < 2000 && ext.filter((e) => e > 1e-3).length === 3) out.push({ sz: ext.map((e) => +e.toFixed(1)), col: o.material?.color?.getHexString?.(), op: o.material?.opacity })
  })
  return out
})

await runE2E(async (page, ok) => {
  await page.evaluate(async () => {
    const g = () => window.useApp.getState()
    g().setLang?.('zh-HK')
    for (let t = 0; t < 200 && !(await g().applyFeatures([{ id: 'b1', type: 'extrude', profile: { kind: 'rect', a: [-20, -20], b: [20, 20] }, height: 30, operation: 'new' }, { id: 'f1', type: 'fillet', radius: 3, edges: 'vertical' }], 'base')); t++) await new Promise((r) => setTimeout(r, 250))
    g().addParam('d1', 3); await g().bindParam('f1', 'radius', 'd1')
    if (!g().paramsOpen) g().toggleParamsPanel()
  })
  const input = page.locator('.params-panel input.pp-val[data-param-field="value"]').first()
  await input.click(); await page.keyboard.press('Control+A'); await page.keyboard.type('25'); await page.keyboard.press('Enter')
  await page.waitForTimeout(3000)
  // a rebuild that "succeeds with discounts" leaves lastBuildWarnings (the persistent pill); make sure one is showing
  await page.evaluate(() => { if (!window.useApp.getState().lastBuildWarnings.length) window.useApp.setState({ lastBuildWarnings: ['⚠ 圓角：部分邊失敗'] }) })
  await page.waitForTimeout(300)
  ok('precondition: 重建警告 pill visible', (await page.locator('.vp-build-warning').count()) === 1)
  ok('precondition: body in scene', (await sceneBodies(page)).length >= 1, { bodies: await sceneBodies(page) })
  await page.shot('1-before-new')
  const p = page.evaluate(() => window.useApp.getState().newFileFlow())
  await page.getByRole('button', { name: /^(OK|確定|确定)$/ }).last().click({ timeout: 10000 })
  await p; await page.waitForTimeout(2000)
  await page.shot('2-after-new')
  const st = await page.evaluate(() => { const s = window.useApp.getState(); return { w: s.lastBuildWarnings, failed: s.failedFeatureIds, errs: Object.keys(s.featureErrors), feats: s.features.length, params: s.params.length } })
  ok('no 重建警告 pill after New', (await page.locator('.vp-build-warning').count()) === 0, st)
  ok('store warnings / failure marks cleared', !st.w.length && !st.failed.length && !st.errs.length && st.feats === 0 && st.params === 0, st)
  const bodies = await sceneBodies(page)
  ok('empty scene: no grey placeholder / leftover body', bodies.length === 0, { bodies })
})
