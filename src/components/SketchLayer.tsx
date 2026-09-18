import { parseDimensionEditInput } from '../sketch/dimensionEditInput'
import { fixesWholeShape, sketchGeometryVisible } from './sketchFixVisual'
import { sketchConstraintColor } from './sketchConstraintColor'
import { sketchPlaneRaycast } from '../sketch/sketchPlaneRaycast'
import { ellipseContactPoint, ellipseTangentCandidates, tangentExtension } from './ellipseTangentVisual'
import { ellipseArcContainsAngle, ellipseArcSweep } from '../sketch/ellipseArcGeometry'
import { startGeometryPointerSession } from '../sketch/geometryPointerSession'
import { revolvePointToCad, revolveFrame, type RevolveFrameSource } from '../cad/revolvePreviewFrame'
import { fitCameraDistance } from '../cad/fitCameraDistance'
import { activeModelCommand } from '../cad/commandAvailability'
import { placeDimensionLabel } from './dimensionLabelLayout'
import { useLayoutEffect, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { DoubleSide, Raycaster, Plane as ThreePlane, Vector3, BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2, Matrix4, Quaternion, TextureLoader, SRGBColorSpace, CatmullRomCurve3, TubeGeometry, type Texture } from 'three'
import { useApp, setSnapScale, arc3, circumcircle, evalExpr, endTangent, type Pt, type SketchShape } from '../store'
import { tStatus } from '../i18n'
import { parseLen, toLenInput, type LenUnit } from '../io/units'   // T794：单位感知尺寸输入（分数英寸）
import { ellipseLineTangentPair, initialEllipseContact, refMid, refPts, measureDim, dimGfx, radDiaDisplay, type FShape, type SkCon, type SkRef } from '../sketch/freesolve'
import { tessellateSeg } from '../sketch/sketchOps'
import { chainSegments } from '../sketch/chainsegs'   // GM-W7 7.5：投影参考段串成 polyline → 连续虚线（唔再逐段塌成点）
import { endpointTangentHandles } from '../sketch/splineEdit'   // #174-8：样条首尾切向手柄
import { detectRegions, type RShape } from '../sketch/regions'   // 平面排布：相交曲线 → 封闭区域填充
import { sampleBSpline } from '../cad/bspline2d'   // S127：B 样条画线时 live 预览
import { sampleConic } from '../cad/conic2d'   // S177：圆锥曲线 live 预览
import { canvasQuad, canvasUV, type CanvasItem } from '../cad/insertModel'   // GM-X3 #2/#3：多张 Canvas 四角/UV（非等比+旋转+翻转）
import { batchSketchPositions, SKETCH_BATCH_THRESHOLD, SKETCH_FILL_SKIP_THRESHOLD, DXF_LABEL_DISPLAY_CAP, type BatchShape } from '../cad/sketchDisplayBatch'
import { solveMove } from '../cad/moveSolve'
import { useEscapeLayer } from './useEscapeLayer'
import { illegalRejectStatus } from '../ui/illegalInput'
import type { MeshData, Plane } from '../worker/cad.worker'

type V3 = [number, number, number]
type Lift = (p: Pt) => V3

const hasPatternCandidate = (s: ReturnType<typeof useApp.getState>) =>
  s.mode === 'sketch' && s.sketchTool === 'array' && !!s.skPatternSession &&
  !s.skPatternPreview.pending && !s.skPatternPreview.error && !!s.skPatternPreview.document && !!s.skPatternPreview.shapes

function patternOutline(sh: SketchShape, lift: Lift): V3[] {
  if (sh.type === 'rect') return rectPts(sh.a, sh.b, lift)
  if (sh.type === 'circle') return circlePts(sh.c, sh.r, lift)
  let pts: Pt[]
  if (sh.ell || sh.earc) {
    const e = sh.ell ?? sh.earc!
    const a0 = sh.earc?.a0 ?? 0, sweep = sh.earc ? ellipseArcSweep(sh.earc) : 360
    const count = Math.max(24, Math.ceil(Math.abs(sweep) / 3))
    pts = Array.from({length:count+1}, (_,i) => ellipseContactPoint(e, a0 + sweep*i/count))
  } else if (sh.arc) pts = arc3(sh.arc.a, sh.arc.b, sh.arc.m)
  else if (sh.verts?.length && sh.bulges) {
    pts = [sh.verts[0]]
    for (let i=0;i<(sh.open?sh.verts.length-1:sh.verts.length);i++) pts.push(...tessellateSeg(sh.verts[i],sh.verts[(i+1)%sh.verts.length],sh.bulges[i]??0))
  } else pts = sh.open || !sh.pts.length ? sh.pts : [...sh.pts,sh.pts[0]]
  return pts.map(lift)
}

// Per sketch-plane: capture-surface orientation, world-hit → sketch 2D [s,t],
// [s,t] → three-world (for drawing), and the sketch-mode camera. XY = horizontal
// top view (original behaviour); XZ/YZ = vertical front/right faces.
// These mirror store.stToProfile so the drawn outline and resulting solid coincide.
const SK: Record<Plane, {
  rot: V3
  pos: (baseZ: number) => V3
  toST: (p: { x: number; y: number; z: number }) => Pt
  lift: (p: Pt, baseZ: number) => V3
  cam: (baseZ: number, originX: number) => { pos: V3; tgt: V3 }
}> = {
  XY: {
    rot: [-Math.PI / 2, 0, 0], pos: (b) => [0, b, 0],
    toST: (p) => [p.x, p.z], lift: ([s, t], b) => [s, b + 0.2, t],
    cam: (b, ox) => ({ pos: [ox, b + 340, 0.01], tgt: [ox, b, 0] }),
  },
  XZ: {
    // offset b is along CAD +Y (plane normal) → three −Z by b (CAD y→three −z)
    rot: [0, 0, 0], pos: (b) => [0, 0, -b],
    toST: (p) => [p.x, p.y], lift: ([s, t], b) => [s, t, -b + 0.2],
    cam: (b, ox) => ({ pos: [ox, 50, 360 - b], tgt: [ox, 50, -b] }),
  },
  YZ: {
    // offset b is along CAD +X (plane normal) → three +X by b
    rot: [0, Math.PI / 2, 0], pos: (b) => [b, 0, 0],
    toST: (p) => [p.z, p.y], lift: ([s, t], b) => [b + 0.2, t, s],
    cam: (b) => ({ pos: [360 + b, 50, 0], tgt: [b, 50, 0] }),
  },
}

// Arbitrary sketch plane (sketch on any flat face): build lift/toST + the surface orientation from the
// CAD basis {origin o, xDir xd, normal n}. yDir = n × xd. CAD↔three: (x,y,z)⇄(x,z,−y).
function arbFrame(arb: { o: V3; xd: V3; n: V3 }) {
  const o = arb.o, xd = arb.xd, n = arb.n
  const yd: V3 = [n[1] * xd[2] - n[2] * xd[1], n[2] * xd[0] - n[0] * xd[2], n[0] * xd[1] - n[1] * xd[0]]
  const c2t = (c: V3): V3 => [c[0], c[2], -c[1]]
  const lift: Lift = ([s, t]) => c2t([o[0] + s * xd[0] + t * yd[0], o[1] + s * xd[1] + t * yd[1], o[2] + s * xd[2] + t * yd[2]])
  const toST = (p: { x: number; y: number; z: number }): Pt => {
    const d: V3 = [p.x - o[0], -p.z - o[1], p.y - o[2]]  // three→CAD then minus origin
    return [d[0] * xd[0] + d[1] * xd[1] + d[2] * xd[2], d[0] * yd[0] + d[1] * yd[1] + d[2] * yd[2]]
  }
  const m = new Matrix4().makeBasis(new Vector3(...c2t(xd)), new Vector3(...c2t(yd)), new Vector3(...c2t(n)))
  const q = new Quaternion().setFromRotationMatrix(m)
  return { lift, toST, quat: [q.x, q.y, q.z, q.w] as [number, number, number, number], pos: c2t(o) }
}

function rectPts(a: Pt, b: Pt, lift: Lift): V3[] {
  return [lift(a), lift([b[0], a[1]]), lift(b), lift([a[0], b[1]]), lift(a)]
}
function circlePts(c: Pt, r: number, lift: Lift): V3[] {
  const N = 48
  const pts: V3[] = []
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2
    pts.push(lift([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]))
  }
  return pts
}

// ── Closed-profile shading (Fusion fills closed loops with a light tint so you can see
// what's extrudable). We triangulate in 2D [s,t] space (correct for holes via even-odd
// nesting), then place each vertex through lift() so the fill coincides exactly with the lines.
function shapeLoop2D(sh: SketchShape): Pt[] {
  if (sh.type === 'rect') { const [a0, a1] = sh.a, [b0, b1] = sh.b; return [[a0, a1], [b0, a1], [b0, b1], [a0, b1]] }
  if (sh.type === 'circle') { const o: Pt[] = []; for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; o.push([sh.c[0] + sh.r * Math.cos(a), sh.c[1] + sh.r * Math.sin(a)]) } return o }
  return sh.pts
}
function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]
    if (((yi > p[1]) !== (yj > p[1])) && (p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}
function polyCentroid(poly: Pt[]): Pt { let x = 0, y = 0; for (const p of poly) { x += p[0]; y += p[1] } return [x / poly.length, y / poly.length] }
function polyArea(poly: Pt[]): number { let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]); return Math.abs(a) / 2 }

function buildFillGeometry(loops: Pt[][], plane: Plane, baseZ: number, liftFn?: Lift): BufferGeometry | null {
  const valid = loops.filter((l) => l.length >= 3)
  if (!valid.length) return null
  const lift = liftFn ?? ((p: Pt) => SK[plane].lift(p, baseZ))   // GM-W6 C5：斜面（arb）传入 arbFrame lift；卡片面照旧 SK[plane]
  const cen = valid.map(polyCentroid)
  const area = valid.map(polyArea)
  // containers[i] = loops that contain loop i. Gate by area (only a LARGER loop can contain a
  // smaller one) so concentric shapes — where centroids coincide — classify correctly.
  const containers = valid.map((_, i) => valid.map((__, j) => j).filter((j) => j !== i && area[j] > area[i] && pointInPoly(cen[i], valid[j])))
  const positions: number[] = []
  const indices: number[] = []
  let base = 0
  valid.forEach((loop, i) => {
    if (containers[i].length % 2 !== 0) return // it's a hole → drawn as part of its parent outer loop
    const holes = valid.map((_, j) => j).filter((j) => containers[j].length % 2 === 1 && containers[j].includes(i) && containers[j].length === containers[i].length + 1)
    const contour = loop.map((p) => new Vector2(p[0], p[1]))
    const holeV = holes.map((h) => valid[h].map((p) => new Vector2(p[0], p[1])))
    let faces: number[][] = []
    try { faces = ShapeUtils.triangulateShape(contour, holeV) } catch { faces = [] }
    const allPts = [loop, ...holes.map((h) => valid[h])].flat()
    for (const p of allPts) { const v = lift(p); positions.push(v[0], v[1], v[2]) }
    for (const f of faces) indices.push(base + f[0], base + f[1], base + f[2])
    base += allPts.length
  })
  if (!indices.length) return null
  const geom = new BufferGeometry()
  geom.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geom.setIndex(indices)
  geom.computeVertexNormals()
  return geom
}

// GM-W7 7.6：拉伸/切除嘅【实心体】半透明预览（Fusion 式）——喺原线框鬼影【之外】多起一个扫掠体网格,
// 令用户睇到「切走/加咗几多料」。体 = 两块盖（fill 三角化,分别抬到 z0/z1）+ 侧壁（每条外/孔环 z0→z1 嘅四边形带）。
// 面/孔判定完全复用 buildFillGeometry 嗰套（面积 + even-odd 内含）;拔模时顶盖用 loopsTop（各环按自身中心缩细,同线框一致）。
// loopsBot / loopsTop 必须逐环平行（同长）。材质 DoubleSide → 绕向净装饰,底盖照旧反绕。
function buildExtrudeVolume(loopsBot: Pt[][], loopsTop: Pt[][], liftBot: Lift, liftTop: Lift): BufferGeometry | null {
  const idx = loopsBot.map((_, i) => i).filter((i) => loopsBot[i].length >= 3 && loopsTop[i]?.length === loopsBot[i].length)
  if (!idx.length) return null
  const positions: number[] = []
  const indices: number[] = []
  const push = (v: V3) => { positions.push(v[0], v[1], v[2]); return positions.length / 3 - 1 }
  // ── 侧壁：每条环（外环 / 孔环 一视同仁）z0→z1 四边形带 ──
  for (const i of idx) {
    const Lb = loopsBot[i], Lt = loopsTop[i], m = Lb.length
    const b0 = positions.length / 3
    for (let j = 0; j < m; j++) push(liftBot(Lb[j]))
    for (let j = 0; j < m; j++) push(liftTop(Lt[j]))
    for (let j = 0; j < m; j++) { const j2 = (j + 1) % m; indices.push(b0 + j, b0 + j2, b0 + m + j2, b0 + j, b0 + m + j2, b0 + m + j) }
  }
  // ── 盖：even-odd 内含判定（逐字节同 buildFillGeometry）→ 外环带孔三角化,底盖抬 z0（反绕）、顶盖抬 z1 ──
  const cen = idx.map((i) => polyCentroid(loopsBot[i]))
  const area = idx.map((i) => polyArea(loopsBot[i]))
  const containers = idx.map((_, a) => idx.map((__, b) => b).filter((b) => b !== a && area[b] > area[a] && pointInPoly(cen[a], loopsBot[idx[b]])))
  idx.forEach((i, a) => {
    if (containers[a].length % 2 !== 0) return   // 系孔 → 归其父外环画
    const holesA = idx.map((_, b) => b).filter((b) => containers[b].length % 2 === 1 && containers[b].includes(a) && containers[b].length === containers[a].length + 1)
    const contour = loopsBot[i].map((p) => new Vector2(p[0], p[1]))
    const holeV = holesA.map((b) => loopsBot[idx[b]].map((p) => new Vector2(p[0], p[1])))
    let faces: number[][] = []
    try { faces = ShapeUtils.triangulateShape(contour, holeV) } catch { faces = [] }
    const ptsBot = [loopsBot[i], ...holesA.map((b) => loopsBot[idx[b]])].flat()
    const ptsTop = [loopsTop[i], ...holesA.map((b) => loopsTop[idx[b]])].flat()
    const baseBot = positions.length / 3
    for (const p of ptsBot) push(liftBot(p))
    for (const f of faces) indices.push(baseBot + f[0], baseBot + f[2], baseBot + f[1])   // 底盖反绕 → 法向朝外（装饰性,材质本身 DoubleSide）
    const baseTop = positions.length / 3
    for (const p of ptsTop) push(liftTop(p))
    for (const f of faces) indices.push(baseTop + f[0], baseTop + f[1], baseTop + f[2])
  })
  if (!indices.length) return null
  const geom = new BufferGeometry()
  geom.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geom.setIndex(indices)
  return geom
}

// GM-W7 7.6：CAD→three 换轴（同 arbFrame.c2t）—— 旋转预览喺 CAD 空间转完先换轴。
const c2tW = (c: V3): V3 => [c[0], c[2], -c[1]]
// GM-W7 7.6：Rodrigues 绕任意轴（o 轴上一点, d 单位方向）转 θ（cos/sin 传入,一环共用）。
function rotAxis(p: V3, o: V3, d: V3, cos: number, sin: number): V3 {
  const px = p[0] - o[0], py = p[1] - o[1], pz = p[2] - o[2]
  const dot = d[0] * px + d[1] * py + d[2] * pz
  const cx = d[1] * pz - d[2] * py, cy = d[2] * px - d[0] * pz, cz = d[0] * py - d[1] * px   // d × (p−o)
  return [
    o[0] + px * cos + cx * sin + d[0] * dot * (1 - cos),
    o[1] + py * cos + cy * sin + d[1] * dot * (1 - cos),
    o[2] + pz * cos + cz * sin + d[2] * dot * (1 - cos),
  ]
}

// GM-FP4 #1：入草图 / Look At 相机平滑过渡（eased tween）。module-level → 跨 CameraRig remount 稳。
// 政策：goal 一律【即时应用】（headless/背景分页无 useFrame 都得到正确终态、测试稳）；tween 只喺前台由 useFrame
// 逐帧【由旧视角 lerp 去 goal】做视觉过渡（可被用户输入中断 · setTimeout 兜底还原 controls，绝不卡死）。
type _CamLike = { position: Vector3; isOrthographicCamera?: boolean; zoom?: number; updateProjectionMatrix?: () => void }
type CamTween = { cam: _CamLike; fromPos: Vector3; toPos: Vector3; fromTgt: Vector3; toTgt: Vector3; fromZoom: number; toZoom: number; t0: number; dur: number; prevEnabled: boolean } | null
let _camTween: CamTween = null
let _lastOrientKey = ''   // GM-FP4 #1：上次相机取景嘅「离散事件指纹」（mode/plane/baseZ/arb/lookAt/focus）—— 变咗先 tween
let _lastLookNonce = -1   // 用户实战 bug：只有【撳正对掣】（lookAtNonce 变）先做动画过渡；入草图/换面 = 即时正对（唔郁 tween，免第一帧 yank 返旧角）
let _prevSketchMode = false   // 上一次 render 系咪已喺 sketch —— 由 model 跳入 sketch 嗰下强制重新正对（防旧 orientKey 令相机唔郁）
const _easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
// 中断 / 兜底：一律【硬落地喺 goal】（正对角度）—— 用户实战 bug 根因：tween 第一帧会先 lerp 返旧视角，撳嘢中断即卡喺旧 45°。
// 而家中断/收结都强制 camera=toPos + target=toTgt + zoom=toZoom → 入草图/正对必定正向直望，永不停半路。
function _endCamTween(controls: { enabled?: boolean; target?: { set: (x: number, y: number, z: number) => void }; update?: () => void } | null) {
  const tw = _camTween; _camTween = null
  if (!tw) { return }
  if (controls) controls.enabled = tw.prevEnabled
  tw.cam.position.copy(tw.toPos)
  if (tw.cam.isOrthographicCamera) { tw.cam.zoom = tw.toZoom; tw.cam.updateProjectionMatrix?.() }
  if (controls?.target) { controls.target.set(tw.toTgt.x, tw.toTgt.y, tw.toTgt.z); controls.update?.() }
}

// Orient the camera for the active sketch plane in sketch mode, back to iso otherwise.
export function CameraRig() {
  const mode = useApp((s) => s.mode)
  const baseZ = useApp((s) => s.sketchBaseZ)
  const originX = useApp((s) => s.originX)
  const plane = useApp((s) => s.sketchPlane)
  const arb = useApp((s) => s.sketchArb)
  const focus = useApp((s) => s.sketchFocus)
  const bodyMesh = useApp((s) => s.bodyMesh)   // GM-W6 C2：冇对焦面时用实体 bbox 定相机距离
  const profiles = useApp((s) => s.sketchProfiles)   // GM-W7 7.2：重开草图时框住已有轮廓
  const currentShape = useApp(s => s.sketchShape)
  const refGeo = useApp((s) => s.skRefGeo)           // GM-W7 7.2：框住投影参考几何 bbox
  const viewSize = useThree(s => s.size)
  const lookAtNonce = useApp((s) => s.skLookAtNonce) // GM-FP1 #9：Look At bump → 重新正对草图平面
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as unknown as
    | { target: { set: (x: number, y: number, z: number) => void; x: number; y: number; z: number }; update: () => void; enabled?: boolean }
    | null
  const orientedControls = useRef<unknown>(null)
  // QA 钩：暴露 camera/controls 畀 headless 验证相机取向（同 claudecraft window.cc 惯例；只读引用,无副作用）。
  useEffect(() => { (window as unknown as { __three?: unknown }).__three = { camera, controls } }, [camera, controls])
  // GM-FP4 #1：用户任何输入（pointerdown / wheel）即中断相机 tween（Fusion：一郁就交返控制畀你）。
  useEffect(() => {
    const el = gl?.domElement
    if (!el) return
    const cancel = () => { if (_camTween) _endCamTween(controls) }
    el.addEventListener('pointerdown', cancel, { passive: true })
    el.addEventListener('wheel', cancel, { passive: true })
    return () => { el.removeEventListener('pointerdown', cancel); el.removeEventListener('wheel', cancel) }
  }, [gl, controls])
  // GM-FP4 #1：逐帧 lerp 相机由旧视角 → goal（eased）。goal 已即时套喺下面 effect（终态永远正确），呢度只做视觉过渡。
  useFrame(() => {
    const tw = _camTween
    if (!tw || !controls) return
    let t = (performance.now() - tw.t0) / tw.dur
    if (t >= 1) t = 1
    const e = _easeInOut(t)
    camera.position.lerpVectors(tw.fromPos, tw.toPos, e)
    controls.target.set(tw.fromTgt.x + (tw.toTgt.x - tw.fromTgt.x) * e, tw.fromTgt.y + (tw.toTgt.y - tw.fromTgt.y) * e, tw.fromTgt.z + (tw.toTgt.z - tw.fromTgt.z) * e)
    const oc = camera as unknown as { isOrthographicCamera?: boolean; zoom: number; updateProjectionMatrix: () => void }
    if (oc.isOrthographicCamera) { oc.zoom = tw.fromZoom + (tw.toZoom - tw.fromZoom) * e; oc.updateProjectionMatrix() }
    controls.update()
    if (t >= 1) _endCamTween(controls)
  })
  // GM-W7 7.3：入/出草图自动切正交 —— 已搬去 store 层 zustand subscription（store.ts 尾，QA 揪到：
  // R3F Canvas 内嘅 React effect 喺背景/headless 分页可以完全唔跑——rAF 节流令更新无限延迟；
  // store 订阅系纯 JS，mode 一转即刻同步执行，无 React 时序依赖）。
  useEffect(() => {
    if (!controls) return
    if (mode !== 'sketch') (camera as unknown as { clearViewOffset?: () => void }).clearViewOffset?.()
    // GM-FP4 #1：只喺【离散重新取景事件】（入草图 / 换平面 / 换基准Z / 换对焦面 / Look At）先做 tween；
    // 净系画咗个形（profiles/refGeo 变）唔 tween（否则画图时相机不停郁）。记低 orient key 比对。
    const orientKey = `${camera.uuid}|${mode === 'sketch' ? `${viewSize.width}x${viewSize.height}` : ''}|${mode}|${plane}|${baseZ}|${arb ? `${arb.o.join(',')}|${arb.n.join(',')}` : '-'}|${lookAtNonce}|${focus ? 'F' : '-'}`
    // 用户实战 bug（入草图停喺 45°）：由 model 跳入 sketch 嗰下【一定】要重新正对，唔可以净靠 orientKey 差异
    //   （旧 key 可能残留令 isReorient=false → 相机唔郁 → 卡喺入草图前嘅斜视角）。
    const justEnteredSketch = mode === 'sketch' && !_prevSketchMode
    _prevSketchMode = mode === 'sketch'
    const controlsChanged = orientedControls.current !== controls
    orientedControls.current = controls
    const isReorient = controlsChanged || justEnteredSketch || orientKey !== _lastOrientKey
    _lastOrientKey = orientKey
    // 只有【撳正对掣】(lookAtNonce 变) 先做平滑动画；入草图/换面/换基准 = 即时正对（唔起 tween）。
    const lookAtChanged = lookAtNonce !== _lastLookNonce
    _lastLookNonce = lookAtNonce
    // 用户实战 bug（落构造线画面即爆缩）：effect 因 profiles/refGeo 变而重跑时，旧代码【无条件】重写相机+zoom
    // （FP4 只门控咗 tween，冇门控相机写入本身）→ 画任何嘢都会被重新取景，cline ±10000 跨度更加即刻缩到芝麻咁细。
    // Fusion 铁律：画图期间相机纹丝不动 —— 只有离散取景事件（入草图/换面/换基准/对焦/LookAt/出草图）先郁相机。
    if (!isReorient) return
    // 捕捉旧视角（tween 起点）— 喺覆写相机之前。
    if (mode === 'sketch' && !arb) {
      if (plane === 'XY') camera.up.set(0, 0, -1)
      else camera.up.set(0, 1, 0)
    } else if (mode !== 'sketch') camera.up.set(0, 1, 0)
    const fromPos = camera.position.clone()
    const ctv = controls as unknown as { target: { x: number; y: number; z: number } }
    const fromTgt = new Vector3(ctv.target.x, ctv.target.y, ctv.target.z)
    const fromZoom = (camera as unknown as { zoom?: number }).zoom ?? 1
    // GM-W6 C2：相机入草图嘅距离跟【内容】定（唔再硬编 340/360）——有对焦面用其面尺寸，
    // 否则用实体 bbox 对角线，最后先落原距离/340。公式 d = max(1.6 × 内容尺寸, 120)。
    const bodyDiag = (): number | null => {
      const v = bodyMesh?.vertices
      if (!v || !v.length) return null
      let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity
      for (let i = 0; i + 2 < v.length; i += 3) {
        const x = v[i], y = v[i + 1], z = v[i + 2]
        if (x < mnx) mnx = x; if (x > mxx) mxx = x
        if (y < mny) mny = y; if (y > mxy) mxy = y
        if (z < mnz) mnz = z; if (z > mxz) mxz = z
      }
      if (!isFinite(mnx)) return null
      const diag = Math.hypot(mxx - mnx, mxy - mny, mxz - mnz)   // CAD↔three swizzle 唔改长度 → 对角线即等
      return diag > 1e-6 ? diag : null
    }
    const distFrom = (span: number | null, fallback: number): number =>
      (span != null && isFinite(span) && span > 0) ? Math.max(1.6 * span, 120) : fallback
    // GM-W7 7.2：入草图取景【内容跨度】= max(已有草图轮廓 bbox, 投影参考 refGeo bbox)，喺草图面 [s,t] 度量。
    // 覆盖重开草图（框住轮廓）同投影几何（框住参考线）；空草图 → null 回落 bodyDiag / focus.size / 原距。
    let sketchCenter: Pt | null = null
    const inPlaneSpan = (): number | null => {
      let mn0 = Infinity, mn1 = Infinity, mx0 = -Infinity, mx1 = -Infinity
      const acc = (p: Pt) => { if (p[0] < mn0) mn0 = p[0]; if (p[0] > mx0) mx0 = p[0]; if (p[1] < mn1) mn1 = p[1]; if (p[1] > mx1) mx1 = p[1] }
      // 用户实战 bug：构造几何（尤其 cline ±10000 参考线）唔应该驱动取景 —— Fusion 参考线唔影响 view。
      // 剔走 construction 后冇嘢剩 → null 回落 focus/bodyDiag/默认（同空草图一致）。
      for (const sh of [...profiles, ...(currentShape ? [currentShape] : [])]) { if ((sh as { construction?: boolean }).construction) continue; for (const p of shapeLoop2D(sh)) acc(p) }
      if (refGeo) { for (const q of refGeo.pts) acc(q); for (const [a, b] of refGeo.segs) { acc(a); acc(b) } }
      if (!isFinite(mn0)) return null
      sketchCenter = [(mn0 + mx0) / 2, (mn1 + mx1) / 2]
      const span = Math.max(mx0 - mn0, mx1 - mn1)
      return span > 1e-6 ? span : null
    }
    let fitSpan: number | null = null   // GM-W7 7.2：今次取景采用嘅内容跨度（下面正交 zoom 用）
    // GM-W6 C2：focus-first（唔再畀 arb 支覆盖 skGeoFocus）——有对焦面永远优先框佢。
    if (mode === 'sketch' && focus && !arb) {
      // Auto zoom/pan onto the picked face / body footprint (Fusion frames the sketch target).
      const tgt = SK[plane].lift(focus.c, baseZ)
      const up = SK[plane].lift(focus.c, baseZ + 1)
      const n: [number, number, number] = [up[0] - tgt[0], up[1] - tgt[1], up[2] - tgt[2]]
      fitSpan = Math.max(focus.size || 0, inPlaneSpan() || 0) || focus.size   // GM-W7 7.2：面尺寸 ∪ 轮廓/参考 bbox
      const d = distFrom(fitSpan, 340)   // GM-W6 C2：面尺寸定距（原 size*1.7 兼硬夹 1600）
      camera.position.set(tgt[0] + n[0] * d + (plane === 'XY' ? 0.01 : 0), tgt[1] + n[1] * d, tgt[2] + n[2] * d + (plane === 'XY' ? 0.01 : 0))
      controls.target.set(tgt[0], tgt[1], tgt[2])
    } else if (mode === 'sketch' && arb) {
      // Face the tilted plane straight-on (Fusion: view normal to sketch plane).
      const n = arb.n
      const span = inPlaneSpan()
      const ot = arbFrame(arb).lift(focus?.c ?? sketchCenter ?? [0, 0])
      const nt: [number, number, number] = [n[0], n[2], -n[1]]          // CAD normal → three
      const L = Math.hypot(nt[0], nt[1], nt[2]) || 1
      fitSpan = Math.max(focus?.size ?? 0, span ?? bodyDiag() ?? 0) || null
      const d = distFrom(fitSpan, 340)   // GM-W6 C2：斜面用实体 bbox 定距（原硬编 340）
      // GM-W6 C2：加沿面切向 0.01 微偏（似 XY 支 L32）—— 免相机正对法向 look-at 塌 degenerate（roll 未定义）
      const tx = arb.xd[0], ty = arb.xd[2], tz = -arb.xd[1]
      const normal = new Vector3(...nt).normalize()
      camera.up.copy(normal.clone().cross(new Vector3(tx, ty, tz)).normalize())
      camera.position.set(ot[0] + (nt[0] / L) * d + tx * 0.01, ot[1] + (nt[1] / L) * d + ty * 0.01, ot[2] + (nt[2] / L) * d + tz * 0.01)
      controls.target.set(ot[0], ot[1], ot[2])
    } else if (mode === 'sketch') {
      // GM-W6 C2：默认卡片面框视 — 有实体用 bbox 定距，冇实体保留 SK.cam 原距离（≈340/360，空草图零回归）。
      const { pos, tgt } = SK[plane].cam(baseZ, originX)
      const dir = new Vector3(pos[0] - tgt[0], pos[1] - tgt[1], pos[2] - tgt[2])
      fitSpan = inPlaneSpan() ?? bodyDiag()   // GM-W7 7.2：轮廓/参考 bbox 优先，否则实体 bbox
      dir.setLength(distFrom(fitSpan, dir.length()))
      camera.position.set(tgt[0] + dir.x, tgt[1] + dir.y, tgt[2] + dir.z)
      controls.target.set(tgt[0], tgt[1], tgt[2])
      if (sketchCenter) {
        const centered = SK[plane].lift(sketchCenter, baseZ)
        camera.position.add(new Vector3(centered[0] - tgt[0], centered[1] - tgt[1], centered[2] - tgt[2]))
        controls.target.set(...centered)
      }
    } else { camera.position.set(originX + 240, 190, 270); controls.target.set(originX, 20, 0) }
    // GM-W7 7.2/7.3：正交相机靠 zoom 取景（唔系距离）。跨度 span → 半径 span/2 → zoom = 半帧/(半径·1.15)（+15% 裕度，
    // 同 FitView 公式一致）。drei OrthographicCamera 默认 frustum = 画布像素 → right-left / top-bottom 即画布宽高。
    // 空草图（fitSpan null）→ 回落半径 60，框住 ~140mm（原点 + 网格），保持 sane 默认。
    if (mode === 'sketch') {
      const oc = camera as unknown as { isOrthographicCamera?: boolean; left: number; right: number; top: number; bottom: number; zoom: number; updateProjectionMatrix: () => void }
      if (oc.isOrthographicCamera) {
        // Reserve the tool palette, top command bar and bottom navigation/status.
        const w = oc.right - oc.left, h = oc.top - oc.bottom
        const left = Math.min(260, w * .32), top = 76, bottom = 126
        const view = camera as unknown as { setViewOffset: (w:number,h:number,x:number,y:number,vw:number,vh:number)=>void }
        view.setViewOffset(w, h, -left / 2, (bottom - top) / 2, w, h)
        const fr = Math.max(40, Math.min(w - left - 160, h - top - bottom - 90)) / 2
        const r = (fitSpan != null && isFinite(fitSpan) && fitSpan > 0 ? fitSpan : 120) / 2
        if (fr > 0 && r > 0) { oc.zoom = fr / (r * 1.15); oc.updateProjectionMatrix() }
      }
    }
    controls.update()
    // GM-FP4 #1：goal 已即时套完（上面）。若系离散重新取景 + 相机真有郁 → 起 eased tween（由 fromPos → 当前 goal）。
    // headless/背景分页无 useFrame → tween 无进展，但终态已正确；setTimeout 兜底还原 controls，永不卡死。
    if (isReorient) {
      const toPos = camera.position.clone()
      const toTgt = new Vector3(ctv.target.x, ctv.target.y, ctv.target.z)
      const toZoom = (camera as unknown as { zoom?: number }).zoom ?? 1
      // 上界护栏：起点距离过远（多数系 透视↔正交 相机切换嘅未初始化位置 / 空场景）→ 唔 tween（直接即时终态），免奇怪长途飞行。
      const d = fromPos.distanceTo(toPos)
      // 只有【撳正对掣】先做视觉过渡；其余（入草图/换面）goal 已即时套完 → 保持即时正对，唔起 tween（免第一帧 yank 返旧角+中断卡死）。
      const moved = lookAtChanged && (d > 1 || Math.abs(fromZoom - toZoom) > 1e-3 || fromTgt.distanceTo(toTgt) > 1) && d < 8000
      const cc = controls as unknown as { enabled?: boolean; target?: { set: (x: number, y: number, z: number) => void }; update?: () => void }
      if (moved) {
        const prevEnabled = cc.enabled !== false
        const t0 = performance.now()
        _camTween = { cam: camera as unknown as _CamLike, fromPos, toPos, fromTgt, toTgt, fromZoom, toZoom, t0, dur: 340, prevEnabled }
        cc.enabled = false   // tween 期间停 OrbitControls（唔同用户输入打架，ExtrudeArrow 同款）
        // 兜底：dur + 缓冲后强制收结（还原 controls.enabled）— 防 useFrame 未跑（背景分页）时 controls 永久停用。
        setTimeout(() => { if (_camTween && _camTween.t0 === t0) _endCamTween(cc) }, 340 + 260)
      } else if (_camTween) { cc.enabled = _camTween.prevEnabled; _camTween = null }   // 即时正对：清走任何残留（旧 LookAt）tween，但【唔硬落地去旧 goal】—— 相机已喺新入草图 goal，还原 controls 即可
    }
  }, [mode, baseZ, originX, plane, arb, focus, controls, camera, bodyMesh, profiles, currentShape, refGeo, lookAtNonce, viewSize.width, viewSize.height])   // GM-FP1 #9：lookAtNonce 变 → 重新正对
  return null
}

