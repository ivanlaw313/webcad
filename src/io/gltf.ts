import { BufferGeometry, BufferAttribute, Mesh, MeshStandardMaterial, Group, Matrix4, Color } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type { MeshData } from '../worker/cad.worker'

export type GltfPart = { mesh: MeshData; matrix: number[]; color?: string }

// Build a THREE group from posed, colored meshes and export it as a binary glTF (.glb).
// Pure-data path (no DOM/WebGL needed) so it also runs headless for tests. glTF keeps per-part
// COLOR (which STL can't) — the right format for sharing a finished design.
export async function meshesToGLB(parts: GltfPart[]): Promise<ArrayBuffer> {
  const group = new Group()
  for (const p of parts) {
    const g = new BufferGeometry()
    const hasN = !!(p.mesh.normals && p.mesh.normals.length === p.mesh.vertices.length)
    g.setAttribute('position', new BufferAttribute(new Float32Array(p.mesh.vertices), 3))
    if (hasN) g.setAttribute('normal', new BufferAttribute(new Float32Array(p.mesh.normals), 3))
    g.setIndex(new BufferAttribute(new Uint32Array(p.mesh.triangles), 1))
    if (!hasN) g.computeVertexNormals()
    const mat = new MeshStandardMaterial({ color: new Color(p.color || '#b0b6bc'), metalness: 0.35, roughness: 0.5 })
    const mesh = new Mesh(g, mat)
    mesh.applyMatrix4(new Matrix4().fromArray(p.matrix))
    group.add(mesh)
  }
  const exporter = new GLTFExporter()
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      group,
      (result) => { result instanceof ArrayBuffer ? resolve(result) : reject(new Error('expected binary GLB output')) },
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
      { binary: true },
    )
  })
}
