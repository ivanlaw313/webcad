# webcad ↔ Fusion 360 —— INSPECT / VIEW / INSERT / TIMELINE+选择 差距账（补遗）

Clean-room 行为对标（睇行为/语法，唔抄 icon/字眼）。Ground truth = `_fusion_inspect_view_spec.md` + `_fusion_insert_timeline_spec.md`（已尊重 inferred / can't-verify / web-gated 标记）。webcad 现况 = code-grounded（`_webcad_inspect_behavior.md`、`_webcad_view_behavior.md`，加本人对 store.ts / Viewport.tsx / Timeline.tsx / MarkingMenu.tsx / io\* 嘅 INSERT+TIMELINE 扫描）。所有 anchor 係 `file:line`。

---

## 一、老细版执行摘要（广东话）

1. **测量同选择系统係最阔嘅裂缝**。Fusion 一个 Measure 命令识拣任何两个东西（点↔边↔面↔体）自动出上下文读数 + 一个逐类型选择过滤器；webcad 而家係 4 个互斥模式掣（量距/量边/量面/量角，`store.ts:13237/13403/13440/13474`）加一个 3 路粗过滤（全/件/体，`store.ts:4323`）。呢个係 X1+X4 头号杠杆。
2. **冇模态 Properties 对话框**。Fusion 右键实体 → Properties 弹一个精度可调（低/中/高）、逐体、可复制嘅质量表；webcad 净係底部一条常驻状态栏（`Viewport.tsx:6505`），冇逐选体、冇精度掣。X1 高价值。
3. **DXF / SVG 入嚟应该係「可编辑草图曲线」，而家係固定轮廓拉伸实体**。webcad 把 DXF/SVG 直接砌成 extrude 特征（`importProfiles2D`，`store.ts:15181`），只可改拉伸高度，曲线本身改唔到、加唔到尺寸约束。Fusion 入嚟係草图曲线可再编辑。X3 头号裂缝（内核/架构窄版）。
4. **视图显示三宗缺料**：Fusion 6 个视觉样式枚举（着色±边、线框±边，Ctrl+4..9）webcad 净係「着色/线框 + 边线独立开关」（`store.ts:9416`）；相机三态（正交/透视/透视带正交面）webcad 净係正交⇄透视两态（`store.ts:8000`）；网格间距写死 10/100mm（`Viewport.tsx:3584`），Fusion 可 adaptive/fixed + 主间距 + 参考数字。
5. **四视口 + ViewCube 右键菜单**。Fusion 有 2×2 四视图（上/前/右/等轴，可同步）同 ViewCube 右键（回 Home / 设为前视 / 投影三态）；webcad 单视口、drei ViewCube 净係定向对齐冇右键（`Viewport.tsx:3650`）。
6. **诚实做唔到（天生/内核限制，唔当 bug）**：Insert Derive（跨文档关联链接）、McMaster-Carr / 厂商件 / TraceParts 网上零件库 —— 全部係云端/网站 catalog，webcad 冇 cloud 层，Fusion 自己喺离线/未登入都 gate 咗，故列 **E 未实证/gated**。分析类（曲率/拔模/斜率/截面属性/干涉体积/网格测量）係离散网格近似而非解析 B-rep —— 已诚实标注，属内核窄版 **C**，保留唔改。
7. **好多嘢其实已经到位，唔好破坏**：放射标记菜单（`MarkingMenu.tsx`，甩手势 + 触屏线性回退）已达 Fusion 水平 = **D**；时间轴回卷 marker 拖动 scrub + 播放/逐步 + 抑制 + 双击编辑（`Timeline.tsx` / `gotoStep` `store.ts:9390`）= **D**；Canvas 描摹底图 + 两点 Calibrate 缩放（`store.ts:6625`）= **D**；Look-At 340ms 缓动、HDRI 环境、Physical-Material 同 Appearance 分离、STEP 入 B-rep 时间轴（可再切/圆角）= 已达或超越。呢啲全部照旧。
8. **波次**：X1 检查（统一测量+选择过滤+精度+Properties 模态+干涉两段+分析持久化）→ X2 视图显示（6 样式枚举+相机三态+网格配置+ViewCube 右键+四视口+Preferences+单位对话框）→ X3 插入（DXF/SVG 转可编辑草图+Canvas 多张存档+Decal 字段+Mesh 单位/摆位 gizmo）→ X4 时间轴选择（节点右键菜单+齿轮设定+选择优先/逐类型过滤+lasso/paint/by-name）。webcad 刻意决定（底部 navbar 非 ribbon、store 订阅自动正交、诚实降级网格近似）全部保留，下面标明「唔破坏亦达标」嘅位。

---

## 二、§检查（INSPECT） — 波次 X1

