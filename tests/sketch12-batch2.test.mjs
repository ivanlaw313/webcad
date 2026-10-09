// SKETCH12 batch 2（瀏覽器測試員）：延伸、橢圓（約束/DOF/半軸尺寸可改、短軸>長軸處理、無重複標籤、提示）、
// 槽（長度/槽寬驅動尺寸、槽寬 0 拒絕、小數、輸入後不再靜默多建槽、模式預覽）、修剪（正式書面語、無相交整條刪除有訊息且可撤銷）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire, register } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
const { useApp } = await import('../src/store.ts')
const { slotConstraints, slotCenters, slotModeReadout } = await import('../src/sketch/slotCons.ts')
const { ellipseAxisPick, editEllipseSemi, normalizeMajorFirst } = await import('../src/sketch/ellipseDims.ts')
const { solveFree } = await import('../src/sketch/freesolve.ts')
const g = () => useApp.getState()
const settle = (ms = 120) => new Promise((r) => setTimeout(r, ms))
const fresh = (extra = {}) => useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchPlane: 'XY', sketchProfiles: [], sketchShape: null, skCons: [], appConfirm: async () => true, ...extra }, true)
const type = (...keys) => { for (const k of keys) for (const c of (k.length > 1 && !/^[A-Z]/.test(k) ? k.split('') : [k])) g().sketchTypeKey(c) }
const COLLOQ = /[撚仲係嘅唔啲冇咗喺嗰]|Fusion/
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

test('Extend: clicking a line end extends it to the nearest crossing line; undoable', async () => {
  const L = { type: 'poly', pts: [[0, 0], [20, 0]], verts: [[0, 0], [20, 0]], bulges: [0], open: true }
  const W = { type: 'poly', pts: [[40, -20], [40, 20]], verts: [[40, -20], [40, 20]], bulges: [0], open: true }
  fresh({ sketchTool: 'extend', sketchProfiles: [L, W] })
  await g().skExtendAt([18, 0]); await settle()
  const v = g().sketchProfiles[0].verts
  assert.ok(Math.abs(v[1][0] - 40) < 1e-4 && Math.abs(v[1][1]) < 1e-4, 'line end reaches x=40: ' + JSON.stringify(v) + ' ' + g().status)
  assert.doesNotMatch(g().status, COLLOQ)
  await g().undo(); await settle()
  assert.equal(g().sketchProfiles[0].verts[1][0], 20, 'Ctrl+Z restores the original end')
  fresh({ sketchTool: 'extend', sketchProfiles: [L] })
  await g().skExtendAt([18, 0])
  assert.match(g().status, /延伸/); assert.doesNotMatch(g().status, COLLOQ)
})

test('Slot: constraints give DOF 2 (aligned) with driving length + width; widths edit through the dimension', async () => {
  fresh({ sketchTool: 'slot', slotMode: 'cc', sketchSlotW: 12.5 })
  await g().onSketchClick([0, 0]); await g().onSketchClick([30, 0]); await settle(250)
  const sh = g().sketchShape
  assert.equal(sh?.verts?.length, 4, 'slot committed')
  const dims = g().skCons.filter((c) => c.kind === 'dim')
  assert.deepEqual(dims.map((c) => c.type).sort(), ['len', 'p2l'])
  assert.equal(dims.find((c) => c.type === 'len').value, 30)
  assert.equal(dims.find((c) => c.type === 'p2l').value, 12.5)
  assert.match(g().status, /12\.5/, 'decimals in status: ' + g().status)
  await g().resolveSk(); await settle()
  assert.equal(g().skConflict, false)
  assert.equal(g().skDof, 2, 'only position remains')
  const w = dims.find((c) => c.type === 'p2l')
  await g().editSkDim(w.id, 16); await settle(250)
  const V = g().sketchShape.verts
  assert.ok(Math.abs(Math.abs(V[0][1] - V[1][1]) - 16) < 1e-3, 'width now 16: ' + JSON.stringify(V))
})

test('Slot width 0 is rejected with a formal message (no silent 20)', () => {
  fresh({ sketchTool: 'slot', sketchSlotW: 8 })
  g().setSketchSlotW(0)
  assert.equal(g().sketchSlotW, 8, 'keeps old width')
  assert.match(g().status, /槽寬必須大於 0/); assert.doesNotMatch(g().status, COLLOQ)
  g().setSketchSlotW(NaN); assert.equal(g().sketchSlotW, 8)
  g().setSketchSlotW(6.5); assert.equal(g().sketchSlotW, 6.5)
})

