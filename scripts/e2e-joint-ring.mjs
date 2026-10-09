#!/usr/bin/env node
// ASM2 #1 real-mouse repro: revolute joint ring (orange) grabbed 1–2 px OFF the drawn curve, several camera
// angles (default iso after Home, orbited, top, front-ish tilt), several drag directions. Each drag must change
// the joint angle and must NOT move the camera (full camera matrix compared).
// Set-up like the tester: plate + standing Ø10×30 cylinder as a second body → 新建組件 → plate 固定 →
// joint tool, real clicks plate top then cylinder face → 旋轉 → 確定.
// Usage: nice -n 19 node scripts/e2e-joint-ring.mjs [--url https://…] [--shots /tmp/jr]
import { launch, clickAt } from './e2e-lib.mjs'

const { page, ok, finish, shot } = await launch()
const g = (fn, a) => page.evaluate(fn, a)
const camM = () => g(() => { const c = window.__three.camera; c.updateMatrixWorld(); return [...c.matrixWorld.elements, c.zoom].map((v) => +v.toFixed(4)) })
const camDiff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])))
try {
  await g(async () => {
    const s = () => window.useApp.getState()
    for (let t = 0; t < 200 && !(await s().applyFeatures([{ id: 'plate', type: 'extrude', profile: { kind: 'rect', a: [-40, -30], b: [40, 30] }, height: 10, operation: 'new' }], 'plate')); t++) await new Promise((r) => setTimeout(r, 250))
    await s().applyFeatures([...s().features, { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [10, 0], r: 5 }, height: 30, baseZ: 10, operation: 'newbody' }], 'cyl')
    s().newComponent()
    s().selectComponent(null)
  })
  await page.waitForTimeout(800)
  let comps = await g(() => window.useApp.getState().components.map((c) => { let zmin = Infinity, zmax = -Infinity; const v = c.mesh.vertices || c.mesh.positions || []; for (let i = 2; i < v.length; i += 3) { zmin = Math.min(zmin, v[i]); zmax = Math.max(zmax, v[i]) } return { id: c.id, name: c.name, h: zmax - zmin } }))
  comps = [...comps].sort((a, b) => a.h - b.h)
  const [plateId, cylId] = comps.map((c) => c.id)
  await g((id) => window.useApp.getState().toggleComponentGround(id), plateId)
  await page.keyboard.press('Home'); await page.waitForTimeout(700)
  await g(() => window.useApp.getState().runCommand('joint', '關節')); await page.waitForTimeout(300)
  const facePoint = (compId, which) => g(([compId, which]) => {
    const { camera, scene } = window.__three
    const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]
    const r = cv.getBoundingClientRect()
    let bb = null
    scene.traverse((o) => {
      if (!o.isMesh || o.userData?.compId !== compId || !o.userData?.cadBody) return
      o.geometry.computeBoundingBox(); o.updateWorldMatrix(true, false)
      const b = o.geometry.boundingBox, cs = []
      for (let k = 0; k < 8; k++) cs.push(b.min.clone().set(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).applyMatrix4(o.matrixWorld))
      const mn = cs[0].clone(), mx = cs[0].clone(); for (const c of cs) { mn.min(c); mx.max(c) }
      bb = { mn, mx }
    })
    if (!bb) return null
    const c = bb.mn.clone().add(bb.mx).multiplyScalar(0.5)
    let p
    if (which === 'cylSide') {
      const rad = (bb.mx.x - bb.mn.x) / 2
      const d = camera.position.clone().sub(c); d.y = 0; d.normalize()
      p = c.clone().setY(bb.mn.y + (bb.mx.y - bb.mn.y) * 0.7).addScaledVector(d, rad * 0.95)
    } else { const d = camera.position.clone().sub(c); d.y = 0; d.normalize(); p = c.clone().setY(bb.mx.y).addScaledVector(d, -(bb.mx.x - bb.mn.x) * 0.3) }
    const q = p.clone().project(camera)
    return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height]
  }, [compId, which])
  await clickAt(page, await facePoint(plateId, 'plateTop'))
  await clickAt(page, await facePoint(cylId, 'cylSide'))
  await page.waitForSelector('[data-testid="dialog-pick-revolute"]', { timeout: 10000 })
  await page.locator('[data-testid="dialog-pick-revolute"]').click()
  // some builds need an explicit 確定
  await page.waitForTimeout(300)
  const okBtn = page.locator('[role="dialog"] button', { hasText: /^確定$/ })
  if (!(await g(() => window.useApp.getState().joints.length)) && await okBtn.count()) await okBtn.first().click()
  await page.waitForTimeout(900)
  const j0 = await g(() => window.useApp.getState().joints[0])
  ok('revolute joint created via UI', j0?.type === 'revolute', { j0: j0 && { type: j0.type, parent: j0.parent, child: j0.child, anchor: j0.anchor, axis: j0.axis } })
  if (!j0) throw new Error('no joint')
  await g(() => window.useApp.getState().setDebugMode(true))
  await shot('jr-0')

  const ringScreen = (deg, rad = 30) => g(([deg, rad]) => {
    const j = window.useApp.getState().joints[0], cam = window.__three.camera, V = cam.position.constructor
    const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]
    const r = cv.getBoundingClientRect()
    const ax = new V(...j.axis).normalize(); if (j.flip) ax.multiplyScalar(-1)
    const ref = Math.abs(ax.x) < 0.9 ? new V(1, 0, 0) : new V(0, 1, 0)
    const u = new V().crossVectors(ax, ref).normalize(), v = new V().crossVectors(ax, u).normalize(), a = new V(...j.anchor)
    const P = (t) => a.clone().addScaledVector(u, rad * Math.cos(t)).addScaledVector(v, rad * Math.sin(t))
    const sc = (p) => { const q = p.clone().project(cam); return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height] }
    const t = deg * Math.PI / 180
    const p0 = sc(P(t)), p1 = sc(P(t + 0.05)), c = sc(a)
    return { p: p0, dir: [p1[0] - p0[0], p1[1] - p0[1]], c }
  }, [deg, rad])
  const angle = () => g(() => window.useApp.getState().joints[0]?.angle ?? NaN)
  // camera set-ups
  const views = [
    ['default (Home)', async () => { await page.keyboard.press('Home'); await page.waitForTimeout(700) }],
    ['iso view', async () => { await g(() => window.useApp.getState().setView('iso')); await page.waitForTimeout(900) }],
    ['orbited low', async () => { await page.mouse.move(200, 700); await page.mouse.down(); await page.mouse.move(260, 640, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(900) }],
    ['top', async () => { await g(() => window.useApp.getState().setView('top')); await page.waitForTimeout(900) }],
    // near edge-on: ring plane almost contains the view direction (user orbited low) — ray∩plane is ill-conditioned
    ['front (edge-on)', async () => { await g(() => window.useApp.getState().setView('front')); await page.waitForTimeout(900) }],
    ['low elevation ~4°', async () => { await g(() => window.useApp.getState().setView('front')); await page.waitForTimeout(900); await page.mouse.move(150, 650); await page.mouse.down(); await page.mouse.move(185, 642, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(900) }],
    ['ortho iso', async () => { await g(() => { const s = window.useApp.getState(); s.setCameraProj('ortho'); s.setView('iso') }); await page.waitForTimeout(1000) }],
    ['ortho front (edge-on)', async () => { await g(() => window.useApp.getState().setView('front')); await page.waitForTimeout(1000) }],
    ['ortho front tilted 3°', async () => { await g(() => { const c = window.__three.camera, ctl = window.__three.controls; const t = ctl?.target ?? c.position.clone().set(0, 0, 0); const off = c.position.clone().sub(t), r = off.length(); const el = 3 * Math.PI / 180, az = Math.atan2(off.x, off.z); c.position.set(t.x + r * Math.cos(el) * Math.sin(az), t.y + r * Math.sin(el), t.z + r * Math.cos(el) * Math.cos(az)); c.lookAt(t); ctl?.update?.() }); await page.waitForTimeout(600) }],
    ['ortho back to persp', async () => { await g(() => window.useApp.getState().setCameraProj('persp')); await page.waitForTimeout(600) }],
  ].filter(([n]) => new RegExp(process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : '.').test(n))
  // grab points on the ring away from the white pointer, offset ±1.5 px perpendicular to the drawn curve
  const grabs = [[70, 1.5, 'tangent'], [-100, -1.5, 'tangent'], [150, 2, 'screenX'], [-60, -1, 'screenY']]

  for (const [vname, setup] of views) {
    await setup()
    for (const [deg, off, how] of grabs) {
      const cur = await angle()
      const q = await ringScreen(cur + deg)
      const vp = page.viewportSize()
      if (q.p[0] < 5 || q.p[1] < 60 || q.p[0] > vp.width - 5 || q.p[1] > vp.height - 5) { console.log(`  skip ${vname} ${deg}°: ring point off-screen ${q.p.map(Math.round)}`); continue }
      const L = Math.hypot(...q.dir) || 1, n = [-q.dir[1] / L, q.dir[0] / L]
      const p = [q.p[0] + n[0] * off, q.p[1] + n[1] * off]
      const d = how === 'tangent' ? [q.dir[0] / L, q.dir[1] / L] : how === 'screenX' ? [1, 0] : [0, 1]
      const cam0 = await camM()
      await page.mouse.move(p[0] - 3, p[1] - 3); await page.mouse.move(p[0], p[1], { steps: 3 })
      await page.waitForTimeout(60)
      await page.mouse.down()
      for (let i = 1; i <= 15; i++) await page.mouse.move(p[0] + d[0] * 5 * i, p[1] + d[1] * 5 * i)
      await page.mouse.up()
      await page.waitForTimeout(300)
      const after = await angle(), cam1 = await camM()
      const name = `${vname} · ring ${deg > 0 ? '+' : ''}${deg}° off ${off}px drag ${how}`
      console.log(`  ${name}: elev ${await g(() => { const c = window.__three.camera; const d = c.getWorldDirection(c.position.clone()); return (Math.asin(-d.y) * 180 / Math.PI).toFixed(1) })}°`)
      // a drag straight ACROSS the visible ring (⟂ its screen tangent) legitimately turns little — only require a turn
      // when the drag has a real component along the drawn ring
      const along = Math.abs(d[0] * q.dir[0] / L + d[1] * q.dir[1] / L)
      if (along >= 0.4) ok(`${name}: angle changed`, Math.abs(after - cur) > 3, { cur, after, along: +along.toFixed(2), grab: p.map((x) => +x.toFixed(1)) })
      else console.log(`  info ${name}: drag across the ring (along=${along.toFixed(2)}) → ${(after - cur).toFixed(2)}°`)
      ok(`${name}: camera unchanged`, camDiff(cam0, cam1) < 1e-3, { dCam: camDiff(cam0, cam1) })
    }
    await shot('jr-' + vname.replace(/\W+/g, '_'))
  }
  await finish()
} catch (e) { await shot('jr-error'); await finish(e) }
