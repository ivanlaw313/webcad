// WindObjectGizmo.tsx —— 风洞测试件位姿操纵杆。
//
// 用户拖呢支 drei <PivotControls> 令测试件喺风洞入面郁/转，睇唔同朝向（0° / 15° / 30° …）嘅阻力
// 点变。做法照抄 MoveBodyGizmo.tsx（CAD↔three 共轭转换）+ ComponentGumball.tsx（remount-key reseed，
// 唔跟会「操纵杆漂走」）。
//
// ⚠★ 呢个组件只画【操纵杆】，唔画测试件本身 ★
// 现有零件网格喺 Viewport.tsx 度画（呢份任务唔准掂），所以呢度净系读/写 store 嘅 windPose，
// 唔重复渲染 mesh。GM 接线嗰阵要令实际画出嚟嘅测试件几何都叠加返 windPose，否则手柄同零件
// 会睇落唔同步（详细做法见文件尾嘅 WIRING 注释）。
//
// ⚠★ 矩阵空间约定（GM 接线要跟）★
// store 嘅 windPose 系【CAD 空间】嘅 Matrix4.elements —— 16 个 number，列主序 column-major
// （three.js Matrix4.elements 原生就系咁存，直接 m.fromArray(windPose) / m.toArray() 唔使转置）。
// 约定：posedPointCad = windPoseMatrix ⋅ originalPointCad（左乘落原本未郁过嘅 CAD 几何；
// identity = 冇改过嘅原始摆位）。
// CAD 空间同 three 空间（Viewport 成个 <group rotation={[-Math.PI/2,0,0]}> 嗰个约定）差一个固定轴换：
//   three = CAD_TO_THREE ⋅ CAD，CAD_TO_THREE = RotX(-90°)，即 (x,y,z)_CAD → (x,z,-y)_three。
// 本组件内部自己做呢个共轭转换，所以要挂喺 Canvas 嘅【顶层】（同 MoveBodyGizmo/ComponentGizmo
// 一样嘅挂法），唔可以再包多一层 <group rotation={[-Math.PI/2,0,0]}>，唔系会转多一次。
//
// ⚠★ Cd 诚实条款不变 ★：呢个组件唔算唔显示任何 Cd/阻力数字，纯粹操纵位姿。
//
// ★ 已经同「求解器嗰边」核对过约定，唔係我一头热嘅假设 ★
// 起手写之前睇过 WindTunnelGpu.tsx（GpuKnobs.windPose 嘅注释）同 src/analysis/lbm/poseCompare.ts
// （POSE_IS_DELTA_FROM_BAKE 常数 + 文件头矩阵约定段）——两边讲嘅同一件事：
// 「windPose = 相对【建 solver 嗰刻烘焙落去嘅几何】嘅刚体 delta，identity = 冇郁过」，
// 同本文件呢度嘅「posedPointCad = windPoseMatrix ⋅ originalPointCad」係同一条公式（M0 = 烘焙嗰阵嘅
// 世界矩阵 ≈ 呢度嘅「原本几何」参照系）。column-major 约定都对得上。可以放心接。
import { useEffect, useMemo, useRef, useState } from 'react'
import { PivotControls } from '@react-three/drei'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { useApp, moldTargetMesh } from '../store'

/* ════════════════════════════════ store 旁路（key 未落地都照编译、照跑） ════════════════════════════════
 * 呢几个 key 由 GM 补落 store.ts。喺佢落地之前呢个档案照编译、照跑 —— 同 WindTunnelGpu.tsx 嘅
 * GpuKnobs / useKnob() 一模一样嘅防御式读法。 */
type WindPoseKnobs = {
  /** CAD 空间嘅 Matrix4.elements（16 个 number，列主序）。undefined/缺格 = 当 identity。 */
  windPose?: number[]
  /** 平移合法范围（CAD 空间，mm；由风洞域大小推）。undefined = 唔夹。 */
  windPoseBox?: { min: [number, number, number]; max: [number, number, number] }
  /** true = 拖紧（求解器靠呢个减 substep 保帧率）。 */
  windPoseDragging?: boolean
  /** 高频写：每个 onDrag 帧一次 + onDragEnd 再 commit 一次（同一个 setter，唔分裂两套 API）。 */
  setWindPose?: (elements: number[]) => void
  setWindPoseDragging?: (dragging: boolean) => void
}

