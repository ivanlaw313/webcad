import { chainSegments } from './chainsegs'
import type { SketchShape, Pt } from '../store'

type RefGeo = { segs: [Pt, Pt][] }
type Ref = { kind?: string; shape?: number }
type Constraint = { a?: Ref; b?: Ref; c?: Ref }
export type ProjectLinkHoldReason = 'missing-source' | 'constraints' | 'topology' | 'ambiguous-source' | 'modified-geometry'
export const projectLinkIssueText: Record<ProjectLinkHoldReason, string> = {
  'missing-source': '投影來源不可用', constraints: '來源改變，現有約束需要重新核對',
  topology: '來源輪廓結構已改變', 'ambiguous-source': '多條來源無法可靠配對',
  'modified-geometry': '關聯曲線已被修改',
}

// Kernel edge enumeration can change without changing geometry. Match unchanged
// chains independent of start vertex and traversal direction, never by list index.
function sameCurve(a: Pt[], b: Pt[], open: boolean): boolean {
  if (a.length !== b.length) return false
  const near = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 1e-7
  if (open) return a.every((p, i) => near(p, b[i])) || a.every((p, i) => near(p, b[b.length - 1 - i]))
  return b.some((p, start) => near(a[0], p) && [1, -1].some(dir =>
    a.every((q, i) => near(q, b[(start + dir * i + b.length) % b.length]))))
}

const linkedShape = (c: { pts: Pt[]; closed: boolean }): SketchShape => c.closed && c.pts.length >= 3
  ? { type: 'poly', pts: c.pts.map((p) => [p[0], p[1]] as Pt), projected: true, projectLink: 'all' }
  : { type: 'poly', pts: c.pts.map((p) => [p[0], p[1]] as Pt), open: true, projected: true, projectLink: 'all' }

/**
 * Conservatively refresh Project/Include-All curves when a sketch reopens.
 * We only replace an existing linked set when its topology is identical and
 * no dimension/constraint refers to it; otherwise its old snapshot remains
 * valid and the caller can tell the user why it was not refreshed.
 */
function refreshLegacyProjectLinks(shapes: SketchShape[], refGeo: RefGeo | null, cons: Constraint[]): { shapes: SketchShape[]; refreshed: number; held: number; reason?: ProjectLinkHoldReason } {
  const linked = shapes.map((s, i) => s.type === 'poly' && s.projectLink === 'all' && !(s as LinkedPoly).projectLinkSource ? i : -1).filter((i) => i >= 0)
  if (!linked.length) return { shapes, refreshed: 0, held: 0 }
  const hold = (reason: ProjectLinkHoldReason) => ({
    shapes: shapes.map((s, i) => linked.includes(i) ? { ...s, projectLinkIssue: reason } as SketchShape : s),
    refreshed: 0, held: linked.length, reason,
  })
  const clearIssue = (s: SketchShape): SketchShape => {
    if (s.type !== 'poly' || !s.projectLinkIssue) return s
    const { projectLinkIssue: _issue, ...rest } = s
    return rest
  }
  if (!refGeo?.segs.length) return hold('missing-source')
  if (linked.some(i => {
    const s = shapes[i]
    return s.type === 'poly' && (s.arc || s.verts || s.bulges || s.ctrl || s.smooth || s.ell || s.earc)
  })) return hold('modified-geometry')
  const constrained = cons.some((c) => [c.a, c.b, c.c].some((r) => r?.kind !== 'origin' && typeof r?.shape === 'number' && linked.includes(r.shape)))
  const chains = chainSegments(refGeo.segs.map(([a, b]) => [[a[0], a[1]] as Pt, [b[0], b[1]] as Pt]))
    .filter((c) => c.pts.length >= 2)
  if (chains.length !== linked.length) return hold('topology')
  const matches = linked.map(idx => chains.flatMap((c, i) => {
      const old = shapes[idx]
      return old.type === 'poly' && !!old.open === !c.closed && sameCurve(old.pts, c.pts, !!old.open) ? [i] : []
    }))
  const unchanged = matches.every(m => m.length === 1) && new Set(matches.map(m => m[0])).size === linked.length
  if (unchanged) return { shapes: shapes.map((s,i)=>linked.includes(i)?clearIssue(s):s), refreshed: linked.length, held: 0 }
  if (constrained) return hold('constraints')
  if (linked.length > 1) {
    // Without stable source IDs, movement of several identical loops cannot be
    // distinguished from replacement or crossing. Keep the cache and explain.
    return hold('ambiguous-source')
  }
  const sameTopology = chains.every((c, i) => {
    const old = shapes[linked[i]]
    return old.type === 'poly' && !!old.open === !c.closed && old.pts.length === c.pts.length
  })
  if (!sameTopology) return hold('topology')
  // Same vertex count alone is not identity: a fillet can leave another edge with
  // identical topology. Only refresh when the move is continuous for every chain.
  if (!linked.every((idx, i) => {
    const old = shapes[idx]
    return old.type === 'poly' && continuousMove(old.pts, chains[i].pts, !!old.open)
  })) return hold('ambiguous-source')
  const next = [...shapes]
  linked.forEach((idx, i) => { next[idx] = { ...clearIssue(shapes[idx]), ...linkedShape(chains[i]) } })
  return { shapes: next, refreshed: linked.length, held: 0 }
}

