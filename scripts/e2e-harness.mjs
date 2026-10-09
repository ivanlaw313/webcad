// Shared real-browser e2e harness (NOT part of the default test run).
// Starts ONE niced `vite preview` of the built dist + ONE headless Chromium, runs `body(page, ok)`, kills both on exit.
// Usage from a script:  import { runE2E } from './e2e-harness.mjs'; await runE2E(async (page, ok) => { ... })
// Flags: --port N  --chrome PATH  --shots DIR
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

export const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }

export async function runE2E(body, { port = Number(arg('--port', 4317)), chrome = arg('--chrome', '/usr/bin/google-chrome'), url = '/?ui-test=1', viewport = { width: 1400, height: 900 } } = {}) {
  const SHOTS = arg('--shots', '')
  if (SHOTS) mkdirSync(SHOTS, { recursive: true })
  const preview = spawn('nice', ['-n', '19', 'npx', 'vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  const killPreview = () => { try { process.kill(-preview.pid, 'SIGTERM') } catch { /* gone */ } }
  process.on('exit', killPreview)
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('vite preview did not start')), 30000)
    preview.stdout.on('data', (d) => { if (String(d).includes(String(port))) { clearTimeout(t); res() } })
    preview.on('exit', (c) => rej(new Error('vite preview exited ' + c)))
  })
  let browser
  const results = []
  const ok = (name, pass, info = {}) => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(info)}`) }
  try {
    browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
    const page = await browser.newPage({ viewport })
    page.on('pageerror', (e) => console.log('[pageerror]', e.message))
    page.shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }) }
    await page.goto(`http://127.0.0.1:${port}${url}`)
    await page.waitForFunction(() => !!window.useApp && !!document.querySelector('canvas'), null, { timeout: 60000 })
    await page.evaluate(() => window.useApp.setState({ introOpen: false, tour: null }))
    await page.keyboard.press('Escape').catch(() => {})
    await body(page, ok)
  } catch (e) {
    ok('script ran without exception', false, { error: String(e?.stack || e) })
  } finally {
    await browser?.close().catch(() => {})
    killPreview()
  }
  const failed = results.filter((r) => !r.pass).length
  console.log(failed ? `${failed} FAILED` : 'ALL PASS')
  process.exitCode = failed ? 1 : 0
}