| # | Fusion 行为 | webcad 现况（+anchor） | 类型 | 波次 |
|---|---|---|---|---|
| 1 | 一个 Measure 命令量任意两实体（点/边/面/体任意组合 → 上下文出 距离/角度/面积/最短间距） | 4 个互斥模式掣：量距（`toggleMeasure` 13237）/量边（13403）/量面（13440）/量角（13474）；单体上冇任意 边↔面/点↔面 | B | X1 |
| 2 | Measure 面板顶有选择过滤（拣面/体/草图 3 掣）+ Clear | 量测无选择过滤；全局 `selFilter` 得 全/件/体 3 路（4323），非量测内嵌 | B | X1 |
| 3 | Precision 下拉（0..8 位小数，默认 3 位） | 精度由 `fmtLen/fmtArea/fmtVol` 写死（mm 1 位，`store.ts:2349`），用户改唔到 | A | X1 |
| 4 | Secondary Units（可加第二单位系并列显示，如 inch） | 单一单位（`s.unit`），无副单位 | A | X1 |
| 5 | Show Snap Points（中点/象限捕捉标记）checkbox | 量测靠 raycast 拾取点，无显式 顶点/中点/中心 捕捉优先 | A | X1 |
| 6 | Interference：先拣集 → 显式 Compute → 结果配对表；Include-Coincident-Faces 开关；可只选定体子集 | `checkInterference`（7771）取所有可见件、自动跑、0.5mm 容差排除刚接触；无 include-coincident 开关、无子集拾取 | B | X1 |
| 7 | 干涉体积 = B-rep 精确 | 流形时 `meshBoolean('intersect')` 精确，否则 Monte-Carlo 估算（诚实标≈） | C | X1 |
| 8 | Section Analysis：拣任意平面/平面面 → 实时切；Distance 偏移 + Angle1/Angle2 双向倾斜 + Flip + 剖面线；存为可开关 Analysis 节点（非破坏） | `section`（9429）只 X/Y/Z 三个轴对齐面 + 偏移 + 实心封盖 + 翻面 + 实时剖面属性；无任意面、无倾斜角、无剖面线、唔存为可开关分析节点 | C | X1 |
| 9 | Center of Mass 命令 = 落一个 COM 十字标 | `toggleCom`（13232）COM 标记 | D | X1 |
| 10 | 右键体 → Properties 模态：面积/密度/质量/体积/材质/包围盒/COM/惯性@COM+@原点/复制到剪贴板；精度 低-中-高、可逐体、坐标 世界⇄COM 切换 | 底部常驻栏（`Viewport.tsx:6505`）：体积/面积/COM/质量/主惯性矩+回转半径/OBB/打印估算；无模态、无逐选体、无精度掣、无坐标切换 | B | X1 |
| 11 | Physical Material（影响质量）同 Appearance（纯视觉）分离 | `setPhysicalMaterial`（9518）只改密度不改色；`setMaterialPreset`（9514）改色+密度 —— 已分离 | D | X1 |
| 12 | 曲面分析（Zebra/曲率/拔模…）存为浏览树 Analysis 文件夹节点，逐个眼睛开关 | `inspectShade`（13274）zebra/曲率/高斯/梳 等係互斥即时叠层，唔持久化为可开关分析实体 | B | X1 |
| 13 | Zebra = 反射线级精确 | 屏幕空间条纹近似着色器（`Viewport.tsx:378`） | C | X1 |
| 14 | 曲率/拔模/斜率 = 解析 B-rep | 全离散网格（逐顶点/逐面平均，诚实「趋势/近似」） | C | X1 |
| 15 | Display Component Colors（Shift+N）逐组件上色开关 | `autoColorComponents`（8153）🎨自动配色，循环调色板 —— 近似达标 | D | X1 |
| 16 | Display Mesh Face Groups（Shift+F）逐网格面组上色 | `faceGroups` 供拔模用，但无「逐面组上色」显示开关 | A | X1 |
| 17 | 额外分析：Isocurve / Accessibility / 曲率图三型（高斯/平均/最大） / Min-Radius | 有 minradius/slope/gauss/curv/comb；缺 Isocurve、Accessibility、曲率图三型选择 | C | X1 |

**A/B 落地要点（§检查）**
- #1/#2：把 measure/edge/face/angle 4 个 store 掣合成一个「拾取集 + 上下文读数」引擎 —— 保留现有 `cad.measureFaceAt/measureEdgeAt`（13405/13442），新增按拾取实体类型对组合派生（1面=面积、2面=角、1边=长、边+面=最短距）；面板顶挂选择过滤（复用 `selFilter` 扩到 面/边/体/草图）。
- #3/#4/#5：`fmtLen`（2349）加一个 store `measurePrecision` 参数（0..8）+ 可选 `secondaryUnit`；捕捉标记复用草图 `snapTypes`（`store.ts:1240`）投到量测拾取。
- #6：`checkInterference`（7771）加 `interfSubset:string[]`（选定体）+ `includeCoincident:boolean`（放宽 0.5mm 容差到 0）+ 拆成「拣集 → 撳 Compute」两段（而家自动）。
- #10：新增 `openPropertiesDialog(bodyId)` 模态，复用 `computeMassProps`（`cad/massProps.ts:67`）已算好嘅 惯性@COM/@原点/主矩，加 accuracy(细分档→`exportQuality` 复用) + 复制按钮（照 `copyInterfReport` 7882 做文本 dump）。
- #12：把 `inspectShade` 状态提升为 `analyses[]` 数组（每项 {type,params,visible}），浏览树加 Analysis 文件夹眼睛开关。
- #16：加 `toggleMeshFaceGroupColors` —— `faceGroups` 已有，逐组循环 `COMP_PALETTE` 上色即可。

**✅ Wave X1 落地记录（2026-07-11）**

纯逻辑内核（全 Node 测过 `tests/inspectx1.test.mjs` 52 项）：
- `src/cad/measureCombine.ts` — 统一 Measure 组合分派（1面=面积 / 2面=夹角+补角 / 1边=长·孔径 / 2边=中点距+边向角 / 边+面=最短距 / 点+面·点+边=距 / 2点=距离+ΔXYZ）。
- `src/cad/measureFmt.ts` — `fmtLenP/fmtAreaP/fmtVolP/fmtAngP`（可选 prec 0..8 + secondary 副单位）；**唔传 prec/secondary 时逐字节等价旧读数**（store `fmtLen/fmtArea/fmtVol` 委托到此）。
- `src/cad/propsReport.ts` — `buildPropsReport`（面积/密度/质量/体积/材质/包围盒/质心/主惯矩/惯性 @世界⇄@COM）+ 剪贴板文本 + `accuracyToQuality`。
- `src/cad/analysesModel.ts` — 分析节点 reducer（upsert/toggle/remove/activeType）。
- `src/cad/faceGroupColors.ts` — 逐面组循环调色 → 逐顶点 color buffer。