const ROT_SNAP_RAD = Math.PI / 12   // 15°——「0° vs 15° vs 30°」对比嘅刚需吸附格

// Viewport 成份 <group rotation={[-Math.PI/2,0,0]}> 嘅固定轴换（CAD→three），同 MoveBodyGizmo.tsx 一致。
const CAD_TO_THREE = new Matrix4().makeRotationX(-Math.PI / 2)
const THREE_TO_CAD = CAD_TO_THREE.clone().invert()

function identity16(): number[] { return new Matrix4().toArray() }

function cadMatrixFromStore(arr: number[] | undefined): Matrix4 {
  const m = new Matrix4()
  if (arr && arr.length === 16) m.fromArray(arr)
  return m   // 缺格/长度唔啱 → identity（防御式）
}

// AABB 中心（CAD 空间）。MoveBodyGizmo.tsx 嘅 meshCentre 系私有 function 冇 export，呢度照抄一份细嘅。
function meshCentreCad(v: ArrayLike<number>): [number, number, number] {
  let xmin = Infinity, ymin = Infinity, zmin = Infinity
  let xmax = -Infinity, ymax = -Infinity, zmax = -Infinity
  for (let i = 0; i + 2 < v.length; i += 3) {
    const x = v[i], y = v[i + 1], z = v[i + 2]
    if (x < xmin) xmin = x; if (x > xmax) xmax = x
    if (y < ymin) ymin = y; if (y > ymax) ymax = y
    if (z < zmin) zmin = z; if (z > zmax) zmax = z
  }
  return Number.isFinite(xmin) ? [(xmin + xmax) / 2, (ymin + ymax) / 2, (zmin + zmax) / 2] : [0, 0, 0]
}

// 将 worldDelta 嘅旋转部分吸附到 snapRad 格，但保持佢原本嘅 pivot（anchorThree）唔郁——
// 即 T(anchor)·Rsnap·T(-anchor)，唔系咁会一吸就飘位。纯平移（冇旋转分量）原样返回。
// snapRad = null（揸住 Shift）→ 自由旋转，唔吸附。
function snapWorldDelta(worldDelta: Matrix4, anchorThree: Vector3, snapRad: number | null): Matrix4 {
  if (!snapRad) return worldDelta
  const pos = new Vector3(), quat = new Quaternion(), scale = new Vector3()
  worldDelta.decompose(pos, quat, scale)
  const w = Math.min(1, Math.max(-1, quat.w))
  const angle = 2 * Math.acos(w)
  if (angle < 1e-5) return worldDelta   // 纯平移（或者接近零嘅旋转）——冇嘢好吸
  const s = Math.sqrt(Math.max(1e-12, 1 - w * w))
  const axis = new Vector3(quat.x / s, quat.y / s, quat.z / s)
  const snappedAngle = Math.round(angle / snapRad) * snapRad
  const qSnap = new Quaternion().setFromAxisAngle(axis, snappedAngle)
  const T1 = new Matrix4().makeTranslation(anchorThree.x, anchorThree.y, anchorThree.z)
  const R = new Matrix4().makeRotationFromQuaternion(qSnap)
  const T2 = new Matrix4().makeTranslation(-anchorThree.x, -anchorThree.y, -anchorThree.z)
  return T1.multiply(R).multiply(T2)
}

// 平移夹喺 windPoseBox 之内（CAD 空间，逐轴独立夹）；box 缺格就原样返回（唔夹）。
function clampedElementsCad(m: Matrix4, box: WindPoseKnobs['windPoseBox']): number[] {
  const e = m.toArray()
  if (!box) return e
  e[12] = Math.min(Math.max(e[12], box.min[0]), box.max[0])
  e[13] = Math.min(Math.max(e[13], box.min[1]), box.max[1])
  e[14] = Math.min(Math.max(e[14], box.min[2]), box.max[2])
  return e
}

