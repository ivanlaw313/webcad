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
  // CORE16：新拉伸對話框內核預覽 — 等「即時預覽 · 體積」行出現（量由最後一下輸入起計）
  const xPreview = async (label) => {
    const t0 = Date.now()
    const okv = await page.waitForFunction(() => !!document.querySelector('[data-testid="extrude-preview-volume"]'), null, { timeout: 20000 }).then(() => true).catch(() => false)
    const ms = Date.now() - t0
    const pv = await S(() => window.useApp.getState().extrudeKernelPreview?.volume ?? null)
    const line = await S(() => document.querySelector('[data-testid="extrude-preview-volume"]')?.textContent || '')
    ok(`${label}: kernel preview + volume line shown`, okv && pv != null, { ms, pv, line })
    ok(`${label}: preview responsive (< 4 s after input)`, okv && ms < 4000, { ms })
    if (line) await tradOnly(`${label} preview line`, line)
    return pv
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
    // responsiveness: change the distance with the keyboard → kernel preview for the NEW value within the debounce + build time
    { const hIn = page.locator('.cmd-palette label', { hasText: /高度|距離/ }).locator('input:visible').first()
      await hIn.click(); await hIn.press('Control+a'); await hIn.pressSequentially('13', { delay: 60 })
      const t0 = Date.now()
      const got = await page.waitForFunction(() => Math.abs((window.useApp.getState().extrudeKernelPreview?.volume ?? 0) - 15600) < 50 && !!document.querySelector('[data-testid="extrude-preview-volume"]'), null, { timeout: 15000 }).then(() => true).catch(() => false)
      ok('preview follows a new distance (13 → 15600 mm³) within 3 s', got && Date.now() - t0 < 3000, { ms: Date.now() - t0 })
      await page.screenshot({ path: OUT + '/evidence/core16-extrude-preview.png' })
      await hIn.press('Control+a'); await hIn.pressSequentially('12.5', { delay: 60 }); await hIn.press('Tab'); await W(300) }
    const xp1 = await xPreview('extrude 12.5')
    await clickOk()
    const v1 = (await expectVol('extrude 40×30×12.5', 15000)).total
    await previewMatches(xp1, v1, 'extrude preview volume == result volume')
    // second profile: Ø10 circle → 切割 · 貫通
    await startSketchOn('XY'); await drawCircle('XY', [0, 0], 5); await finishSketch()
    await ribbon('extrude')
    await selectIn('拉伸操作', 'cut'); await selectIn('拉伸範圍', 'through')
    await W(800)
    const xp2 = await xPreview('cut through')
    await clickOk()
    const vc = (await expectVol('cut Ø10 through', 15000 - Math.PI * 25 * 12.5, 0.02)).total
    await previewMatches(xp2, vc, 'cut preview volume == result volume')
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
    const xpp = await xPreview('plate cut-through')
    await clickOk()
    const v = await vol()
    await previewMatches(xpp, v.total, 'plate cut preview volume == result volume')
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
    // error: pipe Ø 0 (circle section) — must be rejected with a message, not silently become 12
    await page.locator('.cmd-palette button', { hasText: /◯ 圓/ }).first().click().catch(() => {}); await W(300)
    const dia = page.locator('.cmd-palette input[aria-label="管徑 Ø"]').first()
    await typeInto(dia, '0'); await page.keyboard.press('Tab'); await W(400)
    const shown = await dia.inputValue().catch(() => null)
    ok('sweep Ø0 keeps the typed 0 (no silent 12)', shown === '0', { shown, dia: await S(() => window.useApp.getState().sweepDia) })
    ok('sweep Ø0 cannot be committed', await okBtn().isDisabled())
    await errorMsg('sweep Ø0', /管徑|Ø/)
    await typeInto(dia, '10'); await page.keyboard.press('Tab'); await W(300)
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

  // ════════════════ 3b. 掃掠圓管 管徑 Ø 驗證（測試員：0 靜默變 12）════════════════
  await run('sweep-pipe', '掃掠圓管 管徑驗證', async () => {
    await frame()
    await startSketchOn('XY'); await drawPoly('XY', [[0, 0], [40, 0], [40, 30]]); await finishSketch()
    const rows = page.locator('.tree-row', { hasText: /獨立/ })
    await rows.nth(0).click(); await W(300)
    await ribbon('sweep')
    await page.locator('.cmd-palette button', { hasText: /◯ 圓/ }).first().click(); await W(300)
    ok('sweep dialog open (circle section)', await S(() => window.useApp.getState().sweepDlgOpen && window.useApp.getState().sweepSection !== 'profile'))
    const dia = page.locator('.cmd-palette input[aria-label="管徑 Ø"]').first()
    const alertTxt = () => S(() => document.querySelector('[data-testid="sweep-dia-alert"]')?.textContent || '')
    const nF0 = await featCount()
    for (const [txt, re] of [['0', /大於 0/], ['-5', /大於 0/], ['', /請輸入管徑/], ['abc', /有效數值/]]) {
      await dia.click(); await dia.press('Control+a'); if (txt) await dia.pressSequentially(txt, { delay: 60 }); else await dia.press('Backspace')
      await page.keyboard.press('Tab'); await W(400)
      const shown = await dia.inputValue(), al = await alertTxt()
      ok(`new sweep Ø「${txt}」: typed value kept (no silent 12)`, shown === txt, { shown })
      ok(`new sweep Ø「${txt}」: formal error shown`, re.test(al), { al })
      await tradOnly(`new sweep Ø「${txt}」 error`, al)
      ok(`new sweep Ø「${txt}」: 確定 disabled`, await okBtn().isDisabled())
      await dia.focus(); await page.keyboard.press('Enter'); await W(400)
      ok(`new sweep Ø「${txt}」: Enter does not build`, (await featCount()) === nF0 && await S(() => window.useApp.getState().sweepDlgOpen), { n: await featCount(), nF0 })
    }
    await dia.click(); await dia.press('Control+a'); await dia.pressSequentially('6', { delay: 60 }); await page.keyboard.press('Tab'); await W(400)
    ok('valid Ø6 clears the error and enables 確定', !(await alertTxt()) && !(await okBtn().isDisabled()))
    await clickOk()
    const v1 = (await expectVol('pipe Ø6 along 40+30 L', Math.PI * 9 * 70, 0.06)).total
    cur.vol = v1
    // timeline edit (dialog reopened from the timeline)
    await timelineDbl('sweep')
    const dia2 = page.locator('.cmd-palette input[aria-label="管徑 Ø"]').first()
    ok('timeline edit shows 管徑 Ø = 6', (await dia2.inputValue().catch(() => '')) === '6')
    await dia2.click(); await dia2.press('Control+a'); await dia2.pressSequentially('0', { delay: 60 }); await page.keyboard.press('Tab'); await W(400)
    ok('timeline edit Ø0: formal error', /大於 0/.test(await alertTxt()), { al: await alertTxt() })
    ok('timeline edit Ø0: 確定 disabled', await okBtn().isDisabled())
    await page.keyboard.press('Escape'); await W(300); await page.keyboard.press('Escape'); await W(300)
    const v1b = (await vol()).total
    ok('model unchanged after rejected edit', near(v1b, v1, 0.001), { v1b, v1 })
    // timeline bottom edit bar (single click on the chip) — 半徑 0 must be rejected, model unchanged
    const idx = await S(() => window.useApp.getState().features.findIndex((f) => f.type === 'sweep'))
    await page.locator(`.tl-chip[data-fi="${idx}"]`).first().click(); await W(500)
    const bar = page.locator('label', { hasText: /半徑/ }).locator('input:visible').first()
    if (await bar.count()) {
      await bar.click(); await bar.press('Control+a'); await bar.pressSequentially('0', { delay: 60 }); await bar.press('Enter'); await W(800)
      const sb = await statusBar(), al = await S(() => [...document.querySelectorAll('[role=alert]')].map((e) => e.textContent).join(' | '))
      ok('edit bar 半徑 0: rejected with a formal message', /拒絕|大於 0/.test(sb + al), { sb, al: al.slice(0, 200) })
      await tradOnly('edit bar 半徑 0', sb)
      await waitIdle()
      const v2 = (await vol()).total
      const r = await S(() => window.useApp.getState().features.find((f) => f.type === 'sweep')?.r)
      ok('edit bar 半徑 0: model unchanged (no silent 12 / 6)', near(v2, v1, 0.001) && r === 3, { v2, v1, r })
    } else ok('edit bar shows 半徑 for the pipe sweep', false)
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

  // ════════════════ 7b. 圓柱位置（測試員：X=30 冇效）════════════════
  await run('cylinder-place', '圓柱位置 X/Y/Z 及 📍 拾位置', async () => {
    const bbOf = () => S(() => { const m = window.useApp.getState().bodyMesh; const out = []; for (const q of [m, ...(m?.parked ?? [])]) { if (!q) continue; let a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9]; for (let i = 0; i < q.vertices.length; i += 3) for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], q.vertices[i + k]); b[k] = Math.max(b[k], q.vertices[i + k]) } out.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, a[2], b[2]].map((v) => +v.toFixed(2))) } return out })
    await ribbon('cylinder')
    const inputs = page.locator('.cmd-palette input:visible')
    await typeInto(inputs.nth(0), '10'); await commitField(inputs.nth(0))
    await typeInto(inputs.nth(1), '10'); await commitField(inputs.nth(1))
    const place = page.locator('[data-testid="prim-place"] input')
    await typeInto(place.nth(0), '30'); await commitField(place.nth(0))
    const px = await S(() => window.useApp.getState().featDlg?.params?.px)
    ok('typing X=30 updates the dialog parameter', +px === 30, { px })
    await clickOk()
    const b1 = await bbOf()
    ok('cylinder built at X=30 (centre x≈30, y≈0, z 0..10)', b1.length === 1 && Math.abs(b1[0][0] - 30) < 0.2 && Math.abs(b1[0][1]) < 0.2 && Math.abs(b1[0][2]) < 0.2, { b1 })
    cur.vol = (await vol()).total
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
    // 操作 select（6d20a39：合併／新實體，取代舊「鏡像出獨立實體」勾選）
    const opSel = page.locator('.cmd-palette select[data-testid="mirror-op"]').first()
    await opSel.selectOption('newbody'); await W(400)
    const opNb = await S(() => window.useApp.getState().featDlg?.params?.mirrorOp)
    await opSel.selectOption('join'); await W(600)
    ok('操作 select switches 合併 ↔ 新實體', !!opNb && !(await S(() => window.useApp.getState().featDlg?.params?.mirrorOp)), { opNb })
    await waitIdle()
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
    // 新實體: mirrored copy is a separate body (two bodies, active unchanged)
    await fresh(); await build([{ id: 'b1', type: 'extrude', profile: { kind: 'rect', a: [5, -10], b: [25, 10] }, height: 8, operation: 'new' }])
    await ribbon('mirror'); await selectIn(/^鏡像面/, 'YZ')
    await page.locator('.cmd-palette select[data-testid="mirror-op"]').first().selectOption('newbody'); await W(400); await waitIdle()
    const pvNb = await meshVol(genericPreview)
    await clickOk()
    const vNb = await vol()
    ok('新實體 mirror → two bodies, active 3200, total 6400', vNb.bodies === 2 && near(vNb.active, 3200, 0.01) && near(vNb.total, 6400, 0.01), vNb)
    ok('新實體 preview == result total', pvNb != null && near(pvNb, vNb.total, 0.02), { pvNb, vNb })
    await tradOnly('mirror newbody status', await statusBar())
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
      await previewCheck('thicken', sig0, 'thickenPreviewMesh')
      await tradOnly('thicken panel', await dlgText())
      const pvPlate = await meshVol('thickenPreviewMesh')
      await clickOk()
      const v1 = (await expectVol('thicken top 2.5 (new body)', 12000 + 1200 * 2.5, 0.01)).total
      ok('thicken preview (new plate) == added volume', pvPlate != null && near(pvPlate, v1 - 12000, 0.02), { pvPlate, added: v1 - 12000 })
      // edit via the timeline bottom edit bar (thicken has no reopen dialog)
      const tIdx = await S(() => window.useApp.getState().features.findIndex((f) => f.type === 'thickenface'))
      await page.locator(`.tl-chip[data-fi="${tIdx}"]`).first().click(); await W(500)
      const tb = page.locator('label', { hasText: /厚度/ }).locator('input:visible').first()
      await tb.click(); await tb.press('Control+a'); await tb.pressSequentially('4', { delay: 60 }); await tb.press('Enter'); await waitIdle()
      const v2 = (await expectVol('edit bar → 4', 12000 + 4800, 0.01)).total
      await undoRedo(v1, v2)
      await page.locator(`.tl-chip[data-fi="${tIdx}"]`).first().click(); await W(500)
      const tb2 = page.locator('label', { hasText: /厚度/ }).locator('input:visible').first()
      await tb2.click(); await tb2.press('Control+a'); await tb2.pressSequentially('-1', { delay: 60 }); await tb2.press('Enter'); await waitIdle()
      const stB = await statusBar()
      ok('edit bar −1: status says negative = reverse', /負值表示反向/.test(stB), { stB })
      await page.keyboard.press('Escape'); await W(300)
      await ribbon('thicken'); await clickCad([0, 0, 14]); await W(800)
      await typeField(/厚度|板厚/, '0'); await commitField(field(/厚度|板厚/))
      ok('0 cannot be committed', await okBtn().isDisabled().catch(() => false))
      await errorMsg('thicken 0', /厚度|大於/)
      // −1 = reverse: must be visible (direction control + note + status), not a silent flip
      await typeField(/厚度|板厚/, '-1'); await commitField(field(/厚度|板厚/)); await W(500)
      const th = await S(() => { const s = window.useApp.getState(); return { dir: s.thickenDir, t: s.thickenThick, sel: document.querySelector('[data-testid="thicken-dir"]')?.value, note: document.querySelector('[data-testid="thicken-flip-note"]')?.textContent || '', status: s.status } })
      ok('thicken −1: direction control shows 反向', th.dir === 'neg' && th.sel === 'neg' && th.t === 1, th)
      ok('thicken −1: note/status says negative = reverse', /反向/.test(th.note) && /負值表示反向/.test(th.status), th)
      await tradOnly('thicken −1 note', th.note + ' ' + th.status)
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
    // zh-HK wording: 「稜」/「邊」, never mainland 「棱」 — command panel, timeline edit dialog and bottom edit bar
    { const chIdx = await S(() => window.useApp.getState().features.map((f) => f.type).lastIndexOf('chamfer'))
      await page.locator(`.tl-chip[data-fi="${chIdx}"]`).first().click(); await W(500)
      const barTxt = await S(() => document.body.innerText)
      ok('chamfer edit bar / UI has no mainland 「棱」 (zh-HK)', !/棱/.test(barTxt), { hit: (barTxt.match(/.{0,12}棱.{0,12}/g) || []).slice(0, 4) })
      await page.locator(`.tl-chip[data-fi="${chIdx}"]`).first().dblclick(); await W(800)
      const edTxt = await dlgText()
      ok('chamfer edit dialog has no 「棱」', !/棱/.test(edTxt), { hit: (edTxt.match(/.{0,12}棱.{0,12}/g) || []).slice(0, 4) })
      await page.keyboard.press('Escape'); await W(300); await page.keyboard.press('Escape'); await W(300) }
    // error: radius too large
    await ribbon('fillet'); await clickCad([-20, 0, 9.9]); await W(800)
    const r3 = page.locator('input[aria-label="半徑組 1 半徑"], input[title="半徑組 1 半徑"]').first()
    await typeInto(r3, '30'); await commitField(r3)
    await page.waitForFunction(() => { const s = window.useApp.getState(); return !s.roundPreviewBusy && (!!s.roundPreviewMesh || s.roundPreviewFail) }, null, { timeout: 30000 }).catch(() => {}); await W(400)
    const rw = await S(() => document.querySelector('[data-testid="round-preview-warn"], [data-testid="round-preview-fail"]')?.textContent || '')
    ok('fillet R30: visible reason line in the dialog', /太大|減小|超過/.test(rw), { rw })
    await tradOnly('fillet R30 reason', rw)
    await errorMsg('fillet R30 too large', /太大|減小|超過/)
  })

  // ════════════════ 12b. tester case: shelled revolved flanged cup, chamfer flange outer top edge ════════════════
  await run('chamfer-cup', '倒角（抽殼法蘭杯，測試員個案）', async () => {
    await build([{ id: 'r', type: 'revolve', profile: { kind: 'poly', pts: [[0, 0], [30, 0], [30, 35], [40, 35], [40, 40], [0, 40]] }, angle: 360, axis: 'Y', op: 'new' }, { id: 's', type: 'shell', thickness: 2, nears: [[10, 40, 0]], tangentChain: false, direction: 'inside' }], 'cup')
    await page.evaluate(() => { const { camera, controls } = window.__three; controls.target.set(0, 0, -30); camera.position.set(110, 130, -230); camera.lookAt(0, 0, -30); controls.update() })
    await W(600)
    // B-rep 精確體積（OCCT GProp，經統一測量「體」過濾）— 網格體積會因倒角後重新三角化而漂移 ~100 mm³，唔適合驗 1 mm 倒角
    const exactVol = (cadPt) => S(async (p) => {
      const g = () => window.useApp.getState(), prev = { measureUniMode: g().measureUniMode, measureSelFilter: g().measureSelFilter, measureUniPicks: g().measureUniPicks }
      window.useApp.setState({ measureUniMode: true, measureSelFilter: { face: false, edge: false, body: true, sketch: false }, measureUniPicks: [] })
      try { await g().pickMeasureUniAt([p[0], p[2], -p[1]], null, false); const pk = g().measureUniPicks.at(-1); return pk?.volume != null ? +pk.volume.toFixed(2) : null }
      finally { window.useApp.setState(prev) }
    }, cadPt)
    const v0 = (await vol()).total
    const e0 = await exactVol([39, 38, 0])
    await ribbon('chamfer')
    const a = Math.PI / 3, rr = 39.7
    // 舊版把 CAD 座標直接當 three 座標投影（drift：點到 r=28 內壁邊）— 改用 harness 的 CAD→螢幕換算（CAD (x,y,z) → three (x,z,−y)）
    await mouseClick(await at([rr * Math.cos(a), 40, rr * Math.sin(a)]))
    await W(1200)
    const pick = await S(() => { const s = window.useApp.getState(); const ln = s.edgeRoundPickLines[0]; const rs = ln ? ln.map((q) => Math.hypot(q[0], q[2])) : []; const ys = ln ? ln.map((q) => q[1]) : []; return { n: s.edgeRoundPicks.length, r: ln ? Math.hypot(ln[0][0], ln[0][2]) : null, rMin: Math.min(...rs), rMax: Math.max(...rs), yMin: Math.min(...ys), yMax: Math.max(...ys), pts: rs.length } })
    ok('flange outer top edge (R40) picked', pick.n === 1 && Math.abs(pick.r - 40) < 0.1, pick)
    const c = page.locator('input[title^="倒角距離"]').first()
    await typeInto(c, '1'); await commitField(c); await waitIdle()
    const pv = await S(() => { const s = window.useApp.getState(); return { ok: !!s.roundPreviewMesh, fail: s.roundPreviewFail } })
    ok('1 mm chamfer previews (flange 5 thick)', pv.ok && !pv.fail, { ...pv, status: await statusBar() })
    const pvv = await meshVol('roundPreviewMesh')
    await clickOk()
    const v1 = (await vol()).total
    const e1 = await exactVol([38.5, 36, 0])
    const removed = 0.5 * 1 * 1 * 2 * Math.PI * (40 - 1 / 3)
    ok('chamfer REMOVES material (mesh volume goes down)', v1 < v0, { v0, v1 })
    ok('chamfer removes ≈ ring triangle (B-rep exact volume)', e0 != null && e1 != null && near(e0 - e1, removed, 0.03), { e0, e1, removedExact: e0 != null && e1 != null ? +(e0 - e1).toFixed(2) : null, expected: +removed.toFixed(2), status: await statusBar() })
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
    const t = page.locator('input[aria-label="抽殼壁厚"]').first()   // title 會變成錯誤原因，用 aria-label
    await typeInto(t, '1.5'); await commitField(t); await waitIdle()
    const pv = await meshVol('shellPreviewMesh')
    ok('shell preview present', pv != null, { pv })
    // wall 0 / blank: a formal reason line, not just a red field
    for (const [txt, re] of [['0', /壁厚必須大於 0/], ['', /請輸入壁厚/]]) {
      await t.click(); await t.press('Control+a'); if (txt) await t.pressSequentially(txt, { delay: 60 }); else await t.press('Backspace')
      await page.keyboard.press('Tab'); await W(400)
      const al = await S(() => document.querySelector('[data-testid="shell-illegal-alert"]')?.textContent || '')
      ok(`shell wall「${txt}」: formal reason shown`, re.test(al), { al })
      await tradOnly(`shell wall「${txt}」 reason`, al)
      ok(`shell wall「${txt}」: 確定 disabled`, await okBtn().isDisabled())
    }
    await typeInto(t, '1.5'); await commitField(t); await waitIdle()
    ok('valid wall clears the reason', !(await S(() => document.querySelector('[data-testid="shell-illegal-alert"]')?.textContent || '')))
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
    // 測試員個案（RE-BuLi-Cbf7 #27）：中心矩形 50×40 拉伸 10（X −25…25）。位置 0 = 世界原點 X=0；時間軸改 10 → 高側 X 10…25 = 6000
    await fresh(); await build([{ id: 'p1', type: 'extrude', profile: { kind: 'rect', a: [-25, -20], b: [25, 20] }, height: 10, operation: 'new' }])
    await page.keyboard.press('Escape'); await W(200)
    await ribbon('splitbody'); await selectIn(/^軸/, 'X')
    const refLbl = await S(() => [...document.querySelectorAll('.cmd-palette label')].map((l) => l.textContent).find((t) => /位置/.test(t)) || '')
    ok('split panel labels the reference (由原點起計)', /原點/.test(refLbl), { refLbl })
    await typeField(/^位置/, '0'); await commitField(field(/^位置/)); await waitIdle()
    const pvLine = await S(() => document.querySelector('[data-testid="split-plane-pos"]')?.textContent || '')
    ok('split preview states the plane position (X = 0)', /X\s*=\s*0(\.0+)?\b/.test(pvLine), { pvLine })
    await clickOk()
    const bbX = () => S(() => { const v = window.useApp.getState().bodyMesh.vertices; let lo = Infinity, hi = -Infinity; for (let i = 0; i < v.length; i += 3) { lo = Math.min(lo, v[i]); hi = Math.max(hi, v[i]) } return [+lo.toFixed(2), +hi.toFixed(2)] })
    const s0 = await vol(), bx0 = await bbX()
    ok('position 0 cuts at world X=0: active X 0…25, 10000 / 10000', near(s0.active, 10000, 0.01) && near(s0.total, 20000, 0.01) && Math.abs(bx0[0]) < 0.05 && Math.abs(bx0[1] - 25) < 0.05, { s0, bx0 })
    try { await timelineDbl('split') } catch { /* */ }
    if (await hasPalette()) { await typeField(/^位置/, '10'); await commitField(field(/^位置/)); await clickOk() }
    const s1 = await vol(), bx1 = await bbX()
    ok('timeline edit position 10: active X 10…25 = 6000 (from origin, not body edge)', near(s1.active, 6000, 0.01) && near(s1.total, 20000, 0.01) && Math.abs(bx1[0] - 10) < 0.05, { s1, bx1 })
    // 底部編輯列（單擊時間軸）同一參考：12.5 → 高側 X 12.5…25 = 5000
    await page.keyboard.press('Escape'); await W(300)
    const spIdx = await S(() => window.useApp.getState().features.findIndex((f) => f.type === 'split'))
    await page.locator(`.tl-chip[data-fi="${spIdx}"]`).first().click(); await W(500)
    const sbar = page.locator('label', { hasText: /切割位置/ }).locator('input:visible').first()
    const sbarLbl = await page.locator('label', { hasText: /切割位置/ }).first().textContent().catch(() => '')
    ok('edit bar labels 切割位置（由原點起計）', /原點/.test(sbarLbl || ''), { sbarLbl })
    if (await sbar.count()) { await sbar.click(); await sbar.press('Control+a'); await sbar.pressSequentially('12.5', { delay: 60 }); await sbar.press('Enter'); await waitIdle() }
    const s2 = await vol(), bx2 = await bbX()
    ok('edit bar position 12.5: active X 12.5…25 = 5000', near(s2.active, 5000, 0.01) && Math.abs(bx2[0] - 12.5) < 0.05, { s2, bx2 })
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
    { const names = await S(() => (window.useApp.getState().bodyMesh?.parked ?? []).map((b) => b.name)); const st0 = await statusBar()
      const tree = await S(() => [...document.querySelectorAll('.tree-row')].map((e) => e.innerText).join(' | '))
      ok('copied body is named 複製實體1 (matches status/timeline), not 「實體1 (1)」', names.includes('複製實體1') && !names.some((n) => / \(\d+\)$/.test(n)) && /複製實體1/.test(tree), { names, st0, tree: tree.slice(0, 200) }) }
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

  // ════════════════ 17. 新建檔案（唔可以重新載入頁面）════════════════
  await run('newfile', '新建檔案 New File（不重新載入）', async () => {
    await build(BOX)
    const entry0 = await S(() => { window.__noReloadMarker = 42; return [...document.scripts].map((x) => x.src).find((x) => /assets\/index-/.test(x)) || '' })
    const nav0 = await S(() => performance.getEntriesByType('navigation').length + ':' + performance.timeOrigin)
    await page.locator('button[aria-haspopup="menu"]', { hasText: /檔案|File/ }).first().click(); await W(400)
    await page.locator('[role="menu"] [role="menuitem"]', { hasText: '新建檔案' }).first().click(); await W(500)
    const dlg = await S(() => document.querySelector('[data-testid="dialog-alt"]')?.closest('div')?.parentElement?.innerText || '')
    ok('New File asks 儲存／開新檔案 first', /開新檔案/.test(dlg), { dlg: dlg.slice(0, 160) })
    await page.locator('button.cmd-ok:visible').last().click(); await W(1500); await waitIdle()
    const after = await S(() => ({ marker: window.__noReloadMarker ?? null, feats: window.useApp.getState().features.length, nav: performance.getEntriesByType('navigation').length + ':' + performance.timeOrigin, entry: [...document.scripts].map((x) => x.src).find((x) => /assets\/index-/.test(x)) || '', status: window.useApp.getState().status }))
    ok('New File did NOT reload the page (same JS realm, same navigation, same bundle)', after.marker === 42 && after.nav === nav0 && after.entry === entry0, { ...after, nav0, entry0 })
    ok('New File cleared the document', after.feats === 0, after)
    await tradOnly('new file status', after.status)
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
