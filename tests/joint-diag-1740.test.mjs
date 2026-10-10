// JOINT DIAG-1740：關節拾取（Fusion 次序：第一拣 = 要郁件；第一件固定 → 自動對調）、圓柱↔平面 snap 唔穿透、
// 類型清單 hover 唔改選中、錨點球提示、診斷 HUD 繁體 + 匯出。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
import { Vector3 } from 'three'
const { useApp, compWorldMatrix } = await import('../src/store.ts')
const g = () => useApp.getState()
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
// CAD (z-up) box mesh → world (three) via compWorldMatrix's Rx(-90)
const boxMesh = (x0, y0, z0, x1, y1, z1) => { const v = []; for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) v.push(x, y, z); return { vertices: v, triangles: [0, 1, 2, 1, 3, 2], normals: [] } }
const comp = (id, mesh) => ({ id, name: id, mesh, pos: [0, 0, 0], rot: [0, 0, 0], color: '#888' })
const plateTop = { kind: 'planar', n: [0, 1, 0], p: [0, 8, 0] }            // plate CAD z 0..8 → world y 0..8
const shaftSide = { kind: 'cyl', axis: [0, 1, 0], p: [0, 15, 0], r: 5 }      // shaft CAD z 0..30 → world y 0..30
const worldYs = (c) => { const M = compWorldMatrix(c), v = c.mesh.vertices, out = []; for (let i = 0; i < v.length; i += 3) out.push(new Vector3(v[i], v[i + 1], v[i + 2]).applyMatrix4(M).y); return out }
async function pick(first, second, { ground = null, answer, confirm = true } = {}) {
  let asked = null
  useApp.setState({ components: [comp('PLATE', boxMesh(-30, -30, 0, 30, 30, 8)), comp('SHAFT', boxMesh(-5, -5, 0, 5, 5, 30))], joints: [], undoStack: [], redoStack: [], grounded: ground, jointPickMode: true, jointPick: null,
    appPick: async (_m, opts, def) => { asked = { opts: opts.map((o) => o.value), def }; return answer === undefined ? def : answer },
    // P1 A：混合面（圓柱↔平面）選旋轉等需軸類型時會再確認一次 — 測試預設同意以免卡在彈框
    appConfirm: async () => confirm })
  g().pickFaceForJoint(first[0], first[1])
  g().pickFaceForJoint(second[0], second[1])
  await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0))
  return asked
}

test('#3 Fusion order: first pick = moving component (child), second = parent', async () => {
  const asked = await pick(['SHAFT', shaftSide], ['PLATE', plateTop])
  const j = g().joints[0]
  assert.ok(j, g().status); assert.equal(j.child, 'SHAFT'); assert.equal(j.parent, 'PLATE')
  assert.equal(asked.def, 'revolute'); assert.equal(asked.opts[0], 'revolute', '#4 revolute is the first (default) entry')
  assert.equal(j.type, 'revolute')
})

test('#3 first-picked component is grounded → roles swap automatically (no 「已固定，唔可以做關節子件」)', async () => {
  await pick(['SHAFT', shaftSide], ['PLATE', plateTop], { ground: 'SHAFT' })
  const j = g().joints[0]
  assert.ok(j, g().status); assert.doesNotMatch(g().status, /唔可以做關節子件|不可作為關節子件/)
  assert.equal(j.parent, 'SHAFT'); assert.equal(j.child, 'PLATE')
  assert.equal(g().components.find((c) => c.id === 'SHAFT').pos.join(), '0,0,0', 'grounded shaft never moves')
})

test('#3 both grounded → clear message, no joint', async () => {
  useApp.setState({ grounded: null })
  await pick(['SHAFT', shaftSide], ['PLATE', plateTop], { ground: 'SHAFT' })   // reset
  useApp.setState({ components: g().components.map((c) => ({ ...c, grounded: true })), joints: [], jointPickMode: true, jointPick: null })
  g().pickFaceForJoint('SHAFT', shaftSide); g().pickFaceForJoint('PLATE', plateTop)
  assert.match(g().status, /兩件都已固定|兩個組件均已固定/); assert.equal(g().joints.length, 0); assert.equal(g().jointPickMode, false)
})

test('#5 cylinder ↔ plate snap: shaft end face sits ON the plate face (no half-sunk penetration)', async () => {
  await pick(['SHAFT', shaftSide], ['PLATE', plateTop])
  const shaft = g().components.find((c) => c.id === 'SHAFT')
  const ys = worldYs(shaft)
  assert.ok(near(Math.min(...ys), 8, 1e-6), `shaft bottom on the plate top (y=8), got ${Math.min(...ys)}`)
  assert.ok(near(Math.max(...ys), 38, 1e-6))
  const j = g().joints[0]
  assert.ok(near(j.anchor[1], 8) && near(Math.abs(j.axis[1]), 1), `anchor on plate face ${j.anchor}`)
  assert.equal(g().undoStack.length, 1, 'snap + joint = one undo step')
})

