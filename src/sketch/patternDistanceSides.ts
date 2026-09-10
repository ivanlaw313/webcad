import type { PatternDocument } from './persistentPatterns'
import { refPts, type SkCon } from './freesolve'
/** A positive perpendicular distance must stay on its original line side.
 * Each document carries its own remapped references, so reordered instances are safe.
 */
export function patternDistanceSideError(before:Pick<PatternDocument,'shapes'|'cons'>,after:Pick<PatternDocument,'shapes'|'cons'>):string|null{
 const side=(doc:Pick<PatternDocument,'shapes'|'cons'>,c:SkCon)=>{
  if(!c.b)return NaN
  const [p]=refPts(doc.shapes,c.a),[a,b]=refPts(doc.shapes,c.b)
  return p&&a&&b?((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))/Math.hypot(b[0]-a[0],b[1]-a[1]):NaN
 }
 for(const c of after.cons)if(c.kind==='dim'&&c.type==='p2l'&&!c.driven&&c.value>0){
  const prior=before.cons.find(x=>x.id===c.id)
  if(!prior)continue
  const a=side(before,prior),b=side(after,c)
  if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a)>1e-8&&a*b<=0)return 'Perpendicular distance would cross the reference line; original side is preserved.'
 }
 return null
}
