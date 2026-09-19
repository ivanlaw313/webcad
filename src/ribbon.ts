export type Tool = {
  id: string; label: string; icon: string; shortcut?: string; big?: boolean; tip?: string
  quick?: boolean        // shown as a quick icon in the ribbon strip (Fusion: ~≤7 per group); others live in the ▾ dropdown only
  sep?: boolean          // render a divider line BEFORE this item in the group dropdown (Fusion menu sections)
  children?: Tool[]      // submenu (Fusion: "Pattern ▸") — parent row opens a nested menu; children keep real command ids
  quickChildren?: Tool[] // inline split-button dropdown only; full group menu keeps parent/leaf ordering unchanged
  glyph?: string         // text glyph rendered instead of the SVG icon (2D sketch tools: ◯ ▭ ⊿ ⌒ ⬡ ∿) + label below
}
export type Panel = { name: string; tools: Tool[] }
export type Workspace = { id: string; panels: Panel[] }

// The workspace tabs across the top of the ribbon (matches Fusion's SOLID row).
// 🧪實驗室 = webcad 特色功能（Fusion 冇嘅：齿轮/机构/仿真/CAM/3D打印辅助/更多基元）统一收纳处 —
// 主 tabs 100% 跟 Fusion（P0 用户确认方案：主 ribbon 干净、特色功能唔遗失）。
export const WORKSPACE_TABS = [
  'SOLID', 'SURFACE', 'MESH', 'SHEET METAL', 'PLASTIC', 'MANAGE', 'UTILITIES', '🧪實驗室',
] as const

