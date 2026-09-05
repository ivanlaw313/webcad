// T809：AI Copilot 可调用嘅工具（function calling schema）。执行喺 store.aiTool（fid/applyFeatures 喺嗰度）。
// 只暴露【唔需 3D 拾取、可靠参数化】嘅操作（建基本体/布尔/参数/范本/读状态/出图）。需要拾边拾面嘅操作
// （倒角/孔/装配配合）AI 用文字指导用户做 —— 诚实唔假装做到。
import type { ToolDef } from './providers'

const op = { type: 'string', enum: ['new', 'cut', 'join'], description: '布尔操作：new=新实体 / cut=从现有实体切走 / join=合并入现有实体（默认 new）' }

export const TOOL_DEFS: ToolDef[] = [
  { name: 'get_model_info', description: '读取当前模型摘要：特征列表、实体体积/质量/包围盒尺寸、参数、组件数。先调用呢个了解现状。', parameters: { type: 'object', properties: {} } },
  { name: 'explain_command', description: '教学【指出+示范】：当用户问「点样用 X / 边度揾 X / 点做 Y」（如倒圆角/抽壳/拉伸/装配配合）→ 调呢个，会喺界面【自动高亮指出】真实嗰个 ribbon 掣 + 返真实位置(tab/面板/快捷键/说明)。然后你根据返回嘅【真实位置】一步步教用户（唔好凭空作命令名/位置）。', parameters: { type: 'object', properties: { query: { type: 'string', description: '用户想做嘅操作/功能名（如「倒圆角」「抽壳」「拉伸」「装配配合」）' } }, required: ['query'] } },
  { name: 'reset_document', description: '清空当前文档，由零开始（不可逆，相当于新建）。', parameters: { type: 'object', properties: {} } },
  { name: 'create_box', description: '创建长方体（mm）。', parameters: { type: 'object', properties: { length: { type: 'number', description: '长 X (mm)' }, width: { type: 'number', description: '宽 Y (mm)' }, height: { type: 'number', description: '高 Z (mm)' }, operation: op }, required: ['length', 'width', 'height'] } },
  { name: 'create_cylinder', description: '创建圆柱（mm）。', parameters: { type: 'object', properties: { diameter: { type: 'number', description: '直径 (mm)' }, height: { type: 'number', description: '高 (mm)' }, operation: op }, required: ['diameter', 'height'] } },
  { name: 'create_sphere', description: '创建球（mm）。', parameters: { type: 'object', properties: { diameter: { type: 'number', description: '直径 (mm)' }, operation: op }, required: ['diameter'] } },
  { name: 'create_cone', description: '创建圆锥/圆台（mm，顶直径 0 = 尖锥）。', parameters: { type: 'object', properties: { bottom_diameter: { type: 'number' }, top_diameter: { type: 'number', description: '顶直径，0 = 尖锥' }, height: { type: 'number' }, operation: op }, required: ['bottom_diameter', 'height'] } },
  { name: 'create_torus', description: '创建圆环（甜甜圈，mm）。', parameters: { type: 'object', properties: { outer_diameter: { type: 'number', description: '外径 (mm)' }, tube_diameter: { type: 'number', description: '管径 (mm)' }, operation: op }, required: ['outer_diameter', 'tube_diameter'] } },
  { name: 'create_wedge', description: '创建楔形/斜坡（直角三角形截面沿宽度拉伸，一端高一端到 0）。做斜坡/挡块/加强角。', parameters: { type: 'object', properties: { length: { type: 'number', description: '长 X (mm)' }, width: { type: 'number', description: '宽 Y (mm)' }, height: { type: 'number', description: '高 Z (mm)' }, operation: op }, required: ['length', 'width', 'height'] } },
  { name: 'create_dome', description: '创建圆顶/球冠（球嘅顶部平坐地面）。cap_height 空或≥半径=半球；0<cap_height<半径=浅冠（表镜/透镜/按钮）。', parameters: { type: 'object', properties: { diameter: { type: 'number', description: '底直径 (mm)' }, cap_height: { type: 'number', description: '冠高 mm（默认=半径=半球）' }, operation: op }, required: ['diameter'] } },
  { name: 'create_half_cylinder', description: '创建半圆柱 / D 形（全圆柱切走 x<0 半边，平面喺 YZ，圆凸喺 +x）。做 D 轴/D 孔联轴/半圆条。', parameters: { type: 'object', properties: { diameter: { type: 'number', description: '直径 (mm)' }, height: { type: 'number', description: '高 (mm)' }, operation: op }, required: ['diameter', 'height'] } },
  { name: 'create_pie', description: '创建扇形柱 / 圆盘扇区（半径×高矩形绕 Z 扫 angle 度）。做凸轮/分度盘/部分圆盘。', parameters: { type: 'object', properties: { diameter: { type: 'number', description: '直径 (mm)' }, angle: { type: 'number', description: '扇形角度°（0-360，默认整圈）' }, height: { type: 'number', description: '高 (mm)' }, operation: op }, required: ['diameter', 'height'] } },
  { name: 'create_pyramid', description: '创建棱锥/棱台（正多边形底，sides=边数）。top_diameter=0 尖锥，>0 棱台。做金字塔/多棱柱台。', parameters: { type: 'object', properties: { base_diameter: { type: 'number', description: '底外接圆直径 (mm)' }, top_diameter: { type: 'number', description: '顶外接圆直径 mm（0=尖锥）' }, height: { type: 'number', description: '高 (mm)' }, sides: { type: 'number', description: '边数（3-12，默认4）' }, operation: op }, required: ['base_diameter', 'height'] } },
  { name: 'fillet_all_edges', description: '对当前实体【所有棱】倒圆角（半径 mm，免拣边）。半径相对几何过大会失败。', parameters: { type: 'object', properties: { radius: { type: 'number', description: '圆角半径 (mm)' } }, required: ['radius'] } },
  { name: 'chamfer_all_edges', description: '对当前实体【所有棱】倒角（距离 mm，免拣边）。', parameters: { type: 'object', properties: { distance: { type: 'number', description: '倒角距离 (mm)' } }, required: ['distance'] } },
  { name: 'load_sample', description: '载入一个内置参数化范本/示例模型。', parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['plate', 'enclosure', 'flange', 'bracket', 'gear', 'gearpair', 'planetary', 'rackpinion', 'bearing', 'spring', 'elbow', 'heatsink', 'knob', 'vase', 'bowl', 'tslot', 'honeycomb', 'shaft', 'washer', 'standoff', 'fourbarAsm'], description: '范本类型' } }, required: ['kind'] } },
  { name: 'add_parameter', description: '新增一个用户参数（ƒx），之后可被尺寸引用 / 联动重建。', parameters: { type: 'object', properties: { name: { type: 'string' }, value: { type: 'number' } }, required: ['name', 'value'] } },
  { name: 'set_parameter', description: '修改一个已存在用户参数嘅值（触发联动重建）。', parameters: { type: 'object', properties: { name: { type: 'string' }, value: { type: 'number' } }, required: ['name', 'value'] } },
  { name: 'create_text', description: '加凸起/凹刻文字（英数；放喺 XY 面，时间轴可改字号/高度/基准Z）。emboss=凸字，engrave=凹刻（需已有实体承接）。', parameters: { type: 'object', properties: { text: { type: 'string' }, size: { type: 'number', description: '字号 mm（默认 12）' }, height: { type: 'number', description: '凸/凹深 mm（默认 4）' }, mode: { type: 'string', enum: ['emboss', 'engrave'], description: 'emboss 凸 / engrave 凹刻' } }, required: ['text'] } },
  { name: 'set_material', description: '设置实体材质/外观（影响颜色 + 质量密度计算）。', parameters: { type: 'object', properties: { material: { type: 'string', enum: ['钢', '铝', '黄铜', '铜', '塑料', '金', '银', '钛'], description: '材质名' } }, required: ['material'] } },
  { name: 'mirror_body', description: '把实体跨 YZ 平面镜像（做左右对称件）。', parameters: { type: 'object', properties: {} } },
  { name: 'engineering_calc', description: '机械设计速算（只返结果，唔改模型）。支持齿轮啮合 / 螺栓预紧 / 皮带长度 / 主轴转速。', parameters: { type: 'object', properties: {
    calc: { type: 'string', enum: ['gear_mesh', 'bolt_preload', 'belt_length', 'spindle_rpm'], description: '计算类型' },
    module: { type: 'number', description: 'gear_mesh: 模数 m' }, teeth1: { type: 'number', description: 'gear_mesh: 齿数1' }, teeth2: { type: 'number', description: 'gear_mesh: 齿数2' },
    bolt_d: { type: 'number', description: 'bolt_preload: 螺纹公称直径 mm（M8→8）' }, torque_Nm: { type: 'number', description: 'bolt_preload: 拧紧扭矩 N·m' }, friction_K: { type: 'number', description: 'bolt_preload: 扭矩系数（干0.2/润滑0.14）' },
    pulley1_d: { type: 'number', description: 'belt_length: 小轮节径 mm' }, pulley2_d: { type: 'number', description: 'belt_length: 大轮节径 mm' }, center: { type: 'number', description: 'belt_length: 中心距 mm' },
    tool_d: { type: 'number', description: 'spindle_rpm: 刀具直径 mm' }, cutting_speed: { type: 'number', description: 'spindle_rpm: 切削速度 Vc m/min' },
  }, required: ['calc'] } },
  { name: 'fit_view', description: '将视图缩放到刚好框住模型（适应窗口）。', parameters: { type: 'object', properties: {} } },
  { name: 'export_model', description: '导出当前模型为档案（触发下载）。', parameters: { type: 'object', properties: { format: { type: 'string', enum: ['stl', 'step'], description: '格式' } }, required: ['format'] } },
  { name: 'modal_analysis', description: '运行模态分析（体素 FEM 约束模态固有频率，趋势级）。需要用户先喺 FEA 面板点一个【固定面】—— 若已点则直接求解返最低各阶频率(Hz)，否则回传指引叫用户先点固定面（唔好假装做咗）。', parameters: { type: 'object', properties: {} } },
  { name: 'buckling_analysis', description: '运行线性屈曲分析（体素 FEM，趋势级），返最低屈曲载荷因子 λ₁ 与临界载荷 Pcr。需要用户先喺 FEA 面板点【固定面】+【受力面】并设力（同受力云图一样）—— 若齐备则直接求解，否则回传指引（唔好假装做咗）。', parameters: { type: 'object', properties: {} } },
]

