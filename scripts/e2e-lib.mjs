// Shared harness for the real-browser repro scripts (RETEST20/21). ONE niced `vite preview` + ONE headless
// Chrome; both are killed on exit. Not part of the default test run. Needs a fresh `npx vite build`.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

export const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }

export async function launch({ port = Number(arg('--port', 4317)), chrome = arg('--chrome', '/usr/bin/google-chrome'), dpr = Number(arg('--dpr', 1)) } = {}) {
  const shots = arg('--shots', '')
  if (shots) mkdirSync(shots, { recursive: true })
  const preview = spawn('nice', ['-n', '19', 'npx', 'vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  const killPreview = () => { try { process.kill(-preview.pid, 'SIGTERM') } catch { /* gone */ } }
  process.on('exit', killPreview)
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { killPreview(); process.exit(130) })
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('vite preview did not start')), 30000)
    preview.stdout.on('data', (d) => { if (String(d).includes(String(port))) { clearTimeout(t); res() } })
    preview.on('exit', (c) => rej(new Error('vite preview exited ' + c)))
  })
  const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const page = await browser.newPage({ viewport: { width: Number(arg('--vw', 1400)), height: Number(arg('--vh', 900)) }, deviceScaleFactor: dpr })
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await page.goto(`http://127.0.0.1:${port}/?ui-test=1`)
  await page.waitForFunction(() => !!window.useApp && !!window.__three?.camera, null, { timeout: 60000 })
  await page.waitForFunction(() => !!document.querySelector('canvas'), null, { timeout: 60000 })
  await page.keyboard.press('Escape').catch(() => {})
  await page.evaluate((l) => { window.useApp.getState().setLang(l); window.useApp.setState({ introOpen: false, tour: null }) }, arg('--lang', 'zh-HK'))
  await page.waitForTimeout(300)
  const results = []
  const ok = (name, pass, info) => { results.push({ name, pass, info }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(info ?? {})}`) }
  const close = async () => { await browser.close().catch(() => {}); killPreview() }
  const finish = async (err) => {
    if (err) { console.error(err); results.push({ name: 'script', pass: false }) }
    await close()
    const failed = results.filter((r) => !r.pass).length
    console.log(failed ? `${failed} FAILED` : 'ALL PASS')
    process.exit(failed ? 1 : 0)
  }
  const shot = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }) }
  return { page, browser, ok, finish, shot, results }
}

/** Screen pixel of a sketch-plane point (s,t) on a principal plane (inverse of SketchLayer SK[plane].toST). */
export const sketchScreen = (page, plane, st, baseZ = 0) => page.evaluate(([plane, st, b]) => {
  const cam = window.__three.camera, V = cam.position.constructor
  const cv = [...document.querySelectorAll('canvas')].sort((a, c) => c.clientWidth * c.clientHeight - a.clientWidth * a.clientHeight)[0]
  const r = cv.getBoundingClientRect()
  const w = plane === 'XY' ? new V(st[0], b, st[1]) : plane === 'XZ' ? new V(st[0], st[1], -b) : new V(b, st[1], st[0])
  const q = w.project(cam)
  return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height]
}, [plane, st, baseZ])

/** Real mouse click (move → down → up) at a screen point with a small hover first, like a user. */
export async function clickAt(page, p, hoverSteps = 3) {
  await page.mouse.move(p[0] - 6, p[1] - 6)
  await page.mouse.move(p[0], p[1], { steps: hoverSteps })
  await page.mouse.down(); await page.mouse.up()
  await page.waitForTimeout(120)
}
