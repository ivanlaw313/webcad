import { commandContextKey, commandDisabledReason } from '../cad/commandAvailability'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp, SAMPLE_LABELS, type SampleKind } from '../store'
import { WORKSPACES, SKETCH_PANELS, FORM_PANELS, type Tool } from '../ribbon'

// A searchable command. Ribbon tools dispatch through runCommand(id); templates and
// global file/edit/view actions carry their own `run` closure instead.
type Cmd = Partial<Tool> & { id: string; label: string; from: string; run?: () => void }

// Everyday-word synonyms so a non-coder finds a command by what they'd naturally type
// (e.g. 「螺丝」→孔, 「盒」→长方体, 「弹簧」→螺旋, "screw"→hole). Matched in addition to label/tip.
const SYN: Record<string, string> = {
  hole: '螺丝 螺钉 钉 screw 钻孔 打孔 沉头 埋头 通孔',
  box: '盒 方块 立方体 cube 块 方盒',
  cylinder: '柱 圆柱 管 棒 杆 轴 rod pillar',
  sphere: '球 圆球 ball',
  tube: '管 套筒 衬套 空心管 sleeve',
  rbox: '圆角盒 圆角长方体 外壳 外壳盒 项目盒 电子盒 机箱 圆角支架 enclosure rounded box case',
  importdxf: '导入dxf 導入dxf dxf 激光切割 laser 2D轮廓 平面图 cad图 import dxf 切割图',
  importsvg: '导入svg svg logo 标志 图标 矢量 矢量图 vector icon 标牌 铭牌 import svg 導入svg',
  insertmesh: '导入stl stl 导入网格 import mesh 模型 网格',
  meshfit: 'meshfit mesh fit 转brep 转 b-rep convert mesh 网格拟合 参数化 缝合',
  convert: 'meshfit convert 转换 转brep 网格转实体',
  formsubdiv: 'subdivide 细分 form subdivide',
  formcrease: 'crease 折痕 form crease',
  formbridge: 'bridge form bridge 桥接',
  formweld: 'weld form weld 焊接',
  formfillhole: 'fill hole form 补洞',
  formerasefill: 'erase fill form',
  finish3d: 'cam 3d加工 刀路 manufacture toolpath gcode',
  bom: 'bom 材料清单 bill of materials 零件表',
  prism: '棱柱 六角 多边形柱 hex',
  cone: '圆锥 圓錐 圆台 圓台 锥 漏斗 喷嘴 锥销 灯罩 funnel taper',
  wedge: '楔形 楔 斜坡 坡道 门挡 三角块 三角支撑 ramp wedge',
  dome: '圆顶 半球 球冠 按钮 旋钮 顶盖 透镜 dome hemisphere',
  halfcyl: '半圆柱 半圆 D形 D轴 D孔 半圆条 half cylinder',
  pie: '扇形 饼块 扇形柱 凸轮 分度盘 部分圆盘 pie sector wedge',
  fillet: '圆角 倒圆 round 圆滑边',
  chamfer: '倒角 斜角 bevel 45度',
  shell: '抽壳 掏空 挖空 壳 空心 hollow',
  extrude: '拉伸 挤出 长高 拔高 push',
  revolve: '旋转 车削 回转 lathe',
  loft: '放样 过渡 渐变',
  sweep: '扫掠 沿路径 扫出',
  measureuni: '统一测量 統一測量 測量 量 尺寸 距离 面积 夹角 最短距 measure unified',
  measure: '量 尺寸 距离 测量 測量 两点 兩點 ruler',
  measureedge: '量边 边长 邊長 孔径 孔徑 直径 量孔',
  measureface: '量面 面积 面積 表面',
  measureangle: '量角 角度 夹角 夾角 面夾角',
  properties: '物理属性 物理屬性 质量 体积 惯性 质心 質心 密度 properties mass',
  meshfacegroups: '网格面组 網格面組 顯示網格面組 上色 面组 face groups',
  appearance: '颜色 上色 染色 材质 color material 外观',
  mirror: '镜像 对称 翻转 flip',
  pattern: '阵列 复制排列 array 网格 矩形阵列',
  cpattern: '环形阵列(旧) 圆形排列 旋转复制',
  circpattern: '环形阵列 圆形排列 螺栓圈 旋转复制 circular pattern 辐条 对称',
  exportasmstep: '导出装配 導出裝配 step 彩色 颜色 assembly xcaf ap214',
  gearbox: '齒輪箱 齿轮箱 減速箱 速比 傳動比 gearbox 自動嚙合',
  moldflow: '模流 注塑 浇口 充填 焊接线 冷却 moldflow injection 塑胶',
  othread: '面加螺纹 外螺纹 选面螺纹 包牙 thread on face',
  holepts: '批量孔 草图点孔 多孔 bolt points',
  holecpts: '构造点批量孔 构造点孔 datum point holes cpoint holes 多孔',
  splitsketch: '草图分割 轮廓分割 切开 split sketch',
  align: '对齐 align 贴合 贴平 同轴快捷',
  sk_circle2t: '两切点圆 切线圆 tangent circle',
  sk_circle3t: '三切点圆 内切圆 apollonius',
  sk_circle2p: '两点圆 直径两端 diameter',
  worm: '蝸桿 蜗杆 蝸輪 蜗轮 worm 大減速',
  crowngear: '冠齒輪 冠齿轮 面齒輪 面齿轮 crown 垂直軸',
  pathpattern: '路径阵列 沿线复制',
  thread: '螺纹 螺紋 螺紋桿 牙 螺丝杆 螺杆 screw thread',
  gear: '齒輪 齿轮 牙輪 正齒輪 正齿轮',
  rack: '齒條 齿条 直齒條 直齿条',
  pulley: '皮帶輪 皮带轮 帶輪 带轮 V帶 V带',
  text: '文字 字 刻字 雕字 标签 label engrave',
  joint: '關節 关节 連接 裝配 轉動 滑動 鉸鏈 joint',
  combine: '布尔 合并 切割 并集 差集 交集 boolean union',
  compboolean: '組件布爾 组件布尔 零件布爾 component boolean 網格布爾 布爾零件 🧩布爾 🧩布尔',
  bodyboolean: '實體布爾 实体布尔 多体布尔 body boolean',
  draft: '拔模 脱模 斜度',
  move: '移动 平移 搬 复制 transform',
  scale: '缩放 放大 缩小 比例',
  coil: '弹簧 螺旋 spring',
  sketch: '画 草图 绘图 draw 画图',
  csketch: '约束 尺寸驱动 精确草图 完全定义 已并入主草图',
  presspull: '推拉 按压 press pull 推面',
  delface: '删面 去特征 直接编辑 defeature delete face remove 清倒角 清孔 导入件',
  surfloft: '曲面放樣 曲面放样 surface loft 放樣 放样',
  ruled: '規則曲面 规则曲面 ruled surface',
  surfsweep: '曲面掃掠 曲面扫掠 surface sweep',
  surfrevolve: '曲面旋轉 曲面旋转 surface revolve',
  surfsew: '縫合 缝合 stitch 曲面縫合',
  surfunstitch: '取消縫合 取消缝合 unstitch',
  editpoles: '編輯曲面控制點 编辑曲面控制点 edit poles',
  surfpatch: '補面 补面 曲面 patch 填充 fill 加厚 蒙皮 補洞 补洞 boundary surface',
  boundarypatch: '邊界補面 边界补面 boundary patch 拾边 填充 fill 封口 補洞 补洞 N边洞 相切 g1 曲面 surface',
  thicken: '加厚 thicken 曲面转实体 薄板 面加厚 surface to solid',
  offsetsurf: '偏移曲面 offset surface 平行曲面 面偏移 两侧 both ±',
  reversesurf: '翻轉曲面 翻转曲面 反转 法向 reverse surface flip normal 定向',
  mergefaces: 'merge faces 合并面 合并 同域 unify same domain 共面 共柱 清噪 简化曲面',
  rib: '加强筋 筋 肋 web 支撑',
  splitbody: '分割 切开 分体 split',
  interference: '干涉 干涉檢查 碰撞 间隙 collision clearance',
  zebra: '斑马纹 斑馬紋 斑馬紋分析 zebra stripe',
  curvmap: '曲率图 曲率圖 曲率圖分析 curvature map',
  accessanalysis: '可达性 可達性 可達性分析 accessibility',
  minradius: '最小半径 最小半徑 最小半徑分析 min radius',
  centerofmass: '质心 質心 重心 center of mass com',
  curvcomb: '曲率梳 曲率梳分析 comb',
  section: '剖切 剖面 剖切分析 切开看内部',
  sheetmetal: '钣金 折弯 展开 bend',
  exportstl: '导出 stl 3d打印 print',
  exportstep: '导出 step stp',
  exportglb: '导出 gltf glb 模型分享',
  drawing: '工程图 工程圖 图纸 三视图 三視圖 出图 drawing',
  asmdrawing: '装配工程图 裝配工程圖 assembly drawing bom 氣泡',
  params: '參數 参数 变量 ƒx fx parameter',
  fourbar: '四連桿 四连杆 四連桿機構 四连杆机构 four-bar linkage 連桿',
  slidercrank: '滑塊曲柄 滑块曲柄 曲柄滑塊 活塞 slider crank',
  sixbar: '六桿 六杆 六桿機構 六杆机构 six-bar stephenson',
  calc: '工程計算 工程计算 速算 calculator 齒輪嚙合',
}

