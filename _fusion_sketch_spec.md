# Fusion 草图操作规范 (Part 1) — 观察实录

> 本文件记录在真实 Autodesk Fusion 360 (Education License, mm 单位, 英文 UI) 中，
> 逐个操作 2D 草图环境所**亲眼观察到**的交互行为，供 web CAD clone 复刻。
> 记录原则：写"看到什么"，不写"文档说什么"。
> 观察者: computer-use survey operator。日期 2026-07-10。

---

## 0. 进入/退出草图

**进入路径 (CREATE → Create Sketch):**
- SOLID 工具栏最左 CREATE 面板第一个按钮 = "Create Sketch"(网格 + 绿色加号图标)。
- 点击后视口**不自动旋转**。相机保持当前 home/iso 视角，在原点处显示**三个橙色高亮的原点平面**(XY 水平、XZ 竖直、YZ 竖直),等待用户拾取。
- 鼠标悬停某平面时:该平面变**灰/棕色填充 + 绿色边框**高亮;光标旁出现工具提示 **"Select a plane or planar face"**(即也可选已有实体的平面面)。
- 拾取平面后:相机**带动画地旋转**到正对该平面法向(look-at normal,平滑过渡,非瞬跳);进入草图环境。
- 进入草图后:
  - 顶部出现**新的 SKETCH 上下文选项卡**(红色高亮激活),与 SOLID/SURFACE/... 并列。
  - 工具栏切换为草图专用面板:**CREATE / MODIFY / CONSTRAINTS / CONFIGURE / INSPECT / INSERT / ASSEMBLE / SELECT / FINISH SKETCH**。
  - 最右出现绿色对勾大按钮 **FINISH SKETCH**。
  - 右侧弹出 **SKETCH PALETTE** 浮动面板(见下)。
  - 浏览器树新增 **Sketches** 文件夹;文档标题加 `*`(未保存标记)。
  - 默认 **Sketch Grid 关闭**,视口为空白(正视时不显网格)。原点在视口中央。

**SKETCH PALETTE(草图选项板)—— 逐项 + 默认状态:**
- 标题 `SKETCH PALETTE`,下含可折叠分区 **Options**(默认展开,向下箭头)。
- `Linetype`(线型):行右侧有**两个 toggle 图标按钮**(红色构造线图标 + 圆形中心线图标)—— 用于把后续绘制切换为 Construction / Centerline 线型(默认都不激活 = Normal 实线)。
- `Look At`：一个**蓝色按钮**(点它把相机正对草图平面)。
- `Sketch Grid`：复选框 — **默认关**。
- `Snap`：复选框 — **默认关**。
- `Slice`：复选框 — **默认关**(勾选后剖切遮挡几何,只看草图平面切面)。
- `Profile`：复选框 — **默认开**(显示闭合区域的浅蓝填充)。
- `Points`：复选框 — **默认开**。
- `Dimensions`：复选框 — **默认开**。
- `Constraints`：复选框 — **默认开**(显示约束glyph)。
- `Projected Geometries`：复选框 — **默认开**。
- `Construction Geometries`：复选框 — **默认开**。
- `3D Sketch`：复选框 — **默认关**(勾选后允许在 Z 方向绘制/离开平面)。
- 面板底部有 **Finish Sketch** 按钮(与顶栏绿对勾等价)。

**退出:** 顶栏 FINISH SKETCH 绿对勾,或 palette 底部 Finish Sketch 按钮。(相机退出行为待在 §退出实测记录 —— 本次不 finish 以保持草图激活。)

## CREATE 工具菜单全树(含快捷键,亲测自 dropdown)

CREATE ▾ 下拉完整条目(顺序自上而下):
- **Line** — 快捷键 `L`
- **Midpoint Line**(无快捷键)—— 独立顶层项,从中点向两端对称画线
- **Rectangle ▶**: `2-Point Rectangle` (R) / `3-Point Rectangle` / `Center Rectangle`
- **Circle ▶**: `Center Diameter Circle` (C) / `2-Point Circle` / `3-Point Circle` / `2-Tangent Circle` / `3-Tangent Circle`
- **Arc ▶**: `3-Point Arc` / `Center Point Arc` / `Tangent Arc`
- **Polygon ▶**: `Circumscribed Polygon` / `Inscribed Polygon` / `Edge Polygon`
- **Ellipse**(无快捷键)
- **Slot ▶**: `Center to Center Slot` / `Overall Slot` / `Center Point Slot` / `Three Point Arc Slot` / `Center Point Arc Slot`
- **Spline ▶**: `Fit Point Spline` / `Control Point Spline`
- **Conic Curve**(无快捷键)
- **Point**(无快捷键)
- **Text**(无快捷键)
- ── 分隔 ──
- **Mirror** / **Circular Pattern** / **Rectangular Pattern**
- ── 分隔 ──
- **Project / Include ▶**: `Project` (P) / `Intersect` / `Spun Profile` / `Include 3D Geometry` / …
- **Sketch Dimension** — 快捷键 `D`

> 注:submenu 项本身多无快捷键;快捷键挂在默认变体上(Rectangle→2-Point=R,Circle→Center Diameter=C)。

---

## 1. 视图控制(草图内)

**滚轮缩放:**
- **以光标为轴心缩放**(cursor-pivot):实测拖动前后各点的屏幕坐标按 `P' - C = k·(P - C)` 关于光标点 C 精确缩放;光标下的世界点保持不动。这是最关键的复刻点 —— **不是**居中缩放。
- 每 3 格(tick)缩放系数实测 ≈ 0.77 → 每格约 **8%**(k≈0.92/tick)。
- 缩放方向(本机):滚轮**上 = 缩小,下 = 放大**。此方向是 Fusion 偏好设置 "Reverse zoom direction" 可反转项,不同机器可能相反;复刻时应做成可配置,但**轴心=光标**是固定行为。

