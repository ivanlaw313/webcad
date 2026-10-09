import { useRef, useState } from 'react'
import { lengthScale } from '../io/units'
import { useApp, evalExpr } from '../store'
import { dimensionExpression, parameterId } from '../cad/dimensionExpression'
import { tStatus } from '../i18n'
import { idleDraft, focusDraft, editDraft, shownText, commitDraft, fieldKeyOwner, type FieldDraft } from '../ui/fieldInput'
/* Feature-dialog ƒx field (Extrude distance, Extrude-edit, …). While focused it shows a LOCAL draft:
 * the store value (`extrudeExpression ?? toLenInput(extrudeHeight)` / featDlg heightExpr) is re-derived on
 * every preview/store write and used to overwrite the text + caret mid-typing ("25" → "02"). Each edit is
 * still reported via onText (live preview, OK gating, Enter commit read the store), blur/Enter flush once
 * more, and the draft is never re-formatted. Editing keys never bubble to window hotkeys. */
export function ExpressionInput({text, onText, scale, bindingRefs, label = '距離表達式'}:{text:string;onText:(s:string)=>void;label?:string;scale?:number;bindingRefs?:Record<string,string>}) {
 const params=useApp(s=>s.params)
 const unit=useApp(s=>s.unit)
 const lang=useApp(s=>s.lang)
 const [fd,setFd]=useState<FieldDraft>(idleDraft)
 const fdRef=useRef(fd); fdRef.current=fd
 const keepSel=useRef(false)
 const shown=shownText(fd,text)
 const flush=()=>{const {next,commit}=commitDraft(fdRef.current,text);if(commit!=null)onText(commit);setFd(next)}
 const r=dimensionExpression(shown,params,evalExpr,'mm',bindingRefs,scale ?? lengthScale(unit))
 const renamed=Object.entries(bindingRefs ?? {}).map(([token,id])=>{const p=params.find(p=>parameterId(p)===id);return p&&p.name!==token&&new RegExp(`(^|[^\\w])${token}([^\\w]|$)`).test(shown)?`${token} → ${p.name}`:null}).filter(Boolean)
 return <div className="dimension-expression">
  <input aria-label={tStatus(label,lang)} type="text" value={shown} aria-invalid={!!r.error}
   onChange={e=>{const v=e.target.value;setFd(s=>editDraft(s.focused?s:focusDraft(text),v));onText(v)}}
   onFocus={e=>{setFd(focusDraft(text));keepSel.current=true;e.currentTarget.select()}}
   // Chrome's mouseup after a click-to-focus collapses the select() above — keep the whole value selected once.
   onMouseUp={e=>{if(keepSel.current){keepSel.current=false;if(e.currentTarget.selectionStart===e.currentTarget.selectionEnd){e.preventDefault();e.currentTarget.select()}}}}
   onBlur={()=>{keepSel.current=false;flush()}}
   onKeyDown={e=>{
    if(e.nativeEvent.isComposing||e.keyCode===229)return
    if(e.key==='Enter'){const {commit}=commitDraft(fdRef.current,text,{keepFocus:true});if(commit!=null)onText(commit);return}   // bubble → CommandDialog commits
    if(fieldKeyOwner(e,e.currentTarget,e.currentTarget)==='field')e.stopPropagation()   // digits/Ctrl+A/C/V never reach sketch/viewport hotkeys
   }}
   autoComplete="off" spellCheck={false} />
  <small role="status" className={r.error?'input-error':''}>{r.error !== undefined ? tStatus(r.error,lang) : `ƒx = ${Number(r.value.toFixed(4))} mm`}</small>
  {renamed.length>0 && <small>{tStatus('保留引用：',lang)}{renamed.join('、')}</small>}
 </div>
}