Store（`store.ts`）：
- #1/#2 **旗舰**：`measureUniMode/measureUniPicks/measureUniResult`、`toggleMeasureUni`、`addMeasureUniPick`（headless 可驱动）、`pickMeasureUniAt`（视口拾取→worker 量面/边→组合）、`measureSelFilter{face,edge,body,sketch}`+`setMeasureSelFilter`。旧「量距/量边/量面/量角」保留做快捷（互斥清 `measureUniMode`）。命令 `measureuni`（I）。
- #3/#4/#5：`measurePrecision(null|0..8)`+`setMeasurePrecision`、`secondaryUnit`+`setSecondaryUnit`、`measureSnapMarkers`+`toggleMeasureSnapMarkers`（状态就位；捕捉标记视觉渲染留后续，逻辑已连精度/副单位入统一 Measure 面板）。
- #6：`checkInterference` 加子集（`interfSubset`，浏览器勾选→「用勾选」）+ `interfIncludeCoincident`（放宽 0.5→0，接触/共面亦列 vol 0）；命令 `interference` 改为**开面板→撳 Compute** 两步。
- #10：`propsDialog{bodyId,frame,accuracy}`+`propsDialogData`、`openPropertiesDialog(bodyId?)`（活动实体高/低精度经 `cad.exportSTL(quality)`→`parseSTL` 真重细分；组件用其网格）、`setPropsFrame/setPropsAccuracy/copyPropsReport`。命令 `properties`；浏览树组件行 ⚖ + 活动实体行点击。
- #12：`analyses[]` + `setAnalysisNodeVisible/removeAnalysisNode`；`setInspectShade/runDraftAnalysis/runSlopeAnalysis/setSection` 跑时 upsert 唯一可见节点，浏览树「分析」文件夹逐个 👁/🗑（关节点即清对应 overlay）。
- #16：`meshFaceGroupColors`+`toggleMeshFaceGroupColors`；`Viewport` KernelBody 活动实体加 `color` 属性 + `vertexColors`。命令 `meshfacegroups`。

**C 类诚实豁免（内核/架构窄版，保留现有诚实标签，唔当 bug）**
- **#7 干涉体积精确**：流形时 `meshBoolean('intersect')` 精确 + 散度定理体积；非流形回退蒙特卡洛估算（读数带 ≈）。属网格近似而非解析 B-rep 交集 —— **豁免**（内核窄）。
- **#8 Section 任意面/倾斜角**：webcad 剖切系 X/Y/Z 三轴对齐（`section.axis`）。本波已把剖切**存为可开关 Analysis 节点**（#12 覆盖，非破坏）；**任意平面面 + Angle1/Angle2 双向倾斜 + 剖面线** = 需内核任意切面管线 → **豁免·后置**（诚实：面板已注「3 轴对齐」）。
- **#13 Zebra 反射线级精确**：屏幕空间条纹着色器（`Viewport.tsx`），非环境反射线 —— **豁免**（着色器近似，已标「虚拟条纹」）。
- **#14 曲率/拔模/斜率解析 B-rep**：全离散网格逐顶点/逐面平均（Meyer cotangent / 角亏 K），已诚实标「趋势/近似」 —— **豁免**（网格近似，网格细化收敛）。
- **#17 额外分析（Isocurve/Accessibility/曲率图三型/Min-Radius）**：现有 minradius/slope/gauss/curv/comb；Isocurve/Accessibility/曲率图三型选择 = 未做 —— **豁免·后置**（网格近似族，非本波旗舰）。

**D 类已一致（#9 COM 标记 / #11 物理材质⇄外观分离 / #15 组件色）** — 复核无 action，保留。

---

## 三、§视图显示设定（VIEW） — 波次 X2

| # | Fusion 行为 | webcad 现况（+anchor） | 类型 | 波次 |
|---|---|---|---|---|
| 1 | 6 视觉样式枚举：着色 / 着色+隐藏边 / 着色+仅可见边 / 线框 / 线框+隐藏边 / 线框+仅可见边（Ctrl+4..9） | 「着色/线框」单掣（`toggleWireframe`）+ 边线独立开关（`edgeDisplay:'on'/'off'` 9416）；无 6 枚举、无隐藏边模式、无 Ctrl+4..9 | B | X2 |
| 2 | 相机三态：正交 / 透视 / 透视带正交面（转动透视、标准视图吸正交） | `cameraOrtho` 布尔两态（8000）；无「透视带正交面」 | B | X2 |
| 3 | ViewCube 右键菜单：Go Home / 投影三态 / 设当前为 Home / 设当前为前视 / Reset；面-边-角点击 + 滚动箭头 | drei `GizmoViewcube`（3650）净係定向对齐动画，无右键菜单、无滚动/roll 箭头、无罗盘 | C | X2 |
| 4 | Grid 设定：Adaptive（随缩放自适应）/ Fixed（主间距 250mm + 次分格 5）+ 参考数字 + 吸附到格 | drei `<Grid>` 写死 cellSize=10/sectionSize=100（3584）；无间距配置、无 adaptive/fixed 选择、无参考数字、草图外无吸格 | B | X2 |
| 5 | 四视口：Shift+1 转 2×2（上/前/右/等轴），各自 mini navbar + 同步视图 | 无此功能，单一 `<Canvas>` 单相机（`_webcad_view_behavior` 明证 grep 全无） | C | X2 |
| 6 | Effects 勾选表（环境穹顶/地面/地阴影/地反射/物阴影/AO/AA）卷入 Performance/Quality/Custom 预设 | 逐项独立掣：地阴影（13886）/地反射（13890）/GTAO（ssao）/PBR 渲染模式（8008）；无统一 Effects 表、无 Perf/Quality 预设卷、无 环境穹顶/物阴影 | B | X2 |
| 7 | 可选 HDRI 环境场景（7 个命名） | `hdriPreset` + `HDRI_PRESETS` 下拉（8011）—— 已有（仅渲染模式时显示） | D | X2 |
| 8 | Object Visibility 全局主开关：所有工作特征/原点面/轴/点/草图/关节… | 原点面逐项眼睛（BrowserTree）+ 草图开关；无单一「全部草图/全部原点面/全部关节」主面板 | A | X2 |
| 9 | Look At（正视选定面/边/平面） | `skLookAtNonce` Look-At + 340ms 缓动（`SketchLayer` CameraRig）—— 已有 | D | X2 |
| 10 | Orbit 模式：Free Orbit（可 roll）/ Constrained（锁世界上向、无 roll） | OrbitControls 单一自由 orbit（3634）；无约束（无 roll）模式 | A | X2 |
| 11 | 缩放方向偏好（Preferences 可反转） | 写死 deltaY>0=拉远（`WheelZoom` 2346）；无偏好 | A | X2 |
| 12 | 应用 Preferences 面板：主题 / 默认单位 / 默认朝向 Z-up / 自动正视草图 / 最低导航 FPS / 动画过渡 / 选择显示样式 / 恢复默认 | 无任何 Preferences 面板；仅 语言 zh/EN（`Ribbon.tsx:371`） | B | X2 |
| 13 | 每文档单位对话框：配对预设（mm/g、cm/g、m/kg、in/oz、ft/lb）+ Custom 长度+质量独立 | 单位係 3 路点击循环叶（mm/cm/inch，`BrowserTree.tsx:414`），显示专用、无质量单位、无预设、无 custom | B | X2 |
| 14 | 标准视图（前/上/右/等轴）有 navbar 入口 | 无常驻前/上/右按钮排；靠 ViewCube / 命名视图树 / 放射菜单 / Home 屋掣 | A | X2 |
| 15 | Ground Plane Offset 命令 | 无（地阴影平面固定） | A | X2 |
| 16 | Enter Full Screen（Ctrl+Shift+F） | 未见全屏切换 | A | X2 |
| 17 | 导航语法：orbit=中键+Shift、pan=中键、右键=标记菜单 | orbit=左键、pan=中/右键（3644）、右键无拖=标记菜单 —— 刻意差异（左键 orbit 更顺手），唔破坏 | D | X2 |

