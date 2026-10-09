#!/usr/bin/env node
// UX1 #6 real-browser proof: browser tree 「活動實體 ●」 row → right-click 重新命名 (type slowly, Enter) / 刪除 (confirm),
// and a standalone sketch shows ONCE (草圖 folder) — not again under 特徵.
// NOT part of the default test run. Usage: nice -n 19 node scripts/e2e-tree-body-sketch.mjs [--shots /tmp/tb]
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  await page.evaluate(async () => {
    const g = () => window.useApp.getState()
    g().setLang?.('zh-HK')
    window.useApp.setState({ sketchSources: { sk1: { name: '我的草圖', plane: 'XY', shapes: [{ kind: 'rect', a: [40, -5], b: [50, 5] }], cons: [], visible: true } } })
    for (let t = 0; t < 200 && !(await g().applyFeatures([{ id: 'b1', type: 'extrude', profile: { kind: 'rect', a: [-20, -20], b: [20, 20] }, height: 30, operation: 'new' }, { id: 'sf', type: 'sketch', sketchId: 'sk1' }], 'base')); t++) await new Promise((r) => setTimeout(r, 250))
  })
  await page.waitForTimeout(600)
  const rows = page.locator('.tree-row')
  const sketchRows = await rows.filter({ hasText: '我的草圖' }).count()
  const featTexts = await page.evaluate(() => [...document.querySelectorAll('.tree-row')].map((r) => r.textContent.trim()))
  ok('standalone sketch listed once in the browser tree (特徵 folder holds only the extrude)', sketchRows === 1 && featTexts.includes('▾特徵 (1)') && !featTexts.some((t) => t === '草圖'), { sketchRows, featTexts: featTexts.filter((t) => /草圖|特徵/.test(t)) })
  await page.shot('tree-before')
  // rename via right-click → 重新命名
  const body = rows.filter({ hasText: '活動實體 ●' }).first()
  ok('active-body row present', await body.count() === 1)
  await body.click({ button: 'right' })
  const menu = await page.locator('.tree-ctx-menu [role="menuitem"]').allTextContents()
  ok('active-body menu has 重新命名 and 刪除', menu.includes('重新命名') && menu.includes('刪除'), { menu })
  await page.locator('.tree-ctx-menu [data-key="rename"]').click()
  const inp = page.locator('input.tree-rename')
  await inp.waitFor({ timeout: 3000 })
  await inp.press('Control+a')
  await inp.pressSequentially('底座AB', { delay: 60 })
  await inp.press('Enter')
  await page.waitForTimeout(300)
  const nm = await page.evaluate(() => window.useApp.getState().activeBodyName)
  ok('rename keeps every typed character (底座AB)', nm === '底座AB', { nm })
  ok('tree row shows the new name', await rows.filter({ hasText: '底座AB ●' }).count() === 1)
  await page.shot('tree-renamed')
  // delete via right-click → 刪除 → confirm
  await rows.filter({ hasText: '底座AB ●' }).first().click({ button: 'right' })
  await page.locator('.tree-ctx-menu [data-key="delete"]').click()
  await page.locator('[role="dialog"][aria-modal="true"]').waitFor({ timeout: 3000 })
  const dlgText = await page.locator('[role="dialog"][aria-modal="true"]').textContent()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2500)
  const st = await page.evaluate(() => { const s = window.useApp.getState(); return { feats: s.features.map((f) => f.type), tris: s.bodyMesh?.triangles?.length ?? 0, status: s.status } })
  ok('刪除 asks first, then removes the body (sketch kept)', /刪除「底座AB」/.test(dlgText) && st.tris === 0 && !st.feats.includes('extrude') && st.feats.includes('sketch'), { dlgText, ...st })
  ok('body row gone, sketch row still there once', await rows.filter({ hasText: '底座AB' }).count() === 0 && await rows.filter({ hasText: '我的草圖' }).count() === 1)
  await page.shot('tree-deleted')
})