test('Slot typed: length Tab width; further digits after Enter do not create another slot', async () => {
  fresh({ sketchTool: 'slot', slotMode: 'cc', sketchSlotW: 10 })
  await g().onSketchClick([0, 0])
  type('25', 'Tab', '7.5', 'Enter'); await settle(250)
  assert.equal(g().sketchShape?.verts?.length, 4)
  assert.match(g().status, /7\.5/)
  assert.equal(g().sketchSlotW, 7.5)
  const n = g().sketchProfiles.length + (g().sketchShape ? 1 : 0)
  type('40', 'Enter', '10', 'Enter'); await settle(150)
  assert.equal(g().sketchProfiles.length + (g().sketchShape ? 1 : 0), n, 'no extra slot')
  assert.equal(g().sketchStart, null, 'no silent start point')
  assert.match(g().status, /請先在畫布點選起點/)
  g().sketchTypeKey('0'); g().sketchTypeKey('Tab'); assert.equal(g().sketchStart, null)
  fresh({ sketchTool: 'slot', sketchSlotW: 10 }); await g().onSketchClick([0, 0]); type('25', 'Tab', '0', 'Enter')
  assert.match(g().status, /槽寬必須大於 0/)
})

test('Slot modes: overall / centre-point centres match the preview helper and are labelled', () => {
  assert.deepEqual(slotCenters('overall', [0, 0], [40, 0], 5), { c0: [5, 0], c1: [35, 0] })
  assert.deepEqual(slotCenters('centerpt', [0, 0], [15, 0], 5), { c0: [-15, 0], c1: [15, 0] })
  assert.ok('error' in slotCenters('overall', [0, 0], [8, 0], 5))
  assert.match(slotModeReadout('overall', [0, 0], [40, 0], 10), /總長模式：總長 40/)
  assert.match(slotModeReadout('centerpt', [0, 0], [15, 0], 10), /中心點模式.*心心距 30/)
  assert.match(slotModeReadout('cc', [0, 0], [12.5, 0], 10), /心心模式：心心距 12\.5/)
  const sl = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
  assert.match(sl, /slotCenters\(st\.slotMode, start, preview, r\)/, 'preview uses the same centres')
})

test('Ellipse: DOF 5 free; semi-axis edit keeps centre/rotation, adds driving dim, rejects minor > major', async () => {
  fresh({ sketchTool: 'ellipse', ellipseCreation: 'axis-aligned' })
  await g().onSketchClick([10, 5]); await g().onSketchClick([30, 15]); await settle(250)
  const sh = g().sketchShape
  assert.deepEqual([sh.ell.cx, sh.ell.cy, sh.ell.rx, sh.ell.ry], [10, 5, 20, 10])
  await g().refreshSkDof(); assert.equal(g().skDof, 5)
  g().setEllipseAxis('shape', 0, 25); await settle(250)
  let e = g().sketchShape.ell
  assert.deepEqual([e.cx, e.cy, e.rx, e.ry, e.rot], [10, 5, 25, 10, 0])
  assert.ok(g().skCons.some((c) => c.kind === 'dim' && c.type === 'len' && c.a.kind === 'ellipse-axis' && c.a.idx === 0 && c.value === 25))
  assert.equal(g().skDof, 4)
  g().setEllipseAxis('shape', 1, 30)
  assert.match(g().status, /半短軸不可大於半長軸/); assert.equal(g().sketchShape.ell.ry, 10)
  g().setEllipseAxis('shape', 1, 0); assert.match(g().status, /尺寸已拒絕/)
  await g().undo(); await settle(); assert.equal(g().sketchShape.ell.rx, 20, 'undo restores')
})

test('Ellipse: Dimension tool click on the curve dimensions the nearer semi-axis', async () => {
  const ell = { cx: 0, cy: 0, rx: 20, ry: 10, rot: 0 }
  assert.equal(ellipseAxisPick(ell, [20, 1]), 0); assert.equal(ellipseAxisPick(ell, [1, 10]), 1)
  assert.equal(ellipseAxisPick({ ...ell, rot: 90 }, [0, 20]), 0)
  fresh({ sketchTool: 'ellipse', ellipseCreation: 'axis-aligned' })
  await g().onSketchClick([0, 0]); await g().onSketchClick([20, 10]); await settle(200)
  g().setSketchTool('dimension')
  await g().onSketchClick([10, 8.660254]); await settle(200)
  const d = g().skCons.find((c) => c.kind === 'dim' && c.a.kind === 'ellipse-axis')
  assert.ok(d, 'axis dim placed: ' + g().status)
  assert.equal(d.a.idx, 1); assert.equal(d.value, 10)
})

