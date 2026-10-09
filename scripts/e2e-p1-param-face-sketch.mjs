#!/usr/bin/env node
// v2.20 P1 real-mouse proof (tester repro): L bracket whose leg thickness is the user parameter t = 8 → extrude 30
// → 建立草圖 + mouse click on the TOP face of the horizontal leg → two Ø6 circles drawn with the mouse → cut through
// → fillet R5 on the inner corner edge picked with the mouse → mirror (join) → Parameters panel: type t = 10 + Enter.
// Expect: rebuild succeeds (no 「草圖來源面失效或有歧義」), t = 10, hole sketch plane moved to Z 10, holes still through.
// Then type t = 0 (cannot build): the field keeps "0", an explicit alert explains it was not applied; Esc restores.
// Usage (repo root, after a build):  nice -n 19 node scripts/e2e-p1-param-face-sketch.mjs [--shots DIR]
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  const st = (fn, a) => page.evaluate(fn, a)
  await st(() => window.useApp.getState().setLang?.('zh-HK'))
  // L profile with constraints; both leg thicknesses are the dimension bound to parameter t (what the tester typed).
  await st(async () => {
    const u = window.useApp, g = () => u.getState()
    const t = 8, pts = [[0, 0], [50, 0], [50, t], [t, t], [t, 40], [0, 40]], P = (i) => ({ kind: 'pt', shape: 0, idx: i }), E = (i) => ({ kind: 'edge', shape: 0, idx: i })
    const cons = [{ id: 'fx', kind: 'con', type: 'fix', a: P(0) }, ...[0, 2, 4].map((i) => ({ id: 'h' + i, kind: 'con', type: 'h', a: E(i) })), ...[1, 3, 5].map((i) => ({ id: 'v' + i, kind: 'con', type: 'v', a: E(i) })),
      { id: 'L', kind: 'dim', type: 'hdist', a: P(0), b: P(1), value: 50 }, { id: 'H', kind: 'dim', type: 'vdist', a: P(0), b: P(5), value: 40 },
      { id: 't1', kind: 'dim', type: 'vdist', a: P(1), b: P(2), value: t, param: 't', paramId: 'pt' }, { id: 't2', kind: 'dim', type: 'hdist', a: P(5), b: P(4), value: t, param: 't', paramId: 'pt' }]
    u.setState({ params: [{ id: 'pt', name: 't', value: t, unit: 'mm' }], appConfirm: async () => true })
    g().startSketch(); g().chooseSketchPlane('XZ')
    u.setState({ sketchShape: null, sketchProfiles: [{ type: 'poly', pts }], skCons: cons, extrudeHeight: 30, sketchOp: 'new' })
    await g().extrudeSketch()
  })
  const S = () => st(() => { const s = window.useApp.getState(); const V = s.bodyMesh?.vertices ?? [], T = s.bodyMesh?.triangles ?? []; let v = 0; for (let i = 0; i < T.length; i += 3) { const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3; v += (V[a] * (V[b + 1] * V[c + 2] - V[b + 2] * V[c + 1]) - V[a + 1] * (V[b] * V[c + 2] - V[b + 2] * V[c]) + V[a + 2] * (V[b] * V[c + 1] - V[b + 1] * V[c])) / 6 } return { mode: s.mode, busy: s.busy, status: s.status, types: s.features.map((f) => f.type), failed: s.failedFeatureIds, errors: s.featureErrors, t: s.params.find((p) => p.name === 't')?.value, vol: Math.abs(v), holeZ: Object.values(s.sketchSources).find((x) => x.faceBinding)?.baseZ, prof: [...s.sketchProfiles, ...(s.sketchShape ? [s.sketchShape] : [])], pf: s.paramFailure } })
  let s = await S()
  ok('L bracket extruded (t = 8)', s.mode === 'model' && s.types.join() === 'extrude' && Math.abs(s.vol - 19680) < 1, s)
  const view = async () => { await st(() => { const { camera, controls } = window.__three; controls.target.set(25, 12, 15); camera.position.set(110, 120, 140); camera.lookAt(25, 12, 15); controls.update() }); await page.waitForTimeout(500) }
  await view()
  // 建立草圖 → click the top face of the horizontal leg (CAD z = 8)
  await page.locator('button[data-cmd="sketch"]:visible').first().click(); await page.waitForTimeout(400)
  let [x, y] = await page.cadToScreen([30, -15, 8])
  await page.mouse.move(x, y, { steps: 6 }); await page.mouse.click(x, y); await page.waitForTimeout(1500)
  s = await S()
  ok('mouse click on the leg top face starts a face sketch at Z 8', s.mode === 'sketch' && /偏移 8/.test(s.status), { status: s.status })
  await page.shot('p1-1-face-sketch')
  // two Ø6 circles with the mouse (sketch XY @ 8: sketch (u, v) = CAD (u, −v, 8))
  await page.locator('button[data-cmd="sk_circle"]:visible').first().click(); await page.waitForTimeout(300)
  for (const cx of [20, 40]) {
    for (const p of [[cx, -15, 8], [cx + 3, -15, 8]]) { [x, y] = await page.cadToScreen(p); await page.mouse.move(x, y, { steps: 6 }); await page.waitForTimeout(150); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(400) }
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  s = await S()
  const circles = s.prof.filter((p) => p.type === 'circle')
  ok('two circles drawn with the mouse (r ≈ 3 at x 20 / 40)', circles.length === 2 && circles.every((c) => Math.abs(c.r - 3) < 0.3), { circles })
  // exact Ø6 (the tester typed the diameter) then 拉伸 → 切割 → 貫穿
  await st(async () => { const u = window.useApp, g = () => u.getState(); u.setState({ sketchProfiles: [...g().sketchProfiles, ...(g().sketchShape ? [g().sketchShape] : [])].map((p) => p.type === 'circle' ? { ...p, r: 3 } : p), sketchShape: null, sketchOp: 'cut', extrudeExtent: 'through', faceCutThrough: true, extrudeHeight: 8 }); await g().extrudeSketch() })
  await page.waitForTimeout(800)
  s = await S()
  ok('through holes cut', s.mode === 'model' && s.types.length === 2 && s.vol < 19680 - 400, { types: s.types, vol: s.vol, status: s.status })
  await view()
  // fillet: pick the inner corner edge (x = 8, z = 8) with the mouse
  await st(() => window.useApp.getState().toggleEdgeRoundPick('fillet')); await page.waitForTimeout(300)
  ;[x, y] = await page.cadToScreen([8, -22, 8])
  await page.mouse.move(x, y, { steps: 6 }); await page.mouse.click(x, y); await page.waitForTimeout(1200)
  await st(() => window.useApp.getState().setEdgeRoundSize(5))
  await page.waitForFunction(() => { const s = window.useApp.getState(); return !s.roundPreviewBusy && (s.roundPreviewMesh || s.roundPreviewFail) }, null, { timeout: 30000 })
  await st(() => window.useApp.getState().commitEdgeRound()); await page.waitForTimeout(1200)
  await st(() => window.useApp.getState().addMirror()); await page.waitForTimeout(1200)
  s = await S()
  const v8 = s.vol
  ok('fillet R5 + mirror (join) built', s.types.join() === 'extrude,extrude,fillet,mirror' && s.failed.length === 0, { types: s.types, vol: s.vol })
  await page.shot('p1-2-bracket-t8')
  // Parameters panel: type 10 + Enter with the keyboard
  await page.locator('button[data-cmd="params"]:visible').first().click().catch(async () => st(() => window.useApp.getState().toggleParamsPanel()))
  await page.waitForTimeout(400)
  if (!(await page.locator('.params-panel').count())) await st(() => window.useApp.getState().toggleParamsPanel())
  const field = page.locator('.params-panel input.pp-val[data-param-field="value"]').first()
  await field.click(); await page.keyboard.press('Control+A'); await page.keyboard.type('10', { delay: 120 }); await page.keyboard.press('Enter')
  await page.waitForFunction(() => !window.useApp.getState().busy, null, { timeout: 60000 }); await page.waitForTimeout(800)
  s = await S()
  const exact10 = 2 * ((50 * 10 + 10 * 30) * 30 - 2 * Math.PI * 9 * 10 + (1 - Math.PI / 4) * 25 * 30)
  ok('P1 t = 10 applied, no 「草圖來源面失效或有歧義」, nothing failed', s.t === 10 && s.failed.length === 0 && !/失效|歧義|歧义|未能套用/.test(s.status), { t: s.t, failed: s.failed, errors: s.errors, status: s.status })
  ok('P1 hole sketch plane moved with the face (Z 8 → 10)', s.holeZ === 10, { holeZ: s.holeZ })
  ok('P1 geometry = thicker bracket with both holes still through (volume)', Math.abs(s.vol - exact10) < 2e-3 * exact10, { vol: s.vol, exact10 })
  ok('P1 panel shows 10', (await field.inputValue()) === '10', { shown: await field.inputValue() })
  await page.shot('p1-3-t10')
  // A value that cannot rebuild: field keeps the typed value + explicit alert; model stays at 10
  await field.click(); await page.keyboard.press('Control+A'); await page.keyboard.type('0', { delay: 120 }); await page.keyboard.press('Enter')
  await page.waitForFunction(() => !window.useApp.getState().busy, null, { timeout: 60000 }); await page.waitForTimeout(800)
  s = await S()
  const alert = await page.locator('.params-panel [data-param-failure="t"]').innerText().catch(() => '')
  ok('failed edit: model/parameter stay t = 10', s.t === 10 && Math.abs(s.vol - exact10) < 2e-3 * exact10, { t: s.t, vol: s.vol })
  ok('failed edit: the field still shows the typed 0 (no silent revert)', (await field.inputValue()) === '0', { shown: await field.inputValue() })
  ok('failed edit: explicit alert in the panel', /t = 0 未能套用：.+模型及參數仍為 t = 10/.test(alert), { alert })
  await page.shot('p1-4-failed-edit')
  await field.click(); await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  ok('Esc restores the field to 10 and clears the alert', (await field.inputValue()) === '10' && !(await page.locator('.params-panel [data-param-failure]').count()), { shown: await field.inputValue() })
  void v8
})
