import { useApp } from '../store'

// Fusion-style command palette for the canvas-pick portion of Joint Origin.
// Keeping this separate from JointsPanel means it is available before a joint
// exists, exactly when the user is choosing the reference frame.
export default function JointOriginPalette() {
  const active = useApp((s) => s.jointOriginPickMode)
  const mode = useApp((s) => s.jointOriginMode)
  const first = useApp((s) => s.jointOriginFirst)
  if (!active) return null

  const begin = (next: 'simple' | 'twoFaces' | 'twoEdges') => useApp.getState().startJointOriginPick(next)
  return (
    <div className="cmd-palette" style={{ position: 'fixed', right: 14, top: 132, width: 268, zIndex: 120 }}>
      <div className="cmd-palette-head">
        <b>關節原點</b>
        <button className="cs-x" title="取消關節原點命令" onClick={() => useApp.getState().cancelJointOriginPick()}>×</button>
      </div>
      <div className="cmd-palette-body" style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 5 }}>
          <button className={'cs-btn' + (mode === 'simple' ? ' on' : '')} style={{ flex: 1 }} onClick={() => begin('simple')}>簡單</button>
          <button className={'cs-btn' + (mode === 'twoFaces' ? ' on' : '')} style={{ flex: 1 }} onClick={() => begin('twoFaces')}>兩面之間</button>
          <button className={'cs-btn' + (mode === 'twoEdges' ? ' on' : '')} style={{ flex: 1 }} onClick={() => begin('twoEdges')}>兩邊交點</button>
        </div>
        <div style={{ color: '#53616b', fontSize: 12, lineHeight: 1.45 }}>
          {mode === 'twoFaces'
            ? (first ? '已選第一面。請在畫布揀選第二個平面或圓柱面。' : '請在畫布揀選第一個平面或圓柱面。')
            : mode === 'twoEdges'
              ? (first ? '已選第一條邊。請揀選第二條相交直邊。' : '請在活動實體揀選第一條直邊。')
              : '請在畫布揀選面心、圓柱孔心或頂點。'}
        </div>
        <div style={{ color: '#8a939c', fontSize: 11 }}>建立後可在瀏覽器「關節原點」資料夾引用或刪除。</div>
      </div>
    </div>
  )
}
