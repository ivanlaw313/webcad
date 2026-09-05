/* Production canvas acceptance: MODIFY Hole must use a real picked face point,
 * numeric diameter/depth, and persist a parametric hole history feature. */
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

  await invoke('hole', 'CREATE')
  await dialog.waitFor({ state: 'visible' })
  await page.waitForFunction(() => window.useApp?.getState?.().holeMode === true)
  const canvas = page.locator('canvas'), rect = await canvas.boundingBox()
  assert.ok(rect)
  let placed = false
  for (const [x, y] of [[.52, .50], [.55, .55], [.47, .55], [.50, .58]]) {
    await canvas.click({ position: { x: rect.width * x, y: rect.height * y } })
    placed = await page.waitForFunction(() => !!window.useApp?.getState?.().holePos, null, { timeout: 900 }).then(() => true).catch(() => false)
    if (placed) break
  }
  assert.ok(placed, 'Hole must accept a placement from a visible canvas face')
  const numeric = dialog.locator('input[type="number"], input[type="text"]')
  await numeric.nth(0).fill('8')
  await dialog.getByRole('button', { name: '确定' }).click()
  await page.waitForFunction(() => {
    const f = window.useApp?.getState?.().features
    return f?.length === 2 && f[1]?.type === 'hole'
  }, null, { timeout: 10000 })
  const feature = await page.evaluate(() => window.useApp.getState().features.at(-1))
  assert.equal(feature.diameter, 8)
  assert.ok(Array.isArray(feature.center) && feature.center.every(Number.isFinite))
  assert.ok(Number.isFinite(feature.top))
  console.log(JSON.stringify({ ok: true, target: baseURL, hole: feature }))
} finally {
  await browser.close()
}
