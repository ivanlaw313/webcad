#!/usr/bin/env node
// UX1 #1 real-browser proof: type '12' SLOWLY into a Parameters-panel VALUE field → reads back 12 (not '2'),
// no commit/rebuild per keystroke, one commit on Enter. Also the ƒx expression field and blur-commit.
// NOT part of the default test run. Usage (repo root, after `npx vite build`):
//   nice -n 19 node scripts/e2e-params-value.mjs [--port 4317] [--shots /tmp/pv]
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  await page.evaluate(async () => {
    const g = () => window.useApp.getState()
    for (let t = 0; t < 200 && !(await g().applyFeatures([{ id: 'b1', type: 'extrude', profile: { kind: 'rect', a: [-20, -20], b: [20, 20] }, height: 10, operation: 'new' }], 'base')); t++) await new Promise((r) => setTimeout(r, 250))
    g().addParam('d1', 5)
    if (!g().paramsOpen) g().toggleParamsPanel()
  })
  const sel = '.params-panel input.pp-val[data-param-field="value"]'
  await page.waitForSelector(sel, { timeout: 10000 })
  const commits = () => page.evaluate(() => window.__r20commits ?? 0)
  // count store commits of d1 while typing
  await page.evaluate(() => { window.__r20commits = 0; let last = window.useApp.getState().params.find((p) => p.name === 'd1')?.value; window.useApp.subscribe((s) => { const v = s.params.find((p) => p.name === 'd1')?.value; if (v !== last) { last = v; window.__r20commits++ } }) })
  const input = page.locator(sel).first()
  await input.click()
  await page.keyboard.press('Control+A')
  for (const ch of '12') { await page.keyboard.type(ch); await page.waitForTimeout(400) }
  await page.shot('typed')
  const typed = await input.inputValue()
  ok('value field shows the full typed draft "12" while typing', typed === '12', { typed })
  ok('no commit per keystroke', (await commits()) === 0, { commits: await commits() })
  ok('field keeps focus while typing', await input.evaluate((el) => el === document.activeElement), {})
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  const v = await page.evaluate(() => window.useApp.getState().params.find((p) => p.name === 'd1')?.value)
  ok('Enter commits once → d1 = 12', v === 12 && (await commits()) === 1, { v, commits: await commits() })
  ok('field reads back 12 after commit', (await input.inputValue()) === '12', { shown: await input.inputValue() })
  // blur commit + slow typing again (34)
  await input.click(); await page.keyboard.press('Control+A')
  for (const ch of '34') { await page.keyboard.type(ch); await page.waitForTimeout(400) }
  await page.locator('.params-panel .pp-hint').click()
  await page.waitForTimeout(600)
  const v2 = await page.evaluate(() => window.useApp.getState().params.find((p) => p.name === 'd1')?.value)
  ok('blur commits → d1 = 34', v2 === 34, { v2 })
  // decimal through the intermediate '2.' state (type=number used to report '' there)
  await input.click(); await page.keyboard.press('Control+A')
  for (const ch of '2.5') { await page.keyboard.type(ch); await page.waitForTimeout(300) }
  ok('intermediate decimal kept while typing "2.5"', (await input.inputValue()) === '2.5', { shown: await input.inputValue() })
  await page.keyboard.press('Enter'); await page.waitForTimeout(600)
  ok('d1 = 2.5', (await page.evaluate(() => window.useApp.getState().params.find((p) => p.name === 'd1')?.value)) === 2.5, {})
  await input.click(); await page.keyboard.press('Control+A'); await page.keyboard.type('34'); await page.keyboard.press('Enter'); await page.waitForTimeout(600)
  // add-row value field: string draft, Enter adds
  const addv = page.locator('.params-panel .pp-add input.pp-val').first()
  await addv.click(); await page.keyboard.press('Control+A')
  for (const ch of '12') { await page.keyboard.type(ch); await page.waitForTimeout(300) }
  ok('add-row value field shows "12" while typing', (await addv.inputValue()) === '12', { shown: await addv.inputValue() })
    // expression field: slow typing of 'd1*2' on a 2nd parameter
  await page.evaluate(() => window.useApp.getState().addParam('d2', 1))
  const ex = page.locator('.params-panel input.pp-expr').nth(1)
  await ex.click()
  for (const ch of 'd1*2') { await page.keyboard.type(ch); await page.waitForTimeout(250) }
  ok('expression draft intact while typing', (await ex.inputValue()) === 'd1*2', { shown: await ex.inputValue() })
  await page.keyboard.press('Enter'); await page.waitForTimeout(800)
  const d2 = await page.evaluate(() => window.useApp.getState().params.find((p) => p.name === 'd2'))
  ok('expression commits on Enter → d2 = 68', d2?.value === 68 && d2?.expr === 'd1*2', { d2 })
})
