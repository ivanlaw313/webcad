import { Plane, Vector3, type Mesh } from 'three'

/** The input surface is mathematically unbounded; rendering geometry is only a carrier. */
export function sketchPlaneRaycast(origin: [number,number,number], u: [number,number,number], v: [number,number,number]): Mesh['raycast'] {
  const surface=new Plane().setFromCoplanarPoints(new Vector3(...origin),new Vector3(...u),new Vector3(...v))
  return function (this: Mesh, raycaster, intersections) {
    const point=raycaster.ray.intersectPlane(surface,new Vector3())
    if(!point)return
    const distance=point.distanceTo(raycaster.ray.origin)
    if(!Number.isFinite(distance)||distance<raycaster.near||distance>raycaster.far)return
    intersections.push({distance,point,object:this})
  }
}
