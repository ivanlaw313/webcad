// ASM2 #1：測試員「關節把手 J1：接 ring（最近 ring 1.5px）」但拖完角度仍然 0°。
// 真瀏覽器重現（scripts/e2e-joint-ring.mjs，live index-9IA2uNnt）：正交前視（標準視圖自動正交）＋直立軸 → 環係一條橫線，
// 射線同關節平面平行 → rayPolarAngle 永遠 null → 一度都唔郁；低角度透視沿條線橫拖亦只郁 ~1°。
// 修正：|視線·軸| < RING_EDGE_ON_COS → 螢幕切線模式（沿住見到嘅環拖 = 轉）；其他角度維持平面極角（跟游標）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { Vector3, Vector2, PerspectiveCamera, OrthographicCamera, Raycaster } from 'three'
const H = await import('../src/assembly/jointHandleDrag.ts')
const W = 1000, Hh = 700
const mk = (cam) => {
  cam.updateMatrixWorld(); cam.updateProjectionMatrix()
  const project = (p) => { const q = p.clone().project(cam); return q.z > 1 || q.z < -1 ? null : [(q.x + 1) / 2 * W, (1 - q.y) / 2 * Hh] }
  const rayAt = (x, y) => { const rc = new Raycaster(); rc.setFromCamera(new Vector2(x / W * 2 - 1, 1 - y / Hh * 2), cam); return rc.ray.clone() }
  return { project, rayAt }
}
const rev = { id: 'J1', type: 'revolute', anchor: [0, 10, 0], axis: [0, -1, 0], angle: 0, slide: 0 }
const ringPt = (j, deg) => { const { a, u, v } = H.jointBasis(j); return a.clone().addScaledVector(u, 30 * Math.cos(deg * Math.PI / 180)).addScaledVector(v, 30 * Math.sin(deg * Math.PI / 180)) }
const ortho = () => { const c = new OrthographicCamera(-100, 100, 70, -70, 0.1, 5000); c.position.set(0, 10, 400); c.lookAt(0, 10, 0); return c }

function drag(j, cam, grabDeg, dx, dy, off = 1.5) {
  const { project, rayAt } = mk(cam)
  const p = project(ringPt(j, grabDeg)); const x = p[0], y = p[1] + off
  const hit = H.jointHandleHitInfo(j, project, x, y)
  const out = []
  const s = H.startJointHandleDrag(j, hit?.kind ?? 'rotate', rayAt(x, y), (q) => out.push(q), () => {}, { project, x, y })
  for (let i = 1; i <= 12; i++) s.move(rayAt(x + dx * i / 12, y + dy * i / 12), x + dx * i / 12, y + dy * i / 12)
  return { hit, mode: s.mode, angle: out.at(-1)?.angle ?? j.angle ?? 0 }
}

test('ortho front view, vertical axis (ring edge-on): grab 1.5 px off the line, drag along it → angle changes; dragging back restores', () => {
  for (const g of [70, -100, 150, -60]) {
    const r = drag(rev, ortho(), g, 60, 0)
    assert.ok(r.hit && r.hit.kind === 'rotate', `handle hit @${g}`)
    assert.equal(r.mode, 'screen')
    assert.ok(Math.abs(r.angle) > 15, `@${g}° drag +60px → ${r.angle}`)
    const back = drag({ ...rev, angle: r.angle }, ortho(), g, -60, 0)
    assert.ok(Math.abs(back.angle) < 0.01, `drag back returns to 0 (got ${back.angle})`)
  }
  // anchor ball in an edge-on view also turns (tester: 「接 anchor」 no effect)
  const { project, rayAt } = mk(ortho()); const [x, y] = project(new Vector3(0, 10, 0)); const out = []
  const s = H.startJointHandleDrag(rev, 'rotate', rayAt(x, y), (q) => out.push(q), () => {}, { project, x, y })
  s.move(rayAt(x + 40, y), x + 40, y); assert.ok(Math.abs(out.at(-1).angle) > 15, `anchor drag ${out.at(-1)?.angle}`)
})

test('low-elevation perspective (≈4°): dragging along the flattened ring turns it; opposite drags give opposite signs', () => {
  const c = () => { const k = new PerspectiveCamera(40, W / Hh, 0.5, 5000); const el = 4 * Math.PI / 180; k.position.set(0, 10 + 250 * Math.sin(el), 250 * Math.cos(el)); k.lookAt(0, 10, 0); return k }
  const r = drag(rev, c(), 150, 75, 0)
  assert.equal(r.mode, 'screen'); assert.ok(Math.abs(r.angle) > 20, `${r.angle}`)
  const l = drag(rev, c(), 150, -75, 0); assert.ok(Math.sign(l.angle) === -Math.sign(r.angle), `${l.angle} vs ${r.angle}`)
})

