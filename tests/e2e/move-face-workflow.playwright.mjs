/* Production canvas acceptance: pick a real planar face, offset it, and keep a parametric feature. */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

const baseURL = process.argv[2] ?? 'http://127.0.0.1:4173'
const { chromium } = await import('playwright')
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({ headless: true, ...(existsSync(chromePath) ? { executablePath: chromePath } : {}) })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })

async function invoke(page, command, group) {
  const direct = page.locator(`[data-cmd="${command}"]`)
  const directCount = await direct.count()
  if (directCount === 1) { await direct.click(); return }
  assert.equal(directCount, 0, `${command} direct ribbon control must not be ambiguous`)
  const groupControl = page.locator(`[data-ribbon-group="${group}"]`)
  assert.equal(await groupControl.count(), 1, `${group} flyout must be unique`)
  await groupControl.click()
  const flyout = page.locator('[data-testid="ribbon-group-menu"]')
  await flyout.waitFor({ state: 'visible' })
  const item = flyout.locator(`[data-cmd="${command}"]`)
  assert.equal(await item.count(), 1, `${command} must be available from ${group}`)
  await item.click()
}

try {
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'networkidle' })
  await page.locator('.app[data-ui-test="true"]').waitFor()
  const dialog = page.locator('[data-testid="command-dialog"]')
  await invoke(page, 'box', 'CREATE')
  await dialog.waitFor({ state: 'visible' })
  const size = dialog.locator('input')
  await size.nth(0).fill('40'); await size.nth(1).fill('30'); await size.nth(2).fill('20')
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => window.useApp?.getState?.().features?.length === 1)

  // Fusion's visible command is Edit Face; it enters the Move Face offset/
  // tilt workflow rather than a separately-labelled `moveface` ribbon item.
  await invoke(page, 'editface', 'MODIFY')
  const toolbar = page.locator('[data-testid="move-face-toolbar"]')
  await toolbar.waitFor({ state: 'visible' })
  const canvas = page.locator('canvas')
  const rect = await canvas.boundingBox()
  assert.ok(rect && rect.width > 200 && rect.height > 200, 'active B-rep needs a visible canvas')
  // The fitted box is centred in the viewport.  Its centre is intentionally a
  // face interior, never a corner/edge, so this invokes the actual raycast
  // plane-face route rather than an internal selection helper.
  await canvas.click({ position: { x: rect.width / 2, y: rect.height / 2 } })
  await page.waitForFunction(() => window.useApp?.getState?.().moveFacePicks?.length === 1)
  const dist = page.locator('[data-testid="move-face-distance"]')
  assert.equal(await dist.count(), 1)
  await dist.fill('6')
  const commit = page.locator('[data-testid="move-face-commit"]')
  assert.equal(await commit.count(), 1)
  assert.equal(await commit.isEnabled(), true)
  await commit.click()
  await page.waitForFunction(() => {
    const s = window.useApp?.getState?.()
    return s && !s.moveFaceMode && s.features?.some((f) => f.type === 'moveface')
  }, { timeout: 30000 })
  const committed = await page.evaluate(() => {
    const f = window.useApp.getState().features.find((item) => item.type === 'moveface')
    return { type: f?.type, dist: f?.dist, hasPickedFace: Array.isArray(f?.near) && f.near.length === 3 && f.near.every(Number.isFinite) }
  })
  assert.deepEqual(committed, { type: 'moveface', dist: 6, hasPickedFace: true })
  console.log(JSON.stringify({ ok: true, target: baseURL, moveFace: committed }))
} finally {
  await browser.close()
}
