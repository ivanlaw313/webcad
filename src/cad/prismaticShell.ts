import { Sketch, getOC, measureVolume } from 'replicad'

export function validShellSolid(shape: any): boolean {
  if (!shape?.wrapped || shape.wrapped.IsNull()) return false
  const oc = getOC() as any
  const check = new oc.BRepCheck_Analyzer(shape.wrapped, true, false)
  try { return check.IsValid_2() && Number.isFinite(measureVolume(shape)) && measureVolume(shape) > 0 }
  finally { check.delete() }
}

// Exact inward shell for a verified straight prism. Offset hole walls can meet:
// boolean subtraction resolves their union instead of retaining intersecting faces.
// This is never used on an assumed prism: first reconstruct and compare both volumes.
export function prismaticInwardShell(source: any, faceIndex: number, thickness: number): any {
  if (!(thickness > 0) || !validShellSolid(source)) throw new Error('Invalid shell source')
  const face = source.faces[faceIndex]
  if (!face || face.geomType !== 'PLANE') throw new Error('Shell fallback requires a planar opening')
  const origin = face.center, normal = face.normalAt()
  const projection = (v: any) => (origin.x-v.x)*normal.x + (origin.y-v.y)*normal.y + (origin.z-v.z)*normal.z
  const depths = source.faces.filter((f: any) => f.geomType === 'PLANE').map((f: any) => {
    const n = f.normalAt()
    return Math.abs(Math.abs(n.x*normal.x+n.y*normal.y+n.z*normal.z)-1)<1e-7 ? projection(f.center) : 0
  })
  const depth = Math.max(...depths)
  if (!Number.isFinite(depth) || depth <= thickness) throw new Error('Shell thickness reaches opposite face')
  // Wire access consumes its face wrapper in replicad; use independent clones.
  const outer = face.clone().outerWire(), holes = face.clone().innerWires()
  const extrude = (wire: any, length: number) => new Sketch(wire, {defaultOrigin: origin, defaultDirection: normal}).extrude(-length)
  let rebuilt: any = extrude(outer.clone(), depth)
  for (const hole of holes) rebuilt = rebuilt.cut(extrude(hole.clone(), depth))
  const volume = measureVolume(source), tolerance = Math.max(1e-7, volume*1e-9)
  if (!validShellSolid(rebuilt) || Math.abs(measureVolume(source.cut(rebuilt))) > tolerance || Math.abs(measureVolume(rebuilt.cut(source))) > tolerance) throw new Error('Opening does not describe the complete straight prism')
  const length = depth-thickness
  const offsetSolid = (wire: any, expand: boolean) => {
    const original = extrude(wire.clone(), length), originalVolume = measureVolume(original)
    const options: any[] = []
    // Offset sign depends on wire orientation, including STEP-imported faces.
    for (const sign of [-1, 1]) {
      try {
        const candidate = extrude(wire.clone().offset2D(sign*thickness), length)
        if (!validShellSolid(candidate)) continue
        const v = measureVolume(candidate)
        if (expand ? v > originalVolume : v < originalVolume) {
          const outside = expand ? original.cut(candidate) : candidate.cut(original)
          if (Math.abs(measureVolume(outside)) <= tolerance) options.push(candidate)
        }
      } catch { /* try the other orientation */ }
    }
    if (options.length !== 1) throw new Error('Cannot resolve exact shell wire offset')
    return options[0]
  }
  let cavity: any = offsetSolid(outer, false)
  for (const hole of holes) cavity = cavity.cut(offsetSolid(hole, true))
  if (!validShellSolid(cavity)) throw new Error('Invalid offset cavity')
  const result = source.cut(cavity)
  if (!validShellSolid(result) || measureVolume(result) >= volume || Math.abs(measureVolume(result.cut(source))) > tolerance) throw new Error('Invalid prismatic shell')
  return result
}

// Fallback when OCCT MakeThickSolid fails on nearly-prismatic solids (e.g. through-hole
// with a filleted rim). Build an inward offset cavity from the opening face wires and
// cut it from the source without requiring source ≡ extruded opening (fillets/chamfers
// break that equality while the cavity cut remains geometrically useful).
export function cavityInwardShell(source: any, faceIndex: number, thickness: number): any {
  if (!(thickness > 0) || !validShellSolid(source)) throw new Error('Invalid shell source')
  const face = source.faces[faceIndex]
  if (!face || face.geomType !== 'PLANE') throw new Error('Shell fallback requires a planar opening')
  const origin = face.center, normal = face.normalAt()
  const projection = (v: any) => (origin.x-v.x)*normal.x + (origin.y-v.y)*normal.y + (origin.z-v.z)*normal.z
  const depths = source.faces.filter((f: any) => f.geomType === 'PLANE').map((f: any) => {
    const n = f.normalAt()
    return Math.abs(Math.abs(n.x*normal.x+n.y*normal.y+n.z*normal.z)-1)<1e-7 ? projection(f.center) : 0
  })
  const depth = Math.max(...depths)
  if (!Number.isFinite(depth) || depth <= thickness) throw new Error('Shell thickness reaches opposite face')
  const outer = face.clone().outerWire(), holes = face.clone().innerWires()
  const extrude = (wire: any, length: number) => new Sketch(wire, {defaultOrigin: origin, defaultDirection: normal}).extrude(-length)
  const volume = measureVolume(source), tolerance = Math.max(1e-7, volume*1e-9)
  const length = depth-thickness
  const offsetSolid = (wire: any, expand: boolean) => {
    const original = extrude(wire.clone(), length), originalVolume = measureVolume(original)
    const options: any[] = []
    for (const sign of [-1, 1]) {
      try {
        const candidate = extrude(wire.clone().offset2D(sign*thickness), length)
        if (!validShellSolid(candidate)) continue
        const v = measureVolume(candidate)
        if (expand ? v > originalVolume : v < originalVolume) {
          const outside = expand ? original.cut(candidate) : candidate.cut(original)
          if (Math.abs(measureVolume(outside)) <= tolerance) options.push(candidate)
        }
      } catch { /* try the other orientation */ }
    }
    if (options.length !== 1) throw new Error('Cannot resolve exact shell wire offset')
    return options[0]
  }
  let cavity: any = offsetSolid(outer, false)
  for (const hole of holes) cavity = cavity.cut(offsetSolid(hole, true))
  if (!validShellSolid(cavity)) throw new Error('Invalid offset cavity')
  const result = source.cut(cavity)
  if (!validShellSolid(result) || measureVolume(result) >= volume || Math.abs(measureVolume(result.cut(source))) > tolerance) throw new Error('Invalid cavity shell')
  return result
}

