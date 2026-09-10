import React, {useState} from 'react'
import {createRoot} from 'react-dom/client'
import App from '../src/App'
import {useApp,buildProjectPayload} from '../src/store'
import {cad} from '../src/cad/cadService'
import '../src/index.css'
import recipe from './fusion-demo-car-native.json'

// Explicit isolated lesson; never restore or overwrite an operator's current project.
if(new URLSearchParams(location.search).get('ui-test')!=='1')throw Error('Open with ?ui-test=1')
;(window as any).useApp=useApp
const parts=recipe.components as any[]
const steps:any[]=[{kind:'intro',title:'由空白開始',part:-1,description:'28 個零件 · 49 張草圖 · 72 個原生特徵。按參數自動逐步建模；不是人手滑鼠逐筆操作錄影，亦沒有匯入成品網格。'}]
const labels:any={extrude:'拉伸／切除',fillet:'圓角',mirror:'鏡像',circPattern:'環形陣列',transform:'移動／旋轉'}
parts.forEach((p,pi)=>{p.src.features.forEach((f:any,fi:number)=>{const sk=p.src.sketchSources[f.sketchId];if(sk)steps.push({kind:'sketch',part:pi,feature:fi,title:`${p.name} — 草圖`,description:`選擇${sk.arb?'自定實體面／平面':sk.plane} → 建立 ${sk.shapes.length} 個輪廓 → ${sk.cons.length} 個尺寸／幾何約束 → 完成草圖。`,sk});steps.push({kind:'feature',part:pi,feature:fi,title:`${p.name} — ${labels[f.type]}`,description: f.type==='extrude'?`${f.operation==='cut'?'切除':f.operation==='new'?'新實體':'加料'} ${f.height.toFixed(3)} mm；${f.profile.holes?.length?'保留內輪廓島。':'按草圖法向建立。'}`:f.type==='fillet'?`選取 ${f.nears?.length??0} 處邊；圓角半徑 ${f.radius.toFixed(3)} mm。`:f.type==='circPattern'?`複製來源特徵，數量 ${f.count}；以原生刀具逐個計算。`:f.type==='mirror'?'跨指定平面鏡像來源特徵；保留加料及減料。':'按指定旋轉中心、角度及位移建立。',f})});steps.push({kind:'assembly',part:pi,title:`完成零件 ${pi+1}/28 — ${p.name}`,description:'完成目前原生歷史，將零件加入裝配。前面建立的零件仍保留可編輯草圖與特徵。'})})
steps.push({kind:'finish',part:27,title:'完成同一架 Fusion 示範車',description:'28 個零件 · 72 個原生特徵 · 49 張草圖 · 208 個尺寸／約束。可儲存 JSON，雙擊零件重開草圖改尺寸。跨零件全局參數依賴尚未完整移植。'})
const built=new Map<number,any>()
async function complete(pi:number){if(!built.has(pi)){const p=parts[pi],mesh=await cad.rebuild(p.src.features);if(mesh.failed?.length)throw Error(JSON.stringify(mesh.failed));built.set(pi,{...p,mesh})}return built.get(pi)}
async function show(step:any){
 const completed=[];for(let i=0;i<step.part;i++)completed.push(await complete(i))
 useApp.setState({mode:'model',editingComponent:null,features:[],bodyMesh:null,skEditTarget:null,sketchProfiles:[],sketchShape:null,skCons:[],sketchSources:{},components:[],componentDefs:[],selectedComponent:null,selectedFeature:null,failedFeatureIds:[],visualStyle:'shadedVisible',edgeDisplay:'on',bgPreset:'studio',projectName:'Native-Car-From-Zero-Lesson',timelinePos:0})
 if(step.kind==='intro')return
 if(step.kind==='assembly'||step.kind==='finish'){
  completed.push(await complete(step.part));useApp.setState({components:completed,viewBookmarks:recipe.viewBookmarks as any});useApp.getState().requestFit();return
 }
 const p=parts[step.part],prefix=p.src.features.slice(0,step.feature+1),f=prefix.at(-1)
 useApp.setState({bodyColor:p.color,sketchSources:structuredClone(Object.fromEntries(Object.entries(p.src.sketchSources).filter(([id])=>prefix.some((f:any)=>f.sketchId===id)))),components:completed.map(c=>({...c,hidden:true}))})
 if(step.kind==='sketch'){
  const before=prefix.slice(0,-1);await useApp.getState().applyFeatures(before,'建立本次草圖之前的實體',false)
  useApp.setState({features:[...before,{id:f.id,type:'sketch',sketchId:f.sketchId}] as any,timelinePos:before.length})
  await useApp.getState().editSketchOf(f.id)
  useApp.getState().skLookAt()
 }else{
  const ok=await useApp.getState().applyFeatures(prefix,'已執行原生特徵：'+step.title,false);if(!ok)throw Error('Native feature failed: '+f.id)
  useApp.getState().requestFit()
  if(step.feature===p.src.features.length-1)built.set(step.part,{...p,mesh:useApp.getState().bodyMesh})
 }
}
const num=(n:number)=>Number(n.toFixed(3))
const pt=(p:number[])=>'('+p.map(num).join(', ')+')'
function sketchDetails(sk:any){const lines=[sk.arb?'平面原點 '+pt(sk.arb.o)+'\n法向 '+pt(sk.arb.n):'平面 '+sk.plane]
sk.shapes.forEach((sh:any,i:number)=>{lines.push('\n輪廓 '+(i+1));if(sh.type==='circle')lines.push('圓心 '+pt(sh.c),'直徑 '+num(sh.r*2)+' mm');else if(sh.type==='rect')lines.push('矩形對角 '+pt(sh.a)+' → '+pt(sh.b));else if(sh.arc)lines.push('三點圓弧', '起點 '+pt(sh.arc.a),'中點 '+pt(sh.arc.m),'終點 '+pt(sh.arc.b));else {const ps=sh.verts??sh.pts;lines.push('閉合折線：依次連接',...ps.slice(0,10).map((p:number[],j:number)=>(j+1)+'. '+pt(p)));if(ps.length>10)lines.push('共 '+ps.length+' 點；完整座標見配方。')}})
const ds=sk.cons.filter((c:any)=>c.kind==='dim');if(ds.length)lines.push('\n驅動尺寸',...ds.map((c:any)=>(c.type==='dia'?'直徑':c.type==='len'?'長度':c.type==='hdist'?'水平定位':'垂直定位')+' = '+num(c.value)+' mm'))
return lines.join('\n')}
function featureDetails(f:any){if(f.type==='extrude')return '距離 '+num(f.height)+' mm\n方向：沿草圖法向\n'+(f.profile.holes?.length?'內輪廓：保留島':'閉合輪廓建立實體');if(f.type==='fillet')return '半徑 '+num(f.radius)+' mm\n選邊位置：\n'+(f.nears??[]).map(pt).join('\n');if(f.type==='circPattern')return '數量 '+f.count+'\n軸 '+JSON.stringify(f.dir)+'\n角度 '+(f.totalAngle??360)+'°';if(f.type==='mirror')return '鏡像平面 '+JSON.stringify(f.plane)+'\n來源 '+(f.targets??[]).join(', ');return '旋轉中心 '+pt(f.origin??[0,0,0])+'\n旋轉 '+JSON.stringify(f.rot??[f.rx,f.ry,f.rz])+'\n位移 '+JSON.stringify([f.dx??0,f.dy??0,f.dz??0])}
function Lesson(){const [index,setIndex]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');const step=steps[index]
 async function go(i:number){setBusy(true);setError('');try{await show(steps[i]);setIndex(i)}catch(e){setError(String(e))}finally{setBusy(false)}}
 function save(){const blob=new Blob([JSON.stringify(buildProjectPayload(useApp.getState()))],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Native-Car-From-Zero-Lesson.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
 return <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 340px',height:'100vh',background:'#111923'}}><div className="lesson-cad" style={{minWidth:0,height:'100vh',position:'relative'}}><App/></div><aside style={{color:'#e9f1fa',padding:20,overflow:'auto',font:'15px/1.6 system-ui',borderLeft:'1px solid #42566d'}}>
 <div style={{color:'#85c5ff',fontSize:13}}>WebCAD 原生汽車 · 參數自動建模教學</div><h2 style={{fontSize:21}}>{step.title}</h2><div data-lesson-step={index} data-lesson-busy={busy} style={{color:'#7dddb3'}}>步驟 {index+1} / {steps.length} · {busy?'內核計算中':'可暫停細看'}</div><p>{step.description}</p>
 <select aria-label="Lesson step" disabled={busy} value={index} onChange={e=>go(Number(e.target.value))} style={{width:'100%',marginBottom:12,padding:6}}>{steps.map((s,i)=><option key={i} value={i}>{i+1}. {s.title}</option>)}</select>
 <div style={{display:'flex',gap:8}}><button disabled={busy||index===0} onClick={()=>go(index-1)}>上一步</button><button aria-label="教學下一步" disabled={busy||index===steps.length-1} onClick={()=>go(index+1)}>下一步 →</button></div>
 <p style={{fontSize:12,color:'#adc0d4'}}>草圖畫面顯示輪廓、約束及尺寸；實體畫面顯示本步內核結果。每個零件完成後回到整車裝配。數值單位 mm；座標是目前草圖平面局部座標。</p>
 {step.kind==='sketch'&&<pre style={{fontSize:12,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{sketchDetails(step.sk)}</pre>}
 {step.f&&<pre style={{fontSize:12,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{featureDetails(step.f)}</pre>}
 {step.kind==='finish'&&<button onClick={save}>儲存完成的原生 JSON</button>}{error&&<p role="alert" style={{color:'#ff8c8c'}}>{error}</p>}
 </aside></div>
}
createRoot(document.getElementById('root')!).render(<Lesson/>);
