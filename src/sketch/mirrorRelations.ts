import {ellipseArcPoint,ellipseArcSweep,ellipseArcSample,mapEllipseArc} from './ellipseArcGeometry'
import { ellipseControlPoints, ellipseSample } from './ellipseGeometry'
import type { SketchShape } from '../store'
import { applyRelationUpdates, arcResample, refPts, refValid, solveFree, type SkCon, type SkRef, type FPt } from './freesolve'
import { validConstraintEdge } from './constraintAnchors'

/** Persistent origin axis, appended without changing any existing sketch references. */
export function appendMirrorAxis(shapes: SketchShape[], direction: 'x' | 'y', idPrefix: string): { shapes: SketchShape[]; axis: SkRef; cons: SkCon[] } {
  const axis: SkRef = { kind: 'edge', shape: shapes.length, idx: 0 }
  const pts: FPt[] = direction === 'x' ? [[-10, 0], [10, 0]] : [[0, -10], [0, 10]]
  return { shapes: [...shapes, { type: 'poly', pts, open: true, construction: true, centerline: true }], axis, cons: [{ id: `${idPrefix}:axis`, kind: 'con', type: 'fix', a: axis }] }
}

type MirrorResult = { ok: true; shapes: SketchShape[]; cons: SkCon[]; copyIndices: number[]; relationIds: string[] } | { ok: false; reason: string }

const finiteGeometry = (value: unknown): boolean => typeof value === 'number' ? Number.isFinite(value) : Array.isArray(value) ? value.every(finiteGeometry) : value && typeof value === 'object' ? Object.values(value).every(finiteGeometry) : true
const numericEqual = (a: unknown, b: unknown): boolean => typeof a === 'number' && typeof b === 'number' ? Math.abs(a-b) <= 1e-7 : Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v,i) => numericEqual(v,b[i])) : a === b
function geometrySignature(sh: SketchShape): unknown {
  if(sh.type==='circle')return [sh.c,sh.r]
  if(sh.type==='rect')return [sh.a,sh.b]
  if(sh.earc)return [ellipseControlPoints(sh.earc),ellipseArcPoint(sh.earc,sh.earc.a0),ellipseArcPoint(sh.earc,sh.earc.a0+ellipseArcSweep(sh.earc)),ellipseArcSweep(sh.earc)]
  if(sh.ell)return ellipseControlPoints(sh.ell)
  // A three-point arc's middle sample may be canonicalized by the solver.
  if(sh.arc)return arcResample(sh.arc.a,sh.arc.b,sh.arc.m,24)
  if(sh.verts&&sh.bulges)return [sh.verts,sh.bulges]
  return sh.ctrl ?? sh.pts
}

/** Solve creation with original anchors protected, then validate the persistent system. */
export async function solveMirrorCandidate(originalShapes: SketchShape[], candidate: {shapes: SketchShape[];cons: SkCon[]}): Promise<{ok:true;shapes:SketchShape[];dof:number;cons:SkCon[]}|{ok:false;reason:string}> {
  const unchanged = (shapes: SketchShape[]) => shapes.length >= originalShapes.length && originalShapes.every((sh,i) => shapes[i]?.type===sh.type && numericEqual(geometrySignature(sh),geometrySignature(shapes[i])))
  if(!finiteGeometry(candidate.shapes)||!unchanged(candidate.shapes))return {ok:false,reason:'Mirror candidate changed original geometry or contains invalid coordinates.'}
  const pins: SkCon[] = [], used = new Set(candidate.cons.map(c=>c.id))
  const pin=(a:SkRef)=>{let id=`mirror-create-pin:${pins.length}`;while(used.has(id))id+='_';used.add(id);pins.push({id,kind:'con',type:'fix',a})}
  originalShapes.forEach((sh,shape)=>{
    if(sh.type==='poly'&&sh.earc){pin({kind:'ellipse-arc',shape});return}
    if(sh.type==='poly'&&sh.ell){pin({kind:'ellipse',shape});return}
    if(sh.type==='circle'){pin(sh.point?{kind:'pt',shape,idx:0}:{kind:'circle',shape});return}
    const n=sh.type==='rect'?4:sh.arc?2:(sh.ctrl??sh.verts??sh.pts).length
    for(let idx=0;idx<n;idx++){const r:SkRef={kind:'pt',shape,idx};if(refValid(originalShapes,r))pin(r)}
    const segN=sh.type==='poly'&&sh.arc?1:sh.type==='poly'&&sh.verts?(sh.open?n-1:n):0
    for(let idx=0;idx<segN;idx++){const r:SkRef={kind:'center',shape,idx};if(refValid(originalShapes,r))pin(r)}
  })
  try {
    const protectedResult=await solveFree(candidate.shapes,[...candidate.cons,...pins])
    if(!protectedResult||protectedResult.conflict||!finiteGeometry(protectedResult.shapes)||!unchanged(protectedResult.shapes as SketchShape[]))return {ok:false,reason:'Mirror conflicts with existing dimensions or cannot preserve the original geometry.'}
    const exact=protectedResult.shapes.map((sh,i)=>i<originalShapes.length?originalShapes[i]:sh) as SketchShape[]
    const result=await solveFree(exact,applyRelationUpdates(candidate.cons,protectedResult))
    if(!result||result.conflict||!finiteGeometry(result.shapes)||!unchanged(result.shapes as SketchShape[]))return {ok:false,reason:'The persistent mirror constraints could not be validated without moving source geometry.'}
    return {ok:true,shapes:result.shapes.map((sh,i)=>i<originalShapes.length?originalShapes[i]:sh) as SketchShape[],dof:result.dof,cons:applyRelationUpdates(candidate.cons,result)}
  } catch { return {ok:false,reason:'The sketch solver could not validate this mirror.'} }
}

