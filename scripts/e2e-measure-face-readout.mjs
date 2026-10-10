#!/usr/bin/env node
// P2：統一測量面點 → 面積／直徑 Formal Traditional（盒頂面面積 1200；組件面亦可讀數）
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  const st = (fn, a) => page.evaluate(fn, a)
  await st(async () => {
    const g = () => window.useApp.getState()
    g().setLang?.('zh-HK')
    const BOX = [{ id: 'b', type: 'extrude', profile: { kind: 'rect', a: [0, 0], b: [40, 30] }, height: 20, operation: 'new' }]
    for (let t = 0; t < 200 && !(await g().applyFeatures(BOX, 'box')); t++) await new Promise((r) => setTimeout(r, 250))
    g().requestFit?.()
  })
  await page.waitForTimeout(1200)
  await st(() => { const { camera, controls } = window.__three; controls.target.set(20, 10, -15); camera.position.set(120, 90, 120); camera.lookAt(20, 10, -15); controls.update() })
  await st(() => window.useApp.getState().runCommand('measureuni'))
  await page.waitForTimeout(400)
  const [x, y] = await page.cadToScreen([20, 15, 20])
  await page.mouse.click(x, y)
  await page.waitForTimeout(1200)
  const m = await st(() => {
    const s = window.useApp.getState()
    const panel = [...document.querySelectorAll('.info-card')].map((e) => e.innerText).join(' || ')
    return { res: s.measureUniResult, status: s.status, panel, ver: s.appVersion || window.APP_VERSION }
  })
  ok('measureuni face click → 面積 readout (not empty)', m.res?.type === 'area' && m.res.value != null && Math.abs(m.res.value - 1200) < 1 && m.res.label === '面積', { label: m.res?.label, value: m.res?.value, status: m.status, panel: m.panel?.slice(0, 120) })
  ok('readout Formal Traditional (no Simplified 面积/圆柱)', !/面积|圆柱面|圆锥面|环面/.test((m.status || '') + (m.panel || '') + (m.res?.label || '')), { status: m.status, label: m.res?.label })
  await page.shot('measure-face-area')

  // cylinder diameter via uni measure
  await st(async () => {
    const g = () => window.useApp.getState()
    g().clearMeasureUniPicks()
    const prof = { kind: 'poly', pts: [[0, 0], [30, 0], [30, 35], [40, 35], [40, 40], [0, 40]] }
    for (let t = 0; t < 200 && !(await g().applyFeatures([{ id: 'r', type: 'revolve', profile: prof, angle: 360, axis: 'Y', op: 'new' }], 'cup')); t++) await new Promise((r) => setTimeout(r, 250))
    g().requestFit?.()
  })
  await page.waitForTimeout(1500)
  await st(() => { const { camera, controls } = window.__three; controls.target.set(0, 20, 0); camera.position.set(160, 60, 160); camera.lookAt(0, 20, 0); controls.update() })
  await st(() => { const g = window.useApp.getState(); if (!g.measureUniMode) g.runCommand('measureuni'); g.clearMeasureUniPicks() })
  await page.waitForTimeout(300)
  const a = Math.PI / 4
  const [cx, cy] = await page.cadToScreen([30 * Math.cos(a), 15, -30 * Math.sin(a)])
  await page.mouse.click(cx, cy)
  await page.waitForTimeout(1500)
  const cyl = await st(() => {
    const s = window.useApp.getState()
    return { res: s.measureUniResult, rad: document.querySelector('[data-testid="measure-radius"]')?.textContent ?? null, status: s.status }
  })
  ok('measureuni cylinder face → 圓柱面直徑Ø 60', cyl.res?.type === 'length' && Math.abs(cyl.res.value - 60) < 0.05 && /直徑Ø/.test(cyl.res.label || ''), { label: cyl.res?.label, value: cyl.res?.value, rad: cyl.rad })
  await page.shot('measure-face-cyl')
})
