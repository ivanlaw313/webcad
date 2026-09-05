/* Browser acceptance for the complete SVG import UI: File chooser, import
 * options, editable-sketch handoff, and a real parametric solid in history. */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

const baseURL = process.argv[2] ?? 'http://127.0.0.1:4173'
const { chromium } = await import('playwright')
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect x="0" y="0" width="20" height="10"/></svg>`

const browser = await chromium.launch({ headless: true, ...(existsSync(chromePath) ? { executablePath: chromePath } : {}) })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })

try {
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'networkidle' })
  await page.locator('.app[data-ui-test="true"]').waitFor()
  const fileButton = page.locator('.tb-text').filter({ hasText: /File|文件/, visible: true })
  assert.equal(await fileButton.count(), 1, 'File menu button must be unique')
  await fileButton.click()
  const fileMenu = page.locator('.panel-menu')
  await fileMenu.waitFor({ state: 'visible' })
  const importSvg = fileMenu.locator('.panel-menu-item').filter({ hasText: /Import SVG|导入 SVG/ })
  assert.equal(await importSvg.count(), 1, 'File menu must expose Import SVG')

  const chooserPromise = page.waitForEvent('filechooser')
  await importSvg.click()
  const chooser = await chooserPromise
  await chooser.setFiles({ name: 'svg-import-profile.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) })

  const dialog = page.getByRole('dialog').filter({ hasText: /SVG/ })
  await dialog.waitFor({ state: 'visible' })
  assert.equal(await dialog.count(), 1, 'SVG import must open exactly one options dialog')
  const plane = dialog.locator('select')
  assert.equal(await plane.count(), 1, 'SVG dialog must offer a placement plane')
  await plane.selectOption('XZ')
  const inputs = dialog.locator('input[type="number"]')
  assert.equal(await inputs.count(), 3, 'SVG dialog must expose angle, scale and height')
  await inputs.nth(1).fill('1.5')
  await inputs.nth(2).fill('8')
  const editable = dialog.locator('input[type="checkbox"]')
  assert.equal(await editable.count(), 1, 'SVG dialog must expose editable-sketch mode')
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.querySelector('[data-testid="timeline"]')?.getAttribute('data-feature-count') === '1', { timeout: 15000 })

  const imported = await page.evaluate(() => {
    const s = window.useApp.getState()
    const f = s.features[0]
    return { plane: f?.plane, height: f?.height, sketchSources: Object.keys(s.sketchSources).length, triangleCount: s.bodyMesh?.triangles?.length ?? 0 }
  })
  assert.deepEqual(imported.plane, 'XZ', 'SVG placement plane must reach the resulting feature')
  assert.equal(imported.height, 8, 'SVG extrusion height must reach the resulting feature')
  assert.equal(imported.sketchSources, 1, 'editable SVG import must retain a sketch source')
  assert.ok(imported.triangleCount > 0, 'SVG import must produce visible solid geometry')
  console.log(JSON.stringify({ ok: true, target: baseURL, svgImport: imported }))
} finally {
  await browser.close()
}
