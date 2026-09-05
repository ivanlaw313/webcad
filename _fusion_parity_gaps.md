# webcad ↔ Fusion 360 草图行为 · Parity Gap 清单

> 来源：`_fusion_sketch_spec.md`（真 Fusion 360 亲测 = ground truth）↔ `_webcad_sketch_behavior.md`（webcad 代码级盘点，含 file:line）。
> 本文件 = 逐点差异 + 落地要点 + 波次计划。只列**有差异**嘅点；一致嘅收喺尾段「D 已一致」。
> 类型：A=直接跟(UI/交互,无内核险) · B=跟但改状态机(中等) · C=内核/架构受限(要窄版或诚实豁免) · D=已一致 · E=Fusion spec 系推断未实证(先补证)。
> 波次：W1=核心手感(画图/打字/吸附/视图) · W2=尺寸+约束 · W3=修改工具+选择 · W4=打磨。

---

## 一、执行摘要（畀老板睇 · 广东话）

webcad 个草图内核其实好扎实——真圆弧边、planecgs 约束、DOF 上色、参数化尺寸(ƒx 公式)样样有，好多地方仲**多过** Fusion（bspline、圆角矩、圆弧槽、草图布尔、约束草图）。但同真 Fusion 摆埋一齐逐格试，**最伤手感嘅係五个位**：

1. **草图入面唔畀框选**——你想一嘢圈起十条线嚟删/移，做唔到；而家净係逐个㩒，仲要死限**最多 3 个**（因为第 3 个畀咗对称轴用）。呢个係全清单最高价值嘅窿。
2. **草图入面唔畀 orbit 打斜睇，又冇「正对」掣一㩒返正**——Fusion 畀你打斜望住画，画完㩒 Look At 弹返正面；webcad 恒锁死正面（其实同「入草图自动正投影」呢个好决定唔冲突，得罪只係时机同自由度，可以拆开跟）。
3. **打字尺寸未够顺**——画直线冇「长度＋角度」两格＋黄色锁仔＋Tab 跳格；由端点拖出相切弧要㩒 `A` 掣，唔係 Fusion 嗰种「按住端点一拖就变弧」嘅手势。
4. **Move/复制係打字对话框**（打 dx,dy,角度,份数），冇 Fusion 嗰个可以喺画布上拖嘅 gizmo（箭头＋旋转弧＋Create Copy 剔）。
5. **过约束係静静鸡自动转参考尺寸＋出个 toast**，Fusion 会**跳个对话框**问你「要唔要转做 Driven？」；另外 Fusion 嘅 **Fixed 係绿色第三态**、**构造线係琥珀虚线**，webcad 呢两个色冇跟到（而家构造係灰虚线、Fixed 冇专色）。

**邮轮式波次计划**：W1 净整核心手感（orbit＋正对掣、直线角度格＋黄锁、端点拖弧、常驻完成掣）；W2 补尺寸同约束（Aligned/HV 放置、过约束模态、R↔Ø、绿 Fixed、AutoConstrain、tool-first 施约束、琥珀构造）；W3 攻修改＋选择（草图框选橙/黄、拆 3 个上限、双击链选、Trim 拖扫、Move gizmo、圆周拖改半径、右键三情境菜单）；W4 打磨（S 快捷面板、缺失快捷键、平面 hover 高亮、Slot 变体、Text 对话框）。

**要诚实讲跟唔到（或要窄版）嘅**：Offset 嘅**参数化关联**（改原线偏移线跟住郁）——webcad offset 係一次性几何，做关联要动内核／时间轴；**Slice 剖切**同 **3D Sketch 离面画**——webcad 草图係平面几何，要动渲染同架构；**Curvature(G2) 约束 / Blend Curve**——要 solver 加曲率支持。呢啲建议做窄版或明明白白标豁免，唔好硬砌。

---

## 二、类型 / 波次 统计

| 类型 | 数目 | | 波次 | 数目 |
|---|---|---|---|---|
| A 直接跟 | 26 | | W1 核心手感 | 10 |
| B 改状态机 | 21 | | W2 尺寸+约束 | 9 |
| C 内核受限 | 5 | | W3 修改+选择 | 10 |
| D 已一致 | 10 | | W4 打磨 | 24 |
| E 待补证 | 1 | | （D 记录不排波） | 10 |
| **可动手小计** | **53** | | | |

## 三、Top-10 手感差距（照价值排）

