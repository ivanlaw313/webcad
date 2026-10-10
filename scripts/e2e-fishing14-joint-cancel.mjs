#!/usr/bin/env node
// FISHING14 P1 (real browser): Joint tool snap is a PREVIEW. Grounded box component + cylinder component (both
// pos 0/0/0). Real clicks: cylinder side face → box top face. The child may preview-snap while the 「關節類型」
// picker is open, but 取消 / Esc there, and 取消 in 「混合面澄清」, must restore the child pose EXACTLY and leave the
// undo stack untouched. Only 確定 commits snap + joint as ONE undo step. Also checks the snap lands the cylinder
// upright ON the box top (axis ∥ top normal, through the face centre, bottom end touching, no penetration).
// Usage: nice -n 19 npx vite build && flock /tmp/webcad-e2e.lock nice -n 19 node scripts/e2e-fishing14-joint-cancel.mjs [--shots DIR]
import { launch, clickAt } from './e2e-lib.mjs'

const { page, ok, finish, shot } = await launch()
const g = (fn, a) => page.evaluate(fn, a)
try {
  await g(async () => {
    const s = () => window.useApp.getState()
    // box 100×80×20 centred at CAD (-110, 40) with a Ø12 hole, then a Ø10×60 cylinder at the origin — like the tester
    for (let t = 0; t < 200 && !(await s().applyFeatures([{ id: 'box', type: 'extrude', profile: { kind: 'rect', a: [-160, 0], b: [-60, 80] }, height: 20, operation: 'new' }], 'box')); t++) await new Promise((r) => setTimeout(r, 250))
    await s().applyFeatures([...s().features, { id: 'hole', type: 'extrude', profile: { kind: 'circle', c: [-110, 40], r: 6 }, height: 40, baseZ: -10, operation: 'cut' }], 'hole')
    s().newComponent()
    await s().applyFeatures([{ id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: 5 }, height: 60, operation: 'new' }], 'cyl')
    s().newComponent()
    s().selectComponent(null)
  })
  await page.waitForTimeout(800)
  const comps = await g(() => window.useApp.getState().components.map((c) => { let zmin = Infinity, zmax = -Infinity; const v = c.mesh.vertices; for (let i = 2; i < v.length; i += 3) { zmin = Math.min(zmin, v[i]); zmax = Math.max(zmax, v[i]) } return { id: c.id, name: c.name, h: zmax - zmin, pos: c.pos, rot: c.rot } }))
  const box = comps.find((c) => Math.abs(c.h - 20) < 1), cyl = comps.find((c) => Math.abs(c.h - 60) < 1)
  ok('setup: box + cylinder components', !!box && !!cyl, { comps })
  await g((id) => window.useApp.getState().toggleComponentGround(id), box.id)
  await page.keyboard.press('Home'); await page.waitForTimeout(800)
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
    if (which === 'cylSide') { const rad = (bb.mx.x - bb.mn.x) / 2; const d = camera.position.clone().sub(c); d.y = 0; d.normalize(); p = c.clone().setY(bb.mn.y + (bb.mx.y - bb.mn.y) * 0.6).addScaledVector(d, rad * 0.97) }
    else { const d = camera.position.clone().sub(c); d.y = 0; d.normalize(); p = c.clone().setY(bb.mx.y).addScaledVector(d, (bb.mx.z - bb.mn.z) * 0.3) }   // top face, away from the hole
    const q = p.clone().project(camera)
    return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height]
  }, [compId, which])
  const st = () => g((id) => { const s = window.useApp.getState(); const c = s.components.find((x) => x.id === id); return { pos: c.pos, rot: c.rot ?? [0, 0, 0], undo: s.undoStack.length, redo: s.redoStack.length, joints: s.joints.length, status: s.status, dlg: s.uiDialog ? { kind: s.uiDialog.kind, title: s.uiDialog.title, msg: s.uiDialog.msg } : null, pick: s.jointPickMode } }, cyl.id)
  const same = (a, b) => a.pos.every((v, i) => Math.abs(v - b.pos[i]) < 1e-9) && a.rot.every((v, i) => Math.abs(v - b.rot[i]) < 1e-9)
  const pickPair = async () => {
    await g(() => window.useApp.getState().runCommand('joint', '關節')); await page.waitForTimeout(300)
    await clickAt(page, await facePoint(cyl.id, 'cylSide'))
    const p1 = await g(() => window.useApp.getState().jointPick)
    await clickAt(page, await facePoint(box.id, 'top'))
    await page.waitForSelector('[data-testid="dialog-pick-list"]', { timeout: 10000 })
    return p1
  }
  const before = await st()
  // ① 取消 in the type picker
  const p1 = await pickPair()
  ok('first pick is the cylinder side face', p1?.compId === cyl.id && p1?.face?.kind === 'cyl', { p1: p1 && { c: p1.compId, k: p1.face.kind } })
  const during = await st()
  ok('type picker open; mixed pick (圓柱↔平面) is explained in the picker', during.dlg?.kind === 'pick' && /混合/.test(during.dlg.msg), { dlg: during.dlg })
  ok('nothing committed to the undo stack while the picker is open', during.undo === before.undo, { before: before.undo, during: during.undo })
  await shot('j-1-picker')
  await page.locator('[role="dialog"] button', { hasText: '取消' }).first().click(); await page.waitForTimeout(400)
  const c1 = await st()
  ok('取消 restores the cylinder pose exactly', same(c1, before), { before: [before.pos, before.rot], after: [c1.pos, c1.rot] })
  ok('取消 leaves the undo stack clean and creates no joint', c1.undo === before.undo && c1.joints === 0, { undo: c1.undo, joints: c1.joints, status: c1.status })
  ok('取消 status says nothing was changed', /已取消/.test(c1.status) && !/可撤銷貼合/.test(c1.status), { status: c1.status })
  // ② Esc in the type picker
  await pickPair()
  await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  const c2 = await st()
  ok('Esc in the type picker restores the pose + clean undo', same(c2, before) && c2.undo === before.undo && c2.joints === 0 && !c2.dlg, { pos: c2.pos, undo: c2.undo, status: c2.status })
  // ③ 確定 旋轉 → 混合面澄清 → 取消
  await pickPair()
  await page.locator('[data-testid="dialog-pick-revolute"]').click(); await page.waitForTimeout(500)   // picking an option = 確定
  const c3a = await st()
  ok('mixed pick + 旋轉 shows 「混合面澄清」', c3a.dlg?.kind === 'confirm' && /混合面澄清/.test(c3a.dlg.title), { dlg: c3a.dlg })
  await page.locator('[role="dialog"] button', { hasText: '取消' }).first().click(); await page.waitForTimeout(400)
  const c3 = await st()
  ok('取消 in 混合面澄清 restores the pose + clean undo, no joint', same(c3, before) && c3.undo === before.undo && c3.joints === 0, { pos: c3.pos, undo: c3.undo, status: c3.status })
  // ④ 確定 → 混合面澄清 確定 → ONE undo step; geometry sensible
  await pickPair()
  await page.locator('[data-testid="dialog-pick-revolute"]').click(); await page.waitForTimeout(500)
  await page.locator('[role="dialog"] button', { hasText: '確定' }).first().click(); await page.waitForTimeout(600)   // 混合面澄清 → 確定
  const c4 = await st()
  ok('確定 creates the revolute joint as ONE undo step', c4.joints === 1 && c4.undo === before.undo + 1 && c4.redo === 0, { joints: c4.joints, undo: c4.undo, status: c4.status })
  const geo = await g(([bid, cid]) => {
    const { scene } = window.__three
    const bbOf = (id) => { let bb = null; scene.traverse((o) => { if (!o.isMesh || o.userData?.compId !== id || !o.userData?.cadBody) return; o.geometry.computeBoundingBox(); o.updateWorldMatrix(true, false); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); bb = bb ? bb.union(b) : b }); return bb && { mn: b2a(bb.min), mx: b2a(bb.max) } }
    const b2a = (v) => [v.x, v.y, v.z].map((x) => +x.toFixed(3))
    return { box: bbOf(bid), cyl: bbOf(cid), joint: window.useApp.getState().joints[0] }
  }, [box.id, cyl.id])
  const bc = [(geo.box.mn[0] + geo.box.mx[0]) / 2, (geo.box.mn[2] + geo.box.mx[2]) / 2], cc = [(geo.cyl.mn[0] + geo.cyl.mx[0]) / 2, (geo.cyl.mn[2] + geo.cyl.mx[2]) / 2]
  const ext = [geo.cyl.mx[0] - geo.cyl.mn[0], geo.cyl.mx[1] - geo.cyl.mn[1], geo.cyl.mx[2] - geo.cyl.mn[2]]
  ok('snap: cylinder stands upright (axis ∥ box top normal)', Math.abs(ext[1] - 60) < 0.5 && Math.abs(ext[0] - 10) < 0.5, { ext })
  ok('snap: cylinder axis passes through the picked top face centre', Math.hypot(cc[0] - bc[0], cc[1] - bc[1]) < 0.5, { boxCentre: bc, cylCentre: cc })
  ok('snap: cylinder bottom touches the box top (no penetration, no gap)', Math.abs(geo.cyl.mn[1] - geo.box.mx[1]) < 0.05, { cylMinY: geo.cyl.mn[1], boxTopY: geo.box.mx[1] })
  await shot('j-4-committed')
  // ⑤ one Ctrl+Z restores both pose and joint
  await page.mouse.click(700, 60).catch(() => {})
  await page.keyboard.press('Control+z'); await page.waitForTimeout(500)
  const c5 = await st()
  ok('one Ctrl+Z removes the joint AND restores the pose', c5.joints === 0 && same(c5, before), { joints: c5.joints, pos: c5.pos, status: c5.status })
  await finish()
} catch (e) { await shot('j-error'); await finish(e) }
