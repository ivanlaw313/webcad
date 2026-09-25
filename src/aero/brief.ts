// Aero Design Lab — natural-language brief → DesignSpec.
//  · aiSpecFromBrief: uses the existing AI provider layer (user's own key) and asks for STRICT JSON,
//    then validates it against KIND_SCHEMA + hard sanity limits.
//  · specFromBriefFallback: deterministic keyword/number parser used without a key or when the AI
//    answer fails validation. Same brief → same spec, always.
import { chatCompletion, type AiConfig } from '../ai/providers'
import { KIND_SCHEMA, type AeroKind, type DesignSpec, type VarDef } from './designSpace'
import { propTemplate, shellTemplate, templateOf, wingTemplate } from './templates'

/** Hard physical sanity limits per variable/fixed key (units of the spec). */
export const HARD_LIMITS: Record<AeroKind, Record<string, [number, number]>> = {
  prop: { diameter: [20, 3000], blades: [2, 12], pitchRatio: [0.1, 2.5], chord25: [0.04, 0.9], chord60: [0.04, 0.9], chord95: [0.03, 0.8], twistOffset: [-15, 15], camber: [0, 9], thickness: [4, 20], rpm: [100, 40000], V: [0, 120], hubRatio: [0.08, 0.5], material: [100, 9000] },
  wing: { span: [100, 30000], rootChord: [20, 3000], taper: [0.1, 1], sweep: [-10, 45], dihedral: [-10, 15], twistTip: [-10, 5], camber: [0, 9], camberPos: [15, 70], thickness: [4, 25], V: [1, 120], massKg: [0.005, 2000] },
  shell: { length: [20, 20000], diameter: [5, 5000], xMax: [0.15, 0.7], noseExp: [1, 5], tailExp: [0.8, 4], baseFrac: [0, 0.9], V: [0.05, 120], minVolumeL: [0, 1e5], wall: [0.3, 30] },
}

export interface SpecCheck { ok: boolean; spec?: DesignSpec; errors: string[] }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v))

/** Strict validation (+ clamping into HARD_LIMITS). Unknown keys → errors. */
export function validateSpec(obj: unknown): SpecCheck {
  const errors: string[] = []
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['not an object'] }
  const o = obj as Record<string, unknown>
  const kind = o.kind as AeroKind
  if (kind !== 'prop' && kind !== 'wing' && kind !== 'shell') return { ok: false, errors: ['kind must be prop | wing | shell'] }
  const sch = KIND_SCHEMA[kind], lim = HARD_LIMITS[kind]
  const fixed: Record<string, number | string> = {}
  if (o.fixed && typeof o.fixed === 'object') {
    for (const [k, v] of Object.entries(o.fixed as Record<string, unknown>)) {
      if (!sch.fixed.includes(k)) { errors.push(`fixed.${k} not allowed`); continue }
      if (k === 'fluid') { if (v === 'air' || v === 'water') fixed[k] = v; else errors.push('fixed.fluid must be air|water'); continue }
      if (k === 'planform') { if (v === 'trapezoid' || v === 'elliptic') fixed[k] = v; else errors.push('fixed.planform'); continue }
      if (!isNum(v)) { errors.push(`fixed.${k} must be a number`); continue }
      fixed[k] = lim[k] ? clamp(v, lim[k]) : v
    }
  }
  const vars: VarDef[] = []
  if (!Array.isArray(o.vars) || !o.vars.length) errors.push('vars must be a non-empty array')
  else for (const v of o.vars as Record<string, unknown>[]) {
    const key = String(v?.key ?? '')
    if (!sch.vars.includes(key)) { errors.push(`var ${key} not allowed`); continue }
    if (!isNum(v.min) || !isNum(v.max)) { errors.push(`var ${key} min/max must be numbers`); continue }
    let lo = Math.min(v.min, v.max), hi = Math.max(v.min, v.max)
    if (lim[key]) { lo = clamp(lo, lim[key]); hi = clamp(hi, lim[key]) }
    if (!(hi > lo)) { errors.push(`var ${key} empty range`); continue }
    if (vars.some((x) => x.key === key)) { errors.push(`var ${key} duplicated`); continue }
    const def: VarDef = { key, min: lo, max: hi }
    if (key === 'blades') def.int = true
    if (isNum(v.value)) def.value = clamp(v.value, [lo, hi])
    vars.push(def)
    delete fixed[key]
  }
  const objectives: DesignSpec['objectives'] = []
  if (!Array.isArray(o.objectives) || !o.objectives.length) errors.push('objectives must be a non-empty array')
  else for (const ob of o.objectives as Record<string, unknown>[]) {
    const key = String(ob?.key ?? '')
    if (!sch.metrics.includes(key)) { errors.push(`objective ${key} unknown`); continue }
    if (ob.sense !== 'max' && ob.sense !== 'min') { errors.push(`objective ${key} sense`); continue }
    if (!objectives.some((x) => x.key === key)) objectives.push({ key, sense: ob.sense })
  }
  if (objectives.length > 3) errors.push('at most 3 objectives')
  const constraints: DesignSpec['constraints'] = []
  if (Array.isArray(o.constraints)) for (const c of o.constraints as Record<string, unknown>[]) {
    const key = String(c?.key ?? '')
    if (!sch.metrics.includes(key)) { errors.push(`constraint ${key} unknown`); continue }
    if ((c.op !== '>=' && c.op !== '<=') || !isNum(c.value)) { errors.push(`constraint ${key} op/value`); continue }
    constraints.push({ key, op: c.op, value: c.value })
  }
  if (errors.length || !vars.length || !objectives.length) return { ok: false, errors: errors.length ? errors : ['empty spec'] }
  // any template fixed defaults missing (e.g. V, fluid) are filled in from the template
  const base = templateOf(kind)
  for (const [k, v] of Object.entries(base.fixed)) if (!(k in fixed) && !vars.some((x) => x.key === k)) fixed[k] = v
  // template variables the AI did not mention become fixed at their template value
  for (const bv of base.vars) if (!vars.some((x) => x.key === bv.key) && !(bv.key in fixed)) fixed[bv.key] = bv.value ?? (bv.min + bv.max) / 2
  return {
    ok: true, errors: [],
    spec: { kind, title: typeof o.title === 'string' && o.title.trim() ? o.title.trim().slice(0, 80) : base.title, fixed, vars, objectives: objectives.slice(0, 3), constraints, source: 'ai' },
  }
}

