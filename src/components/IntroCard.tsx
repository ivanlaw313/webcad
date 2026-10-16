import type { CSSProperties } from 'react'
import { useApp } from '../store'
import { normalizeLang } from '../i18n'

// First-run quick-start card (shown once, gated by the `webcad_seen_intro` localStorage flag set in
// dismissIntro). Deliberately a SIMPLE card — not a step-by-step highlight tour (those are heavy + fragile).
// Re-openable any time from the Help panel's「▶ 重睇快速開始」button.
// ⚠ 唔好用 tStatus() 译【长句】—— EN 会出半中半英；改显式 zh-HK/zh-CN/en/ja 四套字串（同 SlicePanel FISHING97）。

const ZH = {
  title: '快速開始 — 三步整出你的第一個零件',
  step1Title: '載入一個模板',
  step1Body: <>頂欄「<b>示例</b>」下拉選一個（底板 / 齒輪 / 法蘭 / 螺栓法蘭…）→ 按「<b>載入</b>」，即刻出 3D 模型。<span style={{ color: '#777' }}>（最快上手，無需由零畫。）</span></>,
  step2Title: '改尺寸（參數化）',
  step2Body: <>按「<b>ƒx 參數</b>」改命名變量，或在底部時間軸點一個特徵改參數 → 整個模型自動重建聯動。</>,
  step3Title: '出圖 / 匯出',
  step3Body: <>按「<b>工程圖</b>」出三視圖 + 尺寸/孔表標註；或匯出 <b>STL / STEP / glTF</b> 取去 3D 打印或分享。</>,
  diyTitle: '想自己畫？',
  diyBody: <>流程只需四步：按「<b>建立草圖</b>」→ 在 3D 選一個面（高亮 <b style={{ color: '#d6694e' }}>紅 XY</b>/<b style={{ color: '#4e9e5e' }}>綠 XZ</b>/<b style={{ color: '#4e7fd6' }}>藍 YZ</b> 或實體平面）→ 畫 矩形/圓/多邊形（打數字 = 精確尺寸）→「完成草圖」→「<b>拉伸</b>」出實體。想加尺寸 / 約束？主草圖已內建：按草圖欄「<b>尺寸</b>」(D) 點條邊打數值即驅動幾何（Esc 取消 / Ctrl+Z 撤銷）。<br /><span style={{ color: '#2e7d32' }}>👉 第一次用？按下面「<b>🎓 手把手教學</b>」，我一步步帶你整出第一個零件。</span></>,
  tip: <>💡 不知道用哪個工具？按鍵盤 <kbd>/</kbd> 或頂欄 🔍 <b>搜尋命令</b>（打「齒輪」「倒角」「匯出」即找到）。按 <kbd>F1</kbd> 查看完整幫助。</>,
  helpBtn: '📖 查看完整幫助',
  tourBtn: '🎓 手把手教學',
  okBtn: '知道了，開始 →',
}
const EN = {
  title: 'Quick start — three steps to your first part',
  step1Title: 'Load a template',
  step1Body: <>Top bar 「<b>Samples</b>」→ pick one (base plate / gear / flange / bolted flange…) → <b>Load</b> for an instant 3D model.<span style={{ color: '#777' }}> (Fastest on-ramp — no drawing from scratch.)</span></>,
  step2Title: 'Change sizes (parametric)',
  step2Body: <>Open 「<b>ƒx Parameters</b>」 to edit named variables, or click a feature on the bottom timeline → the whole model rebuilds.</>,
  step3Title: 'Drawings / export',
  step3Body: <>「<b>Drawing</b>」 for 3-view + dims/hole table; or export <b>STL / STEP / glTF</b> for 3D print or sharing.</>,
  diyTitle: 'Want to draw it yourself?',
  diyBody: <>Four steps: 「<b>Create sketch</b>」→ pick a face in 3D (highlight <b style={{ color: '#d6694e' }}>red XY</b>/<b style={{ color: '#4e9e5e' }}>green XZ</b>/<b style={{ color: '#4e7fd6' }}>blue YZ</b> or a solid face) → draw rectangle/circle/polygon (type numbers = exact size) → Finish sketch → 「<b>Extrude</b>」. Need dims/constraints? Main sketch has them: sketch bar 「<b>Dimension</b>」(D) → click an edge and type (Esc cancel / Ctrl+Z undo).<br /><span style={{ color: '#2e7d32' }}>👉 First time? Tap 「<b>🎓 Guided tour</b>」 below — we walk you through your first part.</span></>,
  tip: <>💡 Not sure which tool? Press <kbd>/</kbd> or top-bar 🔍 <b>Search commands</b> (try “gear”, “fillet”, “export”). Press <kbd>F1</kbd> for full help.</>,
  helpBtn: '📖 Full help',
  tourBtn: '🎓 Guided tour',
  okBtn: 'Got it — start →',
}
const JA = {
  title: 'クイックスタート — 3 ステップで最初の部品',
  step1Title: 'テンプレートを読み込む',
  step1Body: <>上部「<b>サンプル</b>」から選ぶ（底板 / 歯車 / フランジ / ボルトフランジ…）→「<b>読込</b>」で即 3D。<span style={{ color: '#777' }}>（ゼロから描かなくてよい最短ルート。）</span></>,
  step2Title: '寸法を変える（パラメトリック）',
  step2Body: <>「<b>ƒx パラメータ</b>」で名前付き変数を編集、または下部タイムラインのフィーチャを点 → モデル全体が再構築。</>,
  step3Title: '図面 / 書き出し',
  step3Body: <>「<b>図面</b>」で三面図＋寸法/穴表、または <b>STL / STEP / glTF</b> を書き出して印刷・共有。</>,
  diyTitle: '自分で描く？',
  diyBody: <>4 ステップ：「<b>スケッチ作成</b>」→ 3D で面を選ぶ（ハイライト <b style={{ color: '#d6694e' }}>赤 XY</b>/<b style={{ color: '#4e9e5e' }}>緑 XZ</b>/<b style={{ color: '#4e7fd6' }}>青 YZ</b> またはソリッド面）→ 矩形/円/多角形（数字入力＝正確寸法）→「スケッチ完了」→「<b>押し出し</b>」。寸法/拘束は本スケッチ内蔵：ツールバー「<b>寸法</b>」(D) で辺をクリックして数値（Esc 取消 / Ctrl+Z 戻す）。<br /><span style={{ color: '#2e7d32' }}>👉 初めて？下の「<b>🎓 ガイドツアー</b>」で最初の部品まで案内します。</span></>,
  tip: <>💡 どのツール？キーボード <kbd>/</kbd> または上部 🔍 <b>コマンド検索</b>（「歯車」「フィレット」「書き出し」）。<kbd>F1</kbd> でヘルプ全文。</>,
  helpBtn: '📖 ヘルプ全文',
  tourBtn: '🎓 ガイドツアー',
  okBtn: '了解、始める →',
}
const ZH_CN = {
  title: '快速开始 — 三步做出你的第一个零件',
  step1Title: '加载一个模板',
  step1Body: <>顶栏「<b>示例</b>」下拉选一个（底板 / 齿轮 / 法兰 / 螺栓法兰…）→ 按「<b>加载</b>」，立刻出 3D 模型。<span style={{ color: '#777' }}>（最快上手，无需从零画。）</span></>,
  step2Title: '改尺寸（参数化）',
  step2Body: <>按「<b>ƒx 参数</b>」改命名变量，或在底部时间轴点一个特征改参数 → 整个模型自动重建联动。</>,
  step3Title: '出图 / 导出',
  step3Body: <>按「<b>工程图</b>」出三视图 + 尺寸/孔表标注；或导出 <b>STL / STEP / glTF</b> 拿去 3D 打印或分享。</>,
  diyTitle: '想自己画？',
  diyBody: <>流程只需四步：按「<b>建立草图</b>」→ 在 3D 选一个面（高亮 <b style={{ color: '#d6694e' }}>红 XY</b>/<b style={{ color: '#4e9e5e' }}>绿 XZ</b>/<b style={{ color: '#4e7fd6' }}>蓝 YZ</b> 或实体平面）→ 画 矩形/圆/多边形（打数字 = 精确尺寸）→「完成草图」→「<b>拉伸</b>」出实体。想加尺寸 / 约束？主草图已内建：按草图栏「<b>尺寸</b>」(D) 点条边打数值即驱动几何（Esc 取消 / Ctrl+Z 撤销）。<br /><span style={{ color: '#2e7d32' }}>👉 第一次用？按下面「<b>🎓 手把手教学</b>」，我一步步带你做出第一个零件。</span></>,
  tip: <>💡 不知道用哪个工具？按键盘 <kbd>/</kbd> 或顶栏 🔍 <b>搜索命令</b>（打「齿轮」「倒角」「导出」即找到）。按 <kbd>F1</kbd> 查看完整帮助。</>,
  helpBtn: '📖 查看完整帮助',
  tourBtn: '🎓 手把手教学',
  okBtn: '知道了，开始 →',
}

