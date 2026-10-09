// AI Copilot ↔ Aero Design Lab: dispatch for the aero_* tools declared in src/ai/tools.ts.
// Pure (all effects injected via AeroToolDeps) so node tests can drive it without an LLM or a browser.
import type { AeroKind, DesignSpec } from './designSpace'
import { loopSummary, type LoopConfig, type LoopState } from './autoLoop'
import type { CfdMesh } from './cfdService'

export const AERO_TOOL_NAMES = ['aero_open_lab', 'aero_start_auto_design', 'aero_auto_design_status', 'aero_stop_auto_design'] as const

export interface AeroToolDeps {
  specFromBrief(brief: string): Promise<{ spec: DesignSpec; usedAi: boolean; note: string }>
  templateSpec(kind: AeroKind): DesignSpec
  currentSpec(): DesignSpec | null
  openLab(spec: DesignSpec | null, brief: string): void
  startLoop(spec: DesignSpec, cfg: Partial<LoopConfig>): Promise<LoopState>
  getLoop(): LoopState | null
  stopLoop(): void
}

const KINDS: AeroKind[] = ['prop', 'wing', 'shell']
const MESHES: CfdMesh[] = ['coarse', 'medium', 'fine']
const r4 = (v: unknown): unknown => (typeof v === 'number' ? (Number.isFinite(v) ? Number(v.toPrecision(4)) : null) : Array.isArray(v) ? v.map(r4) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, r4(x)])) : v)
const intIn = (v: unknown, lo: number, hi: number): number | undefined => { const n = Math.round(Number(v)); return v === undefined || v === null || v === '' || !Number.isFinite(n) ? undefined : Math.max(lo, Math.min(hi, n)) }
const numIn = (v: unknown, lo: number, hi: number): number | undefined => { const n = Number(v); return v === undefined || v === null || v === '' || !Number.isFinite(n) ? undefined : Math.max(lo, Math.min(hi, n)) }

function specBrief(spec: DesignSpec) {
  return {
    kind: spec.kind, title: spec.title, fixed: spec.fixed,
    variables: spec.vars.map((v) => `${v.key} ∈ [${v.min}, ${v.max}]${v.int ? ' (int)' : ''}`),
    objectives: spec.objectives.map((o) => `${o.sense} ${o.key}`), constraints: spec.constraints.map((c) => `${c.key} ${c.op} ${c.value}`),
  }
}

/** Resolve the design space: brief (AI/rules) > template kind > the lab's current spec. */
async function resolveSpec(a: Record<string, unknown>, deps: AeroToolDeps): Promise<{ spec: DesignSpec | null; note: string; brief: string }> {
  const brief = typeof a.brief === 'string' ? a.brief.trim() : ''
  if (brief) {
    const r = await deps.specFromBrief(brief)
    return { spec: r.spec, brief, note: r.usedAi ? 'design space built by AI from the brief (validated & clamped)' : `design space built by the rule parser (${r.note || 'no AI'})` }
  }
  const kind = String(a.kind ?? '') as AeroKind
  if (KINDS.includes(kind)) return { spec: deps.templateSpec(kind), brief: '', note: `built-in ${kind} template` }
  const cur = deps.currentSpec()
  return { spec: cur, brief: '', note: cur ? 'current Aero Lab design space' : '' }
}

/** Returns null when `name` is not an aero tool. */
export async function runAeroTool(name: string, args: Record<string, unknown> | undefined, deps: AeroToolDeps): Promise<string | null> {
  const a = args || {}
  switch (name) {
    case 'aero_open_lab': {
      const { spec, note, brief } = await resolveSpec(a, deps)
      deps.openLab(spec, brief)
      if (!spec) return '✓ 已打開氣動設計實驗室（未指定需求 — 可以再用 brief 或 kind 叫我設定設計空間）'
      return `✓ 已打開氣動設計實驗室，設計空間：${note}\n${JSON.stringify(specBrief(spec))}`
    }
    case 'aero_start_auto_design': {
      const cur = deps.getLoop()
      if (cur?.status === 'running') return `✗ 已經有一個自動設計循環正在運行（第 ${cur.rounds.length}/${cur.config.rounds} 輪）— 用 aero_auto_design_status 查看進度，或者 aero_stop_auto_design 停了先`
      const { spec, note, brief } = await resolveSpec(a, deps)
      if (!spec) return '✗ 需要 brief（一句設計需求）或 kind（prop / wing / shell）先可以開始自動設計'
      const cfg: Partial<LoopConfig> = {}
      const rounds = intIn(a.rounds, 1, 10); if (rounds !== undefined) cfg.rounds = rounds
      const topN = intIn(a.top_n, 1, 8); if (topN !== undefined) cfg.topN = topN
      const maxJobs = intIn(a.max_cfd_jobs, 0, 50); if (maxJobs !== undefined) cfg.maxJobs = maxJobs
      const maxMin = numIn(a.max_minutes, 5, 600); if (maxMin !== undefined) cfg.maxMinutes = maxMin
      const eps = numIn(a.epsilon, 0, 0.5); if (eps !== undefined) cfg.epsilon = eps
      if (MESHES.includes(a.mesh as CfdMesh)) cfg.mesh = a.mesh as CfdMesh
      if (a.use_rotor_cfd === true || a.use_rotor_cfd === 'true') cfg.useRotorCfd = true
      deps.openLab(spec, brief)
      const st = await deps.startLoop(spec, cfg)
      const mode = st.mode === 'cfd'
        ? `CFD 閉環模式（本機 OpenFOAM，每輪 ${st.config.topN} 個候選，總上限 ${st.config.maxJobs} 個 CFD 工作；每個工作通常要幾分鐘至十幾分鐘）${st.rotor ? '。⚠ 轉子 CFD 未經驗證，數字只供定性參考' : ''}`
        : `只用工程估算（${st.modeReason === 'rotorOff' ? '螺旋槳／風扇的轉子 CFD 只是部分驗證（前飛推力偏低 20–35%），預設不用；要照用請設 use_rotor_cfd=true' : st.modeReason === 'blocked' ? '瀏覽器擋了本機網絡存取' : '本機 CFD 服務無法連接'}）— 結果未經 CFD 驗證`
      return `✓ 已開始自動設計：${note}；${st.config.rounds} 輪；${mode}。之後用 aero_auto_design_status 查進度與最佳結果。\n${JSON.stringify(r4(loopSummary(st)))}`
    }
    case 'aero_auto_design_status': {
      const st = deps.getLoop()
      if (!st) return '✗ 未有自動設計紀錄 — 用 aero_start_auto_design 開始'
      const s = loopSummary(st)
      const head = st.status === 'running'
        ? `⏳ 正在運行：第 ${st.rounds.length}/${st.config.rounds} 輪，階段 ${st.phase}，已用 ${st.jobsUsed}/${st.config.maxJobs} 個 CFD 工作`
        : `■ 已結束（${st.stop}）${st.best ? (st.best.verified ? '，最佳設計已經 CFD 驗證' : '，最佳設計未經 CFD 驗證（只是估算）') : ''}`
      return `${head}${st.rotor && st.mode === 'cfd' ? '（⚠ 轉子 CFD 部分驗證：前飛推力偏低 20–35%）' : ''}\n${JSON.stringify(r4(s))}`
    }
    case 'aero_stop_auto_design': {
      const st = deps.getLoop()
      if (!st || st.status !== 'running') return '✗ 沒有正在運行的自動設計循環'
      deps.stopLoop()
      return '✓ 已要求停止自動設計（排隊／正在計算的 CFD 工作會被取消）'
    }
    default: return null
  }
}
