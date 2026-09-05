// T803（报告 P1）：React Error Boundary — 核心面板（Viewport/Ribbon/各 Panel）一旦抛错,
// 唔会令成棵树 unmount 白屏；改为喺该面板位显示「出错 — 重试」卡片,撳重试即重挂载该子树。
// 对一个会跑大量边界情况几何运算嘅 CAD 尤其重要（之前完全冇 boundary）。
import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { name: string; children: ReactNode; compact?: boolean }
type State = { err: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null }
  static getDerivedStateFromError(err: Error): State { return { err } }
  componentDidCatch(err: Error, info: ErrorInfo) {
    // 唔上报第三方（纯本地隐私）；落 console 方便用户/开发睇堆栈。
    console.error(`[webcad] ${this.props.name} 出错:`, err, info.componentStack)
  }
  render() {
    if (this.state.err) {
      const reset = () => this.setState({ err: null })
      return (
        <div role="alert" style={{
          padding: this.props.compact ? '8px 12px' : 20, margin: 8, border: '1px solid #e0a0a0', borderRadius: 8,
          background: '#fff6f6', color: '#8a2a2a', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start',
        }}>
          <b>⚠ 「{this.props.name}」面板出错</b>
          <span style={{ fontSize: 12, color: '#a05050', fontFamily: 'monospace', maxWidth: 480, wordBreak: 'break-word' }}>{this.state.err.message || String(this.state.err)}</span>
          <span style={{ fontSize: 12, color: '#7a6060' }}>其余功能仍可用。撳「重试」重新加载呢个面板,或「刷新页面」整体复位（你嘅模型有自动存档,唔会丢）。</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button onClick={reset} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #c47', background: '#fff', cursor: 'pointer' }}>重试 Retry</button>
            <button onClick={() => location.reload()} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>刷新页面</button>
          </span>
        </div>
      )
    }
    return this.props.children
  }
}