export default function IntroCard() {
  const open = useApp((s) => s.introOpen)
  const dismiss = useApp((s) => s.dismissIntro)
  const toggleHelp = useApp((s) => s.toggleHelp)
  const startTour = useApp((s) => s.startTour)   // GM-W6 E：手把手教學
  const lang = useApp((s) => s.lang)
  const L = normalizeLang(lang)
  const t = L === 'en' ? EN : L === 'ja' ? JA : L === 'zh-CN' ? ZH_CN : ZH
  if (!open) return null
  // Keep the written steps visually separate at browser zoom / DPI scales.
  // The former 10 px rhythm let the Chinese glyph bounding boxes touch on
  // compact 720 px-high displays even though the text technically wrapped.
  const step: CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start', margin: '13px 0', lineHeight: 1.75 }
  const num: CSSProperties = { flex: '0 0 26px', height: 26, borderRadius: '50%', background: '#1565c0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }
  return (
    <div className="drawing-overlay" onClick={dismiss}>
      <div className="help-modal intro-card-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className="dw-head">👋 {t.title}<span className="dw-x" onClick={dismiss}>✕</span></div>
        <div className="intro-card-body" style={{ padding: '14px 18px', fontSize: 14, color: '#222', lineHeight: 1.75 }}>
          <div style={step}><div style={num}>1</div><div><b>{t.step1Title}</b><br />{t.step1Body}</div></div>
          <div style={step}><div style={num}>2</div><div><b>{t.step2Title}</b><br />{t.step2Body}</div></div>
          <div style={step}><div style={num}>3</div><div><b>{t.step3Title}</b><br />{t.step3Body}</div></div>
          <div style={{ ...step, color: '#555' }}><div style={{ ...num, background: '#5a7' }}>✎</div><div><b>{t.diyTitle}</b><br />{t.diyBody}</div></div>
          <div style={{ marginTop: 12, padding: '8px 10px', background: '#f3f6fb', borderRadius: 6, color: '#555', fontSize: 13 }}>
            {t.tip}
          </div>
        </div>
        <div className="dw-foot">
          <button className="cs-btn" onClick={() => { dismiss(); toggleHelp() }}>{t.helpBtn}</button>
          {/* GM-W6 E：手把手教學入口（新手首選）—— dismiss 先落 seen flag + 關卡，再開教學 */}
          <button className="cs-btn" onClick={() => { dismiss(); startTour() }} style={{ background: '#2e7d32', color: '#fff', fontWeight: 700 }}>{t.tourBtn}</button>
          <button className="cs-btn" onClick={dismiss} style={{ background: '#1565c0', color: '#fff' }}>{t.okBtn}</button>
        </div>
      </div>
    </div>
  )
}
