// Wind tunnel panel add-on: send the current body (same mesh the LBM tunnel used) with the panel's
// speed / fluid / direction to the local OpenFOAM service and show its Cd beside the LBM trend Cd.
import { useEffect, useState } from 'react'
import { useApp, moldTargetMesh } from '../store'
import { at } from '../aero/aeroI18n'
import { meshToStl } from '../aero/geometry'
import { b64FromBuffer, windSpec } from '../aero/cfdService'
import { useCfdJobs, checkHealth, submitCfdJob, kick, isActive } from '../aero/cfdJobs'
import { getCfdUrl } from '../aero/cfdExport'
import { CfdJobRow, useTick } from './AeroCfdPanel'

export default function WindCfdVerify() {
  const lang = useApp((s) => s.lang)
  const t = (k: string) => at(lang, k)
  const windResult = useApp((s) => s.windResult)
  const job = useCfdJobs((s) => s.jobs.find((j) => j.source === 'wind'))
  const health = useCfdJobs((s) => s.health)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useTick(!!job && isActive(job))
  useEffect(() => { kick() }, [])

  const go = async () => {
    const s = useApp.getState()
    const tgt = moldTargetMesh(s)
    if (!tgt || !tgt.vertices.length) { setMsg(t('cfdWindNoMesh')); return }
    setBusy(true); setMsg('')
    try {
      const h = await checkHealth()
      if (!h.ok) { setMsg(t(h.blocked ? 'cfdBlocked' : 'cfdOffline')); return }
      const { spec, axis } = windSpec({ vertices: tgt.vertices, speed: s.windSpeed, fluid: s.windFluid, axis: s.windAxis, sign: s.windSign, mesh: 'medium', preset: 'auto' })
      const stl = meshToStl({ vertices: tgt.vertices, triangles: tgt.triangles }, 'wind')
      const r = s.windResult
      await submitCfdJob({
        source: 'wind', label: `${s.projectName || 'body'} · ${s.windSpeed} m/s ${s.windSign < 0 ? '−' : '+'}${'XYZ'[axis]}`,
        spec, stlBase64: b64FromBuffer(stl), name: `webcad-wind-${Date.now()}`,
        estimate: r ? { Cd: r.cdCorr ?? r.cd, dragN: r.dragN } : {},
      }, getCfdUrl())
    } catch (e) {
      setMsg(`${t('failed')}: ${String((e as Error)?.message || e)}`)
    } finally { setBusy(false) }
  }

  return (
    <div data-wind-cfd style={{ marginTop: 6, padding: '6px 8px', borderRadius: 4, background: '#1a1d22', fontSize: 11, color: '#cfd6dd', ['--border' as string]: '#2a2e35', ['--text-dim' as string]: '#9aa3ad', ['--panel' as string]: '#22262c', ['--text' as string]: '#cfd6dd' }}>
      <button type="button" data-testid="wind-cfd-verify" disabled={busy || (!!job && isActive(job))} onClick={() => void go()}>🧮 {t('cfdWindBtn')}</button>
      {windResult && <span style={{ marginLeft: 6, color: '#9aa3ad' }}>{t('cfdLbm')} Cd {(windResult.cdCorr ?? windResult.cd).toFixed(3)}</span>}
      {(msg || (health && !health.ok && !job)) && <div style={{ marginTop: 3, color: '#e0a800' }}>{msg || t(health?.blocked ? 'cfdBlocked' : 'cfdOffline')}</div>}
      {job && <CfdJobRow j={job} lang={lang} estLabel={t('cfdLbm')} />}
    </div>
  )
}
