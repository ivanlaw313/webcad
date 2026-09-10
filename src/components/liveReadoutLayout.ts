export type ReadoutRect = { x:number; y:number; width:number; height:number }
/** Place a live readout inside the canvas, clear of the actual floating chrome. */
export function placeLiveReadout(width:number,height:number,size:{width:number;height:number},obstacles:ReadoutRect[],gap=8) {
 const w=Math.min(size.width,Math.max(1,width-gap*2)),h=Math.min(size.height,Math.max(1,height-gap*2))
 const clampX=(x:number)=>Math.max(gap,Math.min(width-gap-w,x)),clampY=(y:number)=>Math.max(gap,Math.min(height-gap-h,y))
 const preferred=clampX((width-w)/2),xs=[preferred,gap,clampX(width-gap-w)],ys=[gap,clampY(height-gap-h)]
 for(const r of obstacles){xs.push(clampX(r.x-w-gap),clampX(r.x+r.width+gap));ys.push(clampY(r.y-h-gap),clampY(r.y+r.height+gap))}
 const candidates=xs.flatMap(x=>ys.map(y=>({x,y,width:w,height:h})))
 const area=(r:ReadoutRect)=>obstacles.reduce((n,o)=>n+Math.max(0,Math.min(r.x+w+gap,o.x+o.width)-Math.max(r.x-gap,o.x))*Math.max(0,Math.min(r.y+h+gap,o.y+o.height)-Math.max(r.y-gap,o.y)),0)
 candidates.sort((a,b)=>area(a)-area(b)||(a.y+Math.abs(a.x-preferred)*.2)-(b.y+Math.abs(b.x-preferred)*.2))
 const result=candidates[0];return {...result,conflict:area(result)>0}
}
