#!/usr/bin/env node
// UX2 #11 real-browser proof: flanged cup (revolve → shell 2 → chamfer 1 on the flange rim) → autosave → HARD RELOAD
// → autosave restore must rebuild with NO 「所選面搵唔返，已改用最近嘅面」/ S1 warning, same features & volume.
// Persistence ON (?ui-test=0 keeps window.useApp but disables the in-memory isolation).
// Usage: nice -n 19 node scripts/e2e-ux2-reload-binding.mjs [--shots DIR]
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  const st = (fn, a) => page.evaluate(fn, a)
  await page.waitForFunction(() => !!window.useApp, null, { timeout: 30000 })
  await st(async () => {
    const g = () => window.useApp.getState()
    g().setLang?.('zh-HK')
    const prof = { kind: 'poly', pts: [[0, 0], [30, 0], [30, 35], [40, 35], [40, 40], [0, 40]] }
    for (let t = 0; t < 200 && !(await g().applyFeatures([{ id: 'r', type: 'revolve', profile: prof, angle: 360, axis: 'Y', op: 'new' }, { id: 's', type: 'shell', thickness: 2, nears: [[10, 40, 0]], tangentChain: false, direction: 'inside' }], 'cup')); t++) await new Promise((r) => setTimeout(r, 250))
    g().requestFit?.()
  })
  await page.waitForTimeout(1200)
  await st(() => { const { camera, controls } = window.__three; controls.target.set(0, 0, -30); camera.position.set(110, 130, -230); camera.lookAt(0, 0, -30); controls.update() })
  await page.waitForTimeout(400)
  await st(() => window.useApp.getState().runCommand('chamfer')); await page.waitForTimeout(400)
  const a = Math.PI / 3, r = 39.7
  const [x, y] = await page.cadToScreen([r * Math.cos(a), 40, -r * Math.sin(a)])
  await page.mouse.click(x, y); await page.waitForTimeout(1500)
  await st(() => window.useApp.getState().setEdgeRoundSize(1))
  await page.waitForFunction(() => { const s = window.useApp.getState(); return !s.roundPreviewBusy && (s.roundPreviewMesh || s.roundPreviewFail) }, null, { timeout: 30000 })
  await st(() => window.useApp.getState().commitEdgeRound()); await page.waitForTimeout(1500)
  const before = await st(() => { const s = window.useApp.getState(); return { n: s.features.length, types: s.features.map((f) => f.type), shell: JSON.stringify(s.features[1]), tris: s.bodyMesh?.triangles?.length ?? 0, warn: s.lastBuildWarnings } })
  ok('cup + shell + chamfer built', before.n === 3 && before.types[2] === 'chamfer', { n: before.n, tris: before.tris })
  ok('#11 appending the chamfer does not re-bind the shell face to a wrong one (no 「相差 30.2 mm」)', before.warn.length === 0, before.warn)
  await page.waitForTimeout(6500)   // localStorage 800 ms + IDB 5 s autosave
  await page.reload({ waitUntil: 'load' })
  await page.waitForFunction(() => { const s = window.useApp?.getState(); return s && s.features.length === 3 && !s.busy && s.bodyMesh?.triangles?.length }, null, { timeout: 60000 })
  await page.waitForTimeout(1500)
  const after = await st(() => { const s = window.useApp.getState(); return { n: s.features.length, shell: JSON.stringify(s.features[1]), tris: s.bodyMesh?.triangles?.length ?? 0, warn: s.lastBuildWarnings, status: s.status, page: document.body.innerText.match(/[^\n]*(搵唔返|最近嘅面|S1)[^\n]*/g) ?? [] } })
  ok('#11 after hard reload the autosave restores with no face-drift warning', after.warn.length === 0 && after.page.length === 0, { warn: after.warn, page: after.page, status: after.status })
  ok('#11 shell binding + body identical across the reload', after.shell === before.shell && after.tris === before.tris, { tris: [before.tris, after.tris] })
  await page.shot('after-reload')
}, { url: '/?ui-test=0' })
