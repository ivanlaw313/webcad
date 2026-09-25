// Aero Design Lab — ⑤ auto-design mode (closed loop optimiser ↔ OpenFOAM with a GP correction).
// Config, start/stop, mode banner (CFD vs estimator-only), best-per-round SVG chart, round log,
// final "best verified design" card. State lives in aero/autoLoopStore (persisted; reload resumes).
import { useEffect, useState, type CSSProperties } from 'react'
import { at, atf, metricLabel, varLabel } from '../aero/aeroI18n'
import type { LangInput } from '../i18n/types'
import type { DesignSpec } from '../aero/designSpace'
import { DEFAULT_LOOP_CONFIG, bestPick, primary, type LoopConfig, type LoopLog, type LoopState } from '../aero/autoLoop'
import { useAutoLoop, startAutoLoop, stopAutoLoop, clearAutoLoop, resumeAutoLoop } from '../aero/autoLoopStore'
import { buildAeroCad } from '../aero/aeroClient'
import { designMesh, meshToStl } from '../aero/geometry'
import type { CfdMesh, CfdPresetChoice } from '../aero/cfdService'
import { fmtN, fmtElapsed, useTick } from './AeroCfdPanel'

const btn: CSSProperties = { padding: '3px 9px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', cursor: 'pointer', fontSize: 12 }
const btnPri: CSSProperties = { ...btn, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)', fontWeight: 700 }
const inp: CSSProperties = { width: 48, fontSize: 11, padding: '1px 3px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--panel)', color: 'var(--text)' }
const td: CSSProperties = { padding: '1px 4px', fontSize: 11, whiteSpace: 'nowrap' }
const LS_CFG = 'webcad.aero.autoLoopCfg'

function download(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a'); a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function logLine(lang: LangInput, l: LoopLog): string {
  const v: Record<string, string | number> = { ...(l.v ?? {}) }
  for (const k of ['best', 'est', 'cfd', 'obj']) if (typeof v[k] === 'number') v[k] = fmtN(v[k] as number)
  if (l.key === 'lgModeEst' && v.reason) v.reason = at(lang, `autoReason_${v.reason}`)
  if (l.key === 'lgStop' && v.reason) v.reason = at(lang, `autoStop_${v.reason}`)
  return atf(lang, l.key, v)
}