// Invisible plane (oriented to the active sketch plane) that captures clicks while sketching.
export function SketchSurface() {
  const scalePointer = useRef<(() => void) | null>(null)
  const scaleStart = useRef<Pt | null>(null)
  const geometryPointer = useRef<(() => void) | null>(null)
  const geometrySnapshot = useRef<unknown>(null)
  const geometryCanvas = useThree((s) => s.gl.domElement)
  const mode = useApp((s) => s.mode)
  const baseZ = useApp((s) => s.sketchBaseZ)
  const plane = useApp((s) => s.sketchPlane)
  const arb = useApp((s) => s.sketchArb)
  const raycast = useMemo(() => {
    const lift=arb?arbFrame(arb as {o:V3;xd:V3;n:V3}).lift:(p:Pt)=>SK[plane].lift(p,baseZ)
    const p=lift([0,0]),o=arb?p:SK[plane].pos(baseZ)
    const shift=(q:V3):V3=>[q[0]-p[0]+o[0],q[1]-p[1]+o[1],q[2]-p[2]+o[2]]
    return sketchPlaneRaycast(o,shift(lift([1,0])),shift(lift([0,1])))
  },[arb,plane,baseZ])
  const click = useApp((s) => s.onSketchClick)
  const move = useApp((s) => s.onSketchMove)
  const camera = useThree((s) => s.camera)   // GM-FP1 #13：端点命中容差换算（屏幕 px → 世界 mm）
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null
  // S196【按住拖 press-drag-release】armed：非 select 繪圖工具 pointerdown 真系落咗點（sketchStart/polyPts 有值）
  // 先記低 down 嘅屏幕座標；pointerup 位移超閾值（鼠標/筆 6px、觸屏 12px）→ 當第二擊（Fusion 雙手勢；
  // polyline 拖 = 畫一段然後繼續 rubber-band，跟 Fusion）。冇超閾值 = 普通 click-click 第一點，零行為變化。
  const dragDraw = useRef<{ x: number; y: number; touch: boolean } | null>(null)
  const arcGesture = useRef<{ x: number; y: number; touch: boolean } | null>(null)   // GM-FP1 #13：从折线端点按住拖 = 相切弧手势
  const _dblRef = useRef<{ t: number; x: number; y: number } | null>(null)   // GM-W6 B1：双击收笔计时（折线/样条）
  const marquee = useRef<{ stx: number; sty: number; cx: number; cy: number; touch: boolean } | null>(null)   // GM-FP3 #44：草图框选（空白左拖）
  const trimSweep = useRef<{ touch: boolean } | null>(null)   // GM-FP3 #38：拖扫修剪进行中
  const moveGizmo = useRef(false)   // GM-FP3 #39：Move gizmo 手柄拖动中
  const _selDbl = useRef<{ t: number; x: number; y: number } | null>(null)   // GM-FP3 #46：select 双击链选计时
  // GM-FP3 #39：Move gizmo 臂长（屏幕恒定 ~46px）+ 手柄命中（返 'x'|'y'|'rot'|null）。正交按 zoom 换算，透视回落。
  const gizmoArm = () => { const c = camera as unknown as { isOrthographicCamera?: boolean; zoom?: number }; return c?.isOrthographicCamera ? Math.min(200, Math.max(6, 46 / (c.zoom || 1))) : 30 }
  const hitMoveHandle = (st: Pt, mv: { cx: number; dx: number; cy: number; dy: number }, arm: number): 'x' | 'y' | 'rot' | null => {
    const px = mv.cx + mv.dx, py = mv.cy + mv.dy
    const tolH = arm * 0.3
    const distSeg = (p: Pt, a: Pt, b: Pt) => { const abx = b[0] - a[0], aby = b[1] - a[1], L2 = abx * abx + aby * aby || 1; let t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + aby * t)) }
    const dRot = Math.hypot(st[0] - (px + arm * 0.72), st[1] - (py + arm * 0.72))   // 旋转 knob 喺 45°
    const dX = distSeg(st, [px, py], [px + arm, py])
    const dY = distSeg(st, [px, py], [px, py + arm])
    let best: 'x' | 'y' | 'rot' | null = null, bd = tolH
    if (dRot < bd) { best = 'rot'; bd = dRot }
    if (dX < bd) { best = 'x'; bd = dX }
    if (dY < bd) { best = 'y'; bd = dY }
    return best
  }
  // GM-FP1 #13：折线端点命中容差（世界 mm）— 正交按 zoom 换算 ~14px，透视回落 6mm。
  const endpointTol = () => { const c = camera as unknown as { isOrthographicCamera?: boolean; zoom?: number }; return c?.isOrthographicCamera ? Math.min(20, Math.max(1, 14 / (c.zoom || 1))) : 6 }
  // 保險：mid-drag 按 ESC 退草圖 → 本組件卸載，凍結咗嘅 OrbitControls 冇人解 → 相機鎖死（skDrag 同款泄漏一齊堵）
  useEffect(() => () => { if (controls) controls.enabled = true; useApp.getState().skTrimSweepEnd() }, [controls])   // GM-FP3 #38：卸載時清拖扫修剪 flag
  const draggingGeometry = useApp((s) => !!s.skDrag)
  useEffect(() => { if (!draggingGeometry && controls) controls.enabled = true }, [draggingGeometry, controls])
  useEffect(() => {
    const stop = () => { const cleanup = geometryPointer.current; geometryPointer.current = null; geometrySnapshot.current = null; cleanup?.(); if (controls) controls.enabled = true }
    const unsubscribe = useApp.subscribe((s) => { if (geometryPointer.current && (!s.skDrag || s.skDrag.undoSnap !== geometrySnapshot.current)) stop() })
    return () => { unsubscribe(); if (geometryPointer.current) useApp.getState().skDragCancel(); stop() }
  }, [controls])
  useEffect(() => {
    const stop=()=>{const close=scalePointer.current;scalePointer.current=null;scaleStart.current=null;close?.();if(controls)controls.enabled=true}
    const unsub=useApp.subscribe(s=>{if(scalePointer.current&&(!s.skScale||s.skScale.stage!=='dragging'||s.skScale.handleStart!==scaleStart.current))stop()})
    return()=>{unsub();if(scalePointer.current){stop();useApp.getState().stepBackSkScale()}}
  },[controls])
  const captureScale=(pointerId:number)=>{
    scaleStart.current=useApp.getState().skScale?.handleStart??null
    const frame=arb?arbFrame(arb as {o:V3;xd:V3;n:V3}):null
    const lift=frame?.lift??((p:Pt)=>SK[plane].lift(p,baseZ)),toST=frame?.toST??SK[plane].toST
    const surface=new ThreePlane().setFromCoplanarPoints(new Vector3(...lift([0,0])),new Vector3(...lift([1,0])),new Vector3(...lift([0,1])))
    if(!frame)surface.setFromNormalAndCoplanarPoint(surface.normal,new Vector3(...SK[plane].pos(baseZ)))
    const ray=new Raycaster(),hit=new Vector3()
    scalePointer.current=startGeometryPointerSession({canvas:geometryCanvas,pointerId,
      project:(x,y)=>{const r=geometryCanvas.getBoundingClientRect();if(!r.width||!r.height||x<r.left||x>r.right||y<r.top||y>r.bottom)return null;ray.setFromCamera(new Vector2((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2),camera);return ray.ray.intersectPlane(surface,hit)?toST(hit):null},
      move:p=>{void useApp.getState().updateSkScaleHandle(p)},
      end:p=>{void useApp.getState().updateSkScaleHandle(p);useApp.getState().finishSkScaleHandle()},
      cancel:()=>useApp.getState().stepBackSkScale(),onClose:()=>{if(controls)controls.enabled=true},
    })
  }
  const captureGeometry = (pointerId: number) => {
    geometrySnapshot.current = useApp.getState().skDrag?.undoSnap
    const frame = arb ? arbFrame(arb as { o: V3; xd: V3; n: V3 }) : null
    const lift = frame?.lift ?? ((p: Pt) => SK[plane].lift(p, baseZ))
    const toST = frame?.toST ?? SK[plane].toST
    const surface = new ThreePlane().setFromCoplanarPoints(new Vector3(...lift([0,0])), new Vector3(...lift([1,0])), new Vector3(...lift([0,1])))
    if (!frame) surface.setFromNormalAndCoplanarPoint(surface.normal, new Vector3(...SK[plane].pos(baseZ)))
    const ray = new Raycaster(), hit = new Vector3()
    geometryPointer.current = startGeometryPointerSession({
      canvas: geometryCanvas, pointerId,
      project: (x, y) => {
        const r = geometryCanvas.getBoundingClientRect()
        if (!r.width || !r.height || x < r.left || x > r.right || y < r.top || y > r.bottom) return null
        ray.setFromCamera(new Vector2((x-r.left)/r.width*2-1, 1-(y-r.top)/r.height*2), camera)
        return ray.ray.intersectPlane(surface, hit) ? toST(hit) : null
      },
      move: p => { useApp.getState().onSketchMove(p); void useApp.getState().skDragMove(p) },
      end: p => { void useApp.getState().skDragEnd(p) },
      cancel: () => useApp.getState().skDragCancel(),
      onClose: () => { if (controls) controls.enabled = true },
    })
    if (!useApp.getState().skDrag) { geometryPointer.current?.(); geometryPointer.current = null }
  }
  if (mode !== 'sketch') return null
  // Select-tool point dragging (Fusion drag-solve): pointerdown on a point arms the drag and freezes
  // OrbitControls (stopPropagation doesn't reach canvas-level listeners — ExtrudeArrow lesson); a
  // sub-threshold release falls back to a normal click inside skDragEnd.
  const down = (st: Pt, e: { stopPropagation: () => void; button?: number; clientX?: number; clientY?: number; pointerId?: number; pointerType?: string; shiftKey?: boolean }) => {
    e.stopPropagation()
    if (geometryPointer.current || scalePointer.current) return
    // 第二個 pointer（觸屏第二隻手指 / 拖緊時按右鍵）→ 取消 drag-draw 並解凍相機（俾 pinch 縮放有得行），唔落點
    if (dragDraw.current) { dragDraw.current = null; if (controls) controls.enabled = true; return }
    // GM-W6 A2：净【左键】先落点（对齐 Fusion）——旧版 click(st) 冇 button 判断，中/右键都会画嘢。
    // 早 return 唔阻 OrbitControls（佢听 canvas 原生事件）→ 中键=平移、右键=平移/菜单，画到一半照调视角。
    if ((e.button ?? 0) !== 0) return
    const app = useApp.getState()
    if(app.sketchTool==='scale'&&app.skScale){
      const sc=app.skScale
      if(sc.stage==='base'){app.setSkScaleBase(st,true);return}
      const arm=gizmoArm(),h:Pt=[sc.cx+arm*sc.factor,sc.cy]
      if(Math.hypot(st[0]-h[0],st[1]-h[1])<arm*.25){app.startSkScaleHandle(st);if(useApp.getState().skScale?.stage==='dragging'){if(controls)controls.enabled=false;if(e.pointerId!==undefined)captureScale(e.pointerId)}}
      return
    }
    // GM-FP3 #39 Move gizmo：拖 X/Y/旋转 手柄（命中先冻结相机；空点 gizmo 外唔做嘢）。
    if (app.sketchTool === 'move' && app.skMove) {
      const h = hitMoveHandle(st, app.skMove, gizmoArm())
      if (h) { app.skMoveHandleDown(h, st); moveGizmo.current = true; if (controls) controls.enabled = false }
      return
    }
    // GM-FP3 #38 Trim 拖扫：pointerdown 即剪第一段 + 开 sweep（一次拖动多删合并成一步 undo）。
    if (app.sketchTool === 'trim') {
      app.skTrimSweepStart(); app.skTrimAt(st)
      trimSweep.current = { touch: e.pointerType === 'touch' }
      if (controls) controls.enabled = false
      return
    }
    // GM-W6 B1：折线/样条【双击收笔】（对齐 Fusion）——同位（<8px）+400ms 内两击且已有 ≥2 点 → 完成开放折线，
    // 唔再落多一个重叠点（审计：旧版双击=产生零长段流入求解器）。
    if ((app.sketchTool === 'polyline' || app.sketchTool === 'spline' || app.sketchTool === 'bspline') && app.polyPts.length >= 2) {
      const now = performance.now(); const last = _dblRef.current
      const sx = e.clientX ?? 0, sy = e.clientY ?? 0
      _dblRef.current = { t: now, x: sx, y: sy }
      if (last && now - last.t < 400 && Math.hypot(sx - last.x, sy - last.y) < 8) { _dblRef.current = null; app.finishOpenPolyline(); return }
    }
    // GM-FP1 #13：从折线【上端点】按住拖 = 相切弧手势（Fusion 式，取代㩒 A 掣）。只 polyline + ≥2 点 + 左键 + 落点近上端点；
    // 唔即刻落点 → 等 pointermove 过阈值先进 polyArcMode（视觉 arc 预览），pointerup 落一段相切弧再自动返直线。
    if (app.sketchTool === 'polyline' && app.polyPts.length >= 2 && (e.button ?? 0) === 0 && !app.polyArcMode) {
      const lp = app.polyPts[app.polyPts.length - 1]
      if (Math.hypot(st[0] - lp[0], st[1] - lp[1]) <= endpointTol()) {
        arcGesture.current = { x: e.clientX ?? 0, y: e.clientY ?? 0, touch: e.pointerType === 'touch' }
        if (controls) controls.enabled = false
        return
      }
    }
    if (app.sketchTool === 'select' && (e.button ?? 0) === 0) {
      // GM-FP3 #46 双击链选：同位（<8px）+400ms 内两击且命中几何 → 链选整条相连轮廓。
      const now = performance.now(); const last = _selDbl.current
      const sxD = e.clientX ?? 0, syD = e.clientY ?? 0
      const isDbl = !!last && now - last.t < 400 && Math.hypot(sxD - last.x, syD - last.y) < 8
      _selDbl.current = { t: now, x: sxD, y: syD }
      if (isDbl && app.skHitTestAt(st)) { _selDbl.current = null; app.skChainSelectAt(st); return }
      // #174-8：双击近样条控制多边形段（非命中曲线本身）→ 插一个拟合点（Fusion Insert Fit Point）。
      if (isDbl && app.insertSplineFitPoint(st)) { _selDbl.current = null; return }
      if (app.skDragStart(st)) { if (controls) controls.enabled = false; if (e.pointerId !== undefined) captureGeometry(e.pointerId); return }
      // GM-FP3 #44 框选：净 navTool='select' + 空白（无命中）先开框选（延到 pointerup 定 window/crossing）；
      //   命中几何（含被 #41 拒动嘅完全约束件）→ 即选中；navTool=pan/orbit/zoom → 交返 OrbitControls 平移/环绕。
      const nav = app.navTool
      if (nav === 'select' && !app.skHitTestAt(st)) {
        marquee.current = { stx: st[0], sty: st[1], cx: sxD, cy: syD, touch: e.pointerType === 'touch' }
        if (controls) controls.enabled = false
        return
      }
      app.skClickAt(st)
      return
    }
    click(st)
    // onSketchClick 系 async，但繪圖機 set() 喺首個 await 前同步執行 → 呢度 getState 讀到最新值。
    // 只有呢下 down 真系開咗/續緊繪製手勢（sketchStart 或 polyPts 有值）先 arm — trim/offset/鏡像/草圖點/cline
    // 等單擊工具唔寫呢兩個字段 → 自然唔 arm。凍結 OrbitControls 防 navTool=pan 左鍵 / 觸屏單指平移撞手勢。
    const a2 = useApp.getState()
    if ((e.button ?? 0) === 0 && a2.mode === 'sketch' && (a2.sketchStart != null || a2.polyPts.length > 0)) {
      dragDraw.current = { x: e.clientX ?? 0, y: e.clientY ?? 0, touch: e.pointerType === 'touch' }
      if (controls) controls.enabled = false
    }
  }
  const moveH = (st: Pt, e?: { clientX?: number }) => {
    if (geometryPointer.current || scalePointer.current) return
    const app0 = useApp.getState()
    // GM-FP3 #39/#38/#44：gizmo 手柄拖 / 修剪拖扫 / 框选 —— 各自吞掉 move，唔行原有 hover/绘制 preview。
    if (moveGizmo.current) { app0.skMoveHandleMove(st); return }
    if (trimSweep.current) { app0.skTrimAt(st); return }
    if (marquee.current) { const m = marquee.current; app0.skMarqueeSet([m.stx, m.sty], st, (e?.clientX ?? m.cx) < m.cx); return }
    move(st)
    const app = useApp.getState()
    // GM-FP1 #13：相切弧手势拖动中 → 一旦移动即入 polyArcMode（arc 预览 + 落点用弧）
    if (arcGesture.current) { if (!app.polyArcMode) useApp.setState({ polyArcMode: true, status: '⌒ 相切弧手势：拖到弧终点后放手（沿上段相切引出；放手自动返直线）' }); return }
    if (app.skDrag) app.skDragMove(st)
  }
  const up = (st: Pt, e?: { clientX?: number; clientY?: number; shiftKey?: boolean }, commit = true) => {
    if (geometryPointer.current || scalePointer.current) return
    const app = useApp.getState()
    // GM-FP3 #39 Move gizmo 手柄放手
    if (moveGizmo.current) { moveGizmo.current = false; app.skMoveHandleUp(); if (controls) controls.enabled = true; return }
    // GM-FP3 #38 Trim 拖扫收尾（合并 undo 完结）
    if (trimSweep.current) { trimSweep.current = null; app.skTrimSweepEnd(); if (controls) controls.enabled = true; return }
    // GM-FP3 #44 框选收尾：过阈值 = 定案（方向定 window/crossing）；未过阈值 = 当一次普通点击（选/保留）
    if (marquee.current) {
      const m = marquee.current
      marquee.current = null
      if (controls) controls.enabled = true
      if (!commit) { app.skMarqueeClear(); return }
      const dist = e ? Math.hypot((e.clientX ?? m.cx) - m.cx, (e.clientY ?? m.cy) - m.cy) : 0
      if (dist > (m.touch ? 12 : 6)) app.skMarqueeCommit([m.stx, m.sty], st, (e?.clientX ?? m.cx) < m.cx, !!e?.shiftKey)
      else { app.skMarqueeClear(); app.skClickAt([m.stx, m.sty]) }
      return
    }
    // GM-FP1 #13：相切弧手势收尾 — 过阈值 → onSketchClick 走 polyArcMode 分支落弧段，然后返直线；未过阈值 → 取消（当㩒咗一下端点）
    if (arcGesture.current) {
      const ag = arcGesture.current
      arcGesture.current = null
      if (controls) controls.enabled = true
      const dist = e ? Math.hypot((e.clientX ?? ag.x) - ag.x, (e.clientY ?? ag.y) - ag.y) : 0
      if (commit && dist > (ag.touch ? 12 : 6) && useApp.getState().polyArcMode) { click(st) }
      useApp.setState({ polyArcMode: false })
      return
    }
    if (app.skDrag) { if (commit) void app.skDragEnd(st); else app.skDragCancel(); if (controls) controls.enabled = true }
    const dd = dragDraw.current
    if (dd) {
      dragDraw.current = null
      if (controls) controls.enabled = true
      // 超閾值先當第二擊 — click-click 用戶按下手震微移（<6px）唔會誤判成拖
      const dist = e ? Math.hypot((e.clientX ?? dd.x) - dd.x, (e.clientY ?? dd.y) - dd.y) : 0
      if (commit && dist > (dd.touch ? 12 : 6)) click(st)
    }
  }
  if (arb) {
    // Arbitrary face plane: orient the capture surface to the face basis; map hits via the same basis.
    const fr = arbFrame(arb as { o: V3; xd: V3; n: V3 })
    return (
      <mesh key="arbitrary-sketch-surface" raycast={raycast} quaternion={fr.quat} position={fr.pos}
        onPointerDown={(e) => down(fr.toST(e.point), e)}
        onPointerMove={(e) => { moveH(fr.toST(e.point), e) }}
        onPointerUp={(e) => up(fr.toST(e.point), e)}
        onPointerLeave={(e) => up(fr.toST(e.point), e, false)}
        onPointerCancel={(e) => up(fr.toST(e.point), e, false)}>
        <planeGeometry args={[8000, 8000]} />
        <meshBasicMaterial visible={false} side={DoubleSide} />
      </mesh>
    )
  }
  const cfg = SK[plane]
  return (
    <mesh key={plane} raycast={raycast}
      rotation={cfg.rot}
      position={cfg.pos(baseZ)}
      onPointerDown={(e) => down(cfg.toST(e.point), e)}
      onPointerMove={(e) => { moveH(cfg.toST(e.point), e) }}
      onPointerUp={(e) => up(cfg.toST(e.point), e)}
      onPointerLeave={(e) => up(cfg.toST(e.point), e, false)}
      onPointerCancel={(e) => up(cfg.toST(e.point), e, false)}
    >
      <planeGeometry args={[8000, 8000]} />
      <meshBasicMaterial visible={false} side={DoubleSide} />
    </mesh>
  )
}

