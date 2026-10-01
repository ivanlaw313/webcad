// Pure selection/sizing rules shared by the sketch Offset handle and the sketch
// Array (pattern) tool.  Both rules exist because the store currently derives
// them inline, where an implicit fallback silently changes what the user asked
// for.  Keeping them here makes the contract testable headlessly.

/** A sketch selection entry.  Only entries carrying a `shape` index name a contour. */
export type PatternSelectionRef = { shape?: number } & Record<string, unknown>

export type PatternTargetResult =
  | { ok: true; targets: number[] }
  | { ok: false; reason: string }

/**
 * Resolve which contours a pattern must replicate.
 *
 * The user's explicit selection is the ONLY source of truth.  An empty or
 * invalid selection is refused instead of being widened to "every contour in
 * the sketch": silently patterning the whole sketch is both surprising and
 * makes the applied result disagree with a preview that was computed while a
 * selection still existed.
 *
 * Indices are de-duplicated and returned in selection order.
 */
export function resolvePatternTargets(
  selection: readonly PatternSelectionRef[],
  shapeCount: number,
  options?: { generated?: ReadonlySet<number>; allowImplicitSingle?: boolean },
): PatternTargetResult {
  if (!Number.isInteger(shapeCount) || shapeCount <= 0) return { ok: false, reason: '草圖沒有可陣列的輪廓。' }
  const generated = options?.generated
  const targets: number[] = []
  for (const ref of selection) {
    if (!ref || typeof ref !== 'object' || !('shape' in ref)) continue
    const index = ref.shape
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= shapeCount) {
      return { ok: false, reason: '選取的輪廓已失效，請重新選擇陣列來源。' }
    }
    if (generated?.has(index)) return { ok: false, reason: '陣列實例不能作為新的陣列來源，請選擇原始輪廓。' }
    if (!targets.includes(index)) targets.push(index)
  }
  if (!targets.length) {
    // A sketch holding exactly one contour is unambiguous, so an empty
    // selection may still mean "that one".  With two or more contours the
    // intent is genuinely unknown and must not be guessed.
    if (options?.allowImplicitSingle && shapeCount === 1 && !generated?.has(0)) return { ok: true, targets: [0] }
    return { ok: false, reason: '請先選擇要陣列的來源輪廓（不會自動陣列整張草圖）。' }
  }
  return { ok: true, targets }
}

export type SizingDistanceInput = {
  /** True while a typed numeric buffer is active for the sizing handle. */
  typed: boolean
  /** The typed value, or null/undefined once the buffer has been cleared. */
  typedValue: number | null | undefined
  /** The value the pointer position currently implies (already rounded/signed). */
  cursorValue: number
  /** Distance the pointer has travelled since the value was typed. */
  movedDistance?: number
}

/**
 * Decide which distance an offset/fillet sizing handle must commit.
 *
 * A typed value is sticky: it stays in force until the buffer is cleared, no
 * matter how far the pointer subsequently travels.  A move-distance dead zone
 * is not sufficient, because the click that confirms the operation is itself
 * preceded by a pointer move to the confirm position — which would otherwise
 * overwrite the typed distance with the cursor's distance to the contour.
 */
export function resolveSizingDistance(input: SizingDistanceInput): number {
  const { typed, typedValue, cursorValue } = input
  if (typed && typeof typedValue === 'number' && Number.isFinite(typedValue) && typedValue !== 0) return typedValue
  return cursorValue
}
