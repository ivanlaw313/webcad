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
 await page.goto(process.env.WEBCAD_TEST_URL || 'http://127.0.0.1:4174/?ui-test=1',{waitUntil:'networkidle'})
 await page.waitForFunction(()=>window.useApp&&window.__three)
 async function seed(){await page.evaluate(()=>{const a=window.useApp; a.setState({...a.getInitialState(),mode:'sketch',sketchTool:'select',navTool:'select',sketchPlane:'XY',sketchShape:{type:'circle',c:[40,40],r:20},sketchFocus:{c:[40,40],span:100}},true);a.getState().skLookAt()});await page.waitForTimeout(700)}
 async function pos(x,y){return page.evaluate(([x,y])=>{const c=window.__three.camera,v=c.position.clone().set(x,0,y).project(c),r=document.querySelector('canvas').getBoundingClientRect();return {x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2}},[x,y])}
 async function drag(a,b,esc=false){const p=await pos(...a),q=await pos(...b);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(q.x,q.y,{steps:4});if(esc)await page.keyboard.press('Escape');await page.mouse.up();await page.waitForFunction(()=>!window.useApp.getState().skDrag);await page.waitForTimeout(150)}
 await seed();await drag([40,40],[52,48]);let c=await page.evaluate(()=>window.useApp.getState().sketchShape.c);assert.ok(Math.hypot(c[0]-52,c[1]-48)<.3,JSON.stringify(c));checks.push({test:'real mouse center drag',center:c})
 await page.keyboard.press('Control+z');await page.waitForTimeout(200);c=await page.evaluate(()=>window.useApp.getState().sketchShape.c);assert.ok(Math.hypot(c[0]-40,c[1]-40)<.01);checks.push({test:'keyboard undo',center:c})
 await drag([40,40],[50,48],true);c=await page.evaluate(()=>window.useApp.getState().sketchShape.c);assert.ok(Math.hypot(c[0]-40,c[1]-40)<.01);assert.equal(await page.evaluate(()=>window.useApp.getState().mode),'sketch');assert.equal(await page.evaluate(()=>window.__three.controls.enabled),true);checks.push({test:'Esc rollback and navigation unlocked',center:c})
 await drag([60,40],[70,40]);const r=await page.evaluate(()=>window.useApp.getState().sketchShape.r);assert.ok(Math.abs(r-30)<.3);checks.push({test:'real mouse rim resize',radius:r})
 await page.screenshot({path:path.join(out,'WebCAD-phase4-sketch-desktop.png')})
 for(const size of [{width:390,height:600},{width:800,height:400}]){
  await page.setViewportSize(size);await page.waitForTimeout(500)
  const panel=page.getByRole('region',{name:'草图工具选项'});const box=await panel.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=size.width+1&&box.y+box.height<=size.height+1,JSON.stringify(box));
  const finish=page.getByRole('button',{name:'✓ 完成草图',exact:true}).first();await finish.scrollIntoViewIfNeeded();assert.ok(await finish.isVisible());
  const home=await page.getByTitle('主视图 Home：左键回正等轴测 + 置中；右键 = 视图菜单（投影 / 设为前视）',{exact:true}).boundingBox(),bar=await page.locator('.sketch-bar').boundingBox();assert.ok(home.y>=bar.y+bar.height,JSON.stringify({home,bar}));
  const tip=page.locator('[data-narrow-help]');let tipBox=await tip.boundingBox(),canvasBox=await page.locator('canvas').first().boundingBox();assert.ok(tipBox.y+tipBox.height<=canvasBox.y+1);
  await tip.locator('summary').click();tipBox=await tip.boundingBox();canvasBox=await page.locator('canvas').first().boundingBox();assert.ok(tipBox.y+tipBox.height<=canvasBox.y+1);await tip.locator('summary').click();
  const toggle=panel.getByTitle('收起 / 展开',{exact:true});await toggle.click();let collapsed=await panel.boundingBox();assert.ok(collapsed.height<50);await toggle.click();
  await page.screenshot({path:path.join(out,`WebCAD-phase4-sketch-${size.width}x${size.height}.png`)});checks.push({test:'panel within viewport; Finish Sketch reachable',size,box})
 }
 await page.setViewportSize({width:1284,height:762});await page.waitForTimeout(400);
 const panel=page.getByRole('region',{name:'草图工具选项'}),before=await panel.boundingBox();
 await page.mouse.move(before.x+60,before.y+15);await page.mouse.down();await page.mouse.move(before.x+140,before.y+55,{steps:4});await page.mouse.up();const after=await panel.boundingBox();assert.ok(after.x-before.x>60);checks.push({test:'tool panel moved by title',before,after});
 await page.keyboard.press('e');await page.getByLabel('距离表达式',{exact:true}).fill('12');
 const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:/确定/}).click();await page.waitForFunction(()=>!window.useApp.getState().busy&&!window.useApp.getState().extrudeDlgOpen,{timeout:60000});
 const model=await page.evaluate(()=>{const s=window.useApp.getState();return {mode:s.mode,features:s.features,triangles:s.bodyMesh?.triangles.length}});assert.equal(model.mode,'model');assert.ok(model.triangles>0);assert.ok(model.features.some(f=>f.type==='extrude'&&Math.abs(f.profile.r-30)<.3&&f.height===12));checks.push({test:'mouse-edited circle extrudes through the UI',triangles:model.triangles});await page.screenshot({path:path.join(out,'WebCAD-phase4-sketch-to-extrude.png')});
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'WebCAD-phase4-browser-validation.json'),JSON.stringify({status:'PASS',url:page.url(),checks,errors},null,2));console.log(JSON.stringify(checks,null,2))
} catch(e){await page.screenshot({path:path.join(out,'WebCAD-phase4-ui-failure.png')});console.error(await page.evaluate(()=>({status:window.useApp?.getState().status,mode:window.useApp?.getState().mode,shape:window.useApp?.getState().sketchShape,drag:window.useApp?.getState().skDrag})));throw e} finally{await browser.close()}
