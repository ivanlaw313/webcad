#!/usr/bin/env node
// v2.20 tester items P2–P3, real mouse + keyboard on the built bundle:
//  P2  Offset Plane: click a model face, type 12.5 → plane is 12.5 from THAT face (not XY@12.5)
//  P2  Midplane: two parallel faces picked with the mouse → the mid plane (not the old XY@30); non-parallel → 「請選取兩個平行面」
//  P2  Mirror of a body that only touches YZ: no 「橫跨鏡像面」 warning; a real straddle warning pill auto-dismisses
//  P3  sketch on offset plane 12.5 shows 12.5; tree ✎ on a plane edits it (no new sketch); axis name has no float noise;
//      clicking just beside a small hole picks its cylinder for 構造軸（過圓柱面）
// Usage (repo root, after a build):  nice -n 19 node scripts/e2e-v220-planes-mirror-p3.mjs [--shots DIR]
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  const st = (fn, a) => page.evaluate(fn, a)
  const wait = (ms) => page.waitForTimeout(ms)
  await st(() => window.useApp.getState().setLang?.('zh-HK'))
  // stepped block: base 40×30×10 (z 5..15) + boss 15×30×10 (z 15..25) + Ø4 hole through the base at (30,15)
  await st(async () => {
    const g = () => window.useApp.getState()
    window.useApp.setState({ appConfirm: async () => true })
    for (let t = 0; t < 200 && !(await g().applyFeatures([
      { id: 'b', type: 'extrude', profile: { kind: 'rect', a: [0, 0], b: [40, 30] }, height: 10, baseZ: 5, operation: 'new' },
      { id: 'u', type: 'extrude', profile: { kind: 'rect', a: [0, 0], b: [15, 30] }, height: 10, baseZ: 15, operation: 'join' },
      { id: 'h', type: 'extrude', profile: { kind: 'circle', c: [30, 15], r: 2 }, height: 10, baseZ: 5, operation: 'cut' },
    ], 'block')); t++) await new Promise((r) => setTimeout(r, 250))
  })
  const view = async () => { await st(() => { const { camera, controls } = window.__three; controls.target.set(20, 15, -15); camera.position.set(95, 90, 60); camera.lookAt(20, 15, -15); controls.update() }); await wait(500) }
  await view()
  const clickCad = async (p) => { const [x, y] = await page.cadToScreen(p); await page.mouse.move(x, y, { steps: 5 }); await wait(120); await page.mouse.click(x, y); await wait(500) }
  const S = () => st(() => { const s = window.useApp.getState(); return { status: s.status, planes: s.planes.map((p) => [p.base, p.offset]), dc: s.datumCmd && { m: s.datumCmd.method, picks: s.datumCmd.picks.map((p) => p.kind + (p.r ? ':' + p.r.toFixed(2) : '')) }, mode: s.mode, warns: s.lastBuildWarnings, dlg: s.uiDialog } })
  const okBtn = () => page.locator('[role="dialog"] [data-testid="command-confirm"]:visible').first()

  // ── P2 offset plane from a picked face ──
  await page.locator('button[data-cmd="offsetplane"]:visible').first().click(); await wait(400)
  await clickCad([30, 25, 15])   // base top face z = 15 (away from the hole)
  let s = await S()
  ok('P2 offset plane: the clicked face is taken as the reference', s.dc?.picks.length === 1, s)
  const off = page.locator('[role="dialog"].cmd-palette input[type="number"]:visible').first()
  await off.click(); await page.keyboard.press('Control+A'); await page.keyboard.type('12.5'); await wait(200)
  await okBtn().click(); await wait(1200)
  s = await S()
  ok('P2 plane is 12.5 from the picked face → XY@27.5 (not XY@12.5)', JSON.stringify(s.planes.at(-1)) === '["XY",27.5]', { planes: s.planes, status: s.status })
  await page.shot('p2-offset-face')

  // ── P2/P3 midplane between two parallel faces ──
  await page.locator('button[data-cmd="planemid"]:visible').first().click().catch(async () => st(() => window.useApp.getState().runCommand('planemid')))
  await wait(400)
  s = await S()
  ok('P3 midplane shows the usage hint 「請選取兩個平行面」', /請選取兩個平行面/.test(s.status) || (await page.locator('text=請選取兩個平行面').count()) > 0, { status: s.status })
  await clickCad([30, 25, 15]); await clickCad([7, 15, 25])   // base top (z 15) + boss top (z 25)
  await wait(800); s = await S()
  ok('P3 midplane of z 15 / z 25 faces → XY@20 (not XY@30)', JSON.stringify(s.planes.at(-1)) === '["XY",20]', { planes: s.planes, status: s.status })
  await st(() => window.useApp.getState().closeDatumCmd?.())
  // non-parallel through the offset dialog
  await page.locator('button[data-cmd="offsetplane"]:visible').first().click(); await wait(400)
  const n0 = (await S()).planes.length
  await clickCad([30, 25, 15]); await clickCad([40, 20, 10])   // top face + side face x = 40
  s = await S()
  ok('P3 non-parallel second face → 「請選取兩個平行面」, nothing created', /請選取兩個平行面/.test(s.status) && s.planes.length === n0, { status: s.status })
  await st(() => window.useApp.getState().closeDatumCmd?.()); await wait(300)

  // ── P3 small-hole cylinder pick (構造軸 · 過圓柱面), click ~3 px beside the Ø4 hole on the top face ──
  await st(() => window.useApp.getState().openDatumCmd({ type: 'axis', method: 'cyl' })); await wait(300)
  {
    const [cx, cy] = await page.cadToScreen([30, 15, 15]); const [ex, ey] = await page.cadToScreen([32, 15, 15])
    const d = Math.hypot(ex - cx, ey - cy), ux = (ex - cx) / d, uy = (ey - cy) / d
    const px = ex + ux * 3, py = ey + uy * 3   // 3 px outside the hole rim, on the flat face
    await page.mouse.move(px, py, { steps: 4 }); await page.mouse.click(px, py); await wait(800)
    s = await S()
    ok('P3 a click 3 px beside the Ø4 hole picks its cylinder (r 2)', s.dc?.picks.length === 1 && /^cyl:2\.0/.test(s.dc.picks[0]), { picks: s.dc?.picks, status: s.status, rimPx: d })
  }
  await st(() => window.useApp.getState().closeDatumCmd?.()); await wait(300)

  // ── P3 axis name float noise + plane label + tree ✎ edits the plane ──
  await st(() => window.useApp.setState((x) => ({ caxes: [...x.caxes, { dir: 'Z', at: [34.999999999999986, 0, 0] }] })))
  await wait(300)
  const tree = await page.locator('.tree-row').allInnerTexts()
  ok('P3 axis name rounded (no 34.999999999999986)', tree.some((t) => /構造軸 Z@\(35,0,0\)/.test(t)) && !tree.some((t) => /34\.9999/.test(t)), { rows: tree.filter((t) => /構造軸|參考面/.test(t)) })
  ok('P3 offset plane label keeps decimals (XY@27.5)', tree.some((t) => /參考面 XY@27\.5/.test(t)), {})
  const row = page.locator('.tree-row', { hasText: '參考面 XY@27.5' }).first()
  await row.hover(); await row.locator('[data-testid="plane-edit"]').click(); await wait(500)
  s = await S()
  ok('P3 tree ✎ on a plane opens the plane edit prompt (no new sketch)', s.mode === 'model' && s.dlg?.kind === 'prompt' && /偏移/.test(s.dlg.msg), { mode: s.mode, dlg: s.dlg })
  await page.keyboard.press('Control+A'); await page.keyboard.type('30'); await page.keyboard.press('Enter'); await wait(1000)
  s = await S()
  ok('P3 editing through ✎ moves the plane (XY@30)', s.planes.some((p) => p[0] === 'XY' && p[1] === 30), { planes: s.planes })
  // sketch on an offset plane 12.5 shows 12.5
  await st(() => window.useApp.getState().sketchOnDatumPlane('XY', 12.5)); await wait(800)
  const bz = await page.locator('[data-testid="sketch-base-offset"]').inputValue().catch(() => '')
  ok('P3 sketch panel shows 基準Z 12.5 (not 13)', bz === '12.5', { bz })
  await page.shot('p3-sketch-12_5')
  await st(async () => { await window.useApp.getState().tryExitSketch?.() }); await wait(600)
  await page.keyboard.press('Escape'); await wait(300)

  // ── P4 mirror touching vs straddling + auto-dismiss ──
  const mir = async (prof) => st(async (prof) => {
    const g = () => window.useApp.getState()
    await g().applyFeatures([{ id: 'm1', type: 'extrude', profile: prof, height: 30, operation: 'new' }], 'plate')
    await g().addMirror()
    const s = g(); return { warns: s.lastBuildWarnings, status: s.status, types: s.features.map((f) => f.type) }
  }, prof)
  let r = await mir({ kind: 'poly', pts: [[0, 0], [50, 0], [50, 8], [8, 8], [8, 40], [0, 40]] })
  ok('P4 L bracket touching YZ: mirror without the 橫跨 warning', r.types.at(-1) === 'mirror' && !r.warns.some((w) => /横跨|橫跨/.test(w)) && !/横跨|橫跨/.test(r.status), r)
  r = await mir({ kind: 'rect', a: [-10, -10], b: [30, 10] })
  const pill = page.locator('[data-testid="build-warning"]')
  ok('P4 a body that really straddles still warns (pill visible)', r.warns.some((w) => /横跨|橫跨/.test(w)) && (await pill.count()) === 1, { warns: r.warns })
  await page.shot('p4-warning-visible')
  await page.mouse.move(5, 300); await wait(11000)
  ok('P4 warning pill auto-dismissed after ~10 s', (await pill.count()) === 0, {})
  const badge = await page.locator('.vp-status-message').first().innerText().catch(() => '')
  ok('P4 status bar dropped the trailing ⚠ warning', !/横跨|橫跨/.test(badge), { badge })
  await page.shot('p4-warning-gone')
})
