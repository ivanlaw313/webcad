# webcad ↔ Fusion 360 — 3D (非草图) 实现级差距表

Diff of FOUR Fusion first-hand specs (`_fusion_solid_spec.md` / `_fusion_construct_spec.md` /
`_fusion_modify_spec.md` / `_fusion_assembly_spec.md`) against FOUR webcad code inventories
(`_webcad_solid_behavior.md` / `_webcad_construct_behavior.md` / `_webcad_modify_behavior.md` /
`_webcad_assembly_behavior.md`). Clean-room: 只对齐行为/语法，唔抄图标/字眼。

类型 ∈ **A** 直接跟(UI/交互,无内核风险) · **B** 改状态机(中等) · **C** 内核/架构受限(窄版或诚实豁免) ·
**D** 已一致(记录) · **E** Fusion spec 系 inferred/未实证(先补证)。
波次 **V1** 立体 · **V2** 参考几何 · **V3** 修改 · **V4** 装配（用户定优先级：立体最高）。

## Kernel capability re-check（2026-07-17）

Production `replicad_plus` has now been directly probed, rather than inferred from old notes. `DirectEditWrapper` is exported with `DeleteFaceNear`、`ThickenFaceNear`、`OffsetSurfaceNear`、`ExtendFaceNear`、`SplitFaceNearByPlane`、`ReplaceFaceNear`; `BRepOffsetAPI_MakeOffsetShape` and `BRepOffsetAPI_MakeThickSolid` are also present. The safe, tested paths are planar inward Replace Face / Move Face, outward prism-fuse Push Pull, planar-face split, whole-solid offset, and independent face thicken/offset/extend. The probe also confirms that per-face low-level offset, isolated cylindrical-hole resize, arbitrary non-planar rigid face move, and split-by-sketch/edge/surface remain unavailable. Evidence: `tests/geomplate-probe.mjs` and `tests/moveface-probe.test.mjs` (2026-07-17 run).

---

## 一、执行摘要（广东话，畀非技术老细睇）

webcad 个 3D 内核其实好硬净，多数 Fusion 功能都有，甚至有啲仲抛离 Fusion（齿轮箱、可变半径圆角、闭环机构解算、运动关键帧）。所以呢次唔係要「补好多缺功能」，而係补**手感**同**几个真·断层**。

**最痛嘅 6 个 gap（跨四区）：**
1. **筋/腹板（Rib/Web）根本冇建立对话框** — 厚度、方向、深度全部写死喺代码（thickness=6/height=20），用户建嗰下净係得默认值，要入 timeline 先改到。呢个係全表手感最差嗰个，但纯 UI，无内核风险。
2. **移动/复制（Move/Copy）太弱** — Fusion 呢个係最丰富嘅改工具（5 种模式＋点对点＋复制勾＋可移支点），webcad 净係得「输 dx/dy/dz＋绕中心转」。改起上嚟一日都返唔到工。
3. **参考几何有 ~20 条散路** — Fusion 用**一个**统一「构造几何」command（Type 平面/轴/点 ＋ Method 下拉），webcad 20 个平面/轴/点各有各嘅入口同拾取器。建议合并成一个 datum command，代码少一大截、手感一致。
4. **抽壳（Shell）净係向内、单一厚度** — 冇 Outside/Both 方向、冇逐面厚度；Fillet 亦冇 chord-length／setback／面圆角。呢啲係机械件常用嘅细节。
5. **装配嘅 Joint Origin 未做成可复用实体** — joint 只得一个共享世界锚点，冇 Fusion 嗰种「两件各自一个原点＋之间 offset/angle/flip」。呢个係唯一 Fusion 实证到嘅装配特性，信心最高。
6. **关联性（associativity）断层** — 投影几何同大部分 datum 系一次性 bake，source 郁咗都唔跟；Fusion 嘅 Project 默认 live-link。

**波次计划：** V1 先扫立体（用户最紧要）→ V2 参考几何（统一 datum 係重头戏）→ V3 修改（Move/Copy＋Shell＋Fillet）→ V4 装配。

**老实讲边啲做唔到 / 要窄版（内核·架构级）：**
- **多体 per component ＋ occurrence 实例（改一个全部跟）＋ 外部链接件** — 装配架构级，webcad 而家一个 component 就一嚿冻结 mesh，要动大手术。
- **Base Feature / Derive**（无历史外壳 ＋ 跨文档链接）— 冇呢个概念，诚实豁免。
- **Project-to-Surface／文字包裹曲面 emboss／分模线拔模／面圆角·全圆角／Silhouette Split** — 内核能力窄，只能做窄版或豁免。
- ★ **诚实警告：Fusion 嘅装配 spec 本身系「文档非实证」** — 嗰部 Fusion 装配 authoring 全部畀 save-gate 锁住（净係 Joint Origin 实证到），所以装配区大部分 gap 标 **类型 E**，实做前应该喺一个 saved scratch doc 再验一次先落刀。

---

## §立体（V1）— 按手感排序

| # | Fusion 行为（一句） | webcad 现况（一句 + anchor） | 类型 | 波次 |
|---|---|---|---|---|
| S1 | Rib/Web 有建立对话框：Thickness Direction(对称/单侧) · Extent(To Next/Distance) · Flip · Thickness 值（Web 多 Extend Curves） | **无建立对话框**，thickness=6/height=20/draft=0 写死、仅 timeline 可改、限 XY 草图（`store.ts:12351-12354`, `addRib store.ts:12338`） | A | V1 |
| S2 | Extrude Extent「To Object」可去任意面/体/点＋偏移；另有 To Next | To-Object 只去到**与草图平行**嘅平面；To Next 只停第一个实体面（`extrudeToFace store.ts:4729-4739`） | C | V1 |
| S3 | Pattern 对象类型＝Bodies/Faces/Features/构造几何；逐实例 Suppression；Compute Option(Optimized/Identical/Adjust)；另有 Geometric Pattern | 仅 **body\|feature**；无 faces/components；无逐实例抑制；无 compute-option；无 geometric（`Viewport.tsx:4863,4898`） | B | V1 |
| S4 | Mirror 对象类型＝Bodies/Faces/Features | 仅 **body\|feature**，无 components/faces（`Viewport.tsx:4914-4927`） | B | V1 |
| S5 | Sweep Orientation(Perpendicular/Parallel) ＋ Chain-select 实体边做路径 | 单导轨；路径必须係画出嘅草图/构造轴（**唔食实体边链**）；无 Orientation 切换（`openSweepDlg store.ts:4742`, `Viewport.tsx:5629-5693`） | B | V1 |
| S6 | Sweep Type 支持 Path + Guide **Surface** | 无 guide-surface（`sweepGuide` 单导轨 only） | C | V1 |
| S7 | Loft 逐截面端条件(Connected/Tangent/Direction/Sharp) · Rails vs Centerline · 多条 rail | 1 条 rail；连续性係**全局** normal/G1/G2；无逐截面权重、无 centerline（`openLoftDlg store.ts:12937`） | C | V1 |
| S8 | Emboss「Tangent Chain」把文字**包裹落曲面/圆柱面** | 仅**平面**（`toggleEmboss store.ts:4359`, worker `cad.worker.ts:4004-4015`） | C | V1 |
| S9 | Pipe 建立对话框：Section · Section Size · Hollow→Thickness · Distance(0–1) · Operation | 无原语对话框，`addPipe` 写死 outerR=12/innerR=8/wall4（`store.ts:12322`） | A | V1 |
| S10 | Hole Extent＝Distance/To/All（含 To Next/To Object） | 仅 through 或 blind-depth，无 To-Next/To-Object（`holeThrough/holeDepth`） | B | V1 |
| S11 | Thread 17 种标准库 ＋ Full-Length 关→Length/Offset(局部) ＋ Class 下拉 | 仅 ISO metric ＋ modeled ＋ 左旋 ＋ 拾面；无局部长度、无 Class（`othread Viewport.tsx:5199-5207`, `ThreadSpecSelect`） | B | V1 |
| S12 | Extrude Two-Sides 每侧独立 Extent＋Taper；Symmetric 有 Whole/Half 量度切换 | twosides 仅每侧独立距离（`extrudeSide2 store.ts:4720`）；symmetric 无 whole/half | A | V1 |
| S13 | Create Base Feature(无历史外壳) ＋ Derive(跨文档链接) | **两者皆无**（grep 无 basefeature/derive） | C | V1 |
| S14 | Operation 通用 4 (Join/Cut/Intersect/New Body) ＋ Extent(Distance/To/All)＋Direction(One/Two/Symmetric) 全特征共用词汇 | Extrude/Revolve 已有此词汇；但 Rib/Web/Pipe 完全跳过（`sketchOp`, `extrudeExtent store.ts:4722`） | D | V1 |
| S15 | 多选命令「活动拾取槽必须明显＋黏住」，空白点会清槽/平移 | 已部分：extrude 区域拾取黏住；但 Revolve 轴/Sweep 路径导轨/Loft 截面用字段式选择（`Viewport.tsx` featDlg） | A | V1 |
| S16 | 画布上拖拽手柄＋浮动数值框(拖过零反向) 覆盖所有距离/角度 | 仅 `ExtrudeArrow`（`Viewport.tsx:3540`）；多数 featDlg（Revolve 角/Sweep 距/Coil）净字段无手柄 | A | V1 |

