/*
 * Real-browser production acceptance / soak harness.
 *
 * This script ALWAYS uses ?ui-test=1, which keeps the operator's saved
 * document and autosave store out of scope.  It is deliberately not part of
 * the normal unit-test suite: it needs browser binaries and a running site.
 *
 * Examples (from the repository root):
 *   npm i -D playwright
 *   npx playwright install chromium firefox
 *   node tests/e2e/production-webgl-soak.playwright.mjs https://cad.neuralworkshk.com
 *   E2E_BROWSERS=chrome,edge node tests/e2e/production-webgl-soak.playwright.mjs https://cad.neuralworkshk.com
 *   E2E_CYCLES=100 E2E_SOAK_MS=1800000 node tests/e2e/production-webgl-soak.playwright.mjs https://cad.neuralworkshk.com
 *
 * The result is a JSON report under tests/e2e/artifacts/.  A missing browser
 * is reported as skipped, never as a passing cross-browser run.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const baseURL = (process.argv[2] ?? 'http://127.0.0.1:4173').replace(/\/$/, '')
const cycles = Math.max(1, Number.parseInt(process.env.E2E_CYCLES ?? '20', 10) || 20)
const soakMs = Math.max(0, Number.parseInt(process.env.E2E_SOAK_MS ?? '300000', 10) || 0)
const selected = (process.env.E2E_BROWSERS ?? 'chrome,edge,firefox').split(',').map(x => x.trim()).filter(Boolean)
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const artifacts = resolve(root, 'tests/e2e/artifacts')
mkdirSync(artifacts, { recursive: true })

let pw
try {
  pw = await import('playwright')
} catch {
  throw new Error('Playwright is not installed. Run `npm i -D playwright` and `npx playwright install chromium firefox`; no browser result was produced.')
}

const executables = {
  chrome: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  edge: process.env.EDGE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  firefox: process.env.FIREFOX_PATH ?? 'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
}
const report = { target: `${baseURL}/?ui-test=1`, cycles, soakMs, startedAt: new Date().toISOString(), results: [] }

function sampleMetrics(page) {
  return page.evaluate(() => ({
    now: performance.now(),
    resourceCount: performance.getEntriesByType('resource').length,
    heap: performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null,
    canvases: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height })),
    featureCount: Number(document.querySelector('[data-testid="timeline"]')?.getAttribute('data-feature-count') ?? -1),
    isolated: document.querySelector('.app')?.getAttribute('data-ui-test'),
  }))
}

async function ribbonLayoutMetrics(page) {
  return page.evaluate(() => {
    const controls = [...document.querySelectorAll('[data-cmd]')].map((el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 }
    }).filter((item) => item.visible)
    let overlaps = 0
    for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i], b = controls[j]
      const area = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
      if (area > 16) overlaps++
    }
    const ribbon = document.querySelector('.ribbon')
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      ribbonWidth: Math.round(ribbon?.getBoundingClientRect().width ?? 0),
      controlOverlaps: overlaps,
    }
  })
}

async function createBox(page, seed) {
  const ribbonBox = page.locator('[data-cmd="box"]').first()
  if (await ribbonBox.count()) {
    await ribbonBox.click()
  } else {
    // Once a first body exists the onboarding shortcut disappears.  Continue
    // through the same CREATE flyout a CAD operator uses.
    await page.locator('[data-ribbon-group="CREATE"]').click()
    const menu = page.locator('[data-testid="ribbon-group-menu"]')
    await menu.waitFor()
    await menu.getByText(/长方体|長方體|Box/i, { exact: true }).click()
  }
  const dialog = page.locator('[data-testid="command-dialog"]')
  await dialog.waitFor()
  // Command dialogs intentionally accept typed unit expressions as well as
  // numbers, so their inputs are not restricted to type=number.
  const fields = dialog.locator('input')
  assert.ok(await fields.count() >= 3, 'box dialog must expose length, width, and height inputs')
  await fields.nth(0).fill(String(20 + (seed % 7)))
  await fields.nth(1).fill(String(25 + (seed % 11)))
  await fields.nth(2).fill(String(15 + (seed % 13)))
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
}

async function runBrowser(name) {
  const result = { browser: name, status: 'failed', consoleErrors: [], pageErrors: [], metrics: [], ribbonLayout: null }
  const executablePath = executables[name]
  // Chromium-family audits use the operator-installed browser. Firefox is
  // intentionally launched from Playwright's managed runtime so it remains
  // reproducible on Windows machines where Firefox is not a desktop install.
  if (name !== 'firefox' && !existsSync(executablePath)) {
    result.status = 'skipped'
    result.reason = `browser executable not found: ${executablePath}`
    return result
  }
  const type = name === 'firefox' ? pw.firefox : pw.chromium
  let browser
  let page
  try {
    browser = await type.launch({ headless: true, ...(name === 'firefox' ? {} : { executablePath }) })
    page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 })
    page.on('console', msg => { if (msg.type() === 'error') result.consoleErrors.push(msg.text()) })
    page.on('pageerror', err => result.pageErrors.push(String(err)))
    await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.locator('.app[data-ui-test="true"]').waitFor({ timeout: 30_000 })
    assert.equal(await page.locator('[data-testid="timeline"]').getAttribute('data-feature-count'), '0', 'isolated document must start empty')
    assert.equal(await page.locator('.app').getAttribute('data-ui-test'), 'true', 'production run must be isolated')
    result.ribbonLayout = await ribbonLayoutMetrics(page)
    assert.ok(result.ribbonLayout.documentWidth <= result.ribbonLayout.viewportWidth, `ribbon must not widen the document (${result.ribbonLayout.documentWidth} > ${result.ribbonLayout.viewportWidth})`)
    assert.equal(result.ribbonLayout.controlOverlaps, 0, 'visible ribbon command controls must not overlap')

    // UI display choices must operate on the actual production canvas session.
    for (const style of ['shaded', 'shadedHidden', 'shadedVisible', 'wire', 'wireHidden', 'wireVisible']) {
      await page.locator('[data-testid="visual-style-menu-trigger"]').click()
      await page.locator(`[data-testid="visual-style-${style}"]`).click()
      await page.locator('[data-testid="visual-style-menu-trigger"]').click()
      await expectStyle(page, style)
      await page.locator('[data-testid="visual-style-menu-trigger"]').click()
    }
    await page.locator('[data-testid="visual-style-menu-trigger"]').click()
    await page.locator('[data-testid="viewport-body-colour"]').evaluate((input) => {
      input.value = '#264f7a'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.locator('[data-testid="visual-style-menu-trigger"]').click()

    result.metrics.push(await sampleMetrics(page))
    for (let i = 0; i < cycles; i++) {
      await createBox(page, i)
      // Exercise history without relying on a private store API.
      await page.keyboard.press('Control+z')
      await page.keyboard.press('Control+y')
      if (i % 5 === 4) result.metrics.push(await sampleMetrics(page))
    }
    const canvas = page.locator('canvas').first()
    await canvas.waitFor({ timeout: 30_000 })
    const box = await canvas.boundingBox()
    assert.ok(box && box.width > 100 && box.height > 100, 'WebGL canvas must have a visible render area')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -120)
    await page.screenshot({ path: resolve(artifacts, `production-${name}.png`), fullPage: true })

    const deadline = Date.now() + soakMs
    while (Date.now() < deadline) {
      await page.waitForTimeout(10_000)
      result.metrics.push(await sampleMetrics(page))
    }
    result.metrics.push(await sampleMetrics(page))
    assert.equal(result.consoleErrors.length, 0, `console errors: ${result.consoleErrors.join('\n')}`)
    assert.equal(result.pageErrors.length, 0, `page errors: ${result.pageErrors.join('\n')}`)
    assert.ok(result.metrics.at(-1).canvases.length > 0, 'canvas disappeared during run')
    result.status = 'passed'
  } catch (error) {
    result.error = String(error?.stack ?? error)
    result.diagnostic = await pageDiagnostic(page)
    result.layout = await layoutDiagnostic(page)
    await page.screenshot({ path: resolve(artifacts, `production-${name}-failure.png`), fullPage: true }).catch(() => {})
  } finally {
    await browser?.close()
  }
  return result
}

async function pageDiagnostic(page) {
  if (!page) return null
  return page.evaluate(() => ({
    url: location.href,
    title: document.title,
    bodyText: document.body?.innerText?.slice(0, 1000) ?? '',
    appPresent: Boolean(document.querySelector('.app')),
  })).catch(() => null)
}

async function layoutDiagnostic(page) {
  if (!page) return null
  return page.evaluate(() => {
    const target = document.querySelector('[data-testid="visual-style-shaded"]')
    const canvas = document.querySelector('canvas')
    if (!target || !canvas) return null
    const r = target.getBoundingClientRect(), c = canvas.getBoundingClientRect()
    const x = r.left + r.width / 2, y = r.top + r.height / 2
    const style = (el) => { const s = getComputedStyle(el); return { position: s.position, zIndex: s.zIndex, pointerEvents: s.pointerEvents, transform: s.transform } }
    const hit = document.elementFromPoint(x, y)
    return {
      target: { rect: { left: r.left, top: r.top, width: r.width, height: r.height }, style: style(target) },
      canvas: { rect: { left: c.left, top: c.top, width: c.width, height: c.height }, style: style(canvas) },
      navbar: style(document.querySelector('.vp-navbar')),
      picker: style(document.querySelector('[data-testid="visual-style-picker"]')),
      hit: hit ? { tag: hit.tagName, testid: hit.getAttribute('data-testid'), className: hit.className } : null,
    }
  }).catch(() => null)
}

async function expectStyle(page, expected) {
  const picker = page.locator('[data-testid="visual-style-picker"]')
  await picker.waitFor()
  await assert.doesNotReject(async () => assert.equal(await picker.getAttribute('data-visual-style'), expected))
}

for (const browser of selected) {
  if (!(browser in executables)) {
    report.results.push({ browser, status: 'skipped', reason: 'unknown browser; use chrome, edge, or firefox' })
  } else {
    report.results.push(await runBrowser(browser))
  }
}
report.finishedAt = new Date().toISOString()
writeFileSync(resolve(artifacts, 'production-webgl-soak-report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
if (report.results.some(x => x.status === 'failed')) process.exitCode = 1
