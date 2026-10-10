#!/usr/bin/env node
// FISHING14 B (real browser): joint pick armed + component already selected (edges/gumball would show) →
// real mouse click on cylinder SIDE must record a cylindrical face for the joint, never steal into
// component move/rotate HUD. Esc after a successful first pick exits cleanly with no leftover HUD.
// Usage: nice -n 19 npx vite build && flock /tmp/webcad-e2e.lock nice -n 19 node scripts/e2e-fishing14-joint-face-pick.mjs [--shots DIR]
import { launch, clickAt } from './e2e-lib.mjs'

const { page, ok, finish, shot } = await launch()
const g = (fn, a) => page.evaluate(fn, a)
try {
  await g(async () => {
    const s = () => window.useApp.getState()
    for (let t = 0; t < 200 && !(await s().applyFeatures([{ id: 'box', type: 'extrude', profile: { kind: 'rect', a: [-160, 0], b: [-60, 80] }, height: 20, operation: 'new' }], 'box')); t++) await new Promise((r) => setTimeout(r, 250))
    await s().applyFeatures([...s().features, { id: 'hole', type: 'extrude', profile: { kind: 'circle', c: [-110, 40], r: 6 }, height: 40, baseZ: -10, operation: 'cut' }], 'hole')
    s().newComponent()
    await s().applyFeatures([{ id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: 5 }, height: 60, operation: 'new' }], 'cyl')
    s().newComponent()
  })
  await page.waitForTimeout(800)
  const comps = await g(() => window.useApp.getState().components.map((c) => {
    let zmin = Infinity, zmax = -Infinity
    const v = c.mesh.vertices
    for (let i = 2; i < v.length; i += 3) { zmin = Math.min(zmin, v[i]); zmax = Math.max(zmax, v[i]) }
    return { id: c.id, name: c.name, h: zmax - zmin, pos: [...c.pos] }
  }))
  const box = comps.find((c) => Math.abs(c.h - 20) < 1), cyl = comps.find((c) => Math.abs(c.h - 60) < 1)
  ok('setup: box + cylinder components', !!box && !!cyl, { comps })
  await g((id) => window.useApp.getState().toggleComponentGround(id), box.id)
  await page.keyboard.press('Home'); await page.waitForTimeout(800)
  // FISHING14 B repro: select shaft AFTER fit-all so edges/HUD arm without reframing away from the plate.
  await g((id) => window.useApp.getState().selectComponent(id), cyl.id)
  const selBefore = await g(() => window.useApp.getState().selectedComponent)
  ok('shaft selected before joint (HUD would show)', selBefore === cyl.id, { selBefore, cyl: cyl.id })

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
      p = c.clone().setY(bb.mn.y + (bb.mx.y - bb.mn.y) * 0.6).addScaledVector(d, rad * 0.97)
    } else {
      const d = camera.position.clone().sub(c); d.y = 0; d.normalize()
      p = c.clone().setY(bb.mx.y).addScaledVector(d, (bb.mx.z - bb.mn.z) * 0.3)
    }
    const q = p.clone().project(camera)
    return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height]
  }, [compId, which])

  // Arm joint with shaft still selected → startJointPick must clear HUD selection
  await g(() => window.useApp.getState().runCommand('joint', '關節'))
  await page.waitForTimeout(300)
  const armed = await g(() => {
    const s = window.useApp.getState()
    return { pick: s.jointPickMode, sel: s.selectedComponent, status: s.status }
  })
  ok('startJointPick clears component selection (no HUD)', armed.pick === true && armed.sel == null, armed)

  // Real mouse click on cylinder side — must get cyl face, not re-select component
  const side = await facePoint(cyl.id, 'cylSide')
  ok('projected cylinder side screen point', !!side, { side })
  await clickAt(page, side)
  await page.waitForTimeout(400)
  const afterSide = await g(() => {
    const s = window.useApp.getState()
    return {
      pick: s.jointPickMode,
      joint: s.jointPick ? { c: s.jointPick.compId, k: s.jointPick.face?.kind, r: s.jointPick.face?.r } : null,
      sel: s.selectedComponent,
      status: s.status,
    }
  })
  ok('cylinder side → cylindrical face for joint (not component)', afterSide.pick && afterSide.joint?.c === cyl.id && afterSide.joint?.k === 'cyl' && afterSide.sel == null, afterSide)
  await shot('jface-1-cyl-side')

  // Second pick: box top → type dialog (mixed cyl↔plane still works)
  const top = await facePoint(box.id, 'top')
  ok('projected box top screen point', !!top, { top })
  await clickAt(page, top)
  await page.waitForTimeout(500)
  const mid = await g(() => {
    const s = window.useApp.getState()
    return { pick: s.jointPickMode, joint: s.jointPick ? { c: s.jointPick.compId, k: s.jointPick.face?.kind } : null, dlg: s.uiDialog?.kind, status: s.status, sel: s.selectedComponent }
  })
  if (mid.dlg !== 'pick') {
    // Retry once with a fresh project (orbit jitter)
    await page.mouse.wheel(0, -120); await page.waitForTimeout(200)
    const top2 = await facePoint(box.id, 'top')
    await clickAt(page, top2)
    await page.waitForTimeout(500)
  }
  await page.waitForSelector('[data-testid="dialog-pick-list"]', { timeout: 10000 })
  const dlg = await g(() => {
    const s = window.useApp.getState()
    return { kind: s.uiDialog?.kind, title: s.uiDialog?.title, msg: s.uiDialog?.msg, sel: s.selectedComponent }
  })
  ok('mixed cyl↔plane opens 關節類型 (no mid-pick component HUD steal)', dlg.kind === 'pick' && /混合|關節/.test(dlg.msg + (dlg.title || '')), dlg)
  await shot('jface-2-type-dlg')

  // Cancel type dialog, then re-arm and Esc after first face — no leftover HUD
  await page.locator('[role="dialog"] button', { hasText: '取消' }).first().click()
  await page.waitForTimeout(400)

  await g((id) => {
    window.useApp.getState().selectComponent(id) // re-select to stress Esc cleanup
    window.useApp.getState().runCommand('joint', '關節')
  }, cyl.id)
  await page.waitForTimeout(200)
  await clickAt(page, await facePoint(cyl.id, 'cylSide'))
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const afterEsc = await g(() => {
    const s = window.useApp.getState()
    return { pick: s.jointPickMode, joint: s.jointPick, sel: s.selectedComponent, status: s.status }
  })
  ok('Esc exits joint pick with no leftover selection HUD', !afterEsc.pick && !afterEsc.joint && afterEsc.sel == null && /已退出關節拾取/.test(afterEsc.status), afterEsc)
  await shot('jface-3-esc-clean')

  await finish()
} catch (err) {
  await finish(err)
}
