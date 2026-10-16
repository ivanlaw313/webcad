// Aero Design Lab / 氣動設計實驗室 — brief → design space → optimisation (worker) → candidates →
// preview / insert as CAD body / wind tunnel / CFD hand-off. Lazy-loaded from App.
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties } from 'react'
import { useApp } from '../store'
import type { Feature } from '../worker/cad.worker'
import { closeAeroLab, useAeroUi } from '../aero/aeroUiStore'
import { at, metricLabel, varLabel } from '../aero/aeroI18n'
import { templateOf } from '../aero/templates'
import type { AeroKind, DesignSpec } from '../aero/designSpace'
import type { AeroProgress, AeroRunResult, Candidate } from '../aero/optimize/runner'
import { runAero, cancelAero, buildAeroCad, disposeAeroWorkers } from '../aero/aeroClient'
import { specFromBrief } from '../aero/brief'
import { designMesh, meshToStl } from '../aero/geometry'
import AeroCfdPanel from './AeroCfdPanel'
import AeroAutoLoop from './AeroAutoLoop'
import { useAutoLoop } from '../aero/autoLoopStore'
import { runAccurateWind, type AccurateWind } from '../aero/windBridge'
import { ParetoChart, ConvergenceChart } from './AeroLabCharts'

// FISHING89: F86/F88 pattern — stale/404 AeroLabPreview chunk must not crash reading 'default'.
function aeroLabPreviewLazySafe(loader: () => Promise<{ default?: ComponentType<any> }>) {
  return lazy(async () => {
    try {
      const m = await loader()
      const C = m.default
      if (typeof C === 'function') return { default: C }
    } catch { /* chunk 404 / network */ }
    return { default: function AeroLabPreviewChunkFallback() { return null } }
  })
}
const AeroLabPreview = aeroLabPreviewLazySafe(() => import('./AeroLabPreview'))

const KEY_METRICS: Record<AeroKind, string[]> = {
  prop: ['eff', 'thrust', 'power', 'noise', 'tipMach'],
  wing: ['LD', 'CL', 'alpha', 'e', 'mass'],
  shell: ['drag', 'CD', 'volumeL', 'fineness', 'mass'],
}

