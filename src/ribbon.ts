import { simplifiedToTraditionalHK } from './i18n/sc2tcHK'

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
      { id: 'sketch', label: '建立草圖', icon: 'sketch', shortcut: 'Shift+S', quick: true, tip: '自由草圖：快速畫矩形/圓/折線等，滑鼠點擊即畫（新手首選）。按了之後選基準面 —— 紅XY/綠XZ/藍YZ 原點面，或直接按實體的任何一個平坦面。（S=命令搜尋）' },
      { id: 'createform', label: '建立造型', icon: 'box', quick: true, tip: '切換到 FORM 細分建模環境；完成後用「完成造型」返回實體。' },
      { id: 'derive', label: 'Derive', icon: 'component', tip: '從另一個設計派生組件、實體、草圖或參數。' },
      { id: 'automatedmodel', label: 'Automated Modeling', icon: 'component', tip: 'Connector v1：依次點兩張平面面，建立獨立連接器實體。當前不含避讓體、曲面面或生成式多方案。' },
      { id: 'extrude', label: '拉伸', icon: 'extrude', shortcut: 'E', quick: true, sep: true, tip: '拉伸：畫好草圖輪廓後，沿垂直方向拉出/切入實體。彈面板設 加料/切割 · 距離 · 拔模角 · 貫通。' },
      { id: 'revolve', label: '旋轉', icon: 'revolve', quick: true, tip: '旋轉：草圖輪廓繞一條軸旋轉成回轉體（軸/盤/車削件）。可加料/切割車槽/相交，薄壁>0 做燈罩/碗殼。' },
      { id: 'sweep', label: '掃掠', icon: 'sweep', quick: true, tip: '掃掠：一個截面沿你畫的路徑掃出實體（管/導軌）。先畫折線/樣條路徑，壁厚>0 出空心管。' },
      { id: 'loft', label: '放樣', icon: 'loft', quick: true, tip: '放樣：在兩個或多個截面之間平滑過渡成實體。截面可來自 XY/XZ/YZ 或任意參考平面；按選擇次序加入。' },
      { id: 'rib', label: '加強筋', icon: 'rib', tip: '加強筋/腹板：沿草圖中心線生成薄筋並落到實體底面融合（增強結構）。' },
      { id: 'web', label: '腹板', icon: 'rib', tip: '選擇一條或多條開放草圖線建立薄腹板；Extend Curves 預設開啟，會把線端延伸到鄰近實體牆面。' },
      { id: 'emboss', label: 'Emboss', icon: 'emboss', quick: true, tip: '浮雕（凸字／刻字）：點實體一個【平面】→ 對話框輸入文字、字高、深度並選擇凸起或刻入（即時預覽）。標牌／編號／標誌。' },
      { id: 'hole', label: '孔', icon: 'hole', shortcut: 'H', quick: true, sep: true, tip: '孔：在實體面上鑽孔（通/盲 · 沉頭 · 埋頭 · 螺母槽 · 攻牙底孔），有 M3-M12 標準尺寸。' },
      { id: 'facethread', label: '螺紋', icon: 'thread', tip: '點一個圓柱面（外圓面=外螺紋／孔內壁=內螺紋）→ 自動讀入直徑/長度；標準尺寸 M3–M24＋螺距、全長／自訂長度＋偏移、外觀（cosmetic，預設）或建模螺紋。v1 只支援 Z 軸圓柱面。' },
      { id: 'thread', label: '螺紋桿', icon: 'thread', tip: '螺紋桿：真漸開螺旋牙（非貼圖）。設大徑Ø/螺距/高。' },
      // UX3 #3：基本體（長方體／圓柱／球…）一直只喺 CREATE ▾ 入面，工具列只有「圓錐」（仲借用圓柱圖示）→ 有模型時用家搵唔到。
      // 依家同 Fusion 一樣：工具列有「長方體」快捷掣 + ▾ 展開全部基本體。
      { id: 'box', label: '長方體', icon: 'box', sep: true, quick: true, tip: '長方體：直接設長×寬×高建一個盒（最常用起手）。旁邊 ▾ 選圓柱／球／圓環／圓錐／螺旋。', quickChildren: [
        { id: 'box', label: '長方體', icon: 'box', tip: '長方體：設長×寬×高＋位置。' },
        { id: 'cylinder', label: '圓柱', icon: 'cylinder', tip: '圓柱：設直徑×高＋位置。' },
        { id: 'sphere', label: '球', icon: 'sphere', tip: '球：設直徑＋位置。' },
        { id: 'torus', label: '圓環', icon: 'torus', tip: '圓環：設外徑＋管徑。' },
        { id: 'cone', label: '圓錐', icon: 'cone', tip: '圓錐／圓台：設底Ø／頂Ø／高＋位置。' },
        { id: 'coil', label: '螺旋', icon: 'coil', tip: '螺旋／彈簧。' },
      ] },
      { id: 'cylinder', label: '圓柱', icon: 'cylinder', tip: '圓柱：設直徑×高直接建圓柱。' },
      { id: 'sphere', label: '球', icon: 'sphere', tip: '球：設直徑建球。' },
      { id: 'torus', label: '圓環', icon: 'torus', tip: '圓環：設外徑+管徑，弧<360° 出 C 形環/卡簧。' },
      { id: 'cone', label: '圓錐', icon: 'cone', tip: '圓錐/圓台：設底Ø/頂Ø(0=尖錐)/高，邊數≥3 變 N 棱錐/棱台。' },
      { id: 'coil', label: '螺旋', icon: 'coil', tip: '螺旋/彈簧：設節距/高/底半徑/線徑/頂半徑（頂≠底=錐形彈簧）。' },
      { id: 'pipe', label: '管道', icon: 'pipeicon', tip: '管道：沿路徑掃出空心管（外徑+壁厚）。先畫路徑折線。' },
      {
        id: 'pattern', label: '陣列', icon: 'pattern', quick: true, sep: true, tip: '陣列：矩形 / 環形 / 沿路徑 複製實體或孔。快捷圖示旁 ▾ 可選環形／路徑／幾何。',
        children: [
          { id: 'pattern', label: '矩形陣列', icon: 'pattern', tip: '沿 X/Y(/Z) 方向複製實體或孔成網格。' },
          { id: 'circpattern', label: '環形陣列', icon: 'cpattern', tip: '繞任意軸等角度複製：對象 = 整個實體或時間軸所選特徵（螺栓孔圈/輻條），角度 = 完整360°/指定/對稱。' },
          { id: 'geopattern', label: '幾何陣列', icon: 'pattern', tip: '複製所選時間軸特徵，並為每個實例指定平移或旋轉變換。' },
          { id: 'pathpattern', label: '路徑陣列', icon: 'pathpattern', tip: '先建實體→畫折線/樣條路徑→沿路徑等距複製實體。' },
        ],
        // Fusion Pattern flyout: quick icon = rectangular default; caret opens circular/path/geo (same list as CREATE ▾ → 陣列 ▸).
        quickChildren: [
          { id: 'pattern', label: '矩形陣列', icon: 'pattern', tip: '沿 X/Y(/Z) 方向複製實體或孔成網格。' },
          { id: 'circpattern', label: '環形陣列', icon: 'cpattern', tip: '繞任意軸等角度複製：對象 = 整個實體或時間軸所選特徵（螺栓孔圈/輻條），角度 = 完整360°/指定/對稱。' },
          { id: 'geopattern', label: '幾何陣列', icon: 'pattern', tip: '複製所選時間軸特徵，並為每個實例指定平移或旋轉變換。' },
          { id: 'pathpattern', label: '路徑陣列', icon: 'pathpattern', tip: '先建實體→畫折線/樣條路徑→沿路徑等距複製實體。' },
        ],
      },
      { id: 'mirror', label: '鏡像', icon: 'mirror', quick: true, tip: '鏡像特徵/實體：跨基準面（XY/XZ/YZ 或所選面）對稱複製選中的特徵或整個實體。同「陣列」配對的常用建模操作。' },
      { id: 'thicken', label: '加厚', icon: 'thicken', quick: true, sep: true, tip: '點實體或曲面一個面，沿法向加厚成實體薄板；負值翻轉方向。' },
      { id: 'boundaryfill', label: 'Boundary Fill', icon: 'combine', tip: '用實體、曲面與工作平面分割空間，再選擇要保留的 cell。' },
      { id: 'basefeature', label: 'Create Base Feature', icon: 'newbody', tip: '進入直接建模 Base Feature 環境。' },
      { id: 'createpcb', label: 'Create PCB', icon: 'component', tip: '建立或關聯 PCB。' },
      { id: 'jointorigin', label: '關節原點', icon: 'jointorigin', sep: true, tip: '點實體面心、圓柱孔心或頂點建立可複用命名關節坐標幀。' },
    ],
  },
  {
    name: 'MODIFY',
    tools: [
      { id: 'presspull', label: '按拉', icon: 'presspull', shortcut: 'Q', quick: true, tip: '按/拉：點實體一個平面，沿法向推出或壓入（快速加/減料）。' },
      { id: 'editface', label: '編輯面', icon: 'move', tip: '選擇一個或多個平面面，直接偏移或傾斜並重解相鄰面。' },
      { id: 'fillet', label: '圓角', icon: 'fillet', shortcut: 'F', quick: true, sep: true, tip: '圓角：點選棱（可多條）倒成圓弧，設半徑（末端半徑≠起始=變半徑圓角）。', quickChildren: [
        { id: 'fillet', label: '圓角', icon: 'fillet', shortcut: 'F', tip: '圓角：點選棱（可多條）倒成圓弧。' },
        { id: 'chamfer', label: '倒角', icon: 'chamfer', shortcut: 'C', tip: '倒角：等距 / 兩距離 / 距離+角度。' },
      ] },
      { id: 'chamfer', label: '倒角', icon: 'chamfer', shortcut: 'C', tip: '倒角（Chamfer）：點選棱切斜角。支援等距 / 兩距離 / 距離+角度。' },
      { id: 'shell', label: '抽殼', icon: 'shell', quick: true, sep: true, tip: '抽殼：把實體掏空成等壁厚殼，選開口面。建議在圓角之前做。' },
      { id: 'draft', label: '拔模', icon: 'draft', tip: '拔模：給側面加脫模斜度（注塑/鑄造件必備）。' },
      { id: 'scale', label: '縮放', icon: 'scale', tip: '縮放：按比例放大/縮小實體。' },
      { id: 'combine', label: '合併/切割', icon: 'combine', quick: true, tip: '合併/布爾：把 活動實體(目標) 同 獨立實體(工具) 做 併起 / 切走 / 相交 —— 出真精確實體（對話框選操作 + 勾要用的工具體）。要先用「新實體」整多於一個實體先做到。' },
      { id: 'offsetface', label: '偏移面', icon: 'replaceface', tip: '點實體一個或多個平面，沿法向原地偏移；可選擇修改現有特徵、新偏移或自動。' },
      { id: 'replaceface', label: '替換面', icon: 'replaceface', tip: '選擇來源面及目標面／平面，以目標幾何延伸或裁切實體。當前精確支援平面目標。' },
      { id: 'splitface', label: '分割面', icon: 'splitface', tip: '用平面或曲面工具分割所選面，實體體積保持不變。' },
      { id: 'splitbody', label: '分割實體', icon: 'split', quick: true, tip: '分割實體：用切割平面把一個實體切成兩個獨立體（參數化）。' },
      { id: 'silhouettesplit', label: '輪廓分割', icon: 'splitface', tip: '按所選平面或軸的視圖方向，由輪廓曲線生成曲面，再分割面、抽殼實體或實體。' },
      { id: 'move', label: '移動/複製', icon: 'move', shortcut: 'M', quick: true, sep: true, tip: '移動／複製：平移、自由移動、旋轉或點到點移動實體／組件，並可建立副本。' },
      { id: 'align', label: '對齊', icon: 'combine', tip: '對齊：先點基準面（不移動該件）再點要移動件的面 —— 平面貼平 / 圓柱對準同軸。一次性快捷,不記錄配合；想要持久配合用「關節(選面)」。' },
      { id: 'delete', label: '刪除', icon: 'trash', tip: '刪除：刪除選中的特徵或組件。' },
      { id: 'remove', label: '移除', icon: 'trash', tip: '從當前設計移除所選組件實例；外部來源設計仍然保留。' },
      { id: 'arrange', label: '排列', icon: 'pattern', sep: true, tip: '選擇組件、排列平面及包覆面參數，為製造自動排料。' },
      {
        id: 'simplify', label: '簡化', icon: 'scale', tip: '刪除小特徵／面，或用基本體替換複雜對象。',
        children: [
          { id: 'removefeatures', label: '刪除特徵', icon: 'trash', tip: '自動識別並刪除選定實體上的小孔、圓角、倒角等特徵。' },
          { id: 'removefaces', label: '刪除面', icon: 'trash', tip: '刪除選定面並自動延伸相鄰面來治癒實體。' },
          { id: 'replaceprimitives', label: '使用基本體替換', icon: 'box', tip: '用長方體、圓柱體或球體替換所選對象，並抑製原對象。' },
        ],
      },
      { id: 'vollattice', label: '體積晶格', icon: 'pattern', sep: true, tip: '在封閉實體內部建立體積晶格。' },
      { id: 'voltexture', label: '體積紋理', icon: 'appearance', tip: '將體積紋理套用到實體。' },
      { id: 'volmodify', label: '修改體積晶格', icon: 'move', tip: '編輯已有體積晶格特徵。' },
      { id: 'physicalmaterial', label: '物理材質', icon: 'appearance', sep: true, tip: '只設密度及物理屬性，影響質量、慣量、FEA 與 BOM；不會改變外觀。' },
      { id: 'appearance', label: '外觀', icon: 'appearance', shortcut: 'A', tip: '打開外觀材質球面板，修改顏色、金屬度、粗糙度及紋理。' },
      { id: 'managematerials', label: '管理材質', icon: 'appearance', tip: '打開具名外觀材質庫，儲存、套用或刪除自訂材質預設。' },
      { id: 'params', label: '更改參數', icon: 'param', sep: true, tip: '打開用戶參數及表達式面板。' },
      { id: 'computeall', label: '全部計算', icon: 'param', shortcut: 'Ctrl+B', tip: '由時間軸起點重新計算全部特徵。' },
      { id: 'computeunresolved', label: '計算未解析', icon: 'param', tip: '只計算與未解析外部組件有關的特徵。' },
      { id: 'convert', label: '轉換', icon: 'component', sep: true, tip: 'Convert / MeshFit：網格組件 → 可編輯 B-rep（自動識別圓柱/棱柱；否則 faceted）。BRep↔T-Spline 仍在實現。亦可搜「meshfit」。' },
      { id: 'bom', label: 'BOM 表', icon: 'drawing', quick: true, sep: true, tip: '打開此設計的材料清單；WebCAD 可按組件名稱、數量、物理材質及質量匯出 CSV。' },
    ],
  },
  {
    name: 'CONFIGURE',
    tools: [
      { id: 'params', label: '參數', icon: 'param', quick: true, tip: '用戶參數（ƒx 命名變量/表達式，綁定到尺寸，改一處全聯動）。' },
    ],
  },
  {
    name: 'CONSTRUCT',
    // Fusion live-capture 次序；每项预设同一个 Construction Geometry 对话框嘅 Type + Method。
    tools: [
      { id: 'ucs', label: '用戶坐標系', icon: 'axis', quick: true, tip: '點實體平面建立一套局部原點、三軸及三正交參考面。' },
      { id: 'datumgeom', label: '構造幾何', icon: 'plane', tip: '在一個面板中建立參考平面、構造軸或構造點；適用於圓柱、圓錐等沒有可用平面側面的實體。' },
      { id: 'offsetplane', label: '偏移平面', icon: 'plane', quick: true, sep: true, tip: '在畫布點選實體平面作偏移基準（偏移由該面起計；點選兩個平行面則建立中間平面），或不選面而由原點 XY／XZ／YZ 基準面起計，輸入距離建立平行參考面。' },
      { id: 'planeangedge', label: '成角平面', icon: 'plane', tip: '拾取直邊／軸並輸入角度，建立包含該邊的傾斜平面。' },
      { id: 'planetan', label: '相切平面', icon: 'plane', tip: '拾取圓柱面及參考方向，在指定位置建立相切平面。' },
      { id: 'planemid', label: '中間平面', icon: 'plane', tip: '請選取兩個平行面，在兩者正中建立參考面。' },
      { id: 'planeperp', label: '垂直平面', icon: 'plane', tip: '拾取平面及參考邊，在指定距離建立垂直平面。' },
      { id: 'plane2edge', label: '過兩邊平面', icon: 'plane', tip: '順序拾取兩條邊，建立同時包含兩邊的參考面。' },
      { id: 'plane3pt', label: '過三點平面', icon: 'plane', tip: '用最後三個構造點建立參考面。' },
      { id: 'planepath', label: '沿路徑平面', icon: 'plane', tip: '拾取路徑並以 0–1 距離定位，建立垂直於路徑切向的平面。' },
      { id: 'axiscyl', label: '圓柱／圓錐／環面軸', icon: 'axis', quick: true, sep: true, tip: '拾取旋轉面建立其中心軸。' },
      { id: 'axisperpface', label: '垂直面軸', icon: 'axis', tip: '拾取平面上的一點，建立沿面法向的構造軸。' },
      { id: 'axis2planes', label: '過兩平面軸', icon: 'axis', tip: '拾取兩個不平行平面，以交線建立構造軸。' },
      { id: 'axis2pt', label: '過兩點軸', icon: 'axis', tip: '用最後兩個構造點建立任意方向軸。' },
      { id: 'axisedge', label: '沿邊軸', icon: 'axis', tip: '拾取一條直邊，以該邊建立構造軸。' },
      { id: 'pointvertex', label: '頂點構造點', icon: 'cpoint', quick: true, sep: true, tip: '拾取一條邊，在最近端點建立構造點。' },
      { id: 'point2edges', label: '兩邊交點', icon: 'cpoint', tip: '拾取兩條邊，在交點或最近逼近點建立構造點。' },
      { id: 'point3planes', label: '三平面交點', icon: 'cpoint', tip: '拾取三個平面，在唯一公共交點建立構造點。' },
      { id: 'pointcenter', label: '圓／球／環面中心點', icon: 'cpoint', tip: '拾取圓形邊，在擬合中心建立構造點。' },
      { id: 'pointedgeplane', label: '邊與平面交點', icon: 'cpoint', tip: '拾取邊及平面，在交點建立構造點。' },
      { id: 'pointpath', label: '沿路徑點', icon: 'cpoint', tip: '拾取路徑，以 0–1 比例或毫米距離定位構造點。' },
    ],
  },
  {
    name: 'INSPECT',
    tools: [
      { id: 'measureuni', label: '測量', icon: 'measure', shortcut: 'I', quick: true, tip: '一個命令測量面、邊、點及其組合；顯示長度、面積、角度、最短距離及 ΔXYZ。' },
      { id: 'interference', label: '干涉檢查', icon: 'interference', tip: '干涉檢查：先選擇參與檢查的組件，再按「計算」，以實體布爾相交求出真實重疊體積及所涉組件。' },
      { id: 'curvcomb', label: '曲率梳分析', icon: 'curvature', sep: true, tip: '沿曲面顯示曲率梳齒，檢查曲率變化及接縫連續性。' },
      { id: 'zebra', label: '斑馬紋分析', icon: 'section', tip: '以反射條紋檢查曲面切向連續及光順度。' },
      { id: 'draftanalysis', label: '拔模分析', icon: 'draft', tip: '按脫模方向着色正拔模、倒扣及垂直區域。' },
      { id: 'curvmap', label: '曲率圖分析', icon: 'curvature', tip: '以色譜顯示曲面彎曲趨勢。' },
      { id: 'accessanalysis', label: '可達性分析', icon: 'draft', tip: '沿指定方向檢查被實體自身遮擋、工具或模具不可達的區域。' },
      { id: 'minradius', label: '最小半徑分析', icon: 'curvature', tip: '找出模型最小局部曲率半徑及位置。' },
      { id: 'section', label: '剖切分析', icon: 'section', quick: true, tip: '以可調剖切平面檢查實體內部。' },
      { id: 'centerofmass', label: '質心', icon: 'measure', sep: true, tip: '切換顯示實體或裝配的體積加權質心標記。' },
      { id: 'properties', label: '物理屬性', icon: 'measure', tip: '查看所選實體或組件的質量、體積、表面積、重心與材料。' },
      { id: 'meshfacegroups', label: '顯示網格面組', icon: 'draft', sep: true, shortcut: 'Shift+F', tip: '切換網格面組顏色顯示。' },
    ],
  },
  {
    name: 'INSERT',
    tools: [
      { id: 'insertcomponent', label: '插入組件', icon: 'component', quick: true, tip: '從 STEP／STP 或 WebCAD 零件 JSON 選取零件或裝配，作為獨立組件插入當前設計；保留多零件的相對位置。JSON 不會取代當前文件（開啟舊檔案才會）。當前不建立雲端/F3D 的關聯鏈接。' },
      { id: 'insertfastener', label: '插入緊固件', icon: 'component', quick: true, tip: '選內建 ISO 緊固件類型、M 規格與長度後插入獨立裝配組件。幾何尺寸真實；螺紋以簡化光桿表示，不偽稱 Autodesk 雲端供應商庫。' },
      { id: 'insertmesh', label: '插入STL網格', icon: 'importmesh', quick: true },
      { id: 'insert3mf', label: '插入3MF網格', icon: 'importmesh', quick: true, tip: 'MakerWorld / Printables 下載的 3MF 直接匯入做組件——多零件保留擺位與顏色，單位自動轉 mm。' },
      { id: 'insertobj', label: '插入OBJ網格', icon: 'importmesh', quick: true, tip: 'Wavefront OBJ 網格匯入（Blender、掃掠或網上模型常用）作參考組件。' },
      { id: 'insertcanvas', label: '畫布', icon: 'importmesh', sep: true, tip: '選擇參考圖片，放到當前草圖平面作為描摹底圖；加入後可調寬度、透明度、位置、旋轉、翻轉及兩點標定比例。' },
      { id: 'insertdecal', label: '貼花', icon: 'importmesh', tip: '選擇 logo／標籤圖片，然後點擊實體表面放置；可調尺寸、旋轉、透明度及翻轉，並隨項目儲存。' },
      { id: 'importdxf', label: '匯入DXF', icon: 'importdxf', quick: true, tip: '匯入 2D DXF 輪廓並拉伸成 3D（激光切割圖 / 網上輪廓 → 可打印實體）。支援 LINE/多段線/圓/圓弧，自動識別外形+孔，拉伸 5mm（時間軸可改）。' },
      { id: 'importsvg', label: '匯入SVG', icon: 'importsvg', quick: true, tip: '匯入 SVG 矢量圖形並拉伸成 3D（logo / 圖標 / 網上矢量 → 可打印實體）。曲線自動展平，支援 path/圓/矩形/多邊形，自動識別外形+孔，拉伸 5mm（時間軸可改）。' },
    ],
  },
  {
    // Fusion SOLID 组次序（2026-07-02 真截图核证）：CREATE·MODIFY·CONFIGURE·CONSTRUCT·INSPECT·INSERT·ASSEMBLE·SELECT
    name: 'ASSEMBLE',
    tools: [
      { id: 'newcomp', label: '新建組件', icon: 'component', quick: true, tip: '新建組件：在裝配中加一個獨立零件（可單獨移動/隱藏/上色，做關節）。' },
      { id: 'compboolean', label: '組件布爾', icon: 'combine', quick: true, tip: '組件布爾（網格級）：先在瀏覽器選一個組件作目標（未選時若剛好只有一個有幾何組件則用它），再點另一個零件作工具件 → 合併/切除/相交。零件時間軸多體請用「合併/切割」或實驗室「實體布爾」。' },
      { id: 'joint', label: '關節', icon: 'joint', shortcut: 'J', quick: true },
      { id: 'groundcomp', label: '固定組件', icon: 'ground', quick: true, tip: '固定／取消固定：固定（或取消固定）在瀏覽器或視窗中選取的組件 — 已固定的組件不可拖動，關節亦不會驅動它。' },
      { id: 'asbuiltjoint', label: '按現狀關節', icon: 'asbuilt', quick: true, tip: '瀏覽器勾選剛好兩個組件，保持目前位置直接建立關節，不會先移動或吸附組件。預設建立轉動關節；可在關節面板修改類型、軸及限位。' },
      { id: 'jointorigin', label: '關節原點', icon: 'jointorigin', sep: true, tip: 'GM-3DV4 A1：點一個 snap 點（實體面心 / 圓柱孔心 / 頂點）→ 落一個【可複用命名幀】，存在瀏覽器「關節原點」組。之後建關節時可在下拉引用之，取代預設「組件中心」錨點 — 精準裝配用。' },
      { id: 'rigidgroup', label: '剛性組', icon: 'rigid', tip: '在瀏覽器勾選兩個或以上組件，將它們鎖成一個剛體組；組節點可在瀏覽器或關節面板抑製、恢復或刪除。' },
      { id: 'motionlink', label: '運動連接', icon: 'motionlink', sep: true, tip: '開啟關節面板的運動連接區，為兩個轉動／滑動關節設傳動比（齒輪可用負比反向）。' },
      { id: 'enablecontact', label: '啟用接觸集', icon: 'contact', tip: '切換裝配接觸求解；啟用後驅動關節會在組件發生實體接觸前停止。' },
      { id: 'newcontactset', label: '新建接觸集', icon: 'contactnew', tip: '在瀏覽器勾選剛好兩個組件，登記為命名接觸對。' },
      { id: 'motionstudy', label: '運動研究', icon: 'motionstudy', sep: true, tip: '開啟第一個可驅動關節的動力學設定，設質量、剛度、阻尼及初始位置後求解和播放。' },
      { id: 'drivejoints', label: '驅動關節', icon: 'drive', tip: '展開關節面板，以滑桿、限位、停於接觸及播放控製驅動裝配。' },
    ],
  },
  {
    name: 'SELECT',
    tools: [
      { id: 'select', label: '選擇', icon: 'select', quick: true, tip: '選擇工具：按零件/面/邊就選中它（按空白處 = 不選）；按 Del 鍵刪除所選。' },
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
      { id: 'newbody', label: '新實體', icon: 'newbody', tip: 'WebCAD 擴充：把當前實體另存為獨立實體後開始另一實體。' },
    ],
  },
  {
    name: '傳動設計',
    tools: [
      {
        id: 'gear', label: '齒輪', icon: 'gear', quick: true, tip: '漸開線正齒輪（β>0=斜齒扭轉近似）：設模數/齒數/厚度/孔Ø。分度圓Ø = m×z，20° 壓力角。',
        children: [
          { id: 'gear', label: '正齒輪/斜齒輪', icon: 'gear', tip: '漸開線齒輪：β=0 直齒，β>0 斜齒（扭轉近似）。' },
          { id: 'worm', label: '蝸桿', icon: 'worm', tip: '蝸桿（ZA 近似形）：模數/頭數/長度 — 同蝸輪比 = 頭數:齒數（純運動學）。' },
          { id: 'crowngear', label: '冠齒輪', icon: 'crowngear', tip: '冠齒輪（面齒輪近似形）：垂直軸齧合示意。' },
        ],
      },
      { id: 'gearbox', label: '齒輪箱', icon: 'pattern', quick: true, tip: '齒輪箱向導：輸入目標速比 → 自動配好齒數組合 + 精確中心距擺位 + 關節 + 運動連接 —— 確定即可按 ▷ 查看它轉。' },
      { id: 'rack', label: '齒條', icon: 'rack', tip: '齒條（齒輪齒條機構）：模數與齒輪一致即可齧合。' },
      { id: 'pulley', label: 'V帶輪', icon: 'pulley', tip: 'V 帶輪（皮帶傳動）：設外徑/寬度/中心孔，帶 V 形槽。' },
    ],
  },
  {
    name: '機構',
    tools: [
      { id: 'fourbar', label: '四連桿機構', icon: 'motionlink', quick: true, tip: '平面四連桿閉環機構：拖曲柄角→連桿/搖桿約束求解聯動（桿長剛性）。' },
      { id: 'slidercrank', label: '滑塊曲柄', icon: 'drive', tip: '滑塊曲柄機構（活塞）：曲柄轉→活塞往複直線（行程=2×曲柄半徑），如引擎活塞。' },
      { id: 'sixbar', label: '六桿機構', icon: 'motionstudy', tip: '六桿機構：曲柄轉 → 輸出點行出一條複雜的耦合曲線。可按「📈軌跡」描出它行經的路徑。' },
    ],
  },
  {
    name: '仿真',
    tools: [
      { id: 'fea', label: '受力雲圖', icon: 'stress', quick: true, tip: '受力分析（趨勢級）：點固定面 → 點受力面 → 設力 → 出應力雲圖,紅色 = 最受力 = 最容易斷的位。屬趨勢着色,非商用分析精度。' },
      { id: 'moldflow', label: '模流分析', icon: 'moldflow', quick: true, tip: '注塑模流趨勢：點澆口位（可多個）→ 選塑料 → 出充填時間/壓力/冷卻/變形趨勢雲圖 + 焊接線 + 充填動畫。可開「壓力求解器」出真實壓力值。' },
      { id: 'windtunnel', label: '風洞水洞', icon: 'wind', quick: true, tip: '風洞 / 水洞趋势模擬：把零件放入虛擬風道/水道解流場 → 風阻系數 Cd + 阻力 + 表面壓力/流場。可調風速 · 流體(空氣/水) · 吹向。屬趋势級,相對比較可信,非商用驗證級。' },
      { id: 'physicslab', label: '環境實驗室', icon: 'contact', quick: true, tip: 'Physics Lab：將 CAD 零件放入剛體實驗室，即時模擬重力、碰撞、摩擦、反彈和統一風。互動級模擬，非工程認證。' },
      { id: 'topopt', label: '生成式設計', icon: 'topopt', quick: true, tip: '拓撲優化（SIMP）：在設計域內按保留體積分配材料，得出較省料又較硬的承力結構。趨勢級，非商用認證。先點固定面與受力面。' },
      { id: 'thermal', label: '熱分析', icon: 'thermal', quick: true, tip: '穩態熱分析（導熱）：①固定面＝熱面、②受力面＝冷面，求溫度場與總熱流。趨勢級，非商用認證。' },
      { id: 'aerolab', label: '氣動設計實驗室', icon: 'wind', quick: true, tip: '氣動／水動設計實驗室：選範本或用一句說話講需求（螺旋槳／風扇、機翼、流線外殼）→ 自動優化效率、推力、升阻比、阻力 → 選最佳設計插入模型、送風洞或 CFD 驗證。BEMT／VLM／經驗公式工程估算，非 CFD。' },
    ],
  },
  {
    name: '製造 CAM',
    tools: [
      { id: 'finish3d', label: '3D加工', icon: 'cam', quick: true, tip: '3D 加工刀路（需活動實體 / MeshFit 後的 B-rep）：精加工球頭平行 / 粗加工逐層挖槽。僅趨勢級預覽與 G-code 匯出——非完整製造工作區、無刀庫/夾具/真機。純網格組件請先轉 B-rep。' },
    ],
  },
  {
    name: '3D列印',
    tools: [
      { id: 'overhang', label: '懸垂分析', icon: 'overhang', quick: true, tip: '3D 打印懸垂分析：標出需要支撐的朝下斜面（>45°），報支撐面積 % + 建議最省支撐打印朝向。' },
      { id: 'autoorient', label: '自動擺正', icon: 'overhang', tip: '一鍵把零件旋轉到最省支撐的打印朝向（懸垂分析的建議方向），加一個可撤銷的變換特徵。' },
      { id: 'wallcheck', label: '壁厚檢查', icon: 'wallcheck', tip: '3D 打印壁厚檢查：射線量度局部壁厚，標出 < 0.8mm 的薄壁（橙色高亮）+ 報最薄值。采樣近似。' },
      { id: 'slicepreview', label: '切層預覽', icon: 'section', tip: '3D 打印切層預覽：逐層試切實體，標出懸空孤島（懸垂分析看不到的浮空區，需支撐）+ 首層接觸面積 + 最薄層 + 不水密輪廓。' },
      { id: 'stack', label: '堆疊', icon: 'component', sep: true, tip: '垂直堆疊：所有可見組件自底向上疊放（每件坐在下件頂面）— 層疊件/托盤。' },
      { id: 'arrangebed', label: '排版', icon: 'component', tip: '排版到打印床：所有可見件平鋪地面、互不重疊、全部落地 — 多件 3D 打印備料。' },
      { id: 'dropall', label: '全落地', icon: 'component', tip: '全部落地：每個可見件各自下移到 Z=0（XZ 不變）— 散件歸地。' },
    ],
  },
  {
    name: '更多基元',
    tools: [
      { id: 'cone', label: '圓錐', icon: 'cone', quick: true, tip: '圓錐/圓台：設底Ø/頂Ø(0=尖錐)/高，邊數≥3 變 N 棱錐/棱台。' },
      { id: 'tube', label: '圓管', icon: 'cylinder', quick: true, tip: '圓管/襯套：設外徑Ø/壁厚/高建空心管。' },
      { id: 'rbox', label: '圓角盒', icon: 'box', quick: true, tip: '圓角長方體/外殼盒：長方體四條豎邊倒圓角。電子外殼常用。' },
      { id: 'wedge', label: '楔形', icon: 'box', tip: '楔形/斜坡：設長/寬/高建一端高、另一端削平的三角塊。' },
      { id: 'dome', label: '圓頂', icon: 'sphere', tip: '圓頂/半球：設直徑建半球；冠高<半徑 出淺球冠（鏡片/表鏡/按鈕）。' },
      { id: 'halfcyl', label: '半圓柱', icon: 'cylinder', tip: '半圓柱/D 形：圓柱切一半（D 形截面）。D 形軸/D 孔常用。' },
      { id: 'pie', label: '扇形柱', icon: 'cylinder', tip: '扇形柱/餅塊：圓盤的一塊扇形（設直徑/角度/高）。' },
      { id: 'rtube', label: '方管', icon: 'box', tip: '矩形空心管/方通(RHS)：設截面寬×深/壁厚/長。框架/橫梁常用。' },
      { id: 'profile', label: '型材', icon: 'box', tip: '結構型材：L 角鐵 / U 槽鋼 / T 型材（設截面寬×高/壁厚/長）。' },
      { id: 'pyramid', label: '棱錐', icon: 'cone', tip: '多邊形棱錐：設邊數/底外接Ø/高，底多邊形收到頂尖。' },
      { id: 'prism', label: '棱柱', icon: 'box', tip: '正多邊形棱柱：設邊數/外接圓Ø/高建六角柱等。' },
    ],
  },
  {
    name: '裝配輔助',
    tools: [
      { id: 'explodeview', label: '爆炸視圖', icon: 'component', quick: true, tip: '爆炸視圖：沿裝配中心向外展開組件（滑桿調爆炸度），查看裝配關系。' },
      { id: 'xray', label: '透視', icon: 'appearance', tip: 'X-ray 透視：全部組件半透明，查看裝配內部（軸承滾珠/行星輪）。' },
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
      { id: 'moveface', label: '移動面', icon: 'replaceface', quick: true, tip: 'WebCAD 擴展：偏移或傾斜平面面，內核重解相鄰面。' },
      { id: 'filletall', label: '全棱圓角', icon: 'fillet', tip: 'WebCAD 擴展：對實體全部邊一次應用相同圓角。' },
      { id: 'chamferall', label: '全棱倒角', icon: 'chamfer', tip: 'WebCAD 擴展：對實體全部邊一次應用相同倒角。' },
      { id: 'delface', label: '刪面治癒', icon: 'presspull', tip: 'WebCAD 擴展：刪除所選面並嘗試延伸鄰面治癒實體。' },
      { id: 'offsetsolid', label: '整體偏移', icon: 'scale', tip: 'WebCAD 擴展：均勻外擴或內縮實體全部面。' },
      { id: 'cylpatch', label: '圓柱曲面貼花', icon: 'cylpatch', tip: 'WebCAD 擴展：在圓柱面建立凸台、凹槽或平面。' },
      { id: 'splitplane', label: '任意平面切', icon: 'split', tip: 'WebCAD 擴展：拾取任意平面參數化分割實體。' },
      { id: 'splitsketch', label: '草圖輪廓分割', icon: 'split', tip: 'WebCAD 擴展：用封閉草圖輪廓貫穿分割實體。' },
      { id: 'bodyboolean', label: '實體布爾', icon: 'combine', tip: 'WebCAD 擴展：活動實體與獨立實體進行並集、切除或相交。' },
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
      { id: 'caxis', label: '構造軸', icon: 'axis', tip: '以 X／Y／Z 方向及指定坐標建立構造軸。' },
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
    { id: 'surfextrude', label: '曲面拉伸', icon: 'extrude', quick: true, tip: '曲面拉伸：把當前草圖截面沿法向拉成一張【零厚曲面】—— 開放折線 → 曲面片；閉合輪廓 → 無蓋的管殼（圓 → 圓柱面）。出獨立曲面體（想變實體再用「加厚」/「縫合」）。' },
    { id: 'ruled', label: '規則曲面', icon: 'loft', quick: true, tip: '規則曲面：在 ≥2 張【不同高度的開放折線草圖】之間,用直線連起對應點、掃出一張零厚曲面。先畫開放折線 → 完成草圖 → 換高度再畫 → 按此。出獨立曲面體（想變實體再「加厚」/「縫合」）。注：此類片沒有壁厚（想要壁厚用「曲面放樣」）。' },
    { id: 'surfsweep', label: '曲面掃掠', icon: 'sweep', quick: true, tip: '曲面掃掠：開放截面沿你畫的開放路徑掃成零厚開放曲面（風道/導流板/管壁皮）。先畫開放折線截面 → 完成草圖 → 再畫一條開放折線路徑 → 按此。出獨立曲面體（要實體再「加厚」/「縫合」）。' },
    { id: 'surfrevolve', label: '曲面旋轉', icon: 'revolve', quick: true, tip: '曲面旋轉：開放截面繞軸旋成零厚旋轉曲面（燈罩/噴嘴/花瓶皮/渦輪轂），無需先做實體再殼。先畫開放折線截面 → 按此 → 輸角度,軸(Y/X)。出獨立曲面體（要實體再「加厚」/「縫合」）。' },
    { id: 'surfpatch', label: '補面 Patch', icon: 'loft', quick: true, tip: '補面 Patch：在實體表面/空間順序點 ≥3 個點、圈出一個閉合邊界 → 填充成曲面 + 加厚成薄板。補洞 / 加蒙皮 / 駁面時用。' },
    { id: 'surfbridge', label: '橋接面', icon: 'loft', quick: true, tip: '橋接：點選 2 條現有棱（實體 / 獨立曲面）→ 在兩棱之間起一張光滑過渡面,可加厚。想駁通兩條邊、封個缺口時用。' },
    { id: 'boundarypatch', label: '邊界補面', icon: 'loft', quick: true, tip: '邊界補面：拾幾條【現有棱】（實體/獨立曲面上）填補一個多邊洞 / 封口,可勾相切令接邊順滑；出【曲面體】。先有個帶缺口的實體/曲面 → 按此 → 逐條點選邊界棱（≥2）→ 可勾相切 / 設加厚 → 確定。' },
    { id: 'thicken', label: '加厚 Thicken', icon: 'shell', quick: true, tip: '加厚：點實體/曲面一個面 → 沿法向加厚成實體薄板（曲面件轉成可打印實體 / 加厚單一面）。出獨立件,想合並用「實體布爾」。方向：板厚輸負值、或前綴「-」= 翻轉、朝另一邊加厚。' },
    { id: 'thickenquilt', label: '加厚整張曲面', icon: 'shell', quick: true, tip: '加厚整張曲面：選一張【完整獨立曲面/縫合面】（放樣/掃掠/旋轉/縫合/補面出的）→ 整張一次加厚成實體（不似「加厚」淨加單一拾取面）。曲面變實體最常用的一步。板厚輸負值 = 朝另一邊。' },
    { id: 'offsetsurf', label: '偏移曲面', icon: 'loft', tip: '偏移曲面：點一個面 → 偏出一張平行的新曲面（正 = 外偏 / 負 = 內偏）。兩側：距離用 ±（如 ±5）= 一次出內外兩張平行面（關於原面對稱）。出獨立開放曲面件。' },
    { id: 'splitface', label: '分割面', icon: 'splitface', tip: '分割面：點一個面 → 在點擊處用一個垂直平面把它切成兩半（體積不變,兩塊子面可各自單獨選/着色/拔模）。' },
    { id: 'replaceface', label: '替換面', icon: 'replaceface', tip: '替換面（平面頂替）：點一個面 → 輸入推入距離 → 把該面沿法向推去一個新位置,鄰面自動延伸接回順。誠實局限：只做平面頂替（不支援任意曲面替換）。' },
    { id: 'rotateface', label: '旋轉面', icon: 'replaceface', tip: '旋轉面：點一個【平面】→ 輸入鉸軸(X/Y/Z) + 角度 → 該面繞住經過點擊點的鉸線傾斜,鄰面自動癒合成梯形（實體保留）。改匯入件/斜面角度用。僅限平面。' },
    { id: 'surfsew', label: '縫合 Stitch', icon: 'shell', quick: true, tip: '縫合 Stitch：把現有所有曲面/殼片（放樣/補面/加厚/偏移出的）沿住共用邊焊埋成一個殼；若完全封閉 → 自動轉成實體（可繼續布爾/匯出/打印）。' },
    { id: 'surfunstitch', label: '取消縫合', icon: 'shell', tip: '取消縫合：把縫好的殼拆回做逐張獨立面（縫合的相反操作）,方便單獨編輯/刪除某一張面。' },
    { id: 'surftrim', label: '平面裁剪', icon: 'shell', tip: '平面裁剪：用一個平面把曲面殼裁走一邊、留返另一半。①軸對齊：輸 XY/XZ/YZ, 偏移, 保留邊；②任意平面：輸 原點x,y,z, 法向x,y,z[,保留邊]（如 0,0,10,1,0,1,+ = 斜平面裁）。單張散面要先「縫合」成殼。' },
    { id: 'surfsurftrim', label: '曲面裁剪', icon: 'shell', tip: '曲面裁剪：用【另一張曲面】或【活動實體】做裁刀,沿交線把目標曲面切成幾片 → 在目標上點你要【保留】該一邊/區域。先有兩張相交曲面（或一張曲面穿過實體）→ 按此 → 選目標 + 裁刀 → 在目標上點保留邊。' },
    { id: 'untrim', label: '去裁/還原', icon: 'shell', tip: '去裁 / 還原：點一個獨立曲面 → 丟棄它的裁剪邊界、還原回底層曲面的完整原始範圍（補回被裁走的整片,再重新裁）。裁剪的相反操作。' },
    { id: 'intersectcurve', label: '相交曲線', icon: 'shell', tip: '相交曲線：把所有體（活動實體 + 獨立曲面/殼）兩兩求交,沿交線抽出 3D 參考曲線（青色實線,隨項目存檔）。想量兩曲面點接 / 起截面草圖 / 接面參考時用。沒有相交就不變；再按「清相交曲線」清除。' },
    { id: 'clearintersect', label: '清相交曲線', icon: 'shell', tip: '清除全部相交曲線。' },
    { id: 'mergefaces', label: '合併面', icon: 'shell', tip: '合併面 Merge / Unify Same-Domain：點一個獨立曲面/殼 → 把同域（共面 / 共柱）相鄰碎面合併成一張面（裁剪 / 縫合 / 匯入後清噪、易拾、STEP 更小）。體積不變，純拓撲合並。曲面分割的逆向清理。' },
    { id: 'extendface', label: '曲面延伸', icon: 'extrude', tip: '曲面延伸：點一個曲面/面 → 沿它自然形狀向外延長指定 mm（平面變大 / 圓柱面變長 / 曲面順勢外推）。出獨立曲面件,駁面前補料用。注：圓柱會沿縫拆面,只延伸你點中該半面。' },
    { id: 'formbox', label: 'Form 盒', icon: 'box', quick: true },      // T793：Form-lite 细分建模（拖控制點捏有机形）
    { id: 'formcyl', label: 'Form 圓柱', icon: 'box', tip: 'Form 圓柱：由一個圓柱控製籠開始 → 拖控製點捏成 瓶/握把/有機柱。周向段數越多,越貼近你輸入的半徑（細分會向內略收）。✔ 完成後烘焙成網格組件。' },
    { id: 'formplane', label: 'Form 平面', icon: 'box', tip: 'Form 平面/薄片：由一塊薄盒控製籠開始 → 拖控製點拉出有機曲面/殼片（座椅/翼面/外殼曲面）。✔ 完成後烘焙成網格組件。' },
    { id: 'formsphere', label: 'Form 球', icon: 'box', tip: 'Form 球：由一個球控製籠開始 → 拖控製點捏成 液滴/頭形/有機球。段數越多,越貼近你輸入的半徑（細分會向內略收）。✔ 完成後烘焙成網格組件。' },
    { id: 'formtorus', label: 'Form 環面', icon: 'box', tip: 'Form 環面/甜甜圈：由一個環形控製籠開始 → 拖控製點捏成 把手/O 形/扭環。主半徑 > 管半徑。✔ 完成後烘焙成網格組件。' },
    { id: 'formpatch', label: 'Form 曲面片', icon: 'box', tip: 'Form 開放曲面片：真·開放的有機曲面（車身板/外殼/有機曲面主用）—— 不同於 Form 平面那個薄盒，這是一張真開放網格,邊界自動順滑、四角釘死 → 拖藍點捏出平滑開放曲面。✔ 完成後烘焙成曲面網格（開放、非封閉）。' },
    { id: 'editpoles', label: '編輯曲面控制點', icon: 'editpoles', quick: true, tip: '編輯曲面控製點：點一個灰顯獨立曲面 → 顯示它的控製點球 → 拖三軸箭嘴就整體扭曲張曲面。誠實局限：目前只支援單張曲面；跨縫順滑接駁後續再做。先用「規則曲面/曲面放樣」整一張彎曲曲面。' },
    { id: 'extrude', label: '拉伸', icon: 'extrude', quick: true },
    { id: 'revolve', label: '旋轉', icon: 'revolve', quick: true },
    { id: 'sweep', label: '掃掠', icon: 'sweep', quick: true },
    { id: 'loft', label: '放樣', icon: 'loft', quick: true },
    { id: 'pipe', label: '管道', icon: 'pipeicon' },
  ] },
  { name: 'MODIFY', tools: [
    { id: 'reversesurf', label: '翻轉曲面', icon: 'shell', quick: true, tip: '翻轉曲面：選一張獨立曲面 → 掉轉它的正反面（法向反向）。當「加厚」/「縫合」加錯了邊時用來修正方向。純翻向,不重建幾何。' },
    { id: 'presspull', label: '加厚/按拉', icon: 'presspull', quick: true },
    { id: 'splitbody', label: '分割', icon: 'split', quick: true },
    { id: 'combine', label: '合併/切割', icon: 'combine', quick: true },
  ] },
  g('CONFIGURE'), g('CONSTRUCT'), g('INSPECT'), g('INSERT'), g('ASSEMBLE'),
  { name: 'SELECT', tools: [{ id: 'select', label: '選擇', icon: 'select', quick: true, tip: '選擇工具：按零件/面/邊就選中它（按空白處 = 不選）；按 Del 鍵刪除所選。' }] },
]
const MESH: Panel[] = [
  { name: 'CREATE', tools: [
    { id: 'box', label: '長方體', icon: 'box', quick: true },
    { id: 'cylinder', label: '圓柱', icon: 'cylinder', quick: true },
    { id: 'sphere', label: '球', icon: 'sphere', quick: true },
  ] },
  { name: 'MODIFY', tools: [
    { id: 'meshfit', label: '網格擬合 / 轉 B-rep', icon: 'component', quick: true, tip: 'MeshFit：把所選（或唯一／最近匯入）網格組件縫合為可編輯 B-rep 實體（平面/圓柱可參數化；其余 faceted）。完成後可圓角/抽殼/布爾/匯出 STEP。有機掃掠件可能僅 faceted。' },
    { id: 'compboolean', label: '組件布爾', icon: 'combine', quick: true, tip: '組件布爾（網格級）：先選目標組件（或唯一有幾何組件），再點工具件 → 合併/切除/相交。亦可在 SOLID → ASSEMBLE 找到同名工具。' },
    { id: 'convert', label: '轉換', icon: 'component', tip: '網格→B-rep（同 MeshFit）。BRep↔T-Spline 仍在實現。' },
  ] },
  g('CONFIGURE'), g('CONSTRUCT'), g('INSPECT'),
  { name: 'INSERT', tools: [
    { id: 'insertmesh', label: '插入STL網格', icon: 'importmesh', quick: true, tip: '插入 STL 網格（Alt+O / File→匯入）。也可將 .stl/.obj/.3mf 拖到視口匯入（推薦）。匯入後可用 MeshFit / 轉 B-rep。' },
    { id: 'insert3mf', label: '插入3MF網格', icon: 'importmesh', quick: true, tip: 'MakerWorld / Printables 下載的 3MF 直接匯入做組件——多零件保留擺位與顏色，單位自動轉 mm。' },
    { id: 'insertobj', label: '插入OBJ網格', icon: 'importmesh', quick: true, tip: 'Wavefront OBJ 網格匯入（Blender / 掃掠 / 網上模型常用）作參考組件。' },
  ] },
  g('ASSEMBLE'),
  { name: 'SELECT', tools: [{ id: 'select', label: '選擇', icon: 'select', quick: true, tip: '選擇工具：按零件/面/邊就選中它（按空白處 = 不選）；按 Del 鍵刪除所選。' }] },
  { name: 'EXPORT', tools: [
    { id: 'exportstl', label: '匯出STL', icon: 'exportfile', quick: true },
    { id: 'exportasmstl', label: '匯出裝配STL', icon: 'exportfile' },
    { id: 'exportasmobj', label: '匯出裝配OBJ', icon: 'exportfile', tip: '把整個裝配（含各零件位姿）匯出為單一 OBJ，供 Blender / 渲染器 / 游戲引擎用。' },
    { id: 'exportasm3mf', label: '匯出裝配3MF', icon: 'exportfile', tip: '裝配 → 多對象 3MF：各零件獨立對象，直接送切片軟件分件擺位打印（比合並 STL 更好）。' },
    { id: 'exportasmstep', label: '匯出裝配STEP', icon: 'exportfile', tip: '裝配 → 彩色 STEP：零件名 + 顏色 + 位姿全保留,FreeCAD/SolidWorks 直接打開。純網格匯入件會跳過（沒有精確實體來源）。' },
    { id: 'exportglb', label: '匯出glTF/GLB', icon: 'exportfile' },
    { id: 'exportobj', label: '匯出OBJ', icon: 'exportfile', tip: 'Wavefront OBJ 網格（通用 3D 交換格式，Blender / 游戲引擎 / 渲染器常用）。' },
    { id: 'export3mf', label: '匯出3MF', icon: 'exportfile', tip: '3MF 現代 3D 打印格式（保留 mm 單位，Bambu Studio / PrusaSlicer / Cura 都支援，比 STL 更準）。' },
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
  { name: 'SELECT', tools: [{ id: 'select', label: '選擇', icon: 'select', quick: true, tip: '選擇工具：按零件/面/邊就選中它（按空白處 = 不選）；按 Del 鍵刪除所選。' }] },
  { name: 'EXPORT', tools: [{ id: 'exportflatdxf', label: '匯出展開DXF', icon: 'exportfile', quick: true, tip: '把鈑金件展開成平料 DXF（含 K 因子折彎餘量 + BEND 折彎線圖層），直接激光下料。' }, { id: 'exportstep', label: '匯出STEP', icon: 'exportfile' }, { id: 'exportstl', label: '匯出STL', icon: 'exportfile', tip: '匯出二進製 STL（3D 打印通用）。' }, { id: 'exportstlascii', label: '匯出STL(ASCII)', icon: 'exportfile', tip: 'ASCII 文本格式 STL（部分舊切片器/CAM/調試用，可讀）。' }] },
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
  { name: 'SELECT', tools: [{ id: 'select', label: '選擇', icon: 'select', quick: true, tip: '選擇工具：按零件/面/邊就選中它（按空白處 = 不選）；按 Del 鍵刪除所選。' }] },
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
    { id: 'exportstl', label: '匯出STL', icon: 'exportfile', quick: true },
    { id: 'exportstep', label: '匯出STEP', icon: 'exportfile', quick: true },
    { id: 'exportglb', label: '匯出glTF', icon: 'exportfile' },
  ] },
  g('INSPECT'),
  { name: '助手', tools: [
    { id: 'aicopilot', label: 'AI 助手', icon: 'ai', shortcut: 'Ctrl+Shift+A', quick: true, tip: '用自然語言操作與協助使用本程式（OpenAI / Grok / Gemini / 本地模型）。快捷鍵 Ctrl+Shift+A。' },
  ] },
  { name: 'SELECT', tools: [{ id: 'select', label: '選擇', icon: 'select', quick: true, tip: '選擇工具：按零件/面/邊就選中它（按空白處 = 不選）；按 Del 鍵刪除所選。' }] },
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
      { id: 'sk_polyline', label: '直線', icon: 'line', glyph: '╱', shortcut: 'L', quick: true, tip: '直線/折線：連續點擊畫多段相連直線,回到起點或按「閉合」成輪廓。繪製時按 A 鍵 = 在 直線 / 相切弧 之間切換（可以直線接弧再接直線）。打數字 = 精確長度；方向自動吸 水平/豎直/45°/平行/垂直。靠近圓會吸住圓的【象限點（上下左右最遠點）】,由上一點拉向圓會吸住【切點】令該段與圓相切。' },
      { id: 'sk_mline', label: '中點線', icon: 'line', glyph: '┿', tip: '中點線：第一點 = 中點，第二點 = 一端 → 由中點向兩端對稱的直線段（做對稱基準/中心參照）。打數字 = 全長。' },
      // SKETCH12 #1：矩形 ▾／圓 ▾／圓弧 ▾ 分拆按鈕 — 快捷圖示執行預設工具，▾ 列出同類全部建立方式（三點矩形、兩點圓、相切圓弧等）。
      { id: 'sk_rect', label: '矩形', icon: 'rect', glyph: '▭', shortcut: 'R', quick: true, sep: true, tip: '兩點矩形：依次點選兩個對角點。輸入寬度 → Tab → 高度 → Enter 可得精確尺寸。旁邊 ▾ 可選三點矩形或中心矩形。', quickChildren: [
        { id: 'sk_rect', label: '兩點矩形', icon: 'rect', glyph: '▭', tip: '兩點矩形：依次點選兩個對角點。輸入寬度 → Tab → 高度 → Enter 可得精確尺寸。旁邊 ▾ 可選三點矩形或中心矩形。' },
        { id: 'sk_rect3', label: '三點矩形', icon: 'rect', glyph: '◇', tip: '三點矩形（斜矩形）：前兩點定一條邊，第三點定寬度，可繪畫傾斜矩形。' },
        { id: 'sk_crect', label: '中心矩形', icon: 'rect', glyph: '⊞', tip: '中心矩形：先點選中心，再點選一個角點（矩形關於中心對稱）。中心落在原點或現有點時會加入重合約束。' },
      ] },
      { id: 'sk_rect3', label: '三點矩形', icon: 'rect', glyph: '◇', tip: '三點矩形（斜矩形）：前兩點定一條邊，第三點定寬度，可繪畫傾斜矩形。' },
      { id: 'sk_crect', label: '中心矩形', icon: 'rect', glyph: '⊞', tip: '中心矩形：先點選中心，再點選一個角點（矩形關於中心對稱）。中心落在原點或現有點時會加入重合約束。' },
      { id: 'sk_circle', label: '圓', icon: 'circle', glyph: '◯', shortcut: 'C', quick: true, sep: true, tip: '圓心直徑圓：先點選圓心，再點選圓周。輸入數字＝精確直徑 Ø。旁邊 ▾ 可選兩點圓、三點圓及相切圓。', quickChildren: [
        { id: 'sk_circle', label: '圓心直徑圓', icon: 'circle', glyph: '◯', tip: '圓心直徑圓：先點選圓心，再點選圓周。輸入數字＝精確直徑 Ø。旁邊 ▾ 可選兩點圓、三點圓及相切圓。' },
        { id: 'sk_circle2p', label: '兩點圓', icon: 'circle', glyph: '⊘', tip: '兩點圓：點選直徑的兩個端點定圓（第二點決定直徑與方向）。輸入數字＝精確直徑 Ø。' },
        { id: 'sk_circle3', label: '三點圓', icon: 'circle', glyph: '◓', tip: '三點圓：點選圓周上三點定圓（外接圓），適合對齊現有特徵或孔位。' },
        { id: 'sk_circle2t', label: '兩切點圓', icon: 'circle', glyph: '◑', tip: '兩切點圓：點選兩條直線邊並設定半徑，建立與兩邊相切的圓（自動加入相切約束）。圓位於點選邊的一側。' },
        { id: 'sk_circle3t', label: '三切點圓', icon: 'circle', glyph: '◒', tip: '三切點圓：點選三條直線邊，建立與三邊相切的圓（內切圓或旁切圓，按點選位置決定）。' },
      ] },
      { id: 'sk_circle2p', label: '兩點圓', icon: 'circle', glyph: '⊘', tip: '兩點圓：點選直徑的兩個端點定圓（第二點決定直徑與方向）。輸入數字＝精確直徑 Ø。' },
      { id: 'sk_circle3', label: '三點圓', icon: 'circle', glyph: '◓', tip: '三點圓：點選圓周上三點定圓（外接圓），適合對齊現有特徵或孔位。' },
      { id: 'sk_circle2t', label: '兩切點圓', icon: 'circle', glyph: '◑', tip: '兩切點圓：點選兩條直線邊並設定半徑，建立與兩邊相切的圓（自動加入相切約束）。圓位於點選邊的一側。' },
      { id: 'sk_circle3t', label: '三切點圓', icon: 'circle', glyph: '◒', tip: '三切點圓：點選三條直線邊，建立與三邊相切的圓（內切圓或旁切圓，按點選位置決定）。' },
      { id: 'sk_arc', label: '圓弧', icon: 'arc', glyph: '⌒', shortcut: 'A', quick: true, sep: true, tip: '三點圓弧：起點 → 終點 → 弧上一點。旁邊 ▾ 可選中心點圓弧或相切圓弧。', quickChildren: [
        { id: 'sk_arc', label: '三點圓弧', icon: 'arc', glyph: '⌒', tip: '三點圓弧：起點 → 終點 → 弧上一點。旁邊 ▾ 可選中心點圓弧或相切圓弧。' },
        { id: 'sk_arcc', label: '中心點弧', icon: 'arc', glyph: '◠', tip: '中心點圓弧：圓心 → 起點（定半徑）→ 終點（定弧長，取較短方向）。建立真圓弧，可標注半徑及相切。' },
        { id: 'sk_tanarc', label: '相切弧', icon: 'arc', glyph: '◝', tip: '相切圓弧：點選現有直線或曲線的端點開始，引出與原曲線相切（G1 平滑連接）的圓弧，並自動加入相切約束；可逐點續接。按 A 鍵可切換回直線。' },
      ] },
      { id: 'sk_arcc', label: '中心點弧', icon: 'arc', glyph: '◠', tip: '中心點圓弧：圓心 → 起點（定半徑）→ 終點（定弧長，取較短方向）。建立真圓弧，可標注半徑及相切。' },
      { id: 'sk_tanarc', label: '相切弧', icon: 'arc', glyph: '◝', tip: '相切圓弧：點選現有直線或曲線的端點開始，引出與原曲線相切（G1 平滑連接）的圓弧，並自動加入相切約束；可逐點續接。按 A 鍵可切換回直線。' },
      { id: 'sk_polygon', label: '多邊形', icon: 'default', glyph: '⬡', quick: true, sep: true, tip: '正多邊形（中心 + 半徑）；草圖欄可設邊數 / 內切外接。' },
      { id: 'sk_spline', label: '樣條', icon: 'sweep', glyph: '∿', quick: true, tip: '樣條曲線：連續點擊一串點 → 畫出一條【經過每一個點】的平滑曲線。想畫順滑自由曲線時用（拉伸/旋轉出真平滑曲面）。' },
      { id: 'sk_bspline', label: 'B樣條', icon: 'sweep', glyph: '⟿', quick: true, tip: 'B樣條：連續點擊一串控製點 → 畫出被這些點「拉扯」出來的平滑曲線（不一定經過控製點,但比樣條更順滑）。想要極順滑曲線時用（拉伸/旋轉出真平滑曲面）。' },
      { id: 'sk_slot', label: '槽', icon: 'default', glyph: '⬭', quick: true, tip: '槽：可選心心距、總長或中心點模式；槽寬於工具面板設定，亦可輸入長度後按 Tab 輸入槽寬。建立後長度及槽寬為可修改的驅動尺寸。' },
      { id: 'sk_arcslot', label: '圓弧槽', icon: 'default', glyph: '◜', tip: '圓弧槽：弧心 + 一端 + 另一端，沿弧的腰形槽。' },
      { id: 'sk_rrect', label: '圓角矩形', icon: 'rect', glyph: '▢', quick: true, tip: '圓角矩形：對角兩點 + 圓角半徑（草圖欄設半徑）。' },
      { id: 'sk_ellipse', label: '橢圓', icon: 'circle', glyph: '⬯', quick: true, tip: '橢圓：點選中心，再點選外框角點；建立後可點擊數值修改半長軸及半短軸。' },
      { id: 'sk_earc', label: '橢圓弧', icon: 'circle', glyph: '◡', tip: '橢圓弧：中心 → 長軸端（定 rx+旋轉）→ 短軸半徑 → 起角 → 終角（工具面板選擇順 / 逆時針）。真橢圓邊，閉合成弓形可拉伸。' },
      { id: 'sk_conic', label: '圓錐曲線', icon: 'circle', glyph: '⌓', tip: '圓錐曲線：起點 → 終點 → 頂點（兩端切線的交點）→ 在底欄調「充滿度」(細 = 扁橢圓弧 / 中 = 拋物線 / 大 = 雙曲線)。畫出真平滑精確邊。' },
      { id: 'sk_point', label: '點', icon: 'default', glyph: '·', quick: true, tip: '草圖點：單擊落一個構造點（可約束/可標尺寸）— 鑽孔定位、對稱錨點日常。' },
      { id: 'sk_cline', label: '構造線', icon: 'default', glyph: '┊', quick: true, tip: '構造參考線：點位置即落一條 豎直/水平 長虛線（工具面板切方向）。做對中參考、或做鏡像的【中心軸】。不參與拉伸。' },
      { id: 'sk_text', label: '文字', icon: 'default', glyph: 'T', quick: true, tip: '草圖文字（流程一步到位）：輸入 文字/字號/凸高 → 凸字（切割模式=刻字）特徵，時間軸可改。' },
    ],
  },
  {
    name: 'MODIFY',
    tools: [
      { id: 'sk_trim', label: '修剪', icon: 'default', glyph: '✂', shortcut: 'T', quick: true, tip: '修剪（T）：點選要剪去的線段，修剪至與其他幾何的相交點；沒有相交時刪除整條。閉合輪廓修剪後成為開放路徑。' },
      { id: 'sk_extend', label: '延伸', icon: 'default', glyph: '⟶', quick: true, tip: '延伸：點選開放路徑的端段，沿原方向（直線）或原圓（圓弧）延長至最近的相交幾何。' },
      { id: 'sk_break', label: '打斷', icon: 'default', glyph: '⊟', tip: '打斷：點曲線上一點 → 一分為二，兩段都保留（近相交點會吸到精確交點）。' },
      { id: 'sk_filletc', label: '倒圓角', icon: 'fillet', glyph: 'r⌒', quick: true, tip: '點近一個直角頂點倒那個角（半徑=草圖欄「圓角R」；或底欄「全部角」一次全部倒角）。' },
      { id: 'sk_chamferc', label: '倒斜角', icon: 'chamfer', glyph: 'C∠', quick: true, tip: '倒斜角：按近一個直角頂點,把那個角倒成一條直斜邊（回縮量 = 草圖欄「圓角R」；或按底欄「全部角」一次全部倒角）。' },
      { id: 'sk_offset', label: '偏移', icon: 'offset', glyph: '⧉', quick: true, tip: '平行偏移當前輪廓（草圖欄設距離，正外/負內）。' },
      { id: 'sk_union', label: '合併輪廓', icon: 'combine', glyph: '∪', quick: true, tip: '合併兩個重疊輪廓做一個外框：按此即入拾取 → 點第一個輪廓 → 點第二個（即合併）。真圓弧保持。（或先用選擇工具選好兩個再按）' },
      { id: 'sk_subtract', label: '剪走輪廓', icon: 'combine', glyph: '∖', tip: '從第一個輪廓剪除第二個（A−B）：按此即入拾取 → 點【保留件】 → 點【剪除件】（即運算）。挖穿出環（外框+孔）/橫切裂體都得 — 拉伸自動嵌套判孔。' },
      { id: 'sk_mirrory', label: '鏡像', icon: 'mirror', glyph: '⇋', quick: true, tip: '鏡像（2 步）：①點中要鏡像的輪廓（點一個=全部選整條相連邊，可多個）→「✓選軸線」→ ②點一條現有【直線邊/構造線】做鏡像軸 → 反射（保留原件）。工具面板還有「左右軸/上下軸」一鍵對稱。' },
      { id: 'sk_mirrorx', label: '上下鏡像', icon: 'mirror', glyph: '⇅', tip: '上下鏡像（一鍵 across X 軸對稱當前輪廓）。' },
      { id: 'sk_array', label: '陣列', icon: 'pattern', glyph: '▦', quick: true, tip: '陣列：按此入陣列模式 → 底欄面板設 矩形(行列+間距) / 環形(數量+角度+中心)，綠虛線實時預覽 → 按「應用陣列」。對【一個】輪廓。' },
      { id: 'sk_move', label: '移動/複製', icon: 'move', glyph: '✥', tip: '移動/複製當前輪廓：dx,dy 平移 + 繞形心旋轉，可出 N 份副本。' },
      { id: 'sk_scale', label: '縮放', icon: 'scale', glyph: '⤢', tip: '草圖縮放：選中輪廓（無選擇=全部）繞形心乘系數 k（>1 放大 / <1 縮小；真圓弧/橢圓半徑同步縮放）。快捷鍵在草圖內可用（M=移動 / 縮放在 ribbon）。' },
      { id: 'sk_project', label: '投影幾何', icon: 'default', glyph: '⧉', quick: true, tip: '投影幾何：把實體的邊「印」落當前草圖做【真草圖曲線】(藍紫參考線) —— 印落來的線可標注/拉伸/修改,不再只是參考。想沿住實體輪廓畫東西時用：按掣後點實體的邊即可。（要在有實體的面、或穿過實體的平面開草圖先印到）。兩張曲面／實體之間的【體－體交線】請改用工作區 SURFACE → CREATE → 相交曲線（非草圖內命令）。' },
      { id: 'sk_constr', label: '構造', icon: 'default', glyph: '╳', shortcut: 'X', tip: '構造幾何（X）：把選中輪廓（或當前輪廓）轉為虛線參考幾何 — 可約束可吸附，不參與拉伸。再按一次轉回實線。' },
      { id: 'sk_guide', label: '掃掠導軌', icon: 'sweep', glyph: '⤳', tip: '導軌掃掠：先畫一條折線做【導軌】→ 按此記低（橙虛線）→ 再畫掃掠【路徑】→「沿路徑掃掠」— 截面沿路徑行進時跟隨導軌轉向。' },
      { id: 'sk_close', label: '閉合', icon: 'default', glyph: '✓', sep: true, quick: true, tip: '把折線/樣條回到起點閉合成輪廓。' },
      { id: 'sk_dxf', label: '匯出DXF', icon: 'default', glyph: '⤓', tip: '把當前草圖輪廓匯出為 2D DXF（激光切割 / AutoCAD）。' },
    ],
  },
  {
    // Fusion's sketch CONSTRAINTS group: select geometry → apply a relationship; D = dimension.
    name: 'CONSTRAINTS',
    tools: [
      { id: 'sk_select', label: '選擇', icon: 'select', glyph: '↖', quick: true, tip: '選擇工具：點 點/邊/圓（最多 2 個）,再按下面約束掣套用關系；按 Del 鍵刪除所選。' },
      { id: 'sk_dim', label: '尺寸', icon: 'measure', glyph: '⟷', shortcut: 'D', quick: true, tip: '尺寸（D）：點一條邊 → 再點【放置位置】定方向（垂直偏置=對齊真長 · 左右放=豎直投影 · 上下放=水平投影）· 圓=直徑Ø · 兩個點=距離 · 點兩條邊（平行=間距 / 相交=夾角）。藍色標籤可按改數值（約束求解）；右鍵尺寸標籤 = R↔Ø 切換 / 轉從動 / 刪除。過約束會彈框問【轉從動 / 取消】。' },
      { id: 'sk_c_h', label: '水平', icon: 'default', glyph: '━', sep: true, quick: true, tip: '水平：選 1 條邊（或 2 個點）→ 變水平。' },
      { id: 'sk_c_v', label: '豎直', icon: 'default', glyph: '┃', quick: true, tip: '豎直：選 1 條邊（或 2 個點）→ 變豎直。' },
      { id: 'sk_c_hv', label: '水平/豎直', icon: 'default', glyph: '┼', tip: '水平/豎直（合一，單命令）：選一條或多條邊 → 按每條邊的方向自動判定水平定豎直施加（橫向→水平 / 縱向→豎直）。' },
      { id: 'sk_c_coin', label: '重合', icon: 'default', glyph: '◉', quick: true, tip: '重合：選 2 個點 → 焊埋一齊；或 點+邊 → 點落在邊上。' },
      { id: 'sk_c_par', label: '平行', icon: 'default', glyph: '∥', quick: true, tip: '平行：選 2 條邊。' },
      { id: 'sk_c_perp', label: '垂直', icon: 'default', glyph: '⊥', quick: true, tip: '垂直：選 2 條邊 → 成 90°。' },
      { id: 'sk_c_eq', label: '相等', icon: 'default', glyph: '＝', quick: true, tip: '相等：選 2 條邊（等長）或 2 個圓（等徑）。' },
      { id: 'sk_c_tan', label: '相切', icon: 'default', glyph: '⌒', quick: true, tip: '相切：整橢圓＋直線先預覽接觸候選，再按此確認；接觸在線段外時顯示虛線延長。整段橢圓弧只取有向範圍內接觸候選；選橙色端點＋直線則使用端點相切。圓／圓弧沿用現有相切方式。' },
      { id: 'sk_c_fix', label: '固定', icon: 'default', glyph: '⚓', quick: true, tip: '固定：選 1 個點 / 1 條邊 / 1 個圓·弧 → 整體釘死不移動（邊=兩端點、圓=圓心+半徑）。' },
      { id: 'sk_c_mid', label: '中點', icon: 'default', glyph: '⊹', tip: '中點：選 1 個點 + 1 條邊/弧 → 點鎖到邊中點（弧=真弧中點，非弦中點）。' },
      { id: 'sk_c_conc', label: '同心', icon: 'default', glyph: '◎', tip: '同心：選 2 個圓 → 圓心重合。' },
      { id: 'sk_c_coll', label: '共線', icon: 'default', glyph: '≣', tip: '共線：選 2 條邊 → 排成同一直線。' },
      { id: 'sk_c_sym', label: '對稱', icon: 'default', glyph: '⇆', tip: '對稱：選 2 個點 / 2 條邊 / 2 個圓·弧 + 1 條邊（軸）→ 關於軸對稱（圓對稱連半徑相等）。' },
      { id: 'sk_d_angle', label: '角度', icon: 'default', glyph: '∠', sep: true, tip: '角度尺寸：用選擇工具點 2 條邊 → 標夾角（度，可點改驅動幾何）。' },
      { id: 'sk_autoconstrain', label: '自動約束', icon: 'default', glyph: '✨', tip: 'AutoConstrain：對【選中集】（無選擇=全部幾何）一次推斷多約束（重合/平行/垂直/相切/等半徑）。繪製時的自動推斷在工具面板可開關。' },
      { id: 'sk_uncon', label: '撤約束', icon: 'undo', glyph: '↶', tip: '移除最後一個約束/尺寸並重新求解（衝突時用）。約束徽章亦可逐個點擊移除。' },
    ],
  },
  {
    name: 'FINISH',
    tools: [
      { id: 'sk_extrude', label: '拉伸', icon: 'extrude', glyph: '⬆', shortcut: 'E', quick: true, tip: '打開拉伸面板（操作 / 範圍 / 距離 / 拔模角）。' },
      { id: 'sectionprops', label: '截面屬性', icon: 'default', glyph: 'Σ', tip: '截面屬性：對草圖封閉輪廓算 面積 / 形心 / 截面慣矩 Ixx·Iyy·Ixy / 主軸 / 周長（梁彎曲/強度輸入）。最大輪廓=外形，內含=孔（自動扣除），分離輪廓忽略。再按關。' },
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
// 简繁归一：ribbon labels 现为繁体，AI-teach / 用户问句可能是简体 —— 双方都经 simplifiedToTraditionalHK + toLowerCase，简繁任一脚本可命中。
function _normRibbonSearch(s: string): string {
  // Search-only synonyms: Fusion-style「建立草圖」superseded older「创建草图／創建草圖」wording.
  // Applied after SC→TC so简体「创建草图」and繁体「創建草圖」both land on the live label.
  let out = simplifiedToTraditionalHK((s || '').trim())
  out = out.split('建立草圖').join('建立草圖')
  return out.toLowerCase()
}
export function searchRibbonCommand(query: string): RibbonHit | null {
  const q = _normRibbonSearch(query)
  if (!q) return null
  _ribbonFlat = _ribbonFlat ?? _flattenRibbon()
  let best: RibbonHit | null = null, bestScore = 0
  for (const h of _ribbonFlat) {
    const id = h.id.toLowerCase()
    const label = _normRibbonSearch(h.label)
    const tip = _normRibbonSearch(h.tip || '')
    let s = 0
    if (id === q || label === q) s = 100
    else if (id.length >= 2 && (q.includes(id) || id.includes(q))) s = 80
    else if (label && (q.includes(label) || label.includes(q))) s = 70
    else if (tip.includes(q)) s = 30
    if (s > bestScore) { bestScore = s; best = h }
  }
  return bestScore > 0 ? best : null
}
