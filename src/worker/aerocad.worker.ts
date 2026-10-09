/// <reference lib="webworker" />
// Aero Design Lab CAD worker — builds the chosen candidate as a real OCCT B-rep (replicad) and
// returns STEP text (inserted into the timeline as a `stepbody` feature by the UI) + a preview mesh.
// Own OCCT instance so the main kernel worker's model/caches are never touched; the UI terminates
// this worker when the Aero Lab panel closes (frees the wasm heap).
import { expose, transfer } from 'comlink'
import opencascade from '../kernel/replicad_plus.js'
import wasmUrl from '../kernel/replicad_plus.wasm?url'
import * as replicad from 'replicad'
import { buildAeroShape, type ReplicadLike } from '../aero/aeroCad'
import type { DesignSpec } from '../aero/designSpace'

/* eslint-disable @typescript-eslint/no-explicit-any */
let OCh: any = null
const ready: Promise<void> = (async () => {
  const OC = await (opencascade as any)({ locateFile: () => wasmUrl })
  replicad.setOC(OC)
  OCh = OC
})()

function volumeOf(shape: any): number {
  const props = new OCh.GProp_GProps_1()
  OCh.BRepGProp.VolumeProperties_1(shape.wrapped, props, false, false, false)
  const v = props.Mass()
  props.delete?.()
  return v
}

const api = {
  async build(spec: DesignSpec, x: Record<string, number>): Promise<{ step: string; volume: number; vertices: Float32Array; triangles: Uint32Array }> {
    await ready
    const shape = buildAeroShape(replicad as unknown as ReplicadLike, spec, x)
    const volume = volumeOf(shape)
    if (!(volume > 0)) throw new Error('氣動實驗室：生成的實體無效（體積 ≤ 0）— 請換一個候選設計')
    const step = await shape.blobSTEP().text()
    const m = shape.mesh({ tolerance: 0.3, angularTolerance: 0.4 })
    const vertices = new Float32Array(m.vertices), triangles = new Uint32Array(m.triangles)
    shape.delete?.()
    return transfer({ step, volume, vertices, triangles }, [vertices.buffer, triangles.buffer])
  },
}

export type AeroCadWorkerAPI = typeof api
expose(api)
