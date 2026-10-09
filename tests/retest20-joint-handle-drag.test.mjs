// RETEST20 #1：真瀏覽器拖 JointGizmo 可見嘅橙色旋轉環 / 青色滑動軸 → 關節值變、鏡頭唔轉。
// 真瀏覽器重現：scripts/e2e-joint-drag.mjs（Playwright + vite preview，唔喺預設測試）。呢度無瀏覽器覆蓋：
// ① 可見環／軸嘅螢幕命中（真 PerspectiveCamera 投影）② 射線→角度／滑動數學（跟滑鼠、跨 ±180° unwrap）
// ③ claimJointHandle：停 Orbit、window capture move/up 驅動、放手還原＋食咗 release click ④ store：一下拖 = 一步 undo
// ⑤ 接線：Viewport pointerdown capture 喺 canvas（Orbit）之前 claim + stopPropagation；JointGizmo 註冊 claimer。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Vector3, Vector2, PerspectiveCamera, Raycaster } from 'three'
const H = await import('../src/assembly/jointHandleDrag.ts')
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()
const W = 800, Hh = 600

const cam = new PerspectiveCamera(40, W / Hh, 0.5, 5000); cam.position.set(120, 160, 220); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix()
const project = (p) => { const q = p.clone().project(cam); return q.z > 1 ? null : [(q.x + 1) / 2 * W, (1 - q.y) / 2 * Hh] }
const rayAt = (x, y) => { const rc = new Raycaster(); rc.setFromCamera(new Vector2(x / W * 2 - 1, 1 - y / Hh * 2), cam); return rc.ray }
const rev = { id: 'J1', type: 'revolute', anchor: [0, 0, 0], axis: [0, 1, 0], angle: 0, slide: 0 }
const sld = { id: 'J2', type: 'slider', anchor: [0, 0, 0], axis: [1, 0, 0], angle: 0, slide: 0 }
const ringPt = (j, deg) => { const { a, u, v } = H.jointBasis(j); return a.clone().addScaledVector(u, 30 * Math.cos(deg * Math.PI / 180)).addScaledVector(v, 30 * Math.sin(deg * Math.PI / 180)) }

test('visible orange ring / cyan slide axis are hit on screen; empty space / part centre are not', () => {
  for (const d of [-150, -60, 0, 45, 120]) { const [x, y] = project(ringPt(rev, d)); assert.equal(H.jointHandleHit(rev, project, x + 3, y - 2), 'rotate', `ring @${d}°`) }
  // RETEST21 #1：錨點橙球同白色指針都係旋轉把手（用戶自然會撳）；環入面其他空位唔係
  assert.equal(H.jointHandleHit(rev, project, ...project(new Vector3(0, 0, 0))), 'rotate', 'anchor ball is a rotate handle (RETEST21)')
  assert.equal(H.jointHandleHit(rev, project, ...project(ringPt(rev, 135).multiplyScalar(0.5))), null, 'empty fan interior is not a handle')
  assert.equal(H.jointHandleHit(rev, project, 5, 5), null)
  for (const t of [-50, -20, 25, 55]) { const [x, y] = project(new Vector3(t, 0, 0)); assert.equal(H.jointHandleHit(sld, project, x, y + 4), 'slide', `axis @${t}`) }
  assert.equal(H.jointHandleHit(sld, project, ...project(new Vector3(90, 0, 0))), null, 'past the arrow end')
  // ring geometry mirrors JointGizmo (default ±180°, R=30, flip negates axis)
  const pts = H.jointRingPoints(rev); assert.equal(pts.length, 49); for (const p of pts) assert.ok(Math.abs(p.length() - 30) < 1e-9 && Math.abs(p.y) < 1e-9)
  assert.ok(H.jointBasis({ ...rev, flip: true }).ax.y < 0)
  const [s0, s1] = H.jointSlideSegment({ ...sld, sMin: -10, sMax: 40 }); assert.deepEqual([s0.x, s1.x], [-10, 40])
})

test('rotate session: angle follows the mouse around the ring (incl. past ±180° unwrap)', () => {
  const out = []
  const s = H.startJointHandleDrag(rev, 'rotate', rayAt(...project(ringPt(rev, 20))), (p) => out.push(p), () => out.push('end'))
  assert.ok(s && s.kind === 'rotate')
  for (let d = 30; d <= 380; d += 10) s.move(rayAt(...project(ringPt(rev, d))))
  assert.ok(Math.abs(out.at(-1).angle - 360) < 0.05, `accumulated ${out.at(-1).angle}`)
  for (let i = 1; i < out.length; i++) assert.ok(out[i].angle > out[i - 1].angle, 'monotonic while dragging one way')
  s.end(); assert.equal(out.at(-1), 'end')
  // starting from an existing angle keeps it as the base
  const o2 = []; const s2 = H.startJointHandleDrag({ ...rev, angle: 90 }, 'rotate', rayAt(...project(ringPt(rev, 0))), (p) => o2.push(p), () => {})
  s2.move(rayAt(...project(ringPt(rev, -45)))); assert.ok(Math.abs(o2[0].angle - 45) < 0.05, `90-45 = ${o2[0].angle}`)
})

