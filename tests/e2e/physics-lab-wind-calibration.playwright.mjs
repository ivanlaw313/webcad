import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseURL = (process.argv[2] ?? 'https://cad.neuralworkshk.com').replace(/\/$/, '')
const executablePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({ headless: true, executablePath })

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('[data-ribbon-group="CREATE"]').waitFor({ state: 'visible', timeout: 60000 })

  await page.locator('[data-ribbon-group="CREATE"]').click()
  await page.locator('.panel-menu-item[data-cmd="box"]').click()
  const dialog = page.locator('[data-testid="command-dialog"]')
  await dialog.waitFor({ state: 'visible' })
  const dimensions = dialog.locator('input[inputmode="decimal"]')
  await dimensions.nth(0).fill('400')
  await dimensions.nth(1).fill('300')
  await dimensions.nth(2).fill('200')
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  // Dialog closure precedes the OCCT worker commit on slower production
  // connections.  Wait for the authoritative browser-tree feature before
  // invoking an analysis command that consumes the finished body mesh.
  await page.getByText(/特征 \(1\)/).waitFor({ state: 'visible', timeout: 60000 })

  await page.locator('.ribbon-tab', { hasText: '🧪實驗室' }).click()
  const windCommand = page.locator('[data-cmd="windtunnel"]')
  await windCommand.waitFor({ state: 'visible', timeout: 30000 })
  await windCommand.click()
  await dialog.waitFor({ state: 'visible' })
  const ranges = dialog.locator('input[type="range"]')
  await ranges.nth(0).fill('12')
  await ranges.nth(1).fill('12')
  await page.keyboard.press('Enter')
  await page.getByText(/风阻系数 Cd|風阻系數 Cd/).waitFor({ state: 'visible', timeout: 90000 })

  await page.locator('[data-testid="physics-send-wind-to-lab"]').click()
  const lab = page.locator('.physics-lab')
  await lab.waitFor({ state: 'visible', timeout: 30000 })
  const apply = lab.locator('[data-testid="physics-apply-wind-tunnel-calibration"]')
  assert.equal(await apply.isDisabled(), false)
  await apply.click()
  const calibrationStatus = await lab.locator('[data-testid="physics-wind-tunnel-calibration-status"]').innerText()
  assert.match(calibrationStatus, /已套用趨勢級 LBM/)

  await lab.locator('[data-testid="physics-cad-flight-enabled"]').check()
  await lab.locator('[data-testid="physics-fast-forward-enabled"]').check()
  await lab.locator('[data-testid="physics-fast-forward-steps"]').fill('240')
  await lab.locator('[data-testid="physics-stop-at-seconds"]').fill('2')
  await lab.locator('.physics-lab-header-actions .primary').click()
  await page.waitForFunction(() => {
    const value = document.querySelector('[data-testid="physics-simulation-time"]')?.textContent ?? ''
    return Number.parseFloat(value) >= 2
  }, undefined, { timeout: 30000 })

  const reportButton = lab.locator('.physics-lab-header-actions button').nth(2)
  const downloadPromise = page.waitForEvent('download')
  await reportButton.click()
  const download = await downloadPromise
  const report = JSON.parse(await readFile(await download.path(), 'utf8'))
  const calibration = report.settings?.activeCadFlight?.windTunnelCalibration
  assert.equal(calibration?.source, 'webcad-lbm-wind-tunnel')
  assert.ok(calibration?.cd > 0)
  assert.ok(calibration?.frontalAreaM2 >= 0.01)
  assert.equal(calibration?.speedMps, 12)
  assert.ok(calibration?.reynolds > 0)
  assert.equal(report.settings?.airDensityKgM3, calibration?.densityKgM3)
  assert.equal(report.settings?.windSpeedMps, calibration?.speedMps)
  assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join('\n')}`)
  console.log(JSON.stringify({ ok: true, target: baseURL, windToPhysicsLab: 'lbm-calibrated-cad-flight' }))
} finally {
  await browser.close()
}