**平移 / 环绕(orbit):**
- 底部导航栏工具组(左→右):Orbit(环绕,带下拉)/ Home 视图(蓝)/ Pan 手形 / Zoom 放大镜 / Zoom Window(框选放大,下拉)/ Display Settings(显示器)/ Grid(网格,下拉两枚)。
- Pan = 中键拖动(导航栏手形工具同功能);Orbit = Shift+中键拖动(Fusion 默认)。
- **草图内 orbit 不退出草图**:实测拖动 ViewCube 令视图从俯视旋到 FRONT 面后,SKETCH 选项卡仍激活、SKETCH PALETTE 仍在、FINISH SKETCH 仍在 —— 即相机可任意倾斜脱离草图平面而**仍在编辑草图**(此时可斜看着画,但一般会先回正)。
- **回正**:SKETCH PALETTE 的 `Look At` 蓝按钮(或导航栏 Home)把相机**带动画**转回正对草图平面法向(face-on)。原点回到视口中心。

**ViewCube:**
- 草图内 ViewCube 正常可用:左键拖 = 自由环绕;点击面/角 = 跳到该命名视图。均不退出草图。

---

## 2. 逐个 CREATE 工具

### 通用机制(所有工具共有,先总述)
- **激活工具 → SKETCH PALETTE 顶部长出 `Feature Options` 分区**(工具特有选项),其下才是通用 `Options`;通用 Options 里 3D Sketch 等在工具激活时变灰。退出工具后 Feature Options 消失。
- **光标旁状态提示**:激活后光标旁浮出一个小提示框(如 Line 的 `Place first point` → `Specify next point`)。这是逐步 prompt。
- **内联尺寸输入框(inline value boxes)**:放下第一点后、移动未点第二点时,光标附近浮现若干**可编辑数值框**。规则(实测):
  - 框数量 = 该段的自由度(Line=2:长度 mm + 角度 deg;圆=1:直径;矩形=2:宽+高…)。
  - 有一个框**高亮蓝底 = 当前激活框**,直接**打字**即替换其值(无需先点框)。
  - 打完一个值该框旁出现**黄色小挂锁 🔒 glyph = 该值已锁定/驱动**;几何被该尺寸约束。
  - **Tab 键在数值框间循环**(Line:长度框 → Tab → 角度框);循环时上一框提交锁定。
  - **Enter/Return 提交**当前输入并落点。
  - 数值框接受表达式(Fusion 尺寸框通用支持 `=`、算式、单位后缀);本次以纯数字实测通过。
- **自动约束推断(inference)**:移动光标时,若与水平/垂直/已有点对齐,实时显示**蓝色约束 glyph**(见 §3),点击即自动施加该约束。
- **右键 = marking menu(径向标记菜单)**:激活工具时右键弹出径向菜单,内容随工具变(见 Line 实录)。

### 1) Line(快捷键 L)
- **Feature Options**:显示 `Line`,右侧两枚 toggle 图标(线/链模式相关)。
- **光标**:十字准星 + `Place first point` 提示。
- **点击序列**:点 pt1 → 提示变 `Specify next point` → 出现橡皮筋线 + 两个数值框(**长度 `54.057 mm`** 高亮 + **角度 `1.8 deg`**)→ 每点一次落一段并**继续链接**下一段(chain),角度框显示与**上一段的夹角**(如接一段垂直段显示 `90.0 deg`,并画出夹角圆弧)。
- **闭合回路**:把光标移回起点,起点浮现**蓝色方框套点的 coincident 吸附 glyph**;点击即闭合(施加 coincident),该链结束、内部变**浅蓝 Profile 填充**;**但 Line 工具重新 arm**(提示回到 `Place first point`,可再画新链)。
- **退出工具**:ESC 或 Enter(彻底退出,Feature Options 消失)。闭合回路本身只结束当前链、不退出工具。
- **typed-value 语法(精确实测)**:pt1 落下后**不点第二点直接打字** → 进入高亮的**长度**框 → 打 `30` 显示 `30` + 黄挂锁(长度锁定 30);**Tab** → 焦点跳到**角度**框(长度提交为 `30 mm` 带锁)→ 打 `45` → **Enter** → 落下一条 30mm/45° 全约束段。注:当长度+角度**都被打字锁定**后按 Enter,该段落下并**结束整条链**(不再续接);而纯点击落点则持续 chain。
- **自动约束**:与水平对齐时角度框跳 `0.0 deg` 且线中点上方出现**蓝色水平约束 glyph**;垂直同理。落点即固化该约束(草图里可见 horizontal glyph)。
- **右键 marking menu(Line 激活时)**:径向菜单含 `Repeat Line`(顶) / `Delete` / `Press Pull` / `Cancel ✗` / `OK ✓`(绿) / `Move/Copy` / `Hole` / `Sketch ▾`(子菜单);底部线性列表 `OK (Return)` / `Cancel (Esc)`。
- **arc-from-line-end(从端点拖出圆弧)**:在 Line 链接中,**从上一端点按住左键拖动**(而非单击释放)→ 即时切换为**相切圆弧模式**,预览弧线并显示 半径 `25.468 mm` + 弧夹角 `58.0 deg` 两个数值框;释放完成该弧后**自动退回直线模式**继续链接。这是 Fusion 的 line↔arc 手势(webcad 必备)。

