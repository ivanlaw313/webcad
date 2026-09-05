# webcad 自由草图（free sketcher）当前行为清单

> 目的：逐行对照 Fusion 360 行为规格做 parity gap。本文件只做 INVENTORY（现状盘点），不做评价/建议。
> 覆盖范围 = `src/store.ts` 草图状态机 + `src/components/SketchLayer.tsx`（3D 层渲染 + HUD 尺寸层）+ `src/components/Viewport.tsx`（草图工具条 / 相机 / 框选）+ `src/components/SketchToolPanel.tsx`（浮动工具选项面板）+ `src/ribbon.ts`（情境「草图」Ribbon tab）。约束草图 csketch 单独于 §8 简述。
> 关键类型：`SketchShape`（store.ts:56-59）、`SketchTool`（store.ts:60）、`SkRef`（freesolve.ts:71-77）、`SkConType`（freesolve.ts:191）、`SkCon`（freesolve.ts:192-194）。

---

## 0. 进入/退出草图

### 进入路径
- **命令入口**：Ribbon「创建草图」`id:'sketch'`（快捷键 **Shift+S**，ribbon.ts:24；App.tsx:176 `case 's': if(e.shiftKey) s.startSketch()`）。亦有「面上草图」`facesketch`（ribbon.ts:25）。
- **`startSketch()`**（store.ts:5493-5500）：进入 **`mode:'pickplane'`**（不是直接进 sketch），默认 `sketchTool:'rectangle'`、`sketchOp:'new'`（每次新草图强制回「＋新建」，避免残留 切割/相交），清空所有草图态。状态栏提示「选择草图基准面：点 红XY/绿XZ/蓝YZ 原点面，或实体的平坦面，或橙色参考平面…Esc 取消」。
- **平面拾取三种来源**：
  1. **三原点基准面** → `chooseSketchPlane(plane)`（store.ts:5501-5506）：`mode:'sketch'`，`sketchPlane∈{XY,XZ,YZ}`，`sketchBaseZ:0`，调 `skGeoFocus()` 计算投影参考几何 + 相机取景框。
  2. **实体平坦面** → `startSketchOnFace(threePt, cadNormal)`（store.ts:4223-4260+）：cardinal 面走 `sketchPlane+sketchBaseZ`；斜面走 `sketchArb`（真平面基 o/xd/n，任意平坦面可画，store.ts:887）。网格件面 → `sketchOnMeshFaceAt`（store.ts:892）。#11 关联 datum 面 → 记 `_pendingDatumRef`（store.ts:78, 5643）。
  3. **橙色参考平面（datum/offset plane）**：先用 CONSTRUCT 建偏移平面再拾取。
- **重开已有草图** → `editSketchOf` / `editSketchBySrc`（store.ts:1173-1175, 4690）：`mode:'sketch'`, `skEditTarget=skId`, `sketchTool:'select'`，还原 shapes+skCons（深拷贝，ensureDimNames 补 d# 名）。

### 进入时相机行为
- **自动切正交（auto-ortho）**：入草图强制正投影（Fusion 行为），实现于 **store 层 zustand 订阅**（store.ts:15915-15925，非 R3F effect —— headless/背景分页 effect 可能不跑）。入草图记录 `_skPrevOrtho`，若非正交则 `queueMicrotask setCameraOrtho(true)`；草图中用户手动按 📐 切走 = 尊重（不再强制）。
- **look-at 正对平面 + 自动取景**（`CameraRig`，SketchLayer.tsx:193-282）：优先 `sketchFocus`（拾取面/footprint bbox，store.ts:145-156 `skGeoFocus`）→ 相机沿平面法向定位、target 落面心；斜面（arb）分支正对 arb.n（SketchLayer.tsx:252-263，加 0.01 切向微偏避免 roll 退化）；默认 cardinal 用 `SK[plane].cam`。取景距离 `d=max(1.6×内容跨度,120)`（内容 = 已有轮廓 bbox ∪ 投影参考 bbox ∪ 实体对角线）；正交相机用 `zoom=半帧/(半径×1.15)`（SketchLayer.tsx:276-282）。

