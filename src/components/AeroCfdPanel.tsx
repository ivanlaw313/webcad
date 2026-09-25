// Aero Design Lab — OpenFOAM verification section: service health, send top-N candidates, job list
// (stage / % / elapsed / live Cd), estimate vs CFD with ratio, per-template calibration + re-rank.
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { at } from '../aero/aeroI18n'
import type { LangInput } from '../i18n/types'
import type { DesignSpec } from '../aero/designSpace'
import type { Candidate } from '../aero/optimize/runner'
import { buildCfdCase, cfdCaseZip, getCfdUrl, setCfdUrl } from '../aero/cfdExport'
import { jobFromCase, ratio, type CfdMesh, type CfdPresetChoice, type CfdSummary, type CfdEstimate } from '../aero/cfdService'
import { useCfdJobs, checkHealth, submitCfdJob, cancelCfdJob, removeCfdJob, resetCalibration, kick, isActive, calibratedMetric, type CfdJob } from '../aero/cfdJobs'

const btn: CSSProperties = { padding: '2px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', cursor: 'pointer', fontSize: 11 }
const inp: CSSProperties = { fontSize: 11, padding: '1px 3px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--panel)', color: 'var(--text)' }
const td: CSSProperties = { padding: '1px 4px', fontSize: 11, whiteSpace: 'nowrap' }

