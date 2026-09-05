/* Browser acceptance for DXF: native chooser, layered profile parsing, unit
 * conversion and editable-sketch extrusion options. */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

const baseURL = process.argv[2] ?? 'http://127.0.0.1:4173'
const { chromium } = await import('playwright')
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const dxf = ['0', 'SECTION', '2', 'ENTITIES',
  '0', 'CIRCLE', '8', 'outer', '10', '0', '20', '0', '40', '1',
  '0', 'CIRCLE', '8', 'holes', '10', '0', '20', '0', '40', '0.3',
  '0', 'ENDSEC', '0', 'EOF'].join('\n')

const browser = await chromium.launch({ headless: true, ...(existsSync(chromePath) ? { executablePath: chromePath } : {}) })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })

try {
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'networkidle' })
  await page.locator('.app[data-ui-test="true"]').waitFor()
  const fileButton = page.locator('.tb-text').filter({ hasText: /File|文件/, visible: true })
  assert.equal(await fileButton.count(), 1)
  await fileButton.click()
  const fileMenu = page.locator('.panel-menu')
  await fileMenu.waitFor({ state: 'visible' })
  const importDxf = fileMenu.locator('.panel-menu-item').filter({ hasText: /Import DXF|导入 DXF/ })
  assert.equal(await importDxf.count(), 1, 'File menu must expose Import DXF')
  const chooserPromise = page.waitForEvent('filechooser')
  await importDxf.click()
  const chooser = await chooserPromise
  await chooser.setFiles({ name: 'dxf-options-rings.dxf', mimeType: 'application/dxf', buffer: Buffer.from(dxf) })

  const dialog = page.getByRole('dialog').filter({ hasText: /DXF/ })
  await dialog.waitFor({ state: 'visible' })
  assert.equal(await dialog.count(), 1, 'DXF import must open one options dialog')
  const selects = dialog.locator('select')
  assert.equal(await selects.count(), 2, 'DXF dialog must expose plane and source units')
  await selects.nth(0).selectOption('YZ')
  await selects.nth(1).selectOption('inch')
  const inputs = dialog.locator('input[type="number"]')
  assert.equal(await inputs.count(), 3, 'DXF dialog must expose angle, scale and height')
  await inputs.nth(1).fill('2')
  await inputs.nth(2).fill('6')
  const checks = dialog.locator('input[type="checkbox"]')
  assert.equal(await checks.count(), 3, 'DXF dialog must expose editable mode and both parsed layers')
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => (window.useApp?.getState?.().features?.length ?? 0) > 0, { timeout: 15000 })

  const imported = await page.evaluate(() => {
    const s = window.useApp.getState()
    const source = Object.values(s.sketchSources)[0]
    const radii = source.shapes.filter((x) => x.type === 'circle').map((x) => x.r)
    return { planes: s.features.map((f) => f.plane), heights: s.features.map((f) => f.height), sketchSources: Object.keys(s.sketchSources).length, maxRadius: Math.max(...radii), triangles: s.bodyMesh?.triangles?.length ?? 0 }
  })
  assert.ok(imported.planes.every((p) => p === 'YZ'), 'DXF plane choice must reach all resulting features')
  assert.ok(imported.heights.every((h) => h === 6), 'DXF height choice must reach all resulting features')
  assert.equal(imported.sketchSources, 1, 'DXF editable mode must retain its source sketch')
  assert.ok(Math.abs(imported.maxRadius - 50.8) < 1e-6, 'inch × scale 2 must convert the one-inch outer radius to 50.8 mm')
  assert.ok(imported.triangles > 0, 'DXF import must produce a visible solid')
  console.log(JSON.stringify({ ok: true, target: baseURL, dxfImport: imported }))
} finally {
  await browser.close()
}
