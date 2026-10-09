#!/usr/bin/env node
// UX1 #3 real-browser proof: double-click a timeline feature (Edit Feature) → Cancel must NOT leave the bottom
// 「編輯「拉伸」」 feature-editor bar behind (extrude + fillet). Cancel via button and via Esc.
// NOT part of the default test run. Usage: nice -n 19 node scripts/e2e-timeline-edit-cancel.mjs [--shots /tmp/tl]
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  await page.evaluate(async () => {
    const g = () => window.useApp.getState()
    g().setLang?.('zh-HK')
    for (let t = 0; t < 200 && !(await g().applyFeatures([{ id: 'b1', type: 'extrude', profile: { kind: 'rect', a: [-20, -20], b: [20, 20] }, height: 30, operation: 'new' }, { id: 'f1', type: 'fillet', radius: 3, edges: 'vertical' }], 'base')); t++) await new Promise((r) => setTimeout(r, 250))
  })
  await page.waitForTimeout(800)
  for (const [i, name, how] of [[0, '拉伸', 'button'], [1, '圓角', 'button'], [0, '拉伸', 'Escape']]) {
    await page.locator(`.tl-chip[data-fi="${i}"]`).dblclick()
    await page.waitForTimeout(600)
    const open = await page.evaluate(() => { const s = window.useApp.getState(); return !!s.featDlg || s.extrudeDlgOpen })
    ok(`#${i} ${name}: double-click opens the edit dialog`, open)
    await page.shot(`${i}-${how}-open`)
    if (how === 'button') await page.getByRole('button', { name: /^(取消|Cancel)$/ }).last().click()
    else await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    await page.shot(`${i}-${how}-cancel`)
    const st = await page.evaluate(() => { const s = window.useApp.getState(); return { dlg: !!s.featDlg, sel: s.selectedFeature, bar: document.querySelectorAll('.feat-editor').length, txt: document.querySelector('.feat-editor .fe-title')?.textContent ?? null } })
    ok(`#${i} ${name}: Cancel (${how}) leaves no 「編輯「…」」 bar`, !st.dlg && st.bar === 0 && st.sel == null, st)
  }
  // single click still shows the inline editor (unchanged behaviour)
  await page.locator('.tl-chip[data-fi="0"]').click(); await page.waitForTimeout(400)
  ok('single click still opens the inline feature editor', (await page.locator('.feat-editor').count()) === 1)
})