test('slide session: offset follows the mouse along the axis', () => {
  const out = []
  const s = H.startJointHandleDrag({ ...sld, slide: 5 }, 'slide', rayAt(...project(new Vector3(10, 0, 0))), (p) => out.push(p), () => {})
  s.move(rayAt(...project(new Vector3(32.5, 0, 0)))); assert.ok(Math.abs(out[0].slide - 27.5) < 0.01, `${out[0].slide}`)
  s.move(rayAt(...project(new Vector3(-20, 0, 0)))); assert.ok(Math.abs(out[1].slide + 25) < 0.01, `${out[1].slide}`)
  // ray parallel to the axis → no session (avoid a jump)
  assert.equal(H.startJointHandleDrag(sld, 'slide', { origin: new Vector3(-100, 0, 0), direction: new Vector3(1, 0, 0) }, () => {}, () => {}), null)
})

test('claimJointHandle: disables Orbit, drives via window capture move/up, restores, swallows the release click', async () => {
  const ls = new Map(); const win = { addEventListener: (t, f, c) => { assert.equal(c, true, 'capture'); ls.set(t, f) }, removeEventListener: (t, f) => { if (ls.get(t) === f) ls.delete(t) } }
  const ctl = { enabled: true }, log = []
  H.registerJointHandleClaimer('t', (x, y) => (x === 10 ? { move: (a, b) => log.push([a, b]), end: () => log.push('end'), controls: ctl } : null))
  assert.equal(H.claimJointHandle(99, 0, win), false, 'miss → not claimed (Orbit keeps working)'); assert.equal(ls.size, 0)
  assert.equal(H.claimJointHandle(10, 0, win), true)
  assert.equal(ctl.enabled, false, 'Orbit disabled for the drag')
  ls.get('pointermove')({ clientX: 12, clientY: 3 }); ls.get('pointermove')({ clientX: 20, clientY: 7 })
  ls.get('pointerup')({})
  assert.deepEqual(log, [[12, 3], [20, 7], 'end']); assert.equal(ctl.enabled, true, 'restored')
  assert.ok(!ls.has('pointermove') && !ls.has('pointerup'))
  let stopped = false; ls.get('click')({ stopPropagation: () => { stopped = true }, preventDefault() {} }); assert.ok(stopped, 'release click does not reach R3F (no accidental re-select)')
  await new Promise((r) => setTimeout(r, 5)); assert.ok(!ls.has('click'), 'click swallow is one-shot')
  H.registerJointHandleClaimer('t', null); assert.equal(H.claimJointHandle(10, 0, win), false)
})

test('store: a ring drag gesture = joint angle changes, one undo step (same calls as JointGizmo claimer)', () => {
  const mesh = () => ({ vertices: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]), indices: new Uint32Array([0, 1, 2]), normals: new Float32Array(9) })
  const comp = (id) => ({ id, name: id, mesh: mesh(), pos: [0, 0, 0], rot: [0, 0, 0], color: '#888' })
  useApp.setState({ components: [comp('P'), comp('S')], joints: [{ ...rev, name: 'J', parent: 'P', child: 'S' }], undoStack: [], redoStack: [], mode: 'model', grounded: null })
  let drove = false
  const s = H.startJointHandleDrag(g().joints[0], 'rotate', rayAt(...project(ringPt(rev, 0))), (patch) => { if (!drove) { g().beginJointDrive(); drove = true } g().setJointValue('J1', patch) }, () => { if (drove) g().endJointDrive() })
  for (let d = 5; d <= 70; d += 5) s.move(rayAt(...project(ringPt(rev, d))))
  s.end()
  assert.ok(Math.abs(g().joints[0].angle - 70) < 0.1, `angle ${g().joints[0].angle}`)
  assert.equal(g().undoStack.length, 1)
})

test('wiring: Viewport claims in WINDOW pointerdown capture (before Orbit/R3F/gumball, RETEST21); JointGizmo registers the visible-glyph claimer', () => {
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(vp, /claimJointHandle\(e\.clientX, e\.clientY, window, e\.target\)\) \{ e\.stopPropagation\(\); e\.preventDefault\(\) \}/)
  assert.match(vp, /window\.addEventListener\('pointerdown', onDown, true\)/)
  const jg = readFileSync(new URL('../src/components/JointGizmo.tsx', import.meta.url), 'utf8')
  assert.match(jg, /registerJointHandleClaimer\('joint:' \+ j\.id/)
  assert.match(jg, /useJointHandleDrag\(j\)/)
  assert.match(jg, /beginJointDrive\(\)/); assert.match(jg, /endJointDrive\(\)/)
  const pj = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.ok(!JSON.stringify(pj.scripts ?? {}).includes('e2e-joint-drag'), 'Playwright repro is not in the default test run')
})