1. `#44` 草图内**无框选**（window 橙／crossing 黄）——拣多个物件冇得圈。
2. `#8`+`#9` 草图内**唔可 orbit**、又冇 **Look At 返正**掣。
3. `#45` 通用选择**死限 3 个**（同对称轴拾取撞埋一齐）。
4. `#10`+`#11`+`#12` 直线**冇角度格**、无**黄锁**、DOF 格未齐显。
5. `#13` **端点拖出切弧**手势（webcad 要㩒 A 键）。
6. `#39` **Move/Copy gizmo**（webcad 係打字对话框）。
7. `#30` **过约束模态对话**（webcad 系静默自动转参考）。
8. `#26` **Fixed 绿色第三态**（webcad 无专色）。
9. `#40` **圆周拖 = 改半径**（webcad 拖圆周 = 移圆心）。
10. `#38` **Trim 洋红 hover + 拖扫多删**（webcad 红 ghost、单击、无拖扫）。

---

## 四、逐点 Gap 表

> anchor 皆指 webcad 源码。落地要点只对 A/B 项写（C/D/E 写豁免/记录说明）。

### §0 进入 / 退出草图

| # | § | Fusion 行为（一句） | webcad 现况（一句 + anchor） | 类型 | 波次 | 落地要点 |
|---|---|---|---|---|---|---|
| 1 | 0 | 拣面后相机**带动画**平滑转到正对平面法向 | look-at 取景由 CameraRig 做（SketchLayer.tsx:193-282），未证实系平滑 lerp 定瞬跳 | A | W4 | CameraRig 焦点切换加 easing／lerp 过渡（若现为瞬跳） |
| 2 | 0 | pickplane 时 hover 平面变灰棕填充+绿边+提示"Select a plane or planar face" | pickplane 只有状态栏文字提示，无候选面 hover 高亮（startSketch store.ts:5493-5500） | A | W4 | pickplane 渲染候选原点面/实体面 hover 高亮材质（Viewport pickplane 分支） |
| 3 | 0 | 顶栏**常驻绿色 FINISH SKETCH** 大掣 | 无专门大掣，靠 ESC / 右键「✓完成草图」（finishSketch store.ts:5508-5516；Viewport.tsx:3549） | A | **W1** | .sketch-bar（Viewport.tsx:5290）加常驻「✓完成草图」按钮直呼 finishSketch() |
| 4 | 0 | palette 有 **Points 可见性**复选（默认开） | Palette 只有 填充/标注/构造/网格（skView Viewport.tsx:5331） | A | W4 | skView 加 points 显示开关 |
| 5 | 0 | palette **Dimensions 与 Constraints 两个独立**开关 | 标注开关未把约束徽章分离独立 gate | A | W4 | skView 加 constraints 徽章可见开关（SketchLayer.tsx:1737 gate） |
| 6 | 0 | palette **Slice** 剖切遮挡几何只留切面 | 无 slice（有 👓 see-thru 透视，非剖切） | C | W4 | 豁免/窄版：真剖切要动渲染架构 |
| 7 | 0 | palette **3D Sketch** 允许离平面 Z 向画 | 草图恒平面（sketchArb 平面基 store.ts:887） | C | W4 | 豁免：离面画要动草图架构 |

### §1 视图控制（草图内）

| # | § | Fusion 行为 | webcad 现况 + anchor | 类型 | 波次 | 落地要点 |
|---|---|---|---|---|---|---|
| 8 | 1 | 草图内**可自由 orbit / ViewCube 倾斜睇**（唔退草图），可斜住画 | `enableRotate={mode!=='sketch'...}`（Viewport.tsx:3520）**恒锁不可转** | B | **W1** | 放宽 enableRotate 于草图允许（可挂 modifier 或导航掣）；保持 ortho 唔冲突（auto-ortho 系投影模式，同 orbit 正交） |
| 9 | 1 | palette **蓝 Look At 掣**一键相机正对平面法向、原点回中 | 靠 auto-ortho + 恒锁维持正面；pan 走咗**无一键返正**掣 | A | **W1** | sketch-bar 加「⊙正对」掣重设 CameraRig 焦点（sketchFocus/skGeoFocus store.ts:145-156） |

### §2 逐个创建工具

