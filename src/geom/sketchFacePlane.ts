type V3 = [number, number, number]
/** A real CAD face's complete tessellation, in the original double-precision coordinates. */
export function sketchFacePlane(triangles: ArrayLike<number>): { p: V3; n: V3 } | null {
  if (triangles.length < 9 || triangles.length % 9 !== 0) return null
  let p: V3 = [0,0,0], n: V3 = [0,0,0], best = 0
  for (let i=0;i<triangles.length;i+=9) {
    const a: V3 = [triangles[i],triangles[i+1],triangles[i+2]]
    const u = [triangles[i+3]-a[0],triangles[i+4]-a[1],triangles[i+5]-a[2]]
    const v = [triangles[i+6]-a[0],triangles[i+7]-a[1],triangles[i+8]-a[2]]
    const cross: V3 = [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
    const length = Math.hypot(...cross)
    if (!a.every(Number.isFinite) || !Number.isFinite(length)) return null
    if (length > best) { best=length;p=a;n=cross.map(x=>x/length) as V3 }
  }
  if (best < 1e-12) return null
  for(let i=0;i<triangles.length;i+=3) {
    const dx=triangles[i]-p[0],dy=triangles[i+1]-p[1],dz=triangles[i+2]-p[2]
    if(Math.abs(dx*n[0]+dy*n[1]+dz*n[2]) > Math.max(1e-7,Math.hypot(dx,dy,dz)*1e-10)) return null
  }
  return {p,n}
}
