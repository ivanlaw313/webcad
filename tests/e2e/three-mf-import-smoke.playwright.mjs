/* Browser acceptance for the common 3MF print exchange route.  The fixture is
 * an actual ZIP-backed 3MF package, not a parser-only XML call. */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { strToU8, zipSync } from 'fflate'

const baseURL = process.argv[2] ?? 'http://127.0.0.1:4173'
const { chromium } = await import('playwright')
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
// Match WebCAD's exported OPC structure exactly, except use centimetres to
// exercise the importer conversion path too.
const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="centimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model" name="3mf-import-triangle"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object></resources><build><item objectid="1"/></build></model>`
const packageBytes = zipSync({
  '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'),
  '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
  '3D/3dmodel.model': strToU8(model),
})

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
  const import3mf = fileMenu.locator('.panel-menu-item').filter({ hasText: /Import 3MF|导入 3MF/ })
  assert.equal(await import3mf.count(), 1, 'File menu must expose Import 3MF')
  const chooserPromise = page.waitForEvent('filechooser')
  await import3mf.click()
  const chooser = await chooserPromise
  await chooser.setFiles({ name: 'three-mf-import-smoke.3mf', mimeType: 'model/3mf', buffer: Buffer.from(packageBytes) })
  try {
    await page.waitForFunction(() => window.useApp?.getState?.().components?.length === 1, { timeout: 15000 })
  } catch (error) {
    // Keep a failed production acceptance run diagnosable without weakening
    // its assertion: parser/import status is the authoritative UI outcome.
    console.error(JSON.stringify({ importFailure: await page.evaluate(() => window.useApp?.getState?.().status) }))
    throw error
  }

  const imported = await page.evaluate(() => {
    const c = window.useApp.getState().components[0]
    return { name: c.name, vertices: c.mesh.vertices.length, triangles: c.mesh.triangles.length, pos: c.pos }
  })
  assert.equal(imported.name, 'three-mf-import-smoke')
  assert.equal(imported.triangles, 3, '3MF build item must retain its triangle')
  assert.equal(imported.vertices, 9, '3MF build item must retain all three vertices')
  console.log(JSON.stringify({ ok: true, target: baseURL, threeMfImport: imported }))
} finally {
  await browser.close()
}
