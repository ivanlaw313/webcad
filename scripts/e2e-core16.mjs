#!/usr/bin/env node
// CORE16 real-browser e2e: the 16 most-used SOLID ribbon commands, each driven like a user — ribbon icon click,
// viewport picks with the mouse, sketches drawn with the mouse, values typed into the fields (decimals / multi-digit),
// main option toggles, preview present (+ volume vs result where the kernel preview is a full body), 確定, timeline
// double-click edit, Ctrl+Z / Ctrl+Y and one error case (clear Traditional message, no English, no silent failure).
// Per command PASS/FAIL + volume + screenshot → --out dir (default /workspace/webcad-qa/sketch-20261008/grok)
//   evidence/core16-<cmd>.png and CORE16-e2e.md.
// NOT part of the default test run. Usage (repo root, after `npx vite build`):
//   nice -n 19 node scripts/e2e-core16.mjs [--only extrude,revolve] [--out DIR] [--md CORE16-e2e.md] [--verbose]
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { runE2E, arg } from './e2e-harness.mjs'

const OUT = arg('--out', '/workspace/webcad-qa/sketch-20261008/grok')
const MD = arg('--md', 'CORE16-e2e.md')
const ONLY = (arg('--only', '') || '').split(',').filter(Boolean)
const VERBOSE = process.argv.includes('--verbose')
mkdirSync(`${OUT}/evidence`, { recursive: true })

// English words allowed in Traditional UI copy (units, file formats, Fusion ids users know)
const EN_OK = /^(mm|cm|in|inch|deg|OK|Esc|Enter|Ctrl|Shift|Tab|STL|STEP|DXF|SVG|OBJ|3MF|BOM|CAD|UI|XY|XZ|YZ|G1|G2|Z|X|Y|R|C|M\d*|Fusion|WebCAD|OCCT|B-rep|BRep|ƒx|fx|Ø|dx|dy|dz|PCB|UCS|T-spline)$/i
const SC_ONLY = /[确并参个这们时实图转边击输线为对设择选应无数长宽圆锥轮画双轴树层径确认请删撤销没个过还让发现开关]/g
const simplified = (txt) => [...new Set(String(txt || '').match(SC_ONLY) || [])]
const englishWords = (txt) => (String(txt || '').match(/[A-Za-z][A-Za-z\-]{2,}/g) || []).filter((w) => !EN_OK.test(w))

