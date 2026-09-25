/* Browser acceptance for the Aero Design Lab: ribbon entry → template → optimisation in the worker →
 * results → insert the best candidate as a real B-rep (aerocad worker → stepbody timeline feature).
 * Usage: node tests/e2e/aero-lab.playwright.mjs [baseURL] [screenshotDir] */
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseURL = (process.argv[2] ?? 'https://cad.neuralworkshk.com').replace(/\/$/, '')
const shots = process.argv[3]
const executablePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({ headless: true, executablePath })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.locator('.ribbon-tab', { hasText: '實驗室' }).click()
  const trigger = page.locator('[data-cmd="aerolab"]')
  await trigger.waitFor({ state: 'visible', timeout: 30000 })
  await trigger.click()
  const lab = page.locator('.aero-lab')
  await lab.waitFor({ state: 'visible', timeout: 30000 })
  assert.ok(await lab.getByText('氣動設計實驗室').count(), 'title visible')
  assert.ok(await lab.getByText(/唔係 CFD/).count(), 'honest labelling visible')

  // 1) multi-objective fan (NSGA-II) — Pareto chart
  await lab.locator('select').filter({ hasText: '1200' }).selectOption('300')
  await lab.locator('[data-aero-run]').click()
  await lab.locator('[data-aero-cand]').first().waitFor({ state: 'visible', timeout: 60000 })
  assert.ok(await lab.locator('svg[aria-label="pareto"]').count(), 'pareto chart drawn')
  if (shots) await page.screenshot({ path: `${shots}/aero-fan.png` })

  // 2) shell (CMA-ES) → insert best candidate as a B-rep
  await lab.locator('[data-aero-template="shell"]').click()
  await lab.locator('[data-aero-run]').click()
  await lab.locator('[data-aero-cand]').first().waitFor({ state: 'visible', timeout: 60000 })
  assert.ok(await lab.locator('svg[aria-label="convergence"]').count(), 'convergence chart drawn')
  await lab.locator('[data-aero-insert]').click()
  await lab.getByText(/已插入為時間軸/).first().waitFor({ state: 'visible', timeout: 120000 })
  const hasBody = await page.evaluate(() => !!document.querySelector('.tl-chip'))
  assert.ok(hasBody, 'timeline shows the inserted feature')
  if (shots) await page.screenshot({ path: `${shots}/aero-shell-inserted.png` })

  // 3) preview
  await lab.getByRole('button', { name: /3D 預覽/ }).click()
  await lab.locator('canvas').first().waitFor({ state: 'visible', timeout: 30000 })
  if (shots) await page.screenshot({ path: `${shots}/aero-preview.png` })

  // 4) accurate mode: candidate mesh through the existing LBM wind tunnel worker
  await lab.locator('[data-aero-cand]').first().getByRole('button').click()
  await lab.locator('[data-aero-cand]').first().getByText(/Cd \d/).waitFor({ state: 'visible', timeout: 180000 })
  console.log('LBM:', await lab.locator('[data-aero-cand]').first().innerText())

  // 5) propeller: optimise + insert (blade loft ×B fused with hub) as a second body
  await lab.locator('[data-aero-template="prop"]').click()
  await lab.locator('[data-aero-run]').click()
  await lab.locator('[data-aero-cand]').first().waitFor({ state: 'visible', timeout: 60000 })
  await lab.locator('[data-aero-insert]').click()
  await page.waitForFunction(() => document.querySelectorAll('.tl-chip').length >= 3, null, { timeout: 180000 })
  if (shots) await page.screenshot({ path: `${shots}/aero-prop-inserted.png` })
  assert.deepEqual(pageErrors, [], 'no page errors')
  console.log('aero-lab e2e OK')
} finally {
  await browser.close()
}