// ── deterministic fallback ─────────────────────────────────────────────────────────────
const numRe = '(\\d+(?:\\.\\d+)?)'
function grab(s: string, re: RegExp): number | null { const m = s.match(re); return m ? Number(m[1]) : null }

export function detectKind(brief: string): AeroKind {
  const s = brief.toLowerCase()
  const score = (words: string[]) => words.reduce((n, w) => n + (s.includes(w) ? 1 : 0), 0)
  const prop = score(['風扇', '风扇', 'fan', '螺旋槳', '螺旋桨', 'prop', '葉片', '叶片', 'blade', '推進器', '推进器', 'thruster', 'rpm', '扇葉', '扇叶', 'ファン', 'プロペラ', '槳', '桨'])
  const wing = score(['翼', 'wing', 'glider', '滑翔', 'airfoil', '升阻', 'lift', '翼展', 'span', 'ウイング'])
  const shell = score(['殼', '壳', 'shell', 'hull', 'body', '外殼', '外壳', '流線', '流线', '水阻', '風阻', '风阻', 'drag', 'fairing', '魚雷', '鱼雷', '機身', '机身'])
  // "推進器 殼" → shell wins when a shell word is present alongside thruster words
  if (shell > 0 && shell >= prop - 1 && shell >= wing) return 'shell'
  if (wing > prop) return 'wing'
  if (prop > 0) return 'prop'
  return wing > 0 ? 'wing' : 'shell'
}

