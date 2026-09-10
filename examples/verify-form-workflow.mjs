import { chromium } from './browser-session.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
const root=path.resolve('../..'),out=path.resolve(process.env.WEBCAD_TEST_OUTPUT_DIR || path.join(root,'outputs'))
await fs.mkdir(out, { recursive: true })
const browser=await chromium.launch({executablePath:path.join(root,'work/runtime/video-browser/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),headless:process.env.WEBCAD_TEST_HEADED !== '1',args:['--use-angle=metal']})
const page=await browser.newPage({viewport:{width:1284,height:762}}),errors=[],checks=[]
page.on('pageerror',e=>errors.push(e.message))
try {
 await page.goto(process.env.WEBCAD_TEST_URL || 'http://127.0.0.1:4174/?ui-test=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.useApp&&window.__three)
 await page.getByRole('button',{name:'Create Form',exact:true}).click()
 await page.getByRole('button',{name:'Cylinder',exact:true}).click()
 let panel=page.getByRole('region',{name:'Create Form',exact:true})
 await panel.getByLabel('Form plane',{exact:true}).selectOption('XZ')
 await panel.getByLabel('Diameter',{exact:true}).fill('40');await panel.getByLabel('Height',{exact:true}).fill('30')
 await panel.getByRole('button',{name:'OK',exact:true}).click();await page.waitForFunction(()=>!!window.useApp.getState().formCage)
 let verts=await page.evaluate(()=>window.useApp.getState().formCage.verts);assert.ok(Math.max(...verts.map(v=>v[1]))<.001);assert.ok(Math.min(...verts.map(v=>v[1]))<-29);checks.push({test:'Create Form > Cylinder > XZ plane > size > OK'})
 await page.evaluate(()=>{const {camera,controls}=window.__three;camera.position.set(90,90,120);controls.target.set(0,-10,0);controls.update()});await page.waitForTimeout(400)
 const point=await page.evaluate(()=>{const c=window.__three.camera,s=window.useApp.getState(),r=document.querySelector('canvas').getBoundingClientRect();return s.formCage.quads.map((q,i)=>{const p=q.reduce((p,j)=>p.map((x,k)=>x+s.formCage.verts[j][k]/4),[0,0,0]);const v=c.position.clone().set(p[0],p[2],-p[1]);const d=v.distanceTo(c.position);v.project(c);return {i,d,x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2}}).sort((a,b)=>a.d-b.d)[0]})
 await page.mouse.click(point.x,point.y);await page.waitForTimeout(250)
 assert.notEqual(await page.evaluate(()=>window.useApp.getState().formCage.selFace),null);checks.push({test:'real canvas click selects a Form face with a transform gizmo'})
 panel=page.getByRole('region',{name:'Edit Form',exact:true});const before=await page.evaluate(()=>window.useApp.getState().formCage.verts)
 await panel.getByLabel('Form move X',{exact:true}).fill('5');await panel.getByRole('button',{name:'应用变换',exact:true}).click()
 const after=await page.evaluate(()=>({v:window.useApp.getState().formCage.verts,sel:window.useApp.getState().formCage.msel}));for(let i=0;i<before.length;i++)assert.equal(after.v[i][0],before[i][0]+(after.sel.includes(i)?5:0))
 await panel.getByRole('button',{name:'↶ 复原',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.useApp.getState().formCage.verts),before)
 await panel.getByRole('button',{name:'↷ 重做',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.useApp.getState().formCage.verts),after.v);checks.push({test:'face numeric move, full undo and redo'})
 await panel.getByRole('button',{name:'旋',exact:true}).click();await panel.getByLabel('Form rotate Z',{exact:true}).fill('15');await panel.getByRole('button',{name:'应用变换',exact:true}).click()
 await panel.getByRole('button',{name:'缩',exact:true}).click();await panel.getByLabel('Form scale X',{exact:true}).fill('1.1');await panel.getByRole('button',{name:'应用变换',exact:true}).click();checks.push({test:'face rotation and scale through numeric UI'})
 await panel.getByRole('button',{name:'◣ 折痕',exact:true}).click()
 for(const size of [{width:1284,height:762},{width:390,height:600},{width:800,height:400}]){
  await page.setViewportSize(size);await page.waitForTimeout(350);const b=await panel.boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=size.width+1&&b.y+b.height<=size.height+1,JSON.stringify(b))
  const finish=panel.getByRole('button',{name:'✓ Finish Form',exact:true});await finish.scrollIntoViewIfNeeded();assert.ok(await finish.isVisible());assert.ok(await finish.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}), 'Finish must receive pointer input without an overlapping toolbar');
  const overflow=await panel.evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth,bodyScroll:el.lastElementChild.scrollWidth,bodyClient:el.lastElementChild.clientWidth}));assert.ok(overflow.bodyScroll<=overflow.bodyClient+1,JSON.stringify(overflow));
  await panel.getByLabel('收起或展开 Form 面板').click();assert.ok((await panel.boundingBox()).height<50);await panel.getByLabel('收起或展开 Form 面板').click();
  await page.screenshot({path:path.join(out,`WebCAD-phase5-form-${size.width}x${size.height}.png`)});checks.push({test:'Form panel bounded; no horizontal overflow; Finish reachable; collapsible',size,b})
 }
 await page.setViewportSize({width:1284,height:762});await page.waitForTimeout(250)
 const pb=await panel.boundingBox();await page.mouse.move(pb.x+60,pb.y+15);await page.mouse.down();await page.mouse.move(pb.x-70,pb.y+45,{steps:4});await page.mouse.up();const moved=await panel.boundingBox();assert.ok(moved.x<pb.x-90);checks.push({test:'panel can move away from covered geometry'})
 await panel.getByTitle('重设 Form 面板位置').click()
 await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>window.useApp.getState().formCage.msel),[])
 await page.evaluate(()=>window.useApp.getState().selFormVert(0));await panel.getByLabel('Form point X',{exact:true}).fill('-26');await panel.getByLabel('Form point X',{exact:true}).press('Enter');assert.equal(await page.evaluate(()=>window.useApp.getState().formCage.verts[0][0]),-26);checks.push({test:'control-point numeric coordinates update geometry'})
 // Exercise the real TransformControls pointer path (not a store-only coordinate edit).
 await page.waitForTimeout(200)
 async function gizmoDrag(cancel=false){
  const old=await page.evaluate(()=>({v:window.useApp.getState().formCage.verts,undo:window.useApp.getState().formUndo.length}));
  const p=await page.evaluate(()=>{const c=window.__three.camera,r=document.querySelector('canvas').getBoundingClientRect(),sv=window.useApp.getState().formCage.verts[0],v=c.position.clone().set(sv[0],sv[2],-sv[1]);const factor=c.isOrthographicCamera?(c.top-c.bottom)/c.zoom:v.distanceTo(c.position)*Math.min(1.9*Math.tan(Math.PI*c.fov/360)/c.zoom,7);v.x+=factor*.7/4*.42;const w=v.clone();w.x+=4;const screen=t=>{t.project(c);return {x:r.x+(t.x+1)*r.width/2,y:r.y+(1-t.y)*r.height/2}};return {a:screen(v),b:screen(w)}})
  await page.mouse.move(p.a.x,p.a.y);await page.mouse.down();await page.mouse.move(p.b.x,p.b.y,{steps:5});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();await page.waitForTimeout(200);
  const next=await page.evaluate(()=>({v:window.useApp.getState().formCage.verts,undo:window.useApp.getState().formUndo.length,active:!!window.useApp.getState().formEditStart,enabled:window.__three.controls.enabled}));assert.equal(next.active,false);assert.equal(next.enabled,true);
  if(cancel){assert.deepEqual(next.v,old.v);assert.equal(next.undo,old.undo)}else{assert.ok(Math.abs(next.v[0][0]-old.v[0][0]-4)<.2,JSON.stringify({old:old.v[0],next:next.v[0],p}));assert.equal(next.undo,old.undo+1)}
 }
 await gizmoDrag();await gizmoDrag(true);await panel.getByRole('button',{name:'↶ 复原',exact:true}).click();checks.push({test:'real point gizmo drag commits once; Esc rolls back and unlocks navigation'})
 await panel.getByRole('button',{name:'✓ Finish Form',exact:true}).click();await page.waitForFunction(()=>!window.useApp.getState().formMode);let c=await page.evaluate(()=>window.useApp.getState().components[0]);assert.ok(c.formSource)
 await page.getByRole('button',{name:'✎ 编辑 Form 控制笼',exact:true}).click();await page.waitForFunction(()=>window.useApp.getState().formMode);assert.equal(await page.evaluate(()=>window.useApp.getState().formCage.verts[0][0]),-26)
 await panel.getByRole('button',{name:'Cancel Form',exact:true}).click();assert.equal(await page.evaluate(()=>window.useApp.getState().components.length),1);checks.push({test:'Finish, browser-tree Edit Form and Cancel retain original component'})
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'WebCAD-phase5-browser-validation.json'),JSON.stringify({status:'PASS',url:page.url(),checks,errors},null,2));console.log(JSON.stringify(checks,null,2))
}catch(e){await page.screenshot({path:path.join(out,'WebCAD-phase5-ui-failure.png')});console.error(await page.evaluate(()=>({status:window.useApp?.getState().status,mode:window.useApp?.getState().mode,formMode:window.useApp?.getState().formMode,face:window.useApp?.getState().formCage?.selFace})));throw e}finally{await browser.close()}
