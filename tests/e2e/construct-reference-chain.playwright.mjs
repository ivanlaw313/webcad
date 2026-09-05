/*
 * Production acceptance for the Construct datum chain used when a curved body
 * has no usable planar side face: numeric point -> point-driven axis.
 *
 * This is deliberately a browser flow rather than a store unit test: it
 * exercises the actual CONSTRUCT flyout, form controls and Enter commit used
 * by a CAD user.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

const baseURL = process.argv[2] ?? 'http://127.0.0.1:4173'
const { chromium } = await import('playwright')
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({ headless: true, ...(existsSync(chromePath) ? { executablePath: chromePath } : {}) })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })

async function invoke(command, group = 'CONSTRUCT') {
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
  assert.equal(await item.count(), 1, `${command} must be reachable from ${group}`)
  await item.click()
}

try {
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'networkidle' })
  await page.locator('.app[data-ui-test="true"]').waitFor()
  const dialog = page.locator('[data-testid="command-dialog"]')

  // A user may establish a datum independently of a solid.  This is the
  // reliable fallback for cylindrical/curved work where a side face cannot
  // serve as a planar reference.
  await invoke('datumgeom')
  await dialog.waitFor({ state: 'visible' })
  await dialog.getByRole('button', { name: /^(点|點|point)$/i }).click()
  await dialog.locator('select').first().selectOption('xyz')
  const pointInputs = dialog.locator('input[type="number"]')
  assert.equal(await pointInputs.count(), 3, 'Construction Point must expose X/Y/Z')
  await pointInputs.nth(0).fill('17')
  await pointInputs.nth(1).fill('-8')
  await pointInputs.nth(2).fill('29')
  await dialog.getByTestId('command-confirm').click()
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => window.useApp?.getState?.().cpoints?.length === 1)
  assert.deepEqual(await page.evaluate(() => window.useApp.getState().cpoints[0]), [17, -8, 29])

  // The point must be selectable from the Axis dialog, rather than forcing
  // the user to manually retype its three coordinates.
  await invoke('datumgeom')
  await dialog.waitFor({ state: 'visible' })
  await dialog.getByRole('button', { name: /^(轴|軸|axis)$/i }).click()
  await dialog.locator('select').first().selectOption('dirPoint')
  const selects = dialog.locator('select')
  assert.ok(await selects.count() >= 2, 'Construction Axis must expose direction and construction-point selectors')
  await selects.nth(1).selectOption('Y')
  await dialog.getByTestId('datum-axis-point').selectOption('0')
  await page.waitForFunction(() => {
    const p = window.useApp?.getState?.().datumCmd?.params
    return p?.x === 17 && p?.y === -8 && p?.z === 29
  })
  await dialog.getByTestId('command-confirm').click()
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => window.useApp?.getState?.().caxes?.length === 1)
  const axis = await page.evaluate(() => window.useApp.getState().caxes[0])
  assert.deepEqual(axis, { dir: 'Y', at: [17, -8, 29] })

  // Escape remains a safe way to leave a new Construct command without
  // changing existing datum geometry.
  await invoke('datumgeom')
  await dialog.waitFor({ state: 'visible' })
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  const afterCancel = await page.evaluate(() => ({ cpoints: window.useApp.getState().cpoints.length, caxes: window.useApp.getState().caxes.length }))
  assert.deepEqual(afterCancel, { cpoints: 1, caxes: 1 })
  console.log(JSON.stringify({ ok: true, target: baseURL, constructDatumChain: { point: [17, -8, 29], axis } }))
} finally {
  await browser.close()
}
