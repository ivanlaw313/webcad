/* Real assembly fixture acceptance: load the built-in closed four-bar through
 * the command palette, then verify that its actual assembly joints reach the
 * browser rigid-body lab. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseURL = (process.argv[2] ?? 'https://cad.neuralworkshk.com').replace(/\/$/, '')
const executablePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({ headless: true, executablePath })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'networkidle', timeout: 60000 })

  // The command palette is the user-facing path to the fixture, rather than
  // injecting a synthetic document into state or localStorage.
  await page.keyboard.press('/')
  const query = page.locator('input:focus')
  await query.fill('fourbarAsm')
  await page.locator('[data-i="0"]').click()
  // Template loading is synchronous for the four-bar's mesh components; wait
  // for the palette to close instead of depending on browser-tree CSS classes.
  await page.locator('[data-i="0"]').waitFor({ state: 'hidden', timeout: 30000 })

  await page.locator('.ribbon-tab', { hasText: '🧪實驗室' }).click()
  await page.locator('[data-cmd="physicslab"]').click()
  const lab = page.locator('.physics-lab')
  await lab.waitFor({ state: 'visible', timeout: 30000 })
  const components = lab.getByRole('checkbox', { name: /將可見元件投入實驗/ })
  await components.check()
  await expectText(lab, /物理 Joint：4；未轉換：0/)
  // The final range is rendered only after the imported revolute/slider joints
  // are available. Set a non-zero value through the real UI before playback.
  const componentMotor = lab.locator('[data-testid="physics-component-joint-rpm"]')
  await componentMotor.evaluate((input) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '30'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })) })
  assert.equal(await componentMotor.inputValue(), '30')
  await lab.locator('[data-testid="physics-component-joint-max-torque"]').fill('80')
  await lab.locator('[data-testid="physics-component-joint-max-force"]').fill('1200')
  await lab.locator('[data-testid="physics-component-joint-efficiency"]').fill('0.75')
  await lab.getByRole('button', { name: /播放/ }).click()
  await page.waitForTimeout(1200)
  await lab.locator('[data-testid="physics-component-joint-actuators"] dd').first().waitFor({ state: 'visible', timeout: 30000 })
  const downloadPromise = page.waitForEvent('download')
  await lab.getByRole('button', { name: '報告' }).click()
  const report = JSON.parse(await readFile(await (await downloadPromise).path(), 'utf8'))
  assert.equal(report.settings?.componentJointActuator?.maxRevoluteTorqueNm, 80)
  assert.equal(report.settings?.componentJointActuator?.maxSliderForceN, 1200)
  assert.equal(report.settings?.componentJointActuator?.electricalEfficiency, 0.75)
  assert.equal(report.settings?.componentJointActuator?.model, 'bounded-velocity-servo-with-limit-and-stall-telemetry')
  assert.equal(report.importedJointActuatorTelemetry?.length, 4)
  assert.ok(report.importedJointActuatorTelemetry.every((entry) =>
    Number.isFinite(entry.measuredVelocity) && Number.isFinite(entry.estimatedEffort) &&
    Number.isFinite(entry.electricalPowerW) && entry.maxEffort === 80
  ))
  assert.equal(errors.length, 0, `page errors: ${errors.join('\n')}`)
  console.log(JSON.stringify({ ok: true, target: baseURL, physicsLabJoints: 'fourbar-loaded-and-four-revolute-joints-converted' }))
} finally {
  await browser.close()
}

async function expectText(locator, expected) {
  await locator.getByText(expected).waitFor({ state: 'visible', timeout: 30000 })
}
