import { chromium } from './browser-session.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
const root = path.resolve('../..'), out = path.resolve(process.env.WEBCAD_TEST_OUTPUT_DIR || path.join(root, 'outputs')), checks = [], errors = []
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: process.env.WEBCAD_TEST_HEADED !== '1', args: ['--use-angle=metal'], executablePath: path.join(root, 'work/runtime/video-browser/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing') })
const page = await browser.newPage({ viewport: { width: 1284, height: 762 } })
page.on('pageerror', e => errors.push(e.message))
try {
  await page.goto(process.env.WEBCAD_TEST_URL || 'http://127.0.0.1:4173/?ui-test=1', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.useApp && window.__three)
  await page.evaluate(async () => {
    const a = window.useApp
    a.setState({ ...a.getInitialState(), mode: 'sketch', sketchTool: 'select', navTool: 'select',
      sketchPlane: 'XY', sketchShape: { type: 'circle', c: [40, 40], r: 20.123456 },
      skCons: [{ id: 'k1', name: 'd1', kind: 'dim', type: 'dia', a: { kind: 'circle', shape: 0 }, value: 40.246912, driven: true }],
      sketchFocus: { c: [40, 40], span: 100 } }, true)
    a.getState().skLookAt()
    await a.getState().resolveSk()
  })
  const label = page.locator('[data-dimension-id="k1"]')
  await label.waitFor()
  await label.click({ button: 'right' })
  await page.getByRole('button', { name: '转为驱动尺寸', exact: true }).click()
  await page.waitForFunction(() => !window.useApp.getState().skCons[0].driven)
  assert.ok(Math.abs(await page.evaluate(() => window.useApp.getState().sketchShape.r) - 20.123456) < 1e-8)
  await page.keyboard.press('Control+z')
  await page.waitForFunction(() => window.useApp.getState().skCons[0].driven)
  await page.keyboard.press('Control+Shift+z')
  await page.waitForFunction(() => !window.useApp.getState().skCons[0].driven)
  checks.push('right-click reference→driving retains precision and keyboard undo/redo works')
  await label.click()
  const input = page.getByLabel('尺寸数值', { exact: true })
  await input.fill('50')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => Math.abs(window.useApp.getState().sketchShape.r - 25) < 1e-8)
  await label.click()
  await input.fill('80')
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(() => window.useApp.getState().sketchShape.r), 25)
  assert.equal(await page.evaluate(() => window.useApp.getState().mode), 'sketch')
  checks.push('numeric diameter commits with Enter; Esc discards draft without exiting sketch')
  await page.screenshot({ path: path.join(out, 'WebCAD-phase7-sketch-dimension.png') })
  await page.keyboard.press('e')
  await page.getByLabel('距离表达式', { exact: true }).fill('12')
  await page.getByRole('dialog').getByRole('button', { name: /确定/ }).click()
  await page.waitForFunction(() => !window.useApp.getState().busy && window.useApp.getState().mode === 'model')
  const feature = await page.evaluate(() => window.useApp.getState().features.find(f => f.type === 'extrude'))
  assert.equal(feature.profile.r, 25)
  assert.equal(feature.height, 12)
  checks.push('edited sketch extrudes using keyboard command and numeric dialog')
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(out, 'WebCAD-phase7-browser-validation.json'), JSON.stringify({ status: 'PASS', checks, errors }, null, 2))
  console.log(checks)
} catch (error) {
  await page.screenshot({ path: path.join(out, 'WebCAD-phase7-browser-failure.png') })
  throw error
} finally { await browser.close() }
