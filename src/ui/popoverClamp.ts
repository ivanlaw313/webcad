/**
 * Shared viewport clamp for fixed-position popovers / ribbon dropdowns.
 * A dropdown anchored inside the horizontally-scrolling ribbon used `position:absolute; right:0`
 * and could land fully off-screen (e.g. 🎨 appearance picker at x≈1308–1604 on a 1280px viewport).
 */
export type AnchorRect = { left: number; right: number; top: number; bottom: number }
export type PopoverPlacement = { left: number; top: number; maxHeight: number }

export function clampPopover(
  anchor: AnchorRect,
  size: { width: number; height?: number },
  viewport: { width: number; height: number },
  opts: { align?: 'start' | 'end'; gap?: number; margin?: number; minHeight?: number } = {},
): PopoverPlacement {
  const margin = opts.margin ?? 8, gap = opts.gap ?? 4, minH = opts.minHeight ?? 160
  const w = Math.min(size.width, Math.max(0, viewport.width - 2 * margin))
  const wantLeft = opts.align === 'end' ? anchor.right - w : anchor.left
  const left = Math.max(margin, Math.min(wantLeft, viewport.width - w - margin))
  const top = Math.max(margin, Math.min(anchor.bottom + gap, viewport.height - minH))
  const maxHeight = Math.max(80, viewport.height - top - margin)
  return { left: Math.round(left), top: Math.round(top), maxHeight: Math.round(maxHeight) }
}