// Flattened, de-duplicated command list built once from every workspace ribbon.
// Keeps the richest entry (the one that carries a `tip`, usually from the SOLID tab)
// and records the first "WORKSPACE · PANEL" it appears in as a subtle source tag.
function buildCommands(): Cmd[] {
  const byId = new Map<string, Cmd>()
  const addTool = (t: Tool, from: string) => {
    const existing = byId.get(t.id)
    if (!existing) byId.set(t.id, { ...t, from })
    else if (!existing.tip && t.tip) byId.set(t.id, { ...existing, ...t, from: existing.from })
    // Submenu entries are executable commands. Index them recursively so
    // Simplify → Replace with Primitive is reachable from command search.
    for (const child of t.children || []) addTool(child, from)
  }
  for (const wsName of Object.keys(WORKSPACES)) {
    const ws = WORKSPACES[wsName]
    for (const panel of ws.panels) {
      for (const t of panel.tools) {
        const existing = byId.get(t.id)
        if (!existing) {
          byId.set(t.id, { ...t, from: `${wsName} · ${panel.name}` })
        } else if (!existing.tip && t.tip) {
          // upgrade to the richer (tipped) variant but keep the original source tag
          byId.set(t.id, { ...existing, ...t, from: existing.from })
        }
        addTool(t, `${wsName} 繚 ${panel.name}`)
      }
    }
  }
  // GM-FP4 #50：情境「草图」tab 嘅工具（sk_*）本喺 WORKSPACES 之外（隐形）→ 命令面板搵唔到。
  // 一并收入，令 S 面板喺草图内可搜/执行草图命令（Fusion「Sketch Shortcuts」面板）。sk_* 带 SKETCH · 面板 标签。
  for (const panel of SKETCH_PANELS) {
    for (const t of panel.tools) {
      if (byId.has(t.id)) continue   // 唔覆盖已存在（例如 sectionprops 同名）
      byId.set(t.id, { ...t, from: `SKETCH · ${panel.name}` })
    }
  }
  // FORM contextual tools (Subdivide/Crease/...) — searchable like meshfit discovery.
  for (const panel of FORM_PANELS) {
    for (const t of panel.tools) {
      if (byId.has(t.id)) continue
      byId.set(t.id, { ...t, from: `FORM · ${panel.name}` })
    }
  }
  // 'select' is not a real command worth surfacing in search
  const ribbon = [...byId.values()].filter((c) => c.id !== 'select')

  // Start templates — typing e.g. 「齿轮组」/「螺栓」 finds and loads them.
  const templates: Cmd[] = (Object.keys(SAMPLE_LABELS) as SampleKind[]).map((k) => ({
    id: `sample:${k}`, label: `模板 · ${SAMPLE_LABELS[k]}`, from: '起始模板', tip: '载入此起始模板（之后改 ƒx 参数即联动）',
    run: () => void useApp.getState().loadSample(k),
  }))

  // Global file / edit / view commands that live on the toolbar (not in the ribbon).
  const g = () => useApp.getState()
  const extras: Cmd[] = [
    { id: 'act:save', label: '保存项目 (JSON)', from: '文件', run: () => g().saveProject() },
    { id: 'act:open', label: '打开项目 (JSON)', from: '文件', run: () => g().openProject() },
    { id: 'act:new', label: '新建空白文档', from: '文件', tip: '清空全部并重置', run: async () => { if (await g().appConfirm('新建空白文档？当前模型会清空（未保存的话先「保存」）。')) void g().reset() } },
    { id: 'act:undo', label: '撤销', from: '编辑', shortcut: 'Ctrl+Z', run: () => void g().undo() },
    { id: 'act:redo', label: '重做', from: '编辑', shortcut: 'Ctrl+Y', run: () => void g().redo() },
    { id: 'act:fit', label: '适应窗口 / 主视图', from: '视图', run: () => g().requestFit() },
    { id: 'act:params', label: '用户参数表 (ƒx)', from: '管理', run: () => g().toggleParamsPanel() },
    { id: 'act:help', label: '帮助 / 快捷键', from: '帮助', shortcut: 'F1', run: () => g().toggleHelp() },
  ]
  return [...ribbon, ...templates, ...extras]
}