### 退出路径 / 工具条
- **草图工具条**（`.sketch-bar`，Viewport.tsx:5290+）出现于 `mode==='sketch'`：↖选择、⟷尺寸、约束状态徽章、面 select（XY/XZ/YZ）、👁 Sketch-Palette 开关（填充/标注/构造/网格）、🧲几何捕捉、👓透视（see-thru）、诊断、基准Z、拉伸… 等；可拖移（⠿ 手柄）、可收起成 pill（Viewport.tsx:5285）。**绘图工具本体（矩形/圆/线/弧…）不在此条**，在 Ribbon 情境「草图」tab（§2）与右键放射菜单。浮动「⚙工具选项」面板只显当前工具参数（SketchToolPanel.tsx）。
- **完成草图**：无专门大按钮，经 `finishSketch()`（store.ts:5508-5516）：重开中→`applySketchEdit`；有 loft 截面→`exitSketchMode`；有轮廓→`commitStandaloneSketch()`（store.ts:5633，存成【独立草图特征】紫线，入时间轴/浏览树，可重开）；空→`exitSketchMode`。右键放射菜单有「✓ 完成草图」扇区（Viewport.tsx:3549）。
- **ESC 逐级退出**（`escSketch()` store.ts:3205-3237，App.tsx:191 先 escSketch 再 tryExitSketch）：Fusion 式 step-back —— ①绘制中：≥2 点折线未收笔→`finishOpenPolyline` 保留已画段；多阶段工具（弧/椭圆弧…）逐阶段退格（pop 一点）；单点/两点形→取消当前绘制。②`sizing`/`skBoolPending`/`mirrorPick` 进行中→先取消。③非 select 工具→退回 select。④有选择→清选择。⑤全空→返回 false → `tryExitSketch()`。
- **`tryExitSketch()`**（store.ts:5616-5630）：有未保存轮廓时弹 `appConfirm`（确定=保存成独立草图并退 / 取消=留在草图）；空草图直接退；重开编辑中弹「保存并重建 / 留下」。
- **退出相机还原**：`_skWasSketch` 转 false 时 `setCameraOrtho(_skPrevOrtho)`（store.ts:15924）—— 还原进入前正交/透视状态。`exitSketchMode`（store.ts:5607-5613）清 refGeo/焦点/pendingDatumRef，`mode:'model'`。

---

## 1. 视图控制（草图内）

- **滚轮缩放（zoom-to-cursor，Fusion 行为）**：`WheelZoom`（Viewport.tsx:2281-2329）在 capture 相位吞掉 OrbitControls 原生滚轮（`stopImmediatePropagation`）。射线打光标下命中点（实体面/草图面/地面）作为 pivot，相机 **AND** target 一起朝命中点收敛（Viewport.tsx:2322-2323）；无命中回落 orbit target。**正交相机**改 `camera.zoom` 并平移 target/position 令光标点屏幕位置不变（Viewport.tsx:2304-2314）。**Shift = 精细缩放**（0.32× 步进，Viewport.tsx:2301）。OrbitControls 亦挂 `zoomToCursor`（Viewport.tsx:3516）。
- **平移（pan）**：中键 / 右键 = PAN（`mouseButtons` MIDDLE/RIGHT: MOUSE.PAN，Viewport.tsx:3521）。触屏草图模式单指 = PAN（`touches.ONE = TOUCH.PAN`，Viewport.tsx:3523），双指捏合 = DOLLY_PAN。左键 navTool='pan' 时也 PAN。
- **轨道旋转在草图内锁定**：`enableRotate={mode !== 'sketch' && navTool === 'orbit'}`（Viewport.tsx:3520）—— **草图模式恒不可旋转**（保持正对平面）。
- **透视/正交切换**：`cameraOrtho`（store.ts:7059-7064，`toggleCameraOrtho` fitNonce++）。草图内默认强制正交（§0）；用户可手动 📐 切换。透视 FOV 可调 10-60（默认 28，store.ts:7063）。正交相机 = drei `<OrthographicCamera makeDefault>`（Viewport.tsx:3244）。

---

## 2. 逐个创建工具

工具激活统一经 `runCommand('sk_*')`（store.ts:8734-8744，`TOOLMAP` 映射 → `setSketchTool`），或直接键盘。`setSketchTool`（store.ts:3200）换工具即清 sketchStart/preview/polyPts/polyBulges/相切弧 buffer/合并拾取/悬停预览/sizing。**键盘快捷键（仅这几个，来自 App.tsx:174-197 switch，非 sketchTypeKey）**：L=直线(polyline)、R=矩形、C=圆、A=圆弧（折线中且≥2点=切相切弧 submode）、D=尺寸、X=构造切换、T=修剪、Shift+S=创建草图。`sketchTypeKey`（store.ts:6136）实为「绘制中打字输入精确尺寸/坐标」路由，非工具激活键。

