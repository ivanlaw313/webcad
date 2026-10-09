#!/usr/bin/env node
// ASM2 real-mouse e2e (vite preview + ONE headless Chrome, both killed on exit). Sections:
//  [interf] embedded box → ONE click on 「計算」 → interference with both names + volume; no English label
//  [newcomp] two bodies, ribbon 新建組件 → only the active body becomes 組件N; remaining body → 組件N (not 實體1); tree right-click 建立組件
//  [ground] ribbon 固定組件 button visible + works; component right-click 取消固定; hint text formal
//  [slider] joint panel slider dragged with the mouse, focus stays on the slider, Ctrl+Z = exactly one step back
//  [tree] 關節 folder: click selects, ✎ edit highlights panel card, right-click 重新命名, 🗑 delete + Ctrl+Z
//  [move] ribbon 移動/複製 with only components: dialog opens (no 「請先創建一個實體」), defaults to 組件, OK click moves (CAD +Z = up);
//          jointed child of a grounded part is refused with a reason (stays on its axis); component bar is above the 裝配關節 panel
//  [dof] J1 revolute + J2 slider + rigid J3 → title 自由度 1 (was 0) ; [jtype] change J1 type on its card + Ctrl+Z
//  [overlap] revolute J1 + slider J2 sharing an anchor: grabbing the shared dot / cyan arrow tip drives J2, never J1, camera still
// Usage: nice -n 19 node scripts/e2e-asm2.mjs [--port 4392] [--shots /tmp/a2] [--only interf|newcomp|…]
import { launch } from './e2e-lib.mjs'