export const fmtN = (v: number | undefined, d = 3): string => {
  if (v === undefined || !Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  if (a >= 1e4 || (a > 0 && a < 1e-3)) return v.toExponential(2)
  return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(d)
}
export const fmtElapsed = (ms: number): string => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

export function stateLabel(lang: LangInput, j: CfdJob): string {
  const t = (k: string) => at(lang, k)
  switch (j.state) {
    case 'queued': return `${t('cfdQueued')}${j.queuePosition ? ` · ${t('cfdQueuePos')}${j.queuePosition}` : ''}`
    case 'running': return `${t('cfdRunning')} · ${j.stage}`
    case 'done': return t('cfdDone')
    case 'failed': return t('cfdFailedS')
    case 'cancelled': return t('cfdCancelled')
    case 'interrupted': return t('cfdInterrupted')
    default: return t('cfdLost')
  }
}

/** Re-render once a second while any job is active (elapsed clock). */
export function useTick(active: boolean) {
  const [, set] = useState(0)
  useEffect(() => { if (!active) return; const h = setInterval(() => set((n) => n + 1), 1000); return () => clearInterval(h) }, [active])
}

/** One job row: status line + (when done) comparison table. Shared with the wind-tunnel panel. */
export function CfdJobRow({ j, lang, estLabel }: { j: CfdJob; lang: LangInput; estLabel: string }) {
  const t = (k: string) => at(lang, k)
  const active = isActive(j)
  const t0 = j.startedAt ?? j.submittedAt
  const elapsed = (j.finishedAt ?? Date.now()) - t0
  const r = j.result
  return (
    <div data-cfd-job={j.id} data-cfd-state={j.state} style={{ borderTop: '1px solid var(--border)', padding: '4px 0' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <b>{j.label}</b>
        <span style={{ color: j.state === 'done' ? '#2f9e44' : j.state === 'failed' || j.state === 'lost' ? '#e03131' : 'var(--text-dim)' }}>{stateLabel(lang, j)}</span>
        {(active || j.state === 'done') && <span>{Math.round(j.progress * 100)}%</span>}
        <span style={{ color: 'var(--text-dim)' }}>{t('cfdElapsed')} {fmtElapsed(elapsed)}</span>
        {active && j.liveCd !== undefined && <span data-cfd-live>{t('cfdLive')} Cd {fmtN(j.liveCd)}</span>}
        <span style={{ flex: 1 }} />
        {active
          ? <button type="button" style={btn} onClick={() => void cancelCfdJob(j.id)}>{t('cfdCancel')}</button>
          : <button type="button" style={btn} onClick={() => removeCfdJob(j.id)}>{t('cfdRemove')}</button>}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>job {j.id} · {j.preset} · {j.mesh}</div>
      {active && <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginTop: 2 }}><div style={{ width: `${Math.max(2, j.progress * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} /></div>}
      {r && <CompareTable r={r} est={j.estimate} lang={lang} estLabel={estLabel} />}
      {j.error && <div style={{ fontSize: 10, color: j.state === 'failed' ? '#e03131' : '#e0a800', wordBreak: 'break-word' }}>{j.error.slice(0, 300)}</div>}
    </div>
  )
}

function CompareTable({ r, est, lang, estLabel }: { r: CfdSummary; est: CfdEstimate; lang: LangInput; estLabel: string }) {
  const t = (k: string) => at(lang, k)
  const rows: [string, number | undefined, number | undefined][] = r.kind === 'rotor'
    ? [['T N', est.thrustN, r.thrustN], ['P W', est.powerW, r.powerW], [r.effKind === 'FM' ? 'FM' : 'η', est.eff, r.eff]]
    : [['Cd', est.Cd, r.Cd], ...(est.Cl !== undefined ? [['Cl', est.Cl, r.Cl] as [string, number | undefined, number | undefined]] : []), ...(est.dragN !== undefined ? [['D N', est.dragN, r.dragN] as [string, number | undefined, number | undefined]] : [])]
  return (
    <div style={{ marginTop: 3 }}>
      {r.kind === 'rotor' && <div style={{ color: '#e0a800', fontSize: 10.5, fontWeight: 700 }}>⚠ {t('cfdUnvalidated')} — {t('cfdRotorNote')}</div>}
      <table style={{ borderCollapse: 'collapse' }}>
        <thead><tr><th style={td} /><th style={td}>{estLabel}</th><th style={td}>{t('cfdFoam')}{r.kind === 'rotor' ? ` (${t('cfdUnvalidated')})` : ''}</th><th style={td}>{t('cfdRatio')}</th></tr></thead>
        <tbody>{rows.map(([k, e, c]) => {
          const q = ratio(c, e)
          return <tr key={k}><td style={td}>{k}</td><td style={td}>{fmtN(e)}</td><td style={{ ...td, fontWeight: 700 }} data-cfd-value={k}>{fmtN(c)}{k === 'Cd' && r.CdStd ? ` ±${fmtN(r.CdStd, 3)}` : ''}</td><td style={td}>{q === undefined ? '—' : `×${q.toFixed(2)}`}</td></tr>
        })}</tbody>
      </table>
      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
        {r.reynolds ? `Re ${r.reynolds.toExponential(1)} · ` : ''}{r.cells ? `${Math.round(r.cells / 1000)}k cells · ` : ''}{r.runtimeS ? `${fmtElapsed(r.runtimeS * 1000)} · ` : ''}{r.converged ? '✓' : `⚠ ${t('cfdNotConverged')}`}
      </div>
      {r.warnings.map((w, i) => <div key={i} style={{ fontSize: 10, color: '#e0a800' }}>⚠ {w}</div>)}
    </div>
  )
}

function downloadZip(data: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/zip' }))
  const a = document.createElement('a'); a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export default function AeroCfdPanel({ spec, cands, lang }: { spec: DesignSpec; cands: Candidate[]; lang: LangInput }) {
  const t = (k: string) => at(lang, k)
  const jobs = useCfdJobs((s) => s.jobs)
  const calib = useCfdJobs((s) => s.calib)
  const health = useCfdJobs((s) => s.health)
  const checking = useCfdJobs((s) => s.checking)
  const [url, setUrl] = useState(getCfdUrl())
  const [n, setN] = useState(1)
  const [mesh, setMesh] = useState<CfdMesh>('coarse')
  const [preset, setPreset] = useState<CfdPresetChoice>('auto')
  const [rerank, setRerank] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const kind = spec.kind
  const mine = jobs.filter((j) => j.source === kind)
  useTick(mine.some(isActive))
  useEffect(() => { void checkHealth(url); kick() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    const top = cands.filter((c) => c.feasible).slice(0, Math.max(1, n))
    if (!top.length || busy) return
    setBusy(true); setMsg(''); setCfdUrl(url)
    const h = await checkHealth(url)
    if (!h.ok) { setBusy(false); setMsg(t(h.blocked ? 'cfdBlocked' : 'cfdOffline')); return }
    try {
      const { caseJson } = buildCfdCase(spec, top, true)
      const ids: string[] = []
      for (let i = 0; i < top.length; i++) {
        const req = jobFromCase(caseJson, i, { mesh, preset })
        const j = await submitCfdJob({ source: kind, label: `#${req.candidateId}`, candidateId: req.candidateId, spec: req.spec, stlBase64: req.stlBase64, name: req.name, estimate: req.estimate }, url)
        ids.push(j.id)
      }
      setMsg(`${t('cfdSubmitted')}: ${ids.join(', ')}`)
    } catch (e) {
      setMsg(`${t('failed')}: ${String((e as Error)?.message || e)}`)
    } finally { setBusy(false) }
  }

  // Latest finished CFD result per candidate id (this template).
  const cfdByCand = useMemo(() => {
    const m = new Map<number, CfdSummary>()
    for (const j of mine) if (j.result && j.candidateId !== undefined && !m.has(j.candidateId)) m.set(j.candidateId, j.result)
    return m
  }, [mine])
  const obj = spec.objectives[0]
  const ranked = useMemo(() => {
    const rows = cands.map((c) => ({ c, est: c.metrics[obj.key], cal: calibratedMetric(kind, obj.key, c.metrics, calib, cfdByCand.get(c.id)), cfd: cfdByCand.has(c.id) }))
    if (!rerank) return rows
    const s = obj.sense === 'max' ? -1 : 1
    return rows.slice().sort((a, b) => (a.c.feasible === b.c.feasible ? s * ((a.cal ?? Infinity) - (b.cal ?? Infinity)) : a.c.feasible ? -1 : 1))
  }, [cands, obj, kind, calib, cfdByCand, rerank])
  const calRow = calib[kind] ?? {}
  const estLabel = t('cfdEst')

  return (
    <div data-aero-cfd style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
      <div style={{ fontWeight: 700 }}>🧮 {t('cfdTitle')}</div>
      <div style={{ fontSize: 10.5, color: 'var(--text-dim)', margin: '2px 0 4px' }}>{t('cfdHonest')}</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>{t('cfdUrl')}</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} style={{ ...inp, width: 150 }} />
        <button type="button" style={btn} disabled={checking} onClick={() => { setCfdUrl(url); void checkHealth(url) }}>{t('cfdCheck')}</button>
        <span data-cfd-health={health ? (health.ok ? 'ok' : 'off') : 'unknown'} style={{ fontSize: 11, color: health?.ok ? '#2f9e44' : '#e03131' }}>
          {health ? (health.ok ? `● ${t('cfdOnline')} (OpenFOAM ${health.openfoam ?? ''}${health.running.length ? ` · ${t('cfdRunning')} ${health.running.length}` : ''}${health.queued.length ? ` · ${t('cfdQueued')} ${health.queued.length}` : ''})` : '') : ''}
        </span>
      </div>
      {health && !health.ok && <div data-cfd-offline style={{ marginTop: 3, padding: '4px 6px', borderRadius: 4, background: 'rgba(224,49,49,.08)', border: '1px solid rgba(224,49,49,.35)', fontSize: 11 }}>
        ⚠ {t(health.blocked ? 'cfdBlocked' : 'cfdOffline')}
        <button type="button" style={{ ...btn, marginLeft: 6 }} onClick={() => { const top = cands.filter((c) => c.feasible).slice(0, Math.max(1, n)); if (top.length) downloadZip(cfdCaseZip(spec, top), `aero-${spec.kind}-cfd-case.zip`) }}>⬇ {t('cfdZip')}</button>
      </div>}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
        <span>N</span><input type="number" min={1} max={8} value={n} onChange={(e) => setN(Math.max(1, Math.min(8, Math.round(Number(e.target.value)) || 1)))} style={{ ...inp, width: 36 }} />
        <label>{t('cfdMesh')} <select data-cfd-mesh value={mesh} onChange={(e) => setMesh(e.target.value as CfdMesh)} style={inp}><option value="coarse">coarse</option><option value="medium">medium</option><option value="fine">fine</option></select></label>
        {kind !== 'prop' && <label>{t('cfdPreset')} <select data-cfd-preset value={preset} onChange={(e) => setPreset(e.target.value as CfdPresetChoice)} style={{ ...inp, maxWidth: 170 }}>
          <option value="auto">{t('cfdPresetAuto')}</option><option value="bluff-lowRe">{t('cfdPresetBluff')}</option><option value="fast-rans">{t('cfdPresetRans')}</option>
        </select></label>}
        <button type="button" data-cfd-send style={{ ...btn, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)', fontWeight: 700 }} disabled={busy || !cands.some((c) => c.feasible)} onClick={() => void send()}>🧮 {t('cfdSend')}</button>
      </div>
      {kind === 'prop' && <div style={{ fontSize: 10.5, color: '#e0a800', marginTop: 2 }}>⚠ {t('cfdRotorNote')}</div>}
      {msg && <div data-cfd-msg style={{ fontSize: 11, marginTop: 3, color: 'var(--text-dim)', wordBreak: 'break-word' }}>{msg}</div>}

      <div style={{ marginTop: 6, fontWeight: 600 }}>{t('cfdJobs')}</div>
      {mine.length ? mine.map((j) => <CfdJobRow key={j.id} j={j} lang={lang} estLabel={estLabel} />) : <div style={{ color: 'var(--text-dim)' }}>{t('cfdNoJobs')}</div>}

      <div style={{ marginTop: 6, fontWeight: 600 }}>{t('cfdCalib')}</div>
      <div data-cfd-calib style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 11 }}>
        {Object.keys(calRow).length
          ? Object.entries(calRow).map(([k, v]) => <span key={k}>{k}: <b>×{v.f.toFixed(3)}</b> <span style={{ color: 'var(--text-dim)' }}>(n={v.n})</span></span>)
          : <span style={{ color: 'var(--text-dim)' }}>{t('cfdCalibNone')}</span>}
        {Object.keys(calRow).length > 0 && <button type="button" style={btn} onClick={() => resetCalibration(kind)}>{t('cfdCalibReset')}</button>}
      </div>
      <label style={{ display: 'block', marginTop: 4 }}><input type="checkbox" checked={rerank} onChange={(e) => setRerank(e.target.checked)} /> {t('cfdRerank')}</label>
      {rerank && <table style={{ borderCollapse: 'collapse', marginTop: 2 }}>
        <thead><tr><th style={td}>#</th><th style={td}>{obj.key} ({t('cfdEst')})</th><th style={td}>{obj.key} ({t('cfdRankCol')})</th></tr></thead>
        <tbody>{ranked.map(({ c, est, cal, cfd }) => <tr key={c.id} style={{ opacity: c.feasible ? 1 : 0.55 }}><td style={td}>{c.id}</td><td style={td}>{fmtN(est)}</td><td style={{ ...td, fontWeight: cfd ? 700 : 400 }}>{fmtN(cal)}{cfd ? ' (CFD)' : ''}</td></tr>)}</tbody>
      </table>}
    </div>
  )
}