### 2) Rectangle(三变体)
- **Feature Options `Rectangle`** 显示三枚变体图标(2-Point 方框 / Center 菱形 / 3-Point),可点图标切换变体。
- **2-Point Rectangle(快捷键 R)**:点 corner1 → 移动 → 预览矩形 + 两个数值框(**宽 top `53.926 mm` + 高 left `35.098 mm`**),提示 `Specify size of rectangle`。默认激活框 = **高**(蓝底)。typed 语法:打 `40` → 高锁定(黄挂锁)→ **Tab** → 焦点跳到宽框(高提交 `40 mm`)→ 打 `60` → **Enter** → 落成 60×40 全约束矩形(四边自动 H/V 约束 + 两个驱动尺寸),工具结束。
- **3-Point Rectangle(实测)**:pt1 → pt2 定第一条边(方向+长度)→ 提示 `Place third corner`,移动定垂直宽度(一个宽度数值框 `20.324 mm`)→ 点 pt3 完成。产出**任意角度**矩形(边不必水平/垂直)。
- **Center Rectangle(实测)**:点中心 → 提示 `Specify size of rectangle`,矩形**从中心对称向外扩**;两数值框 = **总宽 top `43.182 mm` + 总高 left(蓝底激活)**;中心点标 `+`,并画出**中心到四角的虚线对角线**(标示中心锚/对称)。
- 三者完成后工具均**结束**(非连续),需再次激活画下一个。

### 3) Circle(五变体)
- **Feature Options `Circle`** 显示 5 枚变体图标(Center Diameter / 2-Point / 3-Point / 2-Tangent / 3-Tangent),可点图标切换;当前变体图标**加蓝框**。
- **Center Diameter Circle(快捷键 C)**:点圆心 → 提示 `Place second point on diameter`,出现圆预览 + **一个数值框 = 直径 `16.168 mm`**(蓝底激活)→ 打 `30` → **Enter** → 落成圆,驱动尺寸显示 **`Ø30.00`**(带直径符号 Ø),工具结束。(注:圆心不要落在别的尺寸witness线端点上,会吸附错位。)
- **2-Point Circle**:点直径两端两点(第二点定直径与方向)。
- **3-Point Circle**:点圆周上三点定圆。
- **2-Tangent Circle**:先后点**两条已有曲线/边**作相切参照 → 再点/拖定半径,生成同时相切两者的圆。
- **3-Tangent Circle**:点三条已有边,生成内切三者的圆(半径自动)。
- (2T/3T 需要画布已有直线可点选作切线;纯空画布无法用。)

### 4) Arc(三变体,均在 CREATE → Arc ▶ 子菜单,无顶层快捷键)
- **3-Point Arc**:点 start → 点 end(定弦)→ 提示 `Place point on arc`,移动定第三点(弧上一点,决定凸度/半径)→ 点第三点完成。
- **Center Point Arc**:点圆心 → 点 start(定半径+起始角)→ 提示 `Specify end point`,扫掠出弧,**数值框 = 扫角 `68.1 deg`** → 点 end 完成。
- **Tangent Arc**:提示 `Specify start point`,须**点一条已有曲线的端点** → 从该端点拖出**与原曲线相切(G1 平滑续接)**的弧 → 提示 `Specify end point`,数值框 = 半径 `24.943 mm` → 点 end 完成。
- 三者完成后工具结束(非连续)。

### 5) Polygon(三变体)
- **Circumscribed Polygon(外切,实测深入)**:点中心 → 提示 `Place point on polygon`,预览正多边形。**两个输入**:
  - **边数框**:悬浮在**屏幕上方中央固定位置**(不随光标),带上下 spinner 箭头,默认 **6**,初始为激活(蓝底)。打字改边数(实测打 `5` → 立即变正五边形)。
  - **半径框**:在几何旁,`16.065 mm`(外切 = 中心到边中点的距离)。
  - ⚠ 实测 Tab 后再打第二个数值时,焦点**易被边数框粘住**(我第二次输入的 25 落进了边数框 → 变成 25 边形≈圆),webcad 复刻时应把「边数」「半径」做成**明确分离、Tab 顺序确定**的两个字段。
- **Inscribed Polygon(内切)**:同上,但半径 = 中心到**顶点**的距离(顶点落在半径圆上)。
- **Edge Polygon**:点一条**边的两个端点**(定边长+朝向),多边形沿该边生长;边数框同样可调。
- 完成后工具结束。

### 6) Ellipse(无子菜单/快捷键)
- 点中心 → 点第一轴端点(定一条半轴长 + 椭圆朝向)→ 提示 `Place point on ellipse`,移动定第二半轴(数值框 `30.371 mm`)→ 点完成。
- 预览显示**虚线长短轴**(construction 轴线)标示中心与两轴。完成后工具结束。

### 7) Slot(五变体)
- **Feature Options `Slot`** 显示 5 枚变体图标。
- **Center to Center Slot(深入实测)**:点弧心1 → 点弧心2(定两半圆圆心间距=槽长 + 朝向)→ 提示 `Select point on slot`,移动定**槽宽/半圆半径**(数值框 `23.208 mm`)→ 点完成。预览为 capsule 胶囊形,两弧心各标 `+`。共 **3 次点击**。
- **Overall Slot**:改为点**两端最外缘**(总长 tip-to-tip)→ 定宽。
- **Center Point Slot**:先点**槽中心** → 点一个弧心(半长)→ 定宽,关于中心对称。
- **Three Point Arc Slot**:弯槽,中心线是 3-点圆弧 → 再定宽。
- **Center Point Arc Slot**:弯槽,中心线是 center-point 圆弧 → 再定宽。
- 完成后工具结束。

