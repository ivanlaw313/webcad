import { chromium } from './browser-session.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
const root = path.resolve('../..'), out = path.resolve(process.env.WEBCAD_TEST_OUTPUT_DIR || path.join(root, 'outputs/phase9-face'))
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: process.env.WEBCAD_TEST_HEADED !== '1', args: ['--use-angle=metal'], executablePath: path.join(root, 'work/runtime/video-browser/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing') })
const page = await browser.newPage({ viewport: { width: 1284, height: 762 } }), checks = [], errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto(process.env.WEBCAD_TEST_URL || 'http://127.0.0.1:4173/?ui-test=1', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.useApp && window.__three)
  await page.evaluate(async () => {
    const a = window.useApp
    a.setState({ ...a.getInitialState() }, true)
    await a.getState().applyFeatures([{ id: 'base', type: 'extrude', profile: { kind: 'rect', a: [-10, -10], b: [10, 10] }, height: 10, operation: 'new' }], 'fixture', false)
    a.getState().startSketch()
    const t = window.__three
    t.camera.position.set(45, 55, 70); t.controls.target.set(0, 5, 0); t.controls.update()
  })
  await page.waitForTimeout(600)
  // Pick an interior point away from the XZ/YZ origin-plane intersections.
  // The old top-center ray hit the selectable YZ datum exactly at x=0.
  const target = await page.evaluate(() => {
    const camera = window.__three.camera, p = camera.position.clone().set(5, 10, 5).project(camera)
    const rect = document.querySelector('canvas').getBoundingClientRect()
    return { x: rect.x + (p.x + 1) * rect.width / 2, y: rect.y + (1 - p.y) * rect.height / 2 }
  })
  await page.mouse.click(target.x, target.y)
  await page.waitForFunction(() => window.useApp.getState().mode === 'sketch')
  assert.equal(await page.evaluate(() => window.useApp.getState().pendingSketchFaceBinding?.sourceId), 'base')
  await page.evaluate(() => window.useApp.setState({ sketchShape: { type: 'rect', a: [-5, -5], b: [5, 5] } }))
  await page.keyboard.press('e')
  await page.getByLabel('距离表达式', { exact: true }).fill('5')
  await page.getByRole('dialog').getByRole('button', { name: /确定/ }).click()
  await page.waitForFunction(() => window.useApp.getState().mode === 'model' && !window.useApp.getState().busy)
  checks.push('real mouse picks the source face; E and numeric dialog create an attached boss')
  await page.evaluate(() => window.useApp.getState().selectFeature('base'))
  const height = page.locator('.feat-editor').getByLabel(/^高度/).first()
  await height.fill('15'); await height.press('Enter')
  await page.waitForFunction(() => !window.useApp.getState().busy && window.useApp.getState().features[0].height === 15)
  const result = await page.evaluate(() => {
    const s = window.useApp.getState()
    return { sources: s.sketchSources, errors: s.failedFeatureIds, top: Math.max(...s.bodyMesh.vertices.filter((_, i) => i % 3 === 2)) }
  })
  assert.equal(Object.values(result.sources)[0].baseZ, 15)
  assert.equal(result.top, 20)
  assert.deepEqual(result.errors, [])
  await page.keyboard.press('Escape')
  await page.screenshot({ path: path.join(out, 'attached-boss-after-height-edit.png') })
  await page.keyboard.press('Control+z')
  await page.waitForFunction(() => !window.useApp.getState().busy && window.useApp.getState().features[0].height === 10)
  await page.keyboard.press('Control+Shift+z')
  await page.waitForFunction(() => !window.useApp.getState().busy && window.useApp.getState().features[0].height === 15)
  assert.equal(await page.evaluate(() => Object.values(window.useApp.getState().sketchSources)[0].baseZ), 15)
  checks.push('numeric timeline height edits preserve attachment and keyboard undo/redo restores the frame')
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(out, 'browser-validation.json'), JSON.stringify({ status: 'PASS', checks, errors }, null, 2))
  console.log(checks)
} catch (error) {
  await page.screenshot({ path: path.join(out, 'failure.png') })
  throw error
} finally { await browser.close() }
