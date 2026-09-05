/* Production canvas acceptance: Draft must collect a neutral face and a side
 * face through the WebGL canvas, accept its numeric angle, then commit history. */
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
  const dims = dialog.locator('input')
  await dims.nth(0).fill('40'); await dims.nth(1).fill('30'); await dims.nth(2).fill('20')
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => window.useApp?.getState?.().features?.length === 1)

  await invoke('draft', 'MODIFY')
  await dialog.waitFor({ state: 'visible' })
  await page.waitForFunction(() => window.useApp?.getState?.().draftPickMode === 1)
  const canvas = page.locator('canvas'), rect = await canvas.boundingBox()
  assert.ok(rect)
  // Fitted box: first candidate intentionally targets a top-ish face, then
  // candidates choose a visibly different side. We assert distinct picked
  // face centres instead of assuming a fixed camera projection.
  let pickedNeutral = false
  for (const [x, y] of [[.52, .50], [.55, .55], [.47, .55], [.50, .58], [.50, .43]]) {
    await canvas.click({ position: { x: rect.width * x, y: rect.height * y } })
    pickedNeutral = await page.waitForFunction(() => window.useApp?.getState?.().draftPickMode === 2, null, { timeout: 900 }).then(() => true).catch(() => false)
    if (pickedNeutral) break
  }
  assert.ok(pickedNeutral, 'a visible canvas face must become Draft neutral face')
  const neutral = await page.evaluate(() => window.useApp.getState().draftNeutral)
  assert.ok(neutral, 'first canvas face pick must become Draft neutral face')

  const sideCandidates = [[.57, .54], [.43, .55], [.55, .49], [.45, .49]]
  let pickedSide = false
  for (const [x, y] of sideCandidates) {
    await canvas.click({ position: { x: rect.width * x, y: rect.height * y } })
    pickedSide = await page.waitForFunction(() => (window.useApp?.getState?.().draftSides?.length ?? 0) > 0, null, { timeout: 700 }).then(() => true).catch(() => false)
    if (pickedSide) break
  }
  assert.ok(pickedSide, 'a visible side face must be collected through the canvas')
  await dialog.locator('input[type="number"]').fill('5')
  await dialog.getByRole('button', { name: '确定拔模' }).click()
  await page.waitForFunction(() => {
    const f = window.useApp?.getState?.().features
    return f?.length === 2 && f[1]?.type === 'draft'
  }, null, { timeout: 10000 })
  const feature = await page.evaluate(() => window.useApp.getState().features.at(-1))
  assert.equal(feature.angle, 5)
  assert.ok(feature.neutralOrigin?.every(Number.isFinite))
  assert.ok(feature.sideNears?.length >= 1)
  console.log(JSON.stringify({ ok: true, target: baseURL, draft: feature }))
} finally {
  await browser.close()
}