// Renders the committed profile and the rubber-band preview at the current sketch height.
export function SketchDraw() {
  const patternCandidate = useApp(s=>hasPatternCandidate(s)||!!s.skDimPreview.shapes)
  const camera = useThree((s) => s.camera)      // 吸附环屏幕空间半径（正交 zoom / 透视距离换算）
  const vpH = useThree((s) => s.size.height)
  const mode = useApp((s) => s.mode)
  const shape = useApp((s) => s.sketchShape)
  const tool = useApp((s) => s.sketchTool)
  const ellipseCreation = useApp((s) => s.ellipseCreation)
  const ellipseArcDirection = useApp((s) => s.ellipseArcDirection)
  const start = useApp((s) => s.sketchStart)
  const preview = useApp((s) => s.sketchPreview)
  const polyPts = useApp((s) => s.polyPts)
  const polyArcMode = useApp((s) => s.polyArcMode)   // GM-FP1 #13：相切弧 submode → live 弧预览
  const polyBulges = useApp((s) => s.polyBulges)
  const dragInfer = useApp((s) => s.skDragInfer)   // GM-FP1 #24：拖动 H/V/重合 推断 glyph
  const conicRho = useApp((s) => s.sketchConicRho)   // S177：响应式订阅 → 拖 ρ 滑杆即重画圆锥曲线 ghost（refreshToolPreview 对 conic 无效）
  const profiles = useApp((s) => s.sketchProfiles)
  const snap = useApp((s) => s.sketchSnap)
  const snapSrc = useApp((s) => s.snapSrc)   // GM-W7 7.4：捕捉命中嘅源几何（线/中点/圆心）→ 高亮提示可拣
  const sweepGuide = useApp((s) => s.sweepGuide)   // T755 导轨（橙虚线）
  const loftRail = useApp((s) => s.loftRail)       // T772 放样导轨（橙虚线同款）
  const plane = useApp((s) => s.sketchPlane)
  const baseZ = useApp((s) => s.sketchBaseZ)
  const arb = useApp((s) => s.sketchArb)
  const arbLiftFn = useMemo(() => (arb ? arbFrame(arb as { o: V3; xd: V3; n: V3 }).lift : null), [arb])
  const lift: Lift = arbLiftFn ?? ((p) => SK[plane].lift(p, baseZ))
  const shapeToPts = (sh: NonNullable<typeof shape>) =>
    sh.type === 'rect' ? rectPts(sh.a, sh.b, lift)
      : sh.type === 'circle' ? circlePts(sh.c, sh.r, lift)
        : sh.open ? sh.pts.map(lift)   // T760：开放路径（修剪结果）唔好视觉闭合
          : [...sh.pts.map(lift), lift(sh.pts[0])]

  // Closed-profile shading: translucent filled faces (with holes) behind the outlines.
  // Construction geometry (虚线参考) is excluded — it never participates in profiles.
  const fillGeom = useMemo(
    () => {
      if (mode !== 'sketch') return null   // GM-W6 C5：移走 `|| arb` 守卫 — 斜面草图原本冇轮廓填充（睇唔到可拉伸区）
      // 平面排布：所有非构造图元（含开放折线）→ 相交切段 → 封闭区域。相交曲线围成嘅面会填充（Fusion 式）。
      const all = [...profiles, ...(shape ? [shape] : [])].filter((sh) => !sh.construction)
      // v1.35: skip region fill on schematic-scale sketches (cost + memory; outlines remain).
      if (all.length >= SKETCH_FILL_SKIP_THRESHOLD) return null
      const reg = detectRegions(all as unknown as RShape[])
      // 有检测到面 → 用面（even-odd 平铺即整区填充）；否则回落旧「逐闭合图形」路（安全网）
      const loops = reg.faces.length ? reg.faces : all.filter((sh) => !(sh.type === 'poly' && sh.open)).map(shapeLoop2D)
      // GM-W6 C5：斜面（arb）用 arbFrame lift + 沿法向微抬 0.06（同 RegionPickLayer）；卡片面 liftFn=undefined 照旧
      const arbFr = arb ? arbFrame(arb as { o: V3; xd: V3; n: V3 }) : null
      const liftFill: Lift | undefined = arbFr && arb
        ? (() => { const n = (arb as { n: V3 }).n; const nT: V3 = [n[0], n[2], -n[1]]; return (p: Pt) => { const b = arbFr.lift(p); return [b[0] + 0.06 * nT[0], b[1] + 0.06 * nT[1], b[2] + 0.06 * nT[2]] as V3 } })()
        : undefined
      return buildFillGeometry(loops, plane, baseZ, liftFill)
    },
    [mode, profiles, shape, plane, baseZ, arb],
  )
  useEffect(() => () => { fillGeom?.dispose() }, [fillGeom])

  // Committed contours (multi-contour) + current finished shape + live preview.
  // Fusion 全约束变色（sketch 级 v1）：约束求解后 DOF=0 且无冲突 → 几何画黑（完全定义、锁死）；
  // 否则蓝（仍可拖/欠定义）。planegcs 只报整图 DOF，逐实体变色待 per-param 诊断接口。
  const skDof = useApp((s) => s.skDof)
  const skConflict = useApp((s) => s.skConflict)
  const skCons = useApp((s) => s.skCons)
  const nCons = skCons.length
  const skView = useApp((s) => s.skView)   // Fusion SKETCH PALETTE 显示开关
  // GM-FP2 #26：固定/接地几何 = 绿色第三态（≠ 蓝欠定 / 黑完全定义）。fix 约束成员标记 → 绿。
  const fixGeometry=[...profiles,...(shape?[shape]:[])]
  const fixedShapes = new Set<number>()
  for(const c of skCons)if(c.kind==='con'&&c.type==='fix'&&'shape'in c.a&&fixGeometry[c.a.shape]&&fixesWholeShape(fixGeometry[c.a.shape],c.a))fixedShapes.add(c.a.shape)
  // Partial free probes cannot establish that an omitted entity is fixed.
  // Until verified per-entity fixed metadata exists, positive/unknown DOF stays blue.
  const lineColor = (idx:number) => sketchConstraintColor(fixedShapes.has(idx),skDof,skConflict,nCons)
  // Fusion-style fixed geometry needs a semantic cue as well as the green stroke.
  // A small padlock at the geometry centre remains understandable for colour-blind
  // users and makes it clear why a drag is rejected.
  const fixedGlyph = (sh: NonNullable<typeof shape>, key: string, idx: number): ReactNode => {
    if (!fixedShapes.has(idx)||!sketchGeometryVisible(sh,skView)) return null
    const c: Pt = sh.type === 'rect'
      ? [(sh.a[0] + sh.b[0]) / 2, (sh.a[1] + sh.b[1]) / 2]
      : sh.type === 'circle' ? sh.c
        : sh.pts.length
          ? [sh.pts.reduce((n, p) => n + p[0], 0) / sh.pts.length, sh.pts.reduce((n, p) => n + p[1], 0) / sh.pts.length]
          : [0, 0]
    const s = 2.2
    const body: Pt[] = [[c[0] - s, c[1] - s], [c[0] + s, c[1] - s], [c[0] + s, c[1] + .8 * s], [c[0] - s, c[1] + .8 * s], [c[0] - s, c[1] - s]]
    const shackle: Pt[] = Array.from({ length: 9 }, (_, i) => {
      const a = Math.PI - i * Math.PI / 8
      return [c[0] + 1.25 * s * Math.cos(a), c[1] + .8 * s + 1.25 * s * Math.sin(a)] as Pt
    })
    return <group key={`${key}-fixed-glyph`} userData={{ semantic: 'fixed-geometry-lock' }}>
      <Line points={body.map(lift)} color="#1b7f37" lineWidth={2.1} />
      <Line points={shackle.map(lift)} color="#1b7f37" lineWidth={2.1} />
      <Line points={[lift([c[0], c[1] - .35 * s]), lift([c[0], c[1] + .15 * s])]} color="#1b7f37" lineWidth={1.7} />
    </group>
  }
  // Sketch POINT (r=0 construction circle): an × marker. Construction shapes: dashed AMBER (Fusion 琥珀虚线, GM-FP2 #21).
  const drawShape = (sh: NonNullable<typeof shape>, key: string, idx: number) => {
    if(!sketchGeometryVisible(sh,skView))return null
    if (sh.type === 'circle' && sh.point) {
      if (!skView.points) return null   // GM-FP4 #4：Points 可见性开关（Fusion palette Points）
      const c = sh.c
      const ptColor = fixedShapes.has(idx) ? '#2f9e44' : '#7d6ba0'   // GM-FP2 #26：固定草图点亦转绿
      return (
        <group key={key}>
          <Line points={[lift([c[0] - 1.8, c[1] - 1.8]), lift([c[0] + 1.8, c[1] + 1.8])]} color={ptColor} lineWidth={2.2} />
          <Line points={[lift([c[0] - 1.8, c[1] + 1.8]), lift([c[0] + 1.8, c[1] - 1.8])]} color={ptColor} lineWidth={2.2} />
        </group>)
    }
    // GM-3DV2 R3：投影几何（projected）= Fusion 紫/洋红专属色 + 紫端点十字，区别于黑作图线（可拉伸/编辑）。
    if (sh.type === 'poly' && sh.projected && !sh.construction) {
      const P = shapeToPts(sh)
      const ep: Pt[] = sh.type === 'poly' && sh.pts.length ? [sh.pts[0], sh.pts[sh.pts.length - 1]] : []
      return (
        <group key={key}>
          <Line points={P} color="#b14fd8" lineWidth={2.3} />
          {ep.map((q, ei) => (
            <group key={'pe' + ei}>
              <Line points={[lift([q[0] - 1.6, q[1] - 1.6]), lift([q[0] + 1.6, q[1] + 1.6])]} color="#b14fd8" lineWidth={2} />
              <Line points={[lift([q[0] - 1.6, q[1] + 1.6]), lift([q[0] + 1.6, q[1] - 1.6])]} color="#b14fd8" lineWidth={2} />
            </group>
          ))}
        </group>)
    }
    // GM-FP4 #23：中心线（centerline）= 长-短交替点划线（center-line dash pattern），同普通构造虚线区分（旋转轴/对称参照语义）。
    if (sh.type === 'poly' && sh.centerline) return skView.constr ? <Line key={key} points={shapeToPts(sh)} color="#d9a23a" lineWidth={1.5} dashed dashSize={9} gapSize={3} dashScale={1.2} /> : null
    if (sh.construction) return skView.constr ? <Line key={key} points={shapeToPts(sh)} color="#d9a23a" lineWidth={1.6} dashed dashSize={3.2} gapSize={2.4} /> : null
    return <Line key={key} points={shapeToPts(sh)} color={lineColor(idx)} lineWidth={2.5} />
  }
  const totalShapes = profiles.length + (shape ? 1 : 0)
  const useBatch = totalShapes >= SKETCH_BATCH_THRESHOLD
  const els: ReactNode[] = []
  if (useBatch) {
    const batched = batchSketchPositions([...profiles, ...(shape ? [shape] : [])] as BatchShape[], lift)
    els.push(<BatchedSketchLines key="sk-batch-solid" positions={batched.solid} color={sketchConstraintColor(false, skDof, skConflict, nCons)} />)
    els.push(<BatchedSketchLines key="sk-batch-constr" positions={batched.constr} color="#d9a23a" opacity={0.95} />)
  } else {
    for (let i = 0; i < profiles.length; i++) {
      const node = drawShape(profiles[i], 'cp' + i, i)
      if (node) els.push(node)
    }
  }
  for(const c of skCons)if(c.kind==='con'&&c.type==='fix'&&'shape'in c.a&&!fixedShapes.has(c.a.shape)){
    const sh=fixGeometry[c.a.shape]
    if(!sh||!sketchGeometryVisible(sh,skView))continue
    const points=refPts(fixGeometry,c.a)
    if(c.a.kind==='edge'&&points.length>=2){
      const bulge=sh.type==='poly'?sh.bulges?.[c.a.idx]??0:0
      const path=bulge?tessellateSeg(points[0],points[1],bulge):points
      els.push(<Line key={'fix-ref-'+c.id} points={path.map(lift)} color="#2f9e44" lineWidth={3} userData={{semantic:'fixed-edge'}} />)
    }else if(points[0]){
      const p=points[0],r=1.2
      els.push(<Line key={'fix-ref-'+c.id} points={[[p[0]-r,p[1]-r],[p[0]+r,p[1]+r],[p[0],p[1]],[p[0]-r,p[1]+r],[p[0]+r,p[1]-r]].map(q=>lift(q as Pt))} color="#2f9e44" lineWidth={3} userData={{semantic:'fixed-point'}} />)
    }
  }
  if (!useBatch) profiles.forEach((sh, i) => { const glyph = fixedGlyph(sh, 'cp' + i, i); if (glyph) els.push(glyph) })
  if (fillGeom && skView.fill) els.unshift(<mesh key="fill" geometry={fillGeom} renderOrder={-1}><meshBasicMaterial color="#5b8fd9" transparent opacity={0.3} side={DoubleSide} depthWrite={false} /></mesh>)
  // Point-snap marker (Fusion-style): a small ring where the cursor snaps to an existing point.
  // 用户实战 feedback：旧版写死世界半径 3mm — 放大画面时变成巨环，遮住尺寸标签/落点。改屏幕空间恒定 ~9px：
  // 正交（草图默认视角）r=px/zoom；透视按吸附点距离换算 mm/px。缩放画面时 snap 状态本身会随鼠标刷新 → 半径实时跟。
  if (snap && mode === 'sketch') {
    const SNAP_PX = 9
    const camA = camera as unknown as { isOrthographicCamera?: boolean; zoom?: number; fov?: number; position: { x: number; y: number; z: number } }
    let snapR = 3
    if (camA.isOrthographicCamera) snapR = SNAP_PX / (camA.zoom || 1)
    else { const w = lift(snap); const d = Math.hypot(camA.position.x - w[0], camA.position.y - w[1], camA.position.z - w[2]); snapR = (d * Math.tan(((camA.fov || 28) * Math.PI / 180) / 2) * 2 / (vpH || 800)) * SNAP_PX }
    snapR = Math.min(30, Math.max(0.25, snapR))   // 极端缩放钳位：唔细过 0.25mm、唔大过 30mm
    els.push(<Line key="snap" points={circlePts(snap, snapR, lift)} color="#ff8c00" lineWidth={2.4} />)
  }
  // GM-W7 7.4：捕捉命中嘅【源几何】高亮（蓝 accent #1572c4）——橙环净标咗「落点位置」，但唔知呢个位系边条线/中点/圆心嚟。
  // 而家：吸到线段端点/中点 → 成条源线段亮起（读得出「呢条线可拣做 datum」）；吸到圆心 → 画十字。以 snap（橙环）为闸，唔会有残留高亮。
  if (snapSrc && snap && mode === 'sketch') {
    const SC = '#1572c4'
    if (snapSrc.seg) els.push(<Line key="snapsrc" points={[lift(snapSrc.seg[0]), lift(snapSrc.seg[1])]} color={SC} lineWidth={2.4} />)
    else if (snapSrc.kind === 'center') {
      const p = snapSrc.p
      els.push(
        <group key="snapsrc">
          <Line points={[lift([p[0] - 2.6, p[1]]), lift([p[0] + 2.6, p[1]])]} color={SC} lineWidth={2.2} />
          <Line points={[lift([p[0], p[1] - 2.6]), lift([p[0], p[1] + 2.6])]} color={SC} lineWidth={2.2} />
        </group>)
    }
  }
  // T755 扫掠导轨（银行后橙虚线显示 — 提醒用户下一条折线系路径）
  if (sweepGuide && sweepGuide.length >= 2 && mode === 'sketch') els.push(<Line key="swguide" points={sweepGuide.map(lift)} color="#ff8c00" lineWidth={1.6} dashed dashSize={4} gapSize={2.5} />)
  if (loftRail && loftRail.length >= 2 && mode === 'sketch') els.push(<Line key="loftrail" points={loftRail.map(lift)} color="#ff8c00" lineWidth={1.6} dashed dashSize={4} gapSize={2.5} />)
  if (shape && !useBatch) {
    els.push(drawShape(shape, 'cur', profiles.length))
  } else if (mode === 'sketch') {
    // GM-FP1 #13：折线相切弧 submode（A 键 / 端点拖弧手势）— 末段画成沿上段相切引出嘅真圆弧预览（bulge = tan(φ/2)）。
    if (tool === 'polyline' && polyArcMode && polyPts.length >= 2 && preview) {
      const P = polyPts[polyPts.length - 1]
      const t = endTangent(polyPts, polyBulges)
      const straight: V3[] = []
      for (let i = 0; i < polyPts.length - 1; i++) { const seg = tessellateSeg(polyPts[i], polyPts[i + 1], polyBulges[i] ?? 0); for (const q of seg) straight.push(lift(q)) }
      let arcSeg: Pt[] = [P, preview]
      if (t) {
        const v: Pt = [preview[0] - P[0], preview[1] - P[1]]
        const phi = Math.atan2(t[0] * v[1] - t[1] * v[0], t[0] * v[0] + t[1] * v[1])
        if (Math.abs(phi) > 1e-3 && Math.abs(phi) < (170 * Math.PI) / 180 / 2 && Math.hypot(v[0], v[1]) > 1e-3) arcSeg = tessellateSeg(P, preview, Math.tan(phi / 2))
      }
      els.push(<Line key="live" points={[...straight, ...arcSeg.map(lift)]} color="#1572c4" lineWidth={1.8} />)
    } else if ((tool === 'polyline' || tool === 'spline' || tool === 'bspline') && polyPts.length > 0) {
      const ctrl2d: Pt[] = preview ? [...polyPts, preview] : polyPts
      // S127：B 样条 live 预览 — 画紧时铺开放（clamped）立方 B 样条曲线（同闭合后一致嘅 de Boor）；
      // polyline/spline 维持原行为（直线控制多边形预览，平滑曲线喺收尾先成形）。
      const pp = (tool === 'bspline' && ctrl2d.length >= 3)
        ? sampleBSpline(ctrl2d, { closed: false, samples: Math.max(24, ctrl2d.length * 12) }).map((q) => lift([q[0], q[1]]))
        : ctrl2d.map(lift)
      if (pp.length >= 2) els.push(<Line key="live" points={pp} color="#1572c4" lineWidth={1.8} />)
    } else if (start && preview) {
      if (tool === 'rectangle') els.push(<Line key="live" points={rectPts(start, preview, lift)} color="#1572c4" lineWidth={1.5} dashed dashSize={4} gapSize={3} />)
      else if (tool === 'mline') {   // GM-FP4 #16：中点线预览 — 由中点 start 向两端对称（preview 一端，2·start−preview 另一端）
        const B: Pt = [2 * start[0] - preview[0], 2 * start[1] - preview[1]]
        els.push(<Line key="live" points={[lift(preview), lift(B)]} color="#1572c4" lineWidth={1.6} />)
        els.push(<Line key="livemid" points={[lift([start[0] - 1.6, start[1]]), lift([start[0] + 1.6, start[1]])]} color="#8a97a2" lineWidth={1.4} />)
      }
      else if (tool === 'crect') els.push(<Line key="live" points={rectPts([2 * start[0] - preview[0], 2 * start[1] - preview[1]], preview, lift)} color="#1572c4" lineWidth={1.5} dashed dashSize={4} gapSize={3} />)
      else if (tool === 'circle') { const r = Math.hypot(preview[0] - start[0], preview[1] - start[1]); els.push(<Line key="live" points={circlePts(start, r, lift)} color="#1572c4" lineWidth={1.5} dashed dashSize={4} gapSize={3} />) }
      else if (tool === 'circle2p') {   // GM-FP1 #15：两点圆预览 — 直径 start→preview，圆心=中点，半径=距离/2（另画直径虚线）
        const cmid = [(start[0] + preview[0]) / 2, (start[1] + preview[1]) / 2] as Pt
        const r = Math.hypot(preview[0] - start[0], preview[1] - start[1]) / 2
        els.push(<Line key="live" points={circlePts(cmid, r, lift)} color="#1572c4" lineWidth={1.5} dashed dashSize={4} gapSize={3} />)
        els.push(<Line key="livedia" points={[lift(start), lift(preview)]} color="#8a97a2" lineWidth={1} dashed dashSize={3} gapSize={3} />)
      }
      else if (tool === 'polygon') {
        const N = useApp.getState().sketchSides, ins = useApp.getState().polyInscribed
        const clicked = Math.hypot(preview[0] - start[0], preview[1] - start[1]) || 1
        const r = ins ? clicked / Math.cos(Math.PI / N) : clicked
        const a0 = Math.atan2(preview[1] - start[1], preview[0] - start[0]) + (ins ? Math.PI / N : 0)
        const pp: V3[] = []
        for (let i = 0; i <= N; i++) { const a = a0 + (i * 2 * Math.PI) / N; pp.push(lift([start[0] + r * Math.cos(a), start[1] + r * Math.sin(a)])) }
        els.push(<Line key="live" points={pp} color="#1572c4" lineWidth={1.5} dashed dashSize={4} gapSize={3} />)
      }
      else if (tool === 'ellipse') {
        if (ellipseCreation === 'three-point' && !polyPts.length) {
          els.push(<Line key="ellipse-major-preview" points={[lift(start),lift(preview)]} color="#1572c4" lineWidth={1.5} dashed dashSize={4} gapSize={3} />)
        } else {
          const endpoint = polyPts[0]
          const rx = ellipseCreation === 'three-point' && endpoint ? Math.hypot(endpoint[0]-start[0],endpoint[1]-start[1]) : Math.abs(preview[0]-start[0]) || 1
          const rotation = ellipseCreation === 'three-point' && endpoint ? Math.atan2(endpoint[1]-start[1],endpoint[0]-start[0]) : 0
          const cr = Math.cos(rotation), sr = Math.sin(rotation)
          const ry = ellipseCreation === 'three-point' ? Math.abs(-(preview[0]-start[0])*sr+(preview[1]-start[1])*cr) : Math.abs(preview[1]-start[1]) || 1
          const pp: V3[] = []
          for (let i=0;i<=48;i++) { const a=i*Math.PI/24,x=rx*Math.cos(a),y=ry*Math.sin(a); pp.push(lift([start[0]+x*cr-y*sr,start[1]+x*sr+y*cr])) }
          els.push(<Line key="live" points={pp} color="#1572c4" lineWidth={1.5} dashed dashSize={4} gapSize={3} />)
          if (ellipseCreation === 'three-point' && endpoint) els.push(<Line key="ellipse-semiaxes-preview" points={[lift(endpoint),lift(start),lift([start[0]-ry*sr,start[1]+ry*cr])]} color="#8a98a8" lineWidth={1} dashed dashSize={2} gapSize={2} />)
        }
      }
      else if (tool === 'earc') {
        // S101[3] 椭圆弧 live ghost — 分阶段引导，公式同 store.skClickAt('earc') 完全一致：
        //   1 点(中心) → 2 点(长轴端=rx+旋转) → 3 点(短轴 ry) → 4 点(起角) → 5 点(终角 CCW)。
        const C = polyPts.length ? polyPts[0] : start
        // 全椭圆虚线（rx, ry, rot 已知时画）：本地椭圆 (rx·cos t, ry·sin t) 经旋转 R(rot) 抬到草图面。
        const fullEll = (rx: number, ry: number, rot: number, key: string) => {
          const cr = Math.cos(rot), sr = Math.sin(rot), pp: V3[] = []
          for (let i = 0; i <= 64; i++) { const t = (i * 2 * Math.PI) / 64, ex = rx * Math.cos(t), ey = ry * Math.sin(t); pp.push(lift([C[0] + ex * cr - ey * sr, C[1] + ex * sr + ey * cr])) }
          els.push(<Line key={key} points={pp} color="#9fb0bd" lineWidth={1} dashed dashSize={4} gapSize={4} />)
        }
        if (polyPts.length <= 1) {
          // Stage 1（中心已放）：center→preview 虚线（定紧长轴）＋ 一个 ry=rx/2 嘅椭圆猜测（faint）。
          const rx = Math.hypot(preview[0] - C[0], preview[1] - C[1]) || 1
          const rot = Math.atan2(preview[1] - C[1], preview[0] - C[0])
          els.push(<Line key="liveAxis" points={[lift(C), lift(preview)]} color="#8a97a2" lineWidth={1} dashed dashSize={3} gapSize={3} />)
          fullEll(rx, rx / 2, rot, "live")
        } else {
          // rx + 长轴单位向量（axis）＋ 垂直方向（perp）固定（buf[1] = 长轴端）。
          const axisEnd = polyPts[1]
          const rx = Math.hypot(axisEnd[0] - C[0], axisEnd[1] - C[1]) || 1
          const rot = Math.atan2(axisEnd[1] - C[1], axisEnd[0] - C[0])
          const ux = Math.cos(rot), uy = Math.sin(rot)                                   // 长轴单位向量
          const proj = (P: Pt) => { const dx = P[0] - C[0], dy = P[1] - C[1]; return { u: dx * ux + dy * uy, v: -dx * uy + dy * ux } }
          els.push(<Line key="liveAxis" points={[lift(C), lift(axisEnd)]} color="#8a97a2" lineWidth={1.2} dashed dashSize={3} gapSize={3} />)
          if (polyPts.length === 2) {
            // Stage 2：定紧 ry → preview 的垂直距离 = ry；画 center→（投影到 perp）的虚线 + 全椭圆。
            const q = proj(preview), ry = Math.abs(q.v) || 1
            els.push(<Line key="liveRy" points={[lift(C), lift([C[0] + (-uy) * q.v, C[1] + ux * q.v])]} color="#8a97a2" lineWidth={1} dashed dashSize={3} gapSize={3} />)
            fullEll(rx, ry, rot, "live")
          } else {
            // rx, ry, rot 全部固定。
            const ry = Math.abs(proj(polyPts[2]).v) || 1
            fullEll(rx, ry, rot, "liveEll")
            const cr = Math.cos(rot), sr = Math.sin(rot)
            // 椭圆参数角（同 store angOf）：atan2(v/ry, u/rx)。
            const angOf = (P: Pt) => { const p = proj(P); return Math.atan2(p.v / ry, p.u / rx) }
            const ept = (t: number): Pt => { const ex = rx * Math.cos(t), ey = ry * Math.sin(t); return [C[0] + ex * cr - ey * sr, C[1] + ex * sr + ey * cr] }
            if (polyPts.length === 3) {
              // Stage 3：rx,ry,rot 定 → 画 center→preview 椭圆边上点 的径向线，标起始角。
              const a0 = angOf(preview)
              els.push(<Line key="live" points={[lift(C), lift(ept(a0))]} color="#1572c4" lineWidth={1.5} dashed dashSize={4} gapSize={3} />)
            } else {
              // Stage 4：起角固定，扫到 preview 角（CCW）→ 画真椭圆弧弓形 + 弦。
              const a0 = angOf(polyPts[3]), a1 = angOf(preview)
              const dA = ellipseArcSweep({cx:C[0],cy:C[1],rx,ry,rot:rot*180/Math.PI,a0:a0*180/Math.PI,a1:a1*180/Math.PI,sweep:ellipseArcDirection==='ccw'})*Math.PI/180
              const SEG = 32, pp: V3[] = []
              for (let i = 0; i <= SEG; i++) pp.push(lift(ept(a0 + dA * i / SEG)))
              els.push(<Line key="live" points={pp} color="#1572c4" lineWidth={1.5} dashed dashSize={4} gapSize={3} />)
              els.push(<Line key="liveChord" points={[lift(ept(a0)), lift(ept(a0 + dA))]} color="#8a97a2" lineWidth={1} dashed dashSize={3} gapSize={3} />)
            }
          }
        }
      }
      else if (tool === 'rrect') {
        const x0 = Math.min(start[0], preview[0]), x1 = Math.max(start[0], preview[0])
        const y0 = Math.min(start[1], preview[1]), y1 = Math.max(start[1], preview[1])
        const w = x1 - x0, h = y1 - y0, r = Math.max(0, Math.min(useApp.getState().sketchCornerR, Math.min(w, h) / 2))
        const pp: V3[] = []
        if (r < 0.5) { pp.push(lift([x0, y0]), lift([x1, y0]), lift([x1, y1]), lift([x0, y1]), lift([x0, y0])) }
        else {
          const arc = (cx: number, cy: number, a0: number, a1: number) => { for (let i = 0; i <= 6; i++) { const t = a0 + ((a1 - a0) * i) / 6; pp.push(lift([cx + r * Math.cos(t), cy + r * Math.sin(t)])) } }
          arc(x1 - r, y0 + r, -Math.PI / 2, 0); arc(x1 - r, y1 - r, 0, Math.PI / 2); arc(x0 + r, y1 - r, Math.PI / 2, Math.PI); arc(x0 + r, y0 + r, Math.PI, 3 * Math.PI / 2); pp.push(pp[0])
        }
        els.push(<Line key="live" points={pp} color="#1572c4" lineWidth={1.5} dashed dashSize={4} gapSize={3} />)
      }
      else if (tool === 'arcslot') {
        const c = start, w = (useApp.getState().sketchSlotW || 20) / 2
        if (polyPts.length === 0) {
          // Stage A: centre set, picking first end → show radius guide + dashed full circle hint.
          const R = Math.hypot(preview[0] - c[0], preview[1] - c[1]) || 1
          els.push(<Line key="liveR" points={[lift(c), lift(preview)]} color="#8a97a2" lineWidth={1} dashed dashSize={3} gapSize={3} />)
          els.push(<Line key="live" points={circlePts(c, R, lift)} color="#9fb0bd" lineWidth={1} dashed dashSize={4} gapSize={4} />)
        } else {
          // Stage B: build the same arc-slot loop the store commits, so the ghost matches the result.
          const p1 = polyPts[0], R = Math.hypot(p1[0] - c[0], p1[1] - c[1]) || 1
          const a0 = Math.atan2(p1[1] - c[1], p1[0] - c[0]); let sweep = Math.atan2(preview[1] - c[1], preview[0] - c[0]) - a0
          while (sweep <= -Math.PI) sweep += 2 * Math.PI; if (sweep < 0) sweep += 2 * Math.PI
          const SEG = Math.max(8, Math.round(Math.abs(sweep) / 0.12)), a1f = a0 + sweep
          const rd = (a: number): Pt => [Math.cos(a), Math.sin(a)], tg = (a: number): Pt => [-Math.sin(a), Math.cos(a)]
          const pp: V3[] = []
          for (let i = 0; i <= SEG; i++) { const a = a0 + sweep * i / SEG; pp.push(lift([c[0] + (R + w) * Math.cos(a), c[1] + (R + w) * Math.sin(a)])) }
          { const E: Pt = [c[0] + R * Math.cos(a1f), c[1] + R * Math.sin(a1f)], r = rd(a1f), t = tg(a1f); for (let i = 1; i < 8; i++) { const f = Math.PI * i / 8; pp.push(lift([E[0] + w * (Math.cos(f) * r[0] + Math.sin(f) * t[0]), E[1] + w * (Math.cos(f) * r[1] + Math.sin(f) * t[1])])) } }
          for (let i = SEG; i >= 0; i--) { const a = a0 + sweep * i / SEG; pp.push(lift([c[0] + (R - w) * Math.cos(a), c[1] + (R - w) * Math.sin(a)])) }
          { const E: Pt = [c[0] + R * Math.cos(a0), c[1] + R * Math.sin(a0)], r = rd(a0), t = tg(a0); for (let i = 1; i < 8; i++) { const f = Math.PI * i / 8; pp.push(lift([E[0] - w * (Math.cos(f) * r[0] + Math.sin(f) * t[0]), E[1] - w * (Math.cos(f) * r[1] + Math.sin(f) * t[1])])) } }
          pp.push(pp[0])
          els.push(<Line key="live" points={pp} color="#1572c4" lineWidth={1.5} dashed dashSize={4} gapSize={3} />)
        }
      }
      else if (tool === 'slot') {
        const dx = preview[0] - start[0], dy = preview[1] - start[1], L = Math.hypot(dx, dy) || 1
        const a = Math.atan2(dy / L, dx / L), r = (useApp.getState().sketchSlotW || 20) / 2
        const pp: V3[] = []
        const cap = (cx: number, cy: number, s0: number, e0: number) => { for (let i = 0; i <= 16; i++) { const t = s0 + ((e0 - s0) * i) / 16; pp.push(lift([cx + r * Math.cos(t), cy + r * Math.sin(t)])) } }
        cap(preview[0], preview[1], a + Math.PI / 2, a - Math.PI / 2)
        cap(start[0], start[1], a - Math.PI / 2, a - (3 * Math.PI) / 2)
        pp.push(pp[0])
        els.push(<Line key="live" points={pp} color="#1572c4" lineWidth={1.5} dashed dashSize={4} gapSize={3} />)
      }
      // T795：补齐 CREATE 工具 live 预览（虚线 ghost，公式同 store commit 一致）
      else if (tool === 'arc') {   // 三点圆弧：① 起 → ② 终（弦）→ ③ 弧上点（cursor 即真弧）
        if (polyPts.length >= 2) els.push(<Line key="live" points={arc3(polyPts[0], polyPts[1], preview).map(lift)} color="#1572c4" lineWidth={1.5} dashed dashSize={4} gapSize={3} />)
        else els.push(<Line key="live" points={[lift(polyPts[0] ?? start), lift(preview)]} color="#8a97a2" lineWidth={1.2} dashed dashSize={3} gapSize={3} />)
      }
      else if (tool === 'conic') {   // S177 圆锥曲线：① 起 → ② 终（弦）→ ③ cursor=顶点（即真圆锥曲线，ρ 来自底栏）
        if (polyPts.length >= 2) {
          els.push(<Line key="liveT" points={[lift(polyPts[0]), lift(preview), lift(polyPts[1])]} color="#8a97a2" lineWidth={1} dashed dashSize={2} gapSize={1.5} />)   // 控制三角（起→顶→终）
          els.push(<Line key="live" points={sampleConic(polyPts[0], polyPts[1], preview, conicRho || 0.5, 48).map(lift)} color="#1572c4" lineWidth={1.5} dashed dashSize={4} gapSize={3} />)
        } else els.push(<Line key="live" points={[lift(polyPts[0] ?? start), lift(preview)]} color="#8a97a2" lineWidth={1.2} dashed dashSize={3} gapSize={3} />)
      }
      else if (tool === 'arcc') {   // 中心点圆弧：① 圆心 → ② 起点(定 R) → ③ 终点(扫角，短向)
        const c = start
        if (polyPts.length === 0) {
          const R = Math.hypot(preview[0] - c[0], preview[1] - c[1]) || 1
          els.push(<Line key="liveR" points={[lift(c), lift(preview)]} color="#8a97a2" lineWidth={1} dashed dashSize={3} gapSize={3} />)
          els.push(<Line key="live" points={circlePts(c, R, lift)} color="#9fb0bd" lineWidth={1} dashed dashSize={4} gapSize={4} />)
        } else {
          const A = polyPts[0], R = Math.hypot(A[0] - c[0], A[1] - c[1]) || 1, a0 = Math.atan2(A[1] - c[1], A[0] - c[0])
          let sweep = Math.atan2(preview[1] - c[1], preview[0] - c[0]) - a0
          while (sweep <= -Math.PI) sweep += 2 * Math.PI; while (sweep > Math.PI) sweep -= 2 * Math.PI
          const SEG = Math.max(8, Math.round(Math.abs(sweep) / 0.12)), pp: V3[] = []
          for (let i = 0; i <= SEG; i++) { const a = a0 + sweep * i / SEG; pp.push(lift([c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)])) }
          els.push(<Line key="liveR" points={[lift(c), lift(A)]} color="#8a97a2" lineWidth={1} dashed dashSize={3} gapSize={3} />)
          els.push(<Line key="live" points={pp} color="#1572c4" lineWidth={1.5} dashed dashSize={4} gapSize={3} />)
        }
      }
      else if (tool === 'rect3') {   // 三点矩形：① → ② 定一条边 → ③ 定宽（投影到边法向）
        if (polyPts.length === 0) els.push(<Line key="live" points={[lift(start), lift(preview)]} color="#8a97a2" lineWidth={1.2} dashed dashSize={3} gapSize={3} />)
        else {
          const A = start, B = polyPts[0], C = preview, ex = B[0] - A[0], ey = B[1] - A[1], L = Math.hypot(ex, ey) || 1
          const nx = -ey / L, ny = ex / L, w = (C[0] - B[0]) * nx + (C[1] - B[1]) * ny
          const D2: Pt = [B[0] + nx * w, B[1] + ny * w], E2: Pt = [A[0] + nx * w, A[1] + ny * w]
          els.push(<Line key="live" points={[lift(A), lift(B), lift(D2), lift(E2), lift(A)]} color="#1572c4" lineWidth={1.5} dashed dashSize={4} gapSize={3} />)
        }
      }
      else if (tool === 'circle3') {   // 三点圆：① → ② → ③（外接圆）
        if (polyPts.length >= 2) { const cc = circumcircle(polyPts[0], polyPts[1], preview); if (cc) els.push(<Line key="live" points={circlePts(cc.c, cc.r, lift)} color="#1572c4" lineWidth={1.5} dashed dashSize={4} gapSize={3} />) }
        else els.push(<Line key="live" points={[lift(polyPts[0] ?? start), lift(preview)]} color="#8a97a2" lineWidth={1.2} dashed dashSize={3} gapSize={3} />)
      }
    }
  }
  // GM-FP1 #24：H/V/重合 推断 glyph（蓝色，同 draw/drag 一致）。H = 段中点上方短横；V = 右方短竖；coin = 小方框。
  const inferGlyph = (p: Pt, kind: 'h' | 'v' | 'coin', key: string): ReactNode => {
    const SC = '#1572c4', s = 1.8
    if (kind === 'coin') return <Line key={key} points={[lift([p[0] - s, p[1] - s]), lift([p[0] + s, p[1] - s]), lift([p[0] + s, p[1] + s]), lift([p[0] - s, p[1] + s]), lift([p[0] - s, p[1] - s])]} color={SC} lineWidth={2} />
    const c: Pt = kind === 'h' ? [p[0], p[1] + 3.2] : [p[0] + 3.2, p[1]]
    const bar: V3[] = kind === 'h' ? [lift([c[0] - s, c[1]]), lift([c[0] + s, c[1]])] : [lift([c[0], c[1] - s]), lift([c[0], c[1] + s])]
    return <Line key={key} points={bar} color={SC} lineWidth={2.8} />
  }
  // 绘制时方向推断（折线末段吸到水平/竖直即现 glyph — 同 sketchDimText 嘅 0.05 tol 一致）
  if (mode === 'sketch' && !shape && tool === 'polyline' && !polyArcMode && polyPts.length >= 1 && preview) {
    const last = polyPts[polyPts.length - 1]
    const dx = Math.abs(preview[0] - last[0]), dy = Math.abs(preview[1] - last[1]), mid: Pt = [(preview[0] + last[0]) / 2, (preview[1] + last[1]) / 2]
    if (dy < 0.05 && dx > 1) els.push(inferGlyph(mid, 'h', 'drawinf'))
    else if (dx < 0.05 && dy > 1) els.push(inferGlyph(mid, 'v', 'drawinf'))
  }
  // 拖动时推断（select 工具拖点/边 → skDragInfer 由 store 每帧算）
  if (mode === 'sketch' && dragInfer) dragInfer.forEach((g, i) => els.push(inferGlyph(g.p, g.kind, 'draginf' + i)))
  return !patternCandidate && els.length ? <>{els}</> : null
}

