import type {EllipseGeometry} from './ellipseGeometry'
export type EllipseArcGeometry = EllipseGeometry & {a0:number;a1:number;version?:2;signedSweepDeg?:number;sweep?:boolean}
type Pt=[number,number]
/** Old sketches used CCW endpoint angles; old worker profiles also stored sweep. */
export function ellipseArcSweep(e:EllipseArcGeometry):number {
 if(e.version===2||e.signedSweepDeg!==undefined){const v=e.signedSweepDeg;if(!Number.isFinite(v)||v===undefined||Math.abs(v)<1e-9||Math.abs(v)>360+1e-9)throw new Error('Invalid elliptical arc sweep');return v}
 if(!Number.isFinite(e.a0)||!Number.isFinite(e.a1))throw new Error('Invalid elliptical arc angles')
 const direction=e.sweep===false?-1:1,delta=(e.a1-e.a0)*direction
 return direction*((delta%360+360)%360||360)
}
export function ellipseArcWithSweep(e:EllipseGeometry,a0:number,signedSweepDeg:number):EllipseArcGeometry {
 const out:EllipseArcGeometry={cx:e.cx,cy:e.cy,rx:e.rx,ry:e.ry,rot:e.rot,a0,a1:a0+signedSweepDeg,version:2,signedSweepDeg}
 if(![out.cx,out.cy,out.rx,out.ry,out.rot,a0].every(Number.isFinite)||out.rx<=0||out.ry<=0)throw new Error('Invalid elliptical arc geometry')
 ellipseArcSweep(out);return out
}
export function ellipseArcPoint(e:EllipseGeometry,tDeg:number):Pt {
 const r=e.rot*Math.PI/180,t=tDeg*Math.PI/180,x=e.rx*Math.cos(t),y=e.ry*Math.sin(t)
 return[e.cx+x*Math.cos(r)-y*Math.sin(r),e.cy+x*Math.sin(r)+y*Math.cos(r)]
}
export function ellipseArcSample(e:EllipseArcGeometry,count=48):Pt[]{const sweep=ellipseArcSweep(e),n=Math.max(2,Math.floor(count));return Array.from({length:n+1},(_,i)=>ellipseArcPoint(e,e.a0+sweep*i/n))}
/** Rigid planar map with known handedness; preserve named axes and endpoints. */
export function mapEllipseArc(e:EllipseArcGeometry,map:(p:Pt)=>Pt,handedness:1|-1):EllipseArcGeometry {
 const c=map([e.cx,e.cy]),u=map(ellipseArcPoint(e,0)),rot=Math.atan2(u[1]-c[1],u[0]-c[0])*180/Math.PI;return ellipseArcWithSweep({...e,cx:c[0],cy:c[1],rot},e.a0*handedness,ellipseArcSweep(e)*handedness)
}

/** Signed interval membership; full turns include the entire support ellipse. */
export function ellipseArcContainsAngle(e:EllipseArcGeometry,angleDeg:number,tolerance=1e-7):boolean{
 if(!Number.isFinite(angleDeg))return false
 const sweep=ellipseArcSweep(e);if(Math.abs(sweep)>=360-tolerance)return true
 const progress=((Math.sign(sweep)*(angleDeg-e.a0))%360+360)%360
 return progress<=Math.abs(sweep)+tolerance||360-progress<=tolerance
}
