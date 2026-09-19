import { useEscapeLayer } from './useEscapeLayer'
import { Fragment, useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react'
import { ToolIcon } from '../icons'
import { useApp } from '../store'
import { tStatus } from '../i18n'
import { illegalRejectStatus, isIllegalRejectStatus, ILLEGAL_LENGTH_DETAIL, ILLEGAL_THICKNESS_DETAIL } from '../ui/illegalInput'
import { useDraggable } from './useDraggable'
import { computeScrubIndex, chipSwatchColor } from '../cad/selectionModel'   // GM-X4 #9：色板 + hideInactive 稳健回卷索引

// P2 Edit Feature：双击呢啲 kind 重开原创建对话框（其余 sketch 类照旧开草图编辑器 / fallback 内联条）
const EDIT_DLG_KINDS = new Set<string>(['extrude', 'revolve', 'sweep', 'loft', 'fillet', 'chamfer', 'shell', 'mirror', 'pattern', 'geoPattern', 'circPattern', 'pathpattern', 'coil', 'rib', 'scale', 'transform', 'draft', 'othread', 'ithread', 'hole'])

// 测试报告观察 C：时间轴特徵尺寸输入 — 改为本地缓冲 + 失焦/Enter 先提交（之前每个 keystroke 即触发
// 异步重建，令打字被打断 / 自动化改唔到值）。同 featDlg 输入一致行为。外部值变（参数绑定/撤销）会重新同步。
function NumField({ value, disabled, step = 0.5, min, onCommit, rejectDetail }: { value: number; disabled?: boolean; step?: number; min?: number; onCommit: (n: number) => void; rejectDetail?: string }) {
  const [buf, setBuf] = useState(String(value))
  const skipCommit = useRef(false)
  useEffect(() => { setBuf(String(value)) }, [value])
  const commit = () => {
    if (skipCommit.current) { skipCommit.current = false; setBuf(String(value)); return }
    const n = Number(buf)
    // BUG-UI-003 / BUG-UI-001: reject n < min (≤0 length) and announce 尺寸已拒絕 — silent revert hid the reason.
    if (Number.isFinite(n) && (min == null || n >= min)) { if (n !== value) onCommit(n) }
    else {
      setBuf(String(value))
      if (min != null) useApp.setState({ status: illegalRejectStatus(rejectDetail || ILLEGAL_LENGTH_DETAIL) })
    }
  }
  return (
    <input
      // No HTML min: browsers with min>0 silently block typing "-1" before commit, so reject never runs.
      // Logical min stays in commit() above. Esc still skips commit via skipCommit.
      type="number" step={step} disabled={disabled} value={buf}
      onChange={(e) => setBuf(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur() }
        // BUG-UI-002: Esc reverts the draft and skips the blur commit so closing the editor does not apply.
        if (e.key === 'Escape') { e.preventDefault(); skipCommit.current = true; setBuf(String(value)); (e.currentTarget as HTMLInputElement).blur() }
      }}
    />
  )
}

