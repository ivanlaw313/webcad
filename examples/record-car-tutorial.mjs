import {chromium} from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'
const root=path.resolve('../..'),out=path.join(root,'outputs'),scratch=path.join(root,'work/car-video');await fs.mkdir(scratch,{recursive:true});
const browser=await chromium.launch({executablePath:path.join(root,'work/runtime/video-browser/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),headless:true,args:process.env.GPU?['--use-angle=metal']:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const context=await browser.newContext({viewport:{width:1600,height:1000},recordVideo:process.env.RECORD?{dir:scratch,size:{width:1600,height:1000}}:undefined});
const videoStarted=Date.now();const page=await context.newPage();page.on('pageerror',e=>console.error('PAGEERROR',e.message));
await page.goto('http://127.0.0.1:4174/examples/car-tutorial.html?ui-test=1',{waitUntil:'networkidle',timeout:120000});
await page.waitForSelector('[data-lesson-step="0"]');await page.waitForTimeout(2500);
if(process.env.START){await page.getByLabel('Lesson step').selectOption(process.env.START);await page.waitForSelector('[data-lesson-step="'+process.env.START+'"]',{timeout:120000})}
const alignment=[],timeline=[],start=Date.now(),limit=Number(process.env.LIMIT??1000);
for(let i=0;i<limit;i++){
 const step=page.locator('[data-lesson-step]'),index=Number(await step.getAttribute('data-lesson-step')),title=await page.locator('aside h2').innerText();timeline.push({step:index+1,seconds:(Date.now()-start)/1000,title});console.log(index+1,title);
 await page.waitForTimeout(process.env.RECORD?2200:500);
 const panelErrors=page.getByText(/Maximum update depth exceeded|面板出错/);if(await panelErrors.count()){await page.screenshot({path:path.join(scratch,'failure.png')});throw Error('Application panel error at '+index)}
 if(title.endsWith('\u8349\u5716')){const check=await page.evaluate(()=>{const a=window.__three,s=window.useApp?.getState();if(!a||!s?.sketchArb)return null;const n=s.sketchArb.n,d=a.camera.position.clone().sub(a.controls.target).normalize();return {alignment:Math.abs(d.x*n[0]+d.y*n[2]-d.z*n[1]),position:a.camera.position.toArray(),target:a.controls.target.toArray(),normal:n,up:a.camera.up.toArray(),step:document.querySelector('[data-lesson-step]').getAttribute('data-lesson-step')}});if(check){alignment.push(check);if(process.env.DIAG)console.log(JSON.stringify(check));if(check.alignment<.999&&!process.env.DIAG)throw Error('Sketch camera not normal: '+JSON.stringify(check))}}
 if(i<6||title.startsWith('完成同一')||title.startsWith('完成零件'))await page.screenshot({path:path.join(scratch,`step-${String(index+1).padStart(3,'0')}.png`)});
 const next=page.getByRole('button',{name:'教學下一步'});if(await next.isDisabled())break;
 await next.click();await page.waitForFunction(n=>document.querySelector('[data-lesson-step]')?.getAttribute('data-lesson-step')===String(n)||!!document.querySelector('aside [role=alert]'),index+1,{timeout:120000});
 const error=page.locator('aside [role=alert]');if(await error.count()){await page.screenshot({path:path.join(scratch,'failure.png')});throw Error(await error.innerText())};
}
await fs.writeFile(path.join(scratch,'sketch-camera-validation.json'),JSON.stringify(alignment,null,2));
await fs.writeFile(path.join(scratch,'timeline.json'),JSON.stringify(timeline,null,2));
await fs.writeFile(path.join(scratch,'recording-meta.json'),JSON.stringify({leadInSeconds:(start-videoStarted)/1000,totalSteps:timeline.length},null,2));
await page.screenshot({path:path.join(scratch,'last.png')});
const download=page.getByRole('button',{name:'儲存完成的原生 JSON'});if(await download.count()){const pending=page.waitForEvent('download');await download.click();await(await pending).saveAs(path.join(out,'Native-Car-From-Zero-Lesson.json'));}
const video=page.video();await context.close();if(video)await video.saveAs(path.join(scratch,'WebCAD-Native-Car-From-Zero.webm'));await browser.close();
