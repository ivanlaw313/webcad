import { useApp } from '../store'   // 选中体属性卡（Fusion Inspector 风格）

// 浮动“属性 / Properties”卡片：消费并行新增的 inspectMode / inspectInfo / clearInspect。
// 仅做展示，不定义任何 store 字段（由 store.ts 并行补充）。
import { useState } from 'react'
import { useDraggable } from './useDraggable'

export default function InspectorPanel() {
  const info = useApp((s) => s.inspectInfo)
  const on = useApp((s) => s.inspectMode)
  const [collapsed, setCollapsed] = useState(false)
  const panelDrag = useDraggable('webcad-inspector-panel', { right: 12, bottom: 220, zIndex: 96 })
  if (!on || !info) return null

  // 边报告曲线中点（非质心），面报告质心 —— 标签据 isEdge 区分；S180：最小曲率半径报【最弯处】顶点位（kind 感知）。
  const centerLabel = info.kind === '最小曲率半径' ? '最弯处' : info.isEdge ? '中点' : '质心'

  if (collapsed) return (
    <button
      ref={panelDrag.ref}
      className={'joints-pill' + (panelDrag.isDragged ? ' vp-hud-dragged' : '')}
      style={panelDrag.style}
      onPointerDown={panelDrag.onPointerDown}
      onClick={() => { if (!panelDrag.consumeClick()) setCollapsed(false) }}
      title="展開檢查結果；可拖動到不遮擋視圖的位置"
    >ⓘ Inspect</button>
  )

  return (
    // GM-G4b：属性检查器浮卡 → .info-card 共用 token（与 测量/拔模/斜度/截面 同一深色卡 chrome），零逻辑改动
    <div
      className="info-card"
      ref={panelDrag.ref}
      style={{
        position: 'fixed',
        ...panelDrag.style,
        width: 230,
        padding: '12px 14px',
        zIndex: 96,
        fontSize: 13,
      }}
    >
      <div className="info-card-head" style={{ marginBottom: 6, cursor: 'grab' }} onPointerDown={panelDrag.onPointerDown} title="拖動面板；可收合，避免遮擋時間軸">
        <span role="button" className="info-card-x" title="收合" onPointerDown={(e) => e.stopPropagation()} onClick={() => setCollapsed(true)}>−</span>
        <span style={{ color: '#7fd1b9' }}>属性 / Properties</span>
        <span
          role="button"
          className="info-card-x"
          title="关闭"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => useApp.getState().clearInspect()}
        >
          ✕
        </span>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.4 }}>{info.text}</div>
      {info.center && (
        <div style={{ marginTop: 7, fontSize: 12, color: '#9fb2bf' }}>
          {centerLabel} {info.center.map((c: number) => c.toFixed(2)).join(', ')}
        </div>
      )}
    </div>
  )
}