// Live ghost of the extrusion while the extrude dialog is open (Fusion-style preview).
// Pure line cage (bottom + top loops + connectors) → robust, no worker/geometry. Cardinal planes only.
// P2（用户实战 feedback）：Fusion Profile 区域点选层 — 拉伸对话框开住时，相交轮廓围成嘅每个最小封闭面
// 渲染成可点击半透明填充（蓝=拉伸 / 灰=唔拉），点击切换。faces 来自 detectRegions（(s,t) 草图坐标 → lift 上草图面）。
export function RegionPickLayer() {
  const open = useApp((s) => s.extrudeDlgOpen)
  const faces = useApp((s) => s.extrudeRegionFaces)
  const sel = useApp((s) => s.extrudeRegionSel)
  const plane = useApp((s) => s.sketchPlane)
  const baseZ = useApp((s) => s.sketchBaseZ)
  const arb = useApp((s) => s.sketchArb)
  const geos = useMemo(() => {
    if (!faces) return null
    // P3（#5/#10）：斜面（arb）区域点选 —— lift 走 arbFrame + 沿法向微抬 0.06；cardinal 走 SK[plane]。
    const arbFr = arb ? arbFrame(arb as { o: V3; xd: V3; n: V3 }) : null
    const nT: V3 = arb ? [arb.n[0], arb.n[2], -arb.n[1]] : [0, 0, 0]
    const lift: Lift = arbFr
      ? (p) => { const b = arbFr.lift(p); return [b[0] + 0.06 * nT[0], b[1] + 0.06 * nT[1], b[2] + 0.06 * nT[2]] }
      : (p) => SK[plane].lift(p, baseZ + 0.06)   // 微抬离草图面，raycast 先中填充唔中画图平面
    return faces.map((face) => {
      try {
        // P2v2：Fusion Profile 含孔（嵌套环+碟）— triangulateShape 索引入 [outer, ...holes] 扁平点集
        const tris = ShapeUtils.triangulateShape(
          face.outer.map((pt) => new Vector2(pt[0], pt[1])),
          face.holes.map((h) => h.map((pt) => new Vector2(pt[0], pt[1]))))
        const allPts = [...face.outer, ...face.holes.flat()]
        const pos: number[] = []
        for (const t of tris) for (const k of t) { const w = lift(allPts[k]); pos.push(w[0], w[1], w[2]) }
        if (!pos.length) return null
        const g = new BufferGeometry()
        g.setAttribute('position', new Float32BufferAttribute(pos, 3))
        g.computeVertexNormals()
        return g
      } catch { return null }
    })
  }, [faces, plane, baseZ, arb])
  if (!open || !faces || !geos) return null
  return (
    <group>
      {geos.map((g, i) => g && (
        <mesh key={'rgn' + i} geometry={g} renderOrder={996}
          onClick={(e) => { e.stopPropagation(); useApp.getState().toggleExtrudeRegion(i) }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' }}
          onPointerOut={() => { document.body.style.cursor = '' }}>
          <meshBasicMaterial color={sel[i] ? '#1572c4' : '#8a97a2'} transparent opacity={sel[i] ? 0.28 : 0.10} side={DoubleSide} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

export function ExtrudePreview() {
  const open = useApp((s) => s.extrudeDlgOpen)
  const shape = useApp((s) => s.sketchShape)
  const profiles = useApp((s) => s.sketchProfiles)
  const plane = useApp((s) => s.sketchPlane)
  const baseZ = useApp((s) => s.sketchBaseZ)
  const arb = useApp((s) => s.sketchArb)
  const h = useApp((s) => s.extrudeHeight)
  const symMeasure = useApp(s => s.symMeasure)
  const expressionInvalid = useApp(s => !!s.extrudeExpressionError || s.extrudeSelectionCleared)
  const flip = useApp((s) => s.extrudeFlip)
  const draft = useApp((s) => s.extrudeDraft)
  const extent = useApp((s) => s.extrudeExtent)
  const op = useApp((s) => s.sketchOp)
  const sketchFromFace = useApp((s) => s.sketchFromFace)   // GM-W1 1.4：面切鬼影镜像内核
  const faceOutSign = useApp((s) => s.faceOutSign)         // GM-W1 1.4：面法向沿 PLANE_N 的 ±号
  const faceCutThrough = useApp((s) => s.faceCutThrough)   // GM-W1 1.4：面切=贯通 / 按深度挖
  const rf = useApp((s) => s.extrudeRegionFaces)
  const rsel = useApp((s) => s.extrudeRegionSel)
  const side2 = useApp((s) => s.extrudeSide2)          // #5 twosides 鬼影反应式
  const tface = useApp((s) => s.extrudeToFaceOff)       // #5 toface 鬼影反应式
  const tfaceOff = useApp((s) => s.extrudeToFaceOffset)
  // GM-W7 7.6：全部推导（extent/方向数学【原样搬入】+ 拔模顶盖 + 侧壁/盖体网格）收埋一个 useMemo,
  // keyed on 同一组输入 → 高度/⇅/操作/extent/轮廓 一改即 live 重算;体网格用 useEffect dispose 免泄漏。
  // 钩子次序：所有 useApp 之后先 useMemo,再 early-return（React 规矩:钩子唔可以喺 return 之后）。
  const vol = useMemo(() => {
    if (!open || (['distance', 'symmetric', 'twosides'].includes(extent) && !(Math.abs(h) > 1e-6))) return null
    if (expressionInvalid) return null
    const all = [...profiles, ...(shape ? [shape] : [])] as SketchShape[]
    if (!all.length) return null
    // GM-W7 7.6 颜色语义（Fusion）：切除→红,求交→紫,新建/接合→蓝。
    const color = op === 'cut' ? '#ff5a4d' : op === 'intersect' ? '#c78ae0' : '#1572c4'
    const H = Math.max(0.1, Math.abs(h) || 1) * (extent === 'symmetric' && symMeasure === 'half' ? 2 : 1)
    const down = flip !== (h < 0)                 // ⇅ reverse / negative distance → preview the other way
    // P3（#5）：斜面（arb）鬼影 —— 草图喺 arb 平面上（z 基准 0），沿 arb 法向 ±H 挤出；lift = arbFrame.lift(p) + z·c2t(n)。
    const arbFr = arb ? arbFrame(arb as { o: V3; xd: V3; n: V3 }) : null
    const nThree: V3 = arb ? [arb.n[0], arb.n[2], -arb.n[1]] : [0, 0, 0]   // c2t(n)：arb 法向喺 three 空间
    const bz = arb ? 0 : baseZ
    // 用户实战 bug（XZ@104 基准面切圆柱「点都唔成功」）：内核挤出方向 = RES_SIGN[plane]·(down?−1:1)（store extrudeSketch
    // 同 cad.worker 一致,XZ=−1）,但鬼影 lift 直接 bz±H（XZ 上 = CAD +y）→ 同一 flip 状态【鬼影同内核反向】。用户跟鬼影
    // 撳 ⇅ 反而切去反方向 → 「切割没有接触到实体」。修法=鬼影镜像内核（改内核会烂旧档）。arb 沿 nThree 已随 down 正确,勿动。
    const RES = !arb && plane === 'XZ' ? -1 : 1
    let z0 = bz, z1 = bz + (down ? -H : H) * RES
    if (extent === 'symmetric') { z0 = bz - H / 2; z1 = bz + H / 2 }
    if (extent === 'twosides') { const s2 = Math.max(0.1, Math.abs(side2) || 0.1); z0 = bz - s2 * RES; z1 = bz + H * RES }  // #5：两侧鬼影 [baseZ−side2·RES, baseZ+side1·RES]（内核 side1 沿 RES 方向）
    if (extent === 'through') { z0 = bz - 150; z1 = bz + 150 }  // long span = "through all" indicator
    // #5：到面拉伸鬼影 —— 目标面已拾（extrudeToFaceOff 有值）→ 顶面拉到目标面 offset（cardinal 平面；arb 到面 v2）
    if (extent === 'toface' && !arb && tface != null) { z0 = baseZ; z1 = tface + (tfaceOff || 0) }
    // GM-W1 1.4：面草图「切除」鬼影必须镜像内核切除语义（cad.worker.ts inward/through 分支），否则面切鬼影
    // 指向内核实际切法的相反方向，令用户误撳「反向」切错边（WYSIWYG）。严格限定 op==='cut' && sketchFromFace
    // 且非 arb（datum 面已由 1.1 设 sketchFromFace=false；arb 斜面沿 nThree 已随 down 正确，勿动）。
    //   through 分支：useThrough = throughAll || (faceCut && faceThrough) → 长跨鬼影（方向/距离无关，同 extent==='through'）。
    //   inward  分支：sgn = (faceOutSign??1)*(down?-1:1)，跨度 [base+0.5*sgn, base−H*sgn]，逐字节对齐内核 a/b。
    if (op === 'cut' && sketchFromFace && !arb) {
      if (faceCutThrough || extent === 'through') { z0 = bz - 150; z1 = bz + 150 }
      else { const sgn = (faceOutSign ?? 1) * (down ? -1 : 1); z0 = bz + 0.5 * sgn; z1 = bz - H * sgn }
    }
    const liftAt = arbFr
      ? (p: Pt, z: number): V3 => { const b = arbFr.lift(p); return [b[0] + z * nThree[0], b[1] + z * nThree[1], b[2] + z * nThree[2]] }
      : (p: Pt, z: number): V3 => SK[plane].lift(p, z)
    const outline2D = (sh: SketchShape): Pt[] =>
      sh.type === 'rect' ? [sh.a, [sh.b[0], sh.a[1]], sh.b, [sh.a[0], sh.b[1]]]
        : sh.type === 'circle' ? Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * Math.PI * 2; return [sh.c[0] + sh.r * Math.cos(a), sh.c[1] + sh.r * Math.sin(a)] as Pt })
          : sh.pts
    const delta = extent === 'through' ? 0 : (z1 - z0) * Math.tan(((draft || 0) * Math.PI) / 180)
    // P2v2（用户实战 feedback #2）：区域点选活跃 → 鬼影只画拣中嘅 profile（Fusion：拣边个 preview 边个）；
    // 一个都未拣 → 冇鬼影（Fusion 未拣 profile 就冇 preview）。孔环都画埋（环 profile 鬼影见到内圈）。
    const bases: Pt[][] = rf
      ? rf.flatMap((f, i) => (rsel[i] ? [f.outer, ...f.holes] : []))
      : all.map(outline2D).filter((b) => b && b.length > 0)
    if (!bases.length) return null
    // GM-W7 7.6：拔模顶盖 —— 每环按自身 bbox 中心缩细（同下面线框 top2D 完全一致 → 体同线框对齐）。
    const basesTop: Pt[][] = bases.map((base) => {
      if (!draft) return base
      const xs = base.map((p) => p[0]), ys = base.map((p) => p[1])
      const w = (Math.max(...xs) - Math.min(...xs)) || 1, hh = (Math.max(...ys) - Math.min(...ys)) || 1
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
      const sx = Math.max(0.02, (w - 2 * delta) / w), sy = Math.max(0.02, (hh - 2 * delta) / hh)
      return base.map((p) => [cx + (p[0] - cx) * sx, cy + (p[1] - cy) * sy] as Pt)
    })
    const geom = buildExtrudeVolume(bases, basesTop, (p) => liftAt(p, z0), (p) => liftAt(p, z1))
    return { color, bases, basesTop, z0, z1, liftAt, geom }
  }, [symMeasure, expressionInvalid, open, profiles, shape, plane, baseZ, arb, h, flip, draft, extent, op, sketchFromFace, faceOutSign, faceCutThrough, rf, rsel, side2, tface, tfaceOff])
  useEffect(() => () => { vol?.geom?.dispose() }, [vol])
  if (!vol) return null
  const { color, bases, basesTop, z0, z1, liftAt, geom } = vol
  const els: ReactNode[] = []
  // GM-W7 7.6：半透明【实心体】—— 材质 transparent/opacity 0.3/depthWrite false/DoubleSide + polygonOffset 防同实体面 z-fight；
  // raycast 返 null → 唔截鼠标（点击直穿到实体）。
  if (geom) els.push(
    <mesh key="vol" geometry={geom} renderOrder={2} raycast={() => null}>
      {/* GM-W7 7.6：depthTest false → 半透明体【透过实体】睇到（Fusion x-ray 式,盲切埋见到),契合「浮喺实体之上」。 */}
      <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} depthTest={false} side={DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>)
  // 原线框鬼影（保留）：底环 + 顶环 + 若干斜连虚线。
  bases.forEach((base, i) => {
    const top2D = basesTop[i]
    els.push(<Line key={'eb' + i} points={[...base.map((p) => liftAt(p, z0)), liftAt(base[0], z0)]} color={color} lineWidth={1.6} />)
    els.push(<Line key={'et' + i} points={[...top2D.map((p) => liftAt(p, z1)), liftAt(top2D[0], z1)]} color={color} lineWidth={1.6} />)
    const step = Math.max(1, Math.floor(base.length / 8))
    for (let j = 0; j < base.length; j += step) els.push(<Line key={'ec' + i + '_' + j} points={[liftAt(base[j], z0), liftAt(top2D[j], z1)]} color={color} lineWidth={1} dashed dashSize={3} gapSize={2} />)
  })
  return <group>{els}</group>
}

// GM-W7 7.6：旋转（Revolve）半透明实体预览 —— 内核 revolve 系把 profile 嘅 2D [s,t] 直接摆喺 CAD XY 面(z=0)
// 再绕【世界轴】(默认 Y,或 X/Z/自定义方向 + 轴点) 转 angle°（profileToSketch 默认 plane='XY' → 独立于草图面）。
// 部分角加两端盖（三角化截面）→ 睇落系实心；整圈(360)系闭管无需盖。颜色语义同拉伸。
// GM-W8 A4.1：把已存 revolve 特征嘅 profile（shapeToProfile 后坐标）转返 2D 环 —— 编辑现有 revolve 时预览用。
function profileLoop2D(prof: { kind?: string; a?: Pt; b?: Pt; c?: Pt; r?: number; rx?: number; ry?: number; rot?: number; pts?: Pt[] } | null | undefined): Pt[] {
  if (!prof) return []
  if (prof.kind === 'rect' && prof.a && prof.b) { const [a0, a1] = prof.a, [b0, b1] = prof.b; return [[a0, a1], [b0, a1], [b0, b1], [a0, b1]] }
  if (prof.kind === 'circle' && prof.c && prof.r != null) { const o: Pt[] = []; for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; o.push([prof.c[0] + prof.r * Math.cos(a), prof.c[1] + prof.r * Math.sin(a)]) } return o }
  if (prof.kind === 'ellipse' && prof.c && prof.rx != null && prof.ry != null) { const angle = (prof.rot || 0) * Math.PI / 180, cr = Math.cos(angle), sr = Math.sin(angle), o: Pt[] = []; for (let i = 0; i < 64; i++) { const t = (i / 64) * Math.PI * 2, ex = prof.rx * Math.cos(t), ey = prof.ry * Math.sin(t); o.push([prof.c[0] + ex * cr - ey * sr, prof.c[1] + ex * sr + ey * cr]) } return o }
  return prof.pts ?? []
}

// GM-W8 A4.3：薄壳预览用 —— 逐顶点朝环质心径向内移 wall（clamp），得一条同心内环（圆截面=真同心；其余=近似内偏 hint）。
function shrinkLoopToward(loop: Pt[], wall: number): Pt[] | null {
  const n = loop.length; if (n < 3 || wall <= 0) return null
  let cx = 0, cy = 0; for (const p of loop) { cx += p[0]; cy += p[1] } cx /= n; cy /= n
  const out: Pt[] = []
  for (const p of loop) { const dx = p[0] - cx, dy = p[1] - cy, d = Math.hypot(dx, dy) || 1; const k = Math.max(0.04, (d - wall) / d); out.push([cx + dx * k, cy + dy * k]) }
  return out
}

// GM-W8 A4：把一条 2D 环绕【CAD 轴】(axO 过点、d 单位方向) 扫 ang° → 回转面（+部分角两端盖），append 入 positions/indices。
function latheLoop(loop: Pt[], axO: V3, d: V3, ang: number, sym: boolean, positions: number[], indices: number[], toCad: (point: Pt) => V3, flipSense = false) {
  const M = loop.length; if (M < 3) return
  // SO04: cut/intersect previews sweep −ang‥0 (into +Z for XY/+Y) so the ghost overlaps a
  // typical plate — matching the worker confirm path (rotate(−ang) before default sense).
  const N = 24, total = (ang * Math.PI) / 180, start = sym ? -total / 2 : (flipSense ? -total : 0)
  const rings: number[] = []
  for (let k = 0; k <= N; k++) {
    const th = start + total * (k / N), cos = Math.cos(th), sin = Math.sin(th)
    rings.push(positions.length / 3)
    for (const point of loop) { const r = c2tW(rotAxis(toCad(point), axO, d, cos, sin)); positions.push(r[0], r[1], r[2]) }
  }
  for (let k = 0; k < N; k++) for (let j = 0; j < M; j++) {
    const j2 = (j + 1) % M, a = rings[k] + j, b = rings[k] + j2, c = rings[k + 1] + j2, e = rings[k + 1] + j
    indices.push(a, b, c, a, c, e)
  }
  if (ang < 359.9) {   // 部分角 → 两端盖（逐环独立三角化,DoubleSide 唔理绕向）
    let faces: number[][] = []
    try { faces = ShapeUtils.triangulateShape(loop.map((q) => new Vector2(q[0], q[1])), []) } catch { faces = [] }
    for (const f of faces) indices.push(rings[0] + f[0], rings[0] + f[2], rings[0] + f[1])
    for (const f of faces) indices.push(rings[N] + f[0], rings[N] + f[1], rings[N] + f[2])
  }
}

// GM-3DV1 S16：由 revolve featDlg 参数解出旋转轴（CAD 空间：轴上一点 axO + 单位方向 d）。
// 抽自 RevolvePreview 轴解析（逐字节同逻辑）→ RevolveAngleHandle 同 preview 共用，令手柄必贴住预览弧。
type _CAxLike = { dir: 'X' | 'Y' | 'Z'; dirV?: V3; at: V3 }
function resolveRevolveAxis(p: Record<string, number | string>, caxes: _CAxLike[], defaultOrigin: V3): { axO: V3; d: V3 } | null {
  const axStr = String(p.axis ?? 'Y')
  const ovV: V3 = [+p.dx || 0, +p.dy || 0, +p.dz || 0], ovO: V3 = [+p.ox || 0, +p.oy || 0, +p.oz || 0]
  const dirDefault = ovV[0] === 0 && ovV[1] === 1 && ovV[2] === 0
  const orgDefault = ovO[0] === 0 && ovO[1] === 0 && ovO[2] === 0
  const LV: Record<string, V3> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }
  let axV: V3 = LV.Y, axO: V3 = p.axisReference === 'world' || axStr === 'Z' ? [0,0,0] : defaultOrigin
  if (!dirDefault || !orgDefault) {
    axV = ovV; axO = ovO
    if (dirDefault) { if (axStr === 'X' || axStr === 'Z') axV = LV[axStr]; else if (axStr.startsWith('A')) { const ca = caxes[Number(axStr.slice(1))]; if (ca) axV = ca.dirV ?? LV[ca.dir] } }
  } else if (axStr === 'Z') axV = LV.Z
  else if (axStr.startsWith('A')) { const ca = caxes[Number(axStr.slice(1))]; if (ca) { axV = ca.dirV ?? LV[ca.dir]; axO = ca.at } }
  else if (axStr === 'X') axV = LV.X
  const al = Math.hypot(axV[0], axV[1], axV[2])
  if (al < 1e-9) return null
  return { axO, d: [axV[0] / al, axV[1] / al, axV[2] / al] }
}
// GM-3DV1 S16：取 revolve 主截面外环（2D sketch 坐标）—— 抽自 RevolvePreview（新建走 bundle 尾件、编辑走 editId profile）。
// 主环 = 最后一个非构造闭合轮廓（内核实际旋转嗰个）。空心靠 wall（A4.3），此处只取外环。
function revolveOuterLoop(featDlg: { payload?: unknown; editId?: string }, features: { id: string; type?: string; profile?: unknown }[]): Pt[] | null {
  const pay = featDlg.payload as { bundle?: { shapes: SketchShape[] } } | undefined
  const shapes = pay && typeof pay === 'object' && pay.bundle && Array.isArray(pay.bundle.shapes) ? pay.bundle.shapes : null
  if (shapes && shapes.length) {
    let primary: SketchShape | null = null
    for (let i = shapes.length - 1; i >= 0; i--) { const s = shapes[i]; if (!s.construction && !(s.type === 'poly' && s.open)) { primary = s; break } }
    if (!primary) return null
    const outer = shapeLoop2D(primary)
    return outer.length >= 3 ? outer : null
  }
  const editId = featDlg.editId
  const feat = editId ? features.find((f) => f.id === editId) : undefined
  if (!feat || feat.type !== 'revolve' || !feat.profile) return null
  const l = profileLoop2D(feat.profile as Parameters<typeof profileLoop2D>[0])
  return l.length >= 3 ? l : null
}

function revolvePreviewContext(dlg: {payload?: unknown; editId?: string}, features: {id:string}[], axisDir?: [number, number, number]) {
  const bundle=(dlg.payload as {bundle?: RevolveFrameSource} | undefined)?.bundle
  const source:RevolveFrameSource=bundle ?? (features.find(f=>f.id===dlg.editId) as RevolveFrameSource | undefined) ?? {}
  // BUG-SO16-001: pass axis so XZ·Y (etc.) remaps to a lathe plane with axial extent — preview must match confirm.
  return { origin:revolveFrame(source, axisDir).o, toCad:(p:Pt)=>revolvePointToCad(p,source,!!bundle, axisDir) }
}

export function RevolvePreview() {
  const featDlg = useApp((s) => s.featDlg)
  const caxes = useApp((s) => s.caxes)
  const features = useApp((s) => s.features)   // GM-W8 A4.1：编辑现有 revolve 时由 editId 取回 profile
  const vol = useMemo(() => {
    if (!featDlg || featDlg.kind !== 'revolve') return null
    const p = featDlg.params as Record<string, number | string>
    // ── 截面环（loops2D）：外环由共用 revolveOuterLoop 取（bundle 尾件 / editId profile）。──
    const outer = revolveOuterLoop(featDlg as { payload?: unknown; editId?: string }, features as { id: string; type?: string; profile?: unknown }[])
    if (!outer) return null
    const loops2D: Pt[][] = [outer]
    // GM-W8 A4.3：薄壁（wall>0）→ 逐环加一条同心内环 → 渲染 外+内 两面读作薄壳（近似内偏）。
    const wall = Math.abs(+p.wall || 0)
    if (wall > 0) { const inner: Pt[][] = []; for (const L of loops2D) { const o = shrinkLoopToward(L, wall); if (o) inner.push(o) } loops2D.push(...inner) }
    const op = String(p.op || 'new')
    const color = op === 'cut' ? '#ff5a4d' : op === 'intersect' ? '#c78ae0' : '#1572c4'
    let ang = Math.abs(+p.angle || 360); if (!(ang > 0)) ang = 360; ang = Math.min(360, ang)
    const sym = !!p.sym && ang > 0 && ang < 360
    // 轴方向/轴点（CAD）：共用 resolveRevolveAxis（同 RevolveAngleHandle）。
    // Resolve axis against authored origin first, then rebuild the lathe frame with that axis
    // so XZ·Y remaps before toCad (BUG-SO16-001 preview/confirm parity).
    const authored = revolvePreviewContext(featDlg, features)
    const axis = resolveRevolveAxis(p, caxes as unknown as _CAxLike[], authored.origin)
    if (!axis) return null
    const { axO, d } = axis
    const frame = revolvePreviewContext(featDlg, features, d)
    const positions: number[] = [], indices: number[] = []
    const flipSense = (op === 'cut' || op === 'intersect') && !sym && ang < 359.9
    for (const loop of loops2D) latheLoop(loop, axO, d, ang, sym, positions, indices, frame.toCad, flipSense)
    if (!indices.length) return null
    const geom = new BufferGeometry()
    geom.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geom.setIndex(indices)
    return { geom, color }
  }, [featDlg, caxes, features])
  useEffect(() => () => { vol?.geom?.dispose() }, [vol])
  if (!vol) return null
  return (
    <mesh geometry={vol.geom} renderOrder={2} raycast={() => null}>
      <meshBasicMaterial color={vol.color} transparent opacity={0.3} depthWrite={false} depthTest={false} side={DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
  )
}

// ═══════════════ GM-3DV1 S16：画布拖拽手柄共用件（泛化自 ExtrudeArrow）═══════════════
// ExtrudeArrow 本体【保持原样】（RES 符号 / 拖过零 / extrudeTipFrame）—— 呢个系佢嘅通用版，接落其它 featDlg 距离/角度字段。
// 拖拽数学同 ExtrudeArrow 一致：锁 OrbitControls → 起点捕捉屏幕轴 → 近正视退化回落 mmPerPx → 屏幕 px 投影落轴得 Δmm。
// unitPerMm = 沿 dir 每 1mm（世界）对应嘅【值】增量（如角度 deg/mm = (180/π)/半径）。isOpen() 每次 move 检查父对话框仲开唔开。
// round/clamp 由 setValue 侧决定（角度钳 1..360 等）。
function DragValueHandle({ tip, dir, color, getValue, setValue, unitPerMm, isOpen, cursor = 'grab' }: {
  tip: Vector3; dir: Vector3; color: string
  getValue: () => number; setValue: (v: number) => void
  unitPerMm: number; isOpen: () => boolean; cursor?: string
}) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as unknown as { enabled?: boolean } | null
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])
  const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir)
  const conePos = tip.clone().add(dir.clone().multiplyScalar(9))
  const begin = (e: { stopPropagation: () => void; button?: number; nativeEvent?: PointerEvent }) => {
    if ((e.button ?? 0) !== 0) return
    e.stopPropagation()
    const ev0 = (e.nativeEvent ?? e) as PointerEvent
    const rect = gl.domElement.getBoundingClientRect()
    const toPx = (w: Vector3): [number, number] => { const v = w.clone().project(camera); return [(v.x * 0.5 + 0.5) * rect.width, (-v.y * 0.5 + 0.5) * rect.height] }
    const a0 = toPx(tip), a1 = toPx(tip.clone().add(dir))
    const ux = a1[0] - a0[0], uy = a1[1] - a0[1]
    const L2 = ux * ux + uy * uy
    const cam = camera as unknown as { fov?: number; position: Vector3 }
    const mmPerPx = (2 * cam.position.distanceTo(tip) * Math.tan(((cam.fov || 28) * Math.PI / 180) / 2)) / rect.height
    const useAxis = L2 >= 1 / (16 * mmPerPx * mmPerPx)
    const v0 = getValue()
    const sx = ev0.clientX, sy = ev0.clientY
    if (controls) controls.enabled = false
    const fin = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', fin); window.removeEventListener('pointercancel', fin)
      if (controls) controls.enabled = true
      gl.domElement.style.cursor = ''
      cleanup.current = null
    }
    const mv = (ev: PointerEvent) => {
      if (!isOpen()) { fin(); return }
      const dmm = useAxis
        ? ((ev.clientX - sx) * ux + (ev.clientY - sy) * uy) / L2
        : (sy - ev.clientY) * mmPerPx
      setValue(v0 + unitPerMm * dmm)
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', fin)
    window.addEventListener('pointercancel', fin)
    cleanup.current = fin
    gl.domElement.style.cursor = 'grabbing'
  }
  return (
    <group renderOrder={50}>
      <Line points={[[tip.x, tip.y, tip.z], [conePos.x, conePos.y, conePos.z]]} color={color} lineWidth={2.5} depthTest={false} />
      <mesh
        position={conePos} quaternion={quat}
        onPointerDown={begin}
        onPointerOver={() => { gl.domElement.style.cursor = cursor }}
        onPointerOut={() => { if (!cleanup.current) gl.domElement.style.cursor = '' }}
      >
        <coneGeometry args={[5, 14, 16]} />
        <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
      </mesh>
    </group>
  )
}

// GM-3DV1 S16 证明接线：revolve 角度画布手柄 —— 抓手坐喺预览弧【前缘】外缘点，沿弧切向拖 → 改 featDlg 角度（钳 1..360）。
// 对话框「角度」栏系浮动数值框，拖即实时反映（同 ExtrudeArrow 之于 exH tip 文本框）。DragValueHandle 泛化自 ExtrudeArrow，本体不动。
export function RevolveAngleHandle() {
  const featDlg = useApp((s) => s.featDlg)
  const caxes = useApp((s) => s.caxes)
  const features = useApp((s) => s.features)
  const data = useMemo(() => {
    if (!featDlg || featDlg.kind !== 'revolve') return null
    const p = featDlg.params as Record<string, number | string>
    const authored = revolvePreviewContext(featDlg, features)
    const axis = resolveRevolveAxis(p, caxes as unknown as _CAxLike[], authored.origin); if (!axis) return null
    const { axO, d } = axis
    const frame = revolvePreviewContext(featDlg, features, d)
    const outer = revolveOuterLoop(featDlg as { payload?: unknown; editId?: string }, features as { id: string; type?: string; profile?: unknown }[]); if (!outer) return null
    let ang = Math.abs(+p.angle || 360); if (!(ang > 0)) ang = 360; ang = Math.min(360, ang)
    const total = (ang * Math.PI) / 180, sym = !!p.sym && ang > 0 && ang < 360
    const op = String(p.op || 'new')
    const flipSense = (op === 'cut' || op === 'intersect') && !sym && ang < 359.9
    const lead = (sym ? -total / 2 : (flipSense ? -total : 0)) + total   // 前缘角（同 latheLoop k=N）
    // 抓手 2D 点 = 距轴线最远嘅外环顶点（半径最大，手柄最稳、最易拃）
    const perp = (q: Pt): number => { const cad = frame.toCad(q); const rx = cad[0] - axO[0], ry = cad[1] - axO[1], rz = cad[2] - axO[2]; const dot = rx * d[0] + ry * d[1] + rz * d[2]; return Math.hypot(rx - d[0] * dot, ry - d[1] * dot, rz - d[2] * dot) }
    let pg: Pt = outer[0], best = -1
    for (const q of outer) { const r = perp(q); if (r > best) { best = r; pg = q } }
    if (best < 0.5) return null   // 半径太细 → 手柄贴住轴，无意义
    const cs = Math.cos(lead), sn = Math.sin(lead)
    const gCad = rotAxis(frame.toCad(pg), axO, d, cs, sn)
    // 切向（CAD）= d × (g − axO)（θ 增大方向）
    const rvx = gCad[0] - axO[0], rvy = gCad[1] - axO[1], rvz = gCad[2] - axO[2]
    let tx = d[1] * rvz - d[2] * rvy, ty = d[2] * rvx - d[0] * rvz, tz = d[0] * rvy - d[1] * rvx
    const tl = Math.hypot(tx, ty, tz); if (tl < 1e-6) return null
    tx /= tl; ty /= tl; tz /= tl
    const tipT = c2tW(gCad), dirT = c2tW([tx, ty, tz])
    return {
      tip: new Vector3(tipT[0], tipT[1], tipT[2]),
      dir: new Vector3(dirT[0], dirT[1], dirT[2]).normalize(),
      degPerMm: (180 / Math.PI) / Math.max(1e-3, best),
      color: op === 'cut' ? '#ff5a4d' : op === 'intersect' ? '#c78ae0' : '#1572c4',
    }
  }, [featDlg, caxes, features])
  if (!data) return null
  return <DragValueHandle
    tip={data.tip} dir={data.dir} color={data.color}
    unitPerMm={data.degPerMm}
    getValue={() => Number((useApp.getState().featDlg?.params as Record<string, number | string> | undefined)?.angle) || 360}
    setValue={(v) => { const nv = Math.max(1, Math.min(360, Math.round(v))); useApp.getState().setFeatParam('angle', nv) }}
    isOpen={() => useApp.getState().featDlg?.kind === 'revolve'}
  />
}

// ═══════════════ GM-W8 A1：为原本无实体预览嘅命令补半透明鬼影（材质/颜色沿 7.6：切#ff5a4d / 交#c78ae0 / 新#1572c4，opacity 0.3、depthWrite false、DoubleSide、raycast null）═══════════════

// A1.1 孔：拾中孔心（holePos，three 坐标）→ 沿面法向画红色切除圆柱（Ø×深）。沉头=叠一段大圆柱；埋头=锥台。
export function HolePreview() {
  const holeMode = useApp((s) => s.holeMode)
  const holePos = useApp((s) => s.holePos)
  const holeDir = useApp((s) => s.holeDir)
  const holeD = useApp((s) => s.holeD)
  const holeDepth = useApp((s) => s.holeDepth)
  const holeThrough = useApp((s) => s.holeThrough)
  const holeType = useApp((s) => s.holeType)
  const holeCbD = useApp((s) => s.holeCbD)
  const holeCbDepth = useApp((s) => s.holeCbDepth)
  const cfg = useMemo(() => {
    // BUG-SO18F-001: illegal Ø≤0 must not keep a stale preview from the prior legal diameter.
    if (!holeMode || !holePos || !(holeD > 0)) return null
    // 钻入方向（three）：斜面法向 holeDir(CAD)→three 取负（钻入体内）；否则默认沿 −CAD z（顶面朝下）。
    let drill: V3 = [0, -1, 0]
    if (holeDir) { const nT: V3 = [holeDir[0], holeDir[2], -holeDir[1]]; const l = Math.hypot(nT[0], nT[1], nT[2]) || 1; drill = [-nT[0] / l, -nT[1] / l, -nT[2] / l] }
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(drill[0], drill[1], drill[2]))
    const r = holeD / 2
    const len = holeThrough ? 400 : Math.max(2, holeDepth > 0 ? holeDepth : holeD * 1.5)
    const cbR = Math.max(r + 0.5, holeCbD != null ? holeCbD / 2 : holeD * 0.9)   // 无自定义值 → 比例 ≈1.8·D（screwSpec 缺省口径）
    const cbDep = Math.max(0.5, holeCbDepth != null ? holeCbDepth : holeD * 0.9)
    return { q: [q.x, q.y, q.z, q.w] as [number, number, number, number], r, len, cbR, cbDep, type: holeType }
  }, [holeMode, holePos, holeDir, holeD, holeDepth, holeThrough, holeType, holeCbD, holeCbDepth])
  if (!cfg || !holePos) return null
  const RED = '#ff5a4d'
  return (
    <group position={holePos} quaternion={cfg.q}>
      <mesh position={[0, cfg.len / 2, 0]} renderOrder={2} raycast={() => null}>
        <cylinderGeometry args={[cfg.r, cfg.r, cfg.len, 24]} />
        <meshBasicMaterial color={RED} transparent opacity={0.3} depthWrite={false} depthTest={false} side={DoubleSide} />
      </mesh>
      {cfg.type === 'counterbore' && (
        <mesh position={[0, cfg.cbDep / 2, 0]} renderOrder={2} raycast={() => null}>
          <cylinderGeometry args={[cfg.cbR, cfg.cbR, cfg.cbDep, 24]} />
          <meshBasicMaterial color={RED} transparent opacity={0.3} depthWrite={false} depthTest={false} side={DoubleSide} />
        </mesh>
      )}
      {cfg.type === 'countersink' && (
        <mesh position={[0, cfg.cbDep / 2, 0]} renderOrder={2} raycast={() => null}>
          <cylinderGeometry args={[cfg.r, cfg.cbR, cfg.cbDep, 24]} />
          <meshBasicMaterial color={RED} transparent opacity={0.3} depthWrite={false} depthTest={false} side={DoubleSide} />
        </mesh>
      )}
    </group>
  )
}

