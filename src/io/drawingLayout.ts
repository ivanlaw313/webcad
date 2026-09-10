export function drawingScale(value:string):number {
 const m=/^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/.exec(value)
 return m&&+m[1]>0&&+m[2]>0?+m[1]/+m[2]:1
}
export function drawingLinearOffset(d:{x1:number;y1:number;x2:number;y2:number},p:{x:number;y:number}):number {
 const dx=d.x2-d.x1,dy=d.y2-d.y1,len=Math.hypot(dx,dy)
 return len?((p.x-d.x1)*-dy+(p.y-d.y1)*dx)/len:0
}
export function dxfTextValue(text:string):string {
 return text.replace(/[\r\n]/g,' ').replace(/Ø/g,'%%c').replace(/±/g,'%%p').replace(/[^\x20-\x7e]/g,c=>'\\U+'+c.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0'))
}
