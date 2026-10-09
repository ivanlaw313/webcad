// CORE16 batch 3：加厚（對話框狀態／方向／對稱／合併／0 驗證／預覽）、按拉（推入／切穿原因／0 拒絕）、
// 倒角（逐邊距離編輯真係重建）、鏡像（提示／操作）、編輯條訊息槽、BOM 文案。全部用真 OCCT（node worker）。
import test from 'node:test'; import assert from 'node:assert/strict'; import { register, createRequire } from 'node:module'; import { fileURLToPath } from 'node:url'; import { readFileSync } from 'node:fs'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts'); const w = globalThis.__wheelWorker; await w.ready()
const { useApp } = await import('../src/store.ts')
const { roundFailLines, plainFeatureError } = await import('../src/ui/featureStatus.ts')
const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 10, op: 'new', cornerOrigin: true }
const vol = (m) => { const t = m.triangles, p = m.vertices; let v = 0; for (let i = 0; i < t.length; i += 3) { const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3; v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]) } return Math.abs(v) / 6 }
const zr = (m) => { let lo = 1e9, hi = -1e9; for (let i = 2; i < m.vertices.length; i += 3) { lo = Math.min(lo, m.vertices[i]); hi = Math.max(hi, m.vertices[i]) } return [lo, hi] }
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const near = (a, b, e = 0.01) => Math.abs(a - b) < e

test('#1 thicken: pos / neg / both plates and join', async () => {
  for (const [side, lo, hi] of [[undefined, 10, 12], ['neg', 8, 10], ['both', 9, 11]]) {
    assert.ok(await g().applyFeatures([BOX, { id: 'T', type: 'thickenface', near: [20, 15, 10], thick: 2, ...(side ? { side } : {}) }], 'x'))
    const pk = g().bodyMesh.parked; const z = zr(pk[pk.length - 1])
    assert.ok(near(z[0], lo) && near(z[1], hi), `${side}: ${z}`)
  }
  assert.ok(await g().applyFeatures([BOX, { id: 'T', type: 'thickenface', near: [20, 15, 10], thick: 3, side: 'both', op: 'join' }], 'x'))
  assert.equal(g().bodyMesh.parked?.length ?? 0, 0)
  assert.ok(near(vol(g().bodyMesh), 40 * 30 * 11.5, 0.5), String(vol(g().bodyMesh)))
})

