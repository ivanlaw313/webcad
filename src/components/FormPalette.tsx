import { useState, type ReactNode } from 'react'
import { useDraggable } from './useDraggable'

/** Form create/edit floating panel. Optional footer stays pinned (BUG-BD-1901 Finish Form). */
export function FormPalette({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const drag = useDraggable('webcad-form-palette-v1', { top: 8, right: 8 })
  return (
    <section
      ref={drag.ref}
      role="region"
      aria-label={title}
      style={{
        position: 'absolute',
        ...drag.style,
        width: 320,
        maxWidth: 'calc(100% - 16px)',
        maxHeight: 'calc(100% - 84px)',
        display: 'flex',
        flexDirection: 'column',
        background: '#f8fafb',
        color: '#364b5c',
        border: '1px solid #8cb5d0',
        borderRadius: 7,
        zIndex: 85,
        boxSizing: 'border-box',
        boxShadow: '0 3px 12px #0002',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, flexShrink: 0, borderBottom: '1px solid #ccdbe5' }}>
        <span onPointerDown={drag.onPointerDown} style={{ flex: 1, cursor: 'move', touchAction: 'none', fontWeight: 600 }}>{title}</span>
        <button onClick={drag.reset} title="重设 Form 面板位置">↺</button>
        <button aria-label="收起或展开 Form 面板" aria-expanded={!collapsed} onClick={() => setCollapsed((c) => !c)}>{collapsed ? '▸' : '▾'}</button>
      </header>
      {!collapsed && (
        <>
          <div
            style={{
              display: (title === 'Create Form' || title === '创建造型') ? 'block' : 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              padding: 10,
              minHeight: 0,
              flex: '1 1 auto',
              overflow: 'auto',
              overflowWrap: 'anywhere',
              fontSize: 12,
            }}
          >
            {children}
          </div>
          {footer != null && (
            <div
              data-testid="form-palette-footer"
              style={{
                flexShrink: 0,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                padding: '8px 10px',
                borderTop: '1px solid #ccdbe5',
                background: '#f8fafb',
              }}
            >
              {footer}
            </div>
          )}
        </>
      )}
    </section>
  )
}