**§立体 落地要点（A/B）：**
- S1：加一个 Rib/Web featDlg（仿 `openFeatDlg` 默认块 `store.ts:10646`），把 `addRib store.ts:12351` 嘅硬编码 thickness/height/draft 提升做字段 + Direction(sym/one)/Extent(next/dist)/Flip；worker `cad.worker.ts:3955-3998` 已支持参数，纯接线。
- S3：`Viewport.tsx:4862-4913` pattern/circpattern 加 objectType 选项 faces/components；worker `cad.worker.ts:1832` 复制路径按 face-set/occurrence 分支；suppression = per-instance 布尔遮罩存喺 feature。
- S4：`Viewport.tsx:4914-4927` mirror 加 components target；沿用 `mirrorComponent store.ts:1479` 逻辑到 mirror 特征。
- S5：`openSweepDlg store.ts:4742` 加 orientation 枚举 + 一个「拾实体边链」拾取模式（仿 `roundEdgeAt store.ts:3907` 边拾取）喂 sweep path。
- S9：Pipe 转用 `openFeatDlg('pipe')` 默认块，把 `addPipe store.ts:12322` 硬编码半径做字段（Section/Size/Hollow/Thickness）。
- S10：Hole extent 加 next/toObject，复用 Extrude 嘅 `extrudeToFace` 关联面机制（`store.ts:4729-4739`）到 `commitHole store.ts:10429`。
- S11：`ThreadSpecSelect` 数据表扩到多标准 + 加 Class/局部长度字段；worker `cad.worker.ts:3527` 已参数化。
- S12：`extrudeExtent` twosides 分支加每侧 taper 字段（`store.ts:4722`）；symmetric 加 whole/half 布尔。
- S15：抽一个共用「active selection slot」高亮组件，套落 Revolve/Sweep/Loft featDlg 各拾取槽（现散落 `Viewport.tsx` 各 featDlg）。
- S16：把 `ExtrudeArrow`（`Viewport.tsx:57,3540`）泛化成「手柄＋浮动值框」共用件，接落 revolve 角/sweep 距等 featDlg。

**§立体 波1（GM-3DV1）收官记录：**

已实做（A/B，本波）：
- **S1 Rib/Web 对话框**（前批）· **S3 Pattern 对象类型/抑制/compute**（前批）· **S9 Pipe 对话框**（前批）· **S11 Thread 多标准+等级+局部长度**（前批）· **S12 Extrude 两侧 taper + Symmetric whole/half**（前批）— 已核实端到端接线（Viewport 字段 → store commit → worker 消费），tests `rib-pipe-param`/`pattern-suppress`/`extrude-twosides-taper` 全绿。
- **S16**（本波）：`DragValueHandle`（`SketchLayer.tsx`，泛化自 `ExtrudeArrow`，后者保持不动）+ `RevolveAngleHandle`（接落 `featDlg.params.angle`，抓手坐预览弧前缘外缘、沿切向拖，对话框角度栏 = 浮动数值框实时反映）。抽出共用 `resolveRevolveAxis`/`revolveOuterLoop`（RevolvePreview 亦改用）。
- **S15**（本波）：共用 `.pick-slot.active` CSS（蓝底+蓝环+柔和脉冲）套落 revolve 拾轴/拾中心点、镜像拾面、环形阵列拾轴、扫掠拾实体边等拾取掣；`applyRevAxisPtPick` 点空唔再静默清槽（黏住）。
- **S4**（本波）：Mirror 对象类型加「组件」→ 复用 `mirrorComponent`（`Viewport.tsx` mirror 对话框 target 加 `components`；`store.ts` commitFeatDlg mirror 早分支循环镜像 checkedComps/selectedComponent；`YZ/默认→lr`、`XZ/XY→fb`）。
- **S10**（本波，narrow）：Hole extent **到下一面（To Next）** 完成 —— `holeNextFaceZ`（bodyMesh CAD 三角向 −z 射线，揾正下方最近面）驱动简单孔盲深；`holeToNext` 状态 + 孔对话框勾选；test `hole-tonext` 4/4。**To-Object（拾任意目标面）暂缺** —— worker toFace 关联机制（`cad.worker.ts:1603`）已就绪，但孔流程缺第二个「拾目标面」槽（现只拾入口面），需新拾取槽先接得埋 → 列后续。
- **S5**（本波）：**Orientation（Perpendicular/Parallel）** 完成 —— `sweepOrient` 状态 + 对话框「截面朝向」下拉 + Feature `orient` 字段 + worker `forceProfileSpineOthogonality` passthrough（**仅 parallel 写字段**，perp=缺省不写 → 旧档逐字节；注意旧仓 `forceProfileSpine` key 系 replicad no-op，真 key 为 `forceProfileSpineOthogonality`，故 path3 分支 perp 保旧「非强制正交」行为，唯 drawn-path 分支 perp/parallel 视觉分明）。**实体边链路径（Chain Path）** 完成 —— ribbon `sweepedge` → `startSweepEdgeChain`（开对话框+武装拾边）、`sweepAddEdgeAt`（镜 `roundEdgeAt`）、`chainEdgePolylines`（贪心首尾接力串 path3，test `sweep-edgechain` 7/7）、青色高亮、对话框边 chip + pick-slot 掣、commit 走既有 path3 扫掠分支。

C 项决议（内核/架构受限 — 窄版或诚实豁免，本波唔郁）：
- **S2 Extrude To-Object**：现只到【与草图平行】平面（`extrudeToFace store.ts`）。去任意非平行面/体/点需真·射线-面关联解析（远超本波）→ **窄版维持，豁免非平行目标**。（注：S10 To-Next 已示范 bodyMesh 射线，可作日后 S2/S10-ToObject 共用基座。）
- **S6 Sweep Guide-Surface**：worker 单 auxiliary spine（`guide` 折线导轨）已有，Path+Guide **Surface** 无 → **豁免**（OCCT MakePipeShell 曲面导向属重内核路，趋势级唔值）。
- **S7 Loft 逐截面端条件/Centerline/多 rail**：现全局连续性（`loftContinuity` C1/C2）+ 单 rail → **窄版维持，豁免逐截面权重/centerline/多 rail**。
- **S8 Emboss 包裹曲面**：仅平面 emboss → **豁免曲面/圆柱包裹**（wrap-to-surface 属内核窄能力）。
- **S13 Base Feature / Derive**：**诚实豁免**（无历史外壳＋跨文档链接概念，webcad 无此架构；prompt 已确认豁免）。
- **S14 Operation 词汇一致**：Pipe（S9）已具 4-op（＋加料/－切割/∩相交/⬡新实体）；**Rib/Web 本身系 Join-only** —— 对齐 Fusion（Rib 命令无 Join/Cut/Intersect 选择器，恒加料）→ **一致，无需改动**。