test('#1 thicken dialog state: 0 is rejected with a message, negative flips direction, no prompt', async () => {
  await g().applyFeatures([BOX], 'x')
  g().toggleThicken()
  assert.equal(g().thickenMode, true)
  assert.match(g().status, /^加厚：點選/)
  g().thickenFaceAt([20, 10, -15])   // three coords of CAD (20,15,10)
  assert.equal(g().thickenPicks.length, 1)
  g().setThicken({ thick: 0 })
  assert.equal(g().thickenThick, 0); assert.match(g().status, /厚度必須大於 0/)
  await g().commitThicken()
  assert.equal(g().features.length, 1, '0 never commits (no silent 0.05)')
  g().setThicken({ thick: -3 })
  assert.equal(g().thickenThick, 3); assert.equal(g().thickenDir, 'neg')
  g().flipThicken(); assert.equal(g().thickenDir, 'pos')
  g().setThicken({ dir: 'both', op: 'join' })
  await g().commitThicken()
  const f = g().features.find((x) => x.type === 'thickenface')
  assert.deepEqual([f.thick, f.side, f.op], [3, 'both', 'join'])
  assert.equal(g().thickenMode, false)
  assert.match(g().status, /對稱 · 已合併入實體/)
  const st = rd('src/store.ts')
  const tf = st.slice(st.indexOf('thickenFaceAt: '), st.indexOf('thickenFaceAt: ') + 1500)
  assert.doesNotMatch(tf, /appPrompt|prompt\(/)
})

test('#1/#2 timeline edit bar: thicken signed thickness + side/op, press pull signed distance', () => {
  const tl = rd('src/components/Timeline.tsx')
  assert.match(tl, /pushpull: \{[^\n]*fields: \[\{ key: 'dist', label: '距離'/)
  assert.match(tl, /thickenface: \{[^\n]*key: 'side'[^\n]*'對稱'[^\n]*key: 'op'[^\n]*'合併'/)
  assert.match(tl, /const shown = tf\.side === 'neg' \? -tf\.thick : tf\.thick/)
  assert.match(tl, /side = tf\.side === 'both' \? 'both' : n < 0 \? 'neg' : 'pos'/)
})

test('#2 press pull: push inward edits, through-cut gives the real reason, 0 rejected', async () => {
  assert.ok(await g().applyFeatures([BOX, { id: 'P', type: 'pushpull', near: [20, 15, 10], dist: -4 }], 'x'))
  assert.ok(near(vol(g().bodyMesh), 7200, 0.5))
  await g().editFeature('P', { dist: -12 })
  assert.match(g().status, /按拉距離 12 mm 超過實體在此方向的厚度（約 10 mm）/)
  assert.equal(g().features.find((x) => x.id === 'P').dist, -4, 'rolled back to the last valid model')
  await g().editFeature('P', { dist: -3 })
  assert.ok(near(vol(g().bodyMesh), 8400, 0.5))
  await g().editFeature('P', { dist: 0 })
  assert.match(g().status, /按拉距離不可為 0/)
  assert.equal(g().features.find((x) => x.id === 'P').dist, -3)
  const vp = rd('src/components/Viewport.tsx')
  assert.match(vp, /title=\{tStatus\('按拉', lang\)\}/)
  assert.doesNotMatch(vp, /pushPullPicks\.length \? tStatus\('偏移面'/)
})

test('#3 chamfer: editing distance with per-edge distances really rebuilds', async () => {
  const C = { id: 'C', type: 'chamfer', distance: 1.5, distances: [1.5, 1.5], nears: [[20, 0, 10], [40, 15, 10]], cmode: 'equal', chain: true }
  assert.ok(await g().applyFeatures([BOX, C], 'x'))
  const v15 = vol(g().bodyMesh)
  await g().editFeature('C', { distance: 0.5 })
  const v05 = vol(g().bodyMesh)
  assert.ok(v05 > v15 + 50, `${v15} → ${v05}`)
  assert.equal(g().features.find((x) => x.id === 'C').distances, undefined, 'uniform per-edge list collapses to the main distance')
  // mixed per-edge values: only the edges that matched the old main value follow
  assert.ok(await g().applyFeatures([BOX, { ...C, distances: [1.5, 2] }], 'x'))
  await g().editFeature('C', { distance: 0.5 })
  assert.deepEqual(g().features.find((x) => x.id === 'C').distances, [0.5, 2])
})

test('#3 chamfer panel / failure texts are formal written Traditional', () => {
  const vp = rd('src/components/Viewport.tsx')
  const i0 = vp.indexOf("edgeRoundPick === 'chamfer' ? <>"), blk = vp.slice(i0, vp.indexOf('</> : <SelectionChip label="邊／面／特徵"', i0))
  assert.ok(blk.length > 500)
  for (const t of ['距離', '類型', '等距', '雙距離', '距離與角度', '邊／面／特徵', '相切鏈', '角類型']) assert.ok(blk.includes(t), t)
  assert.doesNotMatch(blk, />(Distance|Type|Tangent Chain|Corner Type|Flip|Angle)</)
  assert.doesNotMatch(blk, /Equal Distance|Edges\/Faces\/Features|Fusion/)
  for (const t of [...roundFailLines('zh-HK'), plainFeatureError('chamfer', 'chamfer near points failed'), plainFeatureError('chamfer', 'no edge near point'), plainFeatureError('fillet', 'G2 fillet did not converge')]) assert.doesNotMatch(t, COLLOQ, t)
})

test('#4 mirror: formal prompts, operation select, stale selection does not pre-pick 所選特徵', async () => {
  await g().applyFeatures([BOX], 'x')
  useApp.setState({ selectedFeature: 'gone', selectedFeatures: ['gone'] })
  g().openFeatDlg('mirror')
  assert.notEqual(g().featDlg.params.target, 'feature')
  assert.doesNotMatch(g().status, COLLOQ)
  useApp.setState({ selectedFeature: null, selectedFeatures: [] })
  g().setFeatParam('target', 'feature')
  await g().commitFeatDlg()
  assert.match(g().status, /^鏡像特徵：請先在時間軸點選要鏡像的特徵/)
  assert.doesNotMatch(g().status, /已唔存在|重新選/)
  g().setFeatParam('target', 'body'); g().setFeatParam('plane', 'PICK')
  await g().commitFeatDlg()
  assert.match(g().status, /^鏡像：請點選一個平面作為鏡像面/)
  g().applyMirrorFacePick([40, 5, -15], [1, 0, 0]); g().setFeatParam('mirrorOp', 1)
  await g().commitFeatDlg()
  const f = g().features.find((x) => x.type === 'mirror')
  assert.equal(f.op, 'newbody'); assert.deepEqual(f.planeN, [1, 0, 0])
  const vp = rd('src/components/Viewport.tsx')
  assert.match(vp, /data-testid="mirror-op"[^\n]*<option value="join">\{tStatus\('合併', lang\)\}<\/option><option value="newbody">\{tStatus\('新實體', lang\)\}/)
  assert.match(vp, /<option value="PICK">🎯 \{tStatus\('拾取平面…', lang\)\}/)
})

test('#5 feature edit bar reserves a message slot (no reflow)', () => {
  const tl = rd('src/components/Timeline.tsx'), css = rd('src/index.css')
  assert.match(tl, /<div className="fe-msg" data-testid="fe-msg"/)
  assert.match(css, /\.feat-editor \.fe-msg \{[^}]*flex: 0 0 100%;[^}]*contain: inline-size;[^}]*height: 32px;/)
})

test('#6 BOM status is formal written Traditional', () => {
  const st = rd('src/store.ts')
  assert.ok(st.includes("' — 點擊「匯出 CSV」才會下載'"))
  assert.ok(!st.includes('撳「匯出 CSV」先會下載'))
})

// ── CORE16 batch 4 ──
const { splitPlaneMissReason, shellFailReason } = await import('../src/store.ts')

test('b4 (a) BOM counts every visible body (plate + separate cylinder body)', async () => {
  assert.ok(await g().applyFeatures([{ ...BOX, a: 40, b: 30, c: 5 }, { id: 'Cy', type: 'prim', shape: 'cylinder', a: 10, b: 10, c: 20, op: 'newbody', at: [80, 0, 0] }], 'x'))
  assert.equal(g().bodyMesh.parked?.length, 1, 'cylinder is a separate body')
  g().openBOM()
  const rows = g().bomDialog.rows
  const body = rows.slice(1).filter((r) => /^\d+$/.test(r[0]))
  assert.equal(body.length, 2, JSON.stringify(rows))
  const massOf = (r) => Number(r[9])
  const plate = 40 * 30 * 5 / 1000 * 2.7
  const tot = body.reduce((a, r) => a + massOf(r), 0)
  assert.ok(tot > plate + 1, `total ${tot} > plate ${plate}`)
  assert.match(g().status, /點擊「匯出 CSV」才會下載/)
  // hidden bodies are left out
  useApp.setState({ bodyHidden: [g().bodyMesh.parked[0].name ? 'pk:' + g().bodyMesh.parked[0].name : 'pk#0'] })
  g().openBOM()
  assert.equal(g().bomDialog.rows.slice(1).filter((r) => /^\d+$/.test(r[0])).length, 1)
  useApp.setState({ bodyHidden: [] })
})

test('b4 (b) shell / split give specific reasons', async () => {
  assert.ok(await g().applyFeatures([BOX], 'x'))
  assert.match(shellFailReason(g().bodyMesh, 0), /壁厚必須大於 0/)
  assert.match(shellFailReason(g().bodyMesh, 30), /壁厚 30 mm 過大 — 實體最薄方向只有約 10 mm/)
  assert.equal(splitPlaneMissReason(g().bodyMesh, { axis: 'Z', offset: 5 }), null)
  assert.match(splitPlaneMissReason(g().bodyMesh, { axis: 'Z', offset: 50 }), /Z = 50 mm 的平面沒有穿過實體（實體在 Z 方向範圍為 0～10 mm）/)
  assert.match(splitPlaneMissReason(g().bodyMesh, { planeOrigin: [0, 0, 20], planeNormal: [0, 0, 1] }), /沒有穿過實體/)
  // store paths
  await g().applyFeatures([BOX, { id: 'S', type: 'shell', thickness: 30, nears: [[20, 15, 10]] }], 'x', true)
  assert.match(g().status, /抽殼失敗：壁厚 30 mm 過大/)
  assert.doesNotMatch(g().status, /重建失[敗败]/)
  await g().applyFeatures([BOX], 'x')
  g().openFeatDlg('splitbody'); g().setFeatParam('axis', 'Z'); g().setFeatParam('offset', 50)
  await g().commitFeatDlg()
  assert.match(g().status, /沒有穿過實體/)
  assert.equal(g().features.length, 1)
  g().setFeatParam('offset', '')
  await g().commitFeatDlg()
  assert.match(g().status, /請輸入分割平面的位置/)
  useApp.setState({ featDlg: null })
})

test('b4 (c) Move/Copy names + formal text, blank fields reported, Combine labels', async () => {
  assert.ok(await g().applyFeatures([BOX], 'x'))
  g().openFeatDlg('move')
  for (const [k, v] of [['moveType', 'translate'], ['dx', 50], ['dy', ''], ['dz', ''], ['createCopy', 1]]) g().setFeatParam(k, v)
  await g().commitFeatDlg()
  const cb = g().features.find((x) => x.type === 'copybody')
  assert.equal(cb?.name, '複製實體1')
  assert.match(g().status, /^已複製並移動實體/)
  assert.match(g().status, /空白欄位已按 0 計算：dy、dz/)
  const vp = rd('src/components/Viewport.tsx')
  assert.match(vp, /tStatus\('保留工具', lang\)/)
  assert.doesNotMatch(vp, /Keep Tools）|Create Copy：|Fusion Move Object/)
  assert.match(vp, /<option value="fuse">\{tStatus\('＋合併', lang\)\}/)
})