| # | § | Fusion 行为 | webcad 现况 + anchor | 类型 | 波次 | 落地要点 |
|---|---|---|---|---|---|---|
| 10 | 2 | Line 落点后出**长度＋角度**两格，Tab 循环、各自锁 | polyline 打字 = **段长单格**（store.ts:6221-6226），方向靠 0/45/90 吸附，**无角度格** | B | **W1** | sketchTypeKey（store.ts:6136）draw 态 polyline 增角度字段 + Tab 分支（store.ts:6165） |
| 11 | 2 | 打完值旁出**黄挂锁 🔒 glyph** = 已锁定/驱动 | draw 态 dimBuf **无锁定视觉反馈** | A | **W1** | draw HUD（SketchLayer 尺寸层）typed 字段旁绘锁 glyph |
| 12 | 2 | 一次显示该段**所有 DOF 格**（rect 显 W+H），激活格蓝底 | 逐字段 dimBuf，Tab 切 W/H（store.ts:6165），未确认同屏齐显所有格 | A | **W1** | draw HUD 同屏渲染全部 dimField + 激活高亮 |
| 13 | 2 | Line 链中由上端点**按住拖 = 即切相切弧**（半径+弧角两格），释放退回直线 | 靠㩒 **A 键**入 polyArcMode（store.ts:5998-6008），**非拖手势** | B | **W1** | polyline pointerdown 于上端点 + 拖动阈值 → 自动进 polyArcMode（Viewport 草图 pointer） |
| 14 | 2 | 线段长+角**都打字锁**后 Enter = 落段并**结束整条链**；纯点击则续链 | Enter 提交 typed 值（App.tsx:87-90），两值全锁后是否结束链未明 | B | **W1** | sketchTypeKey commit 分支：全字段 typed 则收笔 finishOpenPolyline |
| 15 | 2 | Circle 有 **2-Point（直径两端）**变体 | 有 circle(心)/circle3/2t/3t，**缺 2 点圆**（onSketchClick 圆族 store.ts:5746+） | A | **W1** | 圆族加 sk_circle2p（两点定直径） |
| 16 | 2 | 顶层 **Midpoint Line**（由中点向两端对称） | 无 | A | W4 | 加工具或 polyline 变体（中点锚对称双向） |
| 17 | 2 | Polygon 有 **Edge**变体（点一边两端定边长朝向） | polygon 只有内切/外接（polyInscribed store.ts:6183） | A | W4 | polygon 分支加 edge 模式 |
| 18 | 2 | Slot **5 变体**（center-center/overall/center-point/两弧变体） | 只有 slot(心心)+arcslot（store.ts:5850-5891） | B | W4 | slot 族加 overall/center-point 起点模式 |
| 19 | 2 | **Tangent Arc 独立工具**：点已有曲线端点 → G1 相切引弧 | 相切弧只喺 polyline **A submode 内**，无独立由任意曲线端点起 | B | W2 | arc 工具加 tangent 起点模式，读端点切向（arc store.ts:5959） |
| 20 | 2 | **Project/Include（P）**：拣实体边投入草图成**关联曲线** | 入草图自动算投影参考几何（refGeo/refedge，可选可约束 freesolve.ts:77），**无交互「拣边投影」**命令 | C | W4 | 窄版：加 sk_project 拣边→refedge；关联实时更新受内核限，先做静态投影 |

### §3 通用绘图周边

| # | § | Fusion 行为 | webcad 现况 + anchor | 类型 | 波次 | 落地要点 |
|---|---|---|---|---|---|---|
| 21 | 3 | 构造几何 = **橙/琥珀虚线** | 构造 = **灰虚线** `#8a97a2`（SketchLayer.tsx:457），非琥珀 | A | W2 | 构造分支改琥珀色虚线材质（SketchLayer.tsx:457） |
| 22 | 3 | palette **Linetype 预切换**：令后续绘制即为构造/中心线，折线中途可切 | X 系对已选/当前 shape **事后转**（toggleConstruction store.ts:5397），无「下一笔画成构造」预开关 | B | W4 | 加 draw-as-construction 预开关，落形时带 construction 标志（store.ts:6014 bank） |
| 23 | 3 | **Centerline** 独立线型（旋转轴/对称参照） | cline = 构造线（skAddConstructionLine store.ts:860），无专门 centerline 语义 | A | W4 | cline 加 centerline 标记位 |
| 24 | 3 | 拖线时中点上方**即现蓝 H/V inference glyph 预览**，点即施加 | 有方向吸附 0/45/90（store.ts:437-460）+ 落形后 applyDrawInference，拖动中 glyph 预览未明 | A | **W1** | draw preview 层加 inference glyph（SketchLayer preview 区） |
| 25 | 3 | 底栏**实时光标 Sketch Point X/Y/Z mm** | 底栏显 _snapKind tag（store.ts:6056），实时坐标未明 | A | W4 | status 补 snapPt 坐标显示 |
| 26 | 3 | **Fixed = 绿色**第三态（≠ 黑完全约束） | 只有蓝(欠定)/黑(完全)（SketchLayer.tsx:442-446），fix **无绿色态** | B | W2 | 着色分支加 fixed shape → 绿；建 fixedShapes 集（freesolve fix 约束成员标记） |