### 8) Spline(两变体)
- **Fit Point Spline**:依次点 fit 点,曲线**穿过每一个点**(插值)。终点区浮现**绿色对勾"完成"按钮**;完成方式:**点绿对勾** 或 按 **Enter**(开放样条);**点回起点 = 闭合成环**(提示 `Select first point to close`)。完成后**工具重新 arm**(提示 `Specify first point`,可继续画新样条)。
- **Control Point Spline**:点 control 点,曲线**不穿过**控制点,而是被**控制多边形(红/粉虚线连线)**拉扯(落在凸包内)。Feature Options 出现 **`Spline Degree`**(可选 3 次或 5 次)。完成同样用绿对勾/Enter。
- 关键区别:Fit=插值穿点;Control=控制多边形逼近。二者都靠绿对勾/Enter 收尾(点数不定,故需显式结束)。

### 9) Point
- CREATE → Point:每点一次落一个草图点,工具**持续 arm** 可连续放点;ESC 退出。(用于打孔中心、参考点。)

### 10) Text(对话框式,实测)
- CREATE → Text 第一次先弹 **"Parametric Text" 说明 popup**(讲可把文本作参数引用),含 `Don't show this again` + OK → 点 OK 关闭。
- 随后右上浮出 **TEXT 对话框面板**:`Type` 文本输入框 + **两枚样式模式图标**(水平文本 A / 沿路径文本 A) + `OK`/`Cancel`(OK 在未放置前灰置);画布提示 `Enter text or rotate text frame`。
- 放置方式:在画布**单击定锚点** 或 **拖一个矩形定文本框**;放置后对话框才展开完整字段(字体下拉、字高、粗/斜体、对齐等),`Type` 里输入文字实时预览。
- ⚠ 复刻提醒:文本输入必须让 `Type` 框获得焦点后再打字;否则字母键会被当作**命令快捷键**(实测误把 `A` 触发 Appearance 外观命令并跳出草图)。

---

## 3. 通用绘图周边(实测)

### 构造线(Construction)
- **切换位置**:SKETCH PALETTE → `Options` → **`Linetype`** 行,两枚红色 toggle 图标:**Construction(红色折线图标)** + **Centerline(红色圆圈图标)**。工具激活时可点;打开后图标**高亮蓝色**。
- **行为**:开启 Construction 后画的几何是构造几何;实测**同一条折线**里,切换前的段是**实线蓝色(普通)**,切换后的段立即变**橙/琥珀色虚线(dashed amber)** —— 这是构造线的外观。
- 也可先画普通线,选中后按 **X** 转为构造(标准快捷键)。构造线不参与 Profile/拉伸,只作参考。
- 用完记得再点一次图标**关掉**,否则后续都画成构造线。

### 吸附标记(Snapping,需有绘图工具激活时 hover 才显示)
- **端点 / 重合(coincident)**:hover 到已有端点/起点 → 该点套一个**蓝色小方框**(见 Line 闭合回路)。点击即施加 coincident。
- **圆心(center)**:hover 圆/弧中心 → 高亮中心点标记,吸附到圆心。
- **水平/垂直推断**:拖线时与 H/V 对齐 → 线中点上方出现**蓝色小横杠/竖杠 glyph**,角度框跳 `0.0/90.0 deg`,点击即自动加 Horizontal/Vertical 约束。
- **中点(midpoint)**:hover 线段中点 → 出现三角形 △ glyph(本次因光标难精确命中未清晰截到,但为标准行为)。
- **hover 高亮**:光标掠过任何曲线,该曲线即**变蓝高亮**(pre-highlight),便于点选。
- **网格吸附**:Sketch Grid + Snap 复选框控制(默认都关);打开后吸附到网格交点。
- 另:底部状态栏实时显示光标草图坐标 `Sketch Point | X: … Y: … Z: … mm`,可作精确输入参考。

### 约束状态着色(under-/fully-constrained)
- **欠约束(under-constrained)= 蓝色/浅蓝**:本次所有随手画的曲线(线/矩形/圆/椭圆/槽/样条)都是**浅蓝**,因为都没被完全定位/定形。
- **完全约束(fully-constrained)= 黑色**:当几何的位置+尺寸全部锁定后转黑(Fusion 标准;本次未 ground 任何几何到原点,故都停留蓝色,黑色规则未现场演示但为既定行为)。
- **构造几何 = 橙色虚线**(独立于上面的蓝/黑约束色)。
- 闭合区域(可成 Profile 的封闭轮廓)内部填**浅蓝半透明**(Profile 显示,受 palette `Profile` 复选框控制)。

---

## 附:本次调查环境备注 / 未竟项
- keyboard 焦点偶发丢失(尤其被系统 IME `TextInputHost` 或弹窗抢焦点后),表现为 ESC/快捷键不生效;对策:用鼠标点一下 Fusion 中性 UI(如浏览器面板)重新聚焦,或用右键 marking menu 的 `OK/Cancel` 收尾工具。**切勿**用 `open_application "Autodesk Fusion"` 抢焦点——会弹「Multiple instances」对话框(须 Cancel)。
- 未逐一现场验证:Circle 的 2-Tangent/3-Tangent(需选已有切线,已从 UI 推断)、Polygon Inscribed/Edge 细节(Circumscribed 已深入)、Text 放置后的完整字段展开(仅见初始对话框)、midpoint △ 精确截图、fully-constrained 黑色现场演示。以上均标注为推断/标准行为。

---
---

# Fusion 草图操作规范 (Part 2) — 观察实录

> 承接 Part 1(同一台真实 Fusion 360 Education,mm,英文 UI,同一未保存 Untitled* 草图)。
> Part 2 覆盖:尺寸标注 D / 约束 / 修改工具 / 选择模型 / 快捷键。观察者 operator #2,2026-07-10。
> 术语沿用 Part 1(inline value box、marking menu、glyph、under/fully-constrained 着色)。

---

## 4. 尺寸标注 (SKETCH DIMENSION,快捷键 D)

**激活:** 键盘 `D`,或 CREATE ▾ → `Sketch Dimension`(Part 1 已录菜单)。激活后光标旁提示 **`Select sketch objects to dimension`**。是**通用尺寸**工具:同一命令按所选对象类型自动决定线性/直径/半径/角度(下述各 case)。

