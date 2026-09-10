export type ScalePoint={x:number;y:number}
export type ScalePointerResult={ok:true;factor:number;handle:ScalePoint}|{ok:false;reason:'non-finite'|'zero-handle-radius'|'non-positive-factor'}
const finite=(p:ScalePoint)=>Number.isFinite(p.x)&&Number.isFinite(p.y)
/** Signed ray projection changes scale only. Crossing the base never reflects it. */
export function factorFromScalePointer(base:ScalePoint,start:ScalePoint,current:ScalePoint):ScalePointerResult{
 if(!finite(base)||!finite(start)||!finite(current))return{ok:false,reason:'non-finite'}
 const dx=start.x-base.x,dy=start.y-base.y,radius=Math.hypot(dx,dy)
 if(!Number.isFinite(radius))return{ok:false,reason:'non-finite'}
 if(radius<=1e-8)return{ok:false,reason:'zero-handle-radius'}
 const ux=dx/radius,uy=dy/radius,distance=(current.x-base.x)*ux+(current.y-base.y)*uy,factor=distance/radius
 if(!Number.isFinite(factor))return{ok:false,reason:'non-finite'}
 if(factor<=0)return{ok:false,reason:'non-positive-factor'}
 const handle={x:base.x+distance*ux,y:base.y+distance*uy}
 if(!finite(handle))return{ok:false,reason:'non-finite'}
 return{ok:true,factor,handle}
}
/** World-unit default. The renderer may supply a screen-derived minimum radius. */
export function defaultScaleHandle(base:ScalePoint,bounds:{min:ScalePoint;max:ScalePoint},minimumRadius=1):ScalePoint|null{
 if(!finite(base)||!finite(bounds.min)||!finite(bounds.max)||!Number.isFinite(minimumRadius)||minimumRadius<=1e-8||bounds.min.x>bounds.max.x||bounds.min.y>bounds.max.y)return null
 const radius=Math.max(minimumRadius,Math.hypot(bounds.min.x-base.x,bounds.min.y-base.y),Math.hypot(bounds.min.x-base.x,bounds.max.y-base.y),Math.hypot(bounds.max.x-base.x,bounds.min.y-base.y),Math.hypot(bounds.max.x-base.x,bounds.max.y-base.y)),handle={x:base.x+radius*1.15,y:base.y}
 return finite(handle)&&handle.x>base.x?handle:null
}