export const AI_SYSTEM_PROMPT = [
  '你係 WebCAD（浏览器参数化 3D CAD，受 Fusion 360 启发，真 OCCT B-rep 内核）嘅 AI 助手。',
  '你可以：(1) 用提供嘅工具直接帮用户操作 app（建几何体、布尔、改参数、载范本、导出）；(2) 解答「点样做 X」嘅问题。',
  '★教学优先：用户问「点样用 X / 边度揾 X / 点做 Y」（尤其需要 3D 拾取、你做唔到嘅操作如倒指定棱圆角/抽壳/打孔/装配配合）→ 【先】调 explain_command(query) —— 佢会喺界面自动【高亮指出】真实嗰个掣，并返真实位置(tab/面板/快捷键)。你【必须】用返回嘅真实位置嚟教，唔好凭记忆乱作命令位置。之后一步步讲操作。',
  '规矩：单位一律 mm；坐标 Z 向上。建模前可先调 get_model_info 了解现状。多个步骤逐个工具调用（例如：先 create_box 再 create_cylinder operation=cut 做带孔件）。',
  '倒角/圆角：【全棱】可用 fillet_all_edges / chamfer_all_edges 工具直接做；但【指定某几条棱】需要用户喺 3D 视图点选 —— 呢种用文字指导。',
  '你做唔到嘅（需要喺 3D 视图点选边/面）：选定棱倒角圆角、抽壳开指定面、打孔到指定面、装配配合 —— 用文字一步步指导用户自己做，唔好假装调用咗。',
  '回答精简，用返用户嘅语言（中文就中文）。完成操作后简短确认做咗乜。',
].join('\n')
