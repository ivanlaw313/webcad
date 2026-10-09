#!/usr/bin/env node
// FISHING3 P1 real-mouse: array tool canvas-select source → 應用陣列 creates instances (rect + circ).
// Usage: flock /tmp/webcad-e2e.lock nice -n 19 node scripts/e2e-fishing3-sketch-pattern.mjs [--shots DIR]
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  const snap = () => page.evaluate(() => {
    const s = window.useApp.getState()
    const associative = !!s.skPatternSession
    const ready = associative
      ? !!(s.skPatternPreview.document && !s.skPatternPreview.error)
      : !!(s.arrayPreview.shapes && !s.arrayPreview.error)
    const err = associative ? s.skPatternPreview.error : s.arrayPreview.error
    return {
      tool: s.sketchTool, n: s.sketchProfiles.length, sel: s.skSel.length,
      pending: s.arrayPending || (associative ? s.skPatternPreview.pending : s.arrayPreview.pending),
      ready, err, status: s.status, session: s.skPatternSession?.mode ?? null,
      linked: !!s.skPatternData, applyDisabled: !!document.querySelector('[data-array-apply][disabled]'),
      createDisabled: !!document.querySelector('[data-pattern-create][disabled]'),
      info: document.querySelector('[data-pattern-source-info]')?.textContent ?? '',
      alert: document.querySelector('[data-array-error]')?.textContent ?? '',
    }
  })
  const seed = async (cfg = {}) => {
    await page.evaluate((cfg) => {
      const u = window.useApp
      const baseCfg = { kind: 'rect', nx: 2, dx: 50, ny: 1, dy: 0, count: 4, angle: 360, cx: 0, cy: 0, distType: 'spacing', angleType: 'full' }
      u.setState({
        ...u.getInitialState(), introOpen: false, tour: null, lang: 'zh-HK',
        mode: 'sketch', sketchTool: 'array', sketchPlane: 'XY', sketchBaseZ: 0, navTool: 'orbit',
        sketchProfiles: [
          { type: 'circle', c: [0, 0], r: 6 },
          { type: 'circle', c: [40, 0], r: 6 },
          { type: 'circle', c: [0, 40], r: 6 },
          { type: 'circle', c: [40, 40], r: 6 },
        ],
        skSel: [], skCons: [],
        arrayCfg: { ...baseCfg, ...cfg },
        appConfirm: async () => false,
      }, true)
      u.getState().skLookAt?.()
    }, cfg)
    await page.waitForTimeout(900)
  }
  const clickCad = async (x, y) => {
    const [sx, sy] = await page.cadToScreen([x, y, 0])
    await page.mouse.move(sx, sy, { steps: 6 })
    await page.mouse.down(); await page.mouse.up()
    await page.waitForTimeout(450)
  }
  const selectFirstByMouse = async () => {
    await clickCad(0, 6)
    let s = await snap()
    if (s.sel < 1) {
      await clickCad(0, 0)
      s = await snap()
    }
    return s
  }
  const waitApplyReady = async (ms = 8000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      const s = await snap()
      if (!s.applyDisabled && s.ready) return s
      await page.waitForTimeout(200)
    }
    return snap()
  }

  // --- rectangular independent ---
  await seed()
  let s0 = await snap()
  ok('panel shows need-select hint for 4 profiles (not silent enable)', /4/.test(s0.info) && (s0.applyDisabled || !!s0.alert || !!s0.err), s0)
  await page.shot('p1-need-select')
  let s1 = await selectFirstByMouse()
  ok('real-mouse click in array tool selects a source', s1.sel >= 1, s1)
  await page.waitForTimeout(600)
  s1 = await snap()
  ok('after selection, apply becomes enabled (preview ready)', s1.sel >= 1 && !s1.applyDisabled && s1.ready, s1)
  await page.locator('[data-array-apply]').click()
  await page.waitForTimeout(1200)
  let s2 = await snap()
  ok('rectangular 應用陣列 creates instances', s2.n > 4, s2)
  await page.shot('p1-rect-applied')

  // --- circular independent ---
  await seed({ kind: 'circ', count: 4, angle: 360, cx: 0, cy: 0, angleType: 'full' })
  let sc0 = await selectFirstByMouse()
  ok('circular: real-mouse selects source', sc0.sel >= 1, sc0)
  let sc = await waitApplyReady()
  ok('circular preview ready', !sc.applyDisabled && sc.ready, sc)
  await page.locator('[data-array-apply]').click({ timeout: 5000 })
  await page.waitForTimeout(1200)
  let s3 = await snap()
  ok('circular 應用陣列 creates instances', s3.n > 4, s3)
  await page.shot('p1-circ-applied')

  // --- associative ---
  await seed()
  let s4 = await selectFirstByMouse()
  ok('建立關聯陣列 enabled after selection', !s4.createDisabled && s4.sel >= 1, s4)
  await page.locator('[data-pattern-create]').click()
  await page.waitForTimeout(400)
  s4 = await waitApplyReady()
  ok('associative preview ready', !s4.applyDisabled && s4.ready && s4.session === 'create', s4)
  await page.locator('[data-array-apply]').click({ timeout: 5000 })
  await page.waitForTimeout(1500)
  let s5 = await snap()
  ok('建立／應用關聯陣列 creates linked pattern', s5.linked && s5.n > 4, s5)
  await page.shot('p1-assoc-applied')
})
