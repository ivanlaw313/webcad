/* Browser acceptance: Aero Lab → local OpenFOAM service (http://127.0.0.1:8765) → Cd shown in the UI.
 * Two phases share a persistent profile, so phase "wait" also proves a reload resumes polling from localStorage.
 *   node tests/e2e/aero-cfd.playwright.mjs <baseURL> submit <profileDir> [shotDir]   → prints job id
 *   node tests/e2e/aero-cfd.playwright.mjs <baseURL> wait   <profileDir> [shotDir] [minutes] → exit 0 when Cd shown, 3 while still running
 * A local preview origin (e.g. http://localhost:4174) is not in the service's CORS allow-list
 * (cad.neuralworkshk.com, localhost:5173), so Chrome runs with --disable-web-security here. */
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const [baseArg, phase = 'submit', profile = './.pw-aero-cfd', shots, minutesArg] = process.argv.slice(2)
const baseURL = (baseArg ?? 'http://localhost:4174').replace(/\/$/, '')
const executablePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const ctx = await chromium.launchPersistentContext(profile, { headless: true, executablePath, viewport: { width: 1440, height: 1000 }, args: ['--disable-web-security'] })
let code = 0
try {
  const page = ctx.pages()[0] ?? await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.locator('.ribbon-tab', { hasText: '實驗室' }).click()
  await page.locator('[data-cmd="aerolab"]').click()
  const lab = page.locator('.aero-lab')
  await lab.waitFor({ state: 'visible', timeout: 30000 })
  await lab.locator('[data-aero-template="shell"]').click()
  await lab.locator('select').filter({ hasText: '1200' }).selectOption('300')
  await lab.locator('[data-aero-run]').click()
  await lab.locator('[data-aero-cand]').first().waitFor({ state: 'visible', timeout: 60000 })
  const panel = lab.locator('[data-aero-cfd]')
  await panel.waitFor({ state: 'visible' })
  await panel.locator('[data-cfd-health="ok"]').waitFor({ timeout: 20000 })

  if (phase === 'submit') {
    // offline UX: wrong port → hint with the start-service path
    const url = panel.locator('input').first()
    await url.fill('http://127.0.0.1:8799')
    await panel.getByRole('button', { name: /檢查服務/ }).click()
    await panel.locator('[data-cfd-offline]').waitFor({ timeout: 15000 })
    assert.match(await panel.locator('[data-cfd-offline]').innerText(), /start-service\.bat/)
    await url.fill('http://127.0.0.1:8765')
    await panel.getByRole('button', { name: /檢查服務/ }).click()
    await panel.locator('[data-cfd-health="ok"]').waitFor({ timeout: 20000 })
    // one real small job: best shell candidate, bluff-lowRe, coarse
    await panel.locator('[data-cfd-mesh]').selectOption('coarse')
    await panel.locator('[data-cfd-preset]').selectOption('bluff-lowRe')
    await panel.locator('[data-cfd-send]').click()
    const row = panel.locator('[data-cfd-job]').first()
    await row.waitFor({ timeout: 60000 })
    const id = await row.getAttribute('data-cfd-job')
    console.log('JOB_ID', id)
    await page.waitForTimeout(8000)
    console.log('ROW', (await row.innerText()).replace(/\s+/g, ' '))
    if (shots) await page.screenshot({ path: `${shots}/aero-cfd-submitted.png` })
  } else {
    // after a full reload: the job must come back from localStorage and keep polling
    const row = panel.locator('[data-cfd-job]').first()
    await row.waitFor({ timeout: 20000 })
    const id = await row.getAttribute('data-cfd-job')
    console.log('RESUMED JOB', id, await row.getAttribute('data-cfd-state'))
    const deadline = Date.now() + Number(minutesArg ?? 8) * 60000
    let state = ''
    while (Date.now() < deadline) {
      state = await row.getAttribute('data-cfd-state')
      if (!['queued', 'running'].includes(state)) break
      console.log(new Date().toISOString().slice(11, 19), (await row.innerText()).replace(/\s+/g, ' ').slice(0, 160))
      await page.waitForTimeout(30000)
    }
    if (['queued', 'running'].includes(state)) { console.log('STILL', state); code = 3 }
    else {
      assert.equal(state, 'done', `job ended in ${state}: ${await row.innerText()}`)
      const cd = await row.locator('[data-cfd-value="Cd"]').innerText()
      console.log('CFD_CD_IN_UI', cd)
      console.log('ROW', (await row.innerText()).replace(/\s+/g, ' '))
      console.log('CALIB', (await panel.locator('[data-cfd-calib]').innerText()).replace(/\s+/g, ' '))
      assert.match(cd, /^\d/)
      if (shots) { await row.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${shots}/aero-cfd-done.png` }) }
    }
  }
  assert.deepEqual(pageErrors, [], 'no page errors')
} finally {
  await ctx.close()
}
process.exit(code)