await runE2E(async (page, okRaw) => {
  const W = (ms) => page.waitForTimeout(ms)
  const S = (fn, a) => page.evaluate(fn, a)
  const st = () => S(() => { const s = window.useApp.getState(); return { mode: s.mode, status: s.status, feats: s.features.map((f) => f.type), failed: s.failedFeatureIds, busy: s.busy, featDlg: s.featDlg?.kind ?? null } })
  const vol = () => S(() => {
    const s = window.useApp.getState(); const m = s.bodyMesh
    const v1 = (vs, ts) => { let v = 0; for (let i = 0; i < ts.length; i += 3) { const a = ts[i] * 3, b = ts[i + 1] * 3, c = ts[i + 2] * 3; v += (vs[a] * (vs[b + 1] * vs[c + 2] - vs[b + 2] * vs[c + 1]) - vs[a + 1] * (vs[b] * vs[c + 2] - vs[b + 2] * vs[c]) + vs[a + 2] * (vs[b] * vs[c + 1] - vs[b + 1] * vs[c])) / 6 } return v }
    if (!m) return { active: 0, total: 0, bodies: 0 }
    const active = m.vertices?.length ? Math.abs(v1(m.vertices, m.triangles)) : 0
    const parked = (m.parked ?? []).map((p) => Math.abs(v1(p.vertices, p.triangles)))
    return { active: +active.toFixed(2), total: +(active + parked.reduce((a, b) => a + b, 0)).toFixed(2), bodies: (active > 0 ? 1 : 0) + parked.filter((x) => x > 0).length }
  })
  const meshVol = (key) => S((key) => {
    const s = window.useApp.getState()
    const m = key === 'loft' ? s.loftPreview?.mesh : s[key]
    if (!m?.vertices?.length) return null
    const vs = m.vertices, ts = m.triangles; let v = 0
    for (let i = 0; i < ts.length; i += 3) { const a = ts[i] * 3, b = ts[i + 1] * 3, c = ts[i + 2] * 3; v += (vs[a] * (vs[b + 1] * vs[c + 2] - vs[b + 2] * vs[c + 1]) - vs[a + 1] * (vs[b] * vs[c + 2] - vs[b + 2] * vs[c]) + vs[a + 2] * (vs[b] * vs[c + 1] - vs[b + 1] * vs[c])) / 6 }
    let pv = 0; for (const p of m.parked ?? []) { const vs = p.vertices, ts = p.triangles; for (let i = 0; i < ts.length; i += 3) { const a = ts[i] * 3, b = ts[i + 1] * 3, c = ts[i + 2] * 3; pv += Math.abs(0) + (vs[a] * (vs[b + 1] * vs[c + 2] - vs[b + 2] * vs[c + 1]) - vs[a + 1] * (vs[b] * vs[c + 2] - vs[b + 2] * vs[c]) + vs[a + 2] * (vs[b] * vs[c + 1] - vs[b + 1] * vs[c])) / 6 } }
    return +(Math.abs(v) + Math.abs(pv)).toFixed(2)
  }, key)
  // visible scene meshes (r3f scene) — a command preview shows up as an extra / changed mesh
  const sceneSig = () => S(() => {
    const out = []
    window.__three.scene.traverse((o) => {
      if (!(o.isMesh || o.isLine || o.isLineSegments) || !o.geometry) return
      let p = o; while (p) { if (!p.visible) return; p = p.parent }
      const n = o.geometry.index ? o.geometry.index.count : (o.geometry.attributes.position?.count ?? 0)
      if (n > 0) out.push((o.isMesh ? 'm' : 'l') + n)
    })
    return out.sort().join(',')
  })
  const dlgText = () => S(() => [...document.querySelectorAll('.cmd-palette')].map((p) => p.innerText).join('\n'))
  const statusBar = () => S(() => document.querySelector('.vp-status-message')?.textContent || window.useApp.getState().status)   // what the user sees (render layer converts to Traditional)
  const ribbon = async (id) => {
    await S(() => { const s = window.useApp.getState(); if (s.workspace && s.workspace !== 'SOLID') s.setWorkspace?.('SOLID') })
    const b = page.locator(`.tool-btn[data-cmd="${id}"]:visible`).first()
    if (await b.count()) { await b.click(); await W(500); return 'icon' }
    // child of a quick split button (圓錐 under 圓柱 ▾ / 倒角 under 圓角 ▾ / 環形陣列 under 陣列 ▾)
    const parent = { cylinder: 'box', cone: 'box', chamfer: 'fillet', circpattern: 'pattern', pathpattern: 'pattern', geopattern: 'pattern' }[id]
    if (parent) {
      await page.locator(`[data-testid="quick-tool-caret-${parent}"]:visible`).first().click(); await W(250)
      await page.locator(`[data-testid="quick-tool-menu-${parent}"] [data-cmd="${id}"]`).first().click(); await W(500)
      return 'caret'
    }
    throw new Error('ribbon icon not visible: ' + id)
  }
  const okBtn = () => page.locator('.cmd-palette [data-testid="command-confirm"]:visible').first()
  const clickOk = async () => { await okBtn().click(); await waitIdle() }
  const waitIdle = async (ms = 60000) => {
    await page.waitForFunction(() => { const s = window.useApp.getState(); return !s.busy && !s.roundPreviewBusy && !s.shellPreviewBusy && !s.loftPreviewBusy }, null, { timeout: ms }).catch(() => {})
    await W(700)
  }
  const at = (p) => page.cadToScreen(p)
  const mouseClick = async (xy, { hover = true } = {}) => {
    if (hover) { await page.mouse.move(xy[0] - 5, xy[1] - 5); await page.mouse.move(xy[0], xy[1], { steps: 3 }); await W(80) }
    await page.mouse.down(); await page.mouse.up(); await W(250)
  }
  const clickCad = async (p) => mouseClick(await at(p))
  // a field inside the open command palette, found by its visible label text / aria-label / title
  const field = (re) => page.locator('.cmd-palette label', { hasText: re }).locator('input:visible').first()
  const typeInto = async (loc, txt) => { await loc.click(); await loc.press('Control+a'); await loc.pressSequentially(String(txt), { delay: 60 }); await W(350) }
  const typeField = async (re, txt) => typeInto(field(re), txt)
  const commitField = async (loc) => { await loc.press('Tab'); await W(300) }
  const selectIn = async (re, value) => { const sel = typeof re === 'string' ? page.locator(`.cmd-palette select[aria-label="${re}"]`).first() : page.locator('.cmd-palette label', { hasText: re }).locator('select:visible').first(); await sel.selectOption(value, { timeout: 5000 }); await W(400) }
  const frame = async () => { await S(() => { const g = window.useApp.getState(); g.setView?.('iso'); }); await W(700); await S(() => window.useApp.getState().requestFit?.()); await W(900) }
  const fresh = async () => {
    await page.keyboard.press('Escape'); await W(100); await page.keyboard.press('Escape')
    await S(async () => { const g = window.useApp.getState(); await g.reset(); window.useApp.setState({ introOpen: false, tour: null }) })
    await W(800)
  }
  const build = async (feats, label = 'base') => {
    await S(async ([feats, label]) => { const g = () => window.useApp.getState(); for (let t = 0; t < 200 && !(await g().applyFeatures(feats, label)); t++) await new Promise((r) => setTimeout(r, 250)) }, [feats, label])
    await waitIdle(); await frame()
  }
  // mouse sketch helpers (CAD XY/XZ/YZ principal planes)
  const sketchScreen = (plane, p2, baseZ = 0) => S(([plane, st, b]) => {
    const cam = window.__three.camera, V = cam.position.constructor
    const cv = [...document.querySelectorAll('canvas')].sort((a, c) => c.clientWidth * c.clientHeight - a.clientWidth * a.clientHeight)[0]
    const r = cv.getBoundingClientRect()
    const w = plane === 'XY' ? new V(st[0], b, st[1]) : plane === 'XZ' ? new V(st[0], st[1], -b) : new V(b, st[1], st[0])
    const q = w.project(cam)
    return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height]
  }, [plane, p2, baseZ])
  const startSketchOn = async (plane, pt) => {
    await ribbon('sketch')
    const hasBody = await S(() => !!window.useApp.getState().bodyMesh?.triangles?.length)
    const pickerBtn = page.locator(`.sketch-plane-picker button[aria-label^="${plane} "]:visible`).first()
    if (!pt && plane !== 'XY' && await pickerBtn.count()) { await pickerBtn.click(); await W(1200) }
    else if (!hasBody || pt) {
      // empty scene: click the origin plane in the viewport like a user (XY red / XZ green / YZ blue)
      pt = pt ?? (plane === 'XY' ? [18, -22, 0] : plane === 'XZ' ? [18, 0, 22] : [0, 18, 22])
      await clickCad(pt); await W(1200)
    } else {
      // body in the way: the plane-picker bar buttons (XY · 上 / XZ · 前 / YZ · 右)
      await page.locator(`.sketch-plane-picker button[aria-label^="${plane} "]`).first().click(); await W(1200)
    }
    const s = await S(() => { const s = window.useApp.getState(); return [s.mode, s.sketchPlane, s.sketchBaseZ, !!s.sketchArb] })
    if (s[0] !== 'sketch' || s[1] !== plane || s[2] !== 0 || s[3]) throw new Error('sketch plane not opened: ' + JSON.stringify(s))
  }
  const skTool = async (id) => { await page.locator(`button[data-cmd="${id}"]:visible`).first().click(); await W(200) }
  const skClick = async (plane, p2) => { await mouseClick(await sketchScreen(plane, p2)); await W(200) }
  const finishSketch = async () => { await page.keyboard.press('Escape'); await W(150); await page.locator('button[data-cmd="finishsketch"]:visible').first().click(); await W(900) }
  const drawRect = async (plane, a, b) => { await skTool('sk_rect'); await skClick(plane, a); await skClick(plane, b) }
  const drawCircle = async (plane, c, r) => { await skTool('sk_circle'); await skClick(plane, c); await skClick(plane, [c[0] + r, c[1]]) }
  const drawPoly = async (plane, pts, close = false) => { await skTool('sk_polyline'); for (const p of pts) await skClick(plane, p); if (close) await skClick(plane, pts[0]); await page.keyboard.press('Escape'); await W(200) }
  const shapes = () => S(() => { const s = window.useApp.getState(); return [...s.sketchProfiles, ...(s.sketchShape ? [s.sketchShape] : [])].map((h) => ({ type: h.type, a: h.a, b: h.b, c: h.c, r: h.r, pts: h.pts?.length })) })
  const timelineDbl = async (type, nth = -1) => {
    const idx = await S(([type, nth]) => { const f = window.useApp.getState().features; const ids = f.map((x, i) => [x.type, i]).filter((x) => x[0] === type).map((x) => x[1]); return nth < 0 ? ids[ids.length + nth] : ids[nth] }, [type, nth])
    if (idx == null) throw new Error('no timeline chip for ' + type)
    const chip = page.locator(`.tl-chip[data-fi="${idx}"]`).first()
    await chip.scrollIntoViewIfNeeded().catch(() => {})
    await chip.dblclick(); await W(900)
  }
  const undo = async () => { await S(() => document.activeElement?.blur?.()); await page.locator('canvas').first().focus().catch(() => {}); await page.keyboard.press('Control+z'); await waitIdle() }
  const redo = async () => { await page.keyboard.press('Control+y'); await waitIdle() }
  const near = (a, b, tol = 0.03) => a != null && b != null && Math.abs(a - b) <= Math.max(1, Math.abs(b) * tol)

  // ── per-command bookkeeping ──
  const rows = []
  let cur = null
  const log = (...a) => { if (VERBOSE) console.log(...a) }
  const ok = (name, pass, info = {}) => { cur?.checks.push({ name, pass, info }); okRaw(`[${cur?.cmd}] ${name}`, pass, info) }
  const tradOnly = async (label, txt) => {
    const en = englishWords(txt), sc = simplified(txt)
    ok(`${label}: Traditional (no English / Simplified)`, en.length === 0 && sc.length === 0, { en: en.slice(0, 12), sc: sc.slice(0, 12), txt: (en.length || sc.length) ? String(txt).replace(/\s+/g, ' ').slice(0, 160) : undefined })
  }
  const run = async (cmd, title, fn) => {
    if (ONLY.length && !ONLY.includes(cmd)) return
    cur = { cmd, title, checks: [], vol: null, note: '' }
    const t0 = Date.now()
    try { await fresh(); await fn() } catch (e) {
      const ctx = await S(() => { const s = window.useApp.getState(); return { mode: s.mode, status: s.status, feats: s.features.map((f) => f.type), dlg: [...document.querySelectorAll('.cmd-palette')].map((p) => p.innerText.replace(/\s+/g, ' ').slice(0, 200)), shapes: [...s.sketchProfiles, ...(s.sketchShape ? [s.sketchShape] : [])].map((h) => h.type) } }).catch(() => ({}))
      ok('scenario ran without exception', false, { error: String(e?.message || e).split('\n')[0].slice(0, 200), ctx })
    }
    try { await page.screenshot({ path: `${OUT}/evidence/core16-${cmd}.png` }) } catch { /* */ }
    cur.secs = Math.round((Date.now() - t0) / 1000)
    rows.push(cur)
    await page.keyboard.press('Escape').catch(() => {}); await W(200); await page.keyboard.press('Escape').catch(() => {})
  }

  await S(() => window.useApp.getState().setLang('zh-HK'))
  await W(300)

  // shared check: commit happened + volume, timeline edit, undo/redo, error case
  const expectVol = async (label, expected, tol = 0.03, key = 'total') => {
    const v = await vol()
    ok(`${label}: volume ≈ ${expected}`, near(v[key], expected, tol), { v, expected })
    await tradOnly(`${label} status`, await statusBar())
    cur.vol = v[key]
    return v
  }
  const undoRedo = async (before, after, key = 'total') => {
    await undo(); const u = await vol()
    ok('Ctrl+Z restores previous volume', near(u[key], before, 0.03), { u: u[key], before })
    await redo(); const r = await vol()
    ok('Ctrl+Y re-applies', near(r[key], after, 0.03), { r: r[key], after })
  }
  const errorMsg = async (label, re = /./) => {
    const s = await statusBar(); const d = await dlgText()
    const alerts = await S(() => [...document.querySelectorAll('.cmd-palette [role=alert], .cmd-palette [aria-invalid=true], .toast, .status-bar')].map((e) => e.innerText || e.getAttribute('title') || '').join(' | '))
    const txt = [s, alerts].join(' | ')
    ok(`${label}: clear message`, re.test(txt), { status: s, alerts: alerts.slice(0, 200) })
    await tradOnly(label, s + ' ' + alerts)
    return { s, d }
  }

  // ════════════════ 1. 拉伸 Extrude ════════════════
  await run('extrude', '拉伸 Extrude', async () => {
    await frame()
    await startSketchOn('XY')
    await drawRect('XY', [-20, -15], [20, 15])
    const sh = await shapes()
    ok('rectangle drawn with the mouse', sh.length === 1 && sh[0].type === 'rect', { sh })
    await finishSketch()
    await tradOnly('finish-sketch status', await statusBar())
    const sig0 = await sceneSig()
    await ribbon('extrude')
    ok('extrude dialog open', await S(() => window.useApp.getState().extrudeDlgOpen))
    // user types straight away — must land in 距離 (not 拔模角)
    await page.keyboard.press('Control+a'); await page.keyboard.type('12.5', { delay: 80 }); await W(600)
    const h0 = await S(() => { const s = window.useApp.getState(); return { h: s.extrudeHeight, draft: s.extrudeDraft, active: document.activeElement?.closest('label')?.innerText?.split('\n')[0] } })
    ok('typing right after opening goes into 距離 (12.5), not taper', h0.h === 12.5 && !h0.draft, h0)
    await tradOnly('extrude panel', await dlgText())
    ok('preview present', (await sceneSig()) !== sig0)
    await page.locator('.cmd-palette button', { hasText: /反向/ }).first().click(); await W(500)
    const fl = await S(() => window.useApp.getState().extrudeFlip)
    await page.locator('.cmd-palette button', { hasText: /反向/ }).first().click(); await W(400)
    ok('⇅ 反向 toggles', fl === true && (await S(() => window.useApp.getState().extrudeFlip)) === false)
    await selectIn('拉伸方向', 'symmetric'); const sy = await S(() => window.useApp.getState().extrudeExtent)
    await selectIn('拉伸方向', 'distance')
    ok('方向 單側/對稱 toggle', sy === 'symmetric' && (await S(() => window.useApp.getState().extrudeExtent)) === 'distance')
    await clickOk()
    const v1 = (await expectVol('extrude 40×30×12.5', 15000)).total
    // second profile: Ø10 circle → 切割 · 貫通
    await startSketchOn('XY'); await drawCircle('XY', [0, 0], 5); await finishSketch()
    await ribbon('extrude')
    await selectIn('拉伸操作', 'cut'); await selectIn('拉伸範圍', 'through')
    await W(800)
    await clickOk()
    const vc = (await expectVol('cut Ø10 through', 15000 - Math.PI * 25 * 12.5, 0.02)).total
    // timeline edit: first extrude 12.5 → 20
    await timelineDbl('extrude', 0)
    const dt = await dlgText()
    ok('timeline double-click opens the extrude edit', /拉伸/.test(dt), { dlg: dt.slice(0, 120) })
    const inp = page.locator('.cmd-palette label', { hasText: /距離|高度/ }).locator('input:visible').first()
    await typeInto(inp, '20'); await commitField(inp)
    await clickOk()
    const v2 = (await expectVol('edited to 20 (cut still through)', 24000 - Math.PI * 25 * 20, 0.02)).total
    await undoRedo(vc, v2)
    // error: distance 0
    await startSketchOn('XY'); await drawRect('XY', [-15, -10], [-8, 10]); await finishSketch()
    await ribbon('extrude')
    await page.keyboard.press('Control+a'); await page.keyboard.type('0'); await W(500)
    const dis = await okBtn().isDisabled()
    await okBtn().click({ force: true }).catch(() => {}); await W(600)
    ok('distance 0 cannot be committed', dis, { dis })
    await errorMsg('extrude 0', /距離不可為 0/)
    await page.keyboard.press('Escape')
  })

  // ════════════════ 1b. 拉伸 切除·貫通 穿板（測試員 P1）════════════════
  await run('extrude-plate', '拉伸 切除·貫通 穿板', async () => {
    await build([{ id: 'p1', type: 'extrude', profile: { kind: 'rect', a: [-30, -20], b: [30, 20] }, height: 8, operation: 'new' }])   // 19200
    await ribbon('sketch'); await clickCad([20, -12, 8]); await W(1500)
    const sk = await S(() => { const s = window.useApp.getState(); return [s.mode, s.sketchPlane, s.sketchBaseZ, !!s.sketchArb] })
    ok('sketch opened on the plate top face', sk[0] === 'sketch' && (sk[3] || sk[2] === 8), { sk })
    await skTool('sk_circle'); await clickCad([15, -8, 8]); await clickCad([20, -8, 8])
    await finishSketch()
    await ribbon('extrude')
    await selectIn('拉伸操作', 'cut'); await selectIn('拉伸範圍', 'through'); await W(600)
    await tradOnly('extrude cut panel', await dlgText())
    await clickOk()
    const v = await vol()
    ok('切除·貫通 drills through the 8 mm plate', near(v.total, 19200 - Math.PI * 25 * 8, 0.01), { v, status: await statusBar() })
    await tradOnly('cut status', await statusBar())
    cur.vol = v.total
    // negative distance shows the flip instead of silently flipping
    await startSketchOn('XY'); await drawRect('XY', [-25, -15], [-15, -5]); await finishSketch()
    await ribbon('extrude'); await page.keyboard.press('Control+a'); await page.keyboard.type('-5', { delay: 80 }); await W(500)
    const note = await S(() => document.querySelector('[data-testid="extrude-flip-note"]')?.textContent || '')
    ok('extrude -5 shows a ⇅ reverse-direction note', /反方向/.test(note), { note })
    await page.keyboard.press('Escape')
  })

  const BOX = [{ id: 'b1', type: 'extrude', profile: { kind: 'rect', a: [-20, -15], b: [20, 15] }, height: 10, operation: 'new' }]   // 40×30×10 = 12000
  const prompt = () => page.locator('[role=dialog][aria-modal=true]').last()
  const answerPrompt = async (txt) => { const d = prompt(); await d.waitFor({ timeout: 5000 }); const i = d.locator('input,textarea').first(); await i.fill(''); await i.pressSequentially(String(txt), { delay: 50 }); await d.locator('.cmd-ok').click(); await W(500) }
  const hasPalette = async () => (await page.locator('.cmd-palette:visible').count()) > 0
  const previewCheck = async (label, sig0, key) => {
    await waitIdle()
    const sig = await sceneSig()
    const pv = key ? await meshVol(key) : null
    ok(`${label}: preview present`, sig !== sig0 || pv != null, { pv })
    return pv
  }
  const previewMatches = async (pv, v, label = 'preview volume == result volume') => ok(label, pv != null && near(pv, v, 0.02), { pv, v })
  const featCount = () => S(() => window.useApp.getState().features.length)
  const genericPreview = 'editPreviewMesh'

  // ════════════════ 2. 旋轉 Revolve ════════════════
  await run('revolve', '旋轉 Revolve', async () => {
    await frame()
    await startSketchOn('XZ')
    await drawRect('XZ', [10, 0], [20, 30])
    await finishSketch()
    const sig0 = await sceneSig()
    await ribbon('revolve')
    ok('revolve dialog open', (await st()).featDlg === 'revolve')
    await page.locator('.cmd-palette button.cs-btn', { hasText: /^Z$/ }).first().click(); await W(300)
    await typeField(/^角度/, '180'); await commitField(field(/^角度/))
    await previewCheck('revolve', sig0)
    const sym = page.locator('.cmd-palette label', { hasText: /兩側對稱|两侧对称/ }).locator('input[type=checkbox]').first()
    await sym.check(); await W(300); const s1 = await S(() => window.useApp.getState().featDlg?.params?.sym)
    await sym.uncheck(); await W(300)
    ok('兩側對稱 toggles', +s1 === 1 && +(await S(() => window.useApp.getState().featDlg?.params?.sym)) === 0)
    await tradOnly('revolve panel', await dlgText())
    await clickOk()
    const v1 = (await expectVol('revolve 180°', Math.PI * 300 * 30 / 2, 0.02)).total
    await timelineDbl('revolve')
    ok('timeline double-click opens 編輯 · 旋轉', /旋轉/.test(await dlgText()))
    await typeField(/^角度/, '0'); await commitField(field(/^角度/)); await W(300)
    ok('angle 0 cannot be committed', await okBtn().isDisabled())
    await errorMsg('revolve angle 0', /角度/)
    await typeField(/^角度/, '270.5'); await commitField(field(/^角度/))
    await clickOk()
    const v2 = (await expectVol('edited to 270.5°', Math.PI * 300 * 30 * 270.5 / 360, 0.02)).total
    await undoRedo(v1, v2)
    // error: profile crossing the axis
    await startSketchOn('XZ'); await drawRect('XZ', [-5, 35], [8, 45]); await finishSketch()
    const n0 = await featCount()
    await ribbon('revolve')
    await page.locator('.cmd-palette button.cs-btn', { hasText: /^Z$/ }).first().click(); await W(300)
    await okBtn().click().catch(() => {}); await waitIdle()
    await errorMsg('revolve crossing axis', /軸/)
    ok('no silent failure (no feature added or flagged)', (await featCount()) === n0 || (await st()).failed.length > 0, await st())
  })

  // ════════════════ 3. 掃掠 Sweep ════════════════
  await run('sweep', '掃掠 Sweep', async () => {
    await frame()
    await startSketchOn('XY'); await drawPoly('XY', [[0, 0], [40, 0], [40, 30]]); await finishSketch()
    await startSketchOn('YZ'); await drawCircle('YZ', [0, 0], 5); await finishSketch()   // r=5：避開 1 mm 以外嘅格點吸附
    const rows = page.locator('.tree-row', { hasText: /獨立/ })
    ok('two standalone sketches in the browser', (await rows.count()) >= 2, { n: await rows.count() })
    await rows.nth(0).click(); await W(300)   // path sketch selected in the browser
    const sig0 = await sceneSig()
    await ribbon('sweep')
    ok('sweep dialog open', await S(() => window.useApp.getState().sweepDlgOpen))
    const prof = page.locator('.cmd-palette button', { hasText: /草圖輪廓/ }).first()
    if (await prof.count()) { await prof.click(); await W(300) }
    await rows.nth(1).click(); await W(300)
    await clickCad([0, 5, 0]); await W(400)   // click the circle in the viewport
    await previewCheck('sweep', sig0)
    await tradOnly('sweep panel', await dlgText())
    await clickOk()
    const v1 = (await expectVol('sweep Ø10 along 40+30 L', Math.PI * 25 * 70, 0.06)).total
    await timelineDbl('sweep')
    const d = await dlgText()
    ok('timeline double-click opens 編輯 · 掃掠', /掃掠/.test(d), { d: d.slice(0, 160) })
    const tw = field(/扭轉/)
    if (await tw.count()) { await typeInto(tw, '45'); await commitField(tw) }
    await clickOk()
    const v2 = (await vol()).total
    ok('edit applied (twist keeps volume, feature rebuilt)', near(v2, v1, 0.05) && !(await st()).failed.length, { v2, v1, st: await st() })
    await undoRedo(v1, v2)
    // error: sweep with nothing to sweep
    await fresh(); await ribbon('sweep'); await W(400)
    await okBtn().click().catch(() => {}); await waitIdle()
    await errorMsg('sweep without path', /路徑|輪廓|截面/)
  })

  // ════════════════ 4. 放樣 Loft ════════════════
  await run('loft', '放樣 Loft', async () => {
    await frame()
    await startSketchOn('XY'); await drawRect('XY', [-20, -20], [20, 20]); await finishSketch()
    // second section on a 40 mm offset plane (CONSTRUCT ▸ 偏移平面 equivalent), circle drawn with the mouse
    await S(() => window.useApp.getState().sketchOnDatumPlane('XY', 40)); await W(1200)
    await drawCircle('XY', [0, 0], 15); await finishSketch()
    await frame()
    await ribbon('loft')
    await page.waitForFunction(() => { const s = window.useApp.getState(); return !s.loftPreviewBusy && !!s.loftPreview }, null, { timeout: 60000 }).catch(() => {})
    await W(500)
    const pv = await S(() => window.useApp.getState().loftPreview?.volume ?? null)
    ok('loft preview present', pv != null && pv > 0, { pv })
    await tradOnly('loft panel', await dlgText())
    const ruled = page.locator('.cmd-palette label', { hasText: /直紋/ }).locator('input[type=checkbox]').first()
    if (await ruled.count()) { await ruled.check(); await W(300); await ruled.uncheck(); await W(300) }
    await page.waitForFunction(() => { const s = window.useApp.getState(); return !s.loftPreviewBusy && !!s.loftPreview }, null, { timeout: 60000 }).catch(() => {})
    const pv2 = await S(() => window.useApp.getState().loftPreview?.volume ?? null)
    await clickOk()
    const A1 = 1600, A2 = Math.PI * 225
    const v1 = (await expectVol('loft square→circle', 40 / 6 * (A1 + A2 + 2 * (A1 + A2)), 0.06)).total
    await previewMatches(pv2, v1)
    await timelineDbl('loft')
    ok('timeline double-click opens 編輯 · 放樣', /放樣/.test(await dlgText()))
    const wall = field(/薄壁|壁厚/)
    if (await wall.count()) { await typeInto(wall, '1.5'); await commitField(wall) }
    await page.waitForFunction(() => !window.useApp.getState().loftPreviewBusy, null, { timeout: 60000 }).catch(() => {})
    await clickOk()
    const v2 = (await vol()).total
    ok('edit to thin wall 1.5 reduces volume', v2 > 0 && v2 < v1 * 0.6, { v2, v1 })
    await undoRedo(v1, v2)
    await fresh(); await startSketchOn('XY'); await drawRect('XY', [-10, -10], [10, 10]); await finishSketch()
    await ribbon('loft')
    await errorMsg('loft with one section', /≥2|兩個|2 個|截面/)
  })

  // ════════════════ 5. 浮雕 Emboss ════════════════
  await run('emboss', '浮雕 Emboss', async () => {
    await build(BOX)
    const v0 = (await vol()).total
    const sig0 = await sceneSig()
    await ribbon('emboss')
    await clickCad([0, 0, 10]); await W(800)
    const pal = await hasPalette()
    ok('emboss opens a command panel after picking the face (not a chain of prompts)', pal, { status: await statusBar() })
    if (pal) {
      await typeField(/文字/, 'AB'); await typeField(/深度/, '1.5'); await typeField(/字高/, '12')
      await previewCheck('emboss', sig0, genericPreview)
      await tradOnly('emboss panel', await dlgText())
      const pv = await meshVol(genericPreview)
      await clickOk()
      const v1 = (await vol()).total
      ok('emboss adds material', v1 > v0 + 20, { v0, v1 })
      await previewMatches(pv, v1)
      cur.vol = v1
      await timelineDbl('text')
      ok('timeline double-click opens 編輯 · 浮雕', /浮雕/.test(await dlgText()))
      await selectIn('浮雕類型', 'engrave'); await W(600); await clickOk()
      const v2 = (await vol()).total
      ok('edit 凸起 → 刻入 cuts', v2 < v0, { v2, v0 })
      await undoRedo(v1, v2)
      await ribbon('emboss'); await clickCad([0, 0, 10]); await W(800)
      await typeField(/文字/, 'X'); await typeField(/深度/, '0')
      ok('depth 0 cannot be committed', await okBtn().isDisabled())
      await errorMsg('emboss depth 0', /深度/)
      await typeField(/深度/, '1'); const tx = page.locator('.cmd-palette input[aria-label="浮雕文字"]').first(); await tx.fill(''); await W(400)
      ok('empty text cannot be committed', await okBtn().isDisabled())
      await errorMsg('emboss empty text', /文字/)
    } else {
      // legacy prompts
      if (await prompt().count()) { await answerPrompt('AB'); await answerPrompt('1.5'); await answerPrompt('12') }
      await waitIdle(); cur.vol = (await vol()).total
    }
  })

  // ════════════════ 6. 孔 Hole ════════════════
  await run('hole', '孔 Hole', async () => {
    await build(BOX)
    const sig0 = await sceneSig()
    await ribbon('hole')
    await clickCad([5, -3, 10]); await W(800)
    const pick = await S(() => window.useApp.getState().holePos)
    ok('clicking the top face places the hole', !!pick, { pick })
    const dfld = page.locator('.cmd-palette input[title^="孔徑"]').first()
    await typeInto(dfld, '6.5'); await commitField(dfld)
    const thr = page.locator('.cmd-palette label', { hasText: /貫通/ }).locator('input[type=checkbox]').first()
    await thr.check(); await W(400)
    await previewCheck('hole', sig0)
    await tradOnly('hole panel', await dlgText())
    await clickOk()
    const v1 = (await expectVol('Ø6.5 through 10', 12000 - Math.PI * 6.5 * 6.5 / 4 * 10, 0.01)).total
    await timelineDbl('hole')
    ok('timeline double-click opens 編輯孔', /孔/.test(await dlgText()))
    const d2 = page.locator('.cmd-palette input[title^="孔徑"]').first()
    await typeInto(d2, '10'); await commitField(d2)
    await clickOk()
    const v2 = (await expectVol('edited Ø10', 12000 - Math.PI * 25 * 10, 0.01)).total
    await undoRedo(v1, v2)
    await ribbon('hole'); await clickCad([-10, 5, 10]); await W(600)
    const d3 = page.locator('.cmd-palette input[title^="孔徑"]').first()
    await typeInto(d3, '0'); await page.keyboard.press('Tab'); await W(400)
    ok('Ø0 cannot be committed', await okBtn().isDisabled())
    await errorMsg('hole Ø0', /孔徑|Ø/)
    // deep blind hole: depth 30 in a 10 mm plate → warning (result equals a through hole)
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Control+a'); await page.keyboard.type('5', { delay: 60 }); await page.keyboard.press('Tab'); await W(300)
    const nxt = page.locator('.cmd-palette label', { hasText: /到下一面/ }).locator('input[type=checkbox]').first()
    if (await nxt.isChecked().catch(() => false)) { await nxt.uncheck(); await W(300) }
    const dep = page.locator('.cmd-palette input[title^="孔深"]').first()
    await typeInto(dep, '30'); await page.keyboard.press('Tab'); await W(500)
    const warn = await S(() => document.querySelector('[data-testid="hole-deep-warning"]')?.textContent || '')
    ok('blind depth 30 > 10 mm body shows a deep-hole warning', /超過/.test(warn), { warn })
    await tradOnly('hole deep warning', warn)
  })

  // ════════════════ 7. 圓柱 / 圓錐 primitive ════════════════
  await run('cylinder', '圓柱／圓錐 primitive', async () => {
    await page.locator('[data-testid="quick-tool-caret-box"]:visible').first().click(); await W(250)
    const fly = await S(() => [...document.querySelectorAll('[data-testid="quick-tool-menu-box"] [data-cmd]')].map((b) => [b.getAttribute('data-cmd'), b.textContent.trim(), b.querySelector('svg')?.innerHTML.length ?? 0]))
    await page.keyboard.press('Escape'); await W(200)
    const cyl = fly.find((x) => x[0] === 'cylinder'), cone = fly.find((x) => x[0] === 'cone')
    ok('primitive flyout: 圓柱 and 圓錐 are separate entries with their own labels/icons', !!cyl && /圓柱/.test(cyl[1]) && !!cone && /圓錐/.test(cone[1]) && cyl[2] !== cone[2], { fly })
    await ribbon('cylinder')
    ok('cylinder dialog open', (await st()).featDlg === 'cylinder')
    const inputs = page.locator('.cmd-palette input:visible')
    await typeInto(inputs.nth(0), '12.5'); await commitField(inputs.nth(0))
    await typeInto(inputs.nth(1), '20'); await commitField(inputs.nth(1))
    await W(800)
    const pv = await previewCheck('cylinder', '', genericPreview)
    await tradOnly('cylinder panel', await dlgText())
    await clickOk()
    const v1 = (await expectVol('cylinder Ø12.5×20', Math.PI * 12.5 * 12.5 / 4 * 20, 0.01)).total
    await previewMatches(pv, v1)
    // cone from the ▾ flyout, op ⬡新實體
    await ribbon('cone')
    ok('cone dialog open from 圓柱 ▾', (await st()).featDlg === 'cone')
    await typeField(/底Ø/, '30'); await typeField(/頂Ø/, '0'); await typeField(/^高/, '15'); await commitField(field(/^高/))
    await clickOk()
    // union (cone overlapping the cylinder at the origin) ≈ 4659.2, or a separate body (UX3 placement) = cyl + cone
    const vv = await vol(), coneV = Math.PI * 225 * 15 / 3
    ok('+ cone Ø30×15 built (union or separate body)', near(vv.total, 4659.2, 0.02) || near(vv.total, v1 + coneV, 0.02), { vv })
    await tradOnly('cone status', await statusBar())
    const v2 = vv.total
    const chips = await S(() => window.useApp.getState().features.map((f) => f.type))
    try { await timelineDbl(chips[0]) } catch { /* */ }
    const pal = await hasPalette()
    ok('timeline double-click on the cylinder opens its dialog', pal && /圓柱/.test(await dlgText()), { chips })
    if (pal) { const i0 = page.locator('.cmd-palette input:visible').nth(1); await typeInto(i0, '30'); await commitField(i0); await clickOk() }
    const v3 = (await vol()).total
    ok('cylinder edited to h=30 (volume grew)', v3 > v2 + 1000, { v3, v2 })
    await undoRedo(v2, v3)
    await ribbon('cylinder'); const i1 = page.locator('.cmd-palette input:visible').nth(0); await typeInto(i1, '0'); await commitField(i1)
    ok('Ø0 cannot be committed', await okBtn().isDisabled())
    await errorMsg('cylinder Ø0', /尺寸|大於|Ø|直徑/)
  })

  // ════════════════ 8. 陣列 Pattern ════════════════
  await run('pattern', '陣列 Pattern（矩形／環形／路徑）', async () => {
    await build([{ id: 'b1', type: 'extrude', profile: { kind: 'rect', a: [0, 0], b: [10, 10] }, height: 5, operation: 'new' }])
    await ribbon('pattern')
    await typeField(/^X數量/, '3'); await typeField(/^X間距/, '12.5'); await typeField(/^Y數量/, '2'); await typeField(/^Y間距/, '15'); await commitField(field(/^Y間距/))
    const pv = await previewCheck('rect pattern', '', genericPreview)
    await tradOnly('pattern panel', await dlgText())
    await clickOk()
    const v1 = (await expectVol('3×2 rect pattern of 500', 3000, 0.01)).total
    await previewMatches(pv, v1)
    await timelineDbl('pattern')
    ok('timeline double-click opens 編輯 · 矩形陣列', /陣列/.test(await dlgText()))
    await typeField(/^X數量/, '4'); await commitField(field(/^X數量/)); await clickOk()
    const v2 = (await expectVol('edited to 4×2', 4000, 0.01)).total
    await undoRedo(v1, v2)
    // circular pattern from the ▾ flyout
    await fresh(); await build([{ id: 'b1', type: 'extrude', profile: { kind: 'rect', a: [20, -2], b: [30, 2] }, height: 5, operation: 'new' }])
    await ribbon('circpattern')
    await selectIn(/^軸/, 'Z').catch(() => {})
    await typeField(/^數量/, '6'); await commitField(field(/^數量/))
    const pvc = await previewCheck('circular pattern', '', genericPreview)
    await clickOk()
    const vc = (await expectVol('circular ×6 of 200', 1200, 0.02)).total
    await previewMatches(pvc, vc, 'circular preview == result')
    // error: X數量 0
    await ribbon('pattern'); await typeField(/^X數量/, '0'); await commitField(field(/^X數量/))
    ok('count 0 cannot be committed', await okBtn().isDisabled())
    await errorMsg('pattern count 0', /數量|大於|至少|整數/)
    await typeField(/^X數量/, '3'); await typeField(/^X間距/, '5'); await commitField(field(/^X間距/)); await W(400)
    const ov = await S(() => document.querySelector('[data-testid="pattern-overlap-warning"]')?.textContent || '')
    ok('spacing smaller than the body shows an overlap warning', /重疊/.test(ov), { ov })
    await tradOnly('pattern overlap warning', ov)
    await typeField(/^X間距/, '0'); await commitField(field(/^X間距/)); await W(300)
    ok('spacing 0 cannot be committed', await okBtn().isDisabled())
    await errorMsg('pattern spacing 0', /間距/)
  })

  // ════════════════ 9. 鏡像 Mirror ════════════════
  await run('mirror', '鏡像 Mirror', async () => {
    await build([{ id: 'b1', type: 'extrude', profile: { kind: 'rect', a: [5, -10], b: [25, 10] }, height: 8, operation: 'new' }])   // 3200
    await ribbon('mirror')
    await selectIn(/^鏡像面/, 'YZ')
    await previewCheck('mirror', '', genericPreview)
    const chk = page.locator('.cmd-palette label', { hasText: /鏡像出獨立實體/ }).locator('input').first()
    await chk.check(); await W(300); await chk.uncheck(); await W(300)
    await tradOnly('mirror panel', await dlgText())
    const pv = await meshVol(genericPreview)
    await clickOk()
    const v1 = (await expectVol('mirror across YZ', 6400, 0.01)).total
    await previewMatches(pv, v1)
    await timelineDbl('mirror')
    ok('timeline double-click opens 編輯 · 鏡像', /鏡像/.test(await dlgText()))
    await typeField(/^偏移/, '2.5'); await commitField(field(/^偏移/)); await clickOk()
    const v2 = (await vol()).total
    ok('edit offset 2.5 → rebuilt, two disjoint halves 6400', near(v2, 6400, 0.01) && !(await st()).failed.length, { v2 })
    await undoRedo(v1, v2)
    await ribbon('mirror'); await selectIn(/^鏡像面/, 'YZ'); await typeField(/^偏移/, '15'); await commitField(field(/^偏移/))
    await clickOk()
    await errorMsg('mirror overlapping/self (offset 15 overlaps)', /鏡像|重疊|合併|已/)
  })

  // ════════════════ 10. 加厚 Thicken ════════════════
  await run('thicken', '加厚 Thicken', async () => {
    await build(BOX)
    const sig0 = await sceneSig()
    await ribbon('thicken')
    await clickCad([0, 0, 10]); await W(800)
    const pal = await hasPalette()
    ok('thicken opens a command panel (not a prompt)', pal, { status: await statusBar() })
    if (pal) {
      await typeField(/厚度|板厚/, '2.5'); await commitField(field(/厚度|板厚/))
      await previewCheck('thicken', sig0, genericPreview)
      await tradOnly('thicken panel', await dlgText())
      const pv = await meshVol(genericPreview)
      await clickOk()
      const v1 = (await expectVol('thicken top 2.5 (new body)', 12000 + 1200 * 2.5, 0.01)).total
      await previewMatches(pv, v1)
      await timelineDbl('thickenface')
      ok('timeline double-click opens 編輯 · 加厚', /加厚/.test(await dlgText()))
      await typeField(/厚度|板厚/, '4'); await commitField(field(/厚度|板厚/)); await clickOk()
      const v2 = (await expectVol('edited to 4', 12000 + 4800, 0.01)).total
      await undoRedo(v1, v2)
      await ribbon('thicken'); await clickCad([0, 0, 14]); await W(800)
      await typeField(/厚度|板厚/, '0'); await commitField(field(/厚度|板厚/))
      ok('0 cannot be committed', await okBtn().isDisabled().catch(() => false))
      await errorMsg('thicken 0', /厚度|大於/)
    } else if (await prompt().count()) { await answerPrompt('2.5'); await waitIdle(); cur.vol = (await vol()).total }
  })

  // ════════════════ 11. 按拉 Press Pull ════════════════
  await run('presspull', '按拉 Press Pull', async () => {
    await build(BOX)
    const sig0 = await sceneSig()
    await ribbon('presspull')
    await clickCad([0, 0, 10]); await W(800)
    const n = await S(() => window.useApp.getState().pushPullPicks.length)
    ok('top face picked', n === 1, { n })
    const f = field(/^距離/)
    await typeInto(f, '5.5'); await commitField(f)
    await previewCheck('presspull', sig0)
    await tradOnly('presspull panel', await dlgText())
    await clickOk()
    const v1 = (await expectVol('pull top +5.5', 1200 * 15.5, 0.01)).total
    const t = await S(() => window.useApp.getState().features.at(-1)?.type)
    try { await timelineDbl(t) } catch { /* */ }
    const pal = await hasPalette()
    ok('timeline double-click reopens press pull / offset face', pal, { t })
    if (pal) { const g = field(/距離/); await typeInto(g, '-3'); await commitField(g); await clickOk() }
    const v2 = (await vol()).total
    ok('edited to -3', near(v2, 1200 * 7, 0.01), { v2 })
    await undoRedo(v1, v2)
    await ribbon('presspull'); await clickCad([0, 0, await S(() => { const m = window.useApp.getState().bodyMesh; let z = -1e9; for (let i = 2; i < m.vertices.length; i += 3) z = Math.max(z, m.vertices[i]); return z })]); await W(600)
    const g2 = field(/^距離/); await typeInto(g2, '-50'); await commitField(g2)
    await okBtn().click().catch(() => {}); await waitIdle()
    await errorMsg('press pull -50 (through the body)', /太|超過|失敗|無法|唔/)
  })

  // ════════════════ 12. 圓角 Fillet (+倒角) ════════════════
  await run('fillet', '圓角 Fillet（＋倒角）', async () => {
    await build(BOX)
    await ribbon('fillet')
    await clickCad([0, -15, 9.9]); await W(800)   // top front edge
    const n = await S(() => window.useApp.getState().edgeRoundPicks.length)
    ok('edge picked by clicking it', n >= 1, { n })
    const r = page.locator('input[aria-label="半徑組 1 半徑"], input[title="半徑組 1 半徑"]').first()
    await typeInto(r, '2.5'); await commitField(r)
    await waitIdle()
    const pv = await meshVol('roundPreviewMesh')
    ok('fillet preview present', pv != null, { pv })
    await tradOnly('fillet panel', await dlgText())
    await clickOk()
    const exp = 12000 - (1 - Math.PI / 4) * 2.5 * 2.5 * 40
    const v1 = (await expectVol('R2.5 on a 40 mm edge', exp, 0.005)).total
    await previewMatches(pv, v1)
    await timelineDbl('fillet')
    ok('timeline double-click opens 編輯 · 圓角', /圓角/.test(await dlgText()))
    const rf = page.locator('.cmd-palette label', { hasText: /半徑/ }).locator('input:visible').first()
    await typeInto(rf, '4'); await commitField(rf); await clickOk()
    const v2 = (await expectVol('edited R4', 12000 - (1 - Math.PI / 4) * 16 * 40, 0.005)).total
    await undoRedo(v1, v2)
    // 倒角 from the ▾ flyout on the opposite edge
    await ribbon('chamfer')
    await tradOnly('chamfer panel', await dlgText())
    await clickCad([0, 15, 9.9]); await W(800)
    const c = page.locator('input[title^="倒角距離"]').first()
    await typeInto(c, '1.5'); await commitField(c); await waitIdle()
    const pvc = await meshVol('roundPreviewMesh')
    await clickOk()
    const v3 = (await expectVol('+ chamfer 1.5', v2 - 1.5 * 1.5 / 2 * 40, 0.01)).total
    await previewMatches(pvc, v3, 'chamfer preview == result')
    // error: radius too large
    await ribbon('fillet'); await clickCad([-20, 0, 9.9]); await W(800)
    const r3 = page.locator('input[aria-label="半徑組 1 半徑"], input[title="半徑組 1 半徑"]').first()
    await typeInto(r3, '30'); await commitField(r3); await waitIdle()
    await errorMsg('fillet R30 too large', /太大|減小|超過/)
  })

  // ════════════════ 12b. tester case: shelled revolved flanged cup, chamfer flange outer top edge ════════════════
  await run('chamfer-cup', '倒角（抽殼法蘭杯，測試員個案）', async () => {
    await build([{ id: 'r', type: 'revolve', profile: { kind: 'poly', pts: [[0, 0], [30, 0], [30, 35], [40, 35], [40, 40], [0, 40]] }, angle: 360, axis: 'Y', op: 'new' }, { id: 's', type: 'shell', thickness: 2, nears: [[10, 40, 0]], tangentChain: false, direction: 'inside' }], 'cup')
    await page.evaluate(() => { const { camera, controls } = window.__three; controls.target.set(0, 0, -30); camera.position.set(110, 130, -230); camera.lookAt(0, 0, -30); controls.update() })
    await W(600)
    const v0 = (await vol()).total
    await ribbon('chamfer')
    const a = Math.PI / 3, rr = 39.7
    await mouseClick(await page.evaluate(([x, y, z]) => { const { camera } = window.__three; const c = document.querySelector('canvas').getBoundingClientRect(); const v = camera.position.clone().set(x, y, z).project(camera); return [c.left + (v.x + 1) / 2 * c.width, c.top + (1 - v.y) / 2 * c.height] }, [rr * Math.cos(a), 40, -rr * Math.sin(a)]))
    await W(1200)
    const pick = await S(() => { const s = window.useApp.getState(); const ln = s.edgeRoundPickLines[0]; return { n: s.edgeRoundPicks.length, r: ln ? Math.hypot(ln[0][0], ln[0][2]) : null } })
    ok('flange outer top edge (R40) picked', pick.n === 1 && Math.abs(pick.r - 40) < 0.1, pick)
    const c = page.locator('input[title^="倒角距離"]').first()
    await typeInto(c, '1'); await commitField(c); await waitIdle()
    const pv = await S(() => { const s = window.useApp.getState(); return { ok: !!s.roundPreviewMesh, fail: s.roundPreviewFail } })
    ok('1 mm chamfer previews (flange 5 thick)', pv.ok && !pv.fail, { ...pv, status: await statusBar() })
    const pvv = await meshVol('roundPreviewMesh')
    await clickOk()
    const v1 = (await vol()).total
    const removed = 0.5 * 1 * 1 * 2 * Math.PI * (40 - 1 / 3)
    ok('chamfer REMOVES material (volume goes down by ≈ ring triangle)', v1 < v0 && near(v0 - v1, removed, 0.15), { v0, v1, removed, status: await statusBar() })
    await previewMatches(pvv, v1)
    cur.vol = v1
  })

  // ════════════════ 13. 抽殼 Shell ════════════════
  await run('shell', '抽殼 Shell', async () => {
    await build(BOX)
    await ribbon('shell')
    await clickCad([0, 0, 10]); await W(800)
    const n = await S(() => window.useApp.getState().shellPicks.length)
    ok('top face picked as opening', n === 1, { n })
    const t = page.locator('input[title="抽殼壁厚"]').first()
    await typeInto(t, '1.5'); await commitField(t); await waitIdle()
    const pv = await meshVol('shellPreviewMesh')
    ok('shell preview present', pv != null, { pv })
    await tradOnly('shell panel', await dlgText())
    await selectIn(/^方向/, 'outside'); await selectIn(/^方向/, 'inside'); await waitIdle()
    const pv2 = await meshVol('shellPreviewMesh')
    await clickOk()
    const exp = 12000 - 37 * 27 * 8.5
    const v1 = (await expectVol('shell 1.5 open top', exp, 0.01)).total
    await previewMatches(pv2, v1)
    await timelineDbl('shell')
    ok('timeline double-click opens 編輯 · 抽殼', /抽殼/.test(await dlgText()))
    const t2 = page.locator('.cmd-palette label', { hasText: /壁厚|厚度/ }).locator('input:visible').first()
    await typeInto(t2, '2'); await commitField(t2); await clickOk()
    const v2 = (await expectVol('edited 2', 12000 - 36 * 26 * 8, 0.01)).total
    await undoRedo(v1, v2)
    await ribbon('shell'); await clickCad([0, -15, 5]); await W(600)
    const t3 = page.locator('input[title="抽殼壁厚"]').first(); await typeInto(t3, '20'); await commitField(t3); await waitIdle()
    await okBtn().click().catch(() => {}); await waitIdle()
    await errorMsg('shell 20 (thicker than the part)', /壁厚|太|失敗|無法/)
  })

  // ════════════════ 14. 合併/切割 Combine ════════════════
  await run('combine', '合併／切割 Combine', async () => {
    await build([...BOX, { id: 'c1', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: 5 }, height: 30, baseZ: -10, operation: 'newbody' }])
    const b = await vol()
    ok('precondition: two bodies', b.bodies === 2, b)
    await ribbon('combine')
    ok('combine dialog open', (await st()).featDlg === 'combine', { status: await statusBar() })
    const tool = page.locator('.cmd-palette label input[type=checkbox]').first()
    await tool.check(); await W(300)
    await selectIn(/操作|運算/, 'cut').catch(() => {})
    const pv = await previewCheck('combine', '', genericPreview)
    await tradOnly('combine panel', await dlgText())
    await clickOk()
    const v1 = (await expectVol('box − Ø10 cylinder', 12000 - Math.PI * 25 * 10, 0.01)).total
    await previewMatches(pv, v1)
    const t = await S(() => window.useApp.getState().features.at(-1)?.type)
    try { await timelineDbl(t) } catch { /* */ }
    const pal = await hasPalette()
    ok('timeline double-click reopens combine', pal, { t })
    if (pal) { await selectIn(/操作|運算/, 'fuse').catch(() => {}); await clickOk() }
    const v2 = (await vol()).total
    ok('edited to 合併 (join)', near(v2, 12000 + Math.PI * 25 * 20, 0.01), { v2 })
    await undoRedo(v1, v2)
    await fresh(); await build(BOX); await ribbon('combine')
    await errorMsg('combine with a single body', /工具體|新實體/)
  })

  // ════════════════ 15. 分割實體 Split Body ════════════════
  await run('splitbody', '分割實體 Split Body', async () => {
    await build(BOX)
    await ribbon('splitbody')
    await selectIn(/^軸/, 'X')
    await typeField(/^位置/, '7.5'); await commitField(field(/^位置/))
    const pv = await previewCheck('split', '', genericPreview)
    await tradOnly('split panel', await dlgText())
    await clickOk()
    const v1 = await vol()
    ok('split into two bodies, total kept', v1.bodies === 2 && near(v1.total, 12000, 0.01), v1)
    cur.vol = v1.total
    await previewMatches(pv, v1.active, 'preview volume == active-body volume after split')
    const t = await S(() => window.useApp.getState().features.at(-1)?.type)
    try { await timelineDbl(t) } catch { /* */ }
    const pal = await hasPalette()
    ok('timeline double-click reopens split', pal, { t })
    if (pal) { await typeField(/^位置/, '-5'); await commitField(field(/^位置/)); await clickOk() }
    const v2 = await vol()
    ok('edited position -5: active (high side) = 25×30×10', near(v2.active, 7500, 0.01) || near(v2.active, 4500, 0.01), v2)
    await undoRedo(v1.total, v2.total)
    await ribbon('splitbody'); await selectIn(/^軸/, 'X'); await typeField(/^位置/, '100'); await commitField(field(/^位置/))
    await okBtn().click().catch(() => {}); await waitIdle()
    await errorMsg('split plane outside the body', /外|未|唔|無法|沒有/)
  })

  // ════════════════ 16. 移動/複製 Move/Copy ════════════════
  await run('move', '移動／複製 Move/Copy', async () => {
    await build(BOX)
    await ribbon('move')
    await typeField(/^dx/, '12.5'); await typeField(/^dz/, '5'); await commitField(field(/^dz/))
    await previewCheck('move', '')
    await tradOnly('move panel', await dlgText())
    const copy = page.locator('.cmd-palette label', { hasText: /建立副本/ }).locator('input').first()
    await copy.check(); await W(300)
    await clickOk()
    const v1 = await vol()
    ok('copy moved by 12.5/5 → two bodies 24000', v1.bodies >= 1 && near(v1.total, 24000, 0.01), v1)
    cur.vol = v1.total
    const t = await S(() => window.useApp.getState().features.at(-1)?.type)
    try { await timelineDbl(t) } catch { /* */ }
    const pal = await hasPalette()
    ok('timeline double-click reopens move', pal, { t })
    if (pal) { await typeField(/^dx/, '50'); await commitField(field(/^dx/)); await clickOk() }
    const bb = await S(() => { const m = window.useApp.getState().bodyMesh; let x = -1e9; const all = [m, ...(m.parked ?? [])]; for (const q of all) for (let i = 0; i < q.vertices.length; i += 3) x = Math.max(x, q.vertices[i]); return x })
    ok('edited dx 50 → copy max-x 70', Math.abs(bb - 70) < 0.5, { bb })
    await undoRedo(v1.total, (await vol()).total)
    await ribbon('move'); await typeField(/^dx/, 'abc'); await commitField(field(/^dx/))
    ok('non-numeric dx cannot be committed', await okBtn().isDisabled())
    { const s0 = (await statusBar()) + ' | ' + (await S(() => [...document.querySelectorAll('.cmd-palette [role=alert], .toast')].map((e) => e.innerText).join(' | '))); ok('move dx abc: clear message', /數值|無效|非法|數字/.test(s0), { s0 }); await tradOnly('move dx abc (typed input excluded)', s0.replace(/abc/g, '')) }
  })

  // ════════════════ summary ════════════════
  const ICON = (r) => (r.checks.length && r.checks.every((c) => c.pass) ? 'PASS' : 'FAIL')
  const prev = existsSync(`${OUT}/${MD}`) ? readFileSync(`${OUT}/${MD}`, 'utf8') : ''
  const lines = [`## CORE16 e2e run ${new Date().toISOString()}`, '', '| # | 命令 | 結果 | 體積 mm³ | 檢查 (pass/total) | 失敗項 | 截圖 |', '|---|---|---|---|---|---|---|']
  rows.forEach((r, i) => {
    const f = r.checks.filter((c) => !c.pass)
    lines.push(`| ${i + 1} | ${r.title} | ${ICON(r)} | ${r.vol ?? '—'} | ${r.checks.length - f.length}/${r.checks.length} | ${f.map((c) => c.name + (c.info ? ' `' + JSON.stringify(c.info).slice(0, 160) + '`' : '')).join('<br>') || '—'} | evidence/core16-${r.cmd}.png |`)
  })
  writeFileSync(`${OUT}/${MD}`, lines.join('\n') + '\n\n' + prev)
  console.log(lines.join('\n'))
})