export type ProjectLinkSource = { version: 1; points: Pt[]; open: boolean }
type LinkedPoly = Extract<SketchShape, { type: 'poly' }> & { projectLinkSource?: ProjectLinkSource }
export type ProjectRelinkCandidate = { id: string; label: string; points: Pt[]; open: boolean; compatible: boolean; reason?: ProjectLinkHoldReason }
const modified = (s: LinkedPoly) => !!(s.arc || s.verts || s.bulges || s.ctrl || s.smooth || s.ell || s.earc || s.bspline || s.conic)
const clonePoints = (p: Pt[]): Pt[] => p.map(q=>[q[0],q[1]])
function curveKey(points: Pt[], open: boolean): string {
  const keys = points.map(p=>p.map(v=>Math.round(v*1e7)).join(','))
  const orders: string[]=[]
  for(const dir of [1,-1]) for(let start=0;start<(open?1:keys.length);start++) {
    orders.push(Array.from({length:keys.length},(_,i)=>keys[open?(dir===1?i:keys.length-1-i):(start+dir*i+keys.length)%keys.length]).join(';'))
  }
  return `${open?'open':'closed'}:${orders.sort()[0]??''}`
}
function alignPoints(old: Pt[], replacement: Pt[], open: boolean): Pt[] | null {
  if(old.length!==replacement.length || old.length<2 || [...old,...replacement].some(p=>!p.every(Number.isFinite))) return null
  const alternatives:{points:Pt[];cost:number}[]=[]
  for(const dir of [1,-1]) for(let start=0;start<(open?1:old.length);start++) {
    const points=old.map((_,i)=>replacement[open?(dir===1?i:old.length-1-i):(start+dir*i+old.length)%old.length])
    const cost=points.reduce((sum,p,i)=>sum+(p[0]-old[i][0])**2+(p[1]-old[i][1])**2,0)
    if(!alternatives.some(a=>a.points.every((p,i)=>p[0]===points[i][0]&&p[1]===points[i][1])))alternatives.push({points,cost})
  }
  alternatives.sort((a,b)=>a.cost-b.cost)
  if(alternatives.length>1&&Math.abs(alternatives[1].cost-alternatives[0].cost)<=1e-9*Math.max(1,alternatives[0].cost))return null
  return clonePoints(alternatives[0].points)
}
/** True when replacement is a continuous move of the same curve, not a jump to another edge. */
function continuousMove(old: Pt[], next: Pt[], open: boolean): boolean {
  const aligned = alignPoints(old, next, open)
  if (!aligned) return false
  const cost = aligned.reduce((sum, p, i) => sum + (p[0] - old[i][0]) ** 2 + (p[1] - old[i][1]) ** 2, 0) / aligned.length
  const xs = [...old, ...next].map(p => p[0]), ys = [...old, ...next].map(p => p[1])
  const scale = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1)
  // RMS displacement beyond half the characteristic size is treated as a different edge.
  return cost <= (0.5 * scale) ** 2
}
export function prepareProjectRelink(shape: SketchShape, candidate: ProjectRelinkCandidate): {ok:true;shape:SketchShape}|{ok:false;reason:ProjectLinkHoldReason} {
  if(shape.type!=='poly'||modified(shape as LinkedPoly))return {ok:false,reason:'modified-geometry'}
  if(candidate.reason==='ambiguous-source')return {ok:false,reason:'ambiguous-source'}
  if(!!shape.open!==candidate.open||shape.pts.length!==candidate.points.length)return {ok:false,reason:'topology'}
  const points=alignPoints(shape.pts,candidate.points,candidate.open)
  if(!points)return {ok:false,reason:'ambiguous-source'}
  const {projectLinkIssue:_issue,...rest}=shape
  return {ok:true,shape:{...rest,pts:points,projected:true,projectLink:'all',projectLinkSource:{version:1,points:clonePoints(points),open:candidate.open}} as LinkedPoly}
}
export function getProjectRelinkCandidates(shape: SketchShape, refGeo: RefGeo | null): ProjectRelinkCandidate[] {
  if(!refGeo?.segs.length)return []
  const chains=chainSegments(refGeo.segs.map(([a,b])=>[[...a] as Pt,[...b] as Pt])).filter(c=>c.pts.length>=2)
  const candidates:ProjectRelinkCandidate[]=chains.map(c=>{
    const points=clonePoints(c.pts),open=!c.closed,x=points.map(p=>p[0]),y=points.map(p=>p[1])
    return {id:curveKey(points,open),points,open,compatible:true,label:`${open?'开放':'闭合'} · ${points.length} 点 · X ${Math.min(...x).toFixed(2)}…${Math.max(...x).toFixed(2)} · Y ${Math.min(...y).toFixed(2)}…${Math.max(...y).toFixed(2)}`}
  })
  return candidates.map<ProjectRelinkCandidate>(c=>{
    if(candidates.filter(q=>q.id===c.id).length>1)return {...c,compatible:false,reason:'ambiguous-source'}
    const mapped=prepareProjectRelink(shape,c)
    return mapped.ok?c:{...c,compatible:false,reason:mapped.reason}
  }).sort((a,b)=>a.id.localeCompare(b.id))
}

