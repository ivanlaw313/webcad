import type {CopyTransform} from './copyRelations'

export type PatternTransformPlan = {ok:true;transforms:CopyTransform[]} | {ok:false;reason:string}
const fail=(reason:string):PatternTransformPlan=>({ok:false,reason})
const validCount=(n:number)=>Number.isInteger(n)&&n>=1&&n<=1000

/** Counts include the unchanged original. Instances are ordered column, then row. */
export function planRectPattern(nx:number,dx:number,ny:number,dy:number):PatternTransformPlan {
  if(![nx,dx,ny,dy].every(Number.isFinite))return fail('陣列數量與間距必須為有限數值。')
  if(!validCount(nx)||!validCount(ny)||nx*ny>1000)return fail('陣列數量須為正整數，且總實例數不可超過 1000。')
  if(nx*ny===1)return fail('陣列至少需要 2 個實例。')
  if((nx>1&&dx===0)||(ny>1&&dy===0))return fail('啟用中的陣列軸須有非零間距。')
  const transforms:CopyTransform[]=[]
  for(let i=0;i<nx;i++)for(let j=0;j<ny;j++) {
    if(i===0&&j===0)continue
    const x=i*dx,y=j*dy
    if(!Number.isFinite(x)||!Number.isFinite(y))return fail('陣列間距超出有限座標範圍。')
    transforms.push({dx:x===0?0:x,dy:y===0?0:y,angleDeg:0,cx:0,cy:0})
  }
  return {ok:true,transforms}
}

/** Full turns omit the duplicate final instance; partial turns include their endpoint. */
export function planCircularPattern(count:number,angle:number,cx:number,cy:number):PatternTransformPlan {
  if(![count,angle,cx,cy].every(Number.isFinite))return fail('陣列數量、角度與中心必須為有限數值。')
  if(!validCount(count)||count<2)return fail('環形陣列數量須為 2 至 1000 的整數。')
  if(angle===0||Math.abs(angle)>360)return fail('陣列角度不可為 0，且須介於 −360 至 360 度。')
  const step=angle/(Math.abs(angle)===360?count:count-1)
  const transforms:CopyTransform[]=[]
  let previous=0
  for(let i=1;i<count;i++) {
    const a=i*step
    if(!Number.isFinite(a)||a===previous)return fail('陣列角度無法區分相鄰實例。')
    transforms.push({dx:0,dy:0,angleDeg:a,cx,cy});previous=a
  }
  return {ok:true,transforms}
}