**通用交互(所有 case 共有,实测):**
- **拾取 → 放置两段式**:先点 1~2 个对象(状态栏底部实时回显所选,如 `1 Sketch Line | Length : 159.39 mm`、`2 Sketch Points | Min Distance : 30.7 mm`、`2 Sketch Curves | Angle : 90.0 deg`),提示变 `Select additional sketch geometry or location for dimension` → 移动到空白处点第二下 = **放置**(提示 `Select location for dimension`)。
- **放置即弹 inline 数值框**:落点瞬间光标处浮出**可编辑数值框**,预填**当前实测值(全精度,如 `159.3899772907 mm`)**、**文字already全选高亮蓝底**、带单位后缀 `mm`;右侧一枚 **`⋮` 选项按钮**。直接**打字即替换**(无需先点框),**Enter 提交并驱动几何**(几何立即更新到输入值),**工具随即 re-arm** 等下一个尺寸(连续标注)。
- **`⋮` 按钮**:点开显示该尺寸的**参数名 `d9 : Dimension Value`**(每个尺寸自动命名 d1/d2/…/d9),即尺寸=命名参数,可被表达式引用(`=`、算式、跨尺寸引用为 Fusion 通用能力,本次以纯数字实测)。`⋮` **不是** R↔Ø 切换。
- **单个尺寸的 H/V/对齐方向由放置位置决定**(对单线):把标注**垂直偏置到线一侧 = Aligned(对齐/真长)**;实测选中一条 160mm 斜线、往斜线**垂直方向**外拖放置 → 得 **Aligned** 尺寸(显示真长 159.39)。往水平/竖直方向远移则切 Horizontal(投影 dx)/ Vertical(投影 dy)(标准行为,本次主证 Aligned)。

**各 case 实测(状态栏原文 + 前缀符号):**
- **a. 单线 → 线性**:选 1 线 → `1 Sketch Line | Length : X`。垂直偏置放置 = **Aligned**;输入 `120`+Enter → 该斜线**立即缩短到 120mm**,标签显示 `120.00`(纯数字,无前缀)。
- **b. 两点 → 距离**:选 2 点 → `2 Sketch Points | Min Distance : X`;放置得**两点间对齐距离**(斜放=直线距离)。
- **c. 两条平行线 → 间距(gap)**:选 2 平行边 → `2 Sketch Curves | Min Distance : 60.00`;放置得两线**垂直间距**。
- **d. 两条非平行线 → 角度**:选 2 非平行边 → `2 Sketch Curves | Angle : 90.0 deg`;在**两线夹角内**悬停即预览**角度圆弧 + 度数 glyph**,放置得角度尺寸。⚠ 两线若**相距很远/虚交点在屏外**(如斜线+远处竖边)会退化成奇怪的线性预览、难放置;取**共角的相邻两边**(如矩形一角)最稳。
- **e. 圆 → 直径 Ø**:选圆曲线 → 直径尺寸,标签带 **`Ø` 前缀**(Part 1 已见 `Ø30.00`)。默认拾取模式 = **`Pick Circle/Arc Center`**(见 marking menu);⚠ 实测该圆边上散布 sketch point 会**抢走点击**(状态栏变 `Sketch Point`),复刻时圆的**曲线命中优先级**要高于其上的点。
- **f. 弧 → 半径 R**:选弧曲线 → `1 Sketch Arc | Radius : 21.872 mm`,预览/标签带 **`R` 前缀**(`R21.872`)。**R↔Ø 切换不在 inline `⋮`**(那只显参数名);应经**右键该尺寸/该弧的上下文菜单**切 Radius/Diameter(标准 Fusion,本次未逐点该项)。
- **g. 线 + 点 → 最短距离**:选 1 线 + 1 点 → `1 Sketch Point 1 Sketch Line | Min Distance : 24.149 mm`;放置得**点到线的垂距**尺寸。

**编辑既有尺寸:**
- **双击标签** → 弹回**同一枚 inline 数值框**(`120 mm` 全选 + `⋮`);打新值 + Enter 改动。
- **拖动标签** → **重定位尺寸文字**;实测把 `R21.872` 标签从原位拖走,**引线(leader)自动跟随**折转。
- **删除**:单击选中尺寸(状态栏 `1 Sketch Dimension : d9 | Radius : 21.872 mm`,回显参数名)→ 按 **`Delete`** → 尺寸消失、**几何保留**并**退回欠约束蓝色**。

**★ 过约束流程(over-constrain,重点实录):**
- 对**已被驱动的边再标一次**(如给已有 `60.00` 宽的矩形顶边再标长度)→ 弹**模态对话框**,原文逐字:
  - 标题 **`Over-constrained sketch`**
  - 正文 `This dimension would over-constrain the sketch.`
  - `Create a **Driven** dimension instead?`
  - 蓝链 `Learn More`
  - 复选框 ☐ `Do not show this again`
  - 按钮 **`Create Driven`(蓝,主)** / `Cancel`
- 点 **Create Driven** → 生成**从动(reference)尺寸**:数值**套括号显示 `(60.00)`**、**颜色偏浅灰**(相对驱动尺寸的深色);角度同理 `(90.0°)`。
- **驱动↔从动 toggle**:在**尺寸工具的右键 marking menu**里(见 §7),线性列表含 `Driven` / `✓ Driving`(单选,置下一个新尺寸的性质)+ `✓ Pick Circle/Arc Center` / `Pick Circle/Arc Tangent`(置圆/弧的拾取基准)。
- ⚠ 一旦真的过约束,Fusion 右下角弹**红叉 toast `1 error(s) — Sketch geometry is over constrained`**。