// SOLID tab — group order mirrors verified Fusion: CREATE | MODIFY | ASSEMBLE | CONSTRUCT | INSPECT | INSERT | SELECT（ASSEMBLE 紧随 MODIFY；CONFIGURE/制造 = webcad 额外组，插喺中段）。
// Dropdown item order + dividers mirror Fusion's CREATE/MODIFY menus (sketch block ─ swept features ─ hole/thread ─ primitives ─ pattern/mirror ─ generators).
const SOLID: Panel[] = [
  {
    name: 'CREATE',
    tools: [
      { id: 'sketch', label: '建立草圖', icon: 'sketch', shortcut: 'Shift+S', quick: true, tip: '自由草圖：快速畫矩形/圓/折線等，滑鼠點擊即畫（新手首選）。㩒咗之后揀基準面 —— 紅XY/綠XZ/藍YZ 原點面，或直接㩒實體嘅任何一個平坦面。（S=命令搜索，同 Fusion 一样）' },
      { id: 'createform', label: '建立造型', icon: 'box', quick: true, tip: '切換到 Fusion 式 FORM 細分建模環境；完成後用「完成造型」返回實體。' },
      { id: 'derive', label: 'Derive', icon: 'component', tip: '从另一个设计派生组件、实体、草图或参数。' },
      { id: 'automatedmodel', label: 'Automated Modeling', icon: 'component', tip: 'Connector v1：依次点两张平面面，建立独立连接器实体。当前不含避让体、曲面面或 Fusion 的生成式多方案。' },
      { id: 'extrude', label: '拉伸', icon: 'extrude', shortcut: 'E', quick: true, sep: true, tip: '拉伸：画好草图轮廓后，沿垂直方向拉出/切入实体。弹面板设 加料/切割 · 距离 · 拔模角 · 贯通。' },
      { id: 'revolve', label: '旋轉', icon: 'revolve', quick: true, tip: '旋转：草图轮廓绕一条轴旋转成回转体（轴/盘/车削件）。可加料/切割车槽/相交，薄壁>0 做灯罩/碗壳。' },
      { id: 'sweep', label: '掃掠', icon: 'sweep', quick: true, tip: '扫掠：一个截面沿你画嘅路径扫出实体（管/导轨）。先画折线/样条路径，壁厚>0 出空心管。' },
      { id: 'loft', label: '放樣', icon: 'loft', quick: true, tip: '放样：在两个或多个截面之间平滑过渡成实体。截面可来自 XY/XZ/YZ 或任意参考平面；按选择次序加入。' },
      { id: 'rib', label: '加強筋', icon: 'rib', tip: '加強筋/腹板：沿草图中心线生成薄筋并落到实体底面融合（增强结构）。' },
      { id: 'web', label: '腹板', icon: 'rib', tip: 'Fusion Web：选择一条或多条开放草图线建立薄腹板；Extend Curves 默认开启，会把线端延伸到邻近实体墙面。' },
      { id: 'emboss', label: 'Emboss', icon: 'emboss', quick: true, tip: 'Emboss（Fusion 凸字/刻字）：点实体一个【平面】→ 输入文字 → 沿该面法向凸起(正深度)/刻入(负深度)。标牌/编号/logo。' },
      { id: 'hole', label: '孔', icon: 'hole', shortcut: 'H', quick: true, sep: true, tip: '孔：在实体面上钻孔（通/盲 · 沉头 · 埋头 · 螺母槽 · 攻牙底孔），有 M3-M12 标准尺寸。' },
      { id: 'thread', label: '螺纹杆', icon: 'thread', tip: '螺纹杆：真渐开螺旋牙（非贴图）。设大径Ø/螺距/高。' },
      { id: 'box', label: '長方體', icon: 'box', sep: true, tip: '長方體：直接設長×寬×高建一個盒（最常用起手）。' },
      { id: 'cylinder', label: '圓柱', icon: 'cylinder', tip: '圓柱：設直徑×高直接建圓柱。' },
      { id: 'sphere', label: '球', icon: 'sphere', tip: '球：设直径建球。' },
      { id: 'torus', label: '圓環', icon: 'torus', tip: '圓環：設外徑+管徑，弧<360° 出 C 形環/卡簧。' },
      { id: 'coil', label: '螺旋', icon: 'coil', tip: '螺旋/弹簧：设节距/高/底半径/线径/顶半径（顶≠底=锥形弹簧）。' },
      { id: 'pipe', label: '管道', icon: 'pipeicon', tip: '管道：沿路径扫出空心管（外径+壁厚）。先画路径折线。' },
      {
        id: 'pattern', label: '陣列', icon: 'pattern', quick: true, sep: true, tip: '阵列：矩形 / 环形 / 沿路径 复制实体或孔。',
        children: [
          { id: 'pattern', label: '矩形陣列', icon: 'pattern', tip: '沿 X/Y(/Z) 方向复制实体或孔成网格。' },
          { id: 'circpattern', label: '環形陣列', icon: 'pattern', tip: '绕任意轴等角度复制（Fusion 同款）：对象 = 整个实体或时间轴所选特征（螺栓孔圈/辐条），角度 = 完整360°/指定/对称。' },
          { id: 'geopattern', label: '幾何陣列', icon: 'pattern', tip: '复制所选时间轴特征，并为每个实例指定平移或旋转变换。' },
          { id: 'pathpattern', label: '路徑陣列', icon: 'pattern', tip: '先建实体→画折线/样条路径→沿路径等距复制实体。' },
        ],
      },
      { id: 'mirror', label: '鏡像', icon: 'mirror', quick: true, tip: '镜像特征/实体：跨基准面（XY/XZ/YZ 或所选面）对称复制选中嘅特征或整个实体。同「阵列」配对嘅常用建模操作。' },
      { id: 'thicken', label: '加厚', icon: 'shell', sep: true, tip: 'Fusion Thicken：点实体或曲面一个面，沿法向加厚成实体薄板；负值翻转方向。' },
      { id: 'boundaryfill', label: 'Boundary Fill', icon: 'combine', tip: '用实体、曲面与工作平面分割空间，再选择要保留的 cell。' },
      { id: 'basefeature', label: 'Create Base Feature', icon: 'newbody', tip: '进入直接建模 Base Feature 环境。' },
      { id: 'createpcb', label: 'Create PCB', icon: 'component', tip: '创建或关联 PCB。' },
      { id: 'jointorigin', label: '關節原點', icon: 'joint', sep: true, tip: 'Fusion Joint Origin：點實體面心、圓柱孔心或頂點建立可複用命名關節坐標幀。' },
    ],
  },
  {
    name: 'MODIFY',
    tools: [
      { id: 'presspull', label: '按拉', icon: 'presspull', shortcut: 'Q', quick: true, tip: '按/拉：点實體一個平面，沿法向推出或壓入（快速加/減料）。' },
      { id: 'editface', label: '編輯面', icon: 'move', tip: 'Fusion Edit Face：選擇一個或多個平面面，直接偏移或傾斜并重解相鄰面。' },
      { id: 'fillet', label: '圓角', icon: 'fillet', shortcut: 'F', quick: true, sep: true, tip: '圓角：點選棱（可多條）倒成圓弧，設半徑（末端半徑≠起始=變半徑圓角）。', quickChildren: [
        { id: 'fillet', label: '圓角', icon: 'fillet', shortcut: 'F', tip: '圓角：點選棱（可多條）倒成圓弧。' },
        { id: 'chamfer', label: '倒角', icon: 'chamfer', shortcut: 'C', tip: '倒角：等距 / 两距离 / 距离+角度。' },
      ] },
      { id: 'chamfer', label: '倒角', icon: 'chamfer', shortcut: 'C', tip: '倒角（Chamfer）：點選棱切斜角。支持等距 / 两距离 / 距离+角度。' },
      { id: 'shell', label: '抽殼', icon: 'shell', quick: true, sep: true, tip: '抽殼：把實體掏空成等壁厚殼，選開口面。建議喺圓角之前做。' },
      { id: 'draft', label: '拔模', icon: 'draft', tip: '拔模：给側面加脫模斜度（注塑/鑄造件必備）。' },
      { id: 'scale', label: '縮放', icon: 'scale', tip: '縮放：按比例放大/縮小實體。' },
      { id: 'combine', label: '合併/切割', icon: 'combine', quick: true, tip: '合併/布尔：把 活动實體(目標) 同 泊车實體(工具) 做 併起 / 切走 / 相交 —— 出真精確實體（對話框選操作 + 勾要用嘅工具體）。要先用「新實體」整多過一個實體先做到。' },
      { id: 'offsetface', label: '偏移面', icon: 'replaceface', tip: 'Fusion Offset Face：点實體一個或多個平面，沿法向原地偏移；可選擇修改现有特徵、新偏移或自動。' },
      { id: 'replaceface', label: '替換面', icon: 'replaceface', tip: 'Fusion Replace Face：選擇來源面及目標面／平面，以目標几何延伸或裁切實體。當前精確支持平面目標。' },
      { id: 'splitface', label: '分割面', icon: 'splitface', tip: 'Fusion Split Face：用平面或曲面工具分割所选面，實體體積保持不變。' },
      { id: 'splitbody', label: '分割實體', icon: 'split', quick: true, tip: '分割實體：用切割平面把一個實體切成两个獨立體（參數化）。' },
      { id: 'silhouettesplit', label: '輪廓分割', icon: 'splitface', tip: 'Fusion Silhouette Split：按所选平面或轴的視圖方向，由輪廓曲线生成曲面，再分割面、抽殼實體或實體。' },
      { id: 'move', label: '移動/複製', icon: 'move', shortcut: 'M', quick: true, sep: true, tip: 'Fusion Move/Copy：平移、自由移動、旋轉或點到點移動實體／組件，並可建立副本。' },
      { id: 'align', label: '對齊', icon: 'combine', tip: '對齊：先点基準面（唔郁嗰件）再点要郁件嘅面 —— 平面貼平 / 圆柱對準同軸。一次性快捷,唔記錄配合；想要持久配合用「關節(揀面)」。' },
      { id: 'delete', label: '刪除', icon: 'trash', tip: '刪除：刪除選中的特徵或組件。' },
      { id: 'remove', label: '移除', icon: 'trash', tip: 'Fusion Remove：从當前設計移除所選組件實例；外部來源設計仍然保留。' },
      { id: 'arrange', label: '排列', icon: 'pattern', sep: true, tip: 'Fusion Arrange：選擇組件、排列平面及包覆面參數，为製造自動排料。' },
      {
        id: 'simplify', label: '簡化', icon: 'scale', tip: 'Fusion Simplify：刪除小特徵／面，或用基本體替换複雜對象。',
        children: [
          { id: 'removefeatures', label: '刪除特徵', icon: 'trash', tip: '自動識別并刪除选定實體上的小孔、圓角、倒角等特徵。' },
          { id: 'removefaces', label: '刪除面', icon: 'trash', tip: '刪除選定面并自動延伸相鄰面来治癒實體。' },
          { id: 'replaceprimitives', label: '使用基本體替換', icon: 'box', tip: '用長方體、圓柱體或球體替换所选對象，並抑制原對象。' },
        ],
      },
      { id: 'vollattice', label: '體積晶格', icon: 'pattern', sep: true, tip: 'Fusion Volumetric Lattice：在封閉實體內部建立體積晶格。' },
      { id: 'voltexture', label: '體積紋理', icon: 'appearance', tip: 'Fusion Volumetric Texture：將體積紋理套用到實體。' },
      { id: 'volmodify', label: '修改體積晶格', icon: 'move', tip: 'Fusion Modify Volumetric Lattice：編輯已有體積晶格特徵。' },
      { id: 'physicalmaterial', label: '物理材質', icon: 'appearance', sep: true, tip: 'Fusion Physical Material：只設密度及物理屬性，影響質量、慣量、FEA 與 BOM；不會改變外觀。' },
      { id: 'appearance', label: '外觀', icon: 'appearance', shortcut: 'A', tip: 'Fusion Appearance：打開外觀材質球面板，修改顏色、金屬度、粗糙度及紋理。' },
      { id: 'managematerials', label: '管理材質', icon: 'appearance', tip: '打開具名外觀材質庫，保存、套用或刪除自訂材質預設。' },
      { id: 'params', label: '更改參數', icon: 'param', sep: true, tip: 'Fusion Change Parameters：打開用戶參數及表達式面板。' },
      { id: 'computeall', label: '全部計算', icon: 'param', shortcut: 'Ctrl+B', tip: 'Fusion Compute All：由時間軸起點重新計算全部特徵。' },
      { id: 'computeunresolved', label: '計算未解析', icon: 'param', tip: 'Fusion Compute Unresolved：只計算與未解析外部組件有關的特徵。' },
      { id: 'convert', label: '轉換', icon: 'component', sep: true, tip: 'Convert / MeshFit：網格組件 → 可編輯 B-rep（自動識別圆柱/棱柱；否则 faceted）。BRep↔T-Spline 仍在實現。亦可搜「meshfit」。' },
      { id: 'bom', label: 'BOM 表', icon: 'drawing', quick: true, sep: true, tip: 'Fusion Bill of Materials：打開此設計的材料清單；WebCAD 可按組件名称、數量、物理材質及質量導出 CSV。' },
    ],
  },
  {
    name: 'CONFIGURE',
    tools: [
      { id: 'params', label: '参数', icon: 'param', quick: true, tip: '用户参数（ƒx 命名变量/表达式，绑定到尺寸，改一处全联动）。' },
    ],
  },
  {
    name: 'CONSTRUCT',
    // Fusion live-capture 次序；每项预设同一个 Construction Geometry 对话框嘅 Type + Method。
    tools: [
      { id: 'ucs', label: '用户坐标系', icon: 'axis', quick: true, tip: 'Fusion User Coordinate System：点实体平面建立一套局部原点、三轴及三正交参考面。' },
      { id: 'datumgeom', label: '构造几何', icon: 'plane', tip: '在一个面板中建立参考平面、构造轴或构造点；适用于圆柱、圆锥等没有可用平面侧面的实体。' },
      { id: 'offsetplane', label: '偏移平面', icon: 'plane', quick: true, sep: true, tip: 'Fusion Offset Plane：先选原点 XY/XZ/YZ 基准面（或中间面），输入距离建立平行参考面；如需由实体平面开始，可在方法选择「偏移面（拾面+距离）」。' },
      { id: 'planeangedge', label: '成角平面', icon: 'plane', tip: 'Fusion Plane at Angle：拾取直边／轴并输入角度，建立包含该边的倾斜平面。' },
      { id: 'planetan', label: '相切平面', icon: 'plane', tip: 'Fusion Tangent Plane：拾取圆柱面及参考方向，在指定位置建立相切平面。' },
      { id: 'planemid', label: '中间平面', icon: 'plane', tip: 'Fusion Midplane：拾取两个平面或平坦面，在两者正中建立参考面。' },
      { id: 'planeperp', label: '垂直平面', icon: 'plane', tip: 'Fusion Perpendicular Plane：拾取平面及参考边，在指定距离建立垂直平面。' },
      { id: 'plane2edge', label: '过两边平面', icon: 'plane', tip: 'Fusion Plane Through Two Edges：顺序拾取两条边，建立同时包含两边的参考面。' },
      { id: 'plane3pt', label: '过三点平面', icon: 'plane', tip: 'Fusion Plane Through Three Points：用最后三个构造点建立参考面。' },
      { id: 'planepath', label: '沿路径平面', icon: 'plane', tip: 'Fusion Plane Along Path：拾取路径并以 0–1 距离定位，建立垂直于路径切向的平面。' },
      { id: 'axiscyl', label: '圆柱／圆锥／环面轴', icon: 'axis', quick: true, sep: true, tip: 'Fusion Axis Through Cylinder/Cone/Torus：拾取旋转面建立其中心轴。' },
      { id: 'axisperpface', label: '垂直面轴', icon: 'axis', tip: 'Fusion Axis Perpendicular To Face：拾取平面上的一点，建立沿面法向的构造轴。' },
      { id: 'axis2planes', label: '过两平面轴', icon: 'axis', tip: 'Fusion Axis Through Two Planes：拾取两个不平行平面，以交线建立构造轴。' },
      { id: 'axis2pt', label: '过两点轴', icon: 'axis', tip: 'Fusion Axis Through Two Points：用最后两个构造点建立任意方向轴。' },
      { id: 'axisedge', label: '沿边轴', icon: 'axis', tip: 'Fusion Axis Through Edge：拾取一条直边，以该边建立构造轴。' },
      { id: 'pointvertex', label: '顶点构造点', icon: 'cpoint', quick: true, sep: true, tip: 'Fusion Point At Vertex：拾取一条边，在最近端点建立构造点。' },
      { id: 'point2edges', label: '两边交点', icon: 'cpoint', tip: 'Fusion Point Through Two Edges：拾取两条边，在交点或最近逼近点建立构造点。' },
      { id: 'point3planes', label: '三平面交点', icon: 'cpoint', tip: 'Fusion Point Through Three Planes：拾取三个平面，在唯一公共交点建立构造点。' },
      { id: 'pointcenter', label: '圆／球／环面中心点', icon: 'cpoint', tip: 'Fusion Point At Center Of Circle/Sphere/Torus：拾取圆形边，在拟合中心建立构造点。' },
      { id: 'pointedgeplane', label: '边与平面交点', icon: 'cpoint', tip: 'Fusion Point At Edge And Plane：拾取边及平面，在交点建立构造点。' },
      { id: 'pointpath', label: '沿路径点', icon: 'cpoint', tip: 'Fusion Point Along Path：拾取路径，以 0–1 比例或毫米距离定位构造点。' },
    ],
  },
  {
    name: 'INSPECT',
    tools: [
      { id: 'measureuni', label: '測量', icon: 'measure', shortcut: 'I', quick: true, tip: 'Fusion Measure：一個命令測量面、邊、點及其組合；顯示長度、面積、角度、最短距離及 ΔXYZ。' },
      { id: 'interference', label: '干涉檢查', icon: 'interference', tip: 'Fusion Interference：先選擇參與檢查的實體或組件，再按 Compute 計算真實重疊體積。' },
      { id: 'curvcomb', label: '曲率梳分析', icon: 'curvature', sep: true, tip: 'Fusion Curvature Comb Analysis：沿曲面显示曲率梳齿，检查曲率变化及接缝连续性。' },
      { id: 'zebra', label: '斑馬紋分析', icon: 'section', tip: 'Fusion Zebra Analysis：以反射條紋檢查曲面切向連續及光順度。' },
      { id: 'draftanalysis', label: '拔模分析', icon: 'draft', tip: 'Fusion Draft Analysis：按脱模方向着色正拔模、倒扣及垂直区域。' },
      { id: 'curvmap', label: '曲率圖分析', icon: 'curvature', tip: 'Fusion Curvature Map Analysis：以色譜顯示曲面彎曲趨勢。' },
      { id: 'accessanalysis', label: '可達性分析', icon: 'draft', tip: 'Fusion Accessibility Analysis：沿指定方向檢查被實體自身遮擋、工具或模具不可達的區域。' },
      { id: 'minradius', label: '最小半徑分析', icon: 'curvature', tip: 'Fusion Minimum Radius Analysis：找出模型最小局部曲率半徑及位置。' },
      { id: 'section', label: '剖切分析', icon: 'section', quick: true, tip: 'Fusion Section Analysis：以可调剖切平面检查实体内部。' },
      { id: 'centerofmass', label: '質心', icon: 'measure', sep: true, tip: 'Fusion Center of Mass：切換顯示實體或裝配的體積加權質心標記。' },
      { id: 'properties', label: '物理屬性', icon: 'measure', tip: 'Fusion Properties：查看所選實體或組件的質量、體積、表面積、重心與材料。' },
      { id: 'meshfacegroups', label: '顯示網格面組', icon: 'draft', sep: true, shortcut: 'Shift+F', tip: 'Fusion Display Mesh Face Groups：切換網格面組顏色顯示。' },
    ],
  },
  {
    name: 'INSERT',
    tools: [
      { id: 'insertcomponent', label: '插入组件', icon: 'component', quick: true, tip: 'Fusion Insert Component：从 STEP/STP 选取零件或装配，作为独立组件插入当前设计；保留多零件的相对位置。当前不建立 Fusion 云端/F3D 的关联链接。' },
      { id: 'insertfastener', label: '插入紧固件', icon: 'component', quick: true, tip: 'Fusion Insert Fastener 工作流：选内建 ISO 紧固件类型、M 规格与长度后插入独立装配组件。几何尺寸真实；螺纹以简化光杆表示，不伪称 Autodesk 云端供应商库。' },
      { id: 'insertmesh', label: '插入STL网格', icon: 'importmesh', quick: true },
      { id: 'insert3mf', label: '插入3MF网格', icon: 'importmesh', quick: true, tip: 'MakerWorld / Printables 下载嘅 3MF 直接导入做组件——多零件保留摆位同颜色，单位自动转 mm。' },
      { id: 'insertobj', label: '插入OBJ网格', icon: 'importmesh', quick: true, tip: 'Wavefront OBJ 网格导入（Blender、扫描或网上模型常用）作参考组件。' },
      { id: 'insertcanvas', label: '画布', icon: 'importmesh', sep: true, tip: 'Fusion Canvas：选择参考图片，放到当前草图平面作为描摹底图；加入后可调宽度、透明度、位置、旋转、翻转及两点标定比例。' },
      { id: 'insertdecal', label: '贴花', icon: 'importmesh', tip: 'Fusion Decal：选择 logo／标签图片，然后点击实体表面放置；可调尺寸、旋转、透明度及翻转，并随项目保存。' },
      { id: 'importdxf', label: '导入DXF', icon: 'importdxf', quick: true, tip: '导入 2D DXF 轮廓并拉伸成 3D（激光切割图 / 网上轮廓 → 可打印实体）。支持 LINE/多段线/圆/圆弧，自动识别外形+孔，拉伸 5mm（时间轴可改）。' },
      { id: 'importsvg', label: '导入SVG', icon: 'importsvg', quick: true, tip: '导入 SVG 矢量图形并拉伸成 3D（logo / 图标 / 网上矢量 → 可打印实体）。曲线自动展平，支持 path/圆/矩形/多边形，自动识别外形+孔，拉伸 5mm（时间轴可改）。' },
    ],
  },
  {
    // Fusion SOLID 组次序（2026-07-02 真截图核证）：CREATE·MODIFY·CONFIGURE·CONSTRUCT·INSPECT·INSERT·ASSEMBLE·SELECT
    name: 'ASSEMBLE',
    tools: [
      { id: 'newcomp', label: '新建組件', icon: 'component', quick: true, tip: '新建組件：在裝配中加一個獨立零件（可單獨移動/隱藏/上色，做關節）。' },
      { id: 'compboolean', label: '組件布爾', icon: 'combine', quick: true, tip: '組件布爾（網格級）：先在瀏覽器選一個組件作目標（未選時若剛好只有一個有幾何組件則用它），再點另一個零件作工具件 → 合併/切除/相交。零件時間軸多體請用「合併/切割」或實驗室「實體布爾」。' },
      { id: 'joint', label: '關節', icon: 'joint', shortcut: 'J', quick: true },
      { id: 'asbuiltjoint', label: '按現狀關節', icon: 'joint', quick: true, tip: 'Fusion As-Built Joint：瀏覽器勾選剛好兩個組件，保持目前位置直接建立關節，不會先移動或吸附組件。預設建立轉動關節；可在關節面板修改類型、軸及限位。' },
      { id: 'jointorigin', label: '關節原點', icon: 'joint', sep: true, tip: 'GM-3DV4 A1（Fusion Joint Origin）：點一個 snap 點（實體面心 / 圓柱孔心 / 頂點）→ 落一個【可複用命名幀】，存喺瀏覽器「關節原點」組。之後建關節時可喺下拉引用之，取代預設「組件中心」錨點 — 精準裝配用。' },
      { id: 'rigidgroup', label: '剛性組', icon: 'joint', tip: 'Fusion Rigid Group：在瀏覽器勾選兩個或以上組件，將它們鎖成一個剛體組；組節點可在瀏覽器或關節面板抑制、恢復或刪除。' },
      { id: 'motionlink', label: '運動連接', icon: 'joint', sep: true, tip: 'Fusion Motion Link：開啟關節面板的運動連接區，為兩個轉動／滑動關節設傳動比（齒輪可用負比反向）。' },
      { id: 'enablecontact', label: '啟用接觸集', icon: 'joint', tip: 'Fusion Enable Contact Sets：切換裝配接觸求解；啟用後驅動關節會在組件發生實體接觸前停止。' },
      { id: 'newcontactset', label: '新建接觸集', icon: 'joint', tip: 'Fusion New Contact Set：在瀏覽器勾選剛好兩個組件，登記為命名接觸對。' },
      { id: 'motionstudy', label: '運動研究', icon: 'joint', sep: true, tip: 'Fusion Motion Study：開啟第一個可驅動關節的動力學設置，設質量、剛度、阻尼及初始位置後求解和播放。' },
      { id: 'drivejoints', label: '驅動關節', icon: 'joint', tip: 'Fusion Drive Joints：展開關節面板，以滑桿、限位、停於接觸及播放控制驅動裝配。' },
    ],
  },
  {
    name: 'SELECT',
    tools: [
      { id: 'select', label: '选择', icon: 'select', quick: true, tip: '选择工具：撳零件/面/边就拣中佢（撳空白处 = 唔拣）；撳 Del 键删除所选。' },
    ],
  },
]