test('open ring (iso) keeps the plane polar mode that follows the cursor exactly; old callers without screen info still work', () => {
  const c = new PerspectiveCamera(40, W / Hh, 0.5, 5000); c.position.set(120, 160, 220); c.lookAt(0, 10, 0)
  const { project, rayAt } = mk(c)
  const p0 = project(ringPt(rev, 20)), out = []
  const s = H.startJointHandleDrag(rev, 'rotate', rayAt(...p0), (q) => out.push(q), () => {}, { project, x: p0[0], y: p0[1] })
  assert.equal(s.mode, 'plane')
  const p1 = project(ringPt(rev, 80)); s.move(rayAt(...p1), ...p1)
  assert.ok(Math.abs(out.at(-1).angle - 60) < 0.05, `${out.at(-1).angle}`)
  assert.equal(H.startJointHandleDrag(rev, 'rotate', rayAt(...p0), () => {}, () => {}).mode, 'plane')
})

test('claimJointHandle: pointermove during a handle drag is not propagated (no orbit / hover underneath)', () => {
  const L = {}
  const win = { addEventListener: (t, f) => { (L[t] ??= []).push(f) }, removeEventListener: (t, f) => { L[t] = (L[t] || []).filter((x) => x !== f) } }
  const ctl = { enabled: true }; const moves = []
  H.registerJointHandleClaimer('t', () => ({ move: (x, y) => moves.push([x, y]), end: () => {}, controls: ctl }))
  try {
    assert.equal(H.claimJointHandle(10, 10, win), true); assert.equal(ctl.enabled, false)
    let stopped = 0; const ev = { clientX: 20, clientY: 15, stopPropagation: () => { stopped++ } }
    for (const f of L.pointermove) f(ev)
    assert.deepEqual(moves, [[20, 15]]); assert.equal(stopped, 1)
    for (const f of [...L.pointerup]) f({})
    assert.equal(ctl.enabled, true); assert.equal((L.pointermove || []).length, 0)
  } finally { H.registerJointHandleClaimer('t', null) }
})

test('overlapping handles of two joints: the nearest specific handle wins (cyan slide bead beats J1 anchor ball), not registration order', () => {
  const W2 = 800, H2 = 600
  const c = new PerspectiveCamera(40, W2 / H2, 0.5, 5000); c.position.set(120, 160, 220); c.lookAt(0, 0, 0); c.updateMatrixWorld(); c.updateProjectionMatrix()
  const project = (p) => { const q = p.clone().project(c); return [(q.x + 1) / 2 * W2, (1 - q.y) / 2 * H2] }
  const J1 = { id: 'J1', type: 'revolute', anchor: [0, 0, 0], axis: [0, 1, 0], angle: 0 }
  const J2 = { id: 'J2', type: 'slider', anchor: [0, 0, 0], axis: [1, 0, 0], slide: 0 }
  const [x, y] = project(new Vector3(0, 0, 0))
  const h1 = H.jointHandleHitInfo(J1, project, x, y), h2 = H.jointHandleHitInfo(J2, project, x, y)
  assert.equal(h1.part, 'anchor'); assert.ok(['bead', 'axis'].includes(h2.part))
  assert.ok(H.jointHitScore(h2) < H.jointHitScore(h1))
  const got = []
  const mk = (id, j) => [(cx, cy) => { got.push(id); return { move: () => {}, end: () => {} } }, (cx, cy) => H.jointHitScore(H.jointHandleHitInfo(j, project, cx, cy))]
  H.registerJointHandleClaimer('J1', ...mk('J1', J1)); H.registerJointHandleClaimer('J2', ...mk('J2', J2))
  try { assert.equal(H.claimJointHandle(x, y, null), true); assert.deepEqual(got, ['J2']) } finally { H.registerJointHandleClaimer('J1', null); H.registerJointHandleClaimer('J2', null) }
  // arrow tip (3 mm past the axis end) is part of the slide handle
  const tip = project(new Vector3(63, 0, 0)); assert.equal(H.jointHandleHitInfo(J2, project, ...tip)?.kind, 'slide')
  // e2e regression: after sliding (bead moved away) the rendered white pointer starts at the anchor with d≈1e-5 —
  // it used to win as 'pointer' (score ≈0) and a rotate drag from the pivot did nothing. The pivot counts as the anchor ball.
  const J2b = { ...J2, slide: 40 }
  const rp = [new Vector3(0, 0, 0), new Vector3(0.3, 0, -24)]
  const hp = H.jointHandleHitInfo(J1, (p) => { const [a, b] = project(p); return [a + 1e-5, b] }, x, y, 10, { pointer: rp })
  assert.equal(hp.part, 'anchor')
  assert.ok(H.jointHitScore(hp) > H.jointHitScore(H.jointHandleHitInfo(J2b, project, x, y)))
  // a grab on the pointer away from the pivot is still the pointer
  const mid = project(new Vector3(0.15, 0, -12)); assert.equal(H.jointHandleHitInfo(J1, project, ...mid, 10, { pointer: rp })?.part, 'pointer')
})
