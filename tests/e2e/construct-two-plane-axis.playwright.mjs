/* Production canvas acceptance: two non-parallel B-rep faces create their intersection axis. */
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

  const canvas = page.locator('canvas')
  const rect = await canvas.boundingBox()
  assert.ok(rect)
  // The camera can differ slightly between browser engines.  Try pairs of
  // visible face interiors, always through real canvas clicks, until two
  // distinct non-parallel planar faces yield their geometric intersection.
  // These are face interiors after the fitted box is rendered.  In particular
  // avoid the origin-axis overlay at the exact screen centre: it is an
  // interactive helper layer and must not mask the B-rep face acceptance.
  const candidates = [[.52, .50], [.55, .55], [.47, .55], [.50, .58]]
  let result = null
  const attempts = []
  for (let i = 0; i < candidates.length && !result; i++) {
    for (let j = 0; j < candidates.length && !result; j++) {
      if (i === j) continue
      await invoke('axis2planes', 'CONSTRUCT')
      await page.waitForFunction(() => window.useApp?.getState?.().datumPick?.kind === 'planeaxis')
      await canvas.click({ position: { x: rect.width * candidates[i][0], y: rect.height * candidates[i][1] } })
      const firstOk = await page.waitForFunction(() => (window.useApp?.getState?.().datumPick?.picks?.length ?? 0) === 1, null, { timeout: 1200 }).then(() => true).catch(() => false)
      if (!firstOk) { attempts.push({ first: candidates[i], accepted: false, status: await page.evaluate(() => window.useApp?.getState?.().status) }); await page.keyboard.press('Escape'); continue }
      await canvas.click({ position: { x: rect.width * candidates[j][0], y: rect.height * candidates[j][1] } })
      const created = await page.waitForFunction(() => {
        const a = window.useApp?.getState?.().caxes
        return a?.length ? a[a.length - 1] : null
      }, null, { timeout: 1200 }).then(() => true).catch(() => false)
      result = created ? await page.evaluate(() => {
        const a = window.useApp?.getState?.().caxes
        return a?.length ? a[a.length - 1] : null
      }) : null
      if (!result) { attempts.push({ first: candidates[i], second: candidates[j], accepted: true, status: await page.evaluate(() => window.useApp?.getState?.().status) }); await page.keyboard.press('Escape') }
    }
  }
  assert.ok(result, `two distinct planar canvas picks must create a Construction Axis; attempts=${JSON.stringify(attempts.slice(-12))}`)
  assert.ok(Array.isArray(result.dirV) && result.dirV.length === 3 && result.dirV.every(Number.isFinite))
  assert.ok(Math.abs(Math.hypot(...result.dirV) - 1) < 1e-6, 'intersection axis direction must be normalized')
  console.log(JSON.stringify({ ok: true, target: baseURL, twoPlaneAxis: result }))
} finally {
  await browser.close()
}
