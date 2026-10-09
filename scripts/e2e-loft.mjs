#!/usr/bin/env node
// LOFT (放樣) real-browser proof, done like a user: finish two (+1) sketches with the 「✓ 完成草圖」 button,
// CREATE ▸ 放樣 from the ribbon, check the dialog's section list (↑↓ / ✕ / ＋加草圖截面), look at the kernel preview
// (square → circle must be untwisted and match the result), then 確定.
// NOT part of the default test run. Usage (repo root, after `npx vite build`):
//   nice -n 19 node scripts/e2e-loft.mjs [--port 4317] [--shots /workspace/webcad-qa/sketch-20261008/grok/evidence]
// Screenshots: loft-1-three-sections.png, loft-2-square-circle-preview.png, loft-3-result.png
import { runE2E } from './e2e-harness.mjs'

const st = (page) => page.evaluate(() => { const s = window.useApp.getState(); return { mode: s.mode, status: s.status, n: s.loftSections.length, feats: s.features.map((f) => f.type), tris: s.bodyMesh?.triangles?.length ?? 0, pv: s.loftPreview ? { err: s.loftPreview.error, tris: s.loftPreview.mesh?.triangles?.length ?? 0, edges: s.loftPreview.edges.length, vol: s.loftPreview.volume, warn: s.loftPreview.warnings } : null, busy: s.loftPreviewBusy } })
const waitPreview = async (page) => {
  await page.waitForFunction(() => { const s = window.useApp.getState(); return !s.loftPreviewBusy && !!s.loftPreview }, null, { timeout: 60000 })
  await page.waitForTimeout(400)
}
// 側邊（由 z≈0 去 z≈60 嘅邊）嘅極座標角差：0 = 方角對正圓上最近點（冇扭）
const previewTwist = (page) => page.evaluate(() => {
  const pv = window.useApp.getState().loftPreview
  let m = 0, n = 0
  for (const e of pv?.edges ?? []) {
    const a = e[0], b = e[e.length - 1]
    const lo = Math.abs(a[2]) < 1e-3 ? a : Math.abs(b[2]) < 1e-3 ? b : null, hi = Math.abs(a[2] - 60) < 1e-3 ? a : Math.abs(b[2] - 60) < 1e-3 ? b : null
    if (!lo || !hi || lo === hi) continue
    n++
    const d = Math.atan2(hi[1], hi[0]) - Math.atan2(lo[1], lo[0])
    m = Math.max(m, Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) * 180 / Math.PI)
  }
  return { maxDeg: m, sideEdges: n }
})

const frame = async (page, min, max) => {
  await page.evaluate(() => window.useApp.getState().setView('iso'))
  await page.waitForTimeout(900)
  await page.evaluate(([min, max]) => window.useApp.getState().requestFitBBox(min, max), [min, max])
  await page.waitForTimeout(1200)
}

