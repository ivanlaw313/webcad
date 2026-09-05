/* Production canvas acceptance: a cylindrical side face creates a usable tangent plane. */
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
  const control = page.locator(`[data-ribbon-group="${group}"]`)
  assert.equal(await control.count(), 1, `${group} flyout must be unique`)
  await control.click()
  const menu = page.locator('[data-testid="ribbon-group-menu"]')
  await menu.waitFor({ state: 'visible' })
  const item = menu.locator(`[data-cmd="${command}"]`)
  assert.equal(await item.count(), 1, `${command} must be reachable from ${group}`)
  await item.click()
}

try {
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'networkidle' })
  await page.locator('.app[data-ui-test="true"]').waitFor()
  const dialog = page.locator('[data-testid="command-dialog"]')
  await invoke('cylinder', 'CREATE')
  await dialog.waitFor({ state: 'visible' })
  const inputs = dialog.locator('input')
  await inputs.nth(0).fill('60'); await inputs.nth(1).fill('50')
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => window.useApp?.getState?.().features?.length === 1)

  await invoke('planetan', 'CONSTRUCT')
  await page.waitForFunction(() => window.useApp?.getState?.().datumPick?.kind === 'tanplane')
  const canvas = page.locator('canvas')
  const rect = await canvas.boundingBox()
  assert.ok(rect && rect.width > 200 && rect.height > 200)
  // Centre of the fitted cylinder is a visible curved side, so this is an
  // actual R3F/OCCT cylinder-face raycast rather than a fabricated datum.
  await canvas.click({ position: { x: rect.width / 2, y: rect.height / 2 } })
  await page.waitForFunction(() => window.useApp?.getState?.().planes?.length === 1)
  const plane = await page.evaluate(() => window.useApp.getState().planes[0])
  assert.ok(plane.arb && Array.isArray(plane.arb.o) && Array.isArray(plane.arb.n), 'tangent plane must keep arbitrary-plane frame data')
  assert.ok(plane.src?.kind === 'tanPlane', 'tangent plane must retain its cylindrical-face provenance')
  assert.equal(await page.evaluate(() => window.useApp.getState().datumPick), null, 'tangent selection must disarm after creation')
  console.log(JSON.stringify({ ok: true, target: baseURL, tangentPlane: { hasArb: !!plane.arb, source: plane.src?.kind } }))
} finally {
  await browser.close()
}