**★ 复刻关键坑(实测):**
- **Esc 常常不生效**(IME/焦点掉,与 Part 1 同病)→ 尺寸放置中途想取消,靠**放置后在对话框点 Cancel** 最稳;或右键 marking menu 取 Cancel。
- **Esc 只退工具、不清空选择集**:退出后原高亮对象仍被选中,**再按 D 会继承旧选择** → 造成"莫名其妙又标到上次的对象"。webcad 应在**退出工具时一并清选择**,或提供可靠的"点空白=清选择"(注意:点到 **Profile 浅蓝填充内部**算空点、会清选择;点**画布真正空白**才清)。
- **边命中很挑**:矩形细边、边上的约束 glyph、角点、profile 填充都会干扰点击;webcad 的曲线命中框要足够宽且**曲线优先于填充**。

---

## 5. 约束 (CONSTRAINTS)

**CONSTRAINTS 面板全列表(点 `CONSTRAINTS ▾` dropdown 亲测,自上而下,均带图标,无单字快捷键):**
1. **AutoConstrain**(网格+火花 wand)—— 一次性自动推断多约束
2. **AutoConstrain from datum**(同上+基准)
3. **Horizontal/Vertical**(线上一挂坠图标)—— 单一命令,按线朝向自动判定水平或垂直
4. **Coincident**(两线交于点/L 角)
5. **Tangent**(圆+切线)
6. **Equal**(=,双红杠)
7. **Parallel**(// 双斜杠)
8. **Perpendicular**(直角勾 ∟/`<`)
9. **Fix/UnFix**(红挂锁)
10. **MidPoint**(△ 三角)
11. **Concentric**(◎ 同心双圆)
12. **Collinear**(共线勾)
13. **Symmetry**(`[|]` 双括号夹中线)
14. **Curvature**(曲率/G2 平滑勾)
15. **Polygon**(多边形约束)
> 工具栏把常用几枚做成直接图标,全集在 dropdown。**约束项均无单字快捷键**(与 CREATE 的 L/R/C/D 不同)。

**施加机制(实测,两种拾取序都支持):**
- **工具优先(tool-first)**:点约束按钮 → 光标提示 **`Select sketch objects to constrain`**(选够对象后变 **`Select sketch objects or change constraint type`** —— 即拾取途中还能切换要施加的约束类型)→ 点必要对象 → 立即施加。
- **预选优先(pre-select)**:先用 Select 选好对象,再点约束按钮,立即施加(标准,亦支持)。
- **工具 re-arm**:施加后**工具保持激活**(提示复现),可对下一组连续施加;退出靠 Esc/右键 Cancel。
- **实测成功施加**:`Fix`(×2)、`Perpendicular`(两条新画线 → 90°)、`Equal`(同两线 → 等长)。

**glyph(约束标记)外观 + 位置(实测,均为浅灰小徽标,浮在几何外侧近相关特征处):**
- **Horizontal/Vertical**:小灰**药丸/单杠**徽标(横杠=H,竖杠=V),贴在**边中点**外侧。
- **Perpendicular**:小灰**直角勾 `>`/∟**,落在**两边相交的角点**。
- **Equal**:小灰**药丸内含 `=`(双短横)**徽标,落在**每个等值成员的中点**;**同组等值件带相同徽标**(靠"徽标相同"辨认哪些相等)。
- **Fix/Grounded**:见下(改的是几何着色,不是加徽标)。

**★ 约束状态着色(重点,补 Part 1 未演示的 BLACK):**
- **欠约束 = 浅蓝**(under-constrained)。
- **完全约束 = 黑色**(fully-constrained):**现场演示成功**——对已有 `宽60/高40` 驱动尺寸的矩形,`Fix` 掉底边+左边后,**其余两边(顶/右)当场转黑**;高倍对比:该矩形顶边=黑,旁边无尺寸矩形顶边=浅蓝,黑蓝分明。
- **固定/接地 = 绿色**(Fixed/grounded):`Fix` 施加的边/点显**绿色**(≠ 黑)。**green(被 Fix 锁死) 与 black(被约束充分确定) 是两种不同状态**,webcad 应分色。

**glyph 交互(实测):**
- **hover/点选 glyph**:单击约束徽标即**选中它**,底部状态栏**报出约束名**(如 `Horizontal Constraint`),且**关联几何高亮**(partner 高亮)。
- **删除约束**:选中 glyph → 按 **`Delete`** → 该约束移除(实测删掉矩形顶边的 Horizontal 徽标,顶边恢复自由)。几何保留。
- **显示/隐藏总开关**:**SKETCH PALETTE → `Constraints` 复选框**;取消勾选 → **全部约束徽标一次性隐藏**(而 `Dimensions` 尺寸仍在,两者独立开关)。

**★ 求解器行为(实测坑):**
- 本 scratch 文档被我叠了 Fix + 多个 driven 尺寸后进入**过约束**;此后再加 `Coincident`/`Equal` 到旧几何会弹**红叉 toast `1 error(s) — Failed to solve. Please try revising dimensions or constraints.`**(带 More Info)。→ webcad 求解器遇冲突应给类似"无法求解、请检查尺寸/约束"的非破坏性提示,而非崩溃或静默。
- 新画的独立几何不受此影响,约束照常施加(故上面用新线演示 Perpendicular/Equal)。

---

## 6. 修改工具 (MODIFY)

**MODIFY ▾ 全列表(含快捷键,亲测 dropdown):**
Fillet / Chamfer ▶ / Blend Curve / **Offset `O`** / **Trim `T`** / Extend / Break / Sketch Scale / **Move/Copy `M`** / Change Parameters(fx)。
> ⚠ **Mirror / Circular Pattern / Rectangular Pattern 不在 MODIFY,在 CREATE 菜单**(Part 1 已录;本次复核确认)。

### Trim(`T`)—— 深入实测
- 提示 **`Select curve section to trim`**。
- **hover 预览**:光标掠过某"曲线段"(由与其它几何的交点/端点切分出的最小段),该段即高亮**粉紫/洋红色(magenta)= 将被删的 doomed 段**。
- **单击语义**:点一下 = 删掉当前高亮的那一段(删到最近交点为止)。实测把矩形一条边整段删掉 → 变开口。
- **拖扫 trim(drag-sweep)成立**:按住拖动,**光标路径划过的每一段都被裁掉**,一笔多删(实测一拖同时删掉顶边+右边)。
- **副作用告警**:裁掉的几何若带约束/尺寸,右下弹**黄 toast `1 warning(s) — Constraints and/or dimensions were removed during this operation`**(带 More Info)。
- 工具**保持激活**连续裁;Esc/右键退出。

### Offset(`O`)—— 深入实测
- 点一条曲线 → 弹 **OFFSET 对话框** + 画布内联距离框(提示 `Modify offset distance or side settings`)。
- 对话框字段:**Curves**(选择集)/ **Chain Selection ☑**(自动把相连链一并选中)/ **Direction `One Side ▾`** / **Distance**(mm)/ **Flip**(翻面按钮)/ OK / Cancel。
- 打距离(实测 `12`)→ **实时预览**偏移曲线;**Flip** 翻到另一侧。
- **提交后创建"偏移关系":新曲线与原曲线由一个驱动**偏移尺寸(实测生成 `12.00` 尺寸)**参数化联动**(改尺寸即改间距)。

### Move/Copy(`M`)—— 实测
- 选对象 → 弹 **MOVE/COPY 对话框** + 对象上出现**操纵器 gizmo**:**X 向右箭头 →、Y 向下箭头 ↓、旋转弧 ↻**(+ 中心 pivot)。
- 对话框字段:Move Object / Selection(`N selected`)/ **Move Type**(5 种模式图标:自由 3 轴 gizmo[默认]、点到点、旋转、沿线平移…)/ Set Pivot / **X/Y/Z Distance**(mm)/ **X/Y/Z Angle**(deg)/ **`Create Copy ☐`**(=复制开关,勾上则复制而非移动)/ OK / Cancel。

### Mirror(CREATE 菜单)
- 对话框极简:**Objects `Select`** + **Mirror Line `Select`** + OK/Cancel。选要镜像的对象 + 一条镜像轴线 → 生成对称副本(带 symmetry 约束,标准)。

### Rectangular / Circular Pattern(CREATE 菜单)
- **Rectangular Pattern** 初始字段:**Objects** + **Direction/s**(选对象 + 1~2 个方向)→ 选齐后展开 **Quantity(每方向数量)+ Distance(Spacing/Extent 距离型)** 等。
- **Circular Pattern** 初始字段:**Objects** + **Center Point**(选对象 + 旋转中心)→ 展开 **Quantity + Angle(整圈/指定角)**。
- 结果为一组关联阵列实例(可后编辑数量/间距)。

### Sketch Fillet(MODIFY→Fillet,无快捷键)
- 机制:点两条相邻线(或其公共角点)→ 以圆角替换尖角 + 半径内联输入。**本次现场点选两条新线未成功触发**(细线命中偏差),机制按标准记录、标注为未完全现场验证。

### Extend / Break(略测)
- **Extend**:把曲线延伸到下一条边界曲线(hover 预览延伸段,点击确认)。
- **Break**:在指定点把一条曲线打断成两段(不删料)。二者本次仅列出,未逐一现场演示。

### ★ 直接拖拽编辑(无工具,重点 for webcad,实测)
- **拖端点**:直接拖一条欠约束线的端点 → 端点跟随移动,几何橡皮筋联动;**底部状态栏实时显示该点坐标**(`Sketch Point | X:… Y:… Z:… mm`);**已有约束被维持**(实测拖动 Equal+Perpendicular 的线端点,另一条线同步保持等长与垂直)。
- **拖线段中部**:平移整条曲线(受约束程度决定可动方向)。
- **拖圆**:拖**圆心**=整圆平移;拖**圆周(rim)**=改半径(缩放)。(圆心实测:整圆随拖移动。)
- **拖完全约束(黑)/固定(绿)几何 = 拒动**:实测拖黑色矩形顶边,**纹丝不动、只被选中**(状态栏 `1 Sketch Line | Length : 60.00 mm`)。→ webcad:充分约束件应拒绝直接拖拽、退化为"选中"。

---

## 7. 选择模型 (SELECTION)

**基础(实测):**
- **单击选中**:选中几何/尺寸变**亮蓝色**高亮;状态栏回显(如 `1 Sketch Line | Length : …`、`1 Sketch Dimension : d1 | Length : 60.00 mm`,含参数名)。
- **多选**:框选(见下)或依次点选累加;Ctrl/Shift 增删为标准(本次主证框选累加,状态栏 `Multiple selections | N`)。
- **点空白 = 取消选择**;但注意:点到 **Profile 浅蓝填充内部**也算空点会清选择,点画布真空白亦然。
- **双击一条曲线 = 链选(chain select)**:实测双击矩形一条边 → **整条闭链 4 边全选**(状态栏 `4 Sketch Curves | Length : 200.00 mm`)。
- **双击尺寸标签 = 进入数值编辑**(见 §4)。
- **Del 删除当前选择**(对尺寸、曲线、多选一致)。

**★ 框选(marquee,草图内实测,方向决定语义):**
- **左→右拖(L→R)= Window/窗选**:框呈 **橙/鲑色半透明填充 + 实线边框**;**只选"完全被框住"的对象**(实测框住上排圆弧区选中较少)。
- **右→左拖(R→L)= Crossing/交叉选**:框呈 **黄色半透明填充 + 实线边框**;**凡被框"触碰到"的对象都选中**(实测同区域 R→L 选中 13~15 项,多于 L→R)。
- 两向边框本次看均为实线(未见明显虚线区分);**颜色(橙 vs 黄)+ 包含规则(全包 vs 触碰)是主要区分**。
- 框选后 **Del** 即删除整批。

**★ 右键 marking menu × 三种上下文(实测转录,均为"径向 wedge + 下方线性列表"两段式):**

**共有径向 wedge(三种基本一致):** `Repeat <上一命令>`(顶)/ `Delete ✗` / `Press Pull` / `Undo` / `Redo` / `Move/Copy` / `Hole` / `Sketch ▾`(子菜单)。

- **(A) 空白画布**(无选择)线性列表:`OK(Return)` / `Cancel(Esc)` / **`Pan` / `Zoom` / `Constrained Orbit` / `Set Orbit Center` / `Reset Orbit Center`** / `Remove` / `Show All` / `Unisolate` / `Workspace ▶` / **`Line (L)` / `2-Point Rectangle (R)` / `Center Diameter Circle (C)`**(快捷画图)。
- **(B) 选中实体/多选** 线性列表:`OK` / `Cancel` / `Constrained Orbit` / `Set/Reset Orbit Center` / `Create Selection Set` / **`Extrude (E)`** / `Extrude` / **`Sketch Dimension (D)`** / **`Normal/Construction (X)`**(转构造线)/ `Normal/Centerline` / **`Fix/UnFix`** / `Toggle Curvature Display` / **`Copy (Ctrl+C)`** / **`Show/Hide (V)`**。
- **(C) 选中尺寸** 线性列表:`OK` / `Cancel` / `Create Selection Set` / **`Toggle Driven`**(=既有尺寸的**驱动↔从动切换**,回答 §4 的 toggle 问题)/ **`Find in Browser`** / **`Find in Window`**。

> 三种菜单**顶部径向轮盘共用**、**下方线性列表随上下文变**;webcad 若做 marking menu 可照此"共有动作放轮盘 + 上下文动作放列表"。

---

## 8. 快捷键盘点

**`S` 键 = "Sketch Shortcuts" 快捷工具箱弹窗(实测):**
- 按 `S`(草图内)→ 光标处弹出标题为 **`Sketch Shortcuts`** 的小面板:一行**可自定义的已钉命令图标**(实测默认约 3 枚:线/矩形/圆之类)+ 下方 **`Search` 搜索框**。
- 用途:打字搜任意草图命令即可执行;可把常用命令拖进来钉住(用户自定义)。相当于 Fusion 的"快捷命令面板"(marking menu 之外的另一套快速调用)。
- Esc 关闭。

**本次全程实证的草图快捷键(汇总,均亲见于菜单右侧或状态):**
| 键 | 命令 | 来源 |
|---|---|---|
| `L` | Line | CREATE / 空白右键菜单 |
| `R` | 2-Point Rectangle | CREATE / 空白右键菜单 |
| `C` | Center Diameter Circle | CREATE / 空白右键菜单 |
| `D` | Sketch Dimension | CREATE / 实体右键菜单 |
| `T` | Trim | MODIFY |
| `O` | Offset | MODIFY |
| `M` | Move/Copy | MODIFY |
| `P` | Project | CREATE→Project/Include(Part 1) |
| `X` | Normal/Construction(切换构造线) | 实体右键菜单 |
| `E` | Extrude | 实体右键菜单 |
| `V` | Show/Hide | 实体右键菜单 |
| `Esc` | Cancel / 退工具 | 各 marking menu(常掉焦不生效,见坑) |
| `Return` | OK / 提交数值·完成 | 各 marking menu |
| `Delete` | 删除选中(几何/尺寸/约束/框选批量) | 全局 |
| `Ctrl+C` | Copy | 实体右键菜单 |
> 约束类命令**无单字快捷键**(§5);变体子命令(如 3-Point Rectangle、2-Point Circle)也无独立快捷键——快捷键只挂在各族默认变体上。

---

## 附:Part 2 环境备注 / 未竟项(诚实清单)
- **点选精度是本轮最大摩擦**:Fusion 细线/圆周/边上散点/Profile 填充相互干扰,computer-use 逐像素点常偏 1~3px 而落空(尤其圆周被其上 sketch point 抢点、矩形细边);多数"失败"是命中问题非行为问题。**webcad 复刻要点:曲线命中框加宽 + 曲线优先于填充/点。**
- **未能现场干净演示(机制按标准记录、标注推断)**:圆 → Ø 新建标注(改用既有 Ø30 佐证)、R↔Ø 内联切换(确认 inline `⋮` 只显参数名,切换应走右键 Radius/Diameter)、Sketch Fillet 落点(细线未触发)、Mirror/Rect/Circular Pattern 的**展开后完整字段**(仅录初始字段:Mirror=Objects+Mirror Line;RectPattern=Objects+Direction/s;CircPattern=Objects+Center Point)、Extend/Break 实操、约束"预选优先"序(仅确认支持,主证工具优先)。
- **约束"施加满 8 种"部分受阻**:scratch 文档被 Fix + 多 driven 尺寸叠成**过约束**后,对旧几何加约束触发 `Failed to solve`;故干净新建演示了 `Fix / Perpendicular / Equal`,其余按同一 tool-first 机制 + 既有 glyph 记录。此为求解器真实行为(webcad 需同样的冲突提示)。
- **已确证补齐 Part 1 缺口**:fully-constrained **BLACK** 现场演示成功(+ Fixed=GREEN 双状态);marking menu 三上下文全转录;marquee 双向语义 + 颜色实证。
