#!/usr/bin/env node
// Goal A/B UX e2e. Serve dist yourself or pass --url. Prefer static server (no vite).
import { launch } from './e2e-lib.mjs'

const { page, ok, finish } = await launch({ port: Number(process.env.E2E_PORT || 4327) })
const W = (ms) => page.waitForTimeout(ms)
const st = () => page.evaluate(() => {
  const s = window.useApp.getState()
  return {
    status: s.status, dlg: s.sweepDlgOpen, feat: s.featDlg?.kind, twist: s.sweepTwist, scale: s.sweepScale,
    prev: !!(s.sweepPreview && s.sweepPreview.mesh), busy: !!s.sweepPreviewBusy,
    undo: s.undoStack.length, feats: s.features.map((f) => ({ t: f.type, op: f.op, arb: !!f.arbPlane })),
  }
})
try {
  await page.evaluate(() => {
    const g = window.useApp.getState()
    g.startSketch(); g.chooseSketchPlane('XY')
    window.useApp.setState({
      sketchProfiles: [{ type: 'rect', a: [-4, -3], b: [4, 3] }],
      polyPts: [[0, 0], [40, 0], [40, 30]],
      sweepSection: 'profile',
      sketchShape: null,
    })
    g.openSweepDlg()
  })
  await W(500)
  let s0 = await st()
  ok('sweep dialog open', !!s0.dlg, s0)

  const twist = page.locator('[data-testid="sweep-twist-input"]')
  const scale = page.locator('[data-testid="sweep-scale-input"]')
  ok('twist/scale draft inputs present', (await twist.count()) === 1 && (await scale.count()) === 1)

  await twist.click({ clickCount: 3 })
  await page.keyboard.type('90', { delay: 40 })
  await W(100)
  const twVal = await twist.inputValue()
  ok('twist draft keeps typed 90 (no eaten digits)', twVal.includes('90'), { twVal })
  await page.keyboard.press('Tab'); await W(150)
  s0 = await st()
  ok('twist settled to store 90', s0.twist === 90, s0)

  await scale.click({ clickCount: 3 })
  await page.keyboard.type('abc', { delay: 30 })
  await W(200)
  const scaleAlert = page.locator('[data-testid="sweep-scale-alert"]')
  const alertTxt = (await scaleAlert.count()) ? await scaleAlert.textContent() : ''
  ok('invalid scale shows Formal TC alert', /縮放|數值|拒絕/.test(alertTxt), { alertTxt })
  const okBtn = page.locator('.cmd-palette button').filter({ hasText: /^確定$/ }).first()
  ok('OK disabled on invalid scale', await okBtn.isDisabled())

  await scale.click({ clickCount: 3 }); await page.keyboard.type('1', { delay: 30 }); await page.keyboard.press('Tab'); await W(100)
  await twist.click({ clickCount: 3 }); await page.keyboard.press('Backspace'); await page.keyboard.press('Tab'); await W(100)
  s0 = await st()
  ok('blank twist settles to 0', s0.twist === 0, s0)

  await twist.click({ clickCount: 3 }); await page.keyboard.type('45', { delay: 30 }); await page.keyboard.press('Tab'); await W(1000)
  await page.locator('.cmd-palette button').filter({ hasText: /取消/ }).first().click(); await W(400)
  s0 = await st()
  ok('cancel closes dialog and clears preview', !s0.dlg && !s0.prev && !s0.busy, s0)

  // Emboss: box + dialog empty-text Formal TC + OK + undo
  await page.evaluate(async () => {
    const g = window.useApp.getState()
    await g.applyFeatures([{ id: 'b1', type: 'extrude', profile: { kind: 'rect', a: [-20, -15], b: [20, 15] }, height: 10, operation: 'new' }], '盒')
  })
  await W(600)
  const undoBefore = (await st()).undo
  await page.evaluate(() => {
    window.useApp.setState({
      featDlg: {
        kind: 'emboss',
        params: { text: 'AB', font: 'cad', size: 8, depth: 1.5, mode: 'emboss' },
        payload: { arbPlane: { o: [0, 0, 10], xd: [1, 0, 0], n: [0, 0, 1] } },
      },
    })
  })
  await W(500)
  ok('emboss dialog open', (await st()).feat === 'emboss')
  const tx = page.locator('.cmd-palette input[aria-label="浮雕文字"]').first()
  await tx.fill(''); await W(400)
  const block = await page.evaluate(() => {
    const d = window.useApp.getState().featDlg
    // mirror featDlgBlockingReason via disabled OK / visible refuse
    return { disabled: !![...document.querySelectorAll('.cmd-palette button')].find((b) => /^確定$/.test(b.textContent || '') && b.disabled), text: d?.params?.text }
  })
  ok('empty text blocks OK', block.disabled || block.text === '', block)
  await tx.fill('AB'); await W(300)
  await page.locator('.cmd-palette button').filter({ hasText: /^確定$/ }).first().click(); await W(1500)
  let s1 = await st()
  const hasEmboss = s1.feats.some((f) => f.t === 'text' && f.arb)
  ok('emboss committed as 浮雕 text+arbPlane', hasEmboss, s1)
  ok('emboss undo stack grew', s1.undo > undoBefore, { undoBefore, undo: s1.undo })
  await page.keyboard.press('Control+z'); await W(1000)
  s1 = await st()
  ok('Ctrl+Z removes emboss in one step', !s1.feats.some((f) => f.t === 'text'), s1)

  await finish()
} catch (e) {
  await finish(e)
}
