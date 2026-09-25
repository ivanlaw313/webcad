/* Browser acceptance: Aero Lab ⑤ auto-design loop against the REAL local OpenFOAM service.
 * Phases share a persistent profile, so "wait" also proves a reload resumes the loop from localStorage.
 *   node tests/e2e/aero-auto-loop.playwright.mjs <baseURL> start <profileDir> [shotDir] [rounds] [topN]
 *   node tests/e2e/aero-auto-loop.playwright.mjs <baseURL> wait  <profileDir> [shotDir] [minutes]
 *     → exit 0 when the loop finished, 3 while still running (call again), 1 on failure.
 * Local preview origins are not in the service's CORS allow-list → Chrome runs with --disable-web-security. */
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const [baseArg, phase = 'start', profile = './.pw-aero-auto', shots, arg5, arg6] = process.argv.slice(2)
const baseURL = (baseArg ?? 'http://localhost:4174').replace(/\/$/, '')
const executablePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const ctx = await chromium.launchPersistentContext(profile, { headless: true, executablePath, viewport: { width: 1440, height: 1100 }, args: ['--disable-web-security'] })
const stamp = () => new Date().toISOString().slice(11, 19)
let code = 0
try {
  const page = ctx.pages()[0] ?? await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'networkidle', timeout: 60000 })
  const lab = page.locator('.aero-lab')
  const loop = lab.locator('[data-auto-loop]')
  const readState = () => page.evaluate(() => JSON.parse(localStorage.getItem('webcad.aero.autoLoop') || 'null'))

  if (phase === 'start') {
    // a persisted running loop would resume on load → start from a clean slate
    await page.evaluate(() => { localStorage.removeItem('webcad.aero.autoLoop'); localStorage.removeItem('webcad.aero.autoLoopCfg') })
    await page.reload({ waitUntil: 'networkidle' })
    await page.locator('.ribbon-tab', { hasText: '實驗室' }).click()
    await page.locator('[data-cmd="aerolab"]').click()
    await lab.waitFor({ state: 'visible', timeout: 30000 })
    await lab.locator('[data-aero-template="shell"]').click()
    await loop.waitFor({ state: 'visible' })
    const set = async (k, v) => { const i = loop.locator(`[data-auto-cfg="${k}"]`); await i.fill(String(v)) }
    await set('rounds', arg5 ?? 2); await set('topN', arg6 ?? 2); await set('maxJobs', 4); await set('maxMinutes', 150); await set('epsilon', 0)
    await loop.locator('[data-auto-mesh]').selectOption('coarse')
    await loop.locator('[data-auto-start]').click()
    await loop.locator('[data-auto-mode-banner]').waitFor({ timeout: 30000 })
    const mode = await loop.getAttribute('data-auto-mode')
    console.log(stamp(), 'MODE', mode, '|', (await loop.locator('[data-auto-mode-banner]').innerText()).replace(/\s+/g, ' '))
    assert.equal(mode, 'cfd', 'service must be online for the real e2e')
    await loop.locator('[data-auto-job]').first().waitFor({ timeout: 120000 })
    await page.waitForTimeout(5000)
    const st = await readState()
    console.log(stamp(), 'ROUND1 JOBS', st.rounds[0].picks.map((p) => `#${p.cid} ${p.jobId} ${p.state} est=${p.objEst}`).join(' | '))
    if (shots) await page.screenshot({ path: `${shots}/aero-auto-start.png` })
  } else {
    // after a full reload the lab must re-open by itself and the loop resume
    await lab.waitFor({ state: 'visible', timeout: 30000 })
    await loop.waitFor({ state: 'visible', timeout: 30000 })
    let st = await readState()
    console.log(stamp(), 'RESUMED', st?.status, st?.phase, `round ${st?.rounds.length}/${st?.config.rounds}`, 'jobs', st?.jobsUsed)
    const deadline = Date.now() + Number(arg5 ?? 8) * 60000
    let last = ''
    while (Date.now() < deadline) {
      st = await readState()
      if (!st || st.status !== 'running') break
      const line = `${st.phase} r${st.rounds.length} ` + (st.rounds.at(-1)?.picks ?? []).map((p) => `#${p.cid}:${p.state}:${p.stage ?? ''}:${Math.round((p.progress ?? 0) * 100)}%`).join(' ')
      if (line !== last) { console.log(stamp(), line); last = line }
      await page.waitForTimeout(15000)
    }
    st = await readState()
    if (st?.status === 'running') { console.log(stamp(), 'STILL RUNNING'); code = 3 }
    else {
      console.log(stamp(), 'FINISHED', st.status, st.stop, st.error ?? '')
      for (const r of st.rounds) {
        console.log(`ROUND ${r.n} mode=${r.mode} bestEst=${r.bestEst} bestCfd=${r.bestCfd} bestSoFar=${r.bestSoFar} improvement=${r.improvement} predErr=${JSON.stringify(r.predErr)} calib=${JSON.stringify(r.calib)}`)
        for (const p of r.picks) console.log(`   #${p.cid} job=${p.jobId} ${p.state} rawDrag=${p.raw.drag} corrDrag=${p.corrected.drag} pred=${JSON.stringify(p.pred)} estCd=${p.raw.CD} cfdCd=${p.cfd?.Cd} cfdDrag=${p.cfd?.dragN} ratio=${JSON.stringify(p.ratios)} objCfd=${p.objCfd} feasible=${p.feasibleCfd} conv=${p.cfd?.converged} cells=${p.cfd?.cells} t=${p.cfd?.runtimeS} ${p.error ?? ''}`)
        for (const p of r.picks) console.log(`   #${p.cid} x=${JSON.stringify(p.x)}`)
      }
      console.log('BEST', JSON.stringify(st.best))
      const best = loop.locator('[data-auto-best]')
      await best.waitFor({ timeout: 10000 })
      console.log('BEST CARD verified=', await best.getAttribute('data-auto-best-verified'), '|', (await best.innerText()).replace(/\s+/g, ' ').slice(0, 400))
      const rows = await loop.locator('[data-auto-round-row]').count()
      console.log('ROUND ROWS IN UI', rows, '| chart', await loop.locator('[data-auto-chart]').count())
      assert.equal(st.status, 'done', `loop ended ${st.status}/${st.stop}`)
      assert.equal(await best.getAttribute('data-auto-best-verified'), '1')
      assert.match(await loop.locator('[data-auto-best-cfd]').innerText(), /^\d/)
      if (shots) { await loop.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${shots}/aero-auto-done.png` }) }
    }
  }
  assert.deepEqual(pageErrors, [], 'no page errors')
} catch (e) {
  console.error('E2E FAIL', e?.message ?? e)
  code = 1
} finally {
  await ctx.close()
}
process.exit(code)