// Fusion 每个 DESIGN tab 都重复同一套 CONFIGURE/CONSTRUCT/INSPECT/INSERT/ASSEMBLE 组（2026-07-02 真截图核证）
// — 其他 tab 直接引用 SOLID 嘅组定义，唔重复维护。
const g = (name: string): Panel => SOLID.find((p) => p.name === name)!

// 🧪實驗室 — webcad 特色功能（Fusion 本体冇；Fusion 生态入面呢类系 Add-in / 独立 workspace）。
// P0 用户确认方案：全部收入呢度，主 ribbon 100% 跟 Fusion；功能一件不失，要用嚟呢度撳。
const LAB: Panel[] = [
  {
    name: 'CREATE 扩充',
    tools: [
      { id: 'facesketch', label: '面上草图', icon: 'sketch', quick: true, tip: 'WebCAD 扩充：直接拾取实体平面进入草图。' },
      { id: 'sweepedge', label: '掃掠(拾邊)', icon: 'sweep', tip: 'WebCAD 扩充：直接拾取实体边链作为扫掠路径。' },
      { id: 'text', label: '文字', icon: 'text', tip: 'WebCAD 扩充：快速建立文字几何。' },
      { id: 'othread', label: '面加螺纹', icon: 'thread', tip: 'WebCAD 扩充：在圆柱面建立真实外螺纹。' },
      { id: 'ithread', label: '内螺纹孔', icon: 'hole', tip: 'WebCAD 扩充：建立真实内螺纹孔。' },
      { id: 'newbody', label: '新实体', icon: 'newbody', tip: 'WebCAD 扩充：泊车当前实体后开始另一实体。' },
    ],
  },
  {
    name: '传动设计',
    tools: [
      {
        id: 'gear', label: '齿轮', icon: 'gear', quick: true, tip: '渐开线正齿轮（β>0=斜齿扭转近似）：设模数/齿数/厚度/孔Ø。分度圆Ø = m×z，20° 压力角。',
        children: [
          { id: 'gear', label: '正齿轮/斜齿轮', icon: 'gear', tip: '渐开线齿轮：β=0 直齿，β>0 斜齿（扭转近似）。' },
          { id: 'worm', label: '蜗杆', icon: 'worm', tip: '蜗杆（ZA 近似形）：模数/头数/长度 — 同蜗轮比 = 头数:齿数（纯运动学）。' },
          { id: 'crowngear', label: '冠齿轮', icon: 'crowngear', tip: '冠齿轮（面齿轮近似形）：垂直轴啮合示意。' },
        ],
      },
      { id: 'gearbox', label: '齿轮箱', icon: 'pattern', quick: true, tip: '齿轮箱向导：输入目标速比 → 自动配好齿数组合 + 精确中心距摆位 + 关节 + 运动连接 —— 确定即可撳 ▷ 睇佢转。' },
      { id: 'rack', label: '齿条', icon: 'rack', tip: '齿条（齿轮齿条机构）：模数同齿轮一致即可啮合。' },
      { id: 'pulley', label: 'V带轮', icon: 'pulley', tip: 'V 带轮（皮带传动）：设外径/宽度/中心孔，带 V 形槽。' },
    ],
  },
  {
    name: '机构',
    tools: [
      { id: 'fourbar', label: '四连杆机构', icon: 'joint', quick: true, tip: '平面四连杆闭环机构：拖曲柄角→连杆/摇杆约束求解联动（杆长刚性）。' },
      { id: 'slidercrank', label: '滑块曲柄', icon: 'joint', tip: '滑块曲柄机构（活塞）：曲柄转→活塞往复直线（行程=2×曲柄半径），如引擎活塞。' },
      { id: 'sixbar', label: '六杆机构', icon: 'joint', tip: '六杆机构：曲柄转 → 输出点行出一条复杂嘅耦合曲线。可撳「📈轨迹」描出佢行经嘅路径。' },
    ],
  },
  {
    name: '仿真',
    tools: [
      { id: 'fea', label: '受力云图', icon: 'stress', quick: true, tip: '受力分析（趋势级）：点固定面 → 点受力面 → 设力 → 出应力云图,红色 = 最受力 = 最容易断嘅位。属趋势着色,非商用分析精度。' },
      { id: 'moldflow', label: '模流分析', icon: 'moldflow', quick: true, tip: '注塑模流趋势：点浇口位（可多个）→ 选塑料 → 出充填时间/压力/冷却/变形趋势云图 + 焊接线 + 充填动画。可开「压力求解器」出真实压力值。' },
      { id: 'windtunnel', label: '风洞水洞', icon: 'wind', quick: true, tip: '风洞 / 水洞趋势模拟：把零件放入虚拟风道/水道解流场 → 风阻系数 Cd + 阻力 + 表面压力/流场。可调风速 · 流体(空气/水) · 吹向。属趋势级,相对比较可信,非商用验证级。' },
      { id: 'physicslab', label: '環境實驗室', icon: 'joint', quick: true, tip: 'Physics Lab：將 CAD 零件放入剛體實驗室，即時模擬重力、碰撞、摩擦、反彈和統一風。互動級模擬，非工程認證。' },
    ],
  },
  {
    name: '制造 CAM',
    tools: [
      { id: 'finish3d', label: '3D加工', icon: 'cam', quick: true, tip: '3D 加工刀路（需活动实体 / MeshFit 后的 B-rep）：精加工球头平行 / 粗加工逐层挖槽。仅趋势级预览与 G-code 导出——非完整制造工作区、无刀库/夹具/真机。纯网格组件请先转 B-rep。' },
    ],
  },
  {
    name: '3D打印',
    tools: [
      { id: 'overhang', label: '悬垂分析', icon: 'overhang', quick: true, tip: '3D 打印悬垂分析：标出需要支撑嘅朝下斜面（>45°），报支撑面积 % + 建议最省支撑打印朝向。' },
      { id: 'autoorient', label: '自动摆正', icon: 'overhang', tip: '一键把零件旋转到最省支撑嘅打印朝向（悬垂分析嘅建议方向），加一个可撤销嘅变换特征。' },
      { id: 'wallcheck', label: '壁厚检查', icon: 'wallcheck', tip: '3D 打印壁厚检查：射线量度局部壁厚，标出 < 0.8mm 嘅薄壁（橙色高亮）+ 报最薄值。采样近似。' },
      { id: 'slicepreview', label: '切层预览', icon: 'section', tip: '3D 打印切层预览：逐层试切实体，标出悬空孤岛（悬垂分析睇唔到嘅浮空区，需支撑）+ 首层接触面积 + 最薄层 + 唔水密轮廓。' },
      { id: 'stack', label: '堆叠', icon: 'component', sep: true, tip: '垂直堆叠：所有可见组件自底向上叠放（每件坐喺下件顶面）— 层叠件/托盘。' },
      { id: 'arrangebed', label: '排版', icon: 'component', tip: '排版到打印床：所有可见件平铺地面、互不重叠、全部落地 — 多件 3D 打印备料。' },
      { id: 'dropall', label: '全落地', icon: 'component', tip: '全部落地：每个可见件各自下移到 Z=0（XZ 不变）— 散件归地。' },
    ],
  },
  {
    name: '更多基元',
    tools: [
      { id: 'cone', label: '圆锥', icon: 'cylinder', quick: true, tip: '圆锥/圆台：设底Ø/顶Ø(0=尖锥)/高，边数≥3 变 N 棱锥/棱台。' },
      { id: 'tube', label: '圆管', icon: 'cylinder', quick: true, tip: '圆管/衬套：设外径Ø/壁厚/高建空心管。' },
      { id: 'rbox', label: '圆角盒', icon: 'box', quick: true, tip: '圆角长方体/外壳盒：长方体四条竖边倒圆角。电子外壳常用。' },
      { id: 'wedge', label: '楔形', icon: 'box', tip: '楔形/斜坡：设长/宽/高建一端高、另一端削平的三角块。' },
      { id: 'dome', label: '圆顶', icon: 'sphere', tip: '圆顶/半球：设直径建半球；冠高<半径 出浅球冠（镜片/表镜/按钮）。' },
      { id: 'halfcyl', label: '半圆柱', icon: 'cylinder', tip: '半圆柱/D 形：圆柱切一半（D 形截面）。D 形轴/D 孔常用。' },
      { id: 'pie', label: '扇形柱', icon: 'cylinder', tip: '扇形柱/饼块：圆盘的一块扇形（设直径/角度/高）。' },
      { id: 'rtube', label: '方管', icon: 'box', tip: '矩形空心管/方通(RHS)：设截面宽×深/壁厚/长。框架/横梁常用。' },
      { id: 'profile', label: '型材', icon: 'box', tip: '结构型材：L 角铁 / U 槽钢 / T 型材（设截面宽×高/壁厚/长）。' },
      { id: 'pyramid', label: '棱锥', icon: 'cylinder', tip: '多边形棱锥：设边数/底外接Ø/高，底多边形收到顶尖。' },
      { id: 'prism', label: '棱柱', icon: 'box', tip: '正多边形棱柱：设边数/外接圆Ø/高建六角柱等。' },
    ],
  },
  {
    name: '装配辅助',
    tools: [
      { id: 'explodeview', label: '爆炸视图', icon: 'component', quick: true, tip: '爆炸视图：沿装配中心向外展开组件（滑杆调爆炸度），睇装配关系。' },
      { id: 'xray', label: '透视', icon: 'appearance', tip: 'X-ray 透视：全部组件半透明，睇装配内部（轴承滚珠/行星轮）。' },
      { id: 'scaleasm', label: '整体缩放', icon: 'move', tip: '整体缩放装配：按比例放大/缩小成个多件设计（含相对间距，绕装配中心）。' },
    ],
  },
  {
    name: '工具',
    tools: [
      { id: 'calc', label: '工程计算', icon: 'calc', quick: true, tip: '工程计算器：螺纹/配合/齿轮/皮带/弹簧/轴承/折弯 等 14 个机械设计速算。' },
    ],
  },
  {
    name: '直接编辑扩展',
    tools: [
      { id: 'moveface', label: '移动面', icon: 'replaceface', quick: true, tip: 'WebCAD 扩展：偏移或倾斜平面面，内核重解相邻面。' },
      { id: 'filletall', label: '全棱圆角', icon: 'fillet', tip: 'WebCAD 扩展：对实体全部边一次应用相同圆角。' },
      { id: 'chamferall', label: '全棱倒角', icon: 'chamfer', tip: 'WebCAD 扩展：对实体全部边一次应用相同倒角。' },
      { id: 'delface', label: '删面治愈', icon: 'presspull', tip: 'WebCAD 扩展：删除所选面并尝试延伸邻面治愈实体。' },
      { id: 'offsetsolid', label: '整体偏移', icon: 'scale', tip: 'WebCAD 扩展：均匀外扩或内缩实体全部面。' },
      { id: 'cylpatch', label: '圆柱曲面贴花', icon: 'cylpatch', tip: 'WebCAD 扩展：在圆柱面建立凸台、凹槽或平面。' },
      { id: 'splitplane', label: '任意平面切', icon: 'split', tip: 'WebCAD 扩展：拾取任意平面参数化分割实体。' },
      { id: 'splitsketch', label: '草图轮廓分割', icon: 'split', tip: 'WebCAD 扩展：用封闭草图轮廓贯穿分割实体。' },
      { id: 'bodyboolean', label: '实体布尔', icon: 'combine', tip: 'WebCAD 扩展：活动实体与泊车实体进行并集、切除或相交。' },
      { id: 'compboolean', label: '組件布爾', icon: 'combine', tip: 'WebCAD 擴展：兩組件網格級布爾（manifold）。先選目標組件再點工具件；零件內多體用上方「實體布爾」/ SOLID「合併/切割」。' },
    ],
  },
  {
    name: '檢查擴展',
    tools: [
      { id: 'measure', label: '兩點距離', icon: 'measure' },
      { id: 'measureedge', label: '邊長／孔徑', icon: 'measure' },
      { id: 'measureface', label: '面積', icon: 'measure' },
      { id: 'measureangle', label: '面夾角', icon: 'measure' },
      { id: 'properties', label: '完整物理屬性', icon: 'measure', quick: true, tip: '面積、密度、質量、體積、包圍盒、質心及慣量的詳細對話框。' },
      { id: 'gausscurv', label: '高斯曲率', icon: 'curvature' },
      { id: 'kmaxcurv', label: '最大主曲率', icon: 'curvature' },
      { id: 'kmincurv', label: '最小主曲率', icon: 'curvature' },
      { id: 'slopeanalysis', label: '斜度分析', icon: 'draft' },
    ],
  },
  {
    name: '构造扩展',
    tools: [
      { id: 'datumgeom', label: '统一构造几何', icon: 'plane', quick: true, tip: 'WebCAD 扩展入口：在同一个面板切换平面／轴／点及全部方法。' },
      { id: 'planeparpt', label: '过点平行面', icon: 'plane', tip: '以最后一个构造点及所拾平面建立平行参考面。' },
      { id: 'caxis', label: '方向构造轴', icon: 'axis', tip: '以 X／Y／Z 方向及指定坐标建立构造轴。' },
      { id: 'cpoint', label: '坐标构造点', icon: 'cpoint', tip: '输入 X／Y／Z 坐标建立构造点。' },
      { id: 'midcpoint', label: '两点中点', icon: 'cpoint', tip: '在最后两个构造点正中建立新构造点。' },
      { id: 'cptgrid', label: '构造点阵列', icon: 'cpoint', tip: '一次建立矩形或极坐标构造点阵列。' },
      { id: 'projsurf', label: '投影到圆柱面', icon: 'axis', tip: '把平面草图路径按弧长映射到可展圆柱面，产生 3D 参考曲线。' },
    ],
  },
]

