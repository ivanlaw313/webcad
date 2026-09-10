import type {CopyTransform} from './copyRelations'

export type PatternTransformPlan = {ok:true;transforms:CopyTransform[]} | {ok:false;reason:string}
const fail=(reason:string):PatternTransformPlan=>({ok:false,reason})
const validCount=(n:number)=>Number.isInteger(n)&&n>=1&&n<=1000

/** Counts include the unchanged original. Instances are ordered column, then row. */
export function planRectPattern(nx:number,dx:number,ny:number,dy:number):PatternTransformPlan {
  if(![nx,dx,ny,dy].every(Number.isFinite))return fail('Pattern counts and spacing must be finite.')
  if(!validCount(nx)||!validCount(ny)||nx*ny>1000)return fail('Pattern counts must be positive integers with at most 1000 total instances.')
  if(nx*ny===1)return fail('A pattern requires at least two instances.')
  if((nx>1&&dx===0)||(ny>1&&dy===0))return fail('An active pattern axis requires nonzero spacing.')
  const transforms:CopyTransform[]=[]
  for(let i=0;i<nx;i++)for(let j=0;j<ny;j++) {
    if(i===0&&j===0)continue
    const x=i*dx,y=j*dy
    if(!Number.isFinite(x)||!Number.isFinite(y))return fail('Pattern spacing exceeds the finite coordinate range.')
    transforms.push({dx:x===0?0:x,dy:y===0?0:y,angleDeg:0,cx:0,cy:0})
  }
  return {ok:true,transforms}
}

/** Full turns omit the duplicate final instance; partial turns include their endpoint. */
export function planCircularPattern(count:number,angle:number,cx:number,cy:number):PatternTransformPlan {
  if(![count,angle,cx,cy].every(Number.isFinite))return fail('Pattern count, angle and center must be finite.')
  if(!validCount(count)||count<2)return fail('A circular pattern requires an integer count from 2 to 1000.')
  if(angle===0||Math.abs(angle)>360)return fail('Pattern angle must be nonzero and between -360 and 360 degrees.')
  const step=angle/(Math.abs(angle)===360?count:count-1)
  const transforms:CopyTransform[]=[]
  let previous=0
  for(let i=1;i<count;i++) {
    const a=i*step
    if(!Number.isFinite(a)||a===previous)return fail('Pattern angle cannot distinguish adjacent instances.')
    transforms.push({dx:0,dy:0,angleDeg:a,cx,cy});previous=a
  }
  return {ok:true,transforms}
}
