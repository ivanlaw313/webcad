/* Production acceptance: MODIFY Scale enters an editable numeric feature and
 * keeps its centre anchor, factor and timeline history after commit. */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

const baseURL = process.argv[2] ?? 'http://127.0.0.1:4173'
const { chromium } = await import('playwright')
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({ headless: true, ...(existsSync(chromePath) ? { executablePath: chromePath } : {}) })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })

async function invoke(command, group) {
  const direct = page.locator(`[data-cmd="${command}"]`)
  if (await direct.count() === 1) return direct.click()
  await page.locator(`[data-ribbon-group="${group}"]`).click()
  const menu = page.locator('[data-testid="ribbon-group-menu"]')
  await menu.waitFor({ state: 'visible' })
  await menu.locator(`[data-cmd="${command}"]`).click()
}

try {
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'networkidle' })
  await page.locator('.app[data-ui-test="true"]').waitFor()
  const dialog = page.locator('[data-testid="command-dialog"]')
  await invoke('box', 'CREATE')
  await dialog.waitFor({ state: 'visible' })
  const box = dialog.locator('input')
  await box.nth(0).fill('40'); await box.nth(1).fill('30'); await box.nth(2).fill('20')
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => window.useApp?.getState?.().features?.length === 1)

  await invoke('scale', 'MODIFY')
  await dialog.waitFor({ state: 'visible' })
  const state = await page.evaluate(() => window.useApp.getState().featDlg)
  assert.equal(state.kind, 'scale')
  assert.deepEqual([state.params.px, state.params.py, state.params.pz], [0, 0, 10], 'Scale must default to the body centre rather than throw the part away from origin')
  await dialog.locator('input[type="number"]').nth(0).fill('1.5')
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => {
    const f = window.useApp?.getState?.().features
    return f?.length === 2 && f[1]?.type === 'scale'
  }, null, { timeout: 10000 })
  const feature = await page.evaluate(() => window.useApp.getState().features.at(-1))
  assert.equal(feature.factor, 1.5)
  // Zero coordinates are deliberately compacted from the persisted feature;
  // the kernel reads missing axes as world-zero, while Z remains explicit.
  assert.deepEqual([feature.px ?? 0, feature.py ?? 0, feature.pz ?? 0], [0, 0, 10])
  console.log(JSON.stringify({ ok: true, target: baseURL, scale: feature }))
} finally {
  await browser.close()
}
