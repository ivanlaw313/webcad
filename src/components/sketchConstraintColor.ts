/** Free-shape probes can be incomplete; absence never proves an entity fixed. */
export function sketchConstraintColor(fixed:boolean,dof:number|null,conflict:boolean,constraintCount:number):string {
  if(fixed)return '#2f9e44'
  return dof===0&&!conflict&&constraintCount>0?'#16191d':'#1572c4'
}
