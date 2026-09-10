export type GeometryPointerSessionOptions = {
 canvas: HTMLElement
 pointerId: number
 project: (clientX:number,clientY:number)=>[number,number]|null
 move: (point:[number,number])=>void|Promise<void>
 end: (point:[number,number])=>void|Promise<void>
 cancel: ()=>void
 onClose: ()=>void
}
/** Capture only an already-started sketch geometry gesture. Other pointer IDs
 * and other drawing tools keep their existing event handling. Cleanup is silent
 * so an external Escape/store cancellation cannot be committed a second time. */
export function startGeometryPointerSession(options:GeometryPointerSessionOptions):()=>void {
 const {canvas,pointerId,project,move,end,cancel,onClose}=options
 const host=canvas.ownerDocument.defaultView
 let closed=false
 const cleanup=()=>{
  if(closed)return
  closed=true
  host?.removeEventListener('pointermove',onMove,true)
  host?.removeEventListener('pointerup',onUp,true)
  host?.removeEventListener('pointercancel',onCancel,true)
  host?.removeEventListener('blur',onBlur,true)
  canvas.removeEventListener('lostpointercapture',onLost,true)
  try{if(canvas.hasPointerCapture(pointerId))canvas.releasePointerCapture(pointerId)}catch{/* canvas may have been removed */}
  onClose()
 }
 const abort=()=>{if(closed)return;cleanup();cancel()}
 const matches=(e:PointerEvent)=>!closed&&e.pointerId===pointerId
 const projected=(e:PointerEvent)=>{try{const p=project(e.clientX,e.clientY);return p&&p.every(Number.isFinite)?p:null}catch{return null}}
 const onMove=(e:PointerEvent)=>{if(!matches(e))return;const p=projected(e);if(p){try{void Promise.resolve(move(p)).catch(()=>abort())}catch{abort()}}}
 const onUp=(e:PointerEvent)=>{if(!matches(e))return;const p=projected(e);if(!p){abort();return}cleanup();try{void Promise.resolve(end(p)).catch(()=>{/* end owns asynchronous transaction rollback; do not cancel a newer gesture */})}catch{cancel()}}
 const onCancel=(e:PointerEvent)=>{if(matches(e))abort()}
 const onLost=(e:PointerEvent)=>{if(matches(e))abort()}
 // Capture also receives blur from inputs when a user clicks the canvas.
 // Only losing the window itself cancels an already-started pointer gesture.
 const onBlur=(e:FocusEvent)=>{if(e.target===host)abort()}
 if(!host){abort();return cleanup}
 host.addEventListener('pointermove',onMove,true)
 host.addEventListener('pointerup',onUp,true)
 host.addEventListener('pointercancel',onCancel,true)
 host.addEventListener('blur',onBlur,true)
 canvas.addEventListener('lostpointercapture',onLost,true)
 try{canvas.setPointerCapture(pointerId)}catch{abort()}
 return cleanup
}
