// RETEST21 #1：測試員真 Chrome 撳「橙環同白色把手」仍然 0° + 鏡頭轉。真瀏覽器 UI 流程（scripts/e2e-joint-ui.mjs：
// 組件 → 關節工具 → 真滑鼠點軸圓柱面 + 板頂面 → 揀旋轉 → 拖環多點／白珠／白指針線）重現到：白色指針線（錨點→白珠）
// 唔係把手 → 撳落去 Orbit 轉鏡頭、角度唔變。修正：指針線、白珠、錨點橙球都係旋轉把手；錨點起拖（角度未定）
// 都開 session（食咗 pointerdown）、第一個有效角度做基準；claim 提早到 window capture。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Vector3, Vector2, PerspectiveCamera, OrthographicCamera, Raycaster } from 'three'
const H = await import('../src/assembly/jointHandleDrag.ts')
const W = 1400, Hh = 900
const mk = (ortho) => {
  const cam = ortho ? new OrthographicCamera(-W / 8, W / 8, Hh / 8, -Hh / 8, -100000, 200000) : new PerspectiveCamera(28, W / Hh, 0.5, 30000)
  cam.position.set(316, 136, 150); cam.lookAt(200, 10, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix()
  const project = (p) => { const q = p.clone().project(cam); return q.z > 1 || q.z < -1 ? null : [(q.x + 1) / 2 * W, (1 - q.y) / 2 * Hh] }
  const rayAt = (x, y) => { const rc = new Raycaster(); rc.setFromCamera(new Vector2(x / W * 2 - 1, 1 - y / Hh * 2), cam); return rc.ray }
  return { project, rayAt }
}
// the UI-created joint from the e2e (cyl ↔ plane snap): anchor on the plate top, axis = shaft axis (+Y three)
const rev = { id: 'J1', type: 'revolute', anchor: [200, 10, 0], axis: [0, 1, 2.2e-16], angle: 0, slide: 0 }
const at = (j, deg, r = 30) => { const { a, u, v } = H.jointBasis(j); return a.clone().addScaledVector(u, r * Math.cos(deg * Math.PI / 180)).addScaledVector(v, r * Math.sin(deg * Math.PI / 180)) }

for (const ortho of [false, true]) {
  const { project, rayAt } = mk(ortho)
  test(`${ortho ? 'ortho' : 'persp'}: ring, white pointer line, white bead and anchor ball are rotate handles`, () => {
    for (const d of [-150, -90, 60, 150]) assert.equal(H.jointHandleHitInfo(rev, project, ...project(at(rev, d)))?.part, 'ring', `ring ${d}`)
    for (const ang of [0, 101.9]) {
      const j = { ...rev, angle: ang }
      assert.equal(H.jointHandleHit(j, project, ...project(at(j, ang, 15))), 'rotate', `pointer mid @${ang}`)
      assert.equal(H.jointHandleHitInfo(j, project, ...project(at(j, ang, 15))).part, 'pointer')
      assert.equal(H.jointHandleHit(j, project, ...project(at(j, ang, 30))), 'rotate', `bead @${ang}`)
    }
    assert.equal(H.jointHandleHitInfo(rev, project, ...project(new Vector3(...rev.anchor))).part, 'anchor')
    // edge tolerance: 9px off the ring line still hits (old 8px tolerance did not)
    const p = project(at(rev, 120)), q = project(at(rev, 121)), L = Math.hypot(q[0] - p[0], q[1] - p[1])
    assert.equal(H.jointHandleHit(rev, project, p[0] - (q[1] - p[1]) / L * 9, p[1] + (q[0] - p[0]) / L * 9), 'rotate')
    assert.equal(H.jointHandleHit(rev, project, 20, 20), null)
  })
  test(`${ortho ? 'ortho' : 'persp'}: drag that starts on the anchor (angle undefined) still turns, and pointer-line drags turn`, () => {
    const out = []
    const s = H.startJointHandleDrag(rev, 'rotate', rayAt(...project(new Vector3(...rev.anchor))), (p) => out.push(p.angle), () => {})
    assert.ok(s, 'session opened even at the centre (pointerdown is claimed, no orbit)')
    for (let d = 0; d <= 90; d += 10) s.move(rayAt(...project(at(rev, d, 20))))
    assert.ok(Math.abs(out.at(-1) - 90) < 0.1, `anchor drag ${out.at(-1)}`)
    const o2 = []
    const s2 = H.startJointHandleDrag({ ...rev, angle: 30 }, 'rotate', rayAt(...project(at(rev, 30, 15))), (p) => o2.push(p.angle), () => {})
    for (let d = 35; d <= 75; d += 5) s2.move(rayAt(...project(at(rev, d, 15))))
    assert.ok(Math.abs(o2.at(-1) - 75) < 0.1, `pointer drag ${o2.at(-1)}`)
  })
}

test('pointer segment follows clamp + multi-turn spiral radius like JointGizmo rot-ptr', () => {
  const [a, b] = H.jointPointerSegment({ ...rev, angle: 500, aMax: 90 })
  assert.ok(Math.abs(a.distanceTo(b) - 30) < 1e-9)
  const ang = Math.atan2(b.clone().sub(a).dot(H.jointBasis(rev).v), b.clone().sub(a).dot(H.jointBasis(rev).u)) * 180 / Math.PI
  assert.ok(Math.abs(ang - 90) < 1e-6, 'clamped to aMax')
  const [c, d] = H.jointPointerSegment({ ...rev, type: 'screw', angle: -1080 })
  assert.ok(Math.abs(c.distanceTo(d) - 12) < 1e-9, 'screw spiral starts at r=12')
})

test('JointGizmo claimer ignores other canvases and logs reasons in 診斷錄制 mode', () => {
  const jg = readFileSync(new URL('../src/components/JointGizmo.tsx', import.meta.url), 'utf8')
  assert.match(jg, /if \(target && target !== st\.gl\.domElement\) return null/)
  assert.match(jg, /dbgLog\(`關節把手/)
})