**打字尺寸文法通则**（`sketchTypeKey` store.ts:6136-6167；App.tsx:78-100 路由）：
- 未落首点：打数字进入**起点绝对坐标** X `Tab` Y `Enter`（store.ts:6143-6157）。
- 已落点：数字进 `dimBuf[dimField]`（≤9 字符）；`Tab` 在两字段形（rect/crect/rrect/ellipse）间切 W/H（store.ts:6165）；`Enter` 按打的值提交；`Backspace` 退格；`Escape` 清 buffer。多阶段工具用逐阶段标签 `multiStageTypedLabel`（半径/扫角/短半轴/ρ…，store.ts:6161）。不支持打字的阶段显示 `SK_TYPED_UNSUP`（store.ts:6162, 6170）。
- **工具完成后保持 armed**（不回 select）：two-click/多阶段形完成后 `sketchStart:null` 但 `sketchTool` 不变 → 可连续画下一个；开始新形时把上一 `sketchShape` bank 进 `sketchProfiles`（store.ts:6014-6018 multi-contour）。例外：mirror/array/text/布尔/offset 等完成后切回 `select`。
- **落形后自动约束推断**（store.ts:6023, 6382）：`applyCoincidentInference`（端点精确吸附既有点→◉重合，store.ts:5519-5533，冲突自动回滚）+ `applyDrawInference`（平行/垂直/相切/等半径，≤6 个/批，store.ts:5538-5605）。H/V 由 `closePolyline` 落（§见下）。
- **右键绘制中**：弹 Fusion 式**放射 marking 菜单**（Viewport.tsx:3543-3566）：扇区=重复/直线/矩形/圆/完成草图/拉伸/撤销/取消绘制；溢出=尺寸/选择/中心矩形/三点圆/多边形/阵列 + Palette 开关。非「右键=收笔」语义。

各工具（Ribbon「草图」CREATE 组 ribbon.ts:369-393；点击序列在 `onSketchClick` store.ts:5746-6024）：

