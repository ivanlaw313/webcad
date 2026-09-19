import type { CSSProperties } from 'react'
import { useApp } from '../store'

// First-run quick-start card (shown once, gated by the `webcad_seen_intro` localStorage flag set in
// dismissIntro). Deliberately a SIMPLE card — not a step-by-step highlight tour (those are heavy + fragile).
// Re-openable any time from the Help panel's「▶ 重睇快速开始」button.
export default function IntroCard() {
  const open = useApp((s) => s.introOpen)
  const dismiss = useApp((s) => s.dismissIntro)
  const toggleHelp = useApp((s) => s.toggleHelp)
  const startTour = useApp((s) => s.startTour)   // GM-W6 E：手把手教学
  if (!open) return null
  // Keep the written steps visually separate at browser zoom / DPI scales.
  // The former 10 px rhythm let the Chinese glyph bounding boxes touch on
  // compact 720 px-high displays even though the text technically wrapped.
  const step: CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start', margin: '13px 0', lineHeight: 1.75 }
  const num: CSSProperties = { flex: '0 0 26px', height: 26, borderRadius: '50%', background: '#1565c0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }
  return (
    <div className="drawing-overlay" onClick={dismiss}>
      <div className="help-modal intro-card-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className="dw-head">👋 快速开始 — 三步整出你嘅第一个零件<span className="dw-x" onClick={dismiss}>✕</span></div>
        <div className="intro-card-body" style={{ padding: '14px 18px', fontSize: 14, color: '#222', lineHeight: 1.75 }}>
          <div style={step}><div style={num}>1</div><div><b>载入一个模板</b><br />顶栏「<b>示例</b>」下拉拣一个（底板 / 齿轮 / 法兰 / 螺栓法兰…）→ 撳「<b>载入</b>」，即刻出 3D 模型。<span style={{ color: '#777' }}>（最快上手，唔使由零画。）</span></div></div>
          <div style={step}><div style={num}>2</div><div><b>改尺寸（参数化）</b><br />撳「<b>ƒx 参数</b>」改命名变量，或喺底部时间轴点一个特征改参数 → 整个模型自动重建联动。</div></div>
          <div style={step}><div style={num}>3</div><div><b>出图 / 导出</b><br />撳「<b>工程圖</b>」出三视图 + 尺寸/孔表标注；或导出 <b>STL / STEP / glTF</b> 攞去 3D 打印或分享。</div></div>
          <div style={{ ...step, color: '#555' }}><div style={{ ...num, background: '#5a7' }}>✎</div><div><b>想自己画？</b><br />流程只需四步：撳「<b>建立草圖</b>」→ 喺 3D 拣一个面（高亮 <b style={{ color: '#d6694e' }}>红 XY</b>/<b style={{ color: '#4e9e5e' }}>绿 XZ</b>/<b style={{ color: '#4e7fd6' }}>蓝 YZ</b> 或实体平面）→ 画 矩形/圆/多边形（打数字 = 精确尺寸）→「完成草圖」→「<b>拉伸</b>」出实体。想加尺寸 / 约束？主草图已内建：撳草圖欄「<b>尺寸</b>」(D) 点条边打数值即驱动几何（Esc 取消 / Ctrl+Z 撤销）。<br /><span style={{ color: '#2e7d32' }}>👉 第一次用？撳下面「<b>🎓 手把手教学</b>」，我一步步带你整出第一个零件。</span></div></div>
          <div style={{ marginTop: 12, padding: '8px 10px', background: '#f3f6fb', borderRadius: 6, color: '#555', fontSize: 13 }}>
            💡 唔识用边个工具？撳键盘 <kbd>/</kbd> 或顶栏 🔍 <b>搜索命令</b>（打「齿轮」「倒角」「导出」即搵到）。撳 <kbd>F1</kbd> 睇完整帮助。
          </div>
        </div>
        <div className="dw-foot">
          <button className="cs-btn" onClick={() => { dismiss(); toggleHelp() }}>📖 睇完整帮助</button>
          {/* GM-W6 E：手把手教学入口（新手首选）—— dismiss 先落 seen flag + 关卡，再开教学 */}
          <button className="cs-btn" onClick={() => { dismiss(); startTour() }} style={{ background: '#2e7d32', color: '#fff', fontWeight: 700 }}>🎓 手把手教学</button>
          <button className="cs-btn" onClick={dismiss} style={{ background: '#1565c0', color: '#fff' }}>知道了，开始 →</button>
        </div>
      </div>
    </div>
  )
}