### §4 尺寸标注

| # | § | Fusion 行为 | webcad 现况 + anchor | 类型 | 波次 | 落地要点 |
|---|---|---|---|---|---|---|
| 27 | 4 | 单线**由放置方向定 Aligned/H/V**（垂直偏置=真长；横/竖=投影） | 单线 → 固定 `len` 真长（store.ts:5049），**无由放置切 H/V 投影** | B | W2 | dimension 单线加放置方向判定（类比 skPendingPair store.ts:5008）→ len/hdist/vdist |
| 28 | 4 | 选 **2 平行边 → Min Distance gap** 尺寸 | 选 2 边 → **angle**（addSkAngleDim store.ts:5153），平行对无 gap 距离 | B | W2 | dimension 2 边分支：若平行 → 加 dist（线线垂距） |
| 29 | 4 | **R↔Ø 切换**（右键弧/圆尺寸 Radius/Diameter） | arc→rad、circle→dia 类型固定；有 arclen 切换但**无 R↔Ø** | A | W2 | dim 标签右键加 R↔Ø（切 SkCon.type store.ts:5169）。注：Fusion 精确路径系推断 |
| 30 | 4 | 过约束弹**模态对话**「would over-constrain / Create Driven? [Create Driven]/[Cancel]」畀用户抉择 | 新尺寸冲突**自动**降级参考尺寸 + toast（S194 resolveSk store.ts:5445-5459），无抉择 | B | W2 | resolveSk 冲突分支改弹 appConfirm 抉择再决；保留 auto 作 fallback/选项。★webcad 刻意用 auto 求顺，跟 Fusion 要权衡 |
| 31 | 4 | 拖尺寸标签**重定位**，leader 自动折转 | 标签 click=编辑、✕=删、右键=驱动切换，**无拖动重定位**（SketchLayer.tsx:1716-1864） | A | W4 | dim 标签加 pointer drag → 存 label offset |
| 32 | 4 | inline 尺寸框 **⋮ 显参数名 d9** | 标签显 ƒx参数=值（SketchLayer.tsx:1753），输入框内**无 ⋮ 菜单** | A | W4 | dim input 加 ⋮ 展示 nextDimName（store.ts:196） |

### §5 约束

| # | § | Fusion 行为 | webcad 现况 + anchor | 类型 | 波次 | 落地要点 |
|---|---|---|---|---|---|---|
| 33 | 5 | **AutoConstrain**（wand）对选中几何一次推断多约束 | 只有绘制时自动推断，**无独立「对选中自动约束」**命令（CONMAP store.ts:8746 无） | B | W2 | 加 sk_autoconstrain：对选中集跑 applyDrawInference/applyCoincidentInference（store.ts:5538/5519） |
| 34 | 5 | **tool-first**：先点约束掣再拣对象（提示 Select…，途中可换约束型） | 只支持 **pre-select → 掣**（addSkCon 非 select 工具先切 select 提示 store.ts:5100-5113） | B | W2 | addSkCon 支持无选择时进「约束拾取态」逐点收集 |
| 35 | 5 | 单击约束 glyph = **选中它**（状态栏报名 + partner 高亮）；删靠 Delete | 徽章 click **即 removeSkCon**（store.ts:5165-5168；SketchLayer.tsx:1737） | B | W3 | glyph click 改 select + partner 高亮；Delete 先删 |
| 36 | 5 | **Curvature(G2)** 约束 | 12 型无 curvature（有 tangent G1）（SkConType freesolve.ts:191） | C | W4 | 豁免/窄版：solver 需 G2 支持 |
| 37 | 5 | Polygon 约束、**H/V 合一**自动判向命令 | h、v 分开；无 polygon 约束 | A | W4 | 加 hv 合一命令（按段方向选 h/v）；polygon 约束低优 |

### §6 修改工具

