/**
 * 倒角距離欄顯示政策（視覺，非 store clamp）。
 * w=66 會把「99999」裁成似「999」；必須 ≥88 且 overflow 可見、唔設 maxLength。
 */
export const CHAMFER_DIST_INPUT_W = 88

/** 草稿／顯示字串原樣保留（唔靜默截字、唔 maxLength）。 */
export function chamferDistDraftShown(raw: string | null | undefined): string {
  return String(raw ?? '')
}

/** 單測用：欄寬足以顯示至少 5 位數字（例 99999）。 */
export function chamferDistWidthShowsFiveDigits(w: number): boolean {
  return Number.isFinite(w) && w >= CHAMFER_DIST_INPUT_W
}
