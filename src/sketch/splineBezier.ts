import type { Pt } from './sketchOps'
export type CubicBezierSegment = [Pt, Pt, Pt, Pt]

/** Exact cubic polynomial spans of the same Catmull-Rom / uniform B-spline used by the sketch sampler. */
export function splineBezier(ctrl: Pt[], bspline: boolean, closed: boolean): CubicBezierSegment[] {
  if(ctrl.length<3||ctrl.some(p=>p.length!==2||!p.every(Number.isFinite)))throw new Error('Spline requires at least three finite control points.')
  const n=ctrl.length, segments:CubicBezierSegment[]=[]
  if(!bspline){
    const P=(i:number)=>ctrl[closed?(i%n+n)%n:Math.max(0,Math.min(n-1,i))]
    for(let i=0;i<(closed?n:n-1);i++){
      const p0=P(i-1),a=P(i),b=P(i+1),p3=P(i+2)
      segments.push([[...a],[a[0]+(b[0]-p0[0])/6,a[1]+(b[1]-p0[1])/6],[b[0]-(p3[0]-a[0])/6,b[1]-(p3[1]-a[1])/6],[...b]])
    }
    return segments
  }
  const degree=Math.min(3,closed?n:n-1), cp=closed?Array.from({length:n+degree},(_,i)=>ctrl[i%n]):ctrl
  const knots=Array.from({length:cp.length+degree+1},(_,i)=>closed?i:i<=degree?0:i>=cp.length?1:(i-degree)/(cp.length-degree))
  const evaluate=(span:number,u:number):Pt=>{
    const d=Array.from({length:degree+1},(_,j)=>[...cp[span-degree+j]] as Pt)
    for(let r=1;r<=degree;r++)for(let j=degree;j>=r;j--){const i=span-degree+j,den=knots[i+degree-r+1]-knots[i],alpha=den>0?(u-knots[i])/den:0;d[j]=[(1-alpha)*d[j-1][0]+alpha*d[j][0],(1-alpha)*d[j-1][1]+alpha*d[j][1]]}
    return d[degree]
  }
  for(let span=degree;span<cp.length;span++){
    const lo=knots[span],hi=knots[span+1];if(hi<=lo)continue
    const a=evaluate(span,lo),q=evaluate(span,lo+(hi-lo)/3),r=evaluate(span,lo+2*(hi-lo)/3),b=evaluate(span,hi)
    // Solve the Bernstein basis at t=1/3 and 2/3, including degree elevation for quadratic spans.
    const c1:Pt=[0,0],c2:Pt=[0,0]
    for(const k of [0,1]){const u=27*q[k]-8*a[k]-b[k],v=27*r[k]-a[k]-8*b[k];c1[k]=(2*u-v)/18;c2[k]=(2*v-u)/18}
    segments.push([a,c1,c2,b])
  }
  return segments
}