export function specFromBriefFallback(brief: string): DesignSpec {
  const s = brief.replace(/，/g, ',').replace(/：/g, ':')
  const kind = detectKind(s)
  const water = /水|water|marine|船|underwater|hydro|潛|潜/i.test(s)
  const quiet = /靜音|静音|quiet|silent|noise|噪音|低噪/i.test(s)
  const light = /輕|轻|light|weight|重量|質量|质量/i.test(s)
  const speed = grab(s, new RegExp(numRe + '\\s*(?:m/s|米每秒|米/秒|mps)', 'i'))
  const kmh = grab(s, new RegExp(numRe + '\\s*(?:km/h|kph|公里)', 'i'))
  const V = speed ?? (kmh !== null ? kmh / 3.6 : null)
  const mm = grab(s, new RegExp(numRe + '\\s*mm', 'i'))
  const cm = grab(s, new RegExp(numRe + '\\s*cm', 'i'))
  const meters = grab(s, new RegExp(numRe + '\\s*(?:m|米|公尺)(?![/a-z])', 'i'))
  const inch = grab(s, new RegExp(numRe + '\\s*(?:吋|inch|in\\b|")', 'i'))
  const lenMM = mm ?? (cm !== null ? cm * 10 : null) ?? (inch !== null ? inch * 25.4 : null) ?? (meters !== null ? meters * 1000 : null)
  let spec: DesignSpec
  if (kind === 'prop') {
    spec = propTemplate()
    const rpm = grab(s, new RegExp(numRe + '\\s*(?:rpm|轉|转|r/min)', 'i'))
    const thrustN = grab(s, new RegExp(numRe + '\\s*(?:N\\b|牛)', 'i'))
    if (lenMM) spec.fixed.diameter = Math.min(3000, Math.max(20, lenMM))
    if (rpm) spec.fixed.rpm = Math.min(40000, Math.max(100, rpm))
    if (V !== null) spec.fixed.V = Math.min(120, Math.max(0, V))
    if (water) { spec.fixed.fluid = 'water'; if (!rpm) spec.fixed.rpm = 1200 }
    const D = Number(spec.fixed.diameter) / 1000, n = Number(spec.fixed.rpm) / 60
    const rho = water ? 998 : 1.204
    // default thrust floor: 25% of what a CT = 0.1 rotor would give, or the stated requirement
    spec.constraints = [{ key: 'thrust', op: '>=', value: thrustN ?? Number((0.025 * rho * n * n * D ** 4).toPrecision(2)) }, { key: 'stalled', op: '<=', value: 0.3 }]
    spec.objectives = quiet ? [{ key: 'eff', sense: 'max' }, { key: 'noise', sense: 'min' }] : [{ key: 'eff', sense: 'max' }]
    spec.title = `${Math.round(Number(spec.fixed.diameter))}mm ${water ? '水下推進器' : quiet ? '靜音風扇' : '螺旋槳'} · ${Math.round(Number(spec.fixed.rpm))} rpm`
  } else if (kind === 'wing') {
    spec = wingTemplate()
    if (lenMM) spec.fixed.span = Math.min(30000, Math.max(100, lenMM))
    const kg = grab(s, new RegExp(numRe + '\\s*(?:kg|公斤)', 'i'))
    const g = grab(s, new RegExp(numRe + '\\s*(?:g\\b|克)', 'i'))
    if (kg !== null) spec.fixed.massKg = kg
    else if (g !== null) spec.fixed.massKg = g / 1000
    if (V !== null) spec.fixed.V = Math.min(120, Math.max(1, V))
    if (water) spec.fixed.fluid = 'water'
    const span = Number(spec.fixed.span)
    const rc = spec.vars.find((v) => v.key === 'rootChord')!
    rc.min = Math.max(20, span / 25); rc.max = Math.max(rc.min * 2, span / 4); rc.value = (rc.min + rc.max) / 2
    spec.objectives = light ? [{ key: 'LD', sense: 'max' }, { key: 'mass', sense: 'min' }] : [{ key: 'LD', sense: 'max' }]
    spec.title = `機翼 ${(span / 1000).toFixed(2)} m 翼展 · 最高升阻比`
  } else {
    spec = shellTemplate()
    const litres = grab(s, new RegExp(numRe + '\\s*(?:L\\b|l\\b|公升|升|litre|liter)', 'i'))
    if (litres !== null) spec.constraints = [{ key: 'volumeL', op: '>=', value: litres }]
    spec.fixed.fluid = water || !/air|空氣|空气|風|风/i.test(s) ? (water ? 'water' : 'air') : 'air'
    if (V !== null) spec.fixed.V = V
    else spec.fixed.V = spec.fixed.fluid === 'water' ? 2 : 15
    if (lenMM) {
      const L = spec.vars.find((v) => v.key === 'length')!
      L.min = lenMM * 0.6; L.max = lenMM * 1.3; L.value = lenMM
      const D = spec.vars.find((v) => v.key === 'diameter')!
      D.min = lenMM / 12; D.max = lenMM / 2; D.value = lenMM / 4
    }
    spec.objectives = light ? [{ key: 'drag', sense: 'min' }, { key: 'mass', sense: 'min' }] : [{ key: 'drag', sense: 'min' }]
    spec.title = `${spec.fixed.fluid === 'water' ? '水中' : '空氣中'}流線殼 · 最低阻力`
  }
  spec.source = 'fallback'
  spec.brief = brief
  return spec
}

