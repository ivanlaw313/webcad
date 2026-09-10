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
    const features = [
      { id: 'plate', type: 'extrude', profile: { kind: 'rect', a: [0, 0], b: [12, 10] }, height: 10, operation: 'new' },
      { id: 'guide', type: 'sketch', sketchId: 's1' },
    ]
    a.setState({ ...a.getInitialState(), features, timelinePos: 2, sketchSources: { s1: {
      shapes: [{ type: 'poly', pts: [[0, 0], [10, 0], [10, -10], [0, -10]], construction: true, projected: true, projectLink: 'all' }],
      cons: [], plane: 'XY', baseZ: 10, height: 10, op: 'new',
    } } }, true)
    await a.getState().applyFeatures(features, 'fixture', false)
    await a.getState().editSketchOf('guide')
  })
  await page.waitForFunction(() => window.useApp.getState().mode === 'sketch')
  const shape = await page.evaluate(() => window.useApp.getState().sketchProfiles[0])
  assert.equal(shape.construction, true)
  assert.equal(Math.max(...shape.pts.map(p => p[0])), 12)
  assert.match(await page.evaluate(() => window.useApp.getState().status), /已更新 1 条关联投影/)
  await page.evaluate(() => window.useApp.getState().skLookAt())
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(out, 'WebCAD-phase8-construction-projection.png') })
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(() => window.useApp.getState().mode), 'sketch')
  await page.getByText('✓ 完成草图', { exact: true }).first().click()
  await page.waitForFunction(() => window.useApp.getState().mode === 'model' && !window.useApp.getState().busy)
  assert.equal(await page.evaluate(() => window.useApp.getState().features.filter(f => f.type === 'extrude').length), 1)
  checks.push('reopen updates construction projection; Esc retains it; Finish Sketch keeps only original solid')
  await page.evaluate(async () => {
    const a = window.useApp
    const onlySketch = [{ id: 'guide', type: 'sketch', sketchId: 's1' }]
    await a.getState().applyFeatures(onlySketch, 'source removed')
    await a.getState().editSketchOf('guide')
  })
  assert.match(await page.evaluate(() => window.useApp.getState().status), /投影来源不可用/)
  assert.equal(await page.evaluate(() => window.useApp.getState().sketchProfiles[0].construction), true)
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(out, 'WebCAD-phase8-missing-projection.png') })
  checks.push('missing source produces an explicit warning and retains cached construction curve')
  await page.evaluate(() => window.useApp.getState().skLookAt())
  const issuePanel = page.getByRole('region', { name: '投影关联状态' })
  await issuePanel.waitFor()
  await page.keyboard.press('Escape')
  assert.equal(await issuePanel.isVisible(), true)
  await issuePanel.getByRole('button', { name: '选择轮廓 1', exact: true }).click()
  assert.equal(await page.evaluate(() => window.useApp.getState().skSel[0].shape), 0)
  await issuePanel.getByRole('button', { name: '断开全部投影连结', exact: true }).click()
  await issuePanel.waitFor({ state: 'hidden' })
  await page.keyboard.press('Control+z')
  await issuePanel.waitFor()
  assert.equal(await page.evaluate(() => window.useApp.getState().sketchProfiles[0]?.projectLinkIssue || window.useApp.getState().sketchShape?.projectLinkIssue), 'missing-source')
  for (const size of [{ width: 390, height: 600 }, { width: 800, height: 400 }]) {
    await page.setViewportSize(size)
    const action = issuePanel.getByRole('button', { name: '断开全部投影连结', exact: true })
    await action.scrollIntoViewIfNeeded()
    assert.ok(await action.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) }))
    await page.screenshot({ path: path.join(out, `WebCAD-projection-issue-${size.width}x${size.height}.png`) })
  }
  await page.keyboard.press('Control+Shift+z')
  await issuePanel.waitFor({ state: 'hidden' })
  checks.push('persistent projection warning survives Look At/Esc; selection and Break Link support undo/redo; actions reachable on narrow/short screens')
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(out, 'WebCAD-phase8-browser-validation.json'), JSON.stringify({ status: 'PASS', checks, errors }, null, 2))
  console.log(checks)
} catch (error) {
  await page.screenshot({ path: path.join(out, 'WebCAD-phase8-browser-failure.png') })
  throw error
} finally { await browser.close() }