// The other workspace tabs reuse the SOLID kernel's real, working commands (no hollow "即将推出"
// buttons). Each tab groups the existing tools most relevant to that discipline. We don't yet have a
// dedicated surface/sheet-metal modeller — these reuse SOLID ops (documented honestly in DEVLOG).
const SURFACE: Panel[] = [
  { name: 'CREATE', tools: [
    { id: 'sketch', label: '建立草圖', icon: 'sketch', quick: true },
    { id: 'surfloft', label: '曲面放樣', icon: 'loft', quick: true },   // T792：SURFACE tab 第一個真曲面命令（开放截面 → 薄壳）
    { id: 'surfextrude', label: '曲面拉伸', icon: 'extrude', quick: true, tip: '曲面拉伸：把当前草图截面沿法向拉成一张【零厚曲面】—— 开放折线 → 曲面片；闭合轮廓 → 无盖嘅管壳（圆 → 圆柱面）。出独立曲面体（想变实体再用「加厚」/「縫合」）。' },
    { id: 'ruled', label: '規則曲面', icon: 'loft', quick: true, tip: '規則曲面：喺 ≥2 张【不同高度嘅开放折线草图】之间,用直线连起对应点、扫出一张零厚曲面。先画开放折线 → 完成草图 → 换高度再画 → 撳此。出独立曲面体（想变实体再「加厚」/「縫合」）。注：呢种片冇壁厚（想要壁厚用「曲面放樣」）。' },
    { id: 'surfsweep', label: '曲面掃掠', icon: 'sweep', quick: true, tip: '曲面掃掠：开放截面沿你画的开放路径扫成零厚开放曲面（风道/导流板/管壁皮）。先画开放折线截面 → 完成草图 → 再画一条开放折线路径 → 撳此。出独立曲面体（要实体再「加厚」/「縫合」）。' },
    { id: 'surfrevolve', label: '曲面旋轉', icon: 'revolve', quick: true, tip: '曲面旋轉：开放截面绕轴旋成零厚旋转曲面（灯罩/喷嘴/花瓶皮/涡轮毂），无需先做实体再壳。先画开放折线截面 → 撳此 → 输角度,轴(Y/X)。出独立曲面体（要实体再「加厚」/「縫合」）。' },
    { id: 'surfpatch', label: '補面 Patch', icon: 'loft', quick: true, tip: '補面 Patch：喺实体表面/空间顺序点 ≥3 个点、圈出一个闭合边界 → 填充成曲面 + 加厚成薄板。補洞 / 加蒙皮 / 驳面时用。' },
    { id: 'surfbridge', label: '橋接面', icon: 'loft', quick: true, tip: '橋接：点选 2 条现有棱（实体 / 泊车曲面）→ 喺两棱之间起一张光滑过渡面,可加厚。想驳通两条边、封个缺口时用。' },
    { id: 'boundarypatch', label: '邊界補面', icon: 'loft', quick: true, tip: '邊界補面：拾几条【现有棱】（实体/泊车曲面上）填补一个多边洞 / 封口,可勾相切令接边顺滑；出【曲面体】。先有个带缺口嘅实体/曲面 → 撳此 → 逐条点选边界棱（≥2）→ 可勾相切 / 设加厚 → 确定。' },
    { id: 'thicken', label: '加厚 Thicken', icon: 'shell', quick: true, tip: '加厚：点实体/曲面一个面 → 沿法向加厚成实体薄板（曲面件转成可打印实体 / 加厚单一面）。出独立件,想合并用「实体布尔」。方向：板厚输负值、或前缀「-」= 翻转、朝另一边加厚。' },
    { id: 'thickenquilt', label: '加厚整張曲面', icon: 'shell', quick: true, tip: '加厚整張曲面：拣一张【完整泊车曲面/縫合面】（放樣/掃掠/旋轉/縫合/補面出嘅）→ 成张一次过加厚成实体（唔似「加厚」净加单一拾取面）。曲面变实体最常用嘅一步。板厚输负值 = 朝另一边。' },
    { id: 'offsetsurf', label: '偏移曲面', icon: 'loft', tip: '偏移曲面：点一个面 → 偏出一张平行嘅新曲面（正 = 外偏 / 负 = 内偏）。两侧：距离用 ±（如 ±5）= 一次出内外两张平行面（关于原面对称）。出独立开放曲面件。' },
    { id: 'splitface', label: '分割面', icon: 'splitface', tip: '分割面：点一个面 → 喺点击处用一个垂直平面把佢切成两半（体积不变,两块子面可各自单独拣/着色/拔模）。' },
    { id: 'replaceface', label: '替換面', icon: 'replaceface', tip: '替换面（平面顶替）：点一个面 → 输入推入距离 → 把该面沿法向推去一个新位置,邻面自动延伸接返顺。诚实局限：只做平面顶替（唔支持任意曲面替换）。' },
    { id: 'rotateface', label: '旋轉面', icon: 'replaceface', tip: '旋轉面：点一个【平面】→ 输入铰轴(X/Y/Z) + 角度 → 该面绕住经过点击点嘅铰线倾斜,邻面自动癒合成梯形（实体保留）。改导入件/斜面角度用。仅限平面。' },
    { id: 'surfsew', label: '縫合 Stitch', icon: 'shell', quick: true, tip: '縫合 Stitch：把现有所有曲面/壳片（放樣/補面/加厚/偏移出嘅）沿住共用边焊埋成一个壳；若完全封闭 → 自动转成实体（可继续布尔/导出/打印）。' },
    { id: 'surfunstitch', label: '取消縫合', icon: 'shell', tip: '取消縫合：把縫好嘅壳拆返做逐张独立面（縫合嘅相反操作）,方便单独編輯/删除某一张面。' },
    { id: 'surftrim', label: '平面裁剪', icon: 'shell', tip: '平面裁剪：用一个平面把曲面壳裁走一边、留返另一半。①轴对齐：输 XY/XZ/YZ, 偏移, 保留边；②任意平面：输 原点x,y,z, 法向x,y,z[,保留边]（如 0,0,10,1,0,1,+ = 斜平面裁）。单张散面要先「縫合」成壳。' },
    { id: 'surfsurftrim', label: '曲面裁剪', icon: 'shell', tip: '曲面裁剪：用【另一张曲面】或【活动实体】做裁刀,沿交线把目标曲面切成几片 → 喺目标上点你要【保留】嗰一边/区域。先有两张相交曲面（或一张曲面穿过实体）→ 撳此 → 选目标 + 裁刀 → 喺目标上点保留边。' },
    { id: 'untrim', label: '去裁/還原', icon: 'shell', tip: '去裁 / 還原：点一个泊车曲面 → 丢弃佢嘅裁剪边界、还原返底层曲面嘅完整原始范围（补返被裁走嘅整片,再重新裁）。裁剪嘅相反操作。' },
    { id: 'intersectcurve', label: '相交曲線', icon: 'shell', tip: '相交曲線：把所有体（活动实体 + 泊车曲面/壳）两两求交,沿交线抽出 3D 参考曲线（青色实线,随项目存档）。想量两曲面点接 / 起截面草图 / 接面参考时用。冇相交就唔变；再撳「清相交曲線」清除。' },
    { id: 'clearintersect', label: '清相交曲線', icon: 'shell', tip: '清除全部相交曲線。' },
    { id: 'mergefaces', label: '合併面', icon: 'shell', tip: '合并面 Merge / Unify Same-Domain：点一个泊车曲面/壳 → 把同域（共面 / 共柱）相邻碎面合并成一张面（裁剪 / 縫合 / 导入后清噪、易拾、STEP 更小）。体积不变，纯拓扑合并。曲面分割的逆向清理。' },
    { id: 'extendface', label: '曲面延伸', icon: 'extrude', tip: '曲面延伸：点一个曲面/面 → 沿佢自然形状向外延长指定 mm（平面变大 / 圆柱面变长 / 曲面顺势外推）。出独立曲面件,驳面前补料用。注：圆柱会沿缝拆面,只延伸你点中嗰半面。' },
    { id: 'formbox', label: 'Form 盒', icon: 'box', quick: true },      // T793：Form-lite 细分建模（拖控制點捏有机形）
    { id: 'formcyl', label: 'Form 圓柱', icon: 'box', tip: 'Form 圓柱：由一个圆柱控制籠开始 → 拖控制點捏成 瓶/握把/有机柱。周向段数越多,越贴近你输入嘅半径（细分会向内略收）。✔ 完成后烘焙成网格组件。' },
    { id: 'formplane', label: 'Form 平面', icon: 'box', tip: 'Form 平面/薄片：由一块薄盒控制籠开始 → 拖控制點拉出有机曲面/壳片（座椅/翼面/外壳曲面）。✔ 完成后烘焙成网格组件。' },
    { id: 'formsphere', label: 'Form 球', icon: 'box', tip: 'Form 球：由一个球控制籠开始 → 拖控制點捏成 液滴/头形/有机球。段数越多,越贴近你输入嘅半径（细分会向内略收）。✔ 完成后烘焙成网格组件。' },
    { id: 'formtorus', label: 'Form 環面', icon: 'box', tip: 'Form 環面/甜甜圈：由一个环形控制籠开始 → 拖控制點捏成 把手/O 形/扭环。主半径 > 管半径。✔ 完成后烘焙成网格组件。' },
    { id: 'formpatch', label: 'Form 曲面片', icon: 'box', tip: 'Form 开放曲面片：真·开放嘅有机曲面（车身板/外壳/有机曲面主用）—— 唔似 Form 平面嗰个薄盒,呢个系一张真开放网格,边界自动顺滑、四角钉死 → 拖蓝点捏出平滑开放曲面。✔ 完成后烘焙成曲面网格（开放、非封闭）。' },
    { id: 'editpoles', label: '編輯曲面控制點', icon: 'editpoles', quick: true, tip: '編輯曲面控制點：点一个灰显泊车曲面 → 显示佢嘅控制點球 → 拖三轴箭嘴就整体扭曲张曲面。诚实局限：目前只支持单张曲面；跨缝顺滑接驳后续再做。先用「規則曲面/曲面放樣」整一张弯曲曲面。' },
    { id: 'extrude', label: '拉伸', icon: 'extrude', quick: true },
    { id: 'revolve', label: '旋轉', icon: 'revolve', quick: true },
    { id: 'sweep', label: '掃掠', icon: 'sweep', quick: true },
    { id: 'loft', label: '放樣', icon: 'loft', quick: true },
    { id: 'pipe', label: '管道', icon: 'pipeicon' },
  ] },
  { name: 'MODIFY', tools: [
    { id: 'reversesurf', label: '翻轉曲面', icon: 'shell', quick: true, tip: '翻轉曲面：拣一张泊车曲面 → 掉转佢嘅正反面（法向反向）。当「加厚」/「縫合」加错咗边时用嚟修正方向。纯翻向,唔重建几何。' },
    { id: 'presspull', label: '加厚/按拉', icon: 'presspull', quick: true },
    { id: 'splitbody', label: '分割', icon: 'split', quick: true },
    { id: 'combine', label: '合併/切割', icon: 'combine', quick: true },
  ] },
  g('CONFIGURE'), g('CONSTRUCT'), g('INSPECT'), g('INSERT'), g('ASSEMBLE'),
  { name: 'SELECT', tools: [{ id: 'select', label: '選擇', icon: 'select', quick: true, tip: '選擇工具：撳零件/面/边就拣中佢（撳空白处 = 唔拣）；撳 Del 键删除所选。' }] },
]
const MESH: Panel[] = [
  { name: 'CREATE', tools: [
    { id: 'box', label: '長方體', icon: 'box', quick: true },
    { id: 'cylinder', label: '圓柱', icon: 'cylinder', quick: true },
    { id: 'sphere', label: '球', icon: 'sphere', quick: true },
  ] },
  { name: 'MODIFY', tools: [
    { id: 'meshfit', label: 'MeshFit / 轉 B-rep', icon: 'component', quick: true, tip: 'MeshFit：把所选（或唯一／最近导入）網格組件缝合为可編輯 B-rep 實體（平面/圆柱可參數化；其余 faceted）。完成后可圓角/抽殼/布尔/導出 STEP。有机扫描件可能仅 faceted。' },
    { id: 'compboolean', label: '組件布爾', icon: 'combine', quick: true, tip: '組件布爾（網格級）：先選目標組件（或唯一有幾何組件），再點工具件 → 合併/切除/相交。亦可在 SOLID → ASSEMBLE 找到同名工具。' },
    { id: 'convert', label: '轉換', icon: 'component', tip: 'Fusion Convert：網格→B-rep（同 MeshFit）。BRep↔T-Spline 仍在實現。' },
  ] },
  g('CONFIGURE'), g('CONSTRUCT'), g('INSPECT'),
  { name: 'INSERT', tools: [
    { id: 'insertmesh', label: '插入STL网格', icon: 'importmesh', quick: true, tip: '插入 STL 网格（Alt+O / File→导入）。也可将 .stl/.obj/.3mf 拖到视口导入（推荐）。导入后可用 MeshFit / 转 B-rep。' },
    { id: 'insert3mf', label: '插入3MF网格', icon: 'importmesh', quick: true, tip: 'MakerWorld / Printables 下载嘅 3MF 直接导入做组件——多零件保留摆位同颜色，单位自动转 mm。' },
    { id: 'insertobj', label: '插入OBJ网格', icon: 'importmesh', quick: true, tip: 'Wavefront OBJ 网格导入（Blender / 扫描 / 网上模型常用）作参考组件。' },
  ] },
  g('ASSEMBLE'),
  { name: 'SELECT', tools: [{ id: 'select', label: '选择', icon: 'select', quick: true, tip: '选择工具：撳零件/面/边就拣中佢（撳空白处 = 唔拣）；撳 Del 键删除所选。' }] },
  { name: 'EXPORT', tools: [
    { id: 'exportstl', label: '导出STL', icon: 'exportfile', quick: true },
    { id: 'exportasmstl', label: '导出装配STL', icon: 'exportfile' },
    { id: 'exportasmobj', label: '导出装配OBJ', icon: 'exportfile', tip: '把整个装配（含各零件位姿）导出为单一 OBJ，供 Blender / 渲染器 / 游戏引擎用。' },
    { id: 'exportasm3mf', label: '导出装配3MF', icon: 'exportfile', tip: '装配 → 多对象 3MF：各零件独立对象，直接送切片软件分件摆位打印（比合并 STL 更好）。' },
    { id: 'exportasmstep', label: '导出装配STEP', icon: 'exportfile', tip: '装配 → 彩色 STEP：零件名 + 颜色 + 位姿全保留,Fusion/FreeCAD/SolidWorks 直接打开。纯网格导入件会跳过（冇精确实体来源）。' },
    { id: 'exportglb', label: '导出glTF/GLB', icon: 'exportfile' },
    { id: 'exportobj', label: '导出OBJ', icon: 'exportfile', tip: 'Wavefront OBJ 网格（通用 3D 交换格式，Blender / 游戏引擎 / 渲染器常用）。' },
    { id: 'export3mf', label: '导出3MF', icon: 'exportfile', tip: '3MF 现代 3D 打印格式（保留 mm 单位，Bambu Studio / PrusaSlicer / Cura 都支持，比 STL 更准）。' },
  ] },
]
const SHEET: Panel[] = [
  { name: 'CREATE', tools: [
    { id: 'sheetmetal', label: '鈑金件', icon: 'sheetmetal', quick: true },
    { id: 'sketch', label: '建立草圖', icon: 'sketch', quick: true },
    { id: 'extrude', label: '薄板/法蘭(拉伸)', icon: 'extrude', quick: true },
    { id: 'box', label: '長方體', icon: 'box' },
  ] },
  { name: 'MODIFY', tools: [
    { id: 'shell', label: '抽殼(成薄壁)', icon: 'shell', quick: true },
    { id: 'fillet', label: '折彎圓角', icon: 'fillet', quick: true },
    { id: 'chamfer', label: '倒角', icon: 'chamfer' },
    { id: 'mirror', label: '鏡像', icon: 'mirror' },
    { id: 'pattern', label: '陣列', icon: 'pattern' },
  ] },
  g('CONFIGURE'), g('CONSTRUCT'), g('INSPECT'), g('INSERT'), g('ASSEMBLE'),
  { name: 'SELECT', tools: [{ id: 'select', label: '選擇', icon: 'select', quick: true, tip: '選擇工具：撳零件/面/边就拣中佢（撳空白处 = 唔拣）；撳 Del 键删除所选。' }] },
  { name: 'EXPORT', tools: [{ id: 'exportflatdxf', label: '導出展開DXF', icon: 'exportfile', quick: true, tip: '把鈑金件展開成平料 DXF（含 K 因子折彎餘量 + BEND 折彎線图层），直接激光下料。' }, { id: 'exportstep', label: '導出STEP', icon: 'exportfile' }, { id: 'exportstl', label: '導出STL', icon: 'exportfile', tip: '導出二进制 STL（3D 打印通用）。' }, { id: 'exportstlascii', label: '導出STL(ASCII)', icon: 'exportfile', tip: 'ASCII 文本格式 STL（部分旧切片器/CAM/调试用，可读）。' }] },
]
const PLASTIC: Panel[] = [
  { name: 'CREATE', tools: [
    { id: 'sketch', label: '建立草圖', icon: 'sketch', quick: true },
    { id: 'extrude', label: '拉伸', icon: 'extrude', quick: true },
    { id: 'rib', label: '加強筋', icon: 'rib', quick: true },
    { id: 'box', label: '長方體', icon: 'box' },
    { id: 'hole', label: '孔/Boss', icon: 'hole' },
  ] },
  { name: 'MODIFY', tools: [
    { id: 'shell', label: '抽殼', icon: 'shell', quick: true },
    { id: 'draft', label: '拔模', icon: 'draft', quick: true },
    { id: 'fillet', label: '圓角', icon: 'fillet', quick: true },
    { id: 'chamfer', label: '倒角', icon: 'chamfer' },
  ] },
  g('CONFIGURE'), g('CONSTRUCT'), g('INSPECT'), g('INSERT'), g('ASSEMBLE'),
  { name: 'SELECT', tools: [{ id: 'select', label: '選擇', icon: 'select', quick: true, tip: '選擇工具：撳零件/面/边就拣中佢（撳空白处 = 唔拣）；撳 Del 键删除所选。' }] },
]
const MANAGE: Panel[] = [
  { name: 'PARAMETERS', tools: [{ id: 'params', label: '参数', icon: 'param', quick: true }] },
  { name: 'DRAWING', tools: [
    { id: 'drawing', label: '工程圖', icon: 'drawing', quick: true },
    { id: 'asmdrawing', label: '裝配工程圖', icon: 'drawing', quick: true, tip: '裝配三視圖 + 氣泡編號 + BOM 表（組件網格投影：輪廓+特徵邊）。需先有可見組件。' },
  ] },
]
// Fusion UTILITIES：MAKE · NEST · ADD-INS · UTILITY · INSPECT · SELECT。MAKE（3D 打印/送出）↔ 我哋嘅导出组。
const UTILITIES: Panel[] = [
  { name: 'MAKE', tools: [
    { id: 'exportstl', label: '导出STL', icon: 'exportfile', quick: true },
    { id: 'exportstep', label: '导出STEP', icon: 'exportfile', quick: true },
    { id: 'exportglb', label: '导出glTF', icon: 'exportfile' },
  ] },
  g('INSPECT'),
  { name: 'SELECT', tools: [{ id: 'select', label: '选择', icon: 'select', quick: true, tip: '选择工具：撳零件/面/边就拣中佢（撳空白处 = 唔拣）；撳 Del 键删除所选。' }] },
]

