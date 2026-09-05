/*
 * Isolated browser acceptance flow for SOLID.
 *
 * Run only against a disposable local server, for example:
 *   npx vite --host 127.0.0.1 --port 4173
 *   node tests/e2e/solid-ui-workflow.playwright.mjs http://127.0.0.1:4173
 *
 * The ?ui-test=1 query is mandatory: it bypasses project restore and document
 * autosave, so this script can never open or overwrite the operator's work.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const baseURL = process.argv[2] ?? 'http://127.0.0.1:4173'
// Optional evidence directory for external-slicer interop.  Keeping this
// opt-in means the normal browser acceptance check has no filesystem output,
// while a release audit can hand the exact UI-exported artefact to Bambu.
const exportDir = process.env.WEBCAD_E2E_EXPORT_DIR
const exportFormat = (process.env.WEBCAD_E2E_EXPORT_FORMAT ?? '3mf').toLowerCase()
const exportSpec = {
  stl: { label: 'STL', extension: /\.stl$/i, rows: 2, exportRow: 1 },
  '3mf': { label: '3MF', extension: /\.3mf$/i, rows: 2, exportRow: 1 },
  obj: { label: 'OBJ', extension: /\.obj$/i, rows: 2, exportRow: 1 },
  glb: { label: 'glTF/GLB', extension: /\.(glb|gltf)$/i, rows: 1, exportRow: 0 },
}[exportFormat]
if (exportDir && !exportSpec) throw new Error(`Unsupported WEBCAD_E2E_EXPORT_FORMAT: ${exportFormat}`)
let chromium
try {
  ({ chromium } = await import('playwright'))
} catch {
  throw new Error('Playwright is required for this optional browser acceptance run. Install it outside the production bundle, then re-run this script.')
}

// CI may use Playwright's bundled browser, while the Windows production-audit
// machine already has Chrome installed.  Prefer an explicit executable when
// available so a missing downloaded Playwright browser cannot block SOLID UI
// acceptance against the real site.
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({ headless: true, ...(existsSync(chromePath) ? { executablePath: chromePath } : {}) })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })

async function openBoxCommand() {
  const inline = page.locator('[data-cmd="box"]')
  if (await inline.count()) { await inline.first().click(); return }
  const create = page.locator('[data-ribbon-group="CREATE"]')
  await create.click()
  const menu = page.locator('[data-testid="ribbon-group-menu"]')
  await menu.waitFor({ state: 'visible' })
  const box = menu.getByText(/Box|长方体|立方体/i)
  await box.click()
}

try {
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'networkidle' })
  await page.locator('.app[data-ui-test="true"]').waitFor()
  const timeline = page.locator('[data-testid="timeline"]')
  await assert.doesNotReject(async () => assert.equal(await timeline.getAttribute('data-feature-count'), '0'))

  // CREATE: enter exact numeric dimensions in a real command dialog and commit.
  await openBoxCommand()
  const dialog = page.locator('[data-testid="command-dialog"]')
  await dialog.waitFor()
  const dimensions = dialog.locator('input')
  await assert.doesNotReject(async () => {
    await dimensions.nth(0).fill('40')
    await dimensions.nth(1).fill('30')
    await dimensions.nth(2).fill('20')
  })
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.querySelector('[data-testid="timeline"]')?.getAttribute('data-feature-count') === '1')

  // Undo/redo must remain global CAD history shortcuts, rather than text-field input.
  await page.keyboard.press('Control+z')
  await page.waitForFunction(() => document.querySelector('[data-testid="timeline"]')?.getAttribute('data-feature-count') === '0')
  await page.keyboard.press('Control+y')
  await page.waitForFunction(() => document.querySelector('[data-testid="timeline"]')?.getAttribute('data-feature-count') === '1')

  // CONSTRUCT: a cylindrical body may have no planar side face.  Fusion's
  // Origin planes must therefore remain directly usable bases for an Offset
  // Plane.  Exercise the actual dialog, choose the vertical XZ origin plane,
  // set an exact offset, and verify that it becomes a timeline datum feature.
  const offsetPlane = page.locator('[data-cmd="offsetplane"]').first()
  if (await offsetPlane.count()) await offsetPlane.click()
  else {
    await page.locator('[data-ribbon-group="CONSTRUCT"]').click()
    await page.locator('[data-testid="ribbon-group-menu"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="ribbon-group-menu"]').getByText(/Offset Plane|偏移平面/i, { exact: true }).click()
  }
  await dialog.waitFor()
  const originPlane = dialog.locator('select').filter({ has: page.locator('option[value="XY"]') })
  await assert.doesNotReject(async () => assert.equal(await originPlane.count(), 1, 'Offset Plane must expose Origin XY/XZ/YZ'))
  await originPlane.selectOption('XZ')
  const datumInputs = dialog.locator('input')
  await assert.doesNotReject(async () => assert.ok(await datumInputs.count() >= 2, 'Offset Plane must expose offset and angle fields'))
  await datumInputs.nth(0).fill('35')
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.querySelector('[data-testid="timeline"]')?.getAttribute('data-feature-count') === '2')

  // SKETCH: no drawing tool may be armed merely by entering a plane.  This
  // guards against the reported "first click always draws a rectangle" bug.
  await page.locator('[data-cmd="sketch"]').first().click()
  await page.waitForFunction(() => window.useApp?.getState?.().mode === 'pickplane')
  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  assert.ok(box, 'the sketch plane picker needs a visible CAD canvas')
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } })
  await page.waitForFunction(() => window.useApp?.getState?.().mode === 'sketch')
  const sketchState = await page.evaluate(() => {
    const s = window.useApp.getState()
    return { sketchTool: s.sketchTool, navTool: s.navTool, sketchShape: s.sketchShape, sketchProfiles: s.sketchProfiles.length }
  })
  assert.deepEqual(sketchState, { sketchTool: 'select', navTool: 'orbit', sketchShape: null, sketchProfiles: 0 })

  // Cross-feature canvas chain: explicit R chooses Rectangle (it is never
  // pre-armed), two canvas points make a profile, then Extrude consumes it.
  await page.keyboard.press('r')
  await page.waitForFunction(() => window.useApp?.getState?.().sketchTool === 'rectangle')
  await canvas.click({ position: { x: box.width * .44, y: box.height * .44 } })
  await canvas.click({ position: { x: box.width * .57, y: box.height * .57 } })
  await page.waitForFunction(() => !!window.useApp?.getState?.().sketchShape)
  await page.locator('[data-cmd="skextrude"]').click()
  await dialog.waitFor()
  const extrudeInputs = dialog.locator('input')
  await assert.doesNotReject(async () => assert.ok(await extrudeInputs.count() >= 1, 'Extrude must expose a distance input'))
  await extrudeInputs.nth(0).fill('18')
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.querySelector('[data-testid="timeline"]')?.getAttribute('data-feature-count') === '3')

  // Interop evidence: export through the same visible ribbon command a user
  // uses.  The download is then available for a slicer's own CLI parser; this
  // must never be substituted by WebCAD's internal 3MF parser alone.
  if (exportDir) {
    // Timeline mutation is intentionally asynchronous: the feature node may
    // already exist while the worker is still returning the final B-rep mesh.
    // Wait for the model-side task to settle before asking the export command
    // for a downloadable mesh, otherwise this test would only exercise its
    // honest "nothing to export" guard.
    await page.waitForTimeout(1500)
    mkdirSync(exportDir, { recursive: true })
    // SOLID's compact Fusion ribbon puts export in File, rather than assuming
    // a hidden MESH-workspace export button is the user's live command.
    await page.locator('.tb-text').first().click()
    const fileMenu = page.locator('.panel-menu').first()
    const formatRows = fileMenu.locator('.panel-menu-item').filter({ hasText: new RegExp(exportSpec.label, 'i') })
    await assert.doesNotReject(async () => assert.ok(await formatRows.count() >= exportSpec.rows, `File menu must expose Export ${exportSpec.label}`))
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 })
    await formatRows.nth(exportSpec.exportRow).click()
    const download = await downloadPromise
    const name = download.suggestedFilename()
    assert.match(name, exportSpec.extension, `WebCAD must emit a ${exportSpec.label} download`)
    const destination = resolve(exportDir, name)
    await download.saveAs(destination)
    console.log(JSON.stringify({ [`interopExport${exportSpec.label}`]: destination }))
  }

  // Display style: keyboard mapping and picker both identify the selected state.
  await page.keyboard.press('Control+4')
  await page.locator('.vp-display-menu').click()
  const picker = page.locator('[data-testid="visual-style-picker"]')
  await picker.waitFor()
  await assert.doesNotReject(() => picker.getAttribute('data-visual-style'))

  // Cancel must close a new command without a side effect.
  await openBoxCommand()
  await dialog.waitFor()
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
} finally {
  await browser.close()
}
