import { chromium } from './browser-session.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
const root=path.resolve('../..'),out=path.resolve(process.env.WEBCAD_TEST_OUTPUT_DIR||path.join(root,'outputs/phase10-extend'))
await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch({executablePath:path.join(root,'work/runtime/video-browser/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),headless:process.env.WEBCAD_TEST_HEADED!=='1',args:['--use-angle=metal']})
const page=await browser.newPage({viewport:{width:1284,height:762}}),checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto(process.env.WEBCAD_TEST_URL||'http://127.0.0.1:4174/?ui-test=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.useApp&&window.__three)
 await page.evaluate(async()=>{const a=window.useApp,line=(a,b)=>({type:'poly',open:true,pts:[a,b]});a.setState({...a.getInitialState(),mode:'sketch',sketchTool:'extend',navTool:'select',sketchPlane:'XY',sketchProfiles:[line([0,0],[20,0]),line([30,0],[30,20]),line([30,20],[0,20]),line([0,20],[0,0])],skCons:[{id:'length',kind:'dim',type:'len',a:{kind:'edge',shape:0,idx:0},value:20},{id:'origin',kind:'con',type:'coincident',a:{kind:'pt',shape:0,idx:0},b:{kind:'origin'}}],sketchFocus:{c:[15,10],span:80}},true);await a.getState().resolveSk();a.getState().skLookAt()});await page.waitForTimeout(700)
 async function pos(x,y){return page.evaluate(([x,y])=>{const c=window.__three.camera,v=c.position.clone().set(x,0,y).project(c),r=document.querySelector('canvas').getBoundingClientRect();return{x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2}},[x,y])}
 const before=await page.evaluate(()=>{const s=window.useApp.getState();return{shapes:s.sketchProfiles,cons:s.skCons,undo:s.sketchUndo}})
 const p=await pos(19,0);await page.mouse.click(p.x,p.y)
 await page.waitForFunction(()=>/无法|阻止|未更改/.test(window.useApp.getState().status))
 const rejected=await page.evaluate(()=>{const s=window.useApp.getState();return{shapes:s.sketchProfiles,cons:s.skCons,undo:s.sketchUndo,status:s.status}});assert.deepEqual(rejected.shapes,before.shapes);assert.deepEqual(rejected.cons,before.cons);assert.deepEqual(rejected.undo,before.undo);checks.push({test:'real mouse constrained extend rejects atomically',status:rejected.status});await page.screenshot({path:path.join(out,'extend-rejected.png')})
 // Remove only the blocking length through the store action; retain origin coincidence.
 await page.evaluate(async()=>{window.useApp.getState().removeSkCon('length');await window.useApp.getState().resolveSk()});await page.mouse.click(p.x,p.y)
 await page.waitForFunction(()=>{const s=window.useApp.getState(),sh=s.sketchProfiles[0],pts=sh?.verts||sh?.pts;return pts&&Math.abs(pts.at(-1)[0]-30)<1e-5})
 const extended=await page.evaluate(()=>({cons:window.useApp.getState().skCons,shape:window.useApp.getState().sketchProfiles[0]}));assert.ok(extended.cons.some(c=>c.id==='origin'));checks.push({test:'real mouse extension reaches right edge with origin constraint retained',...extended})
 await page.keyboard.press('e');await page.getByLabel('距离表达式',{exact:true}).fill('10');await page.getByRole('dialog').getByRole('button',{name:/确定/}).click();await page.waitForFunction(()=>window.useApp.getState().mode==='model'&&!window.useApp.getState().busy,{timeout:60000})
 const model=await page.evaluate(()=>{const s=window.useApp.getState(),m=s.bodyMesh;return{features:s.features,vertices:m?.vertices,triangles:m?.triangles}});assert.ok(model.triangles?.length>0)
 let v=0;for(let i=0;i<model.triangles.length;i+=3){const pts=[0,1,2].map(j=>model.vertices.slice(3*model.triangles[i+j],3*model.triangles[i+j]+3)),[a,b,c]=pts;v+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6}assert.ok(Math.abs(Math.abs(v)-6000)<.01,`volume ${v}`);assert.ok(model.features.some(f=>f.height===10));checks.push({test:'UI E extrudes closed region with independent mesh volume',volume:Math.abs(v),features:model.features});await page.screenshot({path:path.join(out,'extended-extruded.png')})
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'browser-validation.json'),JSON.stringify({status:'PASS',checks,errors},null,2));console.log('PASS: constrained extend rejection → remove blocking dimension → mouse extend → E extrusion 6000 mm³')
}catch(e){await page.screenshot({path:path.join(out,'failure.png')});throw e}finally{await browser.close()}