/** Best objective per round: solid = best CFD-verified so far, dots = round's best CFD, dashed = corrected estimate. */
function RoundChart({ st, yl }: { st: LoopState; yl: string }) {
  const W = 440, H = 150, L = 46, R = 10, T = 10, B = 26
  const rs = st.rounds
  const K = Math.max(st.config.rounds, rs.length, 2)
  const verifiedMode = rs.some((r) => r.bestCfd !== undefined)
  const est = rs.map((r) => r.bestEst)
  const cfd = rs.map((r) => r.bestCfd)
  const sofar = rs.map((r) => (verifiedMode ? r.bestSoFar : undefined))
  const vals = [...est, ...cfd, ...sofar].filter((v): v is number => v !== undefined && Number.isFinite(v))
  if (!vals.length) return null
  let lo = Math.min(...vals), hi = Math.max(...vals)
  if (hi - lo < 1e-12) { const d = Math.abs(hi) * 0.05 || 1; lo -= d; hi += d }
  const pad = (hi - lo) * 0.1; lo -= pad; hi += pad
  const X = (i: number) => L + (W - L - R) * (K <= 1 ? 0.5 : i / (K - 1))
  const Y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo))
  const path = (a: (number | undefined)[]) => a.map((v, i) => (v === undefined || !Number.isFinite(v) ? '' : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`)).filter(Boolean).join(' ')
  return (
    <svg data-auto-chart viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={yl}>
      <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="var(--border)" />
      <line x1={L} y1={T} x2={L} y2={H - B} stroke="var(--border)" />
      {[lo + pad, (lo + hi) / 2, hi - pad].map((v, i) => <text key={i} x={L - 4} y={Y(v) + 3} fontSize={9} textAnchor="end" fill="var(--text-dim)">{fmtN(v)}</text>)}
      {Array.from({ length: K }, (_, i) => <text key={i} x={X(i)} y={H - B + 12} fontSize={9} textAnchor="middle" fill="var(--text-dim)">{i + 1}</text>)}
      <text x={(L + W - R) / 2} y={H - 2} fontSize={9} textAnchor="middle" fill="var(--text-dim)">{yl}</text>
      <polyline points={path(est)} fill="none" stroke="var(--text-dim)" strokeDasharray="4 3" strokeWidth={1.5} />
      {est.map((v, i) => (v !== undefined && Number.isFinite(v) ? <circle key={`e${i}`} cx={X(i)} cy={Y(v)} r={2.5} fill="var(--text-dim)" /> : null))}
      {verifiedMode && <polyline points={path(sofar)} fill="none" stroke="#2f9e44" strokeWidth={2} />}
      {cfd.map((v, i) => (v !== undefined && Number.isFinite(v) ? <circle key={`c${i}`} cx={X(i)} cy={Y(v)} r={3.5} fill="#2f9e44" /> : null))}
    </svg>
  )
}

export default function AeroAutoLoop({ spec, lang, onInsert }: { spec: DesignSpec; lang: LangInput; onInsert: (spec: DesignSpec, x: Record<string, number>, id: number) => void }) {
  const t = (k: string) => at(lang, k)
  const st = useAutoLoop((s) => s.state)
  const driving = useAutoLoop((s) => s.driving)
  const [cfg, setCfg] = useState<LoopConfig>(() => {
    try { return { ...DEFAULT_LOOP_CONFIG, ...JSON.parse(localStorage.getItem(LS_CFG) || '{}') } } catch { return DEFAULT_LOOP_CONFIG }
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const running = st?.status === 'running'
  useTick(running)
  useEffect(() => { resumeAutoLoop() }, [])

  const setC = (p: Partial<LoopConfig>) => { const c = { ...cfg, ...p }; setCfg(c); try { localStorage.setItem(LS_CFG, JSON.stringify(c)) } catch { /* private mode */ } }
  const numIn = (k: 'rounds' | 'topN' | 'maxJobs' | 'maxMinutes' | 'epsilon', step = 1) => (
    <input type="number" data-auto-cfg={k} step={step} value={cfg[k]} disabled={running} style={inp}
      onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) setC({ [k]: n } as Partial<LoopConfig>) }} />
  )
  const start = async () => {
    setErr('')
    try { await startAutoLoop(spec, cfg) } catch (e) { setErr(String((e as Error)?.message || e)) }
  }

  const sp = st?.spec ?? spec
  const obj = primary(sp)
  const objName = `${metricLabel(lang, obj.key)} (${obj.sense === 'max' ? '↑' : '↓'})`
  const b = st ? bestPick(st) : undefined
  const cur = st?.rounds[st.rounds.length - 1]
  const rotor = sp.kind === 'prop'

  const step = async (x: Record<string, number>, id: number) => {
    setBusy(t('building'))
    try { const { step } = await buildAeroCad(sp, x); download(step, `aero-${sp.kind}-auto-${id}.step`, 'application/step') }
    catch (e) { setErr(`${t('failed')}: ${String((e as Error)?.message || e)}`) } finally { setBusy('') }
  }

  return (
    <div data-auto-loop data-auto-status={st?.status ?? 'none'} data-auto-phase={st?.phase ?? ''} data-auto-mode={st?.mode ?? ''} style={{ border: '1px solid var(--accent)', borderRadius: 6, padding: 8, marginTop: 8 }}>
      <div style={{ fontWeight: 700 }}>🤖 {t('autoTitle')}</div>
      <div style={{ fontSize: 10.5, color: 'var(--text-dim)', margin: '2px 0 4px', lineHeight: 1.4 }}>{t('autoIntro')}</div>
      <div style={{ display: 'flex', gap: '4px 10px', flexWrap: 'wrap', alignItems: 'center', fontSize: 11 }}>
        <label>{t('autoRounds')} {numIn('rounds')}</label>
        <label>{t('autoTopN')} {numIn('topN')}</label>
        <label>{t('autoMaxJobs')} {numIn('maxJobs')}</label>
        <label>{t('autoMaxMin')} {numIn('maxMinutes', 5)}</label>
        <label>{t('autoEps')} {numIn('epsilon', 0.005)}</label>
        <label>{t('cfdMesh')} <select data-auto-mesh value={cfg.mesh} disabled={running} onChange={(e) => setC({ mesh: e.target.value as CfdMesh })} style={{ ...inp, width: 'auto' }}><option value="coarse">coarse</option><option value="medium">medium</option><option value="fine">fine</option></select></label>
        <span data-auto-mesh-note style={{ fontSize: 11, color: '#8a939d' }}>{t('cfdCoarseWarn')}</span>
        {!rotor && <label>{t('cfdPreset')} <select value={cfg.preset} disabled={running} onChange={(e) => setC({ preset: e.target.value as CfdPresetChoice })} style={{ ...inp, width: 'auto', maxWidth: 150 }}>
          <option value="auto">{t('cfdPresetAuto')}</option><option value="bluff-lowRe">{t('cfdPresetBluff')}</option><option value="fast-rans">{t('cfdPresetRans')}</option>
        </select></label>}
        <label>{t('budget')} <select value={cfg.budget} disabled={running} onChange={(e) => setC({ budget: Number(e.target.value) })} style={{ ...inp, width: 'auto' }}>{[300, 1200, 3000].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      </div>
      {rotor && <label style={{ display: 'block', marginTop: 3, fontSize: 11, color: '#e0a800' }}>
        <input type="checkbox" data-auto-rotor checked={cfg.useRotorCfd} disabled={running} onChange={(e) => setC({ useRotorCfd: e.target.checked })} /> ⚠ {t('autoRotor')} — {t('cfdRotorNote')}
      </label>}
      <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {running
          ? <button type="button" data-auto-stop style={btn} onClick={() => stopAutoLoop()}>{t('autoStopBtn')}</button>
          : <button type="button" data-auto-start style={btnPri} onClick={() => void start()}>{t('autoStart')}</button>}
        {st && !running && <button type="button" style={btn} onClick={() => clearAutoLoop()}>{t('autoClear')}</button>}
        {st && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {t('autoRound')} {st.rounds.length}/{st.config.rounds} · {t('autoJobsUsed')} {st.jobsUsed}/{st.config.maxJobs} · {t('autoElapsed')} {fmtElapsed((running ? Date.now() : st.updatedAt) - st.startedAt)}
          {running && ` · ${t(`autoPhase_${st.phase}`)}${driving ? '' : ' …'}`}
        </span>}
      </div>
      {err && <div style={{ color: '#e03131', fontSize: 11 }}>{err}</div>}
      {busy && <div style={{ color: 'var(--accent)', fontSize: 11 }}>{busy}</div>}

      {st && <>
        {st.phase !== 'start' && <div data-auto-mode-banner={st.mode} style={{ marginTop: 6, padding: '4px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600, ...(st.mode === 'cfd' ? { background: 'rgba(47,158,68,.08)', border: '1px solid rgba(47,158,68,.4)' } : { background: 'rgba(224,168,0,.1)', border: '1px solid rgba(224,168,0,.45)' }) }}>
          {st.mode === 'cfd' ? `● ${t('autoModeCfd')}` : `⚠ ${t('autoModeEst')}${st.modeReason ? ` — ${t(`autoReason_${st.modeReason}`)}` : ''}`}
          {st.mode === 'cfd' && st.rotor && <div style={{ color: '#e0a800' }}>⚠ {t('cfdUnvalidated')} — {t('cfdRotorNote')}</div>}
          {st.modeReason === 'blocked' && <div style={{ fontWeight: 400 }}>{t('cfdBlocked')}</div>}
          {st.modeReason === 'offline' && <div style={{ fontWeight: 400 }}>{t('cfdOffline')}</div>}
        </div>}
        {st.stop && <div data-auto-stopped={st.stop} style={{ marginTop: 3, fontSize: 11, color: st.status === 'done' ? 'var(--text)' : '#e03131' }}>■ {t(`autoStop_${st.stop}`)}{st.error ? ` — ${st.error}` : ''}</div>}

        {st.rounds.length > 0 && <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t('autoChart')}</div>
          <RoundChart st={st} yl={objName} />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', marginTop: 3 }}>
              <thead><tr><th style={td}>{t('autoRound')}</th><th style={td}>{t('autoBestEst')}</th><th style={td}>{t('autoBestCfd')}{st.rotor && st.mode === 'cfd' ? ` (${t('cfdUnvalidated')})` : ''}</th><th style={td}>{t('autoCalibCol')}</th><th style={td}>{t('autoPredErr')}</th><th style={td}>{t('autoJobsUsed')}</th></tr></thead>
              <tbody>{st.rounds.map((r) => (
                <tr key={r.n} data-auto-round-row={r.n} data-auto-round-cfd={r.bestCfd ?? ''}>
                  <td style={td}>{r.n}{r.mode === 'estimator' ? ' ⚠' : ''}</td>
                  <td style={td}>{fmtN(r.bestEst)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{fmtN(r.bestCfd)}</td>
                  <td style={td}>{r.calib ? Object.entries(r.calib).map(([k, c]) => `${k}×${c.factor.toFixed(3)} (n=${c.n})`).join(' · ') : '—'}</td>
                  <td style={td}>{r.predErr ? Object.entries(r.predErr).map(([k, e]) => `${k} ${((Math.exp(e as number) - 1) * 100).toFixed(1)}%`).join(' · ') : '—'}</td>
                  <td style={td}>{r.picks.map((p) => `#${p.cid}:${p.state === 'done' ? '✓' : p.state === 'failed' ? '✗' : p.state === 'submitted' ? `${Math.round((p.progress ?? 0) * 100)}%` : '…'}`).join(' ')}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {running && cur && cur.picks.some((p) => p.state === 'submitted') && <div style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 2 }}>
            {cur.picks.filter((p) => p.state === 'submitted').map((p) => <div key={p.cid} data-auto-job={p.jobId}>#{p.cid} · job {p.jobId} · {p.stage}{p.queuePosition ? ` · ${t('cfdQueuePos')}${p.queuePosition}` : ''} · {Math.round((p.progress ?? 0) * 100)}%</div>)}
          </div>}
        </div>}

        {b && <div data-auto-best data-auto-best-verified={st.best?.verified ? '1' : '0'} style={{ marginTop: 8, padding: 6, borderRadius: 6, border: `1px solid ${st.best?.verified ? '#2f9e44' : '#e0a800'}` }}>
          <div style={{ fontWeight: 700 }}>{st.best?.verified ? t('autoBestTitle') : `⚠ ${t('autoBestUnverified')}`} · #{b.cid} ({t('autoRound')} {st.best?.round})</div>
          <table style={{ borderCollapse: 'collapse', marginTop: 3 }}>
            <thead><tr><th style={td} /><th style={td}>{t('autoEstRaw')}</th><th style={td}>{t('autoEstCorr')}</th><th style={td}>{t('autoCfdVals')}{st.rotor ? ` (${t('cfdUnvalidated')})` : ''}</th></tr></thead>
            <tbody>
              <tr><td style={td}>{objName}</td><td style={td}>{fmtN(b.objRaw)}</td><td style={td}>{fmtN(b.objEst)}</td><td style={{ ...td, fontWeight: 700 }} data-auto-best-cfd>{fmtN(b.objCfd)}</td></tr>
              {b.cfd?.Cd !== undefined && <tr><td style={td}>Cd</td><td style={td}>{fmtN(b.raw.CD)}</td><td style={td}>{fmtN(b.corrected.CD)}</td><td style={td}>{fmtN(b.cfd.Cd)}{b.cfd.CdStd ? ` ±${fmtN(b.cfd.CdStd)}` : ''}</td></tr>}
              {b.cfd?.Cl !== undefined && Number.isFinite(b.cfd.Cl) && sp.kind === 'wing' && <tr><td style={td}>Cl</td><td style={td}>{fmtN(b.raw.CL)}</td><td style={td}>{fmtN(b.corrected.CL)}</td><td style={td}>{fmtN(b.cfd.Cl)}</td></tr>}
              {b.cfd?.dragN !== undefined && sp.kind !== 'prop' && obj.key !== 'drag' && <tr><td style={td}>{metricLabel(lang, 'drag')}</td><td style={td}>{fmtN(b.raw.drag)}</td><td style={td}>{fmtN(b.corrected.drag)}</td><td style={td}>{fmtN(b.cfd.dragN)}</td></tr>}
              {b.cfd?.kind === 'rotor' && <>
                <tr><td style={td}>T N</td><td style={td}>{fmtN(b.raw.thrust)}</td><td style={td}>{fmtN(b.corrected.thrust)}</td><td style={td}>{fmtN(b.cfd.thrustN)}</td></tr>
                <tr><td style={td}>P W</td><td style={td}>{fmtN(b.raw.power)}</td><td style={td}>{fmtN(b.corrected.power)}</td><td style={td}>{fmtN(b.cfd.powerW)}</td></tr>
              </>}
            </tbody>
          </table>
          {b.cfd && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>job {b.jobId} · {b.cfd.cells ? `${Math.round(b.cfd.cells / 1000)}k cells · ` : ''}{b.cfd.runtimeS ? `${fmtElapsed(b.cfd.runtimeS * 1000)} · ` : ''}{b.cfd.converged ? '✓' : `⚠ ${t('cfdNotConverged')}`}</div>}
          {!st.best?.verified && <div style={{ fontSize: 10.5, color: '#e0a800' }}>{t('autoNoCfdNote')}</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginTop: 3, fontSize: 11 }}>
            {sp.vars.map((v) => <span key={v.key}>{varLabel(lang, v.key)}: <b>{v.int ? b.x[v.key] : fmtN(b.x[v.key])}</b></span>)}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
            <button type="button" data-auto-insert style={btnPri} disabled={!!busy} onClick={() => onInsert(sp, b.x, b.cid)}>＋ {t('insert')}</button>
            <button type="button" style={btn} onClick={() => download(meshToStl(designMesh(sp, b.x), sp.kind), `aero-${sp.kind}-auto-${b.cid}.stl`, 'model/stl')}>⬇ {t('stl')}</button>
            <button type="button" style={btn} disabled={!!busy} onClick={() => void step(b.x, b.cid)}>⬇ {t('autoStep')}</button>
          </div>
        </div>}

        {st.log.length > 0 && <details style={{ marginTop: 6 }} open={running}>
          <summary style={{ fontSize: 11, cursor: 'pointer' }}>{t('autoLog')} ({st.log.length})</summary>
          <div data-auto-log style={{ maxHeight: 160, overflowY: 'auto', fontSize: 10.5, fontFamily: 'ui-monospace, monospace', color: 'var(--text-dim)' }}>
            {st.log.slice(-40).map((l, i) => <div key={i}>{new Date(l.t).toLocaleTimeString()} {logLine(lang, l)}</div>)}
          </div>
        </details>}
      </>}
    </div>
  )
}
