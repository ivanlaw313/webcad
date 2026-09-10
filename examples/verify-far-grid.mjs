import {execFileSync} from 'node:child_process'
import {chromium} from './browser-session.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
const root=path.resolve('../..'),out=path.resolve(process.env.WEBCAD_TEST_OUTPUT_DIR||path.join(root,'outputs/phase35-far-grid'));await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch({executablePath:path.join(root,'work/runtime/video-browser/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),headless:process.env.WEBCAD_TEST_HEADED!=='1',args:['--use-angle=metal']})
const page=await browser.newPage({viewport:{width:1284,height:762}}),checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message))
const snapshot=()=>page.evaluate(()=>{const s=window.useApp.getState();return{shape:s.sketchShape,profiles:s.sketchProfiles,cons:s.skCons,mode:s.mode}})
const shapes=s=>[...s.profiles,...(s.shape?[s.shape]:[])]
const near=(a,b)=>assert.ok(Math.abs(a-b)<.1,`${a} != ${b}`)
async function pos(p){return page.evaluate(([x,y])=>{const s=window.useApp.getState(),c=window.__three.camera;let world;if(s.sketchArb){const{o,xd,n}=s.sketchArb,yd=[n[1]*xd[2]-n[2]*xd[1],n[2]*xd[0]-n[0]*xd[2],n[0]*xd[1]-n[1]*xd[0]],cad=o.map((v,i)=>v+x*xd[i]+y*yd[i]);world=[cad[0],cad[2],-cad[1]]}else world=s.sketchPlane==='XZ'?[x,y,-s.sketchBaseZ]:s.sketchPlane==='YZ'?[s.sketchBaseZ,y,x]:[x,s.sketchBaseZ,y];const v=c.position.clone().set(...world).project(c),r=document.querySelector('canvas').getBoundingClientRect();return{x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2}},p)}
async function click(p){const q=await pos(p);assert.equal(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName,q),'CANVAS');await page.mouse.click(q.x,q.y);await page.waitForTimeout(120)}
function endpoint(e){const t=(e.a0+e.signedSweepDeg)*Math.PI/180,r=e.rot*Math.PI/180,x=e.rx*Math.cos(t),y=e.ry*Math.sin(t);return[e.cx+x*Math.cos(r)-y*Math.sin(r),e.cy+x*Math.sin(r)+y*Math.cos(r)]}


try{
await page.goto(process.env.WEBCAD_TEST_URL||'http://127.0.0.1:4174/?ui-test=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.useApp&&window.__three);
for(const plane of ['XY','XZ','ARB']){await page.evaluate(plane=>{const a=window.useApp;a.setState({...a.getInitialState(),mode:'sketch',sketchTool:'select',sketchPlane:plane==='ARB'?'XY':plane,sketchBaseZ:plane==='XY'||plane==='ARB'?0:7,sketchArb:plane==='ARB'?{o:[5,-3,7],xd:[1,0,0],n:[0,Math.SQRT1_2,Math.SQRT1_2]}:null,sketchFocus:{c:[1e6+55,-7e5+40],size:140},gridAdaptive:false,gridSpacing:10,gridSubdiv:1,skView:{...a.getInitialState().skView,grid:true}},true);a.getState().skLookAt()},plane);await page.waitForTimeout(1600);const before=await snapshot(),camera=await page.evaluate(()=>[...window.__three.camera.matrixWorld.elements,...window.__three.camera.projectionMatrix.elements]);const on=path.join(out,`${plane}-grid-on.png`),off=path.join(out,`${plane}-grid-off.png`),sample=await pos([1000050,-699955]),empty=await pos([1000055,-699955]);await page.mouse.move(1200,40);await page.screenshot({path:on});await page.getByRole('button',{name:'网格',exact:true}).click();await page.waitForFunction(()=>!window.useApp.getState().skView.grid);await page.mouse.move(1200,40);await page.screenshot({path:off});assert.deepEqual(await snapshot(),before);assert.ok((await page.evaluate(()=>[...window.__three.camera.matrixWorld.elements,...window.__three.camera.projectionMatrix.elements])).every((v,i)=>Math.abs(v-camera[i])<1e-8),'gridtoggle camera unchanged within1e-8 matrix float tolerance');const result=JSON.parse(execFileSync('python3',['-c',`from PIL import Image
import json,sys
a=Image.open(sys.argv[1]).convert('RGB');b=Image.open(sys.argv[2]).convert('RGB')
def delta(q):
 x,y=round(q['x']),round(q['y']);return max(max(abs(a.getpixel((i,j))[c]-b.getpixel((i,j))[c]) for c in range(3)) for i in range(x-2,x+3) for j in range(y-2,y+3))
p=json.loads(sys.argv[3]);print(json.dumps({'lineDelta':delta(p[0]),'emptyDelta':delta(p[1])}))`,on,off,JSON.stringify([sample,empty])],{encoding:'utf8'}));assert.ok(result.lineDelta>4,JSON.stringify({plane,result,sample}));assert.ok(result.emptyDelta<4,JSON.stringify({plane,result,empty}));await page.getByRole('button',{name:'网格',exact:true}).click();await page.waitForFunction(()=>window.useApp.getState().skView.grid);assert.deepEqual(await snapshot(),before);checks.push({test:`${plane} farorigin grid actualtoggle and originphase independent pixel samples`,result,sample,empty})}
assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'browser-validation.json'),JSON.stringify({status:'PASS',checks,errors},null,2));console.log('PASS farorigin grid visible and retains original coordinate phase')
}catch(e){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({message:e.message,checks},null,2));await page.screenshot({path:path.join(out,'failure.png')});throw e}finally{await browser.close()}
