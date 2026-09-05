/* Browser acceptance for OBJ import options: native chooser, unit conversion
 * and one-transaction ground placement. */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

const baseURL = process.argv[2] ?? 'http://127.0.0.1:4173'
const { chromium } = await import('playwright')
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const obj = `# one-unit cube\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0 0 1\nv 1 0 1\nv 1 1 1\nv 0 1 1\nf 1 3 2\nf 1 4 3\nf 5 6 7\nf 5 7 8\nf 1 2 6\nf 1 6 5\nf 2 3 7\nf 2 7 6\nf 3 4 8\nf 3 8 7\nf 4 1 5\nf 4 5 8\n`

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
  const importObj = fileMenu.locator('.panel-menu-item').filter({ hasText: /Import OBJ|导入 OBJ/ })
  assert.equal(await importObj.count(), 1, 'File menu must expose Import OBJ')
  const chooserPromise = page.waitForEvent('filechooser')
  await importObj.click()
  const chooser = await chooserPromise
  await chooser.setFiles({ name: 'obj-options-cube.obj', mimeType: 'model/obj', buffer: Buffer.from(obj) })

  const dialog = page.getByRole('dialog').filter({ hasText: /OBJ/ })
  await dialog.waitFor({ state: 'visible' })
  assert.equal(await dialog.count(), 1, 'OBJ import must expose its placement options')
  const selects = dialog.locator('select')
  assert.equal(await selects.count(), 2, 'OBJ options must expose unit and placement')
  await selects.nth(0).selectOption('cm')
  await selects.nth(1).selectOption('ground')
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => window.useApp?.getState?.().components?.length === 1, { timeout: 15000 })

  const imported = await page.evaluate(() => {
    const c = window.useApp.getState().components[0]
    const v = c.mesh.vertices
    let maxX = -Infinity
    for (let i = 0; i < v.length; i += 3) maxX = Math.max(maxX, v[i])
    return { name: c.name, triangles: c.mesh.triangles.length, maxX, pos: c.pos }
  })
  assert.equal(imported.name, 'obj-options-cube')
  assert.equal(imported.triangles, 36, 'OBJ must preserve all 12 triangles')
  assert.equal(imported.maxX, 10, 'cm input must be converted to mm mesh coordinates')
  assert.ok(imported.pos.every((v, i) => Math.abs(v - [-5, 0, 5][i]) < 1e-9), 'ground placement must centre X/Y and seat the CAD Z minimum at ground')
  console.log(JSON.stringify({ ok: true, target: baseURL, objImport: imported }))
} finally {
  await browser.close()
}
