#!/usr/bin/env node
// UX2 #9 + #10 real-browser proof: flanged cup → body row 材質 dropdown → 鋼 → the rendered body colour changes;
// right-click body row shows 材質; 測量 (I) on the cup's cylindrical wall reads 圓柱面直徑Ø + 半徑 R (not only area).
// Usage: nice -n 19 node scripts/e2e-ux2-mat-measure.mjs [--shots DIR]
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  const st = (fn, a) => page.evaluate(fn, a)
  await st(async () => {
    const g = () => window.useApp.getState()
    g().setLang?.('zh-HK')
    const prof = { kind: 'poly', pts: [[0, 0], [30, 0], [30, 35], [40, 35], [40, 40], [0, 40]] }
    for (let t = 0; t < 200 && !(await g().applyFeatures([{ id: 'r', type: 'revolve', profile: prof, angle: 360, axis: 'Y', op: 'new' }, { id: 's', type: 'shell', thickness: 2, nears: [[10, 40, 0]], tangentChain: false, direction: 'inside' }], 'cup')); t++) await new Promise((r) => setTimeout(r, 250))
    g().requestFit?.()
  })
  await page.waitForTimeout(1500)
  const meshColor = () => st(() => { const cs = []; window.__three.scene.traverse((o) => { if (o.isMesh && o.material?.color && o.geometry?.attributes?.position?.count > 300 && o.visible) cs.push('#' + o.material.color.getHexString()) }); return cs })
  const c0 = await meshColor()
  const sel = page.locator('[data-testid="body-material"]')
  ok('#9 the body row has a 材質 dropdown', (await sel.count()) === 1)
  await sel.selectOption('钢'); await page.waitForTimeout(800)
  const after = await st(() => ({ color: window.useApp.getState().bodyColor, dens: window.useApp.getState().bodyDensity, phys: window.useApp.getState().physMatName, shown: document.querySelector('[data-testid="body-material"]').selectedOptions[0].textContent }))
  const c1 = await meshColor()
  ok('#9 choosing 鋼 changes the rendered body colour (and density 7.85)', after.dens === 7.85 && after.shown === '鋼' && c1.length > 0 && c1.some((c) => c === after.color.toLowerCase()) && JSON.stringify(c0) !== JSON.stringify(c1), { c0, c1, ...after })
  await page.shot('steel')
  // right-click the body row → menu offers 材質
  const row = page.locator('.tree-row', { has: page.locator('[data-testid="body-material"]') }).first()
  await row.click({ button: 'right', position: { x: 60, y: 8 } }); await page.waitForTimeout(300)
  const menu = await st(() => document.querySelector('.tree-ctx-menu')?.innerText ?? '')
  ok('#9 body-row right-click menu has 材質', /材質/.test(menu), menu.replace(/\n/g, ' | '))
  await page.shot('body-menu')
  await page.keyboard.press('Escape'); await page.waitForTimeout(200)
  // ── #10 measure the outer cylindrical wall (r = 30, below the flange)
  await st(() => { const { camera, controls } = window.__three; controls.target.set(0, 20, 0); camera.position.set(160, 60, 160); camera.lookAt(0, 20, 0); controls.update() })
  await st(() => window.useApp.getState().runCommand('measureuni')); await page.waitForTimeout(400)
  const a = Math.PI / 4
  const [x, y] = await page.cadToScreen([30 * Math.cos(a), 15, -30 * Math.sin(a)])
  await page.mouse.click(x, y); await page.waitForTimeout(1500)
  const m = await st(() => ({ res: window.useApp.getState().measureUniResult, panel: [...document.querySelectorAll('.info-card')].map((e) => e.innerText).join(' || '), rad: document.querySelector('[data-testid="measure-radius"]')?.textContent ?? null }))
  ok('#10 measuring the cup wall reads 圓柱面直徑Ø 60 with R 30', m.res?.type === 'length' && Math.abs(m.res.value - 60) < 0.01 && /直徑Ø/.test(m.res.label) && /R\s*30/.test(m.rad ?? ''), { label: m.res?.label, value: m.res?.value, rad: m.rad, parts: m.res?.parts })
  await page.shot('measure-cyl')
})
