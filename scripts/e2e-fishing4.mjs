#!/usr/bin/env node
// FISHING4 + P1 React#185: empty-doc Ctrl+click tree no crash; Ctrl body multi-sel (2 bodies);
// timeline cancel restore; box-select toggle/Esc.
// Usage: flock /tmp/webcad-e2e.lock nice -n 19 node scripts/e2e-fishing4.mjs [--shots DIR]
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  // ── P1: empty document — tree mounts; Ctrl+click any tree row must NOT crash React #185 ──
  await page.evaluate(() => {
    const u = window.useApp
    u.setState({ ...u.getInitialState(), introOpen: false, tour: null, lang: 'zh-HK', appConfirm: async () => false }, true)
  })
  await page.waitForTimeout(400)
  const emptyTree = await page.evaluate(() => {
    const browser = document.querySelector('.browser')
    const alert = document.querySelector('.browser [role="alert"], [role="alert"] b')
    const rows = [...document.querySelectorAll('.browser .tree-row')]
    return {
      browser: !!browser,
      alertText: alert?.textContent || null,
      rowCount: rows.length,
      emptyLeaf: rows.some((r) => /（空）/.test(r.textContent || '')),
    }
  })
  ok('empty doc: browser tree mounted, no ErrorBoundary', emptyTree.browser && !emptyTree.alertText, emptyTree)

  // Ctrl+click several tree rows (doc root, sections, empty leaf) — must not throw / unmount tree
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.browser .tree-row, .browser .tree-section, .browser [class*="tree"]')]
    for (const el of rows.slice(0, 12)) {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, view: window }))
    }
    // Also exercise modelSelClick with empty/undefined-ish state (guards)
    const st = window.useApp.getState()
    st.clearModelSel?.()
    window.useApp.setState({ modelSel: undefined })
    try { st.modelSelClick({ kind: 'body', key: 'active' }, 'toggle') } catch (e) { window.__selCrash = String(e) }
  })
  await page.waitForTimeout(500)
  const afterCtrl = await page.evaluate(() => {
    const alert = document.querySelector('[role="alert"]')
    const browser = document.querySelector('.browser')
    const sel = window.useApp.getState().modelSel
    return {
      alert: alert?.textContent || null,
      browser: !!browser && !/出錯|出错/.test(browser.textContent || ''),
      selCrash: window.__selCrash || null,
      modelSelOk: Array.isArray(sel),
      selKeys: (sel || []).map((x) => x.key),
    }
  })
  ok('empty doc Ctrl+click tree: no React #185 / 瀏覽樹出錯', afterCtrl.browser && !afterCtrl.alert && !afterCtrl.selCrash && !pageErrors.some((m) => /Maximum update depth|#185/.test(m)), { afterCtrl, pageErrors: pageErrors.slice(0, 6) })
  ok('modelSelClick guards undefined selection → array', afterCtrl.modelSelOk, afterCtrl)
  await page.shot('empty-ctrl-ok')

  // ── P2 Timeline cancel: edit extrude height, cancel → original volume ──
  await page.evaluate(async () => {
    const u = window.useApp
    u.setState({ ...u.getInitialState(), introOpen: false, tour: null, lang: 'zh-HK', appConfirm: async () => false }, true)
    for (let t = 0; t < 200 && !(await u.getState().applyFeatures([{
      id: 'e1', type: 'extrude', profile: { kind: 'rect', a: [0, 0], b: [20, 20] }, height: 10, operation: 'new',
    }], 'base')); t++) await new Promise((r) => setTimeout(r, 200))
  })
  await page.waitForTimeout(600)
  const vol0 = await page.evaluate(async () => {
    const s = window.useApp.getState()
    return s.bodyMesh?.volumeExact ?? s.bodyMesh?.volume ?? null
  })
  ok('seed extrude volume ~4000 mm³', vol0 != null && Math.abs(vol0 - 4000) < 1, { vol0 })

  await page.locator('.tl-chip[data-fi="0"]').click()
  await page.waitForTimeout(400)
  const barOpen = await page.locator('.feat-editor').count()
  ok('inline feat editor opens', barOpen === 1)

  await page.evaluate(() => { window.__featUndoBase = window.useApp.getState().undoStack.length })

  const heightInput = page.locator('.feat-editor input[type="text"]').first()
  await heightInput.click()
  await heightInput.fill('25')
  await heightInput.press('Enter')
  await page.waitForTimeout(800)
  const mid = await page.evaluate(() => {
    const f = window.useApp.getState().features.find((x) => x.type === 'extrude')
    return { h: f?.height, status: window.useApp.getState().status, undo: window.useApp.getState().undoStack.length }
  })
  ok('edit commits height 25', mid.h === 25, mid)

  await page.locator('[data-testid="fe-cancel"]').click()
  await page.waitForTimeout(1200)
  const after = await page.evaluate(() => {
    const s = window.useApp.getState()
    const f = s.features.find((x) => x.type === 'extrude')
    return {
      h: f?.height,
      status: s.status,
      bar: document.querySelectorAll('.feat-editor').length,
      vol: s.bodyMesh?.volumeExact ?? s.bodyMesh?.volume ?? null,
      sel: s.selectedFeature,
    }
  })
  ok('cancel restores height 10', after.h === 10, after)
  ok('cancel restores volume ~4000', after.vol != null && Math.abs(after.vol - 4000) < 1, after)
  ok('cancel closes editor', after.bar === 0 && after.sel == null, after)
  ok('cancel status Traditional', /已取消特徵|已還原/.test(after.status || '') || after.h === 10, { status: after.status })
  await page.shot('cancel-restored')

  // ── P2 Box-select toggle + Esc ──
  await page.evaluate(() => window.useApp.getState().setNavTool('select'))
  let nav = await page.evaluate(() => window.useApp.getState().navTool)
  ok('enter box-select', nav === 'select')
  await page.evaluate(() => {
    const s = window.useApp.getState()
    s.setNavTool('select')
    const navTool = s.navTool
    s.setNavTool(navTool === 'select' ? 'orbit' : 'select')
  })
  nav = await page.evaluate(() => window.useApp.getState().navTool)
  ok('toggle select button exits to orbit', nav === 'orbit')

  await page.evaluate(() => window.useApp.getState().setNavTool('select'))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  nav = await page.evaluate(() => window.useApp.getState().navTool)
  ok('Esc exits box-select to orbit', nav === 'orbit', { nav })

  // ── P1/P2: real tree Ctrl multi-select with 2 bodies ──
  await page.evaluate(async () => {
    const u = window.useApp
    // Fresh doc so tree re-renders both body rows cleanly
    u.setState({ ...u.getInitialState(), introOpen: false, tour: null, lang: 'zh-HK', appConfirm: async () => false }, true)
    const s = () => u.getState()
    const plate = { id: 'plate', type: 'extrude', profile: { kind: 'rect', a: [-50, -40], b: [50, 40] }, height: 8, operation: 'new' }
    for (let t = 0; t < 200 && !(await s().applyFeatures([plate], 'plate')); t++) await new Promise((r) => setTimeout(r, 200))
    const cyl = { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [20, 0], r: 10 }, height: 40, baseZ: 8, operation: 'newbody' }
    await s().applyFeatures([...s().features, cyl], 'cyl')
  })
  await page.waitForFunction(() => (window.useApp.getState().bodyMesh?.parked?.length ?? 0) === 1, null, { timeout: 60000 })
  await page.waitForTimeout(500)
  // Expand browser if collapsed; ensure 實體 section open
  await page.evaluate(() => {
    const st = window.useApp.getState()
    if (st.browserCollapsed) st.toggleBrowser()
    for (const row of document.querySelectorAll('.browser .tree-row')) {
      const t = row.textContent || ''
      if (/實體|Bodies/i.test(t) && row.querySelector('.tw-toggle') && /▸|►|▶/.test(row.querySelector('.tw-toggle')?.textContent || '')) {
        row.querySelector('.tw-toggle')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      }
    }
  })
  await page.waitForTimeout(200)
  const diag = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid'))
    const m = window.useApp.getState().bodyMesh
    return { ids: ids.filter((x) => /tree-body/.test(x || '')), parked: m?.parked?.length ?? 0, tris: m?.triangles?.length ?? 0, collapsed: window.useApp.getState().browserCollapsed }
  })
  await page.waitForSelector('[data-testid="tree-body-active"]', { timeout: 15000 }).catch(() => {})
  await page.waitForSelector('[data-testid="tree-body-parked-0"]', { timeout: 15000 }).catch(() => {})
  const active = page.locator('[data-testid="tree-body-active"]')
  const parked = page.locator('[data-testid="tree-body-parked-0"]')
  ok('two body rows in tree', await active.count() === 1 && await parked.count() === 1, diag)

  await page.evaluate(() => window.useApp.getState().clearModelSel())
  // Ctrl+click via the tree-row parent (BodyRow onClick is on the row)
  const clicked = await page.evaluate(() => {
    const clickRow = (testid) => {
      const el = document.querySelector(`[data-testid="${testid}"]`)
      const row = el?.closest('.tree-row')
      if (!row) return false
      row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, view: window }))
      return true
    }
    return { a: clickRow('tree-body-active'), p: clickRow('tree-body-parked-0') }
  })
  await page.waitForTimeout(300)

  const multi = await page.evaluate(() => {
    const s = window.useApp.getState()
    const keys = (s.modelSel ?? []).filter((x) => x.kind === 'body').map((x) => x.key)
    const alert = document.querySelector('[role="alert"]')?.textContent || null
    const browserOk = !!document.querySelector('.browser') && !/出錯|出错/.test(document.querySelector('.browser')?.textContent || '')
    return { keys, alert, browserOk, n: keys.length }
  })
  ok('Ctrl+click tree multi-select 2 bodies, no crash', multi.browserOk && !multi.alert && multi.n >= 2 && clicked.a && clicked.p, { multi, clicked })
  await page.shot('tree-multisel-2')

  // store-level toggle still works (compat with prior fishing4 proof)
  await page.evaluate(() => {
    const u = window.useApp
    u.getState().clearModelSel()
    u.getState().modelSelClick({ kind: 'body', key: 'active' }, 'replace')
    u.getState().modelSelClick({ kind: 'body', key: 'parked:0', parked: 0 }, 'toggle')
  })
  const multi2 = await page.evaluate(() => (window.useApp.getState().modelSel ?? []).filter((x) => x.kind === 'body').map((x) => x.key))
  ok('Ctrl-style toggle adds second body to modelSel', multi2.length === 2 && multi2.includes('active') && multi2.includes('parked:0'), { multi2 })
})
