#!/usr/bin/env node
// Dual-distance (asymmetric) chamfer: real mouse pick + UI mode + preview matches commit + timeline edit.
// Usage: flock /tmp/webcad-e2e.lock nice -n 19 node scripts/e2e-chamfer-two-distance.mjs [--shots DIR]
import { launch, clickAt } from './e2e-lib.mjs'

const { page, ok, finish, shot } = await launch({ port: 4331 })
try {
  const g = (fn) => page.evaluate(fn)
  await g(() => { window.useApp.getState().reset(); window.useApp.setState({ introOpen: false, tour: null }) })
  await page.waitForTimeout(200)

  // Box via store (kernel same as UI), then open chamfer via command + real mouse on top front edge
  const built = await g(async () => {
    const st = window.useApp.getState
    const box = { id: 'prim1', type: 'prim', shape: 'box', a: 60, b: 40, c: 30, op: 'new', cornerOrigin: true }
    await st().applyFeatures([box], 'box')
    st().requestFit?.()
    return { n: st().features.length, vol: (() => {
      const m = st().bodyMesh; if (!m) return NaN
      const t = m.triangles, p = m.vertices; let v = 0
      for (let i = 0; i < t.length; i += 3) {
        const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
        v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])
      }
      return Math.abs(v) / 6
    })() }
  })
  ok('setup box 60×40×30', built.n === 1 && Math.abs(built.vol - 72000) < 2, built)

  // Look at front-top edge from above-front
  await page.evaluate(() => {
    const { camera, controls } = window.__three
    controls.target.set(30, 20, -15)
    camera.position.set(30, 90, 80)
    camera.lookAt(30, 20, -15)
    controls.update()
  })
  await page.waitForTimeout(400)

  await page.evaluate(() => window.useApp.getState().runCommand('chamfer'))
  await page.waitForTimeout(400)
  ok('chamfer armed', (await g(() => window.useApp.getState().edgeRoundPick)) === 'chamfer')

  // Enable 雙距離 via select (not disabled)
  const typeSel = page.locator('select[aria-label="倒角類型"]')
  const opts = await typeSel.locator('option').allTextContents()
  ok('雙距離 option enabled (no 暫未支援)', opts.includes('雙距離') && !opts.some((t) => /暫未支援/.test(t)), { opts })
  await typeSel.selectOption('two')
  await page.waitForTimeout(300)
  const mode = await g(() => ({ m: window.useApp.getState().chamferMode, status: window.useApp.getState().status, picks: window.useApp.getState().edgeRoundPicks.length }))
  ok('setChamferMode(two) sticks + clears picks', mode.m === 'two' && mode.picks === 0 && /雙距離/.test(mode.status), mode)

  // Real mouse: click top-front edge mid (CAD 30,0,30) — three world [30,30,0]
  const [sx, sy] = await page.evaluate(() => {
    const { camera } = window.__three
    const c = document.querySelector('canvas').getBoundingClientRect()
    // three = [x, z, -y] for CAD (x,y,z) → CAD (30,0,30) → three (30, 30, 0)
    const v = camera.position.clone().set(30, 30, 0).project(camera)
    return [c.left + (v.x + 1) / 2 * c.width, c.top + (1 - v.y) / 2 * c.height]
  })
  await clickAt(page, [sx, sy])
  await page.waitForTimeout(1200)
  const pick = await g(() => ({ n: window.useApp.getState().edgeRoundPicks.length, status: window.useApp.getState().status }))
  ok('real mouse picked 1 edge', pick.n === 1, pick)
  await shot('picked')

  // Type d1=3, d2=8
  const d1 = page.locator('input[aria-label^="倒角距離"], input[title*="倒角距離"]').first()
  await d1.click(); await d1.press('Control+a'); await d1.pressSequentially('3', { delay: 80 })
  await page.waitForTimeout(200)
  const d2 = page.locator('input[title="倒角第二距離"]')
  await d2.click(); await d2.press('Control+a'); await d2.pressSequentially('8', { delay: 80 })
  await page.waitForFunction(() => {
    const s = window.useApp.getState()
    return !s.roundPreviewBusy && (s.roundPreviewMesh || s.roundPreviewFail)
  }, null, { timeout: 20000 }).catch(() => {})
  const pv = await g(() => {
    const s = window.useApp.getState()
    const m = s.roundPreviewMesh
    let v = NaN
    if (m) {
      const t = m.triangles, p = m.vertices; let vv = 0
      for (let i = 0; i < t.length; i += 3) {
        const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
        vv += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])
      }
      v = Math.abs(vv) / 6
    }
    return { ok: !!m, fail: s.roundPreviewFail, vol: v, d1: s.edgeRoundSize, d2: s.chamferSize2, status: s.status }
  })
  // Edge length 60; remove ½·3·8·60 = 720 → 71280
  ok('preview OK asymmetric ~71280', pv.ok && !pv.fail && Math.abs(pv.vol - 71280) < 20 && pv.d1 === 3 && pv.d2 === 8, pv)
  await shot('preview')

  await page.evaluate(() => window.useApp.getState().commitEdgeRound())
  await page.waitForTimeout(2000)
  const done = await g(() => {
    const s = window.useApp.getState()
    const f = s.features.find((x) => x.type === 'chamfer')
    const m = s.bodyMesh
    let v = NaN
    if (m) {
      const t = m.triangles, p = m.vertices; let vv = 0
      for (let i = 0; i < t.length; i += 3) {
        const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
        vv += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])
      }
      v = Math.abs(vv) / 6
    }
    return { types: s.features.map((x) => x.type), cmode: f?.cmode, dist: f?.distance, dist2: f?.dist2, vol: v, failed: s.failedFeatureIds, status: s.status }
  })
  ok('commit dual-distance C3×8', done.types.includes('chamfer') && done.cmode === 'two' && done.dist === 3 && done.dist2 === 8 && !done.failed.length && Math.abs(done.vol - 71280) < 20, done)
  ok('preview volume matches commit', Math.abs((pv.vol || 0) - (done.vol || 0)) < 5, { pv: pv.vol, done: done.vol })

  // Timeline edit: open featDlg, change dist2 8→5 → vol ½·3·5·60=450 → 71550
  const chId = await g(() => window.useApp.getState().features.find((f) => f.type === 'chamfer').id)
  await page.evaluate((id) => window.useApp.getState().openFeatDlgForEdit(id), chId)
  await page.waitForTimeout(600)
  const editOpts = await page.locator('label', { hasText: /^類型/ }).locator('option').allTextContents()
  ok('timeline edit 雙距離 enabled', editOpts.some((t) => t === '雙距離' || t.includes('雙距離')) && !editOpts.some((t) => /暫未支援/.test(t)), { editOpts })
  const d2Edit = page.locator('label', { hasText: /距離2/ }).locator('input').first()
  await d2Edit.click(); await d2Edit.press('Control+a'); await d2Edit.pressSequentially('5', { delay: 80 })
  await page.waitForTimeout(300)
  await g(async () => { await window.useApp.getState().commitFeatDlg() })
  await page.waitForTimeout(2000)
  const edited = await g(() => {
    const s = window.useApp.getState()
    const f = s.features.find((x) => x.type === 'chamfer')
    const m = s.bodyMesh
    let v = NaN
    if (m) {
      const t = m.triangles, p = m.vertices; let vv = 0
      for (let i = 0; i < t.length; i += 3) {
        const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
        vv += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])
      }
      v = Math.abs(vv) / 6
    }
    return { dist2: f?.dist2, cmode: f?.cmode, vol: v, status: s.status, dlg: s.featDlg }
  })
  ok('timeline edit dist2 8→5 rebuilds', edited.cmode === 'two' && edited.dist2 === 5 && Math.abs(edited.vol - 71550) < 20 && !edited.dlg, edited)
  await shot('edited')

  // Invalid: reopen and set dist2=0 must refuse Traditional
  await page.evaluate((id) => window.useApp.getState().openFeatDlgForEdit(id), chId)
  await page.waitForTimeout(400)
  await page.locator('label', { hasText: /距離2/ }).locator('input').first().click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('0')
  await page.waitForTimeout(200)
  await g(async () => { await window.useApp.getState().commitFeatDlg() })
  await page.waitForTimeout(800)
  const refused = await g(() => {
    const s = window.useApp.getState()
    const f = s.features.find((x) => x.type === 'chamfer')
    return { dist2: f?.dist2, status: s.status, dlg: !!s.featDlg }
  })
  ok('dist2=0 refused Traditional; model keeps 5', refused.dist2 === 5 && /雙距離|距離 2|必須大於 0/.test(refused.status), refused)

  await finish()
} catch (e) {
  await finish(e)
}
