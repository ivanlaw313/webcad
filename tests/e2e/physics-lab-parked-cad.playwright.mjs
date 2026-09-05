/* Browser acceptance: two ordinary WebCAD Bodies (not an assembly) must both
 * reach Physics Lab. The first body becomes MeshData.parked after New Body. */
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

  const createBox = async (width, depth, height) => {
    await page.keyboard.press('/')
    await page.locator('input:focus').fill('box')
    await page.locator('[data-i="0"]').click()
    const dialog = page.locator('[data-testid="command-dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 30000 })
    const dimensions = dialog.locator('input[inputmode="decimal"]')
    await dimensions.nth(0).fill(String(width))
    await dimensions.nth(1).fill(String(depth))
    await dimensions.nth(2).fill(String(height))
    await page.keyboard.press('Enter')
    await dialog.waitFor({ state: 'hidden', timeout: 30000 })
  }

  await createBox(50, 40, 20)
  await page.keyboard.press('/')
  await page.locator('input:focus').fill('newbody')
  await page.locator('[data-i="0"]').click()
  await page.waitForTimeout(500)
  await createBox(30, 25, 15)

  await page.keyboard.press('/')
  await page.locator('input:focus').fill('physicslab')
  await page.locator('[data-i="0"]').click()
  const lab = page.locator('.physics-lab')
  await lab.waitFor({ state: 'visible', timeout: 30000 })
  await lab.locator('.physics-lab-header-actions .primary').click()
  await page.waitForTimeout(1100)
  const downloadPromise = page.waitForEvent('download')
  await lab.locator('.physics-lab-header-actions button').nth(2).click()
  const report = JSON.parse(await readFile(await (await downloadPromise).path(), 'utf8'))
  assert.ok(report.parkedCadBodies?.length >= 1, 'a normal New Body sibling must be loaded into Physics Lab')
  assert.ok(report.parkedCadBodies.every((body) => body.bodyMode === 'fixed' && body.collider === 'convex-hull'))
  assert.ok(
    report.collisionEvents?.some((event) => String(event.label).includes('CAD 固定實體')),
    'the active body must physically collide with its parked sibling, not merely list it in the report',
  )
  assert.equal(errors.length, 0, `page errors: ${errors.join('\n')}`)
  console.log(JSON.stringify({ ok: true, target: baseURL, parkedCadBodies: report.parkedCadBodies.length }))
} finally {
  await browser.close()
}