// A1 共用：由三角汤（flat positions，每三角 9 float，CAD 坐标）+ 偏移向量 → 板体（基盖 + 偏移盖 + 边界侧壁）。
function trisNormal(tris: ArrayLike<number>): V3 {
  let nx = 0, ny = 0, nz = 0
  const nt = Math.floor(tris.length / 9)
  for (let t = 0; t < nt; t++) {
    const o = t * 9
    const ax = tris[o], ay = tris[o + 1], az = tris[o + 2], bx = tris[o + 3], by = tris[o + 4], bz = tris[o + 5], cx = tris[o + 6], cy = tris[o + 7], cz = tris[o + 8]
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az
    nx += uy * vz - uz * vy; ny += uz * vx - ux * vz; nz += ux * vy - uy * vx
  }
  const l = Math.hypot(nx, ny, nz) || 1
  return [nx / l, ny / l, nz / l]
}
function buildSlabGeom(tris: ArrayLike<number>, off: V3): BufferGeometry | null {
  const nt = Math.floor(tris.length / 9); if (!nt) return null
  const vmap = new Map<string, number>()
  const base: number[] = [], tri: number[] = []
  const idxOf = (x: number, y: number, z: number) => { const k = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`; let i = vmap.get(k); if (i === undefined) { i = base.length / 3; base.push(x, y, z); vmap.set(k, i) } return i }
  for (let t = 0; t < nt; t++) { const o = t * 9; tri.push(idxOf(tris[o], tris[o + 1], tris[o + 2]), idxOf(tris[o + 3], tris[o + 4], tris[o + 5]), idxOf(tris[o + 6], tris[o + 7], tris[o + 8])) }
  const nv = base.length / 3
  const ek = (a: number, b: number) => a < b ? `${a}_${b}` : `${b}_${a}`
  const ec = new Map<string, number>()
  for (let i = 0; i < tri.length; i += 3) { const a = tri[i], b = tri[i + 1], c = tri[i + 2]; for (const [u, v] of [[a, b], [b, c], [c, a]] as [number, number][]) ec.set(ek(u, v), (ec.get(ek(u, v)) || 0) + 1) }
  const positions: number[] = [], indices: number[] = []
  for (let i = 0; i < nv; i++) positions.push(base[i * 3], base[i * 3 + 1], base[i * 3 + 2])
  for (let i = 0; i < nv; i++) positions.push(base[i * 3] + off[0], base[i * 3 + 1] + off[1], base[i * 3 + 2] + off[2])
  for (let i = 0; i < tri.length; i += 3) { const a = tri[i], b = tri[i + 1], c = tri[i + 2]; indices.push(a, b, c); indices.push(nv + a, nv + c, nv + b) }   // 偏移盖反绕
  for (let i = 0; i < tri.length; i += 3) { const a = tri[i], b = tri[i + 1], c = tri[i + 2]; for (const [u, v] of [[a, b], [b, c], [c, a]] as [number, number][]) if ((ec.get(ek(u, v)) || 0) === 1) indices.push(u, v, nv + v, u, nv + v, nv + u) }
  if (!indices.length) return null
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(positions, 3)); g.setIndex(indices); return g
}

// A1.3 加厚 + A1.4 按拉：hover 中嘅面（hoverFace，CAD 三角）沿面法向偏移出板体鬼影。
//   加厚：厚度用 prompt 缺省 2mm（真值系点击后先 prompt，pre-click 未知）→ 蓝。
//   按拉：偏移 = 实时 pushPullDist，正=拉出蓝 / 负=压入红；只喺未拾面（picks=0）时用 hover 鬼影（拾面后交 PushPullArrow 箱体接手）。
export function FaceOffsetGhost() {
  const thicken = useApp((s) => s.thickenMode)
  const pushpull = useApp((s) => s.pushPullMode)
  const ppPicks = useApp((s) => s.pushPullPicks.length)
  const ppDist = useApp((s) => s.pushPullDist)
  const hoverFace = useApp((s) => s.hoverFace)
  // GM-B2 移动面 offset 模式：拾面前 hover 显示偏移板体 ghost（倾斜模式无廉价 ghost → 跳过预览，诚实）。
  const moveFace = useApp((s) => s.moveFaceMode)
  const moveFaceKind = useApp((s) => s.moveFaceKind)
  const moveFaceHasPick = useApp((s) => !!s.moveFacePick)
  const moveFaceDist = useApp((s) => s.moveFaceDist)
  const data = useMemo(() => {
    if (!hoverFace || hoverFace.length < 9) return null
    const mfActive = moveFace && moveFaceKind === 'offset' && !moveFaceHasPick   // GM-B2：仅 offset 模式、未拾面时预览
    if (!(thicken || (pushpull && ppPicks === 0) || mfActive)) return null
    const dist = thicken ? 2 : mfActive ? moveFaceDist : ppDist
    if (Math.abs(dist) < 1e-4) return null
    const n = trisNormal(hoverFace)
    const off: V3 = [n[0] * dist, n[1] * dist, n[2] * dist]
    const geom = buildSlabGeom(hoverFace, off)
    if (!geom) return null
    return { geom, color: dist < 0 ? '#ff5a4d' : '#1572c4' }
  }, [hoverFace, thicken, pushpull, ppPicks, ppDist, moveFace, moveFaceKind, moveFaceHasPick, moveFaceDist])
  useEffect(() => () => { data?.geom?.dispose() }, [data])
  if (!data) return null
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={data.geom} renderOrder={2} raycast={() => null}>
        <meshBasicMaterial color={data.color} transparent opacity={0.3} depthWrite={false} depthTest={false} side={DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
    </group>
  )
}

// A1.6 移动/缩放：当前 bodyMesh 依对话框 live 值变换后嘅蓝色鬼影（原体照旧显示 → 睇到 before/after）。
//   移动：绕体心 Rx·Ry·Rz + 平移 dx/dy/dz（镜 cad.worker transform 语义）；缩放：绕基准点 px/py/pz 缩 factor 或 sx/sy/sz。
export function MoveScaleGhost() {
  const featDlg = useApp((s) => s.featDlg)
  const bodyMesh = useApp((s) => s.bodyMesh)
  const geom = useMemo(() => {
    if (!featDlg || (featDlg.kind !== 'move' && featDlg.kind !== 'scale')) return null
    if (!bodyMesh || !bodyMesh.vertices?.length) return null
    const p = featDlg.params as Record<string, number | string>
    const v = bodyMesh.vertices
    let xn = 1e9, xp = -1e9, yn = 1e9, yp = -1e9, zn = 1e9, zp = -1e9
    for (let i = 0; i + 2 < v.length; i += 3) { const x = v[i], y = v[i + 1], z = v[i + 2]; if (x < xn) xn = x; if (x > xp) xp = x; if (y < yn) yn = y; if (y > yp) yp = y; if (z < zn) zn = z; if (z > zp) zp = z }
    const cx = (xn + xp) / 2, cy = (yn + yp) / 2, cz = (zn + zp) / 2
    const M = new Matrix4()
    if (featDlg.kind === 'move') {
      // Rotate and point modes derive their transform from different parameter fields.  Reuse the
      // commit solver here so typed values, triad dragging and preview cannot diverge.
      const solved = solveMove(p)
      const dx = solved.dx, dy = solved.dy, dz = solved.dz
      const rx = solved.rx * Math.PI / 180, ry = solved.ry * Math.PI / 180, rz = solved.rz * Math.PI / 180
      M.makeTranslation(-cx, -cy, -cz)
      if (rx) M.premultiply(new Matrix4().makeRotationX(rx))
      if (ry) M.premultiply(new Matrix4().makeRotationY(ry))
      if (rz) M.premultiply(new Matrix4().makeRotationZ(rz))
      M.premultiply(new Matrix4().makeTranslation(cx, cy, cz))
      M.premultiply(new Matrix4().makeTranslation(dx, dy, dz))
    } else {
      const sx = +p.sx || 0, sy = +p.sy || 0, sz = +p.sz || 0, factor = +p.factor || 1
      const px = +p.px || 0, py = +p.py || 0, pz = +p.pz || 0
      let Sx = factor, Sy = factor, Sz = factor
      if ((sx > 0 || sy > 0 || sz > 0) && !(sx === sy && sy === sz && sx > 0)) { Sx = sx > 0 ? sx : 1; Sy = sy > 0 ? sy : 1; Sz = sz > 0 ? sz : 1 }
      else if (sx > 0 && sx === sy && sy === sz) { Sx = Sy = Sz = sx }
      M.makeTranslation(-px, -py, -pz)
      M.premultiply(new Matrix4().makeScale(Sx, Sy, Sz))
      M.premultiply(new Matrix4().makeTranslation(px, py, pz))
    }
    const pos = new Float32Array(v.length), tmp = new Vector3()
    for (let i = 0; i + 2 < v.length; i += 3) { tmp.set(v[i], v[i + 1], v[i + 2]).applyMatrix4(M); pos[i] = tmp.x; pos[i + 1] = tmp.y; pos[i + 2] = tmp.z }
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setIndex(Array.from(bodyMesh.triangles as ArrayLike<number>)); g.computeVertexNormals(); return g
  }, [featDlg, bodyMesh])
  useEffect(() => () => { geom?.dispose() }, [geom])
  if (!geom) return null
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={geom} renderOrder={2} raycast={() => null}>
        <meshBasicMaterial color="#1572c4" transparent opacity={0.25} depthWrite={false} side={DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
    </group>
  )
}

// A1.7 螺旋（Coil）：对话框 d/pitch/h/wire → 沿 CAD z 生成螺旋线，TubeGeometry（线径 wire/2）→ 蓝色鬼影（喺原点起）。
export function CoilPreview() {
  const featDlg = useApp((s) => s.featDlg)
  const geom = useMemo(() => {
    if (!featDlg || featDlg.kind !== 'coil') return null
    const p = featDlg.params as Record<string, number | string>
    const r = Math.max(0.5, (+p.d || 60) / 2), pitch = Math.max(0.3, +p.pitch || 12), H = Math.max(pitch, +p.h || 80), wireR = Math.max(0.2, (+p.wire || 10) / 2)
    const turns = H / pitch, seg = Math.min(2000, Math.max(24, Math.ceil(turns * 24)))
    const pts: Vector3[] = []
    for (let k = 0; k <= seg; k++) { const t = k / seg, th = 2 * Math.PI * turns * t; pts.push(new Vector3(r * Math.cos(th), H * t, -(r * Math.sin(th)))) }   // CAD(x,y,z)→three(x,z,−y)
    if (pts.length < 2) return null
    return new TubeGeometry(new CatmullRomCurve3(pts), seg, wireR, 10, false)
  }, [featDlg])
  useEffect(() => () => { geom?.dispose() }, [geom])
  if (!geom) return null
  return (
    <mesh geometry={geom} renderOrder={2} raycast={() => null}>
      <meshBasicMaterial color="#1572c4" transparent opacity={0.3} depthWrite={false} depthTest={false} side={DoubleSide} />
    </mesh>
  )
}

// A1.7 扫掠/管（Sweep/Pipe = 沿路径扫掠对话框，pipe 即 wall>0 空心管）：沿绘制路径（polyPts / poly sketchShape，lift 到 3D）
//   套 TubeGeometry（半径 sweepDia/2）→ 鬼影。诚实局部：只覆盖圆截面；忽略 爬升/扭转/末端缩放/草图轮廓截面/构造轴脊线（见汇报）。
export function SweepPreview() {
  const open = useApp((s) => s.sweepDlgOpen)
  const section = useApp((s) => s.sweepSection)
  const dia = useApp((s) => s.sweepDia)
  const op = useApp((s) => s.sketchOp)
  const polyPts = useApp((s) => s.polyPts)
  const sketchShape = useApp((s) => s.sketchShape)
  const plane = useApp((s) => s.sketchPlane)
  const baseZ = useApp((s) => s.sketchBaseZ)
  const arb = useApp((s) => s.sketchArb)
  const geom = useMemo(() => {
    if (!open || section !== 'circle') return null
    const path2d: Pt[] = polyPts.length >= 2 ? polyPts : (sketchShape && sketchShape.type === 'poly' && sketchShape.pts.length >= 2 ? sketchShape.pts : [])
    if (path2d.length < 2) return null
    const fr = arb ? arbFrame(arb as { o: V3; xd: V3; n: V3 }).lift : null
    const lift: Lift = fr ?? ((q) => SK[plane].lift(q, baseZ))
    const clean: Vector3[] = []
    for (const q of path2d) { const w = lift(q); const vv = new Vector3(w[0], w[1], w[2]); if (!clean.length || clean[clean.length - 1].distanceTo(vv) > 1e-4) clean.push(vv) }
    if (clean.length < 2) return null
    const r = Math.max(0.3, (dia || 12) / 2), seg = Math.min(400, Math.max(16, clean.length * 8))
    return new TubeGeometry(new CatmullRomCurve3(clean), seg, r, 12, false)
  }, [open, section, dia, polyPts, sketchShape, plane, baseZ, arb])
  useEffect(() => () => { geom?.dispose() }, [geom])
  if (!geom) return null
  const color = op === 'cut' ? '#ff5a4d' : op === 'intersect' ? '#c78ae0' : '#1572c4'
  return (
    <mesh geometry={geom} renderOrder={2} raycast={() => null}>
      <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} depthTest={false} side={DoubleSide} />
    </mesh>
  )
}

// T764（S42）→ GM-X3 #2/#3：多张 Canvas 描摹底图（相片贴任意平面/斜面，四角经 lift 计）。
// 每张带自己的 planeRef（plane/baseZ/arb）+ 逐张字段（displayThrough/selectable/renderable/scaleX-Y/zAngle/flipH-V）。
// 草图模式全部可见（描摹）；建模模式仅 renderable≠false 的显示（Fusion 附着底图长驻）。
function CanvasQuad({ c, sketchMode }: { c: CanvasItem; sketchMode: boolean }) {
  const [tex, setTex] = useState<Texture | null>(null)
  const [aspect, setAspect] = useState(1)
  useEffect(() => {
    if (!c.url) { setTex(null); return }
    let alive = true
    new TextureLoader().load(c.url, (t) => { if (!alive) { t.dispose(); return } t.colorSpace = SRGBColorSpace; setAspect((t.image as HTMLImageElement).width / Math.max(1, (t.image as HTMLImageElement).height)); setTex(t) })
    return () => { alive = false }
  }, [c.url])
  useEffect(() => () => { tex?.dispose() }, [tex])
  const geom = useMemo(() => {
    if (!tex) return null
    const fr = c.arb ? arbFrame(c.arb as { o: V3; xd: V3; n: V3 }) : null
    const lift: Lift = fr ? fr.lift : (p) => SK[c.plane as Plane].lift(p, c.baseZ)
    const cs = canvasQuad(c, aspect) as Pt[]   // 非等比 scaleX/Y + 绕中心 zAngle
    const v = cs.map(lift)
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(v.flatMap((q) => [q[0], q[1], q[2]]), 3))
    g.setAttribute('uv', new Float32BufferAttribute(canvasUV(c.flipH, c.flipV), 2))   // flipH/V 翻转
    g.setIndex([0, 1, 2, 0, 2, 3])
    g.computeVertexNormals()
    return g
  }, [tex, aspect, c])
  useEffect(() => () => { geom?.dispose() }, [geom])
  const visible = sketchMode || c.renderable === true   // 草图模式全显（描摹）；建模模式仅 renderable=true（旧快速描摹仍仅草图见，零回归）
  if (!tex || !geom || !visible) return null
  const dt = !!c.displayThrough   // 穿透显示：关深度测试 + 画喺几何前
  return (
    <mesh geometry={geom} renderOrder={dt ? 6 : -5} raycast={c.selectable ? undefined : () => null}>
      <meshBasicMaterial map={tex} transparent opacity={c.opacity} depthWrite={false} depthTest={!dt} side={2} polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} />
    </mesh>
  )
}
export function CanvasImageLayer() {
  const canvases = useApp((s) => s.canvases)
  const mode = useApp((s) => s.mode)
  if (!canvases.length) return null
  const sketchMode = mode === 'sketch'
  return <>{canvases.map((c) => <CanvasQuad key={c.id} c={c} sketchMode={sketchMode} />)}</>
}

// T746 批2（GAP7）：committed 草图喺模型模式可见 — Fusion 式「草图完成后唔使消失」。
// 渲染 sketchSources 里 visible=true 嘅 entry（browser tree 眼仔开关），紫色细线 / 构造虚线。
// v1.35: large sources (≥ SKETCH_BATCH_THRESHOLD) merge into ≤2 LineSegments to avoid Chrome OOM.
function BatchedSketchLines({ positions, color, opacity = 1 }: { positions: Float32Array; color: string; opacity?: number }) {
  const geo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(positions, 3))
    return g
  }, [positions])
  useEffect(() => () => { geo.dispose() }, [geo])
  if (!positions.length) return null
  return (
    <lineSegments geometry={geo} frustumCulled={false}>
      <lineBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} depthWrite={false} />
    </lineSegments>
  )
}

export function CommittedSketches() {
  const srcs = useApp((s) => s.sketchSources)
  const mode = useApp((s) => s.mode)
  const showSketches = useApp((s) => s.objectVis.sketches)   // GM-X2 #8：全部草图主开关
  const selSketch = useApp((s) => s.selSketch)   // T756：选中嘅独立草图 — 高亮提示「下一步拉伸/旋转食佢」
  const els = useMemo(() => {
    if (mode === 'sketch' || !showSketches) return [] as ReactNode[]   // 编辑紧草图时唔重复画（live 层负责）；GM-X2 #8 主开关关咗即全隐
    const out: ReactNode[] = []
    for (const [k, src] of Object.entries(srcs)) {
      if (!src.visible || !Array.isArray(src.shapes)) continue
      const hot = k === selSketch
      const fr = src.arb ? arbFrame(src.arb as { o: V3; xd: V3; n: V3 }) : null
      const lift: Lift = fr ? fr.lift : (p) => SK[src.plane].lift(p, src.baseZ + 0.05)
      const shapes = src.shapes as BatchShape[]
      // Large schematic: one solid + one construction LineSegments (not N drei Lines).
      if (shapes.length >= SKETCH_BATCH_THRESHOLD) {
        const batched = batchSketchPositions(shapes, lift)
        out.push(<BatchedSketchLines key={`${k}_solid`} positions={batched.solid} color={hot ? '#1572c4' : '#7a4dab'} />)
        out.push(<BatchedSketchLines key={`${k}_constr`} positions={batched.constr} color="#d9a23a" opacity={0.95} />)
        if (src.sweepPath && src.sweepPath.length >= 2) out.push(<Line key={`${k}_path`} points={src.sweepPath.map(lift)} color="#7a4dab" lineWidth={1.3} dashed dashSize={4} gapSize={2.5} />)
        continue
      }
      src.shapes.forEach((sh, i) => {
        if (sh.type === 'circle' && sh.point) {
          const c = sh.c
          out.push(<Line key={`${k}_${i}`} points={[lift([c[0] - 1.8, c[1] - 1.8]), lift([c[0] + 1.8, c[1] + 1.8])]} color="#9aa6b2" lineWidth={1.4} />)
          return
        }
        const pts = sh.type === 'rect' ? rectPts(sh.a, sh.b, lift)
          : sh.type === 'circle' ? circlePts(sh.c, sh.r, lift)
            : (sh.pts && sh.pts.length ? (sh.open ? sh.pts.map(lift) : [...sh.pts.map(lift), lift(sh.pts[0])]) : null)
        if (!pts) return
        out.push(sh.construction
          ? <Line key={`${k}_${i}`} points={pts} color="#d9a23a" lineWidth={1.1} dashed dashSize={3.2} gapSize={2.4} />   /* GM-FP2 #21：构造琥珀虚线 */
          : <Line key={`${k}_${i}`} points={pts} color={hot ? '#1572c4' : '#7a4dab'} lineWidth={hot ? 2.6 : 1.6} />)
      })
      // T748：扫掠路径（开放折线）— 紫虚线
      if (src.sweepPath && src.sweepPath.length >= 2) out.push(<Line key={`${k}_path`} points={src.sweepPath.map(lift)} color="#7a4dab" lineWidth={1.3} dashed dashSize={4} gapSize={2.5} />)
    }
    return out
  }, [srcs, mode, selSketch, showSketches])
  if (!els.length) return null
  return <>{els}</>
}

// Selection highlight for the in-sketch select/dimension tools: orange markers over picked geometry.
export function SkSelDraw() {
  const patternCandidate = useApp(s=>hasPatternCandidate(s)||!!s.skDimPreview.shapes)
  const mode = useApp((s) => s.mode)
  const sel = useApp((s) => s.skSel)
  const pend = useApp((s) => s.skPendingPt)
  const refGeo = useApp((s) => s.skRefGeo)
  const projPick = useApp((s) => s.projPickMode)   // ③ 逐条投影：高亮投影边提示可㩒
  const profiles = useApp((s) => s.sketchProfiles)
  const shape = useApp((s) => s.sketchShape)
  const plane = useApp((s) => s.sketchPlane)
  const baseZ = useApp((s) => s.sketchBaseZ)
  const arb = useApp((s) => s.sketchArb)
  const tool = useApp((s) => s.sketchTool)
  const skCons = useApp((s) => s.skCons)
  const skSelCon = useApp((s) => s.skSelCon)   // GM-FP3 #35：选中约束 → 高亮其关联几何（partner）
  const skAnnot = useApp((s) => s.skView.annot)   // 标注显示开关（尺寸线 + 标签层）
  const skHover = useApp((s) => s.skHover)   // GM-W6 C6：select/dimension 悬停实体（淡橙高亮 + pointer 游标）
  // GM-W6 C6：悬停中 → 画布游标转 pointer（提示可拣）；清 hover 时只还原返自己设过嘅 pointer（唔硬清第三方游标）。
  useEffect(() => {
    const cv = document.querySelector('canvas') as HTMLCanvasElement | null
    if (!cv) return
    const want = mode === 'sketch' && (tool === 'select' || tool === 'dimension') && !!skHover
    if (want) cv.style.cursor = 'pointer'
    else if (cv.style.cursor === 'pointer') cv.style.cursor = ''
  }, [mode, tool, skHover])
  if (mode !== 'sketch' || patternCandidate) return null
  const refs: SkRef[] = [...sel, ...(pend ? [pend] : [])]
  const shapes = [...profiles, ...(shape ? [shape] : [])] as FShape[]
  const ellipticHighlight = (r: SkRef): Pt[] | null => {
    if (!('shape' in r)) return null
    const sh = shapes[r.shape]
    if ((r.kind === 'ellipse' || r.kind === 'ellipse-arc') && sh?.type === 'poly' && sh.pts.length) return r.kind === 'ellipse' ? [...sh.pts,sh.pts[0]] : sh.pts
    if (r.kind === 'ellipse-axis') return refPts(shapes,r)
    return null
  }
  // T746 批2（GAP6）：斜面重开都有尺寸线/顶点标记/原点⊕ — arb lift + 沿法向抬 0.1mm 防 z-fight
  const fr = arb ? arbFrame(arb as { o: V3; xd: V3; n: V3 }) : null
  const nOff: V3 = fr && arb ? [(arb as { n: V3 }).n[0] * 0.1, (arb as { n: V3 }).n[2] * 0.1, -(arb as { n: V3 }).n[1] * 0.1] : [0, 0, 0]
  const liftP = (p: Pt): V3 => { if (!fr) return SK[plane].lift(p, baseZ + 0.1); const w = fr.lift(p); return [w[0] + nOff[0], w[1] + nOff[1], w[2] + nOff[2]] }
  const els: ReactNode[] = []
  // ── 尺寸线（T731）：每个尺寸画真延伸线+尺寸线（标签锚同源 dimGfx，正好坐喺线上）──
  skCons.forEach((c, k) => {
    if (c.kind !== 'dim' || !skAnnot) return
    const g = dimGfx(shapes, c)
    if (!g) return
    const col = c.driven ? '#8a97a2' : '#0d6fc2'
    const lw = c.driven ? 1.05 : 1.85
    g.lines.forEach(([a, b], j) => els.push(<Line key={`dg${k}_${j}`} points={[liftP(a), liftP(b)]} color={col} lineWidth={lw} />))
  })
  // ── 顶点/圆心标记（T731）：select/dimension 工具下显示可拣点（圆心⊕系用户最常揾唔到嘅）──
  if (tool === 'select' || tool === 'dimension') {
    shapes.forEach((sh, i) => {
      if (sh.type === 'circle') {
        const cc = sh.c
        els.push(
          <group key={`vm${i}`}>
            <Line points={[liftP([cc[0] - 2, cc[1]]), liftP([cc[0] + 2, cc[1]])]} color="#1572c4" lineWidth={1.6} />
            <Line points={[liftP([cc[0], cc[1] - 2]), liftP([cc[0], cc[1] + 2])]} color="#1572c4" lineWidth={1.6} />
          </group>)
        return
      }
      if (sh.type === 'poly' && (sh.ell || sh.earc)) {
        const semantic = ([0,1,2] as const).map(idx => refPts(shapes, { kind: 'ellipse-point', shape: i, idx })[0])
        const [center,major,minor] = semantic
        if (center && major && minor) {
          for (const endpoint of [major,minor]) els.push(<Line key={`ellipse-axis-${i}-${endpoint===major?'major':'minor'}`} points={[liftP(center),liftP(endpoint)]} color="#8a98a8" lineWidth={1.2} dashed dashSize={2} gapSize={1.5} />)
          semantic.forEach((point,idx) => els.push(<mesh key={`ellipse-handle-${i}-${idx}`} position={liftP(point)}><sphereGeometry args={[1.2,12,12]} /><meshBasicMaterial color="#1572c4" depthTest={false} /></mesh>))
          els.push(<group key={`ellipse-center-${i}`}><Line points={[liftP([center[0]-2,center[1]]),liftP([center[0]+2,center[1]])]} color="#1572c4" lineWidth={1.5}/><Line points={[liftP([center[0],center[1]-2]),liftP([center[0],center[1]+2])]} color="#1572c4" lineWidth={1.5}/></group>)
        }
        if (sh.earc) for(const idx of [0,1] as const) { const endpoint=refPts(shapes,{kind:'ellipse-arc-end',shape:i,idx})[0]; if(endpoint) els.push(<mesh key={`ellipse-arc-end-${i}-${idx}`} position={liftP(endpoint)}><sphereGeometry args={[1.5,12,12]}/><meshBasicMaterial color="#d47b17" depthTest={false}/></mesh>) }
        return
      }
      // S103[8]：样条显示【控制点】手柄（可拣/可拖/可约束），唔好显示 48 密铺点；旧档无 ctrl → 退回空（死图元，向后兼容）
      const vs: Pt[] = sh.type === 'rect' ? [sh.a, [sh.b[0], sh.a[1]], sh.b, [sh.a[0], sh.b[1]]] : (sh.verts ?? (sh.conic ? [sh.pts[0], sh.pts[sh.pts.length - 1]] : sh.smooth ? (sh.ctrl ?? []) : sh.pts))   // S177：圆锥曲线无 ctrl → 显两端点做可拣手柄
      if (vs.length > 60) return  // 密铺旧档守卫
      vs.forEach((q, j) => els.push(
        <mesh key={`vm${i}_${j}`} position={liftP(q)}>
          <sphereGeometry args={[1.0, 10, 10]} />
          <meshBasicMaterial color="#1572c4" depthTest={false} />
        </mesh>))
      if (sh.type === 'poly' && sh.verts && sh.bulges) {
        sh.bulges.slice(0, sh.verts.length - (sh.open ? 1 : 0)).forEach((bu,j) => {
          if (Math.abs(bu) < 1e-12) return
          const [c] = refPts(shapes, { kind: 'center', shape: i, idx: j })
          if (!c) return
          els.push(<group key={`arc-center-${i}-${j}`}>
            <Line points={[liftP([c[0]-1,c[1]]),liftP([c[0]+1,c[1]])]} color="#1572c4" lineWidth={1.2} />
            <Line points={[liftP([c[0],c[1]-1]),liftP([c[0],c[1]+1])]} color="#1572c4" lineWidth={1.2} />
          </group>)
        })
      }
      // S103[8]：样条控制多边形虚线（控制点顺连，参考几何样式）— 睇到控制网
      if (sh.type === 'poly' && sh.smooth && sh.ctrl && sh.ctrl.length >= 2) { const ctrl = sh.ctrl; const segN = sh.open ? ctrl.length - 1 : ctrl.length; for (let j = 0; j < segN; j++) { const a = ctrl[j], b = ctrl[(j + 1) % ctrl.length]; els.push(<Line key={`cpoly${i}_${j}`} points={[liftP(a), liftP(b)]} color="#8a98a8" lineWidth={1} dashed dashSize={2} gapSize={1.5} />) } }   // S161：开放样条控制网唔好画埋 ctrl[n-1]->ctrl[0] 嗰条封口虚线
      // #174-8：开放样条【首尾切向手柄】—— 端点沿曲线离开方向画一条青色手柄线 + 末端小球（视觉指示端点切向；双击控制段之间可插拟合点）
      if (sh.type === 'poly' && sh.smooth && sh.open && sh.ctrl && sh.ctrl.length >= 2) {
        const ctrl = sh.ctrl as Pt[]
        // 手柄长 = 首末两段平均长 × 0.5（随草图尺度缩放），钳 [3,40]mm
        const seg0 = Math.hypot(ctrl[1][0] - ctrl[0][0], ctrl[1][1] - ctrl[0][1])
        const segN = Math.hypot(ctrl[ctrl.length - 1][0] - ctrl[ctrl.length - 2][0], ctrl[ctrl.length - 1][1] - ctrl[ctrl.length - 2][1])
        const hlen = Math.max(3, Math.min(40, ((seg0 + segN) / 2) * 0.5))
        const { startHandle, endHandle } = endpointTangentHandles(ctrl, hlen)
        const ends: [Pt, Pt][] = [[ctrl[0], startHandle], [ctrl[ctrl.length - 1], endHandle]]
        ends.forEach(([o, h], k) => {
          els.push(<Line key={`tanh${i}_${k}`} points={[liftP(o), liftP(h)]} color="#12b0c0" lineWidth={1.4} />)
          els.push(<mesh key={`tanhb${i}_${k}`} position={liftP(h)}><sphereGeometry args={[0.9, 10, 10]} /><meshBasicMaterial color="#12b0c0" depthTest={false} /></mesh>)
        })
      }
    })
  }
  // projected reference geometry: the body's face boundary / section — 蓝紫参考线（#7b6fd0），可选。
  if (refGeo) {
    // GM-W7 7.5：投影段（多为 mesh facet 短弦）逐段各自 dash 时，每段短过 dashSize → 塌成一点 → 用户见到「点点点」。
    // 改为把段串成 polyline（chainSegments，同 snap 量化一致），成条线一次 Line 画 → dash 沿全长连续 → 读得出係 line。
    // 逐条投影拣（projPick）或有选中 refedge 时先退回逐段渲染（保留逐边身份：高亮 / 可点）。
    const anyEdgeSel = refs.some((r) => r.kind === 'refedge')
    if (projPick || anyEdgeSel) {
      refGeo.segs.forEach(([a, b], j) => {
        const seld = refs.some((r) => r.kind === 'refedge' && r.idx === j)
        els.push(<Line key={'rg' + j} points={[liftP(a), liftP(b)]} color={seld || projPick ? '#ff8a2a' : '#7b6fd0'} lineWidth={seld ? 3.4 : projPick ? 2.4 : 1.2} dashed={!projPick && !seld} dashSize={4} gapSize={3} />)
      })
    } else {
      chainSegments(refGeo.segs as [Pt, Pt][]).forEach((ch, j) => {
        if (ch.pts.length < 2) return
        const pp = (ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts).map(liftP)
        els.push(<Line key={'rgc' + j} points={pp} color="#7b6fd0" lineWidth={1.2} dashed dashSize={4} gapSize={3} />)
      })
    }
    // GM-W7 7.5b（用户报「一开草图未画嘢就成排点点」= bug）：refGeo.pts 收晒【每小段端点】——圆柱截面
    // 圆 24-48 个 facet 顶点逐粒画波仔 = 成排噪音点。默认只显示【非端点】标记（圆心 arcCentersFromSegs
    // + 构造点 extraRefPts —— 佢哋唔喺任何 seg 端点上）；密铺端点收起，吸附时由 7.4 snapSrc 高亮补返
    //（吸附数学零改动 —— 只系唔再无差别画标记）。选中态照旧放大 + 橙圈。
    const endKeys = new Set<string>()
    for (const [a, b] of refGeo.segs) { endKeys.add(`${Math.round(a[0] * 50)},${Math.round(a[1] * 50)}`); endKeys.add(`${Math.round(b[0] * 50)},${Math.round(b[1] * 50)}`) }
    refGeo.pts.forEach((q, j) => {
      const selp = refs.some((r) => r.kind === 'refpt' && r.idx === j)
      if (!selp && endKeys.has(`${Math.round(q[0] * 50)},${Math.round(q[1] * 50)}`)) return   // 密铺端点：默认唔画（snap 时先亮）
      els.push(
        <mesh key={'rgp' + j} position={liftP(q)}>
          <sphereGeometry args={[selp ? 2.4 : 0.7, 12, 12]} />
          <meshBasicMaterial color={selp ? '#ff8a2a' : '#7b6fd0'} depthTest={false} />
        </mesh>)
      if (selp) els.push(<Line key={'rgpr' + j} points={circlePts(q, 3.4, liftP)} color="#ff8a2a" lineWidth={2.4} />)
    })
  }
  // sketch origin ⊕ — always visible, selectable for positioning dims (Fusion 位置尺寸 anchor)
  const oSel = refs.some((r) => r.kind === 'origin')
  els.push(
    <group key="org">
      <Line points={[liftP([-3, 0]), liftP([3, 0])]} color={oSel ? '#ff8a2a' : '#c0392b'} lineWidth={oSel ? 3 : 1.6} />
      <Line points={[liftP([0, -3]), liftP([0, 3])]} color={oSel ? '#ff8a2a' : '#2e7d32'} lineWidth={oSel ? 3 : 1.6} />
      <Line points={circlePts([0, 0], 1.6, liftP)} color={oSel ? '#ff8a2a' : '#6b7680'} lineWidth={oSel ? 2.6 : 1.2} />
    </group>)
  // GM-W6 C6：悬停高亮（淡橙 #e8a25e，lineWidth 2.8）——画喺【选中橙下面】（先 push，选中橙后画盖上）。
  // 只 select/dimension 工具显；已选中嘅唔重复画。防御性 guard shape/refGeo 存在。
  if ((tool === 'select' || tool === 'dimension') && skHover && !refs.some((r) => JSON.stringify(r) === JSON.stringify(skHover))) {
    const r = skHover, HC = '#e8a25e', HW = 2.8
    const ellipticPath = ellipticHighlight(r)
    if (ellipticPath) els.push(<Line key="hov" points={ellipticPath.map(liftP)} color={HC} lineWidth={HW} />)
    else if (r.kind === 'origin') els.push(<Line key="hov" points={circlePts([0, 0], 3.4, liftP)} color={HC} lineWidth={HW} />)
    else if (r.kind === 'refpt' && refGeo && refGeo.pts[r.idx]) els.push(<Line key="hov" points={circlePts(refGeo.pts[r.idx], 3.4, liftP)} color={HC} lineWidth={HW} />)
    else if (r.kind === 'refedge' && refGeo && refGeo.segs[r.idx]) { const [a, b] = refGeo.segs[r.idx]; els.push(<Line key="hov" points={[liftP(a), liftP(b)]} color={HC} lineWidth={HW} />) }
    else if (r.kind === 'circle') { const sh = shapes[r.shape]; if (sh && sh.type === 'circle') els.push(<Line key="hov" points={circlePts(sh.c, sh.r, liftP)} color={HC} lineWidth={HW} />) }
    else if (r.kind === 'edge') {
      const sh = shapes[r.shape]; const [a, b] = refPts(shapes, r)
      const bu = sh && sh.type === 'poly' && sh.verts && sh.bulges ? (sh.bulges[r.idx] || 0) : 0
      if (a && b && Math.abs(bu) > 1e-12) els.push(<Line key="hov" points={[liftP(a), ...tessellateSeg(a, b, bu).map(liftP)]} color={HC} lineWidth={HW} />)
      else if (a && b) els.push(<Line key="hov" points={[liftP(a), liftP(b)]} color={HC} lineWidth={HW} />)
    } else if (r.kind === 'pt' || r.kind === 'center' || r.kind === 'ellipse-point' || r.kind === 'ellipse-arc-end') { const [p] = refPts(shapes, r); if (p) els.push(<Line key="hov" points={circlePts(p, 3.2, liftP)} color={HC} lineWidth={HW} />) }
  }
  refs.forEach((r, i) => {
    if (r.kind === 'origin' || r.kind === 'refpt' || r.kind === 'refedge') return  // highlighted above
    const sh = shapes[r.shape]
    if (!sh) return
    const ellipticPath = ellipticHighlight(r)
    if (ellipticPath) { els.push(<Line key={'ss'+i} points={ellipticPath.map(liftP)} color="#ff8a2a" lineWidth={3.4} />) }
    else if (r.kind === 'circle' && sh.type === 'circle') {
      els.push(<Line key={'ss' + i} points={circlePts(sh.c, sh.r, liftP)} color="#ff8a2a" lineWidth={3.4} />)
    } else if (r.kind === 'edge') {
      const [a, b] = refPts(shapes, r)
      const bu = sh.type === 'poly' && sh.verts && sh.bulges ? (sh.bulges[r.idx] || 0) : 0
      if (a && b && Math.abs(bu) > 1e-12) {
        // arc segment: highlight along the true arc, not the chord
        els.push(<Line key={'ss' + i} points={[liftP(a), ...tessellateSeg(a, b, bu).map(liftP)]} color="#ff8a2a" lineWidth={4} />)
      } else if (a && b) els.push(<Line key={'ss' + i} points={[liftP(a), liftP(b)]} color="#ff8a2a" lineWidth={4} />)
    } else {
      const [p] = refPts(shapes, r)
      if (p) { els.push(
        <mesh key={'ss' + i} position={liftP(p)}>
          <sphereGeometry args={[2.6, 12, 12]} />
          <meshBasicMaterial color="#ff8a2a" depthTest={false} />
        </mesh>)
        els.push(<Line key={'ssr' + i} points={circlePts(p, 3.6, liftP)} color="#ff8a2a" lineWidth={2.6} />) }
    }
  })
  const tangentPair = (a: SkRef, b: SkRef) => {
    const pair=ellipseLineTangentPair(shapes,a,b);if(!pair)return null
    const sh=shapes[pair.ellipse.shape],line=refPts(shapes,pair.line)
    const ellipse=sh?.type==='poly'?(sh.ell??sh.earc):null
    return ellipse&&line.length===2?{ellipse,arc:sh.type==='poly'?sh.earc:undefined,a:line[0],b:line[1],initialAngle:initialEllipseContact(shapes,pair)?.angleDeg??null}:null
  }
  if(sel.length===2){const pair=tangentPair(sel[0],sel[1]);if(pair){const candidates=ellipseTangentCandidates(pair.ellipse,pair.a,pair.b).filter(c=>!pair.arc||ellipseArcContainsAngle(pair.arc,c.angleDeg)),nearest=candidates.reduce((n,c,i)=>Math.abs(Math.sin((c.angleDeg-(pair.initialAngle??0))*Math.PI/360))<Math.abs(Math.sin(((candidates[n]?.angleDeg??0)-(pair.initialAngle??0))*Math.PI/360))?i:n,0);candidates.forEach((c,i)=>els.push(<Line key={`tan-preview-${i}`} points={circlePts(c.point,i===nearest?2.8:2.2,liftP)} color={i===nearest?'#f08a24':'#22a7bd'} lineWidth={2.4}/>));if(!candidates.length&&pair.initialAngle!==null){const point=ellipseContactPoint(pair.ellipse,pair.initialAngle),t=pair.initialAngle*Math.PI/180,r=pair.ellipse.rot*Math.PI/180,dx=-pair.ellipse.rx*Math.sin(t)*Math.cos(r)-pair.ellipse.ry*Math.cos(t)*Math.sin(r),dy=-pair.ellipse.rx*Math.sin(t)*Math.sin(r)+pair.ellipse.ry*Math.cos(t)*Math.cos(r),n=Math.hypot(dx,dy);els.push(<Line key="tan-fallback-contact" points={circlePts(point,2.8,liftP)} color="#f08a24" lineWidth={2.4}/>);if(n>1e-9)els.push(<Line key="tan-fallback-direction" points={[liftP([point[0]-8*dx/n,point[1]-8*dy/n]),liftP([point[0]+8*dx/n,point[1]+8*dy/n])]} color="#f08a24" lineWidth={1.8} dashed dashSize={2} gapSize={1.5}/>)}}}
  if(skAnnot)for(const c of skCons){const meta=(c as SkCon & {ellipseContact?:{version:1;angleDeg:number}}).ellipseContact;if(c.type!=='tangent'||!meta||!c.b)continue;const pair=tangentPair(c.a,c.b);if(!pair)continue;const point=ellipseContactPoint(pair.ellipse,meta.angleDeg),extension=tangentExtension(point,pair.a,pair.b);els.push(<Line key={`tan-contact-${c.id}`} points={circlePts(point,2.6,liftP)} color="#20a3ad" lineWidth={2.2}/>);if(extension)els.push(<Line key={`tan-extension-${c.id}`} points={extension.map(liftP)} color="#20a3ad" lineWidth={1.8} dashed dashSize={2.2} gapSize={1.5}/>)}
  // GM-FP3 #35：选中约束 → 紫色高亮其关联几何（a/b/c partner），令用户见到「呢个约束 govern 边啲嘢」。
  if (skSelCon) {
    const c = skCons.find((x) => x.id === skSelCon)
    const PC = '#a855e0'
    if (c) for (const r of [c.a, c.b, (c as { c?: SkRef }).c]) {
      if (!r) continue
      if (r.kind === 'origin') { els.push(<Line key={`pc${JSON.stringify(r)}`} points={circlePts([0, 0], 4, liftP)} color={PC} lineWidth={3} />); continue }
      if (r.kind === 'refpt' && refGeo && refGeo.pts[r.idx]) { els.push(<Line key={`pc${r.idx}rp`} points={circlePts(refGeo.pts[r.idx], 4, liftP)} color={PC} lineWidth={3} />); continue }
      if (r.kind === 'refedge' && refGeo && refGeo.segs[r.idx]) { const [a, b] = refGeo.segs[r.idx]; els.push(<Line key={`pc${r.idx}re`} points={[liftP(a), liftP(b)]} color={PC} lineWidth={3.4} />); continue }
      const sh = shapes[(r as { shape?: number }).shape ?? -1]
      if (!sh) continue
      const ellipticPath = ellipticHighlight(r)
      if (ellipticPath) els.push(<Line key={`pc${JSON.stringify(r)}`} points={ellipticPath.map(liftP)} color={PC} lineWidth={3.4} />)
      else if (r.kind === 'circle' && sh.type === 'circle') els.push(<Line key={`pc${(r as { shape: number }).shape}c`} points={circlePts(sh.c, sh.r, liftP)} color={PC} lineWidth={3.4} />)
      else if (r.kind === 'edge') {
        const [a, b] = refPts(shapes, r); const bu = sh.type === 'poly' && sh.verts && sh.bulges ? (sh.bulges[r.idx] || 0) : 0
        if (a && b && Math.abs(bu) > 1e-12) els.push(<Line key={`pc${r.shape}_${r.idx}e`} points={[liftP(a), ...tessellateSeg(a, b, bu).map(liftP)]} color={PC} lineWidth={4} />)
        else if (a && b) els.push(<Line key={`pc${r.shape}_${r.idx}e`} points={[liftP(a), liftP(b)]} color={PC} lineWidth={4} />)
      } else if (r.kind === 'pt' || r.kind === 'center' || r.kind === 'ellipse-point' || r.kind === 'ellipse-arc-end') { const [q] = refPts(shapes, r); if (q) els.push(<Line key={`pc${(r as { shape: number }).shape}_${(r as { idx: number }).idx}p`} points={circlePts(q, 3.8, liftP)} color={PC} lineWidth={3} />) }
    }
  }
  return <group renderOrder={40}>{els}</group>
}

// T790：镜像工具进行中可视化 — 高亮已拣轮廓（绿），stage=line 时画镜像线（p1 → 当前光标）。
export function MirrorPickDraw() {
  const mode = useApp((s) => s.mode)
  const mp = useApp((s) => s.mirrorPick)
  const profiles = useApp((s) => s.sketchProfiles)
  const shape = useApp((s) => s.sketchShape)
  const plane = useApp((s) => s.sketchPlane)
  const baseZ = useApp((s) => s.sketchBaseZ)
  const arb = useApp((s) => s.sketchArb)
  const preview = useApp((s) => s.sketchPreview)
  if (mode !== 'sketch' || !mp) return null
  const fr = arb ? arbFrame(arb as { o: V3; xd: V3; n: V3 }) : null
  const lift: Lift = fr ? fr.lift : (p) => SK[plane].lift(p, baseZ + 0.12)
  const shapes = [...profiles, ...(shape ? [shape] : [])] as SketchShape[]
  const els: ReactNode[] = []
  mp.shapes.forEach((idx, j) => {
    const sh = shapes[idx]; if (!sh) return
    const pts = sh.type === 'rect' ? rectPts(sh.a, sh.b, lift) : sh.type === 'circle' ? circlePts(sh.c, sh.r, lift) : (sh.pts && sh.pts.length ? (sh.open ? sh.pts.map(lift) : [...sh.pts.map(lift), lift(sh.pts[0])]) : null)
    if (pts) els.push(<Line key={`mp${j}`} points={pts} color="#1aa06b" lineWidth={3.4} />)
  })
  if (mp.stage === 'line' && mp.p1) {
    const end = preview || mp.p1
    els.push(<Line key="mpline" points={[lift(mp.p1), lift(end)]} color="#1aa06b" lineWidth={2.2} dashed dashSize={3} gapSize={2} />)
    els.push(<mesh key="mpp1" position={lift(mp.p1)}><sphereGeometry args={[1.4, 10, 10]} /><meshBasicMaterial color="#1aa06b" depthTest={false} /></mesh>)
  }
  return <group renderOrder={41}>{els}</group>
}

// GM-FP3 #44：草图框选橡皮筋 —— window（左→右全包·橙实线）/ crossing（右→左相触·黄虚线），带半透明填充。
export function MarqueeDraw() {
  const mode = useApp((s) => s.mode)
  const mq = useApp((s) => s.skMarquee)
  const plane = useApp((s) => s.sketchPlane)
  const baseZ = useApp((s) => s.sketchBaseZ)
  const arb = useApp((s) => s.sketchArb)
  if (mode !== 'sketch' || !mq) return null
  const fr = arb ? arbFrame(arb as { o: V3; xd: V3; n: V3 }) : null
  const lift: Lift = fr ? fr.lift : (p) => SK[plane].lift(p, baseZ + 0.2)
  const { a, b } = mq
  const c0 = lift([a[0], a[1]]), c1 = lift([b[0], a[1]]), c2 = lift([b[0], b[1]]), c3 = lift([a[0], b[1]])
  const col = mq.crossing ? '#f4b400' : '#ff7a1a'   // 黄=crossing（相触）/ 橙=window（全包）
  const pos = new Float32Array([...c0, ...c1, ...c2, ...c0, ...c2, ...c3])
  return (
    <group renderOrder={44}>
      <mesh frustumCulled={false}>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[pos, 3]} /></bufferGeometry>
        <meshBasicMaterial color={col} transparent opacity={0.14} depthTest={false} side={DoubleSide} />
      </mesh>
      <Line points={[c0, c1, c2, c3, c0]} color={col} lineWidth={1.7} dashed={mq.crossing} dashSize={4} gapSize={3} />
    </group>
  )
}

// GM-FP3 #39：Move gizmo —— X（红）/Y（绿）箭头 + 旋转 knob（蓝）绕形心，加变换后绿虚线 ghost。
export function DimensionEditPreview(){
 const candidate=useApp(s=>s.skDimPreview),mode=useApp(s=>s.mode),plane=useApp(s=>s.sketchPlane),baseZ=useApp(s=>s.sketchBaseZ),arb=useApp(s=>s.sketchArb),view=useApp(s=>s.skView)
 if(mode!=='sketch'||!candidate.shapes||candidate.pending||candidate.error)return null
 const frame=arb?arbFrame(arb as {o:V3;xd:V3;n:V3}):null,lift:Lift=frame?frame.lift:p=>SK[plane].lift(p,baseZ+.24)
 return <group name="dimension-edit-preview" renderOrder={44}>{candidate.shapes.map((sh,i)=>{if(!sketchGeometryVisible(sh,view))return null;const pts=patternOutline(sh,lift);return pts.length>1?<Line key={i} points={pts} color="#1aa06b" lineWidth={2} dashed dashSize={2.5} gapSize={1.5}/>:null})}</group>
}

export function MoveGizmoDraw() {
  const mode = useApp((s) => s.mode)
  const mv = useApp((s) => s.skMove)
  const plane = useApp((s) => s.sketchPlane)
  const baseZ = useApp((s) => s.sketchBaseZ)
  const arb = useApp((s) => s.sketchArb)
  const profiles = useApp((s) => s.sketchProfiles)
  const shape = useApp((s) => s.sketchShape)
  const camera = useThree((s) => s.camera)
  const moveState=useApp(s=>s),preview=moveState.skMovePreview
  useLayoutEffect(()=>{void useApp.getState().previewSkMove()},[mode,mv,profiles,shape,plane,baseZ,arb,moveState.skCons,moveState.params,moveState.skPatternData,moveState.features,moveState.paramBindings,moveState.skEditTarget,moveState.sketchUndo,moveState.sketchRedo,moveState.skSel,moveState.skRefGeo,moveState.sketchTool,moveState.skDimLabelOff,moveState.sketchSources])
  if (mode !== 'sketch' || !mv) return null
  const fr = arb ? arbFrame(arb as { o: V3; xd: V3; n: V3 }) : null
  const lift: Lift = fr ? fr.lift : (p) => SK[plane].lift(p, baseZ + 0.24)
  const cc = camera as unknown as { isOrthographicCamera?: boolean; zoom?: number }
  const arm = cc?.isOrthographicCamera ? Math.min(200, Math.max(6, 46 / (cc.zoom || 1))) : 30
  const px = mv.cx + mv.dx, py = mv.cy + mv.dy
  const ang = mv.ang * Math.PI / 180, c0 = Math.cos(ang), s0 = Math.sin(ang)
  const xf = (q: Pt): Pt => { const rx = mv.cx + (q[0] - mv.cx) * c0 - (q[1] - mv.cy) * s0, ry = mv.cy + (q[0] - mv.cx) * s0 + (q[1] - mv.cy) * c0; return [rx + mv.dx, ry + mv.dy] }
  const shapes = [...profiles, ...(shape ? [shape] : [])] as SketchShape[]
  const els: ReactNode[] = []
  // 变换后 ghost（绿虚线）
  const tset = new Set(mv.targets)
  ;(mv.inputError?[]:mv.copy?shapes:preview.shapes??[]).forEach((sh, i) => {
    if (mv.copy?!tset.has(i):JSON.stringify(sh)===JSON.stringify(shapes[i])) return
    const drawTransform=mv.copy?xf:(p:Pt)=>p
    const outline: Pt[] | null = sh.type === 'rect' ? [sh.a, [sh.b[0], sh.a[1]], sh.b, [sh.a[0], sh.b[1]]] : sh.type === 'circle' ? null : (sh.pts && sh.pts.length ? sh.pts : null)
    if (sh.type === 'circle') { els.push(<Line key={`mg${i}`} points={circlePts(drawTransform(sh.c), sh.r, lift)} color="#1aa06b" lineWidth={1.6} dashed dashSize={2.5} gapSize={2} />); return }
    if (!outline) return
    const tp = outline.map(drawTransform)
    els.push(<Line key={`mg${i}`} points={[...tp.map(lift), ...(sh.type === 'poly' && sh.open ? [] : [lift(tp[0])])]} color="#1aa06b" lineWidth={1.6} dashed dashSize={2.5} gapSize={2} />)
  })
  // 旋转 knob 弧（蓝虚线，pivot 半径 arm*0.85 由 0→90°）
  const ringR = arm * 0.85, rotArc: [number, number, number][] = []
  for (let k = 0; k <= 12; k++) { const t = (k / 12) * (Math.PI / 2); rotArc.push(lift([px + ringR * Math.cos(t), py + ringR * Math.sin(t)])) }
  els.push(<Line key="mgrot" points={rotArc} color="#2b7de9" lineWidth={2.2} dashed dashSize={3} gapSize={2} />)
  els.push(<mesh key="mgrotk" position={lift([px + arm * 0.72, py + arm * 0.72])}><sphereGeometry args={[arm * 0.09, 12, 12]} /><meshBasicMaterial color="#2b7de9" depthTest={false} /></mesh>)
  // X 箭头（红）
  els.push(<Line key="mgx" points={[lift([px, py]), lift([px + arm, py])]} color="#e5484d" lineWidth={3} />)
  els.push(<mesh key="mgxk" position={lift([px + arm, py])}><sphereGeometry args={[arm * 0.1, 12, 12]} /><meshBasicMaterial color="#e5484d" depthTest={false} /></mesh>)
  // Y 箭头（绿）
  els.push(<Line key="mgy" points={[lift([px, py]), lift([px, py + arm])]} color="#2fa84f" lineWidth={3} />)
  els.push(<mesh key="mgyk" position={lift([px, py + arm])}><sphereGeometry args={[arm * 0.1, 12, 12]} /><meshBasicMaterial color="#2fa84f" depthTest={false} /></mesh>)
  // pivot
  els.push(<mesh key="mgp" position={lift([px, py])}><sphereGeometry args={[arm * 0.07, 12, 12]} /><meshBasicMaterial color="#ffb020" depthTest={false} /></mesh>)
  return <group renderOrder={45}>{els}</group>
}

export function ScaleGizmoDraw(){
  const sc=useApp(s=>s.skScale),mode=useApp(s=>s.mode),plane=useApp(s=>s.sketchPlane),baseZ=useApp(s=>s.sketchBaseZ),arb=useApp(s=>s.sketchArb),camera=useThree(s=>s.camera)
  const profiles=useApp(s=>s.sketchProfiles),shape=useApp(s=>s.sketchShape)
  if(mode!=='sketch'||!sc)return null
  const frame=arb?arbFrame(arb as {o:V3;xd:V3;n:V3}):null,lift:Lift=frame?frame.lift:p=>SK[plane].lift(p,baseZ+.24)
  const c=camera as unknown as {isOrthographicCamera?:boolean;zoom?:number},arm=c.isOrthographicCamera?Math.min(200,Math.max(6,46/(c.zoom||1))):30
  const center:Pt=[sc.cx,sc.cy],handle:Pt=[sc.cx+arm*sc.factor,sc.cy],col=sc.error?'#c9362a':'#1aa06b',out:ReactNode[]=[]
  const originals=[...profiles,...(shape?[shape]:[])]
  for(const [i,sh] of (sc.preview??[]).entries()){if(JSON.stringify(sh)===JSON.stringify(originals[i]))continue;const p=sh.type==='circle'?circlePts(sh.c,sh.r,lift):sh.type==='rect'?[sh.a,[sh.b[0],sh.a[1]] as Pt,sh.b,[sh.a[0],sh.b[1]] as Pt,sh.a].map(lift):[...sh.pts,...(sh.open?[]:[sh.pts[0]])].map(lift);if(p.length>1)out.push(<Line key={i} points={p} color={col} lineWidth={1.8} dashed dashSize={2} gapSize={1.5} />)}
  return <group renderOrder={46}>
    {out}<Line points={[lift(center),lift(handle)]} color="#2b7de9" lineWidth={2} />
    <mesh position={lift(center)}><sphereGeometry args={[arm*.075,12,12]}/><meshBasicMaterial color="#ffb020" depthTest={false}/></mesh>
    {sc.stage!=='base'&&<mesh position={lift(handle)}><sphereGeometry args={[arm*.12,12,12]}/><meshBasicMaterial color="#2b7de9" depthTest={false}/></mesh>}
  </group>
}

// T791 D2：阵列工具实时预览 — sketchTool==='array' 时按 arrayCfg 画绿色虚线 ghost 副本（原件唔重画）。
export function ArrayPreview() {
  const mode=useApp(s=>s.mode),tool=useApp(s=>s.sketchTool),cfg=useApp(s=>s.arrayCfg)
  const shape=useApp(s=>s.sketchShape),profiles=useApp(s=>s.sketchProfiles),cons=useApp(s=>s.skCons),params=useApp(s=>s.params)
  const plane=useApp(s=>s.sketchPlane),baseZ=useApp(s=>s.sketchBaseZ),arb=useApp(s=>s.sketchArb),sel=useApp(s=>s.skSel)
  const move=useApp(s=>s.skMove),edit=useApp(s=>s.skEditTarget),undo=useApp(s=>s.sketchUndo),redo=useApp(s=>s.sketchRedo),ref=useApp(s=>s.skRefGeo),offsets=useApp(s=>s.skDimLabelOff),sources=useApp(s=>s.sketchSources)
  const preview=useApp(s=>s.arrayPreview)
  const session=useApp(s=>s.skPatternSession),pattern=useApp(s=>s.skPatternPreview),patternData=useApp(s=>s.skPatternData)
  const features=useApp(s=>s.features),bindings=useApp(s=>s.paramBindings)
  useLayoutEffect(()=>{void useApp.getState().previewArray()},[mode,tool,cfg,shape,profiles,cons,params,plane,baseZ,arb,sel,move,edit,undo,redo,ref,offsets,sources,session,patternData,features,bindings])
  const candidate=session?pattern:preview
  if(mode!=='sketch'||tool!=='array'||candidate.pending||candidate.error||!candidate.shapes||(session&&!pattern.document))return null
  const fr=arb?arbFrame(arb as {o:V3;xd:V3;n:V3}):null
  const lift:Lift=fr?fr.lift:p=>SK[plane].lift(p,baseZ+.1)
  const els:ReactNode[]=[]
  for(const [i,sh] of candidate.shapes.entries()){
    if(sh.type==='circle'&&sh.point){
      const [x,y]=sh.c
      els.push(<group key={`array${i}`}><Line points={[lift([x-1.8,y-1.8]),lift([x+1.8,y+1.8])]} color="#1aa06b" lineWidth={2}/><Line points={[lift([x-1.8,y+1.8]),lift([x+1.8,y-1.8])]} color="#1aa06b" lineWidth={2}/></group>)
      continue
    }
    const pts=patternOutline(sh,lift)
    if(pts&&pts.length>1)els.push(<Line key={`array${i}`} points={pts} color="#1aa06b" lineWidth={1.4} dashed dashSize={2.5} gapSize={2} />)
  }
  return <group name="sketch-array-preview" renderOrder={41}>{els}</group>
}

// T792：offset / 倒圆角 / 倒角 悬停预览渲染 — 把 store 算好嘅 toolPreview ghost shapes 画成绿虚线（点之前即见结果，正/反/双向/半径）。
export function ToolHoverPreview() {
  const mode = useApp((s) => s.mode)
  const prev = useApp((s) => s.toolPreview)
  const plane = useApp((s) => s.sketchPlane)
  const baseZ = useApp((s) => s.sketchBaseZ)
  const arb = useApp((s) => s.sketchArb)
  if (mode !== 'sketch' || !prev || !prev.length) return null
  const fr = arb ? arbFrame(arb as { o: V3; xd: V3; n: V3 }) : null
  const lift: Lift = fr ? fr.lift : (p) => SK[plane].lift(p, baseZ + 0.14)
  const els: ReactNode[] = []
  prev.forEach((sh, i) => {
    const pts = sh.type === 'rect' ? rectPts(sh.a, sh.b, lift) : sh.type === 'circle' ? circlePts(sh.c, sh.r, lift) : (sh.pts && sh.pts.length ? (sh.open ? sh.pts.map(lift) : [...sh.pts.map(lift), lift(sh.pts[0])]) : null)
    const cut = sh.type === 'poly' && sh._cut   // GM-FP3 #38：修剪「将删段」洋红（Fusion doomed 段），其余（offset/倒角/延伸 结果）绿色
    if (pts) els.push(<Line key={`tp${i}`} points={pts} color={cut ? '#e83e8c' : '#1aa06b'} lineWidth={cut ? 3 : 2.4} dashed dashSize={2.6} gapSize={1.8} />)
  })
  return <group renderOrder={42}>{els}</group>
}

// T796：拖柄 — 锁定目标后渲染橙色圆球喺光标（拖佢调尺寸）+ 由锚点拉出嘅虚线，配合实时预览 + 底栏数值。
export function SizingHandle() {
  const mode = useApp((s) => s.mode)
  const sz = useApp((s) => s.sizing)
  const cursor = useApp((s) => s.sketchPreview)
  const plane = useApp((s) => s.sketchPlane)
  const baseZ = useApp((s) => s.sketchBaseZ)
  const arb = useApp((s) => s.sketchArb)
  if (mode !== 'sketch' || !sz || !cursor) return null
  const fr = arb ? arbFrame(arb as { o: V3; xd: V3; n: V3 }) : null
  const lift: Lift = fr ? fr.lift : (p) => SK[plane].lift(p, baseZ + 0.16)
  return (
    <group renderOrder={43}>
      <Line points={[lift(sz.anchor), lift(cursor)]} color="#ff8c00" lineWidth={1.6} dashed dashSize={3} gapSize={2} />
      <mesh position={lift(sz.anchor)}><sphereGeometry args={[1.3, 10, 10]} /><meshBasicMaterial color="#ff8c00" depthTest={false} /></mesh>
      <mesh position={lift(cursor)}><sphereGeometry args={[2.1, 16, 16]} /><meshBasicMaterial color="#ff8c00" depthTest={false} /></mesh>
    </group>
  )
}

// Shared by the extrude manipulator + its tip dimension label: bbox-centre of the first profile,
// extrusion top z1 and world tip/growth-direction (cardinal planes only, same math as ExtrudePreview).
function extrudeTipFrame(plane: Plane, baseZ: number, h: number, flip: boolean, extent: string, shapes: SketchShape[]) {
  if (!shapes.length || extent === 'through') return null
  const sh = shapes[0]
  const pts: Pt[] = sh.type === 'rect' ? [sh.a, sh.b] : sh.type === 'circle' ? [[sh.c[0] - sh.r, sh.c[1] - sh.r], [sh.c[0] + sh.r, sh.c[1] + sh.r]] : sh.pts
  if (!pts.length) return null
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const c: Pt = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
  const H = Math.max(0.1, Math.abs(h) || 1)
  const down = flip !== (h < 0)
  const RES = plane === 'XZ' ? -1 : 1   // 同 ExtrudePreview：箭头必须指向内核实际行进方向（RES_SIGN,XZ=−1）
  const z0 = extent === 'symmetric' ? baseZ - H / 2 : baseZ
  const z1 = extent === 'symmetric' ? baseZ + H / 2 : baseZ + (down ? -H : H) * RES
  const tip = SK[plane].lift(c, z1)
  const b0 = SK[plane].lift(c, z0)
  const d = new Vector3(tip[0] - b0[0], tip[1] - b0[1], tip[2] - b0[2])
  if (d.lengthSq() < 1e-9) return null
  d.normalize()
  return { tip: new Vector3(...tip), dir: d }
}

// Fusion-style in-canvas extrude manipulator: arrow at the ghost-cage top, drag along the extrude
// axis → live setExtrudeHeight. Drag mapping = project the pixel delta onto the SCREEN-projected
// axis (classic gizmo technique); when the axis points at the camera (top-down sketch view) fall
// back to vertical-drag scaled by mm-per-pixel at the tip. Window listeners during the drag —
// R3F raycast only starts it. stopPropagation keeps the press off the sketch capture plane.
export function ExtrudeArrow() {
  const open = useApp((s) => s.extrudeDlgOpen)
  const shape = useApp((s) => s.sketchShape)
  const profiles = useApp((s) => s.sketchProfiles)
  const plane = useApp((s) => s.sketchPlane)
  const baseZ = useApp((s) => s.sketchBaseZ)
  const arb = useApp((s) => s.sketchArb)
  const h = useApp((s) => s.extrudeHeight)
  const flip = useApp((s) => s.extrudeFlip)
  const extent = useApp((s) => s.extrudeExtent)
  const op = useApp((s) => s.sketchOp)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as unknown as { enabled?: boolean } | null
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])
  const all = [...profiles, ...(shape ? [shape] : [])] as SketchShape[]
  const frame = open && !arb ? extrudeTipFrame(plane, baseZ, h, flip, extent, all) : null
  if (!frame) return null
  const { tip, dir } = frame
  const color = op === 'cut' ? '#ff5a4d' : '#1572c4'
  const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir)
  const conePos = tip.clone().add(dir.clone().multiplyScalar(9))
  const begin = (e: { stopPropagation: () => void; button?: number; clientX?: number; nativeEvent?: PointerEvent }) => {
    if ((e.button ?? 0) !== 0) return
    e.stopPropagation()
    const ev0 = (e.nativeEvent ?? e) as PointerEvent
    const rect = gl.domElement.getBoundingClientRect()
    const toPx = (w: Vector3): [number, number] => { const v = w.clone().project(camera); return [(v.x * 0.5 + 0.5) * rect.width, (-v.y * 0.5 + 0.5) * rect.height] }
    // capture the axis at drag start (the tip moves with the height; a live axis would feed back)
    const a0 = toPx(tip), a1 = toPx(tip.clone().add(dir))
    const ux = a1[0] - a0[0], uy = a1[1] - a0[1]
    const L2 = ux * ux + uy * uy  // (px per mm along axis)²
    // fallback scale for axis-at-camera: mm per pixel at the tip from the perspective frustum
    const cam = camera as unknown as { fov?: number; position: Vector3 }
    const mmPerPx = (2 * cam.position.distanceTo(tip) * Math.tan(((cam.fov || 28) * Math.PI / 180) / 2)) / rect.height
    // use the projected axis only while its sensitivity (1/√L2 mm per px) stays within 4× the
    // screen scale — near-head-on views otherwise hit a multi-mm-per-pixel jitter cliff.
    const useAxis = L2 >= 1 / (16 * mmPerPx * mmPerPx)
    const h0 = useApp.getState().extrudeHeight
    const mag0 = Math.abs(h0) || 1, sgn = h0 < 0 ? -1 : 1
    const k = extent === 'symmetric' ? 2 : 1  // symmetric: tip sits at H/2 → 2× so the cone tracks the cursor 1:1
    const sx = ev0.clientX, sy = ev0.clientY
    // OrbitControls listens on the canvas itself — R3F stopPropagation doesn't reach it. Freeze it for the drag.
    if (controls) controls.enabled = false
    const fin = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', fin); window.removeEventListener('pointercancel', fin)
      if (controls) controls.enabled = true
      gl.domElement.style.cursor = ''
      cleanup.current = null
    }
    const mv = (ev: PointerEvent) => {
      if (!useApp.getState().extrudeDlgOpen) { fin(); return }  // dialog closed mid-drag (Esc) → stop following the mouse
      const dmm = useAxis
        ? ((ev.clientX - sx) * ux + (ev.clientY - sy) * uy) / L2  // px delta projected onto the screen axis → mm
        : (sy - ev.clientY) * mmPerPx                              // degenerate axis → drag up = grow
      // 用户实战 feedback：拖过基准面要似 Fusion 咁直接过零变负（方向即反,鬼影/内核 XOR 同步）,唔使每下撳 ⇅。
      // 唯一唔畀嘅係 |h|≈0（setExtrudeHeight 会当无效重置 40）→ 钳到 ±0.1 继续拖。
      const raw = sgn * (mag0 + k * dmm)
      let v = Math.round(raw * 10) / 10
      if (Math.abs(v) < 0.1) v = raw >= 0 ? 0.1 : -0.1
      useApp.getState().setExtrudeHeight(v)
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', fin)
    window.addEventListener('pointercancel', fin)
    cleanup.current = fin
    gl.domElement.style.cursor = 'grabbing'
  }
  return (
    <group renderOrder={50}>
      <Line points={[[tip.x, tip.y, tip.z], [conePos.x, conePos.y, conePos.z]]} color={color} lineWidth={2.5} depthTest={false} />
      <mesh
        position={conePos} quaternion={quat}
        onPointerDown={begin}
        onPointerOver={() => { gl.domElement.style.cursor = 'grab' }}
        onPointerOut={() => { if (!cleanup.current) gl.domElement.style.cursor = '' }}
      >
        <coneGeometry args={[5, 14, 16]} />
        <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
      </mesh>
    </group>
  )
}

// Ghost preview of the banked loft sections while the loft dialog is open (each profile loop at its Z + connectors).
export function LoftPreview() {
  const open = useApp((s) => s.loftDlgOpen)
  const sections = useApp((s) => s.loftSections)
  const op = useApp((s) => s.sketchOp)
  if (!open || sections.length < 2) return null
  const color = op === 'cut' ? '#ff5a4d' : op === 'intersect' ? '#b07cff' : '#1aa0ff'
  const loopAt = (p: { kind: string; a?: Pt; b?: Pt; c?: Pt; r?: number; pts?: Pt[] }, z: number): V3[] => {
    const lift = (pt: Pt): V3 => SK.XY.lift(pt, z)
    if (p.kind === 'rect' && p.a && p.b) return rectPts(p.a, p.b, lift)
    if (p.kind === 'circle' && p.c && p.r != null) return circlePts(p.c, p.r, lift)
    const pts = p.pts || []
    return pts.length ? [...pts.map(lift), lift(pts[0])] : []
  }
  const loops = sections.map((s) => loopAt(s.profile, s.z))
  const els: ReactNode[] = loops.map((pts, i) => <Line key={'lf' + i} points={pts} color={color} lineWidth={1.8} />)
  // connectors between consecutive sections — a rough rail
  // #62 GM-L2：连接线用【等参比例取点】配对 —— 唔再用同序号 a[j]/b[j]（两截面顶点数唔同时只连到头几个、
  // 其余顶点无连线且方向乱跳，圆↔方过渡预览扭曲）。改为两 loop 各按相同参数比例 t 取点，令圆(33点)对
  // 矩形(5点)嘅过渡都均匀连、预览 sane（等参配对 ≈ ThruSections 线性配对观感，非精确但唔再乱跳）。
  for (let i = 0; i < loops.length - 1; i++) {
    const a = loops[i], b = loops[i + 1]
    if (!a.length || !b.length) continue
    const K = 8
    for (let k = 0; k < K; k++) {
      const t = k / K
      const ai = Math.round(t * (a.length - 1)), bi = Math.round(t * (b.length - 1))
      els.push(<Line key={'lc' + i + '_' + k} points={[a[ai], b[bi]]} color={color} lineWidth={0.9} dashed dashSize={3} gapSize={2} />)
    }
  }
  return <group>{els}</group>
}

// ── Dimension labels (Fusion-style annotations on committed sketch geometry) ──
// drei <Html> portals DOM from inside the R3F reconciler, which is broken under React 19 + R3F 9
// (renders nothing). Instead we split the job: SketchDimProjector (inside <Canvas>) reads the
// camera each frame and writes screen-px transforms imperatively onto plain DOM nodes that
// SketchDimLayer (a normal react-dom component in the viewport HUD) renders. No reconciler mixing.
type DimEdit = { target: number | 'shape'; dim: 'w' | 'h' | 'd' | 'r' | 'ext' | 'con'; value: number; conId?: string; deg?: boolean; radDia?: { type: 'rad' | 'dia'; flip: boolean } }  // 'ext' = extrude distance · 'con' = constraint dim (planegcs)；deg = 角度尺寸（度数，唔做单位换算）；radDia（GM-FP2 #29）= R↔Ø 翻转态：显示值经 radDiaStore 逆变换折返 stored 自然 value
type DimLabel = { referenceExtent?: 'X' | 'Y'; frameAngleDeg?: number; key: string; anchor: [number, number, number]; text: string; expression?: string; edit?: DimEdit; remove?: string; driven?: boolean; name?: string; pxOff?: [number, number] }  // remove = constraint id (badge click deletes it); driven = 从动尺寸（灰显括号）; name = 尺寸稳定名 d1/d2（hover 显示，expr 可引用，S195）; pxOff = GM-W6 C3/C4 投影后固定屏幕像素偏移（C3 标签移离几何、C4 同锚徽章横向分列）
const DIM_REG: { labels: DimLabel[]; els: Map<string, HTMLElement> } = { labels: [], els: new Map() }
const dimFmt = (v: number) => v.toFixed(v % 1 ? 1 : 0)
// T794：长度标签按显示单位换算（mm 用紧凑 dimFmt；inch/cm 用 toLenInput）。角度/纯数照旧。
const dimFmtU = (v: number, unit: LenUnit) => (unit === 'mm' ? dimFmt(v) : toLenInput(v, unit))

function buildDimLabels(plane: Plane, baseZ: number, profiles: SketchShape[], shape: SketchShape | null, unit: LenUnit, constraints: SkCon[], liftFn?: (p: Pt) => [number, number, number]): DimLabel[] {
  const lift = liftFn ?? ((p: Pt): [number, number, number] => SK[plane].lift(p, baseZ))  // T746 批2：斜面（arb）传入自己嘅 lift
  const out: DimLabel[] = []
  const add = (sh: SketchShape, k: string, target: number | 'shape') => {
    if (sh.construction) return   // 用户实战 bug：构造几何（cline ±10000 等）唔出自动尺寸标签 —— Fusion 参考线无 auto dim,净系整乱画面
    // T740：快速标签全部移离几何（Fusion 式）——标签 div 食 click，压住圆心/边中点会抢咗
    // D 工具同选择工具嘅拾取（用户报：点唔到圆心 → 建唔成 圆↔边 尺寸）。
    // GM-W6 C3：锚点坐返几何上，偏移改喺投影后加【固定屏幕像素】（pxOff）——原本偏 7 世界 mm，缩细时 7mm<1px
    // 即贴返圆心/边中点抢拾取；屏幕像素偏移无论缩放都稳定离开几何。
    if (sh.type === 'rect') {
      const [a0, a1] = sh.a, [b0, b1] = sh.b
      const ylo = Math.min(a1, b1), xlo = Math.min(a0, b0)
      if (!constraints.some(c=>c.kind==='dim'&&!c.driven&&c.type==='len'&&c.a.kind==='edge'&&c.a.shape===(target==='shape'?profiles.length:target)&&c.a.idx%2===0)) out.push({ key: k + 'w', anchor: lift([(a0 + b0) / 2, ylo]), pxOff: [0, 18], text: dimFmtU(Math.abs(b0 - a0), unit), edit: { target, dim: 'w', value: Math.abs(b0 - a0) } })
      if (!constraints.some(c=>c.kind==='dim'&&!c.driven&&c.type==='len'&&c.a.kind==='edge'&&c.a.shape===(target==='shape'?profiles.length:target)&&c.a.idx%2===1)) out.push({ key: k + 'h', anchor: lift([xlo, (a1 + b1) / 2]), pxOff: [-22, 0], text: dimFmtU(Math.abs(b1 - a1), unit), edit: { target, dim: 'h', value: Math.abs(b1 - a1) } })
    } else if (sh.type === 'circle') {
      if (constraints.some(c => c.kind === 'dim' && !c.driven && (c.type === 'dia' || c.type === 'rad') && c.a.kind === 'circle' && c.a.shape === (target === 'shape' ? profiles.length : target))) return
      if (sh.point) return  // 草图点（r=0 构造点）唔出 Ø 标签 — 中心要畀人点
      // Ø 标签喺圆外 45°（Fusion 同款）— 圆心留返畀拾取
      out.push({ key: k + 'd', anchor: lift([sh.c[0] + sh.r * Math.SQRT1_2, sh.c[1] + sh.r * Math.SQRT1_2]), pxOff: [16, -16], text: 'Ø' + dimFmtU(sh.r * 2, unit), edit: { target, dim: 'd', value: sh.r * 2 } })
    } else if (sh.arc) {
      const cc = circumcircle(sh.arc.a, sh.arc.b, sh.arc.m)
      if (cc) out.push({ key: k + 'r', anchor: lift(sh.arc.m), pxOff: [14, -16], text: 'R' + dimFmtU(cc.r, unit), edit: { target, dim: 'r', value: cc.r } })
    } else if (sh.pts.length) {
      const index=target==='shape'?profiles.length:target
      if(constraints.some(c=>c.kind==='dim'&&!c.driven&&(c.type==='hdist'||c.type==='vdist')&&c.frameAngleDeg!==undefined&&[c.a,c.b].some(r=>r&&'shape'in r&&r.shape===index)))return
      const framedExtent=constraints.some(c=>c.kind==='con'&&(c.type==='h'||c.type==='v')&&c.frameAngleDeg!==undefined&&Math.abs(c.frameAngleDeg%180)>1e-8&&c.a.kind==='edge'&&c.a.shape===index)&&constraints.some(c=>c.kind==='dim'&&!c.driven&&['len','hdist','vdist'].includes(c.type)&&[c.a,c.b].some(r=>r&&'shape'in r&&r.shape===index))
      const xs = sh.pts.map((p) => p[0]), ys = sh.pts.map((p) => p[1])
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
      // A bounding-box width/height cannot be a driving dimension for a true
      // arc/ellipse/spline: non-uniform scaling would silently destroy its
      // defining curve parameters.  Keep it visible as a Fusion-style
      // reference reading; use the proper radius/constraint tools to drive it.
      // BOT-A01 (v1.14): when a driving len/hdist/vdist already owns an axis, do not
      // emit an editable soft bbox dim on that axis — dual labels (soft 120 + con 255)
      // made QA edit the soft path, which scaled geometry but left skCons stale so
      // reopen resolveSk restored 255.
      const shapesArr = [...profiles, ...(shape ? [shape] : [])] as FShape[]
      const coversAxis = (axis: 'w' | 'h') => constraints.some((c) => {
        if (c.kind !== 'dim' || c.driven) return false
        if (c.type === 'hdist') return axis === 'w' && [c.a, c.b].some((r) => r && 'shape' in r && r.shape === index)
        if (c.type === 'vdist') return axis === 'h' && [c.a, c.b].some((r) => r && 'shape' in r && r.shape === index)
        if (c.type === 'len' && c.a.kind === 'edge' && c.a.shape === index) {
          const pts = refPts(shapesArr, c.a)
          if (pts.length < 2) return false
          const dx = Math.abs(pts[1][0] - pts[0][0]), dy = Math.abs(pts[1][1] - pts[0][1])
          return axis === 'w' ? dx >= dy : dy >= dx
        }
        return false
      })
      const referenceOnly = framedExtent || !!(sh.arc || sh.ell || sh.earc || sh.smooth || sh.conic)
      if (!coversAxis('w')) out.push({ key: k + 'w', anchor: lift([(x0 + x1) / 2, y0]), pxOff: [0, 18], ...(framedExtent?{referenceExtent:'X' as const}:{}), text: referenceOnly ? `${framedExtent?'ΔX ':''}(${dimFmtU(x1 - x0, unit)})` : dimFmtU(x1 - x0, unit), ...(referenceOnly ? { driven: true } : { edit: { target, dim: 'w' as const, value: x1 - x0 } }) })
      if (!coversAxis('h')) out.push({ key: k + 'h', anchor: lift([x0, (y0 + y1) / 2]), pxOff: [-22, 0], ...(framedExtent?{referenceExtent:'Y' as const}:{}), text: referenceOnly ? `${framedExtent?'ΔY ':''}(${dimFmtU(y1 - y0, unit)})` : dimFmtU(y1 - y0, unit), ...(referenceOnly ? { driven: true } : { edit: { target, dim: 'h' as const, value: y1 - y0 } }) })
    }
  }
  profiles.forEach((sh, i) => add(sh, 'p' + i, i))
  if (shape) add(shape, 's', 'shape')
  return out
}

// Inside <Canvas>: project each label anchor to screen pixels every frame; no DOM created here.
export function SketchDimProjector() {
  const profiles = useApp(s => s.sketchProfiles)
  const shape = useApp(s => s.sketchShape)
  const plane = useApp(s => s.sketchPlane)
  const baseZ = useApp(s => s.sketchBaseZ)
  const arb = useApp(s => s.sketchArb)
  const geometryAnchors = useMemo(() => {
    const lift = arb ? arbFrame(arb as { o: V3; xd: V3; n: V3 }).lift : (p: Pt) => SK[plane].lift(p, baseZ)
    const points: Pt[] = [[0,0]]
    for (const sh of [...profiles, ...(shape ? [shape] : [])]) {
      if (sh.type === 'circle') { points.push(sh.c); if (!sh.point) for (const a of [0, Math.PI/2, Math.PI, Math.PI*1.5]) points.push([sh.c[0]+sh.r*Math.cos(a),sh.c[1]+sh.r*Math.sin(a)]); continue }
      if (sh.type === 'poly' && (sh.ell || sh.earc)) {
        const all = [...profiles,...(shape?[shape]:[])], index = all.indexOf(sh)
        const semantic = ([0,1,2] as const).map(idx => refPts(all, { kind: 'ellipse-point', shape: index, idx })[0]).filter((p): p is Pt => !!p)
        points.push(...semantic)
        if (sh.earc) for(const idx of [0,1] as const) { const endpoint=refPts(all,{kind:'ellipse-arc-end',shape:index,idx})[0]; if(endpoint) points.push(endpoint) }
        if (semantic.length===3) for (const endpoint of semantic.slice(1)) points.push([(semantic[0][0]+endpoint[0])/2,(semantic[0][1]+endpoint[1])/2])
        continue
      }
      if (sh.type === 'poly' && sh.arc) { points.push(sh.arc.a,sh.arc.b,sh.arc.m); continue }
      const ps: Pt[] = sh.type === 'rect' ? [sh.a,[sh.b[0],sh.a[1]],sh.b,[sh.a[0],sh.b[1]]] : sh.ctrl ?? sh.verts ?? sh.pts
      points.push(...ps)
      for (let j=0;j<(sh.type === 'poly' && sh.open ? ps.length-1 : ps.length);j++) { const a=ps[j],b=ps[(j+1)%ps.length]; if (a && b) points.push([(a[0]+b[0])/2,(a[1]+b[1])/2]) }
    }
    return points.map(lift)
  }, [profiles, shape, plane, baseZ, arb])
  const mode = useApp((s) => s.mode)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const controls = useThree((s) => s.controls) as unknown as { target?: { x: number; y: number; z: number } } | null
  const v = useRef(new Vector3()).current
  useFrame(() => {
    if (mode !== 'sketch') return
    // Screen-space snap: mm-per-pixel at the sketch plane → ~10px snap radius (Fusion-like).
    const cam = camera as unknown as { isPerspectiveCamera?: boolean; fov?: number; position: Vector3 }
    if (cam.isPerspectiveCamera && controls?.target) {
      const dist = cam.position.distanceTo(controls.target as unknown as Vector3)
      const visH = 2 * dist * Math.tan(((cam.fov || 28) * Math.PI / 180) / 2)
      if (visH > 0 && size.height > 0) setSnapScale(visH / size.height)
    }
    // GM-W6 C3/C4：投影后先加【固定屏幕像素偏移】pxOff（C3 移离几何、C4 同锚徽章横向分列），
    // 再【贪心去重叠】——后来者若压住前者矩形，逐 14px 向下推（最多 4 级）。矩形宽按 11px 字体 ~7px/字估。
    const placed: { x: number; y: number; w: number; h: number }[] = []
    const obstacles = geometryAnchors.flatMap(p => {
      v.set(...p).project(camera)
      return v.z >= -1 && v.z <= 1 ? [{ x:(v.x*.5+.5)*size.width,y:(-v.y*.5+.5)*size.height,w:14,h:14 }] : []
    })
    for (const l of DIM_REG.labels) {
      const el = DIM_REG.els.get(l.key)
      if (!el) continue
      v.set(l.anchor[0], l.anchor[1], l.anchor[2]).project(camera)
      const behind = v.z > 1 || v.z < -1
      let x = (v.x * 0.5 + 0.5) * size.width + (l.pxOff ? l.pxOff[0] : 0)
      let y = (-v.y * 0.5 + 0.5) * size.height + (l.pxOff ? l.pxOff[1] : 0)
      if (!behind) {
        const box = placeDimensionLabel({ x, y, w: el.offsetWidth, h: el.offsetHeight }, placed, size.width, size.height, obstacles)
        x = box.x; y = box.y
        placed.push(box)
      }
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`
      el.style.opacity = behind ? '0' : '1'
    }
  })
  return null
}

