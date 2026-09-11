import { prismaticInwardShell, validShellSolid } from '../cad/prismaticShell'
import { ellipseArcPoint, ellipseArcSweep, type EllipseArcGeometry } from '../sketch/ellipseArcGeometry'
import type { CubicBezierSegment } from '../sketch/splineBezier'
import { shiftBoundSketchFeature, type SketchFaceBinding, type ResolvedSketchFace } from '../cad/sketchFaceBinding'
import type { DimensionExpression } from '../cad/dimensionExpression'
/// <reference lib="webworker" />
import { expose, transfer } from 'comlink'
// T761（S40/③）：换装自编译内核 replicad_plus — replicad 官方 yml 嘅【超集】（原 264 符号全保留 +
// GTransform/ShapeFix_Shape/NurbsConvert/STEPCAFControl_Reader/XCAFApp/TDF_LabelSequence/GeomFill_*），
// 构建配方喺 _occt-build/custom_build_plus.yml，docker run donalffons/opencascade.js 一条命令重现。
import opencascade from '../kernel/replicad_plus.js'
import wasmUrl from '../kernel/replicad_plus.wasm?url'
import { measureVolume, measureArea, setOC, cast, iterTopo, draw, drawCircle, drawSingleEllipse, makeBaseBox, makeBox, makeSphere, makeCylinder, makeHelix, genericSweep, complexExtrude, loft, makeCompound, makeBSplineApproximation, assembleWire, importSTEP, drawProjection, ProjectionCamera, basicFaceExtrusion, loadFont, getFont, drawText, makePolygon, Vector, Plane as RPlane, GCWithScope } from 'replicad'
import { frameTwistTaperSweep } from '../cad/sweepTwist'
import { textToSketchShapes } from '../sketch/textShapes'   // S189：草图文字 → 草图几何（worker 有 'cad' 字体）
import fontUrl from '../fonts/Roboto-Regular.ttf?url'  // S120：Roboto（Apache-2.0）真矢量字体 — 字母有真实内孔（O/A/B/e/8 counters）；取代 kenpixel 像素字体（无孔）。无 GPL/AGPL。
import { edgeFingerprint, edgeFingerprintV2, principalFrame } from '../cad/edgeFingerprint'  // S122：持久边命名 — fillet/chamfer 选边跨重建跟同一几何棱；S134：edgeFingerprintV2/principalFrame = 旋转不变指纹（advisory）
import { fitPrimitives, detectAxisBox, classifyBoxHole } from '../geom/meshFit'  // B4（Mesh→B-rep 参数化推断）：worker 侧重跑分析层（B1-B3 纯 JS）→ 砌真圆柱面；#2b：detectAxisBox/classifyBoxHole = box−cylinder v2 分解
import { faceFingerprint, faceFingerprintV2 } from '../cad/faceFingerprint'  // S125：持久面命名 — shell 抽壳选面跨重建跟同一几何面；S136：faceFingerprintV2 = 旋转不变面指纹（advisory，镜 edgeFingerprintV2）
import { _moveFacePlan } from '../cad/moveFacePlan'  // GM-B2：移动面 v1 纯决策核（朝内 ReplaceFaceNear / 朝外 prism fuse / 倾斜）— 抽离成纯模块以便 Node 测（同 edgeFingerprint 切法）
import { buildEdgeToFaces, topoFaceHash } from '../cad/topoFingerprint'  // #14：面拓扑指纹（邻接环 hash）— 几何指纹撞（对称体）时嘅 tiebreaker（几何为主，本层只破 tie，byte-compat）
import { boolWithHistory, filletWithHistory, collectLineageChain } from '../cad/lineage'  // GM-γ2a：S2 布尔血统 — S1 变换血统喺布尔区间 abort 时，用 OCCT Modified/Generated/IsDeleted 追踪 pick 穿过布尔补位；GM-γ2b：圆角/倒角血统 + 多跳链
import { chordToRadius, betaFromNormals, buildSetbackLaw, edgesShareVertex, bboxExtentsSane } from '../cad/filletMath'  // 圆角／倒角数学核（纯函数，同 tests 共用）
import { fullRoundFilletFromFaces } from '../cad/fullRound'
import { asymmetricFilletNearPoints } from '../cad/asymmetricFillet'
import { hasUnsafeLoftShellAdjacency } from '../cad/loftShellSafety'

export type MeshData = { resolvedSketchFaces?: Record<string, ResolvedSketchFace>; vertices: number[]; triangles: number[]; normals: number[]; faceGroups?: { start: number; count: number; faceId: number }[]; warnings?: string[]; failed?: { id: string; type: string; msg: string }[]; parked?: { name: string; vertices: number[]; triangles: number[]; normals: number[]; faceGroups?: { start: number; count: number; faceId: number }[] }[]; resolvedEdgeFp?: Record<string, string[]>; resolvedEdgeFpV2?: Record<string, string[]>; resolvedFaceFp?: Record<string, string[]>; resolvedFaceFpV2?: Record<string, string[]>; resolvedFaceFpTopo?: Record<string, string[]> }  // resolvedEdgeFp（S122）= 本次首次解析嘅 fillet/chamfer 边指纹；resolvedEdgeFpV2（S134）= 平行嘅旋转不变指纹；resolvedFaceFp（S125）= shell 抽壳面指纹；resolvedFaceFpV2（S136）= 平行嘅旋转不变面指纹；store 写回 feature.edgeFp/edgeFpV2/faceFp/faceFpV2 做持久命名  // failed（S107）= 逐特征隔离：重建时 throw 嘅坏特征 {id,type,错因}，其余照常建（build past，唔 revert 整树）。parked = 多实体（T728）：活动实体以外嘅 bodies（灰显渲染）; faceGroups（S99）= 逐 B-rep 面三角 run（start/count 系 triangles 下标，faceId=hashCode）→ 共面分割子面可分开拣/着色
export type EdgeSel = 'all' | 'top' | 'bottom' | 'vertical'
export type Plane = 'XY' | 'XZ' | 'YZ'
// Unit normal of each sketch plane (the direction extrude/offset travels).
const PLANE_N: Record<Plane, [number, number, number]> = { XY: [0, 0, 1], XZ: [0, 1, 0], YZ: [1, 0, 0] }
// Sign of replicad's actual extrude direction along PLANE_N for each named plane
// (XY→+Z, YZ→+X, but XZ extrudes toward −Y). Needed to centre a symmetric through-cut.
const RES_SIGN: Record<Plane, number> = { XY: 1, XZ: -1, YZ: 1 }
export type DrawView = { name: string; vb: string; visible: string[]; hidden: string[]; hatch?: string[]; cutFrac?: number; cutAxis?: 'Y' | 'X' }  // hatch = 剖面（切面轮廓闭合 path，panel 45° 纹理填充）；cutFrac = 剖切位置（0-1 沿深度，T749）；cutAxis = 剖切轴（T791：Y=沿深度睇前视、X=沿阔度睇侧视）

export type RectProfile = { kind: 'rect'; a: [number, number]; b: [number, number] }
export type CircleProfile = { kind: 'circle'; c: [number, number]; r: number }
export type PolyProfile = { kind: 'poly'; cubics?: CubicBezierSegment[]; pts: [number, number][]; smooth?: boolean; conic?: boolean; arc?: { a: [number, number]; b: [number, number]; m: [number, number] }; verts?: [number, number][]; bulges?: number[]; earc?: EllipseArcGeometry }  // conic（S177）→ smooth 在线点 + 闭合时收笔走【直弦】（唔好 smoothSplineTo 返起点 → 弦边鼓起）  // arc → TRUE circular arc edge (threePointsArcTo), pts are display-only; verts+bulges → mixed line/arc path; earc（S101）→ TRUE elliptical arc edge (ellipseTo)+chord close, pts display-only, sweep 由 store 按草图平面镜射定向（XZ/raw=逆时针 true，XY/YZ=顺时针 false）
export type EllipseProfile = { kind: 'ellipse'; c: [number, number]; rx: number; ry: number; rot?: number }  // S87：真椭圆边（drawSingleEllipse 单曲线，非 48 边形）— rx/ry = x/y 半轴，rot=旋转°
export type SketchProfile = (RectProfile | CircleProfile | PolyProfile | EllipseProfile) & { holes?: SketchProfile[]; islands?: SketchProfile[] }
export type BoolOp = 'new' | 'join' | 'cut' | 'intersect' | 'newbody'   // P2 五选项：newbody=独立泊车体（唔并入活动体；同 type:'newbody' 特征相反 — 嗰个系泊走【当前】体）

// A parametric feature: replayed in order to (re)build the body.
// A zero-geometry timeline marker paired with transform(copy), matching Fusion's CopyPasteBodies entry.
export type CopyBodyFeature = { id: string; type: 'copybody'; name?: string }

export type Feature =
  | CopyBodyFeature
  // Hole stays as one persisted timeline item.  The store expands it into the
  // existing cut features immediately before kernel rebuild, so the worker
  // never needs a parallel Hole implementation.
  | { id: string; type: 'hole'; kind: 'simple' | 'counterbore' | 'countersink' | 'tapped'; center: [number, number]; centers?: [number, number][]; pattern?: { kind: 'bolt-circle'; origin: [number, number]; count: number; pcd: number }; top: number; diameter: number; nominalDiameter?: number; clearance?: number; through?: boolean; depth?: number; extent?: 'distance' | 'through-all' | 'to-next' | 'to-object'; nextFaceZ?: number | null; toFace?: { near: [number, number, number]; faceFp?: string[]; faceFpV2?: string[]; faceFpTopo?: string[]; offset?: number }; chamfer?: number; drillPoint?: { angle: number }; counterbore?: { diameter: number; depth: number }; countersink?: { diameter: number; angle: number }; tap?: { drillDiameter: number; nominalDiameter: number; pitch: number; fine?: boolean } }
  | { id: string; type: 'extrude'; sketchFaceBinding?: SketchFaceBinding; exactDistance?: boolean; distanceExpression?: DimensionExpression & { measure: 'whole' | 'half'; flip?: boolean }; profile: SketchProfile; height: number; operation: BoolOp; baseZ?: number; twist?: number; symmetric?: boolean; plane?: Plane; through?: boolean; inward?: boolean; inwardDepth?: number; faceOutSign?: number; draft?: number; down?: boolean; toFace?: { near: [number, number, number]; n?: [number, number, number]; faceFp?: string[]; faceFpV2?: string[]; faceFpTopo?: string[]; offset?: number }; arbPlane?: { o: [number, number, number]; xd: [number, number, number]; n: [number, number, number] }; extent?: 'next' /* GM-W5 5.2：到下一面标记 — worker 不读几何（height 创建时已烘焙成实停距，净系 META 显示/编辑对话框认得 */; sketchId?: string /* 草图源 id（store.sketchSources）— 重开草图编辑用，worker 不读 */ }
  | { id: string; type: 'revolve'; sketchFaceBinding?: SketchFaceBinding; axisReference?: 'sketch' | 'world'; profile: SketchProfile; angle: number; axis?: 'X' | 'Y'; axisV?: [number, number, number]; axisOrigin?: [number, number, number] /* T781：任意轴（构造轴/偏离原点），优先于 axis */; plane?: Plane; baseZ?: number; arbPlane?: { o: [number, number, number]; xd: [number, number, number]; n: [number, number, number] } /* Arbitrary datum/planar-face sketch frame. */; op?: BoolOp; wall?: number; symmetric?: boolean /* S191：两侧/对称 — 部分角(0<ang<360)绕轴均分跨越截面平面（Fusion symmetric revolve）*/; sketchId?: string /* T746：旋转特征都可重开草图编辑 — worker 不读 */ }
  | { id: string; type: 'fillet'; radius: number; edges?: EdgeSel; near?: [number, number, number]; nears?: [number, number, number][]; radius2?: number; radii?: number[]; chain?: boolean; edgeFp?: string[]; edgeFpV2?: string[]; mode?: 'chord'; chord?: number; setbackRatio?: number; continuity?: 'G1' | 'G2'; continuities?: ('G1' | 'G2')[]; asymmetric?: { offset2: number; flip?: boolean }; rule?: { mode: 'all' | 'between'; faces1: [number, number, number][]; faces2?: [number, number, number][] }; fullRound?: { side1: [number, number, number][]; center: [number, number, number][]; side2: [number, number, number][] } }  // R1 修改圆角：普通多组 + Asymmetric + Rule Fillet + Full Round。Full Round 无半径输入，由三组面推导完整相切圆柱 blend。
  | { id: string; type: 'chamfer'; distance: number; edges?: EdgeSel; near?: [number, number, number]; nears?: [number, number, number][]; dist2?: number; angle?: number; cmode?: 'equal' | 'two' | 'angle'; refFaceNear?: [number, number, number]; flip?: boolean; chain?: boolean; distances?: number[]; edgeFp?: string[]; edgeFpV2?: string[] }  // refFaceNear = Distance and Angle 用户真正点中参考面的内点（重算时从边的两个相邻面中解析）；edgeFp（S122）= 持久边指纹（同上）；edgeFpV2（S134）= 旋转不变指纹（同上）；distances（GM-3DV3 M7）= 逐边距离（equal 模式，与 nears 平行）
  // R1 面圆角 face-fillet（clean-room 窄版）：拾【两张唔相邻嘅面】+ 半径 → 平面/柱面对解析切点 → G1 blend 带（MakeFilling/BridgeG1）。
  //   near1/near2 = 两拾面近点（CAD 坐标，解析为 TopoDS_Face，行 shell 拾面口径）。产出泊车 blend 曲面 + 试缝回实体（HARD FLOOR：任何失败/退化 → 原实体不变）。
  //   窄版覆盖平面/柱面对（常见工况）；一般曲面滚球后置（诚实标注）。STRICTLY ADDITIVE — 旧档无此 type 行为不变。
  | { id: string; type: 'facefillet'; radius: number; near1: [number, number, number]; near2: [number, number, number]; faceFp?: string[]; faceFpV2?: string[]; faceFpTopo?: string[] }
  | { id: string; type: 'shell'; thickness: number; nears?: [number, number, number][]; direction?: 'inside' | 'outside' | 'both'; closed?: boolean; tangentChain?: boolean; faceFp?: string[]; faceFpV2?: string[]; faceFpTopo?: string[] }  // faceFp（S125）= 持久面指纹（开口面跨重建跟同一几何面，缺省退回 near-point）；faceFpV2（S136）= 旋转不变面指纹（与 faceFp 平行索引）— 上游刚体旋转后仍跟同一面，仅在框架 wellConditioned 且唯一时采信，否则退回 faceFp；direction（GM-3DV3 M2）= 壁厚方向 inside(缺省,向内,外形保留)/outside(负厚度向外生长)/both(先外扩半壁再向内抽壳,壁跨原边界)；closed=Fusion 封闭实体抽壳（外壳减内核）；tangentChain=沿共享边扩展 G1 面链；缺省字段保持旧档行为
  | { id: string; type: 'pattern'; countX: number; countY: number; dx: number; dy: number; countZ?: number; dz?: number; targets?: string[] /* T781：净阵列所选特征（snapshot-delta，同 circPattern） */; dir1?: [number, number, number]; dir2?: [number, number, number] /* S 构造轴方向：Direction-1/2 单位方向；缺省 ⇒ 世界轴 [1,0,0]/[0,1,0]（旧档逐字节回放） */; bodies?: boolean /* #7 Object Type=Bodies：连泊车体一齐阵列（每个泊车体 fuse 自己嘅栅格副本）；缺省 ⇒ 只阵列活动体（旧档逐字节） */; symX?: boolean; symY?: boolean; symZ?: boolean /* #pattern：各轴对称（原件居中，副本两边铺；仅奇数计数生效，偶数退单向）；缺省单向逐字节 */; suppress?: boolean[] /* GM-3DV1 S3：逐实例抑制遮罩 — 线性索引 idx=(i*cy+j)*cz+k，suppress[idx]=true 跳过该副本（seed idx=0 恒保留）；缺省 ⇒ 全出（旧档逐字节） */; compute?: 'optimized' | 'identical' | 'adjust' /* GM-3DV1 S3：Compute Option 直通提示（元数据，worker 不读几何）— 仅记录 Fusion 计算模式意图 */; objectType?: 'bodies' | 'faces' | 'features' | 'components'; nears?: [number, number, number][]; faceFp?: string[]; faceFpV2?: string[]; faceFpTopo?: string[] }
  // Geometric Pattern V1: explicit rigid instances of selected timeline features.
  // The seed remains the original feature; instances contains copies only.
  | { id: string; type: 'geoPattern'; targets: string[]; instances: { translation?: [number, number, number]; rotation?: { angle: number; origin: [number, number, number]; axis: [number, number, number] } }[]; suppress?: boolean[]; compute?: 'optimized' | 'identical' | 'adjust'; objectType?: 'features' }
  | { id: string; type: 'pathpattern'; path: [number, number][]; path3?: [number, number, number][]; count: number; targets?: string[] /* T781 */; orient?: 'identical' | 'path' /* keep seed orientation or align each instance to its local path tangent */ }
  // 特征级阵列（组节点）：把基础草图拉伸组（凸台/孔，subs = 各拉伸轮廓+参数）复制成 cols×rows 网格。
  // store 喺送 worker 前 expandFeats() 展开成 N 个 extrude（worker 几何零改动）；时间轴只见一个节点、可改行列数。
  | { id: string; type: 'featpattern'; cols: number; dx: number; rows: number; dy: number; subs: { profile: SketchProfile; height: number; operation: BoolOp; baseZ?: number; through?: boolean; plane?: Plane; twist?: number; symmetric?: boolean; draft?: number; down?: boolean; arbPlane?: { o: [number, number, number]; xd: [number, number, number]; n: [number, number, number] } }[] }
  // 拉伸组（多轮廓一次拉伸 → 一个时间轴节点）：subs = 各轮廓+各自参数，共享一个 height（改 height 即全部一齐变）。store expandFeats() 送 worker 前展开成 N 个 extrude（worker 零改动）。
  | { id: string; type: 'extgroup'; sketchFaceBinding?: SketchFaceBinding; height: number; sketchId?: string; subs: { profile: SketchProfile; operation: BoolOp; baseZ?: number; twist?: number; symmetric?: boolean; plane?: Plane; through?: boolean; inward?: boolean; inwardDepth?: number; faceOutSign?: number; draft?: number; down?: boolean; arbPlane?: { o: [number, number, number]; xd: [number, number, number]; n: [number, number, number] } }[] }
  | { id: string; type: 'prim'; shape: 'box' | 'sphere' | 'torus' | 'cone' | 'wedge' | 'dome' | 'halfcyl' | 'pie'; a: number; b: number; c: number; op?: BoolOp; sides?: number; outerTrue?: boolean /* GM-W8 β1-#29：torus 专用 — 有此 flag 时 a=真外半径（中线半径=a−管半径）；缺=旧语义 a=中线半径 */ }
  // Automated Modeling Connector v1 core: an analytic connector between two
  // face-derived seed points. UI may only create this after two planar-face
  // picks; the feature itself stays deterministic and replayable.
  | { id: string; type: 'automatedmodel'; a: [number, number, number]; b: [number, number, number]; radius: number; op?: 'newbody' }
  | { id: string; type: 'mirror'; plane: Plane; offset?: number; targets?: string[] /* T781：净镜像所选特征（snapshot-delta） */; planeN?: [number, number, number]; planeO?: [number, number, number] /* T781：任意基准面（法向+面上一点，优先于 plane/offset） */; op?: 'newbody' /* #7b（audit REAL）：镜像副本泊车做独立体（唔 fuse 入活动体）；缺省 ⇒ Join 融合（旧档逐字节） */ }
  | { id: string; type: 'loft'; bottom?: SketchProfile; top?: SketchProfile; height?: number; op?: BoolOp; sections?: { profile: SketchProfile; z: number; plane?: Plane; arbPlane?: { o: [number, number, number]; xd: [number, number, number]; n: [number, number, number] } }[]; ruled?: boolean; wall?: number; sketchIds?: string[] /* T753：逐截面草图源 id（顺序对应 sections）— worker 不读 */; rails?: [number, number][][] /* T772：导轨 — 每條 rail 點列（第 i 點對應 sections 選取次序）；v1 只用 rails[0]（內核單 auxiliary spine 槽） */; capPoint?: [number, number, number]; capEnd?: 'first' | 'last' /* S：放样封口构造点 — capPoint 在 capEnd 端用顶点封口成真水密尖（鼻锥/漏斗/钻尖）；缺省 ⇒ 旧 loftWith 路径逐字节回放 */; continuity?: 'C1' | 'C2' /* S：放样端条件 — C1=切线连续(G1 等价)、C2=曲率连续(G2 等价)，走裸 ThruSections.SetContinuity+SetSmoothing；缺省 ⇒ 旧 loftWith 路径逐字节回放 */; closed?: boolean /* #8 Fusion Loft Closed：末截面接返首截面成闭环回路（环状件）；ThruSections 无 periodic 旗 → 复制首 wire 落尾做 C0 近似(诚实标) */ }
  | { id: string; type: 'sweep'; r: number; op?: BoolOp; path?: [number, number][]; path3?: [number, number, number][]; smoothPath?: boolean; wall?: number; profile?: SketchProfile; sketchId?: string; guide?: [number, number][]; twist?: number; scale?: number; orient?: 'perp' | 'parallel' }  // path3 = TRUE 3D spine; profile = 任意草图截面（T742）; sketchId = 草图源（T748）; guide = 导轨（T755 auxiliarySpine — 截面跟住导轨转向，Fusion guide rail 同款）; twist = 沿路径扭转角°（S：MakePipeShell 多 section RMF）; scale = 末端截面缩放（taper，1=不变）; orient（GM-3DV1 S5）= 截面朝向 Fusion Orientation：perp=⊥脊线（缺省 forceProfileSpine）/ parallel=保持初始朝向不随脊线转（forceProfileSpine:false，逐字节旧档=perp）
  | { id: string; type: 'coil'; pitch: number; height: number; radius: number; wireR: number; op?: BoolOp; r2?: number }
  | { id: string; type: 'thread'; d: number; pitch: number; height: number; op?: BoolOp }
  // T775（S55-③）：选面加外螺纹 — 喺【现有圆柱面】身上包牙（d=面直径=牙底，向外加牙深）。
  // 结果系 compound（螺旋面 fuse 唔可三角化 — thread/ithread 同一教训）：之后唔好倒角/STEP，STL 正常。
  | { id: string; type: 'othread'; d: number; pitch: number; height: number; x?: number; y?: number; z0?: number; cosmetic?: boolean; lefthand?: boolean; cls?: string; standard?: string }   // cosmetic=纯外观标注（B-rep 零触碰 — 可继续圆角/STEP）；缺省=真牙旧行为；lefthand=左旋牙（Fusion Left hand，缺省右旋逐字节）；cls/standard（GM-3DV1 S11）=配合等级/标准库，纯元数据（几何用 60° ISO 形，牙深由 pitch 定）
  | { id: string; type: 'ithread'; d: number; pitch: number; height: number; x?: number; y?: number; z0?: number; cosmetic?: boolean; lefthand?: boolean; cls?: string; standard?: string }  // 内螺纹孔（母螺纹）；cosmetic=纯外观标注（连钻孔都唔做 — 孔身用「孔」工具）：喺实体 cut 一个有牙嘅孔；z0 = 孔底 z（P2 孔对话框「建模螺纹」盲孔由顶面向下切 — 缺省 0 = 旧行为，旧档逐字节兼容）；lefthand=左旋牙；cls/standard（GM-3DV1 S11）=纯元数据
  | { id: string; type: 'cylpatch'; mode: 'boss' | 'pocket' | 'flat'; ang: number; arc: number; zc: number; h: number; depth: number }
  | { id: string; type: 'sheetmetal'; thickness: number; radius: number; kfactor: number; width: number; segs: number[]; angles: number[]; flat?: boolean }
  | { id: string; type: 'gear'; module: number; teeth: number; thickness: number; bore: number; phase?: number; helix?: number; op?: BoolOp }  // helix（T770 斜齿轮）：螺旋角 β°，正=右旋 — 端面渐开线扭转近似（m 当端面模数，中心距公式不变）
  // T770（S49）：蜗杆 — ZA 形近似（梯形廓沿螺旋扫掠，thread 机器同款 compound 路线 — 螺旋面 fuse 后唔可三角化）。
  // 啮合系纯运动学比 starts:z_wheel。starts = 头数。
  | { id: string; type: 'worm'; module: number; starts: number; length: number; op?: BoolOp }
  // T770（S49）：冠齿轮（面齿轮近似形）— 盘 + z 个径向梯形齿喺顶面分度圆，垂直轴啮合纯运动学。
  | { id: string; type: 'crowngear'; module: number; teeth: number; discH: number; faceW: number; bore: number; op?: BoolOp }
  | { id: string; type: 'rack'; module: number; length: number; baseH: number; thickness: number; op?: BoolOp }
  | { id: string; type: 'pulley'; diameter: number; width: number; bore: number; op?: BoolOp }
  | { id: string; type: 'scale'; factor: number; sx?: number; sy?: number; sz?: number; px?: number; py?: number; pz?: number; anchorCenter?: boolean }  // px/py/pz（P2）：缩放基准点（CAD），缺省=世界原点（旧档逐字节回放）；anchorCenter（新建默认）：无显式点时用 bbox 中心锚（免离心体飞走）  // sx/sy/sz（T762 ③后）：非等比三轴缩放（GTransform）— 任一有值即用非等比路径
  | { id: string; type: 'draft'; angle: number; neutralOrigin?: [number, number, number]; neutralNormal?: [number, number, number]; sideNears?: [number, number, number][]; faceFp?: string[]; faceFpV2?: string[]; faceFpTopo?: string[] }  // S101[5]：拾中性面 + 拾侧面集（向后兼容旧 draft：缺字段 = XY 中性 + 全非平行侧面）; faceFp（S129）= 侧面集持久面指纹（与 sideNears 平行）; faceFpV2（S136）= 旋转不变面指纹（与 faceFp 平行）
  | { id: string; type: 'cpattern'; count: number; angle: number; axis?: 'X' | 'Y' | 'Z'; cx?: number; cy?: number; cz?: number }
  // 環形阵列（T757 — 抄足 Fusion）：对象=整个实体（无 targets）或指定特征（targets=特征 id，snapshot-delta 重切/重融）；
  // 任意轴（origin+dir，CAD 坐标）；mode: full=均分 360（副本唔叠原件）/ angle=端点含 / sym=对称（±k·step，偶数偏 + 侧）
  | { id: string; type: 'circPattern'; targets?: string[]; origin: [number, number, number]; dir: [number, number, number]; count: number; totalAngle: number; mode: 'full' | 'angle' | 'sym'; suppress?: boolean[] /* GM-3DV1 S3：逐实例抑制 — 索引 0=seed(0°)、1..count-1=依 cpAngles 顺序嘅副本；suppress[i]=true 跳过（缺省 ⇒ 全出，旧档逐字节） */; compute?: 'optimized' | 'identical' | 'adjust'; objectType?: 'bodies' | 'faces' | 'features' | 'components'; nears?: [number, number, number][]; faceFp?: string[]; faceFpV2?: string[]; faceFpTopo?: string[] }
  | { id: string; type: 'transform'; origin?: [number, number, number]; dx: number; dy: number; dz: number; rz: number; rx?: number; ry?: number; copy?: boolean }   // copy（GM-3DV3 M1 Create Copy）：留原件、fuse 一个变换后副本（Fusion Move/Copy 嘅复制半边）；缺省=就地变换（旧档逐字节）
  | { id: string; type: 'pushpull'; near: [number, number, number]; nears?: [number, number, number][]; dist: number; dir?: [number, number, number]; offsetType?: 'modify' | 'new' | 'auto'; faceFp?: string[]; faceFpV2?: string[]; faceFpTopo?: string[] }  // faceFp（S128/S125 扩展）= 拾取面持久面指纹（缺省退回 near-point）；faceFpV2（S136）= 旋转不变面指纹（与 faceFp 平行）；dir（S192）= 任意方向移面向量（缺省=沿面法向，即旧按拉）；offsetType（GM-3DV3 M5 Offset Type）= Fusion Press Pull 面偏移嘅 Offset Type 元数据（modify/new/auto）— worker 不读几何（webcad 恒加节点=New 语义）
  | { id: string; type: 'rib'; path: [number, number][]; thickness: number; height: number; baseZ?: number; arbPlane?: { o: [number, number, number]; xd: [number, number, number]; n: [number, number, number] }; op?: BoolOp; draft?: number /* S191：拔模角°——筋身向远端逐渐收窄（注塑/冲压脱模），逐段 base→top 锥化 loft */; thDir?: 'sym' | 'one' /* GM-3DV1 S1：厚度方向 — sym=中心线两側各半（旧行为，缺省）/ one=全部厚度落中心线单侧(+法向) */; extent?: 'next' | 'distance' /* GM-3DV1 S1：范围 — next=有实体时落到实体底并融合（旧行为，缺省）/ distance=永远向上 height（就算有实体） */; flip?: boolean /* GM-3DV1 S1：翻转筋挤出方向（up↔down） */; extend?: boolean /* GM-3DV1 S1（Web Extend Curves）：把开放折线端点沿末段方向外延（有实体时钳到实体 XY 包围盒边，令筋网到墙；无实体 = 固定外延），令交叉/近墙筋网自动闭合 */ }
  | { id: string; type: 'text'; text: string; size: number; height: number; op: BoolOp; plane?: Plane; baseZ?: number; x?: number; y?: number; arbPlane?: { o: [number, number, number]; xd: [number, number, number]; n: [number, number, number] } }  // S162 Emboss：arbPlane = 落喺拾中嘅面上（沿法向 raise/engrave），无 = 旧 XY 文字
  // 独立草图（T756）：纯 2D 草图特征 — 无实体输出，净系喺时间轴锚住一个 sketchSources 入口（Fusion「完成草图」同款）。
  // 对 pattern/cpattern 嘅 prevBefore 邻接逻辑完全透明（见 buildShape 三处 sketch 跳过）。
  | { id: string; type: 'sketch'; sketchId?: string; sketchFaceBinding?: SketchFaceBinding; plane?: Plane; baseZ?: number; arbPlane?: { o: [number,number,number]; xd: [number,number,number]; n: [number,number,number] } }
  // GM-W5 5.1：参考面 / datum 平面 = 真时间轴特征（零几何 —— 同独立草图一样纯占位节点）。base/offset/angle/aaxis/arb/src
  // 由 store 映射自 planes[] 元素形状（而家 planes[] 反过来由呢啲 datum 特征派生）。rebuild 回放时【SKIP】（贡献零几何）。
  // stale = 关联源面（有 src）搵唔返，rederiveDatums 写返落 feature（诚实黄标，几何唔郁）。
  | { id: string; type: 'datum'; base: string; offset: number; angle?: number; aaxis?: 'x' | 'y'; arb?: { o: [number, number, number]; xd: [number, number, number]; n: [number, number, number] }; src?: unknown; stale?: boolean }
  | { id: string; type: 'delface'; near: [number, number, number]; nears?: [number, number, number][]; faceFp?: string[]; faceFpV2?: string[]; faceFpTopo?: string[] }  // T795：直接编辑删面（去特征 + 治愈，DirectEditWrapper.DeleteFaceNear）; faceFp（S129）= 持久面指纹；faceFpV2（S136）= 旋转不变面指纹（与 faceFp 平行）
  | { id: string; type: 'surfloft'; sections: { pts: [number, number][]; z: number }[]; wall: number; ruled?: boolean; sheet?: boolean; op?: BoolOp }  // T792：开放截面薄壳放样（曲面工作流 v1）；S181 sheet=零厚放样曲面（开放 wire + returnShell，ruled:false 时为光滑 ThruSections 插值，有别于永远直纹嘅 ruled 命令）
  | { id: string; type: 'surfpatch'; pts: [number, number, number][]; thick: number; op?: BoolOp }  // T805（S74）曲面 Patch：拾闭合边界 3D 点 → 填充曲面 + 加厚薄板（PatchWrapper.FillThicken）
  | { id: string; type: 'boundarypatch'; nears: [number, number, number][]; edgeFps?: string[]; tangent?: boolean; thick?: number }  // S 边界补面：拾【现有棱】（实体/泊车曲面上）→ BRepOffsetAPI_MakeFilling 填充 N 边洞/封口，可选 G1 相切；输出曲面体（parked）。nears = 拾边近点（CAD 坐标，解析为 TopoDS_Edge，行 fillet near-point lineage）；edgeFps = 持久边指纹（与 nears 平行，未来跨重建追踪用，缺省退回 near 解析）；tangent = G1 相切（邻面可解析时用 Add_2 否则退 C0）；thick>0 = 顺手加厚成实体薄板（缺省 0 = 净曲面）。STRICTLY ADDITIVE — 旧档无此 type 行为不变。
  | { id: string; type: 'surfbridge'; nears: [number, number, number][]; thick?: number }  // Surface Bridge v1：拾 2 条现有棱 → ThruSections 两 wire 光滑过渡面（对称 C1；G2=wasm hard-fault 永不加）
  | { id: string; type: 'surfsew'; tol?: number }  // S86 曲面缝合 Stitch：把所有曲面/壳体（parkedBodies）的面缝成一个 shell；闭合则转实体（BRepBuilderAPI_Sewing + ShapeFix_Solid）
  | { id: string; type: 'surfunstitch' }  // S88 取消缝合 Unstitch：把曲面/壳体拆回逐张独立面（缝合的逆操作）
  | { id: string; type: 'surfextrude'; profile: SketchProfile; height: number; plane?: Plane; baseZ?: number; open?: boolean; symmetric?: boolean; down?: boolean }  // S89 曲面拉伸：开放草图→零厚 sheet / 闭合草图→无盖 tube（complexExtrude shellMode），出 parked 曲面体；S162：symmetric=对称双向、down=反向
  | { id: string; type: 'surfsweep'; profile: SketchProfile; path: [number, number][]; path3?: [number, number, number][]; plane?: Plane; baseZ?: number; op?: BoolOp }  // S曲面：开放截面沿开放路径 genericSweep → 零厚开放曲面壳（风道/导流板/管壁皮），出 parked 曲面体（要实体再「加厚」/「缝合」）。镜 surfextrude 开放 wire idiom + sweep path3 spine。
  | { id: string; type: 'surfrevolve'; profile: SketchProfile; angle: number; axis?: 'X' | 'Y'; axisV?: [number, number, number]; axisOrigin?: [number, number, number]; plane?: Plane; baseZ?: number; op?: BoolOp }  // S曲面：开放截面绕轴旋转 → 零厚开放旋转曲面壳（灯罩/喷嘴/花瓶皮），出 parked 曲面体。镜 revolve 轴 idiom + surfextrude 开放 wire。
  | { id: string; type: 'ruled'; sections: { pts: [number, number][]; z: number }[]; op?: BoolOp }  // S100 规则曲面 Ruled：两条开放折线间纯零厚直纹 Shell（standalone loft ruled+returnShell），出 parked 曲面体
  | { id: string; type: 'surftrim'; target: number; plane: Plane; offset: number; keep: 'pos' | 'neg'; planeOrigin?: [number, number, number]; planeNormal?: [number, number, number] }  // S100 曲面平面裁剪：半空间盒 intersect parked 曲面壳，留一侧。S157：planeOrigin+planeNormal = 任意平面（拣面/输 origin+normal）裁；缺省退回轴对齐 plane/offset（旧档逐字节回放）。keep 对任意平面 = pos 留法向正侧 / neg 留反侧。
  | { id: string; type: 'surfsurftrim'; target: number; tool: number; keep: [number, number, number] }  // S155 曲面-曲面裁剪：用第二张泊车曲面（tool>=0）或活动实体（tool=-1）做裁刀，imprint 分割目标曲面，留 keep 世界点最近嗰连通片。STRICTLY ADDITIVE — 旧档无此 type 行为不变。
  | { id: string; type: 'untrim'; target: number }  // S141 去裁 Untrim（surftrim 的逆）：丢弃裁剪边界，把每张面重建到底层几何曲面的完整自然 UV 范围（MakeFace 无 wire）。target=parkedBodies 索引。纯 JS，无内核重建。
  | { id: string; type: 'mergefaces'; target: number; lin?: number; ang?: number }  // S 合并面 Unify-Same-Domain：把泊车曲面/壳上同域（共面/共柱）邻面合并成一张面（ShapeUpgrade_UnifySameDomain，复用 worker:1050 idiom）。target=parkedBodies 索引；lin/ang=线性/角度容差（缺省 1e-5 / 0.01）。纯 JS，无内核重建。STRICTLY ADDITIVE — 旧档无此 type 行为不变。
  | { id: string; type: 'editpoles'; target: number; face?: number; deltas: [number, number, number][] }  // S133 NURBS 曲面极点编辑：target=parkedBodies 索引；deltas=逐极点世界偏移(row-major，长 NbU*NbV，多数[0,0,0])。基极点每次重建由内核 NurbsConvert+Poles_2 重导再叠 deltas（特征小、稳健）。GeomConvert→SetPole_1→MakeShell，行 makeEllipsoid idiom，纯 JS 无内核重建。  // S133+（多面）：face = 编辑【哪一张 B-rep 面】嘅控制网（缺省 0 → 旧档逐字节回放 faces[0]）。多面壳逐面 SetPole + 保 trim MakeFace_21 + Sewing 重组其余 N-1 面，唔再塌成单张全面 patch。
  | { id: string; type: 'thickenface'; near: [number, number, number]; thick: number; side?: 'pos' | 'neg' }  // T811（S曲面）：加厚拾取面成实体薄板（DirectEditWrapper.ThickenFaceNear）。S156：side='neg' → 传负 thick 翻面（C++ MakeThickSolidBySimple 已认 signed thick）；STRICTLY ADDITIVE — 旧档无 side = 正向 = 逐字节回放。
  | { id: string; type: 'offsetsurf'; near: [number, number, number]; dist: number }  // T812（S曲面）：偏移拾取面成平行曲面（DirectEditWrapper.OffsetSurfaceNear）
  | { id: string; type: 'offsetsolid'; distance: number }  // S 整体偏移实体：BRepOffsetAPI_MakeOffsetShape 均匀偏移所有面（加厚铸件 / 3D 打印壁厚补偿 / 外扩缩）。+ = 外扩,- = 内缩。纯 JS 已绑 API,无内核重建
  | { id: string; type: 'reversesurf'; target: number }  // S157：翻转泊车曲面壳定向（法向反向）— 影响 Thicken/Stitch 方向。target=parkedBodies 索引。.Reversed() 纯拓扑翻向，零内核重建。
  | { id: string; type: 'thickenquilt'; target: number; thick: number; side?: 'pos' | 'neg' }  // S182：加厚【整张泊车曲面/缝合 quilt】成实体（MakeThickSolidBySimple，同 patch-thicken 同款 op）。target=parkedBodies 索引；side='neg' → 负 thick 朝反侧。
  | { id: string; type: 'extendface'; near: [number, number, number]; ext: number }  // S103：曲面延伸（DirectEditWrapper.ExtendFaceNear / BRepLib::ExtendFace 沿自然几何外延）
  | { id: string; type: 'splitface'; near: [number, number, number]; planeOrigin: [number, number, number]; planeNormal: [number, number, number]; splitType?: 'surface' | 'vector' | 'closest'; faceFp?: string[]; faceFpV2?: string[]; faceFpTopo?: string[] }  // S99; faceFp（S129）= 持久面指纹：用平面 imprint 分割拾取面（BRepFeat_SplitShape，等体积、子面可独立拣）；faceFpV2（S136）= 旋转不变面指纹（与 faceFp 平行）；splitType（GM-3DV3 M9）= Fusion Split Type 元数据（surface/vector/closest）— 内核只做平面 imprint（≈Along Vector），surface/closest 记录意图；planeNormal 由 splitFaceAxis 揀（auto=最垂直世界轴 / X/Y/Z=指定方向）
  | { id: string; type: 'silhouettesplit'; view: 'front' | 'back' | 'top' | 'bottom' | 'right' | 'left' }  // Fusion Silhouette Split v1：按已保存嘅正交视图方向分割解析圆柱面；球/自由曲面安全拒绝（不能以展示网格冒充）。
  | { id: string; type: 'replaceface'; near: [number, number, number]; planeOrigin: [number, number, number]; planeNormal: [number, number, number]; faceFp?: string[]; faceFpV2?: string[]; faceFpTopo?: string[] }  // S99; faceFp（S129）= 持久面指纹：平面顶替（把拾取面推入/截到新平面，邻面延伸 — BRepAlgoAPI_Splitter）；faceFpV2（S136）= 旋转不变面指纹（与 faceFp 平行）
  | { id: string; type: 'moveface'; near: [number, number, number]; nears?: [number, number, number][]; dist: number; mode?: 'offset' | 'tilt'; angle?: number; axis?: [number, number, number]; offsetType?: 'modify' | 'new' | 'auto'; faceFp?: string[]; faceFpV2?: string[]; faceFpTopo?: string[] }  // GM-B2 移动面 v1：mode 'offset'（缺省）dist<0=ReplaceFaceNear 朝内重解（邻面/圆角一齐重解）· dist>0=prism fuse 朝外长大（无重解内核路径）；mode 'tilt'=平面绕面心内轴倾 angle°（ReplaceFaceNear 倾斜平面，钳 ±60°）。仅平面面；nears（GM-L2 v2）= 多面串链（缺省=[near] 单面逐字节；逐面顺序内核重解/加料，tilt 只准单面）；offsetType（GM-3DV3 M8 Offset Face）= Fusion Offset Type 元数据（modify/new/auto）— worker 不读几何（webcad 恒加时间轴节点=New 语义；modify/auto 诚实记录）；faceFp/faceFpV2/faceFpTopo = 持久面指纹（与 near/nears 平行，同 pushpull 惯例）
  // ── 多实体（T728）──：newbody = 泊车当前活动实体（计入 bodies 清单）并开新实体；之后嘅特征作用喺新实体。
  // bodyboolean = 活动实体 ⊗ 泊车实体[target]（B-rep 级布尔，参数化、可重放），用完该泊车实体被消耗。
  | { id: string; type: 'newbody'; name?: string }
  | { id: string; type: 'bodyboolean'; bop: 'fuse' | 'cut' | 'common'; target: number; keep?: boolean }  // S185 keep=保留工具体（Fusion Combine「Keep Tools」）；缺省=消耗（逐字节回放旧档）
  // Boundary Fill（当前可靠范围：两个封闭实体）。把活动实体与一个泊车工具体切成 target-only / overlap / tool-only 三个不重叠 B-rep cell；cell 是要保留为活动体的那格，其余有效格保留为泊车实体。不是把 Common 冒充完整 Boundary Fill。
  | { id: string; type: 'boundaryfill'; target: number; cell: 'target' | 'overlap' | 'tool' }
  // S128：分割实体（参数化，保历史）— 轴对齐平面把活动实体切两半，留一半作活动 shape，另一半泊车进
  // parkedBodies（复用多实体灰显路径）。keep='lo'（默认，留 offset 低侧）/'hi'。offset 沿 axis（CAD mm）。
  // STRICTLY ADDITIVE：旧文档无此 type → 行为不变。取代旧 splitBody 嘅破坏性烘焙（features[] 不再清空）。
  | { id: string; type: 'split'; axis: 'X' | 'Y' | 'Z'; offset: number; keep?: 'lo' | 'hi'; nameA?: string; nameB?: string; planeOrigin?: [number, number, number]; planeNormal?: [number, number, number] }  // S184：planeOrigin/planeNormal 在时 = 任意平面切（轴对齐字段忽略）；缺 = 旧式轴对齐（逐字节回放）
  // STEP 导入保留 B-rep（T729）：STEP 文本直接做时间轴特征 — 导入件可以继续 切/圆角/抽壳/再导出 STEP
  // （对比旧「导入 STEP」转网格组件嘅终端路）。step 文本喺 rebuild 前异步解析并按特征 id 缓存。
  | { id: string; type: 'stepbody'; step: string; op?: BoolOp }
  // T767（S46）：网格 → B-rep（Fusion Convert Mesh, Faceted 级）— STL/3MF remix 入时间轴嘅正路。
  // v/t = 烘焙咗世界位姿嘅顶点/三角；缝合成 shell → solid → UnifySameDomain 合并共面（boxy 件出真平面/真边）。
  | { id: string; type: 'meshbody'; v: number[]; t: number[]; op?: BoolOp; fit?: 'faceted' | 'param' | 'prismatic' }  // B4：fit='param' → 圆柱区重建真 Geom_CylindricalSurface（识别失败/未封实体 → 退 faceted，零迴歸）；缺省/faceted = 旧逐三角路（逐字节）

let resolvedSketchFaces: Record<string, ResolvedSketchFace> = {}
let current: any = null
let _stepDbg = ''   // T762 DEV 探针：importStepAssembly 行到边一步（getStepDbg 读）
// Collected per-rebuild: honest notes when an op had to auto-adjust (e.g. fillet radius shrunk to fit, shell thinned).
let buildWarnings: string[] = []
// S107 逐特征隔离：buildShape 重放期间 throw 嘅坏特征清单（{id,type,错因}）—— 用嚟标红 timeline + 跳过续建。
let failedFeatures: { id: string; type: string; msg: string }[] = []
// 多实体（T728）：buildShape 重放期间被 newbody 泊车嘅实体（活动实体以外嘅 bodies）。
let parkedBodies: { name: string; kind?: 'body'; shape: any }[] = []
// S122 持久边命名：本次重建捕获嘅 fillet/chamfer 解析边指纹（feature.id → fp[]）。rebuild 返回畀 store 写回 feature.edgeFp。
let _resolvedEdgeFp: Record<string, string[]> = {}
// 解析器（roundNearPoints 等）首次解析（feature 未有 edgeFp）时写低本次捕获嘅指纹；build loop 读完即清。
let _lastResolvedFp: string[] | null = null
// S134 旋转不变边命名：与 _resolvedEdgeFp 平行嘅 v2 指纹（feature.id → fpV2[]）。rebuild 返回畀 store 写回 feature.edgeFpV2。
let _resolvedEdgeFpV2: Record<string, string[]> = {}
let _lastResolvedFpV2: string[] | null = null
// S125 持久面命名：shell 抽壳首次解析嘅面指纹（feature.id → fp[]），rebuild 返回畀 store 写回 feature.faceFp。
let _resolvedFaceFp: Record<string, string[]> = {}
let _lastResolvedFaceFp: string[] | null = null
// S136：旋转不变面指纹 v2，与 _resolvedFaceFp 平行（feature.id → fpV2[]），rebuild 返回畀 store 写回 feature.faceFpV2。
let _resolvedFaceFpV2: Record<string, string[]> = {}
let _lastResolvedFaceFpV2: string[] | null = null
// #14：面拓扑指纹（邻接面几何类型环 hash），与 _resolvedFaceFp 平行（feature.id → topo[]），rebuild 返回畀 store 写回 feature.faceFpTopo。
let _resolvedFaceFpTopo: Record<string, string[]> = {}
let _lastResolvedFaceFpTopo: string[] | null = null
// ── S1 真拓扑命名（TRANSFORM lineage）：buildShape 重放期间逐特征录低「该特征产出后嘅 active shape」+「该特征系咪
//    拓扑保序变换（transform/scale）」。一条 fillet/chamfer pick 喺当前 shape 解析唔到（漂移信号）时，回头喺最近一个
//    pick 能干净解析嘅旧 shape 度攞返该棱嘅【典范边索引】，再因为纯变换保序（第 i 条边变换前后仍系第 i 条），
//    直接读当前 shape 嘅同一索引边 → 修 S140 对称体上游旋转令圆角漂移。详见 [[webcad-kernel-rebuild-docker]] PHASE 1 DESIGN。
//    内存：每特征 clone 一份 shape（同 _rcSnaps 增量缓存同款 clone 共享底层取舍 — 接受换正确性）。索引键 = 特征序，
//    null = 非实体特征（sketch）。两个数组平行同长（features.length）。仅 transform/scale 标 true（mirror 喺本仓系 fuse 并集，
//    非保序 → 唔标，诚实退回今日 fallback）。
let _shapeHistory: any[] = []
let _transformOpAt: boolean[] = []
let _curOpIndex = -1   // 当前重放到嘅特征序（roundNearPoints 读，决定回望范围）
let _s1FaceCarryActive = false   // S1-面：防 _s1CarryFacePts 内部回调 _ffSelectPts(prior) 再触发 carry（递归）— 只喺顶层 miss 试一次
// ── GM-γ2a：S2 布尔血统（boolean lineage）─────────────────────────────────────────────────────
// S1 变换血统喺 walk-back 撞到【布尔 op】即 gate-3 abort（布尔非保序，S1 唔 claim）。S2 喺该 abort 点补位：
//   resolve pick 喺【布尔前一帧】_shapeHistory[k−1] → 用 OCCT Modified/Generated/IsDeleted（boolWithHistory，
//   raw BRepAlgoAPI 重跑；zero-regression：真 build 照用 replicad sugar，重跑只喺 resolver 内部 on-demand）
//   追踪 pick 穿过布尔 → 后继代表点几何配对 _shapeHistory[k]（拿典范索引）→ 沿 (k,current) 全变换区间读当前边/面。
//   Deleted → 诚实 miss（退回近点 = 今日行为）。全路径 S2_LINEAGE 闸 + try/catch fail-safe（keystone 唔可以令重建挂）。
const S2_LINEAGE = true          // S2 布尔血统总闸（false → 逐字节退回今日 S1-abort→near-point 行为）
const S2_MAX_REEXEC = 8          // 成本控制：每次 rebuild 最多重跑 8 次布尔/圆角（超 → 诚实退回近点，唔拖垮重建）
const S2_MAX_CHAIN = 4           // GM-γ2b：多跳链最长 4 跳（连续布尔/圆角，只由变换相隔）；超 → 诚实退回近点
let _boolOpAt: boolean[] = []    // 平行 _shapeHistory：该格系咪真布尔 op（cut/fuse/intersect，且当时有活动体）
let _boolKindAt: ('cut' | 'fuse' | 'intersect')[] = []   // 该格布尔种类
let _boolToolAt: any[] = []      // 该格布尔【实际用嘅工具体】（clone；含 cut 嘅 −0.5 nudge / extrude overshoot → 重跑几何贴合 _shapeHistory[k]）
let _s2ReExecCount = 0           // 本次 rebuild 已重跑布尔次数（超 S2_MAX_REEXEC 即停）
let _s2Memo: Map<string, [number, number, number][] | null> = new Map()   // 本次 rebuild (k+pickKey) → carried pts 缓存（免 capture/select 重复重跑）
let _s2NotedCap = false          // 本次 rebuild 系咪已出过「超重跑上限」诚实提示（只出一次）
let _s2NotedChainCap = false     // GM-γ2b：本次 rebuild 系咪已出过「多跳链超长上限」诚实提示（只出一次）
let _s2CarriedFlag = false       // 最近一次 _s1Carry* 系咪其实经 S2 布尔血统解析（caller 据此改出准确警告，唔好再叠 S1 那句）
// GM-γ2a：录低一格布尔 op 嘅 kind + 实际工具体（clone），供 S2 backward 重跑。只喺真布尔（有活动体）时叫。
//   tool clone 失败 → 唔录（_boolOpAt[i] 留 falsy → S2 该格自然唔触发 → 退回今日 fallback，安全）。
function _recordBool(i: number, kind: 'cut' | 'fuse' | 'intersect', tool: any): void {
  try { _boolToolAt[i] = tool && tool.clone ? tool.clone() : tool; _boolOpAt[i] = true; _boolKindAt[i] = kind }
  catch { _boolOpAt[i] = false }
}
// ── GM-γ2b：S2 圆角/倒角血统 + 多跳 ─────────────────────────────────────────────────────────────
// 布尔靠 BRepAlgoAPI，圆角/倒角靠 BRepFilletAPI（另一套 ctor，但 Modified/Generated/IsDeleted 同款可用 —
//   filleted 棱 IsDeleted=true、相邻面 Modified→trimmed 新面）。同布尔一样喺 walk-back 撞到时补位，惟重跑圆角比布尔贵
//   → 共用同一 S2_MAX_REEXEC 预算 + memo。录低【实际圆/倒嘅棱（以 mids 表征，重跑时落 prior 几何解析返 TopoDS）+ 半径】。
interface FilletOpRec { kind: 'fillet' | 'chamfer'; mids: [number, number, number][]; radii: number[] }
let _filletOpAt: (FilletOpRec | null)[] = []   // 平行 _shapeHistory：该格系咪 recorded 圆角/倒角 op（含所圆棱 mids + 半径）
// 录低一格圆角/倒角 op。mids = 最终解析边集中点（落 prior 几何 _edgeIndexNearestMid 反查返 TopoDS），radii 与 mids 平行。
//   任何缺 → 唔录（_filletOpAt[i] 留 null → S2 该格自然唔触发 → 退回今日 fallback，安全）。
function _recordFillet(i: number, kind: 'fillet' | 'chamfer', mids: [number, number, number][], radii: number[]): void {
  try {
    if (!mids || !mids.length || !radii || radii.length !== mids.length) { _filletOpAt[i] = null; return }
    _filletOpAt[i] = { kind, mids: mids.map((m) => [m[0], m[1], m[2]] as [number, number, number]), radii: radii.slice() }
  } catch { _filletOpAt[i] = null }
}
// 一格系咪 recorded S2 op（boolean 或 fillet/chamfer）—— collectLineageChain 嘅 isRecorded 谓词。
function _s2IsRecordedOp(i: number): boolean {
  return !!(_boolOpAt[i] && _boolToolAt[i]) || !!_filletOpAt[i]
}
// 重跑一格 recorded op（boolean → boolWithHistory / fillet → filletWithHistory）追踪 tracked 子形状。
//   prior = 该 op 前一帧全形（tracked 系佢嘅子形状）。返回 boolWithHistory 同款 { map }（只读 outPts/deleted 纯数字，安全）。
//   fillet：先把录低嘅 mids 落 prior 几何 _edgeIndexNearestMid 反查返当前帧 TopoDS 棱（同一 clone → d2≈0）。
function _s2ReExecOp(k: number, prior: any, tracked: any[]): { map: { out: unknown[]; outPts: [number, number, number][]; deleted: boolean; truncated: boolean }[] } | null {
  if (_boolOpAt[k] && _boolToolAt[k]) {
    return boolWithHistory(_oc, _boolKindAt[k], prior.wrapped, _boolToolAt[k].wrapped, tracked)
  }
  const fo = _filletOpAt[k]
  if (fo) {
    const priorEdges = prior.edges as any[]
    if (!priorEdges || !priorEdges.length) return null
    const fedges: { edge: any; radius: number }[] = []
    for (let j = 0; j < fo.mids.length; j++) {
      const { idx, d2 } = _edgeIndexNearestMid(prior, fo.mids[j])
      if (idx < 0 || d2 > 1e-3) return null   // 圆角棱喺 prior 反查唔实 → 诚实 bail（退回近点）
      fedges.push({ edge: priorEdges[idx].wrapped, radius: fo.radii[j] })
    }
    return filletWithHistory(_oc, fo.kind, prior.wrapped, fedges, tracked)
  }
  return null
}
// S1：边集典范顺序保序（第 i 条边变换前后仍系第 i 条）嘅特征 = 纯刚体/缩放变换。
//   - 'transform'：纯 rotate(绕体心)+translate（cad.worker ~2099）→ 保序 ✓
//   - 'scale'：等比 .scale 或非等比 GTransform（cad.worker ~2033）→ 保序 ✓
//   ⚠ 'mirror' 喺本仓系 shape.fuse(mirror(clone))（~1188，并集，topology 翻倍）或 applyTargetDeltas（布尔）—— 非保序，
//     故唔当 transform-class（spec 提及 mirror 但实现非纯变换 → 诚实排除，落 S1 闸时会被「中间有非变换 op」拦截退回 fallback）。
function _isTransformOp(f: any): boolean {
  return !!f && (f.type === 'transform' || f.type === 'scale')
}
// S1：喺 priorShape.edges 揾返中点最接近 m 嘅边索引（典范枚举顺序 = shape.edges 顺序 = TopExp_Explorer 顺序）。
//   返回 {idx, d2}（d2 = 平方距，畀 caller 判命中是否够近）。空边集 → idx=-1。
function _edgeIndexNearestMid(shape: any, m: [number, number, number]): { idx: number; d2: number } {
  const edges = shape.edges as any[]
  let best = -1, bestD = Infinity
  for (let i = 0; i < edges.length; i++) {
    const q = edges[i].pointAt(0.5)
    const d = (q.x - m[0]) ** 2 + (q.y - m[1]) ** 2 + (q.z - m[2]) ** 2
    if (d < bestD) { bestD = d; best = i }
  }
  return { idx: best, d2: bestD }
}
// S1-面：喺 priorShape.faces 揾返【首三角质心】最接近 c 嘅面索引（典范枚举顺序 = shape.faces 顺序 = TopExp_Explorer 顺序，
//   与边一样跨刚体/缩放变换保序）。返回 {idx, d2}（d2 = 平方距，畀 caller 判命中是否够近）。空面集/质心取唔到 → idx=-1。
//   ⚠ 用同一 _ffTriCentroid（首三角质心）做代表点 → 与 _ffSelectPts 解析出嘅 centroid 同口径，故 c 本身就系 prior 某面质心 → d2≈0。
function _faceIndexNearestCentroid(shape: any, c: [number, number, number]): { idx: number; d2: number } {
  const faces = shape.faces as any[]
  let best = -1, bestD = Infinity
  for (let i = 0; i < faces.length; i++) {
    const tri = faces[i].triangulation ? faces[i].triangulation() : null
    const q = tri ? _ffTriCentroid(tri) : null
    if (!q) continue
    const d = (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2
    if (d < bestD) { bestD = d; best = i }
  }
  return { idx: best, d2: bestD }
}
// S1 near-at-prior（边）：喺 priorShape.edges 揾返【采样最近】stored near p 嘅边索引 + 平方距。
//   ⚠ 与 roundNearPoints/roundNearPoint 嘅选边完全同口径（同 5 个 t 采样、同 min-over-t）→ prior（变换前）几何
//     同 stored near 食正 → d2≈0。供 _s1CarryMids 喺指纹歧义（_fpSelectMids(prior) 返 null）时退回 near 解析 prior 索引。
//   空边集 → idx=-1。
function _edgeIndexNearestNear(shape: any, p: [number, number, number]): { idx: number; d2: number } {
  const edges = shape.edges as any[]
  let best = -1, bestD = Infinity
  for (let i = 0; i < edges.length; i++) {
    let dmin = Infinity
    for (const t of [0, 0.25, 0.5, 0.75, 1]) { const q = edges[i].pointAt(t); const d = (q.x - p[0]) ** 2 + (q.y - p[1]) ** 2 + (q.z - p[2]) ** 2; if (d < dmin) dmin = d }
    if (dmin < bestD) { bestD = dmin; best = i }
  }
  return { idx: best, d2: bestD }
}
// S1 near-at-prior（面）：喺 priorShape.faces 揾返【三角最近】stored near p 嘅面索引 + 平方距。
//   ⚠ 与 _ffCapture 嘅选面完全同口径（同 ptTriDist2、同 min-over-tri）→ prior（变换前）几何同 stored near 食正 → d2≈0。
//     供 _s1CarryFacePts 喺指纹歧义（_ffSelectPts(prior) 返 null）时退回 near 解析 prior 索引。空面集/三角化失败 → idx=-1。
function _faceIndexNearestNear(shape: any, p: [number, number, number]): { idx: number; d2: number } {
  const faces = shape.faces as any[]
  let best = -1, bestD = Infinity
  for (let i = 0; i < faces.length; i++) {
    const tri = faces[i].triangulation ? faces[i].triangulation() : null
    if (!tri || !tri.vertices || !tri.vertices.length) continue
    const V = tri.vertices as number[], T = tri.trianglesIndexes as number[]; let dmin = Infinity
    for (let j = 0; j + 2 < T.length; j += 3) { const a = T[j] * 3, b = T[j + 1] * 3, c = T[j + 2] * 3; const dd = ptTriDist2(p[0], p[1], p[2], V[a], V[a + 1], V[a + 2], V[b], V[b + 1], V[b + 2], V[c], V[c + 1], V[c + 2]); if (dd < dmin) dmin = dd }
    if (dmin < bestD) { bestD = dmin; best = i }
  }
  return { idx: best, d2: bestD }
}
// STEP B-rep 缓存（T729）：importSTEP 系异步，rebuild 前预解析。
// Do not key only on the payload length: a saved project may replace a STEP
// snapshot while retaining its feature id and byte length.  That used to replay
// the old cached B-rep, so a valid STEP export/import round-trip could show the
// wrong solid.  A small deterministic content fingerprint keeps the cache fast
// without retaining the complete payload as a Map key.
const stepCache = new Map<string, any>()
function stepCacheKey(f: { id: string; step: string }): string {
  let hash = 0x811c9dc5 // FNV-1a (32 bit)
  for (let i = 0; i < f.step.length; i++) {
    hash ^= f.step.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${f.id}:${f.step.length}:${(hash >>> 0).toString(36)}`
}
async function prepareStepBodies(features: Feature[]): Promise<void> {
  for (const f of features) {
    if (f.type !== 'stepbody') continue
    const key = stepCacheKey(f)
    if (stepCache.has(key)) continue
    try {
      const sh = await importSTEP(new Blob([f.step]))
      while (stepCache.size >= 6) { const k0 = stepCache.keys().next().value as string; stepCache.delete(k0) }
      stepCache.set(key, sh)
    } catch (e) { stepCache.set(key, null); console.error('[cad.worker] stepbody parse failed:', e) }
  }
}
// 增量重建缓存（T730）：每特征一份 shape 快照（clone 共享底层 TopoDS，平；同 cpattern snapBefore 同款机制）。
// 编辑第 k 个特征 → 由快照 k−1 起重放，唔使由零（~320ms/步 × 全树 → 只重放尾段）。
let _rcSigs: string[] = []
let _rcSnaps: ({ shape: any; parked: { name: string; shape: any }[]; warns: string[] } | null)[] = []
const RC_CAP = 80  // 快照上限（OCCT clone 共享底层，但仍设安全帽）
function rcClear(): void { _rcSigs = []; _rcSnaps = [] }

let _oc: any = null  // 原始 oc 句柄（T755：raw API 用 — replicad TS 面冇暴露嘅绑定经呢度揸）
const ready: Promise<boolean> = (async () => {
  const OC = await opencascade({ locateFile: () => wasmUrl })
  setOC(OC)
  _oc = OC
  try { await loadFont(fontUrl, 'cad') } catch (e) { console.error('[font] load failed', e) }  // for text/emboss
  return true
})()

// 审计修复：加厚成实体（thicken/boundarypatch）走 BRepOffsetAPI_MakeThickSolid.MakeThickSolidBySimple，
// 此内核对正 signed thick 会产出【定向反转(负体积)】实体 → 污染布尔（fuse 静默并丢）、STL 导出（法向朝内→破网格）、3D 打印。
// 统一在 push 前检测体积 Mass()<0 → Reversed() 重定向到正体积。三条 high（thickenquilt/boundarypatch/ThickenFaceNear）共用。
function _orientSolidOutward(ocShape: any): any {
  try {
    const g = new _oc.GProp_GProps_1()
    _oc.BRepGProp.VolumeProperties_1(ocShape, g, false, false, false)
    if (g.Mass() < 0) { const r = ocShape.Reversed(); if (r && !r.IsNull()) return r }
  } catch { /* 体积/反转失败 → 原样返回 */ }
  return ocShape
}

// S133+（多面 NURBS 极点编辑）：planar-guard + NurbsConvert-FIRST 的【共用】面→B 样条解析器。
// 读路径（getControlNet）同写路径（editpoles rebuild）都行呢支，确保「显示嘅网」同「编辑嘅网」一致。
// 拣面碳化（Geom_Plane / 退化圆柱锥）冇可动极点 — SurfaceToBSplineSurface 唔 throw 但返个 2×2 一阶网，
// 一拖即爆炸。所以先 BRepBuilderAPI_NurbsConvert 把面转有界 B 样条面（同 ExtendFaceNear C++ 一样），
// 然后喺转换后嗰张【单面】上读 Surface_2 + SurfaceToBSplineSurface。仍退化（nu*nv<4 / 仍系 Geom_Plane）→ 返 null（软跳过）。
// 返回：{ bs=Geom_BSplineSurface（句柄内对象，可 SetPole_1）, ow=有界面嘅外环 TopoDS_Wire（保 trim 重建用）, nu, nv }。
// 注意：所有生 _oc 句柄都经传入嘅 r()=GCWithScope 管理（未包 r() 喺 emscripten 触发内核错，实证 9108520）。
function _nurbsNetOfFace(r: (h: any) => any, faceWrapped: any): { bs: any; ow: any; nu: number; nv: number } | null {
  try {
    // NurbsConvert-FIRST：把拾取面转成有界 B 样条面（用边一直绑定 BRepBuilderAPI_NurbsConvert，
    // 探多个 emscripten overload 命名 _2/_1/裸名 — plus 内核绑 C++ 类，构造器后缀按 embind 生成）。
    const NC: any = (_oc as any).BRepBuilderAPI_NurbsConvert_2 || (_oc as any).BRepBuilderAPI_NurbsConvert_1 || (_oc as any).BRepBuilderAPI_NurbsConvert
    let nbFaceWrapped = faceWrapped
    if (NC) {
      try {
        const conv = r(new NC(faceWrapped, false))   // (Shape, Copy=false)
        const cs = conv.Shape()
        if (cs && !cs.IsNull()) {
          // 转换结果可能系单面 / 壳：用 cast 取其第一张面（绝大多数情况转换后仍单面）
          const cast2: any = cast(cs)
          const cf = (cast2 as any).faces as any[]
          if (cf && cf.length) nbFaceWrapped = cf[0].wrapped
        }
      } catch { /* NurbsConvert 失败 → 退回原面（下面 SurfaceToBSplineSurface 仍可能成功） */ }
    }
    const surfH = r(_oc.BRep_Tool.Surface_2(nbFaceWrapped))            // Handle_Geom_Surface（GC 管理）
    const conv2 = r(_oc.GeomConvert.SurfaceToBSplineSurface(surfH))    // Handle_Geom_BSplineSurface（GC 管理 — 持有 bs 嘅引用，须存活到 MakeFace_21 消费完）
    const bs = conv2 ? conv2.get() : null                              // Geom_BSplineSurface（句柄内对象）
    if (!bs) return null
    const pa = bs.Poles_2()
    const r0 = pa.LowerRow(), c0 = pa.LowerCol()
    const nu = pa.UpperRow() - r0 + 1, nv = pa.UpperCol() - c0 + 1
    if (nu * nv < 4) return null                                       // 退化（平面 2×2 等）→ 软跳过
    const ow = r(_oc.BRepTools.OuterWire(nbFaceWrapped))               // 有界面外环（保 trim 重建用）
    return { bs, ow, nu, nv }
  } catch { return null }
}

// The 2D outline (replicad Drawing) of a profile — before placing on a plane. Reused for offset/draft.
function ellipseArcProfilePen(e: EllipseArcGeometry) {
  const sweep=ellipseArcSweep(e),start=ellipseArcPoint(e,e.a0)
  if(![e.cx,e.cy,e.rx,e.ry,e.rot,e.a0].every(Number.isFinite)||e.rx<=0||e.ry<=0)throw new Error('Invalid elliptical arc profile')
  let pen=draw(start)
  // A full legacy turn has identical endpoints; two exact half-arcs avoid SVG
  // endpoint ambiguity without tessellating the native curve.
  const count=Math.abs(sweep)>=360-1e-9?2:1
  for(let i=1;i<=count;i++){const end=ellipseArcPoint(e,e.a0+sweep*i/count);pen=pen.ellipseTo(end,e.rx,e.ry,e.rot,Math.abs(sweep/count)>180,sweep>0)}
  return pen
}

function cubicProfilePen(segments: CubicBezierSegment[]) {
  if(!segments.length || segments.some((seg,i)=>seg.length!==4||seg.some(q=>q.length!==2||!q.every(Number.isFinite))||(i>0&&Math.hypot(seg[0][0]-segments[i-1][3][0],seg[0][1]-segments[i-1][3][1])>1e-7)))throw new Error('Invalid or discontinuous cubic spline profile')
  let pen=draw(segments[0][0]);for(const seg of segments)pen=pen.cubicBezierCurveTo(seg[3],seg[1],seg[2]);return pen
}
function profileToDrawing(p: SketchProfile): any {
  if (p.islands) {
    const { islands, ...outer } = p
    return islands.reduce((drawing, island) => drawing.fuse(profileToDrawing(island)), profileToDrawing(outer))
  }
  if (p.holes?.length) {
    const { holes, ...outer } = p
    return holes.reduce((drawing, hole) => drawing.cut(profileToDrawing(hole)), profileToDrawing(outer))
  }
  if (p.kind === 'ellipse') {
    // S87：真椭圆单曲线（drawSingleEllipse 要 major≥minor，沿 X 为长轴）→ 旋转/平移到位。
    const rx = Math.max(1e-3, p.rx), ry = Math.max(1e-3, p.ry), rot = p.rot || 0
    let d = rx >= ry ? drawSingleEllipse(rx, ry) : drawSingleEllipse(ry, rx).rotate(90)
    if (rot) d = d.rotate(rot)
    return d.translate(p.c[0], p.c[1])
  }
  if (p.kind === 'rect') {
    const x0 = Math.min(p.a[0], p.b[0]), x1 = Math.max(p.a[0], p.b[0])
    const y0 = Math.min(p.a[1], p.b[1]), y1 = Math.max(p.a[1], p.b[1])
    return draw([x0, y0]).lineTo([x1, y0]).lineTo([x1, y1]).lineTo([x0, y1]).close()
  }
  if (p.kind === 'poly') {
    if(p.cubics?.length)return cubicProfilePen(p.cubics).close()
    // Augmented arc-poly → a TRUE circular-arc edge + chord close (real B-rep arc, not a 24-gon):
    // downstream fillet / drawings / STEP all see one circular edge instead of facet soup.
    if (p.arc) return draw([p.arc.a[0], p.arc.a[1]]).threePointsArcTo([p.arc.b[0], p.arc.b[1]], [p.arc.m[0], p.arc.m[1]]).close()
    // S101[3] 椭圆弧：真椭圆弧边（ellipseTo）+ 弦封口（close）成弓形，可挤出。sweep/longAxis 由 store 端定向
    // （pts 同此边须取同一条弧）；rot/a0/a1 单位=度，与 replicad ellipseTo 一致。
    if (p.earc) return ellipseArcProfilePen(p.earc).close()

    // Mixed line/arc path (verts+bulges, bulge=tan(θ/4), +=凸向行进左侧): each non-zero bulge becomes a TRUE
    // circular edge. A closing ARC segment must be drawn explicitly — close() only draws a straight chord —
    // and end exactly on verts[0] (bit-identical) so close() doesn't add a sliver edge.
    if (p.verts && p.bulges && (p.verts.length >= 3 || p.verts.length === 2 && p.bulges.some(b => Math.abs(b) >= 1e-6)) && !p.smooth) {
      const vs = p.verts, n = vs.length
      let pen = draw([vs[0][0], vs[0][1]])
      for (let i = 0; i < n; i++) {
        const a = vs[i], b = vs[(i + 1) % n], bu = p.bulges[i] || 0
        const dx = b[0] - a[0], dy = b[1] - a[1]
        if (Math.hypot(dx, dy) < 1e-9) continue                       // degenerate segment
        if (Math.abs(bu) < 1e-6) { if (i < n - 1) pen = pen.lineTo([b[0], b[1]]); continue }  // last straight seg → close() chord
        const m: [number, number] = [(a[0] + b[0]) / 2 - dy * bu / 2, (a[1] + b[1]) / 2 + dx * bu / 2]
        pen = pen.threePointsArcTo([b[0], b[1]], m)
      }
      return pen.close()
    }
    const [first, ...rest] = p.pts
    let pen = draw([first[0], first[1]])
    // smooth=true → fit a real B-spline curve through the points (replicad smoothSplineTo, auto-tangents) so an
    // extrude/revolve/loft of a SPLINE profile is a genuinely smooth surface, not a faceted many-sided polygon.
    if (p.smooth && p.pts.length >= 3) {
      for (const pt of rest) pen = pen.smoothSplineTo([pt[0], pt[1]])
      // S177：圆锥曲线闭合用【直弦】收笔（唔好 smoothSplineTo 返起点，否则弦边鼓起 → 错形）；其它 smooth（样条/B样条）仍平滑闭合无缝
      if (!p.conic) pen = pen.smoothSplineTo([first[0], first[1]])   // smooth closing segment back to the start (no flat seam)
      return pen.close()   // conic → close() 画直弦 P_last→P0
    }
    for (const pt of rest) pen = pen.lineTo([pt[0], pt[1]])
    return pen.close()
  }
  return drawCircle(p.r).translate(p.c[0], p.c[1])
}

// #62 GM-L2：截面边界「顶点数」代理 —— 圆/椭圆=平滑单曲线(1)、矩形=4 角、poly 按 verts/pts 数（arc/earc 单弧边+弦≈2）。
//   实体放样(loftWith/ThruSections)线性配对各截面顶点，数目唔一致（如圆 vs 矩形）会喺角位扭曲 → 用此代理做诚实一致性检查（同 surfloft 嘅 pts.length 检查同款）。
function profileVertCount(p: SketchProfile): number {
  if (p.kind === 'circle' || p.kind === 'ellipse') return 1
  if (p.kind === 'rect') return 4
  if (p.earc || p.arc) return 2
  if (p.verts && p.verts.length) return p.verts.length
  return p.pts?.length ?? 0
}

function profileToSketch(p: SketchProfile, z = 0, plane: Plane = 'XY') {
  return profileToDrawing(p).sketchOnPlane(plane, z)
}

// Draw a 2D profile and place it on an arbitrary replicad Plane object (for sketch-on-any-face).
// Delegates to profileToDrawing — single source of truth for profile geometry (incl. verts/bulges arcs).
function profileOnPlane(p: SketchProfile, plane: any): any {
  return profileToDrawing(p).sketchOnPlane(plane)
}

// Loft sections may come from an Origin plane or an arbitrary datum/face plane.
// Keep the exact sketch frame rather than flattening an angled section to XY.
function loftSectionSketch(s: { profile: SketchProfile; z: number; plane?: Plane; arbPlane?: { o: [number, number, number]; xd: [number, number, number]; n: [number, number, number] } }): any {
  if (s.arbPlane) {
    const ap = s.arbPlane
    return profileOnPlane(s.profile, new RPlane(ap.o as any, ap.xd as any, ap.n as any))
  }
  return profileToSketch(s.profile, s.z, s.plane || 'XY')
}

function lastExtrudeHeight(features: Feature[]): number {
  for (let i = features.length - 1; i >= 0; i--) {
    const f = features[i]
    if (f.type === 'extrude') return f.height
  }
  return 0
}

// Build an edge filter for selective fillet/chamfer (undefined = all edges).
function edgeFilter(shape: any, edges?: EdgeSel): ((e: any) => any) | undefined {
  if (!edges || edges === 'all') return undefined
  if (edges === 'vertical') return (e: any) => e.inDirection([0, 0, 1])
  // Meshing may enlarge OCCT's bounding box by its tessellation deflection.
  // Resolve the actual horizontal edge levels instead of using that display bound.
  const levels: number[] = []
  for (const edge of shape.edges) {
    const zs = [0,.25,.5,.75,1].map(t => edge.pointAt(t).z)
    if (zs.every(Number.isFinite) && Math.max(...zs)-Math.min(...zs) < 1e-7) levels.push(zs[0])
  }
  if (!levels.length) throw new Error('没有可用的水平顶边／底边，请直接选择边')
  const z = edges === 'top' ? Math.max(...levels) : Math.min(...levels)
  return (e: any) => e.inPlane('XY', z)
}
// Apply the requested size exactly; a failed group must not silently shrink or become a no-op.
function roundEdges(shape: any, kind: 'fillet' | 'chamfer', size: number, edges?: EdgeSel): any {
  if (!Number.isFinite(size) || size <= 0) throw new Error('圆角／倒角尺寸必须大于零')
  const filt = edgeFilter(shape, edges)
  const result = filt ? (kind === 'fillet' ? shape.fillet(size, filt) : shape.chamfer(size, filt)) : (kind === 'fillet' ? shape.fillet(size) : shape.chamfer(size))
  const mesh = result.mesh({ tolerance: 0.2, angularTolerance: 0.5 })
  if (!mesh?.triangles?.length || !mesh.vertices.every(Number.isFinite)) throw new Error('圆角／倒角结果无法显示，请缩小尺寸或减少选择的边')
  return result
}

// ── S122 持久边命名 helpers ───────────────────────────────────────────────────────────────
// fillet/chamfer 选边跨重建跟同一几何棱：把解析出嘅边采样成 polyline → edgeFingerprint 存喺 feature.edgeFp；
// 重建时用指纹喺当前边集揾返同一条（全中→精确跟；任何 miss/指纹撞→返 null = 退回 near-point，行为同今日一致）。
// modelBox 归一化只需 bbox min/max → 用几何 boundingBox 两角，免受三角化容差影响 → 捕获/选取两边一致。
function _fpBboxVerts(shape: any): number[] {
  try { const b = shape.boundingBox.bounds as [number[], number[]]; return [b[0][0], b[0][1], b[0][2], b[1][0], b[1][1], b[1][2]] } catch { return [] }
}
// S134：v2 旋转不变指纹要 principalFrame，而 principalFrame 系做 PCA → 须用模型【真实顶点云】（唔系 bbox 两角；
//   两角点云个协方差永远轴对齐 → 旋转后 PCA 出唔到旋转一齐转嘅框架）。呢度三角化 shape 攞返 flat 顶点数组。
//   关键：捕获(_fpCapture)同选取(_fpSelectMids)必须【用同一套 cloud 推导】（同一 mesh 容差）→ 同一刚体旋转下
//   旋转出旋转后嘅 cloud → principalFrame 跟住旋转 → v2 指纹旋转不变。用固定容差（唔跟 meshOf 嘅自适应容差）
//   令同一几何跨重建出同一 cloud（容差稳定）。结果缓存喺 shape 上（同一 resolve 内 capture/select 唔重复三角化）。
function _fpModelVerts(shape: any): number[] {
  const cached = (shape as { __fpCloud?: number[] }).__fpCloud
  if (cached) return cached
  let verts: number[] = []
  try { const m = shape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }); if (m && m.vertices && m.vertices.length) verts = m.vertices as number[] } catch { /* 三角化失败 → 空 cloud（v2 不可用，退回 v1） */ }
  try { (shape as { __fpCloud?: number[] }).__fpCloud = verts } catch { /* shape 可能 frozen → 无缓存，照行 */ }
  return verts
}
// 一条边 → 9 点采样 polyline（密过最近边搜索嘅 5 点，令弧 sagitta/弧长稳定）。
function _fpEdgePoly(e: any): [number, number, number][] {
  const out: [number, number, number][] = []
  for (const t of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]) { const q = e.pointAt(t); out.push([q.x, q.y, q.z]) }
  return out
}
// 选取：用存低嘅指纹喺当前 shape.edges 揾返每条边嘅中点。全中先返 mids；任何 miss 或 指纹撞（≥2 条同指纹，歧义）→ 返 null（保守 → 退回 near-point）。
//
// S134 旋转不变（try-v2-then-v1）：每条 pick 先试 v2 旋转不变指纹（edgeFpV2[k]），命中 → 用 v2；否则【逐边】退回原 v1 路径。
//   ⚠ ADVISORY GATE（spec 明确警告：采信坏 v2 会令特征比今日更差，必须 exactly right）—— v2 只在【两个闸全开】才采信：
//     (a) principalFrame(cloud).wellConditioned === true（对称体/退化框架 → false → 唔信 v2）；
//     (b) 该 stored v2 fp 喺当前边集【唯一】（v2Counts.get(fp) === 1 → 唔撞 → 无歧义）。
//   任一闸唔过（degenerate / 撞 / miss / 空 cloud / 空 v2 串）→ 唔采信该条 v2 → fall through 到 v1（再 near-point）。
//   v2 系【逐条 pick 独立】采信：某条过闸用 v2、另一条唔过用 v1，互不影响（mids 平行对齐）。
function _fpSelectMids(
  shape: any,
  edgeFp: string[],
  nears?: ([number, number, number] | undefined)[],
  edgeFpV2?: string[],   // S134：平行 edgeFp 嘅 v2 指纹（advisory，缺省时纯走 v1 = 今日行为）
): [number, number, number][] | null {
  const edges = shape.edges as any[]
  if (!edges.length) return null
  const verts = _fpBboxVerts(shape)
  if (!verts.length) return null
  const fpOf = new Map<number, string>()   // 边 idx → v1 指纹（碰撞消歧时复用，唔使重算）
  const counts = new Map<string, number>()
  const fpToIdx = new Map<string, number>()
  for (let i = 0; i < edges.length; i++) { const fp = edgeFingerprint(verts, _fpEdgePoly(edges[i])); fpOf.set(i, fp); counts.set(fp, (counts.get(fp) ?? 0) + 1); if (!fpToIdx.has(fp)) fpToIdx.set(fp, i) }
  // S134：v2 旋转不变指纹 map（仅当 caller 真带 v2 且至少一条非空才建；否则跳过 → 零开销 + 行为同今日一致）。
  // wellConditioned 系框架级（同一 shape 全边共用）属性 → 算一次。框架退化 → v2 整体唔可信（gate(a) 关）。
  let v2FpOf: Map<number, string> | null = null
  let v2Counts: Map<string, number> | null = null
  let v2FrameOk = false
  if (edgeFpV2 && edgeFpV2.some((s) => s)) {
    const cloud = _fpModelVerts(shape)
    if (cloud.length) {
      v2FrameOk = principalFrame(cloud).wellConditioned   // GATE (a)：框架唯一稳定先可信 v2
      v2FpOf = new Map<number, string>()
      v2Counts = new Map<string, number>()
      for (let i = 0; i < edges.length; i++) { const fp = edgeFingerprintV2(cloud, _fpEdgePoly(edges[i])); v2FpOf.set(i, fp); v2Counts.set(fp, (v2Counts.get(fp) ?? 0) + 1) }
    }
  }
  const out: [number, number, number][] = []
  for (let k = 0; k < edgeFp.length; k++) {
    // ── S134：先试 v2（仅当框架 wellConditioned 且该 v2 fp 唯一才采信）──
    const v2want = edgeFpV2?.[k]
    if (v2want && v2FrameOk && v2FpOf && v2Counts && (v2Counts.get(v2want) ?? 0) === 1) {
      // GATE (b) 通过：唯一命中 → 揾返嗰条边。再 double-check 命中确实存在（理论上必在，count===1）。
      let hit = -1
      for (let i = 0; i < edges.length; i++) { if (v2FpOf.get(i) === v2want) { hit = i; break } }
      if (hit >= 0) { const m = edges[hit].pointAt(0.5); out.push([m.x, m.y, m.z]); continue }
      // 落唔到（不应发生）→ fall through 到 v1
    }
    // ── v1 路径（原 S122/S131 逻辑，逐字保留）──
    const fp = edgeFp[k]
    const idx = fpToIdx.get(fp)
    if (idx == null) return null                       // 真 miss → 全退回 near-point
    if ((counts.get(fp) ?? 0) > 1) {
      // S131：指纹撞（对称体）→ near-biased 消歧：喺所有同指纹候选中拣最近 stored near 嗰条；冇 near 先保守退回。
      const np = nears?.[k]
      if (!np) return null
      let best = -1, bestD = Infinity
      for (let i = 0; i < edges.length; i++) { if (fpOf.get(i) !== fp) continue; const m = edges[i].pointAt(0.5); const d = (m.x - np[0]) ** 2 + (m.y - np[1]) ** 2 + (m.z - np[2]) ** 2; if (d < bestD) { bestD = d; best = i } }
      if (best < 0) return null
      const m = edges[best].pointAt(0.5); out.push([m.x, m.y, m.z]); continue
    }
    const m = edges[idx].pointAt(0.5)
    out.push([m.x, m.y, m.z])
  }
  return out.length ? out : null
}
// 捕获：为最终解析中点集（roundNearPoints 系 post-chain mids）算指纹（每个 mid 揾返其所属边）。供 store 写回 feature.edgeFp。
// S134：同步算 v2 旋转不变指纹（edgeFingerprintV2 + _fpModelVerts 真实点云），平行存 feature.edgeFpV2。
//   两者用【同一条最近边】（同一 best），保证 edgeFp[k] 同 edgeFpV2[k] 指向同一几何棱。v2 cloud 攞唔到（三角化失败）
//   → v2 退化为空串占位，长度仍同 v1 对齐（select 见空串当 miss → 退回 v1，唔会误采信）。
function _fpCapture(shape: any, mids: [number, number, number][]): { v1: string[]; v2: string[] } {
  const edges = shape.edges as any[]
  const verts = _fpBboxVerts(shape)
  if (!edges.length || !verts.length) return { v1: [], v2: [] }
  const cloud = _fpModelVerts(shape)   // S134：v2 用真实顶点云（PCA 主框架）
  const v1: string[] = []
  const v2: string[] = []
  for (const m of mids) {
    let best: any = null, bestD = Infinity
    for (const e of edges) { const q = e.pointAt(0.5); const d = (q.x - m[0]) ** 2 + (q.y - m[1]) ** 2 + (q.z - m[2]) ** 2; if (d < bestD) { bestD = d; best = e } }
    if (best) {
      const poly = _fpEdgePoly(best)
      v1.push(edgeFingerprint(verts, poly))
      v2.push(cloud.length ? edgeFingerprintV2(cloud, poly) : '')   // 同一条 best 边 → v1/v2 平行
    }
  }
  return { v1, v2 }
}

// ── S125 持久面命名 helpers（shell 抽壳选面跨重建跟同一几何面）─────────────────────────────────
// mirror 边指纹（_fp*），但面用 faceFingerprint + 面自身三角化（fc.triangulation()）；bbox 归一化传全模型
// bbox 角点（_fpBboxVerts，同 S122），令跨重建一致。on-face 代表点用面【首个三角形质心】（保证在面上，
// 畀 containsPoint 命中），唔靠 face.center（未必有）。
function _ffTriCentroid(tri: any): [number, number, number] | null {
  const V = tri.vertices as number[], T = tri.trianglesIndexes as number[]
  if (!V || !T || T.length < 3) return null
  const a = T[0] * 3, b = T[1] * 3, c = T[2] * 3
  return [(V[a] + V[b] + V[c]) / 3, (V[a + 1] + V[b + 1] + V[c + 1]) / 3, (V[a + 2] + V[b + 2] + V[c + 2]) / 3]
}
function _ffFaceFp(fc: any, modelVerts: number[]): string | null {
  try {
    const tri = fc.triangulation ? fc.triangulation() : null
    if (!tri || !tri.vertices || !tri.vertices.length || !tri.trianglesIndexes || !tri.trianglesIndexes.length) return null
    return faceFingerprint(tri.vertices, tri.trianglesIndexes, { start: 0, count: tri.trianglesIndexes.length }, modelVerts)
  } catch { return null }
}
// S136：v2 旋转不变面指纹（镜 _ffFaceFp）。modelVerts 必须传【真实顶点云】（_fpModelVerts，PCA 主框架）—
//   唔可以传 bbox 两角（协方差永远轴对齐 → 旋转后 PCA 出唔到旋转一齐转嘅框架）。面自身三角化照旧。
function _ffFaceFpV2(fc: any, modelVerts: number[]): string | null {
  try {
    const tri = fc.triangulation ? fc.triangulation() : null
    if (!tri || !tri.vertices || !tri.vertices.length || !tri.trianglesIndexes || !tri.trianglesIndexes.length) return null
    return faceFingerprintV2(tri.vertices, tri.trianglesIndexes, { start: 0, count: tri.trianglesIndexes.length }, modelVerts)
  } catch { return null }
}
// 选取：存低嘅 faceFp → 当前 shape.faces 每张匹配面嘅代表点（首三角质心）。全中先返；任何 miss/指纹撞 → null（保守退回 nears）。
//
// S136 旋转不变（try-v2-then-v1，镜 _fpSelectMids）：每张 pick 先试 v2 旋转不变面指纹（faceFpV2[k]），命中 → 用 v2；否则【逐面】退回原 v1 路径。
//   ⚠ ADVISORY GATE（采信坏 v2 会令特征比今日更差，必须 exactly right）—— v2 只在【两个闸全开】才采信：
//     (a) principalFrame(cloud).wellConditioned === true（对称体/退化框架 → false → 唔信 v2）；
//     (b) 该 stored v2 fp 喺当前面集【唯一】（v2Counts.get(fp) === 1 → 唔撞 → 无歧义）。
//   任一闸唔过（degenerate / 撞 / miss / 空 cloud / 空 v2 串）→ 唔采信该面 v2 → fall through 到 v1（再 near-point）。
//   v2 用模型【真实点云】（_fpModelVerts，PCA 主框架），唔系 bbox 两角；v1 仍用 bbox 两角（字节一致，行为不变）。
function _ffSelectPts(shape: any, faceFp: string[], nears?: ([number, number, number] | undefined)[], faceFpV2?: string[], faceFpTopo?: string[]): [number, number, number][] | null {
  const faces = shape.faces as any[]
  if (!faces || !faces.length) return null
  const mv = _fpBboxVerts(shape); if (!mv.length) return null
  let _e2f: Map<number, number[]> | null = null   // #14：edge→faces 邻接表 lazy build（仅歧义分支且带 faceFpTopo 时先算 → 零开销）
  const edgeToFaces = () => (_e2f ?? (_e2f = buildEdgeToFaces(faces)))
  const fpOf = new Map<number, string>()   // 面 idx → 指纹（碰撞消歧复用）
  const counts = new Map<string, number>(); const fpToIdx = new Map<string, number>()
  for (let i = 0; i < faces.length; i++) { const fp = _ffFaceFp(faces[i], mv); if (fp == null) continue; fpOf.set(i, fp); counts.set(fp, (counts.get(fp) ?? 0) + 1); if (!fpToIdx.has(fp)) fpToIdx.set(fp, i) }
  const centroidOf = (i: number): [number, number, number] | null => { const tri = faces[i].triangulation ? faces[i].triangulation() : null; return tri ? _ffTriCentroid(tri) : null }
  // S136：v2 旋转不变面指纹 map（仅当 caller 真带 v2 且至少一张非空才建；否则跳过 → 零开销 + 行为同今日一致）。
  // wellConditioned 系框架级（同一 shape 全面共用）属性 → 算一次。框架退化 → v2 整体唔可信（gate(a) 关）。
  let v2FpOf: Map<number, string> | null = null
  let v2Counts: Map<string, number> | null = null
  let v2FrameOk = false
  if (faceFpV2 && faceFpV2.some((s) => s)) {
    const cloud = _fpModelVerts(shape)
    if (cloud.length) {
      v2FrameOk = principalFrame(cloud).wellConditioned   // GATE (a)：框架唯一稳定先可信 v2
      v2FpOf = new Map<number, string>()
      v2Counts = new Map<string, number>()
      for (let i = 0; i < faces.length; i++) { const fp = _ffFaceFpV2(faces[i], cloud); if (fp == null) continue; v2FpOf.set(i, fp); v2Counts.set(fp, (v2Counts.get(fp) ?? 0) + 1) }
    }
  }
  const out: [number, number, number][] = []
  for (let k = 0; k < faceFp.length; k++) {
    // ── S136：先试 v2（仅当框架 wellConditioned 且该 v2 fp 唯一才采信）──
    const v2want = faceFpV2?.[k]
    if (v2want && v2FrameOk && v2FpOf && v2Counts && (v2Counts.get(v2want) ?? 0) === 1) {
      // GATE (b) 通过：唯一命中 → 揾返嗰张面嘅代表点。再 double-check 命中确实存在（理论上必在，count===1）。
      let hit = -1
      for (let i = 0; i < faces.length; i++) { if (v2FpOf.get(i) === v2want) { hit = i; break } }
      if (hit >= 0) { const c = centroidOf(hit); if (c) { out.push(c); continue } }
      // 落唔到（不应发生 / 代表点取唔到）→ fall through 到 v1
    }
    // ── v1 路径（原 S125/S131 逻辑，逐字保留）──
    const fp = faceFp[k]
    const idx = fpToIdx.get(fp)
    if (idx == null) {
      // ── S1-面 真拓扑命名（TRANSFORM lineage）：faceFp 喺当前 shape 解析唔到（漂移）→ 先试沿上游变换以拓扑顺序追踪该面。
      //   成功（中间全部系变换 op + prior 帧能干净解析整套 pick）→ 用 carried centroids 整套覆盖漂移近点 + 压住 S144 警告。
      //   任何闸唔过（无历史 / 中间有非变换 op / 面数变 / 无 prior 解析）→ s1=null → 完全 fall through 到下面 S144 fallback（字节一致）。
      //   ⚠ _s1FaceCarryActive 闸：此 _ffSelectPts 若系畀 _s1CarryFacePts 内部回调（解析 prior）调用 → 唔再试 carry（防递归）。
      if (!_s1FaceCarryActive) {
        const s1 = _s1CarryFacePts(shape, faceFp, faceFpV2, nears ?? [])
        if (s1 && s1.length === faceFp.length) { if (_s2CarriedFlag) _s2CarriedFlag = false; else buildWarnings.push('持久面名经上游变换以拓扑顺序追踪解析（真拓扑命名 S1-面）'); return s1 }
      }
      // S143（面版，镜 roundNearPoints）：faceFp 存在但喺当前面集解析唔到（true miss）→ 全退回近点拣面（caller 用 stored nears）。
      // 若存低嘅 near 距最近面过远（上游变换/旋转令 body 移走 — 尤其【对称体旋转】，v2 折叠失效退回 v1、v1 bbox 归一化亦漂移），
      // 近点会拣错面、面操作可能落错位 → 诚实警告，唔好静默出错几何。_ffSelectPts 见首个 idx==null 即 return null，
      // 故喺此处算当前 pick（nears?.[k]）距最近面距离已足（返回前一次性 push，无重复告警）。
      const np = nears?.[k]
      if (np) {
        let diag = 0
        if (mv.length >= 6) { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < mv.length; i += 3) for (let c = 0; c < 3; c++) { if (mv[i + c] < mn[c]) mn[c] = mv[i + c]; if (mv[i + c] > mx[c]) mx[c] = mv[i + c] } diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) }
        let nearFaceD2 = Infinity
        for (let i = 0; i < faces.length; i++) { const c = centroidOf(i); if (!c) continue; const d = (c[0] - np[0]) ** 2 + (c[1] - np[1]) ** 2 + (c[2] - np[2]) ** 2; if (d < nearFaceD2) nearFaceD2 = d }
        const nd = Math.sqrt(nearFaceD2)
        // ⚠ S1-面：呢个 _ffSelectPts 若系畀 _s1CarryFacePts 内部回调（解析 prior 帧）调用 → 唔出 S144 漂移警告
        //   （prior miss 系 walk-back 内部记账，唔系用户可见漂移；顶层若最终 carry 唔成功，会喺顶层正常出呢句）。
        if (!_s1FaceCarryActive && diag > 0 && Number.isFinite(nd) && nd > Math.max(2, 0.06 * diag)) buildWarnings.push(`面拣：持久面名喺当前实体上解析唔到、已退回近点拣面，但近点距最近面 ${nd.toFixed(1)}mm（疑上游变换/旋转令选择漂移 — 对称体旋转后面命名会失效）。如结果唔啱请重新拾面。`)
      }
      return null                                      // 真 miss → 全退回 near-point（行为不变，只加警告）
    }
    if ((counts.get(fp) ?? 0) > 1) {
      // #14：几何指纹撞（对称体）→ 先用【拓扑指纹】（邻接面几何类型环 hash）破 tie：喺同 v1 指纹嘅面中拣拓扑 hash === stored 嗰张。
      //   唯一命中 → 采信（对称但拓扑可分，如一端有圆角 → 邻环多一个 CYLINDRE）；0 或 >1（拓扑亦歧义 / feature 无 stored topo）
      //   → fall through 落 S131 near-biased（严格唔差过今日）。byte-compat：faceFpTopo undefined → 完全跳过本层。
      const twant = faceFpTopo?.[k]
      if (twant) {
        const e2f = edgeToFaces()
        let tHit = -1, tCnt = 0
        for (let i = 0; i < faces.length; i++) { if (fpOf.get(i) !== fp) continue; if (topoFaceHash(faces, i, e2f) === twant) { tHit = i; tCnt++; if (tCnt > 1) break } }
        if (tCnt === 1 && tHit >= 0) { const c = centroidOf(tHit); if (c) { out.push(c); continue } }   // 拓扑唯一命中 → 采信
      }
      // S131：指纹撞（对称体）→ near-biased 消歧：喺所有同指纹面中拣质心最近 stored near 嗰张；冇 near 先保守退回。
      const np = nears?.[k]
      if (!np) return null
      let best = -1, bestD = Infinity
      for (let i = 0; i < faces.length; i++) { if (fpOf.get(i) !== fp) continue; const c = centroidOf(i); if (!c) continue; const d = (c[0] - np[0]) ** 2 + (c[1] - np[1]) ** 2 + (c[2] - np[2]) ** 2; if (d < bestD) { bestD = d; best = i } }
      if (best < 0) return null
      const c = centroidOf(best); if (!c) return null
      out.push(c); continue
    }
    const cen = centroidOf(idx)
    if (!cen) return null
    out.push(cen)
  }
  return out.length ? out : null
}
// 捕获：为用户拣面嘅 near 点揾返所属面（三角最近，复用 ptTriDist2），记其指纹。供 store 写回 feature.faceFp。
// S136：同步算 v2 旋转不变面指纹（faceFingerprintV2 + _fpModelVerts 真实点云），平行存 feature.faceFpV2。
//   两者用【同一张最近面】（同一 best），保证 faceFp[k] 同 faceFpV2[k] 指向同一几何面。v2 cloud 攞唔到（三角化失败）
//   → v2 退化为空串占位，长度仍同 v1 对齐（select 见空串当 miss → 退回 v1，唔会误采信）。
function _ffCapture(shape: any, nears: [number, number, number][]): { v1: string[]; v2: string[]; topo: string[] } {
  const faces = shape.faces as any[]; const mv = _fpBboxVerts(shape)
  if (!faces || !faces.length || !mv.length) return { v1: [], v2: [], topo: [] }
  const cloud = _fpModelVerts(shape)   // S136：v2 用真实顶点云（PCA 主框架）
  const v1: string[] = []
  const v2: string[] = []
  const topo: string[] = []            // #14：拓扑指纹（邻接环 hash），同 v1/v2 平行；退化返空串（select 当 miss 跳过）
  let e2f: Map<number, number[]> | null = null   // lazy：有 near 命中面先算邻接表（无命中 → 零开销）
  for (const p of nears) {
    let best: any = null, bestIdx = -1, bestD = Infinity
    for (let fi = 0; fi < faces.length; fi++) {
      const fc = faces[fi]
      const tri = fc.triangulation ? fc.triangulation() : null; if (!tri || !tri.vertices || !tri.vertices.length) continue
      const V = tri.vertices as number[], T = tri.trianglesIndexes as number[]; let dmin = Infinity
      for (let i = 0; i + 2 < T.length; i += 3) { const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3; const dd = ptTriDist2(p[0], p[1], p[2], V[a], V[a + 1], V[a + 2], V[b], V[b + 1], V[b + 2], V[c], V[c + 1], V[c + 2]); if (dd < dmin) dmin = dd }
      if (dmin < bestD) { bestD = dmin; best = fc; bestIdx = fi }
    }
    if (best) {
      const fp = _ffFaceFp(best, mv)
      if (fp) {   // 同一张 best 面 → v1/v2/topo 三者平行（fp 落空 → 三者一齐跳过，长度仍对齐）
        v1.push(fp); v2.push(cloud.length ? (_ffFaceFpV2(best, cloud) ?? '') : '')
        e2f = e2f ?? buildEdgeToFaces(faces)
        topo.push(topoFaceHash(faces, bestIdx, e2f))
      }
    }
  }
  return { v1, v2, topo }
}

// Face Pattern deliberately creates a separate surface body.  A selected face is
// not necessarily a closed solid, so fusing it into the source body would make a
// misleading/non-manifold result.  Keeping the copies as a B-rep compound matches
// the surface workflow: users can subsequently Stitch/Thicken them deliberately.
function facePatternCopies(shape: any, nears: [number, number, number][], faceFp: string[] | undefined, faceFpV2: string[] | undefined, faceFpTopo: string[] | undefined, matrices: number[][]): any[] {
  if (!nears.length || !matrices.length) return []
  try { shape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }) } catch { /* selection still tries existing triangulation */ }
  let pts = nears
  _lastResolvedFaceFp = null; _lastResolvedFaceFpV2 = null; _lastResolvedFaceFpTopo = null
  if (faceFp?.length) {
    const resolved = _ffSelectPts(shape, faceFp, nears, faceFpV2, faceFpTopo)
    if (resolved && resolved.length === nears.length) pts = resolved
  } else {
    const captured = _ffCapture(shape, nears)
    _lastResolvedFaceFp = captured.v1; _lastResolvedFaceFpV2 = captured.v2; _lastResolvedFaceFpTopo = captured.topo
  }
  const faces = (shape.faces ?? []) as any[]
  const picked: any[] = []
  const seen = new Set<number>()
  for (const p of pts) {
    let best = -1, bestD = Infinity
    for (let fi = 0; fi < faces.length; fi++) {
      const tri = faces[fi].triangulation ? faces[fi].triangulation() : null
      if (!tri?.vertices?.length || !tri.trianglesIndexes?.length) continue
      const V = tri.vertices as number[], T = tri.trianglesIndexes as number[]
      let d = Infinity
      for (let i = 0; i + 2 < T.length; i += 3) {
        const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3
        d = Math.min(d, ptTriDist2(p[0], p[1], p[2], V[a], V[a + 1], V[a + 2], V[b], V[b + 1], V[b + 2], V[c], V[c + 1], V[c + 2]))
      }
      if (d < bestD) { bestD = d; best = fi }
    }
    if (best >= 0 && !seen.has(best)) { seen.add(best); picked.push(faces[best]) }
  }
  const copies: any[] = []
  for (const face of picked) for (const m of matrices) {
    try {
      const trsf = new (_oc as any).gp_Trsf_1()
      trsf.SetValues(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11])
      const op = new (_oc as any).BRepBuilderAPI_Transform_2(face.wrapped, trsf, true)
      const raw = op.Shape(); const copy = raw && !raw.IsNull() ? cast(raw) : null
      try { op.delete?.() } catch { /* wasm GC fallback */ }; try { trsf.delete?.() } catch { /* wasm GC fallback */ }
      if (copy?.wrapped && !copy.wrapped.IsNull()) copies.push(copy)
    } catch { /* one invalid face/transform must not discard other copies */ }
  }
  return copies
}

// Fillet/chamfer the single edge nearest a 3D point (CAD coords) — for click-to-pick edge rounding.
// Finds the closest edge by sampling each edge, then selects it via its midpoint (which lies on it).
function roundNearPoint(shape: any, kind: 'fillet' | 'chamfer', size: number, p: [number, number, number], edgeFp?: string[], edgeFpV2?: string[]): any {
  const edges = shape.edges as any[]
  let bestMid: any = null, bestD = Infinity
  for (const e of edges) {
    let dmin = Infinity
    for (const t of [0, 0.25, 0.5, 0.75, 1]) { const q = e.pointAt(t); const d = (q.x - p[0]) ** 2 + (q.y - p[1]) ** 2 + (q.z - p[2]) ** 2; if (d < dmin) dmin = d }
    if (dmin < bestD) { bestD = dmin; bestMid = e.pointAt(0.5) }
  }
  if (!bestMid) throw new Error('no edge near point')
  let M: [number, number, number] = [bestMid.x, bestMid.y, bestMid.z]
  // S122：edgeFp 存在 → 指纹选边（命中即跟同一几何棱）；否则首次捕获供 store 写回。无 fp 时 M 不变 = 今日行为。
  // S134：带 edgeFpV2 → _fpSelectMids 先试 v2 旋转不变（advisory gate 过先采信，否则退 v1）；捕获时同步算 v2。
  if (edgeFp && edgeFp.length) {
    const sel = _fpSelectMids(shape, edgeFp, [p], edgeFpV2)   // S131：near-biased 消歧（[p] = 拾边点）
    if (sel && sel.length) M = sel[0]
    else { const s1 = _s1CarryMids(shape, edgeFp, edgeFpV2, [p]); if (s1 && s1.mids.length) { M = s1.mids[0]; if (_s2CarriedFlag) _s2CarriedFlag = false; else buildWarnings.push('持久边名经上游变换以拓扑顺序追踪解析（真拓扑命名 S1）') } }   // S1：漂移 → 沿上游变换以拓扑顺序追踪（或 S2 布尔血统）；任何闸唔过 → M 留近点 = 今日行为
  }
  else { const cap = _fpCapture(shape, [M]); _lastResolvedFp = cap.v1; _lastResolvedFpV2 = cap.v2 }
  for (const s of [size]) {
    try {
      const r = kind === 'fillet' ? shape.fillet(s, (e: any) => e.containsPoint(M)) : shape.chamfer(s, (e: any) => e.containsPoint(M))
      if (s !== size) buildWarnings.push(`${kind === 'fillet' ? '圆角' : '倒角'} ${size} 太大，已自动缩小到 ${s.toFixed(1)} 以贴合该棱`)
      return r
    } catch { /* report the requested size as failed */ }
  }
  throw new Error(`${kind} near point failed`)
}
// Tangent-chain expansion (Fusion 切线链): given a seed edge midpoint, return the midpoints of ALL edges
// reachable through tangent-continuous (G1, ≤~6°) shared vertices — so picking ONE segment of an rrect rim
// fillets the whole rim (lines + corner arcs) in one go.
function tangentChainMids(shape: any, seed: [number, number, number]): [number, number, number][] {
  const edges = shape.edges as any[]
  const V = (v: any): [number, number, number] => [v.x, v.y, v.z]
  const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  const nrm = (v: number[]) => { const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L] }
  const d2 = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  type EI = { s: number[]; e: number[]; ts: number[]; te: number[]; mid: [number, number, number] }
  const info: EI[] = edges.map((ed) => {
    const s = V(ed.startPoint), e = V(ed.endPoint), m = V(ed.pointAt(0.5))
    let ts: number[], te: number[]
    try { ts = nrm(V(ed.tangentAt(0))); te = nrm(V(ed.tangentAt(1))) } catch { ts = nrm(sub(m, s)); te = nrm(sub(e, m)) }
    return { s, e, ts, te, mid: m }
  })
  let seedIdx = -1, bd = Infinity
  info.forEach((ei, i) => { const d = d2(ei.mid, seed); if (d < bd) { bd = d; seedIdx = i } })
  if (seedIdx < 0) return [seed]
  const COS = Math.cos((6 * Math.PI) / 180), VEPS = 1e-4  // vertex weld 0.01mm²
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const inChain = new Set<number>([seedIdx])
  let grew = true
  while (grew) {
    grew = false
    for (const i of [...inChain]) {
      const A = info[i]
      for (let j = 0; j < info.length; j++) {
        if (inChain.has(j)) continue
        const B = info[j]
        // 4 endpoint pairings; tangent continuity at the shared vertex (orientation-free |dot|)
        const hit =
          (d2(A.e, B.s) < VEPS && Math.abs(dot(A.te, B.ts)) > COS) ||
          (d2(A.e, B.e) < VEPS && Math.abs(dot(A.te, B.te)) > COS) ||
          (d2(A.s, B.s) < VEPS && Math.abs(dot(A.ts, B.ts)) > COS) ||
          (d2(A.s, B.e) < VEPS && Math.abs(dot(A.ts, B.te)) > COS)
        if (hit) { inChain.add(j); grew = true }
      }
    }
  }
  return [...inChain].map((i) => info[i].mid)
}
// ── S1 真拓扑命名（TRANSFORM lineage carry）─────────────────────────────────────────────────────
// 仅喺漂移（_fpSelectMids 喺当前 shape 返 null = true fp miss）时调用。原理：刚体/缩放变换保 topology + 保边集典范枚举顺序
// （replicad BRepBuilderAPI_Transform/scale 都系 ModifyShape 子类 → 第 i 条边变换前后仍系第 i 条）。所以唔使 OCCT
// Modified/Generated：纯【顺序对应】就够。做法：回头喺最近一个 pick 能干净解析嘅旧 shape（变换前帧，几何同 stored
// near/edgeFp 食正）攞返每条棱嘅【典范边索引】，验证 b→current 之间全部系变换 op（唔系 → abort 退回今日 fallback），
// 然后读当前 shape 同一索引边嘅中点 = 真正嗰条棱跨变换嘅位置。
// 返回：成功 → 与 wantPts 平行同长嘅 carried mids（caller 用嚟 override 漂移咗嘅近点 mids）；任何闸唔过 → null（abort）。
// 闸（任一唔过即 null → 字节一致退回 S143 fallback）：
//   1. 无 _shapeHistory（旧路径/splitBuild 未录）/ _curOpIndex<0 → null。
//   2. 揾唔到能干净解析嘅 prior shape（b）→ null。
//   3. 开区间 (b, current) 之间有非变换 op（fillet/boolean/extrude/mirror…）→ null（嗰啲要 S2/S3 lineage，S1 唔claim）。
//   4. prior 与 current 边数唔同（理论上纯变换唔会，但保险）→ null。
//   5. 任何 prior 解析出嘅边索引喺 current 越界 → null。
function _s1CarryMids(
  shape: any,                                   // 当前（变换后）shape
  edgeFp: string[],
  edgeFpV2: string[] | undefined,
  wantPts: ([number, number, number] | undefined)[],   // 原拾边近点（消歧 + 对齐长度）
): { mids: [number, number, number][]; bornAt: number } | null {
  if (_curOpIndex < 0 || !_shapeHistory.length) return null
  const curEdges = shape.edges as any[]
  if (!curEdges.length) return null
  // 由 current-1 向前（最近优先）揾候选 b（pick 喺 _shapeHistory[b] 能干净解析嗰一格）。
  //   闸 3 = 「b 与 current 之间（开区间 (b,current)）每个 op 都系变换 op」。walk-back 实现：
  //     · 沿途经过嘅 op（k>b）必须全系变换 → 一遇到变换以外嘅 op，嗰个 op 自己可以做最后一个候选 b（佢之上嘅 op
  //       会令 (b',current) 夹住呢个非变换 op → 非法），试完即【停】。
  //     · b 嗰格本身系咩 op 唔限（box/extrude/transform 都得），只要佢产出嘅 shape 解析得到 pick。
  for (let b = _curOpIndex - 1; b >= 0; b--) {
    const prior = _shapeHistory[b]
    const isNonTransform = !_transformOpAt[b]   // 呢格系非变换 op → 试完即停（再向上 b' 会令呢格落入开区间，非法）
    let resolved: { mids: [number, number, number][]; bornAt: number } | null = null
    do {
      if (!prior || !prior.edges || !prior.edges.length) break   // 该格无 shape（sketch/失效）→ 当前 b 跳过
      // 闸 4：纯变换边数应不变。prior 与 current 边数唔同 → 唔可信顺序对应。
      if ((prior.edges as any[]).length !== curEdges.length) break
      // 试喺 prior 干净解析（edgeFp 全中 / 撞但 near 消歧成功）。复用 _fpSelectMids（同 capture 帧逻辑一致）。
      const sel = _fpSelectMids(prior, edgeFp, wantPts, edgeFpV2)
      // 解析出每个 pick 喺 prior.edges 嘅【典范索引】（priorIdx[k]）。两条路：
      //   A. 指纹路（sel 命中）：sel[k] = prior 某条边中点 → _edgeIndexNearestMid 反查索引（d2≈0）。
      //   B. near-at-prior 退回（sel==null = prior 帧指纹本身歧义，例如圆柱顶圆边 — _fpSelectMids 返 null）：
      //      用 stored near wantPts[k] 喺 prior（变换前几何，near 食正）采样揾最近边索引。仍走【典范索引→current】carry，
      //      安全唔变（near 喺 prior 几何有效，唔系当前旋转后 shape）。任一 k 无 near / 索引坏 → 当前 b abort（不退回字节一致）。
      const priorIdx: number[] = []
      let ok = true
      if (sel && sel.length === edgeFp.length) {
        for (const m of sel) {
          const { idx, d2 } = _edgeIndexNearestMid(prior, m)   // sel[k] 本身就系 prior 某条边中点 → d2≈0
          if (idx < 0 || d2 > 1e-4) { ok = false; break }      // 匹配唔实 → abort
          priorIdx.push(idx)
        }
      } else if (b < _curOpIndex - 1) {
        // ⚠ near-at-prior 退回【只】喺开区间 (b,current) 至少夹一个变换 op 时先采用（b < curOpIndex-1）。
        //   walk-back 已保证嗰啲 op 全系变换（闸 3）→ 即真系跨变换 carry。若 b == curOpIndex-1（区间空 = 无变换，
        //   纯「指纹歧义但几何无郁」嘅平帧，例如圆柱顶圆边无任何上游变换）→ 唔行 path B → return null → 字节一致退回
        //   今日 near-fallback（无 S1 note、无漂移警告）。保住 spec 案例(3)：no-drift/no-transform 必须 byte-identical。
        for (let k = 0; k < edgeFp.length; k++) {
          const np = wantPts[k]
          if (!np) { ok = false; break }                       // 无 stored near → 无法 near 解析 → abort
          const { idx, d2 } = _edgeIndexNearestNear(prior, np)  // prior 变换前几何 + stored near 食正 → d2≈0
          if (idx < 0 || d2 > 1e-2) { ok = false; break }       // 揾唔到 / near 距 prior 边太远（prior 帧本应食正）→ abort
          priorIdx.push(idx)
        }
      } else {
        break   // sel miss 且区间空（无变换）→ 唔 carry（path A 失败 + path B 不适用）→ 退回今日 fallback
      }
      if (!ok) break
      // 攞每个典范索引；同一索引读 current.edges 中点（变换保序 → 第 i 条边对应第 i 条）。
      const carried: [number, number, number][] = []
      for (const idx of priorIdx) {
        if (idx >= curEdges.length) { ok = false; break }       // 索引越界 → abort
        const q = curEdges[idx].pointAt(0.5)
        carried.push([q.x, q.y, q.z])
      }
      if (ok) resolved = { mids: carried, bornAt: b }
    } while (false)
    if (resolved) return resolved
    if (isNonTransform) {
      // GM-γ2a/γ2b：撞到非变换 b。若系【recorded 布尔或圆角/倒角 op】→ 唔即 abort，改行 S2 血统（多跳链）追踪 pick
      //   穿过该 op（及其上游连续 recorded op）；成功 → carry 结果。其它非变换（shell…）或 S2 唔成 → return null（退回近点）。
      if (S2_LINEAGE && _s2IsRecordedOp(b)) { const s2 = _s2CarryMids(shape, b, edgeFp, edgeFpV2, wantPts); if (s2) return s2 }
      return null   // 非变换 b 试过唔得 → 再向上必夹住呢个非变换 op → 整体放弃
    }
  }
  return null
}
// ── S1-面 真拓扑命名（TRANSFORM lineage carry，FACE 版，镜 _s1CarryMids）─────────────────────────
// 仅喺面 pick 漂移（_ffSelectPts 喺当前 shape 返 null = true face-fp miss）时调用。原理同边版完全一致：
//   刚体/缩放变换保 topology + 保【面集典范枚举顺序】（replicad BRepBuilderAPI_Transform/scale 同系 ModifyShape 子类
//   → 第 i 张面变换前后仍系第 i 张，同 iterTopo/HashCode 枚举顺序）。所以唔使 OCCT Modified/Generated，纯【顺序对应】就够。
//   做法：回头喺最近一个面 pick 能干净解析嘅旧 shape（变换前帧，几何同 stored near/faceFp 食正）攞返每张面嘅【典范面索引】，
//   验证 b→current 之间全部系变换 op（唔系 → abort 退回今日 S144 fallback），然后读当前 shape 同一索引面嘅【首三角质心】=
//   真正嗰张面跨变换嘅代表点。
// 返回：成功 → 与 nears 平行同长嘅 carried centroids（caller 用嚟 override 漂移咗嘅近点面）；任何闸唔过 → null（abort）。
// 闸（任一唔过即 null → 字节一致退回 S144 fallback）：
//   1. 无 _shapeHistory / _curOpIndex<0 → null（旧路径/splitBuild 未录）。
//   2. 揾唔到能干净解析嘅 prior shape（b）→ null。
//   3. 开区间 (b, current) 之间有非变换 op（shell/boolean/extrude/mirror…）→ null（嗰啲要 S2/S3 lineage，S1 唔 claim）。
//   4. prior 与 current 面数唔同（理论上纯变换唔会，但保险）→ null。
//   5. 任何 prior 解析出嘅面索引喺 current 越界 / 匹配唔实（d2 太大）→ null。
function _s1CarryFacePts(
  shape: any,                                   // 当前（变换后）shape
  faceFp: string[],
  faceFpV2: string[] | undefined,
  nears: ([number, number, number] | undefined)[],   // 原拾面近点（消歧 + 对齐长度）
): [number, number, number][] | null {
  if (_curOpIndex < 0 || !_shapeHistory.length) return null
  const curFaces = shape.faces as any[]
  if (!curFaces || !curFaces.length) return null
  // 由 current-1 向前（最近优先）揾候选 b（pick 喺 _shapeHistory[b] 能干净解析嗰一格）。walk-back 闸 3 实现同边版一致：
  //   沿途经过嘅 op（k>b）必须全系变换 → 一遇非变换 op，嗰个 op 自己做最后一个候选 b（佢之上会夹住佢 → 非法），试完即停。
  for (let b = _curOpIndex - 1; b >= 0; b--) {
    const prior = _shapeHistory[b]
    const isNonTransform = !_transformOpAt[b]   // 呢格系非变换 op → 试完即停（再向上 b' 会令呢格落入开区间，非法）
    let resolved: [number, number, number][] | null = null
    do {
      if (!prior || !prior.faces || !prior.faces.length) break   // 该格无 shape（sketch/失效）→ 当前 b 跳过
      // 闸 4：纯变换面数应不变。prior 与 current 面数唔同 → 唔可信顺序对应。
      if ((prior.faces as any[]).length !== curFaces.length) break
      // 试喺 prior 干净解析（faceFp 全中 / 撞但 near 消歧成功）。复用 _ffSelectPts（同 capture/select 帧逻辑一致）。
      //   ⚠ 内部 _ffSelectPts(prior) 若都 miss 会再入呢度 → 用 _s1FaceCarryActive 闸住（递归只试顶层一次）。
      _s1FaceCarryActive = true
      let sel: [number, number, number][] | null = null
      try { sel = _ffSelectPts(prior, faceFp, nears, faceFpV2) } finally { _s1FaceCarryActive = false }
      // 解析出每个 pick 喺 prior.faces 嘅【典范索引】（priorIdx[k]）。两条路（镜边版）：
      //   A. 指纹路（sel 命中）：sel[k] = prior 某面首三角质心 → _faceIndexNearestCentroid 反查索引（d2≈0）。
      //   B. near-at-prior 退回（sel==null = prior 帧面指纹本身歧义，例如圆柱顶圆面 — _ffSelectPts 返 null）：
      //      用 stored near nears[k] 喺 prior（变换前几何，near 食正）三角最近揾面索引。仍走【典范索引→current】carry，
      //      安全唔变（near 喺 prior 几何有效，唔系当前旋转后 shape）。任一 k 无 near / 索引坏 → 当前 b abort。
      const priorIdx: number[] = []
      let ok = true
      if (sel && sel.length === faceFp.length) {
        for (const c of sel) {
          const { idx, d2 } = _faceIndexNearestCentroid(prior, c)   // sel[k] 本身就系 prior 某面首三角质心 → d2≈0
          if (idx < 0 || d2 > 1e-4) { ok = false; break }            // 匹配唔实 → abort
          priorIdx.push(idx)
        }
      } else if (b < _curOpIndex - 1) {
        // ⚠ near-at-prior 退回【只】喺开区间 (b,current) 至少夹一个变换 op 时先采用（b < curOpIndex-1，镜边版）。
        //   walk-back 已保证嗰啲 op 全系变换（闸 3）→ 即真系跨变换 carry。若区间空（b == curOpIndex-1，无变换，
        //   纯指纹歧义平帧，例如圆柱顶圆面无任何上游变换）→ 唔行 path B → return null → 字节一致退回今日 near-fallback
        //   （无 S1-面 note、无漂移警告）。保住 spec 案例(3)：no-drift/no-transform 必须 byte-identical。
        for (let k = 0; k < faceFp.length; k++) {
          const np = nears[k]
          if (!np) { ok = false; break }                            // 无 stored near → 无法 near 解析 → abort
          const { idx, d2 } = _faceIndexNearestNear(prior, np)       // prior 变换前几何 + stored near 食正 → d2≈0
          if (idx < 0 || d2 > 1e-2) { ok = false; break }            // 揾唔到 / near 距 prior 面太远 → abort
          priorIdx.push(idx)
        }
      } else {
        break   // sel miss 且区间空（无变换）→ 唔 carry → 退回今日 fallback
      }
      if (!ok) break
      // 攞每个典范索引；同一索引读 current.faces 首三角质心（变换保序 → 第 i 张面对应第 i 张）。
      const carried: [number, number, number][] = []
      for (const idx of priorIdx) {
        if (idx >= curFaces.length) { ok = false; break }            // 索引越界 → abort
        const tri = curFaces[idx].triangulation ? curFaces[idx].triangulation() : null
        const q = tri ? _ffTriCentroid(tri) : null
        if (!q) { ok = false; break }
        carried.push(q)
      }
      if (ok) resolved = carried
    } while (false)
    if (resolved) return resolved
    if (isNonTransform) {
      // GM-γ2a/γ2b（面版，镜边版）：撞到 recorded 布尔或圆角/倒角 op → 行 S2 血统（多跳）追踪面；其它 / S2 唔成 → return null。
      if (S2_LINEAGE && _s2IsRecordedOp(b)) { const s2 = _s2CarryFacePts(shape, b, faceFp, faceFpV2, nears); if (s2 && s2.length === faceFp.length) return s2 }
      return null   // 非变换 b 试过唔得 → 再向上必夹住呢个非变换 op → 整体放弃
    }
  }
  return null
}
// ── GM-γ2a：S2 布尔血统 carry（边版 + 面版）────────────────────────────────────────────────────
// 喺 _s1CarryMids/_s1CarryFacePts walk-back 撞到布尔 op k（gate-3 本应 abort）时补位。步骤：
//   ① resolve 每条 pick 喺【布尔前一帧】_shapeHistory[k−1]（fp 命中→典范索引；否则 stored near 落 prior 几何食正）；
//   ② boolWithHistory 用 prior + 录低嘅工具体重跑该布尔，追踪 sub 穿过 → 后继代表点（IsDeleted→诚实 null）；
//   ③ 后继代表点几何配对 _shapeHistory[k]（post 帧）→ 典范索引 idxK；
//   ④ (k,current) 全变换（k=walk-back 撞到嘅第一个非变换 → 之上全变换，保序）→ 读 current 同索引边/面 = carry 结果。
//  任一 pick deleted / 解析唔到 / 配对唔实 / 超重跑上限 → 返 null（caller 诚实退回近点 = 今日行为）。全程 try/catch fail-safe。
// GM-γ2b：resolve 每条边 pick 喺 root prior（链最早一跳之前一帧）→ 典范边索引（fp 命中→反查；miss→stored near 食正）。
function _s2ResolveEdgePicks(prior: any, edgeFp: string[], edgeFpV2: string[] | undefined, wantPts: ([number, number, number] | undefined)[]): number[] | null {
  const sel = _fpSelectMids(prior, edgeFp, wantPts, edgeFpV2)   // 布尔/圆角前几何 fp 干净 → 命中 → 典范索引；miss → 退 near
  const priorIdx: number[] = []
  if (sel && sel.length === edgeFp.length) {
    for (const m of sel) { const { idx, d2 } = _edgeIndexNearestMid(prior, m); if (idx < 0 || d2 > 1e-4) return null; priorIdx.push(idx) }
  } else {
    for (let i = 0; i < edgeFp.length; i++) { const np = wantPts[i]; if (!np) return null; const { idx, d2 } = _edgeIndexNearestNear(prior, np); if (idx < 0 || d2 > 1e-2) return null; priorIdx.push(idx) }
  }
  return priorIdx
}
// GM-γ2b：resolve 每张面 pick 喺 root prior → 典范面索引（镜边版；_s1FaceCarryActive 闸住 _ffSelectPts 递归）。
function _s2ResolveFacePicks(prior: any, faceFp: string[], faceFpV2: string[] | undefined, nears: ([number, number, number] | undefined)[]): number[] | null {
  _s1FaceCarryActive = true
  let sel: [number, number, number][] | null = null
  try { sel = _ffSelectPts(prior, faceFp, nears, faceFpV2) } finally { _s1FaceCarryActive = false }
  const priorIdx: number[] = []
  if (sel && sel.length === faceFp.length) {
    for (const c of sel) { const { idx, d2 } = _faceIndexNearestCentroid(prior, c); if (idx < 0 || d2 > 1e-4) return null; priorIdx.push(idx) }
  } else {
    for (let i = 0; i < faceFp.length; i++) { const np = nears[i]; if (!np) return null; const { idx, d2 } = _faceIndexNearestNear(prior, np); if (idx < 0 || d2 > 1e-2) return null; priorIdx.push(idx) }
  }
  return priorIdx
}
// GM-γ2b：多跳血统 carry（边版）。k = walk-back 撞到嘅最新 recorded op。步骤：
//   ① collectLineageChain 由 k 向前收集【只由变换相隔嘅连续 recorded op】（最新在先，超 S2_MAX_CHAIN → capped 诚实退）。
//   ② resolve picks 喺 root prior（最早一跳之前一帧）→ 典范边索引。
//   ③ 逐跳（执行序）re-exec op（布尔 boolWithHistory / 圆角 filletWithHistory）→ Modified/Generated/IsDeleted 追踪 →
//      后继代表点几何配对该跳 post → 典范索引；中间只有变换（保序）→ 同索引直接过渡到下一跳 prior。
//   ④ 尾段 km→current 全变换 → 读 current 同索引边中点 = carry 结果。
//  任一跳 deleted / 解析唔到 / 配对唔实 / 超重跑上限 / 链超长 → null（caller 诚实退回近点）。全程 try/catch fail-safe + memo。
function _s2CarryMids(
  shape: any,
  k: number,
  edgeFp: string[],
  edgeFpV2: string[] | undefined,
  wantPts: ([number, number, number] | undefined)[],
): { mids: [number, number, number][]; bornAt: number } | null {
  if (!S2_LINEAGE || !_oc) return null
  if (k < 1 || !_s2IsRecordedOp(k)) return null   // 无 tool/圆角记录（cached prefix / 非 instrumented op）→ 唔 claim
  const curEdges = shape.edges as any[]
  if (!curEdges.length) return null
  const chain = collectLineageChain(k, _s2IsRecordedOp, (i) => !!_transformOpAt[i], S2_MAX_CHAIN)
  if (!chain) return null
  const pickKey = 's2e:' + chain.ops.join(',') + ':' + edgeFp.join('|')
  if (_s2Memo.has(pickKey)) { const m = _s2Memo.get(pickKey); if (m) { _s2CarriedFlag = true; return { mids: m, bornAt: k } } return null }
  if (chain.capped) { _s2NoteChainCap(); _s2Memo.set(pickKey, null); return null }   // 链超 S2_MAX_CHAIN → 诚实退回近点
  const ops = chain.ops.slice().reverse()   // 执行序：最早在先 [k1..km(=k)]
  const rootPrior = _shapeHistory[ops[0] - 1]
  if (!rootPrior || !rootPrior.edges || !(rootPrior.edges as any[]).length) { _s2Memo.set(pickKey, null); return null }
  try {
    let trackedIdx = _s2ResolveEdgePicks(rootPrior, edgeFp, edgeFpV2, wantPts)   // ① root prior 解析 → 典范边索引
    if (!trackedIdx) { _s2Memo.set(pickKey, null); return null }
    for (let h = 0; h < ops.length; h++) {   // ② 逐跳向前
      const kk = ops[h]
      if (_s2ReExecCount >= S2_MAX_REEXEC) { _s2NoteCap(); _s2Memo.set(pickKey, null); return null }
      const hopPrior = _shapeHistory[kk - 1], hopPost = _shapeHistory[kk]
      if (!hopPrior || !(hopPrior.edges as any[])?.length || !hopPost || !(hopPost.edges as any[])?.length) { _s2Memo.set(pickKey, null); return null }
      const hopPriorEdges = hopPrior.edges as any[], hopPostEdges = hopPost.edges as any[]
      for (const ti of trackedIdx) if (ti >= hopPriorEdges.length) { _s2Memo.set(pickKey, null); return null }   // 保序假设越界 → miss
      const tracked = trackedIdx.map((i) => hopPriorEdges[i].wrapped)
      _s2ReExecCount++
      const res = _s2ReExecOp(kk, hopPrior, tracked)
      if (!res || !res.map || res.map.length !== trackedIdx.length) { _s2Memo.set(pickKey, null); return null }
      const nextIdx: number[] = []
      for (const ent of res.map) {
        if (ent.deleted || !ent.outPts.length) { _s2Memo.set(pickKey, null); return null }   // 消耗（filleted 棱 / cut 掉）→ 诚实 miss
        const rep = ent.outPts[0] as [number, number, number]
        const { idx: idxK, d2 } = _edgeIndexNearestMid(hopPost, rep)
        if (idxK < 0 || d2 > 1e-2 || idxK >= hopPostEdges.length) { _s2Memo.set(pickKey, null); return null }   // 配对唔实/越界 → miss
        nextIdx.push(idxK)
      }
      trackedIdx = nextIdx   // 本跳 post 典范索引；中间只有变换 → 同索引即下一跳 prior 同棱
    }
    const carried: [number, number, number][] = []   // ③ 尾段 km→current 全变换 → 读 current 同索引
    for (const idx of trackedIdx) {
      if (idx >= curEdges.length) { _s2Memo.set(pickKey, null); return null }
      const q = curEdges[idx].pointAt(0.5)
      carried.push([q.x, q.y, q.z])
    }
    buildWarnings.push(ops.length > 1
      ? `持久边名经上游 ${ops.length} 个特征（布尔/圆角）逐跳 OCCT 历史追踪解析（真拓扑命名 S2 多跳）`
      : '持久边名经上游布尔/圆角以 OCCT 历史追踪解析（真拓扑命名 S2）')
    _s2CarriedFlag = true   // 通知 caller：已出准确 S2 警告，唔好再叠 S1「变换追踪」那句
    _s2Memo.set(pickKey, carried)
    return { mids: carried, bornAt: k }
  } catch { _s2Memo.set(pickKey, null); return null }   // keystone fail-safe：任何抛 → 退回今日 fallback
}
// GM-γ2b：多跳血统 carry（面版，镜边版）。
function _s2CarryFacePts(
  shape: any,
  k: number,
  faceFp: string[],
  faceFpV2: string[] | undefined,
  nears: ([number, number, number] | undefined)[],
): [number, number, number][] | null {
  if (!S2_LINEAGE || !_oc) return null
  if (k < 1 || !_s2IsRecordedOp(k)) return null
  const curFaces = shape.faces as any[]
  if (!curFaces || !curFaces.length) return null
  const chain = collectLineageChain(k, _s2IsRecordedOp, (i) => !!_transformOpAt[i], S2_MAX_CHAIN)
  if (!chain) return null
  const pickKey = 's2f:' + chain.ops.join(',') + ':' + faceFp.join('|')
  if (_s2Memo.has(pickKey)) { const m = _s2Memo.get(pickKey); if (m) { _s2CarriedFlag = true; return m } return null }
  if (chain.capped) { _s2NoteChainCap(); _s2Memo.set(pickKey, null); return null }
  const ops = chain.ops.slice().reverse()
  const rootPrior = _shapeHistory[ops[0] - 1]
  if (!rootPrior || !rootPrior.faces || !(rootPrior.faces as any[]).length) { _s2Memo.set(pickKey, null); return null }
  try {
    let trackedIdx = _s2ResolveFacePicks(rootPrior, faceFp, faceFpV2, nears)
    if (!trackedIdx) { _s2Memo.set(pickKey, null); return null }
    for (let h = 0; h < ops.length; h++) {
      const kk = ops[h]
      if (_s2ReExecCount >= S2_MAX_REEXEC) { _s2NoteCap(); _s2Memo.set(pickKey, null); return null }
      const hopPrior = _shapeHistory[kk - 1], hopPost = _shapeHistory[kk]
      if (!hopPrior || !(hopPrior.faces as any[])?.length || !hopPost || !(hopPost.faces as any[])?.length) { _s2Memo.set(pickKey, null); return null }
      const hopPriorFaces = hopPrior.faces as any[], hopPostFaces = hopPost.faces as any[]
      for (const ti of trackedIdx) if (ti >= hopPriorFaces.length) { _s2Memo.set(pickKey, null); return null }
      const tracked = trackedIdx.map((i) => hopPriorFaces[i].wrapped)
      _s2ReExecCount++
      const res = _s2ReExecOp(kk, hopPrior, tracked)
      if (!res || !res.map || res.map.length !== trackedIdx.length) { _s2Memo.set(pickKey, null); return null }
      const nextIdx: number[] = []
      for (const ent of res.map) {
        if (ent.deleted || !ent.outPts.length) { _s2Memo.set(pickKey, null); return null }
        const rep = ent.outPts[0] as [number, number, number]
        const { idx: idxK, d2 } = _faceIndexNearestNear(hopPost, rep)   // CoM 落面上 → ptTriDist2≈0
        if (idxK < 0 || d2 > 1e-1 || idxK >= hopPostFaces.length) { _s2Memo.set(pickKey, null); return null }
        nextIdx.push(idxK)
      }
      trackedIdx = nextIdx
    }
    const carried: [number, number, number][] = []
    for (const idx of trackedIdx) {
      if (idx >= curFaces.length) { _s2Memo.set(pickKey, null); return null }
      const tri = curFaces[idx].triangulation ? curFaces[idx].triangulation() : null
      const q = tri ? _ffTriCentroid(tri) : null
      if (!q) { _s2Memo.set(pickKey, null); return null }
      carried.push(q)
    }
    buildWarnings.push(ops.length > 1
      ? `持久面名经上游 ${ops.length} 个特征（布尔/圆角）逐跳 OCCT 历史追踪解析（真拓扑命名 S2-面 多跳）`
      : '持久面名经上游布尔/圆角以 OCCT 历史追踪解析（真拓扑命名 S2-面）')
    _s2CarriedFlag = true   // 通知 caller：已出准确 S2-面 警告，唔好再叠 S1-面 那句
    _s2Memo.set(pickKey, carried)
    return carried
  } catch { _s2Memo.set(pickKey, null); return null }
}
// S2 重跑成本上限诚实提示（只出一次/重建）
function _s2NoteCap(): void {
  if (_s2NotedCap) return
  buildWarnings.push(`真拓扑命名 S2：本次重建布尔/圆角重跑已达上限 ${S2_MAX_REEXEC} 次，余下选边退回近点（如结果唔啱请重新拾边）`)
  _s2NotedCap = true
}
// GM-γ2b：S2 多跳链超长上限诚实提示（只出一次/重建）
function _s2NoteChainCap(): void {
  if (_s2NotedChainCap) return
  buildWarnings.push(`真拓扑命名 S2：上游连续布尔/圆角超 ${S2_MAX_CHAIN} 跳（追踪链过长），该选边退回近点（如结果唔啱请重新拾边）`)
  _s2NotedChainCap = true
}

// ── R1 弦高圆角：喺棱中点算局部二面角 β（材料侧）──────────────────────────────────────────────
// 揾返棱中点最贴嘅两张面（三角距 <0.25mm² = 相邻，行 chamferAsym:1302-1308 相邻面口径），各取 normalAt(mid)
//   → filletMath.betaFromNormals。揾唔到两面（<2）→ 返 null（caller 退回缺省 β=90°）。要求 shape 已三角化。
function _dihedralAtMid(shape: any, mid: [number, number, number]): number | null {
  try {
    const faces = shape.faces as any[]
    if (!faces || !faces.length) return null
    const cand: { d: number; n: [number, number, number] }[] = []
    for (const fc of faces) {
      const tri = fc.triangulation ? fc.triangulation() : null
      if (!tri || !tri.vertices || !tri.vertices.length) continue
      const V = tri.vertices as number[], T = tri.trianglesIndexes as number[]
      let dmin = Infinity
      for (let i = 0; i + 2 < T.length; i += 3) { const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3; const d = ptTriDist2(mid[0], mid[1], mid[2], V[a], V[a + 1], V[a + 2], V[b], V[b + 1], V[b + 2], V[c], V[c + 1], V[c + 2]); if (d < dmin) dmin = d }
      if (dmin < 0.25) { try { const nn = fc.normalAt(mid); cand.push({ d: dmin, n: [nn.x, nn.y, nn.z] }) } catch { /* 无法向 → 跳过 */ } }
    }
    if (cand.length < 2) return null
    cand.sort((a, b) => a.d - b.d)   // 最贴两面
    return betaFromNormals(cand[0].n, cand[1].n)
  } catch { return null }
}

// ── R1 收进圆角 setback（诚实窄版）：raw MakeFillet + Add_5 (U,r) 律 —— 共享顶点邻接棱靠顶点段半径线性降 ──
// mids/midRad 平行（每条 resolved 棱嘅中点 + 目标半径）。识别哪几条棱共享顶点 → 该端建 taper 律。
//   Add_5(TColgp_Array1OfPnt2d, edge) 系变半径 (U,r) 律入口；探针 typeof mk.Add_5==='function' + 逐步 try/catch，
//   任何一环（Array1OfPnt2d 未绑 / Add_5 不可达 / Build 未收敛 / 结果无界）→ 返 null（caller HARD FLOOR 退回等半径圆角）。
function _rawSetbackFillet(shape: any, mids: [number, number, number][], midRad: number[], setbackRatio: number, continuity: 'G1' | 'G2' = 'G1'): any {
  if (!_oc || !shape || !shape.wrapped || mids.length < 1) return null
  const oc = _oc
  // 1) mids → TopoDS edges（中点最贴嗰条）+ 两端点（判共享顶点）
  const edges = shape.edges as any[]
  const picked: { edge: any; p0: [number, number, number]; p1: [number, number, number]; r: number }[] = []
  for (let k = 0; k < mids.length; k++) {
    const m = mids[k]
    let best: any = null, bd = Infinity
    for (const e of edges) { const q = e.pointAt(0.5); const d = (q.x - m[0]) ** 2 + (q.y - m[1]) ** 2 + (q.z - m[2]) ** 2; if (d < bd) { bd = d; best = e } }
    if (!best || !best.wrapped) return null
    const a = best.pointAt(0), b = best.pointAt(1)
    picked.push({ edge: best, p0: [a.x, a.y, a.z], p1: [b.x, b.y, b.z], r: Math.max(0.05, midRad[k] ?? midRad[0]) })
  }
  // 2) 每条棱：哪端接触【其余任一所选棱】嘅端点 = 共享顶点端 → 该端 taper
  const touch = picked.map(() => ({ lo: false, hi: false }))
  for (let i = 0; i < picked.length; i++) for (let j = 0; j < picked.length; j++) {
    if (i === j) continue
    const sv = edgesShareVertex({ p0: picked[i].p0, p1: picked[i].p1 }, { p0: picked[j].p0, p1: picked[j].p1 })
    if (sv.aTouchLo) touch[i].lo = true
    if (sv.aTouchHi) touch[i].hi = true
  }
  if (!touch.some((t) => t.lo || t.hi)) return null   // 冇任何共享顶点 → 收进无意义（caller 退回等半径，唔浪费 raw 路径）
  const r = GCWithScope()
  try {
    // ctor（镜 lineage.filletWithHistory：fillet 必带 ChFi3d 第二参；逐名 fall back）
    let mk: any = null
    const filShape = (oc.ChFi3d_FilletShape && (oc.ChFi3d_FilletShape.ChFi3d_Rational ?? 0)) ?? 0
    for (const nm of ['BRepFilletAPI_MakeFillet_2', 'BRepFilletAPI_MakeFillet_1', 'BRepFilletAPI_MakeFillet']) {
      const C = (oc as any)[nm]; if (typeof C !== 'function') continue
      try { mk = r(new C(shape.wrapped, filShape)); break } catch { try { mk = r(new C(shape.wrapped)); break } catch { /* next */ } }
    }
    if (!mk || typeof mk.Add_5 !== 'function') return null   // 探针：Add_5 (U,r) 律入口不可达 → null（HARD FLOOR）
    if (continuity === 'G2') {
      const g2 = (oc as any).GeomAbs_Shape?.GeomAbs_G2
      if (g2 == null || typeof mk.SetContinuity !== 'function') return null
      try { mk.SetContinuity(g2, 1e-3) } catch { return null }
    }
    const Arr = (oc as any).TColgp_Array1OfPnt2d_2 || (oc as any).TColgp_Array1OfPnt2d_1 || (oc as any).TColgp_Array1OfPnt2d
    const P2 = (oc as any).gp_Pnt2d_3 || (oc as any).gp_Pnt2d_1 || (oc as any).gp_Pnt2d
    if (typeof Arr !== 'function' || typeof P2 !== 'function') return null
    let added = 0
    for (let k = 0; k < picked.length; k++) {
      const law = buildSetbackLaw(picked[k].r, setbackRatio, touch[k].lo, touch[k].hi)   // (u,r) 控制点
      let arr: any = null
      try { arr = r(new Arr(1, law.length)) } catch { return null }
      for (let i = 0; i < law.length; i++) { try { arr.SetValue(i + 1, r(new P2(law[i].u, law[i].r))) } catch { return null } }
      try { mk.Add_5(arr, picked[k].edge.wrapped); added++ } catch { return null }
    }
    if (!added) return null
    try { const prog = oc.Message_ProgressRange_1 ? r(new oc.Message_ProgressRange_1()) : undefined; try { mk.Build(prog) } catch { mk.Build() } } catch { return null }
    if (typeof mk.IsDone === 'function' && !mk.IsDone()) return null
    const out = typeof mk.Shape === 'function' ? mk.Shape() : null
    if (!out || (typeof out.IsNull === 'function' && out.IsNull())) return null
    const res = cast(out)
    // HARD FLOOR：结果 bbox 须有界 + 无爆冲（相对原实体）
    let refBB: any = null, candBB: any = null
    try { refBB = shape.boundingBox.bounds } catch { refBB = null }
    try { candBB = (res as any).boundingBox.bounds } catch { candBB = null }
    if (!bboxExtentsSane(candBB, refBB, 0.4)) return null
    return res
  } catch { return null }
}

// Fusion per-radius-group continuity. G1 keeps replicad's proven default path; G2 must be a real
// OCCT curvature-continuous fillet, never a relabelled G1 surface. Supports scalar/per-edge radii and
// the existing linear start/end radius mode. A null result is a hard failure for a requested G2.
function _rawContinuityFillet(shape: any, mids: [number, number, number][], midRad: number[], continuity: 'G2', endRatio?: number): any {
  if (!_oc || !shape?.wrapped || !mids.length) return null
  const oc = _oc
  const edges = shape.edges as any[]
  const picked: { edge: any; r: number }[] = []
  for (let k = 0; k < mids.length; k++) {
    const m = mids[k]
    let best: any = null, bd = Infinity
    for (const e of edges) {
      const q = e.pointAt(0.5)
      const d = (q.x - m[0]) ** 2 + (q.y - m[1]) ** 2 + (q.z - m[2]) ** 2
      if (d < bd) { bd = d; best = e }
    }
    if (!best?.wrapped) return null
    picked.push({ edge: best, r: Math.max(0.05, midRad[k] ?? midRad[0] ?? 0.05) })
  }
  const r = GCWithScope()
  try {
    let mk: any = null
    const filShape = (oc.ChFi3d_FilletShape && (oc.ChFi3d_FilletShape.ChFi3d_Rational ?? 0)) ?? 0
    for (const nm of ['BRepFilletAPI_MakeFillet_2', 'BRepFilletAPI_MakeFillet_1', 'BRepFilletAPI_MakeFillet']) {
      const C = (oc as any)[nm]; if (typeof C !== 'function') continue
      try { mk = r(new C(shape.wrapped, filShape)); break } catch { try { mk = r(new C(shape.wrapped)); break } catch { /* next */ } }
    }
    const cont = (oc as any).GeomAbs_Shape?.[`GeomAbs_${continuity}`]
    if (!mk || cont == null || typeof mk.SetContinuity !== 'function') return null
    try { mk.SetContinuity(cont, 1e-3) } catch { return null }
    let added = 0
    for (const p of picked) {
      try {
        if (endRatio != null && Math.abs(endRatio - 1) > 1e-6 && typeof mk.Add_3 === 'function') mk.Add_3(p.r, Math.max(0.05, p.r * endRatio), p.edge.wrapped)
        else if (typeof mk.Add_2 === 'function') mk.Add_2(p.r, p.edge.wrapped)
        else return null
        added++
      } catch { return null }
    }
    if (!added) return null
    try { const prog = oc.Message_ProgressRange_1 ? r(new oc.Message_ProgressRange_1()) : undefined; try { mk.Build(prog) } catch { mk.Build() } } catch { return null }
    if (typeof mk.IsDone === 'function' && !mk.IsDone()) return null
    const out = typeof mk.Shape === 'function' ? mk.Shape() : null
    if (!out || (typeof out.IsNull === 'function' && out.IsNull())) return null
    const res = cast(out)
    let refBB: any = null, candBB: any = null
    try { refBB = shape.boundingBox.bounds } catch { refBB = null }
    try { candBB = (res as any).boundingBox.bounds } catch { candBB = null }
    return bboxExtentsSane(candBB, refBB, 0.4) ? res : null
  } catch { return null }
}

// Adjacent-face fillet resolves a shared B-rep edge and builds the exact radius.
// Non-adjacent face blends remain unsupported and fail without changing the source.
function faceFillet(shape: any, radius: number, near1: [number, number, number], near2: [number, number, number]): any {
  const r = radius
  if (!Number.isFinite(r) || r <= 0) throw new Error('面圆角半径必须大于零')
  try { shape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }) } catch { /* 三角化供拾面/法向 */ }
  const faces = shape.faces as any[]
  if (!faces || !faces.length) throw new Error('面圆角：实体无面 — 已保留原实体')
  const pickFace = (p: [number, number, number]): any => {
    let bf: any = null, bd = Infinity
    for (const fc of faces) {
      const tri = fc.triangulation ? fc.triangulation() : null
      if (!tri || !tri.vertices || !tri.vertices.length) continue
      const V = tri.vertices as number[], T = tri.trianglesIndexes as number[]
      let dmin = Infinity
      for (let i = 0; i + 2 < T.length; i += 3) { const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3; const d = ptTriDist2(p[0], p[1], p[2], V[a], V[a + 1], V[a + 2], V[b], V[b + 1], V[b + 2], V[c], V[c + 1], V[c + 2]); if (d < dmin) dmin = d }
      if (dmin < bd) { bd = dmin; bf = fc }
    }
    return bf
  }
  const f1 = pickFace(near1), f2 = pickFace(near2)
  if (!f1 || !f2) throw new Error('面圆角：拾面解析唔到 — 已保留原实体')
  if (f1 === f2) throw new Error('面圆角：两次拾中同一张面 — 请拾两张唔同嘅面')
  const sharedMid = (() => {
    const d2 = (a: any, b: any) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2
    for (const a of (f1.edges as any[])) {
      const a0 = a.pointAt(0), a1 = a.pointAt(1), am = a.pointAt(0.5)
      for (const b of (f2.edges as any[])) {
        const b0 = b.pointAt(0), b1 = b.pointAt(1), bm = b.pointAt(0.5)
        if ((d2(a0, b0) + d2(a1, b1) < 1e-8 || d2(a0, b1) + d2(a1, b0) < 1e-8) && d2(am, bm) < 1e-8) return [am.x, am.y, am.z] as [number, number, number]
      }
    }
    return null
  })()
  if (!sharedMid) throw new Error('面圆角：两张面没有共同 B-rep 边 — 当前可靠模式只支持相邻面；已保留原实体')
  // Use the exact requested radius; the rebuild transaction records failure
  // and keeps the predecessor if this adjacent-face blend cannot be made.
  const rr = r
  try {
    const out = shape.fillet(rr, (edge: any) => edge.containsPoint(sharedMid))
    if (validShellSolid(out)) return out
  } catch { /* report the exact-radius failure below */ }
  throw new Error(`面圆角 R${r} 无法在两面共同边生成有效 B-rep — 已保留原实体`)

}

// Fillet/chamfer the edges nearest a SET of 3D points (CAD coords) — Fusion-style multi-edge selection.
// R1：mode='chord'+chord → 弦高圆角（每条棱按局部二面角 β 换算半径）；setbackRatio>0 → 收进圆角（raw Add_5 (U,r) 律）。
function roundNearPoints(shape: any, kind: 'fillet' | 'chamfer', size: number, pts: [number, number, number][], size2?: number, chain?: boolean, edgeFp?: string[], edgeFpV2?: string[], radii?: number[], mode?: 'chord', chord?: number, setbackRatio?: number, continuity: 'G1' | 'G2' = 'G1', continuities?: ('G1' | 'G2')[]): any {
  // Fusion radius groups can carry different continuity rows in one timeline feature. OCCT continuity is
  // builder-wide, so mixed G1/G2 groups are solved sequentially against the evolving B-rep while remaining
  // one WebCAD Feature. Same-continuity groups stay in one builder/path for better corner treatment.
  if (kind === 'fillet' && continuities?.length === pts.length && continuities.length) {
    const unique = [...new Set(continuities)]
    if (unique.length > 1) {
      let out = shape
      for (const cont of unique) {
        const ids = continuities.map((c, i) => c === cont ? i : -1).filter((i) => i >= 0)
        const gp = ids.map((i) => pts[i])
        const gr = radii?.length === pts.length ? ids.map((i) => radii[i]) : undefined
        const gf1 = edgeFp?.length === pts.length ? ids.map((i) => edgeFp[i]) : undefined
        const gf2 = edgeFpV2?.length === pts.length ? ids.map((i) => edgeFpV2[i]) : undefined
        out = roundNearPoints(out, 'fillet', gr?.[0] ?? size, gp, size2, chain, gf1, gf2, gr, mode, chord, setbackRatio, cont)
      }
      return out
    }
    continuity = unique[0]
  }
  const edges = shape.edges as any[]
  const mids: [number, number, number][] = []
  let maxNearD2 = 0   // S143：每个近点距最近棱嘅最大平方距 — fp miss 退回近点时判选择漂移（对称体旋转）
  for (const p of pts) {
    let bestMid: any = null, bestD = Infinity
    for (const e of edges) {
      let dmin = Infinity
      for (const t of [0, 0.25, 0.5, 0.75, 1]) { const q = e.pointAt(t); const d = (q.x - p[0]) ** 2 + (q.y - p[1]) ** 2 + (q.z - p[2]) ** 2; if (d < dmin) dmin = d }
      if (dmin < bestD) { bestD = dmin; bestMid = e.pointAt(0.5) }
    }
    if (bestMid) { mids.push([bestMid.x, bestMid.y, bestMid.z]); if (bestD > maxNearD2) maxNearD2 = bestD }
  }
  if (!mids.length) throw new Error('no edges near points')
  // 切线链：每个拣中嘅棱扩展到整条 G1 相切边链（去重按中点格点）
  if (chain) {
    const seen = new Set<string>()
    const expanded: [number, number, number][] = []
    for (const m of mids) for (const cm of tangentChainMids(shape, m)) {
      const k = `${Math.round(cm[0] * 100)},${Math.round(cm[1] * 100)},${Math.round(cm[2] * 100)}`
      if (!seen.has(k)) { seen.add(k); expanded.push(cm) }
    }
    if (expanded.length > mids.length) buildWarnings.push(`切线链：${mids.length} 条所选棱扩展到 ${expanded.length} 条相切连续棱`)
    mids.length = 0; mids.push(...expanded)
  }
  // S122：持久边命名 — 此时 mids = 最终解析边集（含切线链扩展）。edgeFp 存在 → 用指纹喺当前边集选边
  // （全中→精确跟同一几何棱；任何 miss/撞→保留上面 near-point+chain 嘅 mids = 今日行为）；否则首次捕获指纹供 store 写回。
  // 下面 finder/apply 完全不变 → 无 edgeFp 时字节一致。
  if (edgeFp && edgeFp.length) {
    const sel = _fpSelectMids(shape, edgeFp, mids.slice(), edgeFpV2)   // S131：near-biased 消歧；S134：edgeFpV2 先试 v2 旋转不变
    if (sel) { mids.length = 0; mids.push(...sel) }
    else {
      // ── S1 真拓扑命名（TRANSFORM lineage）：fp 喺当前 shape 解析唔到（漂移）→ 先试沿上游变换以拓扑顺序追踪该棱。
      //   成功（中间全部系变换 op + prior 帧能干净解析）→ 用 carried mids 覆盖漂移近点 + 压住 S143 警告。
      //   任何闸唔过（无历史 / 中间有非变换 op / 边数变 / 无 prior 解析）→ s1=null → 完全 fall through 到下面 S143 fallback（字节一致）。
      const s1 = _s1CarryMids(shape, edgeFp, edgeFpV2, pts)
      if (s1 && s1.mids.length === edgeFp.length) {
        mids.length = 0; mids.push(...s1.mids)
        if (_s2CarriedFlag) _s2CarriedFlag = false   // GM-γ2a：实际经 S2 布尔血统解析（已出准确警告）→ 唔叠 S1 那句
        else buildWarnings.push('持久边名经上游变换以拓扑顺序追踪解析（真拓扑命名 S1）')
      } else {
      // S143：edgeFp 存在但喺当前边集解析唔到（true miss）→ 已退回近点拣边（mids 系上面近点解析）。
      // 若存低嘅 near 距最近棱过远（上游变换/旋转令 body 移走 — 尤其【对称体旋转】，v2 折叠失效退回 v1、
      // v1 bbox 归一化亦漂移），近点会拣错棱、圆角可能落错位/缩小 → 诚实警告，唔好静默出错几何。
      const bb = _fpBboxVerts(shape); let diag = 0
      if (bb.length >= 6) { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < bb.length; i += 3) for (let k = 0; k < 3; k++) { if (bb[i + k] < mn[k]) mn[k] = bb[i + k]; if (bb[i + k] > mx[k]) mx[k] = bb[i + k] } diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) }
      const nd = Math.sqrt(maxNearD2)
      if (diag > 0 && nd > Math.max(2, 0.06 * diag)) buildWarnings.push(`${kind === 'fillet' ? '圆角' : '倒角'}：持久边名喺当前实体上解析唔到、已退回近点拣边，但近点距最近棱 ${nd.toFixed(1)}mm（疑上游变换/旋转令选择漂移 — 对称体旋转后边命名会失效）。如结果唔啱请重新拾边。`)
      }
    }
  }
  else { const cap = _fpCapture(shape, mids); _lastResolvedFp = cap.v1; _lastResolvedFpV2 = cap.v2 }
  // ── R1 弦高圆角 chord ──：mode==='chord' → 逐条 resolved 棱按局部二面角 β 换算半径 r=c/(2cos(β/2))。
  //   盒/棱柱直边 β 恒定 → 精确；变角曲棱用中点 β 近似（诚实，下面出提示）。走【逐边 grouped scalar】路径（复用 perEdge）。
  let _chordRadii: number[] | null = null
  if (kind === 'fillet' && mode === 'chord' && chord && chord > 1e-6) {
    try { shape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }) } catch { /* 三角化供相邻面/法向查找 */ }
    let anyFallback = false
    _chordRadii = mids.map((m) => {
      const b = _dihedralAtMid(shape, m)
      if (b == null) anyFallback = true
      const rr = chordToRadius(chord, b ?? Math.PI / 2)   // 揾唔到二面角 → 缺省当直角
      return Math.min(Math.max(0.05, rr), chord * 4)       // 钳绝对上限防 β→π 离谱
    })
    if (anyFallback) buildWarnings.push(`弦高圆角：部分棱揾唔到相邻两面、局部二面角退回 90° 换算（如结果唔啱请改用「半径」模式）`)
  }
  // OR the per-edge finders: match any edge containing one of the picked midpoints (replicad Finder DSL).
  const finder = mids.length === 1
    ? (e: any) => e.containsPoint(mids[0])
    : (e: any) => e.either(mids.map((M) => (f: any) => f.containsPoint(M)))
  // Variable-radius fillet: replicad FilletRadius = number | [r_start, r_end]; a tuple tapers the radius
  // linearly along each edge (Fusion/SW "variable radius fillet"). Only meaningful for fillet, not chamfer.
  const variable = kind === 'fillet' && size2 != null && size2 > 0 && Math.abs(size2 - size) > 1e-6
  // S174 逐边变半径圆角：radii（与原始 pts 平行）→ 每条 resolved mid 按【最近原始拾取点】取半径（几何键控 → 对 fp 重排序 / 切线链扩展都稳）。
  // ⚠ 实现【唔用】replicad function-radiusConfig：实测证实 function 形式会施加到【所有】边（要自己 null-gate，而 Edge 冇 boolean containsPoint 难精准 gate）。
  //   改用【按半径分组 + 逐组 scalar fillet(r, containsPoint finder)】—— 复用证过嘅 finder 路径，单 op 只圆该组棱。retry 阶梯按比例缩放全部半径。
  // radii 缺省 / 全等 → perEdge=false → 行返原 scalar/tuple 路径（字节不变）。
  // GM-3DV3 M7：逐边距离亦适用于 chamfer（equal 模式）—— radii 参数复用做逐边尺寸，perEdge 分组路径 fillet/chamfer 共用
  // R1：chord 模式 → 强制走 perEdge grouped-scalar（每条棱各自弦高换算半径）。
  const perEdge = !!_chordRadii || ((kind === 'fillet' || kind === 'chamfer') && !!radii && radii.length === pts.length && size > 1e-9 && radii.some((r) => Math.abs(r - size) > 1e-6))
  // S174 audit (HIGH)：resolved mids 经 _fpSelectMids/_s1CarryMids 后【按 k 顺序】仍与 pts[k]/radii[k] 平行（无切线链时 mids.length===pts.length）。
  //   故 midRad【直接用 radii[k] 索引平行】—— 唔好再用 Euclidean-nearest 去对【冻结嘅原始 pts】（上游插入 move/rotate/mirror 后 body 换咗位，
  //   current-frame mids 离 stale pts 好远 → 最近点会配错半径、甚至 swap）。仅切线链扩展（mids 多过 pts，冇 1:1）先退回几何键控。
  const midRad: number[] = _chordRadii ? _chordRadii   // R1 chord：逐 mid 弦高半径（与 mids 平行）
    : !perEdge ? []
    : mids.length === pts.length
      ? radii!.map((r) => Math.max(0.05, r))
      : mids.map((m) => { let bi = 0, bd = Infinity; for (let i = 0; i < pts.length; i++) { const d = (pts[i][0] - m[0]) ** 2 + (pts[i][1] - m[1]) ** 2 + (pts[i][2] - m[2]) ** 2; if (d < bd) { bd = d; bi = i } } return Math.max(0.05, radii![bi]) })
  // ── R1 收进圆角 setback ──：setbackRatio>0（仅 fillet）→ 先试 raw Add_5 (U,r) 律。成功即返；
  //   失败（Add_5 不可达 / 无共享顶点 / 未收敛 / 无界）→ fall through 到下面等半径圆角（HARD FLOOR，绝不产生坏几何）。
  if (kind === 'fillet' && setbackRatio && setbackRatio > 1e-3) {
    const baseR = perEdge ? midRad : mids.map(() => Math.max(0.05, size))
    const sb = _rawSetbackFillet(shape, mids, baseR, setbackRatio, continuity)
    if (sb) { _recordFillet(_curOpIndex, 'fillet', mids, baseR); return sb }
    buildWarnings.push('收进圆角：内核变半径律（Add_5）不可达或未收敛 — 已退回等半径圆角（结果安全）')
  }
  for (const s of [size]) {
    try {
      const sc = s / size
      if (kind === 'fillet' && continuity === 'G2') {
        const actualR = perEdge ? midRad.map((v) => v * sc) : mids.map(() => s)
        const g2 = _rawContinuityFillet(shape, mids, actualR, 'G2', variable ? size2! / size : undefined)
        if (!g2) throw new Error('G2 fillet did not converge')
        if (s !== size) buildWarnings.push(`曲率连续（G2）圆角 ${size} 太大，已自动缩小到 ${s.toFixed(1)} 以贴合所选棱`)
        _recordFillet(_curOpIndex, 'fillet', mids, actualR)
        return g2
      }
      if (perEdge) {
        const groups = new Map<number, [number, number, number][]>()   // 半径(×sc) → 该半径嘅 mids
        for (let j = 0; j < mids.length; j++) { const rv = midRad[j] * sc; const arr = groups.get(rv); if (arr) arr.push(mids[j]); else groups.set(rv, [mids[j]]) }
        let sh = shape
        for (const [rv, gm] of groups) {
          const fdr = gm.length === 1 ? (e: any) => e.containsPoint(gm[0]) : (e: any) => e.either(gm.map((M) => (f: any) => f.containsPoint(M)))
          sh = kind === 'fillet' ? sh.fillet(rv, fdr) : sh.chamfer(rv, fdr)   // GM-3DV3 M7：chamfer 逐边距离亦走分组 scalar 路径
        }
        if (s !== size) buildWarnings.push(`${kind === 'fillet' ? '圆角（逐边半径）' : '倒角（逐边距离）'}${size} 太大，已自动缩小到 ${(sc * 100).toFixed(0)}% 以贴合所选棱`)
        _recordFillet(_curOpIndex, kind, mids, midRad.map((r) => r * sc))   // GM-γ2b：录逐边圆角/倒角（实际成功嘅缩放尺寸）供 S2 重跑
        return sh
      }
      const rad: any = variable ? [s, s * (size2! / size)] : s
      const r = kind === 'fillet' ? shape.fillet(rad, finder) : shape.chamfer(s, finder)
      if (s !== size) buildWarnings.push(`${kind === 'fillet' ? '圆角' : '倒角'} ${size} 太大，已自动缩小到 ${s.toFixed(1)} 以贴合所选棱`)
      // GM-γ2b：录圆角/倒角 op（实际成功半径 s；变半径圆角以起点半径 s 近似 — S2 只追拓扑对应，半径廓形不影响哪面被改）供 S2 重跑。
      _recordFillet(_curOpIndex, kind, mids, mids.map(() => s))
      return r
    } catch { /* report the requested size as failed */ }
  }
  throw new Error(`${kind} near points failed`)
}
// Asymmetric chamfer (Fusion 两距离 / 距离+角度) on picked edges. selectedFace = the body's top (or
// bottom if flip) face — works for top/bottom-rim edges (the common asymmetric case). Falls back to an
// equal chamfer at d1 (+warning) if replicad can't resolve the reference face for an edge.
function chamferAsym(shape: any, d1: number, second: number, mode: 'two' | 'angle', pts: [number, number, number][], refZ: number, flip: boolean, refFaceNear?: [number, number, number], edgeFp?: string[], edgeFpV2?: string[]): any {
  const edges = shape.edges as any[]
  const mids: [number, number, number][] = []
  for (const p of pts) {
    let bestMid: any = null, bestD = Infinity
    for (const e of edges) {
      let dmin = Infinity
      for (const t of [0, 0.25, 0.5, 0.75, 1]) { const q = e.pointAt(t); const d = (q.x - p[0]) ** 2 + (q.y - p[1]) ** 2 + (q.z - p[2]) ** 2; if (d < dmin) dmin = d }
      if (dmin < bestD) { bestD = dmin; bestMid = e.pointAt(0.5) }
    }
    if (bestMid) mids.push([bestMid.x, bestMid.y, bestMid.z])
  }
  if (!mids.length) throw new Error('no edges near points')
  // S122：持久边命名（同 roundNearPoints）— edgeFp 存在用指纹选边（全中→跟）；否则首次捕获。无 fp 字节一致。
  // S134：带 edgeFpV2 → 先试 v2 旋转不变（advisory gate）；捕获时同步算 v2。
  if (edgeFp && edgeFp.length) { const sel = _fpSelectMids(shape, edgeFp, mids.slice(), edgeFpV2); if (sel) { mids.length = 0; mids.push(...sel) } }   // S131：near-biased 消歧（mids = 近点解析中点，平行 edgeFp）
  else { const cap = _fpCapture(shape, mids); _lastResolvedFp = cap.v1; _lastResolvedFpV2 = cap.v2 }
  const finder = mids.length === 1 ? (e: any) => e.containsPoint(mids[0]) : (e: any) => e.either(mids.map((M) => (f: any) => f.containsPoint(M)))
  // GM-3DV3 M7：真·相邻面参考 —— 为每条棱揾【相邻面】（三角距≈0 命中）做 selectedFace 参考点，取代旧「bbox 顶/底 Z 平面」。
  //   旧法 inPlane('XY', refZ) 只对顶/底缘边可靠（竖边/斜面缘边 → 平面唔含该棱 → chamfer 抛错退等距）。
  //   新法按 flip 拣两相邻面之一（缺省=法向 z 较大=较「上」嗰面 · flip=另一面）→ 竖边/斜边亦可两距离/角度。解析失败 → 诚实退回旧 refZ。
  let sf: (ff: any) => any = (ff: any) => ff.inPlane('XY', refZ)
  try {
    try { shape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }) } catch { /* 三角化供相邻面查找 */ }
    const faces = shape.faces as any[]
    const refPts: [number, number, number][] = []
    for (const m of mids) {
      const adj: { c: [number, number, number]; nz: number; refD: number }[] = []
      for (const fc of faces) {
        const tri = fc.triangulation ? fc.triangulation() : null
        if (!tri || !tri.vertices || !tri.vertices.length) continue
        const V = tri.vertices as number[], T = tri.trianglesIndexes as number[]
        let dmin = Infinity, refD = Infinity
        for (let i = 0; i + 2 < T.length; i += 3) {
          const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3
          const d = ptTriDist2(m[0], m[1], m[2], V[a], V[a + 1], V[a + 2], V[b], V[b + 1], V[b + 2], V[c], V[c + 1], V[c + 2]); if (d < dmin) dmin = d
          if (refFaceNear) { const rd = ptTriDist2(refFaceNear[0], refFaceNear[1], refFaceNear[2], V[a], V[a + 1], V[a + 2], V[b], V[b + 1], V[b + 2], V[c], V[c + 1], V[c + 2]); if (rd < refD) refD = rd }
        }
        if (dmin < 0.25) { let nz = 0; try { const nn = fc.normalAt(m); nz = nn.z } catch { /* 无法向 → nz=0 */ } const c = fc.center; adj.push({ c: [c.x, c.y, c.z], nz, refD }) }   // 棱喺该面边界上（<0.5mm）= 相邻面
      }
      if (adj.length < 1) throw new Error('no adjacent face for edge')
      adj.sort(refFaceNear ? (a, b) => a.refD - b.refD : (a, b) => b.nz - a.nz)   // 新特征用真参考面；旧档仍用法向 z fallback
      refPts.push((flip ? adj[adj.length - 1] : adj[0]).c)
    }
    sf = refPts.length === 1 ? (ff: any) => ff.containsPoint(refPts[0]) : (ff: any) => ff.either(refPts.map((P) => (g: any) => g.containsPoint(P)))
  } catch { sf = (ff: any) => ff.inPlane('XY', refZ) }   // 相邻面解析失败 → 退回旧 bbox 参考（诚实）
  const cfg = mode === 'angle' ? { distance: d1, angle: second, selectedFace: sf } : { distances: [d1, second] as [number, number], selectedFace: sf }
  // GM-γ2b：非对称倒角以对称距离 d1 近似录 S2（同 edge 集、同拓扑改动 → Modified/IsDeleted 一致；两距离/角度只影响斜面倾角，唔改哪面被替换）。
  _recordFillet(_curOpIndex, 'chamfer', mids, mids.map(() => d1))
  try {
    return shape.chamfer(cfg as any, finder)
  } catch {
    buildWarnings.push(`两${mode === 'angle' ? '(距离+角度)' : '距离'}倒角失败（所选棱不在顶/底面边缘）— 已改为等距 C${d1}`)
    return shape.chamfer(d1, finder)
  }
}

// Squared distance from a point to a triangle (robust closest-point-on-triangle, Ericson).
// Used to pick which B-rep face a click landed on: the real hit point lies ON one face's triangle (dist≈0).
function ptTriDist2(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): number {
  const abx = bx - ax, aby = by - ay, abz = bz - az
  const acx = cx - ax, acy = cy - ay, acz = cz - az
  const apx = px - ax, apy = py - ay, apz = pz - az
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz
  if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz
  const bpx = px - bx, bpy = py - by, bpz = pz - bz
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz
  if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); const qx = ax + abx * v, qy = ay + aby * v, qz = az + abz * v; return (px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2 }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz
  if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); const qx = ax + acx * w, qy = ay + acy * w, qz = az + acz * w; return (px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2 }
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); const qx = bx + (cx - bx) * w, qy = by + (cy - by) * w, qz = bz + (cz - bz) * w; return (px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2 }
  const denom = 1 / (va + vb + vc), v = vb * denom, w = vc * denom
  const qx = ax + abx * v + acx * w, qy = ay + aby * v + acy * w, qz = az + abz * v + acz * w
  return (px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2
}

// Fusion Shell face resolution. Near points come from the viewport ray hit; resolve them to exact
// B-rep face indices so Tangent Chain can pass the real TopoDS_Face list to MakeThickSolidByJoin.
function _shellFaceIndicesNear(shape: any, near: [number, number, number][]): number[] {
  try { shape.mesh({ tolerance: 0.08, angularTolerance: 0.35 }) } catch { /* existing triangulation may still be usable */ }
  const faces = shape.faces as any[]
  const out: number[] = []
  for (const p of near) {
    let best = -1, bestD = Infinity
    for (let fi = 0; fi < faces.length; fi++) {
      const tri = faces[fi].triangulation ? faces[fi].triangulation() : null
      if (!tri?.vertices?.length || !tri?.trianglesIndexes?.length) continue
      const V = tri.vertices as number[], T = tri.trianglesIndexes as number[]
      let dmin = Infinity
      for (let i = 0; i + 2 < T.length; i += 3) {
        const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3
        const d = ptTriDist2(p[0], p[1], p[2], V[a], V[a + 1], V[a + 2], V[b], V[b + 1], V[b + 2], V[c], V[c + 1], V[c + 2])
        if (d < dmin) dmin = d
      }
      if (dmin < bestD) { bestD = dmin; best = fi }
    }
    if (best >= 0 && !out.includes(best)) out.push(best)
  }
  return out
}

// Fusion Rule Fillet (2025 rule model):
//  - all: every boundary edge of the selected faces/features
//  - between: only edges shared by set 1 and set 2
// Face wrappers expose their exact B-rep edges; an endpoint+midpoint key deduplicates fresh wrappers.
function _ruleFilletMids(shape: any, rule: { mode: 'all' | 'between'; faces1: [number, number, number][]; faces2?: [number, number, number][] }): [number, number, number][] {
  const faces = shape.faces as any[]
  const f1 = _shellFaceIndicesNear(shape, rule.faces1)
  const f2 = rule.mode === 'between' ? _shellFaceIndicesNear(shape, rule.faces2 ?? []) : []
  if (!f1.length || (rule.mode === 'between' && !f2.length)) return []
  let scale = 1
  try { const b = shape.boundingBox.bounds as [number[], number[]]; scale = Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]) || 1 } catch { /* 1 */ }
  const eps = Math.max(1e-5, scale * 1e-7), q = (v: number) => Math.round(v / eps)
  const xyz = (p: any) => `${q(p.x)},${q(p.y)},${q(p.z)}`
  const collect = (ids: number[]) => {
    const m = new Map<string, [number, number, number]>()
    for (const fi of ids) for (const e of (faces[fi]?.edges ?? [])) {
      try { const a = e.pointAt(0), b = e.pointAt(1), c = e.pointAt(0.5); const ends = [xyz(a), xyz(b)].sort(); m.set(`${ends[0]}|${ends[1]}|${xyz(c)}`, [c.x, c.y, c.z]) } catch { /* degenerate */ }
    }
    return m
  }
  const a = collect(f1)
  if (rule.mode === 'all') return [...a.values()]
  const b = collect(f2)
  return [...a].filter(([k]) => b.has(k)).map(([, m]) => m)
}

// Fusion Full Round Fillet: the user selects side set 1, the center face set, and side set 2.
// There is deliberately no radius input: for the prismatic/planar case the two center/side
// boundary lines determine the cylinder axis and diameter exactly.  Diverging side normals mean
// a convex outer cap (fuse); facing side normals mean a concave inner trough (cut).
//
// This is a separate B-rep construction because an ordinary OCCT edge fillet at exactly half the
// face width fails when the center face collapses to zero area (the reason Fusion exposes Full Round
// as its own feature type).  Unsupported non-linear/non-parallel face sets fail honestly instead of
// silently substituting an almost-full ordinary fillet.
function _fullRoundFillet(shape: any, full: { side1: [number, number, number][]; center: [number, number, number][]; side2: [number, number, number][] }): any {
  const s1 = _shellFaceIndicesNear(shape, full.side1)
  const cc = _shellTangentClosure(shape, _shellFaceIndicesNear(shape, full.center))
  const s2 = _shellFaceIndicesNear(shape, full.side2)
  return fullRoundFilletFromFaces(shape, { side1: s1, center: cc, side2: s2 }, makeCylinder)
}

// Expand selected faces across shared edges only when the two surface normals are G1-continuous.
// Endpoint+midpoint keys identify the same topological edge even when each Face exposes a fresh wrapper.
function _shellTangentClosure(shape: any, seed: number[], angleTolDeg = 1): number[] {
  if (!seed.length) return []
  const faces = shape.faces as any[]
  let scale = 1
  try { const b = shape.boundingBox.bounds as [number[], number[]]; scale = Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]) || 1 } catch { /* 1 */ }
  const eps = Math.max(1e-5, scale * 1e-7)
  const q = (v: number) => Math.round(v / eps)
  const xyz = (p: any) => [q(p.x), q(p.y), q(p.z)].join(',')
  const edgeMap = new Map<string, { fi: number; m: [number, number, number] }[]>()
  for (let fi = 0; fi < faces.length; fi++) {
    let edges: any[] = []
    try { edges = faces[fi].edges as any[] } catch { continue }
    for (const e of edges) {
      try {
        const a = e.pointAt(0), b = e.pointAt(1), m = e.pointAt(0.5)
        const ends = [xyz(a), xyz(b)].sort()
        const key = `${ends[0]}|${ends[1]}|${xyz(m)}`
        const row = { fi, m: [m.x, m.y, m.z] as [number, number, number] }
        const list = edgeMap.get(key); if (list) list.push(row); else edgeMap.set(key, [row])
      } catch { /* degenerate edge */ }
    }
  }
  const adj = new Map<number, { fi: number; m: [number, number, number] }[]>()
  for (const list of edgeMap.values()) {
    if (list.length < 2) continue
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]
      const aa = adj.get(a.fi) || []; aa.push({ fi: b.fi, m: a.m }); adj.set(a.fi, aa)
      const bb = adj.get(b.fi) || []; bb.push({ fi: a.fi, m: a.m }); adj.set(b.fi, bb)
    }
  }
  const keep = new Set(seed), queue = seed.slice(), cosTol = Math.cos(angleTolDeg * Math.PI / 180)
  while (queue.length) {
    const fi = queue.shift()!
    for (const nb of adj.get(fi) || []) {
      if (keep.has(nb.fi)) continue
      try {
        const n1 = faces[fi].normalAt(nb.m), n2 = faces[nb.fi].normalAt(nb.m)
        const l1 = Math.hypot(n1.x, n1.y, n1.z) || 1, l2 = Math.hypot(n2.x, n2.y, n2.z) || 1
        const dot = Math.abs((n1.x * n2.x + n1.y * n2.y + n1.z * n2.z) / (l1 * l2))
        if (dot >= cosTol) { keep.add(nb.fi); queue.push(nb.fi) }
      } catch { /* no reliable normal => do not expand */ }
    }
  }
  return [...keep]
}

// Exact-face shell/offset primitive. signedThickness follows replicad shell(): positive=inward,
// negative=outward. An empty face list returns the offset solid used to build a closed hollow body.
function _shellExactFaces(shape: any, signedThickness: number, faceIndices: number[]): any {
  if (!_oc) throw new Error('kernel unavailable')
  const r = GCWithScope()
  const faces = shape.faces as any[]
  const remove = r(new (_oc as any).TopTools_ListOfShape_1())
  for (const i of faceIndices) if (faces[i]?.wrapped) remove.Append_1(faces[i].wrapped)
  const progress = r(new (_oc as any).Message_ProgressRange_1())
  const builder = r(new (_oc as any).BRepOffsetAPI_MakeThickSolid())
  builder.MakeThickSolidByJoin(shape.wrapped, remove, -signedThickness, 1e-3, (_oc as any).BRepOffset_Mode.BRepOffset_Skin, false, false, (_oc as any).GeomAbs_JoinType.GeomAbs_Arc, false, progress)
  const raw = builder.Shape()
  if (!raw || raw.IsNull()) throw new Error('shell returned null')
  return cast(_orientSolidOutward(raw))
}

// Replay the whole feature list into a single B-rep solid.
// Coplanar-face fuse is OCCT-wasm's classic fragility (a boss sitting exactly ON a face throws / returns
// junk — cuts already有 -0.5 nudge, fuse 一直冇兜底). Retry ladder: plain fuse → sink the tool 0.02mm
// along -n (guarantees real overlap, far below print tolerance) → rethrow. Honest warning on the retry.
function fuseRobust(base: any, solid: any, n: [number, number, number] = [0, 0, 1]): any {
  try { return base.fuse(solid) }
  catch {
    const s2 = solid.translate(-n[0] * 0.02, -n[1] * 0.02, -n[2] * 0.02)
    const r = base.fuse(s2)
    buildWarnings.push('合并兜底：凸台同底面共面致布尔失败 — 已沿法向微沉 0.02mm 重试成功（打印无感）')
    return r
  }
}

// T757：環形阵列复本角度（度）。full=total/n 均分（最后副本 ≠ 原件）；angle=total/(n−1) 端点含
// （同 2D 草图环形阵列 T476/Fusion 惯例一致）；sym=种子 0，±k·(total/(n−1))，n 偶数时 + 侧多一个（文档化偏差）。
export function cpAngles(n: number, total: number, mode: 'full' | 'angle' | 'sym'): number[] {
  const out: number[] = []
  if (mode === 'sym') {
    const step = total / (n - 1)
    const half = Math.floor((n - 1) / 2)
    for (let k = 1; k <= half; k++) { out.push(step * k); out.push(-step * k) }
    if ((n - 1) % 2 === 1) out.push(step * (half + 1))
  } else {
    const step = mode === 'full' ? 360 / n : (Math.abs(total) >= 359.9 ? total / n : total / (n - 1))   // #30：full 模式恒用 360/n（唔好读 totalAngle，否则时间轴改细总角度会偷偷缩间距但 UI 仍写「完整 360°」）
    for (let i = 1; i < n; i++) out.push(step * i)
  }
  return out
}

// T767（S46）：三角网格 → B-rep 实体。逐三角 makePolygon 面 → Sewing 缝 shell →
// ShapeFix_Solid.SolidFromShell（定向成实体）→ UnifySameDomain 合并共面三角（盒形 STL → 6 真平面，
// 圆角处保留三角面 — 诚实 Faceted 级，唔扮 Prismatic 曲面重建）。
function meshToSolidShape(v: number[], t: number[]): any {
  const sew = new _oc.BRepBuilderAPI_Sewing(1e-5, true, true, true, false)
  let added = 0
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
    const pa: [number, number, number] = [v[a], v[a + 1], v[a + 2]]
    const pb: [number, number, number] = [v[b], v[b + 1], v[b + 2]]
    const pc: [number, number, number] = [v[c], v[c + 1], v[c + 2]]
    // 零面积守卫（叉积模）— 烂三角唔好喂落去
    const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2]
    const wx = pc[0] - pa[0], wy = pc[1] - pa[1], wz = pc[2] - pa[2]
    const cx2 = uy * wz - uz * wy, cy2 = uz * wx - ux * wz, cz2 = ux * wy - uy * wx
    if (cx2 * cx2 + cy2 * cy2 + cz2 * cz2 < 1e-16) continue
    try { sew.Add(makePolygon([pa, pb, pc]).wrapped); added++ } catch { /* 跳过坏三角 */ }
  }
  if (!added) return null
  const prog = new _oc.Message_ProgressRange_1()
  sew.Perform(prog); prog.delete()
  const sewed = sew.SewedShape()
  if (!sewed || sewed.IsNull()) return null
  let out: any = sewed
  try {
    const shell = _oc.TopoDS.Shell_1(sewed)
    const solid = new _oc.ShapeFix_Solid_1().SolidFromShell(shell)
    if (solid && !solid.IsNull()) out = solid
  } catch { buildWarnings.push('网格转换：缝合后唔系单一闭合壳（有破洞/多块）— 已按开放壳处理，布尔可能唔稳') }
  try {
    const u = new _oc.ShapeUpgrade_UnifySameDomain_2(out, true, true, false)
    u.SetLinearTolerance(1e-5); u.SetAngularTolerance(0.01)
    u.Build()
    const us = u.Shape()
    if (us && !us.IsNull()) out = us
  } catch { /* 合并失败 → 保留逐三角面 */ }
  return cast(out)
}

// B4（Mesh→B-rep 参数化重建 v1）：用 fitPrimitives（meshFit.ts B1-B3）识别网格里嘅【圆柱】。
// v1 安全范围 = 单一主导全圆柱（rod / pin / shaft / 圆柱管坯）→ 用 replicad 高阶 makeCylinder 重建成【保证有效】嘅参数化实体。
// 【关键设计约束（实测踩过）】：混合「参数化圆柱面 + faceted 端盖三角」再 Sewing 会产生拓扑唔一致嘅 invalid solid，
//   OCCT tessellate 时触发【唔可 catch 嘅 wasm abort】直接杀死 worker（比 faceted 更差）。故 v1 只走高阶 maker（零 abort 风险）。
//   复杂件（box+孔 / 多圆柱）嘅 box−cylinder 布尔重建引擎 = v2（真 XL）。非纯圆柱 → 返 null → caller 退 faceted（零迴歸）。
function meshToBrepParametric(v: number[], t: number[], mode: 'param' | 'prismatic'): { shape: any; cylCount: number; coverage: number } | null {
  let fit: ReturnType<typeof fitPrimitives>
  let diag = 1
  try {
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity
    for (let i = 0; i < v.length; i += 3) { const x = v[i], y = v[i + 1], z = v[i + 2]; if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z; if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z }
    diag = Math.hypot(mxx - mnx, mxy - mny, mxz - mnz) || 1
    fit = fitPrimitives(v, t, { diag })
  } catch { return null }
  // ── #2b（Mesh→B-rep v2）：prismatic = 轴对齐盒 − 圆柱孔 布尔重建（全高階 makeBox/makeCylinder/.cut → 保证 valid solid，零 sewing = 零 wasm abort）。
  //   v2.0 HOLES-ONLY：任一圆柱唔系干净盒内轴对齐孔（凸台/斜孔/浮孔/圆角边）→ 返 null → caller 退 faceted（诚实，唔推虚假几何）。
  if (mode === 'prismatic') {
    const box = detectAxisBox(fit, diag)
    if (!box) return null
    if (fit.totalTriCount <= 0 || fit.facetedTriCount > fit.totalTriCount * 0.08) return null   // >8% 自由曲面三角 → 唔系干净盒+孔
    const cyls2 = fit.primitives.filter((p): p is Extract<typeof p, { kind: 'cyl' }> => p.kind === 'cyl')
    const tools: NonNullable<ReturnType<typeof classifyBoxHole>>[] = []
    for (const c of cyls2) { const tl = classifyBoxHole(box, c, diag); if (!tl) return null; tools.push(tl) }   // 任一 cyl 唔系干净孔 → bail 整个 v2
    let solid: any = null
    try { solid = makeBox(box.min as [number, number, number], box.max as [number, number, number]) } catch { return null }
    for (const tl of tools) {
      let tool: any
      try { tool = makeCylinder(tl.r, tl.len, tl.base, tl.axis) } catch { return null }
      try { solid = solid.cut(tool) } catch { return null }   // 任一布尔 throw → bail → faceted
    }
    if (!solid || !(solid as any).wrapped || (solid as any).wrapped.IsNull()) return null
    // 保险 mesh-validate（最后一道防线，零迴歸铁律）：mesh 唔到 / 空 → null → faceted。全高階 solid 唔会触发 sewing wasm abort。
    try { const m = (solid as any).mesh({ tolerance: 0.1, angularTolerance: 0.5 }); if (!m || !m.triangles || !m.triangles.length) return null } catch { return null }
    const coverage = fit.totalTriCount > 0 ? Math.max(0, Math.min(1, (fit.totalTriCount - fit.facetedTriCount) / fit.totalTriCount)) : 1
    return { shape: solid, cylCount: tools.length, coverage }
  }
  const cyls = fit.primitives.filter((p): p is Extract<typeof p, { kind: 'cyl' }> => p.kind === 'cyl')
  // v1：恰好【一个】全圆柱主导，其余全部系垂直轴嘅平面盖（无自由曲面/无斜面/无多圆柱）→ 纯圆柱坯。
  if (cyls.length !== 1) return null
  const c = cyls[0]
  if (!c.full) return null   // 部分圆柱（半圆等）唔封实体
  const nT = fit.totalTriCount
  if (nT <= 0 || fit.facetedTriCount > nT * 0.05) return null   // >5% 自由曲面三角 → 唔系纯圆柱
  const dotV = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  for (const p of fit.primitives) if (p.kind === 'plane' && Math.abs(dotV(p.normal, c.axis)) < 0.9) return null   // 有平面唔垂直轴 → 唔系纯圆柱（可能盒+柱）
  const h = c.h1 - c.h0
  if (!(h > 1e-4) || !(c.r > 1e-4)) return null
  // makeCylinder(radius, height, baseCenter, axisDir)：baseCenter = origin + h0·axis（origin 系 h=0 平面圆心）
  const base: [number, number, number] = [c.origin[0] + c.h0 * c.axis[0], c.origin[1] + c.h0 * c.axis[1], c.origin[2] + c.h0 * c.axis[2]]
  let shp: any = null
  try { shp = makeCylinder(c.r, h, base, [c.axis[0], c.axis[1], c.axis[2]]) } catch { return null }
  if (!shp || !(shp as any).wrapped || (shp as any).wrapped.IsNull()) return null
  // 保险：makeCylinder 必然有效，但仍 mesh-validate（零迴歸铁律 — mesh 唔到 → null → faceted）
  try { const m = (shp as any).mesh({ tolerance: 0.1, angularTolerance: 0.5 }); if (!m || !m.triangles || !m.triangles.length) return null }
  catch { return null }
  const coverage = nT > 0 ? Math.max(0, Math.min(1, (nT - fit.facetedTriCount) / nT)) : 1
  return { shape: shp, cylCount: 1, coverage }
}

// Only planar, geometrically unchanged faces with the same oriented normal may
// carry a sketch in this first version. A nearest-face guess could select a boss
// or the opposite side after deletion, so ambiguity is a hard failure.
function sketchPlanarDescriptor(face: any): { normal: [number, number, number]; offset: number; area: number; edgeLengths: number[]; outline: string[]; center: [number, number, number] } | null {
  if (String(face.geomType).toUpperCase() !== 'PLANE') return null
  const c = face.center, nn = face.normalAt([c.x, c.y, c.z]).normalized()
  const normal: [number, number, number] = [nn.x, nn.y, nn.z]
  const center: [number, number, number] = [c.x, c.y, c.z]
  const area=measureArea(face)
  const q=(p: number[])=>p.map((x,i)=>Math.round((x-center[i])*1e6)).join(',')
  const outline=face.edges.map((edge: any)=> {
    if (edge.geomType==='LINE') return 'LINE:'+ [q(edge.startPoint.toTuple()),q(edge.endPoint.toTuple())].sort().join(';')
    return edge.geomType+':'+Array.from({length:16},(_,i)=>q(edge.pointAt(i/16).toTuple())).sort().join(';')
  }).sort()
  const edgeLengths = face.edges.map((e: any) => e.length).sort((a: number,b: number)=>a-b)
  return { normal, center, offset: center.reduce((sum, x, i)=>sum+x*normal[i],0), area, edgeLengths, outline }
}
function resolveSketchFace(shape: any, binding: SketchFaceBinding): ResolvedSketchFace {
  if (!shape) throw new Error('草图来源面失效：来源实体不存在')
  shape.mesh({ tolerance: 0.1, angularTolerance: 0.5 })
  // Exact geometric containment is independent of the display triangulation
  // fingerprint. It is never a nearest-face or nearest-point selection.
  const containsOriginalAnchor = ({face,desc}: any): boolean => {
    if (!desc || !desc.normal.every((x: number,i: number)=>Math.abs(x-binding.normal[i])<1e-7) || Math.abs(desc.offset-binding.offset)>1e-6) return false
    const tri=face.triangulation(),v=tri?.vertices,t=tri?.trianglesIndexes,p=binding.near
    if (!v || !t) return false
    for (let i=0;i<t.length;i+=3) {
      const a=t[i]*3,b=t[i+1]*3,c=t[i+2]*3
      if (ptTriDist2(p[0],p[1],p[2],v[a],v[a+1],v[a+2],v[b],v[b+1],v[b+2],v[c],v[c+1],v[c+2])<1e-12) return true
    }
    return false
  }

  const planarFaces = shape.faces.map((face: any)=>({face,desc:sketchPlanarDescriptor(face)}))
  const anchoredFaces = planarFaces.filter(containsOriginalAnchor)
  let candidates = planarFaces.filter(({desc}: any)=>desc &&
    desc.normal.every((x: number,i: number)=>Math.abs(x-binding.normal[i])<1e-7) &&
    Math.abs(desc.area-binding.area)<Math.max(1e-5,binding.area*1e-7) &&
    JSON.stringify(desc.outline)===JSON.stringify(binding.outline) && desc.edgeLengths.length===binding.edgeLengths.length && desc.edgeLengths.every((x: number,i: number)=>Math.abs(x-binding.edgeLengths[i])<1e-6))
  let boundaryChanged = false
  if (!candidates.length) {
    // A changed outline may still be the very same support plane (e.g. grow an
    // upstream boss radius). Require the original picked interior point to lie
    // on exactly one face of that exact plane; never choose the closest face.
    candidates=anchoredFaces
    boundaryChanged=true
  }
  if (candidates.length > 1 && !boundaryChanged) {
    const bbox = _fpBboxVerts(shape)
    // Equal faces can coexist. Rebuilding a compound source can change mesh
    // fingerprints without moving its faces. If exact fingerprint identity is
    // unavailable, require exactly one original-anchor-containing support face.
    const fingerprintMatches = candidates.filter(({face}: any)=>_ffFaceFp(face,bbox)===binding.faceFp[0])
    if (fingerprintMatches.length === 1) candidates = fingerprintMatches
    else {
      // The picked face may have changed its boundary while other repeated
      // faces still match the old descriptor. Search every exact support face.
      candidates = anchoredFaces
      boundaryChanged = true
    }
  }
  // A different unchanged repeated face can be the only old-descriptor match.
  // Prefer the unique face that still contains the actual original anchor.
  // If both identify the same face, retain its translation-following behavior.
  if (anchoredFaces.length === 1 && (candidates.length !== 1 || candidates[0] !== anchoredFaces[0])) {
    candidates = anchoredFaces
    boundaryChanged = true
  }
  if (candidates.length !== 1) {throw new Error('草图来源面失效或有歧义：请修复面关联；已保留原模型')}
  // Fingerprints provide the same persistent identity vocabulary as other face
  // tools. Descriptor uniqueness is additionally required even if an old near
  // point would let the general face picker choose one of multiple candidates.
  const desc = candidates[0].desc
  // The descriptor above selected the unique support face. This advisory
  // consistency check must not report the general picker's unused fallback.
  const warningCount = buildWarnings.length
  const selected = _ffSelectPts(shape,binding.faceFp,[binding.near],binding.faceFpV2,binding.faceFpTopo)
  buildWarnings.splice(warningCount)
  if (!boundaryChanged && selected?.length && Math.abs(selected[0].reduce((sum: number,x: number,i: number)=>sum+x*desc.normal[i],0)-desc.offset)>1e-5)
    throw new Error('草图来源面引用不一致：请重新选择来源面')
  const delta = (boundaryChanged ? binding.normal.map(x=>x*(desc.offset-binding.offset)) : desc.center.map((x: number,i: number)=>x-binding.center[i])) as [number,number,number]
  const near=binding.near.map((x,i)=>x+delta[i]) as [number,number,number]
  const refs = _ffCapture(shape,[near])
  return { delta, binding: { ...binding, near, center:desc.center, outline:desc.outline, area:desc.area, edgeLengths:desc.edgeLengths, offset: desc.offset, faceFp: refs.v1, faceFpV2: refs.v2, faceFpTopo: refs.topo } }

}

function buildShape(features: Feature[], noCache = false): any {
  resolvedSketchFaces = {}
  // Complete prefix history is needed even when a consumer itself is cached.
  if (features.some(f=>(f.type==='extrude' || f.type==='sketch' || f.type==='revolve') && f.sketchFaceBinding)) noCache = true
  buildWarnings = []
  failedFeatures = []
  parkedBodies = []
  _resolvedEdgeFp = {}; _lastResolvedFp = null   // S122：每次重放清空边指纹捕获
  _resolvedEdgeFpV2 = {}; _lastResolvedFpV2 = null   // S134：清空 v2 旋转不变边指纹捕获
  _resolvedFaceFp = {}; _lastResolvedFaceFp = null   // S125：清空面指纹捕获
  _resolvedFaceFpV2 = {}; _lastResolvedFaceFpV2 = null   // S136：清空 v2 旋转不变面指纹捕获
  _resolvedFaceFpTopo = {}; _lastResolvedFaceFpTopo = null   // #14：清空面拓扑指纹捕获
  _shapeHistory = []; _transformOpAt = []; _curOpIndex = -1   // S1：清空逐特征 shape 历史 + 变换保序标记
  _boolOpAt = []; _boolKindAt = []; _boolToolAt = []; _filletOpAt = []; _s2ReExecCount = 0; _s2Memo = new Map(); _s2NotedCap = false; _s2NotedChainCap = false; _s2CarriedFlag = false   // GM-γ2a：清空 S2 布尔血统逐特征标记 + 成本控制；GM-γ2b：清空圆角血统 + 链上限提示
  let shape: any = null
  const merge = (solid: any, op?: string) => {
    if (op === 'cut' && shape) { const tool = solid.translate(0, 0, -0.5); _recordBool(_curOpIndex, 'cut', tool); shape = shape.cut(tool) } // nudge cut tool to avoid coplanar-face boolean failures
    else if (op === 'intersect' && shape) { _recordBool(_curOpIndex, 'intersect', solid); shape = shape.intersect(solid) }
    else if (op === 'newbody' && shape) parkedBodies.push({ name: `实体${parkedBodies.length + 1}`, shape: solid })   // P2 New Body：独立泊车（活动体唔郁）；无活动体时落 else = 做活动体（首体永远活动，Fusion body1 同义）
    else { if (shape) { _recordBool(_curOpIndex, 'fuse', solid); shape = fuseRobust(shape, solid) } else shape = solid }
  }
  let prevBefore: any = null, prevWasCut = false // for cpattern: shape before the last feature + whether it was a cut
  let _cutRunStart: any = null  // 审计修复#1：连续 cut 特征（多特征孔=沉头/埋头/螺母槽 拆成 N 个 cut）run 嘅起点快照 → 阵列时 prevBefore 退到整孔之前，removed 包含全部 cut（唔再只复制最后一个子特征丢通孔）
  // T757/T781：目标快照 — 目标特征执行前/后嘅 shape（delta = after−before 或 before−after），重放时捕捉。
  // 環形/矩形/路径阵列 + 镜像 四种特征共用同一套 snapshot-delta 架构。
  const TARGETED = new Set(['circPattern', 'pattern', 'pathpattern', 'mirror', 'geoPattern'])
  const cpTargets = new Set<string>()
  for (const f of features) { const t = (f as { targets?: string[] }).targets; if (TARGETED.has(f.type) && t) for (const x of t) cpTargets.add(x) }
  const cpSnap: Record<string, { before: any; after: any; cutTool?: any }> = {}
  // T781：对一组变换逐目标重放 delta — 切除目标重切 removed 区域，加料目标 fuse added 区域（T757 语义照搬）
  const applyTargetDeltas = (targets: string[], xforms: ((s: any) => any)[], label: string, nudge: [number, number, number] = [0, 0, 1]) => {
    for (const tid of targets) {
      const snap = cpSnap[tid]
      if (!snap || !snap.after) throw new Error(`${label}：目标特征不存在或已被抑制，原模型保留`)
      const tf = features.find((x) => x.id === tid) as { operation?: string; op?: string } | undefined
      const wasCut = !!tf && (tf.operation === 'cut' || tf.op === 'cut')
      try {
        if (wasCut && snap.before) {
          const removed = snap.cutTool ? snap.cutTool.clone() : snap.before.clone().cut(snap.after.clone())
          for (const xf of xforms) shape = shape.cut(xf(removed.clone()))
        } else {
          if (snap.before) {
            const removed = snap.before.clone().cut(snap.after.clone())
            if (removed.faces.length) for (const xf of xforms) shape = shape.cut(xf(removed.clone()))
          }
          const added = snap.before ? snap.after.clone().cut(snap.before.clone()) : snap.after.clone()
          if (added.faces.length) for (const xf of xforms) shape = fuseRobust(shape, xf(added.clone()), nudge)   // #70：兜底微沉沿真正错开方向（阵列轴/平移方向），唔再写死世界 Z
        }
      } catch (e) { throw new Error(`${label}副本失败（目标 delta 布尔）：` + ((e as any)?.message || e)) }
    }
  }
  // ── 增量重建（T730）：揾同上次特征序列嘅最长公共前缀，由该处快照续算 ──
  const sigs = features.map((f) => JSON.stringify(f))
  let start = 0
  if (!noCache) {
    while (start < sigs.length && start < _rcSigs.length && sigs[start] === _rcSigs[start] && _rcSnaps[start]) start++
    // pattern/cpattern/circPattern 需要「上一特征之前」嘅快照（prevBefore）→ 后退一步由更早快照起
    // T756：独立草图透明 — 续算点或回退路径上嘅 'sketch' 特征要跳过，搵真正嘅前一个实体特征
    let _k = start
    while (_k < features.length && features[_k].type === 'sketch') _k++
    if (start > 0 && _k < features.length && (features[_k].type === 'pattern' || features[_k].type === 'cpattern')) {
      start--
      while (start > 0 && features[start].type === 'sketch') start--
    }
    // T757/T781：续算点之后有「带目标嘅阵列/镜像」→ 目标快照要重放先有，回退到最早目标特征（牺牲缓存换正确性）
    for (let ci = start; ci < features.length; ci++) {
      const cf = features[ci] as { type: string; targets?: string[] }
      if (TARGETED.has(cf.type) && cf.targets?.length) {
        for (const tid of cf.targets) { const ti = features.findIndex((x) => x.id === tid); if (ti >= 0 && ti < start) start = ti }
      }
    }
    if (start > 0) {
      const snap = _rcSnaps[start - 1]!
      try {
        shape = snap.shape ? snap.shape.clone() : null
        parkedBodies = snap.parked.map((b) => ({ name: b.name, shape: b.shape.clone() }))
        buildWarnings = snap.warns.slice()
        const pf = features[start - 1] as { operation?: string; op?: string }
        prevWasCut = pf?.operation === 'cut' || pf?.op === 'cut'
        // S1：增量续算跳过咗 [0..start-1] 特征 → 由持久 _rcSnaps 补回呢段 _shapeHistory（畀 S1 回望），
        //   变换保序标记直接由特征类型推算（与 recordHistory 同口径）。某格快照失效（null/超 RC_CAP）→ 留空（undefined）
        //   = 该格回望命中唔到 → S1 自然退回今日 fallback，唔会出错。
        for (let _h = 0; _h < start; _h++) {
          const sn = _rcSnaps[_h]
          try { _shapeHistory[_h] = sn && sn.shape ? sn.shape.clone() : null } catch { _shapeHistory[_h] = undefined }
          _transformOpAt[_h] = _isTransformOp(features[_h])
        }
      } catch { start = 0; shape = null; parkedBodies = []; buildWarnings = []; _shapeHistory = []; _transformOpAt = [] }  // 快照失效 → 全量重放
    }
  } else { start = 0 }
  if (start === 0 && !noCache) rcClear()
  // 每特征录一份快照（clone 共享底层 — cpattern snapBefore 同款已证机制）；超 RC_CAP 唔录（重放兜底）
  const rcRecord = (i: number) => {
    if (noCache) return
    _rcSigs[i] = sigs[i]
    if (i >= RC_CAP) { _rcSnaps[i] = null; return }
    try { _rcSnaps[i] = { shape: shape ? shape.clone() : null, parked: parkedBodies.map((b) => ({ name: b.name, ...(b.kind ? { kind: b.kind } : {}), shape: b.shape.clone() })), warns: buildWarnings.slice() } }
    catch { _rcSnaps[i] = null }
  }
  // S1：逐特征录低产出后嘅 active shape（clone，免后续 op 改到底层）+ 系咪保序变换。index-keyed 故任何 continue 分支
  //   各自调用一次都对齐。clone 失败 → 留 undefined（该格回望命中唔到 → S1 退回 fallback）。noCache 路径照录（splitBuild
  //   等独立重放亦可能想 S1，且数组每次 buildShape 已清空 — 无跨次污染）。
  const recordHistory = (i: number) => {
    try { _shapeHistory[i] = shape ? shape.clone() : null } catch { _shapeHistory[i] = undefined }
    _transformOpAt[i] = _isTransformOp(features[i])
  }
  for (let _i = start; _i < features.length; _i++) {
    const f = features[_i]
    _curOpIndex = _i   // S1：当前重放序 — roundNearPoints/roundNearPoint 读，决定回望 _shapeHistory 范围
    // Clone the pre-feature shape only when a pattern/cpattern follows (so it can pattern a hole correctly).
    // T756：向后扫过任何独立草图特征 — [切除, 草图, 环形阵列] 都要照样捕捉切除前快照
    let _nj = _i + 1
    while (features[_nj]?.type === 'sketch') _nj++
    const _next = features[_nj]
    // 审计修复#1：追踪连续 cut-run 起点 —— 多特征孔（沉头=通孔+沉台 2 个 cut）阵列时，prevBefore 要退到整孔【第一个 cut 之前】，
    // removed=runStart.cut(afterRun) 先包含全部子 cut。单 cut 孔退化成原行为（runStart=该 cut 之前，逐字节一致）。
    const _fIsCut = (f.type === 'extrude' && (f as any).operation === 'cut')
    if (_fIsCut) { if (!_cutRunStart && shape) _cutRunStart = shape.clone() } else _cutRunStart = null
    // 审计修复：pathpattern 漏咗 → 切除后接路径阵列时 snapBefore=null → 切除分支命中唔到 → 误落加料 fuse 整副本填埋原孔。
    const snapBefore = (_next && (_next.type === 'cpattern' || _next.type === 'pattern' || _next.type === 'pathpattern') && shape)
      ? ((_fIsCut && _cutRunStart) ? _cutRunStart : shape.clone()) : null
    const _cpT = cpTargets.has(f.id)  // T757：環形阵列目标 — 执行前快照
    const _cpB = _cpT && shape ? shape.clone() : null
    const _shapeBefore = shape  // S107 逐特征隔离：dispatch 前快照，坏特征回滚（hole/boolean 可能改到一半先 throw）
    const _parkedBefore = parkedBodies.slice()  // S110：parked 亦要原子回滚（newbody push 后才 throw 唔会污染后续）
    try {
      const f = (() => {
        let candidate = features[_i]
      if ((candidate.type === 'extrude' || candidate.type === 'sketch' || candidate.type === 'revolve') && candidate.sketchFaceBinding) {
        const binding = candidate.sketchFaceBinding
        const sourceIndex = features.findIndex(x=>x.id===binding.sourceId)
        if (sourceIndex < 0 || sourceIndex >= _i || failedFeatures.some(x=>x.id===binding.sourceId)) throw new Error('草图来源面失效：来源时间轴特征不存在或顺序无效')
        const resolved = resolveSketchFace(_shapeHistory[sourceIndex],binding)
        resolvedSketchFaces[candidate.id] = resolved
        const d = resolved.delta
        candidate = shiftBoundSketchFeature(candidate,d)
      }
        return candidate
      })()


    if (f.type === 'extrude') {
      if (f.arbPlane) {
        // Sketch on an arbitrary flat face/plane (origin o, xDir xd, normal n — all CAD coords).
        // Build the profile ON that plane and extrude along its normal. The UI uses the SAME basis,
        // so the drawn sketch and the resulting solid coincide. (Additive path — cardinal planes untouched.)
        const ap = f.arbPlane
        const pl = new RPlane(ap.o as any, ap.xd as any, ap.n as any)
        const sk2 = profileOnPlane(f.profile, pl)
        // Arbitrary-plane To Object keeps the same associative contract as the
        // cardinal-plane path below: resolve the selected parallel target on
        // every rebuild, rather than replaying only the first measured height.
        let effHeight = f.height, effDown = f.down
        const tf = f.toFace
        if (tf && shape) {
          try {
            try { shape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }) } catch { /* triangulate for face lookup */ }
            let near = tf.near
            _lastResolvedFaceFp = null
            if (tf.faceFp?.length) { const sel = _ffSelectPts(shape, tf.faceFp, [tf.near], tf.faceFpV2, tf.faceFpTopo); if (sel?.length) near = sel[0] }
            else { const cap = _ffCapture(shape, [tf.near]); _lastResolvedFaceFp = cap.v1; _lastResolvedFaceFpV2 = cap.v2; _lastResolvedFaceFpTopo = cap.topo }
            const nl = Math.hypot(ap.n[0], ap.n[1], ap.n[2]) || 1
            const nn: [number, number, number] = [ap.n[0] / nl, ap.n[1] / nl, ap.n[2] / nl]
            const oldPc = (near[0] - ap.o[0]) * nn[0] + (near[1] - ap.o[1]) * nn[1] + (near[2] - ap.o[2]) * nn[2]
            const inPlane: [number, number, number] = [near[0] - nn[0] * oldPc, near[1] - nn[1] * oldPc, near[2] - nn[2] * oldPc]
            let bestPc: number | null = null, bestAxisDelta = Infinity
            for (const fc of (shape as any).faces as any[]) {
              const tri = fc.triangulation ? fc.triangulation() : null
              if (!tri?.vertices?.length || !tri?.trianglesIndexes?.length) continue
              const V = tri.vertices as number[], T = tri.trianglesIndexes as number[]
              const a0 = T[0] * 3, b0 = T[1] * 3, c0 = T[2] * 3
              const ux = V[b0] - V[a0], uy = V[b0 + 1] - V[a0 + 1], uz = V[b0 + 2] - V[a0 + 2]
              const vx = V[c0] - V[a0], vy = V[c0 + 1] - V[a0 + 1], vz = V[c0 + 2] - V[a0 + 2]
              const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx
              const fl = Math.hypot(fx, fy, fz) || 1
              if (Math.abs((fx * nn[0] + fy * nn[1] + fz * nn[2]) / fl) < 0.985) continue
              const pc = (V[a0] - ap.o[0]) * nn[0] + (V[a0 + 1] - ap.o[1]) * nn[1] + (V[a0 + 2] - ap.o[2]) * nn[2]
              const probe: [number, number, number] = [inPlane[0] + nn[0] * pc, inPlane[1] + nn[1] * pc, inPlane[2] + nn[2] * pc]
              let dmin = Infinity
              for (let i = 0; i < T.length; i += 3) { const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3; const d2 = ptTriDist2(probe[0], probe[1], probe[2], V[a], V[a + 1], V[a + 2], V[b], V[b + 1], V[b + 2], V[c], V[c + 1], V[c + 2]); if (d2 < dmin) dmin = d2 }
              const axisDelta = Math.abs(pc - oldPc)
              if (dmin < 1 && axisDelta < bestAxisDelta) { bestAxisDelta = axisDelta; bestPc = pc }
            }
            if (bestPc != null) {
              const d = bestPc + (tf.offset || 0)
              if (Math.abs(d) >= 0.1) { effHeight = Math.abs(d); effDown = ((f.operation === 'cut' ? -1 : 1) * d) < 0 }
              else buildWarnings.push('到面拉伸：目标面（含偏移）同草图面重合 — 已用上次已知高度')
            } else buildWarnings.push('到面拉伸：揾唔到同任意草图面平行嘅目标面 — 已用上次已知高度')
            if (_lastResolvedFaceFp?.length) { _resolvedFaceFp[f.id] = _lastResolvedFaceFp; _lastResolvedFaceFp = null }
            if (_lastResolvedFaceFpV2?.length) { _resolvedFaceFpV2[f.id] = _lastResolvedFaceFpV2; _lastResolvedFaceFpV2 = null }
            if (_lastResolvedFaceFpTopo?.length) { _resolvedFaceFpTopo[f.id] = _lastResolvedFaceFpTopo; _lastResolvedFaceFpTopo = null }
          } catch (e) { buildWarnings.push('任意面到面拉伸解析失败：' + ((e as any)?.message || e) + ' — 已用上次已知高度') }
        }
        const h = f.operation === 'cut' && !f.exactDistance ? effHeight + 1 : effHeight
        // GM-W1 1.3：尊重 f.down（⇅ 反向）— 旧版方向硬编 cut→−n / add→+n，斜面/角度面草图撳反向完全无效
        //（预览有跟、内核唔跟 → 静默切空）。byte-compat：旧特征 down=undefined → dir=1 → 几何逐字节不变。
        const dirA = effDown ? -1 : 1
        const solid = sk2.extrude((f.operation === 'cut' ? -h : h) * dirA)  // cut → into material (−normal); add → out (+normal)；down 反转
        if (!shape) shape = solid
        else if (f.operation === 'cut') { _recordBool(_i, 'cut', solid); shape = shape.cut(solid) }   // GM-γ2a：斜面拉伸切除亦录工具体供 S2
        else if (f.operation === 'intersect') { _recordBool(_i, 'intersect', solid); shape = shape.intersect(solid) }
        else if (f.operation === 'newbody') parkedBodies.push({ name: `实体${parkedBodies.length + 1}`, shape: solid })   // P2 New Body（斜面拉伸同样支持）
        else { _recordBool(_i, 'fuse', solid); shape = shape.fuse(solid) }
        if (_cpT) cpSnap[f.id] = { before: _cpB, after: shape ? shape.clone() : null, cutTool: _boolKindAt[_i] === 'cut' ? _boolToolAt[_i]?.clone() : undefined }
        prevBefore = snapBefore; prevWasCut = f.operation === 'cut'
        rcRecord(_i)
        recordHistory(_i)   // S1：arbPlane extrude 早 continue 分支亦录 shape 历史（index-keyed 对齐）
        continue
      }
      const plane: Plane = f.plane ?? 'XY'
      const n = PLANE_N[plane]
      const sk = profileToSketch(f.profile, 0, plane)
      const base = f.baseZ ?? 0
      // ── P2：到面拉伸【关联引用】（Fusion To Object）──
      // toFace 存目标面拾取点 + 持久面指纹（faceFp 慣例同 pushpull）：每次重建喺【当前累积 shape】
      // 重新解析目标面 → 由面嘅实际位置重算 height/down（+offset）。解析失败（面被上游改动食咗/转向）
      // → 诚实警告 + 退回 f.height/f.down（上次已知值）。toFace 缺失（旧档/普通距离拉伸）→ 逐字节旧行为。
      let effHeight = f.height, effDown = f.down
      const tf = f.toFace
      if (tf && shape && !f.through && !f.inward && !f.symmetric) {
        try {
          try { shape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }) } catch { /* triangulate for face lookup */ }
          let near = tf.near
          _lastResolvedFaceFp = null
          if (tf.faceFp && tf.faceFp.length) { const sel = _ffSelectPts(shape, tf.faceFp, [tf.near], tf.faceFpV2, tf.faceFpTopo); if (sel && sel.length) near = sel[0] }   // fp 命中（面冇动/净 renumber）→ 用解析点
          else { const _c = _ffCapture(shape, [tf.near]); _lastResolvedFaceFp = _c.v1; _lastResolvedFaceFpV2 = _c.v2; _lastResolvedFaceFpTopo = _c.topo }
          // 【沿草图法向射线扫描】— 指纹会因面移动而 miss（fp 含几何），近点扫描又会搵错（旧点已埋入料内）。
          // 主流情形系「上游改参数 → 目标面沿法向移」：in-plane footprint 唔郁。所以：只睇同轴平行嘅面、
          // in-plane 距离 <1mm（footprint 命中）、轴向揀离旧位置最近嗰个 = 移动后嘅同一个面。
          const axisIdx = plane === 'XY' ? 2 : plane === 'XZ' ? 1 : 0
          const faces = (shape as any).faces as any[]
          let bestPc: number | null = null, bestAxD = Infinity
          for (const fc of faces) {
            const tri = fc.triangulation ? fc.triangulation() : null
            if (!tri || !tri.vertices || !tri.vertices.length) continue
            const V = tri.vertices as number[], T = tri.trianglesIndexes as number[]
            if (!T.length) continue
            // 面法向（首三角）要同草图法向平行 — 转咗向嘅面唔要（唔好静默拉到斜面）
            const a0 = T[0] * 3, b0 = T[1] * 3, c0 = T[2] * 3
            const ux = V[b0] - V[a0], uy = V[b0 + 1] - V[a0 + 1], uz = V[b0 + 2] - V[a0 + 2]
            const vx = V[c0] - V[a0], vy = V[c0 + 1] - V[a0 + 1], vz = V[c0 + 2] - V[a0 + 2]
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
            const nl = Math.hypot(nx, ny, nz) || 1
            const nAx = axisIdx === 2 ? nz : axisIdx === 1 ? ny : nx
            if (Math.abs(nAx) / nl < 0.985) continue
            const pc = V[a0 + axisIdx]                        // 平行面 → 轴向坐标恒定，取首顶点
            const near2: [number, number, number] = [near[0], near[1], near[2]]; near2[axisIdx] = pc
            let dmin = Infinity
            for (let i = 0; i < T.length; i += 3) {
              const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3
              const d = ptTriDist2(near2[0], near2[1], near2[2], V[a], V[a + 1], V[a + 2], V[b], V[b + 1], V[b + 2], V[c], V[c + 1], V[c + 2])
              if (d < dmin) dmin = d
            }
            const axD = Math.abs(pc - near[axisIdx])
            if (dmin < 1 && axD < bestAxD) { bestAxD = axD; bestPc = pc }
          }
          if (bestPc != null) {
            const tOff = bestPc + (tf.offset || 0)
            const d = tOff - base
            if (Math.abs(d) >= 0.1) { effHeight = Math.abs(d); effDown = (RES_SIGN[plane] * d) < 0 }
            else buildWarnings.push('到面拉伸：目标面（含偏移）同草图面重合 — 已用上次已知高度')
          } else buildWarnings.push('到面拉伸：揾唔到目标面（可能被上游特征食咗/删走/转向）— 已用上次已知高度')
          { const _cap = _lastResolvedFaceFp; if (_cap && _cap.length) { _resolvedFaceFp[f.id] = _cap; _lastResolvedFaceFp = null } }
          { const _capV2 = _lastResolvedFaceFpV2; if (_capV2 && _capV2.length) { _resolvedFaceFpV2[f.id] = _capV2; _lastResolvedFaceFpV2 = null } }
          { const _capTopo = _lastResolvedFaceFpTopo; if (_capTopo && _capTopo.length) { _resolvedFaceFpTopo[f.id] = _capTopo; _lastResolvedFaceFpTopo = null } }
        } catch (e) { buildWarnings.push('到面拉伸解析失败：' + ((e as any)?.message || e) + ' — 已用上次已知高度') }
      }
      if (f.operation === 'cut' && f.through) {
        // "Through-all" cut (used by face sketches): a huge prism centred on the sketch
        // plane, cut from the body — slices all the way through regardless of direction.
        const BIG = 4000
        const o = base - (RES_SIGN[plane] * BIG) / 2
        const tool = sk.extrude(BIG).translate(n[0] * o, n[1] * o, n[2] * o)
        if (shape) { _recordBool(_i, 'cut', tool); shape = shape.cut(tool) }   // GM-γ2b：贯穿孔切除亦录工具体供 S2（「孔 cut」补位）
      } else if (f.operation === 'cut' && f.inward) {
        // Blind pocket from a model face: cut `inwardDepth` into the material (−face-normal),
        // with a 0.5mm overshoot just past the face for a clean slice. faceOutSign = which way
        // the face points along PLANE_N (+1/−1); the tool spans [min,max] of the two ends.
        const depth = f.inwardDepth ?? f.height
        const sgn = (f.faceOutSign ?? 1) * (f.down ? -1 : 1) // `down` flips the cut to the other side of the face
        const len = depth + 0.5
        const E = len * RES_SIGN[plane]                 // extrude so |span| = len regardless of plane sign
        const a = base + 0.5 * sgn, b = base - depth * sgn
        const T = Math.min(a, b)
        const tool = sk.extrude(E).translate(n[0] * T, n[1] * T, n[2] * T)
        if (shape) { _recordBool(_i, 'cut', tool); shape = shape.cut(tool) }   // GM-γ2b：面盲袋切除亦录工具体供 S2
      } else {
        // Cuts extrude a bit below their base plane so they slice cleanly through.
        const h = f.operation === 'cut' && !f.exactDistance ? effHeight + 1 : effHeight   // P2：effHeight/effDown = toFace 实时解析值（无 toFace 时 === f.height/f.down 逐字节）
        // Direction: `down` flips the extrude to the opposite side of the sketch plane (reverse button /
        // negative distance). Symmetric is centred either way, so it ignores the flip.
        const dn = (effDown && !f.symmetric) ? -1 : 1
        const eh = h * dn
        let solid: any
        const draftDeg = f.draft || 0
        if (Math.abs(draftDeg) > 0.01 && !f.twist) {
          // Draft (taper): loft from the base profile to an inward/outward-offset copy at the far end.
          // delta>0 (positive draft) ⇒ the section shrinks toward the far end (mould draft). Convex profiles
          // are robust; if the offset self-intersects (concave/too steep) fall back to a straight extrude.
          try {
            const dr = profileToDrawing(f.profile)
            const delta = h * Math.tan((draftDeg * Math.PI) / 180)
            const topDr = dr.offset(-delta, { lineJoinType: 'miter' })  // miter = keep sharp corners (frustum, not rounded)
            if (f.arbPlane) {
              const ap = f.arbPlane
              const nl = Math.hypot(ap.n[0], ap.n[1], ap.n[2]) || 1
              const topO: [number, number, number] = [ap.o[0] + ap.n[0] / nl * eh, ap.o[1] + ap.n[1] / nl * eh, ap.o[2] + ap.n[2] / nl * eh]
              solid = dr.sketchOnPlane(new RPlane(ap.o as any, ap.xd as any, ap.n as any)).loftWith(topDr.sketchOnPlane(new RPlane(topO as any, ap.xd as any, ap.n as any)), { ruled: true })
            } else {
              const planeOffset = f.baseZ || 0
              solid = dr.sketchOnPlane(plane, planeOffset).loftWith(topDr.sketchOnPlane(plane, planeOffset + eh), { ruled: true })
            }
          } catch {
            buildWarnings.push(`拔模 ${draftDeg}° 失败（轮廓偏移自相交/太陡）— 已改为直拉伸`)
            solid = sk.extrude(eh)
          }
        } else {
          // #57 GM-L2：扭转同拔模互斥（拔模行 loft 偏移路径、扭转行 sk.extrude twistAngle）—— 两者同设时拔模会被静默吞，诚实提示只应用扭转
          if (f.twist && Math.abs(draftDeg) > 0.01) buildWarnings.push('扭转与拔模不可同时使用，已只应用扭转')
          solid = f.twist ? sk.extrude(eh, { twistAngle: f.twist }) : sk.extrude(eh)
        }
        // Symmetric: center the extrusion on the sketch plane (span -h/2 .. +h/2).
        // Cut overshoots 0.5 BEHIND the base along the actual travel direction. 实战 T744 截到：旧式用 dn
        // 冇计 RES_SIGN（XZ 面 extrude(+) 走 −Y）→ XZ+反向 嘅盲切 overshoot 摆错边，留 0.5mm 皮切唔穿。
        const trav = (RES_SIGN[plane] * Math.sign(eh)) || 1   // 工具实际行进方向（沿 n 嘅正负）
        let off = f.operation === 'cut' && !f.exactDistance ? base - 0.5 * trav : base
        if (f.symmetric) off -= RES_SIGN[plane] * f.height / 2   // 居中要沿实际行进方向（XZ 面 RES_SIGN=−1，旧版恒减 h/2 → 整段偏到一边、同草图唔对位）
        if (off !== 0) solid = solid.translate(n[0] * off, n[1] * off, n[2] * off)
        if (!shape) shape = solid
        else if (f.operation === 'cut') { _recordBool(_i, 'cut', solid); shape = shape.cut(solid) }   // GM-γ2a：录工具体（含 overshoot）供 S2 backward 重跑 — repro #2「附近开槽」正正行呢条
        else if (f.operation === 'intersect') { _recordBool(_i, 'intersect', solid); shape = shape.intersect(solid) }
        else if (f.operation === 'newbody') parkedBodies.push({ name: `实体${parkedBodies.length + 1}`, shape: solid })   // P2 New Body
        else { _recordBool(_i, 'fuse', solid); shape = fuseRobust(shape, solid, n) }  // 共面 fuse 兜底（实战 T744：内底凸台经典失败位）
      }
    } else if (f.type === 'revolve') {
      // Revolve around the chosen world axis (Y default, or X), or T781: an arbitrary axis（axisV 方向 +
      // axisOrigin 轴上一点 — 构造轴/草图线/偏离原点车削）。profile must sit on one side of the axis.
      const ang = f.angle ?? 360
      // Keep a Revolve profile in the sketch frame it was authored on.  Flattening XZ/YZ
      // or arbitrary planar-face profiles to XY produces a plausible but wrong solid.
      // Named XZ offsets run along -Y; bound baseZ records the actual CAD Y coordinate.
      // Keep unbound legacy files on their historical offset convention.
      const sk = f.arbPlane
        ? profileOnPlane(f.profile, new RPlane(f.arbPlane.o as any, f.arbPlane.xd as any, f.arbPlane.n as any))
        : f.sketchFaceBinding && f.plane === 'XZ'
          ? profileToSketch(f.profile, -(f.baseZ ?? 0), 'XZ')
          : profileToSketch(f.profile, f.baseZ ?? 0, f.plane ?? 'XY')
      let rax: [number, number, number] = f.axis === 'X' ? [1, 0, 0] : [0, 1, 0]
      if (f.axisV) {
        const al = Math.hypot(f.axisV[0], f.axisV[1], f.axisV[2])
        if (al < 1e-9) { buildWarnings.push('旋转：轴方向为零向量 — 已用世界 Y 轴') }
        else rax = [f.axisV[0] / al, f.axisV[1] / al, f.axisV[2] / al]
      }
      const rcfg: Record<string, unknown> = {}
      if (ang > 0 && ang < 360) rcfg.angle = ang
      else if (!(ang > 0)) buildWarnings.push('旋转：角度必须 > 0（值 ' + ang + '° 非法,可能参数驱动绕过 UI 下限）— 已用整圈 360°')   // 0/负角 → revolve 出退化几何;退回整圈
      if (f.axisOrigin) rcfg.origin = f.axisOrigin
      let solid: any = Object.keys(rcfg).length ? (sk as any).revolve(rax, rcfg) : sk.revolve(rax)
      // S191 两侧/对称：单向旋转体绕轴回转 −ang/2，令角度范围对称跨越截面平面（Fusion symmetric revolve）。
      // 仅对部分角(0<ang<360)有意义；整圈对称＝原样。轴点用 axisOrigin（偏心车削也对）。
      if (f.symmetric && ang > 0 && ang < 360) {
        const org = (f.axisOrigin || [0, 0, 0]) as [number, number, number]
        try { solid = solid.rotate(-ang / 2, org, rax) } catch (e) { buildWarnings.push('对称旋转回转失败（' + ((e as Error)?.message || e) + '）— 已用单向') }
      }
      // wall>0 → hollow the revolved solid into a thin curved shell (灯罩/漏斗/碗壳/导流罩). Open the face on
      // the rotation-axis "top" (Y-revolve → XZ plane at maxY; X-revolve → YZ at maxX), like the shell feature.
      // Retry thinner + fall back to the solid (honest note) if OCCT can't shell this shape.
      if (f.wall && f.wall > 0 && f.axisV) {
        buildWarnings.push('旋转薄壁暂只支持世界 X/Y 轴（开面方位假设）— 任意轴已出实心体')
      } else if (f.wall && f.wall > 0) {
        const bb = solid.boundingBox.bounds as [number[], number[]]
        const cands = f.axis === 'X'
          ? [(ff: any) => ff.inPlane('YZ', bb[1][0]), (ff: any) => ff.inPlane('YZ', bb[0][0])]
          : [(ff: any) => ff.inPlane('XZ', bb[1][1]), (ff: any) => ff.inPlane('XZ', bb[0][1])]
        let shelled: any = null
        for (const t of [f.wall, f.wall * 0.6, f.wall * 0.35]) {
          for (const fn of cands) { try { shelled = solid.shell(t, fn); break } catch { /* next face */ } }
          if (shelled) { if (t !== f.wall) buildWarnings.push(`旋转薄壁 ${f.wall} 太厚，已减薄到 ${t.toFixed(1)} 才成功`); break }
        }
        if (shelled) solid = shelled
        else buildWarnings.push(`⚠ 旋转薄壁 ${f.wall}mm 失败，已退回实体（试减薄壁厚或让截面贴轴）`)
      }
      // Operation (Fusion): new/join → fuse, cut → lathe a groove/recess, intersect → common volume.
      if (!shape) shape = solid
      else if (f.op === 'cut') { _recordBool(_i, 'cut', solid); shape = shape.cut(solid) }   // GM-γ2b：车削布尔亦录工具体供 S2
      else if (f.op === 'intersect') { _recordBool(_i, 'intersect', solid); shape = shape.intersect(solid) }
      else if (f.op === 'newbody') parkedBodies.push({ name: `实体${parkedBodies.length + 1}`, shape: solid })   // P2 New Body
      else { _recordBool(_i, 'fuse', solid); shape = shape.fuse(solid) }
    } else if (f.type === 'stepbody') {
      // STEP B-rep 导入（T729）：预解析缓存攞 shape，clone 落树（缓存母本唔俾布尔消耗）
      const sh = stepCache.get(stepCacheKey(f))
      if (!sh) buildWarnings.push('⚠ STEP 实体解析失败/未就绪 — 已跳过（检查文件系咪有效 STEP）')
      else merge(sh.clone(), f.op)
    } else if (f.type === 'newbody') {
      // 泊车当前活动实体 → 开新实体（之后嘅特征全部作用喺新实体；泊车实体喺视口灰显）
      if (!shape) buildWarnings.push('⚠ 新实体：当前冇活动实体可泊车 — 已忽略（先起一个实体）')
      else { parkedBodies.push({ name: f.name || `实体${parkedBodies.length + 1}`, shape }); shape = null }
    } else if (f.type === 'bodyboolean') {
      // 活动实体 ⊗ 泊车实体（真 B-rep 布尔 — 结果仲可以圆角/抽壳/导 STEP，对比 T723 网格级组件布尔）
      const t = parkedBodies[f.target]
      if (!shape) throw new Error('实体布尔：没有活动实体')
      else if (!t) throw new Error(`实体布尔：工具实体 #${f.target + 1} 不存在或已被前一步消耗；请重新选择工具体`)
      else {
        try {
          // GM-γ2b：实体布尔（活动体 ⊗ 泊车体）录工具体供 S2 追踪。common → intersect（同款 BRepAlgoAPI_Common）。
          const bKind = f.bop === 'cut' ? 'cut' : f.bop === 'common' ? 'intersect' : 'fuse'
          _recordBool(_i, bKind, t.shape)
          shape = f.bop === 'cut' ? shape.clone().cut(t.shape.clone()) : f.bop === 'common' ? shape.clone().intersect(t.shape.clone()) : shape.clone().fuse(t.shape.clone())
          if (!f.keep) parkedBodies.splice(f.target, 1)   // S185 Keep Tools：keep 时工具体保留做泊车体（可复用）；缺省=消耗（旧档逐字节回放）
        } catch (e) { throw new Error(`实体布尔失败：${(e as Error)?.message || e}`) }
      }
    } else if (f.type === 'boundaryfill') {
      // 两个封闭 solid 的 Boundary Fill：用独立 clone 构建 3 个互斥 cell。切勿复用布尔 operand，OCCT/replicad
      // 可能会消费底层 shape；split 分支同样采用 clone 以保持可重放。
      const t = parkedBodies[f.target]
      if (!shape) buildWarnings.push('⚠ Boundary Fill：冇活动实体 — 已忽略')
      else if (!t) buildWarnings.push(`⚠ Boundary Fill：揾唔到工具实体 #${f.target + 1} — 已忽略`)
      else {
        try {
          const source = shape
          const tool = t.shape
          const cells: { key: 'target' | 'overlap' | 'tool'; name: string; shape: any }[] = [
            { key: 'target', name: 'Boundary Fill：目标独有', shape: source.clone().cut(tool.clone()) },
            { key: 'overlap', name: 'Boundary Fill：交集', shape: source.clone().intersect(tool.clone()) },
            { key: 'tool', name: 'Boundary Fill：工具独有', shape: tool.clone().cut(source.clone()) },
          ]
          const valid = cells.filter((c) => c.shape && !c.shape.wrapped?.IsNull?.())
          const selected = valid.find((c) => c.key === f.cell)
          if (!selected) {
            buildWarnings.push(`⚠ Boundary Fill：所选 ${f.cell === 'target' ? '目标独有' : f.cell === 'overlap' ? '交集' : '工具独有'} cell 不存在（两体未形成该体积）— 已保留原实体`)
          } else {
            // 工具体被其分割后的 cells 取代；其他既有泊车体不受影响。
            parkedBodies.splice(f.target, 1)
            shape = selected.shape
            for (const c of valid) if (c !== selected) parkedBodies.push({ name: c.name, shape: c.shape })
          }
        } catch (e) { buildWarnings.push(`⚠ Boundary Fill 失败（${(e as Error)?.message || e}）— 已保留原实体`) }
      }
    } else if (f.type === 'fillet' && shape) {
      _lastResolvedFp = null; _lastResolvedFpV2 = null   // S122/S134：解析器首次解析会写低 v1+v2 指纹（feature 未有 edgeFp 时）
      if (f.fullRound) {
        shape = _fullRoundFillet(shape, f.fullRound)
      } else if (f.asymmetric) {
        if (!f.nears?.length) throw new Error('不对称圆角：请至少选择一条边')
        shape = asymmetricFilletNearPoints(shape, f.nears, f.radii ?? f.radius, f.asymmetric.offset2, !!f.asymmetric.flip)
      } else if (f.rule) {
        const mids = _ruleFilletMids(shape, f.rule)
        if (!mids.length) throw new Error(f.rule.mode === 'between' ? 'Rule Fillet：两组面之间冇共同边' : 'Rule Fillet：所选面冇可倒圆边界')
        shape = roundNearPoints(shape, 'fillet', f.radius, mids, f.radius2, f.chain, undefined, undefined, undefined, f.mode, f.chord, f.setbackRatio, f.continuity)
      } else shape = (f.nears && f.nears.length) ? roundNearPoints(shape, 'fillet', f.radius, f.nears, f.radius2, f.chain, f.edgeFp, f.edgeFpV2, f.radii, f.mode, f.chord, f.setbackRatio, f.continuity, f.continuities)
        : f.near ? roundNearPoint(shape, 'fillet', f.radius, f.near, f.edgeFp, f.edgeFpV2) : roundEdges(shape, 'fillet', f.radius, f.edges)
      { const _cap = _lastResolvedFp as string[] | null; if (_cap && _cap.length) { _resolvedEdgeFp[f.id] = _cap; const _v2 = _lastResolvedFpV2 as string[] | null; if (_v2 && _v2.length) _resolvedEdgeFpV2[f.id] = _v2; _lastResolvedFp = null; _lastResolvedFpV2 = null } }
    } else if (f.type === 'chamfer' && shape) {
      _lastResolvedFp = null; _lastResolvedFpV2 = null
      const asym = (f.cmode === 'two' || f.cmode === 'angle') && f.nears && f.nears.length
      if (asym) {
        const bb = shape.boundingBox.bounds
        const refZ = f.flip ? bb[0][2] : bb[1][2]  // 退回参考：top face by default; flip → bottom face
        const second = f.cmode === 'angle' ? (f.angle ?? 45) : (f.dist2 ?? f.distance)
        shape = chamferAsym(shape, f.distance, second, f.cmode as 'two' | 'angle', f.nears!, refZ, !!f.flip, f.refFaceNear, f.edgeFp, f.edgeFpV2)   // Distance+Angle 用持久参考面；flip 揀同边另一相邻面
      } else {
        // GM-3DV3 M7：equal 模式逐边距离（distances 与 nears 平行）→ 走 roundNearPoints 分组 scalar 路径（第 9 参 radii 复用）
        shape = (f.nears && f.nears.length) ? roundNearPoints(shape, 'chamfer', f.distance, f.nears, undefined, f.chain, f.edgeFp, f.edgeFpV2, f.distances)
          : f.near ? roundNearPoint(shape, 'chamfer', f.distance, f.near, f.edgeFp, f.edgeFpV2) : roundEdges(shape, 'chamfer', f.distance, f.edges)
      }
      { const _cap = _lastResolvedFp as string[] | null; if (_cap && _cap.length) { _resolvedEdgeFp[f.id] = _cap; const _v2 = _lastResolvedFpV2 as string[] | null; if (_v2 && _v2.length) _resolvedEdgeFpV2[f.id] = _v2; _lastResolvedFp = null; _lastResolvedFpV2 = null } }
    } else if (f.type === 'facefillet' && shape) {
      let n1 = f.near1, n2 = f.near2
      if (f.faceFp?.length === 2) {
        const resolved = _ffSelectPts(shape, f.faceFp, [f.near1, f.near2], f.faceFpV2, f.faceFpTopo)
        if (resolved?.length === 2) { n1 = resolved[0]; n2 = resolved[1] }
        else buildWarnings.push('面圆角：面指纹无法唯一解析，已退回原拾面点')
      }
      shape = faceFillet(shape, f.radius, n1, n2)
    } else if (f.type === 'shell' && shape) {
      const shellFeatureIndex = features.findIndex((feature) => feature.id === f.id)
      const followsUnsafeLoft = shellFeatureIndex > 0 && hasUnsafeLoftShellAdjacency(features[shellFeatureIndex - 1])
      if (followsUnsafeLoft) {
        // A synchronous OCCT shell call cannot be cancelled from this worker.
        // Keep the predecessor solid intact rather than freezing the CAD UI.
        buildWarnings.push('⚠ 抽壳：紧接变截面／导轨／连续性放样的通用 Shell 可能令核心长时间无响应，已安全跳过。请在「放样」对话框直接设定薄壁，或改为不变截面放样后再抽壳。')
      } else {
      // Fusion-style: open the user-picked face(s) (nears). Fallback to the top face if none picked.
      // S125 持久面命名：faceFp 存在 → 用指纹喺当前面集揾返同一几何面嘅代表点（全中→跟；任何 miss/撞→保留 ns0 = 今日行为）；
      // 否则首次捕获面指纹供 store 写回。无 faceFp 时 ns=ns0 → 下面 finder/shell 完全不变（字节一致）。
      const ns0 = f.nears
      let ns = ns0
      _lastResolvedFaceFp = null
      if (ns0 && ns0.length) {
        if (f.faceFp && f.faceFp.length) { const sel = _ffSelectPts(shape, f.faceFp, ns0, f.faceFpV2, f.faceFpTopo); if (sel && sel.length) ns = sel }   // S131：near-biased 消歧（ns0 = 原拾面 nears）；S136：带 faceFpV2 先试旋转不变
        else { const _c = _ffCapture(shape, ns0); _lastResolvedFaceFp = _c.v1; _lastResolvedFaceFpV2 = _c.v2; _lastResolvedFaceFpTopo = _c.topo }
      }
      // 默认开顶面：用【当前 shape 真 bbox 顶 Z】揾顶面 —— 旧版用 lastExtrudeHeight(features) 系 BUG：
      //   prim 方块无 extrude、或后续有「贯通孔」extrude（高度=贯通量 ≠ 箱顶），令 inPlane 揾错/揾唔到面 →
      //   shell 退化（型腔冇真挖空，几乎实心）→ 下游模流/质量当实心，用户「抽壳后唔 work」。
      //   改用 shape.boundingBox.bounds[1][2]（worker 其它面操作早已用此法，如 line 361/1353），robust 于任何特征史。
      let _shellTopZ: number
      try { _shellTopZ = shape.boundingBox.bounds[1][2] } catch { _shellTopZ = lastExtrudeHeight(features) }
      const finder = (ns && ns.length)
        ? (ns.length === 1 ? (ff: any) => ff.containsPoint(ns[0]) : (ff: any) => ff.either(ns.map((M) => (g: any) => g.containsPoint(M))))
        : (ff: any) => ff.inPlane('XY', _shellTopZ)
      // Preserve the requested thickness and direction; failed offsets must not change dimensions.
      // GM-3DV3 M2 壁厚方向 Direction（Inside/Outside/Both）—— 取代旧「负壁厚一律当非法」嘅 guard：
      //   inside（缺省）: shell(+t)，墙向内长、外形保留（旧行为逐字节）。
      //   outside: shell(−t)，墙向外长（replicad/OCCT 负厚度 = 向外壳；外尺寸 +t）。
      //   both: 先把实体外扩 t/2（MakeOffsetShape），再向内 shell(+t) → 墙跨越原边界（半内半外，Fusion Both 近似）。
      // 仍保留「thickness<=0 非法」守卫（参数驱动绕过 UI 下限喂 0/负 → 诚实跳过），方向由 direction 明示、唔靠符号。
      const _dir = f.direction || 'inside'
      const _sign = _dir === 'outside' ? -1 : 1
      let shelled: any = null
      if (f.thickness > 0) {
        const retry = [f.thickness]
        if (f.closed) {
          // Fusion Closed Body：零移除面先得到内缩/外扩实体，再以布林差集形成真正封闭空腔。
          // inside = 原体−内缩体；outside = 外扩体−原体；both = 外扩半厚−内缩半厚。
          for (const t of retry) {
            try {
              if (_dir === 'inside') shelled = shape.cut(_shellExactFaces(shape, t, []))
              else if (_dir === 'outside') shelled = _shellExactFaces(shape, -t, []).cut(shape)
              else shelled = _shellExactFaces(shape, -t / 2, []).cut(_shellExactFaces(shape, t / 2, []))
              break
            } catch { shelled = null }
          }
        } else {
          let _shellBase = shape
          if (_dir === 'both') {
            try {
              const r = GCWithScope()
              const mos: any = r(new (_oc as any).BRepOffsetAPI_MakeOffsetShape())
              mos.PerformByJoin(shape.wrapped, f.thickness / 2, 1e-3, (_oc as any).BRepOffset_Mode.BRepOffset_Skin, false, false, (_oc as any).GeomAbs_JoinType.GeomAbs_Intersection, false, r(new (_oc as any).Message_ProgressRange_1()))
              if (mos.IsDone && mos.IsDone()) { const off = r(mos.Shape()); if (off && !off.IsNull()) { _shellBase = cast(_orientSolidOutward(off)); try { _shellBase.mesh({ tolerance: 0.1, angularTolerance: 0.5 }) } catch { /* face resolve will retry */ } } else throw new Error('empty offset') }
              else throw new Error('offset failed')
            } catch { throw new Error('抽殼兩側外擴失敗，已保留原模型；請調整壁厚') }
          }
          let chainReported = false
          const openAttempt = (base: any, t: number, signed = _sign) => {
            if ((f.tangentChain || _dir === 'both') && ns?.length) {
              const seeds = _shellFaceIndicesNear(base, ns)
              const chain = f.tangentChain ? _shellTangentClosure(base, seeds) : seeds
              if (!chain.length) throw new Error('shell face resolution failed')
              if (!chainReported && chain.length > seeds.length) { buildWarnings.push(`抽壳切线链：由 ${seeds.length} 个所选面扩展到 ${chain.length} 个 G1 连续面`); chainReported = true }
              return _shellExactFaces(base, signed * t, chain)
            }
            return base.shell(signed * t, finder)
          }
          for (const t of retry) {
            try { shelled = openAttempt(_shellBase, t); break } catch { shelled = null }
          }

        }
      }
      if (shelled && !validShellSolid(shelled)) {
        const openings = ns?.length ? _shellFaceIndicesNear(shape, ns) : shape.faces.map((face: any, i: number) => ({face,i})).filter(({face}: any) => face.geomType === 'PLANE' && Math.abs(face.center.z-_shellTopZ)<1e-7).map(({i}: any) => i)
        if (_dir !== 'inside' || f.closed || openings.length !== 1) throw new Error('抽殼產生無效實體，已保留原模型；請調整開口或壁厚')
        shelled = prismaticInwardShell(shape, openings[0], f.thickness)
        buildWarnings.push('抽殼：相鄰內壁偏移相交，已按原壁厚重建直柱型腔')
      }
      if (shelled) shape = shelled
      else if (!(f.thickness > 0)) throw new Error(`抽壳：壁厚必须 > 0（值 ${f.thickness} 非法）`)   // t≤0 must fail (rollback) — never silently skip / keep illegal shell in history
      else throw new Error('抽殼無法按指定壁厚及方向完成，已保留原模型；請調整壁厚或開口面')
      { const _cap = _lastResolvedFaceFp as string[] | null; if (_cap && _cap.length) { _resolvedFaceFp[f.id] = _cap; _lastResolvedFaceFp = null } }
      { const _capV2 = _lastResolvedFaceFpV2 as string[] | null; if (_capV2 && _capV2.length) { _resolvedFaceFpV2[f.id] = _capV2; _lastResolvedFaceFpV2 = null } { const _capTopo = _lastResolvedFaceFpTopo as string[] | null; if (_capTopo && _capTopo.length) { _resolvedFaceFpTopo[f.id] = _capTopo; _lastResolvedFaceFpTopo = null } } }   // S136：v2 平行写回
      }
    } else if (f.type === 'pattern' && shape) {
      // Clamp all three axis counts the same way (≥1, integer) — a parameter expression can yield a
      // fractional/zero count, and an unguarded `i < 2.5` would silently make 3 copies (≠ countZ's rounding).
      const cx = Math.max(1, Math.round(f.countX ?? 1)), cy = Math.max(1, Math.round(f.countY ?? 1))
      const cz = Math.max(1, Math.round(f.countZ ?? 1)), dz = f.dz ?? 0
      // S 构造轴方向：dir1/dir2 = Direction-1/2 单位方向（构造轴 → 矩形阵列）。
      //   STRICT DEFAULT-TO-WORLD：两者皆缺省 ⇒ hasDir=false ⇒ 行下面【完全原样】嘅 (i*dx, j*dy, k*dz) 表达式 —
      //   逐字节回放旧档（replicad RC cache byte-fragile，绝不可改无 dir 时嘅算式）。仅当任一 dir 有值才走方向式。
      const _norm = (v: [number, number, number]): [number, number, number] => { const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L] }
      const hasDir = !!(f.dir1 || f.dir2)
      const u1 = f.dir1 ? _norm(f.dir1) : [1, 0, 0] as [number, number, number]
      const u2 = f.dir2 ? _norm(f.dir2) : [0, 1, 0] as [number, number, number]
      // #pattern（audit）：对称模式 —— 原件居中，副本向两边铺（Fusion Symmetric direction）。缺省单向（i:0..n−1）逐字节不变。
      //   symX/symY/symZ 各轴独立：sym ⇒ 有效索引 = i − (count−1)/2（居中）。
      //   【只对奇数计数套用】：偶数计数居中会令原件夹喺副本之间产生 count+1 个实例（语义歧义）→ 偶数退单向 + 诚实警告，杜绝错误输出。
      if ((f.symX && cx % 2 === 0) || (f.symY && cy % 2 === 0) || (f.symZ && cz % 2 === 0)) buildWarnings.push('⚠ 对称阵列：某轴数量为偶数 → 该轴已退回单向（对称居中需奇数数量，原件占中心）')
      const sX = (f.symX && cx % 2 === 1) ? (cx - 1) / 2 : 0, sY = (f.symY && cy % 2 === 1) ? (cy - 1) / 2 : 0, sZ = (f.symZ && cz % 2 === 1) ? (cz - 1) / 2 : 0
      const ei = (i: number) => i - sX, ej = (j: number) => j - sY, ek = (k: number) => k - sZ
      // 阵列平移量（i,j,k）：hasDir ⇒ i*dx 沿 u1 + j*dy 沿 u2（+k*dz 沿世界 Z）；否则原样世界轴算式（byte-identical 当无 sym）。
      const tr = (i0: number, j0: number, k0: number): [number, number, number] => { const i = ei(i0), j = ej(j0), k = ek(k0); return hasDir
        ? [i * f.dx * u1[0] + j * f.dy * u2[0], i * f.dx * u1[1] + j * f.dy * u2[1], k * dz + i * f.dx * u1[2] + j * f.dy * u2[2]]
        : [i * f.dx, j * f.dy, k * dz] }
      // 跳【原件所在位】：对称模式原件喺中心（有效索引 0）；非对称喺 (0,0,0)。非 sym 时 ei(i)=i ⇒ 同旧 (i===0&&j===0&&k===0) byte-identical。
      const atOrigin = (i: number, j: number, k: number) => Math.abs(ei(i)) < 1e-9 && Math.abs(ej(j)) < 1e-9 && Math.abs(ek(k)) < 1e-9
      // GM-3DV1 S3：逐实例抑制 — 线性索引 idx=(i*cy+j)*cz+k（seed(0,0,0)=idx 0）；suppress[idx]=true 跳过该副本。
      // Suppression index 0 is always the original seed, including symmetric patterns
      // where that seed sits in the middle of the grid rather than at (0,0,0).
      // Remaining copies keep deterministic row-major order with the seed removed.
      const seedGridIndex = ((sX * cy + sY) * cz + sZ)
      const suppressIndex = (i: number, j: number, k: number) => {
        const grid = (i * cy + j) * cz + k
        return grid === seedGridIndex ? 0 : grid < seedGridIndex ? grid + 1 : grid
      }
      const suppAt = (i: number, j: number, k: number) => !!f.suppress?.[suppressIndex(i, j, k)]
      if (f.objectType === 'faces') {
        const matrices: number[][] = []
        for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) for (let k = 0; k < cz; k++) {
          if (atOrigin(i, j, k) || suppAt(i, j, k)) continue
          const [tx, ty, tz] = tr(i, j, k)
          matrices.push([1, 0, 0, tx, 0, 1, 0, ty, 0, 0, 1, tz])
        }
        const copies = facePatternCopies(shape, f.nears ?? [], f.faceFp, f.faceFpV2, f.faceFpTopo, matrices)
        if (copies.length) {
          // Each disconnected copy must remain independently selectable: OCCT cannot
          // reliably thicken a compound of disjoint sheets in one operation.
          copies.forEach((copy, index) => parkedBodies.push({ name: `Face Pattern (surface) ${index + 1}`, shape: copy }))
          buildWarnings.push(`Face Pattern：已建立 ${copies.length} 個 B-rep 面副本（每張皆可獨立 Stitch / Thicken）`)
          const a = _lastResolvedFaceFp; if (a?.length) _resolvedFaceFp[f.id] = a
          const b = _lastResolvedFaceFpV2; if (b?.length) _resolvedFaceFpV2[f.id] = b
          const c = _lastResolvedFaceFpTopo; if (c?.length) _resolvedFaceFpTopo[f.id] = c
        } else buildWarnings.push('Face Pattern：未能解析所選面或沒有可建立的副本 — 已保持原實體')
      } else if (f.targets?.length) {
        // T781：特征级矩形阵列 — 净阵列所选特征嘅 delta（孔阵/凸台阵），唔郁实体其余部分
        const xforms: ((s: any) => any)[] = []
        for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) for (let k = 0; k < cz; k++) {
          if (atOrigin(i, j, k) || suppAt(i, j, k)) continue
          const [tx, ty, tz] = tr(i, j, k)
          xforms.push((s: any) => s.translate(tx, ty, tz))
        }
        // #70 GM-L2：矩形阵列兜底微沉方向 = 主间距方向（u1/u2/世界 Z），唔再写死世界 Z（非 Z 主导阵列共面失败先救得到）
        const _nudge: [number, number, number] = (cx > 1 && Math.abs(f.dx) > 1e-9) ? u1 : (cy > 1 && Math.abs(f.dy) > 1e-9) ? u2 : [0, 0, 1]
        applyTargetDeltas(f.targets, xforms, '矩形阵列', _nudge)
      } else if (prevBefore && prevWasCut) {
        // Pattern a HOLE across the grid: re-cut the removed region (fusing whole copies would fill holes).
        const removed = prevBefore.clone().cut(shape.clone())
        let acc = shape
        for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) for (let k = 0; k < cz; k++) {
          if (atOrigin(i, j, k) || suppAt(i, j, k)) continue
          const [tx, ty, tz] = tr(i, j, k)
          acc = acc.cut(removed.clone().translate(tx, ty, tz))
        }
        shape = acc
      } else {
        // Additive grid (bosses/tiles): fuse translated copies of the whole solid (unchanged).
        // 审计修复：退化间距守卫 —— 所有阵列方向步距=0 但 count>1 → 副本全重叠、几何零变化（假成功）。诚实警告。
        if ((cx > 1 || cy > 1 || cz > 1) && (cx <= 1 || f.dx === 0) && (cy <= 1 || f.dy === 0) && (cz <= 1 || dz === 0)) buildWarnings.push('⚠ 矩形阵列：阵列方向间距为 0，副本全部重叠（几何无变化）— 请设非零间距')
        const base = shape
        let acc = base
        for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) for (let k = 0; k < cz; k++) {
          if (atOrigin(i, j, k) || suppAt(i, j, k)) continue
          const [tx, ty, tz] = tr(i, j, k)
          acc = acc.fuse(base.clone().translate(tx, ty, tz))
        }
        shape = acc
      }
      // #7 Object Type=Bodies：连泊车体一齐阵列 —— 每个泊车体 fuse 自己嘅栅格副本（各自独立体，唔并入活动体）。
      if (f.bodies && parkedBodies.length && !f.targets?.length) {
        for (const pb of parkedBodies) {
          try {
            const pbase = pb.shape
            let pacc = pbase
            for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) for (let k = 0; k < cz; k++) {
              if (i === 0 && j === 0 && k === 0) continue
              const [tx, ty, tz] = tr(i, j, k)
              pacc = fuseRobust(pacc, pbase.clone().translate(tx, ty, tz))
            }
            pb.shape = pacc
          } catch (e) { buildWarnings.push(`⚠ 矩形阵列泊车体「${pb.name}」失败：` + ((e as any)?.message || e)) }
        }
      }
    } else if (f.type === 'geoPattern' && shape) {
      // Fusion-style Geometric Pattern V1.  Unlike rectangular/circular patterns,
      // each copy has an explicit rigid transform.  We deliberately reuse the
      // snapshot-delta path so cut features remain cuts rather than filling holes.
      if (!f.targets?.length) buildWarnings.push('Geometric Pattern：未选择时间轴特征 — 已跳过')
      else {
        const xforms = (f.instances || []).flatMap((inst, index) => {
          if (f.suppress?.[index]) return []
          const t = inst.translation ?? [0, 0, 0] as [number, number, number]
          const r = inst.rotation
          const hasMove = Math.hypot(t[0], t[1], t[2]) > 1e-8
          const axisLen = r ? Math.hypot(r.axis[0], r.axis[1], r.axis[2]) : 0
          const hasTurn = !!r && axisLen > 1e-8 && Math.abs(r.angle) > 1e-8
          if (!hasMove && !hasTurn) { buildWarnings.push(`Geometric Pattern：实例 ${index + 1} 变换为零，已跳过`); return [] }
          return [(s: any) => {
            let out = s
            if (hasTurn && r) out = out.rotate(r.angle, r.origin, [r.axis[0] / axisLen, r.axis[1] / axisLen, r.axis[2] / axisLen])
            return hasMove ? out.translate(t[0], t[1], t[2]) : out
          }]
        })
        if (xforms.length) applyTargetDeltas(f.targets, xforms, 'Geometric Pattern')
      }
    } else if (f.type === 'pathpattern' && shape) {
      // Pattern along a path: place `count` copies of the body at equal-arc-length points on the polyline.
      const pts3 = f.path3?.length ? resamplePath3(f.path3, Math.max(2, Math.round(f.count))) : null
      const pts = pts3 ?? resamplePath(f.path, Math.max(2, Math.round(f.count)))
      const ox = pts[0][0], oy = pts[0][1], oz = pts3?.[0]?.[2] ?? 0
      // Fusion's Direction = Path turns each copy from the seed tangent to the
      // local path tangent.  Use the outgoing segment at a sharp corner (the
      // incoming segment at the last point), avoiding an unstable averaged frame.
      const followPath = f.orient === 'path'
      const tangentAt = (i: number): [number, number, number] => {
        const a = pts[i < pts.length - 1 ? i : Math.max(0, i - 1)] as any
        const b = pts[i < pts.length - 1 ? i + 1 : i] as any
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = (pts3 ? b[2] - a[2] : 0)
        const L = Math.hypot(dx, dy, dz) || 1
        return [dx / L, dy / L, dz / L]
      }
      const t0 = tangentAt(0)
      const rotateFromSeedTangent = (s: any, i: number) => {
        if (!followPath) return s
        const t = tangentAt(i)
        const dot = Math.max(-1, Math.min(1, t0[0] * t[0] + t0[1] * t[1] + t0[2] * t[2]))
        let ax = t0[1] * t[2] - t0[2] * t[1], ay = t0[2] * t[0] - t0[0] * t[2], az = t0[0] * t[1] - t0[1] * t[0]
        let al = Math.hypot(ax, ay, az)
        if (al < 1e-9) {
          if (dot > 0.999999) return s
          const bx = Math.abs(t0[0]) < 0.9 ? 1 : 0, by = Math.abs(t0[0]) < 0.9 ? 0 : 1
          ax = t0[1] * 0 - t0[2] * by; ay = t0[2] * bx - t0[0] * 0; az = t0[0] * by - t0[1] * bx
          al = Math.hypot(ax, ay, az) || 1
        }
        return s.rotate(Math.atan2(al, dot) * 180 / Math.PI, [ox, oy, oz], [ax / al, ay / al, az / al])
      }
      const transformAt = (pt: any, i: number) => (s: any) => {
        const dz = pts3 ? (pt as [number, number, number])[2] - oz : 0
        const turned = rotateFromSeedTangent(s, i)
        return turned.translate(pt[0] - ox, pt[1] - oy, dz)
      }
      if (f.targets?.length) {
        // T781：特征级路径阵列 — 所选特征嘅 delta 沿路径等弧长复制
        const xforms = pts.slice(1).map((pt, i) => transformAt(pt, i + 1))
        // #70 GM-L2：路径阵列兜底微沉方向 = 路径总走向（首→尾），退化则世界 Z
        const _pend = pts[pts.length - 1], _pdx = _pend[0] - ox, _pdy = _pend[1] - oy, _pdz = pts3 ? (_pend as [number, number, number])[2] - oz : 0, _pl = Math.hypot(_pdx, _pdy, _pdz)
        const _nudge: [number, number, number] = _pl > 1e-9 ? [_pdx / _pl, _pdy / _pl, _pdz / _pl] : [0, 0, 1]
        applyTargetDeltas(f.targets, xforms, '路径阵列', _nudge)
      } else if (prevBefore && prevWasCut) {
        const removed = prevBefore.clone().cut(shape.clone())
        let acc = shape
        for (let i = 1; i < pts.length; i++) acc = acc.cut(transformAt(pts[i], i)(removed.clone()))
        shape = acc
      } else {
        const base = shape; let acc = base
        for (let i = 1; i < pts.length; i++) acc = acc.fuse(transformAt(pts[i], i)(base.clone()))
        shape = acc
      }
    } else if (f.type === 'automatedmodel') {
      const dx = f.b[0] - f.a[0], dy = f.b[1] - f.a[1], dz = f.b[2] - f.a[2]
      const len = Math.hypot(dx, dy, dz), r = Math.max(1e-3, f.radius)
      if (!(len > 1e-5)) buildWarnings.push('Automated Modeling：兩個連接面中心重合，未建立 connector')
      else {
        const connector = makeCylinder(r, len, f.a, [dx / len, dy / len, dz / len])
        merge(connector, f.op ?? 'newbody')
      }
    } else if (f.type === 'prim') {
      let solid: any
      if (f.shape === 'box') solid = makeBaseBox(f.a, f.b, f.c) // makeBaseBox is XY-centered & sits on ground (z∈[0,c]) already
      else if (f.shape === 'sphere') { const r = Math.max(0.1, f.a); solid = makeSphere(r).translate(0, 0, r) }   // bt3: 守 r≤0 退化球
      else if (f.shape === 'cone') {
        // Cone / frustum: revolve a (radius, height) profile about the Z axis. a=bottom radius, b=top radius, c=height.
        // Top radius 0 → pointed cone (triangle profile); >0 → truncated cone (trapezoid). Sits on the ground (z∈[0,c]).
        const Rb = f.a, Rt = f.b, H = f.c
        if (f.sides && f.sides >= 3) {
          // Polygonal base → pyramid (Rt≈0) or truncated pyramid/frustum (Rt>0). Loft an N-gon base to an N-gon
          // top (tiny top for a pointed pyramid). a=base circumradius, b=top circumradius, c=height, sides=N.
          const n = Math.min(24, Math.round(f.sides))
          const ngon = (R: number): [number, number][] => Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n + Math.PI / 2; return [R * Math.cos(a), R * Math.sin(a)] })
          const baseSk = profileToSketch({ kind: 'poly', pts: ngon(Math.max(1e-3, Rb)) }, 0) as any
          // #67 GM-L2：顶端半径唔再钳死 0.4mm 绝对平顶（小件肉眼可见微台/装配偏差）—— 改用相对底半径嘅细比例 max(Rb·1e-3, 1e-3)，令 Rt≈0 时接近真尖顶
          const topSk = profileToSketch({ kind: 'poly', pts: ngon(Math.max(Rt, Rb * 1e-3, 1e-3)) }, H) as any
          solid = baseSk.loftWith(topSk)
        } else {
          let pen = draw([0, 0]).lineTo([Math.max(1e-3, Rb), 0])
          if (Rt > 1e-3) pen = pen.lineTo([Rt, H])
          pen = pen.lineTo([0, H])
          solid = pen.close().sketchOnPlane('XZ').revolve([0, 0, 1])
        }
      }
      else if (f.shape === 'pie') {
        // Pie / circular sector prism (cam, index plate, partial disk): revolve a (radius × height) rectangle
        // about Z by `b` degrees. a=radius, b=sweep angle°, c=height. Sits on ground z∈[0,h].
        const r = Math.max(1e-3, f.a), ang = (f.b > 0 && f.b < 360) ? f.b : 360, h = Math.max(1e-3, f.c)   // bt3: 守 r/h≤0 退化截面 + 角 0/负/超360（参数驱动绕 UI）→ 退整圈
        const prof = draw([0, 0]).lineTo([r, 0]).lineTo([r, h]).lineTo([0, h]).close().sketchOnPlane('XZ') as any
        solid = ang >= 360 ? prof.revolve([0, 0, 1]) : prof.revolve([0, 0, 1], { angle: ang })
      }
      else if (f.shape === 'halfcyl') {
        // Half cylinder / D-profile (D-shaft, D-bore coupling, half-round): full cylinder minus the x<0 half.
        // a=radius, c=height. Flat face on the YZ plane (x=0), round bulge on +x; sits on ground z∈[0,c].
        const r = Math.max(1e-3, f.a), h = Math.max(1e-3, f.c)   // bt3: 守 r/h≤0 退化 D 形
        solid = (drawCircle(r).sketchOnPlane('XY').extrude(h) as any).cut(makeBaseBox(4 * r + 20, 4 * r + 20, h + 20).translate(-(2 * r + 10), 0, -10))
      }
      else if (f.shape === 'dome') {
        // Dome / spherical cap: top of a sphere sitting flat on the ground. a=radius, c=cap height (0 or ≥r →
        // full hemisphere z∈[0,r]; 0<c<r → shallow cap z∈[0,c] of a larger sphere — watch-glass/lens/button).
        const r = Math.max(0.1, f.a), h = (f.c && f.c > 0 && f.c < r) ? f.c : r, cutZ = r - h   // bt3: 守 r≤0 退化球冠
        // #66 GM-L2：冠高超过半径时只可能封顶为半球（h 上面已钳 = r，几何不变）—— 诚实提示用户实际得到半球，唔好静默当成功
        if (f.c && f.c > r) buildWarnings.push('球冠高超过半径，已封顶为半球')
        let dome = makeSphere(r).cut(makeBaseBox(4 * r + 20, 4 * r + 20, 2 * r + 20).translate(0, 0, -(2 * r + 20) + cutZ))
        if (cutZ !== 0) dome = dome.translate(0, 0, -cutZ)
        solid = dome
      }
      else if (f.shape === 'wedge') {
        // Ramp / wedge: a right-triangle profile (tall H at one end, sloping to 0) extruded across the width.
        // a=length(X), b=width(Y), c=height(Z). Recentre in X&Y and drop to the ground (z∈[0,H]) like the box.
        const L = f.a, W = f.b, H = f.c
        const w = draw([0, 0]).lineTo([L, 0]).lineTo([0, H]).close().sketchOnPlane('XZ').extrude(W) as any
        const b = w.boundingBox.bounds
        solid = w.translate(-(b[0][0] + b[1][0]) / 2, -(b[0][1] + b[1][1]) / 2, -b[0][2])
      }
      else {
        // Torus: tube circle (r=b) at major radius a, revolved about Z. c = sweep angle°: 0 or ≥360 → full ring;
        // 0<c<360 → partial torus / C-ring (snap ring, C-clip, curved handle, arc segment).
        const tb = Math.max(1e-3, f.b)   // bt3: 守管半径≤0 退化环面
        // GM-W8 β1-#29：新档 outerTrue → a=真外半径,中线半径=外半径−管半径（令对话框「外径」输入=真外Ø）；旧档缺 flag → a 本身即中线半径（原语义,零漂移）。
        const tr = Math.max(1e-3, f.outerTrue ? f.a - tb : f.a)
        const tube = drawCircle(tb).translate(tr, 0).sketchOnPlane('XZ') as any
        const ang = (f.c && f.c > 0 && f.c < 360) ? f.c : 360
        solid = (ang >= 360 ? tube.revolve([0, 0, 1]) : tube.revolve([0, 0, 1], { angle: ang })).translate(0, 0, tb)
      }
      merge(solid, f.op)
    } else if (f.type === 'mirror' && shape) {
      // Mirror across the plane (optionally offset along its normal by `offset`):
      // reflect about the origin plane, then translate 2·offset along the normal.
      // T781：planeN+planeO → 任意基准面（构造面）镜像；targets → 净镜像所选特征嘅 delta。
      const mirrorOf = (s: any) => {
        if (f.planeN && f.planeO) {
          const nl = Math.hypot(f.planeN[0], f.planeN[1], f.planeN[2]) || 1
          const mn: [number, number, number] = [f.planeN[0] / nl, f.planeN[1] / nl, f.planeN[2] / nl]
          return s.mirror(new RPlane(f.planeO as any, undefined as any, mn as any))
        }
        let cl = s.mirror(f.plane)
        const off = f.offset ?? 0
        if (off) { const n = PLANE_N[f.plane]; cl = cl.translate(2 * off * n[0], 2 * off * n[1], 2 * off * n[2]) }
        return cl
      }
      if (f.targets?.length) applyTargetDeltas(f.targets, [mirrorOf], '镜像')
      else {
        // 审计修复：whole-body 镜像跨越镜像面（body bbox 横跨该面）时，镜像副本同原体重叠 → union 互相填埋对方嘅孔 → 净结果零孔。
        // 检测轴对齐镜像面跨体 → 诚实警告（建议把镜像面偏移到实体一侧，或用「镜像特征」targets）。几何照做（union 语义），但唔再静默误导。
        // #7b（audit REAL）：op='newbody' → 镜像副本泊车做独立体（唔 fuse）；Fusion Mirror Operation=New Bodies。
        if (f.op === 'newbody') {
          const mcopy = mirrorOf(shape.clone())   // replicad shape（唔好 cast — mirrorOf 已返 replicad Shape，同 split 泊车 parkedHalf 同类）
          if (mcopy && (mcopy as any).wrapped && !(mcopy as any).wrapped.IsNull()) parkedBodies.push({ name: `镜像${parkedBodies.length + 1}`, shape: mcopy })
          else buildWarnings.push('⚠ 镜像（新实体）：副本为空 — 已跳过')
        } else {
          let _straddle = false
          try { if (!f.planeN) { const _k = f.plane === 'XY' ? 2 : f.plane === 'XZ' ? 1 : 0; const _bb = (shape as any).boundingBox.bounds; const _off = f.offset ?? 0; if (_bb[0][_k] < _off - 1e-6 && _bb[1][_k] > _off + 1e-6) _straddle = true } } catch { /* */ }
          shape = shape.fuse(mirrorOf(shape.clone()))
          if (_straddle) buildWarnings.push('⚠ 镜像：实体横跨镜像面 → 镜像副本与原体重叠，重叠区嘅孔会被填埋。请把镜像面偏移到实体一侧，或改用「镜像特征」。')
        }
      }
    } else if (f.type === 'loft') {
      // ruled → developable straight-line (ruled) boundary surface between sections (cleaner, lighter mesh)
      // vs the default smooth/splined transition. wall>0 → shell the lofted solid into a thin curved panel
      // (薄壁曲面板：fairing / shroud / curved bracket). Both use proven kernel ops (loftWith ruled + shell).
      // T772 修潜伏 bug：replicad loft 【默认 ruled=true】— 旧代码 undefined 时其实一直系直纹，「平滑」从未生效。
      // 修复后未勾直纹嘅旧放样会变真平滑样条过渡（属 bug fix，DEVLOG 已声明）。
      const opt = { ruled: !!f.ruled }
      let lofted: any = null
      // #62 GM-L2：实体放样同曲面放样(surfloft)一样，检查各截面边界顶点数是否一致 —— 唔一致(如圆对矩形)线性配对会扭曲，诚实提示（只加警告，唔改几何）
      {
        const _lsProfs: SketchProfile[] = f.sections?.length ? f.sections.map((s) => s.profile) : (f.bottom && f.top ? [f.bottom, f.top] : [])
        if (_lsProfs.length >= 2 && new Set(_lsProfs.map(profileVertCount)).size > 1) buildWarnings.push('⚠ 放样：各截面边界顶点数不一致（如圆对矩形）— ThruSections 线性配对，形状可能在角位扭曲')
      }
      // T772（S52）：导轨放样 — 语义 = 【截面平移跟随】：每个截面整体平移，令佢嘅边界掂到导轨点，
      // 然后照行证实可靠嘅 loftWith（ThruSections）。圆截面精确（边界点 = 圆心 + r·方向），其它截面用
      // 多边形边界最大投影点近似。点解唔用 MakePipeShell Contact：实测多截面 Contact 系 OCCT 冷路径，
      // wasm 单线程会挂死几分钟（e2e 实锤）— 平移跟随确定性 + 快 + 零挂死。截面形状唔变（诚实注明）。
      if (f.rails?.length && f.sections && f.sections.length >= 2) {
        const secs = [...f.sections].sort((a, b) => a.z - b.z)
        const rail = f.rails[0]
        if (f.rails.length > 1) buildWarnings.push('⚠ 暂时只支持 1 条导轨 — 第 2 条起已忽略')
        if (!rail || rail.length !== secs.length) {
          buildWarnings.push('⚠ 导轨点数要同截面数一样（每个截面一点）— 导轨已忽略')
        } else {
          try {
            const moved = secs.map((s2, i) => {
              const rp = rail[i]
              let dx = 0, dy = 0
              if (s2.profile.kind === 'circle') {
                // 圆：边界点 = c + r·unit(rp−c)（精确）；rp==c 时唔郁
                const c = s2.profile.c, rr = s2.profile.r
                const vx = rp[0] - c[0], vy = rp[1] - c[1]
                const L = Math.hypot(vx, vy)
                if (L > 1e-9) { dx = rp[0] - (c[0] + (vx / L) * rr); dy = rp[1] - (c[1] + (vy / L) * rr) }
              } else {
                // 其它截面：多边形边界喺 rp 方向嘅最大投影点 ≈ 掂点
                const pts: [number, number][] = s2.profile.kind === 'rect'
                  ? [[s2.profile.a[0], s2.profile.a[1]], [s2.profile.b[0], s2.profile.a[1]], [s2.profile.b[0], s2.profile.b[1]], [s2.profile.a[0], s2.profile.b[1]]]
                  : s2.profile.kind === 'ellipse'
                    ? Array.from({ length: 32 }, (_, i) => { const a = i * 2 * Math.PI / 32, e = s2.profile as EllipseProfile; return [e.c[0] + e.rx * Math.cos(a), e.c[1] + e.ry * Math.sin(a)] as [number, number] })
                    : (s2.profile.verts ?? s2.profile.pts ?? [])
                if (pts.length) {
                  const cx = pts.reduce((t, q) => t + q[0], 0) / pts.length, cy = pts.reduce((t, q) => t + q[1], 0) / pts.length
                  const vx = rp[0] - cx, vy = rp[1] - cy
                  const L = Math.hypot(vx, vy)
                  if (L > 1e-9) {
                    const ux = vx / L, uy = vy / L
                    let best = -1e18, bx = cx, by = cy
                    for (const q of pts) { const pr = q[0] * ux + q[1] * uy; if (pr > best) { best = pr; bx = q[0]; by = q[1] } }
                    dx = rp[0] - bx; dy = rp[1] - by
                  }
                }
              }
              // 平移 profile 2D 数据（Sketch 对象冇 translate — 直接喺 profile 坐标层做）
              const shift = (p: SketchProfile): SketchProfile => {
                if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return p
                if (p.kind === 'circle') return { ...p, c: [p.c[0] + dx, p.c[1] + dy] }
                if (p.kind === 'ellipse') return { ...p, c: [p.c[0] + dx, p.c[1] + dy] }
                if (p.kind === 'rect') return { ...p, a: [p.a[0] + dx, p.a[1] + dy], b: [p.b[0] + dx, p.b[1] + dy] }
                return {
                  ...p,
                  pts: (p.pts ?? []).map((q) => [q[0] + dx, q[1] + dy] as [number, number]),
                  verts: p.verts?.map((q) => [q[0] + dx, q[1] + dy] as [number, number]),
                  cubics:p.cubics?.map(seg=>seg.map(q=>[q[0]+dx,q[1]+dy]) as CubicBezierSegment),
                  arc: p.arc ? { a: [p.arc.a[0] + dx, p.arc.a[1] + dy], b: [p.arc.b[0] + dx, p.arc.b[1] + dy], m: [p.arc.m[0] + dx, p.arc.m[1] + dy] } : undefined,
                  earc: p.earc ? { ...p.earc, cx: p.earc.cx + dx, cy: p.earc.cy + dy } : undefined,  // S101：椭圆弧边随平移，唔好同 pts 脱节
                }
              }
              return { sk: profileToSketch(shift(s2.profile), s2.z) as any, d: Math.hypot(dx, dy) }
            })
            const sksR = moved.map((m2) => m2.sk)
            lofted = sksR[0].loftWith(sksR.slice(1), opt)
            const maxD = Math.max(...moved.map((m2) => m2.d))
            if (lofted && maxD > 0.01) buildWarnings.push(`⚠ 导轨=截面平移跟随（最大偏移 ${maxD.toFixed(1)}mm，截面形状不变）— 非曲面级 rail 约束`)
          } catch (e) {
            lofted = null
            buildWarnings.push('⚠ rail 引导放样失败，已退回普通放样（rail 被忽略）：' + ((e as any)?.message || e))
          }
        }
      }
      if (!lofted && f.capPoint) {
        // S 放样封口构造点 Loft-to-point：一个截面侧用顶点封口，得真水密尖（鼻锥/漏斗/钻尖/finial）—
        // 取代旧 r:0.05 假小圆 hack 嘅薄片微面。用裸 BRepOffsetAPI_ThruSections（isSolid=true）：
        // capEnd==='first' 喺 AddWire 循环【前】AddVertex，否则【后】。所有生 _oc 句柄经 GCWithScope r() 管理
        // （实证未包 r() 触发 9108520，镜 surfrevolve:1831-1838）。返空/无界 → 退回下面普通 loftWith 路径（fail-safe）。
        try {
          const secWires: any[] = []
          if (f.sections && f.sections.length >= 1) { for (const s of f.sections) secWires.push((loftSectionSketch(s) as any).wire.wrapped) }
          else if (f.bottom && f.top) { secWires.push((profileToSketch(f.bottom, 0) as any).wire.wrapped); secWires.push((profileToSketch(f.top, f.height ?? 50) as any).wire.wrapped) }
          else if (f.bottom) { secWires.push((profileToSketch(f.bottom, 0) as any).wire.wrapped) }
          if (secWires.length >= 1) {
            const r = GCWithScope()
            const ts = r(new (_oc as any).BRepOffsetAPI_ThruSections(true, !!f.ruled, 1e-6))   // isSolid=true → 水密实体
            const cp = f.capPoint
            const v = r(new (_oc as any).BRepBuilderAPI_MakeVertex(r(new (_oc as any).gp_Pnt_3(cp[0], cp[1], cp[2])))).Vertex()
            if (f.capEnd === 'first') { ts.AddVertex(v); for (const w of secWires) ts.AddWire(w) }
            else { for (const w of secWires) ts.AddWire(w); ts.AddVertex(v) }
            ts.Build(r(new (_oc as any).Message_ProgressRange_1()))
            const sh = ts.IsDone && ts.IsDone() ? ts.Shape() : null
            let capped: any = (sh && !sh.IsNull()) ? cast(sh) : null
            // result 级有界性闸（镜 surfrevolve:1842）：无界/返空 → 留 null 退回普通路径。
            let bbOk = false
            if (capped?.wrapped && !capped.wrapped.IsNull()) {
              try { const bb = (capped as any).boundingBox.bounds as [number[], number[]]; const ext = Math.max(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]); if (Number.isFinite(ext) && ext > 1e-6 && ext < 1e6) bbOk = true } catch { /* boundingBox 抛 = 无界 */ }
            }
            if (bbOk) lofted = capped
            else buildWarnings.push('⚠ 放样封口：顶点封口返空 / 无界 — 已退回普通放样')
          } else buildWarnings.push('⚠ 放样封口：截面不足（需 ≥1 截面）— 已退回普通放样')
        } catch (e) { buildWarnings.push('⚠ 放样封口失败，已退回普通放样：' + ((e as any)?.message || e)) }
      }
      if (!lofted && f.continuity && !f.ruled && f.sections && f.sections.length >= 2) {
        // S 放样端条件 Tangent/Curvature：裸 BRepOffsetAPI_ThruSections + SetSmoothing + SetContinuity(C1/C2)。
        // replicad LoftConfig 只得 ruled/startPoint/endPoint 无 tangency → 必须裸内核（现有内核已绑，Node 实证 C1/C2 可 build）。
        // C1≈G1 切线连续、C2≈G2 曲率连续（ThruSections 用参数连续，等参截面下视觉等同 Fusion 切线/曲率放样）。失败/无界 → 退回普通 loftWith。
        try {
          const r = GCWithScope()
          const ts = r(new (_oc as any).BRepOffsetAPI_ThruSections(true, false, 1e-6))
          ts.SetSmoothing(true)
          ts.SetContinuity((_oc as any).GeomAbs_Shape['GeomAbs_' + f.continuity])
          for (const s of f.sections) ts.AddWire((loftSectionSketch(s) as any).wire.wrapped)
          ts.Build(r(new (_oc as any).Message_ProgressRange_1()))
          const sh = ts.IsDone && ts.IsDone() ? ts.Shape() : null
          const cand: any = (sh && !sh.IsNull()) ? cast(sh) : null
          let bbOk = false
          if (cand?.wrapped && !cand.wrapped.IsNull()) {
            try { const bb = cand.boundingBox.bounds as [number[], number[]]; const ext = Math.max(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]); if (Number.isFinite(ext) && ext > 1e-6 && ext < 1e6) bbOk = true } catch { /* 无界 */ }
          }
          if (bbOk) lofted = cand
          else buildWarnings.push(`⚠ ${f.continuity === 'C2' ? '曲率' : '切线'}连续放样返空 / 无界 — 已退回普通放样`)
        } catch (e) { buildWarnings.push('⚠ 连续性放样失败，已退回普通放样：' + ((e as any)?.message || e)) }
      }
      if (!lofted && f.sections && f.sections.length >= 2) {
        const sks = f.sections.map((s) => loftSectionSketch(s)) as any[]
        // #8 Loft Closed：末截面接返首截面成闭环 —— ThruSections 无 periodic 旗，复制首截面 wire 落尾做 C0 近似闭环。
        // 接缝处 C0（Fusion 系 C1）—— 诚实标；≥3 截面先有意义（2 截面闭环=退化重叠）。
        if (f.closed && f.sections.length >= 3) {
          const rest = [...sks.slice(1), loftSectionSketch(f.sections[0]) as any]
          try { lofted = sks[0].loftWith(rest, opt) } catch { lofted = sks[0].loftWith(sks.slice(1), opt); buildWarnings.push('⚠ 闭环放样失败，已退回开放放样') }
          if (lofted) buildWarnings.push('闭环放样：末截面已接返首截面（接缝处 C0 连续，非 Fusion C1 — 趋势级闭环）')
        } else {
          if (f.closed) buildWarnings.push('⚠ 闭环放样需 ≥3 截面（2 截面闭环会退化重叠）— 已按开放放样')
          lofted = sks[0].loftWith(sks.slice(1), opt)
        }
      } else if (!lofted && f.bottom && f.top) {
        const s1 = profileToSketch(f.bottom, 0) as any
        lofted = s1.loftWith(profileToSketch(f.top, f.height ?? 50), opt)
      }
      if (lofted) {
        if (f.wall && f.wall > 0) {
          // 审计修复：旧版 lofted.shell(-wall) 缺【face finder】→ 此 OCCT-wasm build 对每个放样实体都抛错 →
          // 「放样→薄壁」100% 静默退回实体（薄壳从未生效）。改：传开口面 finder（bbox 顶/底面）+ 减薄重试 +
          // _orientSolidOutward 校正定向（带 finder 锥壳可能负体积反转）+ 验体积系真挖空（∈(0, 实心·0.98)）。
          let solidVol = 0
          try { const g0 = new _oc.GProp_GProps_1(); _oc.BRepGProp.VolumeProperties_1((lofted as any).wrapped, g0, false, false, false); solidVol = Math.abs(g0.Mass()) } catch { /* */ }
          let hollowed: any = null
          try {
            const bb = (lofted as any).boundingBox.bounds as [number[], number[]]
            const cands = [(ff: any) => ff.inPlane('XY', bb[1][2]), (ff: any) => ff.inPlane('XY', bb[0][2])]
            for (const fn of cands) {
              const walls: number[] = [f.wall, f.wall * 0.6, f.wall * 0.35]   // 显式注解断推断循环（TS7022）
              for (const tw of walls) {
                try {
                  const sh = lofted.shell(-Math.abs(tw), fn)
                  if (sh && (sh as any).wrapped && !(sh as any).wrapped.IsNull()) {
                    const oriented = cast(_orientSolidOutward((sh as any).wrapped))
                    const g = new _oc.GProp_GProps_1(); _oc.BRepGProp.VolumeProperties_1((oriented as any).wrapped, g, false, false, false)
                    const v = g.Mass()
                    if (v > 1e-6 && (solidVol <= 0 || v < solidVol * 0.98)) { hollowed = oriented; if (tw !== f.wall) buildWarnings.push(`放样薄壁 ${f.wall}mm 太厚，已减薄到 ${tw.toFixed(1)} 才成功`); break }
                  }
                } catch { /* try next thickness */ }
              }
              if (hollowed) break
            }
          } catch { /* bbox 失败 */ }
          if (hollowed) lofted = hollowed
          else buildWarnings.push(`⚠ 放样薄壁 ${f.wall}mm 失败，已退回实体放样（试减薄壁厚或简化截面）`)
        }
        merge(lofted, f.op)
      }
    } else if (f.type === 'delface' && shape) {
      // T795（S74）直接编辑：删掉拾取点最近嗰个面 — C++ DirectEditWrapper 用 BRepAlgoAPI_Defeaturing
      // 去特征 + 治愈（删倒角/孔/凸台清理导入件）。失败诚实保旧形 + 警告。
      try {
        const w = (_oc as Record<string, unknown>).DirectEditWrapper as { DeleteFaceNear?: (s: any, x: number, y: number, z: number) => any } | undefined
        if (!w || !w.DeleteFaceNear) { buildWarnings.push('⚠ 删面需要 plus 内核 DirectEditWrapper（未绑定）— 已跳过') }
        else {
          // S129 面指纹 + P2 批9 多面：nears 缺省退 [near]（旧档逐字节）；逐面顺序 DeleteFaceNear，每面独立体积 no-op 守卫
          const ns0: [number, number, number][] = (f.nears && f.nears.length ? f.nears : [f.near])
          let ns = ns0
          _lastResolvedFaceFp = null
          try { shape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }) } catch { /* 三角化供 _ff* 查面 */ }
          if (f.faceFp && f.faceFp.length) { const sel = _ffSelectPts(shape, f.faceFp, ns0, f.faceFpV2, f.faceFpTopo); if (sel && sel.length === ns0.length) ns = sel }   // S131：near-biased 消歧；S136：带 faceFpV2 先试旋转不变
          else { const _c = _ffCapture(shape, ns0); _lastResolvedFaceFp = _c.v1; _lastResolvedFaceFpV2 = _c.v2; _lastResolvedFaceFpTopo = _c.topo }
          let okCount = 0
          for (const P of ns) {
            const res = w.DeleteFaceNear(shape.wrapped, P[0], P[1], P[2])
            // 审计修复：DeleteFaceNear 对唔可去嘅普通面返回【非 null 但几何完全不变】→ 体积对比捉 no-op。
            let _vB = NaN, _vA = NaN
            try { const g = new _oc.GProp_GProps_1(); _oc.BRepGProp.VolumeProperties_1(shape.wrapped, g, false, false, false); _vB = g.Mass() } catch { /* */ }
            try { const g = new _oc.GProp_GProps_1(); _oc.BRepGProp.VolumeProperties_1(res, g, false, false, false); _vA = g.Mass() } catch { /* */ }
            const _noop = Number.isFinite(_vB) && Number.isFinite(_vA) && Math.abs(_vA - _vB) < 1e-6
            if (res && !res.IsNull() && !_noop) { shape = cast(res); okCount++; try { shape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }) } catch { /* 下一面查找要新鲜三角化 */ } }
            else if (_noop) buildWarnings.push(`⚠ 删面失败（面@${P.map((x) => x.toFixed(0)).join(',')} 唔系可去嘅特征 — 几何无变化）— 该面保持原样`)
            else buildWarnings.push(`⚠ 删面失败（面@${P.map((x) => x.toFixed(0)).join(',')} 去特征唔到/治愈失败）— 该面保持原样`)
          }
          if (okCount) { const _cap = _lastResolvedFaceFp as string[] | null; if (_cap && _cap.length) { _resolvedFaceFp[f.id] = _cap; _lastResolvedFaceFp = null } { const _capV2 = _lastResolvedFaceFpV2 as string[] | null; if (_capV2 && _capV2.length) { _resolvedFaceFpV2[f.id] = _capV2; _lastResolvedFaceFpV2 = null } { const _capTopo = _lastResolvedFaceFpTopo as string[] | null; if (_capTopo && _capTopo.length) { _resolvedFaceFpTopo[f.id] = _capTopo; _lastResolvedFaceFpTopo = null } } } }   // S136：v2 平行写回（有成功先写）
        }
      } catch (e) { buildWarnings.push('删面失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'thickenface' && shape) {
      // T811（S曲面）：加厚拾取面成实体薄板（C++ DirectEditWrapper.ThickenFaceNear / MakeThickSolidBySimple）。
      // 出独立实体（parkedBodies，同补面一致 — 避免共面 fuse 不可靠）；失败诚实保旧形 + 警告。
      try {
        const w = (_oc as Record<string, unknown>).DirectEditWrapper as { ThickenFaceNear?: (s: any, x: number, y: number, z: number, t: number) => any } | undefined
        if (!w || !w.ThickenFaceNear) { buildWarnings.push('⚠ 加厚需要 plus 内核 DirectEditWrapper.ThickenFaceNear（未绑定）— 已跳过') }
        else {
          // S156 方向翻面：C++ MakeThickSolidBySimple 本身认 signed thick（负 = 板长反侧）；旧码 Math.max(0.05, …) 夹走符号、只向一侧。
          // 保幅度下限 0.05、保符号：side='neg' → 传负。旧档（无 side）→ 正向 = 逐字节回放（back-compat）。
          const mag = Math.max(0.05, Math.abs(f.thick || 1))
          const signed = (f.side === 'neg') ? -mag : mag
          const res = w.ThickenFaceNear(shape.wrapped, f.near[0], f.near[1], f.near[2], signed)
          if (res && !res.IsNull()) parkedBodies.push({ name: '加厚件', shape: cast(_orientSolidOutward(res)) })   // 审计修复：MakeThickSolid 反转 → 定向归正
          else buildWarnings.push('加厚失败（该面唔适合加厚 / 厚度相对几何过大）— 保持原样')
        }
      } catch (e) { buildWarnings.push('加厚失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'offsetsurf' && shape) {
      // T812（S曲面）：偏移拾取面成平行新曲面（C++ DirectEditWrapper.OffsetSurfaceNear / MakeOffsetShape BySimple）。
      // 出开放曲面壳（parkedBodies「偏移曲面」）；失败诚实保旧形 + 警告。
      try {
        const w = (_oc as Record<string, unknown>).DirectEditWrapper as { OffsetSurfaceNear?: (s: any, x: number, y: number, z: number, d: number) => any } | undefined
        if (!w || !w.OffsetSurfaceNear) { buildWarnings.push('⚠ 偏移曲面需要 plus 内核 DirectEditWrapper.OffsetSurfaceNear（未绑定）— 已跳过') }
        else {
          const res = w.OffsetSurfaceNear(shape.wrapped, f.near[0], f.near[1], f.near[2], f.dist || 2)
          if (res && !res.IsNull()) parkedBodies.push({ name: '偏移曲面', shape: cast(res) })
          else buildWarnings.push('偏移曲面失败（该面唔适合偏移 / 距离过大自交）— 保持原样')
        }
      } catch (e) { buildWarnings.push('偏移曲面失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'offsetsolid' && shape) {
      // S 整体偏移实体 Offset Solid：均匀偏移实体所有面（加厚铸件壁/3D 打印补偿/外扩缩）。BRepOffsetAPI_MakeOffsetShape
      // PerformByJoin（Skin 模式 + Arc 接合圆角凸边）。raw _oc 经 GCWithScope r() 管理（实证未包 r() 触发 9108520）。
      // HARD FLOOR：零距/null/IsDone=false/无界 → shape 逐字节保持唔变 + 诚实 buildWarning（绝不产破体）。大偏移自交 → shrink-retry。
      const d = f.distance
      if (!d || Math.abs(d) < 1e-6) { buildWarnings.push('整体偏移：距离为零 — 已跳过') }
      else {
        let done: any = null, lastErr = ''
        for (const dd of [d, d * 0.6, d * 0.35]) {
          try {
            const r = GCWithScope()
            const mos: any = r(new (_oc as any).BRepOffsetAPI_MakeOffsetShape())
            mos.PerformByJoin(shape.wrapped, dd, 1e-3, (_oc as any).BRepOffset_Mode.BRepOffset_Skin, false, false, (_oc as any).GeomAbs_JoinType.GeomAbs_Arc, false, r(new (_oc as any).Message_ProgressRange_1()))
            if (mos.IsDone && mos.IsDone()) { const off = r(mos.Shape()); if (off && !off.IsNull()) { done = cast(off); if (dd !== d) buildWarnings.push(`整体偏移 ${d} 自交,已减到 ${dd.toFixed(2)} 才成功`); break } }
          } catch (e) { lastErr = (e as any)?.message || String(e) }
        }
        if (done && done.wrapped && !done.wrapped.IsNull()) {
          let bbOk = false
          try { const bb = (done as any).boundingBox.bounds as [number[], number[]]; const ext = Math.max(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]); if (Number.isFinite(ext) && ext > 1e-6 && ext < 1e6) bbOk = true } catch { /* 无界 */ }
          if (bbOk) shape = done
          else buildWarnings.push('整体偏移：结果无界 — 已保旧形')
        } else buildWarnings.push(`整体偏移 ${d} 失败（自交/不可偏移${lastErr ? '：' + lastErr : ''}）— 已保旧形`)
      }
    } else if (f.type === 'reversesurf') {
      // S157 翻转曲面定向 Reverse Surface：翻泊车曲面壳/面定向（法向反向），影响 Thicken/Stitch 朝向。
      // 纯拓扑翻向（TopoDS_Shape.Reversed()，零内核重建）— 所有生 _oc 句柄经 GCWithScope r() 管理（实证未包 r() 触发 9108520）。
      // HARD FLOOR：null/throw / 结果无界 → parkedBodies[target] 逐字节保持唔变 + 诚实 buildWarning（绝不产破壳/null 现有泊车体）。
      const t = parkedBodies[f.target]
      if (!t) { buildWarnings.push(`⚠ 翻转曲面：揾唔到目标曲面 #${f.target + 1}`) }
      else if (!t.shape || !(t.shape as any).wrapped || (t.shape as any).wrapped.IsNull()) { buildWarnings.push(`⚠ 翻转曲面：目标曲面 #${f.target + 1} 为空 — 保持唔变`) }
      else {
        try {
          const r = GCWithScope()
          const rev = r((t.shape as any).wrapped.Reversed())   // TopoDS_Shape.Reversed()：翻定向嘅副本（GC 管理）
          let result: any = null
          if (rev && !rev.IsNull()) result = cast(rev)
          if (result && result.wrapped && !result.wrapped.IsNull()) {
            // result 级有界性闸：翻向理应保持 bbox，但任何意外无界结果须挡（避免 mesh 时炸 → 曲面消失）。
            let bbOk = false
            try { const bb = (result as any).boundingBox.bounds as [number[], number[]]; const ext = Math.max(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]); if (Number.isFinite(ext) && ext > 1e-6 && ext < 1e6) bbOk = true } catch { /* boundingBox 抛 = 无界 */ }
            if (bbOk) { parkedBodies[f.target] = { name: t.name, shape: result }; buildWarnings.push(`翻转曲面：${t.name} 已翻定向（法向反向）`) }
            else { buildWarnings.push('翻转曲面：结果无界 — 已 fail-safe 保持唔变') }
          } else { buildWarnings.push('翻转曲面失败（翻向返空）— 曲面保持唔变') }
        } catch (e) { buildWarnings.push('翻转曲面失败：' + ((e as any)?.message || e)) }
      }
    } else if (f.type === 'thickenquilt') {
      // S182 加厚整张泊车曲面/quilt 成实体（Fusion Thicken）：MakeThickSolidBySimple 同 patch-thicken:2511-2516 字节级同款 op，
      // 但目标系任一【整张泊车曲面件】（loft/sweep/stitch/规则曲面 …），唔似 thickenface 净加厚单一拾取面。
      // 目标解析 + GCWithScope + result 级 bbox 闸 镜 reversesurf:1711-1728。HARD FLOOR：null/IsDone=false/无界 → parkedBodies 逐字节保持唔变 + 诚实 buildWarning。
      const t = parkedBodies[f.target]
      if (!t) { buildWarnings.push(`⚠ 加厚曲面：揾唔到目标曲面 #${f.target + 1}`) }
      else if (!t.shape || !(t.shape as any).wrapped || (t.shape as any).wrapped.IsNull()) { buildWarnings.push(`⚠ 加厚曲面：目标曲面 #${f.target + 1} 为空 — 保持唔变`) }
      else if (!(_oc as any).BRepOffsetAPI_MakeThickSolid) { buildWarnings.push('⚠ 加厚曲面需要 BRepOffsetAPI_MakeThickSolid（未绑定）— 已跳过') }
      else {
        const signed = (f.side === 'neg' ? -1 : 1) * Math.abs(f.thick || 2)
        try {
          const r = GCWithScope()
          const mts = r(new (_oc as any).BRepOffsetAPI_MakeThickSolid())
          mts.MakeThickSolidBySimple((t.shape as any).wrapped, signed)
          mts.Build(r(new (_oc as any).Message_ProgressRange_1()))
          let result: any = null
          if (mts.IsDone()) { const ts = mts.Shape(); if (ts && !ts.IsNull()) result = cast(_orientSolidOutward(ts)) }   // 审计修复：MakeThickSolid 反转 → 定向归正
          if (result && result.wrapped && !result.wrapped.IsNull()) {
            let bbOk = false
            try { const bb = (result as any).boundingBox.bounds as [number[], number[]]; const ext = Math.max(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]); if (Number.isFinite(ext) && ext > 1e-6 && ext < 1e6) bbOk = true } catch { /* 无界 */ }
            if (bbOk) {
              // 出实体：无活动实体 → 设为活动 shape；否则做独立泊车实体（镜 patch-thicken:2523-2524 输出约定）
              if (shape) parkedBodies.push({ name: `加厚实体（${t.name}）`, shape: result })
              else shape = result
              buildWarnings.push(`加厚曲面：${t.name} 已加厚 ${Math.abs(signed)}mm 成实体${f.side === 'neg' ? '（翻面）' : ''}`)
            } else buildWarnings.push('加厚曲面：结果无界 — 已 fail-safe 保持唔变')
          } else buildWarnings.push('加厚曲面失败（MakeThickSolidBySimple 未收敛 — 曲面太扭/自交/厚度过大）— 保持唔变')
        } catch (e) { buildWarnings.push('加厚曲面失败：' + ((e as any)?.message || e)) }
      }
    } else if (f.type === 'extendface') {
      // S103 曲面延伸：BRepLib::ExtendFace 沿面自然几何外延（平面变大/圆柱半面变长/B样条外推）。
      // 唔限 && shape：延伸目标多数系 parked 曲面件（surfextrude/patch），活动实体面亦可。
      try {
        const w = (_oc as Record<string, unknown>).DirectEditWrapper as { ExtendFaceNear?: (s: any, x: number, y: number, z: number, e: number) => any } | undefined
        const cands: any[] = [...(shape ? [shape] : []), ...parkedBodies.map((b) => b.shape)]
        if (!w || !w.ExtendFaceNear) { buildWarnings.push('⚠ 曲面延伸需要 plus 内核 DirectEditWrapper.ExtendFaceNear（未绑定）— 已跳过') }
        else if (!cands.length) { buildWarnings.push('曲面延伸：冇曲面/实体可延伸') }
        else {
          let done = false
          for (const src of cands) {
            const res = w.ExtendFaceNear(src.wrapped, f.near[0], f.near[1], f.near[2], Math.max(0.05, f.ext || 5))
            if (res && !res.IsNull()) { parkedBodies.push({ name: '延伸曲面', shape: cast(res) }); done = true; break }
          }
          if (!done) buildWarnings.push('曲面延伸失败（该面唔适合延伸 / 长度过大）— 保持原样')
        }
      } catch (e) { buildWarnings.push('曲面延伸失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'splitface' && shape) {
      // S99 Split Face：用平面喺最近面 imprint 一条交线，把面拓扑切两半（等体积，子面 faceGroups 各自独立可拣）。
      try {
        const w = (_oc as Record<string, unknown>).DirectEditWrapper as { SplitFaceNearByPlane?: (s: any, nx: number, ny: number, nz: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) => any } | undefined
        if (!w || !w.SplitFaceNearByPlane) { buildWarnings.push('⚠ 分割面需要 plus 内核 DirectEditWrapper.SplitFaceNearByPlane（未绑定）— 已跳过') }
        else {
          // S129 面指纹（镜 pushpull）：仅指纹拓扑【拣面】点；planeOrigin/planeNormal 维持原样。
          let P: [number, number, number] = [f.near[0], f.near[1], f.near[2]]
          _lastResolvedFaceFp = null
          try { shape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }) } catch { /* 三角化供 _ff* 查面 */ }
          if (f.faceFp && f.faceFp.length) { const sel = _ffSelectPts(shape, f.faceFp, [f.near], f.faceFpV2, f.faceFpTopo); if (sel && sel.length) P = sel[0] }   // S131：near-biased 消歧；S136：带 faceFpV2 先试旋转不变
          else { const _c = _ffCapture(shape, [f.near]); _lastResolvedFaceFp = _c.v1; _lastResolvedFaceFpV2 = _c.v2; _lastResolvedFaceFpTopo = _c.topo }
          const res = w.SplitFaceNearByPlane(shape.wrapped, P[0], P[1], P[2], f.planeOrigin[0], f.planeOrigin[1], f.planeOrigin[2], f.planeNormal[0], f.planeNormal[1], f.planeNormal[2])
          if (res && !res.IsNull()) { shape = cast(res); const _cap = _lastResolvedFaceFp as string[] | null; if (_cap && _cap.length) { _resolvedFaceFp[f.id] = _cap; _lastResolvedFaceFp = null } { const _capV2 = _lastResolvedFaceFpV2 as string[] | null; if (_capV2 && _capV2.length) { _resolvedFaceFpV2[f.id] = _capV2; _lastResolvedFaceFpV2 = null } { const _capTopo = _lastResolvedFaceFpTopo as string[] | null; if (_capTopo && _capTopo.length) { _resolvedFaceFpTopo[f.id] = _capTopo; _lastResolvedFaceFpTopo = null } } } }   // S136：v2 平行写回
          else buildWarnings.push('分割面失败（切割平面同该面唔相交）— 保持原样')
        }
      } catch (e) { buildWarnings.push('分割面失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'silhouettesplit' && shape) {
      // Fusion Silhouette Split v1: exact HLR outlines only.  The custom
      // kernel gates accept analytic cylindrical and conical source faces and reject
      // spheres/other periodic or freeform surfaces before SplitShape, because
      // a display-mesh silhouette would not be a valid B-rep split.
      try {
        const w = (_oc as Record<string, unknown>).DirectEditWrapper as {
          SplitByHlrOutline3dSafe?: (s: any, x: number, y: number, z: number) => any
          SplitByHlrOutline3dConesOnly?: (s: any, x: number, y: number, z: number) => any
        } | undefined
        const dirs: Record<typeof f.view, [number, number, number]> = {
          front: [0, -1, 0], back: [0, 1, 0], top: [0, 0, 1], bottom: [0, 0, -1], right: [1, 0, 0], left: [-1, 0, 0],
        }
        if (!w?.SplitByHlrOutline3dSafe || !w?.SplitByHlrOutline3dConesOnly) buildWarnings.push('⚠ 轮廓分割需要已验证的 plus 内核 — 已跳过')
        else {
          const d = dirs[f.view]
          // First gate is deliberately cylinder-only.  A null result is then
          // handed to the separately tested cone-only gate; this avoids widening
          // either kernel path to spheres or arbitrary/freeform B-rep faces.
          const res = w.SplitByHlrOutline3dSafe(shape.wrapped, d[0], d[1], d[2]) || w.SplitByHlrOutline3dConesOnly(shape.wrapped, d[0], d[1], d[2])
          if (res && !res.IsNull()) shape = cast(res)
          else buildWarnings.push('轮廓分割：当前正交视图没有可安全分割的圆柱或圆锥轮廓（球体、自由曲面和其他面暂不支持）— 已保持原样')
        }
      } catch (e) { buildWarnings.push('轮廓分割失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'replaceface' && shape) {
      // S99 Replace Face（平面顶替）：用无界平面截断实体，保留远离拾取面嗰侧（邻面 BOP 自动延伸）。
      try {
        const w = (_oc as Record<string, unknown>).DirectEditWrapper as { ReplaceFaceNear?: (s: any, px: number, py: number, pz: number, ox: number, oy: number, oz: number, nx: number, ny: number, nz: number) => any } | undefined
        if (!w || !w.ReplaceFaceNear) { buildWarnings.push('⚠ 替换面需要 plus 内核 DirectEditWrapper.ReplaceFaceNear（未绑定）— 已跳过') }
        else {
          // S129 面指纹（镜 pushpull）：仅指纹拓扑【拣面】点；planeOrigin/planeNormal 维持原样。
          let P: [number, number, number] = [f.near[0], f.near[1], f.near[2]]
          _lastResolvedFaceFp = null
          try { shape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }) } catch { /* 三角化供 _ff* 查面 */ }
          if (f.faceFp && f.faceFp.length) { const sel = _ffSelectPts(shape, f.faceFp, [f.near], f.faceFpV2, f.faceFpTopo); if (sel && sel.length) P = sel[0] }   // S131：near-biased 消歧；S136：带 faceFpV2 先试旋转不变
          else { const _c = _ffCapture(shape, [f.near]); _lastResolvedFaceFp = _c.v1; _lastResolvedFaceFpV2 = _c.v2; _lastResolvedFaceFpTopo = _c.topo }
          const res = w.ReplaceFaceNear(shape.wrapped, P[0], P[1], P[2], f.planeOrigin[0], f.planeOrigin[1], f.planeOrigin[2], f.planeNormal[0], f.planeNormal[1], f.planeNormal[2])
          if (res && !res.IsNull()) { shape = cast(res); const _cap = _lastResolvedFaceFp as string[] | null; if (_cap && _cap.length) { _resolvedFaceFp[f.id] = _cap; _lastResolvedFaceFp = null } { const _capV2 = _lastResolvedFaceFpV2 as string[] | null; if (_capV2 && _capV2.length) { _resolvedFaceFpV2[f.id] = _capV2; _lastResolvedFaceFpV2 = null } { const _capTopo = _lastResolvedFaceFpTopo as string[] | null; if (_capTopo && _capTopo.length) { _resolvedFaceFpTopo[f.id] = _capTopo; _lastResolvedFaceFpTopo = null } } } }   // S136：v2 平行写回
          else buildWarnings.push('替换面失败（平面同实体唔相交 / 退化）— 保持原样')
        }
      } catch (e) { buildWarnings.push('替换面失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'moveface' && shape) {
      // GM-B2 移动面 Move Face v1 + GM-L2 v2 多面串链：拾一张或多张【平面】面 →
      //   offset（缺省）：dist<0 用 ReplaceFaceNear 把面朝内推、邻面（含相邻圆角）由内核重解（probe P1c/P7b）；
      //                   dist>0 无重解内核路径 → prism fuse 朝外长大（pushpull 平面路径同款，_recordBool 供 S2 血统）。
      //   tilt：平面绕【过面心嘅面内轴（缺省最长内轴 / f.axis 投影）】倾 angle°（钳 ±60°），ReplaceFaceNear 喂倾斜平面（probe P4）。
      //   GM-L2 v2：nears 缺省退 [near]（旧档逐字节）。多面 = 逐面顺序串链（probe P5：每步内核输出喂下一步）——
      //     朝内逐面 ReplaceFaceNear（NULL/vol 守卫：单面退 prism-cut 保 v1；多面诚实跳该面继续串链，唔退 prism 免混淆）；
      //     朝外逐面 prism fuse（_recordBool 逐面覆盖 _boolToolAt[_i]，多面时 S2 只对最后一面有效 — 同 pushpull 诚实约定）；
      //     tilt 只准单面（多面方向歧义 → _moveFacePlan 诚实 reject-multi-tilt）。
      //   诚实局限：仅平面面（非平面诚实跳）；朝外 = fuse（邻面唔重解）；朝内退化/倾斜太尽 → NULL → 诚实警告保原样。
      try {
        const w = (_oc as Record<string, unknown>).DirectEditWrapper as { ReplaceFaceNear?: (s: any, px: number, py: number, pz: number, ox: number, oy: number, oz: number, nx: number, ny: number, nz: number) => any } | undefined
        const ns0: [number, number, number][] = (f.nears && f.nears.length ? f.nears : [f.near])   // GM-L2：多面缺省退 [near]（旧档逐字节）
        const multi = ns0.length > 1
        const plan = _moveFacePlan({ mode: f.mode, dist: f.dist, angle: f.angle, nfaces: ns0.length })   // 走边条内核路径（同 tests 共用同一决策核）
        if (plan.op === 'skip-zero') { buildWarnings.push('移动面：' + (plan.note || '距离/角度为 0 — 跳过')) }
        else if (plan.op === 'reject-multi-tilt') { buildWarnings.push('⚠ 移动面：' + (plan.note || '倾斜暂唔支持多面') + ' — 已跳过（保持原样）') }
        else if ((plan.op === 'replace-inward' || plan.op === 'tilt') && (!w || !w.ReplaceFaceNear)) { buildWarnings.push('⚠ 移动面（朝内/倾斜）需要 plus 内核 DirectEditWrapper.ReplaceFaceNear（未绑定）— 已跳过') }
        else {
          // ── 逐面解析拾取点（镜 delface/pushpull：faceFp 与 nears 平行数组消歧 / 首解捕获）──
          let ns = ns0
          _lastResolvedFaceFp = null
          try { shape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }) } catch { /* 三角化供 _ff* + 最近面查找 */ }
          if (f.faceFp && f.faceFp.length) { const sel = _ffSelectPts(shape, f.faceFp, ns0, f.faceFpV2, f.faceFpTopo); if (sel && sel.length === ns0.length) ns = sel }   // 持久面名消歧（与 nears 平行）
          else { const _c = _ffCapture(shape, ns0); _lastResolvedFaceFp = _c.v1; _lastResolvedFaceFpV2 = _c.v2; _lastResolvedFaceFpTopo = _c.topo }
          const _vol = (sh: any): number => { try { const g = new _oc.GProp_GProps_1(); _oc.BRepGProp.VolumeProperties_1(sh, g, false, false, false); return Math.abs(g.Mass()) } catch { return NaN } }
          let okCount = 0
          for (let fi = 0; fi < ns.length; fi++) {
            const P = ns[fi]
            const tag = multi ? `第 ${fi + 1} 面` : '该面'
            // 逐面重三角化 + 揾最近面（上一面串链改动后 faces/triangulation 要新鲜，镜 delface/pushpull 多面循环）
            try { shape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }) } catch { /* 新鲜三角化供最近面查找 */ }
            const faces = (shape as any).faces as any[]
            let bestF: any = null, bestD = Infinity
            for (const fc of faces) {
              const tri = fc.triangulation ? fc.triangulation() : null
              if (!tri || !tri.vertices || !tri.vertices.length) continue
              const V = tri.vertices as number[], T = tri.trianglesIndexes as number[]
              let dmin = Infinity
              for (let i = 0; i + 2 < T.length; i += 3) { const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3; const d = ptTriDist2(P[0], P[1], P[2], V[a], V[a + 1], V[a + 2], V[b], V[b + 1], V[b + 2], V[c], V[c + 1], V[c + 2]); if (d < dmin) dmin = d }
              if (dmin < bestD) { bestD = dmin; bestF = fc }
            }
            if (!bestF) { buildWarnings.push(`移动面：揾唔到${tag} — ${multi ? '已跳过，继续下一面' : '跳过'}`); continue }
            if (bestF.geomType !== 'PLANE') { buildWarnings.push(`⚠ 移动面只支持平面面（${tag}系 ` + (bestF.geomType || '非平面') + `）— ${multi ? '已跳过，继续下一面' : '诚实跳过。圆柱/曲面请用「按拉」或「偏移曲面」'}`); continue }
            const n = bestF.normalAt(P).normalized()   // 外向法向（同 pushpull）
            if (plan.op === 'replace-inward') {
              // 朝内：ReplaceFaceNear(shape, P, P+n·dist, n)（dist<0 → 目标平面往内移，probe P1c）
              const org: [number, number, number] = [P[0] + n.x * f.dist, P[1] + n.y * f.dist, P[2] + n.z * f.dist]
              let res: any = null
              try { res = w!.ReplaceFaceNear!(shape.wrapped, P[0], P[1], P[2], org[0], org[1], org[2], n.x, n.y, n.z) } catch { res = null }
              if (res && !res.IsNull() && _vol(res) > 1e-6) { shape = cast(res); okCount++ }
              else if (!multi) {
                // v1 单面：NULL/vol≤0 → 退回 prism-cut（逐字节保 v1 行为）
                const prism = basicFaceExtrusion(bestF, n.multiply(f.dist))   // dist<0 → 朝内柱 → cut（pushpull 足迹）
                _recordBool(_i, 'cut', prism); shape = shape.cut(prism); okCount++
                buildWarnings.push('移动面：内核朝内重解退化 → 已退回 prism 切除（邻面/圆角未由内核重解，只切走该面下方料）')
              } else {
                // v2 多面：NULL/vol 守卫 → 诚实跳该面继续串链（唔退 prism，免多面语义混淆）
                buildWarnings.push(`⚠ 移动面${tag}朝内内核重解失败（退化 / 距离过大）— 已跳过该面，继续下一面`)
              }
            } else if (plan.op === 'prism-outward') {
              // 朝外长大：无重解内核路径（probe P1d 返 NULL）→ prism fuse（pushpull 平面路径同款，_recordBool 供 S2；多面逐面覆盖 _boolToolAt[_i]，最后一面胜出）
              const prism = basicFaceExtrusion(bestF, n.multiply(f.dist))
              _recordBool(_i, 'fuse', prism); shape = shape.fuse(prism); okCount++
            } else {
              // tilt（plan 保证单面）：平面绕【过面心嘅面内轴】倾 angle°（Rodrigues），ReplaceFaceNear 喂倾斜平面（probe P4）
              const tri = bestF.triangulation ? bestF.triangulation() : null
              if (!tri || !tri.vertices || !tri.vertices.length) { buildWarnings.push('移动面倾斜：面三角化失败 — 跳过') }
              else {
                const V = tri.vertices as number[]; const nv = V.length / 3
                let cxf = 0, cyf = 0, czf = 0; for (let i = 0; i < V.length; i += 3) { cxf += V[i]; cyf += V[i + 1]; czf += V[i + 2] }
                const ctr: [number, number, number] = [cxf / nv, cyf / nv, czf / nv]   // 面心 = 铰轴通过点
                // 面内正交基 u,v ⊥ n（seed 拣同 n 最唔平行嗰条世界轴）
                let ux = 1, uy = 0, uz = 0; if (Math.abs(n.x) > 0.9) { ux = 0; uy = 1; uz = 0 }
                const sdn = ux * n.x + uy * n.y + uz * n.z; ux -= sdn * n.x; uy -= sdn * n.y; uz -= sdn * n.z
                const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul
                const vx = n.y * uz - n.z * uy, vy = n.z * ux - n.x * uz, vz = n.x * uy - n.y * ux   // v = n × u
                let kx: number, ky: number, kz: number
                if (f.axis) {
                  // f.axis 投影入面（减去法向分量）做铰轴；退化 → 退回 u
                  const ax = f.axis[0], ay = f.axis[1], az = f.axis[2]; const adn = ax * n.x + ay * n.y + az * n.z
                  kx = ax - adn * n.x; ky = ay - adn * n.y; kz = az - adn * n.z
                  const kl = Math.hypot(kx, ky, kz)
                  if (kl < 1e-6) { kx = ux; ky = uy; kz = uz } else { kx /= kl; ky /= kl; kz /= kl }
                } else {
                  // 缺省铰轴 = 面内展幅较大嗰条轴（最长面内轴 → 沿短向掀起，probe P4：40×30 顶面绕长轴 X 掀）
                  let su = 0, sv = 0, muU = 0, muV = 0; const pu: number[] = [], pv: number[] = []
                  for (let i = 0; i < V.length; i += 3) { const du = (V[i] - ctr[0]) * ux + (V[i + 1] - ctr[1]) * uy + (V[i + 2] - ctr[2]) * uz; const dv = (V[i] - ctr[0]) * vx + (V[i + 1] - ctr[1]) * vy + (V[i + 2] - ctr[2]) * vz; pu.push(du); pv.push(dv); muU += du; muV += dv }
                  muU /= nv; muV /= nv
                  for (let i = 0; i < nv; i++) { su += (pu[i] - muU) ** 2; sv += (pv[i] - muV) ** 2 }
                  if (su >= sv) { kx = ux; ky = uy; kz = uz } else { kx = vx; ky = vy; kz = vz }
                }
                const t = (plan.angle as number) * Math.PI / 180, ct = Math.cos(t), st = Math.sin(t)
                // Rodrigues 绕单位铰轴 k 旋外向法向 n（k⊥n → n·k≈0）：n' = n·ct + (k×n)·st
                const cnx = ky * n.z - kz * n.y, cny = kz * n.x - kx * n.z, cnz = kx * n.y - ky * n.x
                let tnx = n.x * ct + cnx * st, tny = n.y * ct + cny * st, tnz = n.z * ct + cnz * st
                const tl = Math.hypot(tnx, tny, tnz) || 1; tnx /= tl; tny /= tl; tnz /= tl
                let res: any = null
                try { res = w!.ReplaceFaceNear!(shape.wrapped, P[0], P[1], P[2], ctr[0], ctr[1], ctr[2], tnx, tny, tnz) } catch { res = null }
                if (res && !res.IsNull() && _vol(res) > 1e-6) { shape = cast(res); okCount++ }
                else buildWarnings.push('移动面倾斜失败（铰点/角度太尽 — 倾斜平面唔穿实体内部或退化）— 保持原样，试细啲角度或换个面')
              }
            }
          }
          // 面指纹写回（镜 delface/pushpull：有成功先写）：首解捕获 → store 写回 feature.faceFp/V2/Topo（多面=与 nears 平行数组）
          if (okCount) {
            { const _cap = _lastResolvedFaceFp as string[] | null; if (_cap && _cap.length) { _resolvedFaceFp[f.id] = _cap; _lastResolvedFaceFp = null } }
            { const _capV2 = _lastResolvedFaceFpV2 as string[] | null; if (_capV2 && _capV2.length) { _resolvedFaceFpV2[f.id] = _capV2; _lastResolvedFaceFpV2 = null } }
            { const _capTopo = _lastResolvedFaceFpTopo as string[] | null; if (_capTopo && _capTopo.length) { _resolvedFaceFpTopo[f.id] = _capTopo; _lastResolvedFaceFpTopo = null } }
          }
        }
      } catch (e) { buildWarnings.push('移动面失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'surfsew') {
      // S86 曲面缝合 Stitch：把所有曲面/壳体（parkedBodies）的面缝成一个 shell（BRepBuilderAPI_Sewing
      // 共边焊接）；NbFreeEdges()==0（闭合）→ ShapeFix_Solid 转实体。结果取代 parkedBodies；
      // 若成闭合实体且当前无活动实体 → 升为活动 shape（可继续布尔/导出）。
      const surfaces = parkedBodies.slice()
      if (surfaces.length < 1) { buildWarnings.push('缝合：冇曲面/壳体可缝 — 先做曲面放样 / 补面 / 加厚 / 偏移曲面') }
      else {
        try {
          const tol = (f.tol && f.tol > 0) ? f.tol : 1e-4
          const sew = new _oc.BRepBuilderAPI_Sewing(tol, true, true, true, false)
          let added = 0
          for (const b of surfaces) { try { sew.Add(b.shape.wrapped); added++ } catch { /* 跳过坏体 */ } }
          if (added < 1) { buildWarnings.push('缝合：无有效面可缝') }
          else {
            const prog = new _oc.Message_ProgressRange_1()
            sew.Perform(prog); prog.delete()
            const sewed = sew.SewedShape()
            const freeEdges = (typeof (sew as any).NbFreeEdges === 'function') ? (sew as any).NbFreeEdges() : -1
            if (!sewed || sewed.IsNull()) { buildWarnings.push('缝合失败（面之间太远 / 容差太细）— 曲面保持唔变') }
            else {
              const closed = freeEdges === 0
              let out: any = sewed
              if (closed) { try { const shell = _oc.TopoDS.Shell_1(sewed); const solid = new _oc.ShapeFix_Solid_1().SolidFromShell(shell); if (solid && !solid.IsNull()) out = solid } catch { /* 转实体失败 → 保留壳 */ } }
              const sewn = cast(out)
              const isSolid = (() => { try { return out.ShapeType && out.ShapeType() === _oc.TopAbs_ShapeEnum.TopAbs_SOLID } catch { return false } })()
              if (isSolid && !shape) { shape = sewn; parkedBodies = []; buildWarnings.push(`缝合成闭合实体（${surfaces.length} 张曲面 → 实体，已设为活动体）`) }
              else { parkedBodies = [{ name: isSolid ? '缝合实体' : '缝合壳', shape: sewn }]; buildWarnings.push(closed ? `缝合成闭合${isSolid ? '实体' : '壳'}（${surfaces.length} 张曲面）` : `缝合成开放壳（${surfaces.length} 张曲面，${freeEdges < 0 ? '有' : freeEdges} 条自由边未闭合）`) }
            }
          }
        } catch (e) { buildWarnings.push('缝合失败：' + ((e as any)?.message || e)) }
      }
    } else if (f.type === 'surfunstitch') {
      // S88 取消缝合 Unstitch：把每个曲面/壳体拆回逐张独立面（缝合逆操作）。每面 cast(face.wrapped)
      // 成独立 shape（有 clone，可入快照/渲染）。
      const src = parkedBodies.slice()
      if (!src.length) { buildWarnings.push('取消缝合：冇曲面/壳体可拆（先缝合或做曲面）') }
      else {
        const out: { name: string; shape: any }[] = []
        for (const b of src) {
          try {
            const faces = (b.shape as any).faces as any[]
            if (faces && faces.length > 1) { for (const fc of faces) { try { out.push({ name: `面${out.length + 1}`, shape: cast(fc.wrapped) }) } catch { /* 跳过坏面 */ } } }
            else out.push(b)   // 单面/拆唔到 → 原样保留
          } catch { out.push(b) }
        }
        parkedBodies = out
        buildWarnings.push(`取消缝合：拆成 ${out.length} 张独立面`)
      }
    } else if (f.type === 'surfextrude') {
      // S89 曲面拉伸：截面 wire 沿法向 complexExtrude(shellMode) → 壳（开放草图=sheet / 闭合草图=无盖 tube）。
      // 出 parked 曲面体（唔强转实体；要实体用「加厚」或「缝合」）。
      try {
        const plane = f.plane || 'XY'
        const baseZ = f.baseZ || 0
        const h0 = f.height || 10
        // S162：方向 — down 反向（对称时忽略，因对称本身居中）；对称 = 拉全 h 再沿法向移 -h/2 居中喺草图面（镜 solid extrude:1217/1243）
        const dn = (f.down && !f.symmetric) ? -1 : 1
        const h = h0 * dn
        const nrm: [number, number, number] = plane === 'XZ' ? [0, h, 0] : plane === 'YZ' ? [h, 0, 0] : [0, 0, h]
        const ctr: [number, number, number] = plane === 'XZ' ? [0, baseZ, 0] : plane === 'YZ' ? [baseZ, 0, 0] : [0, 0, baseZ]
        let wire: any
        if (f.open && f.profile.kind === 'poly' && f.profile.pts && f.profile.pts.length >= 2) {
          const pts = f.profile.pts
          let pen = draw([pts[0][0], pts[0][1]])
          const sm = (f.profile as { smooth?: boolean }).smooth && pts.length >= 3   // S177：开放 smooth 截面（圆锥曲线/样条）走 smoothSplineTo 拟合真平滑边，唔好 lineTo 出 facet
          if(f.profile.earc)pen=ellipseArcProfilePen(f.profile.earc)
          else if(f.profile.cubics?.length)pen=cubicProfilePen(f.profile.cubics)
          else for (let i = 1; i < pts.length; i++) pen = sm ? pen.smoothSplineTo([pts[i][0], pts[i][1]]) : pen.lineTo([pts[i][0], pts[i][1]])
          wire = (pen.done().sketchOnPlane(plane, baseZ) as any).wire   // 开放折线 → 开放 wire（.done 非 .close）
        } else {
          wire = (profileToSketch(f.profile, baseZ, plane) as any).wire   // 闭合截面 → 闭合 wire（无盖 tube）
        }
        const res: any = complexExtrude(wire, ctr, nrm, undefined, true)   // shellMode → [shell, w1, w2]
        let shell = Array.isArray(res) ? res[0] : res
        if (shell && shell.wrapped && !shell.wrapped.IsNull()) {
          if (f.symmetric) { const o = -h0 / 2; const t: [number, number, number] = plane === 'XZ' ? [0, o, 0] : plane === 'YZ' ? [o, 0, 0] : [0, 0, o]; shell = shell.translate(t[0], t[1], t[2]) }
          parkedBodies.push({ name: '拉伸曲面', shape: shell })
        } else buildWarnings.push('曲面拉伸失败（截面无效）')
      } catch (e) { buildWarnings.push('曲面拉伸失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'surfsweep') {
      // S曲面 曲面扫掠：开放截面 wire 沿你画的开放路径 spine 做 genericSweep → 零厚开放曲面壳（风道/导流板/管壁皮）。
      // 出 parked 曲面体（唔强转实体；要实体用「加厚」或「缝合」）。开放截面镜 surfextrude:1738-1742 .done() 开放 wire；
      // spine 镜 solid-sweep:2233-2238 由 f.path 喺 XY 砌折线 wire。genericSweep 已 import（worker:8）、用 6 次。
      try {
        const plane = f.plane || 'XY'
        const baseZ = f.baseZ || 0
        // 开放截面 wire（.done 非 .close → 零厚开放壳）；闭合轮廓 → profileToSketch（无盖管壳皮）
        let profWire: any
        if (f.profile.kind === 'poly' && f.profile.pts && f.profile.pts.length >= 2) {
          const pts = f.profile.pts
          let pen = draw([pts[0][0], pts[0][1]])
          const sm = (f.profile as { smooth?: boolean }).smooth && pts.length >= 3   // S177：smooth 截面（圆锥曲线/样条）走 smoothSplineTo
          if(f.profile.earc)pen=ellipseArcProfilePen(f.profile.earc)
          else if(f.profile.cubics?.length)pen=cubicProfilePen(f.profile.cubics)
          else for (let i = 1; i < pts.length; i++) pen = sm ? pen.smoothSplineTo([pts[i][0], pts[i][1]]) : pen.lineTo([pts[i][0], pts[i][1]])
          profWire = (pen.done().sketchOnPlane(plane, baseZ) as any).wire
        } else {
          profWire = (profileToSketch(f.profile, baseZ, plane) as any).wire
        }
        // spine：优先 path3（真 3D 脊线），否则 f.path 喺 XY 砌折线（镜 solid sweep:2233-2238）
        let spine: any
        if (f.path3 && f.path3.length >= 2) {
          spine = assembleWire([makeBSplineApproximation(f.path3 as any)])
        } else if (f.path && f.path.length >= 2) {
          let pen = draw([f.path[0][0], f.path[0][1]])
          for (let i = 1; i < f.path.length; i++) pen = pen.lineTo([f.path[i][0], f.path[i][1]])
          spine = (pen.done().sketchOnPlane('XY') as any).wire
        } else { buildWarnings.push('曲面扫掠：路径无效（需 ≥2 点开放折线）') }
        if (spine) {
          const shell: any = genericSweep(profWire, spine, { forceProfileSpine: true } as any)
          let bbOk = false
          try { const bb = (shell as any).boundingBox.bounds as [number[], number[]]; const ext = Math.max(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]); if (Number.isFinite(ext) && ext > 1e-6 && ext < 1e6) bbOk = true } catch { /* boundingBox 抛 = 无界 */ }
          if (shell && shell.wrapped && !shell.wrapped.IsNull() && bbOk) parkedBodies.push({ name: '扫掠曲面', shape: shell })
          else buildWarnings.push('曲面扫掠失败（截面/路径无效或扫出无界形）')
        }
      } catch (e) { buildWarnings.push('曲面扫掠失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'surfrevolve') {
      // S曲面 曲面旋转：开放截面 Sketch 绕轴 .revolve → 零厚开放旋转曲面壳（灯罩/喷嘴/花瓶皮/涡轮毂）。
      // 出 parked 曲面体（唔强转实体；要实体用「加厚」或「缝合」）。开放 Sketch 镜 surfextrude:1738-1742 .done()
      // （但保留 Sketch 唔抽 .wire — Sketch.revolve 行 BRepPrimAPI_MakeRevol，开放 Sketch → 开放旋转壳）；
      // 轴 rax/rcfg 镜 solid revolve:1250-1259（axisV 归一 + axisOrigin），喂开放 Sketch 而非闭合 profileToSketch → 开放旋转面。
      try {
        const plane = f.plane || 'XY'
        const baseZ = f.baseZ || 0
        const ang = f.angle ?? 360
        // 开放截面 Sketch（.done 非 .close → 开放剖面 → 旋出零厚开放壳）；闭合轮廓 → profileToSketch（无盖旋转管壳皮）
        let revSk: any
        if (f.profile.kind === 'poly' && f.profile.pts && f.profile.pts.length >= 2) {
          const pts = f.profile.pts
          let pen = draw([pts[0][0], pts[0][1]])
          if(f.profile.earc)pen=ellipseArcProfilePen(f.profile.earc)
          else if(f.profile.cubics?.length)pen=cubicProfilePen(f.profile.cubics)
          else for (let i = 1; i < pts.length; i++) pen = pen.lineTo([pts[i][0], pts[i][1]])
          revSk = pen.done().sketchOnPlane(plane, baseZ)
        } else {
          revSk = profileToSketch(f.profile, baseZ, plane)
        }
        // 轴：镜 solid revolve（axisV 优先于世界 X/Y，归一；axisOrigin 轴上一点）
        let rax: [number, number, number] = f.axis === 'X' ? [1, 0, 0] : [0, 1, 0]
        if (f.axisV) {
          const al = Math.hypot(f.axisV[0], f.axisV[1], f.axisV[2])
          if (al < 1e-9) { buildWarnings.push('曲面旋转：轴方向为零向量 — 已用世界 Y 轴') }
          else rax = [f.axisV[0] / al, f.axisV[1] / al, f.axisV[2] / al]
        }
        // 修 blocker（对抗 verify 揪出）：直接 revolve 开放 WIRE 出零厚旋转壳。Sketch.revolve 会 makeFace(wire)
        // 先把 wire 转【面】再 MakeRevol → 出【填充实体】（闭合截面）或 makeFace 抛错（开放截面无 body）。
        // 正路：BRepPrimAPI_MakeRevol 直接食 wire → 旋转 SHELL（每条边 → 一张旋转面）= 零厚开放曲面。生 _oc 句柄经 r() 管理。
        const r = GCWithScope()
        const ow = (revSk as any).wire                                       // 开放/闭合 wire（来自 Sketch）
        const o = f.axisOrigin || [0, 0, 0]
        const ax1 = r(new (_oc as any).gp_Ax1_2(r(new (_oc as any).gp_Pnt_3(o[0], o[1], o[2])), r(new (_oc as any).gp_Dir_4(rax[0], rax[1], rax[2]))))
        const angRad = ang >= 360 ? 0 : Math.abs(ang) * Math.PI / 180
        const mr = r(angRad > 0
          ? new (_oc as any).BRepPrimAPI_MakeRevol_1(ow.wrapped, ax1, angRad, false)   // 部分角
          : new (_oc as any).BRepPrimAPI_MakeRevol_2(ow.wrapped, ax1, false))           // 完整 360°
        const rsh = mr && mr.IsDone && mr.IsDone() ? mr.Shape() : null
        const shell: any = (rsh && !rsh.IsNull()) ? cast(rsh) : null
        let bbOk = false
        try { const bb = (shell as any).boundingBox.bounds as [number[], number[]]; const ext = Math.max(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]); if (Number.isFinite(ext) && ext > 1e-6 && ext < 1e6) bbOk = true } catch { /* boundingBox 抛 = 无界 */ }
        if (shell && shell.wrapped && !shell.wrapped.IsNull() && bbOk) parkedBodies.push({ name: '旋转曲面', shape: shell })
        else buildWarnings.push('曲面旋转失败（截面无效 / 截面贴轴 / 旋出无界形）')
      } catch (e) { buildWarnings.push('曲面旋转失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'ruled') {
      // S100 规则曲面：每条开放折线 → 开放 wire（.done 非 .close），standalone loft(ruled,returnShell) → 开放直纹 Shell（纯零厚面）。
      try {
        const secs = (f.sections || []).filter((s) => s.pts.length >= 2).sort((a, b) => a.z - b.z)
        if (secs.length < 2) { buildWarnings.push('规则曲面需要 ≥2 条开放折线截面') }
        else {
          const wires = secs.map((s) => {
            let pen = draw([s.pts[0][0], s.pts[0][1]])
            for (let i = 1; i < s.pts.length; i++) pen = pen.lineTo([s.pts[i][0], s.pts[i][1]])
            return (pen.done().sketchOnPlane('XY', s.z) as any).wire
          })
          if (new Set(secs.map((s) => s.pts.length)).size > 1) buildWarnings.push('⚠ 规则曲面：各截面顶点数不一致 — ThruSections 线性配对，形状可能扭曲')
          const sheet: any = loft(wires as any, { ruled: true } as any, true as any)   // returnShell=true → 开放直纹 Shell
          if (sheet && sheet.wrapped && !sheet.wrapped.IsNull()) parkedBodies.push({ name: '规则曲面', shape: sheet })
          else buildWarnings.push('规则曲面失败（截面无效 / ThruSections 返空）')
        }
      } catch (e) { buildWarnings.push('规则曲面失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'surftrim') {
      // S100 曲面平面裁剪：用轴对齐半空间盒 intersect parked 曲面【壳】留一侧。单张散面（Face）无 .intersect → 诚实 skip。
      const t = parkedBodies[f.target]
      if (!t) { buildWarnings.push(`⚠ 平面裁剪：揾唔到目标曲面 #${f.target + 1}`) }
      else {
        try {
          const S = 2000
          let box: any
          if (f.planeOrigin && f.planeNormal) {
            // S157 任意平面裁剪：定向半空间盒。建 makeBaseBox(S,S,S)（local [0,S]³，底面 local z=0）→ X/Y 居中（−S/2）令底面盖满平面、底面留 local z=0
            // → 旋转 local +Z → keep 侧法向 n（keep=neg 则用 −normal）→ 平移底面坐 planeOrigin。复用同款 makeBaseBox + replicad .rotate(角°,中心,轴)/.translate（worker 在用）。
            // 旋转后底面通过 planeOrigin、盒朝 n 一侧延伸 S → 与下面 Common_1 ∩ 目标 = 留 planeOrigin 处 n 侧曲面。轴退化（n∥±Z）则免旋转，仅按 sign 翻 z。
            const L = Math.hypot(f.planeNormal[0], f.planeNormal[1], f.planeNormal[2]) || 1
            const sgn = f.keep === 'neg' ? -1 : 1
            const n: [number, number, number] = [sgn * f.planeNormal[0] / L, sgn * f.planeNormal[1] / L, sgn * f.planeNormal[2] / L]
            // base：makeBaseBox 已 X/Y 居中、底面 local z=0、向 +z 延 S（半空间盒，盖 +z 侧）。
            // 修 blocker（对抗 verify 揪出）：勿再 .translate(-S/2,-S/2,0) —— makeBaseBox 本身居中（见 axis path 只平移 Z），
            // 多嗰个 translate 会把盒偏到 planeOrigin 嘅 +X/+Y 角 → 错裁丢失 keep 侧约 ½~¾（bounded-but-wrong，过 bbox 闸）。
            let b = makeBaseBox(S, S, S)
            // 旋转 local +Z(=[0,0,1]) → n（绕过原点嘅轴 = cross(Z,n)，角 = acos(n·Z)）。退化（平行/反平行）特判。
            const dot = Math.max(-1, Math.min(1, n[2]))           // [0,0,1]·n
            const ax: [number, number, number] = [-n[1], n[0], 0]  // cross([0,0,1], n)
            const axL = Math.hypot(ax[0], ax[1], ax[2])
            if (axL > 1e-6) {
              const angDeg = Math.acos(dot) * 180 / Math.PI
              b = b.rotate(angDeg, [0, 0, 0], [ax[0] / axL, ax[1] / axL, ax[2] / axL])
            } else if (dot < 0) {
              // n ∥ −Z：翻 180°（绕 X 轴）令底面朝下、盒向 −z 延
              b = b.rotate(180, [0, 0, 0], [1, 0, 0])
            }
            // 把底面（现已朝 n）坐喺 planeOrigin
            box = b.translate(f.planeOrigin[0], f.planeOrigin[1], f.planeOrigin[2])
          } else {
            const sign = f.keep === 'neg' ? -1 : 1, c = f.offset + sign * S / 2
            const base = makeBaseBox(S, S, S)
            box = f.plane === 'XY' ? base.translate(0, 0, c - S / 2) : f.plane === 'XZ' ? base.translate(0, c, -S / 2) : base.translate(c, 0, -S / 2)
          }
          // 手工 BRepAlgoAPI_Common（SetArguments/SetTools/Build，直接喺 TopoDS 上做）：
          // replicad 嘅 .intersect() 假设两边都系实体，对 Shell/Face 结果做 cast 会炸（"shape.IsNull is not a function"）。
          // BOP 支持 SHELL/FACE ∩ SOLID（混维 general-fuse 语义）→ 出半空间盒内嗰一截曲面，单张面（Face）一样裁得。
          const ip = new _oc.Message_ProgressRange_1()
          const common = new _oc.BRepAlgoAPI_Common_1()
          const args = new _oc.TopTools_ListOfShape_1(); args.Append_1(t.shape.wrapped)
          const tools = new _oc.TopTools_ListOfShape_1(); tools.Append_1(box.wrapped)
          common.SetArguments(args); common.SetTools(tools)
          common.Build(ip)
          let r: any = null
          if (common.IsDone()) { const sh = common.Shape(); if (sh && !sh.IsNull()) r = cast(sh) }
          if (r && r.wrapped && !r.wrapped.IsNull()) {
            // 修 result 级有界性闸：任何无界结果逃过 IsNull → mesh 时炸 → 凭空消失。提交前验 bbox 有界（HARD FLOOR：无界 → 保持唔变）。
            let bbOk = false
            try { const bb = (r as any).boundingBox.bounds as [number[], number[]]; const ext = Math.max(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]); if (Number.isFinite(ext) && ext > 1e-6 && ext < 1e6) bbOk = true } catch { /* boundingBox 抛 = 无界 */ }
            if (bbOk) { parkedBodies[f.target] = { name: t.name, shape: r }; buildWarnings.push(f.planeOrigin && f.planeNormal ? `平面裁剪：${t.name} 已裁（任意平面 @${f.planeOrigin.map((x) => +x.toFixed(0)).join(',')}）保留${f.keep === 'neg' ? '−' : '+'}侧` : `平面裁剪：${t.name} 已裁 ${f.plane}=${f.offset} 保留${f.keep === 'neg' ? '−' : '+'}侧`) }
            else buildWarnings.push('平面裁剪失败（结果无界）— 保持唔变')
          }
          else buildWarnings.push('平面裁剪失败（平面未与曲面相交 / 结果空）— 保持唔变')
        } catch (e) { buildWarnings.push('平面裁剪失败：' + ((e as any)?.message || e)) }
      }
    } else if (f.type === 'surfsurftrim') {
      // S155 曲面-曲面裁剪：用第二张泊车曲面（tool>=0）或活动实体（tool=-1）做裁刀 imprint 分割目标曲面，
      // 留 keep 世界点最近嗰张【cell 面】。Fusion「Surface-Surface Trim」对标（你 click 边个 region 就留边个；旧 surftrim 仅轴对齐平面盒）。
      // 内核路径（无重建，复用已绑符号）：BRepAlgoAPI_BuilderAlgo（general-fuse，yml:187）把 target+tool 互相 imprint，
      // 沿交线把目标 sheet 真切成多张 cell 面（live 实证 sheet∩sheet 1→2、sheet∩solid 1→2，GFA 确切开开放 shell）。
      // S156 修 hollow 根因：旧版（a）用「质心到目标三角化【顶点】最短距」判源自目标 → coarse mesh 大平面中心离最近顶点过远 → 全 reject；
      //   （b）共顶点并查集把被交线切开嘅两半（共享切割边）误并成一片 → keep 永远返成块原面。两者皆令永不裁。
      //   新法：(a) 改【点到三角形】距（Ericson，coarse mesh 一样准）抽样多数判源自目标；(b) 丢并查集，cell = 交线分割出嘅每张面，
      //   直接留 keep 点【点到面三角】最近嗰张 cell（edge-adjacent 两半各自独立 cell，唔会误并）。单 cell（cells===1）= 裁刀未贯穿 → 诚实保持唔变。
      // 局限（诚实）：留单一 cell（对标 Fusion「点 region」交互）；多面壳目标若 keep 侧跨多 cell 只留最近一片 — 需要时再升级 barrier-edge 连通片。
      // HARD FLOOR：任何 null/空/throw / 结果 bbox 无界 / cells===1 → parkedBodies[target] 逐字节保持唔变 + 诚实 buildWarnings.push（绝不产破壳/null 现有泊车体）。
      const t = parkedBodies[f.target]
      const toolBody = f.tool >= 0 ? parkedBodies[f.tool] : null
      const toolShape = f.tool >= 0 ? (toolBody ? toolBody.shape : null) : shape
      if (!t) { buildWarnings.push(`⚠ 曲面裁剪：揾唔到目标曲面 #${f.target + 1}`) }
      else if (!toolShape || !(toolShape as any).wrapped || (toolShape as any).wrapped.IsNull()) { buildWarnings.push(`⚠ 曲面裁剪：揾唔到裁刀（${f.tool >= 0 ? `曲面 #${f.tool + 1}` : '活动实体'}）— 保持唔变`) }
      else if (!_oc || !_oc.BRepAlgoAPI_BuilderAlgo_1 || !_oc.TopTools_ListOfShape_1 || !_oc.Message_ProgressRange_1) { buildWarnings.push('⚠ 曲面裁剪需要 plus 内核（BRepAlgoAPI_BuilderAlgo 未绑定）— 已跳过，曲面保持唔变') }
      else {
        try {
          const r = GCWithScope()
          // ── 1. general-fuse：target + tool 互相 imprint（BuilderAlgo 把全部 arguments 互切；tool 唔需要系闭合实体，sheet 一样 imprint）──
          const ip = r(new _oc.Message_ProgressRange_1())
          const ba = r(new _oc.BRepAlgoAPI_BuilderAlgo_1())
          const args = r(new _oc.TopTools_ListOfShape_1())
          args.Append_1((t.shape as any).wrapped)
          args.Append_1((toolShape as any).wrapped)
          ba.SetArguments(args)
          ba.SetNonDestructive(true)
          ba.Build(ip)
          let fused: any = null
          if (ba.IsDone()) { const sh = ba.Shape(); if (sh && !sh.IsNull()) fused = cast(sh) }
          if (!fused || !fused.wrapped || fused.wrapped.IsNull()) { buildWarnings.push('曲面裁剪失败（裁刀同曲面唔相交 / general-fuse 返空）— 保持唔变') }
          else {
            try { fused.mesh({ tolerance: 0.1, angularTolerance: 0.3 }) } catch { /* 三角化供下面逐面采样 */ }
            try { (t.shape as any).mesh({ tolerance: 0.1, angularTolerance: 0.3 }) } catch { /* 原目标三角化供「源自目标」判定 */ }
            const allFaces = (fused as any).faces as any[]
            const tgtFaces = (t.shape as any).faces as any[]
            // 面 → 三角形数组（每三角 9 数 [ax,ay,az, bx,by,bz, cx,cy,cz]）
            const faceTris = (fc: any): number[][] => {
              try {
                const tri = fc.triangulation ? fc.triangulation() : null
                if (!tri || !tri.vertices || !tri.trianglesIndexes) return []
                const V = tri.vertices as number[], T = tri.trianglesIndexes as number[]
                const out: number[][] = []
                for (let i = 0; i + 2 < T.length; i += 3) { const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3; out.push([V[a], V[a + 1], V[a + 2], V[b], V[b + 1], V[b + 2], V[c], V[c + 1], V[c + 2]]) }
                return out
              } catch { return [] }
            }
            // 点 → 三角形 平方距（Ericson 最近点；coarse mesh 一样准 — 修旧版「点到顶点」对大平面的盲区）
            const ptTri2 = (px: number, py: number, pz: number, T: number[]): number => {
              const ax = T[0], ay = T[1], az = T[2], bx = T[3], by = T[4], bz = T[5], cx = T[6], cy = T[7], cz = T[8]
              const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az, apx = px - ax, apy = py - ay, apz = pz - az
              const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz
              if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz
              const bpx = px - bx, bpy = py - by, bpz = pz - bz
              const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz
              if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz
              const cpx = px - cx, cpy = py - cy, cpz = pz - cz
              const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz
              if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz
              const vc = d1 * d4 - d3 * d2
              if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); const qx = ax + v * abx - px, qy = ay + v * aby - py, qz = az + v * abz - pz; return qx * qx + qy * qy + qz * qz }
              const vb = d5 * d2 - d1 * d6
              if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); const qx = ax + w * acx - px, qy = ay + w * acy - py, qz = az + w * acz - pz; return qx * qx + qy * qy + qz * qz }
              const va = d3 * d6 - d5 * d4
              if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); const qx = bx + w * (cx - bx) - px, qy = by + w * (cy - by) - py, qz = bz + w * (cz - bz) - pz; return qx * qx + qy * qy + qz * qz }
              const denom = 1 / (va + vb + vc), v = vb * denom, w = vc * denom
              const qx = ax + abx * v + acx * w - px, qy = ay + aby * v + acy * w - py, qz = az + abz * v + acz * w - pz
              return qx * qx + qy * qy + qz * qz
            }
            const minToTris = (px: number, py: number, pz: number, tris: number[][]): number => { let m = Infinity; for (const T of tris) { const d = ptTri2(px, py, pz, T); if (d < m) m = d; if (m === 0) break } return m }
            // 目标全部三角（「源自目标」基准面集 — 用真实曲面而非 bbox，曲面亦准）
            const tgtTris: number[][] = []
            for (const tf of (tgtFaces || [])) for (const T of faceTris(tf)) tgtTris.push(T)
            let scale = 1
            try { const bb = (t.shape as any).boundingBox.bounds as [number[], number[]]; scale = Math.max(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]) || 1 } catch { scale = 1 }
            const onTol2 = Math.pow(Math.max(1e-3, scale * 2e-3), 2)
            if (!allFaces || !allFaces.length || !tgtTris.length) { buildWarnings.push('曲面裁剪失败（结果无面 / 目标无三角化）— 保持唔变') }
            else {
              // ── 2. 分类【源自目标】嘅结果面（cell）：抽样面三角质心，多数落喺目标曲面上 → 用 BOP imprint 后真实拓扑，唔靠 bbox 猜 ──
              const cells: { fc: any; tris: number[][] }[] = []
              for (const fc of allFaces) {
                const tris = faceTris(fc); if (!tris.length) continue
                const step = Math.max(1, Math.floor(tris.length / 12))
                let on = 0, tot = 0
                for (let i = 0; i < tris.length; i += step) { const T = tris[i]; const cx = (T[0] + T[3] + T[6]) / 3, cy = (T[1] + T[4] + T[7]) / 3, cz = (T[2] + T[5] + T[8]) / 3; tot++; if (minToTris(cx, cy, cz, tgtTris) <= onTol2) on++ }
                if (tot > 0 && on / tot >= 0.6) cells.push({ fc, tris })   // 落选 = 源自裁刀嘅面（唔留）
              }
              if (!cells.length) { buildWarnings.push('曲面裁剪失败（结果中无源自目标嘅面 — 裁刀可能未真正相交）— 保持唔变') }
              else if (cells.length === 1) { buildWarnings.push('曲面裁剪：裁刀未把目标切开（交线未贯穿目标）— 保持唔变') }
              else {
                // ── 3. 留 keep 世界点最近嗰张 cell 面（点到面三角最短距；cell = 交线分割出嘅区域，edge-adjacent 唔会误并）──
                let best = -1, bestD = Infinity
                for (let i = 0; i < cells.length; i++) { const d = minToTris(f.keep[0], f.keep[1], f.keep[2], cells[i].tris); if (d < bestD) { bestD = d; best = i } }
                let result: any = null
                try { result = cast(cells[best].fc.wrapped) } catch { /* cast 失败 → result 留 null，下面 fail-safe */ }
                // ── 4. result 级有界性闸：任何无界面逃过 IsNull 但 mesh 即抛 → 提交前验 bbox 有界 ──
                let bbOk = false
                if (result && result.wrapped && !result.wrapped.IsNull()) {
                  try { const bb = (result as any).boundingBox.bounds as [number[], number[]]; const ext = Math.max(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]); if (Number.isFinite(ext) && ext > 1e-6 && ext < 1e6) bbOk = true } catch { /* boundingBox 抛 = 无界 */ }
                }
                if (bbOk) { parkedBodies[f.target] = { name: t.name, shape: result }; buildWarnings.push(`曲面裁剪：${t.name} 已用${f.tool >= 0 ? `曲面 #${f.tool + 1}` : '活动实体'}裁切，保留 keep 点最近 cell（共 ${cells.length} cell）`) }
                else buildWarnings.push('曲面裁剪：保留片无界 / 返空 — 已 fail-safe 保持唔变（避免曲面消失）')
              }
            }
          }
        } catch (e) { buildWarnings.push('曲面裁剪失败：' + ((e as any)?.message || e)) }
      }
    } else if (f.type === 'untrim') {
      // S150 去裁 Untrim（surftrim 的逆）：丢弃每张面嘅裁剪边界，把面重建到底层几何曲面嘅【完整自然 UV 范围】。
      // 纯 JS / 零内核重建：对每张面 BRep_Tool.Surface_2 攞底层 Geom_Surface 句柄 → BRepBuilderAPI_MakeFace_8(surf, tol)
      // 【无 wire】over natural bounds（MakeFace_21(surf,wire) 嘅无环孪生，live worker 1854）→ ShapeFix_Face 治愈 →
      // 多面 Sewing 重组（行 surfsew idiom）。所有生 _oc 句柄经 GCWithScope r() 管理（实证未包 r() 触发 9108520）。
      // HARD FLOOR：任何一步失败 → parkedBodies[target] 逐字节保持唔变 + 诚实 buildWarning（绝不产破壳/null 现有泊车体）。
      const t = parkedBodies[f.target]
      if (!t) { buildWarnings.push(`⚠ 去裁：揾唔到目标曲面 #${f.target + 1}`) }
      else if (!_oc || !_oc.BRep_Tool || !_oc.BRepBuilderAPI_MakeFace_8) { buildWarnings.push('⚠ 去裁需要 plus 内核（BRep_Tool/BRepBuilderAPI_MakeFace 未绑定）— 已跳过，曲面保持唔变') }
      else {
        try {
          const faces = (t.shape as any).faces as any[]
          if (!faces || !faces.length) { buildWarnings.push('去裁：目标曲面冇面 — 跳过') }
          else {
            const r = GCWithScope()
            // MakeFace(无 wire) 嘅 embind overload 探测：_8(surf,TolDegen) 系裸曲面+容差孪生（首选）；防御退到 _9/裸名。
            const MF: any = (_oc as any).BRepBuilderAPI_MakeFace_8 || (_oc as any).BRepBuilderAPI_MakeFace_9 || (_oc as any).BRepBuilderAPI_MakeFace
            const tol = 1e-7
            const rebuilt: any[] = []
            let ok = 0
            for (let i = 0; i < faces.length; i++) {
              try {
                // 修 #1（blocker）：底层为【平面 Geom_Plane】= 无限自然边界 → MakeFace_8 出无界面会过 IsNull 但 mesh 时炸 → 凭空消失。
                // 平面 untrim 语义上无意义（无限片无法显示）→ 保留原（已裁）面，诚实跳过。其余无界情形由下面 result 级 bbox 闸兜底。
                if ((faces[i] as any).geomType === 'PLANE') { rebuilt.push(faces[i].wrapped); continue }
                const surfH = r(_oc.BRep_Tool.Surface_2(faces[i].wrapped))                 // Handle_Geom_Surface（GC 管理，须存活到 MakeFace 消费完）
                const surfObj = surfH ? surfH.get() : null                                 // Geom_Surface（句柄内对象）
                if (!surfObj) { rebuilt.push(faces[i].wrapped); continue }                  // 攞唔到底层曲面 → 保留原面
                const mf = r(new MF(r(new _oc.Handle_Geom_Surface_2(surfObj)), tol))        // 无 wire → 自然 UV 全边界面（MakeFace_21(surf,wire) 嘅无环孪生）
                if (!mf || !mf.IsDone()) { rebuilt.push(faces[i].wrapped); continue }       // 该面重建失败 → 保留原（已裁）面
                let fw = mf.Face()
                // ShapeFix_Face 治愈/规范化重建面（补 pcurve / 修向）。失败 → 用未治愈嘅 MakeFace 结果。
                try {
                  const SF2: any = (_oc as any).ShapeFix_Face_2
                  let sf: any
                  if (SF2) { sf = r(new SF2(fw)) }                                            // ShapeFix_Face_2(face)：构造即以面初始化（无 Init；旧码 new ()+Init 双 throw 被吞 = 治愈从未跑）
                  else { sf = r(new (((_oc as any).ShapeFix_Face_1 || (_oc as any).ShapeFix_Face))()); (sf.Init_1 ? sf.Init_1(fw) : sf.Init(fw)) }
                  sf.Perform(); const ff = sf.Face(); if (ff && !ff.IsNull()) fw = ff
                } catch { /* 治愈失败 → 用未治愈嘅 MakeFace 面 */ }
                if (fw && !fw.IsNull()) { rebuilt.push(fw); ok++ } else rebuilt.push(faces[i].wrapped)
              } catch { rebuilt.push(faces[i].wrapped) }
            }
            if (ok < 1) { buildWarnings.push('去裁失败（所有面都重建唔到自然边界 / 底层曲面无界）— 曲面保持唔变') }
            else {
              let result: any = null
              if (rebuilt.length === 1) { result = cast(rebuilt[0]) }
              else {
                // 多面：Sewing 重组（行 surfsew idiom，tol 1e-4 配 surfsew）。
                const sew = new _oc.BRepBuilderAPI_Sewing(1e-4, true, true, true, false)
                for (const fw of rebuilt) { try { sew.Add(fw) } catch { /* 跳过坏面 */ } }
                const prog = new _oc.Message_ProgressRange_1()
                sew.Perform(prog); prog.delete()
                const sewed = sew.SewedShape()
                if (sewed && !sewed.IsNull()) result = cast(sewed)
              }
              if (result && result.wrapped && !result.wrapped.IsNull()) {
                // 修 #1（blocker）result 级有界性闸：任何无限底面（无限柱/锥/拉伸面 V 向等）逃过 IsNull 但 meshOf 一 mesh 即抛 →
                // .filter(Boolean) 静默丢 → 曲面凭空消失却报「成功」。提交前用 replicad boundingBox（meshOf 同款 API）验有界 + 尺度合理。
                let bbOk = false
                try { const bb = (result as any).boundingBox.bounds as [number[], number[]]; const ext = Math.max(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]); if (Number.isFinite(ext) && ext > 1e-6 && ext < 1e6) bbOk = true } catch { /* boundingBox 抛 = 无界 */ }
                if (bbOk) {
                  parkedBodies[f.target] = { name: t.name, shape: result }
                  buildWarnings.push(`去裁：${t.name} 已还原到自然边界（${faces.length} 面，${ok} 张重建成功）`)
                } else { buildWarnings.push('去裁：重建含无界面（无限曲面）— 已 fail-safe 保持唔变（避免曲面消失）') }
              } else { buildWarnings.push('去裁失败（重建结果空 / 缝合返空）— 曲面保持唔变') }
            }
          }
        } catch (e) { buildWarnings.push('去裁失败：' + ((e as any)?.message || e)) }
      }
    } else if (f.type === 'mergefaces') {
      // S 合并面 Unify-Same-Domain：把泊车曲面/壳上同域（共面/共柱）邻面合并成单张面 —
      // trim/untrim/sew/import 后多张共面/共柱碎面合一，网格更干净、易拾、STEP 更小。
      // 复用 worker:1050 已证实 idiom：new ShapeUpgrade_UnifySameDomain_2(shape,true,true,false) → SetTolerance → Build → Shape。
      // HARD FLOOR（镜 untrim/surfsurftrim:2020）：null/throw / 结果无界 → parkedBodies[target] 逐字节保持唔变 + 诚实 buildWarning（绝不产破壳/null 现有泊车体）。
      const t = parkedBodies[f.target]
      if (!t) { buildWarnings.push(`⚠ 合并面：揾唔到目标曲面 #${f.target + 1}`) }
      else if (!_oc?.ShapeUpgrade_UnifySameDomain_2) { buildWarnings.push('⚠ 合并面需要 plus 内核（ShapeUpgrade_UnifySameDomain 未绑定）— 已跳过，曲面保持唔变') }
      else {
        try {
          const u = new _oc.ShapeUpgrade_UnifySameDomain_2(t.shape.wrapped, true, true, false)
          u.SetLinearTolerance(f.lin ?? 1e-5); u.SetAngularTolerance(f.ang ?? 0.01)
          u.Build()
          const us = u.Shape()
          let result: any = (us && !us.IsNull()) ? cast(us) : null
          // result 级有界性闸（复用 untrim/surfsurftrim:2020 idiom）：任何无界面逃过 IsNull 但 mesh 即抛 → 提交前验 bbox 有界。
          let bbOk = false
          if (result?.wrapped && !result.wrapped.IsNull()) {
            try { const bb = (result as any).boundingBox.bounds as [number[], number[]]; const ext = Math.max(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]); if (Number.isFinite(ext) && ext > 1e-6 && ext < 1e6) bbOk = true } catch { /* boundingBox 抛 = 无界 */ }
          }
          if (bbOk) { parkedBodies[f.target] = { name: t.name, shape: result }; buildWarnings.push('合并面：' + t.name + ' 已合并同域邻面') }
          else buildWarnings.push('合并面：返空 / 无界 — 已 fail-safe 保持唔变')
        } catch (e) { buildWarnings.push('合并面失败：' + ((e as any)?.message || e)) }
      }
    } else if (f.type === 'editpoles') {
      // S133 NURBS 曲面极点编辑：parked 曲面 → GeomConvert 转 B 样条 → 叠 deltas 改极点 → 保 trim 重建。
      // 行 replicad makeEllipsoid idiom（JS 驱 _oc，零内核重建）。每次重建由 loft/ruled 重导基极点再叠 deltas
      // （特征树重放 loft→editpoles，editpoles 永远读新鲜 loft 极点 → 索引一致、无漂移；UReversed 只翻法向，外观性）。
      // S133+（多面）：f.face = 编辑【哪一张 B-rep 面】（缺省 0）。多面壳：逐面 SetPole + 保 trim MakeFace_21
      // + Sewing 重组其余 N-1 张【未动】面 → 唔再用 MakeShell_2 把 N 面塌成单张全面 patch（旧 bug）。
      // 单面壳 & face===0 仍走原 MakeShell_2 分支（逐字节回放旧档）。HARD FLOOR：任何一步失败 → 保持 parkedBodies 唔变。
      const t = parkedBodies[f.target]
      if (!t) { buildWarnings.push(`⚠ 极点编辑：揾唔到目标曲面 #${f.target + 1}`) }
      else if (!_oc || !_oc.GeomConvert || !_oc.BRep_Tool) { buildWarnings.push('⚠ 极点编辑需要 plus 内核（GeomConvert/BRep_Tool 未绑定）— 已跳过') }
      else {
        try {
          const faces = (t.shape as any).faces as any[]
          if (!faces || !faces.length) { buildWarnings.push('极点编辑：目标曲面冇面 — 跳过') }
          else {
            const fi = (f.face != null && f.face >= 0 && f.face < faces.length) ? f.face : 0
            // 行 replicad makeEllipsoid idiom：GCWithScope 管理每个生 _oc 句柄（Surface_2 句柄、NurbsConvert/OuterWire/
            // MakeFace_21/Sewing/ProgressRange/ShapeFix 构建器），避免无主中间句柄喺 emscripten 上触发内核错（实证 9108520）。
            const r = GCWithScope()
            if (faces.length === 1 && fi === 0) {
              // ── 旧档逐字节回放（单面壳，无 face / face===0）──：原 SurfaceToBSplineSurface → SetPole_1 → MakeShell_2。
              const surfH = r(_oc.BRep_Tool.Surface_2(faces[0].wrapped))       // Handle_Geom_Surface（GC 管理）
              const bs = _oc.GeomConvert.SurfaceToBSplineSurface(surfH).get()  // Geom_BSplineSurface（句柄内对象，直接改）
              const pa = bs.Poles_2()                                          // TColgp_Array2OfPnt（1-based）
              const r0 = pa.LowerRow(), c0 = pa.LowerCol()
              const nu = pa.UpperRow() - r0 + 1, nv = pa.UpperCol() - c0 + 1
              let moved = 0
              for (let rr = 0; rr < nu; rr++) for (let c = 0; c < nv; c++) {
                const d = f.deltas[rr * nv + c]
                if (!d || (d[0] === 0 && d[1] === 0 && d[2] === 0)) continue
                const base = pa.Value(r0 + rr, c0 + c)                         // gp_Pnt
                bs.SetPole_1(r0 + rr, c0 + c, r(new _oc.gp_Pnt_3(base.X() + d[0], base.Y() + d[1], base.Z() + d[2])))
                moved++
              }
              const shell = cast(r(new _oc.BRepBuilderAPI_MakeShell_2(bs.UReversed(), false)).Shell())
              if (shell && shell.wrapped && !shell.wrapped.IsNull()) { parkedBodies[f.target] = { name: t.name, shape: shell }; buildWarnings.push(`极点编辑：${t.name} 改咗 ${moved} 个控制点（${nu}×${nv} 网格）`) }
              else buildWarnings.push('极点编辑失败（重建壳为空）— 保持唔变')
            } else {
              // ── 多面壳：CROSS-FACE SHARED-POLE CO-MOVE（S140）──（planar-guard NurbsConvert-FIRST，读路径同写路径一致 _nurbsNetOfFace）。
              // 旧 S139：只变形 face fi、其余 N-1 张原样 → 任何落喺共享边嘅极点一动即撕（freeEdges 升）→ HARD-FLOOR 拒。
              // 因 webcad parked 曲面（2×2 直纹片、圆柱拉伸 nu×2）冇【双内部极点】（要 nu≥3 且 nv≥3），实际几乎每个多面编辑都被拒。
              // S140 真·多面编辑：拖一个落喺【面 A／面 B 共享边】上嘅极点时，喺所有共享该极点嘅面上施加【同一世界 delta】，
              // 令共享边两侧始终重合（保 G0/C0 连续）→ Sewing 重组焊得埋（freeEdges 不升）→ N 面保留、几何真变形。
              // ① 比对邻面极点世界位（容差内）→ 揾出几何重合极点；② 同一 delta 施于跨面所有重合极点；③ 沿用既有逐面 MakeFace_21 + Sewing。
              const netFi = _nurbsNetOfFace(r, faces[fi].wrapped)
              if (!netFi) { buildWarnings.push(`极点编辑：曲面 #${f.target + 1} 面 ${fi + 1} 系平/直面（无可动极点）或退化 — 保持唔变（圆柱/锥面接缝处会被 OCCT 拆成两半，显示嘅网可能只系半边）`) }
              else {
                // 读一张面嘅极点阵 meta（1-based 索引基准）。
                const polesOf = (bs: any): { pa: any; r0: number; c0: number; nu: number; nv: number } => {
                  const pa = bs.Poles_2(); const r0 = pa.LowerRow(), c0 = pa.LowerCol()
                  return { pa, r0, c0, nu: pa.UpperRow() - r0 + 1, nv: pa.UpperCol() - c0 + 1 }
                }
                // ── (a) 抽 fi 面【被移极点】嘅基线世界位 + delta（co-move 比对基准），同时算坐标尺度供容差 ──
                const fiP = polesOf(netFi.bs)
                const moved: { x: number; y: number; z: number; d: [number, number, number] }[] = []
                let maxCoord = 1
                for (let rr = 0; rr < fiP.nu; rr++) for (let c = 0; c < fiP.nv; c++) {
                  const p = fiP.pa.Value(fiP.r0 + rr, fiP.c0 + c)
                  maxCoord = Math.max(maxCoord, Math.abs(p.X()), Math.abs(p.Y()), Math.abs(p.Z()))
                  const d = f.deltas[rr * fiP.nv + c]
                  if (d && (d[0] || d[1] || d[2])) moved.push({ x: p.X(), y: p.Y(), z: p.Z(), d })
                }
                if (!moved.length) { buildWarnings.push(`极点编辑：面 ${fi + 1} 冇位移 — 保持唔变`) }
                else {
                  // 重合容差（相对坐标尺度）：极点同源自 loft 截面，邻片共享角点本应 bit-一致；取 1e-6×尺度（远紧过 Sewing 1e-4，唔会误配）。
                  const tol = 1e-6 * maxCoord, tol2 = tol * tol
                  const matchDelta = (x: number, y: number, z: number): [number, number, number] | null => {
                    for (const m of moved) { const dx = x - m.x, dy = y - m.y, dz = z - m.z; if (dx * dx + dy * dy + dz * dz <= tol2) return m.d }
                    return null
                  }
                  // ── (b) 逐面构建：fi 用 f.deltas；其余面用「与 fi 被移极点几何重合」嘅 co-move delta。有位移 → SetPole + 保 trim MakeFace_21；无 → 原面。 ──
                  let abort = false, totalMoved = 0, comoveFaces = 0, comovePoles = 0
                  const rebuilt: any[] = new Array(faces.length)
                  for (let j = 0; j < faces.length && !abort; j++) {
                    const netJ = j === fi ? netFi : _nurbsNetOfFace(r, faces[j].wrapped)
                    if (!netJ) { rebuilt[j] = faces[j].wrapped; continue }   // 平/直邻面无对应极点 → 原样（若它共享被移边，下游 freeEdges 会升 → 拒）
                    const jp = polesOf(netJ.bs)
                    let anyMove = false
                    const setOne = (rr: number, c: number, d: [number, number, number]) => {
                      const base = jp.pa.Value(jp.r0 + rr, jp.c0 + c)
                      netJ.bs.SetPole_1(jp.r0 + rr, jp.c0 + c, r(new _oc.gp_Pnt_3(base.X() + d[0], base.Y() + d[1], base.Z() + d[2])))
                      anyMove = true
                    }
                    if (j === fi) {
                      for (let rr = 0; rr < jp.nu; rr++) for (let c = 0; c < jp.nv; c++) { const d = f.deltas[rr * jp.nv + c]; if (d && (d[0] || d[1] || d[2])) { setOne(rr, c, d); totalMoved++ } }
                    } else {
                      for (let rr = 0; rr < jp.nu; rr++) for (let c = 0; c < jp.nv; c++) { const b = jp.pa.Value(jp.r0 + rr, jp.c0 + c); const d = matchDelta(b.X(), b.Y(), b.Z()); if (d) { setOne(rr, c, d); comovePoles++ } }
                      if (anyMove) comoveFaces++
                    }
                    if (!anyMove) { rebuilt[j] = faces[j].wrapped; continue }
                    // 保 trim 重建：用该面原外环 + 改完极点嘅 B 样条面 MakeFace_21(surf, wire, Inside=true)（行 replicad makeNewFaceWithinFace）。
                    const mf = r(new _oc.BRepBuilderAPI_MakeFace_21(r(new _oc.Handle_Geom_Surface_2(netJ.bs)), netJ.ow, true))
                    if (!mf.IsDone()) { buildWarnings.push(`极点编辑：面 ${j + 1} 修剪失效（极点位移过大令旧 trim pcurve 无效）— 保持唔变`); abort = true; break }
                    const _fcast = cast(mf.Face())
                    rebuilt[j] = _fcast.wrapped
                    // 审计修复：MakeFace_21 用旧外环 trim，极点移动后旧 pcurve 失效 → 塌成【零面积面】，但 IsDone()=true 检测唔到
                    // → 被静默缝入、编辑嘅面凭空消失。验重建面网格面积：≈0 → abort（保持 parkedBodies 不变，诚实失败）。
                    let _faceArea = -1
                    try { const fm = (_fcast as any).mesh({ tolerance: 1, angularTolerance: 1 }); if (fm && fm.vertices && fm.triangles) { let a = 0; const v = fm.vertices, t = fm.triangles; for (let i = 0; i + 2 < t.length; i += 3) { const p = t[i] * 3, q = t[i + 1] * 3, w = t[i + 2] * 3; const ux = v[q] - v[p], uy = v[q + 1] - v[p + 1], uz = v[q + 2] - v[p + 2], vx = v[w] - v[p], vy = v[w + 1] - v[p + 1], vz = v[w + 2] - v[p + 2]; const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx; a += Math.hypot(cx, cy, cz) / 2 } _faceArea = a } } catch { /* mesh 失败 → 保守唔 abort */ }
                    if (_faceArea >= 0 && _faceArea < 1e-4) { buildWarnings.push(`极点编辑：面 ${j + 1} 重建后面积塌陷（旧 trim pcurve 失效）— 保持唔变`); abort = true; break }
                  }
                  if (!abort) {
                    // ── (c) 重组：Sewing [改完面 + 未动原面]（行 surfsew idiom，tol 1e-4 配 surfsew）。 ──
                    const sew = new _oc.BRepBuilderAPI_Sewing(1e-4, true, true, true, false)
                    for (let i = 0; i < faces.length; i++) sew.Add(rebuilt[i])
                    const prog = new _oc.Message_ProgressRange_1()
                    sew.Perform(prog); prog.delete()
                    let out: any = sew.SewedShape()
                    const freeEdges = (typeof (sew as any).NbFreeEdges === 'function') ? (sew as any).NbFreeEdges() : -1
                    if (!out || out.IsNull()) { buildWarnings.push(`极点编辑：面 ${fi + 1} 重组缝合为空 — 保持唔变`) }
                    else {
                      // 接受判据（S140 升级）：开放壳（直纹 ribbon／无盖管）基线本身就有自由【外】边界 → 唔可用「freeEdges>0 绝拒」。
                      // 改判「freeEdges 是否超过基线（未动壳）」：co-move 把共享边两侧一齐郁 → 内共享边焊回 → freeEdges = 基线 → 收；
                      // 若仍有共享边撕裂 → freeEdges > 基线 → HARD-FLOOR 拒，绝不产出破壳。基线只喺 freeEdges>0 时先算（水密壳 0 直收，省一次缝合）。
                      let accept = false, baseFree = -1
                      if (freeEdges < 0) accept = true                         // NbFreeEdges 不可用 → best-effort 收（注明未验证）
                      else if (freeEdges === 0) accept = true                   // 水密：全共享边焊好
                      else {
                        try {
                          const sew0 = new _oc.BRepBuilderAPI_Sewing(1e-4, true, true, true, false)
                          for (let i = 0; i < faces.length; i++) sew0.Add(faces[i].wrapped)
                          const p0 = new _oc.Message_ProgressRange_1(); sew0.Perform(p0); p0.delete()
                          baseFree = (typeof (sew0 as any).NbFreeEdges === 'function') ? (sew0 as any).NbFreeEdges() : -1
                          sew0.delete()
                        } catch { baseFree = -1 }
                        if (baseFree >= 0 && freeEdges <= baseFree) accept = true   // 唔多过基线 → 共享内边无撕（外边界本就自由）
                      }
                      if (!accept) {
                        // 撕裂：co-move 后自由边仍多过基线（有共享边焊唔埋）。绝不产出破壳：HARD-FLOOR，parkedBodies[target] 保持不变。
                        buildWarnings.push(`极点编辑：${t.name} 面 ${fi + 1}/${faces.length} 嘅极点移动撕裂咗与邻面嘅共享边（自由边 ${baseFree < 0 ? '基线未知' : baseFree}→${freeEdges}）— 已拒绝、曲面保持不变。已尝试跨面 co-move 共享极点仍未焊合（邻面可能系平/直面冇对应极点，或位移破坏 trim）。`)
                      } else {
                        // 闭合（freeEdges===0，全共享边焊好 = 水密）→ TopoDS.Shell_1 → ShapeFix_Solid.SolidFromShell。
                        if (freeEdges === 0) { try { const shell = _oc.TopoDS.Shell_1(out); const solid = new _oc.ShapeFix_Solid_1().SolidFromShell(shell); if (solid && !solid.IsNull()) out = solid } catch { /* 转实体失败 → 保留壳 */ } }
                        const sewn = cast(out)
                        if (sewn && sewn.wrapped && !sewn.wrapped.IsNull()) {
                          parkedBodies[f.target] = { name: t.name, shape: sewn }
                          const cm = comoveFaces > 0 ? `，跨面 co-move ${comoveFaces} 张邻面共 ${comovePoles} 个共享极点` : ''
                          const cont = freeEdges < 0 ? '（连续性未验证）' : freeEdges === 0 ? '；壳水密（freeEdges=0）' : `；共享边保持（freeEdges=${freeEdges}＝基线 ${baseFree}）`
                          buildWarnings.push(`极点编辑：${t.name} 面 ${fi + 1}/${faces.length} 改咗 ${totalMoved} 个控制点（${fiP.nu}×${fiP.nv} 网格）${cm}${cont}`)
                        } else buildWarnings.push(`极点编辑：面 ${fi + 1} 重组结果空 — 保持唔变`)
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (e) { buildWarnings.push('极点编辑失败：' + ((e as any)?.message || e)) }
      }
    } else if (f.type === 'surfloft') {
      // T792（S71 曲面工作流 v1）：开放折线截面「薄壳放样」— 截面喺自己平面内向两侧偏 ±wall/2 +
      // 端帽 → 闭合带状 profile → 行证实可靠嘅实体 loftWith（ThruSections）。厚度喺截面平面（XY）内
      // 量度：竖直曲面精确、斜面有 cos 损失（诚实注明喺 UI）。点解唔用 MakeOffsetShape 开壳加厚：
      // BRepOffset_MakeOffset thickening 唔喺 wasm 绑定内，开壳 offset 唔封侧边 — 带偏移零新内核 op。
      try {
        const secs = (f.sections || []).filter((s) => s.pts.length >= 2).sort((a, b) => a.z - b.z)
        if (secs.length < 2) { buildWarnings.push('曲面放样需要 ≥2 个开放折线截面') } else if (f.sheet) {
          // S181 零厚放样曲面：开放截面 → 开放 wire（.done 非 .close）→ standalone loft(returnShell=true)。
          // ruled:false 时 ThruSections 在截面间【光滑插值】（Fusion Loft 曲面输出，有切线连续感），
          // 有别于永远直纹嘅 ruled 命令。出 parked 曲面体（要实体再「加厚」/「缝合」）。镜 ruled:1942-1948 开放 wire idiom。
          const wires = secs.map((s) => {
            let pen = draw([s.pts[0][0], s.pts[0][1]])
            for (let i = 1; i < s.pts.length; i++) pen = pen.lineTo([s.pts[i][0], s.pts[i][1]])
            return (pen.done().sketchOnPlane('XY', s.z) as any).wire
          })
          if (new Set(secs.map((s) => s.pts.length)).size > 1) buildWarnings.push('⚠ 放样曲面：各截面顶点数不一致 — ThruSections 线性配对，形状可能扭曲')
          const shell: any = loft(wires as any, { ruled: !!f.ruled } as any, true as any)   // returnShell=true → 零厚开放 Shell
          if (shell && shell.wrapped && !shell.wrapped.IsNull()) parkedBodies.push({ name: '放样曲面', shape: shell })
          else buildWarnings.push('放样曲面失败（截面无效 / ThruSections 返空）')
        } else {
          const w2 = Math.max(0.1, f.wall || 2) / 2
          const band = (pts: [number, number][]): [number, number][] => {
            const n = pts.length
            // 段法向（左侧）
            const segN: [number, number][] = []
            for (let i = 0; i + 1 < n; i++) {
              const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], L = Math.hypot(dx, dy) || 1
              segN.push([-dy / L, dx / L])
            }
            // 顶点 = 真 miter：邻段法向平均归一 ÷ cos(半角)（clamp 3× 防尖角爆炸）。
            // miter 保面积（外角加嘅楔 = 内角减嘅楔）→ 壳体积 = 中线长 × 壁厚 × 层高 精确（e2e 实证）。
            const off: [number, number][] = []
            for (let i = 0; i < n; i++) {
              const a = segN[Math.max(0, i - 1)], b = segN[Math.min(segN.length - 1, i)]
              let mx = a[0] + b[0], my = a[1] + b[1]
              const ml = Math.hypot(mx, my) || 1
              mx /= ml; my /= ml
              const scale = 1 / Math.max(0.333, mx * a[0] + my * a[1])   // 1/cos(半角)，clamp 3×
              off.push([mx * w2 * scale, my * w2 * scale])
            }
            const left = pts.map((p, i) => [p[0] + off[i][0], p[1] + off[i][1]] as [number, number])
            const right = pts.map((p, i) => [p[0] - off[i][0], p[1] - off[i][1]] as [number, number])
            return [...left, ...right.reverse()]
          }
          const sks = secs.map((s) => profileToSketch({ kind: 'poly', pts: band(s.pts) }, s.z)) as any[]
          const lofted = sks[0].loftWith(sks.slice(1), { ruled: !!f.ruled })
          merge(lofted, f.op)
        }
      } catch (e) { buildWarnings.push('曲面放样失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'surfpatch') {
      // T805（S74 曲面 Patch）：拾闭合边界 3D 点 → C++ PatchWrapper（BRepOffsetAPI_MakeFilling 出曲面
      // → MakeThickSolid 加厚成薄板实体）。MakeFilling 喺 JS 唔可构造，所有重活喺 C++。失败诚实保旧形 + 警告。
      try {
        const w = (_oc as Record<string, unknown>).PatchWrapper as { FillThicken?: (pts: number[], t: number) => any } | undefined
        const pts = f.pts || []
        if (!w || !w.FillThicken) { buildWarnings.push('⚠ 曲面 Patch 需要 plus 内核 PatchWrapper（未绑定）— 已跳过') }
        else if (pts.length < 3) { buildWarnings.push('曲面 Patch 需要 ≥3 个边界点') }
        else {
          const flat: number[] = []
          for (const p of pts) flat.push(p[0], p[1], p[2])
          const res = w.FillThicken(flat, Math.max(0, f.thick || 0))
          if (res && !res.IsNull()) {
            const patch = cast(res)
            // 作为独立薄板体加入（唔强行 boolean）：补面边界多数同既有面共面，coplanar fuse 喺 OCCT
            // 极唔可靠（会静默返错块）。诚实做法 = 出独立体，用户要合并用稳阵嘅「实体布尔」。
            if (shape) parkedBodies.push({ name: '补面 Patch', shape: patch })
            else shape = patch
          } else buildWarnings.push('曲面 Patch 失败（填充/加厚唔到 — 边界唔合理或太扭）— 保持原样')
        }
      } catch (e) { buildWarnings.push('曲面 Patch 失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'surfbridge') {
      // Surface Bridge v1（记分卡 Surface 52 真缺口）：拾 2 条现有棱（活动体/泊车曲面）→ BRepOffsetAPI_ThruSections
      // 两 wire 光滑过渡面（isSolid=false / ruled=false 对称 C1）。⚠ G2 = 呢个 wasm hard-fault（tests/surface-g2-probe.mjs
      // 实证）— 永不 SetContinuity(C2)/UI 暴露。解析/HARD FLOOR/加厚/泊车 全套行 boundarypatch 同款。
      try {
        const nears = f.nears || []
        if (!_oc || !(_oc as any).BRepOffsetAPI_ThruSections || !(_oc as any).BRepBuilderAPI_MakeWire_2) {
          buildWarnings.push('⚠ 桥接面需要 plus 内核（ThruSections/MakeWire 未绑定）— 已跳过')
        } else if (nears.length !== 2) {
          buildWarnings.push('桥接面需要恰好 2 条棱（一边一条）— 保持唔变')
        } else {
          const sources: any[] = []
          if (shape && (shape as any).wrapped && !(shape as any).wrapped.IsNull()) sources.push(shape)
          for (const pb of parkedBodies) if (pb && pb.shape && (pb.shape as any).wrapped && !(pb.shape as any).wrapped.IsNull()) sources.push(pb.shape)
          type BPick = { src: any; idx: number }
          const bpicks: BPick[] = []
          const bseen = new Set<string>()
          for (const pn of nears) {
            let best: BPick | null = null, bestD = Infinity
            for (const sr of sources) {
              const hit = _edgeIndexNearestNear(sr, pn)
              if (hit.idx >= 0 && hit.d2 < bestD) { bestD = hit.d2; best = { src: sr, idx: hit.idx } }
            }
            if (best) { const key = `${sources.indexOf(best.src)}#${best.idx}`; if (!bseen.has(key)) { bseen.add(key); bpicks.push(best) } }
          }
          if (bpicks.length < 2) {
            buildWarnings.push('桥接面：两个拾点解析到同一条棱 / 解析失败 — 分开点两条唔同嘅棱')
          } else {
            const r = GCWithScope()
            const wireOf = (pk: BPick): any => {
              try {
                const e = (pk.src.edges as any[])[pk.idx]
                if (!e || !e.wrapped) return null
                const mw = r(new (_oc as any).BRepBuilderAPI_MakeWire_2(e.wrapped))
                return mw.Wire()
              } catch { return null }
            }
            const w1 = wireOf(bpicks[0]), w2 = wireOf(bpicks[1])
            if (!w1 || !w2) { buildWarnings.push('桥接面：棱转 wire 失败 — 保持唔变') }
            else {
              const ts = r(new (_oc as any).BRepOffsetAPI_ThruSections(false, false, 1e-6))   // 面输出 / 光滑（非直纹）
              ts.AddWire(w1); ts.AddWire(w2)
              ts.Build(r(new (_oc as any).Message_ProgressRange_1()))
              if (!(ts.IsDone && ts.IsDone())) { buildWarnings.push('桥接面失败（ThruSections 未收敛 — 两棱太扭/退化/方向相反）— 保持唔变') }
              else {
                const sh2 = ts.Shape()
                if (!sh2 || sh2.IsNull()) { buildWarnings.push('桥接面失败（结果空）— 保持唔变') }
                else {
                  let bridge: any = cast(sh2)
                  if (f.thick && f.thick > 1e-6 && (_oc as any).BRepOffsetAPI_MakeThickSolid) {
                    try {
                      const mts = r(new (_oc as any).BRepOffsetAPI_MakeThickSolid())
                      mts.MakeThickSolidBySimple((bridge as any).wrapped, f.thick)
                      mts.Build(r(new (_oc as any).Message_ProgressRange_1()))
                      if (mts.IsDone()) { const t2 = mts.Shape(); if (t2 && !t2.IsNull()) bridge = cast(_orientSolidOutward(t2)) }
                    } catch { buildWarnings.push(`⚠ 桥接面加厚 ${f.thick}mm 失败 — 已退回净曲面片`) }
                  }
                  let bbOk = false
                  try { const bb = (bridge as any).boundingBox.bounds as [number[], number[]]; const ext = Math.max(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]); if (Number.isFinite(ext) && ext > 1e-6 && ext < 1e6) bbOk = true } catch { /* 无界 */ }
                  if (!bbOk) { buildWarnings.push('桥接面失败（结果无界/退化）— 保持唔变') }
                  else if (shape) parkedBodies.push({ name: '桥接面', shape: bridge })
                  else shape = bridge
                }
              }
            }
          }
        }
      } catch (e) { buildWarnings.push('桥接面失败（异常）— 保持唔变：' + ((e as any)?.message || e)) }
    } else if (f.type === 'boundarypatch') {
      // S 边界补面（Boundary Patch）：拾【现有棱】（活动实体 / 泊车曲面上）→ BRepOffsetAPI_MakeFilling 填充
      //   N 边洞 / 封口，可选 G1 相切（拾边邻面可解析时用 Add_2，否则 Add_1 C0）。输出【曲面体】（parked），thick>0 顺手加厚薄板。
      //   解析：每个拾边近点（f.nears，CAD 坐标）→ 跨【活动 shape + 全部 parkedBodies】揾全局最近边（行 fillet near-point lineage：_edgeIndexNearestNear）。
      //   HARD FLOOR：拾边 <2 / 全部解析失败 / MakeFilling 未 IsDone / 结果 null·空·bbox 无界 → 逐字节保持现状 + 诚实 buildWarnings.push（绝不产破壳/null）。
      try {
        const nears = f.nears || []
        if (!_oc || !(_oc as any).BRepOffsetAPI_MakeFilling || !(_oc as any).Message_ProgressRange_1 || !(_oc as any).GeomAbs_Shape) {
          buildWarnings.push('⚠ 边界补面需要 plus 内核（BRepOffsetAPI_MakeFilling 未绑定）— 已跳过')
        } else if (nears.length < 2) {
          buildWarnings.push('边界补面需要 ≥2 条边界棱（拾少咗 — 保持唔变）')
        } else {
          // 候选源体：活动 shape（若有）+ 全部泊车体 — 拾边可落喺任一身上。
          const sources: any[] = []
          if (shape && (shape as any).wrapped && !(shape as any).wrapped.IsNull()) sources.push(shape)
          for (const pb of parkedBodies) if (pb && pb.shape && (pb.shape as any).wrapped && !(pb.shape as any).wrapped.IsNull()) sources.push(pb.shape)
          // 每个拾边近点 → 跨全部源体揾全局最近边，记 {srcShape, edgeIdx}（去重同一边）。
          type Pick = { src: any; idx: number }
          const picks: Pick[] = []
          const seen = new Set<string>()
          for (let pi = 0; pi < nears.length; pi++) {
            const p = nears[pi]
            let best: Pick | null = null, bestD = Infinity
            for (let si = 0; si < sources.length; si++) {
              const sr = sources[si]
              const hit = _edgeIndexNearestNear(sr, p)   // {idx, d2}；同 fillet 选边口径
              if (hit.idx >= 0 && hit.d2 < bestD) { bestD = hit.d2; best = { src: sr, idx: hit.idx } }
            }
            if (best) { const key = `${sources.indexOf(best.src)}#${best.idx}`; if (!seen.has(key)) { seen.add(key); picks.push(best) } }
          }
          if (picks.length < 2) {
            buildWarnings.push('边界补面：拾边解析唔到足够棱（≥2）— 保持唔变')
          } else {
            const r = GCWithScope()
            // MakeFilling 默认构造未导出 → 试无参，再退回 10 参 OCCT 默认值（Degree=3,NbPtsOnCur=15,NbIter=2,Anisotropie=false,Tol2d=1e-5,Tol3d=1e-4,TolAng=1e-2,TolCurv=0.1,MaxDeg=8,MaxSeg=9）。
            const MF = (_oc as any).BRepOffsetAPI_MakeFilling
            let fill: any = null
            try { fill = r(new MF()) }
            catch { try { fill = r(new MF(3, 15, 2, false, 1e-5, 1e-4, 1e-2, 0.1, 8, 9)) } catch (ce) { buildWarnings.push('边界补面：MakeFilling 构造失败 — ' + ((ce as any)?.message || ce)) } }
            if (fill) {
              const C0 = (_oc as any).GeomAbs_Shape.GeomAbs_C0
              const G1 = (_oc as any).GeomAbs_Shape.GeomAbs_G1
              // 拾边邻面（供 G1）：喺同源体揾返一张包含该边（边中点落喺面三角附近）嘅面。揾唔到 → 退 C0。
              const adjacentFace = (src: any, edgeIdx: number): any => {
                try {
                  const e = (src.edges as any[])[edgeIdx]; if (!e) return null
                  const m = e.pointAt(0.5); const mp: [number, number, number] = [m.x, m.y, m.z]
                  const faces = src.faces as any[]; if (!faces || !faces.length) return null
                  let bf: any = null, bd = Infinity
                  for (const fc of faces) {
                    const tri = fc.triangulation ? fc.triangulation() : null
                    if (!tri || !tri.vertices || !tri.trianglesIndexes) continue
                    const V = tri.vertices as number[], T = tri.trianglesIndexes as number[]; let dmin = Infinity
                    for (let j = 0; j + 2 < T.length; j += 3) { const a = T[j] * 3, b = T[j + 1] * 3, c = T[j + 2] * 3; const dd = ptTriDist2(mp[0], mp[1], mp[2], V[a], V[a + 1], V[a + 2], V[b], V[b + 1], V[b + 2], V[c], V[c + 1], V[c + 2]); if (dd < dmin) dmin = dd }
                    if (dmin < bd) { bd = dmin; bf = fc }
                  }
                  // 边中点须真贴该面（容差按源体尺度）；过远 → 当揾唔到。
                  let scale = 1; try { const bb = src.boundingBox.bounds as [number[], number[]]; scale = Math.max(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]) || 1 } catch { scale = 1 }
                  return (bf && bd <= Math.pow(Math.max(1e-2, scale * 5e-3), 2)) ? bf : null
                } catch { return null }
              }
              let added = 0
              for (const pk of picks) {
                try {
                  const e = (pk.src.edges as any[])[pk.idx]; if (!e || !e.wrapped) continue
                  let usedG1 = false
                  if (f.tangent) {
                    const fc = adjacentFace(pk.src, pk.idx)
                    if (fc && fc.wrapped) {
                      try { fill.Add_2(e.wrapped, fc.wrapped, G1, true); usedG1 = true; added++ } catch { /* 退 C0 */ }
                    }
                  }
                  if (!usedG1) { fill.Add_1(e.wrapped, C0, true); added++ }
                } catch { /* 单条边加唔到 — 跳过，继续其余 */ }
              }
              if (added < 2) { buildWarnings.push('边界补面：成功加入嘅边界棱 <2（边界唔成环 / 太退化）— 保持唔变') }
              else {
                fill.Build(r(new (_oc as any).Message_ProgressRange_1()))
                if (!fill.IsDone()) { buildWarnings.push('边界补面失败（MakeFilling 未收敛 — 边界唔成闭环 / 太扭）— 保持唔变') }
                else {
                  // #15 真 G1（改核心版）：若拾 tangent 且 modified 内核有 PlateWrapper.BridgeG1 → 尝试用 GeomPlate 真 G1 相切面【取代】
                  //   MakeFilling 嘅假 G1（Add_2「接受不求解」）。★几何理智闸★：GeomPlate 未收敛时会剧烈过冲（实测锥顶盖 z 跨度 242mm）→
                  //   只当真 G1 结果嘅 bbox 与 MakeFilling 有界参考包络【相当】先收货，否则退回 MakeFilling（安全：cad2 几何永不劣于 cad；
                  //   内核收敛调好后自动启用真 G1）。cad（原内核）无 PlateWrapper → 直接落 fill.Shape()（byte-compat，逐字节现行行为）。
                  let sh: any = null
                  const PW = (_oc as any).PlateWrapper
                  if (f.tangent && PW && PW.BridgeG1) {
                    try {
                      const edgeW: any[] = [], faceW: any[] = []
                      for (const pk of picks) { const e = (pk.src.edges as any[])[pk.idx]; if (e && e.wrapped) { edgeW.push(e.wrapped); const fc = adjacentFace(pk.src, pk.idx); faceW.push(fc && fc.wrapped ? fc.wrapped : null) } }
                      if (edgeW.length >= 2) {
                        // ★nbIter=1★：实测 GeomPlate 变分迭代对切线补面【发散】(nbIter≥3 → 缓喇叭拱 2.9→27mm、陡锥 10→131mm 爆冲)；
                        //   nbIter=1 时首个 Newton 步即落喺极小曲面附近，缓/陡案例都出乾净有界拱（缓 2.9mm、陡 10mm）。配合种子面 + 理智闸。
                        const pr = PW.BridgeG1(edgeW, faceW, true, 3, 15, 1, 1e-4, 1e-2)
                        if (pr && !pr.IsNull()) {
                          // 理智闸：真 G1 bbox 各维 extent ≤ MakeFilling 参考 extent + 参考对角*0.6（容许适度拱起，拒收 ±100mm 过冲）
                          let sane = false
                          try {
                            const a = (cast(pr) as any).boundingBox.bounds as [number[], number[]]
                            const b = (cast(fill.Shape()) as any).boundingBox.bounds as [number[], number[]]
                            const ex = (bb: [number[], number[]], i: number) => bb[1][i] - bb[0][i]
                            const refDiag = Math.hypot(ex(b, 0), ex(b, 1), ex(b, 2)) || 1
                            sane = [0, 1, 2].every(i => Number.isFinite(a[0][i]) && Number.isFinite(a[1][i]) && ex(a, i) <= ex(b, i) + refDiag * 0.6 + 1)
                          } catch { sane = false }
                          if (sane) { sh = pr; buildWarnings.push('✓ 边界补面：GeomPlate 真 G1 相切面（改核心内核，已过理智闸）') }
                          else buildWarnings.push('△ 边界补面：真 G1 结果过冲/未收敛 → 退回 MakeFilling（安全，几何与 cad 一致）')
                        }
                      }
                    } catch { /* 落 MakeFilling */ }
                  }
                  if (!sh) sh = fill.Shape()
                  if (!sh || sh.IsNull()) { buildWarnings.push('边界补面失败（填充结果空）— 保持唔变') }
                  else {
                    let patch: any = cast(sh)
                    // thick>0 顺手加厚成实体薄板（行 PatchWrapper.FillThicken 同款 MakeThickSolidBySimple；失败诚实退回净曲面）。
                    if (f.thick && f.thick > 1e-6 && (_oc as any).BRepOffsetAPI_MakeThickSolid) {
                      try {
                        const mts = r(new (_oc as any).BRepOffsetAPI_MakeThickSolid())
                        mts.MakeThickSolidBySimple((patch as any).wrapped, f.thick)
                        mts.Build(r(new (_oc as any).Message_ProgressRange_1()))
                        if (mts.IsDone()) { const ts = mts.Shape(); if (ts && !ts.IsNull()) patch = cast(_orientSolidOutward(ts)) }   // 审计修复：MakeThickSolid 反转 → 定向归正
                      } catch { buildWarnings.push(`⚠ 边界补面加厚 ${f.thick}mm 失败 — 已退回净曲面片`) }
                    }
                    // result 级有界性闸（行 surftrim:1899）：无界结果逃过 IsNull → mesh 时炸 → 凭空消失。提交前验 bbox 有界。
                    let bbOk = false
                    try { const bb = (patch as any).boundingBox.bounds as [number[], number[]]; const ext = Math.max(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]); if (Number.isFinite(ext) && ext > 1e-6 && ext < 1e6) bbOk = true } catch { /* boundingBox 抛 = 无界 */ }
                    if (!bbOk) { buildWarnings.push('边界补面失败（结果无界 / 退化）— 保持唔变') }
                    else if (shape) parkedBodies.push({ name: '边界补面', shape: patch })
                    else shape = patch
                  }
                }
              }
            }
          }
        }
      } catch (e) { buildWarnings.push('边界补面失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'sweep' && f.path3 && f.path3.length >= 2) {
      // TRUE 3D sweep path (climbing pipes / stair handrails / drain runs): smooth B-spline spine through
      // the 3D points (same proven kernel route as the conical spring), profile circle seated on a plane
      // at the start point with its normal along the start tangent.
      const pts3 = f.path3
      const swTwist = f.twist || 0, swScale = (f.scale == null || f.scale === 1) ? 1 : f.scale
      const makeTube3 = (rad: number, plain = false): any => {
        const spine = assembleWire([makeBSplineApproximation(pts3 as any)])
        // S：沿 3D 路径 twist 扭转 / 末端 scale 缩放（解锁 replicad GenericSweepConfig 封死嘅缺口）—
        // 走裸 MakePipeShell 多 section RMF（sweepTwist.ts，Node 实证直/弧 spine 体积精确）。twist=0&scale=1 ⇒ 行旧 genericSweep 逐字节回放。
        // plain=true 强制行普通扫掠（twist/缩放失败 / 返无界几何时退回，gotcha e）。
        if (!plain && (swTwist || swScale !== 1)) {
          return frameTwistTaperSweep(_oc, (spine as any).wrapped,
            (plane: any) => ((f.profile ? profileToDrawing(f.profile) : drawCircle(rad)).sketchOnPlane(plane) as any).wire,
            { twistDeg: swTwist, scaleEnd: swScale })
        }
        const t0raw = [pts3[1][0] - pts3[0][0], pts3[1][1] - pts3[0][1], pts3[1][2] - pts3[0][2]]
        const L0 = Math.hypot(t0raw[0], t0raw[1], t0raw[2]) || 1
        const t0 = [t0raw[0] / L0, t0raw[1] / L0, t0raw[2] / L0]
        // any unit vector ⊥ t0 as the plane xDir (pick the world axis least aligned with t0)
        const ref = Math.abs(t0[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
        const xdRaw = [ref[1] * t0[2] - ref[2] * t0[1], ref[2] * t0[0] - ref[0] * t0[2], ref[0] * t0[1] - ref[1] * t0[0]]
        const Lx = Math.hypot(xdRaw[0], xdRaw[1], xdRaw[2]) || 1
        const xd = [xdRaw[0] / Lx, xdRaw[1] / Lx, xdRaw[2] / Lx]
        const pl = new RPlane(pts3[0] as any, xd as any, t0 as any)
        const prof = (f.profile ? profileToDrawing(f.profile) : drawCircle(rad)).sketchOnPlane(pl) as any
        // GM-3DV1 S5：orient=parallel → 唔强制截面⊥脊线（forceProfileSpineOthogonality:false，Fusion Parallel 观感 — 截面保初始朝向）。
        // 缺省/perp → 逐字节旧调用（forceProfileSpine 系旧仓 no-op key，保留唔改 → 旧档几何字节一致）。
        return genericSweep(prof.wire, spine, (f.orient === 'parallel' ? { forceProfileSpineOthogonality: false } : { forceProfileSpine: true }) as any)
      }
      let swept3: any, plain3 = false
      try {
        swept3 = makeTube3(f.r)
        if (swTwist || swScale !== 1) {   // twist/缩放可能产无界/退化几何 → bbox 有界闸（gotcha e），失败抛去下面退回普通扫掠
          let bbOk = false
          try { const bb = swept3.boundingBox.bounds; const ext = Math.max(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]); if (Number.isFinite(ext) && ext > 1e-6 && ext < 1e6) bbOk = true } catch { /* boundingBox 失败当无界 */ }
          if (!bbOk) throw new Error('twist/缩放返无界或退化几何')
        }
      } catch (e) {
        if (swTwist || swScale !== 1) { buildWarnings.push(`⚠ 3D 扫掠 twist/缩放失败（${(e as Error)?.message || e}）— 已退回普通扫掠`); swept3 = makeTube3(f.r, true); plain3 = true }
        else throw e
      }
      if (!f.profile && f.wall && f.wall > 0 && f.wall < f.r) {
        try { swept3 = swept3.cut(makeTube3(f.r - f.wall, plain3)) }
        catch { buildWarnings.push(`⚠ 3D 扫掠空心壁 ${f.wall}mm 失败，已退回实心（试减壁厚或加大半径）`) }
      }
      merge(swept3, f.op)
    } else if (f.type === 'sweep') {
      // Rebuild the spine sketch per sweep — sweepSketch consumes its Sketch, so a hollow pipe (outer − inner)
      // needs two independent spines, not one reused.
      const makeSpine = (): any => {
        if (f.path && f.path.length >= 2) {
          let pen = draw([f.path[0][0], f.path[0][1]])
          // smoothPath → fit a smooth B-spline through the path points (flowing tube round bends) vs sharp kinks.
          if (f.smoothPath && f.path.length >= 3) for (let i = 1; i < f.path.length; i++) pen = pen.smoothSplineTo([f.path[i][0], f.path[i][1]])
          else for (let i = 1; i < f.path.length; i++) pen = pen.lineTo([f.path[i][0], f.path[i][1]])
          return pen.done().sketchOnPlane('XY')
        }
        return draw([0, 0]).ellipseTo([60, 60], 60, 60).done().sketchOnPlane('XZ')
      }
      // T742 任意草图截面（Fusion 同款）：sweepSketch 回调用 profileToDrawing 替 drawCircle —
      // 截面草图以自身原点对齐路径起点、垂直于路径方向（圆管同款放置规则）。
      // T755 导轨（auxiliarySpine，Fusion guide rail 同款）：截面沿路径行进时跟住导轨转向/定向。
      // 导轨 wire 每次新建（同 spine 一样唔好重用）；导轨扫掠失败 → 退回普通扫掠 + 诚实警告。
      // T755 导轨扫掠 — raw MakePipeShell + CurvilinearEquivalence=TRUE（弧长比例对应）。
      // replicad 嘅 auxiliarySpine 写死 false（投影对应）— 任意长度/形状嘅用户导轨好易投影出界直接炸；
      // true 模式按弧长比例配对，先系 Fusion guide rail 嘅语义。失败退回普通扫掠 + 诚实警告。
      const guidedTube = (rad: number): any => {
        const g = f.guide!
        let gp = draw([g[0][0], g[0][1]])
        for (let i = 1; i < g.length; i++) gp = gp.lineTo([g[i][0], g[i][1]])
        const guideW = (gp.done().sketchOnPlane('XY') as any).wire
        const spineW = (makeSpine() as any).wire
        // 截面喺 spine 起点、垂直行进方向（同 makeTube3 同款手工 frame：ref 拣最唔贴 t0 嘅世界轴）
        const p = f.path!
        const tRaw = [p[1][0] - p[0][0], p[1][1] - p[0][1], 0]
        const Lt = Math.hypot(tRaw[0], tRaw[1]) || 1
        const t0 = [tRaw[0] / Lt, tRaw[1] / Lt, 0]
        const ref = Math.abs(t0[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
        const xdR = [ref[1] * t0[2] - ref[2] * t0[1], ref[2] * t0[0] - ref[0] * t0[2], ref[0] * t0[1] - ref[1] * t0[0]]
        const Lx = Math.hypot(xdR[0], xdR[1], xdR[2]) || 1
        const pl = new RPlane([p[0][0], p[0][1], 0] as any, [xdR[0] / Lx, xdR[1] / Lx, xdR[2] / Lx] as any, t0 as any)
        const profW = ((f.profile ? profileToDrawing(f.profile) : drawCircle(rad)).sketchOnPlane(pl) as any).wire
        const b = new _oc.BRepOffsetAPI_MakePipeShell(spineW.wrapped)
        b.SetMode_5(guideW.wrapped, true, _oc.BRepFill_TypeOfContact.BRepFill_NoContact)
        b.Add_1(profW.wrapped, false, true)
        b.Build(new _oc.Message_ProgressRange_1())
        b.MakeSolid()
        return cast(b.Shape())
      }
      const swTwist = f.twist || 0, swScale = (f.scale == null || f.scale === 1) ? 1 : f.scale
      const tube = (rad: number, useGuide = true, plain = false): any => {
        // S：twist 扭转 / 末端 scale 缩放（裸 MakePipeShell 多 section RMF，sweepTwist.ts）。twist=0&scale=1 ⇒ 行旧路径逐字节回放。
        // plain=true 强制普通扫掠（twist/缩放失败 / 返无界几何退回，gotcha e）。
        if (!plain && (swTwist || swScale !== 1)) {
          const spineW = (makeSpine() as any).wire
          // S：twist/缩放 + 导轨【同用】—— 导轨 wire 传入 frameTwistTaperSweep，每站截面朝向导轨点（投影⊥切向），
          // twist 叠加其上（纯 frame 数学 + 既有 Add_1 路径，无 SetMode_5 冲突）。Node 实证 tests/sweeptwist-guide.test.mjs 5/5。
          let guideWrapped: any = undefined
          if (useGuide && f.guide && f.guide.length >= 2) {
            let gp = draw([f.guide[0][0], f.guide[0][1]])
            for (let i = 1; i < f.guide.length; i++) gp = gp.lineTo([f.guide[i][0], f.guide[i][1]])
            guideWrapped = (gp.done().sketchOnPlane('XY') as any).wire.wrapped
          }
          return frameTwistTaperSweep(_oc, spineW.wrapped,
            (plane: any) => ((f.profile ? profileToDrawing(f.profile) : drawCircle(rad)).sketchOnPlane(plane) as any).wire,
            { twistDeg: swTwist, scaleEnd: swScale }, guideWrapped)
        }
        return useGuide && f.guide && f.guide.length >= 2 && f.path && f.path.length >= 2
          ? guidedTube(rad)
          // GM-3DV1 S5：orient=parallel → forceProfileSpineOthogonality:false（截面保初始朝向）。缺省/perp → 传 undefined = replicad sweepSketch 缺省（orthogonality true）= 逐字节旧行为。
          : makeSpine().sweepSketch((plane: any, origin: any) =>
            (f.profile ? profileToDrawing(f.profile) : drawCircle(rad)).sketchOnPlane(plane, origin), f.orient === 'parallel' ? { forceProfileSpineOthogonality: false } as any : undefined)
      }
      let swept: any, plain2 = false
      try { swept = tube(f.r) }
      catch (e) {
        if (f.guide && f.guide.length >= 2) { buildWarnings.push(`⚠ 导轨扫掠失败（${(e as Error)?.message || e}）— 已退回普通扫掠`); swept = tube(f.r, false) }
        else if (swTwist || swScale !== 1) { buildWarnings.push(`⚠ 扫掠 twist/缩放失败（${(e as Error)?.message || e}）— 已退回普通扫掠`); swept = tube(f.r, false, true); plain2 = true }
        else throw e
      }
      // twist/缩放 bbox 有界闸（gotcha e）：返无界/退化几何 → 退回普通扫掠
      if ((swTwist || swScale !== 1) && !plain2) {
        let bbOk = false
        try { const bb = swept.boundingBox.bounds; const ext = Math.max(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]); if (Number.isFinite(ext) && ext > 1e-6 && ext < 1e6) bbOk = true } catch { /* boundingBox 失败当无界 */ }
        if (!bbOk) { buildWarnings.push('⚠ 扫掠 twist/缩放返无界或退化几何 — 已退回普通扫掠'); swept = tube(f.r, false, true); plain2 = true }
      }
      // wall>0 → hollow pipe: subtract an inner tube (r − wall) swept along the same spine (导管/水管/扶手/线管).
      if (!f.profile && f.wall && f.wall > 0 && f.wall < f.r) {
        try { swept = swept.cut(tube(f.r - f.wall, true, plain2)) }
        catch { buildWarnings.push(`⚠ 扫掠空心壁 ${f.wall}mm 失败，已退回实心（试减壁厚或加大半径）`) }
      }
      merge(swept, f.op)
    } else if (f.type === 'coil') {
      // Adjacent turns collide when pitch < wire diameter (2·wireR) → self-intersecting sweep (bad mesh/print).
      if (f.pitch < 2 * f.wireR) buildWarnings.push(`⚠ 弹簧节距 ${f.pitch}<线径 ${(2 * f.wireR).toFixed(1)}：相邻圈会相碰/自交，加大节距或减细线径`)
      const profile = drawCircle(f.wireR).sketchOnPlane('XZ', [f.radius, 0]) as any
      if (f.r2 != null && Math.abs(f.r2 - f.radius) > 1e-6) {
        // Conical / tapered spring: a variable-radius helix can't come from makeHelix, so sample a 3D
        // point cloud r(t)=lerp(radius,r2) along the turns and fit a smooth B-spline spine, then sweep.
        const turns = Math.max(0.2, f.height / Math.max(0.1, f.pitch))
        const steps = Math.max(32, Math.ceil(turns * 32))
        const pts: [number, number, number][] = []
        for (let i = 0; i <= steps; i++) { const t = i / steps, th = 2 * Math.PI * turns * t, r = f.radius + (f.r2 - f.radius) * t; pts.push([r * Math.cos(th), r * Math.sin(th), f.height * t]) }
        const spine = assembleWire([makeBSplineApproximation(pts)])
        merge(genericSweep(profile.wire, spine, { forceProfileSpine: true } as any), f.op)
      } else {
        const helix = makeHelix(f.pitch, f.height, f.radius)
        merge(genericSweep(profile.wire, helix, { forceProfileSpine: true } as any), f.op)
      }
    } else if (f.type === 'thread') {
      // Real external thread (ISO-style): a triangular tooth section swept up a helix
      // (BRepOffsetAPI_MakePipeShell via replicad genericSweep) over a core shaft. d = major/crest Ø.
      const Rcrest = Math.max(1, f.d / 2)
      const P = Math.max(0.3, f.pitch)
      const H = Math.max(P, f.height)
      const depth = Math.min(P * 0.6, Rcrest * 0.45)     // tooth depth, capped so it never eats the whole shaft
      const Rcore = Math.max(0.5, Rcrest - depth)
      const eps = Math.max(0.4, depth * 0.4)             // tooth base sunk into the core
      const kAx = 0.85                                    // tooth axial fraction of pitch (<1 → flat root gap)
      const hext = 1                                      // helix overhang past each core end (pitches)
      const z0 = -hext * P
      const core = drawCircle(Rcore).sketchOnPlane('XY').extrude(H) as any
      // Helix overhangs the core both ends so its flat sweep caps land in air; the core's flat ends then
      // truncate the threads cleanly when the ridge is trimmed to [0,H].
      const helix = makeHelix(P, H + 2 * hext * P, Rcore, [0, 0, z0]) as any
      // Triangle in the axial (XZ) plane at the helix START (Rcore,0,z0): base just inside the core,
      // apex at the crest radius. MakePipeShell needs the profile on the spine start → origin z = z0.
      let rod = core
      try {
        const tri = draw([-eps, -kAx * P / 2]).lineTo([-eps, kAx * P / 2]).lineTo([depth, 0]).close().sketchOnPlane('XZ', [Rcore, z0]) as any
        let ridge = genericSweep(tri.wire, helix, { forceProfileSpine: true } as any)
        try { ridge = ridge.intersect(makeBaseBox(4 * Rcrest, 4 * Rcrest, H) as any) } catch { /* keep untrimmed if the cut fails */ }
        // Fusing a helical ridge onto the cylinder yields a face BRepMesh can't triangulate in this
        // OCCT-wasm build; a compound of the two independently-meshable solids renders as one rod and
        // exports as overlapping watertight shells (valid for STL / 3D-printing).
        rod = makeCompound([core, ridge])
      } catch (e) { buildWarnings.push('螺纹生成失败（已退回光轴）：' + ((e as any)?.message || e)) }
      merge(rod, f.op)
    } else if (f.type === 'othread' && shape) {
      // T775：面加外螺纹 — 牙底 = 所拣圆柱面半径 r=d/2，三角牙向【外】（thread 嘅外向牙 + ithread 嘅
      // wrap-at-position 思路合体）。compound 叠加唔做布尔（螺旋面 fuse 炸 BRepMesh — 既有教训）。
      // P2 Cosmetic：外观螺纹 — B-rep 零触碰（牙由 client CosmeticThreadOverlay 画螺旋线圈）
      if (!f.cosmetic) try {
        const r = Math.max(0.5, f.d / 2)
        const P = Math.max(0.3, f.pitch)
        const H = Math.max(P, f.height)
        const depth = Math.min(P * 0.6, r * 0.45)
        const eps = Math.max(0.4, depth * 0.4), kAx = 0.85
        const cx = f.x ?? 0, cy = f.y ?? 0, z0 = f.z0 ?? 0
        const hz = -P   // 螺旋超出两端 1 个螺距（牙喺面 z 范围内净切）
        const helix = makeHelix(P, H + 2 * P, r, [0, 0, hz], undefined, f.lefthand) as any   // #thread：lefthand=左旋牙（缺省右旋）
        // 牙三角（XZ 轴向面 @螺旋起点）：底沉入面内 eps，尖向外 depth
        const tri = draw([-eps, -kAx * P / 2]).lineTo([-eps, kAx * P / 2]).lineTo([depth, 0]).close().sketchOnPlane('XZ', [r, hz]) as any
        let ridge = genericSweep(tri.wire, helix, { forceProfileSpine: true } as any)
        try { ridge = ridge.intersect(makeBaseBox(4 * (r + depth), 4 * (r + depth), H) as any) } catch { /* 裁唔到照用 */ }
        // GM-γ2b：外螺纹叠加系 makeCompound（纯并组，唔系 cut/fuse/intersect 布尔）→ 唔录 S2，诚实跳过（无有效布尔可重跑）。
        shape = makeCompound([shape, ridge.translate(cx, cy, z0)])
      } catch (e) { buildWarnings.push('外螺纹生成失败（实体保持原样）：' + ((e as any)?.message || e)) }
    } else if (f.type === 'ithread' && shape) {
      // Internal thread (tapped hole). Like the external thread, a helical ridge FUSED/CUT against a wall
      // yields a face this OCCT-wasm build's BRepMesh tessellates into a NON-watertight soup. So instead:
      // drill the major-Ø bore (clean watertight body) and COMPOUND an independently-meshable helical ridge
      // ring inside it (crest → minor Ø). Each shell is watertight; overlapping shells are valid for STL/print.
      // P2 Cosmetic：外观攻牙 — 连钻孔都唔做（纯标注；孔身用「孔」工具）。B-rep 零触碰。
      if (!f.cosmetic) {
      const Rmaj = Math.max(1, f.d / 2)
      const P = Math.max(0.3, f.pitch)
      const H = Math.max(P, f.height)
      const depth = Math.min(P * 0.6, Rmaj * 0.45)
      const cx = f.x ?? 0, cy = f.y ?? 0
      const zb = f.z0 ?? 0   // P2：孔底 z — 「建模螺纹」盲孔由顶面向下（span [zb, zb+H]）；缺省 0 = 旧行为
      const eps = Math.max(0.3, depth * 0.4), kAx = 0.85, hext = 1
      let res: any = shape
      let drilled = false
      try {
        // zb=0（旧行为）：[-1, H+1] 上下各冲 1；zb>0（盲）：孔底准确落 zb，只向上冲 1（唔好越钻越深）
        const drill = drawCircle(Rmaj).sketchOnPlane('XY', zb ? zb : -1).extrude(zb ? H + 1 : H + 2) as any  // bore = valley Ø (widest), watertight
        const drillTool = drill.translate(cx, cy, 0)
        res = res.cut(drillTool); _recordBool(_i, 'cut', drillTool); drilled = true   // GM-γ2b：内螺纹钻孔 = 单 cut → cut 成功后先录工具体供 S2（下面牙环 makeCompound 唔系布尔 → 唔录，诚实跳过）
      } catch (e) { buildWarnings.push('内螺纹钻孔失败：' + ((e as any)?.message || e)) }
      if (drilled) {
        try {
          // 牙环【永远喺原点 z∈[0,H] 砌】（同旧码逐字节一样 — 呢版 makeHelix 嘅 center 参数唔生效，
          // helix 实际总由 z=0 起；如果把 z0 揉入 helix/trim，z0>H 时 trim 同牙环零交集 → 牙静默消失，实测），
          // 最后先成个环 translate 上 zb。
          const z0 = -hext * P
          const helix = makeHelix(P, H + 2 * hext * P, Rmaj, [0, 0, z0], undefined, f.lefthand) as any   // #thread：lefthand=左旋内牙
          // triangle in the axial plane at the helix start (Rmaj,0,z0): base sunk into the bore wall (+eps),
          // apex pointing INWARD toward the axis (−depth → minor Ø).
          const tri = draw([eps, -kAx * P / 2]).lineTo([eps, kAx * P / 2]).lineTo([-depth, 0]).close().sketchOnPlane('XZ', [Rmaj, z0]) as any
          let ridge = genericSweep(tri.wire, helix, { forceProfileSpine: true } as any)
          try { ridge = ridge.intersect(makeBaseBox(4 * Rmaj, 4 * Rmaj, H) as any) } catch { /* keep untrimmed if trim fails */ }  // makeBaseBox spans z∈[0,H] already (同外螺纹) — NO translate, else threads shift +H/2 & poke out the top
          res = makeCompound([res, ridge.translate(cx, cy, zb)])
        } catch (e) { buildWarnings.push('内螺纹螺旋牙失败（已退回光孔）：' + ((e as any)?.message || e)) }
      }
      shape = res
      }
    } else if (f.type === 'cylpatch' && shape) {
      // Curved-surface feature on a cylinder (Z axis): a raised boss / sunk pocket (annular-sector prism)
      // or a milled flat (planar chord cut). The arc is approximated by a fine polygon → 100% robust
      // (arc + extrude + boolean, no fragile curved-face ops). Cylinder radius is read from the body.
      try {
        const bb = shape.boundingBox.bounds
        const R = Math.max(Math.abs(bb[0][0]), Math.abs(bb[1][0]), Math.abs(bb[0][1]), Math.abs(bb[1][1]))
        const a0 = (f.ang - f.arc / 2) * Math.PI / 180, a1 = (f.ang + f.arc / 2) * Math.PI / 180
        const z0 = f.zc - f.h / 2, dep = Math.max(0.2, f.depth)
        if (f.mode === 'flat') {
          // Mill a flat: remove everything outside the plane at distance (R-depth) facing `ang`, over [z0,z0+h].
          const dirA = f.ang * Math.PI / 180
          const big = 4 * R
          // slab covering the outer material on the ang side: a box whose inner face sits at R-dep
          const slab = (draw([R - dep, -big]).lineTo([R - dep + big, -big]).lineTo([R - dep + big, big]).lineTo([R - dep, big]).close()
            .sketchOnPlane('XY', z0).extrude(f.h) as any).rotate(f.ang, [0, 0, z0], [0, 0, 1])
          void dirA; void a0; void a1
          _recordBool(_i, 'cut', slab); shape = shape.cut(slab)   // GM-γ2b：曲面铣平 = 单 cut → 录工具体供 S2
        } else {
          const Rin = f.mode === 'boss' ? R - 0.6 : R - dep
          const Rout = f.mode === 'boss' ? R + dep : R + 0.6
          const N = Math.max(10, Math.round(f.arc / 3))
          const ptsOut: [number, number][] = [], ptsIn: [number, number][] = []
          for (let i = 0; i <= N; i++) { const a = a0 + (a1 - a0) * i / N; ptsOut.push([Rout * Math.cos(a), Rout * Math.sin(a)]); ptsIn.push([Rin * Math.cos(a), Rin * Math.sin(a)]) }
          let pen = draw(ptsOut[0])
          for (let i = 1; i < ptsOut.length; i++) pen = pen.lineTo(ptsOut[i])
          for (let i = ptsIn.length - 1; i >= 0; i--) pen = pen.lineTo(ptsIn[i])
          const patch = pen.close().sketchOnPlane('XY', z0).extrude(f.h) as any
          if (f.mode === 'boss') { _recordBool(_i, 'fuse', patch); shape = shape.fuse(patch) } else { _recordBool(_i, 'cut', patch); shape = shape.cut(patch) }   // GM-γ2b：曲面凸台/凹槽 = 单布尔 → 录工具体供 S2
        }
      } catch (e) { buildWarnings.push('曲面贴花失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'sheetmetal') {
      // Sheet-metal kernel: a constant-thickness folded part defined by a cross-section (straight runs
      // `segs` joined by bends `angles`). Folded = centre-line (bend radius R) offset ±T/2 → closed
      // profile → extrude width W (single profile + one extrude → no fragile booleans). flat = the
      // developed blank, length via K-factor bend allowance = Σ|angle|·(R + K·T).
      try {
        const T = Math.max(0.2, f.thickness), R = Math.max(0.01, f.radius), K = Math.min(0.5, Math.max(0, f.kfactor)), W = Math.max(1, f.width)
        const segs = f.segs.map((s) => Math.max(0.1, s)), angles = f.angles
        if (f.flat) {
          // Developed flat blank: straight runs stay, each bend contributes its neutral-axis arc length.
          let DL = segs.reduce((a, b) => a + b, 0)
          for (let i = 0; i < angles.length; i++) DL += Math.abs(angles[i] * Math.PI / 180) * (R + K * T)
          shape = (makeBaseBox(DL, W, T) as any).translate(DL / 2, W / 2, 0)   // blank x∈[0,DL], y∈[0,W], z∈[0,T]
        } else {
          const Rc = R + T / 2
          // Walk the cross-section centre-line in 2D (x = unrolled dir, z = up); collect points + heading.
          const cl: { x: number; z: number; th: number }[] = []
          let x = 0, z = 0, th = 0
          cl.push({ x, z, th })
          for (let i = 0; i < segs.length; i++) {
            x += segs[i] * Math.cos(th); z += segs[i] * Math.sin(th); cl.push({ x, z, th })
            if (i < angles.length) {
              const a = angles[i] * Math.PI / 180
              if (Math.abs(a) > 1e-4) {
                const dir = a >= 0 ? 1 : -1
                const cx = x - Rc * Math.sin(th) * dir, cz = z + Rc * Math.cos(th) * dir   // bend centre (turn side)
                const phi0 = Math.atan2(z - cz, x - cx)
                const M = Math.max(3, Math.round(Math.abs(a) / (Math.PI / 18)))            // ~10° facets
                for (let k = 1; k <= M; k++) {
                  const px = cx + Rc * Math.cos(phi0 + a * (k / M)), pz = cz + Rc * Math.sin(phi0 + a * (k / M))
                  cl.push({ x: px, z: pz, th: th + a * (k / M) })
                }
                x = cl[cl.length - 1].x; z = cl[cl.length - 1].z; th += a
              }
            }
          }
          // Offset centre-line by ±T/2 along the local left-normal → outer / inner boundaries.
          const outer: [number, number][] = [], inner: [number, number][] = []
          for (const p of cl) { const nx = -Math.sin(p.th), nz = Math.cos(p.th); outer.push([p.x + nx * T / 2, p.z + nz * T / 2]); inner.push([p.x - nx * T / 2, p.z - nz * T / 2]) }
          const poly = outer.concat(inner.reverse())
          let pen = draw(poly[0])
          for (let i = 1; i < poly.length; i++) pen = pen.lineTo(poly[i])
          shape = pen.close().sketchOnPlane('XZ').extrude(W) as any   // extrude along Y by width
        }
      } catch (e) { buildWarnings.push('钣金件生成失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'gear') {
      // Involute spur gear: real involute tooth profile → extrude; optional centre bore.
      try {
        const m = Math.max(0.2, f.module), z = Math.max(5, Math.round(f.teeth)), h = Math.max(0.5, f.thickness)
        // 20° full-depth involute undercuts below z_min = 2/sin²(20°) ≈ 17 teeth (root cut weakens the tooth).
        // Honest maker heads-up — the gear still generates (tip is clamped), but small pinions are weaker.
        if (z < 17) buildWarnings.push(`⚠ 齿轮 z${z}<17：20° 压力角下少齿数会根切(undercut)，齿根变弱。可加齿数、加大模数、或改用变位齿轮（本工具未支持变位）`)
        let poly = gearProfile2D(m, z, 20)
        if (f.phase) { const a = (f.phase * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a); poly = poly.map(([x, y]) => [x * ca - y * sa, x * sa + y * ca] as [number, number]) }
        let pen = draw(poly[0]); for (let i = 1; i < poly.length; i++) pen = pen.lineTo(poly[i])
        // T770 斜齿轮：helix=螺旋角 β → 全高扭转角（分度圆周向弧长 h·tanβ 折算度数），啮合对 β 同值反号
        const sk0 = pen.close().sketchOnPlane('XY') as any
        const rp = (m * z) / 2
        const twistDeg = f.helix ? (h * Math.tan((f.helix * Math.PI) / 180) / rp) * (180 / Math.PI) : 0
        let gear = (twistDeg ? sk0.extrude(h, { twistAngle: twistDeg }) : sk0.extrude(h)) as any
        const br = (f.bore || 0) / 2
        if (br > 0.2) { const bmax = Math.min(br, (m * z) / 2 - 1.25 * m - 0.5); if (bmax > 0.2) gear = gear.cut(drawCircle(bmax).sketchOnPlane('XY').extrude(h + 2).translate(0, 0, -1)) }
        merge(gear, f.op)
      } catch (e) { buildWarnings.push('齿轮生成失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'worm') {
      // T770 蜗杆（ZA 近似）：芯柱 + 梯形牙沿螺旋扫掠 — thread 同款 compound（螺旋面 fuse 唔可三角化）。
      try {
        const m = Math.max(0.5, f.module), starts = Math.max(1, Math.round(f.starts || 1)), L = Math.max(m * 4, f.length)
        const d = m * 8                       // 分度圆直径惯例 q=8
        const Rroot = d / 2 - 1.25 * m        // 齿根半径
        const lead = Math.PI * m * starts     // 导程 = 轴向齿距 πm × 头数
        const p = Math.PI * m
        const core = drawCircle(Math.max(1, Rroot)).sketchOnPlane('XY').extrude(L) as any
        let res: any = core
        try {
          const z0 = -lead
          const helix = makeHelix(lead, L + 2 * lead, Rroot, [0, 0, z0]) as any
          // 梯形牙（rack 公式）：根半宽 p/4+1.25m·tan20°，顶半宽 p/4−m·tan20°，全深 2.25m（径向向外）
          const rh = p / 4 + 1.25 * m * Math.tan(Math.PI / 9), th2 = Math.max(0.2, p / 4 - m * Math.tan(Math.PI / 9))
          const dep = 2.25 * m
          const tri = draw([-0.4, -rh]).lineTo([dep, -th2]).lineTo([dep, th2]).lineTo([-0.4, rh]).close().sketchOnPlane('XZ', [Rroot, z0]) as any
          let ridge = genericSweep(tri.wire, helix, { forceProfileSpine: true } as any)
          try { ridge = ridge.intersect(makeBaseBox(4 * d, 4 * d, L) as any) } catch { /* 裁唔到照用 */ }
          res = makeCompound([core, ridge])
        } catch (e) { buildWarnings.push('蜗杆螺旋牙失败（已退回光柱）：' + ((e as any)?.message || e)) }
        merge(res, f.op)
      } catch (e) { buildWarnings.push('蜗杆生成失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'crowngear') {
      // T770 冠齿轮（面齿轮近似形）：盘 + z 个径向梯形齿喺顶面分度圆 — compound（N 次 fuse 慢/易爆）。
      try {
        const m = Math.max(0.5, f.module), z = Math.max(8, Math.round(f.teeth))
        const dh = Math.max(1, f.discH), fw = Math.max(m * 2, f.faceW)
        const rp = (m * z) / 2, p = Math.PI * m
        let disc = drawCircle(rp + fw / 2 + m).sketchOnPlane('XY').extrude(dh) as any
        const br = (f.bore || 0) / 2
        if (br > 0.2 && br < rp - fw / 2 - 1) disc = disc.cut(drawCircle(br).sketchOnPlane('XY').extrude(dh + 2).translate(0, 0, -1))
        const parts: any[] = [disc]
        // 单齿：周向梯形截面（XZ 面，根半宽→顶半宽，高 2.25m·0.9）沿径向 (+x) 拉 fw，置喺分度圆内缘
        const rh = p / 4, th2 = Math.max(0.2, p / 4 - m * Math.tan(Math.PI / 9)), hT = 2 * m
        const r0 = rp - fw / 2
        for (let k = 0; k < z; k++) {
          const tooth = (draw([0, -rh]).lineTo([hT, -th2]).lineTo([hT, th2]).lineTo([0, rh]).close()
            .sketchOnPlane('XZ', [r0, dh]) as any).extrude(fw).rotate((360 / z) * k, [0, 0, 0], [0, 0, 1])
          parts.push(tooth)
        }
        merge(makeCompound(parts), f.op)
      } catch (e) { buildWarnings.push('冠齿轮生成失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'rack') {
      // Rack = pinion's mate: a bar with straight-flank (20°) involute-rack teeth on top. Meshes with the gear.
      try {
        const m = Math.max(0.2, f.module), L = Math.max(m * 4, f.length), baseH = Math.max(0.5, f.baseH), h = Math.max(0.5, f.thickness)
        const p = Math.PI * m, a = m, d = 1.25 * m, ta = Math.tan((20 * Math.PI) / 180)
        const yr = baseH, yt = baseH + a + d                      // tooth root line / tip line
        const rootHalf = p / 4 + d * ta, tipHalf = Math.max(0.01, p / 4 - a * ta)
        const n = Math.max(1, Math.floor(L / p))
        const top: [number, number][] = [[0, yr]]
        for (let i = 0; i < n; i++) {
          const xc = (i + 0.5) * p
          top.push([xc - rootHalf, yr], [xc - tipHalf, yt], [xc + tipHalf, yt], [xc + rootHalf, yr])
        }
        top.push([L, yr])
        const poly: [number, number][] = [...top, [L, 0], [0, 0]]
        let pen = draw(poly[0]); for (let i = 1; i < poly.length; i++) pen = pen.lineTo(poly[i])
        merge(pen.close().sketchOnPlane('XY').extrude(h) as any, f.op)
      } catch (e) { buildWarnings.push('齿条生成失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'pulley') {
      // V-belt pulley: half cross-section (radial×axial) with a V-groove on the rim + centre bore,
      // revolved 360° about Z. Profile starts at the bore radius → the bore is built in (no extra cut).
      try {
        const R = Math.max(2, f.diameter / 2), W = Math.max(1, f.width), rb = Math.max(0.5, Math.min(f.bore / 2, R - 1))
        // V-groove at the standard ~38° included belt angle (19° half): groove top-width derived FROM the depth
        // (gw = 2·depth·tan19°) so it actually grips a V-belt, not a too-wide generic notch. Depth still capped
        // so it never eats the bore. Clamp gw ≤ 0.7W so the rim shoulders stay.
        const depth = Math.min(W * 0.4, (R - rb) * 0.6)
        const gw = Math.min(W * 0.7, 2 * depth * Math.tan((19 * Math.PI) / 180)), gz0 = (W - gw) / 2, gz1 = (W + gw) / 2
        const pts: [number, number][] = [[rb, 0], [R, 0], [R, gz0], [R - depth, W / 2], [R, gz1], [R, W], [rb, W]]
        let pen = draw(pts[0]); for (let i = 1; i < pts.length; i++) pen = pen.lineTo(pts[i])
        merge((pen.close().sketchOnPlane('XZ').revolve([0, 0, 1]) as any), f.op)
      } catch (e) { buildWarnings.push('带轮生成失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'scale' && shape) {
      const sx = f.sx ?? 0, sy = f.sy ?? 0, sz = f.sz ?? 0
      // P2：缩放基准点 px/py/pz（Fusion Point）— 缺省 0,0,0 = 世界原点 = 旧档逐字节回放
      let px = f.px ?? 0, py = f.py ?? 0, pz = f.pz ?? 0
      let hasPt = px !== 0 || py !== 0 || pz !== 0
      // P2 修：无显式基准点 + anchorCenter（新建缩放默认）→ 用 shape bbox 中心做锚点（Fusion 语义，免离心体飞走）。旧档无 anchorCenter → 世界原点（byte-compat）。
      if (!hasPt && f.anchorCenter) {
        try { const bb = (shape as any).boundingBox.bounds as [number[], number[]]; px = (bb[0][0] + bb[1][0]) / 2; py = (bb[0][1] + bb[1][1]) / 2; pz = (bb[0][2] + bb[1][2]) / 2; hasPt = px !== 0 || py !== 0 || pz !== 0 } catch { /* 无 bbox → 退回原点 */ }
      }
      if ((sx > 0 || sy > 0 || sz > 0) && !(sx === sy && sy === sz && sx > 0)) {
        // T762（③后）：非等比三轴缩放 — BRepBuilderAPI_GTransform（plus 内核新符号）。
        // 0/空 = 该轴不缩放（×1）。P2：平移列（第4列）= p − S·p → 基准点 p 不动（一次仿射搞掂，免三次内核调用）。
        try {
          const Sx = sx > 0 ? sx : 1, Sy = sy > 0 ? sy : 1, Sz = sz > 0 ? sz : 1
          const g = new _oc.gp_GTrsf_1()
          g.SetValue(1, 1, Sx); g.SetValue(2, 2, Sy); g.SetValue(3, 3, Sz)
          if (hasPt) { g.SetValue(1, 4, px - Sx * px); g.SetValue(2, 4, py - Sy * py); g.SetValue(3, 4, pz - Sz * pz) }
          const b = new _oc.BRepBuilderAPI_GTransform_2(shape.wrapped, g, true)
          const out = cast(b.Shape())
          if (out && out.wrapped && !out.wrapped.IsNull()) shape = out
          else buildWarnings.push('非等比缩放失败 — 已保持原形')
          g.delete()
        } catch (e) { buildWarnings.push('非等比缩放失败：' + ((e as any)?.message || e)) }
      } else if (sx > 0 && sx === sy && sy === sz) {
        shape = hasPt ? shape.translate(-px, -py, -pz).scale(sx).translate(px, py, pz) : shape.scale(sx)   // 三轴相同 → 行返等比（B-rep 更稳）
      } else {
        shape = hasPt ? shape.translate(-px, -py, -pz).scale(f.factor).translate(px, py, pz) : shape.scale(f.factor)
      }
    } else if (f.type === 'draft' && shape) {
      // S101[5]：拾中性面（拾取面 origin+normal）+ 拾侧面集（containsPoint 逐点选）；缺字段回落旧式 XY + 全非平行侧面。
      try {
        let neutral: any = 'XY'
        if (f.neutralNormal && f.neutralOrigin) {
          const n = f.neutralNormal, L = Math.hypot(n[0], n[1], n[2])
          if (L < 1e-9) { buildWarnings.push('拔模：中性面法向为零向量 — 已改用默认 XY 中性面'); neutral = 'XY' }   // 零法向 → RPlane 退化平面令 draft 出无效几何；退回 XY
          else neutral = new RPlane(f.neutralOrigin as any, undefined as any, [n[0] / L, n[1] / L, n[2] / L] as any)
        }
        let pts = f.sideNears || []
        // S129：侧面集持久面指纹（多拣，与 sideNears 平行索引；镜 shell）。fp 命中→用解析点集；否则首解捕获供 store 写回。
        // 无 faceFp / 空 sideNears → pts 不变（字节一致，仍走回落选择器）。
        _lastResolvedFaceFp = null
        if (pts.length) {
          try { shape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }) } catch { /* 三角化供 _ff* 查面 */ }
          if (f.faceFp && f.faceFp.length) { const fsel = _ffSelectPts(shape, f.faceFp, f.sideNears, f.faceFpV2, f.faceFpTopo); if (fsel && fsel.length) pts = fsel }   // S131：near-biased 消歧；S136：带 faceFpV2 先试旋转不变
          else { const _c = _ffCapture(shape, pts); _lastResolvedFaceFp = _c.v1; _lastResolvedFaceFpV2 = _c.v2; _lastResolvedFaceFpTopo = _c.topo }
        }
        const sel = (ff: any) => pts.length
          ? ff.either(pts.map((p) => (g: any) => g.containsPoint(p as any)))   // 选包含每个拾取点嘅面（并集）
          : ff.not((g: any) => g.parallelTo(neutral))                          // 回落：全部唔平行中性面嘅侧面
        // 负号：令【正角度 = 远离中性面侧向内收】（脱模标准，方便起模）。OCCT DraftAngle 原始正角度系向外张。
        if (Math.abs(f.angle) < 0.01) buildWarnings.push(`拔模：角度过小（${f.angle}°，<0.01°）— 已跳过（零角拔模 = 无效几何，可能来自参数驱动）`)   // 0° draft → OCCT 出退化/无效面,污染下游布尔
        else shape = shape.draft(-f.angle, sel, neutral)
        { const _cap = _lastResolvedFaceFp as string[] | null; if (_cap && _cap.length) { _resolvedFaceFp[f.id] = _cap; _lastResolvedFaceFp = null } }   // S129：捕获嘅侧面指纹交 store 写回
        { const _capV2 = _lastResolvedFaceFpV2 as string[] | null; if (_capV2 && _capV2.length) { _resolvedFaceFpV2[f.id] = _capV2; _lastResolvedFaceFpV2 = null } { const _capTopo = _lastResolvedFaceFpTopo as string[] | null; if (_capTopo && _capTopo.length) { _resolvedFaceFpTopo[f.id] = _capTopo; _lastResolvedFaceFpTopo = null } } }   // S136：v2 平行写回
      } catch (e) { buildWarnings.push('拔模失败：' + ((e as any)?.message || e)); failedFeatures.push({ id: f.id, type: 'draft', msg: '拔模失败（边已被圆角/倒角吃掉或侧面识别失败）— 已保留原形' }) }   // 审计修复：标 failed 令时间轴标红 + store 唔再硬报「已拔模」（fillet→draft 矛盾状态）
    } else if (f.type === 'cpattern' && shape) {
      const n = Math.max(1, Math.round(f.count))   // 审计修复：旧版 Math.max(2,..) 把 count=1 静默钳到 2 多复制一个（与矩形阵列 Math.max(1,..) 不一致）；n=1 → 下面循环 i<1 不执行 = identity
      const ax: [number, number, number] = f.axis === 'X' ? [1, 0, 0] : f.axis === 'Y' ? [0, 1, 0] : [0, 0, 1]
      const ctr: [number, number, number] = [f.cx ?? 0, f.cy ?? 0, f.cz ?? 0]  // rotate about a custom centre (CAD), default origin
      // Angular step: a full 360° spread divides evenly (360/n, last copy ≠ original).
      // A partial arc puts the LAST copy ON the end angle (angle/(n−1), endpoint inclusive),
      // matching the 2D sketch circular array (T476) and Fusion's convention.
      const step = n <= 1 ? 0 : (Math.abs(f.angle) >= 359.9 ? f.angle / n : f.angle / (n - 1))   // 审计修复：n=1 时避免 /(n-1) 除零
      if (prevBefore && prevWasCut) {
        // The last feature was a CUT (e.g. a hole). Pattern the removed region around the axis —
        // fusing whole rotated copies would just fill the holes, so re-cut the tool instead.
        const removed = prevBefore.clone().cut(shape.clone())
        let acc = shape
        for (let i = 1; i < n; i++) acc = acc.cut(removed.clone().rotate(step * i, ctr, ax))
        shape = acc
      } else {
        // Additive pattern (boss/lug/tooth): fuse rotated copies of the whole solid (unchanged).
        const base = shape
        let acc = base
        for (let i = 1; i < n; i++) acc = acc.fuse(base.clone().rotate(step * i, ctr, ax))
        shape = acc
      }
    } else if (f.type === 'transform' && shape) {
      const rx = f.rx ?? 0, ry = f.ry ?? 0, rz = f.rz ?? 0
      // GM-3DV3 M1 Create Copy：变换一个 clone、留原件（Fusion「复制」半边）。原地变换（缺省）= 直接改 shape（旧档逐字节）。
      const applyXf = (sh: any): any => {
        let s2 = sh
        if (rx || ry || rz) {
          let c: [number, number, number] = f.origin ?? [0, 0, 0]
          try { if (!f.origin) { const b = s2.boundingBox.bounds; c = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2] } } catch { /* origin */ }
          if (rx) s2 = s2.rotate(rx, c, [1, 0, 0])
          if (ry) s2 = s2.rotate(ry, c, [0, 1, 0])
          if (rz) s2 = s2.rotate(rz, c, [0, 0, 1])
        }
        if (f.dx || f.dy || f.dz) s2 = s2.translate(f.dx, f.dy, f.dz)
        return s2
      }
      if (f.copy) {
        // Create Copy 必须保留原实体并加一个独立实体，绝不能融合成单一固体。
        parkedBodies.push({ name: `实体${parkedBodies.length + 1} (1)`, kind: 'body', shape: applyXf(shape.clone()) })
      } else {
        shape = applyXf(shape)
      }
    } else if (f.type === 'pushpull' && shape) {
      // Press/Pull: offset the face nearest the stored pick point along its normal by `dist`
      // (>0 pulls material out → fuse; <0 pushes in → cut). Re-finds the face each rebuild (like
      // the near-point fillet), so it survives upstream parameter edits that keep that face.
      try {
        try { shape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }) } catch { /* triangulate so face.triangulation() is populated for the lookup below */ }
        // S128 + P2 批9 多面：nears 缺省退 [near]（旧档逐字节）；fp 命中→逐点解析（_ff* 本身食数组）
        const ns0: [number, number, number][] = (f.nears && f.nears.length ? f.nears : [f.near])
        let ns = ns0
        _lastResolvedFaceFp = null
        if (f.faceFp && f.faceFp.length) { const sel = _ffSelectPts(shape, f.faceFp, ns0, f.faceFpV2, f.faceFpTopo); if (sel && sel.length === ns0.length) ns = sel }   // S131：near-biased 消歧；S136：带 faceFpV2 先试旋转不变
        else { const _c = _ffCapture(shape, ns0); _lastResolvedFaceFp = _c.v1; _lastResolvedFaceFpV2 = _c.v2; _lastResolvedFaceFpTopo = _c.topo }
        for (const near of ns) {
        try { shape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }) } catch { /* 逐面重三角化（上一面 fuse/cut 后 faces/triangulation 要新鲜） */ }
        const faces = (shape as any).faces as any[]
        let bestF: any = null, bestD = Infinity
        for (const fc of faces) {
          const tri = fc.triangulation ? fc.triangulation() : null
          if (!tri || !tri.vertices || !tri.vertices.length) continue
          const V = tri.vertices as number[], T = tri.trianglesIndexes as number[]
          let dmin = Infinity
          for (let i = 0; i < T.length; i += 3) {
            const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3
            const d = ptTriDist2(near[0], near[1], near[2], V[a], V[a + 1], V[a + 2], V[b], V[b + 1], V[b + 2], V[c], V[c + 1], V[c + 2])
            if (d < dmin) dmin = d
          }
          if (dmin < bestD) { bestD = dmin; bestF = fc }
        }
        // S143 式漂移闸：near 点离最近面都太远（>模型 bbox 对角 3% 且 >0.5mm）= 上游编辑令拾取漂移 → 唔好推错面，诚实警告跳过（byte-compat：正常拾面 drift≈0 不受影响）
        if (bestF && Number.isFinite(bestD)) {
          let bbDiag = 0
          try { const bb = (shape as any).boundingBox.bounds as [number[], number[]]; bbDiag = Math.hypot(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]) } catch { /* 无 bbox → 不闸 */ }
          const drift = Math.sqrt(Math.max(0, bestD))
          if (bbDiag > 0 && drift > Math.max(bbDiag * 0.03, 0.5)) {
            buildWarnings.push(`按拉：拾取点离最近面 ${drift.toFixed(1)}mm（超模型 ${(bbDiag * 0.03).toFixed(1)}mm 阈值）— 疑上游编辑后漂移，已跳过免推错面`)
            bestF = null
          }
        }
        if (bestF && Math.abs(f.dist) > 1e-6) {
          // T776（S56-①）：圆柱面按拉 = 改半径（Fusion 语义），唔系平推弯片。
          // 直立(Z 轴)完整圆柱先做；局部/横置圆柱诚实退回旧平推 + 警告。
          let did = false
          if (bestF.geomType === 'CYLINDRE' || bestF.geomType === 'CYLINDER') {
            try {
              const tri = bestF.triangulation()
              const V = tri.vertices as number[]
              const n3 = V.length / 3
              let cx = 0, cy = 0, z0 = 1e18, z1 = -1e18
              for (let i = 0; i < V.length; i += 3) { cx += V[i]; cy += V[i + 1]; z0 = Math.min(z0, V[i + 2]); z1 = Math.max(z1, V[i + 2]) }
              cx /= n3; cy /= n3
              let sum = 0, sum2 = 0
              for (let i = 0; i < V.length; i += 3) { const d = Math.hypot(V[i] - cx, V[i + 1] - cy); sum += d; sum2 += d * d }
              const r = sum / n3, sd = Math.sqrt(Math.max(0, sum2 / n3 - r * r))
              const bins = new Array(24).fill(0)
              for (let i = 0; i < V.length; i += 3) bins[Math.floor(((Math.atan2(V[i + 1] - cy, V[i] - cx) + Math.PI) / (2 * Math.PI)) * 24) % 24]++
              const cover = bins.filter((b: number) => b > 0).length / 24
              if (sd / r < 0.05 && cover > 0.8 && z1 - z0 > 0.2) {
                const nrm = bestF.normalAt(near)
                const concave = (nrm.x * (near[0] - cx) + nrm.y * (near[1] - cy)) < 0   // 法向朝轴 = 孔内壁
                const zl = z0 - 0.5, hh = (z1 + 0.5) - zl
                const cyl = (rr: number) => drawCircle(Math.max(0.2, rr)).sketchOnPlane('XY', zl).extrude(hh).translate(cx, cy, 0) as any
                const dist = f.dist
                if (concave) {
                  if (dist < 0) shape = shape.cut(cyl(r + Math.abs(dist)))   // 孔变大
                  else {
                    if (r - dist <= 0.2) throw new Error('孔会变到无（半径剩 ≤0.2）— 减少距离')
                    shape = shape.fuse(cyl(r + 0.05)).cut(cyl(r - dist))     // 孔变细：先填实（微过盈防共面）再重钻
                  }
                } else {
                  if (dist > 0) shape = shape.fuse(cyl(r + dist))            // 凸台变粗
                  else {
                    if (r - Math.abs(dist) <= 0.2) throw new Error('柱会变到无（半径剩 ≤0.2）— 减少距离')
                    shape = shape.cut(cyl(r + 0.5).cut(cyl(r - Math.abs(dist))))   // 变幼：环形刀
                  }
                }
                did = true
              } else {
                buildWarnings.push('非直立/局部圆柱面（圆角/横置/弧面）— 按旧方式平推（唔会改半径）')
              }
            } catch (e2) { buildWarnings.push('圆柱按拉失败：' + ((e2 as any)?.message || e2)); did = true }
          }
          if (!did) {
            // GM-γ2b：平面按拉 = 单次 fuse/cut（prism 工具体）→ 录供 S2。⚠ 圆柱变半径路径（上面 did=true）系
            //   复合布尔（fuse+cut 环形刀）→ 唔录，诚实跳过（复合 op，重跑单布尔追唔到）。多面按拉时逐面覆盖 _boolToolAt[_i]
            //   （最后一面胜出）—— 单面常见情形准确；多面情形 S2 只对最后一面有效，其余退回近点（诚实）。
            const n = bestF.normalAt(near).normalized()
            if (f.dir) {
              // S192 任意方向移面（Direct-Edit Move Face）：沿自定方向 dir 移面 dist；fuse/cut 由【外向法向分量】定
              // （外移=加料 fuse、内移=减料 cut）。纯切向（dir⊥法向）= 加减相消嘅退化态 → 诚实警告系近似。
              const dl = Math.hypot(f.dir[0], f.dir[1], f.dir[2]) || 1
              const ux = f.dir[0] / dl, uy = f.dir[1] / dl, uz = f.dir[2] / dl
              const dotN = ux * n.x + uy * n.y + uz * n.z
              // 审计修复：纯切向（dir⊥面法向，dotN≈0）→ prism 体积=0 退化 sliver，旧版只警告照 fuse → 假成功 + 多退化三角。
              // 改为 early-skip：唔够法向分量就跳过、保原形 + 诚实警告（唔做 0 体积 fuse）。
              if (Math.abs(dotN) < 0.05) {
                buildWarnings.push('⚠ 移面方向与面相切（无法向分量）— 已跳过（请拣有法向分量嘅方向）')
              } else {
                if (Math.abs(dotN) < 0.2) buildWarnings.push('移面方向接近与面相切 — 侧移结果系近似（用法向分量决定加/减料；想干净移面请拣有法向分量嘅方向）')
                const prism = basicFaceExtrusion(bestF, new Vector([ux * f.dist, uy * f.dist, uz * f.dist]))
                if ((f.dist * dotN) >= 0) { _recordBool(_i, 'fuse', prism); shape = shape.fuse(prism) } else { _recordBool(_i, 'cut', prism); shape = shape.cut(prism) }
              }
            } else {
              const prism = basicFaceExtrusion(bestF, n.multiply(f.dist))
              if (f.dist >= 0) { _recordBool(_i, 'fuse', prism); shape = shape.fuse(prism) } else { _recordBool(_i, 'cut', prism); shape = shape.cut(prism) }
            }
          }
        }
        }
        { const _cap = _lastResolvedFaceFp as string[] | null; if (_cap && _cap.length) { _resolvedFaceFp[f.id] = _cap; _lastResolvedFaceFp = null } }   // S128：捕获嘅面指纹交俾 store 写回（多面=与 nears 平行数组）
        { const _capV2 = _lastResolvedFaceFpV2 as string[] | null; if (_capV2 && _capV2.length) { _resolvedFaceFpV2[f.id] = _capV2; _lastResolvedFaceFpV2 = null } { const _capTopo = _lastResolvedFaceFpTopo as string[] | null; if (_capTopo && _capTopo.length) { _resolvedFaceFpTopo[f.id] = _capTopo; _lastResolvedFaceFpTopo = null } } }   // S136：v2 平行写回
      } catch (e) { console.error('[pushpull]', e) }
    } else if (f.type === 'rib') {
      // Rib/web (加强筋): thicken a drawn centreline into a thin wall, fused to the body.
      // Per-segment thin rectangles (no mitres → bulletproof for any polyline).
      // Drop-to-body (Fusion-like): when a body exists, extrude DOWN from the sketch plane to the body's
      // floor (minZ) so the rib lands on and fuses with the solid below; standalone → extrude UP by `height`.
      let pts = f.path
      const hw = Math.max(0.1, f.thickness) / 2
      const z = f.baseZ ?? 0
      // GM-3DV1 S1：厚度方向 — sym（缺省）= 中心线两侧各 hw；one = 全部厚度落 +法向单侧（hwPos=2hw / hwNeg=0）。
      const hwPos = f.thDir === 'one' ? hw * 2 : hw
      const hwNeg = f.thDir === 'one' ? 0 : hw
      // GM-3DV1 S1（Web Extend Curves）：把每条开放折线两端点沿末段方向外延。有实体 → 钳到实体 XY 包围盒边（到墙）；无实体 → 固定 15mm。
      if (f.extend && f.arbPlane) buildWarnings.push('任意参考平面筋：Extend Curves 暂未能安全追到实体边界，已保留原中心线')
      if (f.extend && !f.arbPlane && pts.length >= 2) {
        let bbXY: [number, number, number, number] | null = null   // [xmin,ymin,xmax,ymax]
        if (shape) { try { const bb = shape.boundingBox.bounds; bbXY = [bb[0][0], bb[0][1], bb[1][0], bb[1][1]] } catch { bbXY = null } }
        const extendEnd = (p: [number, number], dir: [number, number]): [number, number] => {
          const dl = Math.hypot(dir[0], dir[1]); if (dl < 1e-9) return p
          const ux = dir[0] / dl, uy = dir[1] / dl
          let t = 15   // 无实体固定外延
          if (bbXY) {
            // march to the XY bbox edge along (ux,uy)：解各边界最近正向 t（+2mm 咬进墙确保布尔闭合），钳 [0,200]
            const cand: number[] = []
            if (ux > 1e-9) cand.push((bbXY[2] - p[0]) / ux); else if (ux < -1e-9) cand.push((bbXY[0] - p[0]) / ux)
            if (uy > 1e-9) cand.push((bbXY[3] - p[1]) / uy); else if (uy < -1e-9) cand.push((bbXY[1] - p[1]) / uy)
            const pos = cand.filter((c) => c > 0.5)
            t = pos.length ? Math.min(Math.min(...pos) + 2, 200) : 15
          }
          return [p[0] + ux * t, p[1] + uy * t]
        }
        const q = pts.map((p) => [p[0], p[1]] as [number, number])
        q[0] = extendEnd(q[0], [q[0][0] - q[1][0], q[0][1] - q[1][1]])
        const n = q.length - 1
        q[n] = extendEnd(q[n], [q[n][0] - q[n - 1][0], q[n][1] - q[n - 1][1]])
        pts = q
      }
      let signedH = Math.max(0.1, f.height)  // standalone: up by height
      // GM-3DV1 S1：extent='distance' 强制向上 height（就算有实体，唔落底）；缺省/'next' = 有实体落到实体底融合（旧行为）。
      if (shape && f.extent !== 'distance' && !f.arbPlane) {
        try {
          const minZ = shape.boundingBox.bounds[0][2]
          const drop = z - minZ
          if (drop > 0.5) signedH = -drop  // down to the body floor (rib bottom coplanar with body bottom → fuses)
        } catch { /* keep up-by-height fallback */ }
      }
      if (f.flip) signedH = -signedH   // GM-3DV1 S1：翻转挤出方向
      // S191 拔模：筋身向远端按角度收窄（注塑/冲压脱模）。top 半宽 = hw − |H|·tan(draft)，逐段 base→top 锥化 loft。
      const ribDraft = f.draft || 0
      // 极端拔模角守卫：tan(→90°) 发散令 hwTop 被钳到 0.05mm（筋几乎收成刀刃）。诚实示警免用户以为几何坏咗（对齐挤出/面拔模角警告）。
      if (Math.abs(ribDraft) > 85) buildWarnings.push(`⚠ 筋拔模角 ${ribDraft}° 过大（接近 90°）— 顶部半宽已钳到最小 0.05mm（筋身几乎收成刀刃，请用细角度）`)
      // GM-3DV1 S1：逐侧顶半宽（拔模按各侧半宽比例收窄，非对称厚度亦正确锥化）
      const taper = Math.abs(ribDraft) > 0.01 ? Math.abs(signedH) * Math.tan((ribDraft * Math.PI) / 180) : 0
      const hwTopPos = taper > 0 ? Math.max(hwPos > 1e-6 ? 0.05 : 0, hwPos - taper) : hwPos
      const hwTopNeg = taper > 0 ? Math.max(hwNeg > 1e-6 ? 0.05 : 0, hwNeg - taper) : hwNeg
      const tapered = taper > 0 && (hwTopPos < hwPos - 1e-6 || hwTopNeg < hwNeg - 1e-6)
      let rib: any = null
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1]
        const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy)
        if (len < 1e-6) continue
        const px = -dy / len, py = dx / len  // unit perpendicular (+side)
        const contour: [number, number][] = [[ax + px * hwPos, ay + py * hwPos], [bx + px * hwPos, by + py * hwPos], [bx - px * hwNeg, by - py * hwNeg], [ax - px * hwNeg, ay - py * hwNeg]]
        const prof = f.arbPlane ? profileOnPlane({ kind: 'poly', pts: contour }, new RPlane(f.arbPlane.o as any, f.arbPlane.xd as any, f.arbPlane.n as any)) : draw(contour[0]).lineTo(contour[1]).lineTo(contour[2]).lineTo(contour[3]).close().sketchOnPlane('XY', z)
        let seg: any
        if (tapered) {
          // base→top 锥化：远端（z+signedH）逐侧半宽收窄 → 梯形截面筋（脱模角）。失败退回直筋。
          try {
            const topContour: [number, number][] = [[ax + px * hwTopPos, ay + py * hwTopPos], [bx + px * hwTopPos, by + py * hwTopPos], [bx - px * hwTopNeg, by - py * hwTopNeg], [ax - px * hwTopNeg, ay - py * hwTopNeg]]
            const topProf = f.arbPlane ? (() => { const ap = f.arbPlane!; const nl = Math.hypot(ap.n[0], ap.n[1], ap.n[2]) || 1; return profileOnPlane({ kind: 'poly', pts: topContour }, new RPlane([ap.o[0] + ap.n[0] * signedH / nl, ap.o[1] + ap.n[1] * signedH / nl, ap.o[2] + ap.n[2] * signedH / nl] as any, ap.xd as any, ap.n as any)) })() : draw(topContour[0]).lineTo(topContour[1]).lineTo(topContour[2]).lineTo(topContour[3]).close().sketchOnPlane('XY', z + signedH)
            seg = (prof as any).loftWith(topProf, { ruled: true })
          } catch { seg = prof.extrude(signedH); buildWarnings.push(`筋拔模 ${ribDraft}° 失败（截面太窄/塌陷）— 该段已直拉`) }
        } else seg = prof.extrude(signedH)
        rib = rib ? rib.fuse(seg) : seg
      }
      if (rib) {
        if (!shape) shape = rib
        else if (f.op === 'cut') { _recordBool(_i, 'cut', rib); shape = shape.cut(rib) }   // GM-γ2b：筋 = 单布尔 → 录工具体供 S2
        else { _recordBool(_i, 'fuse', rib); shape = shape.fuse(rib) }
      }
    } else if (f.type === 'text') {
      // Emboss/engrave text: outline the glyphs (CC0 font) → sketch on the plane → extrude → fuse/cut.
      try {
        const d = drawText(f.text || 'TEXT', { fontSize: f.size || 12, fontFamily: 'cad', startX: f.x ?? 0, startY: f.y ?? 0 })
        const th = f.height || 5
        if (f.arbPlane) {
          // S162 Emboss：喺拾中嘅面上落字，沿面法向 raise（fuse，向外 +th）/ engrave（cut，向内 −th）。
          // 镜 arbPlane extrude:1176-1183 直接布尔（唔行 merge()）—— merge cut 用世界 -Z nudge，对非 +Z 面会歪 + 无 overshoot 令文字外盖同面共面（布尔失败）。
          // 改：cut 沿真面法向 overshoot（−(th+1)）+ 直接 shape.cut；boss/intersect 同 arbPlane extrude 一致。
          const ap = f.arbPlane
          const pl = new RPlane(ap.o as any, ap.xd as any, ap.n as any)
          const op = f.op || 'new'
          const solid = (d as any).sketchOnPlane(pl).extrude(op === 'cut' ? -(th + 1) : th)
          if (!shape) shape = solid
          else if (op === 'cut') { _recordBool(_i, 'cut', solid); shape = shape.cut(solid) }   // GM-γ2b：面上刻/凸字 = 单布尔 → 录工具体供 S2
          else if (op === 'intersect') { _recordBool(_i, 'intersect', solid); shape = shape.intersect(solid) }
          else { _recordBool(_i, 'fuse', solid); shape = shape.fuse(solid) }
        } else {
          merge((d as any).sketchOnPlane(f.plane && f.plane !== 'XY' ? f.plane : 'XY', f.baseZ || 0).extrude(th), f.op || 'new')
        }
      } catch (e) { console.error('[text]', e) }
    } else if (f.type === 'sketch') {
      // 独立草图（T756）：纯 2D，无实体输出 — 显式空分支，确保唔会跌入任何默认路径
    } else if (f.type === 'datum') {
      // GM-W5 5.1：参考面 / datum 平面 —— 零几何时间轴节点（同注释一样）。显式 SKIP，唔贡献任何 shape。planes[] 由 store 派生。
    } else if (f.type === 'meshbody') {
      // T767：网格 → B-rep（缝合慢 — 增量重建缓存令后续特征零重缝）。B4：fit='param' 先试参数化圆柱重建，失败退 faceted。
      try {
        let solid: any = null
        if (f.fit === 'param' || f.fit === 'prismatic') {
          try {
            const pr = meshToBrepParametric(f.v, f.t, f.fit)
            if (pr && pr.shape) { solid = pr.shape
              const what = f.fit === 'prismatic' ? `真参数化盒实体${pr.cylCount ? `＋${pr.cylCount} 个圆柱孔` : ''}` : '真圆柱实体'   // #2b：v2 prismatic = 盒−圆柱布尔；v1 param = 纯圆柱
              buildWarnings.push(`网格参数化：重建为${what}（覆盖 ${Math.round(pr.coverage * 100)}%）— 可精确圆角/量 Ø/导出 STEP`) }
          } catch { /* 参数化异常 → 静默退 faceted */ }
        }
        if (!solid) solid = meshToSolidShape(f.v, f.t)   // faceted 退路（param 失败 / 非纯圆柱 / mode 未设 → 逐字节旧路）
        if (solid) merge(solid, f.op)
        else buildWarnings.push('网格转换失败 — 三角全部退化/缝合空')
      } catch (e) { buildWarnings.push('网格转换失败：' + ((e as any)?.message || e)) }
    } else if (f.type === 'circPattern' && shape) {
      // T757 環形阵列：任意轴（origin+dir）+ full/angle/sym 三模式。
      // 有 targets → snapshot-delta：目标系切除特征就重切 removed 区域（fuse 成件会填返啲孔），
      // 否则 fuse added 区域嘅旋转副本。无 targets → 成个实体 fuse 旋转副本（同 legacy cpattern 语义）。
      const n = Math.max(1, Math.round(f.count))   // 审计修复：count=1 = identity（旧版钳到 2 多复制）
      const dl = Math.hypot(f.dir[0], f.dir[1], f.dir[2])
      if (dl < 1e-9) { buildWarnings.push('环形阵列：轴方向为零向量 — 已跳过') } else {
        const ax: [number, number, number] = [f.dir[0] / dl, f.dir[1] / dl, f.dir[2] / dl]
        const ctr: [number, number, number] = f.origin
        // GM-3DV1 S3：逐实例抑制 — cpAngles 返副本（不含 seed）；副本 ci 对应实例 ci+1（seed=0 恒保留）。
        const angles = cpAngles(n, f.totalAngle, f.mode).filter((_, ci) => !f.suppress?.[ci + 1])
        // #64/#71 GM-L2：对称模式偶数件（含 n=2）—— 种子固定喺 0°、偶数无法关于种子居中，+ 侧会多放一件（跨度唔对称）。
        //   为兼容旧档 baked 几何（改布点会令旧档重放位移），此处【不改角度算法，只诚实披露】：报出实际角跨度让用户知情（要真对称请用奇数件或改「角度」模式）。
        if (f.mode === 'sym' && n >= 2 && n % 2 === 0 && angles.length) {
          const maxPos = Math.max(0, ...angles), maxNeg = Math.min(0, ...angles)
          buildWarnings.push(`对称阵列偶数件（${n} 件）：种子固定在 0°、偶数无法关于种子居中 — + 侧到 ${maxPos.toFixed(1)}°、− 侧到 ${maxNeg.toFixed(1)}°（单边多一件）。要完全对称请用奇数件或改「角度」模式`)
        }
        if (f.objectType === 'faces') {
          const matrices: number[][] = []
          for (const deg of angles) {
            const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), q = 1 - c
            const [x, y, z] = ax
            const r00 = c + x * x * q, r01 = x * y * q - z * s, r02 = x * z * q + y * s
            const r10 = y * x * q + z * s, r11 = c + y * y * q, r12 = y * z * q - x * s
            const r20 = z * x * q - y * s, r21 = z * y * q + x * s, r22 = c + z * z * q
            const tx = ctr[0] - (r00 * ctr[0] + r01 * ctr[1] + r02 * ctr[2])
            const ty = ctr[1] - (r10 * ctr[0] + r11 * ctr[1] + r12 * ctr[2])
            const tz = ctr[2] - (r20 * ctr[0] + r21 * ctr[1] + r22 * ctr[2])
            matrices.push([r00, r01, r02, tx, r10, r11, r12, ty, r20, r21, r22, tz])
          }
          const copies = facePatternCopies(shape, f.nears ?? [], f.faceFp, f.faceFpV2, f.faceFpTopo, matrices)
          if (copies.length) {
            // Keep copies separate so each resulting sheet has a reliable Thicken target.
            copies.forEach((copy, index) => parkedBodies.push({ name: `Circular Face Pattern (surface) ${index + 1}`, shape: copy }))
            buildWarnings.push(`Circular Face Pattern：已建立 ${copies.length} 個 B-rep 面副本（每張皆可獨立 Stitch / Thicken）`)
            const a = _lastResolvedFaceFp; if (a?.length) _resolvedFaceFp[f.id] = a
            const b = _lastResolvedFaceFpV2; if (b?.length) _resolvedFaceFpV2[f.id] = b
            const c = _lastResolvedFaceFpTopo; if (c?.length) _resolvedFaceFpTopo[f.id] = c
          } else buildWarnings.push('Circular Face Pattern：未能解析所選面或沒有可建立的副本 — 已保持原實體')
        } else if (f.targets?.length) {
          for (const tid of f.targets) {
            const snap = cpSnap[tid]
            if (!snap || !snap.after) { buildWarnings.push('环形阵列：目标特征唔存在/被抑制 — 已跳过该目标'); continue }
            const tf = features.find((x) => x.id === tid) as { operation?: string; op?: string } | undefined
            const wasCut = !!tf && (tf.operation === 'cut' || tf.op === 'cut')
            try {
              if (wasCut && snap.before) {
                const removed = snap.cutTool ? snap.cutTool.clone() : snap.before.clone().cut(snap.after.clone())
                for (const a of angles) shape = shape.cut(removed.clone().rotate(a, ctr, ax))
              } else {
                if (snap.before) {
                  const removed = snap.before.clone().cut(snap.after.clone())
                  if (removed.faces.length) for (const a of angles) shape = shape.cut(removed.clone().rotate(a, ctr, ax))
                }
                const added = snap.before ? snap.after.clone().cut(snap.before.clone()) : snap.after.clone()
                if (added.faces.length) for (const a of angles) shape = fuseRobust(shape, added.clone().rotate(a, ctr, ax), ax)   // #70：兜底微沉沿旋转轴，唔再写死世界 Z（绕 X/Y/斜轴阵列先救得到共面失败）
              }
            } catch (e) { buildWarnings.push('环形阵列副本失败（目标 delta 布尔）：' + ((e as any)?.message || e)) }
          }
        } else {
          try {
            const base = shape
            let acc = base
            for (const a of angles) acc = fuseRobust(acc, base.clone().rotate(a, ctr, ax), ax)   // #70：兜底微沉沿旋转轴，唔再写死世界 Z
            shape = acc
          } catch (e) { buildWarnings.push('环形阵列失败：' + ((e as any)?.message || e)) }
        }
      }
    } else if (f.type === 'split' && shape) {
      // S128 分割（保历史）：把活动 shape 沿轴对齐平面切两半。复用 splitBuild 同款 box/intersect 纪律。
      // 喂两个独立 clone 入两个布尔（唔郁原 shape）—— 避免「同一底层 shape 喂两刀」嘅唔稳（见 splitBuild 注释）。
      const SP = 2000
      let lo: any, hi: any
      if (f.planeOrigin && f.planeNormal) {
        // S184 任意平面切：建两个【定向半空间盒】（lo=+法向半 / hi=−法向半），逐字节复用 S157 平面裁剪 idiom（worker:1995-2014）。
        // makeBaseBox 已 X/Y 居中、底面 local z=0、向 +z 延 S → 旋转 local +Z 至 ±法向 → 底面坐 planeOrigin。【勿加 .translate(-S/2,-S/2,0)】（S157 anti-bug 注:1999）。
        const pn = f.planeNormal, po = f.planeOrigin, Ln = Math.hypot(pn[0], pn[1], pn[2]) || 1
        const mkOriented = (sgn: number): any => {
          const n: [number, number, number] = [sgn * pn[0] / Ln, sgn * pn[1] / Ln, sgn * pn[2] / Ln]
          let b = makeBaseBox(SP, SP, SP)
          const dot = Math.max(-1, Math.min(1, n[2]))           // [0,0,1]·n
          const ax: [number, number, number] = [-n[1], n[0], 0]  // cross([0,0,1], n)
          const axL = Math.hypot(ax[0], ax[1], ax[2])
          if (axL > 1e-6) { const angDeg = Math.acos(dot) * 180 / Math.PI; b = b.rotate(angDeg, [0, 0, 0], [ax[0] / axL, ax[1] / axL, ax[2] / axL]) }
          else if (dot < 0) { b = b.rotate(180, [0, 0, 0], [1, 0, 0]) }   // n ∥ −Z
          return b.translate(po[0], po[1], po[2])
        }
        lo = mkOriented(1); hi = mkOriented(-1)   // lo = +法向半空间、hi = −法向半空间
      } else {
        const mkBox = (cx: number, cy: number, cz: number): any => makeBaseBox(SP, SP, SP).translate(cx, cy, cz - SP / 2)
        if (f.axis === 'X') { lo = mkBox(f.offset - SP / 2, 0, 0); hi = mkBox(f.offset + SP / 2, 0, 0) }
        else if (f.axis === 'Y') { lo = mkBox(0, f.offset - SP / 2, 0); hi = mkBox(0, f.offset + SP / 2, 0) }
        else { lo = mkBox(0, 0, f.offset - SP / 2); hi = mkBox(0, 0, f.offset + SP / 2) }
      }
      try {
        const partLo = shape.clone().intersect(lo)
        const partHi = shape.clone().intersect(hi)
        const keepLo = f.keep !== 'hi'
        const active = keepLo ? partLo : partHi
        const parkedHalf = keepLo ? partHi : partLo
        if (!active || active.wrapped?.IsNull?.() || !parkedHalf || parkedHalf.wrapped?.IsNull?.()) {
          buildWarnings.push('⚠ 分割：平面没穿过实体 — 已保持原样')
        } else {
          shape = active
          parkedBodies.push({ name: (keepLo ? f.nameB : f.nameA) || `分割${parkedBodies.length + 1}`, shape: parkedHalf })
        }
      } catch (e) { buildWarnings.push('分割失败：' + ((e as any)?.message || e)) }
    }
    // 审计修复：移除型特征（cut 拉伸 / bodyboolean / 分割）把实体完全切空（vol≈0 但 IsNull=false，唔抛错）
    // → 空体静默往后传、后续特征连锁失效、几何静默丢失。喺此验体积：切空 → 回滚 _shapeBefore + 标 failed（同 S107 口径）。
    if (shape && ((f.type === 'extrude' && (f as any).operation === 'cut') || f.type === 'bodyboolean' || f.type === 'split') && _shapeBefore && (_shapeBefore as any).wrapped && !(_shapeBefore as any).wrapped.IsNull()) {
      let _vNow = NaN
      try { const g = new _oc.GProp_GProps_1(); _oc.BRepGProp.VolumeProperties_1((shape as any).wrapped, g, false, false, false); _vNow = Math.abs(g.Mass()) } catch { /* */ }
      if (Number.isFinite(_vNow) && _vNow < 1e-6) {
        shape = _shapeBefore; parkedBodies = _parkedBefore
        failedFeatures.push({ id: f.id, type: f.type, msg: '该特征把实体完全切空（结果零体积）— 已回滚保留上一步几何' })
        buildWarnings.push('⚠ 特征令实体变空（零体积）— 已回滚，唔污染后续特征')
        if (!noCache) { _rcSnaps[_i] = null; _rcSigs[_i] = sigs[_i] }
        recordHistory(_i)
        continue
      }
    }
    } catch (e) {
      shape = _shapeBefore  // S107：回滚单特征半成品，唔污染后续特征
      parkedBodies = _parkedBefore  // S110：parked 一并原子回滚
      failedFeatures.push({ id: f.id, type: f.type, msg: (e as any)?.message || String(e) })
      if (!noCache) { _rcSnaps[_i] = null; _rcSigs[_i] = sigs[_i] }  // 唔缓存坏态：下次到呢度强制全量重算
      recordHistory(_i)   // S1：坏特征已回滚到 _shapeBefore，录返呢个回滚态（index-keyed 对齐，回望见到稳定旧态）
      continue  // 跳过 cpSnap / prevBefore / rcRecord，用上一有效 shape 续 build（build past）
    }
    if (_cpT) cpSnap[f.id] = { before: _cpB, after: shape ? shape.clone() : null, cutTool: _boolKindAt[_i] === 'cut' ? _boolToolAt[_i]?.clone() : undefined }  // T757：执行后快照
    if (f.type !== 'cpattern' && f.type !== 'pattern' && f.type !== 'sketch') { prevBefore = snapBefore; prevWasCut = f.type === 'extrude' && f.operation === 'cut' }
    rcRecord(_i)
    recordHistory(_i)   // S1：逐特征录 shape 历史 + 变换保序标记
  }
  if (!noCache) { _rcSigs.length = features.length; _rcSnaps.length = features.length }
  return shape
}

// Involute spur-gear outline (z teeth, module m, pressure angle pa°) as a closed 2D polygon.
// Real involute flanks; radial root connection; sharp-tip clamp so low-tooth gears don't self-cross.
function gearProfile2D(m: number, z: number, paDeg = 20): [number, number][] {
  const pa = (paDeg * Math.PI) / 180
  const r = (m * z) / 2, rb = r * Math.cos(pa), ra = r + m, rd = Math.max(r - 1.25 * m, 0.5)
  const inv = (t: number): [number, number] => [rb * (Math.cos(t) + t * Math.sin(t)), rb * (Math.sin(t) - t * Math.cos(t))]
  const tAt = (R: number) => Math.sqrt(Math.max(0, (R / rb) ** 2 - 1))
  const pol = (t: number) => { const p = inv(t); return Math.atan2(p[1], p[0]) }
  const halfBase = Math.PI / (2 * z) + (Math.tan(pa) - pa)   // half tooth angle at the base circle
  const tStart = tAt(Math.max(rb, rd))
  let tTip = tAt(ra)
  if (pol(tTip) > halfBase * 0.985) { let lo = tStart, hi = tTip; for (let it = 0; it < 32; it++) { const mid = (lo + hi) / 2; if (pol(mid) < halfBase * 0.985) lo = mid; else hi = mid } tTip = lo }  // clamp pointed teeth
  const N = 8, out: [number, number][] = []
  for (let i = 0; i < z; i++) {
    const phi = (i * 2 * Math.PI) / z
    out.push([rd * Math.cos(phi - halfBase), rd * Math.sin(phi - halfBase)])
    for (let k = 0; k <= N; k++) { const t = tStart + ((tTip - tStart) * k) / N; const rad = rb * Math.sqrt(1 + t * t); const ang = phi - halfBase + pol(t); out.push([rad * Math.cos(ang), rad * Math.sin(ang)]) }
    for (let k = N; k >= 0; k--) { const t = tStart + ((tTip - tStart) * k) / N; const rad = rb * Math.sqrt(1 + t * t); const ang = phi + halfBase - pol(t); out.push([rad * Math.cos(ang), rad * Math.sin(ang)]) }
    out.push([rd * Math.cos(phi + halfBase), rd * Math.sin(phi + halfBase)])
  }
  return out
}

// Resample a 3D polyline into equal-arc-length points.  Used by Path Pattern
// when its source sketch lies on an arbitrary reference plane.
function resamplePath3(path: [number, number, number][], count: number): [number, number, number][] {
  if (path.length < 2 || count < 2) return path.slice()
  const cum = [0]; let total = 0
  for (let i = 1; i < path.length; i++) { total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]); cum.push(total) }
  if (total < 1e-6) return path.slice()
  const out: [number, number, number][] = []
  for (let k = 0; k < count; k++) {
    const target = (total * k) / (count - 1)
    let i = 1; while (i < cum.length - 1 && cum[i] < target) i++
    const span = cum[i] - cum[i - 1] || 1, t = (target - cum[i - 1]) / span, a = path[i - 1], b = path[i]
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])
  }
  return out
}

// Resample a polyline into `count` points spaced evenly by arc length (for pattern-along-path).
function resamplePath(path: [number, number][], count: number): [number, number][] {
  if (path.length < 2 || count < 2) return path.slice()
  const cum = [0]; let total = 0
  for (let i = 1; i < path.length; i++) { total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); cum.push(total) }
  if (total < 1e-6) return path.slice()
  const out: [number, number][] = []
  for (let k = 0; k < count; k++) {
    const target = (total * k) / (count - 1)
    let i = 1; while (i < cum.length - 1 && cum[i] < target) i++
    const t = (target - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1)
    out.push([path[i - 1][0] + t * (path[i][0] - path[i - 1][0]), path[i - 1][1] + t * (path[i][1] - path[i - 1][1])])
  }
  return out
}

function meshOf(shape: any): MeshData {
  // angularTolerance 0.2 rad (~11.5°, ~31 facets/circle) — smoother curved faces/holes/fillets.
  // T804（报告 P2）：线性容差【自适应包围盒】— 固定 0.04mm 喺大型弯管/扫掠件会爆三角（实测 elbow
  // 344k！）。改 tolerance = clamp(对角线 ×0.05%, 0.04, 0.4)：细件维持 0.04 嘅幼细,大件按比例放粗,
  // 视觉差唔到但三角数受控（弯管由 ~34 万降到 ~万级）。导出仍可用 fine 精度另细分。
  let tol = 0.04, angTol = 0.2
  try {
    const b = shape.boundingBox.bounds as [number[], number[]]
    const diag = Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2])
    if (Number.isFinite(diag) && diag > 0) {
      tol = Math.min(0.6, Math.max(0.04, diag * 0.0012))
      // T805（报告问题 6）：线性 + 角度容差都自适应 — 大型曲面/管件（弯管 diag~126）嘅圆周分面数 + 沿弧长
      // 环数系三角爆炸主因。固定 0.2rad(~31 面/圈)+0.04mm 喺大件过密。按 diag 放粗：角度到 ~0.6rad(~10 面/圈)、
      // 线性到 diag×0.12%；细件（diag<57）维持 0.2/0.04 幼细。elbow 实测 344k→视图级幾萬；导出用 fine 另细分。
      angTol = Math.min(0.45, Math.max(0.2, diag * 0.005))   // cap 0.45rad ≈ 14 面/圈（公认「够圆」下限，唔会见棱）
    }
  } catch { /* 攞唔到 bbox → 用默认 0.04 / 0.2 */ }
  const m = shape.mesh({ tolerance: tol, angularTolerance: angTol })
  return { vertices: m.vertices, triangles: m.triangles, normals: m.normals, faceGroups: m.faceGroups }   // S99：逐面 run，令分割子面可分开拣
}

// T749：网格切片 — 平面 y=Y 同三角形求交得线段，按端点量化（1e-3）链接成闭环（外轮廓 + 孔内环）。
// 开链（非水密缝/数值断点）诚实丢弃。返回 (x,z) 点环数组，供剖面线 evenodd 填充。
function sliceMeshAtY(mesh: MeshData, y: number): [number, number][][] {
  const v = mesh.vertices, t = mesh.triangles
  const segs: [number, number, number, number][] = []
  for (let i = 0; i < t.length; i += 3) {
    const o = [t[i] * 3, t[i + 1] * 3, t[i + 2] * 3]
    const cross: [number, number][] = []
    for (let e = 0; e < 3; e++) {
      const a = o[e], b = o[(e + 1) % 3]
      const da = v[a + 1] - y, db = v[b + 1] - y
      if ((da > 0) !== (db > 0) && Math.abs(da - db) > 1e-12) {
        const s = da / (da - db)
        cross.push([v[a] + (v[b] - v[a]) * s, v[a + 2] + (v[b + 2] - v[a + 2]) * s])
      }
    }
    if (cross.length === 2 && (Math.abs(cross[0][0] - cross[1][0]) > 1e-9 || Math.abs(cross[0][1] - cross[1][1]) > 1e-9)) {
      segs.push([cross[0][0], cross[0][1], cross[1][0], cross[1][1]])
    }
  }
  if (!segs.length) return []
  const Q = 1e-3
  const key = (x: number, z: number) => `${Math.round(x / Q)},${Math.round(z / Q)}`
  const adj = new Map<string, number[]>()   // 端点 → 关联线段索引
  segs.forEach((s, i) => {
    for (const k of [key(s[0], s[1]), key(s[2], s[3])]) { const a = adj.get(k); if (a) a.push(i); else adj.set(k, [i]) }
  })
  const used = new Array(segs.length).fill(false)
  const loops: [number, number][][] = []
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue
    used[i] = true
    const loop: [number, number][] = [[segs[i][0], segs[i][1]], [segs[i][2], segs[i][3]]]
    let guard = segs.length + 2
    while (guard-- > 0) {
      const cur = loop[loop.length - 1]
      const k = key(cur[0], cur[1])
      const cands = (adj.get(k) || []).filter((j) => !used[j])
      if (!cands.length) break
      const j = cands[0]
      used[j] = true
      const s = segs[j]
      const next: [number, number] = key(s[0], s[1]) === k ? [s[2], s[3]] : [s[0], s[1]]
      if (key(next[0], next[1]) === key(loop[0][0], loop[0][1])) { loops.push(loop); break }  // 闭合
      loop.push(next)
    }
  }
  return loops.filter((lp) => lp.length >= 3)
}

const api = {
  async ready(): Promise<boolean> {
    await ready
    return true
  },

  // S189：草图文字 → 草图几何（poly 轮廓）。Fusion 草图文字落喺草图里 → 可镜像/阵列/做拉伸/旋转/扫掠轮廓。
  // worker 已 loadFont('cad')（line 233）；textToSketchShapes 纯 TS 离散字形（opentype getPath）。返回每个轮廓嘅 [x,y] 点列。
  async textSketchContours(text: string, size: number, curveTol?: number): Promise<number[][][]> {
    await ready
    try {
      const font = getFont('cad') as unknown as { getPath(t: string, x: number, y: number, s: number): { commands: unknown[] } }
      const shapes = textToSketchShapes(text || 'TEXT', { size: Math.max(2, size || 12), pos: [0, 0], align: 'center', font: font as never, ...(curveTol && curveTol > 0 ? { curveTol } : {}) })
      const out: number[][][] = []
      for (const s of shapes) { const pts = (s as { pts?: [number, number][] }).pts; if (pts && pts.length >= 3) out.push(pts.map((p) => [p[0], p[1]])) }
      return out
    } catch { return [] }
  },

  // P2 批7：圆角/倒角实时预览 — 临时 append 特征后重建。T730 前缀缓存令成本 ≈ 一次 fillet solve
  // + remesh（基础特征 sig 逐字节不变 → LCP 全中只算新特征）。唔郁 current（session shape 留返真 rebuild 管）。
  async previewRound(features: Feature[]): Promise<MeshData | null> {
    await ready
    try {
      await prepareStepBodies(features)
      const shape = buildShape(features)
      if (!shape) return null
      return { ...meshOf(shape), warnings: buildWarnings.length ? buildWarnings.slice() : undefined, failed: failedFeatures.length ? failedFeatures.slice() : undefined }
    } catch (e) { console.error('[cad.worker] previewRound failed:', e); return null }
  },

  // Replay the parametric feature tree and return the resulting mesh (+ parked multibody meshes).
  async rebuild(features: Feature[]): Promise<MeshData | null> {
    await ready
    try {
      await prepareStepBodies(features)  // stepbody 异步预解析（同步 buildShape 前）
      const shape = buildShape(features)
      const parked = parkedBodies.length
        ? parkedBodies.map((b) => { try { return { name: b.name, ...(b.kind ? { kind: b.kind } : {}), ...meshOf(b.shape) } } catch { return null } }).filter(Boolean) as NonNullable<MeshData['parked']>
        : undefined
      if (!shape) {
        current = null
        // 全部实体都被泊车（最后一个特征系 newbody）：仍然返回泊车实体俾视口显示
        if (parked && parked.length) return { vertices: [], triangles: [], normals: [], parked, warnings: buildWarnings.length ? buildWarnings.slice() : undefined, failed: failedFeatures.length ? failedFeatures.slice() : undefined }
        // T756 / GM-W5 5.1：净独立草图 + 参考面（全部特征都系 'sketch' / 'datum'，无实体输出）— 正常嘅零实体文档，唔系失败。
        // （首个参考面加喺空零件、或纯草图+datum 文档 → shape 为 null 但唔系错，要返有效空 mesh 令 applyFeatures 提交特征。）
        if (features.length && features.every((f) => f.type === 'sketch' || f.type === 'datum')) return { vertices: [], triangles: [], normals: [], warnings: buildWarnings.length ? buildWarnings.slice() : undefined, failed: failedFeatures.length ? failedFeatures.slice() : undefined }
        return null
      }
      current = shape
      return { ...meshOf(shape), resolvedSketchFaces: { ...resolvedSketchFaces }, parked, warnings: buildWarnings.length ? buildWarnings.slice() : undefined, failed: failedFeatures.length ? failedFeatures.slice() : undefined, resolvedEdgeFp: Object.keys(_resolvedEdgeFp).length ? { ..._resolvedEdgeFp } : undefined, resolvedEdgeFpV2: Object.keys(_resolvedEdgeFpV2).length ? { ..._resolvedEdgeFpV2 } : undefined, resolvedFaceFp: Object.keys(_resolvedFaceFp).length ? { ..._resolvedFaceFp } : undefined, resolvedFaceFpV2: Object.keys(_resolvedFaceFpV2).length ? { ..._resolvedFaceFpV2 } : undefined, resolvedFaceFpTopo: Object.keys(_resolvedFaceFpTopo).length ? { ..._resolvedFaceFpTopo } : undefined }
    } catch (e) {
      console.error('[cad.worker] rebuild failed:', e)
      return null
    }
  },

  // Split a body (rebuilt from features) by an axis-aligned plane into two solids.
  // Rebuilds the shape twice so each boolean gets an independent OCCT shape
  // (clone() shares the underlying shape, and booleans consume their operands).
  async splitBuild(features: Feature[], axis: 'X' | 'Y' | 'Z' | { origin: [number, number, number]; normal: [number, number, number] }, offset = 0): Promise<{ a: MeshData; b: MeshData } | null> {
    await ready
    try {
      await prepareStepBodies(features)
      // noCache：两个独立 build 各自畀一个布尔用（clone 共享底层 shape 喂两个布尔唔稳阵 — 原注释教训）
      const s1 = buildShape(features, true)
      if (!s1 || failedFeatures.length) return null
      const s2 = buildShape(features, true)
      if (!s2 || failedFeatures.length) return null
      const S = 2000
      // makeBaseBox is centered in X,Y but spans z∈[0,S] (corner at Z=0) → only Z needs -S/2 to center.
      const box = (cx: number, cy: number, cz: number) => makeBaseBox(S, S, S).translate(cx, cy, cz - S / 2)
      let lo: any, hi: any
      if (typeof axis === 'object') {
        const pn = axis.normal, po = axis.origin, ln = Math.hypot(pn[0], pn[1], pn[2]) || 1
        const halfSpace = (sign: number): any => {
          const n: [number, number, number] = [sign * pn[0] / ln, sign * pn[1] / ln, sign * pn[2] / ln]
          let b = makeBaseBox(S, S, S)
          const dot = Math.max(-1, Math.min(1, n[2]))
          const rotAxis: [number, number, number] = [-n[1], n[0], 0]
          const rotLen = Math.hypot(rotAxis[0], rotAxis[1], rotAxis[2])
          if (rotLen > 1e-6) b = b.rotate(Math.acos(dot) * 180 / Math.PI, [0, 0, 0], [rotAxis[0] / rotLen, rotAxis[1] / rotLen, rotAxis[2] / rotLen])
          else if (dot < 0) b = b.rotate(180, [0, 0, 0], [1, 0, 0])
          return b.translate(po[0], po[1], po[2])
        }
        lo = halfSpace(1); hi = halfSpace(-1)
      } else if (axis === 'X') { lo = box(offset - S / 2, 0, 0); hi = box(offset + S / 2, 0, 0) }
      else if (axis === 'Y') { lo = box(0, offset - S / 2, 0); hi = box(0, offset + S / 2, 0) }
      else { lo = box(0, 0, offset - S / 2); hi = box(0, 0, offset + S / 2) }
      return { a: meshOf(s1.intersect(lo)), b: meshOf(s2.intersect(hi)) }
    } catch (e) {
      console.error('[cad.worker] splitBuild failed:', e)
      return null
    }
  },

  // T776（S56-②）：草图轮廓分割实体 — profile 拉通做刀（对称贯穿），A=cut B=intersect 两半。
  // splitBuild 同款纪律：两次独立 buildShape + 两个独立刀 prism（clone 共享底层教训）。
  async splitBySketch(features: Feature[], profile: SketchProfile, plane: Plane, baseZ: number): Promise<{ a: MeshData; b: MeshData } | null> {
    await ready
    try {
      await prepareStepBodies(features)
      const s1 = buildShape(features, true)
      const s2 = buildShape(features, true)
      if (!s1 || !s2) return null
      const S = 2000
      const mkPrism = (): any => {
        const sk = profileToSketch(profile, baseZ, plane) as any
        const solid = sk.extrude(S) as any
        // 对称贯穿：向后移半程（RES_SIGN 处理 XZ 反向）
        const n = PLANE_N[plane], off = -RES_SIGN[plane] * S / 2
        return solid.translate(n[0] * off, n[1] * off, n[2] * off)
      }
      const a = s1.cut(mkPrism())
      const b = s2.intersect(mkPrism())
      const ma = meshOf(a), mb = meshOf(b)
      if (!ma.triangles.length || !mb.triangles.length) return null
      return { a: ma, b: mb }
    } catch (e) {
      console.error('[cad.worker] splitBySketch failed:', e)
      return null
    }
  },

  // Orthographic 2D projections (front/top/right) of the current body → SVG path data
  // for an engineering drawing (visible solid + hidden dashed lines).
  async projectViews(): Promise<DrawView[] | null> {
    await ready
    if (!current) return null
    try {
      const flat = (p: string[] | string[][]): string[] => (Array.isArray(p[0]) ? (p as string[][]).flat() : (p as string[]))
      const planes: ('front' | 'top' | 'right')[] = ['front', 'top', 'right']
      const views: DrawView[] = planes.map((pl) => {
        const { visible, hidden } = drawProjection(current, pl)
        return { name: pl, vb: visible.toSVGViewBox(6), visible: flat(visible.toSVGPaths()), hidden: flat(hidden.toSVGPaths()) }
      })
      // + an isometric reference view (parallel projection from a corner direction)
      try {
        const cam = new ProjectionCamera([200, -200, 160]).lookAt(current)
        const { visible, hidden } = drawProjection(current, cam)
        views.push({ name: 'iso', vb: visible.toSVGViewBox(6), visible: flat(visible.toSVGPaths()), hidden: flat(hidden.toSVGPaths()) })
      } catch { /* iso view is optional */ }
      return views
    } catch (e) {
      console.error('[cad.worker] projectViews failed:', e)
      return null
    }
  },

  // Section view: cut the solid in half through its centre (front half removed) and project the FRONT
  // view of the remaining half — reveals internal features (holes/cavities). Uses a CLONE so `current`
  // (the live body) is never consumed. Returns a DrawView labelled 'section', or null on failure.
  async projectSection(frac = 0.5, axis: 'Y' | 'X' = 'Y'): Promise<DrawView | null> {
    await ready
    if (!current) return null
    try {
      const flat = (p: string[] | string[][]): string[] => (Array.isArray(p[0]) ? (p as string[][]).flat() : (p as string[]))
      const b = current.boundingBox.bounds
      const f = Math.min(0.95, Math.max(0.05, frac))
      const big = 1e6
      // T749/T791：剖切轴 — Y（默认）沿深度切、睇前视；X 沿阔度切、睇右视（侧剖）
      const ai = axis === 'X' ? 0 : 1
      const cutAt = b[0][ai] + (b[1][ai] - b[0][ai]) * f
      const tool = axis === 'X'
        ? makeBaseBox(big, big, big).translate(cutAt + big / 2, 0, -big / 2)   // 移走 x ≥ cutAt 半边
        : makeBaseBox(big, big, big).translate(0, cutAt + big / 2, -big / 2)   // 移走 y ≥ cutAt 半边
      const cut = current.clone().cut(tool)
      const { visible, hidden } = drawProjection(cut, axis === 'X' ? 'right' : 'front')
      const vis = flat(visible.toSVGPaths())
      if (!vis.length) return null
      // 剖面线 — 自写网格切片（确定性，唔靠 face 投影 API）：切面闭环（孔=内环），
      // map 落视图坐标，单 path + evenodd 填充（孔自动留空）。失败诚实降级：冇 hatch。
      let hatch: string[] | undefined
      try {
        // 切片面微移 ε（标准 slicer 技巧）：避开正正落喺三角形顶点/边上嘅退化交点（断链 → 环数错）
        const eps = Math.max(1e-6, (b[1][ai] - b[0][ai]) * 2e-4)
        const mesh0 = meshOf(current)
        // X 轴剖：交换 x↔y 顶点后照用 sliceMeshAtY（复用已验证嘅接龙代码）→ 环系 [y, z]
        const mesh = axis === 'X' ? { ...mesh0, vertices: (() => { const v = mesh0.vertices.slice(); for (let i = 0; i < v.length; i += 3) { const t = v[i]; v[i] = v[i + 1]; v[i + 1] = t } return v })() } : mesh0
        const loops = sliceMeshAtY(mesh, cutAt - eps)
        if (loops.length) {
          const vb = visible.toSVGViewBox(6).split(/\s+/).map(Number)
          const b2 = cut.boundingBox.bounds
          // front 视图：CAD x → 屏幕右；right 视图：CAD y → 屏幕右。CAD z → 屏幕上（SVG y 向下）。
          const hi = axis === 'X' ? 1 : 0   // 环嘅水平坐标对应 CAD 轴
          const sx = (u: number) => vb[0] + 6 + (u - b2[0][hi])
          const sy = (z: number) => vb[1] + 6 + (b2[1][2] - z)
          const d = loops.map((lp) => 'M' + lp.map(([u, z]) => `${sx(u).toFixed(3)},${sy(z).toFixed(3)}`).join('L') + 'Z').join('')
          hatch = [d]
        }
      } catch (e) { console.warn('[cad.worker] section hatch skipped:', e) }
      return { name: 'section', vb: visible.toSVGViewBox(6), visible: vis, hidden: flat(hidden.toSVGPaths()), hatch, cutFrac: f, cutAxis: axis }
    } catch (e) {
      console.error('[cad.worker] projectSection failed:', e)
      return null
    }
  },

  // Import a real STEP B-rep file and return its tessellated mesh (for a reference component).
  async importStep(buf: ArrayBuffer): Promise<MeshData | null> {
    await ready
    try {
      let shape = await importSTEP(new Blob([buf]))
      // T762（S45/③后）：ShapeFix_Shape 治愈 — 修复烂面/开壳/翻法线嘅入口件（plus 内核新符号）。
      // 失败诚实跳过（用原 shape），唔好令本来导入到嘅嘢反而冧。
      try {
        const fixer = new _oc.ShapeFix_Shape_2(shape.wrapped)
        const prog = new _oc.Message_ProgressRange_1()
        if (fixer.Perform(prog)) { const fixed = cast(fixer.Shape()); if (fixed && fixed.wrapped && !fixed.wrapped.IsNull()) shape = fixed }
        prog.delete(); fixer.delete()
      } catch { /* heal 失败 → 原样 */ }
      return meshOf(shape)
    } catch (e) {
      console.error('[cad.worker] importStep failed:', e)
      return null
    }
  },

  // T762（S45/③后）：彩色装配 STEP 导入 — STEPCAFControl_Reader（plus 内核新符号）读 XCAF：
  // 逐 free-shape 出 mesh + 颜色（linear→sRGB hex）。零件名要 Standard_GUID/FindAttribute（未绑定）—
  // 诚实回退「零件N」，下次内核迭代再补。≥2 件先算装配（单件走 importStep/stepbody 原路）。
  // DEV 探针（T762 调试）：importStepAssembly 行到边一步
  async getStepDbg(): Promise<string> { return _stepDbg },
  // S134 DEV 探针：对 baseFeatures 重建出嘅 shape，报告同一组 stored fp（v1 + v2）在【当前（可能已旋转）边集】上
  //   分别解析到边集中嘅边索引 + 该边中点 + 框架/唯一性诊断。纯只读、唔改任何状态、唔接生产路径。
  //   令旋转不变性 PROOF 可直接读出「v1 退回 near-point 嘅边」vs「v2 跟到嘅边」——而唔靠网格几何反推。
  async _fpResolveDbg(
    baseFeatures: Feature[],
    edgeFp: string[],
    edgeFpV2: string[],
    nears: [number, number, number][],
  ): Promise<unknown> {
    await ready
    const shape = buildShape(baseFeatures)
    if (!shape) return { error: 'no shape' }
    const edges = shape.edges as any[]
    const midOf = (i: number): [number, number, number] => { const m = edges[i].pointAt(0.5); return [+m.x.toFixed(3), +m.y.toFixed(3), +m.z.toFixed(3)] }
    // v1-only 决策（edgeFpV2 传 undefined → 纯 v1 路径，等于今日行为）
    const v1mids = _fpSelectMids(shape, edgeFp, nears, undefined)
    // v2-wired 决策（带 v2 → advisory gate）
    const v2mids = _fpSelectMids(shape, edgeFp, nears, edgeFpV2)
    // 诊断：框架 wellConditioned + 当前边集上每条 stored v2 fp 嘅唯一性 count
    const cloud = _fpModelVerts(shape)
    const frame = cloud.length ? principalFrame(cloud) : null
    const v2Counts = new Map<string, number>()
    if (cloud.length) for (let i = 0; i < edges.length; i++) { const fp = edgeFingerprintV2(cloud, _fpEdgePoly(edges[i])); v2Counts.set(fp, (v2Counts.get(fp) ?? 0) + 1) }
    // 把解析出嘅 mid 反查返边索引（最近边中点）
    const toIdx = (mids: [number, number, number][] | null): number[] | null => {
      if (!mids) return null
      return mids.map((p) => { let bi = -1, bd = Infinity; for (let i = 0; i < edges.length; i++) { const m = edges[i].pointAt(0.5); const d = (m.x - p[0]) ** 2 + (m.y - p[1]) ** 2 + (m.z - p[2]) ** 2; if (d < bd) { bd = d; bi = i } } return bi })
    }
    // 当 _fpSelectMids 返 null（v1 真 miss）时，生产路径退回【裸 near-point on stale near】= 今日漂移结果。
    // 复刻 roundNearPoints 嘅最近边选边（sample pointAt），报告佢落边集嗰条 idx。
    const nearPointIdx = nears.map((p) => { let bi = -1, bd = Infinity; for (let i = 0; i < edges.length; i++) { let dmin = Infinity; for (const t of [0, 0.25, 0.5, 0.75, 1]) { const q = edges[i].pointAt(t); const d = (q.x - p[0]) ** 2 + (q.y - p[1]) ** 2 + (q.z - p[2]) ** 2; if (d < dmin) dmin = d } if (dmin < bd) { bd = dmin; bi = i } } return bi })
    return {
      nEdges: edges.length,
      v1SelectIsNull: v1mids === null,                  // true → 生产会退回下面 nearPointIdx（今日漂移）
      v1ResolvedIdx: toIdx(v1mids),
      v1EffectiveIdx: v1mids ? toIdx(v1mids) : nearPointIdx,  // v1 的真实最终落点（miss → near-point）
      v2SelectIsNull: v2mids === null,
      v2ResolvedIdx: toIdx(v2mids),
      v2EffectiveIdx: v2mids ? toIdx(v2mids) : nearPointIdx,
      nearPointStaleIdx: nearPointIdx,                  // 裸 near-point on stale near 落边
      wellConditioned: frame ? frame.wellConditioned : null,
      v2Uniqueness: edgeFpV2.map((fp) => v2Counts.get(fp) ?? 0),
      allEdgeMids: edges.map((_, i) => midOf(i)),
    }
  },
  // S133：读 parked 曲面 #target 嘅控制网（NurbsConvert + Poles_2，只读）→ {nu,nv,poles row-major, nFaces}。
  // 供「编辑曲面控制点」UI 显示极点球 + deltas 索引基准。须喺 rebuild 之后调（读当前 parkedBodies）。
  // S133+（多面）：face = 读【哪一张 B-rep 面】嘅网（缺省 0 → 同旧档逐字节一致）。nFaces = 该壳总面数，
  // 供 UI「面 1/N」循环按钮。planar-guard 行 _nurbsNetOfFace（NurbsConvert-FIRST），平/直面返 null 软跳过。
  async getControlNet(target: number, face = 0): Promise<{ nu: number; nv: number; poles: [number, number, number][]; nFaces: number } | null> {
    await ready
    try {
      const t = parkedBodies[target]
      if (!t || !_oc || !_oc.GeomConvert || !_oc.BRep_Tool) return null
      const faces = (t.shape as any).faces as any[]
      if (!faces || !faces.length) return null
      const fi = (face >= 0 && face < faces.length) ? face : 0
      // 行 makeEllipsoid idiom：GCWithScope 管理生 _oc 句柄（Surface_2 / NurbsConvert / OuterWire 句柄）— 未包 r() 时
      // 无主中间句柄喺 emscripten 触发内核错（实证：ruled 曲面读链报 9108520，包 r() 后 OK）。
      const r = GCWithScope()
      const net = _nurbsNetOfFace(r, faces[fi].wrapped)   // planar-guard + NurbsConvert-FIRST（读路径同写路径一致）
      if (!net) return null
      const pa = net.bs.Poles_2()
      const r0 = pa.LowerRow(), c0 = pa.LowerCol()
      const nu = pa.UpperRow() - r0 + 1, nv = pa.UpperCol() - c0 + 1
      const poles: [number, number, number][] = []
      for (let r2 = 0; r2 < nu; r2++) for (let c = 0; c < nv; c++) { const p = pa.Value(r0 + r2, c0 + c); poles.push([p.X(), p.Y(), p.Z()]) }
      return { nu, nv, poles, nFaces: faces.length }
    } catch { return null }
  },
  // T792 DEV 探针：查 _oc 上有冇某啲符号（内核能力探测 — 缺符号就要补 yml 重编）
  async ocProbe(names: string[]): Promise<Record<string, boolean>> {
    await ready
    const oc = _oc as Record<string, unknown>
    if (!oc) return Object.fromEntries(names.map((n) => [n, false]))
    const out: Record<string, boolean> = {}
    for (const n of names) out[n] = typeof oc[n] === 'function' || (typeof oc[n] === 'object' && oc[n] != null)
    return out
  },

  // S133+ DEV 探针（true-topo-naming 可行性裁决）：现役 live 内核（replicad_plus，NO OCCT 重建）上，
  // OCCT 每-op LINEAGE 方法（BRepBuilderAPI_MakeShape::Modified/Generated/IsDeleted，被 BRepFilletAPI_MakeFillet
  // 同 BRepAlgoAPI 布尔 op 继承）系咪真系喺 JS 可调 + 返回非空结果？答到呢条 → 决定真拓扑命名能否
  // 纯 JS（per-op history 串链）起出嚟而【唔使重编内核】。
  // 纯只读：起一个临时 box + raw fillet，唔掂任何 parkedBodies / buildWarnings / 缓存；全程 try/catch 永不抛。
  // 每个生 _oc 句柄都经 r()=GCWithScope 管理（makeEllipsoid idiom — 未包 r() 喺 emscripten 触发不透明内核错如 9108520）。
  async historyProbe(): Promise<{
    ok: boolean
    filletWorked: boolean
    hasModified: boolean
    modifiedNonEmpty: boolean
    hasGenerated: boolean
    generatedNonEmpty: boolean
    hasIsDeleted: boolean
    isDeletedResult: boolean | string
    listIterable: boolean
    listReadHow: string
    notes: string[]
  }> {
    await ready
    const notes: string[] = []
    const result = {
      ok: false,
      filletWorked: false,
      hasModified: false,
      modifiedNonEmpty: false,
      hasGenerated: false,
      generatedNonEmpty: false,
      hasIsDeleted: false,
      isDeletedResult: false as boolean | string,
      listIterable: false,
      listReadHow: '',
      notes,
    }
    if (!_oc) { notes.push('no _oc — kernel not loaded'); return result }
    const r = GCWithScope()
    try {
      // ── 1. 起一个简单实体（box 40×30×20），攞一条竖边 + 一张面（replicad 包装 → .wrapped = TopoDS）──
      const box: any = makeBaseBox(40, 30, 20)
      const edges = box.edges as any[]
      const faces = box.faces as any[]
      if (!edges || !edges.length || !faces || !faces.length) { notes.push('box 冇 edges/faces — 包装读取失败'); return result }
      const edge0 = edges[0]
      const face0 = faces[0]
      notes.push(`box: ${edges.length} edges, ${faces.length} faces`)

      // ── 2. RAW fillet op：揾返实际绑定嘅 BRepFilletAPI_MakeFillet 构造签名（_1=单 shape / 或带 ChFi3d 枚举）──
      // 实证 emscripten 绑定常以 _1/_2 后缀分 overload；优先最简单嗰个，逐个 fall back。
      const MF: any = _oc.BRepFilletAPI_MakeFillet_2 || _oc.BRepFilletAPI_MakeFillet_1 || _oc.BRepFilletAPI_MakeFillet
      if (!MF) { notes.push('BRepFilletAPI_MakeFillet 完全未绑定 — raw fillet op 起唔到'); return result }
      let mk: any = null
      const filShape = (_oc.ChFi3d_FilletShape && (_oc.ChFi3d_FilletShape.ChFi3d_Rational ?? _oc.ChFi3d_FilletShape.ChFi3d_Polynomial)) ?? 0
      // 试 (shape, ChFi3d 枚举) → fall back (shape)
      try { mk = r(new MF(box.wrapped, filShape)); notes.push('MakeFillet 构造：new MF(shape, ChFi3d enum) OK') } catch (e1) {
        try { mk = r(new MF(box.wrapped)); notes.push('MakeFillet 构造：new MF(shape) OK（无枚举）') } catch (e2) {
          notes.push('MakeFillet 构造失败：' + ((e1 as any)?.message || e1) + ' / ' + ((e2 as any)?.message || e2)); return result
        }
      }

      // Add overload：试 Add_2(radius, edge) → Add_1 → Add（绑定常以后缀分 overload）
      const radius = 4
      let added = false
      for (const nm of ['Add_2', 'Add_1', 'Add']) {
        if (typeof mk[nm] === 'function') {
          try { mk[nm](radius, edge0.wrapped); added = true; notes.push(`Add：mk.${nm}(radius, edge) OK`); break }
          catch (e) { notes.push(`mk.${nm}(radius, edge) threw: ` + ((e as any)?.message || e)) }
        }
      }
      if (!added) { notes.push('所有 Add overload 都失败 — 加唔到边畀 fillet'); return result }

      // Build：试带 Message_ProgressRange → 无参
      let built = false
      try {
        const prog = _oc.Message_ProgressRange_1 ? r(new _oc.Message_ProgressRange_1()) : undefined
        try { mk.Build(prog); built = true; notes.push('Build(ProgressRange) OK') }
        catch (eb) { try { mk.Build(); built = true; notes.push('Build() 无参 OK') } catch (eb2) { notes.push('Build 失败：' + ((eb as any)?.message || eb) + ' / ' + ((eb2 as any)?.message || eb2)) } }
      } catch { try { mk.Build(); built = true; notes.push('Build() 无参 OK（ProgressRange 起唔到）') } catch (eb3) { notes.push('Build 失败：' + ((eb3 as any)?.message || eb3)) } }
      if (!built) { notes.push('Build 全失败'); return result }

      // IsDone 校验（fillet op 真系做成）
      let done = false
      try { done = typeof mk.IsDone === 'function' ? !!mk.IsDone() : true } catch { done = false }
      result.filletWorked = done
      notes.push('IsDone：' + done)
      // 攞 fillet 结果（证实真系出到几何，唔系 lineage 探针所必需但用嚟 sanity check）
      try { if (done && typeof mk.Shape === 'function') { const sh = mk.Shape(); if (sh && !sh.IsNull()) { const out = cast(sh); notes.push('fillet 结果面数：' + ((out as any).faces?.length ?? '?')) } } } catch (e) { notes.push('读 fillet Shape 失败：' + ((e as any)?.message || e)) }

      // ── 3. 关键 LINEAGE 探针 — 喺 fillet op 上调 Modified/Generated/IsDeleted，报存在 + 非空 ──
      // 工具：读一个 TopTools_ListOfShape 嘅大小（试 Size/Extent）+ 可迭代性（First/Last，因为
      // TopTools_ListIteratorOfListOfShape 未绑定 — 见 ocProbe）。
      const listSize = (lst: any): number => {
        if (!lst) return -1
        try { if (typeof lst.Size === 'function') return lst.Size() } catch { /* */ }
        try { if (typeof lst.Extent === 'function') return lst.Extent() } catch { /* */ }
        return -1
      }
      const probeList = (lst: any, who: string): { nonEmpty: boolean; iterable: boolean; how: string } => {
        const n = listSize(lst)
        notes.push(`${who}: list size=${n}`)
        const nonEmpty = n > 0
        let iterable = false
        let how = ''
        if (lst) {
          // 唔靠未绑定嘅 ListIterator：试 First()/Last() 直读首末元素（TopTools_ListOfShape 自带）
          if (typeof lst.First === 'function' && typeof lst.Last === 'function') {
            try { const f = lst.First(); if (f && (typeof f.IsNull !== 'function' || !f.IsNull())) { iterable = true; how = 'First()/Last()' } }
            catch (e) { notes.push(`${who}.First() threw: ` + ((e as any)?.message || e)) }
          }
          if (!iterable && typeof lst.cbegin === 'function') { iterable = true; how = 'cbegin()/STL iterator' }
        }
        return { nonEmpty, iterable, how }
      }

      // Modified(face) — fillet 把邻面改成新面（lineage 核心）
      if (typeof mk.Modified === 'function') {
        result.hasModified = true
        try {
          const lst = mk.Modified(face0.wrapped)
          const p = probeList(lst, 'Modified(face0)')
          result.modifiedNonEmpty = p.nonEmpty
          if (p.iterable) { result.listIterable = true; result.listReadHow = p.how }
        } catch (e) { notes.push('mk.Modified(face) threw: ' + ((e as any)?.message || e)) }
      } else notes.push('mk.Modified 唔系 function')

      // Generated(edge) — fillet 由原边生出新圆角面（lineage 核心）
      if (typeof mk.Generated === 'function') {
        result.hasGenerated = true
        try {
          const lst = mk.Generated(edge0.wrapped)
          const p = probeList(lst, 'Generated(edge0)')
          result.generatedNonEmpty = p.nonEmpty
          if (p.iterable) { result.listIterable = true; if (!result.listReadHow) result.listReadHow = p.how }
        } catch (e) { notes.push('mk.Generated(edge) threw: ' + ((e as any)?.message || e)) }
      } else notes.push('mk.Generated 唔系 function')

      // IsDeleted(edge) — 原边喺结果中是否消失（返回 bool，唔系 list）
      if (typeof mk.IsDeleted === 'function') {
        result.hasIsDeleted = true
        try { result.isDeletedResult = !!mk.IsDeleted(edge0.wrapped) } catch (e) { result.isDeletedResult = 'threw: ' + ((e as any)?.message || e) }
        notes.push('IsDeleted(edge0) = ' + result.isDeletedResult)
      } else notes.push('mk.IsDeleted 唔系 function')

      result.ok = true
      return result
    } catch (e) {
      notes.push('historyProbe top-level threw: ' + ((e as any)?.message || e))
      return result
    }
  },

  async importStepAssembly(buf: ArrayBuffer): Promise<{ name: string; color?: string; mesh: MeshData; step?: string }[] | null> {
    await ready
    const oc = _oc
    if (!oc) { _stepDbg = 'no _oc'; return null }
    try {
      _stepDbg = 'start'
      oc.FS.writeFile('/imp.step', new Uint8Array(buf))
      const doc = new oc.TDocStd_Document(new oc.TCollection_ExtendedString_2('BinXCAF', false))
      const hDoc = new oc.Handle_TDocStd_Document_2(doc)
      const reader = new oc.STEPCAFControl_Reader_1()
      reader.SetColorMode(true)
      reader.SetNameMode(true)
      const rs = reader.ReadFile('/imp.step') as { value?: number } | number
      const rv = typeof rs === 'number' ? rs : rs?.value
      if (rv !== 1) { _stepDbg = 'ReadFile status ' + JSON.stringify(rs); try { oc.FS.unlink('/imp.step') } catch { /* */ } return null }  // IFSelect_RetDone = 1
      _stepDbg = 'read ok'
      const prog = new oc.Message_ProgressRange_1()
      const okT = reader.Transfer_1(hDoc, prog)
      prog.delete(); try { oc.FS.unlink('/imp.step') } catch { /* */ }
      if (!okT) { _stepDbg = 'Transfer failed'; return null }
      _stepDbg = 'transfer ok'
      const shapeTool = oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main()).get()
      const colorTool = oc.XCAFDoc_DocumentTool.ColorTool(doc.Main()).get()
      const labels = new oc.TDF_LabelSequence_1()
      shapeTool.GetFreeShapes(labels)
      // free shape 通常系【装配根】— 要递归展开 components 先攞到叶零件（实例 label 自带位姿）
      const leafs: any[] = []
      const expand = (lab: any, depth: number) => {
        if (depth < 8 && oc.XCAFDoc_ShapeTool.IsAssembly(lab)) {
          const seq = new oc.TDF_LabelSequence_1()
          oc.XCAFDoc_ShapeTool.GetComponents(lab, seq, false)
          for (let j = 1; j <= seq.Length(); j++) expand(seq.Value(j), depth + 1)
        } else leafs.push(lab)
      }
      for (let i = 1; i <= labels.Length(); i++) expand(labels.Value(i), 0)
      _stepDbg = `free=${labels.Length()} leafs=${leafs.length}`
      // linear→sRGB（OCCT Quantity_Color 内部系 linear；同导出端 sRGB→linear 啱啱互逆）
      const hex = (r: number, g: number, b: number) => {
        const s = (c: number) => { const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0') }
        return '#' + s(r) + s(g) + s(b)
      }
      const colorOf = (lab: any): string | undefined => {
        try {
          const rgba = new oc.Quantity_ColorRGBA_1()
          let got = colorTool.GetColor_5(lab, oc.XCAFDoc_ColorType.XCAFDoc_ColorGen, rgba) || colorTool.GetColor_5(lab, oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf, rgba)
          if (!got) {
            // 实例 label 冇色 → 试 referred product label（XCAF 去重后色挂喺 part label）
            const ref = new oc.TDF_Label()
            if (oc.XCAFDoc_ShapeTool.GetReferredShape(lab, ref)) {
              got = colorTool.GetColor_5(ref, oc.XCAFDoc_ColorType.XCAFDoc_ColorGen, rgba) || colorTool.GetColor_5(ref, oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf, rgba)
            }
          }
          const out = got ? (() => { const c = rgba.GetRGB(); return hex(c.Red(), c.Green(), c.Blue()) })() : undefined
          rgba.delete()
          return out
        } catch { return undefined }
      }
      const parts: { name: string; color?: string; mesh: MeshData; step?: string }[] = []
      for (let i = 0; i < leafs.length; i++) {
        const lab = leafs[i]
        try {
          const shp = oc.XCAFDoc_ShapeTool.GetShape_2(lab)   // 实例 label → 位姿已 bake
          if (!shp || shp.IsNull()) throw new Error('Empty STEP leaf')
          // A Fusion multi-body design may be one XCAF leaf containing a
          // compound of solids, rather than an assembly of product labels.
          // Split by B-rep solids, never by disconnected triangles (a hollow
          // solid or touching parts must retain their actual topology).
          const solids = Array.from(iterTopo(shp, 'solid'))
          if (solids.length > 1) {
            for (let k = 0; k < solids.length; k++) {
              const solid = cast(solids[k])
              parts.push({ name: `零件${i + 1}·实体${k + 1}`, color: colorOf(lab), mesh: meshOf(solid), step: await solid.blobSTEP().text() })
            }
          } else {
            const shape = cast(shp)
            parts.push({ name: `零件${i + 1}`, color: colorOf(lab), mesh: meshOf(shape), step: await shape.blobSTEP().text() })
          }
        } catch (e) { throw new Error(`STEP part ${i + 1} could not be imported: ${String(e)}`) }
      }
      _stepDbg += ` parts=${parts.length}`
      return parts.length ? parts : null
    } catch (e) {
      _stepDbg += ' EXC: ' + String((e as any)?.message ?? e)
      console.error('[cad.worker] importStepAssembly failed:', e)
      return null
    }
  },

  async exportSTL(quality?: 'coarse' | 'medium' | 'fine'): Promise<ArrayBuffer | null> {
    await ready
    if (!current) return null
    // T780（S59）：导出细分精度 — deflection 越细面越滑（打印面质直接受益）。默认 medium = 旧行为附近。
    const opt = quality === 'fine' ? { tolerance: 0.01, angularTolerance: 0.1 } : quality === 'coarse' ? { tolerance: 0.5, angularTolerance: 0.8 } : { tolerance: 0.1, angularTolerance: 0.3 }
    const buf = await current.blobSTL(opt).arrayBuffer()
    return transfer(buf, [buf])
  },

  async exportSTEP(): Promise<ArrayBuffer | null> {
    await ready
    if (!current) return null
    const buf = await current.blobSTEP().arrayBuffer()
    return transfer(buf, [buf])
  },

  // T769（S48）：装配工程图 B-rep 投影 — 逐件重建 B-rep + gp_Trsf 摆位 → compound →
  // drawProjection 真 HLR（隐藏线虚线 + 真圆，对比 T732 mesh 投影「无隐藏线/圆变折线」两大暗坑）。
  // trsf = row-major 3×4（同 exportAssemblySTEP 同一约定）。任一件冇 features → 调用方走 mesh 兜底。
  async projectAssemblyViews(parts: { trsf: number[]; features: Feature[] }[]): Promise<DrawView[] | null> {
    await ready
    const savedParked = parkedBodies, savedWarns = buildWarnings
    try {
      const shapes: any[] = []
      for (const p of parts) {
        try {
          await prepareStepBodies(p.features)
          const shp = buildShape(p.features, true)
          if (!shp || !shp.wrapped) continue
          const trsf = new _oc.gp_Trsf_1()
          trsf.SetValues(p.trsf[0], p.trsf[1], p.trsf[2], p.trsf[3], p.trsf[4], p.trsf[5], p.trsf[6], p.trsf[7], p.trsf[8], p.trsf[9], p.trsf[10], p.trsf[11])
          const b = new _oc.BRepBuilderAPI_Transform_2(shp.wrapped, trsf, true)
          const placed = cast(b.Shape())
          trsf.delete()
          if (placed && placed.wrapped && !placed.wrapped.IsNull()) shapes.push(placed)
        } catch (e) { console.warn('[projectAssemblyViews] part skipped:', e) }
      }
      if (!shapes.length) return null
      const compound = shapes.length === 1 ? shapes[0] : makeCompound(shapes)
      const flat = (p: string[] | string[][]): string[] => (Array.isArray(p[0]) ? (p as string[][]).flat() : (p as string[]))
      const planes: ('front' | 'top' | 'right')[] = ['front', 'top', 'right']
      return planes.map((pl) => {
        const { visible, hidden } = drawProjection(compound, pl)
        return { name: pl, vb: visible.toSVGViewBox(6), visible: flat(visible.toSVGPaths()), hidden: flat(hidden.toSVGPaths()) }
      })
    } catch (e) {
      console.error('[cad.worker] projectAssemblyViews failed:', e)
      return null
    } finally {
      parkedBodies = savedParked
      buildWarnings = savedWarns
    }
  },

  // T759（S35）：装配彩色 STEP — raw _oc XCAF 直驱（T754 证实 STEPCAFControl_Writer/XCAFDoc 已绑定喺 shipped wasm，
  // 唔使等自编译）。每零件由 features 重建 B-rep（noCache 唔污染增量缓存），名+颜色+位姿入 XCAF 文档，AP214 写出。
  // 成个包 try/catch → null（T755 教训：单版 wasm 唔解 C++ exception）；单零件失败降级 skipped，唔拖冧成单导出。
  // 用 Perform_2（内部 multi=0L）唔用 Transfer_1 — embind CString 传 null/'' 会跌入多文件 extern 模式陷阱。
  async exportAssemblySTEP(asmName: string, parts: { name: string; color?: [number, number, number]; trsf: number[]; features?: Feature[]; useCurrent?: boolean }[]): Promise<{ buf: ArrayBuffer; exported: string[]; skipped: string[] } | null> {
    await ready
    const oc = _oc
    if (!oc) return null
    // buildShape(noCache) 都会重置呢两个模块变量 — 完场还原，免得污染主模型状态
    const savedParked = parkedBodies, savedWarns = buildWarnings
    const exported: string[] = [], skipped: string[] = []
    try {
      const doc = new oc.TDocStd_Document(new oc.TCollection_ExtendedString_2('BinXCAF', false))
      const hDoc = new oc.Handle_TDocStd_Document_2(doc)
      const shapeTool = oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main()).get()
      const colorTool = oc.XCAFDoc_DocumentTool.ColorTool(doc.Main()).get()
      const asmLabel = shapeTool.NewShape()
      // isMultiByte=true：JS string 经 embind 出嚟系 UTF-8 — false 会逐字节当 Latin-1，中文名烂晒
      oc.TDataStd_Name.Set_1(asmLabel, new oc.TCollection_ExtendedString_2(asmName || 'assembly', true))
      for (const p of parts) {
        try {
          let shp: any = null
          if (p.useCurrent && current) shp = current
          else if (p.features && p.features.length) { await prepareStepBodies(p.features); shp = buildShape(p.features, true) }
          if (!shp || !shp.wrapped) { skipped.push(p.name); continue }
          const partLabel = shapeTool.AddShape(shp.wrapped, false, false)
          oc.TDataStd_Name.Set_1(partLabel, new oc.TCollection_ExtendedString_2(p.name || 'part', true))
          const trsf = new oc.gp_Trsf_1()
          trsf.SetValues(p.trsf[0], p.trsf[1], p.trsf[2], p.trsf[3], p.trsf[4], p.trsf[5], p.trsf[6], p.trsf[7], p.trsf[8], p.trsf[9], p.trsf[10], p.trsf[11])
          const loc = new oc.TopLoc_Location_2(trsf)
          const instLabel = shapeTool.AddComponent_1(asmLabel, partLabel, loc)
          if (p.color) {
            const rgba = new oc.Quantity_ColorRGBA_5(p.color[0], p.color[1], p.color[2], 1)
            // part + instance 两个 label 都上色：XCAF 对相同几何会去重 part label（last-wins），instance 色兜底
            colorTool.SetColor_3(partLabel, rgba, oc.XCAFDoc_ColorType.XCAFDoc_ColorGen)
            colorTool.SetColor_3(instLabel, rgba, oc.XCAFDoc_ColorType.XCAFDoc_ColorGen)
            rgba.delete()
          }
          trsf.delete(); loc.delete()
          exported.push(p.name)
        } catch (e) { console.warn('[exportAssemblySTEP] part skipped:', p.name, e); skipped.push(p.name) }
      }
      if (!exported.length) return null
      shapeTool.UpdateAssemblies()
      oc.Interface_Static.SetIVal('write.step.schema', 5)  // AP214（带颜色嘅惯用 schema）
      const writer = new oc.STEPCAFControl_Writer_1()
      writer.SetColorMode(true)
      writer.SetNameMode(true)
      const prog = new oc.Message_ProgressRange_1()
      const ok = writer.Perform_2(hDoc, '/asm.step', prog)
      writer.delete(); prog.delete()
      if (!ok) return null
      const file = oc.FS.readFile('/asm.step')
      try { oc.FS.unlink('/asm.step') } catch { /* 已读到内存，留低都唔碍事 */ }
      const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer
      return transfer({ buf, exported, skipped }, [buf])
    } catch (e) {
      console.error('[cad.worker] exportAssemblySTEP failed:', e)
      return null
    } finally {
      parkedBodies = savedParked
      buildWarnings = savedWarns
    }
  },

  // Measure the edge nearest a 3D point (CAD coords): length + curve type, and for a closed circle
  // its radius/diameter (a hole's bore Ø — which two-point distance can't give). Arcs report length only.
  async measureEdgeAt(p: [number, number, number]): Promise<{ length: number; kind: string; closed: boolean; radius: number | null; mid: [number, number, number] } | null> {
    await ready
    if (!current) return null
    try {
      const edges = (current as any).edges as any[]
      let best: any = null, bestD = Infinity
      for (const e of edges) {
        let dmin = Infinity
        for (const t of [0, 0.25, 0.5, 0.75, 1]) { const q = e.pointAt(t); const d = (q.x - p[0]) ** 2 + (q.y - p[1]) ** 2 + (q.z - p[2]) ** 2; if (d < dmin) dmin = d }
        if (dmin < bestD) { bestD = dmin; best = e }
      }
      if (!best) return null
      const kind = String(best.geomType)
      const closed = !!best.isClosed
      const length: number = best.length
      // Radius for any circular edge — full circle OR arc — via the circumradius of 3 sampled points
      // (R = abc/4·Area). Works where length/2π can't (arcs), so a fillet's arc reports its radius.
      let radius: number | null = null
      if (/circle/i.test(kind)) {
        const A = best.pointAt(0.25), B = best.pointAt(0.5), C = best.pointAt(0.75)
        const ab = Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z)
        const bc = Math.hypot(B.x - C.x, B.y - C.y, B.z - C.z)
        const ca = Math.hypot(C.x - A.x, C.y - A.y, C.z - A.z)
        const ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z
        const vx = C.x - A.x, vy = C.y - A.y, vz = C.z - A.z
        const crx = uy * vz - uz * vy, cry = uz * vx - ux * vz, crz = ux * vy - uy * vx
        const area2 = Math.hypot(crx, cry, crz) // = 2·triangle area
        if (area2 > 1e-9) { const r = (ab * bc * ca) / (2 * area2); if (isFinite(r) && r > 0) radius = r }
      }
      const m = best.pointAt(0.5)
      return { length, kind, closed, radius, mid: [m.x, m.y, m.z] }
    } catch (e) {
      console.error('[cad.worker] measureEdgeAt failed:', e)
      return null
    }
  },

  // P2 audit：解析 click 点最近嘅 B-rep 边 → 采样 polyline（CAD 坐标）俾 UI 成条高亮（拣棱唔再只得一粒橙点）。
  // 同 measureEdgeAt 同款最近边搜索；33 点采样对直线/圆弧/样条都够滑。
  async edgePolylineAt(p: [number, number, number]): Promise<{ pts: [number, number, number][]; kind: string } | null> {
    await ready
    if (!current) return null
    try {
      const edges = (current as any).edges as any[]
      let best: any = null, bestD = Infinity
      for (const e of edges) {
        let dmin = Infinity
        for (const t of [0, 0.25, 0.5, 0.75, 1]) { const q = e.pointAt(t); const d = (q.x - p[0]) ** 2 + (q.y - p[1]) ** 2 + (q.z - p[2]) ** 2; if (d < dmin) dmin = d }
        if (dmin < bestD) { bestD = dmin; best = e }
      }
      if (!best) return null
      const N = 32
      const pts: [number, number, number][] = []
      for (let i = 0; i <= N; i++) { const q = best.pointAt(i / N); pts.push([q.x, q.y, q.z]) }
      return { pts, kind: String(best.kind ?? '') }
    } catch { return null }
  },

  // Preserve true OCCT edges when a parametric body is frozen into an assembly
  // component.  This deliberately samples the B-rep, rather than deriving false
  // edges from the display mesh's triangles.
  async extractEdgePolylines(): Promise<{ pts: [number, number, number][]; kind: string }[]> {
    await ready
    if (!current) return []
    try {
      const edges = (current as any).edges as any[]
      return edges.map((edge) => {
        const pts: [number, number, number][] = []
        for (let i = 0; i <= 32; i++) {
          const q = edge.pointAt(i / 32)
          pts.push([q.x, q.y, q.z])
        }
        return { pts, kind: String(edge.kind ?? '') }
      })
    } catch { return [] }
  },

  // S164：构造点落喺最近边上（Fusion「Point Along Path」/「Point at Vertex」）。
  // 找最近边（同 measureEdgeAt 嘅采样法），返回 pointAt(ratio) + 起/终/中点 + 长度 + 离 click 最近嗰个端点。
  // store 用：边上点=at(ratio)、端点=nearEnd、中点=mid、距离 d=ratio d/length。ratio 由 t=0(起)→1(终)。
  async pointOnEdgeAt(p: [number, number, number], ratio: number): Promise<{ at: [number, number, number]; start: [number, number, number]; end: [number, number, number]; mid: [number, number, number]; nearEnd: [number, number, number]; tangent: [number, number, number]; length: number; kind: string } | null> {
    await ready
    if (!current) return null
    try {
      const edges = (current as any).edges as any[]
      let best: any = null, bestD = Infinity
      for (const e of edges) {
        let dmin = Infinity
        for (const t of [0, 0.25, 0.5, 0.75, 1]) { const q = e.pointAt(t); const d = (q.x - p[0]) ** 2 + (q.y - p[1]) ** 2 + (q.z - p[2]) ** 2; if (d < dmin) dmin = d }
        if (dmin < bestD) { bestD = dmin; best = e }
      }
      if (!best) return null
      const r = Math.max(0, Math.min(1, ratio))
      const at = best.pointAt(r), s = best.startPoint, en = best.endPoint, m = best.pointAt(0.5)
      const ds = (s.x - p[0]) ** 2 + (s.y - p[1]) ** 2 + (s.z - p[2]) ** 2
      const de = (en.x - p[0]) ** 2 + (en.y - p[1]) ** 2 + (en.z - p[2]) ** 2
      const ne = ds <= de ? s : en
      // S166：边切向（Plane Along Path 用）。tangentAt 返 Vector(.x/.y/.z) → 归一；退化用端点弦向兜底；
      // 两者皆零（零长边）→ 保留 [0,0,1] 安全默认（永不返 [0,0,0] 令调用方建退化平面）。
      let tg: [number, number, number] = [0, 0, 1]
      const chord = (): boolean => { const dx = en.x - s.x, dy = en.y - s.y, dz = en.z - s.z, L = Math.hypot(dx, dy, dz); if (L > 1e-9) { tg = [dx / L, dy / L, dz / L]; return true } return false }
      try {
        const tv = best.tangentAt(r)
        const tx = (tv?.x ?? 0), ty = (tv?.y ?? 0), tz = (tv?.z ?? 0)
        const L = Math.hypot(tx, ty, tz)
        if (L > 1e-9) tg = [tx / L, ty / L, tz / L]
        else chord()   // tangent 退化 → 弦向；弦向亦零则保留 [0,0,1]
      } catch { chord() }
      return {
        at: [at.x, at.y, at.z], start: [s.x, s.y, s.z], end: [en.x, en.y, en.z],
        mid: [m.x, m.y, m.z], nearEnd: [ne.x, ne.y, ne.z], tangent: tg, length: best.length, kind: String(best.geomType),
      }
    } catch (e) {
      console.error('[cad.worker] pointOnEdgeAt failed:', e)
      return null
    }
  },

  // S168：相交曲线（Fusion Surface > Intersection Curve）—— 所有体两两求交，抽交线 edges 采样成 3D polylines 返 store 做参考曲线。
  // 体集 = 活动实体 current（如有）+ 全部泊车曲面/壳 parkedBodies（皆 module-level，persist between calls）。
  // 内核路径（live ocProbe 实证 BRepAlgoAPI_Section_1..4 已绑、BRep_Builder/TopoDS_Compound/ListIterator 未绑）：
  //   BRepAlgoAPI_Section_3(S1,S2,PerformNow=true) → .Shape() = 交线 edges 嘅 compound（castable TopoDS_Shape，唔使迭代未绑嘅 list）
  //   → cast → .edges → e.pointAt(t) 采样（复用 measureEdgeAt/pointOnEdgeAt 嘅 .edges/.pointAt idiom）。
  // 诚实：唔相交嘅 pair 无 edge；全部 pair 都无 → 返空 curves + warning（绝不返 null/垃圾曲线）。纯只读：唔掂 current/parkedBodies/缓存。
  async intersectionCurves(): Promise<{ curves: number[][][]; bodies: number; pairs: number; edges: number; warning?: string } | null> {
    await ready
    try {
      if (!_oc || !_oc.BRepAlgoAPI_Section_3) return { curves: [], bodies: 0, pairs: 0, edges: 0, warning: '相交曲线需要 plus 内核（BRepAlgoAPI_Section 未绑定）' }
      const bodies: any[] = []
      if (current && (current as any).wrapped && !(current as any).wrapped.IsNull()) bodies.push(current)
      for (const pb of parkedBodies) { try { if (pb && pb.shape && (pb.shape as any).wrapped && !(pb.shape as any).wrapped.IsNull()) bodies.push(pb.shape) } catch { /* 跳过坏体 */ } }
      if (bodies.length < 2) return { curves: [], bodies: bodies.length, pairs: 0, edges: 0, warning: '相交曲线需要≥2 个体（活动实体 + 泊车曲面 / 2 张泊车曲面）— 先建多过一个体' }
      const curves: number[][][] = []
      let pairs = 0, edgeCount = 0
      const MAX_PAIRS = 60, MAX_CURVES = 400
      let truncated = false
      for (let i = 0; i < bodies.length && !truncated; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          if (pairs >= MAX_PAIRS || curves.length >= MAX_CURVES) { truncated = true; break }
          pairs++
          try {
            const r = GCWithScope()
            const sec = r(new _oc.BRepAlgoAPI_Section_3((bodies[i] as any).wrapped, (bodies[j] as any).wrapped, true))
            if (typeof sec.IsDone === 'function' && !sec.IsDone()) continue
            const sh = sec.Shape()
            if (!sh || sh.IsNull()) continue
            const wrapped = cast(sh)
            let edges: any[] = []
            try { edges = (wrapped as any).edges as any[] } catch { edges = [] }
            for (const e of edges) {
              if (curves.length >= MAX_CURVES) { truncated = true; break }
              try {
                const L = Number(e.length) || 0
                if (!(L > 1e-7)) continue
                const segs = Math.max(8, Math.min(96, Math.round(L / 1.5)))   // ~1.5mm/段，封 [8,96]
                const poly: number[][] = []
                for (let k = 0; k <= segs; k++) { const q = e.pointAt(k / segs); if (q && Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z)) poly.push([q.x, q.y, q.z]) }
                if (poly.length >= 2) { curves.push(poly); edgeCount++ }
              } catch { /* 跳过坏边 */ }
            }
          } catch { /* 该 pair section 失败 → 跳过（唔影响其它 pair） */ }
        }
      }
      const warning = curves.length === 0 ? '未发现相交曲线（这些体之间唔相交）'
        : truncated ? '相交曲线过多，已截断（只返回前若干条）' : undefined
      return { curves, bodies: bodies.length, pairs, edges: edgeCount, warning }
    } catch (e) {
      console.error('[cad.worker] intersectionCurves failed:', e)
      return null
    }
  },


  // Measure the face nearest a 3D point (CAD coords): its surface area (summed from the face's
  // triangulation) + surface type. Picks the face whose tessellation vertices are closest to the click.
  async measureBodyAt(p: [number, number, number]): Promise<{volume:number}|null> {
    await ready
    if (!current) return null
    const solids = Array.from(iterTopo(current.wrapped, 'solid')).map(shape => cast(shape))
    try {
      let best: typeof current = null, distance = Infinity
      for (const solid of solids) {
        const mesh = solid.mesh(), v = mesh.vertices, t = mesh.triangles
        for (let i=0;i<t.length;i+=3) {
          const a=t[i]*3,b=t[i+1]*3,c=t[i+2]*3
          const d=ptTriDist2(...p,v[a],v[a+1],v[a+2],v[b],v[b+1],v[b+2],v[c],v[c+1],v[c+2])
          if(d<distance){distance=d;best=solid}
        }
      }
      if(!best) return null
      const volume=measureVolume(best)
      return Number.isFinite(volume)&&volume>0?{volume}:null
    } finally { for(const solid of solids) solid.delete() }
  },

  async measureFaceAt(p: [number, number, number]): Promise<{ area: number; kind: string; center: [number, number, number]; radius: number | null } | null> {
    await ready
    if (!current) return null
    try {
      const faces = (current as any).faces as any[]
      let best: any = null, bestD = Infinity
      for (const f of faces) {
        const tri = f.triangulation ? f.triangulation() : null
        if (!tri || !tri.vertices || !tri.vertices.length) continue
        const V = tri.vertices as number[], T = tri.trianglesIndexes as number[]
        let dmin = Infinity
        for (let i = 0; i < T.length; i += 3) {
          const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3
          const d = ptTriDist2(p[0], p[1], p[2], V[a], V[a + 1], V[a + 2], V[b], V[b + 1], V[b + 2], V[c], V[c + 1], V[c + 2])
          if (d < dmin) dmin = d
        }
        if (dmin < bestD) { bestD = dmin; best = { face: f, tri } }
      }
      if (!best) return null
      const V = best.tri.vertices as number[], T = best.tri.trianglesIndexes as number[]
      let area = 0
      for (let i = 0; i < T.length; i += 3) {
        const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3
        const abx = V[b] - V[a], aby = V[b + 1] - V[a + 1], abz = V[b + 2] - V[a + 2]
        const acx = V[c] - V[a], acy = V[c + 1] - V[a + 1], acz = V[c + 2] - V[a + 2]
        const cx = aby * acz - abz * acy, cy = abz * acx - abx * acz, cz = abx * acy - aby * acx
        area += Math.sqrt(cx * cx + cy * cy + cz * cz) / 2
      }
      const c = best.face.center
      const kind = String(best.face.geomType ?? '')
      // For a cylindrical face, derive its radius in closed form from two vertices with opposite
      // (radial) normals: V0 = C ± r·n0 and the diametrically-opposite vertex Vj gives r = |(Vj−V0)·n0 / (nj−n0)·n0|.
      let radius: number | null = null
      const N = best.tri.verticesNormals as number[] | undefined
      if (/cylind/i.test(kind) && N && N.length === V.length && N.length >= 6) {
        // cylinder: V0=C±r·n0; the diametrically-opposite vertex gives r = |(Vj−V0)·n0 / (nj−n0)·n0|
        const n0x = N[0], n0y = N[1], n0z = N[2]
        let jj = -1, worst = Infinity
        for (let i = 3; i < N.length; i += 3) { const dot = N[i] * n0x + N[i + 1] * n0y + N[i + 2] * n0z; if (dot < worst) { worst = dot; jj = i } }
        if (jj > 0) {
          const dv = (V[jj] - V[0]) * n0x + (V[jj + 1] - V[1]) * n0y + (V[jj + 2] - V[2]) * n0z
          const dn = (N[jj] - n0x) * n0x + (N[jj + 1] - n0y) * n0y + (N[jj + 2] - n0z) * n0z
          if (Math.abs(dn) > 1e-6) { const r = Math.abs(dv / dn); if (r > 0 && isFinite(r)) radius = r }
        }
      } else if (/sphere/i.test(kind) && N && N.length === V.length && N.length >= 6) {
        // sphere: every vertex V = C + R·n (radial normal). For two vertices, V0−Vj = R·(n0−nj) ⇒ R = |V0−Vj| / |n0−nj|.
        const n0x = N[0], n0y = N[1], n0z = N[2]
        let jj = -1, worst = Infinity
        for (let i = 3; i < N.length; i += 3) { const dot = N[i] * n0x + N[i + 1] * n0y + N[i + 2] * n0z; if (dot < worst) { worst = dot; jj = i } }
        if (jj > 0) {
          const dvl = Math.hypot(V[jj] - V[0], V[jj + 1] - V[1], V[jj + 2] - V[2])
          const dnl = Math.hypot(N[jj] - n0x, N[jj + 1] - n0y, N[jj + 2] - n0z)
          if (dnl > 1e-6) { const r = dvl / dnl; if (r > 0 && isFinite(r)) radius = r }
        }
      }
      return { area, kind, center: [c.x, c.y, c.z], radius }
    } catch (e) {
      console.error('[cad.worker] measureFaceAt failed:', e)
      return null
    }
  },

  // Capture a persistent identity for faces selected from the viewport.  This is deliberately
  // read-only: callers store the near point together with v1/v2/topology fingerprints, then a
  // later feature rebuild resolves that triple through _ffSelectPts instead of trusting a stale
  // display-mesh face index.  Do not return a partial capture: ordering is part of the feature
  // contract, so an incomplete result must make the UI reject the selection.
  async captureSketchFaceBinding(sourceId: string, near: [number,number,number], normal: [number,number,number]): Promise<SketchFaceBinding | null> {
    await ready
    if (!current || !sourceId) return null
    try {
      current.mesh({ tolerance: 0.1, angularTolerance: 0.5 })
      const refs = _ffCapture(current,[near])
      if (refs.v1.length!==1) return null
      const len = Math.hypot(...normal), n = normal.map(x=>x/len)
      const bbox = _fpBboxVerts(current)
      const faces = current.faces.map((face: any)=>({face,desc:sketchPlanarDescriptor(face)})).filter(({face,desc:d}: any)=>d &&
        _ffFaceFp(face,bbox)===refs.v1[0] && d.normal.every((x: number,i: number)=>Math.abs(x-n[i])<1e-7) && Math.abs(near.reduce((a,x,i)=>a+x*n[i],0)-d.offset)<1e-5)
      if (faces.length!==1) return null
      const desc = faces[0].desc
      const binding: SketchFaceBinding = { sourceId, near, center: desc.center, outline: desc.outline, normal: desc.normal, offset: desc.offset, area: desc.area, edgeLengths: desc.edgeLengths, faceFp: refs.v1, faceFpV2: refs.v2, faceFpTopo: refs.topo }
      resolveSketchFace(current,binding)
      return binding
    } catch { return null }
  },

      async captureFaceRefs(nears: [number, number, number][]): Promise<{ v1: string[]; v2: string[]; topo: string[] } | null> {
    await ready
    if (!current || !nears.length) return null
    try {
      try { (current as any).mesh({ tolerance: 0.1, angularTolerance: 0.5 }) } catch { /* best effort triangulation */ }
      const refs = _ffCapture(current, nears)
      return refs.v1.length === nears.length && refs.v2.length === nears.length && refs.topo.length === nears.length
        ? refs
        : null
    } catch (e) {
      console.error('[cad.worker] captureFaceRefs failed:', e)
      return null
    }
      },

      // Read-only preflight for Face Fillet.  The store calls this before it
      // creates a timeline feature, so non-adjacent faces cannot become a fake
      // no-op history item.
      async sharedFaceEdgeAt(a: [number, number, number], b: [number, number, number]): Promise<[number, number, number] | null> {
        await ready
        if (!current) return null
        try {
          try { (current as any).mesh({ tolerance: 0.1, angularTolerance: 0.5 }) } catch { /* pick data only */ }
          const pick = (p: [number, number, number]): any => {
            let best: any = null, bestD = Infinity
            for (const face of ((current as any).faces as any[])) {
              const tri = face.triangulation ? face.triangulation() : null
              if (!tri?.vertices?.length) continue
              const V = tri.vertices as number[], T = tri.trianglesIndexes as number[]
              for (let i = 0; i + 2 < T.length; i += 3) {
                const ia = T[i] * 3, ib = T[i + 1] * 3, ic = T[i + 2] * 3
                const d = ptTriDist2(p[0], p[1], p[2], V[ia], V[ia + 1], V[ia + 2], V[ib], V[ib + 1], V[ib + 2], V[ic], V[ic + 1], V[ic + 2])
                if (d < bestD) { bestD = d; best = face }
              }
            }
            return best
          }
          const f1 = pick(a), f2 = pick(b)
          if (!f1 || !f2 || f1 === f2) return null
          const d2 = (p: any, q: any) => (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2
          for (const e1 of (f1.edges as any[])) {
            const p0 = e1.pointAt(0), p1 = e1.pointAt(1), pm = e1.pointAt(0.5)
            for (const e2 of (f2.edges as any[])) {
              const q0 = e2.pointAt(0), q1 = e2.pointAt(1), qm = e2.pointAt(0.5)
              if ((d2(p0, q0) + d2(p1, q1) < 1e-8 || d2(p0, q1) + d2(p1, q0) < 1e-8) && d2(pm, qm) < 1e-8) return [pm.x, pm.y, pm.z]
            }
          }
          return null
        } catch { return null }
      },
    }

export type CadAPI = typeof api
expose(api)
