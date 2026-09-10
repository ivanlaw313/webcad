import {chromium} from './browser-session.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
const root=path.resolve('../..'),out=path.resolve(process.env.WEBCAD_TEST_OUTPUT_DIR||path.join(root,'outputs/phase19-label-selection'));await fs.mkdir(out,{recursive:true})
const baseline=process.env.WEBCAD_LABEL_BASELINE==='1'
const browser=await chromium.launch({executablePath:path.join(root,'work/runtime/video-browser/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),headless:process.env.WEBCAD_TEST_HEADED!=='1',args:['--use-angle=metal']})
const page=await browser.newPage({viewport:{width:1284,height:762}}),checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message))
const snapshot=()=>page.evaluate(()=>{const s=window.useApp.getState();return{shape:s.sketchShape,cons:s.skCons,undo:s.sketchUndo.length,mode:s.mode,offset:s.skDimLabelOff.length}})
async function stableCamera(){let previous=null,stable=0;for(let i=0;i<35;i++){const current=await page.evaluate(()=>{const t=window.__three,c=t.camera,r=document.querySelector('canvas').getBoundingClientRect();return[...c.matrixWorld.elements,...c.projectionMatrix.elements,...t.controls.target.toArray(),r.x,r.y,r.width,r.height]});stable=previous&&current.every((v,j)=>Math.abs(v-previous[j])<1e-9)?stable+1:0;if(stable>=3)return;previous=current;await page.waitForTimeout(100)}throw Error('camera did not settle')}
async function pos(p){return page.evaluate(([x,y])=>{const c=window.__three.camera,v=c.position.clone().set(x,0,y).project(c),r=document.querySelector('canvas').getBoundingClientRect();return{x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2}},p)}
async function hit(p){return page.evaluate(({x,y})=>{const e=document.elementFromPoint(x,y);return{tag:e?.tagName,text:e?.textContent?.slice(0,80),title:e?.getAttribute('title')}},p)}
async function labelPoint(){const b=await page.locator('[data-dimension-id="length"]').boundingBox();assert.ok(b);return{x:b.x+Math.min(10,b.width/3),y:b.y+b.height/2,b}}
try{
 await page.goto(process.env.WEBCAD_TEST_URL||'http://127.0.0.1:4174/?ui-test=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.useApp&&window.__three)
 for(const viewport of [{width:1284,height:762},{width:800,height:400}]){
  await page.setViewportSize(viewport)
  await page.evaluate(async()=>{const a=window.useApp;a.setState({...a.getInitialState(),mode:'sketch',sketchTool:'select',navTool:'select',sketchPlane:'XY',sketchShape:{type:'poly',open:true,pts:[[20,30],[60,30]]},skCons:[{id:'horizontal',kind:'con',type:'h',a:{kind:'edge',shape:0,idx:0}},{id:'x-anchor',kind:'dim',type:'hdist',a:{kind:'origin'},b:{kind:'pt',shape:0,idx:0},value:20},{id:'length',kind:'dim',type:'len',a:{kind:'edge',shape:0,idx:0},value:40}],sketchFocus:{c:[40,30],size:150}},true);await a.getState().resolveSk();a.getState().skLookAt()});await page.waitForTimeout(650);await stableCamera()
  const before=await snapshot(),midpoint=await pos([40,30]),midpointHit=await hit(midpoint)
  await page.screenshot({path:path.join(out,`${viewport.width}-initial.png`)})
  if(baseline){assert.notEqual(midpointHit.tag,'CANVAS','baseline must reproduce actual occlusion');checks.push({viewport,midpoint,midpointHit,baseline:'geometry midpoint occluded'});continue}
  assert.equal(midpointHit.tag,'CANVAS',JSON.stringify({viewport,midpoint,midpointHit}))
  await page.mouse.move(midpoint.x,midpoint.y);await page.mouse.down();const selected=await page.evaluate(()=>window.useApp.getState().skDrag?.ref);assert.deepEqual(selected,{kind:'edge',shape:0,idx:0});await page.keyboard.press('Escape');await page.mouse.up();await page.waitForTimeout(150);assert.deepEqual(await snapshot(),before)
  const initialLabel=await labelPoint();await page.mouse.click(initialLabel.x,initialLabel.y);const input=page.getByRole('textbox',{name:/尺寸数值|Dimension Value/i});await input.waitFor({state:'visible'});await input.fill('45');await page.keyboard.press('Escape');await page.waitForTimeout(120);assert.deepEqual(await snapshot(),before,'dimension Esc must leave constraints and geometry unchanged')
  const start=await labelPoint(),delta=[48,-36];await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+delta[0],start.y+delta[1],{steps:6});await page.mouse.up();await page.waitForTimeout(150)
  const offset=await page.evaluate(()=>window.useApp.getState().skDimLabelOff.length);assert.ok(offset);offset.forEach((v,i)=>assert.ok(Math.abs(v-delta[i])<1,`manual offset ${offset}`));const after=await snapshot();assert.deepEqual(after.shape,before.shape);assert.deepEqual(after.cons,before.cons);assert.equal(after.undo,before.undo)
  await page.setViewportSize({width:viewport.width-20,height:viewport.height});await stableCamera();await page.setViewportSize(viewport);await stableCamera();assert.deepEqual(await page.evaluate(()=>window.useApp.getState().skDimLabelOff.length),offset,'manual offset retained after viewport relayout')
  const movedLabel=await labelPoint();assert.ok(movedLabel.b.x>=0&&movedLabel.b.y>=0&&movedLabel.b.x+movedLabel.b.width<=viewport.width&&movedLabel.b.y+movedLabel.b.height<=viewport.height,'label visible after manual move');await page.mouse.click(movedLabel.x,movedLabel.y);await input.waitFor({state:'visible'});await page.keyboard.press('Escape');assert.deepEqual((await snapshot()).cons,before.cons)
  const finalMid=await pos([40,30]);assert.equal((await hit(finalMid)).tag,'CANVAS','midpoint remains selectable after manual label move');await page.screenshot({path:path.join(out,`${viewport.width}-manual-label.png`)});checks.push({viewport,midpoint,midpointHit,selected,dimensionEdit:'real click, type 45, Esc unchanged',manualOffset:offset,relayout:'manual displacement retained; label editable and visible',constraints:'exactly unchanged'})
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'browser-validation.json'),JSON.stringify({status:baseline?'BASELINE_REPRODUCED':'PASS',checks,errors},null,2));console.log(`${baseline?'BASELINE_REPRODUCED':'PASS'} label selection ${checks.length} viewports`)
}catch(e){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({message:e.message,checks,snapshot:await snapshot()},null,2));await page.screenshot({path:path.join(out,'failure.png')});throw e}finally{await browser.close()}
