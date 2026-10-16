import { useState } from 'react'
import { Euler, Matrix4, Vector3 } from 'three'
import { useApp } from '../store'
import { tStatus } from '../i18n'

/** Relative transforms in the cage's local axes, centred on the selected points. */
export function FormTransformFields() {
  const mode = useApp(s => s.formGizmoMode)
  const face = useApp(s => s.formCage?.selFace)
  const dragging = useApp(s => !!s.formEditStart)
  return <TransformInputs key={mode} mode={mode} face={face != null} disabled={dragging} />
}
function TransformInputs({ mode, face, disabled }: { mode: 'move' | 'rotate' | 'scale'; face: boolean; disabled: boolean }) {
  const lang = useApp(s => s.lang)
  const initial = mode === 'scale' ? '1' : '0'
  const [values, setValues] = useState([initial, initial, initial])
  const nums = values.map(Number)
  const valid = values.every(v => v.trim()) && nums.every(Number.isFinite) && (mode !== 'scale' || nums.every(v => v > 0))
  const apply = () => {
    if (!valid || disabled) return
    const s = useApp.getState(), cage = s.formCage, indices = cage?.msel ?? []
    if (!cage || !indices.length) return
    const center = new Vector3()
    for (const i of indices) center.add(new Vector3(...cage.verts[i]))
    center.divideScalar(indices.length)
    const m = mode === 'move' ? new Matrix4().makeTranslation(nums[0],nums[1],nums[2])
      : new Matrix4().makeTranslation(center.x,center.y,center.z)
        .multiply(mode === 'rotate' ? new Matrix4().makeRotationFromEuler(new Euler(...nums.map(n=>n*Math.PI/180) as [number,number,number], 'XYZ')) : new Matrix4().makeScale(nums[0],nums[1],nums[2]))
        .multiply(new Matrix4().makeTranslation(-center.x,-center.y,-center.z))
    s.transformFormVerts(m.toArray())
    setValues([initial,initial,initial])
  }
  return <fieldset disabled={disabled} style={{width:'100%',minWidth:0,margin:0,padding:6,border:'1px solid #c8d8e4',borderRadius:4}}>
    <legend>{tStatus(face ? '面' : '選中控制點', lang)} · {tStatus(mode === 'move' ? '相對移動 (mm)' : mode === 'rotate' ? '繞選集中心旋轉 (°)' : '繞選集中心縮放 (倍)', lang)}</legend>
    <div style={{display:'flex',flexWrap:'wrap',gap:5,alignItems:'center'}}>
      {['X','Y','Z'].map((axis,i)=><label key={axis}>{axis} <input aria-label={`Form ${mode} ${axis}`} value={values[i]} type="number" step={mode === 'scale' ? .1 : 1} style={{width:52}} onChange={e=>setValues(v=>v.map((x,j)=>j===i?e.target.value:x))} onKeyDown={e=>{e.stopPropagation();if(e.nativeEvent.isComposing)return;if(e.key==='Enter'){e.preventDefault();apply()}if(e.key==='Escape')setValues([initial,initial,initial])}} /></label>)}
      <button className="cs-btn" disabled={!valid} onClick={apply}>{tStatus('應用變換', lang)}</button>
    </div>
    <small>{tStatus('控制籠局部座標；也可拖動軸向控制柄。', lang)}</small>
  </fieldset>
}