/** Builds a candidate only. The caller must solve and validate it before committing history. */
export function buildMirrorRelations(shapes: SketchShape[], cons: SkCon[], sourceIndices: number[], axis: SkRef, idPrefix: string): MirrorResult {
  if (axis.kind !== 'edge' || !validConstraintEdge(shapes, axis)) return { ok: false, reason: 'Mirror requires a persistent straight sketch edge.' }
  const axisShape = shapes[axis.shape]
  if (axisShape.type === 'poly' && (axisShape.arc || axisShape.smooth || axisShape.ell || axisShape.earc || Math.abs(axisShape.bulges?.[axis.idx] ?? 0) > 1e-9)) return { ok: false, reason: 'A curved edge cannot be a mirror axis.' }
  const [a, b] = refPts(shapes, axis)
  if (!a || !b || ![...a, ...b].every(Number.isFinite)) return { ok: false, reason: 'Invalid mirror axis.' }
  const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy
  if (len2 < 1e-18) return { ok: false, reason: 'Mirror axis has zero length.' }
  const indices = [...new Set(sourceIndices)]
  if (!indices.length || indices.some(i => !Number.isInteger(i) || !shapes[i] || i === axis.shape)) return { ok: false, reason: 'Choose source geometry separately from its mirror axis.' }
  const mirror = (p: FPt): FPt => { const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2; return [2 * (a[0] + t * dx) - p[0], 2 * (a[1] + t * dy) - p[1]] }
  const out = [...shapes], added: SkCon[] = [], copyIndices: number[] = []
  const used = new Set(cons.map(c => c.id))
  const symmetric = (source: SkRef, copy: SkRef) => {
    let id = `${idPrefix}:sym:${added.length}`
    while (used.has(id)) id += '_'
    used.add(id); added.push({ id, kind: 'con', type: 'symmetric', a: source, b: copy, c: { ...axis } })
  }
  for (const i of indices) {
    const sh = shapes[i], j = out.length
    let clone: SketchShape
    if (sh.type === 'circle') {
      if (!Number.isFinite(sh.r) || sh.r < 0 || !sh.c.every(Number.isFinite)) return { ok: false, reason: 'Invalid circle.' }
      clone = { ...sh, c: mirror(sh.c) }
      symmetric(sh.point ? { kind: 'pt', shape: i, idx: 0 } : { kind: 'circle', shape: i }, sh.point ? { kind: 'pt', shape: j, idx: 0 } : { kind: 'circle', shape: j })
    } else if(sh.type==='poly'&&(sh.ell||sh.earc)){
      const e=(sh.earc??sh.ell)!,c=mirror([e.cx,e.cy]),u=mirror(ellipseControlPoints(e)[1]),rot=Math.atan2(u[1]-c[1],u[0]-c[0])*180/Math.PI
      const ell={...e,cx:c[0],cy:c[1],rot}
      if(!finiteGeometry(ell)||ell.rx<=0||ell.ry<=0)return {ok:false,reason:'Invalid ellipse geometry.'}
      const {projected:_p,projectLink:_l,projectLinkIssue:_i,projectLinkSource:_s,...metadata}=sh
      if(sh.earc){try{const earc=mapEllipseArc(sh.earc,mirror,-1);clone={...metadata,earc,pts:ellipseArcSample(earc,Math.max(16,sh.pts.length-1))}}catch{return {ok:false,reason:'Invalid elliptical arc geometry or signed sweep.'}}}
      else clone={...metadata,ell,pts:ellipseSample(ell,Math.max(16,sh.pts.length))}
      symmetric({kind:'ellipse-point',shape:i,idx:0},{kind:'ellipse-point',shape:j,idx:0})
      symmetric({kind:'ellipse-point',shape:i,idx:1},{kind:'ellipse-point',shape:j,idx:1})
      let id=`${idPrefix}:equal:${added.length}`;while(used.has(id))id+='_';used.add(id)
      added.push({id,kind:'con',type:'equal',a:{kind:'ellipse-axis',shape:i,idx:1},b:{kind:'ellipse-axis',shape:j,idx:1}})
      if(sh.earc)for(const idx of [0,1] as const)symmetric({kind:'ellipse-arc-end',shape:i,idx},{kind:'ellipse-arc-end',shape:j,idx})
    } else {
      const spline = sh.type === 'poly' && sh.smooth === true && !!sh.ctrl && sh.ctrl.length >= 3 && !sh.arc && !sh.verts && !sh.conic && !sh.ell && !sh.earc
      if (sh.type === 'poly' && !spline && (sh.ctrl || sh.smooth || sh.bspline || sh.conic || sh.ell || sh.earc)) return { ok: false, reason: 'This curve has no supported persistent solver controls; associative ellipse and conic mirroring require additional support.' }
      if (sh.type === 'poly' && (sh.pts.some(p => !p.every(Number.isFinite)) || sh.bulges?.some(v => !Number.isFinite(v)) || (sh.arc && (!sh.arc.m.every(Number.isFinite) || !refValid(shapes, { kind: 'center', shape: i, idx: 0 }))))) return { ok: false, reason: 'Invalid circular arc or source coordinates.' }
      const verts: FPt[] = sh.type === 'rect' ? [0, 1, 2, 3].map(idx => refPts(shapes, { kind: 'pt', shape: i, idx })[0]) : spline ? sh.ctrl! : sh.arc ? [sh.arc.a, sh.arc.b] : sh.verts ?? sh.pts
      if (verts.length < 2 || verts.some(p => !p || !p.every(Number.isFinite))) return { ok: false, reason: 'Invalid source geometry.' }
      if (sh.type === 'rect') clone = { type: 'poly', pts: verts.map(mirror), ...(sh.construction ? { construction: true } : {}) }
      else {
        // Keep vertex and segment indices stable. Reflection reverses signed arc sweep.
        const { projected: _p, projectLink: _l, projectLinkIssue: _issue, projectLinkSource: _source, ...metadata } = sh
        clone = { ...metadata, pts: sh.pts.map(mirror), ...(spline ? { ctrl: sh.ctrl!.map(mirror) } : {}), ...(sh.verts ? { verts: sh.verts.map(mirror), bulges: sh.bulges?.map(v => -v) } : {}), ...(sh.arc ? { arc: { a: mirror(sh.arc.a), b: mirror(sh.arc.b), m: mirror(sh.arc.m) } } : {}) }
      }
      verts.forEach((_, idx) => symmetric({ kind: 'pt', shape: i, idx }, { kind: 'pt', shape: j, idx }))
      const count = sh.type === 'poly' && sh.arc ? 1 : sh.type === 'poly' && sh.verts ? (sh.open ? verts.length - 1 : verts.length) : 0
      for (let idx = 0; idx < count; idx++) if (refValid(shapes, { kind: 'center', shape: i, idx })) symmetric({ kind: 'center', shape: i, idx }, { kind: 'center', shape: j, idx })
    }
    out.push(clone); copyIndices.push(j)
  }
  return { ok: true, shapes: out, cons: [...cons, ...added], copyIndices, relationIds: added.map(c => c.id) }
}
