/* Production acceptance: a dragged viewport HUD never escapes its parent canvas. */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

const baseURL = process.argv[2] ?? 'http://127.0.0.1:4173'
const { chromium } = await import('playwright')
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({ headless: true, ...(existsSync(chromePath) ? { executablePath: chromePath } : {}) })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })

async function dragTo(x, y) {
  const handle = page.locator('.vp-navbar .vp-hud-handle')
  const rect = await handle.boundingBox()
  assert.ok(rect, 'navigation drag handle must be visible')
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
  await page.mouse.down()
  await page.mouse.move(x, y, { steps: 4 })
  await page.mouse.up()
  return page.locator('.vp-navbar').evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
}

try {
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'networkidle' })
  await page.locator('.vp-navbar .vp-hud-handle').waitFor()
  const results = [await dragTo(-900, -700), await dragTo(4000, 3000)]
  for (const panel of results) {
    assert.ok(panel.x >= 0 && panel.y >= 0, `panel must not start outside viewport: ${JSON.stringify(panel)}`)
    assert.ok(panel.x + panel.width <= 1440 && panel.y + panel.height <= 960, `panel must remain fully reachable: ${JSON.stringify(panel)}`)
  }
  console.log(JSON.stringify({ ok: true, target: baseURL, draggablePanelBoundary: results }))
} finally {
  await browser.close()
}
