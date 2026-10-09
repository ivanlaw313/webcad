// JOINT DIAG-1740 真滑鼠 e2e（單一 niced vite preview + headless Chrome，exit 時殺；先 `nice -n 19 npx vite build`）
//   node scripts/e2e-joint-diag.mjs [--shots DIR]
// #6 新建組件只固化活動實體；#3 第一拣 = 要郁件、第一件固定 → 自動對調；#4 hover「球」再撳確定 = 旋轉；#5 軸唔穿入板；
// #1 環拖 + Ctrl+Z 後拖白色指針線（成條）；#2 撳錨點球有提示；#7 診斷 HUD 繁體 + 匯出檔案。
import { readFileSync } from 'node:fs'
import { launch, clickAt } from './e2e-lib.mjs'
const { page, ok, finish, shot } = await launch()
const g = (fn, a) => page.evaluate(fn, a)
const st = () => g(() => window.useApp.getState().status)
const rect = (sel) => g((s) => { const e = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom } }, sel)
async function clickTool(id) {
  const sel = `.tool-btn[data-cmd="${id}"]`
  const tabs = await page.locator('.ribbon-tabs > div.ribbon-tab:not(.ctx)').count()
  for (let i = -1; i < tabs; i++) {
    if (i >= 0) { await page.locator('.ribbon-tabs > div.ribbon-tab:not(.ctx)').nth(i).click(); await page.waitForTimeout(120) }
    if (await rect(sel)) { await page.locator(sel).first().click(); await page.waitForTimeout(200); return true }
  }
  return false
}
const cam = () => g(() => { const c = window.__three.camera; return [c.position.x, c.position.y, c.position.z] })
const camMoved = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
// 組件世界 bbox（three 座標）+ 相機方向 → 圓柱側面朝相機一點 / 板頂面一點 嘅螢幕座標
const compPoint = (compId, which) => g(([id, which]) => {
  const { scene, camera } = window.__three, V = camera.position.constructor
  let box = null
  scene.traverse((o) => { if (o.isMesh && o.userData?.compId === id && o.visible) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); box = box ? box.union(b) : b } })
  if (!box) return null
  const c = box.getCenter(new V()), sz = box.getSize(new V())
  let p
  if (which === 'top') p = new V(c.x + sz.x * 0.2, box.max.y, c.z + sz.z * 0.2)
  else { const d = new V(camera.position.x - c.x, 0, camera.position.z - c.z).normalize(); p = new V(c.x, c.y, c.z).addScaledVector(d, Math.min(sz.x, sz.z) / 2 * 0.95) }
  const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0], r = cv.getBoundingClientRect()
  const q = p.clone().project(camera)
  return { s: [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height], minY: box.min.y, maxY: box.max.y }
}, [compId, which])
const worldY = (compId) => g((id) => { const { scene } = window.__three; let lo = Infinity, hi = -Infinity; scene.traverse((o) => { if (o.isMesh && o.userData?.compId === id && o.visible) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); lo = Math.min(lo, b.min.y); hi = Math.max(hi, b.max.y) } }); return [lo, hi] }, compId)

