#!/usr/bin/env node
// CORE16 batch 3 real-browser proof (mouse-driven): THICKEN dialog/preview/flip/symmetric/join + edit bar sign,
// PRESS PULL negative edit / through-cut reason / title, CHAMFER Traditional panel + edit 1.5→0.5 really rebuilds,
// MIRROR prompts / operation / planar-face mirror plane, edit-bar no-reflow, BOM status text.
// Usage: nice -n 19 node scripts/e2e-core16-b3.mjs [--shots /tmp/c16b3]
import { runE2E } from './e2e-harness.mjs'

const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 10, op: 'new', cornerOrigin: true }
const SC = /[们为设计实体点击选择删图线边转换导输显现动开关无时间轴数据页进标维连]|撳|撚|嘅|唔|喺|係咪|先至|嗰|吓/

await runE2E(async (page, ok) => {
  const g = (fn, arg) => page.evaluate(fn, arg)
  const setup = (feats) => g(async (feats) => {
    const s = () => window.useApp.getState()
    s().setLang?.('zh-HK')
    window.useApp.setState({ selectedFeature: null, selectedFeatures: [], featDlg: null })
    for (let t = 0; t < 200 && !(await s().applyFeatures(feats, 'setup')); t++) await new Promise((r) => setTimeout(r, 250))
    s().requestFit?.()
  }, feats)
  const vol = () => g(() => { const m = window.useApp.getState().bodyMesh; const t = m.triangles, p = m.vertices; let v = 0; for (let i = 0; i < t.length; i += 3) { const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3; v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]) } return Math.abs(v) / 6 })
  const click = async (cad) => { const [x, y] = await page.cadToScreen(cad); await page.mouse.move(x - 5, y - 5); await page.mouse.move(x, y, { steps: 3 }); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(250) }
  const cmd = async (id) => {
    const loc = page.locator(`[data-cmd="${id}"]:visible`).first()
    if (await loc.count()) { await loc.click(); return 'ribbon' }
    await g((id) => window.useApp.getState().runCommand(id), id); return 'runCommand'
  }
  const typeIn = async (loc, txt) => { await loc.click(); await loc.press('Control+a'); await loc.pressSequentially(txt, { delay: 60 }); await loc.press('Tab'); await page.waitForTimeout(300) }
  const pvDone = () => page.waitForFunction(() => { const s = window.useApp.getState(); return !s.thickenPreviewBusy }, null, { timeout: 30000 }).then(() => page.waitForTimeout(200)).catch(() => {})
  const pvZ = () => g(() => { const m = window.useApp.getState().thickenPreviewMesh; if (!m) return null; let lo = 1e9, hi = -1e9; for (let i = 2; i < m.vertices.length; i += 3) { lo = Math.min(lo, m.vertices[i]); hi = Math.max(hi, m.vertices[i]) } return [+lo.toFixed(3), +hi.toFixed(3)] })
  const chip = (type) => g((type) => { const fs = window.useApp.getState().features; const i = fs.findIndex((f) => f.type === type); return i }, type)
  const clickChip = async (type) => { const i = await chip(type); await page.locator(`.tl-chip[data-fi="${i}"]`).click(); await page.waitForTimeout(400) }
  const edField = (label) => page.locator('.feat-editor label', { hasText: new RegExp('^' + label) }).locator('input').first()

  // ───────── 1. THICKEN ─────────
  await setup([BOX]); await page.waitForTimeout(1200)
  ok('thicken: opened from ' + await cmd('thicken'), await g(() => window.useApp.getState().thickenMode))
  const dlg = page.locator('.cmd-palette', { hasText: '加厚' })
  ok('thicken: real dialog (no prompt) with faces/thickness/direction/operation', await dlg.isVisible() && await page.locator('[data-testid="thicken-dir"]').isVisible() && await page.locator('[data-testid="thicken-op"]').isVisible() && !(await g(() => !!window.useApp.getState().promptDlg)))
  await click([20, 15, 10]); await pvDone()
  const z1 = await pvZ()
  ok('thicken: pick top face → blue preview z 10..12 (pos 2 mm)', z1 && Math.abs(z1[0] - 10) < 0.01 && Math.abs(z1[1] - 12) < 0.01, { z1, status: await page.locator('[data-testid="thicken-preview-status"]').innerText() })
  await page.shot('thicken-preview')
  const thk = page.locator('input[aria-label^="加厚厚度"]')
  await typeIn(thk, '0')
  const zero = { alert: await page.locator('[data-testid="thicken-illegal-alert"]').isVisible().catch(() => false), okDis: await dlg.locator('[data-testid="command-confirm"]').isDisabled(), thick: await g(() => window.useApp.getState().thickenThick) }
  ok('thicken: 0 → message + OK disabled (no silent 0.05)', zero.alert && zero.okDis && zero.thick === 0, zero)
  await typeIn(thk, '-3'); await pvDone()
  const neg = { dir: await g(() => window.useApp.getState().thickenDir), z: await pvZ(), shown: await thk.inputValue() }
  ok('thicken: -3 flips direction → preview z 7..10', neg.dir === 'neg' && neg.z && Math.abs(neg.z[0] - 7) < 0.01 && Math.abs(neg.z[1] - 10) < 0.01, neg)
  await page.locator('[data-testid="thicken-flip"]').click(); await pvDone()
  const fl = { dir: await g(() => window.useApp.getState().thickenDir), z: await pvZ() }
  ok('thicken: flip button → back to pos z 10..13', fl.dir === 'pos' && fl.z && Math.abs(fl.z[1] - 13) < 0.01, fl)
  await page.locator('[data-testid="thicken-dir"]').selectOption('both'); await pvDone()
  const sym = await pvZ()
  ok('thicken: symmetric → z 8.5..11.5', sym && Math.abs(sym[0] - 8.5) < 0.01 && Math.abs(sym[1] - 11.5) < 0.01, { sym })
  await page.locator('[data-testid="thicken-op"]').selectOption('join'); await pvDone()
  await page.shot('thicken-sym')
  const v0 = await vol(), parked0 = await g(() => window.useApp.getState().bodyMesh?.parked?.length ?? 0)
  await dlg.locator('[data-testid="command-confirm"]').click(); await page.waitForTimeout(2500)
  const tf = await g(() => { const s = window.useApp.getState(); const f = s.features.find((x) => x.type === 'thickenface'); return { f, mode: s.thickenMode, status: s.status, parked: s.bodyMesh?.parked?.length ?? 0 } })
  const v1 = await vol()
  ok('thicken: commit symmetric+join → feature side both/op join, merged into body', tf.f?.side === 'both' && tf.f?.op === 'join' && !tf.mode && tf.parked === parked0 && v1 > v0 + 1, { f: tf.f, status: tf.status, v0, v1 })
  // edit bar: signed thickness
  await clickChip('thickenface')
  await page.locator('.feat-editor label', { hasText: /^方向/ }).locator('select').selectOption('pos'); await page.waitForTimeout(1500)
  const fld = edField('厚度')
  const rectBefore = await fld.boundingBox()
  await typeIn(fld, '-2'); await page.waitForTimeout(1800)
  const ed = await g(() => { const s = window.useApp.getState(); return { f: s.features.find((x) => x.type === 'thickenface'), status: s.status } })
  ok('thicken edit bar: -2 accepted as flip (side neg, thick 2)', ed.f.side === 'neg' && ed.f.thick === 2 && (await edField('厚度').inputValue()) === '-2', ed)
  // ───────── 5. edit bar no reflow ─────────
  const rectsOf = () => page.locator('.feat-editor > label, .feat-editor > button, .feat-editor > .fe-title').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width)] }))
  const edRect0 = await page.locator('.feat-editor').boundingBox(), r0 = await rectsOf()
  await typeIn(edField('厚度'), '0'); await page.waitForTimeout(500)
  const alertShown = await page.locator('[data-testid="timeline-illegal-alert"]').isVisible().catch(() => false)
  const edRect1 = await page.locator('.feat-editor').boundingBox(), r1 = await rectsOf()
  ok('edit bar: 0 rejected with message', alertShown && /厚度不可為 0/.test(await page.locator('[data-testid="timeline-illegal-alert"]').innerText()))
  ok('edit bar: message appears without moving any field (no reflow)', JSON.stringify(r0) === JSON.stringify(r1) && Math.abs(edRect0.height - edRect1.height) < 0.5 && Math.abs(edRect0.width - edRect1.width) < 0.5, { r0, r1, h0: edRect0.height, h1: edRect1.height })
  await page.shot('editbar-alert')
  void rectBefore
  await page.keyboard.press('Escape')

  // ───────── 2. PRESS PULL ─────────
  await setup([BOX]); await page.waitForTimeout(1200)
  await cmd('presspull'); await page.waitForTimeout(300)
  await click([20, 15, 10]); await page.waitForTimeout(500)
  const ppTitle = await page.locator('.cmd-palette .cmd-palette-head').first().innerText()
  ok('press pull: dialog title stays 「按拉」 after picking a face', /按拉/.test(ppTitle) && !/偏移面/.test(ppTitle), { ppTitle })
  const ppIn = page.locator('input[aria-label^="按拉距離"]')
  await typeIn(ppIn, '-4')
  await page.locator('.cmd-palette [data-testid="command-confirm"]').click(); await page.waitForTimeout(2500)
  const pp1 = await g(() => { const s = window.useApp.getState(); return { f: s.features.find((x) => x.type === 'pushpull'), status: s.status } })
  const vpp1 = await vol()
  ok('press pull: -4 pushes inward (40×30×6 = 7200)', Math.abs(vpp1 - 7200) < 1, { vpp1, ...pp1 })
  await clickChip('pushpull')
  const ppf = edField('距離')
  ok('press pull edit bar shows signed -4', (await ppf.inputValue()) === '-4', { v: await ppf.inputValue() })
  await typeIn(ppf, '-12'); await page.waitForTimeout(2500)
  const thr = await g(() => { const s = window.useApp.getState(); return { status: s.status, failed: s.failedFeatureIds, dist: s.features.find((x) => x.type === 'pushpull')?.dist } })
  ok('press pull edit -12 (through) → real reason (超過厚度), not generic 重建失敗', /超過實體在此方向的厚度/.test(thr.status) && !/^⚠?\s*重建失敗/.test(thr.status), thr)
  await page.shot('pushpull-through')
  await typeIn(edField('距離'), '-3'); await page.waitForTimeout(2500)
  const vpp2 = await vol()
  ok('press pull edit bar accepts -3 → 40×30×7 = 8400', Math.abs(vpp2 - 8400) < 1, { vpp2, status: await g(() => window.useApp.getState().status) })
  await typeIn(edField('距離'), '0'); await page.waitForTimeout(500)
  ok('press pull edit bar 0 → formal reject message', /按拉距離不可為 0/.test(await g(() => window.useApp.getState().status)))
  await page.keyboard.press('Escape')

  // ───────── 3. CHAMFER ─────────
  await setup([BOX]); await page.waitForTimeout(1200)
  await cmd('chamfer'); await page.waitForTimeout(400)
  const chPanel = page.locator('.cmd-palette', { hasText: '倒角' })
  const chTxt = await chPanel.innerText()
  const chOpts = await chPanel.locator('select').evaluateAll((ss) => ss.flatMap((s) => [...s.options].map((o) => o.text)))
  ok('chamfer panel fully Traditional (距離/類型/等距/邊／面／特徵/相切鏈/角類型), no English', /距離/.test(chTxt) && /類型/.test(chTxt) && /邊／面／特徵/.test(chTxt) && /相切鏈/.test(chTxt) && /角類型/.test(chTxt) && chOpts.includes('等距') && !/Distance|Tangent|Corner|Edges|Equal|Select\b|Fusion/.test(chTxt + chOpts.join()), { chTxt, chOpts })
  await page.shot('chamfer-panel')
  await click([20, 0.4, 9.99]); await page.waitForTimeout(900)
  await click([39.6, 15, 9.99]); await page.waitForTimeout(900)
  const chIn = page.locator('input[aria-label^="倒角距離"]').first()
  await typeIn(chIn, '1.5')
  await page.waitForFunction(() => { const s = window.useApp.getState(); return !s.roundPreviewBusy && (s.roundPreviewMesh || s.roundPreviewFail) }, null, { timeout: 20000 }).catch(() => {})

  await chPanel.locator('[data-testid="command-confirm"]').click(); await page.waitForTimeout(2500)
  const ch = await g(() => { const s = window.useApp.getState(); return { f: s.features.find((x) => x.type === 'chamfer'), status: s.status } })
  const vc1 = await vol()
  ok('chamfer 1.5 committed on 2 picked edges', ch.f && (ch.f.nears?.length ?? 0) === 2 && vc1 < 12000 - 1, { vc1, f: ch.f && { distance: ch.f.distance, distances: ch.f.distances }, status: ch.status })
  await clickChip('chamfer')
  await typeIn(edField('距離'), '0.5'); await page.waitForTimeout(2500)
  const vc2 = await vol(), ce = await g(() => { const s = window.useApp.getState(); return { f: s.features.find((x) => x.type === 'chamfer'), status: s.status } })
  const exp = (d) => 12000 - d * d / 2 * 40 - d * d / 2 * 30   // two edges, small corner overlap ignored
  ok('chamfer edit bar 1.5→0.5 really rebuilds (volume changes accordingly)', vc2 > vc1 + 50 && Math.abs(vc2 - exp(0.5)) < 2 && /已更新(參數並|参数并)重建/.test(ce.status) && /已更新參數並重建/.test(await page.locator('body').innerText()), { vc1, vc2, expect: exp(0.5), status: ce.status, f: { distance: ce.f.distance, distances: ce.f.distances } })
  // via the edit dialog too
  await page.keyboard.press('Escape')
  await g((id) => window.useApp.getState().openFeatDlgForEdit(id), ce.f.id); await page.waitForTimeout(800)
  await typeIn(page.locator('.cmd-palette label', { hasText: /^距離/ }).locator('input').first(), '1')
  await page.locator('.cmd-palette [data-testid="command-confirm"]').click(); await page.waitForTimeout(2500)
  const vc3 = await vol()
  ok('chamfer edit dialog 0.5→1 rebuilds with the new distance', Math.abs(vc3 - exp(1)) < 2, { vc3, expect: exp(1) })
  // formal Traditional failure text
  await cmd('chamfer'); await page.waitForTimeout(300)
  await click([20, 0.4, 9.99]); await page.waitForTimeout(900)
  await typeIn(page.locator('input[aria-label^="倒角距離"]').first(), '40')
  await page.waitForFunction(() => { const s = window.useApp.getState(); return !s.roundPreviewBusy && (s.roundPreviewMesh || s.roundPreviewFail) }, null, { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const failTxt = (await page.locator('.cmd-palette', { hasText: '倒角' }).innerText()) + '\n' + await g(() => window.useApp.getState().status)
  ok('chamfer failure text is formal written Traditional (no 撳/嘅/唔/吓)', /倒角/.test(failTxt) && !/撳|嘅|唔|吓|剔走|喺|係/.test(failTxt), { failTxt })
  await page.shot('chamfer-fail')
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)

  // ───────── 4. MIRROR ─────────
  await setup([BOX]); await page.waitForTimeout(1200)
  await g(() => window.useApp.setState({ selectedFeature: 'gone-123', selectedFeatures: ['gone-123'] }))   // stale selection (tester: nothing selected)
  await cmd('mirror'); await page.waitForTimeout(500)
  const mdlg = page.locator('.cmd-palette', { hasText: '鏡像' })
  const mt = await g(() => window.useApp.getState().featDlg?.params?.target ?? 'body')
  ok('mirror: stale selection no longer pre-selects 「所選特徵」', mt === 'body', { mt })
  await mdlg.locator('select').filter({ has: page.locator('option[value="components"]') }).selectOption('feature'); await page.waitForTimeout(200)
  await g(() => window.useApp.setState({ selectedFeature: null, selectedFeatures: [] }))
  await mdlg.locator('[data-testid="command-confirm"]').click(); await page.waitForTimeout(500)
  const mst = await g(() => window.useApp.getState().status)
  ok('mirror (所選特徵) with nothing selected → proper formal prompt', /請先在時間軸點選要鏡像的特徵/.test(mst) && !/已唔存在|重新選/.test(mst), { mst })
  await mdlg.locator('select').filter({ has: page.locator('option[value="components"]') }).selectOption('body'); await page.waitForTimeout(200)
  const opOpts = await page.locator('[data-testid="mirror-op"] option').allInnerTexts()
  ok('mirror: operation select 合併／新實體', opOpts.join() === '合併,新實體', { opOpts })
  await page.locator('[data-testid="mirror-op"]').selectOption('newbody')
  await page.locator('[data-testid="mirror-plane"]').selectOption('PICK'); await page.waitForTimeout(300)
  const pickArmed = await g(() => window.useApp.getState().mirrorFacePick)
  await click([40, 15, 5]); await page.waitForTimeout(500)
  const mp = await g(() => { const s = window.useApp.getState(); return { p: s.featDlg?.params, status: s.status } })
  ok('mirror: 「🎯 拾取平面…」 → click the right planar face → plane picked', pickArmed && mp.p?.plane === 'PICK' && /^1,0,0$|^1,-?0,-?0$/.test(String(mp.p?.pickN)) && /已拾取鏡像平面/.test(mp.status), mp)
  await page.shot('mirror-picked')
  const pk0 = await g(() => window.useApp.getState().bodyMesh?.parked?.length ?? 0)
  await mdlg.locator('[data-testid="command-confirm"]').click(); await page.waitForTimeout(3000)
  const mr = await g(() => { const s = window.useApp.getState(); const f = s.features.find((x) => x.type === 'mirror'); const pk = s.bodyMesh?.parked ?? []; const last = pk[pk.length - 1]; let lo = 1e9, hi = -1e9; if (last) for (let i = 0; i < last.vertices.length; i += 3) { lo = Math.min(lo, last.vertices[i]); hi = Math.max(hi, last.vertices[i]) } return { f, n: pk.length, x: [lo, hi], status: s.status } })
  ok('mirror across picked face as 新實體 → separate body at x 40..80', mr.f?.op === 'newbody' && mr.n === pk0 + 1 && Math.abs(mr.x[0] - 40) < 0.01 && Math.abs(mr.x[1] - 80) < 0.01, mr)

  // ───────── 6. BOM ─────────
  await cmd('bom'); await page.waitForTimeout(800)
  const bst = await g(() => window.useApp.getState().status)
  ok('BOM status formal: 點擊「匯出 CSV」才會下載', /點擊「匯出 CSV」才會下載/.test(bst) && !/撳|先會/.test(bst), { bst })
  await page.keyboard.press('Escape')

  // ───────── batch 4 ─────────
  // (a) BOM with a plate + a separate body (New Body box)
  await setup([{ ...BOX, c: 5 }, { id: 'B2', type: 'prim', shape: 'box', a: 10, b: 10, c: 20, op: 'newbody', cornerOrigin: true, at: [60, 0, 0] }]); await page.waitForTimeout(1200)
  await cmd('bom'); await page.waitForTimeout(800)
  const bom = await g(() => { const s = window.useApp.getState(); return { n: s.bomDialog?.rows.slice(1).filter((r) => /^\d+$/.test(r[0])).length, tot: s.bomDialog?.rows.at(-1)?.[9], status: s.status, parked: s.bodyMesh?.parked?.length } })
  ok('b4(a) BOM lists both bodies and the total includes the second body', bom.n === 2 && Number(bom.tot) > 40 * 30 * 5 / 1000 * 2.7 + 1, bom)
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  // (b) Shell 30 mm → specific reason; blank → OK disabled
  await setup([BOX]); await page.waitForTimeout(1200)
  await cmd('shell'); await page.waitForTimeout(300)
  await click([20, 15, 10]); await page.waitForTimeout(400)
  const sh = page.locator('input[aria-label^="抽殼壁厚"]').first()
  await sh.click(); await sh.press('Control+a'); await sh.press('Backspace'); await page.waitForTimeout(300)
  ok('b4(b) shell: empty wall → OK disabled', await page.locator('.cmd-palette', { hasText: '抽殼' }).locator('[data-testid="command-confirm"]').isDisabled())
  await sh.pressSequentially('30', { delay: 60 }); await page.waitForTimeout(2500)
  const shPv = await page.locator('[data-testid="shell-preview-status"]').innerText()
  await page.locator('.cmd-palette', { hasText: '抽殼' }).locator('[data-testid="command-confirm"]').click(); await page.waitForTimeout(3000)
  const shSt = await g(() => window.useApp.getState().status)
  ok('b4(b) shell 30 mm → specific reason (not generic 重建失敗)', /壁厚 30 mm 過大/.test(shSt) && !/重建失[敗败]/.test(shSt), { shSt, shPv })
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  // split with a plane outside the body
  await setup([BOX]); await page.waitForTimeout(1000)
  await cmd('splitbody'); await page.waitForTimeout(400)
  await g(() => { const s = window.useApp.getState(); s.setFeatParam('axis', 'Z'); s.setFeatParam('offset', 50) })
  await page.locator('.cmd-palette [data-testid="command-confirm"]').click(); await page.waitForTimeout(800)
  const spSt = await g(() => window.useApp.getState().status)
  ok('b4(b) split with a plane missing the body → specific reason', /沒有穿過實體/.test(spSt) && /範圍/.test(spSt) && !/重建失敗/.test(spSt), { spSt })
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  // (c) Move/Copy
  await setup([BOX]); await page.waitForTimeout(1000)
  await cmd('move'); await page.waitForTimeout(400)
  const mvDlg = page.locator('.cmd-palette').first()
  await mvDlg.locator('label', { hasText: '建立副本' }).locator('input').check()
  await g(() => { const s = window.useApp.getState(); s.setFeatParam('moveType', 'translate'); s.setFeatParam('dx', 60); s.setFeatParam('dy', ''); s.setFeatParam('dz', '') })
  await mvDlg.locator('[data-testid="command-confirm"]').click(); await page.waitForTimeout(2500)
  const mv = await g(() => { const s = window.useApp.getState(); return { name: s.features.find((f) => f.type === 'copybody')?.name, status: s.status } })
  const chipTxt = await page.locator('.timeline').innerText().catch(() => '')
  ok('b4(c) copy marker named 複製實體1, 「已複製並移動」, blank fields reported', mv.name === '複製實體1' && /^已複製並移動/.test(mv.status) && /空白欄位已按 0 計算：dy、dz/.test(mv.status) && !/CopyPasteBodies/.test(chipTxt), mv)
  await page.shot('move-copy')

  // UI text sweep: statuses we produced never contain colloquial / SC
  ok('no colloquial text in the produced statuses', ![mst, mp.status, bst, thr.status, shSt, spSt, mv.status].some((t) => SC.test(t)), { mst, mp: mp.status, bst, thr: thr.status, shSt, spSt, mv: mv.status })
})
