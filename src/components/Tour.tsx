import { useEffect, useState, type CSSProperties } from 'react'
import { useApp, type AppState } from '../store'
import { normalizeLang, type Lang } from '../i18n'

// GM-W6 E：手把手教学引擎（step-by-step tutorial for a non-coder owner）。
// 一个浮喺右下角嘅步骤卡（对标 IntroCard 面板风格），逐步教新手行完黄金流程：
//   创建草图 → 拣面 → 画矩形 →（标尺寸，可跳）→ 拉伸 → 确定 → 倒圆角 → 导出打印。
// 自动前进：订阅 store，当前步 done(state) 由 false→true 即闪 ✅ 再 ~600ms 后跳。
// 防连跳：入到某步时若 done 已经系 true（用户乱序做咗后面），只显示「下一步」掣要人手撳，唔自动连跳。
// FISHING99：panel title / chrome i18n en/ja/zh-CN/zh-HK（JA/EN 唔再 TC 手把手教學 fallback）。
// ⚠ 唔好用 tStatus() 译【长句】—— EN 会出半中半英；改显式 zh-HK/zh-CN/en/ja 四套字串（同 IntroCard FISHING98）。

type StepDef = { anchor?: string; optional?: boolean; done: (s: AppState) => boolean }
type StepCopy = { title: string; body: string }
type TourCopy = {
  badge: (cur: number, total: number) => string
  doneOk: string
  skipTour: string
  skipStep: string
  finish: string
  next: string
  statusFinish: string
  statusSkip: string
  steps: StepCopy[]
}

// 黄金流程 8 步。anchor = data-cmd id 或 CSS 选择器（TeachPointer 会 data-cmd 优先、否则 querySelector）。
const STEP_DEFS: StepDef[] = [
  { anchor: 'sketch', done: (s) => s.mode === 'pickplane' || s.mode === 'sketch' },
  { done: (s) => s.mode === 'sketch' },
  { anchor: 'sk_rect', done: (s) => !!s.sketchShape || s.sketchProfiles.length > 0 },
  { anchor: 'sk_dim', optional: true, done: (s) => s.sketchTool === 'dimension' },
  { anchor: 'skextrude', done: (s) => s.extrudeDlgOpen },
  { done: (s) => s.mode === 'model' && s.features.some((f) => f.type === 'extrude') },
  { anchor: 'fillet', done: (s) => s.features.some((f) => f.type === 'fillet') || !!s.edgeRoundPick },
  { anchor: 'exportstl', done: () => false },
]

const ZH: TourCopy = {
  badge: (cur, total) => `🎓 第 ${cur}/${total} 步`,
  doneOk: '✅ 做到！',
  skipTour: '跳過教學',
  skipStep: '跳過此步 →',
  finish: '🎉 完成',
  next: '下一步 →',
  statusFinish: '🎓 教學完成！你已經識由零整一個 3D 零件。',
  statusSkip: '已跳過手把手教學（隨時在「幫助」面板再開）',
  steps: [
    { title: '新建草圖', body: '按上面工具欄「建立草圖」掣，開始畫你的第一個零件。' },
    { title: '選一個平面', body: '在 3D 畫面中間點任何一個基準面（紅 / 綠 / 藍），或者實體的一個平面。' },
    { title: '畫一個矩形', body: '按「矩形」，再在畫布點兩個對角，畫出一個方框。' },
    { title: '標個尺寸（可跳過）', body: '想更精確：按「尺寸」再點條邊打個數值。不想標可以按「跳過此步」。' },
    { title: '拉伸成實體', body: '按畫面下面藍色「⬆ 拉伸…」掣，把平面圖變成立體。' },
    { title: '確定拉伸', body: '在彈出的「拉伸」面板設定一個高度，按「確定」（或按 Enter 鍵）。' },
    { title: '倒個圓角', body: '按「圓角」，再點實體的稜邊，把利角磨圓滑。' },
    { title: '匯出打印', body: '完成！按「檔案 ▾ → 匯出 STL」就可以取去 3D 打印。按下面「完成」結束教學。' },
  ],
}

const EN: TourCopy = {
  badge: (cur, total) => `🎓 Step ${cur}/${total}`,
  doneOk: '✅ Done!',
  skipTour: 'Skip tour',
  skipStep: 'Skip step →',
  finish: '🎉 Finish',
  next: 'Next →',
  statusFinish: '🎓 Tour complete! You can build a 3D part from scratch.',
  statusSkip: 'Guided tour skipped (re-open anytime from Help).',
  steps: [
    { title: 'Create a sketch', body: 'Tap 「Create sketch」 on the toolbar to start your first part.' },
    { title: 'Pick a plane', body: 'In the 3D view, click any datum plane (red / green / blue), or a face on a solid.' },
    { title: 'Draw a rectangle', body: 'Tap 「Rectangle」, then click two opposite corners on the canvas.' },
    { title: 'Add a dimension (optional)', body: 'For exact size: tap 「Dimension」, click an edge, and type a value. Or tap 「Skip step」.' },
    { title: 'Extrude to a solid', body: 'Tap the blue 「⬆ Extrude…」 button below the view to turn the flat sketch into a solid.' },
    { title: 'Confirm extrude', body: 'In the Extrude panel, set a height and tap 「OK」 (or press Enter).' },
    { title: 'Add a fillet', body: 'Tap 「Fillet」, then click a solid edge to round the sharp corner.' },
    { title: 'Export for print', body: 'Done! Use 「File ▾ → Export STL」 for 3D printing. Tap 「Finish」 below to end the tour.' },
  ],
}