export default function WindObjectGizmo() {
  const windMode = useApp((s) => s.windMode)
  const windPose = useApp((s) => (s as unknown as WindPoseKnobs).windPose)
  const poseBox = useApp((s) => (s as unknown as WindPoseKnobs).windPoseBox)
  const bodyMesh = useApp((s) => s.bodyMesh)
  const components = useApp((s) => s.components)
  const selectedComponent = useApp((s) => s.selectedComponent)
  const joints = useApp((s) => s.joints)

  const dragRef = useRef(false)
  const shiftRef = useRef(false)
  const baseCadRef = useRef(new Matrix4())     // CAD 空间：drag 开始嗰阵嘅底
  const liveCadRef = useRef(new Matrix4())     // CAD 空间：最新一帧（onDragEnd commit 用）
  const anchorRef = useRef(new Vector3())      // three 空间：drag 开始嗰阵嘅 pivot（=seed 嘅平移）
  const warnedBoxRef = useRef(false)
  const [gen, setGen] = useState(0)            // remount key —— 每次 commit / 外部改位姿都要 bump

  // Shift = 自由旋转（跳过 15° 吸附）。用 ref 唔用 state：唔想因为撳 Shift 就成个组件 re-render。
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftRef.current = true }
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftRef.current = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // windPoseBox 未接线 → 唔夹，但 DEV console 提一次（唔可以静静鸡唔夹又唔出声）。
  useEffect(() => {
    if (!import.meta.env.DEV || warnedBoxRef.current || poseBox !== undefined) return
    warnedBoxRef.current = true
    console.warn('[WindObjectGizmo] windPoseBox 未接线 — 平移唔会夹住风洞边界（可以拖到穿风洞墙，堵塞率可能爆錶令 Cd 冇意义）。数值仍会写入 windPose。')
  }, [poseBox])

  // 外部改咗 windPose（例如 WindPoseCompare 嘅「重置位姿」掣、或者第日嘅「读档」）→ 要重新 seed；
  // 但拖紧嗰阵唔可以掉，唔系会打断緊行紧嘅 drag 手势（remount 会累 pointer capture 甩，见 ComponentGumball 注释）。
  // 呢个 effect 喺自己 onDragEnd 提交之后都会再跑一次（windPose 转咗）——幂等，reseed 去返同一个位，冇跳动。
  useEffect(() => {
    if (dragRef.current) return
    setGen((g) => g + 1)
  }, [windPose])

  // 测试件原本（未郁过）嘅 CAD 空间几何中心——旋转/平移嘅锚点。moldTargetMesh 系 store.ts 已导出嘅
  // 纯函数（同 WindTunnelGpu.tsx 揾 solver 目标网格用嗰个一样），bodyMesh 优先，冇先跌落装配组件。
  const centroidCad = useMemo<[number, number, number]>(() => {
    const tgt = moldTargetMesh({ bodyMesh, components, selectedComponent, joints })
    if (!tgt || !tgt.vertices.length) return [0, 0, 0]
    return meshCentreCad(tgt.vertices)
  }, [bodyMesh, components, selectedComponent, joints])

  // 操纵杆嘅 seed：只带平移（去到「当前位姿 posed 之后」嘅几何中心），冇烘固定旋转入去 ——
  // 保持操纵杆环永远世界轴对齐，全部旋转量走 delta 合成（同 ComponentGumball 一样嘅取舍，
  // 避免奇异/歪斜环；代价：每次 commit 之后下一次拖拽嘅旋转环由世界轴重新开始，唔追旧转向）。
  const seedThree = useMemo(() => {
    const cad = cadMatrixFromStore(windPose)
    const p = new Vector3(...centroidCad).applyMatrix4(cad).applyMatrix4(CAD_TO_THREE)
    return new Matrix4().makeTranslation(p.x, p.y, p.z)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windPose, centroidCad, gen])

  // DEV 探针：畀第日/手动喺 console 重设位姿用（唔想靠 WindPoseCompare 先有得 reset）。
  // 同 WindTunnelGpu.tsx 嘅 window.__lbmGpu 一样嘅挂法。
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __windPoseReset?: () => void }
    w.__windPoseReset = () => {
      (useApp.getState() as unknown as WindPoseKnobs).setWindPose?.(identity16())
    }
    return () => { delete (window as unknown as { __windPoseReset?: () => void }).__windPoseReset }
  }, [])

  if (windMode !== 1) return null   // 净系风洞面板开住先有意义（同 MoveBodyGizmo 嘅 visible gate 同一路数）

  const handleDragStart = () => {
    dragRef.current = true
    anchorRef.current.setFromMatrixPosition(seedThree)
    const st = useApp.getState() as unknown as WindPoseKnobs
    baseCadRef.current.copy(cadMatrixFromStore(st.windPose))
    liveCadRef.current.copy(baseCadRef.current)
    st.setWindPoseDragging?.(true)
  }

  const handleDrag = (_local: Matrix4, _localDelta: Matrix4, _world: Matrix4, worldDelta: Matrix4) => {
    const snapRad = shiftRef.current ? null : ROT_SNAP_RAD
    const snapped = snapWorldDelta(worldDelta, anchorRef.current, snapRad)
    // 共轭转换（同 MoveBodyGizmo.writeDelta 一样条数）：cadDelta = THREE_TO_CAD · worldDelta · CAD_TO_THREE
    const cadDelta = THREE_TO_CAD.clone().multiply(snapped).multiply(CAD_TO_THREE)
    const newCad = cadDelta.multiply(baseCadRef.current)   // 左乘落 drag 开始嗰阵嘅底 → 新绝对位姿
    liveCadRef.current.copy(newCad)
    const elements = clampedElementsCad(newCad, poseBox)
    // 高频写：求解器（体素化/GPU LBM）靠呢个即时跟拖拽。
    ;(useApp.getState() as unknown as WindPoseKnobs).setWindPose?.(elements)
  }

  const handleDragEnd = () => {
    const elements = clampedElementsCad(liveCadRef.current, poseBox)
    const st = useApp.getState() as unknown as WindPoseKnobs
    st.setWindPose?.(elements)          // 放手 commit 一次（同上面高频写用同一个 setter，值一样、幂等）
    st.setWindPoseDragging?.(false)
    dragRef.current = false
    setGen((g) => g + 1)                // remount → PivotControls 喺新中心重新 seed，唔会漂
  }

  return (
    <PivotControls
      key={'windpose:' + gen}
      matrix={seedThree}
      autoTransform
      disableScaling
      depthTest={false}
      lineWidth={3}
      scale={90}
      fixed={false}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
    />
  )
}

