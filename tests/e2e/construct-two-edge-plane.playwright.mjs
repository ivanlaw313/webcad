/* Production canvas acceptance: two visible B-rep edges define a datum plane. */
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

try {
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'networkidle' })
  await page.locator('.app[data-ui-test="true"]').waitFor()
  const dialog = page.locator('[data-testid="command-dialog"]')
  await invoke('box', 'CREATE')
  await dialog.waitFor({ state: 'visible' })
  const inputs = dialog.locator('input')
  await inputs.nth(0).fill('40'); await inputs.nth(1).fill('30'); await inputs.nth(2).fill('20')
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => window.useApp?.getState?.().features?.length === 1)

  await invoke('plane2edge', 'CONSTRUCT')
  await page.waitForFunction(() => window.useApp?.getState?.().datumCmd?.type === 'plane' && window.useApp?.getState?.().datumCmd?.method === 'twoEdges')
  const canvas = page.locator('canvas')
  const rect = await canvas.boundingBox()
  assert.ok(rect && rect.width > 200 && rect.height > 200)
  // Click face interiors beside the two visible edges.  Clicking the rendered
  // line itself targets its overlay; the body hit is deliberately resolved to
  // the nearest OCCT B-rep edge by the Construct command.
  await canvas.click({ position: { x: rect.width * .55, y: rect.height * .50 } })
  await page.waitForFunction(() => (window.useApp?.getState?.().datumCmd?.picks?.length ?? 0) === 1)
  await canvas.click({ position: { x: rect.width * .565, y: rect.height * .55 } })
  await page.waitForFunction(() => (window.useApp?.getState?.().datumCmd?.picks?.length ?? 0) === 2)
  await page.getByRole('button', { name: '确定' }).click()
  await page.waitForFunction(() => (window.useApp?.getState?.().planes?.length ?? 0) === 1)
  const plane = await page.evaluate(() => window.useApp.getState().planes[0])
  assert.ok(plane?.arb && Array.isArray(plane.arb.o) && Array.isArray(plane.arb.n), 'two-edge plane must retain a full arbitrary-plane frame')
  assert.ok(plane.arb.o.every(Number.isFinite) && plane.arb.n.every(Number.isFinite))
  assert.equal(await page.evaluate(() => window.useApp.getState().datumCmd?.picks?.length ?? 0), 0, 'command must clear consumed edge picks')
  console.log(JSON.stringify({ ok: true, target: baseURL, twoEdgePlane: { origin: plane.arb.o, normal: plane.arb.n } }))
} finally {
  await browser.close()
}
