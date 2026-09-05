// WindPoseCompare.tsx —— 风洞位姿比较浮卡（DOM，唔喺 Canvas 入面）。
//
// 显示用户用 WindObjectGizmo 摆过嘅位姿点比较：朝向 label + 迎风面积 + 相对阻力比值/Δ%，
// 畀用户睇「边个朝向阻力细」。同 WindObjectGizmo.tsx 系两个独立组件——净系透过 store 沟通，
// 唔互相 import，冇任何一方存在都唔会累另一方炒。
//
// ★★★ 型别对齐咗真实嘅 src/analysis/lbm/poseCompare.ts（唔係我自己作嘅假设形状）★★★
// 呢份任务原本要我自己发明一个「位姿纪录」形状，但起手做之前发现 src/analysis/lbm/poseCompare.ts
// 已经有一套完整、经过深思熟虑嘅 PoseCompare 状态机 + PoseReadout/PoseCompareTable/PoseCompareRow
// type（睇嗰个档案文件头：dragging 期间唔收样本、settling 要等流场重新收敛先记帐、参考行永久保留、
// noisePct/significant 分得出「差异定系涡脱落噪声」……全部我自己嗰阵谂唔到咁细）。
// 所以呢度直接 import 佢哋嘅 type（唔改果个档案，净係读），令呢个组件同真实求解器输出零转译成本。
// ⚠ 由此带出一个我推断、未经确认嘅嘢：store 果个字段名。poseCompare.ts 冇讲实 store key 叫乜，
//   我跟住 PoseCompare.readout() 呢个方法名叫佢 windPoseReadout——GM 接线要跟呢个名，或者告诉我改。
//
// ★★ 绝对 Cd/阻力唔准当真数睇 ★★（同 PoseCompare 果边嘅结论一致，唔係我重新发明）
// GPU 风洞求解器有个已实测嘅系统性增益（球体 Cd 三个分辨率都一致咁高 gainRange 倍）。净系
// 【比值】先可信。本卡将 poseCompare.ts 嘅 POSE_COMPARE_NOTE / POSE_AREA_NOTE 原文咁展示
// （佢哋文件头写明「面板必须原文显示」），唔自己改写呢两句诚实文案。
//
// 位置：left:14 bottom:210 —— 同 WindLegend.tsx 嘅 right:14 bottom:210 对称，唔打架。
// 风格：.info-card class + WindLegend 同款手动深色 chrome token（叠喺 3D 模型度要够对比，
// 唔可以自创 ad-hoc chrome——见 WindLegend.tsx 文件头注释）。
//
// i18n 取舍：poseCompare.ts 嘅 note/areaNote/reason 呢几句原生净係中文（冇 EN 版本，睇佢哋自己
// 文件头都写死中文）。跟返 store.ts setLang 自己嘅先例（"Language: English (ribbon / nav). Status
// messages still 中文 in v1."）——即係「状态类文案容许维持中文」系呢个项目已有政策，唔係我自创，
// 所以呢几句喺 EN 模式都照原文显示，唔会拆词砌做半中半英（嗰个係 tStatus() 嘅坑，本组件冇用佢）。
// UI 边个字/掣先至跟 lang 严格切 ZH/EN 显式字串对象。
//
// 资料源：store.windPoseReadout。未接线（undefined）→ 成张卡 return null，唔画 placeholder 假数。
import type { CSSProperties } from 'react'
import type { PoseCompareRow, PoseReadout } from '../analysis/lbm/poseCompare'
import { useApp } from '../store'

