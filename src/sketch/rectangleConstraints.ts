import { inferCoincident, skConId, type FShape, type SkCon } from './freesolve'

// Rectangle relationships are document data, not just initial coordinates.
export function rectangleConstraints(shapes: FShape[], index: number, existing: SkCon[], names: [string,string], dimensions: [number|null,number|null], snap: boolean): SkCon[] {
 const shape=shapes[index]
 if(shape?.type!=='rect') return []
 const constraints:SkCon[]=[0,1,2,3].map(edge=>({id:skConId(),kind:'con',type:edge%2?'v':'h',a:{kind:'edge',shape:index,idx:edge}}))
 if(snap) constraints.push(...inferCoincident(shapes,index,[...existing,...constraints]))
 dimensions.forEach((value,edge)=>{if(value!==null) constraints.push({id:skConId(),kind:'dim',type:'len',a:{kind:'edge',shape:index,idx:edge},value,name:names[edge]})})
 return constraints
}