const fmt = (v: number | undefined): string => {
  if (v === undefined || !Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  if (a >= 1e5 || (a > 0 && a < 1e-3)) return v.toExponential(2)
  if (a >= 100) return v.toFixed(0)
  if (a >= 10) return v.toFixed(1)
  return v.toFixed(3)
}

function download(data: BlobPart, name: string, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

let _aeroSeq = 0
const aeroFid = () => 'F' + (1_000_000_000 + (Date.now() % 900_000_000) + (++_aeroSeq))

const box: CSSProperties = { border: '1px solid var(--border)', borderRadius: 6, padding: 8, marginTop: 8 }
const btn: CSSProperties = { padding: '4px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', cursor: 'pointer', fontSize: 12 }
const btnPri: CSSProperties = { ...btn, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)', fontWeight: 700 }
const inp: CSSProperties = { width: 64, fontSize: 12, padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--panel)', color: 'var(--text)' }
const th: CSSProperties = { textAlign: 'left', fontWeight: 600, padding: '2px 4px', color: 'var(--text-dim)', fontSize: 11, whiteSpace: 'nowrap' }
const td: CSSProperties = { padding: '2px 4px', fontSize: 12, whiteSpace: 'nowrap' }

export default function AeroLab() {
  const lang = useApp((s) => s.lang)
  const t = (k: string) => at(lang, k)
  // after a reload with a persisted auto-design loop, show that loop's design space
  const [spec, setSpec] = useState<DesignSpec>(() => useAutoLoop.getState().state?.spec ?? templateOf('prop'))
  const [brief, setBrief] = useState('')
  const [briefNote, setBriefNote] = useState('')
  const [thinking, setThinking] = useState(false)
  const [budget, setBudget] = useState(1200)
  const [seed, setSeed] = useState(42)
  const [running, setRunning] = useState(false)
  const [prog, setProg] = useState<AeroProgress | null>(null)
  const [hist, setHist] = useState<{ evals: number; best: number[] }[]>([])
  const [result, setResult] = useState<AeroRunResult | null>(null)
  const [sel, setSel] = useState<number>(0)
  const [showPreview, setShowPreview] = useState(false)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [lbm, setLbm] = useState<Record<number, AccurateWind | string>>({})
  const runId = useRef(0)

  useEffect(() => () => disposeAeroWorkers(), [])

  // design space pushed from outside (AI Copilot aero_open_lab / aero_start_auto_design)
  const specReq = useAeroUi((s) => s.specReq)
  useEffect(() => { useAeroUi.setState({ labSpec: spec }) }, [spec])   // lets the Copilot read the current design space
  useEffect(() => {
    if (!specReq) return
    runId.current++; cancelAero(); setRunning(false)
    setSpec(specReq.spec); setBrief(specReq.brief); setBriefNote(''); resetRun()
  }, [specReq?.nonce])   // eslint-disable-line react-hooks/exhaustive-deps

  const aiCfg = useApp((s) => s.aiConfig)
  const hasKey = !!aiCfg && (aiCfg.provider === 'local' || !!aiCfg.apiKey)

  const resetRun = () => { setResult(null); setProg(null); setHist([]); setSel(0); setLbm({}); setShowPreview(false); setMsg('') }
  const pickTemplate = (k: AeroKind) => { if (running) return; setSpec(templateOf(k)); setBriefNote(''); resetRun() }

  const parseBrief = async () => {
    if (!brief.trim() || running) return
    setThinking(true); setBriefNote('')
    const r = await specFromBrief(brief.trim(), hasKey ? aiCfg : null)
    setThinking(false)
    setSpec(r.spec); resetRun()
    setBriefNote(r.usedAi ? t('aiUsed') : hasKey ? `${t('aiFallback')} (${r.note})` : t('noKey'))
  }

  const run = async () => {
    if (running) return
    resetRun()
    setRunning(true)
    const my = ++runId.current
    const h: { evals: number; best: number[] }[] = []
    try {
      const r = await runAero(spec, { budget, seed, topN: 8 }, (p) => {
        if (runId.current !== my) return
        setProg(p)
        if (p.best) { h.push({ evals: p.evals, best: p.best }); setHist(h.slice()) }
      })
      if (runId.current !== my) return
      setResult(r); setHist(r.history)
      setProg((p) => (p ? { ...p, pct: 100, evals: r.evals } : p))
    } catch (e) {
      if (runId.current === my) setMsg(`${t('failed')}: ${String((e as Error)?.message || e)}`)
    } finally {
      if (runId.current === my) setRunning(false)
    }
  }
  const stop = () => { runId.current++; cancelAero(); setRunning(false) }

  const cands = result?.candidates ?? []
  const cur: Candidate | undefined = cands[sel]
  const previewMesh = useMemo(() => (showPreview && cur ? designMesh(spec, cur.x) : null), [showPreview, cur, spec])

  const insert = async (c: Pick<Candidate, 'id' | 'x'>, thenWind: boolean, sp: DesignSpec = spec) => {
    setBusy(t('building')); setMsg('')
    try {
      const { step } = await buildAeroCad(sp, c.x)
      const app = useApp.getState()
      const feats: Feature[] = [...app.features]
      if (app.bodyMesh) feats.push({ id: aeroFid(), type: 'newbody', name: `${sp.title} #${c.id}` } as Feature)
      feats.push({ id: aeroFid(), type: 'stepbody', step, op: 'new' } as Feature)
      const ok = await app.applyFeatures(feats, `🌀 ${sp.title} #${c.id} — ${t('inserted')}`, true, `${t('failed')}: STEP`)
      if (ok) {
        app.requestFit()
        setMsg(t('inserted'))
        if (thenWind && useApp.getState().windMode !== 1) useApp.getState().toggleWind()
      }
    } catch (e) {
      setMsg(`${t('failed')}: ${String((e as Error)?.message || e)}`)
    } finally { setBusy('') }
  }

  const accurate = async (c: Candidate) => {
    setLbm((m) => ({ ...m, [c.id]: '…' }))
    try {
      const r = await runAccurateWind(spec, c.x, 32, (pct) => setLbm((m) => ({ ...m, [c.id]: `${Math.round(pct)}%` })))
      setLbm((m) => ({ ...m, [c.id]: r }))
    } catch (e) {
      setLbm((m) => ({ ...m, [c.id]: `${t('failed')}: ${String((e as Error)?.message || e).slice(0, 60)}` }))
    }
  }

  // ── spec editing helpers ──
  const setFixed = (k: string, v: number | string) => { setSpec({ ...spec, fixed: { ...spec.fixed, [k]: v } }); resetRun() }
  const setVar = (i: number, field: 'min' | 'max', v: number) => {
    const vars = spec.vars.map((x, j) => (j === i ? { ...x, [field]: v } : x))
    setSpec({ ...spec, vars }); resetRun()
  }
  const setCon = (i: number, v: number) => { setSpec({ ...spec, constraints: spec.constraints.map((c, j) => (j === i ? { ...c, value: v } : c)) }); resetRun() }
  const toggleObj = (i: number) => {
    if (spec.objectives.length <= 1) return
    setSpec({ ...spec, objectives: spec.objectives.filter((_, j) => j !== i) }); resetRun()
  }

  const objLabel = (i: number) => spec.objectives[i] ? `${metricLabel(lang, spec.objectives[i].key)} (${spec.objectives[i].sense === 'max' ? '↑' : '↓'})` : ''
  const multi = spec.objectives.length >= 2
  const metricsCols = KEY_METRICS[spec.kind]
  const frameNote = spec.kind === 'prop' ? t('frameProp') : t('frameX')

  const improvement = (() => {
    if (!result?.baseline || !cur) return ''
    const o = spec.objectives[0]
    const b = result.baseline.metrics[o.key], v = cur.metrics[o.key]
    if (!Number.isFinite(b) || !Number.isFinite(v) || Math.abs(b) < 1e-12) return ''
    const pct = (v - b) / Math.abs(b) * 100
    return `${metricLabel(lang, o.key)}: ${fmt(b)} → ${fmt(v)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% ${t('improve')})`
  })()

  return (
    <div className="aero-lab" role="dialog" aria-label={t('title')}
      style={{ position: 'fixed', top: 84, right: 12, width: 'min(480px, calc(100vw - 24px))', maxHeight: 'calc(100vh - 110px)', overflowY: 'auto', overflowX: 'hidden', zIndex: 40, background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 28px rgba(0,0,0,.22)', padding: 10, fontSize: 12, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>🌀 {t('title')}</div>
        <button type="button" style={btn} onClick={() => { stop(); closeAeroLab() }} aria-label={t('close')}>✕</button>
      </div>
      <div style={{ marginTop: 6, padding: '6px 8px', borderRadius: 6, background: 'rgba(232,89,12,.08)', border: '1px solid rgba(232,89,12,.35)', fontSize: 11, lineHeight: 1.45 }}>⚠ {t('honest')}</div>

      {/* ① brief */}
      <div style={box}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('step1')}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['prop', 'wing', 'shell'] as AeroKind[]).map((k) => (
            <button key={k} type="button" data-aero-template={k} style={spec.kind === k && spec.source === 'template' ? btnPri : btn} onClick={() => pickTemplate(k)}>
              {k === 'prop' ? '🌀 ' + t('tplProp') : k === 'wing' ? '✈ ' + t('tplWing') : '🐟 ' + t('tplShell')}
            </button>
          ))}
        </div>
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={t('briefPh')} rows={2}
          style={{ width: '100%', boxSizing: 'border-box', marginTop: 6, fontSize: 12, padding: 6, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" style={btn} disabled={!brief.trim() || thinking || running} onClick={parseBrief}>{thinking ? t('thinking') : hasKey ? t('parseAi') : t('parseRule')}</button>
          {briefNote && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{briefNote}</span>}
          {!briefNote && !hasKey && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t('noKey')}</span>}
        </div>
      </div>

      {/* ② design space */}
      <div style={box}>
        <div style={{ fontWeight: 700 }}>{t('step2')} — {spec.title}</div>
        <div style={{ marginTop: 4, color: 'var(--text-dim)', fontSize: 11 }}>{t('fixed')} · {t('frame')}{frameNote}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginTop: 4 }}>
          {Object.entries(spec.fixed).filter(([k]) => !spec.vars.some((v) => v.key === k)).map(([k, v]) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>{varLabel(lang, k)}</span>
              {k === 'fluid'
                ? <select value={String(v)} onChange={(e) => setFixed(k, e.target.value)} style={{ ...inp, width: 70 }}><option value="air">air 空氣</option><option value="water">water 水</option></select>
                : k === 'planform'
                  ? <select value={String(v)} onChange={(e) => setFixed(k, e.target.value)} style={{ ...inp, width: 86 }}><option value="trapezoid">trapezoid</option><option value="elliptic">elliptic</option></select>
                  : <input type="number" value={Number(v)} step="any" onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) setFixed(k, n) }} style={inp} />}
            </label>
          ))}
        </div>
        <div style={{ marginTop: 6, color: 'var(--text-dim)', fontSize: 11 }}>{t('vars')}</div>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}><tbody>
          {spec.vars.map((v, i) => (
            <tr key={v.key}>
              <td style={td}>{varLabel(lang, v.key)}</td>
              <td style={td}><input type="number" step="any" value={v.min} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) setVar(i, 'min', n) }} style={inp} /></td>
              <td style={td}>→</td>
              <td style={td}><input type="number" step="any" value={v.max} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) setVar(i, 'max', n) }} style={inp} /></td>
            </tr>
          ))}
        </tbody></table>
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{t('objectives')}:</span>
          {spec.objectives.map((o, i) => (
            <span key={o.key} style={{ border: '1px solid var(--accent)', borderRadius: 10, padding: '1px 8px' }}>
              {metricLabel(lang, o.key)} · {o.sense === 'max' ? t('maximise') : t('minimise')}
              {spec.objectives.length > 1 && <button type="button" onClick={() => toggleObj(i)} style={{ border: 'none', background: 'none', color: 'var(--text-dim)', cursor: 'pointer', marginLeft: 2 }}>×</button>}
            </span>
          ))}
        </div>
        {spec.constraints.length > 0 && <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{t('constraints')}:</span>
          {spec.constraints.map((c, i) => (
            <label key={c.key + i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {metricLabel(lang, c.key)} {c.op === '>=' ? '≥' : '≤'}
              <input type="number" step="any" value={c.value} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) setCon(i, n) }} style={inp} />
            </label>
          ))}
        </div>}
      </div>

      {/* ③ optimise */}
      <div style={box}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700 }}>{t('step3')}</span>
          <label>{t('budget')} <select value={budget} onChange={(e) => setBudget(Number(e.target.value))} style={{ ...inp, width: 72 }} disabled={running}>
            {[300, 1200, 3000, 8000].map((b) => <option key={b} value={b}>{b}</option>)}
          </select></label>
          <label>{t('seed')} <input type="number" value={seed} onChange={(e) => setSeed(Math.round(Number(e.target.value)) || 0)} style={{ ...inp, width: 56 }} disabled={running} /></label>
          {running
            ? <button type="button" style={btn} onClick={stop}>{t('stop')}</button>
            : <button type="button" style={btnPri} data-aero-run onClick={run}>{t('run')}</button>}
        </div>
        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-dim)' }}>
          {t('algo')}: {multi ? 'NSGA-II' : 'CMA-ES'} · {prog ? `${t('evals')} ${prog.evals}/${prog.budget}` : t('noResults')}
          {result && ` · ${result.ms} ms`}
        </div>
        {prog && <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, marginTop: 4 }}><div style={{ width: `${prog.pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 3, transition: 'width .15s' }} /></div>}
        {prog && (multi
          ? <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t('paretoChart')}</div>
            <ParetoChart cloud={prog.cloud} front={result ? result.pareto.map((c) => c.objectives) : prog.front} xl={objLabel(0)} yl={objLabel(1)} highlight={cur ? cur.objectives : null} />
          </div>
          : <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t('convergence')}</div>
            <ConvergenceChart history={hist} yl={objLabel(0)} xl={t('evals')} />
          </div>)}
      </div>

      {/* ④ results */}
      {result && <div style={box}>
        <div style={{ fontWeight: 700 }}>{t('step4')} — {t('results')}</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 4 }}>
            <thead><tr><th style={th}>#</th>{metricsCols.map((k) => <th key={k} style={th}>{metricLabel(lang, k)}</th>)}{spec.kind !== 'prop' && <th style={th}>LBM</th>}</tr></thead>
            <tbody>
              {result.baseline && <tr style={{ color: 'var(--text-dim)' }}><td style={td}>{t('baseline')}</td>{metricsCols.map((k) => <td key={k} style={td}>{fmt(result.baseline!.metrics[k])}</td>)}{spec.kind !== 'prop' && <td style={td} />}</tr>}
              {cands.map((c, i) => {
                const l = lbm[c.id]
                return (
                  <tr key={c.id} onClick={() => setSel(i)} data-aero-cand={c.id}
                    style={{ cursor: 'pointer', background: i === sel ? 'var(--sel, rgba(6,150,215,.12))' : undefined, opacity: c.feasible ? 1 : 0.55 }}>
                    <td style={td}>{i === sel ? '▶' : ''}{c.id}{c.pareto ? ' ★' : ''}{!c.feasible ? ' ⚠' : ''}</td>
                    {metricsCols.map((k) => <td key={k} style={td}>{fmt(c.metrics[k])}</td>)}
                    {spec.kind !== 'prop' && <td style={td}>{l === undefined
                      ? <button type="button" style={{ ...btn, padding: '0 6px', fontSize: 11 }} onClick={(e) => { e.stopPropagation(); accurate(c) }} title={t('lbmNote')}>{t('accurate')}</button>
                      : typeof l === 'string' ? l : `Cd ${fmt(l.cd)} · ${fmt(l.dragN)} N`}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {cur && <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
          <div style={{ fontWeight: 600 }}>#{cur.id} {cur.feasible ? '✓ ' + t('feasible') : '⚠ ' + t('infeasible')} {improvement && <span style={{ fontWeight: 400, color: 'var(--accent)' }}> · {improvement}</span>}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', marginTop: 4, fontSize: 11 }}>
            {spec.vars.map((v) => <span key={v.key}>{varLabel(lang, v.key)}: <b>{v.int ? cur.x[v.key] : fmt(cur.x[v.key])}</b></span>)}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', marginTop: 4, fontSize: 11, color: 'var(--text-dim)' }}>
            {Object.entries(cur.metrics).filter(([k]) => !metricsCols.includes(k)).map(([k, v]) => <span key={k}>{metricLabel(lang, k)}: {fmt(v)}</span>)}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            <button type="button" style={btn} onClick={() => setShowPreview((v) => !v)}>👁 {t('preview')}</button>
            <button type="button" style={btnPri} disabled={!!busy} data-aero-insert onClick={() => insert(cur, false)}>＋ {t('insert')}</button>
            <button type="button" style={btn} disabled={!!busy} onClick={() => insert(cur, true)}>🌬 {t('wind')}</button>
            <button type="button" style={btn} onClick={() => download(meshToStl(designMesh(spec, cur.x), spec.kind), `aero-${spec.kind}-${cur.id}.stl`, 'model/stl')}>⬇ {t('stl')}</button>
          </div>
          {showPreview && previewMesh && <div style={{ marginTop: 6 }}><Suspense fallback={<div style={{ height: 220 }}>…</div>}><AeroLabPreview mesh={previewMesh} /></Suspense></div>}
        </div>}
        <AeroCfdPanel spec={spec} cands={cands} lang={lang} />
      </div>}

      {/* ⑤ closed-loop auto design (optimiser ↔ OpenFOAM) */}
      <AeroAutoLoop spec={spec} lang={lang} onInsert={(sp, x, id) => void insert({ id, x }, false, sp)} />

      {(busy || msg) && <div style={{ marginTop: 8, fontSize: 11, color: busy ? 'var(--accent)' : 'var(--text-dim)' }}>{busy || msg}</div>}
    </div>
  )
}
