/**
 * v1.75 — Feature success status builders via 4-locale catalog (msg/detectLang).
 * Keep zh-HK Traditional source strings in locales/zh-HK.ts (pins unchanged).
 */
import { msg, detectLang, tStatus, normalizeLang, type LangInput } from '../i18n'

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

/** RETEST17 #5：拉伸成功狀態嘅備註括號 — 「兩側」（各自距離）唔可以再報成「（對稱）」。
 *  twoSides=[側1, 側2]（mm，絕對值）時報「（兩側 側1 a · 側2 b mm）」；否則 symmetric →「（對稱）」。 */
export function extrudeExtraNote(f: { symmetric?: boolean; twist?: number; draft?: number; through?: boolean }, twoSides?: [number, number] | null): string {
  const n = (x: number) => String(Math.round(Math.abs(x) * 1000) / 1000)
  const sideNote = twoSides ? `（兩側 側1 ${n(twoSides[0])} · 側2 ${n(twoSides[1])} mm）` : f.symmetric ? '（对称）' : ''
  return (sideNote || (f.twist ? `（扭转 ${f.twist}°）` : '')) + (f.draft ? `（拔模 ${f.draft}°）` : '') + (f.through ? '（贯通）' : '')
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


/** Localized L/U/T section name for profile CREATE toast (avoid SC 槽钢/角铁). */
export function profileSectionName(ptype: string, lang?: LangInput): string {
  const key =
    ptype === 'U' ? 'profile.name.U'
    : ptype === 'T' ? 'profile.name.T'
    : 'profile.name.L'
  return msg(key, L(lang))
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

// Fillet/chamfer size-failure banner (Fusion-style 3 lines). en/ja keep Fusion English; zh-HK/zh-CN localized.
export function roundFailLines(lang: LangInput): string[] {
  const lg = normalizeLang(lang)
  if (lg === 'en' || lg === 'ja') return ['1 error(s)', 'The fillet/chamfer could not be created at the requested size.', 'Try adjusting the size, deselecting some of the edges (try disabling Tangent Chain), or using multiple separate operations.']
  return ['1 個錯誤', '無法按指定尺寸建立圓角／倒角。', '請調整尺寸、取消選取部分稜邊（可以試吓剔走「切線鏈」），或分開多次操作。'].map((t) => tStatus(t, lg))
}

/** UX2 #12：內核失敗原因（worker 原文多數係英文，例如「chamfer near points failed」）→ 用戶睇得明嘅繁體。
 *  只改顯示層；featureErrors 仍存原文（診斷／測試用）。已經係中文嘅原因原樣返回。 */
export function plainFeatureError(type: string | undefined, msg: string): string {
  const t = String(msg ?? '')
  if (/[\u3400-\u9fff]/.test(t)) return t
  const round = type === 'chamfer' || type === 'fillet' || /^(chamfer|fillet)\b/i.test(t)
  if (round) {
    const kind = type === 'fillet' || /^fillet/i.test(t) ? '圓角' : '倒角'
    if (/no edges? near points?|no adjacent face|edge (not found|lost)/i.test(t)) return `揀中嘅棱喺而家個實體上搵唔返 — 請重新揀棱再試`
    if (/did not converge/i.test(t)) return `${kind}計唔到（G2 曲率連續唔收斂）— 試改用 G1 或細啲嘅半徑`
    return `${kind}做唔到 — ${kind === '倒角' ? '距離' : '半徑'}可能太大（超過相鄰面），或者呢條棱本身${kind}唔到（例如旋轉體接縫）；請減細數值或者重新揀棱`
  }
  if (/^\s*$/.test(t)) return '內核未能完成重建'
  return `內核未能完成呢個特徵（${t}）`
}

/** Rebuild-warning suffix: one leading ⚠ (worker warnings often carry their own → was 「⚠ ⚠」), duplicates removed. */
// UX1 #7：拓撲命名（持久邊名／面名、S1／S2、近點退回）係內部術語 — 用戶見到「持久邊名…漂移」唔知講乜。
// 顯示層（狀態列＋重建警告 pill）改講人話；worker 原文唔郁（測試／診斷／英文目錄仍用原句）。
export function plainBuildWarning(w: string): string {
  const t = String(w)
  let m: RegExpMatchArray | null
  if (/^持久邊名.*真拓撲命名 S\d/.test(t)) return '圓角／倒角嘅邊已自動重新配對，請檢查'
  if (/^持久面名.*真拓撲命名 S\d/.test(t)) return '所選面已自動重新配對，請檢查'
  if ((m = t.match(/^(圆角|圓角|倒角)：持久[边邊]名.*?([\d.]+)\s*mm/))) return `${m[1] === '倒角' ? '倒角' : '圓角'}嘅邊搵唔返，已改用最近嘅邊（相差 ${m[2]} mm，可能揀錯），請檢查或重新揀邊`
  if ((m = t.match(/^面[拣揀]：持久面名.*?([\d.]+)\s*mm/))) return `所選面搵唔返，已改用最近嘅面（相差 ${m[1]} mm，可能揀錯），請檢查或重新揀面`
  if (/^真拓撲命名 S2：/.test(t)) return '部分圓角／倒角嘅邊搵唔返，已改用最近嘅邊，請檢查或重新揀邊'
  return t
}

export function formatBuildWarnings(warnings: readonly string[] | null | undefined): string {
  if (!warnings || !warnings.length) return ''
  const seen = new Set<string>()
  const parts: string[] = []
  for (const w of warnings) {
    const t = plainBuildWarning(String(w).replace(/^(?:\s|⚠|\uFE0F)+/u, '').trim())
    if (!t || seen.has(t)) continue
    seen.add(t)
    parts.push(t)
  }
  return parts.length ? '　⚠ ' + parts.join('；') : ''
}