// In the HUD (plain react-dom, outside <Canvas>): render one div per dimension label.
// Recomputes only when the geometry changes; positions are driven imperatively by the projector.
export function SketchDimLayer() {
  const patternCandidate = useApp(hasPatternCandidate)
  const modelingCommandActive = useApp(activeModelCommand)
  const lang = useApp((s) => s.lang)
  const mode = useApp((s) => s.mode)
  const profiles = useApp((s) => s.sketchProfiles)
  const shape = useApp((s) => s.sketchShape)
  const plane = useApp((s) => s.sketchPlane)
  const baseZ = useApp((s) => s.sketchBaseZ)
  const arb = useApp((s) => s.sketchArb)
  const exOpen = useApp((s) => s.extrudeDlgOpen)
  const exH = useApp((s) => s.extrudeHeight)
  const exFlip = useApp((s) => s.extrudeFlip)
  const exExtent = useApp((s) => s.extrudeExtent)
  const skCons = useApp((s) => s.skCons)
  const skAnnot = useApp((s) => s.skView.annot)   // 标注（尺寸）显示开关
  const skConsVis = useApp((s) => s.skView.cons)   // GM-FP4 #5：约束徽章独立显示开关（Fusion Dimensions/Constraints 分开 gate）
  const skDimLabelOff = useApp((s) => s.skDimLabelOff)   // GM-FP4 #31：尺寸标签拖动重定位偏移（按 conId）
  const unit = useApp((s) => s.unit)   // T794：单位感知尺寸（显示 + 输入解析）
  const dimPreview=useApp(s=>s.skDimPreview)
  const dxfLabels = useApp((s) => (s.skEditTarget && s.sketchSources[s.skEditTarget]?.labels) || null)
  const [editing, setEditing] = useState<string | null>(null)
  const editingLabel=useRef<DimLabel|null>(null)
  const labels = useMemo(() => {
    if (mode !== 'sketch') return []
    const candidate=dimPreview.shapes&&dimPreview.cons&&!dimPreview.pending&&!dimPreview.error?dimPreview:null
    const drawnProfiles=candidate?candidate.shapes!.slice(0,profiles.length):profiles
    const drawnShape=candidate?(shape?candidate.shapes![profiles.length]??null:null):shape
    const drawnCons=candidate?candidate.cons!:skCons
    // T746 批2（GAP6 修复）：斜面重开都有尺寸标签/约束徽章 — 用 arbFrame.lift 替平面 lift
    const fr = arb ? arbFrame(arb as { o: V3; xd: V3; n: V3 }) : null
    const lift: (p: Pt) => [number, number, number] = fr ? fr.lift : (p) => SK[plane].lift(p, baseZ)
    const out = skAnnot ? buildDimLabels(plane, baseZ, drawnProfiles, drawnShape, unit, drawnCons, fr ? fr.lift : undefined) : []
    // Constraint dims (D tool) → editable blue labels; constraint glyphs (∥/⊥/＝/…) → tiny badges (click = remove).
    const CON_GLYPH: Record<string, string> = { h: '━', v: '┃', coincident: '◉', parallel: '∥', perp: '⊥', equal: '＝', tangent: '⌒', fix: '⚓', midpoint: '⊹', concentric: '◎', collinear: '≣', symmetric: '⇆' }
    const shapesArr = [...drawnProfiles, ...(drawnShape ? [drawnShape] : [])] as FShape[]
    const badgeGroup = new Map<string, number>()   // GM-W6 C4：同锚徽章分组计数 → 组内逐个横向分列
    // GM-FP4 #5：尺寸(dim)由 annot gate、约束徽章(con)由 cons gate —— 两者独立（Fusion Dimensions/Constraints 分开）。
    if (skAnnot || skConsVis) for (const c of drawnCons) {
      if (c.kind === 'dim') {
        if (!skAnnot) continue
        // 标签锚点同尺寸线同源（dimGfx）→ 标签正好坐喺尺寸线上（T731）；冇 gfx 时退回旧中点逻辑
        const g = dimGfx(shapesArr, c)
        const a0 = refMid(shapesArr, c.a)
        const m = c.b ? refMid(shapesArr, c.b) : a0
        const anchor = lift(g ? g.label : (c.b ? [(a0[0] + m[0]) / 2, (a0[1] + m[1]) / 2] : a0))
        // 从动尺寸：实时量度值 + 括号 + 灰显（Fusion reference dim 惯例）；右键标签切换从动/驱动
        const val = c.driven ? (measureDim(shapesArr, c) ?? c.value) : c.value
        const isAngle = c.type === 'angle'
        // GM-FP2 #29：R↔Ø 显示翻转 — rad/dia 尺寸按 radDiaFlip 定 prefix + 显示值（×2/÷2）；编辑时 radDia 令逆变换折返
        const rd = (c.type === 'rad' || c.type === 'dia') ? radDiaDisplay(c.type, val, c.radDiaFlip) : null
        const shownVal = rd ? rd.value : val
        const body = (rd ? rd.prefix : c.type === 'arclen' ? '⌒' : '') + (isAngle ? dimFmt(val) : dimFmtU(shownVal, unit)) + (isAngle ? '°' : '')
        // ƒx 参数绑定尺寸（T746 批3）：显示「ƒx名=值」；点开输入数字=解绑、输入参数名=改绑
        const expression = c.expr || c.param
        const txt = expression ? `ƒx ${body}` : c.driven ? `(${body})` : body
        const dOff = skDimLabelOff[c.id]   // GM-FP4 #31：拖动重定位偏移（屏幕像素）
        out.push({ key: c.id, frameAngleDeg: (c as SkCon & {frameAngleDeg?:number}).frameAngleDeg, anchor, text: txt, expression, driven: c.driven, name: c.name, ...(dOff ? { pxOff: dOff } : {}), edit: { target: 'shape', dim: 'con', value: Math.round(shownVal * 100) / 100, conId: c.id, deg: isAngle, ...(rd ? { radDia: { type: c.type as 'rad' | 'dia', flip: !!c.radDiaFlip } } : {}) } })
      } else {
        if (!skConsVis) continue
        const m = refMid(shapesArr, c.a)
        // GM-W6 C4：同一实体上多个约束徽章原本全叠喺 refMid(c.a) 同一点（下面嗰个㩒唔到 → 一㩒就删错约束）。
        // 按锚点分组，组内第 n 个徽章加 18px×n 横向屏幕偏移（用 pxOff，同 C3 一样投影后加）→ 逐个分开可点。
        // 用 18px（>徽章估宽 ~17px）令 C3 去重叠唔会再向下叠 → 保持一行横排（Fusion 徽章串）。
        const gk = `${Math.round(m[0] * 4)},${Math.round(m[1] * 4)}`
        const gi = badgeGroup.get(gk) ?? 0
        badgeGroup.set(gk, gi + 1)
        const frame=(c as SkCon & {frameAngleDeg?:number}).frameAngleDeg,local=frame!==undefined&&Math.abs(frame%180)>1e-8
        out.push({ key: c.id, frameAngleDeg:frame, anchor: lift([m[0], m[1]]), text: local&&(c.type==='h'||c.type==='v')?(c.type==='h'?'H′':'V′'):CON_GLYPH[c.type] ?? '·', remove: c.id, pxOff: c.a.kind === 'center' || c.a.kind === 'pt' || c.a.kind === 'origin' || c.a.kind === 'refpt' ? [18 * (gi + 1), -18] : [18 * gi, 0] })
      }
    }
    // Extrude-manipulator tip textbox (Fusion ghost+arrow+inline-distance triad): label at the arrow
    // tip, click → type the exact distance. Same anchor math as ExtrudeArrow.
    if (exOpen && !arb) {  // 拉伸操纵杆 tip 标签：extrudeTipFrame 系 cardinal 面几何 — arb 面跳过
      const all = [...profiles, ...(shape ? [shape] : [])] as SketchShape[]
      const tf = extrudeTipFrame(plane, baseZ, exH, exFlip, exExtent, all)
      if (tf) {
        const a = tf.tip.clone().add(tf.dir.clone().multiplyScalar(22))
        out.push({ key: 'exh', anchor: [a.x, a.y, a.z], text: dimFmtU(Math.abs(exH) || 1, unit) + (unit === 'inch' ? 'in' : unit), edit: { target: 'shape', dim: 'ext', value: Math.abs(exH) || 1 } })
      }
    }
    // v1.21/v1.35：DXF TEXT/MTEXT 导入标注（重开草图可见；model 保留全部；HUD 显示封顶防 DOM OOM）
    if (skAnnot && dxfLabels && dxfLabels.length) {
      const nShow = Math.min(dxfLabels.length, DXF_LABEL_DISPLAY_CAP)
      for (let i = 0; i < nShow; i++) {
        const L = dxfLabels[i]
        out.push({ key: `dxfTxt${i}`, anchor: lift(L.at), text: L.text, driven: true, pxOff: [8, -14] })
      }
      if (dxfLabels.length > nShow) {
        const L0 = dxfLabels[0]
        out.push({ key: 'dxfTxtMore', anchor: lift(L0.at), text: `…+${dxfLabels.length - nShow} 标注`, driven: true, pxOff: [8, 6] })
      }
    }
    const positioned=out.map(label=>editing===label.key&&editingLabel.current?.key===label.key?editingLabel.current:label)
    return modelingCommandActive ? positioned.filter((label) => label.edit?.dim === 'ext') : positioned
  }, [mode, plane, baseZ, profiles, shape, arb, exOpen, exH, exFlip, exExtent, skCons, unit, skAnnot, skConsVis, skDimLabelOff, modelingCommandActive,dimPreview,editing, dxfLabels])
  const setDim = useApp((s) => s.setSketchDimValue)
  const skConflictIds = useApp((s) => s.skConflictIds)   // S194：冲突约束逐个红标
  const skSelCon = useApp((s) => s.skSelCon)   // GM-FP3 #35：当前选中约束（点徽章=选中，Delete 删）
  const [val, setVal] = useState('')
  const valRef = useRef(val)
  valRef.current = val
  const [inputError,setInputError]=useState<string|null>(null)
  const dimEditorEpoch=useRef(0)
  const dimEditorScope=useRef<{key:string;mode:string;tool:string}|null>(null)
  const dimInputRequest=useRef(0)
  const invalidDimDraft=useRef(false)
  const cancelDimension=()=>{++dimEditorEpoch.current;dimEditorScope.current=null;++dimInputRequest.current;useApp.getState().cancelSkDimEdit();setEditing(null);setInputError(null);invalidDimDraft.current=false}
  // UI02: Esc cancels only the open dimension editor (topmost layer), never the sketch/doc.
  useEscapeLayer(!!editing, cancelDimension, 500)
  const previewDimension=async(e:DimEdit,text:string)=>{
    if(!e.conId)return false
    const request=++dimInputRequest.current,state=useApp.getState(),con=state.skCons.find(c=>c.id===e.conId&&c.kind==='dim')
    if(!con||con.kind!=='dim'){setInputError('尺寸已改变，请重新打开');return false}
    const result=parseDimensionEditInput({con,raw:text,unit:state.unit,radDia:e.radDia,params:state.params,cons:state.skCons,evaluate:evalExpr})
    if(!result.ok){state.cancelSkDimEdit();invalidDimDraft.current=true;setInputError(illegalRejectStatus(result.error));useApp.setState({status:illegalRejectStatus(result.error)});return false}
    if(invalidDimDraft.current){state.beginSkDimEdit(e.conId);invalidDimDraft.current=false}
    if(useApp.getState().skDimPreview.id!==e.conId){setInputError('草图已改变，请重新打开尺寸');return false}
    setInputError(null)
    await useApp.getState().previewSkDimEdit(result.patch)
    return request===dimInputRequest.current&&useApp.getState().skDimPreview.id===e.conId&&!useApp.getState().skDimPreview.pending&&!useApp.getState().skDimPreview.error&&!!useApp.getState().skDimPreview.shapes
  }
  const initialValue = useRef('')
  const beginEdit = (label: DimLabel) => {
    if (!label.edit) return
    ++dimEditorEpoch.current;++dimInputRequest.current;useApp.getState().cancelSkDimEdit()
    dimEditorScope.current={key:label.key,mode:useApp.getState().mode,tool:useApp.getState().sketchTool}
    const next = label.expression ?? (label.edit.deg ? String(label.edit.value) : toLenInput(label.edit.value, unit))
    initialValue.current = next
    editingLabel.current={...label,anchor:[...label.anchor],...(label.pxOff?{pxOff:[...label.pxOff]}:{})}
    setVal(next); setEditing(label.key);setInputError(null);invalidDimDraft.current=false
    if(label.edit?.dim==='con'&&label.edit.conId){useApp.getState().beginSkDimEdit(label.edit.conId);void previewDimension(label.edit,next)}
  }
  // GM-FP2 #29：尺寸标签右键上下文菜单（Fusion marking-menu 简版）— 切 R↔Ø（弧/圆）· 转从动/驱动 · 删除。
  const [dimMenu, setDimMenu] = useState<{ conId: string; x: number; y: number; driven: boolean; radDia?: { type: 'rad' | 'dia'; flip: boolean } } | null>(null)
  // GM-FP4 #31：尺寸标签拖动重定位 —— pointerdown 记起点+当前偏移；移动 >3px = 拖（live 更新偏移，leader 跟随）；未拖=当 click 改值。
  const labelDragRef = useRef<{ conId: string; sx: number; sy: number; base: [number, number]; moved: boolean } | null>(null)
  const onLabelDown = (e: React.PointerEvent, conId: string) => {
    if (e.button !== 0) return
    const b = useApp.getState().skDimLabelOff[conId] || [0, 0]
    labelDragRef.current = { conId, sx: e.clientX, sy: e.clientY, base: [b[0], b[1]], moved: false }
    const move = (ev: PointerEvent) => {
      const d = labelDragRef.current; if (!d) return
      const dx = ev.clientX - d.sx, dy = ev.clientY - d.sy
      if (!d.moved && Math.hypot(dx, dy) < 3) return
      d.moved = true
      useApp.getState().setSkDimLabelOff(d.conId, [d.base[0] + dx, d.base[1] + dy])
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  // click 前守卫：啱啱拖完 → 唔好误开编辑框（消费一次 moved 标志）。
  const consumedDrag = () => { if (labelDragRef.current?.moved) { labelDragRef.current = null; return true } labelDragRef.current = null; return false }
  // GM-W6 F3：标尺寸工具啱放低一个尺寸 → store 出 skDimEditReq(conId)，呢度即刻开返对应标签嘅输入框（同点标签一样嘅编辑流），用户即打数值。ESC/留空 = 保留量度值。
  // A dimension may be created on pointerdown. Opening an autofocus input
  // immediately lets the following native mousedown blur and close it again.
  // Wait for that actual pointer release; keyboard requests open immediately.
  const dimPointerHeld = useRef(false)
  useEffect(() => {
    const down = () => { dimPointerHeld.current = true }
    const up = () => { dimPointerHeld.current = false }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointerup', up, true)
    document.addEventListener('pointercancel', up, true)
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', up, true) }
  }, [])
  const skDimEditReq = useApp((s) => s.skDimEditReq)
  const dimensionRequestTool = useApp((s) => s.sketchTool)
  useEffect(()=>()=>{++dimEditorEpoch.current;++dimInputRequest.current;dimEditorScope.current=null;useApp.getState().cancelSkDimEdit()},[])
  useLayoutEffect(()=>{
    const scope=dimEditorScope.current
    if(scope&&(scope.mode!==mode||scope.tool!==dimensionRequestTool||!labels.some(l=>l.key===scope.key)||patternCandidate))cancelDimension()
  },[mode,dimensionRequestTool,labels,patternCandidate])
  const dimensionRequestScope = useRef<{id:string;tool:string}|null>(null)
  useEffect(() => {
    if (!skDimEditReq) return
    if (dimensionRequestScope.current?.id !== skDimEditReq) dimensionRequestScope.current = {id:skDimEditReq,tool:dimensionRequestTool}
    let cancelled = false
    const open = () => {
      if (cancelled || useApp.getState().skDimEditReq !== skDimEditReq) return
      const current = useApp.getState()
      if(current.mode !== 'sketch' || current.sketchTool !== dimensionRequestScope.current?.tool) { current.setSkDimEditReq(null); return }
      const l = labels.find((x) => x.edit?.conId === skDimEditReq)
      if (l && l.edit) beginEdit(l)
      useApp.getState().setSkDimEditReq(null)
    }
    const release = () => { queueMicrotask(open) }
    const cancel = () => { if (useApp.getState().skDimEditReq === skDimEditReq) useApp.getState().setSkDimEditReq(null) }
    const escape = (event: KeyboardEvent) => { if(event.key === 'Escape') cancel() }
    document.addEventListener('keydown', escape, true)
    if (dimPointerHeld.current) {
      document.addEventListener('pointerup', release, { once: true })
      document.addEventListener('pointercancel', cancel, { once: true })
    } else open()
    return () => { cancelled = true; document.removeEventListener('pointerup', release); document.removeEventListener('pointercancel', cancel); document.removeEventListener('keydown', escape, true) }
  }, [skDimEditReq, labels, unit, mode, dimensionRequestTool])
  DIM_REG.labels = labels
  if (mode !== 'sketch' || patternCandidate || labels.length === 0) { DIM_REG.els.clear(); if (editing) setEditing(null); return null }
  const reg = (key: string) => (el: HTMLElement | null) => { if (el) DIM_REG.els.set(key, el); else DIM_REG.els.delete(key) }
  const commit = async (e: DimEdit, fromBlur = false) => {
    if(e.dim==='con'&&e.conId){
      const editorEpoch=dimEditorEpoch.current
      const draft = valRef.current
      // BOT-A01: blur/Enter/✓ all commit the live draft (Fusion-style). Skipping blur left 120→100
      // unapplied so Finish Sketch rebuilt the feature from the old constraint value.
      if(draft===initialValue.current){cancelDimension();return}
      if(!await previewDimension(e,draft)||editorEpoch!==dimEditorEpoch.current){
        if(fromBlur) cancelDimension()
        return
      }
      const inputRequest=dimInputRequest.current
      await useApp.getState().confirmSkDimEdit()
      // applyDimCandidate writes skCons/undo and bumps dimEditEpoch via the store middleware —
      // close when the preview session ends regardless of epoch (BUG-017 / BUG-008).
      const preview=useApp.getState().skDimPreview
      if(inputRequest===dimInputRequest.current&&!preview.id&&!preview.pending){dimEditorScope.current=null;setEditing(null);setInputError(null);invalidDimDraft.current=false}
      return
    }
    const draft = valRef.current
    if (draft === initialValue.current) { setEditing(null); return }
    // ƒx 绑定（T746 批3）：约束尺寸输入「参数名」或「=参数名」→ 绑定用户参数（改参数即全树联动）
    const raw = draft.trim()
    const body = raw.replace(/^=/, '').trim()
    const isPureLen = /^[\d.\s/]+(?:mm|cm|in|")?$/i.test(body)   // 数字/分数/带单位 = 唔系公式
    // S97：尺寸标签输入 — 纯数值/分数/带单位 → 照旧数值；纯参数名 → 绑参数；含运算符/函数嘅公式 → 绑表达式
    // S194（Fusion 同款）：任何尺寸框食【纯算术表达式】— 10*2+5 → 25、(30-4)/2 → 13（无参数名一次性求值）。
    // 纯数字/分数（1/2、1 1/2）行先照旧 parseLen（保分数英寸语义）；有字母行咗上面 param/expr 路径。
    const arith = (!isPureLen && /^[\d.\s+\-*/()^%]+$/.test(body) && /[+\-*/^%(]/.test(body.slice(1)))
      ? evalExpr(body, new Map()) : null
    // T794：长度用 parseLen（当前单位 + 分数英寸 "1/4"/"1 1/2" + 后缀 mm/in/"）；角度照旧 parseFloat（度）
    const u = useApp.getState().unit
    const v = e.deg
      ? (arith != null && isFinite(arith) ? arith : parseFloat(draft))
      : parseLen(arith != null && isFinite(arith) ? String(arith) : draft, u)
    // 'ext' keeps the current height's SIGN (negative = reverse direction) — the label shows |h|.
    if (v != null && isFinite(v) && v > 0) {
      if (e.dim === 'ext') { const cur = useApp.getState().extrudeHeight; useApp.getState().setExtrudeHeight((cur < 0 ? -1 : 1) * v) }
      // GM-FP2 #29：R↔Ø 翻转态下用户打嘅系【显示值】→ radDiaStore 折返 stored 自然 value 先入 editSkDim
      else if(e.dim!=='con')setDim(e.target, e.dim, v)
    } else if (draft.trim() !== '' && draft !== initialValue.current) {
      // BOT-A02: soft/bbox label rejects (≤0) must surface the same status toast as constraint dims
      useApp.setState({ status: illegalRejectStatus('尺寸必须为有限正数') })
      setInputError(illegalRejectStatus('尺寸必须为有限正数'))
    }
    setEditing(null)
  }
  const LBL = { position: 'absolute' as const, maxWidth: 'calc(100% - 8px)', boxSizing: 'border-box' as const, left: 0, top: 0, transform: 'translate(-200px,-200px)', background: '#1572c4', color: '#fff', fontSize: 11, lineHeight: '15px', padding: '0 5px', borderRadius: 3, fontWeight: 600, whiteSpace: 'nowrap' as const, boxShadow: '0 1px 3px rgba(0,0,0,.3)' }
  return (
    <div className="sketch-dim-layer" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 6 }}>
      {labels.map((l) => editing === l.key && l.edit
        ? (
          // GM-FP4 #32：编辑框旁 ⋮ 显示尺寸参数名（d1/d2…）— 提示佢系命名参数，可喺其它尺寸公式引用（如 d1*2）。
          <div key={l.key} ref={reg(l.key)} style={{ ...LBL, background: '#fff', color: '#0d4f8c', border: '1px solid #0d4f8c', padding: '1px 3px', display: 'inline-flex', flexWrap: 'wrap', minWidth: 0, alignItems: 'center', gap: 2, pointerEvents: 'auto' }}>
            <input
              autoFocus value={val} aria-label={tStatus('尺寸数值', lang)}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => {setVal(e.target.value);if(l.edit?.dim==='con')void previewDimension(l.edit,e.target.value)}}
              onBlur={() => {void commit(l.edit!, true)}}
              onKeyDown={(e) => { e.stopPropagation(); if (e.nativeEvent.isComposing || e.keyCode === 229) return; if (e.key === 'Enter') void commit(l.edit!); else if (e.key === 'Escape') {e.preventDefault();cancelDimension()} }}
              style={{ width: l.expression ? 168 : 64, minWidth: 40, maxWidth: '100%', padding: 0, textAlign: 'center', border: 'none', outline: 'none', background: 'transparent', color: '#0d4f8c', fontWeight: 600, fontSize: 11 }}
            />
            {l.edit.dim==='con'&&<>
              <button aria-label="Confirm dimension" disabled={!!inputError||dimPreview.pending||!!dimPreview.error||!dimPreview.shapes} onMouseDown={e=>e.preventDefault()} onClick={()=>void commit(l.edit!)}>✓</button>
              <button aria-label="Cancel dimension" onMouseDown={e=>e.preventDefault()} onClick={cancelDimension}>✕</button>
              {(inputError||dimPreview.error||dimPreview.pending)&&<span role={inputError||dimPreview.error?'alert':'status'} style={{maxWidth:220,minWidth:0,overflowWrap:'anywhere',whiteSpace:'normal',fontSize:11,color:'#b42318'}}>{inputError||dimPreview.error||(lang==='en'?'Checking preview…':'正在校验预览…')}</span>}
            </>}
            {l.edit.dim === 'con' && l.name && (
              <span
                title={tStatus(`参数名 ${l.name} · Dimension Value —— 可喺其它尺寸公式引用（如 ${l.name}*2）`, lang)}
                onMouseDown={(e) => e.preventDefault()}
                style={{ fontSize: 9, color: '#6b7884', borderLeft: '1px solid #cdd8e0', paddingLeft: 2, cursor: 'default', userSelect: 'none' }}
              >⋮{l.name}</span>
            )}
          </div>
        ) : (
          <div
            key={l.key} data-reference-extent={l.referenceExtent} data-dim={l.text} data-dimension-id={l.edit?.conId} data-constraint-id={l.remove} data-frame-angle={l.frameAngleDeg} data-auto-dimension-shape={l.edit&&l.edit.dim!=='con'?String(l.edit.target):undefined} data-dim-role={l.driven || l.referenceExtent ? 'driven' : l.edit?.dim === 'con' ? 'driving' : l.edit ? 'soft' : undefined} data-dim-driving={l.edit?.dim === 'con' && !l.driven ? 'true' : undefined} className={l.driven || l.referenceExtent ? 'sk-dim-driven' : l.edit?.dim === 'con' ? 'sk-dim-driving' : l.edit ? 'sk-dim-soft' : undefined} ref={reg(l.key)}
            title={[l.referenceExtent?(lang==='en'?`Sketch ${l.referenceExtent} extent (reference); edit the actual local dimensions`:`草图 ${l.referenceExtent} 范围（参考）；请编辑实际局部尺寸`):'',l.frameAngleDeg===undefined?'':(lang==='en'?`Local sketch frame ${dimFmt(l.frameAngleDeg)}°`:`局部草图方向 ${dimFmt(l.frameAngleDeg)}°`), (l.remove || l.edit?.conId) && skConflictIds.includes((l.remove || l.edit?.conId)!) ? tStatus('⚠ 冲突约束 — 点击移除以解开过约束', lang) : l.edit && l.edit.dim === 'con' ? ((l.name ? `${l.name} = ` : '') + (l.expression ? `${l.expression} → ${l.text} · ` : `${l.text} · `) + (l.driven ? tStatus('从动尺寸（量度值）— 点击改值即转驱动 · 右键菜单（转驱动/R↔Ø/删除） · ✕删除', lang) : tStatus('点击修改尺寸 · 输入公式可引用其他尺寸（如 d1*2） · 右键菜单（转从动/R↔Ø/删除） · ✕删除', lang))) : l.edit ? tStatus('点击修改尺寸', lang) : l.remove ? tStatus('约束（点击选中 → Delete 移除）', lang) : undefined].filter(Boolean).join(' · ')||undefined}
            onPointerDown={l.edit?.dim === 'con' && l.edit.conId ? (e) => onLabelDown(e, l.edit!.conId!) : undefined}
            onClick={
              // 用户实战 feedback：冲突（红色）尺寸 tooltip 一直话「点击移除」但旧行为系开编辑框 → 令用户「揀唔到又删唔到」。
              // 而家红色尺寸 click = 直接移除（兑现承诺,解过约束）；普通尺寸照旧 click=改值,删除用旁边 ✕。
              // GM-FP3 #35：约束徽章 click = 选中该约束（高亮 partner + Delete 删），唔再一撳即删；冲突（红）徽章仍 click=移除（兑现承诺）。
              // GM-FP4 #31：啱啱拖完标签（重定位）→ 唔好误开编辑框（consumedDrag 守卫）。
              l.edit?.conId && skConflictIds.includes(l.edit.conId) ? () => { if (consumedDrag()) return; useApp.getState().removeSkCon(l.edit!.conId!) }
                : l.edit ? () => { if (consumedDrag()) return; beginEdit(l) }
                  : l.remove ? () => { if (skConflictIds.includes(l.remove!)) useApp.getState().removeSkCon(l.remove!); else useApp.getState().selectSkCon(l.remove!) } : undefined
            }
            onContextMenu={l.edit?.dim === 'con' && l.edit.conId ? (e) => { e.preventDefault(); e.stopPropagation(); setDimMenu({ conId: l.edit!.conId!, x: e.clientX, y: e.clientY, driven: !!l.driven, radDia: l.edit!.radDia }) } : undefined}
            style={{ ...LBL, ...(l.remove ? { background: '#5a8fb8', fontSize: 10, lineHeight: '13px', padding: '0 4px' } : {}), ...(l.driven ? { background: '#8a97a2' } : {}), ...(l.remove && skSelCon === l.remove ? { background: '#8e44ad', boxShadow: '0 0 0 2px rgba(142,68,173,.4)' } : {}), ...((l.remove || l.edit?.conId) && skConflictIds.includes((l.remove || l.edit?.conId)!) ? { background: '#c9362a', boxShadow: '0 0 0 2px rgba(201,54,42,.35)' } : {}), pointerEvents: l.edit || l.remove || l.referenceExtent ? 'auto' : 'none', cursor: l.edit?.dim === 'con' ? 'move' : l.edit || l.remove ? 'pointer' : 'default' }}
          >
            {l.edit?.dim === 'con' && !l.driven ? <span className="sk-dim-driving-mark" title="驱动尺寸" aria-label="驱动尺寸">◆</span> : null}
            {l.edit && l.edit.dim !== 'con' && !l.driven ? <span className="sk-dim-soft-mark" title="软尺寸／参考读数" aria-label="软尺寸">·</span> : null}
            {l.text}
            {/* 尺寸约束专属 ✕ 仔：一撳即删（stopPropagation 免误开编辑框）。徽章本身 click=移除,唔使 ✕。 */}
            {l.edit?.dim === 'con' && l.edit.conId && (
              <span
                title={tStatus('删除呢个尺寸', lang)}
                onClick={(e) => { e.stopPropagation(); useApp.getState().removeSkCon(l.edit!.conId!) }}
                style={{ marginLeft: 4, padding: '0 2px', opacity: 0.72, cursor: 'pointer', fontWeight: 700 }}
                onPointerEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                onPointerLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.72' }}
              >✕</span>
            )}
          </div>
        ))}
      {/* GM-FP2 #29：尺寸右键上下文菜单（R↔Ø / 转从动·驱动 / 删除）。全屏遮罩点击关闭。 */}
      {dimMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40, pointerEvents: 'auto' }} onClick={() => setDimMenu(null)} onContextMenu={(e) => { e.preventDefault(); setDimMenu(null) }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'fixed', left: Math.min(dimMenu.x, window.innerWidth - 190), top: Math.min(dimMenu.y, window.innerHeight - 140), background: '#fff', border: '1px solid #c8d0d8', borderRadius: 8, boxShadow: '0 8px 28px rgba(0,0,0,.24)', padding: 4, minWidth: 176, fontSize: 12.5, color: '#233' }}
          >
            {dimMenu.radDia && (
              <button className="dim-menu-item" style={DIM_MENU_ITEM} onClick={() => { useApp.getState().toggleSkDimRadDia(dimMenu.conId); setDimMenu(null) }}>
                {dimMenu.radDia.type === 'rad' ? (dimMenu.radDia.flip ? tStatus('显示为半径 R', lang) : tStatus('显示为直径 Ø', lang)) : (dimMenu.radDia.flip ? tStatus('显示为直径 Ø', lang) : tStatus('显示为半径 R', lang))}
              </button>
            )}
            <button className="dim-menu-item" style={DIM_MENU_ITEM} onClick={() => { useApp.getState().toggleSkDimDriven(dimMenu.conId); setDimMenu(null) }}>
              {dimMenu.driven ? tStatus('转为驱动尺寸', lang) : tStatus('转为从动（参考）尺寸', lang)}
            </button>
            <button className="dim-menu-item" style={{ ...DIM_MENU_ITEM, color: '#c9362a' }} onClick={() => { useApp.getState().removeSkCon(dimMenu.conId); setDimMenu(null) }}>
              {tStatus('删除尺寸', lang)}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
const DIM_MENU_ITEM: CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', background: 'transparent', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12.5 }

// Frames the current body when the user requests "fit to view".
export function FitView() {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as
    | { target: { set: (x: number, y: number, z: number) => void }; update: () => void }
    | null
  const fitNonce = useApp((s) => s.fitNonce)
  const fitTargetId = useApp((s) => s.fitTargetId)
  const fitBBox = useApp((s) => s.fitBBox)   // P2 Inspect：干涉行 🔍 — 框到任意 three-world bbox
  const lastBBoxNonce = useRef(0)   // review MED：bbox 框系一次性 — 只响 nonce bump 嗰下框，bodyMesh/components 后续变化唔好再拉镜头返旧盒
  const bodyMesh = useApp((s) => s.bodyMesh)
  const components = useApp((s) => s.components)
  useEffect(() => {
    const frameSphere = (cx: number, cy: number, cz: number, r: number) => {
      const pc = camera as unknown as { isPerspectiveCamera?: boolean; fov: number; aspect: number; zoom: number }
      const distance = pc.isPerspectiveCamera ? fitCameraDistance(r, pc.fov, pc.aspect, pc.zoom) : r * 4.6
      camera.position.copy(new Vector3(0.7, 0.7, 0.9).normalize().multiplyScalar(distance).add(new Vector3(cx, cy, cz)))
    }
    if (fitNonce === 0 || !controls || useApp.getState().mode === 'sketch') return
    // P2 Inspect：显式 bbox 请求（requestFitBBox）→ 直接框佢，唔行组件扫描
    if (fitBBox) {
      if (fitNonce === lastBBoxNonce.current) return   // 已消费过呢次 bump（effect 因 deps 重跑）→ 唔好重框 stale 盒
      lastBBoxNonce.current = fitNonce
      const [mnB, mxB] = [fitBBox.min, fitBBox.max]
      if (mnB.every(Number.isFinite) && mxB.every(Number.isFinite)) {
        const cx = (mnB[0] + mxB[0]) / 2, cy = (mnB[1] + mxB[1]) / 2, cz = (mnB[2] + mxB[2]) / 2
        const r = Math.max(0.5 * Math.hypot(mxB[0] - mnB[0], mxB[1] - mnB[1], mxB[2] - mnB[2]), 3)
        frameSphere(cx, cy, cz, r)
        const oc = camera as unknown as { isOrthographicCamera?: boolean; left: number; right: number; top: number; bottom: number; zoom: number; updateProjectionMatrix: () => void }
        if (oc.isOrthographicCamera) { const fr = Math.min(oc.right - oc.left, oc.top - oc.bottom) / 2; if (fr > 0) { oc.zoom = fr / (r * 1.15); oc.updateProjectionMatrix() } }
        controls.target.set(cx, cy, cz)
        controls.update()
      }
      return
    }
    // Each visible part contributes its mesh, offset by its component position
    // (three-world). Active body has no offset. Hidden components are ignored.
    // When fitTargetId is set (focus-on-component), frame ONLY that component.
    const tgt = fitTargetId ? components.find((c) => c.id === fitTargetId) : null
    const parts: { mesh: MeshData; off: [number, number, number] }[] = tgt
      ? [{ mesh: tgt.mesh, off: tgt.pos }]
      : [
          ...components.filter((c) => !c.hidden).map((c) => ({ mesh: c.mesh, off: c.pos })),
          ...(bodyMesh ? [{ mesh: bodyMesh, off: [0, 0, 0] as [number, number, number] }] : []),
        ]
    if (!parts.length) return
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (const { mesh, off } of parts) {
      const v = mesh.vertices
      for (let i = 0; i < v.length; i += 3) {
        const tx = v[i] + off[0], ty = v[i + 2] + off[1], tz = -v[i + 1] + off[2]
        if (tx < minX) minX = tx
        if (tx > maxX) maxX = tx
        if (ty < minY) minY = ty
        if (ty > maxY) maxY = ty
        if (tz < minZ) minZ = tz
        if (tz > maxZ) maxZ = tz
      }
    }
    // Guard: if every part was empty (e.g. a failed op cut away all material → 0-vertex body), the bbox
    // stays ±Infinity → cx/r become NaN/Infinity → camera flies to NaN (unrecoverable). Bail instead.
    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2
    // bounding-sphere radius (half the diagonal) so the diagonal never gets cropped, + margin
    const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ
    const r = Math.max(0.5 * Math.hypot(dx, dy, dz), 8)
    frameSphere(cx, cy, cz, r)
    // S193：正交相机靠 zoom 取景（唔系靠距离）。drei OrthographicCamera 默认 frustum = 画布像素 → zoom = 半最小边/(r·裕度)。
    const oc = camera as unknown as { isOrthographicCamera?: boolean; left: number; right: number; top: number; bottom: number; zoom: number; updateProjectionMatrix: () => void }
    if (oc.isOrthographicCamera) { const fr = Math.min(oc.right - oc.left, oc.top - oc.bottom) / 2; if (fr > 0 && r > 0) { oc.zoom = fr / (r * 1.15); oc.updateProjectionMatrix() } }
    controls.target.set(cx, cy, cz)
    controls.update()
  }, [fitNonce, fitTargetId, fitBBox, controls, bodyMesh, components, camera])
  return null
}

// Standard views (front/top/right/iso): repositions the camera on viewNonce change.
export function ViewRig() {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as
    | { target: { set: (x: number, y: number, z: number) => void }; update: () => void }
    | null
  const lastViewNonce = useRef(0)
  const viewNonce = useApp((s) => s.viewNonce)
  const view = useApp((s) => s.view)
  const bodyMesh = useApp((s) => s.bodyMesh)
  const components = useApp((s) => s.components)
  const fourBar = useApp((s) => s.fourBar)
  useEffect(() => {
    if (viewNonce === 0 || !controls) return
    if (useApp.getState().mode === 'sketch' && lastViewNonce.current === viewNonce) return
    lastViewNonce.current = viewNonce
    // GM-W8 β2-#49：镜 FitView 嘅 {mesh, off=pos, !hidden} 累加 —— 计各组件摆位、跳过隐藏件（旧版用裸 mesh → 装配取景框歪）
    const parts: { mesh: MeshData; off: [number, number, number] }[] = [
      ...components.filter((c) => !c.hidden).map((c) => ({ mesh: c.mesh, off: c.pos })),
      ...(bodyMesh ? [{ mesh: bodyMesh, off: [0, 0, 0] as [number, number, number] }] : []),
    ]
    let cx = 0, cy = 20, cz = 0, r = 100
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    let has = false
    for (const { mesh, off } of parts) {
      const v = mesh.vertices
      for (let i = 0; i < v.length; i += 3) {
        const tx = v[i] + off[0], ty = v[i + 2] + off[1], tz = -v[i + 1] + off[2]
        if (tx < minX) minX = tx; if (tx > maxX) maxX = tx
        if (ty < minY) minY = ty; if (ty > maxY) maxY = ty
        if (tz < minZ) minZ = tz; if (tz > maxZ) maxZ = tz
        has = true
      }
    }
    // Frame the closed-loop 4-bar too: B stays on the crank circle (centre A, r=|AB0|) and C on the
    // rocker circle (centre D, r=|DC0|), so the union of those two discs exactly bounds the motion.
    // FourBarView places the linkage at three coords [x, y-15, 0] — match that here.
    if (fourBar) {
      const fb = fourBar
      const rC = Math.hypot(fb.B0[0] - fb.A[0], fb.B0[1] - fb.A[1])
      const rR = Math.hypot(fb.C0[0] - fb.D[0], fb.C0[1] - fb.D[1])
      const cand: [number, number][] = [
        [fb.A[0] - rC, fb.A[1] - rC], [fb.A[0] + rC, fb.A[1] + rC],
        [fb.D[0] - rR, fb.D[1] - rR], [fb.D[0] + rR, fb.D[1] + rR],
      ]
      for (const [x, y] of cand) {
        const tx = x, ty = y - 15, tz = 0
        if (tx < minX) minX = tx; if (tx > maxX) maxX = tx
        if (ty < minY) minY = ty; if (ty > maxY) maxY = ty
        if (tz < minZ) minZ = tz; if (tz > maxZ) maxZ = tz
        has = true
      }
    }
    if (has) {
      cx = (minX + maxX) / 2; cy = (minY + maxY) / 2; cz = (minZ + maxZ) / 2
      r = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 20) * 0.5
    }
    const d = r * 3.2
    const p = view === 'top' ? [cx + 0.01, cy + d, cz]
      : view === 'bottom' ? [cx + 0.01, cy - d, cz]   // #174-2：底视（望 +Y）
        : view === 'front' ? [cx, cy, cz + d]
          : view === 'back' ? [cx, cy, cz - d]         // #174-2：后视（望 +Z）
            : view === 'right' ? [cx + d, cy, cz]
              : view === 'left' ? [cx - d, cy, cz]     // #174-2：左视（望 +X）
                : [cx + d * 0.7, cy + d * 0.7, cz + d * 0.9]
    camera.position.set(p[0], p[1], p[2])
    // GM-W8 β2-#48：正交模式冇距离概念 → 靠 zoom 取景（同 FitView S193 / CameraRig 7.2：半帧 / (半径·1.15)）
    const oc = camera as unknown as { isOrthographicCamera?: boolean; left: number; right: number; top: number; bottom: number; zoom: number; updateProjectionMatrix: () => void }
    if (oc.isOrthographicCamera) { const fr = Math.min(oc.right - oc.left, oc.top - oc.bottom) / 2; if (fr > 0 && r > 0) { oc.zoom = fr / (r * 1.15); oc.updateProjectionMatrix() } }
    controls.target.set(cx, cy, cz)
    controls.update()
    // GM-X2 #2：透视带正交面（perspOrtho）—— 撳标准视图临时吸正交。setCameraOrtho 令 ortho 相机 makeDefault，
    // camera 变 → 本 effect 依赖 camera 会再跑一次，用上面 isOrthographicCamera 分支正交取景（自纠正）。用户手动 orbit → OrbitControls onStart 退返透视。
    const ap = useApp.getState()
    if (ap.cameraProj === 'perspOrtho' && !ap.cameraOrtho && ap.mode !== 'sketch') ap.setCameraOrtho(true)
  }, [viewNonce, controls, camera])
  return null
}

