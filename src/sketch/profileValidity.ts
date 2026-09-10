import type {SketchShape} from '../store'
type Pt=[number,number]
/** Local-origin triangulation avoids cancellation of large absolute products. */
export function stableSignedArea(pts:Pt[]):number {
 if(pts.length<3)return 0
 const o=pts[0];let sum=0,correction=0
 for(let i=1;i+1<pts.length;i++){
  const a=pts[i],b=pts[i+1],term=((a[0]-o[0])*(b[1]-o[1])-(b[0]-o[0])*(a[1]-o[1]))/2
  const adjusted=term-correction,next=sum+adjusted;correction=(next-sum)-adjusted;sum=next
 }
 return sum
}
/** Numerical degeneracy, not a minimum feature size for the user. */
export function degenerateSketchProfile(sh:SketchShape):boolean {
 const tol=1e-7,finite=(p:Pt)=>p.every(Number.isFinite)
 if(sh.type==='circle')return !finite(sh.c)||!Number.isFinite(sh.r)||sh.r<=tol
 if(sh.type==='rect')return !finite(sh.a)||!finite(sh.b)||Math.abs(sh.b[0]-sh.a[0])<=tol||Math.abs(sh.b[1]-sh.a[1])<=tol
 if(sh.pts.length<3||sh.pts.some(p=>!finite(p)))return true
 const o=sh.pts[0],extent=sh.pts.reduce((m,p)=>Math.max(m,Math.abs(p[0]-o[0]),Math.abs(p[1]-o[1])),0)
 return extent<=tol||Math.abs(stableSignedArea(sh.pts))<=tol*extent
}