try {
  // ── setup：底板（活動實體）+ 圓柱（新實體，parked）
  await g(async () => {
    const s = () => window.useApp.getState()
    window.useApp.setState({ features: [], components: [], joints: [], sketchSources: {} })
    for (let t = 0; t < 200 && !(await s().applyFeatures([{ id: 'plate', type: 'extrude', profile: { kind: 'rect', a: [-30, -30], b: [30, 30] }, height: 8, operation: 'new' }], 'plate')); t++) await new Promise((r) => setTimeout(r, 250))
    await s().applyFeatures([...s().features, { id: 'shaft', type: 'extrude', profile: { kind: 'circle', c: [70, 0], r: 5 }, height: 30, operation: 'newbody' }], '圓柱')
    s().selectComponent?.(null)
  })
  await page.waitForTimeout(600)
  const pre = await g(() => { const s = window.useApp.getState(); return { parked: s.bodyMesh?.parked?.length ?? 0, feats: s.features.map((f) => f.id) } })
  ok('setup: plate active + cylinder parked new body', pre.parked === 1, pre)

  // ── #6 ribbon 新建組件：一撳只固化活動實體
  ok('#6 ribbon 新建組件 button found', await clickTool('newcomp'))
  await page.waitForFunction(() => window.useApp.getState().components.length >= 1, null, { timeout: 30000 }); await page.waitForTimeout(800)
  const c1 = await g(() => { const s = window.useApp.getState(); return { comps: s.components.map((c) => c.name), feats: s.features.map((f) => f.id), live: !!s.bodyMesh?.triangles?.length, status: s.status } })
  ok('#6 first 新建組件 → exactly 1 component; the other body stays a live body', c1.comps.length === 1 && c1.feats.includes('shaft') && !c1.feats.includes('plate') && c1.live, c1)
  await shot('j1-newcomp-one')
  await clickTool('newcomp')
  await page.waitForFunction(() => window.useApp.getState().components.length >= 2, null, { timeout: 30000 }); await page.waitForTimeout(800)
  const comps = await g(() => window.useApp.getState().components.map((c) => ({ id: c.id, name: c.name })))
  ok('#6 second 新建組件 → 2 components', comps.length === 2, comps)
  const P = comps[0].id, S = comps[1].id

  // 固定底板（同瀏覽樹右鍵「固定」一樣嘅 store action；呢度唔係測試重點）
  await g((p) => window.useApp.getState().setGrounded(p), P)
  ok('plate grounded (setGrounded)', await g((p) => { const s = window.useApp.getState(); return s.grounded === p || !!s.components.find((c) => c.id === p)?.grounded }, P), await st())
  await g(() => window.useApp.getState().selectComponent(null))
  await page.waitForTimeout(400)
  await shot('j2-two-comps')

  // ── #3/#4/#5：ribbon 關節 → 先點軸（要郁件）→ 再點板頂 → 對話框 hover「球」撳確定
  await clickTool('joint')
  ok('#3 joint pick status says first pick = moving part', /要郁件/.test(await st()), await st())
  const shaftSide = await compPoint(S, 'side'); await clickAt(page, shaftSide.s)
  const s1 = await st()
  ok('#3 first pick (shaft) accepted as the moving part', /已選(要郁件|移動件)/.test(s1) && !/唔可以做關節子件|不可作為關節子件/.test(s1), s1)
  const plateTop = await compPoint(P, 'top'); await clickAt(page, plateTop.s)
  await page.waitForSelector('[data-testid="dialog-pick-list"]', { timeout: 10000 })
  const opts = await g(() => [...document.querySelectorAll('[data-testid="dialog-pick-list"] [role="option"]')].map((e) => ({ v: e.dataset.testid.replace('dialog-pick-', ''), sel: e.getAttribute('aria-selected') })))
  ok('#4 type dialog: revolute pre-selected', opts.find((o) => o.sel === 'true')?.v === 'revolute', opts)
  const ballBox = await page.locator('[data-testid="dialog-pick-ball"]').boundingBox()
  await page.mouse.move(ballBox.x + ballBox.width / 2, ballBox.y + ballBox.height / 2, { steps: 4 })   // 滑鼠經過「球」去確定
  await shot('j3-dialog-hover-ball')
  const okBtn = await page.locator('.cmd-ok:visible').first().boundingBox()
  await page.mouse.move(okBtn.x + okBtn.width / 2, okBtn.y + okBtn.height / 2, { steps: 6 }); await page.mouse.down(); await page.mouse.up()
  await page.waitForFunction(() => window.useApp.getState().joints.length === 1, null, { timeout: 10000 }); await page.waitForTimeout(600)
  const j1 = await g(() => { const s = window.useApp.getState(), j = s.joints[0]; return { type: j.type, parent: j.parent, child: j.child, anchor: j.anchor, status: s.status } })
  ok('#4 hover 球 then 確定 → revolute (not ball)', j1.type === 'revolute', j1)
  ok('#3 shaft picked first = child (moves), plate = parent; no grounded refusal', j1.child === S && j1.parent === P, j1)
  const yS = await worldY(S), yP = await worldY(P)
  ok('#5 shaft end sits on the plate top (no penetration)', Math.abs(yS[0] - yP[1]) < 0.05 && Math.abs(j1.anchor[1] - yP[1]) < 0.05, { shaftY: yS, plateY: yP, anchor: j1.anchor })
  await shot('j4-revolute-no-penetration')

  // ── #3 swap：Ctrl+Z 撤銷關節（連 snap），再先點固定咗嘅底板 → 自動對調
  await page.mouse.click(20, 450)   // 焦點返 canvas 外
  await page.keyboard.press('Control+z'); await page.waitForTimeout(600)
  ok('undo removes joint + snap in one step', await g(() => window.useApp.getState().joints.length === 0))
  await clickTool('joint')
  await clickAt(page, (await compPoint(P, 'top')).s)
  ok('#3 grounded first pick explained', /已固定/.test(await st()), await st())
  await clickAt(page, (await compPoint(S, 'side')).s)
  await page.waitForSelector('[data-testid="dialog-pick-list"]', { timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.useApp.getState().joints.length === 1, null, { timeout: 10000 }); await page.waitForTimeout(600)
  const j2 = await g(() => { const s = window.useApp.getState(), j = s.joints[0]; return { type: j.type, parent: j.parent, child: j.child, status: s.status } })
  ok('#3 grounded plate picked first → roles swapped automatically (plate parent, shaft child)', j2.parent === P && j2.child === S && j2.type === 'revolute' && /對調/.test(j2.status), j2)
  const yS2 = await worldY(S)
  ok('#5 (swap path) shaft still on the plate face', Math.abs(yS2[0] - yP[1]) < 0.05, { yS2, yP })

  // ── #7 診斷 HUD：開錄製（之後關節把手會記低命中）
  await g(() => { const s = window.useApp.getState(); if (!s.helpOpen) s.toggleHelp() }); await page.waitForTimeout(300)
  const startBtn = page.locator('button', { hasText: '開啟診斷錄製' }).first()
  ok('#7 help panel: 開啟診斷錄製 (Traditional)', await startBtn.count() > 0)
  await startBtn.click(); await page.waitForTimeout(300)
  const pillTxt = await g(() => document.body.innerText)
  ok('#7 diagnostics pill Traditional: ● 診斷錄製中（撳一下關閉）', /● 診斷錄製中（撳一下關閉）/.test(pillTxt) && !/点关|诊断录制/.test(pillTxt))
  await g((s) => window.useApp.getState().selectComponent(s), S); await page.waitForTimeout(500)

  // ── #1 環拖 → Ctrl+Z → 拖白色指針線（沿成條線幾個位）
  const ringPt = (deg) => g((deg) => {
    const j = window.useApp.getState().joints[0], cam = window.__three.camera, V = cam.position.constructor
    const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0], r = cv.getBoundingClientRect()
    const ax = new V(...j.axis).normalize(); if (j.flip) ax.multiplyScalar(-1); const ref = Math.abs(ax.x) < 0.9 ? new V(1, 0, 0) : new V(0, 1, 0)
    const u = new V().crossVectors(ax, ref).normalize(), v = new V().crossVectors(ax, u).normalize(), a = new V(...j.anchor), t = deg * Math.PI / 180
    const q = a.clone().addScaledVector(u, 30 * Math.cos(t)).addScaledVector(v, 30 * Math.sin(t)).project(cam)
    return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height]
  }, deg)
  const drag = async (p, d, n = 10) => { await page.mouse.move(p[0], p[1]); await page.mouse.down(); for (let i = 1; i <= n; i++) await page.mouse.move(p[0] + d[0] * i / n, p[1] + d[1] * i / n); await page.mouse.up(); await page.waitForTimeout(250) }
  const r60 = await ringPt(60), r65 = await ringPt(65)
  const c0 = await cam(), a0 = await g(() => window.useApp.getState().joints[0].angle ?? 0)
  await drag(r60, [(r65[0] - r60[0]) * 8, (r65[1] - r60[1]) * 8])
  const a1 = await g(() => window.useApp.getState().joints[0].angle ?? 0)
  ok('#1 ring drag rotates (camera still)', Math.abs(a1 - a0) > 5 && camMoved(c0, await cam()) < 1e-3, { a0, a1 })
  await page.keyboard.press('Control+z'); await page.waitForTimeout(500)
  const aU = await g(() => window.useApp.getState().joints[0].angle ?? 0)
  ok('#1 Ctrl+Z restores the angle', Math.abs(aU - a0) < 1e-6, { aU })
  // 真正畫出嚟嘅白色指針（Line2 instanceStart/End）→ 螢幕
  const ptr = await g(() => {
    const { scene, camera } = window.__three, V = camera.position.constructor
    const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0], r = cv.getBoundingClientRect()
    const sc = (p) => { const q = p.clone().project(camera); return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height] }
    let seg = null
    scene.traverse((o) => { if (seg || !o.isLine2 && !o.isLineSegments2) return; const m = o.material; if (m?.color?.getHexString?.() !== 'ffffff' || o.renderOrder !== 998) return; const s0 = o.geometry.attributes.instanceStart, e0 = o.geometry.attributes.instanceEnd; seg = [new V(s0.getX(0), s0.getY(0), s0.getZ(0)).applyMatrix4(o.matrixWorld), new V(e0.getX(0), e0.getY(0), e0.getZ(0)).applyMatrix4(o.matrixWorld)] })
    return seg && { a: sc(seg[0]), b: sc(seg[1]), world: seg.map((p) => [p.x, p.y, p.z]) }
  })
  ok('#1 rendered white pointer found', !!ptr, ptr)
  await shot('j5-after-undo')
  let hits = 0, tries = 0
  for (const f of [0.3, 0.5, 0.7, 0.9]) {
    const p = [ptr.a[0] + (ptr.b[0] - ptr.a[0]) * f, ptr.a[1] + (ptr.b[1] - ptr.a[1]) * f]
    const L = Math.hypot(ptr.b[0] - ptr.a[0], ptr.b[1] - ptr.a[1]) || 1, perp = [-(ptr.b[1] - ptr.a[1]) / L, (ptr.b[0] - ptr.a[0]) / L]
    for (const off of [0, 7]) {
      tries++
      const q = [p[0] + perp[0] * off, p[1] + perp[1] * off]
      const cb = await cam(), ab = await g(() => window.useApp.getState().joints[0].angle ?? 0)
      await drag(q, [perp[0] * 60, perp[1] * 60])
      const ca = await cam(), aa = await g(() => window.useApp.getState().joints[0].angle ?? 0)
      const hit = camMoved(cb, ca) < 1e-3 && Math.abs(aa - ab) > 2
      if (hit) hits++; else console.log('   miss at f', f, 'off', off, { q, ab, aa, cam: camMoved(cb, ca) })
      await page.keyboard.press('Control+z'); await page.waitForTimeout(300)
    }
  }
  ok('#1 white pointer line grabbable along its whole length (±7px) — rotates, camera never orbits', hits === tries, { hits, tries, ptr })

  // ── #2 錨點球：撳 → 提示
  await page.waitForTimeout(200)
  await clickAt(page, ptr.a)
  const s2 = await st()
  ok('#2 anchor ball press shows how-to hint', /關節錨點（軸心）/.test(s2), s2)
  await shot('j6-anchor-hint')

  // ── #7 HUD 繁體 + 匯出檔案
  const hud = await g(() => document.body.innerText)
  ok('#7 HUD Traditional: 複製問題報告 / 錄製中', /📋 複製問題報告/.test(hud) && /錄製中/.test(hud) && !/复制问题报告|点关|操作记录|录制/.test(hud))
  await shot('j7-debug-hud')
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.locator('[data-testid="dbg-export"]').click()])
  const path = await dl.path(), name = dl.suggestedFilename(), txt = readFileSync(path, 'utf8')
  ok('#7 匯出檔案 downloads a Traditional .txt report', /^webcad-問題報告-\d{8}-\d{6}\.txt$/.test(name) && /【WebCAD 問題報告】/.test(txt) && /操作記錄（\d+ 條）/.test(txt) && /關節把手/.test(txt) && !/问题报告|操作记录/.test(txt), { name, head: txt.slice(0, 160) })
} catch (e) { await finish(e) }
await finish()