---

## §参考几何（V2）— 按手感排序

| # | Fusion 行为（一句） | webcad 现况（一句 + anchor） | 类型 | 波次 |
|---|---|---|---|---|
| R1 | **一个统一「构造几何」command**：Type 切换(平面/轴/点) ＋ Method 下拉换字段；20 个菜单项只係预设 Type/Method 嘅捷径 | **~20 条散路**：各平面 dispatch `store.ts:9635-9647` ＋ `startDatumPick store.ts:11523` ＋ `startEdgePointPick store.ts:11677` ＋ caxis/cpoint 各自对话框 | B | V2 |
| R2 | Project/Intersect/Project-To-Surface 各有「Projection Link」默认 ON＝跟 source 更新 | 投影＝一次性 bake 嘅折线快照，**唔关联**（`projectRefToSketch store.ts:3710-3728`） | C | V2 |
| R3 | 投影几何渲染成**独特紫/洋红色**＋紫端点，区别于作图线 | 投影入普通可编辑折线，**无独特颜色/线型**（`projectRefToSketch`） | A | V2 |
| R4 | Project To Surface：把草图曲线投影/包裹落目标曲面 | **无**（无 project-to-surface；`ccurves` 係 3D 相交曲线唔係包裹） | C | V2 |
| R5 | Point「Through Two Edges」＝两边交点 | **无**此点方法（cpoints 方法 `store.ts:11876-11808`） | A | V2 |
| R6 | Point「Through Three Planes」＝三面公共交点 | **无**此点方法 | A | V2 |
| R7 | Point「At Edge And Plane」＝边穿平面处 | **无**此点方法 | A | V2 |
| R8 | Point「At Center」拾**圆形边**即得圆心（另含 sphere/torus 中心） | 圆心点仅拾**圆柱面**（`startDatumPick('circcenter') store.ts:11597-11606`），唔食圆边、无球/环中心 | B | V2 |
| R9 | Plane「Through Two Edges」 | **无**此平面方法（construct 摘要 ❌） | A | V2 |
| R10 | Plane「Perpendicular Plane」＝面＋参考＋距离 | 有法向**轴**(`normalaxis`) 但无法向**平面** | A | V2 |
| R11 | 所有 datum(面/轴/点) 皆参数化，随 source 更新 | 仅 src-面 datum(faceOffset/tanPlane) ＋ cylAxis-轴 会 re-derive（`rederiveDatums store.ts:4463,4544-4569`）；2-面中面/3-点面/2-点轴/**全部 cpoints** 係静态快照 | C | V2 |
| R12 | 草图落任意 datum 都跟 datum 郁 | v2 re-bake 仅**cardinal** datum；angle/arb「v2.1 未做」(`store.ts:81`, `9982-9987`) | B | V2 |
| R13 | 「Plane Tangent to Face at Point」＋ Along-Path 0–1 字段（此 build 系 Perpendicular Plane，非 tangent-at-point；0–1 未实证） | webcad 已有 `planepath`(ratio/Nmm) 对上 Along-Path；tangent-at-point 本身此 build 唔存在 | E | V2 |
| R14 | UCS：CONSTRUCT 首项建完整局部坐标系(原点＋3 轴＋3 面) | 无 UCS datum 对象（只有世界原点） | C | V2 |
| R15 | Linetype/构造几何：作图线、中心线、投影线型 | **齐全**：construction+centerline 标志 ＋ cline 工具 ＋ drawConstruction 预切换 ＋ toggleConstruction ＋ 描图底图（`store.ts:58-61,3821-3828,3810,5904,11814`） | D | V2 |

**§参考几何 落地要点（A/B）：**
- R1：新建一个 `datumCommand` 状态（type: plane\|axis\|point + method: enum），把现有 20 个 dispatch（`store.ts:9635-9647` 等）＋拾取器（`startDatumPick`/`startEdgePointPick`/`addPlane*`/`addAxis*`/`addMidpointCPoint`）收编做一个对话框嘅 method 分支；平面仍走 `addDatumFeature store.ts:4613`（保留 timeline 关联），轴/点续用 `caxes`/`cpoints` 数组。
- R3：投影出嚟嘅 shape 打 `projected:true` 标志（仿 `construction?:boolean store.ts:58`），`SketchLayer.tsx:653-654` 加一个专属色/线型分支。
- R5/R6/R7：`store.ts:11876` 附近加三个 cpoint 方法：2 边交点（解两 `edgePolylineAt` 最近交）、3 面交点（三法向线性解）、边穿面（参数求交），全部入 `cpoints store.ts:1049`。
- R8：`startDatumPick('circcenter') store.ts:11597` 扩到接受圆形**边**(用 `cad.edgePolylineAt` 拟合圆心) ＋ 球/环面中心。
- R9：`store.ts` datum 层加 Through-Two-Edges 平面（两边共面→含两边嘅平面，仿 `addPlane3Points store.ts:11777`）。
- R10：加 Perpendicular-Plane method（面＋参考边/点＋距离），复用 `applyDatumPick` 拾面 + `normalaxis` 法向逻辑升成平面。
- R8/R12：R12 把 `_rebakeDatumSketches store.ts:89` 嘅 cardinal-only 限制扩到 arb/angle（要 arb datum 亦存 `datumRef` 签名）。

**§参考几何 波2（GM-3DV2）收官记录：**

新纯几何模块 `src/cad/datumGeom.ts`（node 可单测，`tests/datumgeom.test.mjs` 21/21）：`nearestPointBetweenLines`(R5) · `threePlaneIntersection`(R6) · `edgePlaneIntersection`(R7) · `circleCenterFromPolyline`(R8 Kasa 圆拟合) · `planeThroughTwoEdges`(R9) · `perpendicularPlane`(R10)。

| # | 状态 | 落地（文件·anchor） |
|---|---|---|
| **R1** | **done（headline）** | 统一「构造几何」命令：`datumCmd` 状态 + `openDatumCmd/setDatumCmdType/setDatumCmdMethod/setDatumCmdParam/commitDatumCmdField/datumCmdClickAt/closeDatumCmd`（`store.ts` datumCmd 区）。Type(平面/轴/点) 三态 + Method 下拉（`DATUM_CMD_METHODS`）换字段/拾取槽。一个 command 收编 25 个 method 分三类：**字段法**（偏移/成角/中面平面·xyz 点·dir 轴）、**遗留拾取法**（tangent/midplane/offsetface/parplanept/pathplane/angleplane/normalaxis/planeaxis/edgeaxis/vertex/mid/circcenter — arm 现有 `datumPick`/`edgePtPick`，`applyDatumPick`/`edgePointAt` **原封不动跑 → 零几何回归**）、**累积法**（R5-R10 新几何）。ribbon 新增「构造几何」入口（`ribbon.ts` CONSTRUCT 首项，`datumgeom` dispatch）。对话框 `Viewport.tsx`（featDlg 后），画布累积拾取 dispatch + ESC 退出（`App.tsx`）。 |
| **R3** | **done** | 投影几何 `projected?:boolean`（`store.ts` SketchShape poly）；`projectRefToSketch`/`projectLoopAt` 打标；`SketchLayer.tsx` 紫/洋红 `#b14fd8` 专属色 + 紫端点十字（区别黑作图线，仍可拉伸/编辑）。 |
| **R5** | **done** | Point 两边交点 = 两 3D 直线最近逼近点中点（`nearestPointBetweenLines`）→ `point:twoEdges` 累积法 → cpoints（相距>2mm 提示非真相交）。 |
| **R6** | **done** | Point 三面交点 = 三法向线性解（`threePlaneIntersection`）→ `point:threePlanes`（拾 3 平面）→ cpoints。 |
| **R7** | **done** | Point 边穿面 = 参数求交（`edgePlaneIntersection`，t∈[0,1] 判边内）→ `point:edgePlane`（边+面）→ cpoints。 |
| **R8** | **done（narrow）** | 圆形**边**取心 = 3D 最小二乘 Kasa 拟合（`circleCenterFromPolyline`，全圆/圆弧皆准）→ `point:centerEdge`（拾一条圆/弧边）→ cpoints。**偏差**：因 datum-pick 走**面**拾取，circular-**edge** 系边 → 新做 `centerEdge` 累积法（唔改 face-based `circcenter`；`circcenter` 保留做圆柱面取心 = `point:centerCyl`）。**sphere/torus 面心豁免**：`detectFace` 只识 planar/cyl，无球/环面拟合 → 诚实豁免。 |
| **R9** | **done** | Plane 过两边 = 含两边平面（`planeThroughTwoEdges`，不平行用 d1×d2、平行用连接向量）→ `plane:twoEdges` → `addDatumFeature` arb（保时间轴关联）。 |
| **R10** | **done** | 垂直面 = 面法向 + 参考边 + 距离（`perpendicularPlane`，n=faceN×refDir、xd=faceN → 平面确含面法向即⊥所选面）→ `plane:perp`（拾面+边、距离字段）→ `addDatumFeature` arb。 |
| **R12** | **done** | `_rebakeDatumSketches`（`store.ts`）由 cardinal-only 扩到 arb/angle datum：datumRef 增 `arb` 签名；`sketchOnAngleDatum(arb,idx,base)` 捕获（`Viewport.tsx` 传 datum 索引）；datum arb 郁 → 草图源 arb + 依赖 **extgroup** 每 sub.arbPlane 全部换新 arb。test `datum-v2` 加 R12-T1..T4（14/14）。 |
| **R13** | **E（re-verify later）** | tangent-at-point 此 Fusion build 唔存在（实系 Perpendicular Plane = R10 已做）；along-path 0-1 webcad 已有 `planepath`(ratio/Nmm)。无风险工作，标 E 待日后补证。 |
| **R15** | **D（无需动作）** | 构造/中心线线型齐全（已记录）。R3 投影线型系新增第三种线型，补埋 Fusion 三色。 |

**C 项决议（内核/架构受限 — 窄版或诚实豁免，本波唔郁）：**
- **R2 关联投影（Projection Link）**：投影 = 一次性 bake 折线快照（`projectRefToSketch`），冇 live-link 跟 source。真关联需把投影 shape 挂 source 边指纹 + 每次 rebuild 重投 —— 属 timeline/内核关联层，远超本波 UI 范围 → **窄版维持**（R3 已令投影几何**视觉可辨**；关联留后波）。**豁免**。
- **R4 Project-to-Surface**：把草图曲线包裹落目标曲面 —— 内核窄能力（webcad `ccurves` 系 3D 相交曲线，唔系包裹）→ **诚实豁免**。
- **R11 全 datum 关联性**：现 src-面 datum(faceOffset/tanPlane) + cylAxis-轴 会 re-derive（`rederiveDatums`）；2-面中面/3-点面/2-点轴/**全部 cpoints** 仍系静态快照。全关联需每个 datum 存可重解 provenance + rebuild 重算 —— 架构级 → **部分（partial）**：本波 R12 令**草图跟 datum（含 arb）**，但 datum 自身对非 src 输入嘅关联唔扩（cpoints 仍快照）。**窄版维持**。
- **R14 UCS**：CONSTRUCT 首项建完整局部坐标系（原点+3 轴+3 面）—— webcad 无 UCS datum 对象概念（只有世界原点 + 逐个 datum）→ **诚实豁免**（Fusion spec §0 亦标明 UCS 系独立 command、唔入统一 Construction-Geometry 对话框）。

**headless QA 可驱动性（畀调用方 store-drive）：**
- **store-drivable（resolveDialog/actions）**：`openDatumCmd({type,method})` → `setDatumCmdMethod` → `commitDatumCmdField()`（字段法：偏移/成角/中面平面·xyz 点·dir 轴）；按钮法 `addPlane3Points/addAxis2Points/addMidpointCPoint`；纯几何 `datumGeom.*` 全 node 单测。R12 `_rebakeDatumSketches` 纯函数单测。
- **WebGL-pick-gesture-only（headless 验唔到真撳）**：累积法 `datumCmdClickAt(det, threeWorld)` 同遗留拾取法（`applyDatumPick`/`edgePointAt`）都要真画布点面/点边（faceIndex/e.point/worker `edgePolylineAt`）；R3 投影紫色系渲染层。呢啲照 memory「webcad preview cache verify limit」靠 store 级逻辑 + 代码保证 + 用户实机确认。

---

## §修改（V3）— 按手感排序

| # | Fusion 行为（一句） | webcad 现况（一句 + anchor） | 类型 | 波次 |
|---|---|---|---|---|
| M1 | Move/Copy＝5 模式(Free/Translate/Rotate/Point-to-Point/Point-to-Position) ＋ 对象类型(Bodies/Components/Faces/Sketch) ＋ **Create Copy** 勾 ＋ Set Pivot ＋ gizmo↔字段双向 | Move 对话框仅 dx/dy/dz＋rx/ry/rz **绕体中心**；无复制勾、无点对点、无可移支点、无模式切换（`openFeatDlg('move') store.ts:9544`, `Viewport.tsx:4928-4935`；component gumball `ComponentGumball.tsx`） | B | V3 |
| M2 | Shell Direction＝Inside/Outside/Both；逐面厚度靠事后 Offset Face | 仅**向内**、单一厚度，负厚度被 guard 挡（`toggleShell store.ts:4000`, `cad.worker.ts:1819-1828`） | B | V3 |
| M3 | Fillet Radius Type＝Constant/Chord/Variable/Asymmetric；Corner Type Rolling-Ball/Setback；逐行 G1/G2 连续 | constant＋变半径 taper＋逐边多半径＋切线链；**无 chord、无 setback、无 G1/G2**（`buildRoundFeature store.ts:3269`, `cad.worker.ts:1225-1262`） | B | V3 |
| M4 | Fillet Type＝Fillet/Rule/**Full-Round**；另有 Face Fillet(3 面) | 仅边圆角，无面圆角/全圆角 | C | V3 |
| M5 | Press Pull 智能动词：面→Offset、边→Fillet、profile→Extrude；Offset Type(Modify Existing/New/Automatic) 保干净历史 | presspull 仅 sketch→extrude 或 face→offset（**无 边→fillet**），记 near-point 特征，无 Offset-Type（`store.ts:9497-9500`, `cad.worker.ts:3844`） | B | V3 |
| M6 | Replace Face：把体嘅面长到任意目标**面/曲面/平面** | 仅**平面替换**（`toggleReplaceFace store.ts:9516`, `cad.worker.ts:2366` 诚实 planar-only） | C | V3 |
| M7 | Chamfer 逐边距离 ＋ 真·相邻面参考 ＋ Corner Type(Chamfer/Miter/Blend) | equal/two/angle，但 two/angle 仅顶/底缘边可靠(bbox 参考面, `chamferAsym cad.worker.ts:1265-1296`)，无逐边尺寸、无 corner setback | B | V3 |
| M8 | 原地「Offset Face」命令 ＋ Offset Type | offsetsurf/offsetsolid 造**新曲面体**；Move Face 有原地 re-solve 但无 named Offset-Face/Offset-Type（`offsetsurf store.ts:9507`, `moveFace store.ts:4064`） | B | V3 |
| M9 | Split Face：tool 可係草图/边/曲面/平面；Split Type(Surface/Along Vector/Closest Point)；Extend 勾 | 仅用**世界平面**过拾取点切面（`toggleSplitFace store.ts:4182`, `cad.worker.ts:2349-2365`） | B | V3 |
| M10 | Split Body 多 tool(plane/face/surface/sketch)＋Extend，非破坏 | 仅 plane 或 sketch；**split-by-sketch 摧毁历史**(烘成 mesh, `store.ts:12474-12499`) | C | V3 |
| M11 | Draft Type＝Fixed-Plane/**Parting-Line**；Draft Sides One/Two/Symmetric；pull 可係任意面/边/轴 | 仅中性面法向 pull＋双面 bucket；无分模线、pull 锁死中性法向（`toggleDraftPick store.ts:4309`, `cad.worker.ts:3784-3810`） | B | V3 |
| M12 | Align：From/To 接受点/边/面 | 仅面-面＋圆柱共轴、one-shot（`startFaceMate store.ts:7106`），无点/边/顶点目标 | B | V3 |
| M13 | Silhouette Split（分模线/脱模方向剪影分割） | **无**此建模操作（silhouette 只喺 drawing/CAM） | C | V3 |
| M14 | Physical Material 与 Appearance **分家**＋外观/纹理库 | 合并成一套预设(22 presets density+PBR)＋逐面上色＋色彩库；无纹理/贴花（`MATERIALS store.ts:2200-2223`） | A | V3 |
| M15 | Change Parameters 有设计表格(row=config × col=param) | 参数面板＋config 列表，**非表格网格**（`params store.ts:9877`, configs `13232-13254`） | A | V3 |
| M16 | Delete(硬删) 与 Remove(参数化 heal 节点) 两级 | delface 已係参数化 defeature+heal 记特征(`store.ts:4104`, `cad.worker.ts:2201-2229`)＝近 Remove；delete=特征/组件 | D | V3 |
| M17 | Scale(Uniform/Non-Uniform＋Point)、Combine(target/tool＋op＋Keep Tools) | **齐全对齐**：scale sx/sy/sz＋base-point、combine fuse/cut/common＋keepTools（`store.ts:10346`） | D | V3 |

**§修改 落地要点（A/B）：**
- M1：`openFeatDlg('move') store.ts:9544` 扩成模式机：5-枚举 moveType + objectType(bodies/components/faces/sketch) + createCopy 布尔 + setPivot；点对点/点对位＝两拾取槽解世界变换；沿用 `ComponentGumball.tsx` 已有 translate/rotate gizmo 做双向绑定。
- M2：`toggleShell store.ts:4000` 加 direction 枚举(inside/outside/both)；worker `cad.worker.ts:1819-1828` 把负厚度 guard 换成 outside 分支（replicad shell 支持方向）；逐面厚度引导用户事后 Offset Face(M8)。
- M3：`buildRoundFeature store.ts:3269` 加 radiusType(chord)＋corner(setback)＋per-row 连续枚举；chord/连续接 replicad 参数，setback 属窄版(标注)。
- M5：`store.ts:9497` presspull 拾取时按实体类型分支：边→转 `toggleEdgeRoundPick('fillet')`；加 Offset-Type 下拉映射到「改现有特征 vs 新特征」。
- M7：`chamferAsym cad.worker.ts:1265` 由 bbox 顶/底参考改为真·相邻面法向参考；`Viewport.tsx:3764` 加逐边尺寸行（仿 fillet `edgeRoundRadii`）。
- M8：加一个 named `offsetface` 命令，直接复用 Move-Face 向内 re-solve 路径（`cad.worker.ts:2428-2446`）＋ Offset-Type 下拉，唔造新曲面体。
- M9：`toggleSplitFace store.ts:4182` 切割工具由「世界平面」扩到接受草图/边/曲面；加 splitType 枚举，接 worker `SplitFaceNearBy*`。
- M11：`draftNeutral/draftSides store.ts:4314` 之外加 pullDir 拾取槽(面/边/轴)＋ partingLine 模式(窄版)。
- M12：`startFaceMate store.ts:7106` 扩 From/To 接受 cpoint/边端/顶点目标（复用 cpoints 拾取）。
- M14：`appearance store.ts:9852` UI 拆两 tab（物理材质 vs 外观），底层 `MATERIALS` 已带 density。
- M15：`ParamsPanel.tsx` 加一个 config×param 表格视图，读 `configs store.ts:13232`。

**§修改 波3（GM-3DV3）收官记录：**

新纯模块 `src/cad/moveSolve.ts`（node 可单测，`tests/movesolve.test.mjs` 12/12）：`solveMove`（五模式 free/translate/rotate/ptp/ptpos → 统一 transform 词汇 {dx,dy,dz,rx,ry,rz}）+ `isNonZeroMove`。新 kernel 实证 `tests/shell-direction.test.mjs`(4/4，证 shell(+t)=inside 外形保留 / shell(−t)=outside 外扩 / MakeOffsetShape 已绑=both 可行)、`tests/chamfer-peredge.test.mjs`(4/4，证逐边分组 chamfer + 竖边相邻面 selectedFace)。

| # | 类型 | 状态 | 落地（文件·anchor） |
|---|---|---|---|
| **M1** | B | **done（flagship）** | Move/Copy 五模式：`move` featDlg 加 `moveType`(free/translate/rotate/ptp/ptpos)＋`objectType`(bodies/components/faces/sketch)＋`createCopy`＋`raxis/angle`＋点对点/点对位坐标槽（`store.ts` openFeatDlg move defaults）。commit 用 `solveMove` 统一解成 transform（`store.ts` commitFeatDlg move 分流：bodies→transform＋copy · components→setComponentPos/Rot＋duplicate · faces→引导移动面 · sketch→note）。worker `transform` 加 `copy`（fuse 变换后 clone 留原件，`cad.worker.ts`）。Viewport 五模式段切换＋对象/副本 UI。**偏差**：gizmo↔字段双向绑定系 WebGL-gesture（headless 验唔到）→ 点对点/点对位改用【坐标字段】（store-drivable，纯函数单测）；Set Pivot 暂用件中心（旋转绕 bbox 中心，同旧行为）。 |
| **M2** | B | **done** | Shell Direction(Inside/Outside/Both)：`shellDir` 状态＋commitShell 写 `direction`（inside 缺省唔写=逐字节）；worker 换负厚度 guard → `_dir` 分支：inside=shell(+t)·outside=shell(−t)·both=MakeOffsetShape 外扩 t/2 再 shell(+t)（both 外扩后 finder miss → 诚实退回向内）。抽壳命令条＋shell-edit 加方向下拉。逐面厚度引导 Offset Face(M8)。 |
| **M3** | B→C | **narrow（诚实）** | chord-length / G1-G2 continuity / setback corner **未做**：replicad 高层 `.fillet()` 只食 `FilletRadius = number | [r_start, r_end]`（constant + variable-radius tuple，两者已上线）。真 chord/G2/setback = 裸 `BRepFilletAPI_MakeFillet.SetFilletShape`(ChFi3d_FilletShape) —— **replicad_plus build 未绑呢啲 OCCT 符号**（kernel glue 无 BRepFilletAPI_MakeFillet；要 WSL2 docker 重建内核，超本波）。已有 变半径 + 逐边多半径 + 切线链 = 覆盖 Fusion「Variable」Radius Type + multi-group list。**未加假 UI**（守 codebase 诚实原则，唔上没内核支撑嘅死掣）。 |
| **M4** | C | **exempt** | Full-Round / Face Fillet(3 面) = 内核窄能力（同 M3，无 BRepFilletAPI 高级形），诚实豁免。 |
| **M5** | B | **done** | Press Pull 智能动词：边→fillet **早已实现**（Viewport `nearSharpEdge` 撳边 ±6px → `toggleEdgeRoundPick('fillet')`＋`roundEdgeAt`，line 553-564 — audit 漏咗呢条 Viewport 路径）。本波补 **Offset Type**：pushpull feature 加 `offsetType`(modify/new/auto 元数据)＋按拉命令条法向偏移时下拉（`Viewport.tsx`）；commitPushPull 写字段（auto 缺省唔写）。 |
| **M6** | C | **exempt** | Replace Face 任意目标曲面 = 内核窄（现 planar-only `cad.worker.ts:2366`），诚实豁免。 |
| **M7** | B | **done** | Chamfer 逐边距离＋真·相邻面参考：`chamfer` feature 加 `distances`(与 nears 平行)；`roundNearPoints` perEdge 分组路径 fillet/chamfer 共用（`sh.chamfer(rv,fdr)` 逐组）；`chamferAsym` 由 `inPlane('XY',refZ)` 改为**真相邻面**（三角距≈0 揾相邻面、按 flip 拣法向 z 较大/细嗰面做 selectedFace 中心点 → 竖边/斜边亦可两距离/角度，解析失败诚实退 bbox refZ）。Viewport 逐边尺寸行扩到 chamfer equal 模式。Corner Type(Miter/Blend) = 内核窄，未做（note）。 |
| **M8** | B | **done** | named Offset Face：ribbon `offsetface` → 复用移动面偏移路径（强制 offset 模式，原地 ReplaceFaceNear 重解，唔造新曲面体）；moveface feature 加 `offsetType` 元数据；移动面命令条 offset 模式加 Offset Type 下拉。 |
| **M9** | B | **done（narrow）** | Split Face 方向＋Split Type：`splitFaceAxis`(auto/X/Y/Z)＋`splitFaceType`(surface/vector/closest) 状态；splitFaceAt 按 axis 揀切割平面法向（指定轴同面近平行→诚实退 auto）；分割面命令条加方向/类型下拉；splitface feature 加 `splitType` 元数据。**窄版**：内核只绑 `SplitFaceNearByPlane`（平面 imprint ≈ Along Vector）→ **草图/边/曲面刀 + Surface/Closest-Point 投影豁免**（无 SplitFaceNearByEdge/Sketch/Surface 内核入口）。 |
| **M10** | C | **exempt** | 非破坏 split-by-sketch = 现 split-by-sketch 烘 mesh 摧毁历史（`store.ts:12474`）；非破坏需真参数化 sketch-刀内核路径，豁免。 |
| **M11** | B→C | **narrow（诚实）** | Draft pull-direction pick + parting-line **未做**：replicad `shape.draft(-angle, sel, neutralPlane)` 嘅 neutral plane **同时**做 pull 方向 + 中性参考 —— 无法喂【独立于中性面嘅 pull direction】；parting-line draft 内核无对应。现 draft 已拾中性面（其法向 = pull 方向）＋侧面集＋双面＋flip。**pull-dir 与中性面耦合系内核约束** → 诚实narrow；parting-line 豁免。 |
| **M12** | B | **narrow（诚实）** | Align From/To 接受 point/edge/vertex **未做**：现 `startFaceMate` 面-面＋圆柱共轴（`store.ts:7106`）。点/边/顶点目标需新拾取槽 + 点对点/边对边解算（复用 cpoints 拾取 + M1 `solveMove` 点对点解），属装配级拾取流改动，本波**narrow**（记录路径：point→point 可复用 solveMove 平移解；face-face 已有）。 |
| **M13** | C | **exempt** | Silhouette Split = 无此建模操作（silhouette 只喺 drawing/CAM），诚实豁免（同 spec §13 一致，Fusion 亦独立 mold-prep 命令）。 |
| **M14** | A | **done** | Physical Material vs Appearance 分家：`setPhysicalMaterial`(只设 density→质量/FEA/BOM，唔郁颜色)＋`physMatName` 状态；`MaterialSwatchPicker.tsx` 拆两 tab（🎨外观=setMaterialPreset 颜色/PBR · ⚖物理材质=逐料列密度）。纹理/贴花外观库 = 现有程序化纹理 tag，未扩（note）。 |
| **M15** | A | **done** | Change Parameters 设计表格：`ParamsPanel.tsx` 加 config×param grid（行=配置 × 列=参数，cell=config.values[param]，活动配置高亮＋点行应用＋末行「当前值」对照），读 `configs`。 |
| **M16** | D | **verified（无改）** | delface=参数化 defeature+heal(`store.ts` toggleDelFace/commitDelFace)≈Remove；delete=特征/组件。两级一致，无需改。 |
| **M17** | D | **verified（无改）** | scale(sx/sy/sz＋base-point，`store.ts` scale featDlg)、combine(fuse/cut/common＋keepTools，`store.ts` openCombineDlg)。齐全对齐，无需改。 |

**headless QA 可驱动性（畀调用方 store-drive）：**
- **store-drivable**：M1 `openFeatDlg('move')`→`setFeatParam('moveType'|'objectType'|'createCopy'|坐标)`→`commitFeatDlg()`（bodies 全模式，纯 `solveMove` node 单测）；M2 `setShellDir`＋`commitShell`（direction 写字段，kernel 语义 node 实证）；M5/M8 `setOffsetType`；M7 `setEdgeRoundRadiusAt`（逐边距离，chamfer equal）；M9 `setSplitFaceAxis/setSplitFaceType`；M14 `setPhysicalMaterial`；M15 configs grid 读 store。
- **WebGL-pick-gesture-only（headless 验唔到真撳）**：M1 gizmo↔字段双向绑定同点对点画布拾点（已改坐标字段绕过）；M5 `nearSharpEdge` 撳边→fillet；M7 相邻面 selectedFace 系拾边后 worker 内解；M8/M9 拾面。照 memory「webcad preview cache verify limit」靠 store 逻辑 + 代码保证 + 内核单测 + 用户实机确认。

---

## §装配（V4）— 按手感排序 · ★ Fusion 装配 spec 大部分「文档非实证」→ 多标 E，实做前喺 saved doc 再验

| # | Fusion 行为（一句） | webcad 现况（一句 + anchor） | 类型 | 波次 |
|---|---|---|---|---|
| A1 | **Joint Origin** 可复用命名帧：Snap＋Mode(Simple/Between-2-Faces/2-Edge-Intersection)＋Angle＋X/Y/Z Offset＋Flip＋Axis Alignment；存「Joint Origins」文件夹＋timeline 节点（★§4 **实证 live**） | **无独立可复用 joint-origin 实体**：origin＝component 中心默认 或 建 joint 时几何吸附；cpoints/caxes 未接做 joint origin（`componentCenter store.ts:8993`, `startJointPick 7149`） | B | V4 |
| A4 | Joint Origin **吸附**到面心/边中/顶点/圆心，带 hover 预览 glyph（★§4 实证 live） | face-pick→圆柱/平面、hole-pick→孔心/轴；无标准吸附点浮标预览（`startJointPick store.ts:7149`, `applyJointHolePick 7291`） | A | V4 |
| A2 | Joint Position tab：**双 joint-origin**（两件各一个原点）＋之间 Offset(X/Y/Z)＋Angle＋Flip | 每 joint 单一共享世界锚点，无双原点 offset/angle/flip（`kinematics.ts:13-14`）。目标 B，但 Fusion Joint 未实证 → 先补证 | E | V4 |
| A3 | Joint 一个 command 三 tab(Position/Motion/Limits)；Limits 有 Rest/Min/Max/Animate | 面板式；limits aMin/aMax/sMin/sMax（**无 Rest** 字段）；motion 滑杆（`JointsPanel.tsx:176-217`）。目标 A(重排＋Rest)，Fusion Joint 未实证 | E | V4 |
| A5 | Component＝多体子容器，自带 Origin/Bodies/Sketches 子文件夹 | Component＝单一冻结 mesh，**无 body 概念**（`store.ts:1294`, `newComponent 14304`）。目标 C 架构；Fusion New Component 未实证 | E | V4 |
| A6 | New Component **from bodies** / 由选定体建 / 空壳再入建 | 只冻结当前单一活动 scratch body（`newComponent store.ts:14319-14328`）。目标 C；Fusion 未实证 | E | V4 |
| A7 | Occurrence 实例：共享定义、改一个全部跟；Copy vs Paste-New；完整 4×4 occurrence 变换 | duplicate＋阵列＝**独立副本**；pos＋euler-rot 非 4×4（`store.ts:7886,1294`）。目标 C；Fusion 未实证 | E | V4 |
| A8 | Rigid Group＝N-件焊接、可抑制嘅一级节点 | 用链式 rigid joints 实现，无一级 Rigid-Group 节点（`rigidGroupChecked store.ts:11416`）。目标 B；Fusion 未实证 | E | V4 |
| A9 | Contact：全局 All vs **命名逐对 Contact Sets** | 单一全局 `contactSets` 开关＋drive-to-contact，无逐对 set（`toggleContactSets store.ts:8898`）。目标 B；Fusion 未实证 | E | V4 |
| A10 | As-Built Joint：原位声明、7 型、Location 拾取（几何推轴） | 有 `asBuiltJointChecked store.ts:11428`(2 件、原位、可选型)，但轴默认粗糙(child 中心竖轴)。目标 B；Fusion 未实证 | E | V4 |
| A11 | External/linked component(分布式设计) | 仅 mesh import，无链接文件（`importStl store.ts:14332`）。目标 C；Fusion 未实证 | E | V4 |
| A12 | Explode：有序步骤＋引线＋保存序列 | 单一径向 explode 滑杆（`setExplode store.ts:7871`）。目标 A；Fusion 本 session 未捕获 | E | V4 |
| A13 | （Fusion）Joint 数学 7 型＋Motion Link＋Drive＋Motion Study | webcad **抛离**：8 型(含 screw)＋齿轮/齿条/行星 motion link＋关键帧＋闭环解算＋捕获位置＋interference（`kinematics.ts`, `JointsPanel.tsx`） | D | V4 |
| A14 | （Fusion）装配 authoring 被 **save-gate** 锁死（只 Add-To-Assembly→云存） | webcad 无 save-gate，本地未存都随时建 component/joint — **决策正确**，记录 | D | V4 |

**§装配 落地要点（A/B；E 项係「先补证再落刀」）：**
- A1（B）：加一个 `jointOrigin` 实体（snap 点＋mode＋angle＋xyz-offset＋flip），存独立数组＋browser「Joint Origins」组；joint 创建时可引用之（现 origin 硬绑 `componentCenter store.ts:8993`）。呢个係唯一实证 live 嘅装配特性，信心最高，值得先做。
- A4（A）：`startJointPick store.ts:7149` 拾取时 surface 标准吸附点(面心/边中/顶点/圆心)＋hover 浮标；vertices/centers 比幼边可靠(继承 pixel-fragile quirk)。
- **E 项（A2 双原点／A3 三-tab＋Rest／A5-A7 多体·occurrence／A8 Rigid-Group 节点／A9 逐对 Contact／A10 As-Built 推轴／A11 外部件／A12 explode 序列）：** Fusion 端全部 save-gated 未实证（净 §4 Joint Origin live）。**建议先喺一个 saved scratch Fusion doc 行一转 Joint/New Component/Rigid Group/Contact 对话框，确认字段，再落 webcad 实现**；A2 双原点 offset 系最高价值嘅 joint 手感目标(现 `kinematics.ts:13-14` 单锚点)。

**§装配 波4（GM-3DV4）收官记录：**

新纯几何模块 `src/assembly/asmUtil.ts`（node 可单测，`tests/asmwave4.test.mjs` 23/23）：`inferAsBuiltAxis`(A10 接触带 PCA 幂迭代推销轴) · `explodeStepOffsets`(A12 有序步进度覆盖+累积)。kinematics.ts 新增 `resolveJointOrigin`(A1) + `restOffset`(A2 双原点偏移，FK 复合 `M_child = M_parent · jointMotion(v) · restOffset`) + Joint 新可选字段 `rest/offset/originAngle/flip/originRef/groupRef` + JointOrigin 类型。**旧档零回归**：全部新字段可选，缺省 → restOffset=单位、flip 不反、rest=0 → jointMotion/FK/homeJoints 逐字节旧行为（`tests/asmwave4` ① 实证 + matesolve/fourbar-velocity/linkage/movesolve/gears/patterns-sym 全绿）。

| # | 类型 | 状态 | 落地（文件·anchor） |
|---|---|---|---|
| **A1** | B | **done（headline · Fusion 实证 live）** | 可复用 Joint Origin 实体：`JointOrigin` 类型（kinematics.ts）+ `jointOrigins[]` 状态 + `addJointOrigin/removeJointOrigin/updateJointOrigin/startJointOriginPick/jointOriginAt`（store.ts）。浏览器「关节原点」组（`BrowserTree.tsx`）+ ribbon「关节原点」入口（`ribbon.ts` ASSEMBLE，`jointorigin` dispatch）。画布拾 snap 点（面心/圆柱孔心/落点）落 origin（`Viewport.tsx` KernelBody click 分支）。关节可喺 JointsPanel 下拉引用之 → anchor/axis 取自 `resolveJointOrigin`（取代默认 `componentCenter`）。场景青绿十字准星标记（`JointOriginView`）。 |
| **A2** | E→B | **done（reasonable · 按功能实现）** | 双 joint-origin 静止偏移：Joint 加 `offset[U,V,轴]/originAngle/flip`；`restOffset(j)`（kinematics.ts）喺关节基表达、FK 叠喺驱动之后（偏移臂随驱动摆动）。`JointGizmo` 同步 flip 轴向（honest 镜像）。JointsPanel「⚓位置」逐关节展开编辑（偏移 X/Y/Z + 角度 + Flip）。**store-drivable**（`setJointValue({offset/originAngle/flip})` 纯字段），`tests/asmwave4` ①②③④ 实证（含旧档零回归 + 偏移臂摆动 + flip 反向）。 |
| **A3** | E→A | **done（reasonable）** | Rest 静止位：Joint 加 `rest`；`homeJoints` 由「全零」改为「回 Rest」（主 DOF：slider=slide 其余=angle；缺省 rest=0 → 逐字节旧「归零」）。JointsPanel「⚓位置」条内 Rest 输入（同 offset/flip 一齐，Position 轻量分组）。 |
| **A4** | A | **done（narrow · WebGL 手势）** | Joint Origin 拾取标准吸附点：`Viewport.tsx` KernelBody `jointOriginPickMode` 分支 → 圆柱面=孔心+轴向、平面=面心+法向、否则落点（detectFace 复用，vertices/centers 优先幼边）。**偏差**：hover 预览 glyph = WebGL 手势（headless 验唔到真撳，照 memory「preview cache verify limit」靠代码保证 + 实机确认）；标准吸附点由 detectFace 圆柱/平面几何供（面心/圆心可靠），**独立顶点/边中点吸附豁免**（现无逐顶点拾取器；落点 fallback）。 |
| **A8** | E→B | **done（reasonable）** | 一级 Rigid-Group 节点：`rigidGroups[]` 状态 + `rigidGroupChecked` 建节点（底层 rigid 关节打 `groupRef` 标）+ `toggleRigidGroupSuppressed`（抑制=删呢批关节释放成员 / 恢复=由 members 重建）+ `removeRigidGroup`。浏览器「刚性组」组（`BrowserTree.tsx`，抑制▷⏸/删🗑）+ JointsPanel 同款列表。随项目存档 + 可撤销。 |
| **A9** | E→B | **done（reasonable）** | 命名逐对接触集：`contactPairs[]` + `addContactPair/removeContactPair`。全局 `contactSets`=All 缺省；全局关但有登记对 → `jointsCollide(…, allow)` scoped（`setJointValue` 接触 gate 按子件配对建 allow-set）。JointsPanel「命名接触集」区（列出 + 两件下拉登记）。随项目存档。**偏差**：`driveJointToContact`（显式「停于接触」掣）仍走全局 All（未 scoped）。 |
| **A10** | E→B | **done（reasonable）** | As-Built 轴推断：`inferAsBuiltAxis`（接触带 = 两件互扩 bbox 交点云 → 协方差幂迭代主轴 = 销轴；退回子件长轴 → 退回竖直）。`asBuiltJointChecked` 由「竖直过件心」改为世界坐标顶点推轴（rigid 型免推）。`tests/asmwave4` ⑥ 实证 X/Y/Z 三向销轴正确推断。 |
| **A12** | A | **done** | 有序爆炸步：`explodeSteps[]`（session 态，同现有 explode 滑杆一样唔入存档）+ `addExplodeStep/removeExplodeStep/clearExplodeSteps/toggleExplodeLeaders`。`explodeStepOffsets`（asmUtil.ts）滑杆(0..2)当全序进度 t 逐步覆盖+累积；单一径向滑杆保留做 step-0 缺省（无步 → 逐字节旧行为）。爆炸对话框加步骤 UI（勾选件 + ±X/Y/Z 方向加步 + 引线开关）+ 引线渲染（`Viewport.tsx`）。`tests/asmwave4` ⑦ 实证进度覆盖/累积/方向归一。 |
| **A13** | D | **verified（无改）** | webcad 抛离 Fusion 7 型：8 关节类型（含 screw/pinslot）+ 齿轮/齿条/行星 motion link + 关键帧 + 闭环解算 + capture position + interference。`tests/asmwave4` ⑧ 记录 8 型含 screw+pinslot。无需改。 |
| **A14** | D | **verified（无改）** | webcad 无 save-gate — 未存本地设计随时建 component/joint/jointOrigin/rigidGroup（决策正确，同 §4 takeaway 一致）。无需改。 |

**C 项决议（架构级 — 诚实豁免/defer，本波唔郁）：**
- **A5 多体 per component**：Component = 单一冻结 mesh（`store.ts` Component 类型无 body 概念）。多体子容器（Origin/Bodies/Sketches 子文件夹）= 架构级重写（每 component 一棵子特征树 + 子实体列表）→ **诚实豁免**（webcad 现「一 component = 一嚿 frozen mesh + 可选 src 特征树」，唔支持一 component 内多 body）。**Fusion 端亦未实证**（save-gated）。
- **A6 New Component from bodies / 空壳再入建**：现只冻结当前单一活动 scratch body（`newComponent`）。「由选定多 body 建」「空壳→入内建模」需 A5 多体架构做前置 → **随 A5 豁免**。
- **A7 Occurrence 实例（改一个全部跟）＋ 4×4 occurrence 变换**：现 duplicate/阵列 = 独立副本；pos + euler-rot 非共享定义 + 4×4。真 occurrence（共享 definition + 实例变换，edit-one-update-all）= 架构级（component 拆「定义 vs 实例」两层）→ **诚实豁免**。**Fusion 端未实证**。
- **A11 External/linked component（分布式设计）**：现只 mesh import 做组件（无链接文件）。外部链接件 = 跨文档引用架构（存 file ref + 加载时解析 + 版本追踪）→ **诚实豁免**（同 S13 Base/Derive 一族，webcad 无跨文档链接概念）。

**★ 仲要 Fusion-on-saved-doc 再验先可深化嘅项（诚实清单）：**
装配区除 §4 Joint Origin（A1/A4，已 live 实证）外，A2/A3/A5-A11 嘅 Fusion 对话框字段全部 **save-gated 未眼见**。本波 A2/A3/A8/A9/A10 按【标准 CAD 惯例 + webcad 自身模型改良】clean-room 落地（按功能，唔抄未见嘅 Fusion 字段名/布局）。若日后要精确对齐 Fusion，需喺 saved scratch doc 再验：① Joint Position tab 的 Offset X/Y/Z 到底喺边个帧表达（本波用关节基 U/V/轴，Fusion 或用组件本地帧）② Limits tab 的 Rest 是否 per-DOF（本波单 rest 驱主 DOF，Fusion 或每 DOF 一个）③ Rigid Group 的 Include Contacts/Child 勾选语义 ④ Contact Set 的具体 scope 规则（本波：全局 All vs 命名对，全局关时只检对）⑤ As-Built 的 Location 拾取是否直接定轴（本波：几何推断）。呢啲系「按功能 vs 抄字段」嘅诚实边界。

---

## 计数汇总

**按类型（共 62 项）：**

| 类型 | 立体 | 参考几何 | 修改 | 装配 | 合计 |
|---|---|---|---|---|---|
| A 直接跟 | 5 | 6 | 2 | 1 | **14** |
| B 改状态机 | 5 | 3 | 9 | 1 | **18** |
| C 内核/架构窄版 | 5 | 4 | 4 | 0 | **13** |
| D 已一致(记录) | 1 | 1 | 2 | 2 | **6** |
| E Fusion 未实证(先补证) | 0 | 1 | 0 | 10 | **11** |
| **合计** | **16** | **15** | **17** | **14** | **62** |

**按波次：** V1 立体 = 16 · V2 参考几何 = 15 · V3 修改 = 17 · V4 装配 = 14。

**可直接动手（A+B）= 32 项**，其中 立体 10 · 参考几何 9 · 修改 11 · 装配 2（其余装配 10 项係 E，要先补证 Fusion）。
**内核/架构窄版或诚实豁免（C）= 13 项**（Base/Derive、guide-surface、centerline loft、包裹 emboss、Project-to-Surface、多体 component、occurrence 等）。
**已一致/webcad 领先（D）= 6 项**（共用 Operation 词汇、构造线型、Scale/Combine、delface≈Remove、装配运动学、无 save-gate）。

---

## 跨区最高价值 12 项（实做优先）

1. **[S1·A·V1]** Rib/Web 建立对话框 — 全表手感最差，纯 UI，worker 已支持参数。
2. **[M1·B·V3]** Move/Copy 5 模式＋Create Copy＋Set Pivot — Fusion 最丰富嘅改，webcad 最弱。
3. **[R1·B·V2]** 统一「构造几何」datum command（Type＋Method）— 收编 20 条散路，代码少、手感一致。
4. **[M2·B·V3]** Shell Direction(Inside/Outside/Both)＋逐面厚度(靠事后 Offset Face) — 机械件常用。
5. **[A1·B·V4]** Joint Origin 可复用实体 — 唯一 Fusion 实证 live 嘅装配特性，信心最高。
6. **[M3·B·V3]** Fillet chord-length＋setback＋G1/G2 连续（面圆角/全圆角属 C 窄版）。
7. **[R2·C/R3·A·V2]** 关联投影(Projection Link) ＋ 投影几何独特色 — 补 associativity 断层。
8. **[S2·C·V1]** Extrude To-Object 去任意面/体/点＋偏移（现只去平行平面）。
9. **[S3·B·V1]** Pattern/Mirror 加 Faces/Components 目标 ＋ 逐实例 Suppression。
10. **[M5·B·V3]** Press Pull 智能动词(边→fillet) ＋ Offset Type 保干净历史。
11. **[A2·E→B·V4]** Joint 双原点＋之间 Offset(X/Y/Z)/Angle/Flip — 最高价值 joint 手感（先补证 Fusion）。
12. **[R5-R8·A/B·V2]** 补 Point 方法：2 边交点／3 面交点／边穿面／圆边取心（＋球·环中心）。

★ 诚实收尾：装配区（V4）14 项里有 10 项 Fusion 端 **未实证**（save-gated，只 Joint Origin live）。呢批标 E，实做前应喺一个 saved scratch Fusion doc 再验 Joint/New-Component/Rigid-Group/Contact 对话框字段。webcad 装配运动学本身已抛离 Fusion（8 型 joint＋闭环解算＋关键帧），gap 集中喺**组件架构(多体/occurrence)** 同 **joint 原点/吸附/双原点 UX**，唔係运动数学。