test('#5 plate moving onto a grounded shaft: plate face meets the shaft end (no penetration), anchor follows', async () => {
  await pick(['SHAFT', shaftSide], ['PLATE', plateTop], { ground: 'SHAFT' })
  const plate = g().components.find((c) => c.id === 'PLATE'), ys = worldYs(plate)
  assert.ok(Math.max(...ys) <= 0 + 1e-6 || Math.min(...ys) >= 30 - 1e-6, `plate clear of the shaft (y ${Math.min(...ys)}..${Math.max(...ys)})`)
  const j = g().joints[0]
  assert.ok(near(j.anchor[1], Math.max(...ys)) || near(j.anchor[1], Math.min(...ys)), `anchor on the plate face ${j.anchor}`)
})

test('#5 no penetration → height kept (user placement respected)', async () => {
  const above = { kind: 'cyl', axis: [0, 1, 0], p: [0, 65, 0], r: 5 }
  useApp.setState({ components: [comp('PLATE', boxMesh(-30, -30, 0, 30, 30, 8)), { ...comp('SHAFT', boxMesh(-5, -5, 0, 5, 5, 30)), pos: [0, 50, 0] }] })
  let asked = null
  useApp.setState({ joints: [], undoStack: [], grounded: null, jointPickMode: true, jointPick: null, appPick: async (_m, o, d) => { asked = d; return d }, appConfirm: async () => true })
  g().pickFaceForJoint('SHAFT', above); g().pickFaceForJoint('PLATE', plateTop)
  await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0))
  assert.deepEqual(g().components.find((c) => c.id === 'SHAFT').pos, [0, 50, 0])
})

test('#4 type list: hovering an option only highlights it (selection changes on click / arrow keys only)', () => {
  const pd = read('src/components/PromptDialog.tsx')
  assert.match(pd, /onMouseEnter=\{\(\) => setHover\(o\.value\)\}/)
  assert.doesNotMatch(pd, /onMouseEnter=\{\(\) => setDraft/)
  assert.match(pd, /onClick=\{\(\) => resolveDialog\(o\.value\)\}/)
})

test('#7 diagnostics HUD + report are Traditional and can be exported to a file', async () => {
  const { SC2TC_CHARS } = await import('../src/i18n/sc2tcHK.ts')
  const hud = read('src/components/DebugHud.tsx').split('\n').filter((l) => !/^\s*(\/\/|import)/.test(l)).join('\n')
  const lits = hud.match(/'[^'\n]*'|`[^`\n]*`|"[^"\n]*"|>[^<>{}\n]+</g) || []
  const sc = lits.filter((x) => [...x].some((c) => SC2TC_CHARS[c] && SC2TC_CHARS[c] !== c))
  assert.deepEqual(sc, [], 'no Simplified UI text in the HUD')
  assert.match(hud, /📋 複製問題報告/); assert.match(hud, /💾 匯出檔案/); assert.match(hud, /診斷錄製中（按一下關閉）/)
  const store = read('src/store.ts')
  assert.match(store, /'【WebCAD 問題報告】貼回給 AI 即可'/); assert.match(store, /── 操作記錄（\$\{_dbg\.length\} 條）──/)
  assert.doesNotMatch(store, /复制问题报告|操作记录（|问题报告】/)
  assert.equal(typeof g().exportDebugReport, 'function')
})

test('#2 anchor ball press explains how to use it', () => {
  assert.match(read('src/components/JointGizmo.tsx'), /hit\.part === 'anchor'[^\n]*關節錨點（軸心）/)
})

test('#1 white pointer: whole visible line (anchor → bead incl. bead radius) within ~10px is a pointer hit; rendered segment also counts', async () => {
  const { jointHandleHitInfo } = await import('../src/assembly/jointHandleDrag.ts')
  const j = { id: 'J1', type: 'revolute', anchor: [0, 0, 0], axis: [0, 1, 0], angle: 0 }   // u = (0,0,-1) → pointer to z=-30
  const project = (p) => [400 + p.x * 4, 300 + p.z * 4]   // top view, 4 px/mm → pointer (400,300)→(400,180)
  for (const f of [0.25, 0.5, 0.75, 0.95, 1.05]) {
    for (const off of [-9, 0, 9]) {
      const h = jointHandleHitInfo(j, project, 400 + off, 300 - 120 * f)
      assert.ok(h && h.kind === 'rotate', `f=${f} off=${off}`)
    }
  }
  assert.equal(jointHandleHitInfo(j, project, 400 + 9, 240)?.part, 'pointer')
  assert.equal(jointHandleHitInfo(j, project, 440, 240), null, '40px away = miss')
  const rendered = { pointer: [new Vector3(0, 0, 0), new Vector3(30, 0, 0)] }   // gizmo still showing another angle (e.g. right after Ctrl+Z)
  assert.equal(jointHandleHitInfo(j, project, 460, 300, 10, rendered)?.part, 'pointer', 'what is drawn is grabbable')
})
