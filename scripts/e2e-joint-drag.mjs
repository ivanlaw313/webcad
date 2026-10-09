#!/usr/bin/env node
// RETEST20 #1 real-browser repro: drag the joint ring / slider arrow with real mouse events.
// NOT part of the default test run. Usage (from repo root, after `npx vite build`):
//   nice -n 19 node scripts/e2e-joint-drag.mjs [--port 4317] [--chrome /usr/bin/google-chrome] [--shots /tmp/jd]
// Starts ONE `vite preview` + ONE headless Chromium and kills both on exit.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const PORT = Number(arg('--port', 4317))
const CHROME = arg('--chrome', '/usr/bin/google-chrome')
const SHOTS = arg('--shots', '')
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const preview = spawn('nice', ['-n', '19', 'npx', 'vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
const killPreview = () => { try { process.kill(-preview.pid, 'SIGTERM') } catch { /* gone */ } }
process.on('exit', killPreview)
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite preview did not start')), 30000)
  preview.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) { clearTimeout(t); res() } })
  preview.on('exit', (c) => rej(new Error('vite preview exited ' + c)))
})

let browser
const results = []
const ok = (name, pass, info) => { results.push({ name, pass, info }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(info)}`) }
try {
  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await page.goto(`http://127.0.0.1:${PORT}/?ui-test=1`)
  await page.waitForFunction(() => !!window.useApp && !!window.__three?.camera, null, { timeout: 60000 })
  await page.waitForFunction(() => !!document.querySelector('canvas'), null, { timeout: 60000 })
  await page.keyboard.press('Escape').catch(() => {})

  // ── two bodies → two components (the 新建組件 action the browser tree / ribbon call) ──
  const setup = await page.evaluate(async () => {
    const g = () => window.useApp.getState()
    useApp.setState({ introOpen: false, tour: null })
    for (let t = 0; t < 200 && !(await g().applyFeatures([{ id: 'b1', type: 'extrude', profile: { kind: 'rect', a: [-30, -30], b: [30, 30] }, height: 10, operation: 'new' }], 'base')); t++) await new Promise((r) => setTimeout(r, 250))
    g().newComponent()
    await g().applyFeatures([{ id: 'b2', type: 'extrude', profile: { kind: 'rect', a: [-8, -25], b: [8, 25] }, height: 8, operation: 'new' }], 'arm')
    g().newComponent()
    const cs = g().components
    return { comps: cs.map((c) => ({ id: c.id, pos: c.pos })), mode: g().mode }
  })
  console.log('setup', JSON.stringify(setup))
  const [P, S] = setup.comps.map((c) => c.id)

  const cam = () => page.evaluate(() => { const c = window.__three?.camera; return c ? [c.position.x, c.position.y, c.position.z].map((v) => +v.toFixed(3)) : null })
  // screen position of a world point on the VISIBLE joint glyph (JointGizmo: orange ring R=30 / cyan slide axis)
  const glyphScreen = (kind, param) => page.evaluate(([kind, param]) => {
    const j = window.useApp.getState().joints[0], cam = window.__three.camera
    const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]
    const r = cv.getBoundingClientRect()
    const V = cam.position.constructor
    const ax = new V(...j.axis).normalize(), ref = Math.abs(ax.x) < 0.9 ? new V(1, 0, 0) : new V(0, 1, 0)
    const u = new V().crossVectors(ax, ref).normalize(), v = new V().crossVectors(ax, u).normalize(), a = new V(...j.anchor)
    const P = (t) => kind === 'revolute' ? a.clone().addScaledVector(u, 30 * Math.cos(t)).addScaledVector(v, 30 * Math.sin(t)) : a.clone().addScaledVector(ax, t)
    const sc = (p) => { const q = p.clone().project(cam); return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height] }
    const p0 = sc(P(param)), p1 = sc(P(kind === 'revolute' ? param + 0.05 : param + 1))
    return { p: p0, dir: [p1[0] - p0[0], p1[1] - p0[1]] }
  }, [kind, param])
  async function dragTest(kind, joint, read) {
    await page.evaluate(([j]) => { const g = window.useApp.getState(); window.useApp.setState({ joints: [] }); g.addJoint(j) }, [joint])
    await page.evaluate((s) => window.useApp.getState().selectComponent(s), S)
    await page.waitForTimeout(800)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${kind}-before.png` })
    const before = await read(), cam0 = await cam(), undo0 = await page.evaluate(() => window.useApp.getState().undoStack.length)
    for (let k = 0; k < 3; k++) {
      const cur = await read()
      // grab the visible glyph 60° away from the current-angle bead (ring) / 25 mm along the slide axis
      let g
      if (kind === 'revolute') g = await glyphScreen(kind, (cur + 60) * Math.PI / 180)
      else {
        // slide axis: grab the most central on-screen point of the visible segment, drag toward screen centre
        const vp = page.viewportSize(); let best = null
        for (let t = -55; t <= 55; t += 5) { const c = await glyphScreen(kind, t); const d = Math.hypot(c.p[0] - vp.width / 2, c.p[1] - vp.height / 2); if (!best || d < best.d) best = { ...c, d } }
        const toC = [vp.width / 2 - best.p[0], vp.height / 2 - best.p[1]]
        const sgn = toC[0] * best.dir[0] + toC[1] * best.dir[1] >= 0 ? 1 : -1
        g = { p: best.p, dir: [best.dir[0] * sgn, best.dir[1] * sgn] }
      }
      const { p, dir } = g
      const L = Math.hypot(dir[0], dir[1]) || 1, step = 70
      await page.mouse.move(p[0], p[1])
      await page.mouse.down()
      for (let i = 1; i <= 12; i++) await page.mouse.move(p[0] + dir[0] / L * step * i / 12, p[1] + dir[1] / L * step * i / 12)
      await page.mouse.up()
      await page.waitForTimeout(250)
      console.log(`  ${kind} drag ${k + 1}: grab ${p.map(Math.round)} → value ${await read()} cam ${JSON.stringify(await cam())}`)
    }
    const after = await read(), cam1 = await cam(), undo1 = await page.evaluate(() => window.useApp.getState().undoStack.length)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${kind}-after.png` })
    const moved = cam0 && cam1 ? Math.hypot(cam1[0] - cam0[0], cam1[1] - cam0[1], cam1[2] - cam0[2]) : null
    ok(`${kind}: value changed by real drags`, Math.abs(after - before) > 5, { before, after })
    ok(`${kind}: camera did not orbit`, moved != null && moved < 1e-3, { cam0, cam1, moved })
    ok(`${kind}: one undo step per drag`, undo1 - undo0 === 3, { undo0, undo1 })
    ok(`${kind}: child still selected (release click swallowed)`, await page.evaluate((s) => window.useApp.getState().selectedComponent === s, S), {})
  }
  const anchor = await page.evaluate((s) => { const c = window.useApp.getState().components.find((x) => x.id === s); return c.pos }, S)
  await dragTest('revolute', { type: 'revolute', parent: P, child: S, anchor: [anchor[0], 10, anchor[2]], axis: [0, 1, 0], angle: 0, slide: 0 },
    () => page.evaluate(() => window.useApp.getState().joints[0]?.angle ?? NaN))
  await dragTest('slider', { type: 'slider', parent: P, child: S, anchor: [anchor[0], 10, anchor[2]], axis: [1, 0, 0], angle: 0, slide: 0 },
    () => page.evaluate(() => window.useApp.getState().joints[0]?.slide ?? NaN))
} catch (e) {
  console.error(e); results.push({ name: 'script', pass: false })
} finally {
  await browser?.close().catch(() => {})
  killPreview()
}
const failed = results.filter((r) => !r.pass).length
console.log(failed ? `${failed} FAILED` : 'ALL PASS')
process.exit(failed ? 1 : 0)
