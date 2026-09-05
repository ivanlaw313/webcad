/*
 * Production acceptance for the editable STEP route.  The source file is
 * generated from the same OCCT build used by the app, then selected through
 * File > Import STEP as Solid rather than calling the store or worker API.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox } = await import('replicad')
const { default: opencascade } = await import('../../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)
const stepBytes = Buffer.from(await (await makeBaseBox(30, 20, 10).blobSTEP()).arrayBuffer())
assert.ok(stepBytes.length > 1000, 'fixture must be a real STEP B-rep')

const baseURL = process.argv[2] ?? 'http://127.0.0.1:4173'
const { chromium } = await import('playwright')
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
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
  const importStepSolid = fileMenu.locator('.panel-menu-item').filter({ hasText: /Import STEP as Solid|导入 STEP 为实体/ })
  assert.equal(await importStepSolid.count(), 1, 'File menu must expose the editable STEP import route')

  const chooserPromise = page.waitForEvent('filechooser')
  await importStepSolid.click()
  const chooser = await chooserPromise
  assert.equal(chooser.isMultiple(), false, 'STEP solid import accepts one source file')
  await chooser.setFiles({ name: 'step-brep-import-smoke.step', mimeType: 'application/step', buffer: stepBytes })

  await page.waitForFunction(() => {
    const s = window.useApp?.getState?.()
    return s && !s.busy && s.features?.some((f) => f.type === 'stepbody')
  }, { timeout: 30000 })
  const imported = await page.evaluate(() => {
    const s = window.useApp.getState()
    const f = s.features.find((item) => item.type === 'stepbody')
    return { type: f?.type, bytes: f?.step?.length ?? 0, bodyCount: s.bodies?.length ?? 0 }
  })
  assert.equal(imported.type, 'stepbody')
  assert.ok(imported.bytes > 1000, 'timeline must retain the STEP B-rep source for editable rebuilds')
  console.log(JSON.stringify({ ok: true, target: baseURL, stepBrepImport: imported }))
} finally {
  await browser.close()
}
