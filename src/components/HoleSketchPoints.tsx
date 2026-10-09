// BUG（Hole-1）：「從草圖點批量建立」— 已完成草圖都揀得（多過一個含草圖點嘅草圖時出下拉揀）。
import { useMemo, useState } from 'react'
import { useApp } from '../store'
import { finishedSketchPointCandidates } from '../sketch/holePoints'

export function HoleSketchPointsButton() {
  const sketchSources = useApp((s) => s.sketchSources)
  const features = useApp((s) => s.features)
  const mode = useApp((s) => s.mode)
  const cands = useMemo(() => finishedSketchPointCandidates({ sketchSources, features } as never), [sketchSources, features])
  const [sel, setSel] = useState('')
  const pick = cands.find((c) => c.id === sel) ?? cands[cands.length - 1]
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <button className="cs-btn" style={{ flex: 1 }} data-testid="hole-from-sketch-points"
        title="按草圖點批量打孔：在草圖以「點」工具放 N 個點（進行中或已完成的 XY 草圖都得），一次建立 N 個孔。"
        onClick={() => void useApp.getState().addHolesAtSketchPoints(mode === 'sketch' ? undefined : pick?.id)}>
        ⊙ 從草圖點批量建立{pick && mode !== 'sketch' ? `（${pick.pts.length}）` : ''}
      </button>
      {cands.length > 1 && (
        <select aria-label="草圖點來源" data-testid="hole-sketch-points-src" value={pick?.id ?? ''} onChange={(e) => setSel(e.target.value)}>
          {cands.map((c) => <option key={c.id} value={c.id}>{c.name}（{c.pts.length} 點）</option>)}
        </select>
      )}
    </div>
  )
}