**A/B 落地要点（§视图）**
- #1：把「着色/线框」+ `edgeDisplay` 合成一个 `visualStyle` 枚举（6 值），映射到现有 `wireframe` + `<Edges>` 显示 + 隐藏边 dimming（Fusion Graphics「Hidden Edge Dimming」可参 `renderMode`），绑 Ctrl+4..9（`App.tsx` 全局键）。
- #2：`cameraOrtho` 升为 `cameraProj:'ortho'|'persp'|'perspOrtho'`；perspOrtho = 平时透视、`setView` 标准视图时临时切正交（`ViewRig` `SketchLayer.tsx:2480` 已有标准视图钩子）。
- #4：drei `<Grid>` 参数由 store `gridSpacing/gridSubdiv/gridAdaptive/gridRefNumbers` 驱动；adaptive 靠相机距离算 cellSize，fixed 直用值；参考数字用 drei GizmoHelper 或叠 HTML 标签。
- #6：加 `graphicsPreset:'performance'|'quality'|'custom'`，一键批设 现有 ssao/groundShadow/groundReflection/renderMode 各开关；手动改任一即落 custom（对齐 Fusion）。
- #8：加 `objectVisibility` 主开关组（allSketches/allPlanes/allAxes/allJoints），逐项 set 现有各实体 hidden 集。
- #10/#11：OrbitControls 加 `constrainOrbit`（锁 `enableRotate` 的 polar/up）+ `zoomDir` 偏好翻 `WheelZoom` 嘅 deltaY 符号。
- #12：新增 Preferences 模态（store `prefs{}` 持久化 localStorage）；主题/默认单位/Z-up 朝向/自动正视草图（现已 auto-ortho 订阅 17291）/animate-transitions（现 340ms tween 可关）全部接现有开关 + 恢复默认。
- #13：单位叶升为对话框：`unit` 扩到 配对预设（长度+质量），量测/属性显示读预设；模型仍 mm、导出仍 mm（`store.ts:2346` 不变）。
- #14/#15/#16：navbar 加 前/上/右 按钮（复用 `setView`）；`groundPlaneOffset` store 参数移地阴影平面 Y；全屏用 `requestFullscreen()`。

**✅ Wave X2 落地记录（2026-07-11）**

纯逻辑内核（全 Node 测过 `tests/viewx2.test.mjs` 59 项）：
- `src/cad/viewModel.ts` — 6 视觉样式枚举 ↔ 渲染态映射（`visualStyleToRender`/`renderToVisualStyle`/`edgeState↔Mode`）+ `VISUAL_STYLE_KEYMAP`（Ctrl+4..9）+ 图形预设批设（`graphicsPresetEffects`/`effectsToPreset`）+ 网格自适应/固定（`gridAdaptiveCellSize`/`computeGridConfig`，Fixed 默认 100/10 = 旧硬编码字节一致）+ 应用偏好 shape（`mergePrefs`/`DEFAULT_PREFS`）+ 相机三态（`cameraProjToOrtho`）。
- `src/cad/unitPresets.ts` — 5 配对预设（mm/g cm/g m/kg in/oz ft/lb）+ 长度/质量转换与格式化（`fmtLenU`/`fmtMassU`）+ `detectPreset`；`areaVolBaseUnit`（m/ft 面积体积回落 cm/inch 系）。

