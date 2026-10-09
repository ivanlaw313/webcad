#!/usr/bin/env node
// UX1 #4 real-browser proof: typing letters ('h' = Hole, 'e' = Extrude, 'f' = Fillet) into ANY focused field must not run
// global single-key shortcuts — dialog numeric fields, ƒx/expression, parameter name/value/expression, tree rename,
// a field that disappears mid-typing (re-render / panel closes) and focus parked on the dialog itself.
// Shortcuts must still work from the canvas afterwards. NOT part of the default test run.
//   nice -n 19 node scripts/e2e-shortcut-guard.mjs [--port 4317] [--shots /tmp/sg]
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  await page.evaluate(async () => {
    const g = () => window.useApp.getState()
    g().setLang?.('zh-HK')
    for (let t = 0; t < 200 && !(await g().applyFeatures([{ id: 'b1', type: 'extrude', profile: { kind: 'rect', a: [-20, -20], b: [20, 20] }, height: 30, operation: 'new' }, { id: 'f1', type: 'fillet', radius: 3, edges: 'vertical' }], 'base')); t++) await new Promise((r) => setTimeout(r, 250))
    window.__cmds = []; const orig = g().runCommand; window.useApp.setState({ runCommand: (...a) => { window.__cmds.push(a[0]); return orig(...a) } })
    g().addParam('d1', 3)
  })
  const typeAndCheck = async (label, keys = '5hef') => {
    await page.evaluate(() => { window.__cmds = [] })
    for (const k of keys) { await page.keyboard.type(k); await page.waitForTimeout(120) }
    await page.waitForTimeout(250)
    const r = await page.evaluate(() => ({ cmds: window.__cmds.slice(), hole: window.useApp.getState().holeMode, val: document.activeElement?.value }))
    ok(`${label}: letters stay in the field, no shortcut`, r.cmds.length === 0 && !r.hole, r)
  }
  const fields = async (sel, label) => {
    const loc = page.locator(sel); const n = await loc.count(); let k = 0
    for (let i = 0; i < n; i++) { const el = loc.nth(i); if (!(await el.isVisible()) || !(await el.isEditable()) || (await el.getAttribute('type')) === 'checkbox') continue; await el.click(); await page.keyboard.press('End'); await typeAndCheck(`${label} field #${i}`); k++ }
    return k
  }
  await page.locator('.tl-chip[data-fi="0"]').dblclick(); await page.waitForTimeout(600)
  ok('extrude edit dialog has fields', (await fields('.cmd-palette input', 'Extrude dialog')) > 0)
  // focus parked on the dialog itself (title / container), not a field
  await page.locator('.cmd-palette').first().focus(); await typeAndCheck('focus on Extrude dialog container', 'hef')
  await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  await page.locator('.tl-chip[data-fi="1"]').dblclick(); await page.waitForTimeout(600)
  ok('fillet edit dialog has fields', (await fields('.cmd-palette input', 'Fillet dialog')) > 0)
  await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  await page.locator('.tl-chip[data-fi="0"]').click(); await page.waitForTimeout(400)
  await fields('.feat-editor input', 'inline feature editor (ƒx)')
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  await page.evaluate(() => { if (!window.useApp.getState().paramsOpen) window.useApp.getState().toggleParamsPanel() })
  await fields('.params-panel input', 'Parameters')
  await page.keyboard.press('Escape')
  // field removed mid-typing: type into the value field, panel closes (re-render), keep typing
  await page.locator('.params-panel input.pp-val[data-param-field="value"]').first().click()
  await page.keyboard.type('7')
  await page.evaluate(() => window.useApp.getState().toggleParamsPanel())   // field unmounted under the caret → focus drops to <body>
  await page.waitForTimeout(100)
  ok('precondition: focus fell back to <body>', await page.evaluate(() => document.activeElement === document.body))
  await typeAndCheck('field removed while typing', 'hef')
  // tree rename
  await page.locator('.tl-chip[data-fi="0"]').click(); await page.keyboard.press('F2'); await page.waitForTimeout(400)
  if (await page.evaluate(() => document.activeElement?.tagName === 'INPUT')) await typeAndCheck('rename field', 'hef')
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  // shortcuts still work from the canvas once you've left the field
  await page.waitForTimeout(1700)
  const cv = page.locator('canvas').first(); const bb = await cv.boundingBox()
  await page.mouse.click(bb.x + 30, bb.y + bb.height - 30)
  await page.evaluate(() => { window.__cmds = []; document.activeElement?.blur?.() })
  await page.keyboard.press('h'); await page.waitForTimeout(400)
  const after = await page.evaluate(() => ({ cmds: window.__cmds.slice(), hole: window.useApp.getState().holeMode }))
  ok('H from the canvas still starts Hole', after.cmds.includes('hole'), after)
  await page.shot('end')
})
