import { useApp, type Pt } from '../store'
import { projectLinkIssueText } from '../sketch/projectLinks'
import { tStatus } from '../i18n'
import { useEscapeLayer } from './useEscapeLayer'

function CurvePreview({ old, next, oldOpen, nextOpen }: { old: Pt[]; next: Pt[]; oldOpen: boolean; nextOpen: boolean }) {
  const points = [...old, ...next].filter(p => p.every(Number.isFinite))
  if (!points.length) return null
  const xs = points.map(p => p[0]), ys = points.map(p => p[1])
  const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(1, Math.max(...xs) - x), h = Math.max(1, Math.max(...ys) - y)
  const margin = Math.max(w, h) * .12
  const path = (pts: Pt[], open: boolean) => pts.length ? `M ${pts.map(p => p.join(' ')).join(' L ')}${open ? '' : ' Z'}` : ''
  return <svg role="img" aria-label="Projection replacement preview" viewBox={`${x-margin} ${y-margin} ${w+2*margin} ${h+2*margin}`} style={{ display: 'block', width: '100%', height: 110, background: '#fff', border: '1px solid #b5c9dc', borderRadius: 4 }}>
    <path d={path(old, oldOpen)} fill="none" stroke="#946bbb" strokeWidth={2} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
    <path d={path(next, nextOpen)} fill="none" stroke="#087d9a" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    {next.map((p,i) => <text key={i} x={p[0]} y={p[1]} fontSize={Math.max(w,h)*.065} fill="#07566c">{i+1}</text>)}
  </svg>
}

export default function ProjectionLinkStatus() {
  const profiles = useApp(s => s.sketchProfiles)
  const current = useApp(s => s.sketchShape)
  const lang = useApp(s => s.lang)
  const repair = useApp(s => s.projectRelink)
  useEscapeLayer(!!repair, () => useApp.getState().cancelProjectRelink(), 240)
  const shapes = [...profiles, ...(current ? [current] : [])]
  const issues = shapes.flatMap((shape, index) =>
    shape.type === 'poly' && shape.projectLink && shape.projectLinkIssue ? [{ index, reason: shape.projectLinkIssue }] : [])
  if (!issues.length && !repair) return null
  const T = (text: string) => tStatus(text, lang)
  const original = repair ? shapes[repair.shapeIndex] : null
  const candidate = repair?.selected != null ? repair.candidates[repair.selected] : null
  const previewShape = repair?.preview?.[repair.shapeIndex]
  return <section aria-label={T('投影關聯狀態')} style={{ border: '1px solid #d7a845', background: '#fff7e5', borderRadius: 5, padding: 8, fontSize: 12 }}>
    <strong>{T('投影需要處理')} · {issues.length}</strong>
    <div style={{ margin: '5px 0', lineHeight: 1.5 }}>{T('保留了上次的曲線。可重新選擇來源，或斷開連結保留獨立幾何。')}</div>
    {repair ? <div role="group" aria-label={T('重新連結投影')} style={{ display:'flex',flexDirection:'column',gap:7 }}>
      <strong>{T('選擇輪廓')} {repair.shapeIndex + 1} · {T('重新連結')}</strong>
      <label>{T('替換來源')}
        <select aria-label={T('替換來源')} value={repair.selected ?? ''} disabled={repair.busy} onChange={e => { if(e.target.value !== '') void useApp.getState().selectProjectRelinkCandidate(Number(e.target.value)) }} style={{ width:'100%',minWidth:0,height:30 }}>
          <option value="">{T('選擇來源輪廓')}</option>
          {repair.candidates.map((c,i) => <option key={c.id} value={i}>{T('來源')} {i+1} · {T(c.label)}{!c.compatible ? ` · ${T('不相容')}` : ''}</option>)}
        </select>
      </label>
      {!repair.candidates.length && <div role="status">{T('當前沒有可用來源，請先修復上游模型。')}</div>}
      {candidate && original?.type === 'poly' && <>
        <CurvePreview old={original.pts} next={previewShape?.type === 'poly' ? previewShape.pts : candidate.points} oldOpen={!!original.open} nextOpen={candidate.open} />
        <div>{T(candidate.label)}</div>
        <div>{T('紫色虛線：原曲線；藍色實線：新來源。編號顯示端點順序。')}</div>
      </>}
      {repair.error && <div role="alert" style={{color:'#993d20',lineHeight:1.5}}>{T(repair.error)}</div>}
      {repair.busy && <div role="status">{T('正在核對約束…')}</div>}
      <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
        <button type="button" className="sb-tool" disabled={repair.busy || !repair.preview || !!repair.error} onClick={() => void useApp.getState().confirmProjectRelink()}>{T('確認重新連結')}</button>
        <button type="button" className="sb-tool" onClick={() => useApp.getState().cancelProjectRelink()}>{T('取消')}</button>
      </div>
    </div> : <>
      <div style={{ maxHeight: 160, overflowY: 'auto' }}>
        {issues.map(issue => <div key={issue.index} style={{ marginBottom: 8 }}>
          <button type="button" className="sb-tool" onClick={() => useApp.setState({ skSel: [{ kind: 'edge', shape: issue.index, idx: 0 }], sketchTool: 'select' })}>
            {T('選擇輪廓')} {issue.index + 1}
          </button>
          <div>{T(projectLinkIssueText[issue.reason] ?? '關聯來源需要核對')}</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:5,marginTop:4}}>
            <button type="button" className="sb-tool" aria-label={`${T('重新連結輪廓')} ${issue.index+1}`} onClick={() => useApp.getState().beginProjectRelink(issue.index)}>{T('重新連結')}</button>
            <button type="button" className="sb-tool" aria-label={`${T('斷開輪廓連結')} ${issue.index+1}`} onClick={() => useApp.getState().breakProjectLink(issue.index)}>{T('斷開連結')}</button>
          </div>
        </div>)}
      </div>
      <button type="button" className="sb-tool" style={{ width: '100%', whiteSpace: 'normal' }} onClick={() => useApp.getState().breakProjectLinks()}>{T('斷開全部投影連結')}</button>
    </>}
  </section>
}