Store（`store.ts`）+ App/Viewport/SketchLayer/BrowserTree/index.css/io：
- **#1**：`visualStyle`(6)+`hiddenEdges`；`setVisualStyle` 派生 `wireframe`+`edgeDisplay`+`hiddenEdges`（旧 `toggleWireframe`/`setEdgeDisplay` 反向同步枚举，旧掣照旧 work）；Ctrl+4..9（`App.tsx`）；KernelBody 加第二层 `<Edges depthTest=false opacity .22>` 隐藏边暗显；显示 popup 6 样式单选。
- **#2**：`cameraProj:'ortho'|'persp'|'perspOrtho'`+`setCameraProj`+`notePerspOrthoOrbit`；`cameraOrtho` 仍为有效渲染布尔；旧 `toggleCameraOrtho` 同步三态；`ViewRig`（SketchLayer）标准视图钩 perspOrtho 吸正交；`OrbitControls onStart` → 手动 orbit 退返透视。**未郁 CameraRig sketch orient/tween 同 window.__three**。
- **#4**：`gridAdaptive/gridSpacing/gridSubdiv/gridRefNumbers`+`setGridConfig`；新 `<ConfigGrid>`（useFrame 采相机距离算 adaptive cell）取代硬编码 `<Grid>`；`<GridRefNumbers>` drei Html 沿轴标数（opt-in）；网格 popup 加自适应/固定+主间距+次分格+参考数字。
- **#6**：`graphicsPreset`+`setGraphicsPreset`（Perf/Quality 批设 ssao/groundShadow/groundReflection/renderMode；手动改任一 → custom）；显示 popup 分节 Effects 表。
- **#8**：`objectVis{sketches,planes,axes,joints}`+`setObjectVis`；Viewport 渲染 gate（构造面/轴/点/关节）+ `CommittedSketches` gate；navbar 👁▾ 主开关 popup。
- **#10/#11**：`orbitConstrained`（OrbitControls polar 钳 0.02..π-0.02 防翻极）；`prefs.zoomDir` 翻 `WheelZoom` deltaY 符号。
- **#12**：`prefs{theme,defaultUnit,zUp,autoOrthoSketch,animateTransitions,zoomDir}`+`setPref`/`resetPrefs`（localStorage `webcad-prefs`）；`<PrefsModal>`（navbar ⚙）；主题写 `data-theme`（index.css 深色变量 remap，渐进覆盖）；auto-ortho 订阅受 `prefs.autoOrthoSketch` 管。
- **#13**：`unitPreset`+`massUnit`+`<UnitDialog>`（BrowserTree 单位叶开）；`Unit` 扩到 mm/cm/m/inch/ft（`io/units.ts` 附加 m/ft，mm/cm/inch 字节不变）；store `fmtLen/fmtVol/fmtArea` 处理 m/ft（mm/cm/inch 仍委托 measureFmt，X1 byte-compat 保留）；Properties 质量按 massUnit 重格式；模型/导出恒 mm。
- **#14/#15/#16**：navbar 前/上/右按钮（复用 `setView`，perspOrtho 时吸正交）；`groundPlaneOffset`+`setGroundPlaneOffset`（移接地阴影/反射平面 Y）；全屏按钮 + Ctrl+Shift+F。
- 存档：`visualStyle/hiddenEdges/cameraProj/unitPreset/massUnit` 入 payload；`hydrateX2View` 还原（旧档缺 → 由 edgeDisplay 派生 / 默认，字节兼容）。

**C 类诚实豁免/窄版**
- **#3 ViewCube 右键菜单**：drei `GizmoViewcube` 无右键 API → 喺 Home 小屋按钮加 `onContextMenu` 弹小菜单（回 Home / 投影三态 / 设当前为前·上·右视图）—— **窄版达标**（唔系立方本体右键，但覆盖 Fusion 右键项）。
- **#5 四视口（2×2 上/前/右/等轴 + 同步）**：需 4 相机 / 4 pane 架构（单一 `<Canvas>` 单相机 → 多视口 = 大改渲染管线）—— **豁免·后置**（架构级，非本波状态机范围；单视口 + ViewCube/标准视图按钮/命名视图已覆盖日常切换）。
- **#7/#9/#17（D 已一致）**：HDRI 环境 / Look-At / 导航语法 —— 复核无 action，保留。

---

## 四、§插入（INSERT） — 波次 X3

| # | Fusion 行为 | webcad 现况（+anchor） | 类型 | 波次 |
|---|---|---|---|---|
| 1 | Canvas 描摹底图（贴平面/平面面）+ 右键 Calibrate（画线→输实长→整图缩放到 1:1） | `canvasImg`（`store.ts:1264`）贴草图面、`SketchLayer.tsx:1528` 四角 lift 渲染半透明画喺几何下；Calibrate 两点标定（`startCanvasCal` 12386 + 拾取 `Viewport.tsx:6625` → `w*(real/d)`）—— 核心已有 | D | X3 |
| 2 | 多张 Canvas（Canvases 文件夹）+ 贴草图外任意平面面 + 随项目存档 | 单张 `canvasImg`、仅草图模式内、会话级唔入存档（注 1263「dataURL 太肥」） | B | X3 |
| 3 | Canvas 字段：Display-Through / Selectable / Renderable / 非等比 Scale X-Y / Scale Plane / Z-Angle / H-V 翻转 | 只有 图宽 + 透明 + 中心 X-Y（`Viewport.tsx:5710`）；无以上诸旗标/非等比/旋转/翻转 | A | X3 |
| 4 | Decal（图片蒙皮到面，拾面+投影） | `decals[]`（1723）拾点+法线投影到面、随项目存档、`placeDecalAt`（9549）、上限 16 | D | X3 |
| 5 | Decal 字段：Chain-Faces / Opacity / Keep-Aspect 宽-高 / X-Y 距离 / Z-Angle / H-V 翻转 | 只有 size + rot（9569/9570）；无 链面/透明/锁比宽高/UV 位置/翻转 | A | X3 |
| 6 | Insert SVG = 入成**可编辑草图曲线**喺选定平面（可再改约束/尺寸/拉伸） | `importSvg`（15189）→ `importProfiles2D`（15181）砌 extrude 特征带**固定 profile**、无 sketchId → 只可改拉伸高度、曲线改唔到 | C | X3 |
| 7 | Insert SVG 对话框：平面选择 / Z-Angle / Scale Plane XY / Control-Point-Fitting | 仅 文件 + 拉伸高度 prompt（`openSvgDialog` 15196）；平面隐含 XY，无 Z 角/缩放/控点拟合 | B | X3 |
| 8 | Insert DXF = 可编辑草图曲线 + Units 解释下拉 + 逐层包含勾选 + 单草图/逐层模式 + 平面选择 | `importDxf`（15173）extrude 固定 profile；解析丰富（io/dxfImport：LINE/多段线/CIRCLE/ARC/SPLINE-NURBS带权/ELLIPSE/INSERT 块）但所有层合并、假设 mm、仅高度 prompt | C | X3 |
| 9 | 草图节点右键 Export DXF | `exportSketchDxf`/`exportFlatDxf`（2124/2125）+ ribbon `sk_dxf`（`ribbon.ts:422`）—— 已有 | D | X3 |
| 10 | Insert Mesh（STL/OBJ/3MF）入网格体 | `importStl`（15074）/`importObj`（15086）/`import3MF`（15104）入组件、自动 fit、水密检查；3MF 多件保位姿+单位转 mm | D | X3 |
| 11 | Insert Mesh：Unit-Type 下拉 + Flip-Up-Direction + 落地 移动/旋转 gizmo（Center / Move-to-Ground / 数值） | STL/OBJ 假设 mm（仅 3MF 读文件单位）；无 flip-up；无插入 gizmo（落喺 originX 偏移，插入后先可 move/stack/drop） | B | X3 |
| 12 | STEP 入组件 | 双路：mesh 组件（`importStep` 15137，彩色装配分件）+ B-rep 时间轴（`openStepBrepDialog` 15122，可再切/圆角/导出）—— 超越 Fusion Insert（B-rep 可编辑） | D | X3 |
| 13 | Insert Component（把另一 hub 设计做被引用组件） | 无 cloud/多文档；文件导入覆盖「外部几何做组件」 | E | X3 |
| 14 | Insert Derive（关联跨文档链接，源改则更新） | 无 cloud/多文档 hub → 天生做唔到 | E | X3 |
| 15 | McMaster-Carr / 厂商件 / TraceParts 网上零件库 | 无（web/登入 gated；Fusion 自己都 gate） | E | X3 |
| 16 | Insert Fastener（紧固件目录插入） | 无紧固件目录插入（量测有 `recommendFastenerSize` 建议尺寸，非插体） | E | X3 |

