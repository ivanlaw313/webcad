#!/usr/bin/env node
// SKETCH12 batch 3 真滑鼠 e2e（先 `nice -n 19 npx vite build`）：
//   nice -n 19 node scripts/e2e-sketch12-b3.mjs [--shots DIR]
// #1 偏移：打距離後方向跟游標（內／外），⇥d 標籤喺完成後見到、雙擊可改；#2 倒圓角（單角＋全部角）有 R 標籤、雙擊可改；
// #3 三條線封閉三角形 → 尺寸工具點邊 → 打 12.5 Enter → 形狀真係變、標籤顯示 12.5。
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  await page.evaluate(() => window.useApp.getState().setLang?.('zh-HK'))
  const S = () => page.evaluate(() => { const s = window.useApp.getState(); return { prof: s.sketchProfiles, sh: s.sketchShape, cons: s.skCons, dof: s.skDof, st: s.status, conflict: s.skConflict, sizing: !!s.sizing } })
  const all = (s) => [...s.prof, ...(s.sh ? [s.sh] : [])]
  const fresh = async () => {
    await page.evaluate(() => { const u = window.useApp; u.setState({ ...u.getInitialState(), introOpen: false, tour: null, appConfirm: async () => true }, true); u.getState().setLang?.('zh-HK'); u.getState().sketchOnDatumPlane('XY', 0) })
    await page.waitForTimeout(1500)
  }
  const at = (s, t) => page.cadToScreen([s, -t, 0])
  const move = async (s, t) => { const [x, y] = await at(s, t); await page.mouse.move(x, y, { steps: 8 }); await page.waitForTimeout(150) }
  const click = async (s, t) => { await move(s, t); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(300) }
  const tool = async (c) => { await page.locator(`button[data-cmd="${c}"]:visible`).first().click(); await page.waitForTimeout(250) }
  const near = (a, b, e = 0.05) => Math.abs(a - b) <= e
  const labels = () => page.evaluate(() => [...document.querySelectorAll('.sketch-dim-layer [data-dim]')].filter((e) => e.style.opacity !== '0').map((e) => e.getAttribute('data-dim')))
  const dblLabel = async (re) => {
    const box = await page.evaluate((src) => { const re = new RegExp(src); const e = [...document.querySelectorAll('.sketch-dim-layer [data-dim]')].find((x) => re.test(x.getAttribute('data-dim'))); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + Math.min(14, r.width / 2), r.top + r.height / 2] }, re.source)
    if (!box) return false
    await page.mouse.move(box[0], box[1], { steps: 4 }); await page.mouse.dblclick(box[0], box[1]); await page.waitForTimeout(300)
    return true
  }
  const typeEnter = async (v) => { await page.keyboard.press('Control+A'); await page.keyboard.type(String(v)); await page.keyboard.press('Enter'); await page.waitForTimeout(900) }
  const bbox = (sh) => { const p = sh.type === 'rect' ? [sh.a, sh.b] : sh.pts; const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((v) => Math.round(v * 1000) / 1000) }

  // ── #3 三角形尺寸 12.5 ────────────────────────────────────────────────────────
  await fresh()
  await tool('sk_polyline'); await click(0, 0); await click(40, 0); await click(20, 30); await click(0, 0)
  await page.waitForTimeout(300); await page.keyboard.press('Escape'); await page.waitForTimeout(500)
  let s = await S()
  ok('#3 setup: 3 lines closed into a triangle', all(s).length === 1 && all(s)[0].pts?.length === 3, { shapes: all(s) })
  await tool('sk_dim'); await click(20, 0); await click(20, -8)
  await page.keyboard.type('12.5'); await page.keyboard.press('Enter'); await page.waitForTimeout(1000)
  s = await S(); let tri = all(s)[0]
  const edgeLen = tri ? Math.hypot(tri.pts[1][0] - tri.pts[0][0], tri.pts[1][1] - tri.pts[0][1]) : NaN
  const dim = s.cons.find((c) => c.kind === 'dim')
  ok('#3 typed 12.5 Enter → edge really becomes 12.5, dimension value 12.5', near(edgeLen, 12.5, 1e-3) && dim?.value === 12.5 && /已更新尺寸/.test(s.st), { edgeLen, dim: dim && [dim.type, dim.value], st: s.st })
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  const lt = await labels()
  ok('#3 label shows 12.5 after the edit', lt.some((t) => /12\.5/.test(t)), lt)
  await page.shot('sk12-3-triangle-12.5')
  ok('#3 label double-click → edit 20 applies', await dblLabel(/12\.5/))
  await typeEnter(20)
  s = await S(); tri = all(s)[0]
  ok('#3 edited 12.5 → 20 by double-click', near(Math.hypot(tri.pts[1][0] - tri.pts[0][0], tri.pts[1][1] - tri.pts[0][1]), 20, 1e-3), { pts: tri.pts, st: s.st })

  // ── #1 偏移方向跟游標 + ⇥d 標籤 ────────────────────────────────────────────────
  for (const side of ['inside', 'outside']) {
    await fresh()
    await tool('sk_rect'); await click(0, 0); await click(60, 40); await page.keyboard.press('Escape'); await page.waitForTimeout(400)
    await tool('sk_offset'); await click(30, 0)
    if (side === 'inside') await move(30, 12); else await move(30, -12)
    await page.keyboard.type('5'); await page.waitForTimeout(150)
    if (side === 'inside') await move(32, 14); else await move(32, -14)   // 打完數再郁吓：方向仍然跟游標
    await page.keyboard.press('Enter'); await page.waitForTimeout(700)
    s = await S()
    const off = all(s).find((x) => x.offsetOf)
    const want = side === 'inside' ? [5, 5, 55, 35] : [-5, -5, 65, 45]
    ok(`#1 status Traditional (${side})`, /已偏移 5mm（[內外]）/.test(s.st) && !/[内双仅侧]/.test(s.st), { st: s.st })
    ok(`#1 typed 5 with the cursor ${side} → offset goes ${side === 'inside' ? 'inward' : 'outward'} (no 反向 needed)`, !!off && JSON.stringify(bbox(off)) === JSON.stringify(want), { got: off && bbox(off), want, d: off?.offsetOf?.d, st: s.st })
    if (side === 'inside') await page.shot('sk12-1-offset-inside')
  }
  // 完成命令（換返選擇）之後 ⇥5 仍然見到、雙擊改 8
  await tool('sk_select'); await page.waitForTimeout(400)
  let lb = await labels()
  ok('#1 ⇥5 offset dimension visible after finishing the command', lb.some((t) => /⇥\s*5/.test(t)), lb)
  await page.shot('sk12-1-offset-dim')
  ok('#1 ⇥ label double-click opens editor', await dblLabel(/⇥/))
  await typeEnter(8)
  s = await S(); let off = all(s).find((x) => x.offsetOf)
  ok('#1 ⇥5 → 8 by double-click (offset follows, same side)', !!off && Math.abs(off.offsetOf.d) === 8 && JSON.stringify(bbox(off)) === JSON.stringify([-8, -8, 68, 48]), { d: off?.offsetOf?.d, bb: off && bbox(off), st: s.st })
  // 反向 button while sizing flips relative to the cursor
  await fresh()
  await tool('sk_rect'); await click(0, 0); await click(60, 40); await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  await tool('sk_offset'); await click(30, 0); await move(30, 12); await page.keyboard.type('5'); await page.waitForTimeout(150)
  await page.locator('button', { hasText: '⇄ 反向' }).first().click(); await page.waitForTimeout(200)
  await page.keyboard.press('Enter'); await page.waitForTimeout(700)
  s = await S(); off = all(s).find((x) => x.offsetOf)
  ok('#1 ⇄ 反向 with the cursor inside → outward', !!off && JSON.stringify(bbox(off)) === JSON.stringify([-5, -5, 65, 45]), { bb: off && bbox(off), st: s.st })

  // ── #2 倒圓角 R 標籤 + 雙擊改 ──────────────────────────────────────────────────
  await fresh()
  await tool('sk_rect'); await click(0, 0); await click(60, 40); await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  await tool('sk_filletc'); await page.keyboard.type('10'); await page.waitForTimeout(200)
  await click(60, 40); await move(52, 32); await click(52, 32); await page.waitForTimeout(900)
  await page.keyboard.press('Escape'); await tool('sk_select'); await page.waitForTimeout(400)
  lb = await labels()
  ok('#2 single-corner fillet shows an R10 dimension label', lb.some((t) => /R\s*10/.test(t)), lb)
  await page.shot('sk12-2-fillet-r-label')
  ok('#2 R10 label double-click opens editor', await dblLabel(/R\s*10/))
  await typeEnter(6)
  s = await S()
  let rad = s.cons.find((c) => c.type === 'rad'), p = all(s).find((x) => x.verts?.length === 5)
  // 圓角弧兩端 = 角 R6 嘅兩個切點：|Δx| = |Δy| = 6（矩形冇尺寸約束，求解器可以郁寬高 —— 只驗弧本身）
  const arcEnds = p ? [p.verts[2], p.verts[3]] : null
  ok('#2 R10 → 6 by double-click (arc follows, still tangent, no conflict)', rad?.value === 6 && !!arcEnds && near(Math.abs(arcEnds[1][0] - arcEnds[0][0]), 6, 1e-3) && near(Math.abs(arcEnds[1][1] - arcEnds[0][1]), 6, 1e-3) && !s.conflict, { rad: rad?.value, verts: p?.verts, st: s.st })
  // 全部角
  await fresh()
  await tool('sk_rect'); await click(0, 0); await click(60, 40); await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  await tool('sk_filletc')
  const rIn = page.locator('.tp-num:visible').first(); await rIn.click(); await page.keyboard.press('Control+A'); await page.keyboard.type('8'); await page.keyboard.press('Tab')
  await page.getByRole('button', { name: /全部角一次過/ }).first().click(); await page.waitForTimeout(1500)
  await page.keyboard.press('Escape'); await tool('sk_select'); await page.waitForTimeout(400)
  lb = await labels()
  ok('#2 全部角 shows an R8 radius label', lb.some((t) => /R\s*8/.test(t)), lb)
  await page.shot('sk12-2-fillet-all-r-label')
  ok('#2 全部角 R label double-click opens editor', await dblLabel(/R\s*8/))
  await typeEnter(5)
  s = await S(); p = all(s).find((x) => x.verts?.length === 8)
  const rads = s.cons.filter((c) => c.type === 'rad').map((c) => c.value)
  const cornerOK = !!p && [0, 2, 4, 6].every((i) => { const A = p.verts[i], B = p.verts[i + 1]; return near(Math.abs(B[0] - A[0]), 5, 1e-3) && near(Math.abs(B[1] - A[1]), 5, 1e-3) })
  ok('#2 全部角 R8 → 5: every corner follows (equal radii)', rads.includes(5) && cornerOK && !s.conflict, { rads, verts: p?.verts, st: s.st })
})
