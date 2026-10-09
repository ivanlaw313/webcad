#!/usr/bin/env node
// Real-mouse proof: post-creation offset ⇥d label — click-select then click/dblclick opens editor;
// Enter rebuilds (same side); Esc cancels; one undo step.
// Usage: nice -n 19 npx vite build && flock /tmp/webcad-e2e.lock nice -n 19 node scripts/e2e-offset-dim-edit.mjs [--shots DIR]
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  await page.evaluate(() => window.useApp.getState().setLang?.('zh-HK'))
  const S = () => page.evaluate(() => {
    const s = window.useApp.getState()
    return { prof: s.sketchProfiles, st: s.status, tool: s.sketchTool, undo: s.sketchUndo.length, skSel: s.skSel }
  })
  const all = (s) => s.prof
  const fresh = async () => {
    await page.evaluate(() => {
      const u = window.useApp
      u.setState({ ...u.getInitialState(), introOpen: false, tour: null, appConfirm: async () => true }, true)
      u.getState().setLang?.('zh-HK')
      u.getState().sketchOnDatumPlane('XY', 0)
    })
    await page.waitForTimeout(1500)
  }
  const at = (s, t) => page.cadToScreen([s, -t, 0])
  const move = async (s, t) => { const [x, y] = await at(s, t); await page.mouse.move(x, y, { steps: 8 }); await page.waitForTimeout(120) }
  const click = async (s, t) => { await move(s, t); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(280) }
  const tool = async (c) => { await page.locator(`button[data-cmd="${c}"]:visible`).first().click(); await page.waitForTimeout(250) }
  const bbox = (sh) => {
    const p = sh.type === 'rect' ? [sh.a, sh.b] : sh.pts
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1])
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((v) => Math.round(v * 1000) / 1000)
  }
  const labelBox = async (re) => page.evaluate((src) => {
    const re = new RegExp(src)
    const e = [...document.querySelectorAll('.sketch-dim-layer [data-dim]')].find((x) => re.test(x.getAttribute('data-dim') || '') && x.style.opacity !== '0')
    if (!e) return null
    const r = e.getBoundingClientRect()
    return { x: r.left + Math.min(14, r.width / 2), y: r.top + r.height / 2, text: e.getAttribute('data-dim') }
  }, re.source)
  const editorOpen = () => page.locator('[data-dim-editor] input').count()

  // Inward offset −6 (signed label ⇥−6)
  await fresh()
  await tool('sk_rect'); await click(0, 0); await click(60, 40); await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  await tool('sk_offset'); await click(30, 0)
  await move(30, 12); await page.keyboard.type('6'); await page.waitForTimeout(150)
  await move(32, 14); await page.keyboard.press('Enter'); await page.waitForTimeout(700)
  let s = await S(); let off = all(s).find((x) => x.offsetOf)
  ok('inward offset created (d=−6)', !!off && Math.abs(off.offsetOf.d + 6) < 1e-6, { d: off?.offsetOf?.d, st: s.st })

  await tool('sk_select'); await page.waitForTimeout(400)
  let box = await labelBox(/⇥−?\s*6/)
  ok('signed ⇥−6 soft dim visible after select tool', !!box && /⇥−6/.test(box.text), box)
  await page.shot?.('offset-dim-signed-label')

  // First click selects (editor closed); second click opens editor
  await page.mouse.move(box.x, box.y, { steps: 4 })
  await page.mouse.click(box.x, box.y); await page.waitForTimeout(250)
  ok('first click does not open editor', (await editorOpen()) === 0, { sel: (await S()).skSel })
  await page.mouse.click(box.x, box.y); await page.waitForTimeout(350)
  ok('second click opens value editor', (await editorOpen()) > 0)

  // Esc cancels — distance unchanged
  await page.keyboard.type('99'); await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  s = await S(); off = all(s).find((x) => x.offsetOf)
  ok('Esc cancels — distance stays −6, editor closed', Math.abs(off.offsetOf.d + 6) < 1e-6 && (await editorOpen()) === 0, { d: off?.offsetOf?.d, st: s.st })

  // Double-click opens, Enter rebuilds to 10 (same inward side), one undo step
  box = await labelBox(/⇥−?\s*6/)
  const undo0 = (await S()).undo
  await page.mouse.move(box.x, box.y, { steps: 3 })
  await page.mouse.dblclick(box.x, box.y); await page.waitForTimeout(350)
  ok('double-click opens editor', (await editorOpen()) > 0)
  await page.locator('[data-dim-editor] input').first().click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('10')
  await page.keyboard.press('Enter'); await page.waitForTimeout(900)
  s = await S(); off = all(s).find((x) => x.offsetOf)
  ok('Enter rebuilds offset to −10 (same side)', !!off && Math.abs(off.offsetOf.d + 10) < 1e-6 && JSON.stringify(bbox(off)) === JSON.stringify([10, 10, 50, 30]), { d: off?.offsetOf?.d, bb: off && bbox(off), st: s.st })
  ok('edit is one sketch undo step', s.undo === undo0 + 1, { undo0, undo: s.undo })
  await page.shot?.('offset-dim-edited-10')

  await page.evaluate(() => window.useApp.getState().undo())
  await page.waitForTimeout(500)
  s = await S(); off = all(s).find((x) => x.offsetOf)
  ok('one undo restores −6', !!off && Math.abs(off.offsetOf.d + 6) < 1e-6, { d: off?.offsetOf?.d })

  // ── Open single-edge line (human QA failure mode on DtB) ────────────────────
  await fresh()
  await tool('sk_polyline'); await click(0, 0); await click(80, 0); await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  await tool('sk_offset'); await click(40, 0)
  await move(40, 12); await page.keyboard.type('6'); await page.waitForTimeout(150)
  await move(42, 14); await page.keyboard.press('Enter'); await page.waitForTimeout(700)
  s = await S(); off = all(s).find((x) => x.offsetOf)
  ok('open-line offset created (|d|=6)', !!off && Math.abs(Math.abs(off.offsetOf.d) - 6) < 1e-6, { d: off?.offsetOf?.d, st: s.st })
  const openSigned = off.offsetOf.d
  await tool('sk_select'); await page.waitForTimeout(500)
  const openRe = openSigned < 0 ? /⇥−?\s*6/ : /⇥\s*6/
  box = await labelBox(openRe)
  ok('open-line finished offset label visible on canvas', !!box, { box, openSigned })
  await page.shot?.('offset-dim-open-line-label')
  await page.mouse.move(box.x, box.y, { steps: 4 })
  await page.mouse.dblclick(box.x, box.y); await page.waitForTimeout(350)
  ok('open-line canvas dblclick opens editor', (await editorOpen()) > 0)
  await page.locator('[data-dim-editor] input').first().click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('10')
  await page.keyboard.press('Enter'); await page.waitForTimeout(900)
  s = await S(); off = all(s).find((x) => x.offsetOf)
  const side = Math.sign(openSigned)
  ok('open-line Enter rebuilds to |d|=10 same side', !!off && Math.abs(off.offsetOf.d - side * 10) < 1e-6, { d: off?.offsetOf?.d, st: s.st })
  ok('open-line geometry at |y|=10', !!off?.pts && Math.abs(Math.abs(off.pts[0][1]) - 10) < 0.05, { pts: off?.pts })
  await page.shot?.('offset-dim-open-line-edited-10')

}, { port: 4522 })
