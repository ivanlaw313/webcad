#!/usr/bin/env node
// P1 A/B e2e: material undo scoped to active body; revolute drive keeps pos; 歸零 restores restChildPose.
import { launch } from './e2e-lib.mjs'
const { page, ok, finish } = await launch({ port: Number(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 4397) })
const g = (fn, a) => page.evaluate(fn, a)
try {
  // ── P1 B ──
  await g(async () => {
    window.useApp.setState({ ...window.useApp.getInitialState() }, true)
  })
  await page.waitForTimeout(200)
  await g(async () => {
    const s = window.useApp.getState()
    await s.applyFeatures([{ id: 'b1', type: 'prim', shape: 'box', a: 40, b: 30, c: 20, op: 'new', cornerOrigin: true }], 'box')
  })
  await page.waitForFunction(() => !window.useApp.getState().busy)
  const d0 = await g(() => window.useApp.getState().bodyDensity)
  await g(() => window.useApp.getState().setPhysicalMaterial('铝'))
  await g(async () => {
    const s = window.useApp.getState()
    await s.applyFeatures([...s.features, { id: 'b2', type: 'prim', shape: 'box', a: 20, b: 20, c: 20, op: 'newbody', cornerOrigin: true, at: [50, 0, 0] }], 'box2')
  })
  await page.waitForFunction(() => !window.useApp.getState().busy)
  let st = await g(() => ({ phys: window.useApp.getState().physMatName, parked: window.useApp.getState().parkedBodyMaterials, dens: window.useApp.getState().bodyDensity }))
  ok('P1B newbody parks 铝; document dens unchanged', st.parked[0] === '铝' && st.phys === '' && st.dens === d0, st)
  await g(() => window.useApp.getState().setPhysicalMaterial('钢'))
  st = await g(() => ({ phys: window.useApp.getState().physMatName, parked: window.useApp.getState().parkedBodyMaterials, dens: window.useApp.getState().bodyDensity }))
  ok('P1B active 钢 does not contaminate parked 铝', st.phys === '钢' && st.parked[0] === '铝' && st.dens === d0, st)
  await g(async () => { await window.useApp.getState().undo() })
  st = await g(() => ({ phys: window.useApp.getState().physMatName, parked: window.useApp.getState().parkedBodyMaterials, dens: window.useApp.getState().bodyDensity }))
  ok('P1B undo restores active only', st.phys === '' && st.parked[0] === '铝' && st.dens === d0, st)

  // ── P1 A shaft-in-bushing style revolute ──
  await g(() => { window.useApp.setState({ ...window.useApp.getInitialState() }, true) })
  await page.waitForTimeout(200)
  await g(async () => {
    const s = window.useApp.getState()
    // plate with hole (bushing) + shaft through hole
    await s.applyFeatures([
      { id: 'plate', type: 'prim', shape: 'box', a: 60, b: 60, c: 20, op: 'new', cornerOrigin: true },
      { id: 'hole', type: 'extrude', profile: { kind: 'circle', c: [30, 30], r: 8 }, height: 30, operation: 'cut' },
    ], 'bush')
  })
  await page.waitForFunction(() => !window.useApp.getState().busy, null, { timeout: 60000 })
  await g(() => window.useApp.getState().newComponent())
  await page.waitForTimeout(400)
  await g(async () => {
    const s = window.useApp.getState()
    await s.applyFeatures([{ id: 'shaft', type: 'extrude', profile: { kind: 'circle', c: [30, 30], r: 7 }, height: 50, baseZ: -10, operation: 'new' }], 'shaft')
  })
  await page.waitForFunction(() => !window.useApp.getState().busy, null, { timeout: 60000 })
  await g(() => window.useApp.getState().newComponent())
  await page.waitForTimeout(400)
  const comps = await g(() => window.useApp.getState().components.map((c) => ({ id: c.id, name: c.name, pos: c.pos })))
  ok('P1A two components', comps.length >= 2, comps)
  if (comps.length >= 2) {
    const bushId = comps[0].id, shaftId = comps[1].id
    await g(({ bushId, shaftId }) => {
      const s = window.useApp.getState()
      s.toggleComponentGround(bushId)
      const sc = s.components.find((c) => c.id === shaftId)
      s.addJoint({
        type: 'revolute', parent: bushId, child: shaftId,
        anchor: [sc.pos[0], sc.pos[1], sc.pos[2]],
        axis: [0, 1, 0], angle: 0, slide: 0,
      })
    }, { bushId, shaftId })
    const j0 = await g(() => window.useApp.getState().joints[0])
    ok('P1A restChildPose captured', !!j0?.restChildPose && j0.type === 'revolute', { type: j0?.type, rest: j0?.restChildPose })
    const before = await g(() => {
      const s = window.useApp.getState()
      const c = s.components.find((x) => x.id === s.joints[0].child)
      return { pos: c.pos.slice(), angle: s.joints[0].angle }
    })
    await g(() => {
      const s = window.useApp.getState()
      s.beginJointDrive(); s.setJointValue(s.joints[0].id, { angle: -102 }); s.endJointDrive()
    })
    const mid = await g(() => {
      const s = window.useApp.getState()
      const c = s.components.find((x) => x.id === s.joints[0].child)
      return { pos: c.pos.slice(), angle: s.joints[0].angle }
    })
    ok('P1A drive -102° does not bake/translate pos', mid.angle === -102 && mid.pos[0] === before.pos[0] && mid.pos[1] === before.pos[1] && mid.pos[2] === before.pos[2], { before, mid })
    // Corrupt pos then 歸零
    await g(() => {
      const s = window.useApp.getState()
      const id = s.joints[0].child
      window.useApp.setState({ components: s.components.map((c) => c.id === id ? { ...c, pos: [c.pos[0], 69, c.pos[2] + 5] } : c) })
    })
    await g(() => window.useApp.getState().homeJoints())
    const home = await g(() => {
      const s = window.useApp.getState()
      const c = s.components.find((x) => x.id === s.joints[0].child)
      const j = s.joints[0]
      return { pos: c.pos.slice(), angle: j.angle, rest: j.restChildPose }
    })
    ok('P1A 歸零 restores angle + restChildPose', home.angle === 0 && home.pos[0] === home.rest.pos[0] && home.pos[1] === home.rest.pos[1] && home.pos[2] === home.rest.pos[2], home)
  }

  // P2 section clamp: open with offset 0 on a body whose range is away from 0
  await g(() => {
    window.useApp.setState({ ...window.useApp.getInitialState() }, true)
  })
  await g(async () => {
    await window.useApp.getState().applyFeatures([{ id: 'b', type: 'prim', shape: 'box', a: 20, b: 20, c: 20, op: 'new', at: [0, 0, 50] }], 'box')
  })
  await page.waitForFunction(() => !window.useApp.getState().busy)
  await g(() => window.useApp.getState().setSection({ on: true, axis: 'Z', offset: 0 }))
  await page.waitForTimeout(500)
  const sec = await g(() => window.useApp.getState().section)
  // Viewport effect should clamp; allow a brief settle
  await page.waitForTimeout(300)
  const sec2 = await g(() => window.useApp.getState().section)
  ok('P2 section opens (offset may be clamped by Viewport)', sec2.on === true, sec2)

  await finish()
} catch (e) {
  await finish(e)
}