/* ════════════════════════════════ store 旁路（key/action 未落地都照编译、照跑） ════════════════════════════════ */
type WindPoseCompareKnobs = {
  /** PoseCompare.readout(stepCount) 嘅最新快照——driver（GPU 风洞 useFrame 果边）低频发布落嚟。 */
  windPoseReadout?: PoseReadout
  /** 立即用目前（可能未收敛）嘅样本记一笔——对应 PoseCompare.finalize(stepCount)。进阶掣，日常唔使撳。 */
  finalizeWindPose?: () => void
  /** 将某一行设为比较基准——对应 PoseCompare.setReference(id)。★ id 系 number，唔係 string ★。 */
  setWindPoseReference?: (id: number) => void
  /** 清空已记录列表——对应 PoseCompare.reset()。 */
  clearWindPoseCompare?: () => void
  /** 同 WindObjectGizmo.tsx 用嘅同一个 setter——「重置位姿」净系写 identity 落去，唔使独立 API。 */
  setWindPose?: (elements: number[]) => void
}

export interface WindPoseCompareProps {
  /** 立即记一笔（未收敛）；唔传就试 store 嘅 finalizeWindPose()，两边都冇就掣唔显示。 */
  onFinalizePose?: () => void
  /** 将某一行设为比较基准；唔传就试 store 嘅 setWindPoseReference(id)。 */
  onSetReference?: (id: number) => void
  /** 清空已记录列表；唔传就试 store 嘅 clearWindPoseCompare()。 */
  onClear?: () => void
  /** 重置操纵杆位姿返 identity；唔传就试 store 嘅 setWindPose(identity)。 */
  onResetPose?: () => void
}

const IDENTITY_16: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

const ZH = {
  title: '风洞位姿比较',
  empty: '未有已记录位姿 — 拖动测试件、放手等流场重新收敛，就会自动记一笔',
  ref: '参考', cur: '目前', finalize: '立即记录（未收敛）', setRef: '设为参考', clear: '清除', reset: '重置位姿',
  area: '迎风面积', noSetter: '未接线', notSignificant: '差异细过涡脱落噪声底，讲唔到嘢', samples: '样本',
  state: { idle: '未追踪位姿', dragging: '拖拽中…', settling: '流场重建中…' } as Record<string, string>,
}
const EN = {
  title: 'Wind pose compare',
  empty: 'No recorded poses yet — drag the test article and release; a row is added automatically once the flow re-converges',
  ref: 'Ref', cur: 'current', finalize: 'Record now (unconverged)', setRef: 'Set as reference', clear: 'Clear', reset: 'Reset pose',
  area: 'Frontal area', noSetter: 'not wired', notSignificant: 'smaller than the vortex-shedding noise floor — not meaningful', samples: 'samples',
  state: { idle: 'Not tracking a pose', dragging: 'Dragging…', settling: 'Flow re-settling…' } as Record<string, string>,
}

function fmtArea(mm2: number): string {
  return (mm2 >= 100 ? mm2.toFixed(0) : mm2.toFixed(1)) + ' mm²'
}

function btnStyle(enabled: boolean): CSSProperties {
  return {
    flex: 1, background: enabled ? '#173042' : '#12202a', border: '1px solid #2a3a46', borderRadius: 4,
    color: enabled ? '#c8d4dd' : '#5a6a75', fontSize: 10, padding: '4px 4px', cursor: enabled ? 'pointer' : 'not-allowed',
  }
}

// 一行嘅阻力 Δ% 颜色：未收敛 / 唔系参考又唔够显著 → 灰（唔抢眼，避免用户当真）；
// 正 = 阻力比参考大（暖色），负 = 细（绿色），~0 = 中性。
function rowColor(r: PoseCompareRow): string {
  if (!r.converged) return '#8fa0ad'
  if (!r.isReference && !r.significant) return '#8fa0ad'
  if (!Number.isFinite(r.dragDeltaPct)) return '#8fa0ad'
  if (r.dragDeltaPct > 0.05) return '#e0895a'
  if (r.dragDeltaPct < -0.05) return '#6fc79a'
  return '#c8d4dd'
}