// defKey：值缺省时嘅回退键（例：coil r2 缺省 = radius）；只影响面板显示默认，唔会主动烘焙（NumField 只喺改动先 commit）
type FieldDef = { key: string; label: string; unit: string; opts?: { value: string; label: string }[]; defKey?: string }
const META: Record<string, { icon: string; label: string; param: string; field: string; unit: string; fields?: FieldDef[] }> = {
  hole: { icon: 'hole', label: '孔', param: '直徑', field: 'diameter', unit: 'mm', fields: [{ key: 'diameter', label: '直徑', unit: 'mm' }, { key: 'depth', label: '深度', unit: 'mm' }] },
  offsetsolid: { icon: 'scale', label: '整體偏移', param: '距離', field: 'distance', unit: 'mm', fields: [{ key: 'distance', label: '距離', unit: 'mm' }] },
  extrude: { icon: 'extrude', label: '拉伸', param: '高度', field: 'height', unit: 'mm', fields: [{ key: 'height', label: '高度', unit: 'mm' }, { key: 'twist', label: '扭轉', unit: '°' }, { key: 'operation', label: '操作', unit: '', opts: [{ value: 'new', label: '加料' }, { value: 'cut', label: '切割' }] }, { key: 'plane', label: '草圖面', unit: '', opts: [{ value: 'XY', label: '上 XY' }, { value: 'XZ', label: '前 XZ' }, { value: 'YZ', label: '右 YZ' }] }] },
  revolve: { icon: 'revolve', label: '旋轉', param: '角度', field: 'angle', unit: '°', fields: [{ key: 'angle', label: '角度', unit: '°' }, { key: 'axis', label: '繞軸', unit: '', opts: [{ value: 'Y', label: 'Y 軸（預設）' }, { value: 'X', label: 'X 軸' }, { value: 'Z', label: 'Z 軸' }] }, { key: 'op', label: '操作', unit: '', opts: [{ value: 'new', label: '加料' }, { value: 'cut', label: '切割(車槽)' }, { value: 'intersect', label: '相交' }] }] },
  fillet: { icon: 'fillet', label: '圓角', param: '半徑', field: 'radius', unit: 'mm' },
  facefillet: { icon: 'fillet', label: '面圓角', param: '半徑', field: 'radius', unit: 'mm', fields: [{ key: 'radius', label: '半徑', unit: 'mm' }] },
  chamfer: { icon: 'chamfer', label: '倒角', param: '距離', field: 'distance', unit: 'mm' },
  shell: { icon: 'shell', label: '抽殼', param: '壁厚', field: 'thickness', unit: 'mm' },
  pattern: { icon: 'pattern', label: '陣列', param: 'X 數量', field: 'countX', unit: '', fields: [{ key: 'countX', label: 'X數量', unit: '' }, { key: 'countY', label: 'Y數量', unit: '' }, { key: 'countZ', label: 'Z數量', unit: '' }, { key: 'dx', label: 'X間距', unit: 'mm' }, { key: 'dy', label: 'Y間距', unit: 'mm' }, { key: 'dz', label: 'Z間距', unit: 'mm' }] },
  prim: { icon: 'box', label: '原語', param: '尺寸', field: 'a', unit: 'mm', fields: [{ key: 'a', label: '尺寸A', unit: 'mm' }, { key: 'b', label: '尺寸B', unit: 'mm' }, { key: 'c', label: '尺寸C', unit: 'mm' }] },
  mirror: { icon: 'mirror', label: '鏡像', param: '偏移', field: 'offset', unit: 'mm', fields: [{ key: 'plane', label: '對稱面', unit: '', opts: [{ value: 'YZ', label: 'YZ（左右）' }, { value: 'XZ', label: 'XZ（前後）' }, { value: 'XY', label: 'XY（上下）' }] }, { key: 'offset', label: '面偏移', unit: 'mm' }] },
  loft: { icon: 'loft', label: '放樣', param: '高度', field: 'height', unit: 'mm' },
  surfloft: { icon: 'loft', label: '曲面放樣', param: '壁厚', field: 'wall', unit: 'mm', fields: [{ key: 'wall', label: '壁厚', unit: 'mm' }] },
  surfpatch: { icon: 'surf', label: '曲面 Patch', param: '板厚', field: 'thick', unit: 'mm', fields: [{ key: 'thick', label: '板厚', unit: 'mm' }] },
  boundarypatch: { icon: 'surf', label: '邊界補面', param: '加厚', field: 'thick', unit: 'mm', fields: [{ key: 'thick', label: '加厚', unit: 'mm' }] },
  surfbridge: { icon: 'surf', label: '橋接面', param: '加厚', field: 'thick', unit: 'mm', fields: [{ key: 'thick', label: '加厚', unit: 'mm' }] },
  surfsew: { icon: 'shell', label: '縫合 Stitch', param: '', field: '', unit: '', fields: [] },
  surfunstitch: { icon: 'shell', label: '取消縫合', param: '', field: '', unit: '', fields: [] },
  surfextrude: { icon: 'extrude', label: '曲面拉伸', param: '高度', field: 'height', unit: 'mm', fields: [{ key: 'height', label: '高度', unit: 'mm' }] },
  surfsweep: { icon: 'sweep', label: '曲面掃掠', param: '', field: '', unit: '', fields: [] },
  surfrevolve: { icon: 'revolve', label: '曲面旋轉', param: '角度', field: 'angle', unit: '°', fields: [{ key: 'angle', label: '角度', unit: '°' }, { key: 'axis', label: '繞軸', unit: '', opts: [{ value: 'Y', label: 'Y 軸（預設）' }, { value: 'X', label: 'X 軸' }, { value: 'Z', label: 'Z 軸' }] }] },
  ruled: { icon: 'loft', label: '規則曲面', param: '', field: '', unit: '', fields: [] },
  surftrim: { icon: 'shell', label: '平面裁剪', param: '', field: '', unit: '', fields: [] },
  surfsurftrim: { icon: 'shell', label: '曲面裁剪', param: '', field: '', unit: '', fields: [] },  // S155 曲面-曲面裁剪
  untrim: { icon: 'shell', label: '去裁/還原', param: '', field: '', unit: '', fields: [] },
  mergefaces: { icon: 'shell', label: '合併面', param: '', field: '', unit: '', fields: [] },  // S 合并同域邻面 Unify-Same-Domain
  editpoles: { icon: 'editpoles', label: '編輯曲面控制點', param: '', field: '', unit: '', fields: [] },  // S133 NURBS 极点编辑
  sweep: { icon: 'sweep', label: '掃掠', param: '半徑', field: 'r', unit: 'mm' },
  coil: { icon: 'coil', label: '螺旋', param: '螺距', field: 'pitch', unit: 'mm', fields: [{ key: 'pitch', label: '螺距', unit: 'mm' }, { key: 'height', label: '高度', unit: 'mm' }, { key: 'radius', label: '半徑', unit: 'mm' }, { key: 'r2', label: '頂半徑', unit: 'mm', defKey: 'radius' }, { key: 'wireR', label: '絲徑', unit: 'mm' }] },  // GM-L2 #61：顶半径 r2（锥形弹簧）恒显，缺省=底半径；老档 r2 absent 保持 absent，改动先烘焙
  thread: { icon: 'thread', label: '螺紋桿', param: '螺距', field: 'pitch', unit: 'mm', fields: [{ key: 'd', label: '直徑Ø', unit: 'mm' }, { key: 'pitch', label: '螺距', unit: 'mm' }, { key: 'height', label: '高度', unit: 'mm' }] },
  ithread: { icon: 'hole', label: '內螺紋孔', param: '公稱Ø', field: 'd', unit: 'mm', fields: [{ key: 'd', label: '公稱Ø', unit: 'mm' }, { key: 'pitch', label: '螺距', unit: 'mm' }, { key: 'height', label: '深度', unit: 'mm' }, { key: 'x', label: '中心X', unit: 'mm' }, { key: 'y', label: '中心Y', unit: 'mm' }] },
  cylpatch: { icon: 'cylpatch', label: '曲面貼花', param: '深度', field: 'depth', unit: 'mm', fields: [{ key: 'ang', label: '角度位置', unit: '°' }, { key: 'arc', label: '角寬', unit: '°' }, { key: 'zc', label: '軸向中心', unit: 'mm' }, { key: 'h', label: '軸向高', unit: 'mm' }, { key: 'depth', label: '深度', unit: 'mm' }, { key: 'mode', label: '模式', unit: '', opts: [{ value: 'boss', label: '凸台' }, { value: 'pocket', label: '凹槽' }, { value: 'flat', label: '銼平面' }] }] },
  sheetmetal: { icon: 'sheetmetal', label: '鈑金件', param: '厚度', field: 'thickness', unit: 'mm', fields: [{ key: 'thickness', label: '厚度', unit: 'mm' }, { key: 'radius', label: '折彎半徑', unit: 'mm' }, { key: 'kfactor', label: 'K因子', unit: '' }, { key: 'width', label: '寬度', unit: 'mm' }, { key: 'flat', label: '狀態', unit: '', opts: [{ value: '0', label: '摺疊' }, { value: '1', label: '展開' }] }] },
  pathpattern: { icon: 'pathpattern', label: '路徑陣列', param: '數量', field: 'count', unit: '', fields: [{ key: 'count', label: '數量', unit: '' }] },
  featpattern: { icon: 'pattern', label: '陣列（組）', param: 'X 數量', field: 'cols', unit: '', fields: [{ key: 'cols', label: 'X數量', unit: '' }, { key: 'rows', label: 'Y數量', unit: '' }, { key: 'dx', label: 'X間距', unit: 'mm' }, { key: 'dy', label: 'Y間距', unit: 'mm' }] },  // 特徵级组阵列：一个节点含 N 个副本，改行列数即重建
  extgroup: { icon: 'extrude', label: '拉伸組', param: '高度', field: 'height', unit: 'mm', fields: [{ key: 'height', label: '高度', unit: 'mm' }] },  // 多轮廓一次拉伸：一个节点含 N 个轮廓，改高度即全部一齐变（subs 各自保留 操作/贯通）
  gear: { icon: 'gear', label: '齒輪', param: '模數', field: 'module', unit: 'mm', fields: [{ key: 'module', label: '模數', unit: 'mm' }, { key: 'teeth', label: '齒數', unit: '' }, { key: 'thickness', label: '厚度', unit: 'mm' }, { key: 'bore', label: '中心孔Ø', unit: 'mm' }, { key: 'helix', label: '螺旋角β', unit: '°' }] },
  worm: { icon: 'worm', label: '蝸桿', param: '模數', field: 'module', unit: 'mm', fields: [{ key: 'module', label: '模數', unit: 'mm' }, { key: 'starts', label: '頭數', unit: '' }, { key: 'length', label: '長度', unit: 'mm' }] },  // T770
  crowngear: { icon: 'crowngear', label: '冠齒輪', param: '模數', field: 'module', unit: 'mm', fields: [{ key: 'module', label: '模數', unit: 'mm' }, { key: 'teeth', label: '齒數', unit: '' }, { key: 'discH', label: '盤厚', unit: 'mm' }, { key: 'faceW', label: '齒寬', unit: 'mm' }, { key: 'bore', label: '孔Ø', unit: 'mm' }] },  // T770
  rack: { icon: 'rack', label: '齒條', param: '模數', field: 'module', unit: 'mm', fields: [{ key: 'module', label: '模數', unit: 'mm' }, { key: 'length', label: '長度', unit: 'mm' }, { key: 'baseH', label: '底座高', unit: 'mm' }, { key: 'thickness', label: '厚度', unit: 'mm' }] },
  pulley: { icon: 'pulley', label: 'V帶輪', param: '外徑', field: 'diameter', unit: 'mm', fields: [{ key: 'diameter', label: '外徑', unit: 'mm' }, { key: 'width', label: '寬度', unit: 'mm' }, { key: 'bore', label: '中心孔Ø', unit: 'mm' }] },
  scale: { icon: 'scale', label: '縮放', param: '比例', field: 'factor', unit: '×', fields: [{ key: 'factor', label: '等比', unit: '×' }, { key: 'sx', label: '非等比X', unit: '×' }, { key: 'sy', label: '非等比Y', unit: '×' }, { key: 'sz', label: '非等比Z', unit: '×' }, { key: 'px', label: '基準X', unit: 'mm' }, { key: 'py', label: '基準Y', unit: 'mm' }, { key: 'pz', label: '基準Z', unit: 'mm' }] },  // T762
  draft: { icon: 'draft', label: '拔模', param: '角度', field: 'angle', unit: '°' },
  cpattern: { icon: 'cpattern', label: '環形陣列', param: '數量', field: 'count', unit: '', fields: [{ key: 'count', label: '數量', unit: '' }, { key: 'angle', label: '總角度', unit: '°' }, { key: 'axis', label: '繞軸', unit: '', opts: [{ value: 'Z', label: 'Z 軸(水平面內)' }, { value: 'X', label: 'X 軸' }, { value: 'Y', label: 'Y 軸' }] }] },
  copybody: { icon: 'newbody', label: '複製實體', param: '', field: '', unit: '', fields: [] },
  transform: { icon: 'move', label: '移動', param: 'X', field: 'dx', unit: 'mm', fields: [{ key: 'dx', label: 'X', unit: 'mm' }, { key: 'dy', label: 'Y', unit: 'mm' }, { key: 'dz', label: 'Z', unit: 'mm' }, { key: 'rx', label: '繞X', unit: '°' }, { key: 'ry', label: '繞Y', unit: '°' }, { key: 'rz', label: '繞Z', unit: '°' }] },
  pushpull: { icon: 'presspull', label: '按拉', param: '距離', field: 'dist', unit: 'mm' },
  delface: { icon: 'delface', label: '刪面', param: '', field: '', unit: '', fields: [] },
  thickenface: { icon: 'thicken', label: '加厚面', param: '板厚', field: 'thick', unit: 'mm', fields: [{ key: 'thick', label: '板厚', unit: 'mm' }] },
  offsetsurf: { icon: 'offsetsurf', label: '偏移曲面', param: '距離', field: 'dist', unit: 'mm', fields: [{ key: 'dist', label: '距離', unit: 'mm' }] },
  reversesurf: { icon: 'shell', label: '翻轉曲面', param: '', field: '', unit: '', fields: [] },  // S157 翻转曲面定向
  thickenquilt: { icon: 'thicken', label: '加厚整張曲面', param: '板厚', field: 'thick', unit: 'mm', fields: [{ key: 'thick', label: '板厚', unit: 'mm' }] },  // S182
  extendface: { icon: 'extrude', label: '曲面延伸', param: '長度', field: 'ext', unit: 'mm', fields: [{ key: 'ext', label: '長度', unit: 'mm' }] },
  splitface: { icon: 'splitface', label: '分割面', param: '', field: '', unit: '', fields: [] },
  replaceface: { icon: 'replaceface', label: '替換面', param: '', field: '', unit: '', fields: [] },
  moveface: { icon: 'replaceface', label: '移動面', param: '距離', field: 'dist', unit: 'mm', fields: [{ key: 'mode', label: '模式', unit: '', opts: [{ value: 'offset', label: '偏移' }, { value: 'tilt', label: '傾斜' }] }, { key: 'dist', label: '距離', unit: 'mm' }, { key: 'angle', label: '傾斜角', unit: '°' }] },  // GM-B2：移动面 — 距离(offset)/倾斜角(tilt) 可改
  rib: { icon: 'rib', label: '加強筋', param: '厚度', field: 'thickness', unit: 'mm', fields: [{ key: 'thickness', label: '厚度', unit: 'mm' }, { key: 'height', label: '高度', unit: 'mm' }, { key: 'baseZ', label: '基準Z', unit: 'mm' }, { key: 'draft', label: '拔模', unit: '°' }] },
  text: { icon: 'text', label: '文字', param: '字號', field: 'size', unit: 'mm', fields: [{ key: 'size', label: '字號', unit: 'mm' }, { key: 'height', label: '高度', unit: 'mm' }, { key: 'baseZ', label: '基準Z', unit: 'mm' }, { key: 'op', label: '操作', unit: '', opts: [{ value: 'new', label: '加料' }, { value: 'cut', label: '切割' }] }, { key: 'plane', label: '面', unit: '', opts: [{ value: 'XY', label: '上 XY' }, { value: 'XZ', label: '前 XZ' }, { value: 'YZ', label: '右 YZ' }] }] },
  newbody: { icon: 'newbody', label: '新實體', param: '', field: '', unit: '' },
  stepbody: { icon: 'insert', label: 'STEP實體', param: '', field: '', unit: '', fields: [{ key: 'op', label: '操作', unit: '', opts: [{ value: 'new', label: '加料' }, { value: 'cut', label: '切割' }] }] },
  bodyboolean: { icon: 'bodyboolean', label: '實體布爾', param: '目標#', field: 'target', unit: '', fields: [{ key: 'bop', label: '操作', unit: '', opts: [{ value: 'fuse', label: '合併' }, { value: 'cut', label: '切除' }, { value: 'common', label: '相交' }] }, { key: 'target', label: '目標實體#', unit: '' }] },
  split: { icon: 'default', label: '分割', param: '位置', field: 'offset', unit: 'mm', fields: [{ key: 'offset', label: '切割位置', unit: 'mm' }, { key: 'axis', label: '切割軸', unit: '', opts: [{ value: 'X', label: 'X' }, { value: 'Y', label: 'Y' }, { value: 'Z', label: 'Z' }] }, { key: 'keep', label: '保留為活動體', unit: '', opts: [{ value: 'lo', label: '低側' }, { value: 'hi', label: '高側' }] }] },  // S128：参数化分割（保历史）
  sketch: { icon: 'sketch', label: '草圖', param: '', field: '', unit: '' },  // T756：独立草图（无實體输出 — 双击重开编辑）
  datum: { icon: 'mirror', label: '參考面', param: '偏移', field: 'offset', unit: 'mm', fields: [{ key: 'offset', label: '偏移', unit: 'mm' }, { key: 'angle', label: '角度', unit: '°' }] },  // GM-W5 5.1：参考面/datum = 零几何时间轴节点（改 offset/angle → editFeature → 派生面移位）；angle 只对角度面有实义（其余无害）
  circPattern: { icon: 'cpattern', label: '環形陣列', param: '數量', field: 'count', unit: '', fields: [{ key: 'count', label: '數量', unit: '' }, { key: 'totalAngle', label: '總角度', unit: '°' }, { key: 'mode', label: '模式', unit: '', opts: [{ value: 'full', label: '完整 360°' }, { value: 'angle', label: '指定角度' }, { value: 'sym', label: '對稱' }] }] },  // T757
  meshbody: { icon: 'insert', label: '網格實體', param: '', field: '', unit: '' },  // T767：网格→B-rep
  othread: { icon: 'thread', label: '面外螺紋', param: '螺距', field: 'pitch', unit: 'mm', fields: [{ key: 'd', label: '直徑Ø', unit: 'mm' }, { key: 'pitch', label: '螺距', unit: 'mm' }, { key: 'height', label: '高度', unit: 'mm' }, { key: 'z0', label: '起點Z', unit: 'mm' }] },  // T775
}

