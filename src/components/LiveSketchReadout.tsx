import {useEffect,useRef} from 'react'
import {placeLiveReadout} from './liveReadoutLayout'

export function LiveSketchReadout({text}:{text:string}) {
 const ref=useRef<HTMLDivElement>(null)
 useEffect(()=>{
  let frame=0,last=''
  const update=()=>{
   const el=ref.current,parent=el?.closest('.viewport')
   if(el&&parent){
    const viewport=parent.getBoundingClientRect()
    el.style.maxWidth=`${Math.max(1,viewport.width-16)}px`
    el.style.maxHeight=`${Math.max(1,viewport.height-16)}px`
    const size=el.getBoundingClientRect()
    el.style.pointerEvents=el.scrollHeight>el.clientHeight?'auto':'none'
    const obstacles=Array.from(parent.querySelectorAll<HTMLElement>('.sketch-bar,[data-sketch-tool-panel],.vp-navbar,.vp-badge,.vp-props,.sketch-display-recovery')).filter(node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden').map(node=>{const r=node.getBoundingClientRect();return{x:r.x-viewport.x,y:r.y-viewport.y,width:r.width,height:r.height}})
    const placed=placeLiveReadout(viewport.width,viewport.height,size,obstacles),signature=`${placed.x},${placed.y},${placed.conflict}`
    if(signature!==last){el.style.left=`${placed.x}px`;el.style.top=`${placed.y}px`;el.dataset.layoutConflict=String(placed.conflict);el.style.visibility='visible';last=signature}
   }
   frame=requestAnimationFrame(update)
  }
  frame=requestAnimationFrame(update);return()=>cancelAnimationFrame(frame)
 },[])
 return <div ref={ref} className="vp-measure vp-live-sketch-readout" role="status" data-sketch-live-readout style={{visibility:'hidden'}}>{text}</div>
}
