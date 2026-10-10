#!/usr/bin/env node
// FISHING12 e2e：P1 孔時間軸晶片真滑鼠拖到原語之前 → 拒絕（Formal TC、順序／撤銷／體積不變）；
// P2 統一測量真滑鼠：兩獨立軸側面 → 軸距＋精確側面面積；兩平行平面 30 mm → 面距 30.00。
// Usage: flock /tmp/webcad-e2e.lock nice -n 19 node scripts/e2e-fishing12.mjs [--shots DIR]
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  const st = (fn, a) => page.evaluate(fn, a)
  const cam = (target, pos) => st(([t, p]) => { const { camera, controls } = window.__three; controls.target.set(...t); camera.position.set(...p); camera.lookAt(...t); controls.update() }, [target, pos])
  // ── P1 ──
  const built = await st(async () => {
    const g = () => window.useApp.getState()
    g().setLang?.('zh-HK'); g().reset()
    const F = [
      { id: 'prim1', type: 'prim', shape: 'box', a: 20, b: 20, c: 20, op: 'new', cornerOrigin: true },
      { id: 'hole1', type: 'hole', kind: 'simple', center: [10, 10], top: 20, diameter: 5, through: false, depth: 10, extent: 'distance' },
    ]
    for (let t = 0; t < 200 && !(await g().applyFeatures(F, 'box+hole')); t++) await new Promise((r) => setTimeout(r, 250))
    return { ids: g().features.map((f) => f.id), vol: g().bodyMesh?.volumeExact, undo: g().undoStack.length }
  })
  ok('setup box + hole (vol < 8000)', built.ids.join() === 'prim1,hole1' && built.vol < 7999, built)
  await page.waitForTimeout(500)
  const src = page.locator('.tl-chip[data-fi="1"]').first(), dst = page.locator('.tl-chip[data-fi="0"]').first()
  await src.scrollIntoViewIfNeeded().catch(() => {})
  const a = await src.boundingBox(), b = await dst.boundingBox()
  ok('timeline chips visible', !!a && !!b, { a, b })
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down()
  await page.mouse.move(b.x + b.width / 4, b.y + b.height / 2, { steps: 12 }); await page.mouse.up()
  await page.waitForTimeout(2500)
  const after = await st(() => { const g = window.useApp.getState(); return { ids: g.features.map((f) => f.id), vol: g.bodyMesh?.volumeExact, undo: g.undoStack.length, status: g.status } })
  ok('drag hole chip before primitive → refused Formal TC; order/undo/volume unchanged',
    after.status === '不能上移：「孔1」引用的面由「原語1」產生，必須排在它之後' && after.ids.join() === 'prim1,hole1' && after.undo === built.undo && Math.abs(after.vol - built.vol) < 1e-6, after)
  await page.shot('f12-p1-refused')

  // ── P2a：兩支軸（第二支 newbody → 獨立實體）──
  await st(async () => {
    const g = () => window.useApp.getState()
    g().reset()
    const F = [
      { id: 's1', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: 5 }, height: 30, operation: 'new' },
      { id: 's2', type: 'extrude', profile: { kind: 'circle', c: [40, 0], r: 5 }, height: 30, operation: 'newbody' },
    ]
    for (let t = 0; t < 200 && !(await g().applyFeatures(F, 'shafts')); t++) await new Promise((r) => setTimeout(r, 250))
  })
  await page.waitForTimeout(1000)
  await cam([20, 15, 0], [20, 30, 160])
  await st(() => { const g = window.useApp.getState(); if (!g.measureUniMode) g.runCommand('measureuni'); g.setMeasureSelFilter({ face: true }); g.clearMeasureUniPicks() })
  await page.waitForTimeout(500)
  let [x, y] = await page.cadToScreen([0, -5, 15]); await page.mouse.click(x, y); await page.waitForTimeout(1500)
  const one = await st(() => { const s = window.useApp.getState(); return { label: s.measureUniResult?.label, value: s.measureUniResult?.value, area: s.measureUniResult?.area } })
  ok('shaft side face → Ø10 + exact side area ≈ 9.42 cm²', one.label === '圓柱面直徑Ø' && Math.abs(one.value - 10) < 1e-6 && Math.abs(one.area - Math.PI * 300) < 1e-3, one)
  ;[x, y] = await page.cadToScreen([40, -5, 15]); await page.mouse.click(x, y); await page.waitForTimeout(1500)
  const two = await st(() => { const s = window.useApp.getState(); const panel = [...document.querySelectorAll('.info-card')].map((e) => e.innerText).join(' || '); return { label: s.measureUniResult?.label, value: s.measureUniResult?.value, parts: s.measureUniResult?.parts, status: s.status, panel } })
  ok('two shafts → 軸距（平行軸） 40.00', two.label === '軸距（平行軸）' && Math.abs(two.value - 40) < 1e-6 && /軸距/.test(two.panel), { label: two.label, value: two.value, status: two.status })
  ok('both side areas exact (parked body uses B-rep, not mesh strip)', two.parts?.length === 2 && two.parts.every((p) => Math.abs(p.value - Math.PI * 300) < 1e-3), { parts: two.parts })
  await page.shot('f12-p2-axis')

  // ── P2b：兩平行平面 30 mm（台階：z=30 台面＋z=60 頂面）──
  await st(async () => {
    const g = () => window.useApp.getState()
    g().clearMeasureUniPicks(); g().reset()
    const F = [
      { id: 'b1', type: 'prim', shape: 'box', a: 60, b: 40, c: 30, op: 'new', cornerOrigin: true },
      { id: 'b2', type: 'extrude', profile: { kind: 'rect', a: [0, 0], b: [30, 40] }, height: 30, baseZ: 30, operation: 'join' },
    ]
    for (let t = 0; t < 200 && !(await g().applyFeatures(F, 'step')); t++) await new Promise((r) => setTimeout(r, 250))
  })
  await page.waitForTimeout(1000)
  await cam([30, 30, -20], [110, 150, 120])
  await st(() => { const g = window.useApp.getState(); if (!g.measureUniMode) g.runCommand('measureuni'); g.setMeasureSelFilter({ face: true }); g.clearMeasureUniPicks() })
  await page.waitForTimeout(500)
  const reads = []
  for (const [p, q] of [[[45, 20, 30], [15, 20, 60]], [[55, 5, 30], [5, 35, 60]], [[40, 30, 30], [25, 10, 60]]]) {
    await st(() => window.useApp.getState().clearMeasureUniPicks())
    ;[x, y] = await page.cadToScreen(p); await page.mouse.click(x, y); await page.waitForTimeout(1200)
    ;[x, y] = await page.cadToScreen(q); await page.mouse.click(x, y); await page.waitForTimeout(1200)
    reads.push(await st(() => { const s = window.useApp.getState(); return { label: s.measureUniResult?.label, value: s.measureUniResult?.value, status: s.status } }))
  }
  ok('parallel faces 30 mm → 面距（平行面） 30.00 every time', reads.every((r) => r.label === '面距（平行面）' && r.value === 30 && /面距（平行面） 30/.test(r.status)), reads)
  ok('readouts Formal Traditional', reads.every((r) => !/[这为没对实测选边线点简离积长径补坐组拣揀唔嘅咗喺]/.test(r.status)), reads.map((r) => r.status))
  await page.shot('f12-p2-planes')
})