// BUG-UI-003: length-like timeline fields must stay strictly positive (prim a/b/c, Ø, wall…).
// Signed fields (extrude height/down, transform dx, draft angle, offsets) stay unconstrained here.
const POSITIVE_LENGTH_KEYS = new Set([
  'a', 'b', 'c', 'diameter', 'radius', 'thickness', 'distance', 'pitch', 'module', 'width', 'bore',
  'wireR', 'size', 'thick', 'wall', 'ext', 'discH', 'faceW', 'baseH', 'length', 'depth', 'd', 'r', 'r2',
])

export default function Timeline() {
  const lang = useApp((s) => s.lang)
  const hasComponentHistory = useApp(s => s.components.some(c => c.src?.features.length))
  const inSketch = useApp((s) => s.mode === 'sketch')   // GM-W2 2.2：草图态整条时间轴灰化锁定（回放/改参会喺开住嘅草图下面重建特徵树 → 状态错乱）
  const features = useApp((s) => s.features)
  const selected = useApp((s) => s.selectedFeature)
  const selectFeature = useApp((s) => s.selectFeature)
  const editFeature = useApp((s) => s.editFeature)
  const removeFeature = useApp((s) => s.removeFeature)
  const suppressedIds = useApp((s) => s.suppressedIds)
  const multiSel = useApp((s) => s.selectedFeatures)   // P2 audit：Ctrl+点多选高亮
  const failedFeatureIds = useApp((s) => s.failedFeatureIds)  // S107 逐特徵隔离：坏特徵标红
  const featureErrors = useApp((s) => s.featureErrors)
  const toggleSuppress = useApp((s) => s.toggleSuppress)
  const moveFeature = useApp((s) => s.moveFeature)
  const timelinePos = useApp((s) => s.timelinePos)
  const commandEditing = useApp(s => !!s.featDlg || s.extrudeDlgOpen || !!s.edgeRoundPick || s.shellMode || s.pushPullMode || s.mode === 'sketch')
  const editId = useApp((s) => s.featDlg?.kind === 'extrude-edit' ? s.featDlg.editId : undefined)
  const editIndex = editId ? features.findIndex(f => f.id === editId) : -1
  const gotoStep = useApp((s) => s.gotoStep)
  // GM-X4 #9/#10：齿轮设定（隐藏抑制 / 色板）+ 在瀏覽器中查找 + owning component 色板来源。
  const hideInactive = useApp((s) => s.timelineHideInactive)
  const colorSwatch = useApp((s) => s.timelineColorSwatch)
  const editingComponent = useApp((s) => s.editingComponent)
  const components = useApp((s) => s.components)
  const ownerColor = editingComponent ? (components.find((c) => c.id === editingComponent)?.color ?? null) : null   // 编辑組件情境 → 全特徵属该組件 → 用其色；否则按特徵类型 hash
  // GM-X4 #6：chip 右键上下文菜单 + 齿轮弹层（本地 UI 态）。
  const [chipMenu, setChipMenu] = useState<{ x: number; y: number; id: string; i: number } | null>(null)
  const [gearOpen, setGearOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const featureEditorDrag = useDraggable('webcad-feature-editor', { left: 12, bottom: 96 })
  const panelDrag = useDraggable('webcad-timeline', { right: 0, bottom: 0 })
  useEscapeLayer(!!chipMenu || gearOpen, () => { if (chipMenu) setChipMenu(null); else setGearOpen(false) }, 200)
  // GM-L2 #96：播放重入锁 —— 连撳两下唔会开两条并发 play() 互抢 timelinePos；播放中按钮 disable。
  const [isPlaying, setIsPlaying] = useState(false)
  const playingRef = useRef(false)
  const play = async () => {
    if (playingRef.current) return
    playingRef.current = true; setIsPlaying(true)
    try { const total = useApp.getState().features.length; const start = timelinePos >= total ? 0 : timelinePos; for (let i = start; i <= total; i++) { await gotoStep(i); await new Promise((r) => setTimeout(r, 320)) } }
    finally { playingRef.current = false; setIsPlaying(false) }
  }
  const params = useApp((s) => s.params)
  const paramBindings = useApp((s) => s.paramBindings)
  const status = useApp((s) => s.status)
  const bindParam = useApp((s) => s.bindParam)
  const pSelect = (key: string) => params.length === 0 ? null : (
    <select className="fe-param" title={tStatus('绑定到用户參數（ƒx）', lang)} value={paramBindings[`${sel!.id}:${key}`] || ''} onChange={(e) => void bindParam(sel!.id, key, e.target.value)}>
      <option value="">ƒx</option>
      {params.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
    </select>
  )

  const sel = features.find((f) => f.id === selected)
  const meta = sel ? (META[sel.type] || null) : null   // 未知类型 → null（下游已处理 null = 唔显示参数编辑器），唔 crash
  // BUG-UI-002: Esc closes the timeline feature dimension editor (topmost), before selection-clear cascade.
  useEscapeLayer(!!sel && !!meta && !commandEditing, () => selectFeature(null), 180)

  // Drag-scrub: pointer down on the 4px marker → window listeners (element identity changes as the
  // marker moves between chips, so capture on the element itself would drop mid-drag). gotoStep is a
  // full worker rebuild, so coalesce: one in flight, remember only the latest target, issue it after.
  const trackRef = useRef<HTMLDivElement>(null)
  const scrubBusy = useRef(false)
  const scrubPending = useRef(-1)
  const dragCleanup = useRef<(() => void) | null>(null)
  const scrubTo = (idx: number) => {
    // busy first: while a rebuild is in flight timelinePos still holds the OLD value, so the
    // equality short-circuit would silently drop a drag back to the starting chip (and leave a
    // stale pending target queued). Record pending unconditionally while busy.
    if (scrubBusy.current) { scrubPending.current = idx; return }
    if (idx === useApp.getState().timelinePos) return
    scrubBusy.current = true
    void useApp.getState().gotoStep(idx).then(() => {
      scrubBusy.current = false
      const p = scrubPending.current
      scrubPending.current = -1
      if (p >= 0 && p !== useApp.getState().timelinePos) scrubTo(p)
    })
  }
  const beginScrub = (e: RPointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const mv = (ev: PointerEvent) => {
      const track = trackRef.current
      if (!track) return
      // GM-X4 #9：读 data-fi + 可见性（hideInactive 隐藏 chip 亦稳健）→ 命中最右可见 chip 的 fi+1。
      const chips = Array.from(track.querySelectorAll<HTMLElement>('.tl-chip')).map((c) => { const r = c.getBoundingClientRect(); return { fi: Number(c.dataset.fi), center: r.left + r.width / 2, visible: r.width > 0 } })
      scrubTo(computeScrubIndex(chips, ev.clientX))
    }
    // pointercancel (touch/pen interruption) never fires pointerup — tear down on both.
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); dragCleanup.current = null }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    dragCleanup.current = up
  }
  useEffect(() => () => dragCleanup.current?.(), [])
  const marker = <span className="tl-marker" title={tStatus('历史标记 — 左右拖动回放/前進重建历史', lang)} onPointerDown={beginScrub} />

  return (
    <div ref={panelDrag.ref} className={'timeline' + (collapsed ? ' tl-collapsed' : '')} data-testid="timeline" data-feature-count={features.length} data-timeline-position={timelinePos} style={{ ...panelDrag.style, ...(inSketch ? { opacity: 0.4, pointerEvents: 'none', filter: 'grayscale(0.7)' } : {}) }} title={inSketch ? tStatus('草圖模式中 — 完成草圖后恢復時間軸操作', lang) : undefined}>
      <div className={'tl-panel-head' + (collapsed ? ' tl-panel-head-collapsed' : '')} onPointerDown={panelDrag.onPointerDown} title="拖曳移動時間軸">
        <span aria-hidden="true">⠿</span><span>時間軸</span>
        {features.length > 0 && <span className="tl-panel-count">{timelinePos}/{features.length}</span>}
      </div>
      <button className="tl-panel-toggle" type="button" title={collapsed ? '展開時間軸' : '收合時間軸'} onClick={() => setCollapsed((v) => !v)}>{collapsed ? '⌃' : '⌄'}</button>
      {panelDrag.isDragged && <button className="tl-panel-toggle" type="button" title="還原時間軸預設位置" onClick={panelDrag.reset}>↺</button>}
      {!collapsed && <div className="tl-controls">
        <button className="tb-btn" title={tStatus('跳到開頭（空白）', lang)} disabled={features.length === 0} onClick={() => void gotoStep(0)}><ToolIcon name="undo" size={16} /></button>
        <button className="tb-btn" title={tStatus('上一步（回退一個特徵）', lang)} disabled={timelinePos <= 0} onClick={() => void gotoStep(timelinePos - 1)}>◂</button>
        <button className="tb-btn" title={tStatus('从头播放重建过程', lang)} disabled={features.length === 0 || isPlaying} onClick={() => void play()}>▷</button>
        <button className="tb-btn" title={tStatus('下一步（前進一個特徵）', lang)} disabled={timelinePos >= features.length} onClick={() => void gotoStep(timelinePos + 1)}>▸</button>
        <button className="tb-btn" title={tStatus('跳到結尾（最新）', lang)} disabled={features.length === 0} onClick={() => void gotoStep(features.length)}><ToolIcon name="redo" size={16} /></button>
        {features.length > 0 && <span className="tl-pos" style={{ fontSize: 11, color: timelinePos < features.length ? '#d6694e' : '#7a838c', marginLeft: 6, whiteSpace: 'nowrap' }}>{timelinePos}/{features.length}</span>}
        {/* GM-X4 #9：时间轴齿轮设定 */}
        <div style={{ position: 'relative', marginLeft: 4 }}>
          <button className={'tb-btn' + (gearOpen || hideInactive || colorSwatch ? ' tb-on' : '')} title={tStatus('時間軸設定：組件色板 / 隱藏抑制特徵', lang)} onClick={() => setGearOpen((v) => !v)}>⚙</button>
          {gearOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 118 }} onClick={() => setGearOpen(false)} />
              <div className="panel-menu" style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, zIndex: 120, minWidth: 190 }}>
                <div className="panel-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => useApp.getState().toggleTimelineColorSwatch()} title={tStatus('按 owning component 色染 chip（編輯組件情境用該組件色，否則按特徵類型穩定配色）', lang)}>
                  <input type="checkbox" readOnly checked={colorSwatch} />{tStatus('組件色板', lang)}
                </div>
                <div className="panel-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => useApp.getState().toggleTimelineHideInactive()} title={tStatus('隱藏已抑制的特徵 chip（回卷 scrub 仍穩健）', lang)}>
                  <input type="checkbox" readOnly checked={hideInactive} />{tStatus('隱藏抑制特徵', lang)}
                </div>
                <div className="panel-menu-item" style={{ opacity: 0.4, cursor: 'not-allowed', fontSize: 11 }} title={tStatus('轉直接建模（棄歷史）需內核直接編輯管線 — 架構級後置', lang)}>{tStatus('轉直接建模（後置）', lang)}</div>
              </div>
            </>
          )}
        </div>
      </div>}

      {!collapsed && <div className="tl-track" ref={trackRef}>
        {features.length === 0 ? (
          <span className="tl-hint">{tStatus(hasComponentHistory ? '組件内有原生特徵 — 雙擊左側組件，或展開 ⋯ 選擇「編輯特徵／草圖」' : '參數化時間軸 — 建模後特徵出現在這裏，點擊任意節點可改參數並自動重建', lang)}</span>
        ) : (
          <>
            {features.map((f, i) => {
              const m = META[f.type] || { icon: 'default', label: f.type, param: '', field: '', unit: '' }   // 兜底：未知/新版特徵类型唔会令时间轴 crash
              const r = f as unknown as Record<string, unknown>
              const isCut = r.operation === 'cut' || r.op === 'cut'  // extrude uses `operation`, the rest use `op`
              const label = (f as unknown as { name?: string }).name || (f.type === 'extrude' && f.operation === 'cut' ? '切割' : m.label)   // GM-W6 F2：有自订名（浏览树双击改）就显示自订名
              const threadTag = (f.type === 'othread' || f.type === 'ithread') ? ` M${f.d}×${f.pitch}${f.cosmetic ? '（cosmetic 外观）' : '（真牙）'}` : ''   // P2 Cosmetic：designation 入 tooltip
              // GM-G4b：悬停 tooltip 领头 = 类型 + 名称 + 关键参数值（前 3 个字段；选项字段显示中文标签）。纯 title 文案，唔改任何行为。
              const paramSummary = (() => {
                const fds: FieldDef[] = (m as { fields?: FieldDef[] }).fields?.length ? (m as { fields: FieldDef[] }).fields : (m.field ? [{ key: m.field, label: m.param, unit: m.unit }] : [])
                return fds.slice(0, 3).map((fd) => {
                  const v = r[fd.key]
                  if (v == null || v === '') return null
                  const disp = fd.opts ? (fd.opts.find((o) => o.value === String(v))?.label ?? String(v)) : (typeof v === 'number' ? String(+v.toFixed(2)) : String(v))
                  return `${fd.label} ${disp}${fd.opts ? '' : fd.unit}`
                }).filter(Boolean).join(' · ')
              })()
              const nameTag = label && label !== m.label ? ` 「${label}」` : ''   // 有自订名先显示
              const rolled = i >= timelinePos || (editIndex >= 0 && i > editIndex)  // rolled back: not built at the current scrub position
              const hasSketch = ((f.type === 'extrude' || f.type === 'revolve' || f.type === 'sweep' || f.type === 'sketch' || f.type === 'extgroup') && !!f.sketchId) || (f.type === 'loft' && !!f.sketchIds?.length)  // T746/T748/T753/T756：revolve/sweep/loft/独立草图都可重开；P2 audit：extgroup（多轮廓拉伸组）都有 sketchId — 原本漏咗
              // P2 Edit Feature：白名单 kind 双击重开原对话框（Fusion Edit Feature）；改轮廓入口收入对话框「✎编辑草图」
              const editDlg = EDIT_DLG_KINDS.has(f.type)
              // GM-X4 #9：色板（按 owning component 色染 chip 底缘）+ hideInactive（隐藏已抑制 chip，display:none 保 data-fi 序）
              const chipHidden = hideInactive && suppressedIds.includes(f.id)
              const swatch = colorSwatch ? chipSwatchColor(f, ownerColor) : null
              const chipStyle: CSSProperties = { ...(rolled ? { opacity: 0.4, borderStyle: 'dashed' } : {}), ...(swatch ? { borderBottom: `3px solid ${swatch}` } : {}), ...(chipHidden ? { display: 'none' } : {}) }
              return (
                <Fragment key={f.id}>
                  {i === timelinePos && marker}
                  <button
                    data-fi={i}
                    className={'tl-chip' + (f.id === selected || multiSel.includes(f.id) ? ' sel' : '') + (suppressedIds.includes(f.id) ? ' suppressed' : '') + (isCut ? ' cut' : '') + (failedFeatureIds.includes(f.id) ? ' err' : '')}
                    style={chipStyle}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); selectFeature(f.id); setChipMenu({ x: e.clientX, y: e.clientY, id: f.id, i }) }}
                    title={tStatus(`【${m.label}】${nameTag}${threadTag}${paramSummary ? ' · ' + paramSummary : ''}${isCut && f.type !== 'extrude' ? '（切割）' : ''}${rolled ? ' · 已回退到此步之前 — 點擊重建到這' : suppressedIds.includes(f.id) ? ' · 已抑制（點擊編輯/恢復）' : ' · 點擊：選中編輯（參數条喺下方；回卷用拖時間線 marker）'}${editDlg ? ' · 雙擊：編輯特徵（重開對話框）' : hasSketch ? ' · 雙擊：重開草圖編輯（改輪廓/約束 → 全樹重建）' : ''}${featureErrors[f.id] ? ' · 🔴 重建失敗：' + featureErrors[f.id] + '（請檢查參數后重試；以狀態欄的保留／重建结果为准）' : ''}`, lang)}
                    onClick={(e) => {   // detail>1 = 双击第二下（俾 onDoubleClick）。单击=只选中高亮；Ctrl/⌘+点=多选（阵列/镜像多目标）；rolled chip 点击重建到该步
                      if (e.detail > 1) return
                      if (e.ctrlKey || e.metaKey) { useApp.getState().toggleFeatureSel(f.id); return }
                      const wasSel = f.id === selected
                      selectFeature(wasSel ? null : f.id)
                      if (rolled) void gotoStep(i + 1)
                    }}
                    onDoubleClick={() => {
                      if (editDlg) { useApp.getState().openFeatDlgForEdit(f.id); return }   // 白名单优先（extrude/revolve 开对话框，对话框内有 ✎编辑草图）
                      if (hasSketch) { useApp.getState().editSketchOf(f.id); return }
                      useApp.getState().selectFeature(f.id)
                    }}
                  >
                    <ToolIcon name={m.icon} size={16} />
                  </button>
                </Fragment>
              )
            })}
            {timelinePos >= features.length && marker}
          </>
        )}
      </div>}

      {sel && meta && !commandEditing && (
        <div className="feat-editor" role="dialog" aria-label={tStatus("特徵尺寸編輯", lang)} ref={featureEditorDrag.ref} style={featureEditorDrag.style}>
          <span className="fe-title" title="拖移特徵編輯面板" onPointerDown={featureEditorDrag.onPointerDown} style={{ cursor: 'grab', touchAction: 'none' }}>⠿ <ToolIcon name={meta.icon} size={14} /> {tStatus(`編輯「${meta.label}」`, lang)}</span>
          <button type="button" aria-label="還原特徵編輯面板位置" onClick={featureEditorDrag.reset}>↺</button>
          {featureErrors[sel.id] && <div className="fe-errbar">🔴 {tStatus('此特徵重建失敗：', lang)}{featureErrors[sel.id]}<button className="fe-errsup" onClick={() => void toggleSuppress(sel.id)}>{tStatus('抑制此特徵', lang)}</button></div>}
          {sel.type === 'surfloft' && (sel as unknown as { sheet?: boolean }).sheet && (
            <div className="fe-note">{tStatus('零厚放樣曲面（無壁厚）— 真曲面件，可用「加厚」/「縫合」轉實體', lang)}</div>
          )}
          {isIllegalRejectStatus(status) && (
            <div role="alert" data-testid="timeline-illegal-alert" style={{ color: '#b42318', fontSize: 12, marginBottom: 6 }}>{status}</div>
          )}
          {meta.fields ? (
            // S181：零厚放样曲面（sheet）冇壁厚可调 → 隐藏 wall 字段
            (sel.type === 'surfloft' && (sel as unknown as { sheet?: boolean }).sheet ? meta.fields.filter((fd) => fd.key !== 'wall') : meta.fields).map((fd) => {
              const bound = paramBindings[`${sel.id}:${fd.key}`]
              const isCount = /^count/.test(fd.key) || fd.key === 'cols' || fd.key === 'rows'   // #97 数量类整数场（阵列 X/Y/Z 数量、环形/路径 count、featpattern cols/rows）— 整数 step、有下限、commit 时取整
              if (fd.key === 'totalAngle' && (sel as unknown as Record<string, unknown>).mode === 'full') return null   // 环形阵列「完整 360°」时总角度无意义 → 隐藏，免显示同几何脱节
              return (
                <label key={fd.key}>
                  {tStatus(fd.label, lang)}
                  {fd.opts ? (
                    <select
                      value={String((
                        fd.key === 'axis' && (sel.type === 'revolve' || sel.type === 'surfrevolve')
                          ? (() => {
                              const r = sel as unknown as { axis?: string; axisV?: [number, number, number] }
                              const v = r.axisV
                              if (v) {
                                const al = Math.hypot(v[0], v[1], v[2])
                                if (al > 1e-9) {
                                  const x = Math.abs(v[0]) / al, y = Math.abs(v[1]) / al, z = Math.abs(v[2]) / al
                                  if (z >= 0.999 && z >= x && z >= y) return 'Z'
                                  if (x >= 0.999 && x >= y && x >= z) return 'X'
                                  if (y >= 0.999 && y >= x && y >= z) return 'Y'
                                }
                              }
                              return r.axis ?? fd.opts[0].value
                            })()
                          : ((sel as unknown as Record<string, unknown>)[fd.key] ?? fd.opts[0].value)
                      ))}
                      onChange={(e) => editFeature(sel.id, { [fd.key]: e.target.value })}
                    >
                      {fd.opts.map((o) => <option key={o.value} value={o.value}>{tStatus(o.label, lang)}</option>)}
                    </select>
                  ) : (
                    // #31/#97：数量字段（count/countX/Y/Z、featpattern cols/rows）= 整数 step；环形/路径阵列 count 下限 2（<2 喺 worker 会变 identity 无副本），其余数量场下限 1；commit 时 Math.round 令显示==存储==worker 用值
                    <NumField
                      step={isCount ? 1 : 0.5}
                      min={fd.key === 'count' ? 2 : isCount ? 1 : POSITIVE_LENGTH_KEYS.has(fd.key) ? 1e-6 : undefined}
                      rejectDetail={fd.key === 'thickness' ? ILLEGAL_THICKNESS_DETAIL : POSITIVE_LENGTH_KEYS.has(fd.key) ? ILLEGAL_LENGTH_DETAIL : undefined}
                      disabled={!!bound}
                      value={(sel as unknown as Record<string, number>)[fd.key] ?? (fd.defKey ? (sel as unknown as Record<string, number>)[fd.defKey] : undefined) ?? 0}
                      onCommit={(n) => editFeature(sel.id, { [fd.key]: isCount ? Math.max(fd.key === 'count' ? 2 : 1, Math.round(n)) : n })}
                    />
                  )}
                  {fd.unit}
                  {!fd.opts && pSelect(fd.key)}
                </label>
              )
            })
          ) : meta.field ? (
            <label>
              {tStatus(meta.param, lang)}
              <NumField
                min={0.1}
                step={0.5}
                rejectDetail={meta.field === 'thickness' ? ILLEGAL_THICKNESS_DETAIL : ILLEGAL_LENGTH_DETAIL}
                disabled={!!paramBindings[`${sel.id}:${meta.field}`]}
                value={(sel as unknown as Record<string, number>)[meta.field]}
                onCommit={(n) => editFeature(sel.id, { [meta.field]: n })}
              />
              {meta.unit}
              {pSelect(meta.field)}
            </label>
          ) : null}
          {(((sel.type === 'extrude' || sel.type === 'revolve' || sel.type === 'sweep' || sel.type === 'sketch' || sel.type === 'extgroup') && sel.sketchId) || (sel.type === 'loft' && !!sel.sketchIds?.length)) && <button className="fe-del" style={{ color: '#1572c4', borderColor: '#9cd2ee' }} title={tStatus('重開呢个特徵嘅草圖（改輪廓/約束/路径/截面 → 完成后全樹重建）', lang)} onClick={() => useApp.getState().editSketchOf(sel.id)}>✎ {tStatus('編輯草圖', lang)}</button>}
          {sel.type === 'sheetmetal' && <button className="fe-del" style={{ color: '#1572c4', borderColor: '#9cd2ee' }} title={tStatus('＋翻边（T768 Flange）：喺钣金末端追加一段折弯（正角=同向，负角=反折）— 展開 DXF 自動包含新段嘅 K 因子余量', lang)} onClick={async () => { const v = await useApp.getState().appPrompt(tStatus('追加翻边：段长mm,折弯角°（例 20,90 = 加 20mm 段折 90°；15,-90 = 反折）', lang), '20,90'); if (v == null) return; const p = v.split(/[,，\s]+/).filter(Boolean).map(Number); if (p.some((x) => !Number.isFinite(x)) || !(p[0] > 0)) { await useApp.getState().appAlert(tStatus('格式：段长,角度（段长要 > 0）', lang)); return } void editFeature(sel.id, { segs: [...sel.segs, p[0]], angles: [...sel.angles, p[1] ?? 90] }) }}>⌐ {tStatus('＋翻边', lang)}</button>}
          {sel.type === 'extrude' && sel.sketchId && <button className="fe-del" style={{ color: '#1572c4', borderColor: '#9cd2ee' }} title={tStatus('特徵级陣列：把呢个凸台/孔组复制成網格，每个副本獨立含孔（成體陣列做唔到）。輸入 列數,X間距[,行數,Y間距]', lang)} onClick={async () => { const v = await useApp.getState().appPrompt(tStatus('特徵级陣列：列數,X間距mm[,行數,Y間距mm]\n（例 4,30 = 一排 4 个隔 30；3,30,2,25 = 3×2 網格）', lang), '3,30'); if (v == null) return; const p = v.split(/[,，\s]+/).filter(Boolean).map(Number); if (p.some((x) => !Number.isFinite(x))) { await useApp.getState().appAlert(tStatus('請只輸入數字', lang)); return } const cols = p[0], dx = p[1] || 0, rows = p[2] || 1, dy = p[3] || 0; void useApp.getState().featurePatternSketch(sel.id, cols, dx, rows, dy) }}>▦ {tStatus('陣列特徵', lang)}</button>}
          <button className="fe-del" title={tStatus('上移（更早重建）', lang)} onClick={() => void moveFeature(sel.id, -1)}>◀</button>
          <button className="fe-del" title={tStatus('下移（更晚重建）', lang)} onClick={() => void moveFeature(sel.id, 1)}>▶</button>
          <button className="fe-del" onClick={() => void toggleSuppress(sel.id)}>{suppressedIds.includes(sel.id) ? tStatus('恢復', lang) : tStatus('抑制', lang)}</button>
          <button className="fe-del" onClick={() => { removeFeature(sel.id); selectFeature(null) }}>{tStatus('刪除', lang)}</button>
          <button className="fe-close" onClick={() => selectFeature(null)}>{tStatus('关闭', lang)}</button>
        </div>
      )}

      {/* GM-X4 #6/#8/#10：时间轴 chip 右键上下文菜单（编辑/回卷/抑制/改名/移动/查找/删除）— 全部现有 store 动作 */}
      {chipMenu && (() => {
        const cf = features.find((f) => f.id === chipMenu.id)
        if (!cf) return null
        const cEditDlg = EDIT_DLG_KINDS.has(cf.type)
        const cHasSketch = ((cf.type === 'extrude' || cf.type === 'revolve' || cf.type === 'sweep' || cf.type === 'sketch' || cf.type === 'extgroup') && !!cf.sketchId) || (cf.type === 'loft' && !!cf.sketchIds?.length)
        const isSup = suppressedIds.includes(cf.id)
        const close = () => setChipMenu(null)
        const items: { label: string; glyph: string; fn: () => void; disabled?: boolean; danger?: boolean }[] = [
          { label: tStatus('編輯', lang), glyph: '✎', fn: () => { if (cEditDlg) useApp.getState().openFeatDlgForEdit(cf.id); else if (cHasSketch) useApp.getState().editSketchOf(cf.id); else selectFeature(cf.id) } },
          { label: tStatus('在此回卷', lang), glyph: '⟲', fn: () => void gotoStep(chipMenu.i) },
          { label: isSup ? tStatus('恢復', lang) : tStatus('抑制', lang), glyph: isSup ? '◉' : '⊘', fn: () => void toggleSuppress(cf.id) },
          { label: tStatus('改名', lang) + '…', glyph: 'Aa', fn: () => { void (async () => { const v = await useApp.getState().appPrompt(tStatus('特徵改名（留空 = 清除自订名）', lang), (cf as { name?: string }).name || ''); if (v != null) useApp.getState().renameFeature(cf.id, v) })() } },
          { label: tStatus('上移', lang), glyph: '◀', fn: () => void moveFeature(cf.id, -1), disabled: chipMenu.i <= 0 },
          { label: tStatus('下移', lang), glyph: '▶', fn: () => void moveFeature(cf.id, 1), disabled: chipMenu.i >= features.length - 1 },
          { label: tStatus('在瀏覽器中查找', lang), glyph: '🔍', fn: () => useApp.getState().focusFeatureInBrowser(cf.id) },
          { label: tStatus('刪除', lang), glyph: '🗑', fn: () => { removeFeature(cf.id); selectFeature(null) }, danger: true },
        ]
        const mx = Math.min(chipMenu.x, window.innerWidth - 180)
        const my = Math.max(8, Math.min(chipMenu.y, window.innerHeight - (items.length * 30 + 12)))
        return (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 130 }} onClick={close} onContextMenu={(e) => { e.preventDefault(); close() }} />
            <div style={{ position: 'fixed', left: mx, top: my, zIndex: 131, minWidth: 164, background: '#fff', border: '1px solid #c4ccd4', borderRadius: 6, boxShadow: '0 6px 24px rgba(0,0,0,.18)', padding: 4, fontSize: 13, color: '#2a2f35', userSelect: 'none' }}>
              {items.map((it, k) => (
                <div key={k} onClick={() => { if (it.disabled) return; it.fn(); close() }} style={{ padding: '6px 12px', borderRadius: 4, cursor: it.disabled ? 'default' : 'pointer', whiteSpace: 'nowrap', opacity: it.disabled ? 0.4 : 1, color: it.danger ? '#c0554d' : undefined, display: 'flex', alignItems: 'center', gap: 8 }} onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = '#eaf2fb' }} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}><span style={{ width: 16, textAlign: 'center' }}>{it.glyph}</span>{it.label}</div>
              ))}
            </div>
          </>
        )
      })()}
    </div>
  )
}
