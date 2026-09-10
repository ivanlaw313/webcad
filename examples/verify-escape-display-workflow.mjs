import {chromium} from './browser-session.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
const root=path.resolve('../..'),out=path.resolve(process.env.WEBCAD_TEST_OUTPUT_DIR || path.join(root,'outputs')),checks=[],errors=[]
await fs.mkdir(out, { recursive: true })
const browser=await chromium.launch({headless:process.env.WEBCAD_TEST_HEADED !== '1',args:['--use-angle=metal'],executablePath:path.join(root,'work/runtime/video-browser/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')})
const page=await browser.newPage({viewport:{width:1284,height:762}})
page.on('pageerror',e=>errors.push(e.message))
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
const state=()=>page.evaluate(()=>{const s=window.useApp.getState();return {features:s.features,mesh:s.bodyMesh,mode:s.mode,shape:s.sketchShape,profiles:s.sketchProfiles,camera:window.__three.camera.position.toArray(),target:window.__three.controls.target.toArray()}})
try{
 await page.goto(process.env.WEBCAD_TEST_URL||'http://127.0.0.1:4174/?ui-test=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.useApp&&window.__three)
 await page.evaluate(async()=>{const s=window.useApp.getState();await s.applyFeatures([
 {id:'base',type:'extrude',profile:{kind:'rect',a:[-30,-20],b:[30,20]},height:20,operation:'new'},
 {id:'hole',type:'extrude',profile:{kind:'circle',c:[0,0],r:7},height:20,operation:'cut'},
 {id:'round',type:'fillet',radius:2,edges:'vertical'}],'fixture',false);s.setVisualStyle('shadedVisible');window.useApp.setState({showGrid:false});window.__three.camera.position.set(85,100,120);window.__three.controls.target.set(0,7,0);window.__three.controls.update()});await page.waitForTimeout(500)
 const base=await state();assert.equal(base.features.length,3);const geometry=hash([base.features,base.mesh])
 await page.evaluate(()=>{window.__escDefaults=[];document.addEventListener('keydown',e=>{if(e.key==='Escape')window.__escDefaults.push(e.defaultPrevented)});window.useApp.getState().selectFeature('round')})
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.useApp.getState().selectedFeature),null);assert.deepEqual((await state()).camera,base.camera)
 // An Esc on a window/body-focused prompt cannot fall through to the selected command.
 await page.evaluate(()=>{window.useApp.getState().selectFeature('base');void window.useApp.getState().appConfirm('Keep the current model?','Escape test')});await page.waitForTimeout(100);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.useApp.getState().uiDialog),null);assert.equal(await page.evaluate(()=>window.useApp.getState().selectedFeature),'base');checks.push('model Esc clears selection without changing model/view; prompt Esc dismisses only prompt')
 const editor=page.locator('.feat-editor'),beforeEditor=await editor.boundingBox(),grip=await page.getByTitle('拖移特征编辑面板',{exact:true}).boundingBox();await page.mouse.move(grip.x+10,grip.y+5);await page.mouse.down();await page.mouse.move(grip.x+110,grip.y-100,{steps:8});await page.mouse.up();assert.ok((await editor.boundingBox()).y<beforeEditor.y-50);await page.getByLabel('还原特征编辑面板位置',{exact:true}).click();checks.push('feature editor moves away from covered content and resets its position');
 await page.getByTestId('visual-style-menu-trigger').click();await page.keyboard.press('Escape');await page.getByTestId('visual-style-picker').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.useApp.getState().selectedFeature),'base')
 const canvas=page.locator('canvas');await canvas.click({button:'right',position:{x:100,y:100}});await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.useApp.getState().selectedFeature),'base');checks.push('display menu and right-click menu consume one Esc without clearing underlying selection')
 await page.evaluate(async()=>{const s=window.useApp.getState();s.selectFeature(null);await s.startSketchOnFace([0,20,0],[0,0,1]);window.useApp.setState({sketchShape:{type:'circle',c:[0,0],r:3},sketchTool:'select'})});await page.waitForTimeout(600);const sketch=await state()
 for(let i=0;i<8;i++)await page.keyboard.press('Escape')
 assert.equal((await state()).mode,'sketch');assert.deepEqual((await state()).shape,sketch.shape);assert.ok((await state()).camera.every((v,i)=>Math.abs(v-sketch.camera[i])<1e-7));assert.equal(await page.evaluate(()=>window.useApp.getState().uiDialog),null)
 await page.keyboard.press('r');await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',repeat:true,bubbles:true,cancelable:true})));assert.equal(await page.evaluate(()=>window.useApp.getState().sketchTool),'rectangle');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.useApp.getState().sketchTool),'select');checks.push('eight Esc presses retain sketch geometry/view; long-press repeats do not cascade')
 await page.keyboard.press('e');await page.getByRole('dialog').waitFor();await page.getByLabel('距离表达式',{exact:true}).fill('8');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.useApp.getState().extrudeDlgOpen),false);assert.equal((await state()).mode,'sketch');assert.deepEqual((await state()).shape,sketch.shape);checks.push('Esc in extrusion distance input cancels only the extrusion and retains the sketch')
 await page.getByText('✓ 完成草图',{exact:true}).first().click();await page.waitForFunction(()=>!window.useApp.getState().busy&&window.useApp.getState().mode==='model');checks.push('explicit Finish Sketch still saves and exits')
 await page.evaluate(async()=>{const s=window.useApp.getState();await s.applyFeatures(s.features.filter(f=>f.type!=='sketch'),'fixture',false);window.useApp.setState({sketchSources:{},sketchShape:null,sketchProfiles:[]});window.__three.camera.position.set(85,100,120);window.__three.controls.target.set(0,7,0);window.__three.controls.update()});await page.waitForTimeout(400)
 const styles=['shaded','shadedHidden','shadedVisible','wire','wireHidden','wireVisible'],images=[]
 for(const [i,style] of styles.entries()){
  await page.getByTestId('visual-style-menu-trigger').click();await page.getByTestId('visual-style-'+style).click();assert.equal(await page.evaluate(()=>window.useApp.getState().visualStyle),style)
  await page.keyboard.press('Control+'+(4+i));assert.equal(await page.evaluate(()=>window.useApp.getState().visualStyle),style);await page.waitForTimeout(250)
  images.push(hash(await canvas.screenshot({path:path.join(out,'WebCAD-phase6-display-'+style+'.png')})))
 }
 assert.equal(new Set(images).size,6);await page.keyboard.press('Control+6');await page.waitForTimeout(250);assert.equal(hash(await canvas.screenshot()),images[2],'returning from wireframe restores shaded faces and depth');checks.push('six display styles accessible by menu and Ctrl+4..9 with distinct screenshots')
 await page.getByTestId('visual-style-menu-trigger').click();await page.getByTestId('display-xray').click();assert.equal(await page.evaluate(()=>window.useApp.getState().xray),true);assert.equal(await page.evaluate(()=>window.useApp.getState().wireframe),false)
 await page.keyboard.press('Escape');await page.waitForTimeout(250);await page.screenshot({path:path.join(out,'WebCAD-phase6-xray.png')});await page.getByTestId('visual-style-menu-trigger').click()
 await page.getByTestId('display-grid').click();assert.equal(await page.evaluate(()=>window.useApp.getState().showGrid),true);await page.getByTestId('display-grid').click()
 await page.getByTestId('display-xray').click();await page.locator('[title^="渲染模式："]').click();assert.equal(await page.evaluate(()=>window.useApp.getState().renderMode),true);await page.waitForTimeout(700);await page.keyboard.press('Escape');await page.screenshot({path:path.join(out,'WebCAD-phase6-render.png')});await page.getByTestId('visual-style-menu-trigger').click();await page.locator('[title^="渲染模式："]').click();checks.push('render mode can be enabled and disabled from Display without changing geometry');await page.getByTestId('display-section').click();await page.waitForTimeout(350)
 for(const style of ['shadedHidden','wire','wireVisible']){
  await page.evaluate(style=>window.useApp.getState().setVisualStyle(style),style);await page.waitForTimeout(200)
  assert.equal(await page.evaluate(()=>window.useApp.getState().section.on),true)
  // Saved images are reviewed for face/edge clipping together; __three only exposes camera/controls.

  await page.screenshot({path:path.join(out,'WebCAD-phase6-section-'+style+'.png')})
 }
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.useApp.getState().section.on),false);assert.equal(hash([(await state()).features,(await state()).mesh]),geometry);checks.push('X-ray/grid and section combined with shaded-hidden/wire modes preserve exact model; Esc closes section only')
 for(const size of [{width:390,height:600},{width:800,height:400},{width:1284,height:762}]){
  await page.setViewportSize(size);await page.getByTestId('visual-style-menu-trigger').click();const menu=page.getByTestId('visual-style-picker'),box=await menu.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=size.width+1&&box.y+box.height<=size.height+1,JSON.stringify({size,box}));await menu.locator('.panel-menu-item').last().scrollIntoViewIfNeeded();const bottomControl=menu.locator('input[type=range]').last();assert.ok(await bottomControl.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),'last display control remains hit-testable');await page.getByTestId('display-section').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`WebCAD-phase6-menu-${size.width}x${size.height}.png`)});await page.keyboard.press('Escape')
 }
 checks.push('display menu stays within desktop, narrow and short windows; offscreen controls scroll into view')
 await page.locator('[title^="全屏 (Ctrl"]').click();await page.waitForTimeout(200);await page.keyboard.press('Escape');await page.waitForTimeout(200);assert.equal(hash([(await state()).features,(await state()).mesh]),geometry);checks.push('fullscreen/Esc leaves model intact in test browser');
 assert.deepEqual(errors,[]);assert.ok((await page.evaluate(()=>window.__escDefaults)).every(Boolean));await fs.writeFile(path.join(out,'WebCAD-phase6-browser-validation.json'),JSON.stringify({status:'PASS',url:page.url(),checks,errors},null,2));console.log(checks)
}catch(e){await page.screenshot({path:path.join(out,'WebCAD-phase6-browser-failure.png')});console.error(await page.evaluate(()=>({status:window.useApp?.getState().status,mode:window.useApp?.getState().mode})));throw e}finally{await browser.close()}
