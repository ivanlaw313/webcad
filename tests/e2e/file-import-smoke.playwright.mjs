/*
 * Browser-level import acceptance.  This deliberately exercises the native
 * file chooser that a customer reaches through File > Import STL, rather than
 * calling the STL parser directly.  `ui-test=1` guarantees it never touches
 * an operator's restored/autosaved project.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

const baseURL = process.argv[2] ?? 'http://127.0.0.1:4173'
const { chromium } = await import('playwright')
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

// A watertight 10 mm cube: 8 vertices, 12 triangles.  ASCII keeps the
// fixture transparent and means the test validates the real client-side file
// reading route, not a server upload or a hidden test-only parser API.
const cubeStl = `solid import_smoke_cube
 facet normal 0 0 -1
  outer loop
   vertex 0 0 0
   vertex 10 10 0
   vertex 10 0 0
  endloop
 endfacet
 facet normal 0 0 -1
  outer loop
   vertex 0 0 0
   vertex 0 10 0
   vertex 10 10 0
  endloop
 endfacet
 facet normal 0 0 1
  outer loop
   vertex 0 0 10
   vertex 10 0 10
   vertex 10 10 10
  endloop
 endfacet
 facet normal 0 0 1
  outer loop
   vertex 0 0 10
   vertex 10 10 10
   vertex 0 10 10
  endloop
 endfacet
 facet normal 0 -1 0
  outer loop
   vertex 0 0 0
   vertex 10 0 0
   vertex 10 0 10
  endloop
 endfacet
 facet normal 0 -1 0
  outer loop
   vertex 0 0 0
   vertex 10 0 10
   vertex 0 0 10
  endloop
 endfacet
 facet normal 0 1 0
  outer loop
   vertex 0 10 0
   vertex 0 10 10
   vertex 10 10 10
  endloop
 endfacet
 facet normal 0 1 0
  outer loop
   vertex 0 10 0
   vertex 10 10 10
   vertex 10 10 0
  endloop
 endfacet
 facet normal -1 0 0
  outer loop
   vertex 0 0 0
   vertex 0 0 10
   vertex 0 10 10
  endloop
 endfacet
 facet normal -1 0 0
  outer loop
   vertex 0 0 0
   vertex 0 10 10
   vertex 0 10 0
  endloop
 endfacet
 facet normal 1 0 0
  outer loop
   vertex 10 0 0
   vertex 10 10 0
   vertex 10 10 10
  endloop
 endfacet
 facet normal 1 0 0
  outer loop
   vertex 10 0 0
   vertex 10 10 10
   vertex 10 0 10
  endloop
 endfacet
endsolid import_smoke_cube
`

const browser = await chromium.launch({ headless: true, ...(existsSync(chromePath) ? { executablePath: chromePath } : {}) })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })

try {
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'networkidle' })
  await page.locator('.app[data-ui-test="true"]').waitFor()

  // `.tb-text` is also used by the adjacent appearance menu.  Bind to the
  // visible File label instead of choosing a source position, so a toolbar
  // re-order cannot silently send this test to the wrong command.
  const fileButton = page.locator('.tb-text').filter({ hasText: /File|文件/, visible: true })
  assert.equal(await fileButton.count(), 1, 'File menu button must be unique')
  await fileButton.click()
  const fileMenu = page.locator('.panel-menu')
  await fileMenu.waitFor({ state: 'visible' })
  const importStl = fileMenu.locator('.panel-menu-item').filter({ hasText: /Import STL|导入 STL/ })
  assert.equal(await importStl.count(), 1, 'File menu must expose exactly one Import STL item')

  const chooserPromise = page.waitForEvent('filechooser')
  await importStl.click()
  const chooser = await chooserPromise
  assert.equal(chooser.isMultiple(), false, 'STL import intentionally accepts one source file at a time')
  await chooser.setFiles({ name: 'import-smoke-cube.stl', mimeType: 'model/stl', buffer: Buffer.from(cubeStl) })

  await page.waitForFunction(() => window.useApp?.getState?.().components?.length === 1, { timeout: 15000 })
  const imported = await page.evaluate(() => {
    const c = window.useApp.getState().components[0]
    return { name: c?.name, vertices: c?.mesh?.vertices?.length ?? 0, triangles: c?.mesh?.triangles?.length ?? 0 }
  })
  assert.equal(imported.name, 'import-smoke-cube')
  assert.equal(imported.triangles, 36, 'the imported cube must retain all 12 STL triangles')
  assert.ok(imported.vertices >= 24, 'the imported mesh must contain geometric vertices')
  console.log(JSON.stringify({ ok: true, target: baseURL, import: imported }))
} finally {
  await browser.close()
}
