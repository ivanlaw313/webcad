import { useEffect, useState, type CSSProperties } from 'react'
import { useApp, type AppState } from '../store'

// GM-W6 E：手把手教学引擎（step-by-step tutorial for a non-coder owner）。
// 一个浮喺右下角嘅步骤卡（对标 IntroCard 面板风格），逐步教新手行完黄金流程：
//   创建草图 → 拣面 → 画矩形 →（标尺寸，可跳）→ 拉伸 → 确定 → 倒圆角 → 导出打印。
// 自动前进：订阅 store，当前步 done(state) 由 false→true 即闪 ✅ 再 ~600ms 后跳。
// 防连跳：入到某步时若 done 已经系 true（用户乱序做咗后面），只显示「下一步」掣要人手撳，唔自动连跳。
type Step = { title: string; body: string; anchor?: string; optional?: boolean; done: (s: AppState) => boolean }

// 黄金流程 8 步。anchor = data-cmd id 或 CSS 选择器（TeachPointer 会 data-cmd 优先、否则 querySelector）。
const STEPS: Step[] = [
  { title: '新建草图', body: '撳上面工具栏「创建草图」掣，开始画你嘅第一个零件。', anchor: 'sketch', done: (s) => s.mode === 'pickplane' || s.mode === 'sketch' },
  { title: '拣一个平面', body: '喺 3D 画面中间点任何一个基准面（红 / 绿 / 蓝），或者实体嘅一个平面。', done: (s) => s.mode === 'sketch' },
  { title: '画一个矩形', body: '撳「矩形」，再喺画布点两个对角，画出一个方框。', anchor: 'sk_rect', done: (s) => !!s.sketchShape || s.sketchProfiles.length > 0 },
  { title: '标个尺寸（可跳过）', body: '想更精确：撳「尺寸」再点条边打个数值。唔想标可以撳「跳过呢步」。', anchor: 'sk_dim', optional: true, done: (s) => s.sketchTool === 'dimension' },
  { title: '拉伸成实体', body: '撳画面下面蓝色「⬆ 拉伸…」掣，把平面图变成立体。', anchor: 'skextrude', done: (s) => s.extrudeDlgOpen },
  { title: '确定拉伸', body: '喺弹出嘅「拉伸」面板设个高度，撳「确定」（或撳 Enter 键）。', done: (s) => s.mode === 'model' && s.features.some((f) => f.type === 'extrude') },
  { title: '倒个圆角', body: '撳「圆角」，再点实体嘅棱边，把利角磨圆滑。', anchor: 'fillet', done: (s) => s.features.some((f) => f.type === 'fillet') || !!s.edgeRoundPick },
  { title: '导出打印', body: '搞掂！撳「文件 ▾ → 导出 STL」就可以攞去 3D 打印。撳下面「完成」结束教学。', anchor: 'exportstl', done: () => false },
]

// TeachPointer 借呢个攞当前步嘅锚点 + 标题（做 sticky 高亮），避免 STEPS 重复定义。
export function tourAnchor(step: number): { anchor?: string; label: string } | null {
  const st = STEPS[step]
  if (!st) return null
  return { anchor: st.anchor, label: st.title }
}

const cardStyle: CSSProperties = {
  position: 'fixed', right: 16, bottom: 130, width: 300, zIndex: 24000,
  background: '#fff', border: '1px solid #d6dde5', borderRadius: 10,
  boxShadow: '0 8px 30px rgba(0,0,0,0.22)', padding: '12px 14px',
}
const badgeStyle: CSSProperties = { background: '#1565c0', color: '#fff', fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 11 }
const primaryBtn: CSSProperties = { background: '#1565c0', color: '#fff', borderColor: '#1565c0', fontWeight: 600 }

export default function Tour() {
  const tour = useApp((s) => s.tour)
  const advance = useApp((s) => s.advanceTour)
  const end = useApp((s) => s.endTour)
  const [uiDone, setUiDone] = useState(false)   // 当前步系咪已满足（显示 ✅ + 下一步）

  useEffect(() => {
    if (!tour) { setUiDone(false); return }
    const st = STEPS[tour.step]
    if (!st) { setUiDone(false); return }
    const initiallyDone = st.done(useApp.getState())
    setUiDone(initiallyDone)
    let scheduled = false
    // 只评估【当前步】嘅 done；每次 state 变最多自动前进一步（防连跳级联）。
    const unsub = useApp.subscribe((s) => {
      if (scheduled) return
      if (st.done(s)) {
        setUiDone(true)
        if (!initiallyDone) {   // 入步时未 done、之后先变 true = 用户真系做咗 → 自动跳
          scheduled = true
          window.setTimeout(() => {
            const t = useApp.getState().tour
            if (t && t.step === tour.step) useApp.getState().advanceTour()   // 仍停喺同一步先跳
          }, 600)
        }
      }
    })
    return () => unsub()
  }, [tour])

  if (!tour) return null
  const st = STEPS[tour.step]
  if (!st) return null
  const isLast = tour.step === STEPS.length - 1
  const finish = () => { useApp.setState({ status: '🎓 教学完成！你已经识由零整一个 3D 零件。' }); end() }
  const skipAll = () => { useApp.setState({ status: '已跳过手把手教学（随时喺「帮助」面板再开）' }); end() }
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={badgeStyle}>🎓 第 {tour.step + 1}/{STEPS.length} 步</span>
        {uiDone && !isLast && <span style={{ color: '#16a36b', fontWeight: 700, fontSize: 12 }}>✅ 做到喇！</span>}
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, color: '#1a2b3a', marginBottom: 4 }}>{st.title}</div>
      <div style={{ fontSize: 12.5, color: '#3a4650', lineHeight: 1.5, marginBottom: 10 }}>{st.body}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button className="cs-btn" onClick={skipAll}>跳过教学</button>
        {st.optional && !isLast && <button className="cs-btn" onClick={() => advance()}>跳过呢步 →</button>}
        {isLast ? (
          <button className="cs-btn" style={primaryBtn} onClick={finish}>🎉 完成</button>
        ) : uiDone ? (
          <button className="cs-btn" style={primaryBtn} onClick={() => advance()}>下一步 →</button>
        ) : null}
      </div>
    </div>
  )
}
