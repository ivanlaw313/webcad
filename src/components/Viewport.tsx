import { useMemo, useState, useRef, useEffect, Fragment, lazy, Suspense, type ReactNode, type CSSProperties } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { PMREMGenerator } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'   // T783：HDRI 渲染（three 内置，离线可用，MIT）
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'   // S193：环境光遮蔽（GTAO，three 内置，无新 dep）
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js'   // P2 Render：贴花（three 内置，无新 dep）
import GcodeBackplot from './GcodeBackplot'   // T790：刀路回放预览（激光 + CNC 共用）
import { Grid, GizmoHelper, GizmoViewcube, OrbitControls, OrthographicCamera, Edges, Line, TransformControls, ContactShadows, MeshReflectorMaterial, Html } from '@react-three/drei'
import { wheelZoomFactor } from '../cad/wheelZoom'
import { brepEdgePositions } from '../cad/brepEdges'
import { cad } from '../cad/cadService'
import { chamferAngleFromDrag, chamferDistanceFromDrag, filletRadiusFromDrag } from '../cad/chamferDrag'
import { computeGridConfig, VISUAL_STYLES, VISUAL_STYLE_LABELS } from '../cad/viewModel'   // GM-X2 #4/#1
import { selPicksComp, selPicksBody, selAllowsType, resolvePickHits, pickableWithCmdOverride, inspectWantEdge, pointInPolygon, polygonBBox, isDefaultSelFilter, SEL_TYPES } from '../cad/selectionModel'   // GM-X4 #13/#14/#15/#17：拾取谓词 + 逐类型 gate + 命令覆盖 + 优先级 tie-break + 穿透命中解析 + 套索多边形命中
import { decalBox, flipUVArray } from '../cad/insertModel'   // GM-X3 #5：Decal 投影盒 w/h + UV 翻转
import { LEN_PER_MM, LEN_SUFFIX, UNIT_PRESETS, type LenU, type MassU } from '../cad/unitPresets'   // GM-X2 #4/#13
import { MOUSE, TOUCH, BufferGeometry, Float32BufferAttribute, Plane, DoubleSide, NoColorSpace, Euler, WebGLRenderer, WebGLRenderTarget, TextureLoader, RepeatWrapping, Vector3, Vector2, Raycaster, Object3D, Color, Quaternion, Matrix4, ArrowHelper, ACESFilmicToneMapping, NoToneMapping, PCFShadowMap, Mesh, GreaterDepth, type Texture, type Scene, type Camera, type InstancedMesh } from 'three'
// 拾取开关用「具体函数」两态切换：启用 = 真 Mesh.raycast，禁用 = 空函数。
// 关键修复：旧版 `raycast={pickable?undefined:()=>null}` —— R3F 由 ()=>null 切返 undefined 时唔会 reset 返默认 raycast，
// 令实体一旦经过草图模式（pickable=false）就永远拣唔到（量度/拣面/拣边/模流浇口 全部失灵）。两态都用具体函数即无此问题。
const MESH_RAYCAST = Mesh.prototype.raycast
const NULL_RAYCAST: typeof MESH_RAYCAST = () => {}

// `pts` are CAD-local (Z-up).  Convert through the rendered occurrence matrix so
// shared definitions, component transforms, and assembly FK all pick the same edge.
function nearestSavedBrepLine(edges: import('../assembly/occurrence').BrepEdge[], hit: Vector3, world: Matrix4) {
  let best: { a: Vector3; b: Vector3 } | null = null
  let bestD2 = Infinity
  for (const edge of edges) {
    if (!/line/i.test(edge.kind) || edge.pts.length < 2) continue
    for (let i = 1; i < edge.pts.length; i++) {
      const pa = edge.pts[i - 1], pb = edge.pts[i]
      const a = new Vector3(pa[0], pa[2], -pa[1]).applyMatrix4(world)
      const b = new Vector3(pb[0], pb[2], -pb[1]).applyMatrix4(world)
      const ab = b.clone().sub(a), len2 = ab.lengthSq()
      if (len2 < 1e-12) continue
      const t = Math.max(0, Math.min(1, hit.clone().sub(a).dot(ab) / len2))
      const d2 = hit.distanceToSquared(a.clone().addScaledVector(ab, t))
      if (d2 < bestD2) { bestD2 = d2; best = { a, b } }
    }
  }
  return best
}

// S192：自订图片贴图加载（data-URL → THREE.Texture，缓存 + RepeatWrapping 俾三平面投影平铺）。
const _imgTexCache = new Map<string, Texture>()
function loadImageTexture(url: string): Texture {
  let t = _imgTexCache.get(url)
  if (!t) { t = new TextureLoader().load(url); t.wrapS = t.wrapT = RepeatWrapping; _imgTexCache.set(url, t) }
  return t
}
// P2 Render：法线贴图加载 — 关键：NoColorSpace（线性）！法线数据唔系颜色，行 sRGB 解码会烂晒光照
const _nrmTexCache = new Map<string, Texture>()
function loadNormalTexture(url: string): Texture {
  let t = _nrmTexCache.get(url)
  if (!t) { t = new TextureLoader().load(url); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = NoColorSpace; _nrmTexCache.set(url, t) }
  return t
}
import { detectFace, nearSharpEdge } from '../geom/faceDetect'
import { cutFaceGeom } from '../geom/sectionCap'   // S186：剖面盖切面三角抽取（切面上色）
import type { GearTrainPlan } from '../cad/gears'   // T770：齿轮箱向导按需预览（避免普通建模首屏载入齿轮搜索）
import { ToolIcon } from '../icons'
import { useApp, meshCenter3, MATERIALS, fmtVol, fmtArea, fmtLen, projName, compWorldMatrix, buildGroupFK, moldTargetMesh, PRINT_BEDS, bedFit, coplanarFaceTris, faceGroupTris, faceIdAt, datumVisKey, setGeoSnapAlt, screwSpec, THREAD_STDS, inchLabel, DATUM_CMD_METHODS, DATUM_CMD_ACC } from '../store'
import { visibleDefinitionBodies, type ComponentDef } from '../assembly/occurrence'
import { cadPointToThree, formBoxRectCadCorners, makePlacedBoxCage, type FormBoxDraft, type FormBoxPlane } from '../cad/formBox'
import { PaintedFacesView } from './PaintedFacesView'   // S102[3]：逐面外观覆盖层
import { DraftOverlay } from './DraftOverlay'            // S118：拔模分析逐面着色覆盖层
import { SlopeOverlay } from './SlopeOverlay'            // S187：斜度分析逐面着色覆盖层
import { AccessOverlay } from './AccessOverlay'          // #174-7：脱模可达性逐三角着色覆盖层
import { MeasureSnapMarkers } from './MeasureSnapMarkers'   // #174-6：测量捕捉点标记
import { JointGizmo, JointOriginView } from './JointGizmo'               // S102[5]：关节 DOF/限位 3D 操纵器；GM-3DV4 A1：关节原点标记
import { explodeStepOffsets, type ExplodeStep as ExplodeStepT } from '../assembly/asmUtil'   // GM-3DV4 A12：有序爆炸步 offset
import { PathTraceLayer } from './PathTraceLayer'       // S105：画布内路径追踪
import { HdriEnvironment } from './HdriEnvironment'     // S109：HDRI 环境
import ComponentGumball from './ComponentGumball'       // S113：平移+旋转操纵杆（取代 translate-only gizmo）
import MoveBodyGizmo from './MoveBodyGizmo'
import WindSmoke from './WindSmoke'                      // S2 · P0：GPU 烟流（真风洞烟流质感；旧流线/箭头保留）
import WindLegend from './WindLegend'                    // 流场图例（色标 → m/s、白点解释）
import WindStreaks from './WindStreaks'                  // S3：烟耙条带流线（ribbon streaklines — 真风洞白烟带质感）
import WindPoseCompare from './WindPoseCompare'          // S4：唔同朝向阻力对比卡（★ 只出比值/Δ%，绝对 Cd 未校正 ★）
// ★ lazy ★ 呢两个拉住 shaders.ts(54KB GLSL 生成器) + lbmGpu + voxelfea —— 唔好入初始 bundle
const WindTunnelGpuLazy = lazy(() => import('./WindTunnelGpu'))
const WindObjectGizmoLazy = lazy(() => import('./WindObjectGizmo'))
import { computeMassProps } from '../cad/massProps'      // S117：主惯性矩 + 回转半径（Fusion 物理属性）
import { orientedBBox } from '../cad/obb'                // S121：定向最小包围盒（料块/排版/省料）
import { HDRI_PRESETS, type HdriPresetId } from '../render/hdriPresets'
import { GradientEquirectTexture } from 'three-gpu-pathtracer'   // 工作模式背景预设：程序化渐变 equirect（同 HdriEnvironment GradientFallback 一致）
import { tStatus } from '../i18n'
import { parseLen, toLenInput, type LenUnit } from '../io/units'   // T794：单位感知长度输入（分数英寸）
import type { MeshData } from '../worker/cad.worker'
import { computeFK, solve4Bar, solveSliderCrank, solveSixBar } from '../assembly/kinematics'
import { getProcTexture } from '../render/procTextures'   // S101[8]：程序化纹理（三平面投影）
import { meshManifold } from '../geom/meshCheck'
import { buildFaceGroupColors } from '../cad/faceGroupColors'   // GM-X1 #16：逐网格面组循环上色
// GM-X1 #16：面组上色调色板（同 store COMP_PALETTE 精神一致，此处独立以免跨模块耦合）
const FG_PALETTE = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4d4', '#f032e6', '#bf9000', '#469990', '#9a6324']
import { pathArea, bulgeRadius } from '../sketch/sketchOps'
import { CameraRig, SketchSurface, SketchDraw, SkSelDraw, MirrorPickDraw, MarqueeDraw, MoveGizmoDraw, ArrayPreview, ToolHoverPreview, SizingHandle, CommittedSketches, CanvasImageLayer, ExtrudePreview, RevolvePreview, RevolveAngleHandle, RegionPickLayer, ExtrudeArrow, LoftPreview, FitView, ViewRig, BookmarkRig, SketchDimProjector, SketchDimLayer, HolePreview, FaceOffsetGhost, MoveScaleGhost, CoilPreview, SweepPreview } from './SketchLayer'
import { SketchToolPanel } from './SketchToolPanel'
import { useDraggable } from './useDraggable'            // GM-W6 A4：草图工具条可拖移（同 AI ✦ / 🩺诊断 钮共用 hook）
import MarkingMenu, { type MMItem } from './MarkingMenu'
import { CommandDialog, SelectionChip } from './CommandDialog'
import { MATERIAL_MECH } from '../analysis/beamStress'

// Curvature fields can be expensive on dense meshes and are only relevant to
// Inspect. Keep them out of the normal modelling startup path; React will fetch
// this chunk the first time a curvature/min-radius inspection is requested.
const CurvatureAnalysisOverlays = lazy(() => import('./CurvatureOverlay').then((m) => ({
  default: () => <><m.CurvatureOverlay /><m.CurvatureCombOverlay /><m.MinRadiusMarker /></>,
})))
import { GATE_TYPES, type GateType } from '../analysis/gateTypes'   // 浇口类型谱（轻模块）
// GM-W8 β3：模流 Stage-2 热耦合 per-material 缺省熔体/模壁温度 °C（对齐 moldsolve MOLD_CROSS 嘅 tMelt/tMold；此处硬编码免 import 求解器模块入主 bundle — 同 gateTypes 抽轻模块同一理由）。留空输入 → store null → 求解器用材料缺省。
const MOLD_MAT_TEMP: Record<string, { melt: number; mold: number }> = {
  ABS: { melt: 230, mold: 60 }, PP: { melt: 230, mold: 40 }, PC: { melt: 300, mold: 90 },
  PA6: { melt: 260, mold: 80 }, POM: { melt: 205, mold: 90 }, PMMA: { melt: 240, mold: 60 }, TPU: { melt: 210, mold: 40 },
}

// 工作模式背景预设（render-appearance-viz）：把 scene.background 设为程序化渐变 equirect / 纯色，
// 唔依赖 render-mode / HDRI（render-mode 路径喺 HdriEnvironment/PathTraceLayer 各自设 background）。
// save/set/restore 完全 clone HdriEnvironment 嘅 GradientFallback idiom（HdriEnvironment.tsx:178-192）。
// bgPreset==='' → 唔挂呢个组件（透明，旧行为字节一致）。GradientEquirectTexture 视口同 path tracer 都食得。
type BgGrad = { top: number; bottom: number; exponent: number }
const BG_GRADIENTS: Record<string, BgGrad> = {
  coolgrey: { top: 0xeef1f5, bottom: 0x424954, exponent: 1.5 },   // 冷灰棚：天顶冷白 → 地面暗灰（默认工作室）
  warmstudio: { top: 0xf6efe3, bottom: 0x4a3f34, exponent: 1.4 }, // 暖棚：暖白 → 暖褐
  blueprint: { top: 0x123a6b, bottom: 0x05101f, exponent: 1.2 },  // 蓝图：上浅蓝 → 下深蓝
  whitesweep: { top: 0xffffff, bottom: 0xd6dde4, exponent: 2.0 }, // 白扫光：近全白柔和扫光（产品图）
}
const BG_SOLID: Record<string, number> = { solid: 0x2b2f36 }      // 纯色：中性深灰
function BgPreset({ preset }: { preset: string }) {
  const { scene } = useThree() as unknown as { scene: { background: unknown; environment: unknown } }
  // 渐变 → GradientEquirectTexture；纯色 → Color。preset 唔识 → null（no-op）。
  const bg = useMemo(() => {
    const g = BG_GRADIENTS[preset]
    if (g) { const t = new GradientEquirectTexture(256); t.topColor.set(g.top); t.bottomColor.set(g.bottom); t.exponent = g.exponent; t.update(); return { kind: 'tex' as const, tex: t } }
    if (BG_SOLID[preset] !== undefined) return { kind: 'color' as const, color: new Color(BG_SOLID[preset]) }
    return null
  }, [preset])
  useEffect(() => {
    if (!bg) return
    const savedBg = scene.background
    scene.background = bg.kind === 'tex' ? bg.tex : bg.color
    return () => {
      scene.background = savedBg
      if (bg.kind === 'tex') { try { bg.tex.dispose() } catch { /* ignore */ } }
    }
  }, [scene, bg])
  return null
}

// T770（S49）：齿轮箱向导即时预览 — 齿数组合建议（纯函数，参数一改即重算）
function GearboxPreview({ ratio, m, stages }: { ratio: number; m: number; stages: number }) {
  const valid = Number.isFinite(ratio) && ratio >= 1 && m > 0
  const [plan, setPlan] = useState<GearTrainPlan | null>(null)
  useEffect(() => {
    let current = true
    if (!valid) { setPlan(null); return () => { current = false } }
    void import('../cad/gears').then(({ suggestGearTrain }) => {
      if (!current) return
      try { setPlan(suggestGearTrain(Math.min(10000, ratio), m, { stages: stages || undefined })) } catch { setPlan(null) }
    }).catch(() => { if (current) setPlan(null) })
    return () => { current = false }
  }, [ratio, m, stages])
  if (!valid) return <span style={{ fontSize: 11, color: '#c60' }}>输入目标速比 ≥1</span>
  if (!plan) return <span style={{ fontSize: 11, color: '#6b7680' }}>正在计算齿数组合…</span>
  return (
    <span style={{ fontSize: 11, color: '#1572c4' }} title={`中心距：${plan.cds.map((c) => c.toFixed(1)).join(' / ')} mm · 直排总跨 ≈${plan.totalWidth.toFixed(0)}mm`}>
      建议 {plan.stages.map((st) => `${st.zIn}:${st.zOut}`).join(' × ')} = {plan.achieved.toFixed(3)}（误差 {plan.errPct.toFixed(2)}%）
    </span>
  )
}

// T768（S47）：钣金规则（Fusion Sheet Metal Rules）— 材料 → 厚度/折弯R/K 因子一表（折弯R 惯例 ≈ 板厚，K 按材料延展性）
const SM_RULES: Record<string, { t: number; r: number; k: number }> = {
  '钢 1.0mm': { t: 1, r: 1, k: 0.44 },
  '钢 1.5mm': { t: 1.5, r: 1.5, k: 0.44 },
  '钢 2.0mm': { t: 2, r: 2, k: 0.44 },
  '不锈钢 1.2mm': { t: 1.2, r: 1.8, k: 0.45 },
  '铝 1.5mm': { t: 1.5, r: 1.5, k: 0.40 },
  '铝 2.0mm': { t: 2, r: 2, k: 0.40 },
  '铝 3.0mm': { t: 3, r: 3, k: 0.40 },
  '黄铜 1.0mm': { t: 1, r: 1, k: 0.42 },
}

// P2 audit / GM-3DV1 S11：螺纹规格下拉（othread/ithread 共用）— 按【标准库】拣规格自动填 公称Ø+螺距；手改数字即「自定义」。
// std = THREAD_STDS key（iso / unc …）。UNC/UNF 用英制尺寸（mm）、螺距=25.4/tpi；几何仍 60° ISO 牙形（近似）。
function ThreadSpecSelect({ d, pitch, std, onPick, lang }: { d: number; pitch: number; std: string; onPick: (d: number, p: number) => void; lang: 'zh' | 'en' }) {
  const T = THREAD_STDS[std] ?? THREAD_STDS.iso
  const fmt = (n: number) => T.inch ? (inchLabel[n] ?? `${n}mm`) : `M${n}`
  const hit = T.noms.find((n) => n === d && (T.coarse[n] === pitch || T.fine[n] === pitch))
  return (
    <label title={tStatus('规格表：拣规格自动填公称Ø+螺距（粗牙默认；「细」=细牙）；手改数字即变自定义', lang)}>{tStatus('规格', lang)} <select
      value={hit ? `${d}x${pitch}` : 'custom'}
      onChange={(e) => { const val = e.target.value; if (val === 'custom') return; const [dd, pp] = val.split('x').map(Number); onPick(dd, pp) }}
      style={{ height: 26, maxWidth: 128 }}>
      <option value="custom">{tStatus('自定义', lang)}</option>
      {T.noms.map((n) => <option key={'c' + n} value={`${n}x${T.coarse[n]}`}>{fmt(n)}×{T.coarse[n]}</option>)}
      {T.noms.filter((n) => T.fine[n]).map((n) => <option key={'f' + n} value={`${n}x${T.fine[n]}`}>{fmt(n)}×{T.fine[n]} {tStatus('细牙', lang)}</option>)}
    </select></label>
  )
}

// featDlg palette: per-kind Chinese title + icon (titles match ribbon.ts labels).
const FD_TITLE: Record<string, string> = { gearbox: '齿轮箱向导', worm: '蜗杆', crowngear: '冠齿轮', automatedmodel: 'Automated Modeling · Connector v1', pattern: '矩形阵列', cpattern: '环形阵列', circpattern: '环形阵列', pathpattern: '路径阵列', mirror: '镜像', move: '移动/复制', scale: '缩放', draft: '拔模', revolve: '旋转', rib: '加强筋/腹板', pipe: '管道', box: '长方体', cylinder: '圆柱', sphere: '球', torus: '圆环', cone: '圆锥/圆台', wedge: '楔形', dome: '圆顶', halfcyl: '半圆柱', pie: '扇形柱', tube: '圆管/衬套', rtube: '方管', profile: '型材', rbox: '圆角盒', prism: '多边形棱柱', pyramid: '棱锥', coil: '螺旋', thread: '螺纹杆', cylpatch: '曲面贴花', sheetmetal: '钣金件', gear: '齿轮', rack: '齿条', pulley: 'V带轮', plane: '参考平面', cpoint: '构造点', caxis: '构造轴', combine: '合并/布尔', splitbody: '分割实体', 'extrude-edit': '拉伸', 'fillet-edit': '圆角', 'chamfer-edit': '倒角', 'shell-edit': '抽壳' }
const FD_ICON: Record<string, string> = { gearbox: 'default', worm: 'default', crowngear: 'default', automatedmodel: 'cylinder', pattern: 'pattern', cpattern: 'pattern', circpattern: 'pattern', pathpattern: 'pattern', mirror: 'mirror', move: 'move', scale: 'scale', draft: 'draft', revolve: 'revolve', rib: 'default', pipe: 'cylinder', box: 'box', cylinder: 'cylinder', sphere: 'sphere', torus: 'cylinder', cone: 'cylinder', wedge: 'box', dome: 'sphere', halfcyl: 'cylinder', pie: 'cylinder', tube: 'cylinder', rtube: 'box', profile: 'box', rbox: 'box', prism: 'box', pyramid: 'cylinder', plane: 'plane', cpoint: 'point', caxis: 'axis', combine: 'combine', splitbody: 'split', 'extrude-edit': 'extrude', 'fillet-edit': 'fillet', 'chamfer-edit': 'chamfer', 'shell-edit': 'shell' }

// Compact per-part fit indicator (🖨️✓/↻/✗) using the shared bed choice — no dropdown, for the move-bar.
function CompBedFit({ w, d, h }: { w: number; d: number; h: number }) {
  const bedPreset = useApp((s) => s.bedPreset)
  const customBed = useApp((s) => s.customBed)
  const bed = bedPreset === -1 && customBed ? customBed : (PRINT_BEDS[bedPreset] || PRINT_BEDS[0])
  const fit = bedFit(w, d, h, bed)
  const txt = fit.asIs ? '✓' : fit.anyOrient ? '↻' : '✗'
  const color = fit.asIs ? '#1f8f4e' : fit.anyOrient ? '#b07d10' : '#d2342f'
  const bedName = (bed as any).name || `自定义床 ${bed.x}×${bed.y}×${bed.z}`
  return <span title={`此零件 ${w.toFixed(0)}×${d.toFixed(0)}×${h.toFixed(0)}mm vs 打印床 ${bedName}：${fit.asIs ? '放得下' : fit.anyOrient ? '换朝向可放下（躺平/转向即可）' : '超出（任何朝向都放唔落）'}`} style={{ marginLeft: 6, fontSize: 12, color, fontWeight: 700 }}>🖨️{txt}</span>
}

// Mate config + invoke (bbox-based window-version mate). Pick type/axis/side(/gap) then click 配合 → target part.
function MateControls({ compId }: { compId: string }) {
  const mateType = useApp((s) => s.mateType)
  const mateAxis = useApp((s) => s.mateAxis)
  const mateSide = useApp((s) => s.mateSide)
  const mateDistance = useApp((s) => s.mateDistance)
  const setMateConfig = useApp((s) => s.setMateConfig)
  const mateFromComponent = useApp((s) => s.mateFromComponent)
  const faceMateFlip = useApp((s) => s.faceMateFlip)
  const faceMateGap = useApp((s) => s.faceMateGap)
  const mateCount = useApp((s) => s.mates.length)
  return (
    <>
      <select className="sb-tool" value={mateType} title="配合类型（包围盒级窄版：同心对齐=⊥轴居中；面贴合=居中+面接触；距离=居中+留间隙）" onChange={(e) => setMateConfig({ mateType: e.target.value as any })}>
        <option value="flush">配合·面贴合</option>
        <option value="concentric">配合·同心对齐</option>
        <option value="distance">配合·距离</option>
      </select>
      <select className="sb-tool" value={mateAxis} title="配合轴（垂直此轴的两轴会居中对齐）" onChange={(e) => setMateConfig({ mateAxis: Number(e.target.value) as any })}>
        <option value={0}>X轴</option><option value={1}>Y轴(竖直)</option><option value={2}>Z轴</option>
      </select>
      <select className="sb-tool" value={mateSide} title="贴合在目标的哪一侧（+ / −）" onChange={(e) => setMateConfig({ mateSide: Number(e.target.value) as any })}>
        <option value={1}>+侧</option><option value={-1}>−侧</option>
      </select>
      {mateType === 'distance' && (
        <label title="两面之间的间隙（mm）；负数 = 插入对方（盖唇入盒、插头入座）" style={{ fontSize: 12 }}>间隙<input type="number" step={1} value={mateDistance} onChange={(e) => setMateConfig({ mateDistance: Number(e.target.value) || 0 })} style={{ width: 48 }} /></label>
      )}
      <button className="sb-tool" title="配合：点此再点目标零件 → 按上面设定把此件对齐到目标（包围盒级，免拣面，可撤销）。窄版：对齐整件包围盒，非逐面约束" onClick={() => mateFromComponent(compId)}>⤵配合</button>
      <button className="sb-tool" title="拣面配合（精准）：先点【基准件】一个面（平面 或 圆柱孔/轴），再点【要郁件】对应面 → 平面贴平 / 圆柱同轴。下面可设翻转 + 间隙" onClick={() => useApp.getState().startFaceMate()}>▣拣面配合</button>
      <button className="sb-tool" title="按孔配螺丝：点一个圆柱孔面 → 自动量孔径、配 ISO 标准螺丝尺寸（过孔/攻牙）、同轴插入 + 记录配合。一键上螺丝" onClick={() => useApp.getState().startScrewFit()}>🔩按孔配螺丝</button>
      <button className="sb-tool" title="全孔配螺丝：自动侦测此零件上所有圆柱孔，逐个配 ISO 螺丝同轴插入 + 记录配合（螺栓圈 / 孔阵列一键上齐）" onClick={() => void useApp.getState().fitScrewsToAllHoles(compId)}>🔩全孔配螺丝</button>
      <label className="sb-tool" title="翻转：平面→同向（唔系对触），圆柱→轴反向（零件掉头）" style={{ fontSize: 12 }}><input type="checkbox" checked={faceMateFlip} onChange={(e) => useApp.getState().setFaceMateOpt({ faceMateFlip: e.target.checked })} /> 翻转</label>
      <label title="间隙：平面沿法线分开 / 圆柱沿轴向偏移（mm）" style={{ fontSize: 12 }}>间隙<input type="number" step={1} value={faceMateGap} onChange={(e) => useApp.getState().setFaceMateOpt({ faceMateGap: Number(e.target.value) || 0 })} style={{ width: 48 }} /></label>
      {mateCount > 0 && <>
        <span className="sb-hint" title="已记录嘅配合关系数（郁基准件时从动件自动跟随）">配合×{mateCount}</span>
        <button className="sb-tool" title="重算配合：按已记录关系，令从动件跟随基准件重新对齐（拖动后手动校正）" onClick={() => useApp.getState().resolveMates()}>↻重算配合</button>
        <button className="sb-tool" title="清除全部配合关系（零件留喺原位，只係之后郁基准件唔再自动跟随）" onClick={() => useApp.getState().clearMates()}>✕清配合</button>
      </>}
    </>
  )
}

// Point-4: narrow-version structural check (analytic beam theory, NOT 3D FEM). Force + support → σmax / δ / SF.
function BeamControls({ compId }: { compId: string | null }) {
  const analyzeBeam = useApp((s) => s.analyzeBeam)
  // 梁理论是进阶分析，不应在每次选中实体时占据底部工作区。先显示一个
  // 明确的入口，用户需要时才展开完整参数列，避免它和导航/时间轴争空间。
  const [open, setOpen] = useState(false)
  const [force, setForce] = useState(50)
  const [support, setSupport] = useState<'cantilever' | 'simply'>('cantilever')
  const [torque, setTorque] = useState(0)
  const [shape, setShape] = useState<'rect' | 'round' | 'tube'>('rect')
  const [wallT, setWallT] = useState(2)
  if (!open) return <button className="sb-tool" type="button" title="展开梁理论受力估算（非完整 3D 有限元）" onClick={() => setOpen(true)}>🔩 梁分析…</button>
  return (
    <>
      <button className="sb-tool" type="button" title="收合梁分析参数，腾出画布空间" onClick={() => setOpen(false)}>🔩 梁分析⌃</button>
      <select className="sb-tool" value={shape} title="截面形状：矩形 / 实心圆(I=πd⁴/64) / 空心管(铝管框架)" onChange={(e) => setShape(e.target.value as 'rect' | 'round' | 'tube')}>
        <option value="rect">矩形截面</option><option value="round">圆截面</option><option value="tube">管截面</option>
      </select>
      {shape === 'tube' && <label title="管壁厚 mm" style={{ fontSize: 12 }}>壁厚<input type="number" step={0.5} min={0.2} value={wallT} onChange={(e) => setWallT(Math.max(0.2, Number(e.target.value) || 0.2))} style={{ width: 44 }} /></label>}
      <label title="施加的点载荷（牛顿 N）" style={{ fontSize: 12 }}>力N<input type="number" step={10} min={0} value={force} onChange={(e) => setForce(Math.max(0, Number(e.target.value) || 0))} style={{ width: 52 }} /></label>
      <select className="sb-tool" value={support} title="支撑方式" onChange={(e) => setSupport(e.target.value as any)}>
        <option value="cantilever">悬臂</option><option value="simply">简支</option>
      </select>
      <label title="扭矩（N·mm）—— 设 >0 则额外算扭转剪应力（轴/传动件）" style={{ fontSize: 12 }}>扭矩<input type="number" step={100} min={0} value={torque} onChange={(e) => setTorque(Math.max(0, Number(e.target.value) || 0))} style={{ width: 56 }} /></label>
      <button className="sb-tool" title="受力估算（梁理论·示意，非完整3D有限元）：用零件包围盒当梁，算最大弯曲应力 σ、挠度 δ、安全系数 SF（对照材质屈服）；屈曲临界载荷；扭矩>0 加扭转剪应力 τ + 扭转角。适合 beam-like 件（支架/臂/轴）" onClick={() => analyzeBeam(force, support, compId, torque, shape, wallT)}>🔩受力估算</button>
      <button className="sb-tool" title="导出完整工程分析报告 .txt（弯曲/挠度/安全系数/屈曲/扭转/固有频率/热胀/许用载荷）" onClick={() => useApp.getState().downloadBeamReport()}>📄报告</button>
    </>
  )
}

// "Will it fit my 3D printer?" badge — compares the part/assembly mm bbox to a chosen printer bed.
// Always mm (beds are mm) regardless of display unit. Shows: fits upright / fits if reoriented / too big.
function BedFitBadge({ w, d, h }: { w: number; d: number; h: number }) {
  const bedPreset = useApp((s) => s.bedPreset)
  const setBedPreset = useApp((s) => s.setBedPreset)
  const customBed = useApp((s) => s.customBed)
  const setCustomBed = useApp((s) => s.setCustomBed)
  const bed = bedPreset === -1 && customBed ? customBed : (PRINT_BEDS[bedPreset] || PRINT_BEDS[0])
  const fit = bedFit(w, d, h, bed)
  const txt = fit.asIs ? '✓ 放得下' : fit.anyOrient ? '↻ 旋转可放下' : '✗ 超出'
  const color = fit.asIs ? '#1f8f4e' : fit.anyOrient ? '#b07d10' : '#d2342f'
  const onPick = async (v: string) => {
    if (v === 'custom') {
      const ans = await useApp.getState().appPrompt('自定义打印床尺寸：X,Y,Z（mm）\n（例如 200,200,200）', customBed ? `${customBed.x},${customBed.y},${customBed.z}` : '200,200,200')
      if (ans == null) return
      const p = ans.split(/[,，\s]+/).filter(Boolean).map(Number)
      if (p.length < 3 || p.some((n) => !Number.isFinite(n) || n <= 0)) { await useApp.getState().appAlert('请输入 3 个正数：X,Y,Z'); return }
      setCustomBed({ x: p[0], y: p[1], z: p[2] })
    } else setBedPreset(Number(v))
  }
  return (
    <span style={{ marginLeft: 8, fontSize: 11, color: '#6b7884' }} title="检查此模型能否放入所选 3D 打印机的打印床（按 mm 计，与显示单位无关）。「旋转可放下」= 换个朝向/躺平即可。可选「自定义」输入你自己打印机的尺寸。">
      🖨️ <select value={bedPreset === -1 ? 'custom' : String(bedPreset)} onChange={(e) => onPick(e.target.value)} onClick={(e) => e.stopPropagation()} style={{ fontSize: 11, height: 20, maxWidth: 170 }}>
        {PRINT_BEDS.map((b, i) => <option key={i} value={i}>{b.name}</option>)}
        {customBed && <option value="custom">自定义 ({customBed.x}×{customBed.y}×{customBed.z})</option>}
        {!customBed && <option value="custom">自定义…</option>}
      </select> <b style={{ color }}>{txt}</b>
    </span>
  )
}

// PNG screenshot: the Canvas is created via a gl FACTORY that forces preserveDrawingBuffer:true (R3F v9
// does NOT forward that flag through the gl-props object), so the WebGL back buffer retains the last frame
// and we can read it any time with canvas.toDataURL — no onCreated/same-tick dance, no lifecycle race.
export function exportViewPNG() {
  const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
  if (!canvas) { useApp.setState({ status: '3D 视图未就绪，无法截图' }); return }
  try {
    // Honesty guard (no 空壳): never download a blank image. Copy the WebGL canvas into a 2D canvas and
    // sample it; if the drawing buffer wasn't retained (no real pixels), refuse + tell the user instead of
    // saving an empty PNG. On a fresh production load the gl factory's preserveDrawingBuffer makes it real.
    const c2 = document.createElement('canvas'); c2.width = canvas.width; c2.height = canvas.height
    const cx = c2.getContext('2d'); if (!cx) { useApp.setState({ status: '导出图片失败：无 2D 上下文' }); return }
    cx.drawImage(canvas, 0, 0)
    const s = cx.getImageData(0, 0, Math.min(160, c2.width), Math.min(160, c2.height)).data
    let nonBlank = 0; for (let i = 3; i < s.length; i += 4) if (s[i] > 8) nonBlank++
    if (nonBlank < 8) { useApp.setState({ status: '截图未能保留画面（浏览器绘图缓冲为空）——请改用系统截图工具' }); return }
    const url = c2.toDataURL('image/png')
    const name = projName(useApp.getState().projectName)   // GM-L2 #86：同 STL/zip 单一净化口径，空名唔会塌成 '.png'
    const a = document.createElement('a'); a.href = url; a.download = `${name}.png`
    document.body.appendChild(a); a.click(); a.remove()
    useApp.setState({ status: '已导出当前视图为 PNG 图片（截图，可贴文档/邮件分享）' })
  } catch (e) { useApp.setState({ status: '导出图片失败：' + String(e).slice(0, 60) }) }
}

function PlaceholderBody() {
  return (
    <mesh position={[0, 20, 0]}>
      <boxGeometry args={[100, 40, 60]} />
      <meshStandardMaterial color="#cdd4da" metalness={0.1} roughness={0.6} transparent opacity={0.45} />
      <Edges threshold={20} color="#8a929a" />
    </mesh>
  )
}

// 泊车实体（多实体 T728）：灰显、半透明、唔接受拾取（活动实体先可以圆角/草图/量度）。
// S133：编辑曲面控制点模式下变可拾（pickable）—— 点佢 → pickParkedForPoles(index) 读控制网显极点球。
function ParkedBody({ mesh, index, pickable = false, picked = false, onPick }: { mesh: { vertices: number[]; triangles: number[]; normals: number[]; kind?: 'body'; faceGroups?: { start: number; count: number; faceId: number }[] }; index: number; pickable?: boolean; picked?: boolean; onPick?: (i: number, face: number) => void }) {
  const geom = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(mesh.vertices, 3))
    g.setAttribute('normal', new Float32BufferAttribute(mesh.normals, 3))
    g.setIndex(mesh.triangles)
    return g
  }, [mesh])
  useEffect(() => () => geom.dispose(), [geom])
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh
        geometry={geom}
        raycast={pickable ? MESH_RAYCAST : NULL_RAYCAST}
        onClick={pickable ? (e) => { e.stopPropagation(); let face = 0; if (e.faceIndex != null && mesh.faceGroups?.length) { const tri3 = e.faceIndex * 3; const gi = mesh.faceGroups.findIndex((g) => tri3 >= g.start && tri3 < g.start + g.count); if (gi >= 0) face = gi } onPick?.(index, face) } : undefined}
      >
        <meshStandardMaterial color={picked ? '#7bb8e8' : mesh.kind === 'body' ? '#aeb9c4' : '#9aa6b0'} transparent={mesh.kind !== 'body'} opacity={mesh.kind === 'body' ? 1 : 0.55} roughness={0.8} metalness={0.05} />
        <Edges threshold={24} color={picked ? '#3a78b5' : mesh.kind === 'body' ? '#59636d' : '#6b7680'} />
      </mesh>
    </group>
  )
}

function BrepEdgeOverlay({ mesh, color, fallbackThreshold = 25, hidden = false }: { mesh: Pick<MeshData, 'vertices' | 'triangles' | 'faceGroups'>; color: string; fallbackThreshold?: number; hidden?: boolean }) {
  const positions = useMemo(() => brepEdgePositions(mesh), [mesh])
  const geometry = useMemo(() => {
    if (!positions?.length) return null
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(positions, 3))
    // Hidden edges use a dashed material, which needs per-segment distances.
    // `BufferGeometry` has no computeLineDistances(); populate its shader
    // attribute directly so every independent B-rep segment starts at zero.
    const distances: number[] = []
    for (let i = 0; i + 5 < positions.length; i += 6) {
      const d = Math.hypot(positions[i + 3] - positions[i], positions[i + 4] - positions[i + 1], positions[i + 5] - positions[i + 2])
      distances.push(0, d)
    }
    g.setAttribute('lineDistance', new Float32BufferAttribute(distances, 1))
    return g
  }, [positions])
  useEffect(() => () => geometry?.dispose(), [geometry])
  if (!geometry) return <Edges threshold={fallbackThreshold} color={color} />
  // Hidden lines must be tested *after* the solid has filled the depth buffer.
  // GreaterDepth renders only edge fragments behind the shaded B-rep faces;
  // disabling depth test would wrongly fade every visible edge as well.
  return <lineSegments geometry={geometry} renderOrder={hidden ? 2 : 1}>
    {hidden
      ? <lineDashedMaterial color={color} transparent opacity={0.42} dashSize={1.8} gapSize={1.4} scale={1} depthTest depthFunc={GreaterDepth} depthWrite={false} />
      : <lineBasicMaterial color={color} depthTest depthWrite={false} />}
  </lineSegments>
}

function KernelBody({ mesh, frozen = false, compId, pos = [0, 0, 0], rot, rotationCenter, selected = false, motion, explodeOffset, clip = [], compColor, compOpacity = 1, pickable = true, moldTarget = false, onSelect, onFocus, onFaceMatePick, onPointMatePick }: { mesh: MeshData; frozen?: boolean; compId?: string; pos?: [number, number, number]; rot?: [number, number, number]; rotationCenter?: [number, number, number]; selected?: boolean; motion?: Matrix4; explodeOffset?: [number, number, number]; clip?: Plane[]; compColor?: string; compOpacity?: number; pickable?: boolean; moldTarget?: boolean; onSelect?: () => void; onFocus?: () => void; onFaceMatePick?: (face: import('../assembly/faceMate').MateFace) => void; onPointMatePick?: (point: [number, number, number]) => void }) {
  const meshFaceGroupColors = useApp((s) => s.meshFaceGroupColors)   // GM-X1 #16
  // GM-X1 #16：面组上色 —— 仅活动实体（有 faceGroups）；导入网格无逐面身份 → null（照旧单色）
  const fgColors = useMemo(() => (meshFaceGroupColors && !frozen ? buildFaceGroupColors(mesh as { vertices: number[]; triangles: number[]; faceGroups?: { start: number; count: number; faceId: number }[] }, FG_PALETTE) : null), [meshFaceGroupColors, frozen, mesh])
  const geom = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(mesh.vertices, 3))
    g.setAttribute('normal', new Float32BufferAttribute(mesh.normals, 3))
    if (fgColors) g.setAttribute('color', new Float32BufferAttribute(fgColors, 3))   // GM-X1 #16：逐顶点面组色
    g.setIndex(mesh.triangles)
    return g
  }, [mesh, fgColors])
  // Mesh edits and imports replace this BufferGeometry. Three.js keeps its GPU
  // vertex/index buffers until dispose(), so release the previous large model.
  useEffect(() => () => geom.dispose(), [geom])

  const [hovered, setHovered] = useState(false)
  const bodyColor = useApp((s) => s.bodyColor)
  const material = useApp((s) => s.material)
  // S101[8]：程序化纹理（仅活动实体；三平面投影，无需 UV）。texKey/texScale 变 → key 强制重建 material（onBeforeCompile 只跑编译期一次）。
  const imageUrl = frozen ? '' : (material.imageUrl || '')   // S192：自订图片贴图优先于程序化
  const normalUrl = frozen ? '' : (material.normalUrl || '')   // P2 Render：法线贴图（triplanar）
  const texKey = frozen ? '' : ((imageUrl ? 'img' : (material.tex || '')) + (normalUrl ? '+n' : ''))   // sentinel → material key 切换重建 onBC（法线加/清都要重编译）
  const texScale = material.texScale || 30
  const tex = useMemo(() => (imageUrl ? loadImageTexture(imageUrl) : getProcTexture(material.tex || '')), [imageUrl, material.tex])
  const nrmTex = useMemo(() => (normalUrl ? loadNormalTexture(normalUrl) : null), [normalUrl])
  const decalArmed = useApp((s) => !!s.decalPick)   // P2 Render：贴花放置模式（点面落位）
  const inspectShade = useApp((s) => s.inspectShade)   // S103[6]：斑马纹 / 曲率趋势
  const inspectStripe = useApp((s) => s.inspectStripe)
  const onBC = useMemo(() => (shader: { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string }) => {
    // S101[8] 三平面纹理（仅活动实体且选咗纹理）— 同 inspect 解耦，唔好喺顶部 early-return
    // P2 Render：法线贴图共用 vObjPos/vObjNrm varyings — 有任一贴图即注入一次
    if (tex || nrmTex) {
      shader.uniforms.uTexScale = { value: texScale }
      shader.vertexShader = 'varying vec3 vObjPos; varying vec3 vObjNrm; varying mat3 vNM;\n' + shader.vertexShader
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n vObjPos = position; vObjNrm = normal; vNM = normalMatrix;')
      shader.fragmentShader = 'varying vec3 vObjPos; varying vec3 vObjNrm; varying mat3 vNM; uniform float uTexScale;\n' + shader.fragmentShader
    }
    if (tex) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <map_fragment>', `#ifdef USE_MAP
          vec3 bw = abs(normalize(vObjNrm)); bw = bw / (bw.x + bw.y + bw.z);
          vec2 uvX = vObjPos.zy / uTexScale, uvY = vObjPos.xz / uTexScale, uvZ = vObjPos.xy / uTexScale;
          vec4 tx = texture2D(map, uvX) * bw.x + texture2D(map, uvY) * bw.y + texture2D(map, uvZ) * bw.z;
          diffuseColor *= tx;
          #endif`)
    }
    if (nrmTex) {
      // P2 Render：三平面法线（UDN 逐轴 swizzle，object-space 混合 → vNM（vertex normalMatrix varying）转 view-space）。
      // NoColorSpace 已喺 loader 保证；同 albedo 共用 uTexScale 重复密度。
      shader.uniforms.uNrmTex = { value: nrmTex }
      shader.fragmentShader = 'uniform sampler2D uNrmTex;\n' + shader.fragmentShader
        .replace('#include <normal_fragment_maps>', `
          vec3 bwn = abs(normalize(vObjNrm)); bwn = bwn / (bwn.x + bwn.y + bwn.z);
          vec3 sgnN = sign(vObjNrm);
          vec3 nTX = texture2D(uNrmTex, vObjPos.zy / uTexScale).xyz * 2.0 - 1.0;
          vec3 nTY = texture2D(uNrmTex, vObjPos.xz / uTexScale).xyz * 2.0 - 1.0;
          vec3 nTZ = texture2D(uNrmTex, vObjPos.xy / uTexScale).xyz * 2.0 - 1.0;
          vec3 wnX = vec3(nTX.z * sgnN.x, nTX.y, nTX.x);
          vec3 wnY = vec3(nTY.x, nTY.z * sgnN.y, nTY.y);
          vec3 wnZ = vec3(nTZ.x, nTZ.y, nTZ.z * sgnN.z);
          vec3 objN = normalize(wnX * bwn.x + wnY * bwn.y + wnZ * bwn.z);
          normal = normalize(vNM * normalize(mix(vObjNrm, objN, 0.9)));`)
    }
    // S103[6] 斑马纹（仅活动实体）— 用 three view-space vNormal/vViewPosition，注入 dithering_fragment 最尾。
    // S118b：'curv' 已升级为真·逐顶点曲率（CurvatureOverlay），唔再走呢个屏幕空间近似 shader；故只 gate zebra。
    if (!frozen && inspectShade === 'zebra') {
      shader.uniforms.uInspect = { value: 1 }
      shader.uniforms.uStripe = { value: inspectStripe }
      shader.fragmentShader = 'uniform float uInspect; uniform float uStripe;\n' + shader.fragmentShader
        .replace('#include <dithering_fragment>', `
          if (uInspect > 0.5) {
            vec3 N = normalize(vNormal); vec3 V = normalize(vViewPosition);
            if (uInspect < 1.5) {                          // ZEBRA：视角入射角条纹（曲率突变处错断/疏密剧变）
              float ang = acos(clamp(dot(N, V), -1.0, 1.0));
              float s = step(0.5, fract(ang / 3.14159265 * uStripe));
              gl_FragColor.rgb = mix(vec3(0.05), vec3(0.97), s);
            } else {                                       // CURV 趋势：屏幕空间法向梯度 ≈ 曲率量级（蓝→绿→红）
              float k = clamp(length(fwidth(N)) * uStripe * 0.6, 0.0, 1.0);
              gl_FragColor.rgb = vec3(k, 1.0 - abs(k - 0.5) * 2.0, 1.0 - k);
            }
          }
          #include <dithering_fragment>`)
    }
  }, [tex, nrmTex, texScale, frozen, inspectShade, inspectStripe])
  const measureMode = useApp((s) => s.measureMode)
  const addMeasurePoint = useApp((s) => s.addMeasurePoint)
  const faceSketchPick = useApp((s) => s.faceSketchPick)
  const automatedModelPicking = useApp((s) => s.featDlg?.kind === 'automatedmodel')
  const automatedModelPickFace = useApp((s) => s.automatedModelPickFace)
  const embossPick = useApp((s) => s.embossPick)   // S162 Emboss 拾面
  const ucsPick = useApp((s) => s.ucsPick)          // #174-1 UCS 拾面
  const setHoverFace = useApp((s) => s.setHoverFace)
  const startSketchOnFace = useApp((s) => s.startSketchOnFace)
  const edgeRoundPick = useApp((s) => s.edgeRoundPick)
  const filletType = useApp((s) => s.filletType)
  const chamferMode = useApp((s) => s.chamferMode)
  const roundEdgeAt = useApp((s) => s.roundEdgeAt)
  const sweepEdgePick = useApp((s) => s.sweepEdgePick)         // GM-3DV1 S5：沿实体边链扫掠拾边
  const sweepAddEdgeAt = useApp((s) => s.sweepAddEdgeAt)
  const boundaryPatchPick = useApp((s) => s.boundaryPatchPick)
  const boundaryPatchEdgeAt = useApp((s) => s.boundaryPatchEdgeAt)
  const surfBridgePick = useApp((s) => s.surfBridgePick)
  const surfBridgeEdgeAt = useApp((s) => s.surfBridgeEdgeAt)
  const edgeDisplay = useApp((s) => s.edgeDisplay)   // 视觉样式·边线显示（'off'=纯着色，隐藏共享技术边线；选中体仍保高亮边）
  const hiddenEdges = useApp((s) => s.hiddenEdges)   // GM-X2 #1：隐藏边暗显（着色/线框 + 隐藏边模式）
  const measureEdgeMode = useApp((s) => s.measureEdgeMode)
  const measureEdgeAt = useApp((s) => s.measureEdgeAt)
  const edgePtPick = useApp((s) => s.edgePtPick)   // S164：边上构造点拾取
  const measureFaceMode = useApp((s) => s.measureFaceMode)
  const measureFaceAt = useApp((s) => s.measureFaceAt)
  const measureAngleMode = useApp((s) => s.measureAngleMode)
  const measureAngleAt = useApp((s) => s.measureAngleAt)
  const measureUniMode = useApp((s) => s.measureUniMode)   // GM-X1 #1/#2：统一测量拾取
  const pushPullMode = useApp((s) => s.pushPullMode)
  const pushPullAt = useApp((s) => s.pushPullAt)
  const delFaceMode = useApp((s) => s.delFaceMode)   // T795：直接编辑删面
  const patchMode = useApp((s) => s.patchMode)       // T805：曲面 Patch（拾边界点）
  const thickenMode = useApp((s) => s.thickenMode)   // T811：加厚拾取面
  const offsetSurfMode = useApp((s) => s.offsetSurfMode)  // T812：偏移曲面
  const extendSurfMode = useApp((s) => s.extendSurfMode)  // S103：曲面延伸
  const splitFaceMode = useApp((s) => s.splitFaceMode)    // S99：分割面（KernelBody 拾取用）
  const replaceFaceMode = useApp((s) => s.replaceFaceMode)  // S99：替换面
  const rotateFaceMode = useApp((s) => s.rotateFaceMode)  // #12：Move Face 旋转（拔模式）
  const moveFaceMode = useApp((s) => s.moveFaceMode)      // GM-B2：移动面（偏移/倾斜，内核重解）
  const surfTrimMode = useApp((s) => s.surfTrimMode)      // S156：曲面-曲面裁剪（点目标上要保留嗰片）
  const draftPickMode = useApp((s) => s.draftPickMode)    // S101[5]：拔模拾中性面/侧面（KernelBody 只需 mode 控 cursor/armed/onClick）
  const splitPlanePick = useApp((s) => s.splitPlanePick)  // S184：任意平面切拾取
  const mirrorFacePick = useApp((s) => s.mirrorFacePick)  // P2：镜像画布拾面
  const faceColorPick = useApp((s) => s.faceColorPick)    // S102[3]：逐面外观涂色 hex（null=非涂色模式）
  const inspectMode = useApp((s) => s.inspectMode)        // S103[4]：选择属性检查器（被动单击拾面/棱）
  const shellMode = useApp((s) => s.shellMode)
  const shellPickAt = useApp((s) => s.shellPickAt)
  const faceFilletMode = useApp((s) => s.faceFilletMode)   // R1 面圆角：拾两张面
  const faceFilletPickAt = useApp((s) => s.faceFilletPickAt)
  const feaMode = useApp((s) => s.feaMode)
  const feaPickAt = useApp((s) => s.feaPickAt)
  const holeMode = useApp((s) => s.holeMode)
  const holePickAt = useApp((s) => s.holePickAt)
  const faceMateMode = useApp((s) => s.faceMateMode)
  const screwFitMode = useApp((s) => s.screwFitMode)
  const jointHolePicking = useApp((s) => !!s.jointHolePick)
  const jointPickMode = useApp((s) => s.jointPickMode)   // GM-W5 5.4：关节拾取模式（拣面建真关节）
  const jointOriginPickMode = useApp((s) => s.jointOriginPickMode)   // GM-3DV4 A1：拾 snap 点建可复用关节原点

  const cpatAxisPick = useApp((s) => s.cpatAxisPick)   // T763：拾圆柱面取轴（環形阵列/构造轴）
  const feaPinPick = useApp((s) => s.feaPinPick)       // S116：拾销/圆柱约束孔（click handler 用）
  const feaBearingPick = useApp((s) => s.feaBearingPick)   // S171：拾轴承载荷孔（click handler 用）
  const moldMode = useApp((s) => s.moldMode)           // T771：模流浇口拾取
  const toFacePick = useApp((s) => s.toFacePick)       // T775：到面拉伸目标面拾取
  const holeToObjectPick = useApp((s) => s.holeToObjectPick)
  const threadFacePick = useApp((s) => s.threadFacePick) // T775：选面加外螺纹
  const datumPicking = useApp((s) => !!s.datumPick)      // T778：相切面/两面中面拾取
  const datumCmd = useApp((s) => s.datumCmd)             // GM-3DV2 R1：统一构造几何命令
  const datumCmdAcc = !!(datumCmd && DATUM_CMD_ACC[datumCmd.type + ':' + datumCmd.method] && !datumPicking && !edgePtPick)   // 累积拾取法激活（遗留 pick 优先）
  const mode = useApp((s) => s.mode)
  const formBoxDraft = useApp((s) => s.formBoxDraft)
  const xray = useApp((s) => s.xray)
  const skSee = useApp((s) => s.skSeeThru && s.mode === 'sketch')   // GM-W6 A1：草图模式自动半透（睇到实体中间画紧乜）
  const wire = useApp((s) => s.wireframe)
  // FEA/模流云图显示紧 → 活动实体自动幽灵化（体素方块喺表面内 0.94h，唔透明就睇唔到云）。
  // moldTarget：导入网格组件做模流目标时亦幽灵化，令体素云透出（同活动实体一致）。
  const feaGhost = useApp((s) => !!s.feaResult || !!s.moldResult || !!s.modalResult || !!s.bucklingResult || !!s.topoptResult || !!s.thermalResult || !!s.windResult) && (!frozen || moldTarget)
  // ★ 性能 + 可见性（用户报：导入 STL 跑完模流后转动卡、4060Ti 都慢；充填动画睇唔到变化）。
  //   原因：模流时原本嗰个【高面数网格】被幽灵化成半透明（depthWrite=false）→ 关晒深度剔除 → 海量 overdraw
  //   （每像素叠画成个深度嘅三角，强 GPU 都卡）；半透明壳又遮住入面体素令充填颜色变化睇唔清。
  //   彩色【实色】体素 overlay 已代表咗个件 → 模流可视化时索性【收埋原网格】：转动即顺 + 充填前沿一睇即明。
  const moldHideMesh = useApp((s) => !!s.moldResult || !!s.windResult) && (!frozen || moldTarget)
  // ★穿模修★：上面为咗 perf 收埋咗原网格 → 风洞时【成个零件冇入过深度缓冲】，流线/箭头/烟一律画喺件上面，
  //   用户睇落就係「风穿过个模型」（实测流线几何上 0/4625 顶点入过固体 —— 纯粹係深度问题，唔係流场错）。
  //   唯一喺轮廓内写深度嘅 Cp 体素壳边长系 h*0.96（每格 4% 罅）+ 中心缩喺真表面内 ~0.5–1 格 → 罅位同内缩带漏光。
  //   下面会补一块【只写深度、唔写颜色】嘅真零件面。勾咗「透明」就唔挂（嗰阵用户就係要睇穿）。
  const windDepthMask = useApp((s) => !!s.windResult && !s.windXray) && (!frozen || moldTarget)
  /* ★ S4 可拖位姿 ★ —— 冇呢段，操纵杆郁但【零件唔会跟】，用户会以为个 gizmo 坏咗。
   *  windPose 係 CAD 空间嘅刚体 delta（列主序 16），而下面个 <group rotation={[-π/2,0,0]}> 入面【就係 CAD 空间】，
   *  所以直接喺入面再包一层 matrix 就啱，唔使自己做 CAD↔three 共轭。
   *  ⚠ 一定要跟返 windDepthMask 同一个 (!frozen || moldTarget) 闸 —— 否则场景入面【每一件】都会跟住郁。 */
  const windPoseArr = useApp((s) => (s.windEngine === 'gpu' && s.windMode > 0 ? s.windPose : null))
  const windPoseM = useMemo(
    () => (windPoseArr?.length === 16 && (!frozen || moldTarget) ? new Matrix4().fromArray(windPoseArr) : null),
    [windPoseArr, frozen, moldTarget],
  )
  const hot = hovered || selected
  const color = frozen ? (compColor || '#aab2ba') : bodyColor
  const D = Math.PI / 180
  // A component's bodies rotate together about the occurrence pivot, never about
  // independent body centres.  This keeps separated solids rigid in assemblies.
  const gc = useMemo(() => rotationCenter ?? meshCenter3(mesh), [rotationCenter, mesh])
  const hasRot = !!(rot && (rot[0] || rot[1] || rot[2]))
  // GM-X4 ①（真回归修）：Fusion 语义 — pick 命令激活时【覆盖】选择过滤器。用户清空 types(types=[]) 或
  //   只关咗 实体/面/边 → selPicksBody/selPicksComp=false 会令活动实体/组件 mesh 转 NULL_RAYCAST，令
  //   测量/孔/圆角/倒角/抽壳/拔模/在面画草图/按拉/分割面 等 onClick 永不触发（命令像坏咗）。armed 命令 →
  //   绕过过滤器令对应 mesh 可 raycast（复用行 500/506 光标 armed disjunction，逐命令对应 onClick 分支）。
  // 活动实体（非 frozen）：任一作用于活动实体嘅 pick 命令武装（草图模式仍唔接 raycast，保持不变）。
  const bodyCmdArmed = !frozen && mode !== 'sketch' && !!(
    edgeRoundPick || boundaryPatchPick || surfBridgePick || sweepEdgePick ||
    measureMode || measureEdgeMode || measureFaceMode || measureAngleMode || measureUniMode ||
    holeMode || shellMode || faceFilletMode || feaMode || moldMode || pushPullMode ||
    delFaceMode || patchMode || thickenMode || offsetSurfMode || extendSurfMode ||
    splitFaceMode || replaceFaceMode || rotateFaceMode || moveFaceMode || surfTrimMode ||
    draftPickMode || splitPlanePick || mirrorFacePick || faceColorPick || inspectMode ||
    faceSketchPick || automatedModelPicking || embossPick || ucsPick || cpatAxisPick || feaPinPick || feaBearingPick ||
    toFacePick || holeToObjectPick || threadFacePick || datumPicking || datumCmdAcc || edgePtPick || decalArmed ||
    jointOriginPickMode || mode === 'pickplane' || formBoxDraft?.stage === 'plane'
  )
  // frozen 组件：只对作用于 frozen 件嘅命令绕过过滤器（faceMate/screwFit/joint/量边·面·角/网格件画草图/浇口目标）。
  const compCmdArmed = frozen && !!(
    faceMateMode || screwFitMode || jointHolePicking || jointPickMode || jointOriginPickMode ||
    (compId && (measureEdgeMode || measureFaceMode || measureAngleMode)) ||
    (compId && (faceSketchPick || mode === 'pickplane')) ||
    (moldMode && moldTarget)
  )
  const commandArmed = bodyCmdArmed || compCmdArmed
  const meshEl = (
    <mesh
      geometry={geom}
      userData={{ compId, cadBody: true }}
      raycast={pickableWithCmdOverride(pickable, commandArmed) ? MESH_RAYCAST : NULL_RAYCAST}
      onPointerOver={(e) => {
        e.stopPropagation(); setHovered(true)
        const cv = document.querySelector('canvas'); if (!cv) return
        // Cursor affordance: pointer over a clickable component; crosshair over the active body while any
        // pick command is armed (fillet/chamfer/measure/hole/shell/press-pull/sketch-on-face/pick-plane).
        if (frozen && (faceSketchPick || mode === 'pickplane')) cv.style.cursor = 'crosshair'   // GM-W4 4.3：网格件都可拾面画草图 → 十字光标
        else if (frozen) cv.style.cursor = 'pointer'
        else if (edgeRoundPick || boundaryPatchPick || measureMode || measureEdgeMode || measureFaceMode || measureAngleMode || holeMode || shellMode || feaMode || moldMode || pushPullMode || delFaceMode || patchMode || thickenMode || offsetSurfMode || extendSurfMode || splitFaceMode || replaceFaceMode || rotateFaceMode || moveFaceMode || surfTrimMode || draftPickMode || splitPlanePick || faceSketchPick || automatedModelPicking || embossPick || cpatAxisPick || feaPinPick || feaBearingPick || mode === 'pickplane' || formBoxDraft?.stage === 'plane') cv.style.cursor = 'crosshair'
      }}
      onPointerOut={() => { setHovered(false); setHoverFace(null); const cv = document.querySelector('canvas'); if (cv) cv.style.cursor = '' }}
      onPointerMove={(e) => {
        // While a face-pick command is armed, highlight the coplanar face under the cursor (Fusion-style),
        // so the user clearly sees which face they're about to sketch-on / drill / push-pull / shell.
        const armed = (!frozen && (faceSketchPick || automatedModelPicking || embossPick || holeMode || pushPullMode || delFaceMode || thickenMode || offsetSurfMode || extendSurfMode || splitFaceMode || replaceFaceMode || rotateFaceMode || moveFaceMode || surfTrimMode || !!draftPickMode || splitPlanePick || shellMode || (edgeRoundPick === 'fillet' && (filletType === 'rule' || filletType === 'full')) || (edgeRoundPick === 'chamfer' && chamferMode === 'angle') || !!feaMode || cpatAxisPick || feaPinPick || feaBearingPick || measureFaceMode || measureAngleMode || moldMode || mode === 'pickplane' || formBoxDraft?.stage === 'plane'))   // GM-W8 A5：补活动实体面拾取模式嘅共面高亮（拾轴/销孔/轴承孔/量面/量角/浇口）
          || (frozen && !!compId && (faceSketchPick || mode === 'pickplane'))   // GM-W4 4.3：网格件拾面画草图都有共面高亮
        if (armed && e.faceIndex != null) { e.stopPropagation(); const fg = faceGroupTris(mesh, e.faceIndex); setHoverFace(fg.length ? fg : coplanarFaceTris(mesh, e.faceIndex)) }   // S99：优先真 B-rep 面（分割子面分得开），回落共面拟合
        else setHoverFace(null)   // pick mode ended (or moved off a face) → clear any lingering highlight
      }}
      onClick={(e) => {
        if (automatedModelPicking && !frozen && e.faceIndex != null) {
          e.stopPropagation()
          const det = detectFace(mesh, e.faceIndex)
          automatedModelPickFace(det && det.kind === 'planar' ? { p: det.p, n: det.n } : null)
          return
        }
        // T763：拾圆柱面取轴（活动实体）— mesh 系 CAD 坐标【原样】，唔好乘 matrixWorld
        //（嗰个变换系俾摆咗位嘅冻结组件用 — 乘咗会转去 three Y-up 世界系，轴向即错）
        if (cpatAxisPick && !frozen && e.faceIndex != null) {
          e.stopPropagation()
          const det = detectFace(mesh, e.faceIndex)
          useApp.getState().applyCpatAxisPick(det && det.kind === 'cyl' ? { p: det.p, axis: det.axis, r: det.r } : null)
          return
        }
        // S116：拾销/圆柱约束孔（同 cpatAxisPick 一样喺活动实体 CAD 系 — 唔行 faceMate matrixWorld 分支）
        if (feaPinPick && !frozen && e.faceIndex != null) {
          e.stopPropagation()
          const det = detectFace(mesh, e.faceIndex)
          useApp.getState().applyFeaPinPick(det && det.kind === 'cyl' ? { p: det.p, axis: det.axis, r: det.r } : null)
          return
        }
        // S171：拾轴承载荷孔（同销孔 — 圆柱面 → 轴点/轴向/半径）
        if (feaBearingPick && !frozen && e.faceIndex != null) {
          e.stopPropagation()
          const det = detectFace(mesh, e.faceIndex)
          useApp.getState().applyFeaBearingPick(det && det.kind === 'cyl' ? { p: det.p, axis: det.axis, r: det.r } : null)
          return
        }
        // GM-3DV4 A1/A4：拾 snap 点建可复用 Joint Origin。标准吸附点 = 圆柱孔心（轴向）/ 平面面心（法向）/ 落点。
        //   vertices/centers 比幼边可靠（继承 pixel-fragile quirk）→ 优先几何中心。
        if (jointOriginPickMode && e.point) {
          e.stopPropagation()
          const joState = useApp.getState()
          if (joState.jointOriginMode === 'twoEdges') {
            if (frozen) {
              const occ = compId ? joState.components.find((c) => c.id === compId) : undefined
              const def = occ?.defId ? joState.componentDefs.find((d) => d.id === occ.defId) : undefined
              const edges = def?.edges
              const line = edges ? nearestSavedBrepLine(edges, e.point, e.object.matrixWorld) : null
              if (!line) { useApp.setState({ status: '关节原点（两边交点）：此组件没有可用的真 B-rep 直边（旧组件或网格导入件请先编辑/重建）' }); return }
              const dir = line.b.clone().sub(line.a)
              joState.jointOriginEdgeAt([line.a.x, line.a.y, line.a.z], [dir.x, dir.y, dir.z], compId)
              return
            }
            const cp: [number, number, number] = [e.point.x, -e.point.z, e.point.y]
            void cad.edgePolylineAt(cp).then((edge) => {
              if (!edge?.pts || edge.pts.length < 2) { useApp.setState({ status: '关节原点（两边交点）：请点住实体嘅一条真边再试' }); return }
              const a = edge.pts[0], b = edge.pts[edge.pts.length - 1]
              useApp.getState().jointOriginEdgeAt([a[0], a[2], -a[1]], [b[0] - a[0], b[2] - a[2], -(b[1] - a[1])])
            }).catch(() => useApp.setState({ status: '关节原点（两边交点）：边拾取失败，请重试' }))
            return
          }
          const det = e.faceIndex != null ? detectFace(mesh, e.faceIndex) : null
          const mw = e.object.matrixWorld
          if (det && det.kind === 'cyl') {
            const ax = new Vector3(det.axis[0], det.axis[1], det.axis[2]).transformDirection(mw)
            const p = new Vector3(det.p[0], det.p[1], det.p[2]).applyMatrix4(mw)
            useApp.getState().jointOriginAt([p.x, p.y, p.z], [ax.x, ax.y, ax.z], compId ?? undefined)
          } else if (det && det.kind === 'planar') {
            const n = new Vector3(det.n[0], det.n[1], det.n[2]).transformDirection(mw)
            const p = new Vector3(det.p[0], det.p[1], det.p[2]).applyMatrix4(mw)
            useApp.getState().jointOriginAt([p.x, p.y, p.z], [n.x, n.y, n.z], compId ?? undefined)
          } else {
            useApp.getState().jointOriginAt([e.point.x, e.point.y, e.point.z], undefined, compId ?? undefined)
          }
          return
        }
        if (faceMateMode && e.shiftKey && onPointMatePick) {
          e.stopPropagation()
          onPointMatePick([e.point.x, e.point.y, e.point.z])
          return
        }
        // Face-pick mate (assembly, works on frozen parts). Detect the clicked face KIND from the CAD-coords
        // mesh (planar vs cylinder), then transform its geometry to world via the mesh's world matrix.
        if ((faceMateMode || screwFitMode || jointHolePicking || jointPickMode) && e.faceIndex != null && onFaceMatePick) {
          e.stopPropagation()
          const det = detectFace(mesh, e.faceIndex)
          const mw = e.object.matrixWorld
          if (det && det.kind === 'cyl') {
            const ax = new Vector3(det.axis[0], det.axis[1], det.axis[2]).transformDirection(mw)
            const p = new Vector3(det.p[0], det.p[1], det.p[2]).applyMatrix4(mw)
            onFaceMatePick({ kind: 'cyl', axis: [ax.x, ax.y, ax.z], p: [p.x, p.y, p.z], r: det.r })
          } else if (det && det.kind === 'planar') {
            const n = new Vector3(det.n[0], det.n[1], det.n[2]).transformDirection(mw)
            const p = new Vector3(det.p[0], det.p[1], det.p[2]).applyMatrix4(mw)
            onFaceMatePick({ kind: 'planar', n: [n.x, n.y, n.z], p: [p.x, p.y, p.z] })
          } else if (e.face) {
            const wn = e.face.normal.clone().transformDirection(mw)
            onFaceMatePick({ kind: 'planar', n: [wn.x, wn.y, wn.z], p: [e.point.x, e.point.y, e.point.z] })
          }
          return
        }
        if (measureMode) { e.stopPropagation(); addMeasurePoint([e.point.x, e.point.y, e.point.z]); return }
        // GM-W4 4.4(a)：量边/量面/量角亦支持导入网格件（frozen）。网格件冇 B-rep 边/面拓扑 → 走 meshMeasure 近似路径（faceIndex + 局部点）。
        if (measureEdgeMode && !frozen) { e.stopPropagation(); void measureEdgeAt([e.point.x, e.point.y, e.point.z]); return }
        if (measureEdgeMode && frozen && compId && e.faceIndex != null) { e.stopPropagation(); const lp = e.object.worldToLocal(e.point.clone()); useApp.getState().measureMeshEdgeAt(compId, e.faceIndex, [lp.x, lp.y, lp.z]); return }
        if (measureFaceMode && !frozen) { e.stopPropagation(); void measureFaceAt([e.point.x, e.point.y, e.point.z]); return }
        if (measureFaceMode && frozen && compId && e.faceIndex != null) { e.stopPropagation(); useApp.getState().measureMeshFaceAt(compId, e.faceIndex); return }
        // 量角：法向统一转【三维世界系】(transformDirection matrixWorld) — 令活动实体 + 各摆位/旋转网格件混拣都得正确夹角（旋转保夹角，body-only 数值不变）。
        if (measureAngleMode && (!frozen || compId) && e.face) { e.stopPropagation(); const wn = e.face.normal.clone().transformDirection(e.object.matrixWorld); measureAngleAt([wn.x, wn.y, wn.z]); return }
        // GM-X1 #1/#2：统一测量 —— 点任意实体 → worker 量面/边 → 组合派生读数。Alt/⌘ = 优先量边。活动实体 B-rep 路径。
        if (measureUniMode && !frozen) { e.stopPropagation(); const wn = e.face ? e.face.normal.clone().transformDirection(e.object.matrixWorld) : null; const isEdge = e.nativeEvent && (e.nativeEvent as MouseEvent).altKey; void useApp.getState().pickMeasureUniAt([e.point.x, e.point.y, e.point.z], wn ? [wn.x, wn.y, wn.z] : undefined, !!isEdge); return }
        if (embossPick && !frozen && e.face) { e.stopPropagation(); void useApp.getState().applyEmbossPick([e.point.x, e.point.y, e.point.z], [e.face.normal.x, e.face.normal.y, e.face.normal.z]); return }   // S162 Emboss 拾面
        if (ucsPick && !frozen && e.face) { e.stopPropagation(); void useApp.getState().makeUCS([e.point.x, e.point.y, e.point.z], [e.face.normal.x, e.face.normal.y, e.face.normal.z]); return }   // #174-1 UCS 拾面帧
        if (formBoxDraft?.stage === 'plane' && !frozen && e.faceIndex != null) {
          e.stopPropagation()
          const det = detectFace(mesh, e.faceIndex)
          if (!det || det.kind !== 'planar') { useApp.setState({ status: 'FORM Box：请选择平面或平面面。' }); return }
          const [nx, ny, nz] = det.n
          if (Math.abs(nz) >= Math.abs(nx) && Math.abs(nz) >= Math.abs(ny)) useApp.getState().chooseFormBoxPlane('XY', det.p[2])
          else if (Math.abs(ny) >= Math.abs(nx)) useApp.getState().chooseFormBoxPlane('XZ', det.p[1])
          else useApp.getState().chooseFormBoxPlane('YZ', det.p[0])
          return
        }
        if ((mode === 'pickplane' || faceSketchPick) && !frozen && e.face) { e.stopPropagation(); startSketchOnFace([e.point.x, e.point.y, e.point.z], [e.face.normal.x, e.face.normal.y, e.face.normal.z]); return }
        // GM-W4 4.3：网格件（frozen 组件）面上画草图 — 平面区拟合，交 store 做 CAD 世界系烘焙
        if ((mode === 'pickplane' || faceSketchPick) && frozen && compId && e.faceIndex != null) { e.stopPropagation(); useApp.getState().sketchOnMeshFaceAt(compId, e.faceIndex, [e.point.x, e.point.y, e.point.z]); return }
        if (pushPullMode && !frozen && e.face) {
          e.stopPropagation()
          // P2：Fusion Press Pull 语义 — 点贴住棱（±6px）=转圆角选边流；点面中间=移面（旧行为）
          if (e.faceIndex != null) {
            const cam = e.camera as { fov?: number } | undefined
            const wpp = cam && typeof cam.fov === 'number' ? (2 * e.distance * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(1, window.innerHeight) : 0.15
            if (nearSharpEdge(mesh, e.faceIndex, [e.point.x, -e.point.z, e.point.y], Math.max(0.3, 6 * wpp))) {
              const st = useApp.getState()
              st.toggleEdgeRoundPick('fillet')   // 互斥切换：清 pushPullMode + 武装圆角选边
              st.roundEdgeAt([e.point.x, e.point.y, e.point.z])
              useApp.setState({ status: '按拉 → 圆角：点中咗一条棱（Fusion Press Pull 语义）— 可继续点棱/设半径，按「确定」' })
              return
            }
          }
          void pushPullAt([e.point.x, e.point.y, e.point.z], e.face ? [e.face.normal.x, e.face.normal.y, e.face.normal.z] : [0, 1, 0]); return
        }
        if (useApp.getState().facePatternPick && !frozen && e.face) { e.stopPropagation(); useApp.getState().addFacePatternPick([e.point.x, e.point.y, e.point.z]); return }
        if (delFaceMode && !frozen && e.face) { e.stopPropagation(); void useApp.getState().delFaceAt([e.point.x, e.point.y, e.point.z]); return }
        if (patchMode && !frozen && e.point) { e.stopPropagation(); useApp.getState().patchAddPt([e.point.x, e.point.y, e.point.z]); return }  // T805：拾边界点
        if (thickenMode && !frozen && e.face) { e.stopPropagation(); void useApp.getState().thickenFaceAt([e.point.x, e.point.y, e.point.z]); return }  // T811：加厚拾取面
        if (offsetSurfMode && !frozen && e.face) { e.stopPropagation(); void useApp.getState().offsetSurfFaceAt([e.point.x, e.point.y, e.point.z]); return }  // T812：偏移曲面
        if (extendSurfMode && !frozen && e.face) { e.stopPropagation(); void useApp.getState().extendSurfFaceAt([e.point.x, e.point.y, e.point.z]); return }  // S103：曲面延伸
        if (splitFaceMode && !frozen && e.face) { e.stopPropagation(); void useApp.getState().splitFaceAt([e.point.x, e.point.y, e.point.z], [e.face.normal.x, e.face.normal.y, e.face.normal.z]); return }  // S99：分割面
        if (replaceFaceMode && !frozen && e.face) { e.stopPropagation(); void useApp.getState().replaceFaceAt([e.point.x, e.point.y, e.point.z], [e.face.normal.x, e.face.normal.y, e.face.normal.z]); return }  // S99：替换面
        if (rotateFaceMode && !frozen && e.face) { e.stopPropagation(); void useApp.getState().rotateFaceAt([e.point.x, e.point.y, e.point.z], [e.face.normal.x, e.face.normal.y, e.face.normal.z]); return }  // #12：Move Face 旋转（拔模式）
        if (moveFaceMode && !frozen && e.face) { e.stopPropagation(); useApp.getState().moveFaceAt([e.point.x, e.point.y, e.point.z], [e.face.normal.x, e.face.normal.y, e.face.normal.z]); return }  // GM-B2：移动面拾平面（累积单面 → 工具栏「确定」先 commit）
        if (surfTrimMode && !frozen && e.point) { e.stopPropagation(); void useApp.getState().surfSurfTrimAt([e.point.x, e.point.y, e.point.z]); return }  // S156：曲面裁剪 — 点目标上要保留嗰片
        if (draftPickMode && !frozen && e.face) { e.stopPropagation(); void useApp.getState().draftFaceAt([e.point.x, e.point.y, e.point.z], [e.face.normal.x, e.face.normal.y, e.face.normal.z]); return }  // S101[5]：拔模拾中性面/侧面
        if (splitPlanePick && !frozen && e.face) { e.stopPropagation(); void useApp.getState().applySplitPlanePick([e.point.x, e.point.y, e.point.z], [e.face.normal.x, e.face.normal.y, e.face.normal.z]); return }  // S184：任意平面切拾平面
        if (mirrorFacePick && !frozen && e.face) { const wn = e.face.normal.clone().transformDirection(e.object.matrixWorld); e.stopPropagation(); useApp.getState().applyMirrorFacePick([e.point.x, e.point.y, e.point.z], [wn.x, wn.y, wn.z]); return }  // P2：镜像拾面
        if (faceColorPick && !frozen && e.faceIndex != null) { e.stopPropagation(); const fid = faceIdAt(mesh, e.faceIndex); if (fid != null) useApp.getState().paintFace(String(fid), faceColorPick); else useApp.setState({ status: '呢件冇 B-rep 面身份（导入网格）— 逐面外观唔适用' }); return }  // S102[3]：逐面外观涂色
        if (feaMode && !frozen && e.face) { e.stopPropagation(); const ft = (e.faceIndex != null && mesh) ? faceGroupTris(mesh, e.faceIndex) : null; feaPickAt([e.point.x, e.point.y, e.point.z], [e.face.normal.x, e.face.normal.y, e.face.normal.z], ft && ft.length ? ft : undefined); return }  // S133：拣真 B-rep 面三角 → 求解器按有界面贴节点；无 faceGroup（导入网格）→ undefined → 回退平面 band
        if (moldMode && (!frozen || moldTarget) && e.face) { e.stopPropagation(); useApp.getState().moldPickAt([e.point.x, e.point.y, e.point.z], [e.face.normal.x, e.face.normal.y, e.face.normal.z]); return }  // T771：浇口拾取（多选）。moldTarget：导入网格组件做目标时亦可点（同帧 Rx+90，moldTargetMesh bake 一致）
        // T775：到面拉伸目标面拾取（CAD 原坐标 — detectFace 出 planar n/p）
        if (toFacePick && !frozen && e.faceIndex != null) { e.stopPropagation(); const det = detectFace(mesh, e.faceIndex); useApp.getState().applyToFacePick(det && det.kind === 'planar' ? { kind: 'planar', p: det.p, n: det.n } : null); return }
        // Hole To Object: target selection uses CAD planar-face detection, never a display face index.
        if (holeToObjectPick && !frozen && e.faceIndex != null) { e.stopPropagation(); const det = detectFace(mesh, e.faceIndex); useApp.getState().applyHoleToObjectPick(det && det.kind === 'planar' ? { kind: 'planar', p: det.p, n: det.n } : null); return }
        // T775：选圆柱面加外螺纹
        if (threadFacePick && !frozen && e.faceIndex != null) { e.stopPropagation(); useApp.getState().applyThreadFacePick(detectFace(mesh, e.faceIndex)); return }
        // T778：datum 拾取（相切面 / 两面中面）— click 点转 CAD
        if (datumPicking && !frozen && e.faceIndex != null) { e.stopPropagation(); useApp.getState().applyDatumPick(detectFace(mesh, e.faceIndex), [e.point.x, -e.point.z, e.point.y]); return }
        // GM-3DV2 R1：统一构造几何 · 累积拾取法（过两边/垂直面/圆柱轴/两边交点/三面交点/边穿面/圆边取心）— 边槽用 e.point 交 store 解析最近边，面槽用 detectFace。
        if (datumCmdAcc && !frozen && e.point) { e.stopPropagation(); const det = e.faceIndex != null ? detectFace(mesh, e.faceIndex) : null; void useApp.getState().datumCmdClickAt(det, [e.point.x, e.point.y, e.point.z], 'modelVertex'); return }
        if (shellMode && !frozen && e.face) { e.stopPropagation(); shellPickAt([e.point.x, e.point.y, e.point.z]); return }
        if (faceFilletMode && !frozen && e.face) { e.stopPropagation(); faceFilletPickAt([e.point.x, e.point.y, e.point.z]); return }   // R1 面圆角：拾面（guarded — 需 e.face，行 shell 同款）
        if (holeMode && !frozen && e.face) { e.stopPropagation(); holePickAt([e.point.x, e.point.y, e.point.z], e.face.normal.clone().transformDirection(e.object.matrixWorld).y, e.faceIndex != null ? detectFace(mesh, e.faceIndex) : null); return }   // P2 修：世界法线 y 判上向面 → 盲孔/沉头由揀面起计；detectFace → 圆柱面对心（Fusion At Center）
        if (edgeRoundPick === 'fillet' && filletType === 'rule' && !frozen && e.faceIndex != null) { e.stopPropagation(); useApp.getState().filletRuleFaceAt([e.point.x, e.point.y, e.point.z], faceIdAt(mesh, e.faceIndex) ?? e.faceIndex); return }
        if (edgeRoundPick === 'fillet' && filletType === 'full' && !frozen && e.faceIndex != null) { e.stopPropagation(); useApp.getState().filletFullFaceAt([e.point.x, e.point.y, e.point.z], faceIdAt(mesh, e.faceIndex) ?? e.faceIndex); return }
        if (edgeRoundPick && !frozen) {
          e.stopPropagation()
          // Fusion Distance and Angle = one reference Face + its boundary Edge. Persist an interior
          // point of the actual hit B-rep face. An edge point itself belongs to both adjacent faces.
          if (edgeRoundPick === 'chamfer' && chamferMode === 'angle' && e.faceIndex != null) {
            const ti = e.faceIndex * 3, ia = mesh.triangles[ti] * 3, ib = mesh.triangles[ti + 1] * 3, ic = mesh.triangles[ti + 2] * 3
            let rp: [number, number, number] = [e.point.x, e.point.y, e.point.z]
            if (Number.isFinite(ia) && Number.isFinite(ib) && Number.isFinite(ic)) {
              const cx = (mesh.vertices[ia] + mesh.vertices[ib] + mesh.vertices[ic]) / 3
              const cy = (mesh.vertices[ia + 1] + mesh.vertices[ib + 1] + mesh.vertices[ic + 1]) / 3
              const cz = (mesh.vertices[ia + 2] + mesh.vertices[ib + 2] + mesh.vertices[ic + 2]) / 3
              rp = [cx, cz, -cy]   // active-body CAD Z-up → three Y-up
            }
            useApp.getState().setChamferReferenceFace(rp, faceIdAt(mesh, e.faceIndex) ?? e.faceIndex)
          }
          void roundEdgeAt([e.point.x, e.point.y, e.point.z]); return
        }
        if (sweepEdgePick && !frozen) { e.stopPropagation(); sweepAddEdgeAt([e.point.x, e.point.y, e.point.z]); return }   // GM-3DV1 S5：拾实体边接力做扫掠路径
        if (boundaryPatchPick && !frozen) { e.stopPropagation(); boundaryPatchEdgeAt([e.point.x, e.point.y, e.point.z]); return }
        if (surfBridgePick && !frozen) { e.stopPropagation(); surfBridgeEdgeAt([e.point.x, e.point.y, e.point.z]); return }
        // S164：边上构造点 — 摆喺所有专属 pick-mode 之后（startEdgePointPick 已清其它模式；放最末 → 若有 stale 别模式同时武装，嗰个先 return，唔会被边点拣抢走）
        if (edgePtPick && !frozen && mode === 'model' && e.point) { e.stopPropagation(); void useApp.getState().edgePointAt([e.point.x, e.point.y, e.point.z]); return }   // S178 audit：gate model 模式 — 草图/拾面时残留 edgePtPick 唔会被边点误起轴/点
        // P2 Render：贴花放置 — 排喺所有专属 pick-mode 之后（review：早排会食咗 shell/hole 嘅面点击）
        if (decalArmed && !frozen && e.face) { e.stopPropagation(); const wn = e.face.normal.clone().transformDirection(e.object.matrixWorld); useApp.getState().placeDecalAt([e.point.x, e.point.y, e.point.z], [wn.x, wn.y, wn.z]); return }
        // S103[4]：选择属性检查器 — 摆喺最末（前面每个 pick-mode 都已 return），只 gate model 模式活动实体单击；Alt+点=棱
        // GM-X4 ④：priority 参与拾取 tie-break — 点贴近一条棱（歧义区，nearSharpEdge）时按 selFilter.priority 决定选边/面；
        //   Alt 仍强制选边；priority='face'/'body'（含默认）时 = 旧行为逐字节（wantEdge = altKey）。
        // GM-X4 ②：属性检查 = 被动拾取选择，尊重逐类型过滤器（面/边勾选框）→ 该类型关咗即 early-return 唔选（命令路径 hole/fillet 唔受此 gate，走 ① override）。
        if (inspectMode && !frozen && mode === 'model' && e.faceIndex != null) {
          e.stopPropagation()
          const sf = useApp.getState().selFilter
          const alt = (e.nativeEvent as MouseEvent).altKey
          // nearSharpEdge 仅在可能改变结果时先算（边优先且非 Alt）→ 默认 face 优先零额外开销、逐字节旧行为。
          let nearEdge = false
          if (!alt && sf.priority === 'edge') {
            const cam = e.camera as { fov?: number } | undefined
            const wpp = cam && typeof cam.fov === 'number' ? (2 * e.distance * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(1, window.innerHeight) : 0.15
            nearEdge = !!nearSharpEdge(mesh, e.faceIndex, [e.point.x, -e.point.z, e.point.y], Math.max(0.3, 6 * wpp))
          }
          const wantEdge = inspectWantEdge(sf.priority, alt, nearEdge)
          if (!selAllowsType(sf, wantEdge ? 'edge' : 'face')) { useApp.setState({ status: `选择过滤已关闭「${wantEdge ? '边' : '面'}」类型 — 喺 🎯 面板勾选` }); return }
          void useApp.getState().inspectAt([e.point.x, e.point.y, e.point.z], wantEdge); return
        }
        // Plain click on a component (frozen mesh) with no active pick/command mode → select it (Fusion-style direct 3D selection).
        if (frozen && onSelect && !measureMode && !measureEdgeMode && !measureFaceMode && !measureAngleMode && !measureUniMode && mode !== 'pickplane' && !faceSketchPick && !pushPullMode && !shellMode && !faceFilletMode && !holeMode && !edgeRoundPick) {
          e.stopPropagation()
          const st = useApp.getState()
          // GM-X4 ②：组件普通选择尊重「组件」类型过滤（默认勾住 = 旧行为逐字节；moldTarget 令 mesh 可拣但类型关咗就唔当选）。
          if (!selAllowsType(st.selFilter, 'component')) return
          // GM-X4 ③：穿透选择单击 — selectThrough 时消费 R3F e.intersections（已按距离升序）→ 收全部组件命中入 checkedComps（含被遮挡）；关时保持仅最前（onSelect）。
          if (st.selFilter.selectThrough && Array.isArray(e.intersections) && e.intersections.length > 1) {
            const ids = resolvePickHits(e.intersections, true)
              .map((h) => (h.object as { userData?: { compId?: string } } | undefined)?.userData?.compId)
              .filter((id): id is string => !!id)
            if (ids.length > 1) { useApp.setState({ checkedComps: [...new Set([...st.checkedComps, ...ids])], status: `穿透选择：拣中 ${ids.length} 个组件（含被遮挡）` }); return }
          }
          onSelect()
        }
      }}
      onDoubleClick={(e) => {
        // Double-click a component (no active pick mode) → select + zoom-to (Fusion-style "fit to selection").
        if (frozen && onFocus && !measureMode && !measureEdgeMode && !measureFaceMode && !measureAngleMode && !measureUniMode && mode !== 'pickplane' && !faceSketchPick && !pushPullMode && !shellMode && !faceFilletMode && !holeMode && !edgeRoundPick) { e.stopPropagation(); onFocus() }
      }}
    >
      <meshStandardMaterial
        key={texKey + '|' + inspectShade + '|' + inspectStripe + '|' + (fgColors ? 'FG' : '')}
        map={tex || undefined}
        vertexColors={!!fgColors}
        onBeforeCompile={onBC}
        // three 全局 program cache 默认 key = onBeforeCompile.toString() — closure 值（tex/nrmTex/zebra）变咗 key 唔变，
        // active（有 patch）同 frozen（无 patch）params 相同时会撞 program 攞错 GLSL。按实际 patch 组合显式分 key。
        customProgramCacheKey={() => 'kb|' + (tex ? 'T' : '') + (nrmTex ? 'N' : '') + (!frozen && inspectShade === 'zebra' ? 'Z' : '')}
        color={fgColors ? '#ffffff' : color}
        metalness={material.metalness}
        roughness={material.roughness}
        emissive={selected ? '#7a4a00' : hot ? '#0f4d6b' : '#000000'}
        emissiveIntensity={selected ? 0.3 : hot ? 0.22 : 0}
        clippingPlanes={clip}
        // Do not use Three's material.wireframe here: it exposes every
        // tessellation triangle, so a smooth cylinder turns into a dense cage.
        // Fusion-style wire display is B-rep-like: hide the shaded triangles
        // and retain only the geometry edge overlay below.
        wireframe={false}
        transparent={wire || xray || skSee || feaGhost || compOpacity < 1 || (!frozen && material.opacity < 1)}
        opacity={wire ? 0 : (xray ? 0.3 : skSee ? 0.35 : feaGhost ? 0.18 : (frozen ? compOpacity : material.opacity))}
        // Wire-with-edges still needs the body's depth.  Without this prepass
        // every B-rep edge is treated as visible, and GreaterDepth has no
        // surface against which it can identify hidden dashed lines.
        colorWrite={wire ? false : undefined}
        depthWrite={wire ? edgeDisplay !== 'off' : (xray || skSee || feaGhost || compOpacity < 1 ? false : undefined)}
        side={xray || skSee || feaGhost || compOpacity < 1 || clip.length || (!frozen && material.opacity < 1) ? DoubleSide : undefined}
      />
      {(wire || edgeDisplay !== 'off' || selected || hot) && <BrepEdgeOverlay mesh={mesh} color={selected ? '#e08a2b' : hot ? '#0a5a85' : '#33373b'} />}
      {/* GM-X2 #1：隐藏边暗显 —— 第二层 <Edges> 关深度测试、淡显被遮挡边（对标 Fusion Hidden Edge Dimming）。 */}
      {hiddenEdges && !selected && !hot && <BrepEdgeOverlay mesh={mesh} color="#9aa3ac" hidden />}
    </mesh>
  )
  // OCCT is Z-up; rotate -90° about X so the solid sits on the (Y-up) ground grid.
  // 风洞可拖位姿：喺 CAD 空间（即係 -90°X 呢层入面）再包一层 delta 矩阵，令零件跟住操纵杆郁。
  const windPosed = (el: ReactNode) => (windPoseM
    ? <group matrix={windPoseM} matrixAutoUpdate={false}>{el}</group>
    : el)
  const oriented = !moldHideMesh
    ? <group rotation={[-Math.PI / 2, 0, 0]}>{windPosed(meshEl)}</group>
    : windDepthMask
      // ★穿模修★ 只写深度、唔写颜色嘅真零件面（invisible z-mask）：外观逐像素零变化，但令零件真係遮得住流场。
      //   renderOrder 排位系关键：Cp 体素(-2) → 呢块 mask(-1) → …… → 流线/箭头/烟(6)。
      //   体素【先】画完颜色入 framebuffer，之后 mask 先写深度，所以 Cp 云唔会俾自己剔走；而流线喺最后画，
      //   就会被 mask 嘅深度正确挡住。冇 lighting / 冇 shadow / colorWrite off = 纯 z-prepass，成本极低。
      ? (
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {windPosed(
            <mesh geometry={geom} raycast={NULL_RAYCAST} renderOrder={-1}>
              <meshBasicMaterial colorWrite={false} depthWrite depthTest clippingPlanes={clip} side={clip.length ? DoubleSide : undefined} />
            </mesh>,
          )}
        </group>
      )
      : null
  // When the component carries a rotation, spin it about its own centre (gc) in three-world,
  // between the world position and the Z-up→Y-up mapping — mirrors store.compWorldMatrix.
  const content = hasRot ? (
    <group position={pos}>
      <group position={gc}>
        <group rotation={[rot![0] * D, rot![1] * D, rot![2] * D]}>
          <group position={[-gc[0], -gc[1], -gc[2]]}>{oriented}</group>
        </group>
      </group>
    </group>
  ) : (
    <group position={pos}>{oriented}</group>
  )
  // Apply the joint-kinematics world motion (if any) as an outer matrix group.
  const posed = motion ? <group matrixAutoUpdate={false} matrix={motion}>{content}</group> : content
  // #73 GM-L2：爆炸偏移当【世界平移】叠喺 motion(FK) 之后 —— 唔可以烘入 pos，否则喺 FK 之内会畀关节
  // 旋转/平移二次变换，被驱动嘅子件会沿局部帧斜方向飞走。世界系再包一层 <group position> → 有关节姿态
  // 嘅子件都沿世界径向散开。无 explodeOffset（单体 / section / 泊车件 / 未爆炸）时 = 原样（字节一致）。
  return explodeOffset ? <group position={explodeOffset}>{posed}</group> : posed
}

// 3D-print overhang highlight: a red translucent overlay of the support-needing faces (from store.overhang).
// Wrapped in the SAME −90°X group as KernelBody (OCCT Z-up → three Y-up) so it sits exactly on the body.
function OverhangView() {
  const overhang = useApp((s) => s.overhang)
  const geom = useMemo(() => {
    if (!overhang || !overhang.on || !overhang.tris.length) return null
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(overhang.tris, 3))
    g.computeVertexNormals()
    return g
  }, [overhang])
  useEffect(() => () => geom?.dispose(), [geom])
  if (!geom) return null
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={geom} renderOrder={999}>
        <meshBasicMaterial color="#ff3b30" transparent opacity={0.55} side={DoubleSide} depthTest={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
    </group>
  )
}

// Wall-thickness highlight: an orange translucent overlay of the thin-wall faces (store.wallThin). Same
// −90°X group as KernelBody so it lands on the body.
function WallThinView() {
  const wallThin = useApp((s) => s.wallThin)
  const geom = useMemo(() => {
    if (!wallThin || !wallThin.on || !wallThin.tris.length) return null
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(wallThin.tris, 3))
    g.computeVertexNormals()
    return g
  }, [wallThin])
  useEffect(() => () => geom?.dispose(), [geom])
  if (!geom) return null
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={geom} renderOrder={999}>
        <meshBasicMaterial color="#ff9500" transparent opacity={0.6} side={DoubleSide} depthTest={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
    </group>
  )
}

// Face-pick highlight: blue translucent overlay of the coplanar face under the cursor while a face-pick
// command is armed (sketch-on-face / hole / push-pull / shell). Same −90°X group so it lands on the body.
function FaceHoverView() {
  const hoverFace = useApp((s) => s.hoverFace)
  const geom = useMemo(() => {
    if (!hoverFace || !hoverFace.length) return null
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(hoverFace, 3))
    g.computeVertexNormals()
    return g
  }, [hoverFace])
  // Hover picking can replace this geometry every pointer move.  Dispose the
  // old VBO explicitly; browser GC cannot release WebGL buffers.
  useEffect(() => () => geom?.dispose(), [geom])
  if (!geom) return null
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={geom} renderOrder={998}>
        <meshBasicMaterial color="#1aa0ff" transparent opacity={0.4} side={DoubleSide} depthTest={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
    </group>
  )
}

// S186：实心剖面「切面上色」—— 喺 capped section 模式，将剖切平面上嘅平整切面以醒目暖色填充 +
// 深色轮廓描出（Fusion section-view 切面观感）。纯渲染：几何由 sectionMesh useMemo 抽取
// （cutFaceGeom 筛三顶点共面三角），无 store 状态、无 pick-mode（避开「pick-mode 泄漏」陷阱）。
// 同 −90°X group 落到 body 上；polygonOffset 拉前避免与 KernelBody 切面 z-fighting。
function CutFaceOverlay() {
  const sectionMesh = useApp((s) => s.sectionMesh)
  const section = useApp((s) => s.section)
  const geom = useMemo(() => {
    if (!section?.on || section.plane || !section.capped || !sectionMesh || !sectionMesh.triangles?.length) return null
    const cf = cutFaceGeom(sectionMesh, section.axis, section.offset)
    if (!cf) return null
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(cf.vertices, 3))
    g.setIndex(Array.from(cf.triangles))
    g.computeVertexNormals()
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionMesh, section?.on, section?.capped, section?.plane, section?.axis, section?.offset, section?.flip])
  // S186 audit HIGH：剖切滑杆每 tick refreshSectionCap 都 commit 全新 sectionMesh → 本 useMemo 重建几何；
  // three 唔会 GC 释放 GPU VBO/IBO，必须显式 dispose（同 ParkedBody/KernelBody 一致），否则拖滑杆狂漏显存。
  useEffect(() => () => geom?.dispose(), [geom])
  if (!geom) return null
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={geom} renderOrder={3}>
        <meshStandardMaterial color="#d98a4a" metalness={0.08} roughness={0.72} side={DoubleSide} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        <Edges threshold={1} color="#9c531a" />
      </mesh>
    </group>
  )
}

// Live ghost preview of pattern / cpattern / mirror while their dialog is open (Fusion-style).
// Renders translucent copies of the current body at the transforms the worker will use.
// Same CAD→three frame as KernelBody (outer −90°X group; transforms applied in CAD space inside it).
function PatternPreview() {
  const featDlg = useApp((s) => s.featDlg)
  const bodyMesh = useApp((s) => s.bodyMesh)
  const geom = useMemo(() => {
    if (!bodyMesh) return null
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(bodyMesh.vertices, 3))
    g.setIndex(bodyMesh.triangles)
    g.computeVertexNormals()
    return g
  }, [bodyMesh])
  // Pattern/move previews rebuild whenever a feature recomputes or imported
  // body changes.  They are often large, so do not leave their GPU buffers to
  // renderer cache eviction.
  useEffect(() => () => geom?.dispose(), [geom])
  if (!featDlg || !geom || !bodyMesh) return null
  const k = featDlg.kind, p = featDlg.params as Record<string, number | string>
  if (k !== 'pattern' && k !== 'cpattern' && k !== 'circpattern' && k !== 'mirror' && k !== 'move' && k !== 'scale' && k !== 'splitbody') return null
  const D = Math.PI / 180
  if (k === 'splitbody') {
    // P2：分割实体 ghost — 半透明体 + 切割平面quad（轴向或所拾任意平面），实时跟对话框字段
    const vv = bodyMesh.vertices
    let xn = 1e9, xp = -1e9, yn = 1e9, yp = -1e9, zn = 1e9, zp = -1e9
    for (let i = 0; i < vv.length; i += 3) { xn = Math.min(xn, vv[i]); xp = Math.max(xp, vv[i]); yn = Math.min(yn, vv[i + 1]); yp = Math.max(yp, vv[i + 1]); zn = Math.min(zn, vv[i + 2]); zp = Math.max(zp, vv[i + 2]) }
    const pad = 1.3, sxx = (xp - xn) * pad || 50, syy = (yp - yn) * pad || 50, szz = (zp - zn) * pad || 50
    const gmesh2 = <mesh geometry={geom}><meshBasicMaterial color="#1aa0ff" transparent opacity={0.18} depthWrite={false} /></mesh>
    const hasPlane = typeof p.planeOrigin === 'string' && !!p.planeOrigin
    let pos: [number, number, number], quat: Quaternion, w: number, h: number
    if (hasPlane) {
      const po = String(p.planeOrigin).split(',').map(Number), pn = String(p.planeNormal).split(',').map(Number)
      pos = [po[0] || 0, po[1] || 0, po[2] || 0]
      quat = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(pn[0] || 0, pn[1] || 0, pn[2] || 1).normalize())
      w = Math.max(sxx, syy, szz); h = w
    } else {
      const axis = String(p.axis || 'Z'), off = +p.offset || 0
      pos = axis === 'X' ? [off, 0, 0] : axis === 'Y' ? [0, off, 0] : [0, 0, off]
      quat = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), axis === 'X' ? new Vector3(1, 0, 0) : axis === 'Y' ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1))
      w = axis === 'X' ? syy : sxx; h = axis === 'X' ? szz : axis === 'Y' ? szz : syy
      if (axis === 'Z') { pos = [(xn + xp) / 2, (yn + yp) / 2, off] } else if (axis === 'X') { pos = [off, (yn + yp) / 2, (zn + zp) / 2] } else { pos = [(xn + xp) / 2, off, (zn + zp) / 2] }
    }
    return (
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {gmesh2}
        <group position={pos} quaternion={quat}>
          <mesh><planeGeometry args={[w, h]} /><meshBasicMaterial color="#e0a81e" transparent opacity={0.35} side={DoubleSide} depthWrite={false} /></mesh>
        </group>
      </group>
    )
  }
  if (k === 'move' || k === 'scale') {
    // body centre (CAD coords — bodyMesh.vertices are CAD)
    const v = bodyMesh.vertices; let b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]
    for (let i = 0; i < v.length; i += 3) for (let j = 0; j < 3; j++) { if (v[i + j] < b[j]) b[j] = v[i + j]; if (v[i + j] > b[j + 3]) b[j + 3] = v[i + j] }
    const c: [number, number, number] = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2]
    const gmesh = <mesh geometry={geom}><meshBasicMaterial color="#1aa0ff" transparent opacity={0.25} depthWrite={false} /></mesh>
    if (k === 'scale') {
      const f = +p.factor || 1
      // P2：ghost 同 worker 同口径 — 绕基准点缩放（translate→scale→translate 嵌套）
      const px = +p.px || 0, py = +p.py || 0, pz = +p.pz || 0
      return <group rotation={[-Math.PI / 2, 0, 0]}><group position={[px, py, pz]}><group scale={[f, f, f]}><group position={[-px, -py, -pz]}>{gmesh}</group></group></group></group>
    }
    const dx = +p.dx || 0, dy = +p.dy || 0, dz = +p.dz || 0, rx = (+p.rx || 0) * D, ry = (+p.ry || 0) * D, rz = (+p.rz || 0) * D
    // worker: rotate about body centre, then translate
    return (
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <group position={[dx, dy, dz]}>
          <group position={c}><group rotation={[rx, ry, rz]}><group position={[-c[0], -c[1], -c[2]]}>{gmesh}</group></group></group>
        </group>
      </group>
    )
  }
  const ghost = (key: string, inner: ReactNode) => <group key={key}>{inner}</group>
  const gm = () => <mesh geometry={geom}><meshBasicMaterial color="#1aa0ff" transparent opacity={0.22} depthWrite={false} /></mesh>
  const ghosts: ReactNode[] = []
  if (k === 'pattern') {
    const cx = Math.max(1, Math.round(+p.countX || 1)), cy = Math.max(1, Math.round(+p.countY || 1)), cz = Math.max(1, Math.round(+p.countZ || 1))
    // P2：extent（总长）模式 — 预览同 commit 一样换算 spacing = extent/(qty−1)，预览先同实际一致
    const ext = p.dtype === 'extent'
    const sp = (v: number, c: number) => (ext ? (c > 1 ? v / (c - 1) : 0) : v)
    const dx = sp(+p.dx || 0, cx), dy = sp(+p.dy || 0, cy), dz = sp(+p.dz || 0, cz)
    for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) for (let m = 0; m < cz; m++) {
      if (i === 0 && j === 0 && m === 0) continue
      ghosts.push(ghost(`p${i}_${j}_${m}`, <group position={[i * dx, j * dy, m * dz]}>{gm()}</group>))
    }
  } else if (k === 'cpattern') {
    const n = Math.max(2, Math.round(+p.count || 2)), ang = +p.angle || 360, axis = String(p.axis || 'Z')
    const ctr: [number, number, number] = [+p.cx || 0, +p.cy || 0, +p.cz || 0]
    // T757 修：部分弧 worker 用 angle/(n−1)（端点含），预览以前永远 /n — 同步返先唔会预览同实际唔一致
    const step = Math.abs(ang) >= 359.9 ? ang / n : ang / (n - 1)
    for (let i = 1; i < n; i++) {
      const a = step * i * D
      const rot: [number, number, number] = axis === 'X' ? [a, 0, 0] : axis === 'Y' ? [0, a, 0] : [0, 0, a]
      ghosts.push(ghost('c' + i, <group position={ctr}><group rotation={rot}><group position={[-ctr[0], -ctr[1], -ctr[2]]}>{gm()}</group></group></group>))
    }
  } else if (k === 'circpattern') {
    // T757：任意轴 ghost — 同 worker cpAngles 同一套角度（保持同步！），quaternion 绕 CAD 轴
    //（ghosts 喺 Rx(-90°) 组内 = CAD 空间，axis 直接用 CAD 分量）
    const n = Math.max(2, Math.round(+p.count || 2))
    const mode = p.mode === 'angle' || p.mode === 'sym' ? String(p.mode) : 'full'
    const total = mode === 'full' ? 360 : (+p.totalAngle || 360)
    const angles: number[] = []
    if (mode === 'sym') {
      const stp = total / (n - 1), half = Math.floor((n - 1) / 2)
      for (let kk = 1; kk <= half; kk++) { angles.push(stp * kk); angles.push(-stp * kk) }
      if ((n - 1) % 2 === 1) angles.push(stp * (half + 1))
    } else {
      const stp = (mode === 'full' || Math.abs(total) >= 359.9) ? total / n : total / (n - 1)
      for (let i = 1; i < n; i++) angles.push(stp * i)
    }
    const ctr: [number, number, number] = [+p.ox || 0, +p.oy || 0, +p.oz || 0]
    const dv = new Vector3(+p.dx || 0, +p.dy || 0, +p.dz || 0)
    if (dv.lengthSq() > 1e-12) {
      dv.normalize()
      angles.forEach((adeg, i) => {
        const q = new Quaternion().setFromAxisAngle(dv, adeg * D)
        ghosts.push(ghost('cc' + i, <group position={ctr}><group quaternion={q}><group position={[-ctr[0], -ctr[1], -ctr[2]]}>{gm()}</group></group></group>))
      })
    }
  } else {
    const plane = String(p.plane || 'YZ'), off = +p.offset || 0
    const scale: [number, number, number] = plane === 'YZ' ? [-1, 1, 1] : plane === 'XZ' ? [1, -1, 1] : [1, 1, -1]
    const pos: [number, number, number] = plane === 'YZ' ? [2 * off, 0, 0] : plane === 'XZ' ? [0, 2 * off, 0] : [0, 0, 2 * off]
    ghosts.push(ghost('m', <group position={pos}><group scale={scale}>{gm()}</group></group>))
  }
  return <group rotation={[-Math.PI / 2, 0, 0]}>{ghosts}</group>
}

// Closed-loop planar 4-bar linkage: 4 rigid links (ground/crank/coupler/rocker) drawn in the XY view
// plane, posed by the constraint solver (solve4Bar). Drive the crank → coupler/rocker follow rigidly.
// 体素趋势 FEA 云图配色：t∈[0,1] 蓝→青→绿→黄→红，红 = 最受力。
// S112：换 Google「turbo」感知均匀配色（多项式拟合，无依赖）取代 jet —— jet 喺绿黄段有亮度伪边/误读，
// turbo 亮度单调、无假边界。一处改全部 overlay（Fea/Modal/Buckling/Mold）共用受益。
function feaColor(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t))
  const r = 0.13572138 + x * (4.61539260 + x * (-42.66032258 + x * (132.13108234 + x * (-152.94239396 + x * 59.28637943))))
  const g = 0.09140261 + x * (2.19418839 + x * (4.84296658 + x * (-14.18503333 + x * (4.27729857 + x * 2.82956604))))
  const b = 0.10667330 + x * (12.64194608 + x * (-60.58204836 + x * (110.36276771 + x * (-89.90310912 + x * 27.34824973))))
  const cl = (v: number) => Math.max(0, Math.min(1, v))
  return [cl(r), cl(g), cl(b)]
}

// FEA 受力云图 overlay：每个实心体素一个 instanced 方块（CAD 坐标，喺 Rx(-90°) 组内），
// 颜色 = von Mises / vmMax；⚠ 红球 = 最大应力位（「最可能断嘅位」）。
function FeaOverlay() {
  const res = useApp((s) => s.feaResult)
  const field = useApp((s) => s.feaField)   // S96：应力 vm / 位移 disp
  const fatigueCase = useApp((s) => s.feaFatigueCase)   // S183：疲劳工况
  const deform = useApp((s) => s.feaDeform)   // S168：变形形态显示/动画/放大
  const probeOn = useApp((s) => s.feaProbeOn)   // S170：结果探针模式（开时体素可拣读值）
  const ref = useRef<InstancedMesh | null>(null)
  const hotRef = useRef<Mesh | null>(null)   // S168：红球 — 变形时随其体素 dispVec 偏移（唔好留喺未变形位）
  const markRef = useRef<number>(-1)   // ★ 红球所指体素 index = 当前【显示场】最红嗰个（位移场→中间挠度最大；应力场→最大应力）。跟住着色，唔会指错位。
  const n = res ? res.vm.length : 0
  const obj = useMemo(() => new Object3D(), [])
  // S168：变形 auto-fit 振幅 = 0.14×模型最大轴向 / dispMax（令最大变形 ≈ 14% 模型尺寸，恒可见，同 ModalOverlay 视觉一致）。
  // dispVec 缺失（旧结果）/dispMax 非有限/≈0 → autoAmp=0 = 唔变形（诚实：无可信位移就唔郁）。
  const autoAmp = useMemo(() => {
    if (!res || !n || !res.dispVec || res.dispVec.length !== n * 3) return 0
    if (!Number.isFinite(res.dispMax) || res.dispMax <= 1e-12) return 0
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity
    for (let i = 0; i < n; i++) { const x = res.centers[i * 3], y = res.centers[i * 3 + 1], z = res.centers[i * 3 + 2]; if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z; if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z }
    const ext = Math.max(mxx - mnx, mxy - mny, mxz - mnz, res.h)
    return 0.14 * ext / res.dispMax
  }, [res, n])
  const canDeform = autoAmp > 0
  // ★ 变形振幅 amp = (实尺 1 / 放大固定增益 mag) × 微调倍率 scale。【永远 ∝ 真实位移 dispVec ∝ 力】→ 5N/500N 一定唔同。
  //   ⚠ 唔再用 autoAmp(=0.14×ext/dispMax，∝1/dispMax) 做 amp —— 嗰个反比 dispMax 会【抵消晒力】令 5N/500N 显示一样（用户报嘅 bug，已修）。
  //   autoAmp 只保留畀面板「🔍放大睇清楚」按钮做一次性建议增益（撳完写入 deform.mag 锁定，之后唔随 dispMax 变）。
  const amp = (deform.real ? 1 : deform.mag) * deform.scale
  useEffect(() => {
    const im = ref.current
    if (!im || !res || !n) return
    const m = new Object3D()
    const col = new Color()
    // S102[2]：安全系数场 sf=σy/vm，反向着色（SF 低→t 高→红=危险）；封顶 SF_CAP 避免无应力区 sf→∞ 全场蓝
    const SF_CAP = 5
    // S115：'vmSmooth' = 节点平均平滑应力（per-voxel，喂返同一 overlay）；用平滑场自身峰值归一
    // S164：选 σ1/σ3/τ 但当前结果无主应力场（例：热应力解唔出主应力）→ 退回 vm 着色，免 mx 错乱出全红/全蓝垃圾
    const has = (a?: Float32Array) => !!a && a.length === n
    const ef = (field === 's1' && !has(res.s1)) || (field === 's3' && !has(res.s3)) || (field === 'shear' && !has(res.shear)) || (field === 'sed' && !has(res.sed)) ? 'vm' : field
    const arr = ef === 'disp' && has(res.disp) ? res.disp!
      : ef === 'vmSmooth' && has(res.vmSmooth) ? res.vmSmooth!
      : ef === 's1' ? res.s1!
      : ef === 's3' ? res.s3!
      : ef === 'shear' ? res.shear!
      : ef === 'sed' ? res.sed!
      : res.vm
    // S164：σ1 按拉(正)着色、σ3 按压(负的绝对值)着色、τmax 同 vm（≥0）。σ1Max 可为负(全场受压) → Math.max(…,1e-9) 防负分母令拉应力热点反相成蓝。S167：sed≥0 同 vm。
    const mx = ef === 'disp' ? (res.dispMax || 1e-9) : ef === 'vmSmooth' ? (res.vmSmoothMax || res.vmMax || 1e-9)
      : ef === 's1' ? Math.max(res.s1Max || 0, 1e-9) : ef === 's3' ? Math.max(Math.abs(res.s3Min || 0), 1e-9) : ef === 'shear' ? Math.max(res.shearMax || 0, 1e-9)
      : ef === 'sed' ? Math.max(res.sedMax || 0, 1e-12)
      : (res.vmMax || 1e-9)
    // S168：静态变形位置 — 显示变形且非动画时 bake 满幅；否则原位（动画态由 useFrame 接管矩阵）。
    const dv = res.dispVec
    const staticAmp = (deform.show && !deform.anim && canDeform && dv) ? amp : 0
    let maxT = -1, maxTi = -1   // ★ 追踪当前显示场最红体素 → 红球指返佢（位移场=中间，应力场=最大应力，永远同着色一致）
    for (let i = 0; i < n; i++) {
      if (staticAmp && dv) m.position.set(res.centers[i * 3] + dv[i * 3] * staticAmp, res.centers[i * 3 + 1] + dv[i * 3 + 1] * staticAmp, res.centers[i * 3 + 2] + dv[i * 3 + 2] * staticAmp)
      else m.position.set(res.centers[i * 3], res.centers[i * 3 + 1], res.centers[i * 3 + 2])
      m.updateMatrix()
      im.setMatrixAt(i, m.matrix)
      let t: number
      if (ef === 'fos') {
        // S183 modified-Goodman 疲劳安全系数 n = 1/(σa/se + σm/su)；按工况定 σa(交变)/σm(均值)。压均值(σm<0)对疲劳有益 → 置 0。
        const se = res.se || res.sy || 1, su = res.su || (res.sy ? res.sy * 1.6 : 1)
        const vm = res.vm[i]
        let sa: number, sm: number
        if (fatigueCase === 'rev') { sa = vm; sm = 0 }                                                       // R=−1 全反向
        else if (fatigueCase === 'static') { sm = (has(res.s1) && has(res.s3)) ? (res.s1![i] + res.s3![i]) / 2 : 0; sa = vm }  // 静态等效（均≈(σ1+σ3)/2）
        else { sa = vm / 2; sm = vm / 2 }                                                                    // R=0 脉动（默认保守）
        const denom = sa / se + Math.max(0, sm) / su
        const nF = denom > 1e-12 ? 1 / denom : SF_CAP
        t = 1 - Math.min(1, nF / SF_CAP)
      }
      else if (ef === 'sf') { const sf = res.sy / Math.max(res.vm[i], 1e-9); t = 1 - Math.min(1, sf / SF_CAP) }
      else if (ef === 's1') t = Math.min(1, Math.max(0, arr[i]) / mx)    // 拉应力热点→红，受压区→蓝
      else if (ef === 's3') t = Math.min(1, Math.max(0, -arr[i]) / mx)   // 压应力热点(σ3 最负)→红
      else t = Math.min(1, arr[i] / mx)
      if (t > maxT) { maxT = t; maxTi = i }
      const [r, g, b] = feaColor(t)
      im.setColorAt(i, col.setRGB(r, g, b))
    }
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    markRef.current = maxTi
    // ★ 红球钉喺当前显示场最红体素（应力场=最大应力位/最可能断；位移场=中间挠度最大）。变形时随其体素 dispVec 偏移；动画态由 useFrame 接管。
    //   退化（maxTi<0，例如全场零）→ 退返 vmMaxAt（旧行为）。
    const hr = hotRef.current
    if (hr) {
      if (maxTi >= 0) {
        const off = staticAmp && dv ? staticAmp : 0
        hr.position.set(res.centers[maxTi * 3] + (dv ? dv[maxTi * 3] * off : 0), res.centers[maxTi * 3 + 1] + (dv ? dv[maxTi * 3 + 1] * off : 0), res.centers[maxTi * 3 + 2] + (dv ? dv[maxTi * 3 + 2] * off : 0))
      } else hr.position.set(res.vmMaxAt[0], res.vmMaxAt[1], res.vmMaxAt[2])
    }
  }, [res, n, field, fatigueCase, deform.show, deform.anim, deform.scale, deform.real, deform.mag, amp, canDeform, obj])
  // S168：变形动画 — 仅 show&&anim&&可变形 时逐帧沿真实位移向量摆动（非动画/非显示 → 零开销早返，回归 = 旧静态行为）。
  //   摆动用 (1−cos)/2 ∈ [0,1] 单向：由原位(直) → 满幅变形 → 返原位（受力变形物理上唔会向反方向过冲，比旧 sin 双向更真实）。
  useFrame((state) => {
    const im = ref.current
    if (!im || !res || !n || !deform.show || !deform.anim || !canDeform || !res.dispVec) return
    const dv = res.dispVec
    const t = ((1 - Math.cos(state.clock.elapsedTime * 3)) / 2) * amp
    for (let i = 0; i < n; i++) {
      obj.position.set(res.centers[i * 3] + dv[i * 3] * t, res.centers[i * 3 + 1] + dv[i * 3 + 1] * t, res.centers[i * 3 + 2] + dv[i * 3 + 2] * t)
      obj.updateMatrix()
      im.setMatrixAt(i, obj.matrix)
    }
    im.instanceMatrix.needsUpdate = true
    // S170 audit（LOW）：变形动画逐帧改实例矩阵后，废除缓存嘅 boundingSphere（three 只 lazy 算一次并硬剔除 raycast）→
    //   否则探针点击喺摆动极端相位会落喺旧 cull 球外被剔（点击无反应）。设 null → 下次 raycast 先 lazy 重算（每次点击 O(n) 一次，非每帧）。
    im.boundingSphere = null
    // S168：红球同步逐帧摆动（跟其体素 dispVec），唔会留喺未变形位。e = 当前显示场最红体素 index（markRef）。
    const hr = hotRef.current, e = markRef.current
    if (hr && e >= 0 && e < n) hr.position.set(res.centers[e * 3] + dv[e * 3] * t, res.centers[e * 3 + 1] + dv[e * 3 + 1] * t, res.centers[e * 3 + 2] + dv[e * 3 + 2] * t)
  })
  if (!res || !n) return null
  const s = res.h * 0.94
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {/* key 迫使 n 变时重建 instancedMesh（实例数构造时锁死）。S170：探针开 → 默认 instanced raycast + onClick 拣体素读值；关 → raycast 禁用（零开销，回归旧行为）。
          S170 audit（MED）：拣体素用 three 默认 instanced raycast（O(nVox)/每次 hover-over-model）。体素 >PROBE_CAP（4万）时禁用 picking（保 hover 流畅；硬上限 8 万）— 降分辨率再探针。 */}
      <instancedMesh key={n + ':' + res.vmMax.toFixed(4)} ref={ref} args={[undefined, undefined, n]} frustumCulled={false}
        {...((probeOn && n <= 40000)
          ? { onClick: (e: { stopPropagation: () => void; instanceId?: number }) => { e.stopPropagation(); if (typeof e.instanceId === 'number') useApp.setState({ feaProbe: e.instanceId }) } }
          : { raycast: () => null })}>
        <boxGeometry args={[s, s, s]} />
        <meshBasicMaterial transparent opacity={0.85} toneMapped={false} />
      </instancedMesh>
      <mesh ref={hotRef} position={res.vmMaxAt} renderOrder={999} raycast={() => null}>
        <sphereGeometry args={[Math.max(2, res.h * 0.8), 16, 16]} />
        <meshBasicMaterial color="#ff1100" depthTest={false} transparent opacity={0.9} />
      </mesh>
    </group>
  )
}

// 模流时间格式化：≥120s 加分钟（非程序员唔使心算 2254s 系几耐）。
function fmtSec(x: number): string {
  const f = x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)
  return x >= 120 ? `${f}s（≈${(x / 60).toFixed(1)}分钟）` : `${f}s`
}

// 模流精细度滑杆嘅【预计耗时 + 体素数】估算（运行前畀用户确认）。由 bodyMesh bbox/体积/面积估壁厚→自动加密后有效分辨率→体素数→时间。
// 时间系数由实测校准（用户件 6824 体素求解器 ≈ 12–15s 浏览器）。系估算，标「约」。
function estimateMold(mesh: { vertices: ArrayLike<number>; triangles: ArrayLike<number> } | null, res: number, solver: boolean): { effRes: number; nVox: number; sec: number; bumped: boolean } | null {
  if (!mesh || !mesh.vertices || !mesh.vertices.length || !mesh.triangles || !mesh.triangles.length) return null
  const v = mesh.vertices, t = mesh.triangles
  let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9
  for (let i = 0; i < v.length; i += 3) { const x = v[i] as number, y = v[i + 1] as number, z = v[i + 2] as number; if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; if (z < mnz) mnz = z; if (z > mxz) mxz = z }
  const ex = mxx - mnx, ey = mxy - mny, ez = mxz - mnz, longest = Math.max(ex, ey, ez)
  if (!(longest > 0)) return null
  let sv = 0, area = 0
  for (let i = 0; i < t.length; i += 3) {
    const a = (t[i] as number) * 3, b = (t[i + 1] as number) * 3, c = (t[i + 2] as number) * 3
    sv += (v[a] as number) * ((v[b + 1] as number) * (v[c + 2] as number) - (v[c + 1] as number) * (v[b + 2] as number)) - (v[a + 1] as number) * ((v[b] as number) * (v[c + 2] as number) - (v[c] as number) * (v[b + 2] as number)) + (v[a + 2] as number) * ((v[b] as number) * (v[c + 1] as number) - (v[c] as number) * (v[b + 1] as number))
    const ux = (v[b] as number) - (v[a] as number), uy = (v[b + 1] as number) - (v[a + 1] as number), uz = (v[b + 2] as number) - (v[a + 2] as number)
    const wx = (v[c] as number) - (v[a] as number), wy = (v[c + 1] as number) - (v[a + 1] as number), wz = (v[c + 2] as number) - (v[a + 2] as number)
    const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx
    area += Math.hypot(cx, cy, cz) / 2
  }
  const vol = Math.abs(sv) / 6
  const wall = area > 1e-6 ? Math.min(longest, Math.max(0.3, 2 * vol / area)) : longest   // 估壁厚 ≈ 2V/A（薄壳）
  const effRes = Math.max(res, Math.min(64, Math.ceil(longest / wall)))                    // 自动加密底线 = min(64, longest/壁厚)；真实 AUTO_CAP=64，用户手揀先可 >64
  const h = longest / effRes
  const nVox = Math.round(Math.max(vol / (h * h * h), area / (h * h)))                       // 实心 vol/h³ vs 壳 area/h²，取大（保守）
  const sec = 0.4 + nVox * 0.00008 + (solver ? nVox * 0.0022 : 0)                            // 趋势 ~80μs/vox + 求解器 ~2.2ms/vox（浏览器，校准值）
  return { effRes, nVox, sec, bumped: effRes > res }
}

// FEA 受力方向【箭头】（用户：做成 arrow 等我睇到/微调方向）。橙箭头【尖】落喺受力点、沿力方向、穿透显示。
// 方向跟 feaDir：down=[0,0,-1] / normal=压向受力面 / custom=自订向量（下面「角度微调」即改 custom，箭头实时跟）。
function FeaForceArrow() {
  const feaMode = useApp((s) => s.feaMode)
  const load = useApp((s) => s.feaLoad)
  const dir = useApp((s) => s.feaDir)
  const custom = useApp((s) => s.feaCustomDir)
  const mode = useApp((s) => s.feaLoadMode)
  const arrow = useMemo(() => {
    if (!load) return null
    let d: [number, number, number]
    if (dir === 'custom') d = custom
    else if (dir === 'normal' && mode !== 'bearing') d = [-load.normal[0], -load.normal[1], -load.normal[2]]
    else d = [0, 0, -1]   // down（重力向）
    const v = new Vector3(d[0], d[2], -d[1])   // CAD→three 向量
    if (v.lengthSq() < 1e-9) return null
    v.normalize()
    const tip = new Vector3(load.point[0], load.point[2], -load.point[1])   // 箭头【尖】落喺受力点
    const tail = tip.clone().addScaledVector(v, -24)                         // 尾向后退 → 表示力沿 v 推入此点
    const a = new ArrowHelper(v, tail, 24, 0xff7a00, 8, 5)
    const lm = a.line.material as { depthTest?: boolean; transparent?: boolean }; lm.depthTest = false; lm.transparent = true
    const cm = a.cone.material as { depthTest?: boolean; transparent?: boolean }; cm.depthTest = false; cm.transparent = true
    a.renderOrder = 1000
    return a
  }, [load, dir, custom, mode])
  useEffect(() => () => { if (arrow) { arrow.line.geometry.dispose(); arrow.cone.geometry.dispose() } }, [arrow])
  if (feaMode <= 0 || !load || !arrow) return null
  return <primitive object={arrow} />
}

// T771（S50）：模流趋势云图 — FeaOverlay 克隆：矩阵建一次唔郁，滑杆/换场只改色（80k 实例都唔卡）。
// 充填动画：fill[i] > moldT·tFill 嘅体素暗灰（前沿未到）；焊接线体素强制紫红覆盖。
function MoldOverlay() {
  const res = useApp((s) => s.moldResult)
  const field = useApp((s) => s.moldField)
  const tT = useApp((s) => s.moldT)
  const tempView = useApp((s) => s.moldTempView)   // GM-W8 β3：切熔体温度云图（蓝 tMin → 红 tMax；仅 thermalUsed 有温度场）
  const xray = useApp((s) => s.moldXray)   // 透明：透视睇内部流动（用户要）。实色=快、半透明=睇得入但大件会慢
  const ref = useRef<InstancedMesh | null>(null)
  const n = res ? res.fill.length : 0
  useEffect(() => {   // 矩阵：res 变先重建
    const im = ref.current
    if (!im || !res || !n) return
    const m = new Object3D()
    for (let i = 0; i < n; i++) {
      m.position.set(res.centers[i * 3], res.centers[i * 3 + 1], res.centers[i * 3 + 2])
      m.updateMatrix()
      im.setMatrixAt(i, m.matrix)
    }
    im.instanceMatrix.needsUpdate = true
  }, [res, n])
  useEffect(() => {   // 颜色：场/滑杆变都只改色
    const im = ref.current
    if (!im || !res || !n) return
    const col = new Color()
    // GM-W8 β3：熔体温度云图 —— 蓝(tMin)→红(tMax)线性，未填(NaN)灰。纯温度场（唔叠焊接/困气/scrub，睇 end-of-fill 温度分布 → 边度接近冻结）。
    const useTemp = !!(tempView && res.thermalUsed && res.temp && res.tMin != null && res.tMax != null)
    if (useTemp) {
      const tp = res.temp!, tmn = res.tMin!, span = (res.tMax! - tmn) || 1
      for (let i = 0; i < n; i++) {
        const tv = tp[i]
        if (!Number.isFinite(tv)) { im.setColorAt(i, col.setRGB(0.30, 0.31, 0.34)) }               // 未填 — 灰（NaN 体素）
        else { const u = Math.max(0, Math.min(1, (tv - tmn) / span)); im.setColorAt(i, col.setRGB(u, 0.10, 1 - u)) }   // 蓝→红
      }
      if (im.instanceColor) im.instanceColor.needsUpdate = true
      return
    }
    // GM-P3UI：缩水率云图 —— 同【熔体温度】一样系「纯末态场」（唔叠焊接/困气/充填 scrub），用同款 蓝(低)→红(高) 色标。
    // 归一化范围 [smn,smx]：smx=shrinkMax；smn 由均匀度反推（moldsolve：uniformity=shrinkMin/shrinkMax）→ O(1) 且同图例标签一致。未填(NaN)灰。
    if (field === 'shrink' && res.packing) {
      const sf = res.packing.shrinkageField, smx = res.packing.shrinkMax, smn = smx * res.packing.shrinkUniformity
      const span = (smx - smn) || 1
      for (let i = 0; i < n; i++) {
        const sv = sf[i]
        if (!Number.isFinite(sv)) { im.setColorAt(i, col.setRGB(0.30, 0.31, 0.34)) }                        // 未填 — 灰（NaN 体素）
        else { const u = Math.max(0, Math.min(1, (sv - smn) / span)); im.setColorAt(i, col.setRGB(u, 0.10, 1 - u)) }   // 蓝→红
      }
      if (im.instanceColor) im.instanceColor.needsUpdate = true
      return
    }
    const arr = field === 'fill' ? res.fill : field === 'pressure' ? res.pressure : field === 'cooling' ? res.cooling : field === 'sink' ? res.sinkMark : res.warp
    let mx = 1e-12
    for (let i = 0; i < n; i++) if (arr[i] > mx) mx = arr[i]
    const tCut = tT * (res.tFill || 1)
    const unr = res.unreached
    for (let i = 0; i < n; i++) {
      if (field === 'fill' && unr && unr[i]) { im.setColorAt(i, col.setRGB(0.56, 0.57, 0.63)) }  // 前沿【完全到唔到】（孤岛/窄缝断连）— 中灰；同「填得迟嘅红」一睇就分到（红=有填到只係迟）
      else if (res.fill[i] > tCut + 1e-9) { im.setColorAt(i, col.setRGB(0.22, 0.24, 0.27)) }      // 前沿未到（充填动画中途）— 暗灰
      else if (res.airtrap && res.airtrap[i]) { im.setColorAt(i, col.setRGB(1, 0.55, 0)) }    // 困气/最后充填 — 橙（优先于焊接线：死腔点最关键）
      else if (res.weld[i]) { im.setColorAt(i, col.setRGB(1, 0.1, 0.95)) }                   // 焊接线 — 紫红
      else { const [r, g, b] = feaColor(Math.min(1, arr[i] / mx)); im.setColorAt(i, col.setRGB(r, g, b)) }
    }
    if (im.instanceColor) im.instanceColor.needsUpdate = true
  }, [res, n, field, tT, tempView])
  if (!res || !n) return null
  const s = res.h * 0.94
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <instancedMesh key={'mold' + n} ref={ref} args={[undefined, undefined, n]} frustumCulled={false} raycast={() => null}>
        <boxGeometry args={[s, s, s]} />
        {/* 实色（默认）vs 透明（moldXray，用户揿）。实色 = GPU 深度剔除遮蔽片元 → 快；透明 = 睇得到内部充填流动但大件会慢（体素 overdraw）。
            ★ 配合「模流时收埋原高面数网格」(moldHideMesh)：透明时唔再有高面数 STL 嘅 overdraw，净係体素本身 → 比以前快好多。 */}
        <meshBasicMaterial toneMapped={false} transparent={xray} opacity={xray ? 0.5 : 1} depthWrite={!xray} />
      </instancedMesh>
    </group>
  )
}

// S190：模流【流向线 / flow line】—— 用户报告"睇唔到 flow line"。沿 ∇fill（熔体由浇口往外流向）逐采样体素
// 画带箭头嘅有向线段，按充填时间上色（蓝=早/近浇口 → 红=迟/远端），depthTest 关 → 浮喺体素云之上即见。
// 默认开（moldFlowLines）。raycast 关、几何 dispose、同 −90°X group 对齐。
function MoldFlowArrows() {
  const res = useApp((s) => s.moldResult)
  const show = useApp((s) => s.moldFlowLines)
  const geo = useMemo(() => {
    if (!res || !res.fillDir || !show || !res.fill.length) return null
    const n = res.fill.length
    const L = res.h * 0.9, stride = Math.max(1, Math.floor(n / 450))
    let mx = 1e-12; for (let i = 0; i < n; i++) if (res.fill[i] > mx) mx = res.fill[i]
    const pos: number[] = [], col: number[] = []
    for (let e = 0; e < n; e += stride) {
      const dx = res.fillDir[e * 3], dy = res.fillDir[e * 3 + 1], dz = res.fillDir[e * 3 + 2]
      if (dx === 0 && dy === 0 && dz === 0) continue
      const x = res.centers[e * 3], y = res.centers[e * 3 + 1], z = res.centers[e * 3 + 2]
      const tx = x + dx * L, ty = y + dy * L, tz = z + dz * L
      const [r, g, b] = feaColor(Math.min(1, res.fill[e] / mx))
      pos.push(x, y, z, tx, ty, tz); col.push(r, g, b, r, g, b)   // 箭杆
      // 箭头：tip 往后两条短斜线（用任一垂直基向量）
      let ux = -dy, uy = dx, uz = 0; let ul = Math.hypot(ux, uy, uz); if (ul < 1e-6) { ux = 0; uy = -dz; uz = dy; ul = Math.hypot(ux, uy, uz) || 1 }
      ux /= ul; uy /= ul; uz /= ul
      const hb = L * 0.34, bx = tx - dx * hb, by = ty - dy * hb, bz = tz - dz * hb, w = hb * 0.7
      pos.push(tx, ty, tz, bx + ux * w, by + uy * w, bz + uz * w); col.push(r, g, b, r, g, b)
      pos.push(tx, ty, tz, bx - ux * w, by - uy * w, bz - uz * w); col.push(r, g, b, r, g, b)
    }
    if (!pos.length) return null
    const gg = new BufferGeometry()
    gg.setAttribute('position', new Float32BufferAttribute(pos, 3))
    gg.setAttribute('color', new Float32BufferAttribute(col, 3))
    return gg
  }, [res, show])
  useEffect(() => () => geo?.dispose(), [geo])
  if (!geo) return null
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <lineSegments geometry={geo} renderOrder={7} raycast={() => null}>
        <lineBasicMaterial vertexColors transparent opacity={0.95} toneMapped={false} depthTest={false} />
      </lineSegments>
    </group>
  )
}

// 风洞表面着色：表面体素按 Cp（压力系数：红=迎风高压滞点 / 蓝=背风吸力）或 表面流速 上色。镜 MoldOverlay。
function WindOverlay() {
  const res = useApp((s) => s.windResult)
  const field = useApp((s) => s.windField)
  const xray = useApp((s) => s.windXray)
  const ref = useRef<InstancedMesh | null>(null)
  const n = res ? res.nSurf : 0
  useEffect(() => {   // 矩阵：res 变先重建
    const im = ref.current
    if (!im || !res || !n) return
    const m = new Object3D()
    for (let i = 0; i < n; i++) { m.position.set(res.centers[i * 3], res.centers[i * 3 + 1], res.centers[i * 3 + 2]); m.updateMatrix(); im.setMatrixAt(i, m.matrix) }
    im.instanceMatrix.needsUpdate = true
  }, [res, n])
  useEffect(() => {   // 颜色：场变重设
    const im = ref.current
    if (!im || !res || !n) return
    const col = new Color()
    if (field === 'speed') {
      let mx = 1e-9; for (let i = 0; i < n; i++) if (res.surfSpeed[i] > mx) mx = res.surfSpeed[i]
      for (let i = 0; i < n; i++) { const [r, g, b] = feaColor(Math.min(1, res.surfSpeed[i] / mx)); im.setColorAt(i, col.setRGB(r, g, b)) }
    } else {
      const cpA = Math.max(Math.abs(res.cpMin), Math.abs(res.cpMax), 1e-6)
      for (let i = 0; i < n; i++) {
        const t = Math.max(-1, Math.min(1, res.cp[i] / cpA))   // -1(吸力蓝) .. 0(白) .. +1(高压红)
        let r: number, g: number, b: number
        if (t >= 0) { r = 1; g = 1 - t * 0.82; b = 1 - t } else { const u = -t; r = 1 - u; g = 1 - u * 0.5; b = 1 }
        im.setColorAt(i, col.setRGB(r, g, b))
      }
    }
    if (im.instanceColor) im.instanceColor.needsUpdate = true
  }, [res, n, field])
  if (!res || !n) return null
  const s = res.h * 0.96
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {/* renderOrder=-2：★穿模修★ 要喺零件 depth-mask(-1) 之【前】画，Cp 颜色先入到 framebuffer 唔会俾 mask 剔走 */}
      <instancedMesh key={'wind' + n} ref={ref} args={[undefined, undefined, n]} frustumCulled={false} renderOrder={-2} raycast={() => null}>
        <boxGeometry args={[s, s, s]} />
        <meshBasicMaterial toneMapped={false} transparent={xray} opacity={xray ? 0.45 : 1} depthWrite={!xray} />
      </instancedMesh>
    </group>
  )
}

// GM-W3 3.1：CFD 流速色标（深蓝 → 青 → 黄 → 红），对标商用软件流线着色（慢/尾流停滞 → 快/绕流加速）。
const WIND_CMAP: [number, number, number][] = [
  [0.03, 0.12, 0.48],  // 深蓝
  [0.05, 0.75, 0.95],  // 青
  [0.98, 0.86, 0.15],  // 黄
  [0.90, 0.13, 0.08],  // 红
]
function windSpeedColor(t: number): [number, number, number] {
  const u = Math.max(0, Math.min(1, t)) * (WIND_CMAP.length - 1)
  const i = Math.min(WIND_CMAP.length - 2, Math.floor(u)), fr = u - i
  const a = WIND_CMAP[i], b = WIND_CMAP[i + 1]
  return [a[0] + (b[0] - a[0]) * fr, a[1] + (b[1] - a[1]) * fr, a[2] + (b[2] - a[2]) * fr]
}

// 风场流线/箭头（GM-W3 3.1）：默认【流线】= 真 RK2 流线，按局部速度着色（深蓝→红）+ 动画流动点显示流向（专业 CFD 风格）；
// 可切【箭头】= 旧速度向量箭头（保留做对照/兼容）。both modes 都由 windShowFlow 总开关控。镜 MoldFlowArrows。
function WindFlowArrows() {
  const res = useApp((s) => s.windResult)
  const show = useApp((s) => s.windShowFlow)
  const viz = useApp((s) => s.windViz)
  // ── 箭头模式（旧行为）──
  const arrowGeo = useMemo(() => {
    if (!res || !show || viz !== 'arrow' || !res.flowPts.length) return null
    const n = res.flowPts.length / 3
    const L = res.h * 1.7, stride = Math.max(1, Math.floor(n / 650))
    const mx = res.flowSpeedMax || 1e-6
    const pos: number[] = [], col: number[] = []
    for (let e = 0; e < n; e += stride) {
      const vx = res.flowVel[e * 3], vy = res.flowVel[e * 3 + 1], vz = res.flowVel[e * 3 + 2]
      const sp = Math.hypot(vx, vy, vz); if (sp < mx * 0.05) continue
      const ux = vx / sp, uy = vy / sp, uz = vz / sp
      const x = res.flowPts[e * 3], y = res.flowPts[e * 3 + 1], z = res.flowPts[e * 3 + 2]
      const len = L * (0.4 + 0.6 * Math.min(1, sp / mx))
      const tx = x + ux * len, ty = y + uy * len, tz = z + uz * len
      const [r, g, b] = feaColor(Math.min(1, sp / mx))
      pos.push(x, y, z, tx, ty, tz); col.push(r, g, b, r, g, b)
      let ax = -uy, ay = ux, az = 0; let al = Math.hypot(ax, ay, az); if (al < 1e-6) { ax = 0; ay = -uz; az = uy; al = Math.hypot(ax, ay, az) || 1 }
      ax /= al; ay /= al; az /= al
      const hb = len * 0.3, bx = tx - ux * hb, by = ty - uy * hb, bz = tz - uz * hb, w = hb * 0.6
      pos.push(tx, ty, tz, bx + ax * w, by + ay * w, bz + az * w); col.push(r, g, b, r, g, b)
      pos.push(tx, ty, tz, bx - ax * w, by - ay * w, bz - az * w); col.push(r, g, b, r, g, b)
    }
    if (!pos.length) return null
    const gg = new BufferGeometry()
    gg.setAttribute('position', new Float32BufferAttribute(pos, 3))
    gg.setAttribute('color', new Float32BufferAttribute(col, 3))
    return gg
  }, [res, show, viz])
  // ── 流线模式（GM-W3 3.1）：静态彩色流线（顶点色=局部速度）+ 动画流动点（沿线向下游 = 显示流向）──
  const stream = useMemo(() => {
    if (!res || !show || viz !== 'stream' || !res.streamPts || !res.streamSpeed || !res.streamLineOffsets || res.streamPts.length < 6) return null
    const pts = res.streamPts, spd = res.streamSpeed, off = res.streamLineOffsets
    const mx = res.streamSpeedMax || 1e-6
    const nLines = off.length - 1
    const segPos: number[] = [], segCol: number[] = []
    const dots: { off: number; cnt: number; t0: number }[] = []
    for (let li = 0; li < nLines; li++) {
      const a0 = off[li], cnt = off[li + 1] - a0
      if (cnt < 2) continue
      for (let i = 0; i < cnt - 1; i++) {
        const a = a0 + i, b = a0 + i + 1
        segPos.push(pts[a * 3], pts[a * 3 + 1], pts[a * 3 + 2], pts[b * 3], pts[b * 3 + 1], pts[b * 3 + 2])
        const ca = windSpeedColor(spd[a] / mx), cb = windSpeedColor(spd[b] / mx)
        segCol.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2])
      }
      const nd = Math.max(1, Math.min(4, Math.round(cnt / 30)))   // 每线 1~4 颗流动点
      for (let k = 0; k < nd; k++) dots.push({ off: a0, cnt, t0: ((k + 0.37 * li) / nd) % 1 })
    }
    if (!segPos.length) return null
    const segGeo = new BufferGeometry()
    segGeo.setAttribute('position', new Float32BufferAttribute(segPos, 3))
    segGeo.setAttribute('color', new Float32BufferAttribute(segCol, 3))
    const dotGeo = new BufferGeometry()
    dotGeo.setAttribute('position', new Float32BufferAttribute(new Float32Array(dots.length * 3), 3))
    return { segGeo, dotGeo, dots, pts }
  }, [res, show, viz])
  useEffect(() => () => arrowGeo?.dispose(), [arrowGeo])
  useEffect(() => () => { stream?.segGeo.dispose(); stream?.dotGeo.dispose() }, [stream])
  useFrame((state) => {   // GM-W3 3.1：流动点沿流线向下游行 = 显示流向（步长 ~等弧长，index 分数 ≈ 弧长分数）
    if (!stream) return
    const t = state.clock.elapsedTime * 0.12
    const arr = stream.dotGeo.attributes.position.array as Float32Array
    const pts = stream.pts
    for (let d = 0; d < stream.dots.length; d++) {
      const { off, cnt, t0 } = stream.dots[d]
      const fpos = ((t + t0) % 1) * (cnt - 1)
      const j = Math.floor(fpos), fr = fpos - j
      const a = (off + j) * 3, b = (off + Math.min(cnt - 1, j + 1)) * 3
      arr[d * 3] = pts[a] + (pts[b] - pts[a]) * fr
      arr[d * 3 + 1] = pts[a + 1] + (pts[b + 1] - pts[a + 1]) * fr
      arr[d * 3 + 2] = pts[a + 2] + (pts[b + 2] - pts[a + 2]) * fr
    }
    stream.dotGeo.attributes.position.needsUpdate = true
  })
  if (!res || !show) return null
  if (viz === 'arrow') {
    if (!arrowGeo) return null
    return (
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <lineSegments geometry={arrowGeo} renderOrder={6} raycast={() => null}>
          {/* ★穿模修★ depthTest：旧版 false = 唔理深度一律画喺零件上面 → 件后面嘅箭头都叠上嚟，睇落好似「风穿过个模型」。
              改 true = 零件真系遮得住流场（要睇内部就撳「透明」— 嗰阵零件唔写 depth，后面嘅照样透得出）。 */}
          <lineBasicMaterial vertexColors transparent opacity={0.85} toneMapped={false} depthTest />
        </lineSegments>
      </group>
    )
  }
  if (!stream) return null
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <lineSegments geometry={stream.segGeo} renderOrder={6} raycast={() => null}>
        {/* ★穿模修★ 同上：depthTest 开返 → 流线唔会再浮喺零件前面（空间感 + 唔会误会成风穿过件） */}
        <lineBasicMaterial vertexColors transparent opacity={0.92} toneMapped={false} depthTest />
      </lineSegments>
      <points geometry={stream.dotGeo} renderOrder={7} raycast={() => null}>
        <pointsMaterial size={res.h * 1.4} sizeAttenuation transparent opacity={0.95} color={'#eaf6ff'} depthTest toneMapped={false} />
      </points>
    </group>
  )
}

// S80：模态分析振型云 — FeaOverlay 克隆 + useFrame 振型动画。
// 位置逐帧沿所选阶振型 sin 摆动（视觉放大示意，唔系真实位移量），颜色 = 该阶位移幅值。
function ModalOverlay() {
  const res = useApp((s) => s.modalResult)
  const show = useApp((s) => s.modalShow)
  const ref = useRef<InstancedMesh | null>(null)
  const n = res ? res.centers.length / 3 : 0
  // 振幅 = 模型最大轴向 × 0.14（振型已归一 max|d|=1，呢度净系睇形状）
  const amp = useMemo(() => {
    if (!res || !n) return 0
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity
    for (let i = 0; i < n; i++) { const x = res.centers[i * 3], y = res.centers[i * 3 + 1], z = res.centers[i * 3 + 2]; if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z; if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z }
    return 0.14 * Math.max(mxx - mnx, mxy - mny, mxz - mnz, res.h)
  }, [res, n])
  const obj = useMemo(() => new Object3D(), [])
  useEffect(() => {   // 颜色（幅值）：res / 阶变重设
    const im = ref.current
    if (!im || !res || !n) return
    const col = new Color()
    const a = res.amps[show] || res.amps[0]
    for (let i = 0; i < n; i++) { const [r, g, b] = feaColor(Math.min(1, a[i])); im.setColorAt(i, col.setRGB(r, g, b)) }
    if (im.instanceColor) im.instanceColor.needsUpdate = true
  }, [res, n, show])
  useFrame((state) => {   // 位置：逐帧沿振型摆动
    const im = ref.current
    if (!im || !res || !n) return
    const sh = res.shapes[show] || res.shapes[0]
    const t = Math.sin(state.clock.elapsedTime * 6) * amp
    for (let i = 0; i < n; i++) {
      obj.position.set(res.centers[i * 3] + sh[i * 3] * t, res.centers[i * 3 + 1] + sh[i * 3 + 1] * t, res.centers[i * 3 + 2] + sh[i * 3 + 2] * t)
      obj.updateMatrix()
      im.setMatrixAt(i, obj.matrix)
    }
    im.instanceMatrix.needsUpdate = true
  })
  if (!res || !n) return null
  const s = res.h * 0.9
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <instancedMesh key={'modal' + n + ':' + show} ref={ref} args={[undefined, undefined, n]} frustumCulled={false} raycast={() => null}>
        <boxGeometry args={[s, s, s]} />
        <meshBasicMaterial transparent opacity={0.85} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

// S82：屈曲振型云 — ModalOverlay 同款，单一屈曲模态，useFrame 沿振型摆动 + 幅值着色。
function BucklingOverlay() {
  const res = useApp((s) => s.bucklingResult)
  const ref = useRef<InstancedMesh | null>(null)
  const n = res ? res.centers.length / 3 : 0
  const amp = useMemo(() => {
    if (!res || !n) return 0
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity
    for (let i = 0; i < n; i++) { const x = res.centers[i * 3], y = res.centers[i * 3 + 1], z = res.centers[i * 3 + 2]; if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z; if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z }
    return 0.14 * Math.max(mxx - mnx, mxy - mny, mxz - mnz, res.h)
  }, [res, n])
  const obj = useMemo(() => new Object3D(), [])
  useEffect(() => {
    const im = ref.current
    if (!im || !res || !n) return
    const col = new Color()
    for (let i = 0; i < n; i++) { const [r, g, b] = feaColor(Math.min(1, res.amp[i])); im.setColorAt(i, col.setRGB(r, g, b)) }
    if (im.instanceColor) im.instanceColor.needsUpdate = true
  }, [res, n])
  useFrame((state) => {
    const im = ref.current
    if (!im || !res || !n) return
    const sh = res.shape
    const t = Math.sin(state.clock.elapsedTime * 6) * amp
    for (let i = 0; i < n; i++) {
      obj.position.set(res.centers[i * 3] + sh[i * 3] * t, res.centers[i * 3 + 1] + sh[i * 3 + 1] * t, res.centers[i * 3 + 2] + sh[i * 3 + 2] * t)
      obj.updateMatrix()
      im.setMatrixAt(i, obj.matrix)
    }
    im.instanceMatrix.needsUpdate = true
  })
  if (!res || !n) return null
  const s = res.h * 0.9
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <instancedMesh key={'buckle' + n} ref={ref} args={[undefined, undefined, n]} frustumCulled={false} raycast={() => null}>
        <boxGeometry args={[s, s, s]} />
        <meshBasicMaterial transparent opacity={0.85} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

// S83：生成式设计密度云 — 净渲染保留材料（密度 > 0.35），颜色 = 密度（红=承力料路）。静态（无动画）。
function TopoptOverlay() {
  const res = useApp((s) => s.topoptResult)
  const ref = useRef<InstancedMesh | null>(null)
  const keep = useMemo(() => {
    if (!res) return null
    const idx: number[] = []
    for (let i = 0; i < res.density.length; i++) if (res.density[i] > 0.35) idx.push(i)
    return idx
  }, [res])
  const n = keep ? keep.length : 0
  useEffect(() => {
    const im = ref.current
    if (!im || !res || !keep || !n) return
    const m = new Object3D(); const col = new Color()
    for (let q = 0; q < n; q++) {
      const i = keep[q]
      m.position.set(res.centers[i * 3], res.centers[i * 3 + 1], res.centers[i * 3 + 2]); m.updateMatrix(); im.setMatrixAt(q, m.matrix)
      const [r, g, b] = feaColor(Math.min(1, res.density[i])); im.setColorAt(q, col.setRGB(r, g, b))
    }
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true
  }, [res, keep, n])
  if (!res || !keep || !n) return null
  const s = res.h * 0.96
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <instancedMesh key={'topo' + n} ref={ref} args={[undefined, undefined, n]} frustumCulled={false} raycast={() => null}>
        <boxGeometry args={[s, s, s]} />
        <meshBasicMaterial transparent opacity={0.9} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

// S84：热分析温度云 — 静态，颜色 = 温度归一（红=热 蓝=冷，同 FeaOverlay 色带）。
function ThermalOverlay() {
  const res = useApp((s) => s.thermalResult)
  const ref = useRef<InstancedMesh | null>(null)
  const n = res ? res.temp.length : 0
  useEffect(() => {
    const im = ref.current
    if (!im || !res || !n) return
    const m = new Object3D(); const col = new Color()
    const span = (res.tMax - res.tMin) || 1
    for (let i = 0; i < n; i++) {
      m.position.set(res.centers[i * 3], res.centers[i * 3 + 1], res.centers[i * 3 + 2]); m.updateMatrix(); im.setMatrixAt(i, m.matrix)
      const [r, g, b] = feaColor(Math.min(1, Math.max(0, (res.temp[i] - res.tMin) / span)))
      im.setColorAt(i, col.setRGB(r, g, b))
    }
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true
  }, [res, n])
  if (!res || !n) return null
  const s = res.h * 0.94
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <instancedMesh key={'therm' + n + ':' + res.tMax.toFixed(2)} ref={ref} args={[undefined, undefined, n]} frustumCulled={false} raycast={() => null}>
        <boxGeometry args={[s, s, s]} />
        <meshBasicMaterial transparent opacity={0.88} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

// T783：渲染模式 — RoomEnvironment PMREM 环境反射（离线，唔使下载 HDR 文件）+ 软阴影。
// 开关时 traverse 设 castShadow/receiveShadow（逐帧 idempotent 设平 — 新建 mesh 都拿到 flag）。
function EnvLight() {
  const on = useApp((s) => s.renderMode)
  const exposure = useApp((s) => s.renderExposure)
  const gpOff = useApp((s) => s.groundPlaneOffset)   // GM-X2 #15
  const { gl, scene } = useThree()
  const { groundY } = useSceneGround()   // #95：接地阴影贴住模型底（非硬钉 worldY≈0）
  useEffect(() => {
    if (!on) { scene.environment = null; gl.shadowMap.enabled = false; gl.toneMapping = NoToneMapping; gl.toneMappingExposure = 1; return }
    const pmrem = new PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    // three r184 deprecated PCFSoftShadowMap (the old implicit default).  Set
    // the supported PCF mode explicitly once when render mode is enabled so
    // we do not emit a console warning every frame during a long CAD session.
    gl.shadowMap.type = PCFShadowMap
    gl.shadowMap.enabled = true
    gl.toneMapping = ACESFilmicToneMapping   // S93：HDR 环境反射用 ACES 影调（唔再死白），曝光可调
    // toneMapping 经 #define 烘焙入着色器 → 现有 material 要 needsUpdate 先切到 ACES（exposure 系 uniform，实时）
    scene.traverse((o) => { const m = (o as { material?: { needsUpdate?: boolean } | { needsUpdate?: boolean }[] }).material; if (Array.isArray(m)) m.forEach((mm) => { mm.needsUpdate = true }); else if (m) m.needsUpdate = true })
    return () => { scene.environment = null; gl.shadowMap.enabled = false; gl.toneMapping = NoToneMapping; gl.toneMappingExposure = 1; scene.traverse((o) => { const m = (o as { material?: { needsUpdate?: boolean } | { needsUpdate?: boolean }[] }).material; if (Array.isArray(m)) m.forEach((mm) => { mm.needsUpdate = true }); else if (m) m.needsUpdate = true }); env.dispose(); pmrem.dispose() }
  }, [on, gl, scene])
  useEffect(() => { if (on) gl.toneMappingExposure = exposure }, [on, exposure, gl])
  useFrame(() => {
    if (!on) return
    scene.traverse((o) => { const m = o as { isMesh?: boolean; castShadow?: boolean; receiveShadow?: boolean }; if (m.isMesh && !m.castShadow) { m.castShadow = true; m.receiveShadow = true } })
  })
  if (!on) return null
  return (
    <>
      <directionalLight castShadow position={[140, 220, 100]} intensity={1.2} shadow-mapSize={[2048, 2048]} shadow-camera-left={-220} shadow-camera-right={220} shadow-camera-top={220} shadow-camera-bottom={-220} shadow-camera-far={800} shadow-bias={-0.0004} />
      {/* S154 软接触阴影（drei ContactShadows）：取代旧硬平面 shadowMaterial — 接地、柔化、模糊的接触阴影，发布截图/转盘 WebM 质感明显提升。
          frames={1} = 烘焙一次（静态场景）省 GPU；gate 于 EnvLight `on`（渲染模式专属，非渲染模式上面已 return null 不受影响）。固定默认值，无 store 改动。 */}
      <ContactShadows position={[0, groundY - 0.04 + gpOff, 0]} scale={400} far={120} blur={2.4} opacity={0.45} resolution={1024} frames={1} color="#000000" />
    </>
  )
}

// S188：地面反射（Fusion Render 环境 > 地面反射）—— 模型底（worldY≈0）放一张水平反射地板，drei
// MeshReflectorMaterial 做真·平面反射（镜出模型 + 环境），产品展示/截图质感。会话级 toggle（groundReflection）；
// raycast 关，唔抢空白点击（600×600 大板）；plane 喺 worldY=-0.02 略低于模型底避 z-fight。两模式都可用（用户自行开）。
function GroundReflection() {
  const on = useApp((s) => s.groundReflection)
  const gpOff = useApp((s) => s.groundPlaneOffset)   // GM-X2 #15
  const { groundY } = useSceneGround()   // #95：反射平面贴住模型底（非硬钉 worldY≈0）
  if (!on) return null
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY - 0.02 + gpOff, 0]} raycast={() => null}>
      <planeGeometry args={[600, 600]} />
      <MeshReflectorMaterial resolution={1024} mirror={0.78} mixBlur={1} blur={[200, 80]} mixStrength={1.1} roughness={0.85} depthScale={1} minDepthThreshold={0.4} maxDepthThreshold={1.4} color="#2a2e33" metalness={0.45} />
    </mesh>
  )
}

// T783：视口动画录制 — canvas.captureStream + MediaRecorder → WebM 下载。
// 转盘 = OrbitControls autoRotate 360°/6s；爆炸 = explode 滑杆 0→峰→0 / 4s。发布 Printables/社交平台用。
function Recorder() {
  const req = useApp((s) => s.recordReq)
  const { gl, controls } = useThree() as unknown as { gl: WebGLRenderer; controls: { autoRotate: boolean; autoRotateSpeed: number } | null }
  const st = useRef<{ rec: MediaRecorder; t0: number; dur: number; mode: string } | null>(null)
  useEffect(() => {
    if (!req) return
    const canvas = gl.domElement as HTMLCanvasElement
    const stream = canvas.captureStream(30)
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = (useApp.getState().projectName || '设计') + (req === 'turntable' ? '-转盘' : '-爆炸') + '.webm'
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      useApp.setState({ recordReq: null, status: `🎬 已导出${req === 'turntable' ? '转盘' : '爆炸'}动画 WebM（${(blob.size / 1e6).toFixed(1)}MB，30fps — 可直接发 Printables / 社交平台）` })
    }
    rec.start(200)
    st.current = { rec, t0: performance.now(), dur: req === 'turntable' ? 6000 : 4000, mode: req }
    if (req === 'turntable' && controls) { controls.autoRotate = true; controls.autoRotateSpeed = 10 }  // 360° ÷ 6s（autoRotateSpeed 2.0 = 360°/30s）
    return () => {
      if (controls) controls.autoRotate = false
      if (req === 'explode') useApp.getState().setExplode(0)
      if (rec.state !== 'inactive') rec.stop()
    }
  }, [req, gl, controls])
  useFrame(() => {
    const s2 = st.current
    if (!s2 || !req) return
    const t = (performance.now() - s2.t0) / s2.dur
    if (t >= 1) { if (s2.rec.state !== 'inactive') s2.rec.stop(); st.current = null; if (controls) controls.autoRotate = false; if (s2.mode === 'explode') useApp.getState().setExplode(0); return }
    if (s2.mode === 'explode') useApp.getState().setExplode(Math.sin(t * Math.PI) * 1.2)
  })
  return null
}

// S192：高清 / 透明 PNG 出图 — 渲染到离屏高分 RenderTarget（1×/2×/4× 超采样 + MSAA）+ 可选透明背景。
// 比 exportViewPNG（只读视口分辨率、不透明）高一级：发布 / 产品图 / 贴 alpha 合成用。注：实时视图截取，
// path-trace overlay 唔入此截（个 overlay 系另一个 canvas）。同 Recorder 一样靠 useThree 攞 gl/scene/camera。
function StillExporter() {
  const req = useApp((s) => s.stillReq)
  const { gl, scene, camera, size } = useThree() as unknown as { gl: WebGLRenderer; scene: Scene; camera: Camera; size: { width: number; height: number } }
  useEffect(() => {
    if (!req) return
    const done = (msg: string) => useApp.setState({ stillReq: null, status: msg })
    try {
      const scale = Math.max(1, Math.min(4, req.scale || 2))
      const w = Math.max(1, Math.round(size.width * scale)), h = Math.max(1, Math.round(size.height * scale))
      const target = new WebGLRenderTarget(w, h, { samples: 4 })   // MSAA 抗锯齿（WebGL2）
      const prevBg = scene.background, prevAlpha = gl.getClearAlpha()
      const buf = new Uint8Array(w * h * 4)
      // try/finally 保证：即使 gl.render / readRenderTargetPixels 抛错，都 dispose render target + 还原 scene 背景/clearAlpha（gotcha d；否则泄漏 GPU + scene 背景卡喺 null）
      try {
        if (req.transparent) { scene.background = null; gl.setClearAlpha(0) }   // 透明背景：清掉场景背景 + clear alpha 0
        gl.setRenderTarget(target); gl.render(scene, camera)   // 同视口同一 scene/camera（同纵横比，无需改投影）
        gl.readRenderTargetPixels(target, 0, 0, w, h, buf)
      } finally {
        gl.setRenderTarget(null); scene.background = prevBg; gl.setClearAlpha(prevAlpha); target.dispose()
      }
      const c2 = document.createElement('canvas'); c2.width = w; c2.height = h
      const cx = c2.getContext('2d'); if (!cx) { done('高清出图失败：无 2D 上下文'); return }
      const img = cx.createImageData(w, h)
      for (let y = 0; y < h; y++) { const sY = (h - 1 - y) * w * 4; img.data.set(buf.subarray(sY, sY + w * 4), y * w * 4) }   // readPixels 系底向上，翻 Y
      cx.putImageData(img, 0, 0)
      if (!req.transparent) { let nb = 0; for (let i = 3; i < buf.length; i += 4) if (buf[i] > 8) { nb++; if (nb > 8) break } if (nb <= 8) { done('高清出图：画面为空（绘图缓冲未保留）—— 试转一下视角再出'); return } }
      const url = c2.toDataURL('image/png')
      const name = (useApp.getState().projectName || 'webcad').replace(/[\\/:*?"<>|]/g, '_')
      const a = document.createElement('a'); a.href = url; a.download = `${name}@${scale}x${req.transparent ? '-透明' : ''}.png`
      document.body.appendChild(a); a.click(); a.remove()
      done(`已导出高清 PNG（${w}×${h}，${scale}× 超采样${req.transparent ? ' · 透明背景' : ''}）`)
    } catch (e) { done('高清出图失败：' + String(e).slice(0, 80)) }
  }, [req, gl, scene, camera, size])
  return null
}

// S193：透视相机 FOV 接线 — store cameraFov → 默认透视相机 .fov + 重算投影。正交模式下唔生效（正交无 FOV）。
function FovRig() {
  const fov = useApp((s) => s.cameraFov)
  const ortho = useApp((s) => s.cameraOrtho)
  const camera = useThree((s) => s.camera) as unknown as { isPerspectiveCamera?: boolean; fov?: number; updateProjectionMatrix: () => void }
  useEffect(() => {
    if (camera.isPerspectiveCamera && !ortho && typeof camera.fov === 'number') {
      camera.fov = fov; camera.updateProjectionMatrix()
    }
  }, [fov, ortho, camera])
  return null
}

// S193：环境光遮蔽（GTAO）— three 内置 EffectComposer（无新 dep）。priority=1 useFrame 接管 R3F 渲染循环：
// 整条 scene 经 RenderPass → GTAOPass（缝隙/接触/凹陷算遮蔽变暗）→ OutputPass 合成。只喺 ssao 开时挂载（opt-in，关咗即恢复默认渲染）。
function AOEffect() {
  const { gl, scene, camera, size, invalidate } = useThree() as unknown as { gl: WebGLRenderer; scene: Scene; camera: Camera & { isPerspectiveCamera?: boolean }; size: { width: number; height: number }; invalidate: () => void }
  const composer = useMemo(() => {
    const c = new EffectComposer(gl)
    c.addPass(new RenderPass(scene, camera))
    const ao = new GTAOPass(scene, camera, size.width, size.height)
    c.addPass(ao)
    c.addPass(new OutputPass())
    return c
  }, [gl, scene, camera])   // size 经 setSize effect 处理，唔入 deps（免每次 resize 重建整条 composer）
  useEffect(() => { composer.setSize(size.width, size.height); invalidate() }, [composer, size, invalidate])
  useEffect(() => () => { try { composer.dispose() } catch { /* noop */ } }, [composer])
  // priority=1 接管渲染；同时 invalidate() 喺 frameloop="demand" 下持续请求下一帧 — 保证 GTAO 即时生效 + 视角变化时更新（关 SSAO 即 unmount，恢复省电按需渲染）
  useFrame(() => { composer.render(); invalidate() }, 1)
  return null
}

// S192 修：图片贴图 GPU 缓存清理（gotcha d）。material.imageUrl 系【单一全局】属性，换图 A→B 后冇任何 body 仲引用 A
// → 安全 dispose。每次 imageUrl 变即剪走缓存里所有≠当前 url 嘅 texture（清图=''时全 dispose），免 data-URL 贴图无限累积 VRAM。
// P2 Render：贴花渲染层 — 对活动实体 mesh 生成 DecalGeometry（world 坐标，挂喺无旋转顶层 group）。
// 临时 Mesh 带 -90°X 旋转对齐 KernelBody 嘅 CAD→three 摆位；DecalGeometry 输出已系 world 坐标。
function DecalOverlay() {
  const decals = useApp((s) => s.decals)
  const bodyMesh = useApp((s) => s.bodyMesh)
  // review MED：body 几何+法线单独缓存（keyed bodyMesh）— 大小/旋转滑杆每 tick 只重投影 DecalGeometry，唔好重砌全网格
  const srcGeo = useMemo(() => {
    if (!bodyMesh || !bodyMesh.vertices?.length) return null
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(bodyMesh.vertices, 3))
    g.setIndex(Array.from(bodyMesh.triangles as ArrayLike<number>))
    g.computeVertexNormals()
    return g
  }, [bodyMesh])
  useEffect(() => () => { srcGeo?.dispose() }, [srcGeo])
  const items = useMemo(() => {
    if (!decals.length || !srcGeo) return []
    const tmp = new Mesh(srcGeo)
    tmp.rotation.x = -Math.PI / 2
    tmp.updateMatrixWorld(true)
    const out: { d: (typeof decals)[number]; geo: BufferGeometry }[] = []
    for (const d of decals) {
      try {
        const pW = new Vector3(d.p[0], d.p[2], -d.p[1])                      // CAD → three-world
        const nW = new Vector3(d.n[0], d.n[2], -d.n[1]).normalize()
        const m = new Matrix4().lookAt(nW, new Vector3(0, 0, 0), new Vector3(0, 1, 0))   // +Z 对齐法线（Object3D.lookAt 语义）
        const orient = new Euler().setFromRotationMatrix(m)
        orient.z = d.rot || 0                                               // three decal demo 惯用：roll 直接写 z
        // GM-X3 #5：u/v = 沿贴花局部切向偏移拾取点；w/h = 非等比投影盒（取代单 size）
        if (d.u || d.v) {
          const q = new Quaternion().setFromEuler(orient)
          pW.addScaledVector(new Vector3(1, 0, 0).applyQuaternion(q), d.u || 0).addScaledVector(new Vector3(0, 1, 0).applyQuaternion(q), d.v || 0)
        }
        const box = decalBox(d)   // { w, h, depth }：w/h 覆盖单 size
        const geo = new DecalGeometry(tmp, pW, orient, new Vector3(box.w, box.h, box.depth))
        if ((d.flipH || d.flipV)) { const uv = geo.getAttribute('uv'); if (uv) geo.setAttribute('uv', new Float32BufferAttribute(flipUVArray(uv.array as Float32Array, d.flipH, d.flipV), 2)) }   // flipH/V 翻转
        if ((geo.getAttribute('position')?.count ?? 0) > 0) out.push({ d, geo })
      } catch { /* 投影唔到（点离面/法线退化）→ 略过呢个贴花 */ }
    }
    return out
  }, [decals, srcGeo])
  useEffect(() => () => { items.forEach((it) => it.geo.dispose()) }, [items])
  if (!items.length) return null
  return (
    <group>
      {items.map(({ d, geo }) => (
        <mesh key={d.id} geometry={geo} renderOrder={3}>
          <meshStandardMaterial map={loadImageTexture(d.url)} transparent opacity={d.opacity ?? 1} polygonOffset polygonOffsetFactor={-4} depthWrite={false} roughness={0.6} metalness={0} />
        </mesh>
      ))}
    </group>
  )
}

// Fusion canvas manipulators: Fillet keeps its precise radius ring. Chamfer uses the measured
// 5 mm coarse distance snap, a second handle for Two Distance, and a whole-degree angle arc.
// Numeric dialog inputs remain the precise path and share the same store setters/preview.
function RoundSizeHandle() {
  const kind = useApp((s) => s.edgeRoundPick)
  const filletType = useApp((s) => s.filletType)
  const picks = useApp((s) => s.edgeRoundPicks)
  const size = useApp((s) => s.edgeRoundSize)
  const chamferMode = useApp((s) => s.chamferMode)
  const chamferSize2 = useApp((s) => s.chamferSize2)
  const chamferAngle = useApp((s) => s.chamferAngle)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as unknown as { enabled?: boolean } | null
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])
  if (!kind || !picks.length || (kind === 'fillet' && filletType === 'full')) return null
  const pk = picks[0]
  const anchor = new Vector3(pk[0], pk[1], pk[2])
  const finishableDrag = (move: (ev: PointerEvent) => void) => {
    if (controls) controls.enabled = false
    const fin = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', fin); window.removeEventListener('pointercancel', fin)
      if (controls) controls.enabled = true
      gl.domElement.style.cursor = ''
      cleanup.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', fin)
    window.addEventListener('pointercancel', fin)
    cleanup.current = fin
    gl.domElement.style.cursor = 'grabbing'
    return fin
  }
  const beginDistance = (slot: 'primary' | 'secondary') => (e: { stopPropagation: () => void; button?: number; nativeEvent?: PointerEvent }) => {
    if ((e.button ?? 0) !== 0) return
    e.stopPropagation()
    const ev0 = (e.nativeEvent ?? e) as unknown as PointerEvent
    const rect = gl.domElement.getBoundingClientRect()
    const cam = camera as unknown as { fov?: number; position: Vector3 }
    const mmPerPx = (2 * cam.position.distanceTo(anchor) * Math.tan(((cam.fov || 28) * Math.PI / 180) / 2)) / rect.height
    const st0 = useApp.getState()
    const s0 = slot === 'secondary' ? st0.chamferSize2 : st0.edgeRoundSize
    const sy = ev0.clientY
    let fin = () => {}
    const mv = (ev: PointerEvent) => {
      if (!useApp.getState().edgeRoundPick) { fin(); return }   // 中途 ESC/确定 → 放手
      // Each distance grows in the visible arrow direction: primary points up, the
      // Two Distance secondary handle points down along the opposite adjacent face.
      const d = (slot === 'secondary' ? ev.clientY - sy : sy - ev.clientY) * mmPerPx * 0.5
      const next = kind === 'chamfer' ? chamferDistanceFromDrag(s0, d) : filletRadiusFromDrag(s0, d)
      if (slot === 'secondary') useApp.getState().setChamferSize2(next)
      else useApp.getState().setEdgeRoundSize(next)
    }
    fin = finishableDrag(mv)
  }
  const beginAngle = (e: { stopPropagation: () => void; button?: number; nativeEvent?: PointerEvent }) => {
    if ((e.button ?? 0) !== 0) return
    e.stopPropagation()
    const ev0 = (e.nativeEvent ?? e) as unknown as PointerEvent
    const a0 = useApp.getState().chamferAngle
    const sx = ev0.clientX
    let fin = () => {}
    const mv = (ev: PointerEvent) => {
      if (useApp.getState().edgeRoundPick !== 'chamfer') { fin(); return }
      useApp.getState().setChamferAngle(chamferAngleFromDrag(a0, ev.clientX - sx))
    }
    fin = finishableDrag(mv)
  }
  const cursorProps = { onPointerOver: () => { gl.domElement.style.cursor = 'grab' }, onPointerOut: () => { if (!cleanup.current) gl.domElement.style.cursor = '' } }
  const angleRad = chamferAngle * Math.PI / 180
  return (
    <group position={anchor} renderOrder={999}>
      {kind === 'fillet' ? <>
        <mesh onPointerDown={beginDistance('primary')} {...cursorProps}>
          <sphereGeometry args={[3.4, 16, 16]} />
          <meshBasicMaterial color="#1572c4" depthTest={false} transparent opacity={0.92} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
          <torusGeometry args={[Math.max(0.6, size), 0.35, 8, 40]} />
          <meshBasicMaterial color="#1572c4" depthTest={false} transparent opacity={0.5} />
        </mesh>
      </> : <>
        <group onPointerDown={beginDistance('primary')} {...cursorProps}>
          <mesh position={[0, 4, 0]}><cylinderGeometry args={[0.65, 0.65, 8, 12]} /><meshBasicMaterial color="#1572c4" depthTest={false} /></mesh>
          <mesh position={[0, 9, 0]}><coneGeometry args={[2.2, 4, 16]} /><meshBasicMaterial color="#1572c4" depthTest={false} /></mesh>
          <mesh position={[0, 8, 0]}><sphereGeometry args={[3.5, 12, 12]} /><meshBasicMaterial color="#1572c4" transparent opacity={0.08} depthWrite={false} depthTest={false} /></mesh>
        </group>
        {chamferMode === 'two' && <group position={[8, 0, 0]} onPointerDown={beginDistance('secondary')} {...cursorProps}>
          <mesh position={[0, -4, 0]}><cylinderGeometry args={[0.65, 0.65, 8, 12]} /><meshBasicMaterial color="#f28c28" depthTest={false} /></mesh>
          <mesh position={[0, -9, 0]} rotation={[0, 0, Math.PI]}><coneGeometry args={[2.2, 4, 16]} /><meshBasicMaterial color="#f28c28" depthTest={false} /></mesh>
          <mesh position={[0, -8, 0]}><sphereGeometry args={[3.5, 12, 12]} /><meshBasicMaterial color="#f28c28" transparent opacity={0.08} depthWrite={false} depthTest={false} /></mesh>
          <mesh position={[0, -13 - Math.min(12, chamferSize2), 0]} raycast={() => null}><sphereGeometry args={[0.9, 10, 10]} /><meshBasicMaterial color="#f28c28" depthTest={false} /></mesh>
        </group>}
        {chamferMode === 'angle' && <>
          <mesh raycast={() => null}><torusGeometry args={[10, 0.45, 8, 48, Math.PI / 2]} /><meshBasicMaterial color="#1572c4" depthTest={false} transparent opacity={0.65} /></mesh>
          <mesh position={[10 * Math.cos(angleRad), 10 * Math.sin(angleRad), 0]} onPointerDown={beginAngle} {...cursorProps}>
            <sphereGeometry args={[2.4, 16, 16]} /><meshBasicMaterial color="#1572c4" depthTest={false} />
          </mesh>
        </>}
      </>}
    </group>
  )
}

// v8 Press/Pull 面上操纵杆 + ghost：最后拾嗰面 pick 点沿方向出箭头（法向/轴/自由 — 跟 pushPullDir，同 commit 语义一致），
// 拖=实时 setPushPullDist（可过零变负=压入，箭头转红）；ghost=方向+量嘅半透明示意 box（纯 client — pushpull 布尔太贵唔行 worker 预览，
// 真几何 commit 时先出）。拖法/相机冻结/mid-drag 退出 全套 ExtrudeArrow 慣用法（SketchLayer:902）。strip 距离 input 即係可点击标签（同一 setter）。
function PushPullArrow() {
  const mode = useApp((s) => s.pushPullMode)
  const picks = useApp((s) => s.pushPullPicks)
  const dist = useApp((s) => s.pushPullDist)
  const dir = useApp((s) => s.pushPullDir)
  const dvec = useApp((s) => s.pushPullDirVec)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as unknown as { enabled?: boolean } | null
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])
  if (!mode || !picks.length) return null
  const last = picks[picks.length - 1]
  const anchor = new Vector3(last.p[0], last.p[2], -last.p[1])   // CAD→three-world
  const nCad: [number, number, number] = dir === 'X' ? [1, 0, 0] : dir === 'Y' ? [0, 1, 0] : dir === 'Z' ? [0, 0, 1] : dir === 'custom' ? dvec : last.n
  const nW = new Vector3(nCad[0], nCad[2], -nCad[1])
  if (nW.lengthSq() < 1e-9) return null
  nW.normalize()
  const sgn = dist < 0 ? -1 : 1
  const axis = nW.clone().multiplyScalar(sgn)
  const color = dist < 0 ? '#ff5a4d' : '#1572c4'   // 压入=红 / 拉出=蓝
  const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), axis)
  // At Fusion's required zero default the old 6 mm handle was nearly
  // impossible to hit on a normal zoom. Keep the value at zero but expose a
  // full-size draggable manipulator immediately after face selection.
  const shaftLen = Math.min(60, Math.max(18, Math.abs(dist)))
  const tip = anchor.clone().add(axis.clone().multiplyScalar(shaftLen))
  const conePos = tip.clone().add(axis.clone().multiplyScalar(7))
  const begin = (e: { stopPropagation: () => void; button?: number; nativeEvent?: PointerEvent }) => {
    if ((e.button ?? 0) !== 0) return
    e.stopPropagation()
    const ev0 = (e.nativeEvent ?? e) as unknown as PointerEvent
    const rect = gl.domElement.getBoundingClientRect()
    const toPx = (w: Vector3): [number, number] => { const q = w.clone().project(camera); return [(q.x * 0.5 + 0.5) * rect.width, (-q.y * 0.5 + 0.5) * rect.height] }
    const a0 = toPx(anchor), a1 = toPx(anchor.clone().add(nW))   // 正法向做轴（正=拉出，符号自然出）
    const ux = a1[0] - a0[0], uy = a1[1] - a0[1]
    const L2 = ux * ux + uy * uy
    const cam = camera as unknown as { fov?: number; position: Vector3 }
    const mmPerPx = (2 * cam.position.distanceTo(anchor) * Math.tan(((cam.fov || 28) * Math.PI / 180) / 2)) / rect.height
    const useAxis = L2 >= 1 / (16 * mmPerPx * mmPerPx)
    const d0 = useApp.getState().pushPullDist
    const sx = ev0.clientX, sy = ev0.clientY
    if (controls) controls.enabled = false
    const fin = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', fin); window.removeEventListener('pointercancel', fin)
      if (controls) controls.enabled = true
      gl.domElement.style.cursor = ''
      cleanup.current = null
    }
    const mv = (ev: PointerEvent) => {
      if (!useApp.getState().pushPullMode) { fin(); return }   // 中途 ESC/确定 → 放手
      const dmm = useAxis ? ((ev.clientX - sx) * ux + (ev.clientY - sy) * uy) / L2 : (sy - ev.clientY) * mmPerPx
      let nv = Math.round((d0 + dmm) * 10) / 10
      if (Math.abs(nv) < 0.1) nv = nv >= 0 ? 0.1 : -0.1   // setter n||10 会把 0 弹去 10 — 过零时跳过精确 0
      useApp.getState().setPushPullDist(nv)                 // 允许过零变负（压入）— pushpull 负值有意义（同 strip/worker 语义）
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', fin)
    window.addEventListener('pointercancel', fin)
    cleanup.current = fin
    gl.domElement.style.cursor = 'grabbing'
  }
  return (
    <group renderOrder={60}>
      <mesh position={anchor.clone().add(axis.clone().multiplyScalar(Math.abs(dist) / 2))} quaternion={quat}>
        <boxGeometry args={[14, Math.max(0.2, Math.abs(dist)), 14]} />
        <meshBasicMaterial color={color} transparent opacity={0.18} depthWrite={false} />
      </mesh>
      <Line points={[[anchor.x, anchor.y, anchor.z], [tip.x, tip.y, tip.z]]} color={color} lineWidth={2.5} depthTest={false} />
      <mesh position={conePos} quaternion={quat}
        onPointerDown={begin}
        onPointerOver={() => { gl.domElement.style.cursor = 'grab' }}
        onPointerOut={() => { if (!cleanup.current) gl.domElement.style.cursor = '' }}>
        <coneGeometry args={[5, 14, 16]} />
        <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
      </mesh>
    </group>
  )
}

// P2 Cosmetic：外观螺纹线圈 — cosmetic othread/ithread 唔郁几何，牙由呢度画灰色螺旋 polyline（Fusion cosmetic thread 观感）。
// 必须客户端独立 gate timelinePos/suppressed（worker 只跑 slice(0,pos)，cosmetic no-op 无 marker 回传）。
function CosmeticThreadOverlay() {
  const features = useApp((s) => s.features)
  const timelinePos = useApp((s) => s.timelinePos)
  const suppressed = useApp((s) => s.suppressedIds)
  const items = useMemo(() => {
    const out: { id: string; pts: [number, number, number][] }[] = []
    features.forEach((f, i) => {
      if (f.type !== 'othread' && f.type !== 'ithread') return
      if (!f.cosmetic) return
      if (i >= timelinePos) return
      if (suppressed.includes(f.id)) return
      const r = Math.max(0.5, f.d / 2)
      const P = Math.max(0.3, f.pitch)
      const H = Math.max(P, f.height)
      const cx = f.x ?? 0, cy = f.y ?? 0, z0 = f.z0 ?? 0
      const turns = H / P, seg = Math.min(2000, Math.max(24, Math.ceil(turns * 24)))
      const pts: [number, number, number][] = []
      for (let k = 0; k <= seg; k++) {
        const t = k / seg, th = 2 * Math.PI * turns * t, z = z0 + H * t
        pts.push([cx + r * Math.cos(th), z, -(cy + r * Math.sin(th))])   // CAD(x,y,z)→three-world(x,z,−y)
      }
      out.push({ id: f.id, pts })
    })
    return out
  }, [features, timelinePos, suppressed])
  if (!items.length) return null
  return (
    <group>
      {items.map((it) => (
        <Line key={it.id} points={it.pts} color="#8a8f96" lineWidth={1.4} transparent opacity={0.85} />
      ))}
    </group>
  )
}

function ImageTexCachePruner() {
  const imageUrl = useApp((s) => s.material.imageUrl || '')
  const normalUrl = useApp((s) => s.material.normalUrl || '')
  const decals = useApp((s) => s.decals)
  useEffect(() => {
    const keep = new Set([imageUrl, ...decals.map((d) => d.url)])   // P2 Render：贴花共用 _imgTexCache — 唔好误清仍在用嘅贴花纹理
    for (const [url, tex] of _imgTexCache) {
      if (!keep.has(url)) { try { tex.dispose() } catch { /* noop */ } _imgTexCache.delete(url) }
    }
    for (const [url, tex] of _nrmTexCache) {   // P2 Render：法线贴图缓存同款清理（防 data-URL VRAM 累积）
      if (url !== normalUrl) { try { tex.dispose() } catch { /* noop */ } _nrmTexCache.delete(url) }
    }
  }, [imageUrl, normalUrl, decals])
  return null
}

// T782：干涉重叠区 3D 高亮 — checkInterference 收集嘅 AABB 交集盒（compWorldMatrix 输出 = three 世界坐标，
// 直接渲染唔使 Rx(-90)）。红色半透明 + 线框，depthTest 关 → 透视都见到撞喺边。
function InterfBoxes() {
  const hits = useApp((s) => s.interfHits)
  if (!hits.length) return null
  return (
    <>
      {hits.map((h, i) => {
        const sx = Math.max(0.5, h.max[0] - h.min[0]), sy = Math.max(0.5, h.max[1] - h.min[1]), sz = Math.max(0.5, h.max[2] - h.min[2])
        const c: [number, number, number] = [(h.min[0] + h.max[0]) / 2, (h.min[1] + h.max[1]) / 2, (h.min[2] + h.max[2]) / 2]
        return (
          <group key={'if' + i} position={c}>
            <mesh renderOrder={997} raycast={() => null}>
              <boxGeometry args={[sx, sy, sz]} />
              <meshBasicMaterial color="#e03131" transparent opacity={0.25} depthTest={false} />
            </mesh>
            <mesh renderOrder={998} raycast={() => null}>
              <boxGeometry args={[sx, sy, sz]} />
              <meshBasicMaterial color="#c92a2a" wireframe depthTest={false} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}

// S192：干涉【精确相交实体】高亮 — checkInterference 用 manifold 布尔算出嘅真重叠几何（three 世界坐标，
// 同 InterfBoxes 一样直接渲染唔使 Rx(-90)）。红色半透明实体 + 线框，depthTest 关 → 透视都见真撞体形状（非粗 AABB 盒）。
function InterfMeshes() {
  const meshes = useApp((s) => s.interfMeshes)
  const geos = useMemo(() => meshes.map((m) => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(m.vertices.slice(), 3))
    g.setIndex(m.triangles.slice())
    g.computeVertexNormals()
    return g
  }), [meshes])
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos])
  if (!geos.length) return null
  return (
    <>
      {geos.map((g, i) => (
        <group key={'ifm' + i}>
          <mesh geometry={g} renderOrder={997} raycast={() => null}>
            <meshBasicMaterial color="#e03131" transparent opacity={0.4} depthTest={false} side={DoubleSide} />
          </mesh>
          <mesh geometry={g} renderOrder={998} raycast={() => null}>
            <meshBasicMaterial color="#c92a2a" wireframe depthTest={false} />
          </mesh>
        </group>
      ))}
    </>
  )
}

// S124：两件最近点连线（蓝虚线 + 两端球）。pA/pB 已系 three 世界坐标（measureTwoComponents 烘焙后返回）。
function CompMeasureSeg() {
  const seg = useApp((s) => s.compMeasureSeg)
  if (!seg) return null
  return (
    <>
      <Line points={[seg.a, seg.b]} color="#1572c4" lineWidth={2.5} dashed dashSize={4} gapSize={2} depthTest={false} renderOrder={999} />
      <mesh position={seg.a} renderOrder={999} raycast={() => null}><sphereGeometry args={[1.8, 16, 16]} /><meshBasicMaterial color="#1572c4" depthTest={false} /></mesh>
      <mesh position={seg.b} renderOrder={999} raycast={() => null}><sphereGeometry args={[1.8, 16, 16]} /><meshBasicMaterial color="#1572c4" depthTest={false} /></mesh>
    </>
  )
}

// T771：浇口标记（紫红球；gate 存 CAD 坐标 → three swizzle [x, z, −y]）
function MoldGateMarkers() {
  const gates = useApp((s) => s.moldGates)
  if (!gates.length) return null
  return (
    <>
      {gates.map((g, i) => (
        <mesh key={'mg' + i} position={[g.point[0], g.point[2], -g.point[1]]} renderOrder={998} raycast={() => null}>
          <sphereGeometry args={[2.6, 16, 16]} />
          <meshBasicMaterial color="#e040fb" depthTest={false} transparent opacity={0.9} />
        </mesh>
      ))}
    </>
  )
}

function FourBarView() {
  const fb = useApp((s) => s.fourBar)
  if (!fb) return null
  const sol = solve4Bar(fb, fb.theta, fb.branch)
  // Linkage in the three XY plane (z=0), centred near the origin — visible in the default iso view.
  const P = (p: [number, number]): [number, number, number] => [p[0], p[1] - 15, 0]
  const A = P(fb.A), D = P(fb.D), B = P(sol.B), C = P(sol.C)
  const c = (good: string) => (sol.ok ? good : '#ff5a4d')
  return (
    <group renderOrder={996}>
      <Line points={[A, D]} color="#8a939c" lineWidth={2} dashed dashSize={4} gapSize={3} depthTest={false} renderOrder={996} />
      <Line points={[A, B]} color={c('#1aa0ff')} lineWidth={4} depthTest={false} renderOrder={997} />
      <Line points={[B, C]} color={c('#1aa06b')} lineWidth={4} depthTest={false} renderOrder={997} />
      <Line points={[D, C]} color={c('#e0a81e')} lineWidth={4} depthTest={false} renderOrder={997} />
      {[A, D, B, C].map((p, i) => (
        <mesh key={i} position={p} renderOrder={998}><sphereGeometry args={[2.6, 16, 16]} /><meshBasicMaterial color={i < 2 ? '#333a42' : '#1572c4'} depthTest={false} /></mesh>
      ))}
    </group>
  )
}

// Stephenson-III six-bar (C4b) — posed by the GENERAL solveLinkage loop-closure solver (NOT an analytic
// formula). Crank A→B drives; coupler triangle B-C-P + dyad P-E-G follow; output point E traces a compound curve.
function SixBarView() {
  const sb = useApp((s) => s.sixBar)
  if (!sb) return null
  const { pts, ok } = solveSixBar(sb.theta)
  const P = (i: number): [number, number, number] => [pts[i][0], pts[i][1] - 15, 0]
  const A = P(0), D = P(1), B = P(2), C = P(3), Pp = P(4), G = P(5), E = P(6)
  const col = (good: string) => (ok ? good : '#ff5a4d')
  return (
    <group renderOrder={996}>
      <Line points={[A, D]} color="#8a939c" lineWidth={2} dashed dashSize={4} gapSize={3} depthTest={false} renderOrder={996} />
      <Line points={[A, B]} color={col('#1aa0ff')} lineWidth={4} depthTest={false} renderOrder={997} />
      <Line points={[B, C]} color={col('#1aa06b')} lineWidth={4} depthTest={false} renderOrder={997} />
      <Line points={[D, C]} color={col('#e0a81e')} lineWidth={4} depthTest={false} renderOrder={997} />
      <Line points={[B, Pp, C]} color={col('#1aa06b')} lineWidth={2.5} depthTest={false} renderOrder={997} />
      <Line points={[Pp, E]} color={col('#b14fd8')} lineWidth={4} depthTest={false} renderOrder={997} />
      <Line points={[G, E]} color={col('#b14fd8')} lineWidth={4} depthTest={false} renderOrder={997} />
      {[A, D, G].map((p, i) => <mesh key={'g' + i} position={p} renderOrder={998}><sphereGeometry args={[2.6, 16, 16]} /><meshBasicMaterial color="#333a42" depthTest={false} /></mesh>)}
      {[B, C, Pp].map((p, i) => <mesh key={'j' + i} position={p} renderOrder={998}><sphereGeometry args={[2.4, 16, 16]} /><meshBasicMaterial color="#1572c4" depthTest={false} /></mesh>)}
      <mesh position={E} renderOrder={998}><sphereGeometry args={[3.2, 16, 16]} /><meshBasicMaterial color="#b14fd8" depthTest={false} /></mesh>
    </group>
  )
}

// Motion envelope (C5): the planar rectangle the active mechanism sweeps through (AABB of all points over a
// full crank turn). Dashed purple box — for sizing a housing / planning clearance around the moving linkage.
function MotionEnvelopeView() {
  const env = useApp((s) => s.motionEnvelope)
  if (!env) return null
  const [x0, y0] = env.min, [x1, y1] = env.max
  const pts: [number, number, number][] = [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0], [x0, y0, 0]]
  return <Line points={pts} color="#9b59b6" lineWidth={1.5} dashed dashSize={3} gapSize={2} depthTest={false} renderOrder={995} />
}

// Motion trace (C1): the swept tracked-point path (4-bar coupler curve / slider piston line), in the same
// XY frame as the rig views so it overlays the mechanism. Points come from store.traceMotion().
function MotionTraceView() {
  const pts = useApp((s) => s.motionTracePts)
  if (!pts || pts.length < 6) return null
  const arr: [number, number, number][] = []
  for (let i = 0; i < pts.length; i += 3) arr.push([pts[i], pts[i + 1], pts[i + 2]])
  return <Line points={arr} color="#b14fd8" lineWidth={2.5} depthTest={false} renderOrder={999} />
}

// Slider-crank (piston): crank A→B rotates, rod B→C, piston block at C slides along the horizontal guide.
// Posed by solveSliderCrank (loop closure). Drawn in the three XY plane (z=0), centred horizontally.
function SliderCrankView() {
  const sc = useApp((s) => s.sliderCrank)
  if (!sc) return null
  const sol = solveSliderCrank(sc)
  const ox = -(sc.L) / 2 // shift so the mechanism sits roughly centred on the origin
  const P = (p: [number, number]): [number, number, number] => [p[0] + ox, p[1], 0]
  const A = P(sol.A), B = P(sol.B), C = P(sol.C)
  const c = (good: string) => (sol.ok ? good : '#ff5a4d')
  // piston block: a small rectangle centred at C on the slide line
  const pw = 12, ph = 9
  const blk: [number, number, number][] = [
    [C[0] - pw / 2, C[1] - ph / 2, 0], [C[0] + pw / 2, C[1] - ph / 2, 0],
    [C[0] + pw / 2, C[1] + ph / 2, 0], [C[0] - pw / 2, C[1] + ph / 2, 0], [C[0] - pw / 2, C[1] - ph / 2, 0],
  ]
  // slide guide: horizontal rail spanning the piston travel range (L−r → L+r) at y = e
  const g0: [number, number, number] = [(sc.L - sc.r) + ox - 8, sc.e, 0], g1: [number, number, number] = [(sc.L + sc.r) + ox + 8, sc.e, 0]
  return (
    <group renderOrder={996}>
      <Line points={[g0, g1]} color="#8a939c" lineWidth={2} dashed dashSize={4} gapSize={3} depthTest={false} renderOrder={996} />
      <Line points={[A, B]} color={c('#1aa0ff')} lineWidth={4} depthTest={false} renderOrder={997} />
      <Line points={[B, C]} color={c('#1aa06b')} lineWidth={4} depthTest={false} renderOrder={997} />
      <Line points={blk} color={c('#e0a81e')} lineWidth={4} depthTest={false} renderOrder={997} />
      {[A, B, C].map((p, i) => (
        <mesh key={i} position={p} renderOrder={998}><sphereGeometry args={[2.6, 16, 16]} /><meshBasicMaterial color={i === 0 ? '#333a42' : '#1572c4'} depthTest={false} /></mesh>
      ))}
    </group>
  )
}

// Centre-of-mass marker (Fusion-style): a small sphere + 3-axis crosshair at the body / assembly CoM.
// Body CoM is the true signed-tetrahedron centroid (CAD coords → rendered inside the −90°X frame).
// Assembly CoM is the volume-weighted average of each visible component's centroid (three-world coords).
function CoMCross({ p }: { p: [number, number, number] }) {
  const L = 14
  return (
    <group position={p} renderOrder={999}>
      <mesh renderOrder={999}><sphereGeometry args={[2.4, 18, 18]} /><meshBasicMaterial color="#ff3b6b" depthTest={false} /></mesh>
      <Line points={[[-L, 0, 0], [L, 0, 0]]} color="#ff3b6b" lineWidth={2} depthTest={false} renderOrder={999} />
      <Line points={[[0, -L, 0], [0, L, 0]]} color="#ff3b6b" lineWidth={2} depthTest={false} renderOrder={999} />
      <Line points={[[0, 0, -L], [0, 0, L]]} color="#ff3b6b" lineWidth={2} depthTest={false} renderOrder={999} />
    </group>
  )
}
function CoMMarker() {
  const show = useApp((s) => s.showCom)
  const bodyMesh = useApp((s) => s.bodyMesh)
  const components = useApp((s) => s.components)
  const componentDefs = useApp((s) => s.componentDefs)
  if (!show) return null
  if (bodyMesh) {
    const p = computeProps(bodyMesh)
    if (!p) return null
    return <group rotation={[-Math.PI / 2, 0, 0]}><CoMCross p={p.com} /></group> // body com is CAD coords
  }
  const vis = components.filter((c) => !c.hidden)
  if (!vis.length) return null
  let wx = 0, wy = 0, wz = 0, wsum = 0
  for (const c of vis) for (const body of visibleDefinitionBodies(c, componentDefs)) {
    const cp = computeProps(body.mesh); if (!cp || cp.vol <= 0) continue
    // component centroid CAD → three (x, z, −y) + component world pos
    const cx = cp.com[0] + c.pos[0], cy = cp.com[2] + c.pos[1], cz = -cp.com[1] + c.pos[2]
    wx += cx * cp.vol; wy += cy * cp.vol; wz += cz * cp.vol; wsum += cp.vol
  }
  if (wsum <= 0) return null
  return <CoMCross p={[wx / wsum, wy / wsum, wz / wsum]} />
}

type Props = { dx: number; dy: number; dz: number; vol: number; area: number; com: [number, number, number]; inertia: [number, number, number]; watertight: { closed: boolean; boundary: number; nonManifold: number } } | null
function rawComputeProps(mesh: MeshData | null): Props {
  // Empty mesh (0 verts/tris, e.g. a failed op that cut away all material) → null, so readouts skip it
  // instead of showing "-Infinity" dims (bbox loop never runs → min/max stay ±Infinity). All callers
  // already handle null. (A degenerate 1-triangle FK-root frame still returns tiny props → vol<1 path.)
  if (!mesh || mesh.vertices.length === 0 || mesh.triangles.length === 0) return null
  const v = mesh.vertices
  const t = mesh.triangles
  let minx = Infinity, miny = Infinity, minz = Infinity
  let maxx = -Infinity, maxy = -Infinity, maxz = -Infinity
  for (let i = 0; i < v.length; i += 3) {
    minx = Math.min(minx, v[i]); maxx = Math.max(maxx, v[i])
    miny = Math.min(miny, v[i + 1]); maxy = Math.max(maxy, v[i + 1])
    minz = Math.min(minz, v[i + 2]); maxz = Math.max(maxz, v[i + 2])
  }
  let vol6 = 0, area2 = 0, mx = 0, my = 0, mz = 0, cxx = 0, cyy = 0, czz = 0
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
    const ax = v[a], ay = v[a + 1], az = v[a + 2]
    const bx = v[b], by = v[b + 1], bz = v[b + 2]
    const cx = v[c], cy = v[c + 1], cz = v[c + 2]
    const sv = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
    vol6 += sv
    mx += sv * (ax + bx + cx); my += sv * (ay + by + cy); mz += sv * (az + bz + cz)
    // Second moments ∫x²dV etc. over the origin-tetra (for inertia): sv/60·(Σpᵢ² + Σ pairwise pᵢpⱼ).
    cxx += sv * (ax * ax + bx * bx + cx * cx + ax * bx + ax * cx + bx * cx)
    cyy += sv * (ay * ay + by * by + cy * cy + ay * by + ay * cy + by * cy)
    czz += sv * (az * az + bz * bz + cz * cz + az * bz + az * cz + bz * cz)
    const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az
    area2 += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx)
  }
  const com: [number, number, number] = vol6 !== 0 ? [mx / (4 * vol6), my / (4 * vol6), mz / (4 * vol6)] : [0, 0, 0]
  // Axial moments of inertia about the CENTROID (geometric, mm⁵ — multiply by density for mass-weighted).
  // ∫x²dV = cxx/60; parallel-axis to centroid; Ixx=∫(y²+z²)dV = Cyy_c+Czz_c, etc.
  const vol = Math.abs(vol6) / 6
  const Cx = cxx / 60 - vol6 / 6 * com[0] * com[0], Cy = cyy / 60 - vol6 / 6 * com[1] * com[1], Cz = czz / 60 - vol6 / 6 * com[2] * com[2]
  const inertia: [number, number, number] = [Math.abs(Cy + Cz), Math.abs(Cx + Cz), Math.abs(Cx + Cy)]
  // Watertight (manifold) check for 3D-printability — shared util (weld by position, count edge uses).
  const watertight = meshManifold(v, t)
  return { dx: maxx - minx, dy: maxy - miny, dz: maxz - minz, vol, area: area2 / 2, com, inertia, watertight }
}

function computeProps(mesh: MeshData | null): Props {
  return rawComputeProps(mesh)
}

// Inspection display only: preserve every Body as an independent modelling object, but let
// component-level mass/dimensions/watertight readouts include every visible Body.
function visibleComponentProps(c: { id: string; name: string; mesh: MeshData; defId?: string }, defs: readonly ComponentDef[]): Props {
  const bodies = visibleDefinitionBodies(c, defs).map((b) => b.mesh)
  if (bodies.length <= 1) return rawComputeProps(bodies[0] ?? c.mesh)
  let offset = 0
  const triangles: number[] = []
  for (const mesh of bodies) {
    for (let i = 0; i < mesh.triangles.length; i++) triangles.push(mesh.triangles[i] + offset)
    offset += mesh.vertices.length / 3
  }
  return rawComputeProps({ vertices: bodies.flatMap((m) => m.vertices), normals: bodies.flatMap((m) => m.normals), triangles })
}

// One clickable origin datum plane shown during Fusion-style sketch-plane selection.
function DatumPlane({ rot, color, size, onPick }: { rot: [number, number, number]; color: string; size: number; onPick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    // GM-W7 7.1：拾原点基准面 hover → 除咗填充变光，仲加【十字光标】+ 加粗描边，等唔识 CAD 嘅用户一睇就知「而家点落去会拣呢块面」。
    <mesh rotation={rot} renderOrder={998}
      onPointerOver={(e) => { e.stopPropagation(); setHov(true); document.body.style.cursor = 'crosshair' }}
      onPointerOut={() => { setHov(false); document.body.style.cursor = '' }}
      onClick={(e) => { e.stopPropagation(); onPick() }}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial color={color} transparent opacity={hov ? 0.5 : 0.16} side={DoubleSide} depthWrite={false} depthTest={false} />
      <Edges color={color} lineWidth={hov ? 2.6 : 1} />
    </mesh>
  )
}
// GM-W7 7.1：用户参考面（planes[] datum quad，含角度面 arb）各自管自己嘅 hover 态。旧版拾面模式(pickable)干净得只有
// 光标变 pointer、块面唔会亮 → 用户根本睇唔到 mouse over 咗边块。而家：pickable + hover → 填充由 0.2→0.35、色转蓝 accent
// #1572c4、描边加粗、光标转 crosshair（同原点面一致）；非拾面 / 未 hover 态字节不变（唔改既有外观）。
function PickPlaneQuad({ pos, quaternion, rotation, baseColor, size = 220, pickable, onPick }: {
  pos: [number, number, number]; quaternion?: Quaternion; rotation?: [number, number, number]
  baseColor: string; size?: number; pickable: boolean; onPick: () => void
}) {
  const [hov, setHov] = useState(false)
  const active = pickable && hov   // 只有拾面模式先会 hover 高亮（handlers 亦净系 pickable 先挂）
  return (
    <mesh position={pos} {...(quaternion ? { quaternion } : {})} {...(rotation ? { rotation } : {})}
      onClick={pickable ? (e) => { e.stopPropagation(); onPick() } : undefined}
      onPointerOver={pickable ? (e) => { e.stopPropagation(); setHov(true); document.body.style.cursor = 'crosshair' } : undefined}
      onPointerOut={pickable ? () => { setHov(false); document.body.style.cursor = '' } : undefined}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial color={active ? '#1572c4' : pickable ? '#f0a020' : baseColor} transparent opacity={active ? 0.35 : pickable ? 0.2 : 0.1} side={DoubleSide} depthWrite={false} />
      <Edges color={active ? '#1572c4' : pickable ? '#f0a020' : baseColor} lineWidth={active ? 2.4 : 1} />
    </mesh>
  )
}
// The 3 origin datum planes (XY/XZ/YZ) — click one to start a sketch on it (Fusion-style).
function SketchPlanePicker() {
  const choose = useApp((s) => s.chooseSketchPlane)
  const mesh = useApp((s) => s.bodyMesh)
  // 原点平面跟 3D 模型大细自动缩放：~1.4× 最大边，clamp 40–360mm —— 睇得到/㩒得到，但唔会遮住成个 model。
  const size = useMemo(() => {
    const v = mesh?.vertices
    if (!v || !v.length) return 80
    let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9
    for (let i = 0; i + 2 < v.length; i += 3) { const x = v[i], y = v[i + 1], z = v[i + 2]; if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; if (z < mnz) mnz = z; if (z > mxz) mxz = z }
    const maxd = Math.max(mxx - mnx, mxy - mny, mxz - mnz)
    return Math.max(30, Math.min(200, maxd * 0.8))
  }, [mesh])
  return (
    <>
      <DatumPlane rot={[-Math.PI / 2, 0, 0]} color="#d6694e" size={size} onPick={() => choose('XY')} />
      <DatumPlane rot={[0, 0, 0]} color="#4e9e5e" size={size} onPick={() => choose('XZ')} />
      <DatumPlane rot={[0, Math.PI / 2, 0]} color="#4e7fd6" size={size} onPick={() => choose('YZ')} />
    </>
  )
}

function formBoxUv(plane: FormBoxPlane, p: Vector3): [number, number] {
  if (plane === 'XY') return [p.x, -p.z]
  if (plane === 'XZ') return [p.x, p.y]
  return [-p.z, p.y]
}

function FormBoxDraftPreview({ draft }: { draft: FormBoxDraft }) {
  const [meshData, setMeshData] = useState<{ vertices: number[]; triangles: number[]; normals: number[] } | null>(null)
  const placed = useMemo(() => {
    try { return makePlacedBoxCage(draft) } catch { return null }
  }, [draft])
  useEffect(() => {
    if (!placed) { setMeshData(null); return }
    let active = true
    void import('../cad/subdiv').then(({ ccSubdivide, quadsToTris }) => {
      if (!active) return
      try { setMeshData(quadsToTris(ccSubdivide({ verts: placed.verts, quads: placed.quads }, 2))) } catch { setMeshData(null) }
    })
    return () => { active = false }
  }, [placed])
  const smoothGeo = useMemo(() => {
    if (!meshData) return null
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(meshData.vertices, 3))
    g.setAttribute('normal', new Float32BufferAttribute(meshData.normals, 3))
    g.setIndex(meshData.triangles)
    return g
  }, [meshData])
  const edgeGeo = useMemo(() => {
    if (!placed) return null
    const seen = new Set<string>(), pts: number[] = []
    for (const q of placed.quads) for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4], key = Math.min(a, b) + '_' + Math.max(a, b)
      if (seen.has(key)) continue
      seen.add(key); pts.push(...placed.verts[a], ...placed.verts[b])
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pts, 3))
    return g
  }, [placed])
  if (!placed) return null
  const centerCad = formPlanePointForPreview(draft.plane!, draft.center!, draft.planeOffset + (draft.direction === 'symmetric' ? 0 : draft.height))
  const arrowPos = cadPointToThree(centerCad)
  return (
    <>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {smoothGeo && <mesh geometry={smoothGeo}><meshStandardMaterial color="#a8b2ba" roughness={0.68} metalness={0.04} transparent opacity={0.9} /></mesh>}
        {edgeGeo && <lineSegments geometry={edgeGeo}><lineBasicMaterial color="#303942" transparent opacity={0.72} /></lineSegments>}
      </group>
      <Html position={arrowPos} center style={{ pointerEvents: 'none', background: '#f7f9fa', color: '#26343f', border: '1px solid #6f7d88', borderRadius: 2, padding: '2px 5px', fontSize: 11, whiteSpace: 'nowrap' }}>{draft.height.toFixed(3)} mm</Html>
    </>
  )
}

function formPlanePointForPreview(plane: FormBoxPlane, uv: [number, number], normal = 0): [number, number, number] {
  if (plane === 'XY') return [uv[0], uv[1], normal]
  if (plane === 'XZ') return [uv[0], normal, uv[1]]
  return [normal, uv[0], uv[1]]
}

function FormBoxTool() {
  const draft = useApp((s) => s.formBoxDraft)
  const { gl } = useThree()
  const controls = useThree((s) => s.controls) as { enabled?: boolean } | undefined
  useEffect(() => {
    if (!draft || draft.stage !== 'height') return
    const el = gl.domElement
    const oldEnabled = controls?.enabled
    if (controls) controls.enabled = false
    const move = (e: PointerEvent) => useApp.getState().setFormBoxHeightFromPointer(e.clientY)
    const click = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); useApp.getState().confirmFormBoxHeight() }
    el.addEventListener('pointermove', move, true)
    el.addEventListener('click', click, true)
    return () => {
      el.removeEventListener('pointermove', move, true)
      el.removeEventListener('click', click, true)
      if (controls && oldEnabled !== undefined) controls.enabled = oldEnabled
    }
  }, [draft?.stage, gl, controls])
  if (!draft) return null
  if (draft.stage === 'plane') return (
    <>
      <DatumPlane rot={[-Math.PI / 2, 0, 0]} color="#f0a020" size={80} onPick={() => useApp.getState().chooseFormBoxPlane('XY')} />
      <DatumPlane rot={[0, 0, 0]} color="#f0a020" size={80} onPick={() => useApp.getState().chooseFormBoxPlane('XZ')} />
      <DatumPlane rot={[0, Math.PI / 2, 0]} color="#f0a020" size={80} onPick={() => useApp.getState().chooseFormBoxPlane('YZ')} />
    </>
  )
  if (!draft.plane) return null
  if (draft.stage === 'center' || draft.stage === 'size') {
    const rot: [number, number, number] = draft.plane === 'XY' ? [-Math.PI / 2, 0, 0] : draft.plane === 'YZ' ? [0, Math.PI / 2, 0] : [0, 0, 0]
    const pos: [number, number, number] = draft.plane === 'XY' ? [0, draft.planeOffset, 0] : draft.plane === 'XZ' ? [0, 0, -draft.planeOffset] : [draft.planeOffset, 0, 0]
    const rect = draft.stage === 'size' ? formBoxRectCadCorners(draft).map(cadPointToThree) : []
    const c3 = draft.center ? cadPointToThree(formPlanePointForPreview(draft.plane, draft.center, draft.planeOffset)) : null
    const label3 = draft.center ? cadPointToThree(formPlanePointForPreview(draft.plane, [draft.center[0] + draft.length / 2, draft.center[1] + draft.width / 2], draft.planeOffset)) : null
    return (
      <>
        <mesh rotation={rot} position={pos}
          onPointerMove={(e) => { e.stopPropagation(); useApp.getState().setFormBoxPointer(formBoxUv(draft.plane!, e.point)) }}
          onClick={(e) => { e.stopPropagation(); useApp.getState().placeFormBoxPoint(formBoxUv(draft.plane!, e.point), e.nativeEvent.clientY) }}>
          <planeGeometry args={[20000, 20000]} />
          <meshBasicMaterial transparent opacity={0.001} side={DoubleSide} depthWrite={false} />
        </mesh>
        {rect.length > 0 && <Line points={rect} color="#2d86d3" lineWidth={2} depthTest={false} />}
        {c3 && <mesh position={c3}><sphereGeometry args={[1.25, 12, 12]} /><meshBasicMaterial color="#2d86d3" depthTest={false} /></mesh>}
        {label3 && <Html position={label3} center style={{ pointerEvents: 'none', display: 'flex', gap: 4, fontSize: 11, whiteSpace: 'nowrap' }}><span style={{ background: '#f7f9fa', border: '1px solid #70808d', padding: '2px 4px' }}>{draft.length.toFixed(3)} mm</span><span style={{ background: '#f7f9fa', border: '1px solid #70808d', padding: '2px 4px' }}>{draft.width.toFixed(3)} mm</span></Html>}
      </>
    )
  }
  return <FormBoxDraftPreview draft={draft} />
}

function FormBoxCameraRig() {
  const draft = useApp((s) => s.formBoxDraft)
  const { camera } = useThree()
  const controls = useThree((s) => s.controls) as unknown as { target: Vector3; update: () => void } | undefined
  useEffect(() => {
    if (!draft?.plane || !controls) return
    const centerCad = formPlanePointForPreview(draft.plane, draft.center ?? [0, 0], draft.planeOffset + (draft.stage === 'height' || draft.stage === 'ready' ? draft.height / 2 : 0))
    const p = new Vector3(...cadPointToThree(centerCad))
    controls.target.copy(p)
    if (draft.stage === 'center' || draft.stage === 'size') {
      const n = draft.plane === 'XY' ? new Vector3(0, 1, 0) : draft.plane === 'XZ' ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0)
      camera.position.copy(p.clone().addScaledVector(n, 150))
      if (draft.plane === 'XY') camera.up.set(0, 0, -1)
      else camera.up.set(0, 1, 0)
    } else if (draft.stage === 'height' || draft.stage === 'ready') {
      camera.position.set(p.x + 110, p.y + 90, p.z + 110)
      camera.up.set(0, 1, 0)
    }
    camera.lookAt(p); camera.updateProjectionMatrix(); controls.update()
  }, [draft?.plane, draft?.stage, camera, controls])
  return null
}

// GM-FP4 #52：草图文字富对话框（Fusion Text 面板）—— Type / 字高 / 凸高 / 对齐（左中右）。
// 诚实标注：字体家族 / 粗体·斜体 / 沿路径 = worker 单字体（'cad'）架构限，暂唔提供（唔造假 UI）。
function SkTextDialog() {
  const dlg = useApp((s) => s.skTextDlg)
  const mode = useApp((s) => s.mode)
  const lang = useApp((s) => s.lang)
  if (!dlg) return null
  const g = () => useApp.getState()
  const T = (s: string) => tStatus(s, lang)
  const inSketch = mode === 'sketch'
  return (
    <div style={{ position: 'fixed', top: 110, right: 18, zIndex: 240, width: 260, background: '#fff', border: '1px solid #b6c0c9', borderRadius: 9, boxShadow: '0 12px 40px rgba(0,0,0,.28)', padding: 12, display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13 }}>
      <div style={{ fontWeight: 700, color: '#1c5a96' }}>{T('T 草图文字')}</div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, color: '#3a4750' }}>{T('文字 Type')}
        <input autoFocus value={dlg.text} onChange={(e) => g().setSkTextDlg({ text: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') void g().commitSkTextDlg(); else if (e.key === 'Escape') g().cancelSkTextDlg(); e.stopPropagation() }}
          style={{ padding: '4px 6px', border: '1px solid #c4ccd4', borderRadius: 4, fontSize: 14 }} />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#3a4750' }}><span style={{ minWidth: 64 }}>{T('字高 mm')}</span>
        <input type="number" min={2} value={dlg.size} onChange={(e) => g().setSkTextDlg({ size: Math.max(2, Number(e.target.value) || 12) })} style={{ width: 64, padding: '3px 5px', border: '1px solid #c4ccd4', borderRadius: 4 }} />
      </label>
      {!inSketch && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#3a4750' }}><span style={{ minWidth: 64 }}>{T('凸高 mm')}</span>
          <input type="number" min={0.2} step={0.2} value={dlg.height} onChange={(e) => g().setSkTextDlg({ height: Math.max(0.2, Number(e.target.value) || 4) })} style={{ width: 64, padding: '3px 5px', border: '1px solid #c4ccd4', borderRadius: 4 }} />
        </label>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ minWidth: 58, color: '#3a4750' }}>{T('对齐')}</span>
        {(['left', 'center', 'right'] as const).map((a) => (
          <button key={a} className={'sb-tool' + (dlg.align === a ? ' active' : '')} style={{ flex: 1, fontSize: 12 }} onClick={() => g().setSkTextDlg({ align: a })}>{a === 'left' ? '⯇' : a === 'center' ? '≡' : '⯈'}</button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#8a96a0', lineHeight: 1.4 }}>{T('字体 / 粗斜 / 沿路径：现用单一 CAD 字体（内核限）— 生成后为真草图轮廓，可镜像 / 阵列 / 拉伸 / 旋转。')}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="sb-tool sb-finish" style={{ flex: 1 }} onClick={() => void g().commitSkTextDlg()}>{T('✓ 确定')}</button>
        <button className="sb-tool" style={{ flex: 1 }} onClick={() => g().cancelSkTextDlg()}>{T('取消')}</button>
      </div>
    </div>
  )
}

// Controlled mouse-wheel zoom. The stock OrbitControls wheel dolly multiplies by |event.deltaY|,
// so free-spin / high-resolution mice send huge deltas and "zoom all the way" in one notch with no
// fine control. We intercept the wheel in the CAPTURE phase (blocking OrbitControls' own zoom) and
// apply a FIXED, gentle, magnitude-clamped step toward the orbit target — a stable centre pivot the
// user can actually control. Directly setting camera.position then controls.update() is safe: update()
// re-derives the spherical radius from the live camera position each frame (scale stays 1), so the
// dolly persists and damping/rotate/pan are untouched.
const ZOOM_MIND = 2, ZOOM_MAXD = 30000
// #95/#98 GM-L2：由 bodyMesh + 各可见组件包围盒（three-world）求两个几何量 ——
//   · groundY  = 模型最低 three-Y（= CAD z + 组件 pos.y）→ 接地阴影 / 地面反射平面动态贴住模型底，
//                唔再硬钉 worldY≈0（模型抬高 / 建喺 z<0 时阴影唔再脱离/穿模）。
//   · camMaxDist = OrbitControls 距离上限：大模型 FitView/标准视图取景距离 d≈r·3.4≈1.7·对角线 会超默认 30000
//                被夹回 → 取景失败。按对角线抬高（留裕度到 2.4×），细模型维持 30000（字节一致）。
// swizzle 同 FitView 一致（tx=v,ty=v+2,tz=-v+1），忽略组件旋转（同 FitView 取景近似一致）。空场景回落默认值。
function useSceneGround(): { groundY: number; camMaxDist: number } {
  const bodyMesh = useApp((s) => s.bodyMesh)
  const components = useApp((s) => s.components)
  const componentDefs = useApp((s) => s.componentDefs)
  return useMemo(() => {
    let loX = Infinity, loY = Infinity, loZ = Infinity, hiX = -Infinity, hiY = -Infinity, hiZ = -Infinity
    const parts: { v: ArrayLike<number>; off: [number, number, number] }[] = [
      ...components.filter((c) => !c.hidden).flatMap((c) => visibleDefinitionBodies(c, componentDefs).map((b) => ({ v: b.mesh.vertices, off: c.pos }))),
      ...(bodyMesh && bodyMesh.vertices.length ? [{ v: bodyMesh.vertices, off: [0, 0, 0] as [number, number, number] }] : []),
    ]
    for (const { v, off } of parts) {
      for (let i = 0; i + 2 < v.length; i += 3) {
        const x = v[i] + off[0], y = v[i + 2] + off[1], z = -v[i + 1] + off[2]
        if (x < loX) loX = x; if (x > hiX) hiX = x
        if (y < loY) loY = y; if (y > hiY) hiY = y
        if (z < loZ) loZ = z; if (z > hiZ) hiZ = z
      }
    }
    if (!isFinite(loY)) return { groundY: 0, camMaxDist: ZOOM_MAXD }
    const diag = Math.hypot(hiX - loX, hiY - loY, hiZ - loZ)
    return { groundY: loY, camMaxDist: Math.max(ZOOM_MAXD, diag * 2.4) }
  }, [bodyMesh, components, componentDefs])
}
// GM-X2 #12：应用偏好模态（Preferences）—— 主题 / 默认单位 / Z-up 朝向 / 自动正视草图 / 动画过渡 / 缩放方向 / 恢复默认。
function PrefsModal() {
  const open = useApp((s) => s.prefsOpen)
  const prefs = useApp((s) => s.prefs)
  const lang = useApp((s) => s.lang)
  if (!open) return null
  const close = () => useApp.getState().setPrefsOpen(false)
  const setP = <K extends keyof typeof prefs>(k: K, v: (typeof prefs)[K]) => useApp.getState().setPref(k, v)
  const Row = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '5px 0' }} title={hint}>
      <span style={{ fontSize: 12.5 }}>{tStatus(label, lang)}</span>{children}
    </div>
  )
  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="cmd-palette" style={{ width: 360, maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <b style={{ fontSize: 14 }}>⚙ {tStatus('应用偏好', lang)}</b>
          <button className="tb-btn" title={tStatus('关闭', lang)} onClick={close}>✕</button>
        </div>
        <Row label="主题" hint={tStatus('自动 = 跟随系统深浅色', lang)}>
          <select value={prefs.theme} onChange={(e) => setP('theme', e.target.value as typeof prefs.theme)} style={{ fontSize: 12 }}>
            <option value="auto">{tStatus('自动', lang)}</option><option value="light">{tStatus('浅色', lang)}</option><option value="dark">{tStatus('深色', lang)}</option>
          </select>
        </Row>
        <Row label="新文档默认单位" hint={tStatus('对标 Fusion Default Units', lang)}>
          <select value={prefs.defaultUnit} onChange={(e) => setP('defaultUnit', e.target.value as typeof prefs.defaultUnit)} style={{ fontSize: 12 }}>
            <option value="mm">mm</option><option value="cm">cm</option><option value="inch">in</option>
          </select>
        </Row>
        <Row label="默认建模朝向 Z-up" hint={tStatus('webcad 恒 Z-up（此项为一致性信息）', lang)}>
          <input type="checkbox" checked={prefs.zUp} onChange={(e) => setP('zUp', e.target.checked)} />
        </Row>
        <Row label="进入草图自动正视（正交）" hint={tStatus('入草图自动切正投影', lang)}>
          <input type="checkbox" checked={prefs.autoOrthoSketch} onChange={(e) => setP('autoOrthoSketch', e.target.checked)} />
        </Row>
        <Row label="视图过渡动画" hint={tStatus('Look-At 340ms 缓动（关=瞬切）', lang)}>
          <input type="checkbox" checked={prefs.animateTransitions} onChange={(e) => setP('animateTransitions', e.target.checked)} />
        </Row>
        <Row label="滚轮缩放方向" hint={tStatus('反转 = 上滚拉近', lang)}>
          <select value={prefs.zoomDir} onChange={(e) => setP('zoomDir', Number(e.target.value) === -1 ? -1 : 1)} style={{ fontSize: 12 }}>
            <option value={1}>{tStatus('默认（下滚拉近）', lang)}</option><option value={-1}>{tStatus('反转（上滚拉近）', lang)}</option>
          </select>
        </Row>
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between' }}>
          <button className="tb-btn" onClick={() => useApp.getState().resetPrefs()}>{tStatus('恢复默认', lang)}</button>
          <button className="tb-btn" style={{ background: '#1572c4', color: '#fff' }} onClick={close}>{tStatus('完成', lang)}</button>
        </div>
      </div>
    </div>
  )
}

// GM-X2 #13：单位对话框 —— 配对预设（mm/g、cm/g、m/kg、in/oz、ft/lb）+ 自定义（长度+质量独立）。模型/导出恒 mm。
const LEN_OPTS: LenU[] = ['mm', 'cm', 'm', 'inch', 'ft']
const MASS_OPTS: MassU[] = ['g', 'kg', 'oz', 'lb']
function UnitDialog() {
  const open = useApp((s) => s.unitDlgOpen)
  const unitPreset = useApp((s) => s.unitPreset)
  const unit = useApp((s) => s.unit)
  const massUnit = useApp((s) => s.massUnit)
  const lang = useApp((s) => s.lang)
  if (!open) return null
  const close = () => useApp.getState().setUnitDlgOpen(false)
  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="cmd-palette" style={{ width: 340 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <b style={{ fontSize: 14 }}>📐 {tStatus('文档单位', lang)}</b>
          <button className="tb-btn" title={tStatus('关闭', lang)} onClick={close}>✕</button>
        </div>
        <div style={{ fontSize: 11, color: '#8a97a2', marginBottom: 6 }}>{tStatus('仅影响屏上读数（量测/属性）；模型与导出 STL/STEP/DXF 恒 mm。', lang)}</div>
        {UNIT_PRESETS.map((p) => (
          <div key={p.id} className="panel-menu-item" onClick={() => { useApp.getState().setUnitPreset(p.id); close() }}>{unitPreset === p.id ? '● ' : '○ '}{p.label}</div>
        ))}
        <div className="panel-menu-head" style={{ marginTop: 4 }}>{tStatus('自定义', lang)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <span style={{ fontSize: 12, minWidth: 40 }}>{tStatus('长度', lang)}</span>
          <select value={unit} onChange={(e) => useApp.getState().setUnitCustom(e.target.value as LenU, massUnit)} style={{ fontSize: 12 }}>
            {LEN_OPTS.map((u) => <option key={u} value={u}>{u === 'inch' ? 'in' : u}</option>)}
          </select>
          <span style={{ fontSize: 12, minWidth: 40 }}>{tStatus('质量', lang)}</span>
          <select value={massUnit} onChange={(e) => useApp.getState().setUnitCustom(unit as LenU, e.target.value as MassU)} style={{ fontSize: 12 }}>
            {MASS_OPTS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        {unitPreset === 'custom' && <div style={{ fontSize: 11, color: '#8a97a2' }}>{tStatus('（自定义组合）', lang)}</div>}
      </div>
    </div>
  )
}

// GM-X2 #4：可配置网格 —— Adaptive（随相机距离取「靓」cell）/ Fixed（主间距 + 次分格）+ 参考数字。
// 默认 Fixed spacing=100 subdiv=10 → cell 10 / section 100（同旧硬编码字节一致，零回归）。
function ConfigGrid({ show, xform }: { show: boolean; xform: { quaternion: [number, number, number, number]; position: [number, number, number] } | null }) {
  const adaptive = useApp((s) => s.gridAdaptive)
  const spacing = useApp((s) => s.gridSpacing)
  const subdiv = useApp((s) => s.gridSubdiv)
  const refNumbers = useApp((s) => s.gridRefNumbers)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target: { x: number; y: number; z: number } } | null
  const [cell, setCell] = useState(() => computeGridConfig({ adaptive: false, spacing, subdiv, camDist: 0 }))
  useFrame(() => {
    if (!adaptive) return
    const t = controls?.target
    const d = t ? Math.hypot(camera.position.x - t.x, camera.position.y - t.y, camera.position.z - t.z) : 500
    const next = computeGridConfig({ adaptive: true, spacing, subdiv, camDist: d })
    setCell((prev) => (prev.cellSize === next.cellSize && prev.sectionSize === next.sectionSize ? prev : next))
  })
  const fixed = useMemo(() => computeGridConfig({ adaptive: false, spacing, subdiv, camDist: 0 }), [spacing, subdiv])
  if (!show) return null
  const g = adaptive ? cell : fixed
  return (
    <>
      <Grid
        {...(xform ? { quaternion: xform.quaternion, position: xform.position } : {})}
        infiniteGrid
        cellSize={g.cellSize}
        cellThickness={0.6}
        sectionSize={g.sectionSize}
        sectionThickness={1.1}
        cellColor="#c2cad1"
        sectionColor="#9aa6af"
        fadeDistance={2800}
        fadeStrength={1.4}
      />
      {refNumbers && !xform && <GridRefNumbers spacing={g.sectionSize} />}
    </>
  )
}

// GM-X2 #4：网格参考数字 —— 沿 X/Z 主格线标注刻度值（当前显示单位），drei Html 轻量 DOM 标签（用户 opt-in）。
const GRID_LBL_STYLE: CSSProperties = { fontSize: 10, color: '#6a7783', background: 'rgba(255,255,255,0.55)', padding: '0 3px', borderRadius: 3, whiteSpace: 'nowrap', pointerEvents: 'none', userSelect: 'none' }
function GridRefNumbers({ spacing }: { spacing: number }) {
  const unit = useApp((s) => s.unit)
  const per = LEN_PER_MM[unit], suf = LEN_SUFFIX[unit]
  const fmt = (mm: number) => `${(mm / per).toFixed(per >= 1000 ? 3 : per >= 25.4 ? 2 : per >= 10 ? 1 : 0)}${suf}`
  const els: ReactNode[] = []
  const N = 5
  for (let i = -N; i <= N; i++) {
    if (i === 0) continue
    const v = i * spacing
    els.push(<Html key={'gx' + i} position={[v, 0.05, 0]} center distanceFactor={spacing * 12} style={GRID_LBL_STYLE} occlude={false}>{fmt(v)}</Html>)
    els.push(<Html key={'gz' + i} position={[0, 0.05, v]} center distanceFactor={spacing * 12} style={GRID_LBL_STYLE} occlude={false}>{fmt(v)}</Html>)
  }
  return <>{els}</>
}

function WheelZoom({ maxDistance = ZOOM_MAXD }: { maxDistance?: number }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const controls = useThree((s) => s.controls) as unknown as { target: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void }; update: () => void; domElement?: HTMLElement } | null
  const ray = useRef(new Raycaster()).current
  const ndc = useRef(new Vector2()).current
  // S133 DEV：把 three 场景挂 window.__scene（仅 dev，供脚本化验证极点球渲染计数；prod 无影响）
  useEffect(() => { if (import.meta.env.DEV && scene) { const w = window as unknown as { __scene?: unknown; __cam?: unknown; __gl?: unknown; __ctrls?: unknown; __ray?: unknown }; w.__scene = scene; w.__cam = camera; w.__gl = gl; w.__ctrls = controls; w.__ray = ray } }, [scene, camera, gl, controls, ray])
  useEffect(() => {
    const el = (controls && controls.domElement) || gl?.domElement
    if (!el || !controls) return
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return
      e.preventDefault()
      e.stopImmediatePropagation()                 // swallow OrbitControls' too-fast built-in wheel zoom
      const cam = camera as unknown as { isPerspectiveCamera?: boolean; isOrthographicCamera?: boolean; zoom: number; updateProjectionMatrix: () => void; position: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void } }
      // Zoom about the point UNDER THE CURSOR (Fusion behaviour): camera AND target converge onto
      // the cursor hit (body surface, else the sketch/ground plane), so "point at it and scroll"
      // lands exactly on the size/place the user wants. Falls back to the orbit target on no hit.
      const rect = el.getBoundingClientRect()
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      let px = controls.target.x, py = controls.target.y, pz = controls.target.z
      try {
        // Only a real CAD body may become the zoom-to-cursor pivot.  The scene
        // also contains infinite grids, invisible pick proxies and gizmos; a
        // hit on any of those can move the target thousands of units in one
        // notch and looks like an instant min/max zoom.
        const hit = ray.intersectObjects(scene.children, true).find((h) => {
          const o = h.object as typeof h.object & { isMesh?: boolean; userData?: { cadBody?: boolean } }
          return !!o.isMesh && o.visible && o.userData?.cadBody === true && Number.isFinite(h.distance) && h.distance > 0.01
        })
        if (hit) { px = hit.point.x; py = hit.point.y; pz = hit.point.z }
      } catch { /* raycast on exotic objects (gizmos/grid shaders) can throw — keep target pivot */ }
      const t = controls.target
      // GM-X2 #11：缩放方向偏好（Preferences）—— zoomDir=-1 反转滚轮方向（对标 Fusion「Zoom direction」）。
      const direction = (useApp.getState().prefs.zoomDir || 1) as 1 | -1
      const factor = wheelZoomFactor(e.deltaY, e.deltaMode, e.shiftKey, direction)
      if (cam.isOrthographicCamera) {
        // 正交相机：原生滚轮已被上面 stopImmediatePropagation 杀掉 → 必须自己缩，否则正交模式完全缩放唔到（旧版直接 return = 卡死）。
        // 缩放 = 改 camera.zoom；zoom-to-cursor：令光标命中点 px,py,pz 喺屏幕位置保持不变 → target/position 按 z0/z1 朝 pivot 平移。
        const z0 = cam.zoom || 1
        const z1 = Math.min(2000, Math.max(0.02, z0 / factor))   // deltaY>0(factor>1) → zoom 变细 = 拉远
        const r = z0 / z1
        const nx = px + (t.x - px) * r, ny = py + (t.y - py) * r, nz = pz + (t.z - pz) * r
        cam.position.set(cam.position.x + (nx - t.x), cam.position.y + (ny - t.y), cam.position.z + (nz - t.z))
        t.set(nx, ny, nz)
        cam.zoom = z1; cam.updateProjectionMatrix(); controls.update()
        return
      }
      if (!cam.isPerspectiveCamera) return
      const ox = cam.position.x - t.x, oy = cam.position.y - t.y, oz = cam.position.z - t.z
      const dist = Math.hypot(ox, oy, oz) || 1
      const newDist = Math.min(maxDistance, Math.max(ZOOM_MIND, dist * factor))
      const k = newDist / dist
      // converge position AND target toward the pivot (classic zoom-to-cursor)
      cam.position.set(px + (cam.position.x - px) * k, py + (cam.position.y - py) * k, pz + (cam.position.z - pz) * k)
      t.set(px + (t.x - px) * k, py + (t.y - py) * k, pz + (t.z - pz) * k)
      controls.update()
    }
    el.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => el.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions)
  }, [gl, camera, controls, scene, maxDistance])
  return null
}

// T793（S72）Form-lite：盒 cage 细分建模 — 控制点球（点拣）+ TransformControls 拖拽 + Catmull-Clark
// 实时预览。cage 顶点 CAD 坐标（rotated group 内渲染）；gizmo proxy 喺 three 世界（CAD↔three 转换）。
function FormCage() {
  const cage = useApp((s) => s.formCage)
  const [target, setTarget] = useState<Object3D | null>(null)
  const [subdiv, setSubdiv] = useState<{ vertices: number[]; triangles: number[]; normals: number[] } | null>(null)
  useEffect(() => {
    if (!cage) { setSubdiv(null); return }
    let on = true
    void import('../cad/subdiv').then(({ ccSubdivide, quadsToTris }) => {
      if (!on) return
      try { setSubdiv(quadsToTris(ccSubdivide({ verts: cage.verts, quads: cage.quads }, cage.levels, cage.creases, cage.creases.map(() => cage.creaseSoft ?? 1)))) } catch { setSubdiv(null) }
    })
    return () => { on = false }
  }, [cage])
  const geo = useMemo(() => {
    if (!subdiv) return null
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(subdiv.vertices, 3))
    g.setAttribute('normal', new Float32BufferAttribute(subdiv.normals, 3))
    g.setIndex(subdiv.triangles)
    return g
  }, [subdiv])
  const edgeGeo = useMemo(() => {
    if (!cage) return null
    const seen = new Set<string>(), pos: number[] = []
    for (const q of cage.quads) for (let k = 0; k < 4; k++) {
      const a = q[k], b = q[(k + 1) % 4], key = Math.min(a, b) + '_' + Math.max(a, b)
      if (seen.has(key)) continue
      seen.add(key)
      pos.push(...cage.verts[a], ...cage.verts[b])
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    return g
  }, [cage])
  // S165：逐 quad 可拣面（拉伸 push-pull）— 每面 2 三角，点选 → selFormFace
  const faceGeos = useMemo(() => {
    if (!cage) return null
    return cage.quads.map((q) => {
      const g = new BufferGeometry()
      const p = [...cage.verts[q[0]], ...cage.verts[q[1]], ...cage.verts[q[2]], ...cage.verts[q[3]]]
      g.setAttribute('position', new Float32BufferAttribute(p, 3))
      g.setIndex([0, 1, 2, 0, 2, 3])
      g.computeVertexNormals()
      return g
    })
  }, [cage])
  if (!cage) return null
  const sv = cage.sel != null && (cage.msel ?? []).length <= 1 ? cage.verts[cage.sel] : null
  return (
    <>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {geo && <mesh geometry={geo}><meshStandardMaterial color="#7bb8e8" metalness={0.1} roughness={0.55} transparent opacity={0.92} /></mesh>}
        {edgeGeo && <lineSegments geometry={edgeGeo}><lineBasicMaterial color="#3a78b5" transparent opacity={0.55} /></lineSegments>}
        {/* S165：可拣 cage 面（点选 → 面板拉伸）。选中=橙色高亮，未选=近透明但可拣。 */}
        {faceGeos && faceGeos.map((fg, i) => (
          <mesh key={'ff' + i} geometry={fg} onClick={(e) => { e.stopPropagation(); useApp.getState().selFormFace(i === cage.selFace ? null : i) }}>
            <meshBasicMaterial color="#ff8a2a" transparent opacity={i === cage.selFace ? 0.5 : 0.001} side={DoubleSide} depthWrite={false} />
          </mesh>
        ))}
        {cage.verts.map((v, i) => {
          const inSel = (cage.msel ?? []).includes(i)
          return (
            <mesh key={'fv' + i} position={v} renderOrder={999} onClick={(e) => { e.stopPropagation(); useApp.getState().toggleFormVertSel(i, e.shiftKey) }}>
              <sphereGeometry args={[inSel ? 1.7 : 1.15, 10, 10]} />
              <meshBasicMaterial color={inSel ? '#ff8a2a' : '#1aa0ff'} depthTest={false} />
            </mesh>
          )
        })}
      </group>
      {sv && (
        <group key={'fg' + cage.sel}>
          <mesh ref={setTarget} position={[sv[0], sv[2], -sv[1]]}><boxGeometry args={[2, 2, 2]} /><meshBasicMaterial visible={false} /></mesh>
          {target && (
            <TransformControls
              object={target} mode="translate" size={0.7}
              onObjectChange={() => { if (cage.sel != null) useApp.getState().setFormVert(cage.sel, [target.position.x, -target.position.z, target.position.y]) }}
            />
          )}
        </group>
      )}
      {(cage.msel ?? []).length >= 2 && <FormMultiGizmo verts={cage.verts} msel={cage.msel!} />}
    </>
  )
}

// P2 批11：Form 群组变换 gizmo（Fusion Edit Form 移/旋/缩）— proxy 喺选集中心（three 世界，axis-swap [x,z,-y]），
// TransformControls mode 由面板切换；onMouseUp 取 world delta，共轭 Rx(-90°) 转 CAD 空间 → transformFormVerts 一次 commit
//（PoleNet 慣例：拖完先 commit，唔逐帧写 store）。gen 重挂 → gizmo 重置到新中心。对称编辑（formSym）对群组变换唔生效（v1）。
function FormMultiGizmo({ verts, msel }: { verts: [number, number, number][]; msel: number[] }) {
  const mode = useApp((s) => s.formGizmoMode)
  const [target, setTarget] = useState<Object3D | null>(null)
  const [gen, setGen] = useState(0)
  const C = useMemo(() => {
    const c: [number, number, number] = [0, 0, 0]
    for (const i of msel) { const p = verts[i]; if (p) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2] } }
    return [c[0] / msel.length, c[1] / msel.length, c[2] / msel.length] as [number, number, number]
  }, [verts, msel])
  return (
    <group key={'fmg' + gen + '|' + msel.join(',')}>
      <mesh ref={setTarget} position={[C[0], C[2], -C[1]]}><boxGeometry args={[2.4, 2.4, 2.4]} /><meshBasicMaterial visible={false} /></mesh>
      {target && (
        <TransformControls
          object={target} mode={mode === 'move' ? 'translate' : mode} size={0.85}
          onMouseUp={() => {
            const Mw = new Matrix4().compose(target.position, target.quaternion, target.scale)
            const Pre = new Matrix4().makeTranslation(C[0], C[2], -C[1])
            const DeltaThree = Mw.multiply(Pre.invert())
            const R = new Matrix4().makeRotationX(-Math.PI / 2)     // CAD→three
            const DeltaCad = R.clone().invert().multiply(DeltaThree).multiply(R)
            useApp.getState().transformFormVerts(DeltaCad.toArray())
            setGen((g) => g + 1)
          }}
        />
      )}
    </group>
  )
}

// S133（sub-slice 2）：NURBS 曲面极点编辑器 —— CLONE 自 FormCage。
// controlNet.poles 系 CAD 坐标 [x,y,z]（同 parked 网格顶点同坐标系）；同 FormCage 一样喺
// <group rotation={[-Math.PI/2,0,0]}> 内渲染极点球（组旋转做 CAD→three Y-up 提升），
// gizmo proxy 喺 three 世界用同一 axis-swap [x,z,-y] 摆位、写回 [x,-z,y]（FormCage 嘅 [sv0,sv2,-sv1] / [tx,-tz,ty]）。
// 当前可见极点 = controlNet.pole[i] + 累积 deltas[i]；拖完（onMouseUp）取增量世界偏移 → moveEditPole → editPolesCommit 落 editpoles 特征重建变形。
function PoleNet() {
  const target = useApp((s) => s.editPolesTarget)
  const controlNet = useApp((s) => s.controlNet)
  const deltas = useApp((s) => s.editPolesDeltas)
  const [sel, setSel] = useState<number | null>(null)
  const [proxy, setProxy] = useState<Object3D | null>(null)
  // 拣新极点 / 切目标 → 清选中（避免 gizmo 指向旧索引）
  useEffect(() => { setSel(null) }, [target])
  if (target == null || !controlNet) return null
  // 当前可见极点位置（CAD 坐标）= 基极点 + 已落 deltas（length 对齐 nu*nv）
  const poseOf = (i: number): [number, number, number] => {
    const p = controlNet.poles[i]
    const d = deltas?.[i]
    return d ? [p[0] + d[0], p[1] + d[1], p[2] + d[2]] : [p[0], p[1], p[2]]
  }
  const sp = sel != null ? poseOf(sel) : null
  return (
    <>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {controlNet.poles.map((_, i) => {
          const v = poseOf(i)
          return (
            <mesh key={'pole' + i} position={v} renderOrder={999} onClick={(e) => { e.stopPropagation(); setSel(i === sel ? null : i) }}>
              <sphereGeometry args={[i === sel ? 1.7 : 1.15, 10, 10]} />
              <meshBasicMaterial color={i === sel ? '#ff8a2a' : '#1aa0ff'} depthTest={false} />
            </mesh>
          )
        })}
      </group>
      {sp && (
        <group key={'pg' + sel}>
          {/* proxy 喺 three 世界：CAD [x,y,z] → three [x,z,-y]（同 FormCage [sv0,sv2,-sv1]） */}
          <mesh ref={setProxy} position={[sp[0], sp[2], -sp[1]]}><boxGeometry args={[2, 2, 2]} /><meshBasicMaterial visible={false} /></mesh>
          {proxy && sel != null && (
            <TransformControls
              object={proxy} mode="translate" size={0.7}
              // 拖完落特征：proxy 终位写回 CAD [x,-z,y]（FormCage 嘅 [tx,-tz,ty]）−当前可见极点 = 增量世界偏移。
              onMouseUp={() => {
                const cad: [number, number, number] = [proxy.position.x, -proxy.position.z, proxy.position.y]
                const cur = poseOf(sel)
                const dlt: [number, number, number] = [cad[0] - cur[0], cad[1] - cur[1], cad[2] - cur[2]]
                if (dlt[0] || dlt[1] || dlt[2]) void useApp.getState().moveEditPole(sel, dlt)
              }}
            />
          )}
        </group>
      )}
    </>
  )
}

// T794：单位感知长度输入框 — 当前单位显示（inch 模式可打分数 "1/4"/"1 1/2"、后缀 mm/in/"），内部存 mm。
// 文本框（非 number — 要容分数斜线）；失焦重格式化对齐显示。解析唔到就保持旧值（唔写）。
function LenInput({ mm, onMm, unit, w = 56, min, title }: { mm: number; onMm: (v: number) => void; unit: LenUnit; w?: number; min?: number; title?: string }) {
  const [txt, setTxt] = useState(() => toLenInput(mm, unit))
  const [foc, setFoc] = useState(false)
  useEffect(() => { if (!foc) setTxt(toLenInput(mm, unit)) }, [mm, unit, foc])
  return (
    <input
      type="text" inputMode="decimal" value={txt} title={title} aria-label={title || '数值输入'}
      onFocus={() => setFoc(true)}
      onBlur={() => { setFoc(false); setTxt(toLenInput(mm, unit)) }}
      onChange={(e) => { setTxt(e.target.value); const v = parseLen(e.target.value, unit); if (v != null && (min == null || v >= min)) onMm(v) }}
      style={{ width: w }}
    />
  )
}

// Drag-to-move triad gizmo for the selected assembly component (Fusion-style 3-axis move).
// Controls an invisible proxy mesh placed at the component's world position; on drag-end the new
// position is written to the store (which already drives the component render). drei TransformControls
// auto-disables the default OrbitControls while dragging.
// S113：translate-only TransformControls → drei PivotControls 平移+旋转操纵杆（对标 Fusion gumball）。
// 不传 fkMat（identity）→ worldToPose 係 compWorldMatrix 嘅精确逆 → pos/rot 完美往返；顶层组件
// c.pos 即世界坐标（关节链驱动嘅子件仍走关节驱动，呢度同旧 gizmo 一样唔追 FK —— 已知一致限制）。
function ComponentGizmo() {
  const sel = useApp((s) => s.selectedComponent)
  const components = useApp((s) => s.components)
  const setComponentPos = useApp((s) => s.setComponentPos)
  const setComponentRot = useApp((s) => s.setComponentRot)
  const resolveMates = useApp((s) => s.resolveMates)
  const grounded = useApp((s) => s.grounded)
  const mode = useApp((s) => s.mode)
  const c = components.find((x) => x.id === sel)
  return (
    <ComponentGumball
      component={c}
      grounded={grounded}
      setComponentPos={setComponentPos}
      setComponentRot={setComponentRot}
      resolveMates={resolveMates}
      enabled={mode === 'model'}
    />
  )
}

// GM-W5 5.3：框选 camera 桥 —— Canvas 内元件将当前 camera 交俾 wrapper 层做 marquee 屏幕投影
// （orbit/正交切换都跟得上：每 render 赋值，攞嘅时候永远系当前生效相机）。
let _vpCam: Camera | null = null
function MarqueeCamBridge() {
  const camera = useThree((s) => s.camera)
  _vpCam = camera as unknown as Camera
  return null
}

export default function Viewport() {
  useEffect(() => {
    window.addEventListener('webcad:export-view-png', exportViewPNG)
    return () => window.removeEventListener('webcad:export-view-png', exportViewPNG)
  }, [])
  const inspectShade = useApp((s) => s.inspectShade)
  const inspectMode = useApp((s) => s.inspectMode)
  const needsCurvatureAnalysis = inspectMode || ['curv', 'gausscurv', 'kmax', 'kmin', 'comb'].includes(inspectShade)
  const bodyMesh = useApp((s) => s.bodyMesh)
  const editPolesMode = useApp((s) => s.editPolesMode)        // S133：曲面极点编辑模式（parked 变可拾 + PoleNet）
  const editPolesTarget = useApp((s) => s.editPolesTarget)    // S133：当前编辑曲面索引（高亮拣中体）
  const quiltPickMode = useApp((s) => s.quiltPickMode)        // S201：整张曲面加厚的画布直选模式
  const components = useApp((s) => s.components)
  const componentDefs = useApp((s) => s.componentDefs)
  const selectedComponent = useApp((s) => s.selectedComponent)
  // The selected-component status strip uses computeProps below.  Shadow the generic mesh
  // reader here so that, when it receives the selected occurrence's compatibility mesh (B1),
  // it reports all visible definition bodies instead.  Other viewport meshes keep the base path.
  const baseComputeProps = rawComputeProps
  const computeProps = (mesh: MeshData | null): Props => {
    const selected = selectedComponent ? components.find((c) => c.id === selectedComponent) : undefined
    return selected && mesh === selected.mesh ? visibleComponentProps(selected, componentDefs) : baseComputeProps(mesh)
  }
  const selectComponent = useApp((s) => s.selectComponent)
  const sceneMoldMode = useApp((s) => s.moldMode)   // 模流模式：令选中/唯一网格组件可放浇口 + 幽灵化（同 moldTargetMesh 选取逻辑一致）
  // 模流目标组件 id（无活动实体时）：选中网格组件，否则唯一网格组件。同 store.moldTargetMesh 一致。
  const moldTargetCompId = (sceneMoldMode > 0 && !(bodyMesh && bodyMesh.triangles.length)) ? (() => {
    const mc = components.filter((c) => c.mesh && c.mesh.triangles.length)
    const c = mc.find((x) => x.id === selectedComponent) || (mc.length === 1 ? mc[0] : null)
    return c ? c.id : null
  })() : null
  const editingComp = useApp((s) => s.editingComponent)
  const vpDlg = useApp((s) => s.vpDlg)
  const setVpDlg = useApp((s) => s.setVpDlg)
  const setComponentPos = useApp((s) => s.setComponentPos)
  const setComponentRot = useApp((s) => s.setComponentRot)
  const sketchFromFace = useApp((s) => s.sketchFromFace)
  const faceCutThrough = useApp((s) => s.faceCutThrough)
  const setFaceCutThrough = useApp((s) => s.setFaceCutThrough)
  const edgeRoundPick = useApp((s) => s.edgeRoundPick)
  const edgeRoundSize = useApp((s) => s.edgeRoundSize)
  const filletR2 = useApp((s) => s.filletR2)
  const setFilletR2 = useApp((s) => s.setFilletR2)
  // R1 修改圆角：弦高模式 + 收进量
  const filletMode = useApp((s) => s.filletMode)
  const filletChord = useApp((s) => s.filletChord)
  const filletSetback = useApp((s) => s.filletSetback)
  const filletAsymFlip = useApp((s) => s.filletAsymFlip)
  const filletType = useApp((s) => s.filletType)
  const filletRuleMode = useApp((s) => s.filletRuleMode)
  const filletRuleFaceSets = useApp((s) => s.filletRuleFaceSets)
  const filletRuleSlot = useApp((s) => s.filletRuleSlot)
  const filletFullFaceSets = useApp((s) => s.filletFullFaceSets)
  const filletFullSlot = useApp((s) => s.filletFullSlot)
  const setFilletMode = useApp((s) => s.setFilletMode)
  const setFilletChord = useApp((s) => s.setFilletChord)
  const setFilletSetback = useApp((s) => s.setFilletSetback)
  const setFilletAsymFlip = useApp((s) => s.setFilletAsymFlip)
  const edgeRoundChain = useApp((s) => s.edgeRoundChain)
  const pushPullMode = useApp((s) => s.pushPullMode)
  const pushPullDist = useApp((s) => s.pushPullDist)
  const pushPullPicks = useApp((s) => s.pushPullPicks)   // P2 批9：多面按拉
  const delFacePicks2 = useApp((s) => s.delFacePicks)
  const delFaceMode2 = useApp((s) => s.delFaceMode)
  const setPushPullDist = useApp((s) => s.setPushPullDist)
  // GM-B2 移动面工具栏
  const moveFaceMode = useApp((s) => s.moveFaceMode)
  const moveFacePicks = useApp((s) => s.moveFacePicks)   // GM-L2 v2：累积多面（工具栏面数 / 确定）
  const moveFaceDist = useApp((s) => s.moveFaceDist)
  const setMoveFaceDist = useApp((s) => s.setMoveFaceDist)
  const moveFaceKind = useApp((s) => s.moveFaceKind)
  const setMoveFaceKind = useApp((s) => s.setMoveFaceKind)
  const offsetType = useApp((s) => s.offsetType)   // GM-3DV3 M8
  const setOffsetType = useApp((s) => s.setOffsetType)
  const moveFaceAngle = useApp((s) => s.moveFaceAngle)
  const setMoveFaceAngle = useApp((s) => s.setMoveFaceAngle)
  const setEdgeRoundSize = useApp((s) => s.setEdgeRoundSize)
  const edgeRoundPicks = useApp((s) => s.edgeRoundPicks)
  const edgeRoundPickLines = useApp((s) => s.edgeRoundPickLines)   // P2 audit：整条棱高亮 polyline（CAD 坐标）
  const roundPreviewMesh = useApp((s) => s.roundPreviewMesh)   // P2 批7：圆角实时预览网格（edgeRoundPick 关掉即忽略 — 单一 guard，免走 20+ 清理位）
  const roundPreviewFail = useApp((s) => s.roundPreviewFail)
  const edgeRoundRadii = useApp((s) => s.edgeRoundRadii)   // S174：逐边半径
  const edgeRoundGroupIds = useApp((s) => s.edgeRoundGroupIds)
  const filletRadiusGroups = useApp((s) => s.filletRadiusGroups)
  const filletActiveGroup = useApp((s) => s.filletActiveGroup)
  const chamferMode = useApp((s) => s.chamferMode)
  const setChamferMode = useApp((s) => s.setChamferMode)
  const chamferSize2 = useApp((s) => s.chamferSize2)
  const setChamferSize2 = useApp((s) => s.setChamferSize2)
  const chamferAngle = useApp((s) => s.chamferAngle)
  const setChamferAngle = useApp((s) => s.setChamferAngle)
  const chamferFlip = useApp((s) => s.chamferFlip)
  const chamferRefFace = useApp((s) => s.chamferRefFace)
  const toggleChamferFlip = useApp((s) => s.toggleChamferFlip)
  const commitEdgeRound = useApp((s) => s.commitEdgeRound)
  const cancelEdgeRound = useApp((s) => s.cancelEdgeRound)
  const boundaryPatchPick = useApp((s) => s.boundaryPatchPick)
  const boundaryPatchPicks = useApp((s) => s.boundaryPatchPicks)
  const boundaryPatchTangent = useApp((s) => s.boundaryPatchTangent)
  const boundaryPatchThick = useApp((s) => s.boundaryPatchThick)
  const surfBridgePickM = useApp((s) => s.surfBridgePick)
  const surfBridgePicks = useApp((s) => s.surfBridgePicks)
  const surfBridgeThick = useApp((s) => s.surfBridgeThick)
  const commitBoundaryPatch = useApp((s) => s.commitBoundaryPatch)
  const cancelBoundaryPatch = useApp((s) => s.cancelBoundaryPatch)
  const shellMode = useApp((s) => s.shellMode)
  const shellPicks = useApp((s) => s.shellPicks)
  const shellThickness = useApp((s) => s.shellThickness)
  const setShellThickness = useApp((s) => s.setShellThickness)
  const shellType = useApp((s) => s.shellType)
  const setShellType = useApp((s) => s.setShellType)
  const shellTangentChain = useApp((s) => s.shellTangentChain)
  const toggleShellTangentChain = useApp((s) => s.toggleShellTangentChain)
  const shellDir = useApp((s) => s.shellDir)   // GM-3DV3 M2：壁厚方向
  const setShellDir = useApp((s) => s.setShellDir)
  const commitShell = useApp((s) => s.commitShell)
  const cancelShell = useApp((s) => s.cancelShell)
  // R1 面圆角 dialog hooks
  const faceFilletMode = useApp((s) => s.faceFilletMode)
  const faceFilletPicks = useApp((s) => s.faceFilletPicks)
  const faceFilletRadius = useApp((s) => s.faceFilletRadius)
  const setFaceFilletRadius = useApp((s) => s.setFaceFilletRadius)
  const commitFaceFillet = useApp((s) => s.commitFaceFillet)
  const cancelFaceFillet = useApp((s) => s.cancelFaceFillet)
  const feaMode = useApp((s) => s.feaMode)
  const feaBusy = useApp((s) => s.feaBusy)
  const feaFixed = useApp((s) => s.feaFixed)
  const feaFixed2 = useApp((s) => s.feaFixed2)
  const feaBeam3pt = useApp((s) => s.feaBeam3pt)
  const feaLoad = useApp((s) => s.feaLoad)
  const feaForceN = useApp((s) => s.feaForceN)
  const feaLoadMode = useApp((s) => s.feaLoadMode)   // S95：集中力 / 压力
  const feaPressure = useApp((s) => s.feaPressure)
  const feaDir = useApp((s) => s.feaDir)
  const feaCustomDir = useApp((s) => s.feaCustomDir)
  const feaRes = useApp((s) => s.feaRes)
  const feaMat = useApp((s) => s.feaMat)
  const feaResult = useApp((s) => s.feaResult)
  const feaField = useApp((s) => s.feaField)   // S96：应力/位移云图切换
  const fatigueCase = useApp((s) => s.feaFatigueCase)   // S183：疲劳工况
  const feaDeform = useApp((s) => s.feaDeform)   // S168：变形形态显示/动画/放大
  const feaProbeOn = useApp((s) => s.feaProbeOn)   // S170：结果探针模式
  const feaProbe = useApp((s) => s.feaProbe)       // S170：被探针拣中嘅体素 index
  const feaFixMode = useApp((s) => s.feaFixMode)   // S100：固定面约束类型
  const feaGravity = useApp((s) => s.feaGravity)   // S111：自重体载
  const feaAccel = useApp((s) => s.feaAccel)       // S175：体载加速度方向+倍数（g 单位）
  const feaPinPick = useApp((s) => s.feaPinPick)   // S116：拾销孔模式（面板掣高亮）
  const feaBearingPick = useApp((s) => s.feaBearingPick)   // S171：拾轴承孔模式（面板掣高亮）
  const feaPin = useApp((s) => s.feaPin)           // S116：当前销约束（面板显示 Ø）
  const feaBearing = useApp((s) => s.feaBearing)   // S171：当前轴承载荷孔（面板显示 Ø）
  const draftResult = useApp((s) => s.draftResult) // S118：拔模分析结果（面板 + overlay）
  const draftPull = useApp((s) => s.draftPull)     // S118：当前脱模方向
  const draftGradient = useApp((s) => s.draftGradient)   // #174-4：逐三角梯度开关
  const accessResult = useApp((s) => s.accessResult)     // #174-7：脱模可达性结果
  const slopeResult = useApp((s) => s.slopeResult) // S187：斜度分析结果（面板 + overlay）
  const slopeRef = useApp((s) => s.slopeRef)       // S187：当前斜度参考方向
  const sectionResult = useApp((s) => s.sectionResult) // S119：草图截面属性结果（面板）
  const setFeaOpt = useApp((s) => s.setFeaOpt)
  const runFeaSolve = useApp((s) => s.runFeaSolve)
  const feaConvBusy = useApp((s) => s.feaConvBusy)     // S101[6]：收敛研究
  const feaConvResult = useApp((s) => s.feaConvResult)
  const runFeaConvergence = useApp((s) => s.runFeaConvergence)
  const draftPickMode = useApp((s) => s.draftPickMode)   // S101[5]：拔模拾中性面（主面板对话框用）
  const draftNeutral = useApp((s) => s.draftNeutral)
  const draftSides = useApp((s) => s.draftSides)
  const draftAngle = useApp((s) => s.draftAngle)         // P2：拔模参数入对话框
  const draftTwoSided = useApp((s) => s.draftTwoSided)
  const draftFlip = useApp((s) => s.draftFlip)
  const modalBusy = useApp((s) => s.modalBusy)         // S80：模态分析
  const modalResult = useApp((s) => s.modalResult)
  const modalShow = useApp((s) => s.modalShow)
  const runModalSolve = useApp((s) => s.runModalSolve)
  const bucklingBusy = useApp((s) => s.bucklingBusy)   // S82：屈曲分析
  const bucklingResult = useApp((s) => s.bucklingResult)
  const runBucklingSolve = useApp((s) => s.runBucklingSolve)
  const runPrestressedModalSolve = useApp((s) => s.runPrestressedModalSolve)   // S183：预应力模态
  const topoptBusy = useApp((s) => s.topoptBusy)       // S83：生成式设计
  const topoptResult = useApp((s) => s.topoptResult)
  const topoptVolfrac = useApp((s) => s.topoptVolfrac)
  const runTopoptSolve = useApp((s) => s.runTopoptSolve)
  const thermalBusy = useApp((s) => s.thermalBusy)     // S84：热分析
  const thermalResult = useApp((s) => s.thermalResult)
  const thermalThot = useApp((s) => s.thermalThot)
  const thermalTcold = useApp((s) => s.thermalTcold)
  const runThermalSolve = useApp((s) => s.runThermalSolve)
  const thermalStressBusy = useApp((s) => s.thermalStressBusy)  // S105：热-结构耦合
  const thermalTref = useApp((s) => s.thermalTref)
  const runThermalStressSolve = useApp((s) => s.runThermalStressSolve)
  const moldModeP = useApp((s) => s.moldMode)        // T771：模流面板
  const moldGates = useApp((s) => s.moldGates)
  const moldMat = useApp((s) => s.moldMat)
  const moldRes = useApp((s) => s.moldRes)
  const moldBusy = useApp((s) => s.moldBusy)
  const moldProg = useApp((s) => s.moldProg)
  const moldProgNote = useApp((s) => s.moldProgNote)
  const moldField = useApp((s) => s.moldField)
  const moldT = useApp((s) => s.moldT)
  const [moldPlaying, setMoldPlaying] = useState(false)   // 充填动画自动播放（用户报：flow anime 唔郁 —— 原本净係手动滑杆，加返 ▶ 自动播放）
  const moldFlowLines = useApp((s) => s.moldFlowLines)   // S190：流向线开关
  const moldXray = useApp((s) => s.moldXray)             // 透明体素云（透视睇内部流动）
  const moldSolver = useApp((s) => s.moldSolver)          // 真 2.5D 压力求解器 vs 趋势
  const moldThermal = useApp((s) => s.moldThermal)        // GM-W8 β3：Stage-2 热耦合
  const moldTMelt = useApp((s) => s.moldTMelt)            // 熔体入口温度 °C（null = 材料缺省）
  const moldTMold = useApp((s) => s.moldTMold)            // 模壁温度 °C（null = 材料缺省）
  const moldTempView = useApp((s) => s.moldTempView)      // 云图切熔体温度
  const moldPacking = useApp((s) => s.moldPacking)        // GM-P3UI：Stage-3 保压 / PVT 收缩
  const moldPackPressure = useApp((s) => s.moldPackPressure)   // 保压压力 MPa（UI）
  const moldPackTime = useApp((s) => s.moldPackTime)          // 保压时间 s
  const moldRunnerBalance = useApp((s) => s.moldRunnerBalance)   // 自动流道平衡
  const setMoldGate = useApp((s) => s.setMoldGate)        // 改某浇口类型/权重
  const moldResult = useApp((s) => s.moldResult)
  // 风洞 / 水洞面板
  const windModeP = useApp((s) => s.windMode)
  const windEngineP = useApp((s) => s.windEngine)   // S4：'gpu' = 逐帧 GPU LBM（可拖零件）；'cpu' = worker 跑完凍結
  const windLiveP = useApp((s) => s.windLive)
  const windBusy = useApp((s) => s.windBusy)
  const windProg = useApp((s) => s.windProg)
  const windProgNote = useApp((s) => s.windProgNote)
  const windSpeed = useApp((s) => s.windSpeed)
  const windFluid = useApp((s) => s.windFluid)
  const windAxis = useApp((s) => s.windAxis)
  const windSign = useApp((s) => s.windSign)
  const windRes = useApp((s) => s.windRes)
  const windField = useApp((s) => s.windField)
  const windShowFlow = useApp((s) => s.windShowFlow)
  const windViz = useApp((s) => s.windViz)   // GM-W3 3.1 / S2：烟流 / 流线 / 箭头（面板 toggle 用）
  const windSmokeAlpha = useApp((s) => s.windSmokeAlpha)     // S2 烟流：密度
  const windSmokeSpeed = useApp((s) => s.windSmokeSpeed)     // S2 烟流：动画快慢（纯视觉）
  const windSmokeColor = useApp((s) => s.windSmokeColor)     // S2 烟流：上色模式
  const windStreakScale = useApp((s) => s.windStreakScale)   // S2 烟流：拖尾长度
  const windRibbonAlpha = useApp((s) => s.windRibbonAlpha)   // S3 条带：不透明度
  const windRibbonWidth = useApp((s) => s.windRibbonWidth)   // S3 条带：阔度倍率
  const windRibbonSigma = useApp((s) => s.windRibbonSigma)   // S3 条带：软边消光
  const windRibbonSpread = useApp((s) => s.windRibbonSpread) // S3 条带：下游扩散
  const windXray = useApp((s) => s.windXray)
  const windResult = useApp((s) => s.windResult)
  const runWindSolve = useApp((s) => s.runWindSolve)
  const setWindOpt = useApp((s) => s.setWindOpt)
  const lowPower = useApp((s) => s.lowPower)   // 弱机/手机：预设精细度已调低（防本机卡）；封顶滑杆 + 显提示
  useEffect(() => {
    // ▶ 充填动画自动播放：moldT 由头推到满（约 2.3 秒）再循环。只改 moldT（轻量），MoldOverlay 颜色 useEffect 自动跟住重上色显示前沿推进。
    if (!moldPlaying || !moldResult) return
    const id = setInterval(() => {
      const cur = useApp.getState().moldT
      useApp.getState().setMoldOpt({ moldT: cur >= 1 ? 0.02 : Math.min(1, cur + 0.04) })
    }, 90)
    return () => clearInterval(id)
  }, [moldPlaying, moldResult])
  const setMoldOpt = useApp((s) => s.setMoldOpt)
  const runMoldSolve = useApp((s) => s.runMoldSolve)
  const moldBodyMesh = useApp((s) => s.bodyMesh)
  const moldComponents = useApp((s) => s.components)
  const moldSelComp = useApp((s) => s.selectedComponent)
  const moldJoints = useApp((s) => s.joints)
  // 模流目标网格（活动实体 或 选中/唯一网格组件）—— 同 store.moldTargetMesh / runMoldSolve 一致。
  // estimateMold 只用 bbox/体积/面积（刚体变换不变），故用 bake 后嘅 mesh 一样准。
  const moldSrcMesh = useMemo(() => moldTargetMesh({ bodyMesh: moldBodyMesh, components: moldComponents, selectedComponent: moldSelComp, joints: moldJoints }), [moldBodyMesh, moldComponents, moldSelComp, moldJoints])
  const moldEst = useMemo(() => estimateMold(moldSrcMesh, moldRes, moldSolver), [moldSrcMesh, moldRes, moldSolver])   // 精细度滑杆预计耗时/体素数
  const holeMode = useApp((s) => s.holeMode)
  const holeEditId = useApp((s) => s.holeEditId)
  const holePos = useApp((s) => s.holePos)
  const holeThrough = useApp((s) => s.holeThrough)
  const setHoleThrough = useApp((s) => s.setHoleThrough)
  const holeToNext = useApp((s) => s.holeToNext)              // GM-3DV1 S10
  const setHoleToNext = useApp((s) => s.setHoleToNext)
  const holeToObject = useApp((s) => s.holeToObject)
  const holeToObjectPick = useApp((s) => s.holeToObjectPick)
  const holeToObjectPt = useApp((s) => s.holeToObjectPt)
  const setHoleToObject = useApp((s) => s.setHoleToObject)
  const commitHole = useApp((s) => s.commitHole)
  const cancelHole = useApp((s) => s.cancelHole)
  const holeD = useApp((s) => s.holeD)
  const setHoleD = useApp((s) => s.setHoleD)
  const holeDepth = useApp((s) => s.holeDepth)
  const setHoleDepth = useApp((s) => s.setHoleDepth)
  const holeType = useApp((s) => s.holeType)
  const setHoleType = useApp((s) => s.setHoleType)
  const holeDrillPoint = useApp((s) => s.holeDrillPoint)
  const setHoleDrillPoint = useApp((s) => s.setHoleDrillPoint)
  const holeDrillAngle = useApp((s) => s.holeDrillAngle)
  const setHoleDrillAngle = useApp((s) => s.setHoleDrillAngle)
  const holeFinePitch = useApp((s) => s.holeFinePitch)
  const holeTapModeled = useApp((s) => s.holeTapModeled)
  const holeCbD = useApp((s) => s.holeCbD)               // P2：沉头/埋头覆写（null=ISO 表自动）
  const holeCbDepth = useApp((s) => s.holeCbDepth)
  const holeCsD = useApp((s) => s.holeCsD)
  const holeCsAngle = useApp((s) => s.holeCsAngle)
  const holeSpec = screwSpec(holeD)                      // auto 值显示用（6行表查，平）
  const setHoleFinePitch = useApp((s) => s.setHoleFinePitch)
  const holeBoltCircle = useApp((s) => s.holeBoltCircle)
  const setHoleBoltCircle = useApp((s) => s.setHoleBoltCircle)
  const holeBcCount = useApp((s) => s.holeBcCount)
  const setHoleBcCount = useApp((s) => s.setHoleBcCount)
  const holeBcPcd = useApp((s) => s.holeBcPcd)
  const setHoleBcPcd = useApp((s) => s.setHoleBcPcd)
  const holeClearance = useApp((s) => s.holeClearance)
  const setHoleClearance = useApp((s) => s.setHoleClearance)
  const holeChamfer = useApp((s) => s.holeChamfer)
  const setHoleChamfer = useApp((s) => s.setHoleChamfer)
  const holeSlot = useApp((s) => s.holeSlot)
  const setHoleSlot = useApp((s) => s.setHoleSlot)
  const holeSlotLen = useApp((s) => s.holeSlotLen)
  const setHoleSlotLen = useApp((s) => s.setHoleSlotLen)
  const holeSlotAng = useApp((s) => s.holeSlotAng)
  const setHoleSlotAng = useApp((s) => s.setHoleSlotAng)
  const featDlg = useApp((s) => s.featDlg)
  const setFeatParam = useApp((s) => s.setFeatParam)
  const commitFeatDlg = useApp((s) => s.commitFeatDlg)
  const cancelFeatDlg = useApp((s) => s.cancelFeatDlg)
  const cpSelFeat = useApp((s) => s.selectedFeature)   // T757：環形阵列「所选特征」对象提示
  const facePatternPicks = useApp((s) => s.facePatternPicks)
  const facePatternPick = useApp((s) => s.facePatternPick)
  const cpSelCompCount = useApp((s) => s.checkedComps.length || (s.selectedComponent ? 1 : 0))
  const canvasImg = useApp((s) => s.canvasImg)         // T764：参考图描摹
  const laserDlg = useApp((s) => s.laserDlg)           // T783：激光参数对话框
  const laserOpts = useApp((s) => s.laserOpts)
  const millDlg = useApp((s) => s.millDlg)             // T789：CNC 铣削对话框
  const millOpts = useApp((s) => s.millOpts)
  const finish3dDlg = useApp((s) => s.finish3dDlg)     // S81：3D 精加工对话框
  const finish3dOpts = useApp((s) => s.finish3dOpts)
  const latheDlg = useApp((s) => s.latheDlg)           // T799：CNC 车削对话框
  const latheOpts = useApp((s) => s.latheOpts)
  const cameraOrtho = useApp((s) => s.cameraOrtho)     // S193：正交相机
  const ssao = useApp((s) => s.ssao)                   // S193：环境光遮蔽（GTAO）
  const cameraFov = useApp((s) => s.cameraFov)         // S193：透视 FOV 视野角
  const updateCanvasImg = useApp((s) => s.updateCanvasImg)
  const canvasCount = useApp((s) => s.canvases.length)                         // GM-X3 #2：多张 Canvas
  const activeCv = useApp((s) => s.canvases.find((c) => c.id === s.activeCanvas) ?? null)   // GM-X3 #3：活动 canvas 逐张字段
  const measureEdgeMode = useApp((s) => s.measureEdgeMode)
  const measureEdgeInfo = useApp((s) => s.measureEdgeInfo)
  const measureFaceMode = useApp((s) => s.measureFaceMode)
  const measureFaceInfo = useApp((s) => s.measureFaceInfo)
  const measureAngleMode = useApp((s) => s.measureAngleMode)
  const measureAngleInfo = useApp((s) => s.measureAngleInfo)
  const measureUniMode = useApp((s) => s.measureUniMode)         // GM-X1 #1/#2
  const measureUniResult = useApp((s) => s.measureUniResult)
  const measureUniPicks = useApp((s) => s.measureUniPicks)
  const measureSelFilter = useApp((s) => s.measureSelFilter)
  const measurePrecision = useApp((s) => s.measurePrecision)     // GM-X1 #3
  const secondaryUnit = useApp((s) => s.secondaryUnit)           // GM-X1 #4
  const measureSnapMarkers = useApp((s) => s.measureSnapMarkers)  // #174-6
  const propsDialog = useApp((s) => s.propsDialog)               // GM-X1 #10
  const propsDialogData = useApp((s) => s.propsDialogData)
  const joints = useApp((s) => s.joints)
  const jointOrigins = useApp((s) => s.jointOrigins)   // GM-3DV4 A1：可复用关节原点标记
  const explodeLeaders = useApp((s) => s.explodeLeaders)   // GM-3DV4 A12：爆炸引线开关
  const fourBar = useApp((s) => s.fourBar)
  const setFourBarAngle = useApp((s) => s.setFourBarAngle)
  const motionTracePts = useApp((s) => s.motionTracePts)
  const sixBar = useApp((s) => s.sixBar)
  const setSixBarAngle = useApp((s) => s.setSixBarAngle)
  const closeSixBar = useApp((s) => s.closeSixBar)
  const motionEnvelope = useApp((s) => s.motionEnvelope)
  const envBtn = () => (motionEnvelope ? useApp.getState().clearEnvelope() : useApp.getState().computeEnvelope())
  const setFourBar = useApp((s) => s.setFourBar)
  const flipFourBar = useApp((s) => s.flipFourBar)
  const closeFourBar = useApp((s) => s.closeFourBar)
  const sliderCrank = useApp((s) => s.sliderCrank)
  const setSliderCrankAngle = useApp((s) => s.setSliderCrankAngle)
  const setSliderCrank = useApp((s) => s.setSliderCrank)
  const closeSliderCrank = useApp((s) => s.closeSliderCrank)
  const section = useApp((s) => s.section)
  const sectionMesh = useApp((s) => s.sectionMesh)
  const setSection = useApp((s) => s.setSection)
  const setView = useApp((s) => s.setView)
  const busy = useApp((s) => s.busy)
  const status = useApp((s) => s.status)
  const lang = useApp((s) => s.lang)   // T807：状态栏 en 渲染时翻译
  const mode = useApp((s) => s.mode)
  const navTool = useApp((s) => s.navTool)
  const patchMode = useApp((s) => s.patchMode)         // T805：曲面 Patch 拾点横幅
  const patchPts = useApp((s) => s.patchPts)
  const renderModeOn = useApp((s) => s.renderMode)     // T783：渲染模式按钮高亮
  const groundShadow = useApp((s) => s.groundShadow)   // S 接地阴影：工作模式柔和落地阴影开关
  const groundShadowOpacity = useApp((s) => s.groundShadowOpacity)   // S 接地阴影深浅可调
  const datumHidden = useApp((s) => s.datumHidden)   // S 构造基准隐藏集（浏览器树眼掣）
  const groundReflection = useApp((s) => s.groundReflection)   // S188：地面反射开关
  const rtMode = useApp((s) => s.rtMode)               // S105：画布内路径追踪
  const rtSamples = useApp((s) => s.rtSamples)
  const rtProgress = useApp((s) => s.rtProgress)
  const renderExposure = useApp((s) => s.renderExposure)  // S93：渲染曝光滑杆
  const hdriPreset = useApp((s) => s.hdriPreset)          // S109：HDRI 环境
  const hdriIntensity = useApp((s) => s.hdriIntensity)
  const hdriRotation = useApp((s) => s.hdriRotation)      // HDRI 环境绕 Y 轴旋转（弧度）
  const bgPreset = useApp((s) => s.bgPreset)             // 工作模式背景预设（''=透明=旧行为）
  const setBgPreset = useApp((s) => s.setBgPreset)
  const exportScale = useApp((s) => s.exportScale)       // S192：高清出图倍率
  const exportTransparent = useApp((s) => s.exportTransparent)
  const material = useApp((s) => s.material)             // S192：金属度/粗糙度实时滑杆
  const matLibOpen = useApp((s) => s.matLibOpen)         // S187：外观材质库浮窗开关
  const materialLibrary = useApp((s) => s.materialLibrary)  // S187：用户已存外观预设
  const compCountNav = useApp((s) => s.components.length)
  const selFilter = useApp((s) => s.selFilter)      // GM-X4：选择过滤器对象 {priority, types, selectThrough}
  const isDefaultSelFilterUI = isDefaultSelFilter(selFilter)   // 非默认态 → 高亮过滤器按钮（提示已锁定拣选）
  const setNavTool = useApp((s) => s.setNavTool)
  const showGrid = useApp((s) => s.showGrid)
  const skGrid = useApp((s) => s.skView.grid)   // 草图面板「网格」开关（草图模式下覆盖 showGrid）
  const toggleGrid = useApp((s) => s.toggleGrid)
  const wireframe = useApp((s) => s.wireframe)
  const toggleWireframe = useApp((s) => s.toggleWireframe)
  const toggleGroundShadow = useApp((s) => s.toggleGroundShadow)   // S 接地阴影开关
  const toggleGroundReflection = useApp((s) => s.toggleGroundReflection)   // S188：地面反射开关
  const edgeDisplay = useApp((s) => s.edgeDisplay)        // 视觉样式·边线显示（着色 / 着色带边线）
  const setEdgeDisplay = useApp((s) => s.setEdgeDisplay)
  // GM-X2：视图显示设定 selectors
  const visualStyle = useApp((s) => s.visualStyle)        // #1 6 视觉样式枚举
  const setVisualStyle = useApp((s) => s.setVisualStyle)
  // Appearance also lives in the viewport display menu.  This remains
  // reachable when the dense top chrome is collapsed or clipped.
  const viewportBodyColor = useApp((s) => s.bodyColor)
  const setViewportBodyColor = useApp((s) => s.setBodyColor)
  const cameraProj = useApp((s) => s.cameraProj)          // #2 相机三态
  const setCameraProj = useApp((s) => s.setCameraProj)
  const graphicsPreset = useApp((s) => s.graphicsPreset)  // #6 图形预设
  const setGraphicsPreset = useApp((s) => s.setGraphicsPreset)
  const ssaoOn = useApp((s) => s.ssao)                    // #6 效果表
  const gridAdaptive = useApp((s) => s.gridAdaptive)      // #4 网格配置
  const gridSpacing = useApp((s) => s.gridSpacing)
  const gridSubdiv = useApp((s) => s.gridSubdiv)
  const gridRefNumbers = useApp((s) => s.gridRefNumbers)
  const setGridConfig = useApp((s) => s.setGridConfig)
  const objectVis = useApp((s) => s.objectVis)            // #8 对象可见性主开关
  const setObjectVis = useApp((s) => s.setObjectVis)
  const setPrefsOpen = useApp((s) => s.setPrefsOpen)      // #12 应用偏好
  // #14 标准视图按钮复用已存在嘅 setView selector（上面已声明）
  const orbitConstrained = useApp((s) => s.orbitConstrained)   // #10 约束环绕
  const groundPlaneOffset = useApp((s) => s.groundPlaneOffset) // #15 地平面偏移
  const datumCmd = useApp((s) => s.datumCmd)                    // GM-3DV2：统一构造几何命令（Viewport 渲染其对话框，此前缺声明 → ReferenceError）
  const datumPointPick = !!(datumCmd && DATUM_CMD_ACC[datumCmd.type + ':' + datumCmd.method]?.[datumCmd.picks.length] === 'p')
  // 补回此前工作树遗漏嘅 Viewport selector（分割面横幅渲染用；此前只在 KernelBody 声明 → Viewport 渲染 ReferenceError）。
  const splitFaceMode = useApp((s) => s.splitFaceMode)
  const splitFaceAxis = useApp((s) => s.splitFaceAxis)
  const splitFaceType = useApp((s) => s.splitFaceType)
  const [navPop, setNavPop] = useState<'display' | 'grid' | 'views' | 'layout' | 'objvis' | 'selfilter' | null>(null)
  // Bottom HUDs must not compete for one fixed strip.  Keep their familiar
  // docked defaults, but let the user move each panel out of the way.
  // Keep three independent bottom lanes: properties/status above navigation,
  // navigation above the timeline.  Users can still drag any HUD elsewhere.
  const navDrag = useDraggable('webcad-navigation', { left: '50%', bottom: 120, transform: 'translateX(-50%)' })
  const propsDrag = useDraggable('webcad-properties', { left: 12, bottom: 172 })
  const statusDrag = useDraggable('webcad-status', { right: 12, bottom: 172 })
  const [navHudCollapsed, setNavHudCollapsed] = useState(false)
  // Fusion keeps detailed physical properties out of the modelling canvas until the user asks for them.
  // A selected body used to expand this long strip by default and collide visually with the navigation bar
  // and timeline on a normal laptop viewport.  Keep the compact, draggable handle as the default instead.
  const [propsHudCollapsed, setPropsHudCollapsed] = useState(true)
  const [statusHudCollapsed, setStatusHudCollapsed] = useState(false)
  // Fusion viewport-layout selector.  The actual multi-camera render surface is wired separately;
  // keep the chosen layout in this component so navigation controls can share the active mode.
  const [viewLayout, setViewLayout] = useState<'single' | 'split' | 'quad'>('single')
  const [cubeMenu, setCubeMenu] = useState(false)         // #3 ViewCube 右键菜单
  const viewBookmarks = useApp((s) => s.viewBookmarks)   // 相机书签（视图书签 / Named Views）— navbar 📑 popup 用
  const extrudeHeight = useApp((s) => s.extrudeHeight)
  const extrudeStart = useApp((s) => s.extrudeStart)   // #3 Start:Offset（反应式）
  const extrudeSide2 = useApp((s) => s.extrudeSide2)   // #4 Two Sides side2（反应式）
  const setExtrudeHeight = useApp((s) => s.setExtrudeHeight)
  const sketchTwist = useApp((s) => s.sketchTwist)
  const setSketchTwist = useApp((s) => s.setSketchTwist)
  const sketchSymmetric = useApp((s) => s.sketchSymmetric)
  const setSketchSymmetric = useApp((s) => s.setSketchSymmetric)
  const finishSketch = useApp((s) => s.finishSketch)
  const skLookAt = useApp((s) => s.skLookAt)   // GM-FP1 #9：正对草图平面
  const extrudeSketch = useApp((s) => s.extrudeSketch)
  const extrudeDlgOpen = useApp((s) => s.extrudeDlgOpen)
  const openExtrudeDlg = useApp((s) => s.openExtrudeDlg)
  const cancelExtrudeDlg = useApp((s) => s.cancelExtrudeDlg)
  const extrudeDraft = useApp((s) => s.extrudeDraft)
  const setExtrudeDraft = useApp((s) => s.setExtrudeDraft)
  const extrudeDraft2 = useApp((s) => s.extrudeDraft2)   // GM-3DV1 S12 Two Sides 侧2拔模
  const setExtrudeDraft2 = useApp((s) => s.setExtrudeDraft2)
  const symMeasure = useApp((s) => s.symMeasure)         // GM-3DV1 S12 Symmetric whole/half
  const setSymMeasure = useApp((s) => s.setSymMeasure)
  const extrudeExtent = useApp((s) => s.extrudeExtent)
  const extrudeToFaceOffset = useApp((s) => s.extrudeToFaceOffset)   // P2：To Object 偏移字段
  const extrudeRegionSelCount = useApp((s) => s.extrudeRegionSel.filter(Boolean).length)   // P2：区域点选计数（实战 feedback）
  const extrudeRegionTotal = useApp((s) => s.extrudeRegionFaces?.length ?? 0)   // P2v2：区域总数（0 = 点选未活跃）
  const decalArmed = useApp((s) => !!s.decalPick)   // P2 Render：贴花放置 armed
  const lastDecal = useApp((s) => (s.decals.length ? s.decals[s.decals.length - 1] : null))
  const interfPanelOpen = useApp((s) => s.interfPanelOpen)   // P2 Inspect：干涉结果面板
  const buildWarns = useApp((s) => s.lastBuildWarnings)      // P2 audit：重建警告持久 pill（要订阅 — getState() 喺 render 唔会跟变）
  const interfReport = useApp((s) => s.interfReport)
  const interfIncludeCoincident = useApp((s) => s.interfIncludeCoincident)   // GM-X1 #6
  const interfSubset = useApp((s) => s.interfSubset)
  const checkedComps = useApp((s) => s.checkedComps)
  const setExtrudeExtent = useApp((s) => s.setExtrudeExtent)
  const extrudeFlip = useApp((s) => s.extrudeFlip)
  const toggleExtrudeFlip = useApp((s) => s.toggleExtrudeFlip)
  const sweepDlgOpen = useApp((s) => s.sweepDlgOpen)
  const sweepEditId = useApp((s) => s.sweepEditId)
  const openSweepDlg = useApp((s) => s.openSweepDlg)
  const cancelSweepDlg = useApp((s) => s.cancelSweepDlg)
  const sweepDia = useApp((s) => s.sweepDia)
  const sweepWall = useApp((s) => s.sweepWall)
  const setSweepWall = useApp((s) => s.setSweepWall)
  const sweepClimb = useApp((s) => s.sweepClimb)
  const setSweepClimb = useApp((s) => s.setSweepClimb)
  const sweepTwist = useApp((s) => s.sweepTwist)
  const setSweepTwist = useApp((s) => s.setSweepTwist)
  const sweepScale = useApp((s) => s.sweepScale)
  const setSweepScale = useApp((s) => s.setSweepScale)
  const sweepSection = useApp((s) => s.sweepSection)
  const setSweepSection = useApp((s) => s.setSweepSection)
  const sweepOrient = useApp((s) => s.sweepOrient)          // GM-3DV1 S5
  const setSweepOrient = useApp((s) => s.setSweepOrient)
  const sweepAxis = useApp((s) => s.sweepAxis)
  const sweepGuide = useApp((s) => s.sweepGuide)   // P2：对话框内显示导轨 chip（对齐 loft）
  const setSweepAxis = useApp((s) => s.setSweepAxis)
  const sweepAxisLen = useApp((s) => s.sweepAxisLen)
  const setSweepAxisLen = useApp((s) => s.setSweepAxisLen)
  const setSweepDia = useApp((s) => s.setSweepDia)
  const sketchProfiles = useApp((s) => s.sketchProfiles)
  const sketchShape = useApp((s) => s.sketchShape)
  const sketchUndoN = useApp((s) => s.sketchUndo.length)
  const sketchRedoN = useApp((s) => s.sketchRedo.length)
  const sketchTool = useApp((s) => s.sketchTool)
  const setSketchTool = useApp((s) => s.setSketchTool)
  const skView = useApp((s) => s.skView)               // Sketch Palette 显示开关
  const setSkView = useApp((s) => s.setSkView)
  const projPickMode = useApp((s) => s.projPickMode)   // ③ 逐条投影 mode
  const skRefGeo = useApp((s) => s.skRefGeo)           // 有可投影边先显投影掣
  const sketchOp = useApp((s) => s.sketchOp)
  const sketchAsComp = useApp((s) => s.sketchAsComponent)   // #9 New Component（反应式）
  const setSketchOp = useApp((s) => s.setSketchOp)
  const sketchPreview = useApp((s) => s.sketchPreview)
  const requestFit = useApp((s) => s.requestFit)
  const unit = useApp((s) => s.unit)
  const uLen = (mm: number) => (unit === 'cm' ? (mm / 10).toFixed(2) : unit === 'inch' ? (mm / 25.4).toFixed(3) : mm.toFixed(1))
  const uSuf = unit === 'cm' ? 'cm' : unit === 'inch' ? 'in' : 'mm'
  const startSketch = useApp((s) => s.startSketch)
  const runCommand = useApp((s) => s.runCommand)
  const lastCommand = useApp((s) => s.lastCommand)
  const selectedFeature = useApp((s) => s.selectedFeature)
  const removeFeature = useApp((s) => s.removeFeature)
  const selectFeature = useApp((s) => s.selectFeature)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [marq, setMarq] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)   // GM-W5 5.3：框选橡皮筋（wrapper 像素坐标）
  const [lassoPath, setLassoPath] = useState<[number, number][] | null>(null)   // GM-X4 #17：套索自由多边形（wrapper 像素坐标）
  const lassoMode = useApp((s) => s.lassoMode)   // GM-X4 #17：套索模式（select 工具下拖多边形而非矩形）
  const skSeeThru = useApp((s) => s.skSeeThru)   // GM-W6 A1：草图透视开关（草图栏 👓 掣用）
  const skSelN = useApp((s) => s.skSel.length)   // GM-W6 B5：草图选中数（🗑删除掣）
  const polyArcMode = useApp((s) => s.polyArcMode)   // GM-W6 B6：折线相切弧 submode 掣
  const rcDown = useRef<{ x: number; y: number } | null>(null)
  // Esc closes the context menu (capture phase, before App's global Esc handler).
  useEffect(() => {
    if (!ctxMenu) return
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setCtxMenu(null) } }
    window.addEventListener('keydown', onEsc, true)
    return () => window.removeEventListener('keydown', onEsc, true)
  }, [ctxMenu])
  // 按住 Alt → 临时停几何捕捉（画图时精准落点，Fusion 同款）；放开/失焦即恢复。
  useEffect(() => {
    const dn = (e: KeyboardEvent) => { if (e.key === 'Alt') setGeoSnapAlt(true) }
    const up = (e: KeyboardEvent) => { if (e.key === 'Alt') setGeoSnapAlt(false) }
    const blur = () => setGeoSnapAlt(false)
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up); window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); setGeoSnapAlt(false) }
  }, [])
  // The full-screen CSketch editor (z 50) sits below the marking menu (z 61) — close the menu if
  // the user opens 约束草图 while it's up (reachable via the command palette), else it floats on top.
  const csketchOpen = useApp((s) => s.csketchOpen)
  useEffect(() => { if (csketchOpen) setCtxMenu(null) }, [csketchOpen])
  const polyPts = useApp((s) => s.polyPts)
  const closePolyline = useApp((s) => s.closePolyline)
  const setSketchPlane = useApp((s) => s.setSketchPlane)
  const sketchPlane = useApp((s) => s.sketchPlane)
  const setSketchOrient = useApp((s) => s.setSketchOrient)
  const sketchBaseZ = useApp((s) => s.sketchBaseZ)
  const setSketchBaseZ = useApp((s) => s.setSketchBaseZ)
  const sketchArb = useApp((s) => s.sketchArb)   // GM-W6 C1：斜面草图基准（贴任意平面），网格要跟住转
  // GM-W6 C1：网格贴草图面 — 计出 mesh 变换（由 +Y 转到面法向嘅 quaternion + 面上一点）。
  // drei Grid 局部躺喺 XZ 面、法向 +Y；乘 modelMatrix 即贴到目标面。非草图模式返 null → 照旧地面格（y=0），字节一致。
  const skGridXform = useMemo(() => {
    if (mode !== 'sketch') return null
    let n3: [number, number, number], p3: [number, number, number]
    if (sketchArb) { const a = sketchArb as { o: [number, number, number]; n: [number, number, number] }; n3 = [a.n[0], a.n[2], -a.n[1]]; p3 = [a.o[0], a.o[2], -a.o[1]] }   // CAD→three swizzle（同 RegionPickLayer）
    else if (sketchPlane === 'XY') { n3 = [0, 1, 0]; p3 = [0, sketchBaseZ, 0] }
    else if (sketchPlane === 'XZ') { n3 = [0, 0, -1]; p3 = [0, 0, -sketchBaseZ] }   // CAD +Y 法向 → three −Z；面喺 three z = −baseZ
    else { n3 = [1, 0, 0]; p3 = [sketchBaseZ, 0, 0] }   // YZ：CAD +X 法向 → three +X；面喺 three x = baseZ
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...n3).normalize())
    return { quaternion: [q.x, q.y, q.z, q.w] as [number, number, number, number], position: p3 }
  }, [mode, sketchPlane, sketchBaseZ, sketchArb])
  const snapSize = useApp((s) => s.snapSize)
  const setSnapSize = useApp((s) => s.setSnapSize)
  const snapTypes = useApp((s) => s.snapTypes)   // GM-W8 β2-#A2：逐类捕捉开关（端点/中点/圆心/象限/交点/切点）
  const sketchStart = useApp((s) => s.sketchStart)   // GM-W8 β2-#B4：绘制中判定（起点已落）
  const geoSnap = useApp((s) => s.geoSnap)
  const setGeoSnap = useApp((s) => s.setGeoSnap)
  const sketchDim = useApp((s) => s.sketchDim)
  const skCons = useApp((s) => s.skCons)
  const skDof = useApp((s) => s.skDof)
  const skConflict = useApp((s) => s.skConflict)
  const skConflictIds = useApp((s) => s.skConflictIds)   // S194：冲突约束 id 数（状态栏显示 ×N + 红徽章提示）
  const loftSections = useApp((s) => s.loftSections)
  const loftRail = useApp((s) => s.loftRail)   // T772
  const addLoftSection = useApp((s) => s.addLoftSection)
  const commitLoft = useApp((s) => s.commitLoft)
  const loftDlgOpen = useApp((s) => s.loftDlgOpen)
  const loftEditId = useApp((s) => s.loftEditId)
  const loftRuled = useApp((s) => s.loftRuled)
  const loftWall = useApp((s) => s.loftWall)
  const loftClosed = useApp((s) => s.loftClosed)   // #8 Loft Closed（反应式）
  const loftCapPoint = useApp((s) => s.loftCapPoint)   // S 放样封口构造点索引
  const loftCapEnd = useApp((s) => s.loftCapEnd)       // S 放样封口端（first/last）
  const loftContinuity = useApp((s) => s.loftContinuity) // S 放样端条件（''/C1/C2）
  const setLoftOpt = useApp((s) => s.setLoftOpt)
  const openLoftDlg = useApp((s) => s.openLoftDlg)
  const cancelLoftDlg = useApp((s) => s.cancelLoftDlg)
  const commitSweepPath = useApp((s) => s.commitSweepPath)
  const props = useMemo(() => computeProps(bodyMesh), [bodyMesh])
  const density = useApp((s) => s.bodyDensity) // g/cm³ for the mass readout (synced from body material preset)
  // S117：主惯性矩（绕质心主轴 = inertia 张量特征值，与坐标系无关）+ 回转半径 k=√(I/m)。
  // computeProps 只有绕 X/Y/Z 轴对角惯矩；非对称件主轴≠坐标轴，主惯矩先系 Fusion 物理属性嘅标准量。
  const massP = useMemo(() => (bodyMesh && bodyMesh.vertices.length ? computeMassProps(bodyMesh.vertices, bodyMesh.triangles, density) : null), [bodyMesh, density])
  // S121：定向最小包围盒（PCA-OBB）— 旋转件嘅最贴体盒，比轴对齐 AABB 细，做料块/排版/省料估算。
  const obb = useMemo(() => (bodyMesh && bodyMesh.vertices.length ? orientedBBox(bodyMesh.vertices) : null), [bodyMesh])
  const setDensity = useApp((s) => s.setBodyDensity)
  const compXY = useApp((s) => s.compXY)
  const compShrink = useApp((s) => s.compShrink)
  const setCompXY = useApp((s) => s.setCompXY)
  const setCompShrink = useApp((s) => s.setCompShrink)
  const exportBOM = useApp((s) => s.exportBOM)
  const showProps = useApp((s) => s.showProps)
  const showCom = useApp((s) => s.showCom)
  const toggleCom = useApp((s) => s.toggleCom)
  const selComp = components.find((c) => c.id === selectedComponent)
  // 选中组件工具栏折叠（用户：工具栏太长挡视图）。持久化到 localStorage，记住偏好。
  const [compBarMin, setCompBarMin] = useState(() => { try { return localStorage.getItem('webcad-compbar-min') === '1' } catch { return false } })
  const toggleCompBar = () => setCompBarMin((v) => { const n = !v; try { localStorage.setItem('webcad-compbar-min', n ? '1' : '0') } catch { /* ignore */ } return n })
  // GM-W2 2.3：草图底栏「更多▾」收纳弹层开关（把 CAM/导出DXF·激光·CNC·车削 + 参考图 + 网格捕捉步长等罕用控件收埋，对齐 Fusion 精简草图上下文）
  const [skMorePop, setSkMorePop] = useState(false)
  const skMoreRef = useRef<HTMLButtonElement>(null)
  // 弹层用 fixed 定位（草图条 overflow-x:auto 会剪裁 absolute 子元素）→ 开时量度按钮位置，向下弹出并夹住视口
  const [skMorePos, setSkMorePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const toggleSkMore = () => {
    const r = skMoreRef.current?.getBoundingClientRect()
    if (r && !skMorePop) setSkMorePos({ x: Math.max(8, Math.min(r.left, window.innerWidth - 258)), y: r.bottom + 6 })
    setSkMorePop((v) => !v)
  }
  // GM-W8 β2-#B4：触屏精确输入 —— sketch-bar 一个真 <input>，绘制中打尺寸经既有 sketchTypeKey 管线（uncontrolled，commit 时重放）。
  // 另一粒「⏸吸附」toggle 用 setGeoSnapAlt（触屏版按住 Alt）。snapPaused 系本地视觉态（geoSnapAlt 唔喺 store）。
  const skDimInputRef = useRef<HTMLInputElement>(null)
  const [snapPaused, setSnapPaused] = useState(false)
  const commitSkDimInput = () => {
    const el = skDimInputRef.current
    if (!el) return
    const buf = el.value.trim()
    if (buf) {
      const tk = useApp.getState().sketchTypeKey
      tk('Escape')                       // 清残留 dimBuf → 重放确定（Escape 只清缓冲，唔取消绘制）
      for (const ch of buf) tk(ch)       // 逐字送入（sketchTypeKey 只收 0-9/'.'，其余自动忽略）
      tk('Enter')                        // 确定尺寸
    }
    el.value = ''
  }
  // GM-W6 A4：草图工具条可收起 + 可拖移。收起 → 缩成一粒「▤ 草图工具」pill；拖移用 useDraggable（同 AI ✦ / 🩺诊断 钮）。
  const [skBarMin, setSkBarMin] = useState(false)   // 默认展开
  const skBarDrag = useDraggable('webcad-sketch-bar', { right: 0, bottom: 0 })   // anchor 不用（未拖时靠 CSS left:50% 居中）
  // 未拖过 → 回 undefined，保留 CSS 居中（.sketch-bar left:50% + translateX(-50%)）；拖过 → hook 转 left/top（视口坐标），
  // 故切 position:fixed（同 getBoundingClientRect 坐标一致，唔受左侧栏偏移影响）+ 清 transform，精准跟手且持久化。
  const skBarPos: CSSProperties | undefined = skBarDrag.style.left !== undefined
    ? { position: 'fixed', left: skBarDrag.style.left, top: skBarDrag.style.top, right: 'auto', bottom: 'auto', transform: 'none' }
    : undefined
  const fk = useMemo(() => computeFK(components.map((c) => c.id), joints), [components, joints])
  const { groundY, camMaxDist } = useSceneGround()   // #95 接地阴影贴模型底 · #98 大模型取景距离上限动态放宽
  // S123：子装配局部 frame → 组世界矩阵 Map。无任何组带 frame 时返空 Map → 下面 motion 同旧版字节一致。
  const groups = useApp((s) => s.groups)
  const groupFK = useMemo(() => buildGroupFK(groups), [groups])
  const planes = useApp((s) => s.planes)
  // T791：用紧修改/拾取类工具（参数已搬入浮动「工具选项」面板）时，底栏唔再显示 拉伸/DXF/激光/CNC/车削/放样/扫掠/阵列 等无关「完成草图」动作
  const inSkToolMode = sketchTool === 'offset' || sketchTool === 'cfillet' || sketchTool === 'cchamfer' || sketchTool === 'mirror' || sketchTool === 'trim' || sketchTool === 'extend' || sketchTool === 'break' || sketchTool === 'array'
  const sketchOnDatumPlane = useApp((s) => s.sketchOnDatumPlane)
  const sketchOnAngleDatum = useApp((s) => s.sketchOnAngleDatum)   // T763：角度面开草图
  const cpoints = useApp((s) => s.cpoints)
  const caxes = useApp((s) => s.caxes)
  const ccurves = useApp((s) => s.ccurves)   // S168：相交曲线 polylines
  const revAxisPtPick = useApp((s) => s.revAxisPtPick)   // S173：旋转轴拾中心点模式 — 显可点中心球
  const cpatAxisPickA = useApp((s) => s.cpatAxisPick)    // GM-3DV1 S15：拾轴槽 active 高亮（响应式）
  const mirrorFacePickA = useApp((s) => s.mirrorFacePick)   // GM-3DV1 S15：拾镜像面槽 active 高亮（响应式）
  const sweepEdgePickV = useApp((s) => s.sweepEdgePick)      // GM-3DV1 S5：边链高亮 + 对话框 chip
  const sweepEdgeLinesV = useApp((s) => s.sweepEdgeLines)
  const drillCaxis = useApp((s) => s.drillCaxis)   // S 构造点孔钻孔方向（沿构造轴 / 顶面沿Z）
  const explode = useApp((s) => s.explode)
  const xray = useApp((s) => s.xray)
  const toggleXray = useApp((s) => s.toggleXray)
  const setExplode = useApp((s) => s.setExplode)
  const componentCenter = useApp((s) => s.componentCenter)
  const measureMode = useApp((s) => s.measureMode)
  const measurePts = useApp((s) => s.measurePts)
  const measureDist = useApp((s) => s.measureDist)
  const feaModeScene = useApp((s) => s.feaMode)
  const feaFixedPick = useApp((s) => s.feaFixed)
  const feaFixed2Pick = useApp((s) => s.feaFixed2)   // 简支梁第二支撑 marker
  const feaLoadPick = useApp((s) => s.feaLoad)
  const explodeSteps = useApp((s) => s.explodeSteps)   // GM-3DV4 A12：有序爆炸步
  const explodeStepChecked = useApp((s) => s.checkedComps)   // GM-3DV4 A12：勾选组件 → 加爆炸步
  // Exploded view: shift each visible component radially outward from the assembly center.
  //   GM-3DV4 A12：若定义咗有序爆炸步 → 用 explode 滑杆(0..2)当全序进度 t 逐步叠加 offset（引线另画）；
  //   否则回退单一径向散开（旧行为，逐字节）。
  const explodeOff = useMemo(() => {
    const m = new Map<string, [number, number, number]>()
    const vis = components.filter((c) => !c.hidden)
    if (explode <= 0 || vis.length < 2) return m
    if (explodeSteps.length) {
      // explode 滑杆范围 0..2 → 归一 t = explode/2；explodeStepOffsets 逐步覆盖 + 累积
      const steps: ExplodeStepT[] = explodeSteps.map((st) => ({ ids: st.ids, dir: st.dir, dist: st.dist }))
      const off = explodeStepOffsets(steps, explode / 2)
      off.forEach((v, id) => m.set(id, v))
      return m
    }
    const centers = vis.map((c) => componentCenter(c.id))
    const ax = centers.reduce((a, c) => a + c[0], 0) / centers.length
    const ay = centers.reduce((a, c) => a + c[1], 0) / centers.length
    const az = centers.reduce((a, c) => a + c[2], 0) / centers.length
    vis.forEach((c, i) => m.set(c.id, [(centers[i][0] - ax) * explode, (centers[i][1] - ay) * explode, (centers[i][2] - az) * explode]))
    return m
  }, [components, explode, explodeSteps, componentCenter])
  const clip = useMemo(() => {
    if (!section.on) return [] as Plane[]
    if (section.plane) {
      const ref = section.plane
      const len = Math.hypot(ref.normal[0], ref.normal[1], ref.normal[2]) || 1
      const point = new Vector3(ref.origin[0] + ref.normal[0] / len * section.offset, ref.origin[2] + ref.normal[2] / len * section.offset, -(ref.origin[1] + ref.normal[1] / len * section.offset))
      const normal = new Vector3(ref.normal[0] / len, ref.normal[2] / len, -ref.normal[1] / len)
      return [new Plane().setFromNormalAndCoplanarPoint(normal, point)]
    }
    // GM-W8 β2-#33：裁剪平面喺 three-world 空间生效；模型渲染喺 <group rotation=[-90°X]> 内 → CAD(x,y,z)→world(x, z, -y)。
    // offset 系 CAD 轴坐标（同 capped splitBuild 一致）。要「选Y切CAD-Y、选Z切CAD-Z」且同实心剖面一致，法向须按组转重映射：
    //   X→world_x（=CAD x，不变）(-1,0,0)；Y→CAD y=-world_z → (0,0,1)；Z→CAD z=world_y → (0,-1,0)。三者皆保留「CAD轴≤offset」半（同 X 及 capped res.a 一致）。
    // 旧版 Y=(0,-1,0) 实切 CAD z、Z=(0,0,-1) 实切 CAD y（且半反）→ 与实心剖面不符。
    const n = section.axis === 'X' ? [-1, 0, 0] : section.axis === 'Y' ? [0, 0, 1] : [0, -1, 0]
    return [new Plane().setComponents(n[0], n[1], n[2], section.offset)]
  }, [section])
  // GM-W8 β2-#34：剖切滑杆范围由当前模型 bbox 沿所选轴推导（旧版硬编 ±150 → >300mm 或离原点件切唔到）。
  // offset 系 CAD 轴坐标：body 顶点即 CAD 系（v[i]=x,v[i+1]=y,v[i+2]=z）；组件 pos 系 three-world → CAD 偏移 (pos0, -pos2, pos1)。
  // 取所选 CAD 轴的 [min,max]（+10% 裕度），空模型回落 ±150。
  const sectionRange = useMemo(() => {
    if (!section.on) return { min: -150, max: 150 }
    const parts = [
      ...components.filter((c) => !c.hidden).flatMap((c) => visibleDefinitionBodies(c, componentDefs).map((b) => ({ v: b.mesh.vertices, pos: c.pos }))),
      ...(bodyMesh ? [{ v: bodyMesh.vertices, pos: [0, 0, 0] as [number, number, number] }] : []),
    ]
    const ax = section.axis
    const stride = ax === 'X' ? 0 : ax === 'Y' ? 1 : 2
    const ref = section.plane
    const nLen = ref ? Math.hypot(ref.normal[0], ref.normal[1], ref.normal[2]) || 1 : 1
    const n: [number, number, number] = ref ? [ref.normal[0] / nLen, ref.normal[1] / nLen, ref.normal[2] / nLen] : [0, 0, 0]
    let lo = Infinity, hi = -Infinity
    for (const { v, pos } of parts) {
      const o = ax === 'X' ? pos[0] : ax === 'Y' ? -pos[2] : pos[1]   // CAD 轴上嘅组件偏移
      for (let i = 0; i < v.length; i += 3) {
        const c = ref
          ? (v[i] + pos[0] - ref.origin[0]) * n[0] + (v[i + 1] - pos[2] - ref.origin[1]) * n[1] + (v[i + 2] + pos[1] - ref.origin[2]) * n[2]
          : v[i + stride] + o
        if (c < lo) lo = c; if (c > hi) hi = c
      }
    }
    if (!isFinite(lo) || !isFinite(hi) || hi <= lo) return { min: -150, max: 150 }
    const margin = Math.max((hi - lo) * 0.1, 5)
    return { min: Math.floor(lo - margin), max: Math.ceil(hi + margin) }
  }, [section.on, section.axis, section.plane, bodyMesh, components, componentDefs])

  // GM-W5 5.3：框选 marquee（navTool='select'）——window（左→右全包蓝实线）/ crossing（右→左相触绿虚线）。
  // 事件用【capture 相】拦截：净系目标 = canvas 先接管（HTML 面板/按钮唔受影响），拦截后 R3F 点击唔会触发。
  // 投影：comp 局部 bbox 8 角 × compWorldMatrix（= three 世界系，见 L1875 注）× camera.project → 屏幕矩形判定。
  const finishMarquee = (x0: number, y0: number, x1: number, y1: number, w: number, h: number, additive: boolean) => {
    const cam = _vpCam
    if (!cam) return
    const L = Math.min(x0, x1), R = Math.max(x0, x1), T = Math.min(y0, y1), B = Math.max(y0, y1)
    if (R - L < 4 && B - T < 4) { useApp.setState({ status: '框选：拖一个框（左→右全包先中 · 右→左相触即中）' }); return }
    const winMode = x1 >= x0
    const st = useApp.getState()
    // GM-X4 #14/#16：选择过滤器关咗「组件」→ 框选唔抓组件（Fusion 式 filter 门控；默认勾住 = 旧行为逐字节）。
    if (!selPicksComp(st.selFilter)) { useApp.setState({ status: '框选：选择过滤已关闭「组件」类型 — 喺 🎯 面板重新勾选' }); return }
    const fk = computeFK(st.components.map((c) => c.id), st.joints)
    const hits: string[] = []
    const pv = new Vector3()
    for (const c of st.components) {
      if (c.hidden) continue
      const v = c.mesh.vertices
      if (!v.length) continue
      let ax = 1e18, ay = 1e18, az = 1e18, bx = -1e18, by = -1e18, bz = -1e18
      for (let i = 0; i < v.length; i += 3) {
        if (v[i] < ax) ax = v[i]; if (v[i] > bx) bx = v[i]
        if (v[i + 1] < ay) ay = v[i + 1]; if (v[i + 1] > by) by = v[i + 1]
        if (v[i + 2] < az) az = v[i + 2]; if (v[i + 2] > bz) bz = v[i + 2]
      }
      const M = compWorldMatrix(c, fk.get(c.id))
      let smnx = 1e18, smny = 1e18, smxx = -1e18, smxy = -1e18, behind = false
      for (let k = 0; k < 8; k++) {
        pv.set(k & 1 ? bx : ax, k & 2 ? by : ay, k & 4 ? bz : az).applyMatrix4(M)
        // 透视相机后面嘅角投影会镜像跳数 → 成件跳过（正常操作极少出现）
        const camP = cam as unknown as { matrixWorldInverse: Matrix4; isPerspectiveCamera?: boolean }
        if (camP.isPerspectiveCamera && pv.clone().applyMatrix4(camP.matrixWorldInverse).z > -0.5) { behind = true; break }
        pv.project(cam)
        const sx = (pv.x + 1) / 2 * w, sy = (1 - pv.y) / 2 * h
        if (sx < smnx) smnx = sx; if (sx > smxx) smxx = sx
        if (sy < smny) smny = sy; if (sy > smxy) smxy = sy
      }
      if (behind) continue
      const inside = winMode
        ? smnx >= L && smxx <= R && smny >= T && smxy <= B
        : !(smxx < L || smnx > R || smxy < T || smny > B)
      if (inside) hits.push(c.id)
    }
    const next = additive ? [...new Set([...st.checkedComps, ...hits])] : hits
    useApp.setState({ checkedComps: next, status: `框选（${winMode ? '窗选·全包' : '跨选·相触'}${additive ? '·Shift 追加' : ''}）：选中 ${next.length} 个组件 — 浏览树批量栏可 隐藏/配色/导出/删除/建组` })
    if (hits.length === 1 && !additive) st.selectComponent(hits[0])
  }
  // GM-X4 #17：套索命中 —— 投影组件包围盒中心 + 8 角，任一喺自由多边形内即中（crossing 式，宽容）。
  // 复用 finishMarquee 同一投影管线（_vpCam / computeFK / compWorldMatrix），只把矩形判定换成 pointInPolygon。
  const finishLasso = (poly: [number, number][], w: number, h: number, additive: boolean) => {
    const cam = _vpCam
    if (!cam || poly.length < 3) { useApp.setState({ status: '套索：拖一个封闭圈框住组件' }); return }
    const bb = polygonBBox(poly)
    if (!bb || (bb.maxX - bb.minX < 4 && bb.maxY - bb.minY < 4)) { useApp.setState({ status: '套索：圈太小 — 拖大一点' }); return }
    const st = useApp.getState()
    if (!selPicksComp(st.selFilter)) { useApp.setState({ status: '套索：选择过滤已关闭「组件」类型 — 喺 🎯 面板重新勾选' }); return }
    const fk = computeFK(st.components.map((c) => c.id), st.joints)
    const hits: string[] = []
    const pv = new Vector3()
    for (const c of st.components) {
      if (c.hidden) continue
      const v = c.mesh.vertices
      if (!v.length) continue
      let ax = 1e18, ay = 1e18, az = 1e18, bx = -1e18, by = -1e18, bz = -1e18
      for (let i = 0; i < v.length; i += 3) {
        if (v[i] < ax) ax = v[i]; if (v[i] > bx) bx = v[i]
        if (v[i + 1] < ay) ay = v[i + 1]; if (v[i + 1] > by) by = v[i + 1]
        if (v[i + 2] < az) az = v[i + 2]; if (v[i + 2] > bz) bz = v[i + 2]
      }
      const M = compWorldMatrix(c, fk.get(c.id))
      const camP = cam as unknown as { matrixWorldInverse: Matrix4; isPerspectiveCamera?: boolean }
      let behind = false, hit = false
      // 中心 + 8 角逐个投影，任一喺多边形内即中。
      const probes: [number, number, number][] = [[(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2]]
      for (let k = 0; k < 8; k++) probes.push([k & 1 ? bx : ax, k & 2 ? by : ay, k & 4 ? bz : az])
      for (const p of probes) {
        pv.set(p[0], p[1], p[2]).applyMatrix4(M)
        if (camP.isPerspectiveCamera && pv.clone().applyMatrix4(camP.matrixWorldInverse).z > -0.5) { behind = true; break }
        pv.project(cam)
        const sx = (pv.x + 1) / 2 * w, sy = (1 - pv.y) / 2 * h
        if (pointInPolygon(sx, sy, poly)) { hit = true; break }
      }
      if (!behind && hit) hits.push(c.id)
    }
    const next = additive ? [...new Set([...st.checkedComps, ...hits])] : hits
    useApp.setState({ checkedComps: next, status: `套索：选中 ${next.length} 个组件${additive ? '（Shift 追加）' : ''} — 浏览树批量栏可 隐藏/配色/导出/删除/建组` })
    if (hits.length === 1 && !additive) st.selectComponent(hits[0])
  }
  return (
    <div
      className={`viewport vp-layout-${viewLayout}`}
      onPointerDownCapture={(e) => {
        // GM-W5 5.3：select 工具 + 左键 + 目标系 canvas 先接管（HTML 覆盖层照常运作）
        if (navTool !== 'select' || mode === 'sketch' || e.button !== 0 || !(e.target instanceof HTMLCanvasElement)) return
        e.stopPropagation()
        const rc = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const sx = e.clientX - rc.left, sy = e.clientY - rc.top
        if (lassoMode) {
          // GM-X4 #17：套索 —— 采样鼠标轨迹为多边形，松手做 pointInPolygon 命中。
          const pts: [number, number][] = [[sx, sy]]
          setLassoPath(pts)
          const onMove = (ev: PointerEvent) => { const p: [number, number] = [ev.clientX - rc.left, ev.clientY - rc.top]; const last = pts[pts.length - 1]; if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 3) { pts.push(p); setLassoPath([...pts]) } }
          const onUp = (ev: PointerEvent) => {
            window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp)
            setLassoPath(null)
            finishLasso(pts, rc.width, rc.height, ev.shiftKey)
          }
          window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
          return
        }
        setMarq({ x0: sx, y0: sy, x1: sx, y1: sy })
        const onMove = (ev: PointerEvent) => setMarq({ x0: sx, y0: sy, x1: ev.clientX - rc.left, y1: ev.clientY - rc.top })
        const onUp = (ev: PointerEvent) => {
          window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp)
          setMarq(null)
          finishMarquee(sx, sy, ev.clientX - rc.left, ev.clientY - rc.top, rc.width, rc.height, ev.shiftKey)
        }
        window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
      }}
      onPointerDown={(e) => {
        // clicking the canvas blurs any focused input — otherwise single-letter shortcuts (D/E/F/...)
        // stay dead after typing in a field (the global keydown handler ignores INPUT targets)
        const ae = document.activeElement as HTMLElement | null
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA') && !(e.target as HTMLElement).closest?.('input,select,textarea')) ae.blur()
        if (e.button === 2) rcDown.current = { x: e.clientX, y: e.clientY }
      }}
      onContextMenu={(e) => {
        e.preventDefault()  // never show the browser's native menu in the viewport
        const d = rcDown.current; rcDown.current = null
        const moved = d ? Math.hypot(e.clientX - d.x, e.clientY - d.y) : 99
        if (moved < 6) setCtxMenu({ x: e.clientX, y: e.clientY })  // right-click (not right-drag-pan) → our menu
      }}
    >
      <Canvas
        style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
        gl={(glp: unknown) => {
          // gl FACTORY (vs gl-props object) so preserveDrawingBuffer:true actually reaches context creation —
          // canvas.toDataURL then reads the retained frame. Defensive about R3F's factory arg shape
          // (some versions pass the canvas, some pass default WebGLRenderer params).
          const isCanvas = typeof HTMLCanvasElement !== 'undefined' && glp instanceof HTMLCanvasElement
          const base = isCanvas ? { canvas: glp as HTMLCanvasElement } : (glp as object)
          const r = new WebGLRenderer({ ...base, alpha: true, antialias: true, preserveDrawingBuffer: true })
          r.localClippingEnabled = true
          return r
        }}
        camera={{ position: [240, 190, 270], fov: 28, near: 0.5, far: 100000 }}
        onPointerMissed={(e) => { if (e.button === 0 && useApp.getState().selectedComponent) selectComponent(null) }}
      >
        {/* S193：正交相机（makeDefault 覆写默认透视）— 开时由 OrbitControls 驱动；FitView/ViewRig 用 camera.zoom 取景。
            near 负值令物体喺相机后面都唔裁切（正交无远近）。关时此元件卸载 → 回退 Canvas 默认透视相机。 */}
        {cameraOrtho && <OrthographicCamera makeDefault position={[240, 190, 270]} near={-100000} far={200000} zoom={4} />}
        <MarqueeCamBridge />{/* GM-W5 5.3：交当前相机俾框选投影 */}
        {/* Multi-light studio setup for nice metal highlights (no env map → keeps capture/perf solid). */}
        <ambientLight intensity={0.8} />
        <hemisphereLight args={['#ffffff', '#9aa4ad', 0.55]} />
        <directionalLight position={[120, 200, 140]} intensity={0.7} />
        <directionalLight position={[-150, 90, -60]} intensity={0.45} color="#cfe0f0" />
        <directionalLight position={[40, 60, -180]} intensity={0.35} color="#fff2dd" />

        {components.filter((c) => !c.hidden).map((c) => {
          const o = explodeOff.get(c.id)   // #73：唔再烘入 pos —— 改经 explodeOffset 当世界平移叠喺 motion(FK) 之后（见 KernelBody return）
          // S123：子装配 frame 喺最外层左乘 fk（groupMat · fk）→ 组件随组整体移动/旋转。无 frame 时 = fk 不变（字节一致）。
          const gm = c.groupId ? groupFK.get(c.groupId) : undefined
          const fm = fk.get(c.id)
          const motion = gm ? (fm ? gm.clone().multiply(fm) : gm) : fm
          // T734 edit-in-context: while editing a component, DIM + LOCK the siblings (Fusion-style focus).
          // editingComp uniquely identifies the edit target (no new store field). When editingComp is null both
          // expressions collapse to today's exact values → byte-identical for single-body / assembly-non-edit views.
          const isEditing = !!editingComp
          const dimmed = isEditing && c.id !== editingComp
          const compOpacity = dimmed ? 0.25 : ((c as { opacity?: number }).opacity ?? 1)
          const pickable = (isEditing ? (!dimmed && selPicksComp(selFilter)) : selPicksComp(selFilter)) && mode !== 'sketch'   // GM-X4：selFilter.types 含 component 先可拣（默认全类型 = 旧 'all' 逐字节）；画草图时组件唔接 raycast
          const def = c.defId ? componentDefs.find((d) => d.id === c.defId) : undefined
          const bodies = def?.bodies?.length ? def.bodies : [{ id: c.id + '_B1', name: c.name, mesh: c.mesh }]
          const pivot = meshCenter3(c.mesh)
          return <Fragment key={c.id}>{bodies.filter((b) => !b.hidden).map((b) => <KernelBody key={b.id} mesh={b.mesh} frozen compId={c.id} pos={c.pos} explodeOffset={o} rot={c.rot} rotationCenter={pivot} selected={c.id === selectedComponent} motion={motion} clip={clip} compColor={b.color || c.color} compOpacity={compOpacity} pickable={pickable || c.id === moldTargetCompId} moldTarget={c.id === moldTargetCompId} onSelect={() => selectComponent(c.id === selectedComponent ? null : c.id)} onFocus={() => { const cc = useApp.getState().components.find((x) => x.id === c.id); if (cc?.src?.features?.length) { void useApp.getState().editComponent(c.id) } else { selectComponent(c.id); requestFit(c.id) } }} onFaceMatePick={(face) => { const st = useApp.getState(); if (st.jointHolePick) st.applyJointHolePick(c.id, face); else if (st.screwFitMode) void st.fitScrewToHole(c.id, face); else if (st.jointPickMode) st.pickFaceForJoint(c.id, face); else st.pickFaceForMate(c.id, face) }} onPointMatePick={(point) => useApp.getState().pickPointForMate(c.id, point)} />)}</Fragment>
        })}
        {bodyMesh && bodyMesh.triangles.length > 0
          ? (section.on && section.capped && sectionMesh
            ? <KernelBody mesh={sectionMesh} pickable={selPicksBody(selFilter) && mode !== 'sketch'} />  /* capped section: a real solid half (filled cut face), no clip plane */
            : <KernelBody mesh={edgeRoundPick && roundPreviewMesh ? roundPreviewMesh : bodyMesh} clip={clip} pickable={selPicksBody(selFilter) && mode !== 'sketch'} />)   /* GM-X4：selFilter.types 含 body/face/edge 先可拣（默认全类型 = 旧 'body!=comp' 逐字节）；画草图时实体唔接 raycast */
          : (mode === 'model' && components.length === 0 && !(bodyMesh?.parked?.length) ? <PlaceholderBody /> : null)}
        {/* 多实体（T728）：泊车实体灰显（唔可交互 — 圆角/草图/量度作用喺活动实体；要操作佢请用「实体布尔」合并返）。
            S133：编辑曲面控制点模式下变可拾（点选目标曲面）。 */}
        {bodyMesh?.parked?.map((b, i) => <ParkedBody key={'pk' + i} mesh={b} index={i} pickable={editPolesMode || quiltPickMode} picked={(editPolesMode && editPolesTarget === i) || quiltPickMode} onPick={(idx, face) => {
          if (quiltPickMode) void useApp.getState().thickenParkedAt(idx)
          else void useApp.getState().pickParkedForPoles(idx, face)
        }} />)}
        {/* S133：NURBS 曲面极点编辑器 — 拣中曲面后显示控制点球 + 拖极点变形（clone FormCage 嘅 axis-swap） */}
        {editPolesMode && <PoleNet />}
        <OverhangView />
        <WallThinView />
        <FaceHoverView />
        <CutFaceOverlay />{/* S186：实心剖面切面上色（暖色填充+轮廓，Fusion section-view 观感） */}
        <PaintedFacesView />{/* S102[3]：逐面外观 — 已涂色 B-rep 面叠真材质覆盖层 */}
        <DraftOverlay />{/* S118：拔模分析 — 逐面按拔模角分类着色 */}
        <SlopeOverlay />{/* S187：斜度分析 — 逐面按相对参考平面倾角分类着色 */}
        <AccessOverlay />{/* #174-7：脱模可达性 — 逐三角射线遮挡着色（红=倒扣/绿=可脱） */}
        <MeasureSnapMarkers />{/* #174-6：测量捕捉点标记（特征边端点/中点） */}
        {needsCurvatureAnalysis && <Suspense fallback={null}><CurvatureAnalysisOverlays /></Suspense>}
        <ComponentGizmo />

        {/* S102[5]：关节 DOF/限位 3D 操纵器 — 旋转扇形(aMin→aMax)+clamp 指针 / 滑动限位段+位珠+双向箭头（取代旧虚线轴） */}
        {mode === 'model' && objectVis.joints && joints.map((j) => <JointGizmo key={'jg' + j.id} j={j} />)}{/* GM-X2 #8：关节主开关 */}
        {/* GM-3DV4 A1：可复用关节原点标记（青绿十字准星 + 轴向短箭） */}
        {mode === 'model' && jointOrigins.map((jo) => <JointOriginView key={'jo' + jo.id} jo={jo} />)}
        {/* GM-3DV4 A12：有序爆炸引线（各件由原位到爆炸位嘅虚拟连线） */}
        {mode === 'model' && explodeLeaders && explode > 0 && Array.from(explodeOff.entries()).map(([id, off]) => {
          const c = componentCenter(id)   // 静止中心（explode 由 group position 叠加，唔入 componentCenter）
          const to: [number, number, number] = [c[0] + off[0], c[1] + off[1], c[2] + off[2]]
          return (Math.hypot(off[0], off[1], off[2]) > 0.5) ? <Line key={'el' + id} points={[[c[0], c[1], c[2]], to]} color="#8a939c" lineWidth={1} dashed dashSize={2} gapSize={2} depthTest={false} renderOrder={996} /> : null
        })}

        {/* two-point measure markers + connector */}
        {measurePts.map((p, i) => (
          <mesh key={'mp' + i} position={p} renderOrder={999}>
            <sphereGeometry args={[1.8, 16, 16]} />
            <meshBasicMaterial color="#ff3b30" depthTest={false} />
          </mesh>
        ))}
        {measurePts.length === 2 && <Line points={measurePts} color="#ff3b30" lineWidth={2.5} dashed dashSize={4} gapSize={2} depthTest={false} renderOrder={999} />}

        {/* fillet/chamfer command: highlight the picked edges — P2 audit：解析到就成条棱高亮（Fusion 式），解析中先显示橙点 */}
        {edgeRoundPick && edgeRoundPicks.map((p, i) => !edgeRoundPickLines[i] && (
          <mesh key={'er' + i} position={p} renderOrder={999}>
            <sphereGeometry args={[2.2, 16, 16]} />
            <meshBasicMaterial color="#ff8c00" depthTest={false} />
          </mesh>
        ))}
        {edgeRoundPick && edgeRoundPickLines.some(Boolean) && (
          <group rotation={[-Math.PI / 2, 0, 0]}>
            {edgeRoundPickLines.map((ln, i) => ln && (
              <Line key={'erl' + i} points={ln} color="#ff8c00" lineWidth={3.5} depthTest={false} renderOrder={999} />
            ))}
          </group>
        )}
        {/* GM-3DV1 S5：扫掠边链高亮（青色，同圆角橙区分）— 逐条已拾嘅实体边（CAD 多段线，group 转 three） */}
        {(sweepEdgePickV || sweepEdgeLinesV.length > 0) && sweepEdgeLinesV.some(Boolean) && (
          <group rotation={[-Math.PI / 2, 0, 0]}>
            {sweepEdgeLinesV.map((ln, i) => ln && (
              <Line key={'swl' + i} points={ln} color="#12b5c9" lineWidth={3.5} depthTest={false} renderOrder={999} />
            ))}
          </group>
        )}
        <RoundSizeHandle />
        <PushPullArrow />
        {/* boundary-patch command: highlight the picked boundary edges (橙点，行 edgeRoundPicks) */}
        {surfBridgePickM && surfBridgePicks.map((p, i) => (
          <mesh key={'sb' + i} position={p} renderOrder={999}>
            <sphereGeometry args={[2.2, 16, 16]} />
            <meshBasicMaterial color="#12a5b8" depthTest={false} />
          </mesh>
        ))}
        {boundaryPatchPick && boundaryPatchPicks.map((p, i) => (
          <mesh key={'bp' + i} position={p} renderOrder={999}>
            <sphereGeometry args={[2.2, 16, 16]} />
            <meshBasicMaterial color="#ff8c00" depthTest={false} />
          </mesh>
        ))}
        {/* shell command: mark the picked open-faces (GM-W8 A1.2 诚实版：红点标「会被开口/移走」；无面三角存底 → 只标点，非真空腔预览) */}
        {shellMode && shellPicks.map((p, i) => (
          <mesh key={'sh' + i} position={p} renderOrder={999}>
            <sphereGeometry args={[2.8, 16, 16]} />
            <meshBasicMaterial color="#ff5a4d" depthTest={false} transparent opacity={0.85} />
          </mesh>
        ))}
        {/* R1 面圆角：标两张所选面（青点，行 shell markers） */}
        {faceFilletMode && faceFilletPicks.map((p, i) => (
          <mesh key={'ff' + i} position={p} renderOrder={999}>
            <sphereGeometry args={[2.8, 16, 16]} />
            <meshBasicMaterial color="#37c8c0" depthTest={false} transparent opacity={0.9} />
          </mesh>
        ))}
        {/* GM-W8 A1.1 孔：拾中孔心 → 红色切除圆柱鬼影（Ø×深，沿面法向；沉头/埋头叠加），取代旧紫球 */}
        <HolePreview />
        {/* GM-W8 A1.5 拔模（诚实版）：标中性面①（紫）+ 侧面集②（橙）拾取点；真锥形鬼影太重 → 靠 hover 面高亮 + 对话框角度 label 補足（见汇报） */}
        {!!draftPickMode && draftNeutral && (
          <mesh position={[draftNeutral.o[0], draftNeutral.o[2], -draftNeutral.o[1]]} renderOrder={999}>
            <sphereGeometry args={[3, 16, 16]} />
            <meshBasicMaterial color="#b14fd8" depthTest={false} transparent opacity={0.9} />
          </mesh>
        )}
        {!!draftPickMode && draftSides.map((p, i) => (
          <mesh key={'dft' + i} position={[p[0], p[2], -p[1]]} renderOrder={999}>
            <sphereGeometry args={[2.6, 16, 16]} />
            <meshBasicMaterial color="#ff8c00" depthTest={false} transparent opacity={0.85} />
          </mesh>
        ))}
        {/* FEA 受力云图：固定面(蓝🔒)/受力面(橙⬇)拾取标记（CAD→three: [x,z,-y]）+ 体素云图 */}
        {feaModeScene > 0 && feaFixedPick && (
          <mesh position={[feaFixedPick.point[0], feaFixedPick.point[2], -feaFixedPick.point[1]]} renderOrder={999}>
            <sphereGeometry args={[2.6, 16, 16]} />
            <meshBasicMaterial color="#1572c4" depthTest={false} />
          </mesh>
        )}
        {feaModeScene > 0 && feaFixed2Pick && (
          <mesh position={[feaFixed2Pick.point[0], feaFixed2Pick.point[2], -feaFixed2Pick.point[1]]} renderOrder={999}>
            <sphereGeometry args={[2.6, 16, 16]} />
            <meshBasicMaterial color="#1572c4" depthTest={false} />
          </mesh>
        )}
        {feaModeScene > 0 && feaLoadPick && (
          <mesh position={[feaLoadPick.point[0], feaLoadPick.point[2], -feaLoadPick.point[1]]} renderOrder={999}>
            <sphereGeometry args={[2.6, 16, 16]} />
            <meshBasicMaterial color="#ff8c00" depthTest={false} />
          </mesh>
        )}
        <FeaForceArrow />
        <FeaOverlay />
        <MoldOverlay />
        <MoldFlowArrows />{/* S190：模流流向线/箭头（∇fill），令 flow line 睇得到 */}
        <WindOverlay />{/* 风洞表面 Cp/流速着色 */}
        <WindFlowArrows />{/* 风洞流场：流线 / 箭头（旧模式，保留） */}
        <WindSmoke />{/* S2 · P0：GPU 烟流雾粒（windViz==='smoke'） */}
        <WindStreaks />{/* S3：烟耙条带流线（windViz==='rake' — 螢幕空間 quad 缎带 + 体积 shading） */}
        {/* S4：GPU LBM 引擎 driver（永远 return null，纯 useFrame）+ 可拖拽位姿操纵杆。
         *   ★ lazy ★ WindTunnelGpu 拉住 shaders.ts（54KB GLSL 生成器）+ lbmGpu + voxelfea，唔好入初始 bundle。
         *   条件写「engine 係 gpu 或者面板开住」係为咗净开面板都攞到 DEV 探针（window.__lbmGpu）。
         *   ★ 两个都唔可以包落 <group rotation={[-Math.PI/2,0,0]}> ★ —— 佢哋自己内部做 CAD↔three 共轭。*/}
        {(windEngineP === 'gpu' || windModeP > 0) && (
          <Suspense fallback={null}><WindTunnelGpuLazy /></Suspense>
        )}
        {windEngineP === 'gpu' && windModeP > 0 && (
          <Suspense fallback={null}><WindObjectGizmoLazy /></Suspense>
        )}
        <ModalOverlay />
        <BucklingOverlay />
        <TopoptOverlay />
        <ThermalOverlay />
        <MoldGateMarkers />
        <InterfBoxes />
        <InterfMeshes />
        <CompMeasureSeg />{/* S124：两件净空最近点连线 */}
        <EnvLight />
        {/* S 工作模式接地阴影：复用 EnvLight 内（:950）同款 ContactShadows 参数，但喺 always-on 场景图。
            gate 于 groundShadow && !renderModeOn：渲染模式下 EnvLight 已画一张接地阴影 → 此处不画，避免双重叠加。 */}
        {groundShadow && !renderModeOn && <ContactShadows position={[0, groundY - 0.04 + groundPlaneOffset, 0]} scale={400} far={120} blur={2.4} opacity={groundShadowOpacity} resolution={1024} frames={1} color="#000000" />}{/* GM-X2 #15：地平面偏移移接地阴影 Y */}
        <GroundReflection />{/* S188：地面反射（drei MeshReflectorMaterial，会话级 toggle，两模式可用） */}
        {bgPreset !== '' && !(renderModeOn && hdriPreset !== '') && <BgPreset preset={bgPreset} />}{/* 工作模式背景预设：设 scene.background 渐变/纯色；render-mode + HDRI 接管背景时让位（避免互相覆写） */}
        {renderModeOn && hdriPreset !== '' && <HdriEnvironment preset={hdriPreset as HdriPresetId} background intensity={hdriIntensity} rotationY={hdriRotation} />}{/* S109：HDRI 环境（接管 scene.environment，挂喺 EnvLight 后 → 退出还原 RoomEnv；光追亦共用呢张 equirect） */}
        <PathTraceLayer />{/* S105：画布内路径追踪（rtMode 时接管渲染，渐进累积 GI/折射） */}
        <Recorder />
        <StillExporter />
        <FovRig />
        <ImageTexCachePruner />
        {ssao && !cameraOrtho && <AOEffect />}
        <FormCage />
        <FormBoxTool />

        <axesHelper args={[90]} />

        {objectVis.planes && planes.map((pl, i) => {   /* GM-X2 #8：原点/构造面主开关 */
          if (datumHidden.includes(datumVisKey('pl', pl))) return null   // S 浏览器树眼掣隐藏
          const o = pl.offset
          const pickable = mode === 'pickplane'
          // T763 角度面：用预算好嘅 arb 基（CAD）→ three 基（CAD(x,y,z)→three(x,z,−y)）做 quaternion
          if (pl.arb) {
            const a = pl.arb
            const t = (v: [number, number, number]) => new Vector3(v[0], v[2], -v[1])
            const X = t(a.xd), N = t(a.n), Y = N.clone().cross(X)
            const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(X, Y, N))
            const o3 = t(a.o)
            // GM-W7 7.1：改用 PickPlaneQuad（自管 hover 高亮）——拾面模式 mouse over 即整块变蓝亮，非拾面态外观不变。
            return <PickPlaneQuad key={'pl' + i} pos={[o3.x, o3.y, o3.z]} quaternion={q} baseColor="#9b59d6" pickable={pickable} onPick={() => sketchOnAngleDatum(a, i, pl.base)} />   /* GM-3DV2 R12：传 datum 索引 → 草图跟 datum 郁 */
          }
          // CAD→three: XY plane (normal CAD+Z=three+y) horizontal @three-y=o; XZ (normal CAD±Y=three∓z) @three-z=-o; YZ (normal CAD±X=three±x) @three-x=o
          const pos: [number, number, number] = pl.base === 'XY' ? [0, o, 0] : pl.base === 'XZ' ? [0, 0, -o] : [o, 0, 0]
          const rot: [number, number, number] = pl.base === 'XY' ? [-Math.PI / 2, 0, 0] : pl.base === 'YZ' ? [0, Math.PI / 2, 0] : [0, 0, 0]
          // GM-W7 7.1：同上，PickPlaneQuad 提供 hover 高亮
          return <PickPlaneQuad key={'pl' + i} pos={pos} rotation={rot} baseColor="#3b82d6" pickable={pickable} onPick={() => sketchOnDatumPlane(pl.base, o)} />
        })}

        {/* construction points (datums) */}
        {objectVis.planes && cpoints.map((p, i) => datumHidden.includes(datumVisKey('pt', p)) ? null : (   /* GM-X2 #8：构造点随原点/构造面主开关 */
          <mesh key={'cpt' + i} position={[p[0], p[2], -p[1]]} renderOrder={998}
            onPointerOver={datumPointPick ? (e) => { e.stopPropagation(); document.body.style.cursor = 'crosshair' } : undefined}
            onPointerOut={datumPointPick ? () => { document.body.style.cursor = '' } : undefined}
            onClick={datumPointPick ? (e) => { e.stopPropagation(); void useApp.getState().datumCmdClickAt(null, [p[0], p[2], -p[1]], 'constructPoint') } : undefined}>
            <sphereGeometry args={[datumPointPick ? 3.6 : 2.6, 16, 16]} />
            <meshBasicMaterial color={datumPointPick ? '#1572c4' : '#e0a81e'} depthTest={false} />
          </mesh>
        ))}
        {/* S173：旋转轴拾中心点 — 武装时喺所有候选中心（构造点 + 构造轴原点 + 世界原点）放可点蓝球，
            点中即把【该中心精确坐标】填入旋转轴点（唔系点击位置 → 解决「点范围内取咗 raw 而非中心」）。 */}
        {revAxisPtPick && featDlg?.kind === 'revolve' && (() => {   // S173 audit：双门控 — 旋转对话框关咗/切走即唔渲染（防 toggle/openFeatDlg 漏清 flag 留下幽灵球）
          const seen = new Set<string>()
          const cands: [number, number, number][] = []
          const add = (c: [number, number, number]) => { const k = c.map((v) => Math.round(v * 100)).join(','); if (!seen.has(k)) { seen.add(k); cands.push(c) } }
          add([0, 0, 0]); for (const p of cpoints) add([p[0], p[1], p[2]]); for (const a of caxes) add([a.at[0], a.at[1], a.at[2]])
          return cands.map((c, i) => (
            <mesh key={'rax' + i} position={[c[0], c[2], -c[1]]} renderOrder={1000}
              onClick={(e) => { e.stopPropagation(); useApp.getState().applyRevAxisPtPick([c[0], c[1], c[2]]) }}
              onPointerOver={(e) => { e.stopPropagation(); const cv = document.querySelector('canvas'); if (cv) cv.style.cursor = 'pointer' }}>
              <sphereGeometry args={[4, 18, 18]} />
              <meshBasicMaterial color="#1572c4" depthTest={false} transparent opacity={0.85} />
            </mesh>
          ))
        })()}
        {/* construction axes (datum lines through a point along X/Y/Z) */}
        {objectVis.axes && caxes.map((ax, i) => {   /* GM-X2 #8：构造轴主开关 */
          if (datumHidden.includes(datumVisKey('ax', ax))) return null   // S 浏览器树眼掣隐藏
          const c: [number, number, number] = [ax.at[0], ax.at[2], -ax.at[1]]
          // T778：dirV = 任意方向轴（CAD→three swizzle）；冇就照字母
          const d: [number, number, number] = ax.dirV ? [ax.dirV[0], ax.dirV[2], -ax.dirV[1]] : ax.dir === 'X' ? [1, 0, 0] : ax.dir === 'Y' ? [0, 0, -1] : [0, 1, 0]
          const L = 200
          const pts: [number, number, number][] = [[c[0] - d[0] * L, c[1] - d[1] * L, c[2] - d[2] * L], [c[0] + d[0] * L, c[1] + d[1] * L, c[2] + d[2] * L]]
          return <Line key={'cax' + i} points={pts} color="#e0a81e" lineWidth={1.6} dashed dashSize={6} gapSize={3} />
        })}
        {/* S168：相交曲线（Intersection Curve）— 每条 polyline CAD→three swizzle，实线青色（同构造黄区分） */}
        {ccurves.map((poly, i) => (
          poly.length >= 2 ? <Line key={'cc' + i} points={poly.map((p) => [p[0], p[2], -p[1]] as [number, number, number])} color="#1ec8c8" lineWidth={2.2} renderOrder={997} /> : null
        ))}

        {mode === 'pickplane' && <SketchPlanePicker />}

        {/* GM-X2 #4：可配置网格（Adaptive/Fixed + 主间距 + 次分格 + 参考数字） */}
        <ConfigGrid show={mode === 'sketch' ? skGrid : showGrid} xform={skGridXform} />

        <SketchSurface />
        <SketchDraw />
        <CanvasImageLayer />
        <SkSelDraw />
        <MirrorPickDraw />
        <MarqueeDraw />{/* GM-FP3 #44：草图框选橡皮筋 */}
        <MoveGizmoDraw />{/* GM-FP3 #39：Move gizmo */}
        <ArrayPreview />
        <ToolHoverPreview />
        <SizingHandle />
        <CommittedSketches />
        <ExtrudePreview />
        <RevolvePreview />
        {/* GM-W8 A1：补齐无实体预览嘅命令鬼影 */}
        <FaceOffsetGhost />{/* A1.3 加厚 + A1.4 按拉 hover 面偏移板体 */}
        <MoveScaleGhost />{/* A1.6 移动/缩放 bodyMesh 变换鬼影 */}
        <MoveBodyGizmo />{/* Fusion Move/Copy: live numeric triad for solid bodies */}
        <CoilPreview />{/* A1.7 螺旋管鬼影 */}
        <SweepPreview />{/* A1.7 扫掠/管沿路径管鬼影 */}
        <RegionPickLayer />
        <DecalOverlay />
        <CosmeticThreadOverlay />
        <ExtrudeArrow />
        <RevolveAngleHandle />{/* GM-3DV1 S16：revolve 角度画布拖拽手柄（泛化自 ExtrudeArrow） */}
        <LoftPreview />
        <PatternPreview />
        <FourBarView />
        <SliderCrankView />
        <SixBarView />
        <MotionTraceView />
        <MotionEnvelopeView />
        <CoMMarker />
        <SketchDimProjector />
        <CameraRig />
        <FormBoxCameraRig />
        <FitView />
        <ViewRig />
        <BookmarkRig />

        <OrbitControls
          makeDefault
          target={[0, 20, 0]}
          enableDamping
          dampingFactor={0.08}
          zoomToCursor
          zoomSpeed={0.6}
          minDistance={ZOOM_MIND}
          maxDistance={camMaxDist /* GM-L2 #98：大模型（对角线大）时按 bbox 放宽距离上限，令 FitView/标准视图取景距离唔被夹回 30000；细模型维持 30000 */}
          enableRotate={navTool === 'orbit' /* GM-FP1 #8：草图内亦准 orbit/ViewCube 倾斜睇（Fusion 式，唔退草图）。绘制手势 pointerdown 会冻结 controls → 左拖画图唔受影响；入草图 auto-ortho 订阅照旧维持正投影 */}
          mouseButtons={{ LEFT: navTool === 'pan' ? MOUSE.PAN : navTool === 'zoom' ? MOUSE.DOLLY : MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN }}
          /* T798 触屏/平板：单指旋转(草图模式单指平移免误转)、双指捏合缩放+平移 */
          touches={{ ONE: mode === 'sketch' ? TOUCH.PAN : TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
          /* GM-X2 #10：约束环绕（Constrained Orbit）—— 锁世界上向、钳极角防翻转过极（Fusion Constrained）。关掉=可越极。 */
          minPolarAngle={orbitConstrained ? 0.02 : 0}
          maxPolarAngle={orbitConstrained ? Math.PI - 0.02 : Math.PI}
          /* GM-X2 #2：用户手动 orbit → perspOrtho 退返透视（转动即透视，对齐 Fusion）。 */
          onStart={() => useApp.getState().notePerspOrthoOrbit()}
        />
        <WheelZoom maxDistance={camMaxDist} />

        <GizmoHelper alignment="top-right" margin={[78, 92]}>
          <GizmoViewcube color="#e3e9ef" textColor="#33404d" strokeColor="#8c99a6" hoverColor="#cdeafb" />
        </GizmoHelper>
      </Canvas>

      <SketchDimLayer />

      {ctxMenu && (() => {
        // Fusion-style radial marking menu: fixed 8 sectors (N=repeat last · NE/E/SE/S/SW/W/NW per mode)
        // + remaining commands in the overflow list below. Sector order: N NE E SE S SW W NW.
        const repeat: MMItem = {
          key: 'repeat', glyph: '↻', label: lastCommand ? `重复·${lastCommand.label}` : '重复上次',
          disabled: !lastCommand, fn: () => { const lc = lastCommand; if (lc) runCommand(lc.id, lc.label) },
        }
        let sectors: (MMItem | null)[]
        let overflow: (MMItem | 'sep')[]
        if (mode === 'sketch' && skSelN > 0) {
          // GM-FP3 #48（Fusion 三情境之二）：选中【实体/多选】→ 实体动作放扇区 + 溢出（尺寸标签右键=情境三，喺 SketchDimLayer）。
          sectors = [
            repeat,
            { key: 'del', glyph: '🗑', label: '删除', fn: () => useApp.getState().skDeleteSel() },
            { key: 'skdim', glyph: '⟷', label: '尺寸 (D)', fn: () => setSketchTool('dimension') },
            { key: 'construction', glyph: '⋯', label: '构造/实线 (X)', fn: () => useApp.getState().toggleConstruction() },
            { key: 'move', glyph: '✥', label: '移动/复制', fn: () => useApp.getState().startSkMove() },
            { key: 'extrude', glyph: '⬆', label: '拉伸…', disabled: !(sketchShape || sketchProfiles.length > 0), fn: () => openExtrudeDlg() },
            { key: 'undo', glyph: '↶', label: '撤销', fn: () => void useApp.getState().undo() },
            { key: 'esc', glyph: '✕', label: '清选择', fn: () => { useApp.getState().escSketch() } },
          ]
          overflow = [
            { key: 'mirror', label: '◑ 镜像', fn: () => useApp.getState().runCommand('sk_mirrory', '镜像') },
            { key: 'offset', label: '⇢ 偏移', fn: () => useApp.getState().runCommand('sk_offset', '偏移') },
            { key: 'trim', label: '✂ 修剪 (T)', fn: () => setSketchTool('trim') },
            { key: 'autocon', label: '✨ 自动约束', fn: () => void useApp.getState().autoConstrainSel() },
            { key: 'fix', label: '⚓ 固定', fn: () => useApp.getState().addSkCon('fix') },
            { key: 'skarr', label: '▦ 阵列轮廓…', fn: () => useApp.getState().runCommand('sketcharray', '阵列轮廓') },
            'sep',
            { key: 'tgfill', label: `${skView.fill ? '☑' : '☐'} 轮廓填充`, fn: () => setSkView({ fill: !skView.fill }) },
            { key: 'tgannot', label: `${skView.annot ? '☑' : '☐'} 尺寸标注`, fn: () => setSkView({ annot: !skView.annot }) },
            { key: 'tgcons', label: `${skView.cons ? '☑' : '☐'} 约束徽章`, fn: () => setSkView({ cons: !skView.cons }) },
          ]
        } else if (mode === 'sketch') {
          sectors = [
            repeat,
            { key: 'line', glyph: '╱', label: '直线', fn: () => setSketchTool('polyline') },
            { key: 'rect', glyph: '▭', label: '矩形', fn: () => setSketchTool('rectangle') },
            { key: 'circle', glyph: '◯', label: '圆', fn: () => setSketchTool('circle') },
            { key: 'finish', glyph: '✓', label: '完成草图', fn: () => finishSketch() },
            { key: 'extrude', glyph: '⬆', label: '拉伸…', disabled: !(sketchShape || sketchProfiles.length > 0), fn: () => openExtrudeDlg() },
            { key: 'undo', glyph: '↶', label: '撤销', fn: () => void useApp.getState().undo() },
            { key: 'esc', glyph: '✕', label: '取消绘制', fn: () => { useApp.getState().escSketch() } },
          ]
          overflow = [
            { key: 'skdim', label: '⟷ 尺寸 (D)', fn: () => setSketchTool('dimension') },
            { key: 'sksel', label: '↖ 选择/约束', fn: () => setSketchTool('select') },
            { key: 'crect', label: '⊞ 中心矩形', fn: () => setSketchTool('crect') },
            { key: 'circle2p', label: '⊘ 两点圆', fn: () => setSketchTool('circle2p') },
            { key: 'circle3', label: '◓ 三点圆', fn: () => setSketchTool('circle3') },
            { key: 'polygon', label: '⬡ 多边形', fn: () => setSketchTool('polygon') },
            ...(sketchShape || sketchProfiles.length === 1 ? [{ key: 'skarr', label: '▦ 阵列轮廓…', fn: () => useApp.getState().runCommand('sketcharray', '阵列轮廓') } as MMItem] : []),
            'sep',
            { key: 'tgfill', label: `${skView.fill ? '☑' : '☐'} 轮廓填充`, fn: () => setSkView({ fill: !skView.fill }) },
            { key: 'tgannot', label: `${skView.annot ? '☑' : '☐'} 尺寸标注`, fn: () => setSkView({ annot: !skView.annot }) },
            { key: 'tgcons', label: `${skView.cons ? '☑' : '☐'} 约束徽章`, fn: () => setSkView({ cons: !skView.cons }) },
            { key: 'tgpoints', label: `${skView.points ? '☑' : '☐'} 草图点`, fn: () => setSkView({ points: !skView.points }) },
            { key: 'tgconstr', label: `${skView.constr ? '☑' : '☐'} 构造几何`, fn: () => setSkView({ constr: !skView.constr }) },
            { key: 'tggrid', label: `${skView.grid ? '☑' : '☐'} 网格`, fn: () => setSkView({ grid: !skView.grid }) },
          ]
        } else {
          const sc = selectedComponent ? components.find((c) => c.id === selectedComponent) : undefined
          // GM-G4b：三上下文放射菜单（Fusion 式）—— 草图内(上面 if 分支) / 实体上(有活动实体) / 3D 空境(无实体)。
          // 全部 fn 与旧线性时代逐字相同（复用现有 runCommand/store 接线，纯排布升级）；每个 context 严格 8 扇区
          // （旧 model 数组有 9 项 — DIRS[8] 越界，第 9 粒「测量」render 即 crash 嘅潜伏 bug，呢度顺手修正：删面→溢出列表）。
          const del: MMItem = { key: 'del', icon: 'trash', label: '删除', disabled: !selectedFeature && !selectedComponent, fn: () => { if (selectedFeature) { removeFeature(selectedFeature); selectFeature(null) } else if (selectedComponent) useApp.getState().deleteComponent(selectedComponent) } }
          const fit: MMItem = { key: 'fit', glyph: '⊕', label: '适应窗口', fn: () => requestFit() }
          const newSketch: MMItem = { key: 'sketch', icon: 'sketch', label: '创建草图', fn: () => startSketch() }
          if (bodyMesh) {
            // ── 实体上（有活动实体）：N 重复 · NE 草图 · E 按拉 · SE 测量 · S 删除 · SW 移动 · W 圆角 · NW 适应
            sectors = [
              repeat,
              newSketch,
              { key: 'presspull', icon: 'presspull', label: '按拉', fn: () => runCommand('presspull', '按拉') },
              { key: 'measure', icon: 'measure', label: '测量', fn: () => runCommand('measure', '测量') },
              del,
              { key: 'move', icon: 'move', label: '移动/复制', fn: () => runCommand('move', '移动') },
              { key: 'fillet', icon: 'fillet', label: '圆角', fn: () => runCommand('fillet', '圆角') },
              fit,
            ]
          } else {
            // ── 3D 空境（无活动实体）：建模掣全灰冇意思 → 换视图导航 + 起步命令（全部现有接线）
            sectors = [
              repeat,
              newSketch,
              { key: 'viso', glyph: '◈', label: '等轴测', fn: () => setView('iso') },
              { key: 'vtop', glyph: '⬚', label: '上视图', fn: () => setView('top') },
              fit,
              { key: 'vfront', glyph: '⬚', label: '前视图', fn: () => setView('front') },
              { key: 'vright', glyph: '⬚', label: '右视图', fn: () => setView('right') },
              del,
            ]
          }
          overflow = [
            ...(bodyMesh ? [
              { key: 'delface', label: '⌦ 删面', fn: () => runCommand('delface', '删面') } as MMItem,
            ] : [
              { key: 'measure', label: '📏 测量', fn: () => runCommand('measure', '测量') } as MMItem,
            ]),
            ...(bodyMesh ? [
              { key: 'chamfer', label: '◣ 倒角', fn: () => runCommand('chamfer', '倒角') } as MMItem,
              { key: 'facefillet', label: '⌒ 面圆角', fn: () => runCommand('facefillet', '面圆角') } as MMItem,
              { key: 'shell', label: '⬚ 抽壳', fn: () => runCommand('shell', '抽壳') } as MMItem,
              { key: 'expq', label: `📐 导出精度：${useApp.getState().exportQuality === 'fine' ? '细' : useApp.getState().exportQuality === 'coarse' ? '粗' : '中'}`, fn: () => { const q = useApp.getState().exportQuality; useApp.getState().setExportQuality(q === 'medium' ? 'fine' : q === 'fine' ? 'coarse' : 'medium') } } as MMItem,
              { key: 'bsection', label: '✂ 截面取轮廓', fn: async () => { const v = await useApp.getState().appPrompt('截面：轴,位置mm — 喺活动实体呢个位置切一刀，闭合轮廓变成可编辑草图\n例：Z,10 = 喺 z=10 水平切；X,0 / Y,5 亦可（世界坐标）', 'Z,10'); if (v == null) return; const p = v.split(/[,，\s]+/).filter(Boolean); const ax = (p[0] || 'Z').toUpperCase(); if (ax.length !== 1 || !'XYZ'.includes(ax)) { await useApp.getState().appAlert('轴要系 X / Y / Z（例 Z,10）'); return } const c = Number(p[1]); if (!Number.isFinite(c)) { await useApp.getState().appAlert('请输入数字位置，例 Z,10'); return } useApp.getState().meshSectionToSketch(undefined, ax as 'X' | 'Y' | 'Z', c) } } as MMItem,
            ] : []),
            ...(sc ? ['sep' as const,
              { key: 'focus', label: `🎯 聚焦「${sc.name}」`, fn: () => requestFit(sc.id) } as MMItem,
              { key: 'cstl', label: `📥 导出「${sc.name}」STL`, fn: () => useApp.getState().exportComponentStl(sc.id) } as MMItem,
              { key: 'cmirror', label: `⇄ 镜像「${sc.name}」`, fn: () => useApp.getState().mirrorComponent(sc.id) } as MMItem,
              { key: 'cbrep', label: `⧉ 转 B-rep「${sc.name}」（自动：识别圆柱）`, fn: () => void useApp.getState().convertMeshComponent(sc.id) } as MMItem,
              { key: 'cbrepf', label: `⧉ 转 B-rep「${sc.name}」（faceted 逐面）`, fn: () => void useApp.getState().convertMeshComponent(sc.id, 'faceted') } as MMItem,
              { key: 'csection', label: `✂ 截面取轮廓「${sc.name}」`, fn: async () => { const v = await useApp.getState().appPrompt('截面：轴,位置mm（世界坐标，跟随摆位/旋转）— 切一刀，闭合轮廓变可编辑草图（STL remix：取轮廓→改尺寸→重新拉伸）\n例：Z,10 = 水平切；X,0 / Y,5 亦可', 'Z,10'); if (v == null) return; const p = v.split(/[,，\s]+/).filter(Boolean); const ax = (p[0] || 'Z').toUpperCase(); if (ax.length !== 1 || !'XYZ'.includes(ax)) { await useApp.getState().appAlert('轴要系 X / Y / Z（例 Z,10）'); return } const c = Number(p[1]); if (!Number.isFinite(c)) { await useApp.getState().appAlert('请输入数字位置，例 Z,10'); return } useApp.getState().meshSectionToSketch(sc.id, ax as 'X' | 'Y' | 'Z', c) } } as MMItem,
              { key: 'crepair', label: `🩹 补洞修复「${sc.name}」`, fn: () => void useApp.getState().repairActiveMesh(sc.id) } as MMItem,
              { key: 'csimplify', label: `🔻 简化网格「${sc.name}」`, fn: async () => { const v = await useApp.getState().appPrompt('简化到原三角数嘅几多？（0.05–0.9，例 0.3 = 留 30%）\nQEM 误差度量减面（保特征保水密）', '0.3'); if (v == null) return; void useApp.getState().simplifyComponentMeshRatio(sc.id, Number(v) || 0.3) } } as MMItem,
              { key: 'cremesh', label: `▦ 重网格「${sc.name}」`, fn: async () => { const v = await useApp.getState().appPrompt('各向同性重网格（Botsch-Kobbelt：均匀边长 + 原面重投影保形）\n目标边长 mm（细=三角多更平滑，粗=三角少）', '3'); if (v == null) return; void useApp.getState().remeshComponentMesh(sc.id, Number(v) || 3) } } as MMItem,
              { key: 'csmooth', label: `〰 平滑网格「${sc.name}」`, fn: async () => { const v = await useApp.getState().appPrompt('Taubin λ|μ 平滑趟数（1–40，越多越顺）\nshrink-free 保体积、边界钉住、拓扑不变（去扫描噪声/阶梯）', '5'); if (v == null) return; useApp.getState().smoothComponentMesh(sc.id, Number(v) || 5) } } as MMItem,
              { key: 'cmeasure', label: `📏 网格属性「${sc.name}」`, fn: () => useApp.getState().measureMeshComponent(sc.id) } as MMItem,
              { key: 'cplanecut', label: `✂ 平面切割「${sc.name}」`, fn: async () => { const v = await useApp.getState().appPrompt('平面切割（T766 Mesh Plane Cut — 切面自动补实）：\n轴,位置mm,保留侧(+/-)\n例：Z,10,+ = 喺 z=10 水平切，保留上半', 'Z,10,+'); if (v == null) return; const p = v.split(/[,，\s]+/).filter(Boolean); const ax = (p[0] || 'Z').toUpperCase(); if (!'XYZ'.includes(ax)) { await useApp.getState().appAlert('轴要系 X/Y/Z'); return } void useApp.getState().planeCutComponent(sc.id, ax as 'X' | 'Y' | 'Z', Number(p[1]) || 0, (p[2] || '+').includes('-') ? '-' : '+') } } as MMItem,
              { key: 'cshell', label: `🥚 抽壳「${sc.name}」`, fn: async () => { const v = await useApp.getState().appPrompt('网格抽壳 / 加厚（Fusion Mesh Thicken）：沿法向内移壁厚 t，掏空成中空壳（要水密闭合网格）\n壁厚 mm', '2'); if (v == null) return; const t = Number(v.trim()); if (!Number.isFinite(t) || t <= 0) { await useApp.getState().appAlert('壁厚要系正数'); return } void useApp.getState().shellMeshComponent(sc.id, t) } } as MMItem,
              { key: 'coffset', label: `⊕ 偏移网格「${sc.name}」`, fn: async () => { const v = await useApp.getState().appPrompt('网格 3D 均匀偏移（Fusion Mesh Offset）：沿全方向胀缩（minkowski 球膨胀/腐蚀，要水密闭合网格）\n偏移量 mm（正=外扩 / 负=内缩）', '1'); if (v == null) return; const d = Number(v.trim()); if (!Number.isFinite(d) || d === 0) { await useApp.getState().appAlert('偏移量要系非零数字（正外扩/负内缩）'); return } void useApp.getState().offsetMeshComponent(sc.id, d) } } as MMItem,
              { key: 'chull', label: `◇ 凸包「${sc.name}」`, fn: () => void useApp.getState().convexHullComponent(sc.id) } as MMItem,
            ] : []),
            ...(components.filter((c) => !c.hidden).length > 1 ? ['sep' as const,
              { key: 'stack', label: '⊟ 垂直堆叠', fn: () => useApp.getState().stackComponents() } as MMItem,
              { key: 'arrange', label: '⊞ 排版到床', fn: () => useApp.getState().arrangeForPrint() } as MMItem,
              { key: 'drop', label: '⬇ 全部落地', fn: () => useApp.getState().dropAllToFloor() } as MMItem,
            ] : []),
          ]
        }
        // GM-G4b：空境 context 视图掣已升做扇区 → 溢出列表唔再重复；草图/实体上照旧入溢出
        if (mode === 'sketch' || bodyMesh) overflow.push('sep',
          { key: 'vfront', label: '⬚ 前视图', fn: () => setView('front') },
          { key: 'vtop', label: '⬚ 上视图', fn: () => setView('top') },
          { key: 'vright', label: '⬚ 右视图', fn: () => setView('right') },
          { key: 'viso', label: '◈ 等轴测', fn: () => setView('iso') })
        return <MarkingMenu x={ctxMenu.x} y={ctxMenu.y} sectors={sectors} overflow={overflow} onClose={() => setCtxMenu(null)} />
      })()}

      {pushPullMode && (
        <CommandDialog
          icon="presspull"
          title={pushPullPicks.length ? tStatus('偏移面', lang) : tStatus('按拉', lang)}
          width={244}
          okLabel={tStatus('确定', lang)}
          okDisabled={!pushPullPicks.length || Math.abs(pushPullDist) < 1e-9}
          okTip={tStatus('应用（Enter）', lang)}
          onOk={() => void useApp.getState().commitPushPull()}
          onCancel={() => useApp.getState().togglePushPull()}
          summary={<>{pushPullPicks.length ? tStatus('偏移面', lang) : tStatus('按拉', lang)}{pushPullPicks.length ? ` · ${pushPullPicks.length} ${tStatus('面', lang)} · ${pushPullDist} mm` : ''}</>}
        >
          <SelectionChip
            label={pushPullPicks.length ? tStatus('面', lang) : tStatus('选择', lang)}
            count={pushPullPicks.length}
            hint={tStatus('选择实体面；选边会转入圆角，选草图轮廓会转入拉伸', lang)}
            onClear={() => useApp.getState().clearPushPullPicks()}
          />
          {pushPullPicks.length > 0 && <>
            <label title={tStatus('Fusion Offset Type：自动、修改现有特征或建立新偏移', lang)}>
              <span style={{ color: '#6b7680' }}>{tStatus('偏移类型', lang)}</span>
              <span><select value={offsetType} onChange={(e) => setOffsetType(e.target.value as 'modify' | 'new' | 'auto')} style={{ height: 26 }}>
                <option value="modify">{tStatus('修改现有特征', lang)}</option>
                <option value="new">{tStatus('新偏移', lang)}</option>
                <option value="auto">{tStatus('自动', lang)}</option>
              </select></span>
            </label>
            <label>
              <span style={{ color: '#6b7680' }}>{tStatus('距离', lang)}</span>
              <span><input data-testid="press-pull-distance" type="number" aria-label="按拉距离 mm" step={0.5} value={pushPullDist} onChange={(e) => setPushPullDist(Number(e.target.value))} style={{ width: 66 }} /> mm</span>
            </label>
          </>}
        </CommandDialog>
      )}

      {edgeRoundPick && (
        <CommandDialog
          icon={edgeRoundPick === 'chamfer' ? 'chamfer' : 'fillet'}
          title={edgeRoundPick === 'chamfer' ? '倒角' : '圆角'}
          width={300}
          okLabel={edgeRoundPick === 'chamfer' ? 'OK' : `确定（${edgeRoundPicks.length}）`}
          okDisabled={!edgeRoundPicks.length || roundPreviewFail || (edgeRoundPick === 'fillet' && filletType === 'rule' && filletRuleMode === 'between' && !(filletRuleFaceSets.includes(1) && filletRuleFaceSets.includes(2))) || (edgeRoundPick === 'fillet' && filletType === 'full' && !([1, 2, 3] as const).every((slot) => filletFullFaceSets.includes(slot))) || (edgeRoundPick === 'fillet' && filletType !== 'full' && (filletMode === 'chord' ? !(filletChord > 0) : filletMode === 'asymmetric' ? !(filletR2 > 0) || edgeRoundRadii.length !== edgeRoundPicks.length || edgeRoundRadii.some((r) => !(r > 0)) : edgeRoundRadii.length !== edgeRoundPicks.length || edgeRoundRadii.some((r) => !(r > 0)))) || (edgeRoundPick === 'chamfer' && (!(edgeRoundSize > 0) || (chamferMode === 'two' && !(chamferSize2 > 0)) || (chamferMode === 'angle' && (!chamferRefFace || !(chamferAngle > 0 && chamferAngle < 90)))))}
          okTip="应用（Enter）"
          onOk={() => void commitEdgeRound()}
          onCancel={() => cancelEdgeRound()}
          summary={edgeRoundPick === 'fillet' ? <>{filletType === 'rule' ? `规则圆角 R${edgeRoundSize}` : filletType === 'full' ? '全圆角' : filletMode === 'asymmetric' ? `不对称圆角 ${edgeRoundSize}/${filletR2}` : `圆角 R${edgeRoundSize}`} · {edgeRoundPicks.length || 0} {filletType === 'rule' ? '面/特征' : filletType === 'full' ? '面' : '条棱'}</> : null}
        >
          {edgeRoundPick === 'fillet' && <label>
            <span style={{ color: '#6b7680' }}>类型</span>
            <span><select value={filletType} onChange={(e) => useApp.getState().setFilletType(e.target.value as 'fillet' | 'rule' | 'full')} style={{ height: 26 }} aria-label="圆角类型"><option value="fillet">圆角</option><option value="rule">规则圆角</option><option value="full">全圆角</option></select></span>
          </label>}
          {edgeRoundPick === 'fillet' && filletType === 'rule' ? <>
            <label><span style={{ color: '#6b7680' }}>规则类型</span><span><select value={filletRuleMode} onChange={(e) => useApp.getState().setFilletRuleMode(e.target.value as 'all' | 'between')} style={{ height: 26 }} aria-label="规则圆角规则类型"><option value="all">全部边</option><option value="between">面/特征之间</option></select></span></label>
            <SelectionChip label={filletRuleMode === 'all' ? '面/特征' : '面/特征组 1'} count={filletRuleFaceSets.filter((x) => x === 1).length} hint={filletRuleMode === 'all' ? '点选面或特征，将自动倒圆其全部边界' : '点此槽后选择第一组面/特征'} onClear={() => useApp.getState().clearEdgeRoundPicks()} />
            {filletRuleMode === 'between' && <><button type="button" onClick={() => useApp.getState().setFilletRuleSlot(1)} style={{ background: filletRuleSlot === 1 ? '#dceeff' : undefined }}>选择组 1</button><SelectionChip label="面/特征组 2" count={filletRuleFaceSets.filter((x) => x === 2).length} hint="点此槽后选择第二组面/特征；只倒圆两组共同边" onClear={() => useApp.getState().clearEdgeRoundPicks()} /><button type="button" onClick={() => useApp.getState().setFilletRuleSlot(2)} style={{ background: filletRuleSlot === 2 ? '#dceeff' : undefined }}>选择组 2</button></>}
          </> : edgeRoundPick === 'fillet' && filletType === 'full' ? <>
            {([1, 2, 3] as const).map((slot) => <div key={`full-round-slot-${slot}`} style={{ display: 'grid', gridTemplateColumns: '78px 1fr', gap: 5, alignItems: 'center' }}>
              <button type="button" onClick={() => useApp.getState().setFilletFullSlot(slot)} style={{ background: filletFullSlot === slot ? '#dceeff' : undefined }}>{slot === 1 ? '侧面组 1' : slot === 2 ? '中心面' : '侧面组 2'}</button>
              <SelectionChip label={slot === 1 ? '侧面组 1' : slot === 2 ? '中心面' : '侧面组 2'} count={filletFullFaceSets.filter((x) => x === slot).length} hint={slot === 2 ? '选择要被完整圆弧取代的中心面' : '选择与中心面相邻的侧面'} onClear={() => useApp.getState().clearFilletFullSlot(slot)} />
            </div>)}
            <div className="sb-hint">半径由三组面自动推导；三组都选齐后立即显示真实 B-rep 预览。</div>
          </> : edgeRoundPick === 'chamfer' ? <>
            {/* Fusion Chamfer palette order: parameter row → Type → selection → Tangent Chain → Flip → Corner Type. */}
            <label>
              <span style={{ color: '#6b7680' }}>{chamferMode === 'two' ? 'Distance 1' : 'Distance'}</span>
              <span><input type="number" aria-label="Chamfer distance mm" min={0} step={0.5} value={edgeRoundSize} onChange={(e) => setEdgeRoundSize(Number(e.target.value))} style={{ width: 66 }} /> mm</span>
            </label>
            {chamferMode === 'two' && <label>
              <span style={{ color: '#6b7680' }}>Distance 2</span>
              <span><input type="number" aria-label="Chamfer second distance mm" min={0} step={0.5} value={chamferSize2} onChange={(e) => setChamferSize2(Number(e.target.value))} style={{ width: 66 }} /> mm</span>
            </label>}
            {chamferMode === 'angle' && <label>
              <span style={{ color: '#6b7680' }}>Angle</span>
              <span><input type="number" aria-label="Chamfer angle deg" min={0} max={90} step={1} value={chamferAngle} onChange={(e) => setChamferAngle(Number(e.target.value))} style={{ width: 66 }} /> deg</span>
            </label>}
            <label>
              <span style={{ color: '#6b7680' }}>Type</span>
              <span><select value={chamferMode} onChange={(e) => setChamferMode(e.target.value as 'equal' | 'two' | 'angle')} style={{ height: 26 }} aria-label="Chamfer Type"><option value="equal">Equal Distance</option><option value="two">Two Distance</option><option value="angle">Distance and Angle</option></select></span>
            </label>
            <SelectionChip label="Edges/Faces/Features" count={edgeRoundPicks.length + (chamferMode === 'angle' && chamferRefFace ? 1 : 0)} hint="Select" selectedText={chamferMode === 'angle' ? `${chamferRefFace ? 1 : 0} Face, ${edgeRoundPicks.length} Edge${edgeRoundPicks.length === 1 ? '' : 's'}` : undefined} onClear={() => useApp.getState().clearEdgeRoundPicks()} />
            <label className="sb-hint" title="Fusion Tangent Chain：点一条棱，自动连同相切连续边链">
              <span style={{ color: '#6b7680' }}>Tangent Chain</span>
              <input type="checkbox" aria-label="Tangent Chain" checked={edgeRoundChain} onChange={() => useApp.getState().toggleEdgeRoundChain()} />
            </label>
            {chamferMode !== 'equal' && <label style={{ fontSize: 12, color: '#6b7680' }} title="交换两个相邻面的参考侧">
              <span>Flip</span>
              <button type="button" aria-label="Flip" aria-pressed={chamferFlip} onClick={() => toggleChamferFlip()} style={{ minWidth: 34 }}>{chamferFlip ? '↔' : '⇄'}</button>
            </label>}
            <label title="Fusion Corner Type">
              <span style={{ color: '#6b7680' }}>Corner Type</span>
              <span><select value="chamfer" style={{ height: 26 }} aria-label="Chamfer Corner Type"><option value="chamfer">Chamfer</option><option disabled>Miter</option><option disabled>Blend</option></select></span>
            </label>
          </> : <SelectionChip label="边/面/特征" count={edgeRoundPicks.length} hint="逐条点选要处理的棱（成条高亮；再点同一条=取消）" onClear={() => useApp.getState().clearEdgeRoundPicks()} />}
          {edgeRoundPick === 'fillet' && filletType === 'fillet' && filletMode !== 'chord' && (
            <div style={{ border: '1px solid #c8d0d8', borderRadius: 3, padding: 4 }} title="Fusion Radius Group：每组有自己嘅选边槽、半径同连续性；点击一行后，新拣嘅边会加入该组。">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 132, overflowY: 'auto' }}>
                {filletRadiusGroups.map((g, gi) => {
                  const n = edgeRoundGroupIds.filter((x) => x === gi).length
                  const active = gi === filletActiveGroup
                  return <div key={`frg-${gi}`} onClick={() => useApp.getState().selectFilletRadiusGroup(gi)} style={{ display: 'grid', gridTemplateColumns: '54px 62px 1fr', gap: 4, alignItems: 'center', padding: '3px 4px', borderRadius: 3, cursor: 'pointer', background: active ? '#dceeff' : 'transparent', outline: active ? '1px solid #4b91d1' : '1px solid transparent' }}>
                    <span style={{ fontSize: 11, color: active ? '#145f9b' : '#596772' }}>{n} 边</span>
                    <span><input type="number" aria-label={filletMode === 'asymmetric' ? `半径组 ${gi + 1} 偏移 1 mm` : `半径组 ${gi + 1} 半径 mm`} min={0} step={0.5} value={g.radius} onClick={(e) => e.stopPropagation()} onFocus={() => useApp.getState().selectFilletRadiusGroup(gi)} onChange={(e) => useApp.getState().setFilletGroupRadius(gi, Number(e.target.value))} style={{ width: 48 }} /> mm</span>
                    <select aria-label={`半径组 ${gi + 1} 连续性`} value={filletMode === 'asymmetric' ? 'G1' : g.continuity} disabled={filletMode === 'asymmetric'} title={filletMode === 'asymmetric' ? 'Fusion 360 不对称圆角固定使用 G1 连续性' : undefined} onClick={(e) => e.stopPropagation()} onFocus={() => useApp.getState().selectFilletRadiusGroup(gi)} onChange={(e) => useApp.getState().setFilletGroupContinuity(gi, e.target.value as 'G1' | 'G2')} style={{ height: 24, minWidth: 92 }}><option value="G1">相切 G1</option><option value="G2">曲率 G2</option></select>
                  </div>
                })}
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}><button type="button" aria-label="新增半径组" onClick={() => useApp.getState().addFilletRadiusGroup()} style={{ minWidth: 28 }}>＋</button><button type="button" aria-label="删除半径组" disabled={filletRadiusGroups.length <= 1} onClick={() => useApp.getState().removeFilletRadiusGroup()} style={{ minWidth: 28 }}>×</button><span style={{ fontSize: 10, color: '#6b7680', alignSelf: 'center' }}>选中第 {filletActiveGroup + 1} 组</span></div>
            </div>
          )}
          {roundPreviewFail && (edgeRoundPick === 'chamfer'
            ? <div style={{ fontSize: 11, color: '#c9362a', fontWeight: 600 }}><div>1 error(s)</div><div>The fillet/chamfer could not be created at the requested size.</div><div style={{ fontWeight: 400 }}>Try adjusting the size, deselecting some of the edges (try disabling Tangent Chain), or using multiple separate operations.</div></div>
            : <div style={{ fontSize: 11, color: '#c9362a', fontWeight: 600 }}>⚠ {filletType === 'full' ? '三组面必须相邻，而且当前要求两条边界为平行直线' : filletMode === 'asymmetric' ? '目前只支持凸直线边与互相垂直的两个平面；几何保持不变' : '圆角半径太大（超过相邻面）— 减小数值先撳得确定'}</div>)}
          {edgeRoundPick === 'fillet' && filletType === 'fillet' && <label className="sb-hint" title="切线链（Fusion tangent chain）：点一条棱，自动连埋同佢相切连续嘅成条边链（例如圆角矩形顶圈 = 4 直边 + 4 弧一次过倒）">
            <input type="checkbox" checked={edgeRoundChain && filletMode !== 'asymmetric'} disabled={edgeRoundPick === 'fillet' && filletMode === 'asymmetric'} onChange={() => useApp.getState().toggleEdgeRoundChain()} /> 切线链（自动连相切棱）
          </label>}
          {/* R1 弦高圆角模式切换（仅 fillet）：半径 / 弦高（半径由每条棱局部二面角换算 r=c/(2cos(β/2))） */}
          {edgeRoundPick === 'fillet' && filletType === 'fillet' && <label title="Fusion Radius Type">
            <span style={{ color: '#6b7680' }}>半径类型</span>
            <span><select value={filletMode === 'chord' ? 'chord' : filletMode === 'asymmetric' ? 'asymmetric' : filletR2 > 0 ? 'variable' : 'constant'} onChange={(e) => { const v = e.target.value; if (v === 'chord') { setFilletMode('chord'); setFilletR2(0) } else if (v === 'asymmetric') { setFilletMode('asymmetric'); setFilletR2(edgeRoundSize || 1) } else { setFilletMode('radius'); setFilletR2(v === 'variable' ? (edgeRoundSize || 1) : 0) } }} style={{ height: 26 }} aria-label="圆角半径类型"><option value="constant">常数</option><option value="chord">弦长</option><option value="variable">变量</option><option value="asymmetric">不对称</option></select></span>
          </label>}
          {edgeRoundPick === 'fillet' && filletType === 'fillet' && filletMode === 'chord' ? (
            <label title="弦高：两切点之间的弦长；半径由每条棱局部二面角自动换算（直边精确，变角曲边用中点近似）">
              <span style={{ color: '#6b7680' }}>弦高</span>
              <span><input type="number" aria-label="弦高 mm" min={0.5} step={0.5} value={filletChord} onChange={(e) => setFilletChord(Number(e.target.value))} style={{ width: 66 }} /> mm</span>
            </label>
          ) : edgeRoundPick === 'fillet' && filletType === 'rule' ? (
            <label>
              <span style={{ color: '#6b7680' }}>半径</span>
              <span><input type="number" aria-label="圆角半径 mm" min={0.5} step={0.5} value={edgeRoundSize} onChange={(e) => setEdgeRoundSize(Number(e.target.value))} style={{ width: 66 }} /> mm</span>
            </label>
          ) : null}
          {edgeRoundPick === 'fillet' && filletType === 'fillet' && filletMode === 'radius' && filletR2 > 0 && (
            <label title="变半径圆角：末端半径 ≠ 起始半径 → 沿每条棱线性渐变（0=等半径）">
              <span style={{ color: '#6b7680' }}>末端半径 (变径)</span>
              <span><input type="number" aria-label="末端半径（变径）mm" min={0} step={0.5} value={filletR2} onChange={(e) => setFilletR2(Number(e.target.value))} style={{ width: 66 }} /> mm</span>
            </label>
          )}
          {edgeRoundPick === 'fillet' && filletType === 'fillet' && filletMode === 'asymmetric' && <>
            <label title="不对称圆角：两个相邻面分别使用独立偏移；截面为真实四分之一椭圆。">
              <span style={{ color: '#6b7680' }}>偏移 2</span>
              <span><input type="number" aria-label="不对称圆角偏移 2 mm" min={0.1} step={0.5} value={filletR2} onChange={(e) => setFilletR2(Number(e.target.value))} style={{ width: 66 }} /> mm</span>
            </label>
            <label className="sb-hint" title="交换偏移 1 与偏移 2 所属的相邻面">
              <input type="checkbox" checked={filletAsymFlip} onChange={(e) => setFilletAsymFlip(e.target.checked)} /> 翻转偏移方向
            </label>
            <div className="sb-hint">不对称圆角固定为相切 G1，并使用收进转角。</div>
          </>}
          {/* S174 逐边半径 / GM-3DV3 M7 逐边距离：≥2 条棱时，逐条改半径/距离（Fusion 多半径圆角 / 逐边倒角 —— 一个特征内 A 棱 R2、B 棱 R8）。默认 = 上面全局值，改边即按边落不同值。倒角仅 equal 模式（两距离/角度各棱统一）。 */}
          {(edgeRoundPick === 'chamfer' && chamferMode === 'equal') && edgeRoundPicks.length >= 2 && (
            <div style={{ borderTop: '1px solid #2a2e33', marginTop: 4, paddingTop: 4 }} title="逐边尺寸：每条拣中棱各自圆角半径/倒角距离。默认跟上面全局值；改某条即该棱用唔同值。">
              <div style={{ color: '#6b7680', fontSize: 11, marginBottom: 2 }}>逐边距离（逐边倒角）</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 120, overflowY: 'auto' }}>
                {edgeRoundPicks.map((_, i) => (
                  <div key={'err' + i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ width: 38, color: '#8a97a2' }}>棱 {i + 1}</span>
                    <input type="number" aria-label={`棱 ${i + 1} 距离 mm`} min={0.1} step={0.5} value={+(edgeRoundRadii[i] ?? edgeRoundSize).toFixed(2)} onChange={(e) => useApp.getState().setEdgeRoundRadiusAt(i, Number(e.target.value))} style={{ width: 60 }} /> mm
                  </div>
                ))}
              </div>
            </div>
          )}
          {edgeRoundPick === 'fillet' && filletType === 'fillet' && <label title={filletMode === 'asymmetric' ? 'Fusion 360 不对称圆角固定使用收进转角。' : 'Fusion Corner Type：滚球（默认）或收进；收进会在多棱交汇处建立 setback 过渡。'}>
            <span style={{ color: '#6b7680' }}>转角类型</span>
            <span><select value={filletMode === 'asymmetric' ? 'setback' : filletSetback > 0 ? 'setback' : 'rolling'} disabled={filletMode === 'asymmetric'} onChange={(e) => setFilletSetback(e.target.value === 'setback' ? 0.2 : 0)} style={{ height: 26 }}><option value="rolling">滚球</option><option value="setback">收进</option></select></span>
          </label>}
        </CommandDialog>
      )}

      {surfBridgePickM && (
        <CommandDialog
          icon="loft"
          title={tStatus('桥接面', lang)}
          width={240}
          okLabel={`确定（${surfBridgePicks.length}/2）`}
          okDisabled={surfBridgePicks.length !== 2}
          okTip={tStatus('桥接（Enter）', lang)}
          onOk={() => void useApp.getState().commitSurfBridge()}
          onCancel={() => useApp.getState().cancelSurfBridge()}
          summary={<>{tStatus('桥接面', lang)} · {surfBridgePicks.length}/2 {surfBridgeThick > 0 ? ` · 加厚${surfBridgeThick}` : ''}</>}
        >
          <SelectionChip label={tStatus('棱', lang)} count={surfBridgePicks.length} hint={tStatus('① 点选 2 条现有棱（一边一条，青点标记）→ 光滑过渡面', lang)} onClear={() => useApp.getState().clearSurfBridgePicks()} />
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginTop: 6 }}>
            <span style={{ color: '#6b7680' }}>{tStatus('加厚', lang)}</span>
            <span><input type="number" min={0} step={0.5} value={surfBridgeThick} onChange={(e) => useApp.getState().setSurfBridgeThick(Number(e.target.value))} style={{ width: 66 }} /> mm</span>
          </label>
          <div style={{ fontSize: 11, color: '#8a97a2', marginTop: 4 }}>{tStatus('对称 C1 光滑过渡（两棱方向要大致同向）；结果泊车做曲面体', lang)}</div>
        </CommandDialog>
      )}

      {boundaryPatchPick && (
        <CommandDialog
          icon="shell"
          title="边界补面"
          width={240}
          okLabel={`确定（${boundaryPatchPicks.length}）`}
          okDisabled={boundaryPatchPicks.length < 2}
          okTip="补面（Enter）"
          onOk={() => void commitBoundaryPatch()}
          onCancel={() => cancelBoundaryPatch()}
          summary={<>边界补面 · {boundaryPatchPicks.length || 0} 条棱{boundaryPatchTangent ? ' · G1' : ''}{boundaryPatchThick > 0 ? ` · 加厚${boundaryPatchThick}` : ''}</>}
        >
          <SelectionChip label="边界棱" count={boundaryPatchPicks.length} hint="① 逐条点选边界棱（≥2，橙点标记）→ 填充/封口" onClear={() => useApp.getState().clearBoundaryPatchPicks()} />
          <label style={{ display: 'flex', justifyContent: 'flex-start', gap: 6, fontSize: 12, color: '#6b7680', marginTop: 6 }} title="G1 相切：补面与邻面相切连续（class-A 过渡）；邻面解析唔到时退回 G0">
            <input type="checkbox" checked={boundaryPatchTangent} onChange={(e) => useApp.getState().setBoundaryPatchTangent(e.target.checked)} /> G1 相切（与邻面）
          </label>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginTop: 6 }}>
            <span style={{ color: '#6b7680' }}>加厚</span>
            <span><input type="number" aria-label="加厚 mm（0=净曲面）" min={0} step={0.5} value={boundaryPatchThick} onChange={(e) => useApp.getState().setBoundaryPatchThick(Number(e.target.value))} style={{ width: 66 }} /> mm</span>
          </label>
        </CommandDialog>
      )}

      {shellMode && (
        <CommandDialog
          icon="shell"
          title="抽壳"
          width={236}
          okLabel={tStatus('确定', lang)}
          okDisabled={!shellPicks.length || !(shellThickness > 0)}
          okTip="抽壳（Enter）"
          onOk={() => void commitShell()}
          onCancel={() => cancelShell()}
          summary={<>{shellType === 'closed' ? '封闭实体' : `开 ${shellPicks.length} 面`} · 壁厚 {shellThickness}</>}
        >
          <SelectionChip label={shellType === 'closed' ? '实体' : '面'} count={shellPicks.length} hint={shellType === 'closed' ? '点选要建立封闭空腔的实体' : '点选要移除的面（再点取消）'} onClear={() => useApp.getState().clearShellPicks()} />
          {shellType === 'open' && <label style={{ justifyContent: 'flex-start', gap: 6 }} title="Fusion Tangent Chain：沿共享边自动加入 G1 相切连续面">
            <input type="checkbox" checked={shellTangentChain} onChange={() => toggleShellTangentChain()} /> 切线链
          </label>}
          <label>
            <span style={{ color: '#6b7680' }}>抽壳类型</span>
            <span><select value={shellType} onChange={(e) => setShellType(e.target.value as 'open' | 'closed')} style={{ height: 26 }} aria-label="抽壳类型"><option value="open">移除面</option><option value="closed">封闭实体</option></select></span>
          </label>
          <label>
            <span style={{ color: '#6b7680' }}>壁厚</span>
            <span><input type="number" min={0} step={0.5} value={shellThickness} onChange={(e) => setShellThickness(Number(e.target.value))} style={{ width: 66 }} /> mm</span>
          </label>
          <label title={tStatus('壁厚方向（Fusion Direction）：向内=外形保留 · 向外=尺寸外扩 · 两侧=壁跨原边界（逐面不同厚度请事后用「偏移面」）', lang)}>
            <span style={{ color: '#6b7680' }}>{tStatus('方向', lang)}</span>
            <span><select value={shellDir} onChange={(e) => setShellDir(e.target.value as 'inside' | 'outside' | 'both')} style={{ height: 26 }}><option value="inside">{tStatus('向内', lang)}</option><option value="outside">{tStatus('向外', lang)}</option><option value="both">{tStatus('两侧', lang)}</option></select></span>
          </label>
        </CommandDialog>
      )}

      {faceFilletMode && (
        <CommandDialog
          icon="fillet"
          title="面圆角"
          width={244}
          okLabel={`确定（${faceFilletPicks.length}/2）`}
          okDisabled={faceFilletPicks.length !== 2}
          okTip="面圆角（Enter）"
          onOk={() => void commitFaceFillet()}
          onCancel={() => cancelFaceFillet()}
          summary={<>面圆角 R{faceFilletRadius} · {faceFilletPicks.length}/2 面</>}
        >
          <SelectionChip label="两张面" count={faceFilletPicks.length} hint="① 点选两张相邻面；确认前会验证共同 B-rep 边" onClear={() => useApp.getState().clearFaceFilletPicks()} />
          <label>
            <span style={{ color: '#6b7680' }}>半径</span>
            <span><input type="number" aria-label="面圆角半径 mm" min={0.1} step={0.5} value={faceFilletRadius} onChange={(e) => setFaceFilletRadius(Number(e.target.value))} style={{ width: 66 }} /> mm</span>
          </label>
          <div style={{ fontSize: 11, color: '#8a97a2', lineHeight: 1.4 }}>窄版：平面-平面 / 平面-圆柱(轴⟂) 解析切点；一般曲面对滚球需改核（cad2）后置。</div>
        </CommandDialog>
      )}

      {!!draftPickMode && (
        <CommandDialog
          icon="default"
          title="拔模（拾中性面）"
          width={248}
          okLabel="确定拔模"
          okDisabled={!draftNeutral}
          okTip="拾完面后取角度拔模（Enter）"
          onOk={() => void useApp.getState().finishDraftPick()}
          onCancel={() => useApp.getState().toggleDraftPick()}
          summary={<>{draftNeutral ? `中性面已选 · 侧面 ${draftSides.length || 0} · ${draftFlip ? '−' : ''}${draftAngle}°${draftTwoSided ? ' 双面' : ''}` : '先点中性面'}（脱模斜度，趋势级）</>}
        >
          <SelectionChip label="① 中性面" count={draftNeutral ? 1 : 0} hint="脱模时不动的参考面（通常顶/底面）" onClear={() => useApp.getState().toggleDraftPick()} />
          <SelectionChip label="② 侧面集" count={draftSides.length} hint="要加斜度的侧面（可多选；不选=全部非平行面）" onClear={() => useApp.setState({ draftSides: [] })} />
          {/* P2（v8-S）：角度/翻转/双面入对话框（Fusion Draft 同款）— 撳「确定拔模」直接落特征，唔再弹文本 prompt */}
          <label title="拔模角°：远离中性面侧收缩（正角）；「翻转」反向脱模">
            <span style={{ color: '#6b7680' }}>角度</span>
            <span><input type="number" step={1} min={0.5} max={45} value={draftAngle} onChange={(e) => useApp.getState().setDraftAngle(Number(e.target.value))} style={{ width: 56 }} /> °</span>
          </label>
          <label style={{ justifyContent: 'flex-start', gap: 6, fontSize: 12 }} title="Flip Direction：把脱模方向反转（等同负角度）">
            <input type="checkbox" checked={draftFlip} onChange={(e) => useApp.getState().setDraftFlip(e.target.checked)} /> 翻转方向
          </label>
          <label style={{ justifyContent: 'flex-start', gap: 6, fontSize: 12 }} title="双面/分模线拔模：中性面两侧各朝自己脱模方向收（需两侧都拣咗侧面；跨分模线嘅整张面只算一侧）">
            <input type="checkbox" checked={draftTwoSided} onChange={(e) => useApp.getState().setDraftTwoSided(e.target.checked)} /> 双面（分模线两侧）
          </label>
          <div style={{ fontSize: 11, color: '#6b7680' }}>{draftPickMode === 1 ? '点【中性面】' : '点【侧面】(可多选) → 确定拔模'}</div>
        </CommandDialog>
      )}

      {(feaMode > 0 || feaBusy || feaResult || modalBusy || modalResult || bucklingBusy || bucklingResult || topoptBusy || topoptResult || thermalBusy || thermalResult || thermalStressBusy || feaConvBusy || feaConvResult) && (
        <CommandDialog
          icon="interference"
          title="FEA：受力/模态/屈曲/生成式/热（体素趋势）"
          width={272}
          okLabel={feaBusy ? '计算中…' : feaResult ? '重新运行' : '运行受力'}
          okDisabled={feaBusy || modalBusy || bucklingBusy || topoptBusy || thermalBusy || thermalStressBusy || !feaFixed || !feaLoad}
          okTip="求解 von Mises 趋势云图（Enter）"
          onOk={() => void runFeaSolve()}
          onCancel={() => { useApp.getState().clearFea(); useApp.getState().clearModal(); useApp.getState().clearBuckling(); useApp.getState().clearTopopt(); useApp.getState().clearThermal() }}
          summary={<>{feaMat} · 静力/模态/屈曲/生成式/热（趋势，非商用 FEA）</>}
        >
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <button onClick={() => useApp.getState().autoFeaCantilever()} title="自动【悬臂】：夹一端 + 受力另一端(沿最长轴) — 免手动揾端面/撳错侧面。应力最大喺固定端根部。" style={{ flex: 1, padding: '5px 6px', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid #2f6fb0', borderRadius: 4, background: '#1e3a5f', color: '#dbe8f5' }}>🔧 悬臂（夹一端·推另一端）</button>
            <button onClick={() => useApp.getState().autoFeaSimplySupported()} title="自动【简支梁 / 3 点弯】：两端托住 + 中间施力 — 应力最大会喺【中间】(同悬臂相反)。两端 roller 支撑，唔会夹持应力集中。" style={{ flex: 1, padding: '5px 6px', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid #2f7a4e', borderRadius: 4, background: '#1e3a2a', color: '#d6f0e0' }}>🔧 简支梁（两端托·中间压）</button>
          </div>
          <SelectionChip label={feaBeam3pt ? '① 支撑 A' : '① 固定面'} count={feaFixed ? 1 : 0} hint={feaBeam3pt ? '简支梁左支撑（蓝标）' : '点被夹住/锁实嘅面（蓝标）'} onClear={() => useApp.setState({ feaFixed: null, feaMode: 1 })} />
          {feaBeam3pt && <SelectionChip label="① 支撑 B" count={feaFixed2 ? 1 : 0} hint="简支梁右支撑（蓝标）" onClear={() => useApp.setState({ feaFixed2: null })} />}
          <label>
            <span style={{ color: '#6b7680' }}>约束</span>
            <select value={feaFixMode} onChange={(e) => setFeaOpt({ feaFixMode: e.target.value as 'fixed' | 'roller' | 'sym' })} title="固定=全锁(夹死/上螺丝)；滚子=只锁法向、准面内滑(支座/导轨，更软、挠度更大)；对称=对称面(轴对齐时数学同滚子)">
              <option value="fixed">固定（全锁）</option>
              <option value="roller">滚子（只锁法向）</option>
              <option value="sym">对称面</option>
            </select>
          </label>
          <label title="S111 自重体载：把材料 ρ·a 作为分布体力叠加到外载之上。默认 1g 向下 = 纯自重；下面可改方向+倍数做侧向/多 g（加速度/惯性/冲击载荷，Fusion Linear Acceleration）。需有效材料密度。" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <input type="checkbox" checked={feaGravity} onChange={(e) => useApp.setState({ feaGravity: e.target.checked })} /><span style={{ color: '#6b7680' }}>重力/惯性自重</span>
          </label>
          {/* S175：加速度向量（g 单位）— 方向+倍数。[0,0,-1]=1g 向下=纯自重；可侧向/多 g 模拟惯性/加速度/冲击载荷。 */}
          {feaGravity && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11 }} title="加速度向量（g 单位，1g=9810mm/s²）：gx,gy,gz。例 [0,0,-1]=自重；[2,0,0]=沿 +X 2g 横向惯性；[0,0,-5]=5g 向下冲击。">
              <span style={{ color: '#6b7680' }}>a(g)</span>
              {([0, 1, 2] as const).map((k) => (
                <input key={k} type="number" step={0.5} aria-label={`加速度 ${'XYZ'[k]} (g)`} value={feaAccel[k]} onChange={(e) => { const v = feaAccel.slice() as [number, number, number]; v[k] = Number(e.target.value) || 0; useApp.setState({ feaAccel: v }) }} style={{ width: 42 }} />
              ))}
              <button type="button" title="重置为 1g 向下（纯自重）" onClick={() => useApp.setState({ feaAccel: [0, 0, -1] })} style={{ padding: '1px 5px', fontSize: 10, borderRadius: 3, cursor: 'pointer', border: '1px solid #3a3e44', background: '#23272d', color: '#8a97a2' }}>↧1g</button>
              <span style={{ color: '#6b7680' }}>{`|a|=${Math.hypot(feaAccel[0], feaAccel[1], feaAccel[2]).toFixed(2)}g`}</span>
            </div>
          )}
          {/* S116：销/圆柱约束 — 点圆柱孔内壁 → 径向锁、轴向+切向自由（销轴/螺栓支承） */}
          <label title="S116 销/圆柱约束：点圆柱孔内壁 → 径向 DOF 锁、轴向+切向自由（模拟销轴/螺栓支承）。可同固定面/对称约束并用。" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <button type="button" onClick={() => useApp.getState().startFeaPinPick()} style={{ padding: '2px 6px', fontSize: 11, borderRadius: 3, cursor: 'pointer', border: feaPinPick ? '1px solid #4a9eff' : '1px solid #3a3e44', background: feaPinPick ? '#1e3a5f' : '#23272d', color: '#d8dde2' }}>🎯 销孔</button>
            <span style={{ color: feaPin ? '#7fbf7f' : '#6b7680' }}>{feaPin ? `Ø${(feaPin.radius * 2).toFixed(1)}` : '未设'}</span>
            {feaPin && <span onClick={() => useApp.setState({ feaPin: null })} style={{ cursor: 'pointer', color: '#cc6666' }} title="清除销约束">✕</span>}
          </label>
          <SelectionChip label="② 受力面" count={feaLoad ? 1 : 0} hint="点力作用嘅面（橙标）" onClear={() => useApp.setState({ feaLoad: null, feaMode: feaFixed ? 2 : 1 })} />
          <label>
            <span style={{ color: '#6b7680' }}>载荷</span>
            <select value={feaLoadMode} onChange={(e) => setFeaOpt({ feaLoadMode: e.target.value as 'force' | 'pressure' | 'bearing' })} title="集中力 = 总力 N 摊分受力面；压力 = MPa × 受力面面积 → 沿法向均布；轴承 = 合力 N 余弦分布喺拾中圆柱孔嘅受推半边（销/螺栓推孔，比均布点载更准孔边峰值）">
              <option value="force">集中力 (N)</option>
              <option value="pressure">压力 (MPa)</option>
              <option value="bearing">轴承载荷 (N)</option>
            </select>
          </label>
          {feaLoadMode === 'bearing' && (
            <label title="轴承载荷孔：点一个圆柱孔面 → 合力（下面「力」+「方向」）余弦分布喺孔受推半边。无需②受力面。" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <button type="button" onClick={() => useApp.getState().startFeaBearingPick()} style={{ padding: '2px 6px', fontSize: 11, borderRadius: 3, cursor: 'pointer', border: feaBearingPick ? '1px solid #4a9eff' : '1px solid #3a3e44', background: feaBearingPick ? '#1e3a5f' : '#23272d', color: '#d8dde2' }}>🎯 轴承孔</button>
              <span style={{ color: feaBearing ? '#7fbf7f' : '#c77d00' }}>{feaBearing ? `Ø${(feaBearing.radius * 2).toFixed(1)}` : '未拾'}</span>
              {feaBearing && <span onClick={() => useApp.setState({ feaBearing: null })} style={{ cursor: 'pointer', color: '#cc6666' }} title="清除轴承载荷孔">✕</span>}
            </label>
          )}
          {feaLoadMode === 'pressure' ? (
            <label>
              <span style={{ color: '#6b7680' }}>压力</span>
              <span><input type="number" min={0.001} step={0.5} value={feaPressure} onChange={(e) => setFeaOpt({ feaPressure: Math.abs(Number(e.target.value)) || 1 })} style={{ width: 66 }} /> MPa（沿受力面法向均布）</span>
            </label>
          ) : (
            <label>
              <span style={{ color: '#6b7680' }}>力</span>
              <span><input type="number" min={0.1} step={10} value={feaForceN} onChange={(e) => setFeaOpt({ feaForceN: Math.abs(Number(e.target.value)) || 50 })} style={{ width: 66 }} /> N</span>
            </label>
          )}
          {feaLoadMode !== 'pressure' && (
          <label>
            <span style={{ color: '#6b7680' }}>方向</span>
            <select value={feaDir} onChange={(e) => setFeaOpt({ feaDir: e.target.value as 'down' | 'normal' | 'custom' })}>
              <option value="down">竖直向下（重力向）</option>
              <option value="normal">{feaLoadMode === 'bearing' ? '（轴承不适用 → 退向下）' : '压向受力面'}</option>
              <option value="custom">自定向量</option>
            </select>
          </label>
          )}
          {feaLoadMode !== 'pressure' && feaDir === 'custom' && (
            <label>
              <span style={{ color: '#6b7680' }}>向量</span>
              <span>
                {([0, 1, 2] as const).map((k) => (
                  <input key={k} type="number" step={1} value={feaCustomDir[k]} title={['X', 'Y', 'Z（上）'][k]} onChange={(e) => { const d = [...feaCustomDir] as [number, number, number]; d[k] = Number(e.target.value) || 0; setFeaOpt({ feaCustomDir: d }) }} style={{ width: 38 }} />
                ))}
              </span>
            </label>
          )}
          {feaLoadMode !== 'pressure' && (() => {
            const d = feaDir === 'custom' ? feaCustomDir : ([0, 0, -1] as [number, number, number])
            const ang = Math.round(Math.atan2(d[0], -d[2]) * 180 / Math.PI) || 0
            return (
              <label title="快速微调受力角度：0=竖直向下，±90=水平推。橙箭头实时跟住转。要任意 3D 方向用上面「自定向量」。">
                <span style={{ color: '#6b7680' }}>倾角</span>
                <input type="range" min={-90} max={90} step={5} value={ang}
                  onChange={(e) => { const t = Number(e.target.value) * Math.PI / 180; setFeaOpt({ feaDir: 'custom', feaCustomDir: [Number(Math.sin(t).toFixed(4)), 0, Number((-Math.cos(t)).toFixed(4))] }) }}
                  style={{ width: 84, verticalAlign: 'middle' }} />
                <span style={{ fontSize: 10, color: '#8a97a2', minWidth: 26, display: 'inline-block' }}>{ang}°</span>
              </label>
            )
          })()}
          <label>
            <span style={{ color: '#6b7680' }}>材料</span>
            <select value={feaMat} onChange={(e) => setFeaOpt({ feaMat: e.target.value })}>
              {Object.keys(MATERIAL_MECH).map((m) => <option key={m} value={m}>{m}（屈服 {MATERIAL_MECH[m].sy}MPa）</option>)}
            </select>
          </label>
          <label>
            <span style={{ color: '#6b7680' }}>分辨率</span>
            <select value={feaRes} onChange={(e) => setFeaOpt({ feaRes: Number(e.target.value) })}>
              <option value={20}>粗（快）</option>
              <option value={28}>中</option>
              <option value={40}>细（慢，几十秒）</option>
            </select>
          </label>
          {lowPower && <div style={{ fontSize: 10.5, color: '#2f9e44', margin: '2px 0 4px' }}>📱 已为你设备（手机/弱机）调低预设，本机计算唔卡；可手动拣细啲（会慢）</div>}
          {feaResult && (
            <div style={{ fontSize: 11, lineHeight: 1.5 }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                {(['vm', 'disp', 'vmSmooth', 'sf', 'fos', 's1', 's3', 'shear', 'sed'] as const).filter((k) => (k === 's1' || k === 's3' || k === 'shear') ? !!feaResult.s1 : k === 'sed' ? !!feaResult.sed : true).map((k) => (
                  <button key={k} type="button" onClick={() => useApp.getState().setFeaOpt({ feaField: k })} title={k === 'vm' ? 'von Mises 应力云图（边度最受力·原始体素）' : k === 'disp' ? '位移云图（边度变形最大）' : k === 'vmSmooth' ? '平滑应力云图（节点平均·去体素阶梯；诚实：非真 SPR）' : k === 'sf' ? '安全系数云图（红=SF 低=最危险；封顶 SF≥5）' : k === 'fos' ? '疲劳安全系数（modified-Goodman；红=低=最易疲劳断；需选工况 R）' : k === 's1' ? 'σ1 最大主应力（拉为正·脆性材料/裂纹起点；红=最拉）' : k === 's3' ? 'σ3 最小主应力（压为负；红=最压）' : k === 'shear' ? 'τmax 最大剪应力 (σ1−σ3)/2（Tresca·延性屈服/剪切破坏）' : '应变能密度 u=½σ:ε（能量集中位 = 受力关键区/减重保留区·拓扑优化直觉）'}
                    style={{ flex: 1, padding: '2px 4px', fontSize: 11, borderRadius: 3, cursor: 'pointer', border: feaField === k ? '1px solid #4a9eff' : '1px solid #3a3e44', background: feaField === k ? '#1e3a5f' : '#23272d', color: '#d8dde2' }}>
                    {k === 'vm' ? '应力' : k === 'disp' ? '位移' : k === 'vmSmooth' ? '平滑' : k === 'sf' ? '安全' : k === 'fos' ? '疲劳' : k === 's1' ? 'σ1' : k === 's3' ? 'σ3' : k === 'shear' ? 'τ' : '能'}</button>
                ))}
              </div>
              {/* S183：疲劳工况选择（仅疲劳场）— 静态单次解无载荷循环，必须明示工况 R，否则误导。默认脉动 R=0（保守）。 */}
              {feaField === 'fos' && (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ color: '#6b7680', fontSize: 10 }}>工况</span>
                  {([['rev', 'R=−1 全反向'], ['puls', 'R=0 脉动'], ['static', '静态等效']] as const).map(([v, lab]) => (
                    <button key={v} type="button" onClick={() => useApp.getState().setFeaOpt({ feaFatigueCase: v })}
                      title={v === 'rev' ? '全反向 R=−1：σa=σvm, σm=0（旋转弯曲/振动）' : v === 'puls' ? '脉动 R=0：σa=σm=σvm/2（保守默认·开关载荷）' : '静态等效：σm≈(σ1+σ3)/2 均值, σa=σvm'}
                      style={{ flex: 1, padding: '2px 3px', fontSize: 10, borderRadius: 3, cursor: 'pointer', border: fatigueCase === v ? '1px solid #4a9eff' : '1px solid #3a3e44', background: fatigueCase === v ? '#1e3a5f' : '#23272d', color: '#d8dde2' }}>{lab}</button>
                  ))}
                </div>
              )}
              {/* S168：变形形态 — 显示真实位移方向（放大示意）+ 动画摆动 + 放大系数滑杆。旧结果无 dispVec → 唔显此行。 */}
              {feaResult.dispVec && (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                  <button type="button" onClick={() => useApp.getState().setFeaOpt({ feaDeform: { ...feaDeform, show: !feaDeform.show } })}
                    title="显示变形形态（沿真实位移向量放大示意；真实位移幅值见下方 mm）"
                    style={{ padding: '2px 6px', fontSize: 11, borderRadius: 3, cursor: 'pointer', border: feaDeform.show ? '1px solid #4a9eff' : '1px solid #3a3e44', background: feaDeform.show ? '#1e3a5f' : '#23272d', color: '#d8dde2' }}>变形</button>
                  <button type="button" disabled={!feaDeform.show} onClick={() => useApp.getState().setFeaOpt({ feaDeform: { ...feaDeform, anim: !feaDeform.anim } })}
                    title="变形动画摆动（由原位 → 满幅变形 → 返原位 循环）"
                    style={{ padding: '2px 6px', fontSize: 11, borderRadius: 3, cursor: feaDeform.show ? 'pointer' : 'default', opacity: feaDeform.show ? 1 : 0.4, border: feaDeform.anim ? '1px solid #4a9eff' : '1px solid #3a3e44', background: feaDeform.anim ? '#1e3a5f' : '#23272d', color: '#d8dde2' }}>动画</button>
                  {feaDeform.real
                    ? <button type="button" disabled={!feaDeform.show} title="而家系【实尺 1:1】：model 上睇到嘅就系真实计算位移（5N/500N 会唔同）。变形太细睇唔到？撳呢度放大睇形状（放大后仍按真实比例，换力大细照样唔同）"
                        onClick={() => { const r = feaResult; if (!r) return; let a = Infinity, b = Infinity, c = Infinity, d = -Infinity, e = -Infinity, f = -Infinity; for (let i = 0; i < r.nVox; i++) { const x = r.centers[i * 3], y = r.centers[i * 3 + 1], z = r.centers[i * 3 + 2]; if (x < a) a = x; if (y < b) b = y; if (z < c) c = z; if (x > d) d = x; if (y > e) e = y; if (z > f) f = z } const ext = Math.max(d - a, e - b, f - c, r.h); const mag = r.dispMax > 1e-12 ? 0.14 * ext / r.dispMax : 1; useApp.getState().setFeaOpt({ feaDeform: { ...feaDeform, real: false, mag, scale: 1 } }) }}
                        style={{ padding: '2px 6px', fontSize: 11, borderRadius: 3, cursor: feaDeform.show ? 'pointer' : 'default', opacity: feaDeform.show ? 1 : 0.4, border: '1px solid #16a36b', background: '#16341f', color: '#7ee0a8', fontWeight: 600 }}>🔍放大睇清楚</button>
                    : <button type="button" disabled={!feaDeform.show} title="而家系【放大示意】：放大咗睇形状，但仍按真实比例（力大变形大、5N/500N 会唔同）。撳呢度返实尺 1:1（真实 mm）"
                        onClick={() => useApp.getState().setFeaOpt({ feaDeform: { ...feaDeform, real: true, scale: 1 } })}
                        style={{ padding: '2px 6px', fontSize: 11, borderRadius: 3, cursor: feaDeform.show ? 'pointer' : 'default', opacity: feaDeform.show ? 1 : 0.4, border: '1px solid #c77d00', background: '#3a2e10', color: '#e0b050', fontWeight: 600 }}>↺实尺1:1</button>}
                  <span style={{ color: '#6b7680', fontSize: 10, minWidth: 30 }}>×{feaDeform.scale.toFixed(1)}</span>
                  <input type="range" min={feaDeform.real ? 0.5 : 0.2} max={5} step={0.1} value={feaDeform.scale} disabled={!feaDeform.show}
                    onChange={(e) => useApp.getState().setFeaOpt({ feaDeform: { ...feaDeform, scale: parseFloat(e.target.value) } })}
                    title={feaDeform.real ? '真实变形倍率（1.0 = 实尺 1:1；调大 = 适度夸张睇清楚，仍按真实比例）' : '微调倍率（叠喺放大增益上；放大后仍按真实比例，换力大细照样唔同）'}
                    style={{ flex: 1, opacity: feaDeform.show ? 1 : 0.4 }} />
                </div>
              )}
              {/* S102[2]：SF/疲劳 模式 legend 反转（红=低 SF 在左=危险） */}
              <div style={{ height: 10, borderRadius: 3, background: (feaField === 'sf' || feaField === 'fos') ? 'linear-gradient(90deg,#7a0403,#fb7e21,#a4fc3c,#28bceb,#30123b)' : 'linear-gradient(90deg,#30123b,#28bceb,#a4fc3c,#fb7e21,#7a0403)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7680' }}>
                {feaField === 'sf'
                  ? (<><span>0 (危)</span><span>安全系数 SF=σy/σ</span><span>SF≥5 (安)</span></>)
                  : feaField === 'fos'
                  ? (<><span>0 (危)</span><span>疲劳安全系数 n (Goodman)</span><span>n≥5 (安)</span></>)
                  : (() => {
                      const mxVal = feaField === 'disp' ? feaResult.dispMax
                        : feaField === 'vmSmooth' ? (feaResult.vmSmoothMax ?? feaResult.vmMax)
                        : feaField === 's1' ? Math.max(feaResult.s1Max ?? feaResult.vmMax, 0)
                        : feaField === 's3' ? Math.abs(feaResult.s3Min ?? 0)
                        : feaField === 'shear' ? (feaResult.shearMax ?? feaResult.vmMax)
                        : feaField === 'sed' ? (feaResult.sedMax ?? 0)
                        : feaResult.vmMax
                      const label = feaField === 'disp' ? '位移 (mm)' : feaField === 'vmSmooth' ? 'von Mises 平滑 (MPa)'
                        : feaField === 's1' ? 'σ1 最大主应力·拉 (MPa)' : feaField === 's3' ? 'σ3 最小主应力·压幅值 (MPa)'
                        : feaField === 'shear' ? 'τmax 最大剪应力 (MPa)' : feaField === 'sed' ? '应变能密度 u (mJ/mm³)' : 'von Mises (MPa)'
                      const maxStr = feaField === 'sed' ? mxVal.toExponential(2) : feaField === 'disp' ? (mxVal >= 1 ? mxVal.toFixed(2) : mxVal.toFixed(3)) : (mxVal >= 100 ? mxVal.toFixed(0) : mxVal.toFixed(1))
                      return (<><span>0</span><span>{label}</span><span>{maxStr}</span></>)
                    })()}
              </div>
              {feaField === 'sf' && <div style={{ color: '#6b7680', marginTop: 2 }}>全场最低安全系数 SF ≈ {(feaResult.sy / Math.max(feaResult.vmMax, 1e-9)).toFixed(2)}（红球位）· 体素趋势级</div>}
              {feaField === 'fos' && (() => {
                const se = feaResult.se || feaResult.sy || 1, su = feaResult.su || (feaResult.sy ? feaResult.sy * 1.6 : 1)
                // S183 audit(MED)：扫整场算真·最低 n（同 overlay 逐体素公式一致）—— 唔可净用 vmMax 推（static 工况 σm=(σ1+σ3)/2 唔喺 vmMax 体素取极小），否则 headline 同色图/探针唔夹。
                const vm = feaResult.vm, s1 = feaResult.s1, s3 = feaResult.s3
                let nMin = 5
                for (let i = 0; i < feaResult.nVox; i++) {
                  const v = vm[i]
                  let sa: number, sm: number
                  if (fatigueCase === 'rev') { sa = v; sm = 0 }
                  else if (fatigueCase === 'static') { sm = (s1 && s3) ? (s1[i] + s3[i]) / 2 : 0; sa = v }
                  else { sa = v / 2; sm = v / 2 }
                  const denom = sa / se + Math.max(0, sm) / su
                  const nF = denom > 1e-12 ? 1 / denom : 5
                  if (nF < nMin) nMin = nF
                }
                const caseLab = fatigueCase === 'rev' ? 'R=−1 全反向' : fatigueCase === 'static' ? '静态等效' : 'R=0 脉动'
                return <div style={{ color: '#6b7680', marginTop: 2 }}>最低疲劳安全系数 n ≈ {Math.min(5, nMin).toFixed(2)}（{caseLab}·se={se}/su={su}MPa）· 单次静力解推算载荷循环（非真疲劳寿命）· 体素趋势级</div>
              })()}
              {(feaField === 's1' || feaField === 's3' || feaField === 'shear') && feaResult.s1Max != null && (
                <div style={{ color: '#6b7680', marginTop: 2 }}>σ1max ≈ {feaResult.s1Max.toFixed(1)}（拉+）· σ3min ≈ {(feaResult.s3Min ?? 0).toFixed(1)}（压−）· τmax ≈ {(feaResult.shearMax ?? 0).toFixed(1)} MPa · 主应力·体素趋势级</div>
              )}
              <div style={{ color: '#6b7680' }}>
                最大位移 {feaResult.dispMax >= 1 ? feaResult.dispMax.toFixed(2) : feaResult.dispMax.toFixed(3)}mm · {feaResult.nVox} 体素{feaResult.converged ? '' : ' · ⚠未完全收敛'}
                {feaDeform.show && feaResult.dispVec && (feaDeform.real
                  ? <span style={{ color: '#16a36b' }}> · 变形 = 实尺 1:1{feaDeform.scale !== 1 ? `（×${feaDeform.scale.toFixed(1)}）` : ''}：model 上睇到嘅就系真实计算位移（力大变形大）</span>
                  : <span style={{ color: '#c77d00' }}> · 变形 = 放大 ×{(feaDeform.mag * feaDeform.scale).toFixed(0)}（按真实比例：力大变形大、5N/500N 唔同；撳「实尺1:1」睇真实 mm）</span>)}
              </div>
              {/* S170：结果探针 — 开后点 3D 云图任一体素，读其精确场值（Fusion Probe） */}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
                <button type="button" onClick={() => { const on = !feaProbeOn; useApp.getState().setFeaOpt({ feaProbeOn: on, feaProbe: on ? feaProbe : null }) }}
                  title="结果探针：开后喺 3D 云图点任一体素，读其精确场值（von Mises / 位移 / SF / 主应力 / 应变能 + 位置）。关时云图唔拦截点击。"
                  style={{ padding: '2px 6px', fontSize: 11, borderRadius: 3, cursor: 'pointer', border: feaProbeOn ? '1px solid #4a9eff' : '1px solid #3a3e44', background: feaProbeOn ? '#1e3a5f' : '#23272d', color: '#d8dde2' }}>📍 探针{feaProbeOn ? '（开·点体素读值）' : ''}</button>
                {feaProbe != null && <button type="button" onClick={() => useApp.getState().setFeaOpt({ feaProbe: null })} title="清除探针读数" style={{ padding: '2px 6px', fontSize: 11, borderRadius: 3, cursor: 'pointer', border: '1px solid #3a3e44', background: '#23272d', color: '#9aa6af' }}>清</button>}
                {feaProbeOn && feaResult.nVox > 40000 && <span style={{ color: '#c77d00', fontSize: 10 }}>体素 {feaResult.nVox} &gt; 4万，探针已禁用（降分辨率再用）</span>}
              </div>
              {feaProbe != null && feaProbe < feaResult.nVox && (() => {
                const i = feaProbe, c = feaResult.centers
                const pos = [c[i * 3], c[i * 3 + 1], c[i * 3 + 2]].map((v) => +v.toFixed(1)).join(', ')
                const vm = feaResult.vm[i], disp = feaResult.disp[i], sf = feaResult.sy / Math.max(vm, 1e-9)
                return (
                  <div style={{ color: '#cdd6df', marginTop: 2, background: '#1a2330', borderRadius: 3, padding: '3px 5px', lineHeight: 1.55 }}>
                    体素 #{i} @ ({pos})<br />
                    vm = {vm >= 100 ? vm.toFixed(0) : vm.toFixed(2)} MPa · 位移 = {disp >= 1 ? disp.toFixed(3) : disp.toFixed(4)} mm · SF ≈ {sf === Infinity ? '∞' : sf.toFixed(2)}
                    {feaField === 'fos' && (() => {
                      const se = feaResult.se || feaResult.sy || 1, su = feaResult.su || (feaResult.sy ? feaResult.sy * 1.6 : 1)
                      const sa = fatigueCase === 'rev' ? vm : fatigueCase === 'static' ? vm : vm / 2
                      const sm = fatigueCase === 'rev' ? 0 : fatigueCase === 'static' ? (feaResult.s1 ? (feaResult.s1[i] + (feaResult.s3 as Float32Array)[i]) / 2 : 0) : vm / 2
                      const denom = sa / se + Math.max(0, sm) / su
                      const nF = denom > 1e-12 ? 1 / denom : 5
                      return <> · 疲劳 n ≈ {Math.min(5, nF).toFixed(2)}</>
                    })()}
                    {feaResult.s1 && <><br />σ1 = {feaResult.s1[i].toFixed(2)} · σ3 = {(feaResult.s3 as Float32Array)[i].toFixed(2)} · τ = {(feaResult.shear as Float32Array)[i].toFixed(2)} MPa</>}
                    {feaResult.sed && <> · u = {feaResult.sed[i].toExponential(2)} mJ/mm³</>}
                  </div>
                )
              })()}
              {feaResult.reactionMag != null && (
                <div style={{ color: '#6b7680' }} title="支座反力 = 固定面 (K·u − 该面外载) + 销/圆柱约束反力之和。固定支承下 −∑R 应 ≈ 外加载荷总和（可作平衡校验，偏差多因体素离散/未收敛）。滚子/对称约束只锁法向 → ∑R 只含法向分量，非总载荷。">
                  支座反力{feaFixMode !== 'fixed' ? '（仅法向）' : ''} ∑R ≈ {feaResult.reactionMag >= 1 ? feaResult.reactionMag.toFixed(1) : feaResult.reactionMag.toFixed(3)} N
                  {feaResult.reaction && <span> （Rx {feaResult.reaction[0].toFixed(1)} · Ry {feaResult.reaction[1].toFixed(1)} · Rz {feaResult.reaction[2].toFixed(1)}）</span>}
                </div>
              )}
              <div style={{ color: feaResult.sy / Math.max(feaResult.vmMax, 1e-9) >= 2 ? '#16a36b' : feaResult.sy / Math.max(feaResult.vmMax, 1e-9) >= 1 ? '#c77d00' : '#d0342c', fontWeight: 600 }}>
                安全系数 ≈ {(feaResult.sy / Math.max(feaResult.vmMax, 1e-9)).toFixed(1)}（{feaResult.matName} 屈服 {feaResult.sy}MPa）— {feaField === 'disp' ? '红球 = 挠度最大位（弯得最劲；切「应力」睇最可能断位）' : '红球⚠ = 最可能断嘅位'}
              </div>
            </div>
          )}
          {/* S80：模态分析（固有频率）— 只需固定面，振型动画放大示意 */}
          <div style={{ borderTop: '1px solid #2a2e33', marginTop: 4, paddingTop: 6 }}>
            <button
              type="button"
              disabled={modalBusy || feaBusy || !feaFixed}
              title={feaFixed ? '用固定面做约束模态，求最低 6 阶固有频率（Hz）' : '先点①固定面'}
              onClick={() => void runModalSolve()}
              style={{ width: '100%', padding: '5px 8px', fontSize: 12, cursor: (modalBusy || !feaFixed) ? 'default' : 'pointer', opacity: (modalBusy || !feaFixed) ? 0.5 : 1 }}
            >
              {modalBusy ? '模态计算中…' : '🎵 模态分析（固有频率）'}
            </button>
            {modalResult && (
              <div style={{ fontSize: 11, lineHeight: 1.5, marginTop: 5 }}>
                <div style={{ color: '#6b7680', marginBottom: 3 }}>
                  约束模态 · {modalResult.matName} · {modalResult.nVox} 体素 — 点选阶睇振型动画：
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {modalResult.freqs.map((f, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => useApp.getState().setModalShow(i)}
                      title={modalResult.converged[i] ? '' : '该阶未完全收敛（近似值）'}
                      style={{
                        padding: '2px 6px', fontSize: 11, borderRadius: 3, cursor: 'pointer',
                        border: i === modalShow ? '1px solid #4a9eff' : '1px solid #3a3e44',
                        background: i === modalShow ? '#1e3a5f' : '#23272d', color: '#d8dde2',
                      }}
                    >
                      f{i + 1} {f >= 1000 ? (f / 1000).toFixed(2) + 'k' : f.toFixed(0)}Hz{modalResult.converged[i] ? '' : '*'}
                    </button>
                  ))}
                </div>
                <div style={{ color: '#6b7680', marginTop: 4 }}>
                  频率为体素趋势级（实测悬臂梁误差 ≈±2%，非商用 FEA）· 振幅系视觉放大示意，唔系真实位移
                </div>
              </div>
            )}
          </div>
          {/* S82：线性屈曲分析 — 同静力一样需固定面 + 受力面 + 力 */}
          <div style={{ borderTop: '1px solid #2a2e33', marginTop: 4, paddingTop: 6 }}>
            <button
              type="button"
              disabled={bucklingBusy || feaBusy || modalBusy || !feaFixed || !feaLoad}
              title={(feaFixed && feaLoad) ? '用固定面+受力面+力做线性屈曲，求最低屈曲载荷因子 λ₁ 与临界载荷 Pcr' : '先点①固定面 + ②受力面'}
              onClick={() => void runBucklingSolve()}
              style={{ width: '100%', padding: '5px 8px', fontSize: 12, cursor: (bucklingBusy || !feaFixed || !feaLoad) ? 'default' : 'pointer', opacity: (bucklingBusy || !feaFixed || !feaLoad) ? 0.5 : 1 }}
            >
              {bucklingBusy ? '屈曲计算中…' : '📐 屈曲分析（临界载荷）'}
            </button>
            {bucklingResult && (
              <div style={{ fontSize: 11, lineHeight: 1.5, marginTop: 5 }}>
                <div style={{ color: bucklingResult.lambda1 <= 0 ? '#c77d00' : bucklingResult.lambda1 >= 2 ? '#16a36b' : bucklingResult.lambda1 >= 1 ? '#c77d00' : '#d0342c', fontWeight: 600 }}>
                  屈曲载荷因子 λ₁ ≈ {bucklingResult.lambda1 <= 0 ? '—（该方向唔屈曲）' : bucklingResult.lambda1.toFixed(2)}
                </div>
                {bucklingResult.lambda1 > 0 && (
                  <div style={{ color: '#6b7680' }}>
                    临界载荷 Pcr ≈ {bucklingResult.Pcr >= 1000 ? (bucklingResult.Pcr / 1000).toFixed(1) + 'kN' : bucklingResult.Pcr.toFixed(0) + 'N'}（施加 {bucklingResult.forceN >= 1000 ? (bucklingResult.forceN / 1000).toFixed(1) + 'kN' : bucklingResult.forceN.toFixed(0) + 'N'}）· {bucklingResult.nVox} 体素{bucklingResult.converged ? '' : ' · ⚠未完全收敛'}
                  </div>
                )}
                <div style={{ color: '#6b7680', marginTop: 2 }}>
                  动画 = 第一屈曲振型（放大示意）· 体素趋势级（实测 Euler 柱误差 ≈±2%，非商用 FEA）
                </div>
              </div>
            )}
            {/* S183：预应力（应力刚化）模态 — 同屈曲一样需固定面 + 预载面 + 力；频率随预载偏移（拉升压降），结果走模态振型渲染 */}
            <button
              type="button"
              disabled={bucklingBusy || feaBusy || modalBusy || !feaFixed || !feaLoad}
              title={(feaFixed && feaLoad) ? '预应力模态：先静力加预载（拉/压）→ 切线刚度 (K+Kg) 算固有频率。受拉↑刚化升频、受压↓软化降频、近屈曲→0。复用模态振型动画。' : '先点①固定面 + ②预载面 + 设力'}
              onClick={() => void runPrestressedModalSolve()}
              style={{ width: '100%', padding: '5px 8px', fontSize: 12, marginTop: 6, cursor: (modalBusy || !feaFixed || !feaLoad) ? 'default' : 'pointer', opacity: (modalBusy || !feaFixed || !feaLoad) ? 0.5 : 1 }}
            >
              {modalBusy ? '模态计算中…' : '🎚️ 预应力模态（应力刚化）'}
            </button>
          </div>
          {/* S83：生成式设计 / 拓扑优化 — 固定面=保留区，受力面+力=工况 */}
          <div style={{ borderTop: '1px solid #2a2e33', marginTop: 4, paddingTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: '#6b7680' }}>保留体积</span>
              <input type="range" min={10} max={70} step={5} value={Math.round(topoptVolfrac * 100)} disabled={topoptBusy} onChange={(e) => useApp.getState().setTopoptVolfrac(Number(e.target.value) / 100)} style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: '#aab', width: 30 }}>{Math.round(topoptVolfrac * 100)}%</span>
            </div>
            <button
              type="button"
              disabled={topoptBusy || feaBusy || modalBusy || bucklingBusy || !feaFixed || !feaLoad}
              title={(feaFixed && feaLoad) ? '生成式设计：喺设计域内最小柔度分配材料（保留固定/受力区），长出最省料又最硬嘅承力结构' : '先点①固定面 + ②受力面 + 设力'}
              onClick={() => void runTopoptSolve()}
              style={{ width: '100%', padding: '5px 8px', fontSize: 12, cursor: (topoptBusy || !feaFixed || !feaLoad) ? 'default' : 'pointer', opacity: (topoptBusy || !feaFixed || !feaLoad) ? 0.5 : 1 }}
            >
              {topoptBusy ? '生成中…（多次求解，需时）' : '🧬 生成式设计（拓扑优化）'}
            </button>
            {topoptResult && (() => {
              const ch = topoptResult.complianceHistory
              const gain = (ch.length && ch[ch.length - 1] > 1e-9) ? ch[0] / ch[ch.length - 1] : 1
              return (
                <div style={{ fontSize: 11, lineHeight: 1.5, marginTop: 5 }}>
                  <div style={{ color: '#16a36b', fontWeight: 600 }}>刚度 ↑{gain.toFixed(1)}×（同体积下）</div>
                  <div style={{ color: '#6b7680' }}>
                    柔度 {ch[0].toFixed(0)} → {ch[ch.length - 1].toFixed(0)} · 实际体积 {(topoptResult.finalVol * 100).toFixed(0)}% · {topoptResult.nVox} 体素
                  </div>
                  <div style={{ color: '#6b7680', marginTop: 2 }}>
                    红=承力料路（保留）· 蓝/透明=可去料 · 体素趋势级（最小柔度），非商用 FEA
                  </div>
                  <button className="cs-btn" style={{ marginTop: 4 }} title="把保留材料导出 STL（体素边界面；对角细节处可能非流形，多数切片器可处理）— 可 3D 打印 / 重导入再光顺" onClick={() => useApp.getState().exportGenerativeStl()}>⤓ 导出生成式 STL</button>
                </div>
              )
            })()}
          </div>
          {/* S84：热分析（稳态导热）— ① 面=热面、② 面=冷面，材料导热系数 */}
          <div style={{ borderTop: '1px solid #2a2e33', marginTop: 4, paddingTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 11, color: '#6b7680' }}>
              <span>热①</span><input type="number" step={5} value={thermalThot} disabled={thermalBusy} onChange={(e) => useApp.getState().setThermalTemps({ Thot: Number(e.target.value) })} style={{ width: 48 }} />
              <span>冷②</span><input type="number" step={5} value={thermalTcold} disabled={thermalBusy} onChange={(e) => useApp.getState().setThermalTemps({ Tcold: Number(e.target.value) })} style={{ width: 48 }} /><span>°C</span>
            </div>
            <button
              type="button"
              disabled={thermalBusy || feaBusy || modalBusy || bucklingBusy || topoptBusy || !feaFixed || !feaLoad}
              title={(feaFixed && feaLoad) ? '稳态导热：① 固定面 = 热面、② 受力面 = 冷面，按材料导热系数求温度场 + 总热流 Q' : '先点①固定面(=热面) + ②受力面(=冷面)'}
              onClick={() => void runThermalSolve()}
              style={{ width: '100%', padding: '5px 8px', fontSize: 12, cursor: (thermalBusy || !feaFixed || !feaLoad) ? 'default' : 'pointer', opacity: (thermalBusy || !feaFixed || !feaLoad) ? 0.5 : 1 }}
            >
              {thermalBusy ? '热分析计算中…' : '🌡 热分析（稳态导热）'}
            </button>
            {thermalResult && (
              <div style={{ fontSize: 11, lineHeight: 1.5, marginTop: 5 }}>
                <div style={{ height: 10, borderRadius: 3, background: 'linear-gradient(90deg,#30123b,#28bceb,#a4fc3c,#fb7e21,#7a0403)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7680' }}>
                  <span>{thermalResult.tMin.toFixed(0)}°C</span><span>温度（{thermalResult.matName} k={thermalResult.k}）</span><span>{thermalResult.tMax.toFixed(0)}°C</span>
                </div>
                <div style={{ color: '#6b7680' }}>
                  总热流 Q ≈ {thermalResult.heatFlowW >= 1000 ? (thermalResult.heatFlowW / 1000).toFixed(2) + 'kW' : thermalResult.heatFlowW.toFixed(1) + 'W'} · {thermalResult.nVox} 体素{thermalResult.converged ? '' : ' · ⚠未完全收敛'}
                </div>
                <div style={{ color: '#6b7680', marginTop: 2 }}>稳态导热趋势级（温度场精确，截面体素化致 Q ±~10%），非商用 FEA</div>
              </div>
            )}
          </div>
          {/* S105：热-结构耦合（约束热膨胀应力）— ①②两面都做夹持 + 分别热/冷定温 → 约束热膨胀 von Mises 场（复用受力云图） */}
          <div style={{ borderTop: '1px solid #2a2e33', marginTop: 4, paddingTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 11, color: '#6b7680' }}>
              <span>参考温</span><input type="number" step={5} value={thermalTref} disabled={thermalStressBusy} onChange={(e) => useApp.setState({ thermalTref: Number(e.target.value) })} style={{ width: 48 }} /><span>°C（无应力态）</span>
            </div>
            <button
              type="button"
              disabled={thermalStressBusy || thermalBusy || feaBusy || modalBusy || bucklingBusy || topoptBusy || !feaFixed || !feaLoad}
              title={(feaFixed && feaLoad) ? '约束热膨胀应力：①②两面都全 DOF 夹持，同时分别做热/冷定温面（热①用热温、冷②用冷温），温差→热应变 ε₀=αΔT→σ=D(Bu−ε₀)。双端夹住嘅杆受热→憋住唔俾胀→真 von Mises 应力场' : '先点①固定面(=夹持+热面) + ②受力面(=夹持+冷面)'}
              onClick={() => void runThermalStressSolve()}
              style={{ width: '100%', padding: '5px 8px', fontSize: 12, cursor: (thermalStressBusy || !feaFixed || !feaLoad) ? 'default' : 'pointer', opacity: (thermalStressBusy || !feaFixed || !feaLoad) ? 0.5 : 1 }}
            >
              {thermalStressBusy ? '热应力FEM计算中…' : '🔥 热应力 FEM（约束热膨胀）'}
            </button>
            <div style={{ color: '#6b7680', fontSize: 10, marginTop: 3 }}>双端夹持 + 温差（热①/冷②/参考温），σ=D(Bu−αΔT) 线弹性体素趋势，结果显示于上方受力云图</div>
          </div>
          {/* S101[6]：网格收敛研究 — 同模型同载荷跑 3 档体素分辨率(20/28/40)，看 vmMax 趋稳 + Richardson 外推 */}
          <div style={{ borderTop: '1px solid #2a2e33', marginTop: 4, paddingTop: 6 }}>
            {/* S171 audit（HIGH）：轴承模式载荷系 feaBearing（feaLoad 已清）→ 门控按模式判载荷就绪，否则收敛研究喺轴承模式永远 disabled */}
            <button type="button"
              disabled={feaConvBusy || feaBusy || modalBusy || bucklingBusy || topoptBusy || thermalBusy || !feaFixed || (feaLoadMode === 'bearing' ? !feaBearing : !feaLoad)}
              title={(feaFixed && (feaLoadMode === 'bearing' ? feaBearing : feaLoad)) ? '同模型同载荷跑 3 档体素分辨率(20/28/40)，看 vmMax 是否趋稳 + 外推收敛值（网格无关性）' : (feaLoadMode === 'bearing' ? '先点①固定面 + 🎯拾轴承孔' : '先点①固定面 + ②受力面')}
              onClick={() => void runFeaConvergence()}
              className="cs-btn"
              style={{ width: '100%', opacity: (feaConvBusy || !feaFixed || (feaLoadMode === 'bearing' ? !feaBearing : !feaLoad)) ? 0.5 : 1 }}>
              {feaConvBusy ? '收敛研究中…（跑 3 档，需时）' : '📈 收敛研究（网格无关性）'}
            </button>
            {feaConvResult && (() => {
              const rows = feaConvResult.rows
              const vms = rows.map((r) => r.vmMax), maxVm = Math.max(...vms, feaConvResult.vmInf, 1e-9)
              const W = 240, H = 70, PX = 6, PY = 8
              const xs = rows.map((_, i) => PX + i * (W - 2 * PX) / Math.max(1, rows.length - 1))
              const ys = vms.map((v) => H - PY - (v / maxVm) * (H - 2 * PY))
              const yInf = H - PY - (feaConvResult.vmInf / maxVm) * (H - 2 * PY)
              return (<div style={{ fontSize: 11, lineHeight: 1.5, marginTop: 5 }}>
                <svg width={W} height={H} style={{ background: '#1a1d21', borderRadius: 3 }}>
                  <line x1={PX} y1={yInf} x2={W - PX} y2={yInf} stroke="#16a36b" strokeDasharray="3 3" strokeWidth={1} />
                  <polyline points={xs.map((x, i) => `${x.toFixed(0)},${ys[i].toFixed(0)}`).join(' ')} fill="none" stroke="#4a9eff" strokeWidth={1.5} />
                  {xs.map((x, i) => <circle key={i} cx={x} cy={ys[i]} r={2.5} fill={rows[i].converged ? '#4a9eff' : '#c77d00'} />)}
                </svg>
                <div style={{ color: '#6b7680' }}>{rows.map((r) => `${r.res}档 ${r.nDof}DOF→${r.vmMax.toFixed(1)}MPa${r.converged ? '' : '*'}`).join(' · ')}</div>
                <div style={{ color: feaConvResult.settled ? '#16a36b' : '#c77d00', fontWeight: 600 }}>
                  相邻末档差 {(feaConvResult.relLast * 100).toFixed(1)}% · 外推 vmMax ≈ {feaConvResult.vmInf.toFixed(1)} MPa · {feaConvResult.settled ? '✅ 网格已收敛' : '⚠ 未收敛，建议加密'}
                </div>
                <div style={{ color: '#6b7680', marginTop: 2 }}>绿虚线=外推值 · 橙点=该档未完全收敛 · 体素趋势级（非商用 FEA）</div>
              </div>)
            })()}
          </div>
          {(feaResult || modalResult || bucklingResult || topoptResult || thermalResult) && (
            <button className="cs-btn" style={{ marginTop: 6, width: '100%' }} title="把已运行嘅 静力/模态/屈曲/热/生成式 结果汇总导出 .txt 报告（对标 Fusion Simulation 研究报告）" onClick={() => useApp.getState().exportSimReport()}>📄 导出仿真报告（.txt）</button>
          )}
          {feaResult && (
            <button className="cs-btn" style={{ marginTop: 4, width: '100%' }} title="导出当前应力结果做 CSV：摘要（材料/σy/vmMax/位移/SF/反力/收敛）+ 逐体素 x,y,z,vonMises,平滑vm,位移,σ1,σ3,τmax,应变能（spreadsheet 复核 / 跑对跑对比）" onClick={() => useApp.getState().exportFeaCsv()}>📊 导出 FEA 结果 CSV（逐体素）</button>
          )}
        </CommandDialog>
      )}

      {windResult && <WindLegend />}{/* 流场图例：边只色代表几多 m/s、白点系乜（用户报「冇解释」） */}
      {windModeP > 0 && <WindPoseCompare />}{/* S4：唔同朝向阻力对比（left:14 bottom:210，同 WindLegend 嘅 right 侧对称） */}
      {(windModeP > 0 || windBusy || windResult) && (
        <CommandDialog
          icon="moldflow"
          title="风洞 / 水洞（LBM 体素趋势）"
          width={290}
          okLabel={windBusy ? '计算中…' : windResult ? '重新运行' : '运行'}
          okDisabled={windBusy}
          okTip="把零件放入虚拟流道解流场 → 风阻系数 Cd + 阻力 + 流场（Enter）"
          onOk={() => void runWindSolve()}
          onCancel={() => useApp.getState().clearWind()}
          summary={<>{windFluid === 'water' ? '水' : '空气'} · {windSpeed} m/s · 趋势级 LBM（非商用 CFD）</>}
        >
          {windBusy && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9aa3ad', marginBottom: 3 }}>
                <span>⏳ {windProgNote || '计算中'}（流场迭代 · CPU 重）</span>
                <span>{Math.round(windProg * 100)}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: '#2a2e35', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.max(3, windProg * 100)}%`, background: 'linear-gradient(90deg,#28bceb,#4f9dff)', transition: 'width 0.15s linear' }} />
              </div>
            </div>
          )}
          <label>
            <span style={{ color: '#6b7680' }}>流体</span>
            <select value={windFluid} onChange={(e) => setWindOpt({ windFluid: e.target.value as 'air' | 'water' })}>
              <option value="air">空气（风阻）</option>
              <option value="water">水（水阻）</option>
            </select>
          </label>
          <label title="来流速度 m/s。10≈36 km/h、20≈72 km/h、30≈108 km/h">
            <span style={{ color: '#6b7680' }}>速度 {windSpeed} m/s（≈{(windSpeed * 3.6).toFixed(0)} km/h）</span>
            <input type="range" min={1} max={60} step={1} value={windSpeed} onChange={(e) => setWindOpt({ windSpeed: Number(e.target.value) })} style={{ width: 128, verticalAlign: 'middle' }} />
          </label>
          <label title="来流方向（沿包围盒主轴吹）。自动 = 最长轴（鼻尖迎风）">
            <span style={{ color: '#6b7680' }}>吹向</span>
            <select value={windAxis === null ? 'auto' : String(windAxis)} onChange={(e) => setWindOpt({ windAxis: e.target.value === 'auto' ? null : (Number(e.target.value) as 0 | 1 | 2) })}>
              <option value="auto">自动（最长轴）</option>
              <option value="0">X 轴</option>
              <option value="1">Y 轴</option>
              <option value="2">Z 轴</option>
            </select>
            <button type="button" onClick={() => setWindOpt({ windSign: windSign < 0 ? 1 : -1 })} title="反转来流方向" style={{ marginLeft: 4 }}>{windSign < 0 ? '−向' : '+向'}</button>
          </label>
          <label title="精细度（体素分辨率）：越高越准但越慢。24≈快趋势 / 36≈细 / 48≈最细（大件慎用）">
            <span style={{ color: '#6b7680' }}>精细度 {windRes}{windRes <= 24 ? '（快）' : windRes <= 36 ? '（细）' : '（最细·慢）'}</span>
            <input type="range" min={12} max={48} step={2} value={windRes} onChange={(e) => setWindOpt({ windRes: Number(e.target.value) })} style={{ width: 128, verticalAlign: 'middle' }} />
          </label>
          {lowPower && <div style={{ fontSize: 10.5, color: '#2f9e44', margin: '-2px 0 6px' }}>📱 已为你设备（手机/弱机）自动调低预设，本机计算唔卡；可手动拉高（会慢）</div>}
          <div style={{ display: 'flex', gap: 10, margin: '2px 0 6px', fontSize: 11, flexWrap: 'wrap', alignItems: 'center' }}>
            <label title="表面着色：Cp 压力系数（红=迎风高压 / 蓝=背风吸力）或 表面流速"><span style={{ color: '#6b7680' }}>着色 </span>
              <select value={windField} onChange={(e) => setWindOpt({ windField: e.target.value as 'cp' | 'speed' })} style={{ fontSize: 11 }}>
                <option value="cp">压力 Cp</option><option value="speed">表面流速</option>
              </select>
            </label>
            <label style={{ color: windShowFlow ? '#2f9e44' : '#6b7680' }}><input type="checkbox" checked={windShowFlow} onChange={(e) => setWindOpt({ windShowFlow: e.target.checked })} /> 流场</label>
            {/* S4：求解引擎。★ 预设一定係 CPU ★ —— GPU 求解器实测球体 Cd 高 2.0–2.2×（三个分辨率都一致 =
             *   常数系统增益，根因未查）。所以 GPU 只卖【可拖 + 相对比较】，绝对 Cd 由 CPU 出。 */}
            <label title="CPU＝压力积分＋经验摩擦，worker 跑完凍結，绝对 Cd 用呢个；GPU＝逐帧 LBM，可以拖住零件即时睇流场变化，但绝对 Cd 有未修嘅 2.0–2.2× 系统偏差，只可以睇【相对】比较">
              <span style={{ color: '#6b7680' }}>引擎 </span>
              <select value={windEngineP} onChange={(e) => setWindOpt({ windEngine: e.target.value as 'cpu' | 'gpu' })} style={{ fontSize: 11 }}>
                <option value="cpu">CPU（准·可比旧数）</option>
                <option value="gpu">GPU 可拖（实验）</option>
              </select>
            </label>
            {windEngineP === 'gpu' && (
              <label style={{ color: windLiveP ? '#2f9e44' : '#6b7680' }} title="收敛之后继续逐帧行（会同 CAD 视窗争帧预算）。关咗＝收敛就凍結，慳电。">
                <input type="checkbox" checked={windLiveP} onChange={(e) => setWindOpt({ windLive: e.target.checked })} /> 即时
              </label>
            )}
            {/* S2：流场样式 —— 烟流（GPU tracer，默认）/ 流线（GM-W3 3.1）/ 箭头。烟流唔支援会自动退返流线 + 状态栏讲原因 */}
            <label title="流场样式：烟流＝GPU 追踪几十万粒 tracer 喺解出嘅流场入面流动（真风洞烟流质感）；流线＝真 RK2 流线 + 动画点；箭头＝速度向量"><span style={{ color: '#6b7680' }}>样式 </span>
              <select value={windViz} disabled={!windShowFlow} onChange={(e) => setWindOpt({ windViz: e.target.value as 'rake' | 'smoke' | 'stream' | 'arrow' })} style={{ fontSize: 11 }}>
                <option value="rake">烟耙条带</option><option value="smoke">烟流雾粒</option><option value="stream">流线</option><option value="arrow">箭头</option>
              </select>
            </label>
            {windViz === 'rake' && (<>
              <label title="条带密度（每条缎带嘅光度）"><span style={{ color: '#6b7680' }}>密度 </span>
                <input type="range" min={0.10} max={1.00} step={0.02} value={windRibbonAlpha} disabled={!windShowFlow} onChange={(e) => setWindOpt({ windRibbonAlpha: Number(e.target.value) })} style={{ width: 60, verticalAlign: 'middle' }} />
              </label>
              <label title="条带阔度倍率（基准由零件体素大细自动推导，唔係绝对 mm）"><span style={{ color: '#6b7680' }}>阔度 </span>
                <input type="range" min={0.3} max={3} step={0.1} value={windRibbonWidth} disabled={!windShowFlow} onChange={(e) => setWindOpt({ windRibbonWidth: Number(e.target.value) })} style={{ width: 60, verticalAlign: 'middle' }} />
              </label>
              <label title="软边：Beer-Lambert 管状消光 — 细=通透，大=实心"><span style={{ color: '#6b7680' }}>软边 </span>
                <input type="range" min={0.4} max={4} step={0.1} value={windRibbonSigma} disabled={!windShowFlow} onChange={(e) => setWindOpt({ windRibbonSigma: Number(e.target.value) })} style={{ width: 60, verticalAlign: 'middle' }} />
              </label>
              <label title="向下游扩散：模拟烟带愈行愈散"><span style={{ color: '#6b7680' }}>扩散 </span>
                <input type="range" min={0} max={3} step={0.1} value={windRibbonSpread} disabled={!windShowFlow} onChange={(e) => setWindOpt({ windRibbonSpread: Number(e.target.value) })} style={{ width: 60, verticalAlign: 'middle' }} />
              </label>
              <label title="动画快慢 — 纯视觉，唔影响 Cd / 阻力 / 任何物理结果"><span style={{ color: '#6b7680' }}>流速 </span>
                <input type="range" min={0.25} max={4} step={0.25} value={windSmokeSpeed} disabled={!windShowFlow} onChange={(e) => setWindOpt({ windSmokeSpeed: Number(e.target.value) })} style={{ width: 60, verticalAlign: 'middle' }} />
              </label>
            </>)}
            {windViz === 'smoke' && (<>
              <label title="烟流上色：速度（turbo 色标，快=红慢=蓝）/ 白烟（中性，最似真烟）/ 年龄"><span style={{ color: '#6b7680' }}>上色 </span>
                <select value={windSmokeColor} disabled={!windShowFlow} onChange={(e) => setWindOpt({ windSmokeColor: e.target.value as 'white' | 'speed' | 'age' })} style={{ fontSize: 11 }}>
                  <option value="speed">速度</option><option value="white">白烟</option><option value="age">年龄</option>
                </select>
              </label>
              <label title="烟流密度（每条 streak 嘅光度；太高会糊，太低会淡）"><span style={{ color: '#6b7680' }}>密度 </span>
                <input type="range" min={0.02} max={0.30} step={0.01} value={windSmokeAlpha} disabled={!windShowFlow} onChange={(e) => setWindOpt({ windSmokeAlpha: Number(e.target.value) })} style={{ width: 64, verticalAlign: 'middle' }} />
              </label>
              <label title="动画快慢 — 纯视觉，唔影响 Cd / 阻力 / 任何物理结果"><span style={{ color: '#6b7680' }}>流速 </span>
                <input type="range" min={0.25} max={4} step={0.25} value={windSmokeSpeed} disabled={!windShowFlow} onChange={(e) => setWindOpt({ windSmokeSpeed: Number(e.target.value) })} style={{ width: 64, verticalAlign: 'middle' }} />
              </label>
              <label title="拖尾长度：0＝短点（似粒子）1＝完整一步嘅尾（似烟）"><span style={{ color: '#6b7680' }}>拖尾 </span>
                <input type="range" min={0} max={1} step={0.05} value={windStreakScale} disabled={!windShowFlow} onChange={(e) => setWindOpt({ windStreakScale: Number(e.target.value) })} style={{ width: 64, verticalAlign: 'middle' }} />
              </label>
            </>)}
            <label style={{ color: windXray ? '#2f9e44' : '#6b7680' }} title="零件半透明：睇内部 / 流线穿过"><input type="checkbox" checked={windXray} onChange={(e) => setWindOpt({ windXray: e.target.checked })} /> 透明</label>
          </div>
          {windResult && (() => {
            // GM-W3 3.2/3.3：headline 用 Maskell 修正 Cd（旧结果无 cdCorr → 退回 cd）+ 振荡 ± + 堵塞率 + 钳制提示
            const cdHead = windResult.cdCorr ?? windResult.cd
            const osc = windResult.cdOsc ?? 0
            return (
            <div style={{ margin: '2px 0 0', padding: '6px 8px', borderRadius: 4, background: '#1a1d22', fontSize: 11.5, lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700, color: '#cfd6dd' }}>风阻系数 Cd ≈ <span style={{ color: '#4f9dff' }}>{cdHead.toFixed(3)}{osc > 1e-4 ? ` ± ${osc.toFixed(3)}` : ''}</span></div>
              {windResult.blockage !== undefined && (
                <div style={{ color: '#9aa3ad' }}>原始 Cd {windResult.cd.toFixed(3)} · 堵塞率 {(windResult.blockage * 100).toFixed(0)}%（Maskell 修正）</div>
              )}
              <div>阻力 ≈ <b style={{ color: '#ffd166' }}>{windResult.dragN >= 1 ? windResult.dragN.toFixed(2) + ' N' : (windResult.dragN * 1000).toFixed(2) + ' mN'}</b>（{windResult.fluidName} · {windResult.speed} m/s）</div>
              <div style={{ color: '#9aa3ad' }}>Re ≈ {windResult.re.toExponential(1)} · 迎风面积 {windResult.frontalAreaMM2 >= 100 ? windResult.frontalAreaMM2.toFixed(0) : windResult.frontalAreaMM2.toFixed(1)} mm²</div>
              <div style={{ color: '#9aa3ad' }}>表面 Cp：{windResult.cpMin.toFixed(2)} ~ {windResult.cpMax.toFixed(2)}（红高压·蓝吸力）{windResult.converged ? '' : ' · ⚠未完全收敛'}</div>
              {windResult.reClamped && <div style={{ color: '#e0a800' }}>⚠ Re 已钳至稳定带（量级/相对比较可信，绝对值偏趋势）</div>}
              {windResult.bumped && <div style={{ color: '#2f9e44' }}>🧩 薄件自动加密：分辨率 → {windResult.res}（最薄方向够体素，Cd 较可信）</div>}
              <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => useApp.getState().downloadWindReport()}>📄 下载报告</button>
                <button
                  type="button"
                  data-testid="physics-send-wind-to-lab"
                  onClick={() => useApp.setState({ windMode: 0, physicsLabOpen: true })}
                >
                  🧪 送入環境實驗室
                </button>
              </div>
              <div style={{ marginTop: 4, color: '#6b7680', fontSize: 10.5 }}>趋势级 LBM（非商用 CFD）：相对比较（钝体 vs 流线 / 不同朝向）最可信；绝对 Cd 偏趋势值。</div>
            </div>
            )
          })()}
        </CommandDialog>
      )}
      {(moldModeP > 0 || moldBusy || moldResult) && (
        <CommandDialog
          icon="interference"
          title="模流分析（Hele-Shaw 体素趋势）"
          width={282}
          okLabel={moldBusy ? '计算中…' : moldResult ? '重新运行' : '运行'}
          okDisabled={moldBusy}
          okTip="运行充填/冷却/压力/变形趋势（Enter）— 未点浇口会自动放喺顶部中心"
          onOk={() => void runMoldSolve()}
          onCancel={() => useApp.getState().clearMold()}
          summary={<>{moldMat} · {moldGates.length} 个浇口 · 趋势着色（非商用模流精度）</>}
        >
          {moldBusy && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9aa3ad', marginBottom: 3 }}>
                <span>⏳ {moldProgNote || '计算中'}{moldSolver ? '（求解器 · CPU 重，请稍候）' : ''}</span>
                <span>{Math.round(moldProg * 100)}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: '#2a2e35', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.max(3, moldProg * 100)}%`, background: 'linear-gradient(90deg,#28bceb,#4f9dff)', transition: 'width 0.15s linear' }} />
              </div>
            </div>
          )}
          <SelectionChip label="🎯 浇口" count={moldGates.length} hint="点零件上嘅入料位（可多个 — 出焊接线）；唔点都得，运行时自动放顶部中心" onClear={() => useApp.setState({ moldGates: [], moldMode: 1 })} />
          {moldGates.length > 0 && (
            <div style={{ margin: '0 0 6px', padding: '4px 6px', borderRadius: 4, background: '#1a1d22', fontSize: 11 }}>
              {moldGates.map((g, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                  <span style={{ color: '#6b7680', width: 38 }}>浇口{i + 1}</span>
                  <select value={g.type || 'edge'} title={GATE_TYPES[(g.type || 'edge') as GateType]?.note} onChange={(e) => setMoldGate(i, { type: e.target.value as GateType })} style={{ flex: 1, fontSize: 11 }}>
                    {(Object.keys(GATE_TYPES) as GateType[]).map((k) => <option key={k} value={k}>{GATE_TYPES[k].name}</option>)}
                  </select>
                  {!moldRunnerBalance && (
                    <input type="number" min={0.1} max={10} step={0.1} value={g.flowWeight ?? 1} title="流量权重（手动流道尺寸；越大分到越多熔体）" onChange={(e) => setMoldGate(i, { flowWeight: Math.max(0.1, Number(e.target.value) || 1) })} style={{ width: 42, fontSize: 11 }} />
                  )}
                </div>
              ))}
              {moldGates.length > 1 && (
                <label title="自动流道平衡：按各浇口几何责任域体积分配流量 → 各区同步填满（减焊接线/困气/翘曲）。开咗就唔使手动调权重。" style={{ display: 'block', color: moldRunnerBalance ? '#2f9e44' : '#6b7680' }}>
                  <input type="checkbox" checked={moldRunnerBalance} onChange={(e) => setMoldOpt({ moldRunnerBalance: e.target.checked })} /> ⚖ 自动流道平衡（多浇口同步填满）
                </label>
              )}
            </div>
          )}
          <label>
            <span style={{ color: '#6b7680' }}>材料</span>
            <select value={moldMat} onChange={(e) => setMoldOpt({ moldMat: e.target.value })}>
              {['ABS', 'PP', 'PC', 'PA6', 'POM', 'PMMA', 'TPU'].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label title="精细度（体素分辨率）：越高越细越准（薄壁/细节/孔），但越慢。肯等就拉右边。20≈粗 / 40≈细 / 64≈超细 / 128+≈极致 / 256=最尽（大件慎用，睇预计耗时）。运行前睇下面预计耗时。">
            <span style={{ color: '#6b7680' }}>精细度 {moldRes}{moldRes <= 24 ? '（粗·快）' : moldRes <= 44 ? '（细）' : moldRes <= 72 ? '（超细）' : moldRes <= 160 ? '（极致·慢）' : '（最尽·好慢）'}</span>
            <input type="range" min={20} max={lowPower ? 96 : 256} step={4} value={moldRes} onChange={(e) => setMoldOpt({ moldRes: Number(e.target.value) })} style={{ width: 130, verticalAlign: 'middle' }} />
          </label>
          {lowPower && <div style={{ fontSize: 10.5, color: '#2f9e44', margin: '-2px 0 6px' }}>📱 已为你设备（手机/弱机）自动调低预设 + 封顶精细度，本机计算唔卡</div>}
          {moldEst && (
            <div style={{ fontSize: 11, lineHeight: 1.45, color: moldEst.sec > 120 ? '#e08000' : '#6b7680', margin: '-2px 0 6px' }}>
              📊 预计 ≈{moldEst.nVox.toLocaleString()} 体素 · {moldSolver ? '压力求解器' : '趋势'} 约 <b>{moldEst.sec < 1 ? '<1 秒' : moldEst.sec < 90 ? Math.round(moldEst.sec) + ' 秒' : (moldEst.sec / 60).toFixed(1) + ' 分钟'}</b>
              {moldEst.bumped ? `（薄壁自动加密到 ${moldEst.effRes}）` : ''}
              {moldEst.sec > 120 ? ' ⚠ 较慢，确认再运行' : ''}
            </div>
          )}
          <label title="求解器：真 2.5D Hele-Shaw 压力解（耦合流动前沿 + Cross 剪切变稀黏度 + 移动边界 FVM）→ 出真 MPa 注射压力/锁模力、真 race-tracking + 焊接线/困气位置。比趋势 Dijkstra 慢（秒级），但物理真实。诚实：工程级，非商用验证级（材料系数为文献家族典型值）。" style={{ display: 'block' }}>
            <input type="checkbox" checked={moldSolver} onChange={(e) => setMoldOpt({ moldSolver: e.target.checked })} /> <span style={{ color: moldSolver ? '#2f9e44' : '#6b7680' }}>🧪 压力求解器（真 2.5D · 出真 MPa）</span>
          </label>
          {moldSolver && (
            <>
              <label title="热耦合（Stage-2）：解能量方程（对流迎风 + 黏性耗散 η·γ̇² + 壁面导热汇）+ Cross-WLF η(γ̇,T) 温变黏度 → 长薄流程冷却令黏度升、压力需求升；前沿熔温跌穿无流动温度 → 短射风险预测。工程级（WLF/热物性系数为文献家族典型值，非牌号实测）。关 = 等温 Stage-1（逐位一致）。" style={{ display: 'block' }}>
                <input type="checkbox" checked={moldThermal} onChange={(e) => setMoldOpt({ moldThermal: e.target.checked })} /> <span style={{ color: moldThermal ? '#2f9e44' : '#6b7680' }}>🌡 热耦合（Stage-2 温度场 · 短射预测）</span>
              </label>
              {moldThermal && (() => {
                const def = MOLD_MAT_TEMP[moldMat] || { melt: 230, mold: 60 }
                const onT = (key: 'moldTMelt' | 'moldTMold') => (e: React.ChangeEvent<HTMLInputElement>) => {
                  const v = e.target.value.trim(); const num = Number(v)
                  setMoldOpt({ [key]: v === '' || !Number.isFinite(num) ? null : num })
                }
                return (
                  <div style={{ display: 'flex', gap: 10, margin: '1px 0 4px', paddingLeft: 18, fontSize: 11, color: '#6b7680' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} title={`熔体入口温度（留空 = 材料 ${moldMat} 缺省 ${def.melt}°C）`}>
                      熔体°C
                      <input type="number" min={120} max={400} step={5} value={moldTMelt ?? ''} placeholder={String(def.melt)} onChange={onT('moldTMelt')} style={{ width: 52, fontSize: 11 }} />
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} title={`模壁温度（留空 = 材料 ${moldMat} 缺省 ${def.mold}°C）`}>
                      模具°C
                      <input type="number" min={20} max={200} step={5} value={moldTMold ?? ''} placeholder={String(def.mold)} onChange={onT('moldTMold')} style={{ width: 52, fontSize: 11 }} />
                    </label>
                  </div>
                )
              })()}
              {/* GM-P3UI：Stage-3 保压 / PVT 收缩控件 —— 直接喺 🌡热耦合 之下，同款视觉 */}
              <label title="保压（Stage-3）：充填后行保压 + Tait 双域 PVT 体积收缩预测 → 出【缩水率】云图。保压压力升 → seal 压升 → 收缩降；远浇口 seal 压低 → 收缩高（经典缩水型态）。趋势级（文献典型系数非牌号实测，忽略取向/结晶/翘曲）。仅压力求解器模式有效。" style={{ display: 'block' }}>
                <input type="checkbox" checked={moldPacking} onChange={(e) => setMoldOpt({ moldPacking: e.target.checked })} /> <span style={{ color: moldPacking ? '#2f9e44' : '#6b7680' }}>⏱ 保压（Stage-3 保压 / PVT 缩水预测）</span>
              </label>
              {moldPacking && (
                <>
                  <div style={{ display: 'flex', gap: 10, margin: '1px 0 4px', paddingLeft: 18, fontSize: 11, color: '#6b7680' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} title="保压压力（浇口保持压力 MPa；典型 20–60）。越高越压实 → 收缩越低。传求解器前会 ×1e6 换成 Pa。">
                      压力 MPa
                      <input type="number" min={0} max={200} step={5} value={moldPackPressure} onChange={(e) => setMoldOpt({ moldPackPressure: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 52, fontSize: 11 }} />
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} title="保压时间（s；典型 2–10）。越长越多 CV 喺高压下冻结锁压 → 收缩越均匀。">
                      时间 s
                      <input type="number" min={0} max={60} step={0.5} value={moldPackTime} onChange={(e) => setMoldOpt({ moldPackTime: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 52, fontSize: 11 }} />
                    </label>
                  </div>
                  <div style={{ fontSize: 10.5, color: '#6b7680', paddingLeft: 18, margin: '-2px 0 4px', lineHeight: 1.4 }}>
                    唔使开热耦合都用得：热耦合关 → 保压期由【均匀熔温】起算靠壁面导热冻结；开 → 用真末温度场（更贴近）。
                  </div>
                </>
              )}
            </>
          )}
          {moldResult && (
            <>
              {moldResult.moldable !== 'ok' && (
                <div style={{
                  margin: '0 0 8px', padding: '6px 8px', borderRadius: 4, fontSize: 11, lineHeight: 1.45,
                  background: moldResult.moldable === 'solid' ? 'rgba(220,53,69,0.14)' : 'rgba(224,128,0,0.14)',
                  border: `1px solid ${moldResult.moldable === 'solid' ? '#dc3545' : '#e08000'}`,
                  color: moldResult.moldable === 'solid' ? '#ff8088' : '#e8a020',
                }}>
                  {moldResult.moldable === 'solid'
                    ? <>⚠ <b>零件偏厚/实心</b>（中位壁厚 {moldResult.wallMedian.toFixed(1)}mm · 最厚 {moldResult.wallMax.toFixed(1)}mm）。注塑只适合<b>薄壁件</b>（1–4mm）—— 实心厚件实际会缩水、内部空洞、冷却超长，唔适合直接注塑。下面冷却/周期系厚段<b>上限</b>估算。<br/>建议：先用「<b>抽壳</b>」整空到 2–4mm 壁厚再分析。</>
                    : <>⚠ <b>局部厚段</b>（最厚 {moldResult.wallMax.toFixed(1)}mm &gt; 薄壁建议 6mm）。厚位（凸台/筋根/芯部）冷却慢 + 易缩痕，周期由最厚位主导。可挖空厚位或减薄。</>}
                </div>
              )}
              {/* GM-W8 β3：Stage-2 短射风险徽章（前沿熔温跌穿无流动温度而仍充填嘅体素占比） */}
              {moldResult.shortShotRisk && (
                <div style={{ margin: '0 0 8px', padding: '6px 8px', borderRadius: 4, fontSize: 11, lineHeight: 1.45, background: 'rgba(220,53,69,0.14)', border: '1px solid #dc3545', color: '#ff8088' }}>
                  ⚠ <b>短射风险</b>：{((moldResult.frozenFraction ?? 0) * 100).toFixed(1)}% 体素冻结（前沿熔温低于无流动温度）—— 长薄流程冷却过快。建议升熔温/模温、增大浇口、缩短流程或加浇口。
                </div>
              )}
              <label>
                <span style={{ color: '#6b7680' }}>云图</span>
                <select value={moldField} onChange={(e) => setMoldOpt({ moldField: e.target.value as 'fill' | 'pressure' | 'cooling' | 'warp' | 'sink' | 'shrink' })}>
                  <option value="fill">充填时间</option>
                  <option value="pressure">压力趋势（相对）</option>
                  <option value="cooling">冷却时间</option>
                  <option value="warp">变形趋势（相对）</option>
                  <option value="sink">缩痕风险（厚壁）</option>
                  {/* GM-P3UI：缩水率云图 —— 仅 Stage-3 保压有 packing 结果先列出 */}
                  {moldResult.packing && <option value="shrink">缩水率（Stage-3 保压）</option>}
                </select>
              </label>
              {/* GM-W8 β3：显示模式切换（仅热耦合有温度场）—— 充填时间[moldField 场] ↔ 熔体温度场 */}
              {moldResult.thermalUsed && (
                <div style={{ margin: '2px 0', fontSize: 11 }}>
                  <span style={{ color: '#6b7680', marginRight: 6 }}>显示</span>
                  <span style={{ display: 'inline-flex', borderRadius: 4, overflow: 'hidden', border: '1px solid #3a3e44', verticalAlign: 'middle' }}>
                    <button type="button" onClick={() => setMoldOpt({ moldTempView: false })} title="显示所选云图场（充填时间/压力/冷却/变形/缩痕）" style={{ padding: '1px 8px', cursor: 'pointer', border: 'none', background: !moldTempView ? '#1e3a5f' : '#23272d', color: '#d8dde2', fontWeight: 600 }}>充填时间</button>
                    <button type="button" onClick={() => setMoldOpt({ moldTempView: true })} title="显示 end-of-fill 熔体温度场：蓝=低温（接近冻结）→ 红=高温。睇边度冷得快 → 短射/焊接线弱。" style={{ padding: '1px 8px', cursor: 'pointer', border: 'none', background: moldTempView ? '#7a2020' : '#23272d', color: '#d8dde2', fontWeight: 600 }}>🌡 熔体温度</button>
                  </span>
                </div>
              )}
              <label title="充填动画：▶ 自动播放熔体前沿由浇口推进到末端（循环）；或拖滑杆手动 scrub（灰=胶水未到）">
                <button type="button" onClick={() => { const p = !moldPlaying; setMoldPlaying(p); if (p) setMoldOpt({ moldField: 'fill', moldT: 0.02 }) }}
                  title={moldPlaying ? '暂停充填动画' : '▶ 播放充填动画（熔体前沿推进，循环）'}
                  style={{ marginRight: 6, padding: '1px 7px', borderRadius: 3, cursor: 'pointer', border: '1px solid ' + (moldPlaying ? '#4a9eff' : '#3a3e44'), background: moldPlaying ? '#1e3a5f' : '#23272d', color: '#d8dde2', fontWeight: 600 }}>{moldPlaying ? '⏸' : '▶'}</button>
                <span style={{ color: '#6b7680' }}>充填 {Math.round(moldT * 100)}%</span>
                <input type="range" min={0.02} max={1} step={0.02} value={moldT} onChange={(e) => { setMoldPlaying(false); setMoldOpt({ moldT: Number(e.target.value) }) }} style={{ width: 96, verticalAlign: 'middle' }} />
              </label>
              <label title="流向线 flow line：沿熔体充填方向画箭头（蓝=近浇口/早 → 红=远端/迟），睇胶水点样流。浮喺云图之上即见。" style={{ display: 'block' }}>
                <input type="checkbox" checked={moldFlowLines} onChange={(e) => setMoldOpt({ moldFlowLines: e.target.checked })} /> <span style={{ color: '#6b7680' }}>流向线 ➜（flow line）</span>
              </label>
              <label title="透明体素云：透视睇零件【内部】嘅充填流动。关=实色（转动最快）；开=半透明（睇得入但体素好多嘅大件会慢啲 — 可降「精细度」补偿）。" style={{ display: 'block' }}>
                <input type="checkbox" checked={moldXray} onChange={(e) => setMoldOpt({ moldXray: e.target.checked })} /> <span style={{ color: '#6b7680' }}>透明（睇内部流动）· 关=实色更快</span>
              </label>
              <div style={{ fontSize: 11, lineHeight: 1.5 }}>
                {moldTempView && moldResult.thermalUsed ? (
                  // GM-W8 β3：熔体温度色标 —— 蓝(tMin)→红(tMax)，同 MoldOverlay 温度渐变一致
                  <>
                    <div style={{ height: 10, borderRadius: 3, background: 'linear-gradient(90deg,rgb(0,26,255),rgb(128,26,128),rgb(255,26,0))' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7680' }}>
                      <span>{(moldResult.tMin ?? 0).toFixed(0)}°C</span><span>熔体温度</span><span>{(moldResult.tMax ?? 0).toFixed(0)}°C</span>
                    </div>
                  </>
                ) : moldField === 'shrink' && moldResult.packing ? (
                  // GM-P3UI：缩水率色标 —— 同熔体温度款 蓝(低)→红(高)；min/max 标 %（2 位小数），min 由均匀度反推（同 overlay 一致）
                  <>
                    <div style={{ height: 10, borderRadius: 3, background: 'linear-gradient(90deg,rgb(0,26,255),rgb(128,26,128),rgb(255,26,0))' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7680' }}>
                      <span>{(moldResult.packing.shrinkMax * moldResult.packing.shrinkUniformity).toFixed(2)}%</span><span>缩水率</span><span>{moldResult.packing.shrinkMax.toFixed(2)}%</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ height: 10, borderRadius: 3, background: 'linear-gradient(90deg,#30123b,#28bceb,#a4fc3c,#fb7e21,#7a0403)' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7680' }}>
                      <span>低</span><span>{moldField === 'fill' ? '充填时间' : moldField === 'pressure' ? '压力趋势' : moldField === 'cooling' ? '冷却时间' : moldField === 'sink' ? '缩痕风险' : '变形趋势'}</span><span>高</span>
                    </div>
                  </>
                )}
                <div style={{ color: '#6b7680' }}>
                  {/* #87 GM-L2：显示【实际】用嘅体素分辨率（薄壁自动加密后真值 resActual），唔再净印用户请求值 —— 体素数对得返。 */}
                  注射≈{fmtSec(moldResult.tFill)} · 冷却≈{fmtSec(moldResult.tCool)} · 周期≈{fmtSec(moldResult.cycle)} · {moldResult.nVox} 体素（分辨率 {moldResult.resActual}{moldResult.resActual > moldRes ? `，自动加密自 ${moldRes}` : ''}）
                </div>
                <div style={{ color: '#6b7680' }}>
                  壁厚：中位 {moldResult.wallMedian.toFixed(1)}mm · 最厚 {moldResult.wallMax.toFixed(1)}mm
                </div>
                {moldResult.solverUsed && (
                  <div style={{ color: '#2f9e44' }}>🧪 求解器：峰值压力 ≈{moldResult.pPeakMPa.toFixed(1)} MPa · 锁模力 ≈{moldResult.clampForceKN.toFixed(0)} kN（同阶估算）</div>
                )}
                {moldResult.thermalUsed && (
                  // GM-W8 β3：Stage-2 热耦合诚实注记（完整假设已附入 warnings/报告；此为面板精简一行）
                  <div style={{ color: '#e08a20' }}>🌡 热耦合 Stage-2：熔温 {(moldResult.tMin ?? 0).toFixed(0)}–{(moldResult.tMax ?? 0).toFixed(0)}°C · 能量方程 + Cross-WLF η(γ̇,T)（工程级，文献典型系数非牌号实测）</div>
                )}
                {moldResult.packing && (
                  // GM-P3UI：Stage-3 保压 / PVT 收缩摘要 —— 平均/最大/均匀度 徽章 + packTraceNote 诚实小注（切「缩水率」云图睇分布）
                  <div style={{ color: '#3aa8c0' }}>
                    ⏱ 保压 Stage-3：平均缩水 {moldResult.packing.shrinkAvg.toFixed(2)}% · 最大 {moldResult.packing.shrinkMax.toFixed(2)}% · 均匀度 {(moldResult.packing.shrinkUniformity * 100).toFixed(0)}%
                    <div style={{ color: '#6b7680', fontSize: 10.5, lineHeight: 1.4, marginTop: 1 }}>{moldResult.packing.packTraceNote}</div>
                  </div>
                )}
                {moldResult.gateStats && moldResult.gateStats.length > 0 && (
                  <div style={{ margin: '3px 0', padding: '4px 6px', borderRadius: 4, background: '#1a1d22' }}>
                    {moldResult.gateStats.length > 1 && (
                      <div style={{ color: moldResult.balanced ? '#2f9e44' : '#9aa3ad', marginBottom: 2 }}>
                        ⚖ 流道{moldResult.balanced ? '平衡（开）' : '（均分/手动）'} · 充填不平衡度 {(moldResult.fillImbalance * 100).toFixed(0)}%{moldResult.fillImbalance > 0.15 && !moldResult.balanced ? '（可开平衡改善）' : ''}
                      </div>
                    )}
                    {moldResult.gateStats.map((g, i) => (
                      <div key={i} style={{ color: '#8a93a0' }}>
                        浇口{i + 1}：{GATE_TYPES[g.type]?.name || g.type} · 流量 {(g.flowFrac * 100).toFixed(0)}%{moldResult.solverUsed ? ` · 注射 ${g.pInjMPa.toFixed(1)} MPa（浇口降 ${g.gateDpMPa.toFixed(1)}）· 末 ${g.fillEnd.toFixed(2)}s` : ` · 责任域 ${g.domainVox} 体素`}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ color: '#a428c9' }}>紫红 = 焊接线（两股前沿汇合 — 留意外观/强度）</div>
                <div style={{ color: '#e08000' }}>橙 = 困气/最后充填点（前沿终止 — 建议加排气槽防烧焦/短射）</div>
                {moldField === 'fill' && moldResult.unreached && (() => { let u = 0; const arr = moldResult.unreached; for (let i = 0; i < arr.length; i++) if (arr[i]) u++; return u > 0 ? <div style={{ color: '#8b95a1', fontWeight: 600 }}>灰 = 前沿完全到唔到（{u} 体素 · 孤岛/窄缝断连）— 该区唔会被填。提高「精细度」，或检查薄连接是否真正接合（红色只係填得迟，唔同灰色）</div> : null })()}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  <button className="cs-btn" title="导出俯视充填流动动画（fill-time 进程图）做 GIF — 前沿白、焊接线紫红、困气橙、浇口青" onClick={() => useApp.getState().exportMoldGif()}>🎞 充填动画 GIF</button>
                  <button className="cs-btn" title="导出 PDF 报告：充填热图 + 注射压力/时间/冷却/周期 + 建议机台吨位/锁模力 + 焊接线/困气/缩痕 + 诚实声明" onClick={() => useApp.getState().exportMoldPdf()}>📄 PDF 报告</button>
                  <button className="cs-btn" title="导出纯文字趋势报告 .txt" onClick={() => useApp.getState().downloadMoldReport()}>📄 .txt</button>
                </div>
              </div>
            </>
          )}
        </CommandDialog>
      )}

      {holeMode && (
        <CommandDialog
          icon="hole"
          title={holeEditId ? '編輯孔' : '孔'}
          width={320}
          okTip={holePos || holeEditId ? '建立孔（Enter）' : '請先選擇面或草圖點'}
          okDisabled={!holePos && !holeEditId}
          onOk={() => void commitHole()}
          onCancel={() => cancelHole()}
          summary={holeType === 'counterbore' ? `沉头孔（${holeThrough ? '通' : '盲'}+沉台 Ø${(holeCbD ?? holeSpec.cbD).toFixed(1)}）` : holeType === 'countersink' ? `埋头孔（${holeThrough ? '通' : '盲'}+${holeCsAngle}°锥 Ø${(holeCsD ?? holeSpec.csD).toFixed(1)}）` : holeType === 'nuttrap' ? '螺母陷阱（过孔+六角槽嵌螺母）' : holeType === 'tapped' ? (holeTapModeled ? `建模螺纹（真螺旋牙，${holeThrough ? '通孔' : '盲孔'}）` : `攻牙底孔（钻 d−螺距，攻 M 螺纹用，${holeThrough ? '通孔' : '盲孔'}）`) : holeThrough ? `通孔 Ø${holeD}` : `盲孔 Ø${holeD}${holeDepth > 0 ? ` 深${holeDepth}` : '（深≈1.5×Ø）'}`}
        >
          <div style={{ color: '#6b7680', fontWeight: 600 }}>Placement</div>
          <SelectionChip label="面／草圖點" count={holePos ? 1 : 0} hint={holePos ? '已選位置；可再點面改位置' : '請在實體面上點選孔位置'} onClear={() => useApp.getState().clearHolePick()} />
          <button className="cs-btn" title="按草图点批量打孔：先在草图以「點」工具放置 N 個點，再一次建立 N 個孔。" onClick={() => void useApp.getState().addHolesAtSketchPoints()}>⊙ 從草圖點批量建立</button>
          <div style={{ color: '#6b7680', fontWeight: 600, borderTop: '1px solid #d9e0e5', paddingTop: 8 }}>Shape Settings</div>
          <div style={{ color: '#6b7680' }}>孔型</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={'sb-tool' + (holeType === 'simple' ? ' active' : '')} style={{ flex: 1 }} onClick={() => setHoleType('simple')}>通/盲</button>
            <button className={'sb-tool' + (holeType === 'counterbore' ? ' active' : '')} style={{ flex: 1 }} title="沉头孔（socket-head）" onClick={() => setHoleType('counterbore')}>沉头</button>
            <button className={'sb-tool' + (holeType === 'countersink' ? ' active' : '')} style={{ flex: 1 }} title="埋头孔（90°锥，flat-head）" onClick={() => setHoleType('countersink')}>埋头</button>
            <button className={'sb-tool' + (holeType === 'nuttrap' ? ' active' : '')} style={{ flex: 1 }} title="螺母陷阱：过孔 + 六角槽嵌螺母（3D 打印捕获螺母）" onClick={() => setHoleType('nuttrap')}>螺母槽</button>
            <button className={'sb-tool' + (holeType === 'tapped' ? ' active' : '')} style={{ flex: 1 }} title="攻牙底孔：钻 攻丝底孔Ø(d−螺距)，留料攻 M 螺纹（按 ISO 底孔表，非建模螺纹）" onClick={() => setHoleType('tapped')}>攻牙</button>
          </div>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ color: '#6b7680' }}>直径 Ø</span>
            <span><LenInput mm={holeD} onMm={setHoleD} unit={unit} w={66} min={0.1} title="孔径（inch 模式可打分数，如 1/4）" /> {unit === 'inch' ? 'in' : unit}</span>
          </label>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }} title="标准螺栓孔：选一个即自动填直径（过孔=螺栓穿过；攻丝=螺纹底孔）">
            <span style={{ color: '#6b7680' }}>标准孔</span>
            <select defaultValue="0" onChange={(e) => { const v = Number(e.target.value); if (v > 0) setHoleD(v) }} style={{ height: 26 }}>
              <option value="0">自定义…</option>
              <optgroup label="过孔 clearance">
                <option value="2.4">M2 过孔 2.4</option><option value="2.9">M2.5 过孔 2.9</option><option value="3.4">M3 过孔 3.4</option><option value="4.5">M4 过孔 4.5</option><option value="5.5">M5 过孔 5.5</option>
                <option value="6.6">M6 过孔 6.6</option><option value="9">M8 过孔 9.0</option><option value="11">M10 过孔 11</option><option value="13.5">M12 过孔 13.5</option><option value="15.5">M14 过孔 15.5</option><option value="17.5">M16 过孔 17.5</option><option value="20">M18 过孔 20</option><option value="22">M20 过孔 22</option><option value="24">M22 过孔 24</option><option value="26">M24 过孔 26</option>
              </optgroup>
              <optgroup label="攻丝底孔 tap (粗牙)">
                <option value="1.6">M2 攻丝 1.6</option><option value="2.05">M2.5 攻丝 2.05</option><option value="2.5">M3 攻丝 2.5</option><option value="3.3">M4 攻丝 3.3</option><option value="4.2">M5 攻丝 4.2</option>
                <option value="5">M6 攻丝 5.0</option><option value="6.8">M8 攻丝 6.8</option><option value="8.5">M10 攻丝 8.5</option><option value="10.2">M12 攻丝 10.2</option><option value="12">M14 攻丝 12</option><option value="14">M16 攻丝 14</option><option value="15.5">M18 攻丝 15.5</option><option value="17.5">M20 攻丝 17.5</option><option value="19.5">M22 攻丝 19.5</option><option value="21">M24 攻丝 21</option>
              </optgroup>
              <optgroup label="热熔嵌件孔 insert (黄铜)">
                <option value="3.2">M2 嵌件 3.2</option><option value="4">M3 嵌件 4.0</option><option value="5.6">M4 嵌件 5.6</option>
                <option value="6.4">M5 嵌件 6.4</option><option value="8">M6 嵌件 8.0</option>
              </optgroup>
            </select>
          </label>
          {holeType === 'counterbore' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 12, color: '#6b7680', alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 3 }} title="沉头台阶直径；灰=按 ISO 4762 内六角螺丝头自动，改咗即覆写">沉头Ø
                <input type="number" min={0.5} step={0.5} value={holeCbD ?? holeSpec.cbD} onChange={(e) => useApp.getState().setHoleCbD(Number(e.target.value))} style={{ width: 52, color: holeCbD == null ? '#8a97a2' : undefined }} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 3 }} title="沉头台阶深度；灰=按 ISO 表自动">深
                <input type="number" min={0.2} step={0.1} value={holeCbDepth ?? holeSpec.cbDepth} onChange={(e) => useApp.getState().setHoleCbDepth(Number(e.target.value))} style={{ width: 48, color: holeCbDepth == null ? '#8a97a2' : undefined }} />
              </label>
              {(holeCbD != null || holeCbDepth != null) && <button className="sb-tool" style={{ padding: '0 6px', minWidth: 0 }} title="恢复按 ISO 表自动（跟孔径变）" onClick={() => { useApp.getState().setHoleCbD(null); useApp.getState().setHoleCbDepth(null) }}>↺自动</button>}
            </div>
          )}
          {holeType === 'countersink' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 12, color: '#6b7680', alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 3 }} title="埋头锥面顶径；灰=按 ISO 10642 沉头螺丝自动，改咗即覆写">埋头Ø
                <input type="number" min={0.5} step={0.5} value={holeCsD ?? holeSpec.csD} onChange={(e) => useApp.getState().setHoleCsD(Number(e.target.value))} style={{ width: 52, color: holeCsD == null ? '#8a97a2' : undefined }} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 3 }} title="埋头锥角（包含角）：82°(UNC) / 90°(ISO 标准) / 100° / 120°(钣金/木螺丝)">埋头角
                <select value={holeCsAngle} onChange={(e) => useApp.getState().setHoleCsAngle(Number(e.target.value))} style={{ height: 24 }}>{[82, 90, 100, 120].map((v) => <option key={v} value={v}>{v}°</option>)}</select>
              </label>
              {holeCsD != null && <button className="sb-tool" style={{ padding: '0 6px', minWidth: 0 }} title="恢复按 ISO 表自动" onClick={() => useApp.getState().setHoleCsD(null)}>↺自动</button>}
            </div>
          )}
          {(holeType === 'simple' || holeType === 'counterbore' || holeType === 'countersink') && (
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }} title="通孔=钻穿整个零件；盲孔=只钻一段深度（沉头/埋头：导孔盲、沉台/锥面照喺顶面）；到下一面=钻到正下方最近嘅面止（GM-3DV1 S10，仅简单孔）">
              <span style={{ color: '#6b7680' }}>深度</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {holeType === 'simple' && <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12 }} title="到下一面（Fusion To Next）：由入口面钻到正下方最近嘅面止 — 唔使量深度，跟几何走"><input type="checkbox" checked={holeToNext} onChange={(e) => setHoleToNext(e.target.checked)} />到下一面</label>}
                {holeType === 'simple' && <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12 }} title="到物件（Fusion To Object）：勾选后点目标平面；会储存面指纹并于重建时重新解析。v1 仅支持同入口平行的平面。"><input type="checkbox" checked={holeToObject} onChange={(e) => setHoleToObject(e.target.checked)} />到物件</label>}
                {holeType === 'simple' && holeToObject && <button className={'sb-tool pick-slot' + (holeToObjectPick ? ' active' : '')} style={{ padding: '0 5px', minWidth: 0 }} onClick={() => setHoleToObject(true)}>{holeToObjectPick ? '點目標面…' : holeToObjectPt ? '重揀' : '揀目標面'}</button>}
                {(() => { const ta = holeType === 'simple' && (holeToNext || holeToObject); return <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, opacity: ta ? 0.4 : 1 }}><input type="checkbox" checked={holeThrough} disabled={ta} onChange={(e) => setHoleThrough(e.target.checked)} />贯通</label> })()}
                {!holeThrough && !(holeType === 'simple' && (holeToNext || holeToObject)) && <span><input type="number" min={0} step={1} value={holeDepth} placeholder="自动" onChange={(e) => setHoleDepth(Number(e.target.value))} style={{ width: 50 }} /> mm</span>}
              </span>
            </label>
          )}
          {holeType === 'simple' && !holeThrough && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 8, color: '#6b7680', flexWrap: 'wrap' }} title="钻尖：盲孔底加真实麻花钻锥尖（机加工实际形状）；关=平底。钻尖角：118°标准钢 / 135°硬料·不锈 / 90°定心钻">
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={holeDrillPoint} onChange={(e) => setHoleDrillPoint(e.target.checked)} /> 钻尖锥底</label>
              {holeDrillPoint && (<>
                <input type="number" min={60} max={180} step={1} value={holeDrillAngle} onChange={(e) => setHoleDrillAngle(Number(e.target.value))} style={{ width: 48 }} />°
                {[118, 135, 90].map((v) => <button key={v} className={'sb-tool' + (holeDrillAngle === v ? ' active' : '')} style={{ padding: '0 6px', minWidth: 0 }} title={v === 118 ? '标准钢' : v === 135 ? '硬料/不锈' : '定心钻'} onClick={() => setHoleDrillAngle(v)}>{v}°</button>)}
              </>)}
            </div>
          )}
          {holeType === 'tapped' && (<>
            <label style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 4, fontSize: 12, marginBottom: 4, color: '#6b7680' }} title="细牙（ISO 262 fine）：螺距更细、牙更浅，底孔更大；用于薄壁件/精密调整。关=粗牙（标准）">
              <input type="checkbox" checked={holeFinePitch} onChange={(e) => setHoleFinePitch(e.target.checked)} /> 细牙 fine pitch（薄壁/精调）
            </label>
            <label style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 4, fontSize: 12, marginBottom: 8, color: '#6b7680' }} title="建模螺纹（Fusion Modeled）：切出真螺旋牙几何（3D 打印直接有牙）。结果系 compound — 之后唔好再倒角/导 STEP，STL 正常。关=净钻攻丝底孔（省料，实物自己攻牙）">
              <input type="checkbox" checked={holeTapModeled} onChange={(e) => useApp.getState().setHoleTapModeled(e.target.checked)} /> 建模螺纹 modeled（真螺旋牙）
            </label>
          </>)}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, marginBottom: 6, color: '#6b7680' }} title="3D 打印孔会缩水；正补偿放大实际钻孔 Ø（不改名义 Ø/螺丝规格）。FDM 常用 +0.2~+0.4">
            🖨 打印间隙
            <input type="number" step={0.1} value={holeClearance} onChange={(e) => setHoleClearance(Number(e.target.value))} style={{ width: 48 }} /> mm
            {[0, 0.2, 0.4].map((v) => <button key={v} className={'sb-tool' + (Math.abs(holeClearance - v) < 1e-6 ? ' active' : '')} style={{ padding: '0 6px', minWidth: 0 }} onClick={() => setHoleClearance(v)}>{v === 0 ? '无' : '+' + v}</button>)}
          </div>
          {holeType === 'simple' && holeThrough && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, marginBottom: 6, color: '#6b7680' }} title="孔口 45° 倒角：去毛刺 / 螺丝销子导入角（C 值 = 倒角边长）。0=无">
              ⌵ 孔口倒角 C
              <input type="number" step={0.5} min={0} value={holeChamfer} onChange={(e) => setHoleChamfer(Number(e.target.value))} style={{ width: 46 }} /> mm
            </div>
          )}
          {holeType === 'simple' && (
            <label style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 4, fontSize: 12, marginBottom: 6, color: '#6b7680' }} title="腰形槽孔：拉长嘅孔（两端半圆+中间直边），用嚟做可调安装位">
              <input type="checkbox" checked={holeSlot} onChange={(e) => setHoleSlot(e.target.checked)} /> 腰形槽孔（可调）
            </label>
          )}
          {holeType === 'simple' && holeSlot && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 12, color: '#6b7680' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 3 }} title="槽总长（两端外缘距离）">长 <input type="number" min={1} step={1} value={holeSlotLen} onChange={(e) => setHoleSlotLen(Number(e.target.value))} style={{ width: 46 }} /></label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 3 }} title="槽方向角（0=沿X）">角 <input type="number" step={15} value={holeSlotAng} onChange={(e) => setHoleSlotAng(Number(e.target.value))} style={{ width: 46 }} />°</label>
            </div>
          )}
          <label style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 4, fontSize: 12, marginBottom: 6, color: '#6b7680' }} title="螺栓孔圈：以定位点为圆心，喺节圆(PCD)上均布钻 N 个相同孔（法兰/盖/电机座）">
            <input type="checkbox" checked={holeBoltCircle} onChange={(e) => setHoleBoltCircle(e.target.checked)} /> 螺栓孔圈
          </label>
          {holeBoltCircle && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 12, color: '#6b7680' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>数量 <input type="number" min={2} max={64} step={1} value={holeBcCount} onChange={(e) => setHoleBcCount(Number(e.target.value))} style={{ width: 44 }} /></label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 3 }} title="节圆直径 Pitch Circle Diameter">PCD Ø <input type="number" min={1} step={1} value={holeBcPcd} onChange={(e) => setHoleBcPcd(Number(e.target.value))} style={{ width: 50 }} /></label>
            </div>
          )}
        </CommandDialog>
      )}

      {latheDlg && (
        <CommandDialog icon="default" title="CNC 车削刀路（2 轴）" onOk={() => { void useApp.getState().exportLatheGcode(); useApp.getState().closeLatheDlg() }} onCancel={() => useApp.getState().closeLatheDlg()}>
          <label title="操作：外圆车削 = 毛坯分层径向进刀车到轮廓 + 末刀精车；端面 = 车平右端面；切槽 = 指定 Z 径向切槽">操作 <select value={latheOpts.op} onChange={(e) => useApp.getState().setLatheOpts({ op: e.target.value as 'turn' | 'face' | 'groove' })} style={{ height: 26 }}><option value="turn">外圆车削</option><option value="face">端面</option><option value="groove">切槽</option></select></label>
          <label title="毛坯圆棒直径 mm（X 全程按直径出）">毛坯Ø <input type="number" step={1} min={1} value={latheOpts.stockD} onChange={(e) => useApp.getState().setLatheOpts({ stockD: Number(e.target.value) })} style={{ width: 52 }} /></label>
          <label title="每刀径向切深 mm（半径方向）">切深 <input type="number" step={0.2} min={0.1} value={latheOpts.doc} onChange={(e) => useApp.getState().setLatheOpts({ doc: Number(e.target.value) })} style={{ width: 46 }} /></label>
          <label title="切削进给 mm/min">进给 <input type="number" step={10} min={5} value={latheOpts.feed} onChange={(e) => useApp.getState().setLatheOpts({ feed: Number(e.target.value) })} style={{ width: 50 }} /></label>
          <label title="主轴转速 S（M3）">转速 <input type="number" step={100} min={100} value={latheOpts.rpm} onChange={(e) => useApp.getState().setLatheOpts({ rpm: Number(e.target.value) })} style={{ width: 54 }} /></label>
          <label title="安全退刀直径 mm（要 > 毛坯Ø）">安全Ø <input type="number" step={1} value={latheOpts.safeX} onChange={(e) => useApp.getState().setLatheOpts({ safeX: Number(e.target.value) })} style={{ width: 46 }} /></label>
          {latheOpts.op === 'turn' && <label title="精车留量 mm（最后一刀光车到尺寸）">精留 <input type="number" step={0.1} min={0} value={latheOpts.finishStep} onChange={(e) => useApp.getState().setLatheOpts({ finishStep: Number(e.target.value) })} style={{ width: 42 }} /></label>}
          {latheOpts.op === 'groove' && <><label title="槽中心 Z mm（右端面为 0,向左负）">槽Z <input type="number" step={1} value={latheOpts.grooveZ} onChange={(e) => useApp.getState().setLatheOpts({ grooveZ: Number(e.target.value) })} style={{ width: 46 }} /></label><label title="槽宽 mm">槽宽 <input type="number" step={0.5} min={0.5} value={latheOpts.grooveW} onChange={(e) => useApp.getState().setLatheOpts({ grooveW: Number(e.target.value) })} style={{ width: 42 }} /></label><label title="槽深 mm（径向）">槽深 <input type="number" step={0.5} min={0.5} value={latheOpts.grooveDepth} onChange={(e) => useApp.getState().setLatheOpts({ grooveDepth: Number(e.target.value) })} style={{ width: 42 }} /></label></>}
          <span style={{ fontSize: 11, color: '#8a97a2' }}>💡 折线半轮廓：X 向右=轴向、Y 向上=半径</span>
        </CommandDialog>
      )}
      {millDlg && (
        <CommandDialog icon="default" title="CNC 铣削刀路（2.5D）" onOk={() => { void useApp.getState().exportMillGcode(); useApp.getState().closeMillDlg() }} onCancel={() => useApp.getState().closeMillDlg()}>
          <label title="操作：轮廓切穿 = 沿轮廓外/孔内刀补切到底；挖槽 = 同心环清空轮廓内部；面铣 = raster 清顶面（S94）；钻孔 = 啄钻 ≤刀径嘅圆">操作 <select value={millOpts.op} onChange={(e) => useApp.getState().setMillOpts({ op: e.target.value as 'contour' | 'pocket' | 'drill' | 'face' })} style={{ height: 26 }}><option value="contour">轮廓切穿</option><option value="pocket">挖槽</option><option value="face">面铣</option><option value="drill">钻孔</option></select></label>
          {millOpts.op === 'drill' && <label title="后处理方言：GRBL = 手动展开啄钻（3018/Shapeoko）；标准 canned = G81/G83 循环（Fanuc/Haas 等工业机，GRBL 唔识）">后处理 <select value={millOpts.post || 'grbl'} onChange={(e) => useApp.getState().setMillOpts({ post: e.target.value as 'grbl' | 'canned' })} style={{ height: 26 }}><option value="grbl">GRBL 展开</option><option value="canned">标准 G81/G83</option></select></label>}
          <label title="材料预设（3018/Shapeoko 级起步参考值 — 务必废料试切！）">预设 <select defaultValue="" onChange={(e) => {
            const P: Record<string, Partial<typeof millOpts>> = {
              ply: { feedXY: 600, feedZ: 200, rpm: 9000, stepdown: 2 },      // 椴木/软木
              hw: { feedXY: 400, feedZ: 120, rpm: 9000, stepdown: 1.2 },    // 硬木
              acr: { feedXY: 350, feedZ: 100, rpm: 8000, stepdown: 0.8 },   // 亚克力（防熔：单刃刀更好）
              alu: { feedXY: 200, feedZ: 60, rpm: 10000, stepdown: 0.3 },   // 铝 6061（3018 好勉强 — 浅切慢走）
              pom: { feedXY: 500, feedZ: 150, rpm: 8500, stepdown: 1.5 },   // POM/塑料
            }
            if (P[e.target.value]) useApp.getState().setMillOpts(P[e.target.value])
          }} style={{ height: 26 }}><option value="">自定义</option><option value="ply">椴木/软木</option><option value="hw">硬木</option><option value="acr">亚克力</option><option value="alu">铝 6061</option><option value="pom">POM 塑料</option></select></label>
          <label title="刀径 mm（默认 3.175 = 1/8 吋直柄铣刀）— 刀补按呢个算">刀Ø <input type="number" step={0.5} min={0.5} value={millOpts.toolD} onChange={(e) => useApp.getState().setMillOpts({ toolD: Number(e.target.value) })} style={{ width: 50 }} /></label>
          <label title="总切深 mm（切穿板就设 = 板厚 + 0.2）">总深 <input type="number" step={0.5} min={0.2} value={millOpts.depth} onChange={(e) => useApp.getState().setMillOpts({ depth: Number(e.target.value) })} style={{ width: 48 }} /></label>
          <label title="每层切深 mm（业余机经验 ≤ 刀径一半；铝要 0.2-0.4）">每层 <input type="number" step={0.2} min={0.1} value={millOpts.stepdown} onChange={(e) => useApp.getState().setMillOpts({ stepdown: Number(e.target.value) })} style={{ width: 48 }} /></label>
          <label title="XY 切削进给 mm/min">进给 <input type="number" step={50} min={10} value={millOpts.feedXY} onChange={(e) => useApp.getState().setMillOpts({ feedXY: Number(e.target.value) })} style={{ width: 54 }} /></label>
          <label title="Z 下刀进给 mm/min（直插 — 一般 = XY 嘅 1/3）">下刀 <input type="number" step={20} min={10} value={millOpts.feedZ} onChange={(e) => useApp.getState().setMillOpts({ feedZ: Number(e.target.value) })} style={{ width: 50 }} /></label>
          <label title="主轴转速 S 字（M3）">转速 <input type="number" step={500} min={1000} value={millOpts.rpm} onChange={(e) => useApp.getState().setMillOpts({ rpm: Number(e.target.value) })} style={{ width: 56 }} /></label>
          <label title="安全高度 mm（快移层）">安Z <input type="number" step={1} min={1} value={millOpts.safeZ} onChange={(e) => useApp.getState().setMillOpts({ safeZ: Number(e.target.value) })} style={{ width: 40 }} /></label>
          {(millOpts.op === 'pocket' || millOpts.op === 'face') && <label title="相邻行/环距 mm（一般 = 刀径 40-50%）">行距 <input type="number" step={0.2} min={0.5} value={millOpts.stepover} onChange={(e) => useApp.getState().setMillOpts({ stepover: Number(e.target.value) })} style={{ width: 48 }} /></label>}
          {millOpts.op === 'contour' && <label title="留料桥数（切穿时防止工件飞出 — 0 = 唔留；桥高 1mm 长 6mm，完工手锯断）">料桥 <input type="number" step={1} min={0} max={8} value={millOpts.tabs} onChange={(e) => useApp.getState().setMillOpts({ tabs: Number(e.target.value) })} style={{ width: 40 }} /></label>}
          <button className="cs-btn" title="👁 出 G-code 前先睇刀路（顶视图 — 快移虚线、切削按深度着色）" onClick={() => void useApp.getState().previewGcode('mill')}>👁 预览刀路</button>
        </CommandDialog>
      )}
      {finish3dDlg && (
        <CommandDialog icon="section" title={finish3dOpts.strategy === 'rough' ? 'CNC 3D 粗加工（平端逐层挖槽）' : 'CNC 3D 平行精加工（球头）'} onOk={() => { void useApp.getState().runFinish3d('download') }} onCancel={() => useApp.getState().closeFinish3dDlg()}>
          <label title="精加工 = 球头 raster 落刀贴面；粗加工 = 平端逐层清料留余量。Fusion 工作流：先粗后精。">策略 <select value={finish3dOpts.strategy} onChange={(e) => useApp.getState().setFinish3dOpts({ strategy: e.target.value as 'finish' | 'rough' })} style={{ height: 26 }}><option value="finish">精加工（球头平行）</option><option value="rough">粗加工（逐层挖槽）</option></select></label>
          <div style={{ fontSize: 11, color: '#6b7680', maxWidth: 240 }}>{finish3dOpts.strategy === 'rough' ? '平端刀逐层（每层切深）清除毛坯里高过零件嘅料，留余量畀精加工。' : '球头 raster 落刀贴面（z-map 防过切）。曲面/有机件最显效。'}安全高 = 顶面 + 下面值。</div>
          {finish3dOpts.strategy === 'rough' && <label title="轴向每层切深 mm（粗加工分层）">每层 <input type="number" step={0.5} min={0.2} value={finish3dOpts.stepdown} onChange={(e) => useApp.getState().setFinish3dOpts({ stepdown: Number(e.target.value) })} style={{ width: 50 }} /></label>}
          {finish3dOpts.strategy === 'rough' && <label title="留畀精加工嘅余量 mm（粗加工唔切到呢个距离内）">余量 <input type="number" step={0.1} min={0} value={finish3dOpts.allowance} onChange={(e) => useApp.getState().setFinish3dOpts({ allowance: Number(e.target.value) })} style={{ width: 50 }} /></label>}
          <label title="材料/光洁度预设（GRBL 业余机起步参考 — 务必废料试切）">预设 <select defaultValue="" onChange={(e) => {
            const P: Record<string, Partial<typeof finish3dOpts>> = {
              fine: { stepover: 0.4, feedXY: 800, rpm: 12000 },   // 精（光洁，慢）
              med: { stepover: 0.8, feedXY: 600, rpm: 10000 },    // 中
              rough: { stepover: 1.5, feedXY: 500, rpm: 9000 },   // 粗（快，留刀痕）
              wood: { stepover: 0.6, feedXY: 1000, rpm: 12000 },  // 木雕
            }
            if (P[e.target.value]) useApp.getState().setFinish3dOpts(P[e.target.value])
          }} style={{ height: 26 }}><option value="">自定义</option><option value="fine">精修(光洁)</option><option value="med">中</option><option value="rough">粗(快)</option><option value="wood">木雕</option></select></label>
          <label title="刀具【直径】mm（精=球头 / 粗=平端）— 半径决定 footprint 同行距">刀Ø <input type="number" step={0.5} min={0.5} value={finish3dOpts.toolD} onChange={(e) => useApp.getState().setFinish3dOpts({ toolD: Number(e.target.value) })} style={{ width: 50 }} /></label>
          <label title="行距 mm（Y 方向相邻 raster 线距）— 越细越光但越慢，典型 0.1~0.4× 刀径">行距 <input type="number" step={0.1} min={0.05} value={finish3dOpts.stepover} onChange={(e) => useApp.getState().setFinish3dOpts({ stepover: Number(e.target.value) })} style={{ width: 50 }} /></label>
          <label title="XY 切削进给 mm/min">进给 <input type="number" step={50} min={10} value={finish3dOpts.feedXY} onChange={(e) => useApp.getState().setFinish3dOpts({ feedXY: Number(e.target.value) })} style={{ width: 54 }} /></label>
          <label title="Z 下刀进给 mm/min（进料/抬刀间下扎）">下刀 <input type="number" step={20} min={10} value={finish3dOpts.feedZ} onChange={(e) => useApp.getState().setFinish3dOpts({ feedZ: Number(e.target.value) })} style={{ width: 50 }} /></label>
          <label title="主轴转速 S 字（M3）">转速 <input type="number" step={500} min={1000} value={finish3dOpts.rpm} onChange={(e) => useApp.getState().setFinish3dOpts({ rpm: Number(e.target.value) })} style={{ width: 56 }} /></label>
          <label title="安全余量高 mm（加到顶面之上做快移层）">安Z <input type="number" step={1} min={1} value={finish3dOpts.safeZ} onChange={(e) => useApp.getState().setFinish3dOpts({ safeZ: Number(e.target.value) })} style={{ width: 40 }} /></label>
          <button className="cs-btn" title="👁 出 G-code 前先睇刀路（顶视图 — 快移虚线、切削按深度着色）" onClick={() => void useApp.getState().runFinish3d('preview')}>👁 预览刀路</button>
        </CommandDialog>
      )}

      {laserDlg && (
        <CommandDialog icon="default" title="激光切割参数" onOk={() => { useApp.getState().exportLaserGcode(useApp.getState().laserOpts); useApp.getState().closeLaserDlg() }} onCancel={() => useApp.getState().closeLaserDlg()}>
          <label title="材料预设（10W 级二极管激光 GRBL 起步参考值 — 每部机/每批料都唔同，务必喺废料试切校准！透明亚克力二极管切唔到，要黑色/深色）">预设 <select defaultValue="" onChange={(e) => {
            const P: Record<string, { feed: number; power: number; passes: number; kerf: number }> = {
              ply3: { feed: 240, power: 1000, passes: 3, kerf: 0.15 }, ply5: { feed: 160, power: 1000, passes: 5, kerf: 0.18 },
              acr3: { feed: 140, power: 1000, passes: 4, kerf: 0.2 }, card: { feed: 800, power: 550, passes: 1, kerf: 0.08 },
              leather: { feed: 350, power: 850, passes: 2, kerf: 0.12 }, corr: { feed: 600, power: 700, passes: 1, kerf: 0.1 },
            }
            if (P[e.target.value]) useApp.getState().setLaserOpts(P[e.target.value])
          }} style={{ height: 26 }}>
            <option value="">自定义</option><option value="ply3">椴木板 3mm</option><option value="ply5">椴木板 5mm</option><option value="acr3">黑亚克力 3mm</option><option value="card">卡纸</option><option value="leather">皮革 2mm</option><option value="corr">瓦楞纸箱</option>
          </select></label>
          <label title="切割进给速度 mm/min（越慢切得越深）">进给 <input type="number" step={20} min={10} value={laserOpts.feed} onChange={(e) => useApp.getState().setLaserOpts({ feed: Number(e.target.value) })} style={{ width: 56 }} /> mm/min</label>
          <label title="激光功率 S 字（GRBL $30=1000 即 0–1000 = 0–100%）">功率 <input type="number" step={50} min={0} max={1000} value={laserOpts.power} onChange={(e) => useApp.getState().setLaserOpts({ power: Number(e.target.value) })} style={{ width: 52 }} /> /1000</label>
          <label title="每个轮廓重复切几道（厚料多道，每道都齐速全功率）">道数 <input type="number" step={1} min={1} max={20} value={laserOpts.passes} onChange={(e) => useApp.getState().setLaserOpts({ passes: Number(e.target.value) })} style={{ width: 40 }} /></label>
          <label title="kerf 光束半宽补偿 mm：外框外扩、孔内缩 — 切出嚟先系图纸尺寸（0 = 不补偿；二极管典型 0.1–0.2）">kerf <input type="number" step={0.05} min={0} max={1} value={laserOpts.kerf} onChange={(e) => useApp.getState().setLaserOpts({ kerf: Number(e.target.value) })} style={{ width: 48 }} /> mm</label>
          <button className="cs-btn" title="👁 出 G-code 前先睇刀路（顶视图 — 快移虚线 + 切割路径）" onClick={() => void useApp.getState().previewGcode('laser')}>👁 预览刀路</button>
        </CommandDialog>
      )}

      {featDlg && (
        <CommandDialog icon={featDlg.kind === 'geoPattern' ? 'pattern' : (FD_ICON[featDlg.kind] ?? 'default')} title={tStatus((featDlg.editId ? '编辑 · ' : '') + (featDlg.kind === 'geoPattern' ? '几何阵列' : (FD_TITLE[featDlg.kind] ?? featDlg.kind)), lang)} okDisabled={
          ((featDlg.kind === 'pattern' || featDlg.kind === 'circpattern') && (String(featDlg.params.objectType ?? 'bodies') === 'features' ? !cpSelFeat : String(featDlg.params.objectType ?? 'bodies') === 'components' ? !cpSelCompCount : String(featDlg.params.objectType ?? 'bodies') === 'faces' ? !facePatternPicks.length : !+featDlg.params.objectPicked)) ||
          (featDlg.kind === 'geoPattern' && !featDlg.editId && !cpSelFeat) ||
          (featDlg.kind === 'move' && String(featDlg.params.objectType ?? 'bodies') === 'components' && !selectedComponent && checkedComps.length === 0) ||
          (featDlg.kind === 'automatedmodel' && (((featDlg.payload as { picks?: unknown[] } | undefined)?.picks?.length ?? 0) !== 2 || !(+featDlg.params.radius > 0)))
        } onOk={() => void commitFeatDlg()} onCancel={() => cancelFeatDlg()}>
          {featDlg.editId && <div style={{ fontSize: 11, color: '#8a97a2', marginBottom: 4 }}>{tStatus('编辑模式：改参数 → 确定重建；棱/面选择集及轮廓保留原值', lang)}</div>}
          {featDlg.kind === 'automatedmodel' && (() => {
            const picks = ((featDlg.payload as { picks?: { p: [number, number, number] }[] } | undefined)?.picks ?? [])
            const fmt = (p?: { p: [number, number, number] }) => p ? `✓ (${p.p.map((v) => v.toFixed(1)).join(', ')})` : '等待在画布点选平面面'
            return <>
              <div style={{ fontSize: 11, lineHeight: 1.45, color: '#64727d', padding: '2px 0 6px' }}>Connector v1：依次点选两张<b>平面面</b>，建立一个独立实体连接器。曲面面、避让体及 Fusion 生成式 alternatives 暂未包含。</div>
              <div style={{ fontSize: 12, color: picks[0] ? '#257c45' : '#9a6a1b' }}>面 1：{fmt(picks[0])}</div>
              <div style={{ fontSize: 12, color: picks[1] ? '#257c45' : '#9a6a1b' }}>面 2：{fmt(picks[1])}</div>
              <label title="连接器半径（mm）；结果会作为 New Body 保留，可在时间轴编辑。">连接半径 <input type="number" step={0.5} min={0.1} value={featDlg.params.radius} onChange={(e) => setFeatParam('radius', Number(e.target.value))} style={{ width: 58 }} /> mm</label>
              <div style={{ fontSize: 11, color: '#8a97a2' }}>选满两面后再次点选，会由第 1 面重新开始。</div>
            </>
          })()}
          {featDlg.kind === 'geoPattern' && (() => {
            let instances: any[] = []
            try { const parsed = JSON.parse(String(featDlg.params.instances ?? '[]')); if (Array.isArray(parsed)) instances = parsed } catch { /* show editable default; commit reports malformed advanced data */ }
            const primary = instances[0] ?? { translation: [30, 0, 0] }
            const translation = Array.isArray(primary.translation) ? primary.translation : [0, 0, 0]
            const rotation = primary.rotation ?? { angle: 0, origin: [0, 0, 0], axis: [0, 0, 1] }
            const updatePrimary = (next: any) => { const out = instances.map((item) => ({ ...item })); out[0] = next; setFeatParam('instances', JSON.stringify(out)) }
            const updateTranslation = (index: number, value: number) => { const next = { ...primary, translation: [Number(translation[0]) || 0, Number(translation[1]) || 0, Number(translation[2]) || 0] }; next.translation[index] = value; updatePrimary(next) }
            const updateRotation = (key: 'angle' | 'axis', index: number, value: number) => { const nextRot = { angle: Number(rotation.angle) || 0, origin: Array.isArray(rotation.origin) ? rotation.origin : [0, 0, 0], axis: Array.isArray(rotation.axis) ? [...rotation.axis] : [0, 0, 1] }; if (key === 'angle') nextRot.angle = value; else nextRot.axis[index] = value; updatePrimary({ ...primary, rotation: nextRot }) }
            return <>
              <div style={{ color: '#6b7680', fontWeight: 600 }}>Objects</div>
              <div style={{ fontSize: 11, color: cpSelFeat ? '#2c7' : '#c60' }}>{cpSelFeat ? `✓ ${tStatus('已選時間軸特徵', lang)}` : tStatus('先在時間軸選擇一個或多個特徵（Ctrl 可多選）', lang)}</div>
              <div style={{ color: '#6b7680', fontWeight: 600, borderTop: '1px solid #d9e0e5', paddingTop: 8 }}>{tStatus('第一個實例', lang)}</div>
              <label>{tStatus('平移 X', lang)} <input type="number" step={1} value={translation[0] ?? 0} onChange={(e) => updateTranslation(0, Number(e.target.value))} style={{ width: 54 }} /> mm</label>
              <label>{tStatus('平移 Y', lang)} <input type="number" step={1} value={translation[1] ?? 0} onChange={(e) => updateTranslation(1, Number(e.target.value))} style={{ width: 54 }} /> mm</label>
              <label>{tStatus('平移 Z', lang)} <input type="number" step={1} value={translation[2] ?? 0} onChange={(e) => updateTranslation(2, Number(e.target.value))} style={{ width: 54 }} /> mm</label>
              <label>{tStatus('旋轉角度', lang)} <input type="number" step={5} value={rotation.angle ?? 0} onChange={(e) => updateRotation('angle', 0, Number(e.target.value))} style={{ width: 54 }} />°</label>
              <label>{tStatus('旋轉軸', lang)} <input type="number" step={0.1} value={rotation.axis?.[0] ?? 0} onChange={(e) => updateRotation('axis', 0, Number(e.target.value))} style={{ width: 40 }} /><input type="number" step={0.1} value={rotation.axis?.[1] ?? 0} onChange={(e) => updateRotation('axis', 1, Number(e.target.value))} style={{ width: 40 }} /><input type="number" step={0.1} value={rotation.axis?.[2] ?? 1} onChange={(e) => updateRotation('axis', 2, Number(e.target.value))} style={{ width: 40 }} /></label>
              <details>
                <summary>{tStatus(`進階：${instances.length || 1} 個實例`, lang)}</summary>
                <textarea aria-label={tStatus('進階實例資料', lang)} value={String(featDlg.params.instances ?? '[]')} onChange={(e) => setFeatParam('instances', e.target.value)} spellCheck={false} style={{ display: 'block', width: '100%', minHeight: 72, marginTop: 4, fontFamily: 'monospace', fontSize: 11, boxSizing: 'border-box' }} />
              </details>
              <label title={tStatus('抑制實例：逗號分隔實例索引（0 是列表內第一個副本；seed 不在列表）。', lang)}>{tStatus('抑制實例', lang)} <input type="text" value={String(featDlg.params.suppress ?? '')} onChange={(e) => setFeatParam('suppress', e.target.value)} placeholder="2,5" style={{ width: 84 }} /></label>
              <label title={tStatus('計算選項目前保留為時間軸意圖；剛體幾何使用同一穩定重建路徑。', lang)}>{tStatus('計算', lang)} <select value={String(featDlg.params.compute ?? 'optimized')} onChange={(e) => setFeatParam('compute', e.target.value)} style={{ height: 26 }}><option value="optimized">{tStatus('優化', lang)}</option><option value="identical">{tStatus('相同', lang)}</option><option value="adjust">{tStatus('調整', lang)}</option></select></label>
            </>
          })()}
          {featDlg.kind === 'pattern' && (<>
            {/* GM-3DV1 S3：对象类型（Fusion Object Type）— 整个实体/所选特征已实现；面/组件 v1 诚实拒绝 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span>{tStatus('对象', lang)}</span>
              {String(featDlg.params.objectType ?? 'bodies') === 'features'
                ? <span style={{ color: cpSelFeat ? '#2c7' : '#c60' }}>{cpSelFeat ? `✓ ${tStatus('已选特征', lang)}` : tStatus('在时间轴选择特征', lang)}</span>
                : String(featDlg.params.objectType ?? 'bodies') === 'faces'
                  ? <><button className={'cs-btn pick-slot' + (facePatternPick ? ' active' : '')} onClick={() => useApp.getState().startFacePatternPick()}>🎯{tStatus('選面', lang)}</button><span style={{ color: facePatternPicks.length ? '#2c7' : '#c60' }}>{facePatternPicks.length ? `✓ ${tStatus('已選面', lang)} ×${facePatternPicks.length}` : tStatus('在畫布點選面', lang)}</span>{facePatternPicks.length > 0 && <button className="cs-btn" onClick={() => useApp.getState().clearFacePatternPicks()}>{tStatus('清除', lang)}</button>}</>
                : <button className="cs-btn" onClick={() => setFeatParam('objectPicked', 1)}>{+featDlg.params.objectPicked ? `✓ ${tStatus('活动实体', lang)}` : tStatus('选择', lang)}</button>}
            </div>
            <label title={tStatus('面陣列會建立獨立 B-rep 曲面副本；之後可用 Stitch 或 Thicken 轉成後續幾何。', lang)}>{tStatus('对象类型', lang)} <select value={String(featDlg.params.objectType ?? 'bodies')} onChange={(e) => { const v = e.target.value; setFeatParam('objectType', v); setFeatParam('target', v === 'features' ? 'feature' : 'body') }} style={{ height: 26 }}><option value="bodies">{tStatus('整个实体', lang)}</option><option value="faces">{tStatus('面', lang)}</option><option value="features">{tStatus('所选特征', lang)}</option><option value="components">{tStatus('组件', lang)}</option></select></label>
            {String(featDlg.params.objectType ?? 'bodies') === 'components' && <span style={{ fontSize: 11, color: cpSelCompCount ? '#2c7' : '#c60' }}>{cpSelCompCount ? `✓ ${tStatus('已选组件', lang)} ×${cpSelCompCount}（${tStatus('共享定义的 occurrence 阵列', lang)}）` : tStatus('← 先喺装配树勾选 ☑ 或画布选中组件', lang)}</span>}
            {featDlg.params.target === 'feature' && <span style={{ fontSize: 11, color: cpSelFeat ? '#2c7' : '#c60' }}>{cpSelFeat ? `✓ ${tStatus('已选特征', lang)} ×${useApp.getState().selectedFeatures.length || 1}` : tStatus('← 先喺时间轴单击选中特征', lang)}</span>}
            <label title={tStatus('距离类型（Fusion Distance Type）：间距 = 相邻副本距离；总长 = 首末副本总跨距（间距自动 = 总长÷(数量−1)）', lang)}>{tStatus('距离', lang)} <select value={String(featDlg.params.dtype ?? 'spacing')} onChange={(e) => setFeatParam('dtype', e.target.value)} style={{ height: 26 }}><option value="spacing">{tStatus('间距', lang)}</option><option value="extent">{tStatus('总长', lang)}</option></select></label>
            <label>{tStatus('X数量', lang)} <input type="number" min={1} step={1} value={featDlg.params.countX} onChange={(e) => setFeatParam('countX', Number(e.target.value))} style={{ width: 46 }} /></label>
            <label>{tStatus(featDlg.params.dtype === 'extent' ? 'X总长' : 'X间距', lang)} <input type="number" step={5} value={featDlg.params.dx} onChange={(e) => setFeatParam('dx', Number(e.target.value))} style={{ width: 56 }} /></label>
            <label>{tStatus('Y数量', lang)} <input type="number" min={1} step={1} value={featDlg.params.countY} onChange={(e) => setFeatParam('countY', Number(e.target.value))} style={{ width: 46 }} /></label>
            <label>{tStatus(featDlg.params.dtype === 'extent' ? 'Y总长' : 'Y间距', lang)} <input type="number" step={5} value={featDlg.params.dy} onChange={(e) => setFeatParam('dy', Number(e.target.value))} style={{ width: 56 }} /></label>
            <label title={tStatus('层数（Z 方向，1=平面阵列）', lang)}>{tStatus('Z层数', lang)} <input type="number" min={1} step={1} value={featDlg.params.countZ ?? 1} onChange={(e) => setFeatParam('countZ', Number(e.target.value))} style={{ width: 46 }} /></label>
            <label title={tStatus('Z 方向层间距', lang)}>{tStatus(featDlg.params.dtype === 'extent' ? 'Z总长' : 'Z间距', lang)} <input type="number" step={5} value={featDlg.params.dz ?? 60} onChange={(e) => setFeatParam('dz', Number(e.target.value))} style={{ width: 56 }} /></label>
            {(useApp.getState().bodyMesh?.parked?.length ?? 0) > 0 && !featDlg.params.target && (
              <label style={{ justifyContent: 'flex-start', gap: 6, fontSize: 12 }} title={tStatus('对象类型 Bodies（Fusion Object Type）：连所有泊车实体一齐阵列（每个泊车体各自铺栅格副本）。关＝只阵列活动实体。', lang)}>
                <input type="checkbox" checked={!!featDlg.params.bodies} onChange={(e) => setFeatParam('bodies', e.target.checked ? 1 : 0)} /> {tStatus('连泊车体一齐阵列', lang)}
              </label>
            )}
            <div style={{ display: 'flex', gap: 8, fontSize: 12 }} title={tStatus('对称（Fusion Symmetric direction）：原件居中，副本向两边铺（仅奇数数量生效，偶数退单向）', lang)}>
              <span style={{ color: '#6b7680' }}>{tStatus('对称', lang)}</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 2 }}><input type="checkbox" checked={!!+(featDlg.params.symX || 0)} onChange={(e) => setFeatParam('symX', e.target.checked ? 1 : 0)} />X</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 2 }}><input type="checkbox" checked={!!+(featDlg.params.symY || 0)} onChange={(e) => setFeatParam('symY', e.target.checked ? 1 : 0)} />Y</label>
              {(+featDlg.params.countZ || 1) > 1 && <label style={{ display: 'flex', alignItems: 'center', gap: 2 }}><input type="checkbox" checked={!!+(featDlg.params.symZ || 0)} onChange={(e) => setFeatParam('symZ', e.target.checked ? 1 : 0)} />Z</label>}
            </div>
            {useApp.getState().caxes.length > 0 && (<>
              <label title={tStatus('方向1（X 间距沿此方向）：用已建构造轴驱动，缺省=世界 X 轴。选中后 X 间距沿该轴铺（斜向/对角阵列）。', lang)}>{tStatus('方向1', lang)} <select value={String(featDlg.params.dir1 ?? '')} onChange={(e) => setFeatParam('dir1', e.target.value)} style={{ height: 26 }}><option value="">{tStatus('— 世界 X 轴 —', lang)}</option>{useApp.getState().caxes.map((ca, i) => { const LV: Record<string, [number, number, number]> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }; const dv = ca.dirV ?? LV[ca.dir]; return <option key={'D1A' + i} value={dv.join(',')}>{tStatus('构造轴', lang)}{i + 1}（{ca.dirV ? ca.dirV.map((v) => +v.toFixed(1)).join(',') : ca.dir}）</option> })}</select></label>
              <label title={tStatus('方向2（Y 间距沿此方向）：用已建构造轴驱动，缺省=世界 Y 轴。选中后 Y 间距沿该轴铺。', lang)}>{tStatus('方向2', lang)} <select value={String(featDlg.params.dir2 ?? '')} onChange={(e) => setFeatParam('dir2', e.target.value)} style={{ height: 26 }}><option value="">{tStatus('— 世界 Y 轴 —', lang)}</option>{useApp.getState().caxes.map((ca, i) => { const LV: Record<string, [number, number, number]> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }; const dv = ca.dirV ?? LV[ca.dir]; return <option key={'D2A' + i} value={dv.join(',')}>{tStatus('构造轴', lang)}{i + 1}（{ca.dirV ? ca.dirV.map((v) => +v.toFixed(1)).join(',') : ca.dir}）</option> })}</select></label>
            </>)}
            {/* GM-3DV1 S3：逐实例抑制 + Compute Option */}
            <label title={tStatus('抑制实例（Fusion Suppression）：逗号分隔要跳过嘅副本索引（0=原件，之后按 (i*Y层+j)*Z层+k 顺序）。例：2,5', lang)}>{tStatus('抑制实例', lang)} <input type="text" value={String(featDlg.params.suppress ?? '')} onChange={(e) => setFeatParam('suppress', e.target.value)} placeholder="2,5" style={{ width: 84 }} /></label>
            <label title={tStatus('计算选项（Fusion Compute Option）：优化=快、碰撞副本重算；相同=全部同一形状（快）；调整=逐副本重算（慢，处理碰撞）。直通提示，v1 不改几何。', lang)}>{tStatus('计算', lang)} <select value={String(featDlg.params.compute ?? 'optimized')} onChange={(e) => setFeatParam('compute', e.target.value)} style={{ height: 26 }}><option value="optimized">{tStatus('优化', lang)}</option><option value="identical">{tStatus('相同', lang)}</option><option value="adjust">{tStatus('调整', lang)}</option></select></label>
          </>)}
          {featDlg.kind === 'cpattern' && (<>
            <label>{tStatus('轴', lang)} <select value={featDlg.params.axis} onChange={(e) => setFeatParam('axis', e.target.value)} style={{ height: 26 }}><option>X</option><option>Y</option><option>Z</option></select></label>
            <label>{tStatus('数量', lang)} <input type="number" min={2} step={1} value={featDlg.params.count} onChange={(e) => setFeatParam('count', Number(e.target.value))} style={{ width: 46 }} /></label>
            <label>{tStatus('角度', lang)} <input type="number" step={15} value={featDlg.params.angle} onChange={(e) => setFeatParam('angle', Number(e.target.value))} style={{ width: 56 }} />°</label>
            <label title={tStatus('旋转中心（CAD 坐标，默认原点）。绕偏心轴阵列时设置。', lang)}>{tStatus('中心', lang)} <input type="number" step={5} value={featDlg.params.cx} onChange={(e) => setFeatParam('cx', Number(e.target.value))} style={{ width: 40 }} /><input type="number" step={5} value={featDlg.params.cy} onChange={(e) => setFeatParam('cy', Number(e.target.value))} style={{ width: 40 }} /><input type="number" step={5} value={featDlg.params.cz} onChange={(e) => setFeatParam('cz', Number(e.target.value))} style={{ width: 40 }} /></label>
            {useApp.getState().cpoints.length > 0 && (
              <label title={tStatus('用已建构造点做旋转中心：选中后自动填中心 cx/cy/cz（Fusion『绕此点阵列』）', lang)}>{tStatus('构造点', lang)} <select value="" onChange={(e) => { const i = Number(e.target.value); if (!Number.isInteger(i)) return; const cp = useApp.getState().cpoints[i]; if (!cp) return; setFeatParam('cx', cp[0]); setFeatParam('cy', cp[1]); setFeatParam('cz', cp[2]) }} style={{ height: 26 }}><option value="">{tStatus('— 选构造点 —', lang)}</option>{useApp.getState().cpoints.map((cp, i) => <option key={'CP' + i} value={i}>{tStatus('构造点', lang)}{i + 1}（{cp.map((v) => +v.toFixed(0)).join(',')}）</option>)}</select></label>
            )}
          </>)}
          {featDlg.kind === 'circpattern' && (<>
            {/* GM-3DV1 S3：对象类型（同矩形阵列） */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span>{tStatus('对象', lang)}</span>
              {String(featDlg.params.objectType ?? 'bodies') === 'features'
                ? <span style={{ color: cpSelFeat ? '#2c7' : '#c60' }}>{cpSelFeat ? `✓ ${tStatus('已选特征', lang)}` : tStatus('在时间轴选择特征', lang)}</span>
                : String(featDlg.params.objectType ?? 'bodies') === 'faces'
                  ? <><button className={'cs-btn pick-slot' + (facePatternPick ? ' active' : '')} onClick={() => useApp.getState().startFacePatternPick()}>🎯{tStatus('選面', lang)}</button><span style={{ color: facePatternPicks.length ? '#2c7' : '#c60' }}>{facePatternPicks.length ? `✓ ${tStatus('已選面', lang)} ×${facePatternPicks.length}` : tStatus('在畫布點選面', lang)}</span>{facePatternPicks.length > 0 && <button className="cs-btn" onClick={() => useApp.getState().clearFacePatternPicks()}>{tStatus('清除', lang)}</button>}</>
                : <button className="cs-btn" onClick={() => setFeatParam('objectPicked', 1)}>{+featDlg.params.objectPicked ? `✓ ${tStatus('活动实体', lang)}` : tStatus('选择', lang)}</button>}
            </div>
            <label title={tStatus('面陣列會建立獨立 B-rep 曲面副本；之後可用 Stitch 或 Thicken 轉成後續幾何。', lang)}>{tStatus('对象类型', lang)} <select value={String(featDlg.params.objectType ?? 'bodies')} onChange={(e) => { const v = e.target.value; setFeatParam('objectType', v); setFeatParam('target', v === 'features' ? 'feature' : 'body') }} style={{ height: 26 }}><option value="bodies">{tStatus('整个实体', lang)}</option><option value="faces">{tStatus('面', lang)}</option><option value="features">{tStatus('所选特征', lang)}</option><option value="components">{tStatus('组件', lang)}</option></select></label>
            {String(featDlg.params.objectType ?? 'bodies') === 'components' && <span style={{ fontSize: 11, color: cpSelCompCount ? '#2c7' : '#c60' }}>{cpSelCompCount ? `✓ ${tStatus('已选组件', lang)} ×${cpSelCompCount}（${tStatus('共享定义的 occurrence 阵列', lang)}）` : tStatus('← 先喺装配树勾选 ☑ 或画布选中组件', lang)}</span>}
            {featDlg.params.target === 'feature' && <span style={{ fontSize: 11, color: cpSelFeat ? '#2c7' : '#c60' }}>{cpSelFeat ? `✓ ${tStatus('已选特征', lang)} ×${useApp.getState().selectedFeatures.length || 1}` : tStatus('← 先喺时间轴单击选中特征', lang)}</span>}
            <label title={tStatus('轴方向预设（写入下面方向分量；要斜轴直接改分量）', lang)}>{tStatus('轴', lang)} <select value={String(featDlg.params.dx) === '1' ? 'X' : String(featDlg.params.dy) === '1' ? 'Y' : String(featDlg.params.dz) === '1' ? 'Z' : 'C'} onChange={(e) => { const v = e.target.value; if (v === 'X') { setFeatParam('dx', 1); setFeatParam('dy', 0); setFeatParam('dz', 0) } else if (v === 'Y') { setFeatParam('dx', 0); setFeatParam('dy', 1); setFeatParam('dz', 0) } else if (v === 'Z') { setFeatParam('dx', 0); setFeatParam('dy', 0); setFeatParam('dz', 1) } }} style={{ height: 26 }}><option value="Z">Z</option><option value="X">X</option><option value="Y">Y</option><option value="C">{tStatus('自定义', lang)}</option></select></label>
            <button className={'cs-btn pick-slot' + (cpatAxisPickA ? ' active' : '')} title={tStatus('拾轴：点活动实体嘅圆柱面（孔壁/圆轴/凸台侧面）— 轴点+方向自动填', lang)} onClick={() => useApp.getState().startCpatAxisPick()}>{tStatus('🎯拾轴', lang)}</button>
            {useApp.getState().caxes.length > 0 && (
              <label title={tStatus('用已建构造轴驱动阵列轴：选中后自动填轴点(origin)+方向(dir，含任意斜向 dirV)', lang)}>{tStatus('构造轴', lang)} <select value="" onChange={(e) => { const i = Number(e.target.value); if (!Number.isInteger(i)) return; const ca = useApp.getState().caxes[i]; if (!ca) return; const LV: Record<string, [number, number, number]> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }; const dv = ca.dirV ?? LV[ca.dir]; setFeatParam('ox', ca.at[0]); setFeatParam('oy', ca.at[1]); setFeatParam('oz', ca.at[2]); setFeatParam('dx', dv[0]); setFeatParam('dy', dv[1]); setFeatParam('dz', dv[2]) }} style={{ height: 26 }}><option value="">{tStatus('— 选构造轴 —', lang)}</option>{useApp.getState().caxes.map((ca, i) => <option key={'CA' + i} value={i}>{tStatus('构造轴', lang)}{i + 1}（{ca.dirV ? ca.dirV.map((v) => +v.toFixed(1)).join(',') : ca.dir} @ {ca.at.map((v) => +v.toFixed(0)).join(',')}）</option>)}</select></label>
            )}
            {useApp.getState().cpoints.length > 0 && (
              <label title={tStatus('用已建构造点做阵列轴点（origin）：选中后自动填轴点 ox/oy/oz（Fusion『绕此点阵列』）', lang)}>{tStatus('构造点', lang)} <select value="" onChange={(e) => { const i = Number(e.target.value); if (!Number.isInteger(i)) return; const cp = useApp.getState().cpoints[i]; if (!cp) return; setFeatParam('ox', cp[0]); setFeatParam('oy', cp[1]); setFeatParam('oz', cp[2]) }} style={{ height: 26 }}><option value="">{tStatus('— 选构造点 —', lang)}</option>{useApp.getState().cpoints.map((cp, i) => <option key={'CP' + i} value={i}>{tStatus('构造点', lang)}{i + 1}（{cp.map((v) => +v.toFixed(0)).join(',')}）</option>)}</select></label>
            )}
            <label title={tStatus('轴经过嘅点（CAD 坐标）— 绕偏心轴阵列时设置', lang)}>{tStatus('轴点', lang)} <input type="number" step={5} value={featDlg.params.ox} onChange={(e) => setFeatParam('ox', Number(e.target.value))} style={{ width: 40 }} /><input type="number" step={5} value={featDlg.params.oy} onChange={(e) => setFeatParam('oy', Number(e.target.value))} style={{ width: 40 }} /><input type="number" step={5} value={featDlg.params.oz} onChange={(e) => setFeatParam('oz', Number(e.target.value))} style={{ width: 40 }} /></label>
            <label title={tStatus('轴方向分量（可以斜轴，例 1,0,1）', lang)}>{tStatus('方向', lang)} <input type="number" step={1} value={featDlg.params.dx} onChange={(e) => setFeatParam('dx', Number(e.target.value))} style={{ width: 36 }} /><input type="number" step={1} value={featDlg.params.dy} onChange={(e) => setFeatParam('dy', Number(e.target.value))} style={{ width: 36 }} /><input type="number" step={1} value={featDlg.params.dz} onChange={(e) => setFeatParam('dz', Number(e.target.value))} style={{ width: 36 }} /></label>
            <label>{tStatus('数量', lang)} <input type="number" min={2} max={400} step={1} value={featDlg.params.count} onChange={(e) => setFeatParam('count', Number(e.target.value))} style={{ width: 46 }} /></label>
            <label title={tStatus('完整 = 360° 均分；指定角度 = 副本铺满指定角（端点含）；对称 = 以原件为中心 ± 对称分布', lang)}>{tStatus('角度', lang)} <select value={featDlg.params.mode} onChange={(e) => setFeatParam('mode', e.target.value)} style={{ height: 26 }}><option value="full">{tStatus('完整 360°', lang)}</option><option value="angle">{tStatus('指定角度', lang)}</option><option value="sym">{tStatus('对称', lang)}</option></select></label>
            {featDlg.params.mode !== 'full' && <label>{tStatus('总角', lang)} <input type="number" step={15} value={featDlg.params.totalAngle} onChange={(e) => setFeatParam('totalAngle', Number(e.target.value))} style={{ width: 56 }} />°</label>}
            {/* GM-3DV1 S3：逐实例抑制 + Compute Option（环形：0=原件，1..count-1 按角度顺序） */}
            <label title={tStatus('抑制实例（Fusion Suppression）：逗号分隔要跳过嘅副本索引（0=原件，1..数量-1 按角度顺序）。例：2,5', lang)}>{tStatus('抑制实例', lang)} <input type="text" value={String(featDlg.params.suppress ?? '')} onChange={(e) => setFeatParam('suppress', e.target.value)} placeholder="2,5" style={{ width: 84 }} /></label>
            <label title={tStatus('计算选项（Fusion Compute Option）：优化/相同/调整。直通提示，v1 不改几何。', lang)}>{tStatus('计算', lang)} <select value={String(featDlg.params.compute ?? 'optimized')} onChange={(e) => setFeatParam('compute', e.target.value)} style={{ height: 26 }}><option value="optimized">{tStatus('优化', lang)}</option><option value="identical">{tStatus('相同', lang)}</option><option value="adjust">{tStatus('调整', lang)}</option></select></label>
          </>)}
          {featDlg.kind === 'mirror' && (<>
            {/* P2：Fusion Mirror Plane 手势 — 直接点画布任意平面面做镜像面 */}
            <button className={'cs-btn pick-slot' + (mirrorFacePickA ? ' active' : '')} title={tStatus('拾镜像面：点实体上任意【平面】（唔使先造构造面）', lang)} onClick={() => useApp.getState().startMirrorFacePick()}>{tStatus('🎯拾面', lang)}</button>
            {String(featDlg.params.plane) === 'PICK' && <span style={{ fontSize: 11, color: '#16a36b' }}>{tStatus('✓ 已拾镜像面', lang)}（[{String(featDlg.params.pickN)}]）</span>}
            <label title={tStatus('镜像对象：整个实体 = 成件镜像合并；所选特征 = 净镜像嗰个特征嘅增/切区域（对称孔/凸台）；组件 = 镜像装配树勾选/选中嘅组件，支持偏移、构造面及所拾平面。', lang)}>{tStatus('对象', lang)} <select value={featDlg.params.target ?? 'body'} onChange={(e) => setFeatParam('target', e.target.value)} style={{ height: 26 }}><option value="body">{tStatus('整个实体', lang)}</option><option value="feature">{tStatus('所选特征', lang)}</option><option value="components">{tStatus('组件', lang)}</option></select></label>
            {featDlg.params.target === 'feature' && <span style={{ fontSize: 11, color: cpSelFeat ? '#2c7' : '#c60' }}>{cpSelFeat ? `✓ ${tStatus('已选特征', lang)} ×${useApp.getState().selectedFeatures.length || 1}` : tStatus('← 先喺时间轴单击选中特征', lang)}</span>}
            {featDlg.params.target === 'components' && (() => { const n = useApp.getState().checkedComps.length || (useApp.getState().selectedComponent ? 1 : 0); return <span style={{ fontSize: 11, color: n ? '#2c7' : '#c60' }}>{n ? `✓ ${tStatus('已选组件', lang)} ×${n}（${tStatus('支持偏移、构造面及所拾平面', lang)}）` : tStatus('← 先喺装配树勾选 ☑ 或选中组件', lang)}</span> })()}
            <label title={tStatus('镜像基准面：三个世界面（可加偏移）或任意构造面；组件镜像同样支持。', lang)}>{tStatus('镜像面', lang)} <select value={featDlg.params.plane} onChange={(e) => setFeatParam('plane', e.target.value)} style={{ height: 26 }}>{String(featDlg.params.plane) === 'PICK' && <option value="PICK">🎯 {tStatus('拾取面', lang)}</option>}<option>XY</option><option>XZ</option><option>YZ</option>{useApp.getState().planes.map((pl, i) => pl.arb ? <option key={'P' + i} value={'P' + i}>{tStatus('构造面', lang)}{i + 1}</option> : null)}</select></label>
            {!String(featDlg.params.plane).startsWith('P') && <label>{tStatus('偏移', lang)} <input type="number" step={5} value={featDlg.params.offset} onChange={(e) => setFeatParam('offset', Number(e.target.value))} style={{ width: 56 }} /></label>}
            {(featDlg.params.target ?? 'body') === 'body' && (
              <label style={{ justifyContent: 'flex-start', gap: 6, fontSize: 12 }} title={tStatus('操作 New Body（Fusion Mirror Operation）：镜像副本泊车做独立实体（唔 fuse 入活动体）。关＝Join 融合成一件。', lang)}>
                <input type="checkbox" checked={!!featDlg.params.mirrorOp} onChange={(e) => setFeatParam('mirrorOp', e.target.checked ? 1 : 0)} /> {tStatus('镜像出独立实体', lang)}
              </label>
            )}
          </>)}
          {/* GM-3DV3 M1：Move/Copy 五模式(自由/平移/旋转/点对点/点对位) ＋ 对象类型 ＋ Create Copy */}
          {featDlg.kind === 'move' && (() => {
            const mt = String(featDlg.params.moveType ?? 'free')
            const objectType = String(featDlg.params.objectType ?? 'bodies')
            const moveComponentCount = checkedComps.length || (selectedComponent ? 1 : 0)
            const modes: [string, string, string][] = [['free', '自由', '六自由度：dx/dy/dz + 绕件中心 X/Y/Z'], ['translate', '平移', '只平移 dx/dy/dz'], ['rotate', '旋转', '单轴 + 角度（绕件中心）'], ['ptp', '点对点', '把 P1 搬到 P2（两点坐标）'], ['ptpos', '点对位', '把 P1 搬到目的坐标 P2']]
            return (<>
              <label title={tStatus('对象类型（Fusion Move Object）：当前完整支持活动实体和已选组件；面与草图须用专属工具。', lang)}>{tStatus('对象', lang)} <select value={objectType} onChange={(e) => setFeatParam('objectType', e.target.value)} style={{ height: 26 }}><option value="bodies">{tStatus('活动实体', lang)}</option><option value="components">{tStatus('组件', lang)}</option><option value="faces" disabled>{tStatus('面（用移动面）', lang)}</option><option value="sketch" disabled>{tStatus('草图（草图环境）', lang)}</option></select></label>
              {objectType === 'bodies' ? <SelectionChip label={tStatus('对象', lang)} count={1} hint={tStatus('活动实体会在确定后移动；在浏览器选择其他实体可先切换活动实体。', lang)} /> : <SelectionChip label={tStatus('组件', lang)} count={moveComponentCount} hint={moveComponentCount ? tStatus('已选组件；可在浏览树勾选多个组件，按 × 清除后重新选择。', lang) : tStatus('先在浏览树或画布选择一个或多个组件。', lang)} onClear={() => useApp.setState({ checkedComps: [], selectedComponent: null })} />}
              <div style={{ display: 'flex', gap: 3, width: '100%' }}>
                {modes.map(([v, lbl, tip]) => <button key={v} className={'sb-tool' + (mt === v ? ' active' : '')} style={{ flex: 1, fontSize: 11 }} title={tStatus(tip, lang)} onClick={() => setFeatParam('moveType', v)}>{tStatus(lbl, lang)}</button>)}
              </div>
              {(mt === 'free' || mt === 'translate') && (<>
                <label>dx <input type="number" step={5} value={featDlg.params.dx} onChange={(e) => setFeatParam('dx', Number(e.target.value))} style={{ width: 52 }} /></label>
                <label>dy <input type="number" step={5} value={featDlg.params.dy} onChange={(e) => setFeatParam('dy', Number(e.target.value))} style={{ width: 52 }} /></label>
                <label>dz <input type="number" step={5} value={featDlg.params.dz} onChange={(e) => setFeatParam('dz', Number(e.target.value))} style={{ width: 52 }} /></label>
              </>)}
              {mt === 'free' && (<>
                <label title={tStatus('绕件中心 X 轴旋转', lang)}>{tStatus('绕X°', lang)} <input type="number" step={15} value={featDlg.params.rx ?? 0} onChange={(e) => setFeatParam('rx', Number(e.target.value))} style={{ width: 50 }} /></label>
                <label title={tStatus('绕件中心 Y 轴旋转', lang)}>{tStatus('绕Y°', lang)} <input type="number" step={15} value={featDlg.params.ry ?? 0} onChange={(e) => setFeatParam('ry', Number(e.target.value))} style={{ width: 50 }} /></label>
                <label title={tStatus('绕件中心 Z 轴旋转', lang)}>{tStatus('绕Z°', lang)} <input type="number" step={15} value={featDlg.params.rz} onChange={(e) => setFeatParam('rz', Number(e.target.value))} style={{ width: 50 }} /></label>
              </>)}
              {mt === 'rotate' && (<>
                <label title={tStatus('旋转轴（绕件中心）', lang)}>{tStatus('轴', lang)} <select value={String(featDlg.params.raxis ?? 'Z')} onChange={(e) => setFeatParam('raxis', e.target.value)} style={{ height: 26 }}><option value="X">X</option><option value="Y">Y</option><option value="Z">Z</option></select></label>
                <label title={tStatus('旋转角°', lang)}>{tStatus('角度', lang)} <input type="number" step={15} value={featDlg.params.angle ?? 0} onChange={(e) => setFeatParam('angle', Number(e.target.value))} style={{ width: 56 }} />°</label>
              </>)}
              {(mt === 'ptp' || mt === 'ptpos') && (<>
                <div style={{ fontSize: 11, color: '#6b7680', width: '100%' }}>{tStatus(mt === 'ptp' ? 'P1=起点、P2=目标点（世界坐标）→ 平移 P2−P1' : 'P1=点、P2=目的坐标（世界坐标）→ 把 P1 搬到 P2', lang)}</div>
                <label>P1x <input type="number" step={1} value={featDlg.params.p1x ?? 0} onChange={(e) => setFeatParam('p1x', Number(e.target.value))} style={{ width: 48 }} /></label>
                <label>P1y <input type="number" step={1} value={featDlg.params.p1y ?? 0} onChange={(e) => setFeatParam('p1y', Number(e.target.value))} style={{ width: 48 }} /></label>
                <label>P1z <input type="number" step={1} value={featDlg.params.p1z ?? 0} onChange={(e) => setFeatParam('p1z', Number(e.target.value))} style={{ width: 48 }} /></label>
                <label>P2x <input type="number" step={1} value={featDlg.params.p2x ?? 0} onChange={(e) => setFeatParam('p2x', Number(e.target.value))} style={{ width: 48 }} /></label>
                <label>P2y <input type="number" step={1} value={featDlg.params.p2y ?? 0} onChange={(e) => setFeatParam('p2y', Number(e.target.value))} style={{ width: 48 }} /></label>
                <label>P2z <input type="number" step={1} value={featDlg.params.p2z ?? 0} onChange={(e) => setFeatParam('p2z', Number(e.target.value))} style={{ width: 48 }} /></label>
              </>)}
              <label style={{ justifyContent: 'flex-start', gap: 6, fontSize: 12 }} title={tStatus('Create Copy：留低原件、移动一个副本（Fusion Move/Copy 嘅复制半边）', lang)}><input type="checkbox" checked={!!+(featDlg.params.createCopy || 0)} onChange={(e) => setFeatParam('createCopy', e.target.checked ? 1 : 0)} /> {tStatus('创建副本', lang)}</label>
            </>)
          })()}
          {/* GM-3DV1 S1：Rib/Web 建立对话框 — 厚度/方向/范围/翻转/拔模（Web 多 Extend Curves） */}
          {featDlg.kind === 'rib' && (() => {
            const isWeb = !!(featDlg.payload && typeof featDlg.payload === 'object' && (featDlg.payload as { isWeb?: boolean }).isWeb)
            return (<>
              <label title={tStatus('筋壁厚度（沿中心线两侧或单侧铺开）', lang)}>{tStatus('厚度', lang)} <input type="number" min={0.1} step={0.5} value={featDlg.params.thickness} onChange={(e) => setFeatParam('thickness', Number(e.target.value))} style={{ width: 56 }} /> mm</label>
              <label title={tStatus('厚度方向（Fusion Thickness Direction）：对称=中心线两侧各半 / 单侧=全部厚度落中心线一侧', lang)}>{tStatus('厚度方向', lang)} <select value={String(featDlg.params.thDir ?? 'sym')} onChange={(e) => setFeatParam('thDir', e.target.value)} style={{ height: 26 }}><option value="sym">{tStatus('对称', lang)}</option><option value="one">{tStatus('单侧', lang)}</option></select></label>
              <label title={tStatus('范围（Fusion Extent）：到实体=向下落到实体底面并融合（需实体在下）/ 距离=向上按固定高度', lang)}>{tStatus('范围', lang)} <select value={String(featDlg.params.extent ?? 'next')} onChange={(e) => setFeatParam('extent', e.target.value)} style={{ height: 26 }}><option value="next">{tStatus('到实体', lang)}</option><option value="distance">{tStatus('距离', lang)}</option></select></label>
              {featDlg.params.extent === 'distance' && <label>{tStatus('高度', lang)} <input type="number" min={0.1} step={1} value={featDlg.params.height} onChange={(e) => setFeatParam('height', Number(e.target.value))} style={{ width: 56 }} /> mm</label>}
              <label title={tStatus('拔模角°：筋身向远端逐渐收窄（注塑/冲压脱模）', lang)}>{tStatus('拔模角', lang)} <input type="number" step={1} min={-85} max={85} value={featDlg.params.draft} onChange={(e) => setFeatParam('draft', Number(e.target.value))} style={{ width: 50 }} />°</label>
              <label style={{ justifyContent: 'flex-start', gap: 6, fontSize: 12 }} title={tStatus('翻转筋挤出方向（up↔down）', lang)}><input type="checkbox" checked={!!+(featDlg.params.flip || 0)} onChange={(e) => setFeatParam('flip', e.target.checked ? 1 : 0)} /> {tStatus('翻转方向', lang)}</label>
              {isWeb && <label style={{ justifyContent: 'flex-start', gap: 6, fontSize: 12 }} title={tStatus('延伸曲线（Fusion Web Extend Curves）：把开放折线端点外延到实体墙面，令交叉/近墙筋网自动闭合', lang)}><input type="checkbox" checked={!!+(featDlg.params.extend || 0)} onChange={(e) => setFeatParam('extend', e.target.checked ? 1 : 0)} /> {tStatus('延伸曲线到墙', lang)}</label>}
            </>)
          })()}
          {/* GM-3DV1 S9：Pipe 建立对话框 — 截面/尺寸/空心壁厚/距离/操作 */}
          {featDlg.kind === 'pipe' && (<>
            <label title={tStatus('截面形状（Fusion Section）：圆形 / 方形', lang)}>{tStatus('截面', lang)} <select value={String(featDlg.params.section ?? 'circular')} onChange={(e) => setFeatParam('section', e.target.value)} style={{ height: 26 }}><option value="circular">{tStatus('圆形', lang)}</option><option value="square">{tStatus('方形', lang)}</option></select></label>
            <label title={tStatus('截面尺寸（外径Ø / 方形边宽）', lang)}>{tStatus('截面尺寸', lang)} <input type="number" min={0.1} step={1} value={featDlg.params.size} onChange={(e) => setFeatParam('size', Number(e.target.value))} style={{ width: 56 }} /> {featDlg.params.section === 'square' ? '□' : 'Ø'} mm</label>
            <label style={{ justifyContent: 'flex-start', gap: 6, fontSize: 12 }} title={tStatus('空心（Fusion Hollow）：勾选 = 中空管（减壁厚成内孔）；不勾 = 实心棒', lang)}><input type="checkbox" checked={!!+(featDlg.params.hollow || 0)} onChange={(e) => setFeatParam('hollow', e.target.checked ? 1 : 0)} /> {tStatus('空心', lang)}</label>
            {!!+(featDlg.params.hollow || 0) && <label title={tStatus('壁厚（Section Thickness）', lang)}>{tStatus('壁厚', lang)} <input type="number" min={0.01} step={0.5} value={featDlg.params.thickness} onChange={(e) => setFeatParam('thickness', Number(e.target.value))} style={{ width: 52 }} /> mm</label>}
            <label title={tStatus('距离（Fusion Distance）：沿路径覆盖比例 0–1（1=全长）', lang)}>{tStatus('距离', lang)} <input type="number" min={0.01} max={1} step={0.05} value={featDlg.params.dist} onChange={(e) => setFeatParam('dist', Number(e.target.value))} style={{ width: 52 }} /></label>
            <label title={tStatus('操作：＋加料 / －切割 / ∩相交 / ⬡新实体', lang)}>{tStatus('操作', lang)} <select value={String(featDlg.params.op ?? 'new')} onChange={(e) => setFeatParam('op', e.target.value)} style={{ height: 26 }}><option value="new">{tStatus('＋加料', lang)}</option><option value="cut">{tStatus('－切割', lang)}</option><option value="intersect">{tStatus('∩相交', lang)}</option><option value="newbody">{tStatus('⬡新实体', lang)}</option></select></label>
          </>)}
          {featDlg.kind === 'pathpattern' && (<>
            <label title={tStatus('副本总数（包括原始实体／特征）；沿路径按等弧长均匀摆放', lang)}>{tStatus('数量', lang)} <input type="number" min={2} max={100} step={1} value={featDlg.params.count} onChange={(e) => setFeatParam('count', Number(e.target.value))} style={{ width: 56 }} /></label>
            <label title={tStatus('整个实体会复制当前实体；所选特征会只复制时间轴中已选中嘅孔／凸台等特征', lang)}>{tStatus('对象', lang)} <select value={String(featDlg.params.target ?? 'body')} onChange={(e) => setFeatParam('target', e.target.value)} style={{ height: 26 }}><option value="body">{tStatus('整个实体', lang)}</option><option value="feature">{tStatus('所选特征（时间轴）', lang)}</option></select></label>
            <label title={tStatus('相同=每个副本保持原始方向；沿路径=各副本按局部切线作最短旋转。急弯顶点使用出段切线。', lang)}>{tStatus('方向', lang)} <select value={String(featDlg.params.orient ?? 'identical')} onChange={(e) => setFeatParam('orient', e.target.value)} style={{ height: 26 }}><option value="identical">{tStatus('相同', lang)}</option><option value="path">{tStatus('沿路径', lang)}</option></select></label>
            <div style={{ fontSize: 11, color: '#6b7680' }}>{tStatus('路径由刚才草图提供；取消会还原草图。', lang)}</div>
          </>)}
          {featDlg.kind === 'combine' && (<>
            <label title={tStatus('合并=两体并集 · 切除=目标减工具 · 相交=公共体（真 B-rep）', lang)}>{tStatus('操作', lang)} <select value={featDlg.params.op ?? 'cut'} onChange={(e) => setFeatParam('op', e.target.value)} style={{ height: 26 }}><option value="fuse">{tStatus('＋合并', lang)}</option><option value="cut">{tStatus('－切除(目标−工具)', lang)}</option><option value="common">{tStatus('∩相交', lang)}</option></select></label>
            <div style={{ fontSize: 11, color: '#6b7680', margin: '2px 0' }}>{tStatus('目标 = 活动实体；勾选要参与运算嘅工具体（泊车实体）：', lang)}</div>
            {(bodyMesh?.parked ?? []).map((b, i) => (
              <label key={i} style={{ justifyContent: 'flex-start', gap: 6 }}>
                <input type="checkbox" checked={+(featDlg.params['tool' + i] ?? 0) > 0} onChange={(e) => setFeatParam('tool' + i, e.target.checked ? 1 : 0)} />
                <span>{b.name || (tStatus('实体', lang) + (i + 1))}</span>
              </label>
            ))}
            {/* S185 Keep Tools（Fusion Combine）：保留工具体做独立泊车体（可复用 / 重复布尔），唔消耗 */}
            <label style={{ justifyContent: 'flex-start', gap: 6, marginTop: 2 }} title={tStatus('保留工具体：运算后工具体仍作为独立泊车实体保留（可再次布尔/导出）；默认消耗', lang)}>
              <input type="checkbox" checked={+(featDlg.params.keepTools ?? 0) > 0} onChange={(e) => setFeatParam('keepTools', e.target.checked ? 1 : 0)} />
              <span>{tStatus('保留工具体（Keep Tools）', lang)}</span>
            </label>
          </>)}
          {featDlg.kind === 'boundaryfill' && (<>
            <div style={{ fontSize: 11, color: '#6b7680', margin: '2px 0' }}>{tStatus('当前版本：两个封闭实体的真实 B-rep cell 分割。多工具、曲面／平面工具及任意多 cell 选择尚未提供。', lang)}</div>
            <label>{tStatus('工具实体', lang)} <select value={String(featDlg.params.target ?? 0)} onChange={(e) => setFeatParam('target', Number(e.target.value))} style={{ height: 26 }}>{(bodyMesh?.parked ?? []).map((b, i) => <option key={i} value={i}>{b.name || (tStatus('实体', lang) + (i + 1))}</option>)}</select></label>
            <label title={tStatus('把两实体空间切成三个不重叠体积；所选 cell 成为活动实体，其余有效 cell 保留为灰显独立实体。', lang)}>{tStatus('保留 cell', lang)} <select value={String(featDlg.params.cell ?? 'overlap')} onChange={(e) => setFeatParam('cell', e.target.value)} style={{ height: 26 }}><option value="target">{tStatus('目标独有（目标 − 工具）', lang)}</option><option value="overlap">{tStatus('交集（目标 ∩ 工具）', lang)}</option><option value="tool">{tStatus('工具独有（工具 − 目标）', lang)}</option></select></label>
          </>)}
          {featDlg.kind === 'scale' && (<>
            <label title={tStatus('均匀缩放比例', lang)}>{tStatus('比例', lang)} <input type="number" min={0.01} step={0.1} value={featDlg.params.factor} onChange={(e) => setFeatParam('factor', Number(e.target.value))} style={{ width: 56 }} /> ×</label>
            <label title={tStatus('或直接输入目标最长边尺寸（mm）→ 自动算比例；0=用上面比例', lang)}>{tStatus('或 目标最长边', lang)} <input type="number" min={0} step={1} value={featDlg.params.target ?? 0} onChange={(e) => setFeatParam('target', Number(e.target.value))} style={{ width: 56 }} /> mm</label>
            <label title={tStatus('非等比三轴缩放（T762 GTransform 真 B-rep）：任一轴 >0 即生效，0=该轴不缩放；填咗就忽略上面等比', lang)}>{tStatus('非等比 X', lang)} <input type="number" min={0} step={0.1} value={featDlg.params.sx ?? 0} onChange={(e) => setFeatParam('sx', Number(e.target.value))} style={{ width: 44 }} />Y <input type="number" min={0} step={0.1} value={featDlg.params.sy ?? 0} onChange={(e) => setFeatParam('sy', Number(e.target.value))} style={{ width: 44 }} />Z <input type="number" min={0} step={0.1} value={featDlg.params.sz ?? 0} onChange={(e) => setFeatParam('sz', Number(e.target.value))} style={{ width: 44 }} /></label>
            {/* P2（Fusion Scale Point）：缩放基准点 — 默认实体中心（开对话框预填）；0,0,0=世界原点（旧行为） */}
            <label title={tStatus('缩放基准点（CAD 坐标）：实体绕呢个点缩放，唔会飞走。默认=实体包围盒中心（Fusion 同款）；0,0,0=世界原点（旧行为）', lang)}>{tStatus('基准点', lang)} <input type="number" step={5} value={featDlg.params.px ?? 0} onChange={(e) => setFeatParam('px', Number(e.target.value))} style={{ width: 44 }} /><input type="number" step={5} value={featDlg.params.py ?? 0} onChange={(e) => setFeatParam('py', Number(e.target.value))} style={{ width: 44 }} /><input type="number" step={5} value={featDlg.params.pz ?? 0} onChange={(e) => setFeatParam('pz', Number(e.target.value))} style={{ width: 44 }} /></label>
            <button className="cs-btn" title={tStatus('把基准点设到实体包围盒中心（原地缩放）', lang)} onClick={() => {
              const m = useApp.getState().bodyMesh; if (!m?.vertices?.length) return
              const vv = m.vertices; let xn = 1e9, xp = -1e9, yn = 1e9, yp = -1e9, zn = 1e9, zp = -1e9
              for (let i = 0; i < vv.length; i += 3) { xn = Math.min(xn, vv[i]); xp = Math.max(xp, vv[i]); yn = Math.min(yn, vv[i + 1]); yp = Math.max(yp, vv[i + 1]); zn = Math.min(zn, vv[i + 2]); zp = Math.max(zp, vv[i + 2]) }
              setFeatParam('px', Math.round((xn + xp) / 2 * 100) / 100); setFeatParam('py', Math.round((yn + yp) / 2 * 100) / 100); setFeatParam('pz', Math.round((zn + zp) / 2 * 100) / 100)
            }}>{tStatus('实体中心', lang)}</button>
            {useApp.getState().cpoints.length > 0 && (
              <label title={tStatus('用已建构造点做缩放基准点', lang)}>{tStatus('构造点', lang)} <select value="" onChange={(e) => { const i = Number(e.target.value); if (!Number.isInteger(i)) return; const cp = useApp.getState().cpoints[i]; if (!cp) return; setFeatParam('px', cp[0]); setFeatParam('py', cp[1]); setFeatParam('pz', cp[2]) }} style={{ height: 26 }}><option value="">{tStatus('— 选构造点 —', lang)}</option>{useApp.getState().cpoints.map((cp, i) => <option key={'SCP' + i} value={i}>{tStatus('构造点', lang)}{i + 1}（{cp.map((v) => +v.toFixed(0)).join(',')}）</option>)}</select></label>
            )}
          </>)}
          {featDlg.kind === 'splitbody' && (() => {
            const hasPlane = typeof featDlg.params.planeOrigin === 'string' && !!featDlg.params.planeOrigin
            return (<>
              {hasPlane
                ? <div style={{ fontSize: 11, color: '#16a36b' }}>{tStatus('✂ 已拾切割平面（法向', lang)} [{String(featDlg.params.planeNormal)}]）<button className="sb-tool" onClick={() => { setFeatParam('planeOrigin', ''); setFeatParam('planeNormal', '') }}>{tStatus('改用轴向平面', lang)}</button></div>
                : (<>
                  <label title={tStatus('切割轴：沿此轴的一个平面把实体切两半（要任意面请用「平面切」拾面）', lang)}>{tStatus('轴', lang)} <select value={String(featDlg.params.axis)} onChange={(e) => setFeatParam('axis', e.target.value)} style={{ height: 26 }}><option>X</option><option>Y</option><option>Z</option></select></label>
                  <label title={tStatus('切割位置（CAD 坐标，沿上面选定轴）— 开对话框默认实体 Z 中点', lang)}>{tStatus('位置', lang)} <input type="number" step={1} value={featDlg.params.offset} onChange={(e) => setFeatParam('offset', Number(e.target.value))} style={{ width: 60 }} /> mm</label>
                  <button className="cs-btn" title={tStatus('把切割位置居中到实体包围盒中点（当前轴）', lang)} onClick={() => {
                    const m = useApp.getState().bodyMesh; if (!m?.vertices?.length) return
                    const axIdx = featDlg.params.axis === 'X' ? 0 : featDlg.params.axis === 'Y' ? 1 : 2
                    const vv = m.vertices; let lo = 1e9, hi = -1e9
                    for (let i = axIdx; i < vv.length; i += 3) { if (vv[i] < lo) lo = vv[i]; if (vv[i] > hi) hi = vv[i] }
                    setFeatParam('offset', Math.round((lo + hi) / 2 * 10) / 10)
                  }}>{tStatus('居中', lang)}</button>
                </>)}
              <label title={tStatus('保留哪一侧做活动实体继续编辑；另一侧灰显泊车（可隐藏/导出/实体布尔）', lang)}>{tStatus('保留侧', lang)} <select value={String(featDlg.params.keep ?? 'lo')} onChange={(e) => setFeatParam('keep', e.target.value)} style={{ height: 26 }}><option value="lo">{tStatus(hasPlane ? '法向负侧' : '低侧', lang)}</option><option value="hi">{tStatus(hasPlane ? '法向正侧' : '高侧', lang)}</option></select></label>
            </>)
          })()}
          {/* P2 Edit Feature：编辑专属块 — 双击时间线重开，值已反填；选择集/轮廓透传保留 */}
          {featDlg.kind === 'extrude-edit' && (() => {
            const ef = useApp.getState().features.find((x) => x.id === featDlg.editId)
            const hasTF = !!(ef && ef.type === 'extrude' && ef.toFace)
            const hasNext = !!(ef && ef.type === 'extrude' && ef.extent === 'next')   // GM-W5 5.2：到下一面 feature → 显示「到下一面」选项，可切返距离
            const skId = ef && ef.type === 'extrude' ? ef.sketchId : undefined
            return (<>
              <label>{tStatus('操作', lang)} <select value={String(featDlg.params.op)} onChange={(e) => setFeatParam('op', e.target.value)} style={{ height: 26 }}>
                <option value="new">{tStatus('＋加料', lang)}</option><option value="cut">{tStatus('－切割', lang)}</option><option value="intersect">{tStatus('∩相交', lang)}</option><option value="newbody">{tStatus('⬡新实体', lang)}</option></select></label>
              <label>{tStatus('范围', lang)} <select value={String(featDlg.params.extent)} onChange={(e) => setFeatParam('extent', e.target.value)} style={{ height: 26 }}>
                <option value="distance">{tStatus('距离', lang)}</option><option value="symmetric">{tStatus('对称（总距离）', lang)}</option><option value="through">{tStatus('贯通', lang)}</option>{hasTF && <option value="toface">{tStatus('到面（保留原引用）', lang)}</option>}{hasNext && <option value="next">{tStatus('到下一面（已烘焙距离）', lang)}</option>}</select></label>
              {featDlg.params.extent !== 'through' && featDlg.params.extent !== 'toface' && <label>{tStatus('距离', lang)} <input type="number" step={1} value={featDlg.params.height} onChange={(e) => setFeatParam('height', Number(e.target.value))} style={{ width: 56 }} /> mm</label>}
              <label>{tStatus('拔模角', lang)} <input type="number" step={1} min={-45} max={45} value={featDlg.params.draft} onChange={(e) => setFeatParam('draft', Number(e.target.value))} style={{ width: 50 }} />°</label>
              <label>{tStatus('扭转', lang)} <input type="number" step={5} value={featDlg.params.twist} onChange={(e) => setFeatParam('twist', Number(e.target.value))} style={{ width: 50 }} />°</label>
              {skId && <button className="tb-btn" title={tStatus('重开草图编辑轮廓（改完全树重建）', lang)} onClick={() => { const id = featDlg.editId!; cancelFeatDlg(); useApp.getState().editSketchOf(id) }}>✎ {tStatus('编辑草图', lang)}</button>}
            </>)
          })()}
          {featDlg.kind === 'fillet-edit' && (<>
            <SelectionChip label={tStatus('棱', lang)} count={Math.max(1, +(featDlg.params.nearsN || 0))} hint="" />
            {typeof featDlg.params.radii === 'string' && String(featDlg.params.radii).trim() ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ fontSize: 11, color: '#8a97a2' }}>{tStatus('多半径圆角 — 逐棱半径：', lang)}</div>
                {String(featDlg.params.radii).split(',').map((r, i) => (
                  <label key={i} style={{ fontSize: 11 }}>{tStatus('棱', lang)}{i + 1} <input type="number" step={0.5} min={0.1} value={+r} onChange={(e) => { const arr = String(featDlg.params.radii).split(','); arr[i] = e.target.value; setFeatParam('radii', arr.join(',')) }} style={{ width: 52 }} /> mm</label>
                ))}
              </div>
            ) : (<>
              <label>{tStatus('半径', lang)} <input type="number" step={0.5} min={0.1} value={featDlg.params.radius} onChange={(e) => setFeatParam('radius', Number(e.target.value))} style={{ width: 56 }} /> mm</label>
              <label title={tStatus('变半径圆角：起始用「半径」，末端用呢个值（0=均一半径）', lang)}>{tStatus('末端半径', lang)} <input type="number" step={0.5} min={0} value={featDlg.params.radius2} onChange={(e) => setFeatParam('radius2', Number(e.target.value))} style={{ width: 56 }} /> mm</label>
            </>)}
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={!!+(featDlg.params.chain || 0)} onChange={(e) => setFeatParam('chain', e.target.checked ? 1 : 0)} />{tStatus('切线链', lang)}</label>
          </>)}
          {featDlg.kind === 'chamfer-edit' && (<>
            <SelectionChip label={tStatus('棱', lang)} count={Math.max(1, +(featDlg.params.nearsN || 0))} hint="" />
            <label>{tStatus('类型', lang)} <select value={String(featDlg.params.cmode)} onChange={(e) => setFeatParam('cmode', e.target.value)} style={{ height: 26 }}>
              <option value="equal">{tStatus('等距', lang)}</option><option value="two">{tStatus('两距离', lang)}</option><option value="angle">{tStatus('距离+角度', lang)}</option></select></label>
            <label>{tStatus('距离', lang)} <input type="number" step={0.5} min={0.1} value={featDlg.params.distance} onChange={(e) => setFeatParam('distance', Number(e.target.value))} style={{ width: 56 }} /> mm</label>
            {featDlg.params.cmode === 'two' && <label>{tStatus('距离2', lang)} <input type="number" step={0.5} min={0.1} value={featDlg.params.dist2} onChange={(e) => setFeatParam('dist2', Number(e.target.value))} style={{ width: 56 }} /> mm</label>}
            {featDlg.params.cmode === 'angle' && <label>{tStatus('角度', lang)} <input type="number" step={5} min={5} max={85} value={featDlg.params.angle} onChange={(e) => setFeatParam('angle', Number(e.target.value))} style={{ width: 50 }} />°</label>}
            {featDlg.params.cmode !== 'equal' && <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={!!+(featDlg.params.flip || 0)} onChange={(e) => setFeatParam('flip', e.target.checked ? 1 : 0)} />{tStatus('翻转', lang)}</label>}
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={!!+(featDlg.params.chain || 0)} onChange={(e) => setFeatParam('chain', e.target.checked ? 1 : 0)} />{tStatus('切线链', lang)}</label>
          </>)}
          {featDlg.kind === 'shell-edit' && (<>
            <SelectionChip label={tStatus('开口面', lang)} count={+(featDlg.params.nearsN || 0)} hint={tStatus('0 = 默认开顶面', lang)} />
            <label>{tStatus('壁厚', lang)} <input type="number" step={0.2} min={0.2} value={featDlg.params.thickness} onChange={(e) => setFeatParam('thickness', Number(e.target.value))} style={{ width: 56 }} /> mm</label>
            <label title={tStatus('壁厚方向：向内=外形保留 · 向外=尺寸外扩 · 两侧=壁跨原边界', lang)}>{tStatus('方向', lang)} <select value={String(featDlg.params.direction ?? 'inside')} onChange={(e) => setFeatParam('direction', e.target.value)} style={{ height: 26 }}><option value="inside">{tStatus('向内', lang)}</option><option value="outside">{tStatus('向外', lang)}</option><option value="both">{tStatus('两侧', lang)}</option></select></label>
          </>)}
          {featDlg.kind === 'offsetsolid' && (<>
            <label title={tStatus('整体偏移所有面：正=外扩(加厚铸件壁/补偿)，负=内缩。凸边按圆角接合', lang)}>{tStatus('偏移距离', lang)} <input type="number" step={0.5} value={featDlg.params.distance} onChange={(e) => setFeatParam('distance', Number(e.target.value))} style={{ width: 56 }} /> mm</label>
          </>)}
          {featDlg.kind === 'draft' && (
            <label>{tStatus('角度', lang)} <input type="number" step={1} value={featDlg.params.angle} onChange={(e) => setFeatParam('angle', Number(e.target.value))} style={{ width: 56 }} />°</label>
          )}
          {featDlg.kind === 'revolve' && (<>
            <label title={tStatus('旋转轴：世界 X/Y/Z 过原点，或任意构造轴（先用「构造轴」造轴 — 两点轴/拣圆柱面取轴，偏离原点车削用呢个）', lang)}>{tStatus('旋转轴', lang)} <select value={featDlg.params.axis} onChange={(e) => setFeatParam('axis', e.target.value)} style={{ height: 26 }}><option>X</option><option>Y</option><option>Z</option>{useApp.getState().caxes.map((ca, i) => <option key={'A' + i} value={'A' + i}>{tStatus('构造轴', lang)}{i + 1}（{ca.dirV ? ca.dirV.map((v) => +v.toFixed(1)).join(',') : ca.dir}）</option>)}</select></label>
            {/* P2：Fusion 最常用工作流 — 画一条（构造）线做中心轴 → Axis 直接揀嗰条草图线。
                坐标映射同 profile 完全一致：shapeToProfile 默认 XY ⇒ (s,t)→CAD(s,−t,0)。候选 = 草图快照内
                两点直线（poly pts=2，非弧/样条），构造线（中心线）排先；排除最尾一个（被消费嘅轮廓本身）。 */}
            {(() => {
              const pl = featDlg.payload as { bundle?: { shapes: { type: string; pts?: [number, number][]; arc?: unknown; smooth?: boolean; bspline?: boolean; conic?: boolean; construction?: boolean }[] } } | undefined
              const shapes = pl?.bundle?.shapes
              if (!shapes || shapes.length < 2) return null
              const lines = shapes.slice(0, -1).map((sh, i) => ({ sh, i }))
                .filter(({ sh }) => sh.type === 'poly' && !sh.arc && !sh.smooth && !sh.bspline && !sh.conic && Array.isArray(sh.pts) && sh.pts.length === 2)
                .sort((a, b) => Number(!!b.sh.construction) - Number(!!a.sh.construction))
              if (!lines.length) return null
              return (
                <label title={tStatus('用草图入面画嘅直线做旋转轴（Fusion：中心构造线 → Axis 揀线）。选中即填轴点+方向；轮廓必须完全喺轴一侧', lang)}>{tStatus('草图线', lang)} <select value="" onChange={(e) => {
                  const k = Number(e.target.value); if (!Number.isInteger(k)) return
                  const ln = lines[k]; if (!ln || !ln.sh.pts) return
                  const [a, b] = ln.sh.pts
                  // 同 shapeToProfile('XY') 一致：CAD = (s, −t, 0)
                  const A: [number, number, number] = [a[0], -a[1], 0], B: [number, number, number] = [b[0], -b[1], 0]
                  const d: [number, number, number] = [B[0] - A[0], B[1] - A[1], B[2] - A[2]]
                  if (Math.hypot(d[0], d[1], d[2]) < 1e-9) return
                  setFeatParam('ox', A[0]); setFeatParam('oy', A[1]); setFeatParam('oz', A[2])
                  setFeatParam('dx', +d[0].toFixed(4)); setFeatParam('dy', +d[1].toFixed(4)); setFeatParam('dz', +d[2].toFixed(4))
                }} style={{ height: 26 }}>
                  <option value="">{tStatus('— 揀草图线做轴 —', lang)}</option>
                  {lines.map((l, k) => <option key={'SL' + k} value={k}>{tStatus(l.sh.construction ? '构造线' : '草图线', lang)}{l.i + 1}（{l.sh.pts![0].map((v) => +v.toFixed(0)).join(',')}→{l.sh.pts![1].map((v) => +v.toFixed(0)).join(',')}）</option>)}
                </select></label>
              )
            })()}
            {/* WIN 2：构造轴覆写层（mirror circpattern）— 拣构造轴 / 拾圆柱面 / 手填轴点+方向 → 写入 ox/oy/oz/dx/dy/dz；resolver 仅当非默认（dy:1,ox/oy/oz:0）时采用，向后兼容 */}
            <button className={'cs-btn pick-slot' + (cpatAxisPickA ? ' active' : '')} title={tStatus('拾轴：点活动实体嘅圆柱面（孔壁/圆轴/凸台侧面）— 轴点+方向自动填（绕该轴车削/偏心车削）', lang)} onClick={() => useApp.getState().startCpatAxisPick()}>{tStatus('🎯拾轴', lang)}</button>
            {useApp.getState().caxes.length > 0 && (
              <label title={tStatus('用已建构造轴驱动旋转轴：选中后自动填轴点(origin)+方向(dir，含任意斜向 dirV)', lang)}>{tStatus('构造轴', lang)} <select value="" onChange={(e) => { const i = Number(e.target.value); if (!Number.isInteger(i)) return; const ca = useApp.getState().caxes[i]; if (!ca) return; const LV: Record<string, [number, number, number]> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }; const dv = ca.dirV ?? LV[ca.dir]; setFeatParam('ox', ca.at[0]); setFeatParam('oy', ca.at[1]); setFeatParam('oz', ca.at[2]); setFeatParam('dx', dv[0]); setFeatParam('dy', dv[1]); setFeatParam('dz', dv[2]) }} style={{ height: 26 }}><option value="">{tStatus('— 选构造轴 —', lang)}</option>{useApp.getState().caxes.map((ca, i) => <option key={'RCA' + i} value={i}>{tStatus('构造轴', lang)}{i + 1}（{ca.dirV ? ca.dirV.map((v) => +v.toFixed(1)).join(',') : ca.dir} @ {ca.at.map((v) => +v.toFixed(0)).join(',')}）</option>)}</select></label>
            )}
            {/* S173：中心点轴 — 用一个【中心点】(构造点/原点) + X/Y/Z 方向做旋转轴（Fusion: Axis through point）。
                🎯拾中心点 喺 3D snap 到最近中心球；下面 dropdown 直接拣构造点；X/Y/Z 钮设方向。 */}
            <button className={'cs-btn pick-slot' + (revAxisPtPick ? ' active' : '')} title={tStatus('拾中心点：喺 3D 点一个中心点（构造点/构造轴原点/原点 — 自动 snap 到最近者）做旋转轴经过点，再撳下面 X/Y/Z 设方向', lang)} onClick={() => useApp.getState().startRevAxisPtPick()}>{tStatus('🎯拾中心点', lang)}</button>
            {useApp.getState().cpoints.length > 0 && (
              <label title={tStatus('用构造点做旋转轴经过点：选中即填轴点(ox/oy/oz)，再撳 X/Y/Z 设方向', lang)}>{tStatus('中心点', lang)} <select value="" onChange={(e) => { const i = Number(e.target.value); if (!Number.isInteger(i)) return; const cp = useApp.getState().cpoints[i]; if (!cp) return; setFeatParam('ox', cp[0]); setFeatParam('oy', cp[1]); setFeatParam('oz', cp[2]) }} style={{ height: 26 }}><option value="">{tStatus('— 选构造点 —', lang)}</option>{useApp.getState().cpoints.map((cp, i) => <option key={'RCP' + i} value={i}>{tStatus('构造点', lang)}{i + 1}（{cp.map((v) => +v.toFixed(0)).join(',')}）</option>)}</select></label>
            )}
            {/* P2 audit 教训：原本想加「草图线做轴」— grep 发现下面已有（另一批次早实现咗，option「— 揀草图线做轴 —」），
                唔好重复。留原有实现（raw 方向向量 worker 会归一化，几何正确）。 */}
            <span title={tStatus('方向：过上面轴点，沿 X / Y / Z 做旋转轴', lang)} style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>{tStatus('轴向', lang)}
              {(['X', 'Y', 'Z'] as const).map((ax) => { const on = (ax === 'X' && featDlg.params.dx === 1 && !featDlg.params.dy && !featDlg.params.dz) || (ax === 'Y' && featDlg.params.dy === 1 && !featDlg.params.dx && !featDlg.params.dz) || (ax === 'Z' && featDlg.params.dz === 1 && !featDlg.params.dx && !featDlg.params.dy); return <button key={ax} className={'cs-btn' + (on ? ' on' : '')} title={tStatus(`沿 ${ax} 轴（过上面轴点）`, lang)} onClick={() => { setFeatParam('dx', ax === 'X' ? 1 : 0); setFeatParam('dy', ax === 'Y' ? 1 : 0); setFeatParam('dz', ax === 'Z' ? 1 : 0) }} style={{ padding: '2px 7px', ...(on ? { background: '#1572c4', color: '#fff' } : {}) }}>{ax}</button> })}
            </span>
            <label title={tStatus('旋转轴经过嘅点（CAD 坐标）— 偏离原点车削设置；默认 0,0,0 = 用上面旋转轴预设', lang)}>{tStatus('轴点', lang)} <input type="number" step={5} value={featDlg.params.ox} onChange={(e) => setFeatParam('ox', Number(e.target.value))} style={{ width: 40 }} /><input type="number" step={5} value={featDlg.params.oy} onChange={(e) => setFeatParam('oy', Number(e.target.value))} style={{ width: 40 }} /><input type="number" step={5} value={featDlg.params.oz} onChange={(e) => setFeatParam('oz', Number(e.target.value))} style={{ width: 40 }} /></label>
            <label title={tStatus('旋转轴方向分量（可斜轴，例 1,0,1）— 默认 0,1,0 = 世界 Y。注意：轮廓必须完全喺轴一侧，否则建模失败', lang)}>{tStatus('方向', lang)} <input type="number" step={1} value={featDlg.params.dx} onChange={(e) => setFeatParam('dx', Number(e.target.value))} style={{ width: 36 }} /><input type="number" step={1} value={featDlg.params.dy} onChange={(e) => setFeatParam('dy', Number(e.target.value))} style={{ width: 36 }} /><input type="number" step={1} value={featDlg.params.dz} onChange={(e) => setFeatParam('dz', Number(e.target.value))} style={{ width: 36 }} /></label>
            <label>{tStatus('角度', lang)} <input type="number" step={15} min={1} max={360} value={featDlg.params.angle} onChange={(e) => setFeatParam('angle', Number(e.target.value))} style={{ width: 56 }} />°</label>
            <label title={tStatus('薄壁 mm：>0 把旋转体抽成薄壳（灯罩/碗壳/漏斗等曲面壳），0=实心', lang)}>{tStatus('薄壁', lang)} <input type="number" step={0.5} min={0} value={featDlg.params.wall ?? 0} onChange={(e) => setFeatParam('wall', Number(e.target.value))} style={{ width: 48 }} /> mm</label>
            {Number(featDlg.params.angle) > 0 && Number(featDlg.params.angle) < 360 && (
              <label title={tStatus('两侧对称：部分角旋转时把角度均分跨越截面平面两侧（Fusion symmetric revolve）', lang)}><input type="checkbox" checked={!!featDlg.params.sym} onChange={(e) => setFeatParam('sym', e.target.checked ? 1 : 0)} /> {tStatus('两侧对称', lang)}</label>
            )}
            {/* P2：Operation 排最尾（Fusion 肌肉记忆：轴→参数→最后定布尔） */}
            <label>{tStatus('操作', lang)} <select value={featDlg.params.op ?? 'new'} onChange={(e) => setFeatParam('op', e.target.value)} style={{ height: 26 }} disabled={!bodyMesh} title={bodyMesh ? tStatus('加料/切割(车槽)/相交', lang) : tStatus('没有实体，只能加料', lang)}><option value="new">{tStatus('＋加料', lang)}</option><option value="cut">{tStatus('－切割(车槽)', lang)}</option><option value="intersect">{tStatus('∩相交', lang)}</option><option value="newbody">{tStatus('⬡新实体', lang)}</option></select></label>
          </>)}
          {featDlg.kind === 'box' && (<>
            <label>{tStatus('长', lang)} <LenInput mm={Number(featDlg.params.l)} onMm={(v) => setFeatParam('l', v)} unit={unit} w={52} min={0.1} /></label>
            <label>{tStatus('宽', lang)} <LenInput mm={Number(featDlg.params.w)} onMm={(v) => setFeatParam('w', v)} unit={unit} w={52} min={0.1} /></label>
            <label>{tStatus('高', lang)} <LenInput mm={Number(featDlg.params.h)} onMm={(v) => setFeatParam('h', v)} unit={unit} w={52} min={0.1} /></label>
          </>)}
          {featDlg.kind === 'cylinder' && (<>
            <label>Ø <LenInput mm={Number(featDlg.params.d)} onMm={(v) => setFeatParam('d', v)} unit={unit} w={56} min={0.1} /></label>
            <label>{tStatus('高', lang)} <LenInput mm={Number(featDlg.params.h)} onMm={(v) => setFeatParam('h', v)} unit={unit} w={56} min={0.1} /></label>
          </>)}
          {featDlg.kind === 'sphere' && (
            <label>Ø <LenInput mm={Number(featDlg.params.d)} onMm={(v) => setFeatParam('d', v)} unit={unit} w={60} min={0.1} /></label>
          )}
          {featDlg.kind === 'torus' && (<>
            <label>{tStatus('外Ø', lang)} <input type="number" step={5} min={2} value={featDlg.params.d} onChange={(e) => setFeatParam('d', Number(e.target.value))} style={{ width: 56 }} /></label>
            <label>{tStatus('管Ø', lang)} <input type="number" step={2} min={1} value={featDlg.params.td} onChange={(e) => setFeatParam('td', Number(e.target.value))} style={{ width: 52 }} /></label>
            <label title={tStatus('扫掠角°：360=整环；<360=部分圆环/C 形（卡簧/C 夹/弧形把手）', lang)}>{tStatus('弧', lang)} <input type="number" step={15} min={10} max={360} value={featDlg.params.arc ?? 360} onChange={(e) => setFeatParam('arc', Number(e.target.value))} style={{ width: 48 }} />°</label>
          </>)}
          {featDlg.kind === 'cone' && (<>
            <label>{tStatus('底Ø', lang)} <input type="number" step={5} min={1} value={featDlg.params.d} onChange={(e) => setFeatParam('d', Number(e.target.value))} style={{ width: 52 }} /></label>
            <label title={tStatus('顶部直径，设 0 即尖锥', lang)}>{tStatus('顶Ø', lang)} <input type="number" step={5} min={0} value={featDlg.params.dt} onChange={(e) => setFeatParam('dt', Number(e.target.value))} style={{ width: 52 }} /></label>
            <label>{tStatus('高', lang)} <input type="number" step={5} min={1} value={featDlg.params.h} onChange={(e) => setFeatParam('h', Number(e.target.value))} style={{ width: 48 }} /></label>
            <label title={tStatus('底面边数：0=圆锥/圆台；≥3=N 棱锥/棱台（金字塔/尖塔/方锥）', lang)}>{tStatus('边数', lang)} <input type="number" step={1} min={0} max={24} value={featDlg.params.sides ?? 0} onChange={(e) => setFeatParam('sides', Number(e.target.value))} style={{ width: 44 }} /></label>
          </>)}
          {featDlg.kind === 'wedge' && (<>
            <label>{tStatus('长', lang)} <input type="number" step={5} min={1} value={featDlg.params.l} onChange={(e) => setFeatParam('l', Number(e.target.value))} style={{ width: 50 }} /></label>
            <label>{tStatus('宽', lang)} <input type="number" step={5} min={1} value={featDlg.params.w} onChange={(e) => setFeatParam('w', Number(e.target.value))} style={{ width: 50 }} /></label>
            <label title={tStatus('高的一端在长度方向的一侧，斜面削到 0', lang)}>{tStatus('高', lang)} <input type="number" step={5} min={1} value={featDlg.params.h} onChange={(e) => setFeatParam('h', Number(e.target.value))} style={{ width: 50 }} /></label>
          </>)}
          {featDlg.kind === 'dome' && (<>
            <label title={tStatus('球面直径', lang)}>Ø <input type="number" step={5} min={1} value={featDlg.params.d} onChange={(e) => setFeatParam('d', Number(e.target.value))} style={{ width: 60 }} /></label>
            <label title={tStatus('冠高 mm：0=半球（高=半径）；0<冠高<半径=浅球冠（镜片/表镜/按钮）', lang)}>{tStatus('冠高', lang)} <input type="number" step={1} min={0} value={featDlg.params.cap ?? 0} onChange={(e) => setFeatParam('cap', Number(e.target.value))} style={{ width: 48 }} /></label>
          </>)}
          {featDlg.kind === 'halfcyl' && (<>
            <label>Ø <input type="number" step={5} min={1} value={featDlg.params.d} onChange={(e) => setFeatParam('d', Number(e.target.value))} style={{ width: 56 }} /></label>
            <label>{tStatus('高', lang)} <input type="number" step={5} min={1} value={featDlg.params.h} onChange={(e) => setFeatParam('h', Number(e.target.value))} style={{ width: 56 }} /></label>
          </>)}
          {featDlg.kind === 'pie' && (<>
            <label>Ø <input type="number" step={5} min={1} value={featDlg.params.d} onChange={(e) => setFeatParam('d', Number(e.target.value))} style={{ width: 52 }} /></label>
            <label title={tStatus('扇形角度（度，1–360）', lang)}>{tStatus('角度', lang)} <input type="number" step={15} min={1} max={360} value={featDlg.params.ang} onChange={(e) => setFeatParam('ang', Number(e.target.value))} style={{ width: 48 }} />°</label>
            <label>{tStatus('高', lang)} <input type="number" step={5} min={1} value={featDlg.params.h} onChange={(e) => setFeatParam('h', Number(e.target.value))} style={{ width: 48 }} /></label>
          </>)}
          {featDlg.kind === 'tube' && (<>
            <label>{tStatus('外Ø', lang)} <input type="number" step={5} min={2} value={featDlg.params.d} onChange={(e) => setFeatParam('d', Number(e.target.value))} style={{ width: 52 }} /></label>
            <label>{tStatus('壁厚', lang)} <input type="number" step={1} min={0.5} value={featDlg.params.wall} onChange={(e) => setFeatParam('wall', Number(e.target.value))} style={{ width: 46 }} /></label>
            <label>{tStatus('高', lang)} <input type="number" step={5} min={1} value={featDlg.params.h} onChange={(e) => setFeatParam('h', Number(e.target.value))} style={{ width: 48 }} /></label>
          </>)}
          {featDlg.kind === 'rtube' && (<>
            <label title={tStatus('截面宽度 X', lang)}>{tStatus('宽', lang)} <input type="number" step={5} min={2} value={featDlg.params.w} onChange={(e) => setFeatParam('w', Number(e.target.value))} style={{ width: 48 }} /></label>
            <label title={tStatus('截面深度 Y', lang)}>{tStatus('深', lang)} <input type="number" step={5} min={2} value={featDlg.params.d} onChange={(e) => setFeatParam('d', Number(e.target.value))} style={{ width: 48 }} /></label>
            <label title={tStatus('壁厚', lang)}>{tStatus('壁厚', lang)} <input type="number" step={1} min={0.5} value={featDlg.params.wall} onChange={(e) => setFeatParam('wall', Number(e.target.value))} style={{ width: 46 }} /></label>
            <label title={tStatus('长度（沿 Z 高）', lang)}>{tStatus('长', lang)} <input type="number" step={5} min={1} value={featDlg.params.h} onChange={(e) => setFeatParam('h', Number(e.target.value))} style={{ width: 48 }} /></label>
          </>)}
          {featDlg.kind === 'profile' && (<>
            <label>{tStatus('截面', lang)} <select value={featDlg.params.ptype} onChange={(e) => setFeatParam('ptype', e.target.value)} style={{ height: 26 }}><option value="L">{tStatus('L 角铁', lang)}</option><option value="U">{tStatus('U 槽钢', lang)}</option><option value="T">{tStatus('T 型材', lang)}</option></select></label>
            <label title={tStatus('截面宽度 X', lang)}>{tStatus('宽', lang)} <input type="number" step={5} min={2} value={featDlg.params.w} onChange={(e) => setFeatParam('w', Number(e.target.value))} style={{ width: 46 }} /></label>
            <label title={tStatus('截面高度 Y', lang)}>{tStatus('高', lang)} <input type="number" step={5} min={2} value={featDlg.params.h} onChange={(e) => setFeatParam('h', Number(e.target.value))} style={{ width: 46 }} /></label>
            <label title={tStatus('壁厚/料厚', lang)}>{tStatus('厚', lang)} <input type="number" step={1} min={0.5} value={featDlg.params.t} onChange={(e) => setFeatParam('t', Number(e.target.value))} style={{ width: 44 }} /></label>
            <label title={tStatus('长度（沿 Z）', lang)}>{tStatus('长', lang)} <input type="number" step={10} min={1} value={featDlg.params.len} onChange={(e) => setFeatParam('len', Number(e.target.value))} style={{ width: 50 }} /></label>
          </>)}
          {featDlg.kind === 'rbox' && (<>
            <label>{tStatus('长', lang)} <input type="number" step={5} min={2} value={featDlg.params.l} onChange={(e) => setFeatParam('l', Number(e.target.value))} style={{ width: 48 }} /></label>
            <label>{tStatus('宽', lang)} <input type="number" step={5} min={2} value={featDlg.params.w} onChange={(e) => setFeatParam('w', Number(e.target.value))} style={{ width: 48 }} /></label>
            <label>{tStatus('高', lang)} <input type="number" step={5} min={1} value={featDlg.params.h} onChange={(e) => setFeatParam('h', Number(e.target.value))} style={{ width: 48 }} /></label>
            <label title={tStatus('四条竖边的圆角半径（会自动限制在 min(长,宽)/2 以内）', lang)}>{tStatus('圆角R', lang)} <input type="number" step={1} min={0.5} value={featDlg.params.r} onChange={(e) => setFeatParam('r', Number(e.target.value))} style={{ width: 46 }} /></label>
          </>)}
          {featDlg.kind === 'prism' && (<>
            <label>{tStatus('边数', lang)} <input type="number" step={1} min={3} max={24} value={featDlg.params.sides} onChange={(e) => setFeatParam('sides', Number(e.target.value))} style={{ width: 44 }} /></label>
            <label>{tStatus('外接Ø', lang)} <input type="number" step={5} min={2} value={featDlg.params.d} onChange={(e) => setFeatParam('d', Number(e.target.value))} style={{ width: 52 }} /></label>
            <label>{tStatus('高', lang)} <input type="number" step={5} min={1} value={featDlg.params.h} onChange={(e) => setFeatParam('h', Number(e.target.value))} style={{ width: 48 }} /></label>
          </>)}
          {featDlg.kind === 'pyramid' && (<>
            <label title={tStatus('底多边形边数', lang)}>{tStatus('边数', lang)} <input type="number" step={1} min={3} max={24} value={featDlg.params.sides} onChange={(e) => setFeatParam('sides', Number(e.target.value))} style={{ width: 44 }} /></label>
            <label title={tStatus('底多边形外接圆直径', lang)}>{tStatus('底外接Ø', lang)} <input type="number" step={5} min={2} value={featDlg.params.d} onChange={(e) => setFeatParam('d', Number(e.target.value))} style={{ width: 52 }} /></label>
            <label title={tStatus('锥高（底到顶尖）', lang)}>{tStatus('高', lang)} <input type="number" step={5} min={1} value={featDlg.params.h} onChange={(e) => setFeatParam('h', Number(e.target.value))} style={{ width: 48 }} /></label>
          </>)}
          {featDlg.kind === 'coil' && (<>
            <label>Ø <input type="number" step={5} min={2} value={featDlg.params.d} onChange={(e) => setFeatParam('d', Number(e.target.value))} style={{ width: 48 }} /></label>
            <label>{tStatus('螺距', lang)} <input type="number" step={1} min={1} value={featDlg.params.pitch} onChange={(e) => setFeatParam('pitch', Number(e.target.value))} style={{ width: 46 }} /></label>
            <label>{tStatus('高', lang)} <input type="number" step={5} min={2} value={featDlg.params.h} onChange={(e) => setFeatParam('h', Number(e.target.value))} style={{ width: 48 }} /></label>
            <label>{tStatus('丝Ø', lang)} <input type="number" step={1} min={1} value={featDlg.params.wire} onChange={(e) => setFeatParam('wire', Number(e.target.value))} style={{ width: 44 }} /></label>
            <label title={tStatus('末端外径 Ø（锥形塔簧）：留空/0 = 圆柱弹簧；填≠起始Ø = 锥形渐变（内核已支持，B样条变径螺旋）', lang)}>{tStatus('末端Ø', lang)} <input type="number" step={5} min={0} value={featDlg.params.d2 ?? 0} onChange={(e) => setFeatParam('d2', Number(e.target.value))} style={{ width: 48 }} /></label>
          </>)}
          {featDlg.kind === 'gear' && (<>
            <label title={tStatus('模数 = 分度圆直径 / 齿数；齿越大模数越大', lang)}>{tStatus('模数m', lang)} <input type="number" step={0.5} min={0.2} value={featDlg.params.module} onChange={(e) => setFeatParam('module', Number(e.target.value))} style={{ width: 50 }} /></label>
            <label>{tStatus('齿数z', lang)} <input type="number" step={1} min={5} value={featDlg.params.teeth} onChange={(e) => setFeatParam('teeth', Number(e.target.value))} style={{ width: 50 }} /></label>
            <label>{tStatus('厚度', lang)} <input type="number" step={1} min={0.5} value={featDlg.params.thickness} onChange={(e) => setFeatParam('thickness', Number(e.target.value))} style={{ width: 48 }} /></label>
            <label>{tStatus('中心孔Ø', lang)} <input type="number" step={1} min={0} value={featDlg.params.bore} onChange={(e) => setFeatParam('bore', Number(e.target.value))} style={{ width: 48 }} /></label>
            <label title={tStatus('螺旋角 β（T770 斜齿轮）：0=直齿；>0=斜齿扭转近似（啮合对要 β 同值反向）', lang)}>β° <input type="number" step={5} min={-45} max={45} value={featDlg.params.helix ?? 0} onChange={(e) => setFeatParam('helix', Number(e.target.value))} style={{ width: 44 }} /></label>
            <span style={{ fontSize: 11, color: '#8a939c' }}>{tStatus('分度圆Ø', lang)} {(Number(featDlg.params.module) * Number(featDlg.params.teeth)).toFixed(0)}</span>
          </>)}
          {featDlg.kind === 'gearbox' && (<>
            <label title={tStatus('减速比（输出慢 = 比 >1）。要增速对调输入输出。', lang)}>{tStatus('目标速比', lang)} <input type="number" step={0.5} min={1} value={featDlg.params.ratio} onChange={(e) => setFeatParam('ratio', Number(e.target.value))} style={{ width: 56 }} /></label>
            <label>{tStatus('模数m', lang)} <input type="number" step={0.5} min={0.5} value={featDlg.params.m} onChange={(e) => setFeatParam('m', Number(e.target.value))} style={{ width: 46 }} /></label>
            <label title={tStatus('0 = 自动按比例决定级数（>6 自动拆级，上限 4 级）', lang)}>{tStatus('级数', lang)} <select value={featDlg.params.stages} onChange={(e) => setFeatParam('stages', Number(e.target.value))} style={{ height: 26 }}><option value={0}>{tStatus('自动', lang)}</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label>
            <label>{tStatus('厚度', lang)} <input type="number" step={1} min={2} value={featDlg.params.th} onChange={(e) => setFeatParam('th', Number(e.target.value))} style={{ width: 44 }} /></label>
            <label>{tStatus('孔Ø', lang)} <input type="number" step={1} min={0} value={featDlg.params.bore} onChange={(e) => setFeatParam('bore', Number(e.target.value))} style={{ width: 42 }} /></label>
            <label title={tStatus('斜齿螺旋角（0=直齿）— 自动啮合对反向', lang)}>β° <input type="number" step={5} min={0} max={35} value={featDlg.params.helix ?? 0} onChange={(e) => setFeatParam('helix', Number(e.target.value))} style={{ width: 42 }} /></label>
            <GearboxPreview ratio={Number(featDlg.params.ratio)} m={Number(featDlg.params.m)} stages={Number(featDlg.params.stages)} />
          </>)}
          {featDlg.kind === 'worm' && (<>
            <label>{tStatus('模数m', lang)} <input type="number" step={0.5} min={0.5} value={featDlg.params.module} onChange={(e) => setFeatParam('module', Number(e.target.value))} style={{ width: 48 }} /></label>
            <label title={tStatus('头数：1头=大减速比自锁倾向；2-4头=高效', lang)}>{tStatus('头数', lang)} <input type="number" step={1} min={1} max={4} value={featDlg.params.starts} onChange={(e) => setFeatParam('starts', Number(e.target.value))} style={{ width: 42 }} /></label>
            <label>{tStatus('长度', lang)} <input type="number" step={5} min={10} value={featDlg.params.length} onChange={(e) => setFeatParam('length', Number(e.target.value))} style={{ width: 50 }} /></label>
            <span style={{ fontSize: 11, color: '#8a939c' }}>{tStatus('分度Ø', lang)} {(Number(featDlg.params.module) * 8).toFixed(0)} · {tStatus('比=头数:蜗轮齿数', lang)}</span>
          </>)}
          {(featDlg.kind === 'othread' || featDlg.kind === 'ithread') && (() => {
            // GM-3DV1 S11：标准库 + 配合等级 + 局部长度（Full Length off → 长度/偏移）— 共用块
            const isI = featDlg.kind === 'ithread'
            const std = String(featDlg.params.standard ?? 'iso')
            const T = THREAD_STDS[std] ?? THREAD_STDS.iso
            const classes = isI ? T.clsInt : T.clsExt
            const full = !!+(featDlg.params.fullLen ?? 1)
            return (<>
              <label title={tStatus('螺纹标准（Fusion Thread Type）：ISO 公制 / UNC·UNF 英制。UNC/UNF 用英制尺寸+25.4/tpi 螺距，牙形仍 60° ISO 近似。', lang)}>{tStatus('标准', lang)} <select value={std} onChange={(e) => setFeatParam('standard', e.target.value)} style={{ height: 26 }}>{Object.entries(THREAD_STDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
              <ThreadSpecSelect d={+featDlg.params.d} pitch={+featDlg.params.pitch} std={std} lang={lang} onPick={(dd, pp) => { setFeatParam('d', dd); setFeatParam('pitch', pp) }} />
              <label title={isI ? tStatus('公称螺纹直径（M 值）：M8=8', lang) : tStatus('圆柱面直径（牙底 Ø）', lang)}>{tStatus(isI ? '公称Ø' : '直径Ø', lang)} <input type="number" step={0.5} min={isI ? 1 : 2} value={featDlg.params.d} onChange={(e) => setFeatParam('d', Number(e.target.value))} style={{ width: 50 }} /></label>
              <label title={tStatus('螺距（mm）', lang)}>{tStatus('螺距', lang)} <input type="number" step={0.25} min={0.3} value={featDlg.params.pitch} onChange={(e) => setFeatParam('pitch', Number(e.target.value))} style={{ width: 46 }} /></label>
              <label title={tStatus('配合等级（Fusion Class）：外螺纹 6g/2A… 内螺纹 6H/2B…。纯公差元数据，v1 不改牙几何。', lang)}>{tStatus('等级', lang)} <select value={String(featDlg.params.cls ?? '')} onChange={(e) => setFeatParam('cls', e.target.value)} style={{ height: 26 }}><option value="">{tStatus('（默认）', lang)}</option>{classes.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title={tStatus('全长（Fusion Full Length）：勾=攻/包整段（长度=下面高度/深度）；唔勾=局部螺纹（露出 长度 + 偏移 字段）', lang)}><input type="checkbox" checked={full} onChange={(e) => setFeatParam('fullLen', e.target.checked ? 1 : 0)} />{tStatus('全长', lang)}</label>
              <label title={isI ? tStatus('攻牙深度/长度（由孔底 z + 偏移 向上）', lang) : tStatus('螺纹长度（沿圆柱面轴向）', lang)}>{tStatus(full ? (isI ? '深度' : '高度') : '长度', lang)} <input type="number" step={1} min={1} value={featDlg.params.height} onChange={(e) => setFeatParam('height', Number(e.target.value))} style={{ width: 48 }} /></label>
              {!full && <label title={tStatus('偏移（Fusion Offset）：由面/孔起点沿轴向偏移一段再开始上牙（局部螺纹起点）', lang)}>{tStatus('偏移', lang)} <input type="number" step={1} min={0} value={featDlg.params.toff ?? 0} onChange={(e) => setFeatParam('toff', Number(e.target.value))} style={{ width: 48 }} /></label>}
              {isI && <label title={tStatus('孔底 z（盲孔攻牙由呢度向上；0=由底面起 — 旧行为）', lang)}>{tStatus('孔底z', lang)} <input type="number" step={1} min={0} value={featDlg.params.z0 ?? 0} onChange={(e) => setFeatParam('z0', Number(e.target.value))} style={{ width: 48 }} /></label>}
              {isI && <label title={tStatus('孔心 CAD 坐标（拾孔内壁自动填）', lang)}>{tStatus('中心', lang)} <input type="number" step={1} value={featDlg.params.x} onChange={(e) => setFeatParam('x', Number(e.target.value))} style={{ width: 44 }} /><input type="number" step={1} value={featDlg.params.y} onChange={(e) => setFeatParam('y', Number(e.target.value))} style={{ width: 44 }} /></label>}
              {!isI && <span style={{ fontSize: 11, color: '#8a939c' }}>{tStatus('位置', lang)} ({featDlg.params.x},{featDlg.params.y}) z{featDlg.params.z0}{tStatus('（拾面自动填）', lang)}</span>}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title={tStatus('建模螺纹 Modeled：勾=真螺旋牙（compound，之后唔好圆角/STEP）；唔勾=cosmetic 外观标注（B-rep 乾净 — Fusion 默认）', lang)}><input type="checkbox" checked={!!+(featDlg.params.modeled || 0)} onChange={(e) => setFeatParam('modeled', e.target.checked ? 1 : 0)} />{tStatus('建模螺纹', lang)}</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title={tStatus('左旋牙 Left hand（Fusion）：勾=左旋（逆时针拧入）；缺省=右旋（标准）', lang)}><input type="checkbox" checked={!!+(featDlg.params.lefthand || 0)} onChange={(e) => setFeatParam('lefthand', e.target.checked ? 1 : 0)} />{tStatus('左旋牙', lang)}</label>
              {isI && <span style={{ fontSize: 11, color: '#8a939c' }}>{tStatus('提示：用「面加螺纹」直接点孔内壁可自动填全部字段', lang)}</span>}
            </>)
          })()}
          {featDlg.kind === 'crowngear' && (<>
            <label>{tStatus('模数m', lang)} <input type="number" step={0.5} min={0.5} value={featDlg.params.module} onChange={(e) => setFeatParam('module', Number(e.target.value))} style={{ width: 48 }} /></label>
            <label>{tStatus('齿数z', lang)} <input type="number" step={1} min={8} value={featDlg.params.teeth} onChange={(e) => setFeatParam('teeth', Number(e.target.value))} style={{ width: 48 }} /></label>
            <label>{tStatus('盘厚', lang)} <input type="number" step={1} min={1} value={featDlg.params.discH} onChange={(e) => setFeatParam('discH', Number(e.target.value))} style={{ width: 44 }} /></label>
            <label>{tStatus('齿宽', lang)} <input type="number" step={1} min={2} value={featDlg.params.faceW} onChange={(e) => setFeatParam('faceW', Number(e.target.value))} style={{ width: 44 }} /></label>
            <label>{tStatus('孔Ø', lang)} <input type="number" step={1} min={0} value={featDlg.params.bore} onChange={(e) => setFeatParam('bore', Number(e.target.value))} style={{ width: 42 }} /></label>
          </>)}
          {featDlg.kind === 'pulley' && (<>
            <label>{tStatus('外径', lang)} <input type="number" step={5} min={4} value={featDlg.params.diameter} onChange={(e) => setFeatParam('diameter', Number(e.target.value))} style={{ width: 52 }} /></label>
            <label>{tStatus('宽度', lang)} <input type="number" step={2} min={2} value={featDlg.params.width} onChange={(e) => setFeatParam('width', Number(e.target.value))} style={{ width: 46 }} /></label>
            <label>{tStatus('中心孔Ø', lang)} <input type="number" step={1} min={1} value={featDlg.params.bore} onChange={(e) => setFeatParam('bore', Number(e.target.value))} style={{ width: 46 }} /></label>
          </>)}
          {featDlg.kind === 'rack' && (<>
            <label title={tStatus('模数要同啮合嘅齿轮一致', lang)}>{tStatus('模数m', lang)} <input type="number" step={0.5} min={0.2} value={featDlg.params.module} onChange={(e) => setFeatParam('module', Number(e.target.value))} style={{ width: 50 }} /></label>
            <label>{tStatus('长度', lang)} <input type="number" step={10} min={5} value={featDlg.params.length} onChange={(e) => setFeatParam('length', Number(e.target.value))} style={{ width: 52 }} /></label>
            <label>{tStatus('底座高', lang)} <input type="number" step={1} min={0.5} value={featDlg.params.baseH} onChange={(e) => setFeatParam('baseH', Number(e.target.value))} style={{ width: 46 }} /></label>
            <label>{tStatus('厚度', lang)} <input type="number" step={1} min={0.5} value={featDlg.params.thickness} onChange={(e) => setFeatParam('thickness', Number(e.target.value))} style={{ width: 46 }} /></label>
          </>)}
          {featDlg.kind === 'thread' && (<>
            <label>Ø <input type="number" step={1} min={2} value={featDlg.params.d} onChange={(e) => setFeatParam('d', Number(e.target.value))} style={{ width: 52 }} /></label>
            <label>{tStatus('螺距', lang)} <input type="number" step={0.5} min={0.5} value={featDlg.params.pitch} onChange={(e) => setFeatParam('pitch', Number(e.target.value))} style={{ width: 48 }} /></label>
            <label>{tStatus('高', lang)} <input type="number" step={5} min={2} value={featDlg.params.h} onChange={(e) => setFeatParam('h', Number(e.target.value))} style={{ width: 52 }} /></label>
          </>)}
          {featDlg.kind === 'cylpatch' && (<>
            <label>{tStatus('类型', lang)} <select value={featDlg.params.mode} onChange={(e) => setFeatParam('mode', e.target.value)} style={{ height: 26 }}><option value="boss">{tStatus('凸台', lang)}</option><option value="pocket">{tStatus('凹槽', lang)}</option><option value="flat">{tStatus('锉平面', lang)}</option></select></label>
            <label>{tStatus('角度位置', lang)} <input type="number" step={15} value={featDlg.params.ang} onChange={(e) => setFeatParam('ang', Number(e.target.value))} style={{ width: 50 }} />°</label>
            {featDlg.params.mode !== 'flat' && <label>{tStatus('角宽', lang)} <input type="number" step={10} min={5} value={featDlg.params.arc} onChange={(e) => setFeatParam('arc', Number(e.target.value))} style={{ width: 46 }} />°</label>}
            <label>{tStatus('轴向中心', lang)} <input type="number" step={5} value={featDlg.params.zc} onChange={(e) => setFeatParam('zc', Number(e.target.value))} style={{ width: 48 }} /></label>
            <label>{tStatus('高', lang)} <input type="number" step={5} min={1} value={featDlg.params.h} onChange={(e) => setFeatParam('h', Number(e.target.value))} style={{ width: 46 }} /></label>
            <label>{tStatus('深度', lang)} <input type="number" step={1} min={0.5} value={featDlg.params.depth} onChange={(e) => setFeatParam('depth', Number(e.target.value))} style={{ width: 44 }} /></label>
          </>)}
          {featDlg.kind === 'sheetmetal' && (<>
            <label title={tStatus('钣金规则（T768 Fusion Sheet Metal Rules）：按材料一键填 厚度/折弯R/K 因子', lang)}>{tStatus('规则', lang)} <select defaultValue="" onChange={(e) => { const r = SM_RULES[e.target.value]; if (r) { setFeatParam('thickness', r.t); setFeatParam('radius', r.r); setFeatParam('kfactor', r.k) } }} style={{ height: 26 }}><option value="">{tStatus('自定义', lang)}</option>{Object.keys(SM_RULES).map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
            <label>{tStatus('截面', lang)} <select value={featDlg.params.preset} onChange={(e) => setFeatParam('preset', e.target.value)} style={{ height: 26 }}><option value="L">{tStatus('L 角铁', lang)}</option><option value="U">{tStatus('U 槽', lang)}</option><option value="Z">{tStatus('Z 件', lang)}</option></select></label>
            <label>{tStatus('厚度', lang)} <input type="number" step={0.5} min={0.2} value={featDlg.params.thickness} onChange={(e) => setFeatParam('thickness', Number(e.target.value))} style={{ width: 44 }} /></label>
            <label>{tStatus('折弯R', lang)} <input type="number" step={0.5} min={0.1} value={featDlg.params.radius} onChange={(e) => setFeatParam('radius', Number(e.target.value))} style={{ width: 44 }} /></label>
            <label title={tStatus('K 因子：中性轴位置(0~0.5)，钢件常用 0.38~0.44，决定展开料长', lang)}>K <input type="number" step={0.05} min={0} max={0.5} value={featDlg.params.kfactor} onChange={(e) => setFeatParam('kfactor', Number(e.target.value))} style={{ width: 44 }} /></label>
            <label>{tStatus('宽', lang)} <input type="number" step={5} min={1} value={featDlg.params.width} onChange={(e) => setFeatParam('width', Number(e.target.value))} style={{ width: 46 }} /></label>
            <label>{tStatus('段长A', lang)} <input type="number" step={5} min={1} value={featDlg.params.legA} onChange={(e) => setFeatParam('legA', Number(e.target.value))} style={{ width: 46 }} /></label>
            <label>{tStatus('段长B', lang)} <input type="number" step={5} min={1} value={featDlg.params.legB} onChange={(e) => setFeatParam('legB', Number(e.target.value))} style={{ width: 46 }} /></label>
            <label title={tStatus('展开 = 激光下料用的平料(含 K 因子折弯余量)', lang)}>{tStatus('状态', lang)} <select value={featDlg.params.flat} onChange={(e) => setFeatParam('flat', Number(e.target.value))} style={{ height: 26 }}><option value={0}>{tStatus('折叠', lang)}</option><option value={1}>{tStatus('展开图', lang)}</option></select></label>
          </>)}
          {featDlg.kind === 'plane' && (<>
            <label>{tStatus('基准面', lang)} <select value={featDlg.params.base} onChange={(e) => setFeatParam('base', e.target.value)} style={{ height: 26 }}><option value="XY">{tStatus('XY(上)', lang)}</option><option value="XZ">{tStatus('XZ(前)', lang)}</option><option value="YZ">{tStatus('YZ(右)', lang)}</option><option value="midXY">{tStatus('XY 中间面', lang)}</option><option value="midXZ">{tStatus('XZ 中间面', lang)}</option><option value="midYZ">{tStatus('YZ 中间面', lang)}</option></select></label>
            {!String(featDlg.params.base).startsWith('mid') && <label>{tStatus('偏移', lang)} <input type="number" step={5} value={featDlg.params.offset} onChange={(e) => setFeatParam('offset', Number(e.target.value))} style={{ width: 60 }} /> mm</label>}
            {String(featDlg.params.base).startsWith('mid') && <span style={{ fontSize: 11, color: '#8a939c' }}>{tStatus('自动取实体中部', lang)}</span>}
            {!String(featDlg.params.base).startsWith('mid') && <label title={tStatus('角度面（Fusion Plane at Angle）：基面绕自身局部 x/y 轴旋转 — 0 = 普通偏移平面', lang)}>{tStatus('∠角度', lang)} <input type="number" step={5} min={-89} max={89} value={featDlg.params.angle ?? 0} onChange={(e) => setFeatParam('angle', Number(e.target.value))} style={{ width: 48 }} />°</label>}
            {!String(featDlg.params.base).startsWith('mid') && Number(featDlg.params.angle) !== 0 && <label>{tStatus('绕', lang)} <select value={featDlg.params.aaxis ?? 'x'} onChange={(e) => setFeatParam('aaxis', e.target.value)} style={{ height: 26 }}><option value="x">{tStatus('面内 x 轴', lang)}</option><option value="y">{tStatus('面内 y 轴', lang)}</option></select></label>}
            <div style={{ display: 'flex', gap: 4, width: '100%' }}>
              <button className="cs-btn" style={{ flex: 1 }} title={tStatus('三点平面（T778）：用最后 3 个构造点定一个面', lang)} onClick={() => { useApp.getState().cancelFeatDlg(); useApp.getState().addPlane3Points() }}>{tStatus('三点面', lang)}</button>
              <button className="cs-btn" style={{ flex: 1 }} title={tStatus('相切面（T778）：点圆柱面（孔/轴/凸台）→ 喺点击侧生成切面', lang)} onClick={() => { useApp.getState().cancelFeatDlg(); useApp.getState().startDatumPick('tanplane') }}>{tStatus('相切面', lang)}</button>
              <button className="cs-btn" style={{ flex: 1 }} title={tStatus('两面中面（T778）：点两个平行平面 → 正中间生成参考面', lang)} onClick={() => { useApp.getState().cancelFeatDlg(); useApp.getState().startDatumPick('midplane') }}>{tStatus('两面中面', lang)}</button>
              <button className="cs-btn" style={{ flex: 1 }} title={tStatus('偏移面（S158，Fusion 最常用 datum）：点任一平面（含斜面）→ 输入距离 → 沿面法向生成平行参考平面', lang)} onClick={() => { useApp.getState().cancelFeatDlg(); useApp.getState().startDatumPick('offsetface') }}>{tStatus('偏移面', lang)}</button>
              <button className="cs-btn" style={{ flex: 1 }} title={tStatus('过点平行面（S170，Fusion Offset Plane to-point）：先用「构造点」落一个点 → 点任一平面 → 生成平行该面、且过该构造点嘅参考平面（唔使输距离）', lang)} onClick={() => { useApp.getState().cancelFeatDlg(); useApp.getState().startDatumPick('parplanept') }}>{tStatus('过点平行面', lang)}</button>
              <button className="cs-btn" style={{ flex: 1 }} title={tStatus('路径平面（S166，Fusion Plane Along Path）：点一条边 → 输入沿边位置 → 喺该点建一个【⊥边切向】嘅参考平面（扫掠/管件截面起点）', lang)} onClick={() => { useApp.getState().cancelFeatDlg(); void useApp.getState().startEdgePointPick('pathplane') }}>{tStatus('路径平面', lang)}</button>
              <button className="cs-btn" style={{ flex: 1 }} title={tStatus('角度平面（S169，Fusion Plane at Angle 过边）：点一条边 → 输入角度 → 建一个【包含该边、绕边轴倾斜】嘅参考平面（铰链/斜筋/拔模基准）', lang)} onClick={() => { useApp.getState().cancelFeatDlg(); void useApp.getState().startEdgePointPick('angleplane') }}>{tStatus('角度平面', lang)}</button>
            </div>
          </>)}
          {featDlg.kind === 'cpoint' && (<>
            <label>X <input type="number" step={5} value={featDlg.params.x} onChange={(e) => setFeatParam('x', Number(e.target.value))} style={{ width: 52 }} /></label>
            <label>Y <input type="number" step={5} value={featDlg.params.y} onChange={(e) => setFeatParam('y', Number(e.target.value))} style={{ width: 52 }} /></label>
            <label>Z <input type="number" step={5} value={featDlg.params.z} onChange={(e) => setFeatParam('z', Number(e.target.value))} style={{ width: 52 }} /></label>
            <button className="cs-btn" title={tStatus('两点中点（T778）：用最后 2 个构造点嘅中点落一个新构造点', lang)} onClick={() => { useApp.getState().cancelFeatDlg(); useApp.getState().addMidpointCPoint() }}>{tStatus('两点中点', lang)}</button>
            <button className="cs-btn" title={tStatus('圆心点（S159，Fusion Point at Center）：点圆柱面（孔壁/圆轴/凸台侧）→ 喺其轴上（点击高度）落构造点', lang)} onClick={() => { useApp.getState().cancelFeatDlg(); useApp.getState().startDatumPick('circcenter') }}>{tStatus('圆心点', lang)}</button>
            <button className="cs-btn" title={tStatus('边上点（S164，Fusion Point Along Path）：点一条边 → 输入沿边比例 0~1 或「Nmm」距起点 → 落构造点', lang)} onClick={() => { useApp.getState().cancelFeatDlg(); void useApp.getState().startEdgePointPick('ratio') }}>{tStatus('边上点', lang)}</button>
            <button className="cs-btn" title={tStatus('边端点（Fusion Point at Vertex）：点一条边 → 喺最近端点(顶点)落构造点', lang)} onClick={() => { useApp.getState().cancelFeatDlg(); void useApp.getState().startEdgePointPick('vertex') }}>{tStatus('边端点', lang)}</button>
            <button className="cs-btn" title={tStatus('边中点：点一条边 → 喺其中点落构造点', lang)} onClick={() => { useApp.getState().cancelFeatDlg(); void useApp.getState().startEdgePointPick('mid') }}>{tStatus('边中点', lang)}</button>
            {caxes.length > 0 && (
              <label title={tStatus('钻孔方向：默认顶面沿世界 Z（现状）；选构造轴 → 每个构造点沿该轴方向钻（斜面/侧壁/有 Z 的点都钻得正，Fusion『孔 > 方向：沿轴』）', lang)}>{tStatus('钻向', lang)} <select value={drillCaxis == null ? '' : String(drillCaxis)} onChange={(e) => { const v = e.target.value; useApp.setState({ drillCaxis: v === '' ? null : Number(v) }) }} style={{ height: 26 }}><option value="">{tStatus('（顶面沿Z — 现状）', lang)}</option>{caxes.map((ca, i) => <option key={'DCA' + i} value={i}>{tStatus('构造轴', lang)}{i + 1}（{ca.dirV ? ca.dirV.map((v) => +v.toFixed(1)).join(',') : ca.dir} @ {ca.at.map((v) => +v.toFixed(0)).join(',')}）</option>)}</select></label>
            )}
            <button className="cs-btn" title={tStatus('构造点批量孔（S151）：按所有构造点的 XY 位置一次过钻孔（孔径/类型用「孔」设置）。钻向=顶面沿Z（默认）或选构造轴方向斜钻/侧钻 — 令构造点驱动几何，唔再只系参考点', lang)} onClick={() => { useApp.getState().cancelFeatDlg(); void useApp.getState().addHolesAtCpoints() }}>{tStatus('⊙ 批量孔', lang)}</button>
          </>)}
          {featDlg.kind === 'cptgrid' && (<>
            <label title={tStatus('矩形阵列（行×列，居中于原点）/ 极坐标阵列（个数均布于半径圆）', lang)}>{tStatus('模式', lang)} <select value={featDlg.params.mode} onChange={(e) => setFeatParam('mode', e.target.value)} style={{ height: 26 }}><option value="rect">{tStatus('矩形', lang)}</option><option value="polar">{tStatus('极坐标', lang)}</option></select></label>
            {featDlg.params.mode !== 'polar' && (<>
              <label>{tStatus('行', lang)} <input type="number" step={1} min={1} value={featDlg.params.rows} onChange={(e) => setFeatParam('rows', Number(e.target.value))} style={{ width: 44 }} /></label>
              <label>{tStatus('列', lang)} <input type="number" step={1} min={1} value={featDlg.params.cols} onChange={(e) => setFeatParam('cols', Number(e.target.value))} style={{ width: 44 }} /></label>
              <label>{tStatus('X间距', lang)} <input type="number" step={5} value={featDlg.params.sx} onChange={(e) => setFeatParam('sx', Number(e.target.value))} style={{ width: 50 }} /></label>
              <label>{tStatus('Y间距', lang)} <input type="number" step={5} value={featDlg.params.sy} onChange={(e) => setFeatParam('sy', Number(e.target.value))} style={{ width: 50 }} /></label>
            </>)}
            {featDlg.params.mode === 'polar' && (<>
              <label>{tStatus('个数', lang)} <input type="number" step={1} min={1} value={featDlg.params.count} onChange={(e) => setFeatParam('count', Number(e.target.value))} style={{ width: 48 }} /></label>
              <label>{tStatus('半径', lang)} <input type="number" step={5} min={0} value={featDlg.params.r} onChange={(e) => setFeatParam('r', Number(e.target.value))} style={{ width: 52 }} /></label>
            </>)}
            <label>Z <input type="number" step={5} value={featDlg.params.z} onChange={(e) => setFeatParam('z', Number(e.target.value))} style={{ width: 52 }} /></label>
          </>)}
          {featDlg.kind === 'caxis' && (<>
            <label>{tStatus('方向', lang)} <select value={featDlg.params.dir} onChange={(e) => setFeatParam('dir', e.target.value)} style={{ height: 26 }}><option>X</option><option>Y</option><option>Z</option></select></label>
            <label>{tStatus('经过', lang)} <input type="number" step={5} value={featDlg.params.x} onChange={(e) => setFeatParam('x', Number(e.target.value))} style={{ width: 44 }} /><input type="number" step={5} value={featDlg.params.y} onChange={(e) => setFeatParam('y', Number(e.target.value))} style={{ width: 44 }} /><input type="number" step={5} value={featDlg.params.z} onChange={(e) => setFeatParam('z', Number(e.target.value))} style={{ width: 44 }} /></label>
            {useApp.getState().cpoints.length > 0 && (
              <label title={tStatus('用已建构造点做轴经过点：选中后自动填经过点 x/y/z（构造点驱动轴原点）', lang)}>{tStatus('构造点', lang)} <select value="" onChange={(e) => { const i = Number(e.target.value); if (!Number.isInteger(i)) return; const cp = useApp.getState().cpoints[i]; if (!cp) return; setFeatParam('x', cp[0]); setFeatParam('y', cp[1]); setFeatParam('z', cp[2]) }} style={{ height: 26 }}><option value="">{tStatus('— 选构造点 —', lang)}</option>{useApp.getState().cpoints.map((cp, i) => <option key={'CP' + i} value={i}>{tStatus('构造点', lang)}{i + 1}（{cp.map((v) => +v.toFixed(0)).join(',')}）</option>)}</select></label>
            )}
            <button className="cs-btn" title={tStatus('Axis Through Cylinder（Fusion 同款）：点圆柱面（孔/轴/凸台）→ 方向+经过点自动填', lang)} onClick={() => useApp.getState().startCpatAxisPick()}>{tStatus('🎯拾圆柱面', lang)}</button>
            <button className="cs-btn" title={tStatus('两点轴（T778）：用最后 2 个构造点连一条任意方向轴', lang)} onClick={() => { useApp.getState().cancelFeatDlg(); useApp.getState().addAxis2Points() }}>{tStatus('两点轴', lang)}</button>
            <button className="cs-btn" title={tStatus('⊥面轴（S159，Fusion Axis Normal to Face）：点任一平面 → 沿面法向、过点击点生成构造轴（做孔向/扫掠轴/环形阵列轴）', lang)} onClick={() => { useApp.getState().cancelFeatDlg(); useApp.getState().startDatumPick('normalaxis') }}>{tStatus('⊥面轴', lang)}</button>
            <button className="cs-btn" title={tStatus('两面轴（S167，Fusion Axis Through Two Planes）：点两个【唔平行】平面 → 沿其交线生成构造轴（折线/对称中线/两壁相交线）', lang)} onClick={() => { useApp.getState().cancelFeatDlg(); useApp.getState().startDatumPick('planeaxis') }}>{tStatus('两面轴', lang)}</button>
            <button className="cs-btn" title={tStatus('沿边轴（S178，Fusion Axis Through Edge）：点一条直边 → 沿该边方向生成构造轴（旋转轴/环形阵列轴）', lang)} onClick={() => { useApp.getState().cancelFeatDlg(); void useApp.getState().startEdgePointPick('edgeaxis') }}>{tStatus('沿边轴', lang)}</button>
          </>)}
        </CommandDialog>
      )}

      {/* GM-3DV2 R1：统一「构造几何」命令（Fusion Construction Geometry）—— Type 三态 + Method 下拉换字段/拾取槽 */}
      {datumCmd && (() => {
        const dc = datumCmd
        const key = dc.type + ':' + dc.method
        const isField = key === 'plane:offset' || key === 'point:xyz' || key === 'axis:dirPoint'
        const isButton = false
        const acc = DATUM_CMD_ACC[key]
        const dp = (k: string, v: number | string) => useApp.getState().setDatumCmdParam(k, v)
        const P = dc.params
        const ready = !!acc && dc.picks.length >= acc.length
        const summary = acc
          ? tStatus(ready ? `已拾取 ${dc.picks.length}/${acc.length} · 按确定建立` : `拾取 ${dc.picks.length}/${acc.length}`, lang)
          : isField ? tStatus('填字段 → 确定', lang)
            : isButton ? tStatus('用已落嘅构造点', lang) : tStatus('喺画布拾取', lang)
        return (
          <CommandDialog icon="plane" title="构造几何" width={288} summary={summary}
            okLabel={isField || acc ? '确定' : '关闭'}
            okDisabled={!!acc && !ready}
            onOk={() => {
              if (isField) { useApp.getState().commitDatumCmdField(); return }
              if (acc) {
                const current = useApp.getState().datumCmd
                if (!current || current.picks.length < acc.length) return
                useApp.setState({ datumCmd: { ...current, params: { ...current.params, __confirm: 1 } } })
                void useApp.getState().datumCmdClickAt(null, [0, 0, 0])
                return
              }
              useApp.getState().closeDatumCmd()
            }}
            onCancel={() => useApp.getState().closeDatumCmd()}>
            <div style={{ display: 'flex', gap: 4, width: '100%' }}>
              {(['plane', 'axis', 'point'] as const).map((t) => (
                <button key={t} className="cs-btn" style={{ flex: 1, ...(dc.type === t ? { background: '#1572c4', color: '#fff', borderColor: '#1572c4' } : {}) }} onClick={() => useApp.getState().setDatumCmdType(t)}>{tStatus(t === 'plane' ? '平面' : t === 'axis' ? '轴' : '点', lang)}</button>
              ))}
            </div>
            <label>{tStatus('方法', lang)} <select value={dc.method} onChange={(e) => useApp.getState().setDatumCmdMethod(e.target.value)} style={{ height: 26, maxWidth: 190 }}>{DATUM_CMD_METHODS[dc.type].map((m) => <option key={m.id} value={m.id}>{tStatus(m.label, lang)}</option>)}</select></label>
            {/* 字段法 */}
            {key === 'plane:offset' && (<>
              <div className="sb-hint" style={{ width: '100%', fontSize: 11, lineHeight: 1.4 }}>
                {tStatus('圓柱／圓錐側面不能當偏移基準；先在下面選原點 XY／XZ／YZ（或中間面），再輸入偏移距離。', lang)}
              </div>
              <label>{tStatus('基准面', lang)} <select value={String(P.base ?? 'XY')} onChange={(e) => dp('base', e.target.value)} style={{ height: 26 }}><option value="XY">{tStatus('XY(上)', lang)}</option><option value="XZ">{tStatus('XZ(前)', lang)}</option><option value="YZ">{tStatus('YZ(右)', lang)}</option><option value="midXY">{tStatus('XY 中间面', lang)}</option><option value="midXZ">{tStatus('XZ 中间面', lang)}</option><option value="midYZ">{tStatus('YZ 中间面', lang)}</option></select></label>
              {!String(P.base).startsWith('mid') && <label>{tStatus('偏移', lang)} <input type="number" step={5} value={Number(P.offset ?? 0)} onChange={(e) => dp('offset', Number(e.target.value))} style={{ width: 60 }} /> mm</label>}
              {String(P.base).startsWith('mid') && <span style={{ fontSize: 11, color: '#8a939c' }}>{tStatus('自动取实体中部', lang)}</span>}
              {!String(P.base).startsWith('mid') && <label title={tStatus('角度面（Plane at Angle）：绕面内 x/y 轴旋转 — 0 = 普通偏移', lang)}>{tStatus('∠角度', lang)} <input type="number" step={5} min={-89} max={89} value={Number(P.angle ?? 0)} onChange={(e) => dp('angle', Number(e.target.value))} style={{ width: 48 }} />°</label>}
              {!String(P.base).startsWith('mid') && Number(P.angle) !== 0 && <label>{tStatus('绕', lang)} <select value={String(P.aaxis ?? 'x')} onChange={(e) => dp('aaxis', e.target.value)} style={{ height: 26 }}><option value="x">{tStatus('面内 x 轴', lang)}</option><option value="y">{tStatus('面内 y 轴', lang)}</option></select></label>}
            </>)}
            {key === 'point:xyz' && (<>
              <label>X <input type="number" step={5} value={Number(P.x ?? 0)} onChange={(e) => dp('x', Number(e.target.value))} style={{ width: 52 }} /></label>
              <label>Y <input type="number" step={5} value={Number(P.y ?? 0)} onChange={(e) => dp('y', Number(e.target.value))} style={{ width: 52 }} /></label>
              <label>Z <input type="number" step={5} value={Number(P.z ?? 0)} onChange={(e) => dp('z', Number(e.target.value))} style={{ width: 52 }} /></label>
            </>)}
            {key === 'axis:dirPoint' && (<>
              <label>{tStatus('方向', lang)} <select value={String(P.dir ?? 'X')} onChange={(e) => dp('dir', e.target.value)} style={{ height: 26 }}><option>X</option><option>Y</option><option>Z</option></select></label>
              <label>{tStatus('经过', lang)} <input type="number" step={5} value={Number(P.x ?? 0)} onChange={(e) => dp('x', Number(e.target.value))} style={{ width: 44 }} /><input type="number" step={5} value={Number(P.y ?? 0)} onChange={(e) => dp('y', Number(e.target.value))} style={{ width: 44 }} /><input type="number" step={5} value={Number(P.z ?? 0)} onChange={(e) => dp('z', Number(e.target.value))} style={{ width: 44 }} /></label>
              {cpoints.length > 0 && <label title={tStatus('使用已建立的构造点作为构造轴经过点；选择后会填入 XYZ 坐标。', lang)}>{tStatus('构造点', lang)} <select data-testid="datum-axis-point" value="" onChange={(e) => { const i = Number(e.target.value); const cp = cpoints[i]; if (!Number.isInteger(i) || !cp) return; dp('x', cp[0]); dp('y', cp[1]); dp('z', cp[2]) }} style={{ height: 26 }}><option value="">{tStatus('— 选构造点 —', lang)}</option>{cpoints.map((cp, i) => <option key={`datumAxisPoint${i}`} value={i}>{tStatus('构造点', lang)}{i + 1}（{cp.map((v) => +v.toFixed(0)).join(',')}）</option>)}</select></label>}
            </>)}
            {/* 垂直面（累积法 + 距离字段） */}
            {key === 'plane:perp' && <label title={tStatus('沿垂直面法向偏移距离', lang)}>{tStatus('偏移', lang)} <input type="number" step={5} value={Number(P.dist ?? 0)} onChange={(e) => dp('dist', Number(e.target.value))} style={{ width: 56 }} /> mm</label>}
            {/* 累积拾取进度 */}
            {acc && <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', fontSize: 11, color: ready ? '#2f9e44' : '#1572c4' }}><span style={{ flex: 1 }}>{tStatus('已拾', lang)} {dc.picks.length}/{acc.length}（{acc.map((x) => tStatus(x === 'p' ? '构造点' : x === 'e' ? '边' : x === 'c' ? '圆柱面' : '平面', lang)).join(' + ')}）</span>{dc.picks.length > 0 && <button className="sb-tool" type="button" onClick={() => useApp.setState({ datumCmd: { ...dc, picks: [], params: { ...dc.params, __confirm: 0 } } })}>{tStatus('清除选择', lang)}</button>}</div>}
            {/* 遗留拾取法提示 */}
            {!isField && !isButton && !acc && <span style={{ fontSize: 11, color: '#8a939c' }}>{tStatus('喺画布按提示拾取（状态栏有指引）', lang)}</span>}
          </CommandDialog>
        )
      })()}

      {mode === 'pickplane' && (
        <div className="sketch-bar" style={{ gap: 10 }}>
          <span className="sb-title">{tStatus('选择草图基准面', lang)}</span>
          <span className="sb-hint">{tStatus('点', lang)} <b style={{ color: '#d6694e' }}>{tStatus('红 XY', lang)}</b> / <b style={{ color: '#4e9e5e' }}>{tStatus('绿 XZ', lang)}</b> / <b style={{ color: '#4e7fd6' }}>{tStatus('蓝 YZ', lang)}</b> {tStatus('基准面，或直接点实体的一个平面', lang)}　·　<b>Esc</b> {tStatus('取消', lang)}</span>
        </div>
      )}

      {/* T805 曲面 Patch：拾边界点横幅 — 点数 + 完成/撤/取消 */}
      {patchMode && (
        <div className="sketch-bar" style={{ gap: 8 }}>
          <span className="sb-title">{tStatus('🩹 曲面 Patch', lang)}</span>
          <span className="sb-hint">{tStatus('点实体表面顺序圈出闭合边界（已拾', lang)} <b style={{ color: '#1572c4' }}>{patchPts.length}</b> {tStatus('点，至少 3 点）', lang)}</span>
          <button className="sb-finish" disabled={patchPts.length < 3} title={tStatus('填充曲面 + 加厚成薄板', lang)} onClick={() => void useApp.getState().finishPatch()}>{tStatus('✓ 完成（填充+加厚）', lang)}</button>
          <button className="sb-tool" disabled={!patchPts.length} title={tStatus('撤上一点', lang)} onClick={() => useApp.getState().undoPatchPt()}>{tStatus('⌫ 撤点', lang)}</button>
          <button className="sb-tool" title={tStatus('取消曲面 Patch', lang)} onClick={() => useApp.getState().togglePatch()}>{tStatus('✕ 取消', lang)}</button>
        </div>
      )}

      {/* 参数化组件 edit-in-place（T734）：编辑中横幅 — 完成写返 / 取消还原 */}
      {editingComp && (
        <div style={{ position: 'fixed', top: 96, left: '50%', transform: 'translateX(-50%)', zIndex: 220, background: '#fff8ec', border: '1px solid #d9a64e', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.18)', padding: '6px 12px', display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
          <b>{tStatus('✎ 编辑组件「', lang)}{components.find((c) => c.id === editingComp)?.name ?? editingComp}{tStatus('」中', lang)}</b>
          <span style={{ color: '#8a7a55', fontSize: 12 }}>{tStatus('时间轴改参数 / 双击重开草图 / 加特征', lang)}</span>
          <button className="sb-finish" onClick={() => useApp.getState().finishComponentEdit()}>{tStatus('✓ 完成编辑', lang)}</button>
          <button className="sb-tool" onClick={() => void useApp.getState().cancelComponentEdit()}>{tStatus('✕ 取消', lang)}</button>
        </div>
      )}

      {mode === 'sketch' && sketchDim && (
        <div className="vp-measure" style={{ left: '50%', transform: 'translateX(-50%)', fontWeight: 600, color: '#1572c4' }}>{sketchDim}</div>
      )}

      <SketchToolPanel />
      <SkTextDialog />

      {/* Fusion-style always-recoverable display control while sketching.  It is
          intentionally separate from the draggable sketch bar, so collapsing or
          moving that bar never hides the B-rep display choices. */}
      {mode === 'sketch' && (
        <div className="sketch-display-dock" role="group" aria-label={tStatus('显示方式', lang)}>
          <button
            ref={skMoreRef}
            data-testid="sketch-visual-style-trigger"
            className={'tb-btn vp-display-menu' + (skMorePop ? ' tb-on' : '')}
            aria-label={tStatus('显示方式', lang)}
            title={tStatus(`显示方式：${VISUAL_STYLE_LABELS[visualStyle]}。可即时切换实体、隐藏线、线框或穿透。`, lang)}
            onClick={toggleSkMore}
          >▰ <span>{tStatus('显示', lang)}</span> ▾</button>
        </div>
      )}

      {mode === 'sketch' && (skBarMin ? (
        // GM-W6 A4：收起态 —— 缩成一粒「▤ 草图工具」pill（可 ⠿ 拖移 · 撳还原），位置同展开态共用 webcad-sketch-bar key
        <div ref={skBarDrag.ref} className="sketch-bar" style={{ gap: 6, ...skBarPos }}>
          <span className="sb-grip" onPointerDown={skBarDrag.onPointerDown} onClick={() => skBarDrag.consumeClick()} title={tStatus('拖移工具条', lang)} style={{ cursor: 'grab', touchAction: 'none', userSelect: 'none', color: '#9aa4ad' }}>⠿</span>
          <button className="sb-tool" title={tStatus('展开草图工具条', lang)} onClick={() => { if (skBarDrag.consumeClick()) return; setSkBarMin(false) }}>▤ {tStatus('草图工具', lang)}</button>
        </div>
      ) : (
        <div ref={skBarDrag.ref} className="sketch-bar" style={skBarPos}>
          {/* GM-W6 A4：左端 ⠿ 拖移手柄 + 「—」收起钮；sb-title 亦可拖。onPointerDown 只挂喺呢几个 → 撳其它钮/输入唔会误触发拖移 */}
          <span className="sb-grip" onPointerDown={skBarDrag.onPointerDown} onClick={() => skBarDrag.consumeClick()} title={tStatus('拖移工具条', lang)} style={{ cursor: 'grab', touchAction: 'none', userSelect: 'none', color: '#9aa4ad' }}>⠿</span>
          <button className="sb-tool" title={tStatus('收起草图工具条', lang)} onClick={() => setSkBarMin(true)} style={{ padding: '2px 9px', fontWeight: 700, lineHeight: 1 }}>—</button>
          <span className="sb-title" onPointerDown={skBarDrag.onPointerDown} onClick={() => skBarDrag.consumeClick()} title={tStatus('拖移工具条', lang)} style={{ cursor: 'grab', touchAction: 'none', userSelect: 'none' }}>{tStatus('草图', lang)}</span>
          <button className={'sb-tool' + (sketchTool === 'select' ? ' active' : '')} title={tStatus('选择工具：点 点/边/圆/参考几何（最多 3 个）→ 按约束按钮', lang)} onClick={() => setSketchTool('select')}>↖</button>
          {/* GM-FP1 #3：常驻「完成草图」绿掣（对标 Fusion FINISH SKETCH）— 唔使靠 ESC/右键 */}
          <button className="sb-tool sb-finish" style={{ fontWeight: 700 }} title={tStatus('完成草图（存成独立草图特征 · 退出草图环境）— 对标 Fusion 绿色 FINISH SKETCH', lang)} onClick={() => finishSketch()}>✓ {tStatus('完成草图', lang)}</button>
          {/* GM-FP1 #9：Look At 正对掣 — orbit 打斜睇后一键返正对草图平面 */}
          <button className="sb-tool" title={tStatus('正对（Look At）：一键把相机转返正对草图平面法向（用 ViewCube/orbit 打斜睇后返正）', lang)} onClick={() => skLookAt()}>⊥ {tStatus('正对', lang)}</button>
          {skRefGeo && skRefGeo.segs && skRefGeo.segs.length > 0 && (<>
            <button className="sb-tool" title={tStatus('全投影（Fusion Project 全部）：把实体喺呢个面嘅所有边/截交一次过投影成草图曲线', lang)} onClick={() => useApp.getState().projectRefToSketch()}>{tStatus('⮈全投影', lang)}</button>
            <button className={'sb-tool' + (projPickMode ? ' active' : '')} title={tStatus('逐条投影（Fusion Project 逐条拣）：开咗后㩒近一条【橙色实体投影边】→ 只投嗰条；可连㩒多条；再撳退出', lang)} onClick={() => useApp.getState().toggleProjPick()}>{tStatus('⮈逐条投影', lang)}</button>
          </>)}
          {[...sketchProfiles, ...(sketchShape ? [sketchShape] : [])].some((sh) => sh.type === 'poly' && sh.projectLink === 'all') && <button className="sb-tool" title={tStatus('断开投影连结（Fusion Break Link）：保留紫色投影曲线，但停止以后随实体更新；之后可独立修改。', lang)} onClick={() => useApp.getState().breakProjectLinks()}>{tStatus('⛓断开连结', lang)}</button>}
          <button className={'sb-tool' + (sketchTool === 'dimension' ? ' active' : '')} title={tStatus('尺寸工具（D）：点 边=长度 · 圆=Ø · 弧=R · 点→点→放置=距离 · 点→边=垂直距离', lang)} onClick={() => setSketchTool('dimension')}>{tStatus('⟷ 尺寸', lang)}</button>
          {skCons.length > 0 && (
            <span className="sb-hint" style={{ color: skConflict ? '#d6694e' : skDof === 0 ? '#1aa06b' : '#1572c4', fontWeight: 600 }} title={tStatus('约束求解状态：DOF = 剩余自由度（0 = 完全定义，绿色）。冲突时红色徽章 = 互相冲突嘅约束，点击其一移除即解；或按「↶撤约束」。', lang)}>
              {skConflict ? tStatus(skConflictIds.length ? `⚠ 约束冲突 ×${skConflictIds.length}（红徽章点击移除）` : '⚠ 约束冲突', lang) : skDof === 0 && skCons.length > 0 ? tStatus(`✓ 完全定义 · 约束 ${skCons.length}`, lang) : tStatus(`约束 ${skCons.length} · DOF ${skDof ?? '—'}`, lang)}
            </span>
          )}
          <span className="sb-hint" title={tStatus('画的时候直接打数字 → 精确尺寸（矩形：打宽 → Tab 换高 → Enter；圆：打半径 → Enter）。游标会吸附到已有的点。', lang)}>{tStatus('⌨ 打数字=尺寸', lang)}</span>
          {/* GM-W8 β2-#B4：触屏精确输入 —— 绘制中（起点已落 / 折线有点）且非选择工具，出真输入框 → 手机点一下弹系统键盘，打数字经 sketchTypeKey 管线（commit 时重放）。旁边「⏸吸附」= setGeoSnapAlt 触屏版按住 Alt。 */}
          {mode === 'sketch' && sketchTool !== 'select' && (sketchStart != null || polyPts.length > 0) && (
            <span className="sb-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {tStatus('尺寸', lang)}
              <input ref={skDimInputRef} inputMode="decimal" enterKeyHint="done" placeholder="mm"
                title={tStatus('触屏精确尺寸：打数字 → 完成/离开确定（经打字尺寸管线；等同键盘直接打）', lang)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitSkDimInput() } }}
                onBlur={commitSkDimInput}
                style={{ width: 60 }} />
              <button className={'sb-tool' + (snapPaused ? ' active' : '')} title={tStatus('⏸吸附：临时停几何捕捉（触屏版「按住 Alt」— 精准落点）。再撳恢复。', lang)}
                style={snapPaused ? { background: '#1572c4', color: '#fff' } : undefined}
                onClick={() => { const n = !snapPaused; setSnapPaused(n); setGeoSnapAlt(n) }}>{tStatus('⏸吸附', lang)}</button>
            </span>
          )}
          {sketchPreview && <span className="sb-hint" title={tStatus('当前光标在草图平面的 (X, Y) 坐标 mm（已吸附）', lang)} style={{ fontVariantNumeric: 'tabular-nums', color: '#5a6b78' }}>⌖ {sketchPreview[0].toFixed(1)}, {sketchPreview[1].toFixed(1)}</span>}
          <label className="sb-hint" title={tStatus('草图平面：上=水平面 XY；前=竖直面 XZ（拉伸沿 Y 出料）；右=竖直面 YZ（拉伸沿 X 出料）。做 L 形件/加强筋时选竖直面。', lang)}>{tStatus('面', lang)}
            <select value={sketchPlane} onChange={(e) => setSketchOrient(e.target.value as 'XY' | 'XZ' | 'YZ')}>
              <option value="XY">{tStatus('上 XY', lang)}</option>
              <option value="XZ">{tStatus('前 XZ', lang)}</option>
              <option value="YZ">{tStatus('右 YZ', lang)}</option>
            </select>
          </label>
          {/* Fusion SKETCH PALETTE 显示开关：一键 show/hide 草图元素（清爽睇 / 还原 Fusion 右侧面板）。 */}
          <span className="sb-hint" style={{ borderLeft: '1px solid #d7dde2', paddingLeft: 8, display: 'inline-flex', gap: 4, alignItems: 'center' }} title={tStatus('草图显示开关（对标 Fusion Sketch Palette）：填充 / 尺寸 / 约束 / 点 / 构造 / 网格 独立 show/hide，睇清几何', lang)}>👁
            {/* GM-FP4 #4/#5：Fusion palette 独立 Dimensions(尺寸) / Constraints(约束) / Points(点) 开关 */}
            {([['fill', '填充'], ['annot', '尺寸'], ['cons', '约束'], ['points', '点'], ['constr', '构造'], ['grid', '网格']] as const).map(([k, lbl]) => (
              <button key={k} className={'sb-tool' + (skView[k] ? ' active' : '')} style={{ fontSize: 11, padding: '2px 6px', opacity: skView[k] ? 1 : 0.5 }} title={tStatus((skView[k] ? '隐藏' : '显示') + lbl, lang)} onClick={() => setSkView({ [k]: !skView[k] })}>{tStatus(lbl, lang)}</button>
            ))}
          </span>
          {/* T791：每个工具嘅参数（偏移距离/圆角R/边数/槽宽/切R/镜像/⌒弧长…）已搬入浮动「工具选项」面板（只显当前工具所需，可拖可缩放），呢度唔再塞满成行。 */}
          {/* GM-W2 2.3：📷图 参考图（贴图/图宽/透明/中心/标定/✕图）已收纳入下方「更多▾」弹层 */}
          {(sketchTool === 'polyline' || sketchTool === 'spline' || sketchTool === 'bspline') && polyPts.length >= 2 && (
            <button className="sb-tool sb-finish" title={tStatus('完成做开放折线/直线（唔回起点，唔参与拉伸 — 可做参考/扫掠路径/镜像轴）', lang)} onClick={() => useApp.getState().finishOpenPolyline()}>{tStatus('✓ 完成线', lang)}</button>
          )}
          {(sketchTool === 'polyline' || sketchTool === 'spline' || sketchTool === 'bspline') && polyPts.length >= 3 && (
            <button className="sb-tool sb-finish" title={tStatus('闭合轮廓（回起点成闭合面，可拉伸）', lang)} onClick={() => closePolyline()}>{tStatus('✓ 闭合', lang)}</button>
          )}
          <span className="sb-hint">{sketchTool === 'rectangle' ? tStatus('点两个角点', lang) : sketchTool === 'circle' ? tStatus('点圆心再点半径', lang) : sketchTool === 'trim' ? tStatus('✂ 点要剪走嗰段（剪到相交点）', lang) : sketchTool === 'extend' ? tStatus('⟶ 点开放路径嘅端段', lang) : sketchTool === 'offset' ? tStatus('⇉ 点一个轮廓锁定 → 拖鼠标调距离(外+/内−,1mm步进) → 点确定 · 打数字 · ESC', lang) : sketchTool === 'cfillet' ? tStatus('⌒ 点近一个直角顶点锁定 → 拖鼠标调半径 → 点确定（或底栏「全部角」）', lang) : sketchTool === 'cchamfer' ? tStatus('◣ 点近一个直角顶点锁定 → 拖鼠标调回缩 → 点确定（或底栏「全部角」）', lang) : sketchTool === 'mirror' ? tStatus('⇋ ①点轮廓拣（绿）→「✓拣轴线」→ ②点一条直线边做镜像轴', lang) : sketchTool === 'array' ? tStatus('▦ 底栏面板设 矩形/环形 参数（绿虚线预览）→ 应用阵列', lang) : sketchTool === 'cline' ? tStatus('┊ 点位置落构造参考线（工具面板切 竖直/水平）— 做对中参考 / 镜像轴', lang) : (sketchTool === 'polyline' || sketchTool === 'spline' || sketchTool === 'bspline') ? tStatus('连续点击；画好按「✓ 完成线」（开放直线）或回起点/「✓ 闭合」（闭合面）', lang) : tStatus('连续点击，回到起点或按「闭合」', lang)}</span>
          <label className="sb-hint" title={tStatus('草图平面沿其法向的偏移（XY=高度 Z；XZ=沿 Y；YZ=沿 X），mm', lang)}>{sketchPlane === 'XY' ? tStatus('基准Z', lang) : sketchPlane === 'XZ' ? tStatus('偏移Y', lang) : tStatus('偏移X', lang)} <input type="number" value={Math.round(sketchBaseZ)} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setSketchBaseZ(Number(e.target.value) || 0)} style={{ width: 50 }} /></label>
          {/* GM-W2 2.3：网格捕捉步长 已收纳入「更多▾」弹层；几何捕捉 常用 → 留喺底栏 */}
          <button className={'sb-tool' + (geoSnap ? ' active' : '')} title={tStatus('几何捕捉：吸到孔心/边/点/线（开）。关咗可自由精准落点；画图时按住 Alt 可临时停', lang)} onClick={() => setGeoSnap(!geoSnap)}>{geoSnap ? tStatus('🧲 几何捕捉', lang) : tStatus('⊘ 捕捉关', lang)}</button>
          {/* GM-W6 A1：草图透视 —— 实体半透明，喺实体中间/背面画草图睇得到线（用户报「实心遮住个圆」）。默认开 */}
          <button className={'sb-tool' + (skSeeThru ? ' active' : '')} title={tStatus('透视模型：草图时实体自动半透明，画喺实体中间/背面嘅线都睇得见。关咗恢复实色', lang)} onClick={() => useApp.getState().toggleSkSeeThru()}>{skSeeThru ? '👓' : '🕶'}{tStatus('透视', lang)}</button>
          {/* GM-W6 B5：删除所选 —— 之前净得 Del 键（界面零提示，非码农唔知点擦线） */}
          {skSelN > 0 && <button className="sb-tool" style={{ color: '#c0563f' }} title={tStatus('删除选中嘅草图线/圆/点（键盘 Del 同款）', lang)} onClick={() => useApp.getState().skDeleteSel()}>🗑{tStatus('删除', lang)}({skSelN})</button>}
          {/* GM-W6 B6：折线相切弧 submode 出返个掣 —— 之前净得键盘 A 一个隐藏入口 */}
          {sketchTool === 'polyline' && <button className={'sb-tool' + (polyArcMode ? ' active' : '')} title={tStatus('折线段类型：直线 ⇄ 相切弧（沿上一段方向相切引出嘅圆弧）。要画咗至少 2 点先切到相切弧。快捷键 A', lang)} onClick={() => useApp.getState().togglePolyArc()}>{polyArcMode ? '⌒' : '─'}{tStatus(polyArcMode ? '相切弧' : '直线段', lang)}(A)</button>}
          <button className="sb-tool" title={tStatus('诊断：复制当前草图状态（工具/选择/实体参考/最后一次撳中乜）→ 贴返畀 AI 帮你睇问题', lang)} onClick={() => useApp.getState().copySketchDiag()}>🩺{tStatus('诊断', lang)}</button>
          {planes.filter((pl) => pl.base === sketchPlane).map((pl, i) => <button key={'spl' + i} className={'sb-tool' + (Math.round(sketchBaseZ) === pl.offset ? ' active' : '')} title={tStatus(`跳到参考面 ${pl.base}@${pl.offset}`, lang)} onClick={() => setSketchBaseZ(pl.offset)}>{tStatus('面@', lang)}{pl.offset}</button>)}
          {bodyMesh && (
            <>
              <span className="sb-spacer" />
              {sketchPlane === 'XY' && <button className={'sb-tool' + (sketchBaseZ > 0 ? ' active' : '')} title={tStatus('在实体顶面画草图', lang)} onClick={() => setSketchPlane('top')}>{tStatus('顶面', lang)}</button>}
              {sketchPlane === 'XY' && <button className={'sb-tool' + (sketchBaseZ === 0 ? ' active' : '')} title={tStatus('在地面画草图', lang)} onClick={() => setSketchPlane('ground')}>{tStatus('地面', lang)}</button>}
              <span className="sb-spacer" />
              <button className={'sb-tool' + (sketchOp === 'new' ? ' active' : '')} title={tStatus('新建 / 拼合实体', lang)} onClick={() => setSketchOp('new')}>{tStatus('＋ 新建', lang)}</button>
              <button className={'sb-tool' + (sketchOp === 'cut' ? ' active' : '')} title={tStatus('从实体上切除', lang)} onClick={() => setSketchOp('cut')}>{tStatus('－ 切割', lang)}</button>
              <button className={'sb-tool' + (sketchOp === 'intersect' ? ' active' : '')} title={tStatus('相交：只保留 已有实体 与 拉伸区域 的公共部分（Fusion Combine 相交）', lang)} onClick={() => setSketchOp('intersect')}>{tStatus('∩ 相交', lang)}</button>
              <button className={'sb-tool' + (sketchOp === 'newbody' ? ' active' : '')} title={tStatus('新建独立实体：拉伸体唔并入现有实体，灰显泊车（浏览器树可见；之后可「合并」实体布尔）', lang)} onClick={() => setSketchOp('newbody')}>{tStatus('⬡ 新实体', lang)}</button>
              {sketchFromFace && sketchOp === 'cut' && <label className="sb-hint" title={tStatus('面切割：贯通=切穿整个零件；按深度=用「高度」值挖盲槽/凹台（从所选面往里）', lang)}><input type="checkbox" checked={!faceCutThrough} onChange={(e) => setFaceCutThrough(!e.target.checked)} /> {tStatus('按深度挖', lang)}</label>}
            </>
          )}
          {!inSkToolMode && (<>
          <span className="sb-spacer" />
          <label>{tStatus('高度', lang)} <input type="number" min={1} value={extrudeHeight} onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setExtrudeHeight(Number(e.target.value) || 1)} /> mm</label>
          <label className="sb-hint" title={tStatus('对称：以草图面为中心，向两侧各拉伸一半', lang)}><input type="checkbox" checked={sketchSymmetric} onChange={(e) => setSketchSymmetric(e.target.checked)} /> {tStatus('对称', lang)}</label>
          <label className="sb-hint" title={tStatus('扭转角：拉伸时绕高度方向旋转（度）', lang)}>{tStatus('扭转', lang)} <input type="number" value={sketchTwist} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setSketchTwist(Number(e.target.value))} style={{ width: 46 }} /> °</label>
          {sketchShape && (
            <>
              {(() => {
                const sh = sketchShape; let area = 0, perim = 0
                if (sh.type === 'circle') { area = Math.PI * sh.r * sh.r; perim = 2 * Math.PI * sh.r }
                else if (sh.type === 'rect') { const w = Math.abs(sh.b[0] - sh.a[0]), h = Math.abs(sh.b[1] - sh.a[1]); area = w * h; perim = 2 * (w + h) }
                else if (sh.verts && sh.bulges) {
                  // mixed line/arc path: analytic (circular-segment corrected) — matches the B-rep exactly
                  area = pathArea(sh.verts, sh.bulges)
                  const vs = sh.verts
                  for (let i = 0; i < vs.length; i++) { const q = vs[(i + 1) % vs.length]; const b = sh.bulges[i] || 0; perim += Math.abs(b) > 1e-12 ? bulgeRadius(vs[i], q, b) * 4 * Math.atan(Math.abs(b)) : Math.hypot(q[0] - vs[i][0], q[1] - vs[i][1]) }
                }
                else { const p = sh.pts; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; area += p[i][0] * q[1] - q[0] * p[i][1]; perim += Math.hypot(q[0] - p[i][0], q[1] - p[i][1]) } area = Math.abs(area) / 2 }
                return <span style={{ fontSize: 12, color: '#5a6b78', marginLeft: 4 }} title={tStatus('当前闭合轮廓的面积 + 周长（mm² / mm）— 拉伸前参考', lang)}>{tStatus('▱ 面积', lang)} {fmtArea(area, unit)} · {tStatus('周长', lang)} {fmtLen(perim, unit)}</span>
              })()}
            </>
          )}
          {/* GM-W2 2.3：CAM 导出（导出DXF/⚡激光/🪚CNC/🔄车削 — CAM 属冻结模块）已收纳入「更多▾」弹层，唔再长占底栏 */}
          {sketchShape && <button className="sb-tool" title={tStatus('把当前轮廓加为放样截面；可在 XY/XZ/YZ 或任意参考平面继续画下一个截面', lang)} onClick={() => addLoftSection()}>{tStatus('＋放样截面', lang)}</button>}
          {loftSections.length >= 2 && <button className="sb-tool" title={tStatus('放样导轨（T772）：画一条折线（每个截面一个点，点数=截面数）→ 记低 → 放样时截面拉到掂导轨', lang)} onClick={() => useApp.getState().bankLoftRail()}>{tStatus('⤳放样导轨', lang)}</button>}
          {loftSections.length > 0 && <span className="sb-hint">{tStatus('放样截面', lang)} {loftSections.length}</span>}
          {loftSections.length >= 2 && <button className="sb-tool sb-finish" title={tStatus('在各截面之间放样：弹面板设 操作（加料/切割）+ 截面预览', lang)} onClick={() => openLoftDlg()}>{tStatus('放样', lang)}{loftSections.length}{tStatus('截面…', lang)}</button>}
          {sketchPlane === 'XY' && ((sketchShape && sketchShape.type === 'poly') || polyPts.length >= 2) && <button className="sb-tool" title={tStatus('把当前折线/样条作为路径扫掠：弹面板设 管径 + 操作（加料/切割）', lang)} onClick={() => openSweepDlg()}>{tStatus('沿路径扫掠…', lang)}</button>}
          {(sketchShape || sketchProfiles.length === 1) && (
            <button className="sb-tool" title={tStatus('阵列：底栏面板设 矩形/环形 参数，实时预览 → 应用（例如一个孔阵成一片孔）', lang)} onClick={() => useApp.getState().runCommand('sk_array', '阵列')}>{tStatus('▦ 阵列', lang)}</button>
          )}
          {(sketchShape || sketchProfiles.length > 0) && (
            <button data-cmd="skextrude" className="sb-finish" style={{ background: '#1572c4', fontWeight: 700 }} title={tStatus('打开拉伸设置面板（操作 / 范围 / 距离 / 拔模角）', lang)} onClick={() => openExtrudeDlg()}>{/* GM-W6 E：教学指针锚点 */}{tStatus('⬆ 拉伸…', lang)}</button>
          )}
          </>)}
          {/* GM-W2 2.3：更多▾ — 收纳 CAM 导出 / 参考图 / 网格捕捉步长 等罕用控件（对齐 Fusion 精简草图上下文）。用 fixed 定位避开底栏 overflow-x 剪裁，向下弹出 */}
          <button className="sb-tool" title={tStatus('更多草图工具：参考图描摹 / 网格捕捉步长 / CAM 导出（DXF·激光·CNC·车削）', lang)} onClick={toggleSkMore}>{tStatus('更多', lang)}▾</button>
          {skMorePop && (
            <div className="panel-menu" style={{ position: 'fixed', left: skMorePos.x, top: skMorePos.y, zIndex: 300, minWidth: 250, maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
              <div className="panel-menu-head">{tStatus('B-rep 显示方式', lang)}</div>
              {VISUAL_STYLES.map((vs, i) => (
                <button
                  type="button"
                  key={vs}
                  data-testid={`sketch-visual-style-${vs}`}
                  className="panel-menu-item"
                  title={`Ctrl+${i + 4}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setVisualStyle(vs); setSkMorePop(false) }}
                >{visualStyle === vs ? '✓ ' : '　'}{tStatus(VISUAL_STYLE_LABELS[vs], lang)}<span style={{ marginLeft: 'auto', opacity: 0.45, fontSize: 10 }}>Ctrl+{i + 4}</span></button>
              ))}
              <div className="panel-menu-divider" />
              {/* 网格捕捉步长（罕用，从底栏收纳） */}
              <div className="panel-menu-item" style={{ cursor: 'default' }} title={tStatus('捕捉网格（点会吸附到此间距）', lang)}>
                <label className="sb-hint" style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'space-between' }}>{tStatus('网格捕捉步长', lang)} <select value={snapSize} onChange={(e) => setSnapSize(Number(e.target.value))}><option value={0}>{tStatus('关', lang)}</option><option value={1}>1</option><option value={2}>2</option><option value={5}>5</option><option value={10}>10</option></select></label>
              </div>
              {/* GM-W8 β2-#A2：捕捉类型逐类开关 —— 6 个 checkbox（读 snapTypes，撳 setSnapType(k,!v)）；行唔自动收弹层（同网格捕捉步长 idiom） */}
              <div className="panel-menu-item" style={{ cursor: 'default', fontSize: 11, opacity: 0.55, padding: '2px 10px' }}>{tStatus('捕捉类型', lang)}</div>
              {([['pt', '端点/点'], ['mid', '中点'], ['center', '圆心'], ['quad', '象限点'], ['x', '交点'], ['tan', '切点']] as const).map(([k, lbl]) => (
                <div key={k} className="panel-menu-item" style={{ cursor: 'default' }} title={tStatus('开关此类几何捕捉（关咗游标唔再吸此类点）', lang)}>
                  <label className="sb-hint" style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}><input type="checkbox" checked={snapTypes[k]} onChange={() => useApp.getState().setSnapType(k, !snapTypes[k])} /> {tStatus(lbl, lang)}</label>
                </div>
              ))}
              {/* GM-W6 A3：显示模式切换 —— 草图模式唔渲染 vp-navbar（🖥▾ 冇得撳），喺呢度补返 着色/线框/显示边线，镜 navPop==='display' 嗰组一模一样嘅调用 */}
              <div className="panel-menu-divider" />
              <div className="panel-menu-item" style={{ cursor: 'default', fontSize: 11, opacity: 0.55, padding: '2px 10px' }}>{tStatus('显示', lang)}</div>
              <div className="panel-menu-item" onClick={() => { if (wireframe) toggleWireframe(); setSkMorePop(false) }}>{!wireframe ? '✓ ' : ''}{tStatus('着色', lang)}</div>
              <div className="panel-menu-item" onClick={() => { if (!wireframe) toggleWireframe(); setSkMorePop(false) }}>{wireframe ? '✓ ' : ''}{tStatus('线框', lang)}</div>
              <div className="panel-menu-item" onClick={() => { setEdgeDisplay(edgeDisplay === 'off' ? 'on' : 'off'); setSkMorePop(false) }}>{edgeDisplay !== 'off' ? '✓ ' : ''}{tStatus('显示边线', lang)}</div>
              {/* 参考图描摹（📷图 + 图宽/透明/中心/标定/✕图）— 只喺非拾取工具模式显示，同原底栏一致 */}
              {!inSkToolMode && (<>
                <div className="panel-menu-divider" />
                <div className="panel-menu-item" style={{ justifyContent: 'flex-start', gap: 8 }} onClick={() => setSkMorePop(false)}>
                  <button className="sb-tool" title={tStatus('贴参考图（T764 Canvas 描摹）：上传相片贴上草图面 → 照住描轮廓建模（逆向实物）', lang)} onClick={() => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => useApp.getState().setCanvasImg(String(r.result)); r.readAsDataURL(f) }; inp.click() }}>{tStatus('📷图', lang)}</button>
                  {canvasImg && <button className="sb-tool" title={tStatus('再加一张参考图（多张 Canvas）', lang)} onClick={() => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => useApp.getState().addCanvas(String(r.result)); r.readAsDataURL(f) }; inp.click() }}>＋图</button>}
                  {canvasCount > 1 && (<span className="sb-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><button className="sb-tool" onClick={() => useApp.getState().cycleCanvas(-1)}>◀</button>{(useApp.getState().canvases.findIndex((c) => c.id === useApp.getState().activeCanvas) + 1)}/{canvasCount}<button className="sb-tool" onClick={() => useApp.getState().cycleCanvas(1)}>▶</button></span>)}
                </div>
                {canvasImg && (<>
                  <div className="panel-menu-item" style={{ cursor: 'default', justifyContent: 'space-between' }}>
                    <label className="sb-hint" title={tStatus('参考图宽度 mm（高按图比例）', lang)}>{tStatus('图宽', lang)} <input type="number" min={1} value={Math.round(canvasImg.w)} onFocus={(e) => e.currentTarget.select()} onChange={(e) => updateCanvasImg({ w: Math.max(1, Number(e.target.value) || 100) })} style={{ width: 50 }} /></label>
                    <label className="sb-hint" title={tStatus('透明度', lang)}>{tStatus('透明', lang)} <input type="range" min={0.1} max={1} step={0.05} value={canvasImg.opacity} onChange={(e) => updateCanvasImg({ opacity: Number(e.target.value) })} style={{ width: 56, verticalAlign: 'middle' }} /></label>
                  </div>
                  <div className="panel-menu-item" style={{ cursor: 'default' }}>
                    <label className="sb-hint" title={tStatus('图中心（草图坐标 mm）', lang)}>@ <input type="number" step={5} value={Math.round(canvasImg.cx)} onChange={(e) => updateCanvasImg({ cx: Number(e.target.value) || 0 })} style={{ width: 42 }} /><input type="number" step={5} value={Math.round(canvasImg.cy)} onChange={(e) => updateCanvasImg({ cy: Number(e.target.value) || 0 })} style={{ width: 42 }} /></label>
                  </div>
                  {activeCv && (<>
                    <div className="panel-menu-item" style={{ cursor: 'default', gap: 6 }}>
                      <label className="sb-hint" title={tStatus('非等比缩放 X / Y', lang)}>{tStatus('缩放', lang)} X<input type="number" step={0.1} value={activeCv.scaleX ?? 1} onChange={(e) => useApp.getState().updateCanvasFields(activeCv.id, { scaleX: Number(e.target.value) || 1 })} style={{ width: 42 }} /> Y<input type="number" step={0.1} value={activeCv.scaleY ?? 1} onChange={(e) => useApp.getState().updateCanvasFields(activeCv.id, { scaleY: Number(e.target.value) || 1 })} style={{ width: 42 }} /></label>
                      <label className="sb-hint" title={tStatus('Z 角（绕面法向旋转，度）', lang)}>Z° <input type="number" step={5} value={Math.round((activeCv.zAngle ?? 0) * 180 / Math.PI)} onChange={(e) => useApp.getState().updateCanvasFields(activeCv.id, { zAngle: (Number(e.target.value) || 0) * Math.PI / 180 })} style={{ width: 46 }} /></label>
                    </div>
                    <div className="panel-menu-item" style={{ cursor: 'default', gap: 6, flexWrap: 'wrap' }}>
                      <button className="sb-tool" style={{ background: activeCv.flipH ? '#1572c4' : undefined, color: activeCv.flipH ? '#fff' : undefined }} title={tStatus('水平翻转', lang)} onClick={() => useApp.getState().updateCanvasFields(activeCv.id, { flipH: !activeCv.flipH })}>⇄翻</button>
                      <button className="sb-tool" style={{ background: activeCv.flipV ? '#1572c4' : undefined, color: activeCv.flipV ? '#fff' : undefined }} title={tStatus('垂直翻转', lang)} onClick={() => useApp.getState().updateCanvasFields(activeCv.id, { flipV: !activeCv.flipV })}>⇅翻</button>
                      <label className="sb-hint" title={tStatus('穿透显示（关深度测试，永远画喺几何前）', lang)}><input type="checkbox" checked={!!activeCv.displayThrough} onChange={(e) => useApp.getState().updateCanvasFields(activeCv.id, { displayThrough: e.target.checked })} />穿透</label>
                      <label className="sb-hint" title={tStatus('可选取（raycast）', lang)}><input type="checkbox" checked={!!activeCv.selectable} onChange={(e) => useApp.getState().updateCanvasFields(activeCv.id, { selectable: e.target.checked })} />可选</label>
                      <label className="sb-hint" title={tStatus('建模模式也显示（附着底图；关=仅草图内可见）', lang)}><input type="checkbox" checked={activeCv.renderable === true} onChange={(e) => useApp.getState().updateCanvasFields(activeCv.id, { renderable: e.target.checked })} />建模显示</label>
                      <label className="sb-hint" title={tStatus('入存档（持久化 dataURL；默认会话级）', lang)}><input type="checkbox" checked={!!activeCv.inArchive} onChange={(e) => useApp.getState().updateCanvasFields(activeCv.id, { inArchive: e.target.checked })} />入档</label>
                    </div>
                  </>)}
                  <div className="panel-menu-item" style={{ justifyContent: 'flex-start', gap: 8 }} onClick={() => setSkMorePop(false)}>
                    <button className="sb-tool" title={tStatus('两点标定比例：喺图上点两个已知距离嘅点 → 输入实际 mm → 图自动缩放到 1:1', lang)} onClick={() => useApp.getState().startCanvasCal()}>{tStatus('📐标定', lang)}</button>
                    <button className="sb-tool" title={tStatus('移除当前参考图', lang)} onClick={() => useApp.getState().setCanvasImg(null)}>{tStatus('✕图', lang)}</button>
                  </div>
                </>)}
              </>)}
              {/* CAM 导出（导出DXF/⚡激光/🪚CNC/🔄车削 — CAM 属冻结模块，罕用）。条件同原底栏：非拾取模式 + 有闭合轮廓 */}
              {!inSkToolMode && (sketchShape || sketchProfiles.length > 0) && (<>
                <div className="panel-menu-divider" />
                <div className="panel-menu-item" onClick={() => setSkMorePop(false)}>
                  <button className="sb-tool" title={tStatus('把当前草图轮廓导出为 DXF（2D 线框，可激光切割 / 导入 AutoCAD 等 CAD）', lang)} onClick={() => useApp.getState().exportSketchDxf()}>{tStatus('导出DXF', lang)}</button>
                </div>
                <div className="panel-menu-item" onClick={() => setSkMorePop(false)}>
                  <button className="sb-tool" title={tStatus('导出激光切割 G-code（GRBL）：设置 进给/功率/道数/kerf 或拣材料预设（T783）。先切孔后切外框 + 真圆弧 G2/G3。', lang)} onClick={() => useApp.getState().openLaserDlg()}>{tStatus('⚡激光', lang)}</button>
                </div>
                <div className="panel-menu-item" onClick={() => setSkMorePop(false)}>
                  <button className="sb-tool" title={tStatus('🪚 CNC 铣削刀路（T789 / GRBL 3018·Shapeoko 级）：轮廓切穿（刀补+分层+留料桥）/ 挖槽（同心环）/ 啄钻。出 G-code 前可预览刀路。', lang)} onClick={() => useApp.getState().openMillDlg()}>{tStatus('🪚CNC', lang)}</button>
                </div>
                <div className="panel-menu-item" onClick={() => setSkMorePop(false)}>
                  <button className="sb-tool" title={tStatus('🔄 CNC 车削刀路（T799 / GRBL 2 轴车床）：折线画回转件【半边轮廓】（X 向右=轴向、Y 向上=半径）→ 外圆粗+精车 / 端面 / 切槽。X 全程出直径。', lang)} onClick={() => useApp.getState().openLatheDlg()}>{tStatus('🔄车削', lang)}</button>
                </div>
              </>)}
            </div>
          )}
          <button className="sb-tool" title={tStatus('撤销草图一步 (Ctrl+Z)', lang)} disabled={sketchUndoN === 0} onClick={() => void useApp.getState().undo()}>↶</button>
          <button className="sb-tool" title={tStatus('重做 (Ctrl+Y)', lang)} disabled={sketchRedoN === 0} onClick={() => void useApp.getState().redo()}>↷</button>
        </div>
      ))}

      {extrudeDlgOpen && (
        <CommandDialog
          icon="extrude"
          title={tStatus('拉伸', lang)}
          width={240}
          okTip={extrudeRegionTotal > 0 && extrudeRegionSelCount === 0 ? tStatus('先点画布拣要拉伸嘅 profile 区域', lang) : tStatus('生成（Enter）', lang)}
          okDisabled={extrudeRegionTotal > 0 && extrudeRegionSelCount === 0}
          onOk={() => void extrudeSketch()}
          onCancel={() => cancelExtrudeDlg()}
          summary={<>{sketchOp === 'cut' ? tStatus('从实体切除', lang) : sketchOp === 'intersect' ? tStatus('保留公共部分', lang) : tStatus('生成/拼合实体', lang)} · {extrudeExtent === 'through' ? tStatus('贯通整个零件', lang) : extrudeExtent === 'next' ? tStatus('到下一面', lang) : extrudeExtent === 'symmetric' ? tStatus(`对称 ${extrudeHeight}mm`, lang) : `${extrudeHeight}mm`}{extrudeDraft ? tStatus(` · 拔模 ${extrudeDraft}°`, lang) : ''}</>}
        >
          <SelectionChip label={tStatus('轮廓', lang)} count={extrudeRegionTotal > 0 ? extrudeRegionSelCount : sketchProfiles.length + (sketchShape ? 1 : 0)} hint={extrudeRegionTotal > 0 ? tStatus('点画布区域拣 profile', lang) : tStatus('先在草图画一个闭合轮廓', lang)} />
          {extrudeRegionTotal > 0 && <div style={{ fontSize: 11, color: extrudeRegionSelCount ? '#16a36b' : '#c9362a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ flex: 1 }}>▦ {tStatus('区域', lang)} {extrudeRegionSelCount}/{extrudeRegionTotal}{tStatus('（点画布拣要拉伸嘅区域：蓝=已选）', lang)}</span>
            <button className="sb-tool" style={{ fontSize: 10, padding: '1px 5px' }} title={tStatus('全选区域（阵列孔等多区域一键全拣）', lang)}
              onClick={() => { const rf0 = useApp.getState().extrudeRegionFaces; if (rf0) useApp.setState({ extrudeRegionSel: rf0.map(() => extrudeRegionSelCount < extrudeRegionTotal) }) }}>
              {extrudeRegionSelCount < extrudeRegionTotal ? tStatus('全选区域', lang) : tStatus('清空区域', lang)}</button>
          </div>}
          <div style={{ color: '#6b7680' }}>{tStatus('范围', lang)}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={'sb-tool' + (extrudeExtent === 'distance' ? ' active' : '')} style={{ flex: 1 }} title={tStatus('按指定距离拉伸', lang)} onClick={() => setExtrudeExtent('distance')}>{tStatus('距离', lang)}</button>
            <button className={'sb-tool' + (extrudeExtent === 'symmetric' ? ' active' : '')} style={{ flex: 1 }} title={tStatus('以草图面为中心向两侧各拉一半', lang)} onClick={() => setExtrudeExtent('symmetric')}>{tStatus('对称', lang)}</button>
            <button className={'sb-tool' + (extrudeExtent === 'twosides' ? ' active' : '')} style={{ flex: 1 }} title={tStatus('两侧（Fusion Two Sides）：草图面两边各自距离（侧1向法向 / 侧2反向），非对称', lang)} onClick={() => setExtrudeExtent('twosides')}>{tStatus('两侧', lang)}</button>
            <button className={'sb-tool' + (extrudeExtent === 'through' ? ' active' : '')} style={{ flex: 1 }} disabled={sketchOp !== 'cut'} title={sketchOp === 'cut' ? tStatus('贯通：切穿整个零件', lang) : tStatus('贯通只用于切割', lang)} onClick={() => setExtrudeExtent('through')}>{tStatus('贯通', lang)}</button>
            <button className={'sb-tool' + (extrudeExtent === 'toface' ? ' active' : '')} style={{ flex: 1 }} title={tStatus('到面（T775 Fusion To-Object）：点目标平面，拉伸距离自动计（切除会过冲 0.5mm 防残膜）', lang)} onClick={() => setExtrudeExtent('toface')}>{tStatus('到面', lang)}</button>
            <button className={'sb-tool' + (extrudeExtent === 'next' ? ' active' : '')} style={{ flex: 1 }} disabled={!bodyMesh} title={bodyMesh ? tStatus('到下一面（Fusion To Next）：沿挤出方向停喺前方遇到嘅第一块实体面（方向用 ⇅ 反向；前方冇面会诚实报错）', lang) : tStatus('到下一面需要已有实体', lang)} onClick={() => setExtrudeExtent('next')}>{tStatus('到下一面', lang)}</button>
          </div>
          {extrudeExtent === 'toface' && (
            <div style={{ fontSize: 11, color: useApp.getState().extrudeToFaceOff != null ? '#16a36b' : '#c77d00' }}>
              {useApp.getState().extrudeToFaceOff != null ? <>{tStatus('→ 目标面 @', lang)} {useApp.getState().extrudeToFaceOff}mm <button className="sb-tool" onClick={() => useApp.setState({ extrudeToFaceOff: null, extrudeToFacePt: null, toFacePick: true })}>{tStatus('重拣', lang)}</button></> : tStatus('点实体上嘅目标平面（要同草图面平行）', lang)}
            </div>
          )}
          {extrudeExtent === 'toface' && useApp.getState().extrudeToFaceOff != null && (
            <label title={tStatus('偏移（Fusion To Object Offset）：喺目标面位置上再加/减一段距离（正=过面、负=唔到面）。关联：目标面移动，拉伸会自动跟（改上游尺寸后重建自动重解析）', lang)}>
              <span style={{ color: '#6b7680' }}>{tStatus('偏移', lang)}</span>
              <span><input type="number" step={1} value={extrudeToFaceOffset} onChange={(e) => useApp.getState().setExtrudeToFaceOffset(Number(e.target.value))} style={{ width: 60 }} /> mm</span>
            </label>
          )}
          {extrudeExtent === 'next' && (
            <div style={{ fontSize: 11, color: '#c77d00' }}>{tStatus('→ 距离自动计（停喺前方第一块面）· 方向用下面 ⇅ 反向', lang)}</div>
          )}
          {extrudeExtent !== 'through' && extrudeExtent !== 'toface' && extrudeExtent !== 'next' && (
            <label>
              <span style={{ color: '#6b7680' }}>{extrudeExtent === 'symmetric' ? tStatus('总距离', lang) : extrudeExtent === 'twosides' ? tStatus('侧1距离', lang) : tStatus('距离', lang)}</span>
              <span><LenInput mm={extrudeHeight} onMm={(v) => setExtrudeHeight(v)} unit={unit} w={66} title={tStatus('距离（inch 模式可打分数，如 1/2）', lang)} /> {unit === 'inch' ? 'in' : unit}</span>
            </label>
          )}
          {extrudeExtent === 'twosides' && (
            <label title={tStatus('两侧：侧2距离（草图面另一边，反法向）', lang)}>
              <span style={{ color: '#6b7680' }}>{tStatus('侧2距离', lang)}</span>
              <span><LenInput mm={extrudeSide2} onMm={(v) => useApp.getState().setExtrudeSide2(v)} unit={unit} w={66} title={tStatus('侧2距离（反法向）', lang)} /> {unit === 'inch' ? 'in' : unit}</span>
            </label>
          )}
          {/* GM-3DV1 S12：Two Sides 侧2独立拔模（Fusion Side 2 Taper）— 与下面侧1拔模各自锥化，仅 XY 草图 */}
          {extrudeExtent === 'twosides' && (
            <label title={tStatus('侧2拔模角°：草图面另一侧独立锥度（正=越拉越窄）。设了任一侧拔模即两侧分开挤出。仅水平(XY/顶面)草图。', lang)}>
              <span style={{ color: '#6b7680' }}>{tStatus('侧2拔模', lang)}</span>
              <span><input type="number" step={1} value={extrudeDraft2} onChange={(e) => setExtrudeDraft2(Number(e.target.value) || 0)} style={{ width: 66 }} /> °</span>
            </label>
          )}
          {/* GM-3DV1 S12：Symmetric 量度 whole/half（Fusion Measurement）— whole=距离即总长（±半）/ half=距离即每侧（总=2×） */}
          {extrudeExtent === 'symmetric' && (
            <div style={{ display: 'flex', gap: 4 }} title={tStatus('量度（Fusion Symmetric Measurement）：全长=上面距离即总跨度（两侧各半）/ 半长=上面距离即每侧长度（总跨度=2×）', lang)}>
              <button className={'sb-tool' + (symMeasure === 'whole' ? ' active' : '')} style={{ flex: 1 }} onClick={() => setSymMeasure('whole')}>{tStatus('全长', lang)}</button>
              <button className={'sb-tool' + (symMeasure === 'half' ? ' active' : '')} style={{ flex: 1 }} onClick={() => setSymMeasure('half')}>{tStatus('半长', lang)}</button>
            </div>
          )}
          {(extrudeExtent === 'distance' || extrudeExtent === 'next') && (
            <button className={'sb-tool' + (extrudeFlip ? ' active' : '')} style={{ width: '100%' }} title={tStatus('把拉伸/切割方向反转（同喺「距离」打负数效果一样）', lang)} onClick={() => toggleExtrudeFlip()}>{tStatus('⇅ 反向方向', lang)}{extrudeFlip ? tStatus('（已反）', lang) : ''}</button>
          )}
          {(extrudeExtent === 'distance' || extrudeExtent === 'symmetric') && (
            <label title={tStatus('起点偏移（Fusion Start:Offset）：拉伸起点沿草图面法向偏移一段距离（+=法向正方向 / −=反方向），草图本身唔郁。0=由草图面起。', lang)}>
              <span style={{ color: '#6b7680' }}>{tStatus('起点偏移', lang)}</span>
              <span><LenInput mm={extrudeStart} onMm={(v) => useApp.getState().setExtrudeStart(v)} unit={unit} w={66} title={tStatus('起点偏移（0=由草图面起）', lang)} /> {unit === 'inch' ? 'in' : unit}</span>
            </label>
          )}
          <label title={tStatus('拔模角：侧壁锥度（正=越拉越窄）。仅水平(XY/顶面)草图；凹轮廓太陡会自动改直拉伸。', lang)}>
            <span style={{ color: '#6b7680' }}>{tStatus('拔模角', lang)}</span>
            <span><input type="number" step={1} value={extrudeDraft} onChange={(e) => setExtrudeDraft(Number(e.target.value) || 0)} style={{ width: 66 }} /> °</span>
          </label>
          <label title={tStatus('扭转角：拉伸时绕高度方向旋转', lang)}>
            <span style={{ color: '#6b7680' }}>{tStatus('扭转', lang)}</span>
            <span><input type="number" step={5} value={sketchTwist} onChange={(e) => setSketchTwist(Number(e.target.value) || 0)} style={{ width: 66 }} /> °</span>
          </label>
          {/* P2：Operation 排最尾（Fusion 肌肉记忆：揀轮廓→设几何→最后定布尔） */}
          <div style={{ color: '#6b7680' }}>{tStatus('操作', lang)}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={'sb-tool' + (sketchOp === 'new' ? ' active' : '')} style={{ flex: 1 }} onClick={() => setSketchOp('new')}>{tStatus('＋加料', lang)}</button>
            <button className={'sb-tool' + (sketchOp === 'cut' ? ' active' : '')} style={{ flex: 1 }} disabled={!bodyMesh} title={bodyMesh ? tStatus('从实体切除', lang) : tStatus('没有实体可切', lang)} onClick={() => setSketchOp('cut')}>{tStatus('－切割', lang)}</button>
            <button className={'sb-tool' + (sketchOp === 'intersect' ? ' active' : '')} style={{ flex: 1 }} disabled={!bodyMesh} title={bodyMesh ? tStatus('只保留公共部分', lang) : tStatus('没有实体可相交', lang)} onClick={() => setSketchOp('intersect')}>{tStatus('∩相交', lang)}</button>
            <button className={'sb-tool' + (sketchOp === 'newbody' ? ' active' : '')} style={{ flex: 1 }} disabled={!bodyMesh} title={bodyMesh ? tStatus('新建独立实体：拉伸体唔并入现有实体，灰显泊车（浏览器树可见；之后可「合并」实体布尔）', lang) : tStatus('没有实体时直接建做活动实体', lang)} onClick={() => setSketchOp('newbody')}>{tStatus('⬡新实体', lang)}</button>
          </div>
          {bodyMesh && (
            <button className={'sb-tool' + (sketchAsComp ? ' active' : '')} style={{ width: '100%' }} title={tStatus('新组件（Fusion Operation=New Component）：先把当前实体固化成一个组件，再喺全新时间轴建此拉伸做新组件（各自独立参数树/BOM 项）', lang)} onClick={() => useApp.setState({ sketchAsComponent: true, sketchOp: 'new' })}>{tStatus('🧩 新组件', lang)}</button>
          )}
        </CommandDialog>
      )}

      {sweepDlgOpen && (
        <CommandDialog
          icon="sweep"
          title={tStatus((sweepEditId ? '编辑 · ' : '') + '沿路径扫掠', lang)}
          width={232}
          okTip={tStatus('生成（Enter）', lang)}
          onOk={() => void commitSweepPath()}
          onCancel={() => cancelSweepDlg()}
          summary={sketchOp === 'cut' ? tStatus(`沿路径切圆槽 Ø${sweepDia}`, lang) : sketchOp === 'intersect' ? tStatus('沿路径扫掠 ∩ 保留公共部分', lang) : tStatus(`沿路径扫圆管 Ø${sweepDia}`, lang)}
        >
          <SelectionChip label={tStatus('路径', lang)} count={sweepEdgeLinesV.length ? sweepEdgeLinesV.length : (sweepAxis || sweepEditId ? 1 : ((sketchShape && sketchShape.type === 'poly') || polyPts.length >= 2 ? 1 : 0))} hint={tStatus(sweepEditId ? '编辑模式会保留原本的 2D/3D 路径与导轨；改参数后按确定重建' : '先画折线/样条作路径，或选构造轴脊线，或用下面「拾实体边」逐条接力', lang)} onClear={sweepEdgeLinesV.length ? () => useApp.getState().clearSweepEdges() : undefined} />
          {/* GM-3DV1 S5：沿实体边链拾路径（Fusion Chain Path）+ S15 active pick-slot 高亮 */}
          <label title={tStatus('沿实体边链做路径（Fusion Chain Path）：撳「拾实体边」→ 喺实体上逐条点相连嘅棱边接力（青色高亮），截面沿边链扫掠。适合沿已有实体边加管/导轨。', lang)}>
            <span style={{ color: '#6b7680' }}>{tStatus('实体边链', lang)}</span>
            <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button className={'cs-btn pick-slot' + (sweepEdgePickV ? ' active' : '')} onClick={() => useApp.getState().toggleSweepEdgePick()}>{sweepEdgePickV ? tStatus('拾边中…', lang) : tStatus('🎯拾实体边', lang)}</button>
              {sweepEdgeLinesV.length > 0 && <span className="sel-chip">{sweepEdgeLinesV.length}<span className="sel-chip-x" onClick={() => useApp.getState().clearSweepEdges()}>✕</span></span>}
            </span>
          </label>
          <SelectionChip label={tStatus('导轨', lang)} count={sweepGuide && sweepGuide.length >= 2 ? 1 : 0} hint={tStatus('⤳扫掠导轨（草图工具栏）：画折线→记低 — 截面沿路径行进时跟导轨转向（Fusion Guide Rail）', lang)} onClear={() => useApp.getState().clearSweepGuide()} />
          {caxes.length > 0 && (
            <label title={tStatus('路径来源：用你画的折线，或拿一条构造轴当直线脊线（沿轴方向扫一段长度）', lang)}>
              <span style={{ color: '#6b7680' }}>{tStatus('路径来源', lang)}</span>
              <span><select value={sweepAxis} onChange={(e) => setSweepAxis(e.target.value)} style={{ width: 120 }}>
                <option value="">{tStatus('画线路径', lang)}</option>
                {caxes.map((_, i) => <option key={i} value={'A' + i}>{tStatus('构造轴', lang)}{i + 1}</option>)}
              </select></span>
            </label>
          )}
          {sweepAxis && (
            <label title={tStatus('沿构造轴方向、从轴点起算的脊线长度', lang)}>
              <span style={{ color: '#6b7680' }}>{tStatus('脊线长度', lang)}</span>
              <span><input type="number" min={1} step={10} value={sweepAxisLen} onChange={(e) => setSweepAxisLen(Number(e.target.value) || 100)} style={{ width: 66 }} /> mm</span>
            </label>
          )}
          <div style={{ color: '#6b7680' }}>{tStatus('截面', lang)}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={'sb-tool' + (sweepSection === 'circle' ? ' active' : '')} style={{ flex: 1 }} onClick={() => setSweepSection('circle')}>{tStatus('◯ 圆', lang)}</button>
            <button className={'sb-tool' + (sweepSection === 'profile' ? ' active' : '')} style={{ flex: 1 }} title={tStatus('任意草图截面（Fusion 式）：先画一个闭合轮廓（以原点为中心），再画路径折线 — 截面垂直路径扫过', lang)} onClick={() => setSweepSection('profile')}>{tStatus('▱ 草图轮廓', lang)}</button>
          </div>
          {sweepSection === 'circle' && <label title={tStatus('圆形截面的直径，沿路径扫掠', lang)}>
            <span style={{ color: '#6b7680' }}>{tStatus('管径 Ø', lang)}</span>
            <span><input type="number" min={0.5} step={1} value={sweepDia} onChange={(e) => setSweepDia(Number(e.target.value) || 12)} style={{ width: 66 }} /> mm</span>
          </label>}
          {sweepSection === 'profile' && <div className="sb-hint" style={{ fontSize: 11 }}>{tStatus('用 profiles 入面最后一个闭合轮廓做截面（画轮廓 → 画路径折线 → 确定）', lang)}</div>}
          {/* GM-3DV1 S5：截面朝向（Fusion Orientation）— 垂直=截面恒⊥脊线（缺省）；平行=截面保初始朝向不随脊线转（对圆截面无视觉差，配草图轮廓/扭转用） */}
          <label title={tStatus('截面朝向（Fusion Orientation）：垂直=截面沿路径恒保持⊥脊线（缺省）；平行=截面保持初始朝向、不随脊线转向。对圆截面无视觉差别，配非对称草图轮廓时最明显', lang)}>
            <span style={{ color: '#6b7680' }}>{tStatus('截面朝向', lang)}</span>
            <span><select value={sweepOrient} onChange={(e) => setSweepOrient(e.target.value as 'perp' | 'parallel')} style={{ width: 120 }}>
              <option value="perp">{tStatus('垂直（⊥脊线）', lang)}</option>
              <option value="parallel">{tStatus('平行（保初始朝向）', lang)}</option>
            </select></span>
          </label>
          {sketchOp !== 'cut' && (
            <label title={tStatus('壁厚 mm：>0 扫成空心管（导管/水管/扶手/线管），0=实心圆杆', lang)}>
              <span style={{ color: '#6b7680' }}>{tStatus('壁厚 (空心)', lang)}</span>
              <span><input type="number" min={0} step={0.5} value={sweepWall} onChange={(e) => setSweepWall(Number(e.target.value))} style={{ width: 66 }} /> mm</span>
            </label>
          )}
          <label title={tStatus('3D 爬升：沿路径按弧长均匀升 Z（楼梯扶手/排水管坡道/缆线槽）。0 = 平面扫掠；非 0 时脊线走平滑 3D 样条', lang)}>
            <span style={{ color: '#6b7680' }}>{tStatus('爬升 Z (3D)', lang)}</span>
            <span><input type="number" step={5} value={sweepClimb} onChange={(e) => setSweepClimb(Number(e.target.value))} style={{ width: 66 }} /> mm</span>
          </label>
          <label title={tStatus('扭转：截面沿脊线行进时绕路径方向旋转嘅总角度（Fusion sweep twist）。0=不扭。对圆截面无视觉效果，配草图轮廓截面用。', lang)}>
            <span style={{ color: '#6b7680' }}>{tStatus('扭转', lang)}</span>
            <span><input type="number" step={15} value={sweepTwist} onChange={(e) => setSweepTwist(Number(e.target.value))} style={{ width: 66 }} /> °</span>
          </label>
          <label title={tStatus('末端缩放：末端截面相对起端等比缩放（taper，Fusion sweep scale）。1=不变；0.5=末端收一半；>1=放大。喇叭口/锥管/收口。', lang)}>
            <span style={{ color: '#6b7680' }}>{tStatus('末端缩放', lang)}</span>
            <span><input type="number" min={0.05} step={0.1} value={sweepScale} onChange={(e) => setSweepScale(Number(e.target.value) || 1)} style={{ width: 66 }} /> ×</span>
          </label>
          {/* P2：Operation 排最尾（Fusion 肌肉记忆：揀轮廓→设几何→最后定布尔）+ 补 ∩相交（对齐 loft） */}
          <div style={{ color: '#6b7680' }}>{tStatus('操作', lang)}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={'sb-tool' + (sketchOp === 'new' ? ' active' : '')} style={{ flex: 1 }} onClick={() => setSketchOp('new')}>{tStatus('＋加料', lang)}</button>
            <button className={'sb-tool' + (sketchOp === 'cut' ? ' active' : '')} style={{ flex: 1 }} disabled={!bodyMesh} title={bodyMesh ? tStatus('沿路径切出圆槽', lang) : tStatus('没有实体可切', lang)} onClick={() => setSketchOp('cut')}>{tStatus('－切割', lang)}</button>
            <button className={'sb-tool' + (sketchOp === 'intersect' ? ' active' : '')} style={{ flex: 1 }} disabled={!bodyMesh} title={bodyMesh ? tStatus('保留扫掠体同实体嘅公共部分', lang) : tStatus('没有实体可相交', lang)} onClick={() => setSketchOp('intersect')}>{tStatus('∩相交', lang)}</button>
            <button className={'sb-tool' + (sketchOp === 'newbody' ? ' active' : '')} style={{ flex: 1 }} disabled={!bodyMesh} onClick={() => setSketchOp('newbody')} title={tStatus('新建独立实体：拉伸体唔并入现有实体，灰显泊车（浏览器树可见；之后可「合并」实体布尔）', lang)}>{tStatus('⬡新实体', lang)}</button>
          </div>
        </CommandDialog>
      )}

      {loftDlgOpen && (
        <CommandDialog
          icon="loft"
          title={tStatus((loftEditId ? '编辑 · ' : '') + '放样', lang)}
          width={232}
          okTip={tStatus('放样（Enter）', lang)}
          onOk={() => void commitLoft()}
          onCancel={() => cancelLoftDlg()}
          summary={<>{sketchOp === 'cut' ? tStatus('从实体切除', lang) : sketchOp === 'intersect' ? tStatus('保留公共部分', lang) : tStatus('生成/拼合实体', lang)} · {tStatus('穿', lang)} {loftSections.length} {tStatus('截面', lang)}</>}
        >
          <SelectionChip label={tStatus('截面', lang)} count={loftSections.length} hint={tStatus('画轮廓 →「＋放样截面」逐个加', lang)} />
          <SelectionChip label={tStatus('导轨', lang)} count={loftRail ? 1 : 0} hint={tStatus('⤳放样导轨：折线每截面一点（只支持 1 条 — 内核单 auxiliary spine 槽）', lang)} onClear={() => useApp.getState().clearLoftRail()} />
          <div style={{ color: '#6b7680' }}>{tStatus('曲面选项', lang)}</div>
          <label style={{ justifyContent: 'flex-start', gap: 6, fontSize: 12 }} title={tStatus('直纹边界曲面：截面之间用直线连接（developable，干净轻量），关＝平滑样条过渡', lang)}>
            <input type="checkbox" checked={loftRuled} onChange={(e) => setLoftOpt({ loftRuled: e.target.checked })} /> {tStatus('直纹边界曲面', lang)}
          </label>
          {loftSections.length >= 3 && (
            <label style={{ justifyContent: 'flex-start', gap: 6, fontSize: 12 }} title={tStatus('闭环（Fusion Loft Closed）：末截面接返首截面成环状回路（轮圈/管环）。需≥3 截面。接缝处 C0 连续（趋势级闭环）。', lang)}>
              <input type="checkbox" checked={loftClosed} onChange={(e) => setLoftOpt({ loftClosed: e.target.checked })} /> {tStatus('闭环（末接首）', lang)}
            </label>
          )}
          {!loftRuled && (
            <label title={tStatus('端条件（Fusion loft）：普通=平滑样条；切线连续(G1)=过截面切线不折；曲率连续(G2)=过截面曲率连续（最顺，外观/A级曲面）。走裸 ThruSections.SetContinuity。', lang)}>
              <span style={{ color: '#6b7680' }}>{tStatus('端条件', lang)}</span>
              <span><select value={loftContinuity} onChange={(e) => setLoftOpt({ loftContinuity: e.target.value as '' | 'C1' | 'C2' })} style={{ height: 26 }}>
                <option value="">{tStatus('普通（平滑）', lang)}</option>
                <option value="C1">{tStatus('切线连续 G1', lang)}</option>
                <option value="C2">{tStatus('曲率连续 G2', lang)}</option>
              </select></span>
            </label>
          )}
          <label style={{ justifyContent: 'flex-start', gap: 6, fontSize: 12 }} title={tStatus('薄壁曲面板：把放样体抽空成指定壁厚嘅曲面壳（外罩/导流板/曲面支架）。0＝实体。抽壁失败会退回实体并提示', lang)}>
            {tStatus('薄壁', lang)}<input type="number" step={0.5} min={0} value={loftWall} onChange={(e) => setLoftOpt({ loftWall: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 56 }} />{tStatus('mm（0=实体）', lang)}
          </label>
          {cpoints.length > 0 && (<>
            <div style={{ color: '#6b7680' }}>{tStatus('封口构造点（Loft to point）', lang)}</div>
            <label title={tStatus('选一个构造点做放样封口顶点：该端用真水密尖收口（鼻锥/漏斗/钻尖/finial），取代假小圆薄片。— 不选 = 普通放样', lang)}>{tStatus('封口点', lang)} <select value={loftCapPoint == null ? '' : String(loftCapPoint)} onChange={(e) => { const v = e.target.value; setLoftOpt({ loftCapPoint: v === '' ? null : Number(v) }) }} style={{ height: 26 }}><option value="">{tStatus('— 无（普通放样）—', lang)}</option>{cpoints.map((cp, i) => <option key={'LCP' + i} value={i}>{tStatus('构造点', lang)}{i + 1}（{cp.map((v) => +v.toFixed(0)).join(',')}）</option>)}</select></label>
            {loftCapPoint != null && (
              <label title={tStatus('封口在哪一端：顶点封住最后截面侧（顶，默认）或第一截面侧（底）', lang)}>{tStatus('封口端', lang)} <select value={loftCapEnd} onChange={(e) => setLoftOpt({ loftCapEnd: e.target.value === 'first' ? 'first' : 'last' })} style={{ height: 26 }}><option value="last">{tStatus('顶（最后截面侧）', lang)}</option><option value="first">{tStatus('底（第一截面侧）', lang)}</option></select></label>
            )}
          </>)}
          {/* P2：Operation 排最尾（Fusion 肌肉记忆） */}
          <div style={{ color: '#6b7680' }}>{tStatus('操作', lang)}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={'sb-tool' + (sketchOp === 'new' ? ' active' : '')} style={{ flex: 1 }} onClick={() => setSketchOp('new')}>{tStatus('＋加料', lang)}</button>
            <button className={'sb-tool' + (sketchOp === 'cut' ? ' active' : '')} style={{ flex: 1 }} disabled={!bodyMesh} title={bodyMesh ? tStatus('从实体切除放样体', lang) : tStatus('没有实体可切', lang)} onClick={() => setSketchOp('cut')}>{tStatus('－切割', lang)}</button>
            <button className={'sb-tool' + (sketchOp === 'intersect' ? ' active' : '')} style={{ flex: 1 }} disabled={!bodyMesh} onClick={() => setSketchOp('intersect')}>{tStatus('∩相交', lang)}</button>
            <button className={'sb-tool' + (sketchOp === 'newbody' ? ' active' : '')} style={{ flex: 1 }} disabled={!bodyMesh} onClick={() => setSketchOp('newbody')} title={tStatus('新建独立实体：拉伸体唔并入现有实体，灰显泊车（浏览器树可见；之后可「合并」实体布尔）', lang)}>{tStatus('⬡新实体', lang)}</button>
          </div>
        </CommandDialog>
      )}

      {matLibOpen && (
        <div className="cmd-palette" style={{ width: 230 }}>{/* GM-G4b：外观材质库 — 统一命令 palette 外壳（.cmd-palette head/body），取代 ad-hoc 内联卡片 */}
          <div className="cmd-palette-head">
            <span style={{ fontWeight: 700 }}>📚 {tStatus('外观材质库', lang)}</span>
            <span className="cmd-palette-x" title={tStatus('关闭', lang)} onClick={() => useApp.getState().setMatLibOpen(false)}>✕</span>
          </div>
          <div className="cmd-palette-body">
          <button
            onClick={async () => { const nm = await useApp.getState().appPrompt(tStatus('外观预设名（存当前颜色+金属度+粗糙度+纹理）', lang), tStatus('我的材质', lang)); if (nm && nm.trim()) useApp.getState().saveMaterialPreset(nm.trim()) }}
            style={{ width: '100%', padding: '6px 0', marginBottom: 8, border: '1px solid #c7d0d8', borderRadius: 6, background: '#f4f7fa', cursor: 'pointer', fontSize: 12 }}
          >💾 {tStatus('保存当前外观…', lang)}</button>
          {Object.keys(materialLibrary).length === 0
            ? <div style={{ color: '#8a97a2', fontSize: 12, padding: '4px 0' }}>{tStatus('未有已存预设。先调好外观再「保存当前」。', lang)}</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
                {Object.entries(materialLibrary).map(([name, p]) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', borderRadius: 5, background: '#f7f9fb' }}>
                    <span style={{ width: 16, height: 16, borderRadius: 4, background: p.color, border: '1px solid #c7d0d8', flex: '0 0 auto' }} />
                    <button onClick={() => useApp.getState().loadMaterialPreset(name)} title={tStatus('套用呢个外观', lang)} style={{ flex: 1, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</button>
                    <button onClick={() => useApp.getState().deleteMaterialPreset(name)} title={tStatus('删除', lang)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#c0392b', fontSize: 13 }}>✕</button>
                  </div>
                ))}
              </div>}
          </div>
        </div>
      )}

      {fourBar && (() => {
        const sol = solve4Bar(fourBar, fourBar.theta, fourBar.branch)
        const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1])
        const L1 = dist(fourBar.A, fourBar.B0).toFixed(1), L2 = dist(fourBar.B0, fourBar.C0).toFixed(1), L3 = dist(fourBar.D, fourBar.C0).toFixed(1)
        return (
          <div className="cmd-palette" style={{ width: 240 }}>{/* GM-G4b：四连杆机构 — 统一命令 palette 外壳 */}
            <div className="cmd-palette-head">
              <span style={{ fontWeight: 700 }}>{tStatus('⬚ 四连杆机构（闭环）', lang)}</span>
              <span className="cmd-palette-x" title={tStatus('关闭', lang)} onClick={() => closeFourBar()}>✕</span>
            </div>
            <div className="cmd-palette-body">
            <div style={{ fontSize: 11, color: sol.ok ? '#1aa06b' : '#d6694e', marginBottom: 8 }}>{sol.ok ? tStatus('✓ 约束求解 — 杆长刚性保持', lang) : tStatus('⚠ 当前角度超出可达范围（曲柄转不到这）', lang)}</div>
            <label style={{ display: 'block', marginBottom: 8 }}>
              <span style={{ color: '#6b7680' }}>{tStatus('曲柄角', lang)} {Math.round(fourBar.theta)}°</span>
              <input type="range" min={0} max={360} value={fourBar.theta} onChange={(e) => setFourBarAngle(Number(e.target.value))} style={{ width: '100%' }} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px', marginBottom: 8, fontSize: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>{tStatus('曲柄', lang)} <input type="number" step={1} min={1} value={+L1} onChange={(e) => setFourBar({ crank: Number(e.target.value) })} style={{ width: 46 }} /></label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>{tStatus('连杆', lang)} <input type="number" step={1} min={1} value={+L2} onChange={(e) => setFourBar({ coupler: Number(e.target.value) })} style={{ width: 46 }} /></label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>{tStatus('摇杆', lang)} <input type="number" step={1} min={1} value={+L3} onChange={(e) => setFourBar({ rocker: Number(e.target.value) })} style={{ width: 46 }} /></label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>{tStatus('机架', lang)} <input type="number" step={1} min={1} value={+dist(fourBar.A, fourBar.D).toFixed(0)} onChange={(e) => setFourBar({ ground: Number(e.target.value) })} style={{ width: 46 }} /></label>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="sb-finish" style={{ flex: 1 }} title={tStatus('切换另一支装配解', lang)} onClick={() => flipFourBar()}>{tStatus('翻转装配', lang)}</button>
              <button className="sb-finish" style={{ flex: 1 }} title={tStatus('描出连杆中点扫曲柄一圈嘅运动轨迹（耦合曲线）', lang)} onClick={() => (motionTracePts.length ? useApp.getState().clearTrace() : useApp.getState().traceMotion())}>{motionTracePts.length ? tStatus('清轨迹', lang) : tStatus('📈轨迹', lang)}</button>
              <button className="sb-finish" style={{ flex: 1 }} title={tStatus('运动包络：机构扫一圈占用嘅矩形范围（紫色虚线框，设计外壳/避让用）', lang)} onClick={envBtn}>{motionEnvelope ? tStatus('清包络', lang) : tStatus('▢包络', lang)}</button>
              <button className="sb-finish" style={{ flex: 1 }} title={tStatus('机构分析（S193）：报当前曲柄角嘅速度比 ω摇杆/ω曲柄、传动角、机械利益 + 全程最差传动角（<40°机构发卡警告）— Fusion Motion Study 级指标', lang)} onClick={() => useApp.getState().runLinkageAnalysis()}>{tStatus('🔧分析', lang)}</button>
              <button className="sb-finish" style={{ flex: 1 }} onClick={() => closeFourBar()}>{tStatus('关闭', lang)}</button>
            </div>
            </div>
          </div>
        )
      })()}

      {sliderCrank && (() => {
        const sol = solveSliderCrank(sliderCrank)
        const stroke = (2 * sliderCrank.r).toFixed(0)
        const pistonX = sol.C[0].toFixed(1)
        return (
          <div className="cmd-palette" style={{ width: 240 }}>{/* GM-G4b：滑块曲柄机构 — 统一命令 palette 外壳 */}
            <div className="cmd-palette-head">
              <span style={{ fontWeight: 700 }}>{tStatus('⊙ 滑块曲柄机构（活塞）', lang)}</span>
              <span className="cmd-palette-x" title={tStatus('关闭', lang)} onClick={() => closeSliderCrank()}>✕</span>
            </div>
            <div className="cmd-palette-body">
            <div style={{ fontSize: 11, color: sol.ok ? '#1aa06b' : '#d6694e', marginBottom: 8 }}>{sol.ok ? tStatus('✓ 闭环求解 — 连杆长刚性保持', lang) : tStatus('⚠ 连杆太短，够唔到滑轨', lang)}</div>
            <label style={{ display: 'block', marginBottom: 8 }}>
              <span style={{ color: '#6b7680' }}>{tStatus('曲柄角', lang)} {Math.round(sliderCrank.theta)}°</span>
              <input type="range" min={0} max={360} value={sliderCrank.theta} onChange={(e) => setSliderCrankAngle(Number(e.target.value))} style={{ width: '100%' }} />
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>{tStatus('曲柄半径', lang)} <input type="number" step={1} min={1} value={sliderCrank.r} onChange={(e) => setSliderCrank({ r: Number(e.target.value) })} style={{ width: 48 }} /></label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>{tStatus('连杆', lang)} <input type="number" step={1} min={1} value={sliderCrank.L} onChange={(e) => setSliderCrank({ L: Number(e.target.value) })} style={{ width: 48 }} /></label>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, fontSize: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>{tStatus('偏置', lang)} <input type="number" step={1} value={sliderCrank.e} onChange={(e) => setSliderCrank({ e: Number(e.target.value) })} style={{ width: 48 }} /></label>
              <span style={{ color: '#8a939c' }}>{tStatus('行程', lang)} {stroke} · {tStatus('活塞', lang)} x={pistonX}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="sb-finish" style={{ flex: 1 }} title={tStatus('描出活塞扫曲柄一圈嘅运动轨迹（往复行程线）', lang)} onClick={() => (motionTracePts.length ? useApp.getState().clearTrace() : useApp.getState().traceMotion())}>{motionTracePts.length ? tStatus('清轨迹', lang) : tStatus('📈轨迹', lang)}</button>
              <button className="sb-finish" style={{ flex: 1 }} title={tStatus('运动包络：机构扫一圈占用嘅矩形范围（紫色虚线框，设计外壳/避让用）', lang)} onClick={envBtn}>{motionEnvelope ? tStatus('清包络', lang) : tStatus('▢包络', lang)}</button>
              <button className="sb-finish" style={{ flex: 1 }} onClick={() => closeSliderCrank()}>{tStatus('关闭', lang)}</button>
            </div>
            </div>
          </div>
        )
      })()}

      {sixBar && (
        <div className="cmd-palette" style={{ width: 252 }}>{/* GM-G4b：六杆机构 — 统一命令 palette 外壳 */}
          <div className="cmd-palette-head">
            <span style={{ fontWeight: 700 }}>{tStatus('⬡ 六杆机构（Stephenson-III）', lang)}</span>
            <span className="cmd-palette-x" title={tStatus('关闭', lang)} onClick={() => closeSixBar()}>✕</span>
          </div>
          <div className="cmd-palette-body">
          <div style={{ fontSize: 11, color: '#1aa06b', marginBottom: 8 }}>{tStatus('✓ 通用连杆求解器 solveLinkage 联立闭环解算（非解析公式）— 紫色为输出点 E', lang)}</div>
          <label style={{ display: 'block', marginBottom: 8 }}>
            <span style={{ color: '#6b7680' }}>{tStatus('曲柄角', lang)} {Math.round(sixBar.theta)}°</span>
            <input type="range" min={0} max={360} value={sixBar.theta} onChange={(e) => setSixBarAngle(Number(e.target.value))} style={{ width: '100%' }} />
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="sb-finish" style={{ flex: 1 }} title={tStatus('描出输出点 E 扫曲柄一圈嘅运动轨迹（compound 耦合曲线）', lang)} onClick={() => (motionTracePts.length ? useApp.getState().clearTrace() : useApp.getState().traceMotion())}>{motionTracePts.length ? tStatus('清轨迹', lang) : tStatus('📈轨迹', lang)}</button>
            <button className="sb-finish" style={{ flex: 1 }} title={tStatus('运动包络：机构扫一圈占用嘅矩形范围（紫色虚线框，设计外壳/避让用）', lang)} onClick={envBtn}>{motionEnvelope ? tStatus('清包络', lang) : tStatus('▢包络', lang)}</button>
            <button className="sb-finish" style={{ flex: 1 }} onClick={() => closeSixBar()}>{tStatus('关闭', lang)}</button>
          </div>
          </div>
        </div>
      )}

      {selComp && (
        <div className="sketch-bar">
          <button className="sb-tool" title={compBarMin ? tStatus('展开零件工具栏', lang) : tStatus('折叠零件工具栏（净留名称同完成，唔挡视图）', lang)} onClick={toggleCompBar} style={{ fontWeight: 700, minWidth: 22 }}>{compBarMin ? '▸' : '▾'}</button>
          <span className="sb-title">{tStatus('移动/旋转', lang)} {selComp.name}</span>
          {!compBarMin && (<>
          <label>X <input type="number" step={5} value={selComp.pos[0]} onChange={(e) => setComponentPos(selComp.id, [Number(e.target.value) || 0, selComp.pos[1], selComp.pos[2]])} /></label>
          <label>Y <input type="number" step={5} value={selComp.pos[1]} onChange={(e) => setComponentPos(selComp.id, [selComp.pos[0], Number(e.target.value) || 0, selComp.pos[2]])} /></label>
          <label>Z <input type="number" step={5} value={selComp.pos[2]} onChange={(e) => setComponentPos(selComp.id, [selComp.pos[0], selComp.pos[1], Number(e.target.value) || 0])} /></label>
          <span className="sb-spacer" />
          {(() => { const r = selComp.rot || [0, 0, 0]; const setR = (i: number, v: number) => { const n: [number, number, number] = [r[0], r[1], r[2]]; n[i] = v; setComponentRot(selComp.id, n) }; return (
            <>
              <label title={tStatus('绕 X 轴旋转（度）', lang)}>{tStatus('绕X°', lang)} <input type="number" step={15} value={r[0]} onChange={(e) => setR(0, Number(e.target.value) || 0)} style={{ width: 52 }} /></label>
              <label title={tStatus('绕 Y 轴（竖直）旋转（度）— 转动零件朝向最常用', lang)}>{tStatus('绕Y°', lang)} <input type="number" step={15} value={r[1]} onChange={(e) => setR(1, Number(e.target.value) || 0)} style={{ width: 52 }} /></label>
              <label title={tStatus('绕 Z 轴旋转（度）', lang)}>{tStatus('绕Z°', lang)} <input type="number" step={15} value={r[2]} onChange={(e) => setR(2, Number(e.target.value) || 0)} style={{ width: 52 }} /></label>
              <button className="sb-tool" title={tStatus('清零旋转', lang)} onClick={() => setComponentRot(selComp.id, [0, 0, 0])}>{tStatus('↺归零', lang)}</button>
            </>
          ) })()}
          <button className="sb-tool" title={tStatus('聚焦：镜头框到此组件（装配中快速放大单个零件）', lang)} onClick={() => requestFit(selComp.id)}>{tStatus('🎯聚焦', lang)}</button>
          <label className="sb-tool" title={tStatus('此零件透明度（睇穿佢睇内部，免开全局透视）', lang)} style={{ gap: 3 }}>{tStatus('透明', lang)}<input type="range" min={10} max={100} value={Math.round(((selComp as { opacity?: number }).opacity ?? 1) * 100)} onChange={(e) => useApp.getState().setComponentOpacity(selComp.id, Number(e.target.value) / 100)} style={{ width: 60 }} /></label>
          <span className="sb-spacer" />
          {(() => { const cp = computeProps(selComp.mesh); if (!cp) return null; if (cp.vol < 1) return <span style={{ fontSize: 12, color: '#8a97a2' }} title="此组件是固定参考（机构 FK 根），没有实体几何，不计入质量/BOM">（固定参考件 · 无实体几何）</span>; const cd = (selComp.material && MATERIALS[selComp.material]?.density) || density; const gm = (cp.vol / 1000) * cd; return <><span style={{ fontSize: 12, color: '#5a6b78' }} title="此组件的单件属性">{selComp.material ? `[${selComp.material}] ` : ''}体积 {fmtVol(cp.vol, unit)} · 质量 {gm >= 1000 ? (gm / 1000).toFixed(2) + ' kg' : gm.toFixed(1) + ' g'} · {uLen(cp.dx)}×{uLen(cp.dy)}×{uLen(cp.dz)} {uSuf}</span><span style={{ fontSize: 11, color: '#8a97a2' }} title="此零件绕质心 X/Y/Z 轴的转动惯量（按其材质密度，g·cm²）— 机构动力学 / 平衡 / 飞轮用"> · 惯量 {cp.inertia.map((j) => (j * cd / 1e5).toFixed(1)).join('/')}</span><span title={cp.watertight.closed ? '此零件网格封闭水密 — 可直接 3D 打印' : `此零件网格非水密：${cp.watertight.boundary} 条开放边${cp.watertight.nonManifold ? ' · ' + cp.watertight.nonManifold + ' 条非流形边' : ''} — 切片器可能出错，建议检查（导入件尤其要留意）`} style={{ fontSize: 11, fontWeight: 600, color: cp.watertight.closed ? '#2e9e5b' : '#d98324' }}> · {cp.watertight.closed ? '水密✓' : `水密✗(${cp.watertight.boundary}开放${cp.watertight.nonManifold ? '/' + cp.watertight.nonManifold + '非流形' : ''})`}</span><CompBedFit w={cp.dx} d={cp.dy} h={cp.dz} /><button className="sb-tool" title="量此零件到最近邻件嘅间隙（clearance，顶点采样）" onClick={async () => useApp.getState().componentClearance(selComp.id)}>📏间隙</button><button className="sb-tool" title="量到另一个零件：点此再点第二个零件 → 报中心距 + ΔXYZ + 最近间隙" onClick={async () => useApp.getState().measureFromComponent(selComp.id)}>📐量到…</button><MateControls compId={selComp.id} /><BeamControls compId={selComp.id} /><button className="sb-tool" title="导出此零件为 STL（单件、自然朝向，可直接拖入切片软件 3D 打印）" onClick={async () => useApp.getState().exportComponentStl(selComp.id)}>📥STL</button><button className="sb-tool" title="线性 / 网格阵列：把此零件复制成一排或一格。一排→数量,X间距[,Z间距]；网格→列数,X间距,行数,Z间距（螺栓行 / 栏杆 / 托盘 / 钉阵）" onClick={async () => { const v = await useApp.getState().appPrompt('阵列（按填几个数自动判断）：\n一排 → 数量,X间距mm[,Z间距mm]（例 4,50 或 4,50,10 斜排）\n网格 → 列数,X间距mm,行数,Z间距mm（例 4,50,3,40）', '4,50,0'); if (v == null) return; const p = v.split(/[,，\s]+/).filter(Boolean).map(Number); if (p.some((x) => !Number.isFinite(x))) { await useApp.getState().appAlert('请只输入数字（用逗号分隔）'); return } const app = useApp.getState(); if (p.length >= 4) { const cols = p[0], dx = p[1], rows = p[2], dz = p[3]; if (cols < 1 || rows < 1 || cols * rows < 2) { await useApp.getState().appAlert('网格：列数×行数 至少 2 件'); return } app.gridArrayComponent(selComp.id, cols, dx, rows, dz) } else { const n = p[0], dx = p[1] || 0, dz = p[2] || 0; if (n < 2) { await useApp.getState().appAlert('数量至少为 2'); return } app.arrayComponent(selComp.id, n, dx, dz) } }}>▦阵列</button><button className="sb-tool" title="环形阵列：绕竖直轴把此零件排成一圈（螺栓圈 / 轮辐 / 风扇叶）。先把零件移离中心，再点此输入 数量[,总角度=360][,中心X=0][,中心Z=0]" onClick={async () => { const v = await useApp.getState().appPrompt('环形阵列：数量[,总角度°=360][,中心X=0][,中心Z=0]\n（例如 6 = 绕原点等分一圈 6 件；4,180,0,0 = 半圈 4 件。零件需先移离中心轴才有半径）', '6'); if (v == null) return; const p = v.split(/[,，\s]+/).filter(Boolean).map(Number); const n = p[0], ang = p.length > 1 ? p[1] : 360, cx = p[2] || 0, cz = p[3] || 0; if (!Number.isFinite(n) || n < 2) { await useApp.getState().appAlert('数量至少为 2'); return } if (!Number.isFinite(ang) || !Number.isFinite(cx) || !Number.isFinite(cz)) { await useApp.getState().appAlert('角度同中心要係数字'); return } useApp.getState().circArrayComponent(selComp.id, n, ang, cx, cz) }}>⊛环形</button><button className="sb-tool" title="落地：把此零件下移到刚好贴住地面（最低点到 Z=0），方便摆放" onClick={async () => useApp.getState().dropComponentToFloor(selComp.id)}>⬇落地</button><button className="sb-tool" title="归中：把此零件的包围盒在地面方向（XZ）居中到原点，高度不变" onClick={async () => useApp.getState().centerComponentXZ(selComp.id)}>⊙归中</button><button className="sb-tool" title="缩放此零件（绕自身中心，整体放大/缩小，适合调整导入件大小）。点击输入比例，如 2 = 放大一倍、0.5 = 缩一半" onClick={async () => { const v = await useApp.getState().appPrompt('缩放比例（绕自身中心；如 2=放大一倍，0.5=缩一半，25.4=英寸→mm）', '2'); if (v == null) return; const f = Number(v.trim()); if (!Number.isFinite(f) || f <= 0) { await useApp.getState().appAlert('请输入正数比例'); return } useApp.getState().scaleComponent(selComp.id, f) }}>⤢缩放</button><button className="sb-tool" title="非等比缩放：X / Y / Z 独立拉伸此零件（绕自身中心）。下载嘅 STL 改尺寸日常用——例如把 20mm 立方拉成 20×20×30。输入 sx,sy,sz（如 1,1,1.5 净拉高 Z 一半）" onClick={async () => { const v = await useApp.getState().appPrompt('非等比缩放 X,Y,Z（绕自身中心；如 1,1,1.5 = 净 Z 拉高半；2,1,1 = 净 X 拉阔一倍）', '1,1,1.5'); if (v == null) return; const p = v.split(/[,，\s]+/).filter(Boolean).map(Number); if (p.length !== 3 || p.some((x) => !Number.isFinite(x) || x <= 0)) { await useApp.getState().appAlert('请输入三个正数：sx,sy,sz'); return } useApp.getState().scaleComponentXYZ(selComp.id, p[0], p[1], p[2]) }}>⇲非等比</button><button className="sb-tool" title="修复网格：焊接重合顶点 + 删退化/重复三角 + 统一三角朝向（修黑面/内外反）+ 重算法线，把「未焊接/翻面」型问题件修好（导入 STL 常见）。注：唔会补真实几何孔洞" onClick={async () => useApp.getState().repairComponentMesh(selComp.id)}>🩹修复网格</button><button className="sb-tool" title={`简化网格（减面）：当前 ${Math.round(selComp.mesh.triangles.length / 3)} 三角。输入聚类格 mm（越大减得越多、越平滑），适合减轻导入嘅重网格/扫描件`} onClick={async () => { const v = await useApp.getState().appPrompt('网格简化（顶点聚类减面）：输入聚类格 mm\n（如 0.5 轻、1 中、2 大幅；越大三角越少、细节越平滑）', '1'); if (v == null) return; const cell = Number(v.trim()); if (!Number.isFinite(cell) || cell <= 0) { await useApp.getState().appAlert('请输入正数（mm）'); return } useApp.getState().simplifyComponentMesh(selComp.id, cell) }}>📉简化</button><button className="sb-tool" title={`各向同性重网格 Remesh（Botsch-Kobbelt：均匀边长 + 原面重投影保形）：当前 ${Math.round(selComp.mesh.triangles.length / 3)} 三角。输入目标边长 mm — 把不规则/扫描/STL 重做成边长均匀近等边网格（FEA/转 B-rep 前置）`} onClick={async () => { const v = await useApp.getState().appPrompt('各向同性重网格：目标边长 mm\n（细=三角多更平滑均匀，粗=三角少；如 2 细 / 3 中 / 5 粗）', '3'); if (v == null) return; const L = Number(v.trim()); if (!Number.isFinite(L) || L <= 0) { await useApp.getState().appAlert('请输入正数（mm）'); return } void useApp.getState().remeshComponentMesh(selComp.id, L) }}>▦重网格</button><button className="sb-tool" title="网格分离 Separate：按连通性把多壳网格（如一个 STL 含几件、扫描多块）拆成独立组件，逐件可摆放/布尔/打印。单一连通件唔会拆。" onClick={() => useApp.getState().separateMeshComponent(selComp.id)}>🔪分离</button><button className="sb-tool" title="识别平面区：region-grow 把网格三角按共面聚成平面区，报显著平面区数 + 平面覆盖率（Mesh→B-rep 参数化推断前置）。覆盖率高=机加工/棱柱件（多可转精确平面），低=自由曲面/扫描件。" onClick={() => useApp.getState().recognizeMeshPlanes(selComp.id)}>◳识别平面</button><button className="sb-tool" title="归位摆正：把此零件 XZ 居中到原点 + 落地到 Z=0（导入件一键摆好）" onClick={async () => useApp.getState().seatComponent(selComp.id)}>⊹归位</button><button className="sb-tool" title="组件布尔：此件同另一个零件 合并/切除/相交（manifold 网格布尔）。切除可留间隙——把零件 B 摆入零件 A 再「A 切除 B + 0.2 间隙」即得完美插槽/模腔。点此选操作，再点第二个零件完成" onClick={async () => useApp.getState().startComponentBoolean(selComp.id)}>🧩布尔</button>{!!(selComp as { src?: unknown }).src && <button className="sb-tool" title="重开参数化编辑（edit-in-place）：把此组件嘅特征树重新载入时间轴 — 改尺寸/重开草图/加特征，完成后写返组件（位置/关节保持）。固化时自动保存来源；导入件冇此掣" onClick={async () => void useApp.getState().editComponent(selComp.id)}>✎编辑</button>}</> })()}
          </>)}
          <button className="sb-finish" onClick={() => selectComponent(null)}>{tStatus('完成', lang)}</button>
        </div>
      )}

      {/* T738：vp-toolbar 已瓦解（Fusion 冇常驻画布命令条）— 功能搬家：视图→ViewCube/navbar · PNG→文件菜单 ·
          单位→浏览器树 · 面草图→创建草图拣面 · 选边圆角/倒角→MODIFY 对话框 · 量边/面/角+计算器→INSPECT ·
          按拉距离→模式横幅 · 剖视控制→下方对话框 · 爆炸/透视/堆叠/排版/落地→ASSEMBLE */}
      {section.on && (
        <CommandDialog icon="section" title={tStatus('剖切分析', lang)} width={240} okLabel={tStatus('关闭', lang)} okTip={tStatus('关闭剖视', lang)} onOk={() => setSection({ on: false })} onCancel={() => setSection({ on: false })}
          summary={tStatus(`剖切 ${section.plane?.label || `${section.axis}轴`} @ ${section.offset}${section.capped ? ' · 实心' : ''}`, lang)}>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['X', 'Y', 'Z'] as const).map((ax) => <button key={ax} className={'sb-tool' + (!section.plane && section.axis === ax ? ' active' : '')} style={{ flex: 1 }} onClick={() => setSection({ axis: ax, plane: undefined, offset: 0 })}>{ax}</button>)}
          </div>
          {planes.length > 0 && <label title={tStatus('Fusion Section：可選任何已建立構造參考面（包括由 XY／XZ／YZ 偏移而成），再以距離沿法向偏移', lang)}>
            <span style={{ color: '#6b7680' }}>{tStatus('參考面', lang)}</span>
            <select value={section.plane?.sourceIndex != null ? `P${section.plane.sourceIndex}` : ''} onChange={(e) => {
              if (!e.target.value) { setSection({ plane: undefined, offset: 0 }); return }
              const i = Number(e.target.value.slice(1)); const pl = planes[i]
              if (!pl) return
              const ref = pl.arb
                ? { origin: [...pl.arb.o] as [number, number, number], normal: [...pl.arb.n] as [number, number, number], label: `${tStatus('構造面', lang)} ${i + 1}` }
                : pl.base === 'XY'
                  ? { origin: [0, 0, pl.offset] as [number, number, number], normal: [0, 0, 1] as [number, number, number], label: `XY@${pl.offset}` }
                  : pl.base === 'XZ'
                    ? { origin: [0, pl.offset, 0] as [number, number, number], normal: [0, 1, 0] as [number, number, number], label: `XZ@${pl.offset}` }
                    : { origin: [pl.offset, 0, 0] as [number, number, number], normal: [1, 0, 0] as [number, number, number], label: `YZ@${pl.offset}` }
              setSection({ plane: { ...ref, sourceIndex: i }, offset: 0 })
            }} style={{ height: 26 }}>
              <option value="">{tStatus('世界座標面（X/Y/Z）', lang)}</option>
              {planes.map((pl, i) => <option key={`section-plane-${i}`} value={`P${i}`}>{pl.arb ? `${tStatus('構造面', lang)} ${i + 1}` : `${pl.base}@${pl.offset}`}</option>)}
            </select>
          </label>}
          <label title={tStatus('剖切平面位置 (mm)', lang)}>
            <span style={{ color: '#6b7680' }}>{section.plane ? tStatus('沿法向偏移', lang) : tStatus('位置', lang)} {section.offset}</span>
            <input type="range" min={sectionRange.min} max={sectionRange.max} value={section.offset} onChange={(e) => setSection({ offset: Number(e.target.value) })} style={{ width: 130 }} />
          </label>
          <label className="sb-hint" title={tStatus('实心封盖：布尔交集真正切开实体（截面填实）— Fusion 式剖面', lang)}><input type="checkbox" checked={section.capped} onChange={() => setSection({ capped: !section.capped })} /> {tStatus('实心封盖', lang)}</label>
          {section.capped && <label className="sb-hint" title={tStatus('保留剖切平面的另一半', lang)}><input type="checkbox" checked={!!section.flip} onChange={() => setSection({ flip: !section.flip })} /> {tStatus('翻面', lang)}</label>}
          {/* S185：剖面截面属性 — 切面 面积/形心/截面惯矩 实时读出（Fusion Inspect Section） */}
          <button className="sb-tool" style={{ width: '100%', marginTop: 2 }} title={tStatus('量该剖面：面积 / 形心 / 截面惯性矩 Ixx,Iyy / 主轴 / 周长（随位置滑杆实时更新；网格密铺近似）', lang)} onClick={() => (sectionResult?.fromCut ? useApp.getState().clearSectionProps() : useApp.getState().computeSectionCut())}>{sectionResult?.fromCut ? tStatus('✕ 关截面属性', lang) : tStatus('Σ 剖面截面属性', lang)}</button>
        </CommandDialog>
      )}
      {vpDlg === 'calc' && (
        <CommandDialog icon="default" title={tStatus('工程计算', lang)} width={250} okLabel={tStatus('关闭', lang)} onOk={() => setVpDlg(null)} onCancel={() => setVpDlg(null)} summary={tStatus('机械设计速算（14 个）', lang)}>
          {([['紧固 / 配合', [['threadSpecLookup', '螺纹规格速查'], ['isoFitCalc', 'ISO 公差配合'], ['pressFitCalc', '过盈配合（压装）'], ['oRingGrooveCalc', 'O 形圈密封槽'], ['boltClampCalc', '螺栓夹紧力']]],
            ['传动 / 动力', [['gearMeshCalc', '齿轮啮合参数'], ['beltLengthCalc', '皮带长度（双轮）'], ['powerTorqueCalc', '功率·扭矩·转速'], ['springRateCalc', '压缩弹簧刚度'], ['bearingLifeCalc', '轴承寿命 L10'], ['leadScrewCalc', '丝杆 速度·推力']]],
            ['加工 / 钣金', [['drillSpeedCalc', '钻铣转速 RPM'], ['bendAllowanceCalc', '钣金折弯展开'], ['thermalStressCalc', '约束热应力']]]] as [string, [string, string][]][]).map(([grp, items]) => (
            <div key={grp}>
              <div style={{ color: '#6b7680', fontSize: 11, margin: '4px 0 2px' }}>{tStatus(grp, lang)}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {items.map(([fn, lbl]) => <button key={fn} className="sb-tool" style={{ fontSize: 12 }} onClick={() => { const a = useApp.getState() as unknown as Record<string, () => void>; if (typeof a[fn] === 'function') a[fn]() }}>{tStatus(lbl, lang)}</button>)}
              </div>
            </div>
          ))}
        </CommandDialog>
      )}
      {vpDlg === 'explode' && (
        <CommandDialog icon="component" title={tStatus('爆炸视图', lang)} width={240} okLabel={tStatus('关闭', lang)} onOk={() => setVpDlg(null)} onCancel={() => setVpDlg(null)} summary={tStatus(`爆炸 ${Math.round(explode * 100)}%${xray ? ' · 透视' : ''}`, lang)}>
          <label title={tStatus('沿装配中心向外展开组件', lang)}>
            <span style={{ color: '#6b7680' }}>{tStatus('爆炸度', lang)} {Math.round(explode * 100)}%</span>
            <input type="range" min={0} max={200} value={Math.round(explode * 100)} onChange={(e) => setExplode(Number(e.target.value) / 100)} style={{ width: 130 }} />
          </label>
          <label className="sb-hint" title={tStatus('X-ray 透视：半透明睇装配内部', lang)}><input type="checkbox" checked={xray} onChange={() => toggleXray()} /> {tStatus('透视 X-ray', lang)}</label>
          {/* GM-3DV4 A12：有序爆炸步（径向滑杆做 step-0 缺省；加步后滑杆变全序进度） */}
          <div style={{ borderTop: '1px solid #e2e6ea', marginTop: 6, paddingTop: 6 }}>
            <div style={{ color: '#6b7680', fontSize: 12, marginBottom: 4 }} title={tStatus('Fusion 有序爆炸：勾选组件 + 选方向 → 加一步；多步按序展开（滑杆当全序进度）。无步 = 单一径向散开。', lang)}>{tStatus('有序步骤', lang)}{explodeSteps.length ? `（${explodeSteps.length}）` : tStatus('（未定义 → 径向）', lang)}</div>
            {explodeSteps.map((st, i) => (
              <div key={i} className="jp-row" style={{ fontSize: 11, gap: 4, alignItems: 'center' }}>
                <span style={{ flex: 1 }}>#{i + 1} · {st.ids.length}{tStatus('件', lang)} · {['+X', '−X', '+Y', '−Y', '+Z', '−Z'].find((_, k) => st.dir[k >> 1] === (k % 2 ? -1 : 1) && st.dir.filter((v) => v).length === 1) || '向量'} {st.dist}mm</span>
                <button className="cs-x" title={tStatus('删除此爆炸步', lang)} onClick={() => useApp.getState().removeExplodeStep(i)}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center', marginTop: 3 }}>
              <span style={{ fontSize: 11, color: '#8a939c' }} title={tStatus('浏览器勾选组件后按方向加一步（勾选数）', lang)}>{tStatus('勾选', lang)} {explodeStepChecked.length}</span>
              {(['+X', '−X', '+Y', '−Y', '+Z', '−Z'] as const).map((d, k) => {
                const dir: [number, number, number] = [0, 0, 0]; dir[k >> 1] = k % 2 ? -1 : 1
                return <button key={d} className="cs-x" title={tStatus(`加步：勾选件沿 ${d} 移 30mm`, lang)} onClick={() => useApp.getState().addExplodeStep(explodeStepChecked, dir, 30)}>{d}</button>
              })}
              {explodeSteps.length > 0 && <button className="cs-x" title={tStatus('清除全部步（回径向滑杆）', lang)} onClick={() => useApp.getState().clearExplodeSteps()}>{tStatus('清步', lang)}</button>}
            </div>
            <label className="sb-hint" title={tStatus('引线：各件由原位到爆炸位画虚线', lang)}><input type="checkbox" checked={explodeLeaders} onChange={() => useApp.getState().toggleExplodeLeaders()} /> {tStatus('引线 Leaders', lang)}</label>
          </div>
        </CommandDialog>
      )}

      {/* Fusion 式 ViewCube 旁「Home 小屋仔」（右上角立方左上角）：一键回正等轴测主视图 + 画面置中。对标影片右上角小屋。
          GM-X2 #3：右键小屋 = ViewCube 上下文菜单（回 Home / 投影三态 / 设为前视）—— drei ViewCube 无右键，喺此补返。 */}
      <button title={tStatus('主视图 Home：左键回正等轴测 + 置中；右键 = 视图菜单（投影 / 设为前视）', lang)}
        style={{ position: 'fixed', top: 172, right: 116, width: 26, height: 26, zIndex: 50, background: 'rgba(255,255,255,.94)', border: '1px solid #c4ccd4', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,.14)', color: '#3b6e8f', padding: 0 }}
        onClick={() => { setView('iso'); requestFit() }}
        onContextMenu={(e) => { e.preventDefault(); setCubeMenu((v) => !v) }}>
        <ToolIcon name="home" size={15} />
      </button>
      {cubeMenu && (
        <div className="panel-menu" style={{ position: 'fixed', top: 200, right: 92, zIndex: 130, minWidth: 150 }} onMouseLeave={() => setCubeMenu(false)}>
          <div className="panel-menu-head">{tStatus('ViewCube', lang)}</div>
          <div className="panel-menu-item" onClick={() => { setView('iso'); requestFit(); setCubeMenu(false) }}>🏠 {tStatus('回 Home（等轴测）', lang)}</div>
          <div className="panel-menu-head" style={{ marginTop: 2 }}>{tStatus('投影', lang)}</div>
          {(['ortho', 'persp', 'perspOrtho'] as const).map((p) => (
            <div key={p} className="panel-menu-item" onClick={() => { setCameraProj(p); setCubeMenu(false) }}>{cameraProj === p ? '✓ ' : '　'}{tStatus(p === 'ortho' ? '正交' : p === 'persp' ? '透视' : '透视带正交面', lang)}</div>
          ))}
          <div className="panel-menu-head" style={{ marginTop: 2 }}>{tStatus('设当前为', lang)}</div>
          {/* #174-2：六标准正交视图（补 后/下/左 三反向） */}
          {([['front', '前视图'], ['back', '后视图'], ['top', '上视图'], ['bottom', '下视图'], ['right', '右视图'], ['left', '左视图']] as const).map(([v, lbl]) => (
            <div key={v} className="panel-menu-item" onClick={() => { setView(v); if (cameraProj === 'perspOrtho') useApp.getState().setCameraOrtho(true); setCubeMenu(false) }}>{tStatus(lbl, lang)}</div>
          ))}
        </div>
      )}

      {/* GM-X2 #12/#13：应用偏好模态 + 文档单位对话框 */}
      <PrefsModal />
      <UnitDialog />

      {/* P2 audit：重建警告持久 pill — sweep 导轨退回/taper 退直呢类「幾何照出但打咗折扣」嘅警告以前一闪即逝；
          而家钉喺右下直到下次重建/手动 ✕（诚实：模型同你谂嘅可能唔一样） */}
      {(() => {
        const bw = buildWarns
        if (!bw.length) return null
        return (
          <div className="vp-build-warning">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <b>⚠ {tStatus('重建警告', lang)} ×{bw.length}</b>
              <button className="tb-btn" style={{ padding: '0 5px' }} onClick={() => useApp.getState().dismissBuildWarnings()}>✕</button>
            </div>
            {bw.slice(0, 4).map((w, i) => <div className="vp-build-warning-message" key={i}>{tStatus(w, lang)}</div>)}
            {bw.length > 4 && <div style={{ marginTop: 3, opacity: 0.7 }}>… +{bw.length - 4}</div>}
          </div>
        )
      })()}
      {/* P2 Inspect + GM-X1 #6：干涉检查面板（两步：拣集 → Compute）— 子集 + 含共面 + 逐对体积 + 🔍 + 📋 */}
      {interfPanelOpen && (
        <div className="cmd-palette" style={{ position: 'fixed', right: 12, top: 208, width: 316, zIndex: 70, maxHeight: '62vh', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <b style={{ fontSize: 12 }}>{interfReport ? (interfReport.hits.length ? `⚠ ${tStatus('干涉', lang)} ${interfReport.hits.length} ${lang === 'en' ? 'hit(s)' : '处'}` : `✓ ${tStatus('无干涉', lang)}`) : `🔍 ${tStatus('干涉检查', lang)}`}</b>
            <button className="tb-btn" onClick={() => useApp.getState().setInterfPanelOpen(false)}>✕</button>
          </div>
          {/* GM-X1 #6：拣集 + 含共面（拆自动跑）*/}
          <div style={{ fontSize: 11, color: '#5f6b76', marginBottom: 6, borderBottom: '1px solid #e3e8ec', paddingBottom: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', marginBottom: 4 }} title={tStatus('含共面/接触面：放宽 0.5mm 容差到 0，贴面/共面亦计为干涉（Fusion Include Coincident Faces）', lang)}>
              <input type="checkbox" checked={interfIncludeCoincident} onChange={(e) => useApp.getState().setInterfIncludeCoincident(e.target.checked)} />{tStatus('含共面/接触面', lang)}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span>{interfSubset.length ? tStatus(`子集 ${interfSubset.length} 件`, lang) : tStatus('子集：全部可见件', lang)}</span>
              {checkedComps.length >= 2 && <button className="tb-btn" style={{ fontSize: 10, padding: '0 5px' }} title={tStatus('用浏览器勾选嘅组件做子集', lang)} onClick={() => useApp.setState({ interfSubset: [...checkedComps] })}>{tStatus('用勾选', lang)} {checkedComps.length}</button>}
              {interfSubset.length > 0 && <button className="tb-btn" style={{ fontSize: 10, padding: '0 5px' }} title={tStatus('清空子集（回全部可见件）', lang)} onClick={() => useApp.getState().clearInterfSubset()}>{tStatus('清子集', lang)}</button>}
              <button className="tb-btn" style={{ marginLeft: 'auto', background: '#1572c4', color: '#fff', fontSize: 11 }} title={tStatus('计算干涉（Compute）', lang)} onClick={() => void useApp.getState().checkInterference()}>▶ {tStatus('Compute 计算', lang)}</button>
            </div>
          </div>
          {!interfReport && <div style={{ fontSize: 11, color: '#8a97a2', padding: '4px 0' }}>{tStatus('配置好上面选项后撳「Compute 计算」', lang)}</div>}
          {interfReport && <div style={{ overflowY: 'auto', flex: 1 }}>
            {interfReport.hits.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 2px', borderTop: i ? '1px solid #e3e8ec' : undefined, fontSize: 11 }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${h.a} ∩ ${h.b}`}>{h.a} ∩ {h.b}</span>
                <span style={{ color: '#c9362a', fontWeight: 600, whiteSpace: 'nowrap' }}>{h.vol >= 1000 ? (h.vol / 1000).toFixed(2) + 'cm³' : h.vol.toFixed(1) + 'mm³'}{h.exact ? '' : '≈'}</span>
                <button className="tb-btn" title={tStatus('框到此重叠区', lang)} onClick={() => useApp.getState().requestFitBBox(h.min, h.max)}>🔍</button>
              </div>
            ))}
            {!interfReport.hits.length && <div style={{ fontSize: 11, color: '#5f6b76', padding: '2px 0' }}>{interfReport.comps} {tStatus('个组件实体互不重叠', lang)}</div>}
            {interfReport.gap && <div style={{ fontSize: 11, color: '#5f6b76', marginTop: 5, borderTop: '1px solid #e3e8ec', paddingTop: 4 }}>{tStatus('最近间隙', lang)} ≈ {interfReport.gap.gap.toFixed(2)}mm（{interfReport.gap.a} ↔ {interfReport.gap.b}）</div>}
          </div>}
          {interfReport && <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="tb-btn" style={{ flex: 1 }} title={tStatus('复制文字报告到剪贴板', lang)} onClick={() => useApp.getState().copyInterfReport()}>📋 {tStatus('复制报告', lang)}</button>
            <button className="tb-btn" title={tStatus('清除干涉高亮', lang)} onClick={() => useApp.getState().clearInterf()}>{tStatus('清除高亮', lang)}</button>
          </div>}
        </div>
      )}

      {/* Fusion bottom-center navbar: orbit / pan / zoom (live mouse-mode switch) + fit + 显示▾ + 网格▾ */}
      {/* GM-W5 5.3：框选橡皮筋 — 窗选（左→右）蓝实线 / 跨选（右→左）绿虚线 */}
      {marq && <div style={{ position: 'absolute', left: Math.min(marq.x0, marq.x1), top: Math.min(marq.y0, marq.y1), width: Math.abs(marq.x1 - marq.x0), height: Math.abs(marq.y1 - marq.y0), border: marq.x1 >= marq.x0 ? '1.5px solid #1572c4' : '1.5px dashed #2e9e4f', background: marq.x1 >= marq.x0 ? 'rgba(21,114,196,.08)' : 'rgba(46,158,79,.10)', pointerEvents: 'none', zIndex: 60 }} />}
      {/* GM-X4 #17：套索自由多边形橡皮筋 */}
      {lassoPath && lassoPath.length > 1 && <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 60, width: '100%', height: '100%' }}><polygon points={lassoPath.map((p) => `${p[0]},${p[1]}`).join(' ')} fill="rgba(155,111,196,.10)" stroke="#8b5fbf" strokeWidth={1.5} strokeDasharray="5 4" /></svg>}
      <div ref={navDrag.ref} className={'vp-navbar' + (navDrag.isDragged ? ' vp-hud-dragged' : '') + (navHudCollapsed ? ' vp-hud-collapsed' : '') + (navPop ? ' vp-navbar-menu-open' : '')} style={navDrag.style} aria-label={tStatus('視圖導覽工具列', lang)} title={tStatus('工具過多時可用滑鼠滾輪左右捲動；亦可拖曳工具列位置或收合', lang)} onWheel={(e) => { const el = e.currentTarget; if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { el.scrollLeft += e.deltaY; e.preventDefault() } }}>
        <span className="vp-hud-handle" onPointerDown={navDrag.onPointerDown} title={tStatus('拖動導覽列', lang)}>⋮⋮</span>
        <button className="vp-hud-collapse" type="button" title={navHudCollapsed ? tStatus('展開導覽列', lang) : tStatus('收合導覽列', lang)} onClick={() => setNavHudCollapsed((v) => !v)}>{navHudCollapsed ? '⌃' : '–'}</button>
        {navDrag.isDragged && <button className="vp-hud-reset" type="button" title={tStatus('還原導覽列預設位置', lang)} onClick={navDrag.reset}>↺</button>}
        <button className={'tb-btn' + (navTool === 'orbit' ? ' tb-on' : '')} title={tStatus('环绕：左键旋转视角', lang)} onClick={() => setNavTool('orbit')}><ToolIcon name="orbit" size={17} /></button>
        <button className={'tb-btn' + (navTool === 'pan' ? ' tb-on' : '')} title={tStatus('平移：左键拖动平移视图', lang)} onClick={() => setNavTool('pan')}><ToolIcon name="pan" size={17} /></button>
        <button className={'tb-btn' + (navTool === 'zoom' ? ' tb-on' : '')} title={tStatus('缩放：左键上下拖动缩放', lang)} onClick={() => setNavTool('zoom')}><ToolIcon name="zoom" size={17} /></button>
        <button className={'tb-btn' + (navTool === 'select' ? ' tb-on' : '')} title={tStatus('框选：左键拖框多选组件 — 左→右=窗选（全包先中，蓝实线）；右→左=跨选（相触即中，绿虚线）；Shift=追加。中/右键仍可平移', lang)} onClick={() => setNavTool('select')}><ToolIcon name="select" size={17} /></button>
        <button className="tb-btn" title={tStatus('适应窗口', lang)} onClick={() => requestFit()}><ToolIcon name="fit" size={17} /></button>
        <div style={{ position: 'relative' }}>
          {/* B-rep faces must be recoverable in one click; the full picker beside
              it remains available for hidden-line and wireframe workflows. */}
          <button
            className={'tb-btn' + (visualStyle === 'shadedVisible' ? ' tb-on' : '')}
            aria-label={tStatus('B-rep：實體面加可見邊', lang)}
            title={tStatus('B-rep 實體面 + 可見邊（Fusion 預設顯示；按一下由線框還原）', lang)}
            onClick={() => setVisualStyle('shadedVisible')}
          >▰</button>
          <button data-testid="visual-style-menu-trigger" className={'tb-btn vp-display-menu' + (navPop === 'display' ? ' tb-on' : '')} aria-label={tStatus('顯示方式', lang)} title={tStatus(`顯示方式：${VISUAL_STYLE_LABELS[visualStyle]}。可選實體、實體+可見邊、實體+隱藏邊、線框。`, lang)} onClick={() => setNavPop(navPop === 'display' ? null : 'display')}><ToolIcon name="display" size={17} /><span className="vp-display-label">{tStatus('顯示', lang)}</span><span style={{ fontSize: 9 }}>▾</span></button>
          {navPop === 'display' && (
            <div data-testid="visual-style-picker" data-visual-style={visualStyle} className="panel-menu" style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, zIndex: 120, minWidth: 210, maxHeight: '72vh', overflowY: 'auto' }}>
              {/* GM-X2 #1：6 视觉样式枚举（Ctrl+4..9） */}
              <div className="panel-menu-head">{tStatus('B-rep 视觉样式', lang)}</div>
              {VISUAL_STYLES.map((vs, i) => (
                <button type="button" key={vs} data-testid={`visual-style-${vs}`} className="panel-menu-item" title={`Ctrl+${i + 4}`} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setVisualStyle(vs); setNavPop(null) }}>{visualStyle === vs ? '✓ ' : '　'}{tStatus(VISUAL_STYLE_LABELS[vs], lang)}<span style={{ marginLeft: 'auto', opacity: 0.45, fontSize: 10 }}>Ctrl+{i + 4}</span></button>
              ))}
              <div className="panel-menu-divider" />
              <div className="panel-menu-head">{tStatus('模型外观', lang)}</div>
              <div className="vp-appearance-color" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                <label htmlFor="viewport-body-colour">{tStatus('实体颜色', lang)}</label>
                <input id="viewport-body-colour" data-testid="viewport-body-colour" type="color" aria-label={tStatus('实体颜色', lang)} value={viewportBodyColor}
                  onInput={(e) => setViewportBodyColor(e.currentTarget.value)} onChange={(e) => setViewportBodyColor(e.currentTarget.value)} />
              </div>
              <div className="vp-contrast-swatches" role="group" aria-label={tStatus('高对比颜色预设', lang)} onPointerDown={(e) => e.stopPropagation()}>
                {([
                  ['#4a7296', '高对比蓝灰'],
                  ['#315f87', '深蓝'],
                  ['#5c6874', '石墨灰'],
                ] as const).map(([colour, label]) => (
                  <button type="button" key={colour} data-testid={`body-colour-${colour.slice(1)}`} className={'vp-contrast-swatch' + (viewportBodyColor.toLowerCase() === colour ? ' selected' : '')}
                    title={tStatus(label, lang)} aria-label={tStatus(label, lang)} style={{ backgroundColor: colour }}
                    onClick={(e) => { e.stopPropagation(); setViewportBodyColor(colour) }} />
                ))}
                <button type="button" className="vp-contrast-reset" onClick={(e) => { e.stopPropagation(); setViewportBodyColor('#4a7296') }}>{tStatus('恢复高对比默认', lang)}</button>
              </div>
              {/* GM-X2 #2：相机三态 */}
              <div className="panel-menu-head" style={{ marginTop: 4 }}>{tStatus('相机投影', lang)}</div>
              {(['ortho', 'persp', 'perspOrtho'] as const).map((p) => (
                <div key={p} className="panel-menu-item" title={p === 'perspOrtho' ? tStatus('透视，标准视图时自动吸正交（转动回透视）', lang) : undefined} onClick={() => { setCameraProj(p); setNavPop(null) }}>{cameraProj === p ? '✓ ' : '　'}{tStatus(p === 'ortho' ? '正交' : p === 'persp' ? '透视' : '透视带正交面', lang)}</div>
              ))}
              {/* GM-X2 #6：图形预设 + Effects 表 */}
              <div className="panel-menu-head" style={{ marginTop: 4 }}>{tStatus('图形预设', lang)}</div>
              {(['performance', 'quality', 'custom'] as const).map((p) => (
                <div key={p} className="panel-menu-item" onClick={() => { setGraphicsPreset(p) }}>{graphicsPreset === p ? '✓ ' : '　'}{tStatus(p === 'performance' ? '性能' : p === 'quality' ? '质量' : '自定义', lang)}</div>
              ))}
              <div className="panel-menu-head" style={{ marginTop: 4 }}>{tStatus('效果', lang)}</div>
              <div className="panel-menu-item" title={tStatus('接地阴影：工作模式柔和落地阴影。', lang)} onClick={() => { toggleGroundShadow() }}>{groundShadow ? '✓ ' : '　'}{tStatus('接地阴影', lang)}</div>
              {groundShadow && <div className="panel-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
                <span style={{ opacity: 0.7, minWidth: 52 }}>{tStatus('阴影深浅', lang)}</span>
                <input type="range" min={0.05} max={1} step={0.05} value={groundShadowOpacity} onChange={(e) => useApp.getState().setGroundShadowOpacity(Number(e.target.value))} style={{ width: 72, accentColor: '#1572c4' }} />
                <span style={{ minWidth: 26, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{groundShadowOpacity.toFixed(2)}</span>
              </div>}
              <div className="panel-menu-item" title={tStatus('地面反射：光面反射地板，镜出模型。', lang)} onClick={() => { toggleGroundReflection() }}>{groundReflection ? '✓ ' : '　'}{tStatus('地面反射', lang)}</div>
              <div className="panel-menu-item" title={tStatus('环境光遮蔽 GTAO：缝隙/接触加暗（正交模式下唔生效）。', lang)} onClick={() => { useApp.getState().toggleSsao() }}>{ssaoOn ? '✓ ' : '　'}{tStatus('环境光遮蔽', lang)}{cameraOrtho ? ' ⚠' : ''}</div>
              <div className="panel-menu-item" title={tStatus('渲染模式：HDRI 环境反射 + 软阴影 + ACES。', lang)} onClick={() => { useApp.getState().toggleRenderMode() }}>{renderModeOn ? '✓ ' : '　'}{tStatus('渲染模式', lang)}</div>
              {/* GM-X2 #15：地平面偏移 */}
              <div className="panel-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }} title={tStatus('地平面偏移：上下移接地阴影 / 反射平面（mm）。', lang)} onClick={(e) => e.stopPropagation()}>
                <span style={{ opacity: 0.7, minWidth: 52 }}>{tStatus('地面偏移', lang)}</span>
                <input type="range" min={-200} max={200} step={1} value={groundPlaneOffset} onChange={(e) => useApp.getState().setGroundPlaneOffset(Number(e.target.value))} style={{ width: 72, accentColor: '#1572c4' }} />
                <span style={{ minWidth: 30, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{groundPlaneOffset}</span>
              </div>
            </div>
          )}
        </div>
        {/* GM-X2 #14：标准视图按钮（前/上/右）复用 setView */}
        <button className="tb-btn" title={tStatus('前视图', lang)} onClick={() => { setView('front'); if (cameraProj === 'perspOrtho') useApp.getState().setCameraOrtho(true) }}>前</button>
        <button className="tb-btn" title={tStatus('上视图', lang)} onClick={() => { setView('top'); if (cameraProj === 'perspOrtho') useApp.getState().setCameraOrtho(true) }}>上</button>
        <button className="tb-btn" title={tStatus('右视图', lang)} onClick={() => { setView('right'); if (cameraProj === 'perspOrtho') useApp.getState().setCameraOrtho(true) }}>右</button>
        <button className={'tb-btn' + (cameraOrtho ? ' tb-on' : '')} title={tStatus('📐 正交 / 透视相机（S193）：正交 = 无透视失真，平行边保持平行 — 工程审视 / 对齐 / 截图量度 / 等轴测出图。再撳返回透视。', lang)} style={cameraOrtho ? { background: '#1572c4', color: '#fff' } : undefined} onClick={() => useApp.getState().toggleCameraOrtho()}>📐</button>
        {/* GM-W2 2.2 对标 Fusion：草图模式下收起「渲染/外观/贴图/出图/选择过滤」集群 — 画紧 2D 平面图用唔着，减少非程序员用家眼前 option 数 */}
        {mode !== 'sketch' && (<>
        <button className={'tb-btn' + (renderModeOn ? ' tb-on' : '')} title={tStatus('🌅 渲染模式（T783）：HDRI 环境反射 + 软阴影 + ACES 曝光 — 发布截图/展示用（金属玻璃质感真实）。再撳返回工作模式', lang)} onClick={() => useApp.getState().toggleRenderMode()}>🌅</button>
        <button className={'tb-btn' + (ssao ? ' tb-on' : '')} title={tStatus('🌑 环境光遮蔽 GTAO（S193）：缝隙 / 接触 / 内角 / 凹陷处加暗（接触阴影），立体感同真实感大升 — 发布截图 / 装配审视用。正交模式下唔生效。再撳关。', lang)} style={ssao && !cameraOrtho ? { background: '#3a3050', color: '#fff' } : undefined} disabled={cameraOrtho} onClick={() => useApp.getState().toggleSsao()}>🌑</button>
        {!cameraOrtho && <span title={tStatus('视野角 FOV（S193）：细 = 接近正交、透视失真小（产品出图）；大 = 广角夸张透视（戏剧感 / 局促空间）。默认 28°。', lang)} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#8a97a2', padding: '0 4px' }}>
          <span style={{ opacity: 0.8 }}>FOV</span>
          <input type="range" min={12} max={55} step={1} value={cameraFov} onChange={(e) => useApp.getState().setCameraFov(Number(e.target.value))} style={{ width: 58, accentColor: '#1572c4', cursor: 'ew-resize' }} />
          <span style={{ width: 24, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{cameraFov}°</span>
        </span>}
        <button className={'tb-btn' + (matLibOpen ? ' tb-on' : '')} title={tStatus('📚 外观材质库（S187）：把当前外观（颜色+金属度+粗糙度+纹理）存做具名预设，一击套用 — 对标 Fusion Appearance 收藏。跨文档全局保存。', lang)} onClick={() => useApp.getState().setMatLibOpen(!matLibOpen)}>📚</button>
        <span title={tStatus('实时微调当前实体外观：金属度（0 漫反射→1 金属）/ 粗糙度（0 镜面→1 哑光）—— 脱离预设直接拖（Fusion appearance 滑杆）', lang)} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#8a97a2', padding: '0 4px' }}>
          ⬤<input type="range" min={0} max={1} step={0.02} value={material.metalness} onChange={(e) => useApp.getState().setMatProp('metalness', Number(e.target.value))} title={tStatus('金属度', lang) + ' ' + material.metalness.toFixed(2)} style={{ width: 50 }} />
          ◗<input type="range" min={0} max={1} step={0.02} value={material.roughness} onChange={(e) => useApp.getState().setMatProp('roughness', Number(e.target.value))} title={tStatus('粗糙度', lang) + ' ' + material.roughness.toFixed(2)} style={{ width: 50 }} />
        </span>
        <span title={tStatus('图片贴图（S192）：载入 PNG/JPG 当贴图套上活动实体（三平面投影 — 无 UV 缝，唔使展 UV）。logo/木纹照片/布料/标签都得。调「纹理尺度」改重复密度', lang)} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#8a97a2', padding: '0 4px' }}>
          <label className="tb-btn" style={{ cursor: 'pointer' }} title={tStatus('载入图片贴图', lang)}>🖼贴图<input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => useApp.getState().setBodyImageTexture(String(rd.result)); rd.readAsDataURL(f); e.currentTarget.value = '' }} /></label>
          <label className="tb-btn" style={{ cursor: 'pointer' }} title={tStatus('载入法线贴图（凹凸细节：拉丝/皮纹/编织 — 三平面投影，同纹理尺度共用重复密度）', lang)}>🧿法线<input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => useApp.getState().setBodyNormalMap(String(rd.result)); rd.readAsDataURL(f); e.currentTarget.value = '' }} /></label>
          {useApp.getState().material.normalUrl && <button className="tb-btn" title={tStatus('清除法线贴图', lang)} onClick={() => useApp.getState().setBodyNormalMap(null)}>✕N</button>}
          <label className="tb-btn" style={{ cursor: 'pointer', background: decalArmed ? '#1572c4' : undefined, color: decalArmed ? '#fff' : undefined }} title={tStatus('贴花 Decal：载入 logo/标签图片 → 点击实体面放置（对标 Fusion Appearance Decal；随项目存档）', lang)}>🏷贴花<input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => useApp.getState().startDecalPick(String(rd.result)); rd.readAsDataURL(f); e.currentTarget.value = '' }} /></label>
          {decalArmed && <button className="tb-btn" title={tStatus('取消贴花放置', lang)} onClick={() => useApp.getState().cancelDecalPick()}>✕</button>}
          {lastDecal && <>
            <input type="range" min={2} max={200} step={1} value={Math.round(lastDecal.size)} onChange={(e) => useApp.getState().setDecalSize(lastDecal.id, Number(e.target.value))} title={tStatus('贴花大小 (mm)', lang) + ' ' + Math.round(lastDecal.size)} style={{ width: 46 }} />
            <button className="tb-btn" title={tStatus('旋转贴花 +45°', lang)} onClick={() => useApp.getState().setDecalRot(lastDecal.id, (lastDecal.rot + Math.PI / 4) % (Math.PI * 2))}>⟳</button>
            {/* GM-X3 #5：Decal 逐项字段 —— 非等比 W/H · 透明 · U/V 位置 · H/V 翻转 · 锁比例 · 链面 */}
            <label className="sb-hint" title={tStatus('非等比 宽 W / 高 H (mm，覆盖大小)', lang)}>W<input type="number" min={1} max={500} value={Math.round(lastDecal.w ?? lastDecal.size)} onChange={(e) => useApp.getState().updateDecal(lastDecal.id, { w: Number(e.target.value) || lastDecal.size })} style={{ width: 40 }} />H<input type="number" min={1} max={500} value={Math.round(lastDecal.h ?? lastDecal.size)} onChange={(e) => useApp.getState().updateDecal(lastDecal.id, { h: Number(e.target.value) || lastDecal.size })} style={{ width: 40 }} /></label>
            <input type="range" min={0.05} max={1} step={0.05} value={lastDecal.opacity ?? 1} onChange={(e) => useApp.getState().updateDecal(lastDecal.id, { opacity: Number(e.target.value) })} title={tStatus('透明度', lang)} style={{ width: 42 }} />
            <label className="sb-hint" title={tStatus('U / V 位置偏移 (mm)', lang)}>U<input type="number" step={1} value={Math.round(lastDecal.u ?? 0)} onChange={(e) => useApp.getState().updateDecal(lastDecal.id, { u: Number(e.target.value) || 0 })} style={{ width: 36 }} />V<input type="number" step={1} value={Math.round(lastDecal.v ?? 0)} onChange={(e) => useApp.getState().updateDecal(lastDecal.id, { v: Number(e.target.value) || 0 })} style={{ width: 36 }} /></label>
            <button className="tb-btn" style={{ background: lastDecal.flipH ? '#1572c4' : undefined, color: lastDecal.flipH ? '#fff' : undefined }} title={tStatus('水平翻转', lang)} onClick={() => useApp.getState().updateDecal(lastDecal.id, { flipH: !lastDecal.flipH })}>⇄</button>
            <button className="tb-btn" style={{ background: lastDecal.flipV ? '#1572c4' : undefined, color: lastDecal.flipV ? '#fff' : undefined }} title={tStatus('垂直翻转', lang)} onClick={() => useApp.getState().updateDecal(lastDecal.id, { flipV: !lastDecal.flipV })}>⇅</button>
            <label className="sb-hint" title={tStatus('链面（跨相邻面包覆）', lang)}><input type="checkbox" checked={!!lastDecal.chainFaces} onChange={(e) => useApp.getState().updateDecal(lastDecal.id, { chainFaces: e.target.checked })} />链面</label>
            <button className="tb-btn" title={tStatus('删除最后一个贴花', lang)} onClick={() => useApp.getState().removeDecal(lastDecal.id)}>✕{useApp.getState().decals.length}</button>
          </>}
          {material.imageUrl && <>
            <input type="range" min={2} max={120} step={1} value={Math.round(material.texScale || 30)} onChange={(e) => useApp.getState().setBodyTexture(material.tex || '', Number(e.target.value))} title={tStatus('纹理尺度（mm 重复）', lang)} style={{ width: 46 }} />
            <button className="tb-btn" title={tStatus('清除图片贴图', lang)} onClick={() => useApp.getState().setBodyImageTexture(null)}>✕</button>
          </>}
        </span>
        <span title={tStatus('工作模式背景：渐变/纯色影棚底（工作模式 + 截图都用），无=透明（默认灰底）', lang)} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#8a97a2', padding: '0 4px' }}>🖼<select value={bgPreset} onChange={(e) => setBgPreset(e.target.value)} title={tStatus('背景预设', lang)} style={{ fontSize: 11, maxWidth: 88 }}>
          <option value="">{tStatus('无', lang)}</option>
          <option value="coolgrey">{tStatus('冷灰', lang)}</option>
          <option value="warmstudio">{tStatus('暖棚', lang)}</option>
          <option value="blueprint">{tStatus('蓝图', lang)}</option>
          <option value="whitesweep">{tStatus('白扫光', lang)}</option>
          <option value="solid">{tStatus('纯色', lang)}</option>
        </select></span>
        {renderModeOn && <span title="渲染曝光（ACES tone-mapping）：调亮暗" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#8a97a2', padding: '0 4px' }}>☀<input type="range" min={0.2} max={3} step={0.05} value={renderExposure} onChange={(e) => useApp.getState().setRenderExposure(Number(e.target.value))} style={{ width: 60 }} />{renderExposure.toFixed(2)}</span>}
        {renderModeOn && <span title="HDRI 环境（S109）：真实照片级环境光照 + 反射（Poly Haven CC0）— 关=内置影棚" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#8a97a2', padding: '0 4px' }}>🌐<select value={hdriPreset} onChange={(e) => useApp.getState().setHdriPreset(e.target.value)} title="HDRI 环境预设（CC0）" style={{ fontSize: 11, maxWidth: 96 }}><option value="">影棚(内置)</option>{HDRI_PRESETS.map((p) => <option key={p.id} value={p.id} title={p.hint}>{p.label}</option>)}</select>{hdriPreset !== '' && <input type="range" min={0.1} max={3} step={0.1} value={hdriIntensity} onChange={(e) => useApp.getState().setHdriIntensity(Number(e.target.value))} title="HDRI 强度" style={{ width: 46 }} />}{hdriPreset !== '' && <span title={`HDRI 环境旋转 ${Math.round(hdriRotation * 57.2958)}°（绕 Y 轴定向环境光照/反射，对标 Fusion 环境旋转）`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>↻<input type="range" min={0} max={Math.PI * 2} step={0.05} value={hdriRotation} onChange={(e) => useApp.getState().setHdriRotation(Number(e.target.value))} style={{ width: 46 }} /></span>}</span>}
        <button className={'tb-btn' + (rtMode ? ' tb-on' : '')} title={tStatus('🔆 画布内光追（S105）：渐进路径追踪 — 全局光照 + 真反射/折射 + 软阴影 + 焦散（对标 Fusion In-canvas Render）。静置等收敛，相机一动重新累积。注：唔渲染程序化纹理/检视着色', lang)} onClick={() => useApp.getState().toggleRtMode()}>🔆</button>
        {rtMode && <span title={tStatus('路径追踪采样数：越高越干净越慢（拖动滑杆调上限）', lang)} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#8a97a2', padding: '0 4px' }}>{tStatus('采样', lang)}<input type="range" min={16} max={1024} step={16} value={rtSamples} onChange={(e) => useApp.getState().setRtSamples(Number(e.target.value))} style={{ width: 60 }} />{rtProgress}/{rtSamples}</span>}
        <span title={tStatus('📷 高清出图（S192）：离屏超采样渲染当前视图为 PNG（1×/2×/4× 远超视口分辨率，MSAA 抗锯齿）+ 可勾透明背景（贴 alpha 合成）。发布 / 产品图用，胜过普通视口截图', lang)} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#8a97a2', padding: '0 4px' }}>
          <button className="tb-btn" title={tStatus('出高清 PNG', lang)} onClick={() => useApp.getState().requestStill()}>📷</button>
          <select value={exportScale} onChange={(e) => useApp.getState().setExportScale(Number(e.target.value))} title={tStatus('出图倍率', lang)} style={{ fontSize: 11 }}><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 2, cursor: 'pointer' }} title={tStatus('透明背景 PNG（alpha）', lang)}><input type="checkbox" checked={exportTransparent} onChange={(e) => useApp.getState().setExportTransparent(e.target.checked)} />{tStatus('透明', lang)}</label>
        </span>
        <button className="tb-btn" title={tStatus('🎬 转盘动画（T783）：录 6 秒 360° 环绕 WebM 视频自动下载 — 发 Printables / 社交平台', lang)} onClick={() => useApp.getState().setRecordReq('turntable')}>🎬</button>
        {compCountNav >= 2 && <button className="tb-btn" title={tStatus('💥 爆炸动画：录 4 秒爆炸开合 WebM 视频（装配说明 / 展示）', lang)} onClick={() => useApp.getState().setRecordReq('explode')}>💥</button>}
        {(compCountNav >= 1 || !!bodyMesh) && (
          <div style={{ position: 'relative', marginLeft: 4 }}>
            {/* GM-X4 #13/#14/#15/#17/#19：选择过滤器面板 — 逐类型勾选 + 优先级 + 穿透 + Select-All + 套索 + By-Name/Size/Invert */}
            <button className={'tb-btn' + (navPop === 'selfilter' || lassoMode || !isDefaultSelFilterUI ? ' tb-on' : '')} title={tStatus('选择过滤器：优先级(体/面/边) · 逐类型勾选 · 穿透 · 套索 · 按名/尺寸/反选', lang)} onClick={() => setNavPop(navPop === 'selfilter' ? null : 'selfilter')}>🎯▾</button>
            {navPop === 'selfilter' && (
              <div className="panel-menu" style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: 6, zIndex: 120, minWidth: 214 }}>
                <div className="panel-menu-item" style={{ fontSize: 11, opacity: 0.6, cursor: 'default' }} onClick={(e) => e.stopPropagation()}>{tStatus('选择优先级', lang)}</div>
                <div style={{ display: 'flex', gap: 4, padding: '2px 8px 6px' }} onClick={(e) => e.stopPropagation()}>
                  {(['body', 'face', 'edge'] as const).map((p) => (
                    <button key={p} className={'tb-btn' + (selFilter.priority === p ? ' tb-on' : '')} style={{ flex: 1, fontSize: 11 }} title={tStatus(p === 'body' ? '实体优先' : p === 'face' ? '面优先' : '边优先', lang)} onClick={() => useApp.getState().setSelPriority(p)}>{tStatus(p === 'body' ? '体' : p === 'face' ? '面' : '边', lang)}</button>
                  ))}
                </div>
                <div className="panel-menu-item" style={{ fontSize: 11, opacity: 0.6, cursor: 'default', display: 'flex', justifyContent: 'space-between' }} onClick={(e) => e.stopPropagation()}>
                  <span>{tStatus('可拣类型', lang)}</span>
                  <span style={{ display: 'inline-flex', gap: 6 }}>
                    <span style={{ cursor: 'pointer', color: '#1572c4' }} title={tStatus('全选类型', lang)} onClick={() => useApp.getState().selectAllSelTypes()}>{tStatus('全选', lang)}</span>
                    <span style={{ cursor: 'pointer', color: '#8a97a2' }} title={tStatus('清空类型', lang)} onClick={() => useApp.getState().clearSelTypes()}>{tStatus('清空', lang)}</span>
                  </span>
                </div>
                {SEL_TYPES.map((t) => (
                  <label key={t.key} className="panel-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selFilter.types.includes(t.key)} onChange={() => useApp.getState().toggleSelType(t.key)} />{tStatus(t.label, lang)}
                  </label>
                ))}
                <div className="panel-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); useApp.getState().toggleSelectThrough() }} title={tStatus('穿透选择：单击时连被遮挡组件一齐拣入选择集（框选/套索本就穿透）', lang)}>
                  <input type="checkbox" readOnly checked={selFilter.selectThrough} />{tStatus('穿透选择（拣遮挡）', lang)}
                </div>
                {compCountNav >= 1 && <>
                  <div style={{ height: 1, background: '#e6e9ee', margin: '4px 6px' }} />
                  <div className="panel-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); useApp.getState().toggleLassoMode() }} title={tStatus('套索：拖自由多边形框选组件', lang)}>
                    <input type="checkbox" readOnly checked={lassoMode} />{tStatus('套索选择模式', lang)}
                  </div>
                  <div className="panel-menu-item" onClick={() => { useApp.getState().selectAllComps() }}>{tStatus('全选组件', lang)}</div>
                  <div className="panel-menu-item" onClick={() => { useApp.getState().invertCompSelection() }}>{tStatus('反选组件', lang)}</div>
                  <div className="panel-menu-item" onClick={async () => { const v = await useApp.getState().appPrompt(tStatus('按名选择组件（支持 * ? 通配，大小写不敏感）', lang), '*'); if (v != null) useApp.getState().selectCompsByName(v) }}>{tStatus('按名选择…', lang)}</div>
                  <div className="panel-menu-item" onClick={async () => { const v = await useApp.getState().appPrompt(tStatus('按尺寸选择：比较符 阈值mm³（包围盒体积）\n例 > 1000 = 大于 1000mm³；< 500 / >= 250 / ~ 800(±10%)', lang), '> 1000'); if (v == null) return; const m = v.trim().match(/^(>=|<=|~|>|<)\s*([0-9.eE+-]+)$/); if (!m) { await useApp.getState().appAlert(tStatus('格式：比较符 数字（例 > 1000）', lang)); return } useApp.getState().selectCompsBySize(m[1] as '>' | '<' | '>=' | '<=' | '~', Number(m[2]), false) }}>{tStatus('按尺寸选择…', lang)}</div>
                </>}
              </div>
            )}
          </div>
        )}
        </>)}{/* GM-W2 2.2 草图收纳集群结束 */}
        <div style={{ position: 'relative' }}>
          <button className={'tb-btn' + (navPop === 'grid' ? ' tb-on' : '')} title={tStatus('网格设置：显示 / 自适应 / 主间距 / 次分格 / 参考数字', lang)} onClick={() => setNavPop(navPop === 'grid' ? null : 'grid')}><ToolIcon name="grid" size={17} /><span style={{ fontSize: 9 }}>▾</span></button>
          {navPop === 'grid' && (
            <div className="panel-menu" style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, zIndex: 120, minWidth: 210 }}>
              <div className="panel-menu-item" onClick={() => { toggleGrid() }}>{showGrid ? '✓ ' : '　'}{tStatus('显示网格', lang)}</div>
              {/* GM-X2 #4：自适应 / 固定 */}
              <div className="panel-menu-item" title={tStatus('自适应：网格随缩放自动缩放。', lang)} onClick={() => setGridConfig({ adaptive: true })}>{gridAdaptive ? '● ' : '○ '}{tStatus('自适应', lang)}</div>
              <div className="panel-menu-item" title={tStatus('固定：主间距 + 次分格。', lang)} onClick={() => setGridConfig({ adaptive: false })}>{!gridAdaptive ? '● ' : '○ '}{tStatus('固定间距', lang)}</div>
              {!gridAdaptive && <div className="panel-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
                <span style={{ opacity: 0.7, minWidth: 52 }}>{tStatus('主间距', lang)}</span>
                <input type="number" min={1} step={5} value={gridSpacing} onChange={(e) => setGridConfig({ spacing: Number(e.target.value) })} style={{ width: 64, fontSize: 11 }} />mm
              </div>}
              {!gridAdaptive && <div className="panel-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
                <span style={{ opacity: 0.7, minWidth: 52 }}>{tStatus('次分格', lang)}</span>
                <input type="number" min={1} max={50} step={1} value={gridSubdiv} onChange={(e) => setGridConfig({ subdiv: Number(e.target.value) })} style={{ width: 64, fontSize: 11 }} />
              </div>}
              <div className="panel-menu-item" title={tStatus('参考数字：沿网格轴标注刻度值。', lang)} onClick={() => setGridConfig({ refNumbers: !gridRefNumbers })}>{gridRefNumbers ? '✓ ' : '　'}{tStatus('参考数字', lang)}</div>
            </div>
          )}
        </div>
        {/* GM-X2 #8：Object Visibility 主开关（全部草图 / 原点/构造面 / 轴 / 关节） */}
        <div style={{ position: 'relative' }}>
          <button className={'tb-btn' + (navPop === 'objvis' ? ' tb-on' : '')} title={tStatus('对象可见性：全部草图 / 原点面 / 构造轴 / 关节 主开关', lang)} onClick={() => setNavPop(navPop === 'objvis' ? null : 'objvis')}>👁▾</button>
          {navPop === 'objvis' && (
            <div className="panel-menu" style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, zIndex: 120, minWidth: 170 }}>
              <div className="panel-menu-head">{tStatus('对象可见性', lang)}</div>
              {(['sketches', 'planes', 'axes', 'joints'] as const).map((k) => (
                <div key={k} className="panel-menu-item" onClick={() => setObjectVis(k, !objectVis[k])}>{objectVis[k] ? '👁 ' : '🙈 '}{tStatus(k === 'sketches' ? '全部草图' : k === 'planes' ? '原点/构造面' : k === 'axes' ? '构造轴' : '关节', lang)}</div>
              ))}
            </div>
          )}
        </div>
        {/* GM-X2 #12：应用偏好（Preferences） */}
        <button className="tb-btn" title={tStatus('应用偏好：主题 / 默认单位 / 自动正视草图 / 缩放方向 / 动画过渡…', lang)} onClick={() => setPrefsOpen(true)}>⚙</button>
        {/* Fusion Viewport Layout: kept beside display/grid controls, matching the lower navigation bar. */}
        <div style={{ position: 'relative' }}>
          <button className={'tb-btn' + (navPop === 'layout' ? ' tb-on' : '')} title={tStatus('视口版面：单视图／二视图／四视图（Fusion Viewport Layout）', lang)} onClick={() => setNavPop(navPop === 'layout' ? null : 'layout')}><ToolIcon name="grid" size={17} /><span style={{ fontSize: 9 }}>▾</span></button>
          {navPop === 'layout' && <div className="panel-menu" style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: 6, zIndex: 120, minWidth: 180 }}>
            {([['single', '单一视图'], ['split', '二视图（前／右）'], ['quad', '四视图（上／前／右／等角）']] as const).map(([key, label]) => <div key={key} className="panel-menu-item" onClick={() => { setViewLayout(key); setNavPop(null) }}>{viewLayout === key ? '● ' : '○ '}{tStatus(label, lang)}</div>)}
          </div>}
        </div>
        {/* GM-X2 #16：全屏 */}
        <button className="tb-btn" title={tStatus('全屏 (Ctrl+Shift+F)', lang)} onClick={() => { try { const el = document.documentElement; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen() } catch { /* 不支持 */ } }}>⛶⛶</button>
        {/* 相机书签（视图书签 / Named Views，Fusion 同款）：存当前任意 orbit 起名、一键跳返 */}
        <div style={{ position: 'relative' }}>
          <button className={'tb-btn' + (navPop === 'views' ? ' tb-on' : '')} title={tStatus('视图书签：存当前任意视角起名，一键跳返（Fusion Named Views）', lang)} onClick={() => setNavPop(navPop === 'views' ? null : 'views')}>📑▾</button>
          {navPop === 'views' && (
            <div className="panel-menu" style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: 6, zIndex: 120, minWidth: 150, maxHeight: 280, overflowY: 'auto' }}>
              <div className="panel-menu-item" title={tStatus('捕捉当前相机位置/朝向存为书签', lang)} onClick={() => { const cap = (window as unknown as { __captureView?: () => { pos: [number, number, number]; target: [number, number, number] } }).__captureView; if (!cap) { setNavPop(null); return } const v = cap(); const name = window.prompt(tStatus('视图书签名', lang), `视图${viewBookmarks.length + 1}`); if (name == null) return; useApp.getState().saveViewBookmark(name.trim() || `视图${viewBookmarks.length + 1}`, v.pos, v.target); setNavPop(null) }}>{tStatus('➕ 存当前视图', lang)}</div>
              {viewBookmarks.length === 0 && <div className="panel-menu-item" style={{ color: '#8a97a2', cursor: 'default' }}>{tStatus('（未有书签）', lang)}</div>}
              {viewBookmarks.map((b, i) => (
                <div key={'VBM' + i} className="panel-menu-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }} title={tStatus('点跳到此视图', lang)} onClick={() => { useApp.getState().applyViewBookmark(i); setNavPop(null) }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📷 {b.name}</span>
                  <span style={{ color: '#c0563f', flexShrink: 0 }} title={tStatus('删除此书签', lang)} onClick={(e) => { e.stopPropagation(); useApp.getState().deleteViewBookmark(i) }}>✕</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {busy && <div className="vp-busy">⏳ {tStatus(status, lang)}</div>}
      {(measureMode || measureEdgeMode || measureFaceMode || measureAngleMode) && (
        <div className="info-card" style={{ position: 'fixed', top: 150, right: 20, width: 230, padding: '12px 14px', zIndex: 200, fontSize: 13 }}>{/* GM-G4b：测量浮卡 → .info-card 共用 token */}
          {measureMode && (<>
            <div style={{ fontWeight: 700, color: '#7fd1b9', marginBottom: 6 }}>{tStatus('📏 两点测量', lang)}</div>
            {measureDist != null ? (<>
              <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.05 }}>{fmtLen(measureDist, unit)}</div>
              {measurePts.length === 2 && (() => { const a = measurePts[0], b = measurePts[1]; const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[2] - a[2]), dz = Math.abs(b[1] - a[1]); const horiz = Math.hypot(b[0] - a[0], b[2] - a[2]); const elev = Math.abs(horiz) > 1e-6 || dz > 1e-6 ? Math.atan2(b[1] - a[1], horiz) * 180 / Math.PI : 0; return <div style={{ marginTop: 7, fontSize: 12, color: '#9fb2bf' }}>ΔX {fmtLen(dx, unit)}　ΔY {fmtLen(dy, unit)}　ΔZ {fmtLen(dz, unit)}<br />{tStatus('仰角', lang)} {elev.toFixed(1)}°{tStatus('（连线对水平面）', lang)}</div> })()}
            </>) : <div style={{ fontSize: 12, color: '#9fb2bf' }}>{tStatus('点实体上两点量距离', lang)}</div>}
          </>)}
          {measureEdgeMode && (<>
            <div style={{ fontWeight: 700, color: '#7fd1b9', marginBottom: 6 }}>{tStatus('📐 量边 / 孔径', lang)}</div>
            <div style={{ fontSize: 14, lineHeight: 1.4 }}>{measureEdgeInfo || tStatus('点实体的一条棱（圆孔棱显示 Ø）', lang)}</div>
          </>)}
          {measureFaceMode && (<>
            <div style={{ fontWeight: 700, color: '#7fd1b9', marginBottom: 6 }}>{tStatus('▦ 量面', lang)}</div>
            <div style={{ fontSize: 14, lineHeight: 1.4 }}>{measureFaceInfo || tStatus('点实体的一个面（显示面积/类型）', lang)}</div>
          </>)}
          {measureAngleMode && (<>
            <div style={{ fontWeight: 700, color: '#7fd1b9', marginBottom: 6 }}>{tStatus('∠ 量角', lang)}</div>
            <div style={{ fontSize: 14, lineHeight: 1.4 }}>{measureAngleInfo || tStatus('依次点两个面量夹角', lang)}</div>
          </>)}
        </div>
      )}
      {/* GM-X1 #1/#2/#3/#4：统一 Measure 面板 — 选择过滤（面/边/体） + 上下文读数 + 精度 + 副单位 */}
      {measureUniMode && (
        <div className="info-card" style={{ position: 'fixed', top: 150, right: 20, width: 250, padding: '12px 14px', zIndex: 200, fontSize: 13 }}>
          <div className="info-card-head">
            <span style={{ color: '#7fd1b9', fontWeight: 700 }}>{tStatus('📐 统一测量', lang)}</span>
            <span className="info-card-x" title={tStatus('退出统一测量', lang)} onClick={() => useApp.getState().toggleMeasureUni()}>✕</span>
          </div>
          {/* 选择过滤（Fusion Measure 面板顶：拣面/边/体） */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }} title={tStatus('选择过滤：限制点击可拾取嘅实体类型（Alt+点 = 优先量边）', lang)}>
            {(['face', 'edge', 'body'] as const).map((f) => (
              <button key={f} type="button" onClick={() => useApp.getState().setMeasureSelFilter({ [f]: !measureSelFilter[f] })}
                style={{ flex: 1, padding: '3px 0', fontSize: 11, borderRadius: 3, cursor: 'pointer', border: measureSelFilter[f] ? '1px solid #4a9eff' : '1px solid #3a3e44', background: measureSelFilter[f] ? '#1e3a5f' : '#23272d', color: '#d8dde2' }}>
                {f === 'face' ? tStatus('面', lang) : f === 'edge' ? tStatus('边', lang) : tStatus('体', lang)}
              </button>
            ))}
          </div>
          {/* 上下文读数 */}
          {(() => {
            const r = measureUniResult
            if (!r || r.type === 'empty') return <div style={{ fontSize: 12, color: '#9fb2bf' }}>{tStatus('点任意实体（面/边/点，最多 2 个）→ 自动读数', lang)}</div>
            const fmtV = () => {
              if (r.value == null) return r.type === 'point' && r.delta ? `(${r.delta.map((c) => fmtLen(c, unit, measurePrecision, secondaryUnit)).join(', ')})` : (r.note || tStatus('继续点第二个实体', lang))
              if (r.valueUnit === 'len') return fmtLen(r.value, unit, measurePrecision, secondaryUnit)
              if (r.valueUnit === 'area') return fmtArea(r.value, unit, measurePrecision, secondaryUnit)
              if (r.valueUnit === 'angle') return `${r.value.toFixed(measurePrecision == null ? 2 : measurePrecision)}°`
              return String(r.value)
            }
            return <>
              <div style={{ color: '#9fb2bf', fontSize: 11 }}>{tStatus(r.label, lang)}</div>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{fmtV()}</div>
              {r.type === 'angle' && r.supplement != null && <div style={{ fontSize: 11, color: '#9fb2bf' }}>{tStatus('补角', lang)} {r.supplement.toFixed(2)}°</div>}
              {r.type === 'distance' && r.delta && <div style={{ marginTop: 4, fontSize: 11, color: '#9fb2bf' }}>ΔX {fmtLen(r.delta[0], unit, measurePrecision, secondaryUnit)}　ΔY {fmtLen(r.delta[1], unit, measurePrecision, secondaryUnit)}　ΔZ {fmtLen(r.delta[2], unit, measurePrecision, secondaryUnit)}</div>}
              {r.parts.length > 0 && <div style={{ marginTop: 4, fontSize: 11, color: '#7d8b96' }}>{r.parts.map((p, i) => <span key={i}>{tStatus(p.label, lang)}{p.value != null ? ` ${p.kindUnit === 'area' ? fmtArea(p.value, unit, measurePrecision, secondaryUnit) : fmtLen(p.value, unit, measurePrecision, secondaryUnit)}` : ''}{i < r.parts.length - 1 ? ' · ' : ''}</span>)}</div>}
              {r.note && <div style={{ marginTop: 3, fontSize: 10, color: '#8a7d5a' }}>{tStatus(r.note, lang)}</div>}
            </>
          })()}
          {/* 精度 + 副单位 + 清空 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, flexWrap: 'wrap', fontSize: 11 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }} title={tStatus('精度：小数位数（0..8；默认跟单位）', lang)}>{tStatus('精度', lang)}
              <select value={measurePrecision == null ? '' : String(measurePrecision)} onChange={(e) => useApp.getState().setMeasurePrecision(e.target.value === '' ? null : Number(e.target.value))} style={{ fontSize: 11 }}>
                <option value="">{tStatus('默认', lang)}</option>{[0, 1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }} title={tStatus('副单位：并列显示第二单位系（如 inch）', lang)}>{tStatus('副单位', lang)}
              <select value={secondaryUnit || ''} onChange={(e) => useApp.getState().setSecondaryUnit((e.target.value || null) as 'mm' | 'cm' | 'inch' | null)} style={{ fontSize: 11 }}>
                <option value="">{tStatus('无', lang)}</option><option value="mm">mm</option><option value="cm">cm</option><option value="inch">in</option>
              </select>
            </label>
            <button className="tb-btn" style={{ fontSize: 11, padding: '1px 6px' }} disabled={!measureUniPicks.length} title={tStatus('清空拾取', lang)} onClick={() => useApp.getState().clearMeasureUniPicks()}>{tStatus('清空', lang)} {measureUniPicks.length}</button>
          </div>
          {/* #174-6：Show Snap Points — 显示活动实体特征边端点/中点捕捉标记（橙点） */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 11, cursor: 'pointer' }} title={tStatus('显示可捕捉点（特征边端点/中点）', lang)}>
            <input type="checkbox" checked={measureSnapMarkers} onChange={() => useApp.getState().toggleMeasureSnapMarkers()} />
            {tStatus('显示捕捉点', lang)}
          </label>
        </div>
      )}
      {/* GM-X1 #10：模态 Properties 对话框（面积/密度/质量/体积/材质/包围盒/质心/惯性 + 精度 + 坐标切换 + 复制） */}
      {propsDialog && propsDialogData && (
        <div className="cmd-palette" style={{ position: 'fixed', right: 12, top: 150, width: 320, zIndex: 210, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <b style={{ fontSize: 13 }}>⚖ {tStatus('物理属性', lang)}</b>
            <button className="tb-btn" title={tStatus('关闭', lang)} onClick={() => useApp.getState().closePropertiesDialog()}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, fontSize: 11 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} title={tStatus('精度：网格细分档（低/中/高 → 影响质量/惯性收敛）', lang)}>{tStatus('精度', lang)}
              <select value={propsDialog.accuracy} onChange={(e) => useApp.getState().setPropsAccuracy(e.target.value as 'low' | 'med' | 'high')} style={{ fontSize: 11 }}>
                <option value="low">{tStatus('低', lang)}</option><option value="med">{tStatus('中', lang)}</option><option value="high">{tStatus('高', lang)}</option>
              </select>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} title={tStatus('坐标系：惯性张量参考 世界(原点) / COM(质心)', lang)}>{tStatus('坐标', lang)}
              <select value={propsDialog.frame} onChange={(e) => useApp.getState().setPropsFrame(e.target.value as 'world' | 'com')} style={{ fontSize: 11 }}>
                <option value="com">{tStatus('质心 COM', lang)}</option><option value="world">{tStatus('世界/原点', lang)}</option>
              </select>
            </label>
          </div>
          <div style={{ overflowY: 'auto', flex: 1, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', fontSize: 12, lineHeight: 1.4 }}>
            {propsDialogData.rows.map((row, i) => (
              <Fragment key={i}>
                <span style={{ color: '#8a97a2' }}>{tStatus(row.label, lang)}</span>
                <b style={{ overflowWrap: 'anywhere' }}>{row.value}</b>
              </Fragment>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="tb-btn" style={{ flex: 1 }} title={tStatus('复制物理属性文本到剪贴板', lang)} onClick={() => useApp.getState().copyPropsReport()}>📋 {tStatus('复制到剪贴板', lang)}</button>
          </div>
        </div>
      )}
      {/* S118：拔模分析面板 — 脱模方向切换 + 图例 + 统计（开后显示） */}
      {draftResult && (
        <div className="info-card" style={{ position: 'fixed', top: 150, right: 20, width: 234, padding: '12px 14px', zIndex: 200, fontSize: 12 }}>{/* GM-G4b：拔模分析浮卡 → .info-card 共用 token */}
          <div className="info-card-head">
            <span style={{ color: '#7fd1b9' }}>{tStatus('📐 拔模分析', lang)}</span>
            <span className="info-card-x" onClick={() => useApp.getState().clearDraftAnalysis()} title={tStatus('关闭拔模分析', lang)}>✕</span>
          </div>
          <div style={{ marginBottom: 6, color: '#9fb2bf' }}>{tStatus('脱模方向（动模拉出）：', lang)}</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {([['X', [1, 0, 0]], ['Y', [0, 1, 0]], ['Z', [0, 0, 1]], ['−Z', [0, 0, -1]]] as [string, [number, number, number]][]).map(([lab, dir]) => {
              const on = Math.abs(draftPull[0] - dir[0]) < 1e-6 && Math.abs(draftPull[1] - dir[1]) < 1e-6 && Math.abs(draftPull[2] - dir[2]) < 1e-6
              return <button key={lab} type="button" onClick={() => useApp.getState().runDraftAnalysis(dir)} style={{ flex: 1, padding: '3px 0', fontSize: 11, borderRadius: 3, cursor: 'pointer', border: on ? '1px solid #4a9eff' : '1px solid #3a3e44', background: on ? '#1e3a5f' : '#23272d', color: '#d8dde2' }}>{lab}</button>
            })}
          </div>
          <label title={tStatus('自订脱模方向：输入任意非零 XYZ 向量；会自动归一化。', lang)} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8, color: '#9fb2bf' }}>
            {tStatus('自订方向', lang)}
            {([0, 1, 2] as const).map((i) => <input key={i} aria-label={tStatus(`脱模方向 ${'XYZ'[i]}`, lang)} type="number" step={0.1} value={Number(draftPull[i].toFixed(4))} onChange={(e) => { const next: [number, number, number] = [...draftPull] as [number, number, number]; next[i] = Number(e.target.value); useApp.getState().runDraftAnalysis(next) }} style={{ width: 42, minWidth: 0, height: 23, boxSizing: 'border-box' }} />)}
          </label>
          {/* #174-4：逐三角连续梯度着色开关（睇面内渐变，补足逐面平均掩盖最差点） */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, cursor: 'pointer', color: '#9fb2bf' }}>
            <input type="checkbox" checked={draftGradient} onChange={() => useApp.getState().toggleDraftGradient()} />
            {tStatus('逐三角梯度着色（面内渐变）', lang)}
          </label>
          {(() => {
            const nPos = draftResult.faces.filter((f) => f.cls === 'positive').length
            const nNeg = draftResult.faces.filter((f) => f.cls === 'negative').length
            const nVert = draftResult.faces.filter((f) => f.cls === 'vertical').length
            const row = (c: string, lab: string, n: number) => <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: c, display: 'inline-block' }} /><span style={{ flex: 1 }}>{lab}</span><b>{n}</b></div>
            return <>
              {row('#2e9e5b', tStatus('正拔模（可脱模）', lang), nPos)}
              {row('#d23b30', tStatus('倒扣 undercut（开唔到模）', lang), nNeg)}
              {row('#e0b020', tStatus('垂直（≈0°，要侧抽）', lang), nVert)}
              <div style={{ marginTop: 6, color: '#9fb2bf' }}>{tStatus('角度范围', lang)} {draftResult.min.toFixed(1)}° ~ {draftResult.max.toFixed(1)}° · {tStatus('共', lang)} {draftResult.faces.length} {tStatus('面', lang)}</div>
              <div style={{ marginTop: 4, color: '#6b7680', fontSize: 11 }}>{tStatus('面积加权法向 · 注塑/铸造脱模检查', lang)}</div>
            </>
          })()}
        </div>
      )}
      {/* #174-7：脱模可达性浮卡 —— 逐三角射线遮挡（红=倒扣不可脱 / 绿=可脱），方向可切、可关 */}
      {accessResult && (
        <div className="info-card" style={{ position: 'fixed', top: 150, right: 20, width: 234, padding: '12px 14px', zIndex: 200, fontSize: 12 }}>
          <div className="info-card-head">
            <span style={{ color: '#7fd1b9' }}>{tStatus('🔓 脱模可达性', lang)}</span>
            <span className="info-card-x" onClick={() => useApp.getState().clearAccessibility()} title={tStatus('关闭可达性分析', lang)}>✕</span>
          </div>
          <div style={{ marginBottom: 6, color: '#9fb2bf' }}>{tStatus('脱模方向（动模拉出）：', lang)}</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {([['X', [1, 0, 0]], ['Y', [0, 1, 0]], ['Z', [0, 0, 1]], ['−Z', [0, 0, -1]]] as [string, [number, number, number]][]).map(([lab, dir]) => {
              const on = Math.abs(draftPull[0] - dir[0]) < 1e-6 && Math.abs(draftPull[1] - dir[1]) < 1e-6 && Math.abs(draftPull[2] - dir[2]) < 1e-6
              return <button key={lab} type="button" onClick={() => useApp.getState().runAccessibility(dir)} style={{ flex: 1, padding: '3px 0', fontSize: 11, borderRadius: 3, cursor: 'pointer', border: on ? '1px solid #4a9eff' : '1px solid #3a3e44', background: on ? '#1e3a5f' : '#23272d', color: '#d8dde2' }}>{lab}</button>
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: '#2e9e5b', display: 'inline-block' }} /><span style={{ flex: 1 }}>{tStatus('可脱模', lang)}</span><b>{accessResult.nTotal - accessResult.nBlocked}</b></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: '#d23b30', display: 'inline-block' }} /><span style={{ flex: 1 }}>{tStatus('倒扣不可脱', lang)}</span><b>{accessResult.nBlocked}</b></div>
          <div style={{ marginTop: 4, color: '#6b7680', fontSize: 11 }}>{tStatus('逐三角自身遮挡射线 · 趋势近似', lang)} · {accessResult.nTotal} {tStatus('三角', lang)}</div>
        </div>
      )}
      {/* S187：斜度分析面板 */}
      {slopeResult && (
        <div className="info-card" style={{ position: 'fixed', top: 150, right: 20, width: 234, padding: '12px 14px', zIndex: 200, fontSize: 12 }}>{/* GM-G4b：斜度分析浮卡 → .info-card 共用 token */}
          <div className="info-card-head">
            <span style={{ color: '#7fb3d1' }}>{tStatus('📐 斜度分析', lang)}</span>
            <span className="info-card-x" onClick={() => useApp.getState().clearSlopeAnalysis()} title={tStatus('关闭斜度分析', lang)}>✕</span>
          </div>
          <div style={{ marginBottom: 6, color: '#9fb2bf' }}>{tStatus('参考方向（基准平面法向）：', lang)}</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {([['X', [1, 0, 0]], ['Y', [0, 1, 0]], ['Z', [0, 0, 1]]] as [string, [number, number, number]][]).map(([lab, dir]) => {
              const on = Math.abs(slopeRef[0] - dir[0]) < 1e-6 && Math.abs(slopeRef[1] - dir[1]) < 1e-6 && Math.abs(slopeRef[2] - dir[2]) < 1e-6
              return <button key={lab} type="button" onClick={() => useApp.getState().runSlopeAnalysis(dir)} style={{ flex: 1, padding: '3px 0', fontSize: 11, borderRadius: 3, cursor: 'pointer', border: on ? '1px solid #4a9eff' : '1px solid #3a3e44', background: on ? '#1e3a5f' : '#23272d', color: '#d8dde2' }}>{lab}</button>
            })}
          </div>
          {(() => {
            const nFlat = slopeResult.faces.filter((f) => f.cls === 'flat').length
            const nTrans = slopeResult.faces.filter((f) => f.cls === 'transition').length
            const nSteep = slopeResult.faces.filter((f) => f.cls === 'steep').length
            const row = (c: string, lab: string, n: number) => <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: c, display: 'inline-block' }} /><span style={{ flex: 1 }}>{lab}</span><b>{n}</b></div>
            return <>
              {row('#2e9e5b', tStatus('平面 / 近水平（≤30°）', lang), nFlat)}
              {row('#e0b020', tStatus('过渡斜面（30°~60°）', lang), nTrans)}
              {row('#3b7fd2', tStatus('陡 / 竖直壁（≥60°）', lang), nSteep)}
              <div style={{ marginTop: 6, color: '#9fb2bf' }}>{tStatus('倾角范围', lang)} {slopeResult.min.toFixed(1)}° ~ {slopeResult.max.toFixed(1)}° · {tStatus('共', lang)} {slopeResult.faces.length} {tStatus('面', lang)}</div>
              <div style={{ marginTop: 4, color: '#6b7680', fontSize: 11 }}>{tStatus('面积加权法向 · CNC 粗精区 / 打印朝向', lang)}</div>
            </>
          })()}
        </div>
      )}
      {/* S119：草图截面属性面板 */}
      {sectionResult && (
        <div className="info-card" style={{ position: 'fixed', top: 150, right: 20, width: 250, padding: '12px 14px', zIndex: 200, fontSize: 12 }}>{/* GM-G4b：截面属性浮卡 → .info-card 共用 token */}
          <div className="info-card-head">
            <span style={{ color: '#7fd1b9' }}>{tStatus('Σ 截面属性', lang)}</span>
            <span className="info-card-x" onClick={() => useApp.getState().clearSectionProps()} title={tStatus('关闭', lang)}>✕</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px', lineHeight: 1.5 }}>
            <span style={{ color: '#9fb2bf' }}>{tStatus('面积', lang)}</span><b>{fmtArea(sectionResult.area, unit)}</b>
            <span style={{ color: '#9fb2bf' }}>{tStatus('形心', lang)}</span><b>({sectionResult.centroid.map((c) => uLen(c)).join(', ')} {uSuf}{sectionResult.fromCut ? `·${section.axis === 'X' ? 'YZ' : section.axis === 'Y' ? 'ZX' : 'XY'}${tStatus('平面', lang)}` : ''})</b>
            <span style={{ color: '#9fb2bf' }}>{tStatus('周长', lang)}</span><b>{fmtLen(sectionResult.perimeter, unit)}</b>
            <span style={{ color: '#9fb2bf' }} title={tStatus('关于形心、绕 X/Y 轴的截面惯性矩 + 惯性积（mm⁴）— 梁弯曲刚度', lang)}>Ixx/Iyy</span><b>{sectionResult.Ixx.toExponential(3)} / {sectionResult.Iyy.toExponential(3)}</b>
            <span style={{ color: '#9fb2bf' }}>Ixy</span><b>{sectionResult.Ixy.toExponential(3)}</b>
            <span style={{ color: '#9fb2bf' }} title={tStatus('主惯性矩 I₁≥I₂ + 主轴相对 X 轴角度（绕形心，与坐标系无关）', lang)}>{tStatus('主轴 I₁/I₂', lang)}</span><b>{sectionResult.principal.I1.toExponential(3)} / {sectionResult.principal.I2.toExponential(3)}</b>
            <span style={{ color: '#9fb2bf' }}>{tStatus('主轴角', lang)}</span><b>{sectionResult.principal.angleDeg.toFixed(2)}°</b>
          </div>
          <div style={{ marginTop: 6, color: '#6b7680', fontSize: 11 }}>{tStatus(`实体区块 ${sectionResult.nBodies || 1}`, lang)}{sectionResult.nHoles ? tStatus(` · 孔 ${sectionResult.nHoles}（已扣除）`, lang) : ''} · {sectionResult.fromCut ? tStatus('网格密铺近似 · 剖面坐标系', lang) : tStatus('圆按 96 边近似', lang)}{sectionResult.openWarn ? tStatus(' · ⚠ 网格非水密', lang) : ''}</div>
        </div>
      )}
      {moveFaceMode && (
        <div className="vp-measure" data-testid="move-face-toolbar" style={{ fontWeight: 600, color: '#1572c4', display: 'flex', gap: 6, alignItems: 'center' }}>
          {tStatus('↕ 移动面：点一个或多个平面面', lang)}
          <select value={moveFaceKind} onChange={(e) => setMoveFaceKind(e.target.value as 'offset' | 'tilt')} style={{ fontSize: 12 }} title={tStatus('偏移=沿法向推/拉（朝内内核重解 / 朝外加料，支持多面串链）；倾斜=绕面心内轴掀起角度（仅单面）', lang)}>
            <option value="offset">{tStatus('偏移', lang)}</option><option value="tilt">{tStatus('倾斜', lang)}</option>
          </select>
          {moveFaceKind === 'offset'
            ? <><input data-testid="move-face-distance" className="tb-num" type="number" step={1} value={moveFaceDist} onChange={(e) => setMoveFaceDist(Number(e.target.value))} style={{ width: 56 }} title={tStatus('距离 mm（负=朝内内核重解邻面/圆角 / 正=朝外加料）', lang)} /> mm</>
            : <><input className="tb-num" type="number" step={1} value={moveFaceAngle} onChange={(e) => setMoveFaceAngle(Number(e.target.value))} style={{ width: 56 }} title={tStatus('倾斜角°（钳 ±60°，绕面心最长内轴）', lang)} /> °</>}
          {/* GM-3DV3 M8：Offset Type（Fusion Offset Face）— webcad 恒加时间轴节点(New 语义)，modify/auto 记录意图 */}
          {moveFaceKind === 'offset' && <select value={offsetType} onChange={(e) => setOffsetType(e.target.value as 'modify' | 'new' | 'auto')} style={{ fontSize: 11 }} title={tStatus('Offset Type：自动 / 新特征 / 改现有特征（webcad 恒加时间轴节点，改现有=元数据记录）', lang)}><option value="auto">{tStatus('自动', lang)}</option><option value="new">{tStatus('新特征', lang)}</option><option value="modify">{tStatus('改现有', lang)}</option></select>}
          <span style={{ fontSize: 12, color: moveFacePicks.length ? '#16a36b' : '#8a97a2' }}>{moveFacePicks.length} {tStatus('面', lang)}</span>
          {moveFaceKind === 'tilt' && moveFacePicks.length > 1 && <span style={{ fontSize: 11, color: '#c47f17' }} title={tStatus('倾斜每面方向有歧义 — 只留一个面，或改用「偏移」', lang)}>{tStatus('⚠ 倾斜只支持单面', lang)}</span>}
          {moveFacePicks.length > 0 && <button className="tb-btn" title={tStatus('清空所选面', lang)} onClick={() => useApp.getState().clearMoveFacePick()}>✕</button>}
          <button data-testid="move-face-commit" className="tb-btn" style={{ background: moveFacePicks.length ? '#1572c4' : undefined, color: moveFacePicks.length ? '#fff' : undefined }} disabled={!moveFacePicks.length} title={tStatus('应用移动面（Enter）', lang)} onClick={() => void useApp.getState().commitMoveFace()}>{tStatus('确定', lang)}</button>
        </div>
      )}
      {/* GM-3DV3 M9：分割面命令条 — 切割平面方向（自动/X/Y/Z）+ Split Type（内核只做平面 imprint，Surface/Closest 记录意图） */}
      {splitFaceMode && (
        <div className="vp-measure" style={{ fontWeight: 600, color: '#1572c4', display: 'flex', gap: 6, alignItems: 'center' }}>
          ✂ {tStatus('分割面：点一个面 → 沿切割平面切两半', lang)}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 400, fontSize: 12 }} title={tStatus('切割平面方向：自动=同面最垂直嘅世界轴 / X·Y·Z=指定轴向（Along Vector）', lang)}>
            {tStatus('方向', lang)}
            <select value={splitFaceAxis} onChange={(e) => useApp.getState().setSplitFaceAxis(e.target.value as 'auto' | 'X' | 'Y' | 'Z')} style={{ fontSize: 12 }}>
              <option value="auto">{tStatus('自动', lang)}</option><option value="X">X</option><option value="Y">Y</option><option value="Z">Z</option>
            </select>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 400, fontSize: 12 }} title={tStatus('Split Type：沿向量=平面沿法向投影（内核真做）；曲面/最近点=投影模式（内核窄能力，记录意图）', lang)}>
            {tStatus('类型', lang)}
            <select value={splitFaceType} onChange={(e) => useApp.getState().setSplitFaceType(e.target.value as 'surface' | 'vector' | 'closest')} style={{ fontSize: 12 }}>
              <option value="vector">{tStatus('沿向量', lang)}</option><option value="surface">{tStatus('曲面', lang)}</option><option value="closest">{tStatus('最近点', lang)}</option>
            </select>
          </span>
        </div>
      )}
      {delFaceMode2 && (
        <div className="vp-measure" style={{ fontWeight: 600, color: '#1572c4', display: 'flex', gap: 6, alignItems: 'center' }}>
          🗑 {tStatus('删面：逐个点选要删嘅面（去特征+治愈）', lang)}
          <span style={{ fontSize: 12, color: delFacePicks2.length ? '#16a36b' : '#8a97a2' }}>{delFacePicks2.length} {tStatus('面', lang)}</span>
          {delFacePicks2.length > 0 && <button className="tb-btn" title={tStatus('清空所选面', lang)} onClick={() => useApp.getState().clearDelFacePicks()}>✕</button>}
          <button className="tb-btn" style={{ background: delFacePicks2.length ? '#1572c4' : undefined, color: delFacePicks2.length ? '#fff' : undefined }} disabled={!delFacePicks2.length} title={tStatus('删除所选面', lang)} onClick={() => void useApp.getState().commitDelFace()}>{tStatus('确定', lang)}</button>
        </div>
      )}
      {props && showProps && (
        <div ref={propsDrag.ref} className={'vp-props' + (propsDrag.isDragged ? ' vp-hud-dragged' : '') + (propsHudCollapsed ? ' vp-hud-collapsed' : '')} style={propsDrag.style}>
          <span className="vp-hud-handle" onPointerDown={propsDrag.onPointerDown} title={tStatus('拖動屬性面板', lang)}>⋮⋮</span>
          <button className="vp-hud-collapse" type="button" title={propsHudCollapsed ? tStatus('展開屬性面板', lang) : tStatus('收合屬性面板', lang)} onClick={() => setPropsHudCollapsed((v) => !v)}>{propsHudCollapsed ? '⌃' : '–'}</button>
          {propsDrag.isDragged && <button className="vp-hud-reset" type="button" title={tStatus('還原屬性面板預設位置', lang)} onClick={propsDrag.reset}>↺</button>}
          📐 {uLen(props.dx)}×{uLen(props.dy)}×{uLen(props.dz)} {uSuf}<span title={tStatus('包围盒空间对角线长（√(dx²+dy²+dz²)）— 装箱/快递/能否斜放入打印床用', lang)} style={{ color: '#8a97a2' }}> {tStatus('(对角', lang)} {uLen(Math.hypot(props.dx, props.dy, props.dz))})</span>　·　{tStatus('体积', lang)} {fmtVol(props.vol, unit)}　·　{tStatus('表面积', lang)} {fmtArea(props.area, unit)}　·　{tStatus('质心', lang)} ({props.com.map((c) => uLen(c)).join(', ')}) {uSuf}
          　·　{tStatus('质量', lang)} {(() => { const g = (props.vol / 1000) * density; return g >= 1000 ? (g / 1000).toFixed(2) + ' kg' : g.toFixed(1) + ' g' })()}
          <span title={tStatus('3D 打印 1.75mm 线材的料长估算 —— 实心(100%填充)的上限；实际按填充率/壁厚通常少好多。', lang)} style={{ color: '#8a97a2' }}>　·　{tStatus('实心料~', lang)}{(props.vol / 2405.3).toFixed(1)} m</span>
          <span title={tStatus('FDM 打印粗估（实心100%上限）：时间≈体积÷10cm³/h（0.4mm嘴·0.2层高典型挤出率）；料费≈实心质量×¥0.12/g（PLA约¥120/kg）。实际按填充率通常少好多。', lang)} style={{ color: '#8a97a2' }}>　·　{tStatus('打印~', lang)}{(() => { const h = (props.vol / 1000) / 10; return h >= 1 ? h.toFixed(1) + 'h' : Math.round(h * 60) + 'min' })()} · {tStatus('料费~', lang)}¥{((props.vol / 1000) * density * 0.12).toFixed(1)}</span>
          <span title={tStatus('绕质心 X/Y/Z 轴的转动惯量（按当前密度，g·cm²）—— 机构动力学 / 转动平衡 / 飞轮用', lang)} style={{ color: '#8a97a2' }}>　·　{tStatus('惯性矩', lang)} {props.inertia.map((j) => (j * density / 1e5).toFixed(1)).join(' / ')} g·cm²</span>
          {massP && massP.mass != null && massP.mass > 0 && (
            <span title={tStatus('S117 主惯性矩 I₁≤I₂≤I₃（绕质心【主轴】= 惯性张量特征值，与坐标系无关；非对称件主轴≠XYZ轴）+ 回转半径 k=√(I/m)。对标 Fusion 物理属性。', lang)} style={{ color: '#8a97a2' }}>　·　{tStatus('主惯矩', lang)} {massP.principalMoments.map((I) => (I * 1e4).toFixed(1)).join('/')} g·cm² · {tStatus('回转半径', lang)} {massP.principalMoments.map((I) => Math.sqrt(I / massP.mass!).toFixed(1)).join('/')} mm</span>
          )}
          {obb && obb.volume > 0 && (() => { const aabb = props.dx * props.dy * props.dz; const save = aabb > 1e-9 ? (1 - obb.volume / aabb) * 100 : 0; const sz = [...obb.size].sort((a, b) => b - a); return (
            <span title={tStatus('S121 定向最小包围盒（PCA-OBB，近似非保证全局最优）：旋转件最贴体嘅盒。比轴对齐 AABB 细 → 用最细料块/排料省料；省料% = 1−OBB体积/AABB体积。', lang)} style={{ color: '#8a97a2' }}>　·　{tStatus('定向盒', lang)} {sz.map((s) => uLen(s)).join('×')} {uSuf}（{fmtVol(obb.volume, unit)}{save > 0.5 ? tStatus(` · 省料 ${save.toFixed(0)}%`, lang) : ''}）</span>
          ) })()}
          <span title={props.watertight.closed ? tStatus('网格封闭水密（每条边正好 2 个三角面）—— 可直接切片 3D 打印', lang) : tStatus(`网格非水密：${props.watertight.boundary} 条开放边${props.watertight.nonManifold ? ` · ${props.watertight.nonManifold} 条非流形边` : ''} —— 切片器可能出错，建议检查模型`, lang)} style={{ color: props.watertight.closed ? '#2e9e5b' : '#d98324', fontWeight: 600 }}>　·　{props.watertight.closed ? tStatus('水密 ✓ 可打印', lang) : tStatus(`水密 ✗ (${props.watertight.boundary}开放${props.watertight.nonManifold ? '/' + props.watertight.nonManifold + '非流形' : ''})`, lang)}</span>
          <select value={density} title={tStatus('材料密度 (g/cm³) 用于估算质量', lang)} onChange={(e) => setDensity(Number(e.target.value))} style={{ marginLeft: 4 }}>
            <option value={1.04}>ABS 1.04</option>
            <option value={1.24}>PLA 1.24</option>
            <option value={1.27}>PETG 1.27</option>
            <option value={1.21}>TPU 1.21</option>
            <option value={1.14}>{tStatus('尼龙PA', lang)} 1.14</option>
            <option value={1.15}>{tStatus('树脂', lang)} 1.15</option>
            <option value={2.7}>{tStatus('铝', lang)} 2.7</option>
            <option value={4.5}>{tStatus('钛', lang)} 4.5</option>
            <option value={7.85}>{tStatus('钢', lang)} 7.85</option>
            <option value={7.9}>{tStatus('不锈钢', lang)} 7.9</option>
            <option value={8.5}>{tStatus('黄铜', lang)} 8.5</option>
            <option value={8.96}>{tStatus('铜', lang)} 8.96</option>
          </select>
          <button title={tStatus('显示/隐藏 重心(质心) 3D 标记', lang)} onClick={() => toggleCom()} style={{ marginLeft: 6, padding: '2px 8px', fontSize: 12, borderRadius: 5, border: '1px solid ' + (showCom ? '#ff3b6b' : '#c4ccd4'), background: showCom ? '#ffe8ee' : '#fff', cursor: 'pointer' }}>{tStatus('⊕ 重心', lang)}</button>
          <span style={{ marginLeft: 8, paddingLeft: 8, borderLeft: '1px solid #d7dde2', display: 'inline-flex', alignItems: 'center', gap: 4, color: (compXY !== 0 || compShrink !== 1) ? '#b06010' : '#6d7780' }} title={tStatus('3D 打印补偿（导出 STL/装配STL 时套用）：XY 同切片器「水平扩展」语义——正=外形胀+孔变细；FDM 孔印细/件偏肥日常用细负值（−0.10~−0.15）。收缩按材料绕中心放大补偿。', lang)}>
            {tStatus('🖨补偿 XY', lang)}<input type="number" step={0.05} min={-1} max={1} value={compXY} placeholder="-0.10" onChange={(e) => setCompXY(Number(e.target.value))} style={{ width: 52 }} />mm
            <select value={compShrink} title={tStatus('材料冷却收缩补偿', lang)} onChange={(e) => setCompShrink(Number(e.target.value))}>
              <option value={1}>{tStatus('收缩:无', lang)}</option>
              <option value={1.002}>PLA ×1.002</option>
              <option value={1.003}>PETG ×1.003</option>
              <option value={1.004}>{tStatus('尼龙', lang)} ×1.004</option>
              <option value={1.006}>ABS ×1.006</option>
            </select>
            {(compXY !== 0 || compShrink !== 1) && <b style={{ color: '#b06010' }}>{tStatus('补偿中', lang)}</b>}
          </span>
          <BedFitBadge w={props.dx} d={props.dy} h={props.dz} />
          <span style={{ marginLeft: 8, paddingLeft: 8, borderLeft: '1px solid #d7dde2', display: 'inline-flex', alignItems: 'center', gap: 4 }} title={tStatus('对当前活动实体做梁理论受力估算（材质默认钢；装配中选组件可用其材质）', lang)}><BeamControls compId={null} /></span>
        </div>
      )}
      {showProps && !props && components.length > 0 && (
        <div ref={propsDrag.ref} className={'vp-props' + (propsDrag.isDragged ? ' vp-hud-dragged' : '') + (propsHudCollapsed ? ' vp-hud-collapsed' : '')} style={propsDrag.style}><span className="vp-hud-handle" onPointerDown={propsDrag.onPointerDown} title={tStatus('拖動屬性面板', lang)}>⋮⋮</span><button className="vp-hud-collapse" type="button" title={propsHudCollapsed ? tStatus('展開屬性面板', lang) : tStatus('收合屬性面板', lang)} onClick={() => setPropsHudCollapsed((v) => !v)}>{propsHudCollapsed ? '⌃' : '–'}</button>{propsDrag.isDragged && <button className="vp-hud-reset" type="button" title={tStatus('還原屬性面板預設位置', lang)} onClick={propsDrag.reset}>↺</button>}{(() => {
          const vis = components.filter((c) => !c.hidden) // exclude hidden 机架/ground from counts & totals
          let vol = 0, area = 0, gm = 0, anyMat = false, cmx = 0, cmy = 0, cmz = 0, wsum = 0; const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]
          for (const c of vis) {
            // Transform into true three-world via the single-source-of-truth matrix — this accounts for the
            // component's rotation (rot) AND the CAD(Z-up)→three(Y-up) frame, so a moved/rotated/arrayed part
            // contributes its real placed geometry to the assembly bbox & centroid (not the raw CAD mesh).
            const M = compWorldMatrix(c).elements
            const cp = computeProps(c.mesh)
            const cd = (c.material && MATERIALS[c.material]?.density) || density
            if (c.material && MATERIALS[c.material]?.density) anyMat = true
            if (cp) {
              vol += cp.vol; area += cp.area; const mass = (cp.vol / 1000) * cd; gm += mass
              // mass-weighted assembly CoM: transform the component centroid (CAD coords) into three-world.
              const wx = M[0] * cp.com[0] + M[4] * cp.com[1] + M[8] * cp.com[2] + M[12]
              const wy = M[1] * cp.com[0] + M[5] * cp.com[1] + M[9] * cp.com[2] + M[13]
              const wz = M[2] * cp.com[0] + M[6] * cp.com[1] + M[10] * cp.com[2] + M[14]
              cmx += wx * mass; cmy += wy * mass; cmz += wz * mass; wsum += mass
            }
            const v = c.mesh.vertices
            for (let i = 0; i < v.length; i += 3) {
              const vx = v[i], vy = v[i + 1], vz = v[i + 2]
              const x = M[0] * vx + M[4] * vy + M[8] * vz + M[12]
              const y = M[1] * vx + M[5] * vy + M[9] * vz + M[13]
              const z = M[2] * vx + M[6] * vy + M[10] * vz + M[14]
              if (x < lo[0]) lo[0] = x; if (y < lo[1]) lo[1] = y; if (z < lo[2]) lo[2] = z; if (x > hi[0]) hi[0] = x; if (y > hi[1]) hi[1] = y; if (z > hi[2]) hi[2] = z
            }
          }
          const com = wsum > 0 ? `　·　质心 (${uLen(cmx / wsum)}, ${uLen(cmy / wsum)}, ${uLen(cmz / wsum)} ${uSuf})` : ''
          // three-world extents → display as CAD-style W(x)×D(z)×H(y) for continuity with single-part readouts.
          const W = hi[0] - lo[0], D = hi[2] - lo[2], H = hi[1] - lo[1]
          return (<>
            {tStatus(`🧩 装配 ${vis.length} 件　·　总体积 ${fmtVol(vol, unit)}　·　总面积 ${fmtArea(area, unit)}　·　总尺寸 ${uLen(W)}×${uLen(D)}×${uLen(H)} ${uSuf}　·　总质量${anyMat ? '(各材质)' : '(' + density + ')'} ${gm >= 1000 ? (gm / 1000).toFixed(2) + ' kg' : gm.toFixed(1) + ' g'}${com}　·　实心打印~${(() => { const h = (vol / 1000) / 10; return h >= 1 ? h.toFixed(1) + 'h' : Math.round(h * 60) + 'min' })()} · 料费~¥${((vol / 1000) * density * 0.12).toFixed(1)}`, lang)}
            <button title={tStatus('导出材料清单 BOM（各零件 数量/体积/质量 → CSV，用当前密度）', lang)} onClick={() => exportBOM(density)} style={{ marginLeft: 8, padding: '2px 8px', fontSize: 12, borderRadius: 5, border: '1px solid #c4ccd4', background: '#fff', cursor: 'pointer' }}>{tStatus('📋 导出BOM', lang)}</button>
            <button title={tStatus('排版到打印床：把所有可见零件铺平到 Z=0、按当前打印床宽度排成网格（多零件批量打印的准备步骤，可撤销）', lang)} onClick={() => useApp.getState().arrangeOnBed()} style={{ marginLeft: 6, padding: '2px 8px', fontSize: 12, borderRadius: 5, border: '1px solid #c4ccd4', background: '#fff', cursor: 'pointer' }}>{tStatus('🖨️ 排版', lang)}</button>
            <button title={tStatus('显示/隐藏 装配重心(质心) 3D 标记（体积加权）', lang)} onClick={() => toggleCom()} style={{ marginLeft: 6, padding: '2px 8px', fontSize: 12, borderRadius: 5, border: '1px solid ' + (showCom ? '#ff3b6b' : '#c4ccd4'), background: showCom ? '#ffe8ee' : '#fff', cursor: 'pointer' }}>{tStatus('⊕ 重心', lang)}</button>
            <BedFitBadge w={W} d={D} h={H} />
          </>)
        })()}
        </div>
      )}
      {!bodyMesh && components.length === 0 && mode === 'model' && !fourBar && !sliderCrank && (
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', color: '#7a8893', pointerEvents: 'none', maxWidth: 360, lineHeight: 1.55, userSelect: 'none' }}>
          {/* Flux 生成上手插画（工作台+画草图）— 令空文档画面唔咁干。缩细免阻视线（用户反馈大卡阻埞）。 */}
          <img src="/empty-canvas.png" alt="" width={104} height={104} draggable={false} style={{ display: 'block', margin: '0 auto -6px', opacity: 0.9, filter: 'drop-shadow(0 6px 16px rgba(43,108,240,.10))' }} />
          <div style={{ fontSize: 18, marginBottom: 5, color: '#3a4654', fontWeight: 700 }}>{tStatus('开始建模', lang)}</div>
          <div style={{ fontSize: 12.5 }}>{tStatus('① 撳左上', lang)} <b style={{ color: '#1572c4' }}>{tStatus('「创建草图」', lang)}</b> {tStatus('画轮廓 →', lang)} <b>{tStatus('「拉伸」', lang)}</b> {tStatus('出实体', lang)}</div>
          <div style={{ fontSize: 12.5 }}>{tStatus('② 或上方', lang)} <b style={{ color: '#1572c4' }}>{tStatus('「示例:」', lang)}</b> {tStatus('揀模板 →「载入」（新手推荐）', lang)}</div>
          <div style={{ fontSize: 12.5 }}>{tStatus('③ 或直接', lang)} <b>{tStatus('长方体 / 圆柱 / 齿轮 / 钣金件', lang)}</b> {tStatus('等', lang)}</div>
          <div style={{ display: 'flex', gap: 7, justifyContent: 'center', flexWrap: 'wrap', marginTop: 10, pointerEvents: 'auto' }}>
            {([
              { label: '✏️ 画草图', fn: () => useApp.getState().startSketch() },
              { label: '📦 长方体', fn: () => useApp.getState().runCommand('box', '长方体') },
              { label: '⚙️ 齿轮组示例', fn: () => void useApp.getState().loadSample('gearpair') },
              { label: '🔍 搜索命令', fn: () => useApp.getState().setCmdPalette(true) },
            ] as { label: string; fn: () => void }[]).map((b) => (
              <button key={b.label} onClick={b.fn} style={{ padding: '5px 11px', fontSize: 12, borderRadius: 7, border: '1px solid #c4ccd4', background: '#fff', color: '#1d2329', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>{tStatus(b.label, lang)}</button>
            ))}
          </div>
          <div style={{ fontSize: 11, marginTop: 8, opacity: 0.65 }}>{tStatus('悬停任何工具睇说明　·　需要帮助撳右上 ?　·　按 / 搜索命令', lang)}</div>
        </div>
      )}
      <div ref={statusDrag.ref} className={'vp-badge' + (statusDrag.isDragged ? ' vp-hud-dragged' : '') + (statusHudCollapsed ? ' vp-hud-collapsed' : '')} style={statusDrag.style}><span className="vp-hud-handle" onPointerDown={statusDrag.onPointerDown} title={tStatus('拖動狀態提示', lang)}>⋮⋮</span><button className="vp-hud-collapse" type="button" title={statusHudCollapsed ? tStatus('展開狀態提示', lang) : tStatus('收合狀態提示', lang)} onClick={() => setStatusHudCollapsed((v) => !v)}>{statusHudCollapsed ? '⌃' : '–'}</button>{statusDrag.isDragged && <button className="vp-hud-reset" type="button" title={tStatus('還原狀態提示預設位置', lang)} onClick={statusDrag.reset}>↺</button>}<span className="vp-status-message">{tStatus(status, lang)}</span></div>
      <InterfClearChip />
      <FormPanel />
      <QuiltPickPanel />
      <EditPolesPanel />
      <GcodeBackplot />
    </div>
  )
}

// S201：把「加厚整张曲面」的编号 prompt 改成 Fusion 式画布直选时的明确操作条。
// 面板只负责说明/取消；真正的目标身份来自 ParkedBody 点选，不会因列表重排而选错。
function QuiltPickPanel() {
  const active = useApp((s) => s.quiltPickMode)
  const lang = useApp((s) => s.lang)
  if (!active) return null
  return (
    <div style={{ position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', background: '#fff', border: '1px solid #54a8df', borderRadius: 8, padding: '7px 12px', display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, boxShadow: '0 2px 10px rgba(0,0,0,.14)', zIndex: 60 }}>
      <b style={{ color: '#1572c4' }}>{tStatus('➕ 加厚整张曲面', lang)}</b>
      <span style={{ color: '#526574' }}>{tStatus('点选一张灰色曲面，再输入板厚', lang)}</span>
      <button className="cs-btn" onClick={() => useApp.setState({ quiltPickMode: false, status: '已取消加厚整张曲面' })}>{tStatus('取消', lang)}</button>
    </div>
  )
}

// T793：Form 模式浮动面板 — 级数 + 完成/取消（formCage 活动先出现）
function FormPanel() {
  const formMode = useApp((s) => s.formMode)
  const createKind = useApp((s) => s.formCreateKind)
  const cage = useApp((s) => s.formCage)
  const boxDraft = useApp((s) => s.formBoxDraft)
  const formSym = useApp((s) => s.formSym)   // S193：对称编辑状态
  const lang = useApp((s) => s.lang)
  const [extD, setExtD] = useState(5)
  const [formPlane, setFormPlane] = useState('XY')
  const [formL, setFormL] = useState(40)
  const [formW, setFormW] = useState(30)
  const [formH, setFormH] = useState(20)
  const [formSegA, setFormSegA] = useState(4)
  const [formSegB, setFormSegB] = useState(3)
  const [formPipePath, setFormPipePath] = useState('0,0,0; 30,0,0; 30,25,10')
  if (!formMode) return null
  if (!cage) {
    if (!createKind) return null
    if (createKind === 'box' && boxDraft) {
      const expanded = boxDraft.stage === 'height' || boxDraft.stage === 'ready'
      const patch = (p: Partial<FormBoxDraft>) => useApp.getState().patchFormBoxDraft(p)
      const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }
      const field: CSSProperties = { width: 86, height: 23, boxSizing: 'border-box' }
      const stageHint = boxDraft.stage === 'plane' ? 'Select a plane or planar face' : boxDraft.stage === 'center' ? 'Specify center point' : boxDraft.stage === 'size' ? 'Specify size of rectangle' : boxDraft.stage === 'height' ? 'Specify height' : 'Ready'
      return (
        <div style={{ position: 'absolute', top: 70, right: 14, width: 222, background: '#f8fafb', border: '1px solid #c3cbd1', borderRadius: 3, padding: 10, fontSize: 12, boxShadow: '0 2px 10px rgba(0,0,0,.14)', zIndex: 60 }}>
          <div style={{ fontWeight: 700, color: '#4c5a64', borderBottom: '1px solid #d8dee3', paddingBottom: 6, marginBottom: 8 }}>−　BOX</div>
          <label style={row}>Rectangle
            <select value="center" disabled style={field}><option value="center">Center</option></select>
          </label>
          {expanded && <>
            <label style={row}>Length <span><input aria-label="Form Box Length" type="number" min={0.1} step={0.1} value={Number(boxDraft.length.toFixed(3))} onChange={(e) => patch({ length: Math.max(0.1, Number(e.target.value) || 0.1) })} style={field} /> mm</span></label>
            <label style={row}>Length Faces <input aria-label="Form Box Length Faces" type="number" min={1} step={1} value={boxDraft.lengthFaces} onChange={(e) => patch({ lengthFaces: Math.max(1, Math.round(Number(e.target.value) || 1)) })} style={field} /></label>
            <label style={row}>Width <span><input aria-label="Form Box Width" type="number" min={0.1} step={0.1} value={Number(boxDraft.width.toFixed(3))} onChange={(e) => patch({ width: Math.max(0.1, Number(e.target.value) || 0.1) })} style={field} /> mm</span></label>
            <label style={row}>Width Faces <input aria-label="Form Box Width Faces" type="number" min={1} step={1} value={boxDraft.widthFaces} onChange={(e) => patch({ widthFaces: Math.max(1, Math.round(Number(e.target.value) || 1)) })} style={field} /></label>
            <label style={row}>Height <span><input aria-label="Form Box Height" type="number" min={0.1} step={0.1} value={Number(boxDraft.height.toFixed(3))} onChange={(e) => patch({ height: Math.max(0.1, Number(e.target.value) || 0.1) })} style={field} /> mm</span></label>
            <label style={row}>Height Faces <input aria-label="Form Box Height Faces" type="number" min={1} step={1} value={boxDraft.heightFaces} onChange={(e) => patch({ heightFaces: Math.max(1, Math.round(Number(e.target.value) || 1)) })} style={field} /></label>
          </>}
          <label style={row}>Direction
            <select value={boxDraft.direction} onChange={(e) => patch({ direction: e.target.value as FormBoxDraft['direction'] })} style={field}><option value="one">One Side</option><option value="symmetric">Symmetric</option></select>
          </label>
          {expanded && <label style={row}>Symmetry
            <select value={boxDraft.symmetry} onChange={(e) => patch({ symmetry: e.target.value as FormBoxDraft['symmetry'] })} style={field}><option value="none">None</option></select>
          </label>}
          <div style={{ fontSize: 11, color: '#687782', minHeight: 18, marginTop: 5 }}>{stageHint}</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, borderTop: '1px solid #d8dee3', paddingTop: 8, marginTop: 8 }}>
            <button className="cs-btn" disabled={boxDraft.stage !== 'ready'} onClick={() => void useApp.getState().commitFormBoxDraft()}>OK</button>
            <button className="cs-btn" onClick={() => useApp.getState().cancelFormCreate()}>Cancel</button>
          </div>
        </div>
      )
    }
    const makePrimitive = async () => {
      const s = useApp.getState()
      const a = Math.max(1, formL || 1), b = Math.max(1, formW || 1), h = Math.max(1, formH || 1)
      const na = Math.max(1, Math.round(formSegA || 1)), nb = Math.max(1, Math.round(formSegB || 1))
      if (createKind === 'box') await s.startFormBox(a, b, h, na, nb, Math.max(1, Math.round(h / 10)))
      else if (createKind === 'plane') await s.startFormPlane(a, b, na, nb)
      else if (createKind === 'cylinder') await s.startFormCylinder(a / 2, h, Math.max(4, na), Math.max(1, nb))
      else if (createKind === 'sphere') await s.startFormSphere(a / 2, Math.max(2, na))
      else if (createKind === 'quadball') await s.startFormSphere(a / 2, 2)
      else if (createKind === 'torus') await s.startFormTorus(a / 2, Math.min(b / 2, a / 2 - 0.5), Math.max(6, na), Math.max(4, nb))
      else if (createKind === 'face') await s.startFormOpenPatch(a, b, na, nb)
      else if (createKind === 'pipe') {
        const path = formPipePath.split(';').map((part) => part.trim()).filter(Boolean).map((part) => part.split(/[,\s]+/).map(Number))
        if (path.length < 2 || path.some((p) => p.length !== 3 || p.some((v) => !Number.isFinite(v)))) {
          useApp.setState({ status: 'FORM Pipe：路径请用 x,y,z; x,y,z 格式，至少两个有效点。' })
          return
        }
        await s.startFormPipe(path as [number, number, number][], a, Math.max(3, na))
      }
    }
    const title = createKind === 'quadball' ? 'QUADBALL' : createKind.toUpperCase()
    return (
      <div style={{ position: 'absolute', top: 70, right: 14, width: 222, background: '#f8fafb', border: '1px solid #c3cbd1', borderRadius: 3, padding: 10, fontSize: 12, boxShadow: '0 2px 10px rgba(0,0,0,.14)', zIndex: 60 }}>
        <div style={{ fontWeight: 700, color: '#4c5a64', borderBottom: '1px solid #d8dee3', paddingBottom: 6, marginBottom: 8 }}>−　{title}</div>
        {createKind !== 'pipe' && <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>Plane
          <select value={formPlane} onChange={(e) => setFormPlane(e.target.value)} style={{ width: 105 }}><option>XY</option><option>XZ</option><option>YZ</option></select>
        </label>}
        {createKind === 'box' && <>
          <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>Rectangle <select style={{ width: 105 }} defaultValue="Center"><option>Center</option><option>Two Point</option></select></label>
          <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>Direction <select style={{ width: 105 }} defaultValue="One Side"><option>One Side</option><option>Symmetric</option></select></label>
        </>}
        {createKind === 'pipe' ? <>
          <div style={{ color: '#4c5a64', lineHeight: 1.4, marginBottom: 7 }}>创建开放端 T-spline 管状控制笼；不是 SOLID Sweep。建立后可拖控制点、拉面及插边。</div>
          <label style={{ display: 'block', marginBottom: 6 }}>Path points (x,y,z; …)
            <textarea aria-label="FORM Pipe path points" value={formPipePath} onChange={(e) => setFormPipePath(e.target.value)} rows={3} style={{ width: '100%', boxSizing: 'border-box', marginTop: 3, resize: 'vertical', fontSize: 11 }} />
          </label>
          <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>Profile <select aria-label="FORM Pipe profile" value="circle" disabled style={{ width: 105 }}><option value="circle">Circle</option></select></label>
          <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>Diameter <input aria-label="FORM Pipe diameter" type="number" min={0.1} value={formL} onChange={(e) => setFormL(Number(e.target.value))} style={{ width: 72 }} /></label>
          <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>Profile Faces <input aria-label="FORM Pipe profile faces" type="number" min={3} max={32} value={formSegA} onChange={(e) => setFormSegA(Number(e.target.value))} style={{ width: 72 }} /></label>
        </> : <>
          <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>{createKind === 'sphere' || createKind === 'quadball' ? 'Diameter' : createKind === 'cylinder' ? 'Diameter' : createKind === 'torus' ? 'Major Ø' : 'Length'} <input type="number" min={1} value={formL} onChange={(e) => setFormL(Number(e.target.value))} style={{ width: 72 }} /></label>
          {!['sphere', 'quadball'].includes(createKind) && <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>{createKind === 'torus' ? 'Tube Ø' : 'Width'} <input type="number" min={1} value={formW} onChange={(e) => setFormW(Number(e.target.value))} style={{ width: 72 }} /></label>}
          {['box', 'cylinder'].includes(createKind) && <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>Height <input type="number" min={1} value={formH} onChange={(e) => setFormH(Number(e.target.value))} style={{ width: 72 }} /></label>}
          <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>Faces <span><input type="number" min={1} value={formSegA} onChange={(e) => setFormSegA(Number(e.target.value))} style={{ width: 45 }} /> × <input type="number" min={1} value={formSegB} onChange={(e) => setFormSegB(Number(e.target.value))} style={{ width: 45 }} /></span></label>
        </>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, borderTop: '1px solid #d8dee3', paddingTop: 8, marginTop: 8 }}>
          <button className="cs-btn" onClick={() => void makePrimitive()}>OK</button>
          <button className="cs-btn" onClick={() => useApp.getState().setFormCreateKind(null)}>Cancel</button>
        </div>
      </div>
    )
  }
  return (
    <div style={{ position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', background: '#fff', border: '1px solid #7bb8e8', borderRadius: 8, padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, boxShadow: '0 2px 10px rgba(0,0,0,.12)', zIndex: 60 }}>
      <b style={{ color: '#1572c4' }}>{tStatus('🫧 Form 细分建模', lang)}</b>
      <span style={{ color: '#5a6b78' }}>{tStatus('点控制点拖箭嘴捏形 / 点面拉伸（', lang)}{cage.verts.length} {tStatus('点）', lang)}</span>
      <label title={tStatus('细分级数：越高越圆滑（三角数 ×4/级）', lang)}>{tStatus('级数', lang)} <select value={cage.levels} onChange={(e) => useApp.getState().setFormLevels(Number(e.target.value))} style={{ height: 22 }}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label>
      <button className={'cs-btn' + (formSym !== null ? ' on' : '')} title={tStatus('对称编辑（S193）：开后拖一边控制点，对面镜像点自动同步（X/Y 轴镜像，对称平面 0）—— Fusion T-spline Symmetry。再撳切换 关→X→Y', lang)} style={formSym !== null ? { background: '#1572c4', color: '#fff' } : undefined} onClick={() => useApp.getState().cycleFormSym()}>{tStatus('对称', lang)}{formSym === 0 ? ':X' : formSym === 1 ? ':Y' : ''}</button>
      {(cage.msel ?? []).length >= 2 && (() => {
        const gm = useApp.getState().formGizmoMode
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, borderLeft: '1px solid #cde', paddingLeft: 8 }} title={tStatus('群组变换（Fusion Edit Form）：对选中控制点集 移/旋/缩（绕选集中心）。Shift+点加选；Ctrl+Z 撤销变换步。', lang)}>
            <span style={{ color: '#c77d00', fontWeight: 600 }}>{(cage.msel ?? []).length}{tStatus('点', lang)}</span>
            {(['move', 'rotate', 'scale'] as const).map((m) => (
              <button key={m} className={'cs-btn' + (gm === m ? ' on' : '')} style={gm === m ? { background: '#1572c4', color: '#fff' } : undefined} onClick={() => useApp.getState().setFormGizmoMode(m)}>{m === 'move' ? tStatus('移', lang) : m === 'rotate' ? tStatus('旋', lang) : tStatus('缩', lang)}</button>
            ))}
            <button className="cs-btn" title={tStatus('撤销上一步群组变换（Ctrl+Z）', lang)} onClick={() => useApp.getState().formUndoPop()}>↩</button>
          </span>
        )
      })()}
      {cage.selFace != null && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderLeft: '1px solid #cde', paddingLeft: 8 }} title={tStatus('拉伸选中 cage 面（push-pull）：外推 = 抽肢/凸台，内压 = 凹陷/孔。可连续拉抽长。', lang)}>
          <span style={{ color: '#c77d00', fontWeight: 600 }}>{tStatus('拉伸面', lang)}</span>
          <input type="number" step={1} value={extD} onChange={(e) => setExtD(Number(e.target.value))} style={{ width: 46 }} />mm
          <button className="cs-btn" title={tStatus('外推（凸出/抽肢）', lang)} onClick={() => void useApp.getState().formExtrudeFace(Math.abs(extD) || 5)}>{tStatus('外推▲', lang)}</button>
          <button className="cs-btn" title={tStatus('内压（凹入/孔）', lang)} onClick={() => void useApp.getState().formExtrudeFace(-(Math.abs(extD) || 5))}>{tStatus('内压▼', lang)}</button>
          {/* S172：折痕 / Crease — 折硬选中面 4 条边界边（二元无限锐），细分时棱角企硬唔被磨圆；再撳取消 */}
          <button className="cs-btn" title={tStatus('折痕 Crease：折硬此面 4 条边界边（细分时棱角企硬，做凸台/筋/硬边）。再撳取消。', lang)} onClick={() => useApp.getState().formCrease()}>{tStatus('◣ 折痕', lang)}</button>
          {/* S180：插入边线环（Fusion Insert Edge Loop）— 两个方向（↔ 切 0/2 对边、↕ 切 1/3 对边），环绕笼加一圈细分密度 */}
          <button className="cs-btn" title={tStatus('插入边线环（横向）：沿此面一对边方向环绕笼加一圈边线，体积不变，加局部细分密度。', lang)} onClick={() => void useApp.getState().formInsertLoop(0)}>{tStatus('⊞环↔', lang)}</button>
          <button className="cs-btn" title={tStatus('插入边线环（纵向）：沿此面另一对边方向环绕笼加一圈边线。', lang)} onClick={() => void useApp.getState().formInsertLoop(1)}>{tStatus('⊞环↕', lang)}</button>
        </span>
      )}
      {cage.creases.length > 0 && <span style={{ color: '#c0392b', fontWeight: 600 }} title={tStatus('当前折痕（锐边）数', lang)}>◣ {new Set(cage.creases.map(([a, b]) => (a < b ? a : b) + '_' + (a < b ? b : a))).size}</span>}
      {cage.creases.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b7680' }} title={tStatus('折痕软硬（semi-sharp crease）：1=硬棱角（旧二元锐），拖细 = 软棱 / 倒角感渐变（车身板/有机硬边过渡）。即时预览。', lang)}>
        <span>软硬</span>
        <input type="range" min={0.05} max={1} step={0.05} value={cage.creaseSoft ?? 1} onChange={(e) => useApp.getState().setFormCreaseSoft(Number(e.target.value))} style={{ width: 64, accentColor: '#c0392b' }} />
        <span style={{ width: 24, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(cage.creaseSoft ?? 1).toFixed(2)}</span>
      </span>}
      {/* S169：Form 镜像/对称 — cage 沿该轴最小边界面反射焊接成对称翻倍笼（Fusion T-spline Mirror） */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderLeft: '1px solid #cde', paddingLeft: 8 }} title={tStatus('镜像/对称：cage 沿该轴最小边界面反射并焊接成对称翻倍笼（先造一半再镜成对称形）。', lang)}>
        <span style={{ color: '#2a6fb0', fontWeight: 600 }}>{tStatus('镜像', lang)}</span>
        <button className="cs-btn" title={tStatus('沿 X 最小边界面镜像', lang)} onClick={() => void useApp.getState().formMirror(0)}>X</button>
        <button className="cs-btn" title={tStatus('沿 Y 最小边界面镜像', lang)} onClick={() => void useApp.getState().formMirror(1)}>Y</button>
        <button className="cs-btn" title={tStatus('沿 Z 最小边界面镜像', lang)} onClick={() => void useApp.getState().formMirror(2)}>Z</button>
      </span>
      <span style={{ color: '#5a6b78' }}>{tStatus('完成后按顶栏 FINISH FORM', lang)}</span>
    </div>
  )
}

// S133+（多面 NURBS 极点编辑）：浮动面板 — 多面壳显示「面 m/N」循环按钮（v1，无需 mesh faceGroups 改动）。
// cycleEditPolesFace 切面后重读 controlNet + 重置 deltas，PoleNet 自动按新网重渲极点球 → 切面即生效。
function EditPolesPanel() {
  const editPolesMode = useApp((s) => s.editPolesMode)
  const target = useApp((s) => s.editPolesTarget)
  const face = useApp((s) => s.editPolesFace)
  const controlNet = useApp((s) => s.controlNet)
  const lang = useApp((s) => s.lang)
  if (!editPolesMode || target == null || !controlNet) return null
  const nFaces = controlNet.nFaces ?? 1
  return (
    <div style={{ position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', background: '#fff', border: '1px solid #7bb8e8', borderRadius: 8, padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, boxShadow: '0 2px 10px rgba(0,0,0,.12)', zIndex: 60 }}>
      <b style={{ color: '#1572c4' }}>{tStatus('🔵 编辑曲面控制点', lang)}</b>
      <span style={{ color: '#5a6b78' }}>{tStatus('曲面', lang)} #{target + 1}　{controlNet.nu}×{controlNet.nv} {tStatus('极点', lang)}</span>
      {nFaces > 1 && (
        <button className="cs-btn" title={tStatus('多面壳：切换到下一张 B-rep 面编辑（切面会重置未提交嘅拖动）', lang)} onClick={() => void useApp.getState().cycleEditPolesFace()}>
          {tStatus('面', lang)} {(face ?? 0) + 1}/{nFaces} ⟳
        </button>
      )}
      <button className="cs-btn" title={tStatus('退出编辑曲面控制点', lang)} onClick={() => useApp.getState().toggleEditPoles()}>{tStatus('✕ 完成', lang)}</button>
    </div>
  )
}

// T782：干涉高亮清除 chip — 有红区先出现（蒙住模型时一键收走）
function InterfClearChip() {
  const n = useApp((s) => s.interfHits.length)
  const lang = useApp((s) => s.lang)
  if (!n) return null
  return (
    <button
      className="vp-measure"
      style={{ left: '50%', transform: 'translateX(-50%)', bottom: 64, top: 'auto', position: 'absolute', background: '#fff0f0', border: '1px solid #e03131', color: '#c92a2a', cursor: 'pointer', fontWeight: 600 }}
      title={tStatus('清除视口中嘅红色干涉重叠区高亮（再撳「干涉检查」会重新计算）', lang)}
      onClick={() => useApp.getState().clearInterf()}
    >{tStatus('✕ 清除干涉高亮（', lang)}{n} {tStatus('处红区）', lang)}</button>
  )
}