| 工具 (SketchTool) | Ribbon id / 键 | 点击序列 | live 预览 / 打字 / 备注 |
|---|---|---|---|
| **polyline（直线/折线）** | sk_polyline / **L** | 连续点击；回起点<4mm 或「✓闭合」闭合；「✓完成线」= 开放折线(finishOpenPolyline) | 方向吸 0/45/90/135°+平行/垂直上一段（angle inference, store.ts:437-460）；打数字=段长（store.ts:6221-6226）；**A 键**切「相切弧 submode」`polyArcMode`（沿上段切线引弧，bulge=tan(φ/2)，store.ts:5998-6008）；去重<0.3mm（store.ts:6011） |
| **rectangle（两点矩形）** | sk_rect / **R** | 角点1→角点2 | 打 W `Tab` H `Enter`（store.ts:6173-6178） |
| **crect（中心矩形）** | sk_crect | 中心→角点（对称） | 打 全宽×全高（store.ts:6190-6194） |
| **rect3（三点矩形/斜矩形）** | sk_rect3 | 点1→点2 定一边→点3 定宽（投影法向） | 阶段①打边长②打宽 COMMIT（store.ts:6229-6242）；宽<0.2 拒绝 |
| **circle（圆）** | sk_circle / **C** | 圆心→半径 | 打半径 `Enter`；r<0.5 拒绝（吸附拉回圆心，store.ts:5835） |
| **circle3（三点圆）** | sk_circle3 | 三点定外接圆；共线拒绝（store.ts:5972） | — |
| **circle2t / circle3t（2/3 切点圆）** | sk_circle2t/3t | 点 2/3 条直线边 → `skTanCircleAt`（store.ts:5760）；半径=底栏「切圆R」sketchTanR | 自动加相切约束；点击侧决定圆落哪侧 |
| **polygon（正多边形）** | sk_polygon | 中心→一角；边数=sketchSides，内切/外接=polyInscribed | 内切模式打的数=对边距/2（store.ts:6183-6186） |
| **slot（腰形槽）** | sk_slot | 端心1→端心2；槽宽=sketchSlotW；真圆弧端（vertsPoly bulge，store.ts:5876-5891） | 打长度（store.ts:6202-6208）；两端重合<0.5 拒绝 |
| **arcslot（圆弧槽）** | sk_arcslot | 弧心→一端→另一端；4 真弧 verts（store.ts:5850-5874） | 槽宽≥直径/弧太短 拒绝；打字阶段 store.ts:6264+ |
| **rrect（圆角矩形）** | sk_rrect | 对角两点；R=sketchCornerR；8 真弧 verts（store.ts:5893-5915） | 打 W×H（store.ts:6210-6219）；R<0.5 退化直角 |
| **arc（三点圆弧）** | sk_arc / **A** | 起点→终点→弧上一点；真圆弧 open poly + `arc:{a,b,m}`（store.ts:5959-5964） | 单一开放曲线，可标 R/相切，「闭合」封口 |
| **arcc（中心点圆弧）** | sk_arcc | 圆心→起点(定R)→终点(定扫角，取短向)（store.ts:5795-5813） | 阶段①打半径②打扫角°（store.ts:6244-6262） |
| **earc（椭圆弧）** | sk_earc | 中心→长轴端→短轴→起角→终角(逆时针)；真椭圆边 `earc{}`（store.ts:5941-5957） | 5 阶段；起点打字 store.ts:6155 |
| **ellipse（椭圆）** | sk_ellipse | 中心→半轴；48 边 poly + 真椭圆 `ell{}`（store.ts:5916-5924） | 打 全宽×全高（store.ts:6196-6201） |
| **conic（圆锥曲线）** | sk_conic | 起点→终点→顶点；ρ=sketchConicRho 调充满度（<0.5椭圆/0.5抛物/>0.5双曲）；密采样 smooth open poly（store.ts:5926-5939） | 底栏 ρ 滑杆(SketchToolPanel.tsx:127-135)；显示肩点曲率半径 |
| **spline（样条）** | sk_spline | 连续点控制点；闭合→Catmull-Rom 经过点（store.ts:5994, 6363） | 打段长；smooth |
| **bspline（B样条）** | sk_bspline | 连续点控制点；闭合→`sampleBSpline`（逼近，不过点，store.ts:5994） | 同上 |
| **point（草图点）** | sk_point | 单击落 `{circle,r:0,point,construction}`（store.ts:5815-5818）；**工具保持 armed** 可连点 | 可 D 标尺寸 |
| **cline（构造参考线）** | sk_cline | 点位置落水平/竖直长虚线 `skAddConstructionLine`（store.ts:5759, 860）；方向=clineOrient（SketchToolPanel.tsx:193-201） | 做参考/镜像轴，不参与拉伸 |
| **text（草图文字）** | sk_text | `appPrompt` 输入 文字/字号/凸高 → worker 离散字形成 poly 轮廓（store.ts:8751-8768） | 完成后切 select |

**Enter/ESC 语义**：绘制中空 buffer 裸 Enter（折线≥2点）= 收笔（App.tsx:87-90）；ESC 见 §0。

---

## 3. 通用绘图周边