export default function WindPoseCompare({ onFinalizePose, onSetReference, onClear, onResetPose }: WindPoseCompareProps) {
  const lang = useApp((s) => s.lang)
  const readout = useApp((s) => (s as unknown as WindPoseCompareKnobs).windPoseReadout)
  const finalizeAction = useApp((s) => (s as unknown as WindPoseCompareKnobs).finalizeWindPose)
  const setRefAction = useApp((s) => (s as unknown as WindPoseCompareKnobs).setWindPoseReference)
  const clearAction = useApp((s) => (s as unknown as WindPoseCompareKnobs).clearWindPoseCompare)
  const setPoseAction = useApp((s) => (s as unknown as WindPoseCompareKnobs).setWindPose)
  const t = lang === 'en' ? EN : ZH

  if (!readout) return null   // 资料源未接线——成张卡唔显示，唔画 placeholder 假数

  // 一早喺呢度 narrow 做返普通值，唔喺 JSX/closure 入面重复问 readout.trusted（避免 TS 判别式
  // union narrowing 喺 .map() callback 入面走样嘅边缘情况）。
  const untrusted = readout.trusted ? null : readout
  const trustedTable = readout.trusted ? readout.table : null
  const curEntryId = readout.trusted ? readout.entry.id : -1
  const rows: PoseCompareRow[] = trustedTable ? trustedTable.rows : []

  const doFinalize = () => (onFinalizePose ? onFinalizePose() : finalizeAction?.())
  const doSetRef = (id: number) => (onSetReference ? onSetReference(id) : setRefAction?.(id))
  const doClear = () => (onClear ? onClear() : clearAction?.())
  const doReset = () => (onResetPose ? onResetPose() : setPoseAction?.(IDENTITY_16.slice()))

  const showFinalize = untrusted?.state === 'settling'
  const canFinalize = !!(onFinalizePose || finalizeAction)
  const canSetRef = !!(onSetReference || setRefAction)
  const canReset = !!(onResetPose || setPoseAction)
  const canClear = !!(onClear || clearAction) && rows.length > 0

  return (
    <div className="info-card" style={{
      position: 'fixed', left: 14, bottom: 210, width: 236, zIndex: 16,
      padding: '9px 11px', fontSize: 11, lineHeight: 1.45,
    }}>
      <div style={{ fontWeight: 700, color: '#7fd1b9', marginBottom: 4 }}>🔄 {t.title}</div>

      {untrusted && (
        <div style={{ marginBottom: 7 }}>
          <div style={{ color: '#c8d4dd' }}>
            {t.state[untrusted.state] ?? untrusted.state}
            {untrusted.samples > 0 ? ` · ${untrusted.samples} ${t.samples}` : ''}
          </div>
          {/* reason 系 poseCompare.ts 原生中文状态文案——同 status bar 一样嘅「状态类文案维持中文」政策，见文件头注释 */}
          <div style={{ color: '#8fa0ad', fontSize: 10 }}>{untrusted.reason}</div>
          {untrusted.state === 'settling' && (
            <div style={{ height: 5, borderRadius: 3, background: '#16232c', marginTop: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round(untrusted.progress * 100)}%`, background: '#3aa0e0' }} />
            </div>
          )}
        </div>
      )}

      {trustedTable && (
        <>
          <div style={{ color: '#9fb2bf', fontSize: 10, marginBottom: 3 }}>{trustedTable.note}</div>
          <div style={{ color: '#9fb2bf', fontSize: 10, marginBottom: 6 }}>{trustedTable.areaNote}</div>

          {!rows.length && <div style={{ color: '#8fa0ad', fontSize: 10.5, marginBottom: 6 }}>{t.empty}</div>}

          {!!rows.length && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 7 }}>
              {rows.map((r, i) => {
                const isCur = r.id === curEntryId
                const dColor = rowColor(r)
                const notSig = !r.isReference && !r.significant
                return (
                  <div key={r.id} style={{ borderTop: i ? '1px solid #2a3a46' : undefined, paddingTop: i ? 4 : 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ color: '#eaf2f8', fontWeight: r.isReference ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.label}{r.isReference ? ` · ${t.ref}` : ''}{isCur && !r.isReference ? ` · ${t.cur}` : ''}
                      </span>
                      <span style={{ color: dColor, fontWeight: 600, whiteSpace: 'nowrap' }} title={notSig ? t.notSignificant : undefined}>
                        {Number.isFinite(r.dragRatio) ? `${r.dragRatio.toFixed(2)}×` : '—'}
                        {Number.isFinite(r.dragDeltaPct) ? ` (${r.dragDeltaPct > 0 ? '+' : ''}${r.dragDeltaPct.toFixed(1)}%)` : ''}
                        {!r.converged ? ' ⚠' : notSig ? ' ≈' : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#8fa0ad', fontSize: 10, marginTop: 1 }}>
                      <span>{t.area}：{fmtArea(r.areaMM2)}</span>
                      {!r.isReference && (
                        <button
                          disabled={!canSetRef}
                          title={canSetRef ? t.setRef : t.noSetter}
                          onClick={() => doSetRef(r.id)}
                          style={{
                            background: 'none', border: '1px solid #2a3a46', borderRadius: 4,
                            color: canSetRef ? '#7fb8d1' : '#5a6a75', fontSize: 9.5, padding: '1px 5px',
                            cursor: canSetRef ? 'pointer' : 'not-allowed',
                          }}
                        >{t.setRef}</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {showFinalize && (
          <button disabled={!canFinalize} title={canFinalize ? t.finalize : t.noSetter} onClick={doFinalize} style={btnStyle(canFinalize)}>
            {t.finalize}
          </button>
        )}
        <div style={{ display: 'flex', gap: 5 }}>
          <button disabled={!canReset} title={canReset ? undefined : t.noSetter} onClick={doReset} style={btnStyle(canReset)}>
            {t.reset}
          </button>
          <button disabled={!canClear} title={canClear ? t.clear : t.noSetter} onClick={doClear} style={btnStyle(canClear)}>
            {t.clear}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════ WIRING（畀 GM 睇，唔系代码）
 *
 * 1. store.ts 加（全部 optional）：
 *      windPoseReadout?: import('./analysis/lbm/poseCompare').PoseReadout
 *      finalizeWindPose?: () => void                    // → poseCompare.finalize(solver.stepCount)
 *      setWindPoseReference?: (id: number) => void       // → poseCompare.setReference(id)
 *      clearWindPoseCompare?: () => void                 // → poseCompare.reset()
 *    （setWindPose 已经喺 WindObjectGizmo.tsx 嗰边要求，呢度「重置位姿」掣直接摞嚟用，唔使加多个 action。）
 *
 * 2. ★ windPoseReadout 呢个 key 名系我推断嘅，未经确认 ★ —— poseCompare.ts 本身冇讲实 store key
 *    叫乜，我净系跟 PoseCompare.readout() 呢个方法名咁叫佢。如果 GM/W1 起咗第二个名，请喺
 *    store.ts 加个同名字段，或者告诉我改（一行嘢）。驱动逻辑（边度 new PoseCompare()、边度
 *    每帧 call notePose()/tick()/push()、边度低频发布 readout() 落 store）睇你哋边个负责
 *    WindTunnelGpu.tsx 嗰边点接（我见到嗰边已经有 applySolverPose() 呼之欲出，未接线）。
 *
 * 3. Viewport.tsx 挂载点：DOM 层（唔喺 Canvas 入面），同 <WindLegend/> 果个 JSX 兄弟位置就手
 *    （约 5391 行 `{windResult && <WindLegend/>}` 附近）。建议：
 *      {windMode === 1 && <WindPoseCompare />}
 *    唔使额外传 props——四粒掣默认走 store action（防御式，未接线会自动变灰 + tooltip「未接线」）。
 *
 * 4. 面板入口：风洞 CommandDialog 入面（约 5392 行）可以加一句提示「拖动零件可以比较唔同朝向阻力」。
 */