export default function CommandPalette() {
  const open = useApp((s) => s.cmdPaletteOpen)
  const setOpen = useApp((s) => s.setCmdPalette)
  const run = useApp((s) => s.runCommand)
  const inSketch = useApp((s) => s.mode === 'sketch')   // GM-FP4 #50：草图内 → 草图命令排前 + placeholder 提示
  const contextKey = useApp(commandContextKey)
  const [showUnavailable, setShowUnavailable] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const all = useMemo(buildCommands, [])
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    const available = showUnavailable ? all : all.filter(c => !commandDisabledReason(useApp.getState(), c.id))
    const base = !s ? available : available.filter((c) =>
      c.label.toLowerCase().includes(s) ||
      c.id.toLowerCase().includes(s) ||
      (c.tip ? c.tip.toLowerCase().includes(s) : false) ||
      (SYN[c.id] ? SYN[c.id].toLowerCase().includes(s) : false) ||
      c.from.toLowerCase().includes(s))
    // GM-FP4 #50：草图模式 → 草图工具（sk_*）稳定排到最前（Fusion「Sketch Shortcuts」优先草图命令）。
    if (!inSketch) return base
    const isSk = (id: string) => id.startsWith('sk_')
    return [...base].sort((a, b) => (isSk(a.id) === isSk(b.id) ? 0 : isSk(a.id) ? -1 : 1))
  }, [q, all, inSketch, contextKey, showUnavailable])

  // Reset query + selection each time the palette opens; focus the input.
  useEffect(() => {
    if (open) { setQ(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 0) }
  }, [open])

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  if (!open) return null

  const choose = (c: Cmd) => { if (commandDisabledReason(useApp.getState(), c.id)) return; setOpen(false); if (c.run) c.run(); else run(c.id, c.label) }
  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[sel]) choose(results[sel]) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  return (
    <div
      onClick={() => setOpen(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(20,24,28,.32)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '12vh' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, 92vw)', background: '#fff', border: '1px solid #b6c0c9', borderRadius: 10, boxShadow: '0 18px 60px rgba(0,0,0,.34)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid #e3e8ec' }}>
          <span style={{ fontSize: 16, opacity: .55 }}>🔍</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0) }}
            onKeyDown={onKey}
            aria-label="搜索命令"
            placeholder={inSketch ? '搜索草图命令…（例如 直线 / 圆 / 尺寸 / 修剪 / 偏移）' : '搜索命令…（例如 齿轮 / 拉伸 / 倒角 / 导出）'}
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, background: 'transparent' }}
          />
          <span style={{ fontSize: 11, color: '#9aa6b0' }}>↑↓ 选择 · Enter 执行 · Esc 关闭</span>
        </div>
        <label style={{ padding: '6px 14px', fontSize: 12, color: '#556575' }}><input type="checkbox" checked={showUnavailable} onChange={e => { setShowUnavailable(e.target.checked); setSel(0) }} /> 显示当前不可用命令</label>
        <div ref={listRef} style={{ overflowY: 'auto' }}>
          {results.length === 0 && (
            <div style={{ padding: '18px 16px', color: '#8a96a0', fontSize: 13 }}>{showUnavailable ? `没有与「${q}」匹配的命令。请换一个名称或关键词。` : `当前环境没有与「${q}」匹配的可用命令。可勾选「显示当前不可用命令」查看，或先完成／取消当前操作。`}</div>
          )}
          {results.map((c, i) => (
            <div
              key={c.id}
              data-i={i}
              role="option" aria-disabled={!!commandDisabledReason(useApp.getState(), c.id)}
              title={commandDisabledReason(useApp.getState(), c.id) ?? c.tip}
              onMouseEnter={() => setSel(i)}
              onClick={() => choose(c)}
              style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 14px', opacity: commandDisabledReason(useApp.getState(), c.id) ? .48 : 1, cursor: commandDisabledReason(useApp.getState(), c.id) ? 'not-allowed' : 'pointer', background: i === sel ? '#eaf3fb' : 'transparent', borderLeft: i === sel ? '3px solid #2a7aa8' : '3px solid transparent' }}
            >
              <span style={{ fontWeight: 600, fontSize: 14, color: '#1d2329', whiteSpace: 'nowrap' }}>{c.label}</span>
              {c.shortcut && <kbd style={{ fontSize: 10, color: '#6b7884', border: '1px solid #cfd8df', borderRadius: 4, padding: '0 4px' }}>{c.shortcut}</kbd>}
              {c.tip && <span style={{ fontSize: 12, color: '#7a8893', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.tip}</span>}
              <span style={{ marginLeft: 'auto', fontSize: 10, color: '#aab4bd', whiteSpace: 'nowrap' }}>{c.from}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