const { page, ok, finish, shot } = await launch()
const g = (fn, a) => page.evaluate(fn, a)
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : ''
const want = (k) => !only || only.split(',').includes(k)
const camM = () => g(() => { const c = window.__three.camera; c.updateMatrixWorld(); return [...c.matrixWorld.elements].map((v) => +v.toFixed(4)) })
const rect = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null }, sel)
async function ribbon(cmd) {
  const sel = `.tool-btn[data-cmd="${cmd}"]`
  if (await rect(sel)) { await page.locator(sel).first().click(); return true }
  const n = await page.locator('.ribbon-tabs .ribbon-tab:not(.ctx)').count()
  for (let i = 0; i < n; i++) { await page.locator('.ribbon-tabs .ribbon-tab:not(.ctx)').nth(i).click(); await page.waitForTimeout(150); if (await rect(sel)) { await page.locator(sel).first().click(); return true } }
  return false
}
const reset = () => g(async () => { const s = window.useApp.getState(); window.useApp.setState({ components: [], componentDefs: [], joints: [], grounded: null, undoStack: [], redoStack: [], selectedComponent: null, selectedJoint: null, interfReport: null, interfPanelOpen: false, interfHits: [], interfMeshes: [], originX: 0 }); await s.applyFeatures([], 'reset', false) })
const box = (id, a, b, z0, h, op = 'new') => ({ id, type: 'extrude', profile: { kind: 'rect', a, b }, height: h, baseZ: z0, operation: op })
async function twoComps(f1, f2) {
  await g(async ([f1, f2]) => {
    const s = () => window.useApp.getState()
    for (let t = 0; t < 200 && !(await s().applyFeatures([f1], 'a')); t++) await new Promise((r) => setTimeout(r, 250))
    s().newComponent(); window.useApp.setState({ originX: 0 })
    await s().applyFeatures([f2], 'b'); s().newComponent(); s().selectComponent(null)
  }, [f1, f2])
  await page.waitForTimeout(600)
}
try {
  if (want('interf')) {
    await reset()
    await twoComps(box('plate', [-40, -30], [40, 30], 0, 10), box('blk', [-10, -10], [10, 10], 6, 20))
    const names = await g(() => window.useApp.getState().components.map((c) => c.name))
    await g(() => window.useApp.getState().runCommand('interference', '干涉檢查')); await page.waitForTimeout(400)
    const lbl = (await page.locator('[data-testid="interf-compute"]').textContent())?.trim()
    ok('[interf] compute button label is 「計算」 (no English)', /計算/.test(lbl) && !/Compute/.test(lbl), { lbl })
    await page.locator('[data-testid="interf-compute"]').click()   // ONE click
    await page.waitForFunction(() => !!window.useApp.getState().interfReport, null, { timeout: 60000 }).catch(() => {})
    const r = await g(() => { const s = window.useApp.getState(); return { status: s.status, hits: s.interfReport?.hits ?? null, meshes: s.interfMeshes.length } })
    ok('[interf] first click computes: 1 interference, both components named, ≈1600 mm³', r.hits?.length === 1 && Math.abs(r.hits[0].vol - 1600) < 2 && [r.hits[0].a, r.hits[0].b].sort().join() === [...names].sort().join(), r)
    ok('[interf] overlap highlighted + formal status', r.meshes === 1 && /⚠ 干涉 1 處/.test(r.status) && !/manifold|蒙特卡洛|無干涉/.test(r.status), { status: r.status })
    await shot('a2-interf')
    await g(() => window.useApp.getState().clearInterf())
  }
  if (want('newcomp')) {
    await reset()
    await g(async () => {
      const s = () => window.useApp.getState()
      for (let t = 0; t < 200 && !(await s().applyFeatures([{ id: 'p', type: 'extrude', profile: { kind: 'rect', a: [-40, -30], b: [40, 30] }, height: 10, operation: 'new' }], 'a')); t++) await new Promise((r) => setTimeout(r, 250))
      await s().applyFeatures([...s().features, { id: 'c', type: 'extrude', profile: { kind: 'circle', c: [10, 0], r: 5 }, height: 30, baseZ: 10, operation: 'newbody' }], 'b')
    })
    await page.waitForTimeout(500)
    // tree right-click on the parked body offers 建立組件
    const parkedRow = page.locator('.browser .tree-row', { hasText: /實體1/ }).first()
    if (await parkedRow.count()) {
      await parkedRow.click({ button: 'right' }); await page.waitForTimeout(200)
      ok('[newcomp] body right-click menu has 建立組件', await page.locator('.tree-ctx-menu [data-key="createComp"]').count() === 1, {})
      await page.keyboard.press('Escape'); await page.mouse.click(700, 300, { button: 'left' }).catch(() => {}); await page.waitForTimeout(200)
    } else ok('[newcomp] parked body row present in tree', false, {})
    await ribbon('newcomp'); await page.waitForTimeout(1500)
    const a = await g(() => { const s = window.useApp.getState(); return { comps: s.components.map((c) => c.name), features: s.features.length, status: s.status } })
    ok('[newcomp] ribbon 新建組件 converts ONLY the active body (other body stays in the model)', a.comps.length === 1 && /^組件\d+$/.test(a.comps[0]) && a.features > 0 && /其餘 1 個實體保留在模型中/.test(a.status) && !/[喺撳嘅唔咗冇啲]/.test(a.status), a)
    await ribbon('newcomp'); await page.waitForTimeout(1500)
    const b = await g(() => window.useApp.getState().components.map((c) => c.name))
    ok('[newcomp] remaining body becomes 組件N too (not 實體1), numbering consecutive', b.length === 2 && b.every((n) => /^組件\d+$/.test(n)) && new Set(b).size === 2, { b })
    await shot('a2-newcomp')
  }
  if (want('ground')) {
    await reset()
    await twoComps(box('p', [-40, -30], [40, 30], 0, 10), box('q', [-10, -10], [10, 10], 10, 20))
    const c1 = await g(() => window.useApp.getState().components[0].id)
    await g((id) => window.useApp.getState().selectComponent(id), c1); await page.waitForTimeout(200)
    ok('[ground] 固定組件 is a visible ribbon button', await ribbon('groundcomp'), {})
    await page.waitForTimeout(300)
    const st = await g((id) => { const s = window.useApp.getState(); return { g: !!s.components.find((c) => c.id === id)?.grounded, status: s.status } }, c1)
    ok('[ground] ribbon click grounds the selected component; formal hint', st.g && /（已固定）— 不可拖動/.test(st.status) && !/Ground|唔/.test(st.status), st)
    const row = page.locator('.browser .tree-row', { hasText: await g((id) => window.useApp.getState().components.find((c) => c.id === id).name, c1) }).first()
    await row.click({ button: 'right' }); await page.waitForTimeout(200)
    const un = page.locator('.tree-ctx-menu [data-key="unground"]')
    ok('[ground] component right-click has 取消固定', await un.count() === 1, {})
    if (await un.count()) { await un.click(); await page.waitForTimeout(200) }
    ok('[ground] right-click 取消固定 works', !(await g((id) => !!window.useApp.getState().components.find((c) => c.id === id)?.grounded, c1)), {})
  }
  if (want('move')) {
    await reset()
    await twoComps(box('p', [-40, -30], [40, 30], 0, 10), box('q', [-10, -10], [10, 10], 10, 20))
    const [A, B] = await g(() => window.useApp.getState().components.map((c) => c.id))
    await g((id) => window.useApp.getState().selectComponent(id), B); await page.waitForTimeout(200)
    const p0 = await g((id) => window.useApp.getState().components.find((c) => c.id === id).pos, B)
    ok('[move] ribbon 移動/複製 button found', await ribbon('move'), {})
    await page.waitForTimeout(400)
    const d0 = await g(() => { const s = window.useApp.getState(); return { kind: s.featDlg?.kind, ot: s.featDlg?.params?.objectType, status: s.status } })
    ok('[move] dialog opens for components (no 「請先創建一個實體」), object type = 組件', d0.kind === 'move' && d0.ot === 'components' && !/請先(創建|建立)一個實體/.test(d0.status), d0)
    await g(() => window.useApp.getState().setFeatParam('dz', 15)); await page.waitForTimeout(200)
    await page.locator('[data-testid="command-confirm"]').click(); await page.waitForTimeout(500)
    const p1 = await g((id) => window.useApp.getState().components.find((c) => c.id === id).pos, B)
    ok('[move] OK click moved the component up 15 (CAD +Z → world +Y)', Math.abs(p1[1] - p0[1] - 15) < 1e-6 && p1[0] === p0[0] && p1[2] === p0[2], { p0, p1 })
    // jointed to a grounded part → refused
    await g(([A, B]) => { const s = window.useApp.getState(); s.toggleComponentGround(A); s.addJoint({ type: 'revolute', parent: A, child: B, anchor: [0, 10, 0], axis: [0, 1, 0], angle: 0, slide: 0 }); s.selectComponent(B) }, [A, B])
    await page.waitForTimeout(300)
    await ribbon('move'); await page.waitForTimeout(300)
    await g(() => window.useApp.getState().setFeatParam('dx', 25)); await page.waitForTimeout(150)
    await page.locator('[data-testid="command-confirm"]').click(); await page.waitForTimeout(400)
    const r2 = await g((id) => { const s = window.useApp.getState(); return { pos: s.components.find((c) => c.id === id).pos, status: s.status, dlg: !!s.featDlg } }, B)
    ok('[move] jointed child of a grounded part: refused with reason, stays on its axis', r2.pos[0] === p1[0] && /脫離關節軸線/.test(r2.status) && !/[喺撳嘅唔咗冇啲]/.test(r2.status), r2)
    await page.locator('[data-testid="command-cancel"]').click().catch(() => {}); await page.waitForTimeout(200)
    // component bar above the joints panel
    if (await page.locator('.joints-pill').count()) { await page.locator('.joints-pill').first().click(); await page.waitForTimeout(300) }
    await g((id) => window.useApp.getState().selectComponent(id), B); await page.waitForTimeout(300)
    // 將「裝配關節」面板推到同工具列重疊（細螢幕／面板高時嘅情況），再逐個可見按鈕檢查最上層係咪工具列
    const cover = await page.evaluate(() => { const bar = document.querySelector('[data-testid="comp-move-bar"]'); if (!bar) return { bar: false }; const jp = document.querySelector('.joints-panel'); if (jp) { jp.style.top = '120px'; jp.style.bottom = 'auto'; jp.style.maxHeight = '400px' } const br = bar.getBoundingClientRect(), jr = jp?.getBoundingClientRect(); const kids = [...bar.children].filter((k) => { const r = k.getBoundingClientRect(); return r.width > 0 && r.x + r.width / 2 > br.left && r.x + r.width / 2 < br.right }); let covered = 0, overPanel = 0; for (const k of kids) { const r = k.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2; if (jr && cx > jr.left && cx < jr.right && cy > jr.top && cy < jr.bottom) overPanel++; const e = document.elementFromPoint(cx, cy); if (!bar.contains(e)) covered++ } return { bar: true, kids: kids.length, covered, overPanel, jp: jr ? [jr.left, jr.top, jr.right, jr.bottom].map(Math.round) : null, barR: [br.left, br.top, br.right, br.bottom].map(Math.round) } })
    ok('[move] component move bar visible and not covered by the 裝配關節 panel', cover.bar && cover.kids > 3 && cover.overPanel > 0 && cover.covered === 0, cover)
    await shot('a2-move')
  }
  if (want('dof') || want('jtype')) {
    await reset()
    await g(async () => {
      const s = () => window.useApp.getState()
      const f = (id, a, b, z0, h) => ({ id, type: 'extrude', profile: { kind: 'rect', a, b }, height: h, baseZ: z0, operation: 'new' })
      for (let t = 0; t < 200 && !(await s().applyFeatures([f('a', [-40, -30], [40, 30], 0, 10)], 'a')); t++) await new Promise((r) => setTimeout(r, 250))
      s().newComponent(); await s().applyFeatures([f('b', [-5, -5], [5, 5], 10, 30)], 'b'); s().newComponent(); await s().applyFeatures([f('c', [20, -5], [30, 5], 10, 10)], 'c'); s().newComponent()
      const [P, S, C] = s().components.map((c) => c.id)
      s().addJoint({ type: 'revolute', parent: P, child: S, anchor: [0, 10, 0], axis: [0, 1, 0], angle: 0, slide: 0 })
      s().addJoint({ type: 'slider', parent: S, child: C, anchor: [25, 10, 0], axis: [1, 0, 0], angle: 0, slide: 0 })
      s().addJoint({ type: 'rigid', parent: S, child: C, anchor: [25, 10, 0], axis: [0, 1, 0], angle: 0, slide: 0 })
      s().selectComponent(null)
    })
    await page.waitForTimeout(600)
    if (await page.locator('.joints-pill').count()) { await page.locator('.joints-pill').first().click(); await page.waitForTimeout(300) }
    const title = (await page.locator('.jp-title').first().textContent()) ?? ''
    if (want('dof')) ok('[dof] after rigid J3 the title shows 自由度 1 (J1 still rotates), not 0', /自由度 1/.test(title), { title })
    if (want('jtype')) {
      const sel = page.locator('[data-testid="jp-type-J1"]')
      ok('[jtype] joint card has a type selector', await sel.count() === 1, {})
      await sel.selectOption('slider'); await page.waitForTimeout(300)
      const t1 = await g(() => window.useApp.getState().joints[0].type)
      await page.mouse.click(700, 60); await page.keyboard.press('Control+z'); await page.waitForTimeout(400)
      const t2 = await g(() => window.useApp.getState().joints[0].type)
      ok('[jtype] change 旋轉 → 滑動 on the card, Ctrl+Z restores 旋轉', t1 === 'slider' && t2 === 'revolute', { t1, t2 })
    }
    await shot('a2-dof')
  }
  if (want('slider') || want('tree') || want('overlap')) {
    await reset()
    await twoComps(box('p', [-40, -30], [40, 30], 0, 10), box('q', [-8, -25], [8, 25], 0, 8))
    await g(() => { const s = window.useApp.getState(); const [P, S] = s.components; window.useApp.setState({ undoStack: [] }); s.addJoint({ type: 'revolute', parent: P.id, child: S.id, anchor: [S.pos[0], 10, S.pos[2]], axis: [0, 1, 0], angle: 0, slide: 0 }) })
    await page.waitForTimeout(500)
  }
  if (want('slider')) {
    if (await page.locator('.joints-pill').count()) { await page.locator('.joints-pill').first().click(); await page.waitForTimeout(300) }
    const sl = page.locator('.jp-drive input[type="range"]').first()
    const bb = await sl.boundingBox()
    const u0 = await g(() => window.useApp.getState().undoStack.length)
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down()
    for (let i = 1; i <= 8; i++) await page.mouse.move(bb.x + bb.width / 2 + i * 6, bb.y + bb.height / 2)
    await page.mouse.up(); await page.waitForTimeout(200)
    const a1 = await g(() => window.useApp.getState().joints[0].angle), u1 = await g(() => window.useApp.getState().undoStack.length)
    const focused = await g(() => document.activeElement?.getAttribute('type'))
    ok('[slider] mouse drag on the slider changed the angle, ONE undo step', Math.abs(a1) > 5 && u1 - u0 === 1, { a1, u0, u1 })
    await page.keyboard.press('Control+z'); await page.waitForTimeout(300)
    const after = await g(() => { const s = window.useApp.getState(); return { a: s.joints[0]?.angle, n: s.joints.length } })
    ok('[slider] Ctrl+Z with focus still on the slider undoes exactly the slider step (joint kept)', after.n === 1 && Math.abs(after.a) < 1e-6, { focused, after })
  }
  if (want('tree')) {
    const row = page.locator('[data-testid="tree-joint-J1"]')
    ok('[tree] 關節 folder lists J1', await row.count() === 1, {})
    await row.click(); await page.waitForTimeout(150)
    ok('[tree] click selects the joint', await g(() => window.useApp.getState().selectedJoint) === 'J1', {})
    await page.locator('[data-testid="tree-joint-edit-J1"]').click(); await page.waitForTimeout(400)
    ok('[tree] ✎ edit opens the joints panel with the card highlighted', await page.locator('.jp-joint.sel[data-joint-id="J1"]').count() === 1, {})
    await row.click({ button: 'right' }); await page.waitForTimeout(150)
    await page.locator('.tree-ctx-menu [data-key="rename"]').click(); await page.waitForTimeout(150)
    await page.keyboard.press('Control+a'); await page.keyboard.type('轉軸'); await page.keyboard.press('Enter'); await page.waitForTimeout(200)
    ok('[tree] right-click 重新命名 renames the joint', await g(() => window.useApp.getState().joints[0].name) === '轉軸', {})
    await page.locator('[data-testid="tree-joint-del-J1"]').click(); await page.waitForTimeout(200)
    const nDel = await g(() => window.useApp.getState().joints.length)
    await page.mouse.click(700, 60); await page.keyboard.press('Control+z'); await page.waitForTimeout(300)
    const back = await g(() => window.useApp.getState().joints.map((j) => j.name))
    ok('[tree] 🗑 deletes, Ctrl+Z restores (with the new name)', nDel === 0 && back.length === 1 && back[0] === '轉軸', { nDel, back })
    await shot('a2-tree')
  }
  if (want('overlap')) {
    await g(() => { const s = window.useApp.getState(); const j = s.joints[0]; s.addJoint({ type: 'slider', parent: j.parent, child: j.child, anchor: j.anchor, axis: [1, 0, 0], angle: 0, slide: 0 }); s.selectComponent(null) })
    await g(() => window.useApp.getState().setView('iso')); await page.waitForTimeout(900)
    const scr = (w) => g((w) => { const cam = window.__three.camera, V = cam.position.constructor; const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]; const r = cv.getBoundingClientRect(); const q = new V(...w).project(cam); return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height] }, w)
    const js = () => g(() => window.useApp.getState().joints.map((j) => ({ id: j.id, angle: j.angle, slide: j.slide })))
    const anc = await g(() => window.useApp.getState().joints[0].anchor)
    const pts = [['shared anchor dot', anc], ['cyan arrow tip', [anc[0] + 62, anc[1], anc[2]]], ['cyan arrow tip (far end)', [anc[0] - 62, anc[1], anc[2]]], ['cyan shaft', [anc[0] + 45, anc[1], anc[2]]]]
    if (process.env.A2_REV) pts.reverse()
    for (const [name, w] of pts) {
      const p = await scr(w), q = await scr([w[0] + 20, w[1], w[2]])
      if (await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, p) !== 'CANVAS') { console.log(`  skip ${name}: covered by a panel at ${p.map(Math.round)}`); continue }
      const before = await js(), cam0 = await camM()
      await page.mouse.move(p[0], p[1]); await page.mouse.down()
      for (let i = 1; i <= 10; i++) await page.mouse.move(p[0] + (q[0] - p[0]) * i / 10, p[1] + (q[1] - p[1]) * i / 10)
      await page.mouse.up(); await page.waitForTimeout(300)
      const after = await js(), cam1 = await camM()
      const dCam = Math.max(...cam0.map((v, i) => Math.abs(v - cam1[i])))
      console.log('  pts', name, p.map(Math.round), q.map(Math.round), await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + '.' + e.className : null }, p));
      ok(`[overlap] ${name}: drives slider J2, not revolute J1; camera still`, Math.abs(after[1].slide - before[1].slide) > 3 && after[0].angle === before[0].angle && dCam < 1e-3, { before, after, dCam })
    }
    await shot('a2-overlap')
  }
  await finish()
} catch (e) { await shot('a2-error'); await finish(e) }
