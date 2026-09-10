import type {SketchShape} from '../store'
import type {FShape,SkRef} from '../sketch/freesolve'
/** A fixed endpoint does not fix its owning curve; a fixed edge does not fix its polyline. */
export function fixesWholeShape(shape:FShape,ref:SkRef):boolean{
 if(shape.type==='circle')return shape.point?ref.kind==='pt'||ref.kind==='circle':ref.kind==='circle'
 if(shape.type!=='poly')return false
 if(shape.earc)return ref.kind==='ellipse-arc'
 if(shape.ell)return ref.kind==='ellipse'
 if(shape.arc)return ref.kind==='circle'||ref.kind==='edge'
 return ref.kind==='edge'&&!!shape.open&&!shape.smooth&&!shape.ctrl&&(shape.verts??shape.pts).length===2
}

/** Matches sketch geometry visibility, including the dedicated point toggle. */
export function sketchGeometryVisible(shape:SketchShape,view:{points:boolean;constr:boolean}):boolean{
 if(shape.type==='circle'&&shape.point)return view.points
 if(shape.type==='poly'&&shape.projected&&!shape.construction)return true
 if(shape.construction||(shape.type==='poly'&&shape.centerline))return view.constr
 return true
}
