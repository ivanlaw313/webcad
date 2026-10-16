// T809：AI Copilot 可调用嘅工具（function calling schema）。执行喺 store.aiTool（fid/applyFeatures 喺嗰度）。
// 只暴露【唔需 3D 拾取、可靠参数化】嘅操作（建基本体/布尔/参数/范本/读状态/出图）。需要拾边拾面嘅操作
// （倒角/孔/装配配合）AI 用文字指导用户做 —— 诚实唔假装做到。
import type { ToolDef } from './providers'

const op = { type: 'string', enum: ['new', 'cut', 'join'], description: '布爾操作：new=新實體 / cut=從現有實體切走 / join=合併入現有實體（預設 new）' }

export const TOOL_DEFS: ToolDef[] = [
  { name: 'get_model_info', description: '讀取當前模型摘要：特徵列表、實體體積/質量/包圍盒尺寸、參數、組件數。先調用此了解現狀。', parameters: { type: 'object', properties: {} } },
  { name: 'explain_command', description: '教學【指出+示範】：當用戶問「如何用 X / 哪裏找 X / 點做 Y」（如倒圓角/抽殼/拉伸/裝配配合）→ 調此，會在界面【自動高亮指出】真實該個 ribbon 掣 + 返真實位置(tab/面板/快捷鍵/說明)。然後你根據返回的【真實位置】一步步教用戶（不要憑空作命令名/位置）。', parameters: { type: 'object', properties: { query: { type: 'string', description: '用戶想做的操作/功能名（如「倒圓角」「抽殼」「拉伸」「裝配配合」）' } }, required: ['query'] } },
  { name: 'reset_document', description: '清空當前文檔，由零開始（不可逆，相當於新建）。', parameters: { type: 'object', properties: {} } },
  { name: 'create_box', description: '建立長方體（mm）。', parameters: { type: 'object', properties: { length: { type: 'number', description: '長 X (mm)' }, width: { type: 'number', description: '寬 Y (mm)' }, height: { type: 'number', description: '高 Z (mm)' }, operation: op }, required: ['length', 'width', 'height'] } },
  { name: 'create_cylinder', description: '建立圓柱（mm）。', parameters: { type: 'object', properties: { diameter: { type: 'number', description: '直徑 (mm)' }, height: { type: 'number', description: '高 (mm)' }, operation: op }, required: ['diameter', 'height'] } },
  { name: 'create_sphere', description: '建立球（mm）。', parameters: { type: 'object', properties: { diameter: { type: 'number', description: '直徑 (mm)' }, operation: op }, required: ['diameter'] } },
  { name: 'create_cone', description: '建立圓錐/圓台（mm，頂直徑 0 = 尖錐）。', parameters: { type: 'object', properties: { bottom_diameter: { type: 'number' }, top_diameter: { type: 'number', description: '頂直徑，0 = 尖錐' }, height: { type: 'number' }, operation: op }, required: ['bottom_diameter', 'height'] } },
  { name: 'create_torus', description: '建立圓環（甜甜圈，mm）。', parameters: { type: 'object', properties: { outer_diameter: { type: 'number', description: '外徑 (mm)' }, tube_diameter: { type: 'number', description: '管徑 (mm)' }, operation: op }, required: ['outer_diameter', 'tube_diameter'] } },
  { name: 'create_wedge', description: '建立楔形/斜坡（直角三角形截面沿寬度拉伸，一端高一端到 0）。做斜坡/擋塊/加強角。', parameters: { type: 'object', properties: { length: { type: 'number', description: '長 X (mm)' }, width: { type: 'number', description: '寬 Y (mm)' }, height: { type: 'number', description: '高 Z (mm)' }, operation: op }, required: ['length', 'width', 'height'] } },
  { name: 'create_dome', description: '建立圓頂/球冠（球的頂部平坐地面）。cap_height 空或≥半徑=半球；0<cap_height<半徑=淺冠（表鏡/透鏡/按鈕）。', parameters: { type: 'object', properties: { diameter: { type: 'number', description: '底直徑 (mm)' }, cap_height: { type: 'number', description: '冠高 mm（預設=半徑=半球）' }, operation: op }, required: ['diameter'] } },
  { name: 'create_half_cylinder', description: '建立半圓柱 / D 形（全圓柱切走 x<0 半邊，平面在 YZ，圓凸在 +x）。做 D 軸/D 孔聯軸/半圓條。', parameters: { type: 'object', properties: { diameter: { type: 'number', description: '直徑 (mm)' }, height: { type: 'number', description: '高 (mm)' }, operation: op }, required: ['diameter', 'height'] } },
  { name: 'create_pie', description: '建立扇形柱 / 圓盤扇區（半徑×高矩形繞 Z 掃 angle 度）。做凸輪/分度盤/部分圓盤。', parameters: { type: 'object', properties: { diameter: { type: 'number', description: '直徑 (mm)' }, angle: { type: 'number', description: '扇形角度°（0-360，預設整圈）' }, height: { type: 'number', description: '高 (mm)' }, operation: op }, required: ['diameter', 'height'] } },
  { name: 'create_pyramid', description: '建立稜錐/稜台（正多邊形底，sides=邊數）。top_diameter=0 尖錐，>0 稜台。做金字塔/多稜柱台。', parameters: { type: 'object', properties: { base_diameter: { type: 'number', description: '底外接圓直徑 (mm)' }, top_diameter: { type: 'number', description: '頂外接圓直徑 mm（0=尖錐）' }, height: { type: 'number', description: '高 (mm)' }, sides: { type: 'number', description: '邊數（3-12，預設4）' }, operation: op }, required: ['base_diameter', 'height'] } },
  { name: 'fillet_all_edges', description: '對當前實體【所有稜】倒圓角（半徑 mm，免選邊）。半徑相對幾何過大會失敗。', parameters: { type: 'object', properties: { radius: { type: 'number', description: '圓角半徑 (mm)' } }, required: ['radius'] } },
  { name: 'chamfer_all_edges', description: '對當前實體【所有稜】倒角（距離 mm，免選邊）。', parameters: { type: 'object', properties: { distance: { type: 'number', description: '倒角距離 (mm)' } }, required: ['distance'] } },
  { name: 'load_sample', description: '載入一個內置參數化範本/示例模型。', parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['plate', 'enclosure', 'flange', 'bracket', 'gear', 'gearpair', 'planetary', 'rackpinion', 'bearing', 'spring', 'elbow', 'heatsink', 'knob', 'vase', 'bowl', 'tslot', 'honeycomb', 'shaft', 'washer', 'standoff', 'fourbarAsm'], description: '範本類型' } }, required: ['kind'] } },
  { name: 'add_parameter', description: '新增一個用戶參數（ƒx），之後可被尺寸引用 / 聯動重建。', parameters: { type: 'object', properties: { name: { type: 'string' }, value: { type: 'number' } }, required: ['name', 'value'] } },
  { name: 'set_parameter', description: '修改一個已存在用戶參數的值（觸發聯動重建）。', parameters: { type: 'object', properties: { name: { type: 'string' }, value: { type: 'number' } }, required: ['name', 'value'] } },
  { name: 'create_text', description: '加凸起/凹刻文字（英數；放在 XY 面，時間軸可改字號/高度/基準Z）。emboss=凸字，engrave=凹刻（需已有實體承接）。', parameters: { type: 'object', properties: { text: { type: 'string' }, size: { type: 'number', description: '字號 mm（預設 12）' }, height: { type: 'number', description: '凸/凹深 mm（預設 4）' }, mode: { type: 'string', enum: ['emboss', 'engrave'], description: 'emboss 凸 / engrave 凹刻' } }, required: ['text'] } },
  { name: 'set_material', description: '設置實體材質/外觀（影響顏色 + 質量密度計算）。', parameters: { type: 'object', properties: { material: { type: 'string', enum: ['鋼', '鋁', '黃銅', '銅', '塑料', '金', '銀', '鈦'], description: '材質名' } }, required: ['material'] } },
  { name: 'mirror_body', description: '把實體跨 YZ 平面鏡像（做左右對稱件）。', parameters: { type: 'object', properties: {} } },
  { name: 'engineering_calc', description: '機械設計速算（只返回結果，不改模型）。支持齒輪嚙合 / 螺栓預緊 / 皮帶長度 / 主軸轉速。', parameters: { type: 'object', properties: {
    calc: { type: 'string', enum: ['gear_mesh', 'bolt_preload', 'belt_length', 'spindle_rpm'], description: '計算類型' },
    module: { type: 'number', description: 'gear_mesh: 模數 m' }, teeth1: { type: 'number', description: 'gear_mesh: 齒數1' }, teeth2: { type: 'number', description: 'gear_mesh: 齒數2' },
    bolt_d: { type: 'number', description: 'bolt_preload: 螺紋公稱直徑 mm（M8→8）' }, torque_Nm: { type: 'number', description: 'bolt_preload: 擰緊扭矩 N·m' }, friction_K: { type: 'number', description: 'bolt_preload: 扭矩系數（干0.2/潤滑0.14）' },
    pulley1_d: { type: 'number', description: 'belt_length: 小輪節徑 mm' }, pulley2_d: { type: 'number', description: 'belt_length: 大輪節徑 mm' }, center: { type: 'number', description: 'belt_length: 中心距 mm' },
    tool_d: { type: 'number', description: 'spindle_rpm: 刀具直徑 mm' }, cutting_speed: { type: 'number', description: 'spindle_rpm: 切削速度 Vc m/min' },
  }, required: ['calc'] } },
  { name: 'fit_view', description: '將視圖縮放到剛好框住模型（適應窗口）。', parameters: { type: 'object', properties: {} } },
  { name: 'export_model', description: '導出當前模型為檔案（觸發下載）。', parameters: { type: 'object', properties: { format: { type: 'string', enum: ['stl', 'step'], description: '格式' } }, required: ['format'] } },
  { name: 'modal_analysis', description: '運行模態分析（體素 FEM 約束模態固有頻率，趨勢級）。需要用戶先在 FEA 面板點一個【固定面】—— 若已點則直接求解並返回最低各階頻率(Hz)，否則回傳指引叫用戶先點固定面（不要假裝做了）。', parameters: { type: 'object', properties: {} } },
  { name: 'buckling_analysis', description: '運行線性屈曲分析（體素 FEM，趨勢級），返最低屈曲載荷因子 λ₁ 與臨界載荷 Pcr。需要用戶先在 FEA 面板點【固定面】+【受力面】并設力（與受力雲圖一樣）—— 若齊備則直接求解，否則回傳指引（不要假裝做了）。', parameters: { type: 'object', properties: {} } },
  { name: 'aero_open_lab', description: '打開【氣動設計實驗室】並按需求設定設計空間（螺旋槳/風扇、機翼、流線外殼）。brief = 一句設計需求（例如「120mm 靜音風扇 2500rpm 最高效率」「水底推進器外殼最低水阻」），或者直接用 kind 選內置範本。返回設計空間（變數範圍/目標/約束）。', parameters: { type: 'object', properties: { brief: { type: 'string', description: '一句自然語言設計需求（可選；有就優先）' }, kind: { type: 'string', enum: ['prop', 'wing', 'shell'], description: '沒有 brief 時用的內置範本：prop=螺旋槳/風扇，wing=機翼，shell=流線外殼' } } } },
  { name: 'aero_start_auto_design', description: '開始【自動設計模式】（AI 閉環）：每輪用（已修正的）工程估算優化 → 選頭 N 個不同設計送本機 OpenFOAM CFD → 用 CFD 結果訓練修正模型 → 再優化，直到輪數/CFD 額度/時間用完或者改善少於 ε。CFD 服務離線時自動改為只用估算（會講明未驗證）。螺旋槳/風扇的轉子 CFD 未驗證，預設不用，除非 use_rotor_cfd=true。此工具立即返回（循環在背景跑，每個 CFD 工作要幾分鐘）— 之後用 aero_auto_design_status 查進度。', parameters: { type: 'object', properties: {
    brief: { type: 'string', description: '一句設計需求（可選；沒有就用 kind 或實驗室目前的設計空間）' },
    kind: { type: 'string', enum: ['prop', 'wing', 'shell'], description: '沒有 brief 時用的內置範本' },
    rounds: { type: 'number', description: '最多幾輪（1–10，預設 3）' },
    top_n: { type: 'number', description: '每輪送多少個候選去 CFD（1–8，預設 2）' },
    max_cfd_jobs: { type: 'number', description: 'CFD 工作總上限（預設 6）' },
    max_minutes: { type: 'number', description: '時間上限（分鐘，預設 120）' },
    epsilon: { type: 'number', description: '最佳已驗證目標的相對改善少於此值就停（預設 0.01）' },
    mesh: { type: 'string', enum: ['coarse', 'medium', 'fine'], description: 'CFD 網格（預設 coarse：約 1–5 分鐘，流線體已驗證 ±5%；medium/fine 做最終確認）' },
    use_rotor_cfd: { type: 'boolean', description: '螺旋槳/風扇都照用轉子 CFD（部分驗證：靜態推力約 −12%，前飛偏低 20–35%；預設 false）' },
  } } },
  { name: 'aero_auto_design_status', description: '查詢自動設計循環的進度與結果：狀態、第幾輪、每輪最佳估算 vs CFD 數值、修正系數、目前最佳設計（參數、估算值、CFD 值、是否已經 CFD 驗證）。', parameters: { type: 'object', properties: {} } },
  { name: 'aero_stop_auto_design', description: '停止正在運行的自動設計循環（會取消排隊/正在計算的 CFD 工作；已完成的結果保留）。', parameters: { type: 'object', properties: {} } },
]

