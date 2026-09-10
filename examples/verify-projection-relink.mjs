import { chromium } from './browser-session.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
const root=path.resolve('../..'),out=path.resolve(process.env.WEBCAD_TEST_OUTPUT_DIR||path.join(root,'outputs/phase13-projection-relink'))
await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch({headless:process.env.WEBCAD_TEST_HEADED!=='1',args:['--use-angle=metal'],executablePath:path.join(root,'work/runtime/video-browser/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')})
const page=await browser.newPage({viewport:{width:1284,height:762}}),checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto(process.env.WEBCAD_TEST_URL||'http://127.0.0.1:4174/?ui-test=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.useApp&&window.__three)
 async function fixture(conflict=false){await page.evaluate(async conflict=>{
  const a=window.useApp,features=[{id:'plate',type:'extrude',profile:{kind:'rect',a:[0,0],b:[12,10]},height:10,operation:'new'},{id:'guide',type:'sketch',sketchId:'s1'}]
  const curve={type:'poly',pts:[[0,0],[10,0],[10,-10],[0,-10]],construction:true,projected:true,projectLink:'all'}
  const cons=conflict?[{id:'width',name:'dWidth',kind:'dim',type:'len',a:{kind:'edge',shape:0,idx:0},value:10}]:[{id:'horizontal',kind:'con',type:'h',a:{kind:'edge',shape:0,idx:0}}]
  a.setState({...a.getInitialState(),features,timelinePos:2,sketchSources:{s1:{shapes:[curve],cons,plane:'XY',baseZ:10,height:0,op:'new'}}},true)
  await a.getState().applyFeatures(features,'fixture',false);await a.getState().editSketchOf('guide');a.getState().skLookAt()
 },conflict);await page.waitForFunction(()=>window.useApp.getState().mode==='sketch');await page.waitForTimeout(250)}
 const status=page.getByRole('region',{name:'投影关联状态'}),repair=page.getByRole('group',{name:'重新连结投影'})
 async function snapshot(){return page.evaluate(()=>{const s=window.useApp.getState();return{profiles:s.sketchProfiles,shape:s.sketchShape,cons:s.skCons,undo:s.sketchUndo,features:s.features}})}
 async function open(){await status.getByRole('button',{name:'重新连结轮廓 1',exact:true}).click();await repair.getByLabel('替换来源',{exact:true}).selectOption('0');await page.waitForFunction(()=>!window.useApp.getState().projectRelink?.busy)}
 await fixture();const before=await snapshot();await open();assert.deepEqual(await snapshot(),before);assert.equal(await repair.getByRole('button',{name:'确认重新连结',exact:true}).isEnabled(),true);await page.keyboard.press('Escape');await repair.waitFor({state:'hidden'});assert.deepEqual(await snapshot(),before);assert.equal(await page.evaluate(()=>window.useApp.getState().mode),'sketch');checks.push('select replacement previews without mutation; Esc restores original sketch and history')
 await open();await repair.getByRole('button',{name:'确认重新连结',exact:true}).click();await repair.waitFor({state:'hidden'});const linked=await page.evaluate(()=>{const s=window.useApp.getState();return [...s.sketchProfiles,...(s.sketchShape?[s.sketchShape]:[])][0]});assert.equal(Math.max(...linked.pts.map(p=>p[0])),12);assert.ok(linked.projectLinkSource);assert.equal(linked.construction,true);assert.equal(linked.projectLinkIssue,undefined);await page.keyboard.press('Control+z');assert.deepEqual(await snapshot(),before);await page.keyboard.press('Control+Shift+z');assert.equal(await page.evaluate(()=>window.useApp.getState().sketchProfiles[0]?.projectLinkIssue||window.useApp.getState().sketchShape?.projectLinkIssue),undefined);checks.push('confirm repairs one curve, retains construction/constraints and supports keyboard Undo/Redo')
 await page.getByText('✓ 完成草图',{exact:true}).first().click();await page.waitForFunction(()=>window.useApp.getState().mode==='model'&&!window.useApp.getState().busy);await page.evaluate(()=>window.useApp.getState().editSketchOf('guide'));assert.equal(await page.evaluate(()=>window.useApp.getState().sketchProfiles[0].projectLinkIssue),undefined);checks.push('Finish Sketch and reopen preserve the chosen replacement link')
 await fixture(true);const locked=await snapshot();await open();assert.equal(await repair.getByRole('button',{name:'确认重新连结',exact:true}).isDisabled(),true);assert.ok((await repair.getByRole('alert').textContent()).length>0);assert.deepEqual(await snapshot(),locked);await page.keyboard.press('Escape');checks.push('incompatible driving width is rejected without changing geometry, constraints or history')
 for(const size of [{width:390,height:600},{width:800,height:400}]){
  await page.setViewportSize(size);await fixture();await open();const confirm=repair.getByRole('button',{name:'确认重新连结',exact:true});await confirm.scrollIntoViewIfNeeded();await confirm.click({trial:true});await page.screenshot({path:path.join(out,`relink-${size.width}x${size.height}.png`)});await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.useApp.getState().mode),'sketch')
 }checks.push('narrow and short screens can reach replacement selector and confirmation; Esc keeps sketch')
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'browser-validation.json'),JSON.stringify({status:'PASS',checks,errors},null,2));console.log('PASS: '+checks.join('; '))
}catch(e){await fs.writeFile(path.join(out,'failure-state.json'),JSON.stringify(await page.evaluate(()=>{const s=window.useApp.getState();return {cons:s.skCons,profiles:s.sketchProfiles,shape:s.sketchShape,repair:s.projectRelink}}),null,2));await page.screenshot({path:path.join(out,'failure.png')});throw e}finally{await browser.close()}
