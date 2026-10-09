#!/usr/bin/env node
// RETEST21 #1 real-browser repro, created like a user: two bodies → components (plate + shaft), Joint tool
// (runCommand 'joint' = ribbon), REAL mouse clicks on the shaft cylinder face then the plate top face, pick
// 旋轉 in the type list, then drag several points of the visible orange ring + the white angle handle at the
// default camera. Must turn (angle ≠ 0) and must not orbit. Also #3: joint card ✕ → Ctrl+Z restores the joint.
// Usage (repo root, after `npx vite build`): nice -n 19 node scripts/e2e-joint-ui.mjs [--shots /tmp/ju] [--dpr 2]
import { launch, clickAt } from './e2e-lib.mjs'

const { page, ok, finish, shot } = await launch()
const g = (fn, a) => page.evaluate(fn, a)
const cam = () => g(() => { const c = window.__three.camera; return [c.position.x, c.position.y, c.position.z].map((v) => +v.toFixed(3)) })
try {
  // --stacked (UX3 tester layout): the shaft stands ON the plate as a second body of the same document, both
  // bodies frozen by one 新建組件, plate grounded. --reverse picks the plate first.
  // --hole: the shaft goes THROUGH a Ø12 hole in the plate (typical revolute set-up). --select-shaft: the shaft
  // component is selected (gumball shown) before the joint tool starts.
  const hole = process.argv.includes('--hole')
  const stacked = hole || process.argv.includes('--stacked'), reverse = process.argv.includes('--reverse')
  await g(async ([stacked, hole]) => {
    const s = () => window.useApp.getState()
    for (let t = 0; t < 200 && !(await s().applyFeatures([{ id: 'plate', type: 'extrude', profile: { kind: 'rect', a: [-30, -30], b: [30, 30] }, height: 10, operation: 'new' }], 'plate')); t++) await new Promise((r) => setTimeout(r, 250))
    if (hole) await s().applyFeatures([...s().features, { id: 'hole', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: 6 }, height: 30, baseZ: -10, operation: 'cut' }], 'hole')
    if (stacked) {
      await s().applyFeatures([...s().features, { id: 'shaft', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: 6 }, height: hole ? 50 : 40, baseZ: hole ? -15 : 10, operation: 'newbody' }], 'shaft')
      s().newComponent()
    } else {
      s().newComponent()
      await s().applyFeatures([{ id: 'shaft', type: 'extrude', profile: { kind: 'circle', c: [70, 0], r: 6 }, height: 40, operation: 'new' }], 'shaft')
      s().newComponent()
    }
    s().selectComponent(null)
  }, [stacked, hole])
  await page.waitForTimeout(800)
  let comps = await g(() => window.useApp.getState().components.map((c) => { let zmin = Infinity, zmax = -Infinity; const v = c.mesh.vertices || c.mesh.positions || []; for (let i = 2; i < v.length; i += 3) { zmin = Math.min(zmin, v[i]); zmax = Math.max(zmax, v[i]) } return { id: c.id, name: c.name, h: zmax - zmin } }))
  if (stacked) {
    comps = [...comps].sort((a, b) => a.h - b.h)   // plate (10 high) first, shaft (40) second
    await g((id) => window.useApp.getState().toggleComponentGround(id), comps[0].id)
    await page.waitForTimeout(300)
  }
  if (process.argv.includes('--select-shaft')) { await g((id) => window.useApp.getState().selectComponent(id), comps[comps.length - 1].id); await page.waitForTimeout(300) }
  console.log('components', JSON.stringify(comps))
  const proj = process.argv.includes('--ortho') ? 'ortho' : process.argv.includes('--persp-ortho') ? 'perspOrtho' : null
  if (proj) { await g((p) => window.useApp.getState().setCameraProj(p), proj); await page.waitForTimeout(600) }
  // Fit view (Home) like a user would, then the joint tool from the ribbon command
  await page.keyboard.press('Home'); await page.waitForTimeout(700)
  await shot('ju-0')
  await g(() => window.useApp.getState().runCommand('joint', '關節'))
  await page.waitForTimeout(300)
  // screen points on the real rendered meshes (world bbox of each component's body mesh → visible face point)
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
      p = c.clone().setY(bb.mn.y + (bb.mx.y - bb.mn.y) * 0.8).addScaledVector(d, rad * 0.98)   // well above the plate
    } else if (which === 'plateTopFree') {
      // a free spot on the plate top (away from the shaft at the centre), on the camera side
      const d = camera.position.clone().sub(c); d.y = 0; d.normalize()
      p = c.clone().setY(bb.mx.y).addScaledVector(d, (bb.mx.x - bb.mn.x) * 0.3)
    } else p = c.clone().setY(bb.mx.y)   // planar top face centre
    const q = p.clone().project(camera)
    return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height]
  }, [compId, which])
  const [plateId, shaftId] = comps.map((c) => c.id)
  const shaftPt = await facePoint(shaftId, 'cylSide')
  const plateTop = await facePoint(plateId, stacked ? 'plateTopFree' : 'top')
  console.log('shaft cylinder at', shaftPt, 'plate top at', plateTop, 'grounded', await g(() => JSON.stringify(window.useApp.getState().components.map((c) => [c.id, !!c.grounded]))))
  const pickInfo = () => g(() => { const s = window.useApp.getState(); return { status: s.status, pick: s.jointPick ? { compId: s.jointPick.compId, kind: s.jointPick.face.kind } : null } })
  if (!reverse) {
    await clickAt(page, shaftPt)
    const p1 = await pickInfo()
    ok('first pick = shaft cylinder (parent) on the shaft component', p1.pick?.compId === shaftId && p1.pick?.kind === 'cyl', { p1, shaftId })
    await clickAt(page, plateTop)
  } else {
    await clickAt(page, plateTop)
    const p1 = await pickInfo()
    ok('first pick = plate top (parent) on the plate component', p1.pick?.compId === plateId && p1.pick?.kind === 'planar', { p1, plateId })
    await clickAt(page, shaftPt)
  }
  const p2 = await pickInfo()
  ok('second pick accepted (not 「另一個組件」 refusal)', !/另一個】組件嘅面/.test(p2.status), { p2 })
  await page.waitForSelector('[data-testid="dialog-pick-revolute"]', { timeout: 10000 })
  const lbl = await page.locator('[data-testid="dialog-pick-revolute"]').textContent()
  ok('type list offers 旋轉', /旋轉/.test(lbl), { lbl })
  await page.locator('[data-testid="dialog-pick-revolute"]').click()
  await page.waitForTimeout(900)
  const j0 = await g(() => window.useApp.getState().joints[0])
  ok('revolute joint created via UI', j0?.type === 'revolute', { j0 })
  console.log('joint', JSON.stringify(j0), 'selected', await g(() => window.useApp.getState().selectedComponent))
  await shot('ju-1-joint')

  // ── where is the ring ACTUALLY rendered? (orange Line2 objects in the scene, world-transformed) vs the joint anchor ──
  const rendered = await g(() => {
    const { scene, camera } = window.__three
    const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]
    const r = cv.getBoundingClientRect()
    const out = []
    scene.traverse((o) => {
      const col = o.material?.color; if (!col || !o.geometry?.attributes?.instanceStart) return
      const hex = col.getHexString(); if (hex !== 'ff8c00' && hex !== 'ffffff') return
      o.updateWorldMatrix(true, false)
      const a = o.geometry.attributes.instanceStart, pts = []
      for (let i = 0; i < a.count; i += Math.max(1, Math.floor(a.count / 8))) {
        const v = camera.position.clone().set(a.getX(i), a.getY(i), a.getZ(i)).applyMatrix4(o.matrixWorld)
        const q = v.clone().project(camera)
        pts.push({ w: [v.x, v.y, v.z].map((x) => +x.toFixed(2)), s: [Math.round(r.left + (q.x + 1) / 2 * r.width), Math.round(r.top + (1 - q.y) / 2 * r.height)] })
      }
      out.push({ hex, n: a.count, lw: o.material.linewidth, worldUnits: o.material.worldUnits, opacity: o.material.opacity, pts })
    })
    return out
  })
  console.log('rendered joint lines', JSON.stringify(rendered).slice(0, 3000))
  // ── drag on the visible ring (several points) + white handle, default camera after creation ──
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
    const p0 = sc(P(t)), p1 = sc(P(t + 0.05))
    return { p: p0, dir: [p1[0] - p0[0], p1[1] - p0[1]] }
  }, [deg, rad])
  const angle = () => g(() => window.useApp.getState().joints[0]?.angle ?? NaN)
  const grabs = [
    ['ring +60°', async (cur) => ringScreen(cur + 60)],
    ['ring −90°', async (cur) => ringScreen(cur - 90)],
    ['ring 150°', async (cur) => ringScreen(cur + 150)],
    ['ring edge +3px off', async (cur) => { const q = await ringScreen(cur + 120); const L = Math.hypot(...q.dir) || 1; return { p: [q.p[0] - q.dir[1] / L * 3, q.p[1] + q.dir[0] / L * 3], dir: q.dir } }],
    ['white handle bead', async (cur) => ringScreen(cur)],
    ['white handle line (mid)', async (cur) => ringScreen(cur, 15)],
    ['orange anchor ball (drag out + around)', async (cur) => ({ p: (await ringScreen(cur, 0)).p, path: await Promise.all([0, 10, 20, 30, 40, 50, 60].map(async (d, i) => (await ringScreen(cur + d, i ? 25 : 12)).p)) })],
  ]
  const undoBefore = await g(() => window.useApp.getState().undoStack.length)
  for (const [name, at] of grabs) {
    const cur = await angle(), cam0 = await cam()
    const { p, dir, path } = await at(cur)
    await page.mouse.move(p[0] - 2, p[1] - 2); await page.mouse.move(p[0], p[1], { steps: 2 })
    await page.mouse.down()
    if (path) for (const q of path) await page.mouse.move(q[0], q[1], { steps: 3 })
    else { const L = Math.hypot(dir[0], dir[1]) || 1, step = 60; for (let i = 1; i <= 12; i++) await page.mouse.move(p[0] + dir[0] / L * step * i / 12, p[1] + dir[1] / L * step * i / 12) }
    await page.mouse.up()
    await page.waitForTimeout(250)
    const after = await angle(), cam1 = await cam()
    const moved = Math.hypot(cam1[0] - cam0[0], cam1[1] - cam0[1], cam1[2] - cam0[2])
    ok(`${name}: joint turned`, Math.abs(after - cur) > 3, { grab: p.map(Math.round), cur, after })
    ok(`${name}: camera did not orbit`, moved < 1e-3, { cam0, cam1 })
  }
  await shot('ju-2-dragged')
  ok('child still selected after handle drags (release click swallowed)', await g(() => window.useApp.getState().selectedComponent) === j0.child, {})
  const undoAfter = await g(() => window.useApp.getState().undoStack.length)
  ok('one undo step per drag', undoAfter - undoBefore === grabs.length, { undoBefore, undoAfter, drags: grabs.length })

  // ── UX3 (a): with a joint (and its ring) already on screen, a second joint pick on the shaft's cylinder must
  // still resolve to the SHAFT component (not the plate), in both orders ──
  for (const order of ['shaftFirst', 'plateFirst']) {
    await g(() => { const s = window.useApp.getState(); s.selectComponent(null); s.runCommand('joint', '關節') }); await page.waitForTimeout(400)
    const sp = await facePoint(shaftId, 'cylSide'), pp = await facePoint(plateId, 'plateTopFree')   // plate centre now has the shaft through it
    const first = order === 'shaftFirst' ? sp : pp, second = order === 'shaftFirst' ? pp : sp
    await clickAt(page, first); const a1 = await pickInfo()
    await clickAt(page, second); const a2 = await pickInfo()
    const expectFirst = order === 'shaftFirst' ? shaftId : plateId
    ok(`(a) existing joint, ${order}: 1st pick on the right component`, a1.pick?.compId === expectFirst, { a1, expectFirst })
    ok(`(a) existing joint, ${order}: 2nd pick not refused as same component`, !/另一個】組件嘅面/.test(a2.status), { a2 })
    // close whatever the second pick opened (type dialog → cancel; or leave pick mode)
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    await g(() => { const s = window.useApp.getState(); if (s.jointPickMode) s.cancelJointPick() })
    const nJ = await g(() => window.useApp.getState().joints.length)
    if (nJ > 1) await g(() => { const s = window.useApp.getState(); s.removeJoint(s.joints[s.joints.length - 1].id) })
    await page.waitForTimeout(300)
  }

  // ── #3 joint card ✕ → undoable ──
  const nBefore = await g(() => window.useApp.getState().joints.length)
  if (await page.locator('.joints-pill', { hasText: '關節' }).count()) { await page.locator('.joints-pill', { hasText: '關節' }).first().click(); await page.waitForTimeout(300) }
  console.log('  joints UI:', JSON.stringify(await page.evaluate(() => ({ panel: document.querySelectorAll('.joints-panel').length, cards: document.querySelectorAll('.jp-joint').length, pill: document.querySelector('.joints-pill')?.textContent ?? null, del: document.querySelectorAll('[data-testid^="joint-card-del"]').length, boundary: [...document.querySelectorAll('*')].filter((e) => /裝配關節/.test(e.textContent || '') && e.children.length === 0).map((e) => e.textContent).slice(0, 3), comps: window.useApp.getState().components.length, inspect: window.useApp.getState().inspectMode }))))
  const del = page.locator('[data-testid^="joint-card-del"]').first()
  if (await del.count()) {
    await del.click(); await page.waitForTimeout(300)
    // either a confirm dialog or immediate delete; accept a confirm if shown
    if (await page.locator('[role="dialog"]').count()) { const okb = page.locator('[role="dialog"] button', { hasText: /確定|删除|刪除|OK/ }).first(); if (await okb.count()) await okb.click() }
    await page.waitForTimeout(300)
    const nDel = await g(() => window.useApp.getState().joints.length)
    const delStatus = await g(() => window.useApp.getState().status)
    ok('#3 delete status says it can be undone', /Ctrl\+Z|撤銷|復原/.test(delStatus), { delStatus })
    await page.mouse.click(700, 60).catch(() => {})
    await page.keyboard.press('Control+z'); await page.waitForTimeout(400)
    const nUndo = await g(() => window.useApp.getState().joints.length)
    console.log('  status after delete/undo:', await g(() => window.useApp.getState().status))
    ok('#3 joint card ✕ deletes', nDel === nBefore - 1, { nBefore, nDel })
    ok('#3 Ctrl+Z restores the deleted joint', nUndo === nBefore, { nUndo })
  } else ok('#3 joint card ✕ found', false, {})
  await finish()
} catch (e) { await shot('ju-error'); await finish(e) }