- **构造几何切换**（Fusion X）：`toggleConstruction()`（store.ts:5397-5413，键 **X** / ribbon `sk_constr`）—— 选中 shape ⇄ 虚线参考几何（`construction:true`，可约束可吸附，不参与拉伸/导出，store.ts:54）。无选中则切当前 `sketchShape`。
- **捕捉标记（snap markers）**：几何类型 + 加权优先级（`snapInSketch` store.ts:317-436，A2）。类型 `SnapTypeKey='pt'|'mid'|'center'|'quad'|'x'|'tan'`（store.ts:239），逐类开关存 localStorage（`更多▾`弹层 6 checkbox，Viewport.tsx:5414-5418；`setSnapTypesFlag`）。**加权 d_eff²=d×w²**：端点/pt/center=1.0、mid（边中点▲）=1.25、x（交点✕）=1.35、quad（象限点◈）/tan（切点⌒）=1.5（store.ts:404-408）。半径守卫用真距离 `_snapBd`（≈7 屏幕 px，封顶 7mm，store.ts:230-233）。命中类型写 `_snapKind`（store.ts:420）→ 状态栏 tag（store.ts:6056）。交点吸附 >120 段跳过（O(n²) 护栏，store.ts:381, 397）。**几何捕捉总开关** `geoSnap`（🧲 底栏 Viewport.tsx:5346，`_geoSnap`）；绘制中**按住 Alt** 临时停（`setGeoSnapAlt` store.ts:236；触屏「⏸吸附」Viewport.tsx:5316-5318）。关闭后只剩网格捕捉。
- **hover 高亮（7.4 snapSrc）**：`snapSrc:SnapSrc`（store.ts:867，`{kind:'pt'|'mid'|'center'|'quad'|'x', p, seg?}` store.ts:314）—— 命中源几何（端点回溯所属线段/中点回源段/圆心）→ SketchLayer 高亮令用户知「哪条线/点可拣做 datum」（store.ts:419-434）。select/dimension 工具另有 `skHover`（store.ts:1160, 6061-6069）淡橙高亮 + pointer 游标。
- **欠定/完全定义上色（S103 逐实体）**：`skFreeShapes:Set<number>`（store.ts:1166）= DOF 探针后仍可自由移动的 shape 下标集。上色（SketchLayer.tsx:440-446）：未解/无约束/冲突→原色；已解欠定 shape=蓝 `#1572c4`、完全约束=黑 `#16191d`。探针 `probeFreeShapes` 仅在 DOF>0 且无冲突时跑（store.ts:5483-5488，只读非热路径）。底栏徽章显 `✓完全定义`(绿) / `约束N·DOF k`(蓝) / `⚠冲突`(红)（Viewport.tsx:5301-5305）。
- **网格显示 / 捕捉**：网格显示 = drei `<Grid>` + Palette `skView.grid` 开关（Viewport.tsx:5331）。网格捕捉步长 `snapSize`（`更多▾`弹层 0/1/2/5/10，Viewport.tsx:5410）；Fusion 式 zoom 自适应「好数」步长 `effSnap`（0.1~50，令一格≥8px，store.ts:270-278）。`snapPt` 量化（store.ts:278）。

---

## 4. 尺寸标注

- **尺寸工具流程**（`skClickAt` dimension 分支，store.ts:5000-5083；工具 = **D**）：
  - **边** → `len`（直边长度）/ 弧段 → `rad`（R 半径，Fusion 约定）或 `arclen`（若底栏「⌒弧长尺寸」`dimArcLen` 开，store.ts:5049-5058）。
  - **圆** → `dia`（Ø 直径）；三点弧 rim → `rad`（store.ts:5064-5079）。
  - **点→点**：轴对齐即时 `dist`；否则进「放置阶段」`skPendingPair` → 第 3 击位置决定：两侧=`vdist`(竖直)、上下=`hdist`(水平)、中间/斜=`dist`（store.ts:5008-5017, 5032）。
  - **点→边** → `p2l`（点到边垂直距离，store.ts:5035-5040）。
  - **角度** → `addSkAngleDim()`（store.ts:5153-5164，ribbon `sk_d_angle`）：选 2 条边 → `angle`（度）。
  - `⊕原点`/参考点/参考边可作端点（refedge 固定，不能单独标长度，store.ts:5045）。
- **放尺寸即弹输入**（`placeDim` → `skDimEditReq=conId`，store.ts:5002-5004, 1180）：`SketchDimLayer` 见到即自动开输入框填值（store.ts F3；SketchLayer.tsx:1782-1789），免二次点标签；ESC/留空保留量度值。
- **支持的 dim 类型**（`SkCon` kind:'dim' type，freesolve.ts:194）：`dist / hdist / vdist / len / dia / rad / angle / p2l / arclen`。
- **编辑（点标签）**：`SketchDimLayer`（SketchLayer.tsx:1716-1864）蓝标签点击→开 input，Enter/blur commit → `editSkDim(id,value)`（store.ts:5169-5180）；输入数字自动**解绑 ƒx 参数**、从动转驱动。
- **驱动/参考（从动）尺寸**：**右键标签** → `toggleSkDimDriven`（store.ts:5415-5426；SketchLayer.tsx:1847）；从动=灰底括号显示 `(value)`（SketchLayer.tsx:1266, 1753），只量度不驱动；过约束时新尺寸**自动降级为参考尺寸**（`resolveSk` store.ts:5445-5459，S194 auto-driven fallback）。
- **删除路径**：普通尺寸标签旁 **✕ 仔**一按即删（`removeSkCon`，SketchLayer.tsx:1852-1859，stopPropagation）；**冲突（红色）尺寸 click = 直接移除**（兑现「点击移除」承诺，SketchLayer.tsx:1843, skConflictIds 判定）；约束徽章本体 click=移除（SketchLayer.tsx:1845）。
- **ƒx 参数绑定文法**（标签输入框）：输入参数名 或 `=名` → `bindSkDimParam`（store.ts:4924-4938）；输入公式 `d1*2+5` → `bindSkDimExpr`（store.ts:4940-4964，`evalExpr`）；尺寸有全文档唯一稳定名 `d1/d2…`（`nextDimName`/`maxDimSeq`，store.ts:196-207），可互相引用（S195，链式多 pass 收敛 store.ts:176-192）。标签显示 `ƒ(expr)=值` / `ƒx参数=值`（SketchLayer.tsx:1753）。

