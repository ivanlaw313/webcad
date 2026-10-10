#!/usr/bin/env node
// FISHING14 P2 (real browser): the FIRST canvas click after picking a sketch tool from the ribbon must register.
// Real-user cadence: move the mouse onto the ribbon icon, hover, press/release, travel to the canvas in steps,
// pause, then ONE click. Assert the first point landed (rectangle start / polyline 1 point).
// P3: rectangle start-point typing 40 Tab 25 Enter = start (40, 25) (Tab moves X → Y).
// Usage: nice -n 19 npx vite build && flock /tmp/webcad-e2e.lock nice -n 19 node scripts/e2e-fishing14-first-click.mjs [--headed] [--shots DIR]
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const xdo = process.argv.includes('--xdotool')   // real X11 mouse (OS-level events, like a human / computer-use) — implies --headed
const instant = process.argv.includes('--instant')   // computer-use style: jump + click, no hover, no move steps
const headed = xdo || process.argv.includes('--headed')
const port = Number(arg('--port', 4400 + (process.pid % 500)))
const base = arg('--url', '')
const preview = base ? null : spawn('nice', ['-n', '19', 'npx', 'vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
const kill = () => { if (preview) try { process.kill(-preview.pid, 'SIGTERM') } catch { /* gone */ } }
process.on('exit', kill)
if (preview) await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('preview timeout')), 30000); preview.stdout.on('data', (d) => { if (String(d).includes(String(port))) { clearTimeout(t); res() } }) })
const results = []
const ok = (name, pass, info = {}) => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(info)}`) }
// headed = a real windowed Chrome on the X display (no headless focus shortcuts; the page must earn focus)
const browser = await chromium.launch({ executablePath: arg('--chrome', '/usr/bin/google-chrome'), headless: !headed, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...(headed ? ['--window-size=1400,1000', '--window-position=0,0'] : [])] })
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await page.goto(base ? `${base.replace(/\/$/, '')}/?ui-test=1` : `http://127.0.0.1:${port}/?ui-test=1`)
  await page.waitForFunction(() => !!window.useApp && !!document.querySelector('canvas') && !!window.__three?.camera, null, { timeout: 90000 })
  await page.evaluate(() => window.useApp.setState({ introOpen: false, tour: null }))
  // OS-level mouse via xdotool: page px → screen px (window at 0,0; chrome UI height = outer − inner)
  let off = [0, 0]
  if (xdo) off = await page.evaluate(() => [window.screenX + (window.outerWidth - window.innerWidth) / 2, window.screenY + (window.outerHeight - window.innerHeight)])
  const X = (...a) => execFileSync('xdotool', a.map(String))
  const M = xdo ? {
    move: async (x, y, o = {}) => { const n = o.steps || 1; const [cx, cy] = String(X('getmouselocation', '--shell')).match(/X=(\d+)\nY=(\d+)/).slice(1).map(Number); for (let i = 1; i <= n; i++) { X('mousemove', '--sync', Math.round(cx + (x + off[0] - cx) * i / n), Math.round(cy + (y + off[1] - cy) * i / n)); if (n > 1) await page.waitForTimeout(12) } },
    down: async () => X('mousedown', 1), up: async () => X('mouseup', 1),
    type: async (t) => { X('type', '--delay', 60, t); await page.waitForTimeout(100) }, key: async (k) => { X('key', k); await page.waitForTimeout(100) },
  } : { move: (x, y, o) => page.mouse.move(x, y, o), down: () => page.mouse.down(), up: () => page.mouse.up(), type: (t) => page.keyboard.type(t), key: (k) => page.keyboard.press(k) }
  const S = () => page.evaluate(() => { const s = window.useApp.getState(); return { tool: s.sketchTool, start: s.sketchStart, poly: s.polyPts.length, buf: s.dimBuf, field: s.dimField, st: s.status, sh: !!s.sketchShape, prof: s.sketchProfiles.length } })
  const at = (x, y) => page.evaluate((p) => {
    const { camera } = window.__three; const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0].getBoundingClientRect()
    const v = camera.position.clone().set(p[0], 0, -p[1]).project(camera)
    return [c.left + (v.x + 1) / 2 * c.width, c.top + (1 - v.y) / 2 * c.height]
  }, [x, y])
  const fresh = async () => {
    await page.evaluate(() => { const u = window.useApp; u.setState({ ...u.getInitialState(), introOpen: false, tour: null, appConfirm: async () => true }, true); u.getState().setLang?.('zh-HK'); u.getState().sketchOnDatumPlane('XY', 0) })
    await page.waitForTimeout(1800)
  }
  // user-like: mouse travels to the icon, hovers (native tooltip can appear), clicks; travels to the canvas; pauses; ONE click
  const pickToolLikeUser = async (cmd) => {
    const b = await page.locator(`button[data-cmd="${cmd}"]:visible`).first().boundingBox()
    const bx = b.x + b.width / 2, by = b.y + b.height / 2
    if (instant) { await M.move(bx, by); await M.down(); await M.up(); await page.waitForTimeout(2500); return }
    await M.move(bx - 40, by + 30); await M.move(bx, by, { steps: 10 }); await page.waitForTimeout(700)
    await M.down(); await page.waitForTimeout(70); await M.up(); await page.waitForTimeout(400)
  }
  const travelAndClick = async (p, { pause = 900 } = {}) => {
    if (instant) { await M.move(p[0], p[1]); await M.down(); await M.up(); await page.waitForTimeout(2500); return }
    await M.move(p[0], p[1], { steps: 25 }); await page.waitForTimeout(pause)
    await M.down(); await page.waitForTimeout(80); await M.up(); await page.waitForTimeout(400)
  }
  // Tester sequence S1 → S2: typed rectangle (40 Tab 25 Enter), stray digits, Esc, Esc … then pick 矩形 again → ONE click.
  {
    await fresh()
    await pickToolLikeUser('sk_rect')
    await travelAndClick(await at(0, 0)); await M.move(...(await at(30, 18)), { steps: 6 }); await page.waitForTimeout(200)
    await M.type('40'); await M.key('Tab'); await M.type('25'); await M.key(xdo ? 'Return' : 'Enter'); await page.waitForTimeout(300)
    const a = await S()
    await M.type('12'); await M.key('Escape'); await page.waitForTimeout(200)
    const b = await S()
    // P3 in this state: start-point typing right after the typed rectangle + Esc
    await pickToolLikeUser('sk_rect')
    await M.move(...(await at(-30, -20)), { steps: 6 }); await page.waitForTimeout(200)
    await M.type('40'); await M.key('Tab'); await M.type('25'); await M.key(xdo ? 'Return' : 'Enter'); await page.waitForTimeout(300)
    const c = await S()
    ok('S1→P3: after a typed rectangle, start typing 40 Tab 25 Enter = start (40, 25)', !!c.start && Math.abs(c.start[0] - 40) < 1e-6 && Math.abs(c.start[1] - 25) < 1e-6, { a: [a.prof, a.sh, a.st], b: [b.tool, b.buf, b.st], c: [c.tool, c.start, c.buf, c.field, c.st] })
    await M.key('Escape'); await M.key('Escape'); await page.waitForTimeout(200)
    await pickToolLikeUser('sk_rect')
    await travelAndClick(await at(-25, 15))
    const d = await S()
    ok('S1→S2: FIRST canvas click after re-picking 矩形 registers', d.tool === 'rectangle' && !!d.start, { tool: d.tool, start: d.start, st: d.st })
    await M.key('Escape'); await M.key('Escape')
  }
  // Tester context: an assembly doc (box + cylinder components, one SELECTED with the move gumball shown, one
  // grounded) — then a sketch on XY, pick the tool, ONE click (the first click used to only clear that state).
  for (const sel of ['selected', 'body']) {
    await page.evaluate(() => { const u = window.useApp; u.setState({ ...u.getInitialState(), introOpen: false, tour: null, appConfirm: async () => true }, true); u.getState().setLang?.('zh-HK') })
    await page.evaluate(async (sel) => {
      const s = () => window.useApp.getState()
      for (let t = 0; t < 200 && !(await s().applyFeatures([{ id: 'blk', type: 'extrude', profile: { kind: 'rect', a: [-60, -40], b: [-20, 0] }, height: 15, operation: 'new' }], 'blk')); t++) await new Promise((r) => setTimeout(r, 250))
      if (sel === 'body') return
      s().newComponent()
      await s().applyFeatures([{ id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [40, 30], r: 5 }, height: 60, operation: 'new' }], 'cyl')
      s().newComponent()
      const cs = s().components
      s().toggleComponentGround(cs[0].id)
      s().selectComponent(cs[1].id)
    }, sel)
    await page.waitForTimeout(1200)
    await pickToolLikeUser('sketch')
    await page.evaluate(() => window.useApp.getState().chooseSketchPlane('XY'))
    await page.waitForTimeout(1800)
    await pickToolLikeUser('sk_rect')
    const cvb = await page.evaluate(() => { const r = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0].getBoundingClientRect(); return [r.left + r.width * 0.62, r.top + r.height * 0.62] })
    await travelAndClick(cvb)
    const s1 = await S()
    ok(`tester context (${sel}): FIRST canvas click after 矩形 registers`, s1.tool === 'rectangle' && !!s1.start, { tool: s1.tool, start: s1.start, st: s1.st, selComp: await page.evaluate(() => window.useApp.getState().selectedComponent) })
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
  }
  // REAL entry flow (as the tester): 建立草圖 ribbon icon → click the XY origin plane in the viewport → camera
  // turns to the plane → pick the tool from the ribbon → ONE canvas click.
  for (const [cmd, tool] of [['sk_rect', 'rectangle'], ['sk_polyline', 'polyline']]) {
    await page.evaluate(() => { const u = window.useApp; u.setState({ ...u.getInitialState(), introOpen: false, tour: null, appConfirm: async () => true }, true); u.getState().setLang?.('zh-HK') })
    await page.waitForTimeout(800)
    await pickToolLikeUser('sketch')
    const m0 = await page.evaluate(() => window.useApp.getState().mode)
    await travelAndClick(await at(14, 14), { pause: 600 })
    await page.waitForTimeout(1500)
    const m1 = await page.evaluate(() => ({ mode: window.useApp.getState().mode, plane: window.useApp.getState().sketchPlane }))
    ok(`real flow: 建立草圖 → click XY plane enters the sketch (${cmd})`, m0 === 'pickplane' && m1.mode === 'sketch', { m0, m1 })
    await pickToolLikeUser(cmd)
    await travelAndClick(await at(-12, -8))
    const s1 = await S()
    ok(`real flow: FIRST canvas click after ${cmd} registers`, tool === 'polyline' ? s1.poly === 1 : !!s1.start, { tool: s1.tool, start: s1.start, poly: s1.poly, st: s1.st })
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
  }
  for (const [cmd, tool] of [['sk_rect', 'rectangle'], ['sk_polyline', 'polyline'], ['sk_circle', 'circle']]) {
    await fresh()
    // a prior tool session first (common real flow: select → tool), then the ribbon pick
    await pickToolLikeUser(cmd)
    const s0 = await S()
    ok(`${cmd}: ribbon click arms ${tool}`, s0.tool === tool, { tool: s0.tool })
    await travelAndClick(await at(-12, -8))
    const s1 = await S()
    const first = tool === 'polyline' ? s1.poly === 1 : !!s1.start
    ok(`${cmd}: FIRST canvas click after picking the tool registers`, first, { start: s1.start, poly: s1.poly, st: s1.st })
    await travelAndClick(await at(18, 14), { pause: 500 })
    const s2 = await S()
    const done = tool === 'polyline' ? s2.poly === 2 : s2.sh || s2.prof > 0
    ok(`${cmd}: second click completes the segment/shape`, done, { poly: s2.poly, sh: s2.sh, st: s2.st })
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
  }
  // re-pick a tool while already sketching with another (tool → tool switch, then one click)
  await fresh()
  await pickToolLikeUser('sk_polyline'); await travelAndClick(await at(-20, -5)); await travelAndClick(await at(-5, -5), { pause: 300 })
  await page.keyboard.press('Escape')
  await pickToolLikeUser('sk_rect')
  await travelAndClick(await at(10, 10))
  { const s = await S(); ok('switching polyline → rectangle: first click registers', s.tool === 'rectangle' && !!s.start, { start: s.start, st: s.st }) }
  // P3: start-point stage typing 40 Tab 25 Enter → start (40, 25)
  await fresh()
  await pickToolLikeUser('sk_rect')
  await M.move(...(await at(5, 5)), { steps: 10 }); await page.waitForTimeout(300)
  await M.type('40'); await M.key('Tab'); await page.waitForTimeout(150)
  const t1 = await S()
  ok('P3: start stage Tab after X moves to the Y field (X kept)', !t1.start && t1.field === 1 && t1.buf[0] === '40', { buf: t1.buf, field: t1.field, st: t1.st, ae: await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120)) })
  await M.type('25'); await M.key(xdo ? 'Return' : 'Enter'); await page.waitForTimeout(250)
  const t2 = await S()
  ok('P3: 40 Tab 25 Enter places the start at (40, 25)', !!t2.start && Math.abs(t2.start[0] - 40) < 1e-6 && Math.abs(t2.start[1] - 25) < 1e-6, { start: t2.start, st: t2.st })
} catch (e) { ok('script ran without exception', false, { error: String(e?.stack || e) }) }
await browser.close().catch(() => {}); kill()
const failed = results.filter((x) => !x).length
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0)