export const AI_SYSTEM_PROMPT = [
  '你是 WebCAD（瀏覽器參數化 3D CAD，真 OCCT B-rep 內核）的 AI 助手。',
  '你可以：(1) 用提供的工具直接幫用戶操作 app（建幾何體、布爾、改參數、載範本、導出）；(2) 解答「如何做 X」的問題。',
  '★教學優先：用戶問「如何用 X / 哪裏找 X / 點做 Y」（尤其需要 3D 拾取、你無法完成的操作如倒指定稜圓角/抽殼/打孔/裝配配合）→ 【先】調 explain_command(query) —— 它會在界面自動【高亮指出】真實該個掣，並返回真實位置(tab/面板/快捷鍵)。你【必須】用返回的真實位置來教，不要憑記憶亂作命令位置。之後一步步講操作。',
  '規矩：單位一律 mm；坐標 Z 向上。建模前可先調 get_model_info 了解現狀。多個步骤逐個工具調用（例如：先 create_box 再 create_cylinder operation=cut 做帶孔件）。',
  '倒角/圓角：【全稜】可用 fillet_all_edges / chamfer_all_edges 工具直接做；但【指定某幾條稜】需要用戶在 3D 視圖點選 —— 此類用文字指導。',
  '你無法完成的（需要在 3D 視圖點選邊/面）：選定稜倒角圓角、抽殼開指定面、打孔到指定面、裝配配合 —— 用文字一步步指導用戶自己做，不要假裝調用了。',
  '氣動設計：用戶要你設計螺旋槳/風扇/機翼/產品外殼並「自己測試找最好」→ 調 aero_start_auto_design（可帶 brief）；之後用 aero_auto_design_status 報告進度與最佳結果，講清楚邊些數字是 CFD 驗證、邊些只是估算、轉子 CFD 未驗證。',
  '回答精簡，用回用戶的語言（中文就中文）。完成操作後簡短確認做了什麼。',
].join('\n')