---

## 5. 约束

- **约束类型**（`SkConType`，freesolve.ts:191；`addSkCon` store.ts:5100-5113；`CONMAP` store.ts:8746）：`h`(水平) `v`(竖直) `coincident`(重合) `parallel`(平行) `perp`(垂直) `equal`(相等) `tangent`(相切) `fix`(固定) `midpoint`(中点) `concentric`(同心) `collinear`(共线) `symmetric`(对称)。Ribbon CONSTRAINTS 组 glyph/需求见 ribbon.ts:423-434。
- **施加方式**：**先选实体（select 工具，最多 3 个）→ 点约束按钮**。`addSkCon`（store.ts:5100）：非 select/dimension 工具先切 select 并提示；`conApplicable` 校验选择是否满足（不满足显 `SK_CON_REQ[t]`）。对称=2 点/边/圆 + 1 边轴（第 3 选 `c`，freesolve.ts:193）。选择在 `skClickAt`（store.ts:5084-5098）toggle 累积（点回同一个=取消选），撳空**不清**已有选择（防误清）。equal 拒绝弧段+直边混选（store.ts:5105-5111）。
- **自动推断**（非按钮）：H/V 于 `closePolyline` 闭合时按段方向落（dy<0.01→h、dx<0.01→v，store.ts:6367-6376）；重合/平行/垂直/相切/等半径于落形后自动（§2）。
- **徽章显示**：约束 glyph（∥/⊥/＝/◉…）渲染成小徽章（SketchLayer.tsx:1737-1762），同锚多徽章横向分列（pxOff 18px×n 防叠，C4）。尺寸=蓝可编辑标签。底栏状态徽章显 DOF/冲突数（Viewport.tsx:5301-5305）。
- **移除**：徽章 click → `removeSkCon(id)`（store.ts:5165-5168）；`↶撤约束` = `undoSkCon` 删最后一个（store.ts:5428-5433，ribbon `sk_uncon`）。加约束前 skSnap 入 sketchUndo → Ctrl+Z 可撤（store.ts:160-161）。
- **冲突处理（S194）**：`resolveSk`（store.ts:5434-5488）solveFree 返 `conflict` + `conflictIds`；新加的**尺寸**冲突→自动转参考尺寸（driven，几何不动，store.ts:5445-5459）；其他冲突→`skConflictIds` 逐个**红标徽章**（SketchLayer.tsx:1848 红底 `#c9362a` + 光晕），点红徽章即删解开（store.ts:5475-5480）。DOF=0 绿「完全定义」。

---

## 6. 修改工具

Ribbon MODIFY 组（ribbon.ts:397-415）。`onSketchClick` 按工具路由到各 handler（store.ts:5749-5760）。

