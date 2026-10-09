#!/usr/bin/env node
// UX4 / CORE16 LOFT proof, mouse-driven: draw 3 section sketches with the rectangle / circle tools (mouse clicks),
// ✓ 完成草圖, ribbon 放樣, type 薄壁 2 → preview hollow (no 「退回實心」) → 確定 finishes (no endless spinner);
// double-click the loft chip → edit panel has no 「NaN」, sections can be removed / re-added; a new loft dialog
// starts at 薄壁 0; the browser tree gains no grey sketch copies.
// Usage (repo root, after `nice -n 19 npx vite build`):
//   nice -n 19 node scripts/e2e-ux4-loft.mjs [--shots /workspace/webcad-qa/sketch-20261008/grok/evidence]
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  await page.evaluate(() => window.useApp.getState().setLang?.('zh-HK'))
  const st = () => page.evaluate(() => { const s = window.useApp.getState(); return { mode: s.mode, status: s.status, n: s.loftSections.length, feats: s.features.map((f) => f.type), srcs: Object.keys(s.sketchSources).length, wall: s.loftWall, edit: s.loftEditId, pv: s.loftPreview ? { err: s.loftPreview.error, vol: s.loftPreview.volume, warn: s.loftPreview.warnings } : null, busy: s.loftPreviewBusy } })
  const tool = async (c) => { await page.locator(`button[data-cmd="${c}"]:visible`).first().click(); await page.waitForTimeout(250) }
  const sketch = async (z, draw) => {
    await page.evaluate((z) => window.useApp.getState().sketchOnDatumPlane('XY', z), z)
    await page.waitForTimeout(1500)
    const at = (s, t) => page.cadToScreen([s, -t, z])
    const click = async (s, t) => { const [x, y] = await at(s, t); await page.mouse.move(x, y, { steps: 8 }); await page.waitForTimeout(150); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(250) }
    await draw(click)
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    await page.getByRole('button', { name: /完成草圖/ }).first().click()
    await page.waitForFunction(() => window.useApp.getState().mode === 'model', null, { timeout: 15000 })
  }
  await sketch(0, async (click) => { await tool('sk_rect'); await click(-40, -20); await click(40, 20) })
  await sketch(30, async (click) => { await tool('sk_circle'); await click(0, 0); await click(15, 0) })
  await sketch(60, async (click) => { await tool('sk_rect'); await click(-10, -10); await click(10, 10) })
  const s0 = await page.evaluate(() => window.useApp.getState().features.filter((f) => f.type === 'sketch').map((f) => window.useApp.getState().sketchSources[f.sketchId]?.shapes?.map((s) => s.type)))
  ok('3 sketches drawn with the mouse (rect / circle / rect)', s0.length === 3 && s0.every((x) => x?.length === 1), { s0 })
  const srcs0 = (await st()).srcs

  await page.locator('button.tool-btn[data-cmd="loft"]:visible').first().click()
  await page.getByTestId('loft-section-list').waitFor({ timeout: 10000 })
  const rows = page.getByTestId('loft-section-row')
  const dlg = page.locator('.cmd-palette').filter({ hasText: '放樣' }).first()
  if (await rows.count() < 3) { const add = page.getByTestId('loft-add-sketch'); while (await rows.count() < 3 && (await add.locator('option').count()) > 1) await add.selectOption({ index: 1 }) }
  ok('dialog lists 3 sections', await rows.count() === 3, { rows: await rows.allTextContents() })
  ok('P3: new loft dialog starts at 薄壁 0', (await st()).wall === 0)
  await page.waitForFunction(() => { const s = window.useApp.getState(); return !s.loftPreviewBusy && !!s.loftPreview }, null, { timeout: 60000 })
  const solid = (await st()).pv?.vol
  const wi = dlg.locator('label', { hasText: '薄壁' }).locator('input')
  await wi.fill('2'); await wi.press('Tab')
  const t0 = Date.now()
  await page.waitForFunction(() => { const s = window.useApp.getState(); return s.loftWall === 2 && !s.loftPreviewBusy && !!s.loftPreview }, null, { timeout: 90000 })
  const s1 = await st()
  ok('3 sections + 薄壁 2 preview is hollow (no 「退回實心」)', !!s1.pv && !s1.pv.err && s1.pv.vol < solid * 0.5 && !s1.pv.warn.some((w) => /退回|失敗/.test(w)), { ...s1.pv, solid, ms: Date.now() - t0 })
  await page.evaluate(() => window.useApp.getState().setView('iso')); await page.waitForTimeout(800)
  await page.evaluate(() => window.useApp.getState().requestFitBBox([-45, -25, -5], [45, 25, 65])); await page.waitForTimeout(1000)
  await page.shot('ux4-loft-1-thin-preview')
  const t1 = Date.now()
  await dlg.getByRole('button', { name: /^確定$/ }).click()
  await page.waitForFunction(() => { const s = window.useApp.getState(); return !s.loftDlgOpen && !s.busy && s.features.some((f) => f.type === 'loft') && (s.bodyMesh?.triangles?.length ?? 0) > 0 }, null, { timeout: 90000 })
  const commitMs = Date.now() - t1
  const vol = await page.evaluate(() => { const m = window.useApp.getState().bodyMesh; const v = m.vertices, t = m.triangles; let s = 0; for (let i = 0; i < t.length; i += 3) { const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3; s += (v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c]) + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c])) / 6 } return Math.abs(s) })
  ok('確定 finishes (no endless spinner) and the body is the hollow volume', commitMs < 60000 && Math.abs(vol - s1.pv.vol) / s1.pv.vol < 0.03, { commitMs, vol, pv: s1.pv.vol, status: (await st()).status })
  const s2 = await st()
  ok('#11 no grey sketch copies in the tree (sketch sources unchanged)', s2.srcs === srcs0, { before: srcs0, after: s2.srcs })
  await page.shot('ux4-loft-2-thin-result')

  // 編輯現有放樣：雙擊時間軸 chip
  const fi = s2.feats.indexOf('loft')
  await page.locator(`button.tl-chip[data-fi="${fi}"]`).dblclick()
  await page.waitForFunction(() => !!window.useApp.getState().loftEditId, null, { timeout: 10000 })
  await page.waitForTimeout(1500)
  const bodyText = await page.locator('body').innerText()
  ok('edit panel / timeline bar show no 「NaN」', !/NaN/.test(bodyText), { snippet: (bodyText.match(/.{0,20}NaN.{0,20}/) || [''])[0] })
  ok('edit dialog keeps 3 sections with ✕ buttons and ＋加草圖截面', await rows.count() === 3 && await rows.nth(1).getByRole('button', { name: '✕' }).count() === 1 && await page.getByTestId('loft-add-sketch').count() === 1)
  await rows.nth(1).getByRole('button', { name: '✕' }).click()
  await page.waitForFunction(() => { const s = window.useApp.getState(); return s.loftSections.length === 2 && !s.loftPreviewBusy && !!s.loftPreview }, null, { timeout: 90000 })
  await page.shot('ux4-loft-3-edit-removed')
  const add = page.getByTestId('loft-add-sketch')
  await add.selectOption({ index: 1 })
  ok('edit: ＋加草圖截面 adds the section back', await rows.count() === 3, { status: (await st()).status })
  await rows.nth(1).getByRole('button', { name: '✕' }).click()   // final: 2 sections (bottom rect + top rect)
  await page.waitForFunction(() => { const s = window.useApp.getState(); return !s.loftPreviewBusy && !!s.loftPreview }, null, { timeout: 90000 })
  await dlg.getByRole('button', { name: /^確定$/ }).click()
  await page.waitForFunction(() => { const s = window.useApp.getState(); return !s.loftDlgOpen && !s.busy }, null, { timeout: 90000 })
  const s3 = await page.evaluate(() => { const s = window.useApp.getState(); const l = s.features.find((f) => f.type === 'loft'); return { n: l.sections.length, ids: l.sketchIds?.length, lofts: s.features.filter((f) => f.type === 'loft').length, pos: s.timelinePos, len: s.features.length, status: s.status } })
  ok('edit 確定 rewrites the same loft with the new section list', s3.n === 2 && s3.ids === 2 && s3.lofts === 1 && s3.pos === s3.len, s3)
  await page.shot('ux4-loft-4-edited')
})
