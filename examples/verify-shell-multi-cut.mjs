import { chromium } from './browser-session.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
const root = path.resolve('../..')
const out = path.resolve(process.env.WEBCAD_TEST_OUTPUT_DIR || path.join(root, 'outputs/shell-multi-cut-browser'))
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ executablePath: path.join(root, 'work/runtime/video-browser/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'), headless: process.env.WEBCAD_TEST_HEADED !== '1', args: ['--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: 1284, height: 762 }, acceptDownloads: true })
page.setDefaultTimeout(120000)
const checks = [], errors = []
page.on('pageerror', e => errors.push(e.message))
const snapshot = () => page.evaluate(() => { const s = window.useApp.getState(); return { features: s.features, failed: s.failedFeatureIds, featureErrors: s.featureErrors, triangles: s.bodyMesh?.triangles.length, status: s.status, busy: s.busy } })
const menuItem = re => page.getByRole('menuitem').filter({ hasText: re })
async function menu() { await page.locator('button[title^="文件：新建"]').click() }
async function open(file, confirm = false) {
  await menu(); const chooser = page.waitForEvent('filechooser'); await menuItem(/^(開啟舊檔案…|Open…)$/).click(); await (await chooser).setFiles(file)
  if (confirm) await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click()
  await page.waitForFunction(() => { const s = window.useApp.getState(); return !s.busy && s.features.some(f => f.id === 'F9') && s.bodyMesh?.triangles.length > 0 })
}
function healthy(s) { assert.deepEqual(s.failed, []); assert.ok(s.triangles > 0); assert.equal(s.features.length, 8); const f = s.features.find(f => f.id === 'F9'); assert.equal(f.profile.islands.length, 4); assert.equal(f.operation, 'cut'); assert.equal(f.plane, 'XZ'); return f }
try {
  await page.goto(process.env.WEBCAD_TEST_URL || 'http://127.0.0.1:4174/?ui-test=1', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.useApp && window.__three)
  await open(path.resolve('tests/fixtures/user-shell-multi-cut.json'))
  const original = await snapshot(); healthy(original)
  await page.evaluate(() => window.useApp.getState().setView('iso')); await page.waitForTimeout(900)
  await page.screenshot({ path: path.join(out, 'user-shell-five-cuts-opened.png') })
  checks.push({ test: 'Actual File Open of user fixture reconstructs shell and five-profile symmetric cut without failed features', triangles: original.triangles })
  await page.locator('[data-fi="7"]').dblclick()
  await page.waitForFunction(() => window.useApp.getState().featDlg?.editId === 'F9')
  const distance = page.getByRole('textbox', { name: '距离表达式', exact: true })
  await distance.fill('480')
  const ok = page.getByRole('button', { name: /^(确定|✓ 确定|OK)$/ }).last()
  await ok.click()
  await page.waitForFunction(() => { const s = window.useApp.getState(); return !s.busy && !s.featDlg && s.features.find(f => f.id === 'F9')?.height === 480 })
  const edited = await snapshot(); healthy(edited); assert.equal(healthy(edited).symmetric, true)
  checks.push({ test: 'Timeline double-click edits symmetric cut total distance while preserving all five profiles', height: 480 })
  await page.keyboard.press('Control+z')
  await page.waitForFunction(() => { const s = window.useApp.getState(); return !s.busy && s.features.find(f => f.id === 'F9')?.height === 464.9 })
  healthy(await snapshot())
  await page.keyboard.press('Control+Shift+z')
  await page.waitForFunction(() => { const s = window.useApp.getState(); return !s.busy && s.features.find(f => f.id === 'F9')?.height === 480 })
  healthy(await snapshot()); checks.push({ test: 'Keyboard Undo and Redo rebuild edited compound chain' })
  await menu(); const downloading = page.waitForEvent('download'); await menuItem(/^(儲存檔案|Save)/).click(); const download = await downloading
  const saved = path.join(out, 'shell-five-cuts-roundtrip.json'); await download.saveAs(saved)
  const payload = JSON.parse(await fs.readFile(saved, 'utf8')); assert.deepEqual(payload.features, JSON.parse(JSON.stringify(edited.features)))
  await open(saved, true); healthy(await snapshot()); assert.deepEqual(JSON.parse(JSON.stringify((await snapshot()).features)), JSON.parse(JSON.stringify(edited.features)))
  checks.push({ test: 'Actual downloaded JSON reopens with edited shell/cut feature tree intact' })
  await page.evaluate(() => { const a = window.useApp; a.getState().setView('iso'); a.setState({ section: { on: true, axis: 'Z', offset: 50, capped: false, flip: false } }) })
  await page.waitForTimeout(800); await page.screenshot({ path: path.join(out, 'user-shell-five-cuts-section.png') })
  checks.push({ test: 'Section display screenshot captured; exact void verification is separate native STEP spatial-probe suite' })
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(out, 'browser-validation.json'), JSON.stringify({ status: 'PASS', checks, errors }, null, 2))
  console.log(`PASS ${checks.length} user shell/cut file, timeline edit, history and disk-roundtrip checks`)
} catch (e) {
  await fs.writeFile(path.join(out, 'failure.json'), JSON.stringify({ message: e.message, checks, snapshot: await snapshot().catch(() => null) }, null, 2))
  await page.screenshot({ path: path.join(out, 'failure.png') }); throw e
} finally { await browser.close() }
