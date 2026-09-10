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
  return <section aria-label={T('投影关联状态')} style={{ border: '1px solid #d7a845', background: '#fff7e5', borderRadius: 5, padding: 8, fontSize: 12 }}>
    <strong>{T('投影需要处理')} · {issues.length}</strong>
    <div style={{ margin: '5px 0', lineHeight: 1.5 }}>{T('保留了上次的曲线。可重新选择来源，或断开连结保留独立几何。')}</div>
    {repair ? <div role="group" aria-label={T('重新连结投影')} style={{ display:'flex',flexDirection:'column',gap:7 }}>
      <strong>{T('选择轮廓')} {repair.shapeIndex + 1} · {T('重新连结')}</strong>
      <label>{T('替换来源')}
        <select aria-label={T('替换来源')} value={repair.selected ?? ''} disabled={repair.busy} onChange={e => { if(e.target.value !== '') void useApp.getState().selectProjectRelinkCandidate(Number(e.target.value)) }} style={{ width:'100%',minWidth:0,height:30 }}>
          <option value="">{T('选择来源轮廓')}</option>
          {repair.candidates.map((c,i) => <option key={c.id} value={i}>{T('来源')} {i+1} · {T(c.label)}{!c.compatible ? ` · ${T('不兼容')}` : ''}</option>)}
        </select>
      </label>
      {!repair.candidates.length && <div role="status">{T('当前没有可用来源，请先修复上游模型。')}</div>}
      {candidate && original?.type === 'poly' && <>
        <CurvePreview old={original.pts} next={previewShape?.type === 'poly' ? previewShape.pts : candidate.points} oldOpen={!!original.open} nextOpen={candidate.open} />
        <div>{T(candidate.label)}</div>
        <div>{T('紫色虚线：原曲线；蓝色实线：新来源。编号显示端点顺序。')}</div>
      </>}
      {repair.error && <div role="alert" style={{color:'#993d20',lineHeight:1.5}}>{T(repair.error)}</div>}
      {repair.busy && <div role="status">{T('正在核对约束…')}</div>}
      <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
        <button type="button" className="sb-tool" disabled={repair.busy || !repair.preview || !!repair.error} onClick={() => void useApp.getState().confirmProjectRelink()}>{T('确认重新连结')}</button>
        <button type="button" className="sb-tool" onClick={() => useApp.getState().cancelProjectRelink()}>{T('取消')}</button>
      </div>
    </div> : <>
      <div style={{ maxHeight: 160, overflowY: 'auto' }}>
        {issues.map(issue => <div key={issue.index} style={{ marginBottom: 8 }}>
          <button type="button" className="sb-tool" onClick={() => useApp.setState({ skSel: [{ kind: 'edge', shape: issue.index, idx: 0 }], sketchTool: 'select' })}>
            {T('选择轮廓')} {issue.index + 1}
          </button>
          <div>{T(projectLinkIssueText[issue.reason] ?? '关联来源需要核对')}</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:5,marginTop:4}}>
            <button type="button" className="sb-tool" aria-label={`${T('重新连结轮廓')} ${issue.index+1}`} onClick={() => useApp.getState().beginProjectRelink(issue.index)}>{T('重新连结')}</button>
            <button type="button" className="sb-tool" aria-label={`${T('断开轮廓连结')} ${issue.index+1}`} onClick={() => useApp.getState().breakProjectLink(issue.index)}>{T('断开连结')}</button>
          </div>
        </div>)}
      </div>
      <button type="button" className="sb-tool" style={{ width: '100%', whiteSpace: 'normal' }} onClick={() => useApp.getState().breakProjectLinks()}>{T('断开全部投影连结')}</button>
    </>}
  </section>
}