| # | § | Fusion 行为 | webcad 现况 + anchor | 类型 | 波次 | 落地要点 |
|---|---|---|---|---|---|---|
| 38 | 6 | Trim hover **洋红 doomed 段**，可**按住拖扫一笔多删** | skTrimAt 点一段（store.ts:4817-4855），hover **红** ghost，**无拖扫** | B | W3 | Trim pointer 加 drag 采样沿途段批量 skTrimAt；hover 色改洋红 |
| 39 | 6 | Move/Copy = 画布 **gizmo**（X/Y 箭头+旋转弧+pivot）+ 对话框 Move Type / **Create Copy** 勾 | sk_move = **appPrompt** 打 dx,dy,角度,副本数（store.ts:8773-8804），无 gizmo | B | W3 | sk_move 改交互 gizmo 层（类比 array 预览）+ Create Copy 开关 |
| 40 | 6 | 拖**圆周 rim = 改半径**（缩放）；拖圆心 = 平移 | 圆周命中 = **拖圆心**（带 grab 偏移）（store.ts:5277-5290），rim 唔改半径 | B | W3 | skDragStart：命中距圆心≈r 时改半径而非移心（store.ts:5266 分支） |
| 41 | 6 | 拖**完全约束(黑)/固定(绿)**几何 = **纹丝不动只选中** | 拖 fix/尺寸锚死件会橡皮筋后 **conflict 回弹**（store.ts:5320） | B | W3 | skDragStart：命中 shape ∉ skFreeShapes 则唔郁只 select |
| 42 | 6 | MODIFY 有 **Sketch Scale** | 无 | A | W4 | 加 sk_scale（顶点乘系数绕基点） |
| 43 | 6 | **Blend Curve**（曲率连续过渡曲线） | 无 | C | W4 | 豁免：需曲率连续几何生成 |

### §7 选择模型

| # | § | Fusion 行为 | webcad 现况 + anchor | 类型 | 波次 | 落地要点 |
|---|---|---|---|---|---|---|
| 44 | 7 | **草图内框选**：左→右 window(橙,全包) / 右→左 crossing(黄,相触) 选草图实体 | 草图实体**无框选**；marquee 只作用 model 组件（Viewport.tsx:3150-3192） | B | **W3** | 草图模式加橡皮筋框，命中 shapes（扩 skHitTest 批量 store.ts:5084），L→R 全包/R→L 相触。★最高价值 |
| 45 | 7 | 多选**无上限** | toggle 累积**最多 3**（`while(sel.length>3)sel.shift()` store.ts:5096），因第 3 = 对称轴 | B | **W3** | 分离「约束参数拾取(≤3)」同「通用选择集(无限)」；delete/move/框选 用后者 |
| 46 | 7 | **双击一边 = 链选整条闭链** | 无双击链选（select 单击 toggle store.ts:5084-5098） | B | W3 | skClickAt 加 dblclick → 选 shape 所有连接边 |
| 47 | 7 | 点真空白 = **清选择** | 撳空**不清**（只 ESC 清，刻意防误清 store.ts:5089-5091） | A | W3 | 可选设定「空点清选」，区分 profile 填充内=空 vs 真空白。★webcad 刻意保留，跟要出选项 |
| 48 | 7 | 右键**三情境 marking menu**（空白/实体/尺寸 线性列表各异，共用径向轮盘） | 有绘制中放射菜单（Viewport.tsx:3543-3566）；实体/尺寸选中态**情境列表未齐** | A | W3 | 右键按 selection 类型切列表（共用扇区 + 情境列表） |
| 49 | 7 | 命中优先级 **曲线 > 填充 > 点**（操作员实战：圆周易被其上点抢） | skHitTest 14px + 加权 snap（pt/center 同权 1.0 store.ts:404），曲线 vs 点优先未强保证 | A | W3 | skHitTest 排序令 edge/circle 曲线优先于 point；填充唔拦选（store.ts:265/5084） |

### §8 快捷键 / S 面板

| # | § | Fusion 行为 | webcad 现况 + anchor | 类型 | 波次 | 落地要点 |
|---|---|---|---|---|---|---|
| 50 | 8 | **S = Sketch Shortcuts 面板**（钉命令图标 + 搜索框） | 无（S 未绑，Shift+S = 创建草图 App.tsx:176） | A | W4 | S 键弹命令搜索面板（runCommand TOOLMAP store.ts:8734） |
| 51 | 8 | 快捷键 **O=Offset M=Move P=Project E=Extrude V=Hide** | 只 L/R/C/A/D/X/T/Shift+S（App.tsx:174-197） | A | W4 | App.tsx switch 补 O/M/P/E/V |
| 52 | 8 | Text = **富对话框**（Type/字体/字高/粗斜/对齐/沿路径） | text = **appPrompt** 打 文字/字号/凸高（store.ts:8751-8768） | A | W4 | text 改浮动多字段面板。注：Fusion 放置后完整字段系推断 |
| 53 | 6/2 | Rect/Circular Pattern **完整展开字段**（Quantity/Spacing/Extent/Angle） | array 有 列×行+间距 / 数量+总角+中心（arrayCfg store.ts:1142；sketchArrayRect/Circ store.ts:3239） | E | W4 | 先补证 Fusion 展开字段（distance-type Spacing vs Extent）再对齐；机制已在，只对齐字段语义 |

