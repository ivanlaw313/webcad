#!/usr/bin/env node
// RETEST21 #2 / #4 real-browser repro: L path (two Line-tool segments 40 + 30) in one sketch, Ø profile circle
// in a second sketch on a perpendicular plane, Sweep dialog → OK. Also checks the first Line-tool click is
// not swallowed (#4). Usage (repo root, after `npx vite build`): nice -n 19 node scripts/e2e-sweep-lpath.mjs [--shots /tmp/sw]
import { launch, sketchScreen, clickAt, arg } from './e2e-lib.mjs'

const { page, ok, finish, shot } = await launch()
const st = () => page.evaluate(() => { const s = window.useApp.getState(); return { mode: s.mode, tool: s.sketchTool, status: s.status, dlg: s.sweepDlgOpen, polyPts: s.polyPts, shape: s.sketchShape, profs: s.sketchProfiles, srcs: Object.entries(s.sketchSources).map(([k, v]) => ({ k, plane: v.plane, shapes: v.shapes })), feats: s.features.map((f) => f.type) } })
const VERBOSE = process.argv.includes('--verbose')
const log = async (tag) => { const s = await st(); if (VERBOSE) console.log(tag, JSON.stringify(s).slice(0, 1500)); return s }
const btn = (re) => page.locator('button', { hasText: re }).first()
try {
  const PATH_PLANE = arg('--path-plane', 'XY'), PROF_PLANE = arg('--prof-plane', 'YZ')
  // ── sketch 1: path ──
  if (process.argv.includes('--plane-click') && PATH_PLANE === 'XY') {
    // like a user: ribbon 建立草圖 → click the red XY origin plane in the viewport
    await page.locator('button[data-cmd="sketch"]:visible').first().click()
    await page.waitForTimeout(500)
    const pp = await page.evaluate(() => { const cam = window.__three.camera, V = cam.position.constructor; const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]; const r = cv.getBoundingClientRect(); const q = new V(18, 0, 22).project(cam); return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height] })
    await clickAt(page, pp)
    await page.waitForTimeout(150)   // user is quick: picks Line while the camera is still turning to the plane
    const m = await page.evaluate(() => [window.useApp.getState().mode, window.useApp.getState().sketchPlane])
    ok('sketch opened on XY by clicking the plane', m[0] === 'sketch' && m[1] === 'XY', { m })
  } else {
    await page.evaluate((pl) => { const g = window.useApp.getState(); g.startSketch(); g.chooseSketchPlane(pl) }, PATH_PLANE)
    await page.waitForTimeout(900)
  }
  // #4: choose Line like the tester — ribbon button (default) or the L shortcut (--key-line)
  if (process.argv.includes('--stale')) {
    // a gesture whose release is lost: Rectangle tool, press in the canvas, drag up onto the ribbon and release there
    await page.keyboard.press('r'); await page.waitForTimeout(150)
    const a = await sketchScreen(page, PATH_PLANE, [-50, -30])
    await page.mouse.move(a[0], a[1]); await page.mouse.down()
    const rb = await page.locator('button[data-cmd="sk_polyline"]:visible').first().boundingBox()
    await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2, { steps: 8 }); await page.mouse.up()
    await page.waitForTimeout(200)
    console.log('  after lost release:', JSON.stringify(await page.evaluate(() => { const s = window.useApp.getState(); return { tool: s.sketchTool, start: s.sketchStart, shape: s.sketchShape?.type ?? null } })))
  }
  const lineVia = arg('--line-via', 'ribbon')   // ribbon | key | mm (right-click marking menu, click) | flick (marking-menu flick)
  if (lineVia === 'key') await page.keyboard.press('l')
  else if (lineVia === 'mm' || lineVia === 'flick') {
    const c = await sketchScreen(page, PATH_PLANE, [-60, 40])
    await page.mouse.move(c[0], c[1])
    if (lineVia === 'mm') {
      await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await page.waitForTimeout(300)
      const n = await page.locator('.mm-btn').count()
      console.log('  marking menu buttons:', n, await page.locator('.mm-btn').evaluateAll((bs) => bs.map((b) => b.title)))
      await page.locator('.mm-btn', { hasText: /直線/ }).first().click()
    } else {
      await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await page.waitForTimeout(300)
      const pos = await page.locator('.mm-btn', { hasText: /直線/ }).first().boundingBox()
      const tgt = [pos.x + pos.width / 2, pos.y + pos.height / 2], d = [tgt[0] - c[0], tgt[1] - c[1]], L = Math.hypot(...d)
      for (let i = 1; i <= 6; i++) { await page.mouse.move(c[0] + d[0] / L * 30 * i, c[1] + d[1] / L * 30 * i); await page.waitForTimeout(8) }
    }
    await page.waitForTimeout(250)
    console.log('  overlays after marking menu:', await page.evaluate(() => [...document.querySelectorAll('div')].filter((d) => getComputedStyle(d).position === 'fixed' && d.getBoundingClientRect().width >= innerWidth - 2 && d.getBoundingClientRect().height >= innerHeight - 2).length))
  } else {
    const b = page.locator('button[data-cmd="sk_polyline"]:visible').first()
    console.log('  ribbon Line buttons visible:', await page.locator('button[data-cmd="sk_polyline"]:visible').count())
    await b.click()
  }
  await page.waitForTimeout(150)
  const tool0 = await page.evaluate(() => window.useApp.getState().sketchTool)
  ok('Line tool active', tool0 === 'polyline', { tool0 })
  const pts = [[0, 0], [40, 0], [40, 30]]
  if (process.argv.includes('--teleport')) { const q = await sketchScreen(page, PATH_PLANE, pts[0]); await page.mouse.click(q[0], q[1]); await page.waitForTimeout(150) }   // tap-to-click: no hover before the press
  else await clickAt(page, await sketchScreen(page, PATH_PLANE, pts[0]))
  const s1 = await log('after-first-click')
  ok('#4 first Line click after choosing the tool is not swallowed', s1.polyPts.length === 1, { polyPts: s1.polyPts, status: s1.status })
  // --separate: two independent Line segments (40, then Esc, then 30 starting on the first one's end) — the tester's 「兩條線」
  const seq = process.argv.includes('--separate') ? [pts[1], 'esc', pts[1], pts[2]] : pts.slice(1)
  for (const p of seq) {
    await page.waitForTimeout(450)
    if (p === 'esc') { await page.keyboard.press('Escape'); await page.waitForTimeout(200); continue }
    await clickAt(page, await sketchScreen(page, PATH_PLANE, p))
  }
  await log('after-path-clicks')
  await page.keyboard.press('Escape'); await page.waitForTimeout(200)
  await log('after-esc')
  await shot('sw-path')
  await btn(/完成草[圖图]|Finish Sketch/i).click(); await page.waitForTimeout(600)
  const s2 = await log('after-finish-1')
  ok('path sketch saved', s2.mode === 'model' && s2.srcs.length === 1, { status: s2.status, srcs: s2.srcs })
  // ── sketch 2: profile circle Ø6 centred on the path start, perpendicular plane ──
  await page.evaluate((pl) => { const g = window.useApp.getState(); g.startSketch(); g.chooseSketchPlane(pl) }, PROF_PLANE)
  await page.waitForTimeout(900)
  await page.keyboard.press('c'); await page.waitForTimeout(150)
  await clickAt(page, await sketchScreen(page, PROF_PLANE, [0, 0]))
  await page.waitForTimeout(450)
  await clickAt(page, await sketchScreen(page, PROF_PLANE, [3, 0]))
  await log('after-circle')
  await page.keyboard.press('Escape'); await page.waitForTimeout(200)
  await btn(/完成草[圖图]|Finish Sketch/i).click(); await page.waitForTimeout(600)
  const s3 = await log('after-finish-2')
  ok('profile sketch saved', s3.mode === 'model' && s3.srcs.length === 2, { status: s3.status, srcs: s3.srcs.map((x) => [x.plane, x.shapes.map((h) => h.type)]) })
  // ── Sweep (ribbon command path), select path sketch in browser, 草圖輪廓, pick circle, OK ──
  const pathId = s3.srcs.find((x) => x.plane === PATH_PLANE)?.k, profId = s3.srcs.find((x) => x.plane === PROF_PLANE)?.k
  await page.evaluate((id) => window.useApp.getState().setSelSketch(id), pathId)
  await page.evaluate(() => window.useApp.getState().runCommand('sweep', 'Sweep'))
  await page.waitForTimeout(400)
  const s4 = await log('sweep-open')
  ok('sweep dialog open with 1 path', s4.dlg, { status: s4.status })
  const chip = await page.locator('.sel-chip').first().textContent().catch(() => null)
  console.log('  path chip:', chip)
  await btn(/草圖輪廓/).click(); await page.waitForTimeout(200)
  // the user picks the profile sketch (browser tree click = setSelSketch) or clicks the circle on canvas
  if (!process.argv.includes('--no-pick')) {
    await page.evaluate((id) => window.useApp.getState().setSelSketch(id), profId)
    await page.waitForTimeout(200)
    const cp = await sketchScreen(page, PROF_PLANE, [3, 0])
    await clickAt(page, cp)
  }
  const s5 = await log('after-profile-pick')
  console.log('  status after pick:', s5.status)
  await shot('sw-dialog')
  await page.locator('.cmd-dialog button, .command-dialog button', { hasText: /確定|确定|OK/ }).first().click().catch(async () => { await page.evaluate(() => window.useApp.getState().commitSweepPath()) })
  await page.waitForFunction(() => !window.useApp.getState().busy, null, { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(800)
  const s6 = await log('after-ok')
  await shot('sw-after')
  const sweep = await page.evaluate(() => window.useApp.getState().features.find((f) => f.type === 'sweep') ?? null)
  const len = sweep?.path ? sweep.path.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - sweep.path[i][0], p[1] - sweep.path[i][1]), 0) : sweep?.path3 ? sweep.path3.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - sweep.path3[i][0], p[1] - sweep.path3[i][1], p[2] - sweep.path3[i][2]), 0) : 0
  ok('sweep feature created', !!sweep, { status: s6.status, dlg: s6.dlg })
  ok('sweep follows the whole L (70mm)', Math.abs(len - 70) < 0.5, { len, path: sweep?.path ?? sweep?.path3 })
  const drawnR = s3.srcs.find((x) => x.plane === PROF_PLANE)?.shapes.find((h) => h.type === 'circle')?.r
  ok('sweep section = the circle from the perpendicular profile sketch', !!sweep?.profile && sweep.profile.kind === 'circle' && Math.abs(sweep.profile.r - drawnR) < 1e-6 && Math.hypot(...sweep.profile.c) < 1e-6, { profile: sweep?.profile, drawnR })
  ok('dialog closed', !s6.dlg, { status: s6.status })
  const body = await page.evaluate(() => { const m = window.useApp.getState().bodyMesh; return m ? (m.triangles?.length ?? m.index?.length ?? 1) : 0 })
  ok('body mesh exists', body > 0, { body })
  await finish()
} catch (e) { await finish(e) }
