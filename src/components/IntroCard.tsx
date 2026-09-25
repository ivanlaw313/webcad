import type { CSSProperties } from 'react'
import { useApp } from '../store'

// First-run quick-start card (shown once, gated by the `webcad_seen_intro` localStorage flag set in
// dismissIntro). Deliberately a SIMPLE card — not a step-by-step highlight tour (those are heavy + fragile).
// Re-openable any time from the Help panel's「▶ 重睇快速開始」button.
export default function IntroCard() {
  const open = useApp((s) => s.introOpen)
  const dismiss = useApp((s) => s.dismissIntro)
  const toggleHelp = useApp((s) => s.toggleHelp)
  const startTour = useApp((s) => s.startTour)   // GM-W6 E：手把手教學
  if (!open) return null
  // Keep the written steps visually separate at browser zoom / DPI scales.
  // The former 10 px rhythm let the Chinese glyph bounding boxes touch on
  // compact 720 px-high displays even though the text technically wrapped.
  const step: CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start', margin: '13px 0', lineHeight: 1.75 }
  const num: CSSProperties = { flex: '0 0 26px', height: 26, borderRadius: '50%', background: '#1565c0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }
  return (
    <div className="drawing-overlay" onClick={dismiss}>
      <div className="help-modal intro-card-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className="dw-head">👋 快速開始 — 三步整出你嘅第一個零件<span className="dw-x" onClick={dismiss}>✕</span></div>
        <div className="intro-card-body" style={{ padding: '14px 18px', fontSize: 14, color: '#222', lineHeight: 1.75 }}>
          <div style={step}><div style={num}>1</div><div><b>載入一個模板</b><br />頂欄「<b>示例</b>」下拉拣一個（底板 / 齒輪 / 法蘭 / 螺栓法蘭…）→ 撳「<b>載入</b>」，即刻出 3D 模型。<span style={{ color: '#777' }}>（最快上手，唔使由零畫。）</span></div></div>
          <div style={step}><div style={num}>2</div><div><b>改尺寸（參數化）</b><br />撳「<b>ƒx 參數</b>」改命名變量，或喺底部時間軸點一個特徵改參數 → 整個模型自動重建聯動。</div></div>
          <div style={step}><div style={num}>3</div><div><b>出圖 / 匯出</b><br />撳「<b>工程圖</b>」出三視圖 + 尺寸/孔表標註；或匯出 <b>STL / STEP / glTF</b> 攞去 3D 打印或分享。</div></div>
          <div style={{ ...step, color: '#555' }}><div style={{ ...num, background: '#5a7' }}>✎</div><div><b>想自己畫？</b><br />流程只需四步：撳「<b>建立草圖</b>」→ 喺 3D 拣一個面（高亮 <b style={{ color: '#d6694e' }}>紅 XY</b>/<b style={{ color: '#4e9e5e' }}>綠 XZ</b>/<b style={{ color: '#4e7fd6' }}>藍 YZ</b> 或實體平面）→ 畫 矩形/圓/多邊形（打數字 = 精確尺寸）→「完成草圖」→「<b>拉伸</b>」出實體。想加尺寸 / 約束？主草圖已內建：撳草圖欄「<b>尺寸</b>」(D) 點條邊打數值即驅動幾何（Esc 取消 / Ctrl+Z 撤銷）。<br /><span style={{ color: '#2e7d32' }}>👉 第一次用？撳下面「<b>🎓 手把手教學</b>」，我一步步帶你整出第一個零件。</span></div></div>
          <div style={{ marginTop: 12, padding: '8px 10px', background: '#f3f6fb', borderRadius: 6, color: '#555', fontSize: 13 }}>
            💡 唔識用邊個工具？撳鍵盤 <kbd>/</kbd> 或頂欄 🔍 <b>搜尋命令</b>（打「齒輪」「倒角」「匯出」即搵到）。撳 <kbd>F1</kbd> 睇完整幫助。
          </div>
        </div>
        <div className="dw-foot">
          <button className="cs-btn" onClick={() => { dismiss(); toggleHelp() }}>📖 睇完整幫助</button>
          {/* GM-W6 E：手把手教學入口（新手首選）—— dismiss 先落 seen flag + 關卡，再開教學 */}
          <button className="cs-btn" onClick={() => { dismiss(); startTour() }} style={{ background: '#2e7d32', color: '#fff', fontWeight: 700 }}>🎓 手把手教學</button>
          <button className="cs-btn" onClick={dismiss} style={{ background: '#1565c0', color: '#fff' }}>知道了，開始 →</button>
        </div>
      </div>
    </div>
  )
}
