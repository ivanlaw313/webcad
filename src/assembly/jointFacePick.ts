// FISHING14 B：關節／選面配合拾取武裝時，面拾取必須贏過組件選取（否則圓柱側面會落到移動／旋轉 HUD）。
// 純函數 — 單元測試可直接覆蓋；Viewport 只負責餵 R3F 命中。

/** 裝配面拾取工具是否已武裝（關節／選面配合／按孔配螺絲／拾孔定軸／關節原點）。 */
export function asmFacePickArmed(s: {
  jointPickMode?: boolean
  faceMateMode?: boolean
  screwFitMode?: boolean
  jointHolePick?: unknown
  jointOriginPickMode?: boolean
}): boolean {
  return !!(s.jointPickMode || s.faceMateMode || s.screwFitMode || s.jointHolePick || s.jointOriginPickMode)
}

type HitObj = {
  faceIndex?: number | null
  object?: { userData?: { cadBody?: boolean; compId?: string }; isLineSegments?: boolean; parent?: unknown }
  eventObject?: { userData?: { cadBody?: boolean; compId?: string } }
}

/**
 * B-rep 邊線疊加（lineSegments）常搶最先命中 → faceIndex 為空。
 * 從同一射線的 intersections 找回同組件 cadBody 三角面索引，令圓柱側面仍可建關節。
 */
export function faceIndexFromIntersections(
  intersections: HitObj[] | undefined | null,
  compId?: string | null,
  eventObject?: HitObj['eventObject'],
): number | null {
  if (!intersections?.length) return null
  for (const h of intersections) {
    if (h.faceIndex == null || h.faceIndex < 0) continue
    const ud = h.object?.userData
    if (!ud?.cadBody) continue
    if (compId && ud.compId && ud.compId !== compId) continue
    // Prefer the mesh that owns the handler (KernelBody) when present.
    if (eventObject?.userData?.cadBody && h.object && eventObject !== h.object && h.object !== eventObject) {
      // still accept — same-component cadBody under the ray is the face we want
    }
    return h.faceIndex
  }
  return null
}

/** Resolve a usable triangle faceIndex: direct hit, else recover from edge-overlay steal. */
export function resolveAsmFaceIndex(
  faceIndex: number | null | undefined,
  intersections: HitObj[] | undefined | null,
  compId?: string | null,
  eventObject?: HitObj['eventObject'],
): number | null {
  if (faceIndex != null && faceIndex >= 0) return faceIndex
  return faceIndexFromIntersections(intersections, compId, eventObject)
}
