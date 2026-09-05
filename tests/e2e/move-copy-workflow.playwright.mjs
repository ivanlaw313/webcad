/* Production interaction acceptance for Fusion-style Move/Copy on an active B-rep. */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

const baseURL = process.argv[2] ?? 'http://127.0.0.1:4173'
const { chromium } = await import('playwright')
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({ headless: true, ...(existsSync(chromePath) ? { executablePath: chromePath } : {}) })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })

try {
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'networkidle' })
  await page.locator('.app[data-ui-test="true"]').waitFor()
  const dialog = page.locator('[data-testid="command-dialog"]')

  async function invoke(command, group) {
    const direct = page.locator(`[data-cmd="${command}"]`)
    const directCount = await direct.count()
    if (directCount === 1) { await direct.click(); return }
    assert.equal(directCount, 0, `${command} must not have ambiguous direct ribbon controls`)
    const groupControl = page.locator(`[data-ribbon-group="${group}"]`)
    assert.equal(await groupControl.count(), 1, `${group} flyout must be unique`)
    await groupControl.click()
    const flyout = page.locator('[data-testid="ribbon-group-menu"]')
    await flyout.waitFor({ state: 'visible' })
    const item = flyout.locator(`[data-cmd="${command}"]`)
    assert.equal(await item.count(), 1, `${command} must be reachable from the ${group} flyout`)
    await item.click()
  }

  await invoke('box', 'CREATE')
  await dialog.waitFor({ state: 'visible' })
  const boxInputs = dialog.locator('input')
  assert.ok(await boxInputs.count() >= 3)
  await boxInputs.nth(0).fill('40'); await boxInputs.nth(1).fill('30'); await boxInputs.nth(2).fill('20')
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => window.useApp?.getState?.().features?.length === 1)

  await invoke('move', 'MODIFY')
  await dialog.waitFor({ state: 'visible' })
  const start = await page.evaluate(() => window.useApp.getState().featDlg?.params)
  assert.deepEqual({ dx: start.dx, dy: start.dy, dz: start.dz, rx: start.rx, ry: start.ry, rz: start.rz }, { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0 }, 'Move/Copy must not silently move a body on open')

  const moveInputs = dialog.locator('input[type="number"]')
  assert.ok(await moveInputs.count() >= 3, 'Move/Copy must expose XYZ numeric translation fields')
  await moveInputs.nth(0).fill('25'); await moveInputs.nth(1).fill('-10'); await moveInputs.nth(2).fill('5')
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => window.useApp?.getState?.().features?.some((f) => f.type === 'transform'))
  const transformed = await page.evaluate(() => {
    const f = window.useApp.getState().features.find((item) => item.type === 'transform')
    return { type: f?.type, dx: f?.dx, dy: f?.dy, dz: f?.dz }
  })
  assert.deepEqual(transformed, { type: 'transform', dx: 25, dy: -10, dz: 5 })

  await page.keyboard.press('Control+z')
  await page.waitForFunction(() => !window.useApp?.getState?.().features?.some((f) => f.type === 'transform'))
  await page.keyboard.press('Control+y')
  await page.waitForFunction(() => window.useApp?.getState?.().features?.some((f) => f.type === 'transform'))
  console.log(JSON.stringify({ ok: true, target: baseURL, moveCopy: transformed }))
} finally {
  await browser.close()
}
