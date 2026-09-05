/* Production canvas acceptance: three UI-created datum points create a plane. */
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
  assert.equal(await control.count(), 1)
  await control.click()
  const menu = page.locator('[data-testid="ribbon-group-menu"]')
  await menu.waitFor({ state: 'visible' })
  const item = menu.locator(`[data-cmd="${command}"]`)
  assert.equal(await item.count(), 1, `${command} must be reachable from ${group}`)
  await item.click()
}

async function createPoint(x, y, z) {
  await invoke('datumgeom', 'CONSTRUCT')
  const dialog = page.locator('[data-testid="command-dialog"]')
  await dialog.waitFor({ state: 'visible' })
  await dialog.getByRole('button', { name: '点', exact: true }).click()
  await dialog.locator('select').selectOption('xyz')
  const fields = dialog.locator('input')
  await fields.nth(0).fill(String(x)); await fields.nth(1).fill(String(y)); await fields.nth(2).fill(String(z))
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
}

try {
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'networkidle' })
  await page.locator('.app[data-ui-test="true"]').waitFor()
  // A real model removes the empty-document guide, so it cannot cover a
  // construction point during canvas selection.
  await invoke('box', 'CREATE')
  const boxDialog = page.locator('[data-testid="command-dialog"]')
  await boxDialog.waitFor({ state: 'visible' })
  const boxFields = boxDialog.locator('input')
  await boxFields.nth(0).fill('40'); await boxFields.nth(1).fill('30'); await boxFields.nth(2).fill('20')
  await page.keyboard.press('Enter')
  await boxDialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => window.useApp?.getState?.().features?.length === 1)
  // Non-collinear and above the grid so each point is visible and separately pickable.
  await createPoint(0, 0, 30)
  await createPoint(36, 0, 30)
  await createPoint(0, 28, 45)
  await page.waitForFunction(() => (window.useApp?.getState?.().cpoints?.length ?? 0) === 3)
  await invoke('plane3pt', 'CONSTRUCT')
  await page.waitForFunction(() => window.useApp?.getState?.().datumCmd?.type === 'plane' && window.useApp?.getState?.().datumCmd?.method === 'threePoints')
  const canvas = page.locator('canvas')
  const rect = await canvas.boundingBox()
  assert.ok(rect)
  // Positions of the three raised datum spheres in the fitted standard view.
  // These are genuine point-overlay clicks, not state injection.
  for (const [x, y] of [[.50, .453], [.602, .507], [.564, .345]]) {
    await canvas.click({ position: { x: rect.width * x, y: rect.height * y } })
  }
  await page.waitForFunction(() => (window.useApp?.getState?.().datumCmd?.picks?.length ?? 0) === 3)
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await page.waitForFunction(() => (window.useApp?.getState?.().planes?.length ?? 0) === 1)
  const plane = await page.evaluate(() => window.useApp.getState().planes[0])
  assert.ok(plane?.arb?.o?.every(Number.isFinite) && plane?.arb?.n?.every(Number.isFinite), 'three-point plane must retain finite arbitrary-plane geometry')
  console.log(JSON.stringify({ ok: true, target: baseURL, threePointPlane: { origin: plane.arb.o, normal: plane.arb.n } }))
} finally {
  await browser.close()
}