- **修剪 trim**（`skTrimAt`，store.ts:4817-4855，键 **T**）：点一段几何 → 剪到与其它轮廓/构造线的相交点之间的跨段；无相交=整条删。约束按 shape 索引重映射，引用被删轮廓的约束诚实丢弃（store.ts:4835-4842）。悬停「将删段」红色 ghost（`_cut` 标记 store.ts:59）。闭合轮廓剪完→开放路径。
- **延伸 extend**（`skExtendAt`，store.ts:4897-4923）：只对**开放路径**端段，沿直线方向/原圆延长到最近相交几何；闭合无延伸。
- **打断 break**（`skBreakAt`，store.ts:4857-4895，S179，ribbon `sk_break`）：点曲线一分为二，两段都保留（近相交点吸精确交点）。
- **偏移 offset**（`skOffsetAt` store.ts:3475-3494 / `sizing` 拖柄式 store.ts:846-851）：点轮廓锁定 → 拖鼠标调距离（外+/内−，1mm 步进）或打数字 → 点确定。底栏「⇄反向 / ⇆双向」（SketchToolPanel.tsx:92-100）。不支持开放/样条/椭圆（store.ts:3485）。悬停绿虚线 ghost（`computeSketchToolPreview` store.ts:6053）。
- **镜像 mirror**（`skMirrorAt`/`mirrorPick`，store.ts:3622-3635, 854-856，ribbon `sk_mirrory`）：**Fusion 2 步** —— ①点轮廓拣（可多个，点一个=拣整条相连边）→「✓拣轴线」`mirrorBeginLine` → ②点一条直线边/构造线做镜像轴 → 反射保留原件；完成切 select。另有一键 `mirrorSketch('x'|'y')`（左右/上下轴，store.ts:853）。
- **草图阵列（array）**（`sketchArrayRect`/`sketchArrayCirc`，store.ts:3239-3298；`arrayCfg` store.ts:1142）：底栏面板设**矩形**（列×行+间距）/**环形**（数量+总角度+中心 XY）→「应用阵列」；绿虚线实时预览；有选中只阵列选中的其余不动（Fusion 做法，store.ts:3243-3245）；总数>1000 拒绝。画布点击不落几何（store.ts:5758）。
- **倒角 cfillet/cchamfer（草图单角）**（`skCornerAt`/`sizing`，store.ts:847, 5756，ribbon `sk_filletc`/`sk_chamferc`）：点近一个直角顶点锁定 → 拖鼠标调 R/回缩 或打数字 → 确定；或底栏「全部角一次过」`filletSketchCorners`/`chamferSketchCorners`（store.ts:840-841, SketchToolPanel.tsx:107）。
- **移动/复制**（`sk_move`，store.ts:8773-8804）：`appPrompt` 输入 dx,dy[,角度绕形心][,副本数] → 平移+旋转，可出 N 份（verts/bulges/arc/open 全感知）。
- **草图布尔**（`skBoolShapes`，store.ts:4773-4810，ribbon `sk_union`/`sk_subtract`）：`skBoolPending` 点两个闭合轮廓 → ∪合并 / ∖剪走（A−B，先点=保留件），真圆弧保持，挖穿出环。
- **删除 delete**（`skDeleteSel`，store.ts:5337-5395，键 **Del**）：单选 poly 顶点→删顶点（前后段并直线，≤3 顶点拒绝）；选中边/圆→删整轮廓，约束索引重映射+引用被删者一并移除；原点/参考几何不可删。
- **拖拽移动语义**（`skDrag*`，store.ts:5266-5334，select 工具）：pointerdown 命中→`skDragStart` 返 true 冻结 OrbitControls。**拖点**（顶点/圆心，圆周命中=拖圆心带抓取偏移 grab，store.ts:5277-5290）；**拖整条边/弧**（S197，记两端原位，两端同步 pin，store.ts:5293-5299）。拖拽中 `solveFree` 实时求解（~35fps 节流 store.ts:5309），欠约束跟手、被 fix/尺寸锚死→conflict 诚实回弹（store.ts:5320）。移动>0.8mm 才当拖（否则当 click，store.ts:5306, 5330）。

---

## 7. 选择模型

- **点选（click）**：select 工具 `skClickAt`（store.ts:5084-5098）`skHitTest`（真屏幕 14px 半径 `pickTol` store.ts:265）命中 点/边/圆/⊕原点/参考点/参考边（`SkRef` freesolve.ts:71-77）。
- **多选**：toggle 累积**最多 3 个**（第 3 = 对称轴，store.ts:5096 `while(sel.length>3)sel.shift()`）；点回同一个=取消选（store.ts:5095）。撳空**不清**已有选择（只 ESC 清，store.ts:5089-5091, 3234-3235）。
- **可选对象**：草图 点(顶点/圆心) / 边(段) / 圆 / 原点 / 投影参考点·参考边（refpt/refedge，freesolve.ts:76-77）。整形选择 = 选其一 edge/circle 即代表该 shape（构造切换/删除按 `r.shape`，store.ts:5399, 5372）。
- **拖动移动**：见 §6 `skDrag`（拖点 / 拖整条边/弧 / 圆周拖圆心）。
- **框选（marquee，window/crossing）**：**草图实体无框选**。`navTool:'select'` 的框选（Viewport.tsx:3150-3192，GM-W5 5.3）—— 左→右=窗选(全包，蓝实线) / 右→左=跨选(相触，绿虚线)、Shift 追加 —— **只作用于 model 模式的组件（`checkedComps`）**，非草图 点/边/圆。草图内单指=平移、无橡皮筋框选草图几何。→ 对 Fusion「窗选/交叉选草图实体」= **无此功能**。

---

## 8. 约束草图 csketch（独立子系统，仅简述）

- 完全独立的 zustand store（`sketch/csketch.ts`，`create()`），与自由草图**平行、互不共享状态**；UI = `components/CSketch.tsx`（SVG 模态 overlay），经 `openCSketch()`（store.ts:13832，`csketchOpen:true`）打开，`sk_csketch`/`csketch` 命令（store.ts:8869）。定位为「要精确参数化时用」，自由草图定位「想快速画用」（store.ts:13832 提示）。
- 自有模型：`CPoint/CLine/CCircle`（csketch.ts:8-10）、工具 `CTool='select'|'line'|'rect'|'circle'|'polygon'|'trim'|'extend'|'break'`（csketch.ts:11）、约束 `ConstraintKind`（csketch.ts:13-16，比自由草图**更全**：含 `distance/radius/angle/point_on_line/pldist/coordx/coordy/cdist/collinear/…`）。自有 undo/redo 栈（past/future，csketch.ts:45-49）、自有 DOF 逐点诊断上色（`dofDiag`，0=黑完全定义/>0=蓝欠定，csketch.ts:41-44）、`solveSketch`（solver.ts）。
- 提交回主文档：`commitCProfile`/`commitCProfiles`（store.ts:13834-13887，13844）→ 关闭 overlay、轮廓拉伸成实体、几何级归档草图源可重开（约束在 csketch finishProfiles 平铺）。

---

## 执行摘要（webcad 草图交互模型，15 行）

1. **两个独立草图器**：主力「自由草图」（本文 §0-7，鼠标点即画、内嵌 planegcs 约束）+ 精确「约束草图 csketch」（§8，SVG 模态、约束优先）。
2. **进入 = 两段式**：创建草图→`pickplane` 拾平面/面/datum→`sketch`；相机自动正投影 + 正对平面 + 按内容取景（bbox/1.6×span）。
3. **草图内轨道旋转恒锁**，滚轮=zoom-to-cursor（打光标命中点，Shift 精细），中/右键=平移，触屏单指=平移。
4. **~30 个绘图工具**（rect/crect/rect3、circle/circle3/2t/3t、polyline/spline/bspline、arc/arcc/earc/conic、ellipse、slot/arcslot、rrect、polygon、point、cline、text），槽/圆角矩/椭圆/弧均为真 B-rep 弧边。
5. **工具在 Ribbon 情境 tab + 右键放射菜单**，非底栏；底栏是选择/尺寸/面/捕捉/Palette/拉伸；浮动面板只显当前工具参数。
6. **打字精确尺寸贯穿**：未落点打起点坐标(X Tab Y)，落点后打尺寸(W Tab H / 半径 / 扫角…)，多阶段逐阶段标签。
7. **工具完成后保持 armed**（连续画），开新形自动 bank 上一形成 profile。
8. **落形即自动约束推断**：H/V（闭合时）、重合（精确吸附点）、平行/垂直/相切/等半径（保守 ≤6/批，冲突自动回滚）。
9. **加权几何捕捉**：端点/中点/圆心/象限/交点/切点 6 类可逐类开关，d_eff²=d×w²，~7px 半径，Alt 临停，命中源几何 hover 高亮。
10. **约束**：12 型（h/v/coincident/parallel/perp/equal/tangent/fix/midpoint/concentric/collinear/symmetric），选实体(≤3)→按钮施加，徽章可点删。
11. **尺寸**：9 型（dist/hdist/vdist/len/dia/rad/angle/p2l/arclen），放置即弹输入框，标签可改值/右键切驱动⇄参考/✕删除，支持 ƒx 参数与公式(d1*2)绑定。
12. **过约束自动降级**：新尺寸冲突自动转参考尺寸；其他冲突红标徽章，点红即删解开（S194）。
13. **DOF 逐实体上色**：完全约束=黑、欠定=蓝、冲突/未解=原色（探针只读）。
14. **修改工具齐全**：trim/extend/break/offset/mirror(2步)/array(矩+环)/单角圆角倒角/move-copy/草图布尔∪∖，约束索引均重映射。
15. **选择 = 单击 toggle（≤3）+ 拖点/拖边/圆周拖**；**草图实体无框选**（window/crossing 框选只作用于 model 组件）。

**返回文件**：`C:\ClaudeCode\webcad\_webcad_sketch_behavior.md`
