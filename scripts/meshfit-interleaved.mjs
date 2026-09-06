// Core-only interleaved baseline/new benchmark. No test threshold changes.
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import os from 'node:os'
import {execFileSync} from 'node:child_process'
const roots=[process.argv[2],process.cwd()];if(!roots[0])throw Error('Usage: node --import ./tests/register-resolver.mjs scripts/meshfit-interleaved.mjs BASELINE_CHECKOUT')
const functions=await Promise.all(roots.map(async root=>(await import(pathToFileURL(resolve(root,'src/geom/meshFit.ts')))).fitPrimitives))
function makeCylinder(center, axis, R, H, NS, spanFrac = 1) {
  // 建 ⊥axis 正交基 (u,w)
  const a = norm(axis)
  const base = Math.abs(a[0]) <= Math.abs(a[1]) && Math.abs(a[0]) <= Math.abs(a[2]) ? [1, 0, 0] : Math.abs(a[1]) <= Math.abs(a[2]) ? [0, 1, 0] : [0, 0, 1]
  const u = norm(cross(a, base))
  const w = norm(cross(a, u))
  const v = [], t = []
  const span = 2 * Math.PI * spanFrac
  const ringCount = NS + 1  // 顶点环数（partial 也 NS+1，端点不闭合）
  for (let i = 0; i < ringCount; i++) {
    const ang = span * (i / NS)  // partial: 0..span；full: 0..2π（i=NS 与 i=0 重合，靠焊接合并）
    const rx = R * (Math.cos(ang) * u[0] + Math.sin(ang) * w[0])
    const ry = R * (Math.cos(ang) * u[1] + Math.sin(ang) * w[1])
    const rz = R * (Math.cos(ang) * u[2] + Math.sin(ang) * w[2])
    // 底环 (h=0)
    v.push(center[0] + rx, center[1] + ry, center[2] + rz)
    // 顶环 (h=H)
    v.push(center[0] + rx + a[0] * H, center[1] + ry + a[1] * H, center[2] + rz + a[2] * H)
  }
  for (let i = 0; i < NS; i++) {
    const b = i * 2
    // 每段 quad = 2 三角（外向：法向指离轴）
    t.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
  }
  return { v, t }
}

function norm(a) { const L = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / L, a[1] / L, a[2] / L] }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }
const big=makeCylinder([0,0,0],[0,0,1],5,20,240), V=[],T=[]
for(let i=0;i<62;i++){const base=V.length/3;for(let j=0;j<big.v.length;j+=3)V.push(big.v[j]+i%8*20,big.v[j+1]+Math.floor(i/8)*20,big.v[j+2]);for(const t of big.t)T.push(t+base)}
const hash=b=>createHash('sha256').update(b).digest('hex')
const samples=[[],[]], rows=[];const startLoad=os.loadavg()
for(let j=0;j<3;j++)for(const fit of functions)fit(V,T,{diag:200})
for(let i=0;i<20;i++)for(const k of (i%2?[1,0]:[0,1])){const t=performance.now();const result=functions[k](V,T,{diag:200});const ms=performance.now()-t;samples[k].push(ms);rows.push({round:i+1,version:k?'new':'baseline',ms,cylinders:result.cylCount,pass500ms:ms<500})}
const summary=samples.map(a=>{const b=a.toSorted((a,b)=>a-b);return {median:(b[9]+b[10])/2,p95:b[18],max:b[19],over500:b.filter(v=>v>=500).length}})
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0].model,logicalCPUs:os.cpus().length,startLoad,endLoad:os.loadavg(),vertices:V.length/3,triangles:T.length/3,inputSHA256:hash(JSON.stringify({V,T})),sourceSHA256:roots.map(root=>hash(readFileSync(resolve(root,'src/geom/meshFit.ts')))),baseline:execFileSync('git',['-C',roots[0],'rev-parse','HEAD'],{encoding:'utf8'}).trim(),warmupsPerVersion:3,order:'AB then BA alternating, same process and immutable input',summary,rows},null,2))