// Contextual SKETCH tab (Fusion: entering a sketch appends an active "SKETCH" tab with sketch tools +
// a green FINISH SKETCH check). ids are sk_* and routed by store.runCommand → setSketchTool / sketch ops.
// Fusion FORM contextual workspace, verified against the live desktop build.
// CREATE item order mirrors the native dropdown; unavailable T-spline operations stay visible but
// report their current implementation status instead of silently running a different command.
export const FORM_PANELS: Panel[] = [
  { name: 'CREATE', tools: [
    { id: 'formsketch', label: '建立草圖', icon: 'sketch', quick: true },
    { id: 'formbox', label: '長方體', icon: 'box', quick: true },
    { id: 'formplane', label: '平面', icon: 'plane', quick: true },
    { id: 'formcyl', label: '圓柱', icon: 'cylinder', quick: true },
    { id: 'formsphere', label: '球', icon: 'sphere', quick: true },
    { id: 'formtorus', label: '圓環', icon: 'torus' },
    { id: 'formquadball', label: '四邊形球體', icon: 'sphere' },
    { id: 'formpipe', label: '管道', icon: 'pipeicon' },
    { id: 'formface', label: '面', icon: 'plane', sep: true },
    { id: 'formextrude', label: '拉伸', icon: 'extrude', sep: true },
    { id: 'formrevolve', label: '旋轉', icon: 'revolve' },
    { id: 'formsweep', label: '掃掠', icon: 'sweep' },
    { id: 'formloft', label: '放樣', icon: 'loft' },
  ] },
  { name: 'MODIFY', tools: [
    { id: 'formedit', label: '編輯造型', icon: 'move', quick: true },
    { id: 'formsubdiv', label: '細分', icon: 'param', quick: true, tip: '細分：提高控制籠細分級（1–3）。預覽即時圓滑；完成造型時烘焙。' },
    { id: 'formloop', label: '插入邊', icon: 'offset', quick: true },
    { id: 'formcrease', label: '折痕', icon: 'chamfer', tip: '折痕：折硬所選 cage 面四邊（細分時棱角企硬）。再執行可取消。' },
    { id: 'formbridge', label: '橋接', icon: 'loft', tip: '橋接（FORM T-spline）：尚未支援 — 請用實體/曲面「橋接面」對實體棱。' },
    { id: 'formweld', label: '焊接', icon: 'combine', tip: '焊接（FORM 頂點）：尚未支援。' },
    { id: 'formfillhole', label: '填補孔', icon: 'loft', tip: '填補孔（FORM）：尚未支援。' },
    { id: 'formerasefill', label: '擦除並填充', icon: 'delface', tip: '擦除並填充：尚未支援。' },
  ] },
  { name: 'SYMMETRY', tools: [
    { id: 'formsymmetry', label: '造型對稱', icon: 'mirror', quick: true },
    { id: 'formmirror', label: '鏡像', icon: 'mirror' },
  ] },
  { name: 'UTILITIES', tools: [
    { id: 'formrepair', label: '修復實體', icon: 'param', quick: true },
  ] },
  { name: 'CONSTRUCT', tools: [
    { id: 'offsetplane', label: '偏移平面', icon: 'plane', quick: true },
  ] },
  { name: 'INSPECT', tools: [
    { id: 'measureuni', label: '測量', icon: 'measure', quick: true },
  ] },
  { name: 'INSERT', tools: [
    { id: 'forminsert', label: '插入網格', icon: 'insert', quick: true },
  ] },
  { name: 'SELECT', tools: [
    { id: 'select', label: '選擇', icon: 'select', quick: true },
  ] },
]