// ── AI path ────────────────────────────────────────────────────────────────────────────
export function briefSystemPrompt(): string {
  const lines = [
    'You convert an engineering design brief into a JSON design space for an aerodynamic/hydrodynamic optimizer.',
    'Reply with ONE JSON object only (no markdown, no prose). Schema:',
    '{"kind":"prop|wing|shell","title":string,"fixed":{key:number|string},"vars":[{"key":string,"min":number,"max":number,"value"?:number}],"objectives":[{"key":string,"sense":"max|min"}],"constraints":[{"key":string,"op":">=|<=","value":number}]}',
    'Units: lengths mm, angles deg, speed m/s, rotor speed rpm, wing massKg in kg, shell minVolumeL in litres.',
  ]
  for (const k of ['prop', 'wing', 'shell'] as AeroKind[]) {
    const s = KIND_SCHEMA[k]
    lines.push(`kind=${k}: vars ∈ [${s.vars.join(', ')}]; fixed ∈ [${s.fixed.join(', ')}]; objective/constraint keys ∈ [${s.metrics.join(', ')}].`)
  }
  lines.push('prop: chord25/chord60/chord95 are chord/radius at r/R=0.25/0.6/0.95; pitchRatio = pitch/diameter; eff = propulsive efficiency (V>0) or figure of merit (static fan); noise = relative index; fluid air|water; V = inflow speed (0 = static fan).')
  lines.push('wing: span tip-to-tip; massKg = supported weight; LD = lift/drag at the trimmed cruise; stallMargin = 1 − max(cl/clmax); keep stallMargin >= 0.15.')
  lines.push('shell: axisymmetric body; xMax = max-diameter position (fraction of length); noseExp 1=cone,2=ellipse; tailExp; baseFrac = base diameter/max diameter; volumeL = internal volume (L).')
  lines.push('Use 1 objective for a single goal, 2–3 for trade-offs. Keep 4–9 vars with realistic ranges; put anything the user fixed into "fixed".')
  lines.push('Example: {"kind":"prop","title":"120mm quiet fan","fixed":{"diameter":120,"rpm":2500,"V":0,"fluid":"air"},"vars":[{"key":"blades","min":3,"max":9},{"key":"pitchRatio","min":0.3,"max":1.2},{"key":"chord25","min":0.15,"max":0.6},{"key":"chord60","min":0.15,"max":0.6},{"key":"chord95","min":0.1,"max":0.5},{"key":"camber","min":0,"max":7}],"objectives":[{"key":"eff","sense":"max"},{"key":"noise","sense":"min"}],"constraints":[{"key":"thrust","op":">=","value":0.08}]}')
  return lines.join('\n')
}

/** Extract the first balanced JSON object from a model reply. */
export function extractJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, '')
  const i = t.indexOf('{')
  if (i < 0) return null
  let depth = 0, inStr = false, esc = false
  for (let k = i; k < t.length; k++) {
    const c = t[k]
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) { try { return JSON.parse(t.slice(i, k + 1)) } catch { return null } } }
  }
  return null
}

export interface BriefResult { spec: DesignSpec; usedAi: boolean; note: string }

export async function specFromBrief(brief: string, cfg: AiConfig | null): Promise<BriefResult> {
  const fb = () => specFromBriefFallback(brief)
  const needsKey = cfg && cfg.provider !== 'local'
  if (!cfg || (needsKey && !cfg.apiKey)) return { spec: fb(), usedAi: false, note: 'no-key' }
  try {
    const res = await chatCompletion(cfg, [{ role: 'user', content: brief }], [], briefSystemPrompt())
    const chk = validateSpec(extractJson(res.text))
    if (!chk.ok || !chk.spec) return { spec: fb(), usedAi: false, note: 'invalid: ' + chk.errors.slice(0, 4).join('; ') }
    chk.spec.brief = brief
    return { spec: chk.spec, usedAi: true, note: 'ok' }
  } catch (e) {
    return { spec: fb(), usedAi: false, note: 'error: ' + String((e as Error)?.message || e).slice(0, 160) }
  }
}