/* ════════════════════════════════════════════════════════════ WIRING（畀 GM 睇，唔系代码）
 *
 * 1. store.ts 加：
 *      windPose?: number[]                                              // CAD 空间 Matrix4.elements[16]，列主序
 *      windPoseBox?: { min:[number,number,number]; max:[number,number,number] }   // CAD 空间 mm，风洞域夹取范围
 *      windPoseDragging?: boolean
 *      setWindPose: (elements: number[]) => void
 *      setWindPoseDragging: (dragging: boolean) => void
 *    默认值：windPose 唔设（undefined=identity）；windPoseDragging: false。
 *
 * 2. 求解器（体素化/GPU LBM）喂料嗰段：voxelize 前应该攞 windPose 做 posedPointCad = windPose ⋅ originalPointCad
 *    先至 voxelize（唔系转返 CAD 原本几何 voxelize）。windPoseDragging===true 嗰阵参考 WindTunnelGpu.tsx
 *    嘅 substepBudget 减 substep 保帧率。
 *
 * 3. 实际测试件几何要跟手柄——Viewport.tsx 现有画 body/component mesh嘅 <group rotation={[-Math.PI/2,0,0]}>
 *    入面，风洞模式下加多一层 <group matrix={threeMatrixFromWindPoseCad(windPose)} matrixAutoUpdate={false}>
 *    包住个 mesh（threeMatrixFromWindPoseCad = CAD_TO_THREE·windPoseCad·CAD_TO_THREE⁻¹，即本文件 seedThree
 *    嗰条公式嘅纯旋转+平移版本，唔带 centroid 平移嗰段）。唔加呢层，操纵杆会郁但件嘢唔会跟到。
 *
 * 4. Viewport.tsx 挂载点：<Canvas> 顶层，同 <MoveBodyGizmo/> 一样嘅层级（唔可以再包
 *    <group rotation={[-Math.PI/2,0,0]}>）。建议就近 <WindStreaks/> 之后（约 4350 行）加一行：
 *      <WindObjectGizmo />{/* 风洞测试件位姿操纵杆 *}
 *    显示条件由本组件自己用 windMode===1 把关，Viewport 嗰边唔使再包 {windMode===1 && ...}。
 *
 * 5. 面板入口：风洞 CommandDialog（约 5392 行 `windModeP > 0 || windBusy || windResult` 嗰个）可以加一句
 *    提示「揸住 Shift = 自由旋转」，或者加个可见开关控制手柄显唔显示（而家默认只跟 windMode，冇独立开关）。
 */