test('Ellipse: three-point minor > major is normalised; labels are 半長軸/半短軸 (no duplicate bbox readouts); hint wording', () => {
  const n = normalizeMajorFirst({ cx: 0, cy: 0, rx: 5, ry: 9, rot: 0 })
  assert.ok(n.swapped); assert.deepEqual([n.ell.rx, n.ell.ry, n.ell.rot], [9, 5, 90])
  assert.ok('error' in editEllipseSemi({ cx: 0, cy: 0, rx: 9, ry: 5, rot: 0 }, 0, 4))
  const sl = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
  assert.match(sl, /'半長軸' : '半短軸'/)
  assert.doesNotMatch(store, /⬯ 寬 \$\{f\(0\)\} × 高/)
  assert.match(store, /⬯ 水平軸全長 \$\{f\(0\)\} × 豎直軸全長/)
})

test('Trim: formal wording; no-intersection delete keeps a status message and is undoable', async () => {
  const L = { type: 'poly', pts: [[0, 0], [20, 0]], verts: [[0, 0], [20, 0]], bulges: [0], open: true }
  const C = { type: 'circle', c: [50, 50], r: 5 }
  fresh({ sketchTool: 'trim', sketchProfiles: [L, C], skCons: [{ id: 'k12tv', kind: 'con', type: 'h', a: { kind: 'edge', shape: 0, idx: 0 } }] })
  await g().skTrimAt([10, 0]); await settle(200)
  assert.equal(g().sketchProfiles.length, 1, 'line deleted')
  assert.match(g().status, /已刪除整條輪廓（與其他幾何沒有相交/, g().status)
  assert.doesNotMatch(g().status, COLLOQ)
  await g().undo(); await settle()
  assert.equal(g().sketchProfiles.length, 2, 'undo restores the line')
  for (const m of store.matchAll(/'修剪：[^']*'|`已(?:修剪|刪除整條)[^`]*`/g)) assert.doesNotMatch(m[0], COLLOQ, m[0])
  const rib = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
  for (const id of ['sk_trim', 'sk_extend']) { const tip = rib.match(new RegExp(`id: '${id}'[^\\n]*tip: '([^']*)'`))[1]; assert.doesNotMatch(tip, COLLOQ, tip) }
})

test('slotConstraints: 4 tangents + equal + h + len + width', async () => {
  const V = [[30, 5], [30, -5], [0, -5], [0, 5]]
  let n = 0; const cons = slotConstraints(0, V, () => ({ id: 'k12s' + n++ }))
  assert.deepEqual(cons.map((c) => c.type), ['tangent', 'tangent', 'tangent', 'tangent', 'equal', 'h', 'len', 'p2l'])
  assert.equal(cons[6].value, 30); assert.equal(cons[7].value, 10)
})

test('Offset: value typed in the panel wins over the cursor distance on the first pick', async () => {
  fresh({ sketchTool: 'offset', sketchProfiles: [{ type: 'rect', a: [0, 0], b: [40, 20] }] })
  g().setSketchOffsetD(3)
  await g().skOffsetAt([20, 20]); g().onSketchMove([20, 32]); await g().skOffsetAt([20, 32]); await settle(150)
  const off = g().sketchProfiles.find((s) => s.offsetOf)
  assert.ok(off, 'offset made: ' + g().status)
  assert.equal(Math.abs(off.offsetOf.d), 3, 'typed 3, not cursor 12')
})

test('Right-click on a constraint glyph offers 刪除約束', () => {
  const sl = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
  assert.match(sl, /l\.remove \? \(e\) => \{ e\.preventDefault\(\); e\.stopPropagation\(\); useApp\.getState\(\)\.selectSkCon\(l\.remove!\); setConMenu/)
  assert.match(sl, /data-testid="constraint-menu-delete"[^\n]*removeSkCon\(conMenu\.conId\)/)
  assert.match(sl, /tStatus\('刪除約束', lang\)/)
})