---

## 五、D 已一致（记录，唔使做）

| # | § | 点 | webcad anchor（证一致） |
|---|---|---|---|
| D1 | 1 | **光标轴心缩放** + Shift 精细 | WheelZoom zoom-to-cursor（Viewport.tsx:2281-2329）；OrbitControls zoomToCursor（:3516） |
| D2 | 0 | **入草图自动正投影 + 时机（拣面后先转）** | store 订阅 auto-ortho（store.ts:15915-15925）+ chooseSketchPlane look-at；pickplane 阶段唔郁相机 = 同 Fusion 时机一致 |
| D3 | 2 | **工具完成后保持 armed 连续画** | two-click/多阶段完成后 sketchTool 不变（store.ts:6014-6018），开新形 bank 上一形 |
| D4 | 4 | **驱动↔从动 right-click 切换** | toggleSkDimDriven 右键标签（store.ts:5415-5426；SketchLayer.tsx:1847） |
| D5 | 4 | **万能 D 按选择推断尺寸类型** | skClickAt dimension 分支按对象类型分流（store.ts:5000-5083） |
| D6 | 2/5 | **落形自动约束推断**（重合/平行/垂直/相切/等半径，保守≤6 冲突回滚） | applyCoincidentInference（store.ts:5519）+ applyDrawInference（store.ts:5538-5605） |
| D7 | 3 | **加权几何捕捉 6 类 + Alt 临停**（比 Fusion 更全） | snapInSketch 加权 d_eff²（store.ts:317-436）；Alt 临停 setGeoSnapAlt（store.ts:236） |
| D8 | 3 | **DOF 上色 蓝欠定 / 黑完全**（缺绿 Fixed 见 #26） | geoColor/skFreeShapes（SketchLayer.tsx:440-446） |
| D9 | 6/7 | **Del 删除 + 约束索引重映射** | skDeleteSel（store.ts:5337-5395）；trim/删除约束重映射 |
| D10 | 4 | **放尺寸即弹输入 + ƒx 参数/公式绑定**（超 Fusion inline） | placeDim→skDimEditReq（store.ts:5002）；bindSkDimParam/Expr（store.ts:4924-4964） |

---

## 六、波次执行清单（照序落地）

- **W1 核心手感（10 项）**：`#3` 完成掣 · `#8` 草图 orbit · `#9` Look At 掣 · `#10` 直线角度格 · `#11` 黄锁 glyph · `#12` 全 DOF 格齐显 · `#13` 端点拖弧手势 · `#14` 全锁 Enter 结束链 · `#15` 2 点圆 · `#24` 拖动 inference glyph。
- **W2 尺寸+约束（9 项）**：`#19` Tangent Arc 独立 · `#21` 构造琥珀 · `#26` 绿 Fixed · `#27` Aligned/HV 放置 · `#28` 平行线 gap · `#29` R↔Ø · `#30` 过约束模态 · `#33` AutoConstrain · `#34` tool-first 施约束。
- **W3 修改+选择（10 项）**：`#35` glyph 点选非删 · `#38` Trim 拖扫洋红 · `#39` Move gizmo · `#40` 圆周拖改半径 · `#41` 全约束拒郁 · `#44` 草图框选 · `#45` 拆 3 上限 · `#46` 双击链选 · `#48` 右键三情境 · `#49` 命中优先级。
- **W4 打磨（24 项）**：`#1 #2 #4 #5 #6 #7 #16 #17 #18 #20 #22 #23 #25 #31 #32 #36 #37 #42 #43 #47 #50 #51 #52 #53`。
- **诚实豁免/窄版（C 类 5 项）**：`#6` Slice · `#7` 3D Sketch · `#20` 关联投影 · `#36` Curvature/`#43` Blend Curve。

---

## 七、GM-FP4 收官状态（W4 打磨 24 项 + 5 C 类 + 1 E 类）

