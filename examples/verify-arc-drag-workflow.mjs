import { chromium } from './browser-session.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
const root=path.resolve('../..'),out=path.resolve(process.env.WEBCAD_TEST_OUTPUT_DIR || path.join(root,'outputs/phase9-arc'));await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch({executablePath:path.join(root,'work/runtime/video-browser/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),headless:process.env.WEBCAD_TEST_HEADED !== '1',args:['--use-angle=metal']})
const page=await browser.newPage({viewport:{width:1284,height:762}}),checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto(process.env.WEBCAD_TEST_URL || 'http://127.0.0.1:4174/?ui-test=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.useApp&&window.__three)
 await page.evaluate(async()=>{const arcResample=()=>Array.from({length:25},(_,i)=>[50*Math.cos(i*Math.PI/48),50*Math.sin(i*Math.PI/48)]);const a=[50,0],b=[0,50],m=[Math.sqrt(1250),Math.sqrt(1250)],s=window.useApp;s.setState({...s.getInitialState(),mode:'sketch',sketchTool:'select',navTool:'select',sketchPlane:'XY',sketchShape:{type:'poly',open:true,arc:{a,b,m},pts:arcResample(a,b,m)},sketchFocus:{c:[70,70],span:260}},true);s.getState().skLookAt()});await page.waitForTimeout(700);await page.evaluate(()=>{const t=window.__three,c=t.camera;c.zoom*=.4;c.updateProjectionMatrix();t.invalidate?.()});await page.waitForTimeout(300)
 const pos=async p=>page.evaluate(([x,y])=>{const c=window.__three.camera,v=c.position.clone().set(x,0,y).project(c),r=document.querySelector('canvas').getBoundingClientRect();return{x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2}},p)
 async function drag(from,to,esc=false){const a=await pos(from),b=await pos(to);await page.mouse.move(a.x,a.y);await page.mouse.down();assert.equal(await page.evaluate(()=>window.useApp.getState().skDrag?.ref.kind),'circle');await page.mouse.move(b.x,b.y,{steps:5});if(esc)await page.keyboard.press('Escape');await page.mouse.up();await page.waitForFunction(()=>!window.useApp.getState().skDrag);await page.waitForTimeout(200)}
 async function check(shift,label){const s=await page.evaluate(()=>{const s=window.useApp.getState();return{shape:s.sketchShape,mode:s.mode,undo:s.sketchUndo.length}}),q=Math.sqrt(1250);assert.equal(s.mode,'sketch');assert.ok(Math.hypot(s.shape.arc.m[0]-q-shift,s.shape.arc.m[1]-q-shift)<.5,JSON.stringify(s));for(const p of s.shape.pts)assert.ok(p[0]>=shift-.5&&p[1]>=shift-.5);checks.push({label,...s});return s}
 const q=Math.sqrt(1250);await drag([q,q],[q+100,q+100]);assert.equal((await check(100,'real mouse translates quarter arc, no major sweep flip')).undo,1);await page.screenshot({path:path.join(out,'arc-translated.png')})
 await page.keyboard.press('Control+z');await page.waitForTimeout(250);await check(0,'keyboard undo restores original quarter arc')
 await page.keyboard.press('Control+Shift+z');await page.waitForTimeout(250);await check(100,'keyboard redo retains translated quarter arc')
 await drag([q+100,q+100],[q+50,q+50],true);await check(100,'Esc during mouse gesture restores pre-drag arc');assert.equal(await page.evaluate(()=>window.__three.controls.enabled),true)
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'browser-validation.json'),JSON.stringify({status:'PASS',checks,errors},null,2));console.log('PASS: arc drag / undo / redo / Esc, quarter sweep preserved')
}catch(e){await page.screenshot({path:path.join(out,'failure.png')});throw e}finally{await browser.close()}
