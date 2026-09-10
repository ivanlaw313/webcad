export type LabelBox = { x: number; y: number; w: number; h: number }

export function labelsOverlap(a: LabelBox, b: LabelBox): boolean {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w + 4 && Math.abs(a.y - b.y) * 2 < a.h + b.h + 4
}

/** Place in screen pixels, using the rendered label size (including its editor).
 * Obstacles protect geometry picks independently of already placed labels. */
export function placeDimensionLabel(wanted: LabelBox, placed: LabelBox[], width: number, height: number, obstacles: LabelBox[] = []): LabelBox {
  width = Number.isFinite(width) ? Math.max(1,width) : 1
  height = Number.isFinite(height) ? Math.max(1,height) : 1
  const mx = Math.min(4,(width-1)/2), my = Math.min(4,(height-1)/2)
  const w = Math.min(Number.isFinite(wanted.w)?Math.max(1,wanted.w):1, width-2*mx)
  const h = Math.min(Number.isFinite(wanted.h)?Math.max(1,wanted.h):1, height-2*my)
  const blockers = [...placed,...obstacles].filter(r=>[r.x,r.y,r.w,r.h].every(Number.isFinite)&&r.w>=0&&r.h>=0)
  const available = (box:LabelBox) => !blockers.some(r=>labelsOverlap(box,r))
  const clamp = (x: number, y: number): LabelBox => ({
    x: Math.max(w / 2 + mx, Math.min(width - w / 2 - mx, Number.isFinite(x)?x:width/2)),
    y: Math.max(h / 2 + my, Math.min(height - h / 2 - my, Number.isFinite(y)?y:height/2)), w, h,
  })
  const base = clamp(wanted.x, wanted.y)
  if (available(base)) return base
  // Try nearby rows in both directions; four downward nudges were insufficient
  // for a fully dimensioned car sketch, especially at the bottom of the view.
  for (let row = 1; row <= Math.ceil(height / (h + 4)); row++) {
    for (const sign of [1, -1]) {
      const candidate = clamp(base.x, base.y + sign * row * (h + 4))
      if (available(candidate)) return candidate
    }
  }
  // A crowded column can still have space beside it.
  for (let y = h / 2 + my; y <= height - h / 2 - my; y += h + 4) {
    for (let x = w / 2 + mx; x <= width - w / 2 - mx; x += w + 4) {
      const candidate = { x, y, w, h }
      if (available(candidate)) return candidate
    }
  }
  // Finite screens can fill up: retain the requested position so the user can
  // drag a label or hide annotations, rather than discarding information.
  return base
}