> 2026-07-11 落地。`tsc --noEmit` = 0；9 大草图套件（coincident/inferconstraints/freesolve-l2/freesolve-fp2/skselect-fp3/csketch-dof/sketchops/sketchtrim/typedgeom-fp1）全绿 + 新增 `tests/fpwave4.test.mjs`（18/18）。live 冷启动无 console 错、store 驱动逐项验过。

| # | 项 | 状态 | 落地位置（file · anchor） |
|---|---|---|---|
| 1 | LookAt / 入草图相机动画 | ✅ DONE | `SketchLayer.tsx` CameraRig：eased tween（`_camTween` + useFrame lerp，340ms、`_easeInOut`）；只喺离散重取景（`_lastOrientKey` 变）先 tween、画图唔郁；用户 pointerdown/wheel 即中断；goal 即时套（headless 终态正确）+ setTimeout 兜底还原 controls.enabled |
| 2 | pickplane 候选面 hover 高亮 | ✅ 已在（GM-W7 7.1） | `Viewport.tsx` DatumPlane（原点面 hover 填充 0.16→0.5 + 十字光标 + 加粗描边）+ PickPlaneQuad（实体面/datum） |
| 4 | palette Points 可见性 | ✅ DONE | `store.ts` skView.points；`SketchLayer.tsx` drawShape 点 gate；`Viewport.tsx` 👁 palette「点」+ 右键菜单 tgpoints |
| 5 | Dimensions/Constraints 独立开关 | ✅ DONE | `store.ts` skView.cons；`SketchLayer.tsx` SketchDimLayer 尺寸 gate=annot、徽章 gate=cons；`Viewport.tsx` 👁「尺寸/约束」分列 + 右键 tgcons |
| 6 | Slice 剖切 | ⛔ 豁免（见§八） | 窄版替代：👓 see-thru（透视）已在 |
| 7 | 3D Sketch 离面画 | ⛔ 豁免（见§八） | — |
| 16 | Midpoint Line | ✅ DONE | `store.ts` SketchTool 'mline' + onSketchClick（B=2M−A）+ 打字全长；`ribbon.ts` sk_mline；`SketchLayer.tsx` live 预览 |
| 17 | Polygon Edge 变体 | ✅ DONE | `store.ts` polyEdgeMode + onSketchClick（正 N 边形由边生长，左转 2π/N）；`SketchToolPanel.tsx` 边/中心切换 |
| 18 | Slot 5 变体 | ✅ DONE（3 直槽变体 cc/overall/centerpt + 2 弧槽已在） | `store.ts` slotMode + slot branch；`SketchToolPanel.tsx` 心心/总长/中心点 |
| 20 | Project/Include 拣边投影 | ✅ 窄版 DONE | `store.ts` sk_project=projectRefToSketch（全投影）+ projPickMode（逐条投影→refedge）；关联实时更新受内核限（见§八注） |
| 22 | draw-as-construction 预开关 | ✅ DONE | `store.ts` drawConstruction + onSketchClick 落形带 construction；`SketchToolPanel.tsx` 「⚟画成构造几何」 |
| 23 | Centerline 独立线型 | ✅ DONE | `store.ts` clineCenterline + centerline 标记；`SketchLayer.tsx` 长-短点划线；`SketchToolPanel.tsx` 中心线剔 |
| 25 | 底栏实时光标坐标 | ✅ 已在 | `Viewport.tsx` sketch-bar `⌖ X, Y`（sketchPreview，绘制/悬停实时 mm） |
| 31 | 尺寸标签拖动重定位 | ✅ DONE | `store.ts` skDimLabelOff（按 conId 存屏幕偏移，唔改 SkCon 内核）；`SketchLayer.tsx` onLabelDown 拖动 + pxOff live 跟随、leader 自动跟 |
| 32 | inline 尺寸 ⋮ 参数名 | ✅ DONE | `SketchLayer.tsx` 编辑框旁 ⋮d# chip（显 c.name，提示可公式引用） |
| 36 | Curvature(G2) 约束 | ⛔ 豁免（见§八） | — |
| 37 | H/V 合一命令 | ✅ DONE | `store.ts` addSkConHV（按边方向 \|dy\|≤\|dx\| 判 h/v，逐条）；`ribbon.ts` sk_c_hv |
| 42 | Sketch Scale | ✅ DONE | `store.ts` skScalePrompt（绕形心 ×k，圆/椭圆半径同步）；`ribbon.ts` sk_scale |
| 43 | Blend Curve | ⛔ 豁免（见§八） | — |
| 47 | 空点清选（选项） | ✅ DONE | `store.ts` selEmptyClear（默认关保旧手感）+ skClickAt 分支；`SketchToolPanel.tsx` select 剔 |
| 50 | S = 草图快捷面板 | ✅ DONE | `CommandPalette.tsx` 收 SKETCH_PANELS + 草图模式 sk_* 排前 + placeholder；S 键已弹面板（App.tsx） |
| 51 | 缺失快捷键 O/M/P/E/V | ✅ DONE | `App.tsx` switch：O=offset · M=sk_move · P=sk_project · V=see-thru/隐藏 ·（E=extrude 已在） |
| 52 | Text 富对话框 | ✅ DONE（窄版，见§八注） | `store.ts` skTextDlg + commitSkTextDlg（Type/字高/凸高/对齐）；`Viewport.tsx` SkTextDialog |
| 53 | Pattern 展开字段（E 待补证） | ✅ 补证+对齐 | `store.ts` arrayCfg.distType(Spacing/Extent)+angleType(Full/Angle)、applyArray 换算；`SketchToolPanel.tsx`+`SketchLayer.tsx` ArrayPreview 同步 |

