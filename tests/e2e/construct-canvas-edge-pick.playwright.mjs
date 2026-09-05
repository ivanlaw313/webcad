/* Production canvas acceptance for CONSTRUCT edge-derived datum geometry. */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

const baseURL = process.argv[2] ?? 'http://127.0.0.1:4173'
const { chromium } = await import('playwright')
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({ headless: true, ...(existsSync(chromePath) ? { executablePath: chromePath } : {}) })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })

async function invoke(command, group) {
  const direct = page.locator(`[data-cmd="${command}"]`)
  const n = await direct.count()
  if (n === 1) { await direct.click(); return }
  assert.equal(n, 0, `${command} must not have ambiguous direct controls`)
  const groupControl = page.locator(`[data-ribbon-group="${group}"]`)
  assert.equal(await groupControl.count(), 1, `${group} flyout must be unique`)
  await groupControl.click()
  const menu = page.locator('[data-testid="ribbon-group-menu"]')
  await menu.waitFor({ state: 'visible' })
  const item = menu.locator(`[data-cmd="${command}"]`)
  assert.equal(await item.count(), 1, `${command} must be reachable from ${group}`)
  await item.click()
}

async function canvasCenter() {
  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  assert.ok(box && box.width > 200 && box.height > 200, 'a visible B-rep canvas is required')
  // The fitted box fills the central viewport.  This is a true R3F pointer
  // event: edgePointAt resolves the nearest OCCT B-rep edge from the ray hit.
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } })
}

try {
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'networkidle' })
  await page.locator('.app[data-ui-test="true"]').waitFor()
  const dialog = page.locator('[data-testid="command-dialog"]')
  await invoke('box', 'CREATE')
  await dialog.waitFor({ state: 'visible' })
  const dimensions = dialog.locator('input')
  await dimensions.nth(0).fill('40'); await dimensions.nth(1).fill('30'); await dimensions.nth(2).fill('20')
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => window.useApp?.getState?.().features?.length === 1)

  // Fusion Point at Vertex: actual canvas hit -> OCCT edge query -> vertex datum.
  await invoke('pointvertex', 'CONSTRUCT')
  await page.waitForFunction(() => window.useApp?.getState?.().edgePtPick?.mode === 'vertex')
  await canvasCenter()
  await page.waitForFunction(() => window.useApp?.getState?.().cpoints?.length === 1)
  const vertexPoint = await page.evaluate(() => window.useApp.getState().cpoints[0])
  assert.equal(vertexPoint.length, 3)
  assert.ok(vertexPoint.every(Number.isFinite), 'vertex-derived datum must contain finite CAD coordinates')

  // Fusion Axis Through Edge: a second real canvas hit resolves a straight
  // B-rep edge and emits its full 3D direction, not merely an X/Y/Z label.
  await invoke('axisedge', 'CONSTRUCT')
  await page.waitForFunction(() => window.useApp?.getState?.().edgePtPick?.mode === 'edgeaxis')
  await canvasCenter()
  await page.waitForFunction(() => window.useApp?.getState?.().caxes?.length === 1)
  const edgeAxis = await page.evaluate(() => window.useApp.getState().caxes[0])
  assert.ok(Array.isArray(edgeAxis.at) && edgeAxis.at.length === 3 && edgeAxis.at.every(Number.isFinite))
  assert.ok(Array.isArray(edgeAxis.dirV) && edgeAxis.dirV.length === 3 && edgeAxis.dirV.every(Number.isFinite), 'edge axis must preserve the actual B-rep direction vector')
  assert.ok(Math.abs(Math.hypot(...edgeAxis.dirV) - 1) < 1e-6, 'edge axis direction must be normalized')
  console.log(JSON.stringify({ ok: true, target: baseURL, constructCanvasEdgePick: { vertexPoint, edgeAxis } }))
} finally {
  await browser.close()
}
