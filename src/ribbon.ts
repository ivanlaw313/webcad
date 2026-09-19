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
      { id: 'sketch', label: '建立草圖', icon: 'sketch', shortcut: 'Shift+S', quick: true, tip: '自由草圖：快速畫矩形/圓/折線等，滑鼠點擊即畫（新手首選）。㩒咗之後揀基準面 —— 紅XY/綠XZ/藍YZ 原點面，或直接㩒實體嘅任何一個平坦面。（S=命令搜尋，同 Fusion 一樣）' },
      { id: 'createform', label: '建立造型', icon: 'box', quick: true, tip: '切換到 Fusion 式 FORM 細分建模環境；完成後用「完成造型」返回實體。' },
      { id: 'derive', label: 'Derive', icon: 'component', tip: '從另一個設計派生組件、實體、草圖或參數。' },
      { id: 'automatedmodel', label: 'Automated Modeling', icon: 'component', tip: 'Connector v1：依次點兩張平面面，建立獨立連接器實體。當前不含避讓體、曲面面或 Fusion 的生成式多方案。' },
      { id: 'extrude', label: '拉伸', icon: 'extrude', shortcut: 'E', quick: true, sep: true, tip: '拉伸：畫好草圖輪廓後，沿垂直方向拉出/切入實體。彈面板設 加料/切割 · 距離 · 拔模角 · 貫通。' },
      { id: 'revolve', label: '旋轉', icon: 'revolve', quick: true, tip: '旋轉：草圖輪廓繞一條軸旋轉成回轉體（軸/盤/車削件）。可加料/切割車槽/相交，薄壁>0 做燈罩/碗殼。' },
      { id: 'sweep', label: '掃掠', icon: 'sweep', quick: true, tip: '掃掠：一個截面沿你畫嘅路徑掃出實體（管/導軌）。先畫折線/樣條路徑，壁厚>0 出空心管。' },
      { id: 'loft', label: '放樣', icon: 'loft', quick: true, tip: '放樣：在兩個或多個截面之間平滑過渡成實體。截面可來自 XY/XZ/YZ 或任意參考平面；按選擇次序加入。' },
      { id: 'rib', label: '加強筋', icon: 'rib', tip: '加強筋/腹板：沿草圖中心線生成薄筋並落到實體底面融合（增強結構）。' },
      { id: 'web', label: '腹板', icon: 'rib', tip: 'Fusion Web：選擇一條或多條開放草圖線建立薄腹板；Extend Curves 默認開啟，會把線端延伸到鄰近實體牆面。' },
      { id: 'emboss', label: 'Emboss', icon: 'emboss', quick: true, tip: 'Emboss（Fusion 凸字/刻字）：點實體一個【平面】→ 輸入文字 → 沿該面法向凸起(正深度)/刻入(負深度)。標牌/編號/logo。' },
      { id: 'hole', label: '孔', icon: 'hole', shortcut: 'H', quick: true, sep: true, tip: '孔：在實體面上鑽孔（通/盲 · 沉頭 · 埋頭 · 螺母槽 · 攻牙底孔），有 M3-M12 標準尺寸。' },
      { id: 'thread', label: '螺紋桿', icon: 'thread', tip: '螺紋杆：真漸開螺旋牙（非貼圖）。設大徑Ø/螺距/高。' },
      { id: 'box', label: '長方體', icon: 'box', sep: true, tip: '長方體：直接設長×寬×高建一個盒（最常用起手）。' },
      { id: 'cylinder', label: '圓柱', icon: 'cylinder', tip: '圓柱：設直徑×高直接建圓柱。' },
      { id: 'sphere', label: '球', icon: 'sphere', tip: '球：設直徑建球。' },
      { id: 'torus', label: '圓環', icon: 'torus', tip: '圓環：設外徑+管徑，弧<360° 出 C 形環/卡簧。' },
      { id: 'cone', label: '圓錐', icon: 'cylinder', quick: true, tip: '圓錐/圓台：設底Ø/頂Ø(0=尖錐)/高，邊數≥3 變 N 棱錐/棱台。' },
      { id: 'coil', label: '螺旋', icon: 'coil', tip: '螺旋/彈簧：設節距/高/底半徑/線徑/頂半徑（頂≠底=錐形彈簧）。' },
      { id: 'pipe', label: '管道', icon: 'pipeicon', tip: '管道：沿路徑掃出空心管（外徑+壁厚）。先畫路徑折線。' },
      {
        id: 'pattern', label: '陣列', icon: 'pattern', quick: true, sep: true, tip: '陣列：矩形 / 環形 / 沿路徑 複製實體或孔。',
        children: [
          { id: 'pattern', label: '矩形陣列', icon: 'pattern', tip: '沿 X/Y(/Z) 方向複製實體或孔成網格。' },
          { id: 'circpattern', label: '環形陣列', icon: 'pattern', tip: '繞任意軸等角度複製（Fusion 同款）：對象 = 整個實體或時間軸所選特徵（螺栓孔圈/辐條），角度 = 完整360°/指定/對稱。' },
          { id: 'geopattern', label: '幾何陣列', icon: 'pattern', tip: '複製所選時間軸特徵，並為每個實例指定平移或旋轉變換。' },
          { id: 'pathpattern', label: '路徑陣列', icon: 'pattern', tip: '先建實體→畫折線/樣條路徑→沿路徑等距複製實體。' },
        ],
      },
      { id: 'mirror', label: '鏡像', icon: 'mirror', quick: true, tip: '鏡像特徵/實體：跨基準面（XY/XZ/YZ 或所選面）對稱複製選中嘅特徵或整個實體。同「陣列」配對嘅常用建模操作。' },
      { id: 'thicken', label: '加厚', icon: 'shell', sep: true, tip: 'Fusion Thicken：點實體或曲面一個面，沿法向加厚成實體薄板；負值翻轉方向。' },
      { id: 'boundaryfill', label: 'Boundary Fill', icon: 'combine', tip: '用實體、曲面與工作平面分割空間，再選擇要保留的 cell。' },
      { id: 'basefeature', label: 'Create Base Feature', icon: 'newbody', tip: '進入直接建模 Base Feature 環境。' },
      { id: 'createpcb', label: 'Create PCB', icon: 'component', tip: '創建或關聯 PCB。' },
      { id: 'jointorigin', label: '關節原點', icon: 'joint', sep: true, tip: 'Fusion Joint Origin：點實體面心、圓柱孔心或頂點建立可複用命名關節坐標幀。' },
    ],
  },
  {
    name: 'MODIFY',
    tools: [
      { id: 'presspull', label: '按拉', icon: 'presspull', shortcut: 'Q', quick: true, tip: '按/拉：點實體一個平面，沿法向推出或壓入（快速加/減料）。' },
      { id: 'editface', label: '編輯面', icon: 'move', tip: 'Fusion Edit Face：選擇一個或多個平面面，直接偏移或傾斜並重解相鄰面。' },
      { id: 'fillet', label: '圓角', icon: 'fillet', shortcut: 'F', quick: true, sep: true, tip: '圓角：點選棱（可多條）倒成圓弧，設半徑（末端半徑≠起始=變半徑圓角）。', quickChildren: [
        { id: 'fillet', label: '圓角', icon: 'fillet', shortcut: 'F', tip: '圓角：點選棱（可多條）倒成圓弧。' },
        { id: 'chamfer', label: '倒角', icon: 'chamfer', shortcut: 'C', tip: '倒角：等距 / 兩距離 / 距離+角度。' },
      ] },
      { id: 'chamfer', label: '倒角', icon: 'chamfer', shortcut: 'C', tip: '倒角（Chamfer）：點選棱切斜角。支持等距 / 兩距離 / 距離+角度。' },
      { id: 'shell', label: '抽殼', icon: 'shell', quick: true, sep: true, tip: '抽殼：把實體掏空成等壁厚殼，選開口面。建議喺圓角之前做。' },
      { id: 'draft', label: '拔模', icon: 'draft', tip: '拔模：給側面加脫模斜度（注塑/鑄造件必備）。' },
      { id: 'scale', label: '縮放', icon: 'scale', tip: '縮放：按比例放大/縮小實體。' },
      { id: 'combine', label: '合併/切割', icon: 'combine', quick: true, tip: '合併/布爾：把 活動實體(目標) 同 泊車實體(工具) 做 併起 / 切走 / 相交 —— 出真精確實體（對話框選操作 + 勾要用嘅工具體）。要先用「新實體」整多過一個實體先做到。' },
      { id: 'offsetface', label: '偏移面', icon: 'replaceface', tip: 'Fusion Offset Face：點實體一個或多個平面，沿法向原地偏移；可選擇修改現有特徵、新偏移或自動。' },
      { id: 'replaceface', label: '替換面', icon: 'replaceface', tip: 'Fusion Replace Face：選擇來源面及目標面／平面，以目標幾何延伸或裁切實體。當前精確支持平面目標。' },
      { id: 'splitface', label: '分割面', icon: 'splitface', tip: 'Fusion Split Face：用平面或曲面工具分割所選面，實體體積保持不變。' },
      { id: 'splitbody', label: '分割實體', icon: 'split', quick: true, tip: '分割實體：用切割平面把一個實體切成兩個獨立體（參數化）。' },
      { id: 'silhouettesplit', label: '輪廓分割', icon: 'splitface', tip: 'Fusion Silhouette Split：按所選平面或軸的視圖方向，由輪廓曲線生成曲面，再分割面、抽殼實體或實體。' },
      { id: 'move', label: '移動/複製', icon: 'move', shortcut: 'M', quick: true, sep: true, tip: 'Fusion Move/Copy：平移、自由移動、旋轉或點到點移動實體／組件，並可建立副本。' },
      { id: 'align', label: '對齊', icon: 'combine', tip: '對齊：先點基準面（唔郁嗰件）再點要郁件嘅面 —— 平面貼平 / 圓柱對準同軸。一次性快捷,唔記錄配合；想要持久配合用「關節(揀面)」。' },
      { id: 'delete', label: '刪除', icon: 'trash', tip: '刪除：刪除選中的特徵或組件。' },
      { id: 'remove', label: '移除', icon: 'trash', tip: 'Fusion Remove：從當前設計移除所選組件實例；外部來源設計仍然保留。' },
      { id: 'arrange', label: '排列', icon: 'pattern', sep: true, tip: 'Fusion Arrange：選擇組件、排列平面及包覆面參數，為製造自動排料。' },
      {
        id: 'simplify', label: '簡化', icon: 'scale', tip: 'Fusion Simplify：刪除小特徵／面，或用基本體替換複雜對象。',
        children: [
          { id: 'removefeatures', label: '刪除特徵', icon: 'trash', tip: '自動識別並刪除選定實體上的小孔、圓角、倒角等特徵。' },
          { id: 'removefaces', label: '刪除面', icon: 'trash', tip: '刪除選定面並自動延伸相鄰面來治癒實體。' },
          { id: 'replaceprimitives', label: '使用基本體替換', icon: 'box', tip: '用長方體、圓柱體或球體替換所選對象，並抑製原對象。' },
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
      { id: 'convert', label: '轉換', icon: 'component', sep: true, tip: 'Convert / MeshFit：網格組件 → 可編輯 B-rep（自動識別圓柱/棱柱；否則 faceted）。BRep↔T-Spline 仍在實現。亦可搜「meshfit」。' },
      { id: 'bom', label: 'BOM 表', icon: 'drawing', quick: true, sep: true, tip: 'Fusion Bill of Materials：打開此設計的材料清單；WebCAD 可按組件名稱、數量、物理材質及質量導出 CSV。' },
    ],
  },
  {
    name: 'CONFIGURE',
    tools: [
      { id: 'params', label: '參數', icon: 'param', quick: true, tip: '用戶參數（ƒx 命名變量/表達式，绑定到尺寸，改一處全聯動）。' },
    ],
  },
  {
    name: 'CONSTRUCT',
    // Fusion live-capture 次序；每项预设同一个 Construction Geometry 对话框嘅 Type + Method。
    tools: [
      { id: 'ucs', label: '用戶坐標系', icon: 'axis', quick: true, tip: 'Fusion User Coordinate System：點實體平面建立一套局部原點、三軸及三正交參考面。' },
      { id: 'datumgeom', label: '構造幾何', icon: 'plane', tip: '在一個面板中建立參考平面、構造軸或構造點；適用於圓柱、圓锥等沒有可用平面侧面的實體。' },
      { id: 'offsetplane', label: '偏移平面', icon: 'plane', quick: true, sep: true, tip: 'Fusion Offset Plane：先選原點 XY/XZ/YZ 基準面（或中間面），輸入距離建立平行參考面；如需由實體平面開始，可在方法選擇「偏移面（拾面+距離）」。' },
      { id: 'planeangedge', label: '成角平面', icon: 'plane', tip: 'Fusion Plane at Angle：拾取直邊／軸並輸入角度，建立包含該邊的倾斜平面。' },
      { id: 'planetan', label: '相切平面', icon: 'plane', tip: 'Fusion Tangent Plane：拾取圓柱面及參考方向，在指定位置建立相切平面。' },
      { id: 'planemid', label: '中間平面', icon: 'plane', tip: 'Fusion Midplane：拾取兩個平面或平坦面，在兩者正中建立參考面。' },
      { id: 'planeperp', label: '垂直平面', icon: 'plane', tip: 'Fusion Perpendicular Plane：拾取平面及參考邊，在指定距離建立垂直平面。' },
      { id: 'plane2edge', label: '過兩邊平面', icon: 'plane', tip: 'Fusion Plane Through Two Edges：順序拾取兩條邊，建立同時包含兩邊的參考面。' },
      { id: 'plane3pt', label: '過三點平面', icon: 'plane', tip: 'Fusion Plane Through Three Points：用最後三個構造點建立參考面。' },
      { id: 'planepath', label: '沿路徑平面', icon: 'plane', tip: 'Fusion Plane Along Path：拾取路徑並以 0–1 距離定位，建立垂直於路徑切向的平面。' },
      { id: 'axiscyl', label: '圓柱／圓錐／環面軸', icon: 'axis', quick: true, sep: true, tip: 'Fusion Axis Through Cylinder/Cone/Torus：拾取旋轉面建立其中心軸。' },
      { id: 'axisperpface', label: '垂直面軸', icon: 'axis', tip: 'Fusion Axis Perpendicular To Face：拾取平面上的一點，建立沿面法向的構造軸。' },
      { id: 'axis2planes', label: '過兩平面軸', icon: 'axis', tip: 'Fusion Axis Through Two Planes：拾取兩個不平行平面，以交線建立構造軸。' },
      { id: 'axis2pt', label: '過兩點軸', icon: 'axis', tip: 'Fusion Axis Through Two Points：用最後兩個構造點建立任意方向軸。' },
      { id: 'axisedge', label: '沿邊軸', icon: 'axis', tip: 'Fusion Axis Through Edge：拾取一條直邊，以該邊建立構造軸。' },
      { id: 'pointvertex', label: '頂點構造點', icon: 'cpoint', quick: true, sep: true, tip: 'Fusion Point At Vertex：拾取一條邊，在最近端點建立構造點。' },
      { id: 'point2edges', label: '兩邊交點', icon: 'cpoint', tip: 'Fusion Point Through Two Edges：拾取兩條邊，在交點或最近逼近點建立構造點。' },
      { id: 'point3planes', label: '三平面交點', icon: 'cpoint', tip: 'Fusion Point Through Three Planes：拾取三個平面，在唯一公共交點建立構造點。' },
      { id: 'pointcenter', label: '圓／球／環面中心點', icon: 'cpoint', tip: 'Fusion Point At Center Of Circle/Sphere/Torus：拾取圓形邊，在擬合中心建立構造點。' },
      { id: 'pointedgeplane', label: '邊與平面交點', icon: 'cpoint', tip: 'Fusion Point At Edge And Plane：拾取邊及平面，在交點建立構造點。' },
      { id: 'pointpath', label: '沿路徑點', icon: 'cpoint', tip: 'Fusion Point Along Path：拾取路徑，以 0–1 比例或毫米距離定位構造點。' },
    ],
  },
  {
    name: 'INSPECT',
    tools: [
      { id: 'measureuni', label: '測量', icon: 'measure', shortcut: 'I', quick: true, tip: 'Fusion Measure：一個命令測量面、邊、點及其組合；顯示長度、面積、角度、最短距離及 ΔXYZ。' },
      { id: 'interference', label: '干涉檢查', icon: 'interference', tip: 'Fusion Interference：先選擇參與檢查的實體或組件，再按 Compute 計算真實重疊體積。' },
      { id: 'curvcomb', label: '曲率梳分析', icon: 'curvature', sep: true, tip: 'Fusion Curvature Comb Analysis：沿曲面顯示曲率梳齒，檢查曲率變化及接縫連續性。' },
      { id: 'zebra', label: '斑馬紋分析', icon: 'section', tip: 'Fusion Zebra Analysis：以反射條紋檢查曲面切向連續及光順度。' },
      { id: 'draftanalysis', label: '拔模分析', icon: 'draft', tip: 'Fusion Draft Analysis：按脫模方向着色正拔模、倒扣及垂直區域。' },
      { id: 'curvmap', label: '曲率圖分析', icon: 'curvature', tip: 'Fusion Curvature Map Analysis：以色譜顯示曲面彎曲趨勢。' },
      { id: 'accessanalysis', label: '可達性分析', icon: 'draft', tip: 'Fusion Accessibility Analysis：沿指定方向檢查被實體自身遮擋、工具或模具不可達的區域。' },
      { id: 'minradius', label: '最小半徑分析', icon: 'curvature', tip: 'Fusion Minimum Radius Analysis：找出模型最小局部曲率半徑及位置。' },
      { id: 'section', label: '剖切分析', icon: 'section', quick: true, tip: 'Fusion Section Analysis：以可調剖切平面檢查實體內部。' },
      { id: 'centerofmass', label: '質心', icon: 'measure', sep: true, tip: 'Fusion Center of Mass：切換顯示實體或裝配的體積加權質心標記。' },
      { id: 'properties', label: '物理屬性', icon: 'measure', tip: 'Fusion Properties：查看所選實體或組件的質量、體積、表面積、重心與材料。' },
      { id: 'meshfacegroups', label: '顯示網格面組', icon: 'draft', sep: true, shortcut: 'Shift+F', tip: 'Fusion Display Mesh Face Groups：切換網格面組顏色顯示。' },
    ],
  },
  {
    name: 'INSERT',
    tools: [
      { id: 'insertcomponent', label: '插入組件', icon: 'component', quick: true, tip: 'Fusion Insert Component：從 STEP/STP 選取零件或裝配，作為獨立組件插入當前設計；保留多零件的相對位置。當前不建立 Fusion 云端/F3D 的關聯鏈接。' },
      { id: 'insertfastener', label: '插入緊固件', icon: 'component', quick: true, tip: 'Fusion Insert Fastener 工作流：選內建 ISO 紧固件類型、M 規格與長度後插入獨立裝配組件。幾何尺寸真實；螺紋以簡化光杆表示，不伪稱 Autodesk 云端供應商庫。' },
      { id: 'insertmesh', label: '插入STL网格', icon: 'importmesh', quick: true },
      { id: 'insert3mf', label: '插入3MF網格', icon: 'importmesh', quick: true, tip: 'MakerWorld / Printables 下載嘅 3MF 直接導入做組件——多零件保留擺位同顏色，單位自動轉 mm。' },
      { id: 'insertobj', label: '插入OBJ網格', icon: 'importmesh', quick: true, tip: 'Wavefront OBJ 網格導入（Blender、掃掠或網上模型常用）作參考組件。' },
      { id: 'insertcanvas', label: '畫布', icon: 'importmesh', sep: true, tip: 'Fusion Canvas：選擇參考圖片，放到當前草圖平面作為描摹底圖；加入後可調宽度、透明度、位置、旋轉、翻轉及兩點標定比例。' },
      { id: 'insertdecal', label: '貼花', icon: 'importmesh', tip: 'Fusion Decal：選擇 logo／標签圖片，然後點擊實體表面放置；可調尺寸、旋轉、透明度及翻轉，並隨項目保存。' },
      { id: 'importdxf', label: '導入DXF', icon: 'importdxf', quick: true, tip: '導入 2D DXF 輪廓並拉伸成 3D（激光切割圖 / 網上輪廓 → 可打印實體）。支持 LINE/多段線/圓/圓弧，自動識别外形+孔，拉伸 5mm（時間軸可改）。' },
      { id: 'importsvg', label: '導入SVG', icon: 'importsvg', quick: true, tip: '導入 SVG 矢量圖形並拉伸成 3D（logo / 圖標 / 網上矢量 → 可打印實體）。曲線自動展平，支持 path/圓/矩形/多邊形，自動識别外形+孔，拉伸 5mm（時間軸可改）。' },
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
      { id: 'rigidgroup', label: '剛性組', icon: 'joint', tip: 'Fusion Rigid Group：在瀏覽器勾選兩個或以上組件，將它們鎖成一個剛體組；組節點可在瀏覽器或關節面板抑製、恢復或刪除。' },
      { id: 'motionlink', label: '運動連接', icon: 'joint', sep: true, tip: 'Fusion Motion Link：開啟關節面板的運動連接區，為兩個轉動／滑動關節設傳動比（齒輪可用負比反向）。' },
      { id: 'enablecontact', label: '啟用接觸集', icon: 'joint', tip: 'Fusion Enable Contact Sets：切換裝配接觸求解；啟用後驅動關節會在組件發生實體接觸前停止。' },
      { id: 'newcontactset', label: '新建接觸集', icon: 'joint', tip: 'Fusion New Contact Set：在瀏覽器勾選剛好兩個組件，登記為命名接觸對。' },
      { id: 'motionstudy', label: '運動研究', icon: 'joint', sep: true, tip: 'Fusion Motion Study：開啟第一個可驅動關節的動力學設置，設質量、剛度、阻尼及初始位置後求解和播放。' },
      { id: 'drivejoints', label: '驅動關節', icon: 'joint', tip: 'Fusion Drive Joints：展開關節面板，以滑桿、限位、停於接觸及播放控製驅動裝配。' },
    ],
  },
  {
    name: 'SELECT',
    tools: [
      { id: 'select', label: '選擇', icon: 'select', quick: true, tip: '選擇工具：撳零件/面/邊就拣中佢（撳空白處 = 唔拣）；撳 Del 鍵刪除所選。' },
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
    name: 'CREATE 擴充',
    tools: [
      { id: 'facesketch', label: '面上草圖', icon: 'sketch', quick: true, tip: 'WebCAD 擴充：直接拾取實體平面進入草圖。' },
      { id: 'sweepedge', label: '掃掠(拾邊)', icon: 'sweep', tip: 'WebCAD 擴充：直接拾取實體邊鏈作為掃掠路徑。' },
      { id: 'text', label: '文字', icon: 'text', tip: 'WebCAD 擴充：快速建立文字幾何。' },
      { id: 'othread', label: '面加螺紋', icon: 'thread', tip: 'WebCAD 擴充：在圓柱面建立真實外螺紋。' },
      { id: 'ithread', label: '內螺紋孔', icon: 'hole', tip: 'WebCAD 擴充：建立真實內螺紋孔。' },
      { id: 'newbody', label: '新實體', icon: 'newbody', tip: 'WebCAD 擴充：泊車當前實體後開始另一實體。' },
    ],
  },
  {
    name: '傳動設計',
    tools: [
      {
        id: 'gear', label: '齒輪', icon: 'gear', quick: true, tip: '漸開線正齒輪（β>0=斜齒扭轉近似）：設模數/齒數/厚度/孔Ø。分度圓Ø = m×z，20° 壓力角。',
        children: [
          { id: 'gear', label: '正齒輪/斜齒輪', icon: 'gear', tip: '漸開線齒輪：β=0 直齒，β>0 斜齒（扭轉近似）。' },
          { id: 'worm', label: '蝸桿', icon: 'worm', tip: '蜗杆（ZA 近似形）：模數/頭數/長度 — 同蜗輪比 = 頭數:齒數（純運動學）。' },
          { id: 'crowngear', label: '冠齒輪', icon: 'crowngear', tip: '冠齒輪（面齒輪近似形）：垂直軸啮合示意。' },
        ],
      },
      { id: 'gearbox', label: '齒輪箱', icon: 'pattern', quick: true, tip: '齒輪箱向導：輸入目標速比 → 自動配好齒數組合 + 精確中心距擺位 + 關節 + 運動連接 —— 確定即可撳 ▷ 睇佢轉。' },
      { id: 'rack', label: '齒條', icon: 'rack', tip: '齒條（齒輪齒條機構）：模數同齒輪一致即可啮合。' },
      { id: 'pulley', label: 'V帶輪', icon: 'pulley', tip: 'V 帶輪（皮帶传動）：設外徑/宽度/中心孔，帶 V 形槽。' },
    ],
  },
  {
    name: '機構',
    tools: [
      { id: 'fourbar', label: '四連桿機構', icon: 'joint', quick: true, tip: '平面四連杆閉環機構：拖曲柄角→連杆/摇杆約束求解聯動（杆長剛性）。' },
      { id: 'slidercrank', label: '滑塊曲柄', icon: 'joint', tip: '滑塊曲柄機構（活塞）：曲柄轉→活塞往複直線（行程=2×曲柄半徑），如引擎活塞。' },
      { id: 'sixbar', label: '六桿機構', icon: 'joint', tip: '六杆機構：曲柄轉 → 輸出點行出一條複杂嘅耦合曲線。可撳「📈軌迹」描出佢行經嘅路徑。' },
    ],
  },
  {
    name: '仿真',
    tools: [
      { id: 'fea', label: '受力雲圖', icon: 'stress', quick: true, tip: '受力分析（趋势級）：點固定面 → 點受力面 → 設力 → 出應力云圖,紅色 = 最受力 = 最容易斷嘅位。屬趋势着色,非商用分析精度。' },
      { id: 'moldflow', label: '模流分析', icon: 'moldflow', quick: true, tip: '注塑模流趋势：點浇口位（可多個）→ 選塑料 → 出充填時間/壓力/冷却/變形趋势云圖 + 焊接線 + 充填動畫。可開「壓力求解器」出真實壓力值。' },
      { id: 'windtunnel', label: '風洞水洞', icon: 'wind', quick: true, tip: '風洞 / 水洞趋势模擬：把零件放入虛擬風道/水道解流場 → 風阻系數 Cd + 阻力 + 表面壓力/流場。可調風速 · 流體(空氣/水) · 吹向。屬趋势級,相對比較可信,非商用驗證級。' },
      { id: 'physicslab', label: '環境實驗室', icon: 'joint', quick: true, tip: 'Physics Lab：將 CAD 零件放入剛體實驗室，即時模擬重力、碰撞、摩擦、反彈和統一風。互動級模擬，非工程認證。' },
    ],
  },
  {
    name: '製造 CAM',
    tools: [
      { id: 'finish3d', label: '3D加工', icon: 'cam', quick: true, tip: '3D 加工刀路（需活動實體 / MeshFit 後的 B-rep）：精加工球頭平行 / 粗加工逐層挖槽。僅趋势級預覽與 G-code 導出——非完整製造工作區、無刀庫/夹具/真機。純網格組件請先轉 B-rep。' },
    ],
  },
  {
    name: '3D列印',
    tools: [
      { id: 'overhang', label: '懸垂分析', icon: 'overhang', quick: true, tip: '3D 打印懸垂分析：標出需要支撑嘅朝下斜面（>45°），報支撑面積 % + 建議最省支撑打印朝向。' },
      { id: 'autoorient', label: '自動擺正', icon: 'overhang', tip: '一鍵把零件旋轉到最省支撑嘅打印朝向（懸垂分析嘅建議方向），加一個可撤销嘅變換特徵。' },
      { id: 'wallcheck', label: '壁厚檢查', icon: 'wallcheck', tip: '3D 打印壁厚檢查：射線量度局部壁厚，標出 < 0.8mm 嘅薄壁（橙色高亮）+ 報最薄值。采樣近似。' },
      { id: 'slicepreview', label: '切層預覽', icon: 'section', tip: '3D 打印切層預覽：逐層試切實體，標出懸空孤島（懸垂分析睇唔到嘅浮空區，需支撑）+ 首層接触面積 + 最薄層 + 唔水密輪廓。' },
      { id: 'stack', label: '堆疊', icon: 'component', sep: true, tip: '垂直堆疊：所有可見組件自底向上疊放（每件坐喺下件頂面）— 層疊件/托盤。' },
      { id: 'arrangebed', label: '排版', icon: 'component', tip: '排版到打印床：所有可見件平铺地面、互不重疊、全部落地 — 多件 3D 打印備料。' },
      { id: 'dropall', label: '全落地', icon: 'component', tip: '全部落地：每個可見件各自下移到 Z=0（XZ 不變）— 散件歸地。' },
    ],
  },
  {
    name: '更多基元',
    tools: [
      { id: 'cone', label: '圓錐', icon: 'cylinder', quick: true, tip: '圓锥/圓台：設底Ø/頂Ø(0=尖锥)/高，邊數≥3 變 N 棱锥/棱台。' },
      { id: 'tube', label: '圓管', icon: 'cylinder', quick: true, tip: '圓管/衬套：設外徑Ø/壁厚/高建空心管。' },
      { id: 'rbox', label: '圓角盒', icon: 'box', quick: true, tip: '圓角長方體/外殼盒：長方體四條竖邊倒圓角。電子外殼常用。' },
      { id: 'wedge', label: '楔形', icon: 'box', tip: '楔形/斜坡：設長/宽/高建一端高、另一端削平的三角塊。' },
      { id: 'dome', label: '圓頂', icon: 'sphere', tip: '圓頂/半球：設直徑建半球；冠高<半徑 出浅球冠（鏡片/表鏡/按钮）。' },
      { id: 'halfcyl', label: '半圓柱', icon: 'cylinder', tip: '半圓柱/D 形：圓柱切一半（D 形截面）。D 形軸/D 孔常用。' },
      { id: 'pie', label: '扇形柱', icon: 'cylinder', tip: '扇形柱/饼塊：圓盤的一塊扇形（設直徑/角度/高）。' },
      { id: 'rtube', label: '方管', icon: 'box', tip: '矩形空心管/方通(RHS)：設截面宽×深/壁厚/長。框架/横梁常用。' },
      { id: 'profile', label: '型材', icon: 'box', tip: '結構型材：L 角鐵 / U 槽鋼 / T 型材（設截面宽×高/壁厚/長）。' },
      { id: 'pyramid', label: '棱錐', icon: 'cylinder', tip: '多邊形棱锥：設邊數/底外接Ø/高，底多邊形收到頂尖。' },
      { id: 'prism', label: '棱柱', icon: 'box', tip: '正多邊形棱柱：設邊數/外接圓Ø/高建六角柱等。' },
    ],
  },
  {
    name: '裝配輔助',
    tools: [
      { id: 'explodeview', label: '爆炸視圖', icon: 'component', quick: true, tip: '爆炸視圖：沿裝配中心向外展開組件（滑杆調爆炸度），睇裝配關系。' },
      { id: 'xray', label: '透視', icon: 'appearance', tip: 'X-ray 透視：全部組件半透明，睇裝配內部（軸承滚珠/行星輪）。' },
      { id: 'scaleasm', label: '整體縮放', icon: 'move', tip: '整體縮放裝配：按比例放大/縮小成個多件設計（含相對間距，繞裝配中心）。' },
    ],
  },
  {
    name: '工具',
    tools: [
      { id: 'calc', label: '工程計算', icon: 'calc', quick: true, tip: '工程計算器：螺紋/配合/齒輪/皮帶/彈簧/軸承/折彎 等 14 個機械設計速算。' },
    ],
  },
  {
    name: '直接編輯擴展',
    tools: [
      { id: 'moveface', label: '移動面', icon: 'replaceface', quick: true, tip: 'WebCAD 擴展：偏移或倾斜平面面，內核重解相鄰面。' },
      { id: 'filletall', label: '全棱圓角', icon: 'fillet', tip: 'WebCAD 擴展：對實體全部邊一次應用相同圓角。' },
      { id: 'chamferall', label: '全棱倒角', icon: 'chamfer', tip: 'WebCAD 擴展：對實體全部邊一次應用相同倒角。' },
      { id: 'delface', label: '刪面治癒', icon: 'presspull', tip: 'WebCAD 擴展：刪除所選面並尝試延伸鄰面治癒實體。' },
      { id: 'offsetsolid', label: '整體偏移', icon: 'scale', tip: 'WebCAD 擴展：均匀外擴或內縮實體全部面。' },
      { id: 'cylpatch', label: '圓柱曲面貼花', icon: 'cylpatch', tip: 'WebCAD 擴展：在圓柱面建立凸台、凹槽或平面。' },
      { id: 'splitplane', label: '任意平面切', icon: 'split', tip: 'WebCAD 擴展：拾取任意平面參數化分割實體。' },
      { id: 'splitsketch', label: '草圖輪廓分割', icon: 'split', tip: 'WebCAD 擴展：用封閉草圖輪廓贯穿分割實體。' },
      { id: 'bodyboolean', label: '實體布爾', icon: 'combine', tip: 'WebCAD 擴展：活動實體與泊車實體進行並集、切除或相交。' },
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
    name: '構造擴展',
    tools: [
      { id: 'datumgeom', label: '統一構造幾何', icon: 'plane', quick: true, tip: 'WebCAD 擴展入口：在同一個面板切換平面／軸／點及全部方法。' },
      { id: 'planeparpt', label: '過點平行面', icon: 'plane', tip: '以最後一個構造點及所拾平面建立平行參考面。' },
      { id: 'caxis', label: '方向構造軸', icon: 'axis', tip: '以 X／Y／Z 方向及指定坐標建立構造軸。' },
      { id: 'cpoint', label: '坐標構造點', icon: 'cpoint', tip: '輸入 X／Y／Z 坐標建立構造點。' },
      { id: 'midcpoint', label: '兩點中點', icon: 'cpoint', tip: '在最後兩個構造點正中建立新構造點。' },
      { id: 'cptgrid', label: '構造點陣列', icon: 'cpoint', tip: '一次建立矩形或極坐標構造點陣列。' },
      { id: 'projsurf', label: '投影到圓柱面', icon: 'axis', tip: '把平面草圖路徑按弧長映射到可展圓柱面，產生 3D 參考曲線。' },
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
    { id: 'surfextrude', label: '曲面拉伸', icon: 'extrude', quick: true, tip: '曲面拉伸：把當前草圖截面沿法向拉成一張【零厚曲面】—— 開放折線 → 曲面片；閉合輪廓 → 無蓋嘅管殼（圓 → 圓柱面）。出獨立曲面體（想變實體再用「加厚」/「縫合」）。' },
    { id: 'ruled', label: '規則曲面', icon: 'loft', quick: true, tip: '規則曲面：喺 ≥2 張【不同高度嘅開放折線草圖】之間,用直線連起對應點、掃出一張零厚曲面。先畫開放折線 → 完成草圖 → 換高度再畫 → 撳此。出獨立曲面體（想變實體再「加厚」/「縫合」）。注：呢種片冇壁厚（想要壁厚用「曲面放樣」）。' },
    { id: 'surfsweep', label: '曲面掃掠', icon: 'sweep', quick: true, tip: '曲面掃掠：開放截面沿你畫的開放路徑掃成零厚開放曲面（風道/導流板/管壁皮）。先畫開放折線截面 → 完成草圖 → 再畫一條開放折線路徑 → 撳此。出獨立曲面體（要實體再「加厚」/「縫合」）。' },
    { id: 'surfrevolve', label: '曲面旋轉', icon: 'revolve', quick: true, tip: '曲面旋轉：開放截面繞軸旋成零厚旋轉曲面（燈罩/噴嘴/花瓶皮/渦輪轂），無需先做實體再殼。先畫開放折線截面 → 撳此 → 輸角度,軸(Y/X)。出獨立曲面體（要實體再「加厚」/「縫合」）。' },
    { id: 'surfpatch', label: '補面 Patch', icon: 'loft', quick: true, tip: '補面 Patch：喺實體表面/空間順序點 ≥3 個點、圈出一個閉合邊界 → 填充成曲面 + 加厚成薄板。補洞 / 加蒙皮 / 驳面時用。' },
    { id: 'surfbridge', label: '橋接面', icon: 'loft', quick: true, tip: '橋接：點選 2 條現有棱（實體 / 泊車曲面）→ 喺兩棱之間起一張光滑過渡面,可加厚。想驳通兩條邊、封個缺口時用。' },
    { id: 'boundarypatch', label: '邊界補面', icon: 'loft', quick: true, tip: '邊界補面：拾幾條【現有棱】（實體/泊車曲面上）填補一個多邊洞 / 封口,可勾相切令接邊順滑；出【曲面體】。先有個帶缺口嘅實體/曲面 → 撳此 → 逐條點選邊界棱（≥2）→ 可勾相切 / 設加厚 → 確定。' },
    { id: 'thicken', label: '加厚 Thicken', icon: 'shell', quick: true, tip: '加厚：點實體/曲面一個面 → 沿法向加厚成實體薄板（曲面件轉成可打印實體 / 加厚單一面）。出獨立件,想合並用「實體布爾」。方向：板厚輸負值、或前缀「-」= 翻轉、朝另一邊加厚。' },
    { id: 'thickenquilt', label: '加厚整張曲面', icon: 'shell', quick: true, tip: '加厚整張曲面：拣一張【完整泊車曲面/縫合面】（放樣/掃掠/旋轉/縫合/補面出嘅）→ 成張一次過加厚成實體（唔似「加厚」净加單一拾取面）。曲面變實體最常用嘅一步。板厚輸負值 = 朝另一邊。' },
    { id: 'offsetsurf', label: '偏移曲面', icon: 'loft', tip: '偏移曲面：點一個面 → 偏出一張平行嘅新曲面（正 = 外偏 / 負 = 內偏）。兩侧：距離用 ±（如 ±5）= 一次出內外兩張平行面（關於原面對稱）。出獨立開放曲面件。' },
    { id: 'splitface', label: '分割面', icon: 'splitface', tip: '分割面：點一個面 → 喺點擊處用一個垂直平面把佢切成兩半（體積不變,兩塊子面可各自單獨拣/着色/拔模）。' },
    { id: 'replaceface', label: '替換面', icon: 'replaceface', tip: '替換面（平面頂替）：點一個面 → 輸入推入距離 → 把該面沿法向推去一個新位置,鄰面自動延伸接返順。誠實局限：只做平面頂替（唔支持任意曲面替換）。' },
    { id: 'rotateface', label: '旋轉面', icon: 'replaceface', tip: '旋轉面：點一個【平面】→ 輸入鉸軸(X/Y/Z) + 角度 → 該面繞住經過點擊點嘅鉸線倾斜,鄰面自動癒合成梯形（實體保留）。改導入件/斜面角度用。僅限平面。' },
    { id: 'surfsew', label: '縫合 Stitch', icon: 'shell', quick: true, tip: '縫合 Stitch：把現有所有曲面/殼片（放樣/補面/加厚/偏移出嘅）沿住共用邊焊埋成一個殼；若完全封閉 → 自動轉成實體（可繼續布爾/導出/打印）。' },
    { id: 'surfunstitch', label: '取消縫合', icon: 'shell', tip: '取消縫合：把縫好嘅殼拆返做逐張獨立面（縫合嘅相反操作）,方便單獨編輯/刪除某一張面。' },
    { id: 'surftrim', label: '平面裁剪', icon: 'shell', tip: '平面裁剪：用一個平面把曲面殼裁走一邊、留返另一半。①軸對齊：輸 XY/XZ/YZ, 偏移, 保留邊；②任意平面：輸 原點x,y,z, 法向x,y,z[,保留邊]（如 0,0,10,1,0,1,+ = 斜平面裁）。單張散面要先「縫合」成殼。' },
    { id: 'surfsurftrim', label: '曲面裁剪', icon: 'shell', tip: '曲面裁剪：用【另一張曲面】或【活動實體】做裁刀,沿交線把目標曲面切成幾片 → 喺目標上點你要【保留】嗰一邊/區域。先有兩張相交曲面（或一張曲面穿過實體）→ 撳此 → 選目標 + 裁刀 → 喺目標上點保留邊。' },
    { id: 'untrim', label: '去裁/還原', icon: 'shell', tip: '去裁 / 還原：點一個泊車曲面 → 丢弃佢嘅裁剪邊界、還原返底層曲面嘅完整原始范圍（補返被裁走嘅整片,再重新裁）。裁剪嘅相反操作。' },
    { id: 'intersectcurve', label: '相交曲線', icon: 'shell', tip: '相交曲線：把所有體（活動實體 + 泊車曲面/殼）兩兩求交,沿交線抽出 3D 參考曲線（青色實線,隨項目存档）。想量兩曲面點接 / 起截面草圖 / 接面參考時用。冇相交就唔變；再撳「清相交曲線」清除。' },
    { id: 'clearintersect', label: '清相交曲線', icon: 'shell', tip: '清除全部相交曲線。' },
    { id: 'mergefaces', label: '合併面', icon: 'shell', tip: '合併面 Merge / Unify Same-Domain：點一個泊車曲面/殼 → 把同域（共面 / 共柱）相鄰碎面合併成一張面（裁剪 / 縫合 / 導入後清噪、易拾、STEP 更小）。體積不變，純拓撲合並。曲面分割的逆向清理。' },
    { id: 'extendface', label: '曲面延伸', icon: 'extrude', tip: '曲面延伸：點一個曲面/面 → 沿佢自然形狀向外延長指定 mm（平面變大 / 圓柱面變長 / 曲面順势外推）。出獨立曲面件,驳面前補料用。注：圓柱會沿縫拆面,只延伸你點中嗰半面。' },
    { id: 'formbox', label: 'Form 盒', icon: 'box', quick: true },      // T793：Form-lite 细分建模（拖控制點捏有机形）
    { id: 'formcyl', label: 'Form 圓柱', icon: 'box', tip: 'Form 圓柱：由一個圓柱控製籠開始 → 拖控製點捏成 瓶/握把/有機柱。周向段數越多,越贴近你輸入嘅半徑（細分會向內略收）。✔ 完成後烘焙成網格組件。' },
    { id: 'formplane', label: 'Form 平面', icon: 'box', tip: 'Form 平面/薄片：由一塊薄盒控製籠開始 → 拖控製點拉出有機曲面/殼片（座椅/翼面/外殼曲面）。✔ 完成後烘焙成網格組件。' },
    { id: 'formsphere', label: 'Form 球', icon: 'box', tip: 'Form 球：由一個球控製籠開始 → 拖控製點捏成 液滴/頭形/有機球。段數越多,越贴近你輸入嘅半徑（細分會向內略收）。✔ 完成後烘焙成網格組件。' },
    { id: 'formtorus', label: 'Form 環面', icon: 'box', tip: 'Form 環面/甜甜圈：由一個環形控製籠開始 → 拖控製點捏成 把手/O 形/扭環。主半徑 > 管半徑。✔ 完成後烘焙成網格組件。' },
    { id: 'formpatch', label: 'Form 曲面片', icon: 'box', tip: 'Form 開放曲面片：真·開放嘅有機曲面（車身板/外殼/有機曲面主用）—— 唔似 Form 平面嗰個薄盒,呢個系一張真開放網格,邊界自動順滑、四角钉死 → 拖藍點捏出平滑開放曲面。✔ 完成後烘焙成曲面網格（開放、非封閉）。' },
    { id: 'editpoles', label: '編輯曲面控制點', icon: 'editpoles', quick: true, tip: '編輯曲面控製點：點一個灰顯泊車曲面 → 顯示佢嘅控製點球 → 拖三軸箭嘴就整體扭曲張曲面。誠實局限：目前只支持單張曲面；跨縫順滑接驳後續再做。先用「規則曲面/曲面放樣」整一張弯曲曲面。' },
    { id: 'extrude', label: '拉伸', icon: 'extrude', quick: true },
    { id: 'revolve', label: '旋轉', icon: 'revolve', quick: true },
    { id: 'sweep', label: '掃掠', icon: 'sweep', quick: true },
    { id: 'loft', label: '放樣', icon: 'loft', quick: true },
    { id: 'pipe', label: '管道', icon: 'pipeicon' },
  ] },
  { name: 'MODIFY', tools: [
    { id: 'reversesurf', label: '翻轉曲面', icon: 'shell', quick: true, tip: '翻轉曲面：拣一張泊車曲面 → 掉轉佢嘅正反面（法向反向）。當「加厚」/「縫合」加错咗邊時用嚟修正方向。純翻向,唔重建幾何。' },
    { id: 'presspull', label: '加厚/按拉', icon: 'presspull', quick: true },
    { id: 'splitbody', label: '分割', icon: 'split', quick: true },
    { id: 'combine', label: '合併/切割', icon: 'combine', quick: true },
  ] },
  g('CONFIGURE'), g('CONSTRUCT'), g('INSPECT'), g('INSERT'), g('ASSEMBLE'),
  { name: 'SELECT', tools: [{ id: 'select', label: '選擇', icon: 'select', quick: true, tip: '選擇工具：撳零件/面/邊就拣中佢（撳空白處 = 唔拣）；撳 Del 鍵刪除所選。' }] },
]
const MESH: Panel[] = [
  { name: 'CREATE', tools: [
    { id: 'box', label: '長方體', icon: 'box', quick: true },
    { id: 'cylinder', label: '圓柱', icon: 'cylinder', quick: true },
    { id: 'sphere', label: '球', icon: 'sphere', quick: true },
  ] },
  { name: 'MODIFY', tools: [
    { id: 'meshfit', label: 'MeshFit / 轉 B-rep', icon: 'component', quick: true, tip: 'MeshFit：把所選（或唯一／最近導入）網格組件縫合為可編輯 B-rep 實體（平面/圓柱可參數化；其余 faceted）。完成後可圓角/抽殼/布爾/導出 STEP。有機掃掠件可能僅 faceted。' },
    { id: 'compboolean', label: '組件布爾', icon: 'combine', quick: true, tip: '組件布爾（網格級）：先選目標組件（或唯一有幾何組件），再點工具件 → 合併/切除/相交。亦可在 SOLID → ASSEMBLE 找到同名工具。' },
    { id: 'convert', label: '轉換', icon: 'component', tip: 'Fusion Convert：網格→B-rep（同 MeshFit）。BRep↔T-Spline 仍在實現。' },
  ] },
  g('CONFIGURE'), g('CONSTRUCT'), g('INSPECT'),
  { name: 'INSERT', tools: [
    { id: 'insertmesh', label: '插入STL网格', icon: 'importmesh', quick: true, tip: '插入 STL 網格（Alt+O / File→導入）。也可將 .stl/.obj/.3mf 拖到視口導入（推薦）。導入後可用 MeshFit / 轉 B-rep。' },
    { id: 'insert3mf', label: '插入3MF網格', icon: 'importmesh', quick: true, tip: 'MakerWorld / Printables 下載嘅 3MF 直接導入做組件——多零件保留擺位同顏色，單位自動轉 mm。' },
    { id: 'insertobj', label: '插入OBJ網格', icon: 'importmesh', quick: true, tip: 'Wavefront OBJ 網格導入（Blender / 掃掠 / 網上模型常用）作參考組件。' },
  ] },
  g('ASSEMBLE'),
  { name: 'SELECT', tools: [{ id: 'select', label: '選擇', icon: 'select', quick: true, tip: '選擇工具：撳零件/面/邊就拣中佢（撳空白處 = 唔拣）；撳 Del 鍵刪除所選。' }] },
  { name: 'EXPORT', tools: [
    { id: 'exportstl', label: '導出STL', icon: 'exportfile', quick: true },
    { id: 'exportasmstl', label: '導出裝配STL', icon: 'exportfile' },
    { id: 'exportasmobj', label: '導出裝配OBJ', icon: 'exportfile', tip: '把整個裝配（含各零件位姿）導出為單一 OBJ，供 Blender / 渲染器 / 游戏引擎用。' },
    { id: 'exportasm3mf', label: '導出裝配3MF', icon: 'exportfile', tip: '裝配 → 多對象 3MF：各零件獨立對象，直接送切片软件分件擺位打印（比合並 STL 更好）。' },
    { id: 'exportasmstep', label: '導出裝配STEP', icon: 'exportfile', tip: '裝配 → 彩色 STEP：零件名 + 顏色 + 位姿全保留,Fusion/FreeCAD/SolidWorks 直接打開。純網格導入件會跳過（冇精確實體來源）。' },
    { id: 'exportglb', label: '導出glTF/GLB', icon: 'exportfile' },
    { id: 'exportobj', label: '導出OBJ', icon: 'exportfile', tip: 'Wavefront OBJ 網格（通用 3D 交換格式，Blender / 游戏引擎 / 渲染器常用）。' },
    { id: 'export3mf', label: '導出3MF', icon: 'exportfile', tip: '3MF 現代 3D 打印格式（保留 mm 單位，Bambu Studio / PrusaSlicer / Cura 都支持，比 STL 更准）。' },
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
  { name: 'SELECT', tools: [{ id: 'select', label: '選擇', icon: 'select', quick: true, tip: '選擇工具：撳零件/面/邊就拣中佢（撳空白處 = 唔拣）；撳 Del 鍵刪除所選。' }] },
  { name: 'EXPORT', tools: [{ id: 'exportflatdxf', label: '導出展開DXF', icon: 'exportfile', quick: true, tip: '把鈑金件展開成平料 DXF（含 K 因子折彎餘量 + BEND 折彎線圖層），直接激光下料。' }, { id: 'exportstep', label: '導出STEP', icon: 'exportfile' }, { id: 'exportstl', label: '導出STL', icon: 'exportfile', tip: '導出二進製 STL（3D 打印通用）。' }, { id: 'exportstlascii', label: '導出STL(ASCII)', icon: 'exportfile', tip: 'ASCII 文本格式 STL（部分舊切片器/CAM/調試用，可讀）。' }] },
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
  { name: 'SELECT', tools: [{ id: 'select', label: '選擇', icon: 'select', quick: true, tip: '選擇工具：撳零件/面/邊就拣中佢（撳空白處 = 唔拣）；撳 Del 鍵刪除所選。' }] },
]
const MANAGE: Panel[] = [
  { name: 'PARAMETERS', tools: [{ id: 'params', label: '參數', icon: 'param', quick: true }] },
  { name: 'DRAWING', tools: [
    { id: 'drawing', label: '工程圖', icon: 'drawing', quick: true },
    { id: 'asmdrawing', label: '裝配工程圖', icon: 'drawing', quick: true, tip: '裝配三視圖 + 氣泡編號 + BOM 表（組件網格投影：輪廓+特徵邊）。需先有可見組件。' },
  ] },
]
// Fusion UTILITIES：MAKE · NEST · ADD-INS · UTILITY · INSPECT · SELECT。MAKE（3D 打印/送出）↔ 我哋嘅导出组。
const UTILITIES: Panel[] = [
  { name: 'MAKE', tools: [
    { id: 'exportstl', label: '導出STL', icon: 'exportfile', quick: true },
    { id: 'exportstep', label: '導出STEP', icon: 'exportfile', quick: true },
    { id: 'exportglb', label: '導出glTF', icon: 'exportfile' },
  ] },
  g('INSPECT'),
  { name: 'SELECT', tools: [{ id: 'select', label: '選擇', icon: 'select', quick: true, tip: '選擇工具：撳零件/面/邊就拣中佢（撳空白處 = 唔拣）；撳 Del 鍵刪除所選。' }] },
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
    { id: 'formsubdiv', label: '細分', icon: 'param', quick: true, tip: '細分：提高控製籠細分級（1–3）。預覽即時圓滑；完成造型時烘焙。' },
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
      { id: 'sk_polyline', label: '直線', icon: 'sketch', glyph: '╱', shortcut: 'L', quick: true, tip: '直線/折線：連續點擊畫多段相連直線,回到起點或撳「閉合」成輪廓。畫紧嗰陣撳 A 鍵 = 喺 直線 / 相切弧 之間切換（可以直線接弧再接直線）。打數字 = 精確長度；方向自動吸 水平/竖直/45°/平行/垂直。靠近圓會吸住圓嘅【象限點（上下左右最遠點）】,由上一點拉向圓會吸住【切點】令該段同圓相切。' },
      { id: 'sk_mline', label: '中點線', icon: 'sketch', glyph: '┿', tip: '中點線（Fusion Midpoint Line）：第一點 = 中點，第二點 = 一端 → 由中點向兩端對稱嘅直線段（做對稱基準/中心參照）。打數字 = 全長。' },
      { id: 'sk_rect', label: '矩形', icon: 'box', glyph: '▭', shortcut: 'R', quick: true, tip: '兩點矩形：點兩個對角點。打 宽 → Tab → 高 → Enter 精確尺寸。' },
      { id: 'sk_crect', label: '中心矩形', icon: 'box', glyph: '⊞', quick: true, tip: '中心矩形：先點中心，再點角點（關於中心對稱）。' },
      { id: 'sk_circle', label: '圓', icon: 'cylinder', glyph: '◯', shortcut: 'C', quick: true, tip: '圓心 + 半徑。打數字=精確半徑。' },
      { id: 'sk_circle2p', label: '兩點圓', icon: 'cylinder', glyph: '⊘', tip: '兩點圓（直徑兩端）：點直徑嘅兩端兩點定圓（第二點定直徑與方向）。打數字=精確直徑 Ø。' },
      { id: 'sk_circle3', label: '三點圓', icon: 'cylinder', glyph: '◓', tip: '三點圓：點三點定圓（外接圓）— 對齊已有特徵/孔位方便。' },
      { id: 'sk_circle2t', label: '兩切點圓', icon: 'cylinder', glyph: '◑', tip: '兩切點圓：點 2 條直線邊 + 設半徑 → 畫一個同兩條邊都相切嘅圓（自動加相切約束）。你點邊嗰一侧 = 圓落嗰一侧。' },
      { id: 'sk_circle3t', label: '三切點圓', icon: 'cylinder', glyph: '◒', tip: '三切點圓：點 3 條直線邊 → 畫一個同三條邊都相切嘅圓（內切圓/旁切圓,位置按你點擊嘅一侧自動定）。' },
      { id: 'sk_arc', label: '圓弧', icon: 'revolve', glyph: '⌒', shortcut: 'A', quick: true, tip: '三點圓弧：起點 → 終點 → 弧上一點（閉合成弓形）。' },
      { id: 'sk_arcc', label: '中心點弧', icon: 'revolve', glyph: '◠', tip: '中心點圓弧（Fusion 同款）：圓心 → 起點（定半徑）→ 終點（定弧長，取短向）。真圓弧，可標 R/相切。' },
      { id: 'sk_tanarc', label: '相切弧', icon: 'revolve', glyph: '⌒', tip: '相切弧（Fusion Tangent Arc）：點一條現有曲線嘅【端點】開始 → 引出一條同原曲線 G1 相切（平滑續接）嘅弧 → 逐點續弧。系「折線 + 相切弧」submode 嘅獨立入口，A 鍵可切返直線。' },
      { id: 'sk_rect3', label: '三點矩形', icon: 'box', glyph: '◇', tip: '三點矩形（斜矩形）：兩點定一條邊，第三點定宽 — 畫倾斜嘅矩形。' },
      { id: 'sk_polygon', label: '多邊形', icon: 'default', glyph: '⬡', quick: true, tip: '正多邊形（中心 + 半徑）；草圖栏可設邊數 / 內切外接。' },
      { id: 'sk_spline', label: '樣條', icon: 'sweep', glyph: '∿', quick: true, tip: '樣條曲線：連續點擊一串點 → 畫出一條【經過每一個點】嘅平滑曲線。想畫順滑自由曲線時用（拉伸/旋轉出真平滑曲面）。' },
      { id: 'sk_bspline', label: 'B樣條', icon: 'sweep', glyph: '⟿', quick: true, tip: 'B樣條：連續點擊一串控製點 → 畫出被呢啲點「拉扯」出嚟嘅平滑曲線（唔一定經過控製點,但比樣條更順滑）。想要極順滑曲線時用（拉伸/旋轉出真平滑曲面）。' },
      { id: 'sk_slot', label: '槽', icon: 'default', glyph: '⬭', quick: true, tip: '腰形槽：兩端中心 + 槽宽（草圖栏設槽宽）。' },
      { id: 'sk_arcslot', label: '圓弧槽', icon: 'default', glyph: '◜', tip: '圓弧槽：弧心 + 一端 + 另一端，沿弧的腰形槽。' },
      { id: 'sk_rrect', label: '圓角矩形', icon: 'box', glyph: '▢', quick: true, tip: '圓角矩形：對角兩點 + 圓角半徑（草圖栏設半徑）。' },
      { id: 'sk_ellipse', label: '橢圓', icon: 'cylinder', glyph: '⬯', quick: true, tip: '椭圓：中心 + 半軸。' },
      { id: 'sk_earc', label: '橢圓弧', icon: 'cylinder', glyph: '◡', tip: '椭圓弧：中心 → 長軸端（定 rx+旋轉）→ 短軸半徑 → 起角 → 終角（工具面板選擇順 / 逆時针）。真椭圓邊，閉合成弓形可拉伸。' },
      { id: 'sk_conic', label: '圓錐曲線', icon: 'cylinder', glyph: '⌓', tip: '圓锥曲線：起點 → 終點 → 頂點（兩端切線嘅交點）→ 喺底栏調「充滿度」(細 = 扁椭圓弧 / 中 = 抛物線 / 大 = 雙曲線)。畫出真平滑精確邊。' },
      { id: 'sk_point', label: '點', icon: 'default', glyph: '·', quick: true, tip: '草圖點：單击落一個構造點（可約束/可標尺寸）— 鑽孔定位、對稱锚點日常。' },
      { id: 'sk_cline', label: '構造線', icon: 'default', glyph: '┊', quick: true, tip: '構造參考線：點位置即落一條 竖直/水平 長虛線（工具面板切方向）。做對中參考、或做鏡像嘅【中心軸】。唔參與拉伸。' },
      { id: 'sk_text', label: '文字', icon: 'default', glyph: 'T', tip: '草圖文字（Fusion 流程一步到位）：輸入 文字/字號/凸高 → 凸字（切割模式=刻字）特徵，時間軸可改。' },
    ],
  },
  {
    name: 'MODIFY',
    tools: [
      { id: 'sk_trim', label: '修剪', icon: 'default', glyph: '✂', shortcut: 'T', quick: true, tip: '修剪（T，Fusion 同款）：點要剪走嗰段 — 剪到同其它幾何嘅相交點；冇相交成條刪。閉合輪廓剪完變開放路徑。' },
      { id: 'sk_extend', label: '延伸', icon: 'default', glyph: '⟶', tip: '延伸：點開放路徑嘅端段 — 沿原方向（直線）/原圓（弧）延長到最近相交幾何。' },
      { id: 'sk_break', label: '打斷', icon: 'default', glyph: '⊟', tip: '打斷（Fusion Break）：點曲線上一點 → 一分為二，兩段都保留（近相交點會吸到精確交點）。' },
      { id: 'sk_filletc', label: '倒圓角', icon: 'fillet', glyph: 'r⌒', quick: true, tip: '點近一個直角頂點倒嗰個角（半徑=草圖栏「圓角R」；或底栏「全部角」一次過倒晒）。' },
      { id: 'sk_chamferc', label: '倒斜角', icon: 'chamfer', glyph: 'C∠', quick: true, tip: '倒斜角：撳近一個直角頂點,把嗰個角倒成一條直斜邊（回縮量 = 草圖栏「圓角R」；或撳底栏「全部角」一次過倒晒）。' },
      { id: 'sk_offset', label: '偏移', icon: 'default', glyph: '⧉', quick: true, tip: '平行偏移當前輪廓（草圖栏設距離，正外/負內）。' },
      { id: 'sk_union', label: '合併輪廓', icon: 'combine', glyph: '∪', quick: true, tip: '合併兩個重疊輪廓做一個外框：㩒此即入拾取 → 點第一個輪廓 → 點第二個（即合併）。真圓弧保持。（或先用選擇工具選好兩個再㩒）' },
      { id: 'sk_subtract', label: '剪走輪廓', icon: 'combine', glyph: '∖', tip: '從第一個輪廓剪走第二個（A−B）：㩒此即入拾取 → 點【保留件】 → 點【剪走件】（即運算）。挖穿出環（外框+孔）/横切裂體都得 — 拉伸自動嵌套判孔。' },
      { id: 'sk_mirrory', label: '鏡像', icon: 'mirror', glyph: '⇋', quick: true, tip: '鏡像（Fusion 式 2 步）：①點中要鏡像嘅輪廓（點一個=拣晒成條相連邊，可多個）→「✓拣軸線」→ ②點一條現有【直線邊/構造線】做鏡像軸 → 反射（保留原件）。工具面板仲有「左右軸/上下軸」一鍵對稱。' },
      { id: 'sk_mirrorx', label: '上下鏡像', icon: 'mirror', glyph: '⇅', tip: '上下鏡像（一鍵 across X 軸對稱當前輪廓）。' },
      { id: 'sk_array', label: '陣列', icon: 'pattern', glyph: '▦', quick: true, tip: '陣列（Fusion 式）：㩒此入陣列模式 → 底栏面板設 矩形(行列+間距) / 環形(數量+角度+中心)，绿虛線實時預覽 → 撳「應用陣列」。對【一個】輪廓。' },
      { id: 'sk_move', label: '移動/複製', icon: 'move', glyph: '✥', tip: '移動/複製當前輪廓：dx,dy 平移 + 繞形心旋轉，可出 N 份副本（Fusion Move/Copy）。' },
      { id: 'sk_scale', label: '縮放', icon: 'scale', glyph: '⤢', tip: '草圖縮放（Fusion Sketch Scale）：選中輪廓（無選擇=全部）繞形心乘系數 k（>1 放大 / <1 縮小；真圓弧/椭圓半徑同步縮放）。快捷鍵喺草圖內可用（M=移動 / 縮放喺 ribbon）。' },
      { id: 'sk_project', label: '投影幾何', icon: 'default', glyph: '⧉', quick: true, tip: '投影幾何：把實體嘅邊「印」落當前草圖做【真草圖曲線】(藍紫參考線) —— 印落嚟嘅線可標注/拉伸/修改,唔再只系參考。想沿住實體輪廓畫嘢時用：撳掣後點實體嘅邊即可。（要喺有實體嘅面、或穿過實體嘅平面開草圖先印到）' },
      { id: 'sk_constr', label: '構造', icon: 'default', glyph: '╳', shortcut: 'X', tip: '構造幾何（X）：把選中輪廓（或當前輪廓）轉為虛線參考幾何 — 可約束可吸附，唔參與拉伸。再按一次轉返實線。' },
      { id: 'sk_guide', label: '掃掠導軌', icon: 'sweep', glyph: '⤳', tip: '導軌掃掠（Fusion guide rail）：先畫一條折線做【導軌】→ 撳此記低（橙虛線）→ 再畫掃掠【路徑】→「沿路徑掃掠」— 截面沿路徑行進時跟住導軌轉向。' },
      { id: 'sk_close', label: '閉合', icon: 'default', glyph: '✓', sep: true, quick: true, tip: '把折線/樣條回到起點閉合成輪廓。' },
      { id: 'sk_dxf', label: '導出DXF', icon: 'default', glyph: '⤓', tip: '把當前草圖輪廓導出為 2D DXF（激光切割 / AutoCAD）。' },
    ],
  },
  {
    // Fusion's sketch CONSTRAINTS group: select geometry → apply a relationship; D = dimension.
    name: 'CONSTRAINTS',
    tools: [
      { id: 'sk_select', label: '選擇', icon: 'select', glyph: '↖', quick: true, tip: '選擇工具：點 點/邊/圓（最多 2 個）,再撳下面約束掣套用關系；撳 Del 鍵刪除所選。' },
      { id: 'sk_dim', label: '尺寸', icon: 'measure', glyph: '⟷', shortcut: 'D', quick: true, tip: '尺寸（D）：點一條邊 → 再點【放置位置】定方向（垂直偏置=對齊真長 · 左右放=竖直投影 · 上下放=水平投影）· 圓=直徑Ø · 兩個點=距離 · 點兩條邊（平行=間距 / 相交=夹角）。藍色標签可撳改數值（約束求解）；右鍵尺寸標签 = R↔Ø 切換 / 轉從動 / 刪除。過約束會弹框問【轉從動 / 取消】。' },
      { id: 'sk_c_h', label: '水平', icon: 'default', glyph: '━', sep: true, quick: true, tip: '水平：選 1 條邊（或 2 個點）→ 變水平。' },
      { id: 'sk_c_v', label: '豎直', icon: 'default', glyph: '┃', quick: true, tip: '竖直：選 1 條邊（或 2 個點）→ 變竖直。' },
      { id: 'sk_c_hv', label: '水平/豎直', icon: 'default', glyph: '┼', tip: '水平/竖直（合一，Fusion 單命令）：選一條或多條邊 → 按每條邊嘅方向自動判定水平定竖直施加（横向→水平 / 纵向→竖直）。' },
      { id: 'sk_c_coin', label: '重合', icon: 'default', glyph: '◉', quick: true, tip: '重合：選 2 個點 → 焊埋一齊；或 點+邊 → 點落在邊上。' },
      { id: 'sk_c_par', label: '平行', icon: 'default', glyph: '∥', quick: true, tip: '平行：選 2 條邊。' },
      { id: 'sk_c_perp', label: '垂直', icon: 'default', glyph: '⊥', quick: true, tip: '垂直：選 2 條邊 → 成 90°。' },
      { id: 'sk_c_eq', label: '相等', icon: 'default', glyph: '＝', quick: true, tip: '相等：選 2 條邊（等長）或 2 個圓（等徑）。' },
      { id: 'sk_c_tan', label: '相切', icon: 'default', glyph: '⌒', quick: true, tip: '相切：整椭圓＋直線先預覽接触候選，再按此確認；接触在線段外時顯示虛線延長。整段椭圓弧只取有向范圍內接触候選；選橙色端點＋直線則使用端點相切。圓／圓弧沿用現有相切方式。' },
      { id: 'sk_c_fix', label: '固定', icon: 'default', glyph: '⚓', quick: true, tip: '固定：選 1 個點 / 1 條邊 / 1 個圓·弧 → 整體钉死唔郁（邊=兩端點、圓=圓心+半徑）。' },
      { id: 'sk_c_mid', label: '中點', icon: 'default', glyph: '⊹', tip: '中點：選 1 個點 + 1 條邊/弧 → 點鎖到邊中點（弧=真弧中點，非弦中點）。' },
      { id: 'sk_c_conc', label: '同心', icon: 'default', glyph: '◎', tip: '同心：選 2 個圓 → 圓心重合。' },
      { id: 'sk_c_coll', label: '共線', icon: 'default', glyph: '≣', tip: '共線：選 2 條邊 → 排成同一直線。' },
      { id: 'sk_c_sym', label: '對稱', icon: 'default', glyph: '⇆', tip: '對稱：選 2 個點 / 2 條邊 / 2 個圓·弧 + 1 條邊（軸）→ 關於軸對稱（圓對稱連半徑相等）。' },
      { id: 'sk_d_angle', label: '角度', icon: 'default', glyph: '∠', sep: true, tip: '角度尺寸：用選擇工具點 2 條邊 → 標夹角（度，可點改驱動幾何）。' },
      { id: 'sk_autoconstrain', label: '自動約束', icon: 'default', glyph: '✨', tip: 'AutoConstrain（Fusion wand）：對【選中集】（無選擇=全部幾何）一次推斷多約束（重合/平行/垂直/相切/等半徑）。绘製時嘅自動推斷喺工具面板可開關。' },
      { id: 'sk_uncon', label: '撤約束', icon: 'undo', glyph: '↶', tip: '移除最後一個約束/尺寸並重新求解（冲突時用）。約束徽章亦可逐個點擊移除。' },
    ],
  },
  {
    name: 'FINISH',
    tools: [
      { id: 'sk_extrude', label: '拉伸', icon: 'extrude', glyph: '⬆', shortcut: 'E', quick: true, tip: '打開拉伸面板（操作 / 范圍 / 距離 / 拔模角）。' },
      { id: 'sectionprops', label: '截面屬性', icon: 'default', glyph: 'Σ', tip: '截面屬性（Fusion Section Properties）：對草圖封閉輪廓算 面積 / 形心 / 截面慣矩 Ixx·Iyy·Ixy / 主軸 / 周長（梁弯曲/強度輸入）。最大輪廓=外形，內含=孔（自動扣除），分離輪廓忽略。再撳關。' },
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
