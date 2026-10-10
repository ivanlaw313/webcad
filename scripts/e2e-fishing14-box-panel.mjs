#!/usr/bin/env node
// FISHING14 P2 (real browser keyboard): primitive Box panel — fast typing (0–30 ms per key) incl. Tab sequence and
// corner X = 110; values never garbled, focus never leaves the panel, preview follows the typed values,
// message line does not move 確定; cylinder panel same.
// Usage: nice -n 19 npx vite build && flock /tmp/webcad-e2e.lock nice -n 19 node scripts/e2e-fishing14-box-panel.mjs [--shots DIR]
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  const fast = async (s) => { for (const ch of s) await page.keyboard.type(ch, { delay: Math.floor(Math.random() * 31) }) }
  const fresh = async () => {
    await page.evaluate(() => { const u = window.useApp; u.setState({ ...u.getInitialState(), introOpen: false, tour: null, appConfirm: async () => true }, true); u.getState().setLang?.('zh-HK') })
    await page.waitForTimeout(800)
  }
  const vals = () => page.evaluate(() => [...document.querySelectorAll('.cmd-palette-body input')].map((el) => el.value))
  const focusInfo = () => page.evaluate(() => { const a = document.activeElement; const list = [...document.querySelectorAll('.cmd-palette-body input')]; return { inDialog: !!a?.closest?.('.cmd-palette'), idx: list.indexOf(a), tag: a?.tagName, testid: a?.getAttribute?.('data-testid') } })
  const P = () => page.evaluate(() => ({ ...window.useApp.getState().featDlg?.params }))
  const okY = () => page.evaluate(() => document.querySelector('[data-testid="command-confirm"]')?.getBoundingClientRect().y)
  const openBox = async () => { await page.locator('button[data-cmd="box"]:visible').first().click(); await page.waitForSelector('.cmd-palette-body input'); await page.waitForTimeout(250) }

  // ── 1. Tab sequence, fast typing, while previews keep landing
  await fresh()
  // existing body so the preview is a real boolean/new-body kernel job (heavier, like the QA model)
  await openBox(); await page.keyboard.press('Enter'); await page.waitForTimeout(2500)
  const nFeat0 = await page.evaluate(() => window.useApp.getState().features.length)
  await openBox()
  const f0 = await focusInfo()
  ok('panel opens with 長 focused (selected) for typing', f0.inDialog && f0.idx === 0, f0)
  const y0 = await okY()
  await fast('60'); await page.keyboard.press('Tab'); await fast('70'); await page.keyboard.press('Tab'); await fast('80')
  const v1 = await vals(); const fi1 = await focusInfo()
  ok('fast 60 Tab 70 Tab 80 → 長/寬/高 fields read 60/70/80 immediately, focus on 高', v1[0] === '60' && v1[1] === '70' && v1[2] === '80' && fi1.idx === 2, { v1, fi1 })
  await page.waitForTimeout(700)
  const p1 = await P(); const v1b = await vals()
  ok('after settling the store has l/w/h 60/70/80 and the fields still read 60/70/80 (no remount / reset)', p1.l === 60 && p1.w === 70 && p1.h === 80 && v1b.slice(0, 3).join() === '60,70,80', { p1, v1b })
  // Tab → 操作 select → Tab → 角點 X ; type 110 fast
  await page.keyboard.press('Tab'); const fiOp = await focusInfo()
  await page.keyboard.press('Tab'); const fiX = await focusInfo()
  ok('Tab from 高 → 操作 → 角點 X (stays inside the panel)', fiOp.tag === 'SELECT' && fiX.idx === 3, { fiOp, fiX })
  await fast('110')
  const vX = await vals()
  ok('corner X typed fast reads 「110」 (not 「1」)', vX[3] === '110', { vX })
  // the preview must follow the TYPED values: 60×70×80 = 336 cm³ at X = 110
  await page.waitForFunction(() => {
    const s = window.useApp.getState(); const v = s.editPreviewMesh?.vertices; let mx = -Infinity
    if (v) for (let i = 0; i < v.length; i += 3) mx = Math.max(mx, v[i])
    return s.featDlg?.params.px === 110 && Math.abs(mx - 170) < 0.01 && /336\.00 cm³/.test(document.querySelector('[data-testid="feat-preview-volume"]')?.textContent || '')
  }, null, { timeout: 15000 }).catch(() => {})
  const pv = await page.evaluate(() => { const m = window.useApp.getState().editPreviewMesh; const v = m?.vertices; let mn = Infinity, mx = -Infinity; if (v) for (let i = 0; i < v.length; i += 3) { mn = Math.min(mn, v[i]); mx = Math.max(mx, v[i]) } return { txt: document.querySelector('[data-testid="feat-preview-volume"]')?.textContent, mn, mx, px: window.useApp.getState().featDlg?.params.px } })
  const vX2 = await vals()
  ok('preview = typed values: 336.00 cm³, new box spans X 110…170, field still 「110」', /336\.00 cm³/.test(pv.txt || '') && Math.abs(pv.mx - 170) < 0.01 && pv.px === 110 && vX2[3] === '110', { pv, vX2 })
  await page.shot?.('box-panel-typed')
  // Tab / Shift+Tab focus trap
  const n = await page.evaluate(() => [...document.querySelector('.cmd-palette').querySelectorAll('input,select,button')].filter((e) => !e.disabled && e.getClientRects().length).length)
  for (let i = 0; i < n + 2; i++) await page.keyboard.press('Tab')
  const fiWrap = await focusInfo()
  await page.locator('.cmd-palette-body input').first().focus(); await page.keyboard.press('Shift+Tab')
  const fiBack = await focusInfo()
  ok('Tab ×(n+2) and Shift+Tab from 長 keep focus inside the panel (focus trap)', fiWrap.inDialog && fiBack.inDialog && fiBack.idx !== 0, { fiWrap, fiBack, n })
  // message line reserved: an illegal 寬 shows the error but 確定 does not move
  const yA = await okY()
  await page.locator('.cmd-palette-body input').nth(1).focus(); await page.keyboard.press('Control+a'); await fast('0'); await page.waitForTimeout(500)
  const alert = await page.evaluate(() => document.querySelector('[data-testid="feat-msg-slot"]')?.textContent)
  const yB = await okY()
  await page.locator('.cmd-palette-body input').nth(1).focus(); await page.keyboard.press('Control+a'); await fast('70'); await page.waitForTimeout(700)
  const yC = await okY()
  ok('寬 = 0 shows 「尺寸已拒絕」 in the reserved slot; 確定 stays at the same y (no jump)', /已拒絕|必須大於/.test(alert || '') && yA === y0 && yB === yA && yC === yA, { alert, y0, yA, yB, yC })
  // mid-typing pause long enough for a preview to land, then continue — no reset
  // a real mouse click into 高 selects its value → typing replaces (no 「8090」)
  await page.locator('.cmd-palette-body input').nth(2).click(); await fast('90'); await page.waitForTimeout(400)
  const vH = await vals()
  await page.locator('.cmd-palette-body input').nth(1).click(); await page.locator('.cmd-palette-body input').nth(2).click(); await fast('80'); await page.waitForTimeout(400)
  const vH2 = await vals()
  ok('mouse click into 高 then type 90 → 「90」 (value selected on click), back to 80', vH[2] === '90' && vH2[2] === '80', { vH, vH2 })
  await page.locator('.cmd-palette-body input').nth(3).focus(); await page.keyboard.press('Control+a'); await fast('1'); await page.waitForTimeout(650); await fast('10')
  const vX3 = await vals()
  ok('typing 1 … (preview lands) … 10 in X still reads 「110」', vX3[3] === '110', { vX3 })
  await page.keyboard.press('Enter'); await page.waitForTimeout(2500)
  const after = await page.evaluate(() => { const s = window.useApp.getState(); const f = s.features[s.features.length - 1]; return { n: s.features.length, dlg: !!s.featDlg, f: JSON.stringify(f).slice(0, 400), st: s.status } })
  ok('Enter commits a 60×70×80 box at X = 110', !after.dlg && after.n === nFeat0 + 1 && /60.70.80|已.*長方體 60×70×80/.test(after.st), after)

  // ── 2. cylinder panel: same field behaviour
  await page.locator('button[data-cmd="cylinder"]').first().evaluate((b) => b.click()).catch(() => {})
  let opened = await page.evaluate(() => window.useApp.getState().featDlg?.kind)
  if (opened !== 'cylinder') { await page.evaluate(() => window.useApp.getState().runCommand?.('cylinder', '圓柱')); await page.waitForTimeout(300); opened = await page.evaluate(() => window.useApp.getState().featDlg?.kind) }
  await page.waitForTimeout(300)
  if (opened === 'cylinder') {
    await page.locator('.cmd-palette-body input').first().focus(); await page.keyboard.press('Control+a')
    await fast('25'); await page.keyboard.press('Tab'); await fast('40'); await page.waitForTimeout(700)
    const cv = await vals(); const cp = await P()
    ok('cylinder: fast 25 Tab 40 → Ø 25 / 高 40 in fields and store', cv[0] === '25' && cv[1] === '40' && cp.d === 25 && cp.h === 40, { cv, cp })
    await page.keyboard.press('Escape')
  } else ok('cylinder panel opened', false, { opened })
})