/** Explicitly selected source snapshots are per curve, not a claim that every source
 * chain belongs to this sketch. Ambiguous changed sources remain held for user repair. */
export function refreshSafeProjectLinks(shapes: SketchShape[], refGeo: RefGeo | null, cons: Constraint[]): {shapes:SketchShape[];refreshed:number;held:number;reason?:ProjectLinkHoldReason} {
  const legacy=refreshLegacyProjectLinks(shapes,refGeo,cons),next=[...legacy.shapes]
  let refreshed=legacy.refreshed,held=legacy.held,reason=legacy.reason
  shapes.forEach((shape,index)=>{
    if(shape.type!=='poly'||shape.projectLink!=='all')return
    const source=(shape as LinkedPoly).projectLinkSource
    if(!source)return
    const hold=(why:ProjectLinkHoldReason)=>{next[index]={...shape,projectLinkIssue:why};held++;reason??=why}
    if(source.version!==1||!Array.isArray(source.points)||source.points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))||source.open!==!!shape.open||!sameCurve(shape.pts,source.points,source.open)||modified(shape as LinkedPoly)){hold('modified-geometry');return}
    const candidates=getProjectRelinkCandidates(shape,refGeo)
    if(!candidates.length){hold('missing-source');return}
    const exact=candidates.filter(c=>c.open===source.open&&sameCurve(source.points,c.points,source.open))
    if(exact.length===1&&exact[0].compatible){const {projectLinkIssue:_issue,...rest}=shape;next[index]=rest;refreshed++;return}
    if(exact.length>1){hold('ambiguous-source');return}
    if(cons.some(c=>[c.a,c.b,c.c].some(r=>r?.kind!=='origin'&&r?.shape===index))){hold('constraints');return}
    // Exact source snapshot missed (dim/fillet/topology). Never silently adopt another
    // edge — even the sole remaining candidate — so the UI can show per-item reconnect.
    hold('ambiguous-source')
  })
  return {shapes:next,refreshed,held,...(reason?{reason}:{})}
}