const JA: TourCopy = {
  badge: (cur, total) => `🎓 ステップ ${cur}/${total}`,
  doneOk: '✅ できた！',
  skipTour: 'ツアーをスキップ',
  skipStep: 'このステップをスキップ →',
  finish: '🎉 完了',
  next: '次へ →',
  statusFinish: '🎓 ツアー完了！ゼロから 3D 部品を作れるようになりました。',
  statusSkip: 'ガイドツアーをスキップしました（ヘルプからいつでも再開可）',
  steps: [
    { title: 'スケッチを作成', body: '上部ツールバーの「スケッチ作成」を押し、最初の部品を描き始めます。' },
    { title: '平面を選ぶ', body: '3D 画面で基準面（赤 / 緑 / 青）か、ソリッドの平面をクリック。' },
    { title: '矩形を描く', body: '「矩形」を押し、キャンバスで対角の 2 点をクリックして四角を描きます。' },
    { title: '寸法を付ける（任意）', body: '正確にしたいとき：「寸法」→ 辺をクリックして数値入力。不要なら「このステップをスキップ」。' },
    { title: '押し出して立体に', body: '画面下の青い「⬆ 押し出し…」で平面図を立体にします。' },
    { title: '押し出しを確定', body: '「押し出し」パネルで高さを設定し「OK」（または Enter）。' },
    { title: 'フィレットを付ける', body: '「フィレット」→ ソリッドの稜をクリックして角を丸めます。' },
    { title: '印刷用に書き出し', body: '完了！「ファイル ▾ → STL 書き出し」で 3D 印刷へ。下の「完了」でツアー終了。' },
  ],
}

const ZH_CN: TourCopy = {
  badge: (cur, total) => `🎓 第 ${cur}/${total} 步`,
  doneOk: '✅ 做到！',
  skipTour: '跳过教学',
  skipStep: '跳过此步 →',
  finish: '🎉 完成',
  next: '下一步 →',
  statusFinish: '🎓 教学完成！你已经会从零做一个 3D 零件。',
  statusSkip: '已跳过手把手教学（随时在「帮助」面板再开）',
  steps: [
    { title: '新建草图', body: '按上面工具栏「建立草图」按钮，开始画你的第一个零件。' },
    { title: '选一个平面', body: '在 3D 画面中间点任何一个基准面（红 / 绿 / 蓝），或者实体的一个平面。' },
    { title: '画一个矩形', body: '按「矩形」，再在画布点两个对角，画出一个方框。' },
    { title: '标个尺寸（可跳过）', body: '想更精确：按「尺寸」再点条边打个数值。不想标可以按「跳过此步」。' },
    { title: '拉伸成实体', body: '按画面下面蓝色「⬆ 拉伸…」按钮，把平面图变成立体。' },
    { title: '确定拉伸', body: '在弹出的「拉伸」面板设定一个高度，按「确定」（或按 Enter 键）。' },
    { title: '倒个圆角', body: '按「圆角」，再点实体的棱边，把利角磨圆滑。' },
    { title: '导出打印', body: '完成！按「文件 ▾ → 导出 STL」就可以拿去 3D 打印。按下面「完成」结束教学。' },
  ],
}

function pickTour(lang: Lang | string | undefined): TourCopy {
  const L = normalizeLang(lang)
  return L === 'en' ? EN : L === 'ja' ? JA : L === 'zh-CN' ? ZH_CN : ZH
}

// TeachPointer 借呢个攞当前步嘅锚点 + 标题（做 sticky 高亮），避免 STEPS 重复定义。
export function tourAnchor(step: number): { anchor?: string; label: string } | null {
  const def = STEP_DEFS[step]
  if (!def) return null
  const t = pickTour(useApp.getState().lang)
  const copy = t.steps[step]
  return { anchor: def.anchor, label: copy?.title ?? '' }
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
  const lang = useApp((s) => s.lang)
  const t = pickTour(lang)
  const [uiDone, setUiDone] = useState(false)   // 当前步系咪已满足（显示 ✅ + 下一步）

  useEffect(() => {
    if (!tour) { setUiDone(false); return }
    const st = STEP_DEFS[tour.step]
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
            const cur = useApp.getState().tour
            if (cur && cur.step === tour.step) useApp.getState().advanceTour()   // 仍停喺同一步先跳
          }, 600)
        }
      }
    })
    return () => unsub()
  }, [tour])

  if (!tour) return null
  const st = STEP_DEFS[tour.step]
  const copy = t.steps[tour.step]
  if (!st || !copy) return null
  const isLast = tour.step === STEP_DEFS.length - 1
  const finish = () => { useApp.setState({ status: t.statusFinish }); end() }
  const skipAll = () => { useApp.setState({ status: t.statusSkip }); end() }
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={badgeStyle}>{t.badge(tour.step + 1, STEP_DEFS.length)}</span>
        {uiDone && !isLast && <span style={{ color: '#16a36b', fontWeight: 700, fontSize: 12 }}>{t.doneOk}</span>}
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, color: '#1a2b3a', marginBottom: 4 }}>{copy.title}</div>
      <div style={{ fontSize: 12.5, color: '#3a4650', lineHeight: 1.5, marginBottom: 10 }}>{copy.body}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button className="cs-btn" onClick={skipAll}>{t.skipTour}</button>
        {st.optional && !isLast && <button className="cs-btn" onClick={() => advance()}>{t.skipStep}</button>}
        {isLast ? (
          <button className="cs-btn" style={primaryBtn} onClick={finish}>{t.finish}</button>
        ) : uiDone ? (
          <button className="cs-btn" style={primaryBtn} onClick={() => advance()}>{t.next}</button>
        ) : null}
      </div>
    </div>
  )
}
