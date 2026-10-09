#!/usr/bin/env node
// ASM2 P1：圓柱以「新實體」建立 → 自動成活動體（或樹右鍵／⋯／雙擊「設為活動」）→ 打孔穿過該圓柱。
// Usage: nice -n 19 node scripts/e2e-activate-body.mjs [--port 4393] [--shots /tmp/asm2/act]
import { launch } from './e2e-lib.mjs'
const { page, ok, finish, shot } = await launch()
const g = (fn, a) => page.evaluate(fn, a)
try {
  await g(async () => {
    const s = () => window.useApp.getState()
    window.useApp.setState({ components: [], joints: [], undoStack: [], redoStack: [], selectedParkedIndex: null, activeBodyName: '' })
    const plate = { id: 'plate', type: 'extrude', profile: { kind: 'rect', a: [-50, -40], b: [50, 40] }, height: 8, operation: 'new' }
    for (let t = 0; t < 200 && !(await s().applyFeatures([plate], 'plate')); t++) await new Promise((r) => setTimeout(r, 250))
    const cyl = { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [20, 0], r: 10 }, height: 40, baseZ: 8, operation: 'newbody' }
    await s().applyFeatures([...s().features, cyl], 'cyl')
  })
  await page.waitForFunction(() => (window.useApp.getState().bodyMesh?.parked?.length ?? 0) === 1, null, { timeout: 60000 })
  const auto = await g(() => {
    const m = window.useApp.getState().bodyMesh
    const vol = (mesh) => { if (!mesh?.vertices?.length) return 0; const v = mesh.vertices; let xn=1e9,xp=-1e9,yn=1e9,yp=-1e9,zn=1e9,zp=-1e9; for (let i=0;i<v.length;i+=3){ xn=Math.min(xn,v[i]); xp=Math.max(xp,v[i]); yn=Math.min(yn,v[i+1]); yp=Math.max(yp,v[i+1]); zn=Math.min(zn,v[i+2]); zp=Math.max(zp,v[i+2])} return (xp-xn)*(yp-yn)*(zp-zn) }
    return { active: vol(m), parked: vol(m.parked[0]), nParked: m.parked.length }
  })
  ok('[auto] 新實體 cylinder is the active body (plate parked)', auto.nParked === 1 && auto.active < 25000 && auto.parked > 50000, auto)
  // tree: parked row has 設為活動 in right-click and ⋯
  const parked = page.locator('[data-testid="tree-body-parked-0"]')
  ok('[tree] parked body row present', await parked.count() === 1, {})
  ok('[tree] ● activate + ⋯ buttons on the parked row', await page.locator('[data-testid="tree-body-activate-0"]').count() === 1 && await page.locator('[data-testid="tree-body-more-0"]').count() === 1, {})
  await page.locator('[data-testid="tree-body-more-0"]').click(); await page.waitForTimeout(200)
  ok('[tree] ⋯ menu lists 設為活動', await page.locator('.tree-ctx-menu [data-key="activate"]').count() === 1, {})
  await page.keyboard.press('Escape'); await page.waitForTimeout(150)
  // swap to plate via activate, then back to cylinder via double-click (prove both paths)
  await page.locator('[data-testid="tree-body-activate-0"]').click()
  await page.waitForFunction(() => { const m = window.useApp.getState().bodyMesh; if (!m?.parked?.[0]) return false; const vol = (mesh) => { const v = mesh.vertices; let xn=1e9,xp=-1e9,yn=1e9,yp=-1e9,zn=1e9,zp=-1e9; for (let i=0;i<v.length;i+=3){ xn=Math.min(xn,v[i]); xp=Math.max(xp,v[i]); yn=Math.min(yn,v[i+1]); yp=Math.max(yp,v[i+1]); zn=Math.min(zn,v[i+2]); zp=Math.max(zp,v[i+2])} return (xp-xn)*(yp-yn)*(zp-zn) }; return vol(m) > 50000 }, null, { timeout: 60000 })
  ok('[activate] ● click makes the plate active', true, {})
  await parked.dblclick(); await page.waitForTimeout(800)
  await page.waitForFunction(() => { const m = window.useApp.getState().bodyMesh; const vol = (mesh) => { const v = mesh.vertices; let xn=1e9,xp=-1e9,yn=1e9,yp=-1e9,zn=1e9,zp=-1e9; for (let i=0;i<v.length;i+=3){ xn=Math.min(xn,v[i]); xp=Math.max(xp,v[i]); yn=Math.min(yn,v[i+1]); yp=Math.max(yp,v[i+1]); zn=Math.min(zn,v[i+2]); zp=Math.max(zp,v[i+2])} return (xp-xn)*(yp-yn)*(zp-zn) }; return vol(m) < 25000 }, null, { timeout: 60000 })
  ok('[activate] double-click parked row restores the cylinder as active', true, {})
  ok('[tree] active row is bold with data-testid', await page.locator('[data-testid="tree-body-active"]').count() === 1, {})
  // hole through the active cylinder
  const before = await g(() => ({ tris: window.useApp.getState().bodyMesh.triangles.length, feats: window.useApp.getState().features.length }))
  await g(async () => { await window.useApp.getState().addHole(20, 0, window.useApp.getState().bodyTopZ) })
  await page.waitForFunction((n0) => window.useApp.getState().features.length > n0, before.feats, { timeout: 60000 })
  await page.waitForTimeout(800)
  const after = await g(() => {
    const s = window.useApp.getState()
    return { feat: s.features.map((f) => f.type), tris: s.bodyMesh.triangles.length, nParked: s.bodyMesh.parked?.length ?? 0, status: s.status }
  })
  ok('[hole] hole applied on the active cylinder (feature present, mesh changed, plate still parked)', after.feat.includes('hole') && after.tris !== before.tris && after.nParked === 1 && !/重建失敗|已保留上一個/.test(after.status), { before, after })
  await shot('activate-body-hole')
  await finish()
} catch (e) { await shot('activate-body-error'); await finish(e) }
