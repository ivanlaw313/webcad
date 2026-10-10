#!/usr/bin/env node
// FISHING14 B：橙環角 −230° → HUD/⌂歸零 → 0；滑動同理；一步 Ctrl+Z
import { launch } from './e2e-lib.mjs'
const { page, ok, finish } = await launch({ port: Number(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 4414) })
const g = (fn, a) => page.evaluate(fn, a)
try {
  await g(() => { window.useApp.setState({ ...window.useApp.getInitialState() }, true) })
  await page.waitForTimeout(150)
  await g(() => {
    const box = (id, pos) => ({
      id, name: id === 'C1' ? '組件1' : '組件2',
      mesh: { vertices: [-5, -5, -5, 5, -5, -5, 5, 5, 5, -5, 5, 5], triangles: [0, 1, 2, 0, 2, 3], normals: [] },
      pos, rot: [0, 0, 0], color: '#666',
    })
    window.useApp.setState({
      components: [box('C1', [0, 0, 0]), box('C2', [-0.6, 10, 1.25])],
      grounded: 'C1',
      joints: [{
        id: 'J1', name: '關節1', type: 'revolute', parent: 'C1', child: 'C2',
        anchor: [-0.6, 10, 1.25], axis: [0, 1, 0], angle: 0, slide: 0,
        restChildPose: { pos: [-0.6, 10, 1.25], rot: [0, 0, 0] },
      }],
      selectedComponent: 'C2', objectVis: { ...window.useApp.getState().objectVis, joints: true },
      undoStack: [], redoStack: [], mode: 'model',
    })
  })
  await g(() => {
    const s = window.useApp.getState()
    s.beginJointDrive(); s.setJointValue('J1', { angle: -230.226 }); s.endJointDrive()
  })
  let st = await g(() => ({ angle: window.useApp.getState().joints[0].angle, status: window.useApp.getState().status }))
  ok('driven to −230.226°', Math.abs(st.angle + 230.226) < 1e-6, st)

  // HUD path = homeJoint on driving joint of selected component
  await g(() => {
    window.useApp.getState().selectComponent('C2')
    window.useApp.getState().homeJoint('J1')
  })
  st = await g(() => {
    const s = window.useApp.getState()
    const c = s.components.find((x) => x.id === 'C2')
    return { angle: s.joints[0].angle, pos: c.pos.slice(), rest: s.joints[0].restChildPose }
  })
  ok('homeJoint → angle 0 + restChildPose', st.angle === 0 && st.pos[0] === st.rest.pos[0] && st.pos[1] === st.rest.pos[1] && st.pos[2] === st.rest.pos[2], st)

  await g(() => { window.useApp.getState().undo() })
  st = await g(() => ({ angle: window.useApp.getState().joints[0].angle }))
  ok('one undo restores −230.226°', Math.abs(st.angle + 230.226) < 1e-6, st)

  await g(() => { window.useApp.getState().homeJoints() })
  st = await g(() => ({ angle: window.useApp.getState().joints[0].angle }))
  ok('homeJoints → 0', st.angle === 0, st)

  // Slider
  await g(() => {
    window.useApp.setState({
      joints: [{
        id: 'J1', name: '關節1', type: 'slider', parent: 'C1', child: 'C2',
        anchor: [-0.6, 10, 1.25], axis: [0, 1, 0], angle: 0, slide: -66.37,
        restChildPose: { pos: [-0.6, 10, 1.25], rot: [0, 0, 0] },
      }],
      undoStack: [], redoStack: [],
    })
    window.useApp.getState().homeJoint('J1')
  })
  st = await g(() => ({ slide: window.useApp.getState().joints[0].slide }))
  ok('slider homeJoint → slide 0', st.slide === 0, st)

  // UI: expand joints panel + click ⌂ 歸零
  await g(() => {
    window.useApp.setState({
      joints: [{
        id: 'J1', name: '關節1', type: 'revolute', parent: 'C1', child: 'C2',
        anchor: [-0.6, 10, 1.25], axis: [0, 1, 0], angle: -230.226, slide: 0,
        restChildPose: { pos: [-0.6, 10, 1.25], rot: [0, 0, 0] },
      }],
      inspectMode: false, undoStack: [], redoStack: [],
    })
    window.dispatchEvent(new CustomEvent('webcad:assembly-focus', { detail: { section: 'joint', jointId: 'J1' } }))
  })
  await page.waitForTimeout(300)
  const homeBtn = page.locator('[data-testid="joints-home-all"]')
  await homeBtn.waitFor({ state: 'visible', timeout: 8000 })
  await homeBtn.click()
  await page.waitForTimeout(100)
  st = await g(() => ({ angle: window.useApp.getState().joints[0].angle, status: window.useApp.getState().status }))
  ok('UI ⌂ 歸零 → angle 0', st.angle === 0, st)

  await g(() => {
    window.useApp.getState().beginJointDrive()
    window.useApp.getState().setJointValue('J1', { angle: -230.226 })
    window.useApp.getState().endJointDrive()
  })
  const per = page.locator('[data-testid="joint-home-J1"]')
  await per.waitFor({ state: 'visible', timeout: 5000 })
  await per.click()
  st = await g(() => ({ angle: window.useApp.getState().joints[0].angle }))
  ok('UI ↺歸零 per-joint → 0', st.angle === 0, st)

  await finish()
} catch (e) {
  await finish(e)
}