await runE2E(async (page, ok) => {
  await page.evaluate(() => window.useApp.getState().setLang?.('zh-HK'))
  const sketches = [
    ['XY', 0, { type: 'rect', a: [-20, -20], b: [20, 20] }],
    ['XY', 60, { type: 'circle', c: [0, 0], r: 15 }],
    ['YZ', 45, { type: 'circle', c: [0, 30], r: 10 }],   // 第三個：直立偏移平面上嘅圓
  ]
  for (const [k, [plane, z, shape]] of sketches.entries()) {
    await page.evaluate(([plane, z, shape]) => { window.useApp.getState().sketchOnDatumPlane(plane, z); window.useApp.setState({ sketchShape: shape, sketchProfiles: [], skCons: [] }) }, [plane, z, shape])
    await page.getByRole('button', { name: /完成草圖/ }).first().click()
    await page.waitForFunction((k) => { const s = window.useApp.getState(); return s.mode === 'model' && s.features.filter((f) => f.type === 'sketch').length === k + 1 }, k, { timeout: 15000 })
  }
  const s0 = await st(page)
  ok('three standalone sketches finished via ✓ 完成草圖', s0.feats.filter((t) => t === 'sketch').length === 3, s0)

  // CREATE ▸ 放樣
  await page.locator('button.tool-btn[data-cmd="loft"]:visible').first().click()
  await page.getByTestId('loft-section-list').waitFor({ timeout: 10000 })
  const rows = page.getByTestId('loft-section-row')
  ok('放樣 dialog lists all 3 sketch sections (incl. the vertical-plane circle)', await rows.count() === 3, { rows: await rows.allTextContents() })
  const dlgText = await page.locator('.cmd-palette').filter({ hasText: '放樣' }).first().textContent()
  ok('導軌 hint is clean Traditional (no 「auxiliary spine」)', !/auxiliary|spine/i.test(dlgText) && /導軌/.test(dlgText) && /可選/.test(dlgText), { dlgText: dlgText.slice(0, 300) })
  await waitPreview(page)
  const s1 = await st(page)
  ok('3-section mixed-plane kernel preview builds', !!s1.pv && !s1.pv.err && s1.pv.tris > 0, s1)
  await frame(page, [-40, -5, -40], [60, 80, 40])
  await page.shot('loft-1-three-sections')

  // ✕ 移除第 3 個（直立圓）→ 方 → 圓
  await rows.nth(2).getByRole('button', { name: '✕' }).click()
  ok('✕ removes a section from the list', await rows.count() === 2)
  await waitPreview(page)
  const s2 = await st(page)
  const tw = await previewTwist(page)
  const A1 = 1600, A2 = Math.PI * 225, expected = 60 / 6 * (A1 + A2 + 2 * (A1 + A2))
  ok('square → circle preview is untwisted (corners map to nearest circle points)', tw.sideEdges >= 4 && tw.maxDeg < 3, tw)
  ok('preview volume within frustum-ish range', s2.pv && Math.abs(s2.pv.vol - expected) / expected < 0.05, { vol: s2.pv?.vol, expected })
  const status = await page.getByTestId('loft-preview-status').textContent()
  ok('preview status says it matches the result', /同確定後結果一樣/.test(status), { status })
  await frame(page, [-30, -5, -30], [30, 70, 30])
  await page.shot('loft-2-square-circle-preview')

  // ＋加草圖截面 下拉再加返 → ↑ 排去第 2 → 再 ✕
  const add = page.getByTestId('loft-add-sketch')
  const opts = await add.locator('option').allTextContents()
  await add.selectOption({ index: 1 })
  ok('＋加草圖截面 dropdown re-adds the unused sketch', await rows.count() === 3, { opts })
  await rows.nth(2).getByRole('button', { name: '↑' }).click()
  const order = await page.evaluate(() => window.useApp.getState().loftSections.map((s) => s.plane))
  ok('↑ reorders sections (list order = loft order)', JSON.stringify(order) === JSON.stringify(['XY', 'YZ', 'XY']), { order })
  await rows.nth(1).getByRole('button', { name: '✕' }).click()
  await waitPreview(page)
  const pvVol = (await st(page)).pv?.vol

  // 確定
  await page.locator('.cmd-palette').filter({ hasText: '放樣' }).first().getByRole('button', { name: /^確定$/ }).click()
  await page.waitForFunction(() => { const s = window.useApp.getState(); return !s.loftDlgOpen && s.features.some((f) => f.type === 'loft') && (s.bodyMesh?.triangles?.length ?? 0) > 0 }, null, { timeout: 60000 })
  const s3 = await st(page)
  const vol = await page.evaluate(async () => { const m = window.useApp.getState().bodyMesh; if (!m) return 0; const v = m.vertices, t = m.triangles; let s = 0; for (let i = 0; i < t.length; i += 3) { const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3; s += (v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c]) + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c])) / 6 } return Math.abs(s) })
  ok('確定 builds the loft body; result volume == preview volume (mesh ±2%)', s3.feats.includes('loft') && Math.abs(vol - pvVol) / pvVol < 0.02, { vol, pvVol, status: s3.status })
  await frame(page, [-30, -5, -30], [30, 70, 30])
  await page.shot('loft-3-result')
})