**A/B 落地要点（§插入）**
- #2：`canvasImg` 单值升为 `canvases[]` 数组、各带 planeRef（复用 datum/面拾取），存档时降采样/压缩存 dataURL 或存 blob 引用（避「太肥」）—— 至少畀「入存档」做可选。
- #3：`updateCanvasImg`（12384）扩字段 `{displayThrough,selectable,renderable,scaleX,scaleY,zAngle,flipH,flipV}`，`SketchLayer.tsx:1528` 渲染层读旗标（displayThrough=关深度测试、selectable=raycast 层开关）。
- #5：`decals` 每项加 `{chainFaces,opacity,keepAspect,w,h,u,v,flipH,flipV}`；DecalOverlay 生成 DecalGeometry 时用 w/h 取代单 size、u/v 取代拾取点偏移。
- #7/#8：SVG/DXF 对话框加 平面选择（复用 datum 面拾取）+ Z 角 + Scale + （DXF）Units 下拉 + 逐层勾选（io/dxfImport 已能分层，`classifyProfiles` 前保留 layer）+ 单/逐层模式。
- #6/#8（核心 C）：把 `importProfiles2D`（15181）改为可选「入草图源」路径 —— 生成 `sketchSources[skId]` + extrude 特征带 `sketchId`（而非内嵌 profile），咁双击时间轴节点 → `editSketchOf`（`store.ts:5078`）可重开改曲线（`Timeline.tsx:212` 的 hasSketch 判据即命中）。呢个係最高杠杆、要过草图源管线。
- #11：`openStlDialog/openObjDialog`（13209/15096）插入前弹 单位下拉 + flip-up 勾（转 Y↔Z）+ 落地 gizmo（复用现有 move/`dropAllToFloor`/`stackComponents` 做 Center/Move-to-Ground 快捷）。

**✅ Wave X3 落地记录（2026-07-11）**

纯逻辑内核（全 Node 测过 `tests/insertx3.test.mjs` 69 项）：
- `src/cad/insertModel.ts` — 全 headless、byte-compat（新字段默认值时省略）：
  - **Canvas**：`makeCanvas/patchCanvas/sanitizeCanvases（含旧 canvasImg→canvases[0] 迁移）/archivedCanvases/canvasToLegacyImg/nextCanvasId`；`canvasQuad`（非等比 scaleX/Y + 绕中心 zAngle 四角）+ `canvasUV`（flipH/V 镜像）。
  - **Decal**：`decalExtras`（omit-on-default）/`patchDecalFields`（清到默认删键）/`decalBox`（w·h 覆盖单 size + depth）/`flipUVArray`/`decalLinkAspect`。
  - **SVG/DXF→草图源**：`impToSketchShape/transformImpProfile/xform2D/buildImportSketchSource`（多轮廓合一 sketchId，cons:[]）/`isReopenableSketchFeature`（对齐 Timeline hasSketch 判据）/`filterByLayers/collectLayers`。
  - **Mesh**：`meshUnitScaleMm/flipUpVec/transformMesh`（单位缩放 + Y↔Z flip，含法向）/`meshBBox/meshPlaceOffset`（ground/center）。
- `src/io/dxfImport.ts` — 逐轮廓保留 `layer`（group-code 8，块内实体继承 INSERT layer）；`parseDxfToProfiles` 返回 `layers[]`；`classifyProfiles` 保留 layer（零回归旧调用）。

Store（`store.ts`）+ Viewport/SketchLayer/App/InsertDialog：
- **#2 多张 Canvas**：`canvases[]`+`activeCanvas`；`canvasImg` 降为【活动 canvas 旧读数镜像】（既有 sketch-bar/两点标定无改动照跑）；`addCanvas/setActiveCanvas/removeCanvas/cycleCanvas/updateCanvasFields`；`setCanvasImg` 改为「有活动就地替换 / 无活动追加（**绝不清掉已有/载入的其他 canvas**）」；存档只写 `inArchive` 张（`archivedCanvases`，默认省略键）；3 loader 全 `hydrateCanvases`（迁移旧 canvasImg + 活动指到首张）；reset 清空。
- **#3 Canvas 字段**：`updateCanvasFields`；`SketchLayer.CanvasImageLayer` 重写为逐 `canvases[]` 渲染 —— displayThrough=关 depthTest+renderOrder 前置、selectable=raycast 开关、scaleX/Y 非等比、zAngle 旋转、flipH/V 翻 UV；草图模式全显（描摹）、建模模式仅 `renderable===true`（旧快速描摹仍仅草图见=零回归；`addCanvas` opt-in renderable=Fusion Canvases 文件夹）。
- **#5 Decal 字段**：`decals[]` 每项加 `{chainFaces,opacity,keepAspect,w,h,u,v,flipH,flipV}`（默认省略）；`updateDecal`；`sanitizeDecals` 经 `decalExtras` 还原；`DecalOverlay` 用 `decalBox`（w/h 取代单 size）+ u/v 沿局部切向偏移拾取点 + `flipUVArray` 翻转 + material opacity；工具栏加 W/H·透明·U/V·⇄⇅·链面。
- **#6/#8 最高杠杆 C（SVG/DXF→可编辑草图曲线）**：`importProfiles2D` 加 `opt.asSketch`（默认 true）→ 经 `buildImportSketchSource` + **既有** `extrudeFeatsFromShapes(shapes,{...},skId)` 生成带 sketchId 的 extrude 组 + 归档 `sketchSources[skId]` → 双击时间轴节点 `editSketchOf` 重开改曲线/加尺寸（`Timeline.tsx:212` hasSketch 命中）；失败诚实降级回旧固定轮廓（`scaleRotProfile` 兜底缩放/旋转）。
- **#7/#8 SVG/DXF 对话框**：`insertVec` 状态 + `openInsertVec/setInsertVec/toggleInsertVecLayer/confirmInsertVec/cancelInsertVec` + `components/InsertDialog.tsx`（平面 / Z角 / 缩放 / DXF 单位下拉 / 逐层包含勾选 / 入草图源勾）；`openSvgDialog/openDxfDialog` 改为读文件→解析取层→弹对话框。
- **#11 Mesh 插入字段**：`insertMesh` 状态 + `openMeshInsert/setInsertMesh/confirmInsertMesh/cancelInsertMesh` + InsertDialog（单位下拉 + flip-up 勾 + 落地摆位 none/center/ground）；`importStl/importObj` 加 `opt` → `applyMeshInsertOpt`（单位缩放 + flip-up 顶点/法向）+ 落地复用现有 `seatComponent/centerComponentXZ`。
- 存档：`canvases`（仅 inArchive）入 payload（默认省略键，byte-compat）；`decals` 扩字段随存档；旧档（无 canvases / 含旧 canvasImg）照常 load。

