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

export type PrimOp = 'new' | 'cut' | 'newbody' | 'intersect'

/** Box prim success — catalog avoids JA Done:/Box shredding via tStatus EN table. */
export function boxSuccessStatus(opts: {
  op: PrimOp
  l: number | string
  w: number | string
  h: number | string
}, lang?: LangInput): string {
  const key =
    opts.op === 'cut' ? 'status.boxCut'
    : opts.op === 'newbody' ? 'status.boxNewBody'
    : opts.op === 'intersect' ? 'status.boxIntersect'
    : 'status.boxCreated'
  return fmt(msg(key, L(lang)), opts.l, opts.w, opts.h)
}

/** Cylinder prim / extrude-circle success. */
export function cylSuccessStatus(opts: {
  op: PrimOp
  d: number | string
  h: number | string
}, lang?: LangInput): string {
  const key = opts.op === 'cut' ? 'status.cylCut' : 'status.cylCreated'
  return fmt(msg(key, L(lang)), opts.d, opts.h)
}

/** Sphere prim success — catalog avoids JA Done:/Sphere shredding. */
export function sphereSuccessStatus(opts: {
  op: PrimOp
  d: number | string
}, lang?: LangInput): string {
  const key = opts.op === 'cut' ? 'status.sphereCut' : 'status.sphereCreated'
  return fmt(msg(key, L(lang)), opts.d)
}

/** Cone / frustum prim success. */
export function coneSuccessStatus(opts: {
  op: PrimOp
  d: number | string
  dt: number | string
  h: number | string
}, lang?: LangInput): string {
  const key = opts.op === 'cut' ? 'status.coneCut' : 'status.coneCreated'
  return fmt(msg(key, L(lang)), opts.d, opts.dt, opts.h)
}

/** Torus prim success. */
export function torusSuccessStatus(opts: {
  op: PrimOp
  od: number | string
  td: number | string
}, lang?: LangInput): string {
  const key = opts.op === 'cut' ? 'status.torusCut' : 'status.torusCreated'
  return fmt(msg(key, L(lang)), opts.od, opts.td)
}

/** Wedge prim success. */
export function wedgeSuccessStatus(opts: {
  op: PrimOp
  l: number | string
  w: number | string
  h: number | string
}, lang?: LangInput): string {
  const key = opts.op === 'cut' ? 'status.wedgeCut' : 'status.wedgeCreated'
  return fmt(msg(key, L(lang)), opts.l, opts.w, opts.h)
}

/** Dome / hemisphere / spherical-cap prim success. */
export function domeSuccessStatus(opts: {
  op: PrimOp
  d: number | string
  cap?: number | string
}, lang?: LangInput): string {
  const cap = Number(opts.cap ?? 0)
  const R = Number(opts.d) / 2
  if (Number.isFinite(cap) && cap > 0 && Number.isFinite(R) && cap < R) {
    return fmt(msg('status.domeCapCreated', L(lang)), opts.d, cap)
  }
  const key = opts.op === 'cut' ? 'status.domeCut' : 'status.domeCreated'
  return fmt(msg(key, L(lang)), opts.d)
}

/** Half-cylinder / D-shape prim success. */
export function halfcylSuccessStatus(opts: {
  op: PrimOp
  d: number | string
  h: number | string
}, lang?: LangInput): string {
  const key = opts.op === 'cut' ? 'status.halfcylCut' : 'status.halfcylCreated'
  return fmt(msg(key, L(lang)), opts.d, opts.h)
}

/** Pie / sector cylinder prim success. */
export function pieSuccessStatus(opts: {
  op: PrimOp
  d: number | string
  ang: number | string
  h: number | string
}, lang?: LangInput): string {
  const key = opts.op === 'cut' ? 'status.pieCut' : 'status.pieCreated'
  return fmt(msg(key, L(lang)), opts.d, opts.ang, opts.h)
}

/** n-gon prism (extrude poly) success. */
export function prismSuccessStatus(opts: {
  op: PrimOp
  sides: number | string
  d: number | string
  h: number | string
}, lang?: LangInput): string {
  const key = opts.op === 'cut' ? 'status.prismCut' : 'status.prismCreated'
  return fmt(msg(key, L(lang)), opts.sides, opts.d, opts.h)
}

/** Hollow round tube success. */
export function tubeSuccessStatus(opts: {
  od: number | string
  wall: number | string
  id: number | string
  h: number | string
}, lang?: LangInput): string {
  return fmt(msg('status.tubeCreated', L(lang)), opts.od, opts.wall, opts.id, opts.h)
}

/** Rectangular hollow tube success. */
export function rtubeSuccessStatus(opts: {
  w: number | string
  d: number | string
  wall: number | string
  iw: number | string
  id: number | string
  h: number | string
}, lang?: LangInput): string {
  return fmt(msg('status.rtubeCreated', L(lang)), opts.w, opts.d, opts.wall, opts.iw, opts.id, opts.h)
}

/** Coil / spring success. */
export function coilSuccessStatus(opts: {
  taper?: boolean
  d?: number | string
  d2?: number | string
}, lang?: LangInput): string {
  if (opts.taper) return fmt(msg('status.coilTaperCreated', L(lang)), opts.d ?? 0, opts.d2 ?? 0)
  return msg('status.coilCreated', L(lang))
}


/** Gear CREATE success (avoid JA shred of 齿轮). */
export function gearSuccessStatus(opts: {
  op: 'new' | 'cut'
  module: number | string
  teeth: number | string
  pitch: number | string
  tip: number | string
  root: number | string
  depth: number | string
  thickness: number | string
}, lang?: LangInput): string {
  const key = opts.op === 'cut' ? 'status.gearCut' : 'status.gearCreated'
  return fmt(msg(key, L(lang)), opts.module, opts.teeth, opts.pitch, opts.tip, opts.root, opts.depth, opts.thickness)
}

/** Worm CREATE success. */
export function wormSuccessStatus(opts: {
  module: number | string
  starts: number | string
  length: number | string
}, lang?: LangInput): string {
  return fmt(msg('status.wormCreated', L(lang)), opts.module, opts.starts, opts.length)
}

/** Profile (L/U/T) CREATE success. */
export function profileSuccessStatus(opts: {
  op: 'new' | 'cut'
  name: string
  w: number | string
  h: number | string
  t: number | string
  L: number | string
}, lang?: LangInput): string {
  const key = opts.op === 'cut' ? 'status.profileCut' : 'status.profileCreated'
  return fmt(msg(key, L(lang)), opts.name, opts.w, opts.h, opts.t, opts.L)
}
