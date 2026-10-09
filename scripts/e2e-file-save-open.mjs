#!/usr/bin/env node
// UX1 #5 real-browser proof: (a) first Save of an untitled document asks for a file name (Fusion Save dialog) and the
// file lands with that name — not 「未命名零件 (n).json」; a second Save does not ask again. (b) File ▸ 開啟舊檔案…
// opens the system file picker (filechooser fires from the click) and the picked file opens.
// NOT part of the default test run. Usage: nice -n 19 node scripts/e2e-file-save-open.mjs [--shots /tmp/fs]
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  const dir = mkdtempSync(join(tmpdir(), 'webcad-e2e-'))
  await page.evaluate(async () => {
    const g = () => window.useApp.getState()
    g().setLang?.('zh-HK')
    for (let t = 0; t < 200 && !(await g().applyFeatures([{ id: 'b1', type: 'extrude', profile: { kind: 'rect', a: [-20, -20], b: [20, 20] }, height: 30, operation: 'new' }], 'base')); t++) await new Promise((r) => setTimeout(r, 250))
  })
  // (a) Save → name prompt
  const fileMenu = () => page.locator('button', { hasText: /檔案|File/ }).first()
  await fileMenu().click(); await page.waitForTimeout(250)
  await page.getByRole('menuitem', { name: /儲存|Save/ }).first().click()
  const dlg = page.locator('[role="dialog"][aria-modal="true"] input').first()
  await dlg.waitFor({ timeout: 5000 })
  ok('first save of an untitled doc asks for a file name', true, { def: await dlg.inputValue() })
  await page.shot('save-prompt')
  await dlg.fill('支架A')
  const dl1 = page.waitForEvent('download', { timeout: 15000 })
  await page.keyboard.press('Enter')
  const d1 = await dl1
  const p1 = join(dir, d1.suggestedFilename()); await d1.saveAs(p1)
  ok('saved file uses the typed name', d1.suggestedFilename() === '支架A.json', { name: d1.suggestedFilename() })
  ok('document name follows the save name', (await page.evaluate(() => window.useApp.getState().projectName)) === '支架A')
  // second save: Ctrl+S, no prompt
  await page.locator('canvas').first().click({ position: { x: 20, y: 20 } })
  const dl2 = page.waitForEvent('download', { timeout: 15000 })
  await page.keyboard.press('Control+s')
  const d2 = await dl2
  ok('second save does not ask again', (await page.locator('[role="dialog"][aria-modal="true"] input').count()) === 0 && d2.suggestedFilename() === '支架A.json', { name: d2.suggestedFilename() })
  // cancel path: New file → Save → Cancel = nothing saved
  // (b) open: new blank doc, File ▸ 開啟舊檔案… → system picker
  await page.evaluate(() => window.useApp.getState().reset())
  await page.waitForTimeout(500)
  await fileMenu().click(); await page.waitForTimeout(250)
  const fc = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null)
  await page.getByRole('menuitem', { name: /開啟舊檔案|Open/ }).click()
  const chooser = await fc
  ok('開啟舊檔案… opens the system file picker', !!chooser)
  if (chooser) {
    await chooser.setFiles(p1)
    await page.waitForTimeout(2500)
    const st = await page.evaluate(() => ({ n: window.useApp.getState().features.length, name: window.useApp.getState().projectName, st: window.useApp.getState().status }))
    ok('picked file opens', st.n === 1 && st.name === '支架A', st)
  }
  ok('saved JSON is a webcad project', JSON.parse(readFileSync(p1, 'utf8')).features?.length === 1)
})