**净结：24 项 W4 全落地（#2 #25 属已在、其余新做）；5 C 类 → #20 窄版 DONE、#6/#7/#36/#43 诚实豁免（§八）；1 E 类 #53 补证并对齐 Fusion 字段语义。**

---

## 八、豁免记录（诚实标注 · 内核 / 架构受限）

以下 4 项无喺 GM-FP4 造假实现；逐项讲清点解豁免、以及未来要行嘅路。

- **#6 Slice（剖切遮挡几何，只留切面）** — 豁免。webcad 渲染系「全轮廓 + 实体网格」直画，冇 per-fragment clip-plane 剖切 pass；真 Slice 要喺 R3F 场景加 clipping plane（`localClippingEnabled` + 每 material `clippingPlanes`）并把草图面以外几何裁走，牵动渲染架构同所有 material 管理。**窄版替代已在**：👓 see-thru（`skSeeThru`）令实体半透明，达到「睇到草图面画紧乜」嘅实战目的（非真剖切）。未来路：全局 clip-plane pass + palette Slice 剔驱动。
- **#7 3D Sketch（离平面 Z 向画）** — 豁免。webcad 草图内核系【平面几何】：所有 shape 系平面 [s,t] 坐标，经 `sketchArb`/`SK[plane].lift` 单一平面基底 lift 去 3D；planegcs 约束、DOF 上色、投影参考、拉伸消费全部假设共面。3D Sketch 要每个点带独立 Z、约束求解升到 3D、渲染/吸附/命中全部重写 —— 属草图架构级改动。未来路：引入 3D 点模型 + 平面/自由双模，或直接走独立 3D-sketch 子系统。
- **#36 Curvature(G2) 约束** — 豁免。现有 12 型约束（含 tangent=G1）经 planegcs；G2（曲率连续）需要 solver 支持曲率相等约束（两曲线接点二阶导相等），`@salusoft89/planegcs` 现绑定未暴露 curvature constraint。未来路：升级 planegcs 绑定加 `constraint_curvature_*`，或对 spline/conic 接点做曲率残差自定义 solver pass。
- **#43 Blend Curve（曲率连续过渡曲线）** — 豁免。要喺两条现有曲线端点之间生成 G2 光顺过渡段（可调曲率），依赖 #36 嘅曲率支持 + 曲率连续几何生成器（Hermite/贝塞尔升阶匹配二阶导）。webcad 现有 spline/bspline/conic 系用户点控制点定形、非「端点曲率匹配自动生成」。未来路：先补 #36 曲率基建，再加 blend 生成器（两端点位/切向/曲率约束求 5 阶贝塞尔）。

**另注（窄版诚实边界）：**
- **#20 关联投影**：`sk_project` 逐条/全投影已把实体边印成真草图曲线（refedge，可标注/约束/参与拉伸），但系【静态一次性快照】—— 原实体改动后投影线唔会参数化跟住郁。真关联要动内核/时间轴（投影做特征、重建时重算），属架构级；窄版静态投影已覆盖日常「沿实体轮廓画」需求。
- **#52 Text 富对话框**：Type / 字高 / 凸高 / 对齐（左中右，靠平移字形 bbox 实现）系真嘅；**字体家族 / 粗体·斜体 / 沿路径** 无提供 —— worker `textSketchContours` 用单一内置 'cad' 字体离散字形，无字体表/字重/路径排版基建。对话框已诚实标注呢点，未来路：worker 引入 opentype.js 多字体 + 字重 + path-layout。
