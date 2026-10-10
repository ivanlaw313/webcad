#!/usr/bin/env node
// P1 real-mouse: box + cylinder as 新實體 → tree delete active → other body remains; confirm lists 1 feature; Ctrl+Z restores.
// Usage: nice -n 19 npx vite build && flock /tmp/webcad-e2e.lock nice -n 19 node scripts/e2e-delete-active-newbody.mjs [--shots DIR]
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  await page.evaluate(() => window.useApp.getState().setLang?.('zh-HK'))
  await page.waitForTimeout(400)
  await page.evaluate(async () => {
    const g = () => window.useApp.getState()
    const box = { id: 'b1', type: 'extrude', profile: { kind: 'rect', a: [-20, -20], b: [20, 20] }, height: 12, operation: 'new' }
    const cyl = { id: 'c1', type: 'extrude', profile: { kind: 'circle', c: [45, 0], r: 10 }, height: 30, operation: 'newbody' }
    for (let t = 0; t < 200 && !(await g().applyFeatures([box, cyl], 'two')); t++) await new Promise((r) => setTimeout(r, 250))
  })
  await page.waitForFunction(() => (window.useApp.getState().bodyMesh?.parked?.length ?? 0) === 1, null, { timeout: 60000 })
  const before = await page.evaluate(() => {
    const s = window.useApp.getState()
    return { n: s.features.length, ids: s.features.map((f) => f.id), parked: s.bodyMesh?.parked?.length ?? 0, tris: s.bodyMesh?.triangles?.length ?? 0 }
  })
  ok('setup: box + newbody cylinder (1 parked)', before.n === 2 && before.parked === 1 && before.tris > 0, before)

  // Real-mouse: right-click active body row → 刪除
  const active = page.locator('[data-testid="tree-body-active"]').or(page.locator('.tree-row').filter({ hasText: '活動實體' })).first()
  await active.waitFor({ timeout: 10000 })
  await active.click({ button: 'right' })
  await page.locator('.tree-ctx-menu [data-key="delete"]').waitFor({ timeout: 3000 })
  await page.locator('.tree-ctx-menu [data-key="delete"]').click()
  const dlg = page.locator('[role="dialog"][aria-modal="true"]')
  await dlg.waitFor({ timeout: 5000 })
  const dlgText = await dlg.textContent()
  ok('confirm lists only active-body features (1), not all 4', /會移除建立它的 1 個特徵/.test(dlgText) && !/4 個特徵/.test(dlgText), { dlgText })
  // confirm with real mouse on 確定
  const btn = dlg.locator('button').filter({ hasText: /確定|刪除|OK/ }).first()
  if (await btn.count()) await btn.click()
  else await page.keyboard.press('Enter')
  await page.waitForTimeout(2500)
  const after = await page.evaluate(() => {
    const s = window.useApp.getState()
    return { n: s.features.length, ids: s.features.map((f) => f.id), parked: s.bodyMesh?.parked?.length ?? 0, tris: s.bodyMesh?.triangles?.length ?? 0, status: s.status }
  })
  ok('after delete: only box remains (other body)', after.ids.includes('b1') && !after.ids.includes('c1') && after.tris > 0 && (after.parked === 0 || after.n === 1), after)
  await page.shot('after-delete')

  // Ctrl+Z restores both
  await page.mouse.click(700, 450)
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(2000)
  const undone = await page.evaluate(() => {
    const s = window.useApp.getState()
    return { n: s.features.length, ids: s.features.map((f) => f.id), parked: s.bodyMesh?.parked?.length ?? 0 }
  })
  ok('one undo restores both bodies', undone.n === 2 && undone.ids.includes('b1') && undone.ids.includes('c1') && undone.parked === 1, undone)
  await page.shot('after-undo')

  // P1 gap: set parked box active, delete active → cylinder (independent) must remain; Ctrl+Z restores
  await page.evaluate(async () => {
    const g = () => window.useApp.getState()
    await g().activateParkedBody(0)
  })
  await page.waitForFunction(() => window.useApp.getState().features.some((f) => f.type === 'activatebody'), null, { timeout: 15000 })
  const afterAct = await page.evaluate(() => {
    const s = window.useApp.getState()
    return { ids: s.features.map((f) => f.id), types: s.features.map((f) => f.type), parked: s.bodyMesh?.parked?.length ?? 0 }
  })
  ok('after 設為活動: box active, cylinder parked, activatebody present', afterAct.ids.includes('b1') && afterAct.ids.includes('c1') && afterAct.types.includes('activatebody') && afterAct.parked === 1, afterAct)
  const active3 = page.locator('[data-testid="tree-body-active"]')
  await active3.click({ button: 'right' })
  await page.locator('.tree-ctx-menu [data-key="delete"]').waitFor({ timeout: 3000 })
  await page.locator('.tree-ctx-menu [data-key="delete"]').click()
  await dlg.waitFor({ timeout: 5000 })
  const dlgText2 = await dlg.textContent()
  ok('confirm after 設為活動 lists 1 solid feature only (Traditional)', /會移除建立它的 1 個特徵/.test(dlgText2) && /刪除/.test(dlgText2) && !/设为活动|會移除建立它的 2/.test(dlgText2), { dlgText2 })
  const btn2 = dlg.locator('button').filter({ hasText: /確定|刪除|OK/ }).first()
  if (await btn2.count()) await btn2.click()
  else await page.keyboard.press('Enter')
  await page.waitForTimeout(2500)
  const afterDelA = await page.evaluate(() => {
    const s = window.useApp.getState()
    return { ids: s.features.map((f) => f.id), types: s.features.map((f) => f.type), parked: s.bodyMesh?.parked?.length ?? 0, tris: s.bodyMesh?.triangles?.length ?? 0, status: s.status }
  })
  ok('after delete active (was A): cylinder remains, activatebody gone, no wipe', afterDelA.ids.includes('c1') && !afterDelA.ids.includes('b1') && !afterDelA.types.includes('activatebody') && afterDelA.tris > 0 && !/重建失敗/.test(afterDelA.status || ''), afterDelA)
  await page.shot('after-delete-activated')
  await page.mouse.click(700, 450)
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(2000)
  const undoneAct = await page.evaluate(() => {
    const s = window.useApp.getState()
    return { ids: s.features.map((f) => f.id), types: s.features.map((f) => f.type), parked: s.bodyMesh?.parked?.length ?? 0 }
  })
  ok('Ctrl+Z restores A+B and activatebody', undoneAct.ids.includes('b1') && undoneAct.ids.includes('c1') && undoneAct.types.includes('activatebody') && undoneAct.parked === 1, undoneAct)

  // Esc abort path (real mouse + Esc)
  await page.waitForTimeout(500)
  const active2 = page.locator('[data-testid="tree-body-active"]')
  await active2.waitFor({ timeout: 10000 })
  await active2.click({ button: 'right' })
  await page.waitForTimeout(300)
  const delItem = page.locator('.tree-ctx-menu [data-key="delete"]')
  await delItem.waitFor({ timeout: 5000 })
  await delItem.click()
  await dlg.waitFor({ timeout: 5000 })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  const kept = await page.evaluate(() => window.useApp.getState().features.map((f) => f.id))
  ok('Esc aborts delete — both bodies kept', kept.includes('b1') && kept.includes('c1'), { kept })
})