// 相机书签 BookmarkRig（视图书签 / Named Views，Fusion 同款）：
//  · 暴露 window.__captureView() → 读当前 camera.position + controls.target（相机唔喺 store，工具栏「存当前视图」靠呢个攞）。
//  · 订 bookmarkApplyNonce：bump 时读 pendingBookmarkApply 写返相机（行 ViewRig camera.position.set + controls.target.set + update idiom）。
export function BookmarkRig() {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as
    | { target: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void }; update: () => void }
    | null
  const nonce = useApp((s) => s.bookmarkApplyNonce)
  // 每帧保最新 camera/controls 喺 ref（capture helper 调用时读 ref → 永远当前，唔依赖 effect 依赖数组时序）。
  const liveRef = useRef<{ camera: typeof camera; controls: typeof controls }>({ camera, controls })
  liveRef.current.camera = camera; liveRef.current.controls = controls
  // 暴露捕捉 helper（工具栏 save 按钮读当前相机；controls 在则用其 target，否则退回 0,0,0）。
  // 挂载即装、唔喺 cleanup delete（StrictMode/HMR re-run 唔会令 helper 消失；多 rig 实例亦只覆盖为最新）。
  useEffect(() => {
    ;(window as unknown as { __captureView?: () => import('../cad/viewBookmark').ViewCapture }).__captureView = () => {
      const c = liveRef.current.camera, ctl = liveRef.current.controls
      return { pos: [c.position.x, c.position.y, c.position.z], target: ctl ? [ctl.target.x, ctl.target.y, ctl.target.z] : [0, 0, 0], up: [c.up.x, c.up.y, c.up.z], zoom: c.zoom, projection: (c as import('three').OrthographicCamera).isOrthographicCamera ? 'ortho' : 'persp' }
    }
  }, [])
  // nonce bump → 套用 pendingBookmarkApply（pos/target）。
  useEffect(() => {
    if (nonce === 0 || !controls) return
    const p = useApp.getState().pendingBookmarkApply
    if (!p) return
    if (p.projection && ((camera as import('three').OrthographicCamera).isOrthographicCamera === true) !== (p.projection === 'ortho')) return
    if (p.up) camera.up.set(...p.up)
    if (p.zoom) { camera.zoom = p.zoom; camera.updateProjectionMatrix() }
    camera.position.set(p.pos[0], p.pos[1], p.pos[2])
    controls.target.set(p.target[0], p.target[1], p.target[2])
    controls.update()
  }, [nonce, controls, camera])
  return null
}
