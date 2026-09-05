import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../store'
import { deleteSnapshot, idbAvailable, listSnapshots, loadSnapshot, renameSnapshot } from '../io/versionStore'
import type { SnapshotMeta } from '../io/versionStore'

// 版本历史面板 — 浏览器 IndexedDB 快照（自动保存 10 个 + 命名版本 30 个）。
// 自包含 modal（同 .drawing-overlay/.drawing-modal 一套）；列表/改名/删除直接操作 versionStore，
// 「保存当前版本」「还原」经 props 交畀 store 接线（payload 构建 / applyFeatures 重建在 store 侧）。
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
      `确定还原「${m.label}」（${fmtTime(m.ts)}）？\n\n` +
      '当前模型会被该版本完全替换，未保存的修改会丢失（此还原不可撤销）。\n' +
      '不确定的话，先点「💾 保存当前版本」再还原。')
    if (!ok) return
    setBusy(true)
    try {
      const data = await loadSnapshot(m.id)
      if (data == null) { await useApp.getState().appAlert('读取失败：该版本数据不存在或已损坏。'); await refresh(); return }
      onRestore(data)
      onClose()
    } finally { setBusy(false) }
  }

  const doDelete = async (m: SnapshotMeta) => {
    if (busy) return
    if (!await useApp.getState().appConfirm(`删除「${m.label}」（${fmtTime(m.ts)}）？删除后无法找回。`)) return
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
        <div className="dw-head">🕘 版本历史<span className="dw-x" onClick={onClose}>✕</span></div>

        {avail === false && (
          <div style={{ background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#7a4f01', marginBottom: 10 }}>
            ⚠️ 此浏览器无法使用 IndexedDB（可能是私隐/无痕模式）——版本历史不可用。
            「文件 ▾ → 保存」下载 .json 不受影响，请用它备份。
          </div>
        )}

        {/* 顶行：命名 + 保存当前版本 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            value={name}
            aria-label="版本名称"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); void doSave() } }}
            placeholder="版本名称（例：加完散热孔）— 留空自动用时间命名"
            disabled={busy || avail === false}
            style={{ flex: 1, fontSize: 13, padding: '4px 8px', border: '1px solid #c8d0d8', borderRadius: 5 }}
          />
          <button className="cs-btn cs-finish" disabled={busy || avail === false} onClick={() => void doSave()}>
            💾 保存当前版本
          </button>
        </div>

        {/* 快照列表（新→旧） */}
        <div style={{ maxHeight: '52vh', overflowY: 'auto', border: '1px solid #e4e8ec', borderRadius: 6 }}>
          {rows.length === 0 ? (
            <div style={{ padding: '18px 12px', fontSize: 12, color: '#8a97a3', textAlign: 'center' }}>
              {avail === false ? '—' : '暂无历史版本。改动模型后会自动记录快照（保留最近 10 个）；点上面「💾 保存当前版本」可长期保留（最多 30 个）。'}
            </div>
          ) : rows.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid #eef1f4', fontSize: 12 }}>
              <span style={{ color: '#5a6b78', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtTime(m.ts)}</span>
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 8, fontWeight: 600, whiteSpace: 'nowrap',
                background: m.kind === 'auto' ? '#eceff1' : '#e3f2fd', color: m.kind === 'auto' ? '#607d8b' : '#1565c0',
              }}>{m.kind === 'auto' ? '自动' : '命名'}</span>
              {editId === m.id ? (
                <>
                  <input
                    autoFocus
                    aria-label="重命名版本"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.stopPropagation(); void doRename(m.id) }
                      if (e.key === 'Escape') { e.stopPropagation(); setEditId(null) }
                    }}
                    style={{ flex: 1, fontSize: 12, padding: '2px 6px', border: '1px solid #c8d0d8', borderRadius: 4 }}
                  />
                  <button className="cs-btn" onClick={() => void doRename(m.id)}>确定</button>
                  <button className="cs-btn" onClick={() => setEditId(null)}>取消</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.label}>{m.label}</span>
                  <span style={{ color: '#8a97a3', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtSize(m.size)}</span>
                  <button className="cs-btn" disabled={busy} title="用此版本替换当前模型（会先确认）" onClick={() => void doRestore(m)}>还原</button>
                  <button className="cs-btn" disabled={busy} title="重命名此版本" onClick={() => { setEditId(m.id); setEditText(m.label) }}>改名</button>
                  <button className="cs-btn" disabled={busy} title="删除此版本" onClick={() => void doDelete(m)}>删除</button>
                </>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 10, fontSize: 11, color: '#8a97a3', lineHeight: 1.6 }}>
          保留最近 <b>10 个自动</b> + <b>30 个命名</b> 快照，存在浏览器 IndexedDB（清浏览器数据会一并清除）。
          重要项目请同时用「文件 ▾ → 保存」下载 .json 备份。
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