export const SKETCH_PANELS: Panel[] = [
  {
    name: 'CREATE',
    tools: [
      { id: 'sk_polyline', label: '直線', icon: 'sketch', glyph: '╱', shortcut: 'L', quick: true, tip: '直线/折线：连续点击画多段相连直线,回到起点或撳「闭合」成轮廓。画紧嗰阵撳 A 键 = 喺 直线 / 相切弧 之间切换（可以直线接弧再接直线）。打数字 = 精确长度；方向自动吸 水平/竖直/45°/平行/垂直。靠近圆会吸住圆嘅【象限点（上下左右最远点）】,由上一点拉向圆会吸住【切点】令该段同圆相切。' },
      { id: 'sk_mline', label: '中點線', icon: 'sketch', glyph: '┿', tip: '中点线（Fusion Midpoint Line）：第一点 = 中点，第二点 = 一端 → 由中点向两端对称嘅直线段（做对称基准/中心参照）。打数字 = 全长。' },
      { id: 'sk_rect', label: '矩形', icon: 'box', glyph: '▭', shortcut: 'R', quick: true, tip: '两点矩形：点两个对角点。打 宽 → Tab → 高 → Enter 精确尺寸。' },
      { id: 'sk_crect', label: '中心矩形', icon: 'box', glyph: '⊞', quick: true, tip: '中心矩形：先点中心，再点角点（关于中心对称）。' },
      { id: 'sk_circle', label: '圓', icon: 'cylinder', glyph: '◯', shortcut: 'C', quick: true, tip: '圆心 + 半径。打数字=精确半径。' },
      { id: 'sk_circle2p', label: '兩點圓', icon: 'cylinder', glyph: '⊘', tip: '两点圆（直径两端）：点直径嘅两端两点定圆（第二点定直径与方向）。打数字=精确直径 Ø。' },
      { id: 'sk_circle3', label: '三點圓', icon: 'cylinder', glyph: '◓', tip: '三点圆：点三点定圆（外接圆）— 对齐已有特征/孔位方便。' },
      { id: 'sk_circle2t', label: '兩切點圓', icon: 'cylinder', glyph: '◑', tip: '两切点圆：点 2 条直线边 + 设半径 → 画一个同两条边都相切嘅圆（自动加相切约束）。你点边嗰一侧 = 圆落嗰一侧。' },
      { id: 'sk_circle3t', label: '三切點圓', icon: 'cylinder', glyph: '◒', tip: '三切点圆：点 3 条直线边 → 画一个同三条边都相切嘅圆（内切圆/旁切圆,位置按你点击嘅一侧自动定）。' },
      { id: 'sk_arc', label: '圓弧', icon: 'revolve', glyph: '⌒', shortcut: 'A', quick: true, tip: '三点圆弧：起点 → 终点 → 弧上一点（闭合成弓形）。' },
      { id: 'sk_arcc', label: '中心點弧', icon: 'revolve', glyph: '◠', tip: '中心点圆弧（Fusion 同款）：圆心 → 起点（定半径）→ 终点（定弧长，取短向）。真圆弧，可标 R/相切。' },
      { id: 'sk_tanarc', label: '相切弧', icon: 'revolve', glyph: '⌒', tip: '相切弧（Fusion Tangent Arc）：点一条现有曲线嘅【端点】开始 → 引出一条同原曲线 G1 相切（平滑续接）嘅弧 → 逐点续弧。系「折线 + 相切弧」submode 嘅独立入口，A 键可切返直线。' },
      { id: 'sk_rect3', label: '三點矩形', icon: 'box', glyph: '◇', tip: '三点矩形（斜矩形）：两点定一条边，第三点定宽 — 画倾斜嘅矩形。' },
      { id: 'sk_polygon', label: '多邊形', icon: 'default', glyph: '⬡', quick: true, tip: '正多边形（中心 + 半径）；草图栏可设边数 / 内切外接。' },
      { id: 'sk_spline', label: '樣條', icon: 'sweep', glyph: '∿', quick: true, tip: '样条曲线：连续点击一串点 → 画出一条【经过每一个点】嘅平滑曲线。想画顺滑自由曲线时用（拉伸/旋转出真平滑曲面）。' },
      { id: 'sk_bspline', label: 'B樣條', icon: 'sweep', glyph: '⟿', quick: true, tip: 'B样条：连续点击一串控制点 → 画出被呢啲点「拉扯」出嚟嘅平滑曲线（唔一定经过控制点,但比样条更顺滑）。想要极顺滑曲线时用（拉伸/旋转出真平滑曲面）。' },
      { id: 'sk_slot', label: '槽', icon: 'default', glyph: '⬭', quick: true, tip: '腰形槽：两端中心 + 槽宽（草图栏设槽宽）。' },
      { id: 'sk_arcslot', label: '圓弧槽', icon: 'default', glyph: '◜', tip: '圆弧槽：弧心 + 一端 + 另一端，沿弧的腰形槽。' },
      { id: 'sk_rrect', label: '圓角矩形', icon: 'box', glyph: '▢', quick: true, tip: '圆角矩形：对角两点 + 圆角半径（草图栏设半径）。' },
      { id: 'sk_ellipse', label: '橢圓', icon: 'cylinder', glyph: '⬯', quick: true, tip: '椭圆：中心 + 半轴。' },
      { id: 'sk_earc', label: '橢圓弧', icon: 'cylinder', glyph: '◡', tip: '椭圆弧：中心 → 长轴端（定 rx+旋转）→ 短轴半径 → 起角 → 终角（工具面板选择顺 / 逆时针）。真椭圆边，闭合成弓形可拉伸。' },
      { id: 'sk_conic', label: '圓錐曲線', icon: 'cylinder', glyph: '⌓', tip: '圆锥曲线：起点 → 终点 → 顶点（两端切线嘅交点）→ 喺底栏调「充满度」(细 = 扁椭圆弧 / 中 = 抛物线 / 大 = 双曲线)。画出真平滑精确边。' },
      { id: 'sk_point', label: '點', icon: 'default', glyph: '·', quick: true, tip: '草图点：单击落一个构造点（可约束/可标尺寸）— 钻孔定位、对称锚点日常。' },
      { id: 'sk_cline', label: '構造線', icon: 'default', glyph: '┊', quick: true, tip: '构造参考线：点位置即落一条 竖直/水平 长虚线（工具面板切方向）。做对中参考、或做镜像嘅【中心轴】。唔参与拉伸。' },
      { id: 'sk_text', label: '文字', icon: 'default', glyph: 'T', tip: '草图文字（Fusion 流程一步到位）：输入 文字/字号/凸高 → 凸字（切割模式=刻字）特征，时间轴可改。' },
    ],
  },
  {
    name: 'MODIFY',
    tools: [
      { id: 'sk_trim', label: '修剪', icon: 'default', glyph: '✂', shortcut: 'T', quick: true, tip: '修剪（T，Fusion 同款）：点要剪走嗰段 — 剪到同其它几何嘅相交点；冇相交成条删。闭合輪廓剪完变开放路径。' },
      { id: 'sk_extend', label: '延伸', icon: 'default', glyph: '⟶', tip: '延伸：点开放路径嘅端段 — 沿原方向（直线）/原圆（弧）延长到最近相交几何。' },
      { id: 'sk_break', label: '打斷', icon: 'default', glyph: '⊟', tip: '打断（Fusion Break）：点曲线上一点 → 一分为二，两段都保留（近相交点会吸到精確交点）。' },
      { id: 'sk_filletc', label: '倒圓角', icon: 'fillet', glyph: 'r⌒', quick: true, tip: '点近一個直角顶点倒嗰个角（半徑=草图栏「圓角R」；或底栏「全部角」一次过倒晒）。' },
      { id: 'sk_chamferc', label: '倒斜角', icon: 'chamfer', glyph: 'C∠', quick: true, tip: '倒斜角：撳近一個直角顶点,把嗰个角倒成一条直斜边（回缩量 = 草图栏「圓角R」；或撳底栏「全部角」一次过倒晒）。' },
      { id: 'sk_offset', label: '偏移', icon: 'default', glyph: '⧉', quick: true, tip: '平行偏移當前輪廓（草图栏設距離，正外/负内）。' },
      { id: 'sk_union', label: '合併輪廓', icon: 'combine', glyph: '∪', quick: true, tip: '合併两个重叠輪廓做一個外框：㩒此即入拾取 → 点第一個輪廓 → 点第二个（即合併）。真圓弧保持。（或先用選擇工具选好两个再㩒）' },
      { id: 'sk_subtract', label: '剪走輪廓', icon: 'combine', glyph: '∖', tip: '从第一個輪廓剪走第二个（A−B）：㩒此即入拾取 → 点【保留件】 → 点【剪走件】（即运算）。挖穿出环（外框+孔）/横切裂体都得 — 拉伸自動嵌套判孔。' },
      { id: 'sk_mirrory', label: '鏡像', icon: 'mirror', glyph: '⇋', quick: true, tip: '镜像（Fusion 式 2 步）：①点中要镜像嘅輪廓（點一個=拣晒成条相连边，可多個）→「✓拣轴线」→ ②点一条现有【直线边/构造线】做镜像轴 → 反射（保留原件）。工具面板仲有「左右轴/上下轴」一键对称。' },
      { id: 'sk_mirrorx', label: '上下鏡像', icon: 'mirror', glyph: '⇅', tip: '上下镜像（一键 across X 轴对称當前輪廓）。' },
      { id: 'sk_array', label: '陣列', icon: 'pattern', glyph: '▦', quick: true, tip: '阵列（Fusion 式）：㩒此入阵列模式 → 底栏面板設 矩形(行列+间距) / 环形(數量+角度+中心)，绿虚线实时预览 → 撳「应用阵列」。对【一個】輪廓。' },
      { id: 'sk_move', label: '移動/複製', icon: 'move', glyph: '✥', tip: '移動/複製當前輪廓：dx,dy 平移 + 绕形心旋轉，可出 N 份副本（Fusion Move/Copy）。' },
      { id: 'sk_scale', label: '縮放', icon: 'scale', glyph: '⤢', tip: '草图縮放（Fusion Sketch Scale）：选中輪廓（无選擇=全部）绕形心乘系数 k（>1 放大 / <1 縮小；真圓弧/椭圆半徑同步縮放）。快捷键喺草图内可用（M=移動 / 縮放喺 ribbon）。' },
      { id: 'sk_project', label: '投影幾何', icon: 'default', glyph: '⧉', quick: true, tip: '投影几何：把實體嘅边「印」落當前草图做【真草图曲线】(蓝紫参考线) —— 印落嚟嘅线可标注/拉伸/修改,唔再只系参考。想沿住實體輪廓画嘢时用：撳掣后点實體嘅边即可。（要喺有實體嘅面、或穿过實體嘅平面开草图先印到）' },
      { id: 'sk_constr', label: '構造', icon: 'default', glyph: '╳', shortcut: 'X', tip: '构造几何（X）：把选中輪廓（或當前輪廓）转为虚线参考几何 — 可约束可吸附，唔参與拉伸。再按一次转返实线。' },
      { id: 'sk_guide', label: '掃掠導軌', icon: 'sweep', glyph: '⤳', tip: '导轨扫掠（Fusion guide rail）：先画一条折线做【导轨】→ 撳此记低（橙虚线）→ 再画扫掠【路径】→「沿路径扫掠」— 截面沿路径行进时跟住导轨转向。' },
      { id: 'sk_close', label: '閉合', icon: 'default', glyph: '✓', sep: true, quick: true, tip: '把折线/样条回到起點闭合成輪廓。' },
      { id: 'sk_dxf', label: '導出DXF', icon: 'default', glyph: '⤓', tip: '把當前草图輪廓導出为 2D DXF（激光切割 / AutoCAD）。' },
    ],
  },
  {
    // Fusion's sketch CONSTRAINTS group: select geometry → apply a relationship; D = dimension.
    name: 'CONSTRAINTS',
    tools: [
      { id: 'sk_select', label: '選擇', icon: 'select', glyph: '↖', quick: true, tip: '选择工具：点 点/边/圆（最多 2 个）,再撳下面约束掣套用关系；撳 Del 键删除所选。' },
      { id: 'sk_dim', label: '尺寸', icon: 'measure', glyph: '⟷', shortcut: 'D', quick: true, tip: '尺寸（D）：点一条边 → 再点【放置位置】定方向（垂直偏置=对齐真长 · 左右放=竖直投影 · 上下放=水平投影）· 圆=直径Ø · 两个点=距离 · 点两条边（平行=间距 / 相交=夹角）。蓝色标签可撳改数值（约束求解）；右键尺寸标签 = R↔Ø 切换 / 转从动 / 删除。过约束会弹框问【转从动 / 取消】。' },
      { id: 'sk_c_h', label: '水平', icon: 'default', glyph: '━', sep: true, quick: true, tip: '水平：选 1 条边（或 2 个点）→ 变水平。' },
      { id: 'sk_c_v', label: '豎直', icon: 'default', glyph: '┃', quick: true, tip: '竖直：选 1 条边（或 2 个点）→ 变竖直。' },
      { id: 'sk_c_hv', label: '水平/豎直', icon: 'default', glyph: '┼', tip: '水平/竖直（合一，Fusion 单命令）：选一条或多条边 → 按每条边嘅方向自动判定水平定竖直施加（横向→水平 / 纵向→竖直）。' },
      { id: 'sk_c_coin', label: '重合', icon: 'default', glyph: '◉', quick: true, tip: '重合：选 2 个点 → 焊埋一齐；或 点+边 → 点落在边上。' },
      { id: 'sk_c_par', label: '平行', icon: 'default', glyph: '∥', quick: true, tip: '平行：选 2 条边。' },
      { id: 'sk_c_perp', label: '垂直', icon: 'default', glyph: '⊥', quick: true, tip: '垂直：选 2 条边 → 成 90°。' },
      { id: 'sk_c_eq', label: '相等', icon: 'default', glyph: '＝', quick: true, tip: '相等：选 2 条边（等长）或 2 个圆（等径）。' },
      { id: 'sk_c_tan', label: '相切', icon: 'default', glyph: '⌒', quick: true, tip: '相切：整椭圆＋直线先预览接触候选，再按此确认；接触在线段外时显示虚线延长。整段椭圆弧只取有向范围内接触候选；选橙色端点＋直线则使用端点相切。圆／圆弧沿用现有相切方式。' },
      { id: 'sk_c_fix', label: '固定', icon: 'default', glyph: '⚓', quick: true, tip: '固定：选 1 个点 / 1 条边 / 1 个圆·弧 → 整体钉死唔郁（边=两端点、圆=圆心+半径）。' },
      { id: 'sk_c_mid', label: '中點', icon: 'default', glyph: '⊹', tip: '中点：选 1 个点 + 1 条边/弧 → 点锁到边中点（弧=真弧中点，非弦中点）。' },
      { id: 'sk_c_conc', label: '同心', icon: 'default', glyph: '◎', tip: '同心：选 2 个圆 → 圆心重合。' },
      { id: 'sk_c_coll', label: '共線', icon: 'default', glyph: '≣', tip: '共线：选 2 条边 → 排成同一直线。' },
      { id: 'sk_c_sym', label: '對稱', icon: 'default', glyph: '⇆', tip: '对称：选 2 个点 / 2 条边 / 2 个圆·弧 + 1 条边（轴）→ 关于轴对称（圆对称连半径相等）。' },
      { id: 'sk_d_angle', label: '角度', icon: 'default', glyph: '∠', sep: true, tip: '角度尺寸：用选择工具点 2 条边 → 标夹角（度，可点改驱动几何）。' },
      { id: 'sk_autoconstrain', label: '自動約束', icon: 'default', glyph: '✨', tip: 'AutoConstrain（Fusion wand）：对【选中集】（无选择=全部几何）一次推断多约束（重合/平行/垂直/相切/等半径）。绘制时嘅自动推断喺工具面板可开关。' },
      { id: 'sk_uncon', label: '撤約束', icon: 'undo', glyph: '↶', tip: '移除最后一个约束/尺寸并重新求解（冲突时用）。约束徽章亦可逐个点击移除。' },
    ],
  },
  {
    name: 'FINISH',
    tools: [
      { id: 'sk_extrude', label: '拉伸', icon: 'extrude', glyph: '⬆', shortcut: 'E', quick: true, tip: '打开拉伸面板（操作 / 范围 / 距离 / 拔模角）。' },
      { id: 'sectionprops', label: '截面屬性', icon: 'default', glyph: 'Σ', tip: '截面属性（Fusion Section Properties）：对草图封闭轮廓算 面积 / 形心 / 截面惯矩 Ixx·Iyy·Ixy / 主轴 / 周长（梁弯曲/强度输入）。最大轮廓=外形，内含=孔（自动扣除），分离轮廓忽略。再撳关。' },
    ],
  },
]

