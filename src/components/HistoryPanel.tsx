import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../store'
import { msg } from '../i18n'
import { deleteSnapshot, idbAvailable, listSnapshots, loadSnapshot, renameSnapshot } from '../io/versionStore'
import type { SnapshotMeta } from '../io/versionStore'

// 版本歷史面板 — 瀏覽器 IndexedDB 快照（自動保存 10 個 + 命名版本 30 個）。v1.84 BD-7301 hist.* catalog
// 自包含 modal（同 .drawing-overlay/.drawing-modal 一套）；列表/改名/刪除直接操作 versionStore，
// 「儲存目前版本」「還原」經 props 交畀 store 接线（payload 构建 / applyFeatures 重建在 store 侧）。
export default function HistoryPanel({ onClose, onRestore, onSaveNamed }: {
  onClose: () => void
  onRestore: (data: unknown) => void
  onSaveNamed: (label: string) => Promise<void>
}) {
  const [rows, setRows] = useState<SnapshotMeta[]>([])
  const [avail, setAvail] = useState<boolean | null>(null) // null = 探测中
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const lang = useApp((s) => s.lang)

  const refresh = useCallback(async () => { setRows(await listSnapshots()) }, [])
  useEffect(() => {
    void (async () => { setAvail(await idbAvailable()); await refresh() })()
  }, [refresh])

  const doSave = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onSaveNamed(name.trim() || `版本 ${fmtTime(Date.now())}`)
      setName('')
      await refresh()
    } finally { setBusy(false) }
  }

  const doRestore = async (m: SnapshotMeta) => {
    if (busy) return
    const ok = await useApp.getState().appConfirm(
      msg('hist.restoreConfirm', lang)
        .replace('{0}', m.label)
        .replace('{1}', fmtTime(m.ts)))
    if (!ok) return
    setBusy(true)
    try {
      const data = await loadSnapshot(m.id)
      if (data == null) { await useApp.getState().appAlert(msg('hist.readFail', lang)); await refresh(); return }
      onRestore(data)
      onClose()
    } finally { setBusy(false) }
  }

  const doDelete = async (m: SnapshotMeta) => {
    if (busy) return
    if (!await useApp.getState().appConfirm(msg('hist.deleteConfirm', lang).replace('{0}', m.label).replace('{1}', fmtTime(m.ts)))) return
    await deleteSnapshot(m.id)
    await refresh()
  }

  const doRename = async (id: number) => {
    const label = editText.trim()
    if (label) await renameSnapshot(id, label)
    setEditId(null)
    await refresh()
  }

  return (
    <div className="drawing-overlay" onClick={onClose}>
      <div className="drawing-modal" style={{ width: 'min(92vw, 640px)' }} onClick={(e) => e.stopPropagation()}>
        <div className="dw-head">🕘 {msg('hist.title', lang)}<span className="dw-x" onClick={onClose}>✕</span></div>

        {avail === false && (
          <div style={{ background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#7a4f01', marginBottom: 10 }}>
            {msg('hist.idbUnavailable', lang)}
          </div>
        )}

        {/* 顶行：命名 + 保存当前版本 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            value={name}
            aria-label={msg('hist.nameAria', lang)}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); void doSave() } }}
            placeholder={msg('hist.namePlaceholder', lang)}
            disabled={busy || avail === false}
            style={{ flex: 1, fontSize: 13, padding: '4px 8px', border: '1px solid #c8d0d8', borderRadius: 5 }}
          />
          <button className="cs-btn cs-finish" disabled={busy || avail === false} onClick={() => void doSave()}>
            {msg('hist.saveCurrent', lang)}
          </button>
        </div>

        {/* 快照列表（新→旧） */}
        <div style={{ maxHeight: '52vh', overflowY: 'auto', border: '1px solid #e4e8ec', borderRadius: 6 }}>
          {rows.length === 0 ? (
            <div style={{ padding: '18px 12px', fontSize: 12, color: '#8a97a3', textAlign: 'center' }}>
              {avail === false ? '—' : msg('hist.empty', lang)}
            </div>
          ) : rows.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid #eef1f4', fontSize: 12 }}>
              <span style={{ color: '#5a6b78', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtTime(m.ts)}</span>
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 8, fontWeight: 600, whiteSpace: 'nowrap',
                background: m.kind === 'auto' ? '#eceff1' : '#e3f2fd', color: m.kind === 'auto' ? '#607d8b' : '#1565c0',
              }}>{m.kind === 'auto' ? msg('hist.auto', lang) : msg('hist.named', lang)}</span>
              {editId === m.id ? (
                <>
                  <input
                    autoFocus
                    aria-label={msg('hist.renameAria', lang)}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.stopPropagation(); void doRename(m.id) }
                      if (e.key === 'Escape') { e.stopPropagation(); setEditId(null) }
                    }}
                    style={{ flex: 1, fontSize: 12, padding: '2px 6px', border: '1px solid #c8d0d8', borderRadius: 4 }}
                  />
                  <button className="cs-btn" onClick={() => void doRename(m.id)}>{msg('hist.ok', lang)}</button>
                  <button className="cs-btn" onClick={() => setEditId(null)}>{msg('hist.cancel', lang)}</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.label}>{m.label}</span>
                  <span style={{ color: '#8a97a3', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtSize(m.size)}</span>
                  <button className="cs-btn" disabled={busy} title={msg('hist.restoreTip', lang)} onClick={() => void doRestore(m)}>{msg('hist.restore', lang)}</button>
                  <button className="cs-btn" disabled={busy} title={msg('hist.renameTip', lang)} onClick={() => { setEditId(m.id); setEditText(m.label) }}>{msg('hist.rename', lang)}</button>
                  <button className="cs-btn" disabled={busy} title={msg('hist.deleteTip', lang)} onClick={() => void doDelete(m)}>{msg('hist.delete', lang)}</button>
                </>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 10, fontSize: 11, color: '#8a97a3', lineHeight: 1.6 }}>
          {msg('hist.footer', lang)}
        </div>
      </div>
    </div>
  )
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function fmtSize(n: number): string {
  return n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`
}
