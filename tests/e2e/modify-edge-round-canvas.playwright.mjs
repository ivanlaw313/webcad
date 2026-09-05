/*
 * Production canvas acceptance: MODIFY Fillet and Chamfer must consume a
 * genuinely picked B-rep edge, accept a numeric size and add a history feature.
 * This deliberately does not use store actions for picking or committing.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

const baseURL = process.argv[2] ?? 'http://127.0.0.1:4173'
const { chromium } = await import('playwright')
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({ headless: true, ...(existsSync(chromePath) ? { executablePath: chromePath } : {}) })

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'networkidle' })
  await page.locator('.app[data-ui-test="true"]').waitFor()
  return page
}

async function invoke(page, command, group) {
  const direct = page.locator(`[data-cmd="${command}"]`)
  if (await direct.count() === 1) return direct.click()
  const control = page.locator(`[data-ribbon-group="${group}"]`)
  assert.equal(await control.count(), 1, `${group} must be present`)
  await control.click()
  const menu = page.locator('[data-testid="ribbon-group-menu"]')
  await menu.waitFor({ state: 'visible' })
  const item = menu.locator(`[data-cmd="${command}"]`)
  assert.equal(await item.count(), 1, `${command} must be reachable from ${group}`)
  await item.click()
}

async function makeBox(page) {
  const dialog = page.locator('[data-testid="command-dialog"]')
  await invoke(page, 'box', 'CREATE')
  await dialog.waitFor({ state: 'visible' })
  const input = dialog.locator('input')
  await input.nth(0).fill('40'); await input.nth(1).fill('30'); await input.nth(2).fill('20')
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => window.useApp?.getState?.().features?.length === 1)
}

async function pickVisibleEdge(page, kind) {
  const dialog = page.locator('[data-testid="command-dialog"]')
  await invoke(page, kind, 'MODIFY')
  await dialog.waitFor({ state: 'visible' })
  await page.waitForFunction((expected) => window.useApp?.getState?.().edgeRoundPick === expected, kind)
  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  assert.ok(box, 'CAD canvas must be visible')
  // The fitted prism presents different pixel edges across GPU/browser camera
  // variants. Try visible candidates via the canvas until the B-rep resolver
  // accepts one; this is still a true pointer-pick test.
  const candidates = [[.50, .43], [.55, .47], [.45, .48], [.57, .54], [.43, .55], [.50, .58]]
  const attempts = []
  for (const [x, y] of candidates) {
    await canvas.click({ position: { x: box.width * x, y: box.height * y } })
    const accepted = await page.waitForFunction(() => (window.useApp?.getState?.().edgeRoundPicks?.length ?? 0) === 1, null, { timeout: 1500 }).then(() => true).catch(() => false)
    if (accepted) return { dialog, canvasPoint: [x, y] }
    attempts.push([x, y])
  }
  throw new Error(`${kind} must accept a visible B-rep edge through the canvas; attempted ${JSON.stringify(attempts)}`)
}

try {
  const fillet = await newPage()
  await makeBox(fillet)
  const filletPick = await pickVisibleEdge(fillet, 'fillet')
  // Default Fillet uses a Radius Group. Set its numeric field after selection;
  // the value must propagate to the selected edge before the command enables.
  await filletPick.dialog.getByLabel('半径组 1 半径 mm').fill('3')
  await fillet.waitForFunction(() => {
    const s = window.useApp?.getState?.()
    return s?.edgeRoundRadii?.length === 1 && s.edgeRoundRadii[0] === 3 && !s.roundPreviewBusy
  })
  await filletPick.dialog.getByRole('button', { name: /确定/ }).click()
  await fillet.waitForFunction(() => {
    const f = window.useApp?.getState?.().features
    return f?.length === 2 && f[1]?.type === 'fillet'
  }, null, { timeout: 10000 })
  const filletFeature = await fillet.evaluate(() => window.useApp.getState().features.at(-1))
  assert.equal(filletFeature.radius, 3)
  await fillet.close()

  const chamfer = await newPage()
  await makeBox(chamfer)
  const chamferPick = await pickVisibleEdge(chamfer, 'chamfer')
  await chamferPick.dialog.getByLabel('Chamfer distance mm').fill('2')
  await chamfer.waitForFunction(() => {
    const s = window.useApp?.getState?.()
    return s?.edgeRoundSize === 2 && !s.roundPreviewBusy
  })
  await chamferPick.dialog.getByRole('button', { name: 'OK' }).click()
  await chamfer.waitForFunction(() => {
    const f = window.useApp?.getState?.().features
    return f?.length === 2 && f[1]?.type === 'chamfer'
  }, null, { timeout: 10000 })
  const chamferFeature = await chamfer.evaluate(() => window.useApp.getState().features.at(-1))
  assert.equal(chamferFeature.distance, 2)
  await chamfer.close()
  console.log(JSON.stringify({ ok: true, target: baseURL, fillet: filletFeature, chamfer: chamferFeature }))
} finally {
  await browser.close()
}
