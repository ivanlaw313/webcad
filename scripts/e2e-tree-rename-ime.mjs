#!/usr/bin/env node
// UX1 #7 real-browser proof: browser-tree rename must keep the last typed character — incl. a Cantonese/pinyin IME,
// where the Enter that picks the candidate arrives as a *composing* keydown (isComposing) BEFORE the chosen character
// lands. Old code committed on that Enter (value still the romanisation / missing the last char) and unmounted the input.
// Also checks the P3 wording: 「+ 新增」 in the Parameters panel, 「浮雕」 ribbon label, BOM table headers in Traditional.
// NOT part of the default test run. Usage: nice -n 19 node scripts/e2e-tree-rename-ime.mjs [--shots /tmp/rn]
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  await page.evaluate(async () => {
    const g = () => window.useApp.getState()
    g().setLang?.('zh-HK')
    for (let t = 0; t < 200 && !(await g().applyFeatures([{ id: 'b1', type: 'extrude', profile: { kind: 'rect', a: [-20, -20], b: [20, 20] }, height: 30, operation: 'new' }], 'base')); t++) await new Promise((r) => setTimeout(r, 250))
  })
  await page.waitForTimeout(500)
  const cdp = await page.context().newCDPSession(page)
  const renameVia = async (rowText, typed) => {
    await page.locator('.tree-row').filter({ hasText: rowText }).first().click({ button: 'right' })
    await page.locator('.tree-ctx-menu [data-key="rename"]').click()
    const inp = page.locator('input.tree-rename'); await inp.waitFor({ timeout: 3000 })
    await inp.press('Control+a'); await inp.press('Backspace')
    await inp.pressSequentially(typed, { delay: 40 })
    // IME: compose romanisation, Enter (composing) picks candidate, the character lands, then the real Enter
    await cdp.send('Input.imeSetComposition', { text: 'ban', selectionStart: 3, selectionEnd: 3 })
    await page.waitForTimeout(80)
    await inp.evaluate((el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true })))
    await page.waitForTimeout(80)
    const stillOpen = await inp.count()
    if (stillOpen) await cdp.send('Input.insertText', { text: '板' })
    await page.waitForTimeout(80)
    if (stillOpen) await inp.press('Enter')
    await page.waitForTimeout(300)
    return stillOpen
  }
  const open1 = await renameVia('拉伸', '底')
  const fname = await page.evaluate(() => window.useApp.getState().features[0].name)
  ok('feature rename: IME candidate Enter does not commit early; last character kept', open1 === 1 && fname === '底板', { open1, fname })
  const open2 = await renameVia('活動實體 ●', '外')
  const bname = await page.evaluate(() => window.useApp.getState().activeBodyName)
  ok('body rename: same with IME', open2 === 1 && bname === '外板', { open2, bname })
  // plain fast typing + Enter keeps every char
  await page.locator('.tree-row').filter({ hasText: '底板' }).first().click({ button: 'right' })
  await page.locator('.tree-ctx-menu [data-key="rename"]').click()
  const inp = page.locator('input.tree-rename'); await inp.waitFor()
  await inp.press('Control+a'); await inp.pressSequentially('Base12', { delay: 0 }); await inp.press('Enter')
  await page.waitForTimeout(200)
  ok('fast typing + Enter keeps the last char', (await page.evaluate(() => window.useApp.getState().features[0].name)) === 'Base12')
  // P3 wording
  await page.evaluate(() => { const g = window.useApp.getState(); if (!g.paramsOpen) g.toggleParamsPanel() })
  await page.waitForTimeout(300)
  const addTxt = await page.locator('button', { hasText: /^\+ (新增|添加)$/ }).allTextContents()
  ok('Parameters panel says 「+ 新增」', addTxt.includes('+ 新增') && !addTxt.includes('+ 添加'), { addTxt })
  const emboss = await page.evaluate(() => [...document.querySelectorAll('[data-cmd="emboss"], button')].map((b) => b.textContent.trim()).filter((t) => /浮雕|Emboss/.test(t)))
  ok('no English 「Emboss」 label in zh-HK UI (ribbon shows 浮雕 where present)', !emboss.some((t) => /^Emboss$/.test(t)), { emboss })
  await page.evaluate(async () => {
    const g = window.useApp.getState()
    await g.applyFeatures([{ id: 'b2', type: 'extrude', profile: { kind: 'rect', a: [-5, -5], b: [5, 5] }, height: 5, operation: 'new' }], 'b')
    g.newComponent?.()
  })
  await page.waitForTimeout(800)
  await page.evaluate(() => window.useApp.getState().exportBOM())
  await page.waitForTimeout(500)
  const bom = await page.evaluate(() => { const d = window.useApp.getState().bomDialog; return d ? { head: d.rows[0], summary: d.summary } : null })
  ok('BOM table headers are Traditional (no SC / L×W×H / @1.75)', !!bom && bom.head.includes('數量') && bom.head.includes('單件體積 (cm³)') && !bom.head.some((h) => /[数单体组实质]|L×W×H|@1\.75/.test(h)) && !/^BOM/.test(bom.summary), bom || {})
  await page.shot('bom')
})