**E 类诚实豁免（云端/后端 gated，写此不实现 —— clean-room 浏览器无 cloud 层，Fusion 自己都 gate）**
- **#13 Insert Component（多文档 hub）**：需多文档/云 hub — 文件导入（STL/OBJ/STEP/3MF）已覆盖「外部几何做组件」，**豁免**（无 cloud 多文档）。
- **#14 Insert Derive（跨文档关联链接，源改则更新）**：需云端多文档关联链 — 浏览器 clean-room 天生做唔到，**豁免**。
- **#15 McMaster-Carr / TraceParts / 厂商件网上零件库**：web/登入 gated 目录（Fusion 离线/未登入亦 gate），**豁免**。
- **#16 Insert Fastener（紧固件目录插入）**：需在线紧固件目录 — 现有 `recommendFastenerSize` 只建议尺寸非插体，插入体化需目录，**豁免**。

**D 类已一致（#1 Canvas 描摹+两点 Calibrate / #4 Decal 拾面投影+存档 / #9 草图右键 Export DXF / #10 Insert Mesh 入网格体 / #12 STEP 双路 mesh+B-rep）** — 复核无 action，保留（本波在其上加字段，不破坏）。

---

## 五、§时间轴+选择（TIMELINE + 选择） — 波次 X4

| # | Fusion 行为 | webcad 现况（+anchor） | 类型 | 波次 |
|---|---|---|---|---|
| 1 | 回卷 marker 可拖动 scrub 历史（非破坏抑制后续） | `gotoStep`（`store.ts:9390`）重建前 n 个未抑制特征；marker `<span className="tl-marker">` 拖动 scrub（`Timeline.tsx:144-176`，合并重建）；回卷 chip 变暗+虚线（220） | D | X4 |
| 2 | 播放控制：跳头/上一步/播放/下一步/跳尾 | 全有（`Timeline.tsx:181-185`），`play()` 320ms/步 + 重入锁 | D | X4 |
| 3 | 抑制特征（非破坏跳过） | `toggleSuppress`（14098）suppressedIds、undo-safe；chip 变暗+斜纹（`index.css:309`） | D | X4 |
| 4 | 双击节点 = 重开创建对话框 / 编辑草图 | `openFeatDlgForEdit`（白名单 kind）/ `editSketchOf`（`Timeline.tsx:229-233`） | D | X4 |
| 5 | Move（重排特征次序） | `moveFeature` ◀▶（13852） | D | X4 |
| 6 | 节点**右键上下文菜单**：编辑/在此回卷/抑制/删除/改名/移动/在浏览器中查找 | 无 chip 右键菜单；动作散喺单击后内嵌编辑条（`Timeline.tsx:245-306`）+ 双击 | B | X4 |
| 7 | 「Roll Timeline Marker Here」显式菜单项 | 点回卷 chip 即重建到该步（`Timeline.tsx:227`）/ 拖 marker —— 功能有、无菜单项 | D | X4 |
| 8 | 时间轴节点改名 | 改名喺浏览树双击（`renameFeature` 13847），非时间轴 chip | A | X4 |
| 9 | 齿轮设定：转直接建模（弃历史）/ 组件色板 / 隐藏失效特征 | 无齿轮菜单；三项全无（转直接建模=大架构；色板+隐藏失效=细） | B | X4 |
| 10 | 从节点 Find-in-Browser / Find-in-Window 跳转高亮 | 无跨面板跳转高亮 | A | X4 |
| 11 | 体可无历史节点（导入/base 特征） | 导入 STL/OBJ/STEP mesh = 组件无时间轴节点 —— 一致 | D | X4 |
| 12 | 标记菜单（8 扇区 + 重复上一命令 + 溢出列表） | `MarkingMenu.tsx` 已上线：8 扇区 + 顶「重复」+ 甩手势 + 触屏线性回退 + 三上下文（草图/实体/空境，`Viewport.tsx:3717`） | D | X4 |
| 13 | Selection Priority：体/面/边优先 | `selFilter` 3 路（全/件/体，4323）；无 边优先/面优先细分 | B | X4 |
| 14 | 逐类型 Filter 勾选表（Bodies/Edges/Faces/Vertices/Sketch/Canvas… 各独立）+ Select-All | 粗 3 路，无逐类型；无 Select-All 主掣 | B | X4 |
| 15 | Select Through（拣被遮挡对象） | 无 | A | X4 |
| 16 | 框选 窗选(L→R 蓝实)/交叉(R→L 绿虚) | 有（`Viewport.tsx:3254-3346`，Shift 累加）**但只框选组件**、唔框面/边/体 | C | X4 |
| 17 | Freeform 套索选择 | 无（仅矩形框） | A | X4 |
| 18 | Paint 笔刷选面 | 无 | A | X4 |
| 19 | Select By Name/Size/Boundary / Invert / Seed-and-Boundary | 无 | B | X4 |
| 20 | Ctrl/Shift 累加选择 | Shift 框选累加 + Ctrl 时间轴特征多选（`Timeline.tsx:224`）+ 阵列多目标 | D | X4 |

