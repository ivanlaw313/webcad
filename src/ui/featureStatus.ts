/**
 * v1.75 — Feature success status builders via 4-locale catalog (msg/detectLang).
 * Keep zh-HK Traditional source strings in locales/zh-HK.ts (pins unchanged).
 */
import { msg, detectLang, type LangInput } from '../i18n'

function fmt(template: string, ...args: Array<string | number>): string {
  return template.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? ''))
}

function L(lang?: LangInput) {
  return lang ?? detectLang()
}

export type ShellDir = 'inside' | 'outside' | 'both'
export type ShellType = 'open' | 'closed'

/** CLEAN shell commit success toast (no fallback/cavity wording). */
export function shellSuccessStatus(opts: {
  thickness: number
  dir: ShellDir
  shellType: ShellType
  openCount: number
  tangentChain: boolean
}, lang?: LangInput): string {
  const l = L(lang)
  const dirKey =
    opts.dir === 'outside' ? 'status.shellDir.outside'
    : opts.dir === 'both' ? 'status.shellDir.both'
    : 'status.shellDir.inside'
  const body =
    opts.shellType === 'closed'
      ? msg('status.shellBody.closed', l)
      : fmt(
          msg(opts.tangentChain ? 'status.shellBody.openTangent' : 'status.shellBody.open', l),
          opts.openCount,
        )
  return fmt(msg('status.shellDone', l), opts.thickness, msg(dirKey, l), body)
}

/** Extrude / Cut success (single-body path). */
export function extrudeSuccessStatus(opts: {
  op: 'new' | 'cut' | 'stack'
  extra?: string
}, lang?: LangInput): string {
  const l = L(lang)
  const key =
    opts.op === 'cut' ? 'status.extrudeCutDone'
    : opts.op === 'stack' ? 'status.extrudeStackDone'
    : 'status.extrudeDone'
  return msg(key, l) + (opts.extra ?? '')
}

/** Multi-profile Extrude / Cut success. */
export function multiProfileExtrudeStatus(opts: {
  op: 'new' | 'cut'
  count: number
  holes?: number
  groupNodes?: number
}, lang?: LangInput): string {
  const l = L(lang)
  if (opts.op === 'cut') {
    const base = fmt(msg('status.multiCut', l), opts.count)
    return opts.groupNodes != null ? `${base} (×${opts.groupNodes})` : base
  }
  return fmt(msg('status.multiExtrude', l), opts.count, opts.holes ?? 0)
}

export type BoolOp = 'join' | 'cut' | 'common'

/** Body boolean / combine (Fuse) success. */
export function booleanSuccessStatus(opts: {
  kind: 'body' | 'combine'
  op: BoolOp
  toolCount?: number
  keepTools?: boolean
}, lang?: LangInput): string {
  const l = L(lang)
  const sym = opts.op === 'cut' ? '−' : opts.op === 'common' ? '∩' : '+'
  if (opts.kind === 'combine') {
    const n = opts.toolCount ?? 1
    const keep = opts.keepTools ? msg('status.keepTools', l) : ''
    const key =
      opts.op === 'cut' ? 'status.combineCut'
      : opts.op === 'common' ? 'status.combineIntersect'
      : 'status.combineUnite'
    return fmt(msg(key, l), sym, n, keep)
  }
  const key =
    opts.op === 'cut' ? 'status.booleanCut'
    : opts.op === 'common' ? 'status.booleanIntersect'
    : 'status.booleanUnite'
  return msg(key, l)
}

/** New body (park active) success. */
export function newBodySuccessStatus(n: number, lang?: LangInput): string {
  const l = L(lang)
  // Prefer numbered body name from catalog template
  return fmt(msg('status.newBody', l), `Body ${n}`)
}

/** Fillet / chamfer chip success (high-traffic). */
export function filletSuccessStatus(lang?: LangInput): string {
  return msg('status.filletDone', L(lang))
}
export function chamferSuccessStatus(lang?: LangInput): string {
  return msg('status.chamferDone', L(lang))
}
