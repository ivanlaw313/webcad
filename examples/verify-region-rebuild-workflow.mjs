import { chromium } from './browser-session.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
const root=path.resolve('../..'),out=path.resolve(process.env.WEBCAD_TEST_OUTPUT_DIR || path.join(root,'outputs/phase10-region'))
await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch({headless:process.env.WEBCAD_TEST_HEADED!=='1',args:['--use-angle=metal'],executablePath:path.join(root,'work/runtime/video-browser/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')})
const page=await browser.newPage({viewport:{width:1284,height:762}}),checks=[],errors=[]
page.on('pageerror',e=>errors.push(e.message))
try {
 await page.goto(process.env.WEBCAD_TEST_URL || 'http://127.0.0.1:4174/?ui-test=1',{waitUntil:'networkidle'})
 await page.waitForFunction(()=>window.useApp&&window.__three)
 await page.evaluate(()=>{const a=window.useApp;a.setState({...a.getInitialState(),mode:'sketch',sketchTool:'select',navTool:'select',sketchPlane:'XY',sketchProfiles:[{type:'circle',c:[0,0],r:10},{type:'circle',c:[40,0],r:5}],sketchShape:null,sketchFocus:{c:[20,0],span:100}},true);a.getState().skLookAt()})
 await page.waitForTimeout(500)
 await page.keyboard.press('e')
 await page.getByLabel('距离表达式',{exact:true}).fill('7')
 const target=await page.evaluate(()=>{const t=window.__three,p=t.camera.position.clone().set(2,0,2).project(t.camera),r=document.querySelector('canvas').getBoundingClientRect();return{x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2}})
 await page.mouse.click(target.x,target.y)
 assert.equal(await page.evaluate(()=>window.useApp.getState().extrudeRegionSel.filter(Boolean).length),1)
 await page.getByRole('dialog').getByRole('button',{name:/确定/}).click()
 await page.waitForFunction(()=>window.useApp.getState().mode==='model'&&!window.useApp.getState().busy)
 const check=async label=>{const f=await page.evaluate(()=>window.useApp.getState().features.filter(f=>f.type==='extrude'));assert.equal(f.length,1);assert.equal(f[0].profile.kind,'circle');assert.equal(f[0].profile.r,10);assert.equal(f[0].height,7);checks.push(label);return f[0]}
 const f=await check('mouse selects only one of two regions; E and height input create one analytic cylinder')
 await page.evaluate(id=>window.useApp.getState().editSketchOf(id),f.id)
 await page.locator('button.context-finish').click()
 await page.waitForFunction(()=>window.useApp.getState().mode==='model'&&!window.useApp.getState().busy)
 await check('Finish Sketch after reopening retains the selected region and excludes the second circle')
 await page.keyboard.press('Control+z');await page.waitForTimeout(250)
 await page.keyboard.press('Control+Shift+z');await page.waitForFunction(()=>!window.useApp.getState().busy)
 await check('keyboard undo and redo preserve selected region')
 await page.screenshot({path:path.join(out,'selected-cylinder.png')})
 assert.deepEqual(errors,[])
 await fs.writeFile(path.join(out,'browser-validation.json'),JSON.stringify({status:'PASS',checks,errors},null,2))
 console.log(checks)
} catch(e){await page.screenshot({path:path.join(out,'failure.png')});throw e} finally{await browser.close()}