**A/B 落地要点（§时间轴+选择）**
- #6：chip 上加 `onContextMenu` → 复用 `MarkingMenu`（已存在）畀 编辑/在此回卷/抑制/删除/改名/移动/查找 —— 全部已有 store 动作（`openFeatDlgForEdit`/`gotoStep`/`toggleSuppress`/`removeFeature`/`renameFeature`/`moveFeature`），纯接线。
- #8：chip 右键菜单挂 `renameFeature`（13847，已存在）即达标。
- #9：时间轴加齿轮：`componentColorSwatch`（chip 按 owning component 色染，读 `components[].color`）+ `hideInactive`（隐藏 suppressed/rolled chip，CSS 已有 suppressed 样式）；「转直接建模」列 C 后置（弃历史=大架构）。
- #10：Find = `selectFeature` + BrowserTree/Viewport 滚到高亮（复用现有 `requestFit(id)` 聚焦机制）。
- #13/#14：`selFilter` 由 3 枚举升为 `{priority:'body'|'face'|'edge', types:Set<...>, selectThrough:bool}`；raycast 拾取（`Viewport.tsx:3369` pickable 判据）读 types 集过滤命中类型；Select-All = 一键全勾。
- #15：Select-Through = 框选/拾取时唔做深度遮挡剔除（raycast 取全部命中非仅最近）。
- #17/#18/#19：套索 = marquee 改多边形命中测试；笔刷 = 拖动逐面 add；By-Name/Size = 遍历 `components`/faceGroups 按谓词选；Invert/Seed 靠现有选择集补运算。

---

## 六、类型 / 波次 统计

**按类型（全 70 条）**

| 类型 | 计 | 含义 |
|---|---|---|
| A 直接跟 | 17 | 加字段/加掣，接现有机制 |
| B 改状态机 | 19 | 扩 store 状态/枚举、拆两段、加面板 |
| C 内核/架构窄版 | 10 | 需过内核或大管线（草图源/四视口/解析 B-rep/直接建模） |
| D 已一致 | 20 | 已达或超越 Fusion，唔改 |
| E 未实证/gated | 4 | 云端/网站 catalog，webcad 无 cloud → 天生豁免 |

**按波次**

| 波次 | 计 | A | B | C | D | E |
|---|---|---|---|---|---|---|
| X1 检查 | 17 | 4 | 5 | 5 | 3 | 0 |
| X2 视图显示 | 17 | 6 | 6 | 2 | 3 | 0 |
| X3 插入 | 16 | 2 | 3 | 2 | 5 | 4 |
| X4 时间轴选择 | 20 | 5 | 5 | 1 | 9 | 0 |
| **合计** | **70** | **17** | **19** | **10** | **20** | **4** |

值得留意：D（已一致）= 20 条係四区最大单一类别 —— webcad 喺呢批「日常 UX 面」其实好扎实（标记菜单/时间轴回卷/播放/抑制/双击编辑/Canvas Calibrate/Look-At/HDRI/STEP B-rep 全部到位）。真裂缝集中喺 A+B=36 条嘅「加字段+扩状态机」，绝大多数唔使郁内核；净 10 条 C 要架构级投入。

---

## 七、跨区最高价值 Top-10

| 排 | 差距 | 波次 | 类型 | 点解高价值 |
|---|---|---|---|---|
| 1 | 统一 Measure 命令（任意实体↔实体上下文读数）+ 逐类型选择过滤 | X1 | B | 合并 4 个互斥模式掣（`store.ts:13237/13403/13440/13474）→ 一个引擎，日日用、体感最大 |
| 2 | 模态 Properties 对话框（精度 低/中/高 + 逐选体 + 复制） | X1 | B | 现只底部常驻栏（`Viewport.tsx:6505`）；`computeMassProps` 已算好，纯 UI + accuracy |
| 3 | DXF/SVG 入嚟做**可编辑草图曲线**（而非固定轮廓拉伸） | X3 | C | `importProfiles2D`（15181）改走草图源管线 → 双击可重编辑曲线；最高杠杆 |
| 4 | 逐类型选择过滤勾选表 + Select Priority（体/面/边） | X4 | B | `selFilter` 3 路（4323）→ 逐类型 + Select-Through；密集装配/精拣刚需 |
| 5 | 6 视觉样式枚举（着色±边/线框±边，Ctrl+4..9） | X2 | B | 合 `wireframe`+`edgeDisplay`（9416）成枚举 + 隐藏边模式 |
| 6 | 相机三态（正交/透视/透视带正交面） | X2 | B | `cameraOrtho`（8000）升三态；透视带正交面 = CAD 标准观感 |
| 7 | 可配置网格（adaptive/fixed + 主间距 + 参考数字） | X2 | B | drei `<Grid>` 写死 10/100mm（3584）→ store 驱动 |
| 8 | Section 任意平面面 + 2 倾斜角 + 持久 Analysis 节点 | X1 | C | 现仅 X/Y/Z 三轴对齐（9429）；任意面 + 可开关分析实体 |
| 9 | ViewCube 右键菜单（Home/设前视/投影三态） | X2 | C | drei ViewCube（3650）无右键；要自绘或换 gizmo |
| 10 | 四视口（上/前/右/等轴 + 同步） | X2 | C | 单 `<Canvas>` → 多相机/多 pane，CAD 标准期望 |

---

*备注：clean-room 全程只对标行为/语法，未取用任何 Fusion icon/字眼/资源。E 类（Derive/McMaster/厂商/TraceParts）係 Fusion 云端能力，webcad 无 cloud 层属天生豁免、唔算真差距。C 类近似（曲率/拔模/截面/干涉/网格量测）已诚实标注，属深思熟虑嘅降级、非 bug，保留。*
