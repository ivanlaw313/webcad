/* Production Assembly acceptance: real imported components, Joint face-pick stage, Escape cancel. */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const baseURL = process.argv[2] ?? 'http://127.0.0.1:4173'
const fixture = resolve('tests/fixtures/external/cube.stl')
assert.ok(existsSync(fixture), 'cube STL fixture is required')
const { chromium } = await import('playwright')
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({ headless: true, ...(existsSync(chromePath) ? { executablePath: chromePath } : {}) })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })

async function importStl(name) {
  const fileButton = page.locator('.tb-text').filter({ hasText: /File|文件/, visible: true })
  assert.equal(await fileButton.count(), 1)
  await fileButton.click()
  const menu = page.locator('.panel-menu')
  await menu.waitFor({ state: 'visible' })
  const importItem = menu.locator('.panel-menu-item').filter({ hasText: /Import STL|导入 STL/ })
  assert.equal(await importItem.count(), 1)
  const chooserPromise = page.waitForEvent('filechooser')
  await importItem.click()
  const chooser = await chooserPromise
  await chooser.setFiles({ name, mimeType: 'model/stl', buffer: await (await import('node:fs/promises')).readFile(fixture) })
}

try {
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'networkidle' })
  await page.locator('.app[data-ui-test="true"]').waitFor()
  await importStl('joint-parent.stl')
  await page.waitForFunction(() => window.useApp?.getState?.().components?.length === 1)
  await importStl('joint-child.stl')
  await page.waitForFunction(() => window.useApp?.getState?.().components?.length === 2)

  const assembly = page.locator('[data-ribbon-group="ASSEMBLE"]')
  assert.equal(await assembly.count(), 1)
  await assembly.click()
  const flyout = page.locator('[data-testid="ribbon-group-menu"]')
  await flyout.waitFor({ state: 'visible' })
  const joint = flyout.locator('[data-cmd="joint"]')
  assert.equal(await joint.count(), 1)
  await joint.click()
  await page.waitForFunction(() => window.useApp?.getState?.().jointPickMode === true)

  const canvas = page.locator('canvas')
  const rect = await canvas.boundingBox()
  assert.ok(rect)
  // Imported components are laid out along the assembly X direction; the
  // left third is an interior face of the parent cube after requestFit.
  await canvas.click({ position: { x: rect.width * .305, y: rect.height * .41 } })
  await page.waitForFunction(() => !!window.useApp?.getState?.().jointPick, { timeout: 15000 })
  const first = await page.evaluate(() => {
    const s = window.useApp.getState()
    return { mode: s.jointPickMode, parent: s.jointPick?.compId, componentCount: s.components.length }
  })
  assert.equal(first.mode, true)
  assert.ok(first.parent)
  assert.equal(first.componentCount, 2)
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !window.useApp?.getState?.().jointPickMode && !window.useApp?.getState?.().jointPick)
  const afterCancel = await page.evaluate(() => ({ joints: window.useApp.getState().joints?.length ?? 0, components: window.useApp.getState().components.length }))
  assert.deepEqual(afterCancel, { joints: 0, components: 2 }, 'Escape must abandon only the transient Joint pick, never delete components')

  // Re-enter and complete the exact same geometry-first workflow.  The green
  // child cube is at the right/lower fitted position; this second real face
  // raycast opens the in-app joint-type prompt rather than a browser prompt.
  await assembly.click()
  await flyout.waitFor({ state: 'visible' })
  await joint.click()
  await page.waitForFunction(() => window.useApp?.getState?.().jointPickMode === true)
  await canvas.click({ position: { x: rect.width * .305, y: rect.height * .41 } })
  await page.waitForFunction(() => !!window.useApp?.getState?.().jointPick)
  await canvas.click({ position: { x: rect.width * .72, y: rect.height * .66 } })
  const typePrompt = page.getByRole('dialog')
  await typePrompt.waitFor({ state: 'visible', timeout: 15000 })
  const typeInput = typePrompt.locator('input')
  assert.equal(await typeInput.count(), 1, 'joint type must be selected through the app dialog')
  await typeInput.fill('1') // rigid, the safe default for two planar faces
  await typeInput.press('Enter')
  await typePrompt.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => (window.useApp?.getState?.().joints?.length ?? 0) === 1, { timeout: 15000 })
  const completed = await page.evaluate(() => {
    const s = window.useApp.getState(); const j = s.joints[0]
    return { count: s.joints.length, type: j?.type, parent: j?.parent, child: j?.child }
  })
  assert.equal(completed.count, 1)
  assert.equal(completed.type, 'rigid')
  assert.ok(completed.parent && completed.child && completed.parent !== completed.child, 'joint must link two distinct components')
  console.log(JSON.stringify({ ok: true, target: baseURL, jointPick: { first, afterCancel, completed } }))
} finally {
  await browser.close()
}