export const WORKSPACES: Record<string, Workspace> = {
  SOLID: { id: 'SOLID', panels: SOLID },
  SURFACE: { id: 'SURFACE', panels: SURFACE },
  MESH: { id: 'MESH', panels: MESH },
  'SHEET METAL': { id: 'SHEET METAL', panels: SHEET },
  PLASTIC: { id: 'PLASTIC', panels: PLASTIC },
  MANAGE: { id: 'MANAGE', panels: MANAGE },
  UTILITIES: { id: 'UTILITIES', panels: UTILITIES },
  '🧪實驗室': { id: '🧪實驗室', panels: LAB },
}

// ── P6 AI 教学：把用户自然语言问题（「点样倒圆角」）模糊匹配到【真实 ribbon 命令】，返其真实位置（tab/面板/快捷键/说明）。
//    AI 用呢个避免凭空乱讲命令名/位置 —— 一律 grounded 到真 ribbon.ts。返 null = 揾唔到（AI 照实讲唔喺 ribbon）。
export type RibbonHit = { id: string; label: string; tab: string; panel: string; shortcut?: string; tip?: string; parentLabel?: string }

let _ribbonFlat: RibbonHit[] | null = null
function _flattenRibbon(): RibbonHit[] {
  const out: RibbonHit[] = []
  for (const tab of Object.keys(WORKSPACES)) for (const p of WORKSPACES[tab].panels) for (const t of p.tools) {
    out.push({ id: t.id, label: t.label, tab, panel: p.name, shortcut: t.shortcut, tip: t.tip })
    if (t.children) for (const c of t.children) out.push({ id: c.id, label: c.label, tab, panel: p.name, shortcut: c.shortcut, tip: c.tip, parentLabel: t.label })
  }
  // GM-W6 E：情境「草图」tab 嘅工具（sk_*）本来喺 WORKSPACES 外（隐形），AI explain_command/teach
  // 搵唔到佢哋。而家一并 flatten 入嚟，令「矩形/尺寸/拉伸」等草图命令都可以 grounded 到真 ribbon。
  for (const p of SKETCH_PANELS) for (const t of p.tools) {
    out.push({ id: t.id, label: t.label, tab: 'SKETCH', panel: p.name, shortcut: t.shortcut, tip: t.tip })
    if (t.children) for (const c of t.children) out.push({ id: c.id, label: c.label, tab: 'SKETCH', panel: p.name, shortcut: c.shortcut, tip: c.tip, parentLabel: t.label })
  }
  return out
}

// 模糊评分：query 同命令 id/label/tip 双向子串匹配（支持中文问句如「点样倒圆角」命中 label「圆角」）。返最高分命中或 null。
export function searchRibbonCommand(query: string): RibbonHit | null {
  const q = (query || '').trim().toLowerCase()
  if (!q) return null
  _ribbonFlat = _ribbonFlat ?? _flattenRibbon()
  let best: RibbonHit | null = null, bestScore = 0
  for (const h of _ribbonFlat) {
    const id = h.id.toLowerCase(), label = h.label.toLowerCase(), tip = (h.tip || '').toLowerCase()
    let s = 0
    if (id === q || label === q) s = 100
    else if (id.length >= 2 && (q.includes(id) || id.includes(q))) s = 80
    else if (q.includes(label) || label.includes(q)) s = 70
    else if (tip.includes(q)) s = 30
    if (s > bestScore) { bestScore = s; best = h }
  }
  return bestScore > 0 ? best : null
}
