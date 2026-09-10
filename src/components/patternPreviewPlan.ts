import {planRectPattern,planCircularPattern} from '../sketch/patternTransforms'
export type PatternPreviewConfig={kind:'rect'|'circ';nx:number;ny:number;dx:number;dy:number;count:number;angle:number;cx:number;cy:number;distType:'spacing'|'extent';angleType:'full'|'angle'}
export function patternPreviewPlan(c:PatternPreviewConfig,sourceCount:number,totalCount=sourceCount){
 const plan=c.kind==='rect'?planRectPattern(c.nx,c.distType==='extent'&&c.nx>1?c.dx/(c.nx-1):c.dx,c.ny,c.distType==='extent'&&c.ny>1?c.dy/(c.ny-1):c.dy):planCircularPattern(c.count,c.angleType==='full'&&Number.isFinite(c.angle)?(c.angle<0?-360:360):c.angle,c.cx,c.cy)
 if(!plan.ok)return plan
 if(!sourceCount)return {ok:false as const,reason:'请先选择或绘制轮廓'}
 if(totalCount+plan.transforms.length*sourceCount>1000)return {ok:false as const,reason:'阵列最多包含1000个轮廓'}
 return plan
}
