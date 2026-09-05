/* WebCAD UI STL export -> Blender import acceptance. */
import assert from 'node:assert/strict'
import { existsSync, unlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const baseURL = process.argv[2] ?? 'http://127.0.0.1:4173'
const format = (process.env.INTEROP_FORMAT ?? 'stl').toLowerCase()
assert.ok(format === 'stl' || format === 'obj', 'INTEROP_FORMAT must be stl or obj')
const outFile = `C:/tmp/webcad-blender-interop.${format}`
const blender = 'C:\\Program Files\\Blender Foundation\\Blender 4.4\\blender.exe'
const { chromium } = await import('playwright')
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({ headless: true, ...(existsSync(chromePath) ? { executablePath: chromePath } : {}) })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })

async function invoke(command, group) {
  const direct = page.locator(`[data-cmd="${command}"]`)
  if (await direct.count() === 1) return direct.click()
  const control = page.locator(`[data-ribbon-group="${group}"]`)
  assert.equal(await control.count(), 1)
  await control.click()
  const menu = page.locator('[data-testid="ribbon-group-menu"]')
  await menu.waitFor({ state: 'visible' })
  const item = menu.locator(`[data-cmd="${command}"]`)
  assert.equal(await item.count(), 1)
  await item.click()
}

try {
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'networkidle' })
  await page.locator('.app[data-ui-test="true"]').waitFor()
  await invoke('box', 'CREATE')
  const dialog = page.locator('[data-testid="command-dialog"]')
  await dialog.waitFor({ state: 'visible' })
  const fields = dialog.locator('input')
  await fields.nth(0).fill('40'); await fields.nth(1).fill('30'); await fields.nth(2).fill('20')
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => (window.useApp?.getState?.().features?.length ?? 0) === 1)

  const fileButton = page.locator('.tb-text').filter({ hasText: /File|文件/, visible: true })
  await fileButton.click()
  const menu = page.locator('.panel-menu')
  await menu.waitFor({ state: 'visible' })
  const exportText = format === 'stl' ? /Export STL|导出 STL/ : /Export OBJ|导出 OBJ/
  const exportItem = menu.locator('.panel-menu-item').filter({ hasText: exportText })
  assert.equal(await exportItem.count(), 1, `File menu must expose one ${format.toUpperCase()} export`)
  const pending = page.waitForEvent('download')
  await exportItem.click()
  const download = await pending
  if (existsSync(outFile)) unlinkSync(outFile)
  await download.saveAs(outFile)
  assert.ok(existsSync(outFile), 'WebCAD STL export must produce a download')
  const blenderImport = format === 'stl' ? 'bpy.ops.wm.stl_import' : 'bpy.ops.wm.obj_import'
  const result = spawnSync(blender, ['--background', '--factory-startup', '--python-expr', `import bpy; ${blenderImport}(filepath=r'${outFile}'); o=bpy.context.selected_objects[0]; print('WEBCAD_EXPORT_BLENDER_OK', len(o.data.vertices), len(o.data.polygons))`], { encoding: 'utf8', timeout: 60000 })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const match = result.stdout.match(/WEBCAD_EXPORT_BLENDER_OK\s+(\d+)\s+(\d+)/)
  assert.ok(match, result.stdout)
  assert.ok(Number(match[1]) >= 8 && Number(match[2]) >= 12, 'Blender must load a non-empty triangulated WebCAD solid')
  console.log(JSON.stringify({ ok: true, target: baseURL, format, blender: { vertices: Number(match[1]), polygons: Number(match[2]) } }))
} finally {
  await browser.close()
}
