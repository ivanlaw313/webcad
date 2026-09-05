/* Production canvas acceptance for Fusion Press Pull: face ray-pick, typed distance, Enter, timeline. */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

const baseURL = process.argv[2] ?? 'http://127.0.0.1:4173'
const { chromium } = await import('playwright')
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({ headless: true, ...(existsSync(chromePath) ? { executablePath: chromePath } : {}) })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })

async function invoke(command, group) {
  const direct = page.locator(`[data-cmd="${command}"]`)
  const count = await direct.count()
  if (count === 1) { await direct.click(); return }
  assert.equal(count, 0)
  const groupControl = page.locator(`[data-ribbon-group="${group}"]`)
  assert.equal(await groupControl.count(), 1)
  await groupControl.click()
  const flyout = page.locator('[data-testid="ribbon-group-menu"]')
  await flyout.waitFor({ state: 'visible' })
  const item = flyout.locator(`[data-cmd="${command}"]`)
  assert.equal(await item.count(), 1)
  await item.click()
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

  await invoke('presspull', 'MODIFY')
  await dialog.waitFor({ state: 'visible' })
  const canvas = page.locator('canvas')
  const rect = await canvas.boundingBox()
  assert.ok(rect)
  await canvas.click({ position: { x: rect.width / 2, y: rect.height / 2 } })
  await page.waitForFunction(() => window.useApp?.getState?.().pushPullPicks?.length === 1)
  const distance = page.getByLabel('按拉距离 mm')
  assert.equal(await distance.count(), 1)
  await distance.fill('5')
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => {
    const s = window.useApp?.getState?.()
    return s && !s.pushPullMode && s.features?.some((f) => f.type === 'pushpull')
  }, { timeout: 30000 })
  const committed = await page.evaluate(() => {
    const f = window.useApp.getState().features.find((item) => item.type === 'pushpull')
    return { type: f?.type, dist: f?.dist, hasPickedFace: Array.isArray(f?.near) && f.near.length === 3 && f.near.every(Number.isFinite) }
  })
  assert.deepEqual(committed, { type: 'pushpull', dist: 5, hasPickedFace: true })
  console.log(JSON.stringify({ ok: true, target: baseURL, pressPull: committed }))
} finally {
  await browser.close()
}
