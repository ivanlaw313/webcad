// 放樣對話框：截面清單（次序 = 放樣次序，可 ↑↓ 排、✕ 移除）、加截面（揀已完成草圖 / 揀實體平面）、
// 導軌（可選）同即時內核預覽狀態（預覽 = 確定後嘅結果，同一段內核碼）。
import type { CSSProperties } from 'react'
import { useApp } from '../store'
import { tStatus } from '../i18n'
import { stripWarnMark } from '../ui/featureStatus'   // 放樣預覽：單一 ⚠ 前綴（唔再「⚠ ⚠」）
import { loftEffectiveOrder, loftSectionLabel } from '../cad/loftSections'

const btn: CSSProperties = { border: '1px solid #c7d0d8', background: '#f7f9fb', borderRadius: 4, padding: '0 5px', height: 20, lineHeight: '18px', fontSize: 11, cursor: 'pointer' }

export function LoftSectionList() {
  const lang = useApp((s) => s.lang)
  const sections = useApp((s) => s.loftSections)
  const srcs = useApp((s) => s.loftSecSrcs)
  const manual = useApp((s) => s.loftOrderManual)
  const editId = useApp((s) => s.loftEditId)
  const facePick = useApp((s) => s.loftFacePick)
  const features = useApp((s) => s.features)
  const sketchSources = useApp((s) => s.sketchSources)
  const bodyTris = useApp((s) => s.bodyMesh?.triangles?.length ?? 0)
  const rail = useApp((s) => s.loftRail)
  const pv = useApp((s) => s.loftPreview)
  const busy = useApp((s) => s.loftPreviewBusy)
  const st = useApp.getState
  const ord = loftEffectiveOrder(sections, manual)
  const aligned = srcs.length === sections.length
  const usedSk = new Set(srcs.map((x) => x.skId).filter(Boolean) as string[])
  // 可加做截面嘅已完成草圖（有閉合實線輪廓、未加入）
  const cands: { skId: string; label: string }[] = []
  const railCands: { skId: string; label: string }[] = []
  for (const f of features) {
    if (f.type !== 'sketch' || !f.sketchId) continue
    const src = sketchSources[f.sketchId]
    if (!src) continue
    const label = src.name || f.sketchId.replace('sk', '草圖')
    const where = src.arb ? '斜參考面' : `${src.plane} @ ${+src.baseZ.toFixed(2)}`
    if (!usedSk.has(f.sketchId) && src.shapes.some((sh) => !sh.construction && !(sh.type === 'poly' && sh.open))) cands.push({ skId: f.sketchId, label: `${label}（${where}）` })
    if (!src.arb && src.plane === 'XY' && src.shapes.some((sh) => sh.type === 'poly' && sh.open && sh.pts.length >= 2)) railCands.push({ skId: f.sketchId, label })
  }
  const railBad = !!rail && rail.length !== sections.length
  return (
    <>
      <div style={{ color: '#6b7680', display: 'flex', justifyContent: 'space-between' }}>
        <span>{tStatus('截面', lang)}（{sections.length}）</span>
        <span style={{ fontSize: 11 }}>{tStatus(manual ? '按清單次序放樣' : '按位置次序放樣', lang)}</span>
      </div>
      <div data-testid="loft-section-list" style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 132, overflowY: 'auto' }}>
        {ord.map((k, i) => (
          <div key={'ls' + k + '_' + i} data-testid="loft-section-row" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, background: '#f4f7fa', borderRadius: 4, padding: '2px 4px' }}>
            <span style={{ color: '#1aa0ff', fontWeight: 700, width: 14 }}>{i + 1}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={loftSectionLabel(sections[k], aligned ? srcs[k] : null)}>{tStatus(loftSectionLabel(sections[k], aligned ? srcs[k] : null), lang)}</span>
            {<>
              <button style={btn} disabled={i === 0} title={tStatus('向前移（改放樣次序）', lang)} onClick={() => st().moveLoftSection(i, -1)}>↑</button>
              <button style={btn} disabled={i === ord.length - 1} title={tStatus('向後移（改放樣次序）', lang)} onClick={() => st().moveLoftSection(i, 1)}>↓</button>
              <button style={{ ...btn, color: '#c0392b' }} title={tStatus('移除此截面', lang)} onClick={() => st().removeLoftSection(i)}>✕</button>
            </>}
          </div>
        ))}
        {sections.length === 0 && <span className="sel-chip empty">{tStatus('未有截面 — 在下面選草圖或平面', lang)}</span>}
      </div>
      {editId && <div style={{ fontSize: 11, color: '#8a97a2' }}>{tStatus('編輯現有放樣：可加／排／移除截面；要改截面形狀請在時間軸重開對應草圖', lang)}</div>}
      {<div style={{ display: 'flex', gap: 4 }}>
            <select data-testid="loft-add-sketch" value="" onChange={(e) => { if (e.target.value) st().addLoftSectionFromSketch(e.target.value) }} style={{ flex: 1, height: 24, minWidth: 0 }} disabled={!cands.length} title={tStatus('加一個已完成草圖的閉合輪廓做截面', lang)}>
              <option value="">{tStatus(cands.length ? `＋ 加草圖截面（${cands.length} 個可用）` : '＋ 沒有其他可用草圖', lang)}</option>
              {cands.map((c) => <option key={c.skId} value={c.skId}>{c.label}</option>)}
            </select>
            <button className={'sb-tool' + (facePick ? ' active' : '')} data-testid="loft-pick-face" disabled={!bodyTris} style={{ height: 24 }} title={tStatus(bodyTris ? '選實體上的平面做截面（它的外框）' : '未有實體可以選平面', lang)} onClick={() => st().setLoftFacePick(!facePick)}>{tStatus('＋ 選平面', lang)}</button>
          </div>}
      <label data-testid="loft-rail-row" title={tStatus('導軌（可選）：一條連接各截面的折線，每個截面一點（點數 = 截面數）。放樣時每個截面會水平平移去掂導軌點，截面形狀不變。導軌要在 XY（水平）草圖畫。', lang)}>
        <span style={{ color: '#6b7680' }}>{tStatus('導軌', lang)}</span>
        {rail
          ? <span className="sel-chip" data-testid="loft-rail-chip" style={railBad ? { borderColor: '#e0a030', color: '#9a6a00' } : undefined}>{tStatus(railBad ? `⚠ ${rail.length} 點 ≠ ${sections.length} 截面` : `已選（${rail.length} 點）`, lang)}<span className="sel-chip-x" onClick={() => st().clearLoftRail()}>✕</span></span>
          : sections.length >= 2 && railCands.length
            ? <select data-testid="loft-rail-sketch" value="" onChange={(e) => { if (e.target.value) st().setLoftRailFromSketch(e.target.value) }} style={{ height: 24, maxWidth: 160 }}>
                <option value="">{tStatus('可選：選導軌草圖', lang)}</option>
                {railCands.map((c) => <option key={c.skId} value={c.skId}>{c.label}</option>)}
              </select>
            : <span className="sel-chip empty" data-testid="loft-rail-empty">{tStatus(sections.length < 2
              ? '請先加入至少兩個截面，方可選用導軌'
              : '尚無可選導軌：請在 XY 平面草圖繪製連接各截面的開放折線（點數＝截面數）', lang)}</span>}
      </label>
      <div data-testid="loft-preview-status" role="status" aria-live="polite" style={{ fontSize: 11, color: pv?.error ? '#c0392b' : '#6b7680', lineHeight: 1.35 }}>
        {sections.length < 2
          ? tStatus('放樣要 ≥2 個截面', lang)
          : busy ? tStatus('正在計算預覽…', lang)
          : pv?.error ? `⚠ ${tStatus(stripWarnMark(pv.error), lang)}`
          : pv?.mesh ? <>{tStatus('即時預覽（同確定後結果一樣）', lang)}{pv.volume != null ? ` · ${tStatus('體積', lang)} ${pv.volume >= 1000 ? (pv.volume / 1000).toFixed(1) + ' cm³' : pv.volume.toFixed(0) + ' mm³'}` : ''}{pv.warnings.length ? <div style={{ color: '#9a6a00' }}>{'⚠ ' + [...new Set(pv.warnings.map((w) => stripWarnMark(w)).filter(Boolean))].map((w) => tStatus(w, lang)).join('；')}</div> : null}</>
          : ''}
      </div>
    </>
  )
}
